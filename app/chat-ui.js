/* Private conversation presentation; access and deduplication are enforced by RPC. */
(function(root){
 'use strict';
 const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,C=()=>root.PlayroomCommunityUI,t=k=>root.PlayroomMessages.text('ui.community.'+k);
 const Cache=()=>root.PlayroomChatState;let initialized=false,openingThrough=null,firstRefresh=true;const cacheKey=()=>person?'dm:'+person.userId:null;
 let person=null,messages=[],timer=null,generation=0,sending=false,loading=false,adding=false,older=false,retry=null,lastPresence=0,returnToChatList=null,seenThrough=null,seenBusy=false;
 function content(){return document.querySelector('.chat-modal:has([data-chat-content])');}
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
   return divider+(unread?Cache().divider():'')+`<div class="chat-message ${m.mine?'mine':''} ${invited?'chat-invitation':root.PlayroomQuickReactions.valid(m.body)?'chat-emoji':''}" ${m.kind==='invitation'&&!m.mine&&m.state==='active'?'data-chat-active-invite':''} data-entity="message-${esc(m.id)}">${body}${time}</div>`;

  }).join('');
 }
 function render(bottom=false,preserve=false){
  const el=content();if(!el)return;header();const list=el.querySelector('[data-chat-messages]'),position=Cache().anchor(list);if(preserve)position.bottom=false;
  root.PlayroomDOM.ListController.update(list,messages.length?timelineMarkup():`<p class="muted">${t('empty-chat')}</p>`);
  if(!initialized&&(messages.length||Cache().get(cacheKey()).loaded)){Cache().initial(cacheKey(),list);initialized=true;}else Cache().restore(list,position);if(preserve)Cache().revealUnread(list);if(initialized)Cache().remember(cacheKey(),list);root.PlayroomChatComponents.navigation(list);
  requestAnimationFrame(markRead);

  const old=el.querySelector('[data-chat-older]');old.hidden=!older;old.disabled=loading;
  const add=el.querySelector('[data-chat-add]');add.hidden=!!person.accepted||!!(person.requested||person.id)&&!person.incoming;add.disabled=adding||!!(person.requested||person.id)&&!person.incoming;add.innerHTML=H().icon('addPlayer')+(person.requested||person.id?t(person.incoming?'accept':'request-sent'):'Добавить в друзья');
 }
 async function read(before=null){
  if(loading||!content())return;loading=true;const ticket=generation,friend=person.userId;
  try{const result=await C().service.call('chat',{userId:friend,...Cache().request(cacheKey(),before)});if(ticket!==generation||!content())return;
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
  if(seenBusy||!person||!content())return;const row=root.PlayroomChatComponents.seen(content().querySelector('[data-chat-messages]'),messages,'message-');if(!row||seenThrough&&BigInt(row.id)<=BigInt(seenThrough))return;
  const ticket=generation;seenBusy=true;Cache().read(cacheKey(),row.id);try{await C().service.call('read-messages',{userId:person.userId,through:row.id});if(ticket===generation){seenThrough=row.id;}}catch(_){}finally{if(ticket===generation)seenBusy=false;}
 }
 document.addEventListener('scroll',event=>{if(event.target.matches?.('[data-chat-messages]')){if(person)Cache().remember(cacheKey(),event.target);void markRead();}},true);
 root.addEventListener('playroom:chat-cache-updated',event=>{if(person&&content()&&event.detail.key===cacheKey()){messages=Cache().get(cacheKey()).rows;render();}});
 root.addEventListener('focus',()=>void markRead());
 function resizeComposer(){
  const form=content()?.querySelector('[data-chat-form]');if(!form)return;
  root.PlayroomChatComponents.resize(form,sending);content().querySelector('[data-chat-person]').disabled=sending;
 }
 document.addEventListener('input',event=>{if(event.target.matches('[data-chat-form] [data-chat-editor]'))resizeComposer();});
 root.addEventListener('resize',resizeComposer);
 function schedule(){clearTimeout(timer);timer=setTimeout(async()=>{if(!content())return;if(!document.hidden)await read();schedule();},5000);}
 function close(){if(person&&content())Cache().remember(cacheKey(),content().querySelector('[data-chat-messages]'));root.PlayroomReactionUI.close();generation++;seenThrough=null;seenBusy=false;clearTimeout(timer);timer=null;person=null;messages=[];retry=null;sending=false;loading=false;adding=false;}
 function show(friend,{onBack=B().captureModalReturn(),resume=null,messageId=null}={}){close();person=friend;initialized=false;firstRefresh=true;const cached=Cache().get(cacheKey());openingThrough=cached.loaded?Cache().boundary(cacheKey()):null;returnToChatList=onBack;older=resume?.older??cached.older;messages=resume?.messages||cached.rows;retry=resume?.retry||null;lastPresence=0;B().openModal(`${root.PlayroomChatComponents.header(`<button type="button" class="chat-person chat-header-person" data-chat-person aria-label="${t('friend-profile')}"></button>`,H().iconButton('data-chat-refresh',t('refresh'),'reset'))}<div class="social-content" data-chat-content><div class="chat-tools">${H().iconButton('data-chat-older',t('older'),'history')}</div><div class="chat-scroll-zone"><div class="social-list chat-messages" data-chat-messages tabindex="0" aria-label="${t('chats')}"></div><button type="button" class="chat-add-banner" data-chat-add hidden></button></div>${root.PlayroomChatComponents.composer('chat')}<p data-chat-error role="alert"></p></div>`,'community-modal chat-modal',{size:'large',onBack:()=>{close();onBack();}});root.dispatchEvent(new CustomEvent('playroom:chat-opened',{detail:{userId:friend.userId}}));header();const form=content().querySelector('[data-chat-form]');form.elements.message.value=resume?.draft||'';resizeComposer();render(!resume);if(resume)content().querySelector('[data-chat-messages]').scrollTop=resume.scroll;const ticket=generation;return read().then(async()=>{if(ticket!==generation||!content())return;const target=/^[1-9][0-9]*$/.test(messageId||'')?String(messageId):null;if(target&&!messages.some(m=>String(m.id)===target)){try{const result=await C().service.call('chat',{userId:friend.userId,after:String(BigInt(target)-1n)});if(ticket!==generation||!content())return;messages=Cache().merge(cacheKey(),result.messages).rows;older=true;}catch(error){if(ticket===generation)report(error);}}if(ticket!==generation||!content())return;render(!resume);if(resume&&!target)content().querySelector('[data-chat-messages]').scrollTop=resume.scroll;if(target){await new Promise(requestAnimationFrame);if(ticket!==generation||!content())return;const list=content().querySelector('[data-chat-messages]'),node=list.querySelector('[data-entity="message-'+target+'"]');if(node){const box=list.getBoundingClientRect(),rect=node.getBoundingClientRect();list.scrollTop+=rect.top-box.top-Math.max(12,(list.clientHeight-rect.height)/2);Cache().remember(cacheKey(),list);root.PlayroomChatComponents.navigation(list);void markRead();}}schedule();});}
 function captureReturn(){
  if(!person||!content())return null;
  const friend=person,onBack=returnToChatList,resume={messages:[...messages],older,retry,draft:content().querySelector('[data-chat-form]').elements.message.value,scroll:content().querySelector('[data-chat-messages]').scrollTop};
  return ()=>show(friend,{onBack,resume});
 }
 function showProfile(){
  if(!person||sending||!content())return;
  const friend=person,onBack=returnToChatList,resume={messages:[...messages],older,retry,draft:content().querySelector('[data-chat-form]').elements.message.value,scroll:content().querySelector('[data-chat-messages]').scrollTop};
  close();root.PlayroomFriendProfileUI.show(friend,{onBack:()=>show(friend,{onBack,resume})});
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-chat-person]')){showProfile();return;}if(event.target.closest('[data-chat-invite]')){const ticket=generation,button=event.target.closest('[data-chat-invite]');button.disabled=true;void root.PlayroomLobbyNetwork.inviteUser(person.userId,{nickname:person.nickname}).then(sent=>{if(ticket!==generation)return;const el=content()?.querySelector('[data-chat-error]');if(el&&sent){el.textContent=t('invited');void read();}}).catch(error=>{if(ticket===generation)report(error);}).finally(()=>{if(ticket===generation)button.disabled=false;});return;}if(event.target.closest('[data-chat-refresh]'))void read();if(event.target.closest('[data-chat-older]'))void read(messages[0]?.id);});
 document.addEventListener('click',async event=>{
  const groupJoin=event.target.closest('[data-chat-group-join]'),groupDecline=event.target.closest('[data-chat-group-decline]');if(!groupJoin&&!groupDecline)return;const button=groupJoin||groupDecline,ticket=generation;button.disabled=true;
  try{const result=await C().service.call(groupJoin?'group-accept':'group-decline',{inviteId:groupJoin?groupJoin.dataset.chatGroupJoin:groupDecline.dataset.chatGroupDecline});if(ticket!==generation)return;await read();if(groupJoin&&ticket===generation)root.PlayroomGroupUI.open(result,{onBack:captureReturn()});}catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation)button.disabled=false;}
 });
 document.addEventListener('click',async event=>{
  const join=event.target.closest('[data-chat-join]'),decline=event.target.closest('[data-chat-decline]'),add=event.target.closest('[data-chat-add]');if(!join&&!decline&&!add||add&&adding)return;if(add)adding=true;const ticket=generation,button=join||decline||add;button.disabled=true;
  try{if(join)await root.PlayroomLobbyNetwork.joinInvitation(join.dataset.chatJoin,{roomId:join.dataset.invitationRoom,ownerId:join.dataset.invitationOwner});else if(decline)await C().service.call('decline-invite',{inviteId:decline.dataset.chatDecline});else if(await root.PlayroomFriendProfileUI.addFriend(person))lastPresence=0;
   if(ticket===generation&&content())await read();
  }catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation&&content()){adding=false;button.disabled=false;render();}}
 });
 async function sendMessage(body,{draft=false}={}){
  const form=content()?.querySelector('[data-chat-form]');if(!form||sending||!body)return;
  const ticket=generation,userId=person.userId;if(!retry||retry.body!==body)retry={body,nonce:root.crypto.randomUUID()};sending=true;resizeComposer();
  try{const result=await C().service.call('send-message',{userId,...retry,...Cache().request(cacheKey())});if(ticket!==generation)return;messages=Cache().merge(cacheKey(),result.messages,{fetched:true}).rows;if(draft&&form.elements.message.value.trim()===body){form.elements.message.value='';resizeComposer();}retry=null;render(true);report(null);}catch(error){if(ticket===generation)report(error);}finally{if(ticket===generation){sending=false;resizeComposer();}}
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-chat-reactions]');if(!button||sending)return;const ticket=generation;root.PlayroomChatComposer.open(button.form,button,emoji=>{if(ticket===generation)return sendMessage(emoji);});});
 document.addEventListener('submit',event=>{const form=event.target.closest('[data-chat-form]');if(!form)return;event.preventDefault();void sendMessage(form.elements.message.value.trim(),{draft:true});});
 root.addEventListener('pagehide',close);
 root.PlayroomChatUI=Object.freeze({show,close,captureReturn,currentUserId:()=>content()?person?.userId:null});
})(globalThis);
