(function () {
  'use strict';
  const E = globalThis.TabletopCore || globalThis.PlayroomEngine;
  const V = globalThis.PlayroomViews;
  const Session = globalThis.TabletopSession;
  const Motion = globalThis.PlayroomMotion, Flow = globalThis.PlayroomGameFlow;
  const HandOverflow=globalThis.PlayroomHandOverflow;
  const Authority=globalThis.SessionAuthority, Protocol=globalThis.PlayroomProtocol;
  const Multiplayer=globalThis.PlayroomMultiplayer;
  const profileStore=new Multiplayer.ProfileStore(()=>localStorage),roomService=new Multiplayer.RoomService();
  let playerProfile=profileStore.load();
  let authority=null,authoritySession=null,localClients=new Map(),commandSequence=0;
  function localAuthority(){
    if(authoritySession!==session){authority?.dispose();authoritySession=session;authority=session?new Authority(session):null;localClients=new Map();}
    return authority;
  }
  function localClient(player){
    const executor=localAuthority();
    if(!localClients.has(player)){
      const client=executor.connect(player);localClients.set(player,client);let shown=client.snapshot();
      client.subscribe(next=>{const refresh=next.revision===shown.revision&&(next.reactionRevision||0)>(shown.reactionRevision||0);shown=next;
        if(refresh)queueMicrotask(()=>{if(localClients.get(player)===client&&viewer===player&&screen==='table'&&!isReplay()&&!transition&&!$('#modal-root').children.length)renderTable();});});
    }
    return localClients.get(player);
  }
  const packs = globalThis.PlayroomPacks;
  const library = new globalThis.PlayroomLibrary(() => localStorage, E, Session, packs);
  try { globalThis.PlayroomPackManager?.reconcile?.(packs,library); }
  catch (error) { globalThis.PlayroomPackLoadError ||= error.message || 'Не удалось сверить версии паков.'; }
  const $ = selector => document.querySelector(selector);
  const noticeElement=$('#toast');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const GameScreen=globalThis.PlayroomGameScreen,icon=GameScreen.icon;
  const turnNotice=GameScreen.turnNotice({play:()=>{if(settings.sound&&!document.hidden)void audio.play('turn',{volume:.45});},reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  const appVersion=globalThis.PlayroomAppVersion||'неизвестна';
  const PACK_NOTICES_KEY='playroom.pack-update-notices.v1';
  let packNotices={dismissed:[],read:[]},flashPacksOnHub=false;
  try {const saved=JSON.parse(localStorage.getItem(PACK_NOTICES_KEY)||'{}');for(const key of ['dismissed','read'])if(Array.isArray(saved[key]))packNotices[key]=saved[key].filter(value=>typeof value==='string').slice(-128);}catch(_){}
  function packUpdates(){
    const versions=new Map();
    for(const pack of packs.list())if(!versions.has(pack.id)||globalThis.TabletopPacks.compareVersions(pack.version,versions.get(pack.id))>0)versions.set(pack.id,pack.version);
    return (globalThis.PlayroomRemotePacks?.current?.packs||[]).filter(item=>versions.has(item.id)&&globalThis.TabletopPacks.compareVersions(item.version,versions.get(item.id))>0);
  }
  const updateKey=item=>item.id+'@'+item.version;
  function rememberPackUpdates(kind){
    packNotices[kind]=[...new Set([...packNotices[kind],...packUpdates().map(updateKey)])].slice(-128);
    try{localStorage.setItem(PACK_NOTICES_KEY,JSON.stringify(packNotices));}catch(_){}
  }
  function refreshPackUpdates(){
    const before=packUpdates().map(updateKey).join('|');
    void globalThis.PlayroomRemotePacks?.load().then(()=>{if(screen==='hub'&&before!==packUpdates().map(updateKey).join('|'))renderHub();});
  }
  const brand = '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>ХОД<small>β</small>';
  const botNames = ['Мика','Тео','Луна','Ника','Лев','Рэй','Сэм','Кира'];
  const randomBotName = () => {const used=new Set(room?.participants.filter(p=>p.bot).map(p=>p.nickname));const available=botNames.filter(name=>!used.has(name));return available[Math.floor(Math.random()*available.length)]||botNames[0];};
  const Tags=globalThis.PlayroomTags,hubFilters={type:'',mechanic:'',format:''};
  const catalog = globalThis.PlayroomCatalog || {};
  const animationPresets=Flow.presets;
  let settings = {sound:false, volume:.6, animationSpeed:'normal', quickPlay:false,autoPass:false};
  let viewState = {}, viewIdentity = '';
  let session = null, screen = 'hub', filter = 'all', selected = null, gate = null, viewer = 0;
  let sessionId = null, hubTab = 'games', savedFilter='all', networkSaved=[], networkSavedState='idle', networkSavedTicket=0;
  let hubEditing=false;
  let room=null,lobbyParticipantId=null,lobbyTimer=null,lobbyCountdown=null;
  let historyOpen = false, replayIndex = null, replayTimer = null, botTimer = null, autoPassTimer = null;
  let paused = false, lastResult = null, storageOK = true, modalReturn = null;
  let missedFrom = null, soundTicket = 0;
  let loadWarning = '', modalBack = null, historyOrigin = null, reactionShownAt = null;
  let input = null, packUI = null, playerTargets = null, feedbackSession = null;
  const feedback=new globalThis.PlayroomGameFeedback({mount:()=>document.querySelector('#app .table-shell')});
  let transition = null, replayTicket = 0, awaitingPass = false;
  try {
    const stored=JSON.parse(localStorage.getItem('playroom.settings.v1')||'{}');
    if(typeof stored?.sound==='boolean')settings.sound=stored.sound;
    if([.3,.6,1].includes(stored?.volume))settings.volume=stored.volume;
    if(typeof stored?.quickPlay==='boolean')settings.quickPlay=stored.quickPlay;
    if(typeof stored?.autoPass==='boolean')settings.autoPass=stored.autoPass;
    settings.animationSpeed=Flow.speed(stored?.animationSpeed!==undefined?stored.animationSpeed:stored?.motion===false?'instant':'normal');
  } catch (_) {}
  try { const saved = library.current(); if (saved) { session = saved.session; sessionId = saved.id; } }
  catch (_) { loadWarning='Не удалось восстановить сохранение. Исходная запись сохранена; остальные партии доступны в «Моих партиях».'; }
  const audio = new globalThis.TabletopAudio({enabled:settings.sound,volume:settings.volume});
  const audioVersions = new Map();
  for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
  const unlockAudio = () => {if(settings.sound&&!document.hidden)void audio.unlock();};
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
  const flow=new Flow.GameFlow({options:()=>settings,motion:Motion,presentation:()=>({minimumVisibleMs:Flow.viewingTime(catalog[session?.game]?.capabilities,session?.current)}),reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  const pace=()=>flow.pace();
  HandOverflow.attach(document);
  document.body.classList.toggle('reduced-motion',pace().duration===0);
  const meta = id => E.GAMES.find(g => g.id === id);
  const lastRulesKey='playroom.last-rules.v1';
  function defaultRules(gameId,g){
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(lastRulesKey)||'{}')?.[gameId]||{};}catch(_){}
    const presets=g.presets?.length?g.presets:[{id:'default',label:'Классический'}];
    const preset=presets.find(item=>item.id===saved.preset)||presets[0];
    const fields=catalog[gameId]?.settings||[];
    saved.options={...(catalog[gameId]?.legacyPresets?.[saved.preset]||{}),...(saved.options||{})};
    const options=Object.fromEntries(fields.map(field=>{
      const chosen=field.options?.find(option=>option.value===saved.options?.[field.key]);
      return [field.key,chosen?chosen.value:field.default??field.options?.[0]?.value];
    }));
    const rules={preset:preset.id,presetLabel:preset.label||preset.name||preset.id,
      firstPlayerMode:['rules','random','assigned'].includes(saved.firstPlayerMode)?saved.firstPlayerMode:'rules',seatOrder:saved.seatOrder==='random'?'random':'normal',openHands:!!catalog[gameId]?.capabilities?.hands&&saved.openHands===true,options};
    rules.display=Multiplayer.describeRules(rules,fields,!!catalog[gameId]?.capabilities?.hands);
    return rules;
  }
  function rememberRules(gameId,rules){
    try{
      const all=JSON.parse(localStorage.getItem(lastRulesKey)||'{}');
      const saved=all&&typeof all==='object'&&!Array.isArray(all)?all:{};
      saved[gameId]={firstPlayerMode:rules.firstPlayerMode||'rules',seatOrder:rules.seatOrder||'normal',preset:rules.preset,openHands:!!rules.openHands,options:rules.options||{}};
      localStorage.setItem(lastRulesKey,JSON.stringify(saved));
    }catch(_){}
  }
  function rememberGame(gameId){try{localStorage.setItem('playroom.last-game.v1',gameId);}catch(_){}}
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
  const needsGate = state => isPass()&&!session.options.openHands&&!!state.data.hands&&state.status!=='finished'&&!state.players[state.turn]?.bot;
  function measureNotice(){
    const inScreen=noticeElement.classList.contains('show')&&noticeElement.parentElement===document.body,style=getComputedStyle(noticeElement);
    const height=inScreen?noticeElement.getBoundingClientRect().height+parseFloat(style.marginTop)+parseFloat(style.marginBottom):0;
    document.documentElement.style.setProperty('--app-notice-height',Math.ceil(height)+'px');
  }
  function placeNotice(){
    if(!noticeElement.classList.contains('show'))return;
    const modal=$('#modal-root .modal');
    if(modal){
      if(noticeElement.parentElement!==modal){const header=modal.querySelector('.modal-head');if(header?.parentElement===modal)header.after(noticeElement);else modal.prepend(noticeElement);}
    }else if(noticeElement.parentElement!==document.body||noticeElement.nextElementSibling!==$('#app'))$('#app').before(noticeElement);
    measureNotice();
  }
  let noticeTimer=null;
  function dismissNotice(){clearTimeout(noticeTimer);noticeElement.classList.remove('show');noticeElement.textContent='';measureNotice();}
  new MutationObserver(placeNotice).observe($('#modal-root'),{childList:true,subtree:true});
  new ResizeObserver(measureNotice).observe(noticeElement);
  document.addEventListener('click',event=>{if(event.target.closest('#toast [data-command="dismiss-notice"]')){event.preventDefault();event.stopImmediatePropagation();dismissNotice();}},true);
  function toast(message) {
    clearTimeout(noticeTimer);noticeTimer=setTimeout(dismissNotice,6000);
    noticeElement.innerHTML=`<span>${esc(message)}</span><button class="icon-btn" data-command="dismiss-notice" aria-label="Закрыть сообщение" title="Закрыть сообщение">${icon('close')}</button>`;noticeElement.classList.add('show');noticeElement.setAttribute('role','alert');placeNotice();
    const modal=noticeElement.closest('.modal');if(modal)modal.scrollTop=0;
  }
  const updateBanner=$('#update-banner'),updateDetail=$('#update-detail');
  globalThis.PlayroomPWA?.setUpdateGuard(()=>screen==='hub'&&!room&&!transition&&!$('#modal-root').children.length&&!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()&&save());
  window.addEventListener('playroom-update-ready',()=>{updateBanner.hidden=false;updateDetail.textContent='';});
  $('#update-now')?.addEventListener('click',async()=>{
    const button=$('#update-now');button.disabled=true;updateDetail.textContent='Проверяем открытые окна…';
    try{await globalThis.PlayroomPWA.activateUpdate();updateDetail.textContent='Обновляем приложение…';}
    catch(error){updateDetail.textContent=error.message;button.disabled=false;}
  });
  function save() {
    if (!session||historyOrigin?.kind==='library') return true;
    try { library.write(session,sessionId); storageOK = true; loadWarning=''; return true; }
    catch (_) { toast('Не удалось сохранить партию: хранилище браузера заполнено или недоступно. Освободите место, удалив ненужные партии.'); storageOK = false; return false; }
  }
  function playSounds(before,after) {
    soundTicket++;
    if(!settings.sound||document.hidden||gate!==null)return;
    const cues=E.soundCues(after,viewer,before.events.at(-1)?.id||0);
    const ids=cues.map(c=>c.id).filter((id,i,all)=>i===0||id!==all[i-1]);
    if(ids.length)void audio.sequence(ids,{pack:after.game});
  }
  async function previewSound(id='move',pack) {
    if(!settings.sound||document.hidden)return;
    const ticket=++soundTicket;
    if(await audio.unlock()&&ticket===soundTicket&&settings.sound&&!document.hidden)void audio.sequence([id],{pack});
  }
  function stopSounds() {soundTicket++;audio.stop();}
  function cancelBot() { clearTimeout(botTimer); botTimer=null; authority?.cancelBot(); }
  function setLocalPaused(value){
    paused=value;clearTimeout(autoPassTimer);autoPassTimer=null;reactionShownAt=null;
    if(!session||historyOrigin?.kind==='library')return;
    const player=session.current.players.findIndex(p=>!p.bot);if(player<0)return;
    const client=localClient(player),snapshot=client.snapshot();if(snapshot.paused===value)return;
    void Promise.resolve(client.dispatch(Protocol.command(snapshot,{type:'session-pause',paused:value,expectedControlRevision:snapshot.controlRevision},'local-control-'+(++commandSequence)))).then(receipt=>{if(!receipt.ok)toast(receipt.message);}).catch(error=>toast(error.message));
  }
  function stopReplay(stopAudio=true) { clearTimeout(replayTimer); replayTimer=null;replayTicket++;flow.cancel();if(stopAudio)stopSounds(); }
  function orderedVisibleGames(){
    const p=globalThis.PlayroomPackManager?.displayPreferences()||{order:[],hidden:[],favorites:[]};
    const order=id=>{const i=p.order.indexOf(id);return i<0?p.order.length+E.GAMES.findIndex(g=>g.id===id):i;};
    return E.GAMES.filter(g=>!p.hidden.includes(g.id)).sort((a,b)=>order(a.id)-order(b.id));
  }
  function tile(g, featured, editing=false) {
    const info=catalog[g.id]||{},favorite=globalThis.PlayroomPackManager?.displayPreferences().favorites.includes(g.id);
    const theme=['green','coral','blue','gold','violet'].includes(info.tileTheme)?info.tileTheme:({cards:'green',board:'gold',dice:'violet'})[info.category]||'green';
    return `<article class="game-tile ${featured?'featured':''}${editing?' is-editing':''}" data-theme="${theme}" data-game="${g.id}" ${editing?'draggable="true"':''}>
      <div class="tile-top tile-tags">${Tags.forPack(info).map(t=>`<span class="pill tag-${t.kind}" aria-label="${esc(t.label)}" title="${esc(t.label)}">${t.kind==='type'?icon(t.icon):esc(t.label)}</span>`).join('')}</div>
      ${editing?'':`<button class="tile-favorite" data-favorite="${esc(g.id)}" aria-label="${favorite?'Убрать из избранного':'Добавить в избранное'}: ${esc(g.name)}" aria-pressed="${!!favorite}" title="${favorite?'Убрать из избранного':'Добавить в избранное'}">${icon('star')}</button>`}
      <div class="game-cover">${V.cover ? V.cover(g.id) : ''}</div>
      <div class="tile-content"><h2 class="tile-title">${esc(g.name)}</h2><p class="tile-description">${esc(info.tagline || g.description)}</p>
      <div class="tile-bottom"><div class="tile-meta"><span>${icon('people')} ${g.min===g.max?g.min:g.min+'–'+g.max}</span><span class="meta-time">· ${esc(info.estimatedDuration||'Своя партия')}</span></div><span class="play-tile">${featured?'За стол ':''}${icon(featured?'arrow':'play')}</span></div></div>
      ${editing?`<div class="tile-edit-actions" role="group" aria-label="Порядок и раздел: ${esc(g.name)}"><button type="button" data-edit-handle aria-label="Перетащить ${esc(g.name)}">⠿</button><button type="button" data-edit-step="-1" data-edit-id="${esc(g.id)}" aria-label="Поднять ${esc(g.name)}">${icon('up')}</button><button type="button" data-edit-step="1" data-edit-id="${esc(g.id)}" aria-label="Опустить ${esc(g.name)}">${icon('down')}</button><button type="button" data-edit-category="${esc(g.id)}" aria-label="Сменить раздел: ${esc(g.name)}">${esc(({favorites:'Избранное',normal:'Игры',hidden:'Скрытые'})[globalThis.PlayroomPackManager.category(g.id)])}</button></div>`:`<button class="tile-hit" data-start="${g.id}" aria-label="Играть в ${esc(g.name)}"></button>`}</article>`;
  }
  function recentGameCard(g){return `<div class="game-grid">${tile(g,false)}</div>`;}
  function hubFilterMarkup(){
    const visible=orderedVisibleGames(),tags=new Set(visible.flatMap(g=>Tags.forPack(catalog[g.id]).map(t=>t.id)));
    const button=(attrs,label,body,active,disabled=false)=>`<button type="button" class="filter ${active?'active':''}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}" aria-pressed="${!!active}" ${disabled?'disabled':''}>${body}</button>`;
    const formats=[['solo','Соло','player'],['duel','Дуэль','duel'],['three','Три','three'],['2+','2 и более'],['3+','3 и более'],['4+','4 и более'],['6+','6 и более'],['teams','Команды','teams']];
    return `<div class="hub-filters"><div class="filters filter-scope" role="group" aria-label="Библиотека">${button('data-filter="all"','Все игры','Все',filter==='all')}${button('data-filter="favorites"','Избранное',icon('star'),filter==='favorites')}</div><div class="filters filter-format" role="group" aria-label="Состав игроков">${formats.map(([id,label,glyph])=>button(`data-format="${id}"`,label,glyph?icon(glyph):id,hubFilters.format===id,!visible.some(g=>Tags.matches(g,catalog[g.id],id)))).join('')}</div>${['type','mechanic'].map(kind=>`<div class="filters filter-${kind}" role="group" aria-label="${kind==='type'?'Тип игры':'Механика'}">${Tags.entries.filter(t=>t.kind===kind&&tags.has(t.id)).map(t=>button(`data-tag-kind="${kind}" data-tag="${t.id}"`,t.label,kind==='type'?icon(t.icon):esc(t.label),hubFilters[kind]===t.id)).join('')}</div>`).join('')}</div>`;
  }
  function renderHub() {
    interruptAction();input?.cancel();playerTargets?.cancel();feedback.clear();cancelBot(); latestPacks();
    const updates=packUpdates(),unread=updates.some(item=>!packNotices.read.includes(updateKey(item))),newUpdates=updates.filter(item=>!packNotices.dismissed.includes(updateKey(item)));
    const flashPacks=flashPacksOnHub&&unread;flashPacksOnHub=false;
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{order:[],hidden:[],favorites:[]};
    const games=orderedVisibleGames().filter(g=>(filter!=='favorites'||preferences.favorites.includes(g.id))&&Tags.matches(g,catalog[g.id],hubFilters.format)&&['type','mechanic'].every(kind=>!hubFilters[kind]||Tags.forPack(catalog[g.id]).some(t=>t.id===hubFilters[kind])));
    const hiddenCount=E.GAMES.filter(g=>preferences.hidden.includes(g.id)).length;
    const filtering=filter!=='all'||Object.values(hubFilters).some(Boolean);
    const collectionCount=hubEditing?`ВСЕГО: ${E.GAMES.length} · СКРЫТО: ${hiddenCount}`:filtering?`ПО ФИЛЬТРУ: ${games.length} · СКРЫТО: ${hiddenCount}`:`ПОКАЗАНО: ${E.GAMES.length-hiddenCount} · СКРЫТО: ${hiddenCount}`;
    let lastGameId;try{lastGameId=localStorage.getItem('playroom.last-game.v1');}catch(_){}
    const lastGame=filter==='all'?games.find(g=>g.id===(lastGameId||session?.game)):null;
    const favorites=filter==='all'?games.filter(g=>preferences.favorites.includes(g.id)):[];
    const others=filter==='all'?games.filter(g=>!preferences.favorites.includes(g.id)):games;
    const editSections=hubEditing?['favorites','normal','hidden'].map(group=>{
      const labels={favorites:'Избранные',normal:'Игры',hidden:'Скрытые'},items=globalThis.PlayroomPackManager.ordered(E.GAMES.map(g=>g.id),preferences).map(id=>E.GAMES.find(g=>g.id===id)).filter(g=>globalThis.PlayroomPackManager.category(g.id,preferences)===group);
      return `<section class="hub-game-section hub-edit-section" data-edit-drop="${group}" aria-label="${labels[group]}"><h2 class="hub-section-title">${labels[group]}</h2><div class="game-grid">${items.map(g=>tile(g,false,true)).join('')}</div>${items.length?'':'<p class="hub-edit-empty">Перетащите сюда игру</p>'}</section>`;
    }).join(''):'';
    const sections=hubEditing?editSections:filter==='all'?`${lastGame?`<section class="hub-game-section recent-section" aria-label="Последняя игра">${recentGameCard(lastGame)}</section>`:''}${favorites.length?`<section class="hub-game-section favorites-section" aria-label="Избранные игры"><div class="game-grid">${favorites.map(g=>tile(g,false)).join('')}</div></section>`:''}<section class="hub-game-section other-section" aria-label="Остальные игры"><div class="game-grid">${others.map(g=>tile(g,false)).join('')}</div></section>`:`<section class="game-grid" aria-label="Коллекция игр">${games.map((g,i)=>tile(g,i===0)).join('')}</section>`;
    $('#app').innerHTML = `<div class="app-shell"><aside class="sidebar"><button class="brand" data-command="home" aria-label="ХОД — главная">${brand}</button>
      <nav class="side-nav" aria-label="Основная навигация"><button class="nav-item ${hubTab==='games'?'current':''}" data-command="home">${icon('grid')}Все игры</button><button class="nav-item ${hubTab==='sessions'?'current':''}" data-command="sessions">${icon('history')}Мои партии</button><button class="nav-item" data-appearance-editor>${icon('palette')}${esc(globalThis.PlayroomAppearanceUI.text('themes.title'))}</button></nav>
      <div class="sidebar-note"><span class="little-dice">${icon('dice')}</span>Хороший повод<br>собраться за столом.<br><br><span class="eyebrow" style="font-size:8px">PLAYROOM / ${esc(appVersion)}</span></div></aside>
      <main class="hub-main"><header class="topbar"><span class="eyebrow muted">ИГРЫ В ХОРОШЕЙ КОМПАНИИ</span><button class="brand mobile-brand" data-command="home" aria-label="ХОД — главная">${brand}</button>
      <div class="topbar-tools ui-toolbar">${GameScreen.toolbar([
        {attrs:'data-command="packs"',label:unread?'Паки игр: есть непросмотренные обновления':'Паки игр',name:'layers',className:`pack-hub-button${unread?' has-unread':''}${flashPacks?' flash-unread':''}`},
        {attrs:'data-command="fullscreen"',label:'Полный экран',name:'full'},
        {attrs:'data-command="help"',label:'Как играть',name:'help'}
      ])}</div></header>
      ${hubTab==='sessions'?`<div id="saved-games-panel">${savedGamesMarkup()}</div>`:`${newUpdates.length?`<div class="pack-update-notice" role="status"><span>${newUpdates.length===1?'Доступно обновление одного пака':`Доступны обновления паков: ${newUpdates.length}`}</span><button type="button" class="btn secondary" data-command="packs">Посмотреть</button><button type="button" class="icon-btn" data-command="dismiss-pack-updates" aria-label="Закрыть уведомление об обновлениях паков">${icon('close')}</button></div>`:''}<section class="intro"><h1>Маленький стол.<br><span>Большая компания.</span></h1><p>Любимые настолки, всегда под рукой. <br>Сыграйте с ботом или передайте <br>телефон другу. Следующий ход — ваш.</p></section>
      ${loadWarning?`<p class="recovery-note" role="alert">${esc(loadWarning)}<button class="icon-btn" data-command="dismiss-recovery" aria-label="Закрыть предупреждение">${icon('close')}</button></p>`:''}
      ${session?GameScreen.resumeCard({title:(session.current.status==='finished'?'Последняя партия':'Ваш стол всё ещё ждёт')+' · '+meta(session.game).name,detail:session.current.status==='finished'?'Результат и история сохранены':`Ход ${session.current.move+1} · ${isPass()?'Игра вместе':'Игра с ботами'}`}):''}
      <div class="library-heading">${hubEditing?'':hubFilterMarkup()}<div class="hub-library-tools"><span class="collection-count">${collectionCount}</span><button type="button" class="btn secondary hub-edit-toggle" data-edit-toggle aria-pressed="${hubEditing}">${icon(hubEditing?'check':'edit')} ${hubEditing?'Готово':'Изменить порядок'}</button></div></div>
      ${sections}${!E.GAMES.length?'<div class="packs-empty-hub"><h2>Начните с первой игры</h2><p>Приложение готово. Добавьте файл пака: в нём есть правила, компоненты и оформление вашей игры.</p><button class="btn" data-command="packs">Установить пак игры</button></div>':!games.length?'<p class="lead">В этой категории пока нет игр.</p>':''}`}
      <footer class="hub-footer"><span class="hub-footer-brand">${icon('hand')}<span class="hub-footer-lines"><span>Сделано для игры, а не для спешки</span><span class="eyebrow">PLAYROOM / ${esc(appVersion)}</span></span></span><span>Без регистрации.<br class="mobile-text"> Даже без интернета.</span></footer></main></div>`;
    if(hubTab==='sessions')refreshNetworkSaved();
  }
  function moveHubGame(id,group,beforeId=null){
    globalThis.PlayroomPackManager.moveGame(id,group,beforeId,E.GAMES.map(game=>game.id));
    renderHub();
  }
  function editHubStep(id,step){
    const manager=globalThis.PlayroomPackManager,prefs=manager.displayPreferences(),group=manager.category(id,prefs);
    const ids=manager.ordered(E.GAMES.map(game=>game.id),prefs).filter(item=>manager.category(item,prefs)===group),at=ids.indexOf(id),to=at+step;
    if(to<0||to>=ids.length)return;
    moveHubGame(id,group,step<0?ids[to]:ids[to+1]||null);
  }
  function hubDropAt(id,target){
    const section=target?.closest?.('[data-edit-drop]');if(!section)return;
    const card=target.closest('.game-tile[data-game]');
    if(card?.dataset.game===id)return;
    moveHubGame(id,section.dataset.editDrop,card?.dataset.game||null);
  }
  function savedGamesMarkup(){
    let local=[];
    try{local=library.list();}catch(_){return '<p class="recovery-note" role="alert">Хранилище локальных партий недоступно. Записи не изменены.</p>';}
    const date=value=>new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const entries=[...local.map(x=>({...x,kind:'local'})),...networkSaved.map(x=>({...x,kind:'network'}))]
      .filter(x=>savedFilter==='all'||x.kind===savedFilter).sort((a,b)=>b.updatedAt-a.updatedAt||Number(b.active)-Number(a.active));
    const cards=entries.map(entry=>{
      const network=entry.kind==='network',host=entry.role!=='client',blocked=entry.invalid||entry.missingPack;
      const name=entry.invalid?'Сохранение':meta(entry.game)?.name||entry.game;
      const id=network?(host?entry.sessionId:'client:'+entry.id):entry.id;
      const status=network?'Сетевая · '+(host?'Хост':'Клиент'):'Локальная · '+(entry.missingPack?'Нужен пак':entry.invalid?'Ошибка сохранения':entry.finished?'Завершена':'На паузе');
      const count=network?Number(entry.revision)||0:Number(entry.move)||0;
      const summary=network?entry.name:(entry.mode==='pass'?'На одном устройстве':'С ботами')+' · '+(entry.preset||'Основной набор');
      const details=blocked?`<p>${entry.missingPack?'Партия создана с несовместимой версией игры '+esc(entry.packVersion)+'. Можно удалить её с устройства.':'Запись сохранена без изменений.'}</p>`:
        `<p class="saved-players">${(entry.participants||entry.players?.map(nickname=>({nickname,role:'player',local:!network}))||[]).map(p=>`<span class="saved-participant">${globalThis.TabletopUI.helpers.participantIcon({...p,local:!network&&!p.bot||p.local},{network})}<span class="${(!network&&!p.bot||network&&(entry.participantId&&p.id===entry.participantId||host&&p.isHost||p.local&&!p.bot))?'saved-self':''}">${esc(p.nickname||p.name)}</span></span>`).join(' · ')}</p>${summary?`<p class="saved-summary">${esc(summary)}</p>`:''}${entry.result?`<p class="saved-result">${esc(entry.result)}</p>`:''}<p>Версия игры: ${esc(entry.packVersion)} · Последний ход: ${esc(date(entry.updatedAt))}</p>${network&&!host&&entry.savedFrames<entry.revision+1?'<p>Часть истории ещё не загружена</p>':''}`;
      const history=network?`data-network-history="${esc(id)}"`:`data-history-id="${esc(id)}"`;
      const continuation=network?`data-network-continue="${esc(id)}"`:`data-resume-id="${esc(id)}"`;
      const label=network&&!host?'Присоединиться к партии':'Продолжить партию';
      return `<article class="saved-game" ${network?`data-network-session-id="${esc(id)}"`:`data-session-id="${esc(id)}"`}><div><div class="saved-status"><span class="pill">${status}</span>${blocked?'':`<span class="muted">${count} действий</span>`}</div><h2>${esc(name)}</h2>${details}</div><div class="saved-game-actions">
        ${entry.missingPack?`<button class="icon-btn" data-command="packs" aria-label="Установить пак" title="Установить пак">${icon('layers')}</button>`:blocked?'':`<button class="icon-btn saved-history" ${history} aria-label="История партии" title="История партии">${icon('history')}</button><button class="icon-btn saved-continue" ${continuation} aria-label="${entry.finished?'Партия завершена':label}" title="${entry.finished?'Партия завершена':label}" ${entry.finished?'disabled':''}>${icon('play')}</button>`}
        ${`<button class="icon-btn saved-delete" data-delete-id="${esc(id)}" ${network?'data-delete-network="true"':''} aria-label="Удалить партию ${esc(name)}" title="Удалить партию">${icon('trash')}</button>`}</div></article>`;
    }).join('');
    const filters=[['all','Все'],['local','Локальные'],['network','Сетевые']].map(([value,label])=>
      `<button type="button" class="filter ${savedFilter===value?'active':''}" data-saved-filter="${value}" aria-pressed="${savedFilter===value}">${label}</button>`).join('');
    const note=networkSavedState==='loading'?'<p class="saved-network-info" role="status">Загружаем сетевые сохранения…</p>':
      networkSavedState==='error'?'<p class="recovery-note" role="alert">Сетевой архив этого браузера недоступен. Локальные партии не затронуты.</p>':'';
    return `<header class="saved-heading"><div><h1>Мои партии</h1><p>Сохранённые локальные и сетевые партии, повторы и продолжение игры.</p></div><div class="saved-heading-actions"><button class="btn secondary" data-clear-games ${local.length+networkSaved.length?'':'disabled'}>${icon('trash')} Удалить все партии</button><button class="btn" data-command="home">Новая партия ${icon('arrow')}</button></div></header>
      <div class="saved-filter-bar" role="group" aria-label="Тип партии">${filters}</div>${note}
      <section class="saved-games-list" aria-label="Сохранённые партии">${entries.length?cards:'<div class="saved-empty"><h2>Пока нет партий</h2><p>Начните игру или проверьте другой раздел.</p><button class="btn" data-command="home">Выбрать игру</button></div>'}</section>`;
  }
  async function refreshNetworkSaved(){
    const ticket=++networkSavedTicket;networkSavedState='loading';networkSaved=[];
    try{
      const records=await globalThis.PlayroomNetworkLibrary?.list?.()||[];
      if(ticket!==networkSavedTicket||hubTab!=='sessions'||screen!=='hub')return;
      networkSaved=records;networkSavedState='ready';
    }catch(_){if(ticket!==networkSavedTicket)return;networkSavedState='error';}
    if(ticket===networkSavedTicket&&screen==='hub'&&hubTab==='sessions'){
      updateSavedPanel();
    }
  }
  function updateSavedPanel(){
    const panel=$('#saved-games-panel');if(!panel)return;
    const position=window.scrollY;panel.innerHTML=savedGamesMarkup();window.scrollTo(0,position);
  }

  function leaveTable(tab='games') {
    if(historyOrigin)restoreHistoryOrigin();
    clearTimeout(autoPassTimer);autoPassTimer=null;
    interruptAction();input?.cancel();playerTargets?.cancel();cancelBot();stopReplay();
    if(screen==='table')save();
    if(room?.transportMode==='hotseat'){roomService.discardRecovery(room.id);room=null;lobbyParticipantId=null;}
    screen='hub';hubTab=tab;filter='all';Object.assign(hubFilters,{type:'',mechanic:'',format:''});historyOpen=false;replayIndex=null;selected=null;paused=true;
    closeModal(true);flashPacksOnHub=true;render();refreshPackUpdates();
  }
  function resumeSession(id=sessionId,{history=false}={}) {
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast('Сначала покиньте текущую сетевую комнату через лобби.');
    if(!id)return toast('Выберите игру — ваш стол появится здесь.');
    try {
      if(history){openLibraryHistory(id);return;}
      interruptAction();input?.cancel();cancelBot();stopReplay();
      if(id!==sessionId) {
        if(!save())return;
        const next=library.open(id);library.activate(next,id);session=next;sessionId=id;storageOK=true;
      }
      if(!session)return;
      activateSession();restoreSessionLobby();
      rememberGame(session.game);
      screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;awaitingPass=false;lastResult=null;missedFrom=null;
      viewer=isPass()&&!session.current.players[session.current.turn]?.bot?session.current.turn:session.current.players.findIndex(p=>!p.bot);gate=needsGate(session.current)?viewer:null;
      setLocalPaused(false);closeModal(true);render();
      if(session.current.status==='finished')openHistory();
    } catch(error) {toast('Не удалось открыть партию. '+error.message);}
  }
  function restoreSessionLobby(){
    const saved=session.options.lobbyConfig,players=session.current.players;
    let matches=false;
    try{matches=saved&&Array.isArray(saved.seats)&&Array.isArray(saved.participants)&&saved.game?.id===session.game&&saved.game?.version===session.packVersion&&
      saved.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index).every((seat,i)=>{
        const p=saved.participants.find(p=>p.id===seat.participantId);return p&&p.nickname===players[i]?.name&&!!p.bot===!!players[i]?.bot;
      })&&saved.seats.filter(s=>s.participantId).length===players.length;}catch(_){}
    try{if(!matches)throw Error('Legacy lobby');room=roomService.restoreHotSeatLobby(saved,{hostId:playerProfile.id,active:true});}
    catch(_){
      // Legacy saves still open. Rebuild a locked view from the actual session.
      const g=meta(session.game),host={id:playerProfile.id,nickname:playerProfile.name};
      let draft=roomService.create({name:'Комната '+host.nickname,host,game:{id:session.game,name:g.name,version:session.packVersion},rules:{preset:session.options.preset,presetLabel:session.options.presetLabel,openHands:!!session.options.openHands,options:Object.fromEntries((catalog[session.game]?.settings||[]).map(field=>[field.key,session.options[field.key]??field.default]))},constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
      draft=roomService.configure(draft.id,host.id,{transportMode:'hotseat'});
      const hostIndex=Math.max(0,players.findIndex(p=>!p.bot));
      if(hostIndex)draft=roomService.moveParticipant(draft.id,host.id,host.id,draft.seats[hostIndex].id);
      for(let i=0;i<players.length;i++){
        const player=players[i];
        if(i===hostIndex)draft=roomService.renameLocalSeat(draft.id,host.id,draft.seats[i].id,player.name);
        else draft=roomService.setLocalSeat(draft.id,host.id,draft.seats[i].id,{kind:player.bot?'bot':'human',nickname:player.name});
      }
      room=roomService.restoreHotSeatLobby(draft,{hostId:host.id,active:true});
    }
    lobbyParticipantId=room.ownerId;
  }
  function askDelete(id) {
    const entry=library.list().find(entry=>entry.id===id);if(!entry)return;
    openModal(PlayroomGameScreen.deleteConfirmation({name:entry.invalid?'Это сохранение':meta(entry.game)?.name||entry.game,confirmAttrs:`data-delete-confirm="${esc(id)}"`}));
  }
  function refreshSavedGameRecovery(){
    try{
      const saved=library.current();
      if(saved&&!session){session=saved.session;sessionId=saved.id;}
      loadWarning='';
    }catch(_){
      loadWarning='Не удалось восстановить сохранение. Исходная запись сохранена; остальные партии доступны в «Моих партиях».';
    }
  }
  async function deleteNetworkSession(id){
    try{await globalThis.PlayroomNetworkLibrary.remove(id);closeModal(true);await refreshNetworkSaved();}catch(error){toast(error.message);}
  }
  function askDeleteNetwork(id){
    const entry=networkSaved.find(entry=>(entry.role==='client'?'client:'+entry.id:entry.sessionId)===id);if(!entry)return;
    openModal(PlayroomGameScreen.deleteConfirmation({name:meta(entry.game)?.name||entry.game||'Это сохранение',network:true,confirmAttrs:`data-delete-network-confirm="${esc(id)}"`}));
  }
  function deleteSession(id) {
    const position=window.scrollY;
    try {
      library.remove(id);
      if(id===sessionId){interruptAction();cancelBot();stopReplay();session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;}
      if(packs?.warnings?.some(warning=>/^Встроенный пакет /.test(warning))) {
        try {
          globalThis.PlayroomPackManager?.reconcile?.(packs,library);
          for(const [packId,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(packId,pack.sounds);
        }catch(error){globalThis.PlayroomPackLoadError=error.message||'Не удалось пересчитать версии паков.';}
      }
      refreshSavedGameRecovery();
      screen='hub';hubTab='sessions';closeModal(true);render();window.scrollTo(0,position);
    } catch (_) {toast('Не удалось удалить партию: хранилище браузера недоступно.');}
  }
  function clearDeletedSession(){
    if(sessionId&&library.records().some(record=>record.id===sessionId))return;
    interruptAction();cancelBot();stopReplay();session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;
    refreshSavedGameRecovery();
  }
  async function askClearGames(){
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast('Сначала покиньте текущую сетевую комнату.');
    try{
      const local=library.records(),network=await globalThis.PlayroomNetworkLibrary.list({strict:true});
      if(!local.length&&!network.length)return;
      openModal(`${modalHead('Удалить все партии?')}<p class="lead">Все ${local.length+network.length} сохранённых партий и их истории будут удалены с этого устройства. Паки игр останутся.</p><div class="modal-foot"><button class="btn secondary" data-command="close-modal">Оставить</button><button class="btn coral" data-clear-games-confirm>${icon('trash')} Удалить все партии</button></div>`);
    }catch(error){toast(error.message);}
  }
  async function clearGames(){
    try{
      const network=await globalThis.PlayroomNetworkLibrary.list({strict:true});
      for(const entry of network)await globalThis.PlayroomNetworkLibrary.remove(entry.role==='client'?'client:'+entry.id:entry.sessionId);
      for(const record of library.records())library.remove(record.id);
      clearDeletedSession();closeModal(true);renderHub();
    }catch(error){toast('Не удалось очистить все партии: '+error.message);renderHub();}
  }
  function activeActions(state) {
    if (transition||isReplay()||gate!==null||paused||state.status==='finished'||state.players[viewer]?.bot) return [];
    const actions=localClient(viewer).snapshot().actions;return awaitingPass?actions.filter(action=>E.reactions?.(state,viewer).some(reaction=>Protocol.canonical(reaction)===Protocol.canonical(action))):actions;
  }
  function playersMarkup(state,actions=[]) {
    return GameScreen.playersMarkup(state,viewer,actions,{scoreLabel:meta(session.game).scoreLabel||'очки',playerBadge:(projected,i)=>catalog[projected.game]?.playerBadge?.(projected,i)});
  }
  function renderTable(animate=false,preserveField=false) {
    if (!session) return renderHub();
    activateSession();
    const state=currentState(), game=meta(session.game), replay=isReplay(), actions=activeActions(state), passProtected=handoffDelay()>0;
    const shownViewer=gate!==null?-1:viewer, projected=E.project(state,shownViewer);
    const identity=[sessionId,state.game,shownViewer,...(catalog[state.game]?.capabilities?.viewStateScope==='match'?[]:[state.turn])].join(':');if(identity!==viewIdentity){viewIdentity=identity;viewState={};}
    projected.players=projected.players.map(p=>({...p,local:!p.bot}));
    if(feedbackSession!==session){feedbackSession=session;feedback.start(E.project(session.current,viewer).events);}
    const turnPlayer=state.players[state.turn], finished=state.status==='finished';
    const turnText=replay?'Просмотр истории':transition?'Показываем ход…':finished?'Партия завершена':paused?'Пауза':turnPlayer?.bot?`${turnPlayer.name} думает…`:isPass()?`Ходит ${turnPlayer?.name}`:'Ваш ход';
    const oldHand=$('.hand-track, .hand-cards, .hand-scroll'); const scrollLeft=oldHand?.scrollLeft||0;
    const eventText=replay&&replayIndex===0?'Начальная расстановка':lastEvent(projected)?.text||'Выберите доступное действие на столе';
    const markup=GameScreen.render({
      gameName:game.name,subtitle:session.options.presetLabel||'Основной набор',
      state:projected,viewer:shownViewer,actions,scoreLabel:game.scoreLabel||'очки',
      playerBadge:(visible,i)=>catalog[visible.game]?.playerBadge?.(visible,i),
      turnText,turnExtra:replay?`Ход ${replayIndex} из ${session.states.length-1}`:`Ход ${state.move+1} · ${!state.data.hands?'Открытое поле':session.options.openHands?'Руки открыты':'Руки скрыты'}`,
      replay,busy:!!transition,botThinking:!replay&&!!turnPlayer?.bot,animationSpeed:settings.animationSpeed,
      scene:V.render(projected,shownViewer,actions,{selected,viewState,presentationTurn:transition?.beforeTurn,preferences:TabletopUI.viewPreferences(state.game,shownViewer),flipped:shownViewer===1,quickPlay:settings.quickPlay})+(paused&&!replay?`<div class="pause-cover"><h2>Стол подождёт</h2><p>Партия на паузе. Можно сделать вдох.</p><button class="btn" data-command="pause">Продолжить ${icon('play')}</button></div>`:''),
      historyHTML:historyOpen?historyMarkup():'',historyCaption:eventText,historyResult:session.current.status==='finished',roomAction:room?{attrs:'data-command="room"'}:null,pause:paused,readOnly:historyOrigin?.kind==='library',
      beforeFooter:isPass()&&!replay&&!finished?GameScreen.iconButton('data-command="pass-device"','Передать ход','arrow',{className:'pass-device-button'+(awaitingPass&&!paused&&!transition&&!passProtected?' handoff-pending':''),disabled:!awaitingPass||!!transition||paused||gate!==null||passProtected}):'',
      footerText:eventText,footerTitle:lastEvent(projected)?.text||'Новая партия',saved:storageOK,
      footerAction:{command:finished?'result':'pause',label:finished?'Результаты':paused?'Продолжить':'Пауза',icon:finished?'arrow':paused?'play':'pause'}
    });
    GameScreen.update($('#app'),markup);
    const newHand=$('.hand-track, .hand-cards, .hand-scroll'); if(newHand)newHand.scrollLeft=scrollLeft;
    HandOverflow.sync($('#app'));
    ensureRoomButton();GameScreen.layoutScene($('#app'));
    feedback.refresh();playerTargets?.refresh();
    if(replay)turnNotice.reset();
    else turnNotice.observe({sessionId:sessionId||session.createdAt,revision:state.move,turn:state.turn,viewer,status:state.status,paused,active:screen==='table'&&!transition&&gate===null&&!document.hidden,mount:$('#app')});
    if(gate!==null&&!replay)showGate();
    if(!transition&&!replay&&gate===null)presentationReady();
    scheduleBot();scheduleAutoPass();
  }
  function historyMarkup() {
    const idx=replayIndex??session.states.length-1;
    const chooser=historyOrigin?.kind==='library'&&isPass()?`<label class="history-viewer">Игрок<select id="history-viewer" aria-label="Смотреть историю за игрока">${session.current.players.map((p,i)=>`<option value="${i}" ${i===viewer?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:'';
    return chooser+GameScreen.historyMarkup({index:idx,count:session.states.length-1,playing:!!replayTimer});
  }
  function scrubHistory(index) {
    const slider=$('#replay-range'),focused=document.activeElement===slider;input?.cancel();stopReplay();replayIndex=Math.max(0,Math.min(session.states.length-1,index));selected=null;renderTable();
    if(slider){slider.value=String(replayIndex);$('#replay-range')?.replaceWith(slider);if(focused)slider.focus();}
  }
  function handoffDelay(){
    const window=session&&E.reactionWindows(session.current).find(w=>w.owner===viewer);
    if(!window||window.owner!==viewer)return 0;
    return Math.max(0,(window.botMs||3000)-(Date.now()-(reactionShownAt?.id===window.id?reactionShownAt.at:Date.now())));
  }
  function transferDevice(){
    if(!awaitingPass||transition||paused||isReplay()||gate!==null||handoffDelay()>0)return;
    clearTimeout(autoPassTimer);autoPassTimer=null;awaitingPass=false;
    if(needsGate(session.current))gate=session.current.turn;else viewer=session.current.turn;
    renderTable();
  }
  function scheduleAutoPass(){
    clearTimeout(autoPassTimer);autoPassTimer=null;
    if(!awaitingPass||transition||paused||isReplay()||gate!==null||screen!=='table'||document.hidden||$('#modal-root').children.length)return;
    const wait=handoffDelay();
    if(settings.autoPass||wait>0)autoPassTimer=setTimeout(()=>{
      if(screen!=='table'||document.hidden||$('#modal-root').children.length)return;
      if(settings.autoPass)transferDevice();else renderTable();
    },wait);
    else if($('#app [data-command=pass-device]')?.disabled)renderTable();
  }
  function presentationReady(){
    if(!session||isReplay()||transition||paused)return;
    for(const window of E.reactionWindows(session.current)){
      if(window.owner===viewer&&reactionShownAt?.id!==window.id)reactionShownAt={id:window.id,at:Date.now()};
      const client=localClient(window.owner),snapshot=client.snapshot();
      if(client.presentationReady&&Protocol.presentationReady)client.presentationReady(Protocol.presentationReady(snapshot));
    }
  }
  function showGate() {
    if($('.handoff'))return;
    const player=session.current.players[gate];
    $('.table-shell').inert=true;
    $('#app').insertAdjacentHTML('beforeend',`<section class="handoff" role="dialog" aria-modal="true" aria-label="Передача хода"><div class="handoff-content"><div class="handoff-art" aria-hidden="true"><span>✦</span><span>✦</span></div><span class="eyebrow muted">ПЕРЕДАЙТЕ УСТРОЙСТВО</span><h2>${esc(player.name)}, ваш ход</h2><p>Карты закрыты. Убедитесь, что телефон<br>у нужного игрока, и откройте свою руку.</p><button class="btn" data-command="unlock">Я ${esc(player.name)} · открыть ${icon('eye')}</button></div>${GameScreen.iconButton('data-command="home"','Вернуться к играм','back',{className:'handoff-nav'})}</section>`);
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
    transition=null;clearTimeout(run.timer);flow.cancel();
    if(session!==run.session)return;
    if(isPass()&&session.current.turn!==run.beforeTurn&&session.current.status!=='finished'&&!session.current.players[session.current.turn]?.bot&&session.current.turn!==viewer){
      awaitingPass=true;
    }
    presentationReady();
    if(redraw&&screen==='table'&&!isReplay())renderTable();
    if(result&&screen==='table'&&!isReplay()&&!$('#modal-root').children.length&&session.current.status==='finished'&&lastResult!==session.createdAt){lastResult=session.createdAt;showResult();}
  }
  function interruptAction() { if(transition)finishAction(transition,{redraw:false,result:false}); }
  const cardTransfers=(before,after)=>Authority.transfers(before,after,E.project(after,viewer).events);
  function act(actor,action,context={}) {
    if(transition||isReplay()||paused||gate!==null)return;
    try {
      const beforeState=session.current,beforeTurn=beforeState.turn,timing=pace(),snapshot=flow.capture({actor,action,viewer,playedFrom:context.playedFrom});
      if(session.current.players[actor]?.bot)localAuthority().actBot(actor,action);
      else {const client=localClient(actor),receipt=client.dispatch(Protocol.command(client.snapshot(),action,'local-'+(++commandSequence)));if(receipt.ignored||receipt.code==='REACTION_WAIT')return;if(!receipt.ok)throw Error(receipt.message);}
      selected=null;playerTargets?.cancel();playSounds(beforeState,session.current);
      feedback.accept(E.project(session.current,viewer).events,[],session.game,{duration:Math.max(220,timing.duration+200)});
      save();input?.cancel();
      if(catalog[session.game]?.capabilities?.quietActions?.includes(action.type)){renderTable(false,true);return;}
      const run={session,beforeTurn,timer:null};transition=run;
      renderTable();
      Promise.all([flow.play(snapshot,{draws:cardTransfers(beforeState,session.current).filter(draw=>draw.privateTo==null||(Array.isArray(draw.privateTo)?draw.privateTo.includes(viewer):draw.privateTo===viewer))}),feedback.whenIdle()]).then(()=>{
        if(transition===run)run.timer=setTimeout(()=>finishAction(run),timing.settle);
      }).catch(()=>finishAction(run));
    } catch(error){toast(error.message||'Это действие сейчас недоступно');void previewSound('error',session?.game);}
  }
  function openModal(content,className='',{keepAudio=false}={}) {
    const existing=className&&$('#modal-root .'+className);
    if(existing&&(className==='room-setup-modal'||className==='pack-manager-modal')){GameScreen.updateModal(existing,content);return;}
    const returnToRoom=!!$('#modal-root .room-setup-modal')&&className!=='room-setup-modal';
    dismissNotice();const focused=document.activeElement;interruptAction();stopReplay(!keepAudio);input?.cancel();cancelBot();if(screen==='table')renderTable();cancelBot();modalReturn=focused?.isConnected?focused:focused?.dataset?.command?$('#app [data-command="'+focused.dataset.command+'"]'):focused;modalBack=returnToRoom?($('#modal-root [data-command=lobby-start]')?renderLobby:()=>globalThis.PlayroomNetworkLibrary?.openRoom?.()):null;$('#app').inert=true;
    const template=document.createElement('template');template.innerHTML=content;
    if(!template.content.querySelector('.modal-head')){
      const title=template.content.querySelector('h2');if(title){const text=title.textContent;title.remove();content=GameScreen.modalHead(text)+template.innerHTML;}
    }
    $('#modal-root').innerHTML=`<div class="modal-backdrop"><section class="modal ${className}" role="dialog" aria-modal="true">${GameScreen.modalContent(content)}</section></div>`;
    placeNotice();
    const heading=$('.modal h2'); if(heading){heading.id='dialog-title';$('.modal').setAttribute('aria-labelledby','dialog-title');}
    $('.modal button,.modal input,.modal select')?.focus();
  }
  function closeModal(ignoreBack=false) {
    dismissNotice();
    if($('#profile-form')&&!playerProfile?.name&&!ignoreBack)return;

    const back=modalBack;modalBack=null;
    if(back&&!ignoreBack){back();return;}
    stopSounds();$('#modal-root').innerHTML='';placeNotice();$('#app').inert=false;modalReturn?.focus?.();scheduleBot();scheduleAutoPass();
    window.dispatchEvent(new Event('playroom:game-options'));
  }
  const modalHead = GameScreen.modalHead;
  function ensureRoomButton(){
    const tools=$('#app .topbar-tools')||$('#app .table-tools');
    if(!tools||tools.closest('.table-shell')||!room||tools.querySelector('[data-command="room"]'))return;
    const node=document.createElement('button');node.className='icon-btn';node.dataset.command='room';node.setAttribute('aria-label','Комната');node.title='Комната';node.innerHTML=icon('room');tools.prepend(node);
  }
  new MutationObserver(ensureRoomButton).observe($('#app'),{subtree:true,childList:true});
  function setup(gameId,draft=null) {
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast('Сначала покиньте текущую сетевую комнату через лобби.');
    if(room)leaveLobby();
    const active=activatePack(gameId),g=meta(gameId);if(!g){packUI?.open();return;}
    const rules=defaultRules(gameId,g);
    const host={id:playerProfile?.id||'local-host',nickname:playerProfile?.name||'Игрок'};
    room=roomService.create({name:'Комната '+host.nickname,host,game:{id:gameId,name:g.name,version:active.version},rules,constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
    lobbyParticipantId=host.id;room=roomService.configure(room.id,host.id,{transportMode:'hotseat'});
    for(let i=1;i<g.min;i++)room=roomService.setLocalSeat(room.id,host.id,room.seats[i].id,{kind:'bot',nickname:randomBotName()});
    renderLobby();
  }
  function roomRulesFromForm(form){
    const game=form.dataset.game,packOptions=Object.fromEntries((catalog[game]?.settings||[]).map(field=>[field.key,form.elements['option-'+field.key].value]));
    const rules={firstPlayerMode:form.elements.firstPlayerMode.value,seatOrder:form.elements.seatOrder.value,preset:form.elements.preset.value,presetLabel:form.elements.preset.selectedOptions[0].textContent,openHands:!!form.elements.openHands?.checked,options:packOptions};
    return {...rules,display:Multiplayer.describeRules(rules,catalog[game]?.settings||[],!!catalog[game]?.capabilities?.hands)};
  }
  function latestRoomEvent(type){return room?.events?.slice().reverse().find(event=>!type||event.type===type)||null;}
  function renderLobby(){
    if(!room)return;dismissNotice();
    room=roomService.snapshot(room.id);ensureRoomButton();
    if(screen==='lobby'){screen='hub';renderHub();}
    const state=room,isHost=state.ownerId===lobbyParticipantId;
    openModal(PlayroomLobbyView.render({room:state,participantId:lobbyParticipantId,isHost,canStart:isHost&&roomService.canStart(state.id),countdown:lobbyCountdown??3,notice:state.phase==='lobby'&&state.participants.find(p=>p.id===lobbyParticipantId)?.rulesNotice?latestRoomEvent('rules-changed')?.text||'':''}),'room-setup-modal');
    PlayroomLobbyView.bindFirst($('#modal-root .lobby-shell'),id=>{room=roomService.configure(room.id,lobbyParticipantId,{firstParticipantId:id});renderLobby();});
    PlayroomLobbyView.bindDrag($('#modal-root .lobby-shell'),{canMove:()=>isHost&&state.phase==='lobby'&&!state.recovery,move(id,slot){room=roomService.moveParticipant(room.id,lobbyParticipantId,id,slot==='spectator'?null:slot);renderLobby();},onError:error=>toast(error.message)});
  }
  function cycleRoomSeat(id){
    const seat=room.seats.find(s=>s.id===id),p=room.participants.find(p=>p.id===seat.participantId);
    if(seat.closed){room=roomService.setLocalSeat(room.id,lobbyParticipantId,id,{kind:'empty'});renderLobby();return;}
    if(p){room=roomService.setLocalSeat(room.id,lobbyParticipantId,id,{kind:'closed'});renderLobby();return;}
    room=roomService.setLocalSeat(room.id,lobbyParticipantId,id,{kind:'bot',nickname:randomBotName()});renderLobby();
  }
  function setRoomOption(key,value,confirmed=false){
    if(key==='transportMode'&&value==='hotseat'){
      const guests=room.participants.filter(p=>!p.isHost&&!p.bot&&!p.local);
      if(guests.length&&!confirmed){openModal(`${modalHead('Перейти в локальную игру?')}<p>Подключённые участники будут отключены, их места освободятся. Боты и правила сохранятся.</p><button class="btn" data-command="room-hotseat-confirm">Перейти</button>`);modalBack=renderLobby;return;}
      globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room.id,{preserveRoom:true});
      for(const p of guests)room=roomService.kick(room.id,lobbyParticipantId,p.id);
    }
    if(key==='transportMode'&&value==='network')for(const p of room.participants.filter(p=>p.local&&!p.bot&&!p.isHost))room=roomService.setLocalSeat(room.id,lobbyParticipantId,p.seatId,{kind:'empty'});
    room=roomService.configure(room.id,lobbyParticipantId,{[key]:value});renderLobby();
  }
  function startHotSeat(){
    room=roomService.prepareStart(room.id,lobbyParticipantId);dismissNotice();
    const seats=room.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index),players=seats.map(s=>{const p=room.participants.find(p=>p.id===s.participantId);return {name:p.nickname,bot:!!p.bot};});
    if(!players.some(p=>!p.bot))throw Error('Нужно хотя бы одно место игрока');
    if(room.firstPlayerMode==='assigned'&&!seats.some(s=>s.participantId===room.firstParticipantId))throw Error('Выберите первого игрока');
    activatePack(room.game.id,room.game.version);
    const mode=players.filter(p=>!p.bot).length>1?'pass':'solo',next=new Session(E,room.game.id,{players,mode,lobbyConfig:roomService.snapshot(room.id),preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:room.rules.openHands,firstPlayerMode:room.firstPlayerMode||'rules',firstPlayer:seats.findIndex(s=>s.participantId===room.firstParticipantId),...(room.rules.options||{})});
    if(!save())return;session=next;sessionId=library.newId();library.activate(next,sessionId);storageOK=true;
    rememberGame(room.game.id);
    room=roomService.startHotSeat(room.id,lobbyParticipantId);
    screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;lastResult=null;awaitingPass=false;
    viewer=mode==='solo'?players.findIndex(p=>!p.bot):next.current.players[next.current.turn].bot?players.findIndex(p=>!p.bot):next.current.turn;
    gate=needsGate(next.current)?viewer:null;closeModal(true);render();presentationReady();
  }
  function updateLobbyNickname(form){try{room=roomService.rename(room.id,lobbyParticipantId,form.elements.nickname.value);renderLobby();}catch(error){toast(error.message);}}
  function showRoomHuman(seatId){const seat=room.seats.find(s=>s.id===seatId),p=room.participants.find(p=>p.id===seat?.participantId);openModal(`${modalHead(p?'Имя в комнате':'Добавить игрока')}<form id="room-human-form" data-seat="${esc(seatId)}" ${p?'data-rename="true"':''}><label class="field">Имя<input name="nickname" maxlength="24" required value="${esc(p?.nickname||'Игрок')}"></label><button class="icon-btn" aria-label="${p?'Сохранить имя':'Добавить игрока'}" type="submit">${icon(p?'save':'addPlayer')}</button></form>`);modalBack=renderLobby;}
  function claimLobbySeat(seatId){const occupant=room.participants.find(p=>p.id===room.seats.find(s=>s.id===seatId)?.participantId);if(room.ownerId===lobbyParticipantId&&!room.recovery&&occupant&&(occupant.bot||room.transportMode==='hotseat')){showRoomHuman(seatId);return;}if(room.transportMode==='hotseat'&&!room.seats.find(s=>s.id===seatId)?.participantId){showRoomHuman(seatId);return;}try{room=roomService.claimSeat(room.id,lobbyParticipantId,seatId);renderLobby();}catch(error){toast(error.message);}}
  function kickLobbyParticipant(targetId){try{room=roomService.kick(room.id,lobbyParticipantId,targetId);renderLobby();}catch(error){toast(error.message);}}
  function showRoomRules(){
    const state=roomService.snapshot(room.id),game=meta(state.game.id);
    const rows=state.rules.display||Multiplayer.describeRules(state.rules,catalog[state.game.id]?.settings||[],!!catalog[state.game.id]?.capabilities?.hands);
    openModal(modalHead(game.name+' · правила')+PlayroomLobbyView.rulesMarkup(state,rows,game));modalBack=renderLobby;
  }
  function showRoomHelp(){openModal(modalHead('Комната · справка')+PlayroomLobbyView.helpMarkup(roomService.snapshot(room.id)));modalBack=renderLobby;}
  function showRoomRulesEditor(){
    const state=roomService.snapshot(room.id),g=meta(state.game.id),presets=g.presets?.length?g.presets:[{id:'default',label:'Классический'}],fields=catalog[state.game.id]?.settings||[];
    openModal(`${modalHead('Правила · '+g.name)}<form id="room-rules-form" data-game="${esc(state.game.id)}"><div class="start-options">${[['firstPlayerMode','Игрок №1',[['rules','По правилам','rules'],['random','Случайно','shuffle'],['assigned','Назначить','first']]],['seatOrder','Порядок',[['normal','Нормальный','arrow'],['random','Случайно','shuffle']]]].map(([name,label,options])=>`<fieldset><legend>${label}</legend>${options.map(([value,text,glyph])=>`<label class="start-option"><input type="radio" name="${name}" value="${value}" ${(state[name]||(name==='seatOrder'?'normal':'rules'))===value?'checked':''}>${icon(glyph)}<span>${text}</span></label>`).join('')}</fieldset>`).join('')}</div><label class="field"><span>Набор правил</span><select name="preset">${presets.map(p=>`<option value="${esc(p.id)}" ${state.rules.preset===p.id?'selected':''}>${esc(p.label||p.name||p.id)}</option>`).join('')}</select></label>${fields.map(field=>`<label class="field" data-rule-field="${esc(field.key)}"><span>${esc(field.label)}</span><select name="option-${esc(field.key)}">${field.options.map(option=>`<option value="${esc(option.value)}" ${state.rules.options?.[field.key]===option.value?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`).join('')}${catalog[state.game.id]?.capabilities?.hands?`<label class="switch"><span>Открытые руки</span><input type="checkbox" name="openHands" ${state.rules.openHands?'checked':''}></label>`:''}<div class="modal-foot"><button class="btn secondary" type="button" data-rules="${esc(state.game.id)}">Просмотреть правила</button><button class="btn" type="submit">${icon('save')} Сохранить правила</button></div></form>`);syncRuleVisibility($('#room-rules-form'));
  }
  function syncRuleVisibility(form){if(!form)return;for(const field of catalog[form.dataset.game]?.settings||[]){const row=form.querySelector('[data-rule-field="'+field.key+'"]');if(row)row.hidden=!!field.visibleWhen&&!Object.entries(field.visibleWhen).every(([key,value])=>form.elements['option-'+key]?.value===String(value));}}
  function showRoomGameEditor(){
    if(!room||roomService.snapshot(room.id).phase!=='lobby'||room.ownerId!==lobbyParticipantId)return;
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{favorites:[]};
    const available=orderedVisibleGames().filter(g=>V.supports(g.id,'player')&&V.supports(g.id,'table')).sort((a,b)=>Number(preferences.favorites.includes(b.id))-Number(preferences.favorites.includes(a.id)));
    if(!available.length)return toast('Нет установленных игр с сетевым режимом.');
    openModal(`${modalHead('Сменить игру в комнате')}<div class="room-choice-list">${available.map((g,i)=>`${i&&preferences.favorites.includes(available[i-1].id)&&!preferences.favorites.includes(g.id)?'<hr class="room-choice-divider">':''}<button class="pack-item" data-room-game="${esc(g.id)}"><strong>${esc(g.name)}</strong><small>${esc(g.id)} · ${esc(g.version||'')}</small></button>`).join('')}</div>`);modalBack=renderLobby;
  }
  function updateRoomGame(form){
    try{
      const gameId=typeof form==='string'?form:form.elements.gameId.value,g=meta(gameId),active=activatePack(gameId);
      if(!g||!active||!V.supports(gameId,'player')||!V.supports(gameId,'table'))throw Error('Этот пак пока не поддерживает сетевую игру.');
      const rules=defaultRules(gameId,g);
      room=roomService.changeGame(room.id,lobbyParticipantId,{game:{id:gameId,name:g.name,version:active.version},rules,
        constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
      closeModal(true);renderLobby();
    }catch(error){toast(error.message);}
  }
  function updateRoomRules(form){try{const rules=roomRulesFromForm(form);room=roomService.configure(room.id,lobbyParticipantId,{firstPlayerMode:rules.firstPlayerMode,seatOrder:rules.seatOrder});room=roomService.updateRules(room.id,lobbyParticipantId,rules);rememberRules(room.game.id,rules);closeModal(true);renderLobby();}catch(error){toast(error.message);}}
  function toggleLobbyReady(){try{const me=room.participants.find(p=>p.id===lobbyParticipantId);room=roomService.setReady(room.id,lobbyParticipantId,!me?.ready);renderLobby();}catch(error){toast(error.message);}}
  function becomeLobbySpectator(){try{room=roomService.becomeSpectator(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(error.message);}}
  function startLobbyCountdown(){
    try{
      if(room.transportMode==='hotseat')return startHotSeat();
      room=roomService.beginCountdown(room.id,lobbyParticipantId,{seconds:3});lobbyCountdown=3;renderLobby();clearInterval(lobbyTimer);
      lobbyTimer=setInterval(()=>{const step=roomService.tick(room.id);room=step.room;lobbyCountdown=step.remaining;if(step.started){clearInterval(lobbyTimer);lobbyTimer=null;renderLobby();}else renderLobby();},250);
    }catch(error){toast(error.message);}
  }
  function leaveLobby(){
    if(screen==='table')save();clearInterval(lobbyTimer);lobbyTimer=null;lobbyCountdown=null;
    globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room?.id);
    room=null;lobbyParticipantId=null;cancelBot();closeModal(true);screen='hub';flashPacksOnHub=true;renderHub();refreshPackUpdates();
  }
  function showPlayerNamePrompt(){
    openModal(`<header class="modal-head"><h2>Как вас называть?</h2></header><p class="lead">Имя используется по умолчанию в локальных и сетевых партиях. В конкретной комнате никнейм можно поменять отдельно.</p><form id="profile-form"><label class="field"><span>Имя игрока</span><input name="playerName" maxlength="24" autocomplete="nickname" placeholder="Например, Иван" required></label><button class="btn" type="submit" style="width:100%;margin-top:14px">${icon('save')} Сохранить</button></form>`);
  }
  function savePlayerProfile(form){try{playerProfile=profileStore.save(form.elements.playerName.value);closeModal(true);render();}catch(error){toast(error.message);}}
  function showRules(gameId=($('#modal-root .room-setup-modal,#room-rules-form')?room?.game?.id:session?.game)) {
    const returnBack=modalBack,fromRoom=!!room&&(!!$('#modal-root .room-setup-modal,#room-rules-form')||modalBack===renderLobby);
    if(!gameId)return showHelp();const g=meta(gameId),roomRules=fromRoom&&room?.game?.id===gameId?room.rules:null;
    const chosenRules=roomRules?(()=>{
      const fields=catalog[gameId]?.settings||[],details=[roomRules.presetLabel||roomRules.preset||'Основной набор'];
      for(const field of fields){const value=roomRules.options?.[field.key],option=field.options?.find(item=>item.value===value);if(option)details.push(field.label+': '+option.label);}
      if(catalog[gameId]?.capabilities?.hands)details.push('Открытые руки: '+(roomRules.openHands?'да':'нет'));
      return details;
    })():null;

    const rules=Array.isArray(g.rules)?g.rules:[String(g.rules||g.description)];
    openModal(`${modalHead(g.name+' · правила')}<p class="lead">${esc(g.description)}</p>${chosenRules?`<div class="rules-mode-note"><strong>Выбрано в комнате</strong><ul style="margin:7px 0 0;padding-left:18px">${chosenRules.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`:''}<ol class="rules-list">${rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ol><p class="rules-mode-note">Доступные действия подсвечиваются. Проведите по руке влево или вправо, чтобы посмотреть остальные карты. История сохраняет каждый шаг партии.</p><p class="pack-line">Пак ${esc(g.id)} · ${g.min===g.max?g.min:g.min+'–'+g.max} игрока</p><button class="btn" data-command="close-modal" style="width:100%;margin-top:10px">Понятно</button>`);
    if(returnBack)modalBack=returnBack;else if(fromRoom)modalBack=renderLobby;
  }
  function showHelp() {
    openModal(`${modalHead('Ваш карманный стол')}<div class="help-grid">
      <div class="help-item">${icon('people')}<p><strong>С ботами или вместе</strong>Боты готовы в любой момент. В режиме «Передаём телефон» закрытая заставка скрывает руку между ходами.</p></div>
      <div class="help-item">${icon('hand')}<p><strong>Все действия — на столе</strong>В домино выберите костяшку и подсвеченное место или удерживайте её, чтобы перетащить. Листайте руку горизонтальным свайпом. Подсветка подскажет возможные ходы.</p></div>
      <div class="help-item">${icon('history')}<p><strong>Отвлеклись? Отмотайте</strong>Кнопка истории открывает повтор: двигайте ползунок, смотрите по одному ходу или запустите воспроизведение.</p></div>
      <div class="help-item">${icon('save')}<p><strong>Каждому столу своё место</strong>В «Моих партиях» хранятся игры на паузе и завершённые партии. Продолжайте любую или смотрите историю. Новые игры сохраняются отдельно.</p></div>
      <div class="help-item">${icon('layers')}<p><strong>Место для новых игр</strong>Каждая игра — отдельный пак со своими правилами, наборами и оформлением. Сетевая комната соединяет устройства напрямую; приглашение можно передать ссылкой или QR-кодом.</p></div></div><button class="btn" data-command="close-modal" style="width:100%;margin-top:25px">Всё, играем ${icon('arrow')}</button>`);
  }
  function showSettings(options={}) {
    const settingsRoom=options.room||(room?roomService.snapshot(room.id):null);
    const nickname=settingsRoom?PlayroomLobbyView.nicknameMarkup(settingsRoom,options.participantId||lobbyParticipantId||playerProfile?.id,!!options.client):null;
    const profile=nickname||`<label class="field"><span>Имя игрока</span><input id="setting-player-name" maxlength="24" autocomplete="nickname" value="${esc(playerProfile?.name||'')}" placeholder="Введите имя"></label>`;
    const soundOptions=audio.catalog().map(c=>`<option value="|${esc(c.id)}">${esc(c.label)}</option>`).join('');
    const packSounds=Object.entries(catalog).filter(([,pack])=>pack.sounds).map(([id,pack])=>`<optgroup label="${esc(meta(id)?.name||id)}">${Object.entries(pack.sounds).map(([cue,def])=>`<option value="${esc(id)}|${esc(cue)}">${esc(def.label||cue)}</option>`).join('')}</optgroup>`).join('');
    openModal(`${modalHead('Настройки')}${options.sharedRules||settingsRoom||session&&screen==='table'?`<button class="btn secondary" ${options.sharedRules?'data-shared-rules':options.client?'data-net-action="rules"':session&&screen==='table'?'data-command="rules"':settingsRoom?'data-command="room-rules-view"':'data-command="rules"'}>${icon('help')} Правила игры</button>`:''}${profile}${globalThis.PlayroomAppearanceUI.settingsButton()}
      <label class="switch"><span>Звук действий</span><input type="checkbox" id="setting-sound" ${settings.sound?'checked':''}></label>
      ${!settingsRoom||settingsRoom.transportMode==='hotseat'?`<label class="switch"><span>Автоматическая передача хода</span><input type="checkbox" id="setting-auto-pass" ${settings.autoPass?'checked':''}></label>`:''}
      <label class="switch"><span>Ход одним нажатием</span><input type="checkbox" id="setting-quick-play" aria-describedby="setting-quick-play-description" ${settings.quickPlay?'checked':''}></label>
      <div class="settings-grid"><label class="field"><span>Громкость</span><select id="setting-volume" data-sound-control ${settings.sound?'':'disabled'}>${[[.3,'Тихо'],[.6,'Средне'],[1,'Громко']].map(([value,label])=>`<option value="${value}" ${settings.volume===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label class="field"><span>Анимация</span><select id="setting-speed" aria-describedby="setting-speed-description">${Object.entries(animationPresets).map(([id,p])=>`<option value="${id}" ${settings.animationSpeed===id?'selected':''}>${p.label}</option>`).join('')}</select></label></div>
      <details class="settings-details"><summary>Проверить звук</summary><div class="sound-preview"><label class="field"><span>Библиотека звуков</span><select id="sound-preview" data-sound-control ${settings.sound?'':'disabled'}><optgroup label="Стандартные">${soundOptions}</optgroup>${packSounds}</select></label><button class="btn secondary" data-command="sound-preview" data-sound-control ${settings.sound?'':'disabled'} aria-label="Прослушать выбранный звук">${icon('play')}</button></div></details>
      <details class="settings-details"><summary>О настройках</summary>${!nickname?'<p class="lead">Имя подставляется в новые комнаты. Никнейм в конкретной комнате можно изменить отдельно.</p>':''}<p class="lead" id="setting-quick-play-description">Однозначный ход выполняется сразу. Если действию нужен цвет или цель, сначала выберите их.</p><p class="lead" id="setting-speed-description">${animationPresets[settings.animationSpeed].description}</p><p class="lead">Настройки сохраняются на этом устройстве. Системное уменьшение анимации также учитывается.</p></details>
      <button class="btn secondary" data-command="fullscreen" style="width:100%">${icon('full')} На весь экран</button>${session&&screen==='table'?`<button class="btn plain" data-start="${session.game}" style="width:100%;margin-top:10px">${icon('reset')} Настроить новую партию</button>`:''}`);
  }
  function showCardHelp() {
    const cards=[...document.querySelectorAll('.own-hand .hand-card[data-tooltip]')],seen=new Set();
    const entries=cards.filter(card=>{const text=card.dataset.tooltip;if(seen.has(text))return false;seen.add(text);return true;});
    const details=entries.map(card=>`<li><strong>${esc(card.getAttribute('aria-label'))}</strong><p>${esc(card.dataset.tooltip)}</p></li>`).join('');
    openModal(`${modalHead('Карты в вашей руке')}<p class="lead">На компьютере наведите курсор на карту, чтобы увидеть её действие. Здесь собраны подсказки для текущей руки.</p><ul class="card-help-list">${details||'<li>В руке пока нет открытых карт.</li>'}</ul>`);
  }
  function showPlayerActions(target) {
    if(transition||isReplay()||paused||gate!==null||!session)return;
    const action=activeActions(session.current).find(a=>a.target===target&&a.targetKind==='player');
    if(!action)return;
    const name=session.current.players[target].name;
    playerTargets?.tap(target);
  }
  function showResult() {
    if(!session||session.current.status!=='finished'||screen!=='table')return;
    const state=session.current,winner=state.winner;
    const shownViewer=isPass()?-1:viewer;
    let playerContent=[];
    try{playerContent=V.get(session.game)?.render(E.project(state,shownViewer),shownViewer,[],{})?.playerContent||[];}catch(_){}
    openModal(GameScreen.resultMarkup({state,viewer:shownViewer,gameName:meta(session.game).name,scoreLabel:meta(session.game).scoreLabel||'очки',teamBadges:catalog[session.game]?.teamBadges,playerContent}),'result-modal',{keepAudio:true});
  }
  function captureHistoryOrigin(kind){return {kind,session,sessionId,viewer,gate,paused,awaitingPass,screen,hubTab,scrollY:window.scrollY};}
  function restoreHistoryOrigin(){const origin=historyOrigin;if(!origin)return;historyOrigin=null;session=origin.session;sessionId=origin.sessionId;viewer=origin.viewer;gate=origin.gate;paused=origin.paused;awaitingPass=origin.awaitingPass;screen=origin.screen;hubTab=origin.hubTab;return origin;}
  function openLibraryHistory(id){
    const next=library.open(id);interruptAction();cancelBot();clearTimeout(autoPassTimer);stopReplay();
    const origin=captureHistoryOrigin('library');setLocalPaused(true);historyOrigin=origin;session=next;sessionId=id;screen='table';paused=true;gate=null;awaitingPass=false;
    viewer=Math.max(0,next.current.players.findIndex(p=>!p.bot&&p.name===playerProfile?.name));if(!next.current.players.some(p=>!p.bot&&p.name===playerProfile?.name))viewer=Math.max(0,next.current.players.findIndex(p=>!p.bot));
    selected=null;historyOpen=true;replayIndex=next.states.length-1;closeModal(true);renderTable();
  }
  function closeHistory(){stopReplay();const origin=restoreHistoryOrigin();historyOpen=false;replayIndex=null;selected=null;setLocalPaused(paused);render();if(origin?.kind==='library')requestAnimationFrame(()=>window.scrollTo(0,origin.scrollY));}
  function stopLocalMatch(){
    if(!session||session.current.status!=='playing'||room?.transportMode!=='hotseat'||room.phase!=='playing')return;
    if(!confirm('Сохранить партию и вернуться в лобби? Её можно будет продолжить из «Моих партий».'))return;
    interruptAction();cancelBot();stopReplay();
    if(!save())return;
    setLocalPaused(true);gate=null;awaitingPass=false;
    room=roomService.returnToLobby(room.id,lobbyParticipantId,{stopped:true});
    screen='hub';closeModal(true);renderHub();renderLobby();
  }
  function rematch(){
    if(!session||session.current.status!=='finished')return;
    const completed=session;if(historyOrigin){restoreHistoryOrigin();historyOpen=false;replayIndex=null;}
    if(!save())return;cancelBot();stopReplay();paused=true;
    if(room?.transportMode==='hotseat'&&room.game.id===completed.game&&room.phase==='playing')room=roomService.returnToLobby(room.id,lobbyParticipantId);
    else if(completed.options.lobbyConfig){room=roomService.restoreHotSeatLobby(completed.options.lobbyConfig,{hostId:playerProfile.id});lobbyParticipantId=room.ownerId;}
    else {setup(completed.game);const original=completed;for(let i=0;i<room.seats.length;i++){const player=original.current.players[i],seat=room.seats[i];if(i===0){room=roomService.renameLocalSeat(room.id,lobbyParticipantId,seat.id,player?.name||playerProfile.name);continue;}room=roomService.setLocalSeat(room.id,lobbyParticipantId,seat.id,{kind:player?(player.bot?'bot':'human'):'empty',nickname:player?.name});}room=roomService.updateRules(room.id,lobbyParticipantId,{preset:original.options.preset,presetLabel:original.options.presetLabel,openHands:!!original.options.openHands,options:Object.fromEntries((catalog[original.game]?.settings||[]).map(field=>[field.key,original.options[field.key]??field.default]))});}
    closeModal(true);renderLobby();
  }
  function openHistory(from=null) {
    interruptAction();if(!historyOrigin)historyOrigin=captureHistoryOrigin('live');
    setLocalPaused(true);gate=null;playerTargets?.cancel();feedback.clear();cancelBot();stopReplay();selected=null;historyOpen=true;replayIndex=from??session.states.length-1;renderTable();
  }
  function startReplay() {
    stopReplay();const ticket=replayTicket;
    if(replayIndex===session.states.length-1)replayIndex=0;
    const step=async()=>{
      if(ticket!==replayTicket||!isReplay()||screen!=='table')return;
      if(replayIndex>=session.states.length-1){stopReplay(false);renderTable();return;}
      const before=currentState(),after=session.states[replayIndex+1],events=E.project(after,viewer).events.filter(e=>e.id>(before.events.at(-1)?.id||0));
      const action=events.findLast(e=>e.presentation)?.presentation||{type:events.some(e=>e.kind==='roll')?'roll':'replay'},timing=pace(),snapshot=flow.capture({actor:before.turn,action,viewer});
      replayIndex++;renderTable();playSounds(before,after);
      await flow.play(snapshot,{draws:cardTransfers(before,after)});
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
    'dismiss-notice':dismissNotice,
    'dismiss-recovery'(){loadWarning='';renderHub();},
    rematch,
    home(){leaveTable('games');},
    sessions(){leaveTable('sessions');},
    resume(){resumeSession();},
    packs(){rememberPackUpdates('read');rememberPackUpdates('dismissed');packUI?.open();if(screen==='hub')renderHub();},
    'dismiss-pack-updates'(){rememberPackUpdates('dismissed');renderHub();},
    help:showHelp,settings:showSettings,'card-help':showCardHelp,fullscreen,rules:()=>showRules(),
    'room-rules':showRoomRulesEditor,'room-change-game':showRoomGameEditor,
    'lobby-ready':toggleLobbyReady,
    'lobby-spectator':becomeLobbySpectator,
    'lobby-table':()=>{try{room=roomService.claimTable(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(error.message);}},
    'stop-local-match':stopLocalMatch,
    'lobby-start':startLobbyCountdown,
    'lobby-leave':()=>{if(room?.transportMode==='network'&&room.phase==='playing'&&!confirm('Покинуть комнату? Соединения всех участников будут закрыты. Партия сохранится.'))return;leaveLobby();},
    'close-modal':closeModal,
    'room-rules-view':showRoomRules,
    'room-help':showRoomHelp,
    'sound-preview'(){const value=$('#sound-preview')?.value;if(!value)return;const [pack,id]=value.split('|');void previewSound(id,pack||undefined);},
    unlock(){viewer=gate;gate=null;awaitingPass=false;render();},
    'pass-device':transferDevice,
    history(){if(historyOpen)commands['history-close']();else openHistory();},
    'history-close':closeHistory,
    'replay-prev'(){stopReplay();replayIndex=Math.max(0,replayIndex-1);render();},
    'replay-next'(){const before=currentState();stopReplay();replayIndex=Math.min(session.states.length-1,replayIndex+1);render();playSounds(before,currentState());},
    'replay-play'(){if(replayTimer){stopReplay();return render();}startReplay();},
    room:renderLobby,'room-hotseat-confirm'(){modalBack=null;setRoomOption('transportMode','hotseat',true);},
    pause(){interruptAction();stopSounds();setLocalPaused(!paused);cancelBot();render();},result:showResult,
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
  playerTargets=new globalThis.PlayroomPlayerTarget({
    actions:()=>screen==='table'&&session&&!isReplay()&&!paused&&gate===null&&!transition?activeActions(session.current):[],
    selected:()=>selected,commit:action=>act(viewer,action),root:()=>document.querySelector('#app .table-shell')
  });
  let hubDragged=null,hubTouch=null,hubDropSuppress=0;
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest?.('.hub-edit-section .game-tile[data-game]');
    if(!hubEditing||!card||event.target.closest('button'))return;
    hubDragged=card.dataset.game;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',hubDragged);
  });
  document.addEventListener('dragover',event=>{if(hubDragged&&event.target.closest?.('[data-edit-drop]'))event.preventDefault();});
  document.addEventListener('drop',event=>{if(!hubDragged)return;event.preventDefault();const id=hubDragged;hubDragged=null;hubDropAt(id,event.target);});
  document.addEventListener('dragend',()=>{hubDragged=null;});
  document.addEventListener('pointerdown',event=>{
    const card=event.pointerType==='touch'&&hubEditing?event.target.closest('.hub-edit-section .game-tile[data-game]'):null;
    if(!card||!event.target.closest('[data-edit-handle]'))return;
    const hold={id:card.dataset.game,x:event.clientX,y:event.clientY,active:false,timer:null};
    hold.timer=setTimeout(()=>{hold.active=true;card.classList.add('is-dragging');},420);hubTouch=hold;
  });
  document.addEventListener('pointermove',event=>{
    const hold=hubTouch;if(!hold)return;
    if(!hold.active&&Math.hypot(event.clientX-hold.x,event.clientY-hold.y)>9){clearTimeout(hold.timer);hubTouch=null;return;}
    if(hold.active)event.preventDefault();
  },{passive:false});
  function finishHubTouch(event){
    const hold=hubTouch;if(!hold)return;clearTimeout(hold.timer);hubTouch=null;
    document.querySelector('.hub-edit-section .game-tile.is-dragging')?.classList.remove('is-dragging');
    if(!hold.active||event.type==='pointercancel')return;
    event.preventDefault();hubDropSuppress=Date.now()+500;
    hubDropAt(hold.id,document.elementFromPoint(event.clientX,event.clientY));
  }
  document.addEventListener('pointerup',finishHubTouch);
  document.addEventListener('pointercancel',finishHubTouch);
  document.addEventListener('click',event=>{
    if(Date.now()<hubDropSuppress&&event.target.closest('.hub-edit-section')){event.preventDefault();return;}
    if(event.target.closest('.network-game,.shared-modal-backdrop'))return;
    const replacement=event.target.closest('[data-player-replacement]');if(replacement){event.preventDefault();openModal(`${modalHead('Игрок на замену')}<p>${esc(replacement.getAttribute('title')||replacement.dataset.tooltip)}</p>`);return;}
    const preference=event.target.closest('[data-view-preference]');if(preference&&screen==='table'){TabletopUI.viewPreferences(session.game,viewer,preference.dataset.viewPreference,preference.dataset.viewValue);viewState={};renderTable();return;}
    const viewControl=event.target.closest('[data-view-key]');
    if(viewControl&&!viewControl.disabled&&screen==='table'){const {viewKey,viewValue}=viewControl.dataset;if(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(viewKey)&&viewValue.length<=80){viewState[viewKey]=viewValue;renderTable();}return;}
    if(event.target.closest('.player-target-menu'))return;
    const person=event.target.closest('[data-player-target],[data-player-panel-target]');
    if(person){showPlayerActions(Number(person.dataset.playerTarget??person.dataset.playerPanelTarget));return;}
    const button=event.target.closest('button,[data-action],[data-select],[data-cell],[data-drop-select]');
    if(!button||button.disabled)return;
    if(button.dataset.roomGame){updateRoomGame(button.dataset.roomGame);return;}
    if(button.dataset.roomCycle){try{cycleRoomSeat(button.dataset.roomCycle);}catch(error){toast(error.message);}return;}
    if(button.dataset.roomBot){try{room=roomService.setLocalSeat(room.id,lobbyParticipantId,button.dataset.roomBot,{kind:'bot',nickname:button.dataset.botName});renderLobby();}catch(error){toast(error.message);}return;}
    if(button.dataset.savedFilter){savedFilter=button.dataset.savedFilter;updateSavedPanel();return;}
    if(button.hasAttribute('data-clear-games-confirm')){void clearGames();return;}
    if(button.hasAttribute('data-clear-games')){void askClearGames();return;}
    if(button.dataset.historyId){resumeSession(button.dataset.historyId,{history:true});return;}
    if(button.dataset.resumeId){resumeSession(button.dataset.resumeId);return;}
    if(button.dataset.deleteNetworkConfirm){void deleteNetworkSession(button.dataset.deleteNetworkConfirm);return;}
    if(button.dataset.deleteNetwork){askDeleteNetwork(button.dataset.deleteId);return;}
    if(button.dataset.deleteId){try{askDelete(button.dataset.deleteId);}catch(_){toast('Не удалось прочитать сохранения.');}return;}
    if(button.dataset.deleteConfirm){deleteSession(button.dataset.deleteConfirm);return;}
    if(button.dataset.lobbySeat){claimLobbySeat(button.dataset.lobbySeat);return;}
    if(button.dataset.kickParticipant){kickLobbyParticipant(button.dataset.kickParticipant);return;}
    if(button.hasAttribute('data-edit-toggle')){hubEditing=!hubEditing;filter='all';renderHub();return;}
    if(button.dataset.editStep){editHubStep(button.dataset.editId,Number(button.dataset.editStep));return;}
    if(button.dataset.editCategory){const manager=globalThis.PlayroomPackManager,id=button.dataset.editCategory,groups=['favorites','normal','hidden'],next=groups[(groups.indexOf(manager.category(id))+1)%groups.length];moveHubGame(id,next);return;}
    if(button.dataset.command){commands[button.dataset.command]?.();return;}
    if(button.dataset.favorite){try{globalThis.PlayroomPackManager.toggleFavorite(button.dataset.favorite);renderHub();}catch(error){toast(error.message);}return;}
    if(button.dataset.recentStart){setup(button.dataset.recentStart);return;}
    if(button.dataset.start){setup(button.dataset.start);return;}
    if(button.dataset.rules){showRules(button.dataset.rules);return;}
    if(button.dataset.tag){const kind=button.dataset.tagKind;hubFilters[kind]=hubFilters[kind]===button.dataset.tag?'':button.dataset.tag;renderHub();return;}
    if(button.dataset.format){hubFilters.format=hubFilters.format===button.dataset.format?'':button.dataset.format;renderHub();return;}
    if(button.dataset.filter){filter=button.dataset.filter;renderHub();return;}
    if(button.hasAttribute('data-action')&&button.hasAttribute('data-close-on-action'))closeModal(true);
    input.handleClick(event);
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='room-human-form'){event.preventDefault();try{room=event.target.dataset.rename?roomService.renameLocalSeat(room.id,lobbyParticipantId,event.target.dataset.seat,event.target.elements.nickname.value):roomService.setLocalSeat(room.id,lobbyParticipantId,event.target.dataset.seat,{kind:'human',nickname:event.target.elements.nickname.value});renderLobby();}catch(error){toast(error.message);}}
    else if(event.target.id==='profile-form'){event.preventDefault();savePlayerProfile(event.target);}
    else if(event.target.id==='lobby-nickname-form'){event.preventDefault();updateLobbyNickname(event.target);}
    else if(event.target.id==='room-rules-form'){event.preventDefault();updateRoomRules(event.target);}
    else if(event.target.id==='room-game-form'){event.preventDefault();updateRoomGame(event.target);}
  });
  document.addEventListener('change',event=>{
    if(event.target.id==='history-viewer'&&historyOrigin?.kind==='library'){stopReplay();viewer=Number(event.target.value);renderTable();return;}
    if(event.target.closest('#room-rules-form')){syncRuleVisibility(event.target.form);return;}
    try{if(event.target.hasAttribute('data-room-title')){setRoomOption('name',event.target.value);return;}if(event.target.dataset.roomOption){setRoomOption(event.target.dataset.roomOption,event.target.type==='checkbox'?(event.target.checked?'network':'hotseat'):event.target.value);return;}}catch(error){toast(error.message);renderLobby();return;}
    if(event.target.id==='setting-player-name'){try{playerProfile=profileStore.save(event.target.value);}catch(error){toast(error.message);}}
    if(['setting-sound','setting-speed','setting-quick-play','setting-auto-pass','setting-volume'].includes(event.target.id)){
      if(event.target.id==='setting-sound'){settings.sound=event.target.checked;soundTicket++;audio.setEnabled(settings.sound);document.querySelectorAll('[data-sound-control]').forEach(el=>el.disabled=!settings.sound);}
      else if(event.target.id==='setting-volume'){settings.volume=Number(event.target.value);audio.setVolume(settings.volume);}
      else if(event.target.id==='setting-quick-play')settings.quickPlay=event.target.checked;
      else if(event.target.id==='setting-auto-pass')settings.autoPass=event.target.checked;
      else {settings.animationSpeed=Object.hasOwn(animationPresets,event.target.value)?event.target.value:'normal';$('#setting-speed-description').textContent=animationPresets[settings.animationSpeed].description;}
      document.body.classList.toggle('reduced-motion',pace().duration===0);
      try{localStorage.setItem('playroom.settings.v1',JSON.stringify(settings));}catch(_){}
      window.dispatchEvent(new Event('playroom:game-options'));
      if(['setting-sound','setting-volume'].includes(event.target.id))void previewSound();
    }
  });
  document.addEventListener('input',event=>{
    // The shared network/archive viewer also uses #replay-range. Never let an
    // unrelated local Session (possibly a DIFFERENT game) render into it.
    if(screen==='table'&&event.target.id==='replay-range'&&
        event.target.closest('.table-shell:not(.network-game)'))scrubHistory(Number(event.target.value));
  });
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-player-replacement]')){event.preventDefault();event.target.click();return;}
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-player-target]')){event.preventDefault();showPlayerActions(Number(event.target.dataset.playerTarget));return;}
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
    if(document.hidden){turnNotice.reset();cancelBot();stopReplay();interruptAction();if(session)missedFrom=Math.max(0,session.states.length-5);}
    else if(screen==='table'&&session){renderTable();if(missedFrom!==null)missedFrom=null;}
  });
  window.addEventListener('pagehide',()=>{
    stopSounds();if(session)save();
    try{sessionStorage.setItem('playroom.navigation.v1',JSON.stringify({screen,sessionId:screen==='table'?sessionId:null,viewState:screen==='table'?viewState:{},scroll:screen==='table'?{top:$('#app [data-scene-scroll]')?.scrollTop||0,left:$('#app [data-scene-scroll]')?.scrollLeft||0}:null}));}catch(_){}
  });
  packUI=globalThis.PlayroomPackManager?.create({manager:packs,library,networkLibrary:globalThis.PlayroomNetworkLibrary,openModal,modalHead,toast,onCatalog(){
    rememberPackUpdates('read');rememberPackUpdates('dismissed');if(screen==='hub')renderHub();
  },onChange(){
    filter='all';
    clearDeletedSession();
    refreshSavedGameRecovery();
    for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
    renderHub();
  }});
  function restoreHostedRoom(roomId){
    const recovered=roomService.snapshot(roomId);
    if(!playerProfile?.id||recovered.ownerId!==playerProfile.id)throw Error('Другой профиль не может продолжить комнату хоста.');
    if(room&&room.id!==roomId)throw Error('Сначала завершите текущую комнату.');
    room=recovered;lobbyParticipantId=playerProfile.id;screen='lobby';lobbyCountdown=null;
  }
  function returnHostedRoomToLobby(roomId){
    if(room?.id!==roomId)throw Error('Комната хоста изменена.');
    room=roomService.snapshot(roomId);lobbyCountdown=null;screen='lobby';
    closeModal(true);renderLobby();
  }
  function rollbackHostedRoom(roomId){
    if(room?.id!==roomId)return;
    room=null;lobbyParticipantId=null;lobbyCountdown=null;screen='hub';
    renderHub();
  }
  function showSessions(){screen='hub';hubTab='sessions';closeModal(true);renderHub();}
  globalThis.PlayroomAppBridge=Object.freeze({showSessions,showHub:()=>leaveTable('games'),parkLocalSession:()=>{if(room?.transportMode==='hotseat')leaveLobby();else if(screen==='table')leaveTable('games');},returnHostedRoomToLobby,restoreHostedRoom,rollbackHostedRoom,gameOptions:()=>({animationSpeed:settings.animationSpeed,quickPlay:settings.quickPlay}),audio:Object.freeze({
    registerPack:(id,sounds)=>audio.registerPack(id,sounds),
    play:(ids,pack)=>{if(!settings.sound||document.hidden||!ids.length)return;
      const ordered=ids.filter((id,i)=>i===0||id!==ids[i-1]);
      void audio.unlock().then(ok=>{if(ok&&settings.sound&&!document.hidden)void audio.sequence(ordered,{pack});});},
    stop:()=>audio.stop()
  }),profile:()=>playerProfile,room:()=>room,participantId:()=>lobbyParticipantId,roomService,packs,catalog,meta,toast,leaveLobby,renderLobby,openModal,closeModal,modalHead,showSettings,rememberGame});
  let navigation=null;try{navigation=JSON.parse(sessionStorage.getItem('playroom.navigation.v1')||'null');}catch(_){}
  if(navigation?.screen==='table'&&session&&navigation.sessionId===sessionId){
    resumeSession(sessionId);
    if(navigation.viewState&&typeof navigation.viewState==='object')viewState=navigation.viewState;
    if(navigation.scroll){const board=$('#app [data-scene-scroll]');if(board){board.scrollTop=Number(navigation.scroll.top)||0;board.scrollLeft=Number(navigation.scroll.left)||0;}}
  }else render();
  if(globalThis.PlayroomRemotePacks){
    void globalThis.PlayroomRemotePacks.load().then(async catalog=>{
      if(!catalog)return;
      if(!packs.list().length)for(const item of catalog.packs){
        try{await globalThis.PlayroomRemotePacks.install(item.id,{activate:true});}
        catch(error){loadWarning='Не удалось установить '+item.id+': '+error.message;}
      }
      if(screen==='hub')renderHub();
    });
  }
  if(!playerProfile?.name)setTimeout(showPlayerNamePrompt,0);
})();
