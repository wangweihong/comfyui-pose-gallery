# comfyui-pose-gallery

[简体中文](README.md) · **English**

A local pose reference gallery for ComfyUI. Built-in assets, existing IDs and the node's 5 outputs remain compatible with existing workflows. See the [Chinese README](README.md) for the original dataset, examples, model configurations and source notices.


## Automatic random selection: a separate node

Add **image → Pose Gallery → Random Pose Gallery**, connect `image` to your workflow or Preview Image, and run. Each execution draws a new reference automatically. Set `origin` to `all`, `builtin` or `user`. Pose sampling uses individual view records and never fabricates additional angles.

The original **PoseGallery** keeps its required input, fixed-selection behavior and 5 output sockets, and adds an optional `language` input (older workflows default to `zh`). The new node uses those same outputs for one actual selected image and displays its executed ID and preview. Both nodes append a sixth `action` STRING output, containing only the pose name with `·` / `・` separators replaced by commas (no added spaces). For example: `Deep kneeling backbend,Holding both heels`. System, category and view metadata are excluded. Existing output indices 0–4 are unchanged. Both nodes use `language` for UI labels, `action`, and the `description` output: `en` returns the English system, category, pose name and view; `zh` returns the Chinese description. Other outputs are unchanged. The fixed node synchronizes its language input with the gallery selector and saves it in the workflow. Run again after switching languages to refresh the output. Custom references use the supplied name for that language; untranslated custom text retains its original value.

Draws may repeat by chance and are independent of gallery filters. Missing originals are skipped; an empty usable source raises a clear error. Saved preview IDs never freeze future draws. To keep a result, copy `pose_id` into the original selector. The random node does not enqueue or start tasks itself.

Import [the random pose preview example](example_workflows/random_pose_preview.json); a matching API graph is included.

Random Pose also accepts optional `pose_system` and `angle` filters. Random Portrait accepts `section` (`face` / `styling` / `custom`). Filters default to `all`, preserving existing random workflows.

![Separate random node in ComfyUI](docs/random-node.png)


## Z-Image-Turbo depth-control tests

The [workflows and illustrated report](example_workflows/z_image_turbo_pose_gallery.md) adapt issue #2 using locally available **Union 2.1 2602 8steps**, rather than the original Union v1. Two UI/API pairs cover strengths 0.8 and 0.65, with 8 steps and CFG 1. Four actual runs include standing, kneeling, disabled control and lower strength. Control affects the pose, but results show blank-face artifacts or limb/hand mismatches; lowering strength improves realism while weakening pose accuracy. No matched MOSS comparison was run.

## Qwen Image 2.1 two-person pose editing

The [saved two-person workflow](example_workflows/02_QwenImage2.1_PoseGallery_双人姿态编辑实测.json) includes two character inputs and a gallery pose. See the [bilingual guide](example_workflows/qwen21_pair_pose_gallery.md) for input order, bundled assets and the original prompt, which currently assigns image 2 to both people. A matching API graph is included. This addition checks structure and assets without a new generation test.

## Qwen Image 2.1 gallery workflows

The obsolete workflow examples have been replaced and renamed to describe their actual behavior.

- [01 · Face/outfit replacement followed by pose editing](example_workflows/01_QwenImage2.1_换脸换装与姿态编辑_两阶段.json) ([API](example_workflows/01_QwenImage2.1_换脸换装与姿态编辑_两阶段.api.json)): requires the pose, portrait and costume galleries. Stage two uses pose image 1 and the decoded stage-one person image 2, with a dedicated PoseStudio QI2.1 v2 model-only LoRA branch at strength 1.

Copy the [bundled person PNG](example_workflows/assets/h3_bfs_original_teal_character_20261014.png) to `ComfyUI/input/`, or select your own image. Re-select model paths locally. Both use 25 steps, CFG 1, Euler/simple and seed 2026103002; 01 runs this twice. The full two-stage workflow was tested successfully, and its stage-one RGB pixels matched the pre-repair output exactly. The current P003 pose follows the rear three-quarter turn, over-shoulder look and hand-on-waist placement. Other poses and fine details remain subject to visual review. See the [dependency and input-order guide](example_workflows/qwen21_gallery_workflows.md).

## Install and browse

Clone `https://github.com/wangweihong/comfyui-pose-gallery.git` inside `ComfyUI/custom_nodes/`, keep its bundled `library/`, restart ComfyUI and refresh the browser. Dependencies use ComfyUI's Pillow, NumPy, PyTorch and aiohttp; uploads require no generation model. Add **image → Pose Gallery**, open its Browse button, inspect an image and click Use to write it back. Browsing or selecting never queues a workflow.

## Upload one custom pose

1. Click **Upload pose** in the standalone gallery or the gallery opened from a node. The Chinese / English selector controls the whole gallery, including systems, categories, views, all 288 pose groups, details, help, and uploads. Switching preserves filters and the selected pose/view, and the language is remembered for the next visit.
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
node --test tests/test_random_frontend.cjs
```

![Upload preview and bilingual names](docs/custom-upload-form.png)

![Custom reference viewer](docs/custom-upload-selected.png)

Independent program code retains its existing license. Built-in images and source data retain their original terms; consult the source and license notices linked from the [Chinese README](README.md). Custom uploads are not attributed to the built-in dataset.

## Anima example workflow

The [UI workflow](example_workflows/pose_gallery_anima_lllite_v2.json) and [API workflow](example_workflows/pose_gallery_anima_lllite_v2.api.json) now use the saved workflow `7e7b00cd-133b-4b2f-8212-1ee3d87338ea`: Miaomiao Harem Anima 1.1, 30 steps, CFG 4, ER-SDE/simple, LLLite strength 1 over 0–0.9. The gallery’s English `action` output feeds Show Text and Concatenate Text before positive text encoding. Install `comfyui_LLM_party` for Show Text. The random gallery and control-image saver remain bypassed as in the source. Model choices, prompts, links, layout and sampling settings are preserved. The original base prompt still contains a fixed action phrase; edit it in Concatenate Text when changing poses.

The eight older result comparisons document the previous Anima Base v1 workflow (strength 0.75); they are historical evidence for that version. See the [usage and dependency notes](example_workflows/anima_pose_gallery.md).
