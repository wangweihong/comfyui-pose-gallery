"""Single-image imports into the persistent pose user library; never queues model jobs."""
from datetime import datetime, timezone
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import threading
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError

MAX_BYTES = 20 * 1024 * 1024
MAX_PIXELS = 32_000_000
PATHS = {'full': 'img', 'preview': 'preview', 'thumb': 'thumbs'}
LENGTHS = {
    "unknown": ("unknown", "未分类"),
    "short": ("ショート", "短发"),
    "medium": ("ミディアム", "中发"),
    "medium-long": ("セミロング", "中长发"),
    "long": ("ロング", "长发"),
}
_INDEX_LOCK = threading.Lock()


class UploadError(ValueError):
    def __init__(self, code, status=400):
        self.code = code
        self.status = status
        super().__init__(code)


def safe_path(root, relative):
    target = (root / relative).resolve()
    if not target.is_relative_to(root):
        raise UploadError("storage_error", 500)
    return target


def _text(value, required=False):
    if not isinstance(value, str):
        raise UploadError("invalid_metadata")
    value = value.strip()
    if (required and not value) or len(value) > 120 or any(ord(c) < 32 for c in value):
        raise UploadError("name_required" if required and not value else "invalid_metadata")
    return value


def import_image(data, *, name, other_name="", language="zh", hair="unknown", filename, root, category="", section="custom", angle="unknown"):
    """Validate and normalize one image, then commit all derivatives and its index row."""
    if len(data) > MAX_BYTES:
        raise UploadError("file_too_large", 413)
    name = _text(name, required=True)
    other_name = _text(other_name)
    category = _text(category) or "未分类"
    if section not in ("custom", "face", "styling") or angle not in ("unknown", "front", "top", "bottom", "side", "diagonal"):
        raise UploadError("invalid_metadata")
    if language not in ("zh", "en") or hair not in LENGTHS:
        raise UploadError("invalid_metadata")
    if (not isinstance(filename, str) or not filename or len(filename) > 255
            or Path(filename).name != filename or "/" in filename or "\\" in filename
            or any(ord(c) < 32 for c in filename)):
        raise UploadError("invalid_filename")
    try:
        with Image.open(BytesIO(data)) as source:
            if source.format not in {"PNG", "JPEG", "WEBP"}:
                raise UploadError("unsupported_format")
            if getattr(source, "n_frames", 1) != 1:
                raise UploadError("animated_image")
            if source.width * source.height > MAX_PIXELS:
                raise UploadError("too_many_pixels")
            source.load()
            image = ImageOps.exif_transpose(source).convert("RGBA" if "A" in source.getbands() or "transparency" in source.info else "RGB")
    except UploadError:
        raise
    except Image.DecompressionBombError as exc:
        raise UploadError("too_many_pixels") from exc
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
        raise UploadError("invalid_image") from exc

    root = Path(root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    identity = "u-" + uuid.uuid4().hex
    paths = {kind: f"{PATHS[kind]}/{identity}{suffix}" for kind, suffix in
             (("full", ".png"), ("preview", ".webp"), ("thumb", ".webp"))}
    index_path = safe_path(root, "data/custom.json")
    destinations = {kind: safe_path(root, path) for kind, path in paths.items()}
    for target in [index_path, *destinations.values()]:
        target.parent.mkdir(parents=True, exist_ok=True)
    # White background matches the existing IMAGE output; keep alpha in the full PNG.
    rgb = Image.alpha_composite(Image.new("RGBA", image.size, "white"), image.convert("RGBA")).convert("RGB")
    moved, index_temp, committed = [], None, False
    try:
        with tempfile.TemporaryDirectory(prefix=".upload-", dir=root) as temp_dir:
            temp = Path(temp_dir)
            image.save(temp / "full.png", format="PNG")
            for kind, limit, quality in [("preview", (800, 1000), 90), ("thumb", (400, 500), 88)]:
                derivative = rgb.copy()
                derivative.thumbnail(limit, Image.Resampling.LANCZOS)
                derivative.save(temp / f"{kind}.webp", format="WEBP", quality=quality, method=6)
                if kind == "thumb":
                    thumb_width, thumb_height = derivative.size
            name_zh, name_en = (name, other_name or name) if language == "zh" else (other_name or name, name)
            row = {
                "id": identity, "origin": "user", "source_id": "",
                "name_zh": name_zh, "name_en": name_en, "name_source": "user",
                "w": image.width, "h": image.height, "thumb_w": thumb_width, "thumb_h": thumb_height,
                "bytes": (temp / "full.png").stat().st_size,
                "sha256": hashlib.sha256((temp / "full.png").read_bytes()).hexdigest(),
                "original_filename": filename, "uploaded_at": datetime.now(timezone.utc).isoformat(),
            }
            view = {"unknown":"未分类", "front":"正面", "top":"俯视", "bottom":"仰视", "side":"侧面", "diagonal":"斜侧"}[angle]
            row.update(体系="自定义", 姿势编号="", 分类=category, 姿势名称=name_zh, 角度=view,
                       原图=paths["full"], 预览图=paths["preview"], 缩略图=paths["thumb"])
            row["检索"] = " ".join((identity, name_zh, name_en, category, view, filename)).lower()
            with _INDEX_LOCK:
                existing = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else []
                if not isinstance(existing, list):
                    raise UploadError("storage_error", 500)
                if any(not isinstance(item, dict) for item in existing):
                    raise UploadError("storage_error", 500)
                if any(item.get("id") == identity for item in existing) or any(p.exists() for p in destinations.values()):
                    raise UploadError("storage_error", 500)
                for kind, target in destinations.items():
                    os.replace(temp / ("full.png" if kind == "full" else kind + ".webp"), target)
                    moved.append(target)
                with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=index_path.parent,
                                                 prefix=".custom-", suffix=".tmp", delete=False) as handle:
                    index_temp = Path(handle.name)
                    json.dump(existing + [row], handle, ensure_ascii=False, indent=2)
                    handle.write("\n")
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(index_temp, index_path)
                committed = True
        return row
    except (OSError, ValueError) as exc:
        if isinstance(exc, UploadError):
            raise
        raise UploadError("storage_error", 500) from exc
    finally:
        if not committed:
            for target in moved:
                target.unlink(missing_ok=True)
        if index_temp:
            index_temp.unlink(missing_ok=True)
