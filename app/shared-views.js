(function(root){
  'use strict';
  const V=root.PlayroomViews,H=V.helpers,GameScreen=root.PlayroomGameScreen,Flow=root.PlayroomGameFlow,HandOverflow=root.PlayroomHandOverflow;
  function install(definition){
    const {manifest,view,styles,assets={}}=definition;
    if(!manifest||typeof manifest.id!=='string'||typeof view!=='string'||typeof styles!=='string')throw Error('Нет представления пака.');
    const catalog={[manifest.id]:manifest},scope={PlayroomViews:V,TabletopUI:root.TabletopUI,PlayroomCatalog:catalog,PlayroomPack:Object.freeze({id:manifest.id,version:manifest.version,asset:path=>{if(!Object.hasOwn(assets,path))throw Error('Ресурс отсутствует');return assets[path];}})};
    // A trusted view module executes here. The remote client does not receive Session or rules code.
    Function('globalThis','"use strict";\n'+view)(scope);
    const style=document.createElement('style');style.dataset.sharedPack=manifest.id;style.textContent=styles;document.head.appendChild(style);
    return {manifest,catalog:catalog[manifest.id],rules:definition.rules||[],sounds:definition.sounds||{}};
  }
  function mount(client,definition,{surface,readOnly=false,onExit=null}={}){
    const pack=install(definition),app=document.getElementById('app'),modal=document.getElementById('modal-root');
    let selected=null,connected=true,historyOpen=false,historyIndex=null,historyRequested=null,historySnapshot=null,historyTicket=0,scrubFrame=null;
    let input=null,playerTargets=null,dialogOpen=false,ownedDialog=null,dialogReturnCommand=null,pendingAction=null,renderedRevision=-1,replayTimer=null,destroyed=false;
    const flow=new Flow.GameFlow({options:()=>root.PlayroomAppBridge?.gameOptions?.()||{},motion:root.PlayroomMotion,reducedMotion:()=>root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches||false});
    let shownLive=client.snapshot,animationTicket=0,transitionActive=false;
    const stopMotion=()=>{animationTicket++;transitionActive=false;flow.cancel();};
    const audio=root.PlayroomAppBridge?.audio;audio?.registerPack?.(pack.manifest.id,pack.sounds);
    const feedback=new root.PlayroomGameFeedback({mount:()=>app.querySelector('.table-shell'),play:(ids,id)=>audio?.play?.(ids,id)});
    feedback.start(client.snapshot?.events||[]);
    let liveStatus=client.snapshot?.state?.status||'playing';
    const drawNotice=document.getElementById('toast');
    let toastTimer;
    const toast=text=>{clearTimeout(toastTimer);drawNotice.textContent=text;drawNotice.classList.add('show');toastTimer=setTimeout(()=>{drawNotice.textContent='';drawNotice.classList.remove('show');},4000);};
    const usable=()=>!client.snapshot?.paused&&!readOnly&&connected&&!client.pending&&!transitionActive&&!historyOpen&&!dialogOpen&&!modal.children.length&&client.snapshot?.viewer>=0;
    const historyCount=()=>Math.max(0,(client.snapshot?.historyLength||1)-1);
    const stopReplay=()=>{clearTimeout(replayTimer);replayTimer=null;};
    const stopScrub=()=>{if(scrubFrame!==null)root.cancelAnimationFrame(scrubFrame);scrubFrame=null;};
    const eventText=s=>s.events?.at(-1)?.text||s.state?.events?.at(-1)?.text||'';
    function render(){
      if(destroyed)return;
      const live=client.snapshot,s=historyOpen&&historySnapshot?historySnapshot:live;
      if(!s)return;
      if(s.packVersion!==pack.manifest.version||s.game!==pack.manifest.id)throw Error('Версия представления не совпадает с партией.');
      // A player uses the SAME combined scene as local bots/hot seat, not the reduced player surface.
      // The table is public, and only the server's projected state may be rendered.
      const actual=s.viewer<0?'table':surface==='table'?'table':'combined';
      if(!V.supports(s.game,actual))throw Error('Этот пак не поддерживает выбранный экран.');
      const hand=s.state.data.hands?.[s.viewer];
      if(selected!==null&&hand&&!hand.some(c=>c.id===selected))selected=null;
      const old=app.querySelector('.hand-track, .hand-cards, .hand-scroll'),scroll=old?.scrollLeft||0;
      const turn=s.state.players[s.state.turn],finished=s.state.status==='finished',current=usable();
      const scene=V.render(s.state,s.viewer,current?s.actions:[],{selected,surface:actual,quickPlay:flow.quickPlay});
      const historyHTML=historyOpen?GameScreen.historyMarkup({index:historyRequested??historyIndex??historyCount(),count:historyCount(),caption:eventText(s),playing:!!replayTimer,readOnly}):'';
      const markup=GameScreen.render({
        network:true,revision:live.revision,gameName:pack.manifest.name,subtitle:'',
        state:s.state,viewer:s.viewer,actions:current?s.actions:[],scoreLabel:pack.catalog.scoreLabel||'очки',
        playerBadge:(state,index)=>pack.catalog.playerBadge?.(state,index),
        scene,replay:historyOpen,busy:transitionActive,animationSpeed:flow.pace().mode,turnText:historyOpen?'Просмотр истории':readOnly?'Сохранённая сетевая партия':!connected?'Связь потеряна · ожидаем подключение':finished?'Партия завершена':live.paused?'Пауза':turn?`Ходит ${turn.name}`:'Ожидание хода',
        turnExtra:historyOpen?`Ход ${historyIndex} из ${historyCount()}`:`Ход ${s.state.move+1} · ${s.viewer<0?'Публичный стол':s.state.data.hands?(s.state.openHands?'Руки открыты':'Руки скрыты'):'Открытое поле'}`,
        historyHTML,readOnly,pause:!!live.paused,canPause:connected&&!client.pending&&live.viewer>=0,historyResult:live.state.status==='finished'&&!readOnly,footerText:eventText(s)||'Новая партия',footerTitle:eventText(s)||'Новая партия',
        footerExtra:client.pending?'<button class="text-btn network-retry" data-command="retry">Повторить отправку</button>':'',
        footerAction:readOnly?{command:'home',label:'К моим партиям',icon:'back'}:finished?{command:'home',label:'К комнате',icon:'back'}:{command:'home',label:'К играм',icon:'back'}
      });
      if(historyOpen&&app.querySelector('.network-game .history-panel')){
        // Keep the actual range element, its focus and native pointer gesture.
        // Only read-only frame content and control labels change during replay.
        const template=document.createElement('template');template.innerHTML=markup;
        app.querySelector('.network-game').dataset.revision=String(live.revision);
        const sceneNode=app.querySelector('.scene');sceneNode.setAttribute('aria-busy',String(!!transitionActive));sceneNode.dataset.animationSpeed=flow.pace().mode;
        for(const selector of ['.scene','.table-status','.history-caption']){
          app.querySelector(selector).replaceChildren(...template.content.querySelector(selector).childNodes);
        }
        app.querySelector('.replay-badge').textContent=template.content.querySelector('.replay-badge').textContent;
        app.querySelector('.replay-badge').setAttribute('aria-label',template.content.querySelector('.replay-badge').getAttribute('aria-label'));
        const range=app.querySelector('#replay-range');range.max=String(historyCount());range.value=String(historyRequested??historyIndex??historyCount());
        for(const command of ['replay-prev','replay-play','replay-next']){
          const selector='[data-command="'+command+'"]',button=app.querySelector(selector),next=template.content.querySelector(selector);
          button.disabled=next.disabled;button.innerHTML=next.innerHTML;button.setAttribute('aria-label',next.getAttribute('aria-label'));
        }
      }else app.innerHTML=markup;
      const next=app.querySelector('.hand-track, .hand-cards, .hand-scroll');if(next)next.scrollLeft=scroll;
      const historyPanel=app.querySelector('.history-panel');
      if(historyPanel)historyPanel.setAttribute('aria-busy',historySnapshot&&historyRequested===null?'false':'true');
      HandOverflow.sync(app);
      GameScreen.layoutScene(app);
      renderedRevision=live.revision;feedback.refresh();playerTargets?.refresh();
    }
    function show(content){
      dialogReturnCommand=document.activeElement?.dataset?.command;
      dialogOpen=true;input.cancel();playerTargets?.cancel();app.inert=true;
      const template=document.createElement('template');template.innerHTML=content;
      const heading=template.content.querySelector('h2'),title=heading?.textContent||'Информация';if(heading?.closest('.modal-head'))heading.closest('.modal-head').remove();else heading?.remove();
      modal.innerHTML=`<div class="shared-modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="${GameScreen.esc(title)}">${GameScreen.modalHead(title)}${template.innerHTML}</section></div>`;
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
      try{const promise=client.send(action);render();const receipt=await promise;if(receipt.ok)selected=null;else toast(receipt.message);
        // The authoritative snapshot already rendered the new scene; avoid
        // destroying its animation destination again on a delayed ACK.
        if(!transitionActive)render();}
      catch(error){toast(error.message+' Нажмите «Повторить отправку».');render();}
    }
    input=root.TabletopInput.attach({getSelected:()=>selected,canStart:usable,canSelect:usable,canCommit:usable,select(value){selected=value;render();},commit:submit});
    playerTargets=new root.PlayroomPlayerTarget({actions:()=>usable()?client.snapshot.actions:[],commit:action=>{void submit(action,true);},root:()=>app.querySelector('.table-shell')});
    function result(){if(client.snapshot?.state?.status==='finished')show(GameScreen.resultMarkup({state:client.snapshot.state,viewer:client.snapshot.viewer,gameName:pack.manifest.name,scoreLabel:pack.catalog.scoreLabel||'очки',network:true}));}
    async function viewHistory(index){
      if(!historyOpen||!client.snapshot)return;
      const pos=Math.min(Math.max(0,index),historyCount()),ticket=++historyTicket;
      historyRequested=pos;app.querySelector('.history-panel')?.setAttribute('aria-busy','true');
      let result;
      try{result=await client.history(pos);}catch(error){if(ticket!==historyTicket||!historyOpen||destroyed)return;historyRequested=null;render();throw error;}
      if(ticket!==historyTicket||!historyOpen||destroyed)return;
      historyRequested=null;
      if(result.kind!=='history'||result.viewer!==client.snapshot.viewer||result.sessionId!==client.snapshot.sessionId||result.authorityEpoch!==client.snapshot.authorityEpoch||result.revision>client.snapshot.revision){render();throw Error('Некорректная история.');}
      historyIndex=pos;historySnapshot=result;render();
    }
    async function openHistory(index=historyCount()){
      stopScrub();stopReplay();stopMotion();input.cancel();playerTargets.cancel();feedback.clear();historyOpen=true;historyIndex=index;historyRequested=null;historySnapshot=null;render();
      try{await viewHistory(historyIndex);}catch(error){historyOpen=false;toast(error.message);render();}
    }
    function closeHistory(){if(readOnly&&onExit){onExit();return;}historyTicket++;stopScrub();stopReplay();historyOpen=false;historySnapshot=null;historyIndex=null;historyRequested=null;selected=null;render();}
    async function stepHistory(delta){stopScrub();stopReplay();try{await viewHistory((historyRequested??historyIndex??historyCount())+delta);}catch(error){toast(error.message);}}
    async function playStep(){
      if(!historyOpen||destroyed||document.hidden){stopReplay();render();return;}
      if((historyIndex??0)>=historyCount()){stopReplay();render();return;}
      try{await viewHistory(historyIndex+1);}catch(error){stopReplay();toast(error.message);render();return;}
      if(replayTimer)replayTimer=setTimeout(playStep,650);
    }
    async function action(command){
      if(command==='room'){root.PlayroomNetworkLibrary?.openRoom?.();return;}
      if(command==='pause'){if(!readOnly&&connected&&!client.pending&&!historyOpen&&client.snapshot?.viewer>=0){const receipt=await client.send({type:'session-pause',paused:!client.snapshot.paused,expectedControlRevision:client.snapshot.controlRevision||0});if(!receipt.ok)toast(receipt.message);render();}return;}
      switch(command){
        case 'close-modal':close();break;
        case 'confirm-action':{
          const todo=pendingAction;close();if(todo)await submit(todo,true);break;
        }
        case 'home':
          if(readOnly){onExit?.();break;}
          if(client.snapshot?.state?.status==='finished'||root.confirm('Покинуть сетевую партию? Сохранение останется в «Моих партиях».')){
            if(onExit)onExit({finished:client.snapshot?.state?.status==='finished'});
            else root.location.reload();
          }
          break;
        case 'settings':show('<h2>Настройки</h2><button class="btn secondary" data-command="rules">Правила игры</button><button class="btn secondary" data-command="fullscreen">На весь экран</button><button class="btn secondary" data-command="preferences">Настройки устройства</button>');break;
        case 'preferences':root.PlayroomAppBridge?.showSettings?.();break;
        case 'rules':case 'card-help':show('<h2>Правила игры</h2>'+pack.rules.map(rule=>'<p>'+H.esc(rule)+'</p>').join(''));break;
        case 'fullscreen':
          if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();break;
        case 'retry':{
          const receipt=await client.retry();toast(receipt.ok?'Ход подтверждён.':receipt.message);if(receipt.ok)selected=null;render();break;
        }
        case 'history':historyOpen?closeHistory():await openHistory();break;
        case 'result':result();break;
        case 'result-replay':close();await openHistory(0);break;
        case 'history-close':closeHistory();break;
        case 'replay-prev':await stepHistory(-1);break;
        case 'replay-next':await stepHistory(1);break;
        case 'replay-play':
          stopScrub();historyTicket++;historyRequested=null;
          if(replayTimer){stopReplay();render();break;}
          if(!historyOpen)break;
          if(historyIndex>=historyCount())await viewHistory(0);
          replayTimer=setTimeout(playStep,650);render();break;
      }
    }
    function click(event){
      if(!event.target.closest('.table-shell.network-game,.shared-modal-backdrop'))return;
      // Network controls use exactly the same DOM contract as local play, but
      // must NEVER be delivered to app.js's local Session handlers.
      if(event.target.closest('.player-target-menu'))return;
      event.stopPropagation();
      const target=event.target.closest('button,[data-player-target],[data-player-panel-target],[data-command],[data-action],[data-select]');
      if(!target||target.disabled)return;
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
      historyTicket++;
      stopReplay();historyRequested=Number(event.target.value);
      app.querySelector('.replay-badge')?.replaceChildren(document.createTextNode(event.target.value+' / '+historyCount()));
      if(scrubFrame===null)scrubFrame=root.requestAnimationFrame(()=>{
        scrubFrame=null;void viewHistory(historyRequested).catch(error=>toast(error.message));
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
    function subscribe(){
      const live=client.snapshot,previous=shownLive,was=liveStatus;
      // A new authoritative revision is the sole animation trigger. Never
      // animate an ACK retry, history frame, resize or same-revision snapshot.
      const change=Flow.eventAction(previous,live);
      stopMotion();
      const shot=change&&!historyOpen&&connected&&!document.hidden&&!dialogOpen
        ?flow.capture({actor:change.actor,action:change.action,viewer:live.viewer}):null;
      shownLive=live;liveStatus=live?.state?.status||liveStatus;
      feedback.accept(live?.events||[],live?.cues||[],pack.manifest.id,{silent:historyOpen||!connected||document.hidden});
      if(historyOpen){render();return;}
      input.cancel();playerTargets.cancel();transitionActive=!!shot;render();
      const after=()=>{if(was==='playing'&&liveStatus==='finished')result();};
      if(!shot){after();return;}
      const ticket=++animationTicket;
      const draws=(live.effects||[]).filter(effect=>effect.revision===live.revision);
      void flow.play(shot,{draws}).then(()=>{
        if(destroyed||ticket!==animationTicket)return;
        transitionActive=false;render();after();
      }).catch(error=>{if(ticket!==animationTicket||destroyed)return;
        transitionActive=false;render();toast(error.message||'Анимация не воспроизведена');after();});
    }
    const unsub=client.subscribe(subscribe);
    document.addEventListener('click',click,true);
    document.addEventListener('input',historySliderInput,true);
    document.addEventListener('change',historySliderChange,true);
    document.addEventListener('keydown',keydown,true);
    const resize=()=>{stopMotion();if(client.snapshot)render();};root.addEventListener('resize',resize);
    const onOptions=()=>{stopMotion();if(client.snapshot)render();};root.addEventListener('playroom:game-options',onOptions);
    const visibility=()=>{if(document.hidden){stopReplay();stopMotion();}};document.addEventListener('visibilitychange',visibility);
    return {render,openHistory,setConnected(value){if(connected!==value){connected=value;if(!value){playerTargets.cancel();stopMotion();audio?.stop?.();}render();}},get selected(){return selected;},get revision(){return renderedRevision;},toast,
      destroy(){destroyed=true;clearDialog();stopScrub();stopReplay();stopMotion();playerTargets.destroy();feedback.destroy();clearTimeout(toastTimer);historyTicket++;unsub?.();document.removeEventListener('click',click,true);document.removeEventListener('input',historySliderInput,true);document.removeEventListener('change',historySliderChange,true);document.removeEventListener('keydown',keydown,true);document.removeEventListener('visibilitychange',visibility);root.removeEventListener('resize',resize);root.removeEventListener('playroom:game-options',onOptions);input.destroy();}};
  }
  root.PlayroomSharedViews={install,mount};
})(globalThis);
