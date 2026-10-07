const test=require('node:test');
const assert=require('node:assert/strict');
const {ProfileStore,RoomService}=require('../app/multiplayer.js');

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};
}
function service(){
  let n=0,time=1000;
  return new RoomService({idFactory:()=>`id-${++n}`,clock:()=>time,random:()=>0.1234});
}
function createRoom(hostMode='player'){
  const rooms=service();
  const room=rooms.create({name:'Вечерняя партия',game:{id:'uno',name:'UNO',version:'0.2.0'},host:{id:'host',nickname:'Иван'},hostMode,rules:{preset:'classic',presetLabel:'Классика'},constraints:{min:2,max:4}});
  return {rooms,room};
}

test('profile keeps stable id while player name changes',()=>{
  const storage=memoryStorage(),profiles=new ProfileStore(()=>storage);
  assert.equal(profiles.load(),null);
  const first=profiles.save(' Иван ');
  const second=profiles.save('Иван П.');
  assert.equal(first.id,second.id);
  assert.equal(second.name,'Иван П.');
});

test('host player occupies a seat while table host does not',()=>{
  const player=createRoom('player').room,table=createRoom('table').room;
  assert.equal(player.participants[0].role,'player');
  assert.equal(player.seats[0].participantId,'host');
  assert.equal(table.participants[0].role,'table');
  assert.equal(table.seats.every(seat=>seat.participantId===null),true);
});

test('joining participant starts as spectator and may claim any free color slot',()=>{
  const {rooms,room}=createRoom();
  const joined=rooms.join(room.id,{id:'guest',nickname:'Маша'}).room;
  assert.equal(joined.participants.find(p=>p.id==='guest').role,'spectator');
  const after=rooms.claimSeat(room.id,'guest','seat-3');
  assert.equal(after.seats[2].participantId,'guest');
  assert.equal(after.participants.find(p=>p.id==='guest').role,'player');
});

test('ready player cannot rename, move seat, or become spectator',()=>{
  const {rooms,room}=createRoom();
  rooms.join(room.id,{id:'guest',nickname:'Маша'});
  rooms.claimSeat(room.id,'guest','seat-2');
  rooms.setReady(room.id,'guest',true);
  assert.throws(()=>rooms.rename(room.id,'guest','Новый ник'),/снимите готовность/i);
  assert.throws(()=>rooms.claimSeat(room.id,'guest','seat-3'),/снимите готовность/i);
  assert.throws(()=>rooms.becomeSpectator(room.id,'guest'),/снимите готовность/i);
});

test('spectator frees a seat so another participant can take it',()=>{
  const {rooms,room}=createRoom();
  rooms.join(room.id,{id:'a',nickname:'Аня'});rooms.claimSeat(room.id,'a','seat-2');
  rooms.join(room.id,{id:'b',nickname:'Борис'});
  rooms.becomeSpectator(room.id,'a');
  const snapshot=rooms.claimSeat(room.id,'b','seat-2');
  assert.equal(snapshot.seats[1].participantId,'b');
  assert.equal(snapshot.participants.find(p=>p.id==='a').role,'spectator');
});

test('host rule change clears readiness and emits visible notification',()=>{
  const {rooms,room}=createRoom();
  rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-2');
  rooms.setReady(room.id,'host',true);rooms.setReady(room.id,'guest',true);
  const changed=rooms.updateRules(room.id,'host',{preset:'fast',presetLabel:'Быстрая'});
  assert.equal(changed.participants.filter(p=>p.role==='player').every(p=>!p.ready),true);
  assert.equal(changed.rulesRevision,2);
  assert.equal(changed.events.at(-1).type,'rules-changed');
});

test('only host can kick and kicked player releases seat',()=>{
  const {rooms,room}=createRoom();
  rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-2');
  assert.throws(()=>rooms.kick(room.id,'guest','host'),/только хосту/i);
  const kicked=rooms.kick(room.id,'host','guest');
  assert.equal(kicked.participants.some(p=>p.id==='guest'),false);
  assert.equal(kicked.seats[1].participantId,null);
});

test('game cannot start until valid player count is connected and ready',()=>{
  const {rooms,room}=createRoom();
  assert.equal(rooms.canStart(room.id),false);
  rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-2');
  rooms.setReady(room.id,'host',true);
  assert.equal(rooms.canStart(room.id),false);
  rooms.setReady(room.id,'guest',true);
  assert.equal(rooms.canStart(room.id),true);
});

test('three second countdown freezes lobby and transitions to playing',()=>{
  let time=1000,n=0;
  const rooms=new RoomService({idFactory:()=>`id-${++n}`,clock:()=>time,random:()=>0.7777});
  const room=rooms.create({name:'Тест',game:{id:'uno',name:'UNO'},host:{id:'host',nickname:'Иван'},constraints:{min:2,max:4}});
  rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-2');
  rooms.setReady(room.id,'host',true);rooms.setReady(room.id,'guest',true);
  let started=rooms.beginCountdown(room.id,'host');
  assert.equal(started.phase,'starting');
  assert.throws(()=>rooms.rename(room.id,'guest','Мария'),/уже нельзя менять/i);
  time=2500;assert.equal(rooms.tick(room.id).remaining,2);
  time=4000;const done=rooms.tick(room.id);
  assert.equal(done.started,true);assert.equal(done.room.phase,'playing');
});
