const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),uid='u-'+'a'.repeat(32);
async function setup(fetchCatalog,legacyI18n=false,fetchImpl){
  let extension,changes=0;
  class Element{constructor(){this.style={};this.children=[];this.attributes={};}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}}
  const origin={name:'origin',value:'all',options:{values:['all','builtin','user']}},language={name:'language',value:'zh'},system={name:'pose_system',value:'全身单人・标准系',options:{values:['all','全身单人・标准系','自定义']}},angle={name:'angle',value:'正面',options:{values:['all','正面','俯视']}},pose={name:'pose_id',value:''},lock={name:'locked',value:false};
  class Node{constructor(){this.widgets=[origin,language,system,angle,pose,lock];this.dom={};this.properties={};this.outputs=Array.from({length:6},()=>({}));this.title='RandomPoseGallery';}addDOMWidget(name,type,el){this.dom[name]=el;}setSize(){}setDirtyCanvas(){}addOutput(name,type){this.outputs.push({name,type});}}
  const context=vm.createContext({...fetchImpl?{fetch:fetchImpl}:fetchCatalog?{fetch:async()=>({ok:true,json:async()=>fetchCatalog})}:{},window:{},URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:()=>new Element()},api:{apiURL:p=>'/api'+p},app:{registerExtension:e=>{extension=e;},graph:{change(){changes++;}},queuePrompt(){throw Error('Must never enqueue a task');}}});
  vm.runInContext(fs.readFileSync(path.join(root,'web/i18n.mjs'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_i18n.mjs'),'utf8'),context);
  if(legacyI18n)delete context.window.PoseGalleryI18n.loadCatalog;
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_pose_gallery.js'),'utf8').replace(/^import .*;\s*$/gm,''),context);
  class Original{}await extension.beforeRegisterNodeDef(Original,{name:'PoseGallery'});assert.equal(Original.prototype.onNodeCreated,undefined);
  await extension.beforeRegisterNodeDef(Node,{name:'RandomPoseGallery'});const node=new Node();node.onNodeCreated();
  return{node,origin,language,system,angle,pose,lock,dice:node.dom.random_dice.children[0],image:node.dom.random_pose_preview.children[0],status:node.dom.random_pose_preview.children[1],get changes(){return changes;}};
}
test('only new random node receives execution preview; origin and input values stay unchanged',async()=>{
  const s=await setup();s.node.onExecuted({pose_id:[uid],name:['My pose']});s.image.onload();
  assert.equal(s.image.src,`/api/pose_gallery/assets/img/${uid}.png`);assert.equal(s.node.properties.last_pose_id,uid);assert.equal(s.origin.value,'all');assert.equal(s.language.value,'zh');assert.match(s.status.textContent,/My pose/);assert.equal(s.changes,1);
});
test('saved preview and English interface are restored without queuing or freezing the pool',async()=>{
  const s=await setup();s.node.properties={last_pose_id:uid,last_pose_name:'Saved hair'};s.node.onConfigure({widgets_values:['user','en']});s.image.onload();
  assert.equal(s.image.src,`/api/pose_gallery/assets/img/${uid}.png`);assert.equal(s.status.textContent,'Saved hair');assert.equal(s.language.value,'en');assert.equal(s.changes,0);
});
test('stale image callbacks cannot replace a newer random result',async()=>{
  const s=await setup();s.node.onExecuted({pose_id:[uid]});const stale=s.image.onerror;
  s.node.onExecuted({pose_id:['h-next']});s.image.onload();stale();assert.equal(s.image.style.display,'block');assert.doesNotMatch(s.status.textContent,/失败/);
});

test('English filters serialize canonical values and switch back without losing selection', async()=>{
  const s=await setup();s.language.callback('en');
  assert.equal(s.node.outputs[5].label,'Action');assert.equal(s.system.value,'Full body · Standard');assert.equal(s.angle.value,'Front');
  assert.equal(s.system.serializeValue(),'全身单人・标准系');assert.equal(s.angle.serializeValue(),'正面');
  assert.deepEqual(Array.from(s.angle.options.values),['all','Front','High angle']);
  s.language.callback('zh');assert.equal(s.system.value,'全身单人・标准系');assert.equal(s.angle.value,'正面');
});
test('last random result changes its name immediately when switching languages',async()=>{
  const s=await setup();s.node.onExecuted({pose_id:[uid],name:['我的姿势'],name_zh:['我的姿势'],name_en:['My pose']});
  s.language.callback('en');assert.match(s.status.textContent,/My pose/);assert.doesNotMatch(s.status.textContent,/[\u3400-\u9fff]/);
  s.language.callback('zh');assert.match(s.status.textContent,/我的姿势/);
});

test('older saved Chinese preview names are localized from the catalog without executing',async()=>{
  const s=await setup([{id:uid,origin:'user',name_zh:'旧参考',name_en:'Older reference'}]);
  s.node.properties={last_pose_id:uid,last_pose_name:'旧参考'};
  s.node.onConfigure({widgets_values:['all','en','all','all']});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(s.status.textContent,/Older reference/);
  assert.doesNotMatch(s.status.textContent,/[\u3400-\u9fff]/);
  assert.equal(s.changes,0);
});

test('older random nodes gain the action port without moving existing outputs',async()=>{
  const s=await setup();s.node.outputs.pop();s.node.outputs[4].links=[17];const original=s.node.outputs.slice();
  s.node.onConfigure({widgets_values:['all','en','all','all']});
  assert.equal(s.node.outputs.length,6);assert.equal(s.node.outputs[5].name,'action');assert.equal(s.node.outputs[5].label,'Action');
  original.forEach((output,index)=>assert.equal(s.node.outputs[index],output));assert.deepEqual(s.node.outputs[4].links,[17]);
});

test('older cached translations cannot abort restoring a workflow with a saved preview',async()=>{
 const s=await setup(undefined,true,async()=>({ok:true,json:async()=>[{id:uid,name_zh:'旧名称',name_en:'Restored reference'}]}));
 s.node.properties={last_pose_id:uid,last_pose_name:'旧名称'};
 assert.doesNotThrow(()=>s.node.onConfigure({widgets_values:['all','en']}));
 await new Promise(resolve=>setImmediate(resolve));assert.match(s.status.textContent,/Restored reference/);assert.equal(s.changes,0);
});

test('preview catalog failures do not throw from workflow loading',async()=>{
 for(const fetchImpl of [()=>{throw Error('offline');},async()=>({ok:false}),async()=>({ok:true,json:async()=>({invalid:true})})]){
  const s=await setup(undefined,true,fetchImpl);
  s.node.properties={last_pose_id:uid,last_pose_name:'Saved reference'};
  assert.doesNotThrow(()=>s.node.onConfigure({widgets_values:['all','en']}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(s.status.textContent,/Saved reference/);assert.equal(s.node.properties.last_pose_id,uid);assert.equal(s.changes,0);
 }
});
test('restoring previews shares one catalog request without changing node inputs',async()=>{
 let calls=0;const s=await setup(undefined,true,async()=>{calls++;return {ok:true,json:async()=>[{id:uid,name_zh:"旧名称",name_en:"Restored reference"}]};});
 s.node.properties={last_pose_id:uid,last_pose_name:'旧名称'};
 s.node.onConfigure({widgets_values:['all','en']});s.node.onConfigure({widgets_values:['all','en']});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1);assert.equal(s.origin.value,'all');assert.equal(s.language.value,'en');assert.equal(s.changes,0);
});

test('dice draws with canonical filters and updates the actual node input without queuing',async()=>{
 let requested;
 const s=await setup(undefined,false,async url=>{requested=url;return {ok:true,json:async()=>({pose_id:uid,name:'我的姿态',name_zh:'我的姿态',name_en:'My pose'})};});
 s.language.callback('en');await s.dice.onclick();
 const params=new URL(requested,'http://localhost').searchParams;
 assert.equal(params.get('pose_system'),'全身单人・标准系');assert.equal(params.get('angle'),'正面');assert.equal(params.get('language'),'en');
 assert.equal(s.pose.value,uid);assert.equal(s.node.properties.last_pose_id,uid);assert.match(s.status.textContent,/My pose/);assert.equal(s.dice.disabled,false);
});

test('lock disables dice, preserves choice against stale execution and persists through configuration',async()=>{
 let requests=0;const s=await setup(undefined,false,async()=>{requests++;throw Error('Must not fetch while locked');});
 s.node.onExecuted({pose_id:[uid],name_en:['My pose'],name_zh:['我的姿态']});s.lock.callback(true);
 assert.equal(s.lock.value,true);assert.equal(s.dice.disabled,true);await s.dice.onclick();assert.equal(requests,0);
 s.node.onExecuted({pose_id:['stale'],name_en:['Stale']});assert.equal(s.pose.value,uid);
 s.node.onConfigure({widgets_values:['all','en','all','all',uid,true]});assert.equal(s.lock.value,true);assert.equal(s.dice.textContent,'🔒 Locked');
 s.lock.callback(false);assert.equal(s.dice.disabled,false);assert.equal(s.pose.value,uid);
});

test('locking before selection shows an actionable message and does not enable lock',async()=>{
 const s=await setup();s.lock.callback(true);assert.equal(s.lock.value,false);assert.match(s.status.textContent,/先点击骰子/);
});

test('late draws cannot change a locked, reconfigured, refiltered or removed node',async()=>{
 for(const action of [s=>s.lock.callback(true),s=>s.node.onConfigure({widgets_values:['all','zh']}),s=>s.angle.callback('俯视'),s=>s.node.onRemoved()]){
  let resolve;const pending=new Promise(done=>{resolve=done;});
  const s=await setup(undefined,false,()=>pending);
  s.node.onExecuted({pose_id:[uid],name_en:['My pose'],name_zh:['我的姿态']});
  const drawing=s.dice.onclick();assert.equal(s.dice.disabled,true);action(s);
  resolve({ok:true,json:async()=>({pose_id:'too-late',name_en:'Too late',name_zh:'过期'})});await drawing;
  assert.equal(s.pose.value,uid);assert.equal(s.node.properties.last_pose_id,uid);
 }
});

test('failed draws keep the previous pose and allow retry',async()=>{
 let fail=true;const s=await setup(undefined,false,async()=>fail?{ok:false,json:async()=>({error:'No available originals'})}:{ok:true,json:async()=>({pose_id:'retry',name_en:'Retry',name_zh:'重试'})});
 s.node.onExecuted({pose_id:[uid],name_en:['My pose'],name_zh:['我的姿态']});
 await s.dice.onclick();assert.equal(s.pose.value,uid);assert.equal(s.dice.disabled,false);assert.match(s.status.textContent,/No available originals/);
 fail=false;await s.dice.onclick();assert.equal(s.pose.value,'retry');assert.doesNotMatch(s.status.textContent,/No available originals/);
});

test('selected preview shows only the pose name without random-mode instructions',async()=>{
 const s=await setup();s.node.onExecuted({pose_id:[uid],name_zh:['我的姿态'],name_en:['My pose']});
 assert.equal(s.status.textContent,'我的姿态');s.lock.callback(true);assert.equal(s.status.textContent,'我的姿态');
 s.language.callback('en');assert.equal(s.status.textContent,'My pose');s.lock.callback(false);assert.equal(s.status.textContent,'My pose');
});

test('English mode translates locked dice, widget labels, outputs and restored selection',async()=>{
 const s=await setup();s.node.onExecuted({pose_id:[uid],name_zh:['我的姿态'],name_en:['My pose']});s.lock.callback(true);
 s.language.callback('en');
 assert.equal(s.dice.textContent,'🔒 Locked');assert.equal(s.pose.label,'Current pose ID');assert.equal(s.lock.label,'🔒 Lock random selection');
 assert.equal(s.node.outputs[3].label,'Pose ID');assert.equal(s.origin.label,'Random source');assert.equal(s.system.label,'Pose system');assert.equal(s.angle.label,'Pose view');
 for(const widget of [s.origin,s.language,s.pose,s.lock]){assert.ok(widget.tooltip);assert.doesNotMatch(widget.tooltip,/[\u3400-\u9fff]/);}
 assert.equal(s.dice.disabled,true);assert.doesNotMatch([s.status.textContent,s.dice.textContent,s.pose.label,s.lock.label,...s.node.outputs.map(output=>output.label)].join(' '),/[\u3400-\u9fff]/);
 s.node.onConfigure({widgets_values:['all','en','all','all',uid,true]});assert.equal(s.dice.textContent,'🔒 Locked');assert.equal(s.pose.label,'Current pose ID');
 s.language.callback('zh');assert.equal(s.dice.textContent,'🔒 已锁定');assert.equal(s.pose.label,'当前姿态编号');assert.equal(s.lock.label,'🔒 锁定随机');
});
