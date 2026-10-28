'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture,selectChoice,readChoice}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('screen:phone:portrait settings help opens by touch and Escape closes only the popover without changing preferences',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(server.url);await page.locator('[data-start=uno]').first().click();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('uno',false));await page.locator('[data-room-cycle=seat-3]').click();await page.locator('.room-setup-modal [data-command=settings]').click();
  assert(!await page.locator('.modal').innerText().then(t=>t.includes('О настройках')||t.includes('Для этой игры, только на этом устройстве')));
  const before=await page.evaluate(()=>localStorage.getItem('playroom.settings.v1'));
  for(const id of ['setting-hand-shape','setting-last-game','setting-quick-play','setting-volume','setting-speed','setting-scale']){
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

test('modal origins: game settings rules and room close return to their caller',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 const close=()=>page.locator('#modal-root .modal-head [data-command=close-modal]').click();
 try{
  await page.goto(server.url);await page.locator('[data-start=tictactoe]').first().click();await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('tictactoe',false));
  const roomId=await page.evaluate(()=>PlayroomAppBridge.room().id);
  await close();assert.equal(await page.locator('#modal-root .modal').count(),0);
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().id),roomId,'closing room does not leave it');
  await page.locator('#app [data-command=room]').click();await page.locator('[data-command=lobby-start]').click();
  await page.locator('#app .table-shell').waitFor();
  await page.locator('#app [data-command=settings]').click();
  assert.equal(await page.locator('.settings-header-actions [data-friends-open]').count(),1);
  assert.equal(await page.locator('.settings-quick [data-command=rules]').count(),1);assert.equal(await page.locator('.settings-header-actions [data-command=rules]').count(),0);
  await page.locator('.settings-quick [data-command=rules]').click();await page.locator('.game-rules-help').waitFor();
  await close();await page.locator('.settings-overview').waitFor();await close();
  assert.equal(await page.locator('#modal-root .modal').count(),0);assert(await page.locator('#app .table-shell').isVisible());
  await page.locator('#app [data-command=settings]').click();await page.locator('.settings-quick [data-command=room]').click();
  await page.locator('.room-setup-modal [data-command=settings]').click();
  await page.locator('.settings-quick [data-command=room-help]').click();await close();await page.locator('.settings-overview').waitFor();await close();await page.locator('.lobby-shell').waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.locator('#modal-root .modal').count(),0);
  assert(await page.locator('#app .table-shell').isVisible());assert.equal(await page.evaluate(()=>document.getElementById('app').inert),false);
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().id),roomId);assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
