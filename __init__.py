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

class PoseGallery:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {'pose_id': ('STRING', {'default': 'full_sexy_P031_front', 'multiline': False, 'tooltip': '点击浏览姿势图库，选择视角后使用；也可以直接输入图库 ID。'})}}

    RETURN_TYPES = ('IMAGE', 'INT', 'INT', 'STRING', 'STRING')
    RETURN_NAMES = ('image', 'width', 'height', 'pose_id', 'description')
    FUNCTION = 'load_pose'
    CATEGORY = 'image/Pose Gallery'
    DESCRIPTION = '本地姿态图库：内置多视角分组、筛选和单张自定义上传，输出完整参考图。'

    @classmethod
    def VALIDATE_INPUTS(cls, pose_id):
        try:
            row = pose(pose_id)
            asset('img', row['原图'].split('/')[-1])
        except (ValueError, FileNotFoundError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, pose_id):
        row = pose(pose_id)
        return hashlib.sha256(asset('img', row['原图'].split('/')[-1]).read_bytes()).hexdigest()

    def load_pose(self, pose_id):
        row = pose(pose_id)
        with Image.open(asset('img', row['原图'].split('/')[-1])) as source:
            img = ImageOps.exif_transpose(source).convert('RGBA')
            background = Image.new('RGBA', img.size, 'white')
            img = Image.alpha_composite(background, img).convert('RGB')
            width, height = img.size
            tensor = torch.from_numpy(np.asarray(img).astype(np.float32) / 255.0).unsqueeze(0)
        description = ' / '.join(row.get(k, '') for k in ('体系', '分类', '姿势名称', '角度') if row.get(k))
        return (tensor, width, height, pose_id, description)

class RandomPoseGallery(PoseGallery):
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"origin": (["all", "builtin", "user"], {"default": "all",
                    "tooltip": "随机来源：全部 / 内置 / 自定义。Random source: all / built-in / custom."})},
                "optional": {"language": (["zh", "en"], {"default": "zh",
                    "tooltip": "新节点界面与提示语言；数据输出沿用原节点。UI/error language; data outputs retain the original node's semantics."})}}

    FUNCTION = "load_random"
    DESCRIPTION = "每次运行工作流时，从可用姿态原图中自动随机抽取一张；保留原节点的5个输出。"

    @classmethod
    def _candidates(cls, origin="all", language="zh"):
        if origin not in ("all", "builtin", "user"):
            raise ValueError("Invalid random source" if language == "en" else "无效的随机来源")
        available = []
        # records() validates registration and canonical paths once for the whole pool.
        # Resolve against the correct root here to avoid reloading the entire index per file.
        for row in records():
            if origin != "all" and row["origin"] != origin:
                continue
            root = _random_catalog.USER_LIBRARY if row["origin"] == "user" else _random_catalog.LIBRARY
            target = (root / row['原图']).resolve()
            if not target.is_relative_to(root):
                raise ValueError("Original image path escapes the library" if language == "en" else "原图路径越出图库目录")
            if target.is_file():
                available.append(row)
        if not available:
            raise ValueError("No available originals in this source. Install the library, upload a reference, or change the source."
                             if language == "en" else "当前来源没有可用姿态原图，请安装素材库、上传参考图或切换来源。")
        return available

    @classmethod
    def VALIDATE_INPUTS(cls, origin="all", language="zh"):
        try:
            cls._candidates(origin, language)
        except (ValueError, OSError) as exc:
            return str(exc)
        return True

    @classmethod
    def IS_CHANGED(cls, origin="all", language="zh"):
        # Re-execute for every queued prompt; the fingerprint is JSON-safe.
        return uuid.uuid4().hex

    def load_random(self, origin="all", language="zh"):
        selected = random.choice(self._candidates(origin, language))
        result = super().load_pose(selected["id"])
        if selected["origin"] == "user":
            name = selected["name_en"] if language == "en" else selected["name_zh"]
        else:
            name = selected.get("姿势名称") or selected.get("title") or selected.get("分类") or selected["id"]
        return {"ui": {"pose_id": [result[3]], "name": [name]}, "result": result}


routes = PromptServer.instance.routes

@routes.get('/pose_gallery/catalog')
async def catalog_route(request):
    try:
        return web.json_response(records())
    except (ValueError, FileNotFoundError) as exc:
        return web.json_response({'error': str(exc)}, status=503)

@routes.get('/pose_gallery/assets/{kind}/{filename}')
async def asset_route(request):
    try:
        path = asset(request.match_info['kind'], request.match_info['filename'])
        return web.FileResponse(path, headers={'Cache-Control': 'private, max-age=3600'})
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


NODE_CLASS_MAPPINGS = {"PoseGallery": PoseGallery, "RandomPoseGallery": RandomPoseGallery}
NODE_DISPLAY_NAME_MAPPINGS = {'PoseGallery': 'Pose Gallery 姿势图库', 'RandomPoseGallery': 'Random Pose Gallery 随机姿势图库'}
WEB_DIRECTORY = './web'
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

@routes.get('/pose_gallery/ui/{filename}')
async def ui_route(request):
    name=request.match_info['filename']
    if name not in ('custom_upload.mjs', 'custom_upload.css'):
        raise web.HTTPNotFound()
    return web.FileResponse(ROOT / 'web' / name, headers={'Cache-Control':'no-cache'})
