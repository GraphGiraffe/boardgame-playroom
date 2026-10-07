(function () {
  'use strict';
  const E = globalThis.TabletopCore || globalThis.PlayroomEngine;
  const V = globalThis.PlayroomViews;
  const Session = globalThis.TabletopSession;
  const Motion = globalThis.PlayroomMotion;
  const Authority=globalThis.SessionAuthority, Protocol=globalThis.PlayroomProtocol;
  const Multiplayer=globalThis.PlayroomMultiplayer;
  const profileStore=new Multiplayer.ProfileStore(()=>localStorage),roomService=new Multiplayer.RoomService();
  let playerProfile=profileStore.load();
  let authority=null,authoritySession=null,localClients=new Map(),commandSequence=0;
  function localAuthority(){
    if(authoritySession!==session){authority?.dispose();authoritySession=session;authority=session?new Authority(session):null;localClients=new Map();}
    return authority;
  }
  function localClient(player){const executor=localAuthority();if(!localClients.has(player))localClients.set(player,executor.connect(player));return localClients.get(player);}
  const packs = globalThis.PlayroomPacks;
  const library = new globalThis.PlayroomLibrary(() => localStorage, E, Session, packs);
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  }[name] || '')+'</svg>';
  const brand = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>ХОД<small>β</small>';
  const names = ['Вы','Мика','Тео','Луна'];
  const catalog = globalThis.PlayroomCatalog || {};
  const animationPresets = {
    instant:{label:'Мгновенный',duration:0,settle:100,botDelay:220,description:'Без анимаций, с небольшой паузой между действиями.'},
    fast:{label:'Быстрый',duration:220,settle:80,botDelay:300,description:'Все анимации, короткие перемещения и паузы.'},
    normal:{label:'Средний',duration:520,settle:160,botDelay:650,description:'Все анимации в спокойном обычном темпе.'},
    slow:{label:'Медленный',duration:1100,settle:650,botDelay:1200,description:'Плавные перемещения и длинные паузы, чтобы рассмотреть ход.'}
  };
  let settings = {sound:false, volume:.6, animationSpeed:'normal', quickPlay:false};
  let session = null, screen = 'hub', filter = 'all', selected = null, gate = null, viewer = 0;
  let sessionId = null, hubTab = 'games';
  let room=null,lobbyParticipantId=null,lobbyTimer=null,lobbyCountdown=null;
  let historyOpen = false, replayIndex = null, replayTimer = null, botTimer = null, toastTimer = null;
  let paused = false, lastResult = null, storageOK = true, modalReturn = null;
  let missedFrom = null, soundTicket = 0;
  let loadWarning = '', modalBack = null;
  let input = null, packUI = null;
  let transition = null, replayTicket = 0, awaitingPass = false;
  try {
    const stored=JSON.parse(localStorage.getItem('playroom.settings.v1')||'{}');
    if(typeof stored?.sound==='boolean')settings.sound=stored.sound;
    if([.3,.6,1].includes(stored?.volume))settings.volume=stored.volume;
    if(typeof stored?.quickPlay==='boolean')settings.quickPlay=stored.quickPlay;
    settings.animationSpeed=Object.hasOwn(animationPresets,stored?.animationSpeed)?stored.animationSpeed:stored?.animationSpeed!==undefined?'normal':stored?.motion===false?'instant':'normal';
  } catch (_) {}
  try { const saved = library.current(); if (saved) { session = saved.session; sessionId = saved.id; } }
  catch (_) { loadWarning='Не удалось восстановить сохранение. Исходная запись сохранена; остальные партии доступны в «Моих партиях».'; }
  const audio = new globalThis.TabletopAudio({enabled:settings.sound,volume:settings.volume});
  const audioVersions = new Map();
  for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
  const unlockAudio = () => {if(settings.sound&&!document.hidden)void audio.unlock();};
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
  const pace = () => ({...animationPresets[settings.animationSpeed],duration:window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:animationPresets[settings.animationSpeed].duration});
  document.body.classList.toggle('reduced-motion',pace().duration===0);
  const meta = id => E.GAMES.find(g => g.id === id);
  function activatePack(id,version) {
    const active=packs?.activate(id,version);
    if(active&&audioVersions.get(id)!==active.version){audio.registerPack(id,active.sounds||{});audioVersions.set(id,active.version);}
    return active;
  }
  function latestPacks() { if(packs)for(const id of new Set(packs.list().map(item=>item.id)))activatePack(id); }
  function activateSession() { if(session)activatePack(session.game,session.packVersion || Session.packVersionOf(session.export())); }
  const isPass = () => session && session.options.mode === 'pass';
  const isReplay = () => replayIndex !== null;
  const currentState = () => isReplay() ? session.states[replayIndex] : session.current;
  const lastEvent = state => state.events?.[state.events.length - 1];
  const needsGate = state => isPass()&&!session.options.openHands&&!!state.data.hands&&state.status!=='finished';
  const hasReactions = state => !!E.reactions?.(state,viewer).length;
  function toast(message) {
    $('#toast').textContent = message; $('#toast').classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('show'),3500);
  }
  function save() {
    if (!session) return true;
    try { library.write(session,sessionId); storageOK = true; loadWarning=''; return true; }
    catch (_) { toast('Не удалось сохранить партию: хранилище браузера заполнено или недоступно. Освободите место, удалив ненужные партии.'); storageOK = false; return false; }
  }
  function playSounds(before,after) {
    soundTicket++;
    if(!settings.sound||document.hidden||gate!==null)return;
    const cues=E.soundCues(after,viewer,before.events.at(-1)?.id||0);
    const important=cues.filter(c=>!['move','draw','notify'].includes(c.id));
    const ids=[...new Set((important.length?important:cues).map(c=>c.id))];
    if(ids.length)void audio.sequence(ids,{pack:after.game});
  }
  async function previewSound(id='move',pack) {
    if(!settings.sound||document.hidden)return;
    const ticket=++soundTicket;
    if(await audio.unlock()&&ticket===soundTicket&&settings.sound&&!document.hidden)void audio.sequence([id],{pack});
  }
  function stopSounds() {soundTicket++;audio.stop();}
  function cancelBot() { clearTimeout(botTimer); botTimer=null; authority?.cancelBot(); }
  function stopReplay(stopAudio=true) { clearTimeout(replayTimer); replayTimer=null;replayTicket++;Motion.cancel();if(stopAudio)stopSounds(); }
  function tile(g, featured) {
    const info=catalog[g.id]||{};
    return `<article class="game-tile ${featured?'featured':''}" data-game="${g.id}">
      <div class="tile-top"><span class="pill">${esc(info.badge || 'ИГРОВОЙ ПАК')}</span></div>
      <div class="game-cover">${V.cover ? V.cover(g.id) : ''}</div>
      <div class="tile-content"><h2 class="tile-title">${esc(g.name)}</h2><p class="tile-description">${esc(info.tagline || g.description)}</p>
      <div class="tile-bottom"><div class="tile-meta"><span>${icon('people')} ${g.min===g.max?g.min:g.min+'–'+g.max}</span><span class="meta-time">· ${esc(info.estimatedDuration||'Своя партия')}</span></div><span class="play-tile">${featured?'За стол ':''}${icon(featured?'arrow':'play')}</span></div></div>
      <button class="tile-hit" data-start="${g.id}" aria-label="Играть в ${esc(g.name)}"></button></article>`;
  }
  function renderHub() {
    interruptAction();input?.cancel();cancelBot(); latestPacks(); const games = E.GAMES.filter(g=>filter==='all'||catalog[g.id]?.category===filter);
    $('#app').innerHTML = `<div class="app-shell"><aside class="sidebar"><button class="brand" data-command="home" aria-label="ХОД — главная">${brand}</button>
      <nav class="side-nav" aria-label="Основная навигация"><button class="nav-item ${hubTab==='games'?'current':''}" data-command="home">${icon('grid')}Все игры</button><button class="nav-item ${hubTab==='sessions'?'current':''}" data-command="sessions">${icon('history')}Мои партии</button><button class="nav-item" data-command="help">${icon('help')}Как играть</button></nav>
      <div class="sidebar-note"><span class="little-dice">⚄</span>Хороший повод<br>собраться за столом.<br><br><span class="eyebrow" style="font-size:8px">PLAYROOM / 0.13</span></div></aside>
      <main class="hub-main"><header class="topbar"><span class="eyebrow muted">ИГРЫ В ХОРОШЕЙ КОМПАНИИ</span><button class="brand mobile-brand" data-command="home" aria-label="ХОД — главная">${brand}</button>
      <div class="topbar-tools"><button class="icon-btn pack-hub-button" data-command="packs" aria-label="Паки игр" title="Паки игр">${icon('layers')}</button><span class="status"><i class="dot"></i>${playerProfile?.name?esc(playerProfile.name)+' · ':''}Всё готово к игре</span><button class="icon-btn" data-command="fullscreen" aria-label="Полный экран" title="Полный экран">${icon('full')}</button><button class="icon-btn" data-command="settings" aria-label="Настройки">${icon('settings')}</button></div></header>
      ${hubTab==='sessions'?savedGamesMarkup():`<section class="intro"><h1>Маленький стол.<br><span>Большая компания.</span></h1><p>Любимые настолки, всегда под рукой. <br>Сыграйте с ботом или передайте <br>телефон другу. Следующий ход — ваш.</p></section>
      ${loadWarning?`<p class="recovery-note" role="alert">${esc(loadWarning)}</p>`:''}
      ${session?`<section class="resume-banner"><div><strong>${session.current.status==='finished'?'Последняя партия':'Ваш стол всё ещё ждёт'} · ${esc(meta(session.game).name)}</strong><p>${session.current.status==='finished'?'Результат и вся история ходов сохранены':`Ход ${session.current.move+1} · ${isPass()?'Игра вместе':'Игра с ботами'} · сохранено на устройстве`}</p></div><button class="btn" data-command="resume">${session.current.status==='finished'?'Посмотреть':'Продолжить'} ${icon('arrow')}</button></section>`:''}
      <div class="library-heading"><div class="filters" role="group" aria-label="Категории игр"><button class="filter ${filter==='all'?'active':''}" data-filter="all">Все игры</button><button class="filter ${filter==='cards'?'active':''}" data-filter="cards">Карточные</button><button class="filter ${filter==='board'?'active':''}" data-filter="board">На поле</button></div><span class="collection-count">${games.length} В КОЛЛЕКЦИИ</span></div>
      <section class="game-grid" aria-label="Коллекция игр">${games.map((g,i)=>tile(g,i===0&&filter==='all')).join('')}${!E.GAMES.length?'<div class="packs-empty-hub"><h2>Начните с первой игры</h2><p>Приложение готово. Добавьте файл пака: в нём есть правила, компоненты и оформление вашей игры.</p><button class="btn" data-command="packs">Установить пак игры</button></div>':!games.length?'<p class="lead">В этой категории пока нет игр.</p>':''}</section>`}
      <footer class="hub-footer"><span>${icon('hand')} Сделано для игры, а не для спешки</span><span>Без регистрации.<br class="mobile-text"> Даже без интернета.</span></footer></main></div>`;
  }
  function savedGamesMarkup() {
    let entries=[];
    try { entries=library.list(); } catch (_) { return '<p class="recovery-note" role="alert">Хранилище браузера недоступно. Ваш текущий стол остаётся открытым до закрытия страницы.</p>'; }
    const date=value=>new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const cards=entries.map(entry=>{
      const blocked=entry.invalid||entry.missingPack,name=entry.invalid?'Сохранение':meta(entry.game)?.name||entry.game;
      const details=entry.missingPack?`<p>Для этой партии нужен пак ${esc(entry.game)} версии ${esc(entry.packVersion)}. Установите его, чтобы продолжить. Сохранение осталось на устройстве.</p>`:entry.invalid?'<p>Запись оставлена без изменений. Можно удалить её, если она больше не нужна.</p>':`<p class="saved-players">${entry.players.map(esc).join(' · ')}</p>${entry.finished?`<p class="saved-result">${esc(entry.result)}</p>`:''}<p>${entry.mode==='pass'?'На одном устройстве':'С ботами'} · ${esc(entry.preset||'Основной набор')}</p><p>Начало: ${esc(date(entry.createdAt))} · Последний ход: ${esc(date(entry.updatedAt))}</p>`;
      return `<article class="saved-game" data-session-id="${esc(entry.id)}"><div><div class="saved-status"><span class="pill">${entry.missingPack?'Нужен игровой пак':entry.invalid?'Не удалось прочитать':entry.finished?'Завершена':'На паузе'}</span><span class="muted">${blocked?'':`Ход ${entry.move+1}`}</span></div><h2>${esc(name)}</h2>${details}</div><div class="saved-game-actions">${entry.missingPack?'<button class="btn" data-command="packs">Установить пак</button>':blocked?'':`<button class="btn" data-resume-id="${esc(entry.id)}">${entry.finished?'Просмотреть':'Продолжить'} ${icon(entry.finished?'history':'play')}</button>`}<button class="icon-btn" data-delete-id="${esc(entry.id)}" aria-label="Удалить партию ${esc(entry.invalid?'':name)}" title="Удалить партию">${icon('trash')}</button></div></article>`;
    }).join('');
    return `<header class="saved-heading"><div><h1>Мои партии</h1><p>Столы на паузе и завершённые игры. Продолжайте с того же места или пересматривайте историю.</p></div><button class="btn" data-command="home">Новая партия ${icon('arrow')}</button></header>
      <section class="saved-games-list" aria-label="Сохранённые партии">${entries.length?cards:'<div class="saved-empty"><h2>Здесь будут ваши партии</h2><p>Начните любую игру. Её можно оставить на паузе и вернуться позже; завершённые партии тоже сохраняются.</p><button class="btn" data-command="home">Выбрать игру</button></div>'}</section>`;
  }

  function leaveTable(tab='games') {
    interruptAction();input?.cancel();cancelBot();stopReplay();
    if(screen==='table')save();
    screen='hub';hubTab=tab;filter='all';historyOpen=false;replayIndex=null;selected=null;paused=true;
    closeModal(true);render();
  }
  function resumeSession(id=sessionId) {
    if(!id)return toast('Выберите игру — ваш стол появится здесь.');
    try {
      interruptAction();input?.cancel();cancelBot();stopReplay();
      if(id!==sessionId) {
        if(!save())return;
        const next=library.open(id);library.activate(next,id);session=next;sessionId=id;storageOK=true;
      }
      if(!session)return;
      activateSession();
      screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;awaitingPass=false;lastResult=null;missedFrom=null;
      viewer=isPass()?session.current.turn:0;gate=needsGate(session.current)?viewer:null;
      closeModal(true);render();
      if(session.current.status==='finished')openHistory();
    } catch(error) {toast('Не удалось открыть партию. '+error.message);}
  }
  function askDelete(id) {
    const entry=library.list().find(entry=>entry.id===id);if(!entry)return;
    openModal(`${modalHead('Удалить партию?')}<p class="lead">${esc(entry.invalid?'Это сохранение':meta(entry.game)?.name||entry.game)} и вся история этой партии будут удалены с устройства. Остальные партии останутся.</p><div class="modal-foot"><button class="btn secondary" data-command="close-modal">Оставить</button><button class="btn coral" data-delete-confirm="${esc(id)}">Удалить</button></div>`);
  }
  function deleteSession(id) {
    try {
      library.remove(id);
      if(id===sessionId){interruptAction();cancelBot();stopReplay();session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;}
      screen='hub';hubTab='sessions';closeModal(true);render();toast('Партия удалена');
    } catch (_) {toast('Не удалось удалить партию: хранилище браузера недоступно.');}
  }
  function activeActions(state) {
    if (transition||isReplay()||gate!==null||paused||state.status==='finished'||state.players[viewer]?.bot) return [];
    return localClient(viewer).snapshot().actions;
  }
  function playersMarkup(state,actions=[]) {
    const game=meta(session.game);
    const reactions=actions;
    const badge=i=>{try { const value=catalog[state.game]?.playerBadge?.(state,i);return typeof value==='string'?esc(value):''; }catch(_){return '';}};
    return state.players.map((p,i)=>`<div class="player-token ${state.turn===i?'active':''}" ${reactions.some(a=>a.target===i)?`data-accuse-player="${i}" role="button" tabindex="0" aria-label="Действия игрока ${esc(p.name)}"`:''}><span class="avatar p${i}">${esc(p.name.slice(0,1))}</span><span>${esc(p.name)}${i===viewer&&p.name!=='Вы'?' · вы':''}<small>${p.bot?'Бот':'Игрок'}${Number.isFinite(p.score)?' · '+esc(game.scoreLabel||'очки')+': '+p.score:''}${badge(i)}</small></span></div>`).join('');
  }
  function renderTable(animate=false) {
    if (!session) return renderHub();
    activateSession();
    const state=currentState(), game=meta(session.game), replay=isReplay(), actions=activeActions(state);
    const shownViewer=gate!==null?-1:viewer, projected=E.project(state,shownViewer);
    const turnPlayer=state.players[state.turn], finished=state.status==='finished';
    const turnText=replay?'Просмотр истории':transition?'Показываем ход…':finished?'Партия завершена':paused?'Пауза':turnPlayer?.bot?`${turnPlayer.name} думает…`:isPass()?`Ходит ${turnPlayer?.name}`:'Ваш ход';
    const oldHand=$('.hand-track, .hand-cards, .hand-scroll'); const scrollLeft=oldHand?.scrollLeft||0;
    $('#app').innerHTML=`<main class="table-shell"><header class="table-header"><div class="table-heading"><button class="icon-btn" data-command="home" aria-label="К играм" title="В хаб, с сохранением партии">${icon('back')}</button><div class="table-title"><h1>${esc(game.name)}</h1><p>${isPass()?'Вместе на одном устройстве':'За столом с ботами'} · ${esc(session.options.presetLabel||'Основной набор')}</p></div></div>
      <div class="table-tools"><button class="icon-btn desktop-tool" data-command="settings" aria-label="Настройки">${icon('settings')}</button><button class="icon-btn" data-command="rules" aria-label="Правила игры">${icon('help')}</button><button class="icon-btn ${historyOpen?'active':''}" data-command="history" aria-label="История ходов">${icon('history')}</button><button class="icon-btn" data-command="fullscreen" aria-label="Полный экран">${icon('full')}</button></div></header>
      <div class="table-status" aria-live="polite"><span class="turn-label"><i class="turn-light ${!replay&&turnPlayer?.bot?'bot':''}"></i>${esc(turnText)}</span><span class="turn-extra">${replay?`Ход ${replayIndex} из ${session.states.length-1}`:`Ход ${state.move+1} · ${!state.data.hands?'Открытое поле':session.options.openHands?'Руки открыты':'Руки скрыты'}`}</span></div>
      <div class="player-strip" aria-label="Игроки">${playersMarkup(projected,actions)}</div>
      <section class="scene ${replay?'replaying':''}" aria-label="Игровой стол" aria-busy="${!!transition}" data-animation-speed="${settings.animationSpeed}">${V.render(projected,shownViewer,actions,{selected,flipped:shownViewer===1,quickPlay:settings.quickPlay})}${paused&&!replay?`<div class="pause-cover"><h2>Стол подождёт</h2><p>Партия на паузе. Можно сделать вдох.</p><button class="btn" data-command="pause">Продолжить ${icon('play')}</button></div>`:''}</section>
      ${historyOpen?historyMarkup():''}
      ${isPass()&&hasReactions(state)?`<div class="pass-device-bar"><button class="btn secondary" data-command="pass-device" ${!awaitingPass||transition||paused||replay||gate!==null?'disabled':''}>Передать устройство ${icon('arrow')}</button></div>`:''}
      <footer class="table-bottom"><span class="event-latest" title="${esc(lastEvent(projected)?.text||'Новая партия')}">${esc(lastEvent(projected)?.text||'Выберите доступное действие на столе')}</span><span class="auto-saved">${icon(storageOK?'check':'save')}${storageOK?'Сохранено':'Не сохранено'}</span><button class="text-btn" data-command="${finished?'result':'pause'}">${finished?'Результаты':paused?'Продолжить':'Пауза'} ${icon(finished?'arrow':paused?'play':'pause')}</button></footer></main>`;
    const newHand=$('.hand-track, .hand-cards, .hand-scroll'); if(newHand)newHand.scrollLeft=scrollLeft;
    if(gate!==null)showGate();
    scheduleBot();
  }
  function historyMarkup() {
    const idx=replayIndex??session.states.length-1, state=session.view(gate!==null?-1:viewer,idx);
    return `<section class="history-panel" aria-label="Повтор ходов"><div class="history-head"><strong>Каждый ход на месте</strong><span class="replay-badge">${idx} / ${session.states.length-1}</span><button class="text-btn" data-command="history-close">К игре ${icon('close')}</button></div>
      <div class="history-controls"><button class="icon-btn" data-command="replay-prev" aria-label="Предыдущий ход" ${idx===0?'disabled':''}>${icon('prev')}</button><button class="icon-btn" data-command="replay-play" aria-label="${replayTimer?'Остановить':'Воспроизвести'} повтор">${icon(replayTimer?'pause':'play')}</button><input type="range" min="0" max="${session.states.length-1}" value="${idx}" id="replay-range" aria-label="Номер хода"><button class="icon-btn" data-command="replay-next" aria-label="Следующий ход" ${idx===session.states.length-1?'disabled':''}>${icon('next')}</button></div><p class="history-caption">${esc(lastEvent(state)?.text||'Начальная расстановка. Все готовы!')}</p></section>`;
  }
  function scrubHistory(index) {
    input?.cancel();stopReplay();replayIndex=index;selected=null;
    const state=currentState(),projected=E.project(state,gate!==null?-1:viewer),count=session.states.length-1;
    $('.scene').innerHTML=V.render(E.project(state,viewer),viewer,[],{selected:null,flipped:viewer===1,quickPlay:settings.quickPlay});
    $('.turn-extra').textContent=`Ход ${index} из ${count}`;
    $('.history-caption').textContent=lastEvent(projected)?.text||'Начальная расстановка. Все готовы!';
    $('.event-latest').textContent=lastEvent(projected)?.text||'Новая партия';
    $('.event-latest').title=lastEvent(projected)?.text||'Новая партия';
    $('.replay-badge').textContent=`${index} / ${count}`;
    $('[data-command="replay-prev"]').disabled=index===0;
    $('[data-command="replay-next"]').disabled=index===count;
    $('[data-command="replay-play"]').innerHTML=icon('play');
    $('[data-command="replay-play"]').setAttribute('aria-label','Воспроизвести повтор');
    $('.player-strip').innerHTML=playersMarkup(projected);
  }
  function showGate() {
    if($('.handoff'))return;
    const player=session.current.players[gate];
    $('.table-shell').inert=true;
    $('#app').insertAdjacentHTML('beforeend',`<section class="handoff" role="dialog" aria-modal="true" aria-label="Передача хода"><div class="handoff-content"><div class="handoff-art" aria-hidden="true"><span>✦</span><span>✦</span></div><span class="eyebrow muted">ПЕРЕДАЙТЕ УСТРОЙСТВО</span><h2>${esc(player.name)}, ваш ход</h2><p>Карты закрыты. Убедитесь, что телефон<br>у нужного игрока, и откройте свою руку.</p><button class="btn" data-command="unlock">Я ${esc(player.name)} · открыть ${icon('eye')}</button><button class="text-btn" data-command="home">Вернуться к играм</button></div></section>`);
    $('.handoff .btn')?.focus();
  }
  function render(animate=false) { screen==='hub'?renderHub():screen==='lobby'?renderLobby():renderTable(animate); }
  function scheduleBot() {
    cancelBot();
    if(transition||!session||screen!=='table'||isReplay()||paused||gate!==null||document.hidden||$('#modal-root').children.length||session.current.status==='finished')return;
    localAuthority().scheduleBot({delay:pace().botDelay,run:(actor,action)=>act(actor,action),onError(error){paused=true;render();toast(error.message);}});
  }
  function finishAction(run,{redraw=true,result=true}={}) {
    if(transition!==run)return;
    transition=null;clearTimeout(run.timer);Motion.cancel();
    if(session!==run.session)return;
    if(isPass()&&session.current.turn!==run.beforeTurn&&session.current.status!=='finished'){
      if(hasReactions(session.current))awaitingPass=true;
      else if(needsGate(session.current))gate=session.current.turn;
      else viewer=session.current.turn;
    }
    if(redraw&&screen==='table'&&!isReplay())renderTable();
    if(result&&screen==='table'&&!isReplay()&&!$('#modal-root').children.length&&session.current.status==='finished'&&lastResult!==session.createdAt){lastResult=session.createdAt;showResult();}
  }
  function interruptAction() { if(transition)finishAction(transition,{redraw:false,result:false}); }
  const cardTransfers=Authority.transfers;
  function act(actor,action,context={}) {
    if(transition||isReplay()||paused||gate!==null)return;
    try {
      const beforeState=session.current,beforeTurn=beforeState.turn,timing=pace(),snapshot=timing.duration?Motion.capture({actor,action,viewer,playedFrom:context.playedFrom}):null;
      if(session.current.players[actor]?.bot)localAuthority().actBot(actor,action);
      else {const client=localClient(actor),receipt=client.dispatch(Protocol.command(client.snapshot(),action,'local-'+(++commandSequence)));if(!receipt.ok)throw Error(receipt.message);}
      selected=null;playSounds(beforeState,session.current);save();input?.cancel();
      if(action.notify)toast(localClient(viewer).snapshot().events.filter(e=>e.id>(beforeState.events.at(-1)?.id||0)).map(e=>e.text).join(' · '));
      const run={session,beforeTurn,timer:null};transition=run;
      renderTable();
      Motion.play(snapshot,{duration:timing.duration,draws:cardTransfers(beforeState,session.current)}).then(()=>{
        if(transition===run)run.timer=setTimeout(()=>finishAction(run),timing.settle);
      }).catch(()=>finishAction(run));
    } catch(error){toast(error.message||'Это действие сейчас недоступно');}
  }
  function openModal(content,className='',{keepAudio=false}={}) {
    interruptAction();stopReplay(!keepAudio);input?.cancel();cancelBot();if(screen==='table')renderTable();cancelBot();modalReturn=document.activeElement;modalBack=null;$('#app').inert=true;
    $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${className}" role="dialog" aria-modal="true">${content}</section></div>`;
    const heading=$('.modal h2'); if(heading){heading.id='dialog-title';$('.modal').setAttribute('aria-labelledby','dialog-title');}
    $('.modal button,.modal input,.modal select')?.focus();
  }
  function closeModal(ignoreBack=false) {
    const back=modalBack;modalBack=null;
    if(back&&!ignoreBack){back();return;}
    stopSounds();$('#modal-root').innerHTML='';$('#app').inert=false;modalReturn?.focus?.();scheduleBot();
  }
  const modalHead = title => `<header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-command="close-modal" aria-label="Закрыть">${icon('close')}</button></header>`;
  function setup(gameId,draft=null) {
    activatePack(gameId);
    const g=meta(gameId); if(!g){packUI?.open();return;} const presets=g.presets?.length?g.presets:[{id:'default',label:'Классический'}];
    const fields=catalog[gameId]?.settings||[],defaultName=playerProfile?.name||'Игрок';
    openModal(`${modalHead('За стол · '+g.name)}<p class="lead">${esc(g.description || 'Выберите компанию и начните новую партию.')}</p>
      <form id="setup-form" data-game="${gameId}"><div class="field"><span>Режим</span><div class="segmented setup-modes"><label><input type="radio" name="mode" value="solo" checked> С ботами</label><label><input type="radio" name="mode" value="pass"> Hot seat</label><label><input type="radio" name="mode" value="network-player"> Сеть · Игрок</label><label><input type="radio" name="mode" value="network-table"> Сеть · Стол</label></div></div>
      <div class="local-create-fields"><label class="field"><span>Игроков за столом</span><select name="players">${Array.from({length:g.max-g.min+1},(_,i)=>g.min+i).map(n=>`<option value="${n}">${n} игрок${n===2||n===3||n===4?'а':'ов'}</option>`).join('')}</select></label><div class="names" id="player-names"></div></div>
      <div class="room-create-fields" hidden><label class="field"><span>Название комнаты</span><input name="roomName" maxlength="48" value="${esc('Комната '+defaultName)}" autocomplete="off"></label><label class="field"><span>Ваш никнейм в комнате</span><input name="networkNickname" maxlength="24" value="${esc(defaultName)}" autocomplete="nickname"></label><p class="lead">Количество игроков определится по занятым местам в лобби. Свободные слоты не будут заполняться автоматически.</p></div>
      <label class="field"><span>Набор правил</span><select name="preset">${presets.map(p=>`<option value="${esc(p.id)}">${esc(p.label||p.name||p.id)}</option>`).join('')}</select></label>
      ${fields.map(field=>`<label class="field"><span>${esc(field.label)}</span><select name="option-${esc(field.key)}">${field.options.map(option=>`<option value="${esc(option.value)}" ${(draft?.options?.[field.key]??field.default)===option.value?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`).join('')}
      ${catalog[gameId]?.capabilities?.hands?`<label class="switch"><span>Открытые руки <small class="muted">· учебная игра</small></span><input type="checkbox" name="openHands" aria-label="Открытые руки"></label>`:''}
      ${session?'<p class="lead" style="margin:15px 0 0">Текущая партия останется в «Моих партиях» вместе с историей ходов.</p>':''}
      <div class="modal-foot"><button class="btn secondary" type="button" data-rules="${gameId}">Правила</button><button class="btn" type="submit">Продолжить ${icon('arrow')}</button></div></form>`);
    if(draft){const form=$('#setup-form');form.elements.mode.value=draft.mode;form.elements.players.value=String(draft.players||g.min);form.elements.preset.value=draft.preset;if(form.elements.openHands)form.elements.openHands.checked=draft.openHands;}
    updateNames();
    if(draft?.names)draft.names.forEach((name,i)=>{const input=$('#setup-form').elements['name'+i];if(input)input.value=name;});
  }
  function updateNames() {
    const form=$('#setup-form');if(!form)return;
    const mode=form.elements.mode.value,network=mode.startsWith('network-');
    form.querySelector('.local-create-fields').hidden=network;form.querySelector('.room-create-fields').hidden=!network;
    if(network)return;
    const n=Number(form.elements.players.value);
    const old=Array.from($('#player-names').querySelectorAll('input')).map(x=>x.value),previous=form.dataset.namesMode;
    form.nameDrafts||={solo:[],pass:[]};if(previous&&form.nameDrafts[previous])old.forEach((value,i)=>{form.nameDrafts[previous][i]=value;});
    const firstName=old[0]&&!['Вы','Игрок 1'].includes(old[0])?old[0]:playerProfile?.name||null;
    $('#player-names').innerHTML=Array.from({length:n},(_,i)=>{const value=form.nameDrafts[mode]?.[i]||(i===0&&firstName)||(mode==='solo'?(names[i]||'Бот '+i):'Игрок '+(i+1));return `<label>${mode==='solo'&&i>0?'Бот':'Игрок'} ${i+1}<input name="name${i}" maxlength="24" value="${esc(value)}" aria-label="Имя игрока ${i+1}" ${mode==='solo'&&i>0?'readonly':''}></label>`;}).join('');
    form.dataset.namesMode=mode;
  }
  function roomRulesFromForm(form){
    const game=form.dataset.game,packOptions=Object.fromEntries((catalog[game]?.settings||[]).map(field=>[field.key,form.elements['option-'+field.key].value]));
    return {preset:form.elements.preset.value,presetLabel:form.elements.preset.selectedOptions[0].textContent,openHands:!!form.elements.openHands?.checked,options:packOptions};
  }
  function createNetworkRoom(form){
    const game=form.dataset.game,mode=form.elements.mode.value,g=meta(game),active=activatePack(game);
    if(!playerProfile?.name)throw Error('Сначала задайте имя игрока.');
    room=roomService.create({name:form.elements.roomName.value,game:{id:game,name:g.name,version:active?.version||'0.1.0'},host:{id:playerProfile.id,nickname:form.elements.networkNickname.value||playerProfile.name},hostMode:mode==='network-table'?'table':'player',rules:roomRulesFromForm(form),constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
    lobbyParticipantId=playerProfile.id;screen='lobby';lobbyCountdown=null;closeModal(true);renderLobby();
  }
  function startFromForm(form) {
    const game=form.dataset.game,mode=form.elements.mode.value;
    try {
      if(mode.startsWith('network-'))return createNetworkRoom(form);
      const count=Number(form.elements.players.value),players=Array.from({length:count},(_,i)=>({name:form.elements['name'+i].value.trim()||'Игрок '+(i+1),bot:mode==='solo'&&i>0}));
      activatePack(game);
      const roomRules=roomRulesFromForm(form),next=new Session(E,game,{players,mode,preset:roomRules.preset,presetLabel:roomRules.presetLabel,openHands:roomRules.openHands,...roomRules.options});
      if(!save())return;
      const id=library.newId();library.activate(next,id);session=next;sessionId=id;storageOK=true;loadWarning='';missedFrom=null;
      screen='table';selected=null;replayIndex=null;historyOpen=false;stopReplay();paused=false;lastResult=null;
      awaitingPass=false;viewer=mode==='solo'?0:session.current.turn;gate=needsGate(session.current)?viewer:null;
      closeModal(true);render();
    }catch(error){toast('Не удалось начать новую партию. '+error.message);}
  }
  function latestRoomEvent(type){return room?.events?.slice().reverse().find(event=>!type||event.type===type)||null;}
  function renderLobby(){
    if(!room)return leaveTable('games');
    const state=roomService.snapshot(room.id),me=state.participants.find(p=>p.id===lobbyParticipantId),isHost=state.ownerId===lobbyParticipantId;
    const rulesChanged=latestRoomEvent('rules-changed'),players=state.participants.filter(p=>p.role==='player'),spectators=state.participants.filter(p=>p.role==='spectator');
    const participantById=id=>state.participants.find(p=>p.id===id);
    const seatMarkup=state.seats.map(seat=>{const occupant=participantById(seat.participantId),mine=occupant?.id===lobbyParticipantId,locked=state.phase!=='lobby'||!!me?.ready;
      return `<button class="lobby-seat ${occupant?'occupied':'available'}" data-lobby-seat="${esc(seat.id)}" ${locked||occupant&&!mine?'disabled':''}><span class="seat-color" style="background:${esc(seat.color.value)}"></span><span><strong>${occupant?esc(occupant.nickname):esc(seat.color.label)+' слот'}</strong><small>${occupant?(occupant.ready?'<span class="lobby-ready">Готов</span>':'<span class="lobby-not-ready">Не готов</span>'):'Нажмите, чтобы занять место'}</small></span></button>`;}).join('');
    const person=item=>`<div class="lobby-person"><span class="seat-color" style="background:${esc(state.seats.find(s=>s.id===item.seatId)?.color.value||'#aab3a0')}"></span><span><strong>${esc(item.nickname)}${item.isHost?' · хост':''}</strong><small>${item.role==='spectator'?'Зритель':item.role==='table'?'Стол':item.ready?'Готов':'Игрок'}</small></span>${isHost&&!item.isHost?`<button class="icon-btn" data-kick-participant="${esc(item.id)}" aria-label="Исключить ${esc(item.nickname)}" title="Исключить">${icon('trash')}</button>`:''}</div>`;
    const canStart=isHost&&roomService.canStart(state.id),countText=state.constraints.allowed?state.constraints.allowed.join(', '):state.constraints.min===state.constraints.max?String(state.constraints.min):state.constraints.min+'–'+state.constraints.max;
    $('#app').innerHTML=`<main class="lobby-shell"><div class="lobby-wrap"><header class="lobby-header"><div><span class="eyebrow muted">СЕТЕВАЯ КОМНАТА</span><h1>${esc(state.name)}</h1><p>${esc(state.game.name)} · ${state.hostMode==='table'?'Хост показывает Стол':'Хост играет'} · игроков: ${countText}</p></div><div class="lobby-meta"><span class="pill">${esc(state.rules.presetLabel||'Правила')}</span><span class="lobby-code">#${esc(state.code)}</span><button class="icon-btn" data-command="settings" aria-label="Настройки">${icon('settings')}</button></div></header>
      ${rulesChanged?`<p class="lobby-rules-note" role="status">${esc(rulesChanged.text)}</p>`:''}
      <div class="lobby-grid"><section class="lobby-card"><h2>Игровые места</h2><div class="lobby-seats">${seatMarkup}</div><div class="lobby-actions">${me?.role==='player'?`<button class="btn secondary" data-command="lobby-spectator" ${me.ready||state.phase!=='lobby'?'disabled':''}>Стать зрителем</button>`:''}<button class="btn secondary" data-rules="${esc(state.game.id)}">Правила игры</button>${isHost?`<button class="btn secondary" data-command="room-rules" ${state.phase!=='lobby'?'disabled':''}>Изменить правила</button>`:''}</div></section>
      <aside class="lobby-card"><h2>Вы в комнате</h2><form id="lobby-nickname-form" class="lobby-profile"><label class="field"><span>Никнейм</span><input name="nickname" maxlength="24" value="${esc(me?.nickname||playerProfile?.name||'')}" ${me?.ready||state.phase!=='lobby'?'disabled':''}></label><button class="btn secondary" type="submit" ${me?.ready||state.phase!=='lobby'?'disabled':''}>Сохранить</button></form>
      <div class="lobby-actions">${me?.role==='player'?`<button class="btn ${me.ready?'secondary':''}" data-command="lobby-ready" ${state.phase!=='lobby'?'disabled':''}>${me.ready?'Снять готовность':'Я готов'}</button>`:''}${isHost?`<button class="btn" data-command="lobby-start" ${canStart?'':'disabled'}>Начать игру</button>`:''}</div>
      <h2 style="margin-top:20px">Участники</h2><div class="lobby-participants">${players.map(person).join('')||'<p class="lead">Игровые места пока свободны.</p>'}</div>
      <h2 style="margin-top:20px">Зрители</h2><div class="lobby-participants">${spectators.map(person).join('')||'<p class="lead">Зрителей пока нет. Зритель видит публичный Стол без рук игроков.</p>'}</div></aside></div>
      <footer class="lobby-card"><div class="lobby-actions"><button class="btn secondary" data-command="lobby-leave">Выйти из комнаты</button><span class="lead">В состоянии «Готов» место и никнейм блокируются. Изменение правил хостом снимает готовность у всех игроков.</span></div></footer></div>
      ${state.phase==='starting'?`<div class="lobby-countdown" role="status" aria-live="assertive"><div><strong>${lobbyCountdown??3}</strong><p>Игра начинается…</p></div></div>`:''}</main>`;
  }
  function updateLobbyNickname(form){try{room=roomService.rename(room.id,lobbyParticipantId,form.elements.nickname.value);renderLobby();}catch(error){toast(error.message);}}
  function claimLobbySeat(seatId){try{room=roomService.claimSeat(room.id,lobbyParticipantId,seatId);renderLobby();}catch(error){toast(error.message);}}
  function kickLobbyParticipant(targetId){try{room=roomService.kick(room.id,lobbyParticipantId,targetId);renderLobby();}catch(error){toast(error.message);}}
  function showRoomRulesEditor(){
    const state=roomService.snapshot(room.id),g=meta(state.game.id),presets=g.presets?.length?g.presets:[{id:'default',label:'Классический'}],fields=catalog[state.game.id]?.settings||[];
    openModal(`${modalHead('Правила · '+g.name)}<form id="room-rules-form" data-game="${esc(state.game.id)}"><label class="field"><span>Набор правил</span><select name="preset">${presets.map(p=>`<option value="${esc(p.id)}" ${state.rules.preset===p.id?'selected':''}>${esc(p.label||p.name||p.id)}</option>`).join('')}</select></label>${fields.map(field=>`<label class="field"><span>${esc(field.label)}</span><select name="option-${esc(field.key)}">${field.options.map(option=>`<option value="${esc(option.value)}" ${state.rules.options?.[field.key]===option.value?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`).join('')}${catalog[state.game.id]?.capabilities?.hands?`<label class="switch"><span>Открытые руки</span><input type="checkbox" name="openHands" ${state.rules.openHands?'checked':''}></label>`:''}<p class="lead">После сохранения готовность всех игроков будет снята, а участники получат уведомление об изменении правил.</p><div class="modal-foot"><button class="btn secondary" type="button" data-rules="${esc(state.game.id)}">Просмотреть правила</button><button class="btn" type="submit">Сохранить правила</button></div></form>`);
  }
  function updateRoomRules(form){try{room=roomService.updateRules(room.id,lobbyParticipantId,roomRulesFromForm(form));closeModal(true);renderLobby();toast('Правила изменены. Игрокам нужно подтвердить готовность заново.');}catch(error){toast(error.message);}}
  function toggleLobbyReady(){try{const me=room.participants.find(p=>p.id===lobbyParticipantId);room=roomService.setReady(room.id,lobbyParticipantId,!me?.ready);renderLobby();}catch(error){toast(error.message);}}
  function becomeLobbySpectator(){try{room=roomService.becomeSpectator(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(error.message);}}
  function startLobbyCountdown(){
    try{
      room=roomService.beginCountdown(room.id,lobbyParticipantId,{seconds:3});lobbyCountdown=3;renderLobby();clearInterval(lobbyTimer);
      lobbyTimer=setInterval(()=>{const step=roomService.tick(room.id);room=step.room;lobbyCountdown=step.remaining;if(step.started){clearInterval(lobbyTimer);lobbyTimer=null;renderLobby();toast('Лобби зафиксировано. Следующий шаг — запуск общей сетевой Session через HostRuntime.');}else renderLobby();},250);
    }catch(error){toast(error.message);}
  }
  function leaveLobby(){clearInterval(lobbyTimer);lobbyTimer=null;lobbyCountdown=null;room=null;lobbyParticipantId=null;screen='hub';renderHub();}
  function showPlayerNamePrompt(){
    openModal(`<header class="modal-head"><h2>Как вас называть?</h2></header><p class="lead">Имя используется по умолчанию в локальных и сетевых партиях. В конкретной комнате никнейм можно поменять отдельно.</p><form id="profile-form"><label class="field"><span>Имя игрока</span><input name="playerName" maxlength="24" autocomplete="nickname" placeholder="Например, Иван" required></label><button class="btn" type="submit" style="width:100%;margin-top:14px">Сохранить</button></form>`);
  }
  function savePlayerProfile(form){try{playerProfile=profileStore.save(form.elements.playerName.value);closeModal(true);render();toast('Имя игрока сохранено.');}catch(error){toast(error.message);}}
  function showRules(gameId=session?.game||room?.game?.id) {
    if(!gameId)return showHelp();const g=meta(gameId),roomRules=screen==='lobby'&&room?.game?.id===gameId?room.rules:null;
    const form=$('#setup-form');
    const draft=form?{mode:form.elements.mode.value,players:Number(form.elements.players.value),preset:form.elements.preset.value,openHands:!!form.elements.openHands?.checked,names:Array.from(form.querySelectorAll('#player-names input')).map(i=>i.value),options:Object.fromEntries((catalog[form.dataset.game]?.settings||[]).map(field=>[field.key,form.elements['option-'+field.key].value]))}:null;
    const rules=Array.isArray(g.rules)?g.rules:[String(g.rules||g.description)];
    openModal(`${modalHead(g.name+' · правила')}<p class="lead">${esc(g.description)}</p>${roomRules?`<p class="rules-mode-note"><strong>Выбрано в комнате:</strong> ${esc(roomRules.presetLabel||roomRules.preset||'Основной набор')}</p>`:''}<ol class="rules-list">${rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ol><p class="rules-mode-note">Доступные действия подсвечиваются. Проведите по руке влево или вправо, чтобы посмотреть остальные карты. История сохраняет каждый шаг партии.</p><p class="pack-line">Пак ${esc(g.id)} · ${g.min===g.max?g.min:g.min+'–'+g.max} игрока</p><button class="btn" data-command="close-modal" style="width:100%;margin-top:10px">Понятно</button>`);
    if(draft)modalBack=()=>setup(gameId,draft);
  }
  function showHelp() {
    openModal(`${modalHead('Ваш карманный стол')}<p class="lead">Одна компания. Пять способов провести время.</p><div class="help-grid">
      <div class="help-item">${icon('people')}<p><strong>С ботами или вместе</strong>Боты готовы в любой момент. В режиме «Передаём телефон» закрытая заставка скрывает руку между ходами.</p></div>
      <div class="help-item">${icon('hand')}<p><strong>Все действия — на столе</strong>В домино выберите костяшку и подсвеченное место или удерживайте её, чтобы перетащить. Листайте руку горизонтальным свайпом. Подсветка подскажет возможные ходы.</p></div>
      <div class="help-item">${icon('history')}<p><strong>Отвлеклись? Отмотайте</strong>Кнопка истории открывает повтор: двигайте ползунок, смотрите по одному ходу или запустите воспроизведение.</p></div>
      <div class="help-item">${icon('save')}<p><strong>Каждому столу своё место</strong>В «Моих партиях» хранятся игры на паузе и завершённые партии. Продолжайте любую или смотрите историю. Новые игры сохраняются отдельно.</p></div>
      <div class="help-item">${icon('layers')}<p><strong>Место для новых игр</strong>Каждая игра — отдельный пак со своими правилами, наборами и оформлением. Сетевые комнаты появятся на следующем этапе.</p></div></div><button class="btn" data-command="close-modal" style="width:100%;margin-top:25px">Всё, играем ${icon('arrow')}</button>`);
  }
  function showSettings() {
    openModal(`${modalHead('Как вам удобнее')}<label class="field"><span>Имя игрока</span><input id="setting-player-name" maxlength="24" autocomplete="nickname" value="${esc(playerProfile?.name||'')}" placeholder="Введите имя"></label><p class="lead" style="margin-top:-4px">Это имя подставляется как никнейм по умолчанию. В конкретной комнате его можно изменить.</p><label class="switch"><span>Звук действий</span><input type="checkbox" id="setting-sound" ${settings.sound?'checked':''}></label><label class="field"><span>Громкость</span><select id="setting-volume" data-sound-control ${settings.sound?'':'disabled'}>${[[.3,'Тихо'],[.6,'Средне'],[1,'Громко']].map(([value,label])=>`<option value="${value}" ${settings.volume===value?'selected':''}>${label}</option>`).join('')}</select></label><div class="sound-preview"><label class="field"><span>Библиотека звуков</span><select id="sound-preview" data-sound-control ${settings.sound?'':'disabled'}><optgroup label="Стандартные">${audio.catalog().map(c=>`<option value="|${esc(c.id)}">${esc(c.label)}</option>`).join('')}</optgroup>${Object.entries(catalog).filter(([,pack])=>pack.sounds).map(([id,pack])=>`<optgroup label="${esc(meta(id)?.name||id)}">${Object.entries(pack.sounds).map(([cue,def])=>`<option value="${esc(id)}|${esc(cue)}">${esc(def.label||cue)}</option>`).join('')}</optgroup>`).join('')}</select></label><button class="btn secondary" data-command="sound-preview" data-sound-control ${settings.sound?'':'disabled'} aria-label="Прослушать выбранный звук">${icon('play')}</button></div><label class="switch"><span>Ход одним нажатием</span><input type="checkbox" id="setting-quick-play" aria-describedby="setting-quick-play-description" ${settings.quickPlay?'checked':''}></label><p class="lead" id="setting-quick-play-description" style="margin-top:10px">Однозначный ход выполняется сразу. Если действию нужен цвет или цель, сначала выберите их.</p><label class="field"><span>Скорость анимации</span><select id="setting-speed" aria-describedby="setting-speed-description">${Object.entries(animationPresets).map(([id,p])=>`<option value="${id}" ${settings.animationSpeed===id?'selected':''}>${p.label}</option>`).join('')}</select></label><p class="lead" id="setting-speed-description">${animationPresets[settings.animationSpeed].description}</p><p class="lead" style="margin-top:20px">Настройки сохраняются на этом устройстве. Системное уменьшение анимации также учитывается.</p><button class="btn secondary" data-command="fullscreen" style="width:100%">${icon('full')} На весь экран</button>${session&&screen==='table'?`<button class="btn plain" data-start="${session.game}" style="width:100%;margin-top:10px">${icon('reset')} Настроить новую партию</button>`:''}`);
  }
  function showCardHelp() {
    const cards=[...document.querySelectorAll('.own-hand .hand-card[data-tooltip]')],seen=new Set();
    const entries=cards.filter(card=>{const text=card.dataset.tooltip;if(seen.has(text))return false;seen.add(text);return true;});
    const details=entries.map(card=>`<li><strong>${esc(card.getAttribute('aria-label'))}</strong><p>${esc(card.dataset.tooltip)}</p></li>`).join('');
    openModal(`${modalHead('Карты в вашей руке')}<p class="lead">На компьютере наведите курсор на карту, чтобы увидеть её действие. Здесь собраны подсказки для текущей руки.</p><ul class="card-help-list">${details||'<li>В руке пока нет открытых карт.</li>'}</ul>`);
  }
  function showPlayerActions(target) {
    if(transition||isReplay()||paused||gate!==null||!session)return;
    const action=E.reactions?.(session.current,viewer).find(a=>a.target===target);
    if(!action)return;
    const name=session.current.players[target].name;
    openModal(`${modalHead(name)}<p class="lead">${esc(action.confirmation||'Выполнить действие с выбранным игроком?')}</p><button class="btn secondary" data-action="${esc(JSON.stringify(action))}" data-close-on-action style="width:100%">${esc(action.label||'Подтвердить')}</button>`);
  }
  function showResult() {
    if(!session||session.current.status!=='finished'||screen!=='table')return;
    const state=session.current,winner=state.winner;
    openModal(`${modalHead(winner===null?'Хорошая ничья!':winner===0&&!isPass()?'Ваша победа!':`Побеждает ${state.players[winner]?.name||'игрок'}`)}<div class="result-art" aria-hidden="true">✦</div><p class="lead">${esc(meta(session.game).name)} · ${state.move} действий за столом</p><div class="result-scores">${state.players.map((p,i)=>`<div class="score-row"><span>${i===winner?'★ ':''}${esc(p.name)}</span><strong>${esc(meta(session.game).scoreLabel||'очки')}: ${Number.isFinite(p.score)?p.score:0}</strong></div>`).join('')}</div><div class="modal-foot"><button class="btn secondary" data-command="result-replay">Повтор</button><button class="btn" data-start="${session.game}">Ещё партию</button></div><button class="btn secondary result-menu" data-command="home">${icon('grid')} В меню</button>`,'result-modal',{keepAudio:true});
  }
  function openHistory(from=null) {
    interruptAction();cancelBot();stopReplay();selected=null;historyOpen=true;replayIndex=from??session.states.length-1;renderTable();
  }
  function startReplay() {
    stopReplay();const ticket=replayTicket;
    if(replayIndex===session.states.length-1)replayIndex=0;
    const step=async()=>{
      if(ticket!==replayTicket||!isReplay()||screen!=='table')return;
      if(replayIndex>=session.states.length-1){stopReplay(false);renderTable();return;}
      const before=currentState(),after=session.states[replayIndex+1],events=after.events.filter(e=>e.id>(before.events.at(-1)?.id||0));
      const action={type:events.some(e=>e.kind==='roll')?'roll':'replay'},timing=pace(),snapshot=timing.duration?Motion.capture({actor:before.turn,action,viewer}):null;
      replayIndex++;renderTable();playSounds(before,after);
      await Motion.play(snapshot,{duration:timing.duration,draws:cardTransfers(before,after)});
      if(ticket===replayTicket)replayTimer=setTimeout(step,timing.settle+timing.botDelay);
    };
    replayTimer=setTimeout(step,pace().botDelay);renderTable();
  }
  async function fullscreen() {
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      else {const enabled=document.documentElement.classList.toggle('fullscreen-fallback');toast(enabled?'Экран развёрнут. Для скрытия панели браузера добавьте страницу на экран «Домой».':'Обычный режим экрана.');}
    }catch(_){toast('Браузер ограничил полный экран. Используйте меню браузера или добавьте страницу на экран «Домой».');}
  }
  const commands={
    home(){leaveTable('games');},
    sessions(){leaveTable('sessions');},
    resume(){resumeSession();},
    packs(){packUI?.open();},
    help:showHelp,settings:showSettings,'card-help':showCardHelp,fullscreen,rules:()=>showRules(),
    'room-rules':showRoomRulesEditor,
    'lobby-ready':toggleLobbyReady,
    'lobby-spectator':becomeLobbySpectator,
    'lobby-start':startLobbyCountdown,
    'lobby-leave':leaveLobby,
    'close-modal':closeModal,
    'sound-preview'(){const value=$('#sound-preview')?.value;if(!value)return;const [pack,id]=value.split('|');void previewSound(id,pack||undefined);},
    unlock(){viewer=gate;gate=null;awaitingPass=false;render();},
    'pass-device'(){if(!awaitingPass||transition||paused||isReplay())return;awaitingPass=false;if(needsGate(session.current))gate=session.current.turn;else viewer=session.current.turn;render();},
    history(){if(historyOpen)commands['history-close']();else openHistory();},
    'history-close'(){stopReplay();historyOpen=false;replayIndex=null;selected=null;render();},
    'replay-prev'(){stopReplay();replayIndex=Math.max(0,replayIndex-1);render();},
    'replay-next'(){const before=currentState();stopReplay();replayIndex=Math.min(session.states.length-1,replayIndex+1);render();playSounds(before,currentState());},
    'replay-play'(){if(replayTimer){stopReplay();return render();}startReplay();},
    pause(){interruptAction();stopSounds();paused=!paused;cancelBot();render();},result:showResult,
    'result-replay'(){closeModal();openHistory(0);commands['replay-play']();}
  };
  input=globalThis.TabletopInput.attach({
    canStart(source){return screen==='table'&&!!session&&!source.disabled&&!$('#modal-root').children.length&&activeActions(session.current).length>0;},
    canSelect(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&!transition&&(viewer===session.current.turn||source.hasAttribute('data-hand-preview'));},
    canCommit(){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&!transition;},
    getSelected(){return selected;},
    select(piece){selected=piece;renderTable();},
    commit(action,context){act(viewer,action,context);}
  });
  document.addEventListener('click',event=>{
    const person=event.target.closest('[data-accuse-player]');
    if(person){showPlayerActions(Number(person.dataset.accusePlayer));return;}
    const button=event.target.closest('button,[data-action],[data-select],[data-cell],[data-drop-select]');
    if(!button||button.disabled)return;
    if(button.dataset.resumeId){resumeSession(button.dataset.resumeId);return;}
    if(button.dataset.deleteId){try{askDelete(button.dataset.deleteId);}catch(_){toast('Не удалось прочитать сохранения.');}return;}
    if(button.dataset.deleteConfirm){deleteSession(button.dataset.deleteConfirm);return;}
    if(button.dataset.lobbySeat){claimLobbySeat(button.dataset.lobbySeat);return;}
    if(button.dataset.kickParticipant){kickLobbyParticipant(button.dataset.kickParticipant);return;}
    if(button.dataset.command){commands[button.dataset.command]?.();return;}
    if(button.dataset.start){setup(button.dataset.start);return;}
    if(button.dataset.rules){showRules(button.dataset.rules);return;}
    if(button.dataset.filter){filter=button.dataset.filter;renderHub();return;}
    if(button.hasAttribute('data-action')&&button.hasAttribute('data-close-on-action'))closeModal(true);
    input.handleClick(event);
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='setup-form'){event.preventDefault();startFromForm(event.target);}
    else if(event.target.id==='profile-form'){event.preventDefault();savePlayerProfile(event.target);}
    else if(event.target.id==='lobby-nickname-form'){event.preventDefault();updateLobbyNickname(event.target);}
    else if(event.target.id==='room-rules-form'){event.preventDefault();updateRoomRules(event.target);}
  });
  document.addEventListener('change',event=>{
    if(event.target.closest('#setup-form')&&['players','mode'].includes(event.target.name))updateNames();
    if(event.target.id==='setting-player-name'){try{playerProfile=profileStore.save(event.target.value);toast('Имя игрока сохранено.');}catch(error){toast(error.message);}}
    if(['setting-sound','setting-speed','setting-quick-play','setting-volume'].includes(event.target.id)){
      if(event.target.id==='setting-sound'){settings.sound=event.target.checked;soundTicket++;audio.setEnabled(settings.sound);document.querySelectorAll('[data-sound-control]').forEach(el=>el.disabled=!settings.sound);}
      else if(event.target.id==='setting-volume'){settings.volume=Number(event.target.value);audio.setVolume(settings.volume);}
      else if(event.target.id==='setting-quick-play')settings.quickPlay=event.target.checked;
      else {settings.animationSpeed=Object.hasOwn(animationPresets,event.target.value)?event.target.value:'normal';$('#setting-speed-description').textContent=animationPresets[settings.animationSpeed].description;}
      document.body.classList.toggle('reduced-motion',pace().duration===0);
      try{localStorage.setItem('playroom.settings.v1',JSON.stringify(settings));}catch(_){}
      if(['setting-sound','setting-volume'].includes(event.target.id))void previewSound();
    }
  });
  document.addEventListener('input',event=>{if(event.target.id==='replay-range')scrubHistory(Number(event.target.value));});
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-accuse-player]')){event.preventDefault();showPlayerActions(Number(event.target.dataset.accusePlayer));return;}
    if(event.key==='Escape'){
      if($('#modal-root').children.length)closeModal();else if(historyOpen)commands['history-close']();
      return;
    }
    if(event.key==='Tab'){
      const dialog=$('.modal')||$('.handoff');if(!dialog)return;
      const items=Array.from(dialog.querySelectorAll('button,input,select,a[href]')).filter(e=>!e.disabled&&e.offsetParent!==null);
      if(!items.length)return;const first=items[0],last=items[items.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
    if(historyOpen&&!$('#modal-root').children.length&&!event.target.matches('input,select')){
      if(event.key==='ArrowLeft'){event.preventDefault();commands['replay-prev']();}
      if(event.key==='ArrowRight'){event.preventDefault();commands['replay-next']();}
    }
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){cancelBot();stopReplay();interruptAction();if(session)missedFrom=Math.max(0,session.states.length-5);}
    else if(screen==='table'&&session){renderTable();if(missedFrom!==null){toast('С возвращением! Последние ходы можно пересмотреть в истории.');missedFrom=null;}}
  });
  window.addEventListener('pagehide',()=>{stopSounds();if(session)save();});
  packUI=globalThis.PlayroomPackManager?.create({manager:packs,library,openModal,modalHead,toast,onChange(){
    filter='all';
    if(!session)try{const saved=library.current();if(saved){session=saved.session;sessionId=saved.id;loadWarning='';}}catch(_){}
    for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
    renderHub();
  }});
  render();
  if(!playerProfile?.name)setTimeout(showPlayerNamePrompt,0);
})();
