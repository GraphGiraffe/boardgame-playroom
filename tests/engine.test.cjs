'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const E = require('../core/engine.js');
const packsRoot=require('node:fs').realpathSync(__dirname+'/../packs');
const StandardDeck=require(require('node:path').join(packsRoot,'../shared/domain/standard-deck.js'));
for (const game of ['uno', 'domino', 'durak', 'checkers', 'snakes', 'ludo']) require(`../packs/${game}/rules.js`);
const GAMES = E.GAMES;
const create = (game, count = 2, preset = 'classic', seed = 23, options = {}) => E.createGame(game, { players: Array.from({ length: count }, (_, i) => ({ name: `P${i}`, bot: true })), preset, seed, ...options });
const unoRules=require('../packs/uno/domain/game.js')({shuffle:E.shuffle,ending:require(require('node:path').join(packsRoot,'../shared/domain/end-policy.js'))});
const act = (s, action) => {if(!s.unitPosition)return E.applyAction(s,s.turn,action);if(!actions(s).some(candidate=>Object.entries(action).every(([key,value])=>candidate[key]===value)))throw Error('ACTION_UNAVAILABLE');const changed=unoRules.reduce(s,s.turn,action),n=changed.position;n.move=(s.move||0)+1;n.winner=n.winners[0]??null;n.players.forEach((player,index)=>player.score=n.data.points[index]);n.events=[...s.events,...changed.events.map((event,index)=>({...event,id:(s.events.at(-1)?.id||0)+index+1,revision:n.move}))];return n;};
const actions = s => s.unitPosition?unoRules.actions(s,s.turn).map(choice=>choice.command):E.legalActions(s,s.turn);
const types = s => actions(s).map(a => a.type);
const has = (s, query) => actions(s).some(a => Object.entries(query).every(([k, v]) => a[k] === v));
let fixtureId = 0;
const uno = (color, value) => ({ id: `fixture-${fixtureId++}`, color, value });
const dominoRules=require('../packs/domino/domain/game.js')({shuffle:E.shuffle,ending:require(require('node:path').join(packsRoot,'../shared/domain/end-policy.js'))});
const tile = (a, b) => ({ id: `fixture-${fixtureId++}`, a, b });
const card = (suit, rank) => ({ id: `${suit}${rank}`, suit, rank });
function unoState(hands, top = uno('red', '5'), drawPile = []) {
  const s = create('uno', hands.length);Object.assign(s,{turn:0,playerCount:hands.length,winners:[],revision:0,unitPosition:true});
  Object.assign(s.data, { hands, discard: [top], drawPile, color: top.color, drawn: null, noDraw: false, stalled: 0 }); return s;
}
function dominoState(hands, chain, stock = []) {
  // Minimal local-rule fixtures deliberately omit the rest of the double-six deck.
  return {playerCount:hands.length,turn:0,status:'playing',winners:[],data:{ending:require(require('node:path').join(packsRoot,'../shared/domain/end-policy.js')).create(hands.length,0),hands,chain,stock,passes:0}};
}
function durakState(hands, drawPile = []) {
  const s = create('durak'); s.turn = 0;
  s.data = { variant:'throwin',endCondition:'lastfool',composing:false,boutOrigin:0,deckSize: 36, jokerMode:'universal', hands, drawPile, trump: card('♥', 6), table: [], attacker: 0, defender: 1, attackCursor:0, passes:0, discard: [], taking: false, handSize: 6, attackLimit: Math.min(6, hands[1].length) }; const used=new Set([...hands.flat(),...drawPile].map(card=>card.id));s.data.discard=StandardDeck.create(36).filter(card=>!used.has(card.id));return s;
}
function checkersState(pieces, turn = 0) {
  const s = create('checkers'); s.turn = turn; s.data.board.fill(null); s.data.repetitions = {};
  for (const [index, owner, king = false] of pieces) s.data.board[index] = { id: `checker-${index}`, owner, king }; return s;
}
function rngForRoll(wanted, sides = 6) {
  for (let rng = 0; rng < 10000; rng++) if (E.rollDie(sides, { rng }) === wanted) return rng;
  throw Error('Unable to find die fixture');
}
function cardInventory(s) {
  const d = s.data;
  if (s.game === 'uno') return [...d.hands.flat(), ...d.drawPile, ...d.discard];
  if (s.game === 'domino') return [...d.hands.flat(), ...d.stock, ...d.chain];
  if (s.game === 'durak') return [...d.hands.flat(), ...d.drawPile, ...d.discard, ...d.table.flatMap(p => p.defense ? [p.attack, p.defense] : [p.attack])];
  return null;
}

test('registry exposes five independent packs and isolates metadata', () => {
  assert.deepEqual(GAMES.map(g => g.id), ['uno', 'domino', 'durak', 'checkers', 'snakes', 'ludo']);
  assert.throws(() => E.register(E.get('uno')), /зарегистрирован/);
  assert.throws(() => create('missing'));
  assert.throws(() => create('uno', 1)); assert.equal(create('durak', 3).players.length,3); assert.throws(() => create('uno', 2, 'missing'));
  const metadata = E.GAMES; metadata[0].presets[0].label = 'corrupted';
  assert.notEqual(E.GAMES[0].presets[0].label, 'corrupted');
});

test('finished results keep shared places and survive projection', () => {
  const state=create('snakes',4);
  state.data.positions=[state.data.finish,30,30,0];
  E.finish(state,0);
  assert.deepEqual(state.result.values,[state.data.finish,30,30,0]);
  assert.deepEqual(state.result.places,[1,2,2,3]);
  assert.deepEqual(E.project(state,2).result,state.result);
  assert.equal(E.validateState(state),true);
  const legacy=E.clone(state);delete legacy.result;
  assert.equal(E.validateState(legacy),true);
});

test('immutable transitions reject forged actors, card ids, wrong colors and duplicate moves', () => {
  for (const game of GAMES) {
    const s = create(game.id), before = JSON.stringify(s), a = E.botAction(s);
    assert.deepEqual(E.legalActions(s, (s.turn + 1) % s.players.length), []);
    assert.throws(() => E.applyAction(s, (s.turn + 1) % s.players.length, a));
    assert.throws(() => act(s, { type: 'forged' })); assert.throws(() => act(s, null));
    assert.deepEqual(E.createGame(game.id, { players: s.players, preset: s.preset, seed: 23 }), s);
    const n = act(s, { ...a, label: 'ignored', injected: true });
    assert.equal(JSON.stringify(s), before); assert.equal(n.move, s.move + 1);
    assert.equal('injected' in n, false);
    n.status = 'finished'; assert.deepEqual(actions(n), []); assert.equal(E.botAction(n), null); assert.throws(() => act(n, a));
  }
  const s = unoState([[uno('wild', 'wild')], [uno('blue', '1')]]);
  assert.throws(() => act(s, { type: 'play', card: s.data.hands[0][0].id, color: 'purple' }));
  assert.throws(() => act(s, { type: 'play', card: 'missing', color: 'red' }));
});

test('projection protects hands, stock, RNG, drawn identity and private event payloads', () => {
  for (const game of ['uno', 'domino', 'durak']) {
    const s = create(game, 2), own = s.turn;
    E.event(s, 'secret card', own, 'draw', { privateTo: own, publicText: 'one card', card: { secret: 'value' } });
    const p = E.project(s, own), opponent = E.project(s, 1 - own), spectator = E.project(s, -1);
    assert.deepEqual(p.data.hands[own], s.data.hands[own]);
    assert(opponent.data.hands[own].every(c => c.hidden && Object.keys(c).length === 1));
    assert(spectator.data.hands.flat().every(c => c.hidden)); assert.equal(spectator.rng, undefined);
    assert.equal(opponent.events.at(-1).text, 'one card'); assert.equal(opponent.events.at(-1).card, undefined);
    assert.equal(p.events.at(-1).text, 'secret card');
    const pile = game === 'domino' ? 'stock' : 'drawPile'; assert(spectator.data[pile].every(c => c.hidden));
    s.openHands = true; assert.deepEqual(E.project(s, 0).data.hands, s.data.hands);
    for (const viewer of [-1, 99, 0.5, null, undefined, '0']) assert.deepEqual(E.project(s, viewer).data.hands, s.data.hands);
    s.openHands = false;
    for (const viewer of [-1, 99, 0.5, null, undefined, '0']) assert(E.project(s, viewer).data.hands.flat().every(c => c.hidden));
    p.players[0].name = 'changed'; assert.equal(s.players[0].name, 'P0');
  }
  let s = create('uno'); s = act(s, { type: 'draw' });
  assert.equal(E.project(s, s.turn).data.drawn, s.data.drawn); assert.equal(E.project(s, 1 - s.turn).data.drawn, true);
});

test('event IDs remain monotonic after compacting historical events', () => {
  let s = create('snakes'); for (let i = 0; i < 8; i++) s = act(s, { type: 'roll' });
  const last = s.events.at(-1).id; s.events = s.events.slice(-1); s = act(s, { type: 'roll' }); assert.equal(s.events[1].id, last + 1);
});

test('generic multiple zones preserve components and reveal only explicit public items', () => {
  const zones = { deckA: E.createZone('deckA', { items: [{ id: 'a' }, { id: 'b' }] }), deckB: E.createZone('deckB', { items: [{ id: 'c' }] }), hand: E.createZone('hand', { visibility: 'owner', owner: 0 }), table: E.createZone('table', { visibility: 'public' }) };
  E.moveComponent(zones, 'deckA', 'hand', 'a'); E.moveComponent(zones, 'deckB', 'table', 'c');
  assert.deepEqual(E.projectZones(zones, 0).hand.items, [{ id: 'a' }]); assert.deepEqual(E.projectZones(zones, 1).hand.items, [{ hidden: true }]);
  E.reveal(zones, 'hand', 'a'); assert.deepEqual(E.projectZones(zones, -1).hand.items, [{ id: 'a', revealed: true }]);
  E.reveal(zones, 'hand', 'a', false); assert.deepEqual(E.projectZones(zones, -1).hand.items, [{ hidden: true }]);
  for (const owner of [null, -1, 0.5, '0']) {
    const invalidOwner = { private: E.createZone('private', { visibility: 'owner', owner, items: [{ id: 'secret' }] }) };
    assert.deepEqual(E.projectZones(invalidOwner, owner).private.items, [{ hidden: true }]);
  }
  assert.deepEqual(Object.values(zones).flatMap(z => z.items).map(c => c.id).sort(), ['a','b','c']);
  const before = JSON.stringify(zones); assert.throws(() => E.moveComponent(zones, 'deckA', 'missing', 'b')); assert.equal(JSON.stringify(zones), before);
});

test('dice and seeded shuffle support d4/d6/d8/d10/d12/d20 with deterministic replay', () => {
  for (const sides of [4, 6, 8, 10, 12, 20]) {
    const a = { rng: 123 }, b = { rng: 123 }, seen = new Set();
    for (let i = 0; i < 1000; i++) { const n = E.rollDie(sides, a); assert.equal(n, E.rollDie(sides, b)); assert(n >= 1 && n <= sides); seen.add(n); }
    assert.equal(seen.size, sides);
  }
  for (const sides of [0, 1, -1, 2.5, NaN, 1001]) assert.throws(() => E.rollDie(sides));
  const source = Array.from({ length: 52 }, (_, i) => i), before = [...source];
  assert.deepEqual(E.shuffle(source, { rng: 123 }), E.shuffle(source, { rng: 123 })); assert.deepEqual(source, before);
  assert.deepEqual(E.shuffle(source, { rng: 123 }).sort((a, b) => a - b), source);
});

test('UNO +4 is prohibited by current color, permitted by matching number only', () => {
  const wild = uno('wild', '+4'), colored = uno('red', '9');
  let s = unoState([[wild, colored], [uno('green', '3')]]); assert(!has(s, { card: wild.id }));
  s.data.hands[0][1] = uno('blue', '5'); assert.equal(actions(s).filter(a => a.card === wild.id).length, 4);
});

test('UNO drawing restricts play to the drawn card and disallows repeated draw', () => {
  const old = uno('red', '3'), drawn = uno('red', '8');
  let s = unoState([[old], [uno('blue', '2')]], uno('red', '5'), [drawn]); s = act(s, { type: 'draw' });
  assert(!has(s, { card: old.id })); assert(has(s, { card: drawn.id })); assert(types(s).includes('pass')); assert(!types(s).includes('draw'));
  s = act(s, { type: 'pass' }); assert.equal(s.turn, 1); assert.equal(s.data.drawn, null);
});

test('UNO recycles all but top discard and forced final penalties count toward score', () => {
  let s = unoState([[uno('yellow','2')], [uno('green','4')]], uno('red','5'));
  const top = s.data.discard[0]; const recycled = uno('blue','8'); s.data.discard.unshift(recycled);
  s = act(s, { type: 'draw' }); assert.equal(s.data.hands[0].at(-1).id, recycled.id); assert.deepEqual(s.data.discard, [top]);
  for (const [value, count] of [['+2', 2], ['+4', 4]]) {
    const special = uno(value === '+4' ? 'wild' : 'red', value), hand = [uno('blue', '3')], pile = Array.from({ length: count }, () => uno('green', '2'));
    s = unoState([[special], hand], uno('red','5'), pile);
    s = act(s, { type: 'play', card: special.id, ...(value === '+4' ? { color: 'blue' } : {}) });
    assert.equal(s.status, 'finished'); assert.equal(s.winner, 0); assert.equal(s.data.hands[1].length, 1 + count); assert.equal(s.players[0].score, 3 + 2 * count);
  }
});

test('UNO reverse/skip directions, action scores and stock exhaustion', () => {
  for (const count of [2, 3, 4]) for (const value of ['skip', 'reverse']) {
    const special = uno('red', value), s = unoState(Array.from({length:count}, (_, i) => i ? [uno('blue','1')] : [special, uno('green','2')]));
    const n = act(s, {type:'play',card:special.id}); assert.equal(n.turn, value === 'skip' ? 2 % count : count === 2 ? 0 : count - 1);
    assert.equal(n.data.direction, value === 'reverse' ? -1 : 1);
  }
  let s = unoState([[uno('yellow','2')],[uno('green','3')]]);
  for (let i = 0; i < 2; i++) { s = act(s,{type:'draw'}); s = act(s,{type:'pass'}); }
  assert.equal(s.status,'finished'); assert.equal(s.winner,null);
  const last = uno('red','1'); s = unoState([[last],[uno('blue','reverse'),uno('wild','wild'),uno('green','9')]]);
  s = act(s,{type:'play',card:last.id}); assert.equal(s.players[0].score,79);
});

test('domino orients both endpoints and enforces draw-until-playable', () => {
  const left = tile(3, 6), right = tile(1, 5);
  let s = dominoState([[left,tile(0,0)],[right,tile(2,2)]],[tile(3,1)]);
  s = dominoRules.reduce(s,s.turn,{type:'play',card:left.id,side:'left'}).position; assert.deepEqual([s.data.chain[0].a,s.data.chain[0].b],[6,3]);
  s = dominoRules.reduce(s,s.turn,{type:'play',card:right.id,side:'right'}).position; assert.deepEqual([s.data.chain.at(-1).a,s.data.chain.at(-1).b],[1,5]);
  const fitting=tile(1,4), blocked=tile(2,2);
  s=dominoState([[tile(6,6)],[tile(3,3)]],[tile(1,1)],[fitting,blocked]);
  assert.deepEqual(dominoRules.actions(s,s.turn).map(choice=>choice.command.type),['draw']); s=dominoRules.reduce(s,s.turn,{type:'draw'}).position; assert.equal(s.turn,0); assert.deepEqual(dominoRules.actions(s,s.turn).map(choice=>choice.command.type),['draw']);
  s=dominoRules.reduce(s,s.turn,{type:'draw'}).position; assert(dominoRules.actions(s,s.turn).some(choice=>choice.command.card===fitting.id)); assert(!dominoRules.actions(s,s.turn).map(choice=>choice.command.type).includes('draw')); assert(!dominoRules.actions(s,s.turn).map(choice=>choice.command.type).includes('pass'));
});

test('domino blocked minimum, tie, empty-hand victory and score are exact', () => {
  for (const [other, winner, score] of [[tile(2,2),0,4],[tile(1,1),null,0]]) {
    let s=dominoState([[tile(0,2)],[other]],[tile(6,6)]); s=dominoRules.reduce(s,s.turn,{type:'pass'}).position; s=dominoRules.reduce(s,s.turn,{type:'pass'}).position;
    assert.equal(s.status,'finished'); assert.equal(s.winners[0]??null,winner); assert.equal(dominoRules.score(s)[0],score);
  }
  const last=tile(1,2); let s=dominoState([[last],[tile(3,5)]],[tile(1,1)],[tile(6,6)]);
  s=dominoRules.reduce(s,s.turn,{type:'play',card:last.id,side:'right'}).position; assert.equal(s.winners[0],0); assert.equal(dominoRules.score(s)[0],8);
});

test('durak beats by suit/rank or trump, attacker may add defense rank', () => {
  let s=durakState([[card('♠',7),card('♦',8)],[card('♠',8),card('♣',14),card('♥',6)]]);
  s=act(s,{type:'attack',card:'♠7'}); assert(has(s,{type:'defend',card:'♠8',target:0})); assert(has(s,{type:'defend',card:'♥6',target:0})); assert(!has(s,{card:'♣14'}));
  s=act(s,{type:'defend',card:'♠8',target:0}); assert(has(s,{type:'attack',card:'♦8'})); assert(types(s).includes('done'));
  s=durakState([[card('♥',7)],[card('♠',14),card('♥',6),card('♥',8)]]); s=act(s,{type:'attack',card:'♥7'});
  assert(!has(s,{card:'♠14'})); assert(!has(s,{card:'♥6'})); assert(has(s,{card:'♥8'}));
});

test('durak take permits throwing only matching ranks within start hand limit', () => {
  let s=durakState([[card('♠',7),card('♦',7),card('♣',7),card('♣',9)],[card('♠',6),card('♦',6)]]);
  const discarded=s.data.discard.length;s=act(s,{type:'attack',card:'♠7'}); s=act(s,{type:'take'}); assert.equal(s.turn,0); assert(!has(s,{card:'♣9'}));
  s=act(s,{type:'attack',card:'♦7'}); assert.deepEqual(types(s),['done']); s=act(s,{type:'done'});
  assert.equal(s.data.hands[1].length,4); assert.equal(s.data.discard.length,discarded); assert.equal(s.turn,0); assert.equal(s.data.table.length,0); assert.equal(s.data.attackLimit,4);
});

test('durak draws attacker first, trump last, and resolves last cards at end of bout', () => {
  let s=durakState([[card('♠',7)],[card('♠',8)]],[card('♥',6),card('♦',10)]);const discarded=s.data.discard.length;
  s=act(s,{type:'attack',card:'♠7'}); assert.equal(s.status,'playing'); s=act(s,{type:'defend',card:'♠8',target:0}); assert.equal(s.status,'playing');
  s=act(s,{type:'done'}); assert.deepEqual(s.data.hands[0].map(c=>c.id),['♦10','♥6']); assert.equal(s.data.discard.length,discarded+2); assert.equal(s.winner,1);
  s=durakState([[card('♠',7)],[card('♠',8)]]); s=act(s,{type:'attack',card:'♠7'}); s=act(s,{type:'defend',card:'♠8',target:0}); s=act(s,{type:'done'});
  assert.equal(s.status,'finished'); assert.equal(s.winner,null);
  s=durakState([[card('♠',7)],[card('♠',6)]]); s=act(s,{type:'attack',card:'♠7'}); s=act(s,{type:'take'}); s=act(s,{type:'done'}); assert.equal(s.winner,0);
});

test('checkers capture is mandatory, men capture backward and identity is stable', () => {
  let s=checkersState([[26,0],[35,1],[40,0],[1,1]]); assert.deepEqual(actions(s).map(a=>[a.from,a.to]),[[26,44]]);
  const id=s.data.board[26].id; s=act(s,{type:'move',from:26,to:44}); assert.equal(s.data.board[44].id,id); assert.equal(s.data.board[35],null);
  assert.throws(()=>act(checkersState([[40,0],[1,1]]),{type:'move',from:40,to:49}));
});

test('checkers flying kings choose landing squares and cannot jump own piece', () => {
  let s=checkersState([[56,0,true],[35,1],[1,1]]); assert.deepEqual(actions(s).map(a=>a.to),[28,21,14,7]);
  s=checkersState([[56,0,true],[42,0],[35,1],[1,1]]); assert(!has(s,{from:56,to:28}));
});

test('checkers chained capture remains same actor, delays victims and promotes mid-chain', () => {
  let s=checkersState([[17,0],[10,1],[12,1],[62,1]]); const id=s.data.board[17].id;
  s=act(s,{type:'move',from:17,to:3}); assert.equal(s.turn,0); assert.equal(s.data.forced,3); assert.equal(s.data.board[3].king,true); assert(s.data.board[10]);
  assert.deepEqual(actions(s).map(a=>a.to),[21,30,39]); assert(actions(s).every(a=>a.from===3));
  s=act(s,{type:'move',from:3,to:30}); assert.equal(s.turn,1); assert.equal(s.data.forced,null); assert.equal(s.data.board[10],null); assert.equal(s.data.board[12],null); assert.equal(s.data.board[30].id,id);
});

test('checkers already-captured pieces block a flying king from reversing through them', () => {
  // Federation of Russian Draughts: a5:e1:g3:e5, white c3/f2/f4 remain blockers.
  let s=checkersState([[24,0,true],[42,1],[53,1],[37,1],[35,1],[1,1]]);
  s=act(s,{type:'move',from:24,to:60}); s=act(s,{type:'move',from:60,to:46}); s=act(s,{type:'move',from:46,to:28});
  assert.equal(s.turn,1); assert.equal(s.data.board[35].owner,1); assert.equal(s.data.board[42],null); assert.equal(s.data.board[53],null); assert.equal(s.data.board[37],null);
});

test('checkers wins by blocked opponent and draws by repetition or quiet-king limit', () => {
  let s=checkersState([[42,0],[56,1]]); s=act(s,{type:'move',from:42,to:33}); assert.equal(s.winner,0);
  // Keep kings on parallel diagonals to avoid compulsory captures.
  s=checkersState([[56,0,true],[5,1,true]]);
  const cycle=[[56,49],[5,12],[49,56],[12,5]];
  for(let i=0;i<9 && s.status==='playing';i++) {const [from,to]=cycle[i%4]; s=act(s,{type:'move',from,to});}
  assert.equal(s.status,'finished'); assert.equal(s.winner,null); assert.equal(s.events.at(-1).type,'checkers.repeated');assert.match(E.project(s,0).events.at(-1).text,/трижды/);
  s=checkersState([[56,0,true],[5,1,true]]); s.data.quiet=29; s=act(s,{type:'move',from:56,to:49}); assert.equal(s.status,'finished'); assert.equal(s.winner,null);
});

test('snakes exact finish, reflected overshoot, one link per turn and no extra six', () => {
  for(const boardSize of [64,100]) {
    const preset='classic';
    let s=create('snakes',2,preset,23,{boardSize}); s.data.positions[0]=s.data.finish-4; s.rng=rngForRoll(4); s=act(s,{type:'roll'}); assert.equal(s.winner,0); assert.equal(s.players[0].score,1);
    s=create('snakes',2,preset,23,{boardSize}); s.data.positions[0]=s.data.finish-1; s.rng=rngForRoll(3); s=act(s,{type:'roll'}); assert.equal(s.data.positions[0],s.data.finish-2); assert.equal(s.status,'playing');
    s=create('snakes',2,preset,23,{boardSize}); s.data.links={3:15,15:25}; s.rng=rngForRoll(3); s=act(s,{type:'roll'}); assert.equal(s.data.positions[0],15); assert.equal(s.data.lastMove.landing,3);
    s=create('snakes',2,preset,23,{boardSize}); s.rng=rngForRoll(6); s=act(s,{type:'roll'}); assert.equal(s.turn,1);
  }
});

test('import validation rejects malformed common state and each pack data', () => {
  for(const game of GAMES) {
    const valid=create(game.id); assert.equal(E.validateState(valid),true);
    for(const change of [s=>s.turn=-1,s=>s.turn=99,s=>s.rng=NaN,s=>s.status='broken',s=>s.winner=4,s=>s.players[0].score=-1,s=>s.players[0].name=null,s=>s.events[0].player=50,s=>s.events.push({...s.events[0]})]) {
      const bad=E.clone(valid);change(bad);assert.throws(()=>E.validateState(bad));
    }
  }
  const bads=[['uno',s=>s.data.hands[0][0].value='100'],['uno',s=>s.data.hands[1][0]={...s.data.hands[0][0]}],['uno',s=>s.data.direction=0],['domino',s=>s.data.chain=[{id:'d77',a:7,b:7}]],['durak',s=>s.data.defender=s.data.attacker],['durak',s=>s.data.trump.suit='bad'],['checkers',s=>s.data.board[0]={id:'fake',owner:9,king:false}],['checkers',s=>s.data.forced=100],['snakes',s=>s.data.positions[0]=101],['snakes',s=>s.data.links['3']=400]];
  for(const [game,change] of bads) {const s=create(game);change(s);assert.throws(()=>E.validateState(s),game);}
});

test('seeded complete games cover every supported player count/preset and bot/random choices', t => {
  let games=0, moves=0, maxMoves=0; const timings=[];
  for(const game of GAMES) for(let count=game.min;count<=game.max;count++) for(const preset of game.presets) for(let seed=0;seed<12;seed++) {
    if(game.id==='ludo'&&preset.id==='teams'&&count!==4)continue;
    let s=create(game.id,count,preset.id,seed), choice={rng:seed+9123};
    const expected=cardInventory(s)?.map(c=>c.id).sort(), initialPieces=s.data.board?.filter(Boolean).length;
    while(s.status==='playing' && s.move<3000) {
      const before=JSON.stringify(s), available=actions(s); assert(available.length,`${game.id} no moves at ${s.move}`);
      // Random legal choices may intentionally draw/pass forever in UNO or
      // take forever in durak. Explore a bounded random prefix, then let the
      // goal-directed bot finish; the engine must never invent a turn limit.
      const action=seed%2 && s.move<120 ? available[Math.floor(E.random(choice)*available.length)] : E.botAction(s);
      const start=performance.now();const next=act(s,action);timings.push(performance.now()-start);assert.equal(JSON.stringify(s),before);
      assert.equal(next.move,s.move+1);assert(next.turn>=0&&next.turn<count);s=next;moves++;
      E.validateState(s);
      if(expected) assert.deepEqual(cardInventory(s).map(c=>c.id).sort(),expected);
      if(s.game==='domino') for(let i=1;i<s.data.chain.length;i++) assert.equal(s.data.chain[i-1].b,s.data.chain[i].a);
      if(s.game==='checkers') {const ids=s.data.board.filter(Boolean).map(p=>p.id);assert.equal(new Set(ids).size,ids.length);assert(ids.length<=initialPieces);}
      if(s.game==='snakes') assert(s.data.positions.every(p=>p>=0&&p<=s.data.finish));
      assert.equal(s.events.at(-1).id,s.events.length);
      const hidden=E.project(s,-1);assert.equal(hidden.rng,undefined);if(hidden.data.hands) assert(hidden.data.hands.flat().every(c=>c.hidden));
    }
    assert.equal(s.status,'finished',`${game.id}/${count}/${preset.id}/seed=${seed} exhausted ${s.move} moves`);assert.deepEqual(actions(s),[]);
    maxMoves=Math.max(maxMoves,s.move);games++;
  }
  timings.sort((a,b)=>a-b);t.diagnostic(JSON.stringify({games,moves,maxMoves,applyMedianMs:+timings[Math.floor(timings.length/2)].toFixed(3),applyP95Ms:+timings[Math.floor(timings.length*.95)].toFixed(3)}));
});

test('sound cues distinguish attacks, declarations and results without parsing event text', () => {
  for (const [value,count,cue] of [['+2',2,'attack.light'],['+4',2,'attack.heavy'],['skip',3,'attack.skip'],['reverse',2,'attack.skip'],['reverse',3,'reverse']]) {
    const special=uno(value==='+4'?'wild':'red',value),s=unoState(Array.from({length:count},(_,i)=>i?[uno('blue','1')]:[special,uno('green','3')]),uno('red','5'),Array.from({length:4},()=>uno('blue','2')));
    s.data.uno.mode='manual';
    const n=act(s,{type:'play',card:special.id,...(value==='+4'?{color:'blue'}:{})});
    const sounds=E.soundCues(n,1,s.events.at(-1).id),specialCue=sounds.find(c=>c.id===cue);
    assert(specialCue,value);if(cue.startsWith('attack.'))assert.equal(specialCue.target,1);
    const copy=E.clone(n);copy.events.forEach(e=>e.text='Another language');assert.deepEqual(E.soundCues(copy,1,s.events.at(-1).id),sounds);
    assert.deepEqual(E.soundCues(n,1,n.events.at(-1).id),[],'already rendered events do not replay');
  }
  const board=checkersState([[26,0],[35,1],[40,0],[1,1]]),taken=act(board,{type:'move',from:26,to:44});
  assert.deepEqual(E.soundCues(taken,1,board.events.at(-1).id).map(({id,target})=>({id,target})),[{id:'attack.capture',target:1}]);
  const manual=create('uno');manual.data.uno.mode='manual';
  const shouted=act(manual,{type:'declare-uno'});
  assert.deepEqual(E.soundCues(shouted,0,manual.events.at(-1).id).map(c=>c.id),['uno.call'],'even an early manual call is heard');
  const accused=act(manual,{type:'accuse-uno',target:1});
  assert.deepEqual(E.soundCues(accused,0,manual.events.at(-1).id).map(({id,target})=>({id,target})),[{id:'penalty',target:0}]);
  const finished=create('snakes'),from=finished.events.at(-1).id;E.finish(finished,1);
  assert.equal(E.soundCues(finished,1,from)[0].id,'victory');assert.equal(E.soundCues(finished,0,from)[0].id,'defeat');assert.equal(E.soundCues(finished,-1,from)[0].id,'notify');
  finished.winner=null;assert.equal(E.soundCues(finished,0,from)[0].id,'draw-game');
});

test('sound metadata is optional, validated and respects private event visibility', () => {
  const s=create('uno'),start=s.events.at(-1).id;
  E.event(s,'Private sound',0,'action',{privateTo:0,sound:{id:'custom.secret',target:0}});
  assert.deepEqual(E.soundCues(s,1,start),[]);assert.equal(E.soundCues(s,0,start)[0].id,'custom.secret');
  assert.equal(E.project(s,1).events.at(-1).sound,null);assert.deepEqual(E.soundCues(E.project(s,1),1,start),[]);s.events.at(-1).publicSound={id:'draw'};assert.deepEqual(E.soundCues(s,1,start),E.soundCues(E.project(s,1),1,start));assert(E.validateState(s));
  for(const sound of [{id:'bad id'},{id:'move',target:99},'move']) {const bad=E.clone(s);bad.events.at(-1).sound=sound;assert.throws(()=>E.validateState(bad),/звук события/);}
  const old=E.clone(s);delete old.events.at(-1).sound;assert(E.validateState(old));assert.equal(E.soundCues(old,0,start)[0].id,'move');
  const dialogue=create('uno'),from=dialogue.events.at(-1).id;
  E.event(dialogue,'Question',0,'action',{sound:{id:'move'},speech:{speaker:0,text:'Туз'}});
  E.event(dialogue,'Answer',1,'play',{sound:{id:'success'},speech:{speaker:1,result:'success'}});
  assert.deepEqual(E.soundCues(dialogue,0,from).map(c=>c.id),['move','success']);
});

test('standalone audio library registers scoped pack overrides without a browser', async () => {
  const Audio=require('../core/audio.js');let contexts=0;
  const audio=new Audio({contextFactory:()=>{contexts++;return null;}});
  assert.equal(audio.catalog().length,26);assert.equal(audio.catalog().find(c=>c.id==='turn').label,'Ваш ход');assert.equal(await audio.unlock(),false);assert.equal(contexts,0);
  audio.registerPack('custom_pack',{move:{label:'Own move',notes:[{frequency:500,duration:.1}]},'custom.call':{label:'Call',notes:[{frequency:700,duration:.1}]}});
  assert.equal(audio.catalog('custom_pack').find(c=>c.id==='move').label,'Own move');assert.equal(audio.catalog().find(c=>c.id==='move').label,'Ход');assert.equal(audio.catalog('custom_pack').length,27);
  assert.throws(()=>audio.registerPack('bad',{move:{src:'https://example.invalid/audio.wav'}}));
  audio.setEnabled(true);assert.equal(await audio.play('move'),false,'play must not bypass a user gesture');assert.equal(contexts,0);
  assert.equal(await audio.unlock(),false);assert.equal(contexts,1);assert.equal(await audio.sequence(['move']),false);
  audio.setEnabled(false);assert.equal(await audio.play('move'),false);
  const started=[],ends=[];audio.play=id=>{started.push(id);return new Promise(resolve=>ends.push(resolve));};
  let finished=false;const mixed=audio.batch(['move','success','move']).then(()=>finished=true);
  assert.deepEqual(started,['move','success']);ends[1](true);await Promise.resolve();assert.equal(finished,false);ends[0](true);await mixed;assert.equal(finished,true);

});

// Installed packs run trusted code only after prepare(); each fixture owns a
// separate core so version switching cannot affect the built-in game tests.
function packEnvironment(storage, viewsOverride) {
  const vm = require('node:vm'), fs = require('node:fs');
  const sandbox = {module:{exports:{}},PlayroomEvents:require('../core/events.js'),PlayroomMessages:require('../core/messages.js')};
  vm.runInNewContext(fs.readFileSync(require.resolve('../core/random.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(require.resolve('../core/engine.js'), 'utf8'), sandbox);
  const core = sandbox.module.exports, views = viewsOverride || require('../core/ui.js').createRegistry(), catalog = {};
  let raw = null;
  const store = storage || {get:()=>raw, set:value=>{raw=value;}};
  const manager = new (require('../core/packs.js'))({engine:core, views, catalog, storage:store});
  return {core, views, catalog, store, manager};
}
function installFixture(version = '0.1.0', increment = 1) {
  return {format:'playroom-pack',formatVersion:1,manifest:{id:'install-fixture',name:'Installed fixture',version,engineApi:4,viewApi:3,stateVersion:1},files:{
    'rules.js':require('./pack-fixture.cjs').rules({id:'install-fixture',version,key:'count',step:increment,preset:'standard',action:'advance'}),
    'view.js':`globalThis.PlayroomViews.register('install-fixture',s=>({api:3,family:'board',elements:{field:'<p>'+s.data.count+'</p>'}}),()=>'<svg/>');globalThis.PlayroomCatalog['install-fixture'].playerBadge=()=>${JSON.stringify(version)};globalThis.PlayroomCatalog['install-fixture'].asset=globalThis.PlayroomPack.asset('assets/icon.svg');`,
    'styles.css':'.fixture { background-image: url("assets/icon.svg"); }',
    'assets/icon.svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1"/></svg>'
  }};
}

test('offline packs validate metadata, entries and assets before registry mutation', () => {
  const {core,manager,store} = packEnvironment(), Pack = require('../core/packs.js'), source = installFixture();
  const parsed = manager.parse(source);
  assert.equal(core.GAMES.length,0);assert.equal(store.get(),null);assert(Object.isFrozen(parsed.files));
  const bad = modify => {const b=JSON.parse(JSON.stringify(source));modify(b);return b;};
  for(const b of [bad(b=>b.manifest.id='../escape'),bad(b=>b.manifest.version='01.0.0'),bad(b=>b.manifest.version='1.0.0-01'),bad(b=>b.manifest.engineApi=3),bad(b=>b.manifest.rules='other.js'),bad(b=>b.files['../escape.js']='x'),bad(b=>delete b.files['view.js']),bad(b=>b.files['assets/image.png']='not a data URL')]) assert.throws(()=>manager.parse(b));
  for(const b of [bad(b=>b.files['view.js']='throw Error("broken view")'),bad(b=>b.files['rules.js']='('),bad(b=>b.files['styles.css']='.x{background:url(https://example.invalid/x.png)}'),bad(b=>b.files['styles.css']='@import "https://example.invalid/x.css";')]) assert.throws(()=>manager.prepare(b));
  assert.equal(core.GAMES.length,0);assert.equal(store.get(),null,'failed prepare cannot persist or activate');
  assert.throws(()=>manager.install(source),/подготовьте/);
  assert.throws(()=>manager.parse(bad(b=>b.files['huge.txt']='x'.repeat(4*1024*1024))),/слишком большой/);
  assert(Pack.compareVersions('1.10.0','1.2.0')>0);assert(Pack.compareVersions('1.0.0','1.0.0-rc.2')<0,'explicit test versions take priority for new games');assert(Pack.compareVersions('1.0.0-rc.10','1.0.0-rc.2')>0);
  const installed=manager.install(manager.prepare(parsed));
  assert.equal(installed.id,'install-fixture');assert.match(installed.styles,/data:image\/svg\+xml/);assert(!installed.styles.includes('url("assets/'));
  assert.equal(installed.catalog.playerBadge(),'0.1.0');assert.match(installed.catalog.asset,/^data:image/);
});

test('pack updates retain pinned rules, serialize exact versions and reject changed immutable releases', () => {
  const {core,manager,store,views,catalog}=packEnvironment(), Session=require('../core/session.js');
  manager.bootstrap([installFixture()]);
  const oldSession=new Session(core,'install-fixture',{seed:1});oldSession.act(0,{type:'advance'});
  assert.equal(oldSession.packVersion,'0.1.0');
  manager.install(manager.prepare(installFixture('0.2.0',10)));
  assert.equal(core.get('install-fixture').version,'0.2.0');assert.equal(catalog['install-fixture'].playerBadge(),'0.2.0');
  oldSession.act(1,{type:'advance'});assert.equal(oldSession.current.data.count,2,'live old session still dispatches its own rules');
  assert.equal(views.render(oldSession.current,0,[]),require('../core/ui.js').composeScene({api:3,family:'board',elements:{field:'<p>2</p>'}},{state:oldSession.current,viewer:0,actions:[]}));
  const saved=JSON.parse(oldSession.serialize());assert.equal(Session.packVersionOf(saved),'0.1.0');
  const reopened=Session.restore(core,saved);reopened.act(0,{type:'advance'});assert.equal(reopened.current.data.count,3);
  const fresh=new Session(core,'install-fixture');fresh.act(0,{type:'advance'});assert.equal(fresh.current.data.count,10);
  const disk=store.get();assert.throws(()=>manager.install(manager.prepare(installFixture('0.2.0',99))),/другим содержимым/);assert.equal(store.get(),disk);
  const next=packEnvironment(store);next.manager.bootstrap([installFixture('0.2.0',10)]);
  assert.equal(next.manager.list().length,2);assert.equal(Session.restore(next.core,saved).current.data.count,2);
  next.manager.activate('install-fixture','0.1.0');assert.equal(next.catalog['install-fixture'].playerBadge(),'0.1.0');
  next.manager.activate('install-fixture');assert.equal(next.catalog['install-fixture'].playerBadge(),'0.2.0');
  assert.equal(JSON.parse(next.manager.exportPack('install-fixture','0.1.0')).manifest.version,'0.1.0');
  const collision=packEnvironment(store);collision.manager.bootstrap([installFixture('0.1.0',99),installFixture('0.2.0',10)]);
  assert.equal(collision.manager.warnings.length,1);assert.equal(collision.manager.quarantined.length,1);
  assert.throws(()=>Session.restore(collision.core,saved),/несовместимо/);
  const schema=oldSession.export();schema.states[0].packStateVersion=0;assert.throws(()=>Session.restore(core,schema),/Сохранение/);
  const mixed=oldSession.export();mixed.states[1].packVersion='0.2.0';assert.throws(()=>Session.restore(core,mixed),/Сохранение/);
  const missing=oldSession.export();missing.packVersion=missing.options.packVersion='9.0.0';assert.throws(()=>Session.restore(core,missing),e=>e.code==='PACK_VERSION_MISSING'&&e.packVersion==='9.0.0');
  const legacy=oldSession.export();delete legacy.packVersion;delete legacy.options.packVersion;legacy.states.forEach(s=>{delete s.packVersion;delete s.packStateVersion;});
  assert.equal(Session.packVersionOf(legacy),undefined);assert.throws(()=>Session.restore(core,legacy),/Сохранение|формат/);
});

test('pack quota failure and failed view activation preserve installed registries and persisted bytes', () => {
  let raw=null,blocked=false;
  const storage={get:()=>raw,set(value){if(blocked)throw Error('QuotaExceededError');raw=value;}};
  const {manager,core,catalog,views}=packEnvironment(storage);
  manager.bootstrap([installFixture()]);const before=raw,prior=catalog['install-fixture'];blocked=true;
  assert.throws(()=>manager.install(manager.prepare(installFixture('0.2.0',10))),/Quota/);
  assert.equal(raw,before);assert.equal(core.get('install-fixture').version,'0.1.0');assert.equal(catalog['install-fixture'],prior);assert.equal(manager.list().length,1);
  assert.throws(()=>manager.remove('install-fixture','0.1.0'),/Quota/);assert.equal(manager.list().length,1);
  blocked=false;const original=views.register;let rejectOnce=true;
  views.register=(...args)=>{if(rejectOnce){rejectOnce=false;throw Error('Renderer refused');}return original(...args);};
  assert.throws(()=>manager.install(manager.prepare(installFixture('0.2.0',10))),/Renderer refused/);
  assert.equal(raw,before);assert.equal(core.get('install-fixture').version,'0.1.0');assert.equal(catalog['install-fixture'],prior);assert.equal(manager.list().length,1);
  assert.throws(()=>core.get('install-fixture','0.2.0'),e=>e.code==='PACK_VERSION_MISSING');
  views.register=original;
  manager.install(manager.prepare(installFixture('0.2.0',10)));assert.equal(manager.list().length,2);
});

test('removed bundled versions stay removed on restart and explicit reinstallation restores them', () => {
  const {manager,core,store}=packEnvironment(), old=installFixture(), update=installFixture('0.2.0',10);
  manager.bootstrap([old]);manager.install(manager.prepare(update));
  manager.remove('install-fixture','0.2.0');assert.equal(core.get('install-fixture').version,'0.1.0');
  manager.remove('install-fixture','0.1.0');assert.equal(core.GAMES.length,0);
  const next=packEnvironment(store);next.manager.bootstrap([old,update]);assert.equal(next.manager.list().length,0);
  next.manager.install(next.manager.prepare(old));assert.equal(next.manager.list().length,1);
  const reboot=packEnvironment(store);reboot.manager.bootstrap([old,update]);assert.deepEqual(reboot.manager.list().map(p=>p.version),['0.1.0']);
  let backup;const broken=packEnvironment({get:()=>'{broken',set:value=>{backup=JSON.parse(value);}});
  broken.manager.bootstrap([old]);assert.equal(broken.core.GAMES.length,1);assert.deepEqual(backup.rawBackups,['{broken']);
  const unavailable=packEnvironment({get:()=>{throw Error('SecurityError');},set:()=>assert.fail('unreadable storage must not be overwritten')});
  unavailable.manager.bootstrap([old]);assert.equal(unavailable.manager.list().length,1);assert.equal(unavailable.manager.warnings.length,1);
});

test('first actor is deterministic, assigned inside each pack, and never rerolled by restore',()=>{const Session=require('../core/session.js');
  for(const game of GAMES){for(const mode of ['rules','random','assigned']){
    const options={players:[{name:'А'},{name:'Б'}],preset:game.presets[0].id,seed:71,firstPlayerMode:mode,firstPlayer:1};
    const session=new Session(E,game.id,options),state=session.current;
    assert.deepEqual(state,E.createGame(game.id,options));assert.equal(state.firstPlayer,state.turn);
    if(mode==='assigned')assert.equal(state.turn,1);
    if(game.id==='durak'){assert.equal(state.data.attacker,state.turn);assert.equal(state.data.defender,1-state.turn);}
    if(game.id==='checkers'){assert.equal(state.data.lightPlayer,state.turn);assert.ok(state.data.board.slice(40).filter(Boolean).every(p=>p.owner===state.turn));}
    E.validateState(state);assert.deepEqual(Session.restore(E,session.export()).current,state);
  }}
  assert.throws(()=>E.createGame('uno',{firstPlayerMode:'assigned',firstPlayer:42}));
});

 test('forced skips retain separate ordered dice and consequence sounds',()=>{
  let before,after;
  for(let seed=1;seed<40;seed++){
    before=E.createGame('ludo',{players:[{name:'A'},{name:'B'}],preset:'classic',seed,startPawn:'off'});
    after=E.applyAction(before,0,{type:'roll'});if(after.data.dice[0]!==6)break;
  }
  assert.notEqual(after.data.dice[0],6);assert.equal(after.turn,1);
  assert.deepEqual(E.project(after,-1).events.at(-1).feedback,{kind:'skip',player:0});
  assert.deepEqual(E.soundCues(after,-1,before.events.at(-1).id).map(({id,target})=>({id,target})),[{id:'dice',target:undefined},{id:'attack.skip',target:0}]);
  const domino=create('domino'),tiles=[...domino.data.hands.flat(),...domino.data.stock],end=tiles.find(t=>t.a===6&&t.b===6),own=tiles.find(t=>t.a===0&&t.b===0);
  domino.data.chain=[end];domino.data.hands=[[own],tiles.filter(t=>t!==own&&t!==end)];domino.data.stock=[];domino.turn=0;
  assert(E.legalActions(domino,0).some(a=>a.type==='pass'));
  const passed=E.applyAction(domino,0,{type:'pass'});
  assert.deepEqual(E.project(passed,-1).events.at(-1).feedback,{kind:'skip',player:0});
  assert.deepEqual(E.soundCues(passed,-1,domino.events.at(-1).id).map(c=>c.id),['attack.skip']);
  const special=uno('red','+2'),s=unoState([[special,uno('green','3')],[uno('blue','1')]],uno('red','5'),[uno('blue','2'),uno('green','2')]);
  const n=act(s,{type:'play',card:special.id});
  const cues=E.soundCues(n,1,s.events.at(-1).id);assert(cues.some(c=>c.id==='attack.light'));assert.equal(new Set(cues.map(c=>c.eventId)).size,cues.length,'one cue per distinct logical event');assert(cues.every((c,i)=>!i||c.eventId>cues[i-1].eventId),'consequences follow event order');
  assert.deepEqual(E.get('uno').presentEvent(n.events.find(e=>e.type==='uno.draw-skipped'),n.players).feedback,{kind:'skip',player:1});
 });
 test('UNO reverse is a skip with two remaining players in a larger roster',()=>{
  const reverse=uno('red','reverse'),s=unoState([[reverse,uno('blue','3')],[uno('blue','1')],[]]);
  s.data.ending.groups=[[2]];
  const n=act(s,{type:'play',card:reverse.id});
  assert.equal(n.turn,0);assert.deepEqual(E.get('uno').presentEvent(n.events.find(e=>e.type==='uno.played'),n.players).feedback,{kind:'skip',player:1});
  assert.deepEqual(E.soundCues(n,-1,s.events.at(-1).id).map(c=>c.id),['attack.skip']);
 });

test('fractional result details survive validation and reject nonfinite values',()=>{
 const state=create('snakes');state.status='finished';state.winner=0;state.winners=[0];state.result={label:'Место',values:[1,2],places:[1,2],order:'asc',detailLabel:'Урон',details:[1.5,1/3]};
 assert(E.validateState(state));
 for(const value of [NaN,Infinity,-1]){const bad=E.clone(state);bad.result.details[0]=value;assert.throws(()=>E.validateState(bad));}
});


test('numeric pack versions outrank older suffixes and bootstrap selects the newest base',()=>{
 const Pack=require('../core/packs.js');
 assert(Pack.compareVersions('0.6.5','0.6.3-preview.6')>0);
 assert(Pack.compareVersions('0.6.3-preview.6','0.6.3')>0);
 assert(Pack.compareVersions('0.6.3-preview.10','0.6.3-preview.6')>0);
 const {manager}=packEnvironment();
 manager.bootstrap([installFixture('0.6.3-preview.6'),installFixture('0.6.5')]);
 assert.equal(manager.list().find(p=>p.active).version,'0.6.5');
});
