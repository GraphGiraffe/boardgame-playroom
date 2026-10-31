/* Cloud group navigation and membership; the conversation renderer is shared. */
(function(root){
 'use strict';const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,C=()=>root.PlayroomCommunityUI;
 let generation=0,busy=false,view=null,membersRead=0;const groups=new Map();
 const accountId=()=>root.PlayroomAccountUI.service.snapshot().id;
 const icon=()=>`<span class="group-avatar" aria-hidden="true">${H().icon('people')}</span>`;
 const identity=g=>`${root.PlayroomChatState.avatar('group:'+g.id,icon())}<span><strong>${H().esc(g.name)}</strong><small>Групповой чат${Number.isInteger(g.count)?' · '+g.count:''}</small></span>`;
 function close(){generation++;busy=false;view=null;groups.clear();}
 function row(group,{attrs=`data-group-open="${H().esc(group.id)}"`,actions=''}={}){return `<li class="community-friend" data-entity="group-${H().esc(group.id)}"><button type="button" class="lobby-seat occupied friend-card group-card" ${attrs}>${identity(group)}</button>${actions}</li>`;}
 function update(list,{replace=false,refreshMembers=true}={}){
  const before=view?.kind==='info'?groups.get(view.group.id)?.count:null;
  if(replace)groups.clear();for(const group of list)groups.set(group.id,{...groups.get(group.id),...group});
  for(const button of document.querySelectorAll('[data-group-info]')){const group=groups.get(button.dataset.groupInfo);if(group)root.PlayroomDOM.ListController.update(button,identity(group));}
  if(view?.kind==='info'){
   const group=groups.get(view.group.id),header=document.querySelector('.group-profile-identity');
   if(group&&header){view.group=group;root.PlayroomDOM.ListController.update(header,identity(group));if(refreshMembers&&group.count!==before)void loadMembers(group,generation);}
  }
  root.dispatchEvent(new CustomEvent('playroom:groups-updated',{detail:{accountId:accountId(),groups:[...groups.values()]}}));
 }
 function listMarkup(list,{rowsOnly=false}={}){for(const g of list)groups.set(g.id,g);const rows=list.map(g=>row(g)).join('')+`<li class="group-create-row">${H().button({attrs:'data-community-create-group',icon:'groupChat',label:'Создать группу',variant:'secondary'})}</li>`;return rowsOnly?rows:`<div class="social-list" tabindex="0" aria-label="Группы"><ul>${rows}</ul></div>`;}
 async function loadMembers(group,ticket){
  const request=++membersRead;
  try{const data=await C().service.call('group-info',{groupId:group.id});if(ticket!==generation||request!==membersRead||view?.kind!=='info')return;
   view.members=data.members;group={...group,showHistory:data.showHistory!==false,count:data.members.length};const toggle=document.querySelector('[data-group-history]');if(toggle)toggle.checked=group.showHistory;view.group=group;update([group],{refreshMembers:false});
   const list=document.querySelector('[data-group-members]');if(list)root.PlayroomDOM.ListController.update(list,'<ul>'+data.members.map(f=>root.PlayroomFriendCard.row(f,{attrs:`data-group-person="${H().esc(f.userId)}"`,openable:f.userId!==accountId()})).join('')+'</ul>');
  }catch(error){if(ticket===generation)message(root.PlayroomSocialUI.message(error));}
 }

 function open(group,{onBack=B().captureModalReturn()}={}){
  groups.set(group.id,group);const who=C().service.key();void C().prefetch().catch(()=>{});
  const source=()=>C().service.key()===who?{cloudGroup:true,roomId:group.id,roomName:group.name,game:{id:'group',name:group.name},connected:true,call:command=>C().service.call({'room-chat-read':'group-read','room-chat-send':'group-send','room-chat-seen':'group-seen'}[command.type],{...command,groupId:group.id})}:null;
  root.dispatchEvent(new CustomEvent('playroom:group-chat-opened',{detail:{groupId:group.id}}));
  root.PlayroomRoomChatUI.show({source,onReturn:onBack,identity:()=>`<button type="button" class="chat-person chat-header-person" data-group-info="${H().esc(group.id)}" aria-label="Информация о группе">${identity(groups.get(group.id)||group)}</button>`});
 }
 function message(text){const el=document.querySelector('[data-group-error]');if(el)el.textContent=text;}
 async function run(fn){if(busy)return;busy=true;const ticket=generation,who=C().service.key();try{await fn(()=>ticket===generation&&who===C().service.key());}catch(error){if(ticket===generation)message(root.PlayroomSocialUI.message(error));}finally{if(ticket===generation)busy=false;}}
 function create({onBack}={}){
  generation++;busy=false;view={kind:'create',nonce:crypto.randomUUID(),onBack};
  B().openModal(`${H().modalHead('Новая группа')}<div class="social-content"><form data-group-create><label class="field"><span>Название</span><input name="name" maxlength="48" required autocomplete="off" placeholder="Название группы"></label>${H().button({type:'submit',label:'Создать',icon:'people'})}</form><p data-group-error role="alert"></p></div>`,'group-create-modal',{onBack:()=>{generation++;busy=false;view=null;onBack?.();}});
 }
 async function info(group,{onBack}={}){
  const ticket=++generation;busy=false;view={kind:'info',group,onBack};
  B().openModal(`${H().modalHead('Группа')}<div class="social-content" data-group-profile><div class="friend-profile-identity group-profile-identity">${identity(group)}</div><label class="switch"><span>Показывать историю новым</span><input type="checkbox" data-group-history ${group.showHistory!==false?'checked':''}></label><div class="social-list" data-group-members tabindex="0" aria-label="Участники"><p>Загрузка…</p></div><div class="friend-profile-actions profile-icon-actions ui-action-row">${H().iconButton('data-group-leave','Выйти из группы','exit',{className:'ui-action-danger'})}${H().iconButton('data-group-add','Пригласить участника','addPlayer')}</div><p data-group-error role="alert"></p></div>`,'community-modal group-profile-modal',{size:'large',onBack:()=>{generation++;busy=false;view=null;onBack?.();}});
  await loadMembers(group,ticket);
 }
 async function invite(group,members,{onBack}={}){
  const ticket=++generation;busy=false;view={kind:'invite',group,members,onBack};
  B().openModal(`${H().modalHead('Пригласить в группу')}<div class="social-content" data-group-invite><div class="social-list" data-group-friends tabindex="0" aria-label="Друзья"><p>Загрузка…</p></div><p data-group-error role="status"></p></div>`,'community-modal group-invite-modal',{size:'large',onBack:()=>{generation++;busy=false;view=null;onBack?.();}});
  try{const hub=await C().service.call('hub',C().presence());if(ticket!==generation)return;const friends=hub.friends.filter(f=>f.accepted&&!members.some(m=>m.userId===f.userId));view.friends=friends;document.querySelector('[data-group-friends]').innerHTML=friends.length?'<ul>'+friends.map(f=>root.PlayroomFriendCard.row(f,{attrs:`data-group-invite-person="${H().esc(f.userId)}"`,openable:true})).join('')+'</ul>':'<p>Все друзья уже в группе.</p>';}catch(error){if(ticket===generation)message(root.PlayroomSocialUI.message(error));}
 }
 document.addEventListener('change',event=>{const input=event.target.closest('[data-group-history]');if(!input||view?.kind!=='info')return;const state=view;input.disabled=true;void run(async current=>{try{const result=await C().service.call('group-history',{groupId:state.group.id,enabled:input.checked});if(current())update([{...state.group,showHistory:result.showHistory}],{refreshMembers:false});}catch(error){input.checked=!input.checked;throw error;}finally{input.disabled=false;}});});
 document.addEventListener('submit',event=>{if(!event.target.matches('[data-group-create]'))return;event.preventDefault();const form=event.target,state=view;void run(async current=>{const group=await C().service.call('group-create',{id:state.nonce,name:form.elements.name.value.trim()});if(current())open(group,{onBack:()=>C().show({initialTab:'friends'})});});});
 document.addEventListener('click',event=>{
  const card=event.target.closest('[data-group-open]');if(card){if(card.closest('.is-ordering'))return;const group=groups.get(card.dataset.groupOpen);if(group)open(group);return;}
  const details=event.target.closest('[data-group-info]');if(details){const group=groups.get(details.dataset.groupInfo);if(group)void info(group,{onBack:root.PlayroomRoomChatUI.captureReturn()});return;}
  const state=view;if(!state)return;
  if(event.target.closest('[data-group-play]')){void run(()=>root.PlayroomLobbyNetwork.playWith({groupId:state.group.id}));return;}
  if(event.target.closest('[data-group-add]')){void invite(state.group,state.members||[],{onBack:()=>info(state.group,{onBack:state.onBack})});return;}
  if(event.target.closest('[data-group-leave]')){void run(async current=>{if(!await H().confirmDialog(`Выйти из группы «${state.group.name}»?`)||!current())return;await C().service.call('group-leave',{groupId:state.group.id});if(current()){root.dispatchEvent(new CustomEvent('playroom:group-left',{detail:{groupId:state.group.id}}));root.PlayroomRoomChatUI.close();C().show({initialTab:'friends'});}});return;}
  const member=event.target.closest('[data-group-person]');if(member){const f=state.members?.find(m=>m.userId===member.dataset.groupPerson);if(f)root.PlayroomChatUI.show(f,{onBack:()=>info(state.group,{onBack:state.onBack})});return;}
  const person=event.target.closest('[data-group-invite-person]');if(person){const f=state.friends?.find(m=>m.userId===person.dataset.groupInvitePerson);if(!f)return;void run(async current=>{if(!await H().confirmDialog(`Пригласить «${f.nickname}» в группу «${state.group.name}»?`)||!current())return;await C().service.call('group-invite',{groupId:state.group.id,userId:f.userId});if(current()){person.disabled=true;message('Приглашение отправлено.');}});}
 });
 root.addEventListener('playroom:modal-restored',()=>update([...groups.values()],{refreshMembers:false}));
 root.PlayroomGroupUI=Object.freeze({row,update,listMarkup,create,open,close});
})(globalThis);
