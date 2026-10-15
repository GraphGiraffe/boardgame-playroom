(function(root){
  'use strict';
  const V=root.PlayroomViews,H=V.helpers,GameScreen=root.PlayroomGameScreen,Flow=root.PlayroomGameFlow,HandOverflow=root.PlayroomHandOverflow;
  function install(definition){
    const {manifest,view,styles,assets={}}=definition;
    if(!manifest||typeof manifest.id!=='string'||typeof view!=='string'||typeof styles!=='string')throw Error('Нет представления пака.');
    const catalog={[manifest.id]:manifest},scope={PlayroomViews:V,PlayroomComponents:root.PlayroomComponents,TabletopUI:root.TabletopUI,PlayroomCatalog:catalog,PlayroomPack:Object.freeze({id:manifest.id,version:manifest.version,asset:path=>{if(!Object.hasOwn(assets,path))throw Error('Ресурс отсутствует');return assets[path];}})};
    // A trusted view module executes here. The remote client does not receive Session or rules code.
    Function('globalThis','"use strict";\n'+view)(scope);
    let style=document.querySelector?.('style[data-shared-pack="'+manifest.id+'"]');
    if(!style){style=document.createElement('style');style.dataset.sharedPack=manifest.id;document.head.appendChild(style);}
    style.textContent=styles;
    return {manifest,catalog:catalog[manifest.id],rules:definition.rules||[],sounds:definition.sounds||{}};
  }
  function mount(client,definition,{surface,readOnly=false,onExit=null,connected:initialConnected=true,onPresented=()=>{},onReviewed=()=>{},tableAvailable=()=>false}={}){
    const pack=install(definition),app=document.getElementById('app'),modal=document.getElementById('modal-root');
    let viewState={},presentationTurn=null;
    let selected=null,connected=initialConnected,historyOpen=false,scrubFrame=null;
    let input=null,playerTargets=null,dialogOpen=false,ownedDialog=null,dialogReturnCommand=null,pendingAction=null,renderedRevision=-1,replayTimer=null,destroyed=false,historyPause=null;
    const flow=new Flow.GameFlow({options:()=>root.PlayroomAppBridge?.gameOptions?.()||{},motion:root.PlayroomMotion,presentation:()=>({minimumVisibleMs:Flow.viewingTime(pack.manifest.capabilities,(controller.shown||client.snapshot)?.state)}),reducedMotion:()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false});
    let animationTicket=0,transitionActive=false,lastPresented=-1,lastReviewed=null;
    let presentedWindow=null;
    const controller=new root.PlayroomGameScreenController({client,present:presentFrame,visible:()=>!document.hidden,report:error=>toast(error.message),changed(){if(destroyed)return;render();const status=controller.shown?.state.status||liveStatus;if(liveStatus==='playing'&&status==='finished')result();liveStatus=status;}});
    const stopMotion=()=>{animationTicket++;transitionActive=false;controller.cancel();flow.cancel();};
    const audio=root.PlayroomAppBridge?.audio;audio?.registerPack?.(pack.manifest.id,pack.sounds);
    const turnNotice=GameScreen.turnNotice({play:()=>audio?.play?.(['turn'],pack.manifest.id),reducedMotion:()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false});
    const feedback=new root.PlayroomGameFeedback({mount:()=>app.querySelector('.table-shell'),play:(ids,id)=>audio?.play?.(ids,id)});
    feedback.start(client.snapshot?.events||[]);
    let liveStatus=client.snapshot?.state?.status||'playing';
    const toast=text=>root.PlayroomAppBridge?.toast?.(text);
    const usable=()=>!client.snapshot?.paused&&!readOnly&&connected&&!client.pending&&!transitionActive&&!controller.draining&&!controller.queue.length&&controller.shown?.revision===client.snapshot?.revision&&!historyOpen&&!dialogOpen&&!modal.children.length&&(client.snapshot?.viewer>=0||client.snapshot?.role==='table'&&client.snapshot?.actor>=0);
    const historyCount=()=>controller.history.count;
    const canHideField=s=>!readOnly&&connected&&s?.role==='player'&&s.viewer>=0&&surface!=='table'&&tableAvailable()&&V.supports(s.game,'player');
    const stopReplay=()=>{clearTimeout(replayTimer);replayTimer=null;if(historyOpen){flow.cancel();transitionActive=false;}};
    const stopScrub=()=>{if(scrubFrame!==null)root.cancelAnimationFrame(scrubFrame);scrubFrame=null;};
    const eventText=s=>s.revision===0?'Начальная расстановка':s.events?.at(-1)?.text||s.state?.events?.at(-1)?.text||'';
    function render(){
      if(destroyed)return;
      const live=client.snapshot,source=historyOpen&&controller.history.frame?controller.history.frame:controller.shown||live;
      if(!source)return;
      const s=historyOpen||readOnly?source:{...source,state:{...source.state,players:source.state.players.map((player,index)=>({...player,...(root.PlayroomNetworkLibrary?.playerMetadata?.(source.sessionId,index)||{})}))}};
      if(s.packVersion!==pack.manifest.version||s.game!==pack.manifest.id)throw Error('Версия представления не совпадает с партией.');
      // A personal surface is a connected network player's local preference.
      // Local/hotseat, archives and public Table/spectator screens keep their field.
      const hasTable=canHideField(s);
      const fieldHidden=hasTable&&!historyOpen&&H.viewPreferences(s.game,s.viewer).screenSurface==='player';
      const actual=s.viewer<0?'table':surface==='table'?'table':fieldHidden?'player':'combined';
      if(!V.supports(s.game,actual))throw Error('Этот пак не поддерживает выбранный экран.');
      controller.selection=selected;
      const context=controller.context(s,{scope:pack.manifest.capabilities?.viewStateScope});
      selected=context.selected;viewState=context.viewState;
      const old=app.querySelector('.hand-track, .hand-cards, .hand-scroll'),scroll=old?.scrollLeft||0;
      const turn=s.state.players[s.state.turn],finished=s.state.status==='finished',current=usable();
      const scene=V.render(s.state,s.viewer,current?s.actions:[],{selected,viewState,presentationTurn:transitionActive?presentationTurn:null,preferences:H.viewPreferences(s.game,s.viewer),surface:actual,quickPlay:flow.quickPlay});
      const historyHTML=historyOpen?GameScreen.historyMarkup({index:controller.history.requested??controller.history.index??historyCount(),count:historyCount(),caption:eventText(s),playing:!!replayTimer,readOnly,newFrom:controller.history.boundary}):'';
      const markup=GameScreen.render({
        fieldToggle:hasTable?{hidden:fieldHidden}:null,network:true,revision:s.revision,gameName:pack.manifest.name,subtitle:'',
        state:s.state,viewer:s.viewer,actions:current?s.actions:[],scoreLabel:pack.catalog.scoreLabel||'очки',
        playerBadge:(state,index)=>pack.catalog.playerBadge?.(state,index),
        scene,replay:historyOpen,busy:transitionActive,animationSpeed:flow.pace().mode,turnText:historyOpen?'Просмотр истории':readOnly?'Сохранённая сетевая партия':!connected?'Связь потеряна · ожидаем подключение':finished?'Партия завершена':live.paused?'Пауза':(s.reactionWindows||[s.reactionWindow]).some(w=>w?.protected)?'Ожидаем объявления':turn?`Ходит ${turn.name}`:'Ожидание хода',
        turnExtra:historyOpen?`Ход ${controller.history.index} из ${historyCount()}`:`Ход ${s.state.move+1} · ${s.viewer<0?(s.role==='table'?'Публичный стол':'Зритель'):s.state.data.hands?(s.state.openHands?'Руки открыты':'Руки скрыты'):'Открытое поле'}`,
        historyHTML,historyCaption:eventText(s)||'Начальная расстановка',readOnly,pause:!!live.paused,canPause:connected&&!client.pending&&live.viewer>=0,historyResult:live.state.status==='finished'&&!readOnly,roomAction:!readOnly?{attrs:'data-command="room"'}:null,footerText:eventText(s)||'Новая партия',footerTitle:eventText(s)||'Новая партия',
        statusExtra:client.pending&&client.deliveryError?'<button class="text-btn network-retry" data-command="retry">Повторить отправку</button>':'',
        footerAction:readOnly?{command:'home',label:'К моим партиям',icon:'back'}:finished?{command:'rematch',label:'К комнате',icon:'back'}:{command:'home',label:'К играм',icon:'back'}
      });
      GameScreen.update(app,markup);
      const next=app.querySelector('.hand-track, .hand-cards, .hand-scroll');if(next)next.scrollLeft=scroll;
      const historyPanel=app.querySelector('.history-panel');
      if(historyPanel)historyPanel.setAttribute('aria-busy',controller.history.frame&&controller.history.requested===null?'false':'true');
      HandOverflow.sync(app);
      GameScreen.layoutScene(app);
      const shell=app.querySelector('.network-game');if(shell)shell.dataset.mode=historyOpen?'history':'live';
      renderedRevision=s.revision;feedback.refresh();playerTargets?.refresh();
      if(historyOpen||!connected||readOnly)turnNotice.reset();
      else turnNotice.observe({sessionId:s.sessionId,revision:s.revision,turn:s.state.turn,viewer:s.viewer,status:s.state.status,paused:live.paused,active:!document.hidden&&!transitionActive&&!controller.draining&&s.revision===live.revision,mount:app});
      if(!document.hidden&&!transitionActive){
        if(historyOpen&&controller.history.frame&&lastReviewed!==s.revision){lastReviewed=s.revision;onReviewed(s.revision,s);}
        else if(!historyOpen&&!controller.draining&&lastPresented!==s.revision){lastPresented=s.revision;onPresented(s.revision);}
      }
      if(historyOpen&&controller.history.index<historyCount()){
        const button=app.querySelector('[data-command="history-close"]');if(button){button.title='К текущему ходу';button.setAttribute('aria-label','К текущему ходу');}
      }
      if(!controller.draining&&!historyOpen&&!transitionActive)void acknowledgePresentation();
    }
    function show(content){
      dialogReturnCommand=document.activeElement?.dataset?.command;
      dialogOpen=true;input.cancel();playerTargets?.cancel();app.inert=true;
      const template=document.createElement('template');template.innerHTML=content;
      const heading=template.content.querySelector('h2'),title=heading?.textContent||'Информация';if(heading?.closest('.modal-head'))heading.closest('.modal-head').remove();else heading?.remove();
      modal.innerHTML=`<div class="shared-modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${GameScreen.esc(title)}">${GameScreen.modalContent(GameScreen.modalHead(title)+template.innerHTML)}</section></div>`;
      ownedDialog=modal.firstElementChild;
      modal.querySelector('button')?.focus();
    }
    function clearDialog(){
      // The mount owns only its own dialog. Another screen may already have
      // replaced it (for example app settings) when this mount is destroyed.
      if(ownedDialog?.parentNode===modal){ownedDialog.remove();if(!modal.children.length)app.inert=false;}
      ownedDialog=null;dialogOpen=false;pendingAction=null;
    }
    function close(){const command=dialogReturnCommand;clearDialog();render();if(command)app.querySelector('[data-command="'+command+'"]')?.focus();}
    async function submit(action,confirmed=false){
      if(!usable())return;
      if(action.confirmation&&!confirmed){pendingAction=action;show(`<h2>Подтверждение действия</h2><p class="lead">${H.esc(action.confirmation)}</p><button class="btn" data-command="confirm-action">${H.esc(action.label||'Подтвердить')}</button>`);return;}
      input.cancel();
      try{const promise=controller.send(action);render();const receipt=await promise;if(receipt.ok)selected=null;else if(!receipt.ignored)toast(receipt.message);
        // The authoritative snapshot already rendered the new scene; avoid
        // destroying its animation destination again on a delayed ACK.
        if(!transitionActive)render();}
      catch(error){toast(error.message+' Нажмите «Повторить отправку».');render();}
    }
    input=root.TabletopInput.attach({getSelected:()=>selected,canStart:usable,canSelect:usable,canCommit:usable,select(value){selected=value;render();},commit:submit});
    playerTargets=new root.PlayroomPlayerTarget({selected:()=>selected,actions:()=>usable()?client.snapshot.actions:[],commit:action=>{void submit(action,true);},root:()=>app.querySelector('.table-shell')});
    function result(){
      const snapshot=client.snapshot;if(snapshot?.state?.status!=='finished')return;
      show(GameScreen.resultMarkup({state:snapshot.state,viewer:snapshot.viewer,gameName:pack.manifest.name,scoreLabel:pack.catalog.scoreLabel||'очки',network:true}));
    }
    async function viewHistory(index,{animate=false}={}){
      if(!historyOpen||!client.snapshot)return;
      const previous=controller.history.frame;
      controller.history.receive(client.snapshot);controller.history.open=true;
      app.querySelector('.history-panel')?.setAttribute('aria-busy','true');
      let result;try{result=await controller.history.seek(index);}catch(error){if(error.message==='HISTORY_FRAME_INVALID')throw Error('Некорректная история.');throw error;}if(!result||destroyed||!historyOpen)return;
      const ticket=controller.history.ticket,change=animate?Flow.eventAction(previous,result):null;
      const shot=change?flow.capture({actor:change.actor,action:change.action,viewer:result.viewer}):null;
      transitionActive=!!shot;render();
      if(shot)await flow.play(shot,{draws:result.effects||[]});
      if(ticket!==controller.history.ticket||!historyOpen||destroyed)return;transitionActive=false;render();
    }
    async function openHistory(index=historyCount()){
      if(historyOpen||destroyed)return;
      const live=client.snapshot,w=(live?.reactionWindows||[live?.reactionWindow]).find(w=>w?.owner===live?.viewer);
      if(!readOnly&&connected&&!live.paused&&w?.owner===live.viewer){
        if(client.pending)return;
        try{const receipt=await client.send({type:'session-pause',paused:true,expectedControlRevision:live.controlRevision||0});if(!receipt.ok){if(!receipt.ignored)toast(receipt.message);return;}historyPause=client.snapshot.controlRevision;}
        catch(error){toast(error.message);return;}
      }
      presentedWindow=null;stopScrub();stopReplay();stopMotion();input.cancel();playerTargets.cancel();feedback.clear();historyOpen=true;controller.history.open=true;controller.history.index=index;controller.history.requested=null;controller.history.frame=null;render();
      try{await viewHistory(controller.history.index);}catch(error){toast(error.message);await closeHistory();}
    }
    async function closeHistory(){
      if(!historyOpen)return;
      if(readOnly&&onExit){onExit();return;}
      controller.history.ticket++;stopScrub();stopReplay();historyOpen=false;controller.history.close();controller.history.frame=null;controller.history.index=null;controller.history.requested=null;selected=null;presentedWindow=null;
      const pausedByHistory=historyPause;historyPause=null;
      if(pausedByHistory!==null&&connected&&!client.pending&&client.snapshot.paused&&client.snapshot.controlRevision===pausedByHistory){
        try{const receipt=await client.send({type:'session-pause',paused:false,expectedControlRevision:pausedByHistory});if(!receipt.ok&&!receipt.ignored)toast(receipt.message);}catch(error){toast(error.message);}
      }
      if(destroyed)return;stopMotion();controller.shown=client.snapshot;controller.queued=controller.shown.revision;feedback.start(controller.shown.events||[]);render();
    }
    async function stepHistory(delta){stopScrub();stopReplay();try{await viewHistory((controller.history.requested??controller.history.index??historyCount())+delta);}catch(error){toast(error.message);}}
    async function playStep(){
      if(!historyOpen||destroyed||document.hidden){stopReplay();render();return;}
      if((controller.history.index??0)>=historyCount()){stopReplay();render();return;}
      try{await viewHistory(controller.history.index+1,{animate:true});}catch(error){stopReplay();toast(error.message);render();return;}
      if(replayTimer)replayTimer=setTimeout(playStep,Math.max(100,flow.pace().settle));
    }
    async function action(command){
      if(command==='toggle-field'){const s=client.snapshot;if(canHideField(s)){const prefs=H.viewPreferences(s.game,s.viewer);H.viewPreferences(s.game,s.viewer,'screenSurface',prefs.screenSurface==='player'?'combined':'player');input.cancel();selected=null;render();}return;}
      if(command==='room'){root.PlayroomNetworkLibrary?.openRoom?.();return;}
      if(command==='pause'){if(!readOnly&&connected&&!client.pending&&!historyOpen&&client.snapshot?.viewer>=0){const receipt=await client.send({type:'session-pause',paused:!client.snapshot.paused,expectedControlRevision:client.snapshot.controlRevision||0});if(!receipt.ok)toast(receipt.message);render();}return;}
      switch(command){
        case 'close-modal':close();break;
        case 'confirm-action':{
          const todo=pendingAction;close();if(todo)await submit(todo,true);break;
        }
        case 'rematch':if(!readOnly&&client.snapshot?.state?.status==='finished')onExit?.({finished:true});break;
        case 'home':
          if(readOnly){onExit?.();break;}
          if(onExit)onExit();
          else root.location.reload();
          break;
        case 'settings':root.PlayroomNetworkLibrary?.showSettings?.({sharedRules:true});break;
        case 'preferences':root.PlayroomAppBridge?.showSettings?.();break;
        case 'rules':case 'card-help':show('<h2>Правила игры</h2>'+pack.rules.map(rule=>'<p>'+H.esc(rule)+'</p>').join(''));break;
        case 'fullscreen':
          if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();break;
        case 'retry':{
          const receipt=await client.retry();if(!receipt.ok&&!receipt.ignored)toast(receipt.message);if(receipt.ok)selected=null;render();break;
        }
        case 'history':historyOpen?closeHistory():await openHistory();break;
        case 'result':result();break;
        case 'result-replay':close();await openHistory(0);break;
        case 'history-close':closeHistory();break;
        case 'replay-prev':await stepHistory(-1);break;
        case 'replay-next':await stepHistory(1);break;
        case 'replay-play':
          stopScrub();controller.history.ticket++;controller.history.requested=null;
          if(replayTimer){stopReplay();render();break;}
          if(!historyOpen)break;
          if(controller.history.index>=historyCount())await viewHistory(0);
          replayTimer=setTimeout(playStep,Math.max(100,flow.pace().settle));render();break;
      }
    }
    function click(event){
      const shortcut=event.target.closest('[data-quick-shortcut][data-command]');if(shortcut){event.stopImmediatePropagation();root.PlayroomAppBridge?.closeModal?.(true);void action(shortcut.dataset.command).catch(error=>toast(error.message));return;}
      if(event.target.closest('[data-shared-rules]')){event.stopImmediatePropagation();root.PlayroomAppBridge?.closeModal?.(true);void action('rules');return;}
      if(!event.target.closest('.table-shell.network-game,.shared-modal-backdrop'))return;
      // Network controls use exactly the same DOM contract as local play, but
      // must NEVER be delivered to app.js's local Session handlers.
      if(event.target.closest('.player-target-menu'))return;
      event.stopPropagation();
      const target=event.target.closest('button,[data-player-target],[data-player-panel-target],[data-command],[data-action],[data-select]');
      if(!target||target.disabled)return;
      if(target.dataset.viewPreference){const s=controller.shown||client.snapshot;H.viewPreferences(s.game,s.viewer,target.dataset.viewPreference,target.dataset.viewValue);viewState={};render();return;}
      if(target.dataset.viewKey){const {viewKey,viewValue}=target.dataset;if(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(viewKey)&&viewValue.length<=80){viewState[viewKey]=viewValue;render();}return;}
      const command=target.dataset.command;
      if(command){void action(command).catch(e=>toast(e.message));return;}
      const accused=event.target.closest('[data-player-target],[data-player-panel-target]');
      if(accused&&usable()){
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
      app.querySelector('.replay-badge')?.replaceChildren(document.createTextNode(event.target.value+' / '+historyCount()));
      if(scrubFrame===null)scrubFrame=root.requestAnimationFrame(()=>{
        scrubFrame=null;void viewHistory(controller.history.requested).catch(error=>toast(error.message));
      });
    }
    function historySliderChange(event){
      if(event.target.id!=='replay-range'||!event.target.closest('.table-shell.network-game'))return;
      event.stopPropagation();
      stopScrub();stopReplay();
      void viewHistory(Number(event.target.value)).catch(error=>toast(error.message));
    }
    function keydown(event){
      if(dialogOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.target.matches?.('[data-player-target]')&&event.target.closest('.network-game')&&['Enter',' '].includes(event.key)){
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
      const shot=change&&connected&&!document.hidden&&!dialogOpen?flow.capture({actor:change.actor,action:change.action,viewer:next.viewer}):null;
      presentationTurn=previous?.state.turn;show();transitionActive=!!shot||!!change?.action?.closeAfter;
      input.cancel();playerTargets.cancel();
      feedback.accept(next.events||[],next.cues||[],pack.manifest.id,{silent:!connected||document.hidden,duration:Math.max(220,flow.pace().duration+200)});
      render();
      try{if(shot)await Promise.all([flow.play(shot,{draws:(next.effects||[]).filter(effect=>effect.revision===next.revision)}),feedback.whenIdle()]);
      else if(change?.action?.closeAfter)await Promise.all([flow.play(null),feedback.whenIdle()]);
      else await feedback.whenIdle();}finally{if(current())transitionActive=false;}
    }
    function subscribe(){
      const live=client.snapshot;controller.history.receive(live);
      if(!connected||client.recovering||document.hidden){stopMotion();controller.shown=live;controller.queued=live.revision;feedback.start(live.events||[]);render();return;}
      if(historyOpen){controller.shown=live;controller.queued=live.revision;render();return;}
      void controller.enqueue(live);
    }
    const modalObserver=new MutationObserver(()=>{if(destroyed)return;if(modal.children.length){input.cancel();playerTargets.cancel();}else if(!dialogOpen)render();});
    modalObserver.observe(modal,{childList:true});
    const unsub=client.subscribe(subscribe);
    document.addEventListener('click',click,true);
    document.addEventListener('input',historySliderInput,true);
    document.addEventListener('change',historySliderChange,true);
    document.addEventListener('keydown',keydown,true);
    const resize=()=>{flow.cancel();if(client.snapshot)render();};root.addEventListener('resize',resize);
    const onOptions=()=>{flow.cancel();if(client.snapshot)render();};root.addEventListener('playroom:game-options',onOptions);
    const visibility=()=>{if(document.hidden){turnNotice.reset();stopReplay();flow.cancel();}else if(!controller.draining)render();};document.addEventListener('visibilitychange',visibility);
    return {render,openHistory,setHistoryBoundary(value){if(controller.history.backfill(value,{origin:'backfill'}))render();},syncLive(){stopMotion();controller.shown=client.snapshot;controller.queued=controller.shown?.revision??-1;feedback.start(controller.shown?.events||[]);render();},get historyIndex(){return controller.history.index;},setConnected(value){if(connected!==value){connected=value;if(!value){presentedWindow=null;playerTargets.cancel();stopMotion();audio?.stop?.();}render();}},get historyOpen(){return historyOpen;},get selected(){return selected;},get revision(){return renderedRevision;},toast,
      destroy(){destroyed=true;controller.dispose();modalObserver.disconnect();clearDialog();stopScrub();stopReplay();stopMotion();playerTargets.destroy();feedback.destroy();controller.history.ticket++;unsub?.();document.removeEventListener('click',click,true);document.removeEventListener('input',historySliderInput,true);document.removeEventListener('change',historySliderChange,true);document.removeEventListener('keydown',keydown,true);document.removeEventListener('visibilitychange',visibility);root.removeEventListener('resize',resize);root.removeEventListener('playroom:game-options',onOptions);input.destroy();}};
  }
  root.PlayroomSharedViews={install,mount};
})(globalThis);
