'use strict';
const {selectChoice,readChoice}=require('./browser-origin.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('hub favorites, recent game, pack order, visibility and rules survive reload',{timeout:90000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(fixture.url);await page.evaluate(()=>localStorage.clear());await page.reload();if(await page.locator('#profile-form').count()){await page.locator('#profile-form input').fill('Тест');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());}
  assert.equal(await page.locator('.game-tile').count(),12);
  assert.equal(await page.locator('.collection-count').innerText(),'ПОКАЗАНО: 12 · СКРЫТО: 0');
  assert.equal(await page.locator('.hub-filters>[role=group]').count(),4);
  await page.locator('[data-hub-filters-toggle]').click();
  await page.locator('[data-tag-kind=type][data-tag=cards]').click();assert.equal(await page.locator('.game-tile').count(),5);
  await page.locator('[data-tag-kind=mechanic][data-tag=combinations]').click();assert.equal(await page.locator('.game-tile').count(),2);
  await page.locator('[data-filter=favorites]').click();await page.locator('[data-filter=all]').click();assert.equal(await page.locator('.game-tile').count(),2,'scope preserves both tag groups');
  await page.locator('[data-tag-kind=type][data-tag=cards]').click();await page.locator('[data-tag-kind=mechanic][data-tag=combinations]').click();
  await page.locator('[data-format=duel]').click();assert.equal(await page.locator('.game-tile').count(),3);await page.locator('[data-format=duel]').click();
  for(const width of [320,390,768]){await page.setViewportSize({width,height:740});assert(await page.locator('.filter-format').evaluate(row=>{const items=[...row.querySelectorAll('button')].map(b=>b.getBoundingClientRect());return items.length===8&&items.every(r=>Math.abs(r.top-items[0].top)<1)&&row.scrollWidth<=row.clientWidth+1;}));}
  await page.setViewportSize({width:390,height:740});
  const ids=await page.locator('.game-tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.game)),first=ids[0],second=ids[1],third=ids.find(id=>![first,second,'pexeso','gofish'].includes(id));
  await page.locator(`.game-tile[data-game="${second}"] .tile-favorite`).click();await page.locator('[data-filter=favorites]').click();assert.deepEqual(await page.locator('.game-tile').evaluateAll(nodes=>nodes.map(n=>n.dataset.game)),[second]);
  await page.locator('[data-filter=all]').click();assert.equal(await page.locator('.favorites-section .game-tile').count(),1);assert.equal(await page.locator('.other-section .game-tile').count(),11);await page.locator('.topbar-tools [data-command=packs]').click();
  await page.locator(`[data-pack-move="${second}"][data-direction="-1"]`).click();await page.locator('.modal [data-command=close-modal]').click();assert.equal(await page.locator('.game-tile').first().getAttribute('data-game'),second);
  await page.locator('.topbar-tools [data-command=packs]').click();await page.locator(`[data-pack-visibility="${first}"]`).click();await page.locator('.modal [data-command=close-modal]').click();assert.equal(await page.locator(`.game-tile[data-game="${first}"]`).count(),0);
  assert.equal(await page.locator('.collection-count').innerText(),'ПОКАЗАНО: 11 · СКРЫТО: 1');
  await page.locator('.topbar-tools [data-command=packs]').click();await page.locator(`[data-pack-visibility="${third}"]`).click();await page.locator('.modal [data-command=close-modal]').click();
  assert.equal(await page.locator('.collection-count').innerText(),'ПОКАЗАНО: 10 · СКРЫТО: 2');
  await page.setViewportSize({width:320,height:740});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'counter overflows phone');
  await page.locator('[data-edit-toggle]').click();assert.equal(await page.locator('.collection-count').innerText(),'ВСЕГО: 12 · СКРЫТО: 2');await page.locator('[data-edit-toggle]').click();
  await page.locator('.topbar-tools [data-command=packs]').click();await page.locator(`[data-pack-visibility="${third}"]`).click();await page.locator('.modal [data-command=close-modal]').click();
  assert.equal(await page.locator('.collection-count').innerText(),'ПОКАЗАНО: 11 · СКРЫТО: 1');
  await page.reload();assert.equal(await page.locator('.game-tile').first().getAttribute('data-game'),second);assert.equal(await page.locator(`.game-tile[data-game="${first}"]`).count(),0);
  await page.locator('[data-filter=favorites]').click();assert.equal(await page.locator('.game-tile').count(),1);await page.locator('[data-filter=all]').click();
  for(const width of [320,390]){await page.setViewportSize({width,height:740});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`horizontal overflow at ${width}`);}
  await page.locator('[data-start=pexeso]').first().click();
  await page.locator('[data-command=room-change-game]').click();
  assert.equal(await page.locator(`[data-room-game="${first}"]`).count(),0);
  assert.equal(await page.locator('[data-room-game]').first().getAttribute('data-room-game'),second);
  await page.locator('.modal [data-command=close-modal]').click();
  await page.locator('[data-command=room-rules]').click();
  await selectChoice(page.locator('#room-rules-form [name=preset]'),'hard');
  await page.locator('#room-rules-form [name="option-deck"]').selectOption('52');
  await page.locator('#room-rules-form').evaluate(form=>form.requestSubmit());
  await page.locator('[data-command=lobby-leave]').click();
  await page.reload();
  await page.locator('[data-start=pexeso]').first().click();
  await page.locator('[data-command=room-rules]').click();
  assert.equal(await readChoice(page.locator('#room-rules-form [name=preset]')),'hard');
  assert.equal(await page.locator('#room-rules-form [name="option-deck"]').inputValue(),'52');
  await page.locator('.modal [data-command=close-modal]').click();
  await page.locator('[data-command=lobby-start]').click();
  await page.locator('.table-heading [data-command=home]').click();
  assert.equal(await page.locator('.recent-section').count(),0,'recent game is opt-in');
  await page.locator('.topbar-tools [data-command=settings]').click();await page.locator('#setting-last-game').check();await page.locator('.modal [data-command=close-modal]').click();await page.evaluate(()=>PlayroomAppBridge.showHub());
  assert.equal(await page.locator('.recent-section .game-tile').getAttribute('data-game'),'pexeso');
  assert.equal(await page.locator('.game-tile[data-game=pexeso]').count(),2);
  assert.equal(await page.locator('.hub-game-section + .hub-game-section').count(),2);
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});const sizes=await page.locator('.game-tile[data-game=pexeso]').evaluateAll(nodes=>nodes.map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height})));assert(Math.abs(sizes[0].width-sizes[1].width)<1);if(width<=520)assert(Math.abs(sizes[0].height-sizes[1].height)<1);else assert(sizes.every(size=>size.height>240));if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,`hub-${width}.png`),fullPage:true});}
  await page.reload();
  assert.equal(await page.locator('.recent-section .game-tile').getAttribute('data-game'),'pexeso');
  await page.locator('[data-start=gofish]').first().click();
  await page.locator('[data-command=room-rules]').click();
  assert.equal(await readChoice(page.locator('#room-rules-form [name=preset]')),'classic');
  assert.equal(await page.locator('#room-rules-form [name="option-deck"]').inputValue(),'52');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await fixture.close();}
});
