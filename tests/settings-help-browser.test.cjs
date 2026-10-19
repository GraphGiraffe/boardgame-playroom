'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture,selectChoice,readChoice}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('screen:phone:portrait settings help opens by touch and Escape closes only the popover without changing preferences',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(server.url);await page.locator('[data-start=uno]').first().click();await page.locator('[data-room-cycle=seat-3]').click();await page.locator('.room-setup-modal [data-command=settings]').click();
  assert(!await page.locator('.modal').innerText().then(t=>t.includes('О настройках')||t.includes('Для этой игры, только на этом устройстве')));
  const before=await page.evaluate(()=>localStorage.getItem('playroom.settings.v1'));
  for(const id of ['setting-hand-shape','setting-seating','setting-last-game','setting-auto-pass','setting-quick-play','setting-volume','setting-speed','setting-scale','sound-preview']){
   if(id==='sound-preview')await page.locator('.settings-details>summary').click();
   const wrapper=page.locator('#'+id).locator('xpath=ancestor::div[contains(@class,"setting-with-help")][1]'),button=wrapper.locator('.rule-help>button');assert.equal(await button.count(),1,id+' has one help button');
   assert(await wrapper.locator('.setting-title').evaluate(e=>{const a=e.querySelector('.setting-title-text').getBoundingClientRect(),b=e.querySelector('.rule-help>button').getBoundingClientRect();return b.left>=a.right-1&&b.left-a.right<=8&&Math.abs((a.top+a.bottom-b.top-b.bottom)/2)<2;}),id+' help sits beside its title');
   await button.focus();await button.press('ArrowRight');
   assert(await button.evaluate(e=>{const svg=e.querySelector('svg'),ring=svg.querySelector('.help-focus-ring'),glyph=svg.querySelector('circle:not(.help-focus-ring)'),r=e.getBoundingClientRect();if(!ring||!glyph)return false;const center=shape=>new DOMPoint(shape.cx.baseVal.value,shape.cy.baseVal.value).matrixTransform(shape.getScreenCTM()),a=center(glyph),b=center(ring),box=ring.getBoundingClientRect();return e.matches(':focus-visible')&&Number(getComputedStyle(ring).opacity)===1&&Math.abs(a.x-b.x)<.1&&Math.abs(a.y-b.y)<.1&&box.width<=r.width&&box.height<=r.height;}),id+' compact focus ring shares the icon center');
   await button.click();assert(await page.locator('.mini-help-popover:popover-open').isVisible());assert((await page.locator('.mini-help-popover:popover-open').innerText()).length>20);
   await page.keyboard.press('Escape');assert.equal(await page.locator('.mini-help-popover:popover-open').count(),0);assert(await page.locator('.settings-overview').isVisible());
   assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.settings.v1')),before,'help is read-only');
   if(id==='setting-hand-shape'){const shots=path.join(root,'tmp_files/rules-0.18.1');fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'help-centered-390.png'),fullPage:false});}
  }
  assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});
