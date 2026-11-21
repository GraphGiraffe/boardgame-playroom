'use strict';
require('../core/model-registration.js');
const {test}=require('node:test'),assert=require('node:assert/strict');
const {MessageChannel}=require('node:worker_threads');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js');
const P=require('../core/protocol.js'),Client=require('../app/session-client.js'),Port=require('../app/transports/message-port.js');
const Access=require('../application/session-access.js');
const base=require('../packs/tictactoe/domain/game.js'),presentation=require('../packs/tictactoe/presentation/scene.js');
const definition={...base,id:'table-access-test',
 create(options){const state=base.create(options);return {...state,data:{...state.data,die:6,hands:[[{id:'PRIVATE-A'}],[{id:'PRIVATE-B'}]]}};},
 validate:()=>true,
 actions:(state,actor)=>actor===state.turn?[
  {command:{type:'roll'},visibility:'public'},
  {command:{type:'play',card:state.data.hands[actor][0].id},visibility:'private'}]:[],
 reduce:(state,actor,action)=>({position:{...state,turn:1-actor,data:{...state.data,die:action.type==='roll'?2:3}},events:[]}),
 project:(state,viewer)=>({die:state.data.die,hands:state.data.hands.map((hand,owner)=>owner===viewer?hand:hand.map(()=>({hidden:true})))})};
E.register(globalThis.PlayroomModelRegistration.adapt(E,{definition,
 presentation:{...presentation,scene:projection=>({contractVersion:1,id:'test-table',family:'board',players:projection.data.hands.map((hand,player)=>({player,hand,metrics:[]})),geometry:{topology:'fixed'},zones:[{id:'field',kind:'board'}],objects:[],interactions:projection.actions.map(command=>({command,target:{zone:'field'}})),die:projection.data.die}),action:()=>({key:'tictactoe.board.label',params:{}})},
 locales:{ru:require('../packs/tictactoe/lang/ru.json')},version:'0.1.0'}));
function session(){return new Session(E,definition.id,{seed:'PRIVATE-SEED',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]});}
const request=(connection,action={type:'roll'},id='roll-1')=>P.command(connection.snapshot(),action,id);
function publicOnly(snapshot){
 assert.equal(snapshot.viewer,-1);assert.equal(snapshot.audience,'public');
 assert(!JSON.stringify(snapshot).includes('PRIVATE-'));
 assert.equal(snapshot.state.data,undefined);
 assert(snapshot.state.scene.players.flatMap(person=>person.hand).every(card=>card.hidden));
 assert.equal(snapshot.state.modelProjection,undefined);
}

test('host room policy separates Table, spectator and exact recovered player indexes',()=>{
 const room={participants:[{id:'table',role:'table'},{id:'a',role:'player'},{id:'b',role:'player'},{id:'watch',role:'spectator'}],
  seats:[{participantId:'a',index:0,playerIndex:1},{participantId:'b',index:1,playerIndex:0}]};
 assert.deepEqual(Access.resolve(room,'table'),{role:'table',viewer:-1,actors:[1,0]});
 assert.deepEqual(Access.resolve(room,'a'),{role:'player',viewer:1});
 assert.deepEqual(Access.resolve(room,'watch'),{role:'spectator',viewer:-1});
 assert.throws(()=>Access.resolve(room,'unknown'),/PARTICIPANT_UNAVAILABLE/);
 const authority=new Authority(session());
 try{
  assert.equal(Access.connect(authority,room,'table').snapshot().role,'table');
  assert.equal(Access.connect(authority,room,'watch').snapshot().role,'spectator');
  assert.equal(Access.connect(authority,room,'a').snapshot().viewer,1);
  assert.throws(()=>authority.connectTable([0,0]),/Invalid Table actors/);
  assert.throws(()=>authority.connectTable([2]),/Invalid Table actors/);
 }finally{authority.dispose();}
 room.seats[0].playerIndex=0;assert.throws(()=>Access.resolve(room,'a'),/SEATS_INVALID/);
});

test('Table keeps spectator secrets and public dice while private actions stay on the phone',()=>{
 const authority=new Authority(session()),table=authority.connectTable([0,1]),spectator=authority.connect(-1),phone=authority.connect(0);
 try{
  const snapshot=table.snapshot();publicOnly(snapshot);
  assert.deepEqual(snapshot.state.scene.players,spectator.snapshot().state.scene.players);
  assert.deepEqual(snapshot.actions,[{type:'roll'}]);assert.equal(snapshot.actor,0);
  assert.equal(snapshot.state.scene.die,6);
  const denied=table.dispatch(request(table,{type:'play',card:'PRIVATE-A'},'private'));
  assert.equal(denied.code,'ILLEGAL');publicOnly(denied.snapshot);assert.equal(authority.revision,0);
  const own=phone.snapshot();assert.equal(own.state.scene.players[0].hand[0].id,'PRIVATE-A');
  assert.equal(phone.dispatch(request(phone,{type:'play',card:'PRIVATE-A'},'own')).ok,true);
  const history=table.history(0);publicOnly(history);
  assert.deepEqual(history.actions,[]);assert.deepEqual(history.state.tableActions,[]);
  assert.deepEqual(history.state.scene.interactions,[]);assert.equal(history.actor,-1);
  assert.equal(spectator.dispatch(request(spectator)).code,'READ_ONLY');
 }finally{authority.dispose();}
});

test('Table actor grants cannot impersonate another seat or bots and retries never repeat a turn',()=>{
 const state=session(),authority=new Authority(state),table=authority.connectTable([0]),phone=authority.connect(0),seen=[];
 table.subscribe(snapshot=>{publicOnly(snapshot);seen.push(snapshot.revision);});
 try{
  const command=request(table);assert.equal(command.actor,0);
  assert.equal(table.dispatch({...command,actor:1}).code,'READ_ONLY');
  assert.equal(phone.dispatch(command).code,'BAD_COMMAND');
  assert.equal(table.dispatch(request(table,{type:'session-pause',paused:true},'pause')).code,'READ_ONLY');
  assert.equal(table.dispatch(command).ok,true);assert.equal(state.current.data.die,2);
  assert.equal(table.dispatch(command).duplicate,true);assert.equal(authority.revision,1);
  assert.deepEqual(seen,[1]);assert.deepEqual(table.snapshot().actions,[]);
  assert.equal(table.dispatch({...command,action:{type:'play',card:'PRIVATE-A'}}).code,'ID_CONFLICT');
  assert.equal(table.dispatch({...command,commandId:'old'}).code,'STALE');
  const bots=new Authority(new Session(E,definition.id,{seed:17,firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'A'},{name:'Bot',bot:true}]}));
  try{
   const botTable=bots.connectTable([1]);assert.deepEqual(botTable.snapshot().actions,[]);
   assert.equal(botTable.dispatch({...request(botTable),actor:1,commandId:'bot'}).code,'READ_ONLY');
  }finally{bots.dispose();}
 }finally{authority.dispose();}
});

test('durable Table ACK waits for commit and a restored public binding resolves a lost ACK',async()=>{
 const state=session(),rows=[];let release;
 const gate=new Promise(resolve=>release=resolve);
 const persistence={async commit(entry){assert.equal(state.current.move,0);rows.push(entry);await gate;},async recordReceipt(entry){rows.push(entry);}};
 const authority=new Authority(state,{sessionId:'table-session',authorityEpoch:'old',persistence}),table=authority.connectTable([0,1]);
 const command=request(table);let settled=false;
 try{
  const pending=table.dispatch(command).then(value=>{settled=true;return value;});
  assert.equal(settled,false);assert.equal(state.current.move,0);assert.equal(rows[0].viewer,0);
  release();const receipt=await pending;assert(receipt.ok);publicOnly(receipt.snapshot);
  assert.equal(state.current.move,1);assert.equal((await table.dispatch(command)).duplicate,true);
  assert.equal(rows.length,1);
  const restored=Session.restore(E,JSON.parse(state.serialize()));
  const next=new Authority(restored,{sessionId:'table-session',authorityEpoch:'new',persistence:{...persistence,commit(){throw Error('must not commit twice');}},restoredReceipts:rows});
  try{
   const connected=next.connectTable([0,1]),duplicate=await connected.dispatch(command);
   assert(duplicate.duplicate);publicOnly(duplicate.snapshot);assert.equal(next.revision,1);
   assert.equal((await connected.dispatch({...command,commandId:'not-cached'})).code,'WRONG_EPOCH');
   assert.equal((await next.connectTable([1]).dispatch(command)).code,'READ_ONLY');
  }finally{next.dispose();}
 }finally{release();authority.dispose();}
});

test('client recovery preserves Table role and accepts changing public actors without resending a move',async()=>{
 const authority=new Authority(session()),table=authority.connectTable([0,1]);let lost=true;
 const client=new Client({snapshot:table.snapshot,history:table.history,async dispatch(command){const result=table.dispatch(command);if(lost)throw Error('ACK lost');return result;}});
 try{
  await client.refresh();await assert.rejects(client.send({type:'roll'}),/ACK lost/);
  assert.equal(authority.revision,1);assert.equal(client.pending.actor,0);
  await assert.rejects(client.reconcile(authority.connect(-1).snapshot()),/подключения изменилось/);
  assert.equal(client.accept({...table.snapshot(),role:'spectator'}),false);
  lost=false;await client.reconcile(table.snapshot());
  assert.equal(client.pending,null);assert.equal(client.snapshot.actor,1);assert.equal(authority.revision,1);
  publicOnly(client.snapshot);
 }finally{client.close();authority.dispose();}
});

test('MessagePort awaits durable Table commands and carries only public snapshots and history',async()=>{
 const authority=new Authority(session(),{persistence:{commit:async()=>{},recordReceipt:async()=>{}}});
 const channel=new MessageChannel(),stop=Port.serve(channel.port1,authority.connectTable([0,1])),transport=Port.client(channel.port2),client=new Client(transport);
 try{
  await client.refresh();publicOnly(client.snapshot);
  assert((await client.send({type:'roll'})).ok);assert.equal(authority.revision,1);publicOnly(client.snapshot);
  const frame=await client.history(0);publicOnly(frame);assert.deepEqual(frame.actions,[]);
 }finally{client.close();stop();authority.dispose();}
});

test('portable scene controls follow authority grants and Table actor changes do not change its audience',async()=>{
 const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');require('../packs/tictactoe/rules.js');
 const session=new Session(E,'tictactoe',{seed:17,players:[{name:'A'},{name:'B'}]}),authority=new Authority(session),table=authority.connectTable([0,1]),player=authority.connect(0);
 try{
  const initial=table.snapshot();assert.equal(initial.actor,0);assert.equal(initial.state.scene.cells.filter(cell=>cell.command).length,9);
  assert(table.dispatch(P.command(initial,{type:'place',cell:4},'scene-table-1')).ok);
  const next=table.snapshot();assert.equal(next.actor,1);assert(P.sameAudience(initial,next));assert.equal(next.state.scene.cells.filter(cell=>cell.command).length,8);
  const own=player.snapshot();assert((await player.dispatch(P.command(own,{type:'session-pause',paused:true,expectedControlRevision:own.controlRevision},'scene-pause'))).ok);
  const paused=table.snapshot();assert.deepEqual(paused.actions,[]);assert(paused.state.scene.cells.every(cell=>cell.command===null));
  assert(table.history(0).state.scene.cells.every(cell=>cell.command===null));
 }finally{authority.dispose();}
});
