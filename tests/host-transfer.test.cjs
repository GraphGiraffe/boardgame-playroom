'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Sender,bundle,lobbyBundle}=require('../application/host-transfer.js');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
E.register({id:'handoff-fixture',name:'Handoff',min:2,max:2,presets:[{id:'basic'}],create(s){s.data={secret:'HOST-ONLY',counter:0};},legal(){return [{type:'tick'}];},project(s){delete s.data.secret;},apply(s){s.data.counter++;s.turn=1-s.turn;}});
test('planned handoff requires consent and durable preparation before irreversible fence; lost commit ACK retries do not thaw',async()=>{
 for(const errorAt of ['consent','prepare','connections','fence','commit','activate',null]){
  const calls=[];let failed=false;const ports={id:()=> 'transfer-1'};
  for(const key of ['consent','freeze','prepare','connections','fence','commit','activate','cancel','thaw'])ports[key]=async()=>{calls.push(key);if(key===errorAt&&!failed){failed=true;throw Error('injected');}return true;};
  const sender=new Sender(ports);if(errorAt)await assert.rejects(sender.start('target'));else assert.equal((await sender.start('target')).complete,true);
  if(['commit','activate'].includes(errorAt)){assert.equal(sender.state.stage,'fenced');assert(!calls.includes('thaw'));await sender.finish();assert.equal(calls.filter(x=>x==='fence').length,1);}
  else if(errorAt){assert(calls.includes('cancel'));assert(calls.includes('thaw'));assert.equal(sender.state,null);}
  else assert.deepEqual(calls,['consent','freeze','prepare','connections','fence','commit','activate']);
 }
 let commits=0,activated=0,release;const gate=new Promise(resolve=>release=resolve),ports={id:()=> 'repeat',consent:async()=>true,freeze:async()=>{},prepare:async()=>{},connections:async()=>{},fence:async()=>{},commit:async()=>{if(++commits===1)throw Error('lost ack');await gate;},activate:async()=>activated++};
 const retry=new Sender(ports);await assert.rejects(retry.start('target'));const first=retry.finish(),second=retry.finish();release();await Promise.all([first,second]);assert.equal(commits,2);assert.equal(activated,1);
 const sender=new Sender({id:()=> 'decline',consent:async()=>false,freeze:()=>assert.fail('must not freeze')});assert.equal((await sender.start('target')).cancelled,true);
});
test('handoff changes host without moving players and excludes the successor resume secret',()=>{
 const room={id:'room',phase:'playing',ownerId:'a',revision:4,lobbyRevision:1,seats:[{index:0,participantId:'a',playerIndex:0},{index:1,participantId:'b',playerIndex:1}],participants:[{id:'a',isHost:true,connected:true,role:'player'},{id:'b',isHost:false,connected:true,role:'player'}]};
 const value={record:{sessionId:'session',room,revision:1,recovery:{room:JSON.parse(JSON.stringify(room)),tokens:[{participantId:'b',token:'b'.repeat(64)}]}},steps:[{}],receipts:[]};
 const after=bundle(value,{id:'x',target:'b',sourceToken:'a'.repeat(64)});assert.equal(value.record.room.ownerId,'a');assert.equal(after.record.room.ownerId,'b');assert.deepEqual(after.record.room.seats,room.seats);assert.deepEqual(after.record.recovery.tokens,[{participantId:'a',token:'a'.repeat(64)}]);
 assert.throws(()=>bundle(value,{id:'x',target:'missing',sourceToken:'a'.repeat(64)}));
});
test('authority handoff drains in-flight durable commits, blocks new commands and preserves lost-ACK receipts across epochs',async()=>{
 const session=new Session(E,'handoff-fixture',{players:[{name:'A'},{name:'B'}]}),entries=[];let release;const gate=new Promise(r=>release=r);
 const authority=new Authority(session,{sessionId:'session',persistence:{commit:async entry=>{await gate;entries.push(entry);},recordReceipt:async()=>{}}}),client=authority.connect(0);
 const command=P.command(client.snapshot(),{type:'tick'},'lost-ack'),pending=client.dispatch(command);let drained=false;const transfer=authority.suspendForTransfer().then(thaw=>{drained=true;return thaw;});
 await Promise.resolve();assert.equal(drained,false);release();await pending;const thaw=await transfer;assert.equal(authority.revision,1);
 assert.equal((await authority.connect(1).dispatch(P.command(authority.connect(1).snapshot(),{type:'tick'},'blocked'))).code,'PAUSED');
 const restored=new Authority(Session.restore(E,session.export()),{sessionId:'session',authorityEpoch:'new',persistence:{commit:async()=>assert.fail('duplicate commit'),recordReceipt:async()=>{}},restoredReceipts:entries.map(x=>({viewer:x.viewer,commandId:x.commandId,signature:x.signature,receipt:x.receipt}))});
 assert.equal((await restored.connect(0).dispatch(command)).duplicate,true);assert.equal(restored.revision,1);assert(!JSON.stringify(restored.connect(1).snapshot()).includes('HOST-ONLY'));
 thaw();authority.dispose();restored.dispose();
});

test('lobby handoff preserves settings, resets readiness and replaces only host credentials',()=>{
 const R=require('../application/rooms.js').RoomService;let i=0;const rooms=new R({idFactory:()=>String(++i),clock:()=>100,random:()=>0.1,tokenFactory:()=>String(++i).padStart(64,'0')});
 const room=rooms.create({name:'Комната',game:{id:'domino',name:'Домино',version:'test'},host:{id:'a',nickname:'A'},transportMode:'network',constraints:{min:2,max:4}}),joined=rooms.join(room.id,{nickname:'B'}),target=joined.participantId;
 rooms.claimSeat(room.id,target,'seat-2');rooms.setAutoStart(room.id,'a',true);const thaw=rooms.freezeLobbyTransfer(room.id,'a');assert.throws(()=>rooms.setAutoStart(room.id,'a',false),/HOST_TRANSFER_BUSY/);assert.throws(()=>rooms.setReady(room.id,target,true),/HOST_TRANSFER_BUSY/);
 const exported=rooms.exportRecovery(room.id,{lobby:true}),next=lobbyBundle(exported,{id:'transfer',target,sourceToken:'a'.repeat(64)}),other=new R({idFactory:()=>String(++i),clock:()=>100,random:()=>0.1,tokenFactory:()=>String(++i).padStart(64,'0')});
 const restored=other.restoreRecovery(next.recovery,{hostId:target,lobby:true});assert.equal(restored.ownerId,target);assert.equal(restored.autoStart,true);assert.deepEqual(restored.seats,room.seats.map(s=>({...s,...(s.id==='seat-2'?{participantId:target}:{})})));assert(restored.participants.every(p=>!p.ready));assert.deepEqual(next.recovery.tokens,[{participantId:'a',token:'a'.repeat(64)}]);assert.equal(exported.room.ownerId,'a');assert.throws(()=>lobbyBundle({...exported,room:{...exported.room,phase:'playing'}},{id:'bad',target,sourceToken:'a'.repeat(64)}));thaw();rooms.setAutoStart(room.id,'a',false);
});


test('lobby handoff accepts a connected spectator without moving seats',()=>{
 const R=require('../application/rooms.js').RoomService;let i=0;const rooms=new R({idFactory:()=>String(++i),clock:()=>100,random:()=>0.1,tokenFactory:()=>String(++i).padStart(64,'0')});
 const room=rooms.create({name:'Комната',game:{id:'domino',name:'Домино',version:'test'},host:{id:'a',nickname:'A'},transportMode:'network',constraints:{min:2,max:4}}),target=rooms.join(room.id,{nickname:'B'}).participantId;
 const exported=rooms.exportRecovery(room.id,{lobby:true}),next=lobbyBundle(exported,{id:'transfer',target,sourceToken:'a'.repeat(64)});
 assert.equal(next.recovery.room.ownerId,target);assert.equal(next.recovery.room.hostMode,'table');assert.deepEqual(next.recovery.room.seats,exported.room.seats);assert.equal(next.recovery.room.participants.find(p=>p.id===target).role,'spectator');
});


for(const role of ['spectator','table'])test('running game handoff keeps '+role+' outside player seats',()=>{
 const room={id:'room',phase:'playing',ownerId:'a',revision:4,lobbyRevision:1,seats:[{index:0,participantId:'a',playerIndex:0},{index:1,participantId:'b',playerIndex:1}],participants:[{id:'a',isHost:true,connected:true,role:'player'},{id:'b',isHost:false,connected:true,role:'player'},{id:'c',isHost:false,connected:true,role}]};
 const raw={record:{sessionId:'session',room,revision:1,recovery:{room:JSON.parse(JSON.stringify(room)),tokens:[{participantId:'b',token:'b'.repeat(64)},{participantId:'c',token:'c'.repeat(64)}]}},steps:[{}]};
 const next=bundle(raw,{id:'transfer',target:'c',sourceToken:'a'.repeat(64)});
 assert.equal(next.record.room.ownerId,'c');assert.equal(next.record.room.hostMode,'table');assert.deepEqual(next.record.room.seats,room.seats);assert.equal(next.record.room.participants.find(p=>p.id==='c').role,role);assert(!next.record.recovery.tokens.some(t=>t.participantId==='c'));
});
