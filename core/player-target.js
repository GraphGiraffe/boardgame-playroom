if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerTarget=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  class PlayerTarget {
    constructor({actions,commit,selected=()=>null,root=()=>document}={}){
      if(typeof actions!=='function'||typeof commit!=='function')throw Error('PlayerTarget requires actions/commit');
      this.actions=actions;this.commit=commit;this.selected=selected;this.root=root;this.active=null;this.menu=null;
      this.outside=event=>{if(!event.target.closest?.('[data-player-target],[data-player-panel-target],.player-target-menu'))this.cancel();};
      this.keys=event=>{if(this.menu&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){const buttons=[...this.menu.querySelectorAll('button')],i=buttons.indexOf(this.document.activeElement);event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Escape'&&this.active!==null){event.preventDefault();this.cancel(true);}};
      const doc=this.root()?.ownerDocument||globalThis.document;this.document=doc;this.reposition=()=>{if(this.menu&&!this.menu.classList.contains('is-card-choice'))this.refresh();};doc?.defaultView?.addEventListener('resize',this.reposition);doc?.addEventListener('scroll',this.reposition,true);doc?.addEventListener('click',this.outside);doc?.addEventListener('keydown',this.keys);
    }
    available(target){return this.actions().filter(a=>a.target===target&&a.targetKind==='player'&&(!a.targetSource||String(a.card)===String(this.selected())));}
    tap(target){if(this.active===target){this.cancel();return false;}this.cancel();if(!this.available(target).length)return false;const choices=this.available(target);if(choices.length===1&&choices[0].targetSource){this.commit(choices[0]);return true;}this.active=target;this.refresh();return true;}
    refresh(){
      if(this.active===null)return;
      const actions=this.available(this.active),host=this.root();
      const trigger=[...host?.querySelectorAll(`[data-player-target="${this.active}"]`)||[]].find(node=>node.getBoundingClientRect().width>0);
      if(!actions.length){this.cancel();return;}if(!host){return;}if(!trigger){this.cancel();return;}
      this.menu?.remove();for(const node of host.querySelectorAll(`[data-player-target="${this.active}"]`))node.setAttribute('aria-expanded','true');
      const cards=actions.every(a=>a.targetChoice==='card'&&Number.isSafeInteger(a.cardIndex));
      const menu=trigger.ownerDocument.createElement(cards?'dialog':'div');menu.className='player-target-menu';menu.setAttribute('role','menu');
      if(cards){menu.classList.add('is-card-choice');menu.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.player-target.5c7fb855375c"));}
      actions.forEach(action=>{const button=trigger.ownerDocument.createElement('button');button.type='button';button.className='scene-button';button.setAttribute('role','menuitem');if(cards){button.innerHTML=globalThis.TabletopUI.back();button.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.player-target.fdc04aaf2460",{p0:String(action.cardIndex+1)}));button.dataset.cardIndex=action.cardIndex;}else button.textContent=action.targetPrompt||action.label||globalThis.PlayroomMessages.text("ui.player-target.50799cfd526a");button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const current=this.available(this.active).find(a=>JSON.stringify(a)===JSON.stringify(action));this.cancel();if(current)this.commit(current);});menu.appendChild(button);});
      trigger.ownerDocument.body.appendChild(menu);this.menu=menu;menu.querySelector('button')?.focus({preventScroll:true});
      if(cards){
        {
          const heading=trigger.ownerDocument.createElement('div');heading.className='card-choice-heading';
          heading.innerHTML=(trigger.querySelector('.avatar')?.outerHTML||'')+("<span>"+globalThis.PlayroomMessages.text("ui.player-target.b7639ddbebdd")+"</span>");
          const close=trigger.ownerDocument.createElement('button');close.type='button';close.className='icon-btn';close.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.player-target.8fbe9b75cbdf"));close.innerHTML=globalThis.TabletopUI.icon('close');close.addEventListener('click',e=>{e.stopPropagation();this.cancel(true);});heading.appendChild(close);menu.prepend(heading);
          menu.classList.add('card-choice-dialog');menu.setAttribute('role','dialog');menu.addEventListener('cancel',event=>{event.preventDefault();this.cancel(true);});menu.showModal();menu.querySelector('button')?.focus({preventScroll:true});return;
        }
      }
      const box=menu.getBoundingClientRect(),anchor=trigger.getBoundingClientRect(),win=trigger.ownerDocument.defaultView;

      menu.style.left=Math.max(8,Math.min(anchor.left,win.innerWidth-box.width-8))+'px';menu.style.top=Math.max(8,Math.min(anchor.bottom+4,win.innerHeight-box.height-8))+'px';
    }
    cancel(focus=false){const target=this.active;this.menu?.remove();this.menu=null;this.active=null;for(const node of this.root()?.querySelectorAll('[data-player-target]')||[])node.setAttribute('aria-expanded','false');if(focus&&target!==null)this.root()?.querySelector(`[data-player-target="${target}"]`)?.focus();}
    destroy(){this.cancel();this.document?.defaultView?.removeEventListener('resize',this.reposition);this.document?.removeEventListener('scroll',this.reposition,true);this.document?.removeEventListener('click',this.outside);this.document?.removeEventListener('keydown',this.keys);}
  }
  return PlayerTarget;
});
