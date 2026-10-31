'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..'),user='00000000-0000-4000-8000-000000000001',peer='00000000-0000-4000-8000-000000000002';
test('web push worker persists device binding, suppresses duplicates and visible chats, isolates accounts and opens app scope',{timeout:40000},async()=>{
 const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','text/javascript');
  if(req.url==='/playroom/sw.js')return res.end(`self.listeners={};const original=self.addEventListener.bind(self);self.addEventListener=(name,fn)=>{self.listeners[name]=fn;original(name,fn);};importScripts('/worker.js');self.run=(name,event)=>{let pending;self.listeners[name]({...event,waitUntil:p=>pending=p});return pending;};`);
  if(req.url==='/worker.js')return res.end(fs.readFileSync(path.join(root,'platform/web/push-worker.js')));
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Push fixture</title>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({playroomProfile:false,permissions:['notifications']}),page=await context.newPage();await page.goto(url+'/playroom/');
  await page.evaluate(async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready;});const worker=context.serviceWorkers()[0];
  const bind=async id=>{await page.evaluate(id=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=resolve;navigator.serviceWorker.ready.then(r=>r.active.postMessage({kind:'playroom-push-bind',userId:id},[c.port2]));}),id);};
  await bind(user);
  const payload={v:1,event:'dm:1',recipient:user,type:'dm',id:peer,title:'Борис',body:'Сообщение'};
  const push=p=>worker.evaluate(p=>self.run('push',{data:{json:()=>p}}),p);
  await push(payload);assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),1);const images=await worker.evaluate(async()=>{const n=(await self.registration.getNotifications())[0];return {badge:n.badge,icon:n.icon};});assert.match(images.badge,/\/playroom\/icons\/badge-96\.png$/);assert.notEqual(images.badge,images.icon,'status badge uses a separate transparent silhouette');
  await worker.evaluate(async()=>{for(const n of await self.registration.getNotifications())n.close();});await push(payload);assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),0,'duplicate suppressed');
  await push({...payload,event:'dm:2',recipient:peer});assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),0,'other account ignored');
  await page.evaluate(()=>{window.handled=true;navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.kind==='playroom-push-visible')e.ports[0].postMessage({handled:window.handled});});});
  await push({...payload,event:'dm:3'});assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),0,'visible chat acknowledged');
  await page.evaluate(()=>window.handled=false);await push({...payload,event:'invite:4'});
  await worker.evaluate(async payload=>{await self.run('notificationclick',{notification:{data:payload,close(){}}});},{...payload,event:'invite:4'});
  const pending=await page.evaluate(()=>new Promise(resolve=>{const c=new MessageChannel();c.port1.onmessage=e=>resolve(e.data);navigator.serviceWorker.ready.then(r=>r.active.postMessage({kind:'playroom-push-pending'},[c.port2]));}));assert.equal(pending.payload.event,'invite:4');
  await bind(null);assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),0,'logout closes notifications');
  await push({...payload,event:'dm:5'});assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),0,'logged-out device ignores old delivery');
  await bind(user);await push({...payload,type:'update',event:'update:test',version:'1.0.0'});assert.equal(await worker.evaluate(async()=> (await self.registration.getNotifications()).length),1,'important update route is accepted by the worker');
  await context.close();
 }finally{await browser.close();await new Promise(r=>server.close(r));}
});
test('web push settings opt in explicitly, revoke on logout and navigate using authorized target',{timeout:40000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();await context.route('https://*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomAccountUI?.service);
  await page.evaluate(async({user,peer})=>{
   window.pushCalls=[];window.pushListeners=[];window.pushState=null;window.pushSub=null;window.promptCount=0;
   const sub={endpoint:'https://fcm.googleapis.com/x',toJSON:()=>({endpoint:'https://fcm.googleapis.com/x',keys:{p256dh:'key',auth:'auth'}}),unsubscribe:async()=>{window.pushSub=null;pushCalls.push('unsubscribe');return true;}};
   window.PlayroomPushDevice={supported:()=>true,permission:()=> 'granted',subscription:async()=>window.pushSub,subscribe:async()=>{window.promptCount++;window.pushSub=sub;return sub;},message:async data=>{if(data.kind==='playroom-push-state')return {userId:pushState};if(data.kind==='playroom-push-bind')pushState=data.userId;return {};}};
   window.pushAccount={snapshot:()=>({kind:'account',id:user}),subscribe:fn=>pushListeners.push(fn)};
   PlayroomPushUI.init({account:pushAccount,remote:{call:async(action,data)=>{pushCalls.push(action);if(action==='config')return {ready:true,publicKey:'test'};if(action==='target')return {person:{userId:peer,nickname:'Друг'}};return {};}}});
   await new Promise(r=>setTimeout(r,30));PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Аккаунт')+'<div data-push-settings>'+PlayroomPushUI.markup()+'</div>','account-modal');
  },{user,peer});
  await page.waitForFunction(()=>pushCalls.includes('config'));
  assert.equal(await page.evaluate(()=>promptCount),0);await page.locator('[data-push-toggle]').click();await page.waitForFunction(()=>pushCalls.includes('subscribe'));assert.equal(await page.evaluate(()=>promptCount),1);
  const button=page.locator('[data-push-toggle]');assert.equal(await button.getAttribute('aria-label'),'Отключить уведомления');
  await page.screenshot({path:path.join(root,'../tmp_files/web-push-020/settings-390.png')});
  await page.setViewportSize({width:320,height:650});assert(await page.locator('[data-push-settings]').evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:path.join(root,'../tmp_files/web-push-020/settings-320.png')});
  // The production chat API is immutable; capture authorized navigation by its resulting header.
  await page.evaluate(({user,peer})=>PlayroomPushUI.openPending({v:1,event:'dm:10',recipient:user,type:'dm',id:peer}),{user,peer});await page.locator('.chat-header-person').waitFor();
  await page.evaluate(()=>PlayroomPushUI.beforeLogout());assert.equal(await page.evaluate(()=>pushSub),null);assert.equal(await page.evaluate(()=>pushState),null);assert((await page.evaluate(()=>pushCalls)).includes('remove'));
  await page.evaluate(()=>{PlayroomPushDevice.permission=()=> 'denied';PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Аккаунт')+'<div data-push-settings>'+PlayroomPushUI.markup()+'</div>','account-modal');});
  assert(await page.locator('[data-push-toggle]').isDisabled());assert.match(await page.locator('[data-push-toggle]').getAttribute('aria-label'),/Уведомления запрещены в браузере/);
  await page.evaluate(()=>{PlayroomPushDevice.supported=()=>false;document.querySelector('[data-push-settings]').innerHTML=PlayroomPushUI.markup();});
  assert(await page.locator('[data-push-toggle]').isDisabled());assert.match(await page.locator('[data-push-toggle]').getAttribute('aria-label'),/Браузер не поддерживает уведомления/);

 }finally{await browser.close();await server.close();}
});
test('push settings ignore a stale account config response after switching accounts',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const context=await browser.newContext(),page=await context.newPage();await context.route('https://*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomAccountUI?.service);
  await page.evaluate(({user,peer})=>{window.switchUser=user;window.switchListeners=[];window.bindings=[];window.PlayroomPushDevice={supported:()=>true,permission:()=> 'granted',subscription:async()=>null,message:async data=>{if(data.kind==='playroom-push-bind')bindings.push(data.userId);return {};}};
   PlayroomPushUI.init({account:{snapshot:()=>({kind:'account',id:switchUser}),subscribe:fn=>switchListeners.push(fn)},remote:{call:async(action,data,options)=>action==='config'?options.userId===user?new Promise(resolve=>window.releaseOldPushConfig=()=>resolve({ready:false})):({ready:true,publicKey:'new'}):({})}});
  },{user,peer});
  await page.waitForFunction(()=>!!window.releaseOldPushConfig);await page.evaluate(peer=>{switchUser=peer;switchListeners.forEach(fn=>fn());},peer);await page.waitForFunction(()=>bindings.at(-1)===window.switchUser);await page.evaluate(()=>releaseOldPushConfig());
  await page.evaluate(()=>PlayroomAppBridge.openModal(PlayroomGameScreen.modalHead('Аккаунт')+'<div data-push-settings>'+PlayroomPushUI.markup()+'</div>','account-modal'));assert.equal(await page.locator('[data-push-toggle]').isDisabled(),false);
 }finally{await browser.close();await server.close();}
});

test('push message navigation waits for delayed chat rows and locates uncached older messages',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await browser.newPage({viewport:{width:390,height:740}});page.setDefaultTimeout(5000);
 try{await page.goto(server.url);await page.waitForFunction(()=>PlayroomCommunityUI?.service);
 await page.evaluate(({user,peer})=>{
  window.pushChatReads=[];window.pushChatRows=Array.from({length:160},(_,i)=>({id:String(i+1),body:'Сообщение '+(i+1)+' для проверки перехода из уведомления. '.repeat(3),mine:false,kind:'message',at:new Date().toISOString()}));
  PlayroomCommunityUI.service.call=async(action,data)=>{if(action==='chat'){pushChatReads.push(data);await new Promise(r=>setTimeout(r,120));return {messages:pushChatRows.filter(m=>BigInt(m.id)>BigInt(data.after||0)).slice(0,80),through:'129'};}return action==='hub'?{friends:[{userId:peer,nickname:'Ember',accepted:true}],conversations:[]}:{};};
  const key='dm:'+peer;PlayroomChatState.merge(key,pushChatRows.slice(49,129),{fetched:true});Object.assign(PlayroomChatState.get(key),{through:'129',scroll:0,position:{top:0,bottom:false,entity:'message-50',offset:0}});
  PlayroomPushDevice={supported:()=>false,message:async()=>({})};PlayroomPushUI.init({account:{snapshot:()=>({kind:'account',id:user}),subscribe:()=>{}},remote:{call:async()=>({person:{userId:peer,nickname:'Ember',accepted:true}})}});
 },{user,peer});
 for(const id of ['140','10']){await page.evaluate(({user,peer,id})=>PlayroomPushUI.openPending({v:1,event:'dm:'+id,recipient:user,type:'dm',id:peer}),{user,peer,id});assert(await page.locator('[data-entity="message-'+id+'"]').evaluate(el=>{const r=el.getBoundingClientRect(),box=el.parentElement.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom;}),'clicked message must be visible after asynchronous loading: '+id);}
 assert.equal(await page.evaluate(()=>pushChatReads.length),3,'one incremental read per open and one bounded lookup for the missing older message');
 assert.equal(await page.evaluate(()=>pushChatReads.at(-1).after),'9');
 }finally{await browser.close();await server.close();}
});


test('important update push opens updates without resolving a social target',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await browser.newPage();
 try{await page.goto(server.url);await page.waitForFunction(()=>PlayroomAccountUI?.service);await page.evaluate(async user=>{window.updateTargetCalls=0;PlayroomPushDevice={supported:()=>false,message:async()=>({})};PlayroomPushUI.init({account:{snapshot:()=>({kind:'account',id:user}),subscribe:()=>{}},remote:{call:async()=>{updateTargetCalls++;return {};}}});await PlayroomPushUI.openPending({v:1,type:'update',id:user,recipient:user,event:'update:test',title:'Важное обновление',body:'Исправление соединения',version:'1.0.0'});},user);await page.locator('.updates-modal [data-important-update]').waitFor();assert.equal(await page.locator('.update-changes>[data-important-update]').count(),1,'notice belongs to the scrollable content, not an extra header row');assert.match(await page.locator('[data-important-update]').innerText(),/Исправление соединения/);assert.equal(await page.evaluate(()=>updateTargetCalls),0);
 }finally{await browser.close();await server.close();}
});
