'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Feedback=require('../app/game-feedback.js');
const initial=[{id:1,text:'start'}],unocall={id:2,text:'Игрок: UNO!',notice:{title:'UNO!',detail:'Одна карта',tone:'success'}};
test('feedback plays only newly committed projected sound/event IDs and keeps no private state',()=>{
  const audio=[],timers=new Map();let id=0;
  const feedback=new Feedback({mount:()=>null,play:(ids,pack)=>audio.push({ids,pack}),clock:{setTimeout:f=>{timers.set(++id,f);return id;},clearTimeout:k=>timers.delete(k)}});
  feedback.start(initial);
  feedback.accept([...initial,unocall],[{eventId:2,id:'uno.call'}],'uno');
  assert.equal(feedback.notice,null);assert.equal(timers.size,0,'Routine actions never create timed overlays');assert.deepEqual(audio,[{ids:['uno.call'],pack:'uno'}]);
  feedback.accept([...initial,unocall],[{eventId:2,id:'uno.call'}],'uno');assert.equal(audio.length,1,'A duplicate ACK/snapshot must be silent');
  feedback.accept([...initial,unocall,{id:3,notice:{title:'Штраф',tone:'danger'},text:'Penalty'}],[{eventId:3,id:'penalty'}],'uno',{silent:true});
  assert.equal(audio.length,1,'History/reconnect must not play queued sounds');
  assert.equal(feedback.notice,null);assert.equal(timers.size,0,'Routine actions never create timed overlays');
  for(const f of [...timers.values()])f();assert.equal(feedback.notice,null);
  feedback.destroy();
});
test('feedback queues each sound with its speech and preserves speed-specific reading time',async()=>{
 const audio=[],timers=[];const f=new Feedback({mount:()=>null,play:ids=>audio.push(...ids),clock:{setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}}});
 f.accept([{id:1,speech:{speaker:0,text:'Туз'}},{id:2,speech:{speaker:1,icon:'cross'}}],[{eventId:1,id:'ask'},{eventId:2,id:'absent'}],'gofish',{mode:'fast'});
 assert.deepEqual(audio,['ask']);assert.equal(timers[0].ms,450);
 timers[0].fn();await Promise.resolve();await Promise.resolve();assert.deepEqual(audio,['ask','absent']);assert.equal(timers[1].ms,450);
 f.clear();assert.equal(f.active,null);assert.equal(f.queue.length,0);
});
test('dice results have readable hold times while card reveal timing stays unchanged',async()=>{
 for(const [mode,duration] of Object.entries({instant:250,fast:450,normal:700,slow:1000})){
  const timers=[],f=new Feedback({mount:()=>null,clock:{setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout(){}}});
  f.accept([{id:1,reveal:{kind:'dice',dice:[{value:6}]}}],[],'any',{mode});
  await Promise.resolve();assert.equal(timers[0].ms,duration);f.clear();
  f.accept([{id:2,reveal:{kind:'card'}}],[],'any',{mode});await Promise.resolve();
  assert.equal(timers.at(-1).ms,Feedback.times[mode].reveal);f.destroy();
 }
});

test('movement and short feedback share their visible interval instead of adding a second pause',async()=>{
 const timers=new Map();let sequence=0,complete;
 const f=new Feedback({mount:()=>null,clock:{setTimeout:(fn,ms)=>{timers.set(++sequence,{fn,ms});return sequence;},clearTimeout:id=>timers.delete(id)}});
 const motion=new Promise(resolve=>complete=resolve);
 f.accept([{id:1,feedback:{kind:'skip',player:0},transfer:{player:0,count:1}}],[],'durak',{mode:'fast',motion:()=>motion});
 const timer=[...timers.values()][0];assert.equal(timer.ms,Feedback.times.fast.skip,'reading clock starts while the card is moving');
 timer.fn();await Promise.resolve();assert(f.active,'movement must still finish');complete();await f.whenIdle();assert.equal(f.active,null);f.destroy();
});
