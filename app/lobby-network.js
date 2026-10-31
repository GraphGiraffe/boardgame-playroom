/* Lobby invitations and incoming connections. No gameplay or Auth protocol here. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,S=()=>root.PlayroomSocialUI.service,A=()=>root.PlayroomAccountUI.service,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 let onlineFriends=[],onlineGroups=[],onlineGroupsError='',active=null,onlineSettings=null,busy=false,error='',notice='',pending=null,loadedAt=0,details='';
 let incomingRooms=[],incomingTicket=0,incomingTimer=null,joinFlight=null,joinKey=null,joinGeneration=0,joinRetry=null;
 const C=()=>root.PlayroomCommunityUI.service;
 const context=()=>root.PlayroomNetworkLibrary.inviteContext();
 const button=(action,label,attrs='')=>H().button({attrs:`type="button" data-lobby-online="${action}" ${attrs}`,label:t(label),variant:'secondary'});
 function row({room,isHost,locked=false}){
  if(!isHost&&!(room.transportMode!=='hotseat'&&room.allowPlayerInvites))return '';
  if(room.transportMode==='hotseat')return '<span class="icon-btn lobby-add-player-reserve" aria-hidden="true"></span>';
  return H().iconButton(`id="network-pair-button" ${room.transportMode==='online'?'data-lobby-invite':''}`,t('invite-player'),'addPlayer',{disabled:locked});
 }
 function inviteLink(){const base=root.PlayroomNetworkConfig?.appUrl||(['http:','https:'].includes(root.location.protocol)?root.location.origin+root.location.pathname:'https://graphgiraffe.github.io/playroom-hod-test/');const url=new URL(base);url.hash=new URLSearchParams({'playroom-room':onlineSettings.roomCode||active.id,...(onlineSettings.passwordEnabled===false?{}:{password:onlineSettings.password})}).toString();return url.href;}
 function render(){
  const el=document.querySelector('.lobby-invites-modal .social-content');if(!el)return;
  const s=S().snapshot(),esc=H().esc;
  let body='';
  if(active&&onlineSettings){body=`<div class="online-room-controls"><div class="field online-room-number"><span>Номер комнаты</span><output class="room-password" data-online-room-code>#${esc(onlineSettings.roomCode)}</output></div>${onlineSettings?`<div class="field"><label for="online-room-password">${t('room-password')}</label><div class="online-password-row"><output id="online-room-password" class="room-password" aria-label="${t('room-password')}">${onlineSettings.passwordEnabled===false?'------':esc(onlineSettings.password)}</output>${onlineSettings.canManage?H().iconButton(`data-lobby-online="password-toggle" aria-pressed="${onlineSettings.passwordEnabled!==false}"`,t(onlineSettings.passwordEnabled===false?'password-enable':'password-disable'),onlineSettings.passwordEnabled===false?'unlock':'lock'):''}${onlineSettings.canManage?H().iconButton('data-lobby-online="rotate"',t('rotate'),'reset'):''}${H().iconButton('data-lobby-online="copy-password"',t('copy-password'),'copy')}</div></div><label class="field"><span>${t('visibility')}</span><select data-online-visibility ${onlineSettings.canManage?'':'disabled'}>${['all','friends','hidden'].map(value=>`<option value="${value}" ${onlineSettings.visibility===value?'selected':''}>${t('visibility-'+value)}</option>`).join('')}</select></label><div class="field"><label for="online-room-link">${t('invite-link')}</label><div class="online-link-row"><input id="online-room-link" class="social-code" readonly data-online-link value="${esc(inviteLink())}">${H().iconButton('data-lobby-online="copy-link"',t('copy-link'),'copy')}</div></div>`:''}</div><section class="online-friends">${onlineSettings?.canManage?`<label class="switch online-permission"><span>${t('allow-player-invites')}</span><input type="checkbox" data-online-permission ${onlineSettings.allowPlayerInvites?'checked':''}></label>`:''}<h3>${t('friends-and-groups')}</h3><div class="social-list" tabindex="0" aria-label="${t('friends-and-groups')}"><ul>${onlineFriends.filter(f=>f.accepted).map(f=>{const invite=onlineSettings?.invites?.find(i=>i.targetId===f.userId&&!i.revoked&&!i.declined&&!i.used&&Date.parse(i.expiresAt)>Date.now());return root.PlayroomFriendCard.row(f,{attrs:`data-online-chat="${esc(f.userId)}"`,actions:invite?H().iconButton(`data-lobby-online="revoke" data-id="${esc(invite.id)}"`,t('revoke'),'close'):H().iconButton(`data-lobby-online="invite" data-user="${esc(f.userId)}"`,t('invite-friend'),'addPlayer')});}).join('')}${onlineGroups.map(g=>root.PlayroomGroupUI.row(g,{attrs:`data-online-group="${esc(g.id)}"`,actions:H().iconButton(`data-lobby-online="invite-group" data-group="${esc(g.id)}"`,'Пригласить группу','addPlayer')})).join('')}</ul>`;
   if(!onlineFriends.some(f=>f.accepted)&&!onlineGroups.length)body+=`<p class="muted">${t('no-friends')}</p>`;if(onlineGroupsError)body+=`<p class="muted">${esc(onlineGroupsError)}</p>`;body+='</div></section>';
  }
  if(!onlineSettings)body=busy?'<p role="status">'+t('waiting')+'</p>':'';
  if(!onlineSettings&&error)body+=H().button({attrs:'data-lobby-online="retry"',label:'Повторить',icon:'reset',variant:'secondary'});
  const signature=JSON.stringify([active,onlineFriends,onlineGroups,onlineGroupsError,s.room,onlineSettings,!onlineSettings&&busy,!onlineSettings&&error]);if(el.dataset.view!==signature){el.dataset.view=signature;root.PlayroomDOM.ListController.update(el,body+'<p data-online-message role="status" aria-live="polite"></p>');}
  for(const e of el.querySelectorAll('button,select,input[type=checkbox]'))e.disabled=busy||s.busy||onlineSettings?.passwordEnabled===false&&e.matches('[data-lobby-online=rotate],[data-lobby-online=copy-password]')||e.matches('[data-online-visibility],[data-online-permission]')&&!onlineSettings?.canManage;
  const msg=el.querySelector('[data-online-message]');if(!msg)return;msg.textContent=error||(notice===t('invitation-sent')?'':notice)||(busy&&!active?t('waiting'):'');msg.setAttribute('role',error?'alert':'status');
 }
 async function execute(fn){if(busy)return;busy=true;error='';notice='';render();try{await fn();}catch(e){error=root.PlayroomSocialUI.message(e);}finally{busy=false;render();}}
 function roomKey(){const ctx=context();return A().snapshot().id+':'+ctx.room?.id;}
 function reset(){active=null;onlineSettings=null;onlineFriends=[];onlineGroups=[];onlineGroupsError='';loadedAt=0;details='';}
 function adoptSettings(value){
  if(!/^\d{4}$/.test(value?.roomCode||''))throw Object.assign(Error('setup'),{code:'setup'});
  onlineSettings=value;
  const ctx=context();if(ctx.room?.ownerId===ctx.participantId&&ctx.room?.transportMode==='online'){
   B().setOnlineRoomCode(value.roomCode);B().setRoomInvitationPermission(!!value.allowPlayerInvites);
  }
 }
 async function ensure(){
  const ctx=context(),room=ctx.room,account=A().snapshot();
  if(account.kind!=='account'||account.recovery)throw Object.assign(Error('account-required'),{code:'account-required'});
  if(!room||room.transportMode!=='online')throw Object.assign(Error('lobby-required'),{code:'lobby-required'});
  const key=account.id+':'+room.id,metadata=JSON.stringify([room.name,room.game.name]);
  if(active?.key!==key)reset();
  if(pending?.key===key)return pending.promise;
  if(active&&onlineSettings&&details===metadata&&Date.now()-loadedAt<30000)return active;
  const current=()=>roomKey()===key&&context().room?.transportMode==='online';
  const check=()=>{if(!current())throw Object.assign(Error('account-changed'),{code:'account-changed'});};
  const promise=(async()=>{
   if(room.ownerId!==ctx.participantId){
    if(!ctx.cloudRoomId)throw Object.assign(Error('lobby-required'),{code:'lobby-required'});
    const settings=await C().call('settings',{roomId:ctx.cloudRoomId});check();active={id:ctx.cloudRoomId,key};adoptSettings(settings);
   }else{
    await root.PlayroomSocialUI.syncNickname();check();
    if(!active||details!==metadata){const result=await S().perform('lobby',{localRoomId:room.id,name:room.name});check();active={id:result.id,key};}
    await root.PlayroomCloudNetwork.host(active.id);check();
    const settings=await C().call('settings',{roomId:active.id,gameName:room.game.name});check();adoptSettings(settings);root.PlayroomCommunityUI.activate();
   }
   details=metadata;render();
   if(account.kind==='account'){
    const [hub,groups]=await Promise.allSettled([C().call('hub',root.PlayroomCommunityUI.presence()),C().call('group-list')]);check();
    if(hub.status==='rejected')throw hub.reason;onlineFriends=hub.value.friends;
    if(groups.status==='fulfilled'){onlineGroups=groups.value.groups;onlineGroupsError='';}else{onlineGroupsError='Не удалось загрузить группы. '+root.PlayroomSocialUI.message(groups.reason);}
   }
   loadedAt=Date.now();return active;
  })();pending={key,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
 }
 function showInvite(){
  if(context().room?.transportMode!=='online')return root.PlayroomNetworkLibrary.showManualInvite();
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){root.PlayroomAccountUI.show({onReady:()=>showInvite()});return;}
  if(active?.key!==roomKey())reset();error='';notice='';B().openModal(`${B().modalHead(t('invite-player'))}<div class="social-content"></div>`,'lobby-invites-modal',{size:'large',onBack:()=>root.PlayroomNetworkLibrary.openRoom()});render();if(!onlineSettings||Date.now()-loadedAt>=30000||details!==JSON.stringify([context().room.name,context().room.game.name]))void execute(()=>ensure());
 }
 function incoming(){
  if(root.PlayroomNetworkLibrary.hasActiveRoom())return false;
  incomingTicket++;clearTimeout(incomingTimer);incomingRooms=[];
  B().openModal(`${H().modalHead('Вход в комнату',{actions:H().iconButton('data-lobby-online="manual"','Сетевая игра','wifi')})}<div class="social-content" data-incoming-content></div>`,'lobby-incoming-modal');
  renderIncoming();void refreshIncoming();
 }
 function renderIncoming(errorText=''){
  const el=document.querySelector('[data-incoming-content]');if(!el)return;const esc=H().esc;
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){el.innerHTML=`<p>Для онлайн-комнат войдите в облачный аккаунт. Сетевая игра доступна по кнопке Wi-Fi.</p>${root.PlayroomAccountUI.markup()}`;return;}
  if(!el.querySelector('[data-lobby-join-code]'))el.innerHTML=`<form data-lobby-join-code><fieldset><label class="field incoming-code"><span class="username-editor room-number-editor"><span data-room-number-prefix aria-hidden="true">#</span><input class="social-code" name="token" required maxlength="2048" autocomplete="off" aria-label="Номер комнаты или ссылка" placeholder="..."></span></label>${H().button({type:'submit',icon:'play',label:'Войти'})}</fieldset></form><h3>Открытые комнаты</h3><div class="social-list incoming-rooms" tabindex="0" aria-label="Открытые комнаты"><ul data-incoming-list></ul></div><p data-incoming-message role="status" aria-live="polite"></p>`;
  const rooms=new Map();for(const room of [...(S().snapshot().rooms||[]),...incomingRooms])if(room.ownerId!==A().snapshot().id&&!room.closed&&room.available!==false&&(!room.hostUntil||Date.parse(room.hostUntil)>Date.now()))rooms.set(room.id,{...room,member:!!S().snapshot().rooms?.some(r=>r.id===room.id)});
  const markup=[...rooms.values()].map(r=>`<li class="incoming-room"><span class="incoming-room-meta"><strong>${esc(r.name)}</strong><small>${esc([r.gameName,r.roomCode?'#'+r.roomCode:r.ownerName].filter(Boolean).join(' · '))}</small></span>${H().button({attrs:`type="button" data-lobby-online="${r.member?'connect':'password-room'}" data-room="${esc(r.id)}" data-password-required="${r.hasPassword!==false}" data-name="${esc(r.name)}"`,icon:'play',label:'Войти',variant:'secondary'})}</li>`).join('');
  const list=el.querySelector('[data-incoming-list]');root.PlayroomDOM.ListController.update(list,markup||'<li class="incoming-empty">Нет открытых комнат</li>');
  const msg=el.querySelector('[data-incoming-message]');msg.textContent=errorText;msg.setAttribute('role',errorText?'alert':'status');
 }
 async function refreshIncoming(){
  const ticket=++incomingTicket;clearTimeout(incomingTimer);
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){renderIncoming();return;}
  try{const [,rooms]=await Promise.all([S().refresh(),C().call('discover')]);if(ticket!==incomingTicket||!document.querySelector('[data-incoming-content]'))return;incomingRooms=rooms;renderIncoming();}
  catch(error){if(ticket===incomingTicket)renderIncoming(root.PlayroomSocialUI.message(error));}
  finally{if(ticket===incomingTicket&&document.querySelector('[data-incoming-content]'))incomingTimer=setTimeout(()=>{if(document.querySelector('[data-incoming-content]'))void refreshIncoming();},5000);}
 }
 function cancelJoin(){joinGeneration++;joinFlight=null;joinKey=null;joinRetry=null;root.PlayroomNetworkLibrary.cancelJoin();}
 function enterRoom(key,resolve){
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){root.PlayroomAccountUI.show({onReady:()=>enterRoom(key,resolve)});return Promise.resolve(false);}
  if(joinFlight&&joinKey===key)return joinFlight;
  const back=root.PlayroomChatUI.captureReturn()||root.PlayroomRoomChatUI.captureReturn()||B().captureModalReturn();
  cancelJoin();const ticket=joinGeneration;joinKey=key;joinRetry=()=>enterRoom(key,resolve);
  B().openModal(`${H().modalHead('Вход в комнату')}<p data-joining-message role="status">Подключение…</p><div class="modal-foot" data-joining-actions hidden>${H().button({attrs:'data-lobby-retry-join',icon:'play',label:'Войти'})}</div>`,'online-connecting-modal',{onBack:()=>{cancelJoin();back?.();}});
  joinFlight=(async()=>{try{const room=await resolve();if(ticket!==joinGeneration)return false;await root.PlayroomCloudNetwork.connect(room.id);return ticket===joinGeneration;}
   catch(error){if(ticket!==joinGeneration||error.code==='cancelled')return false;const message=document.querySelector('[data-joining-message]');if(message){message.textContent=error.code==='connection-timeout'?'Соединение не установлено. Попробуйте ещё раз.':root.PlayroomSocialUI.message(error);message.setAttribute('role','alert');document.querySelector('[data-joining-actions]').hidden=false;}return false;}
   finally{if(ticket===joinGeneration){joinFlight=null;joinKey=null;}}})();return joinFlight;
 }
 function connect(data){return enterRoom(data.roomId||data.inviteId||data.token,()=>data.roomId?Promise.resolve({id:data.roomId}):S().perform('join',{...data,nickname:B().profile()?.name||t('guest-name')}));}
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-lobby-retry-join]')){void joinRetry?.();return;}
  const friend=event.target.closest('[data-online-chat]');if(friend){const person=onlineFriends.find(f=>f.userId===friend.dataset.onlineChat);if(person)root.PlayroomChatUI.show(person,{onBack:B().captureModalReturn()});return;}
  const group=event.target.closest('[data-online-group]');if(group){const entry=onlineGroups.find(g=>g.id===group.dataset.onlineGroup);if(entry)root.PlayroomGroupUI.open(entry,{onBack:B().captureModalReturn()});return;}
  if(event.target.closest('[data-lobby-invite]')){showInvite();return;}
  if(event.target.closest('[data-lobby-incoming]')){incoming();return;}
  const btn=event.target.closest('[data-lobby-online]');if(!btn)return;const action=btn.dataset.lobbyOnline;
  if(action==='password-room'){const room={id:btn.dataset.room,name:btn.dataset.name};askPassword(room,{required:btn.dataset.passwordRequired!=='false'});if(btn.dataset.passwordRequired==='false')void joinPassword({...room,password:'',promptIfRequired:true});return;}
  if(action==='manual'){root.PlayroomNetworkLibrary.showManualJoin();return;}
  if(action==='retry'){void execute(()=>ensure());return;}
  if(action==='friends'){root.PlayroomSocialUI.show({onBack:document.querySelector('.lobby-invites-modal')?()=>showInvite():()=>incoming()});return;}
  if(action==='invite-group'){const group=onlineGroups.find(g=>g.id===btn.dataset.group);if(group)void execute(async()=>{if(await inviteGroup(group))notice=t('invitation-sent');});return;}
  if(action==='accept-invite'){void connect({inviteId:btn.dataset.id});return;}
  if(action==='connect'){void connect({roomId:btn.dataset.room});return;}
  if(['copy-link','copy-password'].includes(action)){const value=action==='copy-link'?inviteLink():onlineSettings.password;void execute(async()=>{if(root.navigator.clipboard?.writeText)await root.navigator.clipboard.writeText(value);else {const node=document.querySelector(action==='copy-link'?'[data-online-link]':'#online-room-password');if(node?.select)node.select();else if(node){const range=document.createRange();range.selectNodeContents(node);const selection=root.getSelection();selection.removeAllRanges();selection.addRange(range);}}notice=t('copied');});return;}
  void execute(async()=>{await ensure();if(action==='rotate')onlineSettings=await C().call('rotate',{roomId:active.id});else if(action==='password-toggle')onlineSettings=await C().call('password-enabled',{roomId:active.id,enabled:onlineSettings.passwordEnabled===false});else if(action==='invite'){if(await inviteUser(btn.dataset.user))notice=t('invitation-sent');}else if(action==='revoke'){await C().call('revoke',{roomId:active.id,id:btn.dataset.id});}adoptSettings(await C().call('settings',{roomId:active.id}));loadedAt=Date.now();});
 });
 document.addEventListener('input',event=>{const input=event.target;if(!input.matches('[data-lobby-join-code] [name=token]'))return;const value=input.value.replace(/^#+\s*/,'');if(value!==input.value){const start=input.selectionStart,end=input.selectionEnd,removed=input.value.length-value.length;input.value=value;input.setSelectionRange(Math.max(0,start-removed),Math.max(0,end-removed));}input.parentElement.querySelector('[data-room-number-prefix]').hidden=/^[a-z][a-z0-9+.-]*:/i.test(input.value.trim());});
 document.addEventListener('submit',event=>{const f=event.target.closest('[data-lobby-join-code]');if(!f)return;event.preventDefault();const token=f.elements.token.value.trim();const link=parseLink(token);if(link){void joinPassword(link);return;}if(/^#?\d{4}$/.test(token)){const roomCode=token.replace('#','');askPassword({roomCode},{required:false});void joinPassword({roomCode,promptIfRequired:true});return;}void connect({token});});
 function parseLink(value){try{const u=new URL(value),q=new URLSearchParams(u.hash.slice(1));const id=q.get('playroom-room'),password=q.get('password');return /^(?:[0-9a-f-]{36}|\d{4})$/i.test(id||'')&&(password===null||/^[A-Z2-9]{6}$/i.test(password))?{...(/^\d{4}$/.test(id)?{roomCode:id}:{id}),password:(password||'').toUpperCase(),promptIfRequired:!password}:null;}catch(_){return null;}}
 function joinPassword({id,roomCode,password='',promptIfRequired=false}){
  return enterRoom(id||roomCode,async()=>{try{return await C().call('join-password',{...(roomCode?{roomCode}:{roomId:id}),password,nickname:B().profile()?.name||t('guest-name')});}catch(error){if(error.code==='room-password'){askPassword({id,roomCode});if(password)document.querySelector('[data-password-message]').textContent=root.PlayroomSocialUI.message(error);throw Object.assign(Error('cancelled'),{code:'cancelled'});}throw error;}});
 }
 function askPassword(room,{required=true}={}){B().openModal(`${H().modalHead(room.name||(room.roomCode?'#'+room.roomCode:'Пароль комнаты'))}<form data-room-password="${H().esc(room.id||'')}" data-room-number="${H().esc(room.roomCode||'')}">${required?`<label class="field"><span>${t('room-password')}</span>${root.PlayroomRoomPassword.markup(t('room-password'))}</label>`:''}${H().button({type:'submit',icon:'play',label:'Войти'})}</form><p data-password-message role="status" aria-live="polite"></p>`,'online-password-modal');}
 document.addEventListener('submit',event=>{const form=event.target.closest('[data-room-password]');if(!form)return;event.preventDefault();if(form.elements.password){root.PlayroomRoomPassword.sync(form.elements.password);if(!/^[A-Z2-9]{6}$/.test(form.elements.password.value)){form.elements.password.reportValidity();return;}}void joinPassword({id:form.dataset.roomPassword||undefined,roomCode:form.dataset.roomNumber||undefined,password:form.elements.password?.value.toUpperCase()||'',promptIfRequired:!form.elements.password});});
 document.addEventListener('change',event=>{if(event.target.matches('[data-online-permission]')){const allowed=event.target.checked;void execute(async()=>{adoptSettings(await C().call('permission',{roomId:active.id,allowPlayerInvites:allowed}));loadedAt=Date.now();});return;}if(!event.target.matches('[data-online-visibility]'))return;const visibility=event.target.value;void execute(async()=>{adoptSettings(await C().call('visibility',{roomId:active.id,visibility}));loadedAt=Date.now();});});
 async function inviteUser(userId,{nickname}={}){const identity=A().snapshot().id,name=nickname||onlineFriends.find(f=>f.userId===userId)?.nickname||t('guest-name');if(!await H().confirmDialog(root.PlayroomMessages.text('ui.community.invite-confirm',{name})))return false;if(A().snapshot().id!==identity)throw Object.assign(Error('account-changed'),{code:'account-changed'});await ensure();await C().call('invite',{roomId:active.id,userId});return true;}
 async function playWith(target){const identity=A().snapshot().id,onCancel=B().captureModalReturn(),id=crypto.randomUUID();return B().startOnlineGame({onCancel,onSelect:async()=>{if(A().snapshot().id!==identity)throw Object.assign(Error('account-changed'),{code:'account-changed'});const localId=B().room()?.id;await ensure();if(A().snapshot().id!==identity||B().room()?.id!==localId)throw Object.assign(Error('account-changed'),{code:'account-changed'});await C().call(target.groupId?'group-invite-room':'invite',{roomId:active.id,...(target.groupId?{groupId:target.groupId,id}:{userId:target.userId})});}});}
 async function closeRoom(localId){const key=A().snapshot().id+':'+localId,ctx=context(),cloudId=active?.key===key?active.id:ctx?.room?.id===localId&&ctx.room.ownerId===ctx.participantId?ctx.cloudRoomId:null;if(!cloudId)return;await S().perform('close',{roomId:cloudId});reset();}
 async function inviteGroup(group,{id=crypto.randomUUID()}={}){const identity=A().snapshot().id;if(!await H().confirmDialog(`Пригласить группу «${group.name}» в комнату?`))return false;if(A().snapshot().id!==identity)throw Object.assign(Error('account-changed'),{code:'account-changed'});await ensure();await C().call('group-invite-room',{groupId:group.id,roomId:active.id,id});return true;}
 function joinInvitation(inviteId,{roomId,ownerId}={}){const ctx=context();if(roomId&&root.PlayroomCloudNetwork.roomId()===roomId&&ctx.room){root.PlayroomNetworkLibrary.openRoom();return Promise.resolve(true);}if(ownerId&&ownerId===A().snapshot().id){B().toast('Ваша комната не открыта на этом устройстве. Откройте её через «Мои партии».');B().showSessions();return Promise.resolve(false);}return connect({inviteId});}
 function init(){root.addEventListener('playroom:groups-updated',event=>{if(event.detail?.accountId===A().snapshot().id){onlineGroups=event.detail.groups;onlineGroupsError='';render();}});root.addEventListener('playroom:modal-restored',()=>{if(document.querySelector('[data-incoming-content]'))void refreshIncoming();});let identity=A().snapshot().id;A().subscribe(()=>{if(identity!==A().snapshot().id){identity=A().snapshot().id;reset();error='';notice='';render();if(document.querySelector('[data-incoming-content]'))void refreshIncoming();}});const link=parseLink(root.location.href);if(!link)return;const clean=new URL(root.location.href);clean.hash='';root.history.replaceState(root.history.state,'',clean.href);const run=()=>{askPassword({id:link.id,roomCode:link.roomCode},{required:!!link.password});const input=document.querySelector('[data-room-password] [name=password]');if(input){input.value=link.password;root.PlayroomRoomPassword.sync(input);}void joinPassword(link);};if(B().profile()?.name)queueMicrotask(run);else root.addEventListener('playroom:profile-ready',run,{once:true});}
 root.PlayroomLobbyNetwork=Object.freeze({row,showInvite,incoming,render,init,inviteUser,inviteGroup,joinInvitation,reconnectRoom:roomId=>connect({roomId}),closeRoom,playWith,get active(){return active;}});
})(globalThis);
