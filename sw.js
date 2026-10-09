'use strict';
// Unreleased LAN-01 candidate: invalidate cached code after host-journal and
// recovery changes. Immutable published RC6 assets are not modified.
const CACHE='playroom-pwa-network-ux-dev.1';
const CORE=[
  './','./index.html','./manifest.webmanifest','./icons/playroom.svg','./icons/icon-192.png','./icons/icon-512.png','./installed-packs.js',
  './app/styles.css','./app/game-interactions.css','./app/saved-games.css','./app/pack-manager.css','./app/lobby.css','./app/shared-views.css',
  './core/ui.css','./core/input.css','./core/motion.css','./core/tooltips.css',
  './core/engine.js','./core/game-flow.js','./core/hand-overflow.js','./core/audio.js','./core/session.js','./core/protocol.js','./core/authority.js','./core/ui.js','./core/player-target.js','./core/packs.js','./core/input.js','./core/motion.js','./core/tooltips.js',
  './app/views.js','./app/pack-manager.js','./app/library.js','./app/multiplayer.js','./app/network-session-store.js','./app/network-client-history.js','./app/pairing.js','./app/acoustic-pairing.js' ,'./app/vendor/ggwave.js','./app/pwa.js','./app/qr.js','./app/vendor/qrcode.js','./app/vendor/LICENSE.qrcode','./app/vendor/jsqr.js','./app/vendor/LICENSE.jsqr','./app/qr-scanner.js','./app/session-client.js','./app/game-screen.js','./app/game-feedback.js','./app/shared-views.js','./app/network-ui.js','./app/app.js',
  './app/transports/webrtc.js','./app/transports/local.js'
];

function pairingTokenFromUrl(href){
  let url;try{url=new URL(href,self.location.href);}catch(_){return null;}
  const values=[url.searchParams.get('pair'),url.searchParams.get('protocol'),url.searchParams.get('text'),url.searchParams.get('url')];
  for(const raw of values){
    if(!raw)continue;let value=raw;try{value=decodeURIComponent(raw);}catch(_){}
    const match=String(value).match(/(?:PLAYROOM_PAIR:|web\+playroom:pair\/)?((?:PR2|PR3)\.[A-Za-z0-9_-]+)/);
    if(match)return match[1];
  }
  return null;
}
async function handoffPairing(token){
  const list=await self.clients.matchAll({type:'window',includeUncontrolled:false});
  if(!list.length)return false;
  for(const client of list)client.postMessage({kind:'playroom-pair-token',token});
  try{await list[0].focus();}catch(_){}
  return true;
}

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{const cache=await caches.open(CACHE);await Promise.allSettled(CORE.map(async url=>{const response=await fetch(url,{cache:'reload'});if(response.ok)await cache.put(url,response);}));await self.skipWaiting();})());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE&&key.startsWith('playroom-pwa-'))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    const pairToken=pairingTokenFromUrl(event.request.url);
    event.respondWith((async()=>{
      if(pairToken&&await handoffPairing(pairToken)){
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ХОД</title><body style="font-family:system-ui;padding:2rem">Приглашение передано в открытый ХОД. Это окно можно закрыть.</body>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
      try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);cache.put('./index.html',response.clone());}return response;}
      catch(_){return await caches.match('./index.html')||await caches.match('./');}
    })());
    return;
  }
  event.respondWith((async()=>{const cached=await caches.match(event.request,{ignoreSearch:true});if(cached)return cached;try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);cache.put(event.request,response.clone());}return response;}catch(_){return Response.error();}})());
});
