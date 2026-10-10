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
  first.register('example',()=>({api:2,family:'board',elements:{field:'<p>Ready</p>'}}),()=>'<svg></svg>');
  assert.equal(first.render({game:'example'},0,[]),UI.composeScene({api:2,family:'board',elements:{field:'<p>Ready</p>'}}));
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
      for (const target of state.players.keys()) assert.equal(html.includes(`data-player-target="${target}"`), target !== viewer);
      assert.doesNotMatch(html, /class="player-status-badge">UNO!/, 'one card alone is not a public declaration');
    }
  }
  state.data.uno.pending = 0;
  const pending = render(state, 1);
  state.data.uno.pending = null;
  assert.equal(render(state, 1), pending, 'catch-window changes must not provide visual clues');
  state.data.uno.declared[0] = true;
  assert.match(render(state, 1), /class="player-status-badge">UNO!/);
  assert.match(render(state, 1), /data-player-target="0"/, 'already declared players still allow a mistaken accusation');
  assert.match(render(state, 0), /class="player-status-badge">UNO!/);
  const wild = state.data.drawPile.splice(state.data.drawPile.findIndex(c => c.value === 'wild'), 1)[0];
  state.data.hands[0].push(wild); state.data.uno.declared[0] = false;
  assert.equal(callButton(render(state, 0, wild.id)), originalCall, 'colour choice retains the same call button');
  state.data.uno.mode = 'auto';
  assert.doesNotMatch(render(state, 0), /uno-call|data-player-target|uno-manual-hint/);
  delete state.data.uno;
  assert.doesNotMatch(render(state, 0), /uno-call|data-player-target|uno-manual-hint/, 'legacy games keep automatic mode');
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
    assert.equal((html.match(/class="player-panel /g)||[]).length,4);assert.doesNotMatch(html,/snakes-legend|snakes-scores/);
  }
  for (const game of games) assert.match(V.cover(game), /^<svg .*viewBox="0 0 300 180"/);
});


test('all source packs provide only API 2 elements with application-owned placement',()=>{
  for(const game of games){const state=make(game),view=V.get(game).render(E.project(state,state.turn),state.turn,E.legalActions(state),{selected:null});assert.equal(view.api,2);assert.ok(['cards','board'].includes(view.family));assert.equal(typeof view.elements.field,'string');assert.ok(view.elements.field.length);assert.doesNotMatch(Object.values(view.elements).join(''),/class="game-scene/);assert.match(V.render(E.project(state,state.turn),state.turn,[],{}),/data-view-api="2"/);}
});
