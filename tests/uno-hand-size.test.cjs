'use strict';
const TestUI=require('./browser-origin.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');

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
  const server=process.env.PLAYROOM_URL?.startsWith('http')?null:await TestUI.serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser = await chromium.launch({headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking']});
  async function open(viewport, count, fn) {
    const mobile = viewport.width < 500, context = await browser.newContext({viewport, hasTouch: mobile, isMobile: mobile, reducedMotion: 'no-preference'});
    const saved = fixture(count);
    await context.addInitScript(saved => {localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'uno-hand-size-owner',name:'Аня',createdAt:1,updatedAt:1})); localStorage.setItem('playroom.settings.v1', JSON.stringify({animationSpeed: 'normal', sound: false, handShape: 'straight',tutorialsEnabled:false})); localStorage.setItem('playroom.session.v1', JSON.stringify(saved));}, saved);
    const network=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(4500); page.on('pageerror', e => errors.push(e.message));
    try {
      await page.goto(server?.url||process.env.PLAYROOM_URL); await TestUI.resumeSaved(page); await page.locator('.hand-track').waitFor({state: 'visible'});
      await page.waitForFunction(() => ['.table-shell>.scene','.app-game-layout'].every(selector=>document.querySelector(selector)?.getAttribute('aria-busy')!=='true'));
      // Entering the table may put the old menu pointer over a card. Hover
      // spreads its neighbours for 150 ms; measure the resting hand only
      // after leaving it. Exercise this explicitly instead of relying on CI speed.
      if(!mobile&&count>1)await page.locator('.hand-track .hand-card').first().hover({position:{x:5,y:20}});
      await page.mouse.move(0,0);
      await page.waitForFunction(()=>[...document.querySelectorAll('.hand-track .hand-card')].every(card=>{const transform=getComputedStyle(card).transform;return transform==='none'||transform==='matrix(1, 0, 0, 1, 0, 0)';}));
      await fn({page, context, saved}); assert.deepEqual(errors, []);assert.equal(network.nativeSupabaseRequests,0);
    } finally {await context.close();}
  }
  const scenario=process.env.PLAYROOM_SCENARIO&&new RegExp(process.env.PLAYROOM_SCENARIO);let matched=0;
  const check=async(name,run)=>{if(scenario&&!scenario.test(name))return;matched++;await t.test(name,run);};
  try {
    for (const viewport of [{width: 1226, height: 825}, {width: 1280, height: 900}, {width: 320, height: 640}, {width: 390, height: 740}]) {
      await check(`Real draw 7 → 8 stays stable throughout animation at ${viewport.width}×${viewport.height}`, async () => {
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
          await page.waitForFunction(() => PlayroomAppBridge.saveLibrary.current().session.current.move === 1);
          await page.waitForFunction(() => ['.table-shell>.scene','.app-game-layout'].every(selector=>document.querySelector(selector)?.getAttribute('aria-busy')!=='true'));
          const frames = await page.evaluate(() => {window.stopHandSizeFrames = true; return window.handSizeFrames;});
          const after = await geometry(page); assert.equal(after.cards, 8); assert.equal(after.rows, 1);
          stable(before, after, 'settled draw'); assert(frames.length >= 4, 'record several animation frames');
          frames.forEach((frame, i) => stable(before, frame, `frame ${i}`));
          const corners = await page.locator('.own-hand [data-card-index=top] text').evaluateAll(els => els.map(el => {
            el.closest('.uno-card').scrollIntoView({block:'nearest',inline:'nearest'});
            const r = el.getBoundingClientRect(), own = el.closest('.uno-card'); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.uno-card') === own;
          }));
          assert.equal(corners.length,8,'all eight printed values are measured');assert(corners.every(Boolean), 'all eight values remain readable and reachable inside the hand');
          stable(before, await geometry(page), 'inspect eight card values');
          if (process.env.PLAYROOM_CAPTURE_DIR && [1226, 390].includes(viewport.width)) {
            await page.screenshot({path: path.join(process.env.PLAYROOM_CAPTURE_DIR, `playroom-v0.5-uno-${viewport.width < 500 ? 'phone' : 'desktop'}-eight.png`)});
          }
        });
      });
    }
    for (const viewport of [{width: 1226, height: 825}, {width: 1280, height: 900}, {width: 320, height: 640}, {width: 390, height: 740}]) {
      await check(`One stable row from 1 to 35 cards at ${viewport.width}×${viewport.height}`, async () => {
        let base;
        for (const count of [1, 7, 8, 12, 35]) await open(viewport, count, async ({page}) => {
          // A different fallback face stresses glyph metrics inside the authored SVG plane.
          // Preserve its printing scale while checking every exposed value.
          if(count===8&&viewport.width===320)await page.evaluate(()=>{for(const text of document.querySelectorAll('.own-hand [data-card-index=top] text'))text.style.setProperty('font-family','serif','important');PlayroomGameScreen.layoutScene(document.querySelector('#app'));});
          const current = await geometry(page); assert.equal(current.rows, 1); assert.equal(current.cards, count);
          if (!base) base = current; stable(base, current, `${count} cards`);
          if (count === 35) assert(current.handX > 1, 'very long hands scroll inside their fixed region');
          if (count <= 7) assert(current.handX <= 1, `initial hand fits available width: ${count} cards, overflow ${current.handX}`);
          if(count===8){
            const labels=page.locator('.own-hand [data-card-index=top] text');assert.equal(await labels.count(),8);
            const hidden=await labels.evaluateAll(els=>els.flatMap(el=>{
              const card=el.closest('.uno-card');card.scrollIntoView({block:'nearest',inline:'nearest'});
              const r=el.getBoundingClientRect();return [[.1,.1],[.9,.1],[.1,.9],[.9,.9],[.5,.5]].flatMap(([x,y])=>{
                const hit=document.elementFromPoint(r.x+r.width*x,r.y+r.height*y);
                return hit?.closest('.uno-card')===card?[]:[{label:el.textContent,x,y,hit:hit?.className,own:card.dataset.entity,other:hit?.closest('.uno-card')?.dataset.entity,rect:[r.x,r.y,r.width,r.height],cardLeft:card.getBoundingClientRect().left,peek:getComputedStyle(card.closest('.hand-track')).getPropertyValue('--fan-peek')}];
              });
            }));
            if(hidden.length&&process.env.PLAYROOM_CAPTURE_DIR){const out=process.env.PLAYROOM_CAPTURE_DIR;require('node:fs').mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'uno-index-'+viewport.width+'.png')});const cards=await page.locator('.own-hand .uno-card').evaluateAll(cards=>cards.map(card=>{const label=card.querySelector('[data-card-index=top] text'),r=card.getBoundingClientRect(),g=label.getBoundingClientRect(),m=label.getScreenCTM();return {id:card.dataset.entity,label:label.textContent,card:r.toJSON(),glyph:g.toJSON(),fontPx:parseFloat(getComputedStyle(label).fontSize)*Math.hypot(m.c,m.d),peek:getComputedStyle(card.closest('.hand-track')).getPropertyValue('--fan-peek'),stacking:JSON.parse(card.querySelector('[data-card-stacking]').dataset.cardStacking)};}));require('node:fs').writeFileSync(path.join(out,'uno-index-'+viewport.width+'.json'),JSON.stringify({hidden,cards},null,2));}
            assert.deepEqual(hidden,[],'every printed label stays uncovered and reachable');stable(base,await geometry(page),'inspect eight card values');
          }
        });
      });
    }
    await check('A long hand scrolls by native horizontal touch without playing or moving the field', async () => {
      await open({width: 390, height: 740}, 35, async ({page, context, saved}) => {
        const before = await geometry(page), cdp = await context.newCDPSession(page);
        const p = await page.locator('.hand-track').evaluate(el => {const r = el.getBoundingClientRect(); return {x: r.right - 45, y: r.top + r.height / 2};});
        await touch(cdp, 'touchStart', p);
        for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', {x: p.x - step * 32, y: p.y});
        await touch(cdp, 'touchEnd'); await page.waitForFunction(() => document.querySelector('.hand-track').scrollLeft > 30);
        stable(before, await geometry(page), 'horizontal touch');
        assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
        const after = await page.evaluate(() => PlayroomAppBridge.saveLibrary.current().session.current);
        assert.equal(after.move, 0); assert.deepEqual(after.data.hands, saved.states[0].data.hands);
        const cards = page.locator('.own-hand .uno-card');
        for (let i = 0; i < await cards.count(); i++) {
          await cards.nth(i).scrollIntoViewIfNeeded();
          assert(await cards.nth(i).evaluate(el => {const r = el.querySelector('[data-card-index=top] text').getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.uno-card') === el;}), `card ${i} remains reachable`);
        }
        stable(before, await geometry(page), 'all cards inspected');
      });
    });
    assert(matched>0,'PLAYROOM_SCENARIO matched no scenarios: '+process.env.PLAYROOM_SCENARIO);
  } finally {await browser.close();await server?.close();}
});
