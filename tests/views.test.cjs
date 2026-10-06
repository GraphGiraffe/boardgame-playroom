/* Run with Node 22+ and PLAYWRIGHT_MODULE pointing to installed playwright-core.
   CHROME_BIN optionally selects a browser; system or managed Chromium is the fallback. No app/server required. */
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const games = ['uno', 'domino', 'durak', 'checkers', 'snakes'];
const sandbox = vm.createContext({ console });
for (const file of ['core/engine.js', ...games.map(g => `packs/${g}/rules.js`), 'core/ui.js', 'app/views.js', ...games.map(g => `packs/${g}/view.js`)]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const E = sandbox.TabletopCore, V = sandbox.PlayroomViews;
const clone = value => JSON.parse(JSON.stringify(value));
const make = (game, preset = 'classic', count = 2, seed = 17) => E.createGame(game, { preset, seed, players: Array.from({ length: count }, (_, i) => ({ name: `Игрок ${i + 1}` })) });
const render = (state, viewer = state.turn, selected = null, actions = E.legalActions(state, viewer)) => V.render(E.project(state, viewer), viewer, actions, { selected, flipped: viewer === 1 });
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const actionsIn = html => [...html.matchAll(/data-action="([^"]+)"/g)].map(m => JSON.parse(decode(m[1])));
const signature = action => JSON.stringify(Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'label').sort(([a], [b]) => a.localeCompare(b))));

test('standalone UI shares source and target policies without browser or game dependencies', () => {
  const UI = require('../core/ui.js'), H = UI.helpers;
  const id = 'card"<&', one = [{type:'play',card:id,label:'Play "<&'}];
  const many = [...one, {type:'play',card:id,color:'blue',label:'Choose blue'}];
  const selected = H.source(id,one,id,{mode:'select',preview:true,inspect:true,drag:true,swipe:true});
  assert.deepEqual(actionsIn(selected.attr), []);
  assert.match(selected.attr, /data-select="card&quot;&lt;&amp;"/);
  assert.match(selected.attr, /data-drag-piece="card&quot;&lt;&amp;"/);
  assert.match(selected.attr, /data-hand-preview="card&quot;&lt;&amp;"/);
  assert.match(selected.className, /is-playable.*is-selected/);
  assert.deepEqual(JSON.parse(decode(selected.attr.match(/data-swipe-action="([^"]+)"/)[1])), one[0]);
  assert.deepEqual(actionsIn(H.source(id,one,null,{mode:'immediate'}).attr), one);
  const ambiguous = H.source(id,many,null,{mode:'immediate',drag:true,swipe:true});
  assert.deepEqual(actionsIn(ambiguous.attr), []);
  assert.match(ambiguous.attr, /data-swipe-select=/);
  const inspected = H.source(id,[],id,{preview:true,inspect:true,drag:true,swipe:true});
  assert.match(inspected.attr, /data-select=.*data-hand-preview=/);
  assert.doesNotMatch(inspected.attr, /disabled|data-action=|data-drag-piece=|data-swipe-/);
  assert.match(H.source(id,[],null,{drag:true,swipe:true}).attr, /disabled/);
  const zero = H.source(0,[{type:'move',from:0,to:9}], '0', {key:'from',drag:true,className:'checker-piece'});
  assert.equal(zero.choices.length,1); assert.match(zero.attr,/data-drag-piece="0"/);
  assert.match(zero.className,/checker-piece.*is-selected/);
  assert.deepEqual(actionsIn(H.target(id,one[0])),one);
  assert.match(H.target(id,many), /data-drop-select="card&quot;&lt;&amp;"/);
  assert.deepEqual(actionsIn(H.target(id,many)),[]);
  const first=UI.createRegistry(), second=UI.createRegistry();
  first.register('example',()=>'<p>Ready</p>',()=>'<svg></svg>');
  assert.equal(first.render({game:'example'},0,[]),'<p>Ready</p>');
  assert.equal(first.cover('example'),'<svg></svg>');
  assert.equal(second.cover('example'),'');
  assert.equal(first.helpers,UI.helpers);
});

test('every legal action remains reachable through card, colour, side or cell selection', () => {
  for (const game of games) for (const preset of ['classic', 'quick']) for (const count of [2, ...(E.get(game).max === 4 ? [4] : [])]) {
    for (const seed of [1, 7, 21]) {
      let state = make(game, preset, count, seed);
      for (let step = 0; step < 18 && state.status === 'playing'; step++) {
        const legal = E.legalActions(state), before = JSON.stringify(state);
        const selected = [null, ...new Set(legal.flatMap(a => a.card ? [a.card] : a.from != null ? [String(a.from)] : []))];
        const html = selected.map(value => render(state, state.turn, value));
        const reachable = new Set(html.flatMap(actionsIn).map(signature));
        for (const action of legal) assert.ok(reachable.has(signature(action)), `${game}/${preset}: ${action.label}`);
        for (const content of html) assert.doesNotMatch(content, /undefined|NaN|Infinity/, game);
        assert.equal(JSON.stringify(state), before, 'render must not mutate the state');
        state = E.applyAction(state, state.turn, E.botAction(state));
      }
    }
  }
});

test('private hands/decks do not leak identities; public hands retain every card', () => {
  for (const game of ['uno', 'domino', 'durak']) {
    const state = make(game), hand = state.data.hands[1];
    const stock = state.data.drawPile || state.data.stock;
    hand.push(...stock.splice(1, Math.min(12, stock.length - 1)));
    hand.forEach((card, i) => { card.id = `SECRET_HAND_${i}`; });
    stock.forEach((card, i) => { card.id = `SECRET_STOCK_${i}`; });
    assert.doesNotMatch(render(state, 0), /SECRET_/, `${game}: hidden hand or stock identity leaked`);
    assert.doesNotMatch(render(state, -1), /SECRET_/, `${game}: handoff identity leaked`);
    state.openHands = true;
    const html = render(state, 0);
    for (const card of hand) assert.ok(html.includes(`-${card.id}"`), `${game}: public card omitted`);
    assert.doesNotMatch(html, /SECRET_STOCK_/, `${game}: public-hands mode leaked stock`);
  }
});

test('domino selection exposes only legal table targets with the exact resulting orientation', () => {
  const covered = new Set();
  for (const seed of [1, 7, 17]) {
    let state = make('domino', 'classic', 2, seed);
    for (let step = 0; step < 70 && state.status === 'playing'; step++) {
      const legal = E.legalActions(state), unselected = render(state);
      assert.doesNotMatch(unselected, /data-drop-piece=/, 'targets require a selected tile');
      const ownHand = unselected.slice(unselected.indexOf('<section class="own-hand"'));
      assert.doesNotMatch(ownHand, /data-action=/, 'clicking a hand tile must never play immediately');
      for (const cardId of new Set(legal.filter(a => a.card).map(a => a.card))) {
        const html = render(state, state.turn, cardId);
        const previews = [...html.matchAll(/<button class="domino-drop-target [^"]*"([^>]*)>/g)].map(m => {
          const attrs = m[1], action = actionsIn(m[0])[0];
          return { action, a: Number(attrs.match(/data-preview-a="(\d+)"/)[1]), b: Number(attrs.match(/data-preview-b="(\d+)"/)[1]) };
        });
        const expected = legal.filter(a => a.card === cardId);
        assert.equal(previews.length, expected.length);
        assert.match(html, new RegExp(`data-select="${cardId}" data-drag-piece="${cardId}"`));
        for (const action of expected) {
          const preview = previews.find(p => signature(p.action) === signature(action));
          assert.ok(preview, 'every side has its own target');
          const result = E.applyAction(state, state.turn, action);
          const placed = action.side === 'left' ? result.data.chain[0] : result.data.chain.at(-1);
          assert.deepEqual([preview.a, preview.b], [placed.a, placed.b]);
          const original = state.data.hands[state.turn].find(c => c.id === cardId);
          covered.add(state.data.chain.length ? action.side : 'opening');
          if (original.a !== preview.a) covered.add('reversed');
          if (preview.a === preview.b) covered.add('double');
        }
      }
      state = E.applyAction(state, state.turn, E.botAction(state));
    }
  }
  for (const kind of ['opening', 'left', 'right', 'reversed', 'double']) assert.ok(covered.has(kind), kind);
});

test('UNO previews on click and exposes exact drag/swipe actions without guessing wild colours', () => {
  const covered = new Set();
  for (const seed of [1, 7, 17, 21]) {
    let state = make('uno', 'classic', 2, seed);
    for (let step = 0; step < 28 && state.status === 'playing'; step++) {
      const legal = E.legalActions(state), base = render(state);
      const quick = V.render(E.project(state, state.turn), state.turn, legal, {selected:null, quickPlay:true});
      assert.doesNotMatch(base, /class="uno-drop-target"/, 'discard target requires a selection');
      for (const id of new Set(legal.filter(a => a.card).map(a => a.card))) {
        const choices = legal.filter(a => a.card === id);
        const source = base.match(new RegExp(`<button[^>]*data-entity="card-${id}"[^>]*>`))[0];
        const quickSource = quick.match(new RegExp(`<button[^>]*data-entity="card-${id}"[^>]*>`))[0];
        assert.ok(source.includes(`data-drag-piece="${id}"`));
        const selected = render(state, state.turn, id), target = selected.match(/<button class="uno-drop-target"[^>]*>/)[0];
        assert.ok(target.includes(`data-drop-piece="${id}"`));
        if (choices.length === 1) {
          covered.add('normal');
          assert.equal(actionsIn(source).length, 0, 'source click previews before an explicit play');
          assert.equal(signature(actionsIn(quickSource)[0]), signature(choices[0]), 'quick-play emits the same legal normal-card action');
          assert.ok(source.includes(`data-select="${id}"`), 'normal card can be selected');
          assert.equal(signature(actionsIn(target)[0]), signature(choices[0]), 'discard commits the selected card');
          const swipe = JSON.parse(decode(source.match(/data-swipe-action="([^"]+)"/)[1]));
          assert.equal(signature(swipe), signature(choices[0]));
          assert.equal(signature(actionsIn(target)[0]), signature(choices[0]));
        } else {
          covered.add(state.data.hands[state.turn].find(c => c.id === id).value);
          assert.deepEqual(actionsIn(quickSource), [], 'quick-play must still ask for a wild colour');
          assert.ok(source.includes(`data-select="${id}"`) && source.includes(`data-swipe-select="${id}"`));
          assert.deepEqual(actionsIn(target), [], 'dropping a wild on discard must not choose a colour');
          assert.ok(target.includes(`data-drop-select="${id}"`));
          const colours = [...selected.matchAll(/<button class="color-choice"[^>]*>/g)].map(m => m[0]);
          assert.equal(colours.length, choices.length);
          for (const colour of colours) {
            assert.ok(colour.includes(`data-drop-piece="${id}"`));
            assert.ok(choices.some(a => signature(a) === signature(actionsIn(colour)[0])));
          }
        }
      }
      state = E.applyAction(state, state.turn, E.botAction(state));
    }
  }
  for (const type of ['normal', 'wild', '+4']) assert.ok(covered.has(type), type);
});

test('manual UNO controls are constant and accusations use public player context without hints', () => {
  const state = make('uno', 'classic', 4);
  state.data.uno.mode = 'manual';
  const callButton = html => html.match(/<button class="scene-button uno-call"[^>]*>UNO!<\/button>/)?.[0];
  const originalCall = callButton(render(state, 0));
  assert.ok(originalCall);
  for (const count of [7, 2, 1]) {
    state.data.drawPile.push(...state.data.hands[0].splice(count));
    for (const viewer of [0, 1]) {
      const html = render(state, viewer);
      assert.equal(callButton(html), originalCall, 'call button stays identical across hand counts and turn ownership');
      const actions = actionsIn(html);
      assert.ok(actions.some(a => a.type === 'declare-uno'));
      assert.ok(!actions.some(a => a.type === 'accuse-uno'), 'accusations must not become automatic action buttons');
      for (const target of state.players.keys()) assert.equal(html.includes(`data-accuse-player="${target}"`), target !== viewer);
      assert.doesNotMatch(html, /class="uno-declared"/, 'one card alone is not a public declaration');
    }
  }
  state.data.uno.pending = 0;
  const pending = render(state, 1);
  state.data.uno.pending = null;
  assert.equal(render(state, 1), pending, 'catch-window changes must not provide visual clues');
  state.data.uno.declared[0] = true;
  assert.match(render(state, 1), /class="uno-declared"/);
  assert.match(render(state, 1), /data-accuse-player="0"/, 'already declared players still allow a mistaken accusation');
  assert.match(render(state, 0), /class="hand-tools"><span class="uno-declared"/);
  const wild = state.data.drawPile.splice(state.data.drawPile.findIndex(c => c.value === 'wild'), 1)[0];
  state.data.hands[0].push(wild); state.data.uno.declared[0] = false;
  assert.equal(callButton(render(state, 0, wild.id)), originalCall, 'colour choice retains the same call button');
  state.data.uno.mode = 'auto';
  assert.doesNotMatch(render(state, 0), /uno-call|data-accuse-player|uno-manual-hint/);
  delete state.data.uno;
  assert.doesNotMatch(render(state, 0), /uno-call|data-accuse-player|uno-manual-hint/, 'legacy games keep automatic mode');
  vm.runInContext(fs.readFileSync(path.join(root, 'packs/uno/manifest.js'), 'utf8'), sandbox);
  const setting = sandbox.PlayroomCatalog.uno.settings.find(item => item.key === 'unoMode');
  assert.equal(setting.default, 'manual');
  assert.deepEqual(clone(setting.options.map(item => item.value)), ['manual', 'auto']);
});

test('all labels and JSON action attributes escape player-controlled strings', () => {
  const attack = '\"><img src=x onerror=alert(1)> & \' <script>';
  for (const game of games) {
    const state = make(game);
    state.players.forEach(p => { p.name = attack; });
    const html = render(state);
    assert.doesNotMatch(html, /<img|<script>|onerror="/, game);
    assert.ok(html.includes('&lt;img'), game);
  }
  const action = { type: 'test', label: attack, card: attack };
  assert.deepEqual(actionsIn(V.helpers.actionButton(action)), [action]);
});

test('checkers orientation/forced captures and snakes board sizes agree with their state', () => {
  const checkers = make('checkers'), html0 = render(checkers, 0), html1 = render(checkers, 1);
  assert.ok(html0.indexOf('aria-label="a8') < html0.indexOf('aria-label="h1'));
  assert.ok(html1.indexOf('aria-label="h1') < html1.indexOf('aria-label="a8'));
  for (const preset of ['classic', 'quick']) {
    const state = make('snakes', preset, 4), html = render(state);
    assert.equal((html.match(/class="snakes-cell /g) || []).length, state.data.finish);
    assert.equal((html.match(/data-entity="token-/g) || []).length, 4);
  }
  for (const game of games) assert.match(V.cover(game), /^<svg .*viewBox="0 0 300 180"/);
});

function stressStates() {
  const list = [];
  for (const game of games) for (const preset of ['classic', 'quick']) for (const count of [2, ...(E.get(game).max === 4 ? [4] : [])]) {
    const state = make(game, preset, count);
    list.push({ id: `${game}-${preset}-${count}`, state });
  }
  const uno = make('uno', 'classic', 4);
  uno.data.hands[0].push(...uno.data.drawPile.splice(0, 35));
  uno.players.forEach(p => { p.name = 'ОченьДлинноеИмяИгрокаБезПробеловНаТелефоне'; });
  uno.openHands = true;
  list.push({ id: 'uno-long-open', state: uno, viewer: 0 });
  const unoSelected = make('uno'), normal = E.legalActions(unoSelected).find(a => a.card && !a.color);
  list.push({ id: 'uno-discard-normal-target', state: unoSelected, selected: normal.card });
  const unoWild = make('uno'), wildIndex = unoWild.data.drawPile.findIndex(c => c.value === 'wild');
  const wild = unoWild.data.drawPile.splice(wildIndex, 1)[0]; unoWild.data.hands[0].push(wild);
  list.push({ id: 'uno-discard-wild-target', state: unoWild, viewer: 0, selected: wild.id });
  const manual = clone(unoWild); manual.data.uno.mode = 'manual';
  list.push({ id: 'uno-manual-wild-target', state: manual, viewer: 0, selected: wild.id });
  const manualFour = clone(uno); manualFour.data.uno.mode = 'manual';
  manualFour.data.drawPile.push(...manualFour.data.hands[1].splice(1)); manualFour.data.uno.declared[1] = true;
  list.push({ id: 'uno-manual-four-public', state: manualFour, viewer: 0 });
  const domino = make('domino');
  domino.data.chain = [...domino.data.hands.flat(), ...domino.data.stock];
  domino.data.hands = [[], []]; domino.data.stock = []; domino.status = 'finished';
  list.push({ id: 'domino-long-chain', state: domino });
  const opening = make('domino');
  list.push({ id: 'domino-opening-preview', state: opening, selected: E.legalActions(opening).find(a => a.card).card });
  let midgame = make('domino');
  for (let step = 0; step < 70 && midgame.status === 'playing'; step++) {
    const play = E.legalActions(midgame).find(a => a.card);
    if (midgame.data.chain.length >= 10 && play) { list.push({ id: 'domino-long-chain-preview', state: midgame, selected: play.card }); break; }
    midgame = E.applyAction(midgame, midgame.turn, E.botAction(midgame));
  }
  const durak = make('durak');
  durak.turn = 0; durak.data.defender = 0; durak.data.attacker = 1;
  durak.data.trump = { id: 'marker', suit: '♥', rank: 6 };
  durak.data.table = Array.from({ length: 6 }, (_, i) => ({ attack: { id: `attack-${i}`, suit: '♠', rank: 6 + i }, defense: null }));
  durak.data.hands[0] = [{ id: 'defense-card', suit: '♥', rank: 14 }];
  list.push({ id: 'durak-full-table', state: durak, selected: 'defense-card' });
  const checkers = make('checkers');
  checkers.data.board = Array(64).fill(null);
  checkers.data.board[35] = { id: 'moving', owner: 0, king: true };
  checkers.data.board[26] = { id: 'captured', owner: 1, king: false };
  checkers.data.board[28] = { id: 'target', owner: 1, king: false };
  checkers.data.forced = 35; checkers.data.captured = [26];
  list.push({ id: 'checkers-forced', state: checkers });
  for (const preset of ['classic', 'quick']) for (const position of [1, 8, preset === 'classic' ? 100 : 64]) {
    const state = make('snakes', preset, 4); state.data.positions.fill(position);
    state.players.forEach(p => { p.name = 'ОченьДлинноеИмяИгрокаБезПробеловНаТелефоне'; });
    list.push({ id: `snakes-${preset}-crowded-${position}`, state });
  }
  return list;
}

function publicHandStressStates() {
  const list = [];
  for (const [game, counts, players] of [
    ['uno', [12, 24, 50, 100], [2, 4]],
    ['durak', [24, 30], [2]],
    ['domino', [14, 21], [2]]
  ]) for (const count of counts) for (const playerCount of players) {
    const state = make(game, 'classic', playerCount), d = state.data;
    const stockKey = game === 'domino' ? 'stock' : 'drawPile';
    const pool = [...d.hands.flat(), ...d[stockKey]];
    // Keep the trump at the bottom of a remaining Durak stock. All fixtures
    // redistribute the real pack rather than inventing extra card identities.
    if (game === 'durak') pool.push(...pool.splice(pool.findIndex(c => c.id === d.trump.id), 1));
    const otherCount = Math.min(game === 'durak' ? 6 : 7, Math.floor((pool.length - count) / (playerCount - 1)));
    d.hands[1] = pool.splice(0, count);
    for (let player = 0; player < playerCount; player++) if (player !== 1) d.hands[player] = pool.splice(0, otherCount);
    if (game === 'durak' && pool.length) pool.unshift(...pool.splice(pool.findIndex(c => c.id === d.trump.id), 1));
    d[stockKey] = pool;
    state.openHands = true;
    E.validateState(state);
    list.push({
      id: `${game}-public-${count}-${playerCount}`, state, viewer: 0, publicStress: true,
      publicHands: d.hands.flatMap((hand, player) => player === 0 ? [] : [{
        player, entities: hand.map(card => `${game === 'domino' ? 'tile' : 'card'}-${card.id}`),
        labels: game === 'domino' ? hand.map(card => `${card.a}·${card.b}`) : null
      }])
    });
  }
  return list;
}

test('responsive component stress layouts: narrow phones, tablet, desktop, landscape and 200% zoom', async () => {
  const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
  const browser = await chromium.launch({ executablePath: executablePath(), headless: true, args: ['--no-sandbox', '--disable-background-networking'] });
  const context = await browser.newContext({ reducedMotion: 'reduce', hasTouch: true });
  const page = await context.newPage(), failures = [];
  const css = ['app/styles.css', 'core/ui.css', 'core/input.css', 'core/motion.css', 'core/tooltips.css', ...games.map(g => `packs/${g}/styles.css`)].map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
  const fixtures = [...stressStates(), ...publicHandStressStates()];
  const sizes = [[320, 568], [390, 844], [768, 1024], [1440, 900], [667, 375], [800, 600, 2], [320, 640], [390, 740]];
  try {
    for (const [width, height, zoom = 1] of sizes) {
      await page.setViewportSize({ width, height });
      for (const fixture of fixtures) {
        const publicViewport = (width === 320 && height === 640) || (width === 390 && height === 740) || (width === 1440 && height === 900);
        if (fixture.publicStress ? !publicViewport : (height === 640 || height === 740)) continue;
        const html = render(fixture.state, fixture.viewer ?? fixture.state.turn, fixture.selected ?? null);
        await page.setContent(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body style="zoom:${zoom}"><main class="table-shell" style="height:${height / zoom}px"><header ${fixture.publicStress ? 'class="table-header"' : ''} style="height:50px;flex-shrink:0"></header><section class="scene" aria-label="Игровая сцена">${html}</section><footer style="height:24px;flex-shrink:0"></footer></main></body></html>`);
        const result = await page.evaluate(({ publicHands }) => {
          const issues = [], scene = document.querySelector('.scene'), game = document.querySelector('.game-scene');
          const tolerance = 2, rect = el => el.getBoundingClientRect();
          if (document.documentElement.scrollWidth > innerWidth + tolerance) issues.push('page horizontal overflow');
          if (scene.scrollWidth > scene.clientWidth + tolerance) issues.push(`scene horizontal overflow ${scene.scrollWidth}/${scene.clientWidth}`);
          if (game.scrollWidth > game.clientWidth + tolerance) issues.push('game horizontal overflow');
          if (publicHands) {
            if (document.documentElement.scrollHeight > innerHeight + tolerance) issues.push('page vertical overflow');
            if (scene.scrollHeight > scene.clientHeight + tolerance) issues.push(`scene vertical overflow ${scene.scrollHeight}/${scene.clientHeight}`);
            const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
            for (const { player, entities: expected, labels } of publicHands) {
              const hand = document.querySelector(`.opponent-hand[data-player-index="${player}"] .mini-hand.is-open`);
              if (!hand) { issues.push(`missing public hand ${player}`); continue; }
              if (hand.scrollWidth > hand.clientWidth + tolerance || hand.scrollHeight > hand.clientHeight + tolerance) issues.push(`public hand ${player} needs scroll ${hand.scrollWidth}×${hand.scrollHeight}/${hand.clientWidth}×${hand.clientHeight}`);
              if (hand.scrollLeft || hand.scrollTop) issues.push(`public hand ${player} starts scrolled`);
              const cards = [...hand.querySelectorAll('.public-card')];
              const actual = cards.map(card => card.querySelector('[data-entity]')?.dataset.entity);
              if (JSON.stringify(actual) !== JSON.stringify(expected)) issues.push(`public hand ${player} missing, duplicate or reordered cards`);
              for (const [index, card] of cards.entries()) {
                const entity = card.querySelector('[data-entity]'), id = entity?.dataset.entity || 'unknown';
                const domino = entity?.classList.contains('domino-tile');
                const markers = [...card.querySelectorAll(domino ? '.public-card-caption' : '.card-corner:not(.bottom)')];
                if (markers.length !== 1) { issues.push(`${id}: missing readable value`); continue; }
                if (domino && markers[0].textContent.replace(/\s/g, '') !== labels[index]) issues.push(`${id}: caption omits or changes tile values`);
                for (const marker of markers) {
                  const r = rect(marker), style = getComputedStyle(marker);
                  if (r.width < 2 || r.height < 2 || style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) { issues.push(`${id}: value hidden`); continue; }
                  if (Number.parseFloat(style.fontSize) < 9) issues.push(`${id}: value too small`);
                  if (!inside(r, rect(hand)) || !inside(r, rect(scene)) || r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight) issues.push(`${id}: value outside visible hand`);
                  const insetX = Math.min(1.5, r.width / 4), insetY = Math.min(1.5, r.height / 4);
                  for (const [x, y] of [[r.left + insetX, r.top + insetY], [r.right - insetX, r.top + insetY], [r.left + insetX, r.bottom - insetY], [r.right - insetX, r.bottom - insetY], [(r.left + r.right) / 2, (r.top + r.bottom) / 2]]) {
                    if (document.elementFromPoint(x, y)?.closest('.public-card') !== card) { issues.push(`${id}: value covered at ${x.toFixed(1)},${y.toFixed(1)}`); break; }
                  }
                  if (!domino && entity.classList.contains('playing-card')) {
                    const suit = marker.querySelector('small');
                    if (!suit || getComputedStyle(suit).display === 'none' || rect(suit).height < 6) issues.push(`${id}: suit unreadable`);
                  }
                }
              }
            }
          }
          for (const el of document.querySelectorAll('[data-action],[data-drop-select],[data-accuse-player]')) {
            const r = rect(el), minimum = el.classList.contains('checker-cell') ? 28 : 44;
            if (r.width + tolerance < minimum || r.height + tolerance < minimum) issues.push(`small action ${el.className} ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
            if (!el.getAttribute('aria-label') && !el.textContent.trim()) issues.push('unlabelled action');
          }
          const unoDrop = document.querySelector('.uno-drop-target');
          if (unoDrop) {
            if (unoDrop.querySelector('button')) issues.push('nested UNO target button');
            const center = document.querySelector('.uno-center'), before = rect(center);
            if (getComputedStyle(unoDrop).position !== 'absolute') issues.push('UNO target changes layout');
            unoDrop.remove(); const after = rect(center);
            if (Math.abs(before.width - after.width) > tolerance || Math.abs(before.height - after.height) > tolerance || Math.abs(before.x - after.x) > tolerance || Math.abs(before.y - after.y) > tolerance) issues.push('UNO discard target shifts the field');
          }
          for (const el of document.querySelectorAll('.own-hand .hand-card')) {
            const r = rect(el), domino = el.classList.contains('domino-tile');
            const minimum = domino ? [32, 60] : [56, 84];
            if (r.width + tolerance < minimum[0] || r.height + tolerance < minimum[1]) issues.push('small hand card');
            if (domino) for (const half of el.querySelectorAll('.domino-half')) {
              const h = rect(half);
              if (h.left < r.left || h.right > r.right || h.top < r.top || h.bottom > r.bottom) issues.push('clipped domino half');
              for (const pip of half.querySelectorAll('.pip')) if (rect(pip).width < 3 || rect(pip).height < 3) issues.push('unreadable domino pip');
            }
          }
          const drops = [...document.querySelectorAll('.domino-drop-target')].map(el => ({ el, before: rect(el) }));
          for (const el of document.querySelectorAll('.hand-track,.domino-chain')) {
            el.scrollLeft = el.scrollWidth;
            const last = el.classList.contains('is-fan') ? el.querySelector('.hand-fan-row .hand-card:last-child') : el.lastElementChild;
            if (last && rect(last).right > rect(el).right + tolerance) issues.push('last item unreachable by scroll');
          }
          for (const { el, before } of drops) {
            const after = rect(el), board = rect(document.querySelector('.domino-board'));
            if (Math.abs(before.x - after.x) > tolerance || Math.abs(before.y - after.y) > tolerance) issues.push('domino target moved with chain scroll');
            if (after.left < board.left || after.right > board.right || after.top < board.top || after.bottom > board.bottom) issues.push('domino target outside board');
          }
          const board = document.querySelector('.snakes-board');
          if (board) {
            const b = rect(board), tokens = [...document.querySelectorAll('.snakes-tokens .snakes-token')];
            for (const token of tokens) { const r = rect(token); if (r.left < b.left - 1 || r.right > b.right + 1 || r.top < b.top - 1 || r.bottom > b.bottom + 1) issues.push('token outside board'); }
            for (let i = 0; i < tokens.length; i++) for (let j = i + 1; j < tokens.length; j++) {
              const a = rect(tokens[i]), b = rect(tokens[j]);
              if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1) issues.push('tokens overlap');
            }
          }
          const entities = [...document.querySelectorAll('[data-entity]')].map(el => el.dataset.entity);
          if (new Set(entities).size !== entities.length) issues.push('duplicate animation entity');
          return issues;
        }, { publicHands: fixture.publicHands });
        if (result.length) failures.push(`${fixture.id} ${width}×${height}@${zoom}: ${result.join(', ')}`);
      }
    }
    assert.deepEqual(failures, []);
  } finally { await context.close(); await browser.close(); }
});
