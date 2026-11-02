/* All file changes require a user action. Opening this UI only reads status. */
(function () {
  'use strict';
  const words = {
    title:['内置素材管理','Built-in asset manager'],
    intro:['按需释放本机存储。清理规则和替换源文件保存在用户目录；更新后请手动点击“应用已保存规则”，不会自动删除或替换文件。','Free local storage. Rules and replacement sources are kept in the user directory. After an update, manually apply saved rules; files are never changed automatically.'],
    search:['搜索名称或 ID','Search name or ID'],all:['全部','All'],system:['体系','System'],category:['分类','Category'],state:['状态','State'],
    default:['默认','Default'],thumb_only:['仅保留缩略图','Thumbnail only'],removed:['完全清理','Fully removed'],replace:['替换内置','Replacement'],
    select:['选择筛选结果','Select filtered'],clear:['清空选择','Clear selection'],group:['选择时包含整组视角','Include all views of a selected pose'],
    originals:['清理原图','Remove originals'],remove:['完全清理','Remove all files'],reset:['取消规则','Cancel rules'],
    reapply:['应用已保存规则…','Apply saved rules…'],close:['关闭','Close'],choose:['选择替换图片','Choose replacement image'],
    stage:['保存替换规则并预览','Save replacement rule and preview'],
    replacementHelp:['替换需仅选择一个 ID。支持静态 PNG/JPEG/WebP，最多 20 MiB、3200 万像素；会同时生成新缩略图。保存后保留源文件，点击“确认执行”才覆盖内置图片。','Select exactly one ID to replace. Static PNG/JPEG/WebP, up to 20 MiB and 32 megapixels. A new thumbnail is generated. Saving keeps the source; built-in files change only after Confirm.'],
    staged:['替换源文件和规则已保存；尚未覆盖内置图片。可确认执行，或稍后手动应用已保存规则。','Replacement source and rule saved; built-in files have not changed. Confirm now or manually apply saved rules later.'],
    preview:['执行预览','Execution preview'],confirm:['确认执行','Confirm'],cancel:['取消预览','Cancel preview'],
    warning:['删除会实际移除本机文件，可能导致引用这些 ID 的旧工作流无法运行。取消规则不会下载或恢复已删文件；替换源文件会保留。','Deletion removes local files and can break workflows referencing these IDs. Canceling rules does not download or restore deleted files. Replacement sources are retained.'],
    delete:['删除','Delete'],copy:['替换','Replace'],noFiles:['无文件变更（仍会保存所选规则）','No file changes (selected rules will still be saved)'],
    unavailable:['原图未安装','Original not installed'],available:['原图已安装','Original installed'],empty:['没有匹配的内置素材','No matching built-in assets'],
    loading:['正在读取…','Loading…'],working:['正在执行…','Working…'],
    invalid_selection:['请选择内置素材；替换时只能选一个 ID。','Select built-in assets; select one ID for replacement.'],
    plan_changed:['文件或规则已变化，请重新预览后执行。','Files or rules changed. Generate a new preview.'],
    replacement_missing:['替换源文件缺失或校验失败，请重新上传后重试。','Replacement source is missing or damaged. Upload it again.'],
    unsafe_path:['检测到不安全的文件路径或符号链接，操作已停止。','Unsafe path or symbolic link detected; operation stopped.'],
    storage_error:['文件操作失败，请检查目录权限和可用空间。','File operation failed. Check permissions and free space.'],
    invalid_management_data:['素材管理记录无效，请检查用户目录中的记录文件。','Invalid management data. Check the saved rules in the user directory.'],
    file_too_large:['图片超过 20 MiB。','Image exceeds 20 MiB.'],too_many_pixels:['图片超过 3200 万像素。','Image exceeds 32 megapixels.'],
    unsupported_format:['仅支持静态 PNG、JPEG、WebP。','Only static PNG, JPEG and WebP are supported.'],animated_image:['不支持动画图片。','Animated images are not supported.'],
    invalid_image:['无法读取图片，请重新选择。','Cannot read image. Choose another file.'],failed:['操作失败，请刷新后重试。','Operation failed. Refresh and retry.']
  };
  const el = (tag, text, className) => {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
  function mount(config) {
    let language=config.language, rows=[], selected=new Set(), busy=false, plan=null, file=null, objectURL=null;
    const t=key=>(words[key]||words.failed)[language==='en'?1:0];
    const label=value=>window.PoseGalleryI18n.translate(value,language);
    const size=value=>`${(value/1024/1024).toFixed(2)} MiB`;
    const open=el('button');open.type='button';open.id='library-manager-open';config.toolbar.append(open);
    const dialog=el('dialog',undefined,'library-manager');dialog.id='library-manager';dialog.setAttribute('aria-labelledby','library-manager-title');
    const heading=el('h2');heading.id='library-manager-title';const intro=el('p'),toolbar=el('div',undefined,'library-manager-tools');
    const search=el('input');search.type='search';search.id='library-manager-search';
    const system=el('select'),category=el('select'),state=el('select');
    const groupLabel=el('label',undefined,'library-manager-group'),group=el('input'),groupText=el('span');group.type='checkbox';group.checked=true;groupLabel.append(group,groupText);
    const select=el('button'),clear=el('button');toolbar.append(search,system,category,state,select,clear,groupLabel);
    const count=el('p');count.setAttribute('role','status');const list=el('div',undefined,'library-manager-list');list.id='library-manager-list';
    const actions=el('div',undefined,'library-manager-actions');
    const originals=el('button'),remove=el('button'),reset=el('button'),reapply=el('button');actions.append(originals,remove,reset,reapply);
    const replacement=el('div',undefined,'library-manager-replacement'),help=el('p'),choose=el('label',undefined,'library-manager-file');
    const chooseText=el('span'),input=el('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.id='library-manager-file';choose.append(chooseText,input);
    const image=el('img');image.hidden=true;image.alt='';const stage=el('button');replacement.append(help,choose,image,stage);
    const status=el('p');status.setAttribute('role','status');status.id='library-manager-status';
    const preview=el('section',undefined,'library-manager-plan');preview.hidden=true;preview.id='library-manager-plan';
    const previewTitle=el('h3'),summary=el('p'),warning=el('p'),details=el('div',undefined,'library-manager-details');
    const confirm=el('button'),cancel=el('button');confirm.id='library-manager-confirm';preview.append(previewTitle,summary,warning,details,confirm,cancel);
    const close=el('button');close.id='library-manager-close';
    const header=el('div',undefined,'library-manager-header');header.append(heading,close);
    dialog.append(header,intro,toolbar,count,list,actions,replacement,status,preview);document.body.append(dialog);
    dialog.querySelectorAll('button').forEach(button=>button.type='button');
    function filtered(){const q=search.value.trim().toLowerCase();return rows.filter(row=>(!system.value||row.体系===system.value)&&(!category.value||row.分类===category.value)&&(!state.value||row.management_state===state.value)&&(!q||`${row.id} ${row.姿势名称} ${row.name_en}`.toLowerCase().includes(q)));}
    function fill(select,values,key){const old=select.value;select.replaceChildren(new Option(`${t(key)} · ${t('all')}`,''),...values.map(value=>new Option(key==='state'?t(value):label(value),value)));select.value=values.includes(old)?old:'';select.setAttribute('aria-label',t(key));}
    function expand(ids){const result=new Set(ids);if(group.checked){const keys=new Set(rows.filter(row=>result.has(row.id)).map(row=>`${row.体系}|${row.姿势编号||row.id}`));rows.forEach(row=>{if(keys.has(`${row.体系}|${row.姿势编号||row.id}`))result.add(row.id);});}return result;}
    function clearPlan(){plan=null;preview.hidden=true;}
    function drawList(){
      const visible=filtered();list.replaceChildren();
      count.textContent=language==='en'?`${visible.length} shown · ${selected.size} selected · ${size(rows.reduce((n,row)=>n+row.disk_bytes,0))} in built-in files`:`显示 ${visible.length} 张 · 已选 ${selected.size} 张 · 内置文件占用 ${size(rows.reduce((n,row)=>n+row.disk_bytes,0))}`;
      if(!visible.length)list.append(el('p',t('empty')));
      for(const row of visible){
        const entry=el('label',undefined,'library-manager-row'),check=el('input');check.type='checkbox';check.checked=selected.has(row.id);check.disabled=busy;check.setAttribute('aria-label',row.id);check.dataset.id=row.id;
        check.onchange=()=>{clearPlan();for(const id of expand([row.id])){if(check.checked)selected.add(id);else selected.delete(id);}drawList();drawDisabled();};
        const thumb=el('img');thumb.alt='';thumb.loading='lazy';if(row.installed_thumb)thumb.src=`./assets/${row.缩略图}?v=${encodeURIComponent(row.asset_version||'builtin')}`;else thumb.hidden=true;
        const text=el('span'),name=el('strong',language==='en'?row.name_en:row.姿势名称),id=el('code',row.id);
        const meta=el('small',`${label(row.体系)} / ${label(row.分类)} / ${label(row.角度)} · ${t(row.management_state)} · ${t(row.installed_original?'available':'unavailable')} · ${size(row.disk_bytes)}`);text.append(name,id,meta);entry.append(check,thumb,text);list.append(entry);
      }
    }
    function drawDisabled(){
      dialog.querySelectorAll('button,input,select').forEach(node=>node.disabled=busy);
      originals.disabled=remove.disabled=reset.disabled=busy||!selected.size;
      stage.disabled=busy||selected.size!==1||!file;confirm.disabled=busy||!plan;
    }
    function draw(){
      open.textContent=heading.textContent=t('title');intro.textContent=t('intro');search.placeholder=t('search');search.setAttribute('aria-label',t('search'));
      fill(system,[...new Set(rows.map(row=>row.体系))],'system');fill(category,[...new Set(rows.map(row=>row.分类))],'category');fill(state,['default','thumb_only','removed','replace'],'state');
      for(const [node,key] of [[select,'select'],[clear,'clear'],[groupText,'group'],[originals,'originals'],[remove,'remove'],[reset,'reset'],[reapply,'reapply'],[help,'replacementHelp'],[chooseText,'choose'],[stage,'stage'],[previewTitle,'preview'],[warning,'warning'],[confirm,'confirm'],[cancel,'cancel'],[close,'close']])node.textContent=t(key);
      drawList();drawDisabled();if(plan)drawPlan();
    }
    async function request(path,body){const response=await fetch(new URL(path,location.href),{credentials:'same-origin',...(body===undefined?{}:{method:'POST',body:body instanceof FormData?body:JSON.stringify(body),headers:body instanceof FormData?{}:{'Content-Type':'application/json'}})});const value=await response.json();if(!response.ok)throw Error(value.error||'failed');return value;}
    async function refresh(){const payload=await request('manage');rows=payload.records;selected=new Set([...selected].filter(id=>rows.some(row=>row.id===id)));draw();if(payload.orphan_ids.length)status.textContent=language==='en'?`${payload.orphan_ids.length} saved IDs no longer exist in this library and will be skipped.`:`有 ${payload.orphan_ids.length} 个已记录 ID 不在当前内置库中，执行时会跳过。`;}
    async function run(work){if(busy)return;busy=true;const working=t('working');status.textContent=working;status.setAttribute('role','status');drawDisabled();try{await work();if(status.textContent===working)status.textContent='';}catch(error){if(error.message==='plan_changed')clearPlan();status.textContent=t(error.message);status.setAttribute('role','alert');}finally{busy=false;drawDisabled();}}
    function drawPlan(){
      preview.hidden=false;const n=plan.items.length,files=plan.file_count;
      summary.textContent=language==='en'?`${n} IDs · ${files} file operations · estimated net space released: ${size(plan.release_bytes)}`:`涉及 ${n} 个 ID · ${files} 个文件操作 · 预计净释放 ${size(plan.release_bytes)}`;
      details.replaceChildren(...plan.items.map(item=>el('p',`${item.id} · ${t(item.mode)} · ${item.operations.length?item.operations.map(op=>`${t(op.action==='delete'?'delete':'copy')} ${op.kind}`).join(', '):t('noFiles')}`)));
    }
    function showPlan(value){plan=value;drawPlan();drawDisabled();preview.scrollIntoView({block:'nearest'});}
    function previewMode(mode){clearPlan();run(async()=>{showPlan(await request('manage/plan',{ids:[...selected],mode}));status.textContent='';});}
    open.onclick=()=>show();
    async function show(id){if(!dialog.open)dialog.showModal();dialog.scrollTop=0;search.value=id||'';if(id)system.value=category.value=state.value='';selected=new Set(id?[id]:[]);clearPlan();await run(refresh);}
    [search,system,category,state].forEach(node=>node.addEventListener(node===search?'input':'change',()=>{clearPlan();drawList();drawDisabled();}));
    select.onclick=()=>{clearPlan();for(const id of expand(filtered().map(row=>row.id)))selected.add(id);drawList();drawDisabled();};
    clear.onclick=()=>{selected.clear();clearPlan();drawList();drawDisabled();};
    originals.onclick=()=>previewMode('thumb_only');remove.onclick=()=>previewMode('removed');reset.onclick=()=>previewMode('default');
    reapply.onclick=()=>{clearPlan();run(async()=>{showPlan(await request('manage/plan',{}));status.textContent='';});};
    input.onchange=()=>{clearPlan();if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;file=input.files[0]||null;image.hidden=true;if(file&&file.size>20*1024*1024){file=null;input.value='';status.textContent=t('file_too_large');}if(file){objectURL=URL.createObjectURL(file);image.src=objectURL;image.hidden=false;}drawDisabled();};
    stage.onclick=()=>run(async()=>{const data=new FormData();data.append('id',[...selected][0]);data.append('image',file);const value=await request('manage/replacement',data);await refresh();showPlan(value);status.textContent=t('staged');});
    confirm.onclick=()=>{const current=plan;if(!current)return;run(async()=>{const result=await request('manage/apply',{request:current.request,token:current.token});clearPlan();await refresh();await config.onChanged();status.textContent=(language==='en'?`Completed ${result.completed.length} IDs; failed ${result.failures.length}; net space released ${size(result.release_bytes)}.`:`完成 ${result.completed.length} 个 ID，失败 ${result.failures.length} 个，净释放 ${size(result.release_bytes)}。`)+result.failures.map(item=>`\n${item.id}: ${t(item.error)}`).join('');});};
    cancel.onclick=clearPlan;close.onclick=()=>dialog.close();dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    dialog.addEventListener('close',()=>{clearPlan();if(objectURL)URL.revokeObjectURL(objectURL);objectURL=null;file=null;input.value='';image.hidden=true;});
    draw();return {show,setLanguage(value){language=value;clearPlan();status.textContent='';draw();}};
  }
  window.PoseLibraryManager={mount};
})();
