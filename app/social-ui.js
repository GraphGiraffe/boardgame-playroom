/* Friends presentation. Account names live in the account dialog; rooms in lobby. */
(function(root){
 'use strict';
 let service,account,results=null,error='',notice='',generation=0;
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 const button=(action,label,attrs='')=>H().iconButton(`data-friend-action="${action}" ${attrs}`,t(label),action==='request'?'addPlayer':'cloud');
 function usernameInput({value='',autocomplete='username',pattern=false}={}){return `<span class="username-editor"><span aria-hidden="true">@</span><input name="username" autocomplete="${autocomplete}" autocapitalize="none" spellcheck="false" maxlength="24" placeholder="..." ${pattern?'minlength="3" pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"':''} required value="${H().esc(value)}"></span>`;}
 document.addEventListener('input',event=>{const input=event.target;if(!input.matches('.username-editor input'))return;const value=input.value.replace(/^@+/,'');if(value!==input.value){const caret=input.selectionStart;const removed=input.value.length-value.length;input.value=value;input.setSelectionRange(Math.max(0,caret-removed),Math.max(0,caret-removed));}});
 function render(){
  const content=document.querySelector('.friends-modal .social-content');if(!content)return;
  const state=service.snapshot(),a=account.snapshot(),esc=H().esc;
  let body;
  if(a.kind!=='account'||a.recovery)body=`<p>${t('friends-account')}</p>${button('account','account')}`;
  else body=`<form data-friend-search><fieldset><label class="field"><span>${t('username-search')}</span>${usernameInput({autocomplete:'off'})}</label>${H().iconButton('',t('search'),'search',{type:'submit'})}</fieldset></form><div class="friend-search-results">${results===null?'':results.length?results.map(p=>`<div class="social-person"><span><strong>${esc(p.nickname)}</strong><small>@${esc(p.username)}</small></span>${state.friends.some(f=>f.userId===p.id)?`<span>${t('already-requested')}</span>`:button('request','request',`data-username="${esc(p.username)}"`)}</div>`).join(''):`<p>${t('not-found')}</p>`}</div>`;
  const signature=JSON.stringify([a.kind,a.recovery,state.friends,results]);
  if(content.dataset.view!==signature){const typed=content.querySelector('[name=username]')?.value||'';content.dataset.view=signature;content.innerHTML=body+'<p data-friend-message role="status" aria-live="polite"></p>';const input=content.querySelector('[name=username]');if(input)input.value=typed;}
  for(const el of content.querySelectorAll('button,fieldset'))el.disabled=state.busy||a.busy;
  const msg=content.querySelector('[data-friend-message]');msg.textContent=error||notice;msg.setAttribute('role',error?'alert':'status');
 }
 function message(e){const key=['room-active','invalid','profile-required','forbidden','invite-invalid','owner-leave','friend-required','credentials','busy','username-invalid','username-taken','network','setup','account-required','account-changed','rate-limit','not-found','limit','lobby-required','host-busy','host-offline','room-password','invite-disabled'].includes(e.code)?e.code:'request';return t('error.'+key)+(key==='request'&&(e.serverCode||e.status)?' ('+[e.status?'HTTP '+e.status:'',e.serverCode||''].filter(Boolean).join(', ')+')':'');}
 async function execute(fn){error='';notice='';try{await fn();}catch(e){error=message(e);}render();}
 let nicknameFlight=null;
 async function syncNickname(){
  if(account.snapshot().kind!=='account'||account.snapshot().recovery)return;
  const nickname=B().profile()?.name||t('guest-name'),key=service.key()+':'+nickname;
  if(service.snapshot().profile?.nickname===nickname)return;
  if(nicknameFlight?.key===key)return nicknameFlight.promise;
  const promise=service.perform('profile',{nickname});nicknameFlight={key,promise};
  try{return await promise;}finally{if(nicknameFlight?.promise===promise)nicknameFlight=null;}
 }
 function show({onBack}={}){generation++;results=null;error='';notice='';B().openModal(`${B().modalHead(t('add-friend'))}<div class="social-content" data-friends-dialog></div>`,'friends-modal',{onBack});render();if(account.snapshot().kind==='account')void execute(()=>syncNickname());}
 function init({account:accountService,remote}){account=accountService;service=new root.PlayroomSocialService({account,remote});service.subscribe(render);account.subscribe(()=>{generation++;results=null;render();});}
 document.addEventListener('click',event=>{
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
 root.PlayroomSocialUI=Object.freeze({init,show:()=>root.PlayroomCommunityUI.show(),showAdd:show,usernameInput,syncNickname,message,get service(){return service;}});
})(globalThis);
