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

@lru_cache(maxsize=1)
def english_labels():
    # Translations ship with the node, including when a custom library is used.
    return json.loads((ROOT / 'web/labels-en.json').read_text(encoding='utf-8'))

def canonical_label(value):
    return next((zh for zh, en in english_labels().items() if en == value), value)

def pose_description(row, language="zh"):
    labels = english_labels() if language == "en" else {}
    values = []
    for field in ("体系", "分类", "姿势名称", "角度"):
        value = row.get(field, "")
        if language == "en":
            value = (row.get("name_en") or labels.get(value, value)) if field == "姿势名称" else labels.get(value, value)
        if value:
            values.append(value)
    return " / ".join(values)

def pose_action(row, language="zh"):
    name = row.get("姿势名称", "")
    if language == "en":
        name = row.get("name_en") or english_labels().get(name, name)
    return ",".join(part.strip() for part in re.split(r"[·・]", name) if part.strip())

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

def management_rules():
    """Read desired states only. Reading a catalog never changes library files."""
    path = (USER_LIBRARY / "data/builtin_changes.json").resolve()
    if not path.is_relative_to(USER_LIBRARY):
        raise ValueError("素材管理记录路径越界")
    if not path.exists():
        return {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict) or payload.get("version") != 1 or not isinstance(payload.get("rules"), dict):
        raise ValueError("素材管理记录格式错误")
    rules = payload["rules"]
    for identity, rule in rules.items():
        if (not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identity) or identity.startswith("u-")
                or not isinstance(rule, dict) or rule.get("mode") not in ("thumb_only", "removed", "replace")):
            raise ValueError("素材管理记录无效")
        if rule["mode"] == "replace":
            if (not isinstance(rule.get("revision"), str) or not re.fullmatch(r"[a-f0-9]{32}", rule["revision"])
                    or any(type(rule.get(key)) is not int or rule[key] < 1 for key in ("w", "h"))
                    or rule["w"] * rule["h"] > 32_000_000
                    or not isinstance(rule.get("hashes"), dict)
                    or set(rule["hashes"]) != {"img", "thumbs", "preview"}
                    or any(not isinstance(value, str) or not re.fullmatch(r"[a-f0-9]{64}", value) for value in rule["hashes"].values())):
                raise ValueError("替换素材记录无效")
    return rules


def records(include_removed=False, availability=False):
    result, seen = [], set()
    rules = management_rules()
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
            if origin == "builtin":
                row["name_en"] = english_labels().get(row.get("姿势名称"), row.get("姿势名称", identity))
                rule = rules.get(identity, {})
                row["management_state"] = rule.get("mode", "default")
                if row["management_state"] == "removed" and not include_removed:
                    continue
                if rule.get("mode") == "replace":
                    row.update(w=rule["w"], h=rule["h"], asset_version=rule["revision"])
                if availability:
                    target = (root / row["原图"]).resolve()
                    row["original_available"] = (rule.get("mode") not in ("thumb_only", "removed")
                                                 and target.is_relative_to(root) and target.is_file())
            if origin == "user":
                if not isinstance(row.get("name_zh"), str) or not row["name_zh"] or not isinstance(row.get("name_en"), str):
                    raise ValueError("自定义素材名称无效")
                row["source_id"] = ""
            result.append(row)
    return result

# Keep cache-clear hooks used by existing maintenance scripts and tests.
records.cache_clear = _read_index.cache_clear

def index(include_removed=False):
    return {row["id"]: row for row in records(include_removed=include_removed)}
index.cache_clear = _read_index.cache_clear

def pose(identity, include_removed=False):
    if not isinstance(identity, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", identity):
        raise ValueError("无效素材 ID")
    row = index(include_removed=include_removed).get(identity)
    if row is None:
        if management_rules().get(identity, {}).get("mode") == "removed":
            raise ValueError("素材已删除。请先补回内置素材，再在“管理内置素材”中选择保留。Asset deleted. Restore built-in files, then choose to keep them in Manage built-in assets.")
        raise ValueError("未知素材 ID：" + identity)
    return row

def asset(kind, filename):
    if kind not in ASSET_FIELDS or Path(filename).name != filename or "\\" in filename:
        raise ValueError("无效图片路径")
    # The manager may show thumbnails restored by an updater before manual cleanup.
    row = pose(Path(filename).stem, include_removed=kind != "img")
    if kind == "img" and row.get("management_state") == "thumb_only":
        raise FileNotFoundError("原图已清理。请先补回内置素材，再在“管理内置素材”中选择保留。Original removed. Restore built-in files, then choose to keep them in Manage built-in assets.")
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
    rows = records(availability=True)
    meta = metadata()
    return {"records":rows, "meta":meta}

GALLERY = 'pose'
FULL_KIND = 'img'
PREFIXES = {'img': 'img', 'preview': 'preview', 'thumbs': 'thumbs'}
OPTIONAL_ASSETS = ('preview',)
