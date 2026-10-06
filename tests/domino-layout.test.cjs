'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/domino/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const shots = process.env.DOMINO_SCREENSHOTS || '/tmp/playroom-qa/domino-compact';

function fixture(length = 7) {
  const saved = new Session(Core, 'domino', {seed: 17, mode: 'pass', openHands: true,
    players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const state = saved.states[0], d = state.data;
  const all = new Map([...d.hands.flat(), ...d.stock].map(tile => [tile.id, tile]));
  const prefix = [1, 1, 2, 2, 3, 3, 4, 4];
  const chain = prefix.slice(1).map((b, i) => ({id: `d${Math.min(prefix[i], b)}${Math.max(prefix[i], b)}`, a: prefix[i], b}));
  const unused = [...all.values()].filter(tile => !chain.some(c => c.id === tile.id));
  const stack = [4], trail = [];
  while (stack.length) {
    const a = stack.at(-1), index = unused.findIndex(t => t.a === a || t.b === a);
    if (index < 0) trail.push(stack.pop());
    else { const t = unused.splice(index, 1)[0]; stack.push(t.a === a ? t.b : t.a); }
  }
  trail.reverse();
  chain.push(...trail.slice(1).map((b, i) => ({id: `d${Math.min(trail[i], b)}${Math.max(trail[i], b)}`, a: trail[i], b})));
  d.chain = chain.slice(0, length);
  d.chain.forEach(tile => all.delete(tile.id));
  const rest = [...all.values()].sort((a, b) => (a.id === 'd14' ? -1 : b.id === 'd14' ? 1 : a.id.localeCompare(b.id)));
  const count = Math.min(7, Math.ceil(rest.length / 2));
  d.hands = [rest.splice(0, count), rest.splice(0, Math.min(7, rest.length))];
  d.stock = rest; d.passes = 0; state.turn = 0;
  if (length === 28) { state.status = 'finished'; state.winner = 0; }
  Core.validateState(state); return saved;
}
async function center(locator) { const r = await locator.boundingBox(); assert(r); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; }
async function state(page) { return page.evaluate(() => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current); }
async function ready(page, move) {
  await page.waitForFunction(move => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === move, move);
  await page.waitForFunction(() => document.querySelector('.scene').getAttribute('aria-busy') !== 'true');
}
async function touch(cdp, type, point) { await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{...point, radiusX: 4, radiusY: 4, force: 1}]}); }
async function geometry(page, {fullScene = false, count = 7} = {}) {
  const result = await page.evaluate(({fullScene, count}) => {
    const errors = [], chain = document.querySelector('.domino-chain'), scene = document.querySelector('.scene'), board = document.querySelector('.domino-board'), track = document.querySelector('.hand-track');
    const r = el => el.getBoundingClientRect(), contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    const within = (el, area, label) => {if (!contains(r(area), r(el))) errors.push(label);};
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('page horizontal overflow');
    if (scene.scrollWidth > scene.clientWidth + 1) errors.push('scene horizontal overflow');
    if (chain.scrollWidth > chain.clientWidth + 1 || chain.scrollHeight > chain.clientHeight + 1) errors.push('chain internal scrolling');
    if (fullScene && scene.scrollHeight > scene.clientHeight + 1) errors.push(`scene vertical scroll ${scene.scrollHeight}/${scene.clientHeight}`);
    const tiles = [...chain.querySelectorAll('[data-entity]')];
    if (tiles.length !== count) errors.push(`chain count ${tiles.length}/${count}`);
    for (const tile of tiles) {
      within(tile, board, 'chain tile outside board');
      for (const half of tile.querySelectorAll('.domino-half')) within(half, tile, 'half outside tile');
      if (r(tile).width < 25 || r(tile).height < 25) errors.push('unreadably small tile');
      if (fullScene) within(tile, scene, 'chain tile clipped by scene');
    }
    for (const end of chain.querySelectorAll('.domino-drop-target,.domino-drop-placeholder')) {
      if (r(end).width < 44 || r(end).height < 44) errors.push('end target below 44px');
      within(end, board, 'end outside board');
      if (fullScene) within(end, scene, 'end clipped by scene');
    }
    if (count <= 14) {
      if (track.querySelectorAll('.domino-tile').length !== 7) errors.push('fixture missing seven hand tiles');
      if (track.scrollWidth > track.clientWidth + 1) errors.push('seven-tile hand scrolls');
      for (const tile of track.querySelectorAll('.domino-tile')) {
        within(tile, track, 'hand tile outside track');
        for (const half of tile.querySelectorAll('.domino-half')) within(half, tile, 'hand half clipped');
        if (fullScene) within(tile, scene, 'hand tile clipped by scene');
      }
    }
    return errors;
  }, {fullScene, count});
  assert.deepEqual(result, []);
}

test('Domino snake field keeps the complete chain, real endpoints and seven hand tiles readable on phones', {timeout: 120000}, async t => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, options, run) {
    await t.test(name, async () => {
      const context = await browser.newContext({viewport: options.viewport || {width: 390, height: 740}, isMobile: true, hasTouch: true, reducedMotion: 'reduce'});
      const saved = fixture(options.length || 7);
      if(options.double){
        const d=saved.states[0].data,zones=[...d.hands,d.stock];
        for(const [id,target,index] of [['d45',d.chain,6],['d55',d.hands[0],0]]){
          const source=zones.find(zone=>zone.some(tile=>tile.id===id)),at=source.findIndex(tile=>tile.id===id);
          [target[index],source[at]]=[source[at],target[index]];
        }
        Core.validateState(saved.states[0]);
      }
      await context.addInitScript(saved => {localStorage.clear(); localStorage.setItem('playroom.settings.v1', JSON.stringify({motion: false, sound: false})); localStorage.setItem('playroom.session.v1', JSON.stringify(saved));}, saved);
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(url); await page.locator('.resume-banner [data-command=resume]').click(); await page.locator('.domino-chain').waitFor({state: 'visible'});
        await run({page, context, saved}); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
  try {
    for (const viewport of [{width: 320, height: 640}, {width: 390, height: 740}]) for (const length of [3, 7]) {
      await check(`${length} tiles and both endpoints fit without scene scrolling at ${viewport.width}×${viewport.height}`, {viewport, length}, async ({page, saved}) => {
        await page.locator('.hand-track [data-select="d14"]').click();
        assert.equal(await page.locator('.domino-end-slot').count(), 2);
        assert.equal(await page.locator('.domino-drop-target').count(), Core.legalActions(saved.states[0], 0).filter(a => a.card === 'd14').length);
        await geometry(page, {fullScene: true, count: length});
        if (length === 7) { fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: path.join(shots, `domino-7-${viewport.width}.png`)}); }
      });
    }
    for (const length of [14, 21, 28]) {
      await check(`${length} tiles remain entirely inside a wrapping field without internal scrolling`, {length, viewport: {width: 320, height: 640}}, async ({page}) => {
        await geometry(page, {count: length});
        const rows = await page.locator('.domino-chain').evaluate(el => new Set([...el.querySelectorAll('.domino-node')].map(n => n.dataset.flowRow)).size);
        assert.equal(rows, Math.ceil((length + 2) / 5));
        fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: path.join(shots, `domino-${length}-320.png`)});
      });
    }
    await check('A folded row reverses visible halves; clicking its real end preserves canonical orientation', {}, async ({page, saved}) => {
      await page.locator('.hand-track [data-select="d14"]').click();
      const target = page.locator('.domino-end-slot.right .domino-drop-target');
      const flow = await target.evaluate(el => {const node = el.closest('.domino-node'), halves = [...el.querySelectorAll('.domino-half')].map(h => h.getBoundingClientRect().x); return {row: Number(node.dataset.flowRow), halves};});
      assert.equal(flow.row, 1); assert(flow.halves[0] > flow.halves[1], 'entry half is on the right of the reversed row');
      const action = JSON.parse(await target.getAttribute('data-action')), expected = Core.applyAction(saved.states[0], 0, action);
      await target.click(); await ready(page, 1); assert.deepEqual((await state(page)).data.chain, expected.data.chain);
    });
    await check('A double preview and placed double remain perpendicular on a reversed row', {double:true}, async ({page}) => {
      await page.locator('.hand-track [data-select="d55"]').click();
      const target=page.locator('.domino-end-slot.right .domino-drop-target'),preview=target.locator('.domino-preview.double');
      const before=await preview.boundingBox(); assert(before.height>before.width);
      assert.equal(await target.getAttribute('data-preview-a'),'5'); assert.equal(await target.getAttribute('data-preview-b'),'5');
      await target.click(); await ready(page,1);
      const placed=await page.locator('.domino-chain [data-entity="tile-d55"]').boundingBox(); assert(placed.height>placed.width);
      assert.deepEqual((await state(page)).data.chain.at(-1),{id:'d55',a:5,b:5});
    });
    for (const side of ['left', 'right']) {
      await check(`Native touch drag reaches the ${side} physical endpoint on a 320px folded board`, {viewport: {width: 320, height: 640}}, async ({page, context, saved}) => {
        const cdp = await context.newCDPSession(page), from = await center(page.locator('.hand-track [data-drag-piece="d14"]'));
        await touch(cdp, 'touchStart', from); await page.waitForTimeout(280); await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
        const target = page.locator(`.domino-end-slot.${side} .domino-drop-target`), to = await center(target), action = JSON.parse(await target.getAttribute('data-action'));
        for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', {x: from.x + (to.x - from.x) * step / 5, y: from.y + (to.y - from.y) * step / 5});
        await touch(cdp, 'touchEnd'); await ready(page, 1);
        assert.deepEqual((await state(page)).data.chain, Core.applyAction(saved.states[0], 0, action).data.chain);
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      });
    }
  } finally { await browser.close(); }
});
