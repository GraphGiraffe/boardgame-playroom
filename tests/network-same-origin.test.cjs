'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..'),hasUno=fs.existsSync(path.join(root,'packs/uno/manifest.json'))&&fs.existsSync(path.join(root,'installed-packs.js'));

function server(){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
  const s=http.createServer((req,res)=>{const u=new URL(req.url,'http://x'),rel=u.pathname==='/'?'index.html':u.pathname.slice(1),file=path.resolve(root,rel);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end();}
    res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});res.end(fs.readFileSync(file));
  });return new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve({s,url:'http://127.0.0.1:'+s.address().port+'/'})));
}
async function profile(page,name){await page.goto(page._url);await page.locator('#profile-form [name=playerName]').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();}
async function value(page,selector){return page.locator(selector).inputValue();}
const active=page=>page.locator('#modal-root>[data-surface-state=active]');
async function textReceive(page,form){
  if(await page.locator(form).isVisible())return;
  const receive=active(page).locator('[role=tab][data-nearby-direction=receive]');
  if(await receive.count()&&!await receive.isDisabled())await receive.click();
  await active(page).locator('[role=tab][data-nearby-method=text]').click();
  await page.locator(form).waitFor();
}
async function togglePause(page){await page.locator('[data-game-menu]').click();await active(page).locator('[data-game-menu-action][data-command=pause]').click();}
async function setHostInvitationPermission(page,allowed){
  await page.locator('.room-setup-modal [data-room-context]').click();
  await page.locator('.room-context-modal [data-room-invite-permission]').setChecked(allowed);
  await page.locator('.room-context-modal .modal-head [data-command=close-modal]').click();
}

for(const game of ['uno','domino','durak','checkers','snakes','oldmaid','ludo','yatzy'])test('main app: shared-profile pairing, bots, privacy and pause in '+game,{timeout:90000,skip:!hasUno},async()=>{
  const externalUrl=process.env.PLAYROOM_URL||'';
  const hosted=externalUrl?{s:null,url:externalUrl}:await server();
  const {s,url}=hosted,browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),cc=hc;
  const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  const errors=[];host.on('pageerror',e=>errors.push('host: '+e.message));client.on('pageerror',e=>errors.push('client: '+e.message));
  try{
    await profile(host,'Хост');await client.goto(url);
    await client.setViewportSize({width:390,height:740});
    const hostProfile=await host.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')));
    const clientProfile=await client.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')));
    assert.equal(hostProfile.id,clientProfile.id,'Tabs must share the same browser profile');

    await host.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await client.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await host.locator('[data-start="'+game+'"]').click();
    await host.locator('[data-game-mode=network]').click();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});const seatedGuest=!['durak','checkers'].includes(game);
    await host.locator('.room-setup-modal [data-room-context]').click();
    await host.locator('.room-context-modal [data-room-title]').fill('Тестовая комната');
    await host.locator('.room-context-modal [data-room-name-save]').click();
    await host.locator('.lobby-shell').waitFor();await host.locator('#network-pair-button').click();
    const offerLink=await value(host,'#net-host-token');
    const offerToken=await host.evaluate(link=>PlayroomPairing.extract(link),offerLink);
    assert.match(offerToken||'',/^PR[23]\./);
    assert.equal(await host.locator('#net-host-token-qr').count(),1);
    const pwaHandoff=new URL(url).protocol!=='file:';
    if(pwaHandoff){
      await client.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),offerToken);
    }else{
      await client.locator('#network-join-button').click();await client.locator('[data-lobby-online=manual]').click();
      await client.locator('#net-client-offer textarea[name=offer]').fill(offerLink);
      await client.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    }
    await client.locator('#net-client-token').waitFor({state:'attached'});
    const answerLink=await value(client,'#net-client-token');
    const answerToken=await client.evaluate(link=>PlayroomPairing.extract(link),answerLink);
    assert.match(answerToken||'',/^PR[23]\./);
    assert.equal(await client.locator('#net-client-token-qr').count(),1);
    if(pwaHandoff){
      await host.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),answerToken);
    }else{
      await host.locator('#net-host-answer textarea[name=answer]').fill(answerLink);
      await host.locator('#net-host-answer').evaluate(form=>form.requestSubmit());
    }
    try{await host.locator('#net-host-answer').waitFor({state:'detached',timeout:12000});}
    catch(_){
      const diag=await host.evaluate(()=>({toast:document.querySelector('#toast')?.textContent||'',modal:document.querySelector('.modal')?.innerText||''}));
      assert.fail('Host did not accept WebRTC answer: '+JSON.stringify(diag));
    }
    try{await client.locator('#net-client-join').waitFor({timeout:12000});}
    catch(_){
      const [clientDiag,hostDiag]=await Promise.all([
        client.evaluate(()=>({toast:document.querySelector('#toast')?.textContent||'',modal:document.querySelector('.modal')?.innerText||'',network:globalThis.PlayroomNetworkDebug?.()})),
        host.evaluate(()=>({toast:document.querySelector('#toast')?.textContent||'',modal:document.querySelector('.modal')?.innerText||'',network:globalThis.PlayroomNetworkDebug?.()}))
      ]);
      assert.fail('Client did not receive room preview after host accepted answer: '+JSON.stringify({client:clientDiag,host:hostDiag}));
    }
    assert.match(await active(client).innerText(),/Тестовая комната/);
    await client.locator('#net-client-join input[name=nickname]').fill('Гость из вкладки');
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();
    if(game==='uno'){
      assert.equal(await client.locator('#network-pair-button').count(),0);
      await setHostInvitationPermission(host,true);await client.locator('#network-pair-button').waitFor();
      await client.locator('#network-pair-button').click();const delegated=await value(client,'#net-delegated-token');
      const thirdContext=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740}});await thirdContext.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'third-client',name:'Приглашённый',createdAt:1,updatedAt:1})));const third=await thirdContext.newPage();third.on('pageerror',e=>errors.push('third: '+e.message));await third.goto(url);
      await third.locator('#network-join-button').click();await third.locator('[data-lobby-online=manual]').click();await textReceive(third,'#net-client-offer');await third.locator('#net-client-offer textarea[name=offer]').fill(delegated);await third.locator('#net-client-offer').evaluate(f=>f.requestSubmit());
      await third.locator('#net-client-token').waitFor({state:'attached'});const answer=await value(third,'#net-client-token');await textReceive(client,'[data-delegated-answer]');await client.locator('[data-delegated-answer] textarea').fill(answer);await client.locator('[data-delegated-answer]').evaluate(f=>f.requestSubmit());
      try{await third.locator('#net-client-join').waitFor({timeout:12000});}catch(e){throw Error(JSON.stringify(await Promise.all([host,client,third].map(p=>p.evaluate(()=>({toast:document.querySelector('#toast')?.textContent,debug:PlayroomNetworkDebug(),modal:document.querySelector('.modal')?.innerText}))))));}await third.locator('#net-client-join input[name=nickname]').fill('Приглашённый');await third.locator('#net-client-join').evaluate(f=>f.requestSubmit());await third.locator('.lobby-shell').waitFor();
      assert.equal(await third.evaluate(()=>PlayroomNetworkLibrary.inviteContext().room.ownerId),await host.evaluate(()=>PlayroomAppBridge.participantId()));
      await setHostInvitationPermission(host,false);await client.locator('#network-pair-button').waitFor({state:'detached'});
      assert.equal(await third.evaluate(()=>PlayroomNetworkLibrary.inviteContext().room.participants.some(p=>p.id===PlayroomNetworkLibrary.inviteContext().participantId&&p.connected)),true);
      console.log('A13 actual RTC: permission enable, delegated third-client join, revoke and existing-client preservation passed');
      if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await third.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'delegated-newcomer.png')});}
      await thirdContext.close();
    }
    const identity=await client.evaluate(()=>globalThis.PlayroomNetworkDebug().client.participantId);
    const hostIdentity=await host.evaluate(()=>globalThis.PlayroomAppBridge.participantId());
    assert.ok(identity&&hostIdentity);
    assert.notEqual(identity,hostIdentity,'The guest must not be treated as the host');
    const hostRow=host.locator(`.room-v021-row[data-participant-id="${hostIdentity}"]`);
    assert.equal(await hostRow.count(),1,'host identity has one participant row');
    assert.equal(await hostRow.locator('strong').innerText(),'Хост');
    assert.match(await host.locator('.room-v021-game-copy').innerText(),/хост Хост/,'the current layout identifies the host in its room summary');
    assert.equal(await host.evaluate(id=>PlayroomAppBridge.room().participants.filter(p=>p.isHost&&p.id===id&&p.role==='player').length,hostIdentity),1,'host retains its player role');
    await client.locator(`[data-room-person="${identity}"] .room-v021-person-copy`).click();await active(client).locator('[data-net-action=table]').click();
    await client.waitForFunction(id=>PlayroomNetworkLibrary.inviteContext().room.participants.some(p=>p.id===id&&p.role==='table'),identity);
    if(await active(client).locator('.friend-profile-modal').count())await active(client).locator('.modal-head [data-command=close-modal]').click();
    if(seatedGuest){const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();const claim=active(client).locator('[data-seat-choice=claim]');if(await claim.count())await claim.click();}
    await host.locator('.room-v021-row').filter({hasText:'Гость из вкладки'}).waitFor();
    for(const page of [host,client])await page.evaluate(game=>PlayroomFirstTurnGuide.setEnabled(game,false),game);
    const auto=host.locator('[data-room-auto-start]');if(await auto.isChecked())await auto.uncheck();await host.locator('[data-command=lobby-ready]').click();
    if(seatedGuest)await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not([disabled])').click();

    await host.locator('.table-shell.network-game').waitFor({timeout:10000});await client.locator('.table-shell.network-game').waitFor({timeout:10000});
    assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),'0');
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-viewer'),seatedGuest?'2':'-1');
    for(const [role,page] of [['host',host],['client',client]]){
      for(const [width,height] of [[320,640],[390,740],[740,390],[1024,768],[1440,900]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(80);
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1),true,`${game} ${role} ${width}×${height} overflow`);
        assert.equal(await page.locator('.player-panel').count(),await page.evaluate(()=>document.querySelectorAll('.player-info').length));
        assert.equal(await page.locator('.network-person.online').count(),0,'connected names belong to the player cards');
        if(process.env.PLAYROOM_CAPTURE_DIR){fs.mkdirSync(process.env.PLAYROOM_CAPTURE_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,`network-${game}-${role}-${width}x${height}.png`)});}
      }
      await page.setViewportSize(role==='host'?{width:1000,height:780}:{width:390,height:740});
    }
    const before=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
    await togglePause(host);await client.waitForFunction(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot?.paused===true);
    const resumer=seatedGuest?client:host;
    if(!seatedGuest){await client.locator('[data-game-menu]').click();const pause=active(client).locator('[data-game-menu-action][data-command=pause]');assert.equal(await pause.count()===0||await pause.isDisabled(),true);await active(client).locator('[data-game-menu-close]').first().click();}
    await togglePause(resumer);
    await host.waitForFunction(()=>PlayroomNetworkLibrary.playerControlContext()?.snapshot?.paused===false);
    if(game==='checkers'){await host.locator('.checker-piece.movable').first().click();await host.locator('.checker-cell.destination').first().click();}
    else if(game==='domino'||game==='durak'){const card=host.locator('.layout-hand .is-playable').first();await card.scrollIntoViewIfNeeded();const point=await card.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+8,y:r.y+16};});await host.mouse.click(point.x,point.y);if(game==='domino')await host.locator('.domino-drop-target[data-action]').first().click();}
    else if(game==='oldmaid'){await host.locator('[data-player-target]').first().click();await host.locator('.player-target-menu [data-card-index]').first().click();}
    else await host.locator(game==='uno'?'.stock-button[data-action]':game==='ludo'?'.shared-die[data-action]':game==='yatzy'?'.yatzy-roll[data-action]':'.die[data-action]').first().click();
    await client.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.ok(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'))>before);
    if(!['uno','ludo','yatzy','snakes'].includes(game))await client.waitForFunction(()=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>=2);
    assert.equal(await client.locator('.opponent-hand .public-card').count(),0,'hidden opponent hands never expose card faces');
    assert.equal(await host.locator('.player-panel').evaluateAll(nodes=>new Set(nodes.map(node=>node.dataset.playerIndex)).size),seatedGuest?3:2);
    assert.deepEqual(errors,[]);
  }finally{await hc.close();await browser.close();if(s)await new Promise(r=>s.close(r));}
});
