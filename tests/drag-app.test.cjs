'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root = path.resolve(__dirname, '..');
const Core = require('../core/engine.js');
const Session = require('../core/session.js');
require('../packs/domino/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.join(root, 'index.html')).href;
const HOLD_MS = 320;

function fixture({longHand = false, empty = false} = {}) {
  const session = new Session(Core, 'domino', {seed: 17, mode: 'pass', preset: 'classic', openHands: true,
    players: [{name: 'Аня'}, {name: 'Борис'}]});
  const saved = session.export(), state = saved.states[0], data = state.data;
  const tiles = new Map([...data.hands.flat(), ...data.stock].map(tile => [tile.id, tile]));
  const take = id => { const tile = tiles.get(id); assert(tile, id); tiles.delete(id); return tile; };
  data.chain = [take('d11')];
  data.hands = [
    ['d12', 'd13', 'd14', 'd15', 'd16', 'd01', 'd00'].map(take),
    ['d22', 'd23', 'd24', 'd25', 'd26', 'd02', 'd03'].map(take)
  ];
  data.stock = [...tiles.values()];
  data.passes = 0;
  state.turn = 0;
  if (longHand) data.hands[0].push(...data.stock.splice(0));
  if (empty) data.hands[0].push(...data.chain.splice(0));
  Core.validateState(state);
  return saved;
}

async function state(page) {
  return page.evaluate(() => TabletopSession.restore(TabletopCore,
    JSON.parse(localStorage.getItem('playroom.session.v1'))).export().states.at(-1));
}
async function expectMove(page, expected) {
  await page.waitForFunction(n => TabletopSession.restore(TabletopCore,
    JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === n, expected);
  await page.waitForFunction(() => document.querySelector('.scene')?.getAttribute('aria-busy') !== 'true');
  assert.equal((await state(page)).move, expected);
}
const tile = (page, id = 'd12') => page.locator(`.hand-track [data-drag-piece="${id}"]`);
const targets = (page, id = 'd12') => page.locator(`.domino-drop-target[data-drop-piece="${id}"]`);
async function targetFor(page, id = 'd12', side = 'right') {
  const all = targets(page, id);
  await all.first().waitFor({state: 'visible'});
  for (let i = 0; i < await all.count(); i++) {
    const candidate = all.nth(i), action = JSON.parse(await candidate.getAttribute('data-action'));
    if (action.side === side) return candidate;
  }
  assert.fail(`No legal ${side} target for ${id}`);
}
async function center(locator) {
  const box = await locator.boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'Interactive element must have a visible rectangle');
  return {x: box.x + box.width / 2, y: box.y + box.height / 2};
}
async function touch(cdp, type, point) {
  await cdp.send('Input.dispatchTouchEvent', {type,
    touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{...point, radiusX: 4, radiusY: 4, force: 1}]});
}
async function tap(cdp, locator) {
  await touch(cdp, 'touchStart', await center(locator));
  await touch(cdp, 'touchEnd');
}
async function touchDrag(page, cdp, id = 'd12', side = 'right') {
  const source = await center(tile(page, id));
  await touch(cdp, 'touchStart', source);
  await page.waitForTimeout(HOLD_MS);
  await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
  const destination = await center(await targetFor(page, id, side));
  for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', {
    x: source.x + (destination.x - source.x) * step / 5,
    y: source.y + (destination.y - source.y) * step / 5
  });
  await touch(cdp, 'touchEnd');
}

test('Domino selection and drag gestures through the real application', {timeout: 120000}, async t => {
  const browser = await chromium.launch({headless: true,
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, {mobile = false, longHand = false, empty = false, autoPass = false} = {}, run) {
    await t.test(name, async () => {
      const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1280, height: 900},
        hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce'});
      const saved = fixture({longHand, empty});
      await context.addInitScript(({saved,autoPass}) => {
        localStorage.clear();
        localStorage.setItem('playroom.settings.v1', JSON.stringify({motion: false, sound: false,autoPass}));
        localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
      }, {saved,autoPass});
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto(url);
        await page.locator('.resume-banner [data-command=resume]').click();
        await tile(page).waitFor({state: 'visible'});
        await run({page, context, saved});
        assert.deepEqual(errors, [], 'No uncaught browser errors');
      } finally { await context.close(); }
    });
  }
  try {
    await check('Tile click selects without playing and previews exactly the legal board placements', {}, async ({page, saved}) => {
      assert.equal(await tile(page).getAttribute('data-action'), null);
      assert.equal(await targets(page).count(), 0);
      await tile(page).click();
      assert.equal((await state(page)).move, 0);
      const expected = Core.legalActions(saved.states[0], 0).filter(action => action.card === 'd12');
      assert.equal(await targets(page).count(), expected.length);
      for (const action of expected) {
        const target = await targetFor(page, action.card, action.side);
        const next = Core.applyAction(saved.states[0], 0, action);
        const placed = action.side === 'left' ? next.data.chain[0] : next.data.chain.at(-1);
        assert.equal(Number(await target.getAttribute('data-preview-a')), placed.a);
        assert.equal(Number(await target.getAttribute('data-preview-b')), placed.b);
      }
      await (await targetFor(page)).click();
      await expectMove(page, 1);
      assert.deepEqual((await state(page)).data.chain,
        Core.applyAction(saved.states[0], 0, expected.find(a => a.side === 'right')).data.chain);
    });

    await check('Empty board offers one correctly oriented initial placement', {empty: true}, async ({page}) => {
      await tile(page).click();
      assert.equal((await state(page)).move, 0);
      assert.equal(await targets(page).count(), 1);
      const target = await targetFor(page);
      assert.equal(await target.getAttribute('data-preview-a'), '1');
      assert.equal(await target.getAttribute('data-preview-b'), '2');
      await target.click();
      await expectMove(page, 1);
      assert.deepEqual((await state(page)).data.chain.map(t => [t.a, t.b]), [[1, 2]]);
    });

    await check('Mouse hold, move and legal drop commits exactly one action', {}, async ({page}) => {
      const source = await center(tile(page));
      await page.mouse.move(source.x, source.y); await page.mouse.down();
      await page.waitForTimeout(HOLD_MS);
      await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
      const destination = await center(await targetFor(page, 'd12', 'left'));
      await page.mouse.move(destination.x, destination.y, {steps: 8});
      await page.mouse.up();
      await expectMove(page, 1);
      await page.waitForTimeout(100);
      assert.equal((await state(page)).move, 1);
      assert.deepEqual((await state(page)).data.chain.map(t => [t.a, t.b]), [[2, 1], [1, 1]]);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
    });

    await check('Dropping outside a legal target cancels without changing the game', {}, async ({page}) => {
      const before = await state(page), source = await center(tile(page));
      await page.mouse.move(source.x, source.y); await page.mouse.down();
      await page.waitForTimeout(HOLD_MS);
      await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
      const outside = await center(page.locator('.table-title'));
      await page.mouse.move(outside.x, outside.y, {steps: 8}); await page.mouse.up();
      await page.waitForTimeout(80);
      assert.deepEqual(await state(page), before);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
    });

    await check('Escape cancels an active drag and leaves the selected placement usable', {}, async ({page}) => {
      const before = await state(page), source = await center(tile(page));
      await page.mouse.move(source.x, source.y); await page.mouse.down();
      await page.waitForTimeout(HOLD_MS);
      await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
      await page.keyboard.press('Escape'); await page.mouse.up();
      assert.deepEqual(await state(page), before);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      if (!await targets(page).count()) await tile(page).click();
      await (await targetFor(page)).click();
      await expectMove(page, 1);
    });

    await check('Native touch hold and drop reaches a legal board target once', {mobile: true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page);
      await touchDrag(page, cdp);
      await expectMove(page, 1);
      await page.waitForTimeout(100);
      assert.equal((await state(page)).move, 1);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      assert.deepEqual((await state(page)).data.chain.map(t => [t.a, t.b]), [[1, 1], [1, 2]]);
    });

    await check('Horizontal touch swipe scrolls a long hand without selecting or playing', {mobile: true, longHand: true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page), track = page.locator('.hand-track');
      assert(await track.evaluate(el => el.scrollWidth > el.clientWidth + 100));
      const source = await track.evaluate(el => {
        const box = el.getBoundingClientRect();
        const item = [...el.querySelectorAll('[data-drag-piece]')].map(e => e.getBoundingClientRect())
          .find(r => r.left + r.width / 2 > box.left + box.width * 0.6 && r.right < box.right);
        if (!item) throw Error('No visible draggable tile for horizontal swipe');
        return {x: item.left + item.width / 2, y: item.top + item.height / 2};
      });
      await touch(cdp, 'touchStart', source);
      for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', {x: source.x - step * 42, y: source.y});
      await touch(cdp, 'touchEnd');
      await page.waitForFunction(() => document.querySelector('.hand-track').scrollLeft > 20);
      assert.equal((await state(page)).move, 0);
      assert.equal(await page.locator('.domino-drop-target').count(), 0);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
    });

    await check('Two-row landscape domino hand scrolls its outer player panel from every surface', {mobile:true}, async ({page,context})=>{
      await page.setViewportSize({width:740,height:320});
      const panel=page.locator('.layout-self'),cdp=await context.newCDPSession(page),before=await state(page);
      assert(await panel.evaluate(el=>el.scrollHeight>el.clientHeight+30),'real player panel must overflow');
      assert(await page.locator('.hand-track').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'overflow belongs to outer panel');
      for(const mode of ['playable','unavailable','gap','panel']){
        await panel.evaluate(el=>el.scrollTop=0);
        const p=await page.evaluate(mode=>{
          const panel=document.querySelector('.layout-self'),track=panel.querySelector('.hand-track'),tile=track.querySelector('button'),r=tile.getBoundingClientRect(),b=panel.getBoundingClientRect();
          if(mode==='unavailable'){tile.disabled=true;tile.setAttribute('aria-disabled','true');}
          return mode==='panel'?{x:b.right-7,y:b.top+80}:mode==='gap'?{x:r.right+2,y:r.top+25}:{x:r.left+r.width/2,y:r.top+25};
        },mode);
        await touch(cdp,'touchStart',p);for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:p.x,y:p.y-n*18});await touch(cdp,'touchEnd');
        assert(await panel.evaluate(el=>el.scrollTop)>30,mode+' must scroll outer panel');
        assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.deepEqual(await state(page),before);
        await page.locator('.hand-track button').first().evaluate(el=>{el.disabled=false;el.removeAttribute('aria-disabled');});
      }
      const p=await panel.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.right-7,y:r.bottom-20};});
      for(let i=0;i<4;i++){await touch(cdp,'touchStart',p);await touch(cdp,'touchMove',{x:p.x,y:p.y-90});await touch(cdp,'touchEnd');}
      const bottom=await panel.evaluate(el=>el.scrollTop);assert(await panel.evaluate(el=>el.scrollTop>=el.scrollHeight-el.clientHeight-1),'last panel content is reachable by touch');
      const card=await page.locator('.layout-self .self-player').boundingBox(),area=await panel.boundingBox();assert(card.y+card.height<=area.y+area.height+1,'player card is reachable');
      if(process.env.PLAYROOM_CAPTURE_DIR){require('node:fs').mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'domino-panel-scrolled.png')});}
      await touch(cdp,'touchStart',{x:p.x,y:p.y-90});await touch(cdp,'touchMove',p);await touch(cdp,'touchEnd');
      assert(await panel.evaluate(el=>el.scrollTop)<bottom-50,'reverse gesture scrolls back');assert.deepEqual(await state(page),before);
    });

    await check('Fresh native tap immediately after a drop selects and plays the next player tile', {mobile: true,autoPass:true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page);
      await touchDrag(page, cdp);
      await expectMove(page, 1);
      const nextTile = page.locator('.hand-track [data-drag-piece]').first();
      const nextId = await nextTile.getAttribute('data-drag-piece'), started = Date.now();
      await tap(cdp, nextTile);
      assert(Date.now() - started < 400, 'Fresh native tap must occur inside the old click-suppression window');
      await targets(page, nextId).first().waitFor({state: 'visible'});
      assert.equal((await state(page)).move, 1, 'Selecting the next tile must not place it');
      await tap(cdp, targets(page, nextId).first());
      await expectMove(page, 2);
    });
  } finally { await browser.close(); }
});
