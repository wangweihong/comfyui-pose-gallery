import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import "./i18n.mjs";

app.registerExtension({
  name: "comfyui-pose-gallery.browser",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "PoseGallery") return;
    const created = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      created?.apply(this, arguments);
      const node = this;
      const value = node.widgets.find(w => w.name === "pose_id");
      const I = window.PoseGalleryI18n;
      const languageWidget = node.widgets.find(w => w.name === 'language');
      let language = I.preferred(), imageFailed = false;
      const t = (source, values) => I.translate(source, language, values);
      let dialog, frame, dialogLabel, done;
      const close = () => {
        window.removeEventListener("message", receive);
        dialog?.remove(); dialog = null; frame = null;
      };
      const previewBox = document.createElement("div");
      previewBox.style.cssText = "position:relative;width:100%;height:100%;background:#f8f7f3;border-radius:8px;overflow:hidden;";
      const preview = document.createElement("img");
      preview.alt = t("所选姿势预览");
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
        imageFailed = false;
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
          imageFailed = true;
          renderLanguage();
          previewError.style.display = "grid";
        };
        preview.src = api.apiURL(`/pose_gallery/assets/img/${encodeURIComponent(poseId)}.png`);
        preview.title = poseId;
      };
      const previousCallback = value.callback;
      value.callback = function () { previousCallback?.apply(this, arguments); update(); };
      const receive = event => {
        if (event.origin !== location.origin || event.source !== frame?.contentWindow) return;
        if (event.data?.type === "pose-gallery-language" && ['zh','en'].includes(event.data.language)) {
          setLanguage(event.data.language);
        }
        if (event.data?.type === "pose-gallery-ready") {
          frame.contentWindow.postMessage({ type: "pose-gallery-current", id: value.value }, location.origin);
        }
        if (event.data?.type === "pose-gallery-library-changed") {
          update();
        }
        if (event.data?.type !== "pose-gallery-select" || typeof event.data.id !== "string") return;
        value.value = event.data.id;
        value.callback?.(value.value);
        node.setDirtyCanvas(true, true);
        app.graph.change();
        close();
      };
      const browse = document.createElement("button");
      browse.type = "button"; browse.textContent = t("浏览姿势图库 · 搜索 / 分类 / 多视角");
      browse.style.cssText = "width:100%;height:36px;border:1px solid #bac9bd;border-radius:6px;background:#e9efe9;color:#253c32;cursor:pointer;font:12px sans-serif;";
      browse.addEventListener("click", () => {
        if (dialog) return;
        renderLanguage();
        dialog = document.createElement("dialog");
        dialog.style.cssText = "width:96vw;height:94vh;max-width:1800px;max-height:96vh;padding:0;border:1px solid #777;border-radius:12px;background:#f7f5ef;";
        const header = document.createElement("div");
        header.style.cssText = "height:48px;display:flex;align-items:center;justify-content:space-between;padding:0 20px;background:#e9efe9;color:#253c32;font:14px sans-serif;";
        const label = dialogLabel = document.createElement("strong"); label.textContent = t("Pose Gallery · 选择姿势和视角后，点击「使用此姿势」");
        done = document.createElement("button"); done.textContent = t("关闭");
        done.style.cssText = "cursor:pointer;padding:6px 16px;border-radius:6px;border:1px solid #bac9bd;background:white;color:#253c32;";
        done.onclick = close; header.append(label, done);
        frame = document.createElement("iframe");
        frame.src = api.apiURL(`/pose_gallery/gallery?lang=${language}`);
        frame.title = t("人体姿势参考图库");
        frame.style.cssText = "width:100%;height:calc(100% - 48px);border:0;";
        dialog.append(header, frame);
        window.addEventListener("message", receive);
        dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
        dialog.addEventListener("click", event => { if (event.target === dialog) close(); });
        document.body.append(dialog); dialog.showModal();
      });
      function renderLanguage() {
        preview.alt = t('所选姿势预览');
        if(languageWidget) {languageWidget.value = language; languageWidget.label = t('界面与输出语言');}
        value.label = t('姿态编号');
        const labels = ['图像','宽度','高度','姿态编号','描述','动作'];
        node.outputs?.forEach((output,index) => {output.label = t(labels[index] || output.name);});
        browse.textContent = t('浏览姿势图库 · 搜索 / 分类 / 多视角');
        if(dialogLabel) dialogLabel.textContent = t('Pose Gallery · 选择姿势和视角后，点击「使用此姿势」');
        if(done) done.textContent = t('关闭');
        if(frame) frame.title = t('人体姿势参考图库');
        if(imageFailed) previewError.textContent = t('原图加载失败：library/img/{id}.png。请在节点目录执行 git pull 更新完整图库，重启 ComfyUI 后刷新浏览器。若使用自定义图库目录，请确认该目录包含对应原图。', {id:String(value.value)}) + (language === 'en' ? ' If you removed this asset, cancel its rule in the asset manager before manually reinstalling it.' : ' 若曾清理此素材，请先在素材管理中取消规则，再手动补回文件。');
        if(['PoseGallery','Pose Gallery','Pose Gallery 姿势图库'].includes(node.title)) node.title = language === 'en' ? 'Pose Gallery' : 'Pose Gallery 姿势图库';
        node.setDirtyCanvas(true, true);
      }
      function setLanguage(next) {
        const previous = language;
        language = I.normalize(next);
        try { window.localStorage.setItem('gallery-upload-language', language); } catch {}
        renderLanguage();
        if(previous !== language) app.graph.change();
      }
      if(languageWidget) {
        const previous = languageWidget.callback;
        languageWidget.callback = function(next) {previous?.apply(this, arguments); setLanguage(next);};
      }
      const toolbar = document.createElement("div"); toolbar.style.cssText = "width:100%;height:42px;display:flex;align-items:center;";
      toolbar.append(browse);
      node.addDOMWidget("pose_browser", "button", toolbar, { serialize:false, hideOnZoom:false, getMinHeight:()=>42, getMaxHeight:()=>42 });
      node.addDOMWidget("pose_preview", "image", previewBox, { serialize: false, hideOnZoom: false, getMinHeight: () => 300, getMaxHeight: () => 500 });
      const configured = node.onConfigure;
      node.onConfigure = function (config) {
        configured?.apply(this, arguments);
        if(node.outputs?.length === 5 && !node.outputs.some(output => output.name === 'action')) node.addOutput('action', 'STRING');
        const saved = config?.widgets_values?.[1];
        if(saved === 'zh' || saved === 'en') language = saved;
        renderLanguage(); update();
      };
      const removed = node.onRemoved;
      node.onRemoved = function () { close(); removed?.apply(this, arguments); };
      node.setSize([360, 540]); renderLanguage(); update();
    };
  },
});
