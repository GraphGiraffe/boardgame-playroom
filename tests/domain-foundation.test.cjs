'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const Random = require('../core/random.js');
const root = path.resolve(__dirname, '..');
const companion = path.dirname(fs.realpathSync(path.join(root, 'packs')));
const Deck = require(path.join(companion, 'shared/domain/standard-deck.js'));

// Vectors captured from the published engine before extraction (0.17.6).
test('extracted RNG preserves the previous sequence and state exactly', () => {
  const state = {rng: 17};
  assert.deepEqual(Array.from({length: 4}, () => Random.random(state)), [
    0.6771502960473299, 0.19265692122280598, 0.5313839064911008, 0.1654723146930337
  ]);
  assert.equal(state.rng, 3031295973);
  const input = [0, 1, 2, 3, 4, 5], shuffledState = {rng: 0};
  assert.deepEqual(Random.shuffle(input, shuffledState), [5, 2, 3, 4, 0, 1]);
  assert.deepEqual(input, [0, 1, 2, 3, 4, 5]);
  assert.equal(shuffledState.rng, 567894473);
});

test('randomness is explicit, repeatable and rejects invalid dice before consuming RNG', () => {
  assert.equal(Random.seedValue(null, () => .5), 2147483648);
  assert.equal(Random.seedValue('17'), Random.seedValue(17));
  assert.throws(() => Random.seedValue(null), /RANDOM_SOURCE_REQUIRED/);
  assert.throws(() => Random.random(), /RANDOM_SOURCE_REQUIRED/);
  const state = {rng: 17};
  assert.throws(() => Random.rollDie(1, state), /DIE_SIDES_OUT_OF_RANGE/);
  assert.equal(state.rng, 17);
  assert.equal(Random.rollDie(6, state), 5);
  assert.equal(Random.random(null, () => .25), .25);
});

test('domain modules run without DOM, storage, clock, engine or ambient random', () => {
  const context = vm.createContext({});
  vm.runInContext('Math.random = () => { throw Error("ambient RNG forbidden"); };', context);
  vm.runInContext(fs.readFileSync(path.join(root, 'core/random.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(companion, 'shared/domain/standard-deck.js'), 'utf8'), context);
  assert.equal(vm.runInContext('PlayroomRandom.rollDie(6, {rng:17})', context), 5);
  assert.equal(vm.runInContext('PlayroomPackDomain.standardDeck.create(54).length', context), 54);
  for (const name of ['document', 'window', 'localStorage', 'TabletopCore']) assert.equal(context[name], undefined);
});

test('standard decks preserve identities, order and joker composition for every size', () => {
  for (const size of [36, 52, 54]) {
    const cards = Deck.create(size), first = size === 36 ? 6 : 2;
    assert.equal(cards.length, size);
    assert.equal(new Set(cards.map(card => card.id)).size, size);
    assert.deepEqual(cards.slice(0, 4), ['♠', '♥', '♦', '♣'].map(suit => ({id: `${suit}${first}`, suit, rank: first})));
    assert.deepEqual(cards.filter(card => card.joker), size === 54 ? [
      {id:'joker-red', suit:'★', rank:15, joker:true, color:'red'},
      {id:'joker-black', suit:'★', rank:15, joker:true, color:'black'}
    ] : []);
  }
});

test('Old Maid exclusions are exact and each deck owns its mutable cards', () => {
  for (const size of [36, 52, 54]) {
    const ordinary = Deck.create(size), oldmaid = Deck.create(size, {exclude:['♣12']});
    assert.equal(oldmaid.length, size - 1);
    assert.deepEqual(oldmaid, ordinary.filter(card => card.id !== '♣12'));
    assert(oldmaid.some(card => card.id === '♠12'));
    oldmaid[0].rank = 99;
    assert.notEqual(Deck.create(size)[0].rank, 99);
  }
  assert.throws(() => Deck.create(40), /DECK_SIZE_UNSUPPORTED/);
  assert.throws(() => Deck.create(36, {exclude:['missing']}), /DECK_EXCLUSION_UNKNOWN/);
  assert.throws(() => Deck.create(36, {exclude:['♣12','♣12']}), /DECK_EXCLUSION_UNKNOWN/);
});

test('both builders embed identical standalone rules and validate shared module names', () => {
  const script = `
import importlib.util,json,sys
from pathlib import Path
def load(name, root):
 spec=importlib.util.spec_from_file_location(name,Path(root)/'build.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
app=load('app_build',sys.argv[1]);packs=load('packs_build',sys.argv[2])
result=[]
for game in ['durak','gofish','oldmaid','pexeso']:
 manifest=Path(sys.argv[2])/'packs'/game/'manifest.json'
 result.append({'app':app.read_source_pack(manifest),'packs':packs.build_pack(manifest.parent)})
 for builder in [app,packs]:
  original=json.loads(manifest.read_text())
  for bad in ['standard-deck', ['../escape'], ['standard-deck','standard-deck'], [False]]:
   value={**original,'sharedDomain':bad}
   try:builder.validate_manifest(value,game)
   except ValueError:pass
   else:raise AssertionError('invalid sharedDomain accepted')
print(json.dumps(result,ensure_ascii=False))
`;
  const bundles = JSON.parse(execFileSync('python3', ['-c', script, root, companion], {encoding:'utf8', maxBuffer:4*1024*1024}));
  const E = require('../core/engine.js');
  const UI = require('../core/ui.js');
  const Packs = require('../core/packs.js');
  const manager = new Packs({engine:E, views:UI.createRegistry(), catalog:{}, storage:{get:()=>null,set(){}}});
  for (const pair of bundles) {
    assert.deepEqual(pair.app, pair.packs);
    assert.match(pair.app.files['rules.js'], /DECK_SIZE_UNSUPPORTED/);
    manager.install(manager.prepare(pair.app));
    for (const deck of [36,52,54]) {
      let state=E.createGame(pair.app.manifest.id,{deck,seed:17,players:[{name:'One'},{name:'Two'}]});
      assert(E.validateState(state));
      for(let step=0;step<5&&state.status==='playing';step++) {
        const action=E.botAction(state);
        assert(action, pair.app.manifest.id);
        state=E.applyAction(state,state.turn,action);
        assert(E.validateState(state));
      }
    }
  }
});
