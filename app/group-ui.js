/* Cloud group navigation and membership; the conversation renderer is shared. */
(function(root){
 'use strict';const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,C=()=>root.PlayroomCommunityUI;
 let generation=0,busy=false,view=null;const groups=new Map(),memberSnapshots=new Map();let memberOwner=null;
 const accountId=()=>root.PlayroomAccountUI.service.snapshot().id;
 const icon=()=>`<span class="group-avatar" aria-hidden="true">${H().icon('people')}</span>`;
 const identity=g=>`${root.PlayroomChatState.avatar('group:'+g.id,icon())}<span><strong>${H().esc(g.name)}</strong><small>Групповой чат${Number.isInteger(g.count)?' · '+g.count:''}</small></span>`;
 const activeHost=()=>document.getElementById('modal-root')?.querySelector(':scope>[data-surface-state=active]');
 const viewRoot=()=>view?.frame?view.frame.state==='disposed'?null:view.frame.element:activeHost(),find=selector=>viewRoot()?.querySelector(selector);
 const validView=state=>!!state&&!state.disposed&&state.service===C().service&&state.identity===C().service.key()&&state.revision===C().service.generation;
 const activeView=()=>validView(view)&&(!view.frame||view.frame.state==='active');
 function beginView(state){const previous=view;view={...state,previous,service:C().service,identity:C().service.key(),revision:C().service.generation,disposed:false,frame:null};return view;}
 function viewOptions(state,onBack){return {mode:'push',valid:()=>validView(state),onDispose:()=>{state.disposed=true;if(view===state){view=validView(state.previous)&&state.previous.frame?.state!=='disposed'?state.previous:null;generation++;busy=false;}},onBack};}
 function close(){generation++;busy=false;for(let state=view;state;state=state.previous)state.disposed=true;view=null;groups.clear();memberSnapshots.clear();memberOwner=null;}
 function row(group,{attrs=`data-group-open="${H().esc(group.id)}"`,actions=''}={}){return `<li class="community-friend" data-entity="group-${H().esc(group.id)}"><button type="button" class="lobby-seat occupied friend-card group-card" ${attrs}>${identity(group)}</button>${actions}</li>`;}
 function update(list,{replace=false,refreshMembers=true}={}){
  const before=view?.kind==='info'?groups.get(view.group.id)?.count:null;
  if(replace){const ids=new Set(list.map(group=>group.id));for(const id of memberSnapshots.keys())if(!ids.has(id))revokeMembers(id);groups.clear();}for(const group of list){groups.set(group.id,{...groups.get(group.id),...group});const cached=memberSnapshots.get(group.id);if(cached?.data&&typeof group.showHistory==='boolean')cached.data={...cached.data,showHistory:group.showHistory};}
  for(const button of document.querySelectorAll('[data-group-info]')){const group=groups.get(button.dataset.groupInfo);if(group)root.PlayroomDOM.ListController.update(button,identity(group));}
  if(view?.kind==='info'){
   const group=groups.get(view.group.id),header=find('.group-profile-identity');
   if(group&&header){view.group=group;root.PlayroomDOM.ListController.update(header,identity(group));if(refreshMembers&&group.count!==before)void loadMembers(view);}
  }
  root.dispatchEvent(new CustomEvent('playroom:groups-updated',{detail:{accountId:accountId(),groups:[...groups.values()]}}));
 }
 function listMarkup(list,{rowsOnly=false}={}){for(const g of list)groups.set(g.id,g);const rows=list.map(g=>row(g)).join('')+`<li class="group-create-row">${H().button({attrs:'data-community-create-group',icon:'groupChat',label:'Создать группу',variant:'secondary'})}</li>`;return rowsOnly?rows:`<div class="social-list" tabindex="0" aria-label="Группы"><ul>${rows}</ul></div>`;}
 function memberSnapshot(groupId){
  const service=C().service,key=service.key(),revision=service.generation;
  if(!memberOwner||memberOwner.service!==service||memberOwner.key!==key||memberOwner.revision!==revision){memberSnapshots.clear();memberOwner={service,key,revision};}
  if(!memberSnapshots.has(groupId))memberSnapshots.set(groupId,{owner:memberOwner,data:null,flight:null});
  return memberSnapshots.get(groupId);
 }
 function revokeMembers(groupId){
  memberSnapshots.delete(groupId);
  for(let state=view;state;state=state.previous)if(state.kind==='info'&&state.group.id===groupId){state.members=[];state.membersFresh=false;state.membersPending=false;state.membersError='Участники группы больше недоступны.';renderMembers(state);}
 }
 function renderMembers(state){
  if(!validView(state)||!state.frame||state.frame.state==='disposed')return;
  const host=state.frame.element,list=host.querySelector('[data-group-members]');if(!list)return;
  root.PlayroomDOM.ListController.update(list,state.members?'<ul>'+state.members.map(person=>memberRow(person,{disabled:!state.membersFresh})).join('')+'</ul>':'<p>Загрузка участников…</p>');
  list.setAttribute('aria-busy',String(!!state.membersPending));
  const status=host.querySelector('[data-group-members-status]');if(status)status.textContent=state.membersError||(state.membersPending&&state.members?'Обновляем участников…':'');
  const retry=host.querySelector('[data-group-members-retry]');if(retry)retry.hidden=!state.membersError||!!state.membersPending;
  for(const selector of ['[data-group-history]','[data-group-add]']){const button=host.querySelector(selector);if(button)button.disabled=!state.membersFresh||!!state.membersPending;}
 }
 async function loadMembers(state){
  if(!validView(state)||state.kind!=='info')return;
  const groupId=state.group.id,entry=memberSnapshot(groupId),request=state.membersRequest=(state.membersRequest||0)+1;
  const current=()=>validView(state)&&state.membersRequest===request&&memberSnapshots.get(groupId)===entry;
  state.membersPending=true;state.membersFresh=false;state.membersError='';renderMembers(state);
  if(!entry.flight){const flight=state.service.call('group-info',{groupId}).then(data=>{if(memberOwner===entry.owner&&memberSnapshots.get(groupId)===entry&&state.service===C().service&&state.identity===C().service.key()&&state.revision===C().service.generation)entry.data=data;return data;}).catch(error=>{if(memberOwner===entry.owner&&memberSnapshots.get(groupId)===entry&&state.service===C().service&&state.identity===C().service.key()&&state.revision===C().service.generation&&['forbidden','not-found','account-required','account-changed'].includes(error.code))revokeMembers(groupId);throw error;});entry.flight=flight;flight.finally(()=>{if(entry.flight===flight)entry.flight=null;}).catch(()=>{});}
  try{
   const data=await entry.flight;if(!current())return;
   state.members=data.members;state.membersFresh=true;state.group={...state.group,showHistory:data.showHistory!==false,count:data.members.length};
   const toggle=state.frame.element.querySelector('[data-group-history]');if(toggle)toggle.checked=state.group.showHistory;
   update([state.group],{refreshMembers:false});
  }catch(error){
   if(!current())return;
   if(['forbidden','not-found','account-required','account-changed'].includes(error.code))revokeMembers(groupId);
   else state.membersError='Не удалось обновить участников. Проверьте соединение и повторите.';
  }finally{if(validView(state)&&state.membersRequest===request){state.membersPending=false;renderMembers(state);}}
 }

 function open(group,{onBack=B().captureModalReturn()}={}){
  const groupId=group.id,service=C().service;groups.set(groupId,group);const who=service.key(),revision=service.generation;void C().prefetch().catch(()=>{});
  const source=()=>C().service===service&&service.key()===who&&service.generation===revision?{cloudGroup:true,roomId:groupId,roomName:group.name,game:{id:'group',name:group.name},connected:true,call:command=>{if(C().service!==service||service.key()!==who||service.generation!==revision)return Promise.reject(Object.assign(Error('account-changed'),{code:'account-changed'}));return service.call({'room-chat-read':'group-read','room-chat-send':'group-send','room-chat-seen':'group-seen','room-chat-react':'group-react'}[command.type],{...command,groupId});}}:null;
  root.dispatchEvent(new CustomEvent('playroom:group-chat-opened',{detail:{groupId:group.id}}));
  root.PlayroomRoomChatUI.show({source,onReturn:onBack,identity:()=>`<button type="button" class="chat-person chat-header-person" data-group-info="${H().esc(group.id)}" aria-label="Информация о группе">${identity(groups.get(group.id)||group)}</button>`});
 }
 function message(text){const el=find('[data-group-error]');if(el)el.textContent=text;}
 async function run(fn){if(busy)return;busy=true;const ticket=generation,who=C().service.key();try{await fn(()=>ticket===generation&&who===C().service.key());}catch(error){if(ticket===generation)message(root.PlayroomSocialUI.message(error));}finally{if(ticket===generation)busy=false;}}
 function personStatus(person){if(person.userId===accountId())return 'Вы';return person.accepted?(person.online?(person.game?'В игре':'Онлайн'):'Не в сети'):'Не в друзьях';}
 function personContent(person,status){return `${root.PlayroomChatState.avatar('dm:'+person.userId,root.TabletopUI.avatar({name:person.nickname,avatar:person.avatar},0,{hidden:true}))}<span class="group021-person-copy"><strong>${H().esc(person.nickname)}</strong><small>${H().esc(status)}</small></span>`;}
 function memberRow(person,{disabled=false}={}){const self=person.userId===accountId();return `<li data-entity="friend-${H().esc(person.userId)}"><button type="button" class="group021-person" data-group-person="${H().esc(person.userId)}" ${self||disabled?'disabled':''}>${personContent(person,personStatus(person))}${self?'':'<span class="group021-chevron" aria-hidden="true">›</span>'}</button></li>`;}
 function selectionRows(state){const query=(state.query||'').trim().toLocaleLowerCase();return state.friends.filter(f=>!query||[f.nickname,f.username].some(v=>String(v||'').toLocaleLowerCase().includes(query))).map(f=>`<li data-entity="group-select-${H().esc(f.userId)}"><label class="group021-person group021-choice">${personContent(f,state.sent.has(f.userId)?'Приглашение отправлено':personStatus(f))}<input type="checkbox" data-group-select="${H().esc(f.userId)}" aria-label="Выбрать ${H().esc(f.nickname)}" ${state.selected.has(f.userId)?'checked':''} ${state.sent.has(f.userId)||state.sending?'disabled':''}></label></li>`).join('');}
 function selectionUpdate(state){if(!activeView()||view!==state)return;const list=find('[data-group-friends]');if(list)root.PlayroomDOM.ListController.update(list,`<ul>${selectionRows(state)}</ul>${state.friends.length&&!selectionRows(state)?'<p>Никого не найдено. Измените поиск.</p>':''}${!state.friends.length?'<p>Нет друзей для приглашения.</p>':''}`);const button=find('[data-group-submit]'),count=state.selected.size;if(button){button.disabled=state.sending||(!state.createdGroup&&state.kind==='create'&&!find('[name=name]')?.value.trim())||(state.kind==='invite'&&!count);button.textContent=state.sending?'Отправляем…':state.createdGroup?'Повторить приглашения':state.kind==='create'?'Создать группу':`Пригласить${count?' · '+count:''}`;}const counter=find('[data-group-selected]');if(counter)counter.textContent=count?'Выбрано: '+count:'';}
 async function loadFriends(state){const ticket=generation;try{const hub=await C().service.call('hub',C().presence());if(ticket!==generation||!validView(state))return;state.friends=hub.friends.filter(f=>f.accepted&&f.userId!==accountId()&&!state.members?.some(m=>m.userId===f.userId));selectionUpdate(state);}catch(error){if(ticket===generation){message(root.PlayroomSocialUI.message(error));const list=find('[data-group-friends]');if(list)list.innerHTML='<p>Не удалось загрузить друзей.</p><button type="button" class="group021-action" data-group-friends-retry>Повторить</button>';}}}
 function selectionMarkup(){return `<label class="field group021-search"><span>Участники</span><input type="search" data-group-search placeholder="Найти друга" autocomplete="off"></label><div class="group021-people" data-group-friends aria-label="Друзья"><p role="status">Загрузка друзей…</p></div><p class="group021-selected" data-group-selected role="status"></p>`;}
 function create({onBack}={}){
  generation++;busy=false;const state=beginView({kind:'create',nonce:crypto.randomUUID(),onBack,selected:new Set(),sent:new Set(),friends:[],query:''});
  state.frame=B().openModal(`${H().modalHead('Новая группа')}<div class="group021-content"><form data-group-create data-inline-actions><label class="field"><span>Название группы</span><input name="name" maxlength="48" required autocomplete="off" placeholder="Название группы"></label>${selectionMarkup()}<p class="group021-hint">Друзья получат приглашение и присоединятся после подтверждения.</p><button type="submit" class="btn group021-primary" data-group-submit disabled>Создать группу</button><button type="button" class="group021-action" data-group-open-created hidden>Открыть созданную группу</button></form><p data-group-error role="alert"></p></div>`,'community-modal group-create-modal group021',{...viewOptions(state,onBack),size:'large'});void loadFriends(state);
 }
 async function info(group,{onBack}={}){
  generation++;busy=false;const cached=memberSnapshot(group.id).data;const state=beginView({kind:'info',group:{...group,...(cached?{showHistory:(group.showHistory??cached.showHistory)!==false,count:cached.members.length}:{})},onBack,members:cached?.members||null,membersFresh:false});group=state.group;
  state.frame=B().openModal(`${H().modalHead('Группа')}<div class="group021-content" data-group-profile><div class="group021-identity group-profile-identity">${identity(group)}</div><button type="button" class="group021-action" data-group-add disabled>${H().icon('addPlayer')}<span>Пригласить участников</span><span class="group021-chevron" aria-hidden="true">›</span></button><section aria-labelledby="group021-members-title"><h3 id="group021-members-title">Участники</h3><div class="group021-people" data-group-members aria-label="Участники"><p role="status">Загрузка участников…</p></div><p data-group-members-status role="status" aria-live="polite"></p><button type="button" class="group021-action" data-group-members-retry hidden>Повторить</button></section><label class="ui-switch group021-history"><span>История для новых участников<small>Сообщения до вступления в группу</small></span><input type="checkbox" data-group-history disabled ${group.showHistory!==false?'checked':''}></label><button type="button" class="group021-action group021-danger" data-group-leave>${H().icon('exit')}<span>Выйти из группы</span></button><p data-group-error role="alert"></p></div>`,'community-modal group-profile-modal group021',{...viewOptions(state,onBack),size:'large'});
  await loadMembers(state);
 }
 async function invite(group,members,{onBack}={}){
  generation++;busy=false;const state=beginView({kind:'invite',group,members,onBack,selected:new Set(),sent:new Set(),friends:[],query:''});
  state.frame=B().openModal(`${H().modalHead('Пригласить участников')}<div class="group021-content" data-group-invite><p class="group021-hint">В группу «${H().esc(group.name)}»</p><form data-group-invite-form data-inline-actions>${selectionMarkup()}<p class="group021-hint">Участники присоединятся после подтверждения.</p><button type="submit" class="btn group021-primary" data-group-submit disabled>Пригласить</button></form><p data-group-error role="status"></p></div>`,'community-modal group-invite-modal group021',{...viewOptions(state,onBack),size:'large'});await loadFriends(state);
 }
 async function submitSelection(state,form){await run(async current=>{
  state.sending=true;selectionUpdate(state);message('');let failure='';
  try{
   if(state.kind==='create'&&!state.createdGroup){state.createdGroup=await C().service.call('group-create',{id:state.nonce,name:form.elements.name.value.trim()});if(!current())return;form.elements.name.readOnly=true;}
   const group=state.createdGroup||state.group;
   for(const userId of [...state.selected]){if(!current())return;try{await C().service.call('group-invite',{groupId:group.id,userId});if(!current())return;state.sent.add(userId);state.selected.delete(userId);}catch(error){failure=root.PlayroomSocialUI.message(error);}}
   if(!current())return;
   if(failure){message(`${state.kind==='create'?'Группа создана. ':''}Не все приглашения отправлены. ${failure}`);const openCreated=find('[data-group-open-created]');if(openCreated)openCreated.hidden=false;}
   else if(state.kind==='create'){open(group,{onBack:()=>C().show({initialTab:'chats'})});}
   else message(state.sent.size?'Приглашения отправлены. Участники присоединятся после подтверждения.':'Выберите друзей для приглашения.');
  }finally{state.sending=false;if(current())selectionUpdate(state);}
 });}
 document.addEventListener('change',event=>{const input=event.target.closest('[data-group-history]');if(!input||view?.kind!=='info'||!activeView())return;const state=view;input.disabled=true;void run(async current=>{try{const result=await C().service.call('group-history',{groupId:state.group.id,enabled:input.checked});if(current())update([{...state.group,showHistory:result.showHistory}],{refreshMembers:false});}catch(error){input.checked=!input.checked;throw error;}finally{input.disabled=false;}});});
 document.addEventListener('input',event=>{if(!activeView()||!['create','invite'].includes(view?.kind))return;if(event.target.matches('[data-group-search]')){view.query=event.target.value;selectionUpdate(view);}else if(event.target.matches('[name=name]'))selectionUpdate(view);});
 document.addEventListener('change',event=>{const input=event.target.closest('[data-group-select]');if(!input||!activeView()||view.sending)return;if(input.checked)view.selected.add(input.dataset.groupSelect);else view.selected.delete(input.dataset.groupSelect);selectionUpdate(view);});
 document.addEventListener('submit',event=>{if(!event.target.matches('[data-group-create],[data-group-invite-form]')||!activeView())return;event.preventDefault();void submitSelection(view,event.target);});
 document.addEventListener('click',event=>{
  const card=event.target.closest('[data-group-open]');if(card){if(card.closest('.is-ordering'))return;const group=groups.get(card.dataset.groupOpen);if(group)open(group);return;}
  const details=event.target.closest('[data-group-info]');if(details){const group=groups.get(details.dataset.groupInfo);if(group)void info(group,{onBack:root.PlayroomRoomChatUI.captureReturn()});return;}
  const state=view;if(!state||!activeView())return;
  if(event.target.closest('[data-group-friends-retry]')){void loadFriends(state);return;}
  if(event.target.closest('[data-group-members-retry]')){void loadMembers(state);return;}
  if(event.target.closest('[data-group-open-created]')){if(state.createdGroup)open(state.createdGroup,{onBack:()=>C().show({initialTab:'chats'})});return;}
  if(event.target.closest('[data-group-add]')){if(!state.membersFresh||state.membersPending)return;void invite(state.group,state.members||[],{onBack:B().captureModalReturn()});return;}
  if(event.target.closest('[data-group-leave]')){void run(async current=>{if(!await H().confirmDialog(`Выйти из группы «${state.group.name}»?`)||!current())return;await C().service.call('group-leave',{groupId:state.group.id});if(current()){root.dispatchEvent(new CustomEvent('playroom:group-left',{detail:{groupId:state.group.id}}));root.PlayroomRoomChatUI.close({groupId:state.group.id});C().show({initialTab:'chats'});}});return;}
  const member=event.target.closest('[data-group-person]');if(member){if(!state.membersFresh||state.membersPending)return;const f=state.members?.find(m=>m.userId===member.dataset.groupPerson);if(f)root.PlayroomChatUI.show(f,{onBack:B().captureModalReturn()});return;}

 });
 root.addEventListener('playroom:group-left',event=>{if(event.detail?.groupId)revokeMembers(event.detail.groupId);});
 root.addEventListener('playroom:modal-restored',()=>update([...groups.values()],{refreshMembers:false}));
 root.PlayroomGroupUI=Object.freeze({row,update,listMarkup,create,open,close});
})(globalThis);
