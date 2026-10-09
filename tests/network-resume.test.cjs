'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RoomService,ResumeStore}=require('../app/multiplayer.js');
function setup(){
  let index=0,issued=0,clock=100000;
  const rooms=new RoomService({idFactory:()=>String(++index),clock:()=>clock,
    random:()=>0.1234,tokenFactory:()=>String(++issued).padStart(64,'0')});
  const room=rooms.create({name:'Сетевая партия',game:{id:'uno',name:'UNO'},
    host:{id:'host',name:'Хост'},constraints:{min:2,max:4},rules:{}});
  return {rooms,room,advance:ms=>{clock+=ms;}};
}
test('resume returns to same participant, seat and readiness and rotates the secret',()=>{
  const {rooms,room}=setup(),initial=rooms.connection(room.id);
  const joined=initial.dispatch({type:'join',nickname:'Нина',profileId:'host'});
  const participantId=joined.snapshot.participantId,token=joined.resumeToken;
  assert.match(token,/^[0-9a-f]{64}$/);
  assert.notEqual(participantId,'host','browser profile ID is not room authority');
  initial.dispatch({type:'claim-seat',seatId:'seat-2'});
  initial.dispatch({type:'ready',ready:true});
  assert.equal(JSON.stringify(rooms.snapshot(room.id)).includes(token),false);
  assert.equal(JSON.stringify(rooms.preview(room.id)).includes(token),false);
  initial.close();
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===participantId).connected,false);
  const resumedConnection=rooms.connection(room.id);
  const resumed=resumedConnection.dispatch({type:'resume',participantId,resumeToken:token});
  assert.equal(resumed.ok,true);
  assert.equal(resumed.resumed,true);
  assert.equal(resumed.snapshot.participantId,participantId);
  assert.notEqual(resumed.resumeToken,token);
  const member=rooms.snapshot(room.id).participants.find(p=>p.id===participantId);
  assert.equal(member.seatId,'seat-2');assert.equal(member.ready,true);assert.equal(member.connected,true);
  assert.equal(rooms.snapshot(room.id).participants.length,2);
  assert.throws(()=>rooms.connection(room.id).dispatch({type:'resume',participantId,resumeToken:token}),/недействительно/i);
  assert.throws(()=>initial.dispatch({type:'ready',ready:false}),/заменено/i);
  initial.close();
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===participantId).connected,true);
  resumedConnection.close();
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===participantId).connected,false);
});

test('room resume is available during playing and cannot impersonate host',()=>{
  const {rooms,room,advance}=setup(),initial=rooms.connection(room.id);
  const joined=initial.dispatch({type:'join',nickname:'Маша'});
  const participantId=joined.snapshot.participantId,token=joined.resumeToken;
  initial.dispatch({type:'claim-seat',seatId:'seat-2'});
  initial.dispatch({type:'ready',ready:true});
  rooms.setReady(room.id,'host',true);
  rooms.beginCountdown(room.id,'host',{seconds:3});
  advance(4000);rooms.tick(room.id);
  assert.equal(rooms.snapshot(room.id).phase,'playing');
  initial.close();
  assert.throws(()=>rooms.connection(room.id).dispatch({type:'resume',participantId:'host',resumeToken:token}),/хост/i);
  assert.throws(()=>rooms.connection(room.id).dispatch({type:'resume',participantId,resumeToken:'f'.repeat(64)}),/недействительно/i);
  const resumed=rooms.connection(room.id).dispatch({type:'resume',participantId,resumeToken:token});
  assert.equal(resumed.snapshot.room.phase,'playing');
  assert.equal(resumed.snapshot.participantId,participantId);
  assert.equal(resumed.snapshot.room.seats[1].participantId,participantId);
});

test('replacing active participant lease revokes stale connection, without allowing profile takeover',()=>{
  const {rooms,room}=setup(),original=rooms.connection(room.id);
  const joined=original.dispatch({type:'join',nickname:'Игрок'});
  const participantId=joined.snapshot.participantId;
  const next=rooms.connection(room.id).dispatch({type:'resume',participantId,resumeToken:joined.resumeToken});
  assert.equal(next.resumed,true);
  assert.throws(()=>original.dispatch({type:'ready',ready:true}),/заменено/i);
  original.close();
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===participantId).connected,true);
});

test('local resume ticket storage keeps secrets out of profile and can be restored after reload',()=>{
  const values=new Map(),storage={
    getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)
  };
  const ticket='a'.repeat(64),next='b'.repeat(64),store=new ResumeStore(()=>storage);
  assert.equal(store.load('room1'),null);
  assert.equal(store.save('room1','participant1',ticket),true);
  assert.deepEqual(new ResumeStore(()=>storage).load('room1'),
    {version:1,roomId:'room1',participantId:'participant1',token:ticket});
  assert.equal(store.save('room1','participant1',next),true);
  assert.equal(new ResumeStore(()=>storage).load('room1').token,next);
  assert.equal(store.load('room2'),null);
  assert.throws(()=>store.save('room1','participant1','short'),/подключения/i);
  store.remove('room1');
  assert.equal(new ResumeStore(()=>storage).load('room1'),null);
});
