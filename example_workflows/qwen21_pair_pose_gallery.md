# Qwen Image 2.1 · 双人姿态编辑

导入 [`02_QwenImage2.1_PoseGallery_双人姿态编辑实测.json`](02_QwenImage2.1_PoseGallery_双人姿态编辑实测.json)，API 格式为同名 `.api.json`。画布 JSON 按本机已保存文件原样收录，提示词、参数、节点和连线均未改动。

## 使用

1. 将 `assets/` 下的 [`qwen21_clay_adult_full_body_clothed.png`](assets/qwen21_clay_adult_full_body_clothed.png) 和 [`pose_gallery_person_reference.png`](assets/pose_gallery_person_reference.png) 复制到 `ComfyUI/input/`，或在两个 Load Image 节点中选择自己的参考图。
2. 在模型节点中按本机目录重选 Qwen Image 2.1、Qwen3-VL 8B、Qwen Image 2.1 VAE 和 **QI2.1 专用 Pose Studio v2 LoRA**。路径及依赖见[现有 Qwen 使用说明](qwen21_pose_gallery.md)。
3. Pose Gallery 默认选择 `pair60_P050_front`；可浏览双人姿态并更换。使用本仓库 Pose Gallery 与 ComfyUI 原生 Qwen Image 2.1 节点，不需要 VNCCS 3D 编辑节点。
4. 核对提示词中的图号后手动运行。成图保存到 `ComfyUI/output/images/qwen2.1/pose_gallery/results/pose_edit_*.png`。

实际图像连接顺序：

| 编码器输入 | 来源 |
| --- | --- |
| `images.image_1`（图1） | Pose Gallery 双人姿势线稿 |
| `images.image_2`（图2） | Load Image 节点 101：`qwen21_clay_adult_full_body_clothed.png` |
| `images.image_3`（图3） | Load Image 节点 1：`pose_gallery_person_reference.png` |

原样保留的提示词：

```text
用图2人物替换图1左边的模型，用图2的人物替换图1右边的模型
```

这份提示词的左右两人都引用图2，虽然图3已经接入，但文字没有明确分配图3。如果需要分别使用两位参考人物，可自行把右边人物改为引用图3；仓库文件保持你保存时的配置。

25 步、CFG 1、Euler/simple、denoise 1，种子 20261029；Pose Studio LoRA 强度 1，编码器 resolution 1024，负向提示词为空。

画布中的 MarkdownNote 沿用了旧单人工作流说明，其“两图输入”“双人未覆盖”和原单人实测记录不代表本双人配置的验证情况。本次收录只核对 JSON、14 条连线、模型节点、图像顺序与素材依赖，没有重新运行生图；双人身份分配、遮挡和接触部位效果需查看实际输出。

## English

Import the [saved UI workflow](02_QwenImage2.1_PoseGallery_双人姿态编辑实测.json), or use its matching `.api.json` with the ComfyUI API. The UI file is an unchanged copy of the locally saved workflow.

Copy both linked reference images from `assets/` into `ComfyUI/input/`, or select your own images in the two Load Image nodes. Reselect local model paths using the [existing model guide](qwen21_pose_gallery.md). This uses the gallery and native Qwen Image 2.1 nodes; VNCCS 3D editor nodes are not required.

Image 1 is the two-person pose (`pair60_P050_front`); image 2 comes from node 101; image 3 comes from node 1. The saved Chinese prompt explicitly assigns **image 2 to both people**. To assign separate references, edit the right-person instruction to refer to image 3 yourself. This repository preserves the original prompt and connections.

Settings: 25 steps, CFG 1, Euler/simple, denoise 1, seed 20261029, QI2.1 Pose Studio v2 LoRA strength 1, encoder resolution 1024. Output prefix: `images/qwen2.1/pose_gallery/results/pose_edit` under ComfyUI output.

The embedded note comes from an older single-person example. This addition validates file structure, all 14 links and input assets; it does not include a new generation test or establish two-person editing accuracy.
