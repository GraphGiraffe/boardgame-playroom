'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RoomService}=require('../app/multiplayer.js');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
E.register({id:'host-recovery-fixture',name:'Host recovery fixture',min:2,max:2,presets:[{id:'basic'}],
  create(state){state.data={count:0,secret:'PRIVATE-HAND-FIXTURE'};},
  legal(){return [{type:'advance',label:'Advance'}];},
  apply(state,actor){state.data.count++;E.event(state,'step '+actor,actor,'action');state.turn=1-actor;},
  project(projected){delete projected.data.secret;}});
function playingRoom(){
  let counter=0,tick=1000,token=0;
  const rooms=new RoomService({idFactory:()=>String(++counter),clock:()=>tick,random:()=>0.3333,
    tokenFactory:()=>String(++token).padStart(64,'0')});
  const room=rooms.create({name:'Replay fixture',game:{id:'host-recovery-fixture',name:'Fixture',version:'0.1.0'},
    host:{id:'host',nickname:'A'},constraints:{min:2,max:2}}),guestConnection=rooms.connection(room.id);
  const joined=guestConnection.dispatch({type:'join',nickname:'B'}),guest=joined.snapshot.participantId;
  guestConnection.dispatch({type:'claim-seat',seatId:'seat-2'});
  rooms.setReady(room.id,guest,true);rooms.setReady(room.id,'host',true);
  rooms.beginCountdown(room.id,'host',{seconds:3});tick=5000;rooms.tick(room.id);
  return {rooms,room:rooms.snapshot(room.id),joined,guest,guestConnection};
}
test('host reload restores the same room and seat, without exposing resume tokens in snapshots',async()=>{
  const live=playingRoom(),archive=live.rooms.exportRecovery(live.room.id);
  assert.equal(archive.room.phase,'playing');
  assert.equal(archive.tokens.length,1);assert.equal(archive.tokens[0].participantId,live.guest);
  assert(!JSON.stringify(live.rooms.snapshot(live.room.id)).includes(live.joined.resumeToken));
  const newHost=new RoomService({tokenFactory:()=> 'a'.repeat(64)});
  assert.throws(()=>newHost.restoreRecovery(archive,{hostId:'other'}),/комната|владелец|хост/i);
  const revived=newHost.restoreRecovery(archive,{hostId:'host'});
  assert.equal(revived.phase,'playing');
  assert.equal(revived.participants.find(p=>p.id===live.guest).connected,false);
  assert.equal(revived.seats[1].participantId,live.guest);
  assert(!JSON.stringify(revived).includes(live.joined.resumeToken));
  assert.throws(()=>newHost.restoreRecovery(archive,{hostId:'host'}),/занята/i);
  let rotations=0;
  newHost.setResumeDurability(archive.room.id,async ({participantId,previousToken,nextToken})=>{
    rotations++;assert.equal(participantId,live.guest);assert.equal(previousToken,live.joined.resumeToken);
    assert.equal(nextToken,'a'.repeat(64));
  });
  await assert.rejects(newHost.connection(archive.room.id).dispatch({type:'resume',participantId:live.guest,resumeToken:'b'.repeat(64)}),/недействительно/i);
  const connection=newHost.connection(archive.room.id);
  const accepted=await connection.dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken});
  assert.equal(accepted.resumed,true);assert.equal(rotations,1);
  assert.equal(accepted.snapshot.participantId,live.guest);
  assert.equal(accepted.snapshot.room.seats[1].participantId,live.guest);
  assert.equal(accepted.resumeToken,'a'.repeat(64));
  assert(!JSON.stringify(accepted.snapshot).includes(accepted.resumeToken));
});
test('failed durable token rotation keeps the old resume capability and seat available',async()=>{
  const live=playingRoom(),recovered=new RoomService();
  recovered.restoreRecovery(live.rooms.exportRecovery(live.room.id),{hostId:'host'});
  recovered.setResumeDurability(live.room.id,async()=>{throw Error('QuotaExceededError');});
  const connection=recovered.connection(live.room.id);
  await assert.rejects(connection.dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken}),/QuotaExceededError/);
  assert.equal(connection.participantId,null);
  assert.equal(recovered.exportRecovery(live.room.id).tokens[0].token,live.joined.resumeToken);
  assert.equal(recovered.snapshot(live.room.id).participants.find(p=>p.id===live.guest).connected,false);
});
test('concurrent resume attempts cannot rotate a room token twice',async()=>{
  const live=playingRoom(),restored=new RoomService({tokenFactory:()=> 'f'.repeat(64)});
  restored.restoreRecovery(live.rooms.exportRecovery(live.room.id),{hostId:'host'});
  let release;const gate=new Promise(resolve=>release=resolve);let calls=0;
  restored.setResumeDurability(live.room.id,async()=>{calls++;await gate;});
  const first=restored.connection(live.room.id),second=restored.connection(live.room.id);
  const pending=first.dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken});
  await assert.rejects(second.dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken}),/обрабатывается/i);
  release();assert.equal((await pending).resumed,true);assert.equal(calls,1);
});
test('stored command receipts resolve lost acknowledgments across a new authority epoch without replay',async()=>{
  const session=new Session(E,'host-recovery-fixture',{players:[{name:'A'},{name:'B'}]});
  const old=new Authority(session,{sessionId:'stable-session',authorityEpoch:'epoch-before',persistence:{
    commit:async()=>{},recordReceipt:async()=>{}}});
  const original=old.connect(0),command=P.command(original.snapshot(),{type:'advance'},'action-1');
  const receipt=await original.dispatch(command);
  assert.equal(receipt.ok,true);assert.equal(session.current.move,1);
  const revivedSession=Session.restore(E,session.export());old.dispose();
  const replayed=new Authority(revivedSession,{sessionId:'stable-session',authorityEpoch:'epoch-after',
    restoredReceipts:[{viewer:0,commandId:'action-1',signature:P.canonical(command),receipt:{ok:true,code:'OK',commandId:'action-1',revision:1}}],
    persistence:{commit:async()=>{},recordReceipt:async()=>{}}});
  try{
    const revivedViewer=replayed.connect(0),duplicate=await revivedViewer.dispatch(command);
    assert.equal(duplicate.duplicate,true);assert.equal(duplicate.ok,true);
    assert.equal(duplicate.snapshot.revision,1);
    assert.equal(revivedSession.current.move,1);
    const stale={...command,commandId:'new-from-old-epoch'};
    assert.equal((await revivedViewer.dispatch(stale)).code,'WRONG_EPOCH');
    assert.equal((await revivedViewer.dispatch({...command,action:{type:'other'}})).code,'ID_CONFLICT');
    assert.equal(revivedSession.current.move,1);
    const current=replayed.connect(1);
    assert.equal((await current.dispatch(P.command(current.snapshot(),{type:'advance'},'new-epoch'))).ok,true);
    assert.equal(revivedSession.current.move,2);
    assert(!JSON.stringify(replayed.connect(-1).snapshot()).includes('PRIVATE-HAND-FIXTURE'));
  }finally{replayed.dispose();}
});
test('lost resume ACK can recover using the previous token for 2 minutes, but not take an active lease',async()=>{
  let clock=5000,tokenCounter=80;
  const live=playingRoom(),first=new RoomService({clock:()=>clock,tokenFactory:()=>String(++tokenCounter).padStart(64,'0')});
  first.restoreRecovery(live.rooms.exportRecovery(live.room.id),{hostId:'host'});
  let recorded;
  first.setResumeDurability(live.room.id,async data=>recorded=data);
  const a=first.connection(live.room.id),done=await a.dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken});
  assert.equal(done.resumed,true);assert.equal(recorded.previousExpiresAt,125000);
  const b=first.connection(live.room.id);
  await assert.rejects(b.dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken}),/недействительно/i);
  a.close();
  const second=new RoomService({clock:()=>clock,tokenFactory:()=>String(++tokenCounter).padStart(64,'0')});
  second.restoreRecovery(first.exportRecovery(live.room.id),{hostId:'host'});
  let calls=0;second.setResumeDurability(live.room.id,async()=>{calls++;});
  const fallback=await second.connection(live.room.id).dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken});
  assert.equal(fallback.resumed,true);assert.equal(fallback.resumeToken,done.resumeToken);
  assert.equal(calls,0,'no second rotation for retried lost ACK');
  second.setConnected(live.room.id,live.guest,false);
  clock=126000;
  await assert.rejects(second.connection(live.room.id).dispatch({type:'resume',participantId:live.guest,resumeToken:live.joined.resumeToken}),/недействительно/i);
});
