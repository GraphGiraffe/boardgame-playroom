// Native application geometry for an authorized SDK frame. No engine or VM runs
// in this adapter: the caller supplies frames and owns the command transport.
(function(root){'use strict';
 function takeFrameParts(fields){
  // Only the viewer's protocol can attest recursive ownership. A shallow
  // freeze or data from an external SDK host still needs a detached copy.
  const primitive=value=>value==null||['string','number','boolean'].includes(typeof value);
  return Object.values(fields).every(value=>primitive(value)||root.PlayroomProtocol.ownsImmutable(value))?
   fields:root.structuredClone(fields);
 }
 class GameView{
  constructor(host,{text=value=>String(value??''),command,preview,restart,error=()=>{},hostCommand=()=>{},audio=null}={}){
   if(typeof command!=='function')throw new TypeError('SDK game view requires a command port');
   if(host?.id!=='app'||!host.ownerDocument.getElementById('modal-root'))throw Object.assign(Error('SDK_NATIVE_HOST_REQUIRED'),{code:'SDK_NATIVE_HOST_REQUIRED'});
   this.host=host;this.text=text;this.command=command;this.previewPort=preview;this.restart=restart;this.error=error;this.hostCommand=hostCommand;this.audio=audio;this.playAudio=(ids,pack,context)=>this.audio?.present?this.audio.present(ids,pack,context.signal,context):this.audio?.batch?.(ids,pack,context.signal);this.views=new Map();this.preferences={};this.reduced=false;this.pendingFrames=[];
   this.click=event=>this.handleClick(event);host.addEventListener('click',this.click);
   this.modalRoot=host.ownerDocument.getElementById('modal-root');this.modalRoot.addEventListener('click',this.click);
   this.resize=()=>{const viewport=root.innerWidth+':'+root.innerHeight;if(this.viewport!==viewport){this.viewport=viewport;root.PlayroomElementSizes.apply(host.ownerDocument,100,root.innerWidth,root.innerHeight);}root.PlayroomGameScreen.layoutScene(host);};root.addEventListener('resize',this.resize);
  }
  get busy(){return this.presenting||this.playingPublicPlan;}
  update(frame,{sharedPackData}={}){
   if(this.disposed)throw Object.assign(Error('SDK_VIEW_DISPOSED'),{code:'SDK_VIEW_DISPOSED'});
   if(['position','checkpoint','debug'].some(key=>Object.hasOwn(frame,key)))throw Object.assign(Error('SDK_PRIVATE_FRAME_DENIED'),{code:'SDK_PRIVATE_FRAME_DENIED'});
   // Studio can decode its public JSON in this realm. The plan validator
   // then receives viewer-owned objects without a second full snapshot.
   if(sharedPackData){
    if(this.packData?.source!==sharedPackData){
     const {metadata,resources,catalogs}=sharedPackData;
     const data=takeFrameParts({metadata,resources,catalogs}),assets=data.resources?.assets;
     // The viewer owns this copy across revisions and player changes. Let
     // the scene renderer keep its resource index for the same pack snapshot.
     if(Array.isArray(assets)){for(const asset of assets)Object.freeze(asset);Object.freeze(assets);}
     this.packData={source:sharedPackData,data};
    }
    const {metadata,resources,catalogs,...dynamic}=frame;
    frame=Object.assign(takeFrameParts(dynamic),this.packData.data);
   }else{
    this.packData=null;
    if(!root.PlayroomProtocol.ownsImmutable(frame))frame=root.structuredClone(frame);
   }
   const p=frame.projection,previous=this.frame;if(!p||!frame.scene)throw Error('SDK_SCENE_INVALID');
   const same=this.sameSurface(previous,frame);
   const latest=this.pendingFrames.at(-1)||previous;
   if(same&&!previous.history?.reviewing&&!frame.history?.reviewing){
    if(p.revision<latest.projection.revision)return;
    // Wait to capture geometry until the preceding committed field has settled.
    // A same-revision refresh may omit the already selected transition.
    if(this.busy&&p.revision>previous.projection.revision){
     if(p.revision===latest.projection.revision)this.pendingFrames[this.pendingFrames.length-1]={...frame,motion:frame.motion||latest.motion};
     else this.pendingFrames.push(frame);
     return;
    }
   }
   if(this.busy&&(!same||previous.projection.revision!==p.revision||previous.history?.reviewing!==frame.history?.reviewing||previous.history?.index!==frame.history?.index))this.cancelPresentation();
   this.applyFrame(frame);
  }
  sameSurface(previous,frame){
   return previous&&previous.projection.game===frame.projection.game&&previous.sessionId===frame.sessionId&&previous.pack?.hash===frame.pack?.hash&&previous.projection.viewer===frame.projection.viewer;
  }
  applyFrame(frame){
   const previous=this.frame,p=frame.projection,same=this.sameSurface(previous,frame);
   const events=!this.busy&&same&&p.revision>previous.projection.revision&&frame.motion?
    root.PlayroomTransition.eventsAfter(frame.events,previous.events?.at(-1)?.id||0):[];
   // Continuous ink commits stay with the canvas gesture owner. Atomic reveals
   // and feedback still use the same event queue as other native components.
   const atomic=!frame.scene.canvas||events.some(event=>event.reveal||event.speech||event.transfer||event.sound||event.feedback||event.animation||event.scene);
   if(same&&!this.busy&&this.renderer?.canPlayPublicPlan(frame.scene,frame)){
    this.playingPublicPlan=true;
    this.renderFrame(frame);
    this.trackPresentation(this.renderer.motionPlayer.whenIdle());
   }else if(atomic&&events.length)this.presentEvents(previous,frame,events);
   else this.renderFrame(frame);
   if(same&&previous.projection.status!=='finished'&&p.status==='finished'&&!frame.history?.reviewing&&!previous.history?.reviewing){
    const owner=this.resultOwner;
    // The ordinary result surface opens after the last public animation.
    void this.whenIdle({commands:false}).then(()=>{
     if(!this.disposed&&this.resultOwner===owner&&this.frame.projection.viewer===p.viewer&&!this.frame.history?.reviewing&&this.frame.projection.status==='finished')this.openResult(true);
    }).catch(this.error);
   }
  }
  eventText(event,frame){
   const reference=event.message;
   // Bind an actor name at the host boundary, as the installed adapter does.
   const message=reference&&typeof reference==='object'&&Number.isInteger(event.player)?{...reference,params:{...reference.params,player:frame.participants?.[event.player]?.name||this.text({kind:'player-reference',index:event.player})}}:reference;
   return this.text(message);
  }
  presentEvents(previous,frame,updates){
   this.renderer?.motionPlayer?.cancel();
   if(!this.feedback){
    const motion=root.PlayroomMotion.surface(()=>this.host.querySelector('.table-shell'));this.feedbackMotion=motion;
    this.feedback=new root.PlayroomGameFeedback({motion,mount:()=>this.host.querySelector('.table-shell'),executor:this.renderer.motionScheduler,text:this.text,play:this.playAudio,playAssetAnimation:(cue,context,mode)=>this.renderer.playAssetAnimation(cue,context,mode),fieldChanged:()=>{if(this.presenting){this.renderFrame(this.frame);this.feedback.refresh();}}});
   }
   this.feedback.start(previous.events||[]);
   const snapshot=this.feedbackMotion.capture({...frame.motion,viewer:frame.projection.viewer,sceneModel:previous.scene,deferDepartures:true});
   const events=updates.map(event=>({...event,kind:event.finish?'finish':event.kind||'action',...(event.message?{text:this.eventText(event,frame)}:{}),...(event.reveal?{reveal:{...event.reveal,...(event.reveal.title?{title:this.text(event.reveal.title)}:{})}}:{}),...(event.speech?{speech:{...event.speech,...(event.speech.text?{text:this.text(event.speech.text)}:{})}}:{})}));
   // The viewer plays the same authorized cues and transfer range as the app.
   const viewer=frame.projection.viewer,transition=root.PlayroomTransition;
   const cues=transition.soundCues(events,{players:Array(frame.projection.playerCount),winners:frame.projection.winners,winner:frame.projection.winners?.[0]??null},viewer);
   const transfers=transition.transferCues(events,viewer);
   const pace=root.PlayroomGameFlow.timing({...frame.ui,...(this.reduced?{animationSpeed:'instant'}:{})},root.matchMedia('(prefers-reduced-motion:reduce)').matches);
   this.presenting=true;
   this.feedback.accept(events,cues,frame.projection.game,{snapshot,mode:pace.mode,initialScene:previous.scene,finalScene:frame.scene,defer:true,motion:(context,{snapshot:own=snapshot,draws=transfers,transferOnly=false}={})=>this.feedbackMotion.play({...own,...(transferOnly?{transferOnly:true}:{})},{duration:pace.duration,settle:pace.settle,effects:root.PlayroomGameFlow.effectTimes[pace.mode],draws,context})});
   this.renderFrame(frame);this.feedback.next();this.feedback.refresh();
   this.trackPresentation(this.feedback.whenIdle());
  }
  trackPresentation(completion){
   // The frame queue waits for the owner of the transition. The renderer
   // owns authored phases, and GameFeedback owns event-driven effects.
   const generation=this.presentationGeneration=(this.presentationGeneration||0)+1;
   this.presentationDone=completion.then(()=>{
    if(this.disposed||generation!==this.presentationGeneration)return;
    this.presenting=false;
    this.playingPublicPlan=false;
    if(!this.pendingFrames.length)this.renderFrame(this.frame);
    while(this.pendingFrames.length&&!this.busy)this.applyFrame(this.pendingFrames.shift());
   }).catch(this.error);
  }
  async whenIdle({commands=true}={}){
   if(commands)await this.pendingCommand;
   let transition;
   do{
    transition=this.presentationDone;
    await Promise.all([transition,this.renderer?.motionPlayer?.whenIdle()]);
   }while(!this.disposed&&transition!==this.presentationDone);
  }
  cancelPresentation(frame=this.frame){
   this.presentationGeneration=(this.presentationGeneration||0)+1;
   if(this.playingPublicPlan)this.renderer?.motionPlayer?.cancel();
   this.playingPublicPlan=false;
   this.presenting=false;
   this.pendingFrames.length=0;
   this.feedback?.clear();this.audio?.stop?.();if(frame&&!this.disposed)this.renderFrame(frame);
  }
  renderFrame(frame){
   if(this.disposed)throw Object.assign(Error('SDK_VIEW_DISPOSED'),{code:'SDK_VIEW_DISPOSED'});
   if(['position','checkpoint','debug'].some(key=>Object.hasOwn(frame,key)))throw Object.assign(Error('SDK_PRIVATE_FRAME_DENIED'),{code:'SDK_PRIVATE_FRAME_DENIED'});
   const UI=root.TabletopUI,Screen=root.PlayroomGameScreen,p=frame.projection,scene=this.presenting?this.feedback.sceneFor(frame.scene):frame.scene;
   if(!p||!scene||scene.players?.length!==p.playerCount)throw Error('SDK_SCENE_INVALID');
   const audioKey=p.game+':'+(frame.pack?.hash||frame.pack?.version||'');
   if(this.audio?.registerPack&&this.audioKey!==audioKey){
    const sounds=root.TabletopPacks.resolveSoundAssets(frame.metadata?.sounds,path=>{
     const asset=frame.resources?.assets.find(item=>item.file===path);
     if(!asset||!/^audio\//.test(asset.mime)||asset.encoding==='utf8')throw Object.assign(Error('SDK_SOUND_ASSET_INVALID'),{code:'SDK_SOUND_ASSET_INVALID'});
     return 'data:'+asset.mime+';base64,'+asset.data;
    });
    this.audio.registerPack(p.game,sounds);this.audioKey=audioKey;
   }
   const identity=p.game+':'+(frame.pack?.hash||frame.pack?.version||'')+':'+(frame.sessionId||''),scope=identity+':'+p.viewer+':'+!!frame.history?.reviewing;
   if(this.helpFrame&&(this.helpScope!==scope||!this.helpValid(frame)))this.closeHelp();
   if(identity!==this.identity){this.feedback?.destroy();this.feedback=null;this.feedbackMotion=null;this.renderer?.destroy();this.renderer=null;this.views.clear();this.identity=identity;this.resultOwner={};}
   if(!this.views.has(scope))this.views.set(scope,{});this.viewState=this.views.get(scope);this.frame=frame;
   const participants=frame.participants||Array.from({length:p.playerCount},(_,i)=>({name:'Игрок '+(i+1),local:true,primary:i===0}));
   const result=frame.result&&{...frame.result,metrics:frame.result.metrics.map(metric=>({...metric,label:this.text(metric.label)}))};
   const state={modelProjection:p,game:p.game,packVersion:frame.pack?.version,move:p.revision||0,turn:p.turn,status:p.status,winners:p.winners,winner:p.winners?.[0]??null,result,firstPlayer:frame.options?.firstPlayer??0,players:participants,scene,timeline:p.timeline};
   const reviewing=!!frame.history?.reviewing;
   const busy=!!this.busy;
   const actions=(busy||reviewing?[]:frame.actions||[]).map(({choice,command,label})=>({
    ...Object.fromEntries(Object.entries(choice||{}).map(([key,value])=>[key,value?.key?this.text(value):value])),
    ...command,label:this.text(label)
   }));
   const ui={...frame.ui,viewState:this.viewState,preferences:this.preferences,replay:reviewing,hotseat:false,quickPlay:false,externalMotion:!!this.presenting,...(this.presenting?{presentationTurn:this.feedback.presentationTurn}:{})};
   const cover=(frame.resources?.assets||[]).find(asset=>asset.file===frame.metadata?.cover?.id&&/^image\/(?:webp|png|svg\+xml)$/.test(asset.mime));
   const coverURL=cover?'data:'+cover.mime+(cover.encoding==='utf8'?';charset=utf-8,'+encodeURIComponent(cover.data):';base64,'+cover.data):null;
   // ActionReveal and spoken requests use the installed pack's same bounded
   // card renderer, including the currently authorized asset closure.
   root.PlayroomViews.register(p.game,()=>'',coverURL?()=>'<img class="pack-cover-art" alt="" src="'+UI.esc(coverURL)+'">':undefined,{reveal:value=>value.kind==='dice'?
     root.PlayroomSDKRenderDice?.(value.dice,{packId:p.game,resources:frame.resources,text:this.text}):
     root.PlayroomSDKRenderCard?.(value.card,{packId:p.game,deck:frame.metadata?.deck||'standard',resources:frame.resources})||''});
   const recipe=root.TabletopPacks.sceneRecipe({state,viewer:p.viewer,actions,ui,manifest:frame.pack,helpers:UI.helpers,text:this.text});
   const gameName=this.text(frame.metadata?.name||frame.pack?.name||p.game);
   this.resultView={state,viewer:p.viewer,gameName,playerContent:recipe.playerContent};
   // Explicit scene choices have their own shared picker. Other player-targeted
   // actions, including simultaneous reactions, use the native player menu.
   this.targetActions=scene.playerChoices?[]:actions.filter(action=>action.targetKind==='player');
   const targetScope=scope+':'+p.revision;
   if(this.targetScope!==targetScope||!this.targetActions.length)this.playerTargets?.cancel();
   this.targetScope=targetScope;
   if(this.targetActions.length&&!this.playerTargets)this.playerTargets=new root.PlayroomPlayerTarget({
    root:()=>this.host.querySelector('.table-shell'),actions:()=>this.targetActions,
    selected:()=>this.renderer?.selectedSource?.entity?.id??null,
    commit:action=>{const command=this.resolve(action);if(command)Promise.resolve(this.send(command)).catch(this.error);}
   });
   const menuActions=reviewing?[]:[
    ...(result?[{attrs:'data-command="result"',label:'Итог партии',name:'trophy',disabled:busy}]:[]),
    ...(frame.history?.count>1?[{attrs:'data-command="history"',label:'История ходов',name:'history'}]:[]),
    ...(this.rulebook(frame)?[{attrs:'data-command="rules"',label:'Правила',name:'help'}]:[]),
    ...(scene.menuActions||[]).map(action=>({label:this.text(action.label),name:action.kind==='vote'?'stop':'settings',attrs:UI.actionAttr(action.command),disabled:busy}))
   ];
   const markup=Screen.render({layoutId:identity,gameName,state,viewer:p.viewer,actions,scene:UI.composeScene(recipe,{state,viewer:p.viewer,actions,presentationTurn:ui.presentationTurn}),replay:reviewing,busy,showSettings:false,readOnly:p.viewer<0,menuActions});
   const tree=hostTemplate(this.host,markup);
   if(!menuActions.length)tree.querySelector('[data-game-menu]')?.remove();
   this.feedback?.restoreMetrics();
   Screen.update(this.host,tree.innerHTML);
   const port=this.host.querySelector('[data-sdk-player-scene]');
   if(this.renderer?.root!==port){this.renderer?.destroy();this.renderer=new root.PlayroomSDKSceneRenderer(port,{text:this.text,command:c=>this.send(c),preview:this.previewPort,error:this.error,playAudio:this.playAudio});}
   this.renderer.externalActions=()=>root.PlayroomSDKSceneRenderer.externalActions(this.host,p.actions,'.layout-actions [data-action]');
   this.renderer.present({...frame,participants,ui,...(busy?{interaction:{...frame.interaction,blocked:true}}:{})},{displayScene:scene,reducedMotion:this.reduced});
   this.resize();
  }
  resolve(candidate){return root.PlayroomProtocol.resolveChoice(this.frame.projection.actions,candidate,true);}
  send(command,confirmed=false){
   if(this.disposed||this.frame.history?.reviewing||this.busy||this.pendingCommand||this.helpFrame)return false;
   if(!confirmed){
    const authorized=this.resolve(command);
    // A typed input may extend a command with fields. Only exact finite
    // choices can carry authored confirmation metadata.
    if(authorized&&Object.keys(authorized).length===Object.keys(command).length){
     const key=root.PlayroomProtocol.canonical(authorized),action=this.frame.actions?.find(entry=>root.PlayroomProtocol.canonical(entry.command)===key);
     if(action?.choice?.confirmation){this.openActionConfirmation(authorized,action);return false;}
    }
   }
   const result=this.command(command);if(!result||typeof result.then!=='function')return result;
   const pending=this.pendingCommand=Promise.resolve(result);
   return pending.finally(()=>{if(this.pendingCommand===pending)this.pendingCommand=null;});
  }
  openActionConfirmation(command,action){
   const origin=this.frame,revision=origin.projection.revision,Screen=root.PlayroomGameScreen;
   const content=Screen.actionConfirmationMarkup({confirmation:this.text(action.choice.confirmation),label:this.text(action.label),title:action.choice.title?this.text(action.choice.title):undefined});
   this.openHelpSurface({content,className:'',isCurrent:frame=>Number.isSafeInteger(revision)?revision===frame.projection.revision:frame===origin,onConfirm:()=>{
    const current=this.resolve(command);
    if(current)return this.send(current,true);
   }});
  }
  rulebook(frame=this.frame){
   const {metadata,resources,locale}=frame;
   const books=resources?.rulebooks;
   const document=books?.[locale]||books?.[frame.pack?.defaultLanguage]||metadata?.rulebook;
   return document?.sections?.length?document:null;
  }
  openRules(){
   const document=this.rulebook();if(!document)return;
   const Screen=root.PlayroomGameScreen;
   const resolve=value=>Array.isArray(value)?value.map(resolve):value&&typeof value==='object'?value.key||value.common?this.text(value):Object.fromEntries(Object.entries(value).map(([key,item])=>[key,resolve(item)])):value;
   const figures=this.frame.metadata?.catalog?.figures||[];
   const illustrate=id=>{
    const figure=figures.find(item=>item.id===id);
    return figure?root.PlayroomSDKRenderGraphic(figure.graphic,{text:this.text,resources:this.frame.resources}).outerHTML:'';
   };
   const book=resolve(document),view=root.PlayroomRulebookView,helpers={esc:Screen.esc,illustrate};
   const sections=view.render(book,helpers);
   const brief=book.brief?.sections?.length?view.render(book.brief,helpers):null;
   const content=view.reader({brief,sections,titles:book.sections.map(section=>section.title||'')},helpers);
   this.openHelpSurface({content:view.header()+content,className:'rulebook-modal'});
  }
  openHelp(){
   if(this.disposed||!this.frame)return;
   this.openHelpSurface(root.PlayroomGameScreen.cardHelpMarkup(this.host));
  }
  openResult(automatic=false){
   if(this.busy||!this.frame.result||this.frame.history?.reviewing)return;
   const Screen=root.PlayroomGameScreen,{state,viewer}=this.resultView;
   const content=Screen.resultMarkup({...this.resultView,canRematchStart:typeof this.restart==='function',returnAction:{command:'close-modal',label:'К полю',icon:'back'}});
   if(!content)return;
   const signal=this.openHelpSurface({content,className:'result-modal'});
   if(automatic&&signal)Screen.presentResultSound(this.resultOwner,state,viewer,(ids,pack)=>{
    void Promise.resolve(this.audio?.prepare?.(signal)).then(ready=>{
     if(ready!==false&&!signal.aborted)return this.audio?.batch?.(ids,pack,signal);
    }).catch(this.error);
   });
  }
  openHelpSurface({content,className,isCurrent=()=>true,onConfirm}){
   this.closeHelp();root.PlayroomGameMenu?.close({feedback:false});
   const Screen=root.PlayroomGameScreen,doc=this.host.ownerDocument,scope=this.identity+':'+this.frame.projection.viewer+':'+!!this.frame.history?.reviewing;
   const dialogs=new root.PlayroomDOM.ModalController({host:doc.getElementById('modal-root'),background:this.host});this.helpDialogs=dialogs;this.helpScope=scope;this.helpValid=isCurrent;
   const events=new root.AbortController();let cleanup=()=>{},frame=null;
   const valid=()=>!this.disposed&&this.helpScope===scope&&isCurrent(this.frame);
   frame=dialogs.open(`<div class="modal-backdrop"><section class="modal ${Screen.esc(className)}" data-ui-surface="${Screen.classifySurface(className)}" data-dialog-size="compact" role="dialog" aria-modal="true">${Screen.modalContent(content,{className})}</section></div>`,{mode:'push',valid,meta:{owner:'sdk-game-view'},onDispose:()=>{events.abort();cleanup();if(this.helpFrame===frame){this.helpFrame=null;this.helpScope=null;this.helpValid=null;}}});
   if(!frame){events.abort();this.closeHelp();return;}
   this.helpFrame=frame;
   const close=()=>{if(dialogs.isActive(frame))dialogs.close(frame,{reason:'dismiss'});};
   cleanup=Screen.bindSurfaceDismiss(frame.element,{isActive:()=>dialogs.isActive(frame),onDismiss:close});
   frame.element.addEventListener('click',event=>{
    if(onConfirm&&event.target.closest('[data-command="confirm-action"]')){
     event.preventDefault();event.stopPropagation();
     if(!dialogs.isActive(frame)||!valid())return;
     close();
     try{Promise.resolve(onConfirm()).catch(this.error);}catch(error){this.error(error);}
    }else if(event.target===frame.element||event.target.closest('[data-command="close-modal"],[data-surface-dismiss]')){event.preventDefault();event.stopPropagation();close();}
   },{signal:events.signal});
   frame.element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}},{signal:events.signal});
   const heading=frame.element.querySelector('.modal-head h2');if(heading){heading.id=frame.id+'-title';frame.element.querySelector('.modal').setAttribute('aria-labelledby',heading.id);}
   frame.element.querySelector('.modal-head button')?.focus({preventScroll:true});
   return events.signal;
  }
  closeHelp(){this.helpDialogs?.dispose();this.helpDialogs=null;this.helpFrame=null;this.helpScope=null;this.helpValid=null;}
  handleClick(event){
   const target=event.target.closest('[data-player-target],[data-player-panel-target]');
   if(target&&!event.defaultPrevented&&!target.closest('[data-sdk-player-choice]')){
    const player=Number(target.dataset.playerTarget??target.dataset.playerPanelTarget);
    if(this.playerTargets?.available(player).length){event.preventDefault();this.playerTargets.tap(player);return;}
   }
   const view=event.target.closest('[data-view-key]');
   if(view&&this.host.contains(view)&&!event.defaultPrevented){this.viewState[view.dataset.viewKey]=view.dataset.viewValue;this.update(this.frame);return;}
   const preference=event.target.closest('[data-view-preference]');if(preference){this.preferences[preference.dataset.viewPreference]=preference.dataset.viewValue;this.update(this.frame);return;}
   const action=event.target.closest('[data-action]:not([data-sdk-command])');
   if(action&&!action.disabled&&!this.frame.history?.reviewing){const command=this.resolve(JSON.parse(action.dataset.action));if(command){event.preventDefault();Promise.resolve(this.send(command)).catch(this.error);}return;}
   const button=event.target.closest('[data-command]');if(!button||button.disabled)return;
   if(button.dataset.command==='fullscreen'){const doc=this.host.ownerDocument;Promise.resolve(doc.fullscreenElement?doc.exitFullscreen():doc.documentElement.requestFullscreen()).catch(this.error);}
   else if(button.dataset.command==='card-help')this.openHelp();
   else if(button.dataset.command==='rules')this.openRules();
   else if(button.dataset.command==='result')this.openResult();
   else if(button.dataset.command==='result-replay'){this.closeHelp();this.hostCommand('result-replay');}
   else if(button.dataset.command==='rematch-start'&&this.restart){this.closeHelp();Promise.resolve(this.restart()).catch(this.error);}
   else this.hostCommand(button.dataset.command);
  }
  setReducedMotion(value){this.reduced=!!value;this.renderer?.setReducedMotion(this.reduced);if(this.reduced&&this.busy)this.cancelPresentation(this.pendingFrames.at(-1)||this.frame);}
  preview(value){this.renderer?.preview(value);}
  destroy(){if(this.disposed)return;this.disposed=true;this.presenting=false;this.playingPublicPlan=false;this.pendingFrames.length=0;this.presentationGeneration=(this.presentationGeneration||0)+1;this.feedback?.destroy();this.audio?.stop?.();this.closeHelp();root.PlayroomGameMenu?.close({feedback:false});this.playerTargets?.destroy();this.renderer?.destroy();this.renderer=null;this.host.removeEventListener('click',this.click);this.modalRoot.removeEventListener('click',this.click);root.removeEventListener('resize',this.resize);this.views.clear();}
 }
 function hostTemplate(host,markup){const template=host.ownerDocument.createElement('div');template.innerHTML=markup;return template;}
 root.PlayroomSDKGameView=GameView;
})(globalThis);
