'use strict';
require('../core/model-registration.js');
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../core/engine.js'),ids=['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid','durak'];
for(const id of ids)require(`../packs/${id}/rules.js`);
for(const id of ['checkers','snakes'])require(`../packs/${id}/rules.js`);
require('../core/ui.js');const V=require('../app/views.js');require(path.join(path.dirname(fs.realpathSync(path.join(__dirname,'../packs'))),'shared/view-kit.js'));
for(const id of ids)require(`../packs/${id}/view.js`);
for(const id of ['checkers','snakes'])require(`../packs/${id}/view.js`);
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
  assert.deepEqual(table.tableActions,E.legalActions(s).map(({type,cell})=>({type,cell})),'only public shots are granted');
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
 let s=create('ludo',4,'teams');s.turn=2;s.data.pawns[0]=[57,57,57,57];s.data.pawns[2]=[57,57,57,56];s.data.phase='move';s.data.dice=[1];s.data.used=[false];s=play(s,{type:'move',owner:2,pawn:3,dieIndex:0});assert.deepEqual(s.winners,[0,2]);
 s=create('yatzy');s.data.rolls=3;s.data.dice=[1,2,3,4,5];s=play(s,{type:'score',key:'smallStraight'});assert.equal(s.data.scores[0].smallStraight,15);
});

test('Ludo keeps every pawn visible on a shared start and does not replay the prior roll',()=>{
 const s=create('ludo',4),cell=13;
 for(const count of [2,4,8,16]){
  s.data.pawns=s.data.pawns.map((row,p)=>row.map((_,j)=>p*4+j<count?(cell-p*13+52)%52:-1));
  const html=V.render(E.project(s,0),0,E.legalActions(s,0),{});
  const pawns=[...html.matchAll(/<button[^>]*class="ludo-pawn[^>]*data-entity="token-(\d)-(\d)"[^>]*>/g)].filter(match=>Number(match[1])*4+Number(match[2])<count);
  assert.equal(pawns.length,count);
  const positions=pawns.map(match=>match[0].match(/left:([\d.]+)%;top:([\d.]+)%/).slice(1).join(':'));
  assert.equal(new Set(positions).size,count,`${count} pawns occupy distinct positions`);
  assert(pawns.every(match=>match[0].includes('is-stacked')));
 }
 s.data.phase='roll';s.data.lastRoll=6;s.data.lastRolled=[0];s.events.push({id:1,kind:'roll',player:0});s.turn=1;
 assert.doesNotMatch(V.render(E.project(s,1),1,E.legalActions(s,1),{}),/data-motion-lead="roll"/);
 // The just-committed roll still animates when no legal move advanced the turn.
 assert.match(V.render(E.project(s,1),1,E.legalActions(s,1),{presentationTurn:0}),/data-motion-lead="roll"/);
 s.turn=0;assert.match(V.render(E.project(s,0),0,E.legalActions(s,0),{}),/data-motion-lead="roll"/);
 s.data.phase='move';s.data.pawns[0]=[7,-1,-1,-1];s.data.dice=[1];s.data.used=[false];
 const route=V.render(E.project(s,0),0,E.legalActions(s,0),{viewState:{pawn:'0:0'}});
 const safeCell=route.match(/<button class="ludo-cell ludo-safe[^>]*data-motion-anchor="path-8"[^>]*>[\s\S]*?<\/button>/)?.[0];
 assert(safeCell?.includes('ludo-safe-star'));
 assert(!safeCell.includes('board-route-dot'),'route dots do not hide a safe star');
});

test('Durak lets a non-defender join the attack',()=>{
 let s;for(let seed=1;seed<100;seed++){const candidate=E.createGame('durak',{players:Array.from({length:4},(_,i)=>({name:`P${i}`})),preset:'classic',seed,firstPlayerMode:'assigned',firstPlayer:0});const attack=candidate.data.hands[0].find(c=>candidate.data.hands[2].some(x=>x.rank===c.rank));if(attack){s=candidate;s=play(s,{type:'attack',card:attack.id});break;}}
 assert(s);s=play(s,{type:'take'});s=play(s,{type:'done'});assert.equal(s.turn,2);assert(E.legalActions(s).some(a=>a.type==='attack'));
});

test('all new views render playable controls without fallback',()=>{
 for(const id of ids){const preset=id==='battleship'?'russian':id==='pexeso'?'easy':'classic';let s=create(id,id==='ludo'?4:2,preset);const html=V.render(E.project(s,s.turn),s.turn,E.legalActions(s),{selected:null});assert.doesNotMatch(html,/Не удалось показать игру|undefined|NaN/,id);assert.match(html,/data-action=|data-select=|data-player-target=/,id);}
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
 for(const variant of ['simple','throwin','transfer'])for(const deck of ['36','52','54'])for(const n of [2,4,6])for(const endCondition of ['firstout','lastfool']){
  let s=E.createGame('durak',{players:Array.from({length:n},(_,i)=>({name:`P${i}`})),variant,deck,endCondition,seed:71}),steps=0;
  while(s.status==='playing'&&steps++<5000){assert(E.validateState(s),`${variant}/${deck}/${n}`);s=play(s);}
  assert.equal(s.status,'finished',`${variant}/${deck}/${n}/${endCondition}`);assert(E.validateState(s));
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
 const scene=V.render(E.project(s,0),0,E.legalActions(s,0));
 assert.match(scene,/fleet-indicator/);
});
test('board game avatars use the shared distinct seat palette',()=>{
 for(const id of ['ludo','snakes','checkers']){
  const s=E.createGame(id,{players:[{name:'Аня'},{name:'Борис'}],seed:17});
  const html=V.render(E.project(s,0),0,E.legalActions(s,0));
  assert.match(html,/background:color-mix\(in srgb,var\(--color-seat-0/,id);
 }
});
test('RC4 sea bot decisions depend only on observed shots',()=>{
 let s=create('battleship');s=play(s,{type:'auto'});s=play(s,{type:'ready'});s=play(s,{type:'auto'});s=play(s,{type:'ready'});const actor=s.turn,cell=s.data.ships[1-actor][0][1];s=play(s,{type:'fire',cell});const action=E.botAction(s),privateChanged=E.clone(s);const G=require('../packs/battleship/domain/geometry.js');let seed={rng:23};do{privateChanged.data.ships[1-actor]=G.autoPlace(seed,[],G.fleets[s.preset],true,E.random);}while(!privateChanged.data.ships[1-actor].flat().includes(cell));assert(E.validateState(privateChanged));assert.deepEqual(E.botAction(privateChanged),action);
 assert([cell-1,cell+1,cell-10,cell+10].includes(action.cell),'follow adjacent hit');
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
  const html=V.render(projected,0,actions,{viewState:{pawn:'0:0'}});
  const pawn=html.match(/<button[^>]*class="ludo-pawn[^>]*data-entity="token-0-1"[^>]*>/)?.[0];
  assert.match(pawn,/data-view-key="pawn" data-view-value="0:1"/);assert.doesNotMatch(pawn,/data-action=/);
  const cell=html.match(/<button class="ludo-cell[^>]*data-motion-anchor="path-9"[^>]*>/)?.[0];
  assert(cell.includes(V.helpers.actionAttr(move)),'the marked cell still executes the selected move');
  assert(html.includes('data-motion-lead="" '+V.helpers.actionAttr(move)),'the selected pawn can also move by tapping its die');
  const other=V.render(projected,0,actions,{viewState:{pawn:'0:1'}}),otherMove=actions.find(a=>a.owner===0&&a.pawn===1&&a.dieIndex===0);
  assert(other.includes('data-motion-lead="" '+V.helpers.actionAttr(otherMove)),'switching pawns updates the die command');
  assert.equal(JSON.stringify(s),before,'selection and previews do not consume a die or move a pawn');
  const next=play(s,move);assert.equal(next.data.pawns[0][0],9);assert.equal(next.data.pawns[0][1],9);assert.deepEqual(next.data.used,[true,false]);
 }
});
test('Ludo star squares are safe while the next unmarked square can capture',()=>{
 let s=create('ludo',2);s.turn=0;s.data.phase='move';s.data.dice=[1];s.data.used=[false];s.data.pawns=[[7,-1,-1,-1],[47,-1,-1,-1]];
 s=play(s,{type:'move',owner:0,pawn:0,dieIndex:0});assert.equal(s.data.pawns[1][0],47);
});
test('Pexeso shows a mismatch through its animation, then closes it before the next turn',()=>{
 let s=create('pexeso',2,'easy','52'),first=0,second=s.data.board.findIndex(c=>c.rank!==s.data.board[first].rank);
 s=play(s,{type:'flip',index:first});s=play(s,{type:'flip',index:second});
 assert.equal(s.data.phase,'reveal');assert.deepEqual(s.data.flipped,[first,second]);assert.equal(s.turn,1);
 assert(E.legalActions(s).every(a=>a.type==='flip'));
 const projected=E.project(s,1),animated=V.render(projected,1,[],{presentationTurn:0}),settled=V.render(projected,1,[]);
 assert.equal((animated.match(/class="pexeso-close-back"/g)||[]).length,2);assert.equal((animated.match(/<span class="pexeso-face"[^>]*><[^>]*class="shared-card shared-card-back/g)||[]).length,s.data.board.length-2);
 assert.equal((settled.match(/class="shared-card shared-card-back/g)||[]).length,s.data.board.length);
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
  const projection=E.projectTable(state,actor),scene=V.render(projection,-1,projection.tableActions,{surface:'table',viewState:{fleet:actor===0?'enemy':'own'}});
  assert.equal((scene.match(/data-action=/g)||[]).length,100,'public shots on the opponent field');
  assert(!scene.includes('aria-label="undefined"'));assert(projection.data.ships.flat(2).every(cell=>cell===null));
  const next=E.applyTableAction(state,actor,projection.tableActions[0]);assert.equal(next.data.shots[actor].length,1);
 }
 const spectator=V.render(E.project(state,-1),-1,[],{surface:'table'});
 assert(!spectator.includes('data-action='));
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
