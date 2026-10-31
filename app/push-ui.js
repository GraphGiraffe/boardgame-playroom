/* Explicit device opt-in and notification navigation. No permission prompt at startup. */
(function(root){
 'use strict';
 const D=()=>root.PlayroomPushDevice,H=()=>root.PlayroomGameScreen;
 let account,remote,user=null,config=null,enabled=false,busy=false,notice='',generation=0,opening=false;
 const labels={unsupported:'Браузер не поддерживает уведомления',setup:'Уведомления ещё не настроены',permission:'Уведомления запрещены в браузере','pwa-required':'Откройте установленное приложение или сайт',network:'Нет связи. Попробуйте ещё раз.',request:'Не удалось изменить уведомления. Попробуйте ещё раз.'};
 function markup(){const supported=D().supported(),ready=!!config?.ready,denied=D().permission()==='denied',reason=notice||(!supported?labels.unsupported:denied?labels.permission:!ready?labels.setup:'');return H().iconButton('data-push-toggle aria-pressed="'+enabled+'"',(enabled?'Отключить уведомления':'Включить уведомления')+(reason?' · '+reason:''),enabled?'bell':'bell-off',{disabled:busy||!enabled&&(!supported||!ready||denied),className:enabled?'push-enabled':''});}
 function update(){for(const el of document.querySelectorAll('[data-push-settings]'))el.innerHTML=markup();}
 async function sync(){
  const s=account.snapshot(),next=s.kind==='account'&&!s.recovery?s.id:null;
  if(next===user)return;
  user=next;const ticket=++generation;enabled=false;config=null;notice='';update();
  if(!D().supported())return;
  try{
   const sub=await D().subscription();if(ticket!==generation)return;
   // Browser endpoints are not transferable between accounts. Revoke before rebinding.
   const state=await D().message({kind:'playroom-push-state'});
   if(ticket!==generation)return;
   if(sub&&state?.userId!==next)await sub.unsubscribe();
   if(ticket!==generation)return;
   await D().message({kind:'playroom-push-bind',userId:next});
   if(ticket!==generation||!next)return;
   const received=await remote.call('config',{}, {userId:next});if(ticket!==generation)return;config=received;
   if(sub&&state?.userId===next&&config?.ready&&D().permission()==='granted'){
    await remote.call('subscribe',{subscription:sub.toJSON()},{userId:next});if(ticket!==generation)return;enabled=true;
   }
   await openPending();
  }catch(e){if(ticket===generation&&!['pwa-required','unsupported'].includes(e.code))notice=labels[e.code]||labels.request;}
  if(ticket===generation)update();
 }
 async function disable(owner=user){
  const sub=await D().subscription();await D().message({kind:'playroom-push-bind',userId:null});
  enabled=false;
  if(sub){await sub.unsubscribe();await remote.call('remove',{endpoint:sub.endpoint},{userId:owner});}
  enabled=false;
 }
 async function toggle(){
  if(busy||!user||!config?.ready)return;busy=true;notice='';update();const ticket=generation;
  try{
   if(enabled)await disable();
   else{
    const sub=await D().subscribe(config.publicKey);
    if(ticket!==generation){await sub.unsubscribe();return;}
    try{await remote.call('subscribe',{subscription:sub.toJSON()},{userId:user});if(ticket!==generation){await sub.unsubscribe();return;}await D().message({kind:'playroom-push-bind',userId:user});enabled=true;}
    catch(e){await sub.unsubscribe();throw e;}
   }
  }catch(e){notice=labels[e.code]||labels.request;root.PlayroomAppBridge.toast(notice);}finally{busy=false;update();}
 }
 async function beforeLogout(){
  generation++;
  if(!D().supported())return;
  try{await disable();}catch{try{await D().message({kind:'playroom-push-bind',userId:null});}catch{}enabled=false;}
 }
 function visible(payload){
  if(document.hidden||!document.hasFocus()||payload.recipient!==user)return false;
  if(/^(friend-request|friend-accepted):/.test(payload.event||'')){root.PlayroomChatNotifications.friendEvent(payload.event);return true;}
  if(/^(group-member|invite-accepted):/.test(payload.event||'')){root.PlayroomAppBridge.toast(payload.title+'\n'+payload.body);return true;}
  if(payload.type==='update')return false;
  if(payload.type==='room'){
   if(root.PlayroomCloudNetwork.roomId()!==payload.id)return false;
   // Result/settings overlays do not hide the fact that this game's screen is open.
   if(/^(game-(started|resumed|finished)|turn)$/.test(payload.activity||'')&&document.querySelector('#app .table-shell.network-game:not([data-reaction-replay="true"])'))return true;
   return root.PlayroomChatActivity.visible();
  }
  // Foreground direct/group events are handled by the existing in-app banners.
  return true;
 }
 async function openPending(payload){
  if(opening||!user||!remote)return;
  opening=true;
  try{
   payload=payload||(await D().message({kind:'playroom-push-pending'}))?.payload;
   if(!payload||payload.recipient!==user)return;
   if(payload.type==='update'){root.PlayroomAppBridge.showImportantUpdate(payload);await D().message({kind:'playroom-push-consumed',event:payload.event});return;}
   if(/^(friend-request|friend-accepted):/.test(payload.event||'')){
    const hub=await root.PlayroomCommunityUI.service.call('hub');if(payload.recipient!==user)return;
    const friend=hub.friends?.find(person=>person.userId===payload.id),onBack=root.PlayroomAppBridge.captureModalReturn();
    if(friend)root.PlayroomFriendProfileUI.show(friend,{onBack});else root.PlayroomCommunityUI.show({onBack});
    await D().message({kind:'playroom-push-consumed',event:payload.event});return;
   }
   const target=await remote.call('target',{type:payload.type,id:payload.id},{userId:user});
   if(payload.recipient!==user)return;
   const onBack=root.PlayroomChatUI.captureReturn()||root.PlayroomRoomChatUI.captureReturn()||root.PlayroomAppBridge.captureModalReturn();
   if(target?.person)await root.PlayroomChatUI.show(target.person,{onBack,messageId:/^dm:([1-9][0-9]*)$/.exec(payload.event||'')?.[1]||null});
   else if(target?.group)root.PlayroomGroupUI.open(target.group,{onBack});
   else if(target?.room){
    if(root.PlayroomCloudNetwork.roomId()!==target.room.id||!root.PlayroomNetworkLibrary.chatContext()?.connected)await root.PlayroomCloudNetwork.connect(target.room.id);
    if(payload.recipient!==user)return;
    if(payload.activity||payload.event?.startsWith('invite-accepted:')){root.PlayroomNetworkLibrary.openRoom();}else root.PlayroomRoomChatUI.show({initialScope:payload.scope==='team'?'team':'room',onReturn:onBack});
   }else{root.PlayroomCommunityUI.show({onBack});}
   await D().message({kind:'playroom-push-consumed',event:payload.event});
  }catch{/* Pending target stays available for reconnect. */}finally{opening=false;}
 }
 async function notifyRoom(roomId,entry,targets,includeHost){if(!remote||!user||!root.PlayroomCloudNetwork.isHosting())return;try{await remote.call('room-message',{roomId,eventId:entry.id,author:entry.authorId,scope:entry.scope,targets,includeHost},{userId:user});}catch{/* RTC delivery remains independent of the optional push service. */}}
 function watchGame(options){return new root.PlayroomGamePushEvents({...options,access:root.PlayroomSessionAccess,send:payload=>{const roomId=root.PlayroomCloudNetwork.roomId();if(!remote||!user||!roomId||!root.PlayroomCloudNetwork.isHosting())return Promise.reject(Error('host-unavailable'));return remote.call('game-state',{...payload,roomId},{userId:user});}});}
 function init(ports){({account,remote}=ports);user=undefined;account.subscribe(()=>void sync());void sync();
  navigator.serviceWorker?.addEventListener('message',event=>{
   const data=event.data;if(data?.kind==='playroom-push-visible'){event.ports[0]?.postMessage({handled:visible(data.payload)});void root.PlayroomChatNotifications.poll();}
   if(data?.kind==='playroom-push-open')void openPending(data.payload);
   if(data?.kind==='playroom-push-subscription-changed'){enabled=false;update();}
  });
  navigator.serviceWorker?.addEventListener('controllerchange',()=>{user=undefined;void sync();});
  root.addEventListener('online',()=>{user=undefined;void sync();});
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-push-toggle]'))void toggle();});
 root.PlayroomPushUI=Object.freeze({init,markup,beforeLogout,openPending,notifyRoom,watchGame});
})(globalThis);
