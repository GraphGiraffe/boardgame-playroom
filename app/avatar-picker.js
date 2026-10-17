(function(root){
 'use strict';const t=key=>root.PlayroomMessages.text('avatars.'+key),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function button(name='',avatar=null){return `<button type="button" class="profile-avatar-button" data-avatar-picker aria-label="${esc(t('choose'))}" title="${esc(t('choose'))}">${root.TabletopUI.avatar({name,avatar},0)}</button>`;}
 function open({name='',selected=null,onSelect}){
  if(root.document.querySelector('#avatar-picker-root'))return;
  const host=root.document.createElement('div');host.id='avatar-picker-root';root.document.body.append(host);const background=root.document.querySelector('#modal-root'),previous=root.document.activeElement;
  const modal=new root.PlayroomDOM.ModalController({host,background});
  const choose=(id,label,body)=>`<button type="button" class="avatar-option" data-avatar-option="${esc(id||'')}" aria-label="${esc(label)}" aria-pressed="${id===selected||!id&&!selected}">${body}</button>`;
  const markup=root.PlayroomAvatars.items().map(item=>choose(item.id,item.label,root.TabletopUI.avatar({name:item.label,avatar:item.id},0))).join('');
  modal.open(`<div class="modal-backdrop avatar-picker-backdrop"><section class="modal avatar-picker-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-picker-title"><header class="modal-head">${root.PlayroomGameScreen.iconButton('data-avatar-dismiss',t('close'),'close')}<h2 id="avatar-picker-title">${esc(t('choose'))}</h2></header><div class="avatar-options">${markup}${choose(null,t('letter'),root.TabletopUI.avatar({name},0))}</div></section></div>`);
  const close=()=>{host.removeEventListener('keydown',keyDown);modal.close();host.remove();previous?.focus?.();};
  const keyDown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}else if(event.key==='Tab'){const buttons=[...host.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&root.document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&root.document.activeElement===last){event.preventDefault();first.focus();}}};
  host.addEventListener('keydown',keyDown);host.addEventListener('click',event=>{event.stopPropagation();const choice=event.target.closest('[data-avatar-option]');if(choice){onSelect(choice.dataset.avatarOption||null);close();}else if(event.target.closest('[data-avatar-dismiss]')||event.target.classList.contains('avatar-picker-backdrop'))close();});host.querySelector(selected?'[aria-pressed="true"]':'[data-avatar-dismiss]')?.focus({preventScroll:true});
 }
 root.PlayroomAvatarPicker=Object.freeze({button,open});
})(globalThis);
