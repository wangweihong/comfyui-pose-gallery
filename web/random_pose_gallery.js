import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import "./i18n.mjs";
import "./random_i18n.mjs";

// Preview-name restoration must not depend on the version of the shared UI module.
// Start inside a promise so failures cannot escape onConfigure and abort graph loading.
let previewCatalogPromise;
function loadPreviewCatalog() {
  if (!previewCatalogPromise) {
    previewCatalogPromise = Promise.resolve()
      .then(() => fetch(api.apiURL('/pose_gallery/catalog')))
      .then(response => {
        if (!response.ok) throw new Error('Cannot load preview names');
        return response.json();
      })
      .then(rows => {
        if (!Array.isArray(rows)) throw new Error('Invalid preview catalog');
        return rows;
      })
      .catch(error => { previewCatalogPromise = null; throw error; });
  }
  return previewCatalogPromise;
}

app.registerExtension({
  name:'comfyui-pose-gallery.random-preview',
  async beforeRegisterNodeDef(nodeType,nodeData){
    if(nodeData.name!=='RandomPoseGallery')return;
    const created=nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated=function(){
      created?.apply(this,arguments);
      const node=this,I=window.RandomPoseI18n,shared=window.PoseGalleryI18n;
      const langWidget=node.widgets.find(w=>w.name==='language');
      const originWidget=node.widgets.find(w=>w.name==='origin');
      let language=I.preferred(),lastId='',lastName='',lastNames={},imageFailed=false,removed=false,imageVersion=0;
      node.properties??={};
      if(langWidget)langWidget.value=language;
      const t=source=>I.translate(source,language);
      const selectors = ['origin','pose_system','angle'].map(name => {
        const widget = node.widgets.find(w => w.name === name);
        return widget ? {widget, values:[...(widget.options?.values || [])]} : null;
      }).filter(Boolean);
      function localizeSelectors() {
        selectors.forEach(({widget,values}) => {
          const canonical = values.find(value => value === widget.value || shared.translate(value,'en') === widget.value) ?? widget.value;
          // Source IDs are already English and remain serialized as all/builtin/user.
          if(widget.name === 'origin') return;
          widget.options.values = values.map(value => value === 'all' ? value : t(value));
          widget.value = canonical === 'all' ? canonical : t(canonical);
          widget.serializeValue = () => values.find(value => value === widget.value || shared.translate(value,'en') === widget.value) ?? widget.value;
        });
      }
      const box=document.createElement('div');box.style.cssText='display:flex;flex-direction:column;gap:8px;width:100%;height:100%;background:#f7f5f0;color:#343c2d;border-radius:8px;padding:10px;box-sizing:border-box;';
      const image=document.createElement('img');image.alt=t('本次随机姿态预览');image.style.cssText='display:none;width:100%;flex:1;min-height:0;object-fit:contain;';
      const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='font:12px/1.6 sans-serif;overflow-wrap:anywhere;margin:0;';
      const id=document.createElement('code');id.style.cssText='font:11px/1.5 monospace;overflow-wrap:anywhere;';
      box.append(image,status,id);
      const toggle=document.createElement('button');toggle.type='button';toggle.style.cssText='width:100%;height:36px;border:1px solid #b6c1aa;background:#e9ecdf;color:#343c2d;border-radius:6px;cursor:pointer;font:12px sans-serif;';
      function render(){
        localizeSelectors();
        status.textContent=imageFailed?t('随机姿态预览加载失败，请检查素材原图。'):lastId?(t('上次运行结果')+((lastNames[language]||t(lastName))?' · '+(lastNames[language]||t(lastName)):'')):t('运行工作流后自动抽取姿态');
        id.textContent=lastId;
        image.alt=t('本次随机姿态预览');
        toggle.textContent=language==='en'?'中文':'English';
        toggle.setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');
        if(langWidget)langWidget.label=t('界面与输出语言');
        if(originWidget)originWidget.label=t('随机来源');
        const pose_systemWidget=node.widgets.find(w=>w.name==='pose_system');if(pose_systemWidget)pose_systemWidget.label=t('姿态体系');
        const angleWidget=node.widgets.find(w=>w.name==='angle');if(angleWidget)angleWidget.label=t('姿态视角');
        const labels=["图像", "宽度", "高度", "姿态编号", "描述", "动作"];
        node.outputs?.forEach((output,i)=>{output.label=t(labels[i]||output.name);});
        if(['RandomPoseGallery','Random Pose Gallery','Random Pose Gallery 随机姿势图库'].includes(node.title))node.title=language==='en'?'Random Pose Gallery':'Random Pose Gallery 随机姿势图库';
        node.setDirtyCanvas(true,true);
      }
      function setLanguage(value){language=I.normalize(value);I.persist(language);if(langWidget)langWidget.value=language;render();}
      function showResult(value,name='',names={}){
        if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))return false;
        lastId=value;lastName=typeof name==='string'?name:'';lastNames=names;imageFailed=false;
        node.properties.last_pose_id=lastId;node.properties.last_pose_name=lastName;node.properties.last_pose_names=lastNames;
        const token=++imageVersion;
        image.onload=()=>{if(!removed&&token===imageVersion){image.style.display='block';imageFailed=false;render();}};
        image.onerror=()=>{if(!removed&&token===imageVersion){image.style.display='none';imageFailed=true;render();}};
        image.src=api.apiURL(`/pose_gallery/assets/img/${encodeURIComponent(lastId)}.png`);image.title=lastId;render();
        // Older saved workflows contain only the Chinese preview name.
        if(!lastNames.en && typeof fetch === 'function') {
          const requestedId = lastId;
          loadPreviewCatalog().then(rows => {
            if(removed || requestedId !== lastId) return;
            const row = rows.find(item => item.id === requestedId);
            if(row) {
              lastNames = {zh:row.name_zh || row.姿势名称, en:row.name_en};
              node.properties.last_pose_names = lastNames;
              render();
            }
          }).catch(() => {});
        }
        return true;
      }
      toggle.onclick=()=>{setLanguage(language==='en'?'zh':'en');app.graph.change();};
      if(langWidget){const previous=langWidget.callback;langWidget.callback=function(value){previous?.apply(this,arguments);setLanguage(value);app.graph.change();};}
      node.addDOMWidget('random_language','button',toggle,{serialize:false,hideOnZoom:false,getMinHeight:()=>40,getMaxHeight:()=>40});
      node.addDOMWidget('random_pose_preview','image',box,{serialize:false,hideOnZoom:false,getMinHeight:()=>310,getMaxHeight:()=>500});
      const executed=node.onExecuted;node.onExecuted=function(message){
        executed?.apply(this,arguments);if(removed)return;
        if(showResult(message?.pose_id?.[0],message?.name?.[0],{zh:message?.name_zh?.[0],en:message?.name_en?.[0]}))app.graph.change();
      };
      const configured=node.onConfigure;node.onConfigure=function(config){
        configured?.apply(this,arguments);
        if(node.outputs?.length===5&&!node.outputs.some(output=>output.name==='action'))node.addOutput('action','STRING');
        setLanguage(config?.widgets_values?.[1]);
        if(node.properties.last_pose_id)showResult(node.properties.last_pose_id,node.properties.last_pose_name,node.properties.last_pose_names);
      };
      const originalRemoved=node.onRemoved;node.onRemoved=function(){removed=true;imageVersion++;originalRemoved?.apply(this,arguments);};
      node.setSize([420,565]);render();
    };
  },
});
