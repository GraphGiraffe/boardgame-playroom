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

test('smaller pack compacts overflow and preserves participant identity',()=>{
  const {rooms,room}=createRoom();rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-4');
  rooms.configure(room.id,'host',{firstPlayerMode:'assigned',firstParticipantId:'guest'});
  const after=rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'0.1.0'},constraints:{min:2,max:2}});
  assert.equal(after.seats[0].participantId,'host');assert.equal(after.seats[1].participantId,'guest');
  assert.equal(after.participants.find(p=>p.id==='guest').seatId,'seat-2');assert.equal(after.firstParticipantId,'guest');
});
test('smaller pack rejects excess occupants atomically',()=>{
  const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});rooms.setLocalSeat(room.id,'host','seat-4',{kind:'bot'});
  const before=rooms.snapshot(room.id);assert.throws(()=>rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'0.1.0'},constraints:{min:2,max:2}}),/меньше мест/);assert.deepEqual(rooms.snapshot(room.id),before);
});
test('shuffle resolves once and rules notices clear on readiness and a new match',()=>{
 const {rooms,room}=createRoom();rooms.configure(room.id,'host',{transportMode:'hotseat',seatOrder:'random'});rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});
 rooms.updateRules(room.id,'host',{preset:'classic'});assert.equal(rooms.snapshot(room.id).participants[0].rulesNotice,true);
 rooms.setReady(room.id,'host',true);assert.equal(rooms.snapshot(room.id).participants[0].rulesNotice,undefined);
 const first=rooms.prepareStart(room.id,'host');assert.deepEqual(rooms.prepareStart(room.id,'host').seats,first.seats);
 rooms.startHotSeat(room.id,'host');const next=rooms.returnToLobby(room.id,'host');assert.equal(next.startOrderResolved,undefined);
});

test('common slots mix local humans and bots, preserve identities when swapped, and retain first actor',()=>{const {rooms,room}=createRoom();rooms.configure(room.id,'host',{transportMode:'hotseat'});let state=rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Мика'});const bot=state.seats[1].participantId;rooms.configure(room.id,'host',{firstPlayerMode:'assigned',firstParticipantId:bot});state=rooms.moveParticipant(room.id,'host',bot,'seat-1');assert.equal(state.seats[0].participantId,bot);assert.equal(state.seats[1].participantId,'host');assert.equal(state.firstParticipantId,bot);assert.equal(rooms.canStart(room.id),true);rooms.startHotSeat(room.id,'host');assert.throws(()=>rooms.moveParticipant(room.id,'host',bot,'seat-2'));});
test('network bots need no guest resume credentials and are restored as connected',()=>{const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Бот'});rooms.setReady(room.id,'host',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.rooms.get(room.id).countdownEndsAt=0;rooms.tick(room.id);const recovery=rooms.exportRecovery(room.id);assert.equal(recovery.tokens.length,0);const next=service();const restored=next.restoreRecovery(recovery,{hostId:'host'});assert.equal(restored.participants.find(p=>p.bot).connected,true);});

test('host can move to spectators and reclaim a slot without creating another participant',()=>{
 const {rooms,room}=createRoom();
 let state=rooms.moveParticipant(room.id,'host','host',null);
 assert.equal(state.participants.find(p=>p.id==='host').role,'spectator');
 state=rooms.claimSeat(room.id,'host','seat-2');
 assert.equal(state.participants.length,1);assert.equal(state.seats[1].participantId,'host');
 assert.equal(state.participants[0].nickname,room.participants[0].nickname);
 rooms.setLocalSeat(room.id,'host','seat-1',{kind:'closed'});
 assert.throws(()=>rooms.claimSeat(room.id,'host','seat-1'),/закрыто/);
 rooms.setLocalSeat(room.id,'host','seat-1',{kind:'empty'});
 state=rooms.claimSeat(room.id,'host','seat-1');assert.equal(state.participants.length,1);
});

test('single table slot accepts any network participant and drag swaps preserve identity',()=>{
 const {rooms,room}=createRoom();rooms.join(room.id,{id:'guest',nickname:'Мария'});rooms.claimSeat(room.id,'guest','seat-2');
 let state=rooms.claimTable(room.id,'guest');assert.equal(state.seats[1].participantId,null);assert.equal(state.participants.find(p=>p.id==='guest').role,'table');assert.throws(()=>rooms.claimTable(room.id,'host'),/занят/);
 state=rooms.moveParticipant(room.id,'host','host','table');assert.equal(state.seats[0].participantId,'guest');assert.equal(state.participants.find(p=>p.id==='host').role,'table');assert.equal(state.participants.length,2);
 state=rooms.claimSeat(room.id,'host','seat-2');assert.equal(state.participants.filter(p=>p.role==='table').length,0);assert.equal(state.hostMode,'player');
 const connection=rooms.connection(room.id);const joined=connection.dispatch({type:'join',id:'remote',nickname:'Тео'});const table=connection.dispatch({type:'claim-table'});assert.equal(table.snapshot.room.participants.find(p=>p.id===joined.snapshot.participantId).role,'table');
 rooms.claimSeat(room.id,joined.snapshot.participantId,'seat-3');rooms.becomeSpectator(room.id,'host');state=rooms.configure(room.id,'host',{transportMode:'hotseat'});assert.equal(state.participants.find(p=>p.id==='host').role,'player');assert.throws(()=>rooms.claimTable(room.id,'host'),/сетевой игре/);
});

test('local seat rename and cold lobby restore preserve identities, positions, options and bot readiness',()=>{
  const {rooms,room}=createRoom();rooms.configure(room.id,'host',{transportMode:'hotseat',firstPlayerMode:'assigned',firstParticipantId:'host'});
  rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Мика'});
  rooms.setLocalSeat(room.id,'host','seat-4',{kind:'human',nickname:'Анна'});
  const old=rooms.snapshot(room.id),bot=old.seats[1].participantId;
  rooms.renameLocalSeat(room.id,'host','seat-2','Кира');rooms.renameLocalSeat(room.id,'host','seat-1','Иван новый');
  let state=rooms.snapshot(room.id);
  assert.equal(state.seats[1].participantId,bot);assert.equal(state.participants.find(p=>p.id===bot).ready,true);
  assert.equal(state.participants.find(p=>p.id==='host').nickname,'Иван новый');assert.equal(state.firstParticipantId,'host');
  assert.throws(()=>rooms.renameLocalSeat(room.id,bot,'seat-1','Подмена'),/хост/);
  rooms.moveParticipant(room.id,'host','host','seat-4');state=rooms.snapshot(room.id);
  const restored=service().restoreHotSeatLobby(state,{hostId:'host'});
  assert.deepEqual(restored.seats,state.seats);assert.deepEqual(restored.rules,state.rules);assert.equal(restored.firstParticipantId,state.firstParticipantId);
  assert.deepEqual(restored.participants.map(p=>[p.id,p.nickname,p.bot,p.seatId]),state.participants.map(p=>[p.id,p.nickname,p.bot,p.seatId]));
  assert.equal(restored.participants.every(p=>p.ready===!!p.bot),true);
  assert.throws(()=>service().restoreHotSeatLobby(state,{hostId:'other'}),/локального лобби/);
});

test('recovery lobby reserves stable seats, drops old observers and requires explicit replacement consent',()=>{
  const {rooms,room}=createRoom();
  rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Мика'});
  const oldGuest=rooms.join(room.id,{id:'previous',nickname:'Мария'});rooms.claimSeat(room.id,'previous','seat-4');
  rooms.join(room.id,{id:'old-watcher',nickname:'Зритель'});rooms.join(room.id,{id:'old-table',nickname:'Стол'});rooms.claimTable(room.id,'old-table');
  rooms.setReady(room.id,'host',true);rooms.setReady(room.id,'previous',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>3000;rooms.tick(room.id);
  const next=service(),restored=next.restoreRecovery(rooms.exportRecovery(room.id),{hostId:'host',collect:true,sessionId:'session-stable',revision:12});
  assert.equal(restored.phase,'lobby');assert.deepEqual(restored.recovery,{sessionId:'session-stable',revision:12});
  assert.deepEqual(restored.seats.filter(s=>Number.isInteger(s.playerIndex)).map(s=>[s.id,s.playerIndex]),[['seat-1',0],['seat-2',1],['seat-4',2]]);
  assert.equal(restored.participants.some(p=>['old-watcher','old-table'].includes(p.id)),false);
  assert.equal(restored.seats[2].closed,true);assert.equal(next.canStart(room.id),false);
  for(const change of [()=>next.updateRules(room.id,'host',{}),()=>next.configure(room.id,'host',{firstPlayerMode:'random'}),()=>next.moveParticipant(room.id,'host','previous','seat-1'),()=>next.becomeSpectator(room.id,'previous'),()=>next.claimTable(room.id,'previous')])assert.throws(change,/сохраня|замен|освобождает/);
  const oldLink=next.connection(room.id);const resumed=oldLink.dispatch({type:'resume',participantId:'previous',resumeToken:oldGuest.resumeToken});assert.equal(resumed.resumed,true);
  next.kick(room.id,'host','previous');
  assert.throws(()=>next.connection(room.id).dispatch({type:'resume',participantId:'previous',resumeToken:resumed.resumeToken}),/Участник|недействитель|переподключ/i);
  assert.throws(()=>oldLink.dispatch({type:'ready',ready:true}),/подключ|Участник|исключ/i);
  next.join(room.id,{id:'replacement',nickname:'Олег'});
  assert.throws(()=>next.claimSeat(room.id,'replacement','seat-3'),/закрыто/);
  let changed=next.claimSeat(room.id,'replacement','seat-4');
  assert.equal(changed.seats[3].playerIndex,2);assert.equal(changed.participants.find(p=>p.id==='replacement').replacement.previousName,'Мария');
  assert.throws(()=>next.setReady(room.id,'replacement',true),/подтвердите/);
  next.acceptReplacement(room.id,'replacement');next.setReady(room.id,'replacement',true);next.setReady(room.id,'host',true);
  assert.equal(next.canStart(room.id),true);
  const saved=next.exportRecovery(room.id),again=service().restoreRecovery(saved,{hostId:'host',collect:true,sessionId:'session-stable',revision:12});
  assert.equal(again.seats[3].participantId,'replacement');assert.equal(again.seats[3].playerIndex,2);
  assert.equal(again.participants.find(p=>p.id==='replacement').replacement.accepted,true);
  assert.equal(saved.tokens.some(t=>t.participantId==='previous'),false);
});


test('active Offline lobby hydration preserves seats and locks configuration',()=>{
  const {rooms,room}=createRoom();
  rooms.configure(room.id,'host',{transportMode:'hotseat'});
  rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Мика'});
  const original=rooms.snapshot(room.id),restoredService=service();
  const active=restoredService.restoreHotSeatLobby(original,{hostId:'host',active:true});
  assert.equal(active.phase,'playing');assert.deepEqual(active.seats,original.seats);assert.equal(active.id,original.id);
  assert.throws(()=>restoredService.setLocalSeat(active.id,'host','seat-2',{kind:'empty'}));
  const rematch=restoredService.restoreHotSeatLobby(original,{hostId:'host'});
  assert.equal(rematch.phase,'lobby');assert.deepEqual(rematch.rules,original.rules);
});

test('RC4 sparse 1/3/5/7 occupancy compacts only overflow and preserves assigned ID',()=>{
 const {rooms,room}=createRoom();rooms.changeGame(room.id,'host',{game:{id:'eight',name:'Eight',version:'1.0.0'},constraints:{min:2,max:8}});
 rooms.join(room.id,{id:'remote',nickname:'Remote'});rooms.claimSeat(room.id,'remote','seat-3');
 let state=rooms.setLocalSeat(room.id,'host','seat-5',{kind:'bot',nickname:'Five'}),five=state.seats[4].participantId;
 state=rooms.setLocalSeat(room.id,'host','seat-7',{kind:'bot',nickname:'Seven'});const seven=state.seats[6].participantId;
 rooms.configure(room.id,'host',{firstPlayerMode:'assigned',firstParticipantId:seven});state=rooms.changeGame(room.id,'host',{game:{id:'four',name:'Four',version:'1.0.0'},constraints:{min:2,max:4}});
 assert.deepEqual(state.seats.map(s=>s.participantId),['host',five,'remote',seven]);assert.equal(state.firstParticipantId,seven);assert.equal(state.participants.find(p=>p.id==='remote').seatId,'seat-3');
});


test('preset avatar survives profile rename and room snapshots without accepting image URLs',()=>{
 const profiles=new ProfileStore(()=>storage),storage=memoryStorage();
 const first=profiles.save('Иван',{avatar:'circle-red'});assert.equal(first.avatar,'circle-red');
 assert.equal(profiles.save('Иван П.').avatar,'circle-red');
 assert.equal(profiles.save('Иван',{avatar:null}).avatar,null);
 assert.equal(profiles.save('Иван',{avatar:'https://example.com/image.png'}).avatar,null);
 const {rooms,room}=createRoom();rooms.join(room.id,{id:'guest',nickname:'Маша',avatar:'star-yellow'});
 assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='guest').avatar,'star-yellow');
 rooms.setAvatar(room.id,'guest','crescent-blue');
 assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='guest').avatar,'crescent-blue');
 rooms.setAvatar(room.id,'guest','data:image/svg+xml,bad');
 assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='guest').avatar,null);
});

test('start validation rejects unsupported rosters before countdown and cancels on disconnect',()=>{
 let time=1000,n=0,calls=0;
 const rooms=new RoomService({idFactory:()=>`id-${++n}`,clock:()=>time,random:()=>.1,validateStart:room=>{calls++;return room.rules.preset==='teams'&&room.participants.filter(p=>p.role==='player').length!==4?'Нужно четыре игрока':null;}});
 const room=rooms.create({name:'Тест',game:{id:'fixture',name:'Игра'},host:{id:'host',nickname:'Иван'},rules:{preset:'teams'},constraints:{min:2,max:4}});
 rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});rooms.setReady(room.id,'host',true);
 assert.equal(rooms.canStart(room.id),false);assert.equal(rooms.startBlocker(room.id),'Нужно четыре игрока');
 assert.throws(()=>rooms.beginCountdown(room.id,'host'),/четыре/);assert.equal(rooms.snapshot(room.id).phase,'lobby');
 rooms.updateRules(room.id,'host',{preset:'individual'});rooms.setReady(room.id,'host',true);
 assert.equal(rooms.canStart(room.id),true,'unused seats do not block a valid roster');
 rooms.beginCountdown(room.id,'host');rooms.setConnected(room.id,'host',false);time=4000;
 const result=rooms.tick(room.id);assert.equal(result.started,false);assert.equal(result.room.phase,'lobby');assert(result.reason);assert(calls>0);
});
