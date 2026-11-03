"""comfyui-pose-gallery: browse local pose references and output an IMAGE."""
import asyncio
import logging
import random
import uuid
from . import catalog as _random_catalog
import hashlib
import json
import numpy as np
import torch
from PIL import Image, ImageOps
from aiohttp import web
from server import PromptServer
from .uploads import import_image, UploadError, MAX_BYTES
from .catalog import USER_LIBRARY, metadata, browser_payload, records, pose, asset, ROOT
from . import management

class PoseGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'pose_id': ('STRING', {'default': 'full_sexy_P031_front', 'multiline': False, 'tooltip': '点击浏览姿势图库，选择视角后使用；也可以直接输入图库 ID。'})},
                'optional': {'language': (["zh", "en"], {'default': 'zh',
                    'tooltip': '界面、description 和 action 输出语言。Language for the UI, description, and action outputs.'})}}

    RETURN_TYPES = ('IMAGE', 'INT', 'INT', 'STRING', 'STRING', 'STRING')
    RETURN_NAMES = ('image', 'width', 'height', 'pose_id', 'description', 'action')
    FUNCTION = 'load_pose'
    CATEGORY = 'image/Pose Gallery'
    DESCRIPTION = '本地姿态图库：内置多视角分组、筛选和单张自定义上传，输出完整参考图。'

    @classmethod
    def VALIDATE_INPUTS(cls, pose_id, language="zh"):
        try:
            row = pose(pose_id)
            asset('img', row['原图'].split('/')[-1])
        except (ValueError, FileNotFoundError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, pose_id, language="zh"):
        row = pose(pose_id)
        fingerprint = hashlib.sha256(asset('img', row['原图'].split('/')[-1]).read_bytes())
        fingerprint.update(language.encode('utf-8'))
        return fingerprint.hexdigest()

    def load_pose(self, pose_id, language="zh"):
        row = pose(pose_id)
        with Image.open(asset('img', row['原图'].split('/')[-1])) as source:
            img = ImageOps.exif_transpose(source).convert('RGBA')
            background = Image.new('RGBA', img.size, 'white')
            img = Image.alpha_composite(background, img).convert('RGB')
            width, height = img.size
            tensor = torch.from_numpy(np.asarray(img).astype(np.float32) / 255.0).unsqueeze(0)
        description = _random_catalog.pose_description(row, language)
        action = _random_catalog.pose_action(row, language)
        return (tensor, width, height, pose_id, description, action)

class RandomPoseGallery(PoseGallery):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"origin": (["all", "builtin", "user"], {"default": "all",
                    "tooltip": "随机来源：全部 / 内置 / 自定义。Random source: all / built-in / custom."})},
                "optional": {"language": (["zh", "en"], {"default": "zh",
                    "tooltip": "界面、提示、description 和 action 输出语言。Language for the UI, errors, description, and action outputs."}),
                    "pose_system": (["all", "全身单人・标准系", "全身单人・性感系", "上半身单人", "双人缠绵", "自定义"], {"default": "all"}),
                    "angle": (["all", "正面", "俯视", "仰视", "侧面", "斜侧", "未分类"], {"default": "all"}),
                    "pose_id": ("STRING", {"default": "", "multiline": False,
                        "tooltip": "骰子当前选中的姿态；锁定后使用此图。Current dice selection; used while locked."}),
                    "locked": ("BOOLEAN", {"default": False,
                        "tooltip": "锁定当前姿态，点击骰子和运行工作流都不再随机。Keep this pose for dice clicks and workflow runs."})}}

    FUNCTION = "load_random"
    DESCRIPTION = "点击骰子即可随机预览，无需运行工作流；锁定后固定当前姿态，解锁后每次运行重新随机。"

    @classmethod
    def _candidates(cls, origin="all", language="zh", pose_system="all", angle="all"):
        pose_system = _random_catalog.canonical_label(pose_system)
        angle = _random_catalog.canonical_label(angle)
        if origin not in ("all", "builtin", "user"):
            raise ValueError("Invalid random source" if language == "en" else "无效的随机来源")
        available = []
        # records() validates registration and canonical paths once for the whole pool.
        # Resolve against the correct root here to avoid reloading the entire index per file.
        for row in records():
            if row.get("management_state") in ("thumb_only", "removed"):
                continue
            if origin != "all" and row["origin"] != origin:
                continue
            if pose_system != "all" and row.get("体系") != pose_system:
                continue
            if angle != "all" and row.get("角度") != angle:
                continue
            root = _random_catalog.USER_LIBRARY if row["origin"] == "user" else _random_catalog.LIBRARY
            target = (root / row['原图']).resolve()
            if not target.is_relative_to(root):
                raise ValueError("Original image path escapes the library" if language == "en" else "原图路径越出图库目录")
            if target.is_file():
                available.append(row)
        if not available:
            raise ValueError("No available originals in this source/filter. Install the library, upload a reference, or change the source."
                             if language == "en" else "当前筛选没有可用姿态原图，请安装素材库、上传参考图或切换来源。")
        return available

    @classmethod
    def VALIDATE_INPUTS(cls, origin="all", language="zh", pose_system="all", angle="all", pose_id="", locked=False):
        if locked:
            if not pose_id:
                return "Draw a pose before locking" if language == "en" else "请先点击骰子选择姿态，再锁定"
            return super().VALIDATE_INPUTS(pose_id, language)
        try:
            cls._candidates(origin, language, pose_system, angle)
        except (ValueError, OSError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, origin="all", language="zh", pose_system="all", angle="all", pose_id="", locked=False):
        if locked:
            return super().IS_CHANGED(pose_id, language)
        # Re-execute for every queued prompt; the fingerprint is JSON-safe.
        return uuid.uuid4().hex

    @staticmethod
    def preview_data(selected, language="zh"):
        name_zh = selected.get("name_zh") or selected.get("姿势名称") or selected["id"]
        name_en = selected.get("name_en") or _random_catalog.english_labels().get(name_zh, name_zh)
        return {"pose_id": selected["id"], "name": name_en if language == "en" else name_zh,
                "name_zh": name_zh, "name_en": name_en}

    def load_random(self, origin="all", language="zh", pose_system="all", angle="all", pose_id="", locked=False):
        if locked:
            if not pose_id:
                raise ValueError("Draw a pose before locking" if language == "en" else "请先点击骰子选择姿态，再锁定")
            selected = pose(pose_id)
        else:
            selected = random.choice(self._candidates(origin, language, pose_system, angle))
        result = super().load_pose(selected["id"], language)
        return {"ui": {key: [value] for key, value in self.preview_data(selected, language).items()}, "result": result}


routes = PromptServer.instance.routes

@routes.get('/pose_gallery/random')
async def random_preview_route(request):
    """Select metadata only; never enqueue a prompt or load an image tensor."""
    query = request.query
    try:
        def select():
            candidates = RandomPoseGallery._candidates(query.get('origin', 'all'), query.get('language', 'zh'),
                                                       query.get('pose_system', 'all'), query.get('angle', 'all'))
            alternatives = [row for row in candidates if row['id'] != query.get('exclude_id')]
            return RandomPoseGallery.preview_data(random.choice(alternatives or candidates), query.get('language', 'zh'))
        return web.json_response(await asyncio.to_thread(select), headers={"Cache-Control": "no-store"})
    except (ValueError, OSError) as exc:
        return web.json_response({'error': str(exc)}, status=400, headers={"Cache-Control": "no-store"})

@routes.get('/pose_gallery/catalog')
async def catalog_route(request):
    try:
        return web.json_response(records(availability=True), headers={"Cache-Control": "no-store"})
    except (ValueError, FileNotFoundError) as exc:
        return web.json_response({'error': str(exc)}, status=503)

@routes.get('/pose_gallery/assets/{kind}/{filename}')
async def asset_route(request):
    try:
        path = asset(request.match_info['kind'], request.match_info['filename'])
        return web.FileResponse(path, headers={'Cache-Control': 'private, no-cache'})
    except (ValueError, FileNotFoundError):
        raise web.HTTPNotFound()

@routes.get('/pose_gallery/gallery')
async def gallery_route(request):
    return web.FileResponse(ROOT / 'web' / 'gallery.html', headers={'Cache-Control': 'no-cache'})

@routes.post("/pose_gallery/upload")
async def upload_route(request):
    try:
        multipart = await request.multipart()
        fields, data, filename = {}, None, None
        async for part in multipart:
            if part.filename is not None:
                if part.name != "image" or data is not None:
                    raise UploadError("single_image_only")
                chunks, size = [], 0
                while chunk := await part.read_chunk():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise UploadError("file_too_large", 413)
                    chunks.append(chunk)
                data, filename = b"".join(chunks), part.filename
            else:
                if part.name not in {"name", "other_name", "language", "hair", "category", "section", "angle"} or part.name in fields:
                    raise UploadError("invalid_metadata")
                chunks, size = [], 0
                while chunk := await part.read_chunk():
                    size += len(chunk)
                    if size > 2048:
                        raise UploadError("invalid_metadata")
                    chunks.append(chunk)
                fields[part.name] = b"".join(chunks).decode("utf-8")
        if data is None:
            raise UploadError("image_required")
        try:
            await asyncio.to_thread(records)
        except (ValueError, OSError) as exc:
            raise UploadError("storage_error", 500) from exc
        row = await asyncio.to_thread(import_image, data, name=fields.get("name", ""),
            other_name=fields.get("other_name", ""), language=fields.get("language", "zh"),
            hair=fields.get("hair", "unknown"), filename=filename, root=USER_LIBRARY, category=fields.get("category", ""),
            section=fields.get("section", "custom"), angle=fields.get("angle", "unknown"))
        # Reuse the existing allow-listed, browser-relative catalog representation.
        payload = browser_payload()
        selected = next(item for item in payload["records"] if item["id"] == row["id"])
        return web.json_response({"record": selected, "catalog": payload}, status=201,
                                 headers={"Cache-Control": "no-store"})
    except UploadError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except (ValueError, UnicodeError, AssertionError):
        return web.json_response({"error": "invalid_request"}, status=400)
    except OSError:
        logging.exception("Unable to save a custom hairstyle")
        return web.json_response({"error": "storage_error"}, status=500)


@routes.get("/pose_gallery/meta")
async def metadata_route(request):
    try:
        return web.json_response(metadata(), headers={"Cache-Control":"no-store"})
    except (ValueError, OSError):
        return web.json_response({"error":"storage_error"}, status=503)


async def management_response(function, *args, **kwargs):
    try:
        result = await asyncio.to_thread(function, *args, **kwargs)
        return web.json_response(result, headers={"Cache-Control": "no-store"})
    except (management.ManagementError, UploadError) as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except (ValueError, TypeError, KeyError):
        return web.json_response({"error": "invalid_management_data"}, status=400)
    except OSError:
        logging.exception("Unable to manage pose library")
        return web.json_response({"error": "storage_error"}, status=500)


async def management_json(request):
    data = bytearray()
    async for chunk in request.content.iter_chunked(8192):
        data.extend(chunk)
        if len(data) > 256 * 1024:
            raise management.ManagementError("invalid_request", 413)
    try:
        value = json.loads(data)
    except (ValueError, UnicodeError) as exc:
        raise management.ManagementError("invalid_request") from exc
    if not isinstance(value, dict):
        raise management.ManagementError("invalid_request")
    return value


@routes.get("/pose_gallery/manage")
async def management_status_route(request):
    return await management_response(management.library_status)


@routes.get("/pose_gallery/manage/summary")
async def management_summary_route(request):
    return await management_response(management.update_summary)


@routes.post("/pose_gallery/manage/plan")
async def management_plan_route(request):
    try:
        data = await management_json(request)
    except management.ManagementError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    if set(data) - {"ids", "mode", "choices"}:
        return web.json_response({"error": "invalid_request"}, status=400)
    return await management_response(management.make_plan, **data)


@routes.post("/pose_gallery/manage/apply")
async def management_apply_route(request):
    try:
        data = await management_json(request)
    except management.ManagementError as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    if set(data) != {"request", "token"}:
        return web.json_response({"error": "invalid_request"}, status=400)
    return await management_response(management.apply_plan, data["request"], data["token"])


@routes.post("/pose_gallery/manage/replacement")
async def management_replacement_route(request):
    try:
        multipart = await request.multipart()
        data, identity = None, None
        async for part in multipart:
            limit = MAX_BYTES if part.name == "image" else 80
            if part.name not in ("image", "id") or (part.name == "image" and data is not None) or (part.name == "id" and identity is not None):
                raise management.ManagementError("invalid_request")
            content = bytearray()
            while chunk := await part.read_chunk():
                content.extend(chunk)
                if len(content) > limit:
                    raise UploadError("file_too_large", 413) if part.name == "image" else management.ManagementError("invalid_request")
            if part.name == "image":
                data = bytes(content)
            else:
                identity = content.decode("utf-8")
        if data is None or identity is None:
            raise management.ManagementError("invalid_request")
    except (management.ManagementError, UploadError) as exc:
        return web.json_response({"error": exc.code}, status=exc.status)
    except (ValueError, UnicodeError, AssertionError):
        return web.json_response({"error": "invalid_request"}, status=400)
    return await management_response(management.stage_replacement, identity, data)


NODE_CLASS_MAPPINGS = {"PoseGallery": PoseGallery, "RandomPoseGallery": RandomPoseGallery}
NODE_DISPLAY_NAME_MAPPINGS = {'PoseGallery': 'Pose Gallery 姿势图库', 'RandomPoseGallery': 'Random Pose Gallery 随机姿势图库'}
WEB_DIRECTORY = './web'
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

@routes.get('/pose_gallery/ui/{filename}')
async def ui_route(request):
    name=request.match_info['filename']
    if name not in ('custom_upload.mjs', 'custom_upload.css', 'i18n.mjs', 'library_manager.mjs', 'library_manager.css'):
        raise web.HTTPNotFound()
    return web.FileResponse(ROOT / 'web' / name, headers={'Cache-Control':'no-cache'})
