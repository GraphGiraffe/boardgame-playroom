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

for(const game of ['uno','domino','durak','checkers','snakes'])test('main app: shared-profile pairing, bots, privacy and pause in '+game,{timeout:90000,skip:!hasUno},async()=>{
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
    assert.equal(await host.locator('.lobby-person').filter({hasText:'Хост'}).first().locator('strong').innerText(),'Хост · хост');

    if(seatedGuest){const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();}
    await host.locator('.lobby-person').filter({hasText:'Гость из вкладки'}).waitFor();
    await host.locator('[data-command=lobby-ready]').click();
    if(seatedGuest)await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not([disabled])').click();

    await host.locator('.table-shell.network-game').waitFor({timeout:10000});await client.locator('.table-shell.network-game').waitFor({timeout:10000});
    assert.equal(await host.locator('.table-shell.network-game').getAttribute('data-viewer'),'0');
    assert.equal(await client.locator('.table-shell.network-game').getAttribute('data-viewer'),seatedGuest?'2':'-1');
    const before=Number(await host.locator('.table-shell.network-game').getAttribute('data-revision'));
    await host.locator('.table-tools [data-command=pause]').click();await client.waitForFunction(()=>document.querySelector('.table-status').textContent.toLowerCase().includes('пауз'));
    const resumer=seatedGuest?client:host;
    if(!seatedGuest)assert.equal(await client.locator('.table-tools [data-command=pause]').isEnabled(),false);
    await resumer.locator('.table-tools [data-command=pause]').click();
    await host.waitForFunction(()=>!document.querySelector('.table-status').textContent.toLowerCase().includes('пауз'));
    if(game==='checkers'){await host.locator('.checker-piece.movable').first().click();await host.locator('.checker-cell.destination').first().click();}
    else if(game==='domino'||game==='durak'){const card=host.locator('.layout-hand .is-playable').first();await card.scrollIntoViewIfNeeded();const point=await card.evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+8,y:r.y+16};});await host.mouse.click(point.x,point.y);if(game==='domino')await host.locator('.domino-drop-target[data-action]').first().click();}
    else await host.locator(game==='uno'?'.stock-button[data-action]':'.die[data-action]').click();
    await client.waitForFunction(r=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>r,before);
    assert.ok(Number(await client.locator('.table-shell.network-game').getAttribute('data-revision'))>before);
    if(game!=='uno')await client.waitForFunction(()=>Number(document.querySelector('.table-shell.network-game')?.dataset.revision)>=2);
    assert.equal(await client.locator('.opponent-hand .public-card').count(),0,'hidden opponent hands never expose card faces');
    assert.equal(await host.locator('.player-panel').count(),seatedGuest?3:2);
    assert.deepEqual(errors,[]);
  }finally{await hc.close();await browser.close();if(s)await new Promise(r=>s.close(r));}
});
