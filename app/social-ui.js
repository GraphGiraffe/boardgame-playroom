/* Friends presentation. Account names live in the account dialog; rooms in lobby. */
(function(root){
 'use strict';
 let service,account,results=null,error='',notice='',generation=0;
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 const button=(action,label,attrs='')=>H().button({attrs:`type="button" data-friend-action="${action}" ${attrs}`,label:t(label),variant:'secondary'});
 function render(){
  const content=document.querySelector('.friends-modal .social-content');if(!content)return;
  const state=service.snapshot(),a=account.snapshot(),esc=H().esc;
  let body;
  if(a.kind!=='account'||a.recovery)body=`<p>${t('friends-account')}</p>${button('account','account')}`;
  else body=`<form data-friend-search><fieldset><label class="field"><span>${t('username-search')}</span><input name="username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="25" placeholder="@ivan" required></label>${H().button({type:'submit',label:t('search')})}</fieldset></form><div class="friend-search-results">${results===null?'':results.length?results.map(p=>`<div class="social-person"><span><strong>${esc(p.nickname)}</strong><small>@${esc(p.username)}</small></span>${state.friends.some(f=>f.userId===p.id)?`<span>${t('already-requested')}</span>`:button('request','request',`data-username="${esc(p.username)}"`)}</div>`).join(''):`<p>${t('not-found')}</p>`}</div><ul>${state.friends.map(f=>`<li><span><strong>${esc(f.nickname)}</strong>${f.username?`<small>@${esc(f.username)}</small>`:''}<small>${t(f.accepted?'confirmed':f.incoming?'incoming':'outgoing')}</small></span>${!f.accepted&&f.incoming?button('accept','accept',`data-id="${esc(f.id)}"`):''}${button('remove',f.accepted?'remove':'cancel',`data-id="${esc(f.id)}"`)}</li>`).join('')}</ul>${button('refresh','refresh')}`;
  const signature=JSON.stringify([a.kind,a.recovery,state.friends,results]);
  if(content.dataset.view!==signature){const typed=content.querySelector('[name=username]')?.value||'';content.dataset.view=signature;content.innerHTML=body+'<p data-friend-message role="status" aria-live="polite"></p>';const input=content.querySelector('[name=username]');if(input)input.value=typed;}
  for(const el of content.querySelectorAll('button,fieldset'))el.disabled=state.busy||a.busy;
  const msg=content.querySelector('[data-friend-message]');msg.textContent=error||notice||(state.busy?t('waiting'):'');msg.setAttribute('role',error?'alert':'status');
 }
 function message(e){const key=['username-invalid','username-taken','network','setup','account-required','account-changed','rate-limit','not-found','limit','lobby-required','host-busy','host-offline'].includes(e.code)?e.code:'request';return t('error.'+key);}
 async function execute(fn){error='';notice='';try{await fn();}catch(e){error=message(e);}render();}
 async function syncNickname(){if(account.snapshot().kind==='account'&&!account.snapshot().recovery)return service.perform('profile',{nickname:B().profile()?.name||t('guest-name')});}
 function show({onBack}={}){generation++;results=null;error='';notice='';B().openModal(`${B().modalHead(t('friends'))}<div class="social-content" data-friends-dialog></div>`,'friends-modal',{onBack});render();if(account.snapshot().kind==='account')void execute(()=>syncNickname());}
 function init({account:accountService,remote}){account=accountService;service=new root.PlayroomSocialService({account,remote});service.subscribe(render);account.subscribe(()=>{generation++;results=null;render();});}
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-friends-open]')){const back=document.querySelector('.lobby-incoming-modal')?()=>root.PlayroomLobbyNetwork.incoming():document.querySelector('.lobby-invites-modal')?()=>root.PlayroomLobbyNetwork.showInvite():document.querySelector('.account-modal')?()=>root.PlayroomAccountUI.show():undefined;show({onBack:back});return;}
  const btn=event.target.closest('[data-friend-action]');if(!btn||service.busy||account.snapshot().busy)return;
  const action=btn.dataset.friendAction;
  if(action==='account'){root.PlayroomAccountUI.show({onReady:()=>show()});return;}
  if(action==='refresh'){void execute(()=>syncNickname());return;}
  void execute(async()=>{await service.perform(action,action==='request'?{username:btn.dataset.username}:{id:btn.dataset.id});notice=t('saved');});
 });
 document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-friend-search]');if(!form)return;event.preventDefault();if(service.busy)return;
  const current=generation;void execute(async()=>{const found=await service.perform('search',{username:form.elements.username.value});if(current===generation)results=found;});
 });
 root.PlayroomSocialUI=Object.freeze({init,show,syncNickname,message,get service(){return service;}});
})(globalThis);
