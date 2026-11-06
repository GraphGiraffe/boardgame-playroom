'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');

test('Pages origin proxy permits one TLS destination and denies other redirect hosts and ports',async()=>{
 const http=require('node:http'),net=require('node:net'),{originProxy}=require('../scripts/pages-origin-proxy.cjs');
 const upstream=http.createServer((req,res)=>res.end('allowed-origin'));
 await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
 const authority='127.0.0.1:'+upstream.address().port,proxy=await originProxy('https://'+authority);
 const connect=target=>new Promise((resolve,reject)=>{
  const socket=net.connect(Number(new URL(proxy.server).port),'127.0.0.1');let output='',sent=false;
  socket.setTimeout(5000,()=>socket.destroy(Error('Proxy test timed out')));socket.on('error',reject);
  socket.on('connect',()=>socket.write('CONNECT '+target+' HTTP/1.1\r\nHost: '+target+'\r\n\r\n'));
  socket.on('data',data=>{output+=data;if(!sent&&output.includes('200 Connection Established')){sent=true;socket.write('GET / HTTP/1.1\r\nHost: '+authority+'\r\nConnection: close\r\n\r\n');}});
  socket.on('close',()=>resolve(output));
 });
 try{
  assert.match(await connect(authority),/allowed-origin/);
  assert.match(await connect('forbidden.invalid:443'),/^HTTP\/1.1 403/);
  assert.match(await connect('127.0.0.1:1'),/^HTTP\/1.1 403/);
 }finally{await proxy.close();await new Promise(resolve=>upstream.close(resolve));}
});

test('protected Pages browser authenticates its initial Service Worker script through a scoped TLS bridge',{timeout:30000},async()=>{
 const https=require('node:https'),os=require('node:os'),crypto=require('node:crypto');
 const {execFileSync}=require('node:child_process'),{accessProxy}=require('../scripts/pages-access-proxy.cjs');
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-access-test-'));
 const key=path.join(directory,'key.pem'),cert=path.join(directory,'cert.pem');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore'});
 const seen=[];
 const server=https.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},(request,response)=>{
  const authorized=request.headers['cf-access-client-id']==='id'&&request.headers['cf-access-client-secret']==='secret';
  seen.push({path:request.url,authorized});
  if(!authorized){response.writeHead(302,{location:'/login'}).end();return;}
  if(request.url==='/sw.js')response.writeHead(200,{'content-type':'application/javascript'}).end("self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));");
  else response.writeHead(200,{'content-type':'text/html'}).end("<script>navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready).then(()=>document.body.dataset.worker='ready')</script><body></body>");
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let proxy,browser;
 try{
  proxy=await accessProxy('https://127.0.0.1:'+server.address().port,{clientId:'id',clientSecret:'secret',upstreamCA:fs.readFileSync(cert)});
  browser=await chromium.launch({headless:true,executablePath:executablePath(),proxy:{server:proxy.server},args:['--no-sandbox','--proxy-bypass-list=<-loopback>','--ignore-certificate-errors-spki-list='+proxy.spki]});
  const context=await browser.newContext({ignoreHTTPSErrors:true});
  const page=await context.newPage();await page.goto('https://127.0.0.1:'+server.address().port+'/');
  await page.waitForFunction(()=>document.body.dataset.worker==='ready');
  assert.ok(seen.some(entry=>entry.path==='/sw.js'&&entry.authorized),'browser must authenticate the Worker script');
  const checked=await context.request.get('https://127.0.0.1:'+server.address().port+'/sw.js',{headers:{'CF-Access-Client-Id':'id','CF-Access-Client-Secret':'secret'}});
  assert.equal(checked.status(),200,'API requests must accept the local bridge certificate');
  await assert.rejects(page.goto('https://forbidden.invalid/'));
 }finally{await browser?.close();await proxy?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});

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

test('private Pages packaging removes PWA prefix and preserves access files',()=>{
 const {execFileSync}=require('node:child_process');
 const code=`import importlib.util, tempfile
from pathlib import Path
from zipfile import ZipFile
spec=importlib.util.spec_from_file_location('pages','scripts/package-pages.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
with tempfile.TemporaryDirectory() as d:
 p=Path(d)
 with ZipFile(p/'public.zip','w') as z:
  for n in ['index.html','sw.js','app/app.js','manifest.webmanifest']: z.writestr('playroom-pwa/'+n,n)
 with ZipFile(p/'private.zip','w') as z:
  for n in ['_routes.json','manifest.webmanifest']: z.writestr(n,'private-'+n)
  z.writestr('_worker.js','export default {fetch(request,env){return env.ASSETS.fetch(request)}}')
 m.package(p/'public.zip',p/'private.zip',p/'out.zip')
 with ZipFile(p/'out.zip') as z:
  assert 'index.html' in z.namelist()
  assert not any(n.startswith('playroom-pwa/') for n in z.namelist())
  assert b'PlayroomPrivateWorker' in z.read('_worker.js')
  assert b'PlayroomPackRoute' in z.read('_worker.js')
  assert z.read('manifest.webmanifest')==b'private-manifest.webmanifest'
`;
 execFileSync('python3',['-c',code],{cwd:root,stdio:'pipe'});
});

test('R2 catalog route verifies snapshot bytes and serves immutable pack files',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto');
 const source=fs.readFileSync(path.join(root,'scripts/pack-catalog-route.js'),'utf8');
 const route=vm.runInNewContext(source+'\nPlayroomPackRoute',{Request,Response,URL,crypto:crypto.webcrypto,Uint8Array});
 const snapshot=Buffer.from('{"format":"playroom-catalog","version":1,"packs":[]}');
 const sha=crypto.createHash('sha256').update(snapshot).digest('hex'),pack=Buffer.from('{"manifest":{"id":"uno"}}');
 const packSha=crypto.createHash('sha256').update(pack).digest('hex');
 const objects=new Map([['catalog/current.json',{text:async()=>JSON.stringify({version:1,key:`catalog/snapshots/${sha}.json`,sha256:sha})}],[`catalog/snapshots/${sha}.json`,{arrayBuffer:async()=>Uint8Array.from(snapshot).buffer}],[`files/uno/0.4.9/${packSha}.playroom-pack.json`,{body:pack}]]);
 const env={PLAYROOM_PACKS:{get:key=>objects.get(key)}};
 const catalog=await route.fetch(new Request('https://example.test/api/packs/catalog'),env);
 assert.equal(catalog.status,200);assert.equal(catalog.headers.get('cache-control'),'no-store, max-age=0');assert.equal(await catalog.text(),snapshot.toString());
 const file=await route.fetch(new Request(`https://example.test/api/packs/files/uno/0.4.9/${packSha}.playroom-pack.json`),env);
 assert.equal(file.status,200);assert.match(file.headers.get('cache-control'),/immutable/);assert.equal(await file.text(),pack.toString());
 objects.set(`catalog/snapshots/${sha}.json`,{arrayBuffer:async()=>Uint8Array.from(Buffer.from('tampered')).buffer});
 assert.equal((await route.fetch(new Request('https://example.test/api/packs/catalog'),env)).status,503);
 assert.equal((await route.fetch(new Request('https://example.test/api/packs/catalog'),{})).status,503);
});

test('remote pack loader checks URL, SHA256 and manifest before installation',async()=>{
 const crypto=require('node:crypto'),{RemoteCatalog,validate}=require('../app/remote-catalog.js');
 const bundle={manifest:{id:'uno',version:'0.4.9',stateVersion:1,engineApi:4,viewApi:3}};
 const bytes=Buffer.from(JSON.stringify(bundle)),sha=crypto.createHash('sha256').update(bytes).digest('hex');
 const item={...bundle.manifest,sha256:sha,url:`/api/packs/files/uno/0.4.9/${sha}.playroom-pack.json`};
 const catalog={format:'playroom-catalog',version:1,collection:'0.6.0',packs:[item]};
 assert.throws(()=>validate({...catalog,packs:[{...item,url:'/other-origin'}]}));
 assert.throws(()=>validate({...catalog,packs:[item,item]}));
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

test('Pages deployment validates immutable archives, access routes and rollback targets',()=>{
 const {execFileSync}=require('node:child_process');
 execFileSync('python3',['-c',`import build, hashlib, importlib.util, io, json, tempfile, zipfile
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('pages', 'scripts/pages-deploy.py')
pages=importlib.util.module_from_spec(spec);spec.loader.exec_module(pages)
def archive(items):
 buffer=io.BytesIO()
 with zipfile.ZipFile(buffer,'w') as z:
  for name,value in items.items():z.writestr(name,value)
 return buffer.getvalue()
def denied(call):
 try:call()
 except (ValueError, KeyError):return
 raise AssertionError('Unsafe deployment accepted')
with patch.object(build,'installed_script',return_value='globalThis.PlayroomInstalledPacks = [];'):
 items=dict(build.pwa_runtime_items())
private={'_worker.js':'export default {fetch(request,env){return env.ASSETS.fetch(request)}}', '_routes.json':json.dumps({'version':1,'include':['/*'],'exclude':['/icons/*']}), 'manifest.webmanifest':'{}'}
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);public=root/'playroom-pwa.zip';sums=root/'SHA256SUMS'
 def package(files):
  public.write_bytes(archive({'pwa/'+k:v for k,v in files.items()}))
  sums.write_text(hashlib.sha256(public.read_bytes()).hexdigest()+'  playroom-pwa.zip\\n')
 package(items)
 result=pages.prepare(public,sums,archive(private),root/'valid')
 assert result['files']==len(items)+2
 assert 'PlayroomPrivateWorker' in (root/'valid/_worker.js').read_text()
 assert 'PlayroomPackRoute' in (root/'valid/_worker.js').read_text()
 denied(lambda:pages.prepare(public,sums,archive(private),root/'valid'))
 sums.write_text('0'*64+'  playroom-pwa.zip\\n')
 denied(lambda:pages.prepare(public,sums,archive(private),root/'bad'))
 package(dict(items,**{'../escape':'bad'}))
 denied(lambda:pages.prepare(public,sums,archive(private),root/'bad'))
 package(dict(items,**{'_worker.js':'leaked wrapper'}))
 denied(lambda:pages.prepare(public,sums,archive(private),root/'bad'))
 asset=next(n for n in items if n.endswith('.js') and n!='sw.js')
 package(dict(items,**{asset:b'corrupted'}))
 denied(lambda:pages.prepare(public,sums,archive(private),root/'bad'))
 package(items)
 for exclusion in ['/*','/index.html','/sw.js','/app/*']:
  unsafe=dict(private,**{'_routes.json':json.dumps({'version':1,'include':['/*'],'exclude':[exclusion]})})
  denied(lambda:pages.prepare(public,sums,archive(unsafe),root/'bad'))
for environment,status in [('preview','success'),('production','failure')]:
 client=object.__new__(pages.Pages);calls=[]
 def api(method='GET',suffix=''):
  calls.append(method);return {'environment':environment,'latest_stage':{'status':status}}
 client.api=api
 denied(lambda:client.rollback('12345678-1234-1234-1234-123456789abc'))
 assert calls==['GET']
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
for marker in ['previous','current']:
 def read(path):
  content=original_read(path)
  return content+(':root{--build-check:'+marker+'}').encode() if path==build.ROOT/'app/styles.css' else content
 with patch.object(Path, 'read_bytes', read):
  items=dict(build.pwa_runtime_items())
 if marker=='previous':
  items['sw.js']=re.sub(rb"const CACHE='[^']+'",b"const CACHE='playroom-pwa-v0.15.0'",items['sw.js'])
 items['sw.js']=items['sw.js'].replace(b"{cache:'reload',...(controller?",b"{cache:'reload',headers:{'X-Playroom-Test-Download':'1'},...(controller?")
 snapshots.append({name:base64.b64encode(content).decode() for name,content in items.items()})
print(json.dumps(snapshots))`],{cwd:root,maxBuffer:20*1024*1024}));
 if(suppressControllerChange)for(const snapshot of snapshots){const worker=Buffer.from(snapshot['sw.js'],'base64').toString().replace(".map(client=>client.navigate(client.url))",".map(()=>Promise.resolve())");snapshot['sw.js']=Buffer.from(worker).toString('base64');}
 let deployed=0,holdDownloads=true,heldResponse=null,releaseHeld;const currentRequests=[],downloadRequests=[];const heldReady=new Promise(resolve=>releaseHeld=resolve);
 const server=http.createServer((req,res)=>{
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
 let page=await context.newPage();await page.addInitScript(suppress=>{if(suppress){const add=ServiceWorkerContainer.prototype.addEventListener;ServiceWorkerContainer.prototype.addEventListener=function(type,...args){if(type!=='controllerchange')return add.call(this,type,...args);};}},suppressControllerChange);await page.addInitScript(()=>{window.testActiveRoom=true;let network;Object.defineProperty(window,'PlayroomNetworkLibrary',{configurable:true,get:()=>network,set:value=>{network={...value,hasActiveRoom:()=>window.testActiveRoom||value.hasActiveRoom()};}});});await page.goto(url);
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
  await page.locator('#pwa-update-button').waitFor();assert.equal(await page.locator('.updates-modal').count(),0,'active room suppresses automatic popup');await page.locator('#pwa-update-button').click();await page.waitForSelector('.updates-modal');const buttonStates=[];const rememberButton=async()=>buttonStates.push(await page.locator('#pwa-update-button').evaluate(e=>({phase:e.dataset.updatePhase,icon:e.querySelector('svg').dataset.uiIcon,color:getComputedStyle(e).backgroundColor})));await rememberButton();await page.screenshot({path:path.join(screenshots,'available-390.png')});
  assert.equal(currentRequests.filter(name=>/\.(js|css)$/.test(name)&&name!=='platform/web/push-worker.js').length,0,'availability must not fetch application assets beyond the worker bootstrap: '+JSON.stringify(currentRequests));
  assert.equal(await page.locator('[data-command=update-app]').isVisible(),false);assert.equal(await page.locator('[data-command=download-app]').innerText(),'Подготовить обновление');
  await page.locator('[data-command=download-app]').click();await heldReady;
  await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.completed>5&&Number(document.querySelector('[data-update-progress]')?.getAttribute('aria-valuenow'))>0);
  const meter=await page.locator('[data-update-progress]').evaluate(e=>({percent:Number(e.getAttribute('aria-valuenow')),height:getComputedStyle(e).height}));assert(meter.percent>0&&meter.percent<100,JSON.stringify(meter));assert.equal(meter.height,'6px');
  await page.locator('.updates-modal .modal-head [data-command=close-modal]').click();await page.locator('#pwa-update-button[data-update-phase=downloading]').waitFor();assert.equal(await page.locator('.updates-modal').count(),0,'closing window keeps download running');await rememberButton();
  await page.locator('#pwa-update-button').click();await page.locator('[data-update-progress]').waitFor();
  await page.screenshot({path:path.join(screenshots,'downloading-390.png')});
  await context.setOffline(true);holdDownloads=false;heldResponse.destroy();
  await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.phase==='paused');assert.match(await page.locator('[data-update-status]').innerText(),/Нет подключения|Соединение прервано/);assert.equal(await page.locator('#pwa-update-button').getAttribute('data-update-phase'),'paused');
  await rememberButton();await page.screenshot({path:path.join(screenshots,'paused-390.png')});
  const savedFiles=await page.evaluate(async()=>{const key=(await caches.keys()).find(key=>key.startsWith('playroom-pwa-')&&key!=='playroom-pwa-v0.15.0');return (await(await caches.open(key)).keys()).map(r=>new URL(r.url).pathname.slice('/playroom-hod-test/'.length)).filter(name=>!name.includes('__playroom-update'));});assert(savedFiles.length>5);
  const savedCounts=new Map(savedFiles.map(name=>[name,downloadRequests.filter(p=>p===name).length]));
  await context.setOffline(false);const cdp=await context.newCDPSession(page);await cdp.send('ServiceWorker.enable');await cdp.send('ServiceWorker.stopAllWorkers');await cdp.detach();await page.reload();await page.locator('#pwa-update-button').waitFor();if(!await page.locator('.updates-modal').count())await page.locator('#pwa-update-button').click();
  await page.waitForFunction(()=>PlayroomPWA.updateInfo?.download.phase==='paused');assert.equal(await page.locator('[data-command=download-app]').getAttribute('aria-label'),'Продолжить загрузку');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous','reopening still uses the installed version');
  const expectedIndex=require('node:crypto').createHash('sha256').update(Buffer.from(snapshots[1]['index.html'],'base64')).digest('hex');
  const cachedIndex=await page.evaluate(async expected=>{const key=(await caches.keys()).find(key=>key.startsWith('playroom-pwa-')&&key!=='playroom-pwa-v0.15.0'),cache=await caches.open(key),r=await cache.match('./index.html');if(!r)return {key,missing:true};return {key,status:r.status,redirected:r.redirected,url:r.url,hash:[...new Uint8Array(await crypto.subtle.digest('SHA-256',await r.clone().arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join(''),expected};},expectedIndex);
  fs.writeFileSync(path.join(screenshots,'cached-index-check.json'),JSON.stringify(cachedIndex,null,2));assert.equal(cachedIndex.hash,expectedIndex,'checkpoint contains the exact candidate document');
  const afterRestartCounts=new Map(savedFiles.map(name=>[name,downloadRequests.filter(p=>p===name).length]));
  for(const name of savedFiles.filter(name=>name!=='index.html'&&name!=='platform/web/push-worker.js'))assert.equal(afterRestartCounts.get(name),savedCounts.get(name),'restart keeps cached asset: '+name);
  await page.locator('[data-command=download-app]').click();await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.phase==='ready');
  const delta=await page.evaluate(()=>PlayroomPWA.updateInfo.download);assert(delta.reusedFiles>5);assert(delta.total<delta.totalSize/2,JSON.stringify(delta));assert(!downloadRequests.some(name=>name.startsWith('installed-packs.')),'unchanged packs must be reused');
  fs.writeFileSync(path.join(screenshots,'resume-request-counts.json'),JSON.stringify({download:delta,beforeRestart:Object.fromEntries(savedCounts),afterRestart:Object.fromEntries(afterRestartCounts),afterResume:Object.fromEntries(savedFiles.map(name=>[name,downloadRequests.filter(p=>p===name).length])),allRequests:currentRequests},null,2));
  for(const name of savedFiles)assert.equal(downloadRequests.filter(p=>p===name).length,afterRestartCounts.get(name),'resume keeps verified file: '+name);
  await rememberButton();assert.deepEqual(buttonStates.map(s=>s.phase),['available','downloading','paused','ready']);assert.equal(new Set(buttonStates.map(s=>s.icon)).size,4);assert.equal(new Set(buttonStates.map(s=>s.color)).size,4);fs.writeFileSync(path.join(screenshots,'button-states.json'),JSON.stringify(buttonStates,null,2));
  assert.equal(await page.locator('#pwa-update-button').getAttribute('data-update-phase'),'ready');assert.equal(await page.locator('[data-update-progress]').getAttribute('aria-valuenow'),'100');
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous','download never activates the worker');
  await page.locator('[data-command=update-app]').click();assert.match(await page.locator('[data-update-status]').innerText(),/выйдите из комнаты/);assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),true,'active room cannot install or reload');
  await page.evaluate(()=>{window.testActiveRoom=false;});
  for(const [width,height] of [[390,844],[844,390]]){await page.setViewportSize({width,height});assert(await page.locator('.updates-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.locator('[data-command=update-app]').scrollIntoViewIfNeeded();assert(await page.locator('.update-v021-actions').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight));await page.screenshot({path:path.join(screenshots,'ready-'+width+'.png')});}await page.setViewportSize({width:390,height:844});
  await page.locator('[data-command=update-app]').click();
  await page.waitForFunction(()=>document.querySelector('[data-update-status]')?.textContent.includes('Закройте другие окна'));
  assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),true);
  await second.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>true));
  let loadedDocuments=0;page.on('domcontentloaded',()=>loadedDocuments++);
  await page.locator('[data-command=update-app]').click();
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await second.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await page.waitForTimeout(1500);assert.equal(loadedDocuments,1,'successful activation loads one document; history.pushState is not a reload');assert.equal(await page.locator('.updates-modal').count(),0,'installed update does not leave its old dialog');
  assert.deepEqual(await other.evaluate(()=>messages),[],'another application receives no update checks or notices');
  await context.setOffline(true);await page.reload();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'current');
  assert.equal(await page.evaluate(()=>localStorage.getItem('saved-game-marker')),'keep');
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('saved-game-marker');r.onsuccess=()=>{const db=r.result,q=db.transaction('games').objectStore('games').get(1);q.onsuccess=()=>{db.close();resolve(q.result);};};})),'keep');
  const keys=await page.evaluate(()=>caches.keys());
  assert.equal(keys.includes('playroom-pwa-v0.15.0'),false);assert.ok(keys.includes('unrelated-app'));
  assert.equal(keys.filter(key=>key.startsWith('playroom-pwa-')).length,1);
  assert.equal(fetchCounts.nativeSupabaseRequests,0);fs.writeFileSync(path.join(screenshots,'operation-report.json'),JSON.stringify({fetchCounts,scope:'real local worker download, failure, resume, guarded apply, reload once, offline persistence; Chromium desktop emulation'},null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});

test('local Pages production deploy uploads once without GitHub and rolls back on failed smoke',()=>{
 const code=String.raw`
import importlib.util, json, os, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('pages', 'scripts/pages-deploy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
old='11111111-1111-1111-1111-111111111111';new='22222222-2222-2222-2222-222222222222';sha='a'*40
class Pages:
 def __init__(self):self.project='existing';self.current=old;self.uploads=[];self.rollbacks=[]
 def api(self,*args,**kwargs):
  if kwargs.get('suffix')=='/deployments':return [{'id':new,'environment':'production','created_on':'1','url':'https://new.example','deployment_trigger':{'metadata':{'branch':'production','commit_hash':sha,'commit_message':self.message}}}]
  return {'production_branch':'production','subdomain':'existing.pages.dev','canonical_deployment':{'id':self.current}}
 def production_target(self,value):return {'id':value,'url':'https://old.example'}
 def manual_uploads(self,project):pass
 def rollback(self,value):self.rollbacks.append(value);self.current=value
for fail in (False,True):
 pages=Pages()
 def command(cmd,**kwargs):
  assert cmd[0]!='gh'
  if cmd[0]=='npx':pages.message=cmd[cmd.index('--commit-message')+1];pages.uploads.append(cmd[cmd.index('--branch')+1]);pages.current=new
 def prepare(public,sums,wrapper,destination,catalog_channel=""):destination.mkdir();return {'sha256':'b'*64}
 def smoke(url,*args,**kwargs):
  if fail and url=='https://new.example':raise ValueError('smoke failed')
  if kwargs.get('report_path'):kwargs['report_path'].write_text(json.dumps({'appVersion':'0.18.0','catalog':{'collection':'0.7.0','sha256':'c'*64}}))
 args=SimpleNamespace(operation='deploy',release='v0.16.0-rc.4',deployment=None,public=Path('playroom-pwa.zip'),checksums=Path('SHA256SUMS'),protected_base=Path('protected.zip'),commit=sha)
 with patch.dict(os.environ,{'PAGES_SMOKE_PASSWORD':'test','CLOUDFLARE_PRODUCTION_BRANCH':'production','CLOUDFLARE_PAGES_ORIGIN':'https://existing.pages.dev'}),patch.object(m,'Pages',lambda:pages),patch.object(m,'prepare',prepare),patch.object(m,'private_wrapper',lambda args:b'private'),patch.object(m,'smoke',smoke),patch.object(m.subprocess,'run',command):
  try:report=m.run(args)
  except ValueError:
   assert fail and pages.rollbacks==[old]
  else:
   assert not fail and report['status']=='published' and not pages.rollbacks
   assert report['productionVerified']=={'appVersion':'0.18.0','catalog':{'collection':'0.7.0','sha256':'c'*64}}
 assert pages.uploads==['production']
`;
 require('node:child_process').execFileSync('python3',['-c',code],{cwd:root,stdio:'pipe'});
});

test('preview catalog cannot read or switch the production pointer',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto');
 const source=fs.readFileSync(path.join(root,'scripts/pack-catalog-route.js'),'utf8');
 const route=vm.runInNewContext('const PlayroomPackCatalogPrefix="channels/0.18-rc.1/";'+source+'\nPlayroomPackRoute',{Request,Response,URL,crypto:crypto.webcrypto,Uint8Array});
 const body=Buffer.from('{"format":"playroom-catalog","version":1,"collection":"0.7.0-rc.1","packs":[]}'),sha=crypto.createHash('sha256').update(body).digest('hex');
 const prefix='channels/0.18-rc.1/',read=[],pointer={version:1,sha256:sha,key:prefix+`catalog/snapshots/${sha}.json`};
 const env={PLAYROOM_PACKS:{get:async key=>{read.push(key);return key===prefix+'catalog/current.json'?{text:async()=>JSON.stringify(pointer)}:key===pointer.key?{arrayBuffer:async()=>Uint8Array.from(body).buffer}:null;}}};
 assert.equal((await route.fetch(new Request('https://preview.test/api/packs/catalog'),env)).status,200);assert(read.every(key=>key.startsWith(prefix)));
 pointer.key=`catalog/snapshots/${sha}.json`;assert.equal((await route.fetch(new Request('https://preview.test/api/packs/catalog'),env)).status,503);
});

test('RC preview publishes once to a preview branch and verifies production runtime and catalog unchanged',()=>{
 const {execFileSync}=require('node:child_process');
 const code=`
import importlib.util, json, os, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('pages','scripts/pages-deploy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
old='11111111-1111-1111-1111-111111111111';new='22222222-2222-2222-2222-222222222222';sha='a'*40
class Pages:
 def __init__(self):self.project='existing';self.uploads=[];self.patches=[];self.buckets={}
 def api(self,method='GET',suffix='',payload=None):
  if method=='PATCH':
   assert set(payload['deployment_configs']['preview'])=={'r2_buckets'}
   self.patches.append(payload);self.buckets=payload['deployment_configs']['preview']['r2_buckets']
  if suffix=='/deployments':return [{'id':new,'environment':'preview','created_on':'1','url':'https://preview.example','deployment_trigger':{'metadata':{'branch':self.uploads[-1],'commit_hash':sha,'commit_message':self.message}}}]
  return {'production_branch':'production','subdomain':'existing.pages.dev','canonical_deployment':{'id':old},'deployment_configs':{'production':{'r2_buckets':{'PLAYROOM_PACKS':{'name':'existing-packs'}}},'preview':{'env_vars':({} if self.patches else None) if empty_env else {'KEEP':{'value':'value'}},'r2_buckets':self.buckets,'compatibility_date':None}}}
 def production_target(self,value):return {'id':value,'url':'https://existing.pages.dev'}
 def manual_uploads(self,project):pass
for tamper,empty_env in ((False,False),(True,False),(False,True)):
 pages=Pages();stable_reads=[]
 def prepare(public,sums,wrapper,destination,catalog_channel=''):
  assert catalog_channel=='0.18-rc.1';destination.mkdir();return {'sha256':'b'*64}
 def command(cmd,**kwargs):
  if cmd[0]=='node':return # Wrapper byte validation has independent real tests.
  assert cmd[0]=='npx';pages.message=cmd[cmd.index('--commit-message')+1];branch=cmd[cmd.index('--branch')+1];assert branch.startswith('verify-');pages.uploads.append(branch)
 def smoke(url,runtime=None,online_only=False,report_path=None):
  stable=url=='https://existing.pages.dev'
  if stable:stable_reads.append(url)
  data={'appVersion':'0.17.6' if stable else '0.18.0-rc.1','catalog':{'collection':'0.6.5' if stable else '0.7.0-rc.1','sha256':'changed' if stable and tamper and len(stable_reads)>1 else 'original'}}
  Path(report_path).write_text(json.dumps(data))
 args=SimpleNamespace(operation='preview',release='v0.18.0-rc.1',pack_channel='0.18-rc.1',deployment=None,public=Path('playroom-pwa.zip'),checksums=Path('SHA256SUMS'),protected_base=Path('private.zip'),commit=sha)
 with patch.dict(os.environ,{'PAGES_SMOKE_PASSWORD':'test','CLOUDFLARE_PRODUCTION_BRANCH':'production','CLOUDFLARE_PAGES_ORIGIN':'https://existing.pages.dev'}),patch.object(m,'Pages',lambda:pages),patch.object(m,'prepare',prepare),patch.object(m,'private_wrapper',lambda args:b'private'),patch.object(m,'smoke',smoke),patch.object(m.subprocess,'run',command):
  try:report=m.run(args)
  except ValueError as error:
   assert tamper and 'catalog changed' in str(error)
  else:
   assert not tamper and report['productionUnchanged'] and report['previewVerified']['appVersion']=='0.18.0-rc.1'
  assert len(pages.uploads)==1 and len(stable_reads)==2
  assert pages.patches[0]['deployment_configs']['preview']['r2_buckets']['PLAYROOM_PACKS']['name']=='existing-packs'
  assert (pages.api()['deployment_configs']['preview']['env_vars'] or {})==({} if empty_env else {'KEEP':{'value':'value'}})
  assert 'env_vars' not in pages.patches[0]['deployment_configs']['preview']
`;
 execFileSync('python3',['-c',code],{cwd:root,stdio:'pipe'});
});


test('built remote-catalog PWA starts and opens all preset avatars offline',{timeout:30000},async()=>{
 const os=require('node:os'),http=require('node:http'),{execFileSync}=require('node:child_process'),{chromium,executablePath}=require('../scripts/codex/browser.cjs');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-offline-avatar-'));
 execFileSync('python3',['-c','import build,sys;from pathlib import Path;build.write_directory(Path(sys.argv[1]),build.pwa_runtime_items(remote_catalog=True))',directory],{cwd:root,stdio:'pipe'});
 const server=http.createServer((req,res)=>{
  if(req.url.startsWith('/api/')){res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify({format:'playroom-catalog',version:1,collection:'test',packs:[]}));}
  const file=path.resolve(directory,req.url==='/'?'index.html':req.url.slice(1).split('?')[0]);
  if(!file.startsWith(directory+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'})[path.extname(file)]||'application/octet-stream'});res.end(fs.readFileSync(file));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});const context=await browser.newContext({playroomProfile:false}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.locator('#profile-form').waitFor();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await context.setOffline(true);await page.reload();await page.locator('#profile-form').waitFor();
  await page.locator('[data-avatar-picker]').click();assert.equal(await page.locator('.avatar-options img').count(),48);
  await page.waitForFunction(()=>[...document.querySelectorAll('.avatar-options img')].every(img=>img.complete&&img.naturalWidth===256));
  await page.locator('[data-avatar-option=circle-red]').click();await page.locator('#profile-form input').fill('Иван');await page.locator('#profile-form').evaluate(form=>form.requestSubmit());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.player-profile.v1')).avatar),'circle-red');assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}
});

test('existing preview verification pins the release and never uploads or changes production',()=>{
 const {execFileSync}=require('node:child_process');
 execFileSync('python3',['-c',`import importlib.util,json,tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('pages','scripts/pages-deploy.py');pages=importlib.util.module_from_spec(spec);spec.loader.exec_module(pages)
sha='a'*40
class ReadOnlyPages:
 def deployment_target(self,ident,environment):
  assert environment=='preview'
  return {'id':ident,'url':'https://preview.example','deployment_trigger':{'metadata':{'commit_hash':sha}}}
 def api(self,*args,**kwargs):
  assert not args and not kwargs,'No provider mutation or upload is allowed'
  return {'canonical_deployment':{'id':'stable'}}
with tempfile.TemporaryDirectory() as d:
 root=Path(d);args=SimpleNamespace(deployment='preview-id',release='v0.18.0-rc.5',pack_channel='0.18-rc.4',report=root/'report.json')
 seen=[]
 def smoke(url,*args,**kwargs):
  seen.append(url);kwargs['report_path'].write_text(json.dumps({'appVersion':'0.17.6' if url=='https://stable.example' else '0.18.0-rc.5'}))
 with patch.object(pages,'github_release_assets',return_value=(root/'public.zip',root/'SHA256SUMS',sha)),patch.object(pages,'prepare'),patch.object(pages,'private_wrapper',return_value=b'private'),patch.object(pages,'smoke',side_effect=smoke):
  result=pages.verify_existing_preview(ReadOnlyPages(),args,{},'https://stable.example','stable')
  assert result['productionUnchanged'] and not result['uploaded'] and result['status']=='preview-verified'
  assert seen==['https://stable.example','https://preview.example','https://stable.example']
  with patch.object(pages,'github_release_assets',return_value=(root/'public.zip',root/'SHA256SUMS','b'*40)):
   try:pages.verify_existing_preview(ReadOnlyPages(),args,{},'https://stable.example','stable')
   except ValueError as error:assert 'commit' in str(error)
   else:raise AssertionError('Wrong release must be rejected')
`],{cwd:root,stdio:'pipe'});
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


async function serveBuiltPreviewUpgrade(oldRoot,newRoot,{hold=relative=>relative.startsWith('installed-packs.')}={}){
 const http=require('node:http'),requests=[];let deployed=false,pendingBody,seenHeld;const held=new Promise(resolve=>seenHeld=resolve);
 const server=http.createServer((req,res)=>{
  const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',base=deployed?newRoot:oldRoot,file=path.resolve(base,relative);requests.push({relative,deployed});
  if(!file.startsWith(base+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
  const body=fs.readFileSync(file);res.writeHead(200,{'Content-Type':({'.js':'text/javascript','.css':'text/css','.html':'text/html','.webmanifest':'application/manifest+json','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm'})[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  if(deployed&&hold(relative)&&!pendingBody){res.write(body.subarray(0,16));pendingBody={res,body:body.subarray(16)};seenHeld();return;}res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {server,held,requests,url:'http://127.0.0.1:'+server.address().port+'/',get pendingBody(){return pendingBody;},set deployed(value){deployed=value;}};
}

test('legacy preview upgrade survives its old request timeout and preserves local data',{timeout:60000,skip:!process.env.PLAYROOM_LEGACY_PWA},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),oldRoot=path.resolve(process.env.PLAYROOM_LEGACY_PWA),newRoot=path.resolve(process.env.PLAYROOM_NEW_PWA),fixture=await serveBuiltPreviewUpgrade(oldRoot,newRoot),{server,held}=fixture;
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const context=await browser.newContext(),page=await context.newPage();await context.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'legacy-update',name:'Тест',createdAt:1,updatedAt:1})));await page.goto(fixture.url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);assert.equal(await page.evaluate(()=>PlayroomAppVersion),'0.20.0-preview.13');await page.evaluate(()=>localStorage.setItem('legacy-update-data','keep'));
  fixture.deployed=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('.updates-modal [data-command=update-app]').waitFor();await page.locator('[data-command=update-app]').click();await held;
  await page.waitForFunction(()=>document.querySelector('[data-update-status]')?.textContent.includes(PlayroomMessages.text('ui.pwa.16263196d581')));assert.equal(await page.evaluate(()=>PlayroomAppVersion),'0.20.0-preview.13');fixture.pendingBody.res.end(fixture.pendingBody.body);
  await page.waitForFunction(()=>globalThis.PlayroomAppVersion==='0.20.0-preview.14');assert.equal(await page.evaluate(()=>localStorage.getItem('legacy-update-data')),'keep');assert.equal(await page.evaluate(()=>PlayroomAppBridge.profile().id),'legacy-update');
 }finally{await browser.close();fixture.pendingBody?.res.destroy();await new Promise(resolve=>server.close(resolve));}
});


test('same-version built PWA upgrade retries an interrupted changed asset and preserves a real saved game',{timeout:90000,skip:!process.env.PLAYROOM_OLD_PWA||!process.env.PLAYROOM_NEW_PWA},async()=>{
 const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),oldRoot=path.resolve(process.env.PLAYROOM_OLD_PWA),newRoot=path.resolve(process.env.PLAYROOM_NEW_PWA),out=path.resolve(process.env.PLAYROOM_CAPTURE_DIR||'../tmp_files/ux-021/same-version-upgrade');fs.mkdirSync(out,{recursive:true});
 const cacheOf=folder=>fs.readFileSync(path.join(folder,'sw.js'),'utf8').match(/const CACHE='([^']+)'/)[1],oldCache=cacheOf(oldRoot),newCache=cacheOf(newRoot),styleOf=folder=>fs.readFileSync(path.join(folder,'index.html'),'utf8').match(/app\/design-system\.[a-f0-9]+\.css/)[0],oldStyle=styleOf(oldRoot),newStyle=styleOf(newRoot),newScript=fs.readFileSync(path.join(newRoot,'index.html'),'utf8').match(/app\/app\.[a-f0-9]+\.js/)[0];assert.notEqual(oldCache,newCache);assert.notEqual(oldStyle,newStyle);
 const fixture=await serveBuiltPreviewUpgrade(oldRoot,newRoot,{hold:relative=>relative===newScript}),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),report={oldCache,newCache,oldStyle,newStyle,checks:[],errors:[]};
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),sync=require('./account-sync-fixture.cjs'),network=await sync.installFetch(context,sync(r=>r.fulfill({status:200,json:{}}))),page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>report.errors.push(e.message));
  await context.addInitScript(()=>{if(!localStorage.getItem('playroom.player-profile.v1'))localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'same-version-upgrade',name:'Тест',createdAt:1,updatedAt:1}));});await page.goto(fixture.url);await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&globalThis.PlayroomInstalledPacks?.length===15);assert.equal(await page.locator('link[href="'+oldStyle+'"]').count(),1);
  const saved=await page.evaluate(async()=>{const b=PlayroomAppBridge,session=new TabletopSession(TabletopCore,'tictactoe',{seed:17,mode:'pass',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Первый'},{name:'Второй'}]});session.act(0,TabletopCore.legalActions(session.current,0)[0]);await b.saveLibrary.activateAsync(session,'upgrade-local-game');localStorage.setItem('same-version-marker','keep');return {version:PlayroomAppVersion,game:b.saveLibrary.open('upgrade-local-game').export(),profile:b.profile().id,settings:localStorage.getItem('playroom.settings.v1')};});report.version=saved.version;report.checks.push('old real build controls the loaded document and saves a committed one-move game');
  fixture.deployed=true;assert.equal((await page.evaluate(()=>PlayroomPWA.checkForUpdate())).available,true);await page.waitForFunction(cache=>PlayroomPWA.updateInfo?.cache===cache,newCache);
  if(!await page.locator('.updates-modal').count()){await page.locator('[data-hub-page=profile]').click();await page.locator('#hub-profile-page [data-command=show-updates]').click();}await page.locator('[data-command=download-app]').waitFor();assert.equal(fixture.requests.filter(r=>r.deployed&&r.relative===newScript).length,0,'availability does not fetch application payload');
  await page.locator('[data-command=download-app]').click();await fixture.held;fixture.pendingBody.res.destroy();await page.waitForFunction(()=>PlayroomPWA.updateInfo?.download.phase==='paused');assert.equal(await page.locator('link[href="'+oldStyle+'"]').count(),1,'failed preparation leaves the installed document intact');assert.equal(await page.evaluate(()=>PlayroomAppVersion),saved.version);await page.screenshot({path:path.join(out,'interrupted.png'),animations:'disabled'});report.checks.push('actual HTTP stream interruption pauses preparation without activating the candidate');
  await page.locator('[data-command=download-app]').click();await page.waitForFunction(()=>PlayroomPWA.updateInfo?.download.phase==='ready');const delta=await page.evaluate(()=>PlayroomPWA.updateInfo.download);assert(delta.reusedFiles>5);assert(delta.total<delta.totalSize/2);assert.equal(fixture.requests.filter(r=>r.deployed&&r.relative.startsWith('installed-packs.')).length,0,'unchanged packs are reused without retransmission');assert.equal(await page.locator('link[href="'+oldStyle+'"]').count(),1,'ready does not apply automatically');report.delta=delta;report.checks.push('retry reuses unchanged assets and packs; readiness is separate from activation');
  let documents=0;page.on('domcontentloaded',()=>documents++);await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('[data-command=update-app]').click()]);await page.waitForFunction(()=>!!navigator.serviceWorker.controller&&globalThis.PlayroomInstalledPacks?.length===15);assert.equal(await page.locator('link[href="'+newStyle+'"]').count(),1,'exact new build stylesheet is loaded after activation');assert.equal(documents,1);assert.equal(await page.locator('.updates-modal').count(),0);
  const after=await page.evaluate(()=>({version:PlayroomAppVersion,game:PlayroomAppBridge.saveLibrary.open('upgrade-local-game').export(),profile:PlayroomAppBridge.profile().id,settings:localStorage.getItem('playroom.settings.v1'),marker:localStorage.getItem('same-version-marker')}));assert.deepEqual(after,{...saved,marker:'keep'});const keys=await page.evaluate(()=>caches.keys());assert(keys.includes(newCache));assert(!keys.includes(oldCache));report.checks.push('one document reload, same version, exact new assets, old shell retired; actual game/profile/settings preserved');
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge&&globalThis.PlayroomInstalledPacks?.length===15);assert.equal(await page.locator('link[href="'+newStyle+'"]').count(),1);assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.open('upgrade-local-game').export()),saved.game);assert.equal(await page.evaluate(()=>localStorage.getItem('same-version-marker')),'keep');await page.screenshot({path:path.join(out,'offline-new-build.png'),animations:'disabled'});report.checks.push('offline reload still starts all15games and opens the preserved save');assert.deepEqual(report.errors,[]);assert.equal(network.nativeSupabaseRequests,0);report.nativeSupabaseRequests=network.nativeSupabaseRequests;report.scope='real exact previous/current PWA artifacts, local HTTP/service worker/CacheStorage, interrupted asset fetch and retry; Chromium emulation, not physical installed PWA or external network';
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
 try{const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage();await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));await context.addInitScript(()=>{if(!localStorage.getItem('playroom.player-profile.v1'))localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'post-update-test',name:'Игрок',createdAt:1,updatedAt:1}))});await page.goto(fixture.url);await page.waitForFunction(()=>navigator.serviceWorker.controller&&globalThis.PlayroomAppBridge);const before=await page.evaluate(async()=>{localStorage.setItem('post-update-marker','keep');const session=new TabletopSession(TabletopCore,'tictactoe',{seed:17,players:[{name:'A'},{name:'B'}]});await PlayroomAppBridge.saveLibrary.activateAsync(session,'post-update-save');return JSON.stringify(session.export())});fixture.deployed=true;await page.evaluate(()=>PlayroomPWA.checkForUpdate());await page.waitForFunction(()=>!!PlayroomPWA.updateInfo);await page.evaluate(()=>PlayroomAppBridge.showImportantUpdate({title:'Обновление'}));await page.locator('[data-command=download-app]').click();await page.waitForFunction(()=>PlayroomPWA.updateInfo.download.phase==='ready');await Promise.all([page.waitForEvent('domcontentloaded'),page.locator('[data-command=update-app]').click()]);await page.locator('.post-update-modal [data-installed-changes]').waitFor();assert((await page.locator('[data-installed-changes]').innerText()).includes(JSON.parse(fs.readFileSync(path.join(root,'updates.json'),'utf8')).releases[0].changes[0]));assert(await page.locator('[data-updated-pack-cards] .post-update-pack').count()>0);await page.waitForFunction(()=>!document.querySelector('[data-cleanup-description]').textContent.includes('Проверяем'));assert.equal(await page.evaluate(()=>localStorage.getItem('post-update-marker')),'keep');assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.saveLibrary.open('post-update-save').export())),before);await page.locator('[data-post-update-done]').click();await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.locator('.post-update-modal').count(),0);await context.setOffline(true);await page.reload();await page.locator('.game-tile').first().waitFor();assert.equal(await page.evaluate(()=>localStorage.getItem('post-update-marker')),'keep');assert.equal(await page.evaluate(()=>sessionStorage.getItem('playroom.after-update.v1')),null);
 }finally{await browser.close();await new Promise(resolve=>fixture.server.close(resolve));}
});
