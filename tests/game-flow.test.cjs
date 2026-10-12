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
  assert.equal(network.quickPlay,true);assert.equal(local.pace().duration,1100);
  const before=network.capture({actor:1,viewer:0,action:{type:'draw'}});
  await network.play(before,{draws:[{player:1,count:2,from:'stock'}]});
  assert.deepEqual(calls[0],['capture',{actor:1,viewer:0,action:{type:'draw'}}]);
  assert.equal(calls[1][2].duration,1100);assert.equal(calls[1][2].draws[0].count,2);
  settings.animationSpeed='instant';assert.equal(local.capture({actor:0}),null);
  network.cancel();assert.deepEqual(calls.at(-1),['cancel']);
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
