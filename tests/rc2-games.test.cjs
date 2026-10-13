'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const E=require('../core/engine.js'),ids=['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid','durak'];
for(const id of ids)require(`../packs/${id}/rules.js`);
require('../core/ui.js');const V=require('../app/views.js');require(path.join(path.dirname(fs.realpathSync(path.join(__dirname,'../packs'))),'shared/view-kit.js'));
for(const id of ids)require(`../packs/${id}/view.js`);
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
 let s=create('battleship',2,'russian');s=play(s,{type:'auto'});s=play(s,{type:'auto'});const sea=E.project(s,0);assert(sea.data.ships[0].flat().some(Number.isInteger));assert(sea.data.ships[1].flat().every(x=>x===null));
 s=create('pexeso',2,'easy','54');assert(E.project(s,0).data.board.every(c=>c.hidden));s=play(s,E.legalActions(s)[0]);assert.equal(E.project(s,1).data.board.filter(c=>!c.hidden).length,1);
 for(const id of ['gofish','oldmaid','durak']){s=create(id,2);const other=E.project(s,0).data.hands[1];assert(other.every(c=>c.hidden),id);assert(E.project(s,-1).data.hands.flat().every(c=>c.hidden),id);}
});

test('Battleship hit repeat and five-ship alternating turns',()=>{
 for(const preset of ['russian','classic']){let s=create('battleship',2,preset);s=play(s,{type:'auto'});s=play(s,{type:'auto'});const actor=s.turn,cell=s.data.ships[1-actor][0][0];s=play(s,{type:'fire',cell});assert.equal(s.data.shots[actor].at(-1).hit,true);assert.equal(s.turn,preset==='russian'?actor:1-actor);}
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
 let s=create('yatzy');s.data.scores[0]={ones:3,twos:6,threes:9,fours:12,fives:15,sixes:18,chance:20};const p=E.project(s,0);assert.equal(p.data.totals[0],133);assert.equal(p.data.bonuses[0],50);assert.equal(p.data.upper[0],63);
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
 let s=E.createGame('ludo',{players:[{name:'A'},{name:'B'}],diceCount:3,seed:17});s.data.failed[0]=2;
 // Seed 1 produces 1/3/4; the third failed batch grants a real exit, not a fake six.
 s.rng=1;s=play(s,{type:'roll'});assert(s.data.guarantee);assert(s.data.dice.every(n=>n!==6));
 const a=E.legalActions(s).find(a=>a.dieIndex===1);s=play(s,a);assert.equal(s.data.pawns[0][a.pawn],0);assert.equal(s.data.used[1],true);assert.equal(s.data.guarantee,false);assert(E.legalActions(s).some(a=>a.type==='move'&&a.pawn===0&&a.dieIndex!==1));
});
test('RC4 sinking marks do not count as shots or leak when announcements disabled',()=>{
 for(const announceSinking of ['on','off']){let s=E.createGame('battleship',{players:[{name:'A'},{name:'B'}],announceSinking,seed:4});s=play(s,{type:'auto'});s=play(s,{type:'auto'});const p=s.turn,ship=s.data.ships[1-p].at(-1),before=s.data.shots[p].length;
  for(const cell of ship){s.turn=p;s=play(s,{type:'fire',cell});}
  assert.equal(s.data.shots[p].length,before+ship.length);const other=E.project(s,p),publicState=E.project(s,-1),cues=E.soundCues(s,p,s.events.at(-2).id);
  if(announceSinking==='on'){assert(s.data.marks[p].length);assert(other.data.fleetCounts[1-p]);assert(cues.some(c=>c.id==='sea.sunk'));assert(!cues.some(c=>c.id==='sea.hit'));}
  else{assert.equal(s.data.marks[p].length,0);assert.equal(other.data.fleetCounts[1-p],null);assert(publicState.data.fleetCounts.every(x=>x===null));assert.equal(other.data.sunk[p].length,0);assert(cues.some(c=>c.id==='sea.hit'));}
 }
});
test('RC4 sea bot decisions depend only on observed shots',()=>{
 let s=create('battleship');s=play(s,{type:'auto'});s=play(s,{type:'auto'});const actor=s.turn,cell=s.data.ships[1-actor][0][1];s=play(s,{type:'fire',cell});const action=E.botAction(s),privateChanged=E.clone(s);privateChanged.data.ships[1-actor]=[];assert.deepEqual(E.botAction(privateChanged),action);
 assert([cell-1,cell+1,cell-10,cell+10].includes(action.cell),'follow adjacent hit');
});
test('RC4 immediate public pair has neutral transfer and public success, never card identity',()=>{
 const Authority=require('../core/authority.js');let s=create('oldmaid',4);let pair=null;
 for(const action of E.legalActions(s)){const next=play(s,action);if(next.data.discard.length>s.data.discard.length){pair={action,next};break;}}assert(pair);
 const cues=E.soundCues(pair.next,-1,s.events.at(-1).id);assert(cues.some(c=>c.id==='success'));const transfers=Authority.transfers(s,pair.next);assert.equal(transfers[0].from,'hand');assert.equal(transfers[1].to,'table');assert(!JSON.stringify(transfers).includes('♠'));
 const projected=E.project(pair.next,-1);assert.deepEqual(E.soundCues(projected,-1,s.events.at(-1).id),cues);
});
test('RC4 Yatzy score sounds distinguish numeric, special and yatzy only after scoring',()=>{
 for(const [key,sound]of [['ones','success'],['pair','success.special'],['yatzy','success.yatzy']]){let s=create('yatzy');s.data.rolls=3;s.data.dice=[1,1,1,1,1];const cursor=s.events.at(-1).id;s=play(s,{type:'score',key});assert(E.soundCues(s,0,cursor).some(c=>c.id===sound));}
});
