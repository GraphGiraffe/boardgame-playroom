'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.PLAYROOM_HUB_SWIPE_REPORT_DIR||path.join(root,'../tmp_files/guide-readiness-1110/phone_boards/hub'));
async function fixture(run){
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,serviceWorkers:'block'}),net=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}})),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(7000);
 await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'hub-gesture',name:'Проверка'}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false}));});
 if(process.env.PLAYROOM_TEST_ARTIFACT)await page.route(server.url,route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(process.env.PLAYROOM_TEST_ARTIFACT)}));await page.goto(server.url);await page.locator('.game-tile').first().waitFor();fs.mkdirSync(out,{recursive:true});const cdp=await context.newCDPSession(page);
 await run({page,cdp,context});assert.deepEqual(errors,[]);assert.equal(net.nativeSupabaseRequests,0);
 }finally{await browser.close();await server.close();}
}
async function touch(cdp,page,from,to){
 const point=(x,y)=>({x,y,id:1,radiusX:2,radiusY:2,force:1});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(from.x,from.y)]});
 for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(from.x+(to.x-from.x)*i/8,from.y+(to.y-from.y)*i/8)]});await page.waitForTimeout(20);}
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(380);
}
const destination=page=>page.locator('.hub-shell-v021').getAttribute('data-hub-destination');
async function freePoint(page){return page.evaluate(()=>{for(const y of [280,420,560,650,200])for(const x of [220,180,130]){const n=document.elementFromPoint(x,y);if(n?.closest('.hub-pages>.shared-page-panel.is-active')&&!n.closest('button,a,input,textarea,select,[data-social-actions]'))return{x,y};}return null;});}
async function swipe(page,cdp,direction){const p=await freePoint(page);assert(p,'an exposed page background is available for a page gesture');await touch(cdp,page,p,{x:p.x+(direction==='left'?-120:120),y:p.y});}
async function tab(page,id){await page.locator('[data-hub-page='+id+']').tap();await page.waitForFunction(id=>document.querySelector('.hub-shell-v021')?.dataset.hubDestination===id,id);await page.waitForTimeout(100);}
async function position(page,top){await page.evaluate(top=>window.scrollTo({top,behavior:'instant'}),top);await page.waitForTimeout(100);return page.evaluate(()=>scrollY);}

test('hub smartphone swipes reuse tabs and preserve independent page scroll through back and refresh',{timeout:75000},()=>fixture(async({page,cdp})=>{
 // Controlled long pages isolate the scroll-memory contract from account data
 // availability; all navigation, scrolling, surfaces and gestures stay native.
 await page.addStyleTag({content:'.hub-pages>.shared-page-panel{min-height:2400px}'});
 const recorded={},visited=[];
 for(const [index,id]of ['games','sessions','social','profile'].entries()){
  await tab(page,id);recorded[id]=await position(page,180+index*170);visited.push({id,scroll:recorded[id]});
 }
 for(const id of ['social','sessions','games']){await swipe(page,cdp,'right');assert.equal(await destination(page),id);assert(Math.abs(await page.evaluate(()=>scrollY)-recorded[id])<2,id+' restores its own scroll position');}
 await tab(page,'sessions');assert(Math.abs(await page.evaluate(()=>scrollY)-recorded.sessions)<2);
 await page.evaluate(()=>setTimeout(()=>PlayroomAppBridge.showSessions(),0));await page.waitForTimeout(150);assert(Math.abs(await page.evaluate(()=>scrollY)-recorded.sessions)<2,'late rerender retains the active page scroll');
 await tab(page,'profile');await page.evaluate(()=>history.back());await page.waitForFunction(()=>document.querySelector('.hub-shell-v021')?.dataset.hubDestination==='games');assert(Math.abs(await page.evaluate(()=>scrollY)-recorded.games)<2,'application Back restores the remembered games page');
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);await tab(page,'social');const landscapeSocial=await position(page,420);await swipe(page,cdp,'left');assert.equal(await destination(page),'profile');await swipe(page,cdp,'right');assert.equal(await destination(page),'social');assert(Math.abs(await page.evaluate(()=>scrollY)-landscapeSocial)<2,'landscape returns to its own page position');
 const tabs=page.locator('.hub-page-tabs');assert.equal(await tabs.getAttribute('role'),'tablist');assert.equal(await tabs.getAttribute('aria-orientation'),'vertical');await page.locator('[data-hub-page=social]').focus();await page.keyboard.press('ArrowDown');assert.equal(await destination(page),'profile');assert.equal(await page.evaluate(()=>document.activeElement.dataset.hubPage),'profile');await page.keyboard.press('Home');assert.equal(await destination(page),'games');assert.equal(await page.locator('[data-hub-page=games]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('.hub-page-tabs [role=tab][tabindex="0"]').count(),1);assert.equal(await page.locator('#hub-games-page').getAttribute('aria-labelledby'),'hub-tab-games');
 await page.locator('#hub-games-page').evaluate(n=>Promise.all(n.getAnimations().map(a=>a.finished.catch(()=>{}))));await page.screenshot({path:path.join(out,'hub-landscape.png')});await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await tabs.getAttribute('aria-orientation'),'horizontal');
 // Reload preserves the existing app policy: it opens Games; page offsets have
 // been session-local before this feature and are not added to durable storage.
 await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await destination(page),'games');
 fs.writeFileSync(path.join(out,'scroll.json'),JSON.stringify({recorded,visited,landscapeSocial,back:true,asyncRerender:true,keyboard:true,reloadDefault:true},null,2));
}));

test('hub touch page gestures preserve vertical scroll, card taps, nested controls and modal ownership',{timeout:60000},()=>fixture(async({page,cdp})=>{
 const card=page.locator('.game-tile').first();await card.scrollIntoViewIfNeeded();const box=await card.boundingBox(),from={x:Math.min(362,box.x+box.width*.82),y:box.y+Math.min(46,box.height/2)};
 await touch(cdp,page,from,{x:from.x-110,y:from.y});assert.equal(await destination(page),'sessions','horizontal card swipe navigates');assert.equal(await page.locator('#modal-root>*').count(),0,'the trailing compatibility click does not open a game');
 await tab(page,'games');await position(page,0);const before=await page.evaluate(()=>scrollY);await touch(cdp,page,{x:210,y:620},{x:205,y:230});assert.equal(await destination(page),'games');assert(await page.evaluate(()=>scrollY)>before+80,'vertical touch still scrolls normally');
 await position(page,0);await page.locator('.game-tile').first().tap();await page.locator('#modal-root .game-card-modal').waitFor();await touch(cdp,page,{x:300,y:350},{x:90,y:350});assert.equal(await destination(page),'games','modal owns its touch');await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').tap();
 await page.evaluate(()=>{const panel=document.querySelector('#hub-games-page');panel.insertAdjacentHTML('beforeend','<input data-swipe-fixture="range" type="range" min="0" max="100" value="0" style="position:fixed;left:45px;top:200px;width:280px;z-index:1000"><div data-swipe-fixture="carousel" style="position:fixed;left:45px;top:300px;width:280px;height:90px;overflow-x:auto;touch-action:pan-x;z-index:1000;background:var(--paper)"><div style="width:1000px;height:80px">Прокручиваемый ряд</div></div>');});
 const range=page.locator('[data-swipe-fixture=range]');await range.scrollIntoViewIfNeeded();const r=await range.boundingBox();await touch(cdp,page,{x:r.x+r.width*.1,y:r.y+r.height/2},{x:r.x+r.width*.9,y:r.y+r.height/2});assert.equal(await destination(page),'games');assert(Number(await range.inputValue())>40,'range retains native horizontal input');
 const carousel=page.locator('[data-swipe-fixture=carousel]');await carousel.scrollIntoViewIfNeeded();const c=await carousel.boundingBox();await touch(cdp,page,{x:c.x+c.width*.9,y:c.y+c.height/2},{x:c.x+c.width*.1,y:c.y+c.height/2});assert.equal(await destination(page),'games');assert(await carousel.evaluate(n=>n.scrollLeft)>80,'nested horizontal scrolling remains native');
 await page.evaluate(()=>document.querySelectorAll('[data-swipe-fixture]').forEach(n=>n.remove()));await page.locator('[data-edit-toggle]').tap();await card.scrollIntoViewIfNeeded();const edit=await card.boundingBox();await touch(cdp,page,{x:edit.x+edit.width*.8,y:edit.y+35},{x:edit.x+edit.width*.2,y:edit.y+35});assert.equal(await destination(page),'games','catalog editing is not a page gesture');
 await page.screenshot({path:path.join(out,'hub-phone.png')});fs.writeFileSync(path.join(out,'gestures.json'),JSON.stringify({cardSwipe:true,tap:true,vertical:true,range:true,carousel:true,modal:true,edit:true},null,2));
}));
