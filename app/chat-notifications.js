/* In-app message banners. Web Push and room transport are separate concerns. */
(function(root){
 'use strict';
 let account,service,store,identity='',cursor=null,groupCursor=null,timer=null,flight=null,generation=0,dismissTimer=null,lastRead=null;
 let friendTracker=null;const forcedFriends=new Set();
 const invitationChecks=new Map();
 const groupEpochs=new Map(),currentGroup=(id,epochs)=>(epochs.get(id)||0)===(groupEpochs.get(id)||0);
 const pending=new Map(),H=()=>root.PlayroomGameScreen;
 const notices=new Map();
 const invited=item=>['invitation','group-invitation'].includes(item.kind)||!!item.invitationState;
 function dismiss(id){pending.delete(id);render();}
 function openChat(item){const onBack=root.PlayroomChatUI.captureReturn()||root.PlayroomRoomChatUI?.captureReturn()||root.PlayroomAppBridge.captureModalReturn();if(item.kind==='friend-request'||item.kind==='friend-accepted')root.PlayroomFriendProfileUI.show(item.person,{onBack});else if(item.group)root.PlayroomGroupUI.open(item.group,{onBack});else root.PlayroomChatUI.show(item.person,{onBack});}
 function scheduleDismiss(){clearTimeout(dismissTimer);const finite=[...pending.values()].map(item=>item.expiresAt).filter(Number.isFinite);if(finite.length)dismissTimer=setTimeout(render,Math.max(1,Math.min(...finite)-Date.now()));}
 async function invitationDetails(id,item){if(pending.get(id)!==item||!valid()||item.detail||item.loading||!invited(item))return;const ticket=generation;item.loading=true;item.error='';render();try{const group=!!item.group,result=await service.call(group?'group-read':'chat',{[group?'groupId':'userId']:group?item.group.id:item.person.userId,after:(BigInt(item.id)-1n).toString(),known:[String(item.id)]});if(ticket!==generation||pending.get(id)!==item)return;const message=result.messages?.find(message=>String(message.id)===String(item.id));if(!message||!['invitation','group-invitation'].includes(message.kind))throw Error('Приглашение больше недоступно');item.detail=message;}catch(error){if(ticket===generation&&pending.get(id)===item)item.error=root.PlayroomMessages.error(error);}finally{if(ticket===generation&&pending.get(id)===item){item.loading=false;render();}}}
 function render(){const now=Date.now();for(const [id,item]of pending)if(item.expiresAt<=now)pending.delete(id);scheduleDismiss();for(const [id,notice]of notices)if(!pending.has(id)){notice.destroy({animate:true});notices.delete(id);}for(const [id,item]of pending){let notice=notices.get(id);if(!notice){notice=new root.PlayroomNotices.ExpandableNotice({key:'notification-'+id,onDismiss:()=>dismiss(id),onExpand:expanded=>{const current=pending.get(id);if(!current)return;current.expanded=expanded;current.expiresAt=expanded?Infinity:Date.now()+6000;scheduleDismiss();if(expanded&&invited(current))void invitationDetails(id,current);}});notices.set(id,notice);notice.summary.dataset.notificationOpen=id;notice.close.dataset.notificationClose=id;root.PlayroomDOM.enterVisual(notice.root);}
  if(notice.expanded)item.expiresAt=Infinity;
  const message=!invited(item)&&!['friend-request','friend-accepted'].includes(item.kind),invitation=invited(item),detail=item.detail,group=detail?.kind==='group-invitation',active=detail?.state==='active',joined=detail?.state==='joined',validOwner=()=>pending.get(id)===item&&valid(),actions=[];
  if(invitation){actions.push({id:'decline',label:'Отклонить',disabled:!active||item.loading||!!detail?.shared,run:async()=>{if(!validOwner())return;await service.call(group?'group-decline':'decline-invite',{inviteId:detail.inviteId});if(pending.get(id)===item)dismiss(id);}});actions.push({id:'join',label:group?'Принять':'Подключиться',disabled:(!active&&!joined)||item.loading,run:async()=>{if(!validOwner())return;let result;if(group){result=await service.call('group-accept',{inviteId:detail.inviteId});if(validOwner())root.PlayroomGroupUI.open(result,{onBack:root.PlayroomAppBridge.captureModalReturn()});}else result=await root.PlayroomLobbyNetwork.joinInvitation(detail.inviteId,{roomId:detail.roomId,ownerId:detail.roomOwnerId});if(result!==false&&pending.get(id)===item)dismiss(id);}});actions.push({id:'chat',label:'Перейти в чат',run:()=>{dismiss(id);openChat(item);}});if(item.error)actions.push({id:'retry',label:'Повторить',run:()=>invitationDetails(id,item)});}
  if(!message&&notice.chatComposer){notice.chatComposer.save();notice.content.replaceChildren();delete notice.chatComposer;}
  if(message){if(!notice.chatComposer)notice.chatComposer=new root.PlayroomNotificationChat.NotificationChat({notice,current:()=>pending.get(id),service,identity:()=>generation+':'+account.snapshot().id,valid:()=>pending.has(id)&&valid()});notice.chatComposer.update(item);actions.push({id:'chat',label:'Открыть чат',run:()=>{dismiss(id);openChat(item);}});}else if(!invitation)actions.push({id:'profile',label:'Открыть',run:()=>{dismiss(id);openChat(item);}});
  const preview=item.kind==='friend-request'?'Заявка в друзья':item.kind==='friend-accepted'?'Заявка в друзья принята':item.kind==='group-invitation'?'Приглашение в группу':invitation?'Приглашение в комнату':item.body;
  notice.update({version:item.id,title:item.person.nickname,summary:preview+(item.gameName?' · '+item.gameName:''),details:message?'':[detail?.gameName,detail?.roomName||detail?.groupName||item.body,item.loading?'Загрузка подробностей…':'',item.error,detail&&!active&&!joined?'Приглашение больше не активно':''].filter(Boolean).join('\n'),actions});if(invitation&&notice.expanded&&!item.detail&&!item.loading&&!item.error)queueMicrotask(()=>void invitationDetails(id,item));
 }}
 function clear(){clearTimeout(dismissTimer);root.PlayroomNotificationChat?.clearDrafts();root.PlayroomDOM.clearVisualExits(document);pending.clear();for(const notice of notices.values())notice.destroy();notices.clear();}
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
    for(const item of groupResult.items||[]){if(!currentGroup(item.group?.id,membership))continue;root.PlayroomUIFeedback?.emit(item.invitationState?'invitation':root.PlayroomQuickReactions?.valid(item.body)?'reaction':'message',{id:'group:'+item.id,quiet:item.group?.id===root.PlayroomRoomChatUI.currentGroupId()||!!item.invitationState&&item.invitationState!=='active'});const inList=root.PlayroomReactionUI.listMessage('group:'+item.group?.id,item.body);if(inList){presentationChanged=pending.delete('group:'+item.group.id)||presentationChanged;continue;}if(item.invitationState&&item.invitationState!=='active')continue;if(item.group?.id===root.PlayroomRoomChatUI.currentGroupId())continue;pending.delete('group:'+item.group.id);pending.set('group:'+item.group.id,{...item,expiresAt:Date.now()+6000});while(pending.size>3)pending.delete(pending.keys().next().value);}}
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
 root.addEventListener('playroom:group-left',event=>{const id=event.detail?.groupId;if(typeof id!=='string'||!id)return;groupEpochs.set(id,(groupEpochs.get(id)||0)+1);const key='group:'+id;invitationChecks.delete(key);if(pending.delete(key))render();});
 root.addEventListener('playroom:group-chat-opened',event=>{if(pending.delete('group:'+event.detail.groupId))render();});
 root.addEventListener('playroom:chat-opened',event=>{if(pending.delete(event.detail.userId))render();});
 root.addEventListener('pagehide',()=>{generation++;flight=null;lastRead=null;clearTimeout(timer);timer=null;clear();});
 root.PlayroomChatNotifications=Object.freeze({friendEvent:event=>{forcedFriends.add(event);void poll();},init,poll});
})(globalThis);
