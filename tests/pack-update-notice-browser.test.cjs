'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

test('pack updates notify once, remain unread until packs are opened, and rearm for a new version',{timeout:45000},async()=>{
  const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'test',name:'Тест'})));
  const page=await context.newPage();
  try{
    await page.goto(server.url);await page.waitForFunction(()=>PlayroomPacks.list().length>0&&document.querySelector('.pack-hub-button'));
    const installed=await page.evaluate(()=>[...new Set(PlayroomPacks.list().map(item=>item.id))].slice(0,2));
    assert.equal(installed.length,2);
    let versions=[1,1];
    await page.route('**/api/packs/catalog',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({format:'playroom-catalog',version:1,collection:'9.9.9',packs:installed.map((id,index)=>({id,version:`9.0.${versions[index]}`,releases:[{version:'8.0.0',changes:['Первое изменение','<b>Текст, не HTML</b>']},{version:`9.0.${versions[index]}`,changes:['Второе изменение']}],stateVersion:1,engineApi:4,viewApi:3,sha256:'a'.repeat(64),url:`/api/packs/files/${id}/9.0.${versions[index]}/${'a'.repeat(64)}.playroom-pack.json`}))})}));
    await page.reload();
    await page.locator('.updates-modal').waitFor();
    assert.equal(await page.locator('.update-changes>section').count(),2);
    assert.equal(await page.locator('.update-changes li').count(),6);
    assert.equal(await page.locator('.update-changes b').count(),0);
    assert.match(await page.locator('.update-changes').innerText(),/Первое изменение[\s\S]*Второе изменение/);
    assert.equal(await page.locator('#update-banner,.pack-update-notice').count(),0);
    await page.locator('.updates-modal [data-command=close-modal]').first().click();
    assert.equal(await page.locator('.pack-update-notice').count(),0);
    assert.equal(await page.locator('.pack-hub-button.has-unread').count(),1);
    await page.locator('.side-nav [data-command=sessions]').click();
    await page.locator('.side-nav [data-command=home]').click();
    assert.equal(await page.locator('.pack-hub-button.flash-unread').count(),1);
    await page.reload();
    assert.equal(await page.locator('.pack-update-notice').count(),0);
    await page.locator('[data-command=show-updates]').click();
    await page.locator('.updates-modal [data-command=update-packs]').click();
    await page.locator('.pack-manager-modal').waitFor();
    await page.locator('.pack-manager-modal [data-command=close-modal]').click();
    await page.locator('.side-nav [data-command=home]').click();
    assert.equal(await page.locator('.pack-hub-button.has-unread').count(),0);assert.equal(await page.locator('.pack-hub-button.flash-unread').count(),1);
    await page.locator('.side-nav [data-command=sessions]').click();assert.equal(await page.locator('.pack-hub-button.flash-unread').count(),1);
    versions=[2,1];
    await page.locator('.side-nav [data-command=home]').click();
    await page.locator('.updates-modal').waitFor();
    assert.match(await page.locator('.updates-modal').innerText(),/9.0.2/);
  }finally{await context.close();await browser.close();await server.close();}
});

test('update all installs valid packs, retries failures and preserves preferences and removes unused old versions',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740}});
 await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'test',name:'Тест'})));
  const page=await context.newPage();
 try{
  await page.goto(server.url);await page.waitForFunction(()=>PlayroomPacks.list().length>0&&document.querySelector('.pack-hub-button'));
  const bundles=await page.evaluate(()=>['uno','ludo'].map(id=>JSON.parse(PlayroomPacks.exportPack(id))));
  const original=bundles.map(b=>b.manifest.version),crypto=require('node:crypto');let fail=true;const requests=[];
  const entries=bundles.map(b=>{b.manifest.version='9.0.1';const body=JSON.stringify(b),sha=crypto.createHash('sha256').update(body).digest('hex'),m=b.manifest;return {body,item:{id:m.id,version:m.version,stateVersion:m.stateVersion,engineApi:m.engineApi,viewApi:m.viewApi,sha256:sha,url:`/api/packs/files/${m.id}/${m.version}/${sha}.playroom-pack.json`}};});
  await page.route('**/api/packs/catalog',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({format:'playroom-catalog',version:1,collection:'9.0.1',packs:entries.map(e=>e.item)})}));
  await page.route('**/api/packs/files/**',async r=>{const e=entries.find(e=>r.request().url().endsWith(e.item.url));requests.push(e.item.id);await new Promise(resolve=>setTimeout(resolve,80));await r.fulfill({status:fail&&e.item.id==='uno'?503:200,contentType:'application/json',body:e.body});});
  const prefs=JSON.stringify({order:['ludo','uno'],hidden:[],favorites:['uno']});
  await page.evaluate(value=>localStorage.setItem('playroom.pack-display.v1',value),prefs);
  await page.reload();await page.locator('.updates-modal [data-command=update-packs]').click();
  const all=page.locator('[data-pack-update-all]');await all.waitFor();assert.match(await all.innerText(),/2/);await all.click();
  await page.waitForFunction(()=>document.querySelector('.pack-message')?.textContent.includes('uno:'));
  assert.deepEqual(requests,['uno','ludo']);assert.deepEqual(await page.evaluate(()=>PlayroomRemotePacks.pending().map(p=>p.id)),['uno']);
  assert.equal(await page.evaluate(()=>localStorage.getItem('playroom.pack-display.v1')),prefs);
  assert.equal(await page.evaluate(()=>PlayroomPacks.list().find(p=>p.id==='ludo'&&p.active).version),'9.0.1');
  fail=false;await all.click();await page.waitForFunction(()=>PlayroomRemotePacks.pending().length===0);await page.waitForFunction(()=>!document.querySelector('[data-pack-update-all]'));
  assert.deepEqual(requests,['uno','ludo','uno']);
  for(let i=0;i<bundles.length;i++)assert(!await page.evaluate(({id,version})=>PlayroomPacks.list().some(p=>p.id===id&&p.version===version),{id:bundles[i].manifest.id,version:original[i]}));
 }finally{await context.close();await browser.close();await server.close();}
});
