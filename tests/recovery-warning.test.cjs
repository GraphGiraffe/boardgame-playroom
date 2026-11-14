'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');

test('deleting the final old-pack save clears the stale recovery warning',{timeout:30000},async()=>{
  // File origins have implementation-dependent localStorage persistence across
  // reloads. Exercise this durable-storage behavior on a stable local origin.
  // Explicit PLAYROOM_URL still lets packaged HTML/PWA smoke choose its target.
  const fixture=process.env.PLAYROOM_URL?null:await serveBrowserFixture(root);
  const url=process.env.PLAYROOM_URL||fixture.url;
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(url);
    await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);
    const boot=await page.evaluate(()=>({app:!!globalThis.PlayroomAppBridge,
      multiplayer:!!globalThis.PlayroomMultiplayer,network:!!globalThis.PlayroomNetworkDebug,
      scanner:!!globalThis.PlayroomQRScanner,profile:!!document.getElementById('profile-form'),
      body:document.body?.innerText.slice(0,200)}));
    assert.ok(boot.app&&boot.network,'PlayRoom failed to initialize: '+JSON.stringify({boot,errors}));
    await page.evaluate(async()=>{
      await PlayroomData.put('playroom.session.v1',JSON.stringify({
        game:'uno',packVersion:'0.1.0',createdAt:1712345678,updatedAt:1712345678
      }));
    });
    await page.reload();
    await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);
    const persisted=await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1'));
    assert.ok(persisted,'The damaged save must remain in browser storage after reload');
    try{await page.locator('.recovery-note').waitFor({timeout:10000});}
    catch(error){
      const diagnostics=await page.evaluate(()=>({body:document.body?.innerText.slice(0,350),
        modal:document.getElementById('modal-root')?.innerText.slice(0,350),app:!!globalThis.PlayroomAppBridge}));
      assert.fail('No recovery warning: '+JSON.stringify({diagnostics,errors,error:error.message}));
    }
    assert.match(await page.locator('.recovery-note').innerText(),/Не удалось восстановить/);
    await page.locator('[data-hub-page=sessions]').click();await page.locator('[data-saved-actions-toggle]').first().click();
    await page.locator('[data-delete-id]').first().click();
    await page.locator('[data-delete-confirm]').click();
    await page.locator('[data-delete-id]').waitFor({state:'detached'});
    assert.equal(await page.locator('[data-delete-id]').count(),0);
    await page.locator('[data-hub-page=games]').click();
    assert.equal(await page.locator('.recovery-note').count(),0,'No stale warning after removing the broken save');
    assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.session.v1')),null);
    // Also filter startup pack-version conflicts when there are no dependent games.
    await page.evaluate(()=>{
      PlayroomPacks.warnings.push('Встроенный пакет uno@0.1.0 отличается от сохранённой версии. Для совместимости партий используется сохранённая версия.');
      globalThis.PlayroomPackLoadError=PlayroomPacks.warnings.join(' ');
    });
    await require('./browser-origin.cjs').openPacks(page);
    assert.equal(await page.locator('.pack-message').count(),0);
  }finally{await context.close();await browser.close();await fixture?.close();}
});
