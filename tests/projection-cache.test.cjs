'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),History=require('../core/history.js'),Model=require('../core/model-runtime.js'),Projection=require('../presentation/network-projection.js'),Rooms=require('../application/rooms.js'),P=require('../core/protocol.js');
require('../packs/uno/rules.js');
const make=()=>new Session(E,'uno',{seed:17,players:[{name:'A'},{name:'B'}]});
test('trusted immutable states share model projection per viewer, external frozen shells do not',()=>{
 const s=make(),original=Model.GameModel.prototype.project;let calls=0;Model.GameModel.prototype.project=function(...args){calls++;return original.apply(this,args);};
 try{assert(History.owns(s.current));const a=E.project(s.current,0),b=E.project(s.current,0);assert.equal(a.modelProjection,b.modelProjection);assert.equal(calls,1);const other=E.project(s.current,1);assert.notEqual(a.modelProjection,other.modelProjection);assert.equal(calls,2);
 const external=E.clone(s.current);Object.freeze(external);assert(!History.owns(external));const x=E.project(external,0);external.data.color=external.data.color==='red'?'blue':'red';const y=E.project(external,0);assert.notEqual(x.modelProjection,y.modelProjection);assert.notEqual(x.modelProjection.data.color,y.modelProjection.data.color);
 }finally{Model.GameModel.prototype.project=original;}
});
test('raw wire projection avoids sound calculation and restores to the same authorized view',()=>{
 const s=make(),a=new Authority(s),pack=E.get('uno',s.packVersion),bindings=[a.connect(-1),a.connect(0),a.connect(1),a.connectTable([0,1])];
 try{for(let step=0;step<6;step++){
  for(const binding of bindings){const full=binding.snapshot(),sound=E.soundCues;E.soundCues=()=>{throw Error('wire must not compute sound');};let raw;try{raw=binding.snapshot({wire:true});}finally{E.soundCues=sound;}
   assert(!Object.hasOwn(raw,'cues'));assert(raw.events.filter(e=>e.type).every(e=>!Object.hasOwn(e,'text')));
   const restored=Projection.restore(Projection.compact(raw),(e,f)=>pack.presentEvent(e,f.state.players));assert.deepEqual(restored.state,full.state);assert.deepEqual(restored.events,full.events);assert.deepEqual(restored.cues,full.cues);assert.deepEqual(restored.effects,full.effects);
  }
  if(s.current.status!=='playing')break;const actor=s.current.turn,action=E.botAction(s.current,actor);s.act(actor,action);
 }}finally{a.dispose();}
});
test('switching lobby/game preserves raw and formatted subscriptions independently',async()=>{
 const s=make(),a=new Authority(s),binding=a.connect(s.current.turn),switchable=new Rooms.SwitchableConnection(binding),full=[],wire=[];
 const off1=switchable.subscribe(f=>full.push(f)),off2=switchable.subscribe(f=>wire.push(f),{wire:true});
 try{const snap=binding.snapshot(),action=snap.actions.find(a=>a.type==='draw')||snap.actions[0];const reply=await switchable.dispatch(P.command(snap,action,'cache-test'),{wire:true,receiptOnly:true});assert(reply.ok);assert(!Object.hasOwn(reply,'snapshot'));assert.equal(full.length,1);assert.equal(wire.length,1);assert(Object.hasOwn(full[0],'cues'));assert(!Object.hasOwn(wire[0],'cues'));assert.equal(switchable.snapshot({wire:true}).events.filter(e=>e.type&&Object.hasOwn(e,'text')).length,0);
 }finally{off1();off2();switchable.close();a.dispose();}
});
test('metadata renames and pause controls are rebound instead of using cached scene permissions',async()=>{
 const s=make(),a=new Authority(s),actor=s.current.turn,binding=a.connect(actor);try{binding.snapshot();s.setPlayerMetadata(actor,{name:'Renamed'});const renamed=binding.snapshot();assert.equal(renamed.state.players[actor].name,'Renamed');const pause={type:'session-pause',paused:true,expectedControlRevision:0};assert((await binding.dispatch(P.command(renamed,pause,'pause-cache'))).ok);const stopped=binding.snapshot({wire:true});assert.deepEqual(stopped.actions,[]);assert.equal(stopped.paused,true);assert.equal(stopped.controlRevision,1);
 }finally{a.dispose();}
});

test('internal record composition reuses owned descendants and detaches frozen foreign inputs',()=>{
 const foreign={nested:{n:1}},owned=P.immutable({large:{n:2}}),record=P.composeRecord({large:owned.large,foreign:Object.freeze(foreign)}),array=P.composeArray([owned.large,foreign]);assert.equal(record.large,owned.large);assert.equal(array[0],owned.large);foreign.nested.n=9;assert.equal(record.foreign.nested.n,1);assert.equal(array[1].nested.n,1);assert.equal(P.immutable(record),record);
 const bad=JSON.parse('{"__proto__":{"polluted":true}}'),safe=P.composeRecord(bad);assert.equal({}.polluted,undefined);assert.equal(safe.__proto__.polluted,true);assert(Object.isFrozen(safe.__proto__));
});
test('metadata revision accepts a rename without a game move and ignores repeated values',()=>{
 const s=make(),a=new Authority(s),binding=a.connect(0),client=new (require('../app/session-client.js'))({});try{client.accept(binding.snapshot());s.setPlayerMetadata(0,{name:'New'});const renamed=binding.snapshot();assert.equal(renamed.revision,client.snapshot.revision);assert.equal(renamed.rosterRevision,1);assert(client.accept(renamed));assert.equal(client.snapshot.state.players[0].name,'New');s.setPlayerMetadata(0,{name:'New'});assert.equal(s.metadataRevision,1);}finally{client.close();a.dispose();}
});

test('JSON receive owns freshly parsed graphs without trusting pre-existing objects',()=>{
 const parsed=P.parse('{"nested":{"value":2},"__proto__":{"polluted":true}}');assert.equal(P.immutable(parsed),parsed);assert.equal(P.composeRecord({nested:parsed.nested}).nested,parsed.nested);assert(Object.isFrozen(parsed.nested));assert.equal({}.polluted,undefined);assert.equal(parsed.__proto__.polluted,true);assert.throws(()=>P.parse({}),/JSON_WIRE_INVALID/);
});
