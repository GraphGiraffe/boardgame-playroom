'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),Sync=require('../presentation/projection-sync.js'),P=require('../core/protocol.js'),Stream=require('../presentation/event-stream.js');
const event=id=>({id,revision:id,type:'fact',actor:0,params:{id}});
const frame=(revision,events=[],extra={})=>({kind:'snapshot',sessionId:'s',authorityEpoch:'e',game:'g',packVersion:'1',viewer:0,role:'player',revision,controlRevision:0,rosterRevision:0,state:{players:[{name:'A'}],data:{large:'x'.repeat(2000),revision}},events,...extra});
const encode=()=>{const e=Stream.encoder(x=>x),s=Sync.encoder();return {send:(v,o)=>s(e(v,o)),status:s.status};};
const decode=()=>{const s=Sync.decoder(),e=Stream.decoder();return async v=>e(await s(P.parse(JSON.stringify(v))));};
test('projection checkpoint, small patch and SHA-256 status agree across private event gaps',async()=>{
 const host=encode(),read=decode(),one=frame(1,[event(1)]),first=await host.send(one),a=await read(first);assert.equal(first.mode,'checkpoint');assert.equal(first.hash.length,71);assert.equal(a.projectionHash,first.hash);assert.equal(P.sameStatus(host.status(P.status(one)),a),true);
 const next=frame(2,[event(1),event(9)]),wire=await host.send(next),b=await read(wire);assert.equal(wire.mode,'patch');assert.equal(wire.baseHash,first.hash);assert.deepEqual(b.state,next.state);assert.deepEqual(b.events,next.events);assert.deepEqual(wire.events,[event(9)]);assert(Buffer.byteLength(JSON.stringify(wire))<Buffer.byteLength(JSON.stringify(first)));
 assert.equal(await P.fingerprint('abc'),'sha256:'+crypto.createHash('sha256').update('abc').digest('hex'));
});
test('missing patch and changed content fail; checkpoint repairs without advancing history cursors',async()=>{
 const host=encode(),read=decode();await read(await host.send(frame(1,[event(1)])));await host.send(frame(2,[event(1),event(2)]));const third=await host.send(frame(3,[event(1),event(2),event(3)]));await assert.rejects(read(third),/GAP/);
 const repair=await host.send(frame(3,[event(1),event(2),event(3)]),{checkpoint:true});await read(repair);const old=await host.send(frame(1,[event(1)],{kind:'history'}));assert.equal((await read(old)).kind,'history');const fourth=await host.send(frame(4,[event(1),event(2),event(3),event(4)]));const damaged=JSON.parse(JSON.stringify(fourth));damaged.events[0].params.id=100;await assert.rejects(read(damaged),/HASH_MISMATCH/);assert.equal((await read(fourth)).revision,4);assert.equal((await read(fourth)).revision,4,'duplicate does not reapply patch');
});
test('patch handles removals, arrays and inert __proto__ keys without polluting prototypes',()=>{
 const a=P.parse('{"old":1,"nested":{"a":1},"list":[1,2]}'),b=P.parse('{"nested":{"__proto__":{"value":3}},"list":[3]}');assert.deepEqual(Sync.apply(a,Sync.diff(a,b)),b);assert.equal({}.value,undefined);assert.throws(()=>Sync.apply(a,[{op:'set',path:['missing','a'],value:1}]),/PATCH_INVALID/);
});
test('audience changes use a checkpoint; semantic state hash excludes display labels',async()=>{
 const a=encode(),b=encode(),one=frame(0,[],{state:{players:[{name:'A'}],result:{label:'Очки',metrics:[{id:'score',label:'Очки',values:[1]}]}}}),other={...one,state:{...one.state,result:{label:'Points',metrics:[{id:'score',label:'Points',values:[1]}]}}};assert.equal((await a.send(one)).hash,(await b.send(other)).hash);const publicFrame=await a.send({...one,viewer:-1,role:'spectator'});assert.equal(publicFrame.mode,'checkpoint');assert.notEqual(publicFrame.hash,(await b.send(other)).hash);
});

test('compact operations share typed path prefixes and preserve all operation kinds and inert keys',()=>{
 const operations=[{op:'set',path:['model','data','players',0,'pos'],value:[1,2]},{op:'set',path:['model','data','players',1,'pos'],value:[2,3]},{op:'remove',path:['model','data','старое']},{op:'splice',path:['model','data','cards'],index:1,deleteCount:2,values:[{id:'new'}]},{op:'set',path:['__proto__','value'],value:5}];
 const packed=Sync.packOps(operations);assert.deepEqual(Sync.unpackOps(packed),operations);assert.equal(packed[1][1],3);assert(Buffer.byteLength(JSON.stringify(packed))<Buffer.byteLength(JSON.stringify(operations))*.7);assert.equal({}.value,undefined);
 for(const invalid of [[[9,0,[],1]],[[0,1,[],1]],[[0,-1,[],1]],[[0,0,'x',1]],[[0,0,Array(65).fill('x'),1]],[[2,0,[],0,1]],Array(4097).fill([1,0,[]])])assert.throws(()=>Sync.unpackOps(invalid),/PATCH_INVALID/);
});
test('format 3 omits repeated scope and intermediate hash but verifies the same full event/state signature',async()=>{
 const host=encode(),read=decode(),one=frame(1,[event(1)]),first=await host.send(one);assert.equal(first.format,3);assert.equal(typeof first.scope,'string');assert(!Object.hasOwn(first,'eventsHash'));await read(first);
 const two=frame(2,[event(1),event(9)]),wire=await host.send(two);assert.equal(wire.mode,'patch');assert(!Object.hasOwn(wire,'scope'));assert(!Object.hasOwn(wire,'eventsHash'));assert(wire.body.every(Array.isArray));
 const zero='sha256:'+'0'.repeat(64),chain1=await P.fingerprint(zero+'\n'+P.canonical(event(1))),chain2=await P.fingerprint(chain1+'\n'+P.canonical(event(9))),{events,...position}=two;
 assert.equal(wire.hash,await P.fingerprint(P.canonical({position,eventsHash:chain2,eventCursor:9})));
 const bad=JSON.parse(JSON.stringify(wire));bad.body[0][1]=64;await assert.rejects(read(bad),/PATCH_INVALID/);assert.deepEqual((await read(wire)).state,two.state);
});
test('historical audience checkpoints do not replace the live implicit patch scope',async()=>{
 const host=encode(),read=decode();await read(await host.send(frame(1,[event(1)])));
 const old=await host.send({...frame(0,[]),kind:'history',viewer:-1,role:'spectator'});assert.equal((await read(old)).viewer,-1);
 const next=await host.send(frame(2,[event(1),event(2)]));assert.equal(next.mode,'patch');assert(!Object.hasOwn(next,'scope'));assert.equal((await read(next)).viewer,0);
});

test('signed control updates reuse the full authorized journal for duplicate frames',async()=>{
 const host=encode(),read=Sync.decoder(),visible=[event(1),event(9)];
 const send=async value=>P.parse(JSON.stringify(await host.send(value)));
 const firstPacket=await send(frame(9,visible)),first=await read(firstPacket);
 const controlPacket=await send(frame(9,visible,{controlRevision:1})),control=await read(controlPacket);
 assert.notEqual(control.projectionHash,first.projectionHash);
 assert.deepEqual(control.events,[]);
 const duplicate=await read(controlPacket);
 assert.equal(duplicate.eventBase,null);
 assert.equal(duplicate.events,first.events);
 const advanced=await send(frame(11,[...visible,event(11)],{controlRevision:1}));
 await read(advanced);
 const repeat=await read(advanced);
 assert.equal(repeat.events[0],first.events[0]);
 assert.deepEqual(repeat.events,[...visible,event(11)]);
});
