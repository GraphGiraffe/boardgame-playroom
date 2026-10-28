'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
test('Mage Brawl WebRTC: concurrent private plans, bot settings and public Table',{timeout:90000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const pages=[],errors=[];
  for(const name of ['Анна','Борис','Стол']){const ctx=await browser.newContext({viewport:{width:1000,height:780},playroomProfile:false}),p=await ctx.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.goto(server.url);await p.locator('#profile-form input').fill(name);await p.locator('#profile-form').evaluate(f=>f.requestSubmit());pages.push(p);}
  const [host,phone,table]=pages;
  await host.locator('[data-start="mage-brawl"]').click();await host.locator('[data-room-option=transportMode]').check();
  await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-3',{kind:'bot',nickname:'Тактик'});b.renderLobby();});
  async function join(page){
   await host.locator('#network-pair-button').click();await host.locator('#net-host-token').waitFor();const offer=await host.locator('#net-host-token').inputValue();
   await page.locator('#network-join-button').click();await page.locator('[data-lobby-online=manual]').click();await page.locator('#net-client-offer textarea[name=offer]').fill(offer);await page.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
   await page.locator('#net-client-token').waitFor();await host.locator('#net-host-answer textarea[name=answer]').fill(await page.locator('#net-client-token').inputValue());await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());
   await page.locator('#net-client-join').waitFor();await page.locator('#net-client-join').evaluate(f=>f.requestSubmit());await page.locator('.lobby-shell').waitFor();
  }
  await join(phone);await phone.locator('[data-net-seat]:not([disabled])').first().click();await join(table);await table.locator('[data-net-action=table]').click();
  await phone.locator('[data-bot-settings]').click();assert.equal(await phone.locator('#bot-settings-form [name=nickname]').isDisabled(),true);assert.equal(await phone.locator('[form=bot-settings-form]').count(),0);await phone.locator('.modal [data-command=close-modal]').click();
  await host.locator('[data-bot-settings]').click();await host.locator('#bot-settings-form [value=tactician]').check();await host.locator('#bot-settings-form [name=difficulty]').fill('2');await host.locator('[form=bot-settings-form]').click();
  await phone.locator('[data-bot-settings]').waitFor();await phone.locator('[data-bot-settings]').click();assert.equal(await phone.locator('#bot-settings-form [name=difficulty]').inputValue(),'2');await phone.locator('.modal [data-command=close-modal]').click();
  await host.locator('[data-command=lobby-ready]').click();await phone.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();
  await phone.locator('.network-game .mage-grid').waitFor();await table.locator('.network-game[data-viewer="-1"] .mage-grid').waitFor();
  assert.equal(await table.locator('.mage-card').count(),0);assert.equal(await table.locator('.mage-controls [data-action]').count(),0);
  await host.locator('.mage-controls [data-action]').click();await host.waitForFunction(()=>[...document.querySelectorAll('.mage-controls [data-action]')].some(b=>b.getAttribute('aria-label')==='Изменить план'));
  assert.equal(await phone.locator('.mage-controls [data-action]').getAttribute('aria-label'),'Готово');assert.equal(await table.locator('.mage-revealed').count(),0,'public Table has no concealed plans');
  await host.locator('.mage-controls [data-action]').click();await host.locator('.mage-controls [data-action]').click();await phone.locator('.mage-controls [data-action]').click();
  for(const page of pages)await page.locator('.mage-revealed').first().waitFor({state:'attached'});
  assert.equal(await table.locator('.mage-card').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
