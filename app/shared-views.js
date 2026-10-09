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
    let selected=null,connected=true,historyOpen=false,historyIndex=null,historySnapshot=null,historyTicket=0;
    let input=null,playerTargets=null,dialogOpen=false,pendingAction=null,renderedRevision=-1,replayTimer=null,destroyed=false;
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
    const usable=()=>!readOnly&&connected&&!client.pending&&!transitionActive&&!historyOpen&&!dialogOpen&&!modal.children.length&&client.snapshot?.viewer>=0;
    const historyCount=()=>Math.max(0,(client.snapshot?.historyLength||1)-1);
    const stopReplay=()=>{clearTimeout(replayTimer);replayTimer=null;};
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
      const historyHTML=historyOpen?GameScreen.historyMarkup({index:historyIndex??historyCount(),count:historyCount(),caption:eventText(s),playing:!!replayTimer}):'';
      app.innerHTML=GameScreen.render({
        network:true,revision:live.revision,gameName:pack.manifest.name,subtitle:'Сетевая партия · '+(s.viewer<0?'Общий стол':'За столом вместе'),
        state:s.state,viewer:s.viewer,actions:current?s.actions:[],scoreLabel:pack.catalog.scoreLabel||'очки',
        playerBadge:(state,index)=>pack.catalog.playerBadge?.(state,index),
        scene,replay:historyOpen,busy:transitionActive,animationSpeed:flow.pace().mode,turnText:historyOpen?'Просмотр истории':readOnly?'Сохранённая сетевая партия':!connected?'Связь потеряна · ожидаем подключение':finished?'Партия завершена':turn?`Ходит ${turn.name}`:'Ожидание хода',
        turnExtra:historyOpen?`Ход ${historyIndex} из ${historyCount()}`:`Ход ${s.state.move+1} · ${s.viewer<0?'Публичный стол':s.state.data.hands?(s.state.openHands?'Руки открыты':'Руки скрыты'):'Открытое поле'}`,
        historyHTML,footerText:eventText(s)||'Новая партия',footerTitle:eventText(s)||'Новая партия',
        footerExtra:client.pending?'<button class="text-btn network-retry" data-command="retry">Повторить отправку</button>':'',
        footerAction:readOnly?{command:'home',label:'К моим партиям',icon:'back'}:finished?{command:'result',label:'Результаты',icon:'arrow'}:{command:'home',label:'К играм',icon:'back'}
      });
      const next=app.querySelector('.hand-track, .hand-cards, .hand-scroll');if(next)next.scrollLeft=scroll;
      HandOverflow.sync(app);
      renderedRevision=live.revision;feedback.refresh();playerTargets?.refresh();
    }
    function show(content){
      dialogOpen=true;input.cancel();playerTargets?.cancel();app.inert=true;
      modal.innerHTML=`<div class="shared-modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="Информация"><button class="text-btn" data-command="close-modal">Закрыть ${GameScreen.icon('close')}</button>${content}</section></div>`;
      modal.querySelector('button')?.focus();
    }
    function close(){modal.innerHTML='';app.inert=false;dialogOpen=false;pendingAction=null;render();}
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
      const result=await client.history(pos);
      if(ticket!==historyTicket||!historyOpen||destroyed)return;
      if(result.kind!=='history'||result.viewer!==client.snapshot.viewer||result.sessionId!==client.snapshot.sessionId||result.authorityEpoch!==client.snapshot.authorityEpoch||result.revision>client.snapshot.revision)throw Error('Некорректная история.');
      historyIndex=pos;historySnapshot=result;render();
    }
    async function openHistory(index=historyCount()){
      stopReplay();stopMotion();input.cancel();playerTargets.cancel();feedback.clear();historyOpen=true;historyIndex=index;historySnapshot=null;render();
      try{await viewHistory(historyIndex);}catch(error){historyOpen=false;toast(error.message);render();}
    }
    function closeHistory(){historyTicket++;stopReplay();historyOpen=false;historySnapshot=null;historyIndex=null;selected=null;render();}
    async function stepHistory(delta){stopReplay();try{await viewHistory((historyIndex??historyCount())+delta);}catch(error){toast(error.message);}}
    async function playStep(){
      if(!historyOpen||destroyed||document.hidden){stopReplay();render();return;}
      if((historyIndex??0)>=historyCount()){stopReplay();render();return;}
      try{await viewHistory(historyIndex+1);}catch(error){stopReplay();toast(error.message);render();return;}
      if(replayTimer)replayTimer=setTimeout(playStep,650);
    }
    async function action(command){
      switch(command){
        case 'close-modal':close();break;
        case 'confirm-action':{
          const todo=pendingAction;close();if(todo)await submit(todo,true);break;
        }
        case 'home':
          if(readOnly){onExit?.();break;}
          if(root.confirm('Покинуть сетевую партию? Пока организатор остаётся в игре, связь сохраняется.'))root.location.reload();
          break;
        case 'settings':root.PlayroomAppBridge?.showSettings?.();break;
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
      event.stopPropagation();
      const target=event.target.closest('button,[data-accuse-player],[data-command],[data-action],[data-select]');
      if(!target||target.disabled)return;
      const command=target.dataset.command;
      if(command){void action(command).catch(e=>toast(e.message));return;}
      const accused=event.target.closest('[data-accuse-player]');
      if(accused&&usable()){
        playerTargets.tap(Number(accused.dataset.accusePlayer));
        return;
      }
      input.handleClick(event);
    }
    function onInput(event){
      if(event.target.id!=='replay-range'||!event.target.closest('.table-shell.network-game'))return;
      event.stopPropagation();
      stopReplay();
      app.querySelector('.replay-badge')?.replaceChildren(document.createTextNode(event.target.value+' / '+historyCount()));
      void viewHistory(Number(event.target.value)).catch(error=>toast(error.message));
    }
    function keydown(event){
      if(dialogOpen&&event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
      if(event.target.matches?.('[data-accuse-player]')&&event.target.closest('.network-game')&&['Enter',' '].includes(event.key)){
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
    document.addEventListener('change',onInput,true);
    document.addEventListener('keydown',keydown,true);
    const resize=()=>{stopMotion();if(client.snapshot)render();};root.addEventListener('resize',resize);
    const onOptions=()=>{stopMotion();if(client.snapshot)render();};root.addEventListener('playroom:game-options',onOptions);
    const visibility=()=>{if(document.hidden){stopReplay();stopMotion();}};document.addEventListener('visibilitychange',visibility);
    return {render,openHistory,setConnected(value){if(connected!==value){connected=value;if(!value){playerTargets.cancel();stopMotion();audio?.stop?.();}render();}},get selected(){return selected;},get revision(){return renderedRevision;},toast,
      destroy(){destroyed=true;stopReplay();stopMotion();playerTargets.destroy();feedback.destroy();clearTimeout(toastTimer);historyTicket++;unsub?.();document.removeEventListener('click',click,true);document.removeEventListener('change',onInput,true);document.removeEventListener('keydown',keydown,true);document.removeEventListener('visibilitychange',visibility);root.removeEventListener('resize',resize);root.removeEventListener('playroom:game-options',onOptions);input.destroy();}};
  }
  root.PlayroomSharedViews={install,mount};
})(globalThis);
