"""Exercise destructive operations only against temporary synthetic libraries."""
from io import BytesIO
import importlib
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "pose_management_tests"
package = types.ModuleType(PACKAGE)
package.__path__ = [str(ROOT)]
sys.modules[PACKAGE] = package
c = importlib.import_module(PACKAGE + ".catalog")
m = importlib.import_module(PACKAGE + ".management")


def picture(color="red", size=(24, 36), format="PNG", **kwargs):
    output = BytesIO()
    Image.new("RGB", size, color).save(output, format=format, **kwargs)
    return output.getvalue()


class ManagementTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.previous = c.LIBRARY, c.USER_LIBRARY
        c.LIBRARY, c.USER_LIBRARY = self.root / "library", self.root / "user"
        sample = json.loads((ROOT / "library/data/pose-zh.json").read_text())[0]
        self.rows = []
        for identity in ("pose_front", "pose_side"):
            row = dict(sample, id=identity, 原图=f"img/{identity}.png", 缩略图=f"thumbs/{identity}.jpg")
            self.rows.append(row)
            for kind in m.SUFFIXES:
                target = m.destination(row, kind)
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(picture(format={"img": "PNG", "thumbs": "JPEG", "preview": "WEBP"}[kind]))
        index = c.LIBRARY / c.INDEX_FILE
        index.parent.mkdir(parents=True)
        index.write_text(json.dumps(self.rows))
        self.index_bytes = index.read_bytes()

    def tearDown(self):
        c.LIBRARY, c.USER_LIBRARY = self.previous
        c.records.cache_clear()
        self.temp.cleanup()

    def execute(self, ids=None, mode=None):
        plan = m.make_plan(ids, mode)
        return m.apply_plan(plan["request"], plan["token"])

    def test_status_and_plan_do_not_write_or_delete(self):
        before = {str(p): p.read_bytes() for p in c.LIBRARY.rglob("*") if p.is_file()}
        self.assertEqual(len(m.library_status()["records"]), 2)
        plan = m.make_plan(["pose_front"], "removed")
        self.assertEqual(plan["file_count"], 3)
        self.assertFalse(c.USER_LIBRARY.exists())
        self.assertEqual(before, {str(p): p.read_bytes() for p in c.LIBRARY.rglob("*") if p.is_file()})

    def test_original_cleanup_persists_and_reapply_is_manual_and_idempotent(self):
        target = m.destination(self.rows[0], "img")
        result = self.execute(["pose_front"], "thumb_only")
        self.assertFalse(result["failures"])
        self.assertFalse(target.exists())
        self.assertTrue(m.destination(self.rows[0], "thumbs").exists())
        self.assertFalse(m.destination(self.rows[0], "preview").exists())
        self.assertEqual(c.management_rules()["pose_front"]["mode"], "thumb_only")
        with self.assertRaisesRegex(FileNotFoundError, "原图已清理"):
            c.asset("img", "pose_front.png")
        self.assertEqual(len(c.records()), 2)
        # Simulate an updater restoring the original. Reads must never remove it.
        target.write_bytes(picture("green"))
        c.records(); m.library_status(); m.make_plan()
        self.assertTrue(target.exists())
        self.execute()
        self.assertFalse(target.exists())
        self.assertEqual(m.make_plan()["file_count"], 0)
        self.assertFalse(self.execute()["failures"])

    def test_full_cleanup_hides_only_selected_id_but_remains_manageable(self):
        expected = sum(m.destination(self.rows[0], kind).stat().st_size for kind in m.SUFFIXES)
        result = self.execute(["pose_front"], "removed")
        self.assertEqual(result["release_bytes"], expected)
        self.assertEqual([row["id"] for row in c.records()], ["pose_side"])
        self.assertEqual(len(m.library_status()["records"]), 2)
        with self.assertRaisesRegex(ValueError, "素材已完全清理"):
            c.pose("pose_front")
        self.assertEqual((c.LIBRARY / c.INDEX_FILE).read_bytes(), self.index_bytes)
        thumb = m.destination(self.rows[0], "thumbs")
        thumb.write_bytes(picture(format="JPEG"))
        self.assertEqual(c.asset("thumbs", "pose_front.jpg"), thumb)
        self.assertTrue(thumb.exists())  # Management preview never cleans restored files.

    def test_cancel_rule_does_not_redownload_files_or_delete_replacement_sources(self):
        self.execute(["pose_front"], "removed")
        self.execute(["pose_front"], "default")
        self.assertNotIn("pose_front", c.management_rules())
        self.assertFalse(m.destination(self.rows[0], "img").exists())
        self.assertEqual(len(c.records()), 2)
        self.assertFalse(c.browser_payload()["records"][0]["original_available"])

    def test_stale_preview_is_rejected_before_saving_or_deleting(self):
        plan = m.make_plan(["pose_front"], "removed")
        target = m.destination(self.rows[0], "img")
        target.write_bytes(picture("blue"))
        with self.assertRaisesRegex(m.ManagementError, "plan_changed"):
            m.apply_plan(plan["request"], plan["token"])
        self.assertTrue(target.exists())
        self.assertFalse(c.USER_LIBRARY.exists())

    def test_rule_write_failure_never_starts_deleting_files(self):
        plan = m.make_plan(["pose_front"], "removed")
        with patch.object(m, "save_rules", side_effect=OSError("read only")), self.assertRaises(OSError):
            m.apply_plan(plan["request"], plan["token"])
        self.assertTrue(m.destination(self.rows[0], "img").exists())

    def test_partial_failure_is_reported_and_rule_can_be_retried(self):
        actual = Path.unlink
        target = m.destination(self.rows[0], "thumbs")
        def fail(path, *args, **kwargs):
            if path == target:
                raise PermissionError("read only")
            return actual(path, *args, **kwargs)
        with patch.object(Path, "unlink", fail):
            result = self.execute(["pose_front", "pose_side"], "removed")
        self.assertEqual(result["failures"], [{"id": "pose_front", "error": "storage_error"}])
        self.assertIn("pose_side", result["completed"])
        self.assertEqual(c.management_rules()["pose_front"]["mode"], "removed")
        self.assertFalse(self.execute()["failures"])
        self.assertFalse(target.exists())

    def test_replacement_keeps_id_rebuilds_derivatives_and_requires_manual_apply(self):
        original = m.destination(self.rows[0], "img")
        before = original.read_bytes()
        plan = m.stage_replacement("pose_front", picture("blue", (40, 60)))
        rule = c.management_rules()["pose_front"]
        self.assertEqual(original.read_bytes(), before)
        self.assertEqual(plan["file_count"], 3)
        result = m.apply_plan(plan["request"], plan["token"])
        self.assertFalse(result["failures"])
        for kind in m.SUFFIXES:
            target = m.destination(self.rows[0], kind)
            self.assertEqual(m.digest(target.read_bytes()), rule["hashes"][kind])
            self.assertTrue(m.replacement_path("pose_front", rule, kind).is_file())
        with Image.open(original) as image:
            self.assertEqual(image.size, (40, 60))
            self.assertEqual(image.getpixel((0, 0)), (0, 0, 255, 255))
        self.assertEqual(c.pose("pose_front")["management_state"], "replace")
        original.write_bytes(before)
        c.records()
        self.assertEqual(original.read_bytes(), before)
        self.execute()
        self.assertEqual(m.digest(original.read_bytes()), rule["hashes"]["img"])
        self.assertEqual(m.make_plan()["file_count"], 0)
        self.execute(["pose_front"], "default")
        self.assertTrue(m.replacement_path("pose_front", rule, "img").exists())

    def test_invalid_replacements_never_change_builtin_or_existing_rules(self):
        self.execute(["pose_front"], "thumb_only")
        before = c.management_rules()
        for data, code in [(b"bad", "invalid_image"), (picture(format="GIF"), "unsupported_format"), (b"x"*(m.MAX_BYTES+1), "file_too_large")]:
            with self.subTest(code=code), self.assertRaises(m.UploadError) as caught:
                m.stage_replacement("pose_front", data)
            self.assertEqual(caught.exception.code, code)
            self.assertEqual(c.management_rules(), before)

    def test_replacement_commit_failure_preserves_previous_rule_and_builtin(self):
        original = m.destination(self.rows[0], "img").read_bytes()
        with patch.object(m, "save_rules", side_effect=OSError("disk full")), self.assertRaises(OSError):
            m.stage_replacement("pose_front", picture("blue"))
        self.assertEqual(m.destination(self.rows[0], "img").read_bytes(), original)
        self.assertEqual(c.management_rules(), {})
        self.assertFalse([p for p in c.USER_LIBRARY.rglob("*") if p.is_file()])

    def test_missing_replacement_source_prevents_reapply_from_deleting_other_ids(self):
        m.stage_replacement("pose_front", picture("blue"))
        self.execute(["pose_side"], "removed")
        m.destination(self.rows[1], "img").write_bytes(picture())
        rule = c.management_rules()["pose_front"]
        m.replacement_path("pose_front", rule, "img").unlink()
        with self.assertRaisesRegex(m.ManagementError, "replacement_missing"):
            self.execute()
        self.assertTrue(m.destination(self.rows[1], "img").exists())

    def test_unknown_custom_ids_and_malicious_paths_are_rejected(self):
        for ids in [["../secret"], ["u-" + "a"*32], ["missing"], [], "pose_front"]:
            with self.subTest(ids=ids), self.assertRaises(m.ManagementError):
                m.make_plan(ids, "removed")
        for outside in [self.root / "secret.png", m.destination(self.rows[1], "img")]:
            outside.write_bytes(b"do not delete")
            target = m.destination(self.rows[0], "img")
            target.unlink()
            target.symlink_to(outside)
            with self.assertRaisesRegex(m.ManagementError, "unsafe_path"):
                m.make_plan(["pose_front"], "removed")
            self.assertEqual(outside.read_bytes(), b"do not delete")
            target.unlink()
            target.write_bytes(picture())

    def test_corrupt_rules_never_trigger_mutations_and_orphan_rules_are_kept(self):
        m.save_rules({"old_id": {"mode": "removed"}})
        self.assertEqual(m.make_plan()["orphan_ids"], ["old_id"])
        self.execute()
        self.assertIn("old_id", c.management_rules())
        path = c.USER_LIBRARY / "data/builtin_changes.json"
        path.write_text('{"version":1,"rules":{"pose_front":{"mode":"replace","revision":"../../outside"}}}')
        before = path.read_bytes()
        with self.assertRaises(ValueError):
            self.execute()
        self.assertEqual(path.read_bytes(), before)
        self.assertTrue(m.destination(self.rows[0], "img").exists())


if __name__ == "__main__":
    unittest.main()
