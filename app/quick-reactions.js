/* Shared accessible picker and transient avatar bubbles; no game state mutation. */
(function(root){
 'use strict';
 const model=root.PlayroomQuickReactions,active=new Map(),seen=new Map();let picker=null,frame=0;
 const context=()=>root.PlayroomNetworkLibrary?.reactionContext?.()||root.PlayroomAppBridge?.reactionContext?.();
 const shell=()=>document.querySelector('#app .table-shell');
 const anchor=player=>[...document.querySelectorAll(`#app .table-shell .player-panel[data-player-index="${player}"] .player-avatar-wrap`)].find(el=>{const r=el.getBoundingClientRect();return r.width&&r.height;});
 function closePicker(restore=false){const old=picker;picker=null;old?.node.remove();if(restore&&old?.anchor.isConnected)old.anchor.focus();}
 function position(node,target,above=true){const r=target.getBoundingClientRect(),b=node.getBoundingClientRect(),w=root.visualViewport?.width||innerWidth,h=root.visualViewport?.height||innerHeight;let left=8,right=w-8,top=8,bottom=h-8;for(let el=target.parentElement;el&&el!==document.body;el=el.parentElement){if((el.matches('.social-list,.lobby-roster-scroll,.modal-body')||/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight)&&el.clientHeight){const box=el.getBoundingClientRect();left=Math.max(left,box.left);right=Math.min(right,box.right);top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}}const x=Math.max(left,Math.min(right-b.width,r.left+r.width/2-b.width/2)),y=r.bottom<top?top:r.top>bottom?bottom-b.height:above&&r.top>top+b.height+8?r.top-b.height-8:r.bottom+8;node.style.left=Math.max(8,x)+'px';node.style.top=Math.max(top,Math.min(bottom-b.height,y))+'px';node.dataset.edge=r.bottom<top?'top':r.top>bottom?'bottom':'';}
 function avatarBubble(key,body,target,entry=null){if(!target()||document.hidden)return false;active.get(key)?.node.remove();const node=document.createElement('span');node.className='quick-reaction-bubble avatar-message-bubble'+(model.valid(body)?'':' room-message-bubble');node.setAttribute('role','status');if(entry?.scope==='team'){node.classList.add('is-team');node.style.setProperty('--room-team-color',root.PlayroomChatComponents.teamColor(entry.teamColor,entry.teamColorRole));}const text=document.createElement('span');text.innerHTML=root.PlayroomReactionView.html(body);node.append(text);document.body.append(node);active.set(key,{node,target,until:performance.now()+model.duration});position(node,target());animate();return true;}
 function listMessage(key,body){return avatarBubble('list:'+key,body,()=>[...document.querySelectorAll('[data-community-content] [data-chat-badge]')].find(el=>el.dataset.chatBadge===key));}

 function tick(){
  frame=0;const ctx=context(),host=shell();
  if(picker){if(!picker.anchor.isConnected||picker.key&&(!ctx?.allowed||ctx.sessionId!==picker.key)||document.hidden)closePicker();else position(picker.node,picker.anchor);}
  for(const [player,item] of active){if(item.target){const target=item.target();if(performance.now()>=item.until||document.hidden||!target?.isConnected){item.node.remove();active.delete(player);}else position(item.node,target);continue;}const target=anchor(player);if(performance.now()>=item.until||document.hidden||ctx?.sessionId!==item.sessionId||!host||host.dataset.reactionReplay==='true'){item.node.remove();active.delete(player);}else{item.node.hidden=!target||!!document.querySelector('#modal-root>*');if(target)position(item.node,target);}}
  if(picker||active.size)frame=requestAnimationFrame(tick);
 }
 function animate(){if(!frame)frame=requestAnimationFrame(tick);}
 function open(target,choose,{key=null}={}){
  if(picker?.anchor===target){closePicker(true);return;}closePicker();
  const node=document.createElement('div');node.className='quick-reaction-picker';node.setAttribute('role','dialog');node.setAttribute('aria-label','Быстрые реакции');
  for(const item of model.items){
   const button=document.createElement('button');button.type='button';button.className='icon-btn';button.innerHTML=root.PlayroomReactionView.icon(item.emoji);button.title=item.label+' '+item.shortcode;button.setAttribute('aria-label',button.title);button.dataset.quickEmoji=item.emoji;
   button.dataset.tooltip=item.shortcode;button.dataset.tooltipHoldOnly='true';
   button.onclick=()=>{closePicker(true);void choose(item.emoji);};node.append(button);
  }
  document.body.append(node);picker={node,anchor:target,key};position(node,target);node.firstElementChild.focus();animate();
 }
 function bubble(event,{text=false}={}){
  const ctx=context();if(document.hidden||ctx?.sessionId!==event.sessionId||!Number.isInteger(event.player)||event.player<0||typeof event.id!=='string'||event.id.length>64||shell()?.dataset.reactionReplay==='true'||!anchor(event.player)||seen.has(event.id))return;
  seen.set(event.id,true);if(seen.size>256)seen.delete(seen.keys().next().value);
  active.get(event.player)?.node.remove();const node=document.createElement('span');node.className='quick-reaction-bubble'+(text?' room-message-bubble':'');node.setAttribute('role','status');node.dataset.reactionPlayer=event.player;
  if(text){const preview=document.createElement('span');preview.innerHTML=root.PlayroomReactionView.html(event.body.length>180?event.body.slice(0,180)+'…':event.body);node.append(preview);node.setAttribute('aria-label',preview.textContent);}
  else{node.innerHTML=root.PlayroomReactionView.icon(event.emoji);node.setAttribute('aria-label',model.find(event.emoji)?.label||event.emoji);}
  if(event.scope==='team'){node.classList.add('is-team');node.style.setProperty('--room-team-color',root.PlayroomChatComponents.teamColor(event.teamColor,event.teamColorRole));}
  document.body.append(node);active.set(event.player,{node,sessionId:event.sessionId,until:performance.now()+model.duration});animate();
 }
 function receive(event){if(model.valid(event?.emoji))bubble(event);}
 function message(entry){const lobby=document.querySelector('.lobby-shell'),modal=document.querySelector('#modal-root .modal');if(lobby&&(!modal||modal.contains(lobby))){avatarBubble('lobby:'+entry.authorId,entry.body,()=>[...document.querySelectorAll('.lobby-shell [data-participant-id]')].find(el=>el.dataset.participantId===entry.authorId)?.querySelector('.lobby-avatar-wrap'),entry);return;}if(entry.kind==='reaction')bubble({...entry,emoji:entry.body});else if(typeof entry.body==='string')bubble(entry,{text:true});}
 async function send(emoji,key){const ctx=context();if(!ctx?.allowed||ctx.sessionId!==key)return;try{await ctx.send(emoji);}catch(_){root.PlayroomAppBridge.toast('Реакция не отправлена. Попробуйте чуть позже.');}}
 function sync(){const ctx=context(),host=shell();for(const el of host?.querySelectorAll('.player-avatar-wrap')||[]){const mine=ctx?.allowed&&Number(el.closest('[data-player-index]').dataset.playerIndex)===ctx.viewer&&host.dataset.reactionViewer!=='-1';if(mine){el.dataset.quickReaction='true';el.setAttribute('role','button');el.setAttribute('tabindex','0');el.setAttribute('aria-label','Быстрая реакция');}else if(el.dataset.quickReaction){delete el.dataset.quickReaction;if(!el.hasAttribute('data-decision-player')){el.removeAttribute('role');el.removeAttribute('tabindex');el.removeAttribute('aria-label');}}}}
 document.addEventListener('click',event=>{const target=event.target.closest('[data-quick-reaction]');if(!target)return;const ctx=context();if(!ctx?.allowed)return;event.preventDefault();event.stopImmediatePropagation();open(target,emoji=>send(emoji,ctx.sessionId),{key:ctx.sessionId});},true);
 document.addEventListener('pointerdown',event=>{if(picker&&!picker.node.contains(event.target)&&!picker.anchor.contains(event.target))closePicker();},true);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&picker){event.preventDefault();event.stopImmediatePropagation();closePicker(true);}else if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-quick-reaction]')){event.preventDefault();event.target.click();}else if(picker&&event.key==='Tab'){const buttons=[...picker.node.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);event.preventDefault();buttons[(i+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}},true);
 new MutationObserver(sync).observe(document.getElementById('app'),{childList:true,subtree:true});
 root.addEventListener('playroom:quick-reaction',event=>receive(event.detail));
 document.addEventListener('visibilitychange',()=>{if(document.hidden){closePicker();for(const item of active.values())item.node.remove();active.clear();}else sync();});
 root.PlayroomReactionUI=Object.freeze({open,receive,message,listMessage,sync,close:closePicker});
})(globalThis);
