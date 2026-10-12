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
  for(const file of ['app/pairing.js','app/acoustic-pairing.js','app/vendor/ggwave.js','app/pwa.js','app/qr.js','app/vendor/qrcode.js','app/vendor/LICENSE.qrcode','app/vendor/jsqr.js','app/qr-scanner.js','app/network-ui.js','app/network-session-store.js','app/network-client-history.js','app/game-screen.js','app/game-feedback.js','app/game-interactions.css','core/player-target.js','core/game-flow.js','core/hand-overflow.js','manifest.webmanifest'])assert.ok(source.includes(file),file);
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
  assert.match(source,/src="app\/network-session-store\.js"/);
  assert.match(source,/src="app\/network-client-history\.js"/);
  assert.match(source,/src="core\/game-flow\.js"/);
  assert.match(source,/src="core\/hand-overflow\.js"/);
  assert.match(source,/src="core\/player-target\.js"/);
  assert.match(source,/src="app\/game-feedback\.js"/);
});

test('offline pairing UI provides speaker-only mode and explains blocked microphone',()=>{
  const ui=fs.readFileSync(path.join(root,'app/network-ui.js'),'utf8');
  const acoustic=fs.readFileSync(path.join(root,'app/acoustic-pairing.js'),'utf8');
  assert.match(ui,/id="net-host-acoustic-send"/,'speaker-only invitation must be offered');
  assert.match(ui,/async function sendHostSoundOnly\(signal\)/);
  assert.match(ui,/await Acoustic\.play\(message,\{protocol,signal\}\)/);
  assert.match(ui,/captureDisabled\(\)/,'capture buttons are disabled for unsupported origins');
  assert.match(ui,/captureNotice\(\)/,'show an actionable microphone warning');
  assert.match(ui,/id="net-client-acoustic-listen"/);
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
  for n in ['_worker.js','_routes.json','manifest.webmanifest']: z.writestr(n,'private-'+n)
 m.package(p/'public.zip',p/'private.zip',p/'out.zip')
 with ZipFile(p/'out.zip') as z:
  assert 'index.html' in z.namelist()
  assert not any(n.startswith('playroom-pwa/') for n in z.namelist())
  assert z.read('_worker.js')==b'private-_worker.js'
  assert z.read('manifest.webmanifest')==b'private-manifest.webmanifest'
`;
 execFileSync('python3',['-c',code],{cwd:root,stdio:'pipe'});
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
with patch.object(build,'installed_script',return_value=json.dumps([{'id':n} for n in ['uno','domino','durak','checkers','snakes']])):
 items=dict(build.pwa_runtime_items())
private={'_worker.js':'private test worker', '_routes.json':json.dumps({'version':1,'include':['/*'],'exclude':['/icons/*']}), 'manifest.webmanifest':'{}'}
with tempfile.TemporaryDirectory() as directory:
 root=Path(directory);public=root/'playroom-pwa.zip';sums=root/'SHA256SUMS'
 def package(files):
  public.write_bytes(archive({'pwa/'+k:v for k,v in files.items()}))
  sums.write_text(hashlib.sha256(public.read_bytes()).hexdigest()+'  playroom-pwa.zip\\n')
 package(items)
 result=pages.prepare(public,sums,archive(private),root/'valid')
 assert result['files']==len(items)+2
 assert (root/'valid/_worker.js').read_text()==private['_worker.js']
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
  const originalWorker=context.serviceWorkers()[0];
  await page.evaluate(async()=>{
   localStorage.setItem('saved-game-marker','keep');
   await (await caches.open('unrelated-app')).put('./marker',new Response('keep'));
   await new Promise((resolve,reject)=>{const r=indexedDB.open('saved-game-marker',1);r.onupgradeneeded=()=>r.result.createObjectStore('games');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('games','readwrite');t.objectStore('games').put('keep',1);t.oncomplete=()=>{db.close();resolve();};};});
  });
  deployed=1;
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'previous');
  const newWorker=context.serviceWorkers().find(worker=>worker!==originalWorker);assert.ok(newWorker);
  await newWorker.evaluate(()=>{self.testActivation=new Promise(resolve=>self.addEventListener('activate',()=>resolve()));});
  const activated=newWorker.evaluate(()=>self.testActivation);
  await page.close();await activated;
  page=await context.newPage();await page.goto(url);
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')==='current');
  await context.setOffline(true);await page.reload();
  assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--build-check')),'current');
  assert.equal(await page.evaluate(()=>localStorage.getItem('saved-game-marker')),'keep');
  assert.equal(await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('saved-game-marker');r.onsuccess=()=>{const db=r.result,q=db.transaction('games').objectStore('games').get(1);q.onsuccess=()=>{db.close();resolve(q.result);};};})),'keep');
  const keys=await page.evaluate(()=>caches.keys());
  assert.equal(keys.includes('playroom-pwa-v0.15.0'),false);assert.ok(keys.includes('unrelated-app'));
  assert.equal(keys.filter(key=>key.startsWith('playroom-pwa-')).length,1);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
});
