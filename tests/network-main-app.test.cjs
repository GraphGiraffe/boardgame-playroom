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
async function profile(page,name){await page.goto(page._url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').waitFor();}
async function value(page,selector){return page.locator(selector).inputValue();}

test('main app: two browsers join UNO lobby, ready, countdown and share a move',{timeout:90000,skip:!hasUno},async()=>{
  const externalUrl=process.env.PLAYROOM_URL||'';
  const hosted=externalUrl?{s:null,url:externalUrl}:await server();
  const {s,url}=hosted,browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const hc=await browser.newContext({playroomProfile:false,viewport:{width:1000,height:780}}),cc=await browser.newContext({playroomProfile:false,viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  await cc.addInitScript(()=>{
    const RTC=window.RTCPeerConnection;window.qaRTCs=[];
    window.RTCPeerConnection=class extends RTC{constructor(...args){super(...args);qaRTCs.push(this);}};
  });
  const host=await hc.newPage(),client=await cc.newPage();host._url=url;client._url=url;
  const errors=[];host.on('pageerror',e=>errors.push('host: '+e.message));client.on('pageerror',e=>errors.push('client: '+e.message));
  try{
    await profile(host,'Хост');await profile(client,'Клиент');
    await host.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await client.evaluate(()=>{const t=document.querySelector('#toast');if(t){t.textContent='';t.classList.remove('show');}});
    await host.locator('[data-start="uno"]').click();
    await host.locator('#setup-form input[name=mode][value=network-player]').check();
    await host.locator('#setup-form input[name=roomName]').fill('Тестовая комната');
    await host.locator('#setup-form').evaluate(f=>f.requestSubmit());
    await host.locator('.lobby-shell').waitFor();await host.locator('#network-pair-button').click();
    // Every ICE candidate supplied by the browser is visible in the IP selector;
    // manual choice remains available for browsers that hide interfaces behind mDNS.
    await host.locator('[data-net-scan="host"]').waitFor();
    assert.equal(await host.locator('[data-net-scan="host"]').count(),1);
    assert.ok(await host.locator('#acoustic-host-address option').count()>=1);
    assert.match((await host.locator('#acoustic-host-address').innerText()),/Ввести IPv4 вручную/);
    assert.equal(await host.locator('#acoustic-host-protocol').inputValue(),'fastest');

    assert.equal(await host.locator('#net-host-acoustic-send').count(),1,
      'The host must be able to send a sound invitation without microphone access');
    assert.equal(await host.locator('#net-host-acoustic-listen').count(),1,
      'Audio listening and playback are independent actions');

    const previousAddress=await host.locator('#acoustic-host-address').inputValue();
    const previousManual=await host.locator('#acoustic-host-manual').inputValue();
    assert.equal(await host.locator('#acoustic-host-manual').getAttribute('placeholder'),'Например: 192.168.1.100',
      'Manual IP placeholder is an example, not a detected network address');
    await host.locator('#acoustic-host-address').selectOption('manual');
    await host.locator('#acoustic-host-manual').fill('192.168.44.66');
    const manualLink=await value(host,'#net-host-token');
    const manualToken=await host.evaluate(link=>PlayroomPairing.extract(link),manualLink);
    assert.ok(manualToken.startsWith('PR3.'),'a manually chosen real IP must yield compact QR/link');
    const manualInfo=await host.evaluate(token=>PlayroomPairing.decode(token),manualToken);
    assert.equal(manualInfo.ip,'192.168.44.66');
    assert.ok(manualToken.length<200);
    assert.match(await host.locator('#acoustic-host-mode').innerText(),/компактное приглашение/);
    // A saved manual address is an explicit option, clearly marked as user-entered.
    await host.locator('[data-net-save-ip="host"]').click();
    assert.match(await host.locator('#acoustic-host-address').innerText(),/192.168.44.66/);
    assert.match(await host.locator('#acoustic-host-address').innerText(),/внесён пользователем/);
    assert.match(await host.locator('#acoustic-host-discovery').textContent(),/сохранённые IP: 1/i);
    if(previousAddress==='manual'){
      await host.locator('#acoustic-host-address').selectOption('manual');
      await host.locator('#acoustic-host-manual').fill(previousManual);
    }else await host.locator('#acoustic-host-address').selectOption(previousAddress);

    const offerLink=await value(host,'#net-host-token');
    const offerToken=await host.evaluate(link=>PlayroomPairing.extract(link),offerLink);
    assert.match(offerToken||'',/^PR[23]\./);
    assert.equal(await host.locator('#net-host-token-qr').count(),1);
    const pwaHandoff=new URL(url).protocol!=='file:';
    if(pwaHandoff){
      await client.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),offerToken);
    }else{
      await client.locator('#network-join-button').click();
      await client.locator('#net-client-offer textarea[name=offer]').fill(offerLink);
      await client.locator('#net-client-offer').evaluate(form=>form.requestSubmit());
    }
    await client.locator('#net-client-token').waitFor();
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
    assert.match(await client.locator('.modal').innerText(),/Тестовая комната/);
    assert.match(await client.locator('.modal').innerText(),/UNO/);
    assert.match(await client.locator('.modal').innerText(),/Объявление UNO/);
    assert.match(await client.locator('.modal').innerText(),/Вручную · можно ошибаться/);
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();

    assert.equal(await client.locator('.lobby-shell input,.lobby-rules-summary,.lobby-participants').count(),0);
    await client.locator('[data-net-action=rules]').click();
    assert.equal(await client.locator('.modal .lobby-rule-grid').count(),1);
    assert(await client.locator('.modal .rules-list li').count()>0);
    await client.locator('.modal [data-command=close-modal]').click();
    await client.locator('[data-net-action=settings]').click();
    await client.locator('#net-client-nickname input').fill('Клиент новый');
    await client.locator('#net-client-nickname').evaluate(f=>f.requestSubmit());
    await host.locator('.lobby-person').filter({hasText:'Клиент новый'}).waitFor();
    assert.equal(await client.evaluate(()=>document.querySelector('#app').inert),true,'nickname ACK must preserve modal inert');
    await client.locator('#net-client-nickname input').fill('Клиент');
    await client.locator('#net-client-nickname').evaluate(f=>f.requestSubmit());
    await client.locator('.modal [data-command=close-modal]').click();

    const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();
    await host.locator('.lobby-person').filter({hasText:'Клиент'}).waitFor();
    await host.locator('[data-command=lobby-ready]').click();
    await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not([disabled])').click();

    await host.locator('.table-shell.network-game').waitFor({timeout:10000});await client.locator('.table-shell.network-game').waitFor({timeout:10000});
    assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),'0');
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-viewer'),'1');
    // Network mode MUST use the local bot/hot-seat GameScreen, not a compact
    // second shell. Opponent hands are visible without exposing hidden faces.
    for(const page of [host,client]){
      assert.equal(await page.locator('.table-shell.network-game .table-header').count(),1);
      assert.equal(await page.locator('.table-shell.network-game .player-strip .player-token').count(),2);
      assert.equal(await page.locator('.table-shell.network-game .player-strip').isVisible(),true);
      assert.equal(await page.locator('.table-shell.network-game .scene .opponent-hand').count(),1);
      assert.equal(await page.locator('.table-shell.network-game .scene .own-hand').count(),1);
      assert.equal(await page.locator('.table-tools [data-command=history] svg').count(),1);
      assert.equal(await page.locator('.table-tools [data-command=rules] svg').count(),1);
      assert.equal(await page.locator('.opponent-hand .uno-art-face').count(),0,'Opponent private card faces must stay hidden');
    }
    const before=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
    const action=host.locator('.table-shell.network-game .scene [data-action]').first();await action.waitFor();await action.click();
    await client.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.ok(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'))>before);
    // History is the same inline panel as local play, read-only and not a
    // detached modal with a lone slider. Its navigation does not move live game.
    const latest=Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'));
    await client.locator('.table-tools [data-command=history]').click();
    await client.locator('.history-panel').waitFor();
    assert.equal(await client.locator('.history-panel #replay-range').count(),1);
    assert.equal(await client.locator('.history-controls [data-command=replay-prev]').count(),1);
    assert.equal(await client.locator('.history-controls [data-command=replay-play]').count(),1);
    assert.equal(await client.locator('.history-controls [data-command=replay-next]').count(),1);
    assert.equal(await client.locator('.table-shell.network-game .scene [data-action]').count(),0,'History is read-only');
    await client.locator('.history-controls [data-command=replay-prev]').click();
    await client.waitForFunction(()=>document.querySelector('.history-panel .replay-badge')?.textContent?.trim().startsWith('0 /'));
    assert.equal(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision')),latest,'Replay must not change the live revision');
    await client.locator('.history-panel [data-command=history-close]').click();
    assert.equal(await client.locator('.history-panel').count(),0);

    const identity=await client.evaluate(()=>{
      window.qaLiveRTC=qaRTCs.find(peer=>peer.connectionState==='connected');
      return {participant:PlayroomNetworkDebug().client.participantId,peers:qaRTCs.length};
    });
    // Finish after a real legal command, keeping authority persistence, RTC
    // snapshots and all result/lobby lifecycle code in the real application.
    // The fixture shortens UNO only in this browser; published packs are intact.
    await host.evaluate(()=>{
      const apply=TabletopCore.applyAction;
      TabletopCore.applyAction=(...args)=>{const next=apply(...args);TabletopCore.finish(next,args[1],'Тестовая партия завершена');return next;};
    });
    for(const exit of ['guest','host']){
      const actor=await host.locator('.scene [data-action]').count()?host:client;
      await actor.locator('.scene [data-action]').first().click();
      await host.locator('.shared-modal-backdrop').waitFor();
      await client.locator('.shared-modal-backdrop').waitFor();
      await client.locator('.shared-modal-backdrop [data-command=close-modal]').click();
      assert.equal(await client.locator('.shared-modal-backdrop').count(),0);
      await client.locator('[data-command=result]').click();
      await client.locator('.shared-modal-backdrop [data-command=result-replay]').click();
      await client.locator('.history-panel').waitFor();
      await client.locator('[data-command=history-close]').click();
      await client.locator('[data-command=result]').click();
      if(exit==='guest'){
        await client.locator('.shared-modal-backdrop [data-command=home]').click();
        await client.locator('.lobby-shell').waitFor();
        assert.equal(await client.locator('.shared-modal-backdrop').count(),0,'Guest exit must remove its result dialog');
      }
      await host.locator('.shared-modal-backdrop [data-command=home]').click();
      await host.locator('.lobby-shell').waitFor();
      await client.locator('[data-net-action=ready]:not(:disabled)').waitFor();
      assert.equal(await client.locator('.shared-modal-backdrop').count(),0,'Host transition must remove the guest result dialog');
      assert.equal(await client.locator('#app').evaluate(e=>e.inert),false);
      await host.locator('[data-command=lobby-ready]').click();
      await client.locator('[data-net-action=ready]').click();
      await host.locator('[data-command=lobby-start]:not(:disabled)').click();
      await client.locator('.table-shell.network-game').waitFor({timeout:10000});
      await host.locator('.table-shell.network-game').waitFor({timeout:10000});
      assert.deepEqual(await client.evaluate(()=>({participant:PlayroomNetworkDebug().client.participantId,
        peers:qaRTCs.length,state:qaLiveRTC.connectionState})),{...identity,state:'connected'});
    }

    // Leave a completed match through its lobby, then continue a saved room
    // without reloading. The app and network module must release the same room.
    const lastActor=await host.locator('.scene [data-action]').count()?host:client;
    await lastActor.locator('.scene [data-action]').first().click();
    await host.locator('.shared-modal-backdrop [data-command=home]').click();
    await host.locator('.lobby-shell').waitFor();
    const archiveId=await host.evaluate(async()=>
      (await PlayroomNetworkLibrary.list()).find(item=>item.role==='host').sessionId);
    await host.evaluate(id=>PlayroomNetworkLibrary.continue(id),archiveId);
    assert.match(await host.locator('#toast').innerText(),/Сначала завершите текущую сетевую комнату/,
      'an active lobby must still prevent restoring a second room');
    await host.locator('[data-command=lobby-leave]').click();
    await host.locator('[data-command=sessions]').click();
    await host.locator('[data-network-history]').first().click();
    await host.locator('.table-shell.network-game .history-panel').waitFor();
    await host.locator('.table-shell.network-game [data-command=home]').first().click();
    await host.locator('[data-network-continue]').first().click();
    await host.locator('.table-shell.network-game').waitFor({timeout:10000});
    assert.equal(await host.evaluate(()=>PlayroomNetworkDebug().host.connectedPeers),0,
      'leaving the lobby must close its old RTC connections');

    assert.deepEqual(errors,[]);
  }finally{await Promise.all([hc.close(),cc.close()]);await browser.close();if(s)await new Promise(r=>s.close(r));}
});
