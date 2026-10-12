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
