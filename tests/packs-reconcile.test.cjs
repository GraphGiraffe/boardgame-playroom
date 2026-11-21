'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Packs=require('../core/packs.js');
const PackStorage=require('../platform/web/pack-storage.js');
function durable(raw=null){
 let value=raw;
 return {getItem:()=>value,setItem:(_key,next)=>{value=next;},removeItem:()=>{value=null;},async transact(fn,{guard}={}){guard?.();return fn();}};
}

test('compressed pack storage preserves exact versions, quarantine, preferences and recovery bytes',async()=>{
 const old=bundle('old'),current=bundle('current');current.manifest.version='1.1.0';
 const snapshot=JSON.stringify({format:'playroom-packs',formatVersion:1,packs:[old,current],active:{demo:'1.1.0'},removed:['other@1.0.0'],quarantined:[{bundle:bundle('quarantine'),reason:'retained'}],rawBackups:['invalid bytes '.repeat(1000)]});
 const data=durable(snapshot),storage=await PackStorage.create({data,key:'packs'});assert.equal(storage.get(),snapshot);
 await storage.commit(snapshot);assert.equal(JSON.parse(data.getItem()).encoding,'gzip-base64-v1');assert(Buffer.byteLength(data.getItem())<Buffer.byteLength(snapshot)/2);
 const compression=require('../application/save-compression.js'),transact=data.transact;
 let encodes=0,transactions=0;
 data.transact=(...args)=>{transactions++;return transact(...args);};
 const codec={...compression,encode(...args){encodes++;return compression.encode(...args);}};
 const reloaded=await PackStorage.create({data,key:'packs',codec});assert.equal(reloaded.get(),snapshot);
 const physical=data.getItem();
 await reloaded.commit(snapshot);
 assert.deepEqual({encodes,transactions},{encodes:0,transactions:0});
 assert.equal(data.getItem(),physical);
 await assert.rejects(reloaded.commit(snapshot,{guard(){throw Error('stale');}}),/stale/);
 const incompatible=JSON.parse(snapshot);incompatible.quarantined[0].bundle.manifest.engineApi=3;await reloaded.commit(JSON.stringify(incompatible));assert.equal(JSON.parse(reloaded.get()).quarantined[0].bundle.manifest.engineApi,3);
});
test('compressed pack storage failures and cancellation preserve prior bytes; plain fallback and deletion work',async()=>{
 const before='original bytes',data=durable(before),compression=require('../application/save-compression.js');
 const failed=await PackStorage.create({data,key:'packs',codec:{encoding:compression.encoding,encode:async()=>{throw Error('compression failed');}}});
 await assert.rejects(failed.commit('x'.repeat(2000)),/compression failed/);assert.equal(data.getItem(),before);assert.equal(failed.get(),before);
 const storage=await PackStorage.create({data,key:'packs'}),transaction=data.transact;data.transact=async()=>{throw Error('quota');};
 await assert.rejects(storage.commit('x'.repeat(2000)),/quota/);assert.equal(data.getItem(),before);assert.equal(storage.get(),before);data.transact=transaction;
 let current=true;const cancelled=await PackStorage.create({data,key:'packs',codec:{encoding:compression.encoding,encode:async value=>{current=false;return compression.encode(value,10000);}}});
 await assert.rejects(cancelled.commit('x'.repeat(2000),{guard:()=>{if(!current)throw Error('cancelled');}}),/cancelled/);assert.equal(data.getItem(),before);assert.equal(cancelled.get(),before);
 const plain=await PackStorage.create({data,key:'packs',codec:null});await plain.commit('x'.repeat(2000));assert.equal(data.getItem(),'x'.repeat(2000));await plain.commit('{}');assert.equal(data.getItem(),'{}');await plain.commit(null);assert.equal(data.getItem(),null);assert.equal(plain.get(),null);
});
test('corrupt compressed pack storage reaches quarantine without losing the original bytes',async()=>{
 const raw=JSON.stringify({format:'playroom-pack-storage',version:1,encoding:'gzip-base64-v1',data:'broken'}),data=durable(raw),storage=await PackStorage.create({data,key:'packs'});
 assert.equal(storage.get(),raw);const repo=new Packs({engine:engine(),views:views(),catalog:{},document:null,storage});
 await repo.bootstrap([bundle('current')]);assert.equal(repo.list().length,1);assert.deepEqual(JSON.parse(storage.get()).rawBackups,[raw]);
 assert.equal((await PackStorage.create({data,key:'packs'})).get(),storage.get());
});

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
  // Explicit operator trust is confined to these legacy compatibility fixtures.
  const instance=new Packs({allowTrustedLegacy:true,engine:engine(),views:views(),catalog,document:null,storage:{get:()=>raw,set:value=>{raw=value;}}});
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


test('stable release update stays active through reload cleanup and repeated update checks',async()=>{
 const {RemoteCatalog,validate}=require('../app/remote-catalog.js'),Cleanup=require('../application/pack-update-cleanup.js'),crypto=require('node:crypto'),preview=bundle('preview'),stable=bundle('stable');preview.manifest.version='0.6.8-preview.26';stable.manifest.version='0.6.8';for(const item of [preview,stable])item.files['rules.js']=require('./pack-fixture.cjs').rules({id:'demo',name:'Demo',version:item.manifest.version,min:1,max:2,preset:'base'});
 const raw=JSON.stringify(stable),sha=crypto.createHash('sha256').update(raw).digest('hex'),entry={id:'demo',name:'Demo',version:stable.manifest.version,stateVersion:1,engineApi:4,viewApi:3,sha256:sha,url:'/api/packs/files/demo/0.6.8/'+sha+'.playroom-pack.json'},catalog=validate({format:'playroom-catalog',version:1,collection:'0.8.10',packs:[entry]});let downloads=0;
 const first=manager({format:'playroom-packs',formatVersion:1,packs:[preview],active:{demo:preview.manifest.version},removed:['demo@0.6.8']});await first.instance.bootstrap([preview]);
 const makeRemote=m=>{const remote=new RemoteCatalog({manager:m,storage:{getItem:()=>null,setItem(){}},crypto:crypto.webcrypto,fetcher:async()=>{downloads++;return new Response(raw);}});remote.current=catalog;return remote;};
 assert.equal(makeRemote(first.instance).pending().length,1);await makeRemote(first.instance).install('demo',{activate:true});
 let current=manager(JSON.parse(first.raw()));await current.instance.bootstrap([preview]);assert.equal(current.instance.list().find(p=>p.active).version,'0.6.8','reloading must not reactivate the prerelease');
 let pinned=true;const cleanup=m=>new Cleanup({manager:m,localReferences:(_id,version)=>pinned&&version===preview.manifest.version?['saved-preview-match']:[],networkArchives:async()=>[],removeLocal:async()=>{pinned=false;},activeRoom:()=>false,compare:Packs.compareVersions});
 assert.deepEqual((await cleanup(current.instance).plan()).retained,[]);assert.equal((await cleanup(current.instance).plan()).items[0].saves,1);assert.equal(current.instance.activate('demo',preview.manifest.version).version,preview.manifest.version,'saved matches resolve their exact prerelease');assert.deepEqual(cleanup(current.instance).oldVersions(),[],'newer inactive stable release is never an old-version cleanup candidate');current.instance.activate('demo');assert.equal(current.instance.list().find(p=>p.active).version,'0.6.8');
 pinned=false;
 for(let cycle=0;cycle<3;cycle++){
  await cleanup(current.instance).removeUnused(await cleanup(current.instance).plan());assert.deepEqual(current.instance.list().map(p=>p.version),['0.6.8']);assert.deepEqual(makeRemote(current.instance).pending(),[]);
  current=manager(JSON.parse(current.raw()));await current.instance.bootstrap([preview]);assert.equal(current.instance.list().find(p=>p.active).version,'0.6.8');assert.deepEqual(makeRemote(current.instance).pending(),[]);
 }
 assert.equal(downloads,1,'cleanup and reload cannot cause repeat downloads');
});

test('remote catalog never offers an older release or prerelease over a newer installed version',()=>{
 const {RemoteCatalog}=require('../app/remote-catalog.js');
 for(const [installed,available,pending] of [['0.6.8-preview.26','0.6.8',true],['0.6.8','0.6.8-preview.26',false],['0.6.9-preview.2','0.6.8',false],['0.6.7','0.6.8',true],['0.6.8-preview.9','0.6.8-preview.10',true],['0.6.8-preview.10','0.6.8-preview.9',false],['0.6.8','0.6.8+rebuilt',false]]){
  const remote=new RemoteCatalog({manager:{list:()=>[{id:'demo',version:installed}]},storage:{getItem:()=>null}});remote.current={packs:[{id:'demo',version:available}]};assert.equal(remote.pending().length,Number(pending),installed+' -> '+available);
 }
});

test('renamed games update from a legacy ID once and preserve the exact historical pack',()=>{
 const {RemoteCatalog}=require('../app/remote-catalog.js');
 for(const [id,legacy] of [['one-oh-one','uno'],['fleet-grid','battleship'],['dice-poker','yatzy']]){
  const installed=[{id:legacy,version:'9.0.0'}],remote=new RemoteCatalog({manager:{list:()=>installed},storage:{getItem:()=>null}});
  const item={id,version:'1.0.0',replaces:[legacy]};remote.current={packs:[item]};
  assert.deepEqual(remote.updates(),[item]);
  installed.push({id,version:item.version});assert.deepEqual(remote.updates(),[]);
  assert.equal(installed[0].id,legacy);
 }
});
