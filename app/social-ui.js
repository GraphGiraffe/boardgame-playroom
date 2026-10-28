/* Social presentation only. All access decisions are checked by the server. */
(function(root){
 'use strict';
 let service,account,opened=false,view='list',roomId=null,invite=null,selectedTarget='',notice='',error='';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 function button(action,label,attrs=''){return H().button({attrs:`type="button" data-social-action="${action}" ${attrs}`,label:t(label),variant:'secondary'});}
 function form(action,field,label,max){return `<form data-social-form="${action}"><fieldset><label class="field"><span>${t(label)}</span><input name="${field}" required maxlength="${max}" ${field==='userId'?'pattern="[0-9a-fA-F-]{36}"':''}></label>${H().button({type:'submit',label:t(action)})}</fieldset></form>`;}
 function render(){
  const content=document.querySelector('.social-modal .social-content');if(!opened||!content)return;
  const s=service.snapshot(),a=account.snapshot(),esc=H().esc;
  let body='';
  if(a.kind==='local'||a.recovery){body=`<p>${t('optional')}</p>${button('account','account')}`;if(!a.recovery)body+=`<p>${t('guest-info')}</p>${form('join','token','invite-code',64)}`;}
  else if(view==='room'&&s.room?.id===roomId){
   const room=s.room,owner=room.ownerId===a.id;
   body=`<h3>${esc(room.name)}</h3><p class="muted" data-cloud-status>${t('cloud-info')}</p>${button(owner?'host-cloud':'connect-cloud',owner?'host-cloud':'connect-cloud')}<ul>${room.members.map(m=>`<li>${esc(m.nickname)}${m.id===room.ownerId?' · '+t('owner'):''}${owner&&m.id!==a.id?button('kick','kick',`data-user-id="${esc(m.id)}"`):''}</li>`).join('')}</ul>`;
   if(owner){body+=`<label class="field"><span>${t('target')}</span><select data-social-target><option value="">${t('anyone')}</option>${s.friends.filter(f=>f.accepted).map(f=>`<option value="${esc(f.userId)}" ${f.userId===selectedTarget?'selected':''}>${esc(f.nickname)}</option>`).join('')}</select></label>${button('invite','invite')}`;
    if(invite)body+=`<p>${t('share-code')}</p><label class="field"><input class="social-code" aria-label="${t('invite-code')}" readonly value="${esc(invite.token)}"></label>${button('copy','copy')}<p class="muted">${t('expires')}</p>`;
    body+=`<ul>${room.invites.filter(i=>!i.revoked&&!i.used&&Date.parse(i.expiresAt)>Date.now()).map(i=>`<li>${esc(s.friends.find(f=>f.userId===i.targetId)?.nickname||t('anyone'))}${button('revoke','revoke',`data-id="${esc(i.id)}"`)}</li>`).join('')}</ul>${button('close','close-room')}`;
   }else body+=button('leave','leave');
   body+=button('back','back')+button('refresh-room','refresh');
  }else{
   view='list';
   body=`<p class="muted">${t('explicit-refresh')}</p>${button('refresh','refresh')}`;
   if(a.kind==='account'){
    body+=form('profile','nickname','nickname',24);
    if(s.profile)body+=`<label class="field"><span>${t('my-code')}</span><input class="social-code" readonly value="${esc(s.profile.id)}"></label>`;
    body+=`<h3>${t('friends')}</h3>${form('request','userId','friend-code',36)}<ul>${s.friends.map(f=>`<li><span>${esc(f.nickname)} · ${t(f.accepted?'confirmed':f.incoming?'incoming':'outgoing')}</span>${!f.accepted&&f.incoming?button('accept','accept',`data-id="${esc(f.id)}"`):''}${button('remove',f.accepted?'remove':'cancel',`data-id="${esc(f.id)}"`)}</li>`).join('')}</ul><h3>${t('rooms')}</h3>${form('create','name','room-name',48)}`;
   }else body+=`<p>${t('guest-info')}</p>`;
   body+=`<h3>${t('invitations')}</h3><ul>${(s.invitations||[]).map(i=>`<li><span>${esc(i.roomName)} · ${esc(i.fromName)}</span>${button('join-targeted','join',`data-id="${esc(i.id)}"`)}</li>`).join('')}</ul>`;
   body+=form('join','token','invite-code',64)+`<ul>${s.rooms.map(r=>`<li>${button('room','open-room',`data-room-id="${esc(r.id)}"`)}<span>${esc(r.name)}</span></li>`).join('')}</ul>`;
  }
  // Preserve typed values and focus during busy/error transitions.
  const signature=JSON.stringify([view,a.kind,a.recovery,s.profile,s.friends,s.rooms,s.invitations,s.room,invite]);
  if(content.dataset.view!==signature){content.dataset.view=signature;content.innerHTML=body+'<p data-social-message role="status" aria-live="polite"></p>';const name=content.querySelector('[data-social-form=profile] input');if(name)name.value=s.profile?.nickname||B().profile()?.name||'';}
  for(const control of content.querySelectorAll('button,fieldset,select'))control.disabled=s.busy||a.busy;
  const message=content.querySelector('[data-social-message]');message.setAttribute('role',error?'alert':'status');message.textContent=error||notice||(s.busy||a.busy?t('waiting'):'');
  content.setAttribute('aria-busy',String(s.busy||a.busy));
 }
 async function execute(action){error='';notice='';try{await action();}catch(e){const key=['account-required','invalid','profile-required','not-found','forbidden','limit','invite-invalid','owner-leave','friend-required','network','setup','rate-limit','credentials','account-changed','busy','host-offline','host-busy','lobby-required'].includes(e.code)?e.code:'request';error=t('error.'+key);}render();}
 async function loadRoom(id){await service.perform('room',{roomId:id});view='room';roomId=id;render();}
 function show(){opened=true;view='list';invite=null;selectedTarget='';notice='';error='';B().openModal(`${B().modalHead(t('title'))}<div class="social-content"></div>`,'social-modal');render();if(['account','guest'].includes(account.snapshot().kind)&&!account.snapshot().recovery)void execute(()=>service.refresh());}
 function init({account:accountService,remote}){account=accountService;service=new root.PlayroomSocialService({account,remote});service.subscribe(render);let identity=service.key();account.subscribe(()=>{if(identity!==service.key()){identity=service.key();invite=null;roomId=null;view='list';}render();});}
 document.addEventListener('click',event=>{
  const target=event.target.closest('[data-social-action]');if(!target||service.busy||account.snapshot().busy)return;
  const action=target.dataset.socialAction;
  if(action==='host-cloud'||action==='connect-cloud'){void execute(async()=>{if(action==='host-cloud')await root.PlayroomCloudNetwork.host(roomId);else await root.PlayroomCloudNetwork.connect(roomId);notice=t(action==='host-cloud'?'cloud-hosting':'cloud-connected');});return;}
  if(action==='copy'){const input=document.querySelector('.social-content input[aria-label]');if(input){input.select();void execute(async()=>{if(root.navigator.clipboard?.writeText){await root.navigator.clipboard.writeText(input.value);notice=t('copied');}else notice=t('copy-manually');});}return;}
  if(action==='account'){opened=false;root.PlayroomAccountUI.show();return;}
  if(action==='back'){view='list';invite=null;void execute(()=>service.refresh());return;}
  if(action==='join-targeted'){void execute(async()=>{const result=await service.perform('join',{inviteId:target.dataset.id,nickname:B().profile()?.name||t('guest-name')});await loadRoom(result.id);});return;}
  if(action==='refresh'){void execute(()=>service.refresh());return;}
  if(action==='room'){invite=null;void execute(()=>loadRoom(target.dataset.roomId));return;}
  if(action==='refresh-room'){void execute(()=>loadRoom(roomId));return;}
  const data={roomId,...(target.dataset.id?{id:target.dataset.id}:{}),...(target.dataset.userId?{userId:target.dataset.userId}:{})};
  if(action==='invite'){selectedTarget=document.querySelector('[data-social-target]').value;data.userId=selectedTarget||null;}
  void execute(async()=>{
   const result=await service.perform(action,data);
   if(action==='invite')invite=result;
   if(['invite','revoke','kick'].includes(action)){if(action==='revoke')invite=null;await loadRoom(roomId);}
   else if(['close','leave'].includes(action)){root.PlayroomCloudNetwork.stop();view='list';roomId=null;invite=null;}
  });
 });
 document.addEventListener('submit',event=>{
  const form=event.target.closest('[data-social-form]');if(!form)return;event.preventDefault();if(service.busy||account.snapshot().busy)return;
  const action=form.dataset.socialForm,data=Object.fromEntries(new FormData(form));
  void execute(async()=>{
   if(action==='join'){data.nickname=B().profile()?.name||t('guest-name');if(account.snapshot().kind==='local')await account.ensureGuest();}
   const result=await service.perform(action,data);
   if(['join','create'].includes(action))await loadRoom(result.id);
   else notice=t('saved');
  });
 });
 root.PlayroomSocialUI=Object.freeze({init,show,get service(){return service;}});
})(globalThis);
