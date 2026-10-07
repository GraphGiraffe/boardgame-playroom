(function(root){
  'use strict';
  const V=root.PlayroomViews,H=V.helpers;
  function install(definition){
    const {manifest,view,styles,assets={}}=definition;
    if(!manifest||typeof manifest.id!=='string'||typeof view!=='string'||typeof styles!=='string')throw Error('Нет представления пака.');
    const catalog={[manifest.id]:manifest},scope={PlayroomViews:V,TabletopUI:root.TabletopUI,PlayroomCatalog:catalog,PlayroomPack:Object.freeze({id:manifest.id,version:manifest.version,asset:path=>{if(!Object.hasOwn(assets,path))throw Error('Ресурс отсутствует');return assets[path];}})};
    // Only a trusted presentation module executes here; no Session or rule module.
    Function('globalThis','"use strict";\n'+view)(scope);
    const style=document.createElement('style');style.dataset.sharedPack=manifest.id;style.textContent=styles;document.head.appendChild(style);
    return {manifest,catalog:catalog[manifest.id],rules:definition.rules||[],sounds:definition.sounds||{}};
  }
  function mount(client,definition,{surface}={}){
    const pack=install(definition),app=document.getElementById('app');
    let selected=null,connected=true,historySnapshot=null,input=null,dialogOpen=false,renderedRevision=-1;
    const drawNotice=document.getElementById('toast');
    let toastTimer;const toast=text=>{clearTimeout(toastTimer);drawNotice.textContent=text;toastTimer=setTimeout(()=>{drawNotice.textContent="";},4000);};
    const usable=()=>connected&&!client.pending&&!historySnapshot&&!dialogOpen&&client.snapshot?.viewer>=0;
    function render(){
      const live=client.snapshot,s=historySnapshot||live;if(!s)return;
      if(s.packVersion!==pack.manifest.version||s.game!==pack.manifest.id)throw Error('Версия представления не совпадает с партией.');
      const actual=surface||(s.viewer<0?'table':'player');
      if(!V.supports(s.game,actual))throw Error('Этот пак не поддерживает выбранный экран.');
      const hand=s.state.data.hands?.[s.viewer];
      if(selected!==null&&hand&&!hand.some(c=>c.id===selected))selected=null;
      const old=document.querySelector('.hand-track'),scroll={left:old?.scrollLeft||0,top:old?.scrollTop||0};
      const isPublic=s.viewer<0;
      app.innerHTML=`<main class="shared-shell" data-revision="${s.revision}" data-viewer="${s.viewer}" data-surface="${actual}"><header class="shared-header"><div><h1>${H.esc(pack.manifest.name)}</h1><span>${isPublic?'Общий стол':H.esc(s.state.players[s.viewer].name)}</span></div><nav><button class="scene-button" data-shared="help" aria-label="Правила игры">?</button><button class="scene-button" data-shared="history">История</button><button class="scene-button" data-shared="fullscreen" aria-label="Полный экран">⛶</button></nav></header>
        <div class="shared-status" role="status"><span>${historySnapshot?'Просмотр хода '+s.revision:s.state.status==='finished'?'Партия завершена':connected?'Ходит '+H.esc(s.state.players[s.state.turn].name):'Связь потеряна · партия ожидает подключения'}</span><span>Ход ${s.revision+1}</span></div>
        <section class="scene shared-scene" aria-label="Игровой стол">${V.render(s.state,s.viewer,usable()?s.actions:[],{selected,surface:actual,quickPlay:false})}</section>
        <footer class="shared-footer"><span class="event-latest">${H.esc(s.events.at(-1)?.text||'')}</span>${historySnapshot?'<button class="scene-button" data-shared="live">К игре</button>':''}${client.pending?'<button class="scene-button" data-shared="retry">Повторить отправку</button>':''}</footer></main>`;
      const track=document.querySelector('.hand-track');if(track){track.scrollLeft=scroll.left;track.scrollTop=scroll.top;}
      renderedRevision=s.revision;
    }
    async function submit(action){
      if(!usable())return;
      if(action.confirmation&&!root.confirm(action.confirmation))return;
      input?.cancel();
      try{const promise=client.send(action);render();const receipt=await promise;if(receipt.ok)selected=null;else toast(receipt.message);render();}
      catch(error){toast(error.message+' Нажмите «Повторить отправку».');render();}
    }
    input=root.TabletopInput.attach({getSelected:()=>selected,canStart:usable,canSelect:usable,canCommit:usable,select(value){selected=value;render();},commit:submit});
    const modal=document.getElementById('modal-root');
    function close(){modal.innerHTML='';app.inert=false;dialogOpen=false;render();}
    function show(content){dialogOpen=true;input.cancel();app.inert=true;modal.innerHTML=`<div class="shared-modal-backdrop"><section class="shared-modal" role="dialog" aria-modal="true" aria-label="Информация"><button class="scene-button" data-shared="close">Закрыть</button>${content}</section></div>`;modal.querySelector('button').focus();}
    async function click(event){
      const target=event.target.closest('button,[data-accuse-player],[data-shared]');if(target?.disabled)return;
      const command=target?.dataset.shared;
      try{
        if(command==='close'){close();return;}
        if(command==='help'||target?.dataset.command==='card-help'){show('<h2>Правила и карты</h2>'+pack.rules.map(rule=>'<p>'+H.esc(rule)+'</p>').join(''));return;}
        if(command==='fullscreen'){if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();return;}
        if(command==='retry'){const receipt=await client.retry();toast(receipt.ok?'Ход подтверждён.':receipt.message);if(receipt.ok)selected=null;render();return;}
        if(command==='history'){
          show(`<h2>История</h2><input id="shared-history" type="range" min="0" max="${client.snapshot.historyLength-1}" value="${client.snapshot.historyLength-1}" aria-label="Номер хода"><button class="scene-button" data-shared="show-history">Показать ход</button>`);return;
        }
        if(command==='show-history'){const index=Number(document.getElementById('shared-history').value);const result=await client.history(index);if(result.viewer!==client.snapshot.viewer||result.authorityEpoch!==client.snapshot.authorityEpoch)throw Error('Некорректная история.');historySnapshot=result;close();return;}
        if(command==='live'){historySnapshot=null;await client.refresh();render();return;}
        const accused=event.target.closest('[data-accuse-player]');
        if(accused&&usable()){const actions=client.snapshot.actions.filter(a=>a.target===Number(accused.dataset.accusePlayer));if(actions.length===1)await submit(actions[0]);return;}
        input.handleClick(event);
      }catch(error){toast(error.message);}
    }
    document.addEventListener('click',click);
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialogOpen)close();if(event.key==='Tab'&&dialogOpen){const nodes=[...modal.querySelectorAll('button,input,a[href]')].filter(n=>!n.disabled),first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    client.subscribe(()=>{if(!historySnapshot){input.cancel();render();}});
    // Resize only cancels a gesture in TabletopInput; logical selection survives.
    root.addEventListener('resize',()=>{if(client.snapshot)render();});
    return {render,setConnected(value){if(connected!==value){connected=value;render();}},get selected(){return selected;},get revision(){return renderedRevision;},toast};
  }
  root.PlayroomSharedViews={install,mount};
})(globalThis);
