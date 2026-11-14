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
  return page.evaluate(() => PlayroomAppBridge.saveLibrary.current().session.export().states.at(-1));
}
async function expectMove(page, expected) {
  await page.waitForFunction(n => PlayroomAppBridge.saveLibrary.current().session.current.move === n, expected);
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
  await touch(cdp, 'touchMove', {x: source.x, y: source.y - 14});
  await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
  const destination = await center(await targetFor(page, id, side));
  for (let step = 1; step <= 5; step++) await touch(cdp, 'touchMove', {
    x: source.x + (destination.x - source.x) * step / 5,
    y: source.y + (destination.y - source.y) * step / 5
  });
  await touch(cdp, 'touchEnd');
}

test('Domino selection and drag gestures through the real application', {timeout: 120000}, async t => {
  const server=await require('./browser-origin.cjs').serveBrowserFixture(root);
  const state=page=>page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current);
  const expectMove=async(page,expected)=>{await page.waitForFunction(n=>PlayroomAppBridge.saveLibrary.current().session.current.move===n,expected);await page.locator('.table-shell>.scene[aria-busy="false"]').waitFor();assert.equal((await state(page)).move,expected);assert(await page.evaluate(()=>{const old=window.dominoRetained;if(!old||document.querySelector('.table-shell')?.dataset.geometryIdentity!==old.identity)return true;const node=document.querySelector('.domino-chain [data-entity="tile-d11"]');return node===old.node&&node.closest('.domino-node')===old.container&&node.querySelector('svg')===old.face;}),'unchanged laid tile keeps its physical container, control and SVG through chain insertion');};
  const browser = await chromium.launch({headless: true,
    executablePath: executablePath(),
    args: ['--no-sandbox', '--disable-background-networking']});
  async function check(name, {mobile = false, longHand = false, empty = false, autoPass = false,nativeTouch=false} = {}, run) {
    await t.test(name,{skip:nativeTouch&&browser.browserType().name()!=='chromium'}, async () => {
      const context = await browser.newContext({viewport: mobile ? {width: 390, height: 844} : {width: 1280, height: 900},
        hasTouch: mobile, isMobile: mobile, reducedMotion: 'reduce'});
      const saved = fixture({longHand, empty});
      await context.addInitScript(({saved,autoPass}) => {
        localStorage.clear();
        localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'domino-drag-owner',name:'Аня',createdAt:1,updatedAt:1}));
        localStorage.setItem('playroom.settings.v1', JSON.stringify({motion: false, sound: false,autoPass,tutorialsEnabled:false}));
        localStorage.setItem('playroom.session.v1', JSON.stringify(saved));
      }, {saved,autoPass});
      await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));
      const page = await context.newPage(), errors = [];
      page.setDefaultTimeout(5000);
      page.on('pageerror', error => errors.push(error.message));
      try {
        const targetUrl=process.env.PLAYROOM_URL||server.url;
        if(process.env.PLAYROOM_DOMINO_ARTIFACT){const fs=require('node:fs'),body=fs.readFileSync(process.env.PLAYROOM_DOMINO_ARTIFACT),hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');await page.route('**/*',route=>route.abort());await page.route(targetUrl,route=>route.fulfill({status:200,contentType:'text/html',body}));const response=await page.goto(targetUrl);assert.equal(hash(await response.body()),hash(body));if(process.env.PLAYROOM_DOMINO_EVIDENCE_DIR){fs.mkdirSync(process.env.PLAYROOM_DOMINO_EVIDENCE_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PLAYROOM_DOMINO_EVIDENCE_DIR,'artifact.json'),JSON.stringify({sha256:hash(body),engine:browser.browserType().name(),version:browser.version()},null,2));}}else await page.goto(targetUrl);
        await page.locator('.game-tile').first().waitFor();
        await page.locator('[data-hub-page=sessions]:visible').click();
        await page.locator('.saved-game[data-saved-actions-toggle]').first().click();
        await page.locator('[data-resume-id]:visible').first().click();
        await tile(page).waitFor({state: 'visible'});
        await page.evaluate(()=>{const node=document.querySelector('.domino-chain [data-entity="tile-d11"]');window.dominoRetained=node?{node,container:node.closest('.domino-node'),face:node.querySelector('svg'),identity:document.querySelector('.table-shell').dataset.geometryIdentity}:null;});
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
      const target=await targetFor(page,'d12','left'),box=await target.boundingBox(),ghost=await page.locator('.playroom-drag-ghost').boundingBox();
      const destination={x:box.x+box.width/2,y:box.y+box.height+ghost.height/2-8};
      await page.mouse.move(destination.x, destination.y, {steps: 8});
      assert(await target.evaluate(el=>el.classList.contains('playroom-drop-hover')),'partial ghost overlap highlights the chosen domino endpoint');
      await page.mouse.up();
      await expectMove(page, 1);
      await page.waitForTimeout(100);
      assert.equal((await state(page)).move, 1);
      assert.deepEqual((await state(page)).data.chain.map(t => [t.a, t.b]), [[2, 1], [1, 1]]);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
    });

    await check('Table zone chooses and snaps to the nearest legal domino end', {}, async ({page}) => {
      const p=await center(tile(page));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x,p.y-12);await page.locator('.playroom-drag-ghost').waitFor();
      const q=await page.locator('.game-field-content').evaluate(el=>{const r=el.getBoundingClientRect();for(let y=Math.max(0,r.top)+12;y<Math.min(innerHeight,r.bottom);y+=12)for(let x=Math.max(0,r.left)+12;x<Math.min(innerWidth,r.right);x+=12){const hit=document.elementFromPoint(x,y);if(hit?.closest('[data-drop-zone]')&&el.contains(hit)&&!hit.closest('[data-drop-piece]'))return {x,y};}throw Error('No reachable table zone');});
      const options=await targets(page).evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,action:JSON.parse(n.dataset.action)};}));options.sort((a,b)=>Math.hypot(a.x-q.x,a.y-q.y)-Math.hypot(b.x-q.x,b.y-q.y));
      await page.mouse.move(q.x,q.y,{steps:5});assert.equal(await page.locator('.playroom-drop-hover').count(),1,JSON.stringify(await page.evaluate(q=>({q,hit:document.elementFromPoint(q.x,q.y)?.outerHTML.slice(0,450),zone:document.elementFromPoint(q.x,q.y)?.closest('[data-drop-zone]')?.className}),q)));
      assert.equal(JSON.parse(await page.locator('.playroom-drop-hover').getAttribute('data-action')).side,options[0].action.side);
      const ghost=await page.locator('.playroom-drag-ghost').boundingBox();assert(Math.abs(ghost.x+ghost.width/2-options[0].x)<2);
      await page.mouse.up();await expectMove(page,1);
    });

    await check('Dropping outside a legal target cancels without changing the game', {}, async ({page}) => {
      const before = await state(page), source = await center(tile(page));
      await page.mouse.move(source.x, source.y); await page.mouse.down();
      await page.waitForTimeout(HOLD_MS);
      await page.locator('.playroom-drag-ghost').waitFor({state: 'visible'});
      // Keep the whole enlarged ghost outside all magnetic target regions.
      const outside = {x: -100, y: -100};
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

    await check('Native touch hold and drop reaches a legal board target once', {mobile: true,nativeTouch:true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page);
      await touchDrag(page, cdp);
      await expectMove(page, 1);
      await page.waitForTimeout(100);
      assert.equal((await state(page)).move, 1);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
      assert.deepEqual((await state(page)).data.chain.map(t => [t.a, t.b]), [[1, 1], [1, 2]]);
    });

    await check('Horizontal touch swipe scrolls a long hand without selecting or playing', {mobile: true, longHand: true,nativeTouch:true}, async ({page, context}) => {
      const cdp = await context.newCDPSession(page), track = page.locator('.hand-track');
      assert(await track.evaluate(el => el.scrollWidth > el.clientWidth + 100));
      const source = await track.evaluate(el => {
        const box = el.getBoundingClientRect();
        const left=Math.max(0,box.left),right=Math.min(innerWidth,box.right);
        for(const tile of [...el.querySelectorAll('[data-drag-piece]')].reverse()){
          const r=tile.getBoundingClientRect(),x=(Math.max(left,r.left)+Math.min(right,r.right))/2,y=(Math.max(box.top,r.top)+Math.min(box.bottom,r.bottom))/2;
          if(r.right>left&&r.left<right&&x>left+168&&x<right&&tile.contains(document.elementFromPoint(x,y)))return {x,y};
        }
        throw Error('No visible draggable tile for horizontal swipe');
      });
      await touch(cdp, 'touchStart', source);
      for (let step = 1; step <= 4; step++) await touch(cdp, 'touchMove', {x: source.x - step * 42, y: source.y});
      await touch(cdp, 'touchEnd');
      await page.waitForFunction(() => document.querySelector('.hand-track').scrollLeft > 20);
      assert.equal((await state(page)).move, 0);
      assert.equal(await page.locator('.domino-drop-target').count(), 0);
      assert.equal(await page.locator('.playroom-drag-ghost').count(), 0);
    });

    await check('Landscape domino hand scrolls horizontally without shrinking tiles', {mobile:true,longHand:true,nativeTouch:true}, async ({page,context})=>{
      await page.setViewportSize({width:740,height:320});
      const track=page.locator('.hand-track'),cdp=await context.newCDPSession(page),before=await state(page);
      assert(await track.evaluate(e=>e.scrollWidth>e.clientWidth),'tiles overflow inside hand viewport');
      const area=await track.boundingBox(),p={x:area.x+area.width-20,y:area.y+area.height/2};
      await touch(cdp,'touchStart',p);for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:p.x-n*30,y:p.y});await touch(cdp,'touchEnd');
      assert(await track.evaluate(e=>e.scrollLeft)>30);assert.deepEqual(await state(page),before);
      assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
      const end=await track.evaluate(e=>e.scrollLeft);const q={x:area.x+20,y:p.y};
      await touch(cdp,'touchStart',q);for(let n=1;n<=4;n++)await touch(cdp,'touchMove',{x:q.x+n*30,y:q.y});await touch(cdp,'touchEnd');
      assert(await track.evaluate(e=>e.scrollLeft)<end);assert.deepEqual(await state(page),before);
    });

    await check('Fresh native tap immediately after a drop selects and plays the next player tile', {mobile: true,autoPass:true,nativeTouch:true}, async ({page, context}) => {
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
  } finally { await browser.close();await server.close(); }
});

test('Shared drag selects Ludo routes, Snakes moves and Durak table placements', {timeout:60000}, async t=>{
 for(const game of ['ludo','snakes','durak'])require('../packs/'+game+'/rules.js');
 const fs=require('node:fs'),webkit=process.env.PLAYROOM_TEST_BROWSER==='webkit',server=await require('./browser-origin.cjs').serveBrowserFixture(root),report=[];
 const browser=await (webkit?require('playwright-core').webkit:chromium).launch(webkit?{headless:true}:{headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const state=page=>page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current);
 const expectMove=async(page,n)=>{await page.waitForFunction(n=>PlayroomAppBridge.saveLibrary.current().session.current.move===n,n);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();};
 try{for(const [game,variant] of [['ludo','route'],['ludo','base'],['snakes','route'],['snakes','start'],['durak','attack'],['durak','throw'],['durak','defend']])await t.test(game+' '+variant,async()=>{
  const saved=new Session(Core,game,{seed:17,mode:'pass',firstPlayerMode:'assigned',firstPlayer:0,diceCount:2,players:[{name:'Аня'},{name:'Борис'}]}).export(),s=saved.states[0];s.turn=0;
  if(game==='ludo'){Object.assign(s.data,{phase:'move',dice:[2,3],used:[false,false]});s.data.pawns[0]=variant==='base'?[-1,-1,-1,-1]:[7,9,-1,-1];if(variant==='base')s.data.dice=[6,3];}
  if(game==='snakes'){Object.assign(s.data,{phase:'move',dice:[2,3],adjusting:false});s.data.positions[0]=variant==='start'?0:5;}
  if(game==='durak'&&['defend','throw'].includes(variant)){
   const d=s.data,all=[...d.hands.flat(),...d.drawPile],suit=d.trump.suit,cards=all.filter(c=>!c.joker&&c.suit===suit&&c.id!==d.trump.id).sort((a,b)=>a.rank-b.rank),attack=cards.slice(0,2),defence=cards.at(-1),ids=new Set([...attack,defence].map(c=>c.id)),rest=all.filter(c=>!ids.has(c.id)&&c.id!==d.trump.id);
   Object.assign(d,{composing:false,attacker:1,defender:0,attackCursor:1,boutOrigin:1,table:attack.map(c=>({attack:c,defense:null})),hands:[[defence,...rest.splice(0,5)],rest.splice(0,6)],drawPile:[d.trump,...rest]});
  }
  if(game==='durak'&&variant==='throw'){
   const d=s.data;d.taking=false;d.attacker=0;d.defender=1;d.attackCursor=0;d.boutOrigin=0;
   const rank=d.table[0].attack.rank,candidate=d.drawPile.find(c=>c.rank===rank&&c.id!==d.trump.id);assert(candidate);d.drawPile=d.drawPile.filter(c=>c.id!==candidate.id);d.drawPile.push(d.hands[0].shift());d.hands[0].unshift(candidate);
   for(const pair of d.table){const zones=[d.drawPile,...d.hands],zone=zones.find(z=>z.some(c=>c.id!==d.trump.id&&c.id!==candidate.id&&c.suit===pair.attack.suit&&c.rank>pair.attack.rank));assert(zone);const i=zone.findIndex(c=>c.id!==d.trump.id&&c.id!==candidate.id&&c.suit===pair.attack.suit&&c.rank>pair.attack.rank);pair.defense=zone.splice(i,1)[0];}
  }
  assert(Core.validateState(s));
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  await context.addInitScript(saved=>{localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'shared-drag-owner',name:'Аня',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',autoPass:false,tutorialsEnabled:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
  const network=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}}));
  const page=await context.newPage(),errors=[],entry={game,variant};report.push(entry);page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
  try{const targetUrl=process.env.PLAYROOM_URL||server.url;if(process.env.PLAYROOM_TEST_ARTIFACT){const body=fs.readFileSync(process.env.PLAYROOM_TEST_ARTIFACT);await page.route('**/*',route=>route.abort());await page.route(targetUrl,route=>route.fulfill({status:200,contentType:'text/html',body}));}const response=await page.goto(targetUrl);if(process.env.PLAYROOM_TEST_ARTIFACT){const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');entry.artifactSha256=hash(await response.body());assert.equal(entry.artifactSha256,hash(fs.readFileSync(process.env.PLAYROOM_TEST_ARTIFACT)));}await page.locator('.game-tile').first().waitFor();await page.locator('[data-hub-page=sessions]:visible').click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('[data-resume-id]:visible').first().click();if(await page.locator('[data-command=unlock]').count())await page.locator('[data-command=unlock]').click();
   if(game==='durak')await page.evaluate(()=>window.durakRetained=[...document.querySelectorAll('.hand-track [data-entity],.durak-stock [data-entity],.durak-pair .attack-card [data-entity]')].map(node=>({id:node.dataset.entity,node,art:node.querySelector('svg'),zone:node.closest('.hand-track')?'hand':node.closest('.durak-stock')?'stock':'table'})));
   const reserved=game==='durak'&&variant!=='defend'?await page.locator('.durak-attack-target').boundingBox():null;
   if(game==='durak'&&variant!=='defend'){assert(reserved,'Attack slot exists before selection');assert.equal(await page.locator('.durak-attack-target').isDisabled(),true);}
   const slotAppearance=()=>page.locator('.durak-pair').nth(1).locator('.defense-slot,.defend-target').evaluate(el=>{const c=getComputedStyle(el),r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,border:c.border,borderRadius:c.borderRadius,background:c.backgroundColor,shadow:c.boxShadow,text:el.textContent,art:el.querySelectorAll('svg').length};});
   const idleSlot=variant==='defend'?await slotAppearance():null;
   const source=page.locator(game==='ludo'?'.ludo-pawn[data-drag-piece]':game==='snakes'?'.snakes-token[data-drag-piece]':'.hand-track [data-drag-piece]').first();
   const p=await center(source);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+8,p.y);await page.locator('.playroom-drag-ghost').waitFor();
   if(idleSlot){assert.deepEqual(await slotAppearance(),idleSlot,'Starting an unfinished drag must preserve the empty defence appearance');await page.mouse.move(5,400);await page.mouse.up();assert.deepEqual(await slotAppearance(),idleSlot,'Cancelled drag keeps the empty defence appearance');assert.equal((await state(page)).move,0);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+8,p.y);await page.locator('.playroom-drag-ghost').waitFor();}
   const target=page.locator('[data-drop-piece][data-action]').nth(variant==='defend'?1:0);await target.waitFor();const expected=JSON.parse(await target.getAttribute('data-action'));
   const q=game==='durak'&&variant!=='defend'?await center(page.locator('.game-field-content')):await center(target);await page.mouse.move(q.x,q.y,{steps:5});assert.equal(await page.locator('.playroom-drop-hover').count(),1);
   const dropBox=game==='durak'&&variant!=='defend'?await target.boundingBox():null;
   if(reserved)for(const key of ['x','y','width','height'])assert(Math.abs(reserved[key]-dropBox[key])<1,`${variant}: drag must preserve reserved ${key}`);
   if(process.env.PLAYROOM_DRAG_SCREENSHOTS)await page.screenshot({path:path.join(process.env.PLAYROOM_DRAG_SCREENSHOTS,game+'-'+variant+'.png')});
   await page.mouse.up();await expectMove(page,1);const after=await state(page);assert.equal(after.move,1);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal(expected.type,game==='durak'?(variant==='throw'?'attack':variant):'move');if(variant==='defend')assert.equal(after.data.table[expected.target].defense.id,expected.card);
   if(game==='durak'){entry.retained=await page.evaluate(()=>{const current=[...document.querySelectorAll('.hand-track [data-entity],.durak-stock [data-entity],.durak-pair .attack-card [data-entity]')];return durakRetained.flatMap(old=>{const node=current.find(node=>node.dataset.entity===old.id);return node&&(node.closest('.hand-track')?'hand':node.closest('.durak-stock')?'stock':'table')===old.zone?[{node:node===old.node,art:node.querySelector('svg')===old.art}]:[];});});assert(entry.retained.length>0&&entry.retained.every(item=>item.node&&item.art),'unaffected hand, table and trump keep nodes and SVG');}
   if(dropBox){const placed=await page.locator('.durak-pair .attack-card [data-entity="card-'+expected.card+'"]').boundingBox();assert(placed);for(const key of ['x','y','width','height'])assert(Math.abs(placed[key]-dropBox[key])<2,`${variant}: ${key}: target ${dropBox[key]}, placed ${placed[key]}`);}

   assert.deepEqual(errors,[]);assert.equal(network.nativeSupabaseRequests,0);entry.move=after.move;entry.action=expected;entry.pass=true;
  }finally{entry.errors=errors;entry.nativeSupabaseRequests=network.nativeSupabaseRequests;await context.close();}
 });}finally{if(process.env.PLAYROOM_DRAG_REPORT_DIR){fs.mkdirSync(process.env.PLAYROOM_DRAG_REPORT_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.PLAYROOM_DRAG_REPORT_DIR,'shared-'+browser.browserType().name()+'.json'),JSON.stringify({engine:browser.browserType().name(),version:browser.version(),report},null,2));}await browser.close();await server.close();}
});
