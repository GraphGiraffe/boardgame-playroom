/* Account dialog and events. Provider calls and credentials belong to the adapter. */
(function(root){
 'use strict';
 let service=null,mode='login',notice='',error='',opened=false,continuation=null,batch=null,dialogGeneration=0;
 const text=key=>root.PlayroomMessages.text('ui.account.'+key),H=()=>root.PlayroomGameScreen,bridge=()=>root.PlayroomAppBridge;
 function status(){const s=service?.snapshot();return !s?.configured?'unavailable':root.navigator.onLine===false?'offline':s.busy?'busy':s.error?'error':s.kind==='account'?'account':s.kind==='guest'?'guest':'local';}
 const statusIcons={unavailable:'cloud-off',offline:'cloud-off',busy:'cloud-sync',error:'cloud-alert',account:'cloud-check',guest:'cloud',local:'cloud'};
 function markup(){const state=status();return H().iconButton(`data-account-open data-account-status="${state}"`,text('title')+' · '+text('status.'+state),statusIcons[state],{className:'account-status-button'});}
 function updateButtons(){for(const label of document.querySelectorAll('[data-profile-play-label]'))label.textContent=service?.snapshot().kind==='account'?'Играть':'Играть без облака';const state=status(),label=text('title')+' · '+text('status.'+state);for(const button of document.querySelectorAll('[data-account-open]')){button.dataset.accountStatus=state;button.setAttribute('aria-label',label);button.title=label;button.innerHTML=H().icon(statusIcons[state]);}}
 function render(){
  if(!opened||!document.querySelector('.account-modal'))return;
  const profile=root.PlayroomSocialUI.service.snapshot().profile;
  const s={...service.snapshot(),busy:service.busy||(mode==='username'&&root.PlayroomSocialUI.service.busy)},esc=H().esc;
  const button=(action,label,variant='secondary')=>{const icon={username:'edit','password-change':'lock',logout:'exit',account:'undo'}[action];return icon?H().iconButton(`data-account-mode="${action}"`,text(label),icon,{disabled:s.busy,className:action==='logout'?'account-logout ui-action-danger':''}):H().button({attrs:`type="button" data-account-mode="${action}" ${s.busy?'disabled':''}`,label:text(label),variant});};
  const field=(name,type,autocomplete,label=name)=>`<label class="field"><span>${text(label)}</span><input name="${name}" type="${type}" autocomplete="${autocomplete}" required ${type==='password'?`minlength="${autocomplete==='current-password'?1:8}" maxlength="256"`:'maxlength="254"'}></label>`;
  const accountView=s.kind==='account'&&!s.recovery&&mode!=='password-change'&&mode!=='username';
  const passwordMode=mode==='password-change'||s.recovery;
  let body;
  if(!s.configured)body=`<p>${text('unavailable')}</p>`;
  else if(accountView)body=`<div class="account-identity">${profile?.username?`<strong>@${esc(profile.username)}</strong>`:''}<span class="muted">${esc(s.email)}</span></div><div class="account-actions account-quick-actions ui-action-row">${button('logout','logout')}<span data-push-settings>${root.PlayroomPushUI.markup()}</span>${button('username','username')}${button('password-change','change-password')}</div><div data-cloud-settings>${root.PlayroomCloudSavesUI.settings()}</div>`;
  else if(mode==='username'&&!s.recovery&&s.kind==='account')body=`<form class="account-form" data-account-form="username"><fieldset><label class="field"><span>${text('username')}</span>${root.PlayroomSocialUI.usernameInput({value:profile?.username||'',pattern:true})}</label><div class="account-form-actions">${button('account','back')}${H().iconButton('',text('save-username'),'check',{type:'submit'})}</div></fieldset></form>`;
  else{
   if(s.recovery)mode='password';
   body=`${passwordMode?`<p class="muted">${text('password-info')}</p>`:''}<form data-account-form="${mode}" class="account-form"><fieldset ${s.busy?'disabled':''}>${passwordMode?'':field('email','email','email')}${mode==='password-change'?field('current-password','password','current-password'):''}${mode==='recover'?'':field('password','password',mode==='login'?'current-password':'new-password',passwordMode?'new-password':'password')}${H().button({type:'submit',label:text(s.busy?'waiting':passwordMode?'save-password':mode)})}</fieldset></form>${mode==='password'?'':`<div class="account-actions">${mode==='password-change'?button('account','back'):`${mode!=='login'?button('login','login'):''}${mode!=='signup'?button('signup','signup'):''}${mode!=='recover'?button('recover','recover'):''}`}</div>`}`;
  }

  const modal=document.querySelector('.account-modal .account-content');if(!modal)return;
  const view=!s.configured?'unavailable':accountView?'account:'+(profile?.username||''):'form:'+mode+(mode==='username'?':'+(profile?.username||''):'');
  if(modal.dataset.accountView!==view){modal.innerHTML=body+'<p class="account-message" role="status" aria-live="polite"></p>';modal.dataset.accountView=view;}
  // Busy/error updates must not replace inputs, focus, autofill or the clicked button.
  const fieldset=modal.querySelector('fieldset');if(fieldset)fieldset.disabled=s.busy;
  for(const button of modal.querySelectorAll('[data-account-mode]'))button.disabled=s.busy;
  const submit=modal.querySelector('button[type=submit]');if(submit){const label=submit.querySelector('.ui-button-label'),caption=text(s.busy?'waiting':mode==='username'?'save-username':passwordMode?'save-password':mode);if(label)label.textContent=caption;submit.setAttribute('aria-label',caption);}
  modal.setAttribute('aria-busy',String(s.busy));
  const message=modal.querySelector('.account-message');message.setAttribute('role',error?'alert':'status');message.textContent=error||notice;
 }
 async function execute(action,success=''){
  const ticket=dialogGeneration;error='';notice='';
  try{const result=await action();if(success)notice=text(success);if(result?.confirmationRequired)notice=text('confirmation');if(ticket===dialogGeneration&&opened&&document.querySelector('.account-modal')&&continuation&&service.snapshot().kind==='account'&&!service.snapshot().recovery){const resume=continuation;continuation=null;opened=false;bridge().closeModal(true);resume();}}
  catch(e){error=text('error.'+(['network','storage','rate-limit','credentials','email-not-confirmed','recovery-link','unavailable','redirect','same-password','weak-password','current-password','reauthentication','username-invalid','username-taken','setup','network'].includes(e.code)?e.code:'request'));}
  render();
 }
 function show({onReady=null}={}){
  const back=bridge().captureModalReturn();dialogGeneration++;continuation=onReady;opened=true;mode='login';error='';notice='';
  bridge().openModal(`${bridge().modalHead(text('title'))}<div class="account-content"></div>`,'account-modal',{onBack:()=>{dialogGeneration++;opened=false;continuation=null;back();}});render();
  void syncAccount();
  if(service.snapshot().configured&&!service.snapshot().recovery&&!service.snapshot().busy)void execute(()=>service.restore());
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
  service.subscribe(()=>{updateButtons();render();});
  root.PlayroomSocialUI.service.subscribe(render);
  let syncIdentity=service.snapshot().kind+':'+service.snapshot().id;
  service.subscribe(()=>{const next=service.snapshot().kind+':'+service.snapshot().id;if(next!==syncIdentity){syncIdentity=next;void syncAccount();}});
  void syncAccount();root.addEventListener('online',()=>void syncAccount());document.addEventListener('visibilitychange',()=>{if(!document.hidden)void syncAccount();});
  root.addEventListener('online',updateButtons);root.addEventListener('offline',updateButtons);root.addEventListener('playroom:modal-restored',updateButtons);
  if(auth?.hasCallback()){
   opened=true;bridge().openModal(`${bridge().modalHead(text('title'))}<div class="account-content"></div>`,'account-modal');render();
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
  if(event.target.closest('[data-account-open]')){show();return;}
  const button=event.target.closest('[data-account-mode]');if(!button||service.snapshot().busy)return;
  if(button.dataset.accountMode==='username'){mode='username';notice='';error='';render();void execute(()=>root.PlayroomSocialUI.service.refresh());return;}
  if(button.dataset.accountMode==='logout'){const userId=service.snapshot().id;void execute(async()=>{if(!await H().confirmDialog('Выйти из облачного аккаунта? Локальные партии останутся на устройстве.')||service.snapshot().id!==userId)return;await root.PlayroomPushUI.beforeLogout();await service.logout();mode='login';},'signed-out');return;}
  mode=button.dataset.accountMode;notice='';error='';render();
 });
 document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-account-form]');if(!form)return;event.preventDefault();
  const email=form.elements.email?.value||'',password=form.elements.password?.value||'',currentPassword=form.elements['current-password']?.value||'',action=form.dataset.accountForm;
  if(service.snapshot().busy)return;
  if(action==='username'){void execute(async()=>{await root.PlayroomSocialUI.service.perform('profile',{nickname:bridge().profile()?.name||'',username:form.elements.username.value});mode='account';},'username-saved');return;}
  if(action==='login')void execute(()=>service.login(email,password));
  else if(action==='signup')void execute(()=>service.signup(email,password));
  else if(action==='recover')void execute(()=>service.recover(email),'recovery-sent');
  else if(action==='password')void execute(()=>service.changePassword(password),'password-changed');
  else if(action==='password-change')void execute(async()=>{await service.updatePassword(currentPassword,password);mode='account';},'password-changed');
 });
 root.PlayroomAccountUI=Object.freeze({markup,init,show,sync:syncAccount,get service(){return service;}});
})(globalThis);
