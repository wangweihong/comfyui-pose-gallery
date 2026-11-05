// DOM controls must remain DOM-backed in both ComfyUI renderers.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const kind=path.basename(root).replace('comfyui-','').replace('-gallery','');
const cap=kind[0].toUpperCase()+kind.slice(1);
// These names select native Vue components instead of mounting the supplied DOM.
const nativeTypes=new Set(['button','BUTTON','text','string','STRING','customtext','textarea','multiline','number','slider','combo','toggle','boolean','image','galleria','markdown','color']);

for(const random of [false,true])test(`${random?'Random ':''}${cap} DOM controls cannot collide with native widget types`,async()=>{
 let extension;
 class Element{constructor(){this.style={};this.children=[];}append(...elements){this.children.push(...elements);}setAttribute(){}addEventListener(){}}
 class Node{
  constructor(){
   this.widgets=[{name:kind+'_id',value:'h-reference'},{name:'language',value:'en'},{name:'origin',value:'all'},{name:'locked',value:false},
    ...['pose_system','angle','section'].map(name=>({name,value:'all',options:{values:['all']}}))];
   this.properties={};this.outputs=[];this.dom=[];
  }
  addDOMWidget(name,type,element,options){const widget={name,type,element,options};this.dom.push(widget);return widget;}
  setSize(){}setDirtyCanvas(){}
 }
 const context=vm.createContext({window:{},localStorage:{getItem:()=>null,setItem(){}},URLSearchParams,
  document:{createElement:()=>new Element()},location:{origin:'http://test'},
  api:{apiURL:url=>url},app:{registerExtension:value=>{extension=value;},graph:{change(){}}}});
 for(const file of ['i18n.mjs',...(random?['random_i18n.mjs']:[]),`${random?'random_':''}${kind}_gallery.js`]){
  vm.runInContext(fs.readFileSync(path.join(root,'web',file),'utf8').replace(/^import .*;\s*$/gm,''),context);
 }
 await extension.beforeRegisterNodeDef(Node,{name:(random?'Random':'')+cap+'Gallery'});
 const node=new Node();node.onNodeCreated();
 const expected=random?['random_language','random_dice','random_'+kind+'_preview']:[kind+'_browser',kind+'_preview'];
 assert.deepEqual(node.dom.map(widget=>widget.name),expected,'Saved widget names/order must remain compatible');
 for(const widget of node.dom){
  assert.equal(nativeTypes.has(widget.type),false,`${widget.name} would bypass its DOM handlers in Nodes 2.0`);
  assert.ok(widget.element,'The original DOM element must stay mounted');
  assert.equal(widget.options.serialize,false,'Display controls must not become backend inputs');
 }
});
