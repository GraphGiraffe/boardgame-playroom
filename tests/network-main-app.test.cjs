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
    const offerLink=await value(host,'#net-host-token');
    const offerToken=await host.evaluate(link=>PlayroomPairing.extract(link),offerLink);
    assert.ok(offerToken?.startsWith('PR2.'));
    assert.equal(await host.locator('#net-host-token-qr').count(),1);
    await client.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),offerToken);
    await client.locator('#net-client-token').waitFor();
    const answerLink=await value(client,'#net-client-token');
    const answerToken=await client.evaluate(link=>PlayroomPairing.extract(link),answerLink);
    assert.ok(answerToken?.startsWith('PR2.'));
    assert.equal(await client.locator('#net-client-token-qr').count(),1);
    await host.evaluate(token=>navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-pair-token',token}})),answerToken);
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
    await client.locator('#net-client-join').evaluate(f=>f.requestSubmit());
    await client.locator('.lobby-shell').waitFor();

    const free=client.locator('[data-net-seat]:not([disabled])').first();await free.click();
    await host.locator('.lobby-person').filter({hasText:'Клиент'}).waitFor();
    await host.locator('[data-command=lobby-ready]').click();
    await client.locator('[data-net-action=ready]').click();
    await host.locator('[data-command=lobby-start]:not([disabled])').click();

    await host.locator('.shared-shell').waitFor({timeout:10000});await client.locator('.shared-shell').waitFor({timeout:10000});
    assert.equal(await host.locator('.shared-shell').getAttribute('data-viewer'),'0');
    assert.equal(await client.locator('.shared-shell').getAttribute('data-viewer'),'1');
    const before=Number(await host.locator('.shared-shell').getAttribute('data-revision'));
    const action=host.locator('.shared-scene [data-action]').first();await action.waitFor();await action.click();
    await client.waitForFunction(r=>Number(document.querySelector('.shared-shell')?.dataset.revision)>r,before);
    assert.ok(Number(await client.locator('.shared-shell').getAttribute('data-revision'))>before);
    assert.deepEqual(errors,[]);
  }finally{await Promise.all([hc.close(),cc.close()]);await browser.close();if(s)await new Promise(r=>s.close(r));}
});
