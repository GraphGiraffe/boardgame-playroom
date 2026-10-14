'use strict';
// API 2 shell cache: replace UI assets without deleting authoritative
// IndexedDB journals or client history. Published RC9 remains immutable.
const CACHE='playroom-pwa-v0.17.4';
const INTEGRITY=null; // Replaced by the PWA builder with public asset hashes.
const CORE=[
  './','./index.html','./manifest.webmanifest','./icons/playroom.svg','./icons/icon-192.png','./icons/icon-512.png','./installed-packs.js',
  './app/styles.css','./app/design-system.css','./app/game-interactions.css','./app/saved-games.css','./app/pack-manager.css','./app/lobby.css','./app/shared-views.css',
  './core/ui.css','./core/input.css','./core/motion.css','./core/tooltips.css',
  './core/engine.js','./core/game-flow.js','./core/hand-overflow.js','./core/audio.js','./core/session.js','./core/protocol.js','./core/authority.js','./core/ui.js','./core/player-target.js','./core/tag-registry.js','./core/tags.js','./core/packs.js','./core/input.js','./core/motion.js','./core/tooltips.js',
  './app/version.js','./app/views.js','./app/remote-catalog.js','./app/pack-manager.js','./app/library.js','./app/multiplayer.js','./app/network-session-store.js','./app/network-client-history.js','./app/pairing.js','./app/acoustic-pairing.js' ,'./app/vendor/ggwave.js','./app/pwa.js','./app/qr.js','./app/vendor/qrcode.js','./app/vendor/LICENSE.qrcode','./app/vendor/jsqr.js','./app/vendor/LICENSE.jsqr','./app/qr-scanner.js','./app/session-client.js','./app/game-screen.js','./app/lobby-view.js','./app/game-feedback.js','./app/shared-views.js','./app/network-ui.js','./app/app.js',
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

async function validAsset(path,response){
  if(!response.ok||response.redirected)return false;
  const type=response.headers.get('content-type')||'';
  if(/\.(js|css)$/.test(path)&&type.includes('text/html'))return false;
  if(INTEGRITY?.[path]){
    const hash=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
    return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('')===INTEGRITY[path];
  }
  return true;
}
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    // Fetch and verify the complete shell before writing or activating it.
    const entries=await Promise.all(CORE.filter(path=>path!=='./').map(async path=>{
      // Pages canonicalizes index.html to /; fetch the document without a redirect
      // but retain its build hash and offline cache key.
      const response=await fetch(path==='./index.html'?'./':path,{cache:'reload'});
      if(!await validAsset(path,response))throw Error('Incomplete application update: '+path);
      return [path,response];
    }));
    const cache=await caches.open(CACHE);
    await Promise.all(entries.map(([path,response])=>cache.put(path,response)));
    // A waiting update never replaces an in-use shell or interrupts a room.
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({kind:'playroom-update-ready',version:CACHE.slice('playroom-pwa-v'.length).replace(/-[a-f0-9]{16}$/,'')});
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.kind!=='playroom-activate-update')return;
  event.waitUntil((async()=>{
    const reply=result=>event.ports?.[0]?.postMessage(result);
    const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const checks=await Promise.all(clients.map(client=>new Promise(resolve=>{
      const channel=new MessageChannel();let done=false;
      const finish=ok=>{if(done)return;done=true;clearTimeout(timer);channel.port1.close();resolve(ok);};
      const timer=setTimeout(()=>finish(false),3000);
      channel.port1.onmessage=message=>finish(message.data?.kind==='playroom-update-idle');
      client.postMessage({kind:'playroom-update-check'},[channel.port2]);
    })));
    const current=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    if(checks.some(ok=>!ok)||current.some(client=>!clients.some(checked=>checked.id===client.id))){
      for(const client of current)client.postMessage({kind:'playroom-update-release'});
      reply({ok:false,reason:'Закройте другие окна ХОД или завершите в них игру и повторите обновление.'});return;
    }
    reply({ok:true});await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key!==CACHE&&key.startsWith('playroom-pwa-'))await caches.delete(key);await self.clients.claim();})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  if(url.pathname.startsWith('/api/packs/'))return;
  if(event.request.mode==='navigate'){
    const pairToken=pairingTokenFromUrl(event.request.url);
    event.respondWith((async()=>{
      if(pairToken&&await handoffPairing(pairToken)){
        return new Response('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ХОД</title><body style="font-family:system-ui;padding:2rem">Приглашение передано в открытый ХОД. Это окно можно закрыть.</body>',{headers:{'Content-Type':'text/html; charset=utf-8'}});
      }
      try{const response=await fetch(event.request);if(await validAsset('./index.html',response)){const cache=await caches.open(CACHE);await cache.put('./index.html',response.clone());return response;}
        if(response.redirected||!response.ok)return response;
        return await (await caches.open(CACHE)).match('./index.html')||response;}
      catch(_){return await (await caches.open(CACHE)).match('./index.html')||Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{const cache=await caches.open(CACHE),cached=await cache.match(event.request);if(cached)return cached;try{const response=await fetch(event.request);if(await validAsset('./'+url.pathname.slice(new URL('./',self.location.href).pathname.length),response)){await cache.put(event.request,response.clone());return response;}return Response.error();}catch(_){return Response.error();}})());
});
