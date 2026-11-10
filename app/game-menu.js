/* Game-menu presentation shares the connected surface registry, never the session. */
(function(root){
 'use strict';
 let layer=null,menuFrame=null,dialogs=null,gestureCleanup=null,sequence=0;
 const H=()=>root.PlayroomGameScreen;
 const registry=()=>dialogs||(dialogs=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')}));
 const active=()=>!!menuFrame&&menuFrame.state==='active'&&registry().isActive(menuFrame);

 function close({feedback=true}={}){const closed=active()?registry().close(menuFrame,{reason:'dismiss'}):false;if(closed&&feedback)root.PlayroomUIFeedback?.back();return closed;}
 function open(actions){
  const controller=registry();if(menuFrame?.state==='suspended'||controller.activeFrame()&&controller.activeFrame()!==menuFrame)return false;
  close({feedback:false});const app=document.getElementById('app'),shell=app?.querySelector('.table-shell');if(!shell)return false;
  root.PlayroomGameChatPanel?.close({restoreFocus:false});
  const identity=shell.dataset.layoutIdentity,context=root.PlayroomNetworkLibrary?.inviteContext?.(),room=context?.room?{id:context.room.id,participantId:context.participantId,ownerId:context.room.ownerId,phase:context.room.phase}:null;
  const localSessionId=shell.matches('.network-game')?null:root.PlayroomAppBridge.saveLibrary.currentId();
  const valid=()=>{
   const current=root.PlayroomNetworkLibrary?.inviteContext?.();
   return document.querySelector('#app .table-shell')===shell&&shell.dataset.layoutIdentity===identity&&(!localSessionId||root.PlayroomAppBridge.saveLibrary.currentId()===localSessionId)&&(!room||current?.room?.id===room.id&&current.participantId===room.participantId&&current.room.ownerId===room.ownerId&&current.room.phase===room.phase);
  };
  const inHistory=!!shell.querySelector('#replay-range');
  const lobby=actions.find(a=>a.name==='room'),history=actions.find(a=>a.attrs.includes('data-command="history"')),rules=actions.find(a=>a.attrs.includes('data-command="rules"')),settings=actions.find(a=>a.name==='settings'),stop=actions.find(a=>a.name==='stop'),pause=actions.find(a=>a.attrs.includes('data-command="pause"')),home=actions.find(a=>a.attrs.includes('data-command="home"')),chat=actions.find(a=>a.name==='chat');
  const pauseRow=pause?.disabled&&inHistory&&!pause.reason?{...pause,reason:'Недоступно при просмотре истории'}:pause;
  const main=[lobby&&{...lobby,label:'Лобби',detail:'Партия сохранится'},chat&&{...chat,label:'Чат комнаты'},pauseRow,history,rules&&{...rules,label:'Правила'},settings&&{...settings,label:'Настройки'},home&&{...home,detail:'Партия сохранится'},stop&&{...stop,label:'Остановить партию',detail:'Сохранить и вернуться в лобби'}].filter(Boolean);
  const remaining=actions.filter(a=>!main.some(item=>item.attrs===a.attrs)&&a.name!=='chat'&&!a.attrs.includes('data-friends-open'));
  const childAction=attrs=>/data-command=["'](?:rules|settings|preferences|stop-local-match)["']/.test(attrs)||/data-net-action=["']stop-match["']/.test(attrs);
  const row=a=>`<button type="button" class="game-menu-v021-row ${a.name==='stop'?'is-danger':''}" data-game-menu-action ${a.network?'data-quick-shortcut':''} ${childAction(a.attrs)?'data-surface-action="child"':''} ${a.attrs} ${a.disabled?'disabled':''}><span><strong>${H().esc(a.label)}</strong>${a.reason||a.detail?`<small>${H().esc(a.reason||a.detail)}</small>`:''}</span>${H().icon(a.name)}</button>`;
  const title='game-menu-title-'+(++sequence);
  menuFrame=controller.open(`<div class="modal-backdrop game-menu-layer"><section class="modal game-menu-panel" data-ui-surface="panel" data-dialog-size="compact" role="dialog" aria-modal="true" aria-labelledby="${title}"><button type="button" class="game-menu-v021-handle" data-game-menu-close aria-label="Закрыть меню партии"><span></span></button>${H().modalHead('Меню партии',{symbol:'settings',dismissAttrs:'data-game-menu-close'}).replace('<h2 ',`<h2 id="${title}" `)}<div class="game-menu-v021-body"><nav aria-label="Действия партии">${[...main,...remaining].map(row).join('')}</nav></div><button type="button" class="game-menu-v021-return" data-game-menu-close>${inHistory?'Вернуться к истории':'Вернуться к игре'}</button></section></div>`,{
   mode:'push',valid,meta:{owner:'game-menu',dismiss:close},
   onDispose:(_reason,frame)=>{if(menuFrame===frame){gestureCleanup?.();gestureCleanup=null;layer=null;menuFrame=null;}}
  });
  if(!menuFrame)return false;
  root.PlayroomUIFeedback?.emit('menu.open');
  layer=menuFrame.element;layer.querySelector('.modal-head [data-game-menu-close]').focus({preventScroll:true});
  gestureCleanup=H().bindPanelGesture(layer.querySelector('.game-menu-panel'),{isActive:active,onDismiss:close,handle:layer.querySelector('.game-menu-v021-handle')});
  layer.addEventListener('click',event=>{
   if(!active())return;
   if(event.target===layer||event.target.closest('[data-game-menu-close]')){event.stopPropagation();close();return;}
   const action=event.target.closest('[data-game-menu-action]:not(:disabled)');if(!action)return;
   // Forms and confirmations retain this exact parent. Navigation retires it.
   const child=action.dataset.surfaceAction==='child';
   if(!child){
    const chat=action.hasAttribute('data-room-chat-open');
    close({feedback:false});
    // The retiring menu is inert; its original click cannot open a drawer later.
    if(chat){event.stopPropagation();root.PlayroomRoomChatUI?.show();}
   }
  },true);
  return true;
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-game-menu]'))open(H().gameMenuActions());},true);
 // Native tab order includes summaries; only wrap the active menu's boundaries.
 function focusTargets(){
  return [...layer.querySelectorAll('button,summary,a[href],input,select,textarea,[tabindex]')].filter(el=>{
   if(el.disabled||el.tabIndex<0||el.closest('[hidden],[inert]')||!el.getClientRects().length||getComputedStyle(el).visibility!=='visible')return false;
   for(let parent=el.parentElement;parent&&parent!==layer;parent=parent.parentElement){if(parent.matches('details:not([open])')&&!parent.querySelector(':scope>summary')?.contains(el))return false;}
   return true;
  });
 }
 document.addEventListener('keydown',event=>{
  if(!active())return;
  if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
  if(event.key!=='Tab')return;
  const items=focusTargets(),first=items[0],last=items.at(-1),current=document.activeElement;
  if(first&&(!items.includes(current)||event.shiftKey&&current===first||!event.shiftKey&&current===last)){event.preventDefault();(event.shiftKey?last:first).focus({preventScroll:true});}
 },true);
 new MutationObserver(()=>{if(menuFrame)registry().invalidate();}).observe(document.getElementById('app'),{childList:true,subtree:true});
 root.PlayroomGameMenu=Object.freeze({open,close,get opened(){return active();}});
})(globalThis);
