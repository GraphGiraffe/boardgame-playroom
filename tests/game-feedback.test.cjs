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
  feedback.accept([...initial,unocall,{id:3,notice:{title:'Штраф',tone:'danger'},text:'Penalty'}],[{eventId:3,id:'penalty'}],'uno',{silent:true});
  assert.equal(audio.length,1,'History/reconnect must not play queued sounds');
  assert.equal(feedback.notice,null);assert.equal(timers.size,0,'Routine actions never create timed overlays');
  for(const f of [...timers.values()])f();assert.equal(feedback.notice,null);
  feedback.destroy();
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
 await f.presentCue({kind:'prepare',item:one},f.generation,{});
 await f.move(one,{});assert.equal(f.fieldScene,middle);assert.deepEqual(shown,['middle']);
 await f.presentCue({kind:'prepare',item:two},f.generation,{});
 assert.equal(f.fieldScene,middle);assert.equal(f.initialFieldScene,middle);
 await f.move(two,{});assert.equal(f.fieldScene,last);
 f.settled();assert.equal(f.fieldScene,null);assert.deepEqual(shown,['middle','last','live']);f.destroy();
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
 const Plans=require('../presentation/event-plan.js'),scene=hands=>({audience:'player',viewer:0,stockCount:6,players:hands.map((hand,player)=>({player,hand})),zones:[{id:'field',kind:'table'},...hands.map((h,owner)=>({id:'hand-'+owner,kind:'hand',owner,count:h.length}))],objects:hands.flatMap((h,owner)=>h.filter(c=>!c.hidden).map(c=>({ref:{namespace:'card',id:c.id},zone:'hand-'+owner}))),interactions:[]});
 const initial=scene([[{id:'a'}],[{hidden:true}]]),final=scene([[{id:'a'},{id:'b'}],[{hidden:true},{hidden:true}]]);
 const events=[{id:1,transfer:{player:0,count:1,from:'stock'}},{id:2,transfer:{player:1,count:1,from:'stock'}}];
 const staged=Plans.transferScenes(events,initial,final);assert.deepEqual(staged.map(e=>e.scene.players.map(p=>p.hand.length)),[[2,1],[2,2]]);assert.equal(staged[0].scene.stockCount,7);assert.equal(final.players[1].hand.length,2);
 const calls=[];let finish;const f=new Feedback({mount:()=>null});
 f.accept(events,[],'any',{initialScene:initial,finalScene:final,motion:(context,step)=>{calls.push(step.draws[0].player);if(calls.length===1)return new Promise(resolve=>finish=resolve);}});
 await flush();assert.deepEqual(calls,[0]);finish();await f.whenIdle();assert.deepEqual(calls,[0,1]);f.destroy();
});
