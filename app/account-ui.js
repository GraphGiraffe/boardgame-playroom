/* Account dialog and events. Provider calls and credentials belong to the adapter. */
(function(root){
 'use strict';
 let service=null,mode='login',notice='',error='',opened=false;
 const text=key=>root.PlayroomMessages.text('ui.account.'+key),H=()=>root.PlayroomGameScreen,bridge=()=>root.PlayroomAppBridge;
 function status(){const s=service?.snapshot();return !s?.configured?'unavailable':root.navigator.onLine===false?'offline':s.busy?'busy':s.error?'error':s.kind==='account'?'account':s.kind==='guest'?'guest':'local';}
 const statusIcons={unavailable:'cloud-off',offline:'cloud-off',busy:'cloud-sync',error:'cloud-alert',account:'cloud-check',guest:'cloud',local:'cloud'};
 function markup(){const state=status();return H().iconButton(`data-account-open data-account-status="${state}"`,text('title')+' · '+text('status.'+state),statusIcons[state],{className:'account-status-button'});}
 function updateButtons(){const state=status(),label=text('title')+' · '+text('status.'+state);for(const button of document.querySelectorAll('[data-account-open]')){button.dataset.accountStatus=state;button.setAttribute('aria-label',label);button.title=label;button.innerHTML=H().icon(statusIcons[state]);}}
 function render(){
  if(!opened||!document.querySelector('.account-modal'))return;
  const s=service.snapshot(),esc=H().esc;
  const button=(action,label,variant='secondary')=>H().button({attrs:`type="button" data-account-mode="${action}" ${s.busy?'disabled':''}`,label:text(label),variant});
  const field=(name,type,autocomplete,label=name)=>`<label class="field"><span>${text(label)}</span><input name="${name}" type="${type}" autocomplete="${autocomplete}" required ${type==='password'?`minlength="${autocomplete==='current-password'?1:8}" maxlength="256"`:'maxlength="254"'}></label>`;
  const accountView=s.kind==='account'&&!s.recovery&&mode!=='password-change';
  const passwordMode=mode==='password-change'||s.recovery;
  let body;
  if(!s.configured)body=`<p>${text('unavailable')}</p>`;
  else if(accountView)body=`<p>${esc(s.email)}</p><p class="muted">${text('local-unchanged')}</p><div class="account-actions">${button('password-change','change-password')}${button('logout','logout')}</div>`;
  else{
   if(s.recovery)mode='password';
   body=`<p class="muted">${text(passwordMode?'password-info':'optional')}</p><form data-account-form="${mode}" class="account-form"><fieldset ${s.busy?'disabled':''}>${passwordMode?'':field('email','email','email')}${mode==='password-change'?field('current-password','password','current-password'):''}${mode==='recover'?'':field('password','password',mode==='login'?'current-password':'new-password',passwordMode?'new-password':'password')}${H().button({type:'submit',label:text(s.busy?'waiting':passwordMode?'save-password':mode)})}</fieldset></form>${mode==='password'?'':`<div class="account-actions">${mode==='password-change'?button('account','back'):`${mode!=='login'?button('login','login'):''}${mode!=='signup'?button('signup','signup'):''}${mode!=='recover'?button('recover','recover'):''}`}</div>`}`;
  }
  const modal=document.querySelector('.account-modal .account-content');if(!modal)return;
  const view=!s.configured?'unavailable':accountView?'account':'form:'+mode;
  if(modal.dataset.accountView!==view){modal.innerHTML=body+'<p class="account-message" role="status" aria-live="polite"></p>';modal.dataset.accountView=view;}
  // Busy/error updates must not replace inputs, focus, autofill or the clicked button.
  const fieldset=modal.querySelector('fieldset');if(fieldset)fieldset.disabled=s.busy;
  for(const button of modal.querySelectorAll('[data-account-mode]'))button.disabled=s.busy;
  const submit=modal.querySelector('button[type=submit]');if(submit){const label=submit.querySelector('.ui-button-label'),caption=text(s.busy?'waiting':passwordMode?'save-password':mode);if(label)label.textContent=caption;submit.setAttribute('aria-label',caption);}
  modal.setAttribute('aria-busy',String(s.busy));
  const message=modal.querySelector('.account-message');message.setAttribute('role',error?'alert':'status');message.textContent=error||notice||(s.busy?text('waiting'):'');
 }
 async function execute(action,success=''){
  error='';notice='';
  try{const result=await action();if(success)notice=text(success);if(result?.confirmationRequired)notice=text('confirmation');}
  catch(e){error=text('error.'+(['network','storage','rate-limit','credentials','email-not-confirmed','recovery-link','unavailable','redirect','same-password','weak-password','current-password','reauthentication'].includes(e.code)?e.code:'request'));}
  render();
 }
 function show(){
  opened=true;mode='login';error='';notice='';
  bridge().openModal(`${bridge().modalHead(text('title'))}<div class="account-content"></div>`,'account-modal');render();
  if(service.snapshot().configured&&!service.snapshot().recovery&&!service.snapshot().busy)void execute(()=>service.restore());
 }
 function init(){
  let auth=null;try{if(root.PlayroomNetworkConfig?.url)auth=new root.PlayroomSupabaseAuth.SupabaseAuth(root.PlayroomNetworkConfig);}catch(_){}
  service=new root.PlayroomAccountService({auth,guestId:()=>bridge().profile()?.id});
  service.subscribe(()=>{updateButtons();render();});
  root.addEventListener('online',updateButtons);root.addEventListener('offline',updateButtons);
  if(auth?.hasCallback()){
   opened=true;bridge().openModal(`${bridge().modalHead(text('title'))}<div class="account-content"></div>`,'account-modal');render();
   void execute(()=>service.callback(),'confirmed');
  }
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-account-open]')){show();return;}
  const button=event.target.closest('[data-account-mode]');if(!button||service.snapshot().busy)return;
  if(button.dataset.accountMode==='logout'){mode='login';void execute(()=>service.logout(),'signed-out');return;}
  mode=button.dataset.accountMode;notice='';error='';render();
 });
 document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-account-form]');if(!form)return;event.preventDefault();
  const email=form.elements.email?.value||'',password=form.elements.password?.value||'',currentPassword=form.elements['current-password']?.value||'',action=form.dataset.accountForm;
  if(service.snapshot().busy)return;
  if(action==='login')void execute(()=>service.login(email,password));
  else if(action==='signup')void execute(()=>service.signup(email,password));
  else if(action==='recover')void execute(()=>service.recover(email),'recovery-sent');
  else if(action==='password')void execute(()=>service.changePassword(password),'password-changed');
  else if(action==='password-change')void execute(async()=>{await service.updatePassword(currentPassword,password);mode='account';},'password-changed');
 });
 root.PlayroomAccountUI=Object.freeze({markup,init,show,get service(){return service;}});
})(globalThis);
