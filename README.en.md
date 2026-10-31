# comfyui-pose-gallery

[简体中文](README.md) · **English**

A local pose reference gallery for ComfyUI. Built-in assets, existing IDs and the node's 5 outputs remain compatible with existing workflows. See the [Chinese README](README.md) for the original dataset, examples, model configurations and source notices.

## Install and browse

Clone `https://github.com/wangweihong/comfyui-pose-gallery.git` inside `ComfyUI/custom_nodes/`, keep its bundled `library/`, restart ComfyUI and refresh the browser. Dependencies use ComfyUI's Pillow, NumPy, PyTorch and aiohttp; uploads require no generation model. Add **image → Pose Gallery**, open its Browse button, inspect an image and click Use to write it back. Browsing or selecting never queues a workflow.

## Upload one custom pose

1. Click **Upload pose** in the standalone gallery or the gallery opened from a node. The new upload controls provide a Chinese / English selector; legacy built-in browsing labels remain Chinese.
2. Choose one finished reference image, inspect the preview and enter a name. The other-language name is optional; if omitted, the supplied name is reused without inventing a translation.
3. Click **Save to gallery**. Success selects the Custom source, clears existing filters and opens the new image viewer.
4. Click Use in the image viewer to update the current node. Uploading and selecting do not run the workflow.

Built-in multi-view groups are preserved. Each upload is an independent single-image group; additional views are not generated. Category and view are optional and default to Unspecified.

Static PNG, JPEG and WebP are supported, one image at a time, up to **20 MiB and 32 megapixels**. The server validates actual content and rejects animation, damaged images and paths outside the library. Full images are normalized to PNG while preserving dimensions and transparency. WebP previews fit within 800×1000 and thumbnails within 400×500, without stretching. Node IMAGE outputs composite transparency onto white. **Import does not extract a subject, remove backgrounds or edit people.** This version does not include batch import, editing or deletion.

## Persistent user library

Custom assets are stored at **`ComfyUI/user/pose_gallery/`**, independently of node code and built-in assets. Node upgrades do not overwrite this directory; back it up separately.

- `data/custom.json` stores stable `u-` + UUID IDs, user-entered names, classifications, original filename, dimensions, upload time and checksum.
- img/ (PNG), preview/ (WebP), thumbs/ (WebP) contain full images, previews and thumbnails with matching IDs.
- Set `COMFYUI_POSE_GALLERY_USER_LIBRARY` to override storage with a persistent writable directory visible inside the container/environment.
- Clients of this single-machine ComfyUI service share the library; no account or multi-user permissions are added.

**All sources / Built-in / Custom** filters have separate counts. Custom uploads remain available when the built-in index is missing. Custom `pose_id` values use the new stable IDs; source_id metadata is empty. Existing 5 outputs and original IDs stay compatible.

## API and verification

`POST /pose_gallery/upload` accepts multipart `image`, `name`, optional `other_name` and `language` (zh/en). Pose metadata: optional category and angle (unknown/front/top/bottom/side/diagonal). HTTP201 returns a record and refreshed catalog with records and meta. Failures return JSON error codes; index writes are locked and atomic, and incomplete new files are rolled back. Existing `GET /pose_gallery/catalog` retains its array response with origin=builtin/user. `GET /pose_gallery/meta` reports counts and a missing built-in library. Asset reads remain restricted to registered paths.

```bash
python3 -m unittest discover -s tests -v
node --check web/custom_upload.mjs
```

![Upload preview and bilingual names](docs/custom-upload-form.png)

![Custom reference viewer](docs/custom-upload-selected.png)

Independent program code retains its existing license. Built-in images and source data retain their original terms; consult the source and license notices linked from the [Chinese README](README.md). Custom uploads are not attributed to the built-in dataset.
