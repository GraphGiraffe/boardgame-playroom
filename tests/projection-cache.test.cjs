'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),History=require('../core/history.js'),Projection=require('../presentation/network-projection.js'),Rooms=require('../application/rooms.js'),P=require('../core/protocol.js');
const game='one-oh-one';
let sdk;
before(async()=>{sdk=await require('./sdk-installed.cjs').bootstrap({ids:[game,'snakes']});});
after(()=>{if(sdk){for(const {manifest:{id,version}} of sdk.bundles)E.unregisterVersion(id,version);sdk.close();}});
const make=()=>new Session(E,game,{seed:17,players:[{name:'A'},{name:'B'}]});
test('trusted immutable states share model projection per viewer, external frozen shells do not',()=>{
 const s=make(),model=E.get(game,s.packVersion).model,original=model.project;let calls=0;model.project=function(...args){calls++;return original.apply(this,args);};
 try{assert(History.owns(s.current));const a=E.project(s.current,0),b=E.project(s.current,0);assert.equal(a.modelProjection,b.modelProjection);assert.equal(a.timeline,s.current.timeline);assert.equal(calls,1);const other=E.project(s.current,1);assert.notEqual(a.modelProjection,other.modelProjection);assert.equal(calls,2);
 const external=E.clone(s.current);Object.freeze(external);assert(!History.owns(external));const x=E.project(external,0);assert.notEqual(x.timeline,external.timeline);external.data.color=external.data.color==='red'?'blue':'red';const y=E.project(external,0);assert.notEqual(x.modelProjection,y.modelProjection);assert.notEqual(x.modelProjection.data.color,y.modelProjection.data.color);
 }finally{model.project=original;}
});
test('raw wire projection avoids sound calculation and restores to the same authorized view',()=>{
 const s=make(),a=new Authority(s),pack=E.get(game,s.packVersion),bindings=[a.connect(-1),a.connect(0),a.connect(1),a.connectTable([0,1])];
 try{for(let step=0;step<6;step++){
  const timeline=bindings[0].snapshot().state.timeline;
  for(const binding of bindings){const full=binding.snapshot(),present=pack.presentEvent;pack.presentEvent=()=>{throw Error('wire must not format events for sound');};let raw;try{raw=binding.snapshot({wire:true});}finally{pack.presentEvent=present;}
   assert.equal(full.state.timeline,timeline);assert.equal(raw.state.timeline,timeline);
   assert.equal(full.events,full.state.events);assert(!Object.hasOwn(full.state,'data'));
   assert(!Object.hasOwn(raw,'cues'));assert(raw.events.filter(e=>e.type).every(e=>!Object.hasOwn(e,'text')));
   const restored=Projection.restore(Projection.compact(raw),(e,f)=>pack.presentEvent(e,f.state.players));assert.deepEqual(restored.state,full.state);assert.deepEqual(restored.events,full.events);assert.deepEqual(restored.cues,full.cues);assert.deepEqual(restored.effects,full.effects);
  }
  if(s.current.status!=='playing')break;const actor=s.current.turn,action=E.botAction(s.current,actor);s.act(actor,action);
 }}finally{a.dispose();}
});
test('wire restore shares one guest render between ordered event checkpoints and the board',()=>{
 const create=E.createGame;let session;
 E.createGame=(id,options)=>{
  const state=create(id,options);
  Object.assign(state.data,{phase:'move',positions:[22,25],dice:[3,4]});
  return state;
 };
 try{
  session=new Session(E,'snakes',{seed:17,preset:'plus',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]});
 }finally{E.createGame=create;}
 session.act(0,E.availableCommands(session.current,0)[0]);
 const authority=new Authority(session),pack=E.get(session.game,session.packVersion),player=authority.connect(0),table=authority.connectTable([0,1]);
 const render=sdk.host.render,turnOrder=pack.model.turnOrder;
 try{
  for(const [live,history] of [[player.snapshot({wire:true}),player.history(1,{wire:true})],[table.snapshot({wire:true}),table.history(1,{wire:true})]]){
   for(const frame of [live,history]){
    let calls=0,orders=0;
    sdk.host.render=(...args)=>{calls++;return render(...args);};
    pack.model.turnOrder=(...args)=>{orders++;return turnOrder(...args);};
    const restored=Projection.restore(Projection.compact(frame),(event,snapshot)=>pack.presentEvent(event,snapshot.state.players));
    assert.equal(calls,1,'one guest result supplies both checkpoints and the final scene');
    assert.equal(orders,1,'checkpoints and the final board share the validated turn hint');
    assert.deepEqual(restored.events.filter(event=>event.scene).map(event=>event.scene.positions.map(pawn=>pawn.cell)),[[25,22],[29,22]]);
    assert.deepEqual(restored.state.scene.positions.map(pawn=>pawn.cell),[29,22]);
    assert.deepEqual(restored.cues.map(cue=>cue.eventId),[...restored.cues].sort((a,b)=>a.eventId-b.eventId).map(cue=>cue.eventId));
   }
  }
 }finally{sdk.host.render=render;pack.model.turnOrder=turnOrder;authority.dispose();}
});
test('isolated actions and reaction descriptors reuse the owned projection for a revision',()=>{
 const s=make(),pack=E.get(game,s.packVersion),model=pack.model,actor=s.current.turn;
 const comparison=make().current,expected=[...pack.legal(comparison,actor),...pack.reactions(comparison,actor)];
 const {actions}=E.project(s.current,actor).modelProjection,action=actions[0];
 assert(action&&Object.isFrozen(actions)&&Object.isFrozen(action));
 const {legalActions,reactions,reactionWindows}=model;let descriptorReads=0;
 model.legalActions=model.reactions=()=>{throw Error('Projected actions should already be available');};
 model.reactionWindows=(...args)=>{descriptorReads++;return reactionWindows(...args);};
 try{
  assert.deepEqual(E.legalActions(s.current,actor),expected);
  assert.deepEqual(pack.resolveAction(s.current,actor,action),action);
  assert.deepEqual(E.reactionWindows(s.current),E.reactionWindows(s.current));assert.equal(descriptorReads,1);
  const external=Object.freeze(E.clone(s.current));
  assert.deepEqual(E.reactionWindows(external),E.reactionWindows(external));assert.equal(descriptorReads,3);
 }finally{Object.assign(model,{legalActions,reactions,reactionWindows});}
});
test('switching lobby/game preserves raw and formatted subscriptions independently',async()=>{
 const s=make(),a=new Authority(s),binding=a.connect(s.current.turn),switchable=new Rooms.SwitchableConnection(binding),full=[],wire=[];
 const off1=switchable.subscribe(f=>full.push(f)),off2=switchable.subscribe(f=>wire.push(f),{wire:true});
 try{const snap=binding.snapshot(),action=snap.actions.find(a=>a.type==='draw')||snap.actions[0];const reply=await switchable.dispatch(P.command(snap,action,'cache-test'),{wire:true,receiptOnly:true});assert(reply.ok);assert(!Object.hasOwn(reply,'snapshot'));assert.equal(full.length,1);assert.equal(wire.length,1);assert(Object.hasOwn(full[0],'cues'));assert(!Object.hasOwn(wire[0],'cues'));assert.equal(switchable.snapshot({wire:true}).events.filter(e=>e.type&&Object.hasOwn(e,'text')).length,0);
 }finally{
  // During host transfer the old authority closes before its RTC listeners.
  a.dispose();off1();off2();switchable.close();
 }
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
