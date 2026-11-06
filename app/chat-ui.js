/* Private conversation presentation; access and deduplication are enforced by RPC. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,C=()=>root.PlayroomCommunityUI,t=k=>root.PlayroomMessages.text('ui.community.'+k);
 const replyDrafts=new Map(),views=new Set();
 function createView(){
  const lifetime=new AbortController(),draftOwner=Symbol('dm-draft-owner');let retired=false,api;
  function listenDocument(type,handler,options={}){document.addEventListener(type,event=>{if(!retired&&interactive()&&content()?.contains(event.target))handler(event);},{...(typeof options==='boolean'?{capture:options}:options),signal:lifetime.signal});}
  function listenRoot(type,handler){root.addEventListener(type,event=>{if(!retired)handler(event);},{signal:lifetime.signal});}
  let features={},owner=null,surface=null;const identity=()=>({key:C().service.key(),revision:C().service.generation}),sameOwner=who=>!!who&&who.key===C().service.key()&&who.revision===C().service.generation,current=()=>sameOwner(owner),draftKey=()=>owner?.key+':dm:'+person?.userId;
  const Cache=()=>root.PlayroomChatState;let initialized=false,openingThrough=null,firstRefresh=true;const cacheKey=()=>person?'dm:'+person.userId:null;
  let person=null,messages=[],timer=null,pagePaused=false,generation=0,sending=false,loading=false,adding=false,older=false,retry=null,lastPresence=0,returnToChatList=null,seenThrough=null,seenBusy=false;
  function content(){return !retired&&surface?.state!=='disposed'?surface?.element.querySelector('.chat-modal:has([data-chat-content])')||null:null;}
  const interactive=()=>!pagePaused&&!!content()&&surface.state==='active';
  function report(error){const el=content()?.querySelector('[data-chat-error]');if(el)el.textContent=error?root.PlayroomSocialUI.message(error):'';}
  function header(){const el=content()?.querySelector('[data-chat-person]');if(!el)return;el.innerHTML=Cache().avatar(cacheKey(),root.TabletopUI.avatar({name:person.nickname,avatar:person.avatar},0,{hidden:true}))+`<span><strong>${H().esc(person.nickname)}</strong><small>${t(person.online?(person.game?'in-game':'online'):'offline')}${person.online&&person.game?' · '+H().esc(person.game):''}</small></span>`;}
  function timelineMarkup(){
   const esc=H().esc,now=new Date(),yesterday=new Date(now);yesterday.setDate(now.getDate()-1);
   const key=date=>[date.getFullYear(),date.getMonth(),date.getDate()].join('-');let previous='',unreadShown=false;
   return messages.map(m=>{
    const date=new Date(m.at),day=key(date),label=day===key(now)?t('today'):day===key(yesterday)?t('yesterday'):date.toLocaleDateString('ru-RU',{day:'numeric',month:'long',...(date.getFullYear()!==now.getFullYear()?{year:'numeric'}:{})});
    const divider=day===previous?'':`<div class="chat-date" data-entity="day-${day}">${esc(label)}</div>`;previous=day;
    const time=root.PlayroomChatComponents.time(m.at,m);
    const invited=['invitation','group-invitation'].includes(m.kind),group=m.kind==='group-invitation';
    const body=invited?root.PlayroomChatComponents.invitation(m):`<p>${root.PlayroomReactionView.html(m.body)}</p>`;
    const unread=!unreadShown&&!m.mine&&openingThrough!==null&&Cache().number(m.id)>Cache().number(openingThrough);if(unread)unreadShown=true;
    return divider+(unread?Cache().divider():'')+`<div class="chat-message ${m.mine?'mine':''} ${invited?'chat-invitation':root.PlayroomQuickReactions.valid(m.body)?'chat-emoji':''}" ${m.kind==='invitation'&&!m.mine&&m.state==='active'?'data-chat-active-invite':''} data-entity="message-${esc(m.id)}">${root.PlayroomChatComponents.details(m,'reply')}${body}${root.PlayroomChatComponents.details(m,'reactions')}${time}</div>`;

   }).join('');
  }
  function render(bottom=false,preserve=false){
   const el=content();if(!el)return;el.dataset.replySupport=String(features.replies===true);header();const list=el.querySelector('[data-chat-messages]'),position=Cache().anchor(list);if(preserve)position.bottom=false;
   root.PlayroomDOM.ListController.update(list,`<button type="button" class="conversation-inline-action" data-chat-older ${older?'':'hidden'} ${loading?'disabled':''}>Загрузить более ранние сообщения</button>`+(messages.length?timelineMarkup():`<p class="muted">${t('empty-chat')}</p>`));
   if(!initialized&&(messages.length||Cache().get(cacheKey()).loaded)){Cache().initial(cacheKey(),list);initialized=true;}else Cache().restore(list,position);if(preserve)Cache().revealUnread(list);if(initialized)Cache().remember(cacheKey(),list);root.PlayroomChatComponents.navigation(list);
   root.PlayroomChatComponents.bindActions(el,id=>messages.find(m=>String(m.id)===id),{reply:replyMessage,react:reactMessage,canReply:features.replies===true,canReact:features.reactions===true});
   requestAnimationFrame(markRead);

   const old=el.querySelector('[data-chat-older]');old.hidden=!older;old.disabled=loading;
   const add=el.querySelector('[data-chat-add]');add.hidden=!!person.accepted||!!(person.requested||person.id)&&!person.incoming;add.disabled=adding||!!(person.requested||person.id)&&!person.incoming;add.innerHTML=H().icon('addPlayer')+(person.requested||person.id?t(person.incoming?'accept':'request-sent'):'Добавить в друзья');
  }
  async function read(before=null){
   if(loading||!content())return;loading=true;const ticket=generation,friend=person.userId;
   try{const result=await C().service.call('chat',{userId:friend,...Cache().request(cacheKey(),before)});if(ticket!==generation||!current()||!content())return;features=result.features||{};
    const list=content().querySelector('[data-chat-messages]'),height=list.scrollHeight,top=list.scrollTop;
    if(openingThrough===null)openingThrough=result.through??Cache().boundary(cacheKey());if(result.through!==undefined)Cache().advance(cacheKey(),result.through);
    if(before||!Cache().get(cacheKey()).loaded)older=result.messages.length===80;
    messages=Cache().merge(cacheKey(),result.messages,{fetched:!before,older}).rows;const preserve=firstRefresh&&!before&&Cache().get(cacheKey()).scroll!==null;firstRefresh=false;render(false,preserve);
    if(before)list.scrollTop=top+list.scrollHeight-height;
    if(Date.now()-lastPresence>30000){lastPresence=Date.now();const hub=await C().service.call('hub',C().presence());if(ticket===generation&&content()){person=[...hub.friends,...(hub.conversations||[])].find(f=>f.userId===friend)||{...person,online:false,game:null};header();render();}}
    report(null);
   }catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation){loading=false;const old=content()?.querySelector('[data-chat-older]');if(old)old.disabled=false;}}
  }
  async function markRead(){
   if(seenBusy||!person||!interactive())return;const row=root.PlayroomChatComponents.seen(content().querySelector('[data-chat-messages]'),messages,'message-');if(!row||seenThrough&&BigInt(row.id)<=BigInt(seenThrough))return;
   const ticket=generation;seenBusy=true;Cache().read(cacheKey(),row.id);try{await C().service.call('read-messages',{userId:person.userId,through:row.id});if(ticket===generation){seenThrough=row.id;}}catch(_){}finally{if(ticket===generation)seenBusy=false;}
  }
  listenDocument('scroll',event=>{if(event.target.matches?.('[data-chat-messages]')){if(person&&current())Cache().remember(cacheKey(),event.target);void markRead();}},true);
  listenRoot('playroom:chat-cache-updated',event=>{if(person&&content()&&event.detail.key===cacheKey()){messages=Cache().get(cacheKey()).rows;render();}});
  listenRoot('focus',()=>void markRead());
  function resizeComposer(){
   const form=content()?.querySelector('[data-chat-form]');if(!form)return;
   root.PlayroomChatComponents.resize(form,sending);content().querySelector('[data-chat-person]').disabled=sending;
  }
  function saveDraft(form=content()?.querySelector('[data-chat-form]')){if(!current()||!person||!form||!content()?.contains(form))return;const saved=replyDrafts.get(draftKey());if(!interactive()&&saved&&saved.owner!==draftOwner)return;replyDrafts.set(draftKey(),{body:form.elements.message.value,reply:form._replyMessage||null,owner:draftOwner});}
  listenDocument('input',event=>{if(event.target.matches('[data-chat-form] [data-chat-editor]')){resizeComposer();saveDraft();}});
  listenDocument('playroom:chat-draft-changed',event=>{if(event.target.matches('[data-chat-form]'))saveDraft(event.target);});
  listenRoot('resize',resizeComposer);
  function schedule(){clearTimeout(timer);if(pagePaused||retired)return;timer=setTimeout(async()=>{if(!content())return;if(!document.hidden&&interactive())await read();schedule();},5000);}
  function close(){if(retired)return;saveDraft();if(person&&current()&&content())Cache().remember(cacheKey(),content().querySelector('[data-chat-messages]'));root.PlayroomReactionUI.close();generation++;seenThrough=null;seenBusy=false;clearTimeout(timer);timer=null;person=null;owner=null;surface=null;messages=[];retry=null;sending=false;loading=false;adding=false;retired=true;lifetime.abort();views.delete(api);}
  function show(friend,{onBack=B().captureModalReturn(),resume=null,messageId=null}={}){features={};owner=identity();person=friend;initialized=false;firstRefresh=true;const cached=Cache().get(cacheKey());openingThrough=cached.loaded?Cache().boundary(cacheKey()):null;returnToChatList=onBack;older=resume?.older??cached.older;messages=resume?.messages||cached.rows;retry=resume?.retry||null;lastPresence=0;const surfaceTicket=generation,surfaceOwner=owner;surface=B().openModal(`${root.PlayroomChatComponents.header(`<button type="button" class="chat-person chat-header-person" data-chat-person aria-label="${t('friend-profile')}"></button>`,root.PlayroomConversationSearchUI.moreButton('data-chat-menu'))}<div class="social-content" data-chat-content><div class="chat-scroll-zone"><div class="chat-messages" data-chat-messages tabindex="0" aria-label="${t('chats')}"></div><button type="button" class="chat-add-banner" data-chat-add hidden></button></div>${root.PlayroomChatComponents.composer('chat')}<div class="conversation-feedback"><p data-chat-error role="alert"></p><button type="button" class="conversation-inline-action" data-chat-refresh>Повторить</button></div></div>`,'community-modal chat-modal conversation-021',{mode:'push',size:'large',valid:()=>surfaceTicket===generation&&sameOwner(surfaceOwner),onDispose:()=>{if(surfaceTicket===generation)close();},onBack:()=>{close();onBack();}});if(!surface){close();return Promise.resolve();}surface.element.querySelector('.modal')?.setAttribute('aria-label','Чат: '+person.nickname);root.dispatchEvent(new CustomEvent('playroom:chat-opened',{detail:{userId:friend.userId}}));header();const form=content().querySelector('[data-chat-form]'),savedDraft=replyDrafts.get(draftKey());form.elements.message.value=savedDraft?.body??resume?.draft??'';root.PlayroomChatComponents.replyDraft(form,savedDraft?savedDraft.reply:resume?.reply);resizeComposer();render(!resume);if(resume)content().querySelector('[data-chat-messages]').scrollTop=resume.scroll;const ticket=generation;return read().then(async()=>{if(ticket!==generation||!current()||!content())return;const target=/^[1-9][0-9]*$/.test(messageId||'')?String(messageId):null;if(target&&!messages.some(m=>String(m.id)===target)){try{const result=await C().service.call('chat',{userId:friend.userId,after:String(BigInt(target)-1n)});if(ticket!==generation||!current()||!content())return;messages=Cache().merge(cacheKey(),result.messages).rows;older=true;}catch(error){if(ticket===generation)report(error);}}if(ticket!==generation||!current()||!content())return;render(!resume);if(resume&&!target)content().querySelector('[data-chat-messages]').scrollTop=resume.scroll;if(target){await new Promise(requestAnimationFrame);if(ticket!==generation||!current()||!content())return;const list=content().querySelector('[data-chat-messages]'),node=list.querySelector('[data-entity="message-'+target+'"]');if(node){const box=list.getBoundingClientRect(),rect=node.getBoundingClientRect();list.scrollTop+=rect.top-box.top-Math.max(12,(list.clientHeight-rect.height)/2);Cache().remember(cacheKey(),list);root.PlayroomChatComponents.navigation(list);void markRead();}}schedule();});}
  function captureReturn(){
   if(!person||!current()||!interactive())return null;saveDraft();const who=identity(),back=B().captureModalReturn();return ()=>sameOwner(who)&&back();
  }
  function showMenu(){
   if(!interactive()||sending)return;saveDraft();const back=captureReturn(),frame=surface,ticket=generation,who=owner,userId=person.userId;
   const valid=()=>ticket===generation&&sameOwner(who)&&surface===frame&&frame?.state!=='disposed'&&person?.userId===userId;
   root.PlayroomConversationSearchUI.menu({title:person.nickname,valid,back,profile:{label:'Профиль собеседника',run:showProfile},refresh:()=>void read(),search:{enabled:features.search===true,search:params=>C().service.call('chat-search',{userId,...params}),loadTarget:hit=>C().service.call('chat',{userId,after:(BigInt(hit.id)-1n).toString()}),commitJump:(result,hit)=>{if(!valid()||!interactive())return;features=result.features||features;messages=Cache().merge(cacheKey(),result.messages).rows;older=true;render();const list=content().querySelector('[data-chat-messages]');root.PlayroomConversationSearchUI.jump(list,String(hit.id),'message-');Cache().remember(cacheKey(),list);}}});
  }
  function showProfile(){
   if(!person||sending||!interactive())return;saveDraft();const back=captureReturn();root.PlayroomFriendProfileUI.show(person,{onBack:back,onChatReturn:back});
  }

  listenDocument('click',event=>{if(event.target.closest('[data-chat-menu]')){showMenu();return;}if(event.target.closest('[data-chat-person]')){showProfile();return;}if(event.target.closest('[data-chat-invite]')){const ticket=generation,button=event.target.closest('[data-chat-invite]');button.disabled=true;void root.PlayroomLobbyNetwork.inviteUser(person.userId,{nickname:person.nickname}).then(sent=>{if(ticket!==generation)return;const el=content()?.querySelector('[data-chat-error]');if(el&&sent){el.textContent=t('invited');void read();}}).catch(error=>{if(ticket===generation)report(error);}).finally(()=>{if(ticket===generation)button.disabled=false;});return;}if(event.target.closest('[data-chat-refresh]'))void read();if(event.target.closest('[data-chat-older]'))void read(messages[0]?.id);});
  listenDocument('click',async event=>{
   const groupJoin=event.target.closest('[data-chat-group-join]'),groupDecline=event.target.closest('[data-chat-group-decline]');if(!groupJoin&&!groupDecline)return;const button=groupJoin||groupDecline,ticket=generation;button.disabled=true;
   try{const result=await C().service.call(groupJoin?'group-accept':'group-decline',{inviteId:groupJoin?groupJoin.dataset.chatGroupJoin:groupDecline.dataset.chatGroupDecline});if(ticket!==generation)return;await read();if(groupJoin&&ticket===generation)root.PlayroomGroupUI.open(result,{onBack:captureReturn()});}catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation)button.disabled=false;}
  });
  listenDocument('click',async event=>{
   const join=event.target.closest('[data-chat-join]'),decline=event.target.closest('[data-chat-decline]'),add=event.target.closest('[data-chat-add]');if(!join&&!decline&&!add||add&&adding)return;if(add)adding=true;const ticket=generation,button=join||decline||add;button.disabled=true;
   try{if(join)await root.PlayroomLobbyNetwork.joinInvitation(join.dataset.chatJoin,{roomId:join.dataset.invitationRoom,ownerId:join.dataset.invitationOwner});else if(decline)await C().service.call('decline-invite',{inviteId:decline.dataset.chatDecline});else if(await root.PlayroomFriendProfileUI.addFriend(person))lastPresence=0;
    if(ticket===generation&&content())await read();
   }catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation&&content()){adding=false;button.disabled=false;render();}}
  });
  function replyMessage(message){if(sending||!interactive()||!features.replies)return;const form=content().querySelector('[data-chat-form]');root.PlayroomChatComponents.replyDraft(form,{...message,nickname:message.mine?'Вы':person.nickname});form.querySelector('[data-chat-editor]').focus();}
  async function reactMessage(message,emoji){
   if(sending||!interactive()||!features.reactions)return;const ticket=generation;sending=true;resizeComposer();
   try{const request=Cache().request(cacheKey()),result=await C().service.call('react-message',{userId:person.userId,targetId:message.id,emoji,enabled:!message.reactions?.some(r=>r.emoji===emoji&&r.mine),...request,known:[...new Set([...(request.known||[]),String(message.id)])]});if(ticket!==generation||!current()||!content())return;messages=Cache().merge(cacheKey(),result.messages,{fetched:true}).rows;render();report(null);}catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation){sending=false;resizeComposer();}}
  }
  async function sendMessage(body,{draft=false}={}){
   const form=content()?.querySelector('[data-chat-form]');if(!form||sending||!body||!current()||!interactive())return;
   const ticket=generation,userId=person.userId,who=owner,k=draftKey(),replyToId=form.dataset.replyToId||null;if(replyToId&&!features.replies){report({code:'setup'});return;}if(!retry||retry.body!==body||retry.replyToId!==replyToId)retry={body,replyToId,nonce:root.crypto.randomUUID()};sending=true;resizeComposer();
   try{const result=await C().service.call('send-message',{userId,...retry,...Cache().request(cacheKey())});if(!sameOwner(who))return;
    if(ticket!==generation){
     // The form can disappear before its ACK. Reconcile only this account's exact
     // conversation/payload, retaining any newer text or reply the user selected.
     const saved=replyDrafts.get(k);if(saved){if(draft&&saved.body.trim()===body&&(saved.reply?.id||null)===replyToId)saved.body='';if((saved.reply?.id||null)===replyToId)saved.reply=null;}
     if(current()&&person?.userId===userId&&content()){const live=content().querySelector('[data-chat-form]');if(draft&&live.elements.message.value.trim()===body&&(live.dataset.replyToId||null)===replyToId)live.elements.message.value='';if((live.dataset.replyToId||null)===replyToId)root.PlayroomChatComponents.replyDraft(live,null);saveDraft(live);resizeComposer();}return;
    }
    messages=Cache().merge(cacheKey(),result.messages,{fetched:true}).rows;if(draft&&form.elements.message.value.trim()===body){form.elements.message.value='';resizeComposer();}if((form.dataset.replyToId||null)===replyToId)root.PlayroomChatComponents.replyDraft(form,null);const saved=replyDrafts.get(draftKey());if(interactive()||!saved||saved.owner===draftOwner)replyDrafts.set(draftKey(),{body:form.elements.message.value,reply:form._replyMessage,owner:draftOwner});retry=null;render(true);report(null);}catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation){sending=false;resizeComposer();}}
  }
  listenDocument('click',event=>{const button=event.target.closest('[data-chat-reactions]');if(!button||sending)return;const ticket=generation;root.PlayroomChatComposer.open(button.form,button,emoji=>{if(ticket===generation)return sendMessage(emoji);});});
  listenDocument('click',event=>{const message=root.PlayroomChatComponents.messageTarget(event,content());if(!message||sending)return;const ticket=generation;const row=messages.find(m=>'message-'+m.id===message.dataset.entity);if(row)root.PlayroomChatComponents.actions(message,row,{canReply:features.replies===true,canReact:features.reactions===true,reply:m=>{if(ticket===generation)replyMessage(m);},react:(m,emoji)=>{if(ticket===generation)return reactMessage(m,emoji);}});});
  listenDocument('submit',event=>{const form=event.target.closest('[data-chat-form]');if(!form)return;event.preventDefault();void sendMessage(form.elements.message.value.trim(),{draft:true});});
  listenRoot('pagehide',event=>{if(!event.persisted){close();return;}saveDraft();if(current()&&content())Cache().remember(cacheKey(),content().querySelector('[data-chat-messages]'));pagePaused=true;clearTimeout(timer);timer=null;});
  listenRoot('pageshow',event=>{if(!event.persisted||!pagePaused)return;pagePaused=false;if(!current()||surface?.state==='disposed'){close();return;}resizeComposer();schedule();if(interactive())void read();});
  api=Object.freeze({show,close,captureReturn,active:()=>current()&&interactive(),currentUserId:()=>current()&&interactive()?person?.userId:null});
  return api;
 }
 const activeView=()=>[...views].reverse().find(view=>view.active());
 function show(friend,options){const view=createView();views.add(view);return view.show(friend,options);}
 function close(){for(const view of [...views])view.close();}
 root.PlayroomChatUI=Object.freeze({show,close,captureReturn:()=>activeView()?.captureReturn()||null,currentUserId:()=>activeView()?.currentUserId()||null});
})(globalThis);
