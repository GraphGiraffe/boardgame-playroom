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
  for(const file of ['app/pairing.js','app/pwa.js','app/qr.js','app/network-ui.js','manifest.webmanifest'])assert.ok(source.includes(file),file);
  assert.match(source,/request\.mode==='navigate'/);
  assert.match(source,/caches\.match\('\.\/index\.html'\)/);
  assert.match(source,/qrcode-generator@2\.0\.4\/dist\/qrcode\.js/);
  assert.match(source,/playroom-pair-token/);
  assert.match(source,/clients\.matchAll/);
});
