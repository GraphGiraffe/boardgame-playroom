'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
for(const [width,height] of [[320,740],[390,740],[740,390],[1280,800]])test(`screen:${width>=1000?'desktop':width>height?'phone:landscape':'phone:portrait'} library filters ${width}×${height}: disclosure preserves selection`,{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root);let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
  await page.goto(server.url);
  await page.waitForFunction(()=>document.querySelector('#profile-form')||document.querySelector('.game-grid'));
  if(await page.locator('#profile-form').count()){await page.locator('#profile-form input').fill('Тест');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());}
  await page.locator('.game-grid').first().waitFor();
  const toggle=page.locator('[data-hub-filters-toggle]'),panels=page.locator('[data-hub-filter-panel]');
  assert.equal(await panels.count(),3);assert.equal(await page.locator('[data-hub-filter-panel]:visible').count(),0);
  assert.equal(await toggle.getAttribute('aria-label'),'Фильтры');assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  assert.equal(await toggle.locator('[data-ui-icon=filter]').count(),1);
  assert.deepEqual(await page.locator('.filter-scope>.filter').evaluateAll(items=>items.map(e=>e.dataset.filter||'filters')),['all','favorites','filters']);
  async function fits(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
   assert(await toggle.evaluate(e=>{const a=e.getBoundingClientRect(),b=e.parentElement.firstElementChild.getBoundingClientRect();return Math.abs(a.top-b.top)<1&&a.width>=44&&a.height>=44;}),'scope controls stay on one row with touch-sized filters');}
  await fits();
  const captures=process.env.PLAYROOM_CAPTURE_DIR;
  if(captures){fs.mkdirSync(captures,{recursive:true});await page.screenshot({path:path.join(captures,`library-closed-${width}.png`)});}
  await toggle.focus();await page.keyboard.press('Enter');
  assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('[data-hub-filter-panel]:visible').count(),3);
  assert(await toggle.evaluate(e=>document.activeElement===e),'opening retains keyboard focus');await fits();
  if(captures)await page.screenshot({path:path.join(captures,`library-open-${width}.png`)});
  await page.locator('[data-tag-kind=type][data-tag=cards]').click();const count=await page.locator('.game-tile').count();assert(count>0&&count<12);
  assert.equal(await toggle.getAttribute('aria-expanded'),'true','selection rerender retains disclosure');
  await toggle.focus();await page.keyboard.press('Space');
  assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await page.locator('[data-hub-filter-panel]:visible').count(),0);
  assert.equal(await page.locator('.game-tile').count(),count,'collapsing preserves results');
  await page.locator('[data-filter=favorites]').click();await page.locator('[data-filter=all]').click();
  assert.equal(await page.locator('.game-tile').count(),count);assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  await toggle.click();assert.equal(await page.locator('[data-tag-kind=type][data-tag=cards]').getAttribute('aria-pressed'),'true');
  await page.reload();assert.equal(await toggle.getAttribute('aria-expanded'),'false','new page defaults to collapsed');
  assert.equal(await page.locator('[data-hub-filter-panel]:visible').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
