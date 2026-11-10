'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js'),Push=require('../application/game-push-events.js'),Access=require('../application/session-access.js');
require('../packs/uno/rules.js');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const room=()=>({id:'test-room',ownerId:'p0',phase:'playing',transportMode:'online',participants:[0,1].map(i=>({id:'p'+i,role:'player',bot:false})),seats:[0,1].map(i=>({index:i,participantId:'p'+i}))});
test('host activity equals authorized blocking actions without building projections',async()=>{
 const s=new Session(E,'uno',{seed:17,players:[{name:'A'},{name:'B'}]}),a=new Authority(s);let notices=0;
 try{
  const expected=[0,1].filter(i=>{const b=a.connect(i);try{const f=b.snapshot();return f.actions.some(action=>!f.independentActions.includes(action));}finally{b.close();}});
  const original=a._snapshot;a._snapshot=()=>{throw Error('activity must not build scenes');};assert.deepEqual(a.activity().targets,expected);
  const seen=[],p=new Push({authority:a,room:room,access:Access,send:async value=>{seen.push(value);}});await p.queue;assert.equal(seen.length,1);assert.deepEqual(seen[0].targets,expected.map(i=>'p'+i));assert(!JSON.stringify(seen).includes('hand'));
  p.close();a._snapshot=original;const off=a.subscribeActivity(()=>notices++),binding=a.connect(s.current.turn),snap=binding.snapshot();const receipt=await binding.dispatch(P.command(snap,snap.actions[0],'activity-action'));assert(receipt.ok);assert.equal(notices,1);off();binding.close();
 }finally{a.dispose();}
});
test('push coalesces revisions and bursts, keeps latest lifecycle state and cancels close',async()=>{
 let listener,revision=0,state='playing',targets=[0],release;const sent=[],a={subscribeActivity(fn){listener=fn;return ()=>{listener=null;}},activity:()=>({sessionId:'session',revision,controlRevision:0,state,targets})};
 const p=new Push({authority:a,room:room,access:Access,send:(value,{signal})=>{sent.push({value,signal});return sent.length===1?new Promise(resolve=>{release=resolve;}):Promise.resolve();}});
 for(let i=0;i<100;i++){revision++;listener();}assert.equal(sent.length,1);assert.equal(p.pending,null,'same targets/state do not create cloud work');
 targets=[1];revision++;listener();targets=[0];revision++;listener();state='paused';targets=[];revision++;listener();assert.equal(p.pending.state,'paused');state='playing';targets=[1];revision++;listener();state='finished';targets=[];revision++;listener();
 assert.equal(sent.length,1);assert.equal(p.pending.state,'finished');release();await tick();await p.queue;assert.equal(sent.length,2);assert.equal(sent[1].value.state,'finished');
 p.close();assert(sent[1].signal.aborted);assert.equal(listener,null);
});
test('failed optional push does not retry stale states or send after close',async()=>{
 let listener,revision=0,targets=[0],retry;const seen=[],a={subscribeActivity(fn){listener=fn;return ()=>{}},activity:()=>({sessionId:'s',revision,controlRevision:0,state:'playing',targets})};
 const p=new Push({authority:a,room:room,access:Access,delay:()=>new Promise(resolve=>retry=resolve),send:async value=>{seen.push(value);throw Error('network');}});await tick();targets=[1];revision++;listener();p.close();retry();await p.queue;assert.equal(seen.length,1);assert.equal(p.pending,null);
});

test('canonical memoization preserves JSON ordering and never trusts a frozen foreign shell',()=>{
 const oracle=x=>JSON.stringify(x,(_,v)=>v!==null&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
 for(const v of [{z:undefined,a:[undefined,NaN,-0,Infinity]},JSON.parse('{"10":1,"2":2,"__proto__":{"x":2},"a":3}'),new Date(0),{toJSON(){return {z:2,a:1};}}])assert.equal(P.canonical(v),oracle(v));
 const owned=P.immutable({nested:{a:1,z:3},list:[1,null]});assert.equal(P.canonical(owned),oracle(owned));assert.equal(P.canonical({payload:owned}),oracle({payload:owned}));
 const foreign=Object.freeze({nested:{a:1}});P.canonical(foreign);foreign.nested.a=2;assert.equal(P.canonical(foreign),oracle(foreign));const cycle={};cycle.self=cycle;assert.throws(()=>P.canonical(cycle),TypeError);
});
test('array projection deltas touch changed items and splice only changed ranges',()=>{
 const Sync=require('../presentation/projection-sync.js'),a=P.immutable({players:Array.from({length:8},(_,i)=>({id:i,hand:Array(100).fill('back'),score:0}))}),b=P.immutable({...a,players:a.players.map((p,i)=>i===6?{...p,score:12,hand:[...p.hand,'back']}:p)}),ops=Sync.diff(a,b),copy=Sync.apply(a,ops);
 assert.deepEqual(copy,b);assert.equal(copy.players[0],a.players[0]);assert(Buffer.byteLength(JSON.stringify(ops))<250);assert(ops.some(op=>op.op==='splice'));
 assert.throws(()=>Sync.apply(a,[{op:'splice',path:['players'],index:0,deleteCount:99,values:[]}]),/PATCH_INVALID/);assert.deepEqual(a.players[0].score,0);
});
test('public frame sequence reconstructs every max-player Mage frame without private data',()=>{
 const F=require('../../playroom-paks/shared/domain/frame-sequence.js');require('../packs/mage-brawl/rules.js');const s=new Session(E,'mage-brawl',{seed:42,players:Array.from({length:8},(_,i)=>({name:'M'+i})),actionsPerTurn:'2'});let raw=0,packed=0,resolved=0;
 for(let step=0;step<64&&s.current.status==='playing';step++){
  const st=s.current,w=E.decisionWindow(st),actor=w?.participants.find(p=>!w.ready.includes(p))??st.turn,command=E.botAction(st,actor);assert(command);s.act(actor,command);
  if(s.current.data.frames.length){const p=E.project(s.current,0,{rawEvents:true}).modelProjection,seq=p.data.frameSequence;assert(!Object.hasOwn(p.data,'frames'));assert.deepEqual(F.expand(seq),s.current.data.frames);assert(!JSON.stringify(seq).includes('cardId'));raw+=JSON.stringify(s.current.data.frames).length;packed+=JSON.stringify(seq).length;resolved++;}
 }
 assert(resolved>0);assert(packed<raw*.45,`${packed}/${raw}`);
 const input=[{x:{value:1}},{x:{value:2}}],encoded=F.encode(input);input[1].x.value=9;assert.equal(F.expand(encoded)[1].x.value,2);assert.throws(()=>F.expand({format:1,base:{},deltas:[[[1,['missing','child'],1]]]}),/FRAME_DELTA_INVALID/);
});
test('bounded cold history follows next ranges and shares overlapping reads without singleton fanout',async()=>{
 const Client=require('../application/client-connection-service.js'),requests=[],f=i=>({kind:'history',protocolVersion:3,sessionId:'s',authorityEpoch:'e',game:'g',packVersion:'1',viewer:0,role:'player',revision:i,state:{move:i},events:[]}),client=new Client({historyRange:async(start,count)=>{requests.push([start,count]);const n=Math.min(count,3);return {frames:Array.from({length:n},(_,i)=>f(start+i)),next:start+n};},history(){throw Error('singleton fanout');}},{idFactory:()=> 'unused'});client.accept({...f(20),kind:'snapshot',historyLength:21});
 try{const [a,b]=await Promise.all([client.historyRange(4,12),client.historyRange(4,12)]);assert.deepEqual(a,b);assert.deepEqual(requests,[[4,12],[7,9],[10,6],[13,3]]);await client.historyRange(4,12);assert.equal(requests.length,4);}finally{client.close();}
});
test('early durable ACK waits for matching push, and concurrent repairs share one checkpoint',async()=>{
 const Client=require('../application/client-connection-service.js'),f=i=>({kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',game:'g',packVersion:'1',viewer:0,role:'player',revision:i,historyLength:i+1,state:{move:i},events:[],actions:[{type:'move'}]});let snapshots=0,push;
 const client=new Client({subscribe:fn=>{push=fn;return ()=>{};},dispatch:async c=>{setTimeout(()=>push(f(1)),20);return {ok:true,commandId:c.commandId,revision:1};},snapshot:async()=>{snapshots++;await tick();return f(1);}},{idFactory:()=> 'early-ack'});client.accept(f(0));
 try{assert((await client.send({type:'move'})).ok);assert.equal(client.snapshot.revision,1);assert.equal(snapshots,0);await Promise.all([client.refresh(),client.refresh(),client.refresh()]);assert.equal(snapshots,1);}finally{client.close();}
});
test('UInt16 preview codec preserves exact geometry and rejects invalid dimensions and oversized frames',()=>{
 const Preview=require('../platform/web/realtime-peer.js'),packet={scope:{sessionId:'s',authorityEpoch:'e',roundId:'r'},data:{id:'stroke',kind:'ink.append',actor:2,from:89,seq:90,style:{color:'#336699',width:256},points:Array.from({length:128},(_,i)=>[i*511,65535-i])}},wire=Preview.encodePoints(1,packet.data);assert.deepEqual(Preview.decode(Preview.encode(packet)),packet);assert.deepEqual(Preview.decodePoints(wire),{reference:1,seq:90,from:89,points:packet.data.points});assert.equal(wire.byteLength,20+128*4);assert(wire.byteLength<Buffer.byteLength(JSON.stringify(packet))*.7);assert.throws(()=>Preview.decodePoints(wire.slice(0,-1)),/PREVIEW_INVALID/);assert.throws(()=>Preview.encodePoints(1,{...packet.data,points:[[65536,0]]}),/PREVIEW_INVALID/);
});

test('durable receipt bypasses a blocked projection hash queue',async()=>{
 const W=require('../app/transports/webrtc.js');class Channel extends EventTarget{constructor(){super();this.readyState='open';this.bufferedAmount=0;}send(data){queueMicrotask(()=>this.peer.dispatchEvent(new MessageEvent('message',{data})));}close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
 const s=new Session(E,'uno',{seed:17,players:[{name:'A'},{name:'B'}]}),a=new Authority(s),binding=a.connect(s.current.turn),host=new Channel(),guest=new Channel();host.peer=guest;guest.peer=host;const stop=W.serve(host,binding),transport=W.client(guest,{timeout:2000}),original=P.fingerprint;let release;
 try{await transport.ready();const initial=await transport.snapshot();const gate=new Promise(resolve=>release=resolve);P.fingerprint=async value=>{await gate;return original(value);};const command=P.command(initial,E.availableCommands(s.current,0).find(c=>c.type==='draw')||E.availableCommands(s.current,0)[0],'blocked-projection');const receipt=await Promise.race([transport.dispatch(command),new Promise((_,reject)=>setTimeout(()=>reject(Error('ACK waited for projection hash')),300))]);assert(receipt.ok);assert.equal(receipt.revision,s.current.move);assert.equal(s.current.move,1);}finally{P.fingerprint=original;release?.();await tick();transport.close();stop();a.dispose();}
});

test('received compact receipt bypasses a blocked client projection decode and checkpoints coalesce',async()=>{
 const W=require('../app/transports/webrtc.js'),Sync=require('../presentation/projection-sync.js'),Stream=require('../presentation/event-stream.js');class Channel extends EventTarget{constructor(){super();this.readyState='open';this.bufferedAmount=0;}send(data){queueMicrotask(()=>this.peer.dispatchEvent(new MessageEvent('message',{data})));}close(){this.readyState='closed';this.dispatchEvent(new Event('close'));}}
 const host=new Channel(),guest=new Channel();host.peer=guest;guest.peer=host;let requests=0,snapshotRequest;
 host.addEventListener('message',e=>{const message=require('../application/wire-codec.js').decode(e.data);if(message.kind==='hello')host.send(require('../application/wire-codec.js').encode({kind:'transport-ready',version:14}));if(message.method==='dispatch')host.send(require('../application/wire-codec.js').encode({kind:'response',requestId:message.requestId,result:{ok:true,code:'OK',commandId:require('../application/command-wire.js').host().decode(message.value).commandId,revision:1}}));if(message.method==='snapshot'){requests++;snapshotRequest=message.requestId;}});
 const f={kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',game:'g',packVersion:'1',viewer:0,role:'player',revision:1,state:{move:1},events:[]},wire=await Sync.encoder()(Stream.encoder(x=>x)(f)),transport=W.client(guest,{timeout:2000}),original=P.fingerprint;let release;
 try{await transport.ready();const gate=new Promise(resolve=>release=resolve);P.fingerprint=async value=>{await gate;return original(value);};host.send(require('../application/wire-codec.js').encode({kind:'snapshot',snapshot:wire}));await tick();const receipt=await Promise.race([transport.dispatch({commandId:'client-decode'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('ACK waited for client decode')),300))]);assert(receipt.ok);const a=transport.snapshot(),b=transport.snapshot();await tick();assert.equal(requests,1);release();host.send(require('../application/wire-codec.js').encode({kind:'response',requestId:snapshotRequest,result:wire}));assert.deepEqual(await a,await b);}finally{P.fingerprint=original;release?.();transport.close();host.close();guest.close();}
});

test('early receipt retains input lock until its pushed position is accepted',async()=>{
 const Client=require('../application/client-connection-service.js'),f=revision=>({kind:'snapshot',protocolVersion:3,sessionId:'s',authorityEpoch:'e',game:'g',packVersion:'1',viewer:0,role:'player',revision,historyLength:revision+1,state:{move:revision},events:[],actions:[{type:'move'}]});let calls=0,push,id=0;
 const client=new Client({subscribe:fn=>{push=fn;return ()=>{};},dispatch:async c=>({ok:true,commandId:c.commandId,revision:++calls}),snapshot(){throw Error('unexpected repair');}},{idFactory:()=> 'input-lock-'+(++id)});client.accept(f(0));
 try{const first=client.send({type:'move'});await tick();assert(client.inFlight);assert(client.pending);await assert.rejects(client.send({type:'move'}));assert.equal(calls,1);push(f(1));await first;assert.equal(client.pending,null);const second=client.send({type:'move'});await tick();assert.equal(calls,2);push(f(2));await second;assert.equal(client.snapshot.revision,2);}finally{client.close();}
});
