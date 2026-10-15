'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),packs=path.dirname(fs.realpathSync(path.join(root,'packs')));

test('Yatzy rules, category schema and presentation execute without engine or browser globals',()=>{
  const context=vm.createContext({});
  vm.runInContext('Math.random=Date.now=()=>{throw Error("ambient dependency")};',context);
  for(const file of ['core/random.js','core/model-values.js','core/events.js','core/model-runtime.js'].map(file=>path.join(root,file))
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
  const files=['core/random.js','core/model-values.js','core/events.js','core/model-runtime.js'].map(file=>path.join(root,file))
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
