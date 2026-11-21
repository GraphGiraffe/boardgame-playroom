if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const V=root.PlayroomViews,H=V.helpers,GameScreen=root.PlayroomGameScreen,Flow=root.PlayroomGameFlow,HandOverflow=root.PlayroomHandOverflow;
  function install(definition){
    const {manifest,view,styles,assets={}}=definition;
    if(!manifest||typeof manifest.id!=='string')throw Error(globalThis.PlayroomMessages.text("ui.shared-views.d7b67cfc3bd2"));
    if(manifest.execution==='isolated-v1'){
      const catalog=root.PlayroomCatalog[manifest.id];
      if(!V.get(manifest.id)||catalog?.version!==manifest.version)throw Error('PACK_VERSION_MISSING');
      return {manifest,catalog,rules:definition.rules||[],rulebook:definition.rulebook||null,sounds:catalog?.sounds??definition.sounds??{}};
    }
    if(typeof view!=='string'||typeof styles!=='string')throw Error(globalThis.PlayroomMessages.text("ui.shared-views.d7b67cfc3bd2"));
    if(!(root.PlayroomPacks||root.PlayroomAppBridge?.packs)?.isTrustedView(definition))throw Error('PACK_ISOLATED_REQUIRED');
    const catalog={[manifest.id]:manifest},scope={PlayroomMessages:root.PlayroomMessages,PlayroomViews:V,PlayroomComponents:root.PlayroomComponents,TabletopUI:root.TabletopUI,PlayroomCatalog:catalog,PlayroomPack:Object.freeze({id:manifest.id,version:manifest.version,asset:path=>{if(!Object.hasOwn(assets,path))throw Error(globalThis.PlayroomMessages.text("ui.shared-views.1d8d3c6abbb7"));return assets[path];}})};
    // A trusted view module executes here. The remote client receives authorized model facts, never the private Session.
    root.PlayroomPackLoader.execute(view,scope);
    let style=document.querySelector?.('style[data-shared-pack="'+manifest.id+'"]');
    if(!style){style=document.createElement('style');style.dataset.sharedPack=manifest.id;document.head.appendChild(style);}
    style.textContent=styles;
    return {manifest,catalog:catalog[manifest.id],rules:definition.rules||[],rulebook:definition.rulebook||null,sounds:definition.sounds||{}};
  }
  function mount(client,definition,{surface,readOnly=false,onExit=null,onContinueSeries=null,connected:initialConnected=true,onPresented=()=>{},onReviewed=()=>{},tableAvailable=()=>false,hostClockActions=()=>[]}={}){
    const pack=install(definition),app=document.getElementById('app'),modal=document.getElementById('modal-root');
    const dialogs=new root.PlayroomDOM.ModalController({host:modal,background:app});
    let sdkRenderer=null;const realtimeOff=client.transport?.subscribeRealtime?.(envelope=>{if(envelope.data?.kind==='sdk.preview')sdkRenderer?.preview(envelope.data.entries);});
    let viewState={},presentationTurn=null;
    let selected=null,connected=initialConnected,connectionNotice=!initialConnected,historyOpen=false,scrubFrame=null;
    let input=null,playerTargets=null,dialogOpen=false,ownedDialog=null,queuedDialog=null,dialogReturnCommand=null,pendingAction=null,renderedRevision=-1,destroyed=false,historyPause=null,historyReturnToResult=false;
    const flow=new Flow.GameFlow({options:()=>root.PlayroomAppBridge?.gameOptions?.(pack.manifest.id)||{},motion:root.PlayroomMotion.surface(()=>app.querySelector('.table-shell')),presentation:()=>({minimumVisibleMs:Flow.viewingTime(pack.manifest.capabilities,(controller.shown||client.snapshot)?.state)}),reducedMotion:()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false});
    root.PlayroomPublicSequence?.useExecutor(app,flow.executor);
    root.PlayroomPublicSequence?.setBaseline(app,client.snapshot?.state.scene?.plan?.id);
    let animationTicket=0,transitionActive=false,lastPresented=-1,lastReviewed=null,dragPlacement=null;
    let presentedWindow=null,renderedFrame=null,renderedLive=null,renderedDisplay=null,renderedInteractions=null,renderedSDKUsable=null,renderedFieldScene=null,renderedDisplayScene=null,renderedTransitionActive=null;
    const controller=new root.PlayroomGameScreenController({client,present:presentFrame,visible:()=>!document.hidden,report:error=>toast(globalThis.PlayroomMessages.error(error)),changed(){if(destroyed)return;settledRender();const status=controller.shown?.state.status||liveStatus;if(liveStatus==='playing'&&status==='finished')result(true);liveStatus=status;}});
    const stopMotion=()=>{dragPlacement=null;feedback.clear();animationTicket++;transitionActive=false;controller.cancel();flow.cancel();};
    const audio=root.PlayroomAppBridge?.audio;audio?.registerPack?.(pack.manifest.id,pack.sounds);
    const turnNotice=GameScreen.turnNotice({play:()=>{if(!audio?.busy)audio?.play?.(['turn'],pack.manifest.id);},reducedMotion:()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false});
    const playAudio=(ids,id,context)=>audio?.batch?audio.batch(ids,id,context):audio?.play?.(ids,id);
    const feedback=new root.PlayroomGameFeedback({fieldChanged:()=>render(true),motion:flow.motion,executor:flow.executor,mount:()=>app.querySelector('.table-shell'),play:playAudio,playAssetAnimation:(cue,context,mode)=>sdkRenderer?.playAssetAnimation(cue,context,mode)});
    feedback.start(client.snapshot?.events||[]);
    let liveStatus=client.snapshot?.state?.status||'playing';
    const toast=text=>root.PlayroomAppBridge?.toast?.(text);
    const usable=()=>!client.snapshot?.paused&&!readOnly&&connected&&!client.pending&&!transitionActive&&!controller.draining&&!controller.queue.length&&controller.shown?.revision===client.snapshot?.revision&&!historyOpen&&!dialogOpen&&!modal.children.length&&(client.snapshot?.viewer>=0||client.snapshot?.role==='table'&&client.snapshot?.actor>=0);
    const continuousInputUsable=()=>!client.snapshot?.paused&&!readOnly&&connected&&!historyOpen&&!dialogOpen&&!modal.children.length&&client.snapshot?.viewer>=0&&controller.shown?.viewer===client.snapshot.viewer;
    const reactionUsable=()=>!readOnly&&connected&&!client.snapshot?.paused&&!client.pending&&!historyOpen&&!dialogOpen&&!modal.children.length&&client.snapshot?.role==='player'&&client.snapshot?.viewer>=0;
    const independent=action=>reactionUsable()&&(client.snapshot.independentActions||[]).some(candidate=>root.PlayroomProtocol.canonical(candidate)===root.PlayroomProtocol.canonical(action));
    const available=()=>usable()?client.snapshot.actions:reactionUsable()?client.snapshot.independentActions||[]:[];
    const historyCount=()=>controller.history.count;
    const canHideField=s=>!readOnly&&connected&&s?.role==='player'&&s.viewer>=0&&surface!=='table'&&tableAvailable()&&s.state?.scene?.personalSurfaceAllowed!==false&&V.supports(s.game,'player');
    const historyPlayback=new root.PlayroomHistoryController.Playback({
      step:playStep,clock:root.PlayroomPresentationScheduler.clock,
      changed:mode=>GameScreen.historyPlaybackMode(app,mode,[feedback.player,sdkRenderer?.motionPlayer]),
      error:error=>{stopReplay();toast(root.PlayroomMessages.error(error));render();}
    });
    const stopReplay=()=>{historyPlayback.stop();if(historyOpen){feedback.clear();flow.cancel();transitionActive=false;}};
    const stopScrub=()=>{if(scrubFrame!==null)root.cancelAnimationFrame(scrubFrame);scrubFrame=null;};
    const eventText=s=>s.revision===0?globalThis.PlayroomMessages.text("ui.shared-views.03f70ecc37a6"):s.events?.at(-1)?.text||s.state?.events?.at(-1)?.text||'';
    function render(preserveLayout=false,historyPlayback=false){
      if(destroyed)return;
      const live=client.snapshot,source=historyOpen&&controller.history.frame?controller.history.frame:controller.shown||live;
      if(!source)return;
      const reviewing=historyOpen||readOnly;
      const modelProjection=reviewing?null:authorizedModel(source);
      const roster=!reviewing?root.PlayroomNetworkLibrary?.playersMetadata?.(source.sessionId):null;
      const s=historyOpen||readOnly?source:{...source,state:{...source.state,players:source.state.players.map((player,index)=>({...player,...(roster?roster.find(person=>person.playerIndex===index):root.PlayroomNetworkLibrary?.playerMetadata?.(source.sessionId,index))}))}};
      if(s.packVersion!==pack.manifest.version||s.game!==pack.manifest.id)throw Error(globalThis.PlayroomMessages.text("ui.shared-views.fcbf240b0c86"));
      // A personal surface is a connected network player's local preference.
      // Local/hotseat, archives and public Table/spectator screens keep their field.
      const roomContext=root.PlayroomNetworkLibrary?.inviteContext?.(),canStopRoom=!readOnly&&!historyOpen&&live.state.status==='playing'&&roomContext?.room?.ownerId===roomContext?.participantId;
      const hasTable=canHideField(s);
      const fieldHidden=hasTable&&!historyOpen&&H.viewPreferences(s.game,s.viewer).screenSurface==='player';
      const actual=s.viewer<0?'table':surface==='table'?'table':fieldHidden?'player':'combined';
      if(!V.supports(s.game,actual))throw Error(globalThis.PlayroomMessages.text("ui.shared-views.1691985a8ce7"));
      controller.selection=selected;
      const context=controller.context(s,{scope:pack.manifest.capabilities?.viewStateScope});
      selected=context.selected;viewState=context.viewState;
      const old=app.querySelector('.hand-track, .hand-cards, .hand-scroll'),scroll=old?.scrollLeft||0;
      const turn=s.state.players[s.state.turn],finished=s.state.status==='finished';
      const commands=source===live&&connected&&!readOnly&&!historyOpen&&!dialogOpen&&!live.paused?s.actions:available();
      // Independent commands come from the live snapshot; the displayed scene
      // stays on its presentation boundary until the queued transition completes.
      feedback.renderField=scene=>V.renderField(s.state,s.viewer,scene,{renderOwner:controller,surface:actual,viewState,presentationTurn:transitionActive?presentationTurn:null,preferences:controller.preferences(H.viewPreferences(s.game,s.viewer))});
      const regionSink=new Map();
      const displayScene=feedback.displayScene,fieldScene=feedback.fieldScene;
      const scene=V.render(s.state,s.viewer,commands,{renderOwner:controller,regionSink,displayScene,fieldScene,selected,viewState,replay:historyOpen||readOnly,presentationTurn:transitionActive?presentationTurn:null,preferences:controller.preferences(H.viewPreferences(s.game,s.viewer)),surface:actual,quickPlay:flow.quickPlay});
      const historyHTML=historyOpen?GameScreen.historyMarkup({minimum:controller.history.minimum,index:controller.history.requested??controller.history.index??historyCount(),count:historyCount(),caption:eventText(s),playing:historyPlayback.mode==='play',readOnly,newFrom:controller.history.boundary,turnStarts:live.state.timeline?.starts||[],roundStarts:(live.state.scene?.round?.starts||[]).map((revision,index)=>({revision,number:index+1}))}):'';
      const clockMenuActions=!readOnly&&!historyOpen?GameScreen.clockMenuActions(hostClockActions()):[];
      const markup=GameScreen.render({
        fragmentSink:regionSink,layoutId:s.sessionId,fieldToggle:hasTable?{hidden:fieldHidden}:null,network:true,revision:s.revision,gameName:historyOpen||readOnly?'История партии':pack.manifest.name,subtitle:'',
        state:s.state,viewer:s.viewer,actions:commands,scoreLabel:pack.catalog.scoreLabel||globalThis.PlayroomMessages.text("ui.shared-views.d7ab0767bbee"),
        playerBadge:(state,index)=>pack.catalog.playerBadge?.(state,index),
        scene,replay:historyOpen,busy:transitionActive,animationSpeed:flow.pace().mode,turnText:historyOpen?globalThis.PlayroomMessages.text("ui.shared-views.a92c2f3c7ff1"):readOnly?globalThis.PlayroomMessages.text("ui.shared-views.ef90e06de5f0"):finished?globalThis.PlayroomMessages.text("ui.shared-views.64f3ad19b9c6"):live.paused?globalThis.PlayroomMessages.text("ui.shared-views.65530fd463ea"):(s.reactionWindows||[s.reactionWindow]).some(w=>w?.protected)?globalThis.PlayroomMessages.text("ui.shared-views.2a3e6d5708df"):turn?globalThis.PlayroomMessages.text("ui.shared-views.6e352d281a89",{p0:String(turn.name)}):globalThis.PlayroomMessages.text("ui.shared-views.a353dfef7d2f"),
        turnExtra:historyOpen?'':globalThis.PlayroomMessages.text("ui.shared-views.e954f44bf49a",{p0:String(s.state.move+1),p1:String(s.viewer<0?(s.role==='table'?globalThis.PlayroomMessages.text("ui.shared-views.1508d1c8b4c0"):globalThis.PlayroomMessages.text("ui.shared-views.9ae566816505")):s.state.scene.players.some(person=>Array.isArray(person.hand))?'':'')}),
        extraMenuActions:[...clockMenuActions,...(canStopRoom?[{attrs:'data-net-action="stop-match"',label:'Остановить партию',name:'stop'}]:[])],historyHTML,historyCaption:eventText(s)||globalThis.PlayroomMessages.text("ui.shared-views.03f70ecc37a6"),readOnly,pause:!!live.paused,canPause:connected&&!client.pending&&live.viewer>=0,historyResult:live.state.status==='finished'&&!readOnly,roomAction:!readOnly?{attrs:'data-command="room"'}:null,footerText:eventText(s)||globalThis.PlayroomMessages.text("ui.shared-views.efcdf40bd477"),footerTitle:eventText(s)||globalThis.PlayroomMessages.text("ui.shared-views.efcdf40bd477"),
        statusExtra:client.pending&&client.deliveryError?("<button class=\"text-btn network-retry\" data-command=\"retry\">"+globalThis.PlayroomMessages.text("ui.shared-views.0c2b4e7e894e")+"</button>"):'',
        footerAction:readOnly?{command:'home',label:globalThis.PlayroomMessages.text("ui.shared-views.c7af5565fd83"),icon:'back'}:finished?{command:'rematch',label:globalThis.PlayroomMessages.text("ui.shared-views.b99497215cf0"),icon:'back'}:{command:'home',label:globalThis.PlayroomMessages.text("ui.shared-views.1fd4bffb137b"),icon:'back'}
      });
      root.PlayroomPublicSequence?.setMode(app,historyOpen?historyPlayback.mode:'live');
      feedback.restoreMetrics();
      const keptLayout=GameScreen.update(app,markup,{preserveLayout:preserveLayout===true,fragments:regionSink});
      if(pack.manifest.execution==='isolated-v1'){
        const container=app.querySelector('[data-sdk-player-scene]');
        // Cached history and archives already contain the authorized scene.
        // Their view needs only the frame identity and no live permissions.
        const projection=reviewing?{
          game:s.game,viewer:s.viewer,revision:s.revision,turn:s.state.turn,
          status:s.state.status,playerCount:s.state.players.length,actions:[],inputs:[]
        }:modelProjection;
        if(container){if(!sdkRenderer||sdkRenderer.root!==container){sdkRenderer?.destroy();sdkRenderer=new root.PlayroomSDKSceneRenderer(container,{onSelectionChanged:()=>root.PlayroomFirstTurnGuide?.selectionChanged(client),externalActions:commands=>root.PlayroomSDKSceneRenderer.externalActions(app,commands),scheduler:flow.executor.lane('sdk-scene'),planPlayer:flow.executor.track('sdk-scene'),playAudio,text:root.PlayroomLocalization.sceneText(()=>pack.catalog.locales,()=>root.PlayroomMessages.locale),command:async (command,context)=>{if(!usable()&&!(command.operation&&continuousInputUsable()))return false;const finite=root.PlayroomSDKSceneRenderer.offeredAction((authorizedModel(client.snapshot))?.actions,client.snapshot.actions,command);if(finite){const receipt=await submit(finite,false,context);return receipt?.ok===true;}const token=root.PlayroomFirstTurnGuide.capture(client,client.snapshot.viewer);const receipt=await client.send(command);if(receipt.ok)root.PlayroomFirstTurnGuide.committed(client,client.snapshot.viewer,command,token);if(!receipt.ok)toast(receipt.message);return receipt.ok;},preview:async(operation,command)=>{if(!continuousInputUsable())return;const transport=client.transport,packet={scope:client.snapshot.realtimeScope,data:{...command,operation}};return transport.realtime.length>=2?transport.realtime('preview',packet):transport.realtime({method:'preview',envelope:packet});},error:error=>toast(root.PlayroomMessages.error(error))});}if(!projection)throw Error('SDK_PROJECTION_MISSING');sdkRenderer.present({sessionId:s.sessionId,participants:s.state.players,ui:{externalMotion:!!(s.state.scene.anchoredLayout||s.state.scene.inventoryLayout),quickPlay:root.PlayroomAppBridge?.gameOptions?.().quickPlay===true,flipped:s.viewer===1,viewState:{...viewState},presentationTurn:transitionActive?presentationTurn:null,preferences:controller.preferences(H.viewPreferences(s.game,s.viewer))},metadata:pack.catalog.metadata,hostedTutorial:true,projection,scene:s.state.scene,resources:pack.catalog.resources,events:s.events,now:historyOpen||readOnly?s.now??0:client.snapshot.now??s.now??0,interaction:{blocked:!usable(),continuousInput:continuousInputUsable()},history:{reviewing:reviewing||!!client.snapshot?.paused,index:reviewing?s.revision:null,playback:historyPlayback}},{displayScene:feedback.sceneFor(s.state.scene,fieldScene||displayScene),shellActions:commands,reducedMotion:root.PlayroomAppBridge?.gameOptions?.().animationSpeed==='instant'});}
      }
      const next=app.querySelector('.hand-track, .hand-cards, .hand-scroll');if(next)next.scrollLeft=scroll;
      const historyPanel=app.querySelector('.history-panel');
      if(historyPanel)historyPanel.setAttribute('aria-busy',controller.history.frame&&controller.history.requested===null?'false':'true');
      if(!keptLayout)HandOverflow.sync(app);
      root.PlayroomPublicSequence?.useExecutor(app,flow.executor);if(!keptLayout)GameScreen.layoutScene(app);
      const shell=app.querySelector('.network-game');if(shell)shell.dataset.mode=historyOpen||readOnly?'history':'live';
      renderedRevision=s.revision;feedback.refresh();playerTargets?.refresh();
      renderedFieldScene=fieldScene;renderedDisplayScene=displayScene;renderedTransitionActive=transitionActive;
      renderedSDKUsable=usable();
      renderedFrame=source;renderedLive=live;renderedDisplay=s;renderedInteractions=source===live&&connected&&!readOnly&&!historyOpen&&!dialogOpen&&!live.paused;
      completeRender(s,live,modelProjection);
    }
    function authorizedModel(frame){return root.PlayroomProtocol.projectedModel(frame)||frame.state.sdkProjection||frame.state.modelProjection;}
    function syncInteraction(){if(destroyed)return;GameScreen.interactionState(app,{pending:!!client.pending,busy:!!client.pending||controller.busy||transitionActive});}
    function settledRender(){
      if(destroyed)return;
      const frame=historyOpen&&controller.history.frame?controller.history.frame:controller.shown||client.snapshot;
      // A checkpoint may have painted an inert field for the same revision.
      // The same SDK frame must repaint when the presentation queue drains
      // so live input controls receive the new interaction state.
      if((!sdkRenderer||renderedSDKUsable===usable())&&renderedFrame===frame&&renderedLive===client.snapshot&&renderedDisplay&&renderedFieldScene===feedback.fieldScene&&renderedDisplayScene===feedback.displayScene&&renderedTransitionActive===transitionActive&&renderedInteractions===(frame===client.snapshot&&connected&&!readOnly&&!historyOpen&&!dialogOpen&&!client.snapshot.paused))completeRender(renderedDisplay,client.snapshot,historyOpen||readOnly?null:authorizedModel(frame));
      else render();
    }
    function completeRender(s,live,modelProjection){
      syncInteraction();
      // Compact transport frames store the authorized model outside state.
      // The guide and renderer consume the same viewer-scoped reference.
      root.PlayroomFirstTurnGuide?.update({owner:client,state:s.state,modelProjection,viewer:s.viewer,actions:s.actions||[],ui:{selected,viewState},readSelection:()=>selected??sdkRenderer?.selectedEntityId()??null,busy:transitionActive||controller.draining,active:!readOnly&&connected&&!live.paused&&!historyOpen,replay:historyOpen||readOnly,bindTutorial:(guide,seen)=>sdkRenderer?.bindHostedTutorial(guide,seen)});
      if(historyOpen||!connected||readOnly)turnNotice.reset();
      else turnNotice.observe({sessionId:s.sessionId,revision:s.revision,turn:s.state.turn,viewer:s.viewer,status:s.state.status,paused:live.paused,active:!document.hidden&&!transitionActive&&!controller.draining&&s.revision===live.revision,mount:app});
      if(!document.hidden&&!transitionActive){
        if(historyOpen&&controller.history.frame&&lastReviewed!==s.revision){lastReviewed=s.revision;onReviewed(s.revision,s);}
        else if(!historyOpen&&!controller.draining&&lastPresented!==s.revision){lastPresented=s.revision;onPresented(s.revision);}
      }
      if(historyOpen&&controller.history.index<historyCount()){
        const button=app.querySelector('[data-command="history-close"]');if(button){button.title=globalThis.PlayroomMessages.text("ui.shared-views.0a8269149732");button.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.shared-views.0a8269149732"));}
      }
      if(!controller.draining&&!historyOpen&&!transitionActive)void acknowledgePresentation();
    }
    function show(content,className=''){
      if(destroyed)return null;
      if(className)pendingAction=null;
      if(ownedDialog?.state==='suspended'){
        queuedDialog={content,className};return null;
      }
      queuedDialog=null;
      dialogReturnCommand=document.activeElement?.dataset?.command;
      dialogOpen=true;input.cancel();playerTargets?.cancel();
      const template=document.createElement('template');template.innerHTML=content;
      const heading=template.content.querySelector('h1,h2'),title=heading?.textContent||globalThis.PlayroomMessages.text("ui.shared-views.0bf0fcb2ff78");const header=heading?.closest('.modal-head')?.outerHTML||GameScreen.modalHead(title);if(heading?.closest('.modal-head'))heading.closest('.modal-head').remove();else heading?.remove();
      const previous=ownedDialog,sessionId=client.snapshot.sessionId;ownedDialog=null;
      let releaseSurface=null;
      const frame=dialogs.open(`<div class="shared-modal-backdrop"><section class="modal ${GameScreen.esc(className)}" data-ui-surface="${GameScreen.classifySurface(className)}" role="dialog" aria-modal="true" aria-label="${GameScreen.esc(title)}">${GameScreen.modalContent(header+template.innerHTML,{className})}</section></div>`,{
        mode:previous&&dialogs.isActive(previous)?'replace':'push',
        valid:()=>!destroyed&&client.snapshot?.sessionId===sessionId,
        meta:{owner:'shared',kind:className||'action-confirmation',sessionId,dismiss:close},
        onDispose(reason,disposed){releaseSurface?.();if(ownedDialog===disposed){ownedDialog=null;queuedDialog=null;dialogOpen=false;pendingAction=null;}}
      });
      ownedDialog=frame;if(!frame){dialogOpen=false;return null;}
      releaseSurface=GameScreen.bindSurfaceDismiss(frame.element,{isActive:()=>dialogs.isActive(frame),onDismiss:close});
      return frame;
    }
    function clearDialog({reason='silent'}={}){
      if(!ownedDialog||!dialogs.isActive(ownedDialog))return false;
      return dialogs.close(ownedDialog,{reason});
    }
    function close(){
      const exitResult=readOnly&&!historyReturnToResult&&ownedDialog?.element.querySelector('.result-modal'),command=dialogReturnCommand;if(!clearDialog({reason:'back'}))return false;
      if(exitResult&&onExit){onExit();return true;}
      if(!dialogs.activeRoot()){settledRender();if(command)app.querySelector('[data-command="'+command+'"]')?.focus({preventScroll:true});}
      return true;
    }
    async function submit(action,confirmed=false,context={}){
      if(!usable()&&!independent(action))return;
      if(action.confirmation&&!confirmed){try{await client.flushLocalDraft?.();}catch(error){toast(globalThis.PlayroomMessages.error(error));return;}pendingAction={action,context,revision:client.snapshot.revision};show(GameScreen.actionConfirmationMarkup(action));return;}
      input.cancel();
      const guideViewer=client.snapshot.viewer,guideToken=root.PlayroomFirstTurnGuide?.capture(client,guideViewer);
      // Release geometry belongs to this device and the next exact revision.
      // Keep it by the UI, outside command envelopes and history.
      const release=context.playedEntity?{base:client.snapshot,context}:null;
      if(release)dragPlacement=release;
      try{
        const promise=controller.send(action);syncInteraction();
        const receipt=await promise;let selectionChanged=false;
        if(receipt.ok){root.PlayroomFirstTurnGuide?.committed(client,guideViewer,action,guideToken);if(!action.preserveSelection){selectionChanged=selected!==null;selected=null;}GameScreen.allowLayoutChange(app,context);}
        else if(!receipt.ignored)toast(receipt.message);
        if(selectionChanged)render(true);else settledRender();
        return receipt;
      }catch(error){toast(globalThis.PlayroomMessages.text("ui.shared-views.57c89972646e",{p0:String(globalThis.PlayroomMessages.error(error))}));render();}
      finally{
        if(release&&dragPlacement===release&&!client.pending&&client.snapshot.revision===release.base.revision)dragPlacement=null;
        syncInteraction();
      }
    }
    input=root.TabletopInput.attach({getSelected:()=>selected,canStart:source=>usable()&&!source.hasAttribute('data-sdk-target'),canSelect:source=>usable()&&!source.hasAttribute('data-sdk-target'),canCommit:source=>!source.hasAttribute('data-sdk-target')&&(usable()||independent(JSON.parse(source?.dataset.action||'null'))),select(value){selected=value;render();},commit(action,context){return submit(action,false,context);}});
    playerTargets=new root.PlayroomPlayerTarget({selected:()=>selected,actions:available,commit:action=>{void submit(action,true);},root:()=>app.querySelector('.table-shell')});
    function result(automatic=false){
      if(root.PlayroomPublicSequence?.defer(app,()=>result(automatic)))return;
      const snapshot=client.snapshot;if(snapshot?.state?.status!=='finished')return;
      show(GameScreen.resultMarkup({state:snapshot.state,viewer:snapshot.viewer,gameName:pack.manifest.name,scoreLabel:pack.catalog.scoreLabel||globalThis.PlayroomMessages.text("ui.shared-views.d7ab0767bbee"),network:true,series:snapshot.state.matchSeriesResult,canContinueSeries:!!onContinueSeries,...(readOnly?{returnAction:{command:"home",label:"Назад"}}:{})}),"result-modal");
      if(automatic===true&&!readOnly)GameScreen.presentResultSound(client,snapshot.state,snapshot.viewer,(ids,pack)=>audio?.play?.(ids,pack));
    }
    async function viewHistory(index,{animate=false,ready=null}={}){
      if(!historyOpen||!client.snapshot)return;
      const previous=controller.history.frame;
      controller.history.receive(client.snapshot);controller.history.open=true;
      app.querySelector('.history-panel')?.setAttribute('aria-busy','true');
      let result;try{result=await controller.history.seek(index,{skip:root.PlayroomGameScreenController.planningUpdate,ready});}catch(error){if(error.message==='HISTORY_FRAME_INVALID')throw Error(globalThis.PlayroomMessages.text("ui.shared-views.988d20a2c641"));throw error;}if(!result||destroyed||!historyOpen)return;
      const ticket=controller.history.ticket,change=animate?Flow.eventAction(previous,result):null;
      const shot=change?flow.capture({actor:change.actor,action:change.action,viewer:result.viewer,sceneModel:previous.state.scene,deferDepartures:true}):null;
      presentationTurn=previous?.state.turn??null;
      transitionActive=!!shot;
      if(change){
        feedback.start(previous.events||previous.state.events||[]);
        feedback.accept(result.events||result.state.events||[],result.cues||root.PlayroomTransition.soundCues(result.events||result.state.events||[],result.state,result.viewer),result.game,{initialScene:previous.state.scene,finalScene:result.state.scene,mode:flow.pace().mode,snapshot:shot,motion:(context,step)=>flow.play(step?.snapshot||shot,{draws:step?.draws??result.effects??[],transferOnly:step?.transferOnly,context}),defer:true});
      }
      // Mount the arrival checkpoint before the shared feedback starts moving cards.
      render(false,animate&&!!previous&&result.revision>previous.revision);
      if(change)await flow.present(()=>{feedback.next();return feedback.whenIdle();});
      if(animate)await Promise.all([root.PlayroomPublicSequence?.whenIdle(app),sdkRenderer?.motionPlayer?.whenIdle()]);
      if(ticket!==controller.history.ticket||!historyOpen||destroyed)return;transitionActive=false;render();
    }
    async function openHistory(index=historyCount()){
      if(historyOpen||destroyed)return;
      const live=client.snapshot,w=(live?.reactionWindows||[live?.reactionWindow]).find(w=>w?.owner===live?.viewer);
      if(!readOnly&&connected&&!live.paused&&w?.owner===live.viewer){
        if(client.pending)return;
        try{const receipt=await client.send({type:'session-pause',paused:true,expectedControlRevision:live.controlRevision||0});if(!receipt.ok){if(!receipt.ignored)toast(receipt.message);return;}historyPause=client.snapshot.controlRevision;}
        catch(error){toast(globalThis.PlayroomMessages.error(error));return;}
      }
      presentedWindow=null;stopScrub();stopReplay();stopMotion();input.cancel();playerTargets.cancel();feedback.clear();historyOpen=true;controller.history.open=true;controller.history.index=index;controller.history.requested=null;controller.history.frame=null;render();
      try{await viewHistory(controller.history.index);}catch(error){toast(globalThis.PlayroomMessages.error(error));await closeHistory();}
    }
    async function closeHistory(){
      if(!historyOpen)return;
      if(readOnly&&onExit&&!historyReturnToResult){onExit();return;}
      const returnToResult=historyReturnToResult;historyReturnToResult=false;
      controller.history.ticket++;stopScrub();stopReplay();historyOpen=false;controller.history.close();controller.history.frame=null;controller.history.index=null;controller.history.requested=null;selected=null;presentedWindow=null;
      const pausedByHistory=historyPause;historyPause=null;
      if(pausedByHistory!==null&&connected&&!client.pending&&client.snapshot.paused&&client.snapshot.controlRevision===pausedByHistory){
        try{const receipt=await client.send({type:'session-pause',paused:false,expectedControlRevision:pausedByHistory});if(!receipt.ok&&!receipt.ignored)toast(receipt.message);}catch(error){toast(globalThis.PlayroomMessages.error(error));}
      }
      if(destroyed)return;stopMotion();controller.shown=client.snapshot;controller.queued=controller.shown.revision;feedback.start(controller.shown.events||[]);render();if(returnToResult)result();
    }
    async function stepHistory(delta,kind='turn'){stopScrub();stopReplay();try{await viewHistory(root.PlayroomHistoryController.boundaryIndex(controller.history.requested??controller.history.index??historyCount(),historyCount(),kind==='round'?client.snapshot.state.scene?.round?.starts:client.snapshot.state.timeline?.starts,delta,controller.history.minimum));}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
    async function playStep(ready,first){
      await root.PlayroomPublicSequence?.whenIdle(app);
      if(!await ready()||!historyOpen||destroyed||document.hidden)return null;
      const index=controller.history.index??controller.history.minimum,count=historyCount();
      if(first&&index>=count&&count>controller.history.minimum)await viewHistory(controller.history.minimum,{ready});
      else{
        if(index>=count)return null;
        await viewHistory(index+1,{animate:true,ready});
      }
      return historyOpen&&controller.history.index<historyCount()?Math.max(100,flow.pace().settle):null;
    }
    async function action(command){
      if(command==='toggle-field'){const s=client.snapshot;if(canHideField(s)){const prefs=H.viewPreferences(s.game,s.viewer);H.viewPreferences(s.game,s.viewer,'screenSurface',prefs.screenSurface==='player'?'combined':'player');input.cancel();selected=null;render();}return;}
      if(command==='room'){root.PlayroomNetworkLibrary?.openRoom?.();return;}
      if(command==='pause'){if(!readOnly&&connected&&!client.pending&&!historyOpen&&client.snapshot?.viewer>=0){const receipt=await client.send({type:'session-pause',paused:!client.snapshot.paused,expectedControlRevision:client.snapshot.controlRevision||0});if(!receipt.ok)toast(receipt.message);render();}return;}
      switch(command){
        case 'close-modal':close();break;
        case 'confirm-action':{
          const todo=pendingAction;close();if(todo&&todo.revision===client.snapshot.revision)await submit(todo.action,true,todo.context);break;
        }
        case 'rematch':if(!readOnly&&client.snapshot?.state?.status==='finished')onExit?.({finished:true});break;
        case 'home':
          if(readOnly){onExit?.();break;}
          if(onExit)onExit({finished:client.snapshot?.state?.status==='finished'});
          else root.location.reload();
          break;
        case 'settings':root.PlayroomNetworkLibrary?.showSettings?.({sharedRules:true});break;
        case 'preferences':root.PlayroomAppBridge?.showSettings?.();break;
        case 'card-help':root.PlayroomAppBridge?.showCardHelp?.({present:show});break;
        case 'rules':{const game={presets:[],...(root.PlayroomAppBridge?.meta?.(pack.manifest.id)||{}),rules:pack.rules,rulebook:pack.rulebook};(dialogs.activeRoot()?.querySelector('[data-settings-screen]')?root.PlayroomAppBridge.openModal:show)(root.PlayroomRulebookView.header()+(root.PlayroomLobbyView?.gameRulesMarkup?.({...game,max:pack.manifest.maxPlayers||game.max},pack.manifest.settings||[],{rules:readOnly?null:root.PlayroomNetworkLibrary?.ruleContext?.(pack.manifest.id),presetSetting:pack.manifest.presetSetting,hasHands:!!pack.manifest.capabilities?.hands,firstPlayer:pack.manifest.capabilities?.firstPlayer!==false})||pack.rules.map(rule=>'<p>'+H.esc(rule)+'</p>').join('')),'rulebook-modal');break;}
        case 'fullscreen':
          if(root.PlayroomAppBridge?.fullscreen)await root.PlayroomAppBridge.fullscreen();else if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen({navigationUI:'hide'});break;
        case 'retry':{
          const receipt=await client.retry();if(!receipt.ok&&!receipt.ignored)toast(receipt.message);if(receipt.ok)selected=null;render();break;
        }
        case 'history':historyOpen?closeHistory():await openHistory();break;
        case 'result':result();break;
        case 'continue-series':await onContinueSeries?.();break;
        case 'result-replay':historyReturnToResult=true;close();await openHistory(0);break;
        case 'history-close':closeHistory();break;
        case 'replay-round-prev':await stepHistory(-1,'round');break;
        case 'replay-round-next':await stepHistory(1,'round');break;
        case 'replay-prev':await stepHistory(-1);break;
        case 'replay-next':await stepHistory(1);break;
        case 'replay-play':
          if(!historyOpen)break;
          if(historyPlayback.mode==='play'){historyPlayback.pause();break;}
          if(historyPlayback.mode==='pause'){historyPlayback.resume();break;}
          stopScrub();if(controller.history.requested!==null)controller.history.invalidate();
          historyPlayback.start(controller.history.index>=historyCount()?0:Math.max(100,flow.pace().settle));
          break;
      }
    }
    function click(event){
      if(event.target.closest('[data-surface-dismiss]'))return;
      const activeSurface=dialogs.activeRoot();if(!event.target.isConnected&&!event.target.closest('[data-game-menu-action]'))return;if(event.target.closest('#modal-root')&&!activeSurface?.contains(event.target))return;
      const dialog=event.target.closest('.shared-modal-backdrop');
      if(dialog&&(!ownedDialog||dialog!==ownedDialog.element||!dialogs.isActive(ownedDialog)))return;
      // A native SDK command may live outside the scene, such as in the
      // arena hand. Let its renderer deliver it through the shared client.
      if(event.target.closest('[data-sdk-command],[data-sdk-player-scene],[data-sdk-hand-owner],[data-sdk-dice-port],[data-sdk-player-choice]'))return;
      if(event.target.closest('[data-room-chat-open]'))return; // Application chat is outside the pack input contract.
      // Reader controls belong to the rulebook's document handler, not pack input.
      if(event.target.closest('[data-rulebook-mode],[data-rulebook-jump]'))return;
      const shortcut=event.target.closest('[data-quick-shortcut][data-command]');if(shortcut){event.stopImmediatePropagation();const child=shortcut.dataset.surfaceAction==='child'&&activeSurface?.contains(shortcut);if(shortcut.dataset.command!=='fullscreen'&&!child)root.PlayroomAppBridge?.closeModal?.(true);void action(shortcut.dataset.command).catch(error=>toast(globalThis.PlayroomMessages.error(error)));return;}
      if(event.target.closest('[data-shared-rules]')){event.stopImmediatePropagation();void action('rules');return;}
      if(!event.target.closest('.table-shell.network-game,.shared-modal-backdrop'))return;
      // Network controls use exactly the same DOM contract as local play, but
      // must NEVER be delivered to app.js's local Session handlers.
      if(event.target.closest('.player-target-menu'))return;
      event.stopPropagation();
      const target=event.target.closest('button,[data-player-target],[data-player-panel-target],[data-command],[data-action],[data-select]');
      if(!target||target.disabled)return;
      if(client.pending&&target.closest('.app-game-layout'))return;
      if(target.dataset.viewPreference){const s=controller.shown||client.snapshot;if(!controller.setPreference(target.dataset.viewPreference,target.dataset.viewValue))H.viewPreferences(s.game,s.viewer,target.dataset.viewPreference,target.dataset.viewValue);for(const key of Object.keys(viewState))delete viewState[key];controller.viewState=viewState;render();return;}
      if(target.dataset.viewKey){const {viewKey,viewValue}=target.dataset;if(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(viewKey)&&viewValue.length<=80){viewState[viewKey]=viewValue;render(target.dataset.viewLayout==='stable');}return;}
      const command=target.dataset.command;
      if(command){void action(command).catch(e=>toast(globalThis.PlayroomMessages.error(e)));return;}
      const accused=event.target.closest('[data-player-target],[data-player-panel-target]');
      if(accused&&(usable()||reactionUsable())){
        playerTargets.tap(Number(accused.dataset.playerTarget??accused.dataset.playerPanelTarget));
        return;
      }
      input.handleClick(event);
    }
    function historySliderInput(event){
      if(event.target.id!=='replay-range'||!event.target.closest('.table-shell.network-game'))return;
      event.stopPropagation();
      // Coalesce fast input into one request per animation frame. Immediately
      // invalidate older RPCs; only the newest allowed frame may be shown.
      controller.history.ticket++;
      stopReplay();controller.history.requested=Number(event.target.value);
      app.querySelector('.replay-badge')?.replaceChildren(document.createTextNode((Number(event.target.value)-controller.history.minimum)+' / '+(historyCount()-controller.history.minimum)));
      if(scrubFrame===null)scrubFrame=root.requestAnimationFrame(()=>{
        scrubFrame=null;void viewHistory(controller.history.requested).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
      });
    }
    function historySliderChange(event){
      const input=event.target;if(input.dataset.viewRange&&!input.disabled&&!client.pending&&input.closest('.table-shell.network-game')){event.stopPropagation();const choices=JSON.parse(input.dataset.choiceOptions),choice=choices[Number(input.value)];if(choice&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(input.dataset.viewRange)){viewState[input.dataset.viewRange]=String(choice.value);render();}return;}
      if(event.target.id!=='replay-range'||!event.target.closest('.table-shell.network-game'))return;
      event.stopPropagation();
      stopScrub();stopReplay();
      void viewHistory(Number(event.target.value)).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
    }
    function keydown(event){
      if(dialogOpen&&dialogs.isActive(ownedDialog)&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.target.matches?.('[data-player-target]')&&event.target.closest('.network-game')&&!event.target.closest('[data-sdk-player-choice]')&&['Enter',' '].includes(event.key)){
        event.preventDefault();event.stopPropagation();click({target:event.target,stopPropagation(){}});return;
      }
      if(!event.target.closest?.('.table-shell.network-game'))return;
      if(event.key==='Escape'&&historyOpen){event.preventDefault();event.stopPropagation();closeHistory();}
      if(historyOpen&&['ArrowLeft','ArrowRight'].includes(event.key)&&!event.target.matches('input,select')){
        event.preventDefault();event.stopPropagation();void stepHistory(event.key==='ArrowLeft'?-1:1);
      }
    }
    async function acknowledgePresentation(){
      const s=controller.shown,w=(s?.reactionWindows||[s?.reactionWindow]).find(w=>w?.owner===s?.viewer);
      if(!w||s.viewer!==w.owner||historyOpen||dialogOpen||document.hidden||!connected||s.paused||s.revision!==client.snapshot?.revision)return;
      const key=s.sessionId+':'+s.authorityEpoch+':'+w.id+':'+(s.controlRevision||0);
      if(presentedWindow===key)return;
      presentedWindow=key;
      try{const reply=await client.presentationReady?.(s);if(reply?.ok===false)presentedWindow=null;}
      catch(_){presentedWindow=null;}
    }
    async function presentFrame(previous,next,{show,current}){
      const change=Flow.eventAction(previous,next);
      const pending=dragPlacement;
      let release;
      if(pending&&next.revision>pending.base.revision){
        dragPlacement=null;
        const base=pending.base;
        if(previous?.revision===base.revision&&next.revision===base.revision+1&&
          next.sessionId===base.sessionId&&next.authorityEpoch===base.authorityEpoch&&
          next.viewer===base.viewer&&change?.actor===base.viewer)release=pending.context;
      }
      const planning=root.PlayroomGameScreenController.planningUpdate(previous,next);
      // Durable bot plans can accumulate while a public sequence is playing.
      // Keep every committed history revision, but paint only the newest ready
      // state between identical public plans/events. Never skip a new effect,
      // cue, viewer, pause or public presentation boundary.
      if(next.revision<client.snapshot.revision&&planning){
        show();return;
      }
      const shot=change&&!planning&&connected&&!document.hidden&&!dialogOpen?flow.capture({actor:change.actor,action:change.action,viewer:next.viewer,...release,sceneModel:previous?.state.scene,deferDepartures:true}):null;
      presentationTurn=previous?.state.turn;show();transitionActive=!!shot||!!change?.action?.closeAfter;
      input.invalidate();playerTargets.cancel();
      feedback.accept(next.events||[],next.cues||[],pack.manifest.id,{initialScene:previous?.state.scene,finalScene:next.state.scene,defer:true,silent:!connected||document.hidden,mode:flow.pace().mode,snapshot:shot,motion:shot?(context,step)=>flow.play(step?.snapshot||shot,{draws:step?.draws??(next.effects||[]).filter(effect=>effect.revision===next.revision),transferOnly:step?.transferOnly,context}):null});
      render();
      try{
        await flow.present(()=>{feedback.next();return feedback.whenIdle();});
        // A committed snapshot can arrive while its authored public plan is
        // still playing. Queue the next snapshot here, never in authority:
        // replacing the plan early cancels damage/death frames in bot-only play.
        await root.PlayroomPublicSequence?.whenIdle(app);
      }finally{if(current())transitionActive=false;}
    }
    function subscribe(){
      const live=client.snapshot;syncInteraction();controller.history.receive(live);
      if(!connected||client.recovering||document.hidden){stopMotion();controller.shown=live;controller.queued=live.revision;feedback.start(live.events||[]);render();return;}
      if(historyOpen){controller.shown=live;controller.queued=live.revision;render();return;}
      void controller.enqueue(live);
    }
    const modalObserver=new MutationObserver(()=>{
      if(destroyed)return;
      if(queuedDialog&&ownedDialog&&dialogs.isActive(ownedDialog)){const next=queuedDialog;show(next.content,next.className);return;}
      if(dialogs.activeRoot()){input.cancel();playerTargets.cancel();}
      else{
        // The registry owns inert/focus and cannot let a stale mount clear a
        // different owner's foreground screen.
        if(ownedDialog?.state==='disposed'){ownedDialog=null;queuedDialog=null;dialogOpen=false;pendingAction=null;}
        settledRender();
      }
    });
    modalObserver.observe(modal,{childList:true});
    const unsub=client.subscribe(subscribe);
    document.addEventListener('click',click,true);
    document.addEventListener('input',historySliderInput,true);
    document.addEventListener('change',historySliderChange,true);
    document.addEventListener('keydown',keydown,true);
    const resize=()=>{dragPlacement=null;flow.cancel();if(client.snapshot)render();};root.addEventListener('resize',resize);
    const onOptions=()=>{dragPlacement=null;flow.cancel();if(client.snapshot)render();};root.addEventListener('playroom:game-options',onOptions);const onLearning=event=>{if(client.snapshot?.game===event.detail?.game)render();};root.addEventListener('playroom:learning',onLearning);
    const visibility=()=>{if(document.hidden){dragPlacement=null;turnNotice.reset();stopReplay();feedback.clear();flow.cancel();}else if(!controller.draining)render();};document.addEventListener('visibilitychange',visibility);
    return {render,openHistory,showResult:result,setHistoryBoundary(value){if(controller.history.backfill(value,{origin:'backfill'}))render();},syncLive(){stopMotion();controller.shown=client.snapshot;controller.queued=controller.shown?.revision??-1;feedback.start(controller.shown?.events||[]);render();},get historyIndex(){return controller.history.index;},setConnected(value,{notice=!value}={}){if(connected!==value||connectionNotice!==notice){const lost=connected&&!value;connected=value;connectionNotice=notice;if(lost){presentedWindow=null;playerTargets.cancel();stopMotion();audio?.stop?.();}render();}},get historyOpen(){return historyOpen;},get selected(){return selected;},get revision(){return renderedRevision;},toast,
      destroy(){destroyed=true;sdkRenderer?.destroy();realtimeOff?.();controller.dispose();modalObserver.disconnect();dialogs.dispose();ownedDialog=null;queuedDialog=null;dialogOpen=false;pendingAction=null;stopScrub();stopReplay();stopMotion();playerTargets.destroy();feedback.destroy();controller.history.ticket++;root.PlayroomFirstTurnGuide?.stop(client);unsub?.();document.removeEventListener('click',click,true);document.removeEventListener('input',historySliderInput,true);document.removeEventListener('change',historySliderChange,true);document.removeEventListener('keydown',keydown,true);document.removeEventListener('visibilitychange',visibility);root.removeEventListener('resize',resize);root.removeEventListener('playroom:game-options',onOptions);root.removeEventListener('playroom:learning',onLearning);input.destroy();}};
  }
  root.PlayroomSharedViews={install,mount};
})(globalThis);
