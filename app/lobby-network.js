/* Lobby invitations and incoming connections. No gameplay or Auth protocol here. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,S=()=>root.PlayroomSocialUI.service,A=()=>root.PlayroomAccountUI.service,t=key=>root.PlayroomMessages.text('ui.social.'+key);
 let onlineFriends=[],onlineGroups=[],onlineGroupsError='',active=null,onlineSettings=null,busy=false,error='',notice='',pending=null,loadedAt=0,details='';
 let incomingRooms=[],incomingTicket=0,incomingTimer=null,incomingView=null,joinFlight=null,joinKey=null,joinGeneration=0,joinRetry=null;
 const C=()=>root.PlayroomCommunityUI.service;
 const context=()=>root.PlayroomNetworkLibrary.inviteContext();
 const button=(action,label,attrs='')=>H().button({attrs:`type="button" data-lobby-online="${action}" ${attrs}`,label:t(label),variant:'secondary'});
 function row({room,isHost,locked=false}){
  if(!isHost&&!(room.transportMode!=='hotseat'&&room.allowPlayerInvites))return '';
  if(room.transportMode==='hotseat')return '';
  return H().button({attrs:`id="network-pair-button" ${room.transportMode==='online'?'data-lobby-invite':''}`,label:'Пригласить',icon:'addPlayer',variant:'secondary',disabled:locked});
 }
 function inviteLink(){const base=root.PlayroomNetworkConfig?.appUrl||(['http:','https:'].includes(root.location.protocol)?root.location.origin+root.location.pathname:'https://graphgiraffe.github.io/playroom-hod-test/');const url=new URL(base);url.hash=new URLSearchParams({'playroom-room':onlineSettings.roomCode||active.id,...(onlineSettings.passwordEnabled===false?{}:{password:onlineSettings.password})}).toString();return url.href;}
 const tabs=['friends','groups','link'],tabLabels=['Друзья','Группы','Ссылка'];
 let inviteView=null,accessView=null,viewRegistry=null,execution=0,roomGeneration=0;
 const accountRevision=()=>C().generation;
 function viewKey(){const c=context();return [A().snapshot().id,accountRevision(),c.room?.id,c.participantId,c.room?.ownerId].join(':');}
 function canInvite(){const c=context();return c.room?.transportMode==='online'&&c.room.phase==='lobby'&&(c.room.ownerId===c.participantId||c.room.allowPlayerInvites);}
 function currentView(view){return !!view&&view.frame?.state!=='disposed'&&view.key===viewKey()&&canInvite();}
 function viewRoot(view,selector){return currentView(view)&&view.frame?.state!=='disposed'?view.frame?.element.querySelector(selector):null;}
 function liveInvite(userId){return onlineSettings?.invites?.find(i=>i.targetId===userId&&!i.revoked&&!i.declined&&!i.used&&Date.parse(i.expiresAt)>Date.now());}
 function inviteBody(view){
  const esc=H().esc,c=context(),link=view.tab==='link',query=view.query.trim().toLocaleLowerCase('ru'),groups=view.tab==='groups';
  const choices=groups?onlineGroups:onlineFriends.filter(f=>f.accepted),filtered=choices.filter(item=>[item.name,item.nickname,item.username].filter(Boolean).join(' ').toLocaleLowerCase('ru').includes(query));
  const rows=filtered.map(item=>{const id=groups?item.id:item.userId,name=groups?item.name:item.nickname,key=(groups?'group:':'friend:')+id,invitation=groups?null:liveInvite(id),sent=groups?view.sentGroups.has(id):!!invitation,selected=view.selected.has(key);return `<div class="invite-v021-person" data-entity="invite-person-${esc(key)}"><button type="button" class="invite-v021-selection" data-invite-select="${esc(key)}" aria-pressed="${selected}" ${busy||sent?'disabled':''}>${root.TabletopUI.avatar({name,avatar:item.avatar},0,{hidden:true})}<span class="invite-v021-person-copy"><strong>${esc(name)}</strong><small>${sent?'Приглашение отправлено':groups?'Группа':'Друг'}</small></span><span class="invite-v021-pick" aria-hidden="true">${selected||sent?H().icon('check'):''}</span></button>${invitation?`<button type="button" class="invite-v021-revoke" data-lobby-online="revoke" data-id="${esc(invitation.id)}" ${busy?'disabled':''}>Отменить</button>`:''}</div>`;}).join('');
  const loading=!onlineSettings,body=link?`<section class="invite-v021-link"><h3>Ссылка на комнату</h3>${loading?'<p role="status">Загружаем ссылку…</p>':`<label class="invite-v021-link-field"><span>Ссылка</span><input id="online-room-link" readonly data-online-link value="${esc(inviteLink())}"></label><p>Номер комнаты <output data-online-room-code>#${esc(onlineSettings.roomCode)}</output></p>${H().button({attrs:'type="button" data-lobby-online="share-link"',label:'Поделиться…',icon:'send',disabled:busy||!root.navigator.share})}${!root.navigator.share?'<small>Системное меню недоступно. Можно скопировать ссылку.</small>':''}${H().button({attrs:'type="button" data-lobby-online="copy-link"',label:'Скопировать ссылку',icon:'copy',variant:'secondary',disabled:busy})}${H().button({attrs:'type="button" data-lobby-online="copy-code"',label:'Копировать код',icon:'copy',variant:'secondary',disabled:busy})}`}</section>`:`<label class="invite-v021-search"><span>Поиск</span><input type="search" data-invite-search value="${esc(view.query)}" placeholder="Имя друга или название группы" autocomplete="off" ${busy?'disabled':''}></label><div class="invite-v021-results" role="group" aria-label="${groups?'Группы':'Друзья'}" data-invite-results>${loading?'<p role="status">Загружаем адресатов…</p>':rows||`<p class="muted">${query?'Совпадений нет. Измените запрос.':groups?'У вас пока нет групп.':'У вас пока нет друзей. Приглашение можно отправить ссылкой.'}</p>`}</div>${groups&&onlineGroupsError?`<p role="alert">${esc(onlineGroupsError)}</p>${H().button({attrs:'data-lobby-online="retry"',label:'Загрузить группы ещё раз',icon:'reset',variant:'secondary',disabled:busy})}`:''}<small class="invite-v021-count">Выбрано: ${view.selected.size}</small>${H().button({attrs:'type="button" data-lobby-online="send-selected"',label:view.sending?'Отправляем…':view.sent&&!view.selected.size?'Приглашения отправлены':view.retry?'Повторить отправку':'Отправить приглашение',icon:view.sent&&!view.selected.size?'check':'send',disabled:busy||loading||!view.selected.size})}`;
  return `<p class="invite-v021-context">${esc(c.room.game.name)} · комната ${esc(onlineSettings?.roomCode||c.room.code||c.room.name)}</p><div class="invite-v021-tabs" role="tablist" aria-label="Кому отправить приглашение">${tabs.map((tab,i)=>`<button type="button" role="tab" data-invite-tab="${tab}" id="invite-tab-${tab}" aria-controls="invite-page" aria-selected="${view.tab===tab}" tabindex="${view.tab===tab?0:-1}" ${busy?'disabled':''}>${tabLabels[i]}</button>`).join('')}</div><div id="invite-page" class="invite-v021-page" role="tabpanel" aria-labelledby="invite-tab-${view.tab}">${body}</div>${loading&&error?H().button({attrs:'data-lobby-online="retry"',label:'Повторить',icon:'reset',variant:'secondary'}):''}<p data-online-message role="${error?'alert':'status'}" aria-live="polite">${esc(error||notice||(view.sending?'Отправляем приглашения…':loading&&busy?'Загружаем…':''))}</p>`;
 }
 function accessBody(){
  const esc=H().esc,manage=onlineSettings?.canManage&&context().room?.ownerId===context().participantId;
  if(!onlineSettings)return `<p role="status">${esc(error||'Загружаем параметры доступа…')}</p>${error?H().button({attrs:'data-lobby-online="retry"',label:'Повторить',variant:'secondary'}):''}`;
  return `<p class="muted">${esc(context().room.name)} · #${esc(onlineSettings.roomCode)}</p><label class="field"><span>Кто видит комнату</span><select data-online-visibility ${busy||!manage?'disabled':''}>${['all','friends','hidden'].map(value=>`<option value="${value}" ${onlineSettings.visibility===value?'selected':''}>${t('visibility-'+value)}</option>`).join('')}</select></label><label class="room-v021-auto"><span>Игроки могут приглашать</span><input type="checkbox" data-online-permission ${onlineSettings.allowPlayerInvites?'checked':''} ${busy||!manage?'disabled':''}><span class="room-v021-toggle" aria-hidden="true"><span></span></span></label><label class="room-v021-auto"><span>Пароль комнаты</span><input type="checkbox" data-online-password-enabled ${onlineSettings.passwordEnabled!==false?'checked':''} ${busy||!manage?'disabled':''}><span class="room-v021-toggle" aria-hidden="true"><span></span></span></label><div class="online-password-row"><output id="online-room-password" class="room-password" aria-label="Пароль комнаты">${onlineSettings.passwordEnabled===false?'------':esc(onlineSettings.password)}</output></div><div class="menu-list">${[['rotate','Сменить пароль'],['copy-password','Скопировать пароль']].map(([action,label])=>`<button type="button" class="menu-row" data-lobby-online="${action}" ${busy||!manage||onlineSettings.passwordEnabled===false?'disabled':''}><span>${label}</span><span class="menu-row-chevron" aria-hidden="true">›</span></button>`).join('')}</div><p data-online-message role="${error?'alert':'status'}" aria-live="polite">${esc(error||notice)}</p>`;
 }
 function render(){
  if(inviteView&&!currentView(inviteView)||accessView&&!currentView(accessView)){viewRegistry||=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});viewRegistry.invalidate();}
  const invite=viewRoot(inviteView,'[data-invite-content]'),access=viewRoot(accessView,'[data-room-online-access-content]');
  if(invite)root.PlayroomDOM.ListController.update(invite,inviteBody(inviteView));
  if(access)root.PlayroomDOM.ListController.update(access,accessBody());
 }
 async function sendSelected(view){
  if(!currentView(view)||view.frame?.state!=='active'||!view.selected.size)return;
  const selected=[...view.selected],assert=()=>{if(!currentView(view))throw Object.assign(Error('account-changed'),{code:'account-changed'});};
  await ensure();assert();let sent=0;
  for(const [key,target]of selected){
   assert();try{await C().call(target.kind==='group'?'group-invite-room':'invite',target.kind==='group'?{groupId:target.id,roomId:active.id,id:target.nonce}:{roomId:active.id,userId:target.id});assert();view.selected.delete(key);if(target.kind==='group')view.sentGroups.add(target.id);sent++;render();}
   catch(failure){view.retry=true;throw Object.assign(Error(`Не удалось отправить приглашение «${target.name}». ${root.PlayroomSocialUI.message(failure)}${sent?' Уже отправлено: '+sent+'.':''}`),{code:'invite-send'});}
  }
  assert();const settings=await C().call('settings',{roomId:active.id});assert();adoptSettings(settings);view.sent=true;view.retry=false;notice='Приглашения отправлены: '+sent+'.';loadedAt=Date.now();
 }
 async function execute(fn){if(busy)return;const owner=viewKey(),ticket=++execution;busy=true;error='';notice='';render();try{await fn();}catch(e){if(viewKey()===owner)error=e.code==='invite-send'?e.message:root.PlayroomSocialUI.message(e);}finally{if(ticket===execution){busy=false;render();}}}
 function roomKey(){const ctx=context();return A().snapshot().id+':'+ctx.room?.id;}
 function reset(){roomGeneration++;execution++;busy=false;active=null;onlineSettings=null;onlineFriends=[];onlineGroups=[];onlineGroupsError='';loadedAt=0;details='';}
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
  const key=account.id+':'+room.id,identity=viewKey(),metadata=JSON.stringify([room.name,room.game.name,room.ownerId,accountRevision()]);
  if(active&&active.key!==key)reset();
  if(pending?.identity===identity)return pending.promise;
  if(active&&onlineSettings&&details===metadata&&Date.now()-loadedAt<30000)return active;
  const current=()=>roomKey()===key&&viewKey()===identity&&canInvite();
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
  })();pending={key,identity,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
 }
 function showInvite(){
  if(context().room?.transportMode!=='online')return root.PlayroomNetworkLibrary.showManualInvite();
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){root.PlayroomAccountUI.show({onReady:()=>showInvite()});return;}
  if(!canInvite())return B().toast('Приглашать можно из лобби открытой комнаты, если хост разрешил приглашения.');
  if(active?.key!==roomKey())reset();error='';notice='';const back=B().captureModalReturn(),view={key:viewKey(),tab:'friends',query:'',selected:new Map(),sentGroups:new Set(),sent:false,retry:false,frame:null};inviteView=view;
  view.frame=B().openModal(`${H().modalHead('Пригласить')}<div class="invite-v021" data-invite-content></div><footer class="invite-v021-footer" data-fixed-footer>${H().button({attrs:'data-command="close-modal"',label:'Вернуться в комнату',icon:'back',variant:'secondary'})}</footer>`,'lobby-invites-modal',{size:'large',valid:()=>currentView(view),onBack:back,onDispose:()=>{if(inviteView===view)inviteView=null;}});render();
  if(!onlineSettings||Date.now()-loadedAt>=30000||details!==JSON.stringify([context().room.name,context().room.game.name,context().room.ownerId,accountRevision()]))void execute(()=>ensure());
 }
 function showAccess(){
  const c=context();if(!canInvite()||c.room.ownerId!==c.participantId)return;
  if(active?.key!==roomKey())reset();error='';notice='';const back=B().captureModalReturn(),view={key:viewKey(),frame:null};accessView=view;
  view.frame=B().openModal(`${H().modalHead('Доступ в комнату')}<div class="room-online-access-021" data-room-online-access-content></div>`,'room-online-access-modal',{valid:()=>currentView(view)&&context().room.ownerId===context().participantId,onBack:back,onDispose:()=>{if(accessView===view)accessView=null;}});render();void execute(()=>ensure());
 }
 const incomingRoot=view=>view&&incomingView===view&&view.frame?.state!=='disposed'?view.frame?.element.querySelector('[data-incoming-content]'):null;
 const incomingAccount=()=>{const a=A().snapshot();return a.kind==='account'&&!a.recovery?a.id:null;};
 function incoming({query='',lookup=null}={}){
  if(root.PlayroomNetworkLibrary.hasActiveRoom()){root.PlayroomNetworkLibrary.openRoom();return false;}
  incomingTicket++;clearTimeout(incomingTimer);incomingRooms=[];
  const view={frame:null,query,lookupPassword:'',joinPassword:'',preview:null,finding:false,findTicket:0,error:'',roomsError:'',roomsLoading:true,awaitingAccount:false};incomingView=view;
  view.frame=B().openModal(`${H().modalHead('Вход в комнату')}<div class="incoming-v021" data-incoming-content></div>`,'lobby-incoming-modal',{valid:()=>incomingView===view,onDispose:()=>{if(incomingView===view){incomingView=null;incomingTicket++;view.findTicket++;clearTimeout(incomingTimer);}}});
  renderIncoming();void refreshIncoming();if(lookup&&incomingAccount())void findIncoming(view,lookup);
 }
 function renderIncoming(){
  const view=incomingView,el=incomingRoot(view);if(!el)return;const esc=H().esc,account=incomingAccount();
  const room=view.preview,password=label=>root.PlayroomRoomPassword.markup(label);
  const rooms=new Map();if(account)for(const r of [...(S().snapshot().rooms||[]),...incomingRooms])if(r.ownerId!==account&&!r.closed&&r.available!==false&&(!r.hostUntil||Date.parse(r.hostUntil)>Date.now()))rooms.set(r.id,r);
  const open=el.querySelector('[data-incoming-discover]')?.open||false,lookupOpen=el.querySelector('[data-incoming-password-options]')?.open||!!view.lookupPassword;
  const card=room?`<section class="incoming-v021-preview" data-entity="preview:${esc(room.id)}" aria-label="Найденная комната"><strong>${esc(room.gameName||'Игра')} · ${esc(room.name||'Комната')}</strong><p>${room.ownerName?'Хост: '+esc(room.ownerName)+' · ':''}#${esc(room.roomCode)}</p><form data-online-preview-join><p class="muted">${room.hasPassword?'Для входа нужен пароль комнаты.':'Комната найдена. Подключение начнётся после нажатия «Войти в комнату».'}</p>${room.hasPassword?`<label class="field"><span>Пароль комнаты</span>${password('Пароль комнаты')}</label>`:''}${H().button({type:'submit',attrs:'data-online-preview-enter',label:'Войти в комнату',icon:'play'})}</form></section>`:'';
  const guest=account?'':`<section class="incoming-v021-account"><p>Для онлайн-игры нужен аккаунт. Войдите, чтобы найти комнату или открыть приглашение.</p><button type="button" class="menu-row" data-online-entry-account><span>Войти или создать аккаунт</span><span aria-hidden="true">›</span></button></section>`;
  const list=[...rooms.values()].map(r=>`<li data-entity="room:${esc(r.id)}"><button type="button" class="menu-row" data-online-preview-room="${esc(r.id)}"><span><strong>${esc(r.name||'Комната')}</strong><small>${esc([r.gameName,r.roomCode?'#'+r.roomCode:r.ownerName].filter(Boolean).join(' · '))}</small></span><span aria-hidden="true">›</span></button></li>`).join('');
  const markup=`${guest}<form data-lobby-join-code data-inline-actions><label class="field"><span>Номер комнаты или ссылка</span><input name="token" type="text" inputmode="text" required maxlength="2048" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="1234" value="${esc(view.query)}" ${!account?'disabled':''}></label>${account?`<details data-incoming-password-options ${lookupOpen?'open':''}><summary>Есть пароль приглашения?</summary><label class="field"><span>Пароль, если комната скрыта</span>${password('Пароль приглашения').replace('name="password"','name="lookupPassword"').replace(' required','')}</label></details>`:''}${H().button({type:'submit',attrs:'data-online-find',label:view.finding?'Ищем комнату…':'Найти комнату',icon:'search',disabled:!account||view.finding})}</form><p data-incoming-message role="${view.error?'alert':'status'}" aria-live="polite">${esc(view.error)}</p>${card}${account?`<details data-incoming-discover ${open?'open':''}><summary>Открытые комнаты</summary>${view.roomsError?`<p role="alert">${esc(view.roomsError)}</p><button type="button" class="menu-row" data-online-discover-retry><span>Повторить загрузку</span><span aria-hidden="true">›</span></button>`:view.roomsLoading?'<p role="status">Загружаем комнаты…</p>':`<ul class="incoming-v021-rooms">${list||'<li class="muted">Сейчас нет открытых комнат. Используйте номер или ссылку приглашения.</li>'}</ul>`}</details>`:''}<button type="button" class="menu-row incoming-v021-nearby" data-lobby-online="manual"><span><strong>Рядом · без интернета</strong><small>QR-код, звук или код подключения</small></span><span aria-hidden="true">›</span></button>`;
  root.PlayroomDOM.ListController.update(el,markup);
  const lookup=el.querySelector('[name=lookupPassword]'),join=el.querySelector('[data-online-preview-join] [name=password]');
  if(lookup){if(lookup.value!==view.lookupPassword)lookup.value=view.lookupPassword;root.PlayroomRoomPassword.sync(lookup);}if(join){if(join.value!==view.joinPassword)join.value=view.joinPassword;root.PlayroomRoomPassword.sync(join);}
 }
 function previewError(failure){return failure.code==='not-found'?'Комната не найдена или недоступна. Проверьте номер и пароль либо попросите новое приглашение.':['setup','forbidden','invalid'].includes(failure.code)?'Поиск комнат ещё не доступен на сервере. Обновите приложение или попробуйте позже.':root.PlayroomSocialUI.message(failure);}
 async function findIncoming(view=incomingView,selector=null){
  if(!incomingRoot(view)||view.frame.state!=='active'||!incomingAccount()||view.finding)return;
  const account=incomingAccount(),ticket=++view.findTicket,parsed=selector||parseLink(view.query.trim())||(/^#?\d{4}$/.test(view.query.trim())?{roomCode:view.query.trim().replace('#','')}:null);
  view.preview=null;view.error='';view.joinPassword='';
  if(!parsed){view.error='Введите номер из четырёх цифр или ссылку приглашения.';renderIncoming();return;}
  const password=parsed.password||view.lookupPassword,data={...(parsed.roomCode?{roomCode:parsed.roomCode}:{roomId:parsed.id}),...(password?{password}:{})};
  view.finding=true;renderIncoming();const valid=()=>incomingRoot(view)&&account===incomingAccount()&&ticket===view.findTicket;
  try{const value=await C().call('room-preview',data);if(!valid())return;if(!value?.id||!/^\d{4}$/.test(value.roomCode||'')||value.available!==true)throw Object.assign(Error('not-found'),{code:'not-found'});view.preview=value;view.joinPassword=password||'';if(selector?.id)view.query=value.roomCode;}
  catch(failure){if(valid())view.error=previewError(failure);}
  finally{if(valid()){view.finding=false;renderIncoming();if(view.frame.state==='active')view.frame.element.querySelector('.incoming-v021-preview')?.scrollIntoView({block:'nearest'});}}
 }
 async function refreshIncoming(){
  const view=incomingView;if(!incomingRoot(view)||view.frame.state!=='active')return;const ticket=++incomingTicket,account=incomingAccount();clearTimeout(incomingTimer);
  if(!account){view.roomsLoading=false;renderIncoming();return;}
  try{const [,rooms]=await Promise.all([S().refresh(),C().call('discover')]);if(ticket!==incomingTicket||!incomingRoot(view)||account!==incomingAccount())return;incomingRooms=rooms;view.roomsLoading=false;view.roomsError='';renderIncoming();}
  catch(failure){if(ticket===incomingTicket&&incomingRoot(view)&&account===incomingAccount()){view.roomsLoading=false;view.roomsError=root.PlayroomSocialUI.message(failure);renderIncoming();}}
  finally{if(ticket===incomingTicket&&incomingRoot(view)&&view.frame.state==='active')incomingTimer=setTimeout(()=>void refreshIncoming(),5000);}
 }
 function cancelJoin(){if(joinFlight)root.PlayroomCloudNetwork.stopClient();joinGeneration++;joinFlight=null;joinKey=null;joinRetry=null;root.PlayroomNetworkLibrary.cancelJoin();}
 function enterRoom(key,resolve){
  if(A().snapshot().kind!=='account'||A().snapshot().recovery){root.PlayroomAccountUI.show({onReady:()=>enterRoom(key,resolve)});return Promise.resolve(false);}
  if(joinFlight&&joinKey===key)return joinFlight;
  const back=root.PlayroomChatUI.captureReturn()||root.PlayroomRoomChatUI.captureReturn()||B().captureModalReturn();
  cancelJoin();const ticket=joinGeneration,identity=incomingAccount();joinKey=key;joinRetry=()=>identity===incomingAccount()?enterRoom(key,resolve):Promise.resolve(false);
  const frame=B().openModal(root.PlayroomConnectionProgress.markup(),'online-connecting-modal',{valid:()=>ticket===joinGeneration&&identity===incomingAccount(),onBack:()=>{cancelJoin();back?.();}});
  const stillOwned=()=>!!frame&&ticket===joinGeneration&&identity===incomingAccount()&&frame.state!=='disposed';
  const isCurrent=()=>stillOwned()&&frame?.state==='active';
  const paused=()=>{if(stillOwned())root.PlayroomConnectionProgress.showPaused(frame.element.querySelector('[data-connection-progress]'));};
  joinFlight=(async()=>{try{const room=await resolve(isCurrent);if(!isCurrent()){paused();return false;}await root.PlayroomCloudNetwork.connect(room.id);return ticket===joinGeneration;}
   catch(error){if(!stillOwned())return false;if(!isCurrent()){paused();return false;}if(error.code==='cancelled')return false;root.PlayroomConnectionProgress.showFailure(frame.element.querySelector('[data-connection-progress]'),error);return false;}
   finally{if(ticket===joinGeneration){joinFlight=null;joinKey=null;}}})();return joinFlight;
 }
 function connect(data){return enterRoom(data.roomId||data.inviteId||data.token,()=>data.roomId?Promise.resolve({id:data.roomId}):S().perform('join',{...data,nickname:B().profile()?.name||t('guest-name')}));}
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-surface-state="suspended"]'))return;
  const entry=incomingView,entryRoot=incomingRoot(entry),entryActive=entry?.frame?.state==='active'&&entryRoot?.contains(event.target);
  if(entryActive&&event.target.closest('[data-online-entry-account]')){entry.awaitingAccount=true;root.PlayroomAccountUI.show({onReady:()=>{if(incomingRoot(entry)){renderIncoming();entry.frame.element.querySelector('[name=token]')?.focus();}}});return;}
  if(entryActive&&event.target.closest('[data-online-discover-retry]')){void refreshIncoming();return;}
  const preview=event.target.closest('[data-online-preview-room]');if(entryActive&&preview){void findIncoming(entry,{id:preview.dataset.onlinePreviewRoom});return;}
  if(event.target.closest('[data-room-online-access]')){showAccess();return;}
  const invite=viewRoot(inviteView,'[data-invite-content]'),withinInvite=invite?.contains(event.target)&&inviteView.frame.state==='active';
  const tab=event.target.closest('[data-invite-tab]');if(tab&&withinInvite&&!busy){inviteView.tab=tab.dataset.inviteTab;render();return;}
  const selection=event.target.closest('[data-invite-select]');if(selection&&withinInvite&&!busy&&!selection.disabled){const key=selection.dataset.inviteSelect,[kind,id]=key.split(':');if(inviteView.selected.has(key))inviteView.selected.delete(key);else{const item=kind==='group'?onlineGroups.find(g=>g.id===id):onlineFriends.find(f=>f.userId===id&&f.accepted);if(!item)return;inviteView.selected.set(key,{kind,id,name:item.name||item.nickname,nonce:crypto.randomUUID()});}inviteView.sent=false;error='';notice='';render();return;}
  if(event.target.closest('[data-lobby-retry-join]')){void joinRetry?.();return;}
  const friend=event.target.closest('[data-online-chat]');if(friend){const person=onlineFriends.find(f=>f.userId===friend.dataset.onlineChat);if(person)root.PlayroomChatUI.show(person,{onBack:B().captureModalReturn()});return;}
  const group=event.target.closest('[data-online-group]');if(group){const entry=onlineGroups.find(g=>g.id===group.dataset.onlineGroup);if(entry)root.PlayroomGroupUI.open(entry,{onBack:B().captureModalReturn()});return;}
  if(event.target.closest('[data-lobby-invite]')){showInvite();return;}
  if(event.target.closest('[data-lobby-incoming]')){incoming();return;}
  const btn=event.target.closest('[data-lobby-online]');if(!btn)return;const action=btn.dataset.lobbyOnline;let actionView=null;
  if(action==='manual'){root.PlayroomNetworkLibrary.showManualJoin();return;}
  if(['send-selected','share-link','copy-link','copy-code','copy-password','rotate','password-toggle','revoke','retry','invite','invite-group'].includes(action)){
   const source=withinInvite?inviteView:viewRoot(accessView,'[data-room-online-access-content]')?.contains(btn)&&accessView.frame.state==='active'?accessView:null;
   if(!source||!currentView(source)||busy)return;actionView=source;
  }
  if(action==='send-selected'){const view=inviteView;if(busy||!view)return;view.sending=true;void execute(async()=>{try{await sendSelected(view);}finally{view.sending=false;}});return;}
  if(action==='share-link'){if(!root.navigator.share||!onlineSettings)return;const link=inviteLink(),room=context().room,view=actionView;void execute(async()=>{try{await root.navigator.share({title:room.game.name+' · '+room.name,text:'Приглашение в '+room.game.name,url:link});if(currentView(view))notice='Приглашение передано в выбранное приложение.';}catch(failure){if(failure.name!=='AbortError')throw failure;}});return;}

  if(action==='retry'){loadedAt=0;void execute(()=>ensure());return;}
  if(action==='friends'){root.PlayroomSocialUI.show({onBack:document.querySelector('.lobby-invites-modal')?()=>showInvite():()=>incoming()});return;}
  if(action==='invite-group'){const group=onlineGroups.find(g=>g.id===btn.dataset.group);if(group)void execute(async()=>{if(await inviteGroup(group))notice=t('invitation-sent');});return;}
  if(action==='accept-invite'){void connect({inviteId:btn.dataset.id});return;}
  if(action==='connect'){void connect({roomId:btn.dataset.room});return;}
  if(['copy-link','copy-code','copy-password'].includes(action)){
   if(!onlineSettings)return;const value=action==='copy-link'?inviteLink():action==='copy-code'?onlineSettings.roomCode:onlineSettings.password;
   const view=actionView;void execute(async()=>{if(root.navigator.clipboard?.writeText){await root.navigator.clipboard.writeText(value);if(currentView(view))notice='Скопировано.';}else{const node=document.querySelector(action==='copy-link'?'[data-online-link]':action==='copy-code'?'[data-online-room-code]':'#online-room-password');if(node?.select){node.focus();node.select();}else if(node){const range=document.createRange();range.selectNodeContents(node);const selection=root.getSelection();selection.removeAllRanges();selection.addRange(range);}notice='Текст выделен. Скопируйте его средствами браузера.';}});return;
  }
  const view=actionView;if(!view)return;
  void execute(async()=>{
   await ensure();if(!currentView(view))return;
   if(['rotate','password-toggle'].includes(action)){
    if(!onlineSettings.canManage||context().room.ownerId!==context().participantId)throw Object.assign(Error('forbidden'),{code:'forbidden'});
    await C().call(action==='rotate'?'rotate':'password-enabled',{roomId:active.id,...(action==='password-toggle'?{enabled:onlineSettings.passwordEnabled===false}:{})});
   }else if(action==='invite'){if(await inviteUser(btn.dataset.user))notice=t('invitation-sent');}
   else if(action==='revoke')await C().call('revoke',{roomId:active.id,id:btn.dataset.id});
   if(!currentView(view))return;const settings=await C().call('settings',{roomId:active.id});if(!currentView(view))return;adoptSettings(settings);loadedAt=Date.now();
  });
 });
 document.addEventListener('input',event=>{const view=inviteView;if(event.target.matches('[data-invite-search]')&&currentView(view)&&view.frame?.state==='active'){view.query=event.target.value;render();}});
 document.addEventListener('keydown',event=>{const tab=event.target.closest('[data-invite-tab]'),view=inviteView;if(!tab||!currentView(view)||view.frame?.state!=='active'||busy)return;const index=tabs.indexOf(view.tab),next=event.key==='Home'?0:event.key==='End'?2:event.key==='ArrowLeft'?(index+2)%3:event.key==='ArrowRight'?(index+1)%3:null;if(next===null)return;event.preventDefault();view.tab=tabs[next];render();view.frame.element.querySelector('[data-invite-tab="'+view.tab+'"]').focus();});
 document.addEventListener('input',event=>{
  const view=incomingView;if(!incomingRoot(view)||view.frame.state!=='active'||!view.frame.element.contains(event.target))return;
  const input=event.target;if(input.matches('[data-lobby-join-code] [name=token],[name=lookupPassword]')){if(input.name==='token')view.query=input.value;else view.lookupPassword=input.value;view.findTicket++;view.finding=false;view.preview=null;view.error='';renderIncoming();}
  else if(input.matches('[data-online-preview-join] [name=password]'))view.joinPassword=input.value;
 });
 document.addEventListener('submit',event=>{
  const view=incomingView,f=event.target;if(!incomingRoot(view)||view.frame.state!=='active'||!view.frame.element.contains(f))return;
  if(f.matches('[data-lobby-join-code]')){event.preventDefault();void findIncoming(view);return;}
  if(f.matches('[data-online-preview-join]')){event.preventDefault();const room=view.preview;if(!room)return;if(f.elements.password){root.PlayroomRoomPassword.sync(f.elements.password);if(!f.reportValidity())return;view.joinPassword=f.elements.password.value;}
   void joinPassword({id:room.id,password:view.joinPassword,previewView:view});
  }
 });
 function parseLink(value){try{const u=new URL(value),q=new URLSearchParams(u.hash.slice(1));const id=q.get('playroom-room'),password=q.get('password');return /^(?:[0-9a-f-]{36}|\d{4})$/i.test(id||'')&&(password===null||/^[A-Z2-9]{6}$/i.test(password))?{...(/^\d{4}$/.test(id)?{roomCode:id}:{id}),password:(password||'').toUpperCase(),promptIfRequired:!password}:null;}catch(_){return null;}}
 function joinPassword({id,password='',previewView}){
  return enterRoom(id,async current=>{
   try{if(!current())throw Object.assign(Error('cancelled'),{code:'cancelled'});return await C().call('join-password',{roomId:id,password,nickname:B().profile()?.name||t('guest-name')});}
   catch(failure){if(!current())throw Object.assign(Error('cancelled'),{code:'cancelled'});if(failure.code!=='room-password')throw failure;
    if(incomingRoot(previewView)){B().closeModal();previewView.error=root.PlayroomSocialUI.message(failure);renderIncoming();previewView.frame.element.querySelector('[data-online-preview-join] [name=password]')?.focus();}
    throw Object.assign(Error('cancelled'),{code:'cancelled'});
   }
  });
 }
 document.addEventListener('change',event=>{
  const input=event.target;if(!input.matches('[data-online-permission],[data-online-visibility],[data-online-password-enabled]'))return;
  const view=accessView;if(!currentView(view)||view.frame?.state!=='active'||!view.frame.element.contains(input)||context().room.ownerId!==context().participantId)return;
  const value=input.type==='checkbox'?input.checked:input.value,action=input.matches('[data-online-permission]')?'permission':input.matches('[data-online-password-enabled]')?'password-enabled':'visibility';
  void execute(async()=>{await ensure();if(!currentView(view)||!onlineSettings.canManage)throw Object.assign(Error('forbidden'),{code:'forbidden'});const result=await C().call(action,{roomId:active.id,...(action==='permission'?{allowPlayerInvites:value}:action==='password-enabled'?{enabled:value}:{visibility:value})});if(!currentView(view))return;adoptSettings(result);loadedAt=Date.now();});
 });
 async function inviteUser(userId,{nickname}={}){if(!canInvite())return false;const owner=viewKey(),identity=A().snapshot().id,name=nickname||onlineFriends.find(f=>f.userId===userId)?.nickname||t('guest-name');if(!await H().confirmDialog(root.PlayroomMessages.text('ui.community.invite-confirm',{name})))return false;if(A().snapshot().id!==identity||viewKey()!==owner||!canInvite())throw Object.assign(Error('account-changed'),{code:'account-changed'});await ensure();if(viewKey()!==owner||!canInvite())return false;await C().call('invite',{roomId:active.id,userId});return true;}
 async function closeRoom(localId){
  const account=A(),social=S(),community=C(),revision=accountRevision(),generation=roomGeneration,identity=viewKey(),key=account.snapshot().id+':'+localId,ctx=context(),cloudId=active?.key===key?active.id:ctx?.room?.id===localId&&ctx.room.ownerId===ctx.participantId?ctx.cloudRoomId:null;
  if(!cloudId)return;
  await social.perform('close',{roomId:cloudId});
  // A successful old close retires only the cache it captured. Another room or
  // account may already own the invitation/access UI while that ACK was held.
  if(generation!==roomGeneration||A()!==account||S()!==social||C()!==community||accountRevision()!==revision||viewKey()!==identity||active&&(active.key!==key||active.id!==cloudId))return;
  reset();
 }
 async function inviteGroup(group,{id=crypto.randomUUID()}={}){if(!canInvite())return false;const owner=viewKey(),identity=A().snapshot().id;if(!await H().confirmDialog(`Пригласить группу «${group.name}» в комнату?`))return false;if(A().snapshot().id!==identity||viewKey()!==owner||!canInvite())throw Object.assign(Error('account-changed'),{code:'account-changed'});await ensure();if(viewKey()!==owner||!canInvite())return false;await C().call('group-invite-room',{groupId:group.id,roomId:active.id,id});return true;}
 function joinInvitation(inviteId,{roomId,ownerId}={}){const ctx=context();if(roomId&&root.PlayroomCloudNetwork.roomId()===roomId&&ctx.room){root.PlayroomNetworkLibrary.openRoom();return Promise.resolve(true);}if(ownerId&&ownerId===A().snapshot().id){B().toast('Ваша комната не открыта на этом устройстве. Откройте её через «Мои партии».');B().showSessions();return Promise.resolve(false);}return connect({inviteId});}
 function init(){
  root.addEventListener('playroom:groups-updated',event=>{if(event.detail?.accountId===A().snapshot().id){onlineGroups=event.detail.groups;onlineGroupsError='';render();}});
  root.addEventListener('playroom:modal-restored',()=>{if(incomingView?.frame?.state==='active')void refreshIncoming();});
  let identity=incomingAccount();A().subscribe(()=>{const next=incomingAccount();if(identity===next)return;const previous=identity;identity=next;reset();cancelJoin();error='';notice='';render();
   const view=incomingView;if(incomingRoot(view)){view.findTicket++;view.finding=false;view.preview=null;view.joinPassword='';view.lookupPassword='';view.error='';if(previous||!next||!view.awaitingAccount)view.query='';view.awaitingAccount=false;incomingRooms=[];view.roomsLoading=!!next;renderIncoming();if(view.frame.state==='active')void refreshIncoming();}
  });
  const source=root.location.href,link=parseLink(source);if(!link)return;const clean=new URL(source);clean.hash='';root.history.replaceState(root.history.state,'',clean.href);
  const run=()=>incoming({query:source,lookup:link});if(B().profile()?.name)queueMicrotask(run);else root.addEventListener('playroom:profile-ready',run,{once:true});
 }
 root.PlayroomLobbyNetwork=Object.freeze({row,showInvite,incoming,render,init,inviteUser,inviteGroup,joinInvitation,reconnectRoom:roomId=>connect({roomId}),closeRoom,get active(){return active;}});
})(globalThis);
