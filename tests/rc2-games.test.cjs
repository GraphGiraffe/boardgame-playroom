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
 let s=create('ludo',4,'teams');s.turn=2;s.data.pawns[0]=[57,57,57,57];s.data.pawns[2]=[57,57,57,56];s.data.phase='move';s.data.die=1;s=play(s,{type:'move',owner:2,pawn:3});assert.deepEqual(s.winners,[0,2]);
 s=create('yatzy');s.data.rolls=3;s.data.dice=[1,2,3,4,5];s=play(s,{type:'score',key:'smallStraight'});assert.equal(s.data.scores[0].smallStraight,15);
});

test('Durak lets a non-defender join the attack',()=>{
 let s;for(let seed=1;seed<100;seed++){const candidate=E.createGame('durak',{players:Array.from({length:4},(_,i)=>({name:`P${i}`})),preset:'classic',seed,firstPlayerMode:'assigned',firstPlayer:0});const attack=candidate.data.hands[0].find(c=>candidate.data.hands[2].some(x=>x.rank===c.rank));if(attack){s=candidate;s=play(s,{type:'attack',card:attack.id});break;}}
 assert(s);s=play(s,{type:'take'});s=play(s,{type:'done'});assert.equal(s.turn,2);assert(E.legalActions(s).some(a=>a.type==='attack'));
});

test('all new views render playable controls without fallback',()=>{
 for(const id of ids){const preset=id==='battleship'?'russian':id==='pexeso'?'easy':'classic';let s=create(id,id==='ludo'?4:2,preset);const html=V.render(E.project(s,s.turn),s.turn,E.legalActions(s),{selected:null});assert.doesNotMatch(html,/Не удалось показать игру|undefined|NaN/,id);assert.match(html,/data-action=/,id);}
});

test('pack display preferences persist order, visibility and favorites',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};
 const scope={localStorage:storage};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app/pack-manager.js'),'utf8'),scope);
 const P=scope.PlayroomPackManager;assert.deepEqual(Array.from(P.ordered(['uno','durak'])),['uno','durak']);P.toggleFavorite('durak');assert.deepEqual(Array.from(P.displayPreferences().favorites),['durak']);P.toggleFavorite('durak');assert.equal(P.displayPreferences().favorites.length,0);
 storage.setItem('playroom.pack-display.v1',JSON.stringify({order:['durak','uno'],hidden:['uno'],favorites:['durak']}));assert.deepEqual(Array.from(P.ordered(['uno','durak','ludo'])),['durak','uno','ludo']);assert.deepEqual(Array.from(P.displayPreferences().hidden),['uno']);
});
