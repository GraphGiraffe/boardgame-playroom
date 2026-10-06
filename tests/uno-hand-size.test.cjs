'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;

function fixture(count = 7) {
  const saved = new Session(Core, 'uno', {seed: 17, mode: 'pass', preset: 'classic', openHands: true, unoMode: 'manual', players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const d = saved.states[0].data;
  if (count > 7) d.hands[0].push(...d.drawPile.splice(0, count - 7));
  else if (count < 7) d.drawPile.push(...d.hands[0].splice(count));
  Core.validateState(saved.states[0]); return saved;
}
async function geometry(page) {
  return page.evaluate(() => {
    const box = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height};};
    const scene = document.querySelector('.scene'), track = document.querySelector('.hand-track');
    return {scene: box('.scene'), deck: box('.stock-button'), discard: box('.uno-discard'), hand: box('.own-hand'), track: box('.hand-track'),
      rows: track.querySelectorAll('.hand-fan-row').length, cards: track.querySelectorAll('.uno-card').length,
      outerX: document.documentElement.scrollWidth - innerWidth, outerY: document.documentElement.scrollHeight - innerHeight,
      sceneY: scene.scrollHeight - scene.clientHeight, sceneX: scene.scrollWidth - scene.clientWidth, handX: track.scrollWidth - track.clientWidth, handY: track.scrollHeight - track.clientHeight};
  });
}
function stable(before, after, label) {
  for (const part of ['scene', 'deck', 'discard', 'hand', 'track']) for (const axis of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(before[part][axis] - after[part][axis]) <= 1, `${label}: ${part}.${axis} ${before[part][axis]} → ${after[part][axis]}`);
  }
  for (const key of ['outerX', 'outerY', 'sceneX', 'sceneY', 'handY']) assert(after[key] <= 1, `${label}: ${key} overflow ${after[key]}`);
}
async function touch(cdp, type, point) {await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{...point, radiusX: 4, radiusY: 4, force: 1}]});}

test('UNO hand count never changes row height or shifts the table', {timeout: 120000}, async t => {
  const browser = await chromium.launch({headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking']});
  async function open(viewport, count, fn) {
    const mobile = viewport.width < 500, context = await browser.newContext({viewport, hasTouch: mobile, isMobile: mobile, reducedMotion: 'no-preference'});
    const saved = fixture(count);
    await context.addInitScript(saved => {localStorage.clear(); localStorage.setItem('playroom.settings.v1', JSON.stringify({animationSpeed: 'normal', sound: false})); localStorage.setItem('playroom.session.v1', JSON.stringify(saved));}, saved);
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(4500); page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(url); await page.locator('.resume-banner [data-command=resume]').click(); await page.locator('.hand-track').waitFor({state: 'visible'});
      await fn({page, context, saved}); assert.deepEqual(errors, []);
    } finally {await context.close();}
  }
  try {
    for (const viewport of [{width: 1226, height: 825}, {width: 1280, height: 900}, {width: 320, height: 640}, {width: 390, height: 740}]) {
      await t.test(`Real draw 7 → 8 stays stable throughout animation at ${viewport.width}×${viewport.height}`, async () => {
        await open(viewport, 7, async ({page}) => {
          const before = await geometry(page); assert.equal(before.rows, 1); assert.equal(before.cards, 7); assert(before.handX <= 1);
          await page.evaluate(() => {
            window.handSizeFrames = []; window.stopHandSizeFrames = false;
            const box = selector => {const r = document.querySelector(selector).getBoundingClientRect(); return {x: r.x, y: r.y, width: r.width, height: r.height};};
            function sample() {
              const scene = document.querySelector('.scene'), track = document.querySelector('.hand-track');
              window.handSizeFrames.push({scene: box('.scene'), deck: box('.stock-button'), discard: box('.uno-discard'), hand: box('.own-hand'), track: box('.hand-track'),
                outerX: document.documentElement.scrollWidth - innerWidth, outerY: document.documentElement.scrollHeight - innerHeight,
                sceneX: scene.scrollWidth - scene.clientWidth, sceneY: scene.scrollHeight - scene.clientHeight, handY: track.scrollHeight - track.clientHeight});
              if (!window.stopHandSizeFrames) requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          });
          await page.locator('.stock-button').click();
          await page.waitForFunction(() => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === 1);
          await page.waitForFunction(() => document.querySelector('.scene').getAttribute('aria-busy') !== 'true');
          const frames = await page.evaluate(() => {window.stopHandSizeFrames = true; return window.handSizeFrames;});
          const after = await geometry(page); assert.equal(after.cards, 8); assert.equal(after.rows, 1); assert(after.handX <= 1);
          stable(before, after, 'settled draw'); assert(frames.length >= 4, 'record several animation frames');
          frames.forEach((frame, i) => stable(before, frame, `frame ${i}`));
          const corners = await page.locator('.own-hand .card-corner:not(.bottom)').evaluateAll(els => els.map(el => {
            const r = el.getBoundingClientRect(), own = el.closest('.uno-card'); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.uno-card') === own;
          }));
          assert(corners.every(Boolean), 'all eight values remain directly visible');
          if (process.env.PLAYROOM_CAPTURE_DIR && [1226, 390].includes(viewport.width)) {
            await page.screenshot({path: path.join(process.env.PLAYROOM_CAPTURE_DIR, `playroom-v0.5-uno-${viewport.width < 500 ? 'phone' : 'desktop'}-eight.png`)});
          }
        });
      });
    }
    for (const viewport of [{width: 1226, height: 825}, {width: 1280, height: 900}, {width: 320, height: 640}, {width: 390, height: 740}]) {
      await t.test(`One stable row from 1 to 35 cards at ${viewport.width}×${viewport.height}`, async () => {
        let base;
        for (const count of [1, 7, 8, 12, 35]) await open(viewport, count, async ({page}) => {
          const current = await geometry(page); assert.equal(current.rows, 1); assert.equal(current.cards, count);
          if (!base) base = current; stable(base, current, `${count} cards`);
          if (count === 35) assert(current.handX > 1, 'very long hands scroll inside their fixed region');
          if (count <= 8 || (viewport.width > 1000 && count <= 12)) assert(current.handX <= 1, 'ordinary hand fits available width');
        });
      });
    }
    await t.test('A long hand scrolls by native horizontal touch without playing or moving the field', async () => {
      await open({width: 390, height: 740}, 35, async ({page, context, saved}) => {
        const before = await geometry(page), cdp = await context.newCDPSession(page);
        const p = await page.locator('.hand-track').evaluate(el => {const r = el.getBoundingClientRect(); return {x: r.right - 45, y: r.top + r.height / 2};});
        await touch(cdp, 'touchStart', p);
        for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', {x: p.x - step * 32, y: p.y});
        await touch(cdp, 'touchEnd'); await page.waitForFunction(() => document.querySelector('.hand-track').scrollLeft > 30);
        stable(before, await geometry(page), 'horizontal touch');
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
        const after = await page.evaluate(() => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current);
        assert.equal(after.move, 0); assert.deepEqual(after.data.hands, saved.states[0].data.hands);
        const cards = page.locator('.own-hand .uno-card');
        for (let i = 0; i < await cards.count(); i++) {
          await cards.nth(i).scrollIntoViewIfNeeded();
          assert(await cards.nth(i).evaluate(el => {const r = el.querySelector('.card-corner').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.uno-card') === el;}), `card ${i} remains reachable`);
        }
        stable(before, await geometry(page), 'all cards inspected');
      });
    });
  } finally {await browser.close();}
});
