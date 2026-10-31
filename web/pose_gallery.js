import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
  name: "comfyui-pose-gallery.browser",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PoseGallery") return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      created?.apply(this, arguments);
      const node = this;
      const value = node.widgets.find(w => w.name === "pose_id");
      let dialog, frame;
      const close = () => {
        window.removeEventListener("message", receive);
        dialog?.remove(); dialog = null; frame = null;
      };
      const previewBox = document.createElement("div");
      previewBox.style.cssText = "position:relative;width:100%;height:100%;background:#f8f7f3;border-radius:8px;overflow:hidden;";
      const preview = document.createElement("img");
      preview.alt = "所选姿势预览";
      preview.style.cssText = "display:block;width:100%;height:100%;object-fit:contain;";
      const previewError = document.createElement("div");
      previewError.setAttribute("role", "status");
      previewError.setAttribute("aria-live", "polite");
      previewError.style.cssText = "display:none;position:absolute;inset:16px;place-items:center;color:#8b2e2e;font:14px/1.6 sans-serif;text-align:left;overflow-wrap:anywhere;";
      previewBox.append(preview, previewError);
      let previewRequest = 0;
      const update = () => {
        const request = ++previewRequest;
        const poseId = String(value.value);
        preview.style.display = "block";
        previewError.style.display = "none";
        preview.onload = () => {
          if (request !== previewRequest) return;
          preview.style.display = "block";
          previewError.style.display = "none";
        };
        preview.onerror = () => {
          if (request !== previewRequest) return;
          preview.style.display = "none";
          previewError.textContent = `原图加载失败：library/img/${poseId}.png。请在节点目录执行 git pull 更新完整图库，重启 ComfyUI 后刷新浏览器。若使用自定义图库目录，请确认该目录包含对应原图。`;
          previewError.style.display = "grid";
        };
        preview.src = api.apiURL(`/pose_gallery/assets/img/${encodeURIComponent(poseId)}.png`);
        preview.title = poseId;
      };
      const previousCallback = value.callback;
      value.callback = function () { previousCallback?.apply(this, arguments); update(); };
      const receive = event => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
        if (event.data?.type === "pose-gallery-ready") {
          frame.contentWindow.postMessage({ type: "pose-gallery-current", id: value.value }, location.origin);
        }
        if (event.data?.type !== "pose-gallery-select" || typeof event.data.id !== "string") return;
        value.value = event.data.id;
        value.callback?.(value.value);
        node.setDirtyCanvas(true, true);
        app.graph.change();
        close();
      };
      const browse = document.createElement("button");
      browse.type = "button"; browse.textContent = "浏览姿势图库 · 搜索 / 分类 / 多视角";
      browse.style.cssText = "width:100%;height:36px;border:1px solid #bac9bd;border-radius:6px;background:#e9efe9;color:#253c32;cursor:pointer;font:12px sans-serif;";
      browse.addEventListener("click", () => {
        if (dialog) return;
        dialog = document.createElement("dialog");
        dialog.style.cssText = "width:96vw;height:94vh;max-width:1800px;max-height:96vh;padding:0;border:1px solid #777;border-radius:12px;background:#f7f5ef;";
        const header = document.createElement("div");
        header.style.cssText = "height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#e9efe9;color:#253c32;font:14px sans-serif;";
        const label = document.createElement("strong"); label.textContent = "Pose Gallery · 选择姿势和视角后，点击「使用此姿势」";
        const done = document.createElement("button"); done.textContent = "关闭";
        done.style.cssText = "cursor:pointer;padding:6px 16px;border-radius:6px;border:1px solid #bac9bd;background:white;color:#253c32;";
        done.onclick = close; header.append(label, done);
        frame = document.createElement("iframe");
        frame.src = api.apiURL("/pose_gallery/gallery");
        frame.title = "人体姿势参考图库";
        frame.style.cssText = "width:100%;height:calc(100% - 48px);border:0;";
        dialog.append(header, frame);
        window.addEventListener("message", receive);
        dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
        dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
        document.body.append(dialog); dialog.showModal();
      });
      const toolbar = document.createElement("div"); toolbar.style.cssText = "width:100%;height:42px;display:flex;align-items:center;";
      toolbar.append(browse);
      node.addDOMWidget("pose_browser", "button", toolbar, { serialize:false, hideOnZoom:false, getMinHeight:()=>42, getMaxHeight:()=>42 });
      node.addDOMWidget("pose_preview", "image", previewBox, { serialize: false, hideOnZoom: false, getMinHeight: () => 300, getMaxHeight: () => 500 });
      const configured = node.onConfigure;
      node.onConfigure = function () { configured?.apply(this, arguments); update(); };
      const removed = node.onRemoved;
      node.onRemoved = function () { close(); removed?.apply(this, arguments); };
      node.setSize([360, 510]); update();
    };
  },
});
