import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import "./i18n.mjs";
import "./random_i18n.mjs?v=dice-labels-20261104-2";

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
      const poseWidget=node.widgets.find(w=>w.name==='pose_id');
      const lockWidget=node.widgets.find(w=>w.name==='locked');
      let language=I.preferred(),lastId='',lastName='',lastNames={},imageFailed=false,removed=false,imageVersion=0;
      let drawing=false,drawVersion=0,drawError='';
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
      const box=document.createElement('div');box.style.cssText='display:flex;flex-direction:column;gap:8px;width:100%;height:100%;min-height:310px;max-height:500px;contain:size;overflow:hidden;background:#f7f5f0;color:#343c2d;border-radius:8px;padding:10px;box-sizing:border-box;';
      const image=document.createElement('img');image.alt=t('本次随机姿态预览');image.style.cssText='display:none;width:100%;height:0;flex:1 1 0;min-height:0;min-width:0;object-fit:contain;';
      const status=document.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='flex-shrink:0;font:12px/1.6 sans-serif;overflow-wrap:anywhere;margin:0;';
      const id=document.createElement('code');id.style.cssText='flex-shrink:0;font:11px/1.5 monospace;overflow-wrap:anywhere;';
      box.append(image,status,id);
      const toggle=document.createElement('button');toggle.type='button';toggle.style.cssText='width:100%;height:36px;min-height:36px;flex-shrink:0;border:1px solid #b6c1aa;background:#e9ecdf;color:#343c2d;border-radius:6px;cursor:pointer;font:12px sans-serif;';
      const dice=document.createElement('button');dice.type='button';dice.style.cssText=toggle.style.cssText;
      const isLocked=()=>lockWidget?.value===true;
      function render(){
        localizeSelectors();
        status.textContent=drawError|| (drawing?t('正在抽取姿态…'):imageFailed?t('随机姿态预览加载失败，请检查素材原图。'):lastId?(lastNames[language]||t(lastName)):t('点击骰子预览，或运行工作流自动抽取姿态'));
        status.style.display=status.textContent?'block':'none';
        id.textContent=lastId;
        dice.textContent=t(isLocked()?'🔒 已锁定':'🎲 随机');
        dice.disabled=isLocked()||drawing;
        dice.title=t('仅更新此节点预览，不运行工作流');
        dice.setAttribute('aria-label',t('随机姿态'));
        image.alt=t('本次随机姿态预览');
        toggle.textContent=language==='en'?'中文':'English';
        toggle.setAttribute('aria-label',language==='en'?'切换到中文':'Switch to English');
        if(langWidget)langWidget.label=t('界面与输出语言');
        if(originWidget)originWidget.label=t('随机来源');
        if(poseWidget)poseWidget.label=t('当前姿态编号');
        if(lockWidget)lockWidget.label=t('🔒 锁定随机');
        const pose_systemWidget=node.widgets.find(w=>w.name==='pose_system');if(pose_systemWidget)pose_systemWidget.label=t('姿态体系');
        const angleWidget=node.widgets.find(w=>w.name==='angle');if(angleWidget)angleWidget.label=t('姿态视角');
        const tooltips={
          origin:'all：全部；builtin：内置；user：自定义。',
          language:'控制界面、description 和 action 输出语言，随工作流保存。',
          pose_id:'当前选择的姿态，锁定后运行工作流使用此图。',
          locked:'保持当前姿态并禁用骰子。',
        };
        node.widgets.forEach(widget=>{if(tooltips[widget.name])widget.tooltip=t(tooltips[widget.name]);});
        const labels=["图像", "宽度", "高度", "姿态编号", "描述", "动作"];
        node.outputs?.forEach((output,i)=>{output.label=t(labels[i]||output.name);});
        if(['RandomPoseGallery','Random Pose Gallery','Random Pose Gallery 随机姿势图库'].includes(node.title))node.title=language==='en'?'Random Pose Gallery':'Random Pose Gallery 随机姿势图库';
        node.setDirtyCanvas(true,true);
      }
      function setLanguage(value){language=I.normalize(value);I.persist(language);if(langWidget)langWidget.value=language;render();}
      function showResult(value,name='',names={}){
        if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(value))return false;
        lastId=value;lastName=typeof name==='string'?name:'';lastNames=names;imageFailed=false;
        if(poseWidget)poseWidget.value=lastId;
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
      function cancelDraw(){drawVersion++;drawing=false;drawError='';}
      dice.onclick=async()=>{
        if(removed||isLocked()||drawing)return;
        const version=++drawVersion;
        drawing=true;drawError='';render();
        const params=new URLSearchParams({language,exclude_id:lastId});
        for(const name of ['origin','pose_system','angle']){
          const widget=node.widgets.find(w=>w.name===name);
          params.set(name,widget?.serializeValue?widget.serializeValue():widget?.value??'all');
        }
        try{
          const response=await fetch(api.apiURL(`/pose_gallery/random?${params}`));
          const result=await response.json();
          if(removed||version!==drawVersion||isLocked())return;
          if(!response.ok)throw new Error(result.error||t('随机失败，请重试'));
          if(!showResult(result.pose_id,result.name,{zh:result.name_zh,en:result.name_en}))throw new Error(t('随机失败，请重试'));
          app.graph.change();
        }catch(error){
          if(!removed&&version===drawVersion&&!isLocked())drawError=t('随机失败，请重试')+' · '+error.message;
        }finally{
          if(!removed&&version===drawVersion){drawing=false;render();}
        }
      };
      if(lockWidget){const previous=lockWidget.callback;lockWidget.callback=function(value){
        previous?.apply(this,arguments);cancelDraw();
        lockWidget.value=value===true;
        if(isLocked()&&!lastId){lockWidget.value=false;drawError=t('请先点击骰子选择姿态，再锁定');}
        render();app.graph.change();
      };}
      if(poseWidget){const previous=poseWidget.callback;poseWidget.callback=function(value){
        previous?.apply(this,arguments);cancelDraw();
        if(!showResult(value)){poseWidget.value=lastId;drawError=t('无效的姿态编号');}
        render();app.graph.change();
      };}
      selectors.forEach(({widget})=>{const previous=widget.callback;widget.callback=function(){
        previous?.apply(this,arguments);cancelDraw();render();
      };});
      toggle.onclick=()=>{setLanguage(language==='en'?'zh':'en');app.graph.change();};
      if(langWidget){const previous=langWidget.callback;langWidget.callback=function(value){previous?.apply(this,arguments);setLanguage(value);app.graph.change();};}
      // Native widget types (e.g. button) replace this DOM in Nodes 2.0.
      node.addDOMWidget('random_language','pose_gallery_control',toggle,{serialize:false,hideOnZoom:false,getMinHeight:()=>40,getMaxHeight:()=>40});
      // Keep the existing language widget in place for saved workflows.
      const diceToolbar=document.createElement('div');diceToolbar.style.cssText='display:flex;align-items:center;width:100%;height:40px;min-height:40px;max-height:40px;';diceToolbar.append(dice);
      node.addDOMWidget('random_dice','pose_gallery_control',diceToolbar,{serialize:false,hideOnZoom:false,getMinHeight:()=>40,getMaxHeight:()=>40});
      node.addDOMWidget('random_pose_preview','pose_gallery_preview',box,{serialize:false,hideOnZoom:false,getMinHeight:()=>310,getMaxHeight:()=>500});
      const executed=node.onExecuted;node.onExecuted=function(message){
        executed?.apply(this,arguments);if(removed)return;
        // A result queued before the user locked a newer choice must not replace it.
        if(isLocked()&&message?.pose_id?.[0]!==poseWidget?.value)return;
        cancelDraw();
        if(showResult(message?.pose_id?.[0],message?.name?.[0],{zh:message?.name_zh?.[0],en:message?.name_en?.[0]}))app.graph.change();
      };
      const configured=node.onConfigure;node.onConfigure=function(config){
        configured?.apply(this,arguments);
        cancelDraw();
        if(node.outputs?.length===5&&!node.outputs.some(output=>output.name==='action'))node.addOutput('action','STRING');
        setLanguage(config?.widgets_values?.[1]);
        const savedId=poseWidget?.value||node.properties.last_pose_id;
        if(savedId)showResult(savedId,node.properties.last_pose_name,node.properties.last_pose_names);
        render();
      };
      const originalRemoved=node.onRemoved;node.onRemoved=function(){removed=true;imageVersion++;cancelDraw();originalRemoved?.apply(this,arguments);};
      node.setSize([420,665]);render();
    };
  },
});
