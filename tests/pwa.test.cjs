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
  assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');
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
  for(const file of ['core/messages.js','app/pairing.js','app/acoustic-pairing.js','app/vendor/ggwave.js','application/pwa-update-coordinator.js','app/pwa.js','app/qr.js','app/vendor/qrcode.js','app/vendor/LICENSE.qrcode','app/vendor/jsqr.js','app/qr-scanner.js','application/history-sync-service.js','application/host-session-service.js','app/pairing-presenter.js','app/network-ui.js','platform/web/session-store.js','app/network-client-history.js','application/history-controller.js','application/game-screen-controller.js','platform/web/dom.js','app/game-screen.js','app/game-feedback.js','app/game-interactions.css','core/player-target.js','core/game-flow.js','core/hand-overflow.js','manifest.webmanifest'])assert.ok(source.includes(file),file);
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
  const ui=['application/history-sync-service.js','application/host-session-service.js','app/pairing-presenter.js','app/network-ui.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n');
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
 const bundle={manifest:{id:'uno',version:'0.4.9',stateVersion:1,engineApi:3,viewApi:2}};
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

test('incomplete or login-page shell never installs; verified update waits for existing clients',async()=>{
 const vm=require('node:vm'),crypto=require('node:crypto');
 const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 for(const failure of ['missing','login','corrupt',null]){
  const listeners={},writes=[],messages=[];let waits;
  const body='public javascript',hash=crypto.createHash('sha256').update(body).digest('hex');
  const self={location:{href:'https://example.test/sw.js',origin:'https://example.test'},addEventListener:(type,fn)=>listeners[type]=fn,clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]},skipWaiting:()=>{throw Error('must not replace active room');}};
  const sandbox={self,URL,Response,Uint8Array,crypto:crypto.webcrypto,fetch:async path=>new Response(path==='./app/app.js'&&failure==='corrupt'?'wrong version':body,{status:path==='./app/app.js'&&failure==='missing'?503:200,headers:{'content-type':path==='./app/app.js'&&failure==='login'?'text/html':'text/javascript'}}),caches:{open:async()=>({put:async path=>writes.push(path)})}};
  vm.runInNewContext(source.replace('const INTEGRITY=null;',`const INTEGRITY=${JSON.stringify({'./app/app.js':hash})};`),sandbox);
  listeners.install({waitUntil:p=>waits=p});
  if(failure){await assert.rejects(waits,/Incomplete/);assert.equal(writes.length,0);assert.equal(messages.length,0);}
  else{await waits;assert(writes.includes('./app/app.js'));assert.equal(messages[0].kind,'playroom-update-ready');assert.equal(messages[0].version,require('../package.json').version);}
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
 assert "'./"+ref+"'" in worker
 assert './'+ref in json.loads(re.search(r'const INTEGRITY=(.*?);',worker).group(1))
# Every precached URL exists; integrity covers only shipped assets.
core=json.loads('['+re.search(r'const CORE=\\[(.*?)\\];',worker,re.S).group(1).replace("'",'"')+']')
assert all(ref=='./' or ref[2:] in items for ref in core)
assert all(ref[2:] in items for ref in json.loads(re.search(r'const INTEGRITY=(.*?);',worker).group(1)))
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
with patch.object(build,'installed_script',return_value=json.dumps([{'id':n} for n in ['uno','domino','durak','checkers','snakes','tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid']])):
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

test('PWA update isolates a waiting build, drops old caches and starts offline with saved data', {timeout:60000}, async()=>{
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
 snapshots.append({name:base64.b64encode(content).decode() for name,content in items.items()})
print(json.dumps(snapshots))`],{cwd:root,maxBuffer:20*1024*1024}));
 let deployed=0;
 const server=http.createServer((req,res)=>{
  if(new URL(req.url,'http://localhost').pathname==='/index.html'){res.writeHead(308,{location:'/'});res.end();return;}
  const name=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',data=snapshots[deployed][name];
  res.writeHead(data?200:404,{'content-type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream','cache-control':'no-store'});
  res.end(data?Buffer.from(data,'base64'):'missing');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext(),url=`http://127.0.0.1:${server.address().port}/`;
  let page=await context.newPage();await page.goto(url);
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  const originalWorker=context.serviceWorkers()[0],second=await context.newPage();await second.goto(url);
  await second.waitForFunction(()=>navigator.serviceWorker.controller);
  await second.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>false));
  await page.evaluate(async()=>{
   localStorage.setItem('saved-game-marker','keep');
   await (await caches.open('unrelated-app')).put('./marker',new Response('keep'));
   await new Promise((resolve,reject)=>{const r=indexedDB.open('saved-game-marker',1);r.onupgradeneeded=()=>r.result.createObjectStore('games');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('games','readwrite');t.objectStore('games').put('keep',1);t.oncomplete=()=>{db.close();resolve();};};});
  });
  deployed=1;
  const newWorkerPromise=context.waitForEvent('serviceworker');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous');
  const newWorker=await newWorkerPromise;assert.notEqual(newWorker,originalWorker);
  await page.waitForSelector('#update-banner:not([hidden])');
  await page.locator('#update-now').click();
  await page.waitForFunction(()=>document.querySelector('#update-detail')?.textContent.includes('Закройте другие окна'));
  assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),true);
  await second.evaluate(()=>PlayroomPWA.setUpdateGuard(()=>true));
  await page.locator('#update-now').click();
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await second.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await context.setOffline(true);await page.reload();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'current');
  assert.equal(await page.evaluate(()=>localStorage.getItem('saved-game-marker')),'keep');
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('saved-game-marker');r.onsuccess=()=>{const db=r.result,q=db.transaction('games').objectStore('games').get(1);q.onsuccess=()=>{db.close();resolve(q.result);};};})),'keep');
  const keys=await page.evaluate(()=>caches.keys());
  assert.equal(keys.includes('playroom-pwa-v0.15.0'),false);assert.ok(keys.includes('unrelated-app'));
  assert.equal(keys.filter(key=>key.startsWith('playroom-pwa-')).length,1);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});

test('local Pages production deploy uploads once without GitHub and rolls back on failed smoke',()=>{
 const code=String.raw`
import importlib.util, os, tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('pages', 'scripts/pages-deploy.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
old='11111111-1111-1111-1111-111111111111';new='22222222-2222-2222-2222-222222222222';sha='a'*40
class Pages:
 def __init__(self):self.project='existing';self.current=old;self.uploads=[];self.rollbacks=[]
 def api(self,*args,**kwargs):
  if kwargs.get('suffix')=='/deployments':return [{'id':new,'environment':'production','created_on':'1','url':'https://new.example','deployment_trigger':{'metadata':{'branch':'production','commit_hash':sha}}}]
  return {'production_branch':'production','subdomain':'existing.pages.dev','canonical_deployment':{'id':self.current}}
 def production_target(self,value):return {'id':value,'url':'https://old.example'}
 def manual_uploads(self,project):pass
 def rollback(self,value):self.rollbacks.append(value);self.current=value
for fail in (False,True):
 pages=Pages()
 def command(cmd,**kwargs):
  assert cmd[0]!='gh'
  if cmd[0]=='npx':pages.uploads.append(cmd[cmd.index('--branch')+1]);pages.current=new
 def prepare(public,sums,wrapper,destination,catalog_channel=""):destination.mkdir();return {'sha256':'b'*64}
 def smoke(url,*args,**kwargs):
  if fail and url=='https://new.example':raise ValueError('smoke failed')
 args=SimpleNamespace(operation='deploy',release='v0.16.0-rc.4',deployment=None,public=Path('playroom-pwa.zip'),checksums=Path('SHA256SUMS'),protected_base=Path('protected.zip'),commit=sha)
 with patch.dict(os.environ,{'PAGES_SMOKE_PASSWORD':'test','CLOUDFLARE_PRODUCTION_BRANCH':'production','CLOUDFLARE_PAGES_ORIGIN':'https://existing.pages.dev'}),patch.object(m,'Pages',lambda:pages),patch.object(m,'prepare',prepare),patch.object(m,'private_wrapper',lambda args:b'private'),patch.object(m,'smoke',smoke),patch.object(m.subprocess,'run',command):
  try:report=m.run(args)
  except ValueError:
   assert fail and pages.rollbacks==[old]
  else:assert not fail and report['status']=='published' and not pages.rollbacks
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
 def __init__(self):self.project='existing';self.uploads=[];self.patches=[]
 def api(self,method='GET',suffix='',payload=None):
  if method=='PATCH':self.patches.append(payload)
  if suffix=='/deployments':return [{'id':new,'environment':'preview','created_on':'1','url':'https://preview.example','deployment_trigger':{'metadata':{'branch':self.uploads[-1],'commit_hash':sha}}}]
  return {'production_branch':'production','subdomain':'existing.pages.dev','canonical_deployment':{'id':old},'deployment_configs':{'production':{'r2_buckets':{'PLAYROOM_PACKS':{'name':'existing-packs'}}},'preview':{'env_vars':{'KEEP':{'value':'value'}}}}}
 def production_target(self,value):return {'id':value,'url':'https://existing.pages.dev'}
 def manual_uploads(self,project):pass
for tamper in (False,True):
 pages=Pages();stable_reads=[]
 def prepare(public,sums,wrapper,destination,catalog_channel=''):
  assert catalog_channel=='0.18-rc.1';destination.mkdir();return {'sha256':'b'*64}
 def command(cmd,**kwargs):
  if cmd[0]=='node':return # Wrapper byte validation has independent real tests.
  assert cmd[0]=='npx';branch=cmd[cmd.index('--branch')+1];assert branch.startswith('verify-');pages.uploads.append(branch)
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
  assert pages.patches[0]['deployment_configs']['preview']['env_vars']['KEEP']['value']=='value'
`;
 execFileSync('python3',['-c',code],{cwd:root,stdio:'pipe'});
});
