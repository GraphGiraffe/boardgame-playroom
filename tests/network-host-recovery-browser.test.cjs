'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');
const hasUno=fs.existsSync(path.join(root,'packs/uno/manifest.json'))&&fs.existsSync(path.join(root,'installed-packs.js'));

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
async function pair(host,guest){
  // The same live PR2/PR3 offer/answer flow used by the normal QR screen.
  // Browser text transport avoids requiring a camera in CI; the QR decoder
  // itself is already exercised by qr-pairing-browser.test.cjs.
  await host.locator('#network-pair-button').click();
  await host.locator('#net-host-token').waitFor();
  const offer=await host.locator('#net-host-token').inputValue();
  assert.match(await host.evaluate(value=>PlayroomPairing.extract(value),offer),/^PR[23]\./);
  await guest.locator('#network-join-button').click();
  await guest.locator('#net-client-offer textarea[name=offer]').fill(offer);
  await guest.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
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
        await host.locator('[data-start="uno"]').click();
        await host.locator(`#setup-form input[name=mode][value=${mode}]`).check();
        await host.locator('#setup-form input[name=roomName]').fill('Продолжение LAN-01');
        await host.locator('#setup-form').evaluate(f=>f.requestSubmit());
        await host.locator('.lobby-shell').waitFor();
        for(const guest of guests){
          await pair(host,guest);
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
        await host.locator('.table-shell.network-game [data-command=home]').first().click();
        await host.locator('[data-network-continue]').first().click();
        await host.locator('.table-shell.network-game').waitFor({timeout:15000});
        assert.equal(Number(await host.locator('.table-shell.network-game').getAttribute('data-revision')),savedRevision);
        assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),mode==='network-table'?'-1':'0');
        await host.waitForFunction(count=>document.querySelectorAll('.network-presence .network-person.offline').length===count,guestCount);
        for(let index=0;index<guests.length;index++){
          const guest=guests[index];await guest.reload();await guest.locator('#network-join-button').waitFor();
          await pair(host,guest);
          await guest.locator('.table-shell.network-game').waitFor({timeout:15000});
          const after=await identity(guest);
          assert.equal(after.participantId,before[index].participantId,'resume returns the original participant');
          assert.notEqual(after.token,before[index].token,'the private resume capability must rotate');
          assert.equal(await guest.locator('.table-shell.network-game').getAttribute('data-viewer'),String(mode==='network-player'?index+1:index));
          assert.equal(Number(await guest.locator('.table-shell.network-game').getAttribute('data-revision')),savedRevision);
        }
        await host.waitForFunction(()=>document.querySelectorAll('.network-presence .network-person.offline').length===0);
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
        assert.deepEqual(errors,[]);
      }finally{
        await Promise.all(contexts.map(c=>c.close().catch(()=>{})));await browser.close();
        await new Promise(resolve=>listener.close(resolve));
      }
    });
}
