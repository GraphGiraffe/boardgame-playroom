'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture,selectChoice,readChoice}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
for(const [width,height] of [[320,740],[390,740],[740,390]])test(`screen:phone:${width>height?'landscape':'portrait'} settings ${width}×${height}: hand shape and persistence`,{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
 const shots=path.join(root,'tmp_files/rules-0.18.1');fs.mkdirSync(shots,{recursive:true});
 try{
  await page.goto(server.url);await page.locator('[data-start=uno]').first().click();await page.locator('[data-room-cycle=seat-3]').click();
  const before=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules));await page.locator('.room-setup-modal [data-command=settings]').click();
   const layout=page.locator('.settings-layout-grid');assert.equal(await layout.locator('input[type=range]').count(),0);assert.equal(await page.locator('#setting-hand-shape').getAttribute('type'),'checkbox');
   assert(await layout.evaluate(e=>{return e.scrollWidth<=e.clientWidth+1;}),'hand control fits its container');
   await page.locator('#setting-hand-shape').uncheck();assert.equal(await page.locator('#setting-hand-shape').isChecked(),false);
   await page.locator('#setting-hand-shape').check();assert.equal(await page.locator('#setting-hand-shape').isChecked(),true);
   assert.equal(await page.locator('#setting-seating').count(),0,'seating follows available geometry');assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room().rules)),before);
   await page.locator('#setting-speed').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#setting-speed-value').innerText(),'Мгновенный');
   await page.locator('.modal-body').evaluate(e=>e.scrollTop=0);await page.screenshot({path:path.join(shots,`settings-${width}.png`),fullPage:false});
  await page.locator('.modal [data-command=close-modal]').click();await page.locator('[data-command=lobby-leave]').click();await page.locator('[data-confirm-accept]').click();await page.reload();
  await page.locator('[data-start=uno]').first().click();await page.locator('[data-room-cycle=seat-3]').click();await page.locator('.room-setup-modal [data-command=settings]').click();
  assert.equal(await page.locator('#setting-hand-shape').isChecked(),true);assert.equal(await page.locator('#setting-seating').count(),0);
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.gameOptions('ludo').seating),'auto','seating is per game');assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});
