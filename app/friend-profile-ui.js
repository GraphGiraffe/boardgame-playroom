/* Shared friend and lobby participant profile; room actions keep their authority checks. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,C=()=>root.PlayroomCommunityUI,N=()=>root.PlayroomNetworkLibrary,t=k=>root.PlayroomMessages.text('ui.community.'+k);
 let current=null,busy=false,opening=0;
 function active(view){return current===view&&C().service.key()===view.identity&&document.querySelector('[data-friend-profile]');}
 function roomState(view){const ctx=N().inviteContext();if(!view.room||ctx?.room?.id!==view.room.id)return null;const room=ctx.room.ownerId===ctx.participantId?B().roomService.snapshot(ctx.room.id):ctx.room,person=room.participants.find(p=>p.id===view.room.target);return person?{room,person,me:ctx.participantId,host:room.ownerId===ctx.participantId}:null;}
 function canTransfer(view){const state=roomState(view),ctx=N().transferContext();return !!(state?.host&&ctx?.room.id===state.room.id&&ctx.peers.some(p=>p.id===state.person.id)&&!state.person.bot&&!state.person.local&&(state.room.phase==='lobby'&&!state.room.recovery||state.room.phase==='playing'&&['player','spectator','table'].includes(state.person.role)));}
 function profileMarkup(view){const f=view.friend,state=roomState(view),social=!!f.userId,esc=H().esc,self=f.userId===root.PlayroomAccountUI.service.snapshot().id;
  const friendship=!social||self?'':f.accepted?H().iconButton('data-profile-remove',t('remove-friend'),'trash',{className:'ui-action-danger',disabled:busy}):H().iconButton('data-profile-add',f.incoming?'Принять заявку':f.requested?'Заявка отправлена':'Добавить в друзья','addPlayer',{disabled:busy||f.requested&&!f.incoming});
  return `<div class="friend-profile-identity">${root.TabletopUI.avatar({name:f.nickname,avatar:f.avatar},0,{hidden:true})}<div><strong>${esc(f.nickname)}</strong>${f.username?`<p class="friend-profile-account">@${esc(f.username)}</p>`:''}<p class="friend-profile-status">${esc(view.room?(state?.person.role==='spectator'?'Зритель':state?.person.role==='table'?'Стол':'Игрок'):t(f.online?(f.game?'in-game':'online'):'offline'))}</p></div></div><div class="friend-profile-actions profile-icon-actions participant-profile-actions ui-action-row">${friendship}${social&&!self?H().iconButton('data-profile-chat','Открыть личный чат','chat',{disabled:busy}):''}${state?.host&&state.person.id!==state.me?H().iconButton('data-profile-transfer','Передать хоста','host-transfer',{disabled:busy||!canTransfer(view)}):''}${state?.host&&state.person.id!==state.me&&['lobby','playing'].includes(state.room.phase)?H().iconButton('data-profile-kick','Выгнать из комнаты','exit',{className:'ui-action-danger',disabled:busy}):''}${view.room?root.PlayroomTemporaryBotUI?.participantMarkup?.(view.room.target)||'':''}</div><p data-profile-message role="status">${esc(view.loading?'Загрузка профиля…':view.message||'')}</p>`;
 }
 function render(){const el=document.querySelector('[data-friend-profile]');if(current&&el)el.innerHTML=profileMarkup(current);}
 function show(friend,{onBack,room=null,message=''}={}){current={friend:{...friend},room,onBack,message,identity:C().service.key()};busy=false;const markup=profileMarkup(current);B().openModal(`${H().modalHead(room?'Участник комнаты':t('friend-profile'))}<div class="social-content" data-friend-profile>${markup}</div>`,'friend-profile-modal',{onBack:()=>{current=null;onBack?.();}});return current;}
 async function showParticipant(target){
  const ctx=N().inviteContext();if(!ctx?.room)return;const person=ctx.room.participants.find(p=>p.id===target);if(!person||person.bot)return;
  const ticket=++opening,identity=C().service.key(),source=document.querySelector('#modal-root .modal'),back=B().captureModalReturn();let friend={nickname:person.nickname,avatar:person.avatar,online:person.connected},message='';
  if(ctx.room.transportMode==='online')try{const result=await C().service.call('room-person',{roomId:ctx.cloudRoomId||root.PlayroomCloudNetwork.roomId(),participantId:target,owner:target===ctx.room.ownerId});friend={...friend,...result.person};}catch(error){message=root.PlayroomSocialUI.message(error);}
  if(ticket!==opening||document.querySelector('#modal-root .modal')!==source||C().service.key()!==identity||N().inviteContext()?.room?.id!==ctx.room.id)return;
  show(friend,{onBack:back,room:{id:ctx.room.id,target},message});
 }
 async function addFriend(friend){const identity=C().service.key();if(friend.accepted||(friend.requested||friend.id)&&!friend.incoming)return false;if(!await H().confirmDialog(root.PlayroomMessages.text('ui.community.add-confirm',{name:friend.nickname})))return false;if(C().service.key()!==identity)return false;await root.PlayroomSocialUI.service.perform(friend.incoming&&friend.id?'accept':'request',friend.incoming&&friend.id?{id:friend.id}:{userId:friend.userId});return true;}
 document.addEventListener('click',async event=>{
  const participant=event.target.closest('[data-room-person]');if(participant&&!event.target.closest('[data-quick-reaction]')){event.preventDefault();event.stopImmediatePropagation();void showParticipant(participant.dataset.roomPerson);return;}
  const button=event.target.closest('[data-profile-chat],[data-profile-add],[data-profile-remove],[data-profile-transfer],[data-profile-kick]'),view=current;if(!button||busy||!view||!active(view))return;busy=true;render();
  try{
   if(button.hasAttribute('data-profile-chat')){root.PlayroomChatUI.show(view.friend,{onBack:()=>show(view.friend,{onBack:view.onBack,room:view.room})});return;}
   if(button.hasAttribute('data-profile-transfer')){if(canTransfer(view))await root.PlayroomHostTransferUI.start(view.room.target);return;}
   if(button.hasAttribute('data-profile-kick')){const state=roomState(view);if(state?.host&&state.person.id!==state.me)B().kickLobbyParticipant(view.room.target);return;}
   if(button.hasAttribute('data-profile-add')){if(await addFriend(view.friend)&&active(view)){view.friend.requested=true;view.friend.accepted=!!view.friend.incoming;}}
   else if(await H().confirmDialog(root.PlayroomMessages.text('ui.community.remove-confirm',{name:view.friend.nickname}))&&active(view)){await root.PlayroomSocialUI.service.perform('remove',{id:view.friend.id});if(active(view)){view.friend.accepted=false;view.friend.requested=false;view.friend.id=null;}}
  }catch(error){if(active(view))view.message=root.PlayroomSocialUI.message(error);}finally{if(current===view){busy=false;if(active(view))render();}}
 },true);
 root.addEventListener('playroom:modal-restored',render);
 root.addEventListener('playroom:participant-control-updated',render);
 root.PlayroomFriendProfileUI=Object.freeze({show,showParticipant,addFriend});
})(globalThis);
