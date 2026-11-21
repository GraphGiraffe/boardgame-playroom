if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerTarget=api;})(typeof globalThis==='undefined'?this:globalThis,function(){
  'use strict';
  const position=(element,left,top)=>{
    if(globalThis.PlayroomDOM?.positionFixed)globalThis.PlayroomDOM.positionFixed(element,{left,top});
    else Object.assign(element.style,{left:left+'px',top:top+'px'});
  };
  class PlayerTarget {
    constructor({actions,commit,selected=()=>null,root=()=>document,icon=globalThis.TabletopUI?.icon||globalThis.PlayroomIcons?.icon}={}){
      if(typeof actions!=='function'||typeof commit!=='function')throw Error('PlayerTarget requires actions/commit');
      this.actions=actions;this.icon=icon;this.commit=commit;this.selected=selected;this.root=root;this.active=null;this.menu=null;this.dismissTimer=null;
      this.outside=event=>{
        if(this.active===null)return;
        const menu=this.menu;
        // A native dialog retargets backdrop input to itself; padding remains inside.
        if(menu?.matches('dialog.is-card-choice')&&event.target===menu&&(event.type==='pointerdown'||event.type==='click'&&event.detail>0)&&(event.button??0)===0){
          const box=menu.getBoundingClientRect(),x=event.clientX,y=event.clientY;
          if(x<box.left||x>box.right||y<box.top||y>box.bottom){
            event.preventDefault();event.stopImmediatePropagation();
            if(event.type==='pointerdown')globalThis.PlayroomDOM?.consumePointerReleaseClick?.({x,y},{document:this.document});
            this.cancel(true);return;
          }
        }
        if(this.menu?.classList.contains('is-panel-overlay')){if(!this.menu.contains(event.target)&&!event.target.closest?.(`[data-player-target="${this.active}"],[data-player-panel-target="${this.active}"]`))this.cancel();}else if(!event.target.closest?.('[data-player-target],[data-player-panel-target],.player-target-menu'))this.cancel();};
      this.keys=event=>{if(this.menu&&['ArrowDown','ArrowUp','Home','End'].includes(event.key)){const buttons=[...this.menu.querySelectorAll('button')],i=buttons.indexOf(this.document.activeElement);event.preventDefault();buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}if(event.key==='Escape'&&this.active!==null){event.preventDefault();this.cancel(true);}};
      const doc=this.root()?.ownerDocument||globalThis.document;this.document=doc;this.reposition=()=>{if(this.menu&&!this.menu.classList.contains('is-card-choice'))this.refresh();};doc?.defaultView?.addEventListener('resize',this.reposition);doc?.addEventListener('scroll',this.reposition,true);doc?.addEventListener('pointerdown',this.outside);doc?.addEventListener('click',this.outside,true);doc?.addEventListener('keydown',this.keys);
    }
    available(target){const selected=String(this.selected());return this.actions().filter(a=>a.target===target&&a.targetKind==='player'&&(!a.targetSource||String(a.card)===selected));}
    tap(target){
      if(this.active===target){this.cancel();return false;}
      this.cancel();
      const choices=this.available(target);
      if(!choices.length)return false;
      if(choices.length===1&&choices[0].targetSource&&!choices[0].disabled){this.commit(choices[0]);return true;}
      this.active=target;
      this.refresh(choices);
      if(this.menu?.classList.contains('is-panel-overlay')&&!choices.some(a=>a.disabled))this.dismissTimer=setTimeout(()=>this.cancel(),2000);
      return true;
    }
    refresh(actions){
      if(this.active===null)return;
      actions??=this.available(this.active);
      const host=this.root(),targets=Array.from(host?.querySelectorAll(`[data-player-target="${this.active}"]`)||[]);
      const trigger=targets.find(node=>node.getBoundingClientRect().width>0);
      if(!actions.length){this.cancel();return;}if(!host){return;}if(!trigger){this.cancel();return;}
      this.menu?.remove();for(const node of targets)node.setAttribute('aria-expanded','true');
      const cards=actions.every(a=>a.targetChoice==='card'&&Number.isSafeInteger(a.cardIndex));
      const menu=trigger.ownerDocument.createElement(cards?'dialog':'div');menu.className='player-target-menu';menu.setAttribute('role','menu');
      if(cards){menu.classList.add('is-card-choice');menu.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.player-target.5c7fb855375c"));}
      // The picker owns input. Copy only back artwork, never a disabled button
      // or SDK command attributes from an opponent's live hand miniature.
      const source=cards?trigger.closest('.player-panel')?.querySelector('.mini-hand .shared-card-back,.mini-hand .piece-back'):null;
      actions.forEach(action=>{
        const button=trigger.ownerDocument.createElement('button');
        button.type='button';button.disabled=!!action.disabled;button.className='scene-button';button.setAttribute('role','menuitem');
        if(cards){
          if(action.targetCardShape==='square')button.innerHTML=globalThis.PlayroomGameComponents.cardBack({shape:'square'});
          else{
            const back=trigger.ownerDocument.createElement('span');
            back.className='shared-card shared-card-back';
            back.dataset.sizeRole='card';
            back.setAttribute('aria-hidden','true');
            back.style.pointerEvents='none';
            if(source)for(const child of source.childNodes)back.appendChild(child.cloneNode(true));
            else{
              const {cardBack}=globalThis.PlayroomGameComponents;
              back.innerHTML=globalThis.TabletopUI?.assetArt?.('card-back',{},cardBack)||cardBack({});
            }
            button.appendChild(back);
          }
          button.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.player-target.fdc04aaf2460",{p0:String(action.cardIndex+1)}));
          button.dataset.cardIndex=action.cardIndex;
        }else button.textContent=action.targetPrompt||action.label||globalThis.PlayroomMessages.text("ui.player-target.50799cfd526a");
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          // An open picker can outlive its legal choices. Match against the
          // current provider, even when the renderer reuses option records.
          let identity;
          const current=this.available(this.active).find(a=>a===action||(identity??=JSON.stringify(action))===JSON.stringify(a));
          this.cancel();if(current&&!current.disabled)this.commit(current);
        });
        menu.appendChild(button);
      });
      trigger.ownerDocument.body.appendChild(menu);this.menu=menu;menu.querySelector('button')?.focus({preventScroll:true});
      if(cards){
        {
          const heading=trigger.ownerDocument.createElement('div');heading.className='card-choice-heading';
          heading.innerHTML=(trigger.querySelector('.avatar')?.outerHTML||'')+("<span>"+globalThis.PlayroomMessages.text("ui.player-target.b7639ddbebdd")+"</span>");
          const close=trigger.ownerDocument.createElement('button');close.type='button';close.className='icon-btn';close.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.player-target.8fbe9b75cbdf"));close.innerHTML=this.icon('close');close.addEventListener('click',e=>{e.stopPropagation();this.cancel(true);});heading.appendChild(close);menu.prepend(heading);
          menu.classList.add('card-choice-dialog');menu.setAttribute('role','dialog');menu.addEventListener('cancel',event=>{event.preventDefault();this.cancel(true);});menu.showModal();menu.querySelector('button')?.focus({preventScroll:true});return;
        }
      }
      const panel=trigger.closest('.player-panel');
      if(panel?.closest('.player-menu-overlay')){
        const anchor=panel.getBoundingClientRect(),style=trigger.ownerDocument.defaultView.getComputedStyle(panel);
        menu.classList.add('is-panel-overlay');
        Object.assign(menu.style,{width:anchor.width+'px',height:anchor.height+'px',borderRadius:style.borderRadius});
        position(menu,anchor.left,anchor.top);
        return;
      }
      const box=menu.getBoundingClientRect(),anchor=trigger.getBoundingClientRect(),win=trigger.ownerDocument.defaultView;

      position(menu,Math.max(8,Math.min(anchor.left,win.innerWidth-box.width-8)),Math.max(8,Math.min(anchor.bottom+4,win.innerHeight-box.height-8)));
    }
    cancel(focus=false){
      clearTimeout(this.dismissTimer);this.dismissTimer=null;
      const target=this.active;this.menu?.remove();this.menu=null;this.active=null;
      if(target===null)return;
      const targets=this.root()?.querySelectorAll(`[data-player-target="${target}"]`);
      for(const node of targets||[])node.setAttribute('aria-expanded','false');
      if(focus)targets?.[0]?.focus();
    }
    destroy(){this.cancel();this.document?.defaultView?.removeEventListener('resize',this.reposition);this.document?.removeEventListener('scroll',this.reposition,true);this.document?.removeEventListener('pointerdown',this.outside);this.document?.removeEventListener('click',this.outside,true);this.document?.removeEventListener('keydown',this.keys);}
  }
  return PlayerTarget;
});
