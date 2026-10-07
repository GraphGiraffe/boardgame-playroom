'use strict';
const CACHE='playroom-pwa-v0.15.0-preview.2';
const QR_LIB='https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/qrcode.js';
const CORE=[
  './','./index.html','./manifest.webmanifest','./icons/playroom.svg','./installed-packs.js',
  './app/styles.css','./app/saved-games.css','./app/pack-manager.css','./app/lobby.css','./app/shared-views.css',
  './core/ui.css','./core/input.css','./core/motion.css','./core/tooltips.css',
  './core/engine.js','./core/audio.js','./core/session.js','./core/protocol.js','./core/authority.js','./core/ui.js','./core/packs.js','./core/input.js','./core/motion.js','./core/tooltips.js',
  './app/views.js','./app/pack-manager.js','./app/library.js','./app/multiplayer.js','./app/pairing.js','./app/pwa.js','./app/qr.js','./app/session-client.js','./app/shared-views.js','./app/network-ui.js','./app/app.js',
  './app/transports/webrtc.js','./app/transports/local.js',QR_LIB
];
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.allSettled(CORE.map(async url=>{const response=await fetch(url,{cache:'reload'});if(response.ok)await cache.put(url,response);}));await self.skipWaiting();})());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE&&key.startsWith('playroom-pwa-'))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.href===QR_LIB){
    event.respondWith((async()=>{const cached=await caches.match(QR_LIB);if(cached)return cached;try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);cache.put(QR_LIB,response.clone());}return response;}catch(_){return Response.error();}})());
    return;
  }
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);cache.put('./index.html',response.clone());}return response;}catch(_){return await caches.match('./index.html')||await caches.match('./');}})());
    return;
  }
  event.respondWith((async()=>{const cached=await caches.match(event.request,{ignoreSearch:true});if(cached)return cached;try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);cache.put(event.request,response.clone());}return response;}catch(_){return Response.error();}})());
});
