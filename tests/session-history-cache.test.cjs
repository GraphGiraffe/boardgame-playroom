'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Client=require('../app/session-client.js');
const frame=(revision,extra={})=>({protocolVersion:3,kind:'snapshot',sessionId:'s',authorityEpoch:'e',game:'uno',packVersion:'1',viewer:0,role:'player',revision,historyLength:revision+1,state:{move:revision,game:'uno',packVersion:'1',scene:{players:[]}},events:[{id:revision,text:'seen '+revision}],actions:[{type:'play'}],...extra});
test('first received frame stays local and the current live revision survives cache eviction',async()=>{
 let calls=0;const client=new Client({history:async i=>{calls++;return frame(i);}},{historyBudget:1});
 client.accept(frame(4));const first=client.snapshot;
 assert.equal((await client.history(4)).state,first.state);assert.equal(calls,0);
 client.accept(frame(5));const live=client.snapshot;
 assert.deepEqual([...client.historyFrames.keys()],[5]);
 await client.history(0);assert.deepEqual([...client.historyFrames.keys()],[5]);
 assert.equal((await client.history(5)).state,live.state);assert.equal(calls,1);assert.equal(client.snapshot,live);client.close();
});
test('received frames replay locally with stable state references and no extra host traffic',async()=>{
 let calls=0;const client=new Client({history(){calls++;throw Error('offline');}});
 for(let i=0;i<5;i++)client.accept(frame(i));
 const live=client.snapshot;
 for(let pass=0;pass<3;pass++)for(let i=0;i<5;i++){const old=await client.history(i);assert.equal(old.kind,'history');assert.equal(old.revision,i);assert.deepEqual(old.actions,[]);assert(Object.isFrozen(old.state));}
 assert.equal((await client.history(4)).state,live.state);assert.equal(calls,0);assert.equal(client.snapshot,live);
});
test('persistent history survives a new client, reads once and has no network/write on cache hit',async()=>{
 let reads=0,writes=0;const saved=frame(1);delete saved.role;
 const client=new Client({history(){throw Error('offline');}},{readHistory:async()=>{reads++;return saved;},writeHistory:()=>writes++});client.accept(frame(3));
 assert.equal((await client.history(1)).role,'player');await client.history(1);assert.equal(reads,1);assert.equal(writes,0);
});
test('a missing frame is fetched once for concurrent readers and persisted once',async()=>{
 let calls=0,writes=0,release;const gate=new Promise(resolve=>release=resolve);
 const client=new Client({history:async i=>{calls++;await gate;return frame(i,{kind:'history'});}},{writeHistory:()=>writes++});client.accept(frame(3));
 const a=client.history(1),b=client.history(1);release();assert.equal(await a,await b);await client.history(1);assert.equal(calls,1);assert.equal(writes,1);
});
test('disk scope mismatches never enter the cache; a valid host projection replaces them',async()=>{
 for(const extra of [{viewer:1},{role:'table'},{sessionId:'other'},{authorityEpoch:'other'},{packVersion:'2'}]){
 let calls=0;const client=new Client({history:async i=>{calls++;return frame(i,{kind:'history'});}},{readHistory:async()=>frame(1,extra)});client.accept(frame(3));assert.equal((await client.history(1)).viewer,0);assert.equal(calls,1);
 }
});
test('invalid remote frames are rejected, failures can retry, and close discards pending results',async()=>{
 let calls=0;const client=new Client({history:async i=>{calls++;return frame(i,calls===1?{viewer:1}:{kind:'history'});}});client.accept(frame(3));await assert.rejects(client.history(1),/HISTORY_FRAME_INVALID/);await client.history(1);assert.equal(calls,2);
 let release;const gate=new Promise(resolve=>release=resolve),pendingClient=new Client({history:async()=>gate});pendingClient.accept(frame(3));const pending=pendingClient.history(1);pendingClient.close();release(frame(1));await assert.rejects(pending,/HISTORY_(FRAME_INVALID|CLOSED)/);assert.equal(pendingClient.historyFrames.size,0);
});
test('memory is bounded; evicted frames use persistent cache and storage failures retain memory',async()=>{
 let reads=0;const client=new Client({history(){throw Error('offline');}},{readHistory:async i=>{reads++;return frame(i);}});for(let i=0;i<140;i++)client.accept(frame(i));assert.equal(client.historyFrames.size,128);await client.history(0);assert.equal(reads,1);assert.equal(client.historyFrames.size,128);
 let calls=0;const fallback=new Client({history:async i=>{calls++;return frame(i);}},{readHistory:()=>{throw Error('disk');},writeHistory:()=>{throw Error('disk');}});fallback.accept(frame(3));await fallback.history(1);await fallback.history(1);assert.equal(calls,1);
 for(const i of [-1,4,1.5])await assert.rejects(fallback.history(i),/HISTORY_REVISION_INVALID/);
});

test('history obeys a byte budget, retains live state and updates LRU order',async()=>{
 const size=Buffer.byteLength(JSON.stringify({...frame(0),kind:'history',actions:[],independentActions:[],cues:[],effects:[],reactionWindow:null,reactionWindows:[]}));
 const client=new Client({history:async i=>frame(i)},{historyBudget:size*2+100});
 for(let i=0;i<10;i++)client.accept(frame(i));assert(client.historyBytes<=client.historyBudget);assert(client.historyFrames.has(9));assert(client.historyFrames.size<=2);
 await client.history(0);assert(client.historyFrames.has(9));assert(client.historyBytes<=client.historyBudget);client.close();assert.equal(client.historyBytes,0);
 const tiny=new Client({},{historyBudget:1});tiny.accept(frame(0));assert.equal(tiny.historyFrames.size,1);assert(tiny.historyBytes>1);tiny.close();
});

test('history ranges combine only missing runs, validate scope and persist each missing frame once',async()=>{
 const ranges=[],single=[],saved=[];const client=new Client({historyRange:async(start,count)=>{ranges.push([start,count]);return {frames:Array.from({length:count},(_,i)=>frame(start+i,{kind:'history'})),next:start+count};},history:async i=>{single.push(i);return frame(i);}},{readHistory:async i=>i===2?frame(i):null,writeHistory:f=>saved.push(f.revision)});client.accept(frame(6));
 const result=await client.historyRange(0,7);assert.deepEqual(result.frames.map(f=>f.revision),[0,1,2,3,4,5,6]);assert.deepEqual(ranges,[[0,2],[3,3]]);assert.deepEqual(single,[]);assert.deepEqual(saved.sort(),[0,1,3,4,5]);await client.historyRange(0,7);assert.equal(ranges.length,2);client.close();
});
test('oversized range frames use single-frame fallback and foreign audience is rejected',async()=>{
 let singles=0;const client=new Client({historyRange:async start=>({frames:[],next:start,oversized:start}),history:async i=>{singles++;return frame(i);}});client.accept(frame(2));await client.historyRange(0,2);assert.equal(singles,2);client.close();
 const bad=new Client({historyRange:async start=>({frames:[frame(start,{kind:'history',viewer:1})],next:start+1})});bad.accept(frame(2));await assert.rejects(bad.historyRange(0,1),/HISTORY_FRAME_INVALID/);bad.close();
});

test('overlapping range readers share pending frames instead of issuing duplicate requests',async()=>{
 let calls=0;const client=new Client({historyRange:async(start,count)=>{calls++;await new Promise(r=>setImmediate(r));return {frames:Array.from({length:count},(_,i)=>frame(start+i,{kind:'history'})),next:start+count};},history(){throw Error('unexpected single request');}});client.accept(frame(4));
 const [a,b]=await Promise.all([client.historyRange(0,4),client.historyRange(0,4)]);assert.equal(calls,1);assert.deepEqual(a.frames,b.frames);client.close();
});
