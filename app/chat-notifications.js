/* In-app message banners. Web Push and room transport are separate concerns. */
(function(root){
 'use strict';
 let account,service,store,identity='',cursor=null,groupCursor=null,timer=null,flight=null,generation=0,dismissTimer=null;
 const invitationChecks=new Map();
 const pending=new Map(),H=()=>root.PlayroomGameScreen;
 function host(){let el=document.querySelector('[data-chat-notifications]');if(!el){el=document.createElement('aside');el.dataset.chatNotifications='';el.setAttribute('aria-live','polite');el.className='chat-notifications';document.body.append(el);}return el;}
 function render(){clearTimeout(dismissTimer);const now=Date.now();for(const [id,item]of pending)if(item.expiresAt<=now)pending.delete(id);if(pending.size)dismissTimer=setTimeout(render,Math.max(1,Math.min(...[...pending.values()].map(item=>item.expiresAt))-now));const el=host();root.PlayroomDOM.ListController.update(el,[...pending.values()].map(item=>{
  const esc=H().esc,preview=item.kind==='group-invitation'?'Приглашение в группу · '+item.body:item.kind==='invitation'?root.PlayroomMessages.text('ui.community.invitation')+(item.gameName?' · '+item.gameName:''):item.body;
  return `<div class="chat-notification" data-entity="notification-${esc(item.person.userId)}"><button type="button" class="chat-notification-open" data-notification-open="${esc(item.person.userId)}">${root.TabletopUI.avatar({name:item.person.nickname,avatar:item.person.avatar},0,{hidden:true})}<span><strong>${esc(item.person.nickname)}</strong><span>${root.PlayroomReactionView.html(preview)}</span></span></button>${H().iconButton(`data-notification-close="${esc(item.person.userId)}"`,root.PlayroomMessages.text('ui.community.dismiss-notification'),'close')}</div>`;
 }).join(''));}
 function clear(){clearTimeout(dismissTimer);pending.clear();document.querySelector('[data-chat-notifications]')?.replaceChildren();}
 function valid(){const state=account.snapshot();return state.kind==='account'&&!state.recovery&&!document.hidden;}
 async function poll(){
  if(!valid())return;if(flight)return flight;
  const ticket=generation,user=account.snapshot().id,roomId=root.PlayroomCloudNetwork?.roomId?.();
  const run=(async()=>{
   try{const [counts,direct,groups]=await Promise.allSettled([service.call('unread',roomId?{roomId}:{}),service.call('inbox',cursor===null?{}:{after:cursor}),service.call('group-inbox',groupCursor===null?{}:{after:groupCursor})]);if(ticket!==generation)return;const totals=counts.status==='fulfilled'?counts.value:null,result=direct.status==='fulfilled'?direct.value:null,groupResult=groups.status==='fulfilled'?groups.value:null;if(Array.isArray(totals?.chats))root.PlayroomChatState.summary(totals.chats);if(totals?.roomUnavailable&&roomId)root.PlayroomCloudNetwork?.roomClosed?.(roomId);
    if(/^\d+$/.test(result?.cursor||'')){
    cursor=result.cursor;store.write(user,cursor);
    for(const item of result.items||[]){const inList=root.PlayroomReactionUI.listMessage('dm:'+item.person.userId,item.body);if(inList)continue;if(item.invitationState&&item.invitationState!=='active')continue;if(item.person.userId===root.PlayroomChatUI.currentUserId())continue;
     pending.delete(item.person.userId);pending.set(item.person.userId,{...item,expiresAt:Date.now()+6000});while(pending.size>3)pending.delete(pending.keys().next().value);
    }
    }
    if(/^\d+$/.test(groupResult?.cursor||'')){
    groupCursor=groupResult.cursor;store.write(user+':groups',groupCursor);
    for(const item of groupResult.items||[]){const inList=root.PlayroomReactionUI.listMessage('group:'+item.group?.id,item.body);if(inList)continue;if(item.invitationState&&item.invitationState!=='active')continue;if(item.group?.id===root.PlayroomRoomChatUI.currentGroupId())continue;pending.delete(item.person.userId);pending.set(item.person.userId,{...item,expiresAt:Date.now()+6000});while(pending.size>3)pending.delete(pending.keys().next().value);}}
    if(pending.size)render();
    await refreshInvitations(ticket);

   }catch(_){/* Background failure keeps the last cursor; the next poll retries. */}
  })();flight=run;try{await run;}finally{if(flight===run)flight=null;}
 }
 async function refreshInvitations(ticket){
  const cache=root.PlayroomChatState,now=Date.now();
  const candidates=cache.invitationChats().filter(item=>{const previous=invitationChecks.get(item.key),count=cache.count(item.key).invites||0;return !previous||previous.count!==count||now-previous.at>=30000;}).slice(0,8);
  await Promise.allSettled(candidates.map(async item=>{const count=cache.count(item.key).invites||0;invitationChecks.set(item.key,{count,at:now});try{const group=item.key.startsWith('group:'),id=item.key.slice(item.key.indexOf(':')+1),result=await service.call(group?'group-read':'chat',{[group?'groupId':'userId']:id,after:item.after,known:item.known});if(ticket===generation)cache.refreshInvitations(item.key,result.messages||[]);}catch{invitationChecks.delete(item.key);}}));
 }
 function schedule(){clearTimeout(timer);timer=null;if(!valid())return;timer=setTimeout(async()=>{timer=null;await poll();schedule();},5000);}
 function sync(){const state=account.snapshot(),key=state.kind+':'+state.id+':'+state.recovery;if(key!==identity){identity=key;generation++;flight=null;cursor=state.kind==='account'?store.read(state.id):null;groupCursor=state.kind==='account'?store.read(state.id+':groups'):null;clear();invitationChecks.clear();void poll();}if(!timer)schedule();}
 function wake(){if(valid())void poll();schedule();}
 function init(ports){({account,service,store}=ports);account.subscribe(sync);sync();document.addEventListener('visibilitychange',wake);root.addEventListener('focus',wake);root.addEventListener('pageshow',wake);root.addEventListener('online',wake);}
 document.addEventListener('click',event=>{
  const close=event.target.closest('[data-notification-close]'),open=event.target.closest('[data-notification-open]');if(!close&&!open)return;
  const id=(close||open).dataset[close?'notificationClose':'notificationOpen'],item=pending.get(id);pending.delete(id);render();if(!open||!item)return;
  const onBack=root.PlayroomChatUI.captureReturn()||root.PlayroomRoomChatUI?.captureReturn()||root.PlayroomAppBridge.captureModalReturn();if(item.group)root.PlayroomGroupUI.open(item.group,{onBack});else root.PlayroomChatUI.show(item.person,{onBack});
 });
 root.addEventListener('playroom:group-left',event=>{if(pending.delete('group:'+event.detail.groupId))render();});
 root.addEventListener('playroom:group-chat-opened',event=>{if(pending.delete('group:'+event.detail.groupId))render();});
 root.addEventListener('playroom:chat-opened',event=>{if(pending.delete(event.detail.userId))render();});
 root.addEventListener('pagehide',()=>{generation++;flight=null;clearTimeout(timer);timer=null;clear();});
 root.PlayroomChatNotifications=Object.freeze({init,poll});
})(globalThis);
