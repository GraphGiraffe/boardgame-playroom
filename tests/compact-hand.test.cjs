'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');
require('../packs/durak/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const root=path.resolve(__dirname,'..');

function fixture(long = false) {
  const saved = new Session(Core, 'uno', {seed: 17, mode: 'pass', preset: 'classic', openHands: true, unoMode: 'manual',
    players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const s = saved.states[0], d = s.data, cards = new Map([...d.hands.flat(), ...d.drawPile, ...d.discard].map(c => [c.id, c]));
  const take = id => {const c = cards.get(id); assert(c); cards.delete(id); return c;};
  d.discard = [take('u9')]; d.color = 'red'; d.direction = 1; d.drawn = null; d.noDraw = false; d.stalled = 0;
  d.hands = [['u1', 'u26', 'u100', 'u3', 'u27', 'u4', 'u2'].map(take), ['u5', 'u76', 'u30', 'u50', 'u60', 'u81', 'u52'].map(take)];
  d.drawPile = [...cards.values()]; if (long) d.hands[0].push(...d.drawPile.splice(0, (Number.isInteger(long)?long:35)-7));
  s.turn = 0; Core.validateState(s); return saved;
}
function durakFixture(count = 6, defending = false) {
  const saved = new Session(Core, 'durak', {seed: 17, mode: 'pass', preset: 'classic', openHands: true,
    players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const s = saved.states[0], d = s.data, cards = new Map([...d.hands.flat(), ...d.drawPile].map(c => [c.id, c]));
  const take = id => {const c = cards.get(id); assert(c, id); cards.delete(id); return c;};
  const trump = take('♣6'); d.trump = {...trump};
  d.table = defending ? ['♠6', '♠7'].map(id => ({attack: take(id), defense: null})) : [];
  const ids = defending ? ['♠14', '♥6', '♦7', '♣8', '♥9', '♦10'] : ['♠6', '♥7', '♦8', '♣9', '♠10', '♥11', '♦12', '♣13'];
  const own = ids.slice(0, count).map(take);
  own.push(...[...cards.values()].slice(0, count - own.length).map(c => take(c.id)));
  d.hands = [own, [...cards.values()].slice(0, 6).map(c => take(c.id))];
  d.drawPile = [trump, ...cards.values()]; d.discard = []; d.taking = false;
  d.attacker = defending ? 1 : 0; d.defender = 1 - d.attacker; d.attackCursor=d.attacker; d.passes=0; d.attackLimit = 6; s.turn = 0;
  Core.validateState(s); Session.restore(Core, saved); return saved;
}
function durakTableFixture(pairCount, ownCount, openHands) {
  const saved = new Session(Core, 'durak', {seed: 17, mode: 'pass', preset: 'classic', openHands,
    players: [{name: 'Аня'}, {name: 'Борис'}]}).export();
  const s = saved.states[0], d = s.data, cards = new Map([...d.hands.flat(), ...d.drawPile].map(c => [c.id, c]));
  const take = id => {const c = cards.get(id); assert(c, `unique Durak card ${id}`); cards.delete(id); return c;};
  const trump = take('♥7'); d.trump = {...trump};
  // Every later attack uses a rank introduced by an earlier attack or defense.
  const pairs = [['♠6','♥9'], ['♣6','♣9'], ['♦6','♦9'], ['♥6','♥10'], ['♠9','♠10'], ['♣10','♣11']].slice(0, pairCount);
  d.table = pairs.map(([attack, defense], i) => ({attack: take(attack), defense: i < pairCount - 1 ? take(defense) : null}));
  const defense = take(pairs.at(-1)[1]);
  d.hands = [[defense, ...[...cards.values()].slice(0, ownCount - 1).map(c => take(c.id))], [...cards.values()].slice(0, 6).map(c => take(c.id))];
  d.drawPile = [trump, ...cards.values()]; d.discard = []; d.taking = false;
  d.attacker = 1; d.defender = 0; d.attackCursor=d.attacker; d.passes=0; d.attackLimit = 6; s.turn = 0;
  Core.validateState(s); Session.restore(Core, saved);
  assert(Core.legalActions(s, 0).some(a => a.type === 'defend' && a.card === defense.id && a.target === pairCount - 1));
  return saved;
}
async function assertDurakTableFit(page, pairCount, openHands, phase, opponentCount = 6) {
  const layout = await page.locator('.durak-scene').evaluate((scene, {pairCount, openHands, opponentCount}) => {
    const issues = [], rect = el => {const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
    const within = (r, p) => r.x >= p.x - 1 && r.y >= p.y - 1 && r.right <= p.right + 1 && r.bottom <= p.bottom + 1;
    const viewport = {x:0,y:0,right:innerWidth,bottom:innerHeight};
    const regions = {};
    for(const selector of ['.scene','.layout-field','.layout-self','.layout-participants']){const el=document.querySelector(selector),r=rect(el);regions[selector]=r;if(!within(r,viewport))issues.push(selector+' outside viewport');}
    if (scene.querySelectorAll('.durak-pair').length !== pairCount) issues.push('missing table pair');
    const table = scene.querySelector('.durak-table');
    for (const el of scene.querySelectorAll('.durak-table .playing-card,.own-hand .playing-card,.public-card .playing-card')) {
      const entity = el.dataset.entity, r = rect(el), tableCard = el.closest('.attack-card,.defense-card'), owner = tableCard || el.closest('.public-card') || el;
      if (!el.closest('.layout-field,.mini-hand') && !within(r,viewport)) issues.push(`${entity} card clipped`);
      const corner = el.querySelector('.card-corner:not(.bottom)'), suit = corner.querySelector('small');
      const range = document.createRange(); range.selectNodeContents(corner.firstChild);
      for (const [name, marker, mr] of [['rank',corner,range.getBoundingClientRect()],['suit',suit,suit.getBoundingClientRect()]]) {
        if (mr.width < 2 || mr.height < 2 || parseFloat(getComputedStyle(marker).fontSize) < 9) issues.push(`${entity} ${name} unreadable`);
        const hit = document.elementFromPoint(mr.x + mr.width / 2, mr.y + mr.height / 2);
        if(within(mr,rect(scene))&&!el.closest('.layout-field,.mini-hand')&&(!hit||!owner.contains(hit)))issues.push(`${entity} ${name} covered`);
      }
    }
    if (scene.querySelectorAll('.public-card').length !== (openHands ? opponentCount : 0)) issues.push('opponent privacy/count changed');
    for (const button of scene.querySelectorAll('.scene-actions button:not(:disabled)')) {
      const r = rect(button), hit = document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      if (r.width < 43 || r.height < 43 || !within(r, viewport) || !button.contains(hit)) issues.push(`${button.textContent.trim()} button inaccessible: ${JSON.stringify({rect:r,hit:hit?.outerHTML.slice(0,180)})}`);
    }
    return {issues,regions};
  }, {pairCount,openHands,opponentCount});
  assert.deepEqual(layout.issues, [], `${phase}: ${JSON.stringify(layout)}`);
}
const card = (page, id) => page.locator(`.own-hand [data-hand-preview="${id}"]`);
async function state(page) {return page.evaluate(() => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current);}
async function exposedPoint(locator) {
  await locator.locator(".card-corner:not(.bottom)").scrollIntoViewIfNeeded();
  return locator.evaluate(el => {
    const r = el.querySelector('.card-corner').getBoundingClientRect();
    const p = {x: r.x + r.width / 2, y: r.y + r.height / 2};
    if (document.elementFromPoint(p.x, p.y)?.closest('[data-hand-preview]') !== el) throw Error(`Corner hidden: ${el.dataset.handPreview}`);
    return p;
  });
}
async function assertFullPreview(page, id) {
  await page.waitForFunction(id => {
    const el = document.querySelector(`.own-hand [data-hand-preview="${id}"]`), r = el.getBoundingClientRect();
    return [[r.left + 8, r.top + 8], [r.right - 8, r.top + 8], [r.left + 8, r.bottom - 8], [r.right - 8, r.bottom - 8], [r.left + r.width / 2, r.top + r.height / 2]]
      .every(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-hand-preview]') === el);
  }, id);
  const inside = await card(page, id).evaluate(el => {const r = el.getBoundingClientRect(), h = el.closest('.hand-track').getBoundingClientRect(); return r.top >= h.top && r.bottom <= h.bottom && r.left >= h.left && r.right <= h.right;});
  assert(inside, 'raised card is not clipped by its hand');
}
async function touch(cdp, type, p) {await cdp.send('Input.dispatchTouchEvent', {type, touchPoints: ['touchEnd', 'touchCancel'].includes(type) ? [] : [{...p, radiusX: 4, radiusY: 4, force: 1}]});}
async function expectMove(page, n) {
  await page.waitForFunction(n => TabletopSession.restore(TabletopCore, JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move === n, n);
  await page.waitForFunction(() => document.querySelector('.scene').getAttribute('aria-busy') !== 'true');
}

test('Compact card hands preserve readable previews and each game’s play controls', {timeout: 120000}, async t => {
  // The 24-card reload must have persistent storage on both navigations.
  const hosted=url.startsWith('file:')?await serveBrowserFixture(root):null;
  const browser = await chromium.launch({headless: true, executablePath: executablePath(), args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, options, run) {
    await t.test(name, async () => {
      const context = await browser.newContext({viewport: options.viewport || {width: 390, height: 740}, isMobile: !!options.touch, hasTouch: !!options.touch, reducedMotion: 'reduce'});
      await context.addInitScript(saved => {if(sessionStorage.getItem('compact-seeded'))return;sessionStorage.setItem('compact-seeded','1');localStorage.clear(); localStorage.setItem('playroom.settings.v1', JSON.stringify({motion: false, sound: false})); localStorage.setItem('playroom.session.v1', JSON.stringify(saved));}, options.saved || fixture(options.long));
      const page = await context.newPage(), errors = []; page.setDefaultTimeout(4500); page.on('pageerror', e => errors.push(e.message));
      try {
        await page.goto(hosted?.url||url); await page.locator('.resume-banner [data-command=resume]').click();
        if (await page.locator('.handoff [data-command=unlock]').count()) await page.locator('.handoff [data-command=unlock]').click();
        await page.locator('.own-hand [data-hand-preview]').first().waitFor({state: 'visible'});
        await run({page, context}); assert.deepEqual(errors, []);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));
      } finally {await context.close();}
    });
  }
  try {
    for (const viewport of [{width: 320, height: 640}, {width: 390, height: 740}, {width: 1280, height: 900}]) {
      await check(`All seven card corners fit without scrolling at ${viewport.width}×${viewport.height}`, {viewport, touch: viewport.width < 500}, async ({page}) => {
        // Resume can leave the desktop pointer over a card in the new screen.
        // Its deliberate hover preview shifts neighbours; measure the resting
        // hand here, and exercise hover/keyboard expansion in its own case below.
        await page.mouse.move(1,1);
        const dimensions = await page.locator('.hand-track').evaluate(el => ({width: el.clientWidth, scroll: el.scrollWidth, count: el.querySelectorAll('[data-hand-preview]').length, rows: el.querySelectorAll('.hand-fan-row').length}));
        assert.equal(dimensions.count, 7); assert.equal(dimensions.rows, 1); assert(dimensions.scroll <= dimensions.width + 1,JSON.stringify(dimensions));
        for (const id of ['u1', 'u26', 'u100', 'u3', 'u27', 'u4', 'u2']) await exposedPoint(card(page, id));
        const scene = await page.locator('.scene').evaluate(el => ({height: el.clientHeight, scroll: el.scrollHeight}));
        assert(scene.scroll <= scene.height + 1, `initial seven-card scene needs no vertical scroll: ${JSON.stringify(scene)}`);
        if (viewport.width === 390 && process.env.PLAYROOM_CAPTURE_DIR) await page.screenshot({path: path.join(process.env.PLAYROOM_CAPTURE_DIR, 'playroom-v0.3-uno-phone.png')});
      });
    }
    for(const count of [9,14]) await check(`Hand with ${count} cards overlaps and keeps scrolling independent of game mode`,
      {long:count,viewport:{width:320,height:640},touch:true},async({page})=>{
        const hand=await page.locator('.own-hand').evaluate(el=>{
          const track=el.querySelector('.hand-track'),cards=[...track.querySelectorAll('.hand-card')];
          const first=cards[0].getBoundingClientRect(),second=cards[1].getBoundingClientRect();
          return {count:cards.length,overlap:first.right-second.left,overflow:track.scrollWidth-track.clientWidth,
            marker:el.classList.contains('hand-overflow-right'),rows:track.querySelectorAll('.hand-fan-row').length};
        });
        assert.equal(hand.count,count);assert.equal(hand.rows,1);
        assert(hand.overlap>=12,`Cards must visibly overlap, got ${JSON.stringify(hand)}`);
        assert(hand.overflow>1&&hand.marker,`Scrolled hands need a visible right boundary: ${JSON.stringify(hand)}`);
      });
    await check('Hover and keyboard focus reveal the whole card, including an unplayable card', {}, async ({page}) => {
      for (const id of ['u1', 'u26']) {
        const p = await exposedPoint(card(page, id)); await page.mouse.move(p.x, p.y); await assertFullPreview(page, id);
        await page.mouse.move(1, 1); await card(page, id).focus(); await assertFullPreview(page, id);
        assert.equal((await state(page)).move, 0);
        await card(page, id).evaluate(el => el.blur());
      }
      assert.equal(await card(page, 'u26').getAttribute('data-drag-piece'), null);
      assert.equal(await card(page, 'u26').isEnabled(), true);
    });
    await check('First click previews only; clicking the discard plays the selected legal card', {}, async ({page}) => {
      {const p=await exposedPoint(card(page,'u1'));await page.mouse.click(p.x,p.y);} assert.equal((await state(page)).move, 0); await assertFullPreview(page, 'u1');
      assert.equal(await card(page, 'u1').getAttribute('aria-pressed'), 'true');
      if (process.env.PLAYROOM_CAPTURE_DIR) await page.screenshot({path: path.join(process.env.PLAYROOM_CAPTURE_DIR, 'playroom-v0.3-uno-phone-selected.png')});
      await page.locator('.uno-drop-target[data-drop-piece="u1"][data-action]').click(); await expectMove(page, 1);
      assert.equal((await state(page)).data.discard.at(-1).id, 'u1');
      const scene = await page.locator('.scene').evaluate(el => ({height: el.clientHeight, scroll: el.scrollHeight}));
      assert(scene.scroll <= scene.height + 1, `pass-device state stays within the viewport: ${JSON.stringify(scene)}`);
    });
    await check('Selecting an unplayable card reveals it without creating a target or move', {}, async ({page}) => {
      {const p=await exposedPoint(card(page,'u26'));await page.mouse.click(p.x,p.y);} await assertFullPreview(page, 'u26');
      assert.equal(await card(page, 'u26').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('.uno-drop-target').count(), 0); assert.equal((await state(page)).move, 0);
    });
    await check('Touch down previews immediately and touch release selects without playing', {touch: true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page), p = await exposedPoint(card(page, 'u26'));
      await touch(cdp, 'touchStart', p);
      assert.match(await card(page, 'u26').getAttribute('class'), /is-hand-preview/); await assertFullPreview(page, 'u26');
      assert.equal((await state(page)).move, 0);
      await touch(cdp, 'touchEnd');
      await page.waitForFunction(() => document.querySelector('.own-hand [data-hand-preview="u26"]')?.getAttribute('aria-pressed') === 'true');
      assert.equal((await state(page)).move, 0); assert.equal(await page.locator('.uno-drop-target').count(), 0);
    });
    await check('Legal card still drags from its exposed corner to discard', {touch: true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page), p = await exposedPoint(card(page, 'u1'));
      await touch(cdp, 'touchStart', p); await page.waitForTimeout(260);
      await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
      const r = await page.locator('.uno-drop-target[data-drop-piece="u1"]').boundingBox(), q = {x: r.x + r.width / 2, y: r.y + r.height / 2};
      for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', {x: p.x + (q.x - p.x) * step / 4, y: p.y + (q.y - p.y) * step / 4});
      await touch(cdp, 'touchEnd'); await expectMove(page, 1); assert.equal((await state(page)).data.discard.at(-1).id, 'u1');
    });
    await check('Large hands keep one fixed-height row and reveal every card through horizontal scrolling', {long: true, viewport: {width: 320, height: 640}}, async ({page}) => {
      const track=page.locator('.hand-track'),info = await track.evaluate(el => ({count: el.querySelectorAll('[data-hand-preview]').length, rows: el.querySelectorAll('.hand-fan-row').length, x: el.scrollWidth - el.clientWidth, y:el.scrollHeight-el.clientHeight,overflow: getComputedStyle(el).overflowX}));
      assert.equal(info.count, 35); assert.equal(info.rows, 1); assert(info.x > 1); assert(info.y <= 1); assert.equal(info.overflow, 'auto');
      assert(await track.evaluate(el=>{
        const peek=parseFloat(getComputedStyle(el).getPropertyValue('--fan-peek'));
        const width=parseFloat(getComputedStyle(el).getPropertyValue('--fan-card-width'));
        return el.classList.contains('is-long-hand')&&peek>=20&&peek<=width-12;
      }),'Long hands must retain overlapping cards with reachable rank corners');
      assert.equal(await page.locator('.own-hand.hand-overflow-right').count(),1,'A clipped hand needs a right-edge scroll marker');
      const ids = await track.locator('[data-hand-preview]').evaluateAll(els => els.map(el => el.dataset.handPreview));
      // A fanned row overlaps card bodies, and scrollIntoView may decide a
      // partly covered card is already visible. Pan the *actual* horizontal
      // hand track to the rank corner, as a player would, before testing it.
      // Keep the hit-test requirement: every card must really be reachable.
      const reveal=async id=>{
        const result=await card(page,id).evaluate(async el=>{
          const track=el.closest('.hand-track'),corner=el.querySelector('.card-corner');
          const r=corner.getBoundingClientRect(),v=track.getBoundingClientRect();
          track.scrollLeft+=r.left+r.width/2-(v.left+v.width/2);
          await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
          const final=corner.getBoundingClientRect(),view=track.getBoundingClientRect();
          const x=final.left+final.width/2,y=final.top+final.height/2;
          const hit=document.elementFromPoint(x,y)?.closest('[data-hand-preview]')?.dataset.handPreview||null;
          return {id:el.dataset.handPreview,hit,x,y,trackLeft:view.left,trackRight:view.right,
            scrollLeft:track.scrollLeft,scrollMax:track.scrollWidth-track.clientWidth};
        });
        assert.equal(result.hit,id,'Card rank corner inaccessible after hand pan: '+JSON.stringify(result));
        assert(result.x>=result.trackLeft&&result.x<result.trackRight,'Rank corner outside scroller: '+JSON.stringify(result));
      };
      for(const id of ids){
        await reveal(id);await exposedPoint(card(page,id));
      }
      assert.equal(await page.locator('.own-hand.hand-overflow-left').count(),1,'After scrolling, a left edge signals earlier cards');
      await track.evaluate(el=>{el.scrollLeft=0;});
      await page.waitForFunction(()=>document.querySelector('.own-hand')?.classList.contains('hand-overflow-right')&&!document.querySelector('.own-hand')?.classList.contains('hand-overflow-left'));
      for(const id of [ids[0],ids[17],ids.at(-1)]){
        await reveal(id);const p=await exposedPoint(card(page,id));
        await page.mouse.move(p.x,p.y);await assertFullPreview(page,id);await page.mouse.move(1,1);
      }
      assert.equal((await state(page)).move, 0);
    });
    for (const viewport of [{width: 320, height: 640}, {width: 390, height: 740}, {width: 1280, height: 900}]) for (const count of [6, 8]) {
      await check(`Durak ${count} rank-and-suit corners fit at ${viewport.width}×${viewport.height}`, {saved: durakFixture(count), viewport, touch: viewport.width < 500}, async ({page}) => {
        // Larger fallback font metrics must keep the double-digit rank reachable.
        if(count===8&&viewport.width===390)await page.evaluate(()=>{for(const corner of document.querySelectorAll('.own-hand .card-corner'))corner.style.setProperty('font-size','17px','important');PlayroomGameScreen.layoutScene(document.querySelector('#app'));});
        const layout = await page.locator('.hand-track').evaluate(el => {
          const cards = [...el.querySelectorAll('[data-hand-preview]')], hidden = [];
          for (const card of cards) {
            card.scrollIntoView({block:'nearest',inline:'nearest'});
            const corner = card.querySelector('.card-corner:not(.bottom)'), suit = corner.querySelector('small');
            for (const marker of [corner, suit]) {
              const r = marker.getBoundingClientRect(), style = getComputedStyle(marker);
              if (r.width < 2 || r.height < 2 || style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.fontSize) < 9) hidden.push(card.dataset.handPreview + ': unreadable value');
              for (const [x, y] of [[r.left+1,r.top+1],[r.right-1,r.top+1],[r.left+1,r.bottom-1],[r.right-1,r.bottom-1],[(r.left+r.right)/2,(r.top+r.bottom)/2]]) {
                if (document.elementFromPoint(x,y)?.closest('[data-hand-preview]') !== card) hidden.push(card.dataset.handPreview + ': covered value');
              }
            }
          }
          return {count: cards.length, rows: el.querySelectorAll('.hand-fan-row').length, x: el.scrollWidth-el.clientWidth, y: el.scrollHeight-el.clientHeight, hidden};
        });
        assert.equal(layout.count, count); assert.equal(layout.rows, 1); assert(layout.y <= 1, JSON.stringify(layout)); if(count===6)assert(layout.x<=1, JSON.stringify(layout)); assert.deepEqual(layout.hidden, []);
        if (viewport.width === 390 && process.env.PLAYROOM_CAPTURE_DIR) await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR, `playroom-v0.10-durak-${count === 6 ? 'six' : 'eight'}.png`)});
      });
    }
    await check('Durak hover and touch-down preview reveal a full card without playing', {saved: durakFixture(6, true), touch: true}, async ({page, context}) => {
      const id = '♥6', p = await exposedPoint(card(page,id));
      await page.mouse.move(p.x,p.y); await assertFullPreview(page,id); await page.mouse.move(1,1);
      const cdp = await context.newCDPSession(page), q = await exposedPoint(card(page,id));
      await touch(cdp,'touchStart',q); await assertFullPreview(page,id);
      assert.match(await card(page,id).getAttribute('class'), /is-hand-preview/); assert.equal((await state(page)).move,0);
      await touch(cdp,'touchCancel'); assert.equal((await state(page)).move,0);
    });
    await check('A legal Durak click commits once without adding an UNO-style confirmation', {saved: durakFixture()}, async ({page}) => {
      const p = await exposedPoint(card(page,'♠6'));
      await page.mouse.click(p.x,p.y,{clickCount:2}); await expectMove(page,1);
      const s = await state(page); assert.equal(s.data.table.length,1); assert.equal(s.data.table[0].attack.id,'♠6');
      assert.equal(s.events.filter(e=>e.type==='durak.attacked').length,1);
    });
    await check('An upward Durak touch swipe commits the chosen legal card once', {saved: durakFixture(), touch:true}, async ({page,context}) => {
      const cdp = await context.newCDPSession(page), p = await exposedPoint(card(page,'♠6'));
      await touch(cdp,'touchStart',p); await touch(cdp,'touchMove',{x:p.x,y:p.y-60}); await touch(cdp,'touchEnd'); await expectMove(page,1);
      const s = await state(page); assert.equal(s.data.table.length,1); assert.equal(s.data.table[0].attack.id,'♠6');
      assert.equal(s.events.filter(e=>e.type==='durak.attacked').length,1);
    });
    await check('A Durak card that can defend two attacks still requires an explicit target', {saved: durakFixture(6,true), touch:true}, async ({page}) => {
      assert.equal(await card(page,'♠14').getAttribute('data-action'),null);
      const p = await exposedPoint(card(page,'♠14')); await page.touchscreen.tap(p.x,p.y);
      assert.equal((await state(page)).move,0); assert.equal(await page.locator('.defend-target').count(),2);
      await page.locator('.defend-target').nth(1).tap(); await expectMove(page,1);
      const s = await state(page); assert.equal(s.data.table[0].defense,null); assert.equal(s.data.table[1].defense.id,'♠14');
    });
    await check('Durak growth from six to 24 cards keeps hand height and horizontal swipes never play', {saved: durakFixture(), viewport:{width:320,height:640},touch:true}, async ({page,context}) => {
      const before = await page.locator('.hand-track').boundingBox();
      await page.evaluate(saved=>localStorage.setItem('playroom.session.v1',JSON.stringify(saved)),durakFixture(24));
      await page.reload();
      // Reopen the saved session through the unified library after refresh.
      // The checks below still require all 24 cards, unchanged hand height,
      // a successful horizontal swipe and no accidental game command.
      await page.locator('.side-nav [data-command=sessions]').tap();
      await page.locator('.saved-games-list').waitFor();
      const savedRow=page.locator('.saved-game[data-session-id] [data-resume-id]');
      assert.equal(await savedRow.count(),1,'the reloaded large-hand match is still present in local saved games');
      await savedRow.first().tap();
      const track=page.locator('.hand-track'), after=await track.boundingBox(); assert(Math.abs(before.height-after.height)<=1,'large hand must keep its reserved height');
      const dimensions=await track.evaluate(el=>({x:el.scrollWidth-el.clientWidth,y:el.scrollHeight-el.clientHeight,count:el.querySelectorAll('[data-hand-preview]').length}));
      assert.equal(dimensions.count,24);assert(dimensions.x>1&&dimensions.y<=1);
      const cdp=await context.newCDPSession(page),start={x:after.x+after.width-35,y:after.y+after.height/2};
      await touch(cdp,'touchStart',start);
      for(let step=1;step<=5;step++)await touch(cdp,'touchMove',{x:start.x-(after.width-70)*step/5,y:start.y});
      await touch(cdp,'touchEnd');await page.waitForFunction(()=>document.querySelector('.hand-track').scrollLeft>0);
      assert.equal((await state(page)).move,0);
      const ids=await track.locator('[data-hand-preview]').evaluateAll(els=>els.map(el=>el.dataset.handPreview));
      for(const id of ids){await card(page,id).scrollIntoViewIfNeeded();await exposedPoint(card(page,id));}
      assert(Math.abs((await track.boundingBox()).height-before.height)<=1);assert.equal((await state(page)).move,0);
    });
    for (const [i,viewport] of [{width:320,height:640},{width:390,height:740},{width:390,height:682},{width:740,height:360}].entries()) for (const pairCount of [4,5,6]) {
      const ownCount = (i + pairCount) % 2 ? 3 : 6, openHands = (i + pairCount) % 3 !== 0;
      const saved = durakTableFixture(pairCount,ownCount,openHands), defense = saved.states[0].data.hands[0][0].id;
      await check(`Durak ${pairCount} pairs, ${ownCount} own cards, ${openHands?'open':'closed'} opponent at ${viewport.width}×${viewport.height}`, {saved,viewport,touch:true}, async ({page}) => {
        await assertDurakTableFit(page,pairCount,openHands,'before defense');
        if (pairCount !== 6) return;
        const p = await exposedPoint(card(page,defense)); await page.touchscreen.tap(p.x,p.y); await expectMove(page,1);
        let s = await state(page); Core.validateState(s); assert.equal(s.data.table.at(-1).defense.id,defense); assert.equal(s.events.filter(e=>e.type==='durak.defended').length,1);
        await page.locator('[data-command=pass-device]:not(:disabled)').tap();
        if (await page.locator('.handoff [data-command=unlock]').count()) await page.locator('.handoff [data-command=unlock]').tap();
        await assertDurakTableFit(page,pairCount,openHands,'after defense',ownCount-1);
        await page.locator('.scene-actions button').filter({hasText:/^Бито$/}).tap(); await expectMove(page,2);
        s = await state(page); Core.validateState(s); assert.equal(s.data.table.length,0); assert.equal(s.data.discard.length,pairCount*2);
      });
    }
  } finally {
    await browser.close();
    await hosted?.close();
  }
});
