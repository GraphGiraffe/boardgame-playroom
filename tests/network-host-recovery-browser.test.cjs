const TestUI=require('./browser-origin.cjs');
'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');
const standalone=process.env.PLAYROOM_SDK_PLAYER_HTML;
const hasUno=fs.existsSync(path.join(root,'packs/uno/manifest.json'))&&fs.existsSync(path.join(root,'installed-packs.js'));

test('host archive keeps its original private viewer when an earlier recovery seat is vacant',
  {timeout:45000,skip:!hasUno},async()=>{
    const {server:listener,url}=await server(),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
    const context=await browser.newContext({playroomProfile:false}),page=await context.newPage();
    try{
      await profile(page,'Хост второй',url);
      const expected=await page.evaluate(async()=>{
        const b=PlayroomAppBridge,host=b.profile(),pack=b.packs.list().find(p=>p.id==='uno');b.packs.activate(pack.id,pack.version);
        let time=1000;const rooms=new PlayroomMultiplayer.RoomService({clock:()=>time});
        const room=rooms.create({name:'Чужая рука скрыта',game:{id:'uno',name:'UNO',version:pack.version},host:{id:host.id,nickname:host.name},constraints:{min:2,max:2},rules:{preset:'classic'}});
        rooms.moveParticipant(room.id,host.id,host.id,'seat-2');rooms.join(room.id,{id:'earlier-player',nickname:'Первый игрок'});rooms.claimSeat(room.id,'earlier-player','seat-1');
        rooms.setReady(room.id,host.id,true);rooms.setReady(room.id,'earlier-player',true);rooms.beginCountdown(room.id,host.id);time=5000;rooms.tick(room.id);
        const session=new TabletopSession(TabletopCore,'uno',{packVersion:pack.version,players:[{name:'Первый игрок'},{name:host.name}],seed:124,preset:'classic',openHands:false});
        const store=new PlayroomNetworkSessionStore();await store.create({sessionId:'viewer-gap-regression',room:rooms.snapshot(room.id),session,recovery:rooms.exportRecovery(room.id),packDigest:await PlayroomNetworkSessionStore.fingerprintPack(b.packs,'uno',pack.version)});store.close();
        return {entities:session.current.data.hands[1].map(card=>'card-'+card.id),other:session.current.data.hands[0].map(card=>'card-'+card.id)};
      });
      await savedAction(page,'[data-network-continue="viewer-gap-regression"]','.saved-game[data-network-session-id="viewer-gap-regression"]');
      await page.locator('.room-setup-modal .lobby-shell').waitFor();await kick(page,'earlier-player');
      await page.waitForFunction(async()=>{const store=new PlayroomNetworkSessionStore();try{return (await store.load('viewer-gap-regression',TabletopCore,TabletopSession)).room.seats[0].participantId===null;}finally{store.close();}});
      await confirmedLeave(page,'[data-command=lobby-leave]');await savedAction(page,'[data-network-history="viewer-gap-regression"]','.saved-game[data-network-session-id="viewer-gap-regression"]');await page.locator('.history-panel[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
      const entities=await page.locator('.layout-hand [data-entity]').evaluateAll(nodes=>nodes.map(node=>node.dataset.entity));
      assert.deepEqual(entities,expected.entities);assert(entities.every(id=>!expected.other.includes(id)),'the removed player private hand is never displayed');
    }finally{await context.close();await browser.close();await new Promise(resolve=>listener.close(resolve));}
  });

function server(main){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  const s=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost'),rel=u.pathname==='/'?'index.html':u.pathname.slice(1),entry=u.pathname==='/'&&main;
    const file=entry?path.resolve(entry):path.resolve(root,rel);
    if((!entry&&!file.startsWith(root+path.sep))||!fs.existsSync(file)||fs.statSync(file).isDirectory()){
      res.writeHead(404);return res.end();
    }
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve({server:s,url:'http://127.0.0.1:'+s.address().port+'/'})));
}
async function profile(page,name,url){
  await require('./account-sync-fixture.cjs').installFetch(page.context(),async route=>route.fulfill({json:{}}));await page.context().route(/https:\/\/[^/]+\.supabase\.co\//,route=>route.abort());await page.goto(url);
  await page.locator('#profile-form [name=playerName]').fill(name);
  await page.locator('#profile-form').evaluate(f=>f.requestSubmit());
  await page.locator('.game-grid').first().waitFor();
  await page.evaluate(()=>{for(const game of PlayroomAppBridge.packs.list())PlayroomFirstTurnGuide.setEnabled(game.id,false);});
}
async function confirmedLeave(page,selector){await TestUI.activeSurface(page).locator('[data-room-context]').click();await TestUI.activeSurface(page).locator(selector).click();await TestUI.activeSurface(page).locator('[data-confirm-accept],[data-command=confirm-operation]').click();}
async function savedAction(page,selector,card='.saved-game[data-network-session-id]'){await page.locator('[data-hub-page=sessions]').click();await page.locator(card).first().click();await TestUI.activeSurface(page).locator(selector).first().click();}
async function kick(page,id){await TestUI.activeSurface(page).locator('[data-room-person="'+id+'"]').click();await TestUI.activeSurface(page).locator('[data-profile-kick]').click();await TestUI.activeSurface(page).locator('[data-command=confirm-operation]').click();}
async function gameAction(page,command){await page.locator('[data-game-menu]').click();await TestUI.activeSurface(page).locator('[data-game-menu-action][data-command="'+command+'"]').click();}
async function pair(host,guest,{shareHandoff=false}={}){
  // The same live PR2/PR3 offer/answer flow used by the normal QR screen.
  // Browser text transport avoids requiring a camera in CI; the QR decoder
  // itself is already exercised by qr-pairing-browser.test.cjs.
  await host.locator('#network-pair-button').click();
  await host.locator('#net-host-token').waitFor({state:'attached'});
  const offer=await host.locator('#net-host-token').inputValue();
  assert.match(await host.evaluate(value=>PlayroomPairing.extract(value),offer),/^PR[23]\./);
  if(shareHandoff){
    await guest.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',
      {data:{kind:'playroom-pair-token',token}})),await host.evaluate(link=>PlayroomPairing.extract(link),offer));
  }else{
    await guest.locator('#network-join-button').click();await guest.locator('[data-lobby-online=manual]').click();await TestUI.activeSurface(guest).locator('[role=tab][data-nearby-method=text]').click();
    await guest.locator('#net-client-offer textarea[name=offer]').fill(offer);
    await guest.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
  }
  await guest.locator('#net-client-token').waitFor({state:'attached',timeout:15000});
  const answer=await guest.locator('#net-client-token').inputValue();
  await TestUI.activeSurface(host).locator('[role=tab][data-nearby-direction=receive]').click();await TestUI.activeSurface(host).locator('[role=tab][data-nearby-method=text]').click();await host.locator('#net-host-answer textarea[name=answer]').fill(answer);
  await host.locator('#net-host-answer').evaluate(f=>f.requestSubmit());
  await host.locator('#net-host-answer').waitFor({state:'detached',timeout:15000});
}
async function identity(page){
  return page.evaluate(()=>{
    const debug=PlayroomNetworkDebug().client,roomId=Object.keys(localStorage)
      .find(key=>key.startsWith('playroom.network-resume.v1.'))?.slice('playroom.network-resume.v1.'.length);
    const saved=roomId&&JSON.parse(localStorage.getItem('playroom.network-resume.v1.'+roomId));
    return {participantId:debug.participantId,roomId,token:saved?.token};
  });
}

test('LAN-01 UI: open UNO reaction survives host restart and a new presentation acknowledgement',
  {timeout:75000,skip:!standalone&&!hasUno},async()=>{
    const {server:listener,url}=await server(standalone);
    const browser=await chromium.launch({headless:true,executablePath:executablePath()});
    const contexts=await Promise.all([{viewport:{width:1000,height:780}},{viewport:{width:390,height:740},isMobile:true,hasTouch:true}].map(options=>browser.newContext({playroomProfile:false,...options})));
    const [host,guest]=await Promise.all(contexts.map(context=>context.newPage())),errors=[];
    for(const page of [host,guest])page.on('pageerror',error=>errors.push(error.message));
    try{
      await Promise.all([profile(host,'Хост',url),profile(guest,'Игрок',url)]);
      await TestUI.openGame(host,'uno','network');
      await host.locator('[data-room-auto-start]').uncheck();
      await host.evaluate(()=>{
        const b=PlayroomAppBridge,room=b.room(),create=TabletopCore.createGame;
        b.roomService.setLocalSeat(room.id,room.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();
        TabletopCore.createGame=(id,options)=>{
          if(id!=='uno')return create(id,options);
          const state=create(id,{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned',unoMode:'manual'});
          const hand=state.data.hands[0],played=TabletopCore.availableCommands(state,0).find(action=>action.type==='play'&&hand.some(card=>card.id===action.card&&/^\d+$/.test(String(card.value))));
          if(!played)throw Error('Expected a playable number card');
          const kept=[hand.find(card=>card.id===played.card),hand.find(card=>card.id!==played.card)];
          state.data.drawPile.push(...hand.filter(card=>!kept.includes(card)));state.data.hands[0]=kept;
          TabletopCore.validateState(state);window.recoveryCard=played.card;return state;
        };
      });
      await pair(host,guest);await guest.locator('#net-client-join').evaluate(form=>form.requestSubmit());
      await guest.locator('[data-net-seat="seat-2"]').click();await guest.locator('[data-net-action=ready]').click();
      await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();
      await host.locator('.layout-hand [data-entity="card-'+await host.evaluate(()=>recoveryCard)+'"]').click();
      await host.waitForFunction(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot.reactionWindows.some(window=>window.owner===0&&!window.protected));
      const before=await host.evaluate(()=>{
        const snapshot=PlayroomNetworkLibrary.playerControlContext().snapshot;
        return {session:snapshot.sessionId,epoch:snapshot.authorityEpoch,revision:snapshot.revision,episode:snapshot.reactionWindows.find(window=>window.owner===0).id};
      });

      await host.addInitScript(()=>{
        let Client;
        Object.defineProperty(window,'PlayroomSessionClient',{configurable:true,get:()=>Client,set(value){
          Client=value;
          const acknowledge=value.prototype.presentationReady;
          value.prototype.presentationReady=function(frame=this.snapshot){
            if(!frame?.reactionWindows.some(window=>window.owner===frame.viewer))return acknowledge.call(this,frame);
            return new Promise(resolve=>{window.finishRecoveryPresentation=async()=>{const reply=await acknowledge.call(this,frame);resolve(reply);return reply;};});
          };
        }});
      });
      await host.reload();await savedAction(host,'[data-network-continue]');
      await guest.reload();await pair(host,guest);
      await guest.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-ready]').click();
      await host.locator('[data-command=lobby-start]:not([disabled])').click();
      await host.waitForFunction(()=>typeof window.finishRecoveryPresentation==='function');
      const restored=await host.evaluate(id=>{
        const snapshot=PlayroomNetworkLibrary.playerControlContext().snapshot;
        const window=snapshot.reactionWindows.find(window=>window.id===id);
        return {session:snapshot.sessionId,epoch:snapshot.authorityEpoch,revision:snapshot.revision,owner:window?.owner,protected:window?.protected};
      },before.episode);
      assert.deepEqual(restored,{...restored,session:before.session,revision:before.revision,owner:0,protected:true});
      assert.notEqual(restored.epoch,before.epoch);
      assert.equal((await host.evaluate(()=>finishRecoveryPresentation())).ok,true);
      await host.locator('.network-game [data-action*="declare-uno"]:enabled').click();
      await guest.waitForFunction(expected=>{
        const snapshot=PlayroomNetworkLibrary.playerControlContext()?.snapshot;
        return snapshot?.sessionId===expected.session&&snapshot.revision===expected.revision+1&&!snapshot.reactionWindows.length;
      },before);
      assert.deepEqual(errors,[]);
    }finally{
      await Promise.all(contexts.map(context=>context.close()));await browser.close();await new Promise(resolve=>listener.close(resolve));
    }
  });

for(const [mode,guestCount] of [['network-player',1],['network-table',2]]){
  test(`LAN-01 UI: ${mode} recovers the entire UNO session after host reload and re-pairs original seats`,
    {timeout:155000,skip:!hasUno},async()=>{
      const {server:listener,url}=await server();
      const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
      const contexts=[],errors=[];
      try{
        const hostContext=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}});
        contexts.push(hostContext);
        const host=await hostContext.newPage();host.on('pageerror',e=>errors.push('host '+e.message));
        await profile(host,'Хост',url);
        const guests=[];
        for(let index=0;index<guestCount;index++){
          const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740},isMobile:true,hasTouch:true});
          contexts.push(context);const guest=await context.newPage();
          guest.on('pageerror',e=>errors.push('guest '+index+' '+e.message));
          await profile(guest,'Гость '+index,url);guests.push(guest);
        }
        // The guest can receive a PlayRoom Share Target while a completely
        // different local game is open. Its bots/replay must be parked, and
        // must never repaint the incoming UNO network session.
        if(mode==='network-player'){
          await TestUI.openGame(guests[0],'checkers','hotseat');
          await guests[0].locator('[data-command=lobby-start]').click();
          await guests[0].locator('.table-shell:not(.network-game)').waitFor();
          assert.match(await guests[0].locator('.game-frame-title').innerText(),/Шашки/);
        }
        await TestUI.openGame(host,'uno','network');await host.locator('[data-room-auto-start]').uncheck();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});if(mode==='network-table'){const id=await host.evaluate(()=>PlayroomAppBridge.participantId());await host.locator('[data-room-person="'+id+'"]').click();await TestUI.activeSurface(host).locator('[data-command=lobby-table]').click();}
        await TestUI.activeSurface(host).locator('[data-room-context]').click();await host.locator('[data-room-title]').fill('Продолжение LAN-01');
        await host.locator('[data-room-name-save]').click();
        await host.locator('.lobby-shell').waitFor();
        for(const [guestIndex,guest] of guests.entries()){
          await pair(host,guest,{shareHandoff:mode==='network-player'&&guestIndex===0});
          await guest.locator('#net-client-join').evaluate(f=>f.requestSubmit());
          await guest.locator('.lobby-shell').waitFor();
          await guest.locator('[data-net-seat]:not(:disabled)').first().click();
        }
        const before=await Promise.all(guests.map(identity));
        assert(before.every(item=>item.participantId&&item.token?.length===64));
        if(mode==='network-player')await host.locator('[data-command=lobby-ready]').click();
        for(const guest of guests)await guest.locator('[data-net-action=ready]').click();
        await host.locator('[data-command=lobby-start]:not([disabled])').click();
        await host.locator('.table-shell.network-game').waitFor({timeout:15000});
        for(const guest of guests)await guest.locator('.table-shell.network-game').waitFor({timeout:15000});
        assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),mode==='network-table'?'-1':'0');
        const actor=mode==='network-player'?host:guests[0];
        const initial=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
        await actor.locator('.table-shell.network-game .app-game-layout[aria-busy=false]').waitFor();await actor.locator('.table-shell.network-game .scene [data-action*=draw],.table-shell.network-game .scene [data-action*=pass]').first().click();
        await host.waitForFunction(rev=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>rev,initial);
        const savedRevision=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
        for(const guest of guests)await guest.waitForFunction(rev=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)===rev,savedRevision);
        if(mode==='network-player'){
          const guest=guests[0];
          await gameAction(guest,'history');
          await guest.locator('#replay-range').waitFor();
          // The slider appears before the initial remote frame has loaded.
          // Wait for that RPC before exercising a user drag/release.
          await guest.locator('.history-panel[aria-busy="false"]').waitFor({timeout:15000});
          // The input event is fired while a finger is DRAGGING, not released.
          // The old app-level #replay-range handler once repainted a local
          // Checkers session into this UNO game at exactly this moment.
          const during=await guest.locator('#replay-range').evaluate(slider=>{
            // Input and release must target the SAME slider. The initial
            // asynchronous history snapshot can replace the DOM between
            // separate Playwright evaluate() calls, losing the intended 0.
            slider.value='0';slider.dispatchEvent(new Event('input',{bubbles:true}));
            const state={title:document.querySelector('.game-frame-title')?.textContent,
              uno:!!document.querySelector('.table-shell.network-game .uno-discard'),
              inNetwork:!!document.querySelector('.table-shell.network-game')};
            slider.dispatchEvent(new Event('change',{bubbles:true}));
            return state;
          });
          assert.equal(during.inNetwork,true);
          assert.equal(during.title?.trim(),'История партии');assert.equal(during.uno,true,'local Checkers cannot render while scrubbing the guest UNO replay');
          await guest.waitForFunction(()=>{
            const panel=document.querySelector('.history-panel[aria-busy="false"]');
            return panel?.querySelector('.replay-badge')?.textContent?.trim().startsWith('0 /');
          });
          assert.equal(await guest.locator('.table-shell.network-game .uno-discard').count(),1,'scrubbed history remains the UNO renderer');
          await guest.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const fit=await guest.evaluate(()=>{
            const scene=document.querySelector('.table-shell.network-game .scene.replaying'),stage=scene?.firstElementChild;
            if(!scene||!stage)return {exists:false};
            return {exists:true,viewportHeight:scene.getBoundingClientRect().height,
              stageHeight:stage.getBoundingClientRect().height,scrollExcess:scene.scrollHeight-scene.clientHeight};
          });
          if(process.env.PLAYROOM_CAPTURE_DIR)await guest.screenshot({path:require('node:path').join(process.env.PLAYROOM_CAPTURE_DIR,'network-replay-'+mode+'.png')});
          assert.equal(fit.exists,true);
          assert.ok(fit.stageHeight<=fit.viewportHeight+8,'the replay board must fit above history controls: '+JSON.stringify(fit));
          assert.ok(fit.scrollExcess<=8,'network replay must not require internal page scrolling: '+JSON.stringify(fit));
          await guest.locator('[data-command="history-close"]').click();
        }
        // Each guest persists only projected frames (never host authority or
        // private resume capabilities) before the host page disappears.
        for(const guest of guests){
          await guest.waitForFunction(async rev=>{
            const store=new PlayroomNetworkClientHistory();
            try{const list=await store.list();return list.some(x=>x.role==='client'&&x.revision>=rev&&x.savedFrames>0);}
            finally{store.close();}
          },savedRevision,{timeout:10000});
          const personal=await guest.evaluate(async()=>{
            const store=new PlayroomNetworkClientHistory(),list=await store.list();
            const snapshot=await store.read(list[0].id);store.close();
            return {records:list.length,role:list[0].role,viewer:snapshot.viewer,
              leaked:JSON.stringify(snapshot).includes('resumeToken')||JSON.stringify(snapshot).includes('packDigest')||
                JSON.stringify(snapshot).includes('recovery')};
          });
          assert.equal(personal.records,1);assert.equal(personal.role,'client');
          assert.equal(personal.leaked,false);
        }

        const expected=await host.evaluate(async()=>{
          const store=new PlayroomNetworkSessionStore(),entries=await store.list();
          const current=entries[0]&&await store.load(entries[0].sessionId,TabletopCore,TabletopSession);
          store.close();
          return {entries:entries.length,sessionId:current?.sessionId,revision:current?.revision,
            states:current?.session.historyLength,roomId:current?.room.id,
            seats:current?.recovery?.room.seats.map(x=>x.participantId),
            tokenCount:current?.recovery?.tokens.length};
        });
        assert.equal(expected.revision,savedRevision);
        assert.equal(expected.states,savedRevision+1);
        assert.equal(expected.tokenCount,guestCount);
        assert.equal(expected.entries,1);
        // This destroys the live authority, WebRTC channels and all in-memory
        // RoomService maps. Only the host IndexedDB record may survive.
        await host.reload();
        await host.locator('[data-hub-page=sessions]').click();
        await host.locator('[data-saved-filter="network"]').click();
        assert.equal(await host.locator('.saved-game[data-network-session-id]').count(),1);
        assert.equal(await host.locator('.saved-game[data-network-session-id] [data-transport-mode=network]').count(),1);assert.equal(await host.evaluate(async()=>{const store=new PlayroomNetworkSessionStore();try{return (await store.list())[0].role;}finally{store.close();}}),'host');
        // The history must remain readable even while the network room is stopped.
        await savedAction(host,'[data-network-history]');
        await host.locator('.table-shell.network-game .history-panel').waitFor();
        assert.equal(await host.locator('.table-shell.network-game .scene [data-action]:not([disabled])').count(),0,
          'read-only archives must not expose legal actions');
        await host.locator('.table-shell.network-game [data-command=history-close]').click();
        await savedAction(host,'[data-network-continue]');
        await host.locator('.room-setup-modal .lobby-shell').waitFor({timeout:15000});
        assert.equal(await host.locator('.table-shell.network-game').count(),0,'restoration waits in the lobby');
        assert.equal(await host.locator('.room-v021-row [data-ui-icon=link-off]').count(),guestCount,'reserved disconnected players use the shared offline avatar indicator');
        for(const guest of before){const row=host.locator('.room-v021-row[data-participant-id="'+guest.participantId+'"]');assert.match(await row.locator('.room-v021-person').getAttribute('aria-label'),/не в сети/);assert.match(await row.locator('.room-v021-person-copy small').innerText(),/не в сети/);}
        const owner=await host.evaluate(()=>PlayroomAppBridge.participantId());assert.equal(await host.locator('.room-v021-row[data-participant-id="'+owner+'"] [data-ui-icon=link-off]').count(),0,'the current host is not marked as a disconnected guest');
        assert.equal(await host.locator('[data-command=lobby-start]').isDisabled(),true);
        await host.locator('[data-command=room-rules]').click();assert.equal(await host.locator('#room-rules-form').getAttribute('data-readonly'),'true');assert.equal(await host.locator('[type=submit][form=room-rules-form]').count(),0,'recovery parameters can be viewed but not saved');await TestUI.activeSurface(host).locator('.modal-head [data-command=close-modal]').click();
        for(let index=0;index<guests.length;index++){
          const guest=guests[index];await guest.reload();await guest.locator('#network-join-button').waitFor();
          await pair(host,guest);await guest.locator('.room-setup-modal .lobby-shell').waitFor({timeout:15000});
          const after=await identity(guest);
          assert.equal(after.participantId,before[index].participantId,'resume returns the original participant');
          assert(after.token!==before[index].token,'the private resume capability must rotate');
          await host.locator('.room-v021-row[data-participant-id="'+after.participantId+'"] [data-ui-icon=link-off]').waitFor({state:'detached'});
          assert.equal(await guest.locator('[data-net-action=accept-replacement]').count(),0,'ordinary reconnect does not require replacement consent');
          await guest.locator('[data-net-action=ready]').click();
        }
        if(mode==='network-player')await host.locator('[data-command=lobby-ready]').click();
        await host.locator('[data-command=lobby-start]:not([disabled])').click();
        await host.locator('.table-shell.network-game').waitFor({timeout:15000});
        assert.equal(Number(await host.locator('.table-shell.network-game').getAttribute('data-revision')),savedRevision);
        assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),mode==='network-table'?'-1':'0');
        for(let index=0;index<guests.length;index++){
          const guest=guests[index];await guest.locator('.table-shell.network-game').waitFor({timeout:15000});
          assert.equal(await guest.locator('.table-shell.network-game').getAttribute('data-viewer'),String(mode==='network-player'?index+1:index));
          assert.equal(Number(await guest.locator('.table-shell.network-game').getAttribute('data-revision')),savedRevision);
        }
        await host.waitForFunction(()=>document.querySelectorAll('.player-panel.is-network-offline').length===0);
        assert.equal(await host.locator('.player-panel .participant-role.is-offline').count(),0,'reconnected icons clear offline status');
        for(const guest of guests){await guest.waitForFunction(()=>document.querySelectorAll('.player-panel .participant-role.is-online').length>=2);assert.equal(await guest.locator('.player-panel [data-participant-role=bot].is-online').count(),0);}
        const room=await host.evaluate(()=>PlayroomAppBridge.roomService.snapshot(PlayroomAppBridge.room().id));
        assert.equal(room.participants.filter(p=>!p.isHost).length,guestCount);
        assert.deepEqual(room.seats.map(s=>s.participantId),expected.seats);
        assert.equal(room.phase,'playing');
        for(const item of before)assert(!JSON.stringify(room).includes(item.token),'room snapshots must not contain guest secrets');
        // Confirm the recovered authority can accept another ordinary move.
        const nextViewer=await host.evaluate(async sessionId=>{
          const store=new PlayroomNetworkSessionStore(),saved=await store.load(sessionId,TabletopCore,TabletopSession);
          store.close();return saved.session.current.turn;
        },expected.sessionId);
        const nextPage=mode==='network-table'?guests[nextViewer]:nextViewer===0?host:guests[nextViewer-1];
        const action=nextPage.locator('.table-shell.network-game .scene [data-action*=draw],.table-shell.network-game .scene [data-action*=pass]').first();
        await action.waitFor({timeout:12000});await action.click();
        await host.waitForFunction(rev=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>rev,savedRevision);
        const parkedRevision=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
        if(mode==='network-player'){
          // Android content:// cannot safely rely on location.reload() as an
          // exit mechanism. Parking retains RTC; explicit room leave collects recovery.
          await guests[0].evaluate(()=>{window.confirm=()=>true;});
          await gameAction(guests[0],'home');
          await guests[0].locator('.game-grid').first().waitFor({timeout:10000});
          assert.equal(await guests[0].evaluate(()=>PlayroomNetworkDebug().client.channel),'connected');
          await guests[0].locator('#network-join-button').click();await guests[0].locator('.table-shell.network-game').waitFor();await gameAction(guests[0],'room');
          await confirmedLeave(guests[0],'[data-net-action=leave]');
          await host.locator('.room-setup-modal .lobby-shell').waitFor();assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().recovery.sessionId),expected.sessionId);assert.equal(await host.evaluate(id=>PlayroomAppBridge.room().participants.some(p=>p.id===id),before[0].participantId),false,'explicit leave removes the former identity while keeping its recovery seat');
        }
        // An unfinished match can also be parked and restored in the same page.
        // Releasing its authority must release the original lobby RTC leases.
        if(mode==='network-player')await TestUI.activeSurface(host).locator('.modal-head [data-command=close-modal]').click();else await gameAction(host,'home');
        await host.locator('.hub-main').waitFor({timeout:10000});
        assert(await host.evaluate(()=>PlayroomNetworkDebug().host.roomId));
        await host.locator('[data-hub-page=games]').click();await host.locator('#network-join-button').click();if(mode==='network-table'){await host.locator('.table-shell.network-game').waitFor();await gameAction(host,'room');}else await host.locator('.lobby-shell').waitFor();
        await confirmedLeave(host,'[data-command=lobby-leave]');
        assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.roomId),null);
        await host.locator('[data-command=sessions]').click();
        await savedAction(host,'[data-network-continue]');
        await host.locator('.room-setup-modal .lobby-shell').waitFor({timeout:10000});
        assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().recovery.revision),parkedRevision);
        assert.equal(await host.locator('[data-command=lobby-start]').isDisabled(),true);
        if(mode==='network-player'){
          assert.equal(await host.evaluate(id=>PlayroomAppBridge.room().participants.some(p=>p.id===id),before[0].participantId),false);
          const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});contexts.push(context);
          const replacement=await context.newPage();replacement.on('pageerror',e=>errors.push('replacement '+e.message));await profile(replacement,'Замена',url);
          await pair(host,replacement);await replacement.locator('#net-client-join').evaluate(f=>f.requestSubmit());
          assert.equal(await replacement.locator('[data-net-seat="seat-2"]').isEnabled(),true,'a connected unseated spectator can claim only the reserved vacant recovery seat');
          assert.equal(await replacement.locator('[data-room-cycle]').count(),0,'the replacement receives no host configuration controls');
          const lockedClaims=await replacement.evaluate(()=>{const c=PlayroomNetworkLibrary.inviteContext(),id=c.participantId;return [{person:{connected:false}},{person:{role:'table'}},{seat:{closed:true}},{seat:{playerIndex:undefined}},{seat:{previousParticipant:undefined}}].map(change=>{const room={...c.room,participants:c.room.participants.map(p=>p.id===id?{...p,...change.person}:p),seats:c.room.seats.map(s=>s.id==='seat-2'?{...s,...change.seat}:s)},root=document.createElement('div');root.innerHTML=PlayroomLobbyView.render({room,participantId:id});return root.querySelector('[data-net-seat="seat-2"]').disabled;});});
          assert.deepEqual(lockedClaims,Array(5).fill(true),'disconnected/public Table viewers and closed/unmapped/unreserved seats remain locked');
          await replacement.locator('[data-net-seat="seat-2"]').click();
          await replacement.locator('[data-net-action=accept-replacement]').waitFor();
          assert.match(await replacement.locator('.room-v021-footer').innerText(),/Гость 0/);
          assert.equal(await replacement.locator('[data-net-action=ready]').isDisabled(),true);
          assert.equal(await replacement.locator('.own-hand').count(),0,'replacement has no hand before consent and continuation');
          await replacement.locator('[data-net-action=accept-replacement]').click();await replacement.locator('[data-net-action=ready]').click();
          await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();
          await replacement.locator('.table-shell.network-game').waitFor({timeout:15000});
          assert.equal(Number(await replacement.locator('.table-shell.network-game').getAttribute('data-revision')),parkedRevision);
          assert.equal(await replacement.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
          assert.equal(await replacement.locator('.player-panel [data-player-replacement]').count(),1,'replacement is marked in the game');
          const replaced=await host.evaluate(async id=>{const store=new PlayroomNetworkSessionStore(),record=await store.load(id,TabletopCore,TabletopSession);store.close();return {sessionId:record.sessionId,revision:record.revision,tokens:record.recovery.tokens.map(t=>t.participantId)};},expected.sessionId);
          assert.equal(replaced.sessionId,expected.sessionId);assert.equal(replaced.revision,parkedRevision);assert.equal(replaced.tokens.includes(before[0].participantId),false);
        }
        assert.deepEqual(errors,[]);
      }finally{
        await Promise.all(contexts.map(c=>c.close().catch(()=>{})));await browser.close();
        await new Promise(resolve=>listener.close(resolve));
      }
    });
}
