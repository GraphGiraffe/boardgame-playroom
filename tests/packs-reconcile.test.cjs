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

test('bundled conflict is preserved only while a saved game still needs it',()=>{
  const current=bundle('current'),old=bundle('old');
  const saved={format:'playroom-packs',formatVersion:1,packs:[old],active:{demo:'1.0.0'},removed:[]};

  const kept=manager(saved);
  kept.instance.bootstrap([current],{preserveSavedConflict:()=>true});
  assert.match(kept.instance.warnings.join(' '),/для совместимости партий/i);
  assert.match(kept.instance.exportPack('demo','1.0.0'),/old/);

  const released=manager(saved);
  released.instance.bootstrap([current],{preserveSavedConflict:()=>false});
  assert.deepEqual(released.instance.warnings,[]);
  assert.match(released.instance.exportPack('demo','1.0.0'),/current/);
  assert.doesNotMatch(released.raw(),/old/);
});

test('pack-manager reconcile clears stale compatibility warning when no saves reference the version',()=>{
  delete require.cache[require.resolve('../app/pack-manager.js')];
  globalThis.PlayroomPackLoadError='Старое предупреждение';
  require('../app/pack-manager.js');
  const manager={
    warnings:['Старое предупреждение'],
    bootstrap(_bundles,options){
      assert.equal(options.preserveSavedConflict('demo','1.0.0'),false);
      this.warnings=[];
      return [{id:'demo',version:'1.0.0'}];
    },
    list(){return[];}
  };
  const library={references:()=>[]};
  const list=globalThis.PlayroomPackManager.reconcile(manager,library,[]);
  assert.equal(list[0].id,'demo');
  assert.equal(globalThis.PlayroomPackLoadError,'');
});
