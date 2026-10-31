"""Allow-listed built-in and persistent user references; no runtime downloads."""
import json
import os
import re
from functools import lru_cache
from pathlib import Path
ROOT = Path(__file__).resolve().parent
LIBRARY = Path(os.environ.get("COMFYUI_POSE_GALLERY_LIBRARY", ROOT / "library")).resolve()
try:
    import folder_paths
    _USER_DIRECTORY = Path(folder_paths.get_user_directory())
except ImportError:
    _USER_DIRECTORY = Path.home() / ".comfyui" / "user"
USER_LIBRARY = Path(os.environ.get("COMFYUI_POSE_GALLERY_USER_LIBRARY", _USER_DIRECTORY / "pose_gallery")).resolve()
INDEX_FILE = "data/pose-zh.json"
ASSET_FIELDS = {'img': '原图', 'preview': '预览图', 'thumbs': '缩略图'}

@lru_cache(maxsize=8)
def _read_index(path, modified, size):
    rows = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("图库索引格式错误")
    return rows

def read_index(root, relative):
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError("索引路径越界")
    if not path.is_file():
        return []
    stat = path.stat()
    return _read_index(str(path), stat.st_mtime_ns, stat.st_size)

def records():
    result, seen = [], set()
    for origin, root, file in [("builtin", LIBRARY, INDEX_FILE), ("user", USER_LIBRARY, "data/custom.json")]:
        for entry in read_index(root, file):
            row = dict(entry) if isinstance(entry, dict) else {}
            identity = row.get("id")
            if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identity) or identity in seen:
                raise ValueError("图库索引含无效或重复 ID")
            if origin == "user" and not re.fullmatch(r"u-[a-f0-9]{32}", identity):
                raise ValueError("自定义素材编号无效")
            if origin == "builtin" and identity.startswith("u-"):
                raise ValueError("内置素材不能使用自定义编号")
            seen.add(identity)
            for asset_kind, field in ASSET_FIELDS.items():
                if field not in row:
                    if origin == "user" or asset_kind not in OPTIONAL_ASSETS:
                        raise ValueError("图库索引缺少图片路径")
                    continue
                suffix = ".png" if asset_kind == FULL_KIND else (".jpg" if GALLERY == "pose" and origin == "builtin" and asset_kind == "thumbs" else ".webp")
                expected = f"{PREFIXES[asset_kind]}/{identity}{suffix}"
                if row[field] != expected:
                    raise ValueError("图库索引含无效图片路径")
            row["origin"] = origin
            if origin == "user":
                if not isinstance(row.get("name_zh"), str) or not row["name_zh"] or not isinstance(row.get("name_en"), str):
                    raise ValueError("自定义素材名称无效")
                row["source_id"] = ""
            result.append(row)
    return result

# Keep cache-clear hooks used by existing maintenance scripts and tests.
records.cache_clear = _read_index.cache_clear

def index():
    return {row["id"]: row for row in records()}
index.cache_clear = _read_index.cache_clear

def pose(identity):
    if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identity):
        raise ValueError("无效素材 ID")
    row = index().get(identity)
    if row is None:
        raise ValueError("未知素材 ID：" + identity)
    return row

def asset(kind, filename):
    if kind not in ASSET_FIELDS or Path(filename).name != filename or "\\" in filename:
        raise ValueError("无效图片路径")
    row = pose(Path(filename).stem)
    root = USER_LIBRARY if row["origin"] == "user" else LIBRARY
    relative = f"{PREFIXES[kind]}/{filename}"
    target = (root / relative).resolve()
    if row.get(ASSET_FIELDS[kind]) != relative or not target.is_relative_to(root):
        raise ValueError("图片不在图库允许范围内")
    if not target.is_file():
        raise FileNotFoundError(f"图片缺失：library/{relative}。请在节点目录执行 git pull 获取完整图库，或检查自定义素材备份目录。")
    return target

def metadata():
    rows = records()
    builtins = sum(row["origin"] == "builtin" for row in rows)
    return {"total":len(rows), "builtin_count":builtins, "user_count":len(rows)-builtins,
            "builtin_missing":not (LIBRARY / INDEX_FILE).is_file(),
            "sections":{section:sum(r.get("section") == section for r in rows) for section in ("face", "styling", "custom")}}

def browser_payload():
    rows = records()
    meta = metadata()
    return {"records":rows, "meta":meta}

GALLERY = 'pose'
FULL_KIND = 'img'
PREFIXES = {'img': 'img', 'preview': 'preview', 'thumbs': 'thumbs'}
OPTIONAL_ASSETS = ('preview',)
