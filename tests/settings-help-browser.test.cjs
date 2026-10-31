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


test('welcome account returns to unsaved profile; local play has no cloud requests and compact settings fit 320px',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(process.env.PLAYROOM_BROWSER_ROOT||root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:320,height:740},playroomProfile:false}),page=await context.newPage(),requests=[];page.setDefaultTimeout(6000);
 await context.route('https://geurlwivdiqboylciqhl.supabase.co/**',route=>{requests.push(route.request().url());return route.abort();});
 try{
  await page.goto(server.url);await page.locator('#profile-form').waitFor();await page.locator('[name=playerName]').fill('Новичок');
  await page.locator('.modal-head [data-account-open]').click();await page.locator('.account-modal').waitFor();await page.locator('.account-modal [data-command=close-modal]').click();
  assert.equal(await page.locator('[name=playerName]').inputValue(),'Новичок');assert.match(await page.locator('#profile-form [type=submit],button[form=profile-form]').innerText(),/без облака/);await page.locator('#profile-form [type=submit],button[form=profile-form]').click();
  await page.evaluate(()=>PlayroomLobbyNetwork.incoming());await page.locator('[data-incoming-content] [data-account-open]').waitFor();assert.equal(await page.locator('[data-lobby-join-code]').count(),0);assert.equal(await page.locator('[data-lobby-online=manual]').count(),1);await page.locator('.modal-head [data-command=close-modal]').click();
  await page.locator('[data-start=uno]').first().click();assert(await page.locator('[name=room-mode][value=online]').isDisabled());await page.locator('.room-setup-modal [data-command=settings]').click();
  assert(await page.locator('#setting-hand-shape').isChecked());assert.match(await page.locator('#setting-hand-shape').locator('..').innerText(),/Рука веером/);
  assert.match(await page.locator('#setting-last-game').locator('..').innerText(),/Недавняя игра/);assert.match(await page.locator('#setting-quick-play').locator('..').innerText(),/Быстрый ход/);
  assert(await page.locator('.modal-head').evaluate(e=>{const title=e.querySelector('h2').getBoundingClientRect();return [...e.querySelectorAll('button')].every(button=>{const r=button.getBoundingClientRect();return r.right<=title.left+1||r.left>=title.right-1;});}),'header buttons never overlap settings title');
  const row=page.locator('.settings-guide-row');assert(await row.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.children].every(n=>{const r=n.getBoundingClientRect();return r.top>=b.top&&r.bottom<=b.bottom&&r.right<=b.right+1;})&&b.height<=46;}),'learning fits one row');
  assert(await row.locator('.icon-btn').evaluateAll(nodes=>nodes.every(e=>e.getBoundingClientRect().width<=34)));
  assert.deepEqual(await row.locator(':scope > button,:scope > input').evaluateAll(nodes=>nodes.map(e=>e.hasAttribute('data-restart-guides')?'reset':e.hasAttribute('data-learning-list')?'list':'checkbox')),['reset','list','checkbox']);
  assert(await page.locator('#setting-learning-enabled').evaluate(e=>Math.abs(e.getBoundingClientRect().right-document.getElementById('setting-quick-play').getBoundingClientRect().right)<1),'checkbox aligns with other settings');
  const enabled=await page.locator('#setting-learning-enabled').isChecked();await row.locator('[data-restart-guides]').click();assert.equal(await page.locator('#app-confirm-title').innerText(),'Сбросить обучение?');await page.locator('[data-confirm-cancel]').click();assert.equal(await page.locator('#setting-learning-enabled').isChecked(),enabled);

  await row.locator('.rule-help>button').click();assert.match(await page.locator('.mini-help-popover:popover-open').innerText(),/Прогресс сохраняется/);await page.keyboard.press('Escape');
  assert(await page.locator('.settings-range:not(:has(.settings-range-bounds)) .settings-range-track').evaluateAll(nodes=>nodes.every(e=>e.getBoundingClientRect().height<=29)));
  await page.locator('[data-command=reset-settings]').click();assert.match(await page.locator('#app-confirm-title').innerText(),/Сбросить настройки/);await page.locator('[data-confirm-cancel]').click();assert(await page.locator('.settings-overview').isVisible());
  for(const width of [320,390]){await page.setViewportSize({width,height:740});
   assert(await page.locator('.settings-quick .icon-btn').evaluateAll((nodes,width)=>nodes.every(e=>{const r=e.getBoundingClientRect(),radius=parseFloat(getComputedStyle(e).borderRadius);return Math.abs(r.width-(width<=360?32:44))<1&&Math.abs(r.height-r.width)<1&&(width<=360?radius>=16:radius<r.width/2);}),width),'adaptive shortcut buttons '+width);
   assert(await page.locator('.modal-head').evaluate(e=>{const title=e.querySelector('h2').getBoundingClientRect();return [...e.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect();return r.right<=title.left+1||r.left>=title.right-1;});}),'settings heading fits '+width);
   await page.screenshot({path:path.resolve(root,'../tmp_files/themes-020/settings-compact-'+width+'.png')});}
  const nickname=page.locator('.settings-overview input[name=nickname]');assert.equal(await page.locator('.settings-overview .lobby-profile button[type=submit]').count(),0);
  await nickname.fill('Новое имя');await nickname.blur();assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().name),'Новичок','draft is not saved on blur');
  await page.locator('.modal-head [data-command=close-modal]').click();assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().name),'Новое имя');assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.id===PlayroomAppBridge.participantId()).nickname),'Новое имя');
  await page.locator('.room-setup-modal [data-command=settings]').click();assert.equal(await page.locator('.settings-overview input[name=nickname]').inputValue(),'Новое имя');await page.locator('.settings-overview input[name=nickname]').fill('Другое имя');await page.locator('[data-account-open]').click();await page.locator('.account-modal [data-command=close-modal]').click();assert.equal(await page.locator('.settings-overview input[name=nickname]').inputValue(),'Другое имя');assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().name),'Другое имя');
  assert.deepEqual(requests,[]);
 }finally{await context.close();await browser.close();await server.close();}
});
