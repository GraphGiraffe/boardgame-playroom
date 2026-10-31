/* Community navigation and presence. Messages live in the separate chat view. */
(function(root){
 'use strict';
 let service,account,tab='friends',data=null,busy=false,error='',notice='',timer=null,generation=0;
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,S=()=>root.PlayroomSocialUI.service,t=key=>root.PlayroomMessages.text('ui.community.'+key);
 let groupError='',refreshFlight=null,hubLoadedAt=0,groupsLoadedAt=0,loadedRevision=-1;
 const cacheStore=new root.PlayroomCommunityCacheStore(()=>localStorage);
 let editing=false;const orderStore=new root.PlayroomCommunityOrderStore(()=>localStorage);
 const button=(action,label,attrs='')=>H().iconButton(`data-community-action="${action}" ${attrs}`,t(label),label==='cancel'?'close':({add:'addPlayer',refresh:'reset',accept:'check',remove:'trash',cancel:'close',invite:'addPlayer',join:'play',account:'cloud'})[action]);
 function render(){
  const el=document.querySelector('[data-community-content]');if(!el)return;
  const a=account.snapshot(),esc=H().esc,hub=data||{friends:[],invitations:[],rooms:[]};
  let body=`<div class="community-navigation"><div class="shared-page-tabs community-tabs" style="--page-count:2;--page-index:${['friends','chats'].indexOf(tab)}" role="tablist" aria-label="${t('title')}">${['friends','chats'].map(id=>`<button type="button" role="tab" data-community-tab="${id}" aria-selected="${tab===id}" title="${t(id)}" aria-label="${t(id)}"><span class="community-tab-icon" aria-hidden="true">${H().icon({friends:'people',chats:'chat'}[id])}</span><span class="community-tab-label">${t(id)}</span></button>`).join('')}</div></div>`;
  if(a.kind!=='account'||a.recovery)body+=`<p>${t('login-info')}</p>${button('account','account')}`;
  
  else{

   const friends=tab==='chats'?(hub.conversations||[]):hub.friends;
   body+=`<div class="social-list" tabindex="0" aria-label="${t(tab)}"><ul>${friends.map(f=>root.PlayroomFriendCard.row(f,{attrs:`data-community-chat="${esc(f.userId)}"`,openable:tab==='chats'||f.accepted,actions:(tab==='chats'||f.accepted?'':f.incoming?button('accept','accept',`data-id="${esc(f.id)}"`):'')+(tab==='chats'||f.accepted?'':button('remove','cancel',`data-id="${esc(f.id)}"`))})).join('')}${tab==='friends'?root.PlayroomGroupUI.listMarkup(hub.groups||[],{rowsOnly:true}):''}</ul>${friends.length||tab==='friends'&&hub.groups?.length?'':`<p>${t(tab==='chats'?'no-chats':'no-friends')}</p>`}</div>`;
  }
  const signature=JSON.stringify([a.kind,a.recovery,tab,editing,hub,B().room()?.transportMode]);if(el.dataset.view!==signature){el.dataset.view=signature;root.PlayroomDOM.ListController.update(el,body+'<p data-community-message role="status" aria-live="polite"></p>');root.PlayroomCommunityOrderUI.apply(tab==='friends'?el.querySelector('.social-list>ul'):null,{editing,user:a.id,store:orderStore});}
  const edit=el.closest('.community-modal').querySelector('[data-community-edit]');if(edit){edit.hidden=tab!=='friends';edit.setAttribute('aria-pressed',String(editing));edit.setAttribute('aria-label',editing?'Готово':'Изменить порядок');edit.title=edit.getAttribute('aria-label');edit.innerHTML=H().icon(editing?'check':'edit');}
  const add=el.closest('.community-modal').querySelector('[data-community-action=add]');if(add){add.title=t('add');add.setAttribute('aria-label',add.title);}
  el.setAttribute('aria-busy',String(busy));for(const btn of el.closest('.community-modal').querySelectorAll('[data-community-action]'))btn.disabled=busy;
  const message=el.querySelector('[data-community-message]');message.textContent=error||(tab==='friends'?groupError:'')||notice;message.setAttribute('role',error?'alert':'status');
 }
 function presence(){const ctx=root.PlayroomNetworkLibrary?.inviteContext?.(),r=ctx?.room;return {avatar:B().profile()?.avatar||null,game:r?.phase==='playing'?r.game?.name:B().activity?.()||null};}
 async function execute(fn){if(busy)return;busy=true;error='';notice='';render();try{await fn();}catch(e){error=root.PlayroomSocialUI.message(e);}finally{busy=false;render();}}
 async function refresh({force=true,background=false}={}){
  if(account.snapshot().kind!=='account'||account.snapshot().recovery)return;
  if(refreshFlight)return refreshFlight;
  if(!force&&loadedRevision===service.revision&&data&&Date.now()-hubLoadedAt<30000&&(tab==='chats'||Date.now()-groupsLoadedAt<30000))return;
  const current=generation;
  const run=(async()=>{
   if(!background)await root.PlayroomSocialUI.syncNickname();const nextRead=service.call('hub',presence()),groupsRead=(tab==='friends'||background)?service.call('group-list'):null;groupsRead?.catch(()=>{});const next=await nextRead;if(current!==generation)return;
   loadedRevision=service.revision;data={...next,groups:data?.groups||[]};hubLoadedAt=Date.now();error='';render();
   if(groupsRead){
    try{const groups=await groupsRead;if(current!==generation)return;data.groups=groups.groups;groupsLoadedAt=Date.now();groupError='';root.PlayroomGroupUI?.update(groups.groups,{replace:true});}
    catch(failure){if(current!==generation)return;groupsLoadedAt=0;groupError=['invalid','setup'].includes(failure.code)?t('groups-unavailable'):t('groups-load-error')+' '+root.PlayroomSocialUI.message(failure);}
   }
   if(current===generation){cacheStore.write(account.snapshot().id,data);render();activate();}
  })();refreshFlight=run;try{return await run;}finally{if(refreshFlight===run)refreshFlight=null;}
 }
 function refreshCached(force=false){const current=generation;void refresh({force}).catch(failure=>{if(current===generation){error=root.PlayroomSocialUI.message(failure);render();}});}
 function show({onBack,initialTab='friends'}={}){editing=false;tab=initialTab==='groups'?'friends':initialTab;error='';notice='';B().openModal(`${H().modalHead(t('title'),{actions:account.snapshot().kind==='account'&&!account.snapshot().recovery?`<div class="community-header-actions">${button('add','add')}${H().iconButton('data-community-edit','Изменить порядок','edit')}${button('refresh','refresh')}</div>`:''})}<div class="social-content" data-community-content></div>`,'community-modal',{size:'large',onBack});render();if(account.snapshot().kind==='account')refreshCached(false);}
 function activate(){
  if(timer||account.snapshot().kind!=='account')return;
  timer=root.setTimeout(async()=>{timer=null;if(document.hidden||account.snapshot().kind!=='account')return;
   try{if(document.querySelector('[data-community-content]')&&!busy)await refresh();else await prefetch();}catch(_){}activate();},30000);
 }
 function init({account:accountService,remote}){account=accountService;service=new root.PlayroomCommunityService({account,remote});root.PlayroomChatNotifications.init({account,service,store:new root.PlayroomChatNotificationStore(()=>localStorage)});let friendSignature='';S().subscribe(state=>{const signature=JSON.stringify(state.friends);if(friendSignature!==signature){friendSignature=signature;hubLoadedAt=groupsLoadedAt=0;}});let identity=service.key();if(account.snapshot().kind==='account')data=cacheStore.read(account.snapshot().id);account.subscribe(()=>{if(identity!==service.key()){identity=service.key();generation++;refreshFlight=null;hubLoadedAt=groupsLoadedAt=0;groupError='';data=account.snapshot().kind==='account'?cacheStore.read(account.snapshot().id):null;root.PlayroomChatUI.close();root.PlayroomRoomChatUI.reset();root.PlayroomGroupUI?.close();if(document.querySelector('.chat-modal,.friend-profile-modal,.group-profile-modal'))show();root.clearTimeout(timer);timer=null;render();}if(account.snapshot().kind==='account')activate();});if(account.snapshot().kind==='account')activate();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&account.snapshot().kind==='account')activate();});}
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-friends-open]')){show({onBack:B().captureModalReturn()});return;}
  if(event.target.closest('[data-community-create-group]')){root.PlayroomGroupUI.create({onBack:B().captureModalReturn()});return;}
  if(event.target.closest('[data-community-edit]')){editing=!editing;render();return;}
  const friend=event.target.closest('[data-community-chat]');if(friend){if(editing)return;const person=[...(data?.friends||[]),...(data?.conversations||[])].find(f=>f.userId===friend.dataset.communityChat);if(person&&(person.accepted||tab==='chats'))root.PlayroomChatUI.show(person,{onBack:B().captureModalReturn()});return;}
  const select=event.target.closest('[data-community-tab]');if(select){editing=false;tab=select.dataset.communityTab;render();if(account.snapshot().kind==='account')refreshCached();return;}
  const btn=event.target.closest('[data-community-action]');if(!btn||busy)return;const action=btn.dataset.communityAction;
  if(action==='account'){root.PlayroomAccountUI.show({onReady:show});return;}
  if(action==='add'){root.PlayroomSocialUI.showAdd({onBack:()=>{show();refreshCached(true);}});return;}
  if(action==='refresh'){void execute(refresh);return;}
  void execute(async()=>{if(action==='join'){await root.PlayroomLobbyNetwork.joinInvitation(btn.dataset.id);return;}if(action==='invite'){await root.PlayroomLobbyNetwork.inviteUser(btn.dataset.user);notice=t('invited');}else await S().perform(action,{id:btn.dataset.id});await refresh();});
 });
 root.addEventListener('playroom:groups-updated',event=>{
  if(!account||account.snapshot().kind!=='account'||event.detail?.accountId!==account.snapshot().id)return;
  data={...(data||{friends:[],conversations:[],invitations:[],rooms:[]}),groups:event.detail.groups.map(group=>({...group}))};cacheStore.write(account.snapshot().id,data);render();
 });
 root.addEventListener('playroom:modal-restored',()=>{if(document.querySelector('[data-community-content]'))refreshCached(true);});
 root.addEventListener('pagehide',()=>{root.clearTimeout(timer);timer=null;});
 function prefetch(){return refresh({force:false,background:true});}
 root.PlayroomCommunityUI=Object.freeze({init,show,refresh,prefetch,activate,presence,get service(){return service;}});
})(globalThis);
