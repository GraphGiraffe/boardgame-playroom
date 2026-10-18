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
async function profile(page,name){await page.goto(page._url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();}
async function value(page,selector){return page.locator(selector).inputValue();}

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
    await host.locator('[data-room-option=transportMode]').check();await host.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});const seatedGuest=!['durak','checkers'].includes(game);
    await host.locator('[data-room-title]').fill('Тестовая комната');
    await host.locator('[data-room-title]').press('Tab');
    await host.locator('.lobby-shell').waitFor();await host.locator('#network-pair-button').click();
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
    assert.match(await client.locator('.modal').innerText(),/Тестовая комната/);
    await client.locator('#net-client-join input[name=nickname]').fill('Гость из вкладки');
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();
    const identity=await client.evaluate(()=>globalThis.PlayroomNetworkDebug().client.participantId);
    const hostIdentity=await host.evaluate(()=>globalThis.PlayroomAppBridge.participantId());
    assert.ok(identity&&hostIdentity);
    assert.notEqual(identity,hostIdentity,'The guest must not be treated as the host');
    assert.equal(await host.locator('.lobby-person').filter({hasText:'Хост'}).count(),1);
    assert.equal(await host.locator('.lobby-person').filter({hasText:'Хост'}).first().locator('strong').innerText(),'Хост');

    const hostRole=host.locator('.lobby-person [data-participant-role=player].is-online:has(svg[data-ui-icon=host])');
    assert.equal(await hostRole.count(),1,'Host keeps the online player role');
    assert.equal(await hostRole.locator('svg[data-ui-icon=player]').count(),0,'Host crown replaces the primary network-player icon');
    assert.equal(await hostRole.locator('svg[data-ui-icon=host]').count(),1,'Host crown identifies the host without repeating the name');
    await client.locator('[data-net-action=table]').click();await client.locator('.lobby-table-slot [data-participant-id]').waitFor();
    if(seatedGuest){const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();}
    await host.locator('.lobby-person').filter({hasText:'Гость из вкладки'}).waitFor();
    await host.locator('[data-command=lobby-ready]').click();
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
    await host.locator('.table-tools [data-command=pause]').click();await client.waitForFunction(()=>document.querySelector('.table-status').textContent.toLowerCase().includes('пауз'));
    const resumer=seatedGuest?client:host;
    if(!seatedGuest)assert.equal(await client.locator('.table-tools [data-command=pause]').isEnabled(),false);
    await resumer.locator('.table-tools [data-command=pause]').click();
    await host.waitForFunction(()=>!document.querySelector('.table-status').textContent.toLowerCase().includes('пауз'));
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
