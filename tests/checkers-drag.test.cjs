'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/checkers/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;

function fixture({capture = false, flipped = false} = {}) {
  const saved = new Session(Core, 'checkers', {seed: 17, mode: 'pass', preset: 'classic', openHands: true,
    players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const state = saved.states[0];
  if (flipped) state.turn = 1;
  if (capture) {
    state.data.board = Array(64).fill(null);
    for (const [index, owner] of [[42, 0], [56, 0], [35, 1], [21, 1], [7, 1]]) {
      state.data.board[index] = {id: `checker-${index}`, owner, king: false};
    }
    state.data.repetitions = {};
  }
  Core.validateState(state);
  return saved;
}
const coordinate = index => `${'abcdefgh'[index % 8]}${8 - Math.floor(index / 8)}`;
const cell = (page, index) => page.locator(`.checker-cell[aria-label^="${coordinate(index)}"]`);
const piece = (page, index) => page.locator(`.checker-board .checker-piece[data-board-cell="${index}"]`);
async function center(locator) {
  const r = await locator.boundingBox(); assert(r && r.width && r.height);
  return {x: r.x + r.width / 2, y: r.y + r.height / 2};
}
async function state(page) {
  return page.evaluate(() => PlayroomAppBridge.saveLibrary.current().session.current);
}
async function expectMove(page, move) {
  await page.waitForFunction(move => PlayroomAppBridge.saveLibrary.current().session.current.move === move, move);
  await page.waitForFunction(() => document.querySelector('.scene')?.getAttribute('aria-busy') !== 'true');
  assert.equal((await state(page)).move, move);
}
async function assertNoOverflow(page) {
  const issue = await page.evaluate(() => {
    const scene = document.querySelector('.scene');
    return document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 || scene.scrollWidth > scene.clientWidth + 1;
  });
  assert.equal(issue, false, 'dragging does not expand the page or scene');
}
async function mouseDrag(page, from, to, {hold = false, escape = false} = {}) {
  const start = await center(piece(page, from)), end = await center(cell(page, to));
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  if (hold) await page.waitForTimeout(220);
  else await page.mouse.move(start.x + 9, start.y - 9);
  await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
  await page.mouse.move(end.x, end.y, {steps: 4});
  await assertNoOverflow(page);
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
}
async function touch(cdp, type, point) {
  await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{...point, radiusX: 4, radiusY: 4, force: 1}]});
}
async function touchDrag(page, cdp, from, to, {hold = false, cancel = false, inspect} = {}) {
  const start = await center(piece(page, from)), end = await center(cell(page, to));
  await touch(cdp, 'touchStart', start);
  if (hold) await page.waitForTimeout(260);
  // No wait in the ordinary path: diagonal movement itself must start a drag.
  for (let step = 1; step <= 3; step++) await touch(cdp, 'touchMove', {
    x: start.x + (end.x - start.x) * step / 3, y: start.y + (end.y - start.y) * step / 3
  });
  assert.equal(await page.locator('.playroom-drag-ghost').count(), 1, 'a diagonal touch starts dragging without a hold');
  await assertNoOverflow(page);
  if(inspect)await inspect();
  await touch(cdp, cancel ? 'touchCancel' : 'touchEnd');
}

test('Checkers drag/drop through the real application', {timeout: 120000}, async t => {
  const webkit=process.env.PLAYROOM_TEST_BROWSER==='webkit',server=await require('./browser-origin.cjs').serveBrowserFixture(path.resolve(__dirname,'..')),report=[];
  const browser = await (webkit?require('playwright-core').webkit:chromium).launch(webkit?{headless:true}:{headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, options, run) {
    await t.test(name, async child => {
      const entry={name};report.push(entry);if(webkit&&options.mobile){entry.skip='Native CDP touch is Chromium-only';child.skip(entry.skip);return;}
      const context = await browser.newContext({viewport: options.mobile ? {width: 390, height: 844} : {width: 1280, height: 900},
        hasTouch: !!options.mobile, isMobile: !!options.mobile, reducedMotion: options.motion ? 'no-preference' : 'reduce'});
      const saved = fixture(options);
      await context.addInitScript(({saved, motion}) => {
        localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'checkers-drag-owner',name:'Аня',createdAt:1,updatedAt:1})); localStorage.setItem('playroom.settings.v1', JSON.stringify({motion, sound: false, autoPass:false,tutorialsEnabled:false}));
        localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
      }, {saved, motion: !!options.motion});
      const network=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(4500); page.on('pageerror', error => errors.push(error.message));
      try {
        if(process.env.PLAYROOM_CHECKERS_ARTIFACT){const fs=require('node:fs'),body=fs.readFileSync(process.env.PLAYROOM_CHECKERS_ARTIFACT),hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');await page.route('**/*',route=>route.abort());await page.route(server.url,route=>route.fulfill({status:200,contentType:'text/html',body}));const response=await page.goto(server.url);entry.artifactSha256=hash(await response.body());assert.equal(entry.artifactSha256,hash(body));}else await page.goto(process.env.PLAYROOM_URL||server.url);
        await page.locator('.game-tile').first().waitFor();await page.locator('[data-hub-page=sessions]:visible').first().click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();if(await page.locator('[data-command=unlock]').count())await page.locator('[data-command=unlock]').click();
        await page.locator('.checker-board').waitFor({state: 'visible'});
        await run({page, context, saved}); await assertNoOverflow(page); assert.deepEqual(errors, []);assert.equal(network.nativeSupabaseRequests,0);entry.pass=true;
      } finally {entry.errors=errors;entry.nativeSupabaseRequests=network.nativeSupabaseRequests;await context.close(); }
    });
  }
  try {
    await check('Thin cell and checker rings preserve the board colour in both themes and orientations', {mobile: true, capture: true}, async ({page, context}) => {
      const fs=require('node:fs'),dir=path.resolve(__dirname,'../tmp_files/checkers-review');fs.mkdirSync(dir,{recursive:true});
      await piece(page,42).tap();const cdp=await context.newCDPSession(page);
      for(const [width,height]of [[390,844],[844,390],[768,1024],[1024,768]])for(const theme of ['light','dark']){
        await page.setViewportSize({width,height});await page.evaluate(theme=>PlayroomAppearanceUI.runtime.service.select(theme),theme);
        if(!await cell(page,28).evaluate(el=>el.classList.contains('destination')))await piece(page,42).tap();
        const original=await page.locator('.checker-cell.dark:not(.destination)').first().evaluate(el=>getComputedStyle(el).backgroundColor);
        const target=cell(page,28),ring=await target.evaluate(el=>({background:getComputedStyle(el).backgroundColor,width:parseFloat(getComputedStyle(el).outlineWidth)}));
        assert.equal(ring.background,original,'destination changes only its outline');assert(ring.width>0&&ring.width<=2);
        assert(await piece(page,42).evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.piece-contour')).strokeWidth)<=2),'checker selection ring stays thin');
        await page.screenshot({path:path.join(dir,`${theme}-${width}x${height}.png`)});
        await touchDrag(page,cdp,42,28,{cancel:true,inspect:async()=>{
          const hover=await target.evaluate(el=>({background:getComputedStyle(el).backgroundColor,width:parseFloat(getComputedStyle(el).outlineWidth),shadow:getComputedStyle(el).boxShadow}));
          assert.equal(hover.background,original);assert(hover.width>0&&hover.width<=2);assert.equal(hover.shadow,'none');
          assert(await page.locator('.playroom-drag-ghost').evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.piece-contour')).strokeWidth)<=2));
        }});
      }
    });
    await check('Chained capture unlocks immediately after movement without a card-animation wait', {mobile:true,capture:true,motion:true}, async({page,context,saved})=>{
      const cdp=await context.newCDPSession(page);await touchDrag(page,cdp,42,28);const dropped=Date.now();await expectMove(page,1);
      assert(Date.now()-dropped<900,'normal-speed intermediate capture must not wait for the 1060 ms card budget');
      assert.equal((await state(page)).timeline.turn,saved.states[0].timeline.turn);
      await touchDrag(page,cdp,28,14);await expectMove(page,2);assert.equal((await state(page)).timeline.turn,saved.states[0].timeline.turn+1);
    });
    await check('Only movable pieces can be dragged; click selection exposes exact destinations', {}, async ({page, saved}) => {
      const legal = Core.legalActions(saved.states[0]);
      const actual = await page.locator('.checker-board [data-drag-piece]').evaluateAll(els => els.map(el => Number(el.dataset.dragPiece)).sort((a, b) => a - b));
      assert.deepEqual(actual, [...new Set(legal.map(a => a.from))].sort((a, b) => a - b));
      assert.equal(await page.locator('[data-drop-piece]').count(), 0);
      const first = legal[0]; await piece(page, first.from).click();
      const targets = await page.locator('.checker-cell[data-drop-piece]').evaluateAll(els => els.map(el => ({from: Number(el.dataset.dropPiece), action: JSON.parse(el.dataset.action)})));
      assert.deepEqual(targets.map(t => t.action.to).sort(), legal.filter(a => a.from === first.from).map(a => a.to).sort());
      assert(targets.every(t => t.from === first.from && t.action.from === first.from));
      await cell(page, first.to).click(); await expectMove(page, 1);
      assert.deepEqual((await state(page)).data, Core.applyAction(saved.states[0], 0, first).data);
    });
    await check('Mouse hold and immediate diagonal movement both commit exactly one move', {}, async ({page, saved}) => {
      let expected = saved.states[0];
      for (const hold of [true, false]) {
        if(expected.move>0)await page.locator('[data-command=pass-device]:not(:disabled)').click();
        const action = Core.legalActions(expected)[0]; await mouseDrag(page, action.from, action.to, {hold});
        expected = Core.applyAction(expected, expected.turn, action); await expectMove(page, expected.move);
        assert.deepEqual((await state(page)).data, expected.data);
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      }
    });
    await check('Illegal light-square drop and Escape cancel without changing the game', {}, async ({page, saved}) => {
      const action = Core.legalActions(saved.states[0])[0], before = await state(page);
      for (const [target, escape] of [[0, false], [action.to, true]]) {
        await mouseDrag(page, action.from, target, {escape}); await page.waitForTimeout(40);
        assert.deepEqual(await state(page), before); assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      }
    });
    for (const flipped of [false, true]) {
      await check(`Quick diagonal touch without a hold, viewer ${flipped ? 1 : 0}`, {mobile: true, flipped}, async ({page, context, saved}) => {
        assert.match(await page.locator('.checker-cell').first().getAttribute('aria-label'), new RegExp(`^${flipped ? 'h1' : 'a8'}`));
        const action = Core.legalActions(saved.states[0])[0], cdp = await context.newCDPSession(page);
        await touchDrag(page, cdp, action.from, action.to); await expectMove(page, 1);
        assert.deepEqual((await state(page)).data, Core.applyAction(saved.states[0], saved.states[0].turn, action).data);
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      });
    }
    await check('Held touch and touch cancellation preserve normal follow-up input', {mobile: true}, async ({page, context, saved}) => {
      const cdp = await context.newCDPSession(page), action = Core.legalActions(saved.states[0])[0], before = await state(page);
      await touchDrag(page, cdp, action.from, action.to, {hold: true, cancel: true});
      assert.deepEqual(await state(page), before); assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      await touchDrag(page, cdp, action.from, action.to, {hold: true}); await expectMove(page, 1);
    });
    await check('Mandatory and chained captures allow only the same capturing piece', {mobile: true, capture: true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page);
      assert.deepEqual(await page.locator('.checker-board [data-drag-piece]').evaluateAll(els => els.map(el => el.dataset.dragPiece)), ['42']);
      assert.equal(await piece(page, 56).getAttribute('data-drag-piece'), null);
      await touchDrag(page, cdp, 42, 28); await expectMove(page, 1);
      const mid = await state(page); assert.equal(mid.turn, 0); assert.equal(mid.data.forced, 28); assert.deepEqual(mid.data.captured, [35]);
      assert.deepEqual(await page.locator('.checker-board [data-drag-piece]').evaluateAll(els => els.map(el => el.dataset.dragPiece)), ['28']);
      assert.equal(await piece(page, 35).getAttribute('data-drag-piece'), null);
      await touchDrag(page, cdp, 28, 14); await expectMove(page, 2);
      const after = await state(page); assert.equal(after.data.forced, null); assert.equal(after.data.board[14].id, 'checker-42');
      assert.equal(after.data.board[35], null); assert.equal(after.data.board[21], null); assert.equal(after.turn, 1);
    });
    for (const mobile of [false, true]) {
      await check(`Motion keeps the dropped piece at its destination with no field overflow (${mobile ? 'touch' : 'mouse'})`, {mobile, capture: true, motion: true}, async ({page, context}) => {
        await page.evaluate(() => {
          window.dragFrames = []; window.watchDroppedPiece = false;
          const until = performance.now() + 2200;
          function frame() {
            const scene = document.querySelector('.scene'), game = document.querySelector('.game-scene');
            const el = document.querySelector('.checker-board [data-entity="checker-checker-42"][data-board-cell="28"]');
            const r = el?.getBoundingClientRect(), cell = el?.closest('.checker-cell').getBoundingClientRect();
            window.dragFrames.push({overflow: document.documentElement.scrollWidth > innerWidth + 1 || document.documentElement.scrollHeight > innerHeight + 1 || scene.scrollWidth > scene.clientWidth + 1,
              fieldTransform: getComputedStyle(game).transform,
              distance: r && cell ? Math.hypot(r.x + r.width / 2 - cell.x - cell.width / 2, r.y + r.height / 2 - cell.y - cell.height / 2) : null});
            if (performance.now() < until) requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        if (mobile) await touchDrag(page, await context.newCDPSession(page), 42, 28);
        else await mouseDrag(page, 42, 28);
        await expectMove(page, 1);
        const frames = await page.evaluate(() => window.dragFrames);
        assert(frames.length > 3); assert(frames.some(f => f.distance !== null));
        assert(frames.every(f => !f.overflow && f.fieldTransform === 'none'), 'every measured animation frame keeps the field and outer bounds stable');
        assert(frames.every(f => f.distance === null || f.distance <= 3), `dropped checker must not fly back to its old cell: ${Math.max(...frames.map(f => f.distance || 0))}px`);
      });
    }
  } finally {if(process.env.PLAYROOM_DRAG_REPORT_DIR){const fs=require('node:fs');fs.mkdirSync(process.env.PLAYROOM_DRAG_REPORT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PLAYROOM_DRAG_REPORT_DIR,'checkers-'+browser.browserType().name()+'.json'),JSON.stringify({engine:browser.browserType().name(),version:browser.version(),report},null,2));}await browser.close();await server.close(); }
});
