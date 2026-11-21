'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');

test('PWA manifest exposes share target and custom Playroom protocol',()=>{
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.display,'standalone');
  assert.deepEqual(manifest.related_applications,[{platform:'webapp',url:'./manifest.webmanifest',id:manifest.id}]);
  assert.equal(manifest.prefer_related_applications,false);
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
  const origin='https://example.test';
  for(const deployment of ['/playroom/','/playroom-hod-test/']){
    const start=new URL(manifest.start_url,origin+deployment+'manifest.webmanifest');
    assert.equal(new URL(manifest.id,start.origin).href,origin+'/playroom','installation identity must be stable and distinct from the shared origin root');
  }
  assert.equal(manifest.share_target.method,'GET');
  assert.equal(manifest.share_target.params.text,'text');
  assert.ok(manifest.protocol_handlers.some(item=>item.protocol==='web+playroom'&&item.url.includes('%s')));
  assert.deepEqual(manifest.launch_handler.client_mode,['focus-existing','auto']);
  assert.ok(manifest.icons.some(item=>item.src==='icons/icon-192.png'&&item.sizes==='192x192'&&item.type==='image/png'));
  assert.ok(manifest.icons.some(item=>item.src==='icons/icon-512.png'&&item.sizes==='512x512'&&item.type==='image/png'));
  assert.ok(manifest.icons.some(item=>item.src==='icons/playroom.svg'));
});

test('service worker precaches pairing/PWA shell and has offline navigation fallback',()=>{
  const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  for(const file of ['platform/web/interface-scale.js','app/interface-scale.css','core/messages.js','app/pairing.js','app/acoustic-pairing.js','app/vendor/ggwave.js','application/pwa-update-coordinator.js','app/pwa.js','app/qr.js','app/vendor/qrcode.js','app/vendor/LICENSE.qrcode','app/vendor/jsqr.js','app/qr-scanner.js','application/history-sync-service.js','application/host-session-service.js','app/pairing-presenter.js','application/connection-attempt.js','application/online-connection.js','application/transfer-peer.js','app/network-social.js','app/network-presence.js','app/network-ui.js','platform/web/session-store.js','app/network-client-history.js','application/history-controller.js','application/game-screen-controller.js','platform/web/dom.js','app/game-screen.js','presentation/event-plan.js','app/game-feedback.js','app/game-interactions.css','core/player-target.js','core/game-flow.js','core/hand-overflow.js','manifest.webmanifest'])assert.ok(source.includes(file),file);
  assert.match(source,/request\.mode==='navigate'/);
  assert.match(source,/caches\.open\(CACHE\)\)\.match\('\.\/index\.html'\)/);
  assert.match(source,/app\/vendor\/qrcode\.js/);
  assert.match(source,/playroom-pair-token/);
  assert.match(source,/PR2\|PR3/,'service-worker pairing links must accept compact PR3');
  assert.match(source,/clients\.matchAll/);
});


test('index HTML does not contain escaped newlines between tags',()=>{
  const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.equal(source.includes('\\n  <'),false,'literal \\n between HTML tags changes parser/layout behavior');
  assert.match(source,/rel="manifest" href="manifest\.webmanifest"/);
  assert.match(source,/src="app\/pairing\.js"/);
  assert.match(source,/src="app\/pwa\.js"/);
  assert.match(source,/src="app\/qr\.js"/);
  assert.match(source,/src="app\/vendor\/qrcode\.js"/);
  assert.match(source,/src="app\/vendor\/jsqr\.js"/);
  assert.match(source,/src="app\/qr-scanner\.js"/);
  assert.match(source,/src="app\/acoustic-pairing\.js"/);
  assert.match(source,/src="app\/vendor\/ggwave\.js"/);
  assert.match(source,/src="app\/game-screen\.js"/);
  assert.match(source,/src="platform\/web\/session-store\.js"/);
  assert.match(source,/src="app\/network-client-history\.js"/);
  assert.match(source,/src="core\/game-flow\.js"/);
  assert.match(source,/src="core\/hand-overflow\.js"/);
  assert.match(source,/src="core\/player-target\.js"/);
  assert.match(source,/src="app\/game-feedback\.js"/);
});

test('offline pairing UI provides speaker-only mode and explains blocked microphone',()=>{
  const ui=['application/history-sync-service.js','application/host-session-service.js','app/pairing-presenter.js','app/network-social.js','app/network-presence.js','app/network-ui.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  const acoustic=fs.readFileSync(path.join(root,'app/acoustic-pairing.js'),'utf8');
  assert.match(ui,/net-host-acoustic-send/,'speaker-only invitation must be offered');
  assert.match(ui,/async function sendHostSoundOnly\(signal\)/);
  assert.match(ui,/await ports\.Acoustic\.play\(message,\{protocol,signal\}\)/);
  assert.match(ui,/captureDisabled\(\)/,'capture buttons are disabled for unsupported origins');
  assert.match(ui,/captureNotice\(\)/,'show an actionable microphone warning');
  assert.match(ui,/net-client-acoustic-listen/);
  assert.match(acoustic,/function microphoneIssue\(/);
  assert.match(acoustic,/function explainMicrophoneError\(/);
});

test('remote pack loader checks URL, SHA256 and manifest before installation',async()=>{
 const crypto=require('node:crypto'),{RemoteCatalog,validate}=require('../app/remote-catalog.js');
 const bundle={manifest:{id:'uno',version:'0.4.9',stateVersion:1,engineApi:4,viewApi:3}};
 const bytes=Buffer.from(JSON.stringify(bundle)),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const item={...bundle.manifest,sha256:sha,url:`/api/packs/files/uno/0.4.9/${sha}.playroom-pack.json`};
 const catalog={format:'playroom-catalog',version:1,collection:'0.6.0',packs:[item]};
 assert.throws(()=>validate({...catalog,packs:[{...item,url:'/other-origin'}]}));
 assert.throws(()=>validate({...catalog,packs:[item,item]}));
 assert.doesNotThrow(()=>validate({...catalog,packs:[{...item,name:'Игра',tagline:'Описание.',byteSize:1234}]}));assert.throws(()=>validate({...catalog,packs:[{...item,tagline:42}]}));assert.throws(()=>validate({...catalog,packs:[{...item,byteSize:5*1024*1024}]}));
 let installed=0,corrupt=false;
 const manager={list:()=>[],parse:JSON.parse,prepare:value=>value,install:value=>{installed++;return value;}};
 const storage=new Map(),client=new RemoteCatalog({manager,storage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},crypto:crypto.webcrypto,
  fetcher:async url=>new Response(url==='/api/packs/catalog'?JSON.stringify(catalog):corrupt?'tampered':bytes)});
 await client.refresh();await client.install('uno',{activate:true});assert.equal(installed,1);
 corrupt=true;await assert.rejects(()=>client.install('uno'),/сумма/);assert.equal(installed,1);
});

test('remote catalog supports a project subpath without weakening manifest URL validation',async()=>{
 const {RemoteCatalog}=require('../app/remote-catalog.js');const seen=[];
 const client=new RemoteCatalog({basePath:'/site/api/packs/',manager:{list:()=>[]},storage:{getItem:()=>null,setItem:()=>{}},fetcher:async url=>{seen.push(url);return new Response(JSON.stringify({format:'playroom-catalog',version:1,collection:'0.8.5',packs:[]}));}});
 await client.refresh();assert.deepEqual(seen,['/site/api/packs/catalog']);
 assert.throws(()=>new RemoteCatalog({basePath:'https://foreign.test/'}));
 const previous=Object.getOwnPropertyDescriptor(globalThis,'location'),cached={format:'playroom-catalog',version:1,collection:'0.8.5',packs:[]};let local,localFetches=0;
 try{Object.defineProperty(globalThis,'location',{configurable:true,value:{protocol:'file:'}});local=new RemoteCatalog({manager:{list:()=>[]},storage:{getItem:()=>JSON.stringify(cached),setItem:()=>assert.fail('unsupported origin cannot publish a new catalog')},fetcher:async()=>{localFetches++;return new Response(JSON.stringify(cached));}});}finally{if(previous)Object.defineProperty(globalThis,'location',previous);else delete globalThis.location;}
 assert.deepEqual(await local.load(),cached);assert.equal(localFetches,0,'local file catalog cannot fetch an origin-relative API');assert.equal(local.availability().available,false);assert.match(local.availability().reason,/веб-версию/);assert.match(local.warning,/веб-версию/);await assert.rejects(()=>local.refresh(),error=>error.code==='catalog-origin');await assert.rejects(()=>local.install('uno'),error=>error.code==='catalog-origin');assert.equal(localFetches,0);
});

test('incomplete or login-page shell never installs; verified update waits for existing clients',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto');
 const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 for(const failure of ['missing','login','corrupt',null]){
  const listeners={},writes=[],messages=[];let waits;
  const body='public javascript',hash=crypto.createHash('sha256').update(body).digest('hex');
  const self={location:{href:'https://example.test/sw.js',origin:'https://example.test'},addEventListener:(type,fn)=>listeners[type]=fn,clients:{matchAll:async()=>[{url:'https://example.test/',postMessage:m=>messages.push(m)}]},skipWaiting:()=>{throw Error('must not replace active room');}};
  const sandbox={self,URL,Response,Uint8Array,crypto:crypto.webcrypto,fetch:async path=>new Response(path==='./app/app.js'&&failure==='corrupt'?'wrong version':body,{status:path==='./app/app.js'&&failure==='missing'?503:200,headers:{'content-type':path==='./app/app.js'&&failure==='login'?'text/html':'text/javascript'}}),caches:{open:async()=>({put:async path=>writes.push(path)})}};
  vm.runInNewContext(source.replace('const INTEGRITY=null;',`const INTEGRITY=${JSON.stringify({'./app/app.js':hash})};`),sandbox);
  listeners.install({waitUntil:p=>waits=p});
  if(failure){await assert.rejects(waits);assert(!writes.includes('./app/app.js'));assert(!messages.some(m=>m.kind==='playroom-update-ready'));}
  else{await waits;assert(writes.includes('./app/app.js'));assert.equal(messages.find(m=>m.kind==='playroom-update-ready').kind,'playroom-update-ready');assert.equal(messages.find(m=>m.kind==='playroom-update-ready').version,require('../package.json').version);}
 }
});

test('built PWA uses content-addressed scripts and styles despite old ignoreSearch caches',()=>{
 const {execFileSync}=require('node:child_process');
 execFileSync('python3',['-c',`import build, hashlib, json, re, tempfile
from pathlib import Path
from unittest.mock import patch
items=dict(build.pwa_runtime_items())
html=items['index.html'].decode()
worker=items['sw.js'].decode()
info=json.loads(re.search(r'^const UPDATE_INFO=(.*);$',worker,re.M).group(1))
assert info['version']==build._app_version
if '-' not in info['version']:
 assert all('-' not in release['version'] for release in info['releases']), 'Stable update notes must exclude preview history for old clients'
refs=re.findall(r'(?:src|href)="([^"]+\\.(?:js|css))"',html)
assert len(refs)>30
for ref in refs:
 assert re.search(r'\\.[a-f0-9]{16}\\.(js|css)$',ref),ref
 assert hashlib.sha256(items[ref]).hexdigest()[:16] in ref
 assert re.sub(r'\\.[a-f0-9]{16}(?=\\.(js|css)$)', '', ref) not in items, ref
 assert "'./"+ref+"'" in worker or '"./'+ref+'"' in worker
 assert './'+ref in json.loads(re.search(r'const INTEGRITY=(.*?);',worker).group(1))
# Every precached URL exists; integrity covers only shipped assets.
core=json.loads('['+re.search(r'const CORE=\\[(.*?)\\];',worker,re.S).group(1).replace("'",'"')+']')
assert all(ref=='./' or ref[2:] in items for ref in core)
assert {'./'+ref for ref in refs} <= set(core), 'Every HTML script/style entrypoint must be precached'
assert all(ref[2:] in items for ref in json.loads(re.search(r'const INTEGRITY=(.*?);',worker).group(1)))
source_bytes=Path.read_bytes
def missing_asset(path):
 data=source_bytes(path)
 return data.replace(b'const CORE=[',b"const CORE=['./missing-shell.js',") if path==build.ROOT/'sw.js' else data
with patch.object(Path,'read_bytes',missing_asset):
 try: build.pwa_runtime_items()
 except ValueError as error: assert 'missing-shell.js' in str(error)
 else: raise AssertionError('Missing precache assets must stop packaging')
assert items==dict(build.pwa_runtime_items())
cache=lambda output: re.search(r"const CACHE='([^']+)'",output['sw.js'].decode()).group(1)
assert cache(items)!='playroom-pwa-v0.15.0'
with patch.object(build, 'installed_script', return_value='// changed pack collection'):
 changed=dict(build.pwa_runtime_items())
assert cache(items)!=cache(changed)
with tempfile.TemporaryDirectory() as d:
 dest=Path(d)
 build.write_directory(dest,items.items())
 (dest/'app/styles.css').write_text('old canonical asset')
 (dest/'app/styles.0000000000000000.css').write_text('old hashed asset')
 (dest/'_worker.js').write_text('private access wrapper')
 build.write_directory(dest,changed.items())
 assert {p.relative_to(dest).as_posix() for p in dest.rglob('*') if p.is_file()}==set(changed)|{'_worker.js'}
 assert (dest/'_worker.js').read_text()=='private access wrapper'
`],{cwd:root,stdio:'pipe'});
});

test('push subscription restoration touches the native service only after notification consent',async()=>{
 const vm=require('node:vm');let registrations=0,reads=0,prompts=0,creates=0;
 const existing={endpoint:'https://push.example.test/existing'},registration={active:{},pushManager:{getSubscription:async()=>{reads++;return existing;},subscribe:async()=>{creates++;return existing;}}};
 const context={location:{protocol:'https:'},isSecureContext:true,Notification:{permission:'default',requestPermission:async()=>{prompts++;context.Notification.permission='granted';return 'granted';}},PushManager:{},navigator:{serviceWorker:{getRegistration:async()=>{registrations++;return registration;}}},Uint8Array,atob};
 vm.runInNewContext(fs.readFileSync(path.join(root,'platform/web/push-device.js'),'utf8'),context);
 for(const permission of ['default','denied']){context.Notification.permission=permission;assert.equal(await context.PlayroomPushDevice.subscription(),null);}
 assert.equal(registrations,0);assert.equal(reads,0);assert.equal(prompts,0,'restoring state never requests consent');
 context.Notification.permission='granted';assert.equal(await context.PlayroomPushDevice.subscription(),existing);assert.equal(reads,1);assert.equal(registrations,1);
 context.Notification.permission='default';assert.equal(await context.PlayroomPushDevice.subscribe('AQID'),existing);assert.equal(prompts,1);assert.equal(reads,2);assert.equal(creates,0,'explicit opt-in retains an existing subscription');
});

test('active worker rejects stale network assets and limits offline fallback and cleanup to its shell',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto'),listeners={},deleted=[];
 const expected='new stylesheet',hash=crypto.createHash('sha256').update(expected).digest('hex');
 const source=fs.readFileSync(path.join(root,'sw.js'),'utf8').replace('const INTEGRITY=null;',`const INTEGRITY=${JSON.stringify({'./app/styles.css':hash})};`);
 const currentCache=source.match(/const CACHE='([^']+)'/)[1];
 let network='old stylesheet',navigation=false,claimed=false;
 const cache={match:async key=>key==='./index.html'?new Response('current offline document'):undefined,put:async()=>{}};
 const self={location:{href:'https://example.test/game/sw.js',origin:'https://example.test'},addEventListener:(type,fn)=>listeners[type]=fn,clients:{claim:async()=>{claimed=true;}}};
 vm.runInNewContext(source,{self,URL,Response,Uint8Array,crypto:crypto.webcrypto,
  fetch:async()=>{if(navigation)throw Error('offline');return new Response(network,{headers:{'content-type':'text/css'}});},
  caches:{open:async name=>{assert.equal(name,currentCache);return cache;},match:()=>{throw Error('must not search another build cache');},keys:async()=>['playroom-pwa-v0.14.0',currentCache,'other-app'],delete:async key=>deleted.push(key)}});
 let result;
 const request={method:'GET',url:'https://example.test/game/app/styles.css',mode:'cors'};
 listeners.fetch({request,respondWith:p=>result=p});assert.equal((await result).type,'error');
 network=expected;listeners.fetch({request,respondWith:p=>result=p});assert.equal(await (await result).text(),expected);
 navigation=true;listeners.fetch({request:{...request,mode:'navigate',url:'https://example.test/game/'},respondWith:p=>result=p});
 assert.equal(await (await result).text(),'current offline document');
 listeners.activate({waitUntil:p=>result=p});await result;
 assert.deepEqual(deleted,['playroom-pwa-v0.14.0']);assert.equal(claimed,true);
});

test('PWA update checks only its application scope and ignores clients closed during the check', async()=>{
 const vm=require('node:vm'),{MessageChannel}=require('node:worker_threads');
 const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 for(const closed of [false,true]){
  const listeners={},messages=[],replies=[];let skipped=false,calls=0;
  const idle={id:'app',url:'https://example.test/playroom-hod-test/?view=home',postMessage(message,ports){messages.push(this.id);if(ports)ports[0].postMessage({kind:'playroom-update-idle'});}};
  const gone={id:'closed',url:'https://example.test/playroom-hod-test/index.html',postMessage(message,ports){if(ports)ports[0].postMessage({kind:'playroom-update-busy'});}};
  const outsiders=['https://example.test/pecsoteka/','https://example.test/ROADMAPler/','https://example.test/playroom-hod-test-other/','https://other.test/playroom-hod-test/'].map((url,i)=>({id:'other'+i,url,postMessage(){throw Error('Another application must not receive update messages');}}));
  const self={location:{href:'https://example.test/playroom-hod-test/sw.js'},addEventListener:(type,fn)=>listeners[type]=fn,clients:{matchAll:async()=>{calls++;return [...(closed&&calls===1?[gone]:[]),idle,...outsiders,...(calls>1?[{id:'new-other',url:'https://example.test/roadmapler/',postMessage(){throw Error('Unrelated new window');}}]:[])];}},skipWaiting:async()=>{skipped=true;}};
  const cacheId=source.match(/const CACHE='([^']+)'/)[1];const cache={match:async key=>key==='./__playroom-update-state__'?new Response(JSON.stringify({build:cacheId,phase:'ready'})):new Response('shell')};
  vm.runInNewContext(source,{self,URL,Response,MessageChannel,setTimeout,clearTimeout,caches:{open:async()=>cache}});
  let pending;listeners.message({data:{kind:'playroom-activate-update'},ports:[{postMessage:r=>replies.push(r)}],waitUntil:p=>pending=p});await pending;
  assert.equal(replies[0]?.ok,true);assert.equal(skipped,true);assert.deepEqual(messages,['app']);
 }
});

for(const suppressControllerChange of [false,true])test('PWA update isolates a waiting build, drops old caches and starts offline with saved data'+(suppressControllerChange?' without controllerchange':''), {timeout:60000}, async()=>{
 const {execFileSync}=require('node:child_process'),http=require('node:http');
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
 const snapshots=JSON.parse(execFileSync('python3',['-c',`import build, json, base64, re
from pathlib import Path
from unittest.mock import patch
original_read=Path.read_bytes
snapshots=[]
base_version=build._app_version
major,minor,patch_number=map(int,re.match(r'(\\d+)\\.(\\d+)\\.(\\d+)',base_version).groups())
next_version=f'{major}.{minor}.{patch_number+1}-preview.1'
for marker in ['previous','current']:
 build._app_version=base_version if marker=='previous' else next_version
 def read(path):
  content=original_read(path)
  if path==build.ROOT/'app/version.js':
   content=re.sub(rb'globalThis.PlayroomAppVersion = [^;]+;',lambda _:b'globalThis.PlayroomAppVersion = '+json.dumps(build._app_version).encode()+b';',content,count=1)
  return content+(':root{--build-check:'+marker+'}').encode() if path==build.ROOT/'app/styles.css' else content
 with patch.object(Path, 'read_bytes', read):
  items=dict(build.pwa_runtime_items())
 items['sw.js']=items['sw.js'].replace(b"{cache:'reload',...(controller?",b"{cache:'reload',headers:{'X-Playroom-Test-Download':'1'},...(controller?")
 snapshots.append({name:base64.b64encode(content).decode() for name,content in items.items()})
print(json.dumps(snapshots))`],{cwd:root,maxBuffer:20*1024*1024}));
 const previousCache=Buffer.from(snapshots[0]['sw.js'],'base64').toString().match(/const CACHE='([^']+)'/)[1];
 if(suppressControllerChange)for(const snapshot of snapshots){const worker=Buffer.from(snapshot['sw.js'],'base64').toString().replace(".map(client=>client.navigate(client.url))",".map(()=>Promise.resolve())");snapshot['sw.js']=Buffer.from(worker).toString('base64');}
 let deployed=0,holdDownloads=true,heldResponse=null,releaseHeld;const currentRequests=[],downloadRequests=[];const heldReady=new Promise(resolve=>releaseHeld=resolve);
 const server=http.createServer((req,res)=>{
  if(new URL(req.url,'http://localhost').pathname.endsWith('/api/packs/catalog')){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({format:'playroom-catalog',version:1,collection:'fixture',packs:[]}));return;}
  if(new URL(req.url,'http://localhost').pathname==='/playroom-hod-test/index.html'){res.writeHead(308,{location:'/playroom-hod-test/'});res.end();return;}
  if(req.url.startsWith('/ROADMAPler/')){res.writeHead(200,{'content-type':'text/html'});res.end('<title>Other application</title><script>window.messages=[];navigator.serviceWorker.addEventListener(\"message\",e=>messages.push(e.data.kind));</script>');return;}
  const name=new URL(req.url,'http://localhost').pathname.slice('/playroom-hod-test/'.length)||'index.html',data=snapshots[deployed][name];
  if(deployed===1&&name!=='sw.js'&&req.headers['sec-fetch-dest']!=='document')currentRequests.push(name);if(deployed===1&&req.headers['x-playroom-test-download']==='1')downloadRequests.push(name);
  res.writeHead(data?200:404,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream','cache-control':'no-store'});
  if(deployed===1&&holdDownloads&&name.startsWith('app/styles.')&&data){const bytes=Buffer.from(data,'base64');res.write(bytes.subarray(0,Math.max(1,Math.floor(bytes.length/2))));heldResponse=res;releaseHeld();return;}
  res.end(data?Buffer.from(data,'base64'):'missing');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),url=`http://127.0.0.1:${server.address().port}/playroom-hod-test/`;
  const sync=require('./account-sync-fixture.cjs'),fetchCounts=await sync.installFetch(context,sync(async route=>route.fulfill({status:200,json:{}})));
  await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'test',name:'Тест'})));
 let page=await context.newPage();await page.addInitScript(suppress=>{if(suppress){const add=ServiceWorkerContainer.prototype.addEventListener;ServiceWorkerContainer.prototype.addEventListener=function(type,...args){if(type!=='controllerchange')return add.call(this,type,...args);};}},suppressControllerChange);await page.addInitScript(()=>{window.testActiveRoom=!sessionStorage.getItem('pwa-test-activation-approved');let network;Object.defineProperty(window,'PlayroomNetworkLibrary',{configurable:true,get:()=>network,set:value=>{network={...value,hasActiveRoom:()=>window.testActiveRoom||value.hasActiveRoom()};}});});await page.goto(url);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const other=await context.newPage();await other.goto(new URL('/ROADMAPler/',url).href);
  const originalWorker=context.serviceWorkers()[0],second=await context.newPage();await second.goto(url);
  await second.waitForFunction(()=>navigator.serviceWorker.controller);
  await second.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>false));
  await page.evaluate(async()=>{
   localStorage.setItem('saved-game-marker','keep');
   await (await caches.open('unrelated-app')).put('./marker',new Response('keep'));
   await new Promise((resolve,reject)=>{const r=indexedDB.open('saved-game-marker',1);r.onupgradeneeded=()=>r.result.createObjectStore('games');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('games','readwrite');t.objectStore('games').put('keep',1);t.oncomplete=()=>{db.close();resolve();};};});
  });
  assert.equal((await page.evaluate(()=>PlayroomPWA.checkForUpdate())).available,false,'manual check sees no new build before deployment');
  deployed=1;
  const newWorkerPromise=context.waitForEvent('serviceworker');
  assert.equal((await page.evaluate(()=>PlayroomPWA.checkForUpdate())).available,true,'manual check awaits actual waiting-worker metadata');
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous');
  const newWorker=await newWorkerPromise;assert.notEqual(newWorker,originalWorker);
  const screenshots=path.resolve(process.env.PLAYROOM_CAPTURE_DIR||path.resolve(root,'../tmp_files/ux-021/reader-update-audit/update-operations'));fs.mkdirSync(screenshots,{recursive:true});
  assert.equal(await page.locator('.updates-modal').count(),0,'active room suppresses automatic popup');
  const openUpdates=async()=>{await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-update-entry]').click();await page.locator('#modal-root>[data-surface-state=active] .updates-modal').waitFor();};
  await openUpdates();const buttonStates=[],rememberButton=async()=>buttonStates.push(await page.evaluate(()=>({phase:PlayroomPWA.updateInfo.download.phase,meter:document.querySelector('[data-update-progress]')?.dataset.meterState,percent:document.querySelector('[data-update-progress]')?.getAttribute('aria-valuenow')})));await rememberButton();await page.screenshot({path:path.join(screenshots,'available-390.png')});
  assert.equal(currentRequests.filter(name=>/\.(js|css)$/.test(name)&&name!=='platform/web/push-worker.js').length,0,'availability must not fetch application assets beyond the worker bootstrap: '+JSON.stringify(currentRequests));
  assert.equal(await page.locator('[data-command=download-app],[data-command=update-app]').count(),0,'one native action owns preparation and installation');
  await page.locator('[data-command=update-all]').click();await page.waitForFunction(()=>!PlayroomUnifiedUpdateBusy);assert.match(await page.locator('[data-update-status]').innerText(),/после выхода|выйдите из комнаты/);assert.equal(downloadRequests.length,0,'a live room blocks update preparation');
  await page.evaluate(()=>{window.testActiveRoom=false;});await page.locator('[data-command=update-all]').click();await heldReady;
  await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.completed>5&&Number(document.querySelector('[data-update-progress]')?.getAttribute('aria-valuenow'))>0);
  const meter=await page.locator('[data-update-progress]').evaluate(e=>({percent:Number(e.getAttribute('aria-valuenow')),height:getComputedStyle(e).height}));assert(meter.percent>0&&meter.percent<100,JSON.stringify(meter));assert.equal(meter.height,'6px');
  await page.locator('.updates-modal .modal-head [data-command=close-modal]').click();await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.phase==='downloading');assert.equal(await page.locator('.updates-modal').count(),0,'closing window keeps download running');await openUpdates();await page.locator('[data-update-progress]').waitFor();await rememberButton();
  await page.screenshot({path:path.join(screenshots,'downloading-390.png')});
  await context.setOffline(true);holdDownloads=false;heldResponse.destroy();
  await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.phase==='paused');assert.match(await page.locator('[data-update-status]').innerText(),/Нет подключения|Соединение прервано/);assert.equal(await page.locator('[data-update-progress]').getAttribute('data-meter-state'),'error');
  await rememberButton();await page.screenshot({path:path.join(screenshots,'paused-390.png')});
  const savedFiles=await page.evaluate(async previousCache=>{const key=(await caches.keys()).find(key=>key.startsWith('playroom-pwa-')&&key!==previousCache);return (await(await caches.open(key)).keys()).map(r=>new URL(r.url).pathname.slice('/playroom-hod-test/'.length)).filter(name=>!name.includes('__playroom-update'));},previousCache);assert(savedFiles.length>5);
  const savedCounts=new Map(savedFiles.map(name=>[name,downloadRequests.filter(p=>p===name).length]));
  await context.setOffline(false);const cdp=await context.newCDPSession(page);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');await cdp.detach();await page.reload();await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);await openUpdates();
  await page.waitForFunction(()=>PlayroomPWA.updateInfo?.download.phase==='paused');assert.equal(await page.locator('[data-command=update-all]').innerText(),'Продолжить обновление');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous','reopening still uses the installed version');
  const expectedIndex=require('node:crypto').createHash('sha256').update(Buffer.from(snapshots[1]['index.html'],'base64')).digest('hex');
  const cachedIndex=await page.evaluate(async ({expected,previousCache})=>{const key=(await caches.keys()).find(key=>key.startsWith('playroom-pwa-')&&key!==previousCache),cache=await caches.open(key),r=await cache.match('./index.html');if(!r)return {key,missing:true};return {key,status:r.status,redirected:r.redirected,url:r.url,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await r.clone().arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join(''),expected};},{expected:expectedIndex,previousCache});
  fs.writeFileSync(path.join(screenshots,'cached-index-check.json'),JSON.stringify(cachedIndex,null,2));assert.equal(cachedIndex.hash,expectedIndex,'checkpoint contains the exact candidate document');
  const afterRestartCounts=new Map(savedFiles.map(name=>[name,downloadRequests.filter(p=>p===name).length]));
  for(const name of savedFiles.filter(name=>name!=='index.html'&&name!=='platform/web/push-worker.js'))assert.equal(afterRestartCounts.get(name),savedCounts.get(name),'restart keeps cached asset: '+name);
  await page.evaluate(()=>{window.testActiveRoom=false;});await page.locator('[data-command=update-all]').click();await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.phase==='ready'&&!PlayroomUnifiedUpdateBusy);
  const delta=await page.evaluate(()=>PlayroomPWA.updateInfo.download);assert(delta.reusedFiles>5);assert(delta.total<delta.totalSize/2,JSON.stringify(delta));assert(!downloadRequests.some(name=>name.startsWith('installed-packs.')),'unchanged packs must be reused');
  fs.writeFileSync(path.join(screenshots,'resume-request-counts.json'),JSON.stringify({download:delta,beforeRestart:Object.fromEntries(savedCounts),afterRestart:Object.fromEntries(afterRestartCounts),afterResume:Object.fromEntries(savedFiles.map(name=>[name,downloadRequests.filter(p=>p===name).length])),allRequests:currentRequests},null,2));
  for(const name of savedFiles)assert.equal(downloadRequests.filter(p=>p===name).length,afterRestartCounts.get(name),'resume keeps verified file: '+name);
  await rememberButton();assert.deepEqual(buttonStates.map(s=>s.phase),['available','downloading','paused','ready']);assert.deepEqual(buttonStates.slice(1).map(s=>s.meter),['busy','error','ready']);fs.writeFileSync(path.join(screenshots,'button-states.json'),JSON.stringify(buttonStates,null,2));
  assert.equal(await page.locator('[data-update-progress]').getAttribute('data-meter-state'),'ready');assert.equal(await page.locator('[data-update-progress]').getAttribute('aria-valuenow'),'100');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous','another busy application client prevents activation after preparation');
  await page.evaluate(()=>{window.testActiveRoom=true;});await page.locator('[data-command=update-all]').click();await page.waitForFunction(()=>!PlayroomUnifiedUpdateBusy);assert.match(await page.locator('[data-update-status]').innerText(),/после выхода|выйдите из комнаты/);assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),true,'active room cannot install or reload');
  await page.evaluate(()=>{window.testActiveRoom=false;});
  for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});assert(await page.locator('.updates-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.locator('[data-command=update-all]').scrollIntoViewIfNeeded();assert(await page.locator('.update-v021-actions').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));await page.screenshot({path:path.join(screenshots,'ready-'+width+'.png')});}await page.setViewportSize({width:390,height:844});
  await page.locator('[data-command=update-all]').click();
  await page.waitForFunction(()=>document.querySelector('[data-update-status]')?.textContent.includes('Закройте другие окна'));
  assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),true);
  await second.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>true));
  let loadedDocuments=0;page.on('domcontentloaded',()=>loadedDocuments++);
  await page.evaluate(()=>sessionStorage.setItem('pwa-test-activation-approved','1'));await page.locator('[data-command=update-all]').click();
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await second.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await page.waitForTimeout(1500);assert.equal(loadedDocuments,1,'successful activation loads one document; history.pushState is not a reload');assert.equal(await page.locator('.updates-modal').count(),0,'installed update does not leave its old dialog');
  assert.deepEqual(await other.evaluate(()=>messages),[],'another application receives no update checks or notices');
  await context.setOffline(true);await page.reload();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'current');
  assert.equal(await page.evaluate(()=>localStorage.getItem('saved-game-marker')),'keep');
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('saved-game-marker');r.onsuccess=()=>{const db=r.result,q=db.transaction('games').objectStore('games').get(1);q.onsuccess=()=>{db.close();resolve(q.result);};};})),'keep');
  const keys=await page.evaluate(()=>caches.keys());
  assert.equal(keys.includes(previousCache),false);assert.ok(keys.includes('unrelated-app'));
  assert.equal(keys.filter(key=>key.startsWith('playroom-pwa-')).length,1);
  assert.equal(fetchCounts.nativeSupabaseRequests,0);fs.writeFileSync(path.join(screenshots,'operation-report.json'),JSON.stringify({fetchCounts,scope:'real local worker download, failure, resume, guarded apply, reload once, offline persistence; Chromium desktop emulation'},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});

test('built remote-catalog PWA opens before WASM and plays its first installed pack offline',{timeout:45000},async()=>{
 const os=require('node:os'),http=require('node:http'),{execFileSync}=require('node:child_process'),{chromium,executablePath}=require('../scripts/codex/browser.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-offline-avatar-'));
 const output=process.env.PLAYROOM_FIRST_BOOT_PWA||path.join(directory,'pwa'),pack=path.join(directory,'tictactoe.playroom-pack.json');
 execFileSync('python3',['-c',`
import build,sys
from pathlib import Path
output=Path(sys.argv[1])
if not output.exists(): build.write_directory(output,build.pwa_runtime_items(remote_catalog=True))
packs=Path('../playroom-paks').resolve()
Path(sys.argv[2]).write_text(build.json_text(build.build_pack(packs/'packs/tictactoe',packs/'shared')))
`,output,pack],{cwd:root,stdio:'pipe'});
 let releaseWasm;const readyWasm=new Promise(resolve=>releaseWasm=resolve);
 const server=http.createServer(async(req,res)=>{
  if(req.url.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({format:'playroom-catalog',version:1,collection:'test',packs:[]}));}
  const file=path.resolve(output,req.url==='/'?'index.html':req.url.slice(1).split('?')[0]);
  if(!file.startsWith(output+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  if(file.endsWith('.wasm'))await readyWasm;
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});const context=await browser.newContext({playroomProfile:false}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  let pageWasmRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname.endsWith('.wasm'))pageWasmRequests++;});
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.locator('#profile-form').waitFor({timeout:5000});
  assert.equal(pageWasmRequests,0,'the page does not need QuickJS for the first profile');
  releaseWasm();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await page.locator('#profile-form').waitFor();
  await page.locator('[data-avatar-picker]').click();assert.equal(await page.locator('.avatar-options img').count(),48);
  await page.waitForFunction(()=>[...document.querySelectorAll('.avatar-options img')].every(img=>img.complete&&img.naturalWidth===256));
  const avatar=await page.evaluate(()=>PlayroomAvatars.items()[0].id);await page.locator('[data-avatar-option="'+avatar+'"]').click();await page.locator('#profile-form [name=playerName]').fill('Иван');
  await page.locator('#profile-form [name=installAllGames]').uncheck();
  await page.locator('[data-profile-play-label]').click();await page.locator('.packs-empty-hub').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')).avatar),avatar);
  assert.equal(pageWasmRequests,0,'the empty profile and hub open offline without constructing a VM');
  const UI=require('./browser-origin.cjs'),manager=await UI.openPacks(page);
  await page.evaluate(()=>{
   const fetchAsset=window.fetch;
   window.fetch=(input,options)=>{
    if(String(input).endsWith('.wasm')){
     window.fetch=fetchAsset;
     return Promise.resolve(new Response('',{status:503}));
    }
    return fetchAsset(input,options);
   };
  });
  await manager.locator('#pack-file').setInputFiles(pack);
  await manager.locator('[data-pack-install]').click();
  await manager.locator('.pack-message').waitFor();
  assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),0,'a failed VM load cannot install an incomplete pack');
  await manager.locator('[data-pack-install]').click();
  await manager.locator('[data-installed-pack][data-pack-id=tictactoe]').waitFor();
  await manager.locator('.modal-head [data-command=close-modal]').click();
  assert.equal(pageWasmRequests,1,'the first pack obtains the precached WASM once');
  const room=await UI.openGame(page,'tictactoe');
  await page.evaluate(()=>{
   const b=PlayroomAppBridge,r=b.room();
   PlayroomFirstTurnGuide.setEnabled('tictactoe',false);
   b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'human',nickname:'Второй'});
   b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.ownerId});
   b.renderLobby();
  });
  await room.locator('[data-command=lobby-start]').click();
  await page.locator('.sdk-mark-cell').first().click();
  await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===1);
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  await page.reload();
  await UI.ready(page);
  await page.waitForFunction(()=>globalThis.PlayroomAppBridge?.saveLibrary.current()?.session.current.move===1);
  assert.equal(pageWasmRequests,2,'a new page with an installed pack restores the registry');
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.packs.list()[0]?.id),'tictactoe');
  assert.deepEqual(errors,[]);
 }finally{releaseWasm();await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});

test('staged update announces metadata only, keeps verified files after HTTP failure and resumes without redownloading',{timeout:30000},async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto'),source=fs.readFileSync(path.join(root,'sw.js'),'utf8'),listeners={},messages=[],files=new Map(),requests=new Map();let fail=true,quota=false,broken=false,fetches=0;
 const body='verified shell',hash=crypto.createHash('sha256').update(body).digest('hex');
 const cache={match:async key=>files.get(key)?.clone(),put:async(key,value)=>{if(quota)throw Object.assign(Error('full'),{name:'QuotaExceededError'});files.set(key,value.clone());}};
 const self={registration:{active:{}},location:{href:'https://example.test/sw.js',origin:'https://example.test'},clients:{matchAll:async()=>[{url:'https://example.test/',postMessage:m=>messages.push(m)}]},addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting(){throw Error('must not activate download');}};
 const context={self,URL,Response,Uint8Array,crypto:crypto.webcrypto,caches:{open:async()=>cache},fetch:async path=>{fetches++;requests.set(path,(requests.get(path)||0)+1);if(broken&&path==='./app/app.js')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('partial'));queueMicrotask(()=>c.error(new TypeError('connection reset')));}}));return new Response(body,{status:fail&&path==='./app/app.js'?503:200});}};
 vm.runInNewContext(source.replace('const INTEGRITY=null;',`const INTEGRITY=${JSON.stringify({'./app/app.js':hash})};`),context);
 let pending;listeners.install({waitUntil:p=>pending=p});await pending;assert.equal(fetches,0);assert.equal(files.size,0);assert(messages.some(m=>m.kind==='playroom-update-ready'));
 const call=async(kind,extra={})=>{let result;listeners.message({data:{kind,...extra},ports:[{postMessage:r=>result=r}],waitUntil:p=>pending=p});await pending;return result;};
 const metadata=await call('playroom-update-info');assert.equal(metadata.cache,source.match(/const CACHE='([^']+)'/)[1],'metadata identifies the content-addressed worker build');assert.equal(fetches,0,'reading identity does not download files');assert.equal(files.size,0,'reading identity does not copy assets');
 const first=await call('playroom-download-update');assert.equal(first.ok,false);assert.equal(first.download.error.code,'http');assert.equal(first.download.error.status,503);const saved=[...files.keys()].filter(p=>!p.includes('__playroom-update'));assert(saved.length>0);const counts=new Map(requests);
 fail=false;const resumed=await call('playroom-download-update');assert.equal(resumed.ok,true);assert.equal(resumed.download.phase,'ready');for(const key of saved)assert.equal(requests.get(key),counts.get(key),key);
 quota=true;const full=await call('playroom-download-update');assert.equal(full.ok,false);assert.equal(full.download.error.code,'quota');quota=false;await call('playroom-download-update');
 broken=true;files.delete('./app/app.js');const disconnected=await call('playroom-download-update');assert.equal(disconnected.ok,false);assert.equal(disconnected.download.error.code,'network');broken=false;await call('playroom-download-update');
 files.set('./app/app.js',new Response('corrupt'));const invalid=await call('playroom-activate-update',{manual:true});assert.equal(invalid.ok,false);assert.match(invalid.reason,/не полностью/);
});


function builtPwaInfo(directory){
 const line=fs.readFileSync(path.join(directory,'sw.js'),'utf8').split('\n').find(line=>line.startsWith('const UPDATE_INFO='));
 if(!line)throw Error('Built PWA fixture has no update metadata: '+directory);
 return JSON.parse(line.slice('const UPDATE_INFO='.length).replace(/;$/,''));
}
async function openBuiltUpdates(page){
 if(await page.locator('#modal-root>[data-surface-state=active] .updates-modal').count())return;
 await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=show-updates]').click();
 await page.locator('#modal-root>[data-surface-state=active] .updates-modal').waitFor();
}
async function serveBuiltPreviewUpgrade(oldRoot,newRoot,{hold=relative=>relative.startsWith('installed-packs.'),catalogRoot=process.env.PLAYROOM_PREVIEW_CATALOG||null}={}){
 const http=require('node:http'),requests=[];let deployed=false,pendingBody,seenHeld;const held=new Promise(resolve=>seenHeld=resolve);
 const server=http.createServer((req,res)=>{
  const requested=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',catalog=!!catalogRoot&&requested.startsWith('api/packs/'),relative=catalog?requested.slice('api/packs/'.length):requested,base=catalog?path.resolve(catalogRoot):deployed?newRoot:oldRoot,file=path.resolve(base,relative);requests.push({relative:requested,deployed});
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  if(deployed&&hold(relative)&&!pendingBody){res.write(body.subarray(0,16));pendingBody={res,body:body.subarray(16)};seenHeld();return;}res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,held,requests,url:'http://127.0.0.1:'+server.address().port+'/',get pendingBody(){return pendingBody;},set deployed(value){deployed=value;}};
}

test('legacy preview upgrade survives its old request timeout and preserves local data',{timeout:60000,skip:!process.env.PLAYROOM_LEGACY_PWA},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),oldRoot=path.resolve(process.env.PLAYROOM_LEGACY_PWA),newRoot=path.resolve(process.env.PLAYROOM_NEW_PWA),fixture=await serveBuiltPreviewUpgrade(oldRoot,newRoot,{catalogRoot:null}),{server,held}=fixture;
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const context=await browser.newContext(),page=await context.newPage();await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'legacy-update',name:'Тест',createdAt:1,updatedAt:1})));await page.goto(fixture.url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(await page.evaluate(()=>PlayroomAppVersion),builtPwaInfo(oldRoot).version);await page.evaluate(()=>localStorage.setItem('legacy-update-data','keep'));
  fixture.deployed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.updates-modal [data-command=update-app]').waitFor();await page.locator('[data-command=update-app]').click();await held;
  await page.waitForFunction(()=>document.querySelector('[data-update-status]')?.textContent.includes(PlayroomMessages.text('ui.pwa.16263196d581')));assert.equal(await page.evaluate(()=>PlayroomAppVersion),builtPwaInfo(oldRoot).version);fixture.pendingBody.res.end(fixture.pendingBody.body);
  await page.waitForFunction(target=>globalThis.PlayroomAppVersion===target&&!!globalThis.PlayroomAppBridge,builtPwaInfo(newRoot).version);assert.equal(await page.evaluate(()=>localStorage.getItem('legacy-update-data')),'keep');assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().id),'legacy-update');
 }finally{await browser.close();fixture.pendingBody?.res.destroy();await new Promise(resolve=>server.close(resolve));}
});


test('versioned built PWA upgrade retries an interrupted changed asset and preserves a real saved game',{timeout:90000,skip:!process.env.PLAYROOM_OLD_PWA||!process.env.PLAYROOM_NEW_PWA},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),oldRoot=path.resolve(process.env.PLAYROOM_OLD_PWA),newRoot=path.resolve(process.env.PLAYROOM_NEW_PWA),out=path.resolve(process.env.PLAYROOM_CAPTURE_DIR||'../tmp_files/ux-021/versioned-upgrade');fs.mkdirSync(out,{recursive:true});
 const cacheOf=folder=>fs.readFileSync(path.join(folder,'sw.js'),'utf8').match(/const CACHE='([^']+)'/)[1],oldCache=cacheOf(oldRoot),newCache=cacheOf(newRoot),entry=folder=>fs.readFileSync(path.join(folder,'index.html'),'utf8').match(/app\/version\.[a-f0-9]+\.js/)[0],oldScript=entry(oldRoot),newScript=entry(newRoot),target=builtPwaInfo(newRoot).version;
 assert.notEqual(builtPwaInfo(oldRoot).version,target,'immutable release fixtures have distinct versions');assert.notEqual(oldCache,newCache);assert.notEqual(oldScript,newScript);
 const fixture=await serveBuiltPreviewUpgrade(oldRoot,newRoot,{hold:relative=>relative===newScript}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),report={oldCache,newCache,oldScript,newScript,target,checks:[],errors:[]};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),sync=require('./account-sync-fixture.cjs'),network=await sync.installFetch(context,sync(r=>r.fulfill({status:200,json:{}}))),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
  await context.addInitScript(()=>{if(!localStorage.getItem('playroom.player-profile.v1'))localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'versioned-upgrade',name:'Тест',createdAt:1,updatedAt:1}));});await page.goto(fixture.url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&!!globalThis.PlayroomAppBridge);assert.equal(await page.locator('script[src="'+oldScript+'"]').count(),1);
  const saved=await page.evaluate(async()=>{const b=PlayroomAppBridge;if(!PlayroomPacks.list().some(p=>p.id==='tictactoe')){await PlayroomRemotePacks.load();await PlayroomRemotePacks.install('tictactoe',{activate:true});}const session=new TabletopSession(TabletopCore,'tictactoe',{seed:17,mode:'pass',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Первый'},{name:'Второй'}]});session.act(0,TabletopCore.legalActions(session.current,0)[0]);await b.saveLibrary.activateAsync(session,'upgrade-local-game');localStorage.setItem('versioned-marker','keep');return {version:PlayroomAppVersion,game:b.saveLibrary.open('upgrade-local-game').export(),profile:b.profile().id,settings:localStorage.getItem('playroom.settings.v1')};});report.version=saved.version;
  const guard=await context.newPage();await guard.goto(fixture.url);await guard.waitForFunction(()=>!!globalThis.PlayroomPWA);await guard.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>false));
  fixture.deployed=true;assert.equal((await page.evaluate(()=>PlayroomPWA.checkForUpdate())).available,true);await page.waitForFunction(cache=>PlayroomPWA.updateInfo?.cache===cache,newCache);await openBuiltUpdates(page);assert.equal(fixture.requests.filter(r=>r.deployed&&r.relative===newScript).length,0,'availability does not fetch changed application payload');
  await page.locator('[data-command=update-all]').click();await fixture.held;fixture.pendingBody.res.destroy();await page.waitForFunction(()=>PlayroomPWA.updateInfo?.download.phase==='paused'&&!PlayroomUnifiedUpdateBusy);assert.equal(await page.locator('script[src="'+oldScript+'"]').count(),1,'failed preparation leaves the installed document intact');assert.equal(await page.evaluate(()=>PlayroomAppVersion),saved.version);await page.screenshot({path:path.join(out,'interrupted.png'),animations:'disabled'});
  let documents=0;page.on('domcontentloaded',()=>documents++);await page.locator('[data-command=update-all]').click();await page.waitForFunction(()=>PlayroomPWA.updateInfo?.download.phase==='ready'&&!PlayroomUnifiedUpdateBusy);const delta=await page.evaluate(()=>PlayroomPWA.updateInfo.download);assert(delta.reusedFiles>5);assert(delta.total<delta.totalSize/2);assert.equal(fixture.requests.filter(r=>r.deployed&&r.relative.startsWith('installed-packs.')).length,0,'unchanged bundled pack payload is reused');assert.equal(await page.locator('script[src="'+oldScript+'"]').count(),1,'another busy client prevents early activation');assert.equal(documents,0);report.delta=delta;
  await guard.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>true));await page.locator('[data-command=update-all]').click();await page.waitForFunction(target=>PlayroomAppVersion===target,target);await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&!!globalThis.PlayroomAppBridge&&!localStorage.getItem('playroom.update-all.v1'));assert.equal(await page.locator('script[src="'+newScript+'"]').count(),1,'exact new hashed entrypoint is loaded');assert.equal(documents,1);assert.equal(await page.locator('.updates-modal').count(),0);
  const after=await page.evaluate(()=>({version:PlayroomAppVersion,game:PlayroomAppBridge.saveLibrary.open('upgrade-local-game').export(),profile:PlayroomAppBridge.profile().id,settings:localStorage.getItem('playroom.settings.v1'),marker:localStorage.getItem('versioned-marker')}));assert.deepEqual(after,{...saved,version:target,marker:'keep'});const keys=await page.evaluate(()=>caches.keys());assert(keys.includes(newCache));assert(!keys.includes(oldCache));
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge&&globalThis.PlayroomPacks.list().some(p=>p.id==='tictactoe'));assert.equal(await page.locator('script[src="'+newScript+'"]').count(),1);assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.open('upgrade-local-game').export()),saved.game);assert.equal(await page.evaluate(()=>localStorage.getItem('versioned-marker')),'keep');await page.screenshot({path:path.join(out,'offline-new-build.png'),animations:'disabled'});assert.deepEqual(report.errors,[]);assert.equal(network.nativeSupabaseRequests,0);report.nativeSupabaseRequests=network.nativeSupabaseRequests;report.checks=['real committed old save','HTTP interruption pauses native update','retry reuses verified assets','busy-client activation guard','one reload to distinct immutable release','exact save/profile/settings retained','offline new release opens the save'];
 }finally{await browser.close();fixture.pendingBody?.res.destroy();await new Promise(resolve=>fixture.server.close(resolve));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));}
});


test('incremental update assembles latest complete set from active and partial intermediate versions',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto'),listeners={},stores=new Map(),requests=[];
 const target={'./index.html':'latest document','./stable.js':'unchanged','./middle.js':'from intermediate','./changed.js':'latest code'},names=Object.keys(target);
 const hashes=Object.fromEntries(names.map(p=>[p,crypto.createHash('sha256').update(target[p]).digest('hex')])),sizes=Object.fromEntries(names.map(p=>[p,Buffer.byteLength(target[p])]));
 const store=name=>{if(!stores.has(name))stores.set(name,new Map());const files=stores.get(name);return {match:async p=>files.get(p)?.clone(),put:async(p,r)=>files.set(p,r.clone())};};
 const active='playroom-pwa-active',middle='playroom-pwa-intermediate',latest='playroom-pwa-latest';
 await store(active).put('./stable.js',new Response(target['./stable.js']));await store(active).put('./changed.js',new Response('obsolete'));
 await store(middle).put('./middle.js',new Response(target['./middle.js']));await store(middle).put('./obsolete.js',new Response('removed'));
 await store(latest).put('./changed.js',new Response('corrupt candidate'));
 let fail=true,skipped=false;
 const source=fs.readFileSync(path.join(root,'sw.js'),'utf8').replace(/const CACHE='[^']+'/,'const CACHE='+JSON.stringify(latest)).replace(/const CORE=\[[\s\S]*?\];/,'const CORE='+JSON.stringify(names)+';').replace('const INTEGRITY=null;','const INTEGRITY='+JSON.stringify(hashes)+';').replace('const ASSET_SIZES=null;','const ASSET_SIZES='+JSON.stringify(sizes)+';');
 const self={registration:{active:{}},location:{href:'https://example.test/sw.js'},clients:{matchAll:async()=>[]},addEventListener:(type,fn)=>listeners[type]=fn,skipWaiting:async()=>{skipped=true;}};
 vm.runInNewContext(source,{self,URL,Response,Uint8Array,crypto:crypto.webcrypto,caches:{keys:async()=>[...stores.keys()],open:async name=>store(name)},fetch:async p=>{const key=p==='./'?'./index.html':p;requests.push(key);if(fail&&key==='./changed.js')while(!stores.get(latest).has('./index.html'))await new Promise(resolve=>setImmediate(resolve));return new Response(target[key],{status:fail&&key==='./changed.js'?503:200});}});
 const call=async kind=>{let pending,result;listeners.message({data:{kind,manual:true},ports:[{postMessage:r=>result=r}],waitUntil:p=>pending=p});await pending;return result;};
 const first=await call('playroom-download-update');assert.equal(first.ok,false);assert.equal(first.download.error.code,'http');assert.equal((await call('playroom-activate-update')).ok,false);assert.equal(skipped,false);
 assert.deepEqual(requests.sort(),['./changed.js','./index.html']);assert(stores.has(active)&&stores.has(middle),'old versions stay usable before activation');
 // Simulate worker termination: the next worker must resume from durable files.
 vm.runInNewContext(source,{self,URL,Response,Uint8Array,crypto:crypto.webcrypto,caches:{keys:async()=>[...stores.keys()],open:async name=>store(name)},fetch:async p=>{const key=p==='./'?'./index.html':p;requests.push(key);return new Response(target[key]);}});
 fail=false;const final=await call('playroom-download-update');assert.equal(final.ok,true);assert.equal(final.download.phase,'ready');assert.equal(final.download.reusedFiles,3);assert.equal(final.download.total,sizes['./changed.js']);assert.equal(final.download.received,sizes['./changed.js']);assert.equal(final.download.savedBytes,Object.values(sizes).reduce((a,b)=>a+b,0));
 for(const p of names)assert.equal(await (await store(latest).match(p)).text(),target[p]);assert.equal(await store(latest).match('./obsolete.js'),undefined);
 assert.equal(requests.filter(p=>p==='./index.html').length,1);assert.equal(await (await store(active).match('./changed.js')).text(),'obsolete');
 stores.get(latest).set('./stable.js',new Response('corrupt after download'));assert.equal((await call('playroom-activate-update')).ok,false);assert.equal(skipped,false,'installation rechecks the entire assembled set');
});


test('newer waiting update replaces a partial candidate without accepting its late progress',async()=>{
 const vm=require('node:vm'),events=new Map(),swEvents=new Map(),registrationEvents=new Map();let checks=0,oldReply;
 class Channel{constructor(){this.port1={close(){}};this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage?.({data}))};}}
 const worker=(version,hold=false)=>({postMessage(message,ports){if(message.kind==='playroom-update-info')ports[0].postMessage({version,download:{phase:'available'}});if(message.kind==='playroom-download-update'){if(hold)oldReply=ports[0];else ports[0].postMessage({ok:true,download:{phase:'ready'}});}}});
 const old=worker('B',true),latest=worker('C'),registration={waiting:old,installing:null,addEventListener:(t,f)=>registrationEvents.set(t,f),update:async()=>{checks++;registration.waiting=latest;registration.installing={addEventListener:(t,f)=>f()};registrationEvents.get('updatefound')();}};
 const context={location:{protocol:'https:',hostname:'example.test',href:'https://example.test/'},document:{hidden:false,addEventListener(){}},navigator:{serviceWorker:{controller:{},register:async()=>registration,addEventListener:(t,f)=>swEvents.set(t,f),getRegistration:async()=>registration}},matchMedia:()=>({matches:false}),PlayroomPairing:{extract:()=>null},MessageChannel:Channel,CustomEvent:class{constructor(type){this.type=type;}},Event,URL,Set,Promise,setTimeout,clearTimeout,setInterval(){},addEventListener:(t,f)=>events.set(t,f),removeEventListener:(t)=>events.delete(t),dispatchEvent:e=>events.get(e.type)?.(e)};
 context.globalThis=context;
 vm.runInNewContext(['core/messages.js','application/pwa-update-coordinator.js','app/pwa.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8')).join('\n'),context);
 const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};await flush();assert.equal(context.PlayroomPWA.updateInfo.version,'B');
 const pending=context.PlayroomPWA.downloadUpdate();const rejected=assert.rejects(pending,error=>error.code==='update-changed');await flush();
 events.get('focus')();await flush();assert.equal(checks,1);assert.equal(context.PlayroomPWA.updateInfo.version,'C');
 swEvents.get('message')({source:old,data:{kind:'playroom-update-progress',version:'B',download:{phase:'ready'}}});assert.equal(context.PlayroomPWA.updateInfo.download.phase,'available');
 oldReply.postMessage({ok:true,download:{phase:'ready'}});await rejected;assert.equal(context.PlayroomPWA.updateInfo.version,'C');assert.equal(context.PlayroomPWA.updateInfo.download.phase,'available');
 await context.PlayroomPWA.downloadUpdate();assert.equal(context.PlayroomPWA.updateInfo.download.phase,'ready');
});

test('versioned built PWA update shows installed changes and cleanup immediately after legacy restart',{timeout:90000,skip:!process.env.PLAYROOM_OLD_PWA||!process.env.PLAYROOM_NEW_PWA},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),fixture=await serveBuiltPreviewUpgrade(path.resolve(process.env.PLAYROOM_OLD_PWA),path.resolve(process.env.PLAYROOM_NEW_PWA),{hold:()=>false}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));await context.addInitScript(()=>{if(!localStorage.getItem('playroom.player-profile.v1'))localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'post-update-test',name:'Игрок',createdAt:1,updatedAt:1}))});await page.goto(fixture.url);await page.waitForFunction(()=>navigator.serviceWorker.controller&&globalThis.PlayroomAppBridge);await page.evaluate(async()=>{if(!PlayroomPacks.list().some(p=>p.id==='tictactoe')){await PlayroomRemotePacks.load();await PlayroomRemotePacks.install('tictactoe',{activate:true});}});const installedBefore=await page.evaluate(()=>Object.fromEntries(PlayroomPacks.list().filter(p=>p.active).map(p=>[p.id,p.version])));const before=await page.evaluate(async()=>{localStorage.setItem('post-update-marker','keep');const session=new TabletopSession(TabletopCore,'tictactoe',{seed:17,players:[{name:'A'},{name:'B'}]});await PlayroomAppBridge.saveLibrary.activateAsync(session,'post-update-save');return JSON.stringify(session.export())});fixture.deployed=true;await page.evaluate(()=>PlayroomPWA.checkForUpdate());await page.waitForFunction(()=>!!PlayroomPWA.updateInfo);await openBuiltUpdates(page);await page.locator('[data-command=update-all]').click();try{await page.locator('.post-update-modal [data-installed-changes]').waitFor({timeout:10000});}catch(error){throw Error('Post-update review: '+JSON.stringify(await page.evaluate(()=>({version:PlayroomAppVersion,job:localStorage.getItem('playroom.update-all.v1'),receipt:sessionStorage.getItem('playroom.after-update.v1'),status:document.querySelector('[data-update-status]')?.textContent,modal:document.querySelector('#modal-root')?.innerText.slice(0,500),toast:document.querySelector('#toast')?.textContent,room:PlayroomAppBridge.room()?.phase}))));}assert((await page.locator('[data-installed-changes]').innerText()).includes(builtPwaInfo(path.resolve(process.env.PLAYROOM_NEW_PWA)).releases.find(r=>r.version===builtPwaInfo(path.resolve(process.env.PLAYROOM_NEW_PWA)).version).changes[0]));const changedPacks=await page.evaluate(old=>PlayroomPacks.list().filter(p=>p.active&&old[p.id]!==p.version).length,installedBefore);assert.equal(await page.locator('[data-updated-pack-cards] .post-update-pack').count(),changedPacks);await page.waitForFunction(()=>!document.querySelector('[data-cleanup-description]').textContent.includes('Проверяем'));assert.equal(await page.evaluate(()=>localStorage.getItem('post-update-marker')),'keep');assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.open('post-update-save').export())),before);await page.locator('[data-post-update-done]').click();await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.locator('.post-update-modal').count(),0);await context.setOffline(true);await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('post-update-marker')),'keep');assert.equal(await page.evaluate(()=>sessionStorage.getItem('playroom.after-update.v1')),null);
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('catalog-only PWA installs exact site packs on demand and retains them offline',{timeout:90000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:()=>false}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));
  await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'catalog-only',name:'Игрок',createdAt:1,updatedAt:1})));
  await page.goto(fixture.url);await page.locator('.packs-empty-hub').waitFor();await page.waitForFunction(()=>navigator.serviceWorker.controller);
  assert.deepEqual(await page.evaluate(()=>({bundled:PlayroomInstalledPacks.length,installed:PlayroomPacks.list().length})),{bundled:0,installed:0},JSON.stringify({installed:await page.evaluate(()=>PlayroomPacks.list().map(p=>p.id+'@'+p.version)),requests:fixture.requests.filter(r=>r.relative.includes('packs'))}));
  assert.equal(fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).length,0,'opening the shell never downloads game code');
  await page.locator('.packs-empty-hub [data-command=packs]').click();const active=selector=>page.locator('#modal-root>[data-surface-state=active]').locator(selector);
  await active('[data-pack-tab=available][aria-selected=true]').waitFor();await active('[data-pack-online=mage-brawl]').waitFor();assert.equal(await active('[data-pack-catalog-status] [role=alert]').count(),0);
  const catalog=JSON.parse(fs.readFileSync(path.join(process.env.PLAYROOM_PREVIEW_CATALOG,'catalog'),'utf8'));assert.equal(await active('[data-pack-online]').count(),catalog.packs.length);assert((await active('[data-pack-tab-panel=available]').innerText()).includes(catalog.packs.find(p=>p.id==='mage-brawl').name));assert.equal(await active('[data-pack-restore]').count(),0);
  await active('[data-pack-online=mage-brawl]').click();await active('[data-pack-online=mage-brawl][data-pack-install-state=ready]').waitFor();await active('.modal-head [data-command=close-modal]').click();await page.locator('[data-start=mage-brawl]').waitFor();
  assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),1);assert.equal(fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).length,1);
  // The same verified download port installs every remaining independent package.
  const exports=await page.evaluate(async()=>{for(const item of PlayroomRemotePacks.pending())await PlayroomRemotePacks.install(item.id,{activate:true});return PlayroomPacks.list().map(p=>({id:p.id,version:p.version,bundle:JSON.parse(PlayroomPacks.exportPack(p.id,p.version))}));});
  assert.equal(exports.length,catalog.packs.length);for(const item of catalog.packs){const expected=JSON.parse(fs.readFileSync(path.join(process.env.PLAYROOM_PREVIEW_CATALOG,item.url.slice('/api/packs/'.length)),'utf8'));assert.deepEqual(exports.find(p=>p.id===item.id).bundle,expected);}
  const usage=await page.evaluate(()=>PlayroomStorageUsage.measure());assert(usage.app<4*1024*1024,JSON.stringify(usage));
  const cacheUrls=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())if(name.startsWith('playroom-pwa-'))for(const request of await (await caches.open(name)).keys())urls.push(request.url);return urls;});assert(!cacheUrls.some(url=>url.includes('/api/packs/files/')),'downloaded packs have no second CacheStorage copy');
  await context.setOffline(true);await page.reload();await page.locator('[data-start=uno]').waitFor();assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),exports.length);assert.equal(await page.evaluate(()=>PlayroomInstalledPacks.length),0);
  await page.locator('[data-start=uno]').click();await active('[data-game-mode=hotseat]').click();await active('[data-command=lobby-start]').click();await page.locator('.table-shell').waitFor();
  assert.deepEqual(errors,[]);if(process.env.PLAYROOM_CATALOG_REPORT)fs.writeFileSync(process.env.PLAYROOM_CATALOG_REPORT,JSON.stringify({catalogPacks:catalog.packs.length,bundledPacks:0,exactInstalledPacks:exports.length,usage,cachePackResponses:0,offlineStart:true,errors},null,2)+'\n');await context.close();
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('deleting every site pack preserves root pages and a false offline flag does not block update checks',{timeout:90000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:()=>false}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'delete-every-pack',name:'Игрок',createdAt:1,updatedAt:1})));
  await page.goto(fixture.url);await page.locator('.packs-empty-hub').waitFor();await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const flagCheck=await page.evaluate(async()=>{const previous=Object.getOwnPropertyDescriptor(navigator,'onLine');Object.defineProperty(navigator,'onLine',{configurable:true,get:()=>false});try{return {result:await PlayroomPWA.checkForUpdate()};}catch(error){return {error:error.code||error.name};}finally{if(previous)Object.defineProperty(navigator,'onLine',previous);else delete navigator.onLine;}});
  const geometry=async phase=>{const rows=[];for(const name of ['games','sessions','social','profile']){await page.locator('[data-hub-page='+name+']').click();await page.evaluate(()=>scrollTo(0,0));rows.push(await page.evaluate(({phase,name})=>{const deck=document.querySelector('.hub-pages'),panel=deck.querySelector('.shared-page-panel.is-active'),r=panel.getBoundingClientRect(),d=deck.getBoundingClientRect();return {phase,page:name,offset:r.top-d.top,x:r.left-d.left,position:getComputedStyle(panel).position};},{phase,name}));}return rows;};
  await context.setOffline(true);const offlineError=await page.evaluate(async()=>{try{await PlayroomPWA.checkForUpdate();return null;}catch(error){return error.code||error.name;}});await context.setOffline(false);const retry=await page.evaluate(()=>PlayroomPWA.checkForUpdate());
  const initial=await geometry('initial-empty');
  await page.evaluate(async()=>{await PlayroomRemotePacks.load();for(const item of PlayroomRemotePacks.pending())await PlayroomRemotePacks.install(item.id,{activate:true});});await page.reload();await page.locator('.game-tile').first().waitFor();const beforeDelete=await geometry('installed');
  await page.locator('#hub-profile-page [data-command=packs]').click();const active=s=>page.locator('#modal-root>[data-surface-state=active]').locator(s);await active('[data-pack-bulk=all]').click();await active('[data-pack-confirm="1"]').click();await page.waitForFunction(()=>PlayroomPacks.list().length===0&&!PlayroomData.pending);await active('.pack-manager-modal').waitFor();await active('.modal-head [data-command=close-modal]').click();
  const afterDelete=await geometry('after-ui-delete');await page.reload();await page.locator('.packs-empty-hub').waitFor();const afterReload=await geometry('after-empty-reload');
  const report={flagCheck,offlineError,retry,initial,beforeDelete,afterDelete,afterReload,remaining:await page.evaluate(()=>PlayroomPacks.list().length),errors};if(process.env.PLAYROOM_DELETE_REPORT)fs.writeFileSync(process.env.PLAYROOM_DELETE_REPORT,JSON.stringify(report,null,2)+'\n');
  assert.equal(flagCheck.error,undefined,'navigator.onLine is a hint: a successful real SW check must not be rejected');assert(offlineError,'real network failures remain failures');assert.equal(retry.available,false);for(const row of [...initial,...beforeDelete,...afterDelete,...afterReload]){assert.equal(row.position,'relative',JSON.stringify(row));assert(Math.abs(row.offset)<2&&Math.abs(row.x)<2,JSON.stringify(row));}assert.equal(report.remaining,0);assert.deepEqual(errors,[]);await context.close();
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('site pack install stays in its compact card with latest notes and retry',{timeout:90000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:relative=>relative.startsWith('files/mage-brawl/')}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});fixture.deployed=true;
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'compact-install',name:'Игрок',createdAt:1,updatedAt:1})));
  await page.goto(fixture.url);await page.locator('.packs-empty-hub [data-command=packs]').click();const active=s=>page.locator('#modal-root>[data-surface-state=active]').locator(s);const install=active('[data-pack-online=mage-brawl]');await install.waitFor();
  assert.equal(await install.evaluate(el=>el.offsetWidth),44,'install uses a compact 44px target, not a full-width update CTA');
  assert.equal(await active('[data-pack-quick] [data-pack-catalog-refresh]').count(),1);assert.equal(await active('[data-pack-quick] [data-pack-file-open]').count(),1);assert.equal(await active('details[data-pack-maintenance]').count(),0);assert.equal(await active('[data-pack-maintenance] [data-pack-bulk]').count(),2);assert.equal(await active('[data-cloud-data-open]').count(),0);
  const card=active('[data-available-pack=mage-brawl]');assert.match(await card.locator('.packs-v021-description').innerText(),/./);assert.equal(await card.locator('details').getAttribute('open'),null);assert.equal(await card.locator('details h3').count(),1,'only one release is rendered');
  await card.locator('details>summary').click();assert.equal(await card.locator('details').getAttribute('open'),'');await install.scrollIntoViewIfNeeded();
  const before=await install.evaluate(el=>{window.installButton=el;window.installCard=el.closest('li');window.installFrame=document.querySelector('#modal-root>[data-surface-state=active]');return {y:installCard.getBoundingClientRect().y,scroll:el.closest('.modal-body').scrollTop};});
  await install.click();await fixture.held;await active('[data-pack-online=mage-brawl][aria-busy=true]').waitFor();assert(await install.evaluate(el=>el===installButton&&el.closest('li')===installCard));fixture.pendingBody.res.end(fixture.pendingBody.body);
  await active('[data-pack-online=mage-brawl][data-pack-install-state=ready]').waitFor();
  const after=await install.evaluate(el=>({sameButton:el===installButton,sameCard:el.closest('li')===installCard,sameFrame:document.querySelector('#modal-root>[data-surface-state=active]')===installFrame,y:installCard.getBoundingClientRect().y,scroll:el.closest('.modal-body').scrollTop}));assert(after.sameButton&&after.sameCard&&after.sameFrame);assert(Math.abs(after.y-before.y)<1&&Math.abs(after.scroll-before.scroll)<1,JSON.stringify({before,after}));assert.equal(await active('[data-pack-tab=available]').getAttribute('aria-selected'),'true');assert.equal(await page.locator('.post-update-modal').count(),0);assert.equal(await card.locator('details').getAttribute('open'),'');
  for(const width of [320,390,844]){await page.setViewportSize({width,height:width===844?390:844});assert(await active('.pack-manager-modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));const size=await install.evaluate(el=>{const s=getComputedStyle(el);return {offset:el.offsetWidth,width:s.width,minWidth:s.minWidth,maxWidth:s.maxWidth,zoom:s.zoom,boxSizing:s.boxSizing,rect:el.getBoundingClientRect().width,uiScale:getComputedStyle(document.documentElement).getPropertyValue('--ui-interface-scale')};});assert.equal(size.offset,await install.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-target'))),JSON.stringify({viewport:width,...size}));}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{window.installFetch=PlayroomRemotePacks.fetcher;PlayroomRemotePacks.fetcher=async(...args)=>String(args[0]).includes('/files/uno/')?new Response('corrupt'):installFetch(...args);});const retry=active('[data-pack-online=uno]');await retry.click();await active('[data-pack-online=uno][data-pack-install-state=error]').waitFor();assert.equal(await active('[data-available-pack=uno] [role=alert]').count(),1);assert.equal(await page.evaluate(()=>PlayroomPacks.list().some(p=>p.id==='uno')),false);await page.evaluate(()=>PlayroomRemotePacks.fetcher=installFetch);await retry.click();await active('[data-pack-online=uno][data-pack-install-state=ready]').waitFor();assert.equal(await page.locator('.post-update-modal').count(),0);
  await active('[data-pack-catalog-refresh]').click();await active('[data-pack-catalog-refresh]:not([disabled])').waitFor();assert.equal(await active('[data-available-pack=mage-brawl],[data-available-pack=uno]').count(),0,'explicit catalog refresh removes installed rows');await active('[data-pack-tab=installed]').click();assert.equal(await active('[data-installed-pack][data-pack-id=mage-brawl],[data-installed-pack][data-pack-id=uno]').count(),2);await active('[data-pack-tab=available]').click();
  assert.deepEqual(errors,[]);if(process.env.PLAYROOM_INSTALL_REPORT)fs.writeFileSync(process.env.PLAYROOM_INSTALL_REPORT,JSON.stringify({before,after,latestReleases:1,compactTarget:44,retainedAvailable:true,retryVerified:true,installedRowsHiddenAfterRefresh:true,errors},null,2)+'\n');await context.close();
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('post-update cleanup hides an empty action and closes after removing old versions',{timeout:60000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:()=>false}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'cleanup-action',name:'Игрок',createdAt:1,updatedAt:1})));
  await page.goto(fixture.url);await page.locator('.packs-empty-hub').waitFor();const saved=await page.evaluate(async()=>{await PlayroomRemotePacks.load();await PlayroomRemotePacks.install('tictactoe',{activate:true});const session=new TabletopSession(TabletopCore,'tictactoe',{seed:17,players:[{name:'A'},{name:'B'}]});await PlayroomAppBridge.saveLibrary.activateAsync(session,'cleanup-preserved');sessionStorage.setItem('playroom.after-update.v1',JSON.stringify({from:'0.0.0',to:PlayroomAppVersion,releases:[],packs:[]}));return JSON.stringify(session.export());});
  const active=s=>page.locator('#modal-root>[data-surface-state=active]').locator(s);await page.reload();await active('.post-update-modal').waitFor();await page.waitForFunction(()=>!document.querySelector('[data-cleanup-description]').textContent.includes('Проверяем'));assert.equal(await active('[data-post-update-cleanup]').isVisible(),false,'empty cleanup must be visually hidden, including author button styles');await active('[data-post-update-done]').click();
  await page.evaluate(async()=>{const bundle=JSON.parse(PlayroomPacks.exportPack('tictactoe'));bundle.manifest.version='0.0.1';await PlayroomPacks.install(PlayroomPacks.prepare(bundle),{activate:false});const library=PlayroomAppBridge.saveLibrary,current=library.open('cleanup-preserved'),unsupported=new TabletopSession(TabletopCore,'tictactoe',{packVersion:'0.0.1',seed:17,players:[{name:'A'},{name:'B'}]});await library.activateAsync(unsupported,'cleanup-unsupported');await library.activateAsync(current,'cleanup-preserved');sessionStorage.setItem('playroom.after-update.v1',JSON.stringify({from:'0.0.0',to:PlayroomAppVersion,releases:[],packs:[]}));});await page.reload();await active('[data-post-update-cleanup]:not([disabled])').waitFor();assert.equal(await active('[data-post-update-cleanup]').innerText(),'Очистить');assert.equal(await active('[data-post-update-cleanup]').getAttribute('aria-label'),'Удалить старые версии игр');
  await active('[data-post-update-cleanup]').click();await page.locator('.post-update-modal').waitFor({state:'detached'});assert.equal(await page.evaluate(()=>PlayroomPacks.list().some(p=>p.version==='0.0.1')),false);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.references('tictactoe','0.0.1').length),0,'unsupported save is removed before retiring its pack');assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.paused.v1.cleanup-unsupported')),null);assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.open('cleanup-preserved').export())),saved);assert.equal(await page.evaluate(()=>sessionStorage.getItem('playroom.after-update.v1')),null);assert.deepEqual(errors,[]);
  if(process.env.PLAYROOM_CLEANUP_REPORT)fs.writeFileSync(process.env.PLAYROOM_CLEANUP_REPORT,JSON.stringify({emptyButtonHidden:true,label:'Очистить',closedAfterCleanup:true,savedGamePreserved:true,errors},null,2)+'\n');await context.close();
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('install all skips installed games, reports a partial failure and retries only missing games',{timeout:120000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:relative=>relative.startsWith('files/battleship/')}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});fixture.deployed=true;
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'bulk-install',name:'Игрок',createdAt:1,updatedAt:1})));
  await page.goto(fixture.url);await page.locator('.packs-empty-hub').waitFor();const count=await page.evaluate(async()=>{await PlayroomRemotePacks.load();await PlayroomRemotePacks.install('mage-brawl',{activate:true});window.bulkFetch=PlayroomRemotePacks.fetcher;PlayroomRemotePacks.fetcher=async(...args)=>String(args[0]).includes('/files/uno/')?new Response('corrupt'):bulkFetch(...args);return PlayroomRemotePacks.current.packs.length;});
  await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=packs]').click();const active=s=>page.locator('#modal-root>[data-surface-state=active]').locator(s);await active('[data-pack-tab=available]').click();const bulk=active('[data-pack-install-all]');await bulk.waitFor();await bulk.click();await fixture.held;assert.match(await bulk.innerText(),/Устанавливаем/);assert(await bulk.isDisabled());await bulk.evaluate(el=>el.click());fixture.pendingBody.res.end(fixture.pendingBody.body);
  await page.waitForFunction(count=>PlayroomPacks.list().length===count-1&&!PlayroomData.pending&&!document.querySelector('[data-pack-install-all]').disabled,count);assert.equal(await active('[data-available-pack=uno] [role=alert]').count(),1);const requests=()=>fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).map(r=>r.relative.split('/')[3]);assert.equal(requests().filter(id=>id==='mage-brawl').length,1);assert.equal(requests().filter(id=>id==='uno').length,0,'corrupt fixture is returned before network');
  await page.evaluate(()=>PlayroomRemotePacks.fetcher=bulkFetch);await bulk.click();await page.waitForFunction(count=>PlayroomPacks.list().length===count&&!PlayroomData.pending,count);await bulk.filter({hasText:'Все игры установлены'}).waitFor();assert(await bulk.isDisabled());const downloads=requests();for(const id of await page.evaluate(()=>PlayroomRemotePacks.current.packs.map(p=>p.id)))assert.equal(downloads.filter(value=>value===id).length,1,id+' downloads once');assert.equal(await page.locator('.post-update-modal').count(),0);assert.deepEqual(errors,[]);
  if(process.env.PLAYROOM_BULK_REPORT)fs.writeFileSync(process.env.PLAYROOM_BULK_REPORT,JSON.stringify({count,skippedInstalled:true,partialFailureVisible:true,retriedOnlyMissing:true,networkDownloads:downloads.length,errors},null,2)+'\n');await context.close();
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('welcome offers app installation, defaults to all games and preserves an explicit opt out',{timeout:120000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:()=>false}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const report=[];
  for(const allGames of [true,false]){
   const context=await browser.newContext({playroomProfile:false,viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));const before=fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).length;
   await page.goto(fixture.url);const form=page.locator('#profile-form');await form.waitFor();const choice=form.locator('[name=installAllGames]');assert(await choice.isChecked());assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),0);assert.equal(fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).length,before);
   await form.locator('[name=playerName]').fill(allGames?'Коллекция':'Выбор');await form.evaluate(el=>window.welcomeForm=el);await form.locator('[data-welcome-install]').click();const active=s=>page.locator('#modal-root>[data-surface-state=active]').locator(s);await active('.install021-modal').waitFor();await active('.modal-head [data-command=close-modal]').click();assert(await form.evaluate(el=>el===welcomeForm));assert.equal(await form.locator('[name=playerName]').inputValue(),allGames?'Коллекция':'Выбор');assert(await choice.isChecked());
   for(const width of [320,390,844]){await page.setViewportSize({width,height:width===844?390:844});assert(await active('.modal').evaluate(el=>el.scrollWidth<=el.clientWidth+1));}await page.setViewportSize({width:390,height:844});if(!allGames)await choice.uncheck();await form.locator('button[type=submit]').click();
   if(allGames){await active('[data-pack-install-all]').filter({hasText:'Все игры установлены'}).waitFor();const count=await page.evaluate(()=>PlayroomRemotePacks.current.packs.length);assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),count);assert.equal(await page.locator('.post-update-modal').count(),0);report.push({allGames:true,installed:count});await active('.modal-head [data-command=close-modal]').click();await context.setOffline(true);await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),count);}
   else{await page.locator('.packs-empty-hub').waitFor();assert.equal(await page.locator('.pack-manager-modal').count(),0);assert.equal(fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).length,before);await page.reload();await page.locator('.packs-empty-hub').waitFor();assert.equal(await page.locator('#profile-form').count(),0);assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),0);report.push({allGames:false,installed:0,promptRepeated:false});}
   assert.deepEqual(errors,[]);await context.close();
  }
  if(process.env.PLAYROOM_WELCOME_REPORT)fs.writeFileSync(process.env.PLAYROOM_WELCOME_REPORT,JSON.stringify({report,appOfferUsesOwnedInstallUI:true,draftPreserved:true,defaultChecked:true,noDownloadsBeforeConsent:true},null,2)+'\n');
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});


for(const {suffix,id,previous,unused,targetId,catalogPath} of [
 {suffix:'',id:'uno',previous:'0.6.8-preview.16',unused:'0.6.8-preview.15',targetId:'uno',catalogPath:process.env.PLAYROOM_PREVIEW_CATALOG},
 {suffix:' after a pack ID changes',id:'battleship',previous:'0.4.4',unused:'0.4.2',targetId:'fleet-grid',catalogPath:process.env.PLAYROOM_RENAMED_PACK_CATALOG},
])test('update all crosses a real service worker restart then updates installed packs and preserves pinned saves'+suffix,{timeout:90000,skip:!process.env.PLAYROOM_OLD_PWA||!process.env.PLAYROOM_NEW_PWA||!catalogPath},async()=>{
 const oldRoot=path.resolve(process.env.PLAYROOM_OLD_PWA),newRoot=path.resolve(process.env.PLAYROOM_NEW_PWA),catalog=path.resolve(catalogPath);
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),fixture=await serveBuiltPreviewUpgrade(oldRoot,newRoot,{hold:()=>false,catalogRoot:catalog}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const bundle=version=>{const folder=path.join(catalog,'files',id,version);return JSON.parse(fs.readFileSync(path.join(folder,fs.readdirSync(folder).find(f=>f.endsWith('.json'))),'utf8'));};
 try{
  const context=await browser.newContext({viewport:{width:740,height:390},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const network=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));
  await page.goto(fixture.url);await page.waitForFunction(()=>navigator.serviceWorker.controller&&globalThis.PlayroomAppBridge);
  assert.equal(fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).length,0,'the shell does not download packages on startup');
  await page.evaluate(async({p,u,renamed})=>{
   await PlayroomPacks.install(PlayroomPacks.prepare(p),{activate:true});
   const session=new TabletopSession(TabletopCore,p.manifest.id,{seed:17,mode:'pass',players:[{name:'A'},{name:'B'}]});
   if(renamed){
    for(const actor of [0,1])for(const type of ['auto','ready'])session.act(actor,TabletopCore.legalActions(session.current,actor).find(action=>action.type===type));
    const actor=session.current.turn;
    session.act(actor,TabletopCore.legalActions(session.current,actor)[0]);
   }
   await PlayroomAppBridge.saveLibrary.activateAsync(session,'update-all-pinned');
   await PlayroomPacks.install(PlayroomPacks.prepare(u),{activate:false});
   localStorage.setItem('update-all-owner-marker','keep');
  },{p:bundle(previous),u:bundle(unused),renamed:id!==targetId});
  const before=await page.evaluate(()=>({version:PlayroomAppVersion,save:JSON.stringify(PlayroomAppBridge.saveLibrary.open('update-all-pinned').export())}));
  fixture.deployed=true;await page.evaluate(()=>PlayroomPWA.checkForUpdate());await page.waitForFunction(()=>!!PlayroomPWA.updateInfo);const target=await page.evaluate(()=>PlayroomPWA.updateInfo.version);assert.notEqual(target,before.version);
  await openBuiltUpdates(page);
  await page.locator('[data-command=update-all]').click();
  await page.waitForFunction(target=>PlayroomAppVersion===target,target);await page.waitForFunction(()=>globalThis.PlayroomAppBridge&&!localStorage.getItem('playroom.update-all.v1'),null,{timeout:45000});
  const after=await page.evaluate(()=>({version:PlayroomAppVersion,packs:PlayroomPacks.list().map(p=>({id:p.id,version:p.version,active:p.active})),save:JSON.stringify(PlayroomAppBridge.saveLibrary.open('update-all-pinned').export()),marker:localStorage.getItem('update-all-owner-marker')}));
  const update=JSON.parse(fs.readFileSync(path.join(catalog,'catalog'),'utf8')).packs.find(p=>p.id===targetId);
  assert.equal(after.version,target);assert.equal(after.save,before.save);assert.equal(after.marker,'keep');
  assert(after.packs.some(p=>p.id===targetId&&p.version===update.version&&p.active),JSON.stringify(after.packs));
  assert(after.packs.some(p=>p.id===id&&p.version===previous));assert(!after.packs.some(p=>p.id===id&&p.version===unused));
  assert(after.packs.every(p=>p.id===id||p.id===targetId),'update all does not install unrelated games');
  assert.deepEqual(fixture.requests.filter(r=>r.relative.startsWith('api/packs/files/')).map(r=>'/'+r.relative),[update.url]);
  if(id!==targetId)await page.locator('.post-update-modal [data-post-update-done]').click();
  await context.setOffline(true);await page.reload();await page.waitForFunction(id=>globalThis.PlayroomAppBridge&&globalThis.PlayroomPacks?.list().some(p=>p.id===id),targetId);
  assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.open('update-all-pinned').export())),before.save);
  if(id!==targetId){
   // The new tile and the archived match must both have usable entry points offline.
   await page.locator('[data-start='+targetId+']').waitFor();
   const {activeSurface,resumeSaved}=require('./browser-origin.cjs');
   await page.locator('[data-hub-page=sessions]').click();
   await page.locator('.saved-game[data-session-id=update-all-pinned]').click();
   await activeSurface(page).locator('[data-history-id=update-all-pinned]').click();
   const history=page.locator('#replay-range');
   await history.waitFor();
   assert(Number(await history.getAttribute('max'))>0);
   await page.locator('.game-frame-tools [data-command=history-close]').click();
   await resumeSaved(page,'update-all-pinned');
   await page.locator('[data-sdk-player-scene]').waitFor();
   assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.current()?.session.export())),before.save);
  }
  assert.deepEqual(errors,[]);assert.equal(network.nativeSupabaseRequests,0);
  if(process.env.PLAYROOM_UPDATE_ALL_REPORT)fs.writeFileSync(process.env.PLAYROOM_UPDATE_ALL_REPORT,JSON.stringify({beforeVersion:before.version,target,oldPackId:id,newPackId:targetId,pinned:previous,removed:unused,active:update.version,packSha256:update.sha256,offline:true,saveUnchanged:true,unrequestedGames:0,errors},null,2)+'\n');
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('catalog and pack requests time out stalled headers or body and allow retry',{timeout:4000},async()=>{
 const {RemoteCatalog}=require('../app/remote-catalog.js'),crypto=require('node:crypto'),bundle={manifest:{id:'demo',version:'1.0.0',stateVersion:1,engineApi:4,viewApi:3}},bytes=Buffer.from(JSON.stringify(bundle)),sha=crypto.createHash('sha256').update(bytes).digest('hex'),item={...bundle.manifest,sha256:sha,url:`/api/packs/files/demo/1.0.0/${sha}.playroom-pack.json`},catalog={format:'playroom-catalog',version:1,collection:'1.0.0',packs:[item]};let signal,cancelled=false,installed=0,mode='headers';
 const client=new RemoteCatalog({requestTimeout:25,manager:{list:()=>[],parse:JSON.parse,prepare:v=>v,install:()=>installed++},crypto:crypto.webcrypto,storage:{getItem:()=>null,setItem(){}},fetcher:async(url,opts)=>{signal=opts.signal;if(mode==='headers')return new Promise(()=>{});if(mode==='body')return new Response(new ReadableStream({cancel(){cancelled=true}}));return new Response(url.endsWith('/catalog')?JSON.stringify(catalog):bytes)}});
 const bounded=promise=>Promise.race([promise.then(()=>null,e=>e.code),new Promise(resolve=>setTimeout(()=>resolve('still pending'),200))]);
 assert.equal(await bounded(client.refresh()),'timeout','catalog headers cannot hang forever');assert(signal.aborted);
 mode='ok';await client.refresh();mode='body';assert.equal(await bounded(client.install('demo')),'timeout','pack body has a bounded idle wait');assert.equal(installed,0);assert(cancelled);
 mode='ok';await client.install('demo');assert.equal(installed,1,'a timeout releases the request for a successful retry');
});


test('pack body progress renews idle deadline without accepting an oversized response',async()=>{
 const Deadline=require('../platform/web/request-deadline.js'),encoder=new TextEncoder();let cancelled=false;
 const value=await Deadline.run(async(signal,touch)=>{let i=0;const response=new Response(new ReadableStream({async pull(c){await new Promise(r=>setTimeout(r,10));if(i++<5)c.enqueue(encoder.encode('x'));else c.close();}}));return Deadline.bytes(response,{signal,touch,limit:10});},{timeout:40});assert.equal(value.length,5,'continuous progress may take longer than the idle budget');
 await assert.rejects(()=>Deadline.run((signal,touch)=>Deadline.bytes(new Response(new ReadableStream({start(c){c.enqueue(encoder.encode('too large'));},cancel(){cancelled=true}})),{signal,touch,limit:2}),{timeout:40}),/слишком большой/);assert(cancelled);
});

test('built PWA releases stalled install and update spinners and keeps retry usable',{timeout:40000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:relative=>relative.endsWith('.playroom-pack.json')}),{chromium,executablePath}=require('../scripts/codex/browser.cjs'),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));await page.goto(fixture.url);await page.waitForFunction(()=>navigator.serviceWorker.controller&&globalThis.PlayroomAppBridge);await page.getByRole('button',{name:'Выбрать игры',exact:true}).click();const active=()=>page.locator('#modal-root>[data-surface-state=active]');await active().locator('[data-pack-tab=available]').click();await active().locator('[data-pack-online=uno]').waitFor();fixture.deployed=true;
 const started=Date.now();await active().locator('[data-pack-online=uno]').click();await fixture.held;await active().locator('[data-pack-online=uno][data-pack-install-state=error]').waitFor({timeout:11000});const failedAfterMs=Date.now()-started;assert(failedAfterMs<11000);assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),0);fixture.pendingBody.res.destroy();await active().locator('[data-pack-online=uno]').click();await active().locator('[data-pack-online=uno][data-pack-install-state=ready]').waitFor();assert.equal(await page.evaluate(()=>PlayroomPacks.list().length),1);
 await active().locator('.modal-head [data-command=close-modal]').click();await openBuiltUpdates(page);let stalledHeads=0;await context.route('**/sw.js',route=>{if(route.request().method()==='HEAD'){stalledHeads++;return;}return route.continue();});await active().locator('[data-command=check-updates]').click();await page.waitForFunction(()=>{const b=document.querySelector('[data-command=check-updates]');return b&&!b.disabled&&!b.textContent.includes('Проверяем');},null,{timeout:11000});assert(stalledHeads>0);assert.match(await active().innerText(),/Не удалось проверить обновление приложения|Сервер не отвечает/);await context.unroute('**/sw.js');await active().locator('[data-command=check-updates]').click();await page.waitForFunction(()=>{const b=document.querySelector('[data-command=check-updates]');return b&&!b.disabled&&!b.textContent.includes('Проверяем');});assert.deepEqual(errors,[]);
 if(process.env.PLAYROOM_STALLED_REPORT)fs.writeFileSync(process.env.PLAYROOM_STALLED_REPORT,JSON.stringify({failedAfterMs,packRetry:true,updateRetry:true,errors},null,2));
 }finally{await browser.close();fixture.pendingBody?.res.destroy();await new Promise(resolve=>fixture.server.close(resolve));}
});

test('remote SDK requirements reject before download and match the checked bundle',async()=>{
 const crypto=require('node:crypto'),{RemoteCatalog,validate}=require('../app/remote-catalog.js'),Packs=require('../core/packs.js');
 const manifest={id:'guarded',version:'1.0.0',stateVersion:1,engineApi:4,viewApi:3,sdkFeatures:['local-input-v1','parameter-previews-v2']},bundle={manifest},bytes=Buffer.from(JSON.stringify(bundle)),sha=crypto.createHash('sha256').update(bytes).digest('hex'),entry={...manifest,sha256:sha,url:`/api/packs/files/guarded/1.0.0/${sha}.playroom-pack.json`};
 let downloads=0,parses=0,prepared=0;
 const manager={constructor:{SDK_FEATURES:Packs.SDK_FEATURES},list:()=>[],parse:text=>{parses++;return JSON.parse(text);},prepare:b=>{prepared++;return b;}},remote=new RemoteCatalog({manager,crypto:crypto.webcrypto,storage:{getItem:()=>null,setItem(){}},fetcher:async()=>{downloads++;return new Response(bytes);}});
 const catalog=item=>validate({format:'playroom-catalog',version:1,collection:'1.0.0',packs:[item]});
 for(const requirements of [null,'feature',['x','x'],[''],Array(17).fill('x')])assert.throws(()=>catalog({...entry,sdkFeatures:requirements}));
 remote.current=catalog({...entry,sdkFeatures:['not-supported-v1']});await assert.rejects(()=>remote.prepare('guarded'),e=>e.code==='PACK_SDK_UNSUPPORTED');assert.equal(downloads,0,'unsupported requirements never download pack bytes');
 remote.current=catalog(entry);assert.deepEqual((await remote.prepare('guarded')).manifest,manifest);assert.equal(prepared,1);
 remote.current=catalog({...entry,sdkFeatures:['local-input-v1']});await assert.rejects(()=>remote.prepare('guarded'));assert.equal(prepared,1,'catalog/bundle requirement mismatch is not prepared');
 const oldEntry={...entry};delete oldEntry.sdkFeatures;remote.current=catalog(oldEntry);await remote.prepare('guarded');assert.equal(parses,3,'catalogs without SDK metadata still go through bundle parsing');assert.equal(prepared,2);
 manager.parse=()=>{throw Error('full bundle validation rejected unsupported SDK');};await assert.rejects(()=>remote.prepare('guarded'),/full bundle validation/);assert.equal(prepared,2,'missing catalog SDK data never bypasses full importer validation');
});


test('preview to stable update survives reopening cleanup and repeated checks without redownload',{timeout:90000,skip:!process.env.PLAYROOM_CATALOG_PWA||!process.env.PLAYROOM_PREVIEW_CATALOG},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),directory=path.resolve(process.env.PLAYROOM_CATALOG_PWA),catalogRoot=path.resolve(process.env.PLAYROOM_PREVIEW_CATALOG),catalog=JSON.parse(fs.readFileSync(path.join(catalogRoot,'catalog'),'utf8')),entry=catalog.packs.find(p=>p.id==='uno'),compare=require('../core/packs.js').compareVersions;
 assert(entry&&!entry.version.includes('-'),'fixture requires a stable UNO release');const oldVersion=fs.readdirSync(path.join(catalogRoot,'files/uno')).filter(v=>v.startsWith(entry.version+'-preview.')).sort(compare).at(-1);assert(oldVersion,'fixture requires the preceding preview bytes');const oldFolder=path.join(catalogRoot,'files/uno',oldVersion),oldFile=path.join(oldFolder,fs.readdirSync(oldFolder).find(n=>n.endsWith('.playroom-pack.json'))),fixture=await serveBuiltPreviewUpgrade(directory,directory,{hold:()=>false}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];let downloads=0;page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname===entry.url)downloads++;});await require('./account-sync-fixture.cjs').installFetch(context,r=>r.fulfill({json:{}}));await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'release-order',name:'Игрок',createdAt:1,updatedAt:1})));
  const url=process.env.PLAYROOM_VERSION_CYCLE_URL||fixture.url,active=s=>page.locator('#modal-root>[data-surface-state=active]').locator(s),close=()=>active('.modal-head [data-command=close-modal]').click(),open=async()=>{await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=packs]').click();};
  await page.goto(url);if(process.env.PLAYROOM_VERSION_CYCLE_VERSION)assert.equal(await page.evaluate(()=>PlayroomAppVersion),process.env.PLAYROOM_VERSION_CYCLE_VERSION);await page.locator('.packs-empty-hub').waitFor();await open();await active('#pack-file').setInputFiles(oldFile);await active('[data-pack-install]').click();await page.waitForFunction(v=>PlayroomPacks.list().some(p=>p.id==='uno'&&p.version===v&&p.active),oldVersion);await active('[data-pack-tab=installed]').click();await active('[data-pack-update-all]').click();await page.waitForFunction(v=>PlayroomPacks.list().some(p=>p.id==='uno'&&p.version===v&&p.active),entry.version);await close();
  for(let cycle=0;cycle<3;cycle++){
   await page.reload();await page.locator('.game-grid').waitFor();await open();assert.equal(await page.evaluate(()=>PlayroomPacks.list().find(p=>p.id==='uno'&&p.active).version),entry.version,'reopen retains the stable release');
   if(cycle===0){await active('[data-pack-bulk=old]').click();await active('[data-pack-confirm="1"]').click();await page.waitForFunction(v=>!PlayroomPacks.list().some(p=>p.id==='uno'&&p.version===v),oldVersion);}
   await active('[data-pack-quick] [data-pack-catalog-refresh]').click();await page.waitForFunction(()=>!PlayroomRemotePacks.pending().some(p=>p.id==='uno'));assert.equal(await active('[data-pack-update-all]:visible').count(),0,'cleanup cannot create a repeat update');assert.deepEqual(await page.evaluate(()=>PlayroomPacks.list().filter(p=>p.id==='uno').map(p=>p.version)),[entry.version]);await close();
  }
  assert.equal(downloads,1);assert.deepEqual(errors,[]);if(process.env.PLAYROOM_VERSION_CYCLE_REPORT)fs.writeFileSync(process.env.PLAYROOM_VERSION_CYCLE_REPORT,JSON.stringify({oldVersion,installed:entry.version,cycles:3,downloads,errors},null,2));
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});
