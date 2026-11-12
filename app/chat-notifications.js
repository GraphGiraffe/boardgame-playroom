/* In-app message banners. Web Push and room transport are separate concerns. */
(function(root){
 'use strict';
 let account,service,store,identity='',cursor=null,groupCursor=null,timer=null,flight=null,generation=0,dismissTimer=null,lastRead=null;
 let friendTracker=null;const forcedFriends=new Set();
 const invitationChecks=new Map();
 const groupEpochs=new Map(),currentGroup=(id,epochs)=>(epochs.get(id)||0)===(groupEpochs.get(id)||0);
 const pending=new Map(),H=()=>root.PlayroomGameScreen;
 function host(){let el=document.querySelector('[data-chat-notifications]');if(!el){el=document.createElement('aside');el.dataset.chatNotifications='';el.setAttribute('aria-live','polite');el.className='chat-notifications';document.body.append(el);}return el;}
 function render(){clearTimeout(dismissTimer);const now=Date.now();for(const [id,item]of pending)if(item.expiresAt<=now)pending.delete(id);if(pending.size)dismissTimer=setTimeout(render,Math.max(1,Math.min(...[...pending.values()].map(item=>item.expiresAt))-now));const el=host(),existing=new Set(el.children),keys=new Set([...pending.values()].map(item=>'notification-'+(item.key||item.person.userId)));for(const node of [...el.children])if(!keys.has(node.dataset.entity))root.PlayroomDOM.retireVisual(node,{kind:'banner'});root.PlayroomDOM.ListController.update(el,[...pending.values()].map(item=>{
  const esc=H().esc,preview=item.kind==='friend-request'?'Заявка в друзья':item.kind==='friend-accepted'?'Заявка в друзья принята':item.kind==='group-invitation'?'Приглашение в группу · '+item.body:item.kind==='invitation'?root.PlayroomMessages.text('ui.community.invitation')+(item.gameName?' · '+item.gameName:''):item.body;
  return `<div class="chat-notification" data-entity="notification-${esc(item.key||item.person.userId)}"><button type="button" class="chat-notification-open" data-notification-open="${esc(item.key||item.person.userId)}">${root.TabletopUI.avatar({name:item.person.nickname,avatar:item.person.avatar},0,{hidden:true})}<span><strong>${esc(item.person.nickname)}</strong><span>${root.PlayroomReactionView.html(preview)}</span></span></button>${H().iconButton(`data-notification-close="${esc(item.key||item.person.userId)}"`,root.PlayroomMessages.text('ui.community.dismiss-notification'),'close')}</div>`;
 }).join(''));for(const node of el.children)if(!existing.has(node))root.PlayroomDOM.enterVisual(node);}
 function clear(){clearTimeout(dismissTimer);pending.clear();root.PlayroomDOM.clearVisualExits(document);const el=document.querySelector('[data-chat-notifications]');for(const node of el?.children||[])root.PlayroomDOM.finishVisualEntry(node);el?.replaceChildren();}
 function valid(){const state=account.snapshot();return state.kind==='account'&&!state.recovery&&!document.hidden;}
 async function poll(){
  if(!valid())return;if(flight)return flight;
  lastRead=null;
  const ticket=generation,user=account.snapshot().id,roomId=root.PlayroomCloudNetwork?.roomId?.(),membership=new Map(groupEpochs);
  const run=(async()=>{
   let presentationChanged=false;
   try{const [counts,direct,groups]=await Promise.allSettled([service.call('unread',roomId?{roomId}:{}),service.call('inbox',cursor===null?{}:{after:cursor}),service.call('group-inbox',groupCursor===null?{}:{after:groupCursor})]);if(ticket!==generation)return;const totals=counts.status==='fulfilled'?counts.value:null,result=direct.status==='fulfilled'?direct.value:null,groupResult=groups.status==='fulfilled'?groups.value:null;if(Array.isArray(totals?.chats))root.PlayroomChatState.summary(totals.chats.filter(item=>!item.key.startsWith('group:')||currentGroup(item.key.slice(6),membership)));if(Array.isArray(totals?.friends)&&friendTracker){for(const item of friendTracker.update(totals.friends,[...forcedFriends])){root.PlayroomUIFeedback?.emit(item.kind==='friend-request'?'friend.request':'friend.accepted',{id:item.person.id});const key='friend:'+item.person.id;pending.set(key,{...item,key,expiresAt:Date.now()+10000});while(pending.size>3)pending.delete(pending.keys().next().value);}forcedFriends.clear();}if(totals?.roomUnavailable&&roomId)root.PlayroomCloudNetwork?.roomClosed?.(roomId);
    if(/^\d+$/.test(result?.cursor||'')){
    cursor=result.cursor;store.write(user,cursor);root.PlayroomCommunityUI?.acceptInbox(result.items);
    for(const item of result.items||[]){root.PlayroomUIFeedback?.emit(['invitation','group-invitation'].includes(item.kind)?'invitation':root.PlayroomQuickReactions?.valid(item.body)?'reaction':'message',{id:'dm:'+item.id,quiet:item.person.userId===root.PlayroomChatUI.currentUserId()||!!item.invitationState&&item.invitationState!=='active'});const inList=root.PlayroomReactionUI.listMessage('dm:'+item.person.userId,item.body);if(inList){presentationChanged=pending.delete(item.person.userId)||presentationChanged;continue;}if(item.invitationState&&item.invitationState!=='active')continue;if(item.person.userId===root.PlayroomChatUI.currentUserId())continue;
     pending.delete(item.person.userId);pending.set(item.person.userId,{...item,expiresAt:Date.now()+6000});while(pending.size>3)pending.delete(pending.keys().next().value);
    }
    }
    if(/^\d+$/.test(groupResult?.cursor||'')){
    groupCursor=groupResult.cursor;store.write(user+':groups',groupCursor);
    for(const item of groupResult.items||[]){if(!currentGroup(item.group?.id,membership))continue;root.PlayroomUIFeedback?.emit(item.invitationState?'invitation':root.PlayroomQuickReactions?.valid(item.body)?'reaction':'message',{id:'group:'+item.id,quiet:item.group?.id===root.PlayroomRoomChatUI.currentGroupId()||!!item.invitationState&&item.invitationState!=='active'});const inList=root.PlayroomReactionUI.listMessage('group:'+item.group?.id,item.body);if(inList){presentationChanged=pending.delete(item.person.userId)||presentationChanged;continue;}if(item.invitationState&&item.invitationState!=='active')continue;if(item.group?.id===root.PlayroomRoomChatUI.currentGroupId())continue;pending.delete(item.person.userId);pending.set(item.person.userId,{...item,expiresAt:Date.now()+6000});while(pending.size>3)pending.delete(pending.keys().next().value);}}
    if(pending.size||presentationChanged)render();
    await refreshInvitations(ticket);
    // Only lifecycle wake bursts may reuse this timestamp, never message data.
    // Explicit reads, reconnects and changed room ownership still fetch fresh.
    if(ticket===generation&&[counts,direct,groups].every(result=>result.status==='fulfilled'))lastRead={at:Date.now(),generation:ticket,roomId:roomId||null};

   }catch(_){/* Background failure keeps the last cursor; the next poll retries. */}
  })();flight=run;try{await run;}finally{if(flight===run)flight=null;}
 }
 async function refreshInvitations(ticket){
  const cache=root.PlayroomChatState,now=Date.now();
  const candidates=cache.invitationChats().filter(item=>{const previous=invitationChecks.get(item.key),count=cache.count(item.key).invites||0;return !previous||previous.failed||previous.count!==count||now-previous.at>=30000;}).sort((a,b)=>(invitationChecks.get(a.key)?.at||0)-(invitationChecks.get(b.key)?.at||0)).slice(0,8);
  await Promise.allSettled(candidates.map(async item=>{const check={count:cache.count(item.key).invites||0,at:now},owner=cache.get(item.key);invitationChecks.set(item.key,check);try{const group=item.key.startsWith('group:'),id=item.key.slice(item.key.indexOf(':')+1),result=await service.call(group?'group-read':'chat',{[group?'groupId':'userId']:id,after:item.after,known:item.known});if(ticket===generation&&cache.get(item.key)===owner)cache.refreshInvitations(item.key,result.messages||[],{historyAfter:result.historyAfter});}catch{if(ticket===generation&&cache.get(item.key)===owner)invitationChecks.set(item.key,{...check,failed:true});}}));
 }
 function schedule(){clearTimeout(timer);timer=null;if(!valid())return;timer=setTimeout(async()=>{timer=null;await poll();schedule();},5000);}
 function sync(){const state=account.snapshot(),key=state.kind+':'+state.id+':'+state.recovery;if(key!==identity){identity=key;generation++;flight=null;lastRead=null;forcedFriends.clear();friendTracker=state.kind==='account'?new root.PlayroomFriendNotifications({states:store.readFriends?.(state.id)||{},save:value=>store.writeFriends?.(state.id,value)}):null;cursor=state.kind==='account'?store.read(state.id):null;groupCursor=state.kind==='account'?store.read(state.id+':groups'):null;clear();invitationChecks.clear();groupEpochs.clear();void poll();}if(!timer)schedule();}
 function wake(event){const roomId=root.PlayroomCloudNetwork?.roomId?.()||null;if(valid()&&(event?.type==='online'||!lastRead||lastRead.generation!==generation||lastRead.roomId!==roomId||Date.now()-lastRead.at>=1000))void poll();schedule();}
 function init(ports){({account,service,store}=ports);account.subscribe(sync);sync();document.addEventListener('visibilitychange',wake);root.addEventListener('focus',wake);root.addEventListener('pageshow',wake);root.addEventListener('online',wake);}
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-ui-surface-exit]'))return;
  const close=event.target.closest('[data-notification-close]'),open=event.target.closest('[data-notification-open]');if(!close&&!open)return;
  const id=(close||open).dataset[close?'notificationClose':'notificationOpen'],item=pending.get(id);pending.delete(id);render();if(!open||!item)return;
  const onBack=root.PlayroomChatUI.captureReturn()||root.PlayroomRoomChatUI?.captureReturn()||root.PlayroomAppBridge.captureModalReturn();if(item.kind==='friend-request'||item.kind==='friend-accepted')root.PlayroomFriendProfileUI.show(item.person,{onBack});else if(item.group)root.PlayroomGroupUI.open(item.group,{onBack});else root.PlayroomChatUI.show(item.person,{onBack});
 });
 root.addEventListener('playroom:group-left',event=>{const id=event.detail?.groupId;if(typeof id!=='string'||!id)return;groupEpochs.set(id,(groupEpochs.get(id)||0)+1);const key='group:'+id;invitationChecks.delete(key);if(pending.delete(key))render();});
 root.addEventListener('playroom:group-chat-opened',event=>{if(pending.delete('group:'+event.detail.groupId))render();});
 root.addEventListener('playroom:chat-opened',event=>{if(pending.delete(event.detail.userId))render();});
 root.addEventListener('pagehide',()=>{generation++;flight=null;lastRead=null;clearTimeout(timer);timer=null;clear();});
 root.PlayroomChatNotifications=Object.freeze({friendEvent:event=>{forcedFriends.add(event);void poll();},init,poll});
})(globalThis);
