/* Avatar selection shares its caller's connected surface lifetime. */
(function(root){
 'use strict';const t=key=>root.PlayroomMessages.text('avatars.'+key),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let current=null;
 function button(name='',avatar=null){return `<button type="button" class="profile-avatar-button" data-avatar-picker aria-label="${esc(t('choose'))}" title="${esc(t('choose'))}">${root.TabletopUI.avatar({name,avatar},0)}</button>`;}
 function open({name='',selected=null,onSelect=()=>{},isCurrent=()=>true}={}){
  if(current&&current.frame.state!=='disposed')return current.handle;
  const document=root.document,host=document.getElementById('modal-root'),dialogs=new root.PlayroomDOM.ModalController({host,background:document.getElementById('app')}),H=root.PlayroomGameScreen;
  const view={frame:null,disposed:false,cleanup:null,handle:null},valid=()=>{try{return !view.disposed&&isCurrent()!==false;}catch(_){return false;}},close=()=>dialogs.isActive(view.frame)&&dialogs.close(view.frame,{reason:'back'});
  const choose=(id,label,body)=>`<button type="button" class="avatar-option" data-avatar-option="${esc(id||'')}" aria-label="${esc(label)}" aria-pressed="${id===selected||!id&&!selected}">${body}</button>`;
  const markup=root.PlayroomAvatars.items().map(item=>choose(item.id,item.label,root.TabletopUI.avatar({name:item.label,avatar:item.id},0))).join('');
  view.frame=dialogs.open(`<div class="modal-backdrop avatar-picker-backdrop"><section class="modal avatar-picker-modal" data-ui-surface="panel" role="dialog" aria-modal="true" aria-label="${esc(t('choose'))}">${H.modalContent(H.modalHead(t('choose'))+`<div class="avatar-options">${markup}${choose(null,t('letter'),root.TabletopUI.avatar({name},0))}</div>`)}</section></div>`,{mode:'push',valid,meta:{owner:'avatar-picker',kind:'avatar-picker-modal',dismiss:close},onDispose:()=>{view.disposed=true;view.cleanup?.();if(current===view)current=null;}});
  if(!view.frame)return null;
  const element=view.frame.element,click=event=>{
   if(!element.contains(event.target)||!dialogs.isActive(view.frame))return;
   const choice=event.target.closest('[data-avatar-option]'),dismiss=event.target.closest('[data-command="close-modal"],[data-surface-dismiss]');if(!choice&&!dismiss&&event.target!==element)return;
   event.preventDefault();event.stopImmediatePropagation();
   if(!valid()){dialogs.invalidate();return;}
   if(choice){const value=choice.dataset.avatarOption||null;if(close()&&isCurrent()!==false)onSelect(value);}else close();
  };
  document.addEventListener('click',click,true);
  const dismiss=H.bindSurfaceDismiss(element,{isActive:()=>dialogs.isActive(view.frame),onDismiss:close});
  const observer=new root.MutationObserver(()=>{if(!valid())dialogs.invalidate();});observer.observe(host,{childList:true,subtree:true,attributes:true,attributeFilter:['data-surface-state','data-room-id']});
  view.cleanup=()=>{observer.disconnect();dismiss?.();document.removeEventListener('click',click,true);};
  view.handle=Object.freeze({frame:view.frame,close,dispose:()=>dialogs.dispose()});current=view;
  const focused=(selected&&element.querySelector('[aria-pressed="true"]'))||element.querySelector('[data-command="close-modal"]');
  focused?.focus({preventScroll:true});
  if(focused?.matches('[data-avatar-option]'))root.PlayroomDOM.revealInScrollport(element.querySelector('.modal-body'),focused);
  const cleanup=view.cleanup,stopFocus=root.PlayroomDOM.trackScrollportFocus(element.querySelector('.modal-body'),{isCurrent:()=>dialogs.isActive(view.frame)});view.cleanup=()=>{stopFocus();cleanup();};
  return view.handle;
 }
 root.PlayroomAvatarPicker=Object.freeze({button,open});
})(globalThis);
