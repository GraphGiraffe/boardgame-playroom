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
