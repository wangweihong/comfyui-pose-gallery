"""Explicit, previewed local library maintenance. No startup or update hooks."""
import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import threading
import uuid

from PIL import Image, ImageOps, UnidentifiedImageError

from . import catalog
from .uploads import MAX_BYTES, MAX_PIXELS, UploadError

LOCK = threading.RLock()
MODES = {"thumb_only", "removed", "replace", "default"}
SUFFIXES = {"img": ".png", "thumbs": ".jpg", "preview": ".webp"}


class ManagementError(ValueError):
    def __init__(self, code, status=400):
        self.code, self.status = code, status
        super().__init__(code)


def safe_path(root, relative):
    """Do not follow symlinks, even to another managed file inside the root."""
    root = root.resolve()
    target = root / relative
    if not target.resolve().is_relative_to(root):
        raise ManagementError("unsafe_path")
    current = target
    while current != root:
        if current.is_symlink():
            raise ManagementError("unsafe_path")
        current = current.parent
    return target


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".pose-", delete=False) as handle:
            temporary = Path(handle.name)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def save_rules(rules):
    path = safe_path(catalog.USER_LIBRARY, "data/builtin_changes.json")
    atomic_write(path, (json.dumps({"version": 1, "rules": rules}, ensure_ascii=False, indent=2) + "\n").encode())


def builtin_rows():
    return {row["id"]: row for row in catalog.records(include_removed=True) if row["origin"] == "builtin"}


def replacement_path(identity, rule, kind):
    return safe_path(catalog.USER_LIBRARY, f"replacements/{identity}/{rule['revision']}/{kind}{SUFFIXES[kind]}")


def destination(row, kind):
    # The catalog validates all registered paths; optional previews use the canonical path.
    relative = row.get(catalog.ASSET_FIELDS[kind], f"{kind}/{row['id']}{SUFFIXES[kind]}")
    return safe_path(catalog.LIBRARY, relative)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def library_status():
    with LOCK:
        return _library_status()


def _library_status():
    rules = catalog.management_rules()
    rows = builtin_rows()
    result = []
    for row in rows.values():
        state = rules.get(row["id"], {}).get("mode", "default")
        paths = {kind: destination(row, kind) for kind in SUFFIXES}
        result.append({**row, "management_state": state,
                       "installed_original": paths["img"].is_file(),
                       "installed_thumb": paths["thumbs"].is_file(),
                       "disk_bytes": sum(path.stat().st_size for path in paths.values() if path.is_file())})
    return {"records": result, "orphan_ids": sorted(set(rules) - set(rows))}


def make_plan(ids=None, mode=None):
    """Plan contains only canonical IDs and a fingerprint; paths never come from clients."""
    with LOCK:
        return _make_plan(ids, mode)


def _make_plan(ids=None, mode=None):
    rules, rows = catalog.management_rules(), builtin_rows()
    if ids is None:
        if mode is not None:
            raise ManagementError("invalid_request")
        desired = {identity: rule for identity, rule in rules.items() if identity in rows}
    else:
        if (not isinstance(ids, list) or not ids or len(ids) > 5000
                or any(not isinstance(identity, str) or identity not in rows for identity in ids)
                or mode not in MODES):
            raise ManagementError("invalid_selection")
        desired = {}
        for identity in sorted(set(ids)):
            if mode == "replace":
                if rules.get(identity, {}).get("mode") != "replace":
                    raise ManagementError("replacement_missing")
                desired[identity] = rules[identity]
            else:
                desired[identity] = {"mode": mode}
    items, fingerprint = [], []
    for identity, rule in sorted(desired.items()):
        row, operations = rows[identity], []
        for kind in SUFFIXES:
            target = destination(row, kind)
            stat = target.stat() if target.exists() else None
            if stat is not None and not target.is_file():
                raise ManagementError("unsafe_path")
            fingerprint.append([identity, kind, str(target), stat.st_mtime_ns if stat else None, stat.st_size if stat else 0])
            remove = rule["mode"] == "removed" or (rule["mode"] == "thumb_only" and kind != "thumbs")
            if remove and stat:
                operations.append({"kind": kind, "action": "delete", "bytes": stat.st_size})
            if rule["mode"] == "replace":
                source = replacement_path(identity, rule, kind)
                if not source.is_file() or digest(source.read_bytes()) != rule["hashes"][kind]:
                    raise ManagementError("replacement_missing")
                if not stat or digest(target.read_bytes()) != rule["hashes"][kind]:
                    operations.append({"kind": kind, "action": "replace", "bytes": source.stat().st_size,
                                       "previous_bytes": stat.st_size if stat else 0})
        items.append({"id": identity, "mode": rule["mode"], "operations": operations})
    released = sum(op["bytes"] if op["action"] == "delete" else op["previous_bytes"] - op["bytes"]
                   for item in items for op in item["operations"])
    request = {"ids": sorted(set(ids)) if ids is not None else None, "mode": mode}
    token = digest(json.dumps([rules, desired, fingerprint], sort_keys=True).encode())
    return {"request": request, "token": token, "items": items, "release_bytes": released,
            "file_count": sum(len(item["operations"]) for item in items),
            "orphan_ids": sorted(set(rules) - set(rows))}


def apply_plan(request, token):
    with LOCK:
        if not isinstance(request, dict) or set(request) != {"ids", "mode"}:
            raise ManagementError("invalid_request")
        plan = make_plan(**request)
        if not isinstance(token, str) or token != plan["token"]:
            raise ManagementError("plan_changed", 409)
        rules, rows = catalog.management_rules(), builtin_rows()
        for item in plan["items"]:
            if item["mode"] == "default":
                rules.pop(item["id"], None)
            elif item["mode"] != "replace":
                rules[item["id"]] = {"mode": item["mode"]}
        # Persist intent before destructive operations, so partial failures are retryable.
        save_rules(rules)
        completed, failures, released = [], [], 0
        for item in plan["items"]:
            try:
                for op in item["operations"]:
                    target = destination(rows[item["id"]], op["kind"])
                    if op["action"] == "delete":
                        target.unlink()
                        released += op["bytes"]
                    else:
                        source = replacement_path(item["id"], rules[item["id"]], op["kind"])
                        data = source.read_bytes()
                        if digest(data) != rules[item["id"]]["hashes"][op["kind"]]:
                            raise ManagementError("replacement_missing")
                        atomic_write(target, data)
                        released += op["previous_bytes"] - len(data)
                completed.append(item["id"])
            except (OSError, ManagementError) as exc:
                failures.append({"id": item["id"], "error": exc.code if isinstance(exc, ManagementError) else "storage_error"})
        return {"completed": completed, "failures": failures, "release_bytes": released,
                "orphan_ids": plan["orphan_ids"]}


def stage_replacement(identity, data):
    """Stage validated derivatives in a new revision, then atomically commit the rule."""
    with LOCK:
        if not isinstance(identity, str) or identity not in builtin_rows():
            raise ManagementError("invalid_selection")
        if len(data) > MAX_BYTES:
            raise UploadError("file_too_large", 413)
        try:
            with Image.open(BytesIO(data)) as source:
                if source.format not in {"PNG", "JPEG", "WEBP"}:
                    raise UploadError("unsupported_format")
                if getattr(source, "n_frames", 1) != 1:
                    raise UploadError("animated_image")
                if source.width * source.height > MAX_PIXELS:
                    raise UploadError("too_many_pixels")
                source.load()
                image = ImageOps.exif_transpose(source).convert("RGBA")
        except UploadError:
            raise
        except Image.DecompressionBombError as exc:
            raise UploadError("too_many_pixels") from exc
        except (UnidentifiedImageError, OSError, ValueError, SyntaxError) as exc:
            raise UploadError("invalid_image") from exc
        rgb = Image.alpha_composite(Image.new("RGBA", image.size, "white"), image).convert("RGB")
        rule = {"mode": "replace", "revision": uuid.uuid4().hex, "w": image.width, "h": image.height, "hashes": {}}
        created = []
        try:
            for kind in SUFFIXES:
                output, derivative = BytesIO(), image if kind == "img" else rgb.copy()
                if kind != "img":
                    derivative.thumbnail((400, 500) if kind == "thumbs" else (800, 1000), Image.Resampling.LANCZOS)
                derivative.save(output, format={"img": "PNG", "thumbs": "JPEG", "preview": "WEBP"}[kind])
                content = output.getvalue()
                path = replacement_path(identity, rule, kind)
                atomic_write(path, content)
                created.append(path)
                rule["hashes"][kind] = digest(content)
            rules = catalog.management_rules()
            rules[identity] = rule
            save_rules(rules)
        except Exception:
            for path in created:
                path.unlink(missing_ok=True)
            raise
        return make_plan([identity], "replace")
