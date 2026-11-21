'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const flush=()=>new Promise(setImmediate);
const Feedback=require('../app/game-feedback.js');
const initial=[{id:1,text:'start'}],unocall={id:2,text:'Игрок: UNO!',notice:{title:'UNO!',detail:'Одна карта',tone:'success'}};
test('feedback plays only newly committed projected sound/event IDs and keeps no private state',async()=>{
  const audio=[],timers=new Map();let id=0;
  const feedback=new Feedback({mount:()=>null,play:(ids,pack)=>audio.push({ids,pack}),clock:{setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:k=>timers.delete(k)}});
  feedback.start(initial);
  feedback.accept([...initial,unocall],[{eventId:2,id:'uno.call'}],'uno');
  await flush();assert.equal(feedback.notice,null);assert.equal(timers.size,0,'Routine actions never create timed overlays');assert.deepEqual(audio,[{ids:['uno.call'],pack:'uno'}]);
  feedback.accept([...initial,unocall],[{eventId:2,id:'uno.call'}],'uno');assert.equal(audio.length,1,'A duplicate ACK/snapshot must be silent');
  feedback.accept([...initial,unocall,{id:3,notice:{title:'Штраф',tone:'danger'},text:'Penalty'}],[{eventId:3,id:'penalty'}],'uno',{
    silent:true,finalScene:{players:[],get zones(){assert.fail('silent catch-up must not construct visual checkpoints');}}
  });
  assert.equal(feedback.cursor,3);
  assert.equal(audio.length,1,'History/reconnect must not play queued sounds');
  assert.equal(feedback.notice,null);assert.equal(timers.size,0,'Routine actions never create timed overlays');
  for(const f of [...timers.values()])f();assert.equal(feedback.notice,null);
  feedback.destroy();
});
test('a route starts before capture feedback and owns the contact cue',async()=>{
 const sequence={trigger:'move',arrival:'after-departures',departures:[{namespace:'token',id:'defender'}]};
 const events=[{id:1,revision:1,player:0,kind:'capture',feedback:{kind:'capture',player:1}},
  {id:2,revision:1,player:0,kind:'move',presentation:{type:'move'}}];
 const cues=[{eventId:1,id:'attack.capture'},{eventId:2,id:'move'}];
 for(const cancel of [false,true]){
  const calls=[],feedback=new Feedback({mount:()=>null,play:ids=>calls.push(...ids)});
  let impact,complete;
  const movement=new Promise(resolve=>{complete=resolve;});
  feedback.accept(events,cues,'route-demo',{snapshot:{action:{type:'move'}},finalScene:{motionSequence:sequence},motion:(_context,{snapshot})=>{
   assert.equal(snapshot.sequence,sequence);
   impact=snapshot.onRouteContact;
   calls.push('route');return movement;
  }});
  await flush();
  assert.deepEqual(calls,['route','move']);
  const idle=feedback.whenIdle();
  if(cancel)feedback.clear();
  impact();impact();
  complete();await idle;await flush();
  assert.deepEqual(calls,cancel?['route','move']:['route','move','attack.capture']);
  feedback.destroy();
 }
});
test('dialogue sounds accompany their bubbles; instant playback prefers the reply',async()=>{
 for(const mode of ['fast','instant']){
 const audio=[],timers=[];const f=new Feedback({mount:()=>null,play:ids=>audio.push(...ids),clock:{setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}}});
 f.accept([{id:1,revision:1,speech:{speaker:0,text:'Туз'}},{id:2,revision:1,speech:{speaker:1,icon:'cross',result:'error'}}],[{eventId:1,id:'move'},{eventId:2,id:'mismatch'}],'gofish',{mode});
 await flush();assert.deepEqual(audio,mode==='instant'?[]:['move']);
 timers[0].fn();await flush();assert.deepEqual(audio,mode==='instant'?['mismatch']:['move','mismatch']);
 f.clear();assert.equal(f.active,null);assert.equal(f.queue.length,0);
 }
});
test('a spoken transfer sounds with the answer while flight waits for its animation',async()=>{
 for(const animated of [false,true]){
  const calls=[],timers=[],f=new Feedback({mount:()=>null,play:ids=>calls.push(...ids),clock:{setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}}});
  let finishAnswer;const animation={effect:{getTiming:()=>({iterations:2})},finished:new Promise(resolve=>finishAnswer=resolve),pause(){},play(){},cancel(){finishAnswer();}};
  f.bubble={getAnimations:()=>[animation]};
  f.accept([{id:1,speech:{speaker:1,result:'success'},transfer:{player:0,count:2,from:'hand',fromPlayer:1}}],[{eventId:1,id:'success'}],'gofish',{mode:'fast',...(animated?{motion:()=>calls.push('flight')}:{})});
  await flush();assert.deepEqual(calls,['success'],'Answer sound starts with the bubble');
  timers[0].fn();await flush();assert.deepEqual(calls,['success'],'Reading timer must not interrupt the visible answer animation');
  finishAnswer();await f.whenIdle();assert.deepEqual(calls,animated?['success','flight']:['success']);f.destroy();
 }
});
test('dice results have readable hold times while card reveal timing stays unchanged',async()=>{
 for(const [mode,duration] of Object.entries({instant:250,fast:450,normal:700,slow:1000})){
  const timers=[],f=new Feedback({mount:()=>null,clock:{setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}}});
  f.accept([{id:1,reveal:{kind:'dice',dice:[{value:6}]}}],[],'any',{mode});
  await flush();assert.equal(timers[0].ms,duration);f.clear();
  f.accept([{id:2,reveal:{kind:'card'}}],[],'any',{mode});await flush();
  assert.equal(timers.at(-1).ms,Feedback.times[mode].reveal);f.destroy();
 }
});

test('movement and short feedback share their visible interval instead of adding a second pause',async()=>{
 for(const kind of ['skip','damage','capture','sunk','penalty']){
 const timers=new Map();let sequence=0,complete;
 const f=new Feedback({mount:()=>null,clock:{setTimeout:(fn,ms)=>{timers.set(++sequence,{fn,ms});return sequence;},clearTimeout:id=>timers.delete(id)}});
 const motion=new Promise(resolve=>complete=resolve);
 f.accept([{id:1,feedback:{kind,player:0},transfer:{player:0,count:1}}],[],'durak',{mode:'fast',motion:()=>motion});
 await flush();const timer=[...timers.values()][0];assert.equal(timer.ms,Feedback.times.fast.skip,'reading clock starts while the card is moving');
 timer.fn();await Promise.resolve();assert(f.active,'movement must still finish');complete();await f.whenIdle();assert.equal(f.active,null);f.destroy();
 }
});

test('asset animation and sound share one event group and finish before the next cue',async()=>{
 const calls=[];
 let finishAnimation;
 const feedback=new Feedback({mount:()=>null,play:ids=>calls.push(...ids),
  playAssetAnimation:(_asset,_context,mode)=>{
   calls.push(mode);return new Promise(resolve=>{finishAnimation=resolve;});
  }});
 try{
  feedback.accept([
   {id:1,animation:{asset:{kind:'asset',id:'assets/motion.json'},target:{zone:'field'}}},{id:2},
  ],[{eventId:1,id:'first-sound'},{eventId:2,id:'next-sound'}],'fixture',{mode:'fast'});
  await flush();
  assert.deepEqual(calls,['fast','first-sound']);
  finishAnimation();
  await feedback.whenIdle();
  assert.deepEqual(calls,['fast','first-sound','next-sound']);
 }finally{feedback.destroy();}
});

test('metric overlays reuse an unchanged scene and repaint after a shell patch',()=>{
 const ui=globalThis.TabletopUI;
 globalThis.TabletopUI={helpers:{}};
 let scans=0;
 const mount={querySelectorAll(){scans++;return [];}};
 const feedback=new Feedback({mount:()=>mount});
 try{
  feedback.presentedScene={players:[]};
  feedback.paintMetrics();
  feedback.paintMetrics();
  assert.equal(scans,1,'effect phases on the same scene share the overlay');
  feedback.restoreMetrics();
  feedback.paintMetrics();
  assert.equal(scans,2,'patching the shell invalidates an unchanged scene');
  feedback.presentedScene={players:[]};
  feedback.paintMetrics();
  assert.equal(scans,3,'another checkpoint paints even on the same mount');
 }finally{
  feedback.presentedScene=null;
  globalThis.TabletopUI=ui;
 }
});

test('session cancellation releases feedback waiting for an unfinished renderer',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map();let id=0,finish;
 const executor=new Scheduler({setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)});
 const f=new Feedback({mount:()=>null,executor});
 f.accept([{id:1,feedback:{kind:'damage',player:0}}],[],'any',{motion:()=>new Promise(resolve=>finish=resolve)});
 await flush();const idle=f.whenIdle();assert.equal(timers.size,1);
 executor.cancel();await idle;assert.equal(f.active,null);assert.equal(f.queue.length,0);assert.equal(timers.size,0);
 finish();await flush();assert.equal(f.active,null);f.destroy();
});

test('public event plans preserve semantic targets and scene boundaries without renderer state',()=>{
 const Plans=require('../presentation/event-plan.js'),Player=require('../presentation/plan-player.js');
 const initial={id:'before'},final={id:'after'},item={id:17,feedback:{kind:'capture',player:1},duration:250,ids:['hit'],snapshot:{private:'not a descriptor'},motion:()=>{}};
 const plan=Plans.compile({id:'transition:17',items:[item],initial,final});
 assert.equal(plan.scenes.length,2);assert(plan.groups.every(group=>plan.scenes[group.scene]===initial));
 assert.throws(()=>Player.validate({...plan,privateCallback:()=>{}}),/DATA_INVALID/);
 const cycle={};cycle.self=cycle;assert.throws(()=>Player.validate({...plan,cycle}),/DATA_INVALID/);
 let reads=0;
 const shared=Object.freeze({get payload(){reads++;return {id:'field'};}});
 const usingShared={...plan,scenes:[{field:shared},{field:shared}]};
 Player.validate(usingShared);assert.equal(reads,1,'each shared scene branch is checked once');
 Player.validate(usingShared);assert.equal(reads,2,'validation does not reuse results across plans');
 assert.equal(Player.validate(plan),plan);assert.equal(plan.scenes[plan.initial],initial);assert.equal(plan.scenes[plan.final],final);
 assert.deepEqual(plan.groups.map(g=>g.cues[0]?.stage),['prepare','enter',undefined,'leave']);
 assert(plan.groups.filter(g=>g.cues.length).every(g=>g.cues[0].kind==='capture'&&g.cues[0].target.participant===1));
 assert(!JSON.stringify(plan).includes('private'));assert.deepEqual(JSON.parse(JSON.stringify(plan)),plan);
 assert.throws(()=>Player.validate({...plan,final:99}),/SCENE_INVALID/);
 assert.throws(()=>Player.validate({...plan,groups:[{scene:1,duration:0,cues:[{id:'bad',kind:'damage',target:{participant:1,zone:'field'}}]}]}),/TARGET_INVALID/);
});


test('queued committed transitions retain their own initial and final scenes',()=>{
 const Plans=require('../presentation/event-plan.js');
 const first={id:'one'},second={id:'two'},third={id:'three'};
 const item=(id,initial,final)=>({id,duration:0,ids:[],boundary:{initial,final}});
 const plan=Plans.compile({id:'batch',items:[item(1,first,second),item(2,second,third)]});
 assert.equal(plan.scenes[plan.initial],first);assert.equal(plan.scenes[plan.final],third);
 assert(plan.groups.slice(0,4).every(group=>plan.scenes[group.scene]===first));
 assert(plan.groups.slice(4).every(group=>plan.scenes[group.scene]===second));
 const next=Plans.compile({id:'next',items:[item(2,second,third)],initial:first});
 assert.equal(next.scenes[next.initial],second,'queued transition must not reuse the previous batch initial scene');
});


test('skipping feedback discards queued cues and releases pending renderer waiters',async()=>{
 const audio=[];let complete;
 const f=new Feedback({mount:()=>null,play:ids=>audio.push(...ids)});
 f.accept([{id:1,feedback:{kind:'capture',player:0}},{id:2,speech:{speaker:1,text:'later'}}],
  [{eventId:1,id:'first'},{eventId:2,id:'later'}],'any',{motion:()=>new Promise(resolve=>complete=resolve)});
 await flush();const idle=f.whenIdle();f.player.skip();await idle;
 assert.deepEqual(audio,['first']);assert.equal(f.active,null);assert.equal(f.queue.length,0);
 complete?.();await flush();assert.deepEqual(audio,['first']);
 f.accept([{id:1},{id:2}],[{eventId:2,id:'later'}],'any');assert.deepEqual(audio,['first'],'skipped committed IDs must remain consumed');
 f.destroy();
});


test('board staging belongs to the transition and ordinary movement cancels with feedback',async()=>{
 const calls=[];let finish;
 const motion={stage:()=>calls.push('stage'),releaseStage:()=>calls.push('release'),cancel:()=>{calls.push('cancel');finish?.();}};
 const f=new Feedback({motion,mount:()=>null});
 const boundary={initial:{id:'a'},final:{id:'b'}},item={boundary,snapshot:{},motion:()=>new Promise(resolve=>finish=resolve)};
 f.queue=[item];f.stageBoard();f.stageBoard();assert.equal(calls.filter(x=>x==='stage').length,2);
 const moving=f.move(item,{});f.stageBoard();assert.equal(calls.filter(x=>x==='stage').length,2,'redraw must not rewind a started movement');
 f.clear();await moving;assert(calls.includes('cancel'));assert.equal(f.queue.length,0);f.destroy();
});

test('semantic field is held until destination measurement and released once per boundary',async()=>{
 const initial={audience:'player',zones:[{id:'field',kind:'board'}],objects:[]},final={...initial},order=[];
 const f=new Feedback({mount:()=>null,motion:{cancel(){},releaseStage(){order.push('geometry');}},fieldChanged(){order.push('field');assert.equal(f.fieldScene,f.active||f.queue.length?final:null);}});
 f.accept([{id:1,feedback:{kind:'damage',player:0}}],[],'any',{initialScene:initial,finalScene:final,defer:true,motion:async()=>{order.push('motion');assert.equal(f.fieldScene,final);}});
 assert.equal(f.fieldScene,initial);const item=f.queue[0];await f.move(item,{});await f.move(item,{});
 assert.deepEqual(order,['field','geometry','motion','geometry','motion']);f.clear();assert.equal(f.fieldScene,null);
 const planned={...initial,plan:{}};
 f.accept([{id:2,feedback:{kind:'damage',player:0}}],[],'any',{initialScene:planned,finalScene:final,defer:true});assert.equal(f.fieldScene,null);f.destroy();
});


test('field commits each queued boundary instead of the newest authority scene',async()=>{
 const scene=id=>({id,audience:'public',zones:[{id:'field',kind:'board'}],objects:[]});
 const first=scene('first'),middle=scene('middle'),last=scene('last'),shown=[];
 const f=new Feedback({mount:()=>null,motion:{cancel(){},releaseStage(){}},fieldChanged(){shown.push(f.fieldScene?.id||'live');}});
 f.accept([{id:1,feedback:{kind:'damage',player:0}}],[],'any',{initialScene:first,finalScene:middle,defer:true,motion:async()=>{}});
 f.accept([{id:2,feedback:{kind:'damage',player:0}}],[],'any',{initialScene:middle,finalScene:last,defer:true,motion:async()=>{}});
 const one=f.queue[0],two=f.queue[1];
 assert.equal(f.fieldScene,first);
 assert.equal(f.sceneFor(last),first,'the native shell uses the same checkpoint object');
 const anotherViewer={...last,viewer:1},anotherAudience={...last,audience:'player'};
 assert.equal(f.sceneFor(anotherViewer),anotherViewer);
 assert.equal(f.sceneFor(anotherAudience),anotherAudience);
 await f.presentCue({kind:'prepare',item:one},f.generation,{});
 await f.move(one,{});assert.equal(f.fieldScene,middle);assert.deepEqual(shown,['middle']);
 await f.presentCue({kind:'prepare',item:two},f.generation,{});
 assert.equal(f.fieldScene,middle);assert.equal(f.initialFieldScene,middle);
 await f.move(two,{});assert.equal(f.fieldScene,last);
 f.settled();assert.equal(f.fieldScene,null);assert.deepEqual(shown,['middle','last','live']);f.destroy();
 assert.equal(f.sceneFor(last),last);
});


test('event checkpoints keep intervening cues on the last completed scene',()=>{
 const f=new Feedback({mount:()=>null}),initial={id:'initial'},first={id:'first'},second={id:'second'},final={id:'final'};
 f.accept([{id:1,scene:first},{id:2,feedback:{kind:'damage',player:0}},{id:3,scene:second},{id:4,feedback:{kind:'skip',player:1}}],[],'any',{initialScene:initial,finalScene:final,defer:true});
 assert.deepEqual(f.queue.map(item=>[item.boundary.initial.id,item.boundary.final.id]),[['initial','first'],['first','first'],['first','second'],['second','final']]);
 f.destroy();
});


test('sound and reveal share a group and both finish before the next event',async()=>{
 let sound,visual;const calls=[],f=new Feedback({mount:()=>null,play:()=>{calls.push('sound');return new Promise(resolve=>sound=resolve);}});
 f.revealer={show(){},clear(){},enter(){calls.push('visual');return new Promise(resolve=>visual=resolve);},finish(){calls.push('finish');}};
 f.accept([{id:1,reveal:{kind:'card'}},{id:2}], [{eventId:1,id:'move'}],'any',{mode:'instant'});
 await flush();assert.deepEqual(calls,['visual','sound']);visual();await flush();assert.deepEqual(calls,['visual','sound']);
 sound();await f.whenIdle();assert(calls.includes('finish'));f.destroy();
});

test('successive stock transfers expose only their arrival and own their flight',async()=>{
 const Plans=require('../presentation/event-plan.js'),scene=(stockCount,hands)=>({audience:'player',viewer:0,stockCount,players:hands.map((hand,player)=>({player,hand})),zones:[{id:'field',kind:'table'},{id:'stock',kind:'stock',count:stockCount},...hands.map((h,owner)=>({id:'hand-'+owner,kind:'hand',owner,count:h.length}))],objects:hands.flatMap((h,owner)=>h.filter(c=>!c.hidden).map(c=>({ref:{namespace:'card',id:c.id},zone:'hand-'+owner}))),interactions:[]});
 const initial=scene(8,[[{id:'a'}],[{hidden:true}]]),final=scene(6,[[{id:'a'},{id:'b'}],[{hidden:true},{hidden:true}]]);
 const tableObject=Object.freeze({ref:{namespace:'card',id:'discard'},zone:'field'});
 final.objects.push(tableObject);
 const events=[{id:1,transfer:{player:0,count:1,from:'stock'}},{id:2,transfer:{player:1,count:1,from:'stock'}}];
 const staged=Plans.transferScenes(events,initial,final);assert.deepEqual(staged.map(e=>e.scene.players.map(p=>p.hand.length)),[[2,1],[2,2]]);assert.equal(staged[0].scene.stockCount,7);assert.equal(final.players[1].hand.length,2);
 assert.deepEqual(staged.map(e=>e.scene.zones.find(zone=>zone.kind==='stock').count),[7,6]);
 assert.equal(staged[0].scene.players[0],final.players[0],'unchanged authorized hands share their scene data');
 assert.equal(staged[0].scene.objects,final.objects,'rewinding an anonymous back does not rebuild the visible object array');
 assert.equal(staged[1].scene,final,'a terminal inert checkpoint reuses the complete final frame');
 assert.equal(staged[0].scene.objects.at(-1),tableObject,'the table object is not copied for an unrelated hand arrival');
 assert.deepEqual(staged.map(e=>e.scene.zones.filter(z=>z.kind==='hand').map(z=>z.count)),[[2,1],[2,2]]);
 const calls=[],captures=[],prepared=[];let finish;
 const f=new Feedback({mount:()=>null,motion:{capture(options){
  captures.push(options);return {prepareTransfers:draws=>prepared.push(draws)};
 }}});
 f.accept(events,[],'any',{initialScene:initial,finalScene:final,motion:(context,step)=>{calls.push(step.draws[0].player);if(calls.length===1)return new Promise(resolve=>finish=resolve);}});
 await flush();assert.deepEqual(calls,[0]);assert.deepEqual(captures,[]);
 finish();await f.whenIdle();assert.deepEqual(calls,[0,1]);
 assert.deepEqual(captures,[{viewer:undefined,deferDepartures:true}]);
 assert.equal(prepared[0][0],events[1].transfer);
 assert.equal(prepared[0].length,1);
 f.destroy();
});

test('a queued card arrival cannot replace the current table or stage its motion early',async()=>{
 const table=id=>({id,audience:'player',viewer:0,zones:[{id:'field',kind:'table'}],objects:[]});
 const initial=table('initial'),middle=table('middle'),final=table('final');
 const mount={querySelector:()=>null,querySelectorAll:()=>[]};
 for(const checkpoint of [true,false]){
  const current={},later={},prepared=[],shown=[];
  let finishCurrent;
  const feedback=new Feedback({mount:()=>mount,fieldChanged:()=>shown.push(feedback.displayScene),
   play:()=>new Promise(resolve=>{finishCurrent=resolve;}),
   motion:{prepare:(shot,draws)=>prepared.push({shot,draws}),cancel(){}}});
  try{
   feedback.accept([{id:1,feedback:{kind:'damage',player:0},...(checkpoint?{scene:middle}:{})}],[{eventId:1,id:'move'}],'any',
    {snapshot:current,initialScene:initial,finalScene:middle,mode:'instant'});
   await flush();assert(finishCurrent,'the earlier cue is still playing');
   const transfer={player:1,count:1,from:'stock'},moved=[];
   const following=checkpoint?[{id:2,transfer,scene:final}]:[{id:2,reveal:{kind:'card'}},{id:3,transfer,scene:final}];
   feedback.accept(following,[],'any',
    {snapshot:later,initialScene:middle,finalScene:final,mode:'instant',motion:()=>moved.push(shown.at(-1))});
   assert.equal(feedback.displayScene,middle,'keep the active table over a queued arrival');
   feedback.refresh();
   assert(!prepared.some(({shot})=>shot===later),'no preparation for a later commit');
   finishCurrent();
   await feedback.whenIdle();
   assert.deepEqual(moved,[final],'the next table mounts before its motion starts');
   assert.deepEqual(prepared.at(-1),{shot:later,draws:[transfer]});
  }finally{feedback.destroy();}
 }
});

test('movement borrows projected transfers and strips an explicit audience override',()=>{
 const Transition=require('../presentation/transition.js');
 const shared=Object.freeze({player:0,count:1,from:'stock'});
 const privateTransfer=Object.freeze({player:1,count:1,from:'hand',fromPlayer:0,privateTo:[1]});
 const events=[{id:1,transfer:shared},{id:2,transfer:privateTransfer}];
 assert.deepEqual(Transition.transferCues(events,0),[shared]);
 const draws=Transition.transferCues(events,1);
 assert.equal(draws[0],shared);
 assert.deepEqual(draws[1],{player:1,count:1,from:'hand',fromPlayer:0});
 assert.deepEqual(Transition.transferEffects(events,0,7,1),[]);
 assert.deepEqual(Transition.transferEffects(events,1,7,1),[{id:'7:draw:0',revision:7,...draws[1]}]);
 assert.equal(events[1].transfer,privateTransfer);
});

test('finish audio is owned by the results dialog, not the final action queue',async()=>{
 const heard=[],feedback=new Feedback({mount:()=>null,play:ids=>heard.push(...ids)});
 let reads=0;
 const cues=[[3,'victory'],[2,'draw'],[1,'move'],[2,'uno.call'],[1,undefined]].map(([eventId,id])=>({
  get eventId(){reads++;return eventId;},id
 }));
 feedback.accept([{id:1},{id:2},{id:3,kind:'finish'}],cues,'uno',{mode:'instant'});
 await feedback.whenIdle();assert.deepEqual(heard,['move','draw','uno.call']);
 assert.equal(reads,cues.length,'each authorized cue is routed by event ID once');
 feedback.destroy();
});

test('turn handoff waits for an already queued independent reaction',async()=>{
 const calls=[],release=new Map();
 const panels=[0,1].map(index=>({dataset:{playerIndex:String(index)},classList:{toggle(){}},
  setAttribute(){},removeAttribute(){},getClientRects:()=>[{}]}));
 const stage={dataset:{turnPlayer:'0'},querySelector:()=>null,querySelectorAll:()=>panels};
 const mount={querySelector:selector=>selector==='.app-game-layout'?stage:null,querySelectorAll:()=>[]};
 const feedback=new Feedback({mount:()=>mount,motion:{cancel(){},pulseParticipant(panel,{role}){
  calls.push(`${role}:${panel.dataset.playerIndex}`);
 }},play:([id])=>{calls.push(id);return new Promise(resolve=>release.set(id,resolve));}});
 try{
  feedback.accept([{id:1}],[{eventId:1,id:'play'}],'uno');
  await flush();
  assert.deepEqual(calls,['play']);
  stage.dataset.turnPlayer='1';
  feedback.accept([{id:2}],[{eventId:2,id:'uno.call'}],'uno');
  release.get('play')();
  await flush();
  assert.deepEqual(calls,['play','uno.call']);
  assert.equal(stage.dataset.presentationTurn,'0');
  release.get('uno.call')();
  await feedback.whenIdle();
  assert.deepEqual(calls,['play','uno.call','outgoing:0','incoming:1']);
  assert.equal(stage.dataset.presentationTurn,undefined);
 }finally{feedback.destroy();}
});

test('each card reveal resolves its own actor hand instead of inheriting the penalty receiver origin',()=>{
 const f=new Feedback({mount:()=>null}),sender={x:10,y:20,width:30,height:40},receiver={x:10,y:500,width:30,height:40};
 const shot={actor:0,origin:receiver,playedFrom:receiver,hands:new Map([[0,receiver],[1,sender]])};
 f.accept([{id:1,player:1,kind:'play',reveal:{kind:'card',card:{id:4,value:'+4'}}},{id:2,player:0,kind:'draw',transfer:{player:0,count:4,from:'stock'}}],[],'uno',{snapshot:shot,defer:true});assert.equal(f.queue[0].snapshot.actor,1);assert.deepEqual(f.queue[0].snapshot.origin,sender);assert.equal(f.queue[0].snapshot.playedFrom,null);assert.equal(shot.actor,0,'original capture is not mutated');f.destroy();
});

test('a gesture still unlocking audio cannot hold the frame or replay its cue late',async()=>{
 const Audio=require('../core/audio.js');
 let unlock;
 const context={state:'suspended',destination:{},createGain:()=>({gain:{},connect(){}}),resume:()=>new Promise(resolve=>{
  unlock=()=>{context.state='running';resolve();};
 })};
 const audio=new Audio({enabled:true,contextFactory:()=>context}),ready=audio.unlock(),stages=[],played=[];
 const feedback=new Feedback({mount:()=>null,play:(ids,pack,phase)=>audio.batch(ids,{pack,signal:phase.signal}).then(result=>played.push(result))});
 const present=feedback.presentCue.bind(feedback);
 feedback.presentCue=(cue,...args)=>{stages.push(cue.kind);return present(cue,...args);};
 try{
  feedback.accept([{id:1,text:'Ход'}],[{eventId:1,id:'move'}],'uno',{mode:'instant'});
  await flush();
  assert.equal(context.state,'suspended');
  assert.deepEqual(stages,['prepare','enter','hold','sound','leave']);
  assert.deepEqual(played,[false]);
  await feedback.whenIdle();
  unlock();
  assert.equal(await ready,true);
  await flush();
  assert.deepEqual(played,[false],'the completed cue is not replayed after unlock');
 }finally{feedback.destroy();audio.stop();}
});


test('deferred stock artwork is requested from authorized transfers or spoken card reveals',()=>{
 for(const [event,back,transfers] of [[{speech:{speaker:1,text:'Карта'},reveal:{kind:'card',card:{id:'public-card'}}},true,0],[{transfer:{from:'stock',player:0,count:2}},false,1],[{speech:{speaker:1,text:'Ответ'}},false,0],[{reveal:{kind:'card',card:{id:'public-card'}}},false,0]]){
  const prepared=[],f=new Feedback({mount:()=>null});
  f.accept([{id:1,...event}],[],'any',{snapshot:{prepareTransfers:(draws,options)=>prepared.push({draws,options})},defer:true});
  assert.equal(prepared.length,1);assert.equal(prepared[0].draws.length,transfers);assert.equal(prepared[0].options.back,back);f.destroy();
 }
});
