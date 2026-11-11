/* Non-modal game overlay. It never owns a session, transport or scene layout. */
(function(root){
 'use strict';
 let panel=null,onClose=null,isCurrent=null,ownerSurface=null,returnFocus=null,lastPanelFocus=null,drag=null,frame=0,suppressClickUntil=0,gestureCleanup=null;
 const sizes={portrait:.56,landscape:.42},landscape=()=>root.matchMedia('(orientation: landscape)').matches;
 const axis=()=>landscape()?'landscape':'portrait';
 const viewport=()=>landscape()?(root.visualViewport?.width||innerWidth):(root.visualViewport?.height||innerHeight);
 function fit(){if(!panel)return;const side=landscape(),extent=viewport();panel.style.setProperty('--game-chat-size',Math.min(extent*.9,Math.max(side?280:240,extent*sizes[axis()]))+'px');const handle=panel.querySelector('[data-game-chat-resize]');handle.setAttribute('aria-orientation',side?'vertical':'horizontal');handle.setAttribute('aria-valuenow',String(Math.round(sizes[axis()]*100)));}
 function dismiss(){if(!panel)return;const old=panel;panel=null;onClose=null;isCurrent=null;ownerSurface=null;lastPanelFocus=null;cancelDrag();gestureCleanup?.();gestureCleanup=null;root.PlayroomDOM.finishVisualEntry(old);old.remove();document.body.classList.remove('game-chat-open');}
 function close({restoreFocus=true,animate=true,feedback=restoreFocus}={}){if(!panel)return;const old=panel,callback=onClose,focus=returnFocus;panel=null;onClose=null;isCurrent=null;ownerSurface=null;lastPanelFocus=null;cancelDrag();document.body.classList.remove('game-chat-open');try{callback?.();}finally{root.PlayroomDOM.retireVisual(old,{kind:'drawer',animate});gestureCleanup?.();gestureCleanup=null;}if(feedback)root.PlayroomUIFeedback?.back();if(!restoreFocus)return;if(focus?.isConnected)focus.focus({preventScroll:true});else document.querySelector('.game-chat-launcher')?.focus({preventScroll:true});}
 function open(markup,{onClose:callback,isCurrent:ownerCheck,owner=null}={}){
  dismiss();returnFocus=document.activeElement;onClose=callback;isCurrent=ownerCheck;ownerSurface=owner;
  panel=document.createElement('section');panel.className='game-chat-panel chat-modal room-chat-modal';panel.dataset.uiSurface='panel';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Чат комнаты');panel.setAttribute('aria-modal','false');
  panel.innerHTML='<button type="button" data-game-chat-resize role="slider" aria-label="Размер панели чата. Стрелки — изменить, Escape — закрыть" aria-valuemin="30" aria-valuemax="90"><span></span></button>'+root.PlayroomGameScreen.modalContent(markup,{className:'room-chat-modal',surface:'panel'});
  const entry=root.PlayroomDOM.prepareVisualEntry(panel);document.body.append(panel);document.body.classList.add('game-chat-open');fit();sync();entry.start();
  gestureCleanup=root.PlayroomGameScreen.bindPanelGesture(panel,{isActive:interactive,onDismiss:close});
  panel.addEventListener('focusin',event=>{lastPanelFocus=event.target;});
  panel.addEventListener('click',event=>{if(event.target.closest('[data-command="close-modal"]')){event.preventDefault();event.stopPropagation();close();}});
  panel.querySelector('[data-command="close-modal"]')?.focus({preventScroll:true});
  return panel;
 }
 function modalActive(){const active=document.querySelector('#modal-root>[data-surface-state="active"],#modal-root>:not([data-surface-state])');return !!active&&active!==ownerSurface;}
 function interactive(){return !!panel&&!panel.inert&&!modalActive();}
 function cancelDrag(){if(drag?.target.hasPointerCapture?.(drag.id))drag.target.releasePointerCapture(drag.id);drag=null;}
 function sync(){
  frame=0;if(!panel)return;
  if((isCurrent&&!isCurrent())||!ownerSurface?.isConnected&&!document.querySelector('#app .network-game')){close({restoreFocus:false,animate:false});return;}
  const wasSuspended=panel.dataset.gameChatState==='suspended',suspended=modalActive();if(suspended)cancelDrag();
  const ownerLayer=ownerSurface?.isConnected?Number(root.getComputedStyle(ownerSurface).zIndex):NaN;panel.style.zIndex=!suspended&&Number.isFinite(ownerLayer)?String(ownerLayer+1):'';
  panel.inert=suspended;panel.dataset.gameChatState=suspended?'suspended':'active';
  if(suspended)panel.setAttribute('aria-hidden','true');else panel.removeAttribute('aria-hidden');
  // A modal restores its lobby owner, while the independent drawer owns the
  // visible editor. Resume that editor when focus fell back behind the drawer.
  const focused=document.activeElement;
  if(wasSuspended&&!suspended&&lastPanelFocus?.isConnected&&panel.contains(lastPanelFocus)&&(focused===document.body||!focused?.isConnected||ownerSurface?.contains(focused)||focused.closest?.('[inert],[data-ui-surface-exit],[data-surface-state=disposed]')))lastPanelFocus.focus({preventScroll:true});
 }

 new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(sync);}).observe(document.getElementById('app'),{childList:true,subtree:true});
 new MutationObserver(sync).observe(document.getElementById('modal-root'),{childList:true});
 document.addEventListener('pointerdown',event=>{
  const handle=event.target.closest('[data-game-chat-resize]'),launcher=null;if((!handle&&!launcher)||event.button!==0||modalActive()||(handle&&!interactive()))return;
  const side=landscape(),target=handle||launcher;drag={id:event.pointerId,target,side,launcher:!!launcher,start:side?event.clientX:event.clientY,size:panel?(side?panel.offsetWidth:panel.offsetHeight):0,moved:false};target.setPointerCapture(event.pointerId);
 });
 document.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const delta=drag.start-(drag.side?event.clientX:event.clientY);if(Math.abs(delta)>6)drag.moved=true;if(drag.launcher)return;if(panel){event.preventDefault();sizes[axis()]=Math.max(.3,Math.min(.9,(drag.size+delta)/viewport()));fit();}},{passive:false});
 document.addEventListener('pointerup',event=>{
  if(!drag||drag.id!==event.pointerId)return;const d=drag;drag=null;const delta=d.start-(d.side?event.clientX:event.clientY);
  if(d.launcher&&delta>24){suppressClickUntil=Date.now()+500;event.preventDefault();root.PlayroomRoomChatUI.show();}
  else if(!d.launcher&&delta<-90&&d.size+delta<viewport()*.3)close();
 });
 document.addEventListener('click',event=>{if(Date.now()<suppressClickUntil&&event.target.closest('.game-chat-launcher')){event.preventDefault();event.stopImmediatePropagation();}},true);
 document.addEventListener('pointercancel',()=>{drag=null;});
 document.addEventListener('keydown',event=>{
  if(!interactive())return;if(event.key==='Escape'&&!document.querySelector('.quick-reaction-picker')){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(!event.target.matches('[data-game-chat-resize]'))return;
  const step={ArrowUp:.1,ArrowLeft:.1,ArrowDown:-.1,ArrowRight:-.1}[event.key];
  if(step!==undefined||['Home','End'].includes(event.key)){event.preventDefault();sizes[axis()]=event.key==='Home'?.3:event.key==='End'?.9:Math.max(.3,Math.min(.9,sizes[axis()]+step));fit();}
 });
 root.addEventListener('resize',()=>{drag=null;fit();});root.visualViewport?.addEventListener('resize',fit);
 root.PlayroomGameChatPanel=Object.freeze({open,close,dismiss,get opened(){return !!panel;},get interactive(){return interactive();}});
})(globalThis);
