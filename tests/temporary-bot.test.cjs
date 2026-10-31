'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js'),Service=require('../application/player-control-service.js'),Controls=require('../core/player-controls.js'),Client=require('../app/session-client.js');
E.register({id:'temporary-bot-fixture',name:'Temporary bot',min:2,max:2,presets:[{id:'basic'}],create(s){s.data={secret:'private',count:0};},legal(){return [{type:'tick'}];},project(s){delete s.data.secret;},apply(s){s.data.count++;s.turn=1-s.turn;}});
const fixture=options=>{const session=new Session(E,'temporary-bot-fixture',{firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]}),authority=new Authority(session,options);return {session,authority,a:authority.connect(0),b:authority.connect(1)};};
const control=(authority,actor,changes,requestId='control')=>authority.setPlayerControl(actor,changes,{requestId,expectedRevision:authority.connect(0).snapshot().playerControlRevision});
test('temporary bot is manual, preserves human identity and private audience, and reconnect requires explicit reclaim',async()=>{
 const {session,authority,a,b}=fixture();authority.setViewerConnected(0,false);assert.equal(a.snapshot().playerControls[0].bot,false);
 await control(authority,0,{bot:true});assert.equal(a.snapshot().actions.length,0);assert.equal(a.snapshot().state.players[0].bot,false);
 const command=P.command(a.snapshot(),{type:'tick'},'human-blocked');assert.equal(a.dispatch(command).code,'READ_ONLY');authority.actBot(0,{type:'tick'});assert.equal(session.current.players[0].bot,false);assert.equal(session.current.players[0].name,'A');
 authority.setViewerConnected(0,true);assert.equal(a.snapshot().playerControls[0].bot,true);await control(authority,0,{away:false,bot:false},'return');assert.equal(b.dispatch(P.command(b.snapshot(),{type:'tick'},'next-human')).ok,true);assert(a.snapshot().actions.length);assert(!JSON.stringify(authority.connect(-1).snapshot()).includes('private'));authority.dispose();
});
test('return waits for accepted durable bot action; parallel control and human action are fenced; lost ACK replays',async()=>{
 let release,gate=Promise.resolve();const writes=[],{session,authority,a}=fixture({persistence:{commit:async e=>{await gate;writes.push(e);},recordReceipt:async()=>{},setPlayerControls:async e=>writes.push(e)}});
 await control(authority,0,{away:true},'away');await control(authority,0,{bot:true},'bot');gate=new Promise(r=>release=r);
 const bot=authority.actBotAsync(0,{type:'tick'});let returned=false;const request={requestId:'return',expectedRevision:2},pending=authority.setPlayerControl(0,{away:false,bot:false},request).then(r=>{returned=true;return r;});
 await Promise.resolve();assert.equal(returned,false);assert.equal((await a.dispatch(P.command(a.snapshot(),{type:'tick'},'race'))).ok,false);await assert.rejects(control(authority,0,{away:true},'parallel'),/BUSY/);await assert.rejects(authority.suspendForTransfer(),/BUSY/);
 release();await bot;await pending;assert.equal(session.current.move,1);assert.equal(a.snapshot().playerControls[0].bot,false);assert.equal((await authority.setPlayerControl(0,{away:false,bot:false},request)).duplicate,true);assert.equal(writes.filter(x=>x.playerControls).length,3);
 const saved=writes.filter(x=>x.playerControls).at(-1);assert.deepEqual(Controls.validate(saved,session.current.players,1).playerControls,a.snapshot().playerControls);const restored=new Authority(Session.restore(E,session.export()),{...saved,sessionId:a.snapshot().sessionId});assert.equal((await restored.setPlayerControl(0,{away:false,bot:false},request)).duplicate,true);authority.dispose();restored.dispose();
});
test('room binding rejects guests, spectators, forged targets, available players and stale control requests',async()=>{
 const {authority,a}=fixture(),room={phase:'playing',transportMode:'network',ownerId:'a',participants:[{id:'a',connected:true,role:'player'},{id:'b',connected:true,role:'player'},{id:'s',connected:true,role:'spectator'}],seats:[{participantId:'a',playerIndex:0},{participantId:'b',playerIndex:1}]};
 const call=(requester,operation,extra={})=>Service.dispatch({authority,room,requester},{type:'player-control',operation,sessionId:a.snapshot().sessionId,authorityEpoch:a.snapshot().authorityEpoch,expectedRevision:a.snapshot().playerControlRevision,requestId:crypto.randomUUID(),...extra});
 await assert.rejects(call('b','bot',{target:'a'}),/READ_ONLY/);await assert.rejects(call('s','away'),/READ_ONLY/);await assert.rejects(call('a','away',{target:'b'}),/BAD_COMMAND/);await assert.rejects(call('missing','away'),/READ_ONLY/);await assert.rejects(call('a','bot',{target:'b'}),/PLAYER_AVAILABLE/);
 await call('b','away');await call('a','bot',{target:'b'});await assert.rejects(call('b','return',{expectedRevision:0}),/STALE/);await call('b','return');assert.equal(a.snapshot().playerControls[1].bot,false);authority.dispose();
});
test('control snapshots update without game moves, reject stale metadata; corrupt recovery is rejected',async()=>{
 const {authority,a}=fixture(),client=new Client({});assert(client.accept(a.snapshot()));const old=a.snapshot();await control(authority,0,{away:true});assert(client.accept(a.snapshot()));assert.equal(client.snapshot.playerControls[0].away,true);assert.equal(client.accept(old),false);
 assert.throws(()=>Controls.validate({playerControls:[{away:true,bot:false},{away:false,bot:false}]},old.state.players,0),/STATE/);assert.throws(()=>Controls.validate({playerControlRevision:1,playerControlReceipts:[]},old.state.players,0),/CONTROLS/);authority.dispose();
});
test('failed control persistence keeps old controller and resumes scheduling; permanent bots cannot be reclaimed',async()=>{
 const {authority,a}=fixture({persistence:{setPlayerControls:async()=>{throw Error('storage');}}});await assert.rejects(control(authority,0,{away:true}),/storage/);assert.equal(a.snapshot().playerControls[0].away,false);authority.dispose();
 const s=new Session(E,'temporary-bot-fixture',{players:[{name:'A'},{name:'B',bot:true}]}),b=new Authority(s);await assert.rejects(control(b,1,{bot:false}),/BAD_COMMAND/);b.dispose();
});
test('accepted human receipt survives substitution; cancelling queued bot on return prevents a late move',async()=>{
 const tasks=new Map();let sequence=0;const clock={setTimeout(fn){const id=++sequence;tasks.set(id,fn);return id;},clearTimeout:id=>tasks.delete(id)};
 const {authority,a,b}=fixture({clock});const command=P.command(a.snapshot(),{type:'tick'},'accepted-human');assert.equal(a.dispatch(command).ok,true);
 await control(authority,0,{away:true},'away');await control(authority,0,{bot:true},'bot');assert.equal(a.dispatch(command).duplicate,true);assert.equal(b.dispatch(P.command(b.snapshot(),{type:'tick'},'b-turn')).ok,true);authority.scheduleBot({delay:500});assert.equal(tasks.size,1);
 await control(authority,0,{away:false,bot:false},'return');for(const fn of tasks.values())fn();assert.equal(authority.revision,2);assert.equal(tasks.size,0);assert(a.snapshot().actions.length);authority.dispose();
});
test('temporary simultaneous planner returns after one accepted draft without draining a second command or exposing plans',async()=>{
 require('../packs/mage-brawl/rules.js');
 const session=new Session(E,'mage-brawl',{seed:12,actionsPerTurn:'2',players:[{name:'Human A'},{name:'Human B'}]}),tasks=new Map(),writes=[];let timerId=0,release;
 const gate=new Promise(resolve=>release=resolve),authority=new Authority(session,{clock:{setTimeout:(f,ms)=>{tasks.set(++timerId,{f,ms});return timerId;},clearTimeout:id=>tasks.delete(id)},persistence:{commit:async e=>{await gate;writes.push(e);},recordReceipt:async()=>{},setPlayerControls:async()=>{}}});
 try{
  await control(authority,1,{away:true},'plan-away');await control(authority,1,{bot:true},'plan-bot');authority.scheduleBot();assert.equal(tasks.size,1);const task=[...tasks.values()][0];tasks.clear();assert.equal(task.ms,0);const pending=task.f();assert(pending?.then);
  const back=control(authority,1,{away:false,bot:false},'plan-return');release();await pending;await back;
  assert.equal(writes.length,1);assert.equal(tasks.size,0);assert.equal(authority.connect(1).snapshot().playerControls[1].bot,false);assert.equal(session.current.players[1].bot,false);assert(authority.connect(1).snapshot().actions.length);
  assert(authority.connect(-1).snapshot().state.scene.arena.players.every(p=>!p.hand&&!p.plan));assert.equal(session.current.data.round,1);
 }finally{authority.dispose();}
});
