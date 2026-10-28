/* Account dialog and events. Provider calls and credentials belong to the adapter. */
(function(root){
 'use strict';
 let service=null,mode='login',notice='',error='',opened=false;
 const text=key=>root.PlayroomMessages.text('ui.account.'+key),H=()=>root.PlayroomGameScreen,bridge=()=>root.PlayroomAppBridge;
 function markup(){return `<div class="account-settings">${H().button({attrs:'data-account-open',label:text('title'),variant:'secondary'})}</div>`;}
 function render(){
  if(!opened||!document.querySelector('.account-modal'))return;
  const s=service.snapshot(),esc=H().esc;
  const button=(action,label,variant='secondary')=>H().button({attrs:`type="button" data-account-mode="${action}" ${s.busy?'disabled':''}`,label:text(label),variant});
  const field=(name,type,autocomplete)=>`<label class="field"><span>${text(name)}</span><input name="${name}" type="${type}" autocomplete="${autocomplete}" required ${type==='password'?'minlength="8" maxlength="256"':'maxlength="254"'}></label>`;
  let body;
  if(!s.configured)body=`<p>${text('unavailable')}</p>`;
  else if(s.kind==='account'&&!s.recovery)body=`<p>${esc(s.email)}</p><p class="muted">${text('local-unchanged')}</p>${button('logout','logout')}`;
  else{
   if(s.recovery)mode='password';
   body=`<p class="muted">${text('optional')}</p><form data-account-form="${mode}" class="account-form"><fieldset ${s.busy?'disabled':''}>${mode==='password'?'':field('email','email','email')}${mode==='recover'?'':field('password','password',mode==='login'?'current-password':'new-password')}${H().button({type:'submit',label:text(s.busy?'waiting':mode==='password'?'save-password':mode)})}</fieldset></form>${mode==='password'?'':`<div class="account-actions">${mode!=='login'?button('login','login'):''}${mode!=='signup'?button('signup','signup'):''}${mode!=='recover'?button('recover','recover'):''}</div>`}`;
  }
  const modal=document.querySelector('.account-modal .account-content');if(modal)modal.innerHTML=body+`<p class="account-message" role="${error?'alert':'status'}" aria-live="polite">${esc(error||notice)}</p>`;
 }
 async function execute(action,success=''){
  error='';notice='';
  try{const result=await action();if(success)notice=text(success);if(result?.confirmationRequired)notice=text('confirmation');}
  catch(e){error=text('error.'+(['network','storage','rate-limit','credentials','email-not-confirmed','recovery-link','unavailable','redirect'].includes(e.code)?e.code:'request'));}
  render();
 }
 function show(){
  opened=true;mode='login';error='';notice='';
  bridge().openModal(`${bridge().modalHead(text('title'))}<div class="account-content"></div>`,'account-modal');render();
  if(service.snapshot().configured&&!service.snapshot().recovery)void execute(()=>service.restore());
 }
 function init(){
  let auth=null;try{if(root.PlayroomNetworkConfig?.url)auth=new root.PlayroomSupabaseAuth.SupabaseAuth(root.PlayroomNetworkConfig);}catch(_){}
  service=new root.PlayroomAccountService({auth,guestId:()=>bridge().profile()?.id});
  service.subscribe(()=>render());
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
  const email=form.elements.email?.value||'',password=form.elements.password?.value||'',action=form.dataset.accountForm;
  if(service.snapshot().busy)return;
  if(action==='login')void execute(()=>service.login(email,password));
  else if(action==='signup')void execute(()=>service.signup(email,password));
  else if(action==='recover')void execute(()=>service.recover(email),'recovery-sent');
  else if(action==='password')void execute(()=>service.changePassword(password),'password-changed');
 });
 root.PlayroomAccountUI=Object.freeze({markup,init,show,get service(){return service;}});
})(globalThis);
