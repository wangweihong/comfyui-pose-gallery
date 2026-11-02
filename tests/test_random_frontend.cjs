const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),uid='u-'+'a'.repeat(32);
async function setup(fetchCatalog){
  let extension,changes=0;
  class Element{constructor(){this.style={};this.children=[];this.attributes={};}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}}
  const origin={name:'origin',value:'all',options:{values:['all','builtin','user']}},language={name:'language',value:'zh'},system={name:'pose_system',value:'全身单人・标准系',options:{values:['all','全身单人・标准系','自定义']}},angle={name:'angle',value:'正面',options:{values:['all','正面','俯视']}};
  class Node{constructor(){this.widgets=[origin,language,system,angle];this.dom={};this.properties={};this.outputs=Array.from({length:6},()=>({}));this.title='RandomPoseGallery';}addDOMWidget(name,type,el){this.dom[name]=el;}setSize(){}setDirtyCanvas(){}addOutput(name,type){this.outputs.push({name,type});}}
  const context=vm.createContext({...fetchCatalog?{fetch:async()=>({ok:true,json:async()=>fetchCatalog})}:{},window:{},URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:()=>new Element()},api:{apiURL:p=>'/api'+p},app:{registerExtension:e=>{extension=e;},graph:{change(){changes++;}},queuePrompt(){throw Error('Must never enqueue a task');}}});
  vm.runInContext(fs.readFileSync(path.join(root,'web/i18n.mjs'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_i18n.mjs'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_pose_gallery.js'),'utf8').replace(/^import .*;\s*$/gm,''),context);
  class Original{}await extension.beforeRegisterNodeDef(Original,{name:'PoseGallery'});assert.equal(Original.prototype.onNodeCreated,undefined);
  await extension.beforeRegisterNodeDef(Node,{name:'RandomPoseGallery'});const node=new Node();node.onNodeCreated();
  return{node,origin,language,system,angle,image:node.dom.random_pose_preview.children[0],status:node.dom.random_pose_preview.children[1],get changes(){return changes;}};
}
test('only new random node receives execution preview; origin and input values stay unchanged',async()=>{
  const s=await setup();s.node.onExecuted({pose_id:[uid],name:['My pose']});s.image.onload();
  assert.equal(s.image.src,`/api/pose_gallery/assets/img/${uid}.png`);assert.equal(s.node.properties.last_pose_id,uid);assert.equal(s.origin.value,'all');assert.equal(s.language.value,'zh');assert.match(s.status.textContent,/My pose/);assert.equal(s.changes,1);
});
test('saved preview and English interface are restored without queuing or freezing the pool',async()=>{
  const s=await setup();s.node.properties={last_pose_id:uid,last_pose_name:'Saved hair'};s.node.onConfigure({widgets_values:['user','en']});s.image.onload();
  assert.equal(s.image.src,`/api/pose_gallery/assets/img/${uid}.png`);assert.match(s.status.textContent,/Last execution result/);assert.equal(s.language.value,'en');assert.equal(s.changes,0);
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
