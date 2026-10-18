'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),packs=path.dirname(fs.realpathSync(path.join(root,'packs')));

test('Yatzy rules, category schema and presentation execute without engine or browser globals',()=>{
  const context=vm.createContext({});
  vm.runInContext('Math.random=Date.now=()=>{throw Error("ambient dependency")};',context);
  for(const file of ['core/messages.js','core/random.js','core/model-values.js','core/events.js','core/model-runtime.js'].map(file=>path.join(root,file))
    .concat(['domain/categories.js','domain/game.js','presentation/scene.js'].map(file=>path.join(packs,'packs/yatzy',file)))){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
    const model=new PlayroomModelRuntime.GameModel(PlayroomPackDefinitionFactory({rollDie:PlayroomRandom.rollDie},PlayroomYatzyCategories));
    const initial=model.create({playerCount:3,firstPlayer:1,preset:'classic',rng:17});
    const rolled=model.apply(initial,1,{type:'roll'}).position;
    const expected={rng:17},dice=Array.from({length:5},()=>PlayroomRandom.rollDie(6,expected));
    const projection=model.projectTable(rolled,1);
    const scene=PlayroomPackPresentation.scene(projection);
    return {rng:rolled.rng,expected:expected.rng,dice:rolled.data.dice,expectedDice:dice,
      initial:initial.data.rolls,turn:rolled.turn,rows:scene.rows.length,
      public:projection.actions.length,secret:projection.data.rng};
  })())`,context));
  assert.deepEqual(result.dice,result.expectedDice);assert.equal(result.rng,result.expected);
  assert.equal(result.initial,0);assert.equal(result.turn,1);assert.equal(result.rows,15);assert.equal(result.public,21);
  assert.equal(result.secret,undefined);
  for(const key of ['TabletopCore','document','localStorage','window','fetch'])assert.equal(context[key],undefined);
});

test('Yatzy model preserves held dice, limits three throws and accepts a numeric zero score',()=>{
  const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js');
  const base=path.join(packs,'packs/yatzy');
  const model=new GameModel(require(base+'/domain/game.js')({rollDie:Random.rollDie},require(base+'/domain/categories.js')));
  let state=model.create({playerCount:2,firstPlayer:0,preset:'classic',rng:17});
  state=model.apply(state,0,{type:'roll'}).position;
  state=model.apply(state,0,{type:'hold',index:0}).position;
  const value=state.data.dice[0];
  state=model.apply(state,0,{type:'roll'}).position;assert.equal(state.data.dice[0],value);
  state=model.apply(state,0,{type:'hold',index:0}).position;
  assert.equal(state.data.held[0],false);
  state=model.apply(state,0,{type:'roll'}).position;
  assert(!model.legalActions(state,0).some(action=>['hold','roll'].includes(action.type)));
  const zero=model.legalActions(state,0).find(action=>model.project(state,0).data.previews[action.key]===0);
  assert(zero);const next=model.apply(state,0,zero).position;
  assert.equal(next.data.scores[0][zero.key],0);assert.equal(next.turn,1);assert.equal(next.data.rolls,0);
  assert.throws(()=>model.apply(next,0,{type:'roll'}),error=>error.code==='ACTION_UNAVAILABLE');
});

test('Battleship runs headless, keeps setup private and grants only public fire commands',()=>{
  const context=vm.createContext({});
  vm.runInContext('Math.random=Date.now=()=>{throw Error("ambient dependency")};',context);
  const files=['core/messages.js','core/random.js','core/model-values.js','core/events.js','core/model-runtime.js'].map(file=>path.join(root,file))
    .concat(['domain/geometry.js','domain/game.js','presentation/scene.js'].map(file=>path.join(packs,'packs/battleship',file)));
  for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
    const model=new PlayroomModelRuntime.GameModel(PlayroomPackDefinitionFactory({random:PlayroomRandom.random},PlayroomBattleshipGeometry));
    let state=model.create({playerCount:2,firstPlayer:1,preset:'russian',rng:17});
    const setup=model.projectTable(state,1),initial=state;
    state=model.apply(state,1,{type:'auto'}).position;
    const counts=model.project(state,1).data.fleetCounts[1];
    state=model.apply(state,1,{type:'ready'}).position;
    state=model.apply(state,0,{type:'auto'}).position;
    state=model.apply(state,0,{type:'ready'}).position;
    const table=model.projectTable(state,1),own=model.project(state,1);
    const changed=model.apply(state,1,table.actions[0]);
    return {setupActions:setup.actions,initialShips:initial.data.ships,
      counts:counts.map(item=>item.count),actor:table.actor,viewer:table.viewer,
      hidden:table.data.ships.flat(2).every(cell=>cell===null),
      own:own.data.ships[1].flat().every(Number.isInteger),
      public:table.actions.every(action=>action.type==='fire'),
      fact:changed.events[0],scene:PlayroomPackPresentation.scene(table).family};
  })())`,context));
  assert.deepEqual(result.setupActions,[]);assert.deepEqual(result.initialShips,[[],[]]);
  assert(result.counts.every(count=>count===0));assert.equal(result.actor,1);assert.equal(result.viewer,-1);
  assert(result.hidden&&result.own&&result.public);assert.equal(result.scene,'grid-board');
  assert.equal(result.fact.type,'battleship.fired');assert.equal(result.fact.actor,1);
  assert.equal(result.fact.text,undefined);assert.deepEqual(result.fact.visibility,{kind:'public'});
  for(const key of ['TabletopCore','document','localStorage','window','fetch'])assert.equal(context[key],undefined);
});

test('Battleship suppresses sinking information when announcements are disabled',()=>{
  const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js');
  const base=path.join(packs,'packs/battleship'),G=require(base+'/domain/geometry.js');
  const model=new GameModel(require(base+'/domain/game.js')({random:Random.random},G));
  let state=model.create({playerCount:2,firstPlayer:0,preset:'russian',rng:17,options:{announceSinking:'off'}});
  for(const actor of [0,1]){
    state=model.apply(state,actor,{type:'auto'}).position;
    state=model.apply(state,actor,{type:'ready'}).position;
  }
  const ship=state.data.ships[1].find(cells=>cells.length===1),changed=model.apply(state,0,{type:'fire',cell:ship[0]});
  assert.equal(changed.events[0].params.hit,true);assert.equal(changed.events[0].params.sunk,false);
  const table=model.projectTable(changed.position,0);
  assert.deepEqual(table.data.fleetCounts,[null,null]);assert.deepEqual(table.data.sunk,[[],[]]);
  assert.deepEqual(table.data.marks,[[],[]]);assert.equal(changed.position.data.sunk[0].length,1);
});

test('Pexeso bot receives only public observations and does not reveal its memory in a viewer projection',()=>{
  const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js');
  const base=path.join(packs,'packs/pexeso'),Deck=require(path.join(packs,'shared/domain/standard-deck.js'));
  const definition=require(base+'/domain/game.js')({shuffle:Random.shuffle},Deck);
  let received;
  const model=new GameModel({...definition,bot:(projection,actor,actions,memory)=>{
    received={projection,memory};return definition.bot(projection,actor,actions,memory);
  }});
  let state=model.create({playerCount:2,firstPlayer:0,preset:'easy',rng:17});
  state=model.apply(state,0,{type:'flip',index:0}).position;
  model.botAction(state,0);
  assert.deepEqual(received.memory,{seen:{0:state.data.board[0].id}});
  assert.equal(received.projection.rng,undefined);assert.equal(received.projection.data.seen,undefined);
  assert(received.projection.data.board.slice(1).every(card=>card.hidden));
  assert.equal(model.projectTable(state,0).actions.length,state.data.board.length-1);
  assert.equal(model.project(state,-1).data.seen,undefined);
});

test('card model initialization preserves facts, local hands, blind public choices and exit points',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js');
 const Deck=require(path.join(packs,'shared/domain/standard-deck.js'));
 for(const id of ['oldmaid','gofish']){
  const base=path.join(packs,'packs',id),model=new GameModel(require(base+'/domain/game.js')({shuffle:Random.shuffle,random:Random.random},Deck));
  for(const deck of [36,52,54])for(const count of [2,4,6]){
   let state=model.create({playerCount:count,firstPlayer:count-1,preset:'classic',rng:17,openHands:false,options:{deck}}),steps=0;
   const initial=model.project(state,count-1),table=model.projectTable(state,count-1);
   assert(initial.data.hands[count-1].every(card=>card.id));
   assert(table.data.hands.flat().every(card=>card.hidden));
   assert.equal(table.actions.length,id==='oldmaid'?model.legalActions(state,count-1).length:0);
   while(state.status==='playing'&&steps++<2000){const actor=state.turn;state=model.apply(state,actor,model.botAction(state,actor)).position;}
   assert.equal(state.status,'finished',id+' '+deck+'/'+count);
   const result=model.result(state);assert.equal(result.places.length,count);
   if(id==='oldmaid'){
    assert.deepEqual([...model.score(state)].sort((a,b)=>a-b),Array.from({length:count},(_,index)=>index));
    assert.deepEqual(result.metrics[0].values,model.score(state));
   }
  }
 }
});

test('model start validates setup events and scoring without a Session or engine facade',()=>{
 const {GameModel}=require('../core/model-runtime.js');
 const base={contractVersion:1,id:'setup-facts',minPlayers:2,maxPlayers:2,
  create:()=>({position:{playerCount:2,turn:0,status:'playing',winners:[],data:{points:[2,0]}},
    events:[{type:'setup.observed',actor:0,params:{count:2},visibility:{kind:'public'}}]}),
  validate:()=>true,actions:()=>[],reduce:position=>({position,events:[]}),project:position=>position.data,
  score:position=>position.data.points,result:()=>null};
 const model=new GameModel(base),start=model.start({playerCount:2});
 assert.equal(start.events[0].type,'setup.observed');assert.deepEqual(model.score(start.position),[2,0]);
 assert(Object.isFrozen(start.events));assert.deepEqual(model.create({playerCount:2}),start.position);
 assert.throws(()=>new GameModel({...base,score:()=>[NaN,0]}).score(start.position),error=>error.code==='SCORE_INVALID');
});

test('each migrated pack definition executes in isolation with explicit deterministic ports',()=>{
 const entries={tictactoe:null,yatzy:'PlayroomYatzyCategories',battleship:'PlayroomBattleshipGeometry',pexeso:'deck',
  oldmaid:'deck',gofish:'deck',ludo:'PlayroomLudoBoard',snakes:null,domino:null,checkers:'PlayroomCheckersBoard',durak:'durak',uno:null};
 for(const [id,dependency]of Object.entries(entries)){
  const context=vm.createContext({}),base=path.join(packs,'packs',id),manifest=JSON.parse(fs.readFileSync(base+'/manifest.json'));
  vm.runInContext('Math.random=Date.now=()=>{throw Error("ambient dependency")};',context);
  const files=['core/messages.js','core/random.js','core/model-values.js','core/events.js','core/model-runtime.js'].map(file=>path.join(root,file));
  for(const file of manifest.sharedDomain||[])files.push(path.join(packs,'shared/domain',file+'.js'));
  files.push(...manifest.sourceModules.rules.map(file=>path.join(base,file)));
  for(const file of files)vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  const dependencySource=dependency==='durak'?'{Deck:PlayroomPackDomain.standardDeck,Cards:PlayroomDurakCards}':dependency==='deck'?'PlayroomPackDomain.standardDeck':dependency||'undefined';
  const result=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
   const definition=globalThis.PlayroomPackDefinition||PlayroomPackDefinitionFactory({rollDie:PlayroomRandom.rollDie,random:PlayroomRandom.random,shuffle:PlayroomRandom.shuffle,ending:globalThis.PlayroomPackDomain?.endPolicy},${dependencySource});
   const model=new PlayroomModelRuntime.GameModel(definition),preset=PlayroomPackPresentation.metadata.presets[0].id;
   const initial=model.create({playerCount:2,firstPlayer:1,preset,rng:17,openHands:false,options:{deck:54}});
   const actor=initial.turn,action=model.botAction(initial,actor),changed=model.apply(initial,actor,action);
   const projected=model.projectTable(changed.position,changed.position.turn),scene=PlayroomPackPresentation.scene(projected);
   return {game:projected.game,contract:scene.contractVersion,secret:projected.rng,initialTurn:initial.turn};
  })())`,context));
  assert.equal(result.game,id);assert.equal(result.contract,1);assert.equal(result.secret,undefined);
  assert.equal(result.initialTurn,1,id+' first player');
  for(const key of ['TabletopCore','document','localStorage','window','fetch'])assert.equal(context[key],undefined,id+' '+key);
 }
});


test('Durak Table allows public responses and masks all hands without private card choices',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js');
 const base=path.join(packs,'packs/durak'),Deck=require(path.join(packs,'shared/domain/standard-deck.js'));
 const model=new GameModel(require(base+'/domain/game.js')({shuffle:Random.shuffle},{Deck,Cards:require(base+'/domain/cards.js')}));
 let state=model.create({playerCount:2,firstPlayer:0,preset:'classic',rng:17,options:{variant:'throwin',deck:54}});
 const first=model.legalActions(state,0).find(action=>action.type==='attack');assert(first);
 assert(model.projectTable(state,0).actions.every(action=>!action.card));
 state=model.apply(state,0,first).position;
 const table=model.projectTable(state,state.turn);assert(table.data.hands.flat().every(card=>card.hidden));
 assert(table.actions.some(action=>action.type==='take'));assert(!table.actions.some(action=>action.card));
 assert.throws(()=>model.commandFor(state,state.turn,model.legalActions(state,state.turn).find(action=>action.card),'table'));
 const changed=model.apply(state,state.turn,{type:'take'});
 assert(changed.events.every(event=>event.type.startsWith('durak.')));
 assert(changed.events.every(event=>!Object.hasOwn(event,'text')));
});

test('race endings honor the assigned first-player boundary, ties and complete finish order',()=>{
 const Ending=require(path.join(packs,'shared/domain/end-policy.js')),{GameModel}=require('../core/model-runtime.js');
 for(const mode of ['winner','round','last']){
  const model=new GameModel(require(path.join(packs,'packs/snakes/domain/game.js'))({rollDie:()=>1,ending:Ending}));
  let state=JSON.parse(JSON.stringify(model.create({playerCount:4,firstPlayer:2,preset:'classic',rng:17,options:{endMode:mode}})));
  state.turn=0;state.data.positions.fill(99);const initial=JSON.stringify(state);
  let next=model.apply(state,0,{type:'roll'}).position;assert.equal(JSON.stringify(state),initial);
  assert.equal(next.status,mode==='winner'?'finished':'playing');
  if(mode==='round'){next=model.apply(next,1,{type:'roll'}).position;assert.equal(next.status,'finished');assert.deepEqual(next.winners,[0,1]);assert.deepEqual(model.result(next).places,[1,1,2,2]);}
  if(mode==='last'){
   for(const actor of [1,2,3]){assert.equal(next.turn,actor);next=model.apply(next,actor,{type:'roll'}).position;}
   assert.equal(next.status,'finished');assert.deepEqual(model.result(next).places,[1,2,3,4]);assert.deepEqual(next.winners,[0]);
  }
 }
 const model=new GameModel(require(path.join(packs,'packs/ludo/domain/game.js'))({rollDie:()=>1,ending:Ending},require(path.join(packs,'packs/ludo/domain/board.js'))));
 let state=JSON.parse(JSON.stringify(model.create({playerCount:4,firstPlayer:2,preset:'teams',rng:17,options:{endMode:'last'}})));
 state.turn=2;state.data.pawns[0].fill(57);state.data.pawns[2]=[57,57,57,56];state.data.phase='move';state.data.dice=[1];state.data.used=[false];
 let next=model.apply(state,2,{type:'move',owner:2,pawn:3,dieIndex:0}).position;
 assert.equal(next.status,'playing');assert.equal(next.turn,3);assert.deepEqual(next.data.ending.groups,[[0,2]]);
 assert.deepEqual(Ending.places(next.data.ending,[4,0,4,0]),[1,2,1,2]);
});

test('card-game continuation skips finished hands and terminates for each supported ending',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js'),Deck=require(path.join(packs,'shared/domain/standard-deck.js')),ending=require(path.join(packs,'shared/domain/end-policy.js'));
 for(const id of ['uno','domino','oldmaid'])for(const endMode of ['winner','last']){
  const definition=require(path.join(packs,'packs',id,'domain/game.js'))({shuffle:Random.shuffle,random:Random.random,ending},Deck),model=new GameModel(definition);
  let state=model.create({playerCount:4,firstPlayer:1,preset:id==='uno'?'quick':'classic',rng:17,options:{endMode}}),steps=0;
  while(state.status==='playing'&&steps++<3000){assert(state.data.hands[state.turn].length,id+' must skip finished hands');state=model.apply(state,state.turn,model.botAction(state,state.turn)).position;}
  assert.equal(state.status,'finished',id+'/'+endMode);assert(model.result(state).places.every(place=>Number.isInteger(place)&&place>=1));
  if(endMode==='last'&&id==='oldmaid')assert.equal(state.data.hands.filter(hand=>hand.length).length,1);
  if(endMode==='last'&&id==='uno'&&state.data.ending.groups.length)assert.equal(state.data.hands.filter(hand=>hand.length).length,1);
 }
});

test('a round limit is independent from actions and turns, including the assigned first player',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Ending=require(path.join(packs,'shared/domain/end-policy.js'));
 const model=new GameModel(require(path.join(packs,'packs/snakes/domain/game.js'))({rollDie:()=>1,ending:Ending}));
 let state=model.create({playerCount:3,firstPlayer:2,preset:'classic',rng:17,options:{maxRounds:3}});
 for(let action=0;action<9;action++){assert.equal(state.turn,(2+action)%3);state=model.apply(state,state.turn,{type:'roll'}).position;}
 assert.equal(state.status,'finished');assert.equal(state.revision,9);assert.equal(state.timeline.turn,9);assert.equal(state.data.ending.round,3);assert.deepEqual(state.data.ending.starts,[0,3,6]);
 assert.deepEqual(state.timeline.starts,[0,1,2,3,4,5,6,7,8]);
 assert.throws(()=>model.validate({...state,timeline:{...state.timeline,round:2,roundStarts:[0,999]}}),error=>error.code==='POSITION_INVALID');
});

 test('Yatzy reveal uses the accepted category and precisely the participating public dice',()=>{
  const C=require(path.join(packs,'packs/yatzy/domain/categories.js'));
  for(const [dice,key,expected] of [
    [[6,6,6,2,1],'pair',[true,true,false,false,false]],
    [[2,5,2,5,5],'twoPairs',[true,true,true,true,false]],
    [[4,4,4,4,1],'three',[true,true,true,false,false]],
    [[2,5,2,1,5],'fives',[false,true,false,false,true]],
    [[2,3,4,5,6],'smallStraight',[false,false,false,false,false]],
    [[2,3,4,5,6],'largeStraight',[true,true,true,true,true]],
    [[3,3,2,2,3],'fullHouse',[true,true,true,true,true]],
    [[1,1,1,1,1],'yatzy',[true,true,true,true,true]]
  ])assert.deepEqual(C.participation(dice,key),expected,key);
  const Engine=require('../core/engine.js');require('../packs/yatzy/rules.js');
  const start=Engine.createGame('yatzy',{players:[{name:'A'},{name:'B'}],preset:'classic',seed:17});
  const rolled=Engine.applyAction(start,0,{type:'roll'});
  assert(Engine.project(rolled,-1).events.every(event=>!event.reveal),'ordinary Yatzy rolls have no enlarged reveal');
  const scored=Engine.applyAction(rolled,0,{type:'score',key:'pair'}),event=Engine.project(scored,-1).events.find(e=>e.type==='yatzy.scored');
  assert.equal(event.reveal.title,'Пара');assert.deepEqual(event.reveal.dice.map(d=>d.value),rolled.data.dice);
  assert.deepEqual(event.reveal.dice.map(d=>d.active),C.participation(rolled.data.dice,'pair'));
 });

 test('reveals contain only public played faces, never a private draw or hidden hand',()=>{
  const E=require('../core/engine.js');for(const id of ['uno','oldmaid','gofish'])require('../packs/'+id+'/rules.js');
  const players=[{name:'A'},{name:'B'}];
  let u,play;for(let seed=1;seed<40;seed++){u=E.createGame('uno',{players,preset:'classic',seed});play=E.legalActions(u,u.turn).find(a=>a.type==='play');if(play)break;}assert(play);
  const played=E.applyAction(u,u.turn,play),projection=E.project(played,-1),reveal=projection.events.find(e=>e.type==='uno.played').reveal;
  assert.deepEqual(reveal.card,played.data.discard.at(-1));assert(projection.data.hands.flat().every(c=>c.hidden));
  for(const id of ['oldmaid','gofish']){
    const s=E.createGame(id,{players,preset:'classic',seed:23}),action=E.legalActions(s,s.turn)[0],n=E.applyAction(s,s.turn,action);
    const events=E.project(n,-1).events;assert(events.filter(e=>e.transfer).every(e=>!e.reveal),id+' private transfers remain hidden');for(const event of events.filter(e=>e.reveal)){assert(['oldmaid.paired','gofish.booked'].includes(event.type));assert.equal(event.reveal.cards.length,id==='oldmaid'?2:4);}
  }
 });

test('Battleship counts every shot as a turn and both firing queues as a round',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js'),base=path.join(packs,'packs/battleship');
 const model=new GameModel(require(base+'/domain/game.js')({random:Random.random},require(base+'/domain/geometry.js')));
 for(const preset of ['russian','classic'])for(const firstPlayer of [0,1]){
  let state=model.create({playerCount:2,firstPlayer,preset,rng:17});
  for(let p=0;p<2;p++)for(const action of [{type:'auto'},{type:'ready'}])state=model.apply(state,state.turn,action).position;
  assert.equal(state.timeline.turn,1);assert.equal(state.timeline.round,1);assert.deepEqual(state.timeline.starts,[state.revision]);
  const hit=state.data.ships[1-firstPlayer][0][0];state=model.apply(state,firstPlayer,{type:'fire',cell:hit}).position;
  assert.equal(state.timeline.turn,2);assert.equal(state.timeline.round,1);assert.equal(state.turn,preset==='russian'?firstPlayer:1-firstPlayer);
  if(preset==='russian'){
   const second=state.data.ships[1-firstPlayer][0][1];state=model.apply(state,firstPlayer,{type:'fire',cell:second}).position;
   assert.equal(state.timeline.turn,3);assert.equal(state.timeline.round,1);assert.equal(state.turn,firstPlayer);
   const miss=model.legalActions(state,firstPlayer).find(a=>!state.data.ships[1-firstPlayer].flat().includes(a.cell));
   state=model.apply(state,firstPlayer,miss).position;assert.equal(state.timeline.round,1);
  }
  const opponent=1-firstPlayer,miss=model.legalActions(state,opponent).find(a=>!state.data.ships[firstPlayer].flat().includes(a.cell));
  state=model.apply(state,opponent,miss).position;assert.equal(state.turn,firstPlayer);assert.equal(state.timeline.round,2);assert.equal(state.timeline.roundStarts.at(-1),state.revision);
  assert.equal(model.project(state,-1).timeline.round,2);assert(model.project(state,-1).data.ships.flat(2).every(cell=>cell===null));
 }
});

test('ZiL+ deferred effects, shield and automatic second die obey the public commands',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Ending=require(path.join(packs,'shared/domain/end-policy.js'));
 const model=new GameModel(require(path.join(packs,'packs/snakes/domain/game.js'))({rollDie:()=>2,ending:Ending}));
 const start=(from=0)=>{const p=JSON.parse(JSON.stringify(model.create({playerCount:3,firstPlayer:0,preset:'plus',rng:17})));p.data.positions[0]=from;p.data.phase='move';p.data.dice=[1,3];return p;};
 const move=p=>model.apply(p,0,{type:'move',dieIndex:0,delta:0});
 let p=start(16),r=move(p);assert.equal(r.position.data.positions[0],34);assert.deepEqual(r.events.filter(e=>e.type==='snakes.moved').map(e=>e.params.roll),[1,3]);assert.equal(r.events.filter(e=>e.params.automatic).length,1);
 for(const [from,effect] of [[10,'skip'],[28,'less'],[21,'snake']]){
  p=start(from);p.data.effects[0].shield=true;r=move(p);assert(!r.position.data.effects[0].shield);assert(!r.position.data.effects[0][effect]);assert(r.events.some(e=>e.type==='snakes.protected'));if(effect==='snake')assert.equal(r.position.data.positions[0],22);
 }
 p=start(12);r=move(p);assert(r.position.data.effects[0].adjust);p=JSON.parse(JSON.stringify(r.position));p.turn=0;p.data.effects[0].shield=true;
 r=model.apply(p,0,{type:'roll'});assert(r.position.data.adjusting);assert(!r.position.data.effects[0].adjust);assert.equal(model.legalActions(r.position,0).length,4);
 r=model.apply(r.position,0,{type:'move',dieIndex:0,delta:-1});assert(r.position.data.effects[0].shield,'voluntary minus one never consumes a shield');
 p=start();p.data.phase='roll';p.data.effects[0].less=true;r=model.apply(p,0,{type:'roll'});assert.equal(r.position.data.dice.length,1);assert(!r.position.data.effects[0].less);
 p.data.effects[0].shield=true;r=model.apply(p,0,{type:'roll'});assert.equal(r.position.data.dice.length,2);assert(!r.position.data.effects[0].shield);
 p=start();p.data.effects[1]={skip:true,less:true,adjust:true,shield:false};r=move(p);assert.equal(r.position.turn,2);assert.deepEqual(r.position.data.effects[1],{skip:false,less:true,adjust:true,shield:false});
 p=start(5);r=move(p);assert.equal(r.position.turn,1);assert.equal(r.position.data.phase,'roll');
 p=start(15);p.data.adjusting=true;r=model.apply(p,0,{type:'move',dieIndex:0,delta:1});assert.deepEqual(r.events.filter(e=>e.type==='snakes.moved').map(e=>e.params.roll),[2,3]);
 p=start();p.data.adjusting=true;assert.throws(()=>model.apply(p,0,{type:'move',dieIndex:0,delta:0}));assert.throws(()=>model.apply(p,0,{type:'move',dieIndex:0,delta:-1}));assert.throws(()=>model.apply(p,1,{type:'move',dieIndex:0,delta:0}));
});

test('ZiL+ bot games terminate and replay deterministically with six players and both board sizes',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Random=require('../core/random.js'),Ending=require(path.join(packs,'shared/domain/end-policy.js'));
 const model=new GameModel(require(path.join(packs,'packs/snakes/domain/game.js'))({rollDie:Random.rollDie,ending:Ending}));
 for(const boardSize of [64,100])for(const endMode of ['winner','round','last']){
  let p=model.create({playerCount:6,firstPlayer:4,preset:'plus',rng:173,options:{boardSize,endMode,maxRounds:20}}),replay=p,steps=0;
  while(p.status==='playing'&&steps++<600){const a=model.botAction(p,p.turn),r=model.apply(p,p.turn,a);replay=model.apply(replay,replay.turn,a).position;p=r.position;model.validate(p);}
  assert.equal(p.status,'finished',boardSize+'/'+endMode);assert.deepEqual(p,replay);assert(model.result(p).places.every(n=>n>=1&&n<=6));
 }
});


test('ZiL+ rewards raw doubles after all moves and has no extra-roll cells',()=>{
 const {GameModel}=require('../core/model-runtime.js'),Ending=require(path.join(packs,'shared/domain/end-policy.js'));
 const model=new GameModel(require(path.join(packs,'packs/snakes/domain/game.js'))({rollDie:()=>2,ending:Ending}));
 const start=(dice,from=0,boardSize=64)=>{const p=JSON.parse(JSON.stringify(model.create({playerCount:3,firstPlayer:0,preset:'plus',rng:17,options:{boardSize}})));p.data.phase='move';p.data.dice=dice;p.data.positions[0]=from;return p;};
 const move=(p,delta=0)=>model.apply(p,0,{type:'move',dieIndex:0,delta});
 for(const size of [64,100])assert(!Object.values(start([2,2],0,size).data.special).includes('extra'));
 let r=move(start([2,2]));assert.equal(r.position.turn,0);assert.equal(r.position.data.phase,'roll');assert.equal(r.events.at(-1).type,'snakes.extra');
 r=model.apply(r.position,0,{type:'roll'});assert.equal(r.position.data.phase,'move');assert.equal(r.position.turn,0);
 r=move(start([2,2],15));assert.equal(r.position.turn,0);assert.equal(r.events.filter(e=>e.type==='snakes.moved').length,2);assert.equal(r.events.filter(e=>e.type==='snakes.extra').length,1);assert.equal(r.events.at(-1).type,'snakes.extra');
 let p=start([2,2]);p.data.adjusting=true;r=move(p,1);assert.equal(r.position.turn,0,'adjustment cannot cancel a raw double');
 p=start([2,3]);p.data.adjusting=true;r=move(p,1);assert.equal(r.position.turn,1,'adjustment cannot create a double');
 r=move(start([2]));assert.equal(r.position.turn,1,'one die cannot be a double');
 r=move(start([1,1],63));assert.equal(r.position.status,'finished');assert(!r.events.some(e=>e.type==='snakes.extra'),'no bonus after finishing');
});
