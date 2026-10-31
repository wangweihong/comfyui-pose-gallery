"""comfyui-pose-gallery: browse local pose references and output an IMAGE."""
import asyncio
import logging
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


NODE_CLASS_MAPPINGS = {'PoseGallery': PoseGallery}
NODE_DISPLAY_NAME_MAPPINGS = {'PoseGallery': 'Pose Gallery 姿势图库'}
WEB_DIRECTORY = './web'
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS', 'WEB_DIRECTORY']

@routes.get('/pose_gallery/ui/{filename}')
async def ui_route(request):
    name=request.match_info['filename']
    if name not in ('custom_upload.mjs', 'custom_upload.css'):
        raise web.HTTPNotFound()
    return web.FileResponse(ROOT / 'web' / name, headers={'Cache-Control':'no-cache'})
