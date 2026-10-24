'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

test('pack updates notify once, remain unread until packs are opened, and rearm for a new version',{timeout:45000},async()=>{
  const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await page.goto(server.url);
    const installed=await page.evaluate(()=>[...new Set(PlayroomPacks.list().map(item=>item.id))].slice(0,2));
    assert.equal(installed.length,2);
    let versions=[1,1];
    await page.route('**/api/packs/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({format:'playroom-catalog',version:1,collection:'9.9.9',packs:installed.map((id,index)=>({id,version:`9.0.${versions[index]}`,stateVersion:1,engineApi:4,viewApi:3,sha256:'a'.repeat(64),url:`/api/packs/files/${id}/9.0.${versions[index]}/${'a'.repeat(64)}.playroom-pack.json`}))})}));
    await page.reload();
    await page.locator('.pack-update-notice').waitFor();
    assert.match(await page.locator('.pack-update-notice').innerText(),/2/);
    await page.locator('[data-command=dismiss-pack-updates]').click();
    assert.equal(await page.locator('.pack-update-notice').count(),0);
    assert.equal(await page.locator('.pack-hub-button.has-unread').count(),1);
    await page.locator('.side-nav [data-command=sessions]').click();
    await page.locator('.side-nav [data-command=home]').click();
    assert.equal(await page.locator('.pack-hub-button.flash-unread').count(),1);
    await page.reload();
    assert.equal(await page.locator('.pack-update-notice').count(),0);
    await page.locator('.pack-hub-button').click();
    await page.locator('.pack-manager-modal').waitFor();
    await page.locator('.pack-manager-modal [data-command=close-modal]').click();
    await page.locator('.side-nav [data-command=home]').click();
    assert.equal(await page.locator('.pack-hub-button.has-unread').count(),0);
    versions=[2,1];
    await page.locator('.side-nav [data-command=home]').click();
    await page.locator('.pack-update-notice').waitFor();
    assert.match(await page.locator('.pack-update-notice').innerText(),/одного пака/);
  }finally{await context.close();await browser.close();await server.close();}
});
