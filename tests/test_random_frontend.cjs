const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),uid='u-'+'a'.repeat(32);
async function setup(){
  let extension,changes=0;
  class Element{constructor(){this.style={};this.children=[];this.attributes={};}append(...children){this.children.push(...children);}setAttribute(k,v){this.attributes[k]=v;}}
  const origin={name:'origin',value:'all'},language={name:'language',value:'zh'};
  class Node{constructor(){this.widgets=[origin,language];this.dom={};this.properties={};this.outputs=Array.from({length:5},()=>({}));this.title='RandomPoseGallery';}addDOMWidget(name,type,el){this.dom[name]=el;}setSize(){}setDirtyCanvas(){}}
  const context=vm.createContext({window:{},URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},document:{createElement:()=>new Element()},api:{apiURL:p=>'/api'+p},app:{registerExtension:e=>{extension=e;},graph:{change(){changes++;}},queuePrompt(){throw Error('Must never enqueue a task');}}});
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_i18n.mjs'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(root,'web/random_pose_gallery.js'),'utf8').replace(/^import .*;\s*$/gm,''),context);
  class Original{}await extension.beforeRegisterNodeDef(Original,{name:'PoseGallery'});assert.equal(Original.prototype.onNodeCreated,undefined);
  await extension.beforeRegisterNodeDef(Node,{name:'RandomPoseGallery'});const node=new Node();node.onNodeCreated();
  return{node,origin,language,image:node.dom.random_pose_preview.children[0],status:node.dom.random_pose_preview.children[1],get changes(){return changes;}};
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
