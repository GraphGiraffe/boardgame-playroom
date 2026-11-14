'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../core/protocol.js'),Wire=require('../application/command-wire.js'),W=require('../app/transports/webrtc.js');
const actions=[{type:'play',cardId:'card:34',color:'red'},{type:'place',position:[3,4]},{type:'roll',dice:[1,3]}];
const frame=(revision=0,extra={})=>({protocolVersion:3,kind:'snapshot',sessionId:'session',authorityEpoch:'epoch',game:'fixture',packVersion:'1',viewer:0,role:'player',revision,controlRevision:0,historyLength:revision+1,state:{move:revision,players:[{name:'Player'}]},events:[],...extra});
const command=(action=actions[0],revision=0,extra={})=>({protocolVersion:3,sessionId:'session',authorityEpoch:'epoch',commandId:'stable-receipt-id',expectedRevision:revision,action,...extra});
test('component commands preserve card, target and dice IDs without an action list or combination map',()=>{
 const host=Wire.host(),client=Wire.client(),snapshot=host.attach(frame());client.remember(snapshot);
 for(const action of [...actions,{type:'new-custom-action',tool:'pencil',points:[[1,2],[3,4]]}]){
  const full=command(action),packet=client.encode(full);assert.equal(packet[0],0);assert.equal(packet.length,5);assert.deepEqual(packet[4],action);assert.deepEqual(host.decode(packet),full);assert(!JSON.stringify(packet).includes('actor'));assert(Buffer.byteLength(JSON.stringify(packet))<Buffer.byteLength(JSON.stringify(full))*.75);
 }
 for(let revision=1;revision<=100;revision++){const next=host.attach(frame(revision));assert.equal(next.commandScope,snapshot.commandScope);client.remember(next);assert.deepEqual(host.decode(client.encode(command(actions[0],revision))),command(actions[0],revision));}
});
test('connection context never relabels a Table actor or a foreign session',()=>{
 const host=Wire.host(),client=Wire.client(),snapshot=host.attach(frame(0,{role:'table',viewer:-1,actor:2}));client.remember(snapshot);const full=command(actions[0],0,{actor:2});assert.deepEqual(host.decode(client.encode(full)),full);assert.throws(()=>Wire.host().decode(client.encode(full)),/CONTEXT_EXPIRED/);
 const otherActor=command(actions[0],0,{actor:1});assert.equal(client.encode(otherActor)[0],1);assert.deepEqual(host.decode(client.encode(otherActor)),otherActor);
 const otherSession=command(actions[0],0,{sessionId:'different'});assert.equal(client.encode(otherSession)[0],1);
});
test('bounded identity contexts preserve original receipt IDs and revisions on expiry',()=>{
 const host=Wire.host(),client=Wire.client(),initial=host.attach(frame());client.remember(initial);const full=command(),packet=client.encode(full);
 for(let i=1;i<=Wire.LIMIT;i++)client.remember(host.attach(frame(i,{authorityEpoch:'epoch-'+i})));
 assert.throws(()=>host.decode(packet),/CONTEXT_EXPIRED/);assert.equal(client.encode(full)[0],1);assert.deepEqual(host.decode(client.encode(full)),full);
 for(const data of [{type:'join',nickname:'Name'},{...command(),action:{type:'session-pause',paused:true,expectedControlRevision:0}},{...command(),protocolVersion:99}])assert.deepEqual(host.decode(client.encode(data)),data);
 for(const bad of [{},[0,1,'id',-1,{}],[0,initial.commandScope,'id',1,0],[0,1,'id',0,{}],[1,{},'extra']])assert.throws(()=>host.decode(bad),/CONTEXT_(INVALID|EXPIRED)/);
});
test('component input is detached and same context ID cannot acquire a new identity',()=>{
 const host=Wire.host(),client=Wire.client(),issued=host.attach(frame());client.remember(issued);const mutable=command({type:'play',cardId:'card:34'}),packet=client.encode(mutable);mutable.action.cardId='changed';assert.equal(host.decode(packet).action.cardId,'card:34');
 client.remember({...issued,revision:1,projectionHash:'sha256:'+'b'.repeat(64)});assert.throws(()=>client.remember({...issued,authorityEpoch:'different'}),/CONTEXT_INVALID/);
 const inert=JSON.parse('{"type":"custom","__proto__":{"polluted":true}}');assert.deepEqual(host.decode(client.encode(command(inert))).action,inert);assert.equal({}.polluted,undefined);
});
class Channel extends EventTarget{constructor(){super();this.readyState='open';this.bufferedAmount=0;this.sent=[];this.dropPush=false;}send(data){const value=require('../application/wire-codec.js').decode(data);this.sent.push(value);if(this.dropPush&&value.kind==='snapshot')return;queueMicrotask(()=>this.peer.dispatchEvent(new MessageEvent('message',{data})));}close(){if(this.readyState==='closed')return;this.readyState='closed';this.dispatchEvent(new Event('close'));}}
test('expired connection context retries the identical original command once',async()=>{
 const host=new Channel(),guest=new Channel();host.peer=guest;guest.peer=host;let publish,revision=0,received=[];const current=()=>frame(revision,revision?{authorityEpoch:'epoch-'+revision}:{}),connection={snapshot:current,status:()=>P.status(current()),subscribe:fn=>{publish=fn;return ()=>{};},dispatch:full=>{received.push(full);return {ok:false,code:'STALE',commandId:full.commandId,revision};}};
 const stop=W.serve(host,connection),transport=W.client(guest);try{await transport.ready();await transport.snapshot();host.dropPush=true;for(let i=1;i<=Wire.LIMIT+1;i++){revision=i;publish(current());}await transport.status();const original=command();const receipt=await transport.dispatch(original);assert.equal(receipt.code,'STALE');assert.deepEqual(received,[original]);const requests=guest.sent.filter(m=>m.method==='dispatch');assert.equal(requests.length,2);assert.equal(requests[0].value[0],0);assert.equal(requests[1].value[0],1);assert.deepEqual(requests[1].value[1],original);}finally{transport.close();stop();host.close();guest.close();}
});
test('authority validates raw component IDs and duplicate commands cannot apply a second move',async()=>{
 const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js');require('../../playroom-paks/packs/uno/rules.js');
 const session=new Session(E,'uno',{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Host'},{name:'Guest'}]}),authority=new Authority(session),host=new Channel(),guest=new Channel();host.peer=guest;guest.peer=host;
 const stop=W.serve(host,authority.connect(0)),transport=W.client(guest);try{
  await transport.ready();const initial=await transport.snapshot(),bad=P.command(initial,{type:'play',card:'not-owned'},'bad-component');assert.equal((await transport.dispatch(bad)).ok,false);assert.equal(session.current.move,0);
  const good=P.command(initial,E.availableCommands(session.current,0)[0],'one-move'),receipt=await transport.dispatch(good);assert(receipt.ok);assert.equal(session.current.move,1);assert((await transport.dispatch(good)).duplicate);assert.equal(session.current.move,1);
  assert.equal((await transport.dispatch({...good,action:{type:'play',card:'different'}})).code,'ID_CONFLICT');assert.equal((await transport.dispatch({...good,commandId:'forged-actor',actor:1})).ok,false);assert.equal(session.current.move,1);
 }finally{transport.close();stop();authority.dispose();}
});
