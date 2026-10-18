'use strict';
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

// Persistent browser storage on file:// is implementation-dependent. Keep the
// file:// reload smoke above, and check the multi-save deletion lifecycle on
// a stable HTTP origin (the same deployment model as the installable PWA).
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

test('The hub navigation remains available on phones and desktop', {timeout:60000}, async t => {
  const browser = await chromium.launch({headless:true, executablePath:executablePath(), args:['--no-sandbox','--disable-background-networking']});
  try {
    for (const [width,height] of [[320,740],[390,740],[740,390],[768,1024],[1024,768],[1440,900]]) await t.test(`navigation at ${width}px`, async () => {
      const mobile=width<=760, context=await browser.newContext({viewport:{width,height},hasTouch:mobile,isMobile:mobile});
      const page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(5000);
      const press=async locator=>mobile?locator.tap():locator.click();
      try {
        await page.goto(url);
        const capture=async name=>{if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`${name}-${width}x${height}.png`)});}};await capture('hub');
        const nav=page.locator('.side-nav');
        assert.equal(await nav.isVisible(),true);
        assert.deepEqual(await nav.locator('button').allTextContents(),['Все игры','Мои партии','Темы и скины']);
        for (const button of await nav.locator('button').all()) {
          const b=await button.boundingBox(); assert(b.width>=44&&b.height>=44&&b.x>=0&&b.x+b.width<=width+1);
        }
        assert.equal(await nav.evaluate(e=>getComputedStyle(e).position),mobile?'fixed':'static');
        await press(nav.locator('[data-command=sessions]'));
        await page.locator('.saved-games-list').waitFor();
        assert.equal(await page.locator('.saved-empty').isVisible(),true);await capture('sessions');
        await press(nav.locator('[data-appearance-editor]'));await page.locator('.appearance-editor').waitFor();await capture('appearance');
        await press(page.locator('.appearance-dialog [data-appearance-action=close]'));
        await press(page.locator('.topbar [data-command=help]'));await page.locator('.help-grid').waitFor();await capture('help');
        await press(page.locator('.modal [data-command=close-modal]').first());
        await press(nav.locator('[data-command=home]'));
        for(const command of ['packs','settings']){await press(page.locator(`[data-command=${command}]`).first());await capture(command);await press(page.locator('.modal [data-command=close-modal]').first());}
        await press(page.locator('[data-tag-kind=type][data-tag=cards]')); assert.equal(await page.locator('.game-tile').count(),5);
        await press(nav.locator('[data-command=home]')); assert.equal(await page.locator('.game-tile').count(),12);
        if(mobile){
          await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
          const footer=await page.locator('.hub-footer').boundingBox(),bar=await nav.boundingBox();
          assert(footer.y+footer.height<=bar.y,'navigation must not cover the final hub content');
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
          await page.evaluate(()=>scrollTo(0,0));
        }
        await press(page.locator('[data-start=uno]'));await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command=room-rules]').click();await page.locator('[name=openHands]').check();await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
        await press(page.locator('[data-command=lobby-start]'));await page.locator('.uno-scene').waitFor();assert.equal(await page.locator('.side-nav').count(),0);
        await press(page.locator('.table-heading [data-command=home]'));await press(page.locator('.side-nav [data-command=sessions]'));await page.locator('.saved-games-list').waitFor();assert.equal(await page.locator('.saved-game[data-session-id]').count(),1);await press(page.locator('.saved-game [data-resume-id]'));await page.locator('.uno-scene').waitFor();
        await press(page.locator('.table-tools [data-command=room]'));
        const restoredRoom=await page.evaluate(()=>PlayroomAppBridge.room());
        assert.equal(restoredRoom.phase,'playing');
        await press(page.locator('.lobby-header [data-command=close-modal]'));
        assert.equal(await page.locator('.uno-scene').count(),1,'lobby dismissal returns to the game');
        // Persistent saves must survive without any test-only sessionStorage marker.
        await page.evaluate(()=>sessionStorage.clear());
        await page.reload();if(await page.locator('.handoff [data-command=unlock]').count())await press(page.locator('.handoff [data-command=unlock]'));if(await page.locator('.table-heading [data-command=home]').count())await press(page.locator('.table-heading [data-command=home]'));await press(page.locator('.side-nav [data-command=sessions]'));await page.locator('.saved-games-list').waitFor();assert.equal(await page.locator('.saved-game[data-session-id]').count(),1);await press(page.locator('.saved-game [data-resume-id]'));await page.locator('.uno-scene').waitFor();
        await press(page.locator('.table-tools [data-command=room]'));
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().id),restoredRoom.id);
        await page.keyboard.press('Escape');assert.equal(await page.locator('.uno-scene').count(),1);
        assert.deepEqual(errors,[]);
      } finally { await context.close(); }
    });
    await t.test('Several same-game sessions survive switching, reload and confirmed deletion with hidden-hand privacy',async()=>{
      const hosted=url.startsWith('file:')?await serveSavedGames():null;
      const testUrl=hosted?.url||url;
      const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
      const press=locator=>locator.tap();
      const current=()=>page.evaluate(()=>{
        const raw=JSON.parse(localStorage.getItem('playroom.session.v1'));
        return raw?{id:raw.libraryId,saved:TabletopSession.restore(TabletopCore,raw).export()}:null;
      });
      const home=async()=>{
        const table=page.locator('.table-heading [data-command=home]');
        await press(await table.count()?table:page.locator('.side-nav [data-command=home]'));
      };
      const list=async()=>{await home();await press(page.locator('.side-nav [data-command=sessions]'));await page.locator('.saved-games-list').waitFor();};
      const row=id=>page.locator(`.saved-game[data-session-id="${id}"]`);
      const ids=()=>page.locator('.saved-game[data-session-id]').evaluateAll(rows=>rows.map(row=>row.dataset.sessionId).sort());
      // Observe only save identities, never full state or hidden hands in logs.
      const persistedIds=()=>page.evaluate(()=>{
        const keys=['playroom.session.v1',...Object.keys(localStorage).filter(key=>key.startsWith('playroom.paused.v1.'))];
        return keys.map(key=>localStorage.getItem(key)).filter(Boolean).map(raw=>JSON.parse(raw).libraryId).sort();
      });
      const create=async(game,name,{hidden=false,preset='classic'}={})=>{
        await home();await press(page.locator(`.game-tile [data-start="${game}"]`).first());
        await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Игрок'});b.renderLobby();});await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});await page.locator('[data-command=room-rules]').click();await page.locator('[name=preset]').selectOption(preset);await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());
        await page.evaluate(name=>{const b=PlayroomAppBridge,r=b.room();b.roomService.rename(r.id,r.ownerId,name);b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:name+' · друг'});b.renderLobby();},name);
        if(['uno','domino','durak'].includes(game)){await page.locator('[data-command=room-rules]').click();if(hidden)await page.locator('[name=openHands]').uncheck();else await page.locator('[name=openHands]').check();await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());}
        await press(page.locator('[data-command=lobby-start]'));
        if(hidden){await page.locator('.handoff').waitFor();assert.equal(await page.locator('.hand-track .uno-card').count(),0);await press(page.locator('[data-command=unlock]'));}
        await page.locator(`.${game}-scene`).waitFor();return current();
      };
      try{
        await page.goto(testUrl);
        await page.evaluate(()=>{
          localStorage.clear();
          localStorage.setItem('playroom.settings.v1',JSON.stringify({animationSpeed:'instant',sound:false}));
        });
        await page.reload();
        await create('uno','Первая');
        await press(page.locator('.stock-button[data-action]'));
        await page.waitForFunction(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move===1);
        await page.locator('.scene[aria-busy=false]').waitFor();
        const first=await current();
        await press(page.locator('.table-tools [data-command=pause]'));
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
        await press(row(first.id).locator('[data-resume-id]'));await page.locator('.uno-scene').waitFor();
        assert.deepEqual(await current(),first,'First UNO must resume its own history, cards and preset');
        assert.equal(await page.locator('.pause-cover').count(),0,'Explicit resume leaves the paused hub session playable');
        await list();await press(row(second.id).locator('[data-resume-id]'));
        await page.locator('.handoff').waitFor();assert.equal(await page.locator('.hand-track .uno-card').count(),0);
        await press(page.locator('[data-command=unlock]'));assert.deepEqual(await current(),second);
        assert.equal(await page.locator('.hand-track .uno-card').count(),5);
        await list();await page.reload();if(await page.locator('.handoff [data-command=unlock]').count())await press(page.locator('.handoff [data-command=unlock]'));if(await page.locator('.table-heading [data-command=home]').count())await press(page.locator('.table-heading [data-command=home]'));await press(page.locator('.side-nav [data-command=sessions]'));await page.locator('.saved-games-list').waitFor();
        assert.deepEqual(await ids(),[first.id,second.id,third.id].sort());
        await press(row(second.id).locator('[data-resume-id]'));await page.locator('.handoff').waitFor();
        assert.equal(await page.locator('.hand-track .uno-card').count(),0,'Reload must not bypass the private hand curtain');
        await press(page.locator('[data-command=unlock]'));assert.deepEqual(await current(),second);
        await list();await press(row(first.id).locator('[data-delete-id]'));
        await page.locator('.modal [data-delete-confirm]').waitFor();assert.equal(await page.locator('.saved-game').count(),3,'Opening confirmation must not delete');
        await press(page.locator('.modal [data-command=close-modal]').first());assert.equal(await page.locator('.saved-game').count(),3);
        await press(row(first.id).locator('[data-delete-id]'));await press(page.locator('.modal [data-delete-confirm]'));
        await page.waitForFunction(()=>document.querySelectorAll('.saved-game[data-session-id]').length===2);
        const survivors=[second.id,third.id].sort();
        assert.deepEqual(await ids(),survivors);assert.deepEqual(await current(),second,'Deleting an inactive session must preserve the active save');
        assert.deepEqual(await persistedIds(),survivors,'Both remaining save records must exist on disk before reload');
        await page.reload();
        assert.deepEqual(await persistedIds(),survivors,'Reload must not lose the active or paused raw saves');
        await press(page.locator('.side-nav [data-command=sessions]'));await page.locator('.saved-games-list').waitFor();
        assert.deepEqual(await ids(),survivors,'Saved-game UI must show the same surviving records after reload');
        await press(row(second.id).locator('[data-delete-id]'));await press(page.locator('.modal [data-delete-confirm]'));
        await page.waitForFunction(()=>document.querySelectorAll('.saved-game[data-session-id]').length===1);
        await page.reload();if(await page.locator('.handoff [data-command=unlock]').count())await press(page.locator('.handoff [data-command=unlock]'));if(await page.locator('.table-heading [data-command=home]').count())await press(page.locator('.table-heading [data-command=home]'));await press(page.locator('.side-nav [data-command=sessions]'));await page.locator('.saved-games-list').waitFor();
        assert.deepEqual(await ids(),[third.id],'Deleted active session must not return through pagehide autosave');
        await press(row(third.id).locator('[data-resume-id]'));await page.locator('.snakes-scene').waitFor();assert.deepEqual(await current(),third);
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
      // Browser localStorage on file:// is not durable across navigation.
      // Check reload and saved-game recovery on a stable PWA-like HTTP origin.
      const hosted=url.startsWith('file:')?await serveSavedGames():null;
      const context=await browser.newContext({viewport:{width:320,height:740},hasTouch:true,isMobile:true});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
      const current=()=>page.evaluate(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).export());
      try{
        await page.goto(hosted?.url||url);
        await page.evaluate(saved=>{
          localStorage.clear();
          localStorage.setItem('playroom.settings.v1',JSON.stringify({animationSpeed:'instant',sound:false}));
          localStorage.setItem('playroom.session.v1',saved);
        },JSON.stringify(penultimate));
        await page.reload();
        if(await page.locator('.handoff [data-command=unlock]').count())await page.locator('.handoff [data-command=unlock]').tap();
        if(await page.locator('.table-heading [data-command=home]').count())await page.locator('.table-heading [data-command=home]').tap();
        // Resume via the persisted library entry, not the optional hero banner.
        // The saved-game record and the finished replay are still asserted.
        await page.locator('.side-nav [data-command=sessions]').tap();
        await page.locator('.saved-games-list').waitFor();
        const pending=page.locator('.saved-game[data-session-id] [data-resume-id]');
        assert.equal(await pending.count(),1,'the unfinished local game remains in the saved library after reload');
        await pending.first().tap();
        await page.locator('.die[data-action]').tap();await page.locator('.result-modal').waitFor();
        const expected=await current();assert.deepEqual(expected.states,finalStates,'the visible final move reaches the expected finished result');
        const menu=page.locator('.result-modal [data-command=home]');
        assert.equal((await menu.innerText()).trim(),'В меню');
        await menu.scrollIntoViewIfNeeded();const bounds=await menu.boundingBox();
        assert(bounds.width>=44&&bounds.height>=44&&bounds.x>=0&&bounds.x+bounds.width<=320+1,'result menu action remains reachable at 320px');
        await menu.tap();await page.locator('.game-tile').first().waitFor();
        assert.equal(await page.locator('.modal').count(),0,'returning to the hub dismisses the result modal');
        assert.equal(await page.locator('#app').getAttribute('inert'),null,'hub controls become usable again');
        assert.deepEqual(await current(),expected,'returning to the menu preserves the completed result and replay');
        for(let visit=0;visit<2;visit++){
          await page.locator('.side-nav [data-command=sessions]').tap();await page.locator('.saved-games-list').waitFor();
          const row=page.locator('.saved-game[data-session-id]');assert.equal(await row.count(),1);
          assert.equal((await row.locator('.saved-status .pill').innerText()).trim(),'Локальная · Завершена', 'The unified library identifies both save origin and completed status');
          assert.equal(await row.locator('[data-resume-id]').isDisabled(),true);
          assert.equal(await row.locator('[data-history-id]').getAttribute('aria-label'),'История партии');
          await row.locator('[data-history-id]').tap();await page.locator('#replay-range').waitFor();
          assert.equal(await page.locator('#replay-range').inputValue(),String(expected.states.length-1));
          assert.equal(await page.locator('.scene [data-action]').count(),0);
          await page.locator('#replay-range').focus();await page.keyboard.press('Home');
          assert.equal(await page.locator('#replay-range').inputValue(),'0');
          assert.deepEqual(await current(),expected,'History inspection must not modify the completed session');
          await page.reload();
          if(await page.locator('.handoff [data-command=unlock]').count())await page.locator('.handoff [data-command=unlock]').tap();
          if(await page.locator('.table-heading [data-command=history-close]').count())await page.locator('.table-heading [data-command=history-close]').tap();
          if(await page.locator('.result-modal [data-command=home]').count())await page.locator('.result-modal [data-command=home]').tap();
          else if(await page.locator('.table-heading [data-command=home]').count())await page.locator('.table-heading [data-command=home]').tap();
        }
        assert.deepEqual(await current(),expected);assert.deepEqual(errors,[]);
      }finally{
        await context.close();
        if(hosted)await new Promise(resolve=>hosted.server.close(resolve));
      }
    });
  } finally { await browser.close(); }
});

test('Every visible part of each hub tile opens its game setup', {timeout:120000}, async t => {
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  try {
    for(const mobile of [false,true]) await t.test(mobile?'native touch on card contents':'mouse on card contents',async()=>{
      const context=await browser.newContext({viewport:mobile?{width:390,height:740}:{width:1280,height:900},hasTouch:mobile,isMobile:mobile});
      const page=await context.newPage();page.setDefaultTimeout(5000);
      try {
        await page.goto(url);
        for(const game of ['uno','domino','durak','checkers','snakes'])for(const part of ['.tile-player-count','.tile-title','.tile-description','.tile-mechanics','.game-cover']){
          const target=page.locator(`[data-game=${game}] ${part}`);
          await target.evaluate(el=>el.scrollIntoView({block:'center'}));
          const p=await target.evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
          assert.equal(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.closest('.game-tile')?.dataset.game,p),game,`${game} ${part} must hit launch button`);
          if(mobile)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);
          await page.locator('.room-setup-modal').waitFor();assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().game.id),game);
          assert.equal(await page.evaluate(()=>getSelection().toString()),'');
          await page.locator('[data-command=lobby-leave]').click();
        }
        const selectability=await page.locator('.game-tile').evaluateAll(tiles=>tiles.map(el=>getComputedStyle(el).userSelect));
        assert(selectability.every(value=>value==='none'));
      } finally {await context.close();}
    });
  } finally {await browser.close();}
});
