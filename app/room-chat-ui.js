/* Room/team conversation UI. The host filters history and live delivery. */
(function(root){
 'use strict';const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,W=()=>root.PlayroomChatComponents;
 const Cache=()=>root.PlayroomChatState,views=new Set(),draftStore=new Map(),replyStore=new Map(),retryStore=new Map(),draftOwnerStore=new Map();let rtc=null;
 function createView(cloudGroup){
  const service=root.PlayroomCommunityUI?.service,accountKey=service?.key?.()||'local',revision=service?.generation,lifetime=new AbortController(),draftOwner=Symbol('room-draft-owner');let retired=false,api;
  const sameAccount=()=>root.PlayroomCommunityUI?.service===service&&service?.key?.()===accountKey&&service?.generation===revision;
  const scoped=store=>({get:k=>store.get(accountKey+':'+k),set:(k,v)=>store.set(accountKey+':'+k,v),delete:k=>store.delete(accountKey+':'+k)}),draftOwners=scoped(draftOwnerStore);
  function listenDocument(type,handler,options={}){document.addEventListener(type,event=>{if(!retired&&interactive()&&element()?.contains(event.target))handler(event);},{...(typeof options==='boolean'?{capture:options}:options),signal:lifetime.signal});}
  function listenRoot(type,handler){root.addEventListener(type,event=>{if(!retired)handler(event);},{signal:lifetime.signal});}
  let initialized=false,openingThrough=null,firstRefresh=true;
  let features={},surface=null,panelElement=null,ctx=null,scope='room',team=null,teamColor=null,rows=[],older=false,busy=false,loading=false,pagePaused=false,generation=0,timer=null,onBack=null,seenThrough=0,seenBusy=false;
  const drafts=scoped(draftStore),replyDrafts=scoped(replyStore),retries=scoped(retryStore);
  let contextSource=()=>root.PlayroomNetworkLibrary.chatContext(),identityOverride=null;
  const activeHost=()=>document.getElementById('modal-root')?.querySelector(':scope>[data-surface-state=active]');
  const element=()=>!retired?(surface?.state!=='disposed'?surface?.element||panelElement:null):null;
  const content=()=>element()?.querySelector('[data-room-chat-content]'),interactive=()=>!pagePaused&&!!content()&&(surface?surface.state==='active':!panelElement||!activeHost()&&!panelElement.closest('[inert]')&&panelElement.getAttribute('aria-hidden')!=='true'),form=()=>content()?.querySelector('[data-room-chat-form]'),key=()=>ctx?.cloudGroup?'group:'+ctx.roomId:'room:'+ctx?.roomId+':'+ctx?.participantId+':'+scope;
  const error=value=>{const node=content()?.querySelector('[data-room-chat-error]');if(node)node.textContent=value;};
  const color=value=>value||'#668fad';
  function render(bottom=false,preserve=false){
   const el=content();if(!el)return;el.dataset.replySupport=String(features.replies===true);const list=el.querySelector('[data-room-chat-messages]'),position=Cache().anchor(list);if(preserve)position.bottom=false;
   let day='',unreadShown=false;const markup=rows.map(m=>{const date=new Date(m.at),next=date.toLocaleDateString('ru-RU'),divider=next===day?'':`<div class="chat-date" data-entity="day-${next}">${H().esc(date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}))}</div>`;day=next;
    const unread=!unreadShown&&!m.mine&&openingThrough!==null&&Cache().number(m.seq??m.id)>Cache().number(openingThrough);if(unread)unreadShown=true;
    return divider+(unread?Cache().divider():'')+`<div class="chat-message ${m.mine?'mine':''} ${m.kind==='invitation'?'chat-invitation':m.kind==='reaction'||root.PlayroomQuickReactions.valid(m.body)?'chat-emoji':''}" ${m.kind==='invitation'&&!m.mine&&m.state==='active'?'data-chat-active-invite':''} data-entity="room-message-${H().esc(m.id)}"><div class="room-chat-author">${root.TabletopUI.avatar({name:m.nickname,avatar:m.avatar},0,{hidden:true})}<strong>${H().esc(m.nickname)}</strong></div>${W().details(m,'reply')}${m.kind==='invitation'?W().invitation(m,{prefix:'room-chat'}):`<p>${root.PlayroomReactionView.html(m.body)}</p>`}${W().details(m,'reactions')}${W().time(m.at,m)}</div>`;}).join('');
   const historyAction=`<button type="button" class="conversation-inline-action room-chat-drawer-action" data-room-chat-older ${older?'':'hidden'} ${loading?'disabled':''}>Загрузить более ранние сообщения</button>`;
   root.PlayroomDOM.ListController.update(list,historyAction+(markup||'<p class="muted">Пока нет сообщений</p>'));if(!initialized&&(rows.length||Cache().get(key()).loaded)){Cache().initial(key(),list);initialized=true;}else Cache().restore(list,position);if(preserve)Cache().revealUnread(list);if(initialized)Cache().remember(key(),list);root.PlayroomChatComponents.navigation(list);
   el.dataset.channel=scope;el.style.setProperty('--room-team-color',color(teamColor));
   const tabs=el.querySelector('[data-room-chat-tabs]');tabs.hidden=!team;tabs.style.setProperty('--page-index',scope==='team'?1:0);for(const button of tabs.querySelectorAll('button')){button.setAttribute('aria-selected',String(button.dataset.roomChatTab===scope));button.disabled=busy;}H().bindPageTabs(tabs,{panel:list,current:()=>current()&&interactive()});
   W().bindActions(el,id=>rows.find(m=>String(m.id)===id),{reply:replyMessage,react:reactMessage,canReply:features.replies===true,canReact:features.reactions===true});
   requestAnimationFrame(markRead);
   const invite=el.querySelector('[data-group-room-invite]'),network=root.PlayroomNetworkLibrary.inviteContext();if(invite)invite.hidden=!(ctx?.cloudGroup&&network?.room?.transportMode==='online'&&(network.room.ownerId===network.participantId||network.room.allowPlayerInvites));
   const old=el.querySelector('[data-room-chat-older]');old.hidden=!older;old.disabled=loading;W().resize(form(),busy);
  }
  async function markRead(){if(seenBusy||!ctx||!current()||!visibleHistory())return;const row=W().seen(content().querySelector('[data-room-chat-messages]'),rows,'room-message-'),through=row?.seq??row?.id;if(!row||Cache().number(through)<=Cache().number(seenThrough))return;const ticket=generation;seenBusy=true;Cache().read(key(),through);try{await contextSource().call({type:'room-chat-seen',scope,through});if(ticket===generation&&current()){seenThrough=through;if(!ctx.cloudGroup)void root.PlayroomPushUI?.roomSeen?.(root.PlayroomCloudNetwork?.roomId?.(),rows.filter(m=>!m.mine&&Cache().number(m.seq??m.id)<=Cache().number(through)).map(m=>m.id));}}catch(_){}finally{if(ticket===generation)seenBusy=false;}}
  listenDocument('scroll',event=>{if(event.target.matches?.('[data-room-chat-messages]')){if(ctx&&current())Cache().remember(key(),event.target);void markRead();}},true);listenRoot('focus',()=>void markRead());
  listenRoot('playroom:chat-cache-updated',event=>{if(ctx&&content()&&event.detail.key===key()){rows=Cache().get(key()).rows;render();}});
  function sameIdentity(a,b){return !!a&&!!b&&a.roomId===b.roomId&&a.participantId===b.participantId&&!!a.cloudGroup===!!b.cloudGroup;}
  function current(){return !retired&&sameAccount()&&sameIdentity(ctx,contextSource());}
  function visibleHistory(){
   const host=content(),list=host?.querySelector('[data-room-chat-messages]');
   if(document.hidden||!current()||!interactive()||!list?.isConnected||host.closest('[inert],[hidden],[aria-hidden="true"]'))return false;
   const viewport=root.visualViewport,box=list.getBoundingClientRect();let left=Math.max(viewport?.offsetLeft||0,box.left),top=Math.max(viewport?.offsetTop||0,box.top),right=Math.min((viewport?.offsetLeft||0)+(viewport?.width||innerWidth),box.right),bottom=Math.min((viewport?.offsetTop||0)+(viewport?.height||innerHeight),box.bottom);
   for(let element=list;element;element=element.parentElement){const style=getComputedStyle(element);if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return false;if(element===list)continue;const clipX=/hidden|clip|auto|scroll/.test(style.overflowX),clipY=/hidden|clip|auto|scroll/.test(style.overflowY);if(clipX||clipY){const rect=element.getBoundingClientRect();if(clipX){left=Math.max(left,rect.left+element.clientLeft);right=Math.min(right,rect.left+element.clientLeft+element.clientWidth);}if(clipY){top=Math.max(top,rect.top+element.clientTop);bottom=Math.min(bottom,rect.top+element.clientTop+element.clientHeight);}}}
   if(right<=left||bottom<=top)return false;
   return [[.5,.5],[.15,.15],[.85,.15],[.15,.85],[.85,.85]].some(([x,y])=>{const hit=document.elementFromPoint(left+(right-left)*x,top+(bottom-top)*y);return !!hit&&list.contains(hit);});
  }
  function presented({roomId,scope:channel}={}){return !ctx?.cloudGroup&&ctx?.roomId===roomId&&scope===channel&&visibleHistory();}
  function active(ticket){if(ticket!==generation||!content())return false;if(current())return true;close();return false;}
  function merge(messages,options){rows=Cache().merge(key(),messages,options).rows;}
  function applyHistoryBoundary(result){
   if(result.historyAfter===undefined)return false;const cached=Cache().get(key()),boundary=Cache().number(result.historyAfter),length=cached.rows.length;
   cached.rows=cached.rows.filter(m=>Cache().number(m.seq??m.id)>boundary);if(Cache().number(cached.cursor)<boundary)cached.cursor=String(result.historyAfter);rows=cached.rows;return rows.length!==length;
  }
  function retireUnavailableGroup(){
   if(!ctx?.cloudGroup)return;close();new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')}).invalidate();B().toast('Эта группа больше недоступна.');
  }
  listenRoot('playroom:groups-updated',event=>{if(ctx?.cloudGroup&&event.detail?.accountId===root.PlayroomAccountUI?.service?.snapshot().id&&Array.isArray(event.detail.groups)&&!event.detail.groups.some(group=>group.id===ctx.roomId))retireUnavailableGroup();});
  async function read(before=null){
   if(loading||!content()||!ctx)return;const ticket=generation;loading=true;
   try{if(!current())throw Error('room-changed');const live=contextSource();if(!live.connected)throw Error('disconnected');
    const result=await live.call({type:'room-chat-read',scope,...Cache().request(key(),before)});if(!active(ticket))return;features=result.features||{};
    const list=content().querySelector('[data-room-chat-messages]'),height=list.scrollHeight,top=list.scrollTop;
    applyHistoryBoundary(result);if(scope==='team'&&team!==result.team){const cached=Cache().get(key());cached.rows=[];cached.cursor='0';cached.loaded=false;rows=[];initialized=false;openingThrough=null;}if(openingThrough===null)openingThrough=result.through??Cache().boundary(key());if(result.through!==undefined)Cache().advance(key(),result.through);team=result.team;teamColor=W().teamColor(result.teamColor,result.teamColorRole);if(before||!Cache().get(key()).loaded)older=result.older;merge(result.messages,{fetched:!before,older});const preserve=firstRefresh&&!before&&Cache().get(key()).scroll!==null;firstRefresh=false;render(false,preserve);if(before)list.scrollTop=top+list.scrollHeight-height;error('');
   }catch(failure){if(ticket===generation){error(ctx?.cloudGroup?(failure.code==='forbidden'?'Вы больше не участник группы.':'Не удалось загрузить переписку. Попробуйте ещё раз.'):(current()?'Нет связи с хостом. Сообщения сохранятся в поле ввода.':'Комната закрыта.'));}}
   finally{if(ticket===generation){loading=false;render();}}
  }
  function schedule(){clearTimeout(timer);if(pagePaused||retired)return;const ticket=generation;timer=setTimeout(async()=>{if(!active(ticket))return;if(!document.hidden&&interactive())await read();if(active(ticket))schedule();},4000);}
  function saveDraft(){if(ctx&&current()&&form()){const k=key();if(!interactive()&&draftOwners.get(k)&&draftOwners.get(k)!==draftOwner)return;drafts.set(k,form().elements.message.value);replyDrafts.set(k,form()._replyMessage||null);draftOwners.set(k,draftOwner);}}
  function close(){if(retired)return;if(ctx&&current()&&content())Cache().remember(key(),content().querySelector('[data-room-chat-messages]'));saveDraft();if(panelElement?.isConnected)root.PlayroomGameChatPanel?.dismiss();generation++;seenThrough=0;seenBusy=false;clearTimeout(timer);root.PlayroomReactionUI.close();ctx=null;surface=null;panelElement=null;rows=[];busy=false;loading=false;retired=true;lifetime.abort();views.delete(api);if(rtc===api)rtc=null;}
  function channelTabs(){return `<div class="app-page-tabs shared-page-tabs room-chat-tabs" data-room-chat-tabs role="tablist" aria-label="Канал чата"><button type="button" role="tab" data-room-chat-tab="room">Общий</button><button type="button" role="tab" data-room-chat-tab="team">Команда</button></div>`;}
  function gamePanelMarkup(){
   return `<header class="modal-head game-chat-drawer-head"><h2>Чат комнаты</h2>${H().iconButton('data-command="close-modal"','Закрыть чат','close')}</header><div class="social-content game-chat-drawer-content" data-room-chat-content>${channelTabs()}<div class="chat-scroll-zone"><div class="chat-messages" data-room-chat-messages tabindex="0" aria-label="История чата"></div></div><div class="room-chat-drawer-feedback"><p data-room-chat-error role="status"></p><button type="button" class="room-chat-drawer-action" data-room-chat-refresh>Повторить</button></div>${W().composer('room-chat')}</div>`;
  }
  function show({resume=null,onReturn=null,source=null,identity=null,initialScope='room'}={},initialContext=null){
   const provider=source||(()=>root.PlayroomNetworkLibrary.chatContext()),next=initialContext||provider();if(!next)return;const back=onReturn||B().captureModalReturn();features={};ctx=next;contextSource=provider;identityOverride=identity;onBack=back;scope=resume?.scope||initialScope;initialized=false;firstRefresh=true;const cached=Cache().get(key());openingThrough=cached.loaded?Cache().boundary(key()):null;rows=resume?.rows||cached.rows;team=resume?.team||null;teamColor=resume?.teamColor||null;older=resume?.older??cached.older;
   const cover=root.PlayroomViews?.cover(ctx.game.id)||H().icon('board');
   const identityMarkup=(typeof identity==='function'?identity():identity)||`<div class="chat-person chat-header-person room-chat-game">${Cache().avatar(key(),`<span class="pack-art" data-theme="${H().tileTheme(ctx.game)}" aria-hidden="true">${cover}</span>`)}<span><strong>${H().esc(ctx.game.name)}</strong><small>${H().esc(ctx.roomName)}</small></span></div>`;
   const panelMode=!ctx.cloudGroup&&!!document.querySelector('#app .network-game')&&!document.querySelector('#modal-root>*');
   const mount=panelMode?(markup)=>root.PlayroomGameChatPanel.open(markup,{onClose:close,isCurrent:()=>!!current()}):B().openModal;
   const surfaceTicket=generation,surfaceOwner={...ctx},surfaceProvider=contextSource,accountRevision=root.PlayroomCommunityUI?.service?.generation;
   surface=mount(panelMode?gamePanelMarkup():`${W().header(identityMarkup,root.PlayroomConversationSearchUI.moreButton('data-room-chat-menu'))}<div class="social-content" data-room-chat-content>${channelTabs()}<div class="chat-scroll-zone"><div class="chat-messages" data-room-chat-messages tabindex="0" aria-label="История чата"></div></div>${W().composer('room-chat')}<div class="conversation-feedback"><p data-room-chat-error role="status"></p><button type="button" class="conversation-inline-action" data-room-chat-refresh>Повторить</button></div></div>`,'community-modal chat-modal room-chat-modal conversation-021',{mode:'push',size:'large',valid:()=>sameAccount()&&surfaceTicket===generation&&sameIdentity(surfaceOwner,surfaceProvider())&&accountRevision===root.PlayroomCommunityUI?.service?.generation,onDispose:()=>{if(surfaceTicket===generation)close();},onBack:()=>{close();back();}});
   if(panelMode){panelElement=surface;surface=null;}else surface?.element.querySelector('.modal')?.setAttribute('aria-label','Чат: '+ctx.roomName);
   if(!content()){close();return;}form().elements.message.value=drafts.get(key())||'';W().replyDraft(form(),replyDrafts.get(key()));render(!resume);H().fitCovers(surface?.element||panelElement||activeHost());const ticket=generation;void read().then(()=>{if(!active(ticket))return;if(resume&&content())content().querySelector('[data-room-chat-messages]').scrollTop=resume.scroll;schedule();});
  }
  function captureReturn(){if(!ctx||!current()||!interactive())return null;saveDraft();const source=contextSource,owner={...ctx};if(surface){const back=B().captureModalReturn();return ()=>!retired&&sameAccount()&&sameIdentity(owner,source())&&back();}const retainedPanel=panelElement;return ()=>!retired&&sameAccount()&&sameIdentity(owner,source())&&panelElement===retainedPanel&&!!retainedPanel?.isConnected;}

  function showMenu(){
   if(!interactive()||busy||!surface)return;saveDraft();const back=captureReturn(),frame=surface,ticket=generation,who={...ctx},provider=contextSource,revision=root.PlayroomCommunityUI?.service?.generation;
   const valid=()=>ticket===generation&&surface===frame&&frame.state!=='disposed'&&sameIdentity(who,provider())&&revision===root.PlayroomCommunityUI?.service?.generation;
   const profileButton=content().closest('.modal')?.querySelector('[data-group-info]');
   root.PlayroomConversationSearchUI.menu({title:ctx.roomName,valid,back,profile:profileButton?{label:'Информация о группе',run:()=>profileButton.click()}:null,refresh:()=>void read(),search:ctx.cloudGroup?{enabled:features.search===true,search:params=>root.PlayroomCommunityUI.service.call('group-search',{groupId:who.roomId,...params}),loadTarget:hit=>provider().call({type:'room-chat-read',scope,after:(BigInt(hit.id)-1n).toString()}),prepareTarget:result=>{if(valid()&&applyHistoryBoundary(result))render(false,true);},onUnavailable:()=>{if(valid())retireUnavailableGroup();},commitJump:(result,hit)=>{if(!valid()||!interactive())return;applyHistoryBoundary(result);features=result.features||features;merge(result.messages);older=true;render();const list=content().querySelector('[data-room-chat-messages]');root.PlayroomConversationSearchUI.jump(list,String(hit.id),'room-message-');Cache().remember(key(),list);}}:null});
  }
  function replyMessage(message){if(busy||!interactive()||!current()||!features.replies)return;W().replyDraft(form(),message);form().querySelector('[data-chat-editor]').focus();}
  async function reactMessage(message,emoji){
   if(busy||!current()||!interactive()||!features.reactions)return;const ticket=generation;busy=true;render();
   try{const request=Cache().request(key()),result=await contextSource().call({type:'room-chat-react',scope,targetId:message.id,emoji,enabled:!message.reactions?.some(r=>r.emoji===emoji&&r.mine),...request,known:[...new Set([...(request.known||[]),String(message.seq??message.id)])]});if(!active(ticket))return;merge(result.messages,{fetched:true});error('');render();}catch(_){if(ticket===generation)error('Не удалось изменить реакцию. Попробуйте ещё раз.');}finally{if(ticket===generation){busy=false;render();}}
  }
  async function send(body,{draft=false}={}){
   if(!ctx||busy||!body.trim()||!current()||!interactive())return;const ticket=generation,k=key(),live=contextSource(),owner={...ctx},provider=contextSource,accountRevision=root.PlayroomCommunityUI?.service?.generation;if(!live.connected){error('Нет связи с хостом. Попробуйте после подключения.');return;}
   const replyToId=form().dataset.replyToId||null;if(replyToId&&!features.replies){error('На сервере ещё не включены ответы на сообщения.');return;}let retry=retries.get(k);if(!retry||retry.body!==body||retry.replyToId!==replyToId)retry={replyToId,id:crypto.randomUUID(),body,kind:root.PlayroomQuickReactions.valid(body)?'reaction':'message'};retries.set(k,retry);busy=true;render();
   try{const result=await live.call({type:'room-chat-send',scope,...retry,...Cache().request(key())});
    if(!sameIdentity(owner,provider())||accountRevision!==root.PlayroomCommunityUI?.service?.generation)return;
    if(ticket!==generation||!content()){
     const savedReply=replyDrafts.get(k);if(draftOwners.get(k)===draftOwner){if(draft&&(drafts.get(k)||'').trim()===body&&(savedReply?.id||null)===replyToId)drafts.delete(k);if((savedReply?.id||null)===replyToId)replyDrafts.delete(k);}if(retries.get(k)?.id===retry.id)retries.delete(k);
     if(current()&&key()===k&&form()){const liveForm=form();if(draft&&liveForm.elements.message.value.trim()===body&&(liveForm.dataset.replyToId||null)===replyToId)liveForm.elements.message.value='';if((liveForm.dataset.replyToId||null)===replyToId)W().replyDraft(liveForm,null);saveDraft();W().resize(liveForm,busy);}return;
    }
    if(!active(ticket))return;merge(result.messages,{fetched:true});if(retries.get(k)?.id===retry.id)retries.delete(k);if(draft&&form().elements.message.value.trim()===body){form().elements.message.value='';if(draftOwners.get(k)===draftOwner)drafts.delete(k);}if((form().dataset.replyToId||null)===replyToId){W().replyDraft(form(),null);if(draftOwners.get(k)===draftOwner)replyDrafts.delete(k);}error('');render(true);}
   catch(_){if(ticket===generation)error('Сообщение не отправлено. Попробуйте ещё раз.');}finally{if(ticket===generation){busy=false;render();}}
  }
  function receiveLive(event){if(ctx?.roomId===event.roomId&&current()&&content()&&scope===event.entry.scope){merge([event.entry]);render();}}
  listenDocument('click',event=>{if(event.target.closest('[data-room-chat-menu]')){showMenu();return;}if(event.target.closest('[data-room-chat-refresh]'))void read();if(event.target.closest('[data-room-chat-older]'))void read(rows[0]?.seq);
   const tab=event.target.closest('[data-room-chat-tab]');if(tab&&!busy&&scope!==tab.dataset.roomChatTab){Cache().remember(key(),content().querySelector('[data-room-chat-messages]'));saveDraft();generation++;seenThrough=0;seenBusy=false;loading=false;scope=tab.dataset.roomChatTab;const cached=Cache().get(key());rows=cached.rows;older=cached.older;initialized=false;firstRefresh=true;openingThrough=cached.loaded?Cache().boundary(key()):null;form().elements.message.value=drafts.get(key())||'';W().replyDraft(form(),replyDrafts.get(key()));render();void read();}
   const reaction=event.target.closest('[data-room-chat-reactions]');if(reaction&&!busy){const ticket=generation;root.PlayroomChatComposer.open(reaction.form,reaction,emoji=>{if(ticket===generation)return send(emoji);});}
  });
  listenDocument('click',async event=>{
   const join=event.target.closest('[data-room-chat-join]'),decline=event.target.closest('[data-room-chat-decline]'),invite=event.target.closest('[data-group-room-invite]');if(!join&&!decline&&!invite||busy||!ctx?.cloudGroup)return;
   const ticket=generation;busy=true;render();
   try{if(invite){let retry=retries.get(key()+':invite');if(!retry){retry={id:crypto.randomUUID()};retries.set(key()+':invite',retry);}if(await root.PlayroomLobbyNetwork.inviteGroup({id:ctx.roomId,name:ctx.roomName},retry))retries.delete(key()+':invite');}
    else if(join)await root.PlayroomLobbyNetwork.joinInvitation(join.dataset.roomChatJoin,{roomId:join.dataset.invitationRoom,ownerId:join.dataset.invitationOwner});else await root.PlayroomCommunityUI.service.call('decline-invite',{inviteId:decline.dataset.roomChatDecline});
    if(ticket===generation&&content())await read();
   }catch(failure){if(ticket===generation)error(root.PlayroomSocialUI.message(failure));}finally{if(ticket===generation){busy=false;render();}}
  });
  listenDocument('click',event=>{const message=W().messageTarget(event,content());if(!message||busy)return;const ticket=generation;const row=rows.find(m=>'room-message-'+m.id===message.dataset.entity);if(row)W().actions(message,row,{canReply:features.replies===true,canReact:features.reactions===true,reply:m=>{if(ticket===generation)replyMessage(m);},react:(m,emoji)=>{if(ticket===generation)return reactMessage(m,emoji);}});});
  listenDocument('submit',event=>{if(!event.target.matches('[data-room-chat-form]'))return;event.preventDefault();void send(event.target.elements.message.value.trim(),{draft:true});});
  listenDocument('input',event=>{if(event.target.matches('[data-room-chat-form] [data-chat-editor]')){W().resize(form(),busy);saveDraft();}});
  listenDocument('playroom:chat-draft-changed',event=>{if(event.target.matches('[data-room-chat-form]')&&event.target===form())saveDraft();});
  listenRoot('resize',()=>W().resize(form(),busy));listenRoot('pagehide',event=>{if(!event.persisted){close();return;}saveDraft();if(current()&&content())Cache().remember(key(),content().querySelector('[data-room-chat-messages]'));pagePaused=true;clearTimeout(timer);timer=null;});
  listenRoot('pageshow',event=>{if(!event.persisted||!pagePaused)return;pagePaused=false;if(!current()){close();return;}W().resize(form(),busy);schedule();if(interactive())void read();});
  api=Object.freeze({show,close,captureReturn,presented,receiveLive,active:()=>current()&&interactive(),groupId:()=>cloudGroup&&!retired?ctx?.roomId:null});return api;
 }
 const activeView=()=>[...views].reverse().find(view=>view.active());
 function show(options={}){const provider=options.source||(()=>root.PlayroomNetworkLibrary.chatContext()),next=provider();if(!next)return;if(!next.cloudGroup)rtc?.close();const view=createView(!!next.cloudGroup);views.add(view);if(!next.cloudGroup)rtc=view;return view.show({...options,source:provider},next);}
 function close({groupId}={}){if(groupId){for(const view of [...views])if(view.groupId()===groupId)view.close();return;}(activeView()||rtc||[...views].at(-1))?.close();}
 function reset(){for(const view of [...views])view.close();draftStore.clear();replyStore.clear();retryStore.clear();draftOwnerStore.clear();}
 function presented(context){return rtc?.presented(context)||false;}
 function receive(event){
  const live=root.PlayroomNetworkLibrary.chatContext();if(!live||live.roomId!==event.roomId)return;const message=event.entry,k='room:'+event.roomId+':'+live.participantId+':'+message.scope,known=Cache().get(k).rows.some(m=>m.id===message.id);Cache().merge(k,[message]);if(!known)void root.PlayroomChatActivity?.incoming(event);rtc?.receiveLive(event);
  if(event.bubble&&!presented({roomId:event.roomId,scope:message.scope}))root.PlayroomReactionUI.message(message,{roomId:event.roomId});
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-room-chat-open]');if(button&&!button.closest('[inert],[hidden],[aria-hidden="true"]'))show();});
 root.PlayroomRoomChatUI=Object.freeze({show,receive,presented,close,reset,captureReturn:()=>activeView()?.captureReturn()||null,currentGroupId:()=>activeView()?.groupId()||null});
})(globalThis);
