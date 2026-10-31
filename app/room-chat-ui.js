/* Room/team conversation UI. The host filters history and live delivery. */
(function(root){
 'use strict';const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,W=()=>root.PlayroomChatComponents;
 const Cache=()=>root.PlayroomChatState;let initialized=false,openingThrough=null,firstRefresh=true;
 let ctx=null,scope='room',team=null,teamColor=null,rows=[],older=false,busy=false,loading=false,generation=0,timer=null,onBack=null,seenThrough=0,seenBusy=false;
 const drafts=new Map(),retries=new Map();
 let contextSource=()=>root.PlayroomNetworkLibrary.chatContext(),identityOverride=null;
 const content=()=>document.querySelector('[data-room-chat-content]'),form=()=>content()?.querySelector('[data-room-chat-form]'),key=()=>ctx?.cloudGroup?'group:'+ctx.roomId:'room:'+ctx?.roomId+':'+ctx?.participantId+':'+scope;
 const error=value=>{const node=content()?.querySelector('[data-room-chat-error]');if(node)node.textContent=value;};
 const color=value=>value||'#668fad';
 function render(bottom=false,preserve=false){
  const el=content();if(!el)return;const list=el.querySelector('[data-room-chat-messages]'),position=Cache().anchor(list);if(preserve)position.bottom=false;
  let day='',unreadShown=false;const markup=rows.map(m=>{const date=new Date(m.at),next=date.toLocaleDateString('ru-RU'),divider=next===day?'':`<div class="chat-date" data-entity="day-${next}">${H().esc(date.toLocaleDateString('ru-RU',{day:'numeric',month:'long'}))}</div>`;day=next;
   const unread=!unreadShown&&!m.mine&&openingThrough!==null&&Cache().number(m.seq??m.id)>Cache().number(openingThrough);if(unread)unreadShown=true;
   return divider+(unread?Cache().divider():'')+`<div class="chat-message ${m.mine?'mine':''} ${m.kind==='invitation'?'chat-invitation':m.kind==='reaction'||root.PlayroomQuickReactions.valid(m.body)?'chat-emoji':''}" ${m.kind==='invitation'&&!m.mine&&m.state==='active'?'data-chat-active-invite':''} data-entity="room-message-${H().esc(m.id)}"><div class="room-chat-author">${root.TabletopUI.avatar({name:m.nickname,avatar:m.avatar},0,{hidden:true})}<strong>${H().esc(m.nickname)}</strong></div>${m.kind==='invitation'?W().invitation(m,{prefix:'room-chat'}):`<p>${root.PlayroomReactionView.html(m.body)}</p>`}${W().time(m.at,m)}</div>`;}).join('');
  root.PlayroomDOM.ListController.update(list,markup||'<p class="muted">Пока нет сообщений</p>');if(!initialized&&(rows.length||Cache().get(key()).loaded)){Cache().initial(key(),list);initialized=true;}else Cache().restore(list,position);if(preserve)Cache().revealUnread(list);if(initialized)Cache().remember(key(),list);root.PlayroomChatComponents.navigation(list);
  el.dataset.channel=scope;el.style.setProperty('--room-team-color',color(teamColor));
  const tabs=el.querySelector('[data-room-chat-tabs]');tabs.hidden=!team;tabs.style.setProperty('--page-index',scope==='team'?1:0);for(const button of tabs.querySelectorAll('button')){button.setAttribute('aria-selected',String(button.dataset.roomChatTab===scope));button.disabled=busy;}
  requestAnimationFrame(markRead);
  const invite=el.querySelector('[data-group-room-invite]'),network=root.PlayroomNetworkLibrary.inviteContext();if(invite)invite.hidden=!(ctx?.cloudGroup&&network?.room?.transportMode==='online'&&(network.room.ownerId===network.participantId||network.room.allowPlayerInvites));
  const old=el.querySelector('[data-room-chat-older]');old.hidden=!older;old.disabled=loading;W().resize(form(),busy);
 }
 async function markRead(){if(seenBusy||!ctx||!current()||!content())return;const row=W().seen(content().querySelector('[data-room-chat-messages]'),rows,'room-message-');if(!row||row.seq<=seenThrough)return;const ticket=generation;seenBusy=true;Cache().read(key(),row.seq??row.id);try{await contextSource().call({type:'room-chat-seen',scope,through:row.seq});if(ticket===generation){seenThrough=row.seq;}}catch(_){}finally{if(ticket===generation)seenBusy=false;}}
 document.addEventListener('scroll',event=>{if(event.target.matches?.('[data-room-chat-messages]')){if(ctx)Cache().remember(key(),event.target);void markRead();}},true);root.addEventListener('focus',()=>void markRead());
 root.addEventListener('playroom:chat-cache-updated',event=>{if(ctx&&content()&&event.detail.key===key()){rows=Cache().get(key()).rows;render();}});
 function current(){return ctx&&contextSource()?.roomId===ctx.roomId;}
 function merge(messages,options){rows=Cache().merge(key(),messages,options).rows;}
 async function read(before=null){
  if(loading||!content()||!ctx)return;const ticket=generation;loading=true;
  try{if(!current())throw Error('room-changed');const live=contextSource();if(!live.connected)throw Error('disconnected');
   const result=await live.call({type:'room-chat-read',scope,...Cache().request(key(),before)});if(ticket!==generation||!content())return;
   const list=content().querySelector('[data-room-chat-messages]'),height=list.scrollHeight,top=list.scrollTop;
   if(result.historyAfter!==undefined){const cached=Cache().get(key()),boundary=Cache().number(result.historyAfter);cached.rows=cached.rows.filter(m=>Cache().number(m.seq??m.id)>boundary);if(Cache().number(cached.cursor)<boundary)cached.cursor=String(result.historyAfter);rows=cached.rows;}if(scope==='team'&&team!==result.team){const cached=Cache().get(key());cached.rows=[];cached.cursor='0';cached.loaded=false;rows=[];initialized=false;openingThrough=null;}if(openingThrough===null)openingThrough=result.through??Cache().boundary(key());if(result.through!==undefined)Cache().advance(key(),result.through);team=result.team;teamColor=W().teamColor(result.teamColor,result.teamColorRole);if(before||!Cache().get(key()).loaded)older=result.older;merge(result.messages,{fetched:!before,older});const preserve=firstRefresh&&!before&&Cache().get(key()).scroll!==null;firstRefresh=false;render(false,preserve);if(before)list.scrollTop=top+list.scrollHeight-height;error('');
  }catch(failure){if(ticket===generation){error(ctx?.cloudGroup?(failure.code==='forbidden'?'Вы больше не участник группы.':'Не удалось загрузить переписку. Попробуйте ещё раз.'):(current()?'Нет связи с хостом. Сообщения сохранятся в поле ввода.':'Комната закрыта.'));}}
  finally{if(ticket===generation){loading=false;render();}}
 }
 function schedule(){clearTimeout(timer);timer=setTimeout(async()=>{if(!content())return;if(!document.hidden)await read();schedule();},4000);}
 function saveDraft(){if(ctx&&form())drafts.set(key(),form().elements.message.value);}
 function close(){if(ctx&&content())Cache().remember(key(),content().querySelector('[data-room-chat-messages]'));saveDraft();generation++;seenThrough=0;seenBusy=false;clearTimeout(timer);root.PlayroomReactionUI.close();ctx=null;rows=[];busy=false;loading=false;}
 function show({resume=null,onReturn=null,source=null,identity=null,initialScope='room'}={}){
  const provider=source||(()=>root.PlayroomNetworkLibrary.chatContext()),next=provider();if(!next)return;const back=onReturn||B().captureModalReturn();close();ctx=next;contextSource=provider;identityOverride=identity;onBack=back;scope=resume?.scope||initialScope;initialized=false;firstRefresh=true;const cached=Cache().get(key());openingThrough=cached.loaded?Cache().boundary(key()):null;rows=resume?.rows||cached.rows;team=resume?.team||null;teamColor=resume?.teamColor||null;older=resume?.older??cached.older;
  const cover=root.PlayroomViews?.cover(ctx.game.id)||H().icon('board');
  const identityMarkup=(typeof identity==='function'?identity():identity)||`<div class="chat-person chat-header-person room-chat-game">${Cache().avatar(key(),`<span class="pack-art" data-theme="${H().tileTheme(ctx.game)}" aria-hidden="true">${cover}</span>`)}<span><strong>${H().esc(ctx.game.name)}</strong><small>${H().esc(ctx.roomName)}</small></span></div>`;
  B().openModal(`${W().header(identityMarkup,H().iconButton('data-room-chat-refresh','Обновить','reset'))}<div class="social-content" data-room-chat-content><div class="chat-scroll-zone"><div class="social-list chat-messages" data-room-chat-messages tabindex="0" aria-label="История чата"></div>${H().iconButton('data-room-chat-older','Ранее','history',{className:'room-chat-older'})}</div><div class="shared-page-tabs room-chat-tabs" data-room-chat-tabs role="tablist" aria-label="Канал чата"><button type="button" role="tab" data-room-chat-tab="room">Общий</button><button type="button" role="tab" data-room-chat-tab="team">Команда</button></div>${W().composer('room-chat')}<p data-room-chat-error role="status"></p></div>`,'community-modal chat-modal room-chat-modal',{size:'large',onBack:()=>{close();back();}});
  form().elements.message.value=drafts.get(key())||'';render(!resume);H().fitCovers(document.querySelector('.room-chat-modal'));void read().then(()=>{if(resume&&content())content().querySelector('[data-room-chat-messages]').scrollTop=resume.scroll;schedule();});
 }
 function captureReturn(){if(!ctx||!content())return null;saveDraft();const back=onBack,source=contextSource,identity=identityOverride,resume={scope,rows:[...rows],team,teamColor,older,scroll:content().querySelector('[data-room-chat-messages]').scrollTop};return ()=>show({resume,onReturn:back,source,identity});}
 async function send(body,{draft=false}={}){
  if(!ctx||busy||!body.trim()||!current())return;const ticket=generation,k=key(),live=contextSource();if(!live.connected){error('Нет связи с хостом. Попробуйте после подключения.');return;}
  let retry=retries.get(k);if(!retry||retry.body!==body)retry={id:crypto.randomUUID(),body,kind:root.PlayroomQuickReactions.valid(body)?'reaction':'message'};retries.set(k,retry);busy=true;render();
  try{const result=await live.call({type:'room-chat-send',scope,...retry,...Cache().request(key())});if(ticket!==generation||!content())return;merge(result.messages,{fetched:true});retries.delete(k);if(draft&&form().elements.message.value.trim()===body){form().elements.message.value='';drafts.delete(k);}error('');render(true);}
  catch(_){if(ticket===generation)error('Сообщение не отправлено. Попробуйте ещё раз.');}finally{if(ticket===generation){busy=false;render();}}
 }
 function receive(event){
  const live=root.PlayroomNetworkLibrary.chatContext();if(!live||live.roomId!==event.roomId)return;const message=event.entry,k='room:'+event.roomId+':'+live.participantId+':'+message.scope;const known=Cache().get(k).rows.some(m=>m.id===message.id);Cache().merge(k,[message]);if(!known)void root.PlayroomChatActivity?.incoming(event);
  if(ctx?.roomId===event.roomId&&content()&&scope===message.scope){merge([message]);render();}
  if(event.bubble)root.PlayroomReactionUI.message(message);
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-room-chat-open]')){show();return;}if(event.target.closest('[data-room-chat-refresh]'))void read();if(event.target.closest('[data-room-chat-older]'))void read(rows[0]?.seq);
  const tab=event.target.closest('[data-room-chat-tab]');if(tab&&!busy&&scope!==tab.dataset.roomChatTab){Cache().remember(key(),content().querySelector('[data-room-chat-messages]'));saveDraft();generation++;seenThrough=0;seenBusy=false;loading=false;scope=tab.dataset.roomChatTab;const cached=Cache().get(key());rows=cached.rows;older=cached.older;initialized=false;firstRefresh=true;openingThrough=cached.loaded?Cache().boundary(key()):null;form().elements.message.value=drafts.get(key())||'';render();void read();}
  const reaction=event.target.closest('[data-room-chat-reactions]');if(reaction&&!busy){const ticket=generation;root.PlayroomChatComposer.open(reaction.form,reaction,emoji=>{if(ticket===generation)return send(emoji);});}
 });
 document.addEventListener('click',async event=>{
  const join=event.target.closest('[data-room-chat-join]'),decline=event.target.closest('[data-room-chat-decline]'),invite=event.target.closest('[data-group-room-invite]');if(!join&&!decline&&!invite||busy||!ctx?.cloudGroup)return;
  const ticket=generation;busy=true;render();
  try{if(invite){let retry=retries.get(key()+':invite');if(!retry){retry={id:crypto.randomUUID()};retries.set(key()+':invite',retry);}if(await root.PlayroomLobbyNetwork.inviteGroup({id:ctx.roomId,name:ctx.roomName},retry))retries.delete(key()+':invite');}
   else if(join)await root.PlayroomLobbyNetwork.joinInvitation(join.dataset.roomChatJoin,{roomId:join.dataset.invitationRoom,ownerId:join.dataset.invitationOwner});else await root.PlayroomCommunityUI.service.call('decline-invite',{inviteId:decline.dataset.roomChatDecline});
   if(ticket===generation&&content())await read();
  }catch(failure){if(ticket===generation)error(root.PlayroomSocialUI.message(failure));}finally{if(ticket===generation){busy=false;render();}}
 });
 document.addEventListener('submit',event=>{if(!event.target.matches('[data-room-chat-form]'))return;event.preventDefault();void send(event.target.elements.message.value.trim(),{draft:true});});
 document.addEventListener('input',event=>{if(event.target.matches('[data-room-chat-form] [data-chat-editor]')){saveDraft();W().resize(form(),busy);}});
 root.addEventListener('resize',()=>W().resize(form(),busy));root.addEventListener('pagehide',close);
 root.PlayroomRoomChatUI=Object.freeze({show,receive,captureReturn,close,reset:()=>{close();drafts.clear();retries.clear();},currentGroupId:()=>ctx?.cloudGroup&&content()?ctx.roomId:null});
})(globalThis);
