'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');const root=path.resolve(__dirname,'..'),captures=process.env.PLAYROOM_CAPTURE_DIR||path.join(root,'dist/test-results/room-entry-captures');fs.mkdirSync(captures,{recursive:true});
async function profile(browser,url,name){const ctx=await browser.newContext({playroomProfile:false,viewport:{width:390,height:844}}),page=await ctx.newPage();page.setDefaultTimeout(10000);await page.goto(url);await page.locator('#profile-form input').fill(name);await page.locator('#profile-form').evaluate(f=>f.requestSubmit());await page.locator('.game-grid').first().waitFor();return page;}
test('compact room discovery, requested friend banner, direct invitation progress and retry at mobile sizes',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await profile(browser,server.url,'Игрок'),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.evaluate(()=>{
   const user='00000000-0000-4000-8000-000000000001',friend={userId:'00000000-0000-4000-8000-000000000002',nickname:'Ember',username:'ember',accepted:false},roomId='00000000-0000-4000-8000-000000000003';window.entryFriend=friend;window.joinCalls=0;
   const invite={id:'1',kind:'invitation',mine:false,state:'active',inviteId:'00000000-0000-4000-8000-000000000004',gameName:'UNO',roomName:'Комната Ember',body:'Приглашение',at:new Date().toISOString()};
   window.PlayroomAccountUI={...PlayroomAccountUI,service:{snapshot:()=>({kind:'account',id:user})}};
   window.PlayroomSocialUI={...PlayroomSocialUI,service:{snapshot:()=>({rooms:[{id:roomId,name:'Комната Ember',ownerId:friend.userId}]}),refresh:async()=>{},perform:async action=>{if(action==='request'){friend.id='edge';friend.requested=true;friend.incoming=false;return {};}if(action==='join'){joinCalls++;invite.state='joined';return {id:roomId};}return {};}}};
   window.PlayroomCommunityUI={...PlayroomCommunityUI,service:{key:()=> 'account:'+user,call:async action=>action==='discover'?[{id:roomId,name:'Комната Ember',ownerId:friend.userId,gameName:'UNO',roomCode:'6116'}]:action==='hub'?{friends:[{...friend}],conversations:[{...friend}]}:action==='chat'?{messages:[{...invite}],through:'0'}:{}}};
   window.PlayroomCloudNetwork={...PlayroomCloudNetwork,connect:()=>new Promise((resolve,reject)=>{window.finishRoomJoin=resolve;window.failRoomJoin=()=>reject(Object.assign(Error('host-offline'),{code:'host-offline'}));})};PlayroomLobbyNetwork.incoming();
  });
  await page.locator('[data-incoming-list] .incoming-room').waitFor();const number=page.locator('[data-lobby-join-code] [name=token]');await number.fill('#3770');assert.equal(await number.inputValue(),'3770');assert(await page.locator('[data-room-number-prefix]').isVisible());await number.fill('https://example.test/#playroom-room=3770');assert(await page.locator('[data-room-number-prefix]').isHidden());await number.fill('3770');assert(await page.locator('[data-room-number-prefix]').isVisible());assert.equal(await page.getByRole('button',{name:'Найти комнаты',exact:true}).count(),0);assert.equal(await page.locator('[data-incoming-list] .incoming-room').count(),1);assert.equal(await page.locator('.modal-head [data-lobby-online=manual] [data-ui-icon=wifi]').count(),1);
  for(const [width,height] of [[320,740],[390,844],[740,390]]){await page.setViewportSize({width,height});await page.screenshot({path:path.join(captures,'incoming-'+width+'.png')});assert(await page.locator('.lobby-incoming-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'modal overflow at '+width);assert(await page.locator('[data-lobby-join-code] fieldset').evaluate(e=>{const a=(e.querySelector('.room-number-editor')||e.querySelector('input')).getBoundingClientRect(),b=e.querySelector('button').getBoundingClientRect();return a.width>=100&&b.width>=80&&Math.abs(a.top-b.top)<8;}),'entry row sizing at '+width);await page.screenshot({path:path.join(captures,'incoming-'+width+'.png')});}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>PlayroomChatUI.show(entryFriend));await page.locator('[data-chat-add]:not([hidden])').waitFor();await page.screenshot({path:path.join(captures,'chat-before-add.png')});assert(await page.locator('.chat-date').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('[data-chat-add]').getBoundingClientRect().bottom));
  await page.locator('[data-chat-add]').click();await page.locator('[data-confirm-accept]').click();await page.waitForFunction(()=>document.querySelector('[data-chat-add]')?.hidden===true);await page.screenshot({path:path.join(captures,'chat-requested.png')});
  await page.locator('[data-chat-join]').click();await page.locator('[data-joining-message]').waitFor();assert.equal(await page.locator('[data-incoming-content]').count(),0);assert.equal(await page.evaluate(()=>joinCalls),1);await page.evaluate(()=>failRoomJoin());await page.locator('[data-lobby-retry-join]:visible').waitFor();await page.locator('.modal-head [data-command=close-modal]').click();await page.locator('[data-chat-join]').waitFor();assert.equal(await page.locator('[data-chat-add]:visible').count(),0);await page.screenshot({path:path.join(captures,'chat-retry.png')});assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
test('online RTC attachment enters the lobby with the saved nickname and no second join form',{timeout:60000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const host=await profile(browser,server.url,'Ember'),guest=await profile(browser,server.url,'Гость');await guest.locator('[data-start=tictactoe]').click();await host.locator('[data-start=uno]').click();await host.locator('[data-room-option=transportMode][value=online]').check();
  const info=await host.evaluate(async()=>{const b=PlayroomAppBridge,r=b.room();for(const seat of r.seats)if(seat.participantId&&seat.participantId!==r.ownerId)b.roomService.setLocalSeat(r.id,r.ownerId,seat.id,{kind:'empty'});b.renderLobby();window.onlinePeer=await PlayroomNetworkLibrary.cloudHostPeer({identity:{userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'},check:async()=>{}});return {offer:onlinePeer.offer,room:r.id};});
  const answer=await guest.evaluate(async offer=>{window.joinPeer=await PlayroomWebRTCTransport.createClientPeer(offer);return joinPeer.answer;},info.offer);await host.evaluate(answer=>onlinePeer.accept(answer),answer);await guest.evaluate(id=>PlayroomNetworkLibrary.cloudAttachClient(joinPeer,id),info.room);await guest.locator('.lobby-shell').waitFor();assert.equal(await guest.locator('#net-client-join').count(),0);assert.equal(await host.evaluate(()=>PlayroomAppBridge.room().participants.some(p=>p.nickname==='Гость')),true);
  await guest.locator('[data-net-action=dismiss-room]').click();await guest.waitForFunction(()=>document.querySelector('#network-join-button')?.disabled);assert.equal(await guest.locator('.topbar-tools [data-net-action=room],.topbar-tools [data-command=room]').count(),1);await guest.evaluate(()=>PlayroomLobbyNetwork.incoming());assert.equal(await guest.locator('[data-incoming-content]').count(),0);
  for(const mode of ['hub','chat']){
   if(mode==='chat'){await guest.evaluate(()=>PlayroomRoomChatUI.show());await guest.locator('[data-room-chat-content]').waitFor();await guest.locator('[data-room-chat-form] [data-chat-editor]').fill('Черновик');await guest.evaluate(()=>window.savedChatNode=document.querySelector('[data-room-chat-content]'));}
   await guest.evaluate(()=>joinPeer.close());await guest.waitForFunction(()=>!PlayroomNetworkLibrary.chatContext()?.connected);
   const offer=await host.evaluate(async()=>{onlinePeer=await PlayroomNetworkLibrary.cloudHostPeer({identity:{userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'},check:async()=>{}});return onlinePeer.offer;});const answer=await guest.evaluate(async offer=>{joinPeer=await PlayroomWebRTCTransport.createClientPeer(offer);return joinPeer.answer;},offer);await host.evaluate(answer=>onlinePeer.accept(answer),answer);await guest.evaluate(id=>PlayroomNetworkLibrary.cloudAttachClient(joinPeer,id,{background:true}),info.room);assert.equal(await guest.locator('.lobby-shell').count(),0,'background reconnect must not open lobby');
   if(mode==='chat'){assert(await guest.evaluate(()=>document.querySelector('[data-room-chat-content]')===savedChatNode));assert.equal(await guest.locator('[data-room-chat-form] [data-chat-editor]').innerText(),'Черновик');}
  }


  await guest.evaluate(()=>{PlayroomRoomChatUI.close();PlayroomNetworkLibrary.openRoom();});await guest.locator('[data-net-seat=seat-2]').click();await guest.locator('[data-net-action=ready]').click();await host.locator('[data-command=lobby-ready]').click();await host.locator('[data-command=lobby-start]:not([disabled])').click();await guest.locator('.table-shell.network-game').waitFor();await guest.evaluate(()=>PlayroomAppBridge.closeModal(true));
  const savedGame=await guest.evaluate(()=>({sessionId:PlayroomNetworkLibrary.playerControlContext().snapshot.sessionId,id:PlayroomNetworkLibrary.transferClient().id}));await guest.evaluate(()=>joinPeer.close());await guest.waitForFunction(()=>!PlayroomNetworkLibrary.chatContext()?.connected);
  await guest.evaluate(()=>history.back());await guest.locator('[data-confirm-accept]').click();await guest.locator('.hub-main').waitFor();assert.equal(await guest.locator('.table-shell.network-game').count(),0,'offline system-back confirmation exits locally');
  const playingOffer=await host.evaluate(async()=>{onlinePeer=await PlayroomNetworkLibrary.cloudHostPeer({identity:{userId:'00000000-0000-4000-8000-000000000001',participantId:'00000000-0000-4000-8000-000000000002'},check:async()=>{}});return onlinePeer.offer;});const playingAnswer=await guest.evaluate(async offer=>{joinPeer=await PlayroomWebRTCTransport.createClientPeer(offer);return joinPeer.answer;},playingOffer);await host.evaluate(answer=>onlinePeer.accept(answer),playingAnswer);await guest.evaluate(id=>PlayroomNetworkLibrary.cloudAttachClient(joinPeer,id),info.room);await guest.locator('.table-shell.network-game').waitFor();assert.equal(await guest.evaluate(()=>PlayroomNetworkLibrary.playerControlContext().snapshot.sessionId),savedGame.sessionId);assert.equal(await guest.evaluate(()=>PlayroomNetworkLibrary.transferClient().id),savedGame.id);assert.equal(await guest.locator('.lobby-shell').count(),0,'explicit resume enters the existing game');
 }finally{await browser.close();await server.close();}
});

test('immediate room entry shares guest authorization with automatic discovery',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await profile(browser,server.url,'Гость');await page.evaluate(()=>{
  let kind='local';window.guestStarts=0;window.liveConnects=0;
  window.PlayroomAccountUI={...PlayroomAccountUI,service:{snapshot:()=>({kind,id:'guest'}),ensureGuest:async()=>{guestStarts++;await new Promise(resolve=>window.finishGuest=resolve);kind='guest';}}};
  window.PlayroomSocialUI={...PlayroomSocialUI,service:{snapshot:()=>({rooms:[]}),refresh:async()=>{}}};
  window.PlayroomCommunityUI={...PlayroomCommunityUI,service:{call:async action=>action==='discover'?[]:{id:'test-room'}}};
  window.PlayroomCloudNetwork={...PlayroomCloudNetwork,connect:async()=>{liveConnects++;}};PlayroomLobbyNetwork.incoming();
 });await page.waitForFunction(()=>guestStarts===1);await page.locator('[name=token]').fill('https://example.test/#playroom-room=6116&password=AB23CD');await page.locator('[data-lobby-join-code] [type=submit]').click();await page.locator('[data-joining-message]').waitFor();assert.equal(await page.evaluate(()=>guestStarts),1);await page.evaluate(()=>finishGuest());await page.waitForFunction(()=>liveConnects===1);assert.equal(await page.locator('[data-joining-message]').innerText(),'Подключение…');
 }finally{await browser.close();await server.close();}
});

test('online reconnect button keeps the cloud room instead of opening manual pairing',{timeout:25000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await profile(browser,server.url,'Гость');await page.evaluate(()=>{window.reconnected=null;window.PlayroomCloudNetwork={...PlayroomCloudNetwork,roomId:()=> 'cloud-room'};window.PlayroomLobbyNetwork={...PlayroomLobbyNetwork,reconnectRoom:id=>{window.reconnected=id;}};const button=document.createElement('button');button.id='network-reconnect-button';document.body.appendChild(button);button.click();});assert.equal(await page.evaluate(()=>reconnected),'cloud-room');assert.equal(await page.locator('#net-client-offer').count(),0);
 }finally{await browser.close();await server.close();}
});

test('room password uses six cells with native selection, bounded paste and mobile editing',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await profile(browser,server.url,'Гость');
  await page.evaluate(()=>{window.passwordCalls=[];window.PlayroomAccountUI={...PlayroomAccountUI,service:{snapshot:()=>({kind:'account',id:'user'})}};window.PlayroomCommunityUI={...PlayroomCommunityUI,service:{call:async(action,data)=>{if(action==='join-password'){passwordCalls.push(data);return {id:'room'};}return {};}}};window.PlayroomCloudNetwork={...PlayroomCloudNetwork,connect:async()=>{}};const b=document.createElement('button');b.dataset.lobbyOnline='password-room';b.dataset.room='room';b.dataset.name='Комната Ember';b.textContent='Пароль';document.body.append(b);b.click();});
  const input=page.locator('[data-room-password-input]'),cells=page.locator('.room-password-cell');assert.equal(await cells.count(),6);assert.equal(await input.getAttribute('name'),'password');
  await input.fill('ab23cdefghi');assert.equal(await input.inputValue(),'AB23CD');assert.deepEqual(await cells.allTextContents(),['A','B','2','3','C','D']);
  await input.press('ControlOrMeta+A');await input.press('Backspace');assert.equal(await input.inputValue(),'');await input.pressSequentially('ab23cd');assert.equal(await input.inputValue(),'AB23CD');
  await input.press('ArrowLeft');assert.equal(await input.evaluate(e=>e.selectionStart),5);await input.press('Home');await input.press('Delete');assert.equal(await input.inputValue(),'B23CD');await input.press('End');await input.press('Backspace');assert.equal(await input.inputValue(),'B23C');
  const third=await cells.nth(2).boundingBox();await input.click({position:{x:third.x-(await input.boundingBox()).x+third.width/2,y:third.height/2}});assert.deepEqual(await input.evaluate(e=>[e.selectionStart,e.selectionEnd]),[2,3]);await input.pressSequentially('x');assert.equal(await input.inputValue(),'B2XC');
  await input.evaluate(e=>{e.focus();e.select();const data=new DataTransfer();data.setData('text/plain',' th-7v 4b extra ');e.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:data}));});assert.equal(await input.inputValue(),'TH7V4B');
  await input.press('ArrowLeft');await input.press('ArrowLeft');await input.press('Backspace');assert.equal(await input.inputValue(),'TH74B');
  await input.dblclick();assert.deepEqual(await input.evaluate(e=>[e.selectionStart,e.selectionEnd]),[0,5]);
  await input.fill('ab');await input.press('Enter');assert.equal(await page.evaluate(()=>passwordCalls.length),0,'incomplete value cannot submit');
  await input.fill('ab23cd');await input.press('Tab');assert.equal(await input.evaluate(e=>document.activeElement===e),false);
  for(const [width,height] of [[320,740],[390,844],[740,390],[1280,900]]){await page.setViewportSize({width,height});const box=await page.locator('.room-password-entry').boundingBox();const last=await cells.last().boundingBox();assert(box.width<=352.1,'desktop entry stays bounded');assert(last.width<=52.1);assert(last.x+last.width<=box.x+box.width+1);assert.equal(await input.evaluate(e=>getComputedStyle(e.parentElement.querySelector('.room-password-cell')).fontFamily),'ui-monospace, monospace');await page.screenshot({path:path.join(captures,'password-cells-'+width+'.png')});}
  await input.press('Enter');await page.waitForFunction(()=>passwordCalls.length===1);assert.equal(await page.evaluate(()=>passwordCalls[0].password),'AB23CD');
 }finally{await browser.close();await server.close();}
});

test('room discovery hides expired cached host leases without losing reserved membership',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{const page=await profile(browser,server.url,'Гость');await page.evaluate(()=>{window.leaseRoom={id:'room',name:'Комната Ember',ownerId:'host',available:false,hostUntil:new Date(Date.now()-1000).toISOString()};window.PlayroomAccountUI={...PlayroomAccountUI,service:{snapshot:()=>({kind:'account',id:'user'})}};window.PlayroomSocialUI={...PlayroomSocialUI,service:{snapshot:()=>({rooms:[leaseRoom]}),refresh:async()=>{}}};window.PlayroomCommunityUI={...PlayroomCommunityUI,service:{call:async()=>[]}};PlayroomLobbyNetwork.incoming();});await page.locator('[data-incoming-list]').waitFor();assert.equal(await page.locator('.incoming-room').count(),0);assert.equal(await page.evaluate(()=>PlayroomSocialUI.service.snapshot().rooms.length),1);
 await page.evaluate(()=>{leaseRoom.available=true;leaseRoom.hostUntil=new Date(Date.now()+20000).toISOString();PlayroomLobbyNetwork.incoming();});await page.locator('.incoming-room').waitFor();assert.equal(await page.locator('[data-lobby-online=connect]').count(),1);
 await page.evaluate(()=>{leaseRoom.hostUntil=new Date(Date.now()-1000).toISOString();PlayroomLobbyNetwork.incoming();});await page.waitForFunction(()=>!document.querySelector('.incoming-room'));assert.equal(await page.evaluate(()=>PlayroomSocialUI.service.snapshot().rooms.length),1);
 }finally{await browser.close();await server.close();}
});

test('closed room status piggybacks on unread polling and clears invitation badges',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:740}});await page.route('https://*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomChatNotifications);
  await page.evaluate(()=>{
   window.closeCalls=[];window.testRoom='room';window.closedNotifications=0;
   window.PlayroomCloudNetwork={roomId:()=>testRoom,roomClosed:id=>{if(id===testRoom){testRoom=null;closedNotifications++;}}};
   PlayroomChatNotifications.init({account:{snapshot:()=>({kind:'account',id:'test-account'}),subscribe(){}},store:{read:()=>null,write(){}},service:{call:async(action,data)=>{closeCalls.push({action,data});return action==='unread'?{roomUnavailable:true,chats:[{key:'group:closed',unread:2,invites:0,through:'0'}]}:{items:[],cursor:'0'};}}});
   const sample=document.createElement('div');sample.id='host-transfer-icon-sample';sample.style='position:fixed;top:20px;left:20px;z-index:2147483647;background:#000;color:#f7f3df;padding:12px;width:64px';sample.innerHTML=PlayroomGameScreen.iconButton('data-test-transfer','Передать хоста','host-transfer');document.body.append(sample);
  });
  await page.waitForFunction(()=>closedNotifications===1);const state=await page.evaluate(()=>({calls:closeCalls,room:testRoom,counts:PlayroomChatState.count('group:closed')}));
  assert.equal(state.room,null);assert.equal(state.counts.invites,0);assert.equal(state.counts.unread,2,'closure does not mark messages read');assert.deepEqual(state.calls.map(c=>c.action).sort(),['group-inbox','inbox','unread']);assert.deepEqual(state.calls.find(c=>c.action==='unread').data,{roomId:'room'});
  await page.locator('#host-transfer-icon-sample').screenshot({path:path.join(captures,'host-transfer-icon.png')});assert.equal(await page.locator('#host-transfer-icon-sample [data-ui-icon=host-transfer]').count(),1);
 }finally{await browser.close();await server.close();}
});

test('participant profile resolves all actions before opening and keeps button positions stable',{timeout:30000},async()=>{
 const server=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:740}});await page.route('https://*.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));await page.goto(server.url);await page.waitForFunction(()=>!!globalThis.PlayroomFriendProfileUI);
  await page.evaluate(()=>{
   const room={id:'room',transportMode:'online',phase:'playing',ownerId:'me',participants:[{id:'me',nickname:'Хост',role:'player',isHost:true,connected:true},{id:'target',nickname:'Ember',role:'spectator',connected:true}]};
   PlayroomNetworkLibrary={...PlayroomNetworkLibrary,inviteContext:()=>({room,participantId:'me',cloudRoomId:'cloud'}),transferContext:()=>({room,peers:[{id:'target'}]}),playerControlContext:()=>null};PlayroomAppBridge={...PlayroomAppBridge,roomService:{snapshot:()=>room}};PlayroomAccountUI={...PlayroomAccountUI,service:{snapshot:()=>({id:'account-me'})}};
   PlayroomCommunityUI={...PlayroomCommunityUI,service:{key:()=> 'account-me',call:()=>new Promise(resolve=>{window.finishProfile=()=>resolve({person:{userId:'account-target',nickname:'Ember',accepted:true,id:'friend',username:'ember'}});})}};
   window.profileOpening=PlayroomFriendProfileUI.showParticipant('target');
  });
  assert.equal(await page.locator('[data-friend-profile]').count(),0,'participant window is not shown with partial actions');await page.evaluate(()=>finishProfile());await page.evaluate(()=>profileOpening);await page.locator('[data-profile-transfer]:not([disabled])').waitFor();
  const actions=page.locator('.participant-profile-actions>button'),before=await actions.evaluateAll(nodes=>nodes.map(n=>({key:Object.keys(n.dataset).find(k=>k.startsWith('profile')),x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert.deepEqual(before.map(x=>x.key),['profileRemove','profileChat','profileTransfer','profileKick']);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const after=await actions.evaluateAll(nodes=>nodes.map(n=>({key:Object.keys(n.dataset).find(k=>k.startsWith('profile')),x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y})));assert.deepEqual(after,before);
  await page.locator('.friend-profile-modal').screenshot({path:path.join(captures,'participant-profile-ready.png')});
 }finally{await browser.close();await server.close();}
});
