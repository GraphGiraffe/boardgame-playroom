'use strict';
const TestUI=require('./browser-origin.cjs');
const {selectChoice,readChoice,activeSurface:active}=TestUI;
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/snakes/rules.js');
const root = path.resolve(__dirname, '..');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.join(root, 'index.html')).href;

// Persistent browser storage on file:// is implementation-dependent. Exercise
// navigation and durable saved-game reloads at a stable PWA-like HTTP origin.
function serveSavedGames() {
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  const server=http.createServer((req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    const rel=pathname==='/'?'index.html':pathname.slice(1);
    const filename=path.resolve(root,rel);
    const allowed=rel==='index.html'||rel==='installed-packs.js'||['core/messages.js','app/','core/','application/','presentation/','platform/','packs/'].some(prefix=>rel.startsWith(prefix));
    if(!allowed||!filename.startsWith(root+path.sep)||!fs.existsSync(filename)||!fs.statSync(filename).isFile()){
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':(types[path.extname(filename)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});
    res.end(fs.readFileSync(filename));
  });
  return new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>resolve({server,url:`http://127.0.0.1:${server.address().port}/`}));
  });
}


async function localContext(browser,options){const context=await browser.newContext(options);await context.addInitScript(()=>localStorage.setItem('playroom.settings.v1',JSON.stringify({...JSON.parse(localStorage.getItem('playroom.settings.v1')||'{}'),tutorialsEnabled:false})));await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));await context.route(/https:\/\/[^/]+\.supabase\.co\//,r=>r.abort());return context;}
async function gameAction(page,command){const unlock=page.locator('.handoff [data-command=unlock]');if(await unlock.count())await unlock.click();if(!await active(page).locator('.game-menu-panel').count())await page.locator('[data-game-menu]').click();await active(page).locator('[data-game-menu-action][data-command="'+command+'"]').click();}
async function nativePress(locator){return await locator.page().evaluate(()=>navigator.maxTouchPoints>0)?locator.tap():locator.click();}
async function savedAction(page,id,action){const selector='[data-'+action+'-id="'+id+'"]';if(!await active(page).locator(selector).count())await page.locator('.saved-game[data-session-id="'+id+'"]').click();await nativePress(active(page).locator(selector));}
async function currentSave(page){await TestUI.ready(page);return page.evaluate(async()=>{const L=PlayroomAppBridge.saveLibrary;await L.storage().queue;const current=L.current();return current?{id:current.id,saved:current.session.export()}:null;});}
async function persistedSaveIds(page){await TestUI.ready(page);return page.evaluate(async()=>{await PlayroomAppBridge.saveLibrary.storage().queue;const disk=new PlayroomDataStorage({legacy:{length:0,key:()=>null,getItem:()=>null,removeItem(){}}});await disk.open();try{return new PlayroomLibrary(()=>disk,TabletopCore,TabletopSession,PlayroomAppBridge.packs).records().map(r=>r.id).sort();}finally{disk.db.close();}});}
async function ready(page){await TestUI.ready(page);if(await active(page).locator('.result-modal').count())await active(page).locator('.modal-head [data-command=close-modal]').click();const back=page.locator('.game-frame-tools [data-command=history-close]');if(await back.count())await back.click();if(await page.locator('.table-shell').count())await gameAction(page,'home');await page.locator('[data-hub-page=games]').click();await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{for(const game of PlayroomAppBridge.packs.list())PlayroomFirstTurnGuide.setEnabled(game.id,false);});}

test('The hub navigation remains available on phones and desktop', {timeout:120000}, async t => {
  const browser = await chromium.launch({headless:true, executablePath:executablePath(), args:['--no-sandbox','--disable-background-networking']});
  const navigationServer=url.startsWith('file:')?await serveSavedGames():null,navigationUrl=navigationServer?.url||url;
  try {
    for (const [width,height] of [[320,740],[390,740],[740,390],[768,1024],[1024,768],[1440,900]]) await t.test(`navigation at ${width}px`, async () => {
      const mobile=width<=760, context=await localContext(browser,{viewport:{width,height},hasTouch:mobile,isMobile:mobile});
      const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
      const press=async locator=>mobile?locator.tap():locator.click();
      try {
        await page.goto(navigationUrl);await ready(page);
        const capture=async name=>{if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`${name}-${width}x${height}.png`)});}};await capture('hub');
        const nav=page.locator('.hub-navigation-v021 .hub-page-tabs'),totalGames=await page.locator('.game-tile').count(),cardGames=await page.locator('.game-tile:has(.catalog-card-type[data-catalog-tag=cards])').count();
        assert.equal(await nav.isVisible(),true);assert.deepEqual(await nav.locator('button').allTextContents(),['Игры','Мои партии','Общение','Параметры']);
        for(const button of await nav.locator('button').all()){const b=await button.boundingBox();assert(b.width>=44&&b.height>=44&&b.x>=0&&b.x+b.width<=width+1&&b.y>=0&&b.y+b.height<=height+1);}
        await press(nav.locator('[data-hub-page=sessions]'));await page.locator('.saved-games-list').waitFor();assert.equal(await page.locator('.saved021-empty').isVisible(),true);await capture('sessions');
        await press(nav.locator('[data-hub-page=profile]'));await press(page.locator('[data-appearance-open]'));await active(page).locator('.appearance-gallery-modal').waitFor();await capture('appearance');await active(page).locator('.modal-head [data-command=close-modal]').click();
        for(const command of ['packs','settings']){if(command==='packs')await TestUI.openPacks(page);else await TestUI.openSettings(page);await capture(command);await active(page).locator('.modal-head [data-command=close-modal]').click();}
        await press(nav.locator('[data-hub-page=games]'));await press(page.locator('[data-hub-filters-toggle]'));await press(active(page).locator('[data-catalog-filter-kind=type][data-catalog-filter-value=cards]'));await press(active(page).locator('[data-catalog-filter-apply]'));assert.equal(await page.locator('.game-tile').count(),cardGames);
        await press(page.locator('[data-hub-filters-toggle]'));await press(active(page).locator('[data-catalog-filter-reset]'));await press(active(page).locator('[data-catalog-filter-apply]'));assert.equal(await page.locator('.game-tile').count(),totalGames);
        if(mobile&&height>=width){await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));const tail=await page.locator('.game-tile').last().boundingBox(),bar=await nav.boundingBox();assert(tail.y+tail.height<=bar.y+1||tail.x+tail.width<=bar.x+1||tail.x>=bar.x+bar.width-1||tail.y>=bar.y+bar.height-1,'navigation must not cover final catalog content');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.evaluate(()=>scrollTo(0,0));}
        await TestUI.openGame(page,'uno','hotseat');await active(page).locator('[data-command=room-help]').click();assert((await active(page).innerText()).length>100);await capture('help');await active(page).locator('.modal-head [data-command=close-modal]').click();
        await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});b.renderLobby();});await press(page.locator('[data-command=lobby-start]'));await press(page.locator('.handoff [data-command=unlock]'));await page.locator('.uno-scene').waitFor();assert.equal(await page.locator('.hub-navigation-v021').count(),0);
        const sessionId=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.currentId());await gameAction(page,'home');await press(page.locator('[data-hub-page=sessions]'));assert.equal(await page.locator('.saved-game[data-session-id]').count(),1);await savedAction(page,sessionId,'resume');await press(page.locator('.handoff [data-command=unlock]'));await page.locator('.uno-scene').waitFor();await gameAction(page,'room');const restoredRoom=await page.evaluate(()=>PlayroomAppBridge.room());assert.equal(restoredRoom.phase,'playing');await active(page).locator('.modal-head [data-command=close-modal]').click();assert.equal(await page.locator('.uno-scene').count(),1,'closing the native Room panel retains the live game');
        await gameAction(page,'home');await page.evaluate(()=>sessionStorage.clear());await page.reload();await ready(page);await press(page.locator('[data-hub-page=sessions]'));assert.equal(await page.locator('.saved-game[data-session-id]').count(),1);await savedAction(page,sessionId,'resume');await press(page.locator('.handoff [data-command=unlock]'));await page.locator('.uno-scene').waitFor();await gameAction(page,'room');assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().id),restoredRoom.id);await page.keyboard.press('Escape');assert.equal(await page.locator('.uno-scene').count(),1);
        assert.deepEqual(errors,[]);
      } finally { await context.close(); }
    });
    await t.test('Several same-game sessions survive switching, reload and confirmed deletion with hidden-hand privacy',async()=>{
      const hosted=url.startsWith('file:')?await serveSavedGames():null;
      const testUrl=hosted?.url||url;
      const context=await localContext(browser,{viewport:{width:390,height:740},hasTouch:true,isMobile:true});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
      const press=locator=>locator.tap();
      const current=()=>currentSave(page);
      const home=async()=>{if(await page.locator('.table-shell').count())await gameAction(page,'home');else await page.locator('[data-hub-page=games]').tap();};
      const list=async()=>{await home();await page.locator('[data-hub-page=sessions]').tap();await page.locator('.saved-games-list').waitFor();};
      const row=id=>page.locator(`.saved-game[data-session-id="${id}"]`);
      const ids=()=>page.locator('.saved-game[data-session-id]').evaluateAll(rows=>rows.map(row=>row.dataset.sessionId).sort());
      const persistedIds=()=>persistedSaveIds(page);
      const create=async(game,name,{hidden=false,preset='classic'}={})=>{
        await home();await TestUI.openGame(page,game,'hotseat');
        await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command=room-rules]').click();await selectChoice(page.locator('[name=preset]'),preset);await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
        await page.evaluate(name=>{const b=PlayroomAppBridge,r=b.room();b.roomService.rename(r.id,r.ownerId,name);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:name+' · друг'});b.renderLobby();},name);
        await press(page.locator('[data-command=lobby-start]'));
        if(['uno','domino','durak'].includes(game)){await page.locator('.handoff').waitFor();if(hidden)assert.equal(await page.locator('.hand-track .uno-card').count(),0);await press(page.locator('[data-command=unlock]'));}
        await page.locator(`.${game}-scene`).waitFor();return current();
      };
      try{
        await page.goto(testUrl);
        await page.evaluate(()=>{
          localStorage.clear();
          localStorage.setItem('playroom.settings.v1',JSON.stringify({animationSpeed:'instant',sound:false,tutorialsEnabled:false}));
        });
        await page.reload();await ready(page);
        await create('uno','Первая');
        await press(page.locator('.stock-button[data-action]'));
        await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);
        await page.locator('.scene[aria-busy=false]').waitFor();
        const first=await current();
        await gameAction(page,'pause');
        const second=await create('uno','Вторая',{hidden:true,preset:'quick'});
        const third=await create('snakes','Третья');
        assert.equal(new Set([first.id,second.id,third.id]).size,3,'Same game must receive independent session identities');
        await list();assert.deepEqual(await ids(),[first.id,second.id,third.id].sort());
        assert.match(await row(first.id).innerText(),/Первая/);assert.match(await row(second.id).innerText(),/Вторая/);
        if(process.env.PLAYROOM_CAPTURE_DIR){
          await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'playroom-v0.6-sessions-phone.png'),fullPage:true});
          await page.setViewportSize({width:1440,height:900});
          await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'playroom-v0.6-sessions-desktop.png'),fullPage:true});
          await page.setViewportSize({width:390,height:740});
        }
        await savedAction(page,first.id,'resume');await page.locator('.handoff [data-command=unlock]').tap();await page.locator('.uno-scene').waitFor();
        assert.deepEqual(await current(),first,'First UNO must resume its own history, cards and preset');
        assert.equal(await page.locator('.pause-cover').count(),0,'Explicit resume leaves the paused hub session playable');
        await list();await savedAction(page,second.id,'resume');
        await page.locator('.handoff').waitFor();assert.equal(await page.locator('.hand-track .uno-card').count(),0);
        await press(page.locator('[data-command=unlock]'));assert.deepEqual(await current(),second);
        assert.equal(await page.locator('.hand-track .uno-card').count(),5);
        await list();await page.reload();await ready(page);await press(page.locator('[data-hub-page=sessions]'));await page.locator('.saved-games-list').waitFor();
        assert.deepEqual(await ids(),[first.id,second.id,third.id].sort());
        await savedAction(page,second.id,'resume');await page.locator('.handoff').waitFor();
        assert.equal(await page.locator('.hand-track .uno-card').count(),0,'Reload must not bypass the private hand curtain');
        await press(page.locator('[data-command=unlock]'));assert.deepEqual(await current(),second);
        await list();await savedAction(page,first.id,'delete');
        await active(page).locator('[data-delete-confirm]').waitFor();assert.equal(await page.locator('.saved-game').count(),3,'Opening confirmation must not delete');
        await press(active(page).locator('.modal-head [data-command=close-modal]'));assert.equal(await page.locator('.saved-game').count(),3);
        await savedAction(page,first.id,'delete');await press(active(page).locator('[data-delete-confirm]'));
        await page.waitForFunction(()=>document.querySelectorAll('.saved-game[data-session-id]').length===2);
        const survivors=[second.id,third.id].sort();
        assert.deepEqual(await ids(),survivors);assert.deepEqual(await current(),second,'Deleting an inactive session must preserve the active save');
        assert.deepEqual(await persistedIds(),survivors,'Both remaining save records must exist on disk before reload');
        await page.reload();
        assert.deepEqual(await persistedIds(),survivors,'Reload must not lose the active or paused raw saves');
        await press(page.locator('[data-hub-page=sessions]'));await page.locator('.saved-games-list').waitFor();
        assert.deepEqual(await ids(),survivors,'Saved-game UI must show the same surviving records after reload');
        await savedAction(page,second.id,'delete');await press(active(page).locator('[data-delete-confirm]'));
        await page.waitForFunction(()=>document.querySelectorAll('.saved-game[data-session-id]').length===1);
        await page.reload();await ready(page);await press(page.locator('[data-hub-page=sessions]'));await page.locator('.saved-games-list').waitFor();
        assert.deepEqual(await ids(),[third.id],'Deleted active session must not return through pagehide autosave');
        await savedAction(page,third.id,'resume');await page.locator('.snakes-scene').waitFor();assert.deepEqual(await current(),third);
        assert.deepEqual(errors,[]);
      }finally{
        await context.close();
        if(hosted)await new Promise(resolve=>hosted.server.close(resolve));
      }
    });
    await t.test('Completed result returns to the menu and remains in read-only history after reload',async()=>{
      const completed=new Session(Core,'snakes',{seed:17,mode:'pass',preset:'classic',boardSize:64,players:[{name:'Финиш'},{name:'Соперник'}]});
      let penultimate;
      for(let i=0;i<1000&&completed.current.status==='playing';i++){
        // Export while this is still the current state, before its journal is compacted.
        penultimate=completed.export();completed.act(completed.current.turn,Core.botAction(completed.current));
      }
      assert.equal(completed.current.status,'finished');
      const finalStates=completed.export().states;
      // Check durable saved-game recovery on a stable PWA-like HTTP origin.
      const hosted=url.startsWith('file:')?await serveSavedGames():null;
      const context=await localContext(browser,{viewport:{width:320,height:740},hasTouch:true,isMobile:true});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
      const current=()=>TestUI.currentSession(page);
      try{
        await page.goto(hosted?.url||url);
        await ready(page);await page.evaluate(async saved=>{await PlayroomAppBridge.saveLibrary.activateAsync(TabletopSession.restore(TabletopCore,saved),'qa-completion');PlayroomAppBridge.showSessions();},penultimate);
        await page.reload();await ready(page);await page.locator('[data-hub-page=sessions]').tap();await page.locator('.saved-games-list').waitFor();const pending=page.locator('.saved-game[data-session-id]');assert.equal(await pending.count(),1,'the unfinished local game survives a real durable reload');await savedAction(page,'qa-completion','resume');const unlock=page.locator('.handoff [data-command=unlock]');if(await unlock.count())await unlock.tap();await page.locator('.scene[aria-busy=false]').waitFor();await page.locator('.die[data-action]').tap();await active(page).locator('.result-modal').waitFor();
        const expected=await current();assert.deepEqual(expected.states,finalStates,'the visible final move reaches the expected finished result');
        await active(page).locator('.result-modal .modal-head [data-command=close-modal]').tap();await page.locator('[data-game-menu]').tap();const menu=active(page).locator('[data-game-menu-action][data-command=home]');
        assert.equal((await menu.locator('strong').innerText()).trim(),'На главный экран');
        await menu.scrollIntoViewIfNeeded();const bounds=await menu.boundingBox();
        assert(bounds.width>=44&&bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=320+1,'result menu action remains reachable at 320px');
        await menu.tap();await page.locator('.game-tile').first().waitFor();
        assert.equal(await active(page).count(),0,'returning to the hub dismisses the result modal');
        assert.equal(await page.locator('#app').getAttribute('inert'),null,'hub controls become usable again');
        assert.deepEqual(await current(),expected,'returning to the menu preserves the completed result and replay');
        for(let visit=0;visit<2;visit++){
          await page.locator('[data-hub-page=sessions]').tap();await page.locator('.saved-games-list').waitFor();
          await page.locator('[data-saved-status=history]').tap();const row=page.locator('.saved-game[data-session-id]');assert.equal(await row.count(),1);assert.match(await row.locator('.saved021-summary').innerText(),/На устройстве.*Завершена/);await row.tap();assert.equal(await active(page).locator('[data-resume-id]').count(),0,'completed history cannot continue');assert.equal(await active(page).locator('[data-history-id]').getAttribute('aria-label'),'Просмотреть');await active(page).locator('[data-history-id]').tap();await page.locator('#replay-range').waitFor();assert.equal(await page.locator('#replay-range').inputValue(),String(expected.states.length-1));assert.equal(await page.locator('.scene [data-action]').count(),0);await page.locator('#replay-range').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#replay-range').inputValue(),'0');assert.deepEqual(await current(),expected,'history inspection preserves completed session');await page.reload();await ready(page);
        }
        assert.deepEqual(await current(),expected);assert.deepEqual(errors,[]);
      }finally{
        await context.close();
        if(hosted)await new Promise(resolve=>hosted.server.close(resolve));
      }
    });
  } finally { await browser.close();if(navigationServer)await new Promise(resolve=>navigationServer.server.close(resolve)); }
});

test('Every visible part of each hub tile opens its game setup', {timeout:120000}, async t => {
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hosted=url.startsWith('file:')?await serveSavedGames():null;
  try {
    for(const mobile of [false,true]) await t.test(mobile?'native touch on card contents':'mouse on card contents',async()=>{
      const context=await localContext(browser,{viewport:mobile?{width:390,height:740}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});
      const page=await context.newPage();page.setDefaultTimeout(5000);
      try {
        await page.goto(hosted?.url||url);await ready(page);
        for(const game of ['uno','domino','durak','checkers','snakes'])for(const part of ['.catalog-card-players','.catalog-card-title','.catalog-card-description','.catalog-card-mechanic','.catalog-card-art']){
          const target=page.locator(`[data-game=${game}] ${part}`);
          if(part==='.catalog-card-mechanic'&&!await target.count())continue;
          await page.mouse.wheel(0,-1);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await target.evaluate(el=>el.scrollIntoView({block:'center'}));await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
          const p=await target.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
          assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.game-tile')?.dataset.game,p),game,`${game} ${part} must hit launch button`);
          if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
          await active(page).locator('[data-game-mode=hotseat]').click();await active(page).locator('.room-v021').waitFor();assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().game.id),game);
          assert.equal(await page.evaluate(()=>getSelection().toString()),'');
          await active(page).locator('[data-room-context]').click();await active(page).locator('[data-command=lobby-leave]').click();const confirm=active(page).locator('[data-command=confirm-operation],[data-confirm-accept]');if(await confirm.count())await confirm.click();await page.locator('[data-hub-page=games]').waitFor();
        }
        const selectability=await page.locator('.game-tile').evaluateAll(tiles=>tiles.map(el=>getComputedStyle(el).userSelect));
        assert(selectability.every(value=>value==='none'));
      } finally {await context.close();}
    });
  } finally {await browser.close();if(hosted)await new Promise(resolve=>hosted.server.close(resolve));}
});
