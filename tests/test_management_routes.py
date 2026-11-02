"""HTTP and node integration in a temporary library using the ComfyUI runtime."""
import asyncio
from io import BytesIO
import json
import unittest

import test_random_backend as random_tests


class ManagementRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        random_tests.RandomNodeTests.setUpClass.__func__(cls)

    setUp = random_tests.RandomNodeTests.setUp
    tearDown = random_tests.RandomNodeTests.tearDown
    def test_manual_http_cleanup_reapply_replacement_and_node_output(self):
        async def scenario():
            from aiohttp import FormData, web
            from aiohttp.test_utils import TestClient, TestServer
            from PIL import Image
            app = web.Application()
            app.add_routes(self.module.routes)
            async with TestClient(TestServer(app)) as client:
                identity = self.builtin["id"]
                full = self.catalog.LIBRARY / self.builtin["原图"]
                original = full.read_bytes()
                response = await client.get("/pose_gallery/manage")
                self.assertEqual(response.status, 200)
                self.assertEqual(len((await response.json())["records"]), 1)
                response = await client.post("/pose_gallery/manage/plan", json={"ids": [identity], "mode": "thumb_only"})
                plan = await response.json()
                self.assertEqual(response.status, 200)
                self.assertEqual(full.read_bytes(), original)
                response = await client.post("/pose_gallery/manage/apply", json={"request": plan["request"], "token": plan["token"]})
                self.assertEqual(response.status, 200)
                self.assertFalse((await response.json())["failures"])
                self.assertFalse(full.exists())
                self.assertEqual([row["id"] for row in self.node._candidates()], [self.custom["id"]])
                self.assertIn("原图已清理", self.old.VALIDATE_INPUTS(identity))
                full.write_bytes(original)  # Simulated update.
                await client.get("/pose_gallery/catalog")
                self.assertTrue(full.exists())  # Never auto-clean on read.
                response = await client.post("/pose_gallery/manage/plan", json={})
                plan = await response.json()
                response = await client.post("/pose_gallery/manage/apply", json={"request": plan["request"], "token": "stale"})
                self.assertEqual(response.status, 409)
                self.assertTrue(full.exists())
                response = await client.post("/pose_gallery/manage/apply", json={"request": plan["request"], "token": plan["token"]})
                self.assertEqual(response.status, 200)
                self.assertFalse(full.exists())
                output = BytesIO()
                Image.new("RGB", (18, 26), "blue").save(output, format="PNG")
                form = FormData()
                form.add_field("id", identity)
                form.add_field("image", output.getvalue(), filename="new.png", content_type="image/png")
                response = await client.post("/pose_gallery/manage/replacement", data=form)
                self.assertEqual(response.status, 200)
                plan = await response.json()
                self.assertFalse(full.exists())
                response = await client.post("/pose_gallery/manage/apply", json={"request": plan["request"], "token": plan["token"]})
                self.assertEqual(response.status, 200)
                result = self.old().load_pose(identity)
                self.assertEqual(result[1:4], (18, 26, identity))
                self.assertIs(self.old.VALIDATE_INPUTS(identity), True)
                response = await client.get(f"/pose_gallery/assets/img/{identity}.png")
                self.assertEqual(response.status, 200)
                self.assertIn("no-cache", response.headers["Cache-Control"])
                response = await client.post("/pose_gallery/manage/plan", json={"ids": [identity], "mode": "removed"})
                plan = await response.json()
                await client.post("/pose_gallery/manage/apply", json={"request": plan["request"], "token": plan["token"]})
                self.assertIn("素材已删除", self.old.VALIDATE_INPUTS(identity))
                response = await client.get("/pose_gallery/catalog")
                self.assertNotIn(identity, [row["id"] for row in await response.json()])
                response = await client.get("/pose_gallery/manage")
                self.assertIn(identity, [row["id"] for row in (await response.json())["records"]])
                for invalid in [[], {"ids": [identity], "mode": "removed", "path": "/etc/passwd"}]:
                    response = await client.post("/pose_gallery/manage/plan", json=invalid)
                    self.assertEqual(response.status, 400)
        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
