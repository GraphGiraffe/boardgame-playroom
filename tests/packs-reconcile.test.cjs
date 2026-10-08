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
    manifest:{id:'demo',name:'Demo',version:'1.0.0',engineApi:1,stateVersion:1},
    files:{
      'rules.js':"globalThis.TabletopCore.register({id:'demo',name:'Demo',min:1,max:2,presets:[{id:'base'}],create(){},legal(){return[]},apply(){}});",
      'view.js':"globalThis.PlayroomViews.register('demo',()=>'<div>"+marker+"</div>',()=>'<div>"+marker+"</div>');",
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

// Legacy bootstrap must never discard saved conflicting game code without an
// explicit permission check against live saved-game references.
test('bundled conflict remains available while a saved game needs that exact version',()=>{
  const current=bundle('current'),old=bundle('old');
  const saved={format:'playroom-packs',formatVersion:1,packs:[old],active:{demo:'1.0.0'},removed:[]};
  const retained=manager(saved);
  retained.instance.bootstrap([current]);
  assert.match(retained.instance.warnings.join(' '),/для совместимости партий/i);
  assert.match(retained.instance.exportPack('demo','1.0.0'),/old/);
  const explicit=manager(saved);
  explicit.instance.bootstrap([current],{preserveSavedConflict:()=>true});
  assert.match(explicit.instance.exportPack('demo','1.0.0'),/old/);
});

test('reconcile releases obsolete conflict, restores bundled game and updates persisted bytes',()=>{
  const current=bundle('current'),old=bundle('old');
  const saved={format:'playroom-packs',formatVersion:1,packs:[old],active:{demo:'1.0.0'},removed:[]};
  const repo=manager(saved);
  repo.instance.bootstrap([current]);
  let dependent=true;
  const library={references:(game,version)=>dependent&&game==='demo'&&version==='1.0.0'?['game-1']:[]};
  delete require.cache[require.resolve('../app/pack-manager.js')];
  const previousPacks=globalThis.TabletopPacks;
  try{globalThis.TabletopPacks=null;require('../app/pack-manager.js');}
  finally{globalThis.TabletopPacks=previousPacks;}
  globalThis.PlayroomPackLoadError=repo.instance.warnings.join(' ');
  globalThis.PlayroomPackManager.reconcile(repo.instance,library,[current]);
  assert.match(repo.instance.exportPack('demo','1.0.0'),/old/);
  assert.match(globalThis.PlayroomPackLoadError,/для совместимости партий/i);

  dependent=false; // The last matching saved game was removed.
  globalThis.PlayroomPackManager.reconcile(repo.instance,library,[current]);
  assert.equal(globalThis.PlayroomPackLoadError,'');
  assert.deepEqual(repo.instance.warnings,[]);
  assert.match(repo.instance.exportPack('demo','1.0.0'),/current/);
  assert.doesNotMatch(repo.raw(),/old/);
  assert.match(repo.raw(),/current/);
  // A new page loads the same corrected version, not the abandoned archive.
  const reloaded=manager(JSON.parse(repo.raw()));
  reloaded.instance.bootstrap([current]);
  assert.match(reloaded.instance.exportPack('demo','1.0.0'),/current/);
});

test('reconcile handles absent managers and does not mutate unrelated pack data',()=>{
  const {reconcile}=globalThis.PlayroomPackManager;
  assert.deepEqual(reconcile(null,null,[]),[]);
  const current=bundle('current');
  const repo=manager({format:'playroom-packs',formatVersion:1,packs:[],active:{},removed:[]});
  repo.instance.bootstrap([current]);
  const before=repo.instance.exportPack('demo','1.0.0');
  reconcile(repo.instance,{references:()=>[]},[current]);
  assert.equal(repo.instance.exportPack('demo','1.0.0'),before);
});
