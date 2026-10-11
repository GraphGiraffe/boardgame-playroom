'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');
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
      await page.locator('[data-command=sessions]').click();await page.locator('[data-network-continue="viewer-gap-regression"]').click();
      await page.locator('.room-setup-modal .lobby-shell').waitFor();await page.locator('[data-kick-participant="earlier-player"]').click();
      await page.waitForFunction(async()=>{const store=new PlayroomNetworkSessionStore();try{return (await store.load('viewer-gap-regression',TabletopCore,TabletopSession)).room.seats[0].participantId===null;}finally{store.close();}});
      await page.locator('[data-command=lobby-leave]').click();await page.locator('[data-command=sessions]').click();
      await page.locator('[data-network-history="viewer-gap-regression"]').click();await page.locator('.history-panel[aria-busy="false"]').waitFor();
      assert.equal(await page.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
      const entities=await page.locator('.layout-hand [data-entity]').evaluateAll(nodes=>nodes.map(node=>node.dataset.entity));
      assert.deepEqual(entities,expected.entities);assert(entities.every(id=>!expected.other.includes(id)),'the removed player private hand is never displayed');
    }finally{await context.close();await browser.close();await new Promise(resolve=>listener.close(resolve));}
  });

function server(){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  const s=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost'),rel=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){
      res.writeHead(404);return res.end();
    }
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  });
  return new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve({server:s,url:'http://127.0.0.1:'+s.address().port+'/'})));
}
async function profile(page,name,url){
  await page.goto(url);
  await page.locator('#profile-form input').fill(name);
  await page.locator('#profile-form').evaluate(f=>f.requestSubmit());
  await page.locator('.game-grid').waitFor();
}
async function pair(host,guest,{shareHandoff=false}={}){
  // The same live PR2/PR3 offer/answer flow used by the normal QR screen.
  // Browser text transport avoids requiring a camera in CI; the QR decoder
  // itself is already exercised by qr-pairing-browser.test.cjs.
  await host.locator('#network-pair-button').click();
  await host.locator('#net-host-token').waitFor();
  const offer=await host.locator('#net-host-token').inputValue();
  assert.match(await host.evaluate(value=>PlayroomPairing.extract(value),offer),/^PR[23]\./);
  if(shareHandoff){
    await guest.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',
      {data:{kind:'playroom-pair-token',token}})),await host.evaluate(link=>PlayroomPairing.extract(link),offer));
  }else{
    await guest.locator('#network-join-button').click();
    await guest.locator('#net-client-offer textarea[name=offer]').fill(offer);
    await guest.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
  }
  await guest.locator('#net-client-token').waitFor({timeout:15000});
  const answer=await guest.locator('#net-client-token').inputValue();
  await host.locator('#net-host-answer textarea[name=answer]').fill(answer);
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
          await guests[0].locator('[data-start="checkers"]').click();
          await guests[0].locator('[data-command=lobby-start]').click();
          await guests[0].locator('.table-shell:not(.network-game)').waitFor();
          assert.match(await guests[0].locator('.table-title h1').innerText(),/Шашки/);
        }
        await host.locator('[data-start="uno"]').click();
        await host.locator('[data-room-option=transportMode]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty',nickname:'Игрок'});b.renderLobby();});if(mode==='network-table')await host.locator('[data-command=lobby-table]').click();
        await host.locator('[data-room-title]').fill('Продолжение LAN-01');
        await host.locator('[data-room-title]').press('Tab');
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
        await actor.locator('.table-shell.network-game .scene [data-action]').first().click();
        await host.waitForFunction(rev=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>rev,initial);
        const savedRevision=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
        for(const guest of guests)await guest.waitForFunction(rev=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)===rev,savedRevision);
        if(mode==='network-player'){
          const guest=guests[0];
          await guest.locator('.table-tools [data-command=history]').click();
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
            const state={title:document.querySelector('.table-title h1')?.textContent,
              game:document.querySelector('.table-shell.network-game .scene .game-scene')?.className,
              inNetwork:!!document.querySelector('.table-shell.network-game')};
            slider.dispatchEvent(new Event('change',{bubbles:true}));
            return state;
          });
          assert.equal(during.inNetwork,true);
          assert.equal(during.title?.trim(),'UNO','local Checkers cannot render while scrubbing the guest UNO replay');
          await guest.waitForFunction(()=>{
            const panel=document.querySelector('.history-panel[aria-busy="false"]');
            return panel?.querySelector('.replay-badge')?.textContent?.trim().startsWith('0 /');
          });
          assert.equal((await guest.locator('.table-title h1').innerText()).trim(),'UNO');
          const fit=await guest.evaluate(()=>{
            const scene=document.querySelector('.table-shell.network-game .scene.replaying'),stage=scene?.firstElementChild;
            if(!scene||!stage)return {exists:false};
            return {exists:true,viewportHeight:scene.getBoundingClientRect().height,
              stageHeight:stage.getBoundingClientRect().height,scrollExcess:scene.scrollHeight-scene.clientHeight};
          });
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
            states:current?.session.states.length,roomId:current?.room.id,
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
        await host.locator('[data-command="sessions"]').click();
        await host.locator('[data-saved-filter="network"]').click();
        assert.equal(await host.locator('.saved-game[data-network-session-id]').count(),1);
        assert.match(await host.locator('.saved-game[data-network-session-id]').innerText(),/Сетевая · Хост/);
        // The history must remain readable even while the network room is stopped.
        await host.locator('[data-network-history]').first().click();
        await host.locator('.table-shell.network-game .history-panel').waitFor();
        assert.equal(await host.locator('.table-shell.network-game .scene [data-action]:not([disabled])').count(),0,
          'read-only archives must not expose legal actions');
        await host.locator('.table-shell.network-game .table-heading [data-command=history-close]').first().click();
        await host.locator('[data-network-continue]').first().click();
        await host.locator('.room-setup-modal .lobby-shell').waitFor({timeout:15000});
        assert.equal(await host.locator('.table-shell.network-game').count(),0,'restoration waits in the lobby');
        assert.equal(await host.locator('.lobby-seat-row .participant-role.is-offline').count(),guestCount,'reserved disconnected players have coral role icons');
        assert.equal(await host.locator('[data-command=lobby-start]').isDisabled(),true);
        assert.equal(await host.locator('[data-command=room-rules]').isDisabled(),true);
        for(let index=0;index<guests.length;index++){
          const guest=guests[index];await guest.reload();await guest.locator('#network-join-button').waitFor();
          await pair(host,guest);await guest.locator('.room-setup-modal .lobby-shell').waitFor({timeout:15000});
          const after=await identity(guest);
          assert.equal(after.participantId,before[index].participantId,'resume returns the original participant');
          assert.notEqual(after.token,before[index].token,'the private resume capability must rotate');
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
        await host.waitForFunction(()=>document.querySelectorAll('.network-presence .network-person.offline').length===0);
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
        const action=nextPage.locator('.table-shell.network-game .scene [data-action]').first();
        await action.waitFor({timeout:12000});await action.click();
        await host.waitForFunction(rev=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>rev,savedRevision);
        if(mode==='network-player'){
          // Android content:// cannot safely rely on location.reload() as an
          // exit mechanism. Leaving the game must close RTC and show the hub.
          await guests[0].evaluate(()=>{window.confirm=()=>true;});
          await guests[0].locator('.table-shell.network-game .table-header [data-command=home]').click();
          await guests[0].locator('.game-grid').waitFor({timeout:10000});
          await host.waitForFunction(()=>document.querySelectorAll('.network-presence .network-person.offline').length>=1);
        }
        // An unfinished match can also be parked and restored in the same page.
        // Releasing its authority must release the original lobby RTC leases.
        const parkedRevision=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
        await host.evaluate(()=>{window.confirm=()=>true;});
        await host.locator('.table-shell.network-game .table-header [data-command=home]').click();
        await host.locator('.game-grid').waitFor({timeout:10000});
        assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.roomId),null);
        await host.locator('[data-command=sessions]').click();
        await host.locator('[data-network-continue]').first().click();
        await host.locator('.room-setup-modal .lobby-shell').waitFor({timeout:10000});
        assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().recovery.revision),parkedRevision);
        assert.equal(await host.locator('[data-command=lobby-start]').isDisabled(),true);
        if(mode==='network-player'){
          await host.locator('[data-kick-participant="'+before[0].participantId+'"]').click();
          const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});contexts.push(context);
          const replacement=await context.newPage();replacement.on('pageerror',e=>errors.push('replacement '+e.message));await profile(replacement,'Замена',url);
          await pair(host,replacement);await replacement.locator('#net-client-join').evaluate(f=>f.requestSubmit());
          await replacement.locator('[data-net-seat="seat-2"]').click();
          await replacement.locator('[data-net-action=accept-replacement]').waitFor();
          assert.match(await replacement.locator('.replacement-consent').innerText(),/Гость 0/);
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
