'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Packs=require('../core/packs.js');

function engine(){
  const versions=new Map();let active=null;
  const key=(id,version)=>id+'@'+version;
  return {
    registerVersion(pack){versions.set(key(pack.id,pack.version),pack);return pack;},
    unregisterVersion(id,version){versions.delete(key(id,version));},
    activatePack(pack){active=pack;return pack;},
    get(id,version){
      if(version){const value=versions.get(key(id,version));if(!value)throw Error('missing');return value;}
      if(active?.id===id)return active;
      throw Error('missing');
    }
  };
}
function views(){
  const map=new Map();
  return {helpers:{},register:(id,render,cover,options)=>map.set(id,{render,cover,...options}),get:id=>map.get(id)||null,remove:id=>map.delete(id)};
}
function bundle(marker){
  return {
    format:'playroom-pack',formatVersion:1,
    manifest:{id:'demo',name:'Demo',version:'1.0.0',engineApi:4,viewApi:3,stateVersion:1},
    files:{
      'rules.js':require('./pack-fixture.cjs').rules({id:'demo',name:'Demo',min:1,max:2,preset:'base'}),
      'view.js':"globalThis.PlayroomViews.register('demo',()=>({api:3,family:'board',elements:{field:'<div>"+marker+"</div>'}}),()=>'<div>"+marker+"</div>');",
      'styles.css':'.demo::after{content:"'+marker+'"}'
    }
  };
}
function manager(saved){
  let raw=saved?JSON.stringify(saved):null;
  const catalog={};
  const instance=new Packs({engine:engine(),views:views(),catalog,document:null,storage:{get:()=>raw,set:value=>{raw=value;}}});
  return {instance,raw:()=>raw};
}

test('incompatible and conflicting saved packs are isolated without executing their code',()=>{
  const current=bundle('current'),old=bundle('old'),legacy=bundle('legacy');legacy.manifest.viewApi=1;legacy.files['rules.js']='throw Error("MUST NEVER EXECUTE")';
  const repo=manager({format:'playroom-packs',formatVersion:1,packs:[old,legacy],active:{demo:'1.0.0'},removed:[]});
  repo.instance.bootstrap([current]);assert.equal(repo.instance.list().length,1);assert.equal(repo.instance.quarantined.length,2);assert.match(repo.instance.exportPack('demo','1.0.0'),/current/);
  const saved=JSON.parse(repo.raw());assert.equal(saved.quarantined.length,2);
  const reloaded=manager(saved);reloaded.instance.bootstrap([current]);assert.equal(reloaded.instance.quarantined.length,2);reloaded.instance.discardQuarantine(0);assert.equal(reloaded.instance.quarantined.length,1);reloaded.instance.discardQuarantine();assert.equal(JSON.parse(reloaded.raw()).quarantined.length,0);
});
test('explicit builtin restore clears only builtin deletion markers',()=>{const repo=manager({format:'playroom-packs',formatVersion:1,packs:[],active:{},removed:['demo@1.0.0','other@1.0.0']});repo.instance.bootstrap([bundle('current')]);assert.equal(repo.instance.list().length,0);repo.instance.bootstrap([bundle('current')],{restoreBuiltins:true});assert.equal(repo.instance.list().length,1);assert.deepEqual(JSON.parse(repo.raw()).removed,['other@1.0.0']);});


test('RC4 registry validates tags and count filter semantics',()=>{
 const T=require('../core/tags.js');const g={min:2,max:4},info={tags:['cards','combinations'],playModes:[{id:'any',players:[2,3,4],teams:false}]};
 assert(T.validate(info));for(const tag of ['missing','solo'])assert.throws(()=>T.validate({tags:['cards',tag]}));assert.throws(()=>T.validate({tags:['logic']}));assert.throws(()=>T.validate({tags:['cards','cards']}));
 assert(T.matches(g,info,'2+'));assert(T.matches(g,info,'3+'));assert(T.matches(g,info,'4+'));assert(!T.matches(g,info,'6+'));assert(!T.matches(g,info,'solo'));assert(!T.matches(g,info,'duel'));assert(!T.matches(g,info,'three'));assert(!T.matches(g,info,'teams'));
 assert(T.matches({min:2,max:2},{},'duel'));assert(T.matches({min:1,max:1},{},'solo'));assert(T.matches(g,{playModes:[{id:'teams',teams:true,players:[4]}]},'teams'));
 const sample=bundle('tags');sample.manifest.tags=['cards','unknown'];assert.throws(()=>manager().instance.prepare(sample));
 const fs=require('node:fs'),path=require('node:path');const other=JSON.parse(fs.readFileSync(path.join(path.dirname(fs.realpathSync(path.join(__dirname,'../packs'))),'shared/tags.json'),'utf8'));assert.deepEqual(other,require('../core/tags.json'));
});
test('pack staging and activation preserve the public reveal renderer',()=>{
 const sample=bundle('reveal');sample.files['view.js']="globalThis.PlayroomViews.register('demo',()=>({api:3,family:'board',elements:{field:'<div>field</div>'}}),null,{seating:'row',reveal:value=>'<b>'+value.card+'</b>'});";
 const repo=manager();let styleWrites=0,styleText='',styleNode=null;
 repo.instance.document={querySelector:()=>styleNode,head:{appendChild(node){styleNode=node;}},createElement:()=>({setAttribute(){},get textContent(){return styleText;},set textContent(value){styleWrites++;styleText=value;}})};
 repo.instance.bootstrap([sample]);assert.equal(repo.instance.views.get('demo').reveal({card:'public'}),'<b>public</b>');
 assert.equal(styleWrites,1);const css=styleText,initialView=repo.instance.views.get('demo'),initialRules=repo.instance.engine.get('demo');
 let registrations=0,activations=0;const register=repo.instance.views.register.bind(repo.instance.views),activate=repo.instance.engine.activatePack.bind(repo.instance.engine);
 repo.instance.views.register=(...args)=>{registrations++;return register(...args);};repo.instance.engine.activatePack=(...args)=>{activations++;return activate(...args);};
 repo.instance.activate('demo');repo.instance.activate('demo','1.0.0');
 assert.equal(styleWrites,1,'unchanged pack activation must not invalidate the complete stylesheet');
 assert.equal(repo.instance.views.get('demo'),initialView,'unchanged activation preserves the live renderer identity');assert.equal(registrations,0);assert.equal(activations,0);
 repo.instance.views.register('demo',()=>({api:3,family:'board',elements:{field:'external'}}));repo.instance.activate('demo');assert.equal(repo.instance.views.get('demo').render,initialView.render,'activation repairs an externally replaced renderer');
 repo.instance.engine.activatePack({...initialRules,name:'External rules'});repo.instance.activate('demo');assert.equal(repo.instance.engine.get('demo'),initialRules,'activation repairs externally replaced rules');
 const restored=repo.instance.views.get('demo');registrations=0;activations=0;repo.instance.activate('demo');assert.equal(repo.instance.views.get('demo'),restored);assert.equal(registrations,0);assert.equal(activations,0);
 styleNode.textContent='external replacement';repo.instance.activate('demo');
 assert.equal(styleText,css,'activation still restores changed stylesheet contents');assert.equal(styleWrites,3);
 assert.equal(repo.instance.views.get('demo').seating,'row');
 const next=bundle('next');next.manifest.version='1.1.0';next.files['rules.js']=require('./pack-fixture.cjs').rules({id:'demo',name:'Demo next',version:'1.1.0',min:1,max:2,preset:'base'});repo.instance.install(repo.instance.prepare(next),{activate:false});
 repo.instance.activate('demo','1.1.0');assert.equal(repo.instance.engine.get('demo').version,'1.1.0');assert.notEqual(repo.instance.views.get('demo').render,initialView.render);
 repo.instance.activate('demo','1.0.0');assert.equal(repo.instance.engine.get('demo').version,'1.0.0');assert.equal(repo.instance.views.get('demo').render,initialView.render);assert.equal(repo.instance.views.get('demo').reveal({card:'public'}),'<b>public</b>');
 const invalid=bundle('invalid-reveal');invalid.files['view.js']=sample.files['view.js'].replace("reveal:value=>'<b>'+value.card+'</b>'","reveal:'bad'");assert.throws(()=>repo.instance.prepare(invalid),/Invalid reveal renderer/);
 invalid.files['view.js']=sample.files['view.js'].replace("seating:'row'","seating:'bad'");assert.throws(()=>repo.instance.prepare(invalid),/Invalid seating policy/);
});
