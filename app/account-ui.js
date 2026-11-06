/* Account dialog and events. Provider calls and credentials belong to the adapter. */
(function(root){
 'use strict';
 let service=null,mode='login',notice='',error='',opened=false,continuation=null,batch=null,dialogGeneration=0,viewRevision=0,logoutPending=false,surface=null,drafts=Object.create(null),emailDraft='',lastIdentity='',invalidFocus=null;
 const text=key=>root.PlayroomMessages.text('ui.account.'+key),H=()=>root.PlayroomGameScreen,bridge=()=>root.PlayroomAppBridge;
 const activeHost=()=>document.getElementById('modal-root')?.querySelector(':scope>[data-surface-state=active]'),accountRoot=()=> (surface?surface.state==='disposed'?null:surface.element:activeHost())?.querySelector('.account-modal'),interactive=()=>!!accountRoot()&&(!surface||surface.state==='active');
 function status(){const s=service?.snapshot();return !s?.configured?'unavailable':root.navigator.onLine===false?'offline':s.busy?'busy':s.error?'error':s.kind==='account'?'account':s.kind==='guest'?'guest':'local';}
 const statusIcons={unavailable:'cloud-off',offline:'cloud-off',busy:'cloud-sync',error:'cloud-alert',account:'cloud-check',guest:'cloud',local:'cloud'};
 function accountEntryLabel(){return service?.snapshot().kind==='account'?'Облачный аккаунт':'Войти в облако';}
 function accountEntryContent(state,labelled){return H().icon(statusIcons[state])+(labelled?`<span data-account-entry-label>${H().esc(accountEntryLabel())}</span>`:'');}
 function markup({labelled=false}={}){const state=status(),label=text('title')+' · '+text('status.'+state);return labelled?`<button type="button" class="btn secondary" data-account-open data-account-labelled data-account-status="${state}" aria-label="${H().esc(accountEntryLabel()+' · '+text('status.'+state))}">${accountEntryContent(state,true)}</button>`:H().iconButton(`data-account-open data-account-status="${state}"`,label,statusIcons[state],{className:'account-status-button'});}
 function updateButtons(){for(const label of document.querySelectorAll('[data-profile-play-label]'))label.textContent=service?.snapshot().kind==='account'?'Играть':'Играть без облака';const state=status(),label=text('title')+' · '+text('status.'+state);for(const button of document.querySelectorAll('[data-account-open]')){const labelled=button.hasAttribute('data-account-labelled');button.dataset.accountStatus=state;button.setAttribute('aria-label',labelled?accountEntryLabel()+' · '+text('status.'+state):label);button.title=label;button.innerHTML=accountEntryContent(state,labelled);}}
 const authModes=['login','signup','recover'],authLabels=['Войти','Регистрация','Восстановить'];
 function clearDrafts(){drafts=Object.create(null);emailDraft='';lastIdentity='';}
 function rememberForm(){
  const form=accountRoot()?.querySelector('[data-account-form]');if(!form)return;
  drafts[form.dataset.accountForm]=Object.fromEntries([...form.elements].filter(input=>input.name&&typeof input.value==='string').map(input=>[input.name,input.value]));
  if(form.elements.email)emailDraft=form.elements.email.value;
 }
 function restoreForm(form,state){
  if(!form)return;const values=drafts[form.dataset.accountForm]||{};
  for(const input of form.elements)if(input.name){if(input.name==='email')input.value=emailDraft||state.email||values.email||'';else if(Object.hasOwn(values,input.name))input.value=values[input.name];}
 }
 function authTabs(){return H().pageTabs({label:'Действие с аккаунтом',tabs:authModes.map((action,i)=>[action,authLabels[i]]),value:mode,attribute:'data-account-mode',buttonAttrs:'data-account-tab aria-controls="account-form-panel"',idPrefix:'account-tab-',className:'account-mode-tabs'});}
 function render(){
  if(!opened||!accountRoot())return;
  const profile=root.PlayroomSocialUI.service.snapshot().profile;
  const s={...service.snapshot(),busy:service.busy||(mode==='username'&&root.PlayroomSocialUI.service.busy)},esc=H().esc;
  const identity=s.kind+':'+s.id+':'+!!s.recovery;
  const identityChanged=!!lastIdentity&&lastIdentity!==identity;
  if(identityChanged){clearDrafts();if(!s.recovery)mode='login';}
  lastIdentity=identity;
  const field=(name,type,autocomplete,label=name)=>`<label class="field"><span>${text(label)}</span><input name="${name}" type="${type}" autocomplete="${autocomplete}" ${type==='email'?'inputmode="email" autocapitalize="off" spellcheck="false"':''} required ${type==='password'?`minlength="${autocomplete==='current-password'?1:8}" maxlength="256"`:'maxlength="254"'}></label>`;
  const accountRow=(action,label)=>`<button type="button" class="menu-row ${action==='logout'?'ui-action-danger':''}" data-account-mode="${action}" ${s.busy?'disabled':''}><span>${label}</span>${H().icon(({username:'edit','password-change':'lock',recover:'undo',logout:'exit',account:'player'})[action]||'player')}</button>`;
  const accountView=s.kind==='account'&&!s.recovery&&mode!=='password-change'&&mode!=='username'&&mode!=='recover';
  const passwordMode=mode==='password-change'||s.recovery,guestModes=!s.recovery&&s.kind!=='account'&&authModes.includes(mode);
  const feedback='<p class="account-message" role="status" aria-live="polite"></p>';
  let body;
  if(!s.configured)body=`<p>${text('unavailable')}</p>`;
  else if(accountView)body=`<div class="account-identity">${profile?.username?`<strong>@${esc(profile.username)}</strong>`:''}<span class="muted">${esc(s.email)}</span></div><nav class="menu-list account-actions" aria-label="Управление аккаунтом">${accountRow('username','Никнейм и имя аккаунта')}${accountRow('password-change',text('change-password'))}${accountRow('recover',text('recover'))}${accountRow('logout',text('logout'))}<div class="menu-row"><span>Уведомления</span><span data-push-settings>${root.PlayroomPushUI.markup()}</span></div></nav><div data-cloud-settings>${root.PlayroomCloudSavesUI.settings()}</div>`;
  else if(mode==='username'&&!s.recovery&&s.kind==='account')body=`<form class="account-form" data-account-form="username"><fieldset><label class="field"><span>Никнейм</span><input name="nickname" autocomplete="nickname" maxlength="24" required value="${esc(bridge().profile()?.name||profile?.nickname||'')}"></label><label class="field"><span>${text('username')}</span>${root.PlayroomSocialUI.usernameInput({value:profile?.username||'',pattern:true})}</label><p class="account-hint">Никнейм виден в партии. По имени аккаунта вас могут найти друзья.</p><div class="account-feedback-action">${feedback}${H().button({type:'submit',label:text('save-username'),icon:'check'})}</div></fieldset></form><nav class="menu-list">${accountRow('account','К аккаунту')}</nav>`;
  else{
   if(s.recovery)mode='password';
   const caption=mode==='signup'?'Имя аккаунта понадобится друзьям, чтобы найти вас.':mode==='recover'?'Отправим письмо со ссылкой для восстановления пароля.':continuation?'После входа вернёмся к приглашению или выбранной игре.':'Аккаунт нужен для онлайн-игры и облачных сохранений.';
   body=`${guestModes?authTabs():''}${passwordMode?`<p class="account-hint">${text('password-info')}</p>`:`<p class="account-hint">${caption}</p>`}<section id="account-form-panel" ${guestModes?`role="tabpanel" aria-labelledby="account-tab-${mode}"`:''}><form data-account-form="${mode}" class="account-form"><fieldset ${s.busy?'disabled':''}>${mode==='signup'?`<label class="field"><span>${text('username')}</span>${root.PlayroomSocialUI.usernameInput({pattern:true})}<small class="account-field-hint">3–24: латиница, цифры, _. Начните с буквы.</small></label>`:''}${passwordMode?'':field('email','email','email')}${mode==='password-change'?field('current-password','password','current-password'):''}${mode==='recover'?'':field('password','password',mode==='login'?'current-password':'new-password',passwordMode?'new-password':'password')}${mode==='signup'?'<small class="account-field-hint">Пароль — не менее 8 символов.</small>':''}<div class="account-feedback-action">${feedback}${H().button({type:'submit',label:text(s.busy?'waiting':passwordMode?'save-password':mode)})}</div></fieldset></form></section>${guestModes?`<nav class="menu-list"><button type="button" class="menu-row" data-account-guest><span>Пока играть без аккаунта</span><span aria-hidden="true">›</span></button></nav>`:mode==='password'?'':`<nav class="menu-list">${accountRow('account','К аккаунту')}</nav>`}`;
  }
  const modal=accountRoot()?.querySelector('.account-content');if(!modal)return;
  const view=(!s.configured?'unavailable':accountView?'account:'+(profile?.username||''):'form:'+mode+(mode==='username'?':'+(profile?.username||''):''))+':'+identity;
  if(modal.dataset.accountView!==view){
   if(accountView){drafts=Object.create(null);emailDraft=s.email||'';}else if(!identityChanged)rememberForm();
   modal.innerHTML=body+(accountView||!s.configured?feedback:'');modal.dataset.accountView=view;restoreForm(modal.querySelector('form'),s);
  }
  // Busy/error updates retain the real inputs, autofill, focus and native selection.
  const fieldset=modal.querySelector('fieldset');if(fieldset)fieldset.disabled=s.busy;
  for(const button of modal.querySelectorAll('[data-account-mode],[data-account-guest]'))button.disabled=s.busy;
  const submit=modal.querySelector('button[type=submit]');if(submit){const label=submit.querySelector('.ui-button-label'),caption=text(s.busy?'waiting':mode==='username'?'save-username':passwordMode?'save-password':mode);if(label)label.textContent=caption;submit.setAttribute('aria-label',caption);}
  modal.setAttribute('aria-busy',String(s.busy));
  const message=modal.querySelector('.account-message'),changed=message.textContent!==(error||notice);message.setAttribute('role',error?'alert':'status');message.textContent=error||notice;if(changed&&(error||notice)&&interactive())(message.closest('.account-feedback-action')||message).scrollIntoView({block:'nearest',behavior:'instant'});
 }

 function navigate(next){viewRevision++;mode=next;notice='';error='';render();}
 function beforeBack(){
  const state=service?.snapshot();
  if(!interactive()||state?.kind!=='account'||state.recovery||!['username','password-change','recover'].includes(mode))return false;
  const previous=mode;navigate('account');accountRoot()?.querySelector('[data-account-mode="'+previous+'"]')?.focus({preventScroll:true});return true;
 }
 function validityFeedback(form,input){
  const message=form.querySelector('.account-message');if(!message)return;
  message.id||='account-validation-'+(surface?.id||dialogGeneration);
  for(const field of form.elements){const ids=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==message.id);if(field===input)ids.push(message.id);if(ids.length)field.setAttribute('aria-describedby',ids.join(' '));else field.removeAttribute('aria-describedby');}
  error=input?.validationMessage||'';notice='';render();
 }
 async function execute(action,success='',{notify=false}={}){
  const ticket=dialogGeneration,revision=viewRevision,current=()=>ticket===dialogGeneration&&revision===viewRevision&&opened;error='';notice='';
  try{const result=await action(current);if(ticket!==dialogGeneration||revision!==viewRevision)return;if(success)notice=text(success);if(result?.confirmationRequired)notice=text('confirmation');if(current()&&interactive()&&continuation&&service.snapshot().kind==='account'&&!service.snapshot().recovery){const resume=continuation;continuation=null;bridge().closeModal();resume();}}
  catch(e){if(ticket!==dialogGeneration||revision!==viewRevision)return;error=text('error.'+(['timeout','email-rate-limit','email-sender-unavailable','network','storage','rate-limit','credentials','email-not-confirmed','recovery-link','unavailable','redirect','same-password','weak-password','current-password','reauthentication','username-invalid','username-taken','setup','network'].includes(e.code)?e.code:'request'));if(notify&&!accountRoot())bridge().toast(error);}
  render();
 }
 async function logout(){
  const before=service?.snapshot();if(logoutPending||before?.busy||before?.kind!=='account')return;
  const ticket=dialogGeneration,owner=before.id;logoutPending=true;
  try{
   if(!await H().confirmDialog('Выйти из облачного аккаунта? Локальные партии останутся на устройстве.')||ticket!==dialogGeneration||service.snapshot().kind!=='account'||service.snapshot().id!==owner)return;
   await execute(async current=>{await root.PlayroomPushUI.beforeLogout();if(service.snapshot().kind!=='account'||service.snapshot().id!==owner)return;await service.logout();if(current())mode='login';},'signed-out',{notify:true});
  }finally{logoutPending=false;}
 }
 function show({onReady=null}={}){
  const back=bridge().captureModalReturn(),trigger=document.activeElement;dialogGeneration++;clearDrafts();continuation=onReady;opened=true;mode='login';error='';notice='';
  const surfaceTicket=dialogGeneration;surface=bridge().openModal(`${bridge().modalHead('Аккаунт')}<nav class="menu-list" aria-label="Профиль на устройстве"><button type="button" class="menu-row" data-command="profile-edit"><span>Имя и аватар</span>${H().icon('player')}</button></nav><div class="account-content"></div>`,'account-modal',{beforeBack,valid:()=>opened&&surfaceTicket===dialogGeneration,onDispose:()=>{if(surfaceTicket===dialogGeneration){dialogGeneration++;opened=false;continuation=null;surface=null;clearDrafts();}},onBack:()=>{dialogGeneration++;opened=false;continuation=null;clearDrafts();back();if(trigger?.isConnected&&!document.querySelector('#modal-root>*'))trigger.focus({preventScroll:true});}});render();
  void syncAccount();
  if(service.snapshot().configured&&!service.snapshot().recovery&&!service.snapshot().busy)void execute(()=>service.restore({ifNeeded:true}));
 }
 function init(){
  let auth=null;try{if(root.PlayroomNetworkConfig?.url)auth=new root.PlayroomSupabaseAuth.SupabaseAuth(root.PlayroomNetworkConfig);}catch(_){}
  service=new root.PlayroomAccountService({auth,guestId:()=>bridge().profile()?.id});
  if(auth)batch=new root.PlayroomAccountSyncService({account:service,remote:new root.PlayroomSupabaseSocial({auth,rpc:'playroom_account_sync'})});
  const remote=rpc=>auth?new root.PlayroomSupabaseSocial({auth,rpc,batch}):null;
  root.PlayroomSocialUI.init({account:service,remote:remote('playroom_social')});
  root.PlayroomCommunityUI.init({account:service,remote:remote('playroom_online')});
  root.PlayroomPushUI.init({account:service,remote:remote('playroom_push')});
  root.PlayroomCloudSavesUI.init({account:service,remote:remote('playroom_cloud_saves_rpc')});
  root.PlayroomHostTransferUI.init({account:service,remote:auth?new root.PlayroomSupabaseSocial({auth,rpc:'playroom_host_transfer'}):null});
  root.PlayroomLobbyNetwork.init();
  if(auth)root.PlayroomCloudNetwork.init({account:service,remote:new root.PlayroomSupabaseSocial({auth,rpc:'playroom_signal'})});
  service.subscribe(()=>{updateButtons();render();root.dispatchEvent(new Event('playroom:profile-identity-updated'));});
  root.PlayroomSocialUI.service.subscribe(render);
  let syncIdentity=service.snapshot().kind+':'+service.snapshot().id;
  service.subscribe(()=>{const next=service.snapshot().kind+':'+service.snapshot().id;if(next!==syncIdentity){syncIdentity=next;void syncAccount();}});
  void syncAccount();root.addEventListener('online',()=>void syncAccount());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncAccount();});
  root.addEventListener('online',updateButtons);root.addEventListener('offline',updateButtons);root.addEventListener('playroom:modal-restored',updateButtons);
  if(auth?.hasCallback()){
   opened=true;const surfaceTicket=dialogGeneration;surface=bridge().openModal(`${bridge().modalHead('Аккаунт')}<nav class="menu-list" aria-label="Профиль на устройстве"><button type="button" class="menu-row" data-command="profile-edit"><span>Имя и аватар</span>${H().icon('player')}</button></nav><div class="account-content"></div>`,'account-modal',{beforeBack,valid:()=>opened&&surfaceTicket===dialogGeneration,onDispose:()=>{if(surfaceTicket===dialogGeneration){dialogGeneration++;opened=false;continuation=null;surface=null;clearDrafts();}}});render();
   void execute(()=>service.callback(),'confirmed');
  }
 }
 async function syncAccount(){
  const state=service?.snapshot();if(state?.kind!=='account'||state.recovery||!batch)return;
  const reads=[root.PlayroomCommunityUI.prefetch(),root.PlayroomChatNotifications.poll(),root.PlayroomCloudSavesUI.refresh(),batch.request('playroom_social','list',{}, {userId:state.id}).then(data=>root.PlayroomSocialUI.service.acceptSync(data,state.id))];
  if(root.PlayroomPushDevice.supported())reads.push(batch.request('playroom_push','config',{}, {userId:state.id}));
  await Promise.allSettled(reads);
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-surface-state="suspended"]'))return;
  if(event.target.closest('[data-account-guest]')&&interactive()){bridge().closeModal();return;}
  if(event.target.closest('[data-account-open]')){show();return;}
  if(event.target.closest('[data-account-logout]')){void logout();return;}
  const button=event.target.closest('[data-account-mode]');if(!button||button.disabled||service.snapshot().busy||!interactive()||!accountRoot().contains(button))return;
  if(button.dataset.accountMode==='username'){navigate('username');void execute(()=>root.PlayroomSocialUI.service.refresh());return;}
  if(button.dataset.accountMode==='logout'){void logout();return;}
  navigate(button.dataset.accountMode);
 });
 document.addEventListener('keydown',event=>{
  const button=event.target.closest('[data-account-tab]');if(!button||!interactive()||!accountRoot().contains(button)||button.disabled)return;
  const index=authModes.indexOf(button.dataset.accountMode),next=event.key==='Home'?0:event.key==='End'?2:event.key==='ArrowLeft'?(index+2)%3:event.key==='ArrowRight'?(index+1)%3:null;if(next===null)return;
  event.preventDefault();event.stopPropagation();navigate(authModes[next]);accountRoot().querySelector('[data-account-mode="'+mode+'"]').focus();
 });
 document.addEventListener('invalid',event=>{
  const input=event.target,form=input.closest('[data-account-form]');if(!form||!interactive()||!accountRoot().contains(form))return;
  event.preventDefault();const message=form.querySelector('.account-message');if(!message)return;
  input.setAttribute('aria-invalid','true');if(invalidFocus?.form!==form)invalidFocus=null;
  if(!invalidFocus){const pending=invalidFocus={input,form,ticket:dialogGeneration,revision:viewRevision};validityFeedback(form,input);queueMicrotask(()=>{if(invalidFocus!==pending)return;invalidFocus=null;if(pending.ticket===dialogGeneration&&pending.revision===viewRevision&&interactive()&&accountRoot().contains(input)&&!input.validity.valid)input.focus({preventScroll:true});});}
 },true);
 document.addEventListener('input',event=>{
  const input=event.target,form=input.closest('[data-account-form]');if(!form||!interactive()||!accountRoot().contains(form)||!input.hasAttribute('aria-invalid'))return;
  if(input.validity.valid)input.removeAttribute('aria-invalid');
  const invalid=[...form.querySelectorAll('[aria-invalid=true]')].find(field=>!field.validity.valid);validityFeedback(form,invalid);
 });
 document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-account-form]');if(!form||!interactive()||!accountRoot().contains(form))return;event.preventDefault();
  const email=form.elements.email?.value||'',password=form.elements.password?.value||'',currentPassword=form.elements['current-password']?.value||'',action=form.dataset.accountForm;
  if(service.snapshot().busy)return;
  if(!form.checkValidity())return;
  if(action==='username'){const nickname=form.elements.nickname.value.trim(),username=form.elements.username.value;void execute(async current=>{await root.PlayroomSocialUI.service.perform('profile',{nickname,username});if(!current())return;bridge().saveNickname(nickname);root.dispatchEvent(new Event('playroom:profile-identity-updated'));mode='account';},'username-saved');return;}
  if(action==='login')void execute(()=>service.login(email,password));
  else if(action==='signup')void execute(()=>service.signup(email,password,form.elements.username?.value));
  else if(action==='recover')void execute(()=>service.recover(email),'recovery-sent');
  else if(action==='password')void execute(()=>service.changePassword(password),'password-changed');
  else if(action==='password-change')void execute(async current=>{await service.updatePassword(currentPassword,password);if(current())mode='account';},'password-changed');
 });
 root.PlayroomAccountUI=Object.freeze({markup,init,show,sync:syncAccount,get service(){return service;}});
})(globalThis);
