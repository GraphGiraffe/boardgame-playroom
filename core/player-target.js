(function(root,factory){
  'use strict';
  const API=factory();
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.PlayroomPlayerTarget=API;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // Target/confirmation is local UI state, not a gameplay command. The caller
  // always rechecks the current legal action before sending the second tap.
  class PlayerTarget {
    constructor({actions,commit,root=()=>document,clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},duration=2000}={}){
      if(typeof actions!=='function'||typeof commit!=='function'||typeof root!=='function')throw Error('PlayerTarget requires actions/commit/root');
      this.actions=actions;this.commit=commit;this.root=root;this.clock=clock;this.duration=duration;
      this.active=null;this.timer=null;
    }
    available(target){return this.actions().find(action=>action.target===target&&typeof action.type==='string')||null;}
    tap(target){
      const action=this.available(target);
      if(!action)return false;
      if(this.active?.target===target){
        this.cancel();this.commit(action);return true;
      }
      this.cancel();this.active={target,label:action.targetPrompt||action.label||'Подтвердить'};
      this.timer=this.clock.setTimeout(()=>this.cancel(),this.duration);
      this.refresh();return true;
    }
    refresh(){
      if(this.active&&!this.available(this.active.target)){this.cancel();return;}
      const root=this.root();if(!root)return;
      for(const node of root.querySelectorAll('.is-player-targeted'))node.classList.remove('is-player-targeted');
      for(const node of root.querySelectorAll('.player-target-confirm'))node.remove();
      const active=this.active;if(!active)return;
      if(!this.available(active.target)){this.cancel();return;}
      for(const node of root.querySelectorAll('[data-accuse-player]'))if(Number(node.dataset.accusePlayer)===active.target){
        node.classList.add('is-player-targeted');
      }
      const hand=[...root.querySelectorAll('.opponent-hand[data-accuse-player]')].find(el=>Number(el.dataset.accusePlayer)===active.target);
      if(hand){
        const button=root.ownerDocument.createElement('button');
        button.type='button';button.className='player-target-confirm';button.dataset.playerConfirm=String(active.target);
        button.textContent=active.label;button.setAttribute('aria-label',active.label+' — подтвердить действие');
        hand.appendChild(button);
      }
    }
    cancel(){
      if(this.timer!==null)this.clock.clearTimeout(this.timer);
      this.timer=null;this.active=null;
      const root=this.root();if(!root)return;
      for(const node of root.querySelectorAll('.is-player-targeted'))node.classList.remove('is-player-targeted');
      for(const node of root.querySelectorAll('.player-target-confirm'))node.remove();
    }
    destroy(){this.cancel();}
  }
  return PlayerTarget;
});
