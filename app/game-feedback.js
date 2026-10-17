if(typeof module==='object'&&module.exports&&typeof require==='function')require('../core/messages.js');
(function(root,factory){const API=factory(root);if(typeof module==='object'&&module.exports)module.exports=API;root.PlayroomGameFeedback=API;})(globalThis,function(root){
  'use strict';
  const times=(root.PlayroomGameFlow||(typeof require==='function'?require('../core/game-flow.js'):null)).effectTimes;
  class GameFeedback {
    constructor({mount=()=>root.document?.querySelector('.table-shell'),play=()=>{},clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},duration=700}={}){
      this.mount=mount;this.play=play;this.clock=clock;this.duration=duration;this.cursor=0;this.notice=null;this.timer=null;this.queue=[];this.active=null;this.waiters=[];this.generation=0;this.layer=null;this.bubble=null;this.bubbleEvent=null;
      this.revealer=root.PlayroomActionReveal?new root.PlayroomActionReveal({mount}):null;
      this.reposition=()=>this.position();root.addEventListener?.('resize',this.reposition);root.document?.addEventListener('scroll',this.reposition,true);
    }
    start(events=[]){this.clear();this.cursor=events.at(-1)?.id||0;}
    accept(events=[],cues=[],pack,{silent=false,mode='normal',snapshot=null,motion=null,defer=false}={}){
      const additions=events.filter(e=>Number.isSafeInteger(e?.id)&&e.id>this.cursor);if(!additions.length)return;
      this.cursor=additions.at(-1).id;if(silent)return;
      const timing=times[mode]||times.normal;
      if(snapshot)snapshot.revealedEntities=additions.filter(e=>e.reveal?.entity).map(e=>e.reveal.entity);
      const motionEvent=additions.findLast(e=>e.transfer||e.reveal||e.presentation)||additions.at(-1);
      for(const event of additions){
        const ids=cues.filter(c=>c.eventId===event.id&&typeof c.id==='string').map(c=>c.id);
        const animated=event.speech||event.reveal||event.feedback?.kind==='skip';
        const effect=event===motionEvent?motion:null;
        if(animated||effect||ids.length)this.queue.push({...event,pack,ids,timing,snapshot,motion:effect,duration:event.reveal?.kind==='dice'?timing.diceReveal:event.reveal?timing.reveal:event.feedback?.kind==='skip'?timing.skip:event.speech?timing.speech:0});
      }
      if(!this.active&&!defer)this.next();
    }
    next(){
      if(this.timer!==null){this.clock.clearTimeout(this.timer);this.timer=null;}
      this.active=this.queue.shift()||null;this.refresh();
      if(!this.active){for(const done of this.waiters.splice(0))done();return;}
      const item=this.active,generation=this.generation;if(item.ids.length)this.play(item.ids,item.pack);
      const valid=()=>generation===this.generation&&item===this.active;
      const finish=()=>{if(!valid())return;Promise.resolve(this.revealer?.finish()).then(()=>{if(valid())this.next();});};
      const hold=()=>{if(!valid())return;if(item.duration)this.timer=this.clock.setTimeout(()=>{this.timer=null;
        // Questions/answers remain readable before the associated transfer.
        if(item.speech&&item.motion)Promise.resolve(item.motion()).then(finish,finish);else finish();
      },item.duration);else finish();};
      if(item.reveal)Promise.resolve(this.revealer?.enter(item.snapshot,item.timing)).then(hold,hold);
      else if(item.motion&&!item.speech)Promise.resolve(item.motion()).then(hold,hold);
      else if(!item.duration)finish();else hold();
    }
    whenIdle(){return this.active||this.queue.length?new Promise(resolve=>this.waiters.push(resolve)):Promise.resolve();}
    position(){
      const bubble=this.bubble,mount=this.mount(),speech=this.active?.speech;if(!bubble||!mount||!speech)return;
      const panel=mount.querySelector(`.player-panel[data-player-index="${speech.speaker}"]`);if(!panel)return;
      const box=panel.getBoundingClientRect(),r=bubble.getBoundingClientRect(),doc=mount.ownerDocument,win=doc.defaultView;
      const left=Math.max(8,Math.min(box.right-r.width,win.innerWidth-r.width-8));
      const top=box.top-r.height-8>=8?box.top-r.height-8:Math.min(box.bottom+8,win.innerHeight-r.height-8);
      bubble.style.left=left+'px';bubble.style.top=Math.max(8,top)+'px';
    }
    refresh(){
      const mount=this.mount();if(!mount)return;
      const item=this.active;this.revealer?.show(item?.reveal,item?.pack);
      const skipped=item?.feedback?.kind==='skip'?item.feedback.player:null;
      mount.querySelectorAll('.player-panel[data-player-index]').forEach(panel=>{
        panel.style.setProperty('--feedback-skip-ms',(item?.timing.skip||450)+'ms');
        panel.classList.toggle('is-turn-skipped',Number(panel.dataset.playerIndex)===skipped);
        panel.classList.toggle('is-addressed',Number(panel.dataset.playerIndex)===item?.speech?.target);
      });
      const speech=item?.speech;
      if(!speech){this.bubble?.remove();this.bubble=null;this.bubbleEvent=null;return;}
      if(!this.layer?.isConnected){this.layer=mount.ownerDocument.createElement('div');this.layer.className='game-feedback-layer';mount.ownerDocument.body.append(this.layer);}
      if(this.bubbleEvent!==item.id||!this.bubble?.isConnected){
        this.bubble?.remove();const bubble=mount.ownerDocument.createElement('span');this.bubble=bubble;this.bubbleEvent=item.id;
        bubble.className=root.TabletopUI.helpers.components.bubbleClass({kind:'game',result:speech.result});bubble.setAttribute('role','status');bubble.dataset.feedbackEvent=String(item.id);
        const message=speech.text||root.PlayroomMessages.text('ui.game-feedback.380e3dbd6730',{p0:String(speech.icon==='cards'?root.PlayroomMessages.text('ui.game-feedback.515f651ab064'):root.PlayroomMessages.text('ui.game-feedback.10a9e1f55f14')),p1:String(speech.count||'')});bubble.setAttribute('aria-label',message);
        if(speech.icon==='cards'){const icon=mount.ownerDocument.createElement('span');icon.className='game-speech-icon';icon.innerHTML=root.TabletopUI.icon('cards');const count=mount.ownerDocument.createElement('b');count.textContent=String(speech.count);bubble.append(icon,count);}
        else bubble.textContent=speech.icon==='cross'?'✕':speech.text;
        this.layer.append(bubble);
      }
      this.position();
    }
    clear(){this.generation++;this.revealer?.clear();if(this.timer!==null)this.clock.clearTimeout(this.timer);this.timer=null;this.queue=[];this.active=null;this.refresh();this.layer?.remove();this.layer=null;this.bubble=null;this.bubbleEvent=null;for(const done of this.waiters.splice(0))done();}
    destroy(){this.clear();root.removeEventListener?.('resize',this.reposition);root.document?.removeEventListener('scroll',this.reposition,true);}
  }
  GameFeedback.times=Object.freeze(times);return GameFeedback;
});
