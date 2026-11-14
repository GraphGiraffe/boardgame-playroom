/* Friends presentation. Account names live in the account dialog; rooms in lobby. */
(function(root){
 'use strict';
 let service,account,view=null,registry=null;
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 const identity=()=>({key:service.key(),generation:service.generation,kind:account.snapshot().kind});
 const sameOwner=state=>state?.service===service&&state.identity.key===service.key()&&state.identity.generation===service.generation;
 const current=state=>!!state&&view===state&&!state.disposed&&sameOwner(state)&&state.frame?.state!=='disposed';
 const active=state=>current(state)&&state.frame?.state==='active'&&!state.frame.element.closest('[inert]');
 const content=state=>current(state)?state.frame?.element.querySelector('[data-friends-dialog]'):null;
 function validOwner(state){return !!state&&!state.disposed&&(sameOwner(state)||state.awaitingAccount&&state.identity.kind!=='account'&&account.snapshot().kind==='account'&&!account.snapshot().recovery);}
 function invalidate(){registry||=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});registry.invalidate();}
 function usernameInput({value='',autocomplete='username',pattern=false}={}){return `<span class="username-editor"><span aria-hidden="true">@</span><input name="username" autocomplete="${autocomplete}" autocapitalize="none" spellcheck="false" maxlength="24" minlength="3" placeholder="..." ${pattern?'pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"':''} required value="${H().esc(value)}"></span>`;}
 document.addEventListener('input',event=>{const input=event.target;if(!input.matches('.username-editor input'))return;const value=input.value.replace(/^@+/,'');if(value!==input.value){const caret=input.selectionStart,removed=input.value.length-value.length;input.value=value;input.setSelectionRange(Math.max(0,caret-removed),Math.max(0,caret-removed));}if(active(view)&&content(view)?.contains(input)){const changed=view.query!==input.value;view.query=input.value;view.retry=null;if(changed){view.error='';view.notice='';view.results=null;view.next=null;view.resultQuery=null;render();}}});
 function relationship(person){return service.snapshot().friends.find(friend=>friend.userId===person.id);}
 function resultsMarkup(state){
  const esc=H().esc;if(state.results===null)return '';
  if(!state.results.length)return `<p data-friend-empty>${t('not-found')}</p>`;
  return state.results.map(person=>{
   const relation=relationship(person),incoming=relation?.incoming&&!relation.accepted,label=relation?.accepted?'Уже в друзьях':relation?.incoming?'Принять заявку':relation?'Заявка отправлена':'Добавить в друзья';
   const attrs=incoming?`data-friend-action="accept" data-id="${esc(relation.id)}"`:`data-friend-action="request" data-username="${esc(person.username)}"`;
   return `<div class="social-person" data-entity="friend-search-${esc(person.id)}"><span><button type="button" class="menu-row" data-friend-person="${esc(person.id)}" aria-label="Профиль ${esc(person.nickname)}"><span><strong>${esc(person.nickname)}</strong><small>@${esc(person.username)}</small></span>${H().icon('next')}</button></span><button type="button" class="text-btn" ${attrs} ${relation&&!incoming?'disabled':''}>${esc(label)}</button></div>`;
  }).join('')+(state.next?'<button type="button" class="text-btn" data-friend-action="more">Показать ещё</button>':'');
 }
 function render(){
  const state=view,host=content(state);if(!host)return;
  const a=account.snapshot(),signed=a.kind==='account'&&!a.recovery,busy=!!state.operation||service.snapshot().busy||a.busy;
  const status=state.error||state.notice||(state.operation?.kind==='search'?'Ищем человека…':busy?'Подождите завершения запроса…':'');
  root.PlayroomDOM.ListController.update(host,`<form data-friend-search data-inline-actions data-entity="friend-search"><label class="field"><span>Имя аккаунта</span>${usernameInput({value:state.query,autocomplete:'off'})}</label><p data-friend-message role="${state.error?'alert':'status'}" aria-live="polite">${H().esc(status)}</p>${H().button({label:state.retry?'Повторить поиск':signed?'Найти человека':'Войти и найти человека',icon:'search',type:'submit',attrs:state.retry?'data-friend-action="retry"':'',disabled:busy||state.query.trim().length<3})}</form>${signed?'':`<p>${t('friends-account')}</p><button type="button" class="menu-row" data-friend-action="account"><span>Войти или создать аккаунт</span>${H().icon('next')}</button>`}<div class="friend-search-results" aria-busy="${!!state.operation}">${resultsMarkup(state)}</div>`);
  for(const button of host.querySelectorAll('button'))if(busy)button.disabled=true;
 }
 function message(e){const key=['room-active','invalid','profile-required','forbidden','invite-invalid','owner-leave','friend-required','credentials','busy','username-invalid','username-taken','network','setup','account-required','account-changed','rate-limit','not-found','limit','lobby-required','host-busy','host-offline','room-password','invite-disabled'].includes(e.code)?e.code:'request';return t('error.'+key)+(key==='request'&&(e.serverCode||e.status)?' ('+[e.status?'HTTP '+e.status:'',e.serverCode||''].filter(Boolean).join(', ')+')':'');}
 async function execute(state,action,{kind='',query=null,append=false}={}){
  if(!active(state)||state.operation||service.busy||account.snapshot().busy)return;
  const operation={kind,query};state.operation=operation;state.error='';state.notice='';state.retry=null;if(kind==='search'&&!append){state.results=null;state.next=null;}render();
  try{
   const result=await action();if(!current(state)||state.operation!==operation)return;
   if(kind==='search'&&state.query.trim()===query){
    const people=append?[...(state.results||[]),...result.items]:result.items;state.results=[...new Map(people.map(person=>[person.id,person])).values()];
    const exact=query.replace(/^@+/,'').toLowerCase();state.results.sort((a,b)=>Number(b.username.toLowerCase()===exact)-Number(a.username.toLowerCase()===exact)||a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
    state.next=result.next;state.resultQuery=query;if(result.legacy)state.notice='На сервере пока доступен только поиск по точному имени.';
   }
   else if(kind==='friend')state.notice=t('saved');
  }catch(error){if(current(state)&&state.operation===operation&&(kind!=='search'||state.query.trim()===query)){state.error=['request','network'].includes(error.code)?kind==='search'?'Не удалось выполнить поиск. Проверьте соединение и повторите.':kind==='friend'?'Не удалось изменить заявку. Повторите действие.':message(error):message(error);if(kind==='search')state.retry=query;}}
  finally{if(state.operation===operation)state.operation=null;if(current(state))render();}
 }
 let nicknameFlight=null;
 async function syncNickname(){
  if(account.snapshot().kind!=='account'||account.snapshot().recovery)return;
  const nickname=B().profile()?.name||t('guest-name'),key=service.key()+':'+nickname;
  if(service.snapshot().profile?.nickname===nickname)return;
  if(nicknameFlight?.key===key)return nicknameFlight.promise;
  const promise=service.perform('profile',{nickname});nicknameFlight={key,promise};
  try{return await promise;}finally{if(nicknameFlight?.promise===promise)nicknameFlight=null;}
 }
 function search(state,append=false){const query=state.query.trim();if(query.length<3)return;if(append&&(!state.next||state.resultQuery!==query))return;const after=append?state.next:null;return execute(state,()=>service.perform('search',{username:query,...(after?{after}:{})}),{kind:'search',query,append});}
 function accountEntry(state,find=false){
  if(!active(state))return;state.awaitingAccount=true;
  root.PlayroomAccountUI.show({onReady:()=>{if(!active(state))return;state.awaitingAccount=false;render();if(find)void search(state);}});
 }
 function show({onBack}={}){
  const previous=view,state={service,identity:identity(),frame:null,disposed:false,query:'',results:null,next:null,resultQuery:null,error:'',notice:'',retry:null,operation:null,awaitingAccount:false};view=state;
  state.frame=B().openModal(`${B().modalHead(t('add-friend'))}<div class="social-content" data-friends-dialog></div>`,'friends-modal community-modal',{valid:()=>validOwner(state),onBack,onDispose:()=>{state.disposed=true;state.awaitingAccount=false;if(view===state)view=previous?.frame?.state!=='disposed'&&validOwner(previous)?previous:null;}});render();
  if(account.snapshot().kind==='account')void execute(state,()=>syncNickname());
 }
 function init({account:accountService,remote}){
  account=accountService;service=new root.PlayroomSocialService({account,remote});const ownedService=service;service.subscribe(()=>{if(service===ownedService){render();root.dispatchEvent(new CustomEvent('playroom:online-rooms-updated'));}});
  account.subscribe(()=>{
   if(service!==ownedService)return;const state=view;if(state&&!sameOwner(state)){
    if(state.awaitingAccount&&state.identity.kind!=='account'&&account.snapshot().kind==='account'&&!account.snapshot().recovery){state.identity=identity();state.results=null;state.error='';state.notice='';state.retry=null;state.operation=null;}
    else {state.disposed=true;invalidate();}
   }
   render();
  });
 }
 document.addEventListener('click',event=>{
  const state=view,button=event.target.closest('[data-friend-action],[data-friend-person]');if(!button||button.disabled||!active(state)||!content(state)?.contains(button)||state.operation||service.busy||account.snapshot().busy)return;
  if(button.hasAttribute('data-friend-person')){const person=state.results?.find(person=>person.id===button.dataset.friendPerson);if(!person)return;const relation=relationship(person);root.PlayroomFriendProfileUI.show({...person,id:relation?.id,userId:person.id,...relation},{onBack:B().captureModalReturn()});return;}
  const action=button.dataset.friendAction;
  if(action==='account'){accountEntry(state);return;}
  if(action==='more'){void search(state,true);return;}
  if(action==='retry'){event.preventDefault();void search(state);return;}
  if(action==='refresh'){void execute(state,()=>syncNickname());return;}
  if(!['request','accept','remove'].includes(action))return;
  const payload=action==='request'?{username:button.dataset.username}:{id:button.dataset.id};
  void execute(state,()=>service.perform(action,payload),{kind:'friend'});
 });
 document.addEventListener('submit',event=>{
  const state=view,form=event.target.closest('[data-friend-search]');if(!form||!active(state)||!content(state)?.contains(form))return;event.preventDefault();state.query=form.elements.username.value;
  if(account.snapshot().kind!=='account'||account.snapshot().recovery){accountEntry(state,true);return;}
  void search(state);
 });
 root.addEventListener('playroom:modal-restored',()=>{if(active(view)){view.awaitingAccount=false;render();}});
 root.PlayroomSocialUI=Object.freeze({init,show:()=>root.PlayroomCommunityUI.show(),showAdd:show,usernameInput,syncNickname,message,get service(){return service;}});
})(globalThis);
