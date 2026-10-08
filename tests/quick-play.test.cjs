'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;

function fixture(plusFour = false) {
  const saved = new Session(Core, 'uno', {seed: 17, mode: 'pass', preset: 'classic', openHands: true, unoMode: 'auto',
    players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const s = saved.states[0], d = s.data, cards = new Map([...d.hands.flat(), ...d.drawPile, ...d.discard].map(c => [c.id, c]));
  const take = id => {const c = cards.get(id); assert(c); cards.delete(id); return c;};
  d.discard = [take('u9')]; d.color = 'red'; d.direction = 1; d.drawn = null; d.noDraw = false; d.stalled = 0;
  d.hands = [['u1', 'u26', 'u100', 'u3', 'u27', 'u4', 'u2'].map(take), ['u5', 'u76', 'u30', 'u50', 'u60', 'u81', 'u52'].map(take)];
  if (plusFour) {
    for (let i = 0; i < d.hands[0].length; i++) if (d.hands[0][i].color === 'red') {
      const old = d.hands[0][i];
      const replacement = [...cards.values()].find(c => c.color === 'blue' && /^\d$/.test(c.value));
      d.hands[0][i] = take(replacement.id); cards.set(old.id, old);
    }
    const special = [...cards.values()].find(c => c.value === '+4'), old = d.hands[0][0];
    d.hands[0][0] = take(special.id); cards.set(old.id, old);
  }
  d.drawPile = [...cards.values()]; s.turn = 0; Core.validateState(s); return saved;
}
const card = (page, id) => page.locator(`.own-hand [data-hand-preview="${id}"]`);
const drop = (page, id) => page.locator(`.uno-drop-target[data-drop-piece="${id}"][data-action]`);
async function current(page) {return page.evaluate(() => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current);}
async function readyMove(page, move) {
  await page.waitForFunction(n => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === n, move);
  await page.waitForFunction(() => document.querySelector('.scene')?.getAttribute('aria-busy') !== 'true');
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal((await current(page)).move, move, 'one physical gesture commits only one action');
}
async function point(locator) {
  return locator.evaluate(el => {
    const r = el.getBoundingClientRect();
    for (const fy of [.2, .5, .8]) for (const fx of [.2, .5, .8]) {
      const p = {x: r.x + r.width * fx, y: r.y + r.height * fy}, hit = document.elementFromPoint(p.x, p.y);
      if (hit === el || el.contains(hit)) return p;
    }
    throw Error('No exposed input point');
  });
}
async function touch(cdp, type, p) {await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{...p, radiusX: 4, radiusY: 4, force: 1}]});}

test('Optional UNO one-tap play with real mouse and native touch input', {timeout: 120000}, async t => {
  const fixtureServer=process.env.PLAYROOM_URL?.startsWith('http')?null:await serveBrowserFixture(path.resolve(__dirname,'..'));
  const testUrl=fixtureServer?.url||url;
  const browser = await chromium.launch({headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, mobile, options, run) {
    await t.test(`${mobile ? 'Touch' : 'Mouse'}: ${name}`, async () => {
      const context = await browser.newContext({viewport: mobile ? {width: 390, height: 740} : {width: 1280, height: 900}, isMobile: mobile, hasTouch: mobile, reducedMotion: 'reduce'});
      const saved = fixture(options.plusFour);
      await context.addInitScript(saved => {
        if (sessionStorage.getItem('quick-play-test-seeded')) return;
        sessionStorage.setItem('quick-play-test-seeded', '1'); localStorage.clear();
        localStorage.setItem('playroom.settings.v1', JSON.stringify({motion: false, sound: false}));
        localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
      }, saved);
      const page = await context.newPage(), cdp = mobile ? await context.newCDPSession(page) : null, errors = [];
      page.setDefaultTimeout(4500); page.on('pageerror', e => errors.push(e.message));
      const press = async locator => {
        const p = await point(locator);
        if (cdp) {await touch(cdp, 'touchStart', p); await touch(cdp, 'touchEnd');}
        else await page.mouse.click(p.x, p.y);
      };
      const settings = async () => {
        if (await page.locator('.table-shell').count()) await press(page.locator('[data-command="home"]').first());
        await press(page.locator('[data-command="settings"]').filter({visible: true}).first());
        await page.locator('#setting-quick-play').waitFor({state: 'visible'});
      };
      const setQuick = async enabled => {
        await settings();
        const input = page.locator('#setting-quick-play');
        if (await input.isChecked() !== enabled) await press(input);
        await page.waitForFunction(enabled => JSON.parse(localStorage.getItem('playroom.settings.v1')).quickPlay === enabled, enabled);
        await press(page.locator('.modal [data-command="close-modal"]').first());
      };
      const resume = async () => {await press(page.locator('.resume-banner [data-command="resume"]')); await page.locator('.own-hand').waitFor({state: 'visible'});};
      try {
        await page.goto(testUrl);
        if (options.enabled) await setQuick(true);
        await resume(); await run({page, cdp, press, settings, setQuick, resume, saved}); assert.deepEqual(errors, []);
      } finally {await context.close();}
    });
  }
  try {
    for (const mobile of [false, true]) {
      await check('default preview, persisted opt-in and switching back to preview', mobile, {}, async ({page, press, settings, setQuick, resume}) => {
        assert.equal(await card(page, 'u1').getAttribute('data-action'), null);
        await press(card(page, 'u1')); await drop(page, 'u1').waitFor({state: 'visible'}); assert.equal((await current(page)).move, 0);
        await setQuick(true); await page.reload(); await settings(); assert.equal(await page.locator('#setting-quick-play').isChecked(), true);
        await press(page.locator('.modal [data-command="close-modal"]').first()); await resume();
        assert.equal(JSON.parse(await card(page, 'u1').getAttribute('data-action')).card, 'u1');
        await press(card(page, 'u1')); await readyMove(page, 1); assert.equal((await current(page)).data.discard.at(-1).id, 'u1');
        await setQuick(false); await resume(); assert.equal(await card(page, 'u5').getAttribute('data-action'), null);
        await press(card(page, 'u5')); await drop(page, 'u5').waitFor({state: 'visible'}); assert.equal((await current(page)).move, 1);
        await press(drop(page, 'u5')); await readyMove(page, 2);
      });
      await check('illegal cards remain previews; wild still requires an explicit colour', mobile, {enabled: true}, async ({page, press}) => {
        assert.equal(await card(page, 'u26').getAttribute('data-action'), null);
        await press(card(page, 'u26')); await page.waitForFunction(() => document.querySelector('[data-hand-preview="u26"]')?.getAttribute('aria-pressed') === 'true');
        assert.equal((await current(page)).move, 0); assert.equal(await page.locator('.uno-drop-target').count(), 0);
        await press(card(page, 'u100')); await page.locator('.uno-color-picker').waitFor({state: 'visible'});
        assert.equal((await current(page)).move, 0); assert.equal(await page.locator('.color-choice[data-action]').count(), 4);
        const blue = page.locator('.color-choice').filter({has: page.locator('i')}).nth(3);
        const expected = JSON.parse(await blue.getAttribute('data-action')); await press(blue); await readyMove(page, 1);
        assert.equal((await current(page)).data.color, expected.color); assert.equal((await current(page)).data.discard.at(-1).id, 'u100');
      });
      await check('+4 never guesses the selected colour', mobile, {enabled: true, plusFour: true}, async ({page, press, saved}) => {
        const id = saved.states[0].data.hands[0].find(c => c.value === '+4').id;
        assert.equal(await card(page, id).getAttribute('data-action'), null); await press(card(page, id));
        await page.locator('.uno-color-picker').waitFor({state: 'visible'}); assert.equal((await current(page)).move, 0);
        const choice = page.locator('.color-choice[data-action]').first(), action = JSON.parse(await choice.getAttribute('data-action'));
        await press(choice); await readyMove(page, 1);
        assert.deepEqual((await current(page)).data, Core.applyAction(saved.states[0], 0, action).data);
      });
      await check('drag/drop remains one action with quick play enabled', mobile, {enabled: true}, async ({page, cdp, saved}) => {
        const p = await point(card(page, 'u1'));
        if (cdp) await touch(cdp, 'touchStart', p); else {await page.mouse.move(p.x, p.y); await page.mouse.down();}
        await page.waitForTimeout(270); await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
        assert.equal((await current(page)).move, 0, 'picking up a quick-play card must not play it');
        const target = drop(page, 'u1'), q = await point(target), action = JSON.parse(await target.getAttribute('data-action'));
        if (cdp) {for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', {x: p.x + (q.x - p.x) * step / 4, y: p.y + (q.y - p.y) * step / 4}); await touch(cdp, 'touchEnd');}
        else {await page.mouse.move(q.x, q.y, {steps: 5}); await page.mouse.up();}
        await readyMove(page, 1); assert.deepEqual((await current(page)).data, Core.applyAction(saved.states[0], 0, action).data);
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      });
    }
  } finally {await browser.close(); await fixtureServer?.close();}
});
