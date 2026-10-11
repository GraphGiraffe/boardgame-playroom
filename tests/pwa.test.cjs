'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');

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
  assert.match(source,/caches\.match\('\.\/index\.html'\)/);
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
