'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Stream=require('../presentation/event-stream.js');
const frame=(events=[],extra={})=>({kind:'snapshot',sessionId:'s',authorityEpoch:'e',viewer:0,role:'player',game:'g',packVersion:'1',revision:events.at(-1)?.revision||0,state:{move:0},events,...extra});
const event=(id,revision=id)=>({id,revision,type:'fact',actor:0,params:{id}});
test('event stream transmits only new visible facts and allows private ID gaps',()=>{
 const prepared=[],encode=Stream.encoder(value=>{prepared.push(value.events.map(e=>e.id));return value;}),decode=Stream.decoder();
 const a=frame([event(1)]),b=frame([event(1),event(9)]);
 assert.deepEqual(decode(encode(a)),a);const wire=encode(b);
 assert.equal(wire.eventBase,1);assert.deepEqual(wire.events,[event(9)]);assert.deepEqual(decode(wire),b);assert.deepEqual(encode(b).events,[]);
 assert.deepEqual(prepared,[[1],[9],[]],'compaction receives only the authorized suffix after the first checkpoint');
});
test('gap fails explicitly; checkpoint recovers without historical reply changing live cursor',()=>{
 const encode=Stream.encoder(x=>x),decode=Stream.decoder();decode(encode(frame([event(1)])));encode(frame([event(1),event(2)]));assert.throws(()=>decode(encode(frame([event(1),event(2),event(3)]))),/GAP/);const latest=frame([event(1),event(2),event(3)]);assert.deepEqual(decode(encode(latest,{checkpoint:true})),latest);decode(encode(frame([event(1)],{kind:'history'})));const next=frame([...latest.events,event(4)]);assert.deepEqual(decode(encode(next)),next);
});
test('old packet is idempotent and cannot move live cursor backwards',()=>{
 const encode=Stream.encoder(x=>x),decode=Stream.decoder();decode(encode(frame([event(1)])));const second=encode(frame([event(1),event(2)]));decode(second);decode(encode(frame([event(1),event(2),event(3)])));decode(second);assert.deepEqual(decode(encode(frame([event(1),event(2),event(3),event(4)]))).events.map(e=>e.id),[1,2,3,4]);
});
test('only current-revision scenes survive expansion and historical scene stays intact',()=>{
 const encode=Stream.encoder(x=>x),decode=Stream.decoder();
 const a=frame([{...event(1),scene:{x:1}}]),one=decode(encode(a));
 const refreshed=decode(encode({...a,controlRevision:1}));
 assert.equal(refreshed.events,one.events,'a control-only update reuses the authorized journal');
 const history=frame([{...event(1),scene:{x:1}},{...event(9),scene:{x:9}}],{kind:'history'});
 assert.deepEqual(decode(encode(history)).events,[event(1),history.events[1]],'a full historical reply retains only its requested scene');
 const quiet=decode(encode({...a,revision:2}));
 assert.deepEqual(quiet.events,[event(1)],'revision advancement retires a scene even without a new visible event');
 assert.deepEqual(one.events,a.events,'earlier snapshots retain their own scene');
 const b=frame([event(1),{...event(2,3),scene:{x:2}}]);
 const two=decode(encode(b));assert.deepEqual(two,b);
 assert.equal(two.events[0],quiet.events[0],'a new event shares the existing authorized fact');
});
test('scope changes require a checkpoint; malformed sequences are rejected',()=>{
 const decode=Stream.decoder();decode({...frame([event(1)]),eventBase:null,eventCursor:1});assert.throws(()=>decode({...frame([event(2)],{viewer:1}),eventBase:1,eventCursor:2}),/GAP/);
 for(const wire of [{eventBase:null,eventCursor:-1},{eventBase:0,eventCursor:2,events:[event(2),event(1)]},{eventBase:0,eventCursor:3,events:[event(2)]}])assert.throws(()=>decode({...frame(),...wire}),/INVALID/);
});
