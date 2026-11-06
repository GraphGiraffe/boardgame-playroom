'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../core/engine.js');
const Session = require('../core/session.js');

Core.register({
  project(out,viewer,state){const data=Core.clone(state.data);out.data={...data,hands:data.hands.map((hand,index)=>viewer===index?hand:hand.map(()=>({hidden:true}))),drawPile:data.drawPile.map(()=>({hidden:true}))};},
  id: 'session-fixture', name: 'Session fixture', min: 2, max: 2,
  description: 'Deterministic session integration fixture', rules: ['Advance one step'],
  presets: [{id: 'standard', label: 'Standard'}], scoreLabel: 'points',
  create(state) {
    state.data = {count: 0, hands: [[{id: 'a', value: 'secret-a'}], [{id: 'b', value: 'secret-b'}]],
      drawPile: [{id: 'c', value: 'secret-c'}], payload: Array(32).fill('shared-board-component')};
  },
  legal() { return [{type: 'advance', label: 'Advance'}]; },
  apply(state, actor) {
    state.data.count++;
    Core.event(state, `Private choice ${state.data.count}`, actor, 'action',
      {privateTo: actor, publicText: 'A hidden choice was made', secret: 'never-public'});
    state.turn = 1 - actor;
  },
  validateState(state) {
    if (!Number.isInteger(state.data.count) || state.data.count < 0) throw Error('Invalid fixture count');
    return true;
  }
});

const create = options => new Session(Core, 'session-fixture', options);
const step = session => session.act(session.current.turn, {type: 'advance'});

test('constructor accepts omitted options and owns a detached options copy', () => {
  assert.equal(create().current.move, 0);
  const options = {seed: 'fixture', custom: {level: 2}};
  const session = create(options);
  options.custom.level = 9;
  assert.equal(session.options.custom.level, 2);
  assert.throws(() => { session.options.custom.level = 4; }, TypeError);
  assert.throws(() => create(null), /параметр|настро|options/i);
});

test('history and returned current states are read-only, even across journal compaction', () => {
  const session = create({seed: 'fixture'}), first = session.current;
  const next = step(session);
  assert.throws(() => { next.data.count = 500; }, TypeError);
  assert.throws(() => { session.states.push(first); }, TypeError);
  assert.throws(() => { session.states = []; }, TypeError);
  for (let i = 0; i < 12; i++) step(session);
  assert.equal(first.data.count, 0);
  assert.equal(first.events.length, 1);
  assert.equal(session.states[0].data.count, 0);
  assert.equal(session.current.data.count, 13);
  assert.equal(next.data.count, 1);
});

test('export is detached from the live session and from earlier exports', () => {
  const session = create({seed: 'fixture'});
  step(session);
  const exported = session.export();
  exported.options.seed = 'changed';
  exported.states[0].data.hands[0][0].value = 'changed';
  exported.states.push({game: 'invalid'});
  assert.equal(session.options.seed, 'fixture');
  assert.equal(session.states.length, 2);
  assert.equal(session.states[0].data.hands[0][0].value, 'secret-a');
  assert.equal(session.export().states.length, 2);
});

test('compact and plain serialization restore exactly the readable export', () => {
  const session = create({seed: 'fixture'});
  step(session);
  assert.equal(JSON.parse(session.serialize()).version, 3);
  assert.deepEqual(Session.restore(Core, JSON.parse(session.serialize())).export(), session.export());
  assert.deepEqual(JSON.parse(session.serialize({compact: false})), session.export());
});

test('failed actions do not change state, history or updatedAt', () => {
  const session = create({seed: 'fixture'}), saved = session.export();
  assert.throws(() => session.act(1, {type: 'advance'}));
  assert.throws(() => session.act(0, {type: 'unknown'}));
  assert.deepEqual(session.export(), saved);
});

test('replay projections stay private and detached for all prior snapshots', () => {
  const session = create({seed: 'fixture'});
  for (let i = 0; i < 8; i++) step(session);
  for (let i = 0; i < session.states.length; i++) {
    const view = session.view(0, i);
    assert.equal(view.data.hands[0][0].value, 'secret-a');
    assert.deepEqual(view.data.hands[1], [{hidden: true}]);
    assert.deepEqual(view.data.drawPile, [{hidden: true}]);
    assert.equal(view.rng, undefined);
    for (const event of view.events.filter(e => e.player === 1)) {
      assert.equal(event.text, 'A hidden choice was made');
      assert.equal(event.secret, undefined);
    }
    view.data.hands[0][0].value = 'modified projection';
    assert.equal(session.states[i].data.hands[0][0].value, 'secret-a');
  }
});

test('history indices clamp at either end and reject invalid numeric inputs', () => {
  const session = create({seed: 'fixture'});
  step(session);
  assert.equal(session.view(0, -100).move, 0);
  assert.equal(session.view(0, 100).move, 1);
  for (const index of [NaN, Infinity, -Infinity, 0.5, '0', null]) {
    assert.throws(() => session.view(0, index), /сним|индекс|номер/i);
  }
});

test('restore round trip resumes deterministic history and isolates its input', () => {
  const session = create({seed: 'fixture', mode: 'pass'});
  for (let i = 0; i < 8; i++) step(session);
  const saved = session.export(), restored = Session.restore(Core, saved);
  assert.deepEqual(restored.export(), saved);
  saved.states.at(-1).data.count = 999;
  saved.options.mode = 'solo';
  assert.equal(restored.current.data.count, 8);
  assert.equal(restored.options.mode, 'pass');
  assert.deepEqual(step(restored), step(session));
});

test('unknown save keys cannot overwrite methods, getters or the session prototype', () => {
  const saved = create({seed: 'fixture'}).export();
  Object.assign(saved, JSON.parse('{"act":null,"view":false,"export":42,"current":0,"__proto__":{"polluted":true}}'));
  const restored = Session.restore(Core, saved);
  assert.equal(typeof restored.act, 'function');
  assert.equal(typeof restored.view, 'function');
  assert.equal(typeof restored.export, 'function');
  assert.equal(restored.polluted, undefined);
  assert.equal(restored.current.move, 0);
});

test('restore rejects malformed envelope/options/timestamps before UI can observe a session', () => {
  const mutations = [
    s => { s.options = null; }, s => { delete s.options; }, s => { s.options = []; },
    s => { s.options.mode = 'network'; }, s => { s.options.openHands = 'yes'; },
    s => { s.states = []; }, s => { s.game = 'missing-pack'; },
    s => { s.createdAt = 'yesterday'; }, s => { s.updatedAt = s.createdAt - 1; },
    s => { s.version = 999; }, s => { s.format = 'foreign'; }
  ];
  for (const mutate of mutations) {
    const saved = create({seed: 'fixture'}).export(); mutate(saved);
    assert.throws(() => Session.restore(Core, saved), /Сохранение/);
  }
  for (const saved of [null, undefined, 42, [], {}]) assert.throws(() => Session.restore(Core, saved), /Сохранение/);
});

test('restore validates every snapshot and detects broken timeline continuity', () => {
  const mutations = [
    s => { s.states[0] = null; }, s => { s.states[0].data = {}; },
    s => { s.states[0].events = null; }, s => { s.states[0].turn = 50; },
    s => { s.states[0].players[0].score = null; }, s => { s.states[0].status = 'unknown'; },
    s => { s.states[0].rng = -1; }, s => { s.states[0].move = 9; },
    s => { s.states[1].preset = 'other'; }, s => { s.states[0].status = 'finished'; },
    s => { s.states[1].openHands = true; }, s => { s.states[1].players[0].name = 'different'; }
  ];
  for (const mutate of mutations) {
    const session = create({seed: 'fixture'}); step(session);
    const saved = session.export(); mutate(saved);
    assert.throws(() => Session.restore(Core, saved), /Сохранение/);
  }
});

test('long histories preserve every turn with linear event storage and serialization size', t => {
  const session = create({seed: 'fixture'}), started = performance.now();
  for (let i = 0; i < 250; i++) step(session);
  const halfwayBytes = Buffer.byteLength(session.serialize());
  for (let i = 0; i < 250; i++) step(session);
  const serializationStart = performance.now(), serialized = session.serialize();
  const serializationMs = performance.now() - serializationStart;
  const bytes = Buffer.byteLength(serialized);
  assert.equal(session.states.length, 501);
  assert.equal(session.current.events.length, 501);
  assert.ok(session.states.slice(0, -1).every(state => state.events.length <= 4));
  assert.ok(bytes < halfwayBytes * 2.1, `Save grew faster than linearly: ${halfwayBytes} -> ${bytes}`);
  assert.equal(Session.restore(Core, JSON.parse(serialized)).current.move, 500);
  t.diagnostic(`500 turns: ${(performance.now()-started).toFixed(1)} ms; serialize ${serializationMs.toFixed(1)} ms; ${(bytes/1024).toFixed(1)} KiB`);
});

test('compact initial, middle and final saves preserve all snapshots and the full journal', () => {
  const session = create({seed: 'fixture'});
  for (let i = 0; i <= 20; i++) {
    if (i) step(session);
    const serialized = session.serialize();
    assert.deepEqual(Session.restore(Core, JSON.parse(serialized)).export(), session.export());
    assert.equal(session.serialize(), serialized, 'Serializing an unchanged session must not grow its node pool');
  }
});

test('compact cache grows by new snapshot data rather than whole history prefixes', () => {
  const session = create({seed: 'fixture'});
  session.serialize({history:'snapshots'});
  for (let i = 0; i < 50; i++) { step(session); session.serialize({history:'snapshots'}); }
  const first = JSON.parse(session.serialize({history:'snapshots'}));
  for (let i = 0; i < 50; i++) { step(session); session.serialize({history:'snapshots'}); }
  const second = JSON.parse(session.serialize({history:'snapshots'}));
  assert.ok(second.nodes.length < first.nodes.length * 2.1);
  assert.ok(session.serialize({history:'snapshots'}).length < session.serialize({compact: false}).length * 0.6);
  assert.equal(Session.restore(Core, second).current.events.length, 101);
});

test('compact decoder rejects unknown tags, malformed references and duplicate object keys', () => {
  const mutations = [
    s => { s.encoding = 'foreign'; }, s => { s.nodes[0][0] = 'code'; },
    s => { s.options = [-1]; }, s => { s.states[0] = [s.nodes.length]; },
    s => { s.journal[0] = [0, 1]; }, s => { s.journal = {}; }, s => { s.journal = []; },
    s => { s.nodes = [['a', [[0]]]]; },
    s => { s.nodes.push(['o', ['same', 1, 'same', 2]]); },
    s => { s.nodes.push(['a', [{}]]); }
  ];
  for (const mutate of mutations) {
    const saved = JSON.parse(create({seed: 'fixture'}).serialize({history:'snapshots'})); mutate(saved);
    assert.throws(() => Session.restore(Core, saved), /Сохранение/);
  }
});

test('compact decoder bounds nesting depth and exponentially expanding references', () => {
  for (const exponential of [false, true]) {
    const saved = JSON.parse(create({seed: 'fixture'}).serialize({history:'snapshots'}));
    saved.nodes = [['a', [null]]];
    for (let i = 1; i < (exponential ? 30 : 130); i++) {
      saved.nodes.push(['a', exponential ? [[i - 1], [i - 1]] : [[i - 1]]]);
    }
    assert.throws(() => Session.restore(Core, saved), /Сохранение/);
  }
});

test('compact decode treats special property names as data without prototype writes', () => {
  const options = JSON.parse('{"seed":"fixture","__proto__":{"polluted":true}}');
  const restored = Session.restore(Core, JSON.parse(create(options).serialize()));
  assert.equal(Object.getPrototypeOf(restored.options), Object.prototype);
  assert.equal(Object.hasOwn(restored.options, '__proto__'), true);
  assert.equal(restored.options.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
});

test('saved library preserves the active game if archiving or activation runs out of space', () => {
  const Library = require('../app/library.js');
  for (const failedKey of ['playroom.paused.v1.first', 'playroom.session.v1']) {
    const values = new Map(); let reject = null;
    const store = {get length(){return values.size;},key:i=>[...values.keys()][i],getItem:key=>values.get(key)??null,
      setItem(key,value){if(key===reject)throw Error('QuotaExceededError');values.set(key,value);},removeItem:key=>values.delete(key)};
    const library = new Library(()=>store, Core, Session), first=create({seed:'first'}), next=create({seed:'next'});
    library.activate(first,'first');const original=store.getItem('playroom.session.v1');reject=failedKey;
    assert.throws(()=>library.activate(next,'next'),/Quota/);
    assert.equal(store.getItem('playroom.session.v1'),original);
    assert.equal(library.list().length,1,'an interrupted activation must not duplicate the previous game');
    assert.deepEqual(library.current().session.export(),first.export());
    reject=null;library.activate(next,'next');
    assert.equal(library.list().length,2);assert.deepEqual(library.open('first').export(),first.export());
  }
});

test('deleting an inactive archive keeps the other two sessions through a fresh Library instance', () => {
  const Library = require('../app/library.js'), values = new Map();
  const store = {get length(){return values.size;}, key:i=>[...values.keys()][i],
    getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const library=new Library(()=>store,Core,Session);
  const first=create({seed:'first'}), second=create({seed:'second'}), third=create({seed:'third'});
  step(first);
  library.activate(first,'first');library.activate(second,'second');library.activate(third,'third');
  library.activate(library.open('second'),'second');
  assert.deepEqual(library.list().map(record=>record.id).sort(),['first','second','third']);
  library.remove('first');
  assert.equal(library.current().id,'second');
  assert.deepEqual(library.open('second').export(),second.export());
  assert.deepEqual(library.open('third').export(),third.export());
  const afterReload=new Library(()=>store,Core,Session);
  assert.deepEqual(afterReload.list().map(record=>record.id).sort(),['second','third']);
  assert.deepEqual(afterReload.current().session.export(),second.export());
  afterReload.remove('second');
  assert.throws(()=>afterReload.write(second,'second'),'A deleted active game cannot be revived by a stale pagehide');
  assert.deepEqual(new Library(()=>store,Core,Session).list().map(record=>record.id),['third']);
});

test('legacy and unreadable saves survive new games; a deleted game cannot resurrect on pagehide', () => {
  const Library = require('../app/library.js'),values=new Map();
  const store={get length(){return values.size;},key:i=>[...values.keys()][i],getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const library=new Library(()=>store,Core,Session),legacy=create({seed:'legacy'}),next=create({seed:'next'});
  store.setItem('playroom.session.v1',legacy.serialize());const id=library.current().id;
  library.activate(next,'next');assert.deepEqual(library.open(id).export(),legacy.export());
  step(legacy);library.write(legacy,id);
  assert.equal(library.current().id,'next','a previous tab saves its own paused game without taking over the active key');
  assert.equal(library.open(id).current.move,1);
  library.remove(id);assert.throws(()=>library.write(legacy,id));assert.equal(library.list().length,1);
  store.setItem('playroom.session.v1','{broken');library.activate(next,'recovered');
  assert(library.list().some(record=>record.invalid),'unreadable data is preserved for explicit removal');
  assert(library.list().some(record=>record.id==='recovered'&&!record.invalid));
});


test('replacement metadata changes future snapshots without rewriting history and restores exactly',()=>{
  const session=create({players:[{name:'First'},{name:'Old'}]});step(session);const old=session.current;
  session.setPlayerMetadata(1,{name:'Replacement',bot:false,avatar:'circle-red'});assert.equal(session.current,old);
  step(session);assert.equal(session.current.players[1].name,'Replacement');assert.equal(session.states[1].players[1].name,'Old');
  assert.deepEqual(session.current.playerChanges,[{index:1,name:'Replacement',bot:false,avatar:'circle-red'}]);
  step(session);assert.equal(session.current.playerChanges,undefined);
  for(const compact of [true,false])assert.deepEqual(Session.restore(Core,JSON.parse(session.serialize({compact}))).current,session.current);
  const bad=session.export();delete bad.states[2].playerChanges;assert.throws(()=>Session.restore(Core,bad));
  for(const metadata of [{name:''},{name:'x'.repeat(41)},{bot:'yes'},{score:42},{}])assert.throws(()=>session.setPlayerMetadata(1,metadata));
  assert.throws(()=>session.setPlayerMetadata(-1,{name:'No'}));
});

test('a prepared move cannot commit after its participant metadata changes',()=>{
  const session=create(),candidate=session.prepare(0,{type:'advance'});session.setPlayerMetadata(0,{name:'New'});
  assert.throws(()=>session.commitPrepared(candidate),/current/);assert.equal(session.current.move,0);step(session);assert.equal(session.current.players[0].name,'New');
});


test('library metadata index lists and finds references without loading a full history',()=>{
  const Library=require('../application/library.js'),values=new Map();
  const store={get length(){return values.size;},key:index=>[...values.keys()][index],getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const library=new Library(()=>store,Core,Session,null,{idFactory:()=> 'indexed-game'}),session=create({seed:'index'});
  for(let i=0;i<20;i++)step(session);
  library.activate(session,library.newId());
  const NoRestore={packVersionOf:Session.packVersionOf,restore(){throw Error('list must not decode history');}};
  const fresh=new Library(()=>store,Core,NoRestore),row=fresh.list()[0];
  assert.equal(row.move,20);assert.equal(row.invalid,undefined);assert.equal(row.game,session.game);
  assert.deepEqual(fresh.references(session.game,session.packVersion),['indexed-game']);
  row.players[0]='changed';assert.notEqual(fresh.list()[0].players[0],'changed');
  step(session);library.write(session,'indexed-game');assert.equal(fresh.list()[0].move,21);
  library.remove('indexed-game');assert.deepEqual(fresh.list(),[]);
});

test('removed local saves preserve the library error instead of throwing during localization',()=>{
 const Library=require('../app/library.js');const library=new Library(()=>({getItem:()=>null}),Core,Session);
 assert.throws(()=>library.write(create({seed:'removed-local'}),'removed-local'),error=>error.code==='LIBRARY_REMOVED'&&error.name==='Error');
});

test('active save identity never restores a session and follows replacement and removal',()=>{
 const Library=require('../application/library.js'),data=new Map(),store={getItem:key=>data.get(key)||null};const library=new Library(()=>store,Core,Session);library.restore=()=>{throw Error('Identity lookup must not restore history');};
 data.set('playroom.session.v1',JSON.stringify({...create().export(),libraryId:'first'}));assert.equal(library.currentId(),'first');assert.equal(library.currentId(),'first');
 data.set('playroom.session.v1',JSON.stringify({...create().export(),libraryId:'replacement'}));assert.equal(library.currentId(),'replacement');data.delete('playroom.session.v1');assert.equal(library.currentId(),null);assert.equal(library.activeIdentity,null);
});

test('legacy library summaries are read once and invalidate with the saved bytes',()=>{
 const Library=require('../application/library.js'),data=new Map(),store={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:key=>data.get(key)||null,removeItem:key=>data.delete(key)};let restores=0;const port={restore:(...args)=>{restores++;return Session.restore(...args);}};const library=new Library(()=>store,Core,port),saved={...create().export(),libraryId:'legacy-menu'};data.set('playroom.session.v1',JSON.stringify(saved));const first=library.list();assert.equal(restores,1);first[0].players[0]='mutated';assert.notEqual(library.list()[0].players[0],'mutated');assert.equal(restores,1);saved.updatedAt++;data.set('playroom.session.v1',JSON.stringify(saved));library.list();assert.equal(restores,2);library.remove('legacy-menu');assert.equal(library.summaryCache.size,0);assert.deepEqual(library.list(),[]);
});
