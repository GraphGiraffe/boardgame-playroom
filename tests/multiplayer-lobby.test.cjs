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
  const before=rooms.snapshot(room.id),events=[];const unsubscribe=rooms.subscribe(room.id,snapshot=>events.push(snapshot));
  const changed=rooms.updateRules(room.id,'host',{preset:'fast',presetLabel:'Быстрая',firstPlayerMode:'assigned',seatOrder:'random'});unsubscribe();
  assert.equal(changed.firstPlayerMode,'assigned');assert.equal(changed.seatOrder,'random');
  assert.equal(changed.lobbyRevision,before.lobbyRevision+1);assert.equal(changed.revision,before.revision+1);
  assert.equal(events.length,1);assert.deepEqual(events[0],changed);
  assert.equal(changed.participants.filter(p=>p.role==='player').every(p=>!p.ready),true);
  assert.equal(changed.rulesRevision,2);
  assert.equal(changed.events.at(-1).type,'rules-changed');
  for(const invalid of [{firstPlayerMode:'invalid',seatOrder:'normal'},{firstPlayerMode:'random',seatOrder:'invalid'}]){
    assert.throws(()=>rooms.updateRules(room.id,'host',{preset:'bad',...invalid}));
    assert.deepEqual(rooms.snapshot(room.id),changed,'invalid order leaves rules, readiness, revisions and events unchanged');
    assert.throws(()=>rooms.configure(room.id,'host',invalid));
    assert.deepEqual(rooms.snapshot(room.id),changed,'configure shares validation before changing either order field');
  }
  assert.throws(()=>rooms.updateRules(room.id,'guest',{preset:'unauthorized',firstPlayerMode:'random'}));assert.deepEqual(rooms.snapshot(room.id),changed);
  const legacy=rooms.updateRules(room.id,'host',{preset:'classic'});assert.equal(legacy.firstPlayerMode,'assigned');assert.equal(legacy.seatOrder,'random','callers without order fields preserve current ordering');
});

test('rule settings validate canonical pack choices before mutating readiness and preserve future team presets',()=>{
 const {validateRuleSettings}=require('../application/rooms.js'),uno=require('../packs/uno/manifest.json'),ludo=require('../packs/ludo/manifest.json');
 const schema=manifest=>({...manifest,presets:manifest.presetSetting.options.map(option=>({id:option.value}))});
 assert.equal(validateRuleSettings({preset:'classic',options:{unoMode:'manual',endMode:'winner'}},schema(uno)),null);
 assert.equal(validateRuleSettings({preset:'teams',options:{diceCount:'3',maxRounds:'0'}},schema(ludo)),null,'schema acceptance does not depend on current player count');
 for(const [rules,manifest,field] of [[{preset:'missing'},uno,'preset'],[{preset:'classic',options:{unoMode:'broken'}},uno,'unoMode'],[{preset:'classic',options:{unknown:'x'}},uno,'unknown'],[{preset:'classic',options:[]},uno,'options'],[{preset:'classic',options:{diceCount:'99'}},ludo,'diceCount'],[{preset:'classic',openHands:true},ludo,'openHands']]){
  assert.throws(()=>validateRuleSettings(rules,schema(manifest)),error=>error.code==='ROOM_RULES_INVALID'&&error.field===field);
 }
 for(const value of [NaN,Infinity,-Infinity])assert.throws(()=>validateRuleSettings({options:{numeric:value}},{settings:[{key:'numeric',options:[{value:String(value)}]}]}),error=>error.code==='ROOM_RULES_INVALID'&&error.field==='numeric','non-finite numbers cannot match a string ID accidentally');
 let sequence=0;const rooms=new RoomService({idFactory:()=>`validated-${++sequence}`,clock:()=>1000,random:()=>.1,validateRules:room=>validateRuleSettings(room.rules,schema(uno))});
 const room=rooms.create({name:'Правила',game:{id:'uno',name:'UNO'},host:{id:'host',nickname:'Хост'},rules:{preset:'classic',options:{unoMode:'manual',endMode:'winner'}},constraints:{min:2,max:4}});
 rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});rooms.setReady(room.id,'host',true);const before=rooms.snapshot(room.id),events=[];rooms.subscribe(room.id,event=>events.push(event));
 assert.throws(()=>rooms.updateRules(room.id,'host',{...before.rules,options:{unoMode:'invalid'}}),error=>error.code==='ROOM_RULES_INVALID');assert.deepEqual(rooms.snapshot(room.id),before);assert.deepEqual(events,[]);
 const accepted=rooms.updateRules(room.id,'host',{...before.rules,options:{unoMode:'auto',endMode:'last'}});assert.equal(events.length,1);assert.equal(accepted.revision,before.revision+1);assert.equal(accepted.participants.find(person=>person.id==='host').ready,false);
 rooms.setReady(room.id,'host',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>3000;rooms.tick(room.id);
 const recovered=new RoomService({idFactory:()=>`recovered-${++sequence}`,clock:()=>3000,random:()=>.1,validateRules:rooms.validateRules});recovered.restoreRecovery(rooms.exportRecovery(room.id),{hostId:'host',collect:true,sessionId:'a08-recovery-fixture',revision:0});const recovery=recovered.snapshot(room.id);
 assert.throws(()=>recovered.updateRules(room.id,'host',{...recovery.rules,preset:'quick'}));assert.deepEqual(recovered.snapshot(room.id),recovery,'recovery retains fixed rules without reaching a new commit');
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
  assert.equal(preview.code,null);
  assert.throws(()=>rooms.setOnlineCode(room.id,'host','5040'),/INVALID_ONLINE_ROOM_CODE/);
  rooms.configure(room.id,'host',{transportMode:'online'});assert.equal(rooms.snapshot(room.id).code,null);
  assert.throws(()=>rooms.setOnlineCode(room.id,'guest','5040'));
  const numbered=rooms.setOnlineCode(room.id,'host','5040');assert.equal(numbered.code,'5040');assert.equal(numbered.onlineCodeAssigned,true);
  assert.equal(rooms.setOnlineCode(room.id,'host','5040').revision,numbered.revision);

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
test('smaller pack removes excess bots instead of rejecting human players',()=>{
  const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});rooms.setLocalSeat(room.id,'host','seat-4',{kind:'bot'});
  const before=rooms.snapshot(room.id),after=rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'0.1.0'},constraints:{min:2,max:2}});
  assert.equal(after.participants.filter(p=>p.bot).length,1);assert.equal(after.seats[0].participantId,'host');assert.equal(after.seats[1].participantId,before.seats[1].participantId);
  assert(!after.participants.some(p=>p.id===before.seats[3].participantId));
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


test('pack change seats humans before bots and never adds more bots on expansion',()=>{
 const {rooms,room}=createRoom();rooms.configure(room.id,'host',{transportMode:'hotseat'});
 rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Мика'});
 rooms.setLocalSeat(room.id,'host','seat-3',{kind:'bot',nickname:'Лис'});
 rooms.setLocalSeat(room.id,'host','seat-4',{kind:'human',nickname:'Кира'});
 const before=rooms.snapshot(room.id),human=before.seats[3].participantId;
 const small=rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'1.0.0'},constraints:{min:2,max:2}});
 assert.deepEqual(small.seats.map(s=>s.participantId),['host',human]);assert.equal(small.participants.filter(p=>p.bot).length,0);
 assert.equal(small.participants.find(p=>p.id===human).nickname,'Кира');
 const big=rooms.changeGame(room.id,'host',{game:{id:'uno',name:'UNO',version:'1.0.0'},constraints:{min:2,max:6}});
 assert.equal(big.participants.filter(p=>p.bot).length,0);assert.equal(big.seats.filter(s=>!s.participantId).length,4);
});

test('excess real players reject a switch without changing the room or dropping guests',()=>{
 const {rooms,room}=createRoom();
 for(const [id,seat] of [['anna','seat-2'],['maria','seat-4']]){rooms.join(room.id,{id,nickname:id});rooms.claimSeat(room.id,id,seat);}
 rooms.setReady(room.id,'host',true);const before=rooms.snapshot(room.id);
 assert.throws(()=>rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'1.0.0'},constraints:{min:2,max:2}}),/игроков: 3.*мест: 2/i);
 assert.deepEqual(rooms.snapshot(room.id),before);
});

test('network switch keeps disconnected humans, observers and identities while trimming bots',()=>{
 const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});rooms.setLocalSeat(room.id,'host','seat-3',{kind:'bot'});
 rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-4');
 rooms.join(room.id,{id:'observer',nickname:'Зритель'});rooms.setConnected(room.id,'guest',false);
 const before=rooms.snapshot(room.id),after=rooms.changeGame(room.id,'host',{game:{id:'checkers',name:'Шашки',version:'1.0.0'},constraints:{min:2,max:2}});
 assert.deepEqual(after.seats.map(s=>s.participantId),['host','guest']);assert.equal(after.participants.filter(p=>p.bot).length,0);
 assert.deepEqual(after.participants.find(p=>p.id==='observer'),{...before.participants.find(p=>p.id==='observer'),ready:false});
 assert.equal(after.participants.find(p=>p.id==='guest').connected,false);assert.equal(after.code,before.code);
});

test('solo packs are local only, with atomic rejection on network mode and pack changes',()=>{
 const rooms=service(),solo={id:'solo',name:'Соло',version:'1.0.0'};
 assert.throws(()=>rooms.create({name:'Соло-комната',game:solo,host:{id:'host',nickname:'Иван'},constraints:{min:1,max:1}}),/Соло-игры/);
 const local=rooms.create({name:'Соло-комната',game:solo,host:{id:'host',nickname:'Иван'},transportMode:'hotseat',constraints:{min:1,max:1}});
 const before=rooms.snapshot(local.id);assert.throws(()=>rooms.configure(local.id,'host',{transportMode:'network',name:'Changed'}),/Соло-игры/);assert.deepEqual(rooms.snapshot(local.id),before);
 const net=createRoom(),saved=net.rooms.snapshot(net.room.id);assert.throws(()=>net.rooms.changeGame(net.room.id,'host',{game:solo,constraints:{min:1,max:1}}),/Соло-игры/);assert.deepEqual(net.rooms.snapshot(net.room.id),saved);
});

test('local change to solo drops bots; mixed single-to-multiplayer packs remain network eligible',()=>{
 const {rooms,room}=createRoom();rooms.configure(room.id,'host',{transportMode:'hotseat'});rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});
 const solo=rooms.changeGame(room.id,'host',{game:{id:'solo',name:'Соло',version:'1.0.0'},constraints:{min:1,max:1}});
 assert.deepEqual(solo.seats.map(s=>s.participantId),['host']);assert.equal(solo.participants.length,1);
 const net=createRoom();assert.equal(net.rooms.gameChangeBlocker(net.room.id,{min:1,max:4}),null);
});

test('growing a pack keeps the old bot count and clears a removed assigned bot',()=>{
 const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});
 const old=rooms.snapshot(room.id),bot=old.seats[1].participantId;
 const grown=rooms.changeGame(room.id,'host',{game:{id:'larger',name:'Большая',version:'1.0.0'},constraints:{min:2,max:6}});
 assert.deepEqual(grown.participants.filter(p=>p.bot).map(p=>p.id),[bot]);
 rooms.configure(room.id,'host',{transportMode:'hotseat',firstPlayerMode:'assigned',firstParticipantId:bot});
 const solo=rooms.changeGame(room.id,'host',{game:{id:'solo',name:'Соло',version:'1.0.0'},rules:{firstPlayerMode:'assigned'},constraints:{min:1,max:1}});
 assert.equal(solo.firstParticipantId,null);assert.equal(solo.firstPlayerMode,'rules');
});

test('online is a distinct lobby mode sharing network seat and solo restrictions',()=>{
 const {rooms,room}=createRoom();const state=rooms.configure(room.id,'host',{transportMode:'online'});assert.equal(state.transportMode,'online');
 assert.throws(()=>rooms.setLocalSeat(room.id,'host','seat-2',{kind:'human',nickname:'Нельзя'}));
 const peer=rooms.connection(room.id);peer.dispatch({type:'join',nickname:'Игрок'});assert.equal(rooms.snapshot(room.id).transportMode,'online');
});


test('delegated invitations require host permission and cancel pending peers on revocation',async()=>{
 const Invites=require('../app/network-invitations.js'),{rooms,room}=createRoom();
 rooms.configure(room.id,'host',{transportMode:'network'});rooms.join(room.id,{id:'guest',nickname:'Гость'});
 assert.throws(()=>rooms.setInvitationPermission(room.id,'guest',true));
 let disposed=0,accepted=0;
 const manager=new Invites({authorize:id=>{const r=rooms.snapshot(room.id);assert(r.allowPlayerInvites&&r.participants.some(p=>p.id===id&&p.connected));},create:async()=>({offer:'host-offer'}),accept:async()=>{accepted++;},dispose:()=>{disposed++;}});
 const updates=[],off=rooms.subscribe(room.id,state=>{updates.push(state);manager.prune();});
 try{
  await assert.rejects(manager.dispatch('guest',{type:'invitation-offer'}));
  const before=rooms.snapshot(room.id),enabled=rooms.setInvitationPermission(room.id,'host',true);
  assert.equal(updates.length,1,'permission mutation must notify room subscribers');
  assert.equal(enabled.revision,before.revision+1);assert.equal(enabled.eventSequence,before.eventSequence+1);
  assert.deepEqual(updates[0],enabled);
  assert.deepEqual(enabled.events.at(-1),{id:enabled.eventSequence,type:'invitation-permission',text:'',at:enabled.updatedAt,allowPlayerInvites:true});
  assert.deepEqual(rooms.setInvitationPermission(room.id,'host',true),enabled);assert.equal(updates.length,1,'no-op must not notify or mutate');
  assert.equal((await manager.dispatch('guest',{type:'invitation-offer'})).offer,'host-offer');
  const revoked=rooms.setInvitationPermission(room.id,'host',false);assert.equal(disposed,1,'revocation subscriber prunes pending offer immediately');
  assert.equal(updates.length,2);assert.deepEqual(updates[1],revoked);assert.equal(revoked.events.at(-1).allowPlayerInvites,false);
  await assert.rejects(manager.dispatch('guest',{type:'invitation-answer',answer:'answer'}));assert.equal(accepted,0);
  rooms.setInvitationPermission(room.id,'host',true);await manager.dispatch('guest',{type:'invitation-offer'});await manager.dispatch('guest',{type:'invitation-answer',answer:'answer'});assert.equal(accepted,1);assert.equal(rooms.snapshot(room.id).ownerId,'host');
  let nested=false;const offNested=rooms.subscribe(room.id,state=>{if(state.allowPlayerInvites&&!nested){nested=true;rooms.setInvitationPermission(room.id,'host',false);}});
  try{
   rooms.setInvitationPermission(room.id,'host',false);const prior=rooms.snapshot(room.id);updates.length=0;
   const result=rooms.setInvitationPermission(room.id,'host',true);
   assert.equal(nested,true);assert.deepEqual(updates.map(state=>state.allowPlayerInvites),[true,false]);
   assert.equal(result.revision,prior.revision+2);assert.equal(result.eventSequence,prior.eventSequence+2);
   assert.equal(result.allowPlayerInvites,false);assert.deepEqual(result,rooms.snapshot(room.id),'outer return must retain reentrant subscriber mutation');
   assert.equal(result.ownerId,'host');assert.deepEqual(result.rules,prior.rules);assert.deepEqual(result.participants,prior.participants);
  }finally{offNested();}
 }finally{off();manager.close();}
});

test('live roster collection preserves fixed slots and distinguishes a lost connection from removal',()=>{
 const {rooms,room}=createRoom();const guest=rooms.join(room.id,{id:'guest',nickname:'Гость'});rooms.claimSeat(room.id,'guest','seat-2');rooms.setReady(room.id,'host',true);rooms.setReady(room.id,'guest',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>3000;rooms.tick(room.id);
 rooms.setConnected(room.id,'guest',false);assert.equal(rooms.snapshot(room.id).seats[1].participantId,'guest');
 rooms.collectForReplacement(room.id,'host',{sessionId:'same-match',revision:7});assert.equal(rooms.snapshot(room.id).seats[1].participantId,'guest');
 rooms.kick(room.id,'host','guest');assert.equal(rooms.snapshot(room.id).seats[1].participantId,null);assert.equal(rooms.snapshot(room.id).seats[1].closed,false);assert.throws(()=>rooms.resume(room.id,{participantId:'guest',token:guest.resumeToken}));
 assert.throws(()=>rooms.setLocalSeat(room.id,'host','seat-2',{kind:'closed'}),/RECOVERY_SLOT_FIXED/);assert.throws(()=>rooms.setLocalSeat(room.id,'host','seat-3',{kind:'bot'}),/RECOVERY_SLOT_FIXED/);
 rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});assert.equal(rooms.snapshot(room.id).seats[1].playerIndex,1);rooms.setLocalSeat(room.id,'host','seat-2',{kind:'empty'});
 rooms.join(room.id,{id:'new',nickname:'Замена'});rooms.claimSeat(room.id,'new','seat-2');assert.throws(()=>rooms.setReady(room.id,'new',true));rooms.acceptReplacement(room.id,'new');rooms.setReady(room.id,'new',true);rooms.setReady(room.id,'host',true);assert.equal(rooms.canStart(room.id),true);
});

test('replacement arrivals and bot settings retain other ready players until a real configuration change',()=>{
 const {rooms,room}=createRoom();rooms.join(room.id,{id:'old',nickname:'Старый'});rooms.claimSeat(room.id,'old','seat-2');rooms.setReady(room.id,'old',true);rooms.setReady(room.id,'host',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>3000;rooms.tick(room.id);rooms.collectForReplacement(room.id,'host',{sessionId:'match',revision:5});rooms.kick(room.id,'host','old');rooms.setReady(room.id,'host',true);
 rooms.join(room.id,{id:'new',nickname:'Новый'});rooms.claimSeat(room.id,'new','seat-2');assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,true);rooms.acceptReplacement(room.id,'new');rooms.setReady(room.id,'new',true);rooms.kick(room.id,'host','new');assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,true);
 rooms.join(room.id,{id:'again',nickname:'Другой'});rooms.claimSeat(room.id,'again','seat-2');assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,true);rooms.kick(room.id,'host','again');rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Бот'});assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,false);rooms.setReady(room.id,'host',true);rooms.configureBot(room.id,'host','seat-2',{nickname:'Бот',botSettings:{strategy:'auto',difficulty:'hard'}});assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,true);rooms.setBotsDifficulty(room.id,'host','easy');assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,true);rooms.setLocalSeat(room.id,'host','seat-2',{kind:'empty'});assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='host').ready,false);
});

test('authenticated cloud binding recovers a disconnected reserved identity without a client token',()=>{
 const {rooms,room}=createRoom();const first=rooms.connection(room.id,{boundParticipantId:'cloud-user'}),joined=first.dispatch({type:'join',nickname:'Гость'});first.dispatch({type:'claim-seat',seatId:'seat-2'});first.close();
 const untrusted=rooms.connection(room.id);const random=untrusted.dispatch({type:'join',nickname:'Другой',id:'cloud-user'});assert.notEqual(random.snapshot.participantId,'cloud-user');untrusted.close();
 const fresh=rooms.connection(room.id,{boundParticipantId:'cloud-user'}),resumed=fresh.dispatch({type:'join',nickname:'Гость'});assert.equal(resumed.resumed,true);assert.equal(resumed.snapshot.participantId,'cloud-user');assert.equal(resumed.snapshot.room.seats[1].participantId,'cloud-user');assert.notEqual(resumed.resumeToken,joined.resumeToken);assert(!JSON.stringify(resumed.snapshot).includes(resumed.resumeToken));
 assert.throws(()=>rooms.connection(room.id,{boundParticipantId:'cloud-user'}).dispatch({type:'join',nickname:'Дубликат'}));fresh.close();
 rooms.setReady(room.id,'host',true);rooms.setConnected(room.id,'cloud-user',true);rooms.setReady(room.id,'cloud-user',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>3000;rooms.tick(room.id);rooms.setConnected(room.id,'cloud-user',false);assert.equal(rooms.connection(room.id,{boundParticipantId:'cloud-user'}).dispatch({type:'join',nickname:'Гость'}).resumed,true);
});


test('queued readiness rejects changed configuration and countdown cancellation only clears its actor',()=>{
 const {readyConfiguration}=require('../app/multiplayer.js'),{rooms,room}=createRoom();
 rooms.join(room.id,{id:'guest',nickname:'Маша'});rooms.claimSeat(room.id,'guest','seat-2');
 const key=readyConfiguration(rooms.snapshot(room.id),'guest');rooms.setReady(room.id,'host',true);
 rooms.setConnected(room.id,'guest',false);rooms.setConnected(room.id,'guest',true);
 rooms.setAutoStart(room.id,'host',true);assert.throws(()=>rooms.setAutoStart(room.id,'guest',false));
 rooms.setReady(room.id,'guest',true,key);rooms.beginCountdown(room.id,'host');
 assert.equal(rooms.snapshot(room.id).phase,'starting');assert.throws(()=>rooms.setReady(room.id,'guest',true));
 const stopped=rooms.setReady(room.id,'guest',false);assert.equal(stopped.phase,'lobby');assert.equal(stopped.countdownEndsAt,null);assert.equal(stopped.participants.find(p=>p.id==='host').ready,true);assert.equal(stopped.participants.find(p=>p.id==='guest').ready,false);
 rooms.updateRules(room.id,'host',{preset:'changed'});assert.throws(()=>rooms.setReady(room.id,'guest',true,key),/изменились/);assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='guest').ready,false);
});


test('autostart defaults on and requires a human player, ready roster and valid team rules',()=>{
 let time=1000,n=0;const rooms=new RoomService({idFactory:()=>`auto-${++n}`,clock:()=>time,random:()=>.1,validateStart:r=>r.rules.preset==='teams'&&r.participants.filter(p=>p.role==='player').length!==4?'Нужно четыре игрока':null});
 const room=rooms.create({name:'Авто',game:{id:'test',name:'Тест'},host:{id:'host',nickname:'Хост'},rules:{preset:'teams'},constraints:{min:2,max:4}});assert.equal(room.autoStart,true);
 rooms.becomeSpectator(room.id,'host');rooms.setLocalSeat(room.id,'host','seat-1',{kind:'bot'});rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});assert.equal(rooms.canStart(room.id),false,'spectators and bots alone cannot launch a network match');
 rooms.join(room.id,{id:'player',nickname:'Игрок'});rooms.claimSeat(room.id,'player','seat-3');assert.equal(rooms.canStart(room.id),false);rooms.setReady(room.id,'player',true);assert.equal(rooms.canStart(room.id),false,'three players cannot start a four-player team game');
 rooms.setLocalSeat(room.id,'host','seat-4',{kind:'bot'});rooms.setReady(room.id,'player',true);assert.equal(rooms.canStart(room.id),true);rooms.beginCountdown(room.id,'host');rooms.setConnected(room.id,'player',false);time=4000;assert.equal(rooms.tick(room.id).started,false);assert.equal(rooms.snapshot(room.id).phase,'lobby');
});


test('return to completed lobby is idempotent and preserves ready state and ownership',()=>{
 const {rooms,room}=createRoom();rooms.configure(room.id,'host',{transportMode:'hotseat'});rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot'});rooms.startHotSeat(room.id,'host');const lobby=rooms.returnToLobby(room.id,'host');const again=rooms.returnToLobby(room.id,'host');assert.deepEqual(again,lobby);assert.throws(()=>rooms.returnToLobby(room.id,'intruder'));
});


for(const role of ['spectator','table'])test('resume '+role+' during a match preserves role and needs its own token',()=>{
 const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Бот'});const joined=rooms.join(room.id,{id:'observer',nickname:'Наблюдатель'});if(role==='table')rooms.claimTable(room.id,'observer');
 rooms.setReady(room.id,'host',true);rooms.beginCountdown(room.id,'host',{seconds:1});rooms.clock=()=>3000;rooms.tick(room.id);rooms.setConnected(room.id,'observer',false);
 assert.throws(()=>rooms.resume(room.id,{participantId:'observer',token:'0'.repeat(64)}));assert.equal(rooms.snapshot(room.id).participants.find(p=>p.id==='observer').connected,false);
 const invalid=rooms.rooms.get(room.id).participants.find(p=>p.id==='observer');invalid.role='player';assert.throws(()=>rooms.resume(room.id,{participantId:'observer',token:joined.resumeToken}));invalid.role=role;
 const resumed=rooms.resume(room.id,{participantId:'observer',token:joined.resumeToken}),observer=resumed.room.participants.find(p=>p.id==='observer');assert.equal(observer.role,role);assert.equal(observer.seatId,null);assert.equal(observer.connected,true);assert.equal(rooms.playerCount(room.id),2);
});

test('lobby drag uses existing host, actor, occupied, closed and assigned-first command boundaries',()=>{
 const {rooms,room}=createRoom();rooms.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Бот'});rooms.join(room.id,{id:'guest',nickname:'Гость'});rooms.claimSeat(room.id,'guest','seat-3');rooms.setLocalSeat(room.id,'host','seat-4',{kind:'closed'});
 const before=rooms.snapshot(room.id),bot=before.seats[1].participantId;
 assert.throws(()=>rooms.moveParticipant(room.id,'guest','host','seat-2'),/хост/);assert.throws(()=>rooms.claimSeat(room.id,'guest','seat-2'),/занят/);assert.throws(()=>rooms.claimSeat(room.id,'guest','seat-4'),/закрыт/);assert.throws(()=>rooms.configure(room.id,'guest',{firstPlayerMode:'assigned',firstParticipantId:'host'}),/хост/);assert.deepEqual(rooms.snapshot(room.id).seats,before.seats);
 rooms.setReady(room.id,'guest',true);assert.throws(()=>rooms.claimSeat(room.id,'guest','seat-1'),/готовность/);rooms.setReady(room.id,'guest',false);
 rooms.configure(room.id,'host',{firstPlayerMode:'assigned',firstParticipantId:'guest'});const swapped=rooms.moveParticipant(room.id,'host',bot,'seat-1');assert.equal(swapped.seats[0].participantId,bot);assert.equal(swapped.seats[1].participantId,'host');assert.equal(swapped.firstParticipantId,'guest');assert.deepEqual(swapped.seats.map(s=>[s.id,s.index,s.sideId]),before.seats.map(s=>[s.id,s.index,s.sideId]));assert.equal(swapped.participants.length,before.participants.length);assert.throws(()=>rooms.moveParticipant(room.id,'host',bot,'seat-4'),/закрыт/);assert.throws(()=>rooms.configure(room.id,'host',{firstParticipantId:'missing'}));
});
