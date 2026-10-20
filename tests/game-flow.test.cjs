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
  assert.equal(Flow.viewingTime({presentation:{minimumVisibleMs:{default:750,phases:{setup:0}}}},{data:{phase:'setup'}}),0);
  assert.equal(Flow.viewingTime({presentation:{minimumVisibleMs:750}},{data:{}}),750);
});


test('Whole actions use the UNO reveal budget without adding it to long presentations',async()=>{
  for(const [animationSpeed,minimum]of Object.entries({instant:100,fast:420,normal:720,slow:1100})){
    const timers=new Map();let id=0,finished=false;
    const flow=new Flow.GameFlow({options:()=>({animationSpeed}),clock:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}});
    let complete;const pending=flow.present(()=>new Promise(resolve=>complete=resolve),{events:[{reveal:{kind:"card"}}]}).then(()=>finished=true);
    assert.equal([...timers.values()][0].ms,minimum);
    [...timers.values()][0].fn();await Promise.resolve();assert.equal(finished,false,'long motion must finish');
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
test('continuations use the real effect lifetime; a new turn of the same actor retains the normal budget',async()=>{
 for(const animationSpeed of Object.keys(Flow.presets)){
  const timers=new Map();let id=0,complete;
  const flow=new Flow.GameFlow({options:()=>({animationSpeed}),clock:{setTimeout:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},clearTimeout:key=>timers.delete(key)}});
  const before={turn:0,status:'playing',timeline:{turn:7}},after={turn:0,status:'playing',timeline:{turn:7}};
  const pending=flow.present(()=>new Promise(resolve=>complete=resolve),{before,after});assert.equal(timers.size,0);
  complete();await pending;
  const next=flow.present(()=>Promise.resolve(),{before,after:{...after,timeline:{turn:8}},events:[{reveal:{kind:'card'}}]});
  assert.equal(timers.size,1,'same actor does not mean same game turn');[...timers.values()][0].fn();await next;
 }
});

test('non-card placements do not inherit a card reveal delay',async()=>{
 const timers=[];const flow=new Flow.GameFlow({options:()=>({animationSpeed:'fast'}),clock:{setTimeout:(_,ms)=>timers.push(ms),clearTimeout:()=>{}}});
 for(const event of [{kind:'place'},{kind:'move'}])await flow.present(()=>Promise.resolve(),{events:[event]});
 assert.deepEqual(timers,[]);
});
