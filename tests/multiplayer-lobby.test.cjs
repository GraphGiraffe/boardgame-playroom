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


test('room preview exposes join information without participant details',()=>{
  const {rooms,room}=createRoom('table');
  const preview=rooms.preview(room.id);
  assert.match(preview.code,/^\d{4}$/);
  assert.equal(preview.name,'Вечерняя партия');
  assert.equal(preview.game.name,'UNO');
  assert.equal(preview.hostMode,'table');
  assert.equal(preview.rules.presetLabel,'Классика');
  assert.equal(Object.hasOwn(preview,'participants'),false);
  assert.equal(Object.hasOwn(preview,'ownerId'),false);
});

test('same-profile browser tabs are distinct participants without host authority',()=>{
  const {rooms,room}=createRoom('player'),firstLink=rooms.connection(room.id),secondLink=rooms.connection(room.id);
  const first=firstLink.dispatch({type:'join',profileId:'host',nickname:'Вкладка 2'}).snapshot;
  const second=secondLink.dispatch({type:'join',profileId:'host',nickname:'Вкладка 3'}).snapshot;
  assert.equal(first.kind,'lobby');assert.equal(second.kind,'lobby');
  assert.notEqual(first.participantId,'host');assert.notEqual(second.participantId,'host');
  assert.notEqual(first.participantId,second.participantId);
  assert.equal(rooms.snapshot(room.id).participants.filter(p=>p.isHost).length,1);
  assert.equal(rooms.snapshot(room.id).participants.length,3);
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===first.participantId).role,'spectator');
  assert.throws(()=>rooms.join(room.id,{id:'host',nickname:'Подмена'}),/занят/i);
  firstLink.close();
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===first.participantId).connected,false);
  assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id===second.participantId).connected,true);
});
test('room options show the pack labels instead of technical option IDs',()=>{
  const {describeRules}=require('../app/multiplayer.js');
  const rules={preset:'classic',presetLabel:'Классический',openHands:false,options:{unoMode:'manual'}};
  const settings=[{key:'unoMode',label:'Объявление UNO',options:[{value:'manual',label:'Вручную · можно ошибаться'}]}];
  assert.deepEqual(describeRules(rules,settings,true),[
    {label:'Набор правил',value:'Классический'},
    {label:'Объявление UNO',value:'Вручную · можно ошибаться'},
    {label:'Открытые руки',value:'Нет'}
  ]);
  assert.deepEqual(describeRules({...rules,options:{choice:2}},[{key:'choice',label:'Очки',options:[{value:2,label:'Два'}]}],false)[1],{label:'Очки',value:'Два'});
});

test('finished host returns the SAME room and peer seats to lobby without a new pairing',()=>{
  const {rooms,room}=createRoom();
  const joined=rooms.join(room.id,{id:'guest',nickname:'Маша'});
  rooms.claimSeat(room.id,'guest','seat-2');
  rooms.setReady(room.id,'host',true);rooms.setReady(room.id,'guest',true);
  rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>2500;rooms.tick(room.id);
  // In production network-ui checks the authority's finished status before
  // invoking this host-only transition.
  const oldToken=joined.resumeToken;
  const next=rooms.returnToLobby(room.id,'host');
  assert.equal(next.phase,'lobby');
  assert.equal(next.id,room.id);
  assert.equal(next.code,room.code);
  assert.equal(next.seats[1].participantId,'guest');
  assert.equal(next.participants.find(p=>p.id==='guest').ready,false);
  assert.throws(()=>rooms.returnToLobby(room.id,'guest'),/только хосту/i);
  assert.equal(rooms.canStart(room.id),false);
  const connection=rooms.connection(room.id);
  rooms.setConnected(room.id,'guest',false);
  const resumed=connection.dispatch({type:'resume',participantId:'guest',resumeToken:oldToken});
  assert.equal(resumed.resumed,true);
  assert.equal(resumed.snapshot.participantId,'guest');
});

test('host can change network pack inside lobby while preserving members and clearing readiness',()=>{
  const {rooms,room}=createRoom();
  rooms.join(room.id,{id:'guest',nickname:'Маша'});
  rooms.claimSeat(room.id,'guest','seat-2');
  rooms.setReady(room.id,'host',true);rooms.setReady(room.id,'guest',true);
  const updated=rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'0.1.0'},
    rules:{preset:'basic',presetLabel:'Классика'},constraints:{min:2,max:2}});
  assert.equal(updated.game.id,'checkers');
  assert.equal(updated.code,room.code);
  assert.equal(updated.seats.length,2);
  assert.equal(updated.seats[1].participantId,'guest');
  assert.equal(updated.participants.find(p=>p.id==='guest').ready,false);
  assert.equal(updated.events.at(-1).type,'game-changed');
  assert.throws(()=>rooms.changeGame(room.id,'guest',{game:{id:'uno',name:'UNO',version:'0.2.1'},constraints:{min:2,max:4}}),/хосту/i);
  assert.throws(()=>rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'0.1.0'},constraints:{min:2,max:1}}),/ограничения/i);
});

test('host cannot silently drop an occupied seat when choosing a smaller pack',()=>{
  const {rooms,room}=createRoom();
  rooms.join(room.id,{id:'guest',nickname:'Маша'});
  rooms.claimSeat(room.id,'guest','seat-4');
  const original=rooms.snapshot(room.id);
  assert.throws(()=>rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'0.1.0'},
    constraints:{min:2,max:2}}),/меньше мест/i);
  const after=rooms.snapshot(room.id);
  assert.equal(after.game.id,original.game.id);
  assert.equal(after.seats[3].participantId,'guest');
});
