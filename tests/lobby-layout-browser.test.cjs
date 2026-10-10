'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('Unified room keeps participants unique, compact controls reachable and nickname in settings',{timeout:90000},async t=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  try{
    for(const [width,height] of [[320,740],[390,740],[740,390],[1440,900]])await t.test(`${width}×${height}`,async()=>{
      const context=await browser.newContext({viewport:{width,height},hasTouch:width<1000,isMobile:width<1000,playroomProfile:false});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
      try{
        await page.goto(server.url);await page.locator('#profile-form input').fill('Иван');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());
        await page.locator('[data-start=uno]').click();await page.locator('[data-room-option=transportMode]').selectOption('network');await page.locator('[data-room-kind="seat-2"]').selectOption('empty');await page.locator('[data-room-title]').fill('Комната Иван');await page.locator('[data-room-title]').press('Tab');
        await page.locator('.lobby-shell').waitFor();
        await page.evaluate(()=>{
          const b=PlayroomAppBridge,r=b.room();
          b.roomService.join(r.id,{id:'layout-player',nickname:'Мария'});b.roomService.claimSeat(r.id,'layout-player','seat-2');
          b.roomService.join(r.id,{id:'layout-observer',nickname:'Зритель Анна'});b.renderLobby();
        });
        const lobby=page.locator('.lobby-shell');
        assert.equal(await lobby.locator('#lobby-name-form').count(),0,'profile belongs in settings');
        assert.equal(await lobby.locator('.lobby-rules-summary,.lobby-rule-grid,.lobby-participants').count(),0,'no duplicate panels');
        assert.equal(await lobby.locator('[data-participant-id]').count(),3);
        assert.equal(await lobby.locator('[data-participant-id="layout-player"]').count(),1);
        assert.equal(await lobby.locator('.lobby-observer[data-participant-id="layout-observer"]').count(),1);
        assert.equal(await lobby.locator('.lobby-seat-row[data-participant-id="layout-player"]').count(),1);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
        const header=lobby.locator('.lobby-header'),back=header.locator('[data-command=close-modal]'),settings=header.locator('[data-command=settings]');
        assert((await back.boundingBox()).x<(await settings.boundingBox()).x);
        for(const button of await lobby.locator('.icon-btn').all()){
          assert(await button.getAttribute('aria-label'),'icons need accessible labels');
          const box=await button.boundingBox();assert(box.width>=43&&box.height>=43&&box.x>=0&&box.x+box.width<=width+1,'icon target must fit');
        }
        assert.equal(await lobby.locator('#network-pair-button').locator('..').locator('h2').innerText(),'Игровые места');
        assert.equal(await lobby.locator('[data-command=room-rules]').locator('..').locator('[data-command=room-rules-view]').count(),1);
        if(process.env.PLAYROOM_CAPTURE_DIR){await page.evaluate(()=>{const toast=document.querySelector('#toast');toast.textContent='';toast.classList.remove('show');});fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`room-host-${width}.png`),fullPage:true,animations:'disabled'});}
        await lobby.locator('[data-command=room-help]').click();assert.match(await page.locator('.modal').innerText(),/Никнейм меняется в настройках/);await page.locator('.modal [data-command=close-modal]').click();
        await lobby.locator('[data-command=room-rules-view]').click();assert.equal(await page.locator('.modal .lobby-rule-grid').count(),1);assert(await page.locator('.modal .rules-list li').count()>0);await page.locator('.modal [data-command=close-modal]').click();
        await settings.click();await page.locator('#lobby-nickname-form input').fill('Иван новый');await page.locator('#lobby-nickname-form').evaluate(f=>f.requestSubmit());
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.find(p=>p.isHost).nickname),'Иван новый');
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().name),'Иван','room nickname must not overwrite profile');
        await page.locator('.room-setup-modal').waitFor();await lobby.locator('[data-command=lobby-ready]').click();
        await settings.click();assert.equal(await page.locator('#lobby-nickname-form input').isDisabled(),true);await page.locator('.modal [data-command=close-modal]').click();
        await lobby.locator('[data-command=lobby-ready]').click();await lobby.locator('[data-kick-participant="layout-observer"]').click();assert.equal(await lobby.locator('[data-participant-id="layout-observer"]').count(),0);
        await lobby.locator('[data-command=lobby-leave]').click();await page.locator('.game-grid').waitFor();
        await page.locator('[data-start=uno]').click();await page.locator('[data-room-option=transportMode]').selectOption('network');await page.locator('[data-room-kind="seat-2"]').selectOption('empty');await page.locator('[data-room-option=hostMode]').selectOption('table');
        assert.equal(await page.locator('.lobby-seat-row[data-participant-id]').count(),0);
        assert.equal(await page.locator('.lobby-observer[data-participant-id]').count(),1,'table host appears once with public viewers');
        assert.equal(await page.locator('[data-command=lobby-ready]').count(),0,'table host does not claim readiness as a player');
        await page.locator('[data-command=lobby-leave]').click();assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }finally{await browser.close();await server.close();}
});
