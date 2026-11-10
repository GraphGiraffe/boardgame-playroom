'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Flow=require('../core/game-flow.js');

test('All four speeds and quick-play use one policy regardless of authority transport',()=>{
  assert.deepEqual(Object.keys(Flow.presets),['instant','fast','normal','slow']);
  for(const id of Object.keys(Flow.presets)){
    assert.equal(Flow.timing({animationSpeed:id}).duration,Flow.presets[id].duration);
    assert.equal(Flow.timing({animationSpeed:id},true).duration,0);
    assert.equal(Flow.timing({animationSpeed:id}).botDelay,Flow.presets[id].botDelay);
  }
  assert.equal(Flow.timing({animationSpeed:'malformed'}).mode,'normal');
  assert.equal(Flow.quickPlay({quickPlay:true}),true);
  assert.equal(Flow.quickPlay({quickPlay:false}),false);
});

test('Local and network mode call the exact same motion engine and preferences',async()=>{
  const calls=[],settings={animationSpeed:'normal',quickPlay:false};
  const motion={capture:x=>{calls.push(['capture',x]);return{x}},play:(x,y)=>{calls.push(['play',x,y]);return Promise.resolve();},cancel:()=>calls.push(['cancel'])};
  const local=new Flow.GameFlow({options:()=>settings,motion});
  const network=new Flow.GameFlow({options:()=>settings,motion});
  assert.equal(local.pace().duration,network.pace().duration);
  assert.equal(network.quickPlay,false);
  settings.quickPlay=true;settings.animationSpeed='slow';
  assert.equal(network.quickPlay,true);assert.equal(local.pace().duration,650);
  const before=network.capture({actor:1,viewer:0,action:{type:'draw'}});
  await network.play(before,{draws:[{player:1,count:2,from:'stock'}]});
  assert.deepEqual(calls[0],['capture',{actor:1,viewer:0,action:{type:'draw'}}]);
  assert.equal(calls[1][2].duration,650);assert.equal(calls[1][2].draws[0].count,2);
  settings.animationSpeed='instant';assert.equal(local.capture({actor:0}),null);
  network.cancel();assert.deepEqual(calls.at(-1),['cancel']);
});

test('A pack minimum viewing time applies at instant and animated speeds',async()=>{
  {
    for(const animationSpeed of ['instant','fast']){
      const flow=new Flow.GameFlow({options:()=>({animationSpeed}),motion:{play:()=>Promise.resolve()},presentation:()=>({minimumVisibleMs:35})});
      const start=performance.now();
      await flow.play(null);
      assert(performance.now()-start>=30,`${animationSpeed} skipped the minimum viewing time`);
    }
  }
});

test('Only newer, same-session projected events can trigger network presentation',()=>{
  const first={sessionId:'s',authorityEpoch:'a',revision:7,events:[{id:11,kind:'play',player:0}]};
  const next={sessionId:'s',authorityEpoch:'a',revision:8,events:[...first.events,{id:12,kind:'draw',player:1}]};
  assert.deepEqual(Flow.eventAction(first,next),{actor:1,action:{type:'draw'},events:[next.events[1]]});
  assert.equal(Flow.eventAction(first,first),null);
  assert.equal(Flow.eventAction(next,first),null);
  assert.equal(Flow.eventAction(first,{...next,sessionId:'new'}),null);
  assert.equal(Flow.eventAction(first,{...next,authorityEpoch:'new'}),null);
  assert.equal(Flow.eventAction(null,next),null);
  assert.deepEqual(Flow.eventAction({...first,state:{turn:1}},{...next,events:first.events}),{actor:1,action:{type:'action'},events:[]});
});


test('presentation cancellation releases its waiter and timer even when a renderer never finishes',async()=>{
  const Scheduler=require('../presentation/scheduler.js'),timers=new Map();let id=0;
  const scheduler=new Scheduler({setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)});
  const first=scheduler.play(()=>new Promise(()=>{}),750);assert.equal(timers.size,1);
  scheduler.cancel();await first;await scheduler.whenIdle();assert.equal(timers.size,0);
  const next=scheduler.play(()=>Promise.resolve(),200);assert.equal(timers.size,1);
  [...timers.values()][0].fn();await next;assert.equal(timers.size,0);
  assert.throws(()=>scheduler.play(()=>{},-1),/DELAY_INVALID/);
  assert.equal(Flow.viewingTime({presentation:{minimumVisibleMs:{default:750,phases:{setup:0}}}},{scene:{phase:'setup'}}),0);
  assert.equal(Flow.viewingTime({presentation:{minimumVisibleMs:750}},{scene:{}}),750);
});


test('Whole actions await the plan without a second reveal clock',async()=>{
  for(const animationSpeed of Object.keys(Flow.presets)){
    const timers=new Map();let id=0,finished=false;
    const flow=new Flow.GameFlow({options:()=>({animationSpeed}),clock:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}});
    let complete;const pending=flow.present(()=>new Promise(resolve=>complete=resolve),{events:[{reveal:{kind:"card"}}]}).then(()=>finished=true);
    assert.equal(timers.size,0);
    await Promise.resolve();assert.equal(finished,false,'the plan must finish');
    complete();await pending;assert.equal(timers.size,0);
    const cancelled=flow.present(()=>new Promise(()=>{}));flow.cancel();await cancelled;assert.equal(timers.size,0);
  }
});
test('dice reveal completion unlocks the next action without a hidden card-animation timer',async()=>{
 for(const animationSpeed of Object.keys(Flow.presets))for(const event of [{kind:'roll'},{reveal:{kind:'dice'}}]){
  const timers=new Map();let id=0,complete,finished=false;
  const flow=new Flow.GameFlow({options:()=>({animationSpeed}),clock:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}});
  const pending=flow.present(()=>new Promise(resolve=>complete=resolve),{events:[event]}).then(()=>finished=true);
  await Promise.resolve();assert.equal(finished,false);assert.equal(timers.size,0,'dice queue owns its complete visible lifetime');
  complete();await pending;assert.equal(finished,true);
 }
});
test('continuations and new turns both use the plan lifetime',async()=>{
 for(const animationSpeed of Object.keys(Flow.presets)){
  const timers=new Map();let id=0,complete;
  const flow=new Flow.GameFlow({options:()=>({animationSpeed}),clock:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}});
  const before={turn:0,status:'playing',timeline:{turn:7}},after={turn:0,status:'playing',timeline:{turn:7}};
  const pending=flow.present(()=>new Promise(resolve=>complete=resolve),{before,after});assert.equal(timers.size,0);
  complete();await pending;
  const next=flow.present(()=>Promise.resolve(),{before,after:{...after,timeline:{turn:8}},events:[{reveal:{kind:'card'}}]});
  assert.equal(timers.size,0,'turn changes do not create another clock');await next;
 }
});

test('non-card placements do not inherit a card reveal delay',async()=>{
 const timers=[];const flow=new Flow.GameFlow({options:()=>({animationSpeed:'fast'}),clock:{setTimeout:(_,ms)=>timers.push(ms),clearTimeout:()=>{}}});
 for(const event of [{kind:'place'},{kind:'move'}])await flow.present(()=>Promise.resolve(),{events:[event]});
 assert.deepEqual(timers,[]);
});


test('presentation lanes preserve nested motion and cancellation rejects stale callbacks',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map();let id=0,played=0;
 const executor=new Scheduler({now:()=>123,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)});
 const action=executor.lane('action'),motion=executor.lane('motion');
 assert.equal(executor.lane('motion'),motion);assert.equal(motion.now(),123);
 let end;const whole=action.play(()=>new Promise(resolve=>end=resolve),400);
 const moving=motion.play(()=>Promise.resolve(),100);
 assert.equal(timers.size,2,'nested movement must not cancel the enclosing action');
 const ticket=executor.schedule(()=>played++,50),stale=[...timers.values()].at(-1).fn;
 executor.unschedule(ticket);stale();assert.equal(played,0);
 executor.cancel();await Promise.all([whole,moving]);assert.equal(timers.size,0);
 end();await action.whenIdle();assert.equal(played,0);
});

test('plan groups run simultaneous cues once, preserve remaining time and cancel stale completions',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map(),seen=[];let id=0,now=0,end;
 const executor=new Scheduler({now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)});
 const player=executor.track('frames'),flush=()=>new Promise(setImmediate);
 const plan={id:'round:1',groups:[{duration:100,cues:[{id:'a',kind:'move'},{id:'b',kind:'damage'}]},{duration:20,cues:[{id:'c',kind:'death'}]}]};
 const ports={effect:cue=>{seen.push(cue.id);if(cue.id==='b')return new Promise(r=>end=r);},final:(_,status)=>seen.push(status)};
 const pending=player.play(plan,ports);assert.deepEqual(seen,['a','b']);assert.equal(player.play(plan,ports),pending);
 now=30;player.pause();assert.equal(timers.size,0);player.setRate(2);player.resume();assert.equal([...timers.values()][0].ms,35);
 {const [key,timer]=[...timers][0];timers.delete(key);timer.fn();}await flush();assert.deepEqual(seen,['a','b'],'time alone must not finish an effect');end();await flush();assert.deepEqual(seen,['a','b','c']);
 player.skip();assert.deepEqual(await pending,{status:'skipped'});assert.equal(timers.size,0);player.play(plan,ports);assert.equal(seen.filter(x=>x==='a').length,1);
 let late;const cancelled=player.play({id:'round:2',groups:[{duration:100,cues:[{id:'d',kind:'move'}]}]},{effect:()=>new Promise(r=>late=r),final:()=>assert.fail('cancel must not expose final state')});
 executor.cancel();assert.deepEqual(await cancelled,{status:'cancelled'});late();await flush();assert.equal(timers.size,0);
 const restarted=player.play({id:'round:2',groups:[{duration:10,cues:[{id:'d',kind:'move'}]}]},{effect:cue=>seen.push(cue.id)});assert.equal(seen.at(-1),'d','cancelled scene may be mounted again');player.skip();assert.deepEqual(await restarted,{status:'skipped'});
 assert.throws(()=>player.play({id:'bad',groups:[{duration:0,cues:[{id:'a',kind:'x'},{id:'a',kind:'y'}]}]}),/CUE_INVALID/);
});

test('finishing an action preserves public phases; leaving the session cancels them',async()=>{
 const timers=new Map();let id=0;
 const flow=new Flow.GameFlow({clock:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}});
 const frames=flow.executor.track('public-sequence');
 const pending=frames.play({id:'round',groups:[{duration:500,cues:[]}]});
 flow.cancelAction();assert.equal(timers.size,1);assert.equal(frames.run.done,false);
 flow.cancel();assert.equal(timers.size,0);assert.deepEqual(await pending,{status:'cancelled'});
});


test('plan clock controls platform animations, delayed labels and cleanup together',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map();let id=0,now=0,finished,context,cleaned=0,labels=0;
 const executor=new Scheduler({now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)});
 const player=executor.track('platform'),calls=[];
 const animation={finished:new Promise(resolve=>finished=resolve),pause:()=>calls.push('pause'),play:()=>calls.push('play'),cancel:()=>{calls.push('cancel');finished();},playbackRate:1};
 const pending=player.play({id:'effects',groups:[{duration:0,cues:[{id:'move',kind:'movement'}]}]},{effect:(_,port)=>{
  context=port;port.animation(animation);port.schedule(()=>labels++,100);port.cleanup(()=>cleaned++);return animation.finished;
 }});
 const stale=[...timers.values()][0].fn;
 now=25;player.pause();assert.equal(timers.size,0);assert.deepEqual(calls,['pause']);
 player.setRate(2);assert.equal(animation.playbackRate,2);assert.equal(timers.size,0);
 player.resume();assert.equal([...timers.values()][0].ms,38);assert.equal(calls.at(-1),'play');
 player.skip();assert.equal((await pending).status,'skipped');assert.equal(cleaned,1);assert.equal(timers.size,0);assert.equal(calls.at(-1),'cancel');
 stale();assert.equal(labels,0);context.schedule(()=>labels++,1);assert.equal(timers.size,0);
 const late={...animation,cancel:()=>cleaned++};context.animation(late);assert.equal(cleaned,2);
});


test('a scene commit gates simultaneous visual and audio effects, including cancellation',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),executor=new Scheduler(),player=executor.track('orchestration'),calls=[];
 let commit,visual,audio;
 const plan={id:'orchestrated',groups:[{duration:0,cues:[{id:'visual',kind:'movement'},{id:'audio',kind:'sound'}]},{duration:0,cues:[{id:'after',kind:'commit'}]}]};
 const pending=player.play(plan,{group:index=>index===0?new Promise(resolve=>commit=resolve):undefined,effect:(cue,context)=>{
  calls.push(cue.id);assert.equal(context.signal.aborted,false);
  if(cue.id==='visual')return new Promise(resolve=>visual=resolve);
  if(cue.id==='audio')return new Promise(resolve=>audio=resolve);
 }});
 assert.deepEqual(calls,[]);player.pause();commit();await new Promise(setImmediate);assert.deepEqual(calls,[]);
 player.resume();assert.deepEqual(calls,['visual','audio']);visual();await new Promise(setImmediate);assert.equal(calls.length,2);
 audio();assert.equal((await pending).status,'complete');assert.deepEqual(calls,['visual','audio','after']);
 let late,signal;const cancelled=player.play({...plan,id:'cancelled'},{group:(_,g,context)=>{signal=context.signal;return new Promise(resolve=>late=resolve);},effect:()=>assert.fail('late scene must not start effects')});
 player.cancel();late();await cancelled;assert(signal.aborted);await new Promise(setImmediate);
});


test('explicit delays run concurrently or sequentially and retain remaining time',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map();let id=0,now=0,finish;
 const executor=new Scheduler({now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}),player=executor.track('delays'),seen=[];
 const pending=player.play({id:'delays',groups:[
  {duration:0,cues:[{id:'visual',kind:'animation'},{id:'minimum',kind:'delay',duration:100}]},
  {duration:0,cues:[{id:'pause',kind:'delay',duration:80}]},
  {duration:0,cues:[{id:'after',kind:'commit'}]}
 ]},{effect:cue=>{seen.push(cue.id);if(cue.id==='visual')return new Promise(resolve=>finish=resolve);}});
 const tick=()=>{const [key,timer]=[...timers][0];timers.delete(key);timer.fn();};
 now=30;player.pause();assert.equal(timers.size,0);player.setRate(2);player.resume();assert.equal([...timers.values()][0].ms,35);
 tick();await new Promise(setImmediate);assert.deepEqual(seen,['visual']);finish();await new Promise(setImmediate);
 assert.equal([...timers.values()][0].ms,40);assert.deepEqual(seen,['visual']);tick();assert.equal((await pending).status,'complete');assert.deepEqual(seen,['visual','after']);
 assert.throws(()=>player.play({id:'invalid',groups:[{duration:0,cues:[{id:'delay',kind:'delay',duration:-1}]}]}),/DELAY_INVALID/);
 const cancelled=player.play({id:'cancel-delay',groups:[{duration:0,cues:[{id:'delay',kind:'delay',duration:1000}]}]});player.cancel();assert.equal((await cancelled).status,'cancelled');assert.equal(timers.size,0);
});


test('completed and cancelled plans release scenes and callbacks but preserve idempotence',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),executor=new Scheduler(),player=executor.track('release');
 for(let i=0;i<100;i++){
  const scene={cards:Array.from({length:100},(_,id)=>({id}))},plan={id:'release:'+i,scenes:[scene],initial:0,final:0,groups:[]};
  const done=player.play(plan,{final(){void scene;}});await done;
  assert.deepEqual(player.run.plan,{id:plan.id});assert.deepEqual(player.run.ports,{});assert.equal(player.run.context,null);
  assert.equal(player.play(plan,{final:()=>assert.fail('duplicate')}),done);assert.deepEqual(player.run.ports,{});
 }
 const done=player.play({id:'cancel-release',groups:[{duration:1000,cues:[]}]},{cancel(){}});player.cancel();await done;
 assert.equal(player.run.context,null);assert.deepEqual(player.run.ports,{});executor.dispose();
});

test('remote card reveal keeps the player who played even when a later penalty draws for the opponent',()=>{
 for(const value of ['+2','+4']){const before={sessionId:'s',authorityEpoch:'e',revision:1,events:[]},after={...before,revision:2,events:[{id:1,kind:'play',player:1,reveal:{kind:'card',card:{id:4,value}}},{id:2,kind:'draw',player:0,transfer:{player:0,count:value==='+2'?2:4,from:'stock'}}]};assert.equal(Flow.eventAction(before,after).actor,1);assert.equal(Flow.eventAction(before,after).action.type,'play');}
});

test('diagnostic timer port records planned actual cancelled delays without retaining timers',()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map(),events=[];let time=100,next=0;
 const clock={now:()=>time,setTimeout:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},clearTimeout:id=>timers.delete(id)},diagnostics={enabled:true,record:(kind,data)=>events.push({kind,...data})},scheduler=new Scheduler(clock,{diagnostics}),lane=scheduler.lane('feedback');let fired=0;
 lane.schedule(()=>fired++,250);assert.equal(scheduler.metrics().scheduled,1);time=400;const [id,timer]=timers.entries().next().value;timers.delete(id);timer.fn();assert.equal(fired,1);assert.equal(scheduler.metrics().scheduled,0);assert.equal(events.find(e=>e.kind==='timer.fire').late,50);
 const token=lane.schedule(()=>fired++,500);lane.unschedule(token);assert.equal(scheduler.metrics().scheduled,0);assert.equal(timers.size,0);assert(events.some(e=>e.kind==='timer.cancel'));diagnostics.enabled=false;lane.schedule(()=>{},1);assert.equal(events.length,4);scheduler.cancel();
});

test('rebinding the same plan rate preserves its timer and running animation',async()=>{
 const Scheduler=require('../presentation/scheduler.js'),timers=new Map(),calls=[];let id=0,now=0,finish;
 const executor=new Scheduler({now:()=>now,setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}),player=executor.track('stable-rate');
 const animation={finished:new Promise(r=>finish=r),pause:()=>calls.push('pause'),play:()=>calls.push('play'),cancel:()=>{calls.push('cancel');finish();},playbackRate:1};
 const pending=player.play({id:'motion',groups:[{duration:650,cues:[{id:'move',kind:'movement'}]}]},{effect:(_,context)=>{context.animation(animation);return animation.finished;}});
 const ticket=[...timers.keys()][0];now=200;for(let i=0;i<4;i++)player.setRate(1);
 assert.deepEqual(calls,[],'passive rebind does not pause/resume the visible effect');assert.equal([...timers.keys()][0],ticket,'the original deadline stays armed');
 player.setRate(2);assert.deepEqual(calls,['pause','play']);assert.equal(animation.playbackRate,2);player.skip();await pending;
});

test('a new authored public plan owns its transition instead of a generic action capture',()=>{
 const before={sessionId:'match',authorityEpoch:'epoch',revision:1,events:[{id:1}],state:{scene:{plan:{id:'old',groups:[]}}}};
 const next={...before,revision:2,events:[{id:2,kind:'play',player:0}],state:{scene:{plan:{id:'round',groups:[{scene:0,duration:250,cues:[]}]}}}};
 assert.equal(Flow.eventAction(before,next),null);
 assert.equal(Flow.eventAction({...before,state:next.state},next).action.type,'play','a later event outside a new public plan keeps the normal path');
});
