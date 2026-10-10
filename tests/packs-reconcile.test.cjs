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
    manifest:{id:'demo',name:'Demo',version:'1.0.0',engineApi:1,viewApi:2,stateVersion:1},
    files:{
      'rules.js':"globalThis.TabletopCore.register({id:'demo',name:'Demo',min:1,max:2,presets:[{id:'base'}],create(){},legal(){return[]},apply(){}});",
      'view.js':"globalThis.PlayroomViews.register('demo',()=>({api:2,family:'board',elements:{field:'<div>"+marker+"</div>'}}),()=>'<div>"+marker+"</div>');",
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
