'use strict';
require('../core/model-registration.js');
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../core/engine.js'),ids=['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid','durak'];
let environment,V;before(async()=>{environment=await require('./sdk-installed.cjs').bootstrap();V=environment.views;});after(()=>environment?.close());
const create=(id,n=2,preset=E.get(id).presets[0].id,deck)=>E.createGame(id,{players:Array.from({length:n},(_,i)=>({name:`P${i}`,bot:true})),preset,deck,seed:17});
const play=(s,a)=>E.applyAction(s,s.turn,a||E.botAction(s));

test('new packs, deck sizes and Durak variants finish with valid states',()=>{
 for(const id of ids){const g=E.get(id),variants=id==='pexeso'||id==='gofish'||id==='oldmaid'?['36','52','54']:[undefined];
  for(const preset of g.presets)for(const deck of variants){const n=preset.id==='teams'?4:g.max;let s=create(id,n,preset.id,deck),steps=0;
   while(s.status==='playing'&&steps<3000){assert(E.validateState(s),`${id}/${preset.id}/${deck} state`);const a=E.botAction(s);assert(a,`${id}/${preset.id}/${deck} has an action`);s=play(s,a);steps++;}
   assert.equal(s.status,'finished',`${id}/${preset.id}/${deck} stalled after ${steps} moves`);assert(E.validateState(s));
  }
 }
});

test('hidden boards and hands remain private in projected state',()=>{
 let s=create('battleship',2,'russian');s=play(s,{type:'auto'});s=play(s,{type:'ready'});s=play(s,{type:'auto'});s=play(s,{type:'ready'});const sea=E.project(s,0);assert(sea.data.ships[0].flat().some(Number.isInteger));assert(sea.data.ships[1].flat().every(x=>x===null));
 for(const openHands of [false,true]){
  s.openHands=openHands;const spectator=E.project(s,-1),table=E.projectTable(s,s.turn);
  assert.deepEqual(table.data,spectator.data);
  assert(table.data.ships.flat(2).every(cell=>cell===null),'both fleets stay hidden on Table');
  assert.deepEqual(table.tableActions,E.legalActions(s).map(({type,cell,label,preserveSelection})=>({type,cell,label,preserveSelection})),'only public shots are granted');
 }
 s=create('pexeso',2,'easy','54');assert(E.project(s,0).data.board.every(c=>c.hidden));s=play(s,E.legalActions(s)[0]);assert.equal(E.project(s,1).data.board.filter(c=>!c.hidden).length,1);
 for(const id of ['gofish','oldmaid','durak']){s=create(id,2);const other=E.project(s,0).data.hands[1];assert(other.every(c=>c.hidden),id);assert(E.project(s,-1).data.hands.flat().every(c=>c.hidden),id);}
});

test('Battleship hit repeat and five-ship alternating turns',()=>{
 for(const preset of ['russian','classic']){let s=create('battleship',2,preset);s=play(s,{type:'auto'});s=play(s,{type:'ready'});s=play(s,{type:'auto'});s=play(s,{type:'ready'});const actor=s.turn,cell=s.data.ships[1-actor][0][0];s=play(s,{type:'fire',cell});assert.equal(s.data.shots[actor].at(-1).hit,true);assert.equal(s.turn,preset==='russian'?actor:1-actor);}
});

test('Battleship manual placement rotates and preserves the fleet rules',()=>{
 let s=create('battleship',2,'russian');assert(E.legalActions(s).some(a=>a.type==='place'&&!a.vertical));
 s=play(s,{type:'orient'});assert(E.legalActions(s).some(a=>a.type==='place'&&a.vertical));
 const placement=E.legalActions(s).find(a=>a.type==='place'&&a.vertical);s=play(s,placement);
 assert.equal(s.data.ships[0][0].length,4);assert.equal(s.data.ships[0][0][1]-s.data.ships[0][0][0],10);assert(E.validateState(s));
});

test('Ludo teams finish together and Yatzy uses classic small straight',()=>{
 let s=E.createGame('ludo',{players:Array.from({length:4},(_,i)=>({name:'P'+i})),preset:'teams',diceCount:1,endMode:'winner',seed:17});s.turn=2;s.data.pawns[0]=[57,57,57,57];s.data.pawns[2]=[57,57,57,56];s.data.phase='move';s.data.diceCount=1;s.data.rollIndices=[0];s.data.dice=[1];s.data.used=[false];s=play(s,{type:'move',owner:2,pawn:3,dieIndex:0});assert.deepEqual(s.winners,[0,2]);
 s=create('yatzy');s.data.rolls=3;s.data.dice=[1,2,3,4,5];s=play(s,{type:'score',key:'smallStraight'});assert.equal(s.data.scores[0].smallStraight,15);
});

test('Ludo projection preserves stacked public identities, current roll and safe route anchors',()=>{
 const s=create('ludo',4),cell=13;
 for(const count of [2,4,8,16]){s.data.pawns=s.data.pawns.map((row,p)=>row.map((_,j)=>p*4+j<count?(cell-p*13+52)%52:-1));const scene=E.project(s,0).scene,tokens=scene.objects.filter(object=>object.ref.namespace==='token');assert.equal(tokens.length,16);assert.equal(new Set(tokens.map(object=>object.ref.id)).size,16);assert.equal(tokens.filter(object=>Number(object.ref.id[0])*4+Number(object.ref.id[2])<count&&JSON.stringify(object.point)===JSON.stringify(tokens[0].point)).length,count,'every public stacked identity remains in the scene');}
 s.data.phase='roll';s.data.dice=s.data.dice.map(()=>6);s.data.used=s.data.used.map(()=>false);s.data.lastRolled=s.data.dice.map((_,index)=>index);s.events.push({id:s.events.length+1,revision:s.move,type:'ludo.rolled',actor:0,params:{dice:[6]},visibility:{kind:'public'}});s.turn=1;assert.equal(E.project(s,1).scene.repeatSix,false);s.turn=0;assert.equal(E.project(s,0).scene.repeatSix,true);
 s.data.phase='move';s.data.pawns[0]=[7,-1,-1,-1];s.data.diceCount=1;s.data.rollIndices=[0];s.data.dice=[1];s.data.used=[false];const scene=E.project(s,0).scene;assert(scene.geometry.anchors.some(anchor=>anchor.id==='path-8'));assert(scene.moves.some(move=>move.command.pawn===0));
});

test('Durak lets a non-defender join the attack',()=>{
 let s;for(let seed=1;seed<100;seed++){const candidate=E.createGame('durak',{players:Array.from({length:4},(_,i)=>({name:`P${i}`})),preset:'classic',seed,firstPlayerMode:'assigned',firstPlayer:0});const attack=candidate.data.hands[0].find(c=>candidate.data.hands[2].some(x=>x.rank===c.rank));if(attack){s=candidate;s=play(s,{type:'attack',card:attack.id});break;}}
 assert(s);s=play(s,{type:'take'});s=play(s,{type:'done'});assert.equal(s.turn,2);assert(E.legalActions(s).some(a=>a.type==='attack'));
});

test('all new isolated scenes describe a legal target for every command',()=>{
 for(const id of ids){const preset=id==='battleship'?'russian':id==='pexeso'?'easy':'classic',s=create(id,id==='ludo'?4:2,preset),projection=E.project(s,s.turn),commands=projection.scene.interactions.map(interaction=>interaction.command);assert.equal(E.get(id).isolated,true,id);assert.doesNotThrow(()=>require('../presentation/scene-contract.js').validate(projection.scene,s.players.length));for(const action of projection.modelProjection.actions)assert(commands.some(command=>JSON.stringify(command)===JSON.stringify(action)),id+' has an authorized semantic dispatch target');}
});

test('pack display preferences persist order, visibility and favorites',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const scope={localStorage:storage};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/pack-manager.js'),'utf8'),scope);
 const P=scope.PlayroomPackManager;assert.deepEqual(Array.from(P.ordered(['uno','durak'])),['uno','durak']);P.toggleFavorite('durak');assert.deepEqual(Array.from(P.displayPreferences().favorites),['durak']);P.toggleFavorite('durak');assert.equal(P.displayPreferences().favorites.length,0);
 storage.setItem('playroom.pack-display.v1',JSON.stringify({order:['durak','uno'],hidden:['uno'],favorites:['durak']}));assert.deepEqual(Array.from(P.ordered(['uno','durak','ludo'])),['durak','uno','ludo']);assert.deepEqual(Array.from(P.displayPreferences().hidden),['uno']);
});


test('Akulina draws the chosen hidden card and rejects an invalid index',()=>{
 const s=create('oldmaid',4,'classic','54'),actions=E.legalActions(s),choice=actions.at(-1),id=s.data.hands[choice.target][choice.cardIndex].id;
 assert.equal(actions.length,s.data.hands.reduce((n,h,i)=>n+(i===s.turn?0:h.length),0));assert(actions.every(a=>a.targetKind==='player'&&a.targetChoice==='card'&&!('card' in a)));
 const next=play(s,choice);assert(!next.data.hands[choice.target].some(c=>c.id===id));assert([...next.data.hands[s.turn],...next.data.discard].some(c=>c.id===id));
 assert.throws(()=>play(s,{...choice,cardIndex:999}));assert(E.project(s,-1).data.hands.flat().every(c=>Object.keys(c).join() === 'hidden'));
});
test('automatic fleets leave gaps in both rulesets and Yatzy totals include the bonus',()=>{
 for(const preset of ['classic','russian']){let s=create('battleship',2,preset);s=play(s,{type:'auto'});for(const [i,ship] of s.data.ships[0].entries())for(const cell of ship)for(const other of s.data.ships[0].slice(i+1).flat())assert(Math.abs(cell%10-other%10)>1||Math.abs(Math.floor(cell/10)-Math.floor(other/10))>1);}
 let s=create('yatzy');s.data.scores[0]={ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18,chance:20};s.data.round=7;const p=E.project(s,0);assert.equal(p.data.totals[0],133);assert.equal(p.data.bonuses[0],50);assert.equal(p.data.upper[0],63);
});

test('new pack actions have playable common sound cues and do not replay old events',()=>{
 for(const id of ['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid']){const s=create(id),after=s.events.at(-1)?.id||0,n=play(s);assert(E.soundCues(n,s.turn,after).length,id);assert.deepEqual(E.soundCues(n,s.turn,n.events.at(-1).id),[]);}
 const sounds=fs.readFileSync(path.join(__dirname,'../packs/uno/sounds.js'),'utf8'),uri=sounds.match(/data:audio\/wav;base64,([A-Za-z0-9+/=]+)/)[1],asset=fs.readFileSync(path.join(__dirname,'../packs/uno/assets/uno-call.wav'));assert.deepEqual(Buffer.from(uri,'base64'),asset);
});

test('RC4 Durak variants and deck sizes finish with every supported roster',()=>{
 for(const variant of ['simple','throwin','transfer'])for(const deck of ['36','52','54'])for(const n of [2,4,6])for(const endMode of ['winner','last']){
  let s=E.createGame('durak',{players:Array.from({length:n},(_,i)=>({name:`P${i}`})),variant,deck,endMode,seed:71}),steps=0;
  while(s.status==='playing'&&steps++<5000){assert(E.validateState(s),`${variant}/${deck}/${n}`);s=play(s);}
  assert.equal(s.status,'finished',`${variant}/${deck}/${n}/${endMode}`);assert(E.validateState(s));
 }
});
test('RC4 Ludo multiple dice, guarantee, and independently consumed values',()=>{
 for(const diceCount of [1,2,3])for(const sixReroll of ['on','off']){let s=E.createGame('ludo',{players:[{name:'A'},{name:'B'}],diceCount,sixReroll,seed:15}),steps=0;while(s.status==='playing'&&steps++<3000){assert(E.validateState(s));s=play(s);}assert.equal(s.status,'finished');}
 for(const diceCount of [1,2,3]){
  let s=E.createGame('ludo',{players:[{name:'A'},{name:'B'}],diceCount,seed:17});s.data.failed[0]=2;
  // The third failed batch permits exactly one exit and ends this actor's turn.
  s.rng=1;s=play(s,{type:'roll'});assert(s.data.guarantee);assert(s.data.dice.every(n=>n!==6));
  const a=E.legalActions(s).find(a=>a.dieIndex===Math.min(1,diceCount-1));s=play(s,a);
  assert.equal(s.data.pawns[0].filter(p=>p===0).length,1);assert(s.data.used.every(Boolean));assert.equal(s.data.guarantee,false);
  assert.equal(s.turn,1);assert.equal(s.data.phase,'roll');assert.deepEqual(E.legalActions(s).map(a=>a.type),['roll']);
 }
});
test('RC4 sinking marks do not count as shots or leak when announcements disabled',()=>{
 for(const announceSinking of ['on','off']){let s=E.createGame('battleship',{players:[{name:'A'},{name:'B'}],announceSinking,seed:4});s=play(s,{type:'auto'});s=play(s,{type:'ready'});s=play(s,{type:'auto'});s=play(s,{type:'ready'});const p=s.turn,ship=s.data.ships[1-p].at(-1),before=s.data.shots[p].length;
  for(const cell of ship){s.turn=p;s=play(s,{type:'fire',cell});}
  assert.equal(s.data.shots[p].length,before+ship.length);const other=E.project(s,p),publicState=E.project(s,-1),cues=E.soundCues(s,p,s.events.at(-2).id);
  if(announceSinking==='on'){assert(s.data.marks[p].length);assert(other.data.fleetCounts[1-p]);assert(cues.some(c=>c.id==='sea.sunk'));assert(!cues.some(c=>c.id==='sea.hit'));}
  else{assert.equal(s.data.marks[p].length,0);assert.equal(other.data.fleetCounts[1-p],null);assert(publicState.data.fleetCounts.every(x=>x===null));assert.equal(other.data.sunk[p].length,0);assert(cues.some(c=>c.id==='sea.hit'));}
 }
});
test('fleet counters show distinct deck lengths and mark zero in both surfaces',()=>{
 const H=globalThis.TabletopUI.helpers,items=[1,2,3,4,5].map(size=>({icon:'ship',size,value:size===3?0:2,label:`Корабли на ${size} палуб` }));
 const html=H.indicators(items);
 assert.equal((html.match(/fleet-indicator/g)||[]).length,5);
 assert.equal((html.match(/fleet-ship-icon/g)||[]).length,5);
 assert.equal((html.match(/class="player-indicator fleet-indicator is-empty"/g)||[]).length,1);
 assert.deepEqual([...html.matchAll(/class="fleet-ship-icon" width="(\d+)"/g)].map(x=>Number(x[1])),[25,34,43,52,61]);
 let s=create('battleship');s=play(s,{type:'auto'});s=play(s,{type:'ready'});s=play(s,{type:'auto'});s=play(s,{type:'ready'});
 const scene=E.project(s,0).scene;assert(scene.fleets.every(fleet=>fleet.indicators.every(item=>item.icon==='ship'&&Number.isInteger(item.size))));
});
test('board game avatars use the shared distinct seat palette',()=>{
 for(const id of ['ludo','snakes','checkers']){
  const s=E.createGame(id,{players:[{name:'Аня'},{name:'Борис'}],seed:17});
  assert.deepEqual(E.project(s,0).scene.players.map(player=>player.player),[0,1]);assert.match(TabletopUI.helpers.playerColor(0),/--color-seat-0/,id);assert.notEqual(TabletopUI.helpers.playerColor(0),TabletopUI.helpers.playerColor(1));
 }
});
test('RC4 sea bot decisions depend only on observed shots',()=>{
 let s=create('battleship');s=play(s,{type:'auto'});s=play(s,{type:'ready'});s=play(s,{type:'auto'});s=play(s,{type:'ready'});const actor=s.turn,cell=s.data.ships[1-actor][0][1];s=play(s,{type:'fire',cell});s.turn=actor;const action=E.botAction(s),privateChanged=E.clone(s);const G=require('../packs/battleship/domain/geometry.js');let seed={rng:23};do{privateChanged.data.ships[1-actor]=G.autoPlace(seed,[],G.fleets[s.preset],true,E.random);}while(!privateChanged.data.ships[1-actor].flat().includes(cell));assert(E.validateState(privateChanged));assert.deepEqual(E.botAction(privateChanged),action);
 // Assess the tactical preference separately from the intentional mistake chance.
 const tactical=E.clone(s);tactical.players.forEach(p=>p.bot=false);assert([cell-1,cell+1,cell-10,cell+10].includes(E.botAction(tactical).cell),'follow adjacent hit without a deliberate mistake');
});
test('Akulina shows who draws and publicly discards pairs without revealing the card',()=>{
 const Authority=require('../core/authority.js');let s=create('oldmaid',4);let pair=null;
 for(const action of E.legalActions(s)){const next=play(s,action);if(next.data.discard.length>s.data.discard.length){pair={action,next};break;}}assert(pair);
 const cues=E.soundCues(pair.next,-1,s.events.at(-1).id);assert(cues.some(c=>c.id==='success'));const transfers=Authority.transfers(s,pair.next,E.project(pair.next,-1).events);assert.equal(transfers[0].from,'hand');assert.equal(transfers[0].fromPlayer,pair.action.target);assert.equal(transfers[0].player,s.turn);assert.equal('privateTo' in transfers[0],false);assert.equal(transfers.length,1);assert.equal(E.project(pair.next,-1).events.find(e=>e.reveal?.kind==='cards').reveal.cards.length,2);assert(!JSON.stringify(transfers).includes('♠'));
 const projected=E.project(pair.next,-1);assert.deepEqual(E.soundCues(projected,-1,s.events.at(-1).id),cues);
});
test('Akulina draw shows both participants to everyone, while the card stays private',()=>{
 const Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
 const session=new Session(E,'oldmaid',{players:Array.from({length:4},(_,i)=>({name:`P${i}`})),seed:17});
 const authority=new Authority(session),clients=[0,1,2,3,-1].map(i=>authority.connect(i));
 try{
  const actor=session.current.turn,action=E.legalActions(session.current)[0],target=action.target;
  const receipt=clients[actor].dispatch(P.command(clients[actor].snapshot(),action,'private-draw'));
  assert(receipt.ok);
  for(const client of clients){const viewer=client.snapshot().viewer;
   for(const snapshot of [client.snapshot(),client.history(1)]){
    const publicEffects=snapshot.effects.filter(e=>e.from==='hand'&&e.fromPlayer===target&&e.player===actor);
    assert.equal(publicEffects.length,1);
    const draw=snapshot.events.find(e=>e.kind==='draw');assert(draw);
    assert.match(draw.text,/P\d+ вытянул закрытую карту у P\d+/);
    assert.equal('transfer' in draw,true);
    assert(E.project(session.current,viewer).data.hands[target].every(c=>viewer===target||c.hidden));
    assert(!JSON.stringify(snapshot).includes('privateTo'));
   }
  }
  assert(E.soundCues(session.current,-1,0).some(c=>c.id==='draw'));
 }finally{authority.dispose();}
});
test('Akulina awards descending points as players leave; the last player gets zero',()=>{
 let s=create('oldmaid',4),steps=0;
 while(s.status==='playing'&&steps++<500){const action=E.botAction(s);assert(action);s=play(s,action);}
 assert.equal(s.status,'finished');assert.deepEqual(s.data.outOrder.map(i=>s.players[i].score),[3,2,1]);
 assert.equal(s.players.find((_,i)=>!s.data.outOrder.includes(i)).score,0);
 assert.deepEqual(s.winners,s.data.outOrder);
});
test('Ludo friendly occupied cells keep pawn selection separate from a move',()=>{
 for(const preset of ['classic','teams']){
  const s=E.createGame('ludo',{players:Array.from({length:4},(_,i)=>({name:'P'+i})),preset,diceCount:2,seed:17});
  s.turn=0;s.data.phase='move';s.data.dice=[2,3];s.data.used=[false,false];s.data.pawns[0]=[7,9,-1,-1];
  const projected=E.project(s,0),actions=E.legalActions(s,0),before=JSON.stringify(s),move=actions.find(a=>a.owner===0&&a.pawn===0&&a.dieIndex===0);
  assert(move,'moving onto a friendly occupied cell is legal');
  const raw=projected.modelProjection.actions,interaction=projected.scene.interactions.find(value=>value.command.owner===0&&value.command.pawn===0&&value.command.dieIndex===0);assert.equal(interaction.kind,'move');assert.deepEqual(interaction.source,{entity:{namespace:'token',id:'0-0'}});assert(projected.scene.objects.some(object=>object.ref.namespace==='token'&&object.ref.id==='0-1'));assert(raw.some(command=>command.owner===0&&command.pawn===1&&command.dieIndex===0),'the other pawn retains its own command');
  assert.equal(JSON.stringify(s),before,'selection and previews do not consume a die or move a pawn');
  const next=play(s,move);assert.equal(next.data.pawns[0][0],9);assert.equal(next.data.pawns[0][1],9);assert.deepEqual(next.data.used,[true,false]);
 }
});
test('Ludo star squares are safe while the next unmarked square can capture',()=>{
 let s=create('ludo',2);s.turn=0;s.data.phase='move';s.data.diceCount=1;s.data.rollIndices=[0];s.data.dice=[1];s.data.used=[false];s.data.pawns=[[7,-1,-1,-1],[47,-1,-1,-1]];
 s=play(s,{type:'move',owner:0,pawn:0,dieIndex:0});assert.equal(s.data.pawns[1][0],47);
});
test('Pexeso shows a mismatch through its animation, then closes it before the next turn',()=>{
 let s=create('pexeso',2,'easy','52'),first=0,second=s.data.board.findIndex(c=>c.rank!==s.data.board[first].rank);
 s=play(s,{type:'flip',index:first});s=play(s,{type:'flip',index:second});
 assert.equal(s.data.phase,'reveal');assert.deepEqual(s.data.flipped,[first,second]);assert.equal(s.turn,1);
 assert(E.legalActions(s).every(a=>a.type==='flip'));
 const projected=E.project(s,1);assert.equal(projected.scene.cards.filter(card=>card.closing).length,2);assert.equal(projected.scene.cards.filter(card=>!card.card.hidden).length,2);assert(projected.scene.cards.filter(card=>card.card.hidden).every(card=>!card.card.id&&!card.card.rank),'unopened identities stay hidden');
 s=play(s,{type:'flip',index:first});assert.equal(s.data.phase,'second');assert.deepEqual(s.data.flipped,[first]);
});
test('Pexeso bot sometimes overlooks a known pair',()=>{
 const s=create('pexeso',2,'easy','52'),pair=(a,b)=>a.rank===b.rank&&(['♥','♦'].includes(a.suit)===['♥','♦'].includes(b.suit));
 const first=s.data.board.findIndex((a,i)=>s.data.board.some((b,j)=>i!==j&&pair(a,b))),second=s.data.board.findIndex((b,j)=>j!==first&&pair(s.data.board[first],b));
 s.data.seen[first]=s.data.board[first].id;s.data.seen[second]=s.data.board[second].id;
 const choices=new Set();for(let move=0;move<12;move++){s.move=move;choices.add(E.botAction(s).index===first||E.botAction(s).index===second?'known':'missed');}
 assert.deepEqual([...choices].sort(),['known','missed']);
});
test('Yatzy permits releasing a held die before the third roll',()=>{
 let s=create('yatzy');s=play(s,{type:'roll'});
 s=play(s,{type:'hold',index:0});assert.equal(s.data.held[0],true);
 s=play(s,{type:'roll'});assert.equal(s.data.rolls,2);assert.equal(s.data.held[0],true);
 assert(E.legalActions(s).some(a=>a.type==='hold'&&a.index===0));
 s=play(s,{type:'hold',index:0});assert.equal(s.data.held[0],false);
 s=play(s,{type:'roll'});assert.equal(s.data.rolls,3);assert.equal(s.data.held[0],false);
 assert(!E.legalActions(s).some(a=>a.type==='hold'));
});
test('RC4 Yatzy score sounds distinguish numeric, special and yatzy only after scoring',()=>{
 for(const [key,sound]of [['ones','success'],['pair','success.special'],['yatzy','success.yatzy']]){let s=create('yatzy');s.data.rolls=3;s.data.dice=[1,1,1,1,1];const cursor=s.events.at(-1).id;s=play(s,{type:'score',key});assert(E.soundCues(s,0,cursor).some(c=>c.id===sound));}
});


test('Pexeso bot choice is invariant under permutations of never-revealed faces',()=>{
  for(let move=0;move<30;move++){
    const state=create('pexeso');state.move=move;
    state.data.flipped=[0];state.data.phase='second';state.data.seen={0:state.data.board[0].id,1:state.data.board[1].id};
    const altered=E.clone(state),tail=altered.data.board.slice(2).reverse();altered.data.board.splice(2,tail.length,...tail);
    const a=E.botAction(state),b=E.botAction(altered);
    assert.deepEqual(b,a,'unknown card faces must never influence a bot mistake');
  }
});

test('Battleship Table can fire for either authorized actor without exposing either fleet',()=>{
 let state=create('battleship');
 for(let i=0;i<2;i++){state=play(state,{type:'auto'});state=play(state,{type:'ready'});}
 for(const actor of [0,1]){
  state.turn=actor;
  const projection=E.projectTable(state,actor);assert.equal(projection.modelProjection.actions.filter(action=>action.type==='fire').length,100,'authorized public shots');require('../presentation/scene-contract.js').commands(projection.scene,projection.modelProjection);assert(projection.data.ships.flat(2).every(cell=>cell===null));
  const next=E.applyTableAction(state,actor,projection.tableActions[0]);assert.equal(next.data.shots[actor].length,1);
 }
 const spectator=E.project(state,-1);assert.deepEqual(spectator.modelProjection.actions,[]);assert.deepEqual(spectator.scene.interactions,[]);
});


test('Pexeso cartoon deck defaults to exact character pairs and completes every preset',()=>{
 assert.deepEqual(E.get('pexeso').presets.map(p=>p.id),['easy','medium','hard']);
 for(const preset of ['easy','medium','hard']){
  let state=create('pexeso',4,preset);assert.equal(state.data.deckSize,96);assert(E.validateState(state));
  const counts=new Map();for(const card of state.data.board)counts.set(card.character,(counts.get(card.character)||0)+1);
  assert([...counts.values()].every(n=>n===2));assert.equal(counts.size,{easy:8,medium:12,hard:18}[preset]);
  assert(E.project(state,-1).data.board.every(card=>card.hidden&&!card.character));
  const forged=E.clone(state);forged.data.board[0].color='unknown';assert.throws(()=>E.validateState(forged),/POSITION_INVALID/);
  let steps=0;while(state.status==='playing'&&steps++<3000)state=play(state);
  assert.equal(state.status,'finished',preset);assert(E.validateState(state));
 }
});

test('Pexeso standard-deck composition stays fixed while placement changes',()=>{
 for(const deck of ['36','52','54'])for(const preset of ['easy','medium','hard']){
  const a=E.createGame('pexeso',{players:[{name:'A'},{name:'B'}],preset,deck,seed:17}),b=E.createGame('pexeso',{players:[{name:'A'},{name:'B'}],preset,deck,seed:42});
  assert.deepEqual(a.data.board.map(c=>c.id).sort(),b.data.board.map(c=>c.id).sort());assert.notDeepEqual(a.data.board.map(c=>c.id),b.data.board.map(c=>c.id));
 }
});


test('Pexeso cartoon pairs vary by seed with all shapes, varied colors and reproducible identical pairs',()=>{
 const players=[{name:'A'},{name:'B'}];
 for(const preset of ['easy','medium','hard']){
  const compositions=new Set(),colorAssignments=new Set();
  for(let seed=1;seed<=64;seed++){
   const options={players,preset,deck:'cartoon',seed},state=E.createGame('pexeso',options),again=E.createGame('pexeso',options);
   assert.deepEqual(state,again,'same seed restores the same complete initial state');assert(E.validateState(state));
   const pairs=new Map();for(const card of state.data.board){const group=pairs.get(card.character)||[];group.push(card);pairs.set(card.character,group);}
   assert.equal(pairs.size,{easy:8,medium:12,hard:18}[preset]);
   const shapes=new Map(),colors=new Set();
   for(const [character,cards]of pairs){
    assert.equal(cards.length,2);assert.notEqual(cards[0].id,cards[1].id);
    assert.equal(cards[0].shape,cards[1].shape);assert.equal(cards[0].color,cards[1].color);
    assert.equal(character,cards[0].shape+'-'+cards[0].color);
    shapes.set(cards[0].shape,(shapes.get(cards[0].shape)||0)+1);colors.add(cards[0].color);
   }
   assert.equal(shapes.size,8);assert.equal(colors.size,6);
   assert(Math.max(...shapes.values())-Math.min(...shapes.values())<=1);
   assert(E.project(state,-1).data.board.every(card=>card.hidden&&!card.character&&!card.shape&&!card.color));
   compositions.add([...pairs.keys()].sort().join(','));
   colorAssignments.add([...pairs.keys()].filter(key=>key.startsWith('crescent-')).sort().join(','));
  }
  assert(compositions.size>32,'new seeds select different face sets');
  assert(colorAssignments.size>3,'individual shapes receive different colors across games');
 }
});

test('finish order records simultaneous exits, public timing and the last loser',()=>{
 const Ending=require(require('node:path').join(require('node:fs').realpathSync(__dirname+'/../packs'),'../shared/domain/end-policy.js'));
 const ending=Ending.create(5,0,'last');
 Ending.record(ending,[2],{timeline:{turn:8}},'domino');
 Ending.record(ending,[0,3],{timeline:{turn:15}},'domino');
 Ending.record(ending,[1],{timeline:{turn:19}},'domino');
 assert.deepEqual(Ending.places(ending,[0,0,0,0,9],false),[2,3,1,2,4]);
 assert.deepEqual(Ending.result(ending).lastPlayers,[4]);
 assert.deepEqual(ending.exits.filter(e=>e.turn===15).map(e=>e.player),[0,3]);
 for(const game of ['durak','oldmaid']){
  let s=create(game,4),steps=0;
  while(s.status==='playing'&&steps++<1500)s=play(s,E.botAction(s));
  assert.equal(s.status,'finished',game);
  const groups=s.data.ending.groups;
  for(let rank=0;rank<groups.length;rank++)for(const player of groups[rank])assert.equal(s.result.places[player],rank+1,game);
  assert.deepEqual(E.project(s,0).result,s.result);
  assert(s.result.exits.length>0);assert(s.result.exits.every(e=>e.round>0||e.turn>0));
 }
});


test('Battleship simultaneous fleet setup keeps private choices and independent readiness',()=>{
 let s=create('battleship',2,'classic');const first=s.turn,other=1-first;
 assert(E.legalActions(s,other).some(a=>a.type==='auto'));
 s=E.applyAction(s,other,{type:'auto'});const fleet=JSON.stringify(s.data.ships[other]);
 s=E.applyAction(s,first,{type:'auto'});assert.equal(JSON.stringify(s.data.ships[other]),fleet);
 assert.equal(E.project(s,first).data.ships[other].length,0);
 assert.equal(E.projectTable(s,first).tableActions.length,0);
 s=E.applyAction(s,other,{type:'ready'});assert.equal(s.data.phase,'setup');assert.equal(E.legalActions(s,other).length,0);
 assert.deepEqual(E.decisionWindow(s).ready,[other]);assert(E.legalActions(s,first).some(a=>a.type==='ready'));
 s=E.applyAction(s,first,{type:'ready'});assert.equal(s.data.phase,'battle');assert.equal(s.turn,first);assert.equal(E.decisionWindow(s),null);assert(E.validateState(s));
});
test('Battleship bot search varies by seeded randomness without reading hidden ships',()=>{
 const factory=require('../packs/battleship/domain/game.js'),G=require('../packs/battleship/domain/geometry.js'),D=factory({random:E.random},G),commands=Array.from({length:100},(_,cell)=>({type:'fire',cell}));
 const projection={preset:'classic',data:{shots:[[],[]],marks:[[],[]],sunk:[[],[]],announceSinking:true}},seen=new Set();
 for(let seed=1;seed<=40;seed++){
  const context={rng:seed*982451653>>>0},a=D.bot(projection,0,commands,{},context);seen.add(a.cell);
  assert.deepEqual(D.bot(projection,0,commands,{},context),a,'restore repeats the same random choice');
 }
 assert(seen.size>20,'search does not follow a fixed board pattern');
});


test('Ludo bots prioritize six exits, captures, then starts and stars using actual board rules',()=>{
 const setup=(preset='classic')=>{const s=create('ludo',4,preset);s.players.forEach(p=>p.bot=false);s.turn=0;s.data.phase='move';s.data.dice=[1,2];s.data.used=[false,false];s.data.pawns=[[4,7,40,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]];return s;};
 let exit=setup();exit.data.dice=[1,6];exit.data.pawns[1][0]=44;
 assert.equal(E.botAction(exit).pawn,3,'exit on six beats capture');assert.equal(E.botAction(exit).dieIndex,1);
 let s=setup();s.data.pawns[1][0]=44; // Opponent at global cell 5.
 assert.equal(E.botAction(s).pawn,0,'capture beats a star, progress and base exit');
 assert.equal(E.botAction(s).dieIndex,0);
 s=setup();assert.equal(E.botAction(s).pawn,1,'star beats further progress');
 s.data.pawns[0]=[12,30,40,42];assert.equal(E.botAction(s).pawn,0,'another player start is safe too');
 s=setup();s.data.pawns[0]=[6,30,40,42];s.data.pawns[1][0]=45; // Global 6: cannot be captured by these moves.
 assert.equal(E.botAction(s).pawn,0);assert.equal(E.botAction(s).dieIndex,1,'second die lands on the star');
 s=setup('teams');s.data.pawns[2][0]=31; // Ally at global 5 is not a capture.
 assert.equal(E.botAction(s).pawn,1,'ally does not override safe-cell priority');
 s=setup();s.turn=1;s.data.pawns[0]=[-1,-1,-1,-1];s.data.pawns[1]=[7,30,40,42];assert.equal(E.botAction(s).pawn,0,'stars use owner-relative board rotation');
 const before=JSON.stringify(s);assert.deepEqual(E.botAction(s),E.botAction(s));assert.equal(JSON.stringify(s),before,'bot evaluation does not mutate the position');
});


test('Ludo bots develop several pawns and escape threats instead of always advancing the leader',()=>{
 const setup=(preset='classic')=>{const s=E.createGame('ludo',{players:Array.from({length:4},(_,i)=>({name:'P'+i})),preset,diceCount:1,seed:17});s.turn=0;s.data.phase='move';s.data.dice=[5];s.data.used=[false];s.data.pawns=[[5,30,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1],[-1,-1,-1,-1]];return s;};
 let s=setup();s.data.dice=[2];assert.equal(E.botAction(s).pawn,0,'develop lagging pawn when neither move is tactical');
 s=setup();s.data.pawns[1][0]=13;assert.equal(E.botAction(s).pawn,1,'run from enemy at global 26 beyond a one-die capture');
 s=setup();s.data.pawns[0]=[0,20,-1,-1];s.data.pawns[1][0]=40;assert.equal(E.botAction(s).pawn,1,'avoid leaving safety into a reachable enemy attack');
 s=setup('teams');s.data.pawns[2][0]=0;assert.equal(E.botAction(s).pawn,0,'ally behind the leader is not a threat');
 s=setup();s.data.pawns[0]=[5,52,-1,-1];assert.equal(E.botAction(s).pawn,1,'finish a pawn when no tactical move is needed');
 // Repeated ordinary choices alternate between pawns instead of driving one home.
 s=setup();s.data.pawns[0]=[2,3,-1,-1];s.data.dice=[1];const used=new Set();
 for(let i=0;i<4;i++){const c=E.botAction(s);used.add(c.pawn);s.data.pawns[0][c.pawn]++;}
 assert.equal(used.size,2);
});


test('Go Fish sorts ranks and asks with the exact selected physical card',()=>{
 const s=create('gofish',4,'classic','52'),actor=s.turn,hand=s.data.hands[actor],card=hand.find(c=>hand.some(other=>other.id!==c.id&&other.rank===c.rank));assert(card,'seed has duplicate rank');
 const sibling=hand.find(c=>c.id!==card.id&&c.rank===card.rank),before=JSON.stringify(s);
 const scene=E.project(s,actor).scene,ranks=scene.players[actor].hand.map(c=>c.rank);assert.deepEqual(ranks,[...ranks].sort((a,b)=>a-b));
 const actions=E.legalActions(s,actor),a=actions.find(a=>a.cardId===sibling.id);assert(a);assert.equal(a.card,sibling.id);
 assert(scene.interactions.some(interaction=>interaction.source?.entity?.id===sibling.id&&interaction.command.cardId===sibling.id));assert.equal(JSON.stringify(s),before);
 const next=E.applyAction(s,actor,a),asked=E.project(next,actor).events.findLast(e=>e.type==='gofish.asked');assert.equal(asked.reveal.card.id,sibling.id);
 assert(E.project(s,-1).scene.players.every(p=>p.hand.every(c=>c.hidden&&!c.id&&!c.rank)));
});


test('difficulty presets are seeded, fallible, independent per player and Pexeso remembers probabilistically',()=>{
 const B=require('../core/bot-difficulty.js'),D=require('../packs/pexeso/domain/game.js')({shuffle:E.shuffle},require(path.join(path.dirname(fs.realpathSync(path.join(__dirname,'../packs'))),'shared/domain/standard-deck.js')));
 const state=D.create({playerCount:2,firstPlayer:0,preset:'easy',rng:17,options:{deck:36}}),cards=state.data.board;
 const pair=c=>c.rank+'-'+(['♥','♦'].includes(c.suit)?'red':'black'),match=cards.findIndex((c,i)=>i>0&&pair(c)===pair(cards[0]));
 state.data.flipped=[0];state.data.phase='second';const projection={...state,data:D.project(state)},commands=D.actions(state,0).map(a=>a.command),memory={seen:Object.fromEntries(cards.map((c,i)=>[i,c.id]))};
 const rates={};for(const difficulty of B.levels){let errors=0;for(let seed=1;seed<=1000;seed++){const context=()=>B.context({difficulty},seed,'memory'),before=JSON.stringify(state),a=D.bot(projection,0,commands,memory,context());assert.deepEqual(a,D.bot(projection,0,commands,memory,context()));assert.equal(JSON.stringify(state),before);if(a.index!==match)errors++;}rates[difficulty]=errors;}
 assert(rates.easy>rates.medium&&rates.medium>rates.hard&&rates.hard>0,JSON.stringify(rates));
 const s=E.createGame('pexeso',{seed:17,players:[{name:'A',bot:true,botSettings:{difficulty:'easy'}},{name:'B',bot:true,botSettings:{difficulty:'hard'}}]});assert.equal(s.players[0].botSettings.difficulty,'easy');assert.equal(s.players[1].botSettings.difficulty,'hard');assert.equal(E.createGame('pexeso',{players:[{name:'A',bot:true},{name:'B'}]}).players[0].botSettings.difficulty,'medium');
});

test('all bot levels complete card, dice and board games without mutating decisions or reading hidden opponents',()=>{
 for(const id of ['tictactoe','pexeso','gofish','oldmaid','uno','domino','durak','ludo','battleship','yatzy','snakes']){
  if(!E.GAMES.some(g=>g.id===id))require('../packs/'+id+'/rules.js');
  for(const difficulty of ['easy','medium','hard']){let s=E.createGame(id,{seed:42,preset:E.get(id).presets[0].id,players:Array.from({length:2},(_,i)=>({name:'P'+i,bot:true,botSettings:{difficulty}})),maxRounds:2}),n=0;
   while(s.status==='playing'&&n++<2500){const before=JSON.stringify(s),a=E.botAction(s);assert(a,id+'/'+difficulty);assert.deepEqual(E.botAction(s),a);assert.equal(JSON.stringify(s),before);s=E.applyAction(s,s.turn,a);}
   assert.equal(s.status,'finished',id+'/'+difficulty+' stalled at '+n);assert(E.validateState(s));
  }
 }
});

test('Ludo tutorial distinguishes the initial throw from a six reroll using actual public state',()=>{
 const tutorial=require('../packs/ludo/presentation/tutorial.js')({format:m=>m.key});
 for(const sixReroll of ['on','off'])for(const diceCount of [1,2,3]){
  let s=E.createGame('ludo',{players:[{name:'A'},{name:'B'}],seed:17,preset:'classic',sixReroll,diceCount,firstPlayerMode:'assigned',firstPlayer:0});
  assert.equal(E.project(s,0).scene.repeatSix,false,'initial six is not a reroll');
  // Bound the fixture at the actual roll boundary; a whole simulated bot match
  // is irrelevant to the tutorial and expensive through isolated bot realms.
  s.data.pawns[0]=[56,56,56,56];let seed=1;
  for(;seed<100000;seed++){const probe={rng:seed};if(Array.from({length:diceCount},()=>E.rollDie(6,probe)).every(value=>value===6))break;}
  assert(seed<100000);s.rng=seed;s=E.applyAction(s,0,{type:'roll'});
  const state=E.project(s,s.turn),guide=tutorial({state});
  assert.equal(state.scene.repeatSix,sixReroll==='on');
  if(sixReroll==='on'){assert.equal(s.turn,0);assert.equal(guide.steps[0].id,'reroll-six');}else assert(!guide.required.includes('reroll-six'));
 }
});

test('tutorial action prerequisites and repeated dice actions are separate goals',()=>{
 const Controller=require('../application/tutorial-controller.js'),controller=new Controller(),owner={};
 const fish=require('../packs/gofish/presentation/tutorial.js')({format:m=>m.key});
 const ctx={owner,viewer:0,state:{game:'gofish',status:'playing',turn:0,players:[{},{}]},actions:[{type:'ask',cardId:'c1',target:1}],ui:{selected:null}};
 let definition=fish(ctx);assert.equal(definition.steps[0].id,'card');assert.equal(definition.steps[1].available,false);
 controller.update(ctx,fish);controller.interact(['opponent']);assert.equal(controller.capture(owner,0).progress.seen.has('opponent'),false);
 ctx.ui.selected='c1';definition=fish(ctx);assert.equal(definition.steps[0].available,false);assert.equal(definition.steps[1].available,true);
 const yatzy=require('../packs/yatzy/presentation/tutorial.js')({format:m=>m.key});
 assert(yatzy({state:{scene:{rolls:0}}}).steps.some(s=>s.id==='roll'));
 const repeat=yatzy({state:{scene:{rolls:1,dice:[{held:true},{held:false}]}}});assert(repeat.steps.some(s=>s.id==='reroll'));
 assert(repeat.steps.find(s=>s.id==='release').match({type:'hold',index:0}));assert(!repeat.steps.find(s=>s.id==='hold').match({type:'hold',index:0}));
});

test('UNO tutorial only teaches a justified declaration or challenge, including outside own turn',()=>{
 const tutorial=require('../packs/uno/presentation/tutorial.js')({format:m=>m.key});
 const Controller=require('../application/tutorial-controller.js'),c=new Controller(),owner={};
 const context={owner,viewer:0,state:{game:'uno',status:'playing',turn:1,players:[{},{}],scene:{declarationOpen:[false,false],declared:[false,false]}},actions:[{type:'declare-uno'},{type:'accuse-uno',target:1}]};
 let guide=tutorial(context);assert.equal(guide.concurrent,false);assert.equal(guide.steps.find(s=>s.id==='declare-uno').available,false);assert.equal(guide.steps.find(s=>s.id==='accuse-uno').available,false);
 context.state.scene.declarationOpen=[true,false];c.update(context,tutorial);const token=c.capture(owner,0);assert(token);c.committed(owner,0,{type:'declare-uno'},token);assert(token.progress.seen.has('declare-uno'));
 context.state.scene.declarationOpen=[false,true];guide=tutorial(context);assert.equal(guide.steps.find(s=>s.id==='challenge-player').selector,'[data-player-target="1"]');assert(guide.steps.find(s=>s.id==='accuse-uno').match({type:'accuse-uno',target:1}));assert(!guide.steps.find(s=>s.id==='accuse-uno').match({type:'accuse-uno',target:0}));
});

test('Snakes ±1 allows zero and seven steps and exposes both choices for every die',()=>{
 for(let die=1;die<=6;die++){
  const s=create('snakes',2,'plus');Object.assign(s.data,{phase:'move',dice:[die,3],adjusting:true});
  const moves=E.legalActions(s).filter(a=>a.type==='move'&&a.dieIndex===0);
  assert.deepEqual(moves.map(a=>a.delta),[-1,1]);
 }
 let s=create('snakes',2,'plus');Object.assign(s.data,{phase:'move',dice:[6,2],adjusting:true});s.data.positions[0]=90;
 s=play(s,{type:'move',dieIndex:0,delta:1});assert.equal(s.data.positions[0],97);assert.equal(s.data.lastMove.roll,7);assert(E.validateState(s));
 s=create('snakes',2,'plus');Object.assign(s.data,{phase:'move',dice:[6,2],adjusting:true});s.data.positions[0]=96;
 s=play(s,{type:'move',dieIndex:0,delta:1});assert.equal(s.data.lastMove.landing,97,'seven steps reflect off the finish');assert(E.validateState(s));
});
test('Snakes ±1 zero stays put without retriggering cells, consuming a shield or losing a double',()=>{
 for(const from of [0,14,17,25]){
  let s=create('snakes',2,'plus');Object.assign(s.data,{phase:'move',dice:[1,5],adjusting:true});s.data.positions[0]=from;s.data.effects[0].shield=true;
  const zero=E.project(s,0).scene.moves.find(m=>m.command.dieIndex===0&&m.command.delta===-1);
  assert.equal(zero.landing,from);assert.deepEqual(zero.route,[]);
  s=play(s,{type:'move',dieIndex:0,delta:-1});assert.equal(s.data.positions[0],from);assert.equal(s.data.effects[0].shield,true);assert.equal(s.data.effects[0].adjust,false);assert.equal(s.turn,1);assert.equal(s.data.lastMove.roll,0);assert(E.validateState(s));
 }
 let s=create('snakes',2,'plus');Object.assign(s.data,{phase:'move',dice:[1,1],adjusting:true});s=play(s,{type:'move',dieIndex:0,delta:-1});assert.equal(s.turn,0,'original double grants another roll');assert.equal(s.data.phase,'roll');
});
test('Snakes ±1 leaves the automatic second die unchanged',()=>{
 let s=create('snakes',2,'plus');Object.assign(s.data,{phase:'move',dice:[6,2],adjusting:true});s.data.positions[0]=18;
 s=play(s,{type:'move',dieIndex:0,delta:1});assert.equal(s.data.positions[0],27);assert.equal(s.data.lastMove.roll,2,'second move uses the original other die');assert(E.validateState(s));
});

test('Durak uses the canonical endMode schema and state without host aliases',()=>{
 const manifest=require('../packs/durak/manifest.json'),field=manifest.settings.find(f=>f.key==='endMode');
 assert(field);assert.equal(manifest.stateVersion,4);assert(!manifest.settings.some(f=>f.key==='endCondition'));assert.deepEqual(field.options.map(o=>o.value),['winner','last']);
 for(const endMode of ['winner','last']){const state=E.createGame('durak',{players:[{name:'A'},{name:'B'}],seed:71,endMode});assert.equal(state.data.endMode,endMode);assert(!Object.hasOwn(state.data,'endCondition'));assert(E.validateState(state));}
});
