if(typeof module==='object'&&module.exports&&typeof require==='function')require('../core/messages.js');
(function(root,factory){const API=factory(root);if(typeof module==='object'&&module.exports)module.exports=API;root.PlayroomGameFeedback=API;})(globalThis,function(root){
  'use strict';
  const times=(root.PlayroomGameFlow||(typeof require==='function'?require('../core/game-flow.js'):null)).effectTimes;
  const Scheduler=root.PlayroomPresentationScheduler||(typeof require==='function'?require('../presentation/scheduler.js'):null);
  const entityKey=ref=>(root.PlayroomGameComponents||(typeof require==='function'?require('../core/game-components.js'):null)).entityKey(ref);
  const Plans=root.PlayroomEventPlan||(typeof require==='function'?require('../presentation/event-plan.js'):null);
  const participantEffects=new Set(['skip','damage','capture','sunk','penalty']);
  class GameFeedback {
    constructor({motion=root.PlayroomMotion,mount=()=>root.document?.querySelector('.table-shell'),play=()=>{},prepareAudio=null,clock=Scheduler.clock,executor=new Scheduler(clock),duration=700,fieldChanged=null}={}){
      this.fieldChanged=fieldChanged;this.motion=motion;this.mount=mount;this.play=play;this.prepareAudio=prepareAudio;this.player=executor.track('feedback');this.planId=0;this.duration=duration;this.cursor=0;this.notice=null;this.queue=[];this.active=null;this.waiters=[];this.generation=0;this.layer=null;this.bubble=null;this.bubbleEvent=null;
      this.revealer=root.PlayroomActionReveal?new root.PlayroomActionReveal({mount}):null;
      this.reposition=()=>{for(const entry of this.departureNodes?.values()||[]){entry.animation?.cancel();entry.layer.remove();entry.played=true;}this.motion?.releaseStage?.();if(this.stagedBoundary){this.movedBoundaries??=new WeakSet();this.movedBoundaries.add(this.stagedBoundary);}this.position();};root.addEventListener?.('resize',this.reposition);root.document?.addEventListener('scroll',this.reposition,true);
    }
    start(events=[]){this.clear();this.cursor=events.at(-1)?.id||0;}
    accept(events=[],cues=[],pack,{silent=false,mode='normal',snapshot=null,motion=null,defer=false,initialScene=null,finalScene=null}={}){
      const additions=Plans.transferScenes(events.filter(e=>Number.isSafeInteger(e?.id)&&e.id>this.cursor),initialScene,finalScene);if(!additions.length)return;
      this.cursor=additions.at(-1).id;if(silent)return;
      // Preserve the displayed turn across the entire committed effect queue.
      if(this.presentationTurn==null){const stage=this.mount()?.querySelector('.app-game-layout');if(stage?.dataset.turnPlayer!=null)this.presentationTurn=Number(stage.dataset.turnPlayer);}
      // The result dialog owns terminal audio; never play it during the final action.
      const finishIds=new Set(events.filter(event=>event.kind==='finish').map(event=>event.id));
      cues=cues.filter(cue=>!finishIds.has(cue.eventId));
      const timing=times[mode]||times.normal;
      if(!this.queue.length&&!this.active)this.initialScene=initialScene;this.finalScene=finalScene;
      snapshot?.prepareDepartures?.(finalScene);
      snapshot?.prepareTransfers?.(additions.flatMap(event=>event.transfer?[event.transfer]:[]),{back:additions.some(event=>event.speech&&event.reveal?.kind==='card')});
      const boundary={initial:initialScene,final:finalScene,snapshot};
      // Only authorized public board objects can outlive their committed removal.
      const boardZones=new Set(initialScene?.zones?.filter(zone=>zone.kind==='board').map(zone=>zone.id));
      const finalRefs=new Set(finalScene?.objects?.map(object=>entityKey(object.ref)));
      const departures=finalScene&&!finalScene.plan?initialScene?.objects?.filter(object=>boardZones.has(object.zone)&&!finalRefs.has(entityKey(object.ref))).map(object=>entityKey(object.ref))||[]:[];
      if(snapshot)snapshot.revealedEntities=additions.flatMap(e=>e.reveal?.cards?.map(card=>entityKey({namespace:'card',id:card.id}))|| (e.reveal?.entity?[entityKey(e.reveal.entity)]:[]));
      const motionEvent=additions.findLast(e=>e.transfer)||additions.findLast(e=>e.reveal||e.presentation)||additions.at(-1);
      const transfers=additions.filter(e=>e.transfer);
      const routes=additions.filter(e=>e.presentation?.sequence);
      let rollSoundEvent=null;
      // A committed roll is a presentation step of its own, even when the same
      // command also reveals a result or moves a pawn. Never infer it from faces.
      if(mode!=='instant'&&this.motion?.play&&(snapshot?.action?.type==='roll'||additions.some(e=>e.kind==='roll'||e.presentation?.type==='roll'))){
        if(snapshot)snapshot.skipDice=true;
        rollSoundEvent=additions.find(e=>e.kind==='roll'||e.presentation?.type==='roll')||additions[0];
        const ids=cues.filter(c=>c.eventId===rollSoundEvent.id&&typeof c.id==='string').map(c=>c.id);
        const reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const duration=root.PlayroomGameFlow.presets[mode]?.duration||root.PlayroomGameFlow.presets.normal.duration;
        this.queue.push({id:rollSoundEvent.id,pack,ids,timing,diceRoll:true,boundary,duration:0,motion:context=>this.motion.play({action:{type:'roll'},diceOnly:true,reducedMotion:reduced},{duration:reduced?Math.min(180,duration):duration,context})});
      }
      this.routePoints??=new Map();this.routeStyles??=new Map();this.routeActors??=new Map();this.routeCounters??=new Map();this.routeTurns??=new Map();
      for(const event of routes){const r=event.presentation.sequence;this.routeActors.set(entityKey(r.entity),r.player);if(!this.routePoints.has(entityKey(r.entity)))this.routePoints.set(entityKey(r.entity),r.origin);}
      let eventInitial=initialScene;
      const checkpoints=additions.some(event=>event.scene);
      for(const event of additions){
        // A penalty/response in the same commit can have another actor. Reveal
        // origins belong to the individual event, never to the last transfer.
        const actor=Number.isInteger(event.player)?event.player:snapshot?.actor;
        const eventSnapshot=event.reveal&&snapshot&&Number.isInteger(actor)&&actor!==snapshot.actor?{...snapshot,actor,origin:snapshot.hands?.get(actor)||null,playedFrom:null}:snapshot;
        const eventBoundary=checkpoints?{initial:eventInitial,final:event.scene||(event===additions.at(-1)?finalScene:eventInitial),snapshot}:boundary;
        if(event.scene)eventInitial=event.scene;
        const suppressQuestion=mode==='instant'&&event.speech&&!event.speech.result&&additions.some(reply=>reply.id>event.id&&reply.speech?.result&&reply.revision===event.revision);
        const ids=event===rollSoundEvent||suppressQuestion?[]:cues.filter(c=>c.eventId===event.id&&typeof c.id==='string').map(c=>c.id);
        const animated=event.speech||event.reveal||participantEffects.has(event.feedback?.kind);
        const route=event.presentation?.sequence;
        const effect=route?async(context)=>{
          const generation=this.generation;const pace=root.PlayroomGameFlow.timing({animationSpeed:mode},root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
          await this.motion?.play({...snapshot,action:{type:route.trigger},sequence:route,routeOnly:true},{duration:pace.duration,settle:pace.settle,context});
          if(generation!==this.generation)return;this.routePoints.set(entityKey(route.entity),route.jump||route.steps.at(-1)||route.origin);this.positionRoutes();
        }:routes.length?null:transfers.length>1&&event.transfer&&motion?context=>motion(context,{snapshot:this.active.snapshot,draws:[event.transfer],transferOnly:true}):event===motionEvent?motion:null;
        if(animated||effect||ids.length||event.scene)this.queue.push({...event,pack,ids,timing,mode,boundary:eventBoundary,snapshot:eventSnapshot,transferIndex:transfers.indexOf(event),departures:event===motionEvent?departures:[],motion:effect,duration:event.reveal?.kind==='dice'?timing.diceReveal:event.speech&&event.reveal?.kind==='card'?timing.speech:event.reveal?timing.reveal:participantEffects.has(event.feedback?.kind)?timing.skip:event.speech?(['take','pass'].includes(event.feedback?.kind)?timing.skip:timing.speech):0});
      }
      if(!this.active&&!this.queue.length)this.presentationTurn=null;
      if(!this.active&&!defer)this.next();
    }
    next(){
      if(this.active)return;
      const batch=[...this.queue];
      if(!batch.length){this.settled();return;}
      const generation=this.generation;
      // Own the queue while the first group waits for native audio readiness.
      this.active=batch[0];
      const plan=Plans.compile({id:'feedback:'+ ++this.planId,items:batch,initial:this.initialScene,final:this.finalScene});
      const diagnosticStart=root.PlayroomDiagnostics?.begin()??null;
      const played=this.player.play(plan,{
        initial:index=>{this.presentedScene=plan.scenes[index];this.paintMetrics();},
        group:(_,group,context)=>{const paint=()=>{if(generation===this.generation){this.presentedScene=plan.scenes[group.scene];this.paintMetrics();}};if(this.prepareAudio&&group.cues.some(cue=>cue.stage==='prepare'&&batch[cue.index]?.ids?.length))return Promise.resolve(this.prepareAudio(context)).then(paint);paint();},
        effect:(cue,context)=>this.presentCue({kind:cue.stage,item:batch[cue.index],last:cue.index===batch.length-1},generation,context),
        cancel:()=>{if(generation===this.generation)this.clear();},
        final:(index,status)=>{
          if(generation!==this.generation)return;
          if(status==='skipped'||status==='failed'){this.clear();return;}
          this.presentedScene=plan.scenes[index];this.paintMetrics();
          if(this.queue.length){this.active=null;this.next();}
          else this.settled();
        }
      });
      if(diagnosticStart!==null)Promise.resolve(played).then(result=>root.PlayroomDiagnostics?.end('presentation',diagnosticStart,{status:result?.status||'complete',items:batch.length,queued:this.queue.length,requestedMs:batch.reduce((total,item)=>total+(item.duration||0),0)}),()=>root.PlayroomDiagnostics?.end('presentation',diagnosticStart,{status:'failed'}));
    }
    async presentCue({kind,item,last},generation,context){
      const valid=()=>generation===this.generation;
      if(kind==='sound')return this.play(item.ids,item.pack,context);
      if(kind==='prepare'){
        if(this.request&&item.reveal){const request=this.request;this.request=null;await request.finish(context);if(!valid())return;}
        const previousField=this.fieldScene,previousDisplay=this.displayScene;
        if(item.reveal?.kind==='cards'&&previousDisplay)item.snapshot=this.motion?.capture?.({viewer:previousDisplay.viewer})||item.snapshot;
        if(item.transfer&&item.scene&&item.transferIndex>0){
          item.snapshot=this.motion?.capture?.({viewer:item.snapshot?.viewer})||item.snapshot;item.boundary.snapshot=item.snapshot;
        }
        this.active=this.queue.shift();this.effectContext=context;
        if((item.reveal&&!item.scene)||item.diceRoll)this.releaseField(item);
        else if(this.fieldScene!==previousField||this.displayScene!==previousDisplay)this.fieldChanged?.();
        this.refresh();
        if(item.speech&&item.reveal?.kind==='card'&&this.motion?.beginRequest){
          this.request=this.motion.beginRequest(item.snapshot,item.speech.speaker,item.reveal.card,item.timing.flip||0,context);
          if(this.bubble)this.bubble.style.visibility='hidden';
          await this.request.ready;if(valid())this.position();
        }
      }else if(kind==='enter'){
        if(item.reveal&&!(item.speech&&item.reveal.kind==='card'))await this.revealer?.enter(item.snapshot,item.timing,context);
        if(!item.reveal||item.speech)await this.presentCue({kind:'hold',item,last},generation,context);
      }else if(kind==='hold'){
        // Reading time and the visible reply animation are concurrent gates.
        // CSS timings may exceed the selected speed's minimum reading time.
        if(item.speech){
          const animations=(this.bubble?.getAnimations?.({subtree:true})||[]).filter(animation=>Number.isFinite(animation.effect.getTiming().iterations));
          for(const animation of animations)context?.animation?.(animation);
          await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
          if(!valid())return;
        }
        // Movement and participant feedback occupy the same interval.
        if(!item.speech&&!item.reveal)await Promise.all([this.move(item,context),this.playDepartures(item,context)]);
      }else{
        if(item.speech&&item.motion)await this.move(item,context);
        if(!valid())return;
        await this.revealer?.finish(context);
        if(valid()&&item.reveal&&item.presentation?.sequence)await this.move(item,context);
        if(valid()&&item.scene)this.releaseField(item);
        if(valid()&&this.request&&last){const request=this.request;this.request=null;await request.finish(context);}
      }
    }
    settled(){
      // A released board already shows its terminal pose. Rebuilding it while
      // the command transition is still active would replay transient faces.
      const boundary=(this.active||this.queue[0])?.boundary;
      const heldField=boundary?.liveSurfaceMotion?this.displayScene:this.fieldScene||this.displayScene;
      this.motion?.releaseStage?.();this.stagedBoundary=null;this.movedBoundaries=new WeakSet();
      this.active=null;this.initialScene=null;this.finalScene=null;this.presentationTurn=null;this.clearDepartures();this.restoreRoutes();this.restoreMetrics();this.presentedScene=null;if(heldField)this.fieldChanged?.();this.refresh();this.positionTurn();
      for(const done of this.waiters.splice(0))done();
    }
    whenIdle(){return this.active||this.queue.length||this.request?new Promise(resolve=>this.waiters.push(resolve)):Promise.resolve();}
    positionTurn(){
      const mount=this.mount(),stage=mount?.querySelector('.app-game-layout');if(!stage)return;
      const held=this.presentationTurn!=null&&(this.active||this.queue.length||this.request);
      if(held)stage.dataset.presentationTurn=String(this.presentationTurn);else delete stage.dataset.presentationTurn;
      const turn=Number(held?this.presentationTurn:stage.dataset.turnPlayer);
      for(const panel of stage.querySelectorAll('.player-panel[data-player-index]')){
        const active=panel.dataset.turnPrimary!=='false'&&Number(panel.dataset.playerIndex)===turn;
        panel.classList.toggle('is-turn',active);if(active)panel.setAttribute('aria-current','true');else panel.removeAttribute('aria-current');
      }
    }
    position(){
      const bubble=this.bubble,mount=this.mount(),speech=this.active?.speech;if(!bubble||!mount||!speech)return;
      const panel=[...mount.querySelectorAll(`.player-panel[data-player-index="${speech.speaker}"]`)].find(node=>{const r=node.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0;});
      bubble.hidden=!panel;bubble.style.visibility=panel?'':'hidden';if(!panel)return;
      const box=(panel.querySelector('.player-avatar-wrap .avatar,.avatar')||panel).getBoundingClientRect(),r=bubble.getBoundingClientRect(),doc=mount.ownerDocument,win=doc.defaultView;
      const left=Math.max(8,Math.min(box.left+box.width/2-r.width/2,win.innerWidth-r.width-8));
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
          const active=panel.dataset.turnPrimary!=='false'&&Number(panel.dataset.playerIndex)===this.routeActors.get(entity);panel.classList.toggle('is-turn',active);if(active)panel.setAttribute('aria-current','true');else panel.removeAttribute('aria-current');
          if(active&&point.label)for(const counter of panel.querySelectorAll('[data-motion-counter="position"]')){if(!this.routeCounters.has(counter))this.routeCounters.set(counter,counter.textContent);counter.textContent=point.label;}
        }
      }
    }
    restoreRoutes(){for(const [el,value] of this.routeStyles||[])el.style.translate=value;this.routeStyles?.clear();this.routePoints?.clear();this.routeActors?.clear();for(const [el,value] of this.routeCounters||[])el.textContent=value;this.routeCounters?.clear();for(const [panel,value] of this.routeTurns||[]){panel.classList.toggle('is-turn',value.turn);if(value.current===null)panel.removeAttribute('aria-current');else panel.setAttribute('aria-current',value.current);}this.routeTurns?.clear();}
    clearDepartures(){
      for(const entry of this.departureNodes?.values()||[]){entry.animation?.cancel();entry.layer.remove();}
      this.departureNodes?.clear();
    }
    paintDepartures(){
      const mount=this.mount();if(!mount||this.initialFieldScene)return;
      this.departureNodes??=new Map();
      const boundary=this.active?.boundary||this.queue[0]?.boundary;
      if(boundary?.fieldMotion)return;
      for(const item of [this.active,...this.queue].filter(item=>item&&item.boundary===boundary))for(const ref of item.departures||[]){
        const key=item.id+':'+ref;if(this.departureNodes.has(key))continue;
        const captured=item.snapshot?.entities?.get(ref);
        if(!captured?.public||captured.hand||!captured.departureClone||!captured.rect)continue;
        const layer=mount.ownerDocument.createElement('div'),piece=captured.departureClone.cloneNode(true),box=captured.rect;
        layer.className='playroom-motion-layer';layer.setAttribute('aria-hidden','true');
        const flight=mount.ownerDocument.createElement('div');flight.className='playroom-motion-flight';flight.dataset.motionKind='departure';
        Object.assign(flight.style,{width:box.width+'px',height:box.height+'px',transform:`translate3d(${box.x}px,${box.y}px,0)`});
        flight.append(piece);layer.append(flight);mount.ownerDocument.body.append(layer);
        this.departureNodes.set(key,{layer,flight,played:false});
      }
    }
    async playDepartures(item,context){
      const timing=root.PlayroomGameFlow.timing({animationSpeed:item.mode},root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
      await Promise.all((item.departures||[]).map(async ref=>{
        const entry=this.departureNodes?.get(item.id+':'+ref);if(!entry||entry.played)return;entry.played=true;
        const remove=()=>entry.layer.remove();context.cleanup(remove);
        if(!timing.duration){remove();return;}
        const animation=entry.flight.animate([{opacity:1,offset:0},{opacity:1,offset:.5},{opacity:0,offset:1}],{duration:timing.duration,fill:'forwards'});
        entry.animation=animation;context.animation(animation);
        await animation.finished.catch(()=>{});remove();
      }));
    }
    restorePending(){for(const {el,value,priority} of this.pendingRevealTargets||[])el.style.setProperty('visibility',value,priority);this.pendingRevealTargets=[];}
    // The final DOM remains available as a motion destination. Semantic counters
    // show the plan's current scene, including after a network redraw.
    paintMetrics(){
      const mount=this.mount(),scene=this.presentedScene,H=root.TabletopUI?.helpers;
      if(!mount||!scene?.players||!H)return;
      this.metricNodes??=new Map();
      const paint=(node,html)=>{
        if(!node)return;
        if(!this.metricNodes.has(node))this.metricNodes.set(node,node.cloneNode(true));
        const template=node.ownerDocument.createElement('template');template.innerHTML=html;
        const replacement=template.content.firstElementChild;
        for(const name of node.getAttributeNames())if(!replacement.hasAttribute(name))node.removeAttribute(name);
        for(const attr of replacement.attributes)node.setAttribute(attr.name,attr.value);
        if(node.innerHTML!==replacement.innerHTML)node.innerHTML=replacement.innerHTML;
      };
      for(const panel of mount.querySelectorAll('.player-panel[data-player-index]')){
        const person=scene.players.find(p=>p.player===Number(panel.dataset.playerIndex));if(!person)continue;
        for(const node of panel.querySelectorAll('[data-score-id]')){
          const metric=person.metrics.find(m=>m.id===node.dataset.scoreId);
          if(metric&&['points','wins','pieces'].includes(metric.kind))paint(node,H.scoreBadge(metric));
        }
        paint(panel.querySelector('[data-finish-award]'),`<span data-finish-award>${H.playerMedallion({place:person.finishPlace||null})}</span>`);
        const count=person.handCount??person.hand?.length,node=panel.querySelector('.piece-count.is-hand');
        if(Number.isSafeInteger(count)&&node){
          const label=node.getAttribute('aria-label')?.replace(/: \d+$/,'')||'';
          paint(node,H.countBadge(count,label,{hand:true}));
        }
      }
    }
    restoreMetrics(){
      for(const [node,saved] of this.metricNodes||[]){
        if(!node.isConnected)continue;
        for(const name of node.getAttributeNames())if(!saved.hasAttribute(name))node.removeAttribute(name);
        for(const attr of saved.attributes)node.setAttribute(attr.name,attr.value);
        node.innerHTML=saved.innerHTML;
      }
      this.metricNodes?.clear();
    }
    // A card transfer needs the arrival hand (including later set departures)
    // as its motion target. Motion staging holds those cards until the flight.
    get displayScene(){
      const items=[this.active,...this.queue].filter(Boolean);
      const arrival=items.find(item=>item.transfer&&item.scene?.zones?.some(zone=>zone.kind==='table'));
      if(arrival)return arrival.scene;
      const item=this.active||this.queue[0];
      return item?.scene?.zones?.some(zone=>zone.kind==='table')?item.scene:null;
    }
    get initialFieldScene(){
      const boundary=(this.active||this.queue[0])?.boundary,scene=boundary?.initial;
      return this.fieldChanged&&!this.releasedFields?.has(boundary)&&!scene?.plan&&scene?.zones?.some(zone=>zone.kind==='board')?scene:null;
    }
    get fieldScene(){
      const boundary=(this.active||this.queue[0])?.boundary;
      if(!boundary||!this.fieldChanged)return null;
      if(!this.releasedFields?.has(boundary))return this.initialFieldScene;
      const scene=boundary.final;
      return !scene?.plan&&scene?.zones?.some(zone=>zone.kind==='board')?scene:null;
    }
    releaseField(item){
      if(!this.initialFieldScene)return;
      this.releasedFields??=new WeakSet();this.releasedFields.add(item.boundary);
      this.fieldChanged();
    }
    stageBoard(){
      const item=this.active||this.queue[0],boundary=item?.boundary;
      if(this.stagedBoundary!==boundary)this.motion?.releaseStage?.();
      this.stagedBoundary=boundary;
      if(!boundary||this.initialFieldScene||this.movedBoundaries?.has(boundary))return;
      this.motion?.stage?.(boundary.snapshot||item.snapshot,{exclude:[...(this.routePoints?.keys()||[])]});
    }
    async move(item,context){
      if(!item.motion)return;
      const boundary=item.boundary, initial=this.initialFieldScene, final=boundary?.final;
      // Routes and reveals own their dedicated choreography. Board effects
      // only receive object identities from authorized board zones.
      const refs=scene=>{
        const zones=new Set(scene?.zones?.filter(zone=>zone.kind==='board').map(zone=>zone.id));
        return scene?.objects?.filter(object=>zones.has(object.zone)).map(object=>entityKey(object.ref))||[];
      };
      const from=refs(initial),to=refs(final);
      const independent=initial&&final&&!final.plan&&!item.reveal&&!item.diceRoll&&
        !this.routePoints?.size&&item.snapshot&&
        this.renderField&&this.motion?.withFieldTargets;
      if(!independent&&!item.scene)this.releaseField(item);
      if(!item.diceRoll){this.movedBoundaries??=new WeakSet();this.movedBoundaries.add(boundary);this.motion?.releaseStage?.();}
      const generation=this.generation;
      try {
        if(independent){
          const flight=this.motion.withFieldTargets(this.renderField(final),()=>item.motion(context),{initialRefs:from,finalRefs:to});
          if(flight===null){boundary.liveSurfaceMotion=true;this.releaseField(item);await item.motion(context);}
          else {boundary.fieldMotion=true;await flight;}
        }
        else await item.motion(context);
      } finally {
        if((independent||item.scene)&&generation===this.generation)this.releaseField(item);
      }
    }
    refresh(){
      this.restorePending();
      const mount=this.mount();if(!mount)return;
      this.paintMetrics();this.paintDepartures();this.stageBoard();this.positionRoutes();this.positionTurn();
      const arrival=[this.active,...this.queue].find(event=>event?.transfer&&event.scene?.zones?.some(zone=>zone.kind==='table'));
      const pendingBoundary=arrival?.boundary||(this.active||this.queue[0])?.boundary;
      if(pendingBoundary&&!this.movedBoundaries?.has(pendingBoundary))this.motion?.prepare?.(pendingBoundary.snapshot,[this.active,...this.queue].filter(event=>event?.boundary===pendingBoundary&&event.transfer).map(event=>event.transfer));
      const item=this.active;this.revealer?.show(item?.speech&&item.reveal?.kind==='card'?null:item?.reveal,item?.pack);
      const pending=new Set(this.queue.flatMap(event=>event.reveal?.cards?.map(card=>entityKey({namespace:'card',id:card.id}))||[]));
      for(const el of mount.querySelectorAll('[data-entity]'))if(pending.has(el.dataset.entity)&&!el.closest('.hand-track,.mini-hand')){this.pendingRevealTargets.push({el,value:el.style.getPropertyValue('visibility'),priority:el.style.getPropertyPriority('visibility')});el.style.setProperty('visibility','hidden','important');}
      const skipped=participantEffects.has(item?.feedback?.kind)?item.feedback.player:null;
      mount.querySelectorAll('.player-panel[data-player-index]').forEach(panel=>{
        panel.style.setProperty('--feedback-skip-ms',(item?.timing.skip||450)+'ms');
        const affected=Number(panel.dataset.playerIndex)===skipped;
        panel.classList.toggle('is-turn-skipped',affected&&item.feedback.kind==='skip');
        panel.classList.toggle('is-participant-affected',affected);
        if(affected){
          panel.dataset.feedbackKind=item.feedback.kind;
          for(const animation of panel.getAnimations?.({subtree:true})||[])if(Number.isFinite(animation.effect.getTiming().iterations))this.effectContext?.animation(animation);
        }else delete panel.dataset.feedbackKind;
        panel.classList.toggle('is-addressed',Number(panel.dataset.playerIndex)===item?.speech?.target);
      });
      const speech=item?.speech;
      if(!speech){this.bubble?.remove();this.bubble=null;this.bubbleEvent=null;return;}
      if(!this.layer?.isConnected){this.layer=mount.ownerDocument.createElement('div');this.layer.className='game-feedback-layer';mount.ownerDocument.body.append(this.layer);}
      if(this.bubbleEvent!==item.id||!this.bubble?.isConnected){
        this.bubble?.remove();const bubble=mount.ownerDocument.createElement('span');this.bubble=bubble;this.bubbleEvent=item.id;
        bubble.className=root.TabletopUI.helpers.components.bubbleClass({kind:'game',result:speech.result});bubble.setAttribute('role','status');bubble.dataset.feedbackEvent=String(item.id);
        const message=item.text||speech.text||root.PlayroomMessages.text('ui.game-feedback.380e3dbd6730',{p0:String(speech.icon==='cards'?root.PlayroomMessages.text('ui.game-feedback.515f651ab064'):root.PlayroomMessages.text('ui.game-feedback.10a9e1f55f14')),p1:String(speech.count||'')});bubble.setAttribute('aria-label',message);
        if(speech.icon==='cards'){const icon=mount.ownerDocument.createElement('span');icon.className='game-speech-icon';icon.innerHTML=root.TabletopUI.icon('cards');const count=mount.ownerDocument.createElement('b');count.textContent=String(speech.count);bubble.append(icon,count);}
        else bubble.textContent=speech.icon==='cross'?'✕':speech.text;
        this.layer.append(bubble);
      }
      this.position();
    }
    clear(){const heldField=this.fieldScene||this.displayScene;this.motion?.releaseStage?.();this.stagedBoundary=null;this.movedBoundaries=new WeakSet();this.clearDepartures();this.request?.cancel();this.request=null;if(this.active||this.queue.length||this.routePoints?.size)this.motion?.cancel();this.restoreRoutes();this.restorePending();this.restoreMetrics();this.generation++;this.player.cancel();this.revealer?.clear();this.queue=[];this.active=null;this.initialScene=null;this.finalScene=null;this.presentedScene=null;this.presentationTurn=null;if(heldField)this.fieldChanged?.();this.refresh();this.layer?.remove();this.layer=null;this.bubble=null;this.bubbleEvent=null;for(const done of this.waiters.splice(0))done();}
    destroy(){this.clear();root.removeEventListener?.('resize',this.reposition);root.document?.removeEventListener('scroll',this.reposition,true);}
  }
  GameFeedback.times=Object.freeze(times);return GameFeedback;
});
