"""Isolated browser fixture; never serves or changes the real user/library files.

Run using ComfyUI's Python, then set POSE_MANAGEMENT_TEST_URL for the browser test.
"""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types

from aiohttp import web
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pose_browser_fixture", ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
server = types.ModuleType("server")
server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=web.RouteTableDef()))
sys.modules["server"] = server
spec.loader.exec_module(module)
c = module._random_catalog
temporary = tempfile.TemporaryDirectory(prefix="pose-browser-library-")
c.LIBRARY, c.USER_LIBRARY = Path(temporary.name) / "library", Path(temporary.name) / "user"
rows = json.loads((ROOT / "library/data/pose-zh.json").read_text())[:10]
originals = {}
for row in rows:
    for kind in module.management.SUFFIXES:
        path = module.management.destination(row, kind)
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.new("RGB", (90, 120), "#b1c5b4").save(path)
        originals[path] = path.read_bytes()
index = c.LIBRARY / c.INDEX_FILE
index.parent.mkdir(parents=True, exist_ok=True)
index.write_text(json.dumps(rows))
app = web.Application()
app.add_routes(module.routes)


async def simulate_update(request):
    for path, content in originals.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
    return web.json_response({"restored": len(originals)})


app.router.add_post("/_fixture/update", simulate_update)


async def reset_fixture(request):
    module.management.save_rules({})
    return await simulate_update(request)


app.router.add_post("/_fixture/reset", reset_fixture)
try:
    web.run_app(app, host="0.0.0.0", port=int(sys.argv[1]) if len(sys.argv) > 1 else 18297, access_log=None)
finally:
    temporary.cleanup()
