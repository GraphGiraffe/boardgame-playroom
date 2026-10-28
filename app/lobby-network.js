/* Lobby invitations and incoming connections. No gameplay or Auth protocol here. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,S=()=>root.PlayroomSocialUI.service,A=()=>root.PlayroomAccountUI.service,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 let active=null,secret=null,busy=false,error='',notice='',pending=null;
 const button=(action,label,attrs='')=>H().button({attrs:`type="button" data-lobby-online="${action}" ${attrs}`,label:t(label),variant:'secondary'});
 function row({room,isHost}){
  return `<div class="lobby-shortcuts">${H().quickAccessMarkup({exclude:['full','help','rules']})}${room.transportMode==='network'&&isHost?H().button({attrs:'type="button" data-lobby-invite',label:t('invite-player'),variant:'secondary'})+H().iconButton('id="network-pair-button" type="button"',t('manual'),'qr'):''}</div>`;
 }
 function render(){
  const el=document.querySelector('.lobby-invites-modal .social-content');if(!el)return;
  const s=S().snapshot(),esc=H().esc;
  let body='';
  if(active){body=`<p>${esc(B().room()?.game?.name||'')}</p><div class="social-person">${button('guest','guest-invite')}</div><ul>${s.friends.filter(f=>f.accepted).map(f=>`<li><span><strong>${esc(f.nickname)}</strong>${f.username?`<small>@${esc(f.username)}</small>`:''}</span>${button('invite','invite-friend',`data-user="${esc(f.userId)}"`)}</li>`).join('')}</ul>`;
   if(!s.friends.some(f=>f.accepted))body+=`<p class="muted">${t('add-friends-first')}</p>`;
   if(secret)body+=`<label class="field"><span>${t('invite-code')}</span><input class="social-code" readonly value="${esc(secret.token)}"></label>${button('copy','copy')}<p class="muted">${t('expires')}</p>`;
   if(s.room?.id===active.id)body+=`<ul>${s.room.invites.filter(i=>!i.revoked&&!i.used&&Date.parse(i.expiresAt)>Date.now()).map(i=>`<li><span>${esc(s.friends.find(f=>f.userId===i.targetId)?.nickname||t('guest-invite'))}</span>${button('revoke','revoke',`data-id="${esc(i.id)}"`)}</li>`).join('')}</ul>`;
  }
  const signature=JSON.stringify([active,s.friends,s.room,secret]);if(el.dataset.view!==signature){el.dataset.view=signature;el.innerHTML=body+'<p data-online-message role="status" aria-live="polite"></p>';}
  for(const e of el.querySelectorAll('button'))e.disabled=busy||s.busy;
  const msg=el.querySelector('[data-online-message]');msg.textContent=error||notice||(busy?t('waiting'):'');msg.setAttribute('role',error?'alert':'status');
 }
 async function execute(fn){if(busy)return;busy=true;error='';notice='';render();try{await fn();}catch(e){error=root.PlayroomSocialUI.message(e);}finally{busy=false;render();}}
 async function ensure(){
  const room=B().room(),account=A().snapshot();
  if(!room||room.transportMode!=='network'||room.ownerId!==B().participantId())throw Object.assign(Error('lobby-required'),{code:'lobby-required'});
  const key=account.id+':'+room.id;
  if(pending?.key===key)return pending.promise;
  const promise=(async()=>{
   await root.PlayroomSocialUI.syncNickname();
   const result=await S().perform('lobby',{localRoomId:room.id,name:(room.game.name+' · '+room.name).slice(0,48)});
   if(A().snapshot().id!==account.id||B().room()?.id!==room.id)throw Object.assign(Error('account-changed'),{code:'account-changed'});
   await root.PlayroomCloudNetwork.host(result.id);active={id:result.id,key};await S().perform('room',{roomId:result.id});return active;
  })();pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
 }
 function showInvite(){
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){root.PlayroomAccountUI.show({onReady:()=>showInvite()});return;}
  secret=null;error='';notice='';B().openModal(`${B().modalHead(t('invite-player'))}<div class="social-content"></div>`,'lobby-invites-modal',{onBack:()=>B().renderLobby()});render();void execute(()=>ensure());
 }
 function incoming(){
  B().openModal(`${B().modalHead(t('join-game'))}<div class="settings-shortcuts">${H().iconButton('data-friends-open',t('friends'),'people')}</div><div class="social-content" data-incoming-content></div>`,'lobby-incoming-modal');
  renderIncoming();if(['account','guest'].includes(A().snapshot().kind))void refreshIncoming();
 }
 function incomingBusy(value){
  const el=document.querySelector('[data-incoming-content]');if(!el)return;
  el.setAttribute('aria-busy',String(value));for(const control of el.querySelectorAll('button,fieldset'))control.disabled=value;
  if(value)el.querySelector('[data-incoming-message]').textContent=t('waiting');
 }
 function renderIncoming(errorText=''){
  const el=document.querySelector('[data-incoming-content]');if(!el)return;const s=S().snapshot(),esc=H().esc;
  if(!el.querySelector('[data-lobby-join-code]'))el.innerHTML=`<ul data-incoming-list></ul><form data-lobby-join-code><fieldset><label class="field"><span>${t('invite-code')}</span><input name="token" required maxlength="64" autocomplete="off"></label>${H().button({type:'submit',label:t('join')})}</fieldset></form><div class="account-actions">${button('refresh-incoming','refresh')}${button('manual','manual')}</div><p data-incoming-message role="status" aria-live="polite"></p>`;
  el.querySelector('[data-incoming-list]').innerHTML=(s.invitations||[]).map(i=>`<li><span><strong>${esc(i.roomName)}</strong><small>${esc(i.fromName)}</small></span>${button('accept-invite','join',`data-id="${esc(i.id)}"`)}</li>`).join('')+s.rooms.filter(r=>r.ownerId!==A().snapshot().id).map(r=>`<li><span>${esc(r.name)}</span>${button('connect','connect-cloud',`data-room="${esc(r.id)}"`)}</li>`).join('');
  const msg=el.querySelector('[data-incoming-message]');msg.textContent=errorText;msg.setAttribute('role',errorText?'alert':'status');
 }
 async function refreshIncoming(){if(busy)return;busy=true;incomingBusy(true);try{await S().refresh();renderIncoming();}catch(e){renderIncoming(root.PlayroomSocialUI.message(e));}finally{busy=false;incomingBusy(false);}}
 async function connect(data){
  if(busy)return;busy=true;incomingBusy(true);try{
   if(A().snapshot().kind==='local')await A().ensureGuest();
   const result=data.roomId?{id:data.roomId}:await S().perform('join',{...data,nickname:B().profile()?.name||t('guest-name')});
   await root.PlayroomCloudNetwork.connect(result.id);
  }catch(e){const msg=document.querySelector('[data-incoming-message]');if(msg){msg.textContent=root.PlayroomSocialUI.message(e);msg.setAttribute('role','alert');}}finally{busy=false;incomingBusy(false);}
 }
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-lobby-invite]')){showInvite();return;}
  if(event.target.closest('[data-lobby-incoming]')){incoming();return;}
  const btn=event.target.closest('[data-lobby-online]');if(!btn)return;const action=btn.dataset.lobbyOnline;
  if(action==='manual'){root.PlayroomNetworkLibrary.showManualJoin();return;}
  if(action==='friends'){root.PlayroomSocialUI.show({onBack:document.querySelector('.lobby-invites-modal')?()=>showInvite():()=>incoming()});return;}
  if(action==='refresh-incoming'){if(!busy)void refreshIncoming();return;}
  if(action==='accept-invite'){void connect({inviteId:btn.dataset.id});return;}
  if(action==='connect'){void connect({roomId:btn.dataset.room});return;}
  if(action==='copy'){const input=document.querySelector('.lobby-invites-modal .social-code');if(input){input.select();void execute(async()=>{if(root.navigator.clipboard?.writeText)await root.navigator.clipboard.writeText(input.value);notice=t('copied');});}return;}
  void execute(async()=>{await ensure();if(action==='guest'||action==='invite'){const result=await S().perform('invite',{roomId:active.id,userId:action==='invite'?btn.dataset.user:null});if(action==='guest')secret=result;notice=t(action==='invite'?'invitation-sent':'share-code');}else if(action==='revoke'){await S().perform('revoke',{roomId:active.id,id:btn.dataset.id});secret=null;}await S().perform('room',{roomId:active.id});});
 });
 document.addEventListener('submit',event=>{const f=event.target.closest('[data-lobby-join-code]');if(!f)return;event.preventDefault();void connect({token:f.elements.token.value.trim()});});
 root.PlayroomLobbyNetwork=Object.freeze({row,showInvite,incoming,render,get active(){return active;}});
})(globalThis);
