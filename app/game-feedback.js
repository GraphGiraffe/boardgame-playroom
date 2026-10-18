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
      if(snapshot)snapshot.revealedEntities=additions.flatMap(e=>e.reveal?.cards?.map(card=>'card-'+card.id)|| (e.reveal?.entity?[e.reveal.entity]:[]));
      const motionEvent=additions.findLast(e=>e.transfer)||additions.findLast(e=>e.reveal||e.presentation)||additions.at(-1);
      const routes=additions.filter(e=>e.presentation?.sequence);
      let rollSoundEvent=null;
      // A committed roll is a presentation step of its own, even when the same
      // command also reveals a result or moves a pawn. Never infer it from faces.
      if(mode!=='instant'&&root.PlayroomMotion?.play&&(snapshot?.action?.type==='roll'||additions.some(e=>e.kind==='roll'||e.presentation?.type==='roll'))){
        if(snapshot)snapshot.skipDice=true;
        rollSoundEvent=additions.find(e=>e.kind==='roll'||e.presentation?.type==='roll')||additions[0];
        const ids=cues.filter(c=>c.eventId===rollSoundEvent.id&&typeof c.id==='string').map(c=>c.id);
        const reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const duration=root.PlayroomGameFlow.presets[mode]?.duration||root.PlayroomGameFlow.presets.normal.duration;
        this.queue.push({id:rollSoundEvent.id,pack,ids,timing,diceRoll:true,duration:0,motion:()=>root.PlayroomMotion.play({action:{type:'roll'},diceOnly:true,reducedMotion:reduced},{duration:reduced?Math.min(180,duration):duration})});
      }
      this.routePoints??=new Map();this.routeStyles??=new Map();this.routeActors??=new Map();this.routeCounters??=new Map();this.routeTurns??=new Map();
      for(const event of routes){const r=event.presentation.sequence;this.routeActors.set(r.entity,r.player);if(!this.routePoints.has(r.entity))this.routePoints.set(r.entity,r.origin);}
      for(const event of additions){
        const ids=event===rollSoundEvent?[]:cues.filter(c=>c.eventId===event.id&&typeof c.id==='string').map(c=>c.id);
        const animated=event.speech||event.reveal||event.feedback?.kind==='skip';
        const route=event.presentation?.sequence;
        const effect=route?async()=>{
          const generation=this.generation;const pace=root.PlayroomGameFlow.timing({animationSpeed:mode},root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
          await root.PlayroomMotion?.play({...snapshot,action:{type:route.trigger},sequence:route,routeOnly:true},{duration:pace.duration,settle:pace.settle});
          if(generation!==this.generation)return;this.routePoints.set(route.entity,route.jump||route.steps.at(-1)||route.origin);this.positionRoutes();
        }:routes.length?null:event===motionEvent?motion:null;
        if(animated||effect||ids.length)this.queue.push({...event,pack,ids,timing,snapshot,motion:effect,duration:event.reveal?.kind==='dice'?timing.diceReveal:event.reveal?timing.reveal:event.feedback?.kind==='skip'?timing.skip:event.speech?timing.speech:0});
      }
      if(!this.active&&!defer)this.next();
    }
    next(){
      if(this.timer!==null){this.clock.clearTimeout(this.timer);this.timer=null;}
      this.active=this.queue.shift()||null;this.refresh();
      if(!this.active){this.restoreRoutes();for(const done of this.waiters.splice(0))done();return;}
      const item=this.active,generation=this.generation;if(item.ids.length)this.play(item.ids,item.pack);
      const valid=()=>generation===this.generation&&item===this.active;
      const finish=()=>{if(!valid())return;Promise.resolve(this.revealer?.finish()).then(async()=>{if(valid()&&item.reveal&&item.presentation?.sequence)await item.motion?.();if(valid())this.next();});};
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
      const panel=[...mount.querySelectorAll(`.player-panel[data-player-index="${speech.speaker}"]`)].find(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0;});
      bubble.hidden=!panel;bubble.style.visibility=panel?'':'hidden';if(!panel)return;
      const box=panel.getBoundingClientRect(),r=bubble.getBoundingClientRect(),doc=mount.ownerDocument,win=doc.defaultView;
      const left=Math.max(8,Math.min(box.right-r.width,win.innerWidth-r.width-8));
      const top=box.top-r.height-8>=8?box.top-r.height-8:Math.min(box.bottom+8,win.innerHeight-r.height-8);
      bubble.style.left=left+'px';bubble.style.top=Math.max(8,top)+'px';
    }
    positionRoutes(){
      const mount=this.mount();if(!mount)return;
      for(const [entity,point] of this.routePoints||[]){
        const el=[...mount.querySelectorAll('[data-entity]')].find(n=>n.dataset.entity===entity),anchor=[...mount.querySelectorAll('[data-motion-anchor]')].find(n=>n.dataset.motionAnchor===point.anchor);
        if(!el||!anchor)continue;
        if(!this.routeStyles.has(el))this.routeStyles.set(el,el.style.translate);
        el.style.translate=this.routeStyles.get(el);const a=anchor.getBoundingClientRect(),r=el.getBoundingClientRect();
        el.style.translate=`${a.x+a.width/2-r.x-r.width/2}px ${a.y+a.height/2-r.y-r.height/2}px`;
        for(const panel of mount.querySelectorAll('.player-panel[data-player-index]')){
          if(!this.routeTurns.has(panel))this.routeTurns.set(panel,{turn:panel.classList.contains('is-turn'),current:panel.getAttribute('aria-current')});
          const active=Number(panel.dataset.playerIndex)===this.routeActors.get(entity);panel.classList.toggle('is-turn',active);if(active)panel.setAttribute('aria-current','true');else panel.removeAttribute('aria-current');
          if(active&&point.label)for(const counter of panel.querySelectorAll('[data-motion-counter="position"]')){if(!this.routeCounters.has(counter))this.routeCounters.set(counter,counter.textContent);counter.textContent=point.label;}
        }
      }
    }
    restoreRoutes(){for(const [el,value] of this.routeStyles||[])el.style.translate=value;this.routeStyles?.clear();this.routePoints?.clear();this.routeActors?.clear();for(const [el,value] of this.routeCounters||[])el.textContent=value;this.routeCounters?.clear();for(const [panel,value] of this.routeTurns||[]){panel.classList.toggle('is-turn',value.turn);if(value.current===null)panel.removeAttribute('aria-current');else panel.setAttribute('aria-current',value.current);}this.routeTurns?.clear();}
    restorePending(){for(const {el,value,priority} of this.pendingRevealTargets||[])el.style.setProperty('visibility',value,priority);this.pendingRevealTargets=[];}
    refresh(){
      this.restorePending();
      const mount=this.mount();if(!mount)return;
      this.positionRoutes();
      const item=this.active;this.revealer?.show(item?.reveal,item?.pack);
      const pending=new Set(this.queue.flatMap(event=>event.reveal?.cards?.map(card=>'card-'+card.id)||[]));
      for(const el of mount.querySelectorAll('[data-entity]'))if(pending.has(el.dataset.entity)&&!el.closest('.hand-track,.mini-hand')){this.pendingRevealTargets.push({el,value:el.style.getPropertyValue('visibility'),priority:el.style.getPropertyPriority('visibility')});el.style.setProperty('visibility','hidden','important');}
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
    clear(){if(this.routePoints?.size||this.active?.diceRoll)root.PlayroomMotion?.cancel();this.restoreRoutes();this.restorePending();this.generation++;this.revealer?.clear();if(this.timer!==null)this.clock.clearTimeout(this.timer);this.timer=null;this.queue=[];this.active=null;this.refresh();this.layer?.remove();this.layer=null;this.bubble=null;this.bubbleEvent=null;for(const done of this.waiters.splice(0))done();}
    destroy(){this.clear();root.removeEventListener?.('resize',this.reposition);root.document?.removeEventListener('scroll',this.reposition,true);}
  }
  GameFeedback.times=Object.freeze(times);return GameFeedback;
});
