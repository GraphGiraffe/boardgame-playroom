'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {RoomService,SwitchableConnection}=require('../app/multiplayer.js');
const Session=require('../core/session.js'),Authority=require('../core/authority.js'),E=require('../core/engine.js');
for(const id of ['next-match-uno','next-match-checkers'])E.register({
  id,name:id,min:2,max:2,presets:[{id:'basic'}],
  create(state){state.data={counter:0};},
  legal(){return [{type:'tick'}];},
  apply(state,actor){state.data.counter++;state.turn=(actor+1)%2;},
  project(){}
});
function fixture(){
  let n=0,now=1000;
  const rooms=new RoomService({idFactory:()=>`person-${++n}`,clock:()=>now,random:()=>0.42,
    tokenFactory:()=>String(++n).padStart(64,'0')});
  const room=rooms.create({name:'Same RTC room',host:{id:'host',nickname:'A'},hostMode:'player',
    game:{id:'next-match-uno',name:'UNO',version:'0.1.0'},constraints:{min:2,max:2}});
  const connection=rooms.connection(room.id),joined=connection.dispatch({type:'join',nickname:'B'});
  connection.dispatch({type:'claim-seat',seatId:'seat-2'});
  rooms.setReady(room.id,'host',true);connection.dispatch({type:'ready',ready:true});
  return {rooms,room,connection,joined,ready:()=>{rooms.beginCountdown(room.id,'host',{seconds:1});now+=1500;rooms.tick(room.id);}};
}
test('completed match switches the live peer from game authority back to the same room, then to another game',()=>{
  const f=fixture(),snapshots=[],id=f.room.id,participantId=f.joined.snapshot.participantId;
  const sw=new SwitchableConnection(f.connection);
  const unsubscribe=sw.subscribe(s=>snapshots.push(s));
  f.ready();
  const first=new Session(E,'next-match-uno',{players:[{name:'A'},{name:'B'}]});
  const firstAuthority=new Authority(first,{sessionId:'first-session'});
  sw.set(firstAuthority.connect(1));
  assert.equal(sw.snapshot().game,'next-match-uno');
  assert.equal(sw.snapshot().sessionId,'first-session');
  f.rooms.returnToLobby(id,'host');
  sw.set(f.connection); // same already-connected RTC channel
  assert.equal(sw.snapshot().kind,'lobby');
  assert.equal(sw.snapshot().participantId,participantId);
  assert.equal(sw.snapshot().room.id,id);
  assert.equal(sw.snapshot().room.seats[1].participantId,participantId);
  assert.equal(sw.snapshot().room.participants.find(p=>p.id===participantId).connected,true);
  assert.equal(f.rooms.snapshot(id).code,f.room.code);
  f.rooms.changeGame(id,'host',{game:{id:'next-match-checkers',name:'Шашки',version:'0.1.0'},
    rules:{preset:'basic'},constraints:{min:2,max:2}});
  assert.equal(sw.snapshot().room.game.id,'next-match-checkers');
  assert.equal(sw.snapshot().room.participants.find(p=>p.id===participantId).ready,false);
  assert.equal(sw.dispatch({type:'ready',ready:true}).ok,true);
  f.rooms.setReady(id,'host',true);f.ready=undefined;
  f.rooms.beginCountdown(id,'host',{seconds:1});
  // The next authority uses a NEW sessionId; old session/history is untouched.
  const second=new Session(E,'next-match-checkers',{players:[{name:'A'},{name:'B'}]});
  const secondAuthority=new Authority(second,{sessionId:'second-session'});
  sw.set(secondAuthority.connect(1));
  assert.equal(sw.snapshot().game,'next-match-checkers');
  assert.equal(sw.snapshot().sessionId,'second-session');
  assert.notEqual(sw.snapshot().sessionId,'first-session');
  assert.equal(first.current.game,'next-match-uno');
  assert(snapshots.some(s=>s.kind==='lobby'&&s.room?.game?.id==='next-match-checkers'));
  unsubscribe();sw.close();firstAuthority.dispose();secondAuthority.dispose();
});
test('switching the live room after a completed match does not delete the guest resume ticket',()=>{
  const f=fixture();f.ready();const roomId=f.room.id,old=f.joined.resumeToken;
  f.rooms.returnToLobby(roomId,'host');
  f.rooms.changeGame(roomId,'host',{game:{id:'next-match-checkers',name:'Шашки',version:'0.1.0'},constraints:{min:2,max:2}});
  f.connection.close();
  const rejoined=f.rooms.connection(roomId).dispatch({type:'resume',participantId:f.joined.snapshot.participantId,resumeToken:old});
  assert.equal(rejoined.resumed,true);
  assert.equal(rejoined.snapshot.room.game.id,'next-match-checkers');
  assert.equal(rejoined.snapshot.room.seats[1].participantId,f.joined.snapshot.participantId);
});
