(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomGameScreen=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
    full:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    play:'<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    prev:'<path d="m15 6-6 6 6 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    people:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    hand:'<path d="M8 12V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 2Z"/>',
    layers:'<path d="m12 3 10 6-10 6L2 9Zm-10 12 10 6 10-6M2 15l10 6 10-6"/>',
    sound:'<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    reset:'<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
    save:'<path d="M5 3h12l4 4v14H3V3Zm3 0v6h8V3M7 21v-8h10v8"/>',
    rules:'<path d="M4 3h12a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3Zm0 15a3 3 0 0 1 3-3h12M8 7h7M8 10h7"/>',
    edit:'<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16Zm0 0h16"/>',
    connect:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M12 7v6M9 10h6M11 17h2"/>',
    trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 3h8m-6-3h4v3"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  }[name] || '')+'</svg>';
  // The same markup is used with a trusted local Session and with the
  // projection-only SessionClient. No rule or network state is read here.
  function playersMarkup(state,viewer,actions=[],{scoreLabel='очки',playerBadge=()=>''}={}){
    return state.players.map((person,i)=>{
      let badge='';try{const value=playerBadge(state,i);if(typeof value==='string')badge=esc(value);else if(value&&typeof value.label==='string'){const tone=['success','warning','danger'].includes(value.tone)?value.tone:'warning';badge=`<span class="player-status-badge tone-${tone}">${esc(value.label)}</span>`;}}catch(_){}
      const target=actions.some(a=>a.target===i);
      return `<div class="player-token ${state.turn===i?'active':''}" ${target?`data-accuse-player="${i}" role="button" tabindex="0" aria-label="Действия игрока ${esc(person.name)}"`:''}><span class="avatar p${i}">${esc(person.name.slice(0,1))}</span><span>${esc(person.name)}${i===viewer&&person.name!=='Вы'?' · вы':''}<small>${person.bot?'Бот':'Игрок'}${Number.isFinite(person.score)?' · '+esc(scoreLabel)+': '+person.score:''}${badge}</small></span></div>`;
    }).join('');
  }
  function historyMarkup({index,count,caption='',playing=false,readOnly=false}={}){
    return `<section class="history-panel" aria-label="Повтор ходов"><div class="history-head"><strong>История</strong><span class="replay-badge" aria-label="Ход ${index} из ${count}">${index} / ${count}</span><button class="icon-btn" data-command="history-close" aria-label="${readOnly?'Закрыть историю':'Вернуться к игре'}" title="${readOnly?'Закрыть историю':'Вернуться к игре'}">${icon('back')}</button></div>
      <div class="history-controls"><button class="icon-btn" data-command="replay-prev" aria-label="Предыдущий ход" ${index===0?'disabled':''}>${icon('prev')}</button><button class="icon-btn" data-command="replay-play" aria-label="${playing?'Остановить':'Воспроизвести'} повтор">${icon(playing?'pause':'play')}</button><input type="range" min="0" max="${count}" value="${index}" id="replay-range" aria-label="Номер хода"><button class="icon-btn" data-command="replay-next" aria-label="Следующий ход" ${index===count?'disabled':''}>${icon('next')}</button></div><p class="history-caption">${esc(caption||'Начальная расстановка. Все готовы!')}</p></section>`;
  }
  function resultMarkup({state,viewer,gameName,scoreLabel='очки',network=false}={}){
    if(!state||state.status!=='finished')return '';
    const winner=state.winner,person=winner==null?null:state.players[winner];
    const title=winner===null?'Ничья!':viewer<0?`${person?.name||'Игрок'} побеждает`:winner===viewer?'Победа!':'Поражение';
    const scores=state.players.map((player,i)=>`<div class="score-row"><span>${i===winner?'★ ':''}${esc(player.name)}${i===viewer?' · вы':''}</span><strong>${esc(scoreLabel)}: ${Number.isFinite(player.score)?player.score:0}</strong></div>`).join('');
    return `<header class="modal-head"><h2>${esc(title)}</h2></header><div class="result-art" aria-hidden="true">✦</div><p class="lead">${esc(gameName)} · ${state.move} действий за столом</p><div class="result-scores">${scores}</div><div class="modal-foot"><button class="btn secondary" data-command="result-replay">Посмотреть историю</button>${network?`<button class="btn" data-command="home">Вернуться в комнату</button>`:`<button class="btn" data-start="${esc(state.game)}">Ещё партию</button>`}</div>${network?'':`<button class="btn secondary result-menu" data-command="home">${icon('grid')} В меню</button>`}`;
  }
  function render({gameName,subtitle='',state,viewer,actions=[],scene='',turnText='',turnExtra='',replay=false,
    busy=false,botThinking=false,animationSpeed='',beforeFooter='',historyHTML='',footerText='',footerTitle=footerText,footerAction={command:'home',label:'К играм',icon:'back'},
    footerExtra='',saved=null,showSettings=true,network=false,revision=null,scoreLabel='очки',playerBadge,historyResult=false}={}){
    if(!state?.players)throw Error('Projected game state required');
    const caption=esc(footerText||'Выберите доступное действие на столе');
    return `<main class="table-shell${network?' network-game':''}"${network?` data-revision="${revision}" data-viewer="${viewer}"`:''}><header class="table-header"><div class="table-heading"><button class="icon-btn" data-command="home" aria-label="К играм" title="${network?'Покинуть сетевую партию':'В хаб, с сохранением партии'}">${icon('back')}</button><div class="table-title"><h1>${esc(gameName)}</h1><p>${esc(subtitle)}</p></div></div>
      <div class="table-tools">${showSettings?`<button class="icon-btn desktop-tool" data-command="settings" aria-label="Настройки">${icon('settings')}</button>`:''}<button class="icon-btn" data-command="rules" aria-label="Правила игры">${icon('help')}</button><button class="icon-btn ${historyHTML?'active':''}" data-command="history" aria-label="История ходов" aria-pressed="${!!historyHTML}">${icon('history')}</button>${historyHTML&&historyResult?`<button class="icon-btn" data-command="result" aria-label="Результаты партии" title="Результаты партии">${icon('trophy')}</button>`:''}<button class="icon-btn" data-command="fullscreen" aria-label="Полный экран">${icon('full')}</button></div></header>
      <div class="table-status" aria-live="polite"><span class="turn-label"><i class="turn-light ${botThinking?'bot':''}"></i>${esc(turnText)}</span><span class="turn-extra">${esc(turnExtra)}</span></div>
      <div class="player-strip" aria-label="Игроки">${playersMarkup(state,viewer,actions,{scoreLabel,playerBadge})}</div>
      <section class="scene ${replay?'replaying':''}" aria-label="Игровой стол" aria-busy="${!!busy}"${animationSpeed?` data-animation-speed="${esc(animationSpeed)}"`:""}>${scene}</section>
      ${historyHTML}
      ${beforeFooter}
      <footer class="table-bottom"><span class="event-latest" title="${esc(footerTitle)}">${caption}</span>${saved!==null?`<span class="auto-saved">${icon(saved?'check':'save')}${saved?'Сохранено':'Не сохранено'}</span>`:''}${footerExtra}<button class="text-btn" data-command="${esc(footerAction.command)}">${esc(footerAction.label)} ${icon(footerAction.icon)}</button></footer></main>`;
  }
  const replayFitters=new WeakMap();
  function fitReplayScene(host){
    const scene=host.querySelector('.scene.replaying'),previous=replayFitters.get(host);
    if(previous?.scene!==scene){
      previous?.observer?.disconnect();replayFitters.delete(host);
      if(scene){
        const Observer=scene.ownerDocument.defaultView.ResizeObserver;
        const observer=Observer?new Observer(()=>fitReplayScene(host)):null;
        replayFitters.set(host,{scene,observer});observer?.observe(scene);
      }
    }
    const stage=scene?.firstElementChild;if(!stage)return;
    const width=scene.clientWidth-4,height=scene.clientHeight-4;if(width<=0||height<=0)return;
    // Measure at the available width, then scale the entire pack snapshot.
    // Expanding width inversely to zoom would enlarge square boards again.
    stage.style.zoom='1';stage.style.width=width+'px';stage.style.minHeight='0';stage.style.height='auto';
    const bounds=stage.getBoundingClientRect();
    stage.style.zoom=String(Math.min(1,width/Math.max(stage.scrollWidth,bounds.width,1),height/Math.max(stage.scrollHeight,bounds.height,1)));
  }
  return Object.freeze({icon,esc,playersMarkup,historyMarkup,resultMarkup,render,fitReplayScene});
});
