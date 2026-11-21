'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/domino/rules.js');
const shots = process.env.DOMINO_SCREENSHOTS || '/tmp/playroom-qa/domino-compact';
const chainSelector = '[data-chain-flow]', handSelector = '.layout-hand .hand-track';
const handTile = (page,id) => page.locator(`${handSelector} [data-entity="tile-${id}"]`);
const endpoint = (page,side) => page.locator(`${chainSelector} [data-key="end-${side}"]`);
const expectedMove = (saved,id,side) => {
  const state=saved.states[0], command=Core.legalActions(state,0).find(a=>a.card===id&&a.side===side);
  assert(command,`fixture must offer ${id} on ${side}`);
  return Core.applyAction(state,0,command);
};

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
async function state(page) { return page.evaluate(() => PlayroomAppBridge.saveLibrary.current().session.current); }
async function ready(page, move) {
  await page.waitForFunction(move => PlayroomAppBridge.saveLibrary.current().session.current.move === move, move);
  await page.waitForFunction(() => document.querySelector('.scene').getAttribute('aria-busy') !== 'true');
}
async function touch(cdp, type, point) { await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: type === 'touchEnd' ? [] : [{...point, radiusX: 4, radiusY: 4, force: 1}]}); }
async function geometry(page, {fullScene = false, count = 7} = {}) {
  const result = await page.evaluate(({fullScene, count, chainSelector, handSelector}) => {
    const errors = [], chain = document.querySelector(chainSelector), scene = document.querySelector('.scene'), track = document.querySelector(handSelector);
    const r = el => el.getBoundingClientRect(), contains = (a, b) => b.left >= a.left - 1 && b.right <= a.right + 1 && b.top >= a.top - 1 && b.bottom <= a.bottom + 1;
    const within = (el, area, label) => {if (!contains(r(area), r(el))) errors.push(label);};
    if (document.documentElement.scrollWidth > innerWidth + 1) errors.push('page horizontal overflow');
    if (scene.scrollWidth > scene.clientWidth + 1) errors.push('scene horizontal overflow');
    const field=document.querySelector('.layout-field');if(!contains(r(scene),r(field)))errors.push('field outside scene');
    if (fullScene && scene.scrollHeight > scene.clientHeight + 1) errors.push(`scene vertical scroll ${scene.scrollHeight}/${scene.clientHeight}`);
    const tiles = [...chain.querySelectorAll('.sdk-chain-tile[data-entity]')];
    if (tiles.length !== count) errors.push(`chain count ${tiles.length}/${count}`);
    for (const tile of tiles) {
      const b=r(tile);if(Math.abs(b.width/b.height-(tile.classList.contains('is-double')?4/7:7/4))>.03)errors.push('tile aspect changed');
      for (const half of tile.querySelectorAll('[data-domino-half]')) if(half.childElementCount)within(half, tile, 'half outside tile');
      if (r(tile).width < 25 || r(tile).height < 25) errors.push('unreadably small tile');

    }
    for (const end of chain.querySelectorAll('.sdk-chain-drop')) {
      const button=r(end),frame=r(field),label=r(end.parentElement.querySelector('.sdk-chain-edge'));
      if (button.width < 44 || button.height < 44) errors.push('end target below 44px');
      if (button.top >= frame.top - 1 && button.top < frame.bottom && label.top < frame.top - 1) errors.push('end label clipped above the field');
    }
    if (count <= 14) {
      if (track.querySelectorAll('.domino-tile').length !== 7) errors.push('fixture missing seven hand tiles');
      if(track.scrollWidth>track.clientWidth+1)errors.push('seven starting tiles require horizontal scroll');
      for (const tile of track.querySelectorAll('.domino-tile')) {

        for (const half of tile.querySelectorAll('[data-domino-half]')) if(half.childElementCount)within(half, tile, 'hand half clipped');

      }
    }
    return errors;
  }, {fullScene, count, chainSelector, handSelector});
  const layout=result.length?await page.evaluate(()=>{
    const scene=document.querySelector('.scene');
    return {tiles:[...document.querySelectorAll('.sdk-chain-tile,.sdk-chain-drop')].map(e=>({entity:e.dataset.entity,rect:e.getBoundingClientRect().toJSON()})),scene:scene.clientHeight};
  }):null;
  assert.deepEqual(result, [],JSON.stringify(layout));
}

test('Domino snake field keeps the complete chain, real endpoints and seven hand tiles readable on phones', {timeout: 120000}, async t => {
  const server=await require('./browser-origin.cjs').serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser = await chromium.launch({headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, options, run) {
    await t.test(name,{skip:options.nativeTouch&&browser.browserType().name()!=='chromium'}, async () => {
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
      await context.addInitScript(saved => {localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'domino-layout-owner',name:'Проверка',createdAt:1,updatedAt:1})); localStorage.setItem('playroom.settings.v1', JSON.stringify({animationSpeed:'instant',sound:false,quickPlay:false,autoPass:false,showLastGame:true,tutorialsEnabled:false})); localStorage.setItem('playroom.session.v1', JSON.stringify(saved));}, saved);
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(5000); page.on('pageerror', e => errors.push(e.message));
      try {
        await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));const targetUrl=process.env.PLAYROOM_URL||server.url;
        if(process.env.PLAYROOM_DOMINO_ARTIFACT){const body=fs.readFileSync(process.env.PLAYROOM_DOMINO_ARTIFACT),hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');await page.route('**/*',route=>route.abort());await page.route(targetUrl,route=>route.fulfill({status:200,contentType:'text/html',body}));const response=await page.goto(targetUrl);assert.equal(hash(await response.body()),hash(body));fs.mkdirSync(shots,{recursive:true});fs.writeFileSync(path.join(shots,'artifact.json'),JSON.stringify({sha256:hash(body),engine:browser.browserType().name(),version:browser.version()},null,2));}else await page.goto(targetUrl);
        await page.locator('[data-hub-page=sessions]:visible').click();if(saved.states[0].status==='finished')await page.locator('[data-saved-status=history]:visible').click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator(saved.states[0].status==='finished'?'[data-history-id]:visible':'[data-resume-id]:visible').first().click();await page.locator(chainSelector).waitFor({state:'visible'});
        await run({page, context, saved}); assert.deepEqual(errors, []);
      } finally { await context.close(); }
    });
  }
  try {
    for (const viewport of [{width: 320, height: 640}, {width: 390, height: 740}]) for (const length of [3, 7]) {
      await check(`${length} tiles and both endpoints preserve proportions and touch endpoints at ${viewport.width}×${viewport.height}`, {viewport, length}, async ({page, saved}) => {
        await handTile(page,'d14').tap();
        assert.equal(await page.locator('.sdk-chain-end-slot').count(), 2);
        assert.equal(await page.locator('.sdk-chain-drop:not([disabled])').count(), Core.legalActions(saved.states[0], 0).filter(a => a.card === 'd14').length);
        await geometry(page, {fullScene: true, count: length});
        if (length === 7) { fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: path.join(shots, `domino-7-${viewport.width}.png`)}); }
      });
    }
    for (const length of [14, 21, 28]) {
      await check(`${length} tiles keep proportions inside the application field`, {length, viewport: {width: 320, height: 640}}, async ({page}) => {
        await geometry(page, {count: length});
        const rows = await page.locator(chainSelector).evaluate(el => new Set([...el.querySelectorAll('.sdk-chain-node')].map(n => n.dataset.flowRow)).size);
        const placedRows=Number(await page.locator(chainSelector).getAttribute('data-chain-rows'));
        assert.equal(rows,placedRows,'all rows of the centered opening remain in the chain');
        assert(rows>=Math.ceil((length+2)/5)&&rows<=Math.ceil((length+2)/5)+1);
        fs.mkdirSync(shots, {recursive: true}); await page.screenshot({path: path.join(shots, `domino-${length}-320.png`)});
      });
    }
    await check('A folded row reverses visible halves; clicking its real end preserves canonical orientation', {}, async ({page, saved}) => {
      await handTile(page,'d14').tap();
      const target = endpoint(page,'right').locator('.sdk-chain-drop:not([disabled])');
      const flow = await target.evaluate(el => {const node = el.closest('.sdk-chain-node'), halves = [...el.querySelectorAll('[data-domino-half]')].map(h => h.getBoundingClientRect().x); return {row: Number(node.dataset.flowRow), halves};});
      assert.equal(flow.row, 1); assert(flow.halves[0] > flow.halves[1], 'entry half is on the right of the reversed row');
      const expected = expectedMove(saved,'d14','right');
      await target.tap(); await ready(page, 1); assert.deepEqual((await state(page)).data.chain, expected.data.chain);
    });
    await check('A double preview and placed double remain perpendicular on a reversed row', {double:true}, async ({page}) => {
      await handTile(page,'d55').tap();
      const target=endpoint(page,'right').locator('.sdk-chain-drop:not([disabled])'),preview=target.locator('.sdk-chain-preview.is-double');
      const before=await preview.boundingBox(); assert(before.height>before.width);
      assert.equal(await target.getAttribute('data-preview-a'),'5'); assert.equal(await target.getAttribute('data-preview-b'),'5');
      await target.tap(); await ready(page,1);
      const placed=await page.locator(`${chainSelector} [data-entity="tile-d55"]`).boundingBox(); assert(placed.height>placed.width);
      assert.deepEqual((await state(page)).data.chain.at(-1),{id:'d55',a:5,b:5});
    });
    for (const side of ['left', 'right']) {
      await check(`Native touch drag reaches the ${side} physical endpoint on a 320px folded board`, {viewport: {width: 320, height: 640},nativeTouch:true}, async ({page, context, saved}) => {
        const cdp = await context.newCDPSession(page);
        // Pan the intrinsic field to the endpoint before dragging from the hand.
        await endpoint(page,side).scrollIntoViewIfNeeded();
        const from = await center(handTile(page,'d14'));
        await touch(cdp, 'touchStart', from); await page.waitForTimeout(280);await touch(cdp,'touchMove',{x:from.x,y:from.y-14}); await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
        const target = endpoint(page,side).locator('.sdk-chain-drop:not([disabled])'), to = await center(target);
        for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', {x: from.x + (to.x - from.x) * step / 5, y: from.y + (to.y - from.y) * step / 5});
        await touch(cdp, 'touchEnd'); await ready(page, 1);
        assert.deepEqual((await state(page)).data.chain, expectedMove(saved,'d14',side).data.chain);
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      });
    }
  } finally { await browser.close();await server.close(); }
});
