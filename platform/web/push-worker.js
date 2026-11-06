/* Imported by the app worker. State is scoped to this app, never to the whole origin. */
(function(){
 'use strict';
 const scope=new URL('./',self.location.href),uuid=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
 function valid(p){return p?.v===1&&uuid.test(p.recipient||'')&&['dm','group','room','update'].includes(p.type)&&uuid.test(p.id||'')&&typeof p.event==='string'&&p.event.length<=100;}
 function storage(fn){return new Promise((resolve,reject)=>{const request=indexedDB.open('playroom-push:'+scope.pathname,1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result,tx=db.transaction('state','readwrite'),store=tx.objectStore('state');let value;tx.oncomplete=()=>{db.close();resolve(value);};tx.onerror=()=>{db.close();reject(tx.error);};fn(store,v=>{value=v;});};});}
 const get=key=>storage((s,done)=>{s.get(key).onsuccess=e=>done(e.target.result);});
 const put=(key,value)=>storage(s=>s.put(value,key));
 // Keep binding/read receipts and deliveries in one order: separate IDB transactions
 // otherwise allow a late delivery to overwrite a receipt or survive logout.
 let stateFlight=Promise.resolve();
 const serial=fn=>stateFlight=stateFlight.catch(()=>{}).then(fn);
 async function clients(){return (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(c=>{const u=new URL(c.url);return u.origin===scope.origin&&u.pathname.startsWith(scope.pathname);});}
 function ask(client,payload){return new Promise(resolve=>{const channel=new MessageChannel();let finished=false;const end=value=>{if(finished)return;finished=true;clearTimeout(timer);channel.port1.close();resolve(value);};const timer=setTimeout(()=>end(false),500);channel.port1.onmessage=e=>end(e.data?.handled===true);try{client.postMessage({kind:'playroom-push-visible',payload},[channel.port2]);}catch{end(false);}});}
 self.addEventListener('message',event=>{
  if(!['playroom-push-state','playroom-push-bind','playroom-push-pending','playroom-push-consumed','playroom-push-room-read'].includes(event.data?.kind))return;
  const source=event.source;let url;try{url=new URL(source.url);}catch{return;}
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.waitUntil(serial(async()=>{try{
   if(event.data.kind==='playroom-push-state')event.ports[0]?.postMessage({userId:await get('user')});
   else if(event.data.kind==='playroom-push-bind'){
    const user=event.data.userId;if(user!==null&&!uuid.test(user||''))throw Error('invalid');
    const previous=await get('user');if(previous!==user){await put('pending',null);await put('seen',[]);for(const n of await self.registration.getNotifications())n.close();}
    await put('user',user);event.ports[0]?.postMessage({ok:true});
   }else if(event.data.kind==='playroom-push-pending')event.ports[0]?.postMessage({payload:await get('pending')});
   else if(event.data.kind==='playroom-push-room-read'){
    if(event.data.userId!==await get('user')||!uuid.test(event.data.roomId||'')||!Array.isArray(event.data.events)||event.data.events.length>80||event.data.events.some(id=>!uuid.test(id)))throw Error('invalid');
    const keys=new Set(event.data.events.map(id=>'room:'+id)),seen=await get('seen')||[];await put('seen',[...new Set([...seen,...keys])].slice(-200));
    for(const n of await self.registration.getNotifications())if(n.data?.id===event.data.roomId&&n.data?.recipient===event.data.userId&&keys.has(n.data?.event))n.close();
    event.ports[0]?.postMessage({ok:true});
   }
   else{const current=await get('pending');if(current?.event===event.data.event)await put('pending',null);event.ports[0]?.postMessage({ok:true});}
  }catch{event.ports[0]?.postMessage({error:true});}}));
 });
 self.addEventListener('push',event=>event.waitUntil(serial(async()=>{
  let payload;try{payload=event.data?.json();}catch{return;}
  if(!valid(payload)||payload.expiresAt&&Date.parse(payload.expiresAt)<=Date.now()||await get('user')!==payload.recipient)return;
  const seen=await get('seen')||[];if(seen.includes(payload.event))return;
  const list=await clients(),handled=(await Promise.all(list.map(c=>ask(c,payload)))).some(Boolean);
  if(await get('user')!==payload.recipient)return;
  if(!handled)await self.registration.showNotification(String(payload.title||'ХОД').slice(0,80),{body:String(payload.body||'Новое событие').slice(0,160),icon:new URL('icons/icon-192.png',scope).href,badge:new URL('icons/badge-96.png',scope).href,tag:payload.event,data:payload});
  await put('seen',[...seen,payload.event].slice(-200));
 })));
 self.addEventListener('notificationclick',event=>{
  if(!valid(event.notification.data))return;event.notification.close();
  event.waitUntil(serial(async()=>{
   const payload=event.notification.data;if(await get('user')!==payload.recipient)return;
   await put('pending',payload);
   const list=await clients();if(list.length){list[0].postMessage({kind:'playroom-push-open',payload});try{await list[0].focus();}catch{}return;}
   await self.clients.openWindow(scope.href);
  }));
 });
 // A changed/expired subscription needs a signed-in page to register it safely.
 self.addEventListener('pushsubscriptionchange',event=>event.waitUntil(serial(async()=>{await put('user',null);for(const c of await clients())c.postMessage({kind:'playroom-push-subscription-changed'});})));
})();
