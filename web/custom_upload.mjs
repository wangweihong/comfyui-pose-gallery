/* Local single-image imports. This module never queues a ComfyUI prompt. */
(function () {
  'use strict';
  const words = {
    pose:['上传姿态','Upload pose'],portrait:['上传人像','Upload portrait'],costume:['上传服装','Upload costume'],
    all:['全部来源','All sources'],builtin:['内置','Built-in'],user:['自定义','Custom'],
    notice:['直接导入图片，不自动提取、去背景或修改人物。','Images are imported directly; extraction, background removal, and character editing are not performed.'],
    limits:['支持静态 PNG、JPEG、WebP；单张不超过 20 MiB、3200 万像素。','Static PNG, JPEG or WebP; up to 20 MiB and 32 megapixels.'],
    choose:['选择图片','Choose image'],empty:['尚未选择图片','No image selected'],preview:['上传图片预览','Upload preview'],
    nameZh:['中文名称（必填）','Chinese name (required)'],nameEn:['英文名称（必填）','English name (required)'],
    otherZh:['中文名称（可选）','Chinese name (optional)'],otherEn:['英文名称（可选）','English name (optional)'],
    category:['分类（可选）','Category (optional)'],unknown:['未分类','Unspecified'],angle:['视角（可选）','View (optional)'],
    section:['参考类型','Reference type'],hair:['发长','Hair length'],face:['正脸参考','Face reference'],styling:['造型参考','Styling reference'],
    short:['短发','Short'],medium:['中发','Medium'],'medium-long':['中长发','Medium-long'],long:['长发','Long'],
    front:['正面','Front'],top:['俯视','Top'],bottom:['仰视','Bottom'],side:['侧面','Side'],diagonal:['斜侧','Diagonal'],
    cancel:['取消','Cancel'],save:['保存到图库','Save to gallery'],saving:['正在保存…','Saving…'],
    missing:['内置库未安装，可以上传和使用自定义素材。','The built-in library is missing. Custom uploads remain available.'],
    saved:['已保存。请点击大图中的“使用”按钮写回节点；不会自动运行。','Saved. Click Use in the image viewer to update the node; no workflow runs automatically.'],
    image_required:['请选择一张图片。','Choose one image.'],single_image_only:['每次只能上传一张图片。','Upload one image at a time.'],
    file_too_large:['图片超过 20 MiB 限制。','The image exceeds 20 MiB.'],too_many_pixels:['图片超过 3200 万像素限制。','The image exceeds 32 megapixels.'],
    unsupported_format:['仅支持静态 PNG、JPEG、WebP。','Only static PNG, JPEG and WebP are supported.'],animated_image:['暂不支持动画图片。','Animated images are not supported.'],
    invalid_image:['图片损坏或无法读取，请重新选择。','The image is damaged or unreadable. Choose another image.'],
    invalid_filename:['文件名无效，请重命名后重试。','Invalid filename. Rename the file and retry.'],
    name_required:['请填写名称。','Enter a name.'],invalid_metadata:['请检查名称和分类，文字最多 120 个字符。','Check the names and category; text fields allow up to 120 characters.'],
    invalid_request:['上传请求无效，请重试。','Invalid upload request. Retry.'],storage_error:['无法保存，请检查用户素材目录写入权限。','Cannot save. Check write permission for the user library.'],
    failed:['上传失败，请重试。','Upload failed. Retry.'],meta_failed:['数量读取失败，请刷新重试。','Cannot read counts. Refresh to retry.']
  };
  function element(tag, text, className) {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
  function mount(config) {
    const remembered=(()=>{try{return localStorage.getItem('gallery-upload-language');}catch{return null;}})();
    let language=new URL(location.href).searchParams.get('lang')==='en'?'en':remembered==='en'?'en':'zh';
    let origin=new URL(location.href).searchParams.get('origin')||'all';if(!['all','builtin','user'].includes(origin))origin='all';
    let meta=config.meta||{}, file=null, ready=false, busy=false, objectURL=null, version=0, errorCode='';
    const t=key=>(words[key]||words.failed)[language==='en'?1:0];
    const toolbar=element('div',undefined,'gallery-custom-toolbar');
    const open=element('button');open.type='button';open.id='custom-upload-open';
    const lang=element('select');lang.setAttribute('aria-label','上传界面语言 / Upload language');lang.append(new Option('中文','zh'),new Option('English','en'));lang.value=language;
    toolbar.append(open,lang);config.toolbar.append(toolbar);
    const sources=element('div',undefined,'gallery-origin-filters');sources.setAttribute('role','group');sources.setAttribute('aria-label','素材来源 / Asset source');
    const counts=element('p',undefined,'gallery-origin-counts');counts.setAttribute('role','status');
    const warning=element('p',undefined,'gallery-library-warning');warning.hidden=true;
    config.filters.prepend(warning,counts,sources);
    const notice=element('p',undefined,'gallery-upload-status');notice.hidden=true;notice.setAttribute('role','status');config.filters.prepend(notice);
    const dialog=element('dialog',undefined,'gallery-upload-dialog');dialog.id='custom-upload-dialog';dialog.setAttribute('aria-labelledby','custom-upload-title');
    const form=element('form');form.noValidate=true;
    const heading=element('h2');heading.id='custom-upload-title';
    const explanation=element('p'),limits=element('p',undefined,'gallery-upload-limits');
    const choose=element('button');choose.type='button';
    const input=element('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.hidden=true;input.id='custom-upload-file';
    const filename=element('span',undefined,'gallery-upload-filename');
    const fileRow=element('div',undefined,'gallery-upload-file-row');fileRow.append(choose,filename,input);
    const preview=element('img',undefined,'gallery-upload-preview');preview.hidden=true;
    const makeField=(id)=>{const label=element('label',undefined,'gallery-upload-field'),caption=element('span'),control=element('input');control.id=id;control.maxLength=120;label.append(caption,control);return{label,caption,control};};
    const name=makeField('custom-upload-name'),other=makeField('custom-upload-other');name.control.required=true;
    const extra=config.kind==='portrait'?[['section',['unknown','face','styling']],['hair',['unknown','short','medium','medium-long','long']]]:config.kind==='pose'?[['category'],['angle',['unknown','front','top','bottom','side','diagonal']]]:[['category']];
    const fields=extra.map(([key,options])=>{const field=makeField('custom-upload-'+key);if(options){field.control.remove();field.control=element('select');field.control.id='custom-upload-'+key;field.label.append(field.control);}return{...field,key,options};});
    const error=element('p',undefined,'gallery-upload-error');error.hidden=true;error.setAttribute('role','alert');
    const cancel=element('button');cancel.type='button';const save=element('button');save.type='submit';
    const actions=element('div',undefined,'gallery-upload-actions');actions.append(cancel,save);
    form.append(heading,explanation,limits,fileRow,preview,name.label,other.label,...fields.map(f=>f.label),error,actions);dialog.append(form);document.body.append(dialog);
    function setOrigin(value,notify=true){origin=value;const url=new URL(location.href);if(value==='all')url.searchParams.delete('origin');else url.searchParams.set('origin',value);history.replaceState(null,'',url.pathname+url.search+url.hash);draw();if(notify)config.onSource(value);}
    function draw(){
      open.textContent=t(config.kind);heading.textContent=t(config.kind);explanation.textContent=t('notice');limits.textContent=t('limits');choose.textContent=t('choose');filename.textContent=file?.name||t('empty');preview.alt=t('preview');
      name.caption.textContent=t(language==='en'?'nameEn':'nameZh');other.caption.textContent=t(language==='en'?'otherZh':'otherEn');
      fields.forEach(f=>{f.caption.textContent=t(f.key);if(f.options){const old=f.control.value;f.control.replaceChildren(...f.options.map(v=>new Option(t(v),v)));f.control.value=f.options.includes(old)?old:'unknown';}else f.control.placeholder=t('unknown');});
      cancel.textContent=t('cancel');save.textContent=t(busy?'saving':'save');save.disabled=busy||!ready;
      [cancel,choose,name.control,other.control,lang,...fields.map(f=>f.control)].forEach(e=>e.disabled=busy);
      error.hidden=!errorCode;if(errorCode)error.textContent=t(words[errorCode]?errorCode:'failed');
      warning.hidden=!meta.builtin_missing;warning.textContent=t('missing');
      counts.textContent=Number.isFinite(meta.total)?`${t('builtin')} ${meta.builtin_count} · ${t('user')} ${meta.user_count} · ${meta.total}`:t('meta_failed');
      sources.replaceChildren(...['all','builtin','user'].map(key=>{const button=element('button',`${t(key)} ${key==='all'?meta.total??0:key==='builtin'?meta.builtin_count??0:meta.user_count??0}`);button.type='button';button.dataset.origin=key;button.setAttribute('aria-pressed',String(key===origin));button.onclick=()=>setOrigin(key);return button;}));
    }
    function release(){if(dialog.open)return;version++;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;file=null;ready=false;errorCode='';form.reset();preview.hidden=true;preview.removeAttribute('src');draw();}
    open.onclick=()=>{release();dialog.showModal();};choose.onclick=()=>input.click();
    cancel.onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});dialog.addEventListener('close',release);
    input.onchange=()=>{
      const token=++version;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;file=input.files[0]||null;ready=false;errorCode='';preview.hidden=true;preview.removeAttribute('src');draw();
      if(!file)return;if(file.size>20*1024*1024){errorCode='file_too_large';draw();return;}
      if(file.type&&!['image/png','image/jpeg','image/webp'].includes(file.type)){errorCode='unsupported_format';draw();return;}
      preview.onload=()=>{if(token!==version)return;if(preview.naturalWidth*preview.naturalHeight>32000000)errorCode='too_many_pixels';else {ready=true;preview.hidden=false;}draw();};
      preview.onerror=()=>{if(token===version){ready=false;errorCode='invalid_image';draw();}};objectURL=URL.createObjectURL(file);preview.src=objectURL;
    };
    form.onsubmit=async event=>{
      event.preventDefault();if(busy)return;if(!ready||!file){errorCode='image_required';draw();return;}
      if(!name.control.value.trim()){errorCode='name_required';draw();name.control.focus();return;}
      const data=new FormData();data.append('image',file);data.append('name',name.control.value.trim());data.append('other_name',other.control.value.trim());data.append('language',language);
      fields.forEach(f=>data.append(f.key,f.key==='section'&&f.control.value==='unknown'?'custom':f.control.value));
      busy=true;errorCode='';draw();
      try {const response=await fetch(new URL('upload',location.href),{method:'POST',body:data,credentials:'same-origin'});const result=await response.json();if(!response.ok){errorCode=result.error||'failed';return;}
        meta=result.catalog.meta;setOrigin('user',false);busy=false;dialog.close();config.onUploaded(result.catalog,result.record.id);
        notice.textContent=t('saved');notice.hidden=false;
      } catch {errorCode='failed';}finally{busy=false;draw();}
    };
    lang.onchange=()=>{language=lang.value;try{localStorage.setItem('gallery-upload-language',language);}catch{}const url=new URL(location.href);url.searchParams.set('lang',language);history.replaceState(null,'',url.pathname+url.search+url.hash);draw();config.onLanguage?.(language);};
    draw();
    if(!config.meta)fetch(new URL('meta',location.href)).then(r=>{if(!r.ok)throw Error();return r.json();}).then(value=>{meta=value;draw();}).catch(()=>{counts.textContent=t('meta_failed');});
    return {matches:row=>origin==='all'||(row.origin||'builtin')===origin,setOrigin,get origin(){return origin;},get language(){return language;},name:row=>row.origin==='user'?(language==='en'?row.name_en:row.name_zh)||row.name_zh:'',update(value){meta=value;draw();}};
  }
  window.GalleryUploads={mount};
})();
