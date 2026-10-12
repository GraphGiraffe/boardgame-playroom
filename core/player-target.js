(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerTarget=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  class PlayerTarget {
    constructor({actions,commit,selected=()=>null,root=()=>document}={}){
      if(typeof actions!=='function'||typeof commit!=='function')throw Error('PlayerTarget requires actions/commit');
      this.actions=actions;this.commit=commit;this.selected=selected;this.root=root;this.active=null;this.menu=null;
      this.outside=event=>{if(!event.target.closest?.('[data-player-target],[data-player-panel-target],.player-target-menu'))this.cancel();};
      this.keys=event=>{if(this.menu&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){const buttons=[...this.menu.querySelectorAll('button')],i=buttons.indexOf(this.document.activeElement);event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Escape'&&this.active!==null){event.preventDefault();this.cancel(true);}};
      const doc=this.root()?.ownerDocument||globalThis.document;this.document=doc;doc?.addEventListener('click',this.outside);doc?.addEventListener('keydown',this.keys);
    }
    available(target){return this.actions().filter(a=>a.target===target&&a.targetKind==='player'&&(!a.targetSource||String(a.card)===String(this.selected())));}
    tap(target){if(this.active===target){this.cancel();return false;}this.cancel();if(!this.available(target).length)return false;const choices=this.available(target);if(choices.length===1&&choices[0].targetSource){this.commit(choices[0]);return true;}this.active=target;this.refresh();return true;}
    refresh(){
      if(this.active===null)return;
      const actions=this.available(this.active),host=this.root();
      const trigger=host?.querySelector(`[data-player-target="${this.active}"]`);
      if(!actions.length){this.cancel();return;}if(!host){return;}if(!trigger){this.cancel();return;}
      this.menu?.remove();for(const node of host.querySelectorAll(`[data-player-target="${this.active}"]`))node.setAttribute('aria-expanded','true');
      const menu=trigger.ownerDocument.createElement('div');menu.className='player-target-menu';menu.setAttribute('role','menu');
      const cards=actions.every(a=>a.targetChoice==='card'&&Number.isSafeInteger(a.cardIndex));if(cards){menu.classList.add('is-card-choice');menu.setAttribute('aria-label','Выберите закрытую карту');}
      actions.forEach(action=>{const button=trigger.ownerDocument.createElement('button');button.type='button';button.className='scene-button';button.setAttribute('role','menuitem');if(cards){button.innerHTML=globalThis.TabletopUI.back();button.setAttribute('aria-label',`Вытянуть карту ${action.cardIndex+1}`);button.dataset.cardIndex=action.cardIndex;}else button.textContent=action.targetPrompt||action.label||'Выполнить';button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const current=this.available(this.active).find(a=>JSON.stringify(a)===JSON.stringify(action));this.cancel();if(current)this.commit(current);});menu.appendChild(button);});
      const panel=trigger.closest?.('.player-panel');
      (panel||trigger.ownerDocument.body).appendChild(menu);this.menu=menu;menu.querySelector('button')?.focus();
      if(cards){trigger.ownerDocument.body.appendChild(menu);menu.style.position='fixed';}
      const box=menu.getBoundingClientRect(),anchor=trigger.getBoundingClientRect(),win=trigger.ownerDocument.defaultView;
      if(panel&&!cards){menu.style.position='absolute';menu.style.right='6px';menu.style.bottom='6px';return;}
      menu.style.left=Math.max(8,Math.min(anchor.left,win.innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,Math.min(anchor.bottom+4,win.innerHeight-box.height-8))+'px';
    }
    cancel(focus=false){const target=this.active;this.menu?.remove();this.menu=null;this.active=null;for(const node of this.root()?.querySelectorAll('[data-player-target]')||[])node.setAttribute('aria-expanded','false');if(focus&&target!==null)this.root()?.querySelector(`[data-player-target="${target}"]`)?.focus();}
    destroy(){this.cancel();this.document?.removeEventListener('click',this.outside);this.document?.removeEventListener('keydown',this.keys);}
  }
  return PlayerTarget;
});
