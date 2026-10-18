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
        await page.locator('[data-start=uno]').click();
        await page.locator('[data-room-cycle="seat-3"]').click();assert.equal(await page.locator('[data-room-bot]').count(),0,'bot is added without an intermediate name dialog');
        await page.locator('[data-lobby-seat="seat-3"]').click();await page.locator('#room-human-form input').fill('Кира');await page.locator('#room-human-form').evaluate(f=>f.requestSubmit());assert.match(await page.locator('[data-lobby-seat="seat-3"]').innerText(),/Кира/);
        assert.equal(await page.locator('[data-participant-id]').count(),3);
        await page.locator('[data-room-cycle="seat-3"]').click();assert.equal(await page.locator('[data-lobby-seat="seat-3"]').isDisabled(),true);
        await page.locator('[data-room-cycle="seat-3"]').click();await page.locator('[data-lobby-seat="seat-3"]').click();await page.locator('#room-human-form input').fill('Оля');await page.locator('#room-human-form').evaluate(f=>f.requestSubmit());
        assert.match(await page.locator('[data-lobby-seat="seat-3"]').innerText(),/Оля/);await page.locator('[data-room-cycle="seat-3"]').click();await page.locator('[data-room-cycle="seat-3"]').click();
        await page.locator('[data-room-option=transportMode]').check();
        assert.equal(await page.locator('.lobby-seat-row [data-participant-role=player].is-online[aria-label*=хост]').count(),1);assert.equal(await page.locator('.lobby-seat-row [data-participant-role=player].is-online svg').count(),1,'host crown replaces the player icon');
        assert.equal(await page.locator('.lobby-seat-row [data-participant-role=bot].is-online').count(),0);await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});await page.locator('[data-room-title]').fill('Комната Иван');await page.locator('[data-room-title]').press('Tab');
        await page.locator('.lobby-shell').waitFor();
        await page.evaluate(()=>{
          const b=PlayroomAppBridge,r=b.room();
          b.roomService.join(r.id,{id:'layout-player',nickname:'Мария'});b.roomService.claimSeat(r.id,'layout-player','seat-2');
          b.roomService.join(r.id,{id:'layout-observer',nickname:'Зритель Анна'});b.renderLobby();
        });
        const lobby=page.locator('.room-setup-modal');
        const toggle=await lobby.locator('[data-room-option=transportMode]').boundingBox();assert(toggle.width>=180);assert.equal(toggle.height,44);assert.match(await lobby.locator(".room-transport").innerText(),/Локальная\s+Сетевая/);assert.equal(await lobby.locator('.room-options option[value=network]').count(),0);
        assert.equal(await lobby.locator('#lobby-name-form').count(),0,'profile belongs in settings');
        assert.equal(await lobby.locator('.lobby-rules-summary,.lobby-rule-grid,.lobby-participants').count(),0,'no duplicate panels');
        assert.equal(await lobby.locator('[data-participant-id]').count(),3);
        assert.equal(await lobby.locator('[data-participant-id="layout-player"]').count(),1);
        assert.equal(await lobby.locator('.lobby-observer[data-participant-id="layout-observer"]').count(),1);assert.equal(await lobby.locator('.lobby-observer-slot').count(),1,'one free spectator slot');
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
        if(process.env.PLAYROOM_CAPTURE_DIR){await page.evaluate(()=>{const toast=document.querySelector('#toast');toast.textContent='';toast.classList.remove('show');});fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`room-host-${width}.png`),fullPage:false,animations:'disabled'});}
        assert.deepEqual(await page.evaluate(()=>{
          const b=PlayroomAppBridge,r=b.room(),body=document.querySelector('.modal-body'),title=document.querySelector('[data-room-title]'),header=document.querySelector('.modal-head');
          body.scrollTop=Math.min(100,body.scrollHeight-body.clientHeight);const scroll=body.scrollTop,headTop=header.getBoundingClientRect().top;
          title.focus({preventScroll:true});const saved=title.value;title.value='Неоконченный ввод';title.setSelectionRange(3,7);
          b.roomService.setReady(r.id,'layout-player',true);b.renderLobby();
          const result={sameBody:body===document.querySelector('.modal-body'),sameFocus:document.activeElement===title,value:title.value,selection:[title.selectionStart,title.selectionEnd],scrollStable:Math.abs(body.scrollTop-scroll)<1,headerStable:header.getBoundingClientRect().top===headTop,bodyBelowHeader:body.getBoundingClientRect().top>=header.getBoundingClientRect().bottom};
          title.value=saved;title.blur();b.roomService.setReady(r.id,'layout-player',false);b.renderLobby();body.scrollTop=0;return result;
        }),{sameBody:true,sameFocus:true,value:'Неоконченный ввод',selection:[3,7],scrollStable:true,headerStable:true,bodyBelowHeader:true});
        const centers=await lobby.locator('.room-transport').evaluate(node=>{const box=node.getBoundingClientRect();return [...node.querySelectorAll('span')].map(span=>{const r=document.createRange();r.selectNodeContents(span);const b=r.getBoundingClientRect();return Math.abs((b.top+b.bottom-box.top-box.bottom)/2);});});assert(centers.every(delta=>delta<3),'toggle text vertically centered');
        if(width===320){
          const control=lobby.locator('[data-room-cycle]').first();await control.scrollIntoViewIfNeeded();
          const b=await control.boundingBox(),cdp=await context.newCDPSession(page),before=await lobby.locator('.modal-body').evaluate(n=>n.scrollTop);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
          for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2-i*12}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForFunction(before=>document.querySelector('.modal-body').scrollTop>before+10,before);await cdp.detach();
          assert.equal(await page.locator('.room-drag-ghost').count(),0);
        }
        await page.evaluate(()=>{window.dragEvents=[];for(const kind of ['pointerup','pointercancel'])document.addEventListener(kind,e=>dragEvents.push({kind,type:e.pointerType,x:e.clientX,y:e.clientY,drop:document.querySelector('.room-drop-active')?.dataset.roomDrop}),true);});
        const hostId=await page.evaluate(()=>PlayroomAppBridge.room().ownerId);
        const drag=async(from,to)=>{
          await from.scrollIntoViewIfNeeded();const a=await from.boundingBox(),start={x:a.x+Math.min(40,a.width/2),y:a.y+a.height/2};
          const cdp=width===320?await context.newCDPSession(page):null;
          const move=async point=>{if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point]});else await page.mouse.move(point.x,point.y);await page.waitForTimeout(25);};
          if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[start]});await page.waitForTimeout(300);}else{await page.mouse.move(start.x,start.y);await page.mouse.down();}
          await move({x:start.x+12,y:start.y});await page.locator('.room-drag-ghost').waitFor();
          for(let i=0;i<80;i++){const b=await to.boundingBox(),dialog=await page.locator('.room-setup-modal .modal-body').boundingBox(),y=b.y+b.height/2;if(y>dialog.y+100&&y<dialog.y+dialog.height-35){await move({x:b.x+b.width/2,y});if(await page.locator('.room-drop-active').getAttribute('data-room-drop').catch(()=>null)===await to.getAttribute('data-room-drop'))break;}await move({x:dialog.x+40,y:y<dialog.y+100?dialog.y+10:dialog.y+dialog.height-10});}
          assert.equal(await page.evaluate(()=>document.querySelector('.room-drop-active')?.dataset.roomDrop),await to.getAttribute('data-room-drop'),'visible drop target before release');
          if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.up();await page.waitForTimeout(40);
        };
        await drag(lobby.locator('[data-room-drag="'+hostId+'"]').first(),lobby.locator('[data-room-drop=spectator]'));

        await page.waitForFunction(()=>PlayroomAppBridge.room().participants.find(p=>p.isHost).role==='spectator').catch(async error=>{throw Error(error.message+' '+JSON.stringify(await page.evaluate(()=>({events:dragEvents,notice:document.querySelector('#toast')?.textContent}))));});
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.isHost).role),'spectator',JSON.stringify(await page.evaluate(()=>({events:dragEvents,notice:document.querySelector('#toast')?.textContent}))));
        await lobby.locator('[data-lobby-seat="seat-3"]').click();
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().participants.filter(p=>p.isHost).length),1);
        assert.equal(await lobby.locator('[data-participant-id]').count(),3,'no phantom player');
        await lobby.locator('[data-command=room-rules]').click();
        await page.locator('[data-rules=uno]').click();await page.getByRole('button',{name:'Понятно',exact:true}).click();
        await page.locator('.room-setup-modal').waitFor();
        await lobby.locator('[data-command=room-help]').click();assert.match(await page.locator('.modal').innerText(),/Имя бота или локального игрока меняется нажатием/);await page.locator('.modal [data-command=close-modal]').click();
        await lobby.locator('[data-command=room-rules-view]').click();assert.equal(await page.locator('.modal .lobby-rule-grid').count(),1);assert(await page.locator('.modal .rules-list li').count()>0);await page.locator('.modal [data-command=close-modal]').click();
        await settings.click();await page.locator('#lobby-nickname-form input').fill('Иван новый');await page.locator('#lobby-nickname-form').evaluate(f=>f.requestSubmit());
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id).participants.find(p=>p.isHost).nickname),'Иван новый');
        assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().name),'Иван','room nickname must not overwrite profile');
        await page.locator('.room-setup-modal').waitFor();await lobby.locator('[data-command=lobby-ready]').click();
        await settings.click();assert.equal(await page.locator('#lobby-nickname-form input').isDisabled(),true);await page.locator('.modal [data-command=close-modal]').click();
        await lobby.locator('[data-command=lobby-ready]').click();await lobby.locator('[data-kick-participant="layout-observer"]').click();assert.equal(await lobby.locator('[data-participant-id="layout-observer"]').count(),0);
        await lobby.locator('[data-command=lobby-leave]').click();await page.locator('.game-grid').first().waitFor();
        await page.locator('[data-start=uno]').click();await page.locator('[data-room-option=transportMode]').check();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});await page.locator('[data-command=lobby-table]').click();
        assert.equal(await page.locator('.lobby-seat-row[data-participant-id]').count(),0);
        assert.equal(await page.locator('.lobby-table-slot [data-participant-id]').count(),1,'one participant occupies the table slot');assert.equal(await page.locator('.lobby-observer[data-participant-id]').count(),0);
        assert.equal(await page.locator('[data-command=lobby-ready]').count(),0,'table host does not claim readiness as a player');
        await page.locator('[data-lobby-seat="seat-1"]').click();assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().participants.find(p=>p.isHost).role),'player');
        await page.locator('[data-command=room-rules]').click();assert.equal(await page.locator('[name=firstPlayerMode]').count(),3);await page.locator('[name=firstPlayerMode][value=assigned]').check();await page.locator('#room-rules-form').evaluate(f=>f.requestSubmit());assert.equal(await page.evaluate(()=>PlayroomAppBridge.room().firstPlayerMode),'assigned');await page.locator('[data-first-token]').click();await page.locator('.lobby-seat-row[data-participant-id]').first().click();assert(await page.evaluate(()=>!!PlayroomAppBridge.room().firstParticipantId));
        await page.locator('[data-room-option=transportMode]').uncheck();assert.equal(await page.locator('.lobby-public-places').count(),0);assert.equal(await page.locator('[data-room-option=hostMode],[data-room-option=firstPlayerMode],[data-room-move]').count(),0);
        await page.locator('[data-command=lobby-leave]').click();assert.deepEqual(errors,[]);
      }finally{await context.close();}
    });
  }finally{await browser.close();await server.close();}
});


test('Finished Offline match restores its saved lobby and starts a separate clean session',{timeout:30000},async()=>{
  const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();
  try{
    await page.goto(server.url);await page.locator('[data-start=uno]').click();
    const expected=await page.evaluate(()=>{
      const b=PlayroomAppBridge,id=b.room().id,host=b.participantId();
      b.roomService.renameLocalSeat(id,host,'seat-2','Кира');
      b.roomService.setLocalSeat(id,host,'seat-3',{kind:'human',nickname:'Мария'});
      b.roomService.moveParticipant(id,host,host,'seat-3');
      const room=b.roomService.configure(id,host,{name:'Повторяем вместе',firstPlayerMode:'assigned',firstParticipantId:host});
      const players=room.seats.filter(s=>s.participantId).map(s=>{const p=room.participants.find(p=>p.id===s.participantId);return {name:p.nickname,bot:p.bot};});
      const session=new TabletopSession(TabletopCore,room.game.id,{players,mode:'pass',lobbyConfig:room,preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:room.rules.openHands,firstPlayerMode:'assigned',firstPlayer:2,...room.rules.options});
      const raw=session.export();TabletopCore.finish(raw.states[0],0,'Готово');raw.libraryId='qa-complete';localStorage.setItem('playroom.session.v1',JSON.stringify(raw));
      return {name:room.name,seats:room.seats.map(s=>s.participantId),participants:room.participants.map(p=>({id:p.id,name:p.nickname,bot:p.bot,seat:p.seatId})),first:host,rules:room.rules};
    });
    await page.reload();await page.locator('.resume-banner [data-command=resume]').click();await page.locator('[data-command=result]').click();await page.locator('[data-command=rematch]').click();
    const actual=await page.evaluate(()=>{const r=PlayroomAppBridge.room();return {name:r.name,seats:r.seats.map(s=>s.participantId),participants:r.participants.map(p=>({id:p.id,name:p.nickname,bot:p.bot,seat:p.seatId})),first:r.firstParticipantId,rules:r.rules};});
    assert.deepEqual(actual,expected);
    await page.locator('[data-command=lobby-start]').click();
    const next=await page.evaluate(()=>{const raw=JSON.parse(localStorage.getItem('playroom.session.v1')),s=TabletopSession.restore(TabletopCore,raw);return {id:raw.libraryId,move:s.current.move,status:s.current.status,old:!!localStorage.getItem('playroom.paused.v1.qa-complete')};});
    assert.notEqual(next.id,'qa-complete');assert.equal(next.move,0);assert.equal(next.status,'playing');assert.equal(next.old,true);
  }finally{await context.close();await browser.close();await server.close();}
});

test('local stop button saves unfinished hotseat party and retains lobby and device participants',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();page.setDefaultTimeout(5000);
 try{
  await page.goto(server.url);await page.locator('[data-start=domino]').click();
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Второй'});b.roomService.updateRules(r.id,r.ownerId,{...r.rules,openHands:true});b.renderLobby();});
  const original=await page.evaluate(()=>{const r=PlayroomAppBridge.room();return {id:r.id,seats:r.seats,players:r.participants.map(p=>p.nickname),rules:r.rules};});
  await page.locator('[data-command=lobby-start]').click();await page.locator('.table-shell').waitFor();
  await page.locator('[data-command=room]').click();page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Остановить и сохранить'}).click();
  const stopped=await page.evaluate(()=>{const r=PlayroomAppBridge.room();return {id:r.id,seats:r.seats,players:r.participants.map(p=>p.nickname),rules:r.rules};});assert.deepEqual(stopped,original);
  await page.locator('.modal-head [data-command=close-modal]').click();await page.locator('[data-command=sessions]').click();
  assert.equal(await page.locator('.saved-self').count(),2);assert.equal(await page.locator('.saved-status').first().innerText().then(t=>t.includes('На паузе')),true);
  const saved=await page.evaluate(()=>TabletopSession.restore(PlayroomEngine,JSON.parse(localStorage.getItem('playroom.session.v1'))).current);assert.equal(saved.status,'playing');assert.equal(saved.winner,null);
 }finally{await context.close();await browser.close();await server.close();}
});
