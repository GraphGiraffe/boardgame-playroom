/* Community navigation and presence. Messages live in the separate chat view. */
(function(root){
 'use strict';
 let service,account,data=null,timer=null,generation=0,preferredTab='chats',cacheFlight=null,registry=null;
 let hubLoadedAt=0,groupsLoadedAt=0,loadedRevision=-1,readSequence=0,hubSequence=0,groupSequence=0,orderView=null;
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,S=()=>root.PlayroomSocialUI.service,t=key=>root.PlayroomMessages.text('ui.community.'+key);
 const cacheStore=new root.PlayroomCommunityCacheStore(()=>localStorage),orderStore=new root.PlayroomCommunityOrderStore(()=>localStorage);
 const views=new Set(),rootViews=new WeakMap(),positions=new Map(),queries=new Map();
 const visibleOrderStore={read:user=>orderStore.read(user),write(user,keys){const selected=new Set(keys),pending=[...keys],merged=orderStore.read(user).map(key=>selected.has(key)?pending.shift():key);return orderStore.write(user,[...merged,...pending]);}};
 const owner=()=>({service,key:service.key(),revision:service.generation,epoch:generation});
 const sameOwner=who=>!!who&&who.service===service&&who.key===service.key()&&who.revision===service.generation&&who.epoch===generation;
 const element=view=>view?.host||view?.frame?.element;
 const valid=view=>!!view&&!view.disposed&&sameOwner(view.owner)&&!!element(view)?.isConnected&&(!view.frame||view.frame.state!=='disposed');
 const content=view=>valid(view)?element(view).querySelector('[data-community-content]'):null;
 const active=view=>!document.hidden&&valid(view)&&!element(view).closest('[inert],[hidden],[aria-hidden="true"]')&&(view.frame?view.frame.state==='active':!document.querySelector('#modal-root>[data-surface-state=active]')&&!!view.host.closest('#hub-social-page.is-active'));
 const cancelled=()=>Object.assign(Error('cancelled'),{code:'cancelled'});
 function dispose(view){view.releaseChildren?.();view.releaseChildren=null;view.longPressOrder?.dispose();view.disposed=true;view.operation=null;view.refreshTicket++;views.delete(view);if(orderView===view)orderView=null;}
 function prune(){for(const view of views)if(!valid(view))dispose(view);}
 function activeView(){prune();return [...views].find(active)||null;}
 function eventView(target){if(target?.closest?.('[data-community-refresh]')){const view=activeView(),button=target.closest('[data-community-refresh]');return view&&(view.host?button.closest('.hub-shell-v021')===view.host.closest('.hub-shell-v021'):view.frame.element.contains(button))?view:null;}const host=target?.closest?.('[data-community-content]');return host?[...views].find(view=>active(view)&&content(view)===host)||null:null;}
 function remember(view=activeView()){const list=content(view)?.querySelector('.social-list');if(list){view.positions.set(view.tab,list.scrollTop);positions.set(view.tab,list.scrollTop);}}
 function filterList(view){
  const host=content(view);if(!host)return;const query=(view.queries.get(view.tab)||'').trim().toLocaleLowerCase();let count=0;
  for(const row of host.querySelectorAll('.social-list>ul>.community-friend')){const dm=row.querySelector('[data-community-chat]'),group=row.querySelector('[data-group-open]'),person=dm?[...(data?.friends||[]),...(data?.conversations||[])].find(friend=>friend.userId===dm.dataset.communityChat):null,name=person?[person.nickname,person.username].filter(Boolean).join(' '):(data?.groups||[]).find(item=>item.id===group?.dataset.groupOpen)?.name||'';row.hidden=!!query&&!name.toLocaleLowerCase().includes(query);if(!row.hidden)count++;}
  const empty=host.querySelector('[data-community-search-empty]');if(empty)empty.hidden=!query||count>0;
  const edit=host.querySelector('[data-community-edit]');if(edit)edit.disabled=!!query||!!view.operation||!count;
 }
 const action=(action,label,attrs='')=>`<button type="button" class="text-btn" data-community-action="${action}" ${attrs}>${H().esc(label)}</button>`;
 function rowActions(kind,id){const attrs=`data-social-kind="${kind}" data-social-id="${H().esc(id)}"`;return `<button type="button" data-social-action="read" ${attrs}>${H().icon('check')}<span>Прочитано</span></button><button type="button" data-social-action="play" ${attrs}>${H().icon('play')}<span>Поиграть</span></button>`;}
 function setOpen(view,row,open){if(!row||!content(view)?.contains(row))return;if(open)for(const other of content(view).querySelectorAll('[data-social-actions].is-actions-open'))if(other!==row)setOpen(view,other,false);row.classList.toggle('is-actions-open',open);row.querySelector('[data-social-actions-toggle]')?.setAttribute('aria-expanded',String(open));for(const button of row.querySelectorAll('.social-row-actions button')){button.tabIndex=open?0:-1;button.disabled=!!view.operation||!open;}}
 function actionRows(view,host){
  for(const row of host.querySelectorAll('[data-social-actions]')){row.classList.remove('is-actions-open');delete row.dataset.socialActions;}
  if(view.editing)return;
  for(const row of host.querySelectorAll('.community-friend')){const group=row.querySelector('[data-group-open]');if(group&&!row.querySelector('.social-row-front')){const front=document.createElement('div');front.className='social-row-front';front.append(group);front.insertAdjacentHTML('beforeend','<button type="button" class="icon-btn social-actions-toggle" data-social-actions-toggle aria-expanded="false" aria-label="Действия с группой">⋯</button>');row.append(front);row.insertAdjacentHTML('afterbegin',`<div class="social-row-actions">${rowActions('group',group.dataset.groupOpen)}</div>`);}if(row.querySelector('.social-row-actions')){row.dataset.socialActions='';setOpen(view,row,false);}}
 }
 function bindOrder(view){
  if(!active(view)||!content(view)||orderView===view&&!view.orderDirty)return;
  orderView?.longPressOrder?.dispose();view.longPressOrder?.dispose();
  const host=content(view),focus=host.contains(document.activeElement)?document.activeElement:null,pane=host.querySelector('.social-list'),scrollTop=pane?.scrollTop,list=host.querySelector('.social-list>ul');root.PlayroomCommunityOrderUI.apply(list,{editing:false,user:account.snapshot().id,store:visibleOrderStore});orderView=view;view.orderDirty=false;if(!list)return;
  const rows=()=>[...list.querySelectorAll(':scope>[data-community-order-key]')],current=()=>active(view)&&!view.operation&&!view.loading,move=({row,target,after})=>{if(!current()||!row||!target||row===target)return;const focused=host.contains(document.activeElement)?document.activeElement:null,top=pane.scrollTop;list.insertBefore(row,after?target.nextSibling:target);if(focused?.isConnected&&document.activeElement!==focused)focused.focus({preventScroll:true});pane.scrollTop=top;if(!visibleOrderStore.write(account.snapshot().id,rows().map(item=>item.dataset.communityOrderKey)))B().toast('Не удалось сохранить порядок.');};
  view.longPressOrder=root.PlayroomOrderUI.create({list,rows,key:row=>row.dataset.communityOrderKey,handle:'[data-community-chat],[data-group-open]',delay:420,current,move,previewClass:'community-order-ghost',previewOmit:'.social-row-actions,[data-social-actions-toggle]',scroll:()=>host.querySelector('.social-list'),canStart:(_event,row)=>!row.classList.contains('is-actions-open')});
  for(const card of list.querySelectorAll('[data-community-chat],[data-group-open]'))card.setAttribute('aria-description','Удерживайте, чтобы переместить. С клавиатуры: Alt и стрелка вверх или вниз.');
  if(focus?.isConnected&&document.activeElement!==focus)focus.focus({preventScroll:true});if(pane)pane.scrollTop=scrollTop;list.oncontextmenu=event=>{if(event.target.closest('.is-dragging'))event.preventDefault();};
  list.onkeydown=event=>{if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||!current())return;const row=rows().find(item=>item.contains(event.target));if(!row)return;const step=event.key==='ArrowUp'?-1:1,target=rows()[rows().indexOf(row)+step];if(target){event.preventDefault();event.stopPropagation();move({row,target,after:step>0});}};
 }
 function groupRows(groups){
  // Keep GroupUI's real identity/routing registration; this screen owns the primary action's placement.
  const template=document.createElement('template');template.innerHTML=root.PlayroomGroupUI.listMarkup(groups,{rowsOnly:true});template.content.querySelector('.group-create-row')?.remove();return template.innerHTML;
 }
 function render(view){
  const host=content(view);if(!host)return;const a=account.snapshot(),signed=a.kind==='account'&&!a.recovery,hub=data||{friends:[],conversations:[],groups:[]},esc=H().esc,busy=!!view.operation;
  const friends=view.tab==='chats'?hub.conversations||[]:hub.friends||[],initialLoading=view.loading&&!data,status=view.error||(view.tab==='chats'?view.groupError:'')||view.notice||(initialLoading?'Загружаем список…':'');
  const retry=!!(view.error||view.tab==='chats'&&view.groupError)&&view.retryRefresh;
  const tabPrefix='community-'+(view.frame?.id||'hub')+'-',panelId=tabPrefix+'panel';
  let body=`<div class="community-navigation" data-entity="community-tabs">${H().pageTabs({label:'Общение',tabs:['chats','friends'].map(tab=>[tab,t(tab)]),value:view.tab,attribute:'data-community-tab',className:'community-tabs',idPrefix:tabPrefix+'tab-'})}</div><section id="${panelId}" data-community-tab-panel>`;
  if(!signed)body+=`<p>${t('login-info')}</p><button type="button" class="menu-row community-login-action" data-community-action="account"><span>Войти или создать аккаунт</span>${H().icon('next')}</button>`;
  else {
   body+=`<label class="field" data-entity="community-search"><span>Поиск</span><input type="search" data-community-search aria-label="Поиск" placeholder="${view.tab==='chats'?'Имя или название группы':'Имя или имя аккаунта'}" value="${esc(view.queries.get(view.tab)||'')}" autocomplete="off"></label>`;
   body+=`<div data-community-status data-entity="community-status" ${!status?'hidden':''}><p data-community-message role="${view.error||view.groupError?'alert':'status'}" aria-live="polite">${esc(status)}</p></div>`;
   body+=`<div class="social-list" data-entity="community-list" tabindex="0" aria-label="${t(view.tab)}"><ul>${friends.map(friend=>root.PlayroomFriendCard.row(friend,{attrs:`data-community-chat="${esc(friend.userId)}"`,openable:view.tab==='chats'||friend.accepted,rowActions:(view.tab==='chats'||friend.accepted)?rowActions('dm',friend.userId):'',actions:view.tab==='chats'||friend.accepted?'':(friend.incoming?action('accept','Принять',`data-id="${esc(friend.id)}"`):'')+action('remove',friend.incoming?'Отклонить':'Отменить заявку',`data-id="${esc(friend.id)}"`)})).join('')}${view.tab==='chats'?groupRows(hub.groups||[]):''}</ul>${!friends.length&&!(view.tab==='chats'&&hub.groups?.length)&&(!view.loading||!!data)&&!view.error?`<p data-community-empty>${t(view.tab==='chats'?'no-chats':'no-friends')}</p>`:''}<p data-community-search-empty hidden>Ничего не найдено.</p></div>`;
   body+=`<div class="community-primary" data-entity="community-primary">${view.tab==='chats'?H().button({attrs:'data-community-create-group',icon:'groupChat',label:'Создать группу',variant:'secondary'}):H().button({attrs:'data-community-action="add"',icon:'addPlayer',label:'Добавить друга',variant:'secondary'})}</div>`;
  }
  body+=`</section><button type="button" class="menu-row community-notifications" data-command="notifications-settings" data-surface-action="child"><span><strong>Уведомления</strong><small>Предпочтения сообщений</small></span>${H().icon('bell')}</button>`;

  const signature=JSON.stringify([a.kind,a.recovery,view.tab,view.editing,hub,status,retry,initialLoading,busy]);
  if(view.signature!==signature){
   const list=host.querySelector('.social-list'),scroll=list?.scrollTop||0,opened=new Set([...host.querySelectorAll('.is-actions-open')].map(row=>row.dataset.entity)),focus=host.contains(document.activeElement)?document.activeElement:null,selection=focus&&typeof focus.selectionStart==='number'?{start:focus.selectionStart,end:focus.selectionEnd,direction:focus.selectionDirection}:null;
   view.maintenance=host.querySelector('[data-community-maintenance]')?.open??view.maintenance;view.signature=signature;root.PlayroomDOM.ListController.update(host,body);const details=host.querySelector('[data-community-maintenance]');if(details)details.open=view.maintenance;
   actionRows(view,host);for(const row of host.querySelectorAll('[data-social-actions]'))if(opened.has(row.dataset.entity))setOpen(view,row,true);view.orderDirty=true;filterList(view);const next=host.querySelector('.social-list');if(next)next.scrollTop=scroll;
   if(focus?.isConnected&&active(view)&&document.activeElement!==focus){focus.focus({preventScroll:true});if(selection)focus.setSelectionRange(selection.start,selection.end,selection.direction);}
  }
  H().bindPageTabs(host.querySelector('.community-tabs'),{panel:host.querySelector('[data-community-tab-panel]'),current:()=>active(view)});
  host.setAttribute('aria-busy',String(busy||view.loading));for(const button of host.querySelectorAll('[data-community-action=accept],[data-community-action=remove]'))button.disabled=busy||S().busy;
  const chrome=view.host?view.host.closest('.hub-shell-v021')?.querySelector('.hub-root-actions'):view.frame?.element;
  for(const button of chrome?.querySelectorAll('[data-community-refresh]')||[]){button.disabled=!signed||busy||view.loading;button.setAttribute('aria-busy',String(busy||view.loading));button.setAttribute('aria-label','Обновить');button.title=view.loading?'Обновляем список…':retry?'Повторить обновление':'Обновить';}
  for(const button of host.querySelectorAll('[data-social-action]'))button.disabled=busy||!button.closest('.is-actions-open');filterList(view);bindOrder(view);
 }
 function renderAll(){prune();for(const view of views)render(view);}
 function presence(){const ctx=root.PlayroomNetworkLibrary?.inviteContext?.(),room=ctx?.room;return {avatar:B().profile()?.avatar||null,game:room?.phase==='playing'?room.game?.name:B().activity?.()||null};}
 function needsRefresh(tab){return loadedRevision!==service.revision||!data||Date.now()-hubLoadedAt>=30000||tab==='chats'&&Date.now()-groupsLoadedAt>=30000;}
 async function refresh({force=true,background=false,view=null}={}){
  if(account.snapshot().kind!=='account'||account.snapshot().recovery)return;
  if(!view&&cacheFlight)return cacheFlight;if(!force&&!needsRefresh(view?.tab||preferredTab))return;
  const who=owner(),sequence=++readSequence,revision=service.revision,tab=view?.tab||preferredTab;
  const run=(async()=>{
   if(!background)await root.PlayroomSocialUI.syncNickname();if(!sameOwner(who)||view&&!valid(view))throw cancelled();
   const groupsRead=(tab==='chats'||background)?service.call('group-list'):null;groupsRead?.catch(()=>{});const next=await service.call('hub',presence());if(!sameOwner(who))throw cancelled();
   if(sequence>=hubSequence){hubSequence=sequence;loadedRevision=revision;data={...next,groups:data?.groups||[]};hubLoadedAt=Date.now();renderAll();}
   let groupFailure=null;if(groupsRead)try{const groups=await groupsRead;if(!sameOwner(who))throw cancelled();if(sequence>=groupSequence){groupSequence=sequence;data={...(data||next),groups:groups.groups};groupsLoadedAt=Date.now();root.PlayroomGroupUI?.update(groups.groups,{replace:true});}}
   catch(error){if(!sameOwner(who))throw cancelled();groupFailure=error;if(sequence>=groupSequence)groupsLoadedAt=0;}
   if(!sameOwner(who))throw cancelled();cacheStore.write(account.snapshot().id,data);renderAll();activate();return {groupFailure};
  })();if(!view)cacheFlight=run;try{return await run;}finally{if(cacheFlight===run)cacheFlight=null;}
 }
 async function refreshView(view,force=false){
  if(!valid(view)||account.snapshot().kind!=='account'||account.snapshot().recovery||view.refreshFlight||!force&&!needsRefresh(view.tab))return;
  const ticket=++view.refreshTicket,who=owner();view.loading=true;view.error='';view.groupError='';view.retryRefresh=false;render(view);
  const job=refresh({force,view});view.refreshFlight=job;
  try{const result=await job;if(!valid(view)||!sameOwner(who)||ticket!==view.refreshTicket)return;if(result?.groupFailure){view.groupError='Не удалось загрузить группы. Повторите обновление.';view.retryRefresh=true;}}
  catch(error){if(valid(view)&&sameOwner(who)&&ticket===view.refreshTicket&&error.code!=='cancelled'){view.error=['request','network'].includes(error.code)?'Не удалось обновить список. Проверьте соединение и повторите.':root.PlayroomSocialUI.message(error);view.retryRefresh=true;}}
  finally{if(view.refreshFlight===job)view.refreshFlight=null;if(valid(view)&&sameOwner(who)&&ticket===view.refreshTicket){view.loading=false;render(view);}}
 }
 async function execute(view,fn){
  if(!active(view)||view.operation)return;const operation={owner:owner()};view.operation=operation;view.error='';view.notice='';view.retryRefresh=false;
  const current=()=>active(view)&&sameOwner(operation.owner)&&view.operation===operation,check=()=>{if(!current())throw cancelled();};
  try{const result=fn(check);render(view);await result;}
  catch(error){if(current()&&error.code!=='cancelled')view.error=['request','network'].includes(error.code)?'Не удалось выполнить действие. Попробуйте ещё раз.':root.PlayroomSocialUI.message(error);}
  finally{if(view.operation===operation)view.operation=null;if(valid(view))render(view);}
 }
 async function markConversation(view,kind,id,check){
  const key=kind==='group'?'group:'+id:'dm:'+id,query=kind==='group'?{groupId:id}:{userId:id};check();const result=await service.call(kind==='group'?'group-read':'chat',query);check();
  const rows=result.messages||[],through=rows.filter(row=>!row.mine).reduce((max,row)=>root.PlayroomChatState.number(row.seq??row.id)>root.PlayroomChatState.number(max)?String(row.seq??row.id):max,'0');if(through==='0')return;
  await service.call(kind==='group'?'group-seen':'read-messages',{...query,through});check();root.PlayroomChatState.merge(key,rows,{fetched:true});root.PlayroomChatState.read(key,through);root.dispatchEvent(new CustomEvent(kind==='group'?'playroom:group-chat-opened':'playroom:chat-opened',{detail:kind==='group'?{groupId:id}:{userId:id}}));await root.PlayroomChatNotifications.poll();
 }
 async function playFromList(view){const who=owner(),intent=++view.playIntent;await B().startOnlineGame({onCancel:()=>{view.playIntent++;},onSelect:async({roomId}={})=>{if(!sameOwner(who)||intent!==view.playIntent||!roomId||B().room()?.id!==roomId)throw cancelled();B().toast('Пригласите друзей или группу из лобби.');}});}
 function createView({host=null,onBack,initialTab=null}={}){
  const view={host,frame:null,owner:owner(),kind:account.snapshot().kind,disposed:false,tab:initialTab==='groups'?'chats':initialTab||preferredTab,queries:new Map(queries),positions:new Map(positions),editing:false,maintenance:false,error:'',notice:'',groupError:'',retryRefresh:false,loading:false,operation:null,refreshTicket:0,refreshFlight:null,signature:null,orderDirty:true,playIntent:0,awaitingAccount:false};views.add(view);
  if(host){view.releaseChildren=root.PlayroomDOM.manageChildren(host);rootViews.set(host,view);root.PlayroomDOM.ListController.update(host,'<div class="social-content" data-community-content></div>');}
  else view.frame=B().openModal(`${H().modalHead('Общение',{actions:H().iconButton('data-community-refresh','Обновить','refresh')})}<div class="social-content" data-community-content></div>`,'community-modal',{size:'large',onBack,valid:()=>!view.disposed&&(sameOwner(view.owner)||view.awaitingAccount&&view.kind!=='account'&&account.snapshot().kind==='account'&&!account.snapshot().recovery),onDispose:()=>dispose(view)});
  if(view.frame)view.restore=B().captureModalReturn();
  return view;
 }
 function show({onBack,initialTab=null,host=null}={}){
  prune();let view=host?rootViews.get(host):activeView();
  if(!host&&!view){const rootHost=document.querySelector('#hub-social-page.is-active [data-hub-community]');if(rootHost&&!onBack){if(document.querySelector('#modal-root>[data-surface-state=active]'))B().closeModal(true);host=rootHost;view=rootViews.get(host);}else if(!onBack){const retained=[...views].reverse().find(item=>valid(item)&&item.frame);if(retained?.restore?.())view=retained;}}
  if(!valid(view))view=createView({host,onBack,initialTab});else if(initialTab){remember(view);view.tab=initialTab==='groups'?'chats':initialTab;}
  preferredTab=view.tab;view.loading=!!view.refreshFlight||account.snapshot().kind==='account'&&!account.snapshot().recovery&&needsRefresh(view.tab);render(view);const list=content(view)?.querySelector('.social-list');if(list)list.scrollTop=view.positions.get(view.tab)||0;void refreshView(view);return view.frame;
 }
 function activate(){if(timer||!account||account.snapshot().kind!=='account')return;timer=root.setTimeout(async()=>{timer=null;if(document.hidden||account.snapshot().kind!=='account')return;const view=activeView();if(view&&!view.operation)await refreshView(view,true);else try{await refresh({background:true});}catch(_){}activate();},30000);}
 function init({account:accountService,remote}){
  account=accountService;service=new root.PlayroomCommunityService({account,remote});const ownedService=service;root.PlayroomChatNotifications.init({account,service,store:new root.PlayroomChatNotificationStore(()=>localStorage)});
  let friendSignature='';S().subscribe(state=>{if(service!==ownedService)return;const signature=JSON.stringify(state.friends);if(friendSignature!==signature){friendSignature=signature;hubLoadedAt=groupsLoadedAt=0;}});
  let identity=service.key();if(account.snapshot().kind==='account')data=cacheStore.read(account.snapshot().id);
  account.subscribe(()=>{if(service!==ownedService)return;if(identity!==service.key()){
   identity=service.key();generation++;positions.clear();queries.clear();swipe=null;cacheFlight=null;hubLoadedAt=groupsLoadedAt=0;loadedRevision=-1;hubSequence=groupSequence=++readSequence;data=account.snapshot().kind==='account'?cacheStore.read(account.snapshot().id):null;
   for(const view of views){if(view.host||view.awaitingAccount&&view.kind!=='account'&&account.snapshot().kind==='account'&&!account.snapshot().recovery){view.owner=owner();view.kind=account.snapshot().kind;view.operation=null;view.refreshFlight=null;view.refreshTicket++;view.loading=false;view.error=view.notice=view.groupError='';view.retryRefresh=false;view.editing=false;view.queries.clear();view.positions.clear();view.signature=null;view.playIntent++;}else view.disposed=true;}
   root.PlayroomChatUI.close();root.PlayroomRoomChatUI.reset();root.PlayroomGroupUI?.close();registry||=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});registry.invalidate();root.clearTimeout(timer);timer=null;renderAll();const current=activeView();if(current&&account.snapshot().kind==='account')void refreshView(current,true);
  }if(account.snapshot().kind==='account')activate();});if(account.snapshot().kind==='account')activate();document.addEventListener('visibilitychange',()=>{if(!document.hidden&&account.snapshot().kind==='account')activate();});
 }
 let swipe=null,suppressClickUntil=0,suppressRow=null;
 document.addEventListener('input',event=>{if(!event.target.matches('[data-community-search]'))return;const view=eventView(event.target);if(!view)return;view.queries.set(view.tab,event.target.value);queries.set(view.tab,event.target.value);filterList(view);});
 document.addEventListener('scroll',event=>{if(!event.target.matches?.('[data-community-content] .social-list'))return;const view=eventView(event.target);if(view)remember(view);},true);
 document.addEventListener('toggle',event=>{if(!event.target.matches?.('[data-community-maintenance]'))return;const view=eventView(event.target);if(view)view.maintenance=event.target.open;},true);
 document.addEventListener('pointerdown',event=>{suppressRow=null;suppressClickUntil=0;const view=eventView(event.target);if(!view||view.editing||view.operation||event.button!==0)return;const row=event.target.closest('[data-social-actions]');if(!row||event.target.closest('.social-row-actions,[data-social-actions-toggle]'))return;swipe={view,owner:owner(),row,id:event.pointerId,x:event.clientX,y:event.clientY};});
 document.addEventListener('pointermove',event=>{if(!swipe||event.pointerId!==swipe.id)return;if(swipe.row.classList.contains('is-dragging')||!active(swipe.view)||!sameOwner(swipe.owner)){swipe=null;return;}const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;if(Math.abs(dy)>12&&Math.abs(dy)>Math.abs(dx)){swipe=null;return;}if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)*1.5){setOpen(swipe.view,swipe.row,dx<0);suppressClickUntil=Date.now()+400;suppressRow=swipe.row;swipe=null;}},{passive:true});
 document.addEventListener('pointerup',()=>{swipe=null;});document.addEventListener('pointercancel',()=>{swipe=null;});
 document.addEventListener('click',event=>{const host=event.target.closest('[data-community-content]');if(host&&!eventView(event.target)){event.preventDefault();event.stopImmediatePropagation();return;}if(Date.now()<suppressClickUntil&&event.target.closest('.social-row-front')?.closest('[data-social-actions]')===suppressRow){event.preventDefault();event.stopImmediatePropagation();}},{capture:true});
 document.addEventListener('keydown',event=>{const view=eventView(event.target);if(event.key==='Escape'&&view)for(const row of content(view).querySelectorAll('[data-social-actions].is-actions-open'))setOpen(view,row,false);});
 document.addEventListener('click',event=>{
  if(event.target.closest('[data-friends-open]')){show({onBack:B().captureModalReturn()});return;}const view=eventView(event.target);if(!view)return;
  if(event.target.closest('[data-community-refresh]')){if(!event.target.closest('[data-community-refresh]').disabled)void refreshView(view,true);return;}
  const toggle=event.target.closest('[data-social-actions-toggle]');if(toggle){setOpen(view,toggle.closest('[data-social-actions]'),toggle.getAttribute('aria-expanded')!=='true');return;}
  const quick=event.target.closest('[data-social-action]');if(quick){if(view.operation||view.editing||quick.disabled)return;const {socialAction:action,socialKind:kind,socialId:id}=quick.dataset;void execute(view,check=>action==='read'?markConversation(view,kind,id,check):action==='play'?playFromList(view):undefined);return;}
  if(event.target.closest('[data-community-create-group]')){root.PlayroomGroupUI.create({onBack:B().captureModalReturn()});return;}
  const friend=event.target.closest('[data-community-chat]');if(friend){if(view.editing||friend.disabled)return;const person=[...(data?.friends||[]),...(data?.conversations||[])].find(item=>item.userId===friend.dataset.communityChat);if(person&&(person.accepted||view.tab==='chats'))root.PlayroomChatUI.show(person,{onBack:B().captureModalReturn()});return;}
  const select=event.target.closest('[data-community-tab]');if(select){remember(view);view.editing=false;view.tab=select.dataset.communityTab;preferredTab=view.tab;view.signature=null;render(view);const list=content(view)?.querySelector('.social-list');if(list)list.scrollTop=view.positions.get(view.tab)||0;void refreshView(view);return;}
  const button=event.target.closest('[data-community-action]');if(!button||button.disabled)return;const actionName=button.dataset.communityAction;
  if(actionName==='account'){view.awaitingAccount=true;root.PlayroomAccountUI.show({onReady:()=>{if(!active(view))return;view.awaitingAccount=false;render(view);void refreshView(view,true);}});return;}
  if(actionName==='add'){root.PlayroomSocialUI.showAdd({onBack:B().captureModalReturn()});return;}
  if(!['accept','remove'].includes(actionName))return;const payload={id:button.dataset.id},social=S();void execute(view,async check=>{check();await social.perform(actionName,payload);check();await refreshView(view,true);check();view.notice=actionName==='accept'?'Заявка принята.':'Заявка отменена.';});
 });
 root.addEventListener('playroom:groups-updated',event=>{if(!account||account.snapshot().kind!=='account'||event.detail?.accountId!==account.snapshot().id)return;groupSequence=++readSequence;data={...(data||{friends:[],conversations:[],invitations:[],rooms:[]}),groups:event.detail.groups.map(group=>({...group}))};groupsLoadedAt=Date.now();cacheStore.write(account.snapshot().id,data);renderAll();});
 root.addEventListener('playroom:hub-rendered',()=>{for(const view of views){
  if(!view.host||!valid(view)||view.host.closest('#hub-social-page.is-active')||!view.operation&&!view.refreshFlight&&!view.loading)continue;
  // Retain the root's native controls, but retire capabilities of the destination left behind.
  view.operation=null;view.refreshTicket++;view.refreshFlight=null;view.loading=false;view.playIntent++;render(view);
 }});
 root.addEventListener('playroom:modal-restored',()=>{const view=activeView();if(view){view.awaitingAccount=false;bindOrder(view);void refreshView(view,true);}});
 root.addEventListener('pagehide',()=>{root.clearTimeout(timer);timer=null;for(const view of views){view.operation=null;view.refreshTicket++;view.refreshFlight=null;view.loading=false;view.playIntent++;}});
 root.addEventListener('pageshow',()=>{if(!account||!service)return;const view=activeView();if(view){render(view);void refreshView(view,true);}activate();});
 function acceptInbox(items){if(!items?.length)return;hubLoadedAt=0;if(!data)return;hubSequence=++readSequence;const conversations=new Map((data.conversations||[]).map(person=>[person.userId,person]));for(const item of items)if(item.person?.userId&&!conversations.has(item.person.userId))conversations.set(item.person.userId,{...item.person});data={...data,conversations:[...conversations.values()]};cacheStore.write(account.snapshot().id,data);renderAll();}
 function prefetch(){return refresh({force:false,background:true});}
 root.PlayroomCommunityUI=Object.freeze({init,show,remember,refresh,prefetch,acceptInbox,activate,presence,get service(){return service;}});
})(globalThis);
