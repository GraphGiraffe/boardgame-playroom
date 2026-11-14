'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),Protocol=require('../core/protocol.js'),Client=require('../app/session-client.js');
const {GameModel}=require('../core/model-runtime.js'),D=require('../packs/mage-brawl/domain/game.js');
require('../packs/mage-brawl/rules.js');const model=new GameModel(D);
const framesData=d=>{const {frames,...rest}=d;return {...rest,frameSequence:require('../../playroom-paks/shared/domain/frame-sequence.js').encode(frames)};};
const clone=x=>JSON.parse(JSON.stringify(x)),plan=(element,action='movement',direction=0)=>({type:'plan',element,action,direction});
function fixture(spec,{size,board={},shrink=null,preset='classic',options={}}={}){
 const n=spec.length,s=clone(model.create({playerCount:n,preset,firstPlayer:0,rng:17,options:{actionsPerTurn:1,shrinkMode:'players',...options}})),d=s.data;
 if(size&&size!==d.size)delete d.startingBases; // Synthetic smaller arena has no original spawn metadata.
 d.size=size||d.size;d.board=Array(d.size*d.size).fill('ground');d.board[0]='base';d.board[d.board.length-1]='base';
 for(const [key,value] of Object.entries(board)){const [y,x]=key.split(',').map(Number);d.board[y*d.size+x]=value;}
 d.deck=['air','earth','water','fire'].flatMap((element,e)=>Array.from({length:n+1},(_,i)=>({id:'card:'+(e*(n+1)+i),element})));d.discard=[];d.shrink=shrink;
 spec.forEach((v,i)=>{Object.assign(d.players[i],{pos:v.pos,health:3,lives:d.config.teams?1:d.config.extraLives+1,maxHand:Math.max(3,v.hand?.length||0),hand:[v.element||'earth'],ultimate:0},v);d.players[i].hand=d.players[i].hand.map(element=>{const j=d.deck.findIndex(c=>c.element===element);assert(j>=0);return d.deck.splice(j,1)[0];});});
 assert(D.validate(s));return s;
}
function physicalPlan(s,id,c){if(c.type!=='plan'||c.cardId)return c;return {...c,cardId:s.data.players[id].hand.find(card=>card.element===c.element).id};}
function round(s,commands){for(const [i,c] of commands.entries())s=model.apply(s,i,physicalPlan(s,i,c)).position;return s;}
function network(n=2){const session=new Session(E,'mage-brawl',{seed:12,actionsPerTurn:'1',players:Array.from({length:n},(_,i)=>({name:'P'+i}))}),authority=new Authority(session);return {session,authority,ports:Array.from({length:n},(_,i)=>authority.connect(i))};}

test('Mage Brawl: hidden barrier, undo, no opponent plans/hands in every projection',()=>{
 let s=model.create({playerCount:3,preset:'classic',firstPlayer:0,rng:9,options:{actionsPerTurn:1}});const c=model.legalActions(s,2)[0];s=model.apply(s,2,c).position;
 assert.deepEqual(model.decisionWindow(s).ready,[2]);for(const viewer of [-1,0,1]){const p=model.project(s,viewer);assert.equal(p.data.players[2].hand,undefined);assert.equal(p.data.players[2].plan,undefined);assert.equal(p.data.seed,undefined);assert.equal(p.data.random,undefined);assert.equal(p.data.deck,undefined);assert.deepEqual(p.events,[]);}
 assert.equal(model.projectTable(s,0).actions.length,0);assert.deepEqual(model.project(s,2).data.players[2].plan,{...c,element:s.data.players[2].hand.find(card=>card.id===c.cardId).element});
 s=model.apply(s,2,{type:'unready'}).position;assert.deepEqual(model.decisionWindow(s).ready,[]);assert.equal(model.decisionWindow(s).versions[2],2);
});
test('same-speed mutual damage is pooled before life rewards',()=>{
 const s=round(fixture([{pos:[1,1],health:2},{pos:[1,2],health:2}]),[plan('earth','attack',1),plan('earth','attack',3)]);
 const impact=s.data.frames.find(f=>f.outcomes?.length);assert.deepEqual(impact.outcomes.map(o=>[o.player,o.damage,o.death,o.killers]),[[0,2,true,[1]],[1,2,true,[0]]]);
 assert.deepEqual(s.data.players.map(p=>[p.health,p.lives,p.ultimate]),[[0,1,0],[0,1,0]]);assert.equal(s.data.phase,'respawn');assert.equal(s.data.players[0].hand.length,0);
});
test('healing and damage on one speed combine before clamping',()=>{
 const s=round(fixture([{pos:[2,2],element:'water',ultimate:1},{pos:[2,3],element:'water'}]),[plan('water','ultimate',1),plan('water','attack',3)]);
 assert.equal(s.data.players[0].health,3);assert.equal(s.data.players[1].health,2);
});
test('earlier air damage cancels a later earth attack',()=>{
 const s=round(fixture([{pos:[1,1],element:'air'},{pos:[1,2],health:1}],{board:{'1,2':'air_island'}}),[plan('air','attack',1),plan('earth','attack',3)]);
 assert.equal(s.data.players[0].health,3);assert.equal(s.data.players[1].lives,1);
});
test('normal air side target moves parallel to attack direction',()=>{
 const s=round(fixture([{pos:[2,2],element:'air'},{pos:[2,1]}]),[plan('air','attack',0),plan('earth','attack',2)]);
 assert.deepEqual(s.data.players[1].pos,[1,1]);assert.deepEqual(s.data.frames.find(f=>f.motions?.some(m=>m.player===1)).motions,[{player:1,from:[2,1],to:[1,1],element:'air'}]);
});
test('shield in the middle of a train blocks every member behind it',()=>{
 const s=round(fixture([{pos:[2,0],element:'water'},{pos:[2,1]},{pos:[2,2]},{pos:[2,3]}]),[plan('water','movement',1),plan('earth','attack',1),plan('earth','movement',3),plan('earth','movement',1)]);
 assert.deepEqual(s.data.players.map(p=>p.health),[3,2,3,3]);assert.deepEqual(s.data.players.map(p=>p.pos),[[2,0],[2,1],[2,2],[2,3]]);
});
test('falling floor collapses before the following train member enters',()=>{
 const s=round(fixture([{pos:[2,0],element:'water'},{pos:[2,1]},{pos:[2,2]}],{board:{'2,2':'falling_floor'}}),[plan('water','movement',1),plan('earth','movement',0),plan('earth','movement',0)]);
 const fall=s.data.frames.flatMap(f=>f.outcomes||[]).find(o=>o.player===1);assert.deepEqual(fall,{player:1,damage:0,death:true,fall:true,at:[2,2],killers:[0]});
 assert.equal(s.data.players[1].lives,1);assert.equal(s.data.players[1].pos,null);assert.deepEqual(s.data.players[2].pos,[2,3]);assert.equal(s.data.board[2*s.data.size+2],null);
});
test('fire ultimate can explode against a wall and damage the caster',()=>{
 const s=round(fixture([{pos:[2,1],element:'fire',ultimate:1},{pos:[0,0]}],{board:{'2,2':'wall'}}),[plan('fire','ultimate',1),plan('earth','movement',0)]);
 assert.equal(s.data.players[0].health,2);
});
test('water immunity stops the stream before the player behind',()=>{
 const s=round(fixture([{pos:[2,1],element:'water',ultimate:1,health:2},{pos:[2,2]},{pos:[2,3]}],{board:{'2,2':'desert'}}),[plan('water','ultimate',1),plan('earth','movement',0),plan('earth','movement',0)]);
 assert.deepEqual(s.data.players.map(p=>p.health),[2,3,3]);
});
test('shrink retains original coordinates and removes exactly one ring',()=>{
 const s=round(fixture([{pos:[0,2]},{pos:[2,2]}],{shrink:1}),[plan('earth'),plan('earth')]);
 assert.deepEqual(s.data.frames.find(f=>f.phase==='shrink').outcomes,[{player:0,damage:0,death:true,fall:true,at:[0,2],killers:[]}]);
 assert.equal(s.data.size,4);assert.equal(s.data.inset,1);assert.equal(s.data.players[0].lives,0); // no bases remain for respawn
 assert.deepEqual(s.data.players[1].pos,[2,2]);assert.equal(s.status,'finished');assert.deepEqual(s.winners,[1]);
 const result=model.result(s);assert.deepEqual(result.places,[2,1]);assert.deepEqual(result.metrics,[{id:'survival',values:s.data.players.map(p=>p.eliminatedRound??s.data.round)},{id:'damage',maximumFractionDigits:1,values:[0,0]}]);assert(result.metrics[0].values.every(v=>v<10000));
});
test('respawn is an explicit public base selection before planning',()=>{
 const initial=model.create({playerCount:3,preset:'classic',firstPlayer:0,rng:9,options:{actionsPerTurn:1}}),homes=clone(initial.data.players.map(p=>p.pos));assert.deepEqual(initial.data.startingBases,homes);
 for(const viewer of [-1,0,1,2])assert.deepEqual(model.project(initial,viewer).data.startingBases,homes);
 const publicHomes=model.project(initial,-1).data.startingBases;assert.throws(()=>{publicHomes[0][0]=-1;},TypeError);assert.deepEqual(initial.data.startingBases,homes,'projection cannot mutate fixed colors');
 const invalid=clone(initial);invalid.data.startingBases[0]=[-1,0];assert.equal(D.validate(invalid),false);
 const legacy=clone(initial);delete legacy.data.startingBases;assert(D.validate(legacy));assert.equal(model.project(legacy,-1).data.startingBases,undefined);
 let s=round(fixture([{pos:[1,1],health:1},{pos:[1,2],health:1}]),[plan('earth','attack',1),plan('earth','attack',3)]);
 s=clone(s);s.data.startingBases=[[0,0],[s.data.size-1,s.data.size-1]];const fixed=clone(s.data.startingBases);
 const first=s.turn,available=model.legalActions(s,first);assert(available.every(c=>c.type==='respawn'));assert.equal(model.legalActions(s,1-first).length,0);
 s=model.apply(s,first,available[0]).position;assert.equal(s.data.players[first].health,3);assert.equal(s.data.players[first].hand.length,3,'no reward cards means the original limit');assert.equal(s.data.players[first].maxHand,3);assert.equal(s.data.phase,'respawn');
 s=model.apply(s,s.turn,model.legalActions(s,s.turn)[0]).position;assert.equal(s.data.phase,'planning');assert.equal(model.decisionWindow(s).participants.length,2);assert.deepEqual(s.data.startingBases,fixed);assert.deepEqual(model.project(clone(s),-1).data.startingBases,fixed);
});
test('auto profile is fixed for the match, independent per actor; bot decisions are repeatable',()=>{
 const s=model.create({playerCount:8,preset:'classic',firstPlayer:0,rng:42});assert(new Set(s.data.players.map(p=>p.bot.resolvedStrategy)).size>1);
 const before=JSON.stringify(s),a=model.botAction(s,4),b=model.botAction(s,4);assert.deepEqual(a,b);assert.equal(JSON.stringify(s),before);
 const updated=model.apply(s,1,model.legalActions(s,1)[0]).position;assert.deepEqual(model.botAction(updated,4),a);assert.deepEqual(s.data.players.map(p=>p.bot),updated.data.players.map(p=>p.bot));
});
test('all six original profiles and error extremes preserve 2–8 player simulations and restore',()=>{
 const ids=['aggressor','fighter','mind','tactician','defender','random'];
 for(const rate of [0,100])for(let n=2;n<=8;n++){
  let s=model.create({playerCount:n,preset:'classic',firstPlayer:0,rng:n*47+rate,options:{players:Array.from({length:n},(_,i)=>({botSettings:{strategy:ids[i%6],errorRate:rate}}))}});
  let count=0;while(s.status==='playing'&&s.data.round<=100){s=model.apply(s,s.turn,model.botAction(s,s.turn)).position;if(++count%20===0){s=clone(s);assert(model.validate(s));}}
  assert(s.status==='finished'||s.data.round===101,`n=${n},rate=${rate}`);assert(D.validate(s));
 }
});
test('authority accepts independent actors but retains strict global revision checks',()=>{
 const {session,authority,ports:[a,b]}=network();try{const stale=Protocol.command(a.snapshot(),a.snapshot().actions[0],'stale');assert(b.dispatch(Protocol.command(b.snapshot(),b.snapshot().actions[0],'b')).ok);assert.equal(a.dispatch(stale).code,'STALE');assert.equal(session.current.data.round,1);assert.equal(authority.connect(-1).snapshot().state.scene.arena.players[1].plan,undefined);}finally{authority.dispose();}
});
test('client safely rebases another player ready, and duplicate delivery cannot resolve twice',async()=>{
 const {session,authority,ports:[a,b]}=network();let injected=false,seq=0,calls=[];const client=new Client({snapshot:a.snapshot,dispatch(c){calls.push(c);if(!injected){injected=true;b.dispatch(Protocol.command(b.snapshot(),b.snapshot().actions[0],'b'));}return a.dispatch(c);}},{idFactory:()=>`a-${++seq}`});
 try{await client.refresh();const receipt=await client.send(client.snapshot.actions[0]);assert(receipt.ok);assert.equal(calls.length,2);assert.notEqual(calls[0].commandId,calls[1].commandId);assert.equal(session.current.data.round,2);assert(a.dispatch(calls[1]).duplicate);assert.equal(session.current.data.round,2);}finally{client.close();authority.dispose();}
});
test('client cannot rebase after its own plan version changes',async()=>{
 const {authority,ports:[a]}=network();let injected=false,seq=0;const client=new Client({snapshot:a.snapshot,dispatch(c){if(!injected){injected=true;a.dispatch(Protocol.command(a.snapshot(),a.snapshot().actions[0],'other-device'));}return a.dispatch(c);}},{idFactory:()=>`a-${++seq}`});try{await client.refresh();assert.equal((await client.send(client.snapshot.actions[0])).code,'STALE');assert.equal(seq,1);}finally{client.close();authority.dispose();}
});

test('bot configuration commits atomically, resets only gameplay readiness, and locks restored matches',()=>{
 const {RoomService}=require('../app/multiplayer.js');let id=0;const service=new RoomService({idFactory:()=>`room-${++id}`,clock:()=>1000,random:()=>.2});
 let room=service.create({name:'Битва магов',host:{id:'host',nickname:'Хост'},game:{id:'mage-brawl',name:'Битва магов',version:'0.1.0-dev.1',botSettings:E.get('mage-brawl').botSettings},rules:{preset:'classic'},constraints:{min:2,max:8},transportMode:'network'});
 room=service.setLocalSeat(room.id,'host','seat-2',{kind:'bot',nickname:'Бот'});service.setReady(room.id,'host',true);
 room=service.configureBot(room.id,'host','seat-2',{nickname:'Другой',avatar:null,botSettings:{strategy:'auto',difficulty:'medium'}});assert(room.participants.find(p=>p.id==='host').ready,'cosmetics keep readiness');
 room=service.configureBot(room.id,'host','seat-2',{nickname:'Другой',avatar:null,botSettings:{strategy:'random',difficulty:'easy'}});assert(!room.participants.find(p=>p.id==='host').ready);assert(room.participants.find(p=>p.id==='host').botSettingsNotice);assert.equal(room.participants.find(p=>p.bot).botSettings.strategy,'random');
 room=service.setBotsDifficulty(room.id,'host','hard');assert.equal(room.participants.find(p=>p.bot).botSettings.difficulty,'hard');assert.equal(room.participants.find(p=>p.bot).botSettings.strategy,'random');
 assert.throws(()=>service.setBotsDifficulty(room.id,'host','impossible'));
 const before=JSON.stringify(room);assert.throws(()=>service.configureBot(room.id,'host','seat-2',{nickname:'Invalid',botSettings:{strategy:'bad',difficulty:'easy'}}));assert.equal(JSON.stringify(service.snapshot(room.id)),before);
 assert.throws(()=>service.configureBot(room.id,'not-host','seat-2',{nickname:'No'}));
});
test('square cards share the card type frame and retain arbitrary rotation geometry',()=>{
 const C=require('../core/game-components.js'),UI=require('../core/ui.js');
 const square=C.cardFrame('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>',{shape:'square'});
 assert.match(square,/data-piece-type="card-deck"/);assert.match(square,/viewBox="0 0 100 100"/);assert.match(C.cardBack({shape:'square'}),/data-card-shape="square"/);
 assert.match(C.art({main:'x',width:100,height:100,rotation:90}),/rotate\(90\)/);
 const content=[{counters:[{id:'health',kind:'points',value:3,label:'Здоровье'},{id:'lives',kind:'points',value:2,label:'Жизни'}]}];
 assert.doesNotThrow(()=>UI.composeScene({api:3,family:'board',playerContent:content,elements:{field:'<div></div>'}},{state:{players:[{name:'A'}],turn:0,game:'fixture',data:{}},viewer:0,actions:[]}));
});

test('fixed states match the Python A/v3.0 reference before respawn and random draw',()=>{
 for(const c of require('./fixtures/mage-brawl-reference.json').cases){
  const s=round(fixture(c.players,{size:c.size,board:c.board}),c.commands),f=s.data.frames.findLast(f=>f.phase==='attack-fire'&&!f.effect);
  assert.deepEqual({players:f.players.map(({pos,health,lives,ultimate})=>({pos,health,lives,ultimate})),board:f.board},c.expected,c.name);
 }
});
test('session restore preserves hidden ready plans, respawn queue, profiles and one-time reveal',()=>{
 const session=new Session(E,'mage-brawl',{seed:93,players:[{name:'A'},{name:'B',bot:true,botSettings:{strategy:'auto',errorRate:10}}]});
 session.act(0,E.legalActions(session.current,0)[0]);
 const saved=session.export(),restored=Session.restore(E,saved);
 assert.deepEqual(restored.current,session.current);assert.deepEqual(E.botAction(restored.current,1),E.botAction(session.current,1));
 restored.act(1,E.botAction(restored.current,1));session.act(1,E.botAction(session.current,1));assert.deepEqual(restored.current,session.current);
 let s=round(fixture([{pos:[1,1],health:1},{pos:[1,2],health:1}]),[plan('earth','attack',1),plan('earth','attack',3)]);
 const again=clone(s),commands=model.legalActions(s,s.turn);assert(model.validate(again));
 assert.deepEqual(model.apply(again,again.turn,commands[0]),model.apply(s,s.turn,commands[0]));
});
test('respawn draws before survivors, then opens the next round once',()=>{
 let s=round(fixture([{pos:[1,1],health:1},{pos:[1,2]}]),[plan('earth','attack',0),plan('earth','attack',3)]);
 assert.equal(s.data.phase,'respawn');assert.equal(s.data.players[1].hand.length,0,'survivor draw waits for respawn');
 const before=clone(s);s=model.apply(s,s.turn,model.legalActions(s,s.turn)[0]).position;
 assert.equal(s.data.players[0].hand.length,3);assert.equal(s.data.players[1].hand.length,1);assert.equal(s.data.phase,'planning');assert.equal(s.data.pendingDraw,undefined);assert(model.validate(before));
});
test('fall attribution takes priority over damage sources, regardless of effect order',()=>{
 const {Batch}=require('../../playroom-paks/shared/domain/effect-batch.js');
 for(const order of [0,1]){const b=new Batch();if(order)b.damage(0,1,[2]);b.fall(0,[1]);if(!order)b.damage(0,1,[2]);b.heal(0,3);assert.deepEqual(b.outcome(0,1,3),{health:3,fall:true,sources:[1]});}
});

test('v3.1 shield blocks at the first and last member of a displacement train',()=>{
 for(let facing=0;facing<4;facing++)for(let side=0;side<4;side++){
  const v=[[-1,0],[0,1],[1,0],[0,-1]][side],shooter=[2+v[0]*2,2+v[1]*2];
  const s=round(fixture([{pos:[2,2]},{pos:shooter,element:'fire'}],{size:6}),[plan('earth','movement',facing),plan('fire','attack',(side+2)%4)]);
  assert.equal(s.data.players[0].health,side===facing?3:2,`shield ${facing}, incoming side ${side}`);
 }
 for(const shield of [1,3]){
  const s=round(fixture([{pos:[2,0],element:'water'},{pos:[2,1]},{pos:[2,2]},{pos:[2,3]}]),[plan('water','movement',1),...[1,2,3].map(id=>plan('earth',id===shield?'movement':'attack',id===shield?3:0))]);
  assert.deepEqual(s.data.players.map(p=>p.pos),[[2,0],[2,1],[2,2],[2,3]]);
  assert.deepEqual(s.data.players.map(p=>p.health),shield===1?[3,3,3,3]:[3,2,2,3]);
 }
});
test('completion: occupied bases wait, then explicit respawn becomes available when a base is freed',()=>{
 let s=round(fixture([{pos:[0,0]},{pos:[3,3]},{pos:[1,1],element:'fire'}],{size:4}),[plan('earth'),plan('earth'),plan('fire','movement',0)]);
 assert.equal(s.data.phase,'planning');assert.deepEqual(s.data.respawn,[2]);assert.equal(model.legalActions(s,2).length,0);
 // Give the first player a water card while preserving deck cardinality.
 s=clone(s);const before=s.data.players[0].hand.pop();s.data.deck.push(before);s.data.players[0].hand.push(s.data.deck.splice(s.data.deck.findIndex(c=>c.element==='water'),1)[0]);
 s=round(s,[plan('water','movement',1),plan(s.data.players[1].hand[0].element,'attack',2)]);
 assert.equal(s.data.phase,'respawn');assert.equal(s.turn,2);assert(model.legalActions(s,2).some(c=>c.pos[0]===0&&c.pos[1]===0));
});
test('completion: consecutive shrink warnings remove only one ring per completed round; final simultaneous loss is a draw',()=>{
 let s=fixture([{pos:[4,4]},{pos:[5,5]},...Array.from({length:6},()=>({pos:null,lives:0,health:0,hand:[]}))]);s.data.window={id:'round:1',participants:[0,1],ready:[],plans:{},versions:{0:0,1:0}};
 for(let i=0;i<4;i++){
  // Keep a non-moving card available without altering the total card inventory.
  s=clone(s);for(let id=0;id<2;id++)if(!s.data.players[id].hand.some(c=>c.element==='earth')){const card=s.data.players[id].hand.pop();s.data.deck.push(card);s.data.players[id].hand.push(s.data.deck.splice(s.data.deck.findIndex(c=>c.element==='earth'),1)[0]);}
  s=round(s,[plan('earth'),plan('earth')]);assert.equal(s.data.inset,i);assert.equal(s.data.size,10);
 }
 assert.equal(s.data.shrink,null);
 const draw=round(fixture([{pos:[1,1],health:1,lives:1},{pos:[1,2],health:1,lives:1}]),[plan('earth','attack',1),plan('earth','attack',3)]);assert.equal(draw.status,'finished');assert.deepEqual(draw.winners,[]);
});
test('completion: bot errors roll once, prefer a strictly worse safe meaningful alternative, and preserve a forced choice',()=>{
 const B=require('../../playroom-paks/shared/domain/bot-policy.js'),best={score:10},worse={score:5},equal={score:10},unsafe={score:0,unsafe:true},empty={score:1,empty:true};let calls=0;
 const options=rate=>({rate,random:()=>{calls++;return .1;},score:c=>c.score,safe:c=>!c.unsafe,meaningful:c=>!c.empty});
 assert.equal(B.mistake(best,[best,worse,equal,unsafe,empty],options(0)),best);assert.equal(calls,1);calls=0;
 assert.equal(B.mistake(best,[best,worse,equal,unsafe,empty],options(100)),worse);assert.equal(calls,2,'one probability and one alternative selection');
 assert.equal(B.mistake(best,[best,equal,unsafe,empty],options(100)),best);
});

test('fatal same-element damage and overkill grant each source one private choice in clockwise order',()=>{
 for(const health of [1,3])for(const lives of [2,1]){
  let s=round(fixture([{pos:[2,2],health,lives,hand:['water','fire','air']},{pos:[2,1]},{pos:[2,3]}]),[plan('water','attack',0),plan('earth','attack',1),plan('earth','attack',3)]);
  assert.equal(s.data.phase,'loot');assert.equal(s.turn,1);assert.deepEqual(s.data.loot[0].recipients,[1,2]);assert.deepEqual(s.data.players.map(p=>p.maxHand),[3,3,3],'limits wait for actual reward selection');assert.equal(s.data.players[0].ultimate,0);assert(D.validate(s));
  for(const viewer of [-1,0,1,2]){const p=model.project(s,viewer);assert.deepEqual(p.data.loot,{victim:0,player:1,count:2});assert.equal(p.data.players[0].handCount,0);assert.equal(p.data.loot.cards,undefined);assert.equal(p.data.loot.recipients,undefined);}
  assert.equal(model.projectTable(s,1).actions.length,0);assert.equal(model.legalActions(s,2).length,0);assert.throws(()=>model.apply(s,1,{type:'loot',index:99}));
  const expected=s.data.loot[0].cards[1],restored=clone(s);assert.deepEqual(model.apply(restored,1,{type:'loot',index:1}),model.apply(s,1,{type:'loot',index:1}));
  s=model.apply(s,1,{type:'loot',index:1}).position;assert.deepEqual(s.data.players[1].hand,[expected]);assert.equal(s.turn,2);assert.equal(s.data.phase,'loot');assert.equal(model.legalActions(s,1).length,0);
  s=model.apply(s,2,{type:'loot',index:0}).position;assert.equal(s.data.players[2].hand.length,lives===2?1:2);assert.equal(s.data.phase,lives===2?'respawn':'planning');assert.equal(s.data.loot,undefined);assert(D.validate(s));
  if(lives===2)s=model.apply(s,s.turn,model.legalActions(s,s.turn)[0]).position;assert.equal(s.data.phase,'planning');assert.deepEqual(s.data.players.map(p=>p.hand.length),[lives===2?3:0,2,2]);assert(D.validate(s));
 }
});

test('loot discards the remaining hand and respawn rebuilds to current limit',()=>{
 for(const cards of [['water','fire'],['water','fire','air','earth'],['water','fire','air','earth','water','fire','air','earth']]){
  let s=round(fixture([{pos:[2,2],health:3,hand:cards},{pos:[2,1]},{pos:[2,3]}]),[plan('water','attack',0),plan('earth','attack',1),plan('earth','attack',3)]);
  const remaining=[...s.data.loot[0].cards];let count=0;while(s.data.phase==='loot'){remaining.shift();s=model.apply(s,s.turn,model.legalActions(s,s.turn)[0]).position;count++;assert(D.validate(s));}assert.equal(count,Math.min(2,cards.length-1));assert.equal(s.data.loot,undefined);
  assert.equal(s.data.players[0].hand.length,0,'unclaimed cards leave the victim too');
  for(const viewer of [-1,1,2]){const p=model.project(s,viewer);assert.equal(p.data.players[0].hand,undefined);assert.equal(p.data.players[0].handCount,0);}
  const command=model.legalActions(s,s.turn)[0];assert.deepEqual(model.apply(clone(s),s.turn,command),model.apply(s,s.turn,command),'restore before respawn is deterministic');s=model.apply(s,s.turn,command).position;
  assert.equal(s.data.players[0].hand.length,Math.max(3,cards.length),'respawn refills the stored hand maximum after losing several cards');assert.equal(s.data.players[0].maxHand,Math.max(3,cards.length));
  assert(D.validate(s));
 }
 for(const lives of [2,1]){
  const s=round(fixture([{pos:[2,2],health:1,lives,element:'water'},{pos:[2,1],maxHand:5},{pos:[4,4]}]),[plan('water','attack',0),plan('earth','attack',1),plan('earth','attack',3)]);
  assert.equal(s.data.players[1].maxHand,5,'no reward card means no limit increase');assert(D.validate(s));
 }
 const cards=['fire','fire','water','water','air','air','earth','earth'];
 for(const lives of [2,1]){
  let s=round(fixture([{pos:[0,1],lives,hand:cards},{pos:[3,2]}]),[plan('fire','movement',0),plan('earth','attack',1)]);
  assert.equal(s.data.loot,undefined,'fall without a killer has no reward');
  if(lives===2){assert.equal(s.data.players[0].hand.length,0,'unclaimed cards are discarded after a fall');s=model.apply(s,s.turn,model.legalActions(s,s.turn)[0]).position;assert.equal(s.data.players[0].hand.length,8,'ordinary replacement restores the accumulated size');}
  else{assert.equal(s.data.players[0].hand.length,0,'final elimination still discards the hand');assert.equal(s.status,'finished');}assert(D.validate(s));
 }
 const s=round(fixture([{pos:[2,2],hand:['water','fire','air']},{pos:[2,1]},{pos:[2,3],element:'fire'}]),[plan('water','attack',0),plan('earth','attack',1),plan('fire','attack',3)]);
 assert.equal(s.data.phase,'loot');assert.deepEqual(s.data.loot[0].recipients,[2]);assert.equal(s.data.players[0].health,0);assert(D.validate(s));
});

test('loot authority hides remaining faces from Table and duplicate commands cannot take twice',()=>{
 const saved=new Session(E,'mage-brawl',{seed:12,actionsPerTurn:'1',players:[{name:'A'},{name:'B'},{name:'C'}]}).export();
 saved.states[0].data=fixture([{pos:[2,2],health:3,hand:['water','fire','air']},{pos:[2,1]},{pos:[2,3]}]).data;
 const session=Session.restore(E,saved),authority=new Authority(session),ports=[0,1,2].map(i=>authority.connect(i));
 try{
  [plan('water','attack',0),plan('earth','attack',1),plan('earth','attack',3)].forEach((c,i)=>session.act(i,physicalPlan(session.current,i,c)));
  assert.equal(session.current.data.phase,'loot');const shot=ports[1].snapshot(),packet=Protocol.command(shot,shot.actions[0],'loot-once');assert(ports[1].dispatch(packet).ok);
  const bytes=JSON.stringify(session.current);assert(ports[1].dispatch(packet).duplicate);assert.equal(JSON.stringify(session.current),bytes);assert.equal(ports[2].snapshot().actions.length,1);
  const pub=authority.connect(-1).snapshot();assert.equal(pub.actions.length,0);assert.deepEqual(pub.state.scene.arena.loot,{victim:0,player:2,count:1});assert.equal(pub.state.scene.arena.players[1].hand,undefined);assert.equal(pub.state.scene.arena.players[0].plan,undefined);
 }finally{authority.dispose();}
});

 test('Mage Brawl: bots prepare without turn delays',()=>{
 for(const callback of [false,true])for(const steps of [1,2]){
 const session=new Session(E,'mage-brawl',{seed:17,actionsPerTurn:String(steps),players:[{name:'Human'},...Array.from({length:7},(_,i)=>({name:'Bot'+i,bot:true}))]}),tasks=new Map(),renders=[];let id=0;
 const authority=new Authority(session,{clock:{setTimeout:(f,ms)=>{tasks.set(++id,{f,ms});return id;},clearTimeout:i=>tasks.delete(i)}});
 const run=callback?(actor,action,context)=>{authority.actBot(actor,action);renders.push(context.deferRender);if(!context.deferRender)authority.scheduleBot({delay:500,run});}:undefined;
 try{authority.scheduleBot({delay:500,run});assert.equal(tasks.size,1);const [key,task]=[...tasks][0];assert.equal(task.ms,0);tasks.delete(key);task.f();assert.equal(tasks.size,0);assert.equal(E.decisionWindow(session.current).ready.length,7);assert.equal(session.current.data.round,1);if(callback)assert.deepEqual(renders,Array.from({length:7*steps},(_,i)=>i<6*steps));const History=require('../application/history-controller.js');assert.equal(History.readyBatchEnd(session.states,1,s=>E.decisionWindow(s)),7*steps,'history shows all seven ready confirmations together');assert.equal(History.readyBatchEnd(session.states,0,s=>E.decisionWindow(s)),0,'initial history state remains available');}finally{authority.dispose();}
 }
 });


test('independent slider rules and double defaults',()=>{
 for(const steps of [1,2]){
  const s=model.create({playerCount:8,preset:'classic',rng:41,options:{actionsPerTurn:String(steps),health:'6',extraLives:'2',handLimit:'8'}});
  assert(D.validate(s));assert(s.data.players.every(p=>p.health===6&&p.lives===3&&p.hand.length===8&&p.maxHand===8));
 }
 const s=model.create({playerCount:2,preset:'classic',rng:41,options:{actionsPerTurn:'2'}});assert.equal(s.data.config.health,4);assert.equal(s.data.config.handLimit,4);
 const bad=clone(s);bad.data.config.steps=3;assert.equal(D.validate(bad),false);
});
test('two actions: private first draft, distinct copies, reset and one final draw',()=>{
 let s=model.create({playerCount:2,preset:'classic',rng:41,options:{actionsPerTurn:'2',differentActionTypes:'0'}});
 const before=clone(s),first=model.legalActions(s,0).find(c=>c.action==='attack');s=model.apply(s,0,first).position;
 assert.deepEqual(model.decisionWindow(s).ready,[]);assert.deepEqual(s.data.players[0].hand,before.data.players[0].hand);
 assert(model.legalActions(s,0).filter(c=>c.type==='plan').every(c=>c.cardId!==first.cardId));
 for(const viewer of [-1,1]){const p=model.project(s,viewer);assert.equal(p.data.players[0].draft,undefined);assert.equal(p.data.planned,undefined);}
 assert(model.project(s,0).data.planned);assert.throws(()=>model.apply(s,0,first));
 s=model.apply(s,0,{type:'unready'}).position;assert.equal(s.data.drafts[0],undefined);
 // Attack into empty space on a controlled arena, no movement or deaths.
 s=clone(s);s.data.board.fill('ground');s.data.board[0]='base';s.data.board[15]='base';s.data.players[0].pos=[0,0];s.data.players[1].pos=[3,3];
 for(const id of [0,1])for(let n=0;n<2;n++){const c=model.legalActions(s,id).find(c=>c.action==='attack'&&c.direction===(id?2:0));s=model.apply(s,id,c).position;}
 assert.equal(s.data.round,2);assert.deepEqual(s.data.players.map(p=>p.hand.length),[4,4]);assert.deepEqual(s.data.drafts,{});
 assert.deepEqual([...new Set(s.data.frames.filter(f=>f.phase.startsWith('attack')).map(f=>f.step))],[0,1]);assert(D.validate(s));
});
test('two-action bots finish games with legal private drafts and conserved cards',()=>{
 for(const n of [2,8]){let s=model.create({playerCount:n,preset:'classic',rng:12,options:{actionsPerTurn:'2',health:'2',extraLives:'1'}});
  for(let i=0;i<500&&s.status==='playing';i++){const w=model.decisionWindow(s),id=w.participants.find(id=>!w.ready.includes(id)),c=model.botAction(s,id);assert(c);s=model.apply(s,id,c).position;assert(D.validate(s));}
  assert.equal(s.status,'finished');
 }
});

test('two actions: first-step death skips second, preserves closed loot before respawn',()=>{
 let s=fixture([{pos:[1,0],hand:['fire','earth','air','water']},{pos:[1,1],health:1,hand:['earth','water','air','fire']}]);s.data.config.steps=2;s.data.config.differentActionTypes=false;
 const cs=[[{...plan('fire','attack',1),cardId:s.data.players[0].hand[0].id},{...plan('earth','movement',0),cardId:s.data.players[0].hand[1].id}],[{...plan('earth','movement',0),cardId:s.data.players[1].hand[0].id},{...plan('water','movement',2),cardId:s.data.players[1].hand[1].id}]];
 for(const id of [0,1])for(const c of cs[id])s=model.apply(s,id,c).position;
 assert.equal(s.data.phase,'loot');assert.equal(s.data.players[1].lives,1);assert.equal(s.data.players[1].health,0);assert.equal(s.data.players[0].maxHand,4);
 assert(!s.data.frames.some(f=>f.step===1&&f.effect?.actor===1));assert.deepEqual(s.data.drafts,{});assert(D.validate(s));
 assert.equal(model.project(s,-1).data.players[1].hand,undefined);assert.deepEqual(model.legalActions(s,0),[{type:'loot',index:0},{type:'loot',index:1}]);
 s=model.apply(s,0,{type:'loot',index:0}).position;assert.equal(s.data.phase,'respawn');
 s=model.apply(s,1,model.legalActions(s,1)[0]).position;assert.equal(s.data.phase,'planning');assert.equal(s.data.players[1].hand.length,4);assert.equal(s.data.players[0].hand.length,5);assert(D.validate(s));
});

 test('different action types: optional, authoritative, reset and ultimate',()=>{
 for(const enabled of ['0','1'])for(const action of ['movement','attack','ultimate']){
  let s=model.create({playerCount:2,preset:'classic',rng:41,options:{actionsPerTurn:'2',differentActionTypes:enabled}});s=clone(s);s.data.players[0].ultimate=2;
  const first=model.legalActions(s,0).find(c=>c.action===action);s=model.apply(s,0,first).position;
  const second=model.legalActions(s,0).filter(c=>c.type==='plan');assert(second.length);
  assert.equal(second.some(c=>c.action===action),enabled==='0');
  if(enabled==='1'){assert.throws(()=>model.apply(s,0,{...first,cardId:second[0].cardId,element:second[0].element}));assert(second.every(c=>c.action!==action));}
  const bot=model.botAction(s,0);assert(second.some(c=>JSON.stringify(c)===JSON.stringify(bot)));assert(D.validate(model.apply(s,0,bot).position));
  s=model.apply(s,0,{type:'unready'}).position;assert(model.legalActions(s,0).some(c=>c.action===action));
 }
 const single=model.create({playerCount:2,preset:'classic',rng:41,options:{differentActionTypes:'1'}});assert(model.legalActions(single,0).some(c=>c.action==='movement'));assert(model.legalActions(single,0).some(c=>c.action==='attack'));
 });

 test('unspent ultimates transfer on every death, accumulate and split clockwise',()=>{
 for(const lives of [1,2]){
 const s=round(fixture([{pos:[2,2],health:1,lives,ultimate:5,element:'water'},{pos:[2,1],ultimate:2},{pos:[2,3],ultimate:1}]),[plan('water','attack',0),plan('earth','attack',1),plan('earth','attack',3)]);
 assert.deepEqual(s.data.players.map(p=>p.ultimate),[0,5,3]);assert(D.validate(s));
 }
 const s=round(fixture([{pos:[1,1],health:1,ultimate:3,element:'fire'},{pos:[1,2],ultimate:2}]),[plan('fire','ultimate',0),plan('earth','attack',3)]);
 assert.deepEqual(s.data.players.map(p=>p.ultimate),[0,5],'slower ultimate was not spent before death');assert(D.validate(s));
 });

test('projectile presentation endpoints: misses leave arena, walls and targets stop flight',()=>{
 for(const [element,action] of [['fire','attack'],['earth','ultimate']])for(const stop of ['miss','wall','player']){
  const s=round(fixture([{pos:[2,1],element,ultimate:1},{pos:stop==='player'?[2,3]:[0,0]}],{board:stop==='wall'?{'2,3':'wall'}:{}}),[plan(element,action,1),plan('earth','movement',0)]);
  const fx=s.data.frames.find(f=>f.effect?.actor===0)?.effect;
  assert.deepEqual(fx.projectile,{end:[2,stop==='miss'?s.data.size+1:3],miss:stop==='miss'});
 }
});

 test('physical cards retain identity across order changes and never leak through public effects',()=>{
 let s=fixture([{pos:[1,1],hand:['earth','earth','fire']},{pos:[3,3]}]);
 const original=s.data.players[0].hand.map(c=>c.id),chosen=model.legalActions(s,0).find(c=>c.cardId===original[1]&&c.action==='attack'&&c.direction===0);
 s.data.players[0].hand.reverse();assert(D.validate(s));
 s=model.apply(s,0,chosen).position;s=model.apply(s,1,model.legalActions(s,1).find(c=>c.action==='attack'&&c.direction===2)).position;
 assert(s.data.players[0].hand.some(c=>c.id===original[0]));
 const publicData=model.project(s,-1);assert.doesNotMatch(JSON.stringify(publicData),/cardId|card:\d+/);
 const bad=clone(s);bad.data.deck[0]=clone(bad.data.players[0].hand[0]);assert.equal(D.validate(bad),false);
 assert.throws(()=>model.apply(s,0,{...model.legalActions(s,0)[0],cardId:'card:unknown'}));
 });

test('durable simultaneous bots persist without intermediate readiness broadcasts or timers',async()=>{
 const session=new Session(E,'mage-brawl',{seed:12,actionsPerTurn:'1',players:[{name:'Human'},...Array.from({length:3},(_,i)=>({name:'Bot'+i,bot:true}))]}),timers=new Map(),writes=[],seen=[];let timerId=0;
 const authority=new Authority(session,{clock:{setTimeout:(f,ms)=>{timers.set(++timerId,{f,ms});return timerId;},clearTimeout:id=>timers.delete(id)},persistence:{async commit(entry){writes.push(entry);},async recordReceipt(){}}});
 try{
  authority.connect(-1).subscribe(snapshot=>seen.push(snapshot));
  authority.scheduleBot();assert.equal(timers.size,1);const task=[...timers.values()][0];timers.clear();assert.equal(task.ms,0);await task.f();
  assert.equal(seen.length,1);assert.deepEqual(E.decisionWindow(session.current).ready,[1,2,3]);
  assert.equal(writes.length,3);assert.equal(timers.size,0);assert.equal(session.current.data.round,1);
  for(const snapshot of seen)assert(snapshot.state.scene.arena.players.every(p=>!p.hand&&!p.plan));
 }finally{authority.dispose();}
});

test('failed durable bot batch exposes committed readiness and stops without retry timers',async()=>{
 const session=new Session(E,'mage-brawl',{seed:12,actionsPerTurn:'1',players:[{name:'Human'},{name:'Bot1',bot:true},{name:'Bot2',bot:true}]}),timers=new Map(),seen=[],errors=[];let timerId=0,writes=0;
 const authority=new Authority(session,{clock:{setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id)},persistence:{async commit(){if(++writes===2)throw Error('disk full');},async recordReceipt(){}}});
 try{
  authority.connect(-1).subscribe(snapshot=>seen.push(snapshot));authority.scheduleBot({onError:error=>errors.push(error)});
  const task=[...timers.values()][0];timers.clear();await task();
  assert.equal(errors.length,1);assert.equal(seen.length,1);assert.deepEqual(E.decisionWindow(session.current).ready,[1]);
  assert.equal(session.current.move,1);assert.equal(timers.size,0);
 }finally{authority.dispose();}
});

test('decision window copies plans, exports only participant versions and rejects ambiguous membership',()=>{
 const W=require('../../playroom-paks/shared/domain/decision-window.js');
 const w=W.create('round:1',[0,2]),plan={type:'plan',cardId:'private-card'};W.put(w,2,plan);plan.cardId='changed';
 assert.equal(w.plans[2].cardId,'private-card');w.versions.secret='private-card';
 assert.deepEqual(W.describe(w),{id:'round:1',participants:[0,2],ready:[2],versions:{0:0,2:1}});
 assert.throws(()=>W.create('round:1',[0,0]),/DECISION_WINDOW_INVALID/);
 assert.deepEqual(W.describe(W.create('round:1',[])).participants,[]);
 const before=JSON.stringify(w);assert.throws(()=>W.put(w,1,plan),/DECISION_ACTOR_INVALID/);assert.equal(JSON.stringify(w),before);
 const cycle={};cycle.self=cycle;assert.throws(()=>W.put(w,0,cycle));assert.equal(JSON.stringify(w),before);
});

test('public phase plan distinguishes damage, fall, death and killer without private plans',()=>{
 const P=require('../../playroom-paks/packs/mage-brawl/presentation/scene.js');
 const player={pos:[0,0],health:0,lives:1,maxHand:3,kills:0,ultimate:0,handCount:3,hand:[{id:'private'}]};
 const frame={phase:'attack-fire',board:['floor'],players:[player],outcomes:[{player:0,damage:2,death:true,fall:true,at:[0,0],killers:[1]}]};
 const plan=P.presentationPlan(framesData({round:2,board:['floor'],players:[player],draft:'private',frames:[{...frame,phase:'start',outcomes:[]},frame]}));
 assert.deepEqual(plan.groups.flatMap(g=>g.cues.map(c=>c.kind)),['damage','fall','death','kill']);
 assert.equal(plan.groups.at(-1).cues.at(-1).target.entity.id,'1');
 assert(!JSON.stringify(plan.scenes[plan.final]).includes('private'));
});

test('public turn overview groups every announced card before each step at twice phase duration',()=>{
 const P=require('../../playroom-paks/packs/mage-brawl/presentation/scene.js');
 const players=Array.from({length:8},()=>({pos:[0,0],health:4,lives:2,maxHand:4,kills:0,ultimate:0,handCount:4})),state={board:['ground'],players,inset:0};
 const choices=Object.fromEntries(players.map((_,i)=>[i,{element:['air','earth','water','fire'][i%4],action:i<4?'movement':'attack',direction:i%4}]));
 const frames=[{...state,phase:'start'}];
 for(let step=0;step<2;step++){
  frames.push({...state,phase:'reveal-actions',step,plans:choices});
  for(const [actor,c]of Object.entries(choices))frames.push({...state,phase:c.action+'-'+c.element,step,effect:{actor:Number(actor),...c,origin:[0,0],cells:[]}});
 }
 const plan=P.presentationPlan(framesData({...state,round:8,frames})),overviews=plan.scenes.filter(s=>s.kind==='turn-reveal');
 assert.equal(overviews.length,2);assert.deepEqual(overviews.map(s=>[s.round,s.step]),[[7,0],[7,1]]);
 assert.deepEqual(overviews[0].phases.map(p=>p.phase),['movement-air','movement-earth','movement-water','movement-fire','attack-air','attack-earth','attack-water','attack-fire']);
 assert.deepEqual(overviews[0].phases.flatMap(p=>p.cards.map(c=>c.actor)),[0,1,2,3,4,5,6,7]);
 assert.equal(plan.scenes[0],overviews[0]);assert(plan.groups.length>32&&plan.groups.length<=64,'maximal eight-player plan stays within the bounded SDK');
 assert.doesNotThrow(()=>require('../core/game-components.js').publicFrames({plan,frames:plan.scenes.slice(0,plan.final).map(()=>({markup:'<div></div>',label:'public'})),live:'<div></div>',label:'live',lazy:true}));
 for(const overview of overviews){const duration=plan.groups.find(g=>plan.scenes[g.scene]===overview).duration;assert.equal(duration,2*plan.groups.find(g=>plan.scenes[g.scene].kind==='reveal').duration);assert(!JSON.stringify(overview.phases).includes('cardId'));}
 const second=plan.scenes.indexOf(overviews[1]);assert(plan.scenes.slice(0,second).filter(s=>s.kind==='effects').every(s=>s.step===0));assert(plan.scenes.slice(second).filter(s=>s.kind==='effects').every(s=>s.step===1));
});


test('respawn lottery is fresh per stage, stable between choices and replayable',()=>{
 const permutations=new Set();
 for(let seed=1;seed<=12;seed++){
  const initial=fixture([{pos:[1,1],health:1},{pos:[1,2],health:1},{pos:[3,1],health:1},{pos:[3,2],health:1}],{board:{'0,5':'base','5,0':'base'}});
  initial.data.random=seed;
  const commands=[plan('earth','attack',1),plan('earth','attack',3),plan('earth','attack',1),plan('earth','attack',3)];
  let s=round(initial,commands);const queue=[...s.data.respawn];
  assert.equal(s.data.phase,'respawn');assert.deepEqual([...queue].sort(),[0,1,2,3]);permutations.add(queue.join(','));
  assert.deepEqual(round(clone(initial),commands).data.respawn,queue,'same RNG and commands replay the lottery');
  const prior=clone(initial);prior.data.respawn=[3,2,1,0];prior.data.first=2;
  assert.deepEqual(round(prior,commands).data.respawn,queue,'a prior stage queue and seating priority do not carry forward');
  for(let i=0;i<queue.length;i++){
   assert.equal(s.turn,queue[i]);assert.deepEqual(model.decisionWindow(s).participants,[queue[i]]);
   const actor=s.turn,command=model.legalActions(s,actor)[0],restored=clone(s);
   s=model.apply(s,actor,command).position;
   assert.deepEqual(model.apply(restored,actor,command).position,s,'restore does not redraw the queue');
   assert.deepEqual(s.data.respawn,queue.slice(i+1));assert(D.validate(s));
  }
  assert.equal(s.data.phase,'planning');
 }
 assert(permutations.size>1,'different stage RNG produces different orders');
});

test('fire ultimate: protected impact still bursts, adjacent shields face the explosion',()=>{
 for(const protection of ['shield','puddle']){
  const s=round(fixture([{pos:[2,0],element:'fire',ultimate:1},{pos:[2,2]},{pos:[1,2]},{pos:[3,2]},{pos:[2,4]}],{board:protection==='puddle'?{'2,2':'puddle'}:{}}),[
   plan('fire','ultimate',1),plan('earth','movement',protection==='shield'?3:0),plan('earth','movement',2),plan('earth','movement',2),plan('earth','movement',0)]);
  assert.deepEqual(s.data.players.map(p=>p.health),[3,3,3,2,3]);
  const fx=s.data.frames.find(f=>f.effect?.actor===0)?.effect;
  assert.deepEqual(fx.burst,{origin:[2,2],cells:[[1,2],[2,3],[3,2],[2,1]]});
  const P=require('../../playroom-paks/packs/mage-brawl/presentation/scene.js'),p=P.presentationPlan(framesData(s.data));
  const stages=p.scenes.filter(f=>f.kind==='effects'&&f.phase==='attack-fire');
  assert.equal(stages.length,3);
  assert.deepEqual(stages[0].effects[0].origin,[2,0]);assert.deepEqual(stages[0].effects[0].projectile.end,[2,2]);
  assert.deepEqual(stages[1].effects[0].origin,[2,2]);assert.equal(stages[1].effects[0].projectile,null);
  assert.deepEqual(stages.slice(0,2).map(f=>f.state.players[3].health),[3,3],'damage follows both flights');
  assert.equal(stages[2].state.players[3].health,2);assert.equal(stages[2].effects.length,0);
  const groups=p.groups.filter(g=>stages.includes(p.scenes[g.scene]));
  assert(groups.slice(0,2).every(g=>g.cues.every(c=>c.kind==='attack')));assert(groups[2].cues.some(c=>c.kind==='damage'));
 }
});
test('fire ultimate: wall bursts once, misses never burst, tile vulnerability still applies',()=>{
 for(const stop of ['wall','miss']){
  const s=round(fixture([{pos:[2,1],element:'fire',ultimate:1},{pos:[0,0]}],{board:stop==='wall'?{'2,2':'wall'}:{}}),[plan('fire','ultimate',1),plan('earth')]);
  const fx=s.data.frames.find(f=>f.effect?.actor===0)?.effect;
  assert.equal(!!fx.burst,stop==='wall');assert.equal(s.data.players[0].health,stop==='wall'?2:3);
 }
 const s=round(fixture([{pos:[2,0],element:'fire',ultimate:1},{pos:[2,2]},{pos:[3,2]}],{board:{'2,2':'puddle','3,2':'forest'}}),[plan('fire','ultimate',1),plan('earth'),plan('earth','movement',2)]);
 assert.deepEqual(s.data.players.map(p=>p.health),[3,3,1]);
});


test('crown is awarded only on actual respawn, including death without a killer',()=>{
 let s=round(fixture([{pos:[0,1],element:'fire',ultimate:2},{pos:[2,2]}]),[plan('fire','movement',0),plan('earth')]);
 assert.equal(s.data.phase,'respawn');assert.equal(s.data.players[0].ultimate,0,'death removes old crowns even without a killer');
 const cmd=model.legalActions(s,0)[0];s=model.apply(s,0,cmd).position;
 assert.equal(s.data.players[0].ultimate,1,'successful base selection grants exactly one');
 let killed=round(fixture([{pos:[1,1],health:1,ultimate:2},{pos:[1,2]}]),[plan('earth','movement',0),plan('earth','attack',3)]);
 assert.equal(killed.data.players[0].ultimate,0);assert.equal(killed.data.players[1].ultimate,2);
 killed=model.apply(killed,0,model.legalActions(killed,0)[0]).position;
 assert.equal(killed.data.players[0].ultimate,1);assert.equal(killed.data.players[1].ultimate,2);
});


test('loot increases hand limit only for actual card recipients, kills and crowns remain independent',()=>{
 for(const spare of [0,1,2]){
  let s=round(fixture([{pos:[2,2],health:1,ultimate:3,hand:['water',...['fire','air'].slice(0,spare)]},{pos:[2,1]},{pos:[2,3]}]),[plan('water','attack',0),plan('earth','attack',1),plan('earth','attack',3)]);
  assert.deepEqual(s.data.players.map(p=>p.maxHand),[3,3,3],'no limit increase before taking a card');
  assert.deepEqual(model.project(s,-1).data.players.map(p=>p.kills),[0,1,1]);
  assert.deepEqual(s.data.players.map(p=>p.ultimate),[0,2,1],'crowns split even with no reward cards');
  for(let i=0;i<spare;i++){
   const actor=s.turn,command={type:'loot',index:0},before=clone(s);
   s=model.apply(s,actor,command).position;
   assert.deepEqual(model.apply(before,actor,command).position,s,'replay grants the same single increment');
   assert.equal(s.data.players[actor].maxHand,4);
   assert.throws(()=>model.apply(s,actor,command),'cannot claim the same reward twice');
  }
  assert.deepEqual(s.data.players.map(p=>p.maxHand),[3,spare>0?4:3,spare>1?4:3]);
  assert.equal(s.data.phase,'respawn');assert(D.validate(s));
 }
});


test('respawn discards excess hand and draws only to the earned limit',()=>{
 let s=fixture([{pos:[0,1],hand:['fire','water','air','earth','fire','water'],maxHand:4},{pos:[3,2]}]);
 s=round(s,[plan('fire','movement',0),plan('earth')]);
 assert.equal(s.data.players[0].hand.length,0);
 s=model.apply(s,s.turn,model.legalActions(s,s.turn)[0]).position;
 assert.equal(s.data.players[0].hand.length,4);assert.equal(s.data.players[0].maxHand,4);assert(D.validate(s));
});


test('damage result tracks attacks, pushed falls and spikes without a live metric',()=>{
 const P=require('../../playroom-paks/packs/mage-brawl/presentation/scene.js');
 for(const health of [1,3]){
  const s=round(fixture([{pos:[2,1],element:'air'},{pos:[2,2],health,lives:1,ultimate:4}],{size:4,board:{'2,3':null}}),[plan('air','attack',1),plan('earth','movement',0)]);
  assert.equal(s.data.players[0].damageDealt,health);assert.equal(s.data.players[0].kills,1);
  assert.equal(s.data.players[1].ultimate,0);assert.equal(s.data.players[0].ultimate,4);
  assert.deepEqual(model.result(s).metrics.find(m=>m.id==='damage').values,[health,0]);
  assert.equal(P.metric('damage').key,'mage-brawl.metric.damage');
  assert(!P.playerMetrics(model.project(s,0).data.players[0]).some(m=>m.id==='damage'));assert(D.validate(s));
 }
 const spikes=round(fixture([{pos:[2,1],element:'air'},{pos:[2,2],health:1}],{board:{'2,3':'spikes'}}),[plan('air','attack',1),plan('earth','movement',0)]);
 assert.equal(spikes.data.players[0].damageDealt,1);assert.equal(spikes.data.players[0].kills,1);
 const attack=round(fixture([{pos:[2,1]},{pos:[2,2],element:'water'}]),[plan('earth','attack',1),plan('water','attack',0)]);
 assert.equal(attack.data.players[0].damageDealt,2);
 const shield=round(fixture([{pos:[2,1],element:'fire'},{pos:[2,2]}]),[plan('fire','attack',1),plan('earth','movement',3)]);
 assert.equal(shield.data.players[0].damageDealt,0);
});


test('shared push damage splits evenly while each pusher receives a kill',()=>{
 for(const health of [1,3]){
  const s=round(fixture([{pos:[2,1],element:'air'},{pos:[1,2],element:'air'},{pos:[2,2],element:'water',health}],{board:{'3,3':null}}),[plan('air','attack',1),plan('air','attack',2),plan('water','attack',0)]);
  assert.deepEqual(s.data.players.map(p=>p.damageDealt),[health/2,health/2,0]);
  assert.deepEqual(s.data.players.map(p=>p.kills),[1,1,0]);assert(D.validate(s));
  const metric=D.result(s).metrics.find(m=>m.id==='damage');assert.equal(metric.maximumFractionDigits,1);
  assert.deepEqual(metric.values,[health/2,health/2,0]);
 }
});

test('simultaneous movement cancels shared destinations and permits swaps independently of first seat',()=>{
 for(const first of [0,1]){
  let s=fixture([{pos:[3,1],element:'air'},{pos:[1,1],element:'air'}]);s.data.first=first;
  s=round(s,[plan('air','movement',0),plan('air','movement',1)]);
  assert.deepEqual(s.data.players.map(p=>p.pos),[[3,1],[1,1]]);assert.deepEqual(s.data.players.map(p=>p.health),[3,3]);
  s=fixture([{pos:[2,1],element:'air'},{pos:[1,2],element:'air'}]);s.data.first=first;
  s=round(s,[plan('air','movement',0),plan('air','movement',2)]);
  assert.deepEqual(s.data.players.map(p=>p.pos),[[1,2],[2,1]]);assert(D.validate(s));
 }
});


test('engine finishes a mage match with fractional damage and restores the result',()=>{
 const s=E.createGame('mage-brawl',{seed:19,players:[{name:'A'},{name:'B'}]});
 const loser=s.data.players[1];s.data.discard.push(...loser.hand);Object.assign(loser,{hand:[],health:0,lives:0,pos:null,ultimate:0,eliminatedRound:1});s.data.players[0].damageDealt=1.5;
 E.complete(s,0);assert.deepEqual(s.result.details,[1.5,0]);assert(E.validateState(E.clone(s)));
});

test('Mage round presentation owns its audio while respawn retains ordinary feedback',()=>{
 const session=new Session(E,'mage-brawl',{seed:17,actionsPerTurn:'2',players:Array.from({length:8},(_,i)=>({name:'P'+i}))});let resolved=0,respawn=0;
 for(let n=0;n<100&&(resolved<2||respawn===0);n++){
  const before=session.current,window=E.decisionWindow(before),actor=window?.participants.find(i=>!window.ready.includes(i))??before.turn,command=E.legalActions(before,actor).find(c=>c.type!=='unready');assert(command);
  session.act(actor,command);const cues=E.soundCues(session.current,0,before.events.at(-1)?.id||0);
  if(session.current.data.round!==before.data.round){resolved++;assert(E.project(session.current,0).scene.plan.final>0);assert.deepEqual(cues,[],'no extra generic move before the authored reveal/movement sequence');}
  if(command.type==='respawn'){respawn++;assert.deepEqual(cues.map(c=>c.id),['move']);}
 }
 assert.equal(resolved,2);assert(respawn>0);
});


test('final kill settles the first remaining card, conserves inventory and opens results without a loot decision',()=>{
 const before=fixture([{pos:[1,1],hand:['earth','air','water']},{pos:[1,2],health:1,lives:1,hand:['fire','water','air']}]);
 const first=before.data.players[1].hand[1];
 const s=round(before,[plan('earth','attack',1),plan('fire','attack',2)]);
 assert.equal(s.status,'finished');assert.deepEqual(s.winners,[0]);assert.equal(s.data.loot,undefined);assert.equal(s.data.phase,'planning');assert.equal(model.decisionWindow(s),null);assert.deepEqual(model.legalActions(s,0),[]);
 assert(s.data.players[0].hand.some(c=>c.id===first.id));assert.equal(s.data.players[0].maxHand,4);assert(!s.events?.some(e=>e.type==='mage-brawl.loot'));assert(D.validate(s));assert.deepEqual(model.result(clone(s)),model.result(s));
});
test('additional lives are 0–2; unique team sizes receive reversed reserves and stay public',()=>{
 for(const n of [2,3,4,5,8])for(const extraLives of [0,1,2]){
  const s=model.create({playerCount:n,preset:'teams',rng:21,options:{extraLives}});assert(D.validate(s));assert.deepEqual(s.data.teamLives,[Math.floor(n/2)*extraLives,Math.ceil(n/2)*extraLives]);assert.deepEqual(s.data.players.map(p=>p.team),Array.from({length:n},(_,i)=>i%2));assert(s.data.players.every(p=>p.lives===1));
  for(const viewer of [-1,0,n-1]){const p=model.project(s,viewer);assert.deepEqual(p.data.teamLives,s.data.teamLives);assert(p.data.players.every((v,i)=>i===viewer||v.hand===undefined));}
 }
 for(const value of [-1,3,1.5])assert.throws(()=>model.create({playerCount:3,preset:'classic',rng:1,options:{extraLives:value}}));
 const s=model.create({playerCount:2,preset:'classic',rng:1,options:{extraLives:0}});assert(s.data.players.every(p=>p.lives===1));
});
test('friendly fire consumes a shared team token and exhausted teams lose collectively',()=>{
 let s=round(fixture([{pos:[1,1]},{pos:[4,4]},{pos:[1,2],health:1},{pos:[4,1]}],{preset:'teams'}),[plan('earth','attack',1),plan('earth'),plan('earth','attack',2),plan('earth')]);
 assert.deepEqual(s.data.teamLives,[1,2]);assert.equal(s.data.players[2].lives,1);assert.equal(s.data.players[2].pos,null);assert.equal(s.data.lostLives,1);assert.equal(s.status,'playing');assert(D.validate(s));
 s=fixture([{pos:[1,1]},{pos:[1,2],health:1},{pos:[4,4]},{pos:null,health:0,lives:0,hand:[]}],{preset:'teams',options:{extraLives:0}});s.data.window.participants=[0,1,2];
 s=round(s,[plan('earth','attack',1),plan('earth','attack',2),plan('earth')]);assert.equal(s.status,'finished');assert.deepEqual(s.winners,[0,2]);assert.deepEqual(model.result(s).places,[1,2,1,2]);assert(D.validate(s));
});
function shieldRound(s){
 s=clone(s);
 const d=s.data;assert(!d.loot);d.deck.push(...d.discard,...d.players.flatMap(p=>p.hand));d.discard=[];for(const p of d.players){p.hand=[];if(p.pos)p.hand.push(d.deck.splice(d.deck.findIndex(c=>c.element==='earth'),1)[0]);}
 for(const id of [...s.data.window.participants])s=model.apply(s,id,physicalPlan(s,id,plan('earth'))).position;
 return s;
}
test('life shrink carries overflow, gives a full warning round and removes at most one ring each round',()=>{
 let s=model.create({playerCount:8,preset:'teams',rng:21,options:{actionsPerTurn:1,extraLives:1,shrinkMode:'lives'}});s=clone(s);s.data.board.fill('ground');s.data.board[44]='base';s.data.players.forEach((p,i)=>p.pos=[3+Math.floor(i/4),3+i%4]);s.data.lostLives=9;
 s=shieldRound(s);assert.equal(s.data.inset,0);assert.equal(s.data.shrink,2);assert.deepEqual(model.project(s,0).data.shrinkCounter,{filled:4,capacity:4,scheduled:true,mode:'lives'});
 s=shieldRound(s);assert.equal(s.data.inset,1);assert.equal(s.data.shrinkSpent,4);assert.equal(s.data.shrink,3);
 s=shieldRound(s);assert.equal(s.data.inset,2);assert.equal(s.data.shrinkSpent,8);assert.equal(s.data.shrink,null);assert.deepEqual(model.project(s,0).data.shrinkCounter,{filled:1,capacity:4,scheduled:false,mode:'lives'});assert(D.validate(s));
});
test('odd life shrink starts half full; both final deaths and respawns count',()=>{
 let s=model.create({playerCount:5,preset:'classic',rng:21,options:{actionsPerTurn:1,shrinkMode:'lives'}});assert.equal(model.project(s,0).data.shrinkCounter.filled,2);
 s=round(fixture([{pos:[1,1],health:1,lives:1},{pos:[1,2],health:1},{pos:[4,4]}],{options:{shrinkMode:'lives'}}),[plan('earth','attack',1),plan('earth','attack',3),plan('earth')]);assert.equal(s.data.lostLives,2);assert.equal(model.project(s,2).data.shrinkCounter.filled,4);assert(D.validate(s));
});


test('life shrink defaults to 2/4/6 losses and odd counts begin half filled for every extra-life setting',()=>{
 for(const extraLives of [0,1,2])for(const n of [5,6]){
  let s=model.create({playerCount:n,preset:'classic',rng:21,options:{actionsPerTurn:1,extraLives}});assert.equal(s.data.config.shrinkMode,'lives');
  const capacity=2*(extraLives+1),offset=n%2?capacity/2:0;assert.deepEqual(model.project(s,0).data.shrinkCounter,{capacity,filled:offset,scheduled:false,mode:'lives'});
  s=clone(s);s.data.board.fill('ground');s.data.board[27]='base';s.data.players.forEach((p,i)=>p.pos=[2+Math.floor(i/3),2+i%3]);s.data.lostLives=capacity-offset-1;
  s=shieldRound(s);assert.equal(s.data.shrink,null);s=clone(s);s.data.lostLives++;s=shieldRound(s);assert.equal(s.data.shrink,s.data.round);assert.equal(model.project(s,0).data.shrinkCounter.filled,capacity);assert(D.validate(s));
 }
});


test('team bots finish odd and even games with shared respawns, deterministic restore and public projections',()=>{
 for(const n of [3,4,5]){
  let s=model.create({playerCount:n,preset:'teams',rng:31+n,options:{actionsPerTurn:1,health:1,extraLives:2,players:Array.from({length:n},()=>({botSettings:{difficulty:'hard',strategy:'fighter',errorRate:0}}))}});
  for(let i=0;i<1000&&s.status==='playing';i++){
   const w=model.decisionWindow(s),id=w.participants.find(id=>!w.ready.includes(id)),c=model.botAction(s,id);assert(c);
   if(i%23===0){assert.deepEqual(model.apply(clone(s),id,c),model.apply(s,id,c));const p=model.project(s,-1);assert(p.data.players.every(v=>v.hand===undefined));}
   s=model.apply(s,id,c).position;assert(D.validate(s));
  }
  assert.equal(s.status,'finished');assert(s.winners.length===0||new Set(s.winners.map(i=>s.data.players[i].team)).size===1);assert.deepEqual(model.result(clone(s)),model.result(s));
 }
});


test('2/3/4-team setup reverses distinct pool sizes and respects physical room seats',()=>{
 const cases=[{preset:'teams',seats:[0,1,2,4,6],expected:[1,4]},{preset:'teams3',seats:[0,1,2,3,4,6],expected:[1,2,3]},{preset:'teams4',seats:[0,1,2,4],expected:[1,2,2,0]},{preset:'teams4',seats:[0,1,2,3,4,5,6,7],expected:[2,2,2,2]}];
 const layouts={teams:[0,1,0,1,0,1,0,1],teams3:[0,1,0,1,0,1,2,2,2],teams4:[0,1,0,1,2,3,2,3]};
 const manifest=require('../packs/mage-brawl/manifest.json');
 for(const [preset,layout] of Object.entries(layouts)){
  assert.deepEqual(manifest.teamLayouts[preset].seatTeams,layout.map(i=>['blue','red','cyan','brown'][i]));
  const full=model.create({playerCount:8,preset,rng:1,options:{extraLives:1}});assert.deepEqual(full.data.players.map(p=>p.team),layout.slice(0,8));assert(D.validate(full));
 }
 for(const {preset,seats,expected} of cases)for(const extraLives of [0,1,2]){
  const s=model.create({playerCount:seats.length,preset,rng:13,options:{extraLives,seatIndices:seats}}),count=s.data.config.teamCount;
  assert.deepEqual(s.data.teamLives,expected.map(n=>n*extraLives));assert.deepEqual(s.data.players.map(p=>p.team),seats.map(n=>layouts[preset][n]));assert(D.validate(s));
  for(const viewer of [-1,0,seats.length-1]){const p=model.project(s,viewer);assert.deepEqual(p.data.teamLives,s.data.teamLives);assert(p.data.players.every((v,i)=>i===viewer||v.hand===undefined));}
  const bad=clone(s);bad.data.teamLives[0]=Math.max(...s.data.teamLives)+1;assert.equal(D.validate(bad),false);
 }
 assert.throws(()=>model.create({playerCount:3,preset:'teams3',rng:1,options:{seatIndices:[0,2,4]}}));
 assert.throws(()=>model.create({playerCount:4,preset:'teams4',rng:1,options:{seatIndices:[0,1,1,3]}}));
});

test('multi-team results keep team places and order teammates by personal survival',()=>{
 const s=fixture([{pos:null,health:0,lives:0,hand:[],eliminatedRound:5},{pos:null,health:0,lives:0,hand:[],eliminatedRound:3},{pos:null,health:0,lives:0,hand:[],eliminatedRound:9},{pos:null,health:0,lives:0,hand:[],eliminatedRound:7},{pos:[3,3],health:3,lives:1},{pos:null,health:0,lives:0,hand:[],eliminatedRound:8}],{preset:'teams3',options:{extraLives:0,seatIndices:[0,1,6,2,3,7]}});
 s.data.round=10;s.status='finished';s.winners=[1,4];const result=model.result(s);
 assert.deepEqual(result.places,[3,1,2,3,1,2]);assert.deepEqual(result.playerOrder,[4,1,2,5,3,0]);
});

test('three and four team bots complete games with restored deterministic authority',()=>{
 for(const count of [3,4])for(const n of [count,8]){
  let s=model.create({playerCount:n,preset:'teams'+count,rng:71+n,options:{actionsPerTurn:1,health:1,extraLives:1,players:Array.from({length:n},()=>({botSettings:{difficulty:'hard',strategy:'fighter',errorRate:0}}))}});
  for(let i=0;i<2400&&s.status==='playing';i++){const w=model.decisionWindow(s),id=w.participants.find(id=>!w.ready.includes(id)),command=model.botAction(s,id);assert(command);if(i%31===0)assert.deepEqual(model.apply(clone(s),id,command),model.apply(s,id,command));s=model.apply(s,id,command).position;assert(D.validate(s));}
  assert.equal(s.status,'finished');assert(s.winners.length===0||new Set(s.winners.map(i=>s.data.players[i].team)).size===1);assert.equal(new Set(model.result(s).playerOrder).size,n);
 }
});
