'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),zlib=require('node:zlib');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),UI=require('./browser-origin.cjs'),sync=require('./account-sync-fixture.cjs');
test('support report: phone form, actual screenshot compression, log review, private retry and volatile cleanup',{timeout:60000},async()=>{
 const server=await UI.serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();
 const user={id:'00000000-0000-4000-8000-000000000099',email:'fixture@example.test'},requests=[],pageErrors=[];let fail=true;
 page.on('pageerror',error=>pageErrors.push(error.message));page.setDefaultTimeout(5000);
 const evidence=path.resolve(__dirname,'../../tmp_files/bug-reports-1114'),prefix=process.env.SITE_URL?'public-':'';
 try{
  await context.addInitScript(user=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'support-fixture',name:'Проверка'}));localStorage.setItem('playroom.cloud-auth.v1:https://geurlwivdiqboylciqhl.supabase.co',JSON.stringify({access_token:'fixture-only',refresh_token:'fixture-only',expires_at:Date.now()+3600000,user}));},user);
  await sync.installFetch(context,sync(async route=>{
   const req=route.request(),url=req.url();let value={profile:{username:'fixture',nickname:'Проверка'},friends:[],rooms:[],invitations:[],requests:[],messages:[],groups:[]};
   if(url.includes('/auth/v1/user'))value=user;
   if(url.endsWith('/playroom_push'))value={ready:false};
   if(url.endsWith('/playroom_cloud_saves_rpc'))value={enabled:false,used:0,limit:10485760,entries:[]};
   if(url.endsWith('/playroom_bug_report')){const body=req.postDataJSON();requests.push(body.p_data);if(fail)return route.abort('internetdisconnected');value={id:body.p_data.id,accepted:true};}
   return route.fulfill({json:value});
  }));
  await page.goto(process.env.SITE_URL||server.url);await UI.ready(page);
  await UI.openSettings(page);let active=()=>UI.activeSurface(page);
  await active().locator('[data-settings-tab=behavior]').click();await active().locator('.settings-diagnostics>summary').click();await active().locator('#setting-diagnostics').check();
  const snapshot=await page.screenshot();
  assert.equal(await active().locator('[data-bug-report-open]').innerText(),'Обратная связь');await active().locator('[data-bug-report-open]').click();await active().locator('[data-bug-report]').waitFor();assert.equal(await active().locator('.modal-head h2').innerText(),'Обратная связь');assert.match(await active().locator('textarea').getAttribute('placeholder'),/предложите улучшение/);
  const form=()=>active().locator('[data-bug-report]');
  await form().locator('textarea').fill('После смены темы исчезли точки здоровья на фишках.');
  await form().locator('[name=includeLog]').waitFor({state:'visible'});assert.deepEqual(pageErrors,[]);await active().locator('[data-bug-send]').waitFor();await active().locator('[data-bug-send]').evaluate(button=>{if(!button.form)throw Error('Submit lost form owner');});await page.waitForFunction(()=>document.querySelector('[data-bug-send]')?.disabled===false);
  await form().locator('[data-bug-files]').setInputFiles(Array.from({length:4},(_,i)=>({name:i+'.png',mimeType:'image/png',buffer:snapshot})));
  assert.match(await form().locator('[data-bug-status]').innerText(),/не больше трёх/);assert.equal(await form().locator('img').count(),0);
  await form().locator('[data-bug-files]').setInputFiles(Array.from({length:3},(_,i)=>({name:i+'.png',mimeType:'image/png',buffer:snapshot})));
  await form().locator('img').nth(2).waitFor();assert(await form().locator('[data-bug-files]').isDisabled());
  await form().locator('[data-bug-remove="1"]').click();assert.equal(await form().locator('img').count(),2);
  await form().locator('.bug-report-info>summary').click();assert.match(await form().locator('[data-bug-context]').innerText(),/userAgent/);
  await page.screenshot({path:path.join(evidence,prefix+'form-phone.png'),fullPage:true});
  await active().locator('[data-bug-send]').click();await page.waitForFunction(()=>document.querySelector('[data-bug-status]')?.textContent.includes('Нет связи'));
  fail=false;await active().locator('[data-bug-send]').click();await active().getByText('Спасибо! Сообщение отправлено.').waitFor();
  const number=active().locator('[data-bug-number]');await number.click();assert.deepEqual(await number.evaluate(input=>[input.selectionStart,input.selectionEnd]),[0,8]);assert.equal(await number.inputValue(),requests[1].id.slice(0,8));
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:new URL(process.env.SITE_URL||server.url).origin});await active().locator('[data-bug-copy]').click();await active().getByText('Номер скопирован.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),requests[1].id.slice(0,8));
  await page.screenshot({path:path.join(evidence,prefix+'receipt-copy.png'),fullPage:true});
  assert.equal(requests.length,2);assert.equal(requests[0].id,requests[1].id);assert.equal(requests[1].screenshots.length,2);assert(requests[1].log);
  for(const screenshot of requests[1].screenshots){assert.equal(screenshot.mime,'image/webp');assert(Buffer.from(screenshot.data,'base64').length<=144*1024);assert(screenshot.width<=1280&&screenshot.height<=1280);}
  const log=JSON.parse(zlib.gunzipSync(Buffer.from(requests[1].log,'base64')));assert(log.events.length>0);assert(log.events.some(e=>e.kind==='input'));assert(!JSON.stringify(requests[1]).includes('fixture-only'));assert(!JSON.stringify(requests[1]).includes('fixture@example.test'));assert.equal(log.game,undefined);
  await active().locator('[data-command=close-modal]').click();await active().locator('[data-bug-report-open]').click();assert.equal(await form().locator('textarea').inputValue(),'');assert.equal(await form().locator('img').count(),0);
  await page.setViewportSize({width:740,height:390});assert(await active().locator('[data-bug-send]').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
  await active().locator('[data-command=close-modal]').click();await page.locator('[data-bug-report]').waitFor({state:'detached'});assert.equal(await page.locator('[data-bug-report]').count(),0);
  const storage=await page.evaluate(()=>JSON.stringify(Object.keys(localStorage).filter(k=>/bug|support/i.test(k))));assert.equal(storage,'[]');
  const report={status:'passed',requests:requests.length,screenshots:requests[1].screenshots.map(s=>({width:s.width,height:s.height,bytes:Buffer.from(s.data,'base64').length})),log:{events:log.events.length,rawBytes:Buffer.byteLength(JSON.stringify(log)),gzipBytes:Buffer.from(requests[1].log,'base64').length},pageErrors};
  fs.writeFileSync(path.join(evidence,prefix+'browser-report.json'),JSON.stringify(report,null,2));assert.deepEqual(pageErrors,[]);
 }finally{await context.close();await browser.close();await server.close();}
});
