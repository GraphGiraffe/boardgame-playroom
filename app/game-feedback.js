if(typeof module==='object'&&module.exports&&typeof require==='function')require('../core/messages.js');
(function(root,factory){const API=factory(root);if(typeof module==='object'&&module.exports)module.exports=API;root.PlayroomGameFeedback=API;})(globalThis,function(root){
  'use strict';
  const times=(root.PlayroomGameFlow||(typeof require==='function'?require('../core/game-flow.js'):null)).effectTimes;
  const Scheduler=root.PlayroomPresentationScheduler||(typeof require==='function'?require('../presentation/scheduler.js'):null);
  const entityKey=ref=>(root.PlayroomGameComponents||(typeof require==='function'?require('../core/game-components.js'):null)).entityKey(ref);
  const Plans=root.PlayroomEventPlan||(typeof require==='function'?require('../presentation/event-plan.js'):null);
  const participantEffects=new Set(['skip','damage','capture','sunk','penalty']);
  const tableScene=scene=>scene?.zones?.some(zone=>zone.kind==='table')?scene:null;
  const commitOf=item=>item?.boundary?.commit||item?.boundary;
  function boardRefs(scene){
    const zones=new Set(scene.zones?.filter(zone=>zone.kind==='board').map(zone=>zone.id));
    return scene.objects?.filter(object=>zones.has(object.zone)).map(object=>entityKey(object.ref))||[];
  }
  class GameFeedback {
    constructor({motion=root.PlayroomMotion,mount=()=>root.document?.querySelector('.table-shell'),play=()=>{},playAssetAnimation,clock=Scheduler.clock,executor=new Scheduler(clock),duration=700,fieldChanged=null,text=value=>value}={}){
      this.text=text;
      this.playAssetAnimation=playAssetAnimation;
      this.fieldChanged=fieldChanged;this.motion=motion;this.mount=mount;this.play=play;this.player=executor.track('feedback');this.planId=0;this.duration=duration;this.cursor=0;this.notice=null;this.queue=[];this.active=null;this.waiters=[];this.generation=0;this.layer=null;this.bubble=null;this.bubbleEvent=null;
      this.revealer=root.PlayroomActionReveal?new root.PlayroomActionReveal({mount}):null;
      this.reposition=()=>{for(const entry of this.departureNodes?.values()||[]){entry.animation?.cancel();entry.layer.remove();entry.played=true;}this.motion?.releaseStage?.();if(this.stagedBoundary){this.movedBoundaries??=new WeakSet();this.movedBoundaries.add(this.stagedBoundary);}this.position();};root.addEventListener?.('resize',this.reposition);root.document?.addEventListener('scroll',this.reposition,true);
    }
    start(events=[]){this.clear();this.cursor=events.at(-1)?.id||0;}
    accept(events=[],cues=[],pack,{silent=false,mode='normal',snapshot=null,motion=null,defer=false,initialScene=null,finalScene=null}={}){
      const previousCursor=this.cursor;
      const pending=events.filter(e=>Number.isSafeInteger(e?.id)&&e.id>previousCursor);
      if(!pending.length)return;
      this.cursor=pending.at(-1).id;
      if(silent)return;
      const additions=Plans.transferScenes(pending,initialScene,finalScene);
      // Preserve the displayed turn across the entire committed effect queue.
      if(this.presentationTurn==null){this.presentationMode=mode;const stage=this.mount()?.querySelector('.app-game-layout');if(stage?.dataset.turnPlayer!=null)this.presentationTurn=Number(stage.dataset.turnPlayer);const next=stage?.querySelector('.player-panel.is-next[data-player-index]');this.presentationNextPlayer=next?Number(next.dataset.playerIndex):null;}
      // Index the authorized cues once for both dice and regular phases. The
      // result dialog owns terminal audio, even when that event has a cue here.
      const finishIds=new Set(additions.filter(event=>event.kind==='finish').map(event=>event.id));
      const soundsByEvent=new Map();
      for(const {eventId,id} of cues){
        if(typeof id!=='string'||!Number.isSafeInteger(eventId)||eventId<=previousCursor||finishIds.has(eventId))continue;
        if(!soundsByEvent.has(eventId))soundsByEvent.set(eventId,[]);
        soundsByEvent.get(eventId).push(id);
      }
      const timing=times[mode]||times.normal;
      if(!this.queue.length&&!this.active)this.initialScene=initialScene;this.finalScene=finalScene;
      snapshot?.prepareDepartures?.(finalScene);
      snapshot?.preparePoses?.(finalScene);
      const transfers=additions.filter(event=>event.transfer);
      snapshot?.prepareTransfers?.(transfers.map(event=>event.transfer),{back:additions.some(event=>event.speech&&event.reveal?.kind==='card')});
      const boundary={initial:initialScene,final:finalScene,snapshot};
      // Only authorized public board objects can outlive their committed removal.
      const boardZones=new Set(initialScene?.zones?.filter(zone=>zone.kind==='board').map(zone=>zone.id));
      const finalRefs=new Set(finalScene?.objects?.map(object=>entityKey(object.ref)));
      const departures=finalScene&&!finalScene.plan?initialScene?.objects?.filter(object=>boardZones.has(object.zone)&&!finalRefs.has(entityKey(object.ref))).map(object=>entityKey(object.ref))||[]:[];
      if(snapshot)snapshot.revealedEntities=additions.flatMap(e=>e.reveal?.cards?.map(card=>entityKey({namespace:'card',id:card.id}))|| (e.reveal?.entity?[entityKey(e.reveal.entity)]:[]));
      const motionEvent=transfers.at(-1)||additions.findLast(e=>e.reveal||e.presentation)||additions.at(-1);
      const routes=additions.filter(e=>e.presentation?.sequence);
      let rollSoundEvent=null;
      // A committed roll is a presentation step of its own, even when the same
      // command also reveals a result or moves a pawn. Never infer it from faces.
      if(mode!=='instant'&&this.motion?.play&&(snapshot?.action?.type==='roll'||additions.some(e=>e.kind==='roll'||e.presentation?.type==='roll'))){
        if(snapshot)snapshot.skipDice=true;
        rollSoundEvent=additions.find(e=>e.kind==='roll'||e.presentation?.type==='roll')||additions[0];
        const ids=soundsByEvent.get(rollSoundEvent.id)||[];
        const reduced=!!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
        const duration=root.PlayroomGameFlow.presets[mode]?.duration||root.PlayroomGameFlow.presets.normal.duration;
        this.queue.push({id:rollSoundEvent.id,pack,ids,timing,diceRoll:true,boundary,duration:0,motion:context=>this.motion.play({action:{type:'roll'},diceOnly:true,reducedMotion:reduced},{duration:reduced?Math.min(180,duration):duration,context})});
      }
      this.routePoints??=new Map();this.routeStyles??=new Map();this.routeActors??=new Map();this.routeTurns??=new Map();
      for(const event of routes){const r=event.presentation.sequence,key=entityKey(r.entity);this.routeActors.set(key,r.player);if(!this.routePoints.has(key))this.routePoints.set(key,r.origin);}
      let eventInitial=initialScene;
      let transferIndex=-1;
      const checkpoints=additions.some(event=>event.scene);
      const sequence=snapshot?.sequence??finalScene?.motionSequence;
      if(snapshot&&sequence?.trigger===snapshot.action?.type)snapshot.sequence=sequence;
      const captureEvents=[];
      // A destination with explicit departures already has a contact point.
      // Attach adjacent capture cues to it without changing journal order or
      // combining separate authored checkpoints.
      if(mode!=='instant'&&snapshot&&motion&&!checkpoints&&!routes.length&&!finalScene?.plan&&
        sequence?.arrival==='after-departures'&&sequence.trigger===snapshot.action?.type&&motionEvent?.kind==='move'){
        for(let index=additions.indexOf(motionEvent)-1;index>=0;index--){
          const event=additions[index];
          if(event.revision!==motionEvent.revision||event.player!==motionEvent.player||event.kind!=='capture'||
            event.feedback?.kind!=='capture'||event.speech||event.reveal||event.animation||event.transfer||event.presentation)break;
          captureEvents.unshift(event);
        }
      }
      const contact=captureEvents.length?{
        players:new Set(captureEvents.map(event=>event.feedback.player)),
        sounds:captureEvents.flatMap(event=>soundsByEvent.get(event.id)||[])
      }:null;
      for(const event of additions){
        if(captureEvents.includes(event))continue;
        // A penalty/response in the same commit can have another actor. Reveal
        // origins belong to the individual event, never to the last transfer.
        const actor=Number.isInteger(event.player)?event.player:snapshot?.actor;
        const eventSnapshot=event.reveal&&snapshot&&Number.isInteger(actor)&&actor!==snapshot.actor?{...snapshot,actor,origin:snapshot.hands?.get(actor)||null,playedFrom:null}:snapshot;
        const eventBoundary=checkpoints?{initial:eventInitial,final:event.scene||(event===additions.at(-1)?finalScene:eventInitial),snapshot,commit:boundary}:boundary;
        if(event.scene)eventInitial=event.scene;
        const suppressQuestion=mode==='instant'&&event.speech&&!event.speech.result&&additions.some(reply=>reply.id>event.id&&reply.speech?.result&&reply.revision===event.revision);
        const ids=event===rollSoundEvent||suppressQuestion?[]:soundsByEvent.get(event.id)||[];
        const animated=event.speech||event.reveal||event.animation||participantEffects.has(event.feedback?.kind);
        const route=event.presentation?.sequence;
        const effect=route?async(context)=>{
          const generation=this.generation;const pace=root.PlayroomGameFlow.timing({animationSpeed:mode},root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
          await this.motion?.play({...(this.active?.snapshot||snapshot),action:{type:route.trigger},sequence:route,routeOnly:true},{duration:pace.duration,settle:pace.settle,context});
          if(generation!==this.generation)return;this.routePoints.set(entityKey(route.entity),route.jump||route.steps.at(-1)||route.origin);this.positionRoutes();
        }:routes.length?null:transfers.length>1&&event.transfer&&motion?context=>motion(context,{snapshot:this.active.snapshot,draws:[event.transfer],transferOnly:true}):event===motionEvent?motion:null;
        const index=event.transfer?++transferIndex:-1;
        if(animated||effect||ids.length||event.scene)this.queue.push({...event,pack,ids,timing,mode,boundary:eventBoundary,snapshot:eventSnapshot,transferIndex:index,departures:event===motionEvent?departures:[],contact:event===motionEvent?contact:null,motion:effect,duration:event.reveal?.kind==='dice'?timing.diceReveal:event.speech&&event.reveal?.kind==='card'?timing.speech:event.reveal?timing.reveal:participantEffects.has(event.feedback?.kind)?timing.skip:event.speech?(['take','pass'].includes(event.feedback?.kind)?timing.skip:timing.speech):0});
      }
      if(!this.active&&!this.queue.length){this.presentationTurn=null;this.presentationNextPlayer=null;}
      if(!this.active&&!defer)this.next();
    }
    next(previous=null){
      if(this.active)return;
      const batch=[...this.queue];
      if(!batch.length){this.settled();return;}
      const generation=this.generation;
      // Claim the queue before a phase can synchronously redraw the surface.
      this.active=batch[0];
      const plan=Plans.compile({id:'feedback:'+ ++this.planId,items:batch,initial:this.initialScene,final:this.finalScene});
      if(Number.isInteger(this.presentationTurn)&&this.presentationTurn>=0&&this.presentationMode!=='instant')plan.groups.push({scene:plan.final,duration:0,cues:[{id:plan.id+':turn-handoff',kind:'turn-handoff',from:this.presentationTurn}]});
      const diagnosticStart=root.PlayroomDiagnostics?.begin()??null;
      const played=this.player.play(plan,{
        initial:index=>{this.presentedScene=plan.scenes[index];this.paintMetrics();},
        group:(_,group)=>{if(generation===this.generation){this.presentedScene=plan.scenes[group.scene];this.paintMetrics();}},
        effect:(cue,context)=>cue.kind==='turn-handoff'?this.turnHandoff(cue,context):this.presentCue({
          kind:cue.stage,item:batch[cue.index],last:cue.index===batch.length-1,previous:cue.index===0&&cue.stage==='prepare'?previous:null
        },generation,context),
        cancel:()=>{if(generation===this.generation)this.clear();},
        final:(index,status)=>{
          if(generation!==this.generation)return;
          if(status==='skipped'||status==='failed'){this.clear();return;}
          this.presentedScene=plan.scenes[index];this.paintMetrics();
          if(this.queue.length){
            // The next batch claims the queue before preparing its first
            // cue. Preserve the table that is still mounted for that cue.
            const mounted={field:this.fieldScene,display:this.displayScene};
            this.active=null;
            this.next(mounted);
          }else this.settled();
        }
      });
      if(diagnosticStart!==null)Promise.resolve(played).then(result=>root.PlayroomDiagnostics?.end('presentation',diagnosticStart,{status:result?.status||'complete',items:batch.length,queued:this.queue.length,requestedMs:batch.reduce((total,item)=>total+(item.duration||0),0)}),()=>root.PlayroomDiagnostics?.end('presentation',diagnosticStart,{status:'failed'}));
    }
    captureCheckpoint(options,transfer,finalScene){
      // Read the currently displayed geometry, then keep artwork only for
      // this cue's transfer or the authorized pieces removed by its checkpoint.
      const shot=this.motion?.capture?.({...options,deferDepartures:true});
      if(finalScene)shot?.prepareDepartures?.(finalScene);
      if(finalScene)shot?.preparePoses?.(finalScene);
      shot?.prepareTransfers?.(transfer?[transfer]:[]);
      return shot;
    }
    async presentCue({kind,item,last,previous},generation,context){
      const valid=()=>generation===this.generation;
      // The sound port joins the current phase only if it can start now.
      // Waiting for gesture unlock here would delay the first visible frame.
      if(kind==='sound')return this.play(item.ids,item.pack,context);
      if(kind==='prepare'){
        if(this.request&&item.reveal){const request=this.request;this.request=null;await request.finish(context);if(!valid())return;}
        const previousField=previous?previous.field:this.fieldScene,previousDisplay=previous?previous.display:this.displayScene;
        // Every route checkpoint starts at the public pose released by the
        // previous event, not the first pose of the whole accepted command.
        if(item.presentation?.sequence&&item.scene){
          item.snapshot=this.captureCheckpoint({actor:item.player,viewer:item.snapshot?.viewer,action:item.presentation,sceneModel:item.boundary.initial},item.transfer,item.boundary.final)||item.snapshot;
          item.boundary.snapshot=item.snapshot;
        }
        if(item.reveal?.kind==='cards'&&previousDisplay)item.snapshot=this.captureCheckpoint({viewer:previousDisplay.viewer},item.transfer)||item.snapshot;
        if(item.transfer&&item.scene&&item.transferIndex>0){
          item.snapshot=this.captureCheckpoint({viewer:item.snapshot?.viewer},item.transfer)||item.snapshot;
          item.boundary.snapshot=item.snapshot;
        }
        this.active=this.queue.shift();this.effectContext=context;
        if(((item.reveal&&!item.scene)||item.diceRoll)&&this.initialFieldScene)this.releaseField(item);
        else if(this.fieldScene!==previousField||this.displayScene!==previousDisplay)this.fieldChanged?.();
        this.refresh();
        if(item.speech&&item.reveal?.kind==='card'&&this.motion?.beginRequest){
          this.request=this.motion.beginRequest(item.snapshot,item.speech.speaker,item.reveal.card,item.timing.flip||0,context);
          if(this.bubble)this.bubble.style.visibility='hidden';
          await this.request.ready;if(valid())this.position();
        }
      }else if(kind==='enter'){
        const animation=item.animation&&item.mode!=='instant'?this.playAssetAnimation?.(item.animation,context,item.mode):null;
        if(item.reveal&&!(item.speech&&item.reveal.kind==='card'))await this.revealer?.enter(item.snapshot,item.timing,context);
        if(!item.reveal||item.speech)await this.presentCue({kind:'hold',item,last},generation,context);
        // The same group owns motion, reveal, authored effects and sound.
        // Await the asset before leaving this event's scene.
        if(animation)await animation;
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
      this.active=null;this.initialScene=null;this.finalScene=null;this.presentationTurn=null;this.presentationNextPlayer=null;this.clearDepartures();this.restoreRoutes();this.restoreMetrics();this.presentedScene=null;if(heldField)this.fieldChanged?.();this.refresh();this.positionTurn();
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
        panel.classList.toggle('is-next',panel.dataset.turnPrimary!=='false'&&(held?Number(panel.dataset.playerIndex)===this.presentationNextPlayer:panel.dataset.nextTurn==='true'));
      }
    }
    async turnHandoff(cue,context){
      // A batch can gain successors while its effects are still playing.
      // Keep the displayed turn until the last queued batch reaches this cue.
      if(!context.current()||this.queue.length)return;
      const stage=this.mount()?.querySelector('.app-game-layout');if(!stage)return;
      const target=Number(stage.dataset.turnPlayer);if(!Number.isInteger(target)||target<0||target===cue.from)return;
      // This cue is after card/reply/transfer effects, on the same owned track.
      this.presentationTurn=target;
      const next=stage.querySelector('.player-panel[data-next-turn="true"]');this.presentationNextPlayer=next?Number(next.dataset.playerIndex):null;this.positionTurn();
      if(root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||root.document?.body.classList.contains('reduced-motion'))return;
      const style=root.PlayroomGameFlow.turnHandoff,animations=[];
      for(const [player,role,scale] of [[cue.from,'outgoing',style.outgoingScale],[target,'incoming',style.incomingScale]]){
        const panel=[...stage.querySelectorAll('.player-panel[data-player-index]')].find(n=>Number(n.dataset.playerIndex)===player&&n.dataset.turnPrimary!=='false'&&n.getClientRects().length);
        if(!panel||!this.motion?.pulseParticipant)continue;
        animations.push(this.motion.pulseParticipant(panel,{scale,role,duration:style.duration,context}));
      }
      await Promise.allSettled(animations);
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
          if(active&&point.label)for(const counter of panel.querySelectorAll('[data-motion-counter="position"]')){
            if(counter.textContent===point.label)continue;
            this.rememberMetric(counter);counter.textContent=point.label;
          }
        }
      }
    }
    restoreRoutes(){for(const [el,value] of this.routeStyles||[])el.style.translate=value;this.routeStyles?.clear();this.routePoints?.clear();this.routeActors?.clear();for(const [panel,value] of this.routeTurns||[]){panel.classList.toggle('is-turn',value.turn);if(value.current===null)panel.removeAttribute('aria-current');else panel.setAttribute('aria-current',value.current);}this.routeTurns?.clear();}
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
    rememberMetric(node){
      this.metricNodes??=new Map();
      if(this.metricNodes.has(node))return;
      // Counters are host-owned DOM. Retain their original children for the
      // overlay lifetime so restoring a badge keeps its actual nodes.
      this.metricNodes.set(node,{
        attrs:new Map(Array.from(node.attributes,attr=>[attr.name,attr.value])),
        children:[...node.childNodes]
      });
    }
    // The final DOM remains available as a motion destination. Semantic counters
    // show the plan's current scene, including after a network redraw.
    paintMetrics(){
      const mount=this.mount(),scene=this.presentedScene,H=root.TabletopUI?.helpers;
      if(!mount||!scene?.players||!H)return;
      // Several effect phases share one authorized scene. The shell releases
      // the overlay before patching its nodes, even when it keeps this mount.
      const painted=this.paintedMetrics;
      if(painted?.mount===mount&&painted.scene===scene)return;
      const paint=(node,html)=>{
        if(!node)return;
        const template=node.ownerDocument.createElement('template');template.innerHTML=html;
        const replacement=template.content.firstElementChild;
        if(node.isEqualNode(replacement))return;
        this.rememberMetric(node);
        for(const name of node.getAttributeNames())if(!replacement.hasAttribute(name))node.removeAttribute(name);
        for(const attr of replacement.attributes)node.setAttribute(attr.name,attr.value);
        if(node.innerHTML!==replacement.innerHTML)node.replaceChildren(...replacement.childNodes);
      };
      for(const panel of mount.querySelectorAll('.player-panel[data-player-index]')){
        const person=scene.players.find(p=>p.player===Number(panel.dataset.playerIndex));if(!person)continue;
        for(const node of panel.querySelectorAll('[data-score-id]')){
          const metric=person.metrics.find(m=>m.id===node.dataset.scoreId);
          if(metric&&['points','wins','pieces'].includes(metric.kind))paint(node,H.scoreBadge({...metric,label:this.text(metric.label)}));
        }
        paint(panel.querySelector('[data-finish-award]'),`<span data-finish-award>${H.playerMedallion({place:person.finishPlace||null})}</span>`);
        const count=person.handCount??person.hand?.length,node=panel.querySelector('.piece-count.is-hand');
        if(Number.isSafeInteger(count)&&node){
          const label=node.getAttribute('aria-label')?.replace(/: \d+$/,'')||'';
          paint(node,H.countBadge(count,label,{hand:true}));
        }
      }
      this.paintedMetrics={mount,scene};
    }
    // Release overlays before each keyed shell patch and at settlement. A
    // patch can retain unchanged nodes, so the next overlay must borrow the
    // newly rendered host counters rather than restore a stale revision.
    restoreMetrics(){
      this.paintedMetrics=null;
      for(const [node,saved] of this.metricNodes||[]){
        if(!node.isConnected)continue;
        for(const name of node.getAttributeNames())if(!saved.attrs.has(name))node.removeAttribute(name);
        for(const [name,value] of saved.attrs)if(node.getAttribute(name)!==value)node.setAttribute(name,value);
        if(node.childNodes.length!==saved.children.length||saved.children.some((child,index)=>node.childNodes[index]!==child))
          node.replaceChildren(...saved.children);
      }
      this.metricNodes?.clear();
    }
    // A card transfer needs its arrival hand as a motion target. Look
    // ahead within the active commit; a later commit owns a different table.
    tableArrival(item){
      if(item?.transfer&&tableScene(item.scene))return item;
      const commit=commitOf(item);
      for(const queued of this.queue){
        if(commitOf(queued)!==commit)break;
        if(queued.transfer&&tableScene(queued.scene))return queued;
      }
      return null;
    }
    get displayScene(){
      const item=this.active||this.queue[0],arrival=this.tableArrival(item);
      const scene=tableScene(arrival?.scene||item?.scene);
      if(scene)return scene;
      // A new authority frame can arrive while a cue without an explicit
      // checkpoint is playing. Keep that cue's table until the next commit.
      return this.queue.length&&commitOf(this.queue.at(-1))!==commitOf(item)?tableScene(item.boundary.final):null;
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
    sceneFor(scene,checkpoint=this.fieldScene||this.displayScene){
      // Native surfaces mount the selected public checkpoint by reference.
      // A different viewer can arrive while a presentation is being cleared.
      return checkpoint&&checkpoint.audience===scene?.audience&&checkpoint.viewer===scene?.viewer?checkpoint:scene;
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
      const independent=initial&&final&&!final.plan&&(!item.reveal||item.presentation?.sequence)&&!item.diceRoll&&
        (!this.routePoints?.size||item.presentation?.sequence?.arrival==='after-departures')&&item.snapshot&&
        this.motion?.withFieldTargets;
      if(!independent&&!item.scene)this.releaseField(item);
      if(!item.diceRoll){this.movedBoundaries??=new WeakSet();this.movedBoundaries.add(boundary);this.motion?.releaseStage?.();}
      const generation=this.generation;
      let contactSound=null;
      const impact=()=>{
        if(contactSound||generation!==this.generation||context?.current?.()===false)return;
        item.contact.active=true;
        this.paintParticipantEffects(this.mount(),item,context);
        contactSound=Promise.resolve().then(()=>{
          if(item.contact.sounds.length&&context?.current?.()!==false)return this.play(item.contact.sounds,item.pack,context);
        }).catch(()=>{});
      };
      const play=item.contact?()=>item.motion(context,{snapshot:{...item.snapshot,onRouteContact:impact}}):()=>item.motion(context);
      try {
        if(independent){
          const flight=this.motion.withFieldTargets(()=>this.renderField?{
            html:this.renderField(final),initialRefs:boardRefs(initial),finalRefs:boardRefs(final)
          }:null,play);
          if(flight===null){boundary.liveSurfaceMotion=true;this.releaseField(item);await play();}
          else {boundary.fieldMotion=true;await flight;}
        }
        else await play();
        // Some viewports have no measurable route. Still deliver the capture
        // once after the fallback effect, unless the phase was cancelled.
        if(item.contact){impact();await contactSound;}
      } finally {
        if((independent||item.scene)&&generation===this.generation)this.releaseField(item);
      }
    }
    paintParticipantEffects(mount,item,context=this.effectContext){
      if(!mount)return;
      const feedback=item?.feedback,contact=item?.contact;
      for(const panel of mount.querySelectorAll('.player-panel[data-player-index]')){
        const player=Number(panel.dataset.playerIndex);
        const kind=contact?.active&&contact.players.has(player)?'capture':feedback?.player===player?feedback.kind:null;
        const affected=participantEffects.has(kind);
        panel.style.setProperty('--feedback-skip-ms',(item?.timing.skip||450)+'ms');
        panel.classList.toggle('is-turn-skipped',affected&&kind==='skip');
        panel.classList.toggle('is-participant-affected',affected);
        if(affected){
          panel.dataset.feedbackKind=kind;
          for(const animation of panel.getAnimations?.({subtree:true})||[])if(Number.isFinite(animation.effect.getTiming().iterations))context?.animation(animation);
        }else delete panel.dataset.feedbackKind;
        panel.classList.toggle('is-addressed',player===item?.speech?.target);
      }
    }
    refresh(){
      this.restorePending();
      const mount=this.mount();if(!mount)return;
      this.paintMetrics();this.paintDepartures();this.stageBoard();this.positionRoutes();this.positionTurn();
      const current=this.active||this.queue[0],commit=commitOf(current);
      const pendingBoundary=this.tableArrival(current)?.boundary||current?.boundary;
      const draws=[],pending=new Set();
      if(this.active?.boundary===pendingBoundary&&this.active?.transfer)draws.push(this.active.transfer);
      for(const event of this.queue){
        if(commitOf(event)!==commit)break;
        if(event!==this.active&&event.boundary===pendingBoundary&&event.transfer)draws.push(event.transfer);
        for(const card of event.reveal?.cards||[])pending.add(entityKey({namespace:'card',id:card.id}));
      }
      if(pendingBoundary&&!this.movedBoundaries?.has(pendingBoundary))this.motion?.prepare?.(pendingBoundary.snapshot,draws);
      const item=this.active;this.revealer?.show(item?.speech&&item.reveal?.kind==='card'?null:item?.reveal,item?.pack);
      if(pending.size)for(const el of mount.querySelectorAll('[data-entity]'))if(pending.has(el.dataset.entity)&&!el.closest('.hand-track,.mini-hand')){this.pendingRevealTargets.push({el,value:el.style.getPropertyValue('visibility'),priority:el.style.getPropertyPriority('visibility')});el.style.setProperty('visibility','hidden','important');}
      this.paintParticipantEffects(mount,item);
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
    clear(){const heldField=this.fieldScene||this.displayScene;this.motion?.releaseStage?.();this.stagedBoundary=null;this.movedBoundaries=new WeakSet();this.clearDepartures();this.request?.cancel();this.request=null;if(this.active||this.queue.length||this.routePoints?.size)this.motion?.cancel();this.restoreRoutes();this.restorePending();this.restoreMetrics();this.generation++;this.player.cancel();this.revealer?.clear();this.queue=[];this.active=null;this.initialScene=null;this.finalScene=null;this.presentedScene=null;this.presentationTurn=null;this.presentationNextPlayer=null;if(heldField)this.fieldChanged?.();this.refresh();this.layer?.remove();this.layer=null;this.bubble=null;this.bubbleEvent=null;for(const done of this.waiters.splice(0))done();}
    destroy(){this.clear();root.removeEventListener?.('resize',this.reposition);root.document?.removeEventListener('scroll',this.reposition,true);}
  }
  GameFeedback.times=Object.freeze(times);return GameFeedback;
});
