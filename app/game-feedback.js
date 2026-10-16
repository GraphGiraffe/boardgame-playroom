if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){
  'use strict';
  const API=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.PlayroomGameFeedback=API;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Speech is presentation of authorized public events. It never changes a turn.
  class GameFeedback {
    constructor({mount=()=>root.document?.querySelector('.table-shell'),play=()=>{},clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},duration=700}={}){
      this.mount=mount;this.play=play;this.clock=clock;this.duration=duration;
      this.generation=0;this.revealer=root.PlayroomActionReveal?new root.PlayroomActionReveal({mount}):null;
      this.cursor=0;this.notice=null;this.timer=null;this.queue=[];this.active=null;this.waiters=[];
    }
    start(events=[]){this.clear();this.cursor=events.at(-1)?.id||0;}
    accept(events=[],cues=[],pack,{silent=false,duration=this.duration}={}){
      const additions=events.filter(e=>Number.isSafeInteger(e?.id)&&e.id>this.cursor);
      if(!additions.length)return;
      this.cursor=additions.at(-1).id;
      if(silent)return;
      const fresh=cues.filter(c=>additions.some(e=>e.id===c.eventId)&&typeof c.id==='string');
      if(fresh.length)this.play(fresh.map(c=>c.id),pack);
      for(const event of additions)if(event.speech||event.reveal||event.feedback?.kind==='skip')this.queue.push({speech:event.speech,feedback:event.feedback,reveal:event.reveal,pack,duration:Math.max(event.reveal?1000:event.feedback?.kind==='skip'?700:220,Number(duration)||this.duration)});
      if(!this.active)this.next();
    }
    next(){
      if(this.timer!==null){this.clock.clearTimeout(this.timer);this.timer=null;}
      this.active=this.queue.shift()||null;this.refresh();
      if(!this.active){for(const done of this.waiters.splice(0))done();return;}
      const generation=this.generation;
      this.timer=this.clock.setTimeout(()=>{this.timer=null;Promise.resolve(this.revealer?.finish()).then(()=>{if(generation===this.generation)this.next();});},this.active.duration);
    }
    whenIdle(){return this.active||this.queue.length?new Promise(resolve=>this.waiters.push(resolve)):Promise.resolve();}
    refresh(){
      const mount=this.mount();if(!mount)return;
      this.revealer?.show(this.active?.reveal,this.active?.pack);
      mount.querySelectorAll('.game-notice,.game-speech').forEach(node=>node.remove());
      mount.querySelectorAll('.player-panel.is-addressed').forEach(node=>node.classList.remove('is-addressed'));
      const skipped=this.active?.feedback?.kind==='skip'?this.active.feedback.player:null;
      mount.querySelectorAll('.player-panel[data-player-index]').forEach(panel=>panel.classList.toggle('is-turn-skipped',Number(panel.dataset.playerIndex)===skipped));
      const speech=this.active?.speech;if(!speech)return;
      const panel=[...mount.querySelectorAll('.player-panel[data-player-index]')].find(node=>Number(node.dataset.playerIndex)===speech.speaker);
      if(!panel)return;
      if(Number.isInteger(speech.target))mount.querySelector(`.player-panel[data-player-index="${speech.target}"]`)?.classList.add('is-addressed');
      const bubble=mount.ownerDocument.createElement('span');bubble.className=root.TabletopUI.helpers.components.bubbleClass({kind:'game',result:speech.result});bubble.setAttribute('role','status');
      const message=speech.text||(globalThis.PlayroomMessages.text("ui.game-feedback.380e3dbd6730",{p0:String(speech.icon==='cards'?globalThis.PlayroomMessages.text("ui.game-feedback.515f651ab064"):globalThis.PlayroomMessages.text("ui.game-feedback.10a9e1f55f14")),p1:String(speech.count||'')}));bubble.setAttribute('aria-label',message);
      if(speech.icon==='cards'){const icon=mount.ownerDocument.createElement('span');icon.className='game-speech-icon';icon.innerHTML=root.TabletopUI?.icon?.('cards')||'▰';bubble.append(icon);const count=mount.ownerDocument.createElement('b');count.textContent=String(speech.count);bubble.append(count);}
      else if(speech.icon==='cross')bubble.textContent='✕';
      else bubble.textContent=speech.text;
      panel.append(bubble);
    }
    clear(){this.generation++;this.revealer?.clear();if(this.timer!==null)this.clock.clearTimeout(this.timer);this.timer=null;this.queue=[];this.active=null;for(const done of this.waiters.splice(0))done();this.refresh();}
    destroy(){this.clear();}
  }
  return GameFeedback;
});
