'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const Core = require('../core/engine.js');
const Session = require('../core/session.js');
require('../packs/uno/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;

function fixture({counts = [2, 2], turn = 0, pending = null, declared = [], mode = 'pass', unoMode = 'manual'} = {}) {
  const options = {preset: 'classic', seed: 17, mode, openHands: false, unoMode,
    players: counts.map((_, i) => ({name: ['Аня', 'Борис', 'Вера', 'Глеб'][i], bot: mode === 'solo' && i > 0}))};
  const saved = new Session(Core, 'uno', options).export(), state = saved.states[0], data = state.data;
  const pool = new Map([...data.hands.flat(), ...data.drawPile, ...data.discard].map(card => [card.id, card]));
  const take = (color, value) => {
    const card = [...pool.values()].find(card => card.color === color && card.value === String(value));
    assert(card, `${color}/${value}`); pool.delete(card.id); return card;
  };
  data.discard = [take('red', 5)];
  const specs = [
    [['red', 3], ['blue', 1], ['green', 1]],
    [['red', 9], ['yellow', 2], ['blue', 2]],
    [['red', 7], ['green', 4], ['blue', 4]],
    [['red', 8], ['yellow', 6], ['green', 6]]
  ];
  data.hands = counts.map((count, i) => specs[i].slice(0, count).map(([color, value]) => take(color, value)));
  data.drawPile = [...pool.values()];
  data.color = 'red'; data.direction = 1; data.drawn = null; data.noDraw = false; data.stalled = 0;
  data.uno = {mode: unoMode, declared: counts.map((_, i) => !!declared[i]), pending};
  state.turn = turn;
  Core.validateState(state);
  return saved;
}
async function read(page) {
  return page.evaluate(() => TabletopSession.restore(TabletopCore,
    JSON.parse(localStorage.getItem('playroom.session.v1'))).export());
}
async function state(page) { return (await read(page)).states.at(-1); }
async function ready(page) {
  await page.waitForFunction(() => document.querySelector('.scene')?.getAttribute('aria-busy') === 'false');
}
async function moved(page, move) {
  await page.waitForFunction(move => TabletopSession.restore(TabletopCore,
    JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === move, move);
  await ready(page);
  assert.equal((await state(page)).move, move);
}
async function resume(page) {
  await page.locator('.resume-banner [data-command=resume]').click();
  if (await page.locator('.handoff').count()) await page.locator('[data-command=unlock]').click();
  await ready(page);
}
async function action(page, type, scope = '.scene', extra = {}) {
  const candidates = page.locator(`${scope} [data-action]`);
  for (let i = 0; i < await candidates.count(); i++) {
    const candidate = candidates.nth(i), value = JSON.parse(await candidate.getAttribute('data-action'));
    if (value.type === type && Object.entries(extra).every(([key, expected]) => value[key] === expected)) return candidate;
  }
  assert.fail(`No ${type} action in ${scope}`);
}
async function play(page, id, move) {
  const card = page.locator(`.hand-track [data-entity="card-${id}"]`);
  const position = await card.evaluate(el => {
    const r = el.getBoundingClientRect();
    for (const fy of [.5, .12, .88]) for (const f of [.5, .12, .88]) { const x=r.x+r.width*f, y=r.y+r.height*fy, hit=document.elementFromPoint(x,y);
      if (hit===el || el.contains(hit)) return {x:x-r.x,y:y-r.y}; }
    throw Error('No exposed card position');
  });
  await card.click({position});
  assert.equal((await state(page)).move, move - 1, 'Selecting a card must not execute an action');
  await (await action(page, 'play', '.uno-discard', {card: id})).click();
  await moved(page, move);
}
async function accuse(page, target) {
  // GameScreen uses a common two-tap player target, not a legacy modal.
  const previous = (await state(page)).move;
  const token = page.locator(`.player-token[data-player-target="${target}"]`);
  const panel=page.locator(`.player-panel[data-player-index="${target}"]`);
  await panel.locator(".mini-hand").click();
  await panel.locator(".mini-hand").click();assert.equal(await page.locator('.player-target-menu').count(),0,'repeated hand tap closes player actions');
  await panel.locator(".mini-hand").click();
  assert.equal((await state(page)).move, previous, 'The first tap only selects a player');
  const button = page.locator('.player-target-menu button');
  await button.waitFor({state:'visible'});
  assert.equal(await button.isEnabled(), true, 'Accusation is available even when it will be wrong');
  assert.equal(await token.getAttribute('aria-expanded'),'true');
  const box=await button.boundingBox(),card=await panel.boundingBox();assert(box.x>=card.x&&box.y>=card.y&&box.x+box.width<=card.x+card.width+1&&box.y+box.height<=card.y+card.height+1,'player action stays inside its card');
  const appearance = await button.evaluate(el => ({text: el.textContent.trim(), className: el.className,
    bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color}));
  assert.equal(appearance.text,'UNO!', 'The new prompt must remain short');
  await button.click();
  assert.equal(await page.locator('.player-target-menu').count(),0);
  return appearance;
}
const ids = hand => hand.map(card => card.id);
async function visibleHandIds(page) {
  return page.locator('.hand-track [data-entity]').evaluateAll(cards => cards.map(card => card.dataset.entity.replace(/^card-/, '')));
}

test('Manual UNO declarations, accusations and device handoff through the real application', {timeout: 120000}, async t => {
  const fixtureServer=process.env.PLAYROOM_URL?.startsWith('http')?null:await serveBrowserFixture(path.resolve(__dirname,'..'));
  const testUrl=fixtureServer?.url||url;
  const browser = await chromium.launch({headless: true,
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-background-networking']});
  async function open(saved = null) {
    const context = await browser.newContext({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
    await context.addInitScript(saved => {
      if (sessionStorage.getItem('uno-social-seeded')) return;
      sessionStorage.setItem('uno-social-seeded', '1'); localStorage.clear();
      localStorage.setItem('playroom.settings.v1', JSON.stringify({sound: false, animationSpeed: 'instant'}));
      if (saved) localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
    }, saved);
    const page = await context.newPage(), errors = [];
    page.setDefaultTimeout(7000); page.on('pageerror', error => errors.push(error.message));
    await page.goto(testUrl);
    return {page, context, errors};
  }
  async function check(name, run) {
    await t.test(name, async () => {
      const environments = [];
      try {
        await run(async saved => { const env = await open(saved); environments.push(env); return env; });
        for (const env of environments) assert.deepEqual(env.errors, [], 'No uncaught browser errors');
      } finally { for (const env of environments) await env.context.close(); }
    });
  }
  try {
    await check('New games default to manual UNO, and manual/auto setup choices survive rules and player-count edits', async open => {
      for (const mode of ['manual', 'auto']) {
        const {page} = await open();
        await page.locator('[data-start=uno]').click();
        await page.locator('[data-command=room-rules]').click();
        assert.equal(await page.locator('[name=option-unoMode]').inputValue(),'manual');await page.locator('[name=option-unoMode]').selectOption(mode);await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
        await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-3',{kind:'human',nickname:'Игрок'});b.renderLobby();});
        await page.locator('[data-command=room-rules]').click();assert.equal(await page.locator('[name=option-unoMode]').inputValue(),mode);await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
        await page.locator('[data-command=lobby-start]').click();
        const saved = await read(page);
        assert.equal(saved.options.unoMode, mode);
        assert.equal(saved.states[0].data.uno.mode, mode);
      }
    });

    await check('UNO button is constant and an early declaration is logged without a penalty', async open => {
      const saved = fixture(), {page} = await open(saved);
      await resume(page);
      const button = await action(page, 'declare-uno'), beforeClass = await button.getAttribute('class');
      assert.equal((await button.innerText()).trim(), 'UNO!');
      assert.equal(await button.isEnabled(), true);
      await button.click(); await moved(page, 1);
      const after = await state(page);
      assert.deepEqual(after.data.hands.map(ids), saved.states[0].data.hands.map(ids));
      assert.equal(after.turn, 0); assert.equal(after.data.uno.declared[0], false);
      assert.match(after.events.at(-1).text, /UNO/i);
      assert.equal((await page.locator('.status-event').innerText()).trim(), after.events.at(-1).text);
      assert.equal(await (await action(page, 'declare-uno')).getAttribute('class'), beforeClass);
      await play(page, saved.states[0].data.hands[0][0].id, 2);
      assert.equal((await state(page)).data.hands[0].length, 1);
      assert.equal(await (await action(page, 'declare-uno')).getAttribute('class'), beforeClass, 'One remaining card must not highlight the declaration button');
    });

    await check('After a turn the old player can declare out of turn, then explicitly pass the device', async open => {
      const saved = fixture(), {page} = await open(saved);
      await resume(page); await play(page, saved.states[0].data.hands[0][0].id, 1);
      assert.equal((await state(page)).turn, 1);
      assert.equal(await page.locator('.handoff').count(), 0);
      assert.deepEqual(await visibleHandIds(page), ids(saved.states[0].data.hands[0].slice(1)));
      assert.equal(await page.locator('[data-command=pass-device]').isVisible(), true);
      await (await action(page, 'declare-uno')).click(); await moved(page, 2);
      const declared = await state(page);
      assert.equal(declared.data.uno.declared[0], true); assert.equal(declared.turn, 1);
      assert.equal(await page.locator('.handoff').count(), 0);
      assert.equal(await page.locator('[data-command=pass-device]').isVisible(), true);
      assert.deepEqual(await visibleHandIds(page), ids(saved.states[0].data.hands[0].slice(1)));
      await page.locator('[data-command=pass-device]').click();
      assert.equal(await page.locator('.handoff').isVisible(), true);
      assert.equal(await page.locator('.hand-track .uno-card').count(), 0);
      await page.locator('[data-command=unlock]').click();
      assert.deepEqual(await visibleHandIds(page), ids(saved.states[0].data.hands[1]));
      assert.equal((await state(page)).move, 2, 'Handoff must not add an engine action');
    });

    await check('Generic pass-device control also appears after turns with more than one card remaining', async open => {
      const saved = fixture({counts: [3, 2]}), {page} = await open(saved);
      await resume(page); await play(page, saved.states[0].data.hands[0][0].id, 1);
      assert.equal((await state(page)).data.hands[0].length, 2);
      assert.equal(await page.locator('.handoff').count(), 0);
      assert.equal(await page.locator('[data-command=pass-device]').getAttribute('aria-label'), 'Передать устройство');
      assert.deepEqual(await visibleHandIds(page), ids(saved.states[0].data.hands[0].slice(1)));
    });

    await check('A valid accusation gives exactly two cards to the undeclared player and leaves the caller turn intact', async open => {
      const saved = fixture({counts: [1, 2], turn: 1, pending: 0}), {page} = await open(saved);
      await resume(page); await accuse(page, 0); await moved(page, 1);
      const after = await state(page);
      assert.equal(after.data.hands[0].length, 3);
      assert.deepEqual(ids(after.data.hands[1]), ids(saved.states[0].data.hands[1]));
      assert.equal(after.turn, 1); assert.equal(after.data.uno.pending, null);
      assert.equal(after.data.drawPile.length, saved.states[0].data.drawPile.length - 2);
      assert.equal(await page.locator('.modal,.handoff').count(), 0);
      assert.equal((await page.locator('.status-event').innerText()).trim(), after.events.at(-1).text);
    });

    await check('Opponent menu permits a wrong accusation with no correctness hint and penalizes the caller', async open => {
      const appearances = [];
      for (const count of [1, 2]) {
        const saved = fixture({counts: [count, 2], turn: 1, pending: count === 1 ? 0 : null}), {page} = await open(saved);
        await resume(page); appearances.push(await accuse(page, 0)); await moved(page, 1);
        if (count === 2) {
          const after = await state(page);
          assert.deepEqual(ids(after.data.hands[0]), ids(saved.states[0].data.hands[0]));
          assert.equal(after.data.hands[1].length, 4); assert.equal(after.turn, 1);
        }
      }
      assert.deepEqual(appearances[0], appearances[1], 'Menu text and styling must not reveal whether an accusation is correct');
    });

    for (const [name, options, target] of [
      ['Already declared opponent', {counts: [1, 2], turn: 1, declared: [true]}, 0],
      ['Late accusation after its window', {counts: [1, 2], turn: 1}, 0],
      ['Wrong opponent while another player has an open window', {counts: [1, 2, 2], turn: 1, pending: 0}, 2]
    ]) await check(`${name} gives two cards to the accuser`, async open => {
      const saved = fixture(options), {page} = await open(saved);
      await resume(page); await accuse(page, target); await moved(page, 1);
      const after = await state(page);
      assert.equal(after.data.hands[1].length, saved.states[0].data.hands[1].length + 2);
      for (const i of [0, 2].filter(i => i < after.data.hands.length))
        assert.deepEqual(ids(after.data.hands[i]), ids(saved.states[0].data.hands[i]));
      assert.equal(after.turn, 1);
    });

    await check('The next normal action closes the accusation window, even if it is only a draw', async open => {
      const saved = fixture({counts: [1, 2], turn: 1, pending: 0}), {page} = await open(saved);
      await resume(page); await (await action(page, 'draw')).click(); await moved(page, 1);
      assert.equal((await state(page)).data.uno.pending, null);
      await accuse(page, 0); await moved(page, 2);
      const after = await state(page);
      assert.equal(after.data.hands[0].length, 1); assert.equal(after.data.hands[1].length, 5);
      assert.equal(after.turn, 1);
    });

    await check('A reaction during pending handoff preserves the old viewer and the pass-device control', async open => {
      const saved = fixture(), {page} = await open(saved);
      await resume(page); await play(page, saved.states[0].data.hands[0][0].id, 1);
      await accuse(page, 1); await moved(page, 2);
      const after = await state(page);
      assert.equal(after.data.hands[0].length, 3); assert.equal(after.turn, 1);
      assert.equal(await page.locator('.handoff').count(), 0);
      assert.equal(await page.locator('[data-command=pass-device]').isVisible(), true);
      assert.deepEqual(await visibleHandIds(page), ids(after.data.hands[0]));
    });

    await check('Manual declaration and complete reaction history survive reload and compact save restoration', async open => {
      const saved = fixture(), {page} = await open(saved);
      await resume(page); await play(page, saved.states[0].data.hands[0][0].id, 1);
      await (await action(page, 'declare-uno')).click(); await moved(page, 2);
      const before = await read(page);
      await page.reload(); await resume(page);
      assert.deepEqual(await read(page), before);
      assert.equal((await state(page)).data.uno.declared[0], true);
      await accuse(page, 0); await moved(page, 3);
      assert.equal((await state(page)).data.hands[1].length, 4, 'Restored declaration must reject a later accusation');
    });

    await check('Bots declare and catch through reactions even while it is the human normal turn', async open => {
      for (const pending of [1, 0]) {
        const saved = fixture({counts: pending === 1 ? [2, 1] : [1, 2], mode: 'solo', turn: 0, pending}), {page} = await open(saved);
        await resume(page); await moved(page, 1);
        const after = await state(page);
        assert.equal(after.turn, 0);
        if (pending === 1) assert.equal(after.data.uno.declared[1], true);
        else { assert.equal(after.data.hands[0].length, 3); assert.equal(after.data.hands[1].length, 2); }
        assert(after.events.some(event => event.player === 1 && event.kind === (pending === 1 ? 'uno' : 'uno-caught')));
      }
    });

    await check('Auto mode keeps automatic UNO and restores legacy sessions without manual controls', async open => {
      for (const legacy of [false, true]) {
        const saved = fixture({unoMode: 'auto'});
        if (legacy) { delete saved.options.unoMode; delete saved.states[0].data.uno; }
        const {page} = await open(saved); await resume(page);
        assert.equal(await page.locator('[data-player-target]').count(), 0);
        assert.equal(await page.locator('.scene [data-action]').evaluateAll(nodes =>
          nodes.some(node => JSON.parse(node.dataset.action).type === 'declare-uno')), false);
        await play(page, saved.states[0].data.hands[0][0].id, 1);
        assert((await state(page)).events.some(event => /UNO!/.test(event.text)));
      }
    });
  } finally { await browser.close(); await fixtureServer?.close(); }
});
