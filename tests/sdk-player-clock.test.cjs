'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js'),Registration=require('../core/model-registration.js'),Codec=require('../core/session-codec.js');
const definition={contractVersion:1,id:'sdk-clock-fixture',minPlayers:2,maxPlayers:2,create:()=>({playerCount:2,turn:0,status:'playing',winners:[],data:{phase:'drawing',deadline:1000,count:0},clock:0}),validate:p=>Number.isInteger(p.data.count),actions:()=>[],inputs:(p,a)=>p.data.phase==='drawing'&&a===0?[{command:{type:'draw'},visibility:'public',fields:{value:{kind:'integer',min:0,max:9}}}]:[],reduce:(p,a,c,ctx)=>({position:{...p,data:{...p.data,count:p.data.count+1}},events:[{type:'clock.draw',actor:a,params:{now:ctx.now},visibility:{kind:'public'}}]}),clockActions:p=>p.data.phase==='guessing'?[{type:'end-guessing'}]:[],advance:(p,now,control)=>control?{position:{...p,data:{...p.data,phase:'result',deadline:now}},events:[]}:p.data.phase==='drawing'&&now>=1000?{position:{...p,data:{...p.data,phase:'guessing',deadline:2000}},events:[{type:'clock.expired',actor:null,params:{},visibility:{kind:'public'}}]}:null,project:p=>p.data,result:p=>({winners:p.winners,places:[1,1],metrics:[{id:'points',values:[0,0]}]})};
const presentation={metadata:{name:'Clock fixture',presets:[{id:'classic',label:'Classic'}],rules:[]},action:()=>'',event:()=>({message:'Clock changed'}),scene:p=>({contractVersion:1,id:'clock',family:'board',players:[0,1].map(player=>({player,metrics:[]})),clock:{phase:p.data.phase,deadline:p.data.deadline},cells:[]}),metric:()=> 'Points'};
let validatedPosition;
const observedDefinition={...definition,validate(position){validatedPosition=position;return definition.validate(position);}};
E.register({...Registration.adapt(E,{definition:observedDefinition,presentation,locales:{ru:{}},version:'1.0.0'}),isolated:true});
function setup(options={}){let now=0,id=0;const timers=new Map(),clock={now:()=>now,setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:i=>timers.delete(i)};const session=new Session(E,'sdk-clock-fixture',{players:[{name:'A'},{name:'B'}],seed:1},{now:()=>10}),authority=new Authority(session,{clock,...options});return {session,authority,clock,setNow:n=>{now=n;},client:authority.connect(0)};}
test('normal authority rejects drawing after deadline and persists the same clock transition before ACK',async()=>{let value,writes=0;value=setup({persistence:{async commit(entry){assert.equal(value.session.current.move,entry.previousRevision);assert.equal(entry.action.actor,-1);assert.equal(entry.receipt.hostClock,true);writes++;},async recordReceipt(){}}});try{const initial=value.session.export(),command=P.command(value.client.snapshot(),{type:'draw',value:1},'late');value.setNow(1000);const receipt=await value.client.dispatch(command);assert.equal(receipt.code,'STALE');assert.equal(writes,1);assert.equal(value.session.current.data.phase,'guessing');assert.equal(value.session.current.data.count,0);assert.equal(value.session.states.length,2);const state=Session.storageState(E,value.session.current),restored=Session.restoreCheckpoint(E,{initial,checkpoint:{state,fingerprint:Codec.fingerprint(state)},actions:JSON.parse(value.session.serialize()).actions,updatedAt:value.session.updatedAt});assert.deepEqual(restored.states,value.session.states);}finally{value.authority.dispose();}});
test('failed clock storage preserves the prior state and exact history',async()=>{const value=setup({persistence:{async commit(){throw Error('quota');},async recordReceipt(){}}});try{value.setNow(1000);await assert.rejects(value.authority.advanceClock(),/STORAGE_ERROR/);assert.equal(value.session.current.data.phase,'drawing');assert.equal(value.session.current.move,0);assert.equal(value.session.states.length,1);assert.equal(value.client.snapshot().clockError,'STORAGE_ERROR');assert.equal(value.client.snapshot().inputAllowed,false);}finally{value.authority.dispose();}});
test('pause freezes the clock and save/restore retains elapsed time without game revisions',async()=>{const value=setup();try{value.setNow(500);let snapshot=value.client.snapshot();assert((await value.client.dispatch(P.command(snapshot,{type:'session-pause',paused:true,expectedControlRevision:0},'pause'))).ok);assert.equal(value.authority.gameTime,500);value.setNow(5000);assert.equal(value.authority.gameTime,500);const saved=JSON.parse(value.session.serialize());assert.equal(saved.encoding,'actions-v3');const restored=Session.restore(E,saved,{now:()=>10});assert.equal(restored.clockTime,500);assert.equal(restored.current.move,0);snapshot=value.client.snapshot();assert((await value.client.dispatch(P.command(snapshot,{type:'session-pause',paused:false,expectedControlRevision:1},'resume'))).ok);value.setNow(5500);value.authority.advanceClock();assert.equal(value.session.current.data.phase,'guessing');}finally{value.authority.dispose();}});
test('clock and timed commands replay through the explicit action encoding and common history',async()=>{const value=setup();try{value.setNow(200);assert((await value.client.dispatch(P.command(value.client.snapshot(),{type:'draw',value:1},'draw'))).ok);value.setNow(1000);value.authority.advanceClock();const saved=JSON.parse(value.session.serialize());assert.equal(saved.encoding,'actions-v3');assert.equal(saved.actions[0].now,200);assert.equal(saved.actions[1].actor,-1);const restored=Session.restore(E,saved,{now:()=>10});assert.deepEqual(restored.current,value.session.current);assert.equal(restored.states.length,3);assert.equal(restored.view(0,1).data.phase,'drawing');}finally{value.authority.dispose();}});

test('history shares unchanged progress across player and clock transitions',()=>{
 const {session,authority,client}=setup();
 const pack=E.get(session.game,session.packVersion),restricted=pack.restrictedScene;let rebuilds=0;
 pack.restrictedScene=(...args)=>{rebuilds++;return restricted(...args);};
 try{
  const initial=session.current,before=client.snapshot();assert.equal(rebuilds,0);
  const drawn=session.act(0,{type:'draw',value:1});
  assert.equal(session.lastCommitWasClock,false);
  assert.equal(drawn.data,validatedPosition.data,'history retains the model-owned result by reference');
  const expired=session.advanceClock(1000);
  assert.equal(session.lastCommitWasClock,true);
  assert.equal(expired.data,validatedPosition.data);
  assert.equal(drawn.data.phase,'drawing');
  assert(Object.isFrozen(drawn.data));
  assert.equal(drawn.timeline,initial.timeline);assert.equal(expired.timeline,drawn.timeline);
  assert.equal(session.view(0).timeline,expired.timeline);assert.equal(expired.events[0],drawn.events[0]);
  const after=client.snapshot();assert.equal(after.state.timeline,before.state.timeline);
  assert.equal(before.state.sdkProjection.inputs.length,1);assert.equal(after.state.sdkProjection.inputs.length,0);
  assert.deepEqual(Session.restore(E,JSON.parse(session.serialize())).states,session.states);
 }finally{pack.restrictedScene=restricted;authority.dispose();}
});

test('explicit SDK frames share authorized input and checkpoints with the wire recipient',()=>{
 const Projection=require('../presentation/network-projection.js'),id='sdk-direct-wire-fixture';
 const mark={type:'mark'},hidden={type:'private-mark'},scene=p=>({...presentation.scene(p),nextPlayer:1,
   nextPlayerByCard:p.viewer===0?{sample:1}:{},interactions:p.actions.filter(command=>command.type===mark.type).map(command=>({
    command,source:{entity:{namespace:'card',id:'sample'}},target:{zone:'field'}
   }))});
 const authored={...definition,id,actions:(p,actor)=>actor===0?[{command:mark,visibility:'public'},{command:hidden,visibility:'private'}]:[]};
 const adapter=Registration.adapt(E,{definition:authored,presentation:{...presentation,scene,eventScenes:p=>p.events
   .filter(event=>event.type==='clock.draw'&&event.revision===p.revision)
   .map(event=>({eventId:event.id,scene:{...presentation.scene(p),id:'clock-checkpoint'}}))},locales:{ru:{}},version:'1.0.0'});
 E.register({...adapter,isolated:true});
 const session=new Session(E,id,{players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0}),authority=new Authority(session);
 const player=authority.connect(0),table=authority.connectTable([0,1]),spectator=authority.connect(-1),pack=E.get(id);
 let sceneModel,sceneCalls=0;
 const restricted=pack.restrictedScene;
 pack.restrictedScene=(projection,...rest)=>{sceneCalls++;sceneModel=projection;return restricted(projection,...rest);};
 try{
  session.act(0,{type:'draw',value:2},{now:0});
  const roundTrip=(frame)=>{
   assert.equal(sceneCalls,0,'the host does not build a scene for a wire frame');
   const wire=P.parse(JSON.stringify(Projection.compact(frame)));
   assert(!Object.hasOwn(wire.state.sdkProjection,'events'),'the wire carries the journal once');
   const restored=Projection.restore(wire,event=>pack.presentEvent(event,wire.state.players),pack);
   assert.equal(sceneCalls,1);sceneCalls=0;
   const model=P.projectedModel(restored);
   assert.equal(sceneModel,model,'the scene and input share the same authorized model');
   assert.equal(model.events.at(-1),wire.events.at(-1));
   assert.equal(restored.events.at(-1).scene.id,'clock-checkpoint');
   const compacted=Projection.compact(restored);
   assert(!Object.hasOwn(compacted.state.sdkProjection,'events'));
   assert(!Object.hasOwn(compacted.events.at(-1),'scene'));
   return restored;
  };
  const live=roundTrip(player.snapshot({wire:true}));
  assert.deepEqual(live.state.scene.nextPlayerByCard,{sample:1});
  assert.equal(P.projectedModel(live).inputs.length,1);
  const shared=roundTrip(table.snapshot({wire:true}));
  assert.deepEqual(shared.actions.map(action=>action.type),[mark.type]);
  assert.deepEqual(P.projectedModel(shared).actions,[mark]);
  assert.equal(P.projectedModel(shared).inputs.length,1);
  for(const frame of [player.history(1,{wire:true}),spectator.snapshot({wire:true})]){
   const restored=roundTrip(frame);
   assert.equal(restored.state.scene.nextPlayer,1);
   assert.deepEqual(restored.state.scene.nextPlayerByCard,{});
   assert.deepEqual(restored.actions,[]);
   assert.deepEqual(P.projectedModel(restored).inputs,[]);
  }
 }finally{pack.restrictedScene=restricted;authority.dispose();}
});

test('normal engine reaches authored typed-input bots and preserves null when none is authored',()=>{
 const id='sdk-input-bot-fixture',inputDefinition={...definition,id,bot:()=>({type:'draw',value:7})};
 E.register({...Registration.adapt(E,{definition:inputDefinition,presentation,locales:{ru:{}},version:'1.0.0'}),isolated:true});
 const state=E.createGame(id,{players:[{name:'Bot',bot:true},{name:'Human'}],firstPlayerMode:'assigned',firstPlayer:0}),chosen=E.botAction(state);
 assert.equal(chosen.value,7);assert.equal(E.applyAction(state,0,chosen).data.count,1);
 const noBot=setup();try{assert.equal(E.botAction(noBot.session.current),null);}finally{noBot.authority.dispose();}
});
test('human-only capability is enforced by engine and room authority',async()=>{
 const id='sdk-human-fixture';E.register({...Registration.adapt(E,{definition:{...definition,id},presentation,locales:{ru:{}},version:'1.0.0'}),capabilities:{bots:false},isolated:true});
 assert(E.createGame(id).players.every(player=>!player.bot));assert.throws(()=>E.createGame(id,{players:[{name:'Bot',bot:true},{name:'Human'}]}),error=>error.code==='BOTS_UNSUPPORTED');
 const Rooms=require('../application/rooms.js'),service=new Rooms.RoomService({idFactory:()=> 'room',clock:()=>1,random:()=>0,tokenFactory:()=> 'a'.repeat(64)}),room=service.create({name:'Human room',transportMode:'hotseat',host:{id:'human',nickname:'Human'},game:{id,name:'Human game',version:'1.0.0',capabilities:{bots:false}},constraints:{min:2,max:3}});
 assert.throws(()=>service.setLocalSeat(room.id,'human',room.seats[1].id,{kind:'bot'}),error=>error.code==='BOTS_UNSUPPORTED');
 assert.equal(service.snapshot(room.id).participants.length,1);const authority=new Authority(new Session(E,id));try{authority.setViewerConnected(1,false);await assert.rejects(authority.setPlayerControl(1,{bot:true},{requestId:'no-temporary-bot',expectedRevision:0}),/BOTS_UNSUPPORTED/);assert.equal(authority.connect(0).snapshot().playerControls[1].bot,false);}finally{authority.dispose();}
});

test('normal isolated saves retain signed secondary result metrics',()=>{
 const id='sdk-signed-details-fixture',signed={...definition,id,inputs:undefined,actions:p=>p.status==='playing'?[{command:{type:'finish'},visibility:'public'}]:[],reduce:p=>({position:{...p,status:'finished',winners:[1]},events:[]}),score:()=>[-1,0],result:()=>({winners:[1],places:[2,1],metrics:[{id:'points',values:[-1,0]},{id:'penalties',values:[-2,0]}]})};
 E.register({...Registration.adapt(E,{definition:signed,presentation,locales:{ru:{}},version:'1.0.0'}),isolated:true});
 const session=new Session(E,id,{players:[{name:'A'},{name:'B'}],seed:1,firstPlayerMode:'assigned',firstPlayer:0});session.act(0,{type:'finish'});
 assert.deepEqual(session.current.result.values,[-1,0]);assert.deepEqual(session.current.result.details,[-2,0]);assert(E.validateState(session.current));
 const restored=Session.restore(E,JSON.parse(session.serialize()));assert.deepEqual(restored.current.result,session.current.result);
 const legacy={...E.get(id),id:'legacy-signed-details-fixture',isolated:false};E.register(legacy);const invalid={...session.current,game:legacy.id,players:session.current.players.map(player=>({...player,score:0})),result:{...session.current.result,values:[0,0]}};assert(E.validateState({...invalid,result:{...invalid.result,details:[0.5,0]}}),'legacy finite positive detail values remain valid');assert.throws(()=>E.validateState(invalid),Error,'legacy unsigned result guard remains');
});

test('host clock action stays off player and Table bindings and replays from the journal', async()=>{
  const {session,authority,client,setNow}=setup();
  try{
    const table=authority.connectTable([0,1]);
    setNow(1000);
    authority.advanceClock();
    const [action]=authority.clockActions();
    assert.deepEqual(action,{type:'end-guessing'});
    for(const binding of [client,table]){
      assert.equal(binding.snapshot().actions.some(choice=>choice.type===action.type),false);
      assert.equal((await binding.dispatch(P.command(binding.snapshot(),action,'host-only'))).ok,false);
    }
    assert.equal(session.current.data.phase,'guessing');
    await authority.runClockAction(action);
    assert.equal(session.current.data.phase,'result');
    const saved=JSON.parse(session.serialize());
    assert.deepEqual(saved.actions.at(-1).command.control,action);
    assert.deepEqual(Session.restore(E,saved).states,session.states);
    await assert.rejects(authority.runClockAction(action),/CLOCK_ACTION_UNAVAILABLE/);
  }finally{authority.dispose();}
});
