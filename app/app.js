if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(async function () {
  'use strict';
  try { await globalThis.PlayroomPacksReady; }
  catch(error) { const app=document.querySelector('#app'),t=key=>globalThis.PlayroomMessages.text('ui.storage.'+key);app.innerHTML=`<section class="modal"><h2>${t('open-failed')}</h2><p>${t('open-detail')}</p><button class="btn" id="storage-retry">${t('retry')}</button></section>`;app.querySelector('button').onclick=()=>location.reload();console.warn('Storage startup failed',error.name);return; }

  const E = globalThis.TabletopCore || globalThis.PlayroomEngine;
  const V = globalThis.PlayroomViews;
  const Session = globalThis.TabletopSession;
  const Motion = globalThis.PlayroomMotion.surface(()=>document.querySelector('#app .table-shell')), Flow = globalThis.PlayroomGameFlow;
  const HandOverflow=globalThis.PlayroomHandOverflow;
  const Authority=globalThis.SessionAuthority, Protocol=globalThis.PlayroomProtocol;
  const Multiplayer=globalThis.PlayroomMultiplayer;
  const profileStore=new Multiplayer.ProfileStore(()=>localStorage),roomService=new Multiplayer.RoomService({validateStart:state=>{
    try{
      const seats=state.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index);
      const players=seats.map(seat=>{const p=state.participants.find(p=>p.id===seat.participantId);return {name:p.nickname,bot:!!p.bot,...(p.botSettings?{botSettings:p.botSettings}:{}),...(p.avatar?{avatar:p.avatar}:{})};});
      E.validateState(E.createGame(state.game.id,{...(state.rules.options||{}),players,packVersion:state.game.version,preset:state.rules.preset,openHands:!!state.rules.openHands,seed:1,firstPlayerMode:'assigned',firstPlayer:state.firstPlayerMode==='assigned'?seats.findIndex(s=>s.participantId===state.firstParticipantId):0}));
      return null;
    }catch(_){return globalThis.PlayroomMessages.text('ui.rooms.roster-invalid');}
  }});
  let playerProfile=profileStore.load();
  let profileAvatar=playerProfile?.avatar||null;
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
  const library = new globalThis.PlayroomLibrary(() => globalThis.PlayroomData, E, Session, packs);
  try { await globalThis.PlayroomPackManager?.reconcile?.(packs,library); }
  catch (error) { globalThis.PlayroomPackLoadError ||= globalThis.PlayroomMessages.error(error) || globalThis.PlayroomMessages.text("ui.app.d95699cb8f67"); }
  const $ = selector => document.querySelector(selector);
  const noticeElement=$('#toast');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const GameScreen=globalThis.PlayroomGameScreen,icon=GameScreen.icon;
  const turnNotice=GameScreen.turnNotice({play:()=>{if(settings.sound&&!document.hidden&&!audio.busy)void audio.play('turn',{volume:.45});},reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  const appVersion=globalThis.PlayroomAppVersion||globalThis.PlayroomMessages.text("ui.app.8d699d8c65b0");
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
  const brand = ("<span class=\"brand-mark\" aria-hidden=\"true\"><i></i><i></i><i></i><i></i></span>"+globalThis.PlayroomMessages.text("ui.app.b0baccea2c88")+"<small>β</small>");
  const botNames = [globalThis.PlayroomMessages.text("ui.app.36302a922e97"),globalThis.PlayroomMessages.text("ui.app.3ad0ecbb5a38"),globalThis.PlayroomMessages.text("ui.app.b25f2c7cdbc5"),globalThis.PlayroomMessages.text("ui.app.a5a387d440e4"),globalThis.PlayroomMessages.text("ui.app.0aa6b765f067"),globalThis.PlayroomMessages.text("ui.app.1a859840b361"),globalThis.PlayroomMessages.text("ui.app.4fc735b61b2f"),globalThis.PlayroomMessages.text("ui.app.df75e7040e09")];
  const randomBotName = () => {const used=new Set(room?.participants.filter(p=>p.bot).map(p=>p.nickname));const available=botNames.filter(name=>!used.has(name));return available[Math.floor(Math.random()*available.length)]||botNames[0];};
  const Tags=globalThis.PlayroomTags,hubFilters={type:'',mechanic:'',format:''};
  let hubFiltersOpen=false;
  const catalog = globalThis.PlayroomCatalog || {};
  const animationPresets=Flow.presets;
  const settingsStore=new globalThis.PlayroomPlayerSettingsStore(()=>localStorage);
  let settings=globalThis.PlayroomPlayerSettings.defaults();
  let viewState = {};
  let session = null, screen = 'hub', filter = 'all', selected = null, gate = null, viewer = 0;
  let sessionId = null, hubTab = 'games', savedFilter='all', networkSaved=[], networkSavedState='idle', networkSavedTicket=0;
  let hubEditing=false;
  let room=null,lobbyParticipantId=null,lobbyTimer=null,lobbyCountdown=null;
  let historyOpen = false, replayIndex = null, replayTimer = null, botTimer = null, autoPassTimer = null;
  let paused = false, lastResult = null, storageOK = true, modalReturn = null, pendingAction = null, pendingConfirmation = null;
  let missedFrom = null, soundTicket = 0;
  let loadWarning = '', modalBack = null, settingsReturn = null, historyOrigin = null, reactionShownAt = null;
  let input = null, packUI = null, playerTargets = null, feedbackSession = null;
  const presentationExecutor=new globalThis.PlayroomPresentationScheduler();
  const feedback=new globalThis.PlayroomGameFeedback({fieldChanged:()=>renderTable(),motion:Motion,executor:presentationExecutor,mount:()=>document.querySelector('#app .table-shell'),play:(ids,pack,context)=>{if(settings.sound&&!document.hidden)return audio.batch(ids,{pack,signal:context?.signal});}});
  let transition = null, replayTicket = 0, replayPaused = false, awaitingPass = false;
  const localPort={get snapshot(){return session?localFrame(session.current,gate!==null?-1:viewer):null;},
    history:index=>localFrame(session.states[index],viewer,[]),
    send(action,{actor=viewer}={}){const client=localClient(actor);return client.dispatch(Protocol.command(client.snapshot(),action,'local-'+(++commandSequence)));}};
  const screenController=new globalThis.PlayroomGameScreenController({client:localPort,report:error=>toast(globalThis.PlayroomMessages.error(error))});
  function localFrame(state,shownViewer,actions=[]){return {kind:'snapshot',protocolVersion:3,sessionId:sessionId||String(session.createdAt),authorityEpoch:'local:'+session.createdAt,
    game:session.game,packVersion:session.packVersion,viewer:shownViewer,revision:state.move,historyLength:session.states.length,state:E.project(state,shownViewer),actions,paused};}

  settings=globalThis.PlayroomPlayerSettings.normalize(settingsStore.read(),{catalog,normalizeScale:globalThis.PlayroomInterfaceScale.normalize,normalizeSpeed:Flow.speed});
  globalThis.PlayroomInterfaceScale.set(settings.interfaceScale);
  const volumeLevels=[0,.3,.6,1],speedLevels=Object.keys(animationPresets);
  const volumeLabels=[globalThis.PlayroomMessages.text('ui.app.volume.mute'),globalThis.PlayroomMessages.text('ui.app.a884586f7f7d'),globalThis.PlayroomMessages.text('ui.app.709ce533ba0a'),globalThis.PlayroomMessages.text('ui.app.251ddcd158f4')];
  try { const saved = library.current(); if (saved) { session = saved.session; sessionId = saved.id; } }
  catch (_) { loadWarning=globalThis.PlayroomMessages.text("ui.app.3f69ce8ef70a"); }
  const audio = new globalThis.TabletopAudio({enabled:settings.sound,volume:settings.volume});
  let audioRequest=0,audioPending=false;
  const audioVersions = new Map();
  for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
  const unlockAudio = () => {if(settings.sound&&!document.hidden)void audio.unlock();};
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
  const flow=new Flow.GameFlow({executor:presentationExecutor,options:()=>settings,motion:Motion,presentation:()=>({minimumVisibleMs:Flow.viewingTime(catalog[session?.game]?.capabilities,session?E.project(session.current,-1):null)}),reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  const pace=()=>flow.pace();
  HandOverflow.attach(document);
  document.body.classList.toggle('reduced-motion',pace().duration===0);
  const meta = id => E.GAMES.find(g => g.id === id);
  const lastRulesKey='playroom.last-rules.v1';
  function defaultRules(gameId,g){
    let saved={};
    try{saved=JSON.parse(localStorage.getItem(lastRulesKey)||'{}')?.[gameId]||{};}catch(_){}
    const presets=g.presets?.length?g.presets:[{id:'default',label:globalThis.PlayroomMessages.text("ui.app.a39ad47c9222")}];
    const preset=presets.find(item=>item.id===saved.preset)||presets[0];
    const fields=catalog[gameId]?.settings||[];
    saved.options={...(catalog[gameId]?.legacyPresets?.[saved.preset]||{}),...(saved.options||{})};
    const options=Object.fromEntries(fields.map(field=>{
      const chosen=field.options?.find(option=>option.value===saved.options?.[field.key]);
      return [field.key,chosen?chosen.value:field.default??field.options?.[0]?.value];
    }));
    const rules={preset:preset.id,presetLabel:Multiplayer.presetLabel(preset.id,g,catalog[gameId]?.presetSetting),
      firstPlayerMode:catalog[gameId]?.capabilities?.firstPlayer===false?'rules':['rules','random','assigned'].includes(saved.firstPlayerMode)?saved.firstPlayerMode:'rules',seatOrder:saved.seatOrder==='random'?'random':'normal',openHands:!!catalog[gameId]?.capabilities?.hands&&saved.openHands===true,options};
    rules.display=Multiplayer.describeRules(rules,fields,!!catalog[gameId]?.capabilities?.hands,catalog[gameId]?.presetSetting);
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
  const needsGate = state => isPass()&&!session.options.openHands&&(!!state.data.hands||!!E.decisionWindow?.(state))&&state.status!=='finished'&&!state.players[state.turn]?.bot;
  function placeNotice(){
    if(!noticeElement.classList.contains('show'))return;
    const modal=$('#modal-root .modal');
    const parent=modal||document.body;
    if(noticeElement.parentElement!==parent)parent.append(noticeElement);
  }
  let noticeTimer=null;
  function dismissNotice(){clearTimeout(noticeTimer);noticeElement.classList.remove('show');noticeElement.textContent='';}
  new MutationObserver(placeNotice).observe($('#modal-root'),{childList:true,subtree:true});
  document.addEventListener('click',event=>{if(event.target.closest('#toast [data-command="dismiss-notice"]')){event.preventDefault();event.stopImmediatePropagation();dismissNotice();}},true);
  function toast(message) {
    clearTimeout(noticeTimer);noticeTimer=setTimeout(dismissNotice,globalThis.PlayroomSizeCatalogue?.presentation?.interaction.toastMs??6000);
    noticeElement.innerHTML=`<span>${esc(message)}</span><button class="icon-btn" data-command="dismiss-notice" aria-label="${globalThis.PlayroomMessages.text("ui.app.935e004f83bf")}" title="${globalThis.PlayroomMessages.text("ui.app.935e004f83bf")}">${icon('close')}</button>`;noticeElement.classList.add('show');noticeElement.setAttribute('role','alert');placeNotice();
  }
  let shownUpdateKey='';
  try{shownUpdateKey=localStorage.getItem('playroom.shown-update.v1')||'';}catch(_){}
  function updateIdle(){return screen==='hub'&&!room&&!transition&&!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()&&storageOK&&!globalThis.PlayroomData.pending;}
  globalThis.PlayroomPWA?.setUpdateGuard(()=>updateIdle()&&(!$('#modal-root').children.length||!!$('#modal-root .updates-modal')));
  function showUpdates(force=false){
    if(!updateIdle()||$('#modal-root').children.length||document.hidden)return false;
    const app=globalThis.PlayroomPWA?.updateInfo,items=packUpdates();
    const key=[app?'app@'+(app.version||'pending'):'',...items.map(updateKey)].join('|');
    const fresh=items.some(item=>!packNotices.dismissed.includes(updateKey(item)));
    if(!app&&!items.length||!force&&(key===shownUpdateKey||!app&&!fresh))return false;
    shownUpdateKey=key;try{localStorage.setItem('playroom.shown-update.v1',key);}catch(_){}
    rememberPackUpdates('dismissed');
    openModal(globalThis.PlayroomUpdateDialog.markup({app,installedVersion:appVersion,packs:items.map(item=>({...item,name:meta(item.id)?.name||item.id})),installed:id=>packs.list().filter(p=>p.id===id).sort((a,b)=>globalThis.TabletopPacks.compareVersions(b.version,a.version))[0]?.version||'0.0.0',esc,head:modalHead}),'updates-modal');
    return true;
  }
  window.addEventListener('playroom-update-ready',()=>{if(screen==='hub')renderHub();showUpdates();});
  // Observe screen/dialog transitions, not game frames or a recurring timer.
  window.addEventListener('playroom:hub-rendered',()=>queueMicrotask(()=>showUpdates()));
  new MutationObserver(()=>showUpdates()).observe($('#modal-root'),{childList:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)showUpdates();});
  function reportSaveFailure(error) {
    const name=error?.name,code=error?.code;
    const key=name==='QuotaExceededError'||name==='NS_ERROR_DOM_QUOTA_REACHED'?'ui.app.save-quota':
      name==='SecurityError'||name==='NotAllowedError'?'ui.app.save-unavailable':
      code==='LIBRARY_REMOVED'?'ui.app.save-removed':'ui.app.save-failed';
    console.warn('Playroom session save failed',{name,code});
    toast(globalThis.PlayroomMessages.text(key));storageOK=false;return false;
  }
  async function save() {
    if (!session||historyOrigin?.kind==='library') return true;
    try { await library.writeAsync(session,sessionId); storageOK = true; loadWarning=''; return true; }
    catch (error) { return reportSaveFailure(error); }
  }
  function playSounds(before,after) {
    soundTicket++;
    if(!settings.sound||document.hidden||gate!==null)return;
    const cues=E.soundCues(after,viewer,before.events.at(-1)?.id||0);
    const finishIds=new Set(after.events.filter(e=>e.kind==='finish').map(e=>e.id));
    const ids=cues.filter(c=>!finishIds.has(c.eventId)).map(c=>c.id);
    if(ids.length)void audio.sequence(ids,{pack:after.game});
  }
  async function previewSound(id='move',pack) {
    if(!settings.sound||document.hidden)return;
    const ticket=++soundTicket;
    if(await audio.unlock()&&ticket===soundTicket&&settings.sound&&!document.hidden)void audio.sequence([id],{pack});
  }
  function stopSounds() {soundTicket++;audio.stop();}
  function cancelBot() { clearTimeout(botTimer); botTimer=null; authority?.cancelBot(); }
  function clearViewHints(){delete viewState.hint;delete screenController.viewState.hint;}
  function setLocalPaused(value){
    if(value)clearViewHints();
    paused=value;clearTimeout(autoPassTimer);autoPassTimer=null;reactionShownAt=null;
    if(!session||historyOrigin?.kind==='library')return;
    const player=session.current.players.findIndex(p=>!p.bot);if(player<0)return;
    const client=localClient(player),snapshot=client.snapshot();if(snapshot.paused===value)return;
    void Promise.resolve(client.dispatch(Protocol.command(snapshot,{type:'session-pause',paused:value,expectedControlRevision:snapshot.controlRevision},'local-control-'+(++commandSequence)))).then(receipt=>{if(!receipt.ok)toast(receipt.message);}).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
  }
  function stopReplay(stopAudio=true) { replayPaused=false;globalThis.PlayroomPublicSequence?.setMode($('#app'),'still');clearTimeout(replayTimer); replayTimer=null;replayTicket++;feedback.clear();flow.cancel();if(stopAudio)stopSounds(); }
  const {orderedVisibleGames,tile,recentGameCard,hubFilterMarkup,renderHub,moveHubGame,editHubStep,hubDropAt,savedGamesMarkup,refreshNetworkSaved,updateSavedPanel}=globalThis.PlayroomHubPresenter.create({get settings(){return settings;},get $(){return $;},set $(value){$=value;},get E(){return E;},set E(value){E=value;},get GameScreen(){return GameScreen;},set GameScreen(value){GameScreen=value;},get Tags(){return Tags;},set Tags(value){Tags=value;},get V(){return V;},set V(value){V=value;},get appVersion(){return appVersion;},set appVersion(value){appVersion=value;},get brand(){return brand;},set brand(value){brand=value;},get cancelBot(){return cancelBot;},get catalog(){return catalog;},set catalog(value){catalog=value;},get esc(){return esc;},set esc(value){esc=value;},get feedback(){return feedback;},set feedback(value){feedback=value;},get filter(){return filter;},set filter(value){filter=value;},get flashPacksOnHub(){return flashPacksOnHub;},set flashPacksOnHub(value){flashPacksOnHub=value;},get hubEditing(){return hubEditing;},set hubEditing(value){hubEditing=value;},get hubFiltersOpen(){return hubFiltersOpen;},get hubFilters(){return hubFilters;},set hubFilters(value){hubFilters=value;},get hubTab(){return hubTab;},set hubTab(value){hubTab=value;},get icon(){return icon;},set icon(value){icon=value;},get input(){return input;},set input(value){input=value;},get interruptAction(){return interruptAction;},get isPass(){return isPass;},set isPass(value){isPass=value;},get latestPacks(){return latestPacks;},get library(){return library;},set library(value){library=value;},get loadWarning(){return loadWarning;},set loadWarning(value){loadWarning=value;},get meta(){return meta;},set meta(value){meta=value;},get networkSaved(){return networkSaved;},set networkSaved(value){networkSaved=value;},get networkSavedState(){return networkSavedState;},set networkSavedState(value){networkSavedState=value;},get networkSavedTicket(){return networkSavedTicket;},set networkSavedTicket(value){networkSavedTicket=value;},get packNotices(){return packNotices;},set packNotices(value){packNotices=value;},get packUpdates(){return packUpdates;},get playerTargets(){return playerTargets;},set playerTargets(value){playerTargets=value;},get savedFilter(){return savedFilter;},set savedFilter(value){savedFilter=value;},get screen(){return screen;},set screen(value){screen=value;},get session(){return session;},set session(value){session=value;},get localResumeVisible(){return settings.hiddenLocalSession!==sessionId;},get updateKey(){return updateKey;},set updateKey(value){updateKey=value;}});











  function leaveTable(tab='games') {
    if(historyOrigin)restoreHistoryOrigin();
    clearTimeout(autoPassTimer);autoPassTimer=null;
    interruptAction();input?.cancel();playerTargets?.cancel();cancelBot();stopReplay();
    if(screen==='table')save();
    if(room?.transportMode==='hotseat'){roomService.discardRecovery(room.id);room=null;lobbyParticipantId=null;}
    screen='hub';hubTab=tab;filter='all';Object.assign(hubFilters,{type:'',mechanic:'',format:''});historyOpen=false;replayIndex=null;selected=null;paused=true;
    closeModal(true);flashPacksOnHub=true;render();refreshPackUpdates();
  }
  async function resumeSession(id=sessionId,{history=false}={}) {
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text("ui.app.ed9bf8ddc81a"));
    if(!id)return toast(globalThis.PlayroomMessages.text("ui.app.34c23d3e2ac3"));
    try {
      if(history){openLibraryHistory(id);return;}
      interruptAction();input?.cancel();cancelBot();stopReplay();
      if(id!==sessionId) {
        if(!await save())return;
        const next=library.open(id);await library.activateAsync(next,id);session=next;sessionId=id;storageOK=true;
      }
      if(!session)return;
      activateSession();restoreSessionLobby();
      rememberGame(session.game);
      screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;awaitingPass=false;lastResult=null;missedFrom=null;
      viewer=isPass()&&!session.current.players[session.current.turn]?.bot?session.current.turn:session.current.players.findIndex(p=>!p.bot);gate=needsGate(session.current)?viewer:null;
      setLocalPaused(false);closeModal(true);render();
      if(session.current.status==='finished')openHistory();
    } catch(error) {toast(globalThis.PlayroomMessages.text("ui.app.893a6738231c",{p0:String(globalThis.PlayroomMessages.error(error))}));}
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
      let draft=roomService.create({transportMode:'hotseat',name:globalThis.PlayroomMessages.text("ui.app.499f4549c0b2",{p0:String(host.nickname)}),host,game:{id:session.game,name:g.name,version:session.packVersion,...(g.botSettings?{botSettings:g.botSettings}:{})},rules:{preset:session.options.preset,presetLabel:session.options.presetLabel,openHands:!!session.options.openHands,options:Object.fromEntries((catalog[session.game]?.settings||[]).map(field=>[field.key,session.options[field.key]??field.default]))},constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
      draft=roomService.configure(draft.id,host.id,{transportMode:'hotseat'});
      const hostIndex=Math.max(0,players.findIndex(p=>!p.bot));
      if(hostIndex)draft=roomService.moveParticipant(draft.id,host.id,host.id,draft.seats[hostIndex].id);
      for(let i=0;i<players.length;i++){
        const player=players[i];
        if(i===hostIndex)draft=roomService.renameLocalSeat(draft.id,host.id,draft.seats[i].id,player.name);
        else draft=roomService.setLocalSeat(draft.id,host.id,draft.seats[i].id,{kind:player.bot?'bot':'human',nickname:player.name});
        if(player.bot)draft=roomService.configureBot(draft.id,host.id,draft.seats[i].id,{nickname:player.name,avatar:player.avatar||null,botSettings:player.botSettings});
      }
      room=roomService.restoreHotSeatLobby(draft,{hostId:host.id,active:true});
    }
    lobbyParticipantId=room.ownerId;
  }
  function askDelete(id) {
    const entry=library.list().find(entry=>entry.id===id);if(!entry)return;
    openModal(PlayroomGameScreen.deleteConfirmation({name:entry.invalid?globalThis.PlayroomMessages.text("ui.app.02c17edea60f"):meta(entry.game)?.name||entry.game,confirmAttrs:`data-delete-confirm="${esc(id)}"`}));
  }
  function refreshSavedGameRecovery(){
    try{
      const saved=library.current();
      if(saved&&!session){session=saved.session;sessionId=saved.id;}
      loadWarning='';
    }catch(_){
      loadWarning=globalThis.PlayroomMessages.text("ui.app.3f69ce8ef70a");
    }
  }
  async function deleteNetworkSession(id){
    try{await globalThis.PlayroomNetworkLibrary.remove(id);closeModal(true);await refreshNetworkSaved();}catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function askDeleteNetwork(id){
    const entry=networkSaved.find(entry=>(entry.role==='client'?'client:'+entry.id:entry.sessionId)===id);if(!entry)return;
    openModal(PlayroomGameScreen.deleteConfirmation({name:meta(entry.game)?.name||entry.game||globalThis.PlayroomMessages.text("ui.app.02c17edea60f"),network:true,confirmAttrs:`data-delete-network-confirm="${esc(id)}"`}));
  }
  async function deleteSession(id) {
    const position=window.scrollY;
    try {
      await library.removeAsync(id);
      if(id===sessionId){interruptAction();cancelBot();stopReplay();session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;}
      if(packs?.warnings?.some(warning=>/^Встроенный пакет /.test(warning))) {
        try {
          await globalThis.PlayroomPackManager?.reconcile?.(packs,library);
          for(const [packId,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(packId,pack.sounds);
        }catch(error){globalThis.PlayroomPackLoadError=globalThis.PlayroomMessages.error(error)||globalThis.PlayroomMessages.text("ui.app.36788568657c");}
      }
      refreshSavedGameRecovery();
      screen='hub';hubTab='sessions';closeModal(true);render();window.scrollTo(0,position);
    } catch (_) {toast(globalThis.PlayroomMessages.text("ui.app.f148bfcf7409"));}
  }
  function clearDeletedSession(){
    if(sessionId&&library.records().some(record=>record.id===sessionId))return;
    interruptAction();cancelBot();stopReplay();session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;
    refreshSavedGameRecovery();
  }
  async function askClearGames(){
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text("ui.app.8f8a5c5c96ff"));
    try{
      const local=library.records(),network=await globalThis.PlayroomNetworkLibrary.list({strict:true});
      if(!local.length&&!network.length)return;
      openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.e4d80efec0d1"))}<p class="lead">${globalThis.PlayroomMessages.text("ui.app.7e258bdf13d6")}${local.length+network.length} ${globalThis.PlayroomMessages.text("ui.app.06448ac94275")}</p><div class="modal-foot"><button class="btn secondary" data-command="close-modal">${globalThis.PlayroomMessages.text("ui.app.97b65905439a")}</button><button class="btn coral" data-clear-games-confirm>${icon('trash')} ${globalThis.PlayroomMessages.text("ui.app.787b30e70b0f")}</button></div>`);
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  async function clearGames(){
    try{
      const network=await globalThis.PlayroomNetworkLibrary.list({strict:true});
      for(const entry of network)await globalThis.PlayroomNetworkLibrary.remove(entry.role==='client'?'client:'+entry.id:entry.sessionId);
      for(const record of library.records())await library.removeAsync(record.id);
      clearDeletedSession();closeModal(true);renderHub();
    }catch(error){toast(globalThis.PlayroomMessages.text("ui.app.969afd6c7829",{p0:String(globalThis.PlayroomMessages.error(error))}));renderHub();}
  }
  function activeActions(state) {
    if (isReplay()||gate!==null||paused||state.status==='finished'||state.players[viewer]?.bot) return [];
    const actions=localClient(viewer).snapshot().actions;return transition||awaitingPass&&!E.decisionWindow?.(state)?actions.filter(action=>E.reactions?.(state,viewer).some(reaction=>Protocol.canonical(reaction)===Protocol.canonical((({disabled,...command})=>command)(action)))):actions;
  }
  function playersMarkup(state,actions=[]) {
    return GameScreen.playersMarkup(state,viewer,actions,{scoreLabel:meta(session.game).scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee"),playerBadge:(projected,i)=>catalog[projected.game]?.playerBadge?.(projected,i)});
  }
  function renderTable(animate=false,preserveField=false,preserveLayout=false) {
    if (!session) return renderHub();
    activateSession();
    const state=currentState(), game=meta(session.game), replay=isReplay(), actions=activeActions(state), passProtected=handoffDelay()>0;
    const shownViewer=gate!==null?-1:viewer,frame=localFrame(state,shownViewer,actions),projected=frame.state;
    screenController.history.receive(state===session.current?frame:localFrame(session.current,shownViewer));
    screenController.history.open=historyOpen;
    if(replay)screenController.history.select(replayIndex,frame);
    screenController.selection=selected;
    const context=screenController.context(frame,{scope:catalog[state.game]?.capabilities?.viewStateScope});
    selected=context.selected;viewState=context.viewState;

    feedback.renderField=scene=>V.renderField(projected,shownViewer,scene,{viewState,presentationTurn:transition?.beforeTurn??(replay?session.states[replayIndex-1]?.turn:undefined),preferences:screenController.preferences(TabletopUI.viewPreferences(state.game,shownViewer)),flipped:shownViewer===1});
    const setup=session.options.lobbyConfig;
    const occupied=setup?.seats.filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index);
    const primary=setup?occupied.findIndex(seat=>seat.participantId===setup.ownerId):projected.players.findIndex(p=>!p.bot);
    projected.players=projected.players.map((p,index)=>({...p,local:!p.bot&&index!==primary}));
    if(feedbackSession!==session){feedbackSession=session;feedback.start(E.project(session.current,viewer).events);}
    const turnPlayer=state.players[state.turn], finished=state.status==='finished';
    const turnText=replay?globalThis.PlayroomMessages.text("ui.app.a92c2f3c7ff1"):transition?globalThis.PlayroomMessages.text("ui.app.fadac501dd8a"):finished?globalThis.PlayroomMessages.text("ui.app.64f3ad19b9c6"):paused?globalThis.PlayroomMessages.text("ui.app.65530fd463ea"):turnPlayer?.bot?globalThis.PlayroomMessages.text("ui.app.f96994dfc267",{p0:String(turnPlayer.name)}):isPass()?globalThis.PlayroomMessages.text("ui.app.6e352d281a89",{p0:String(turnPlayer?.name)}):globalThis.PlayroomMessages.text("ui.app.12d5fb57ada4");
    const oldHand=$('.hand-track, .hand-cards, .hand-scroll'); const scrollLeft=oldHand?.scrollLeft||0;
    const eventText=replay&&replayIndex===0?globalThis.PlayroomMessages.text("ui.app.03f70ecc37a6"):lastEvent(projected)?.text||globalThis.PlayroomMessages.text("ui.app.bcb4a1cfa013");
    const markup=GameScreen.render({
      layoutId:sessionId||session.createdAt,gameName:game.name,subtitle:Multiplayer.presetLabel(session.current.preset,game,catalog[session.game]?.presetSetting),
      state:projected,viewer:shownViewer,actions,scoreLabel:game.scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee"),
      playerBadge:(visible,i)=>catalog[visible.game]?.playerBadge?.(visible,i),
      turnText:game.max===1?'':turnText,turnExtra:game.max===1||replay?'':globalThis.PlayroomMessages.text("ui.app.e954f44bf49a",{p0:String(state.move+1),p1:String(!state.data.hands&&!E.decisionWindow?.(state)?globalThis.PlayroomMessages.text("ui.app.182bafd6e1b1"):session.options.openHands?globalThis.PlayroomMessages.text("ui.app.3d9add839803"):globalThis.PlayroomMessages.text("ui.app.a3e084db5bc0"))}),
      replay,busy:!!transition,botThinking:!replay&&!!turnPlayer?.bot,animationSpeed:settings.animationSpeed,
      scene:V.render(projected,shownViewer,actions,{displayScene:feedback.displayScene,fieldScene:feedback.fieldScene,selected,viewState,replay,hotseat:isPass(),presentationTurn:transition?.beforeTurn??(replay?session.states[replayIndex-1]?.turn:undefined),preferences:screenController.preferences(TabletopUI.viewPreferences(state.game,shownViewer)),flipped:shownViewer===1,quickPlay:settings.quickPlay})+(paused&&!replay?`<div class="pause-cover"><h2>${globalThis.PlayroomMessages.text("ui.app.6f02551279d4")}</h2><p>${globalThis.PlayroomMessages.text("ui.app.63b894bbd7b4")}</p><button class="btn" data-command="pause">${icon('play')}${globalThis.PlayroomMessages.text("ui.app.558521e805d1")}</button></div>`:''),
      historyHTML:historyOpen?historyMarkup():'',historyCaption:eventText,historyResult:session.current.status==='finished',roomAction:room?{attrs:'data-command="room"'}:null,pause:paused,readOnly:historyOrigin?.kind==='library',
      beforeFooter:isPass()&&!autoPassForViewer()&&!replay&&!finished?GameScreen.iconButton('data-command="pass-device"',globalThis.PlayroomMessages.text("ui.app.9e49bec43037"),'arrow',{className:'pass-device-button'+(awaitingPass&&!paused&&!transition&&!passProtected?' handoff-pending':''),disabled:!awaitingPass||!!transition||paused||gate!==null||passProtected}):'',
      footerText:eventText,footerTitle:lastEvent(projected)?.text||globalThis.PlayroomMessages.text("ui.app.efcdf40bd477"),saved:storageOK,
      footerAction:{command:finished?'result':'pause',label:finished?globalThis.PlayroomMessages.text("ui.app.24735a7161d9"):paused?globalThis.PlayroomMessages.text("ui.app.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.app.65530fd463ea"),icon:finished?'arrow':paused?'play':'pause'}
    });
    globalThis.PlayroomPublicSequence?.setMode($('#app'),replay?(replayPaused?'pause':replayTimer?'play':'still'):'live');
    const keptLayout=GameScreen.update($('#app'),markup,{preserveLayout});
    const newHand=$('.hand-track, .hand-cards, .hand-scroll'); if(newHand)newHand.scrollLeft=scrollLeft;
    if(!keptLayout)HandOverflow.sync($('#app'));
    ensureRoomButton();globalThis.PlayroomPublicSequence?.useExecutor($('#app'),flow.executor);if(!keptLayout)GameScreen.layoutScene($('#app'));
    feedback.refresh();playerTargets?.refresh();
    globalThis.PlayroomFirstTurnGuide.update({owner:session,learningUserId:hotseatPreference()?.primary?playerProfile?.id:hotseatPreference()?.key,state:projected,viewer:shownViewer,actions,ui:{selected,viewState},busy:!!transition||!!feedback.active||feedback.queue.length>0,active:!paused&&gate===null&&!replay,replay});
    if(replay)turnNotice.reset();
    else turnNotice.observe({sessionId:sessionId||session.createdAt,revision:state.move,turn:state.turn,viewer,status:state.status,paused,active:screen==='table'&&!transition&&gate===null&&!document.hidden,mount:$('#app')});
    if(gate!==null&&!replay)showGate();
    if(!transition&&!replay&&gate===null)presentationReady();
    scheduleBot();scheduleAutoPass();
  }
  function historyStarts(){return session.current.players.length===1?Array.from({length:session.states.length},(_,i)=>i):session.current.timeline?.starts||[];}
  function historyStart(){return session.current.timeline?.playStart??0;}
  function historyMarkup() {
    const idx=replayIndex??session.states.length-1;
    const chooser=historyOrigin?.kind==='library'&&isPass()?`<label class="history-viewer">${globalThis.PlayroomMessages.text("ui.app.f54f58cf08df")}<select id="history-viewer" aria-label="${globalThis.PlayroomMessages.text("ui.app.55228669ae30")}">${session.current.players.map((p,i)=>`<option value="${i}" ${i===viewer?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:'';
    return chooser+GameScreen.historyMarkup({minimum:historyStart(),turnStarts:historyStarts(),roundStarts:(E.project(session.current,-1).scene?.round?.starts||[]).map((revision,index)=>({revision,number:index+1})),index:idx,count:session.states.length-1,playing:!!replayTimer});
  }
  function scrubHistory(index) {
    const slider=$('#replay-range'),focused=document.activeElement===slider,before=currentState(),previous=replayIndex??session.states.length-1;
    input?.cancel();stopReplay();const next=globalThis.PlayroomHistoryController.readyBatchEnd(session.states,Math.max(historyStart(),Math.min(session.states.length-1,index)),s=>E.decisionWindow?.(s)),after=session.states[next],events=E.project(after,viewer).events;
    const action=next<previous?{type:'replay-back'}:events.findLast(e=>e.presentation)?.presentation||{type:'replay'};
    const snapshot=next!==previous&&catalog[session.game]?.capabilities?.presentation?.entityMotion?flow.capture({actor:before.turn,action,viewer,deferDepartures:true}):null;
    replayIndex=next;selected=null;renderTable();if(snapshot)void flow.play(snapshot);
    if(slider){slider.value=String(replayIndex);$('#replay-range')?.replaceWith(slider);if(focused)slider.focus();}
  }
  function hotseatPreference(){
    if(!session)return null;
    const lobby=session.options.lobbyConfig,seats=lobby?.seats?.filter(s=>s.participantId).sort((a,b)=>a.index-b.index),participant=seats?.[viewer]?.participantId;
    const primary=participant?participant===lobby.ownerId:viewer===session.current.players.findIndex(p=>!p.bot);
    return {primary,key:participant&&lobby.id?JSON.stringify(['lobby',lobby.id,participant]):`${session.createdAt}:${viewer}`,legacyKey:`${session.createdAt}:${viewer}`};
  }
  function autoPassForViewer(){
    const preference=hotseatPreference();
    return preference?.primary?settings.autoPass:preference?(settings.hotseatAutoPass[preference.key]??settings.hotseatAutoPass[preference.legacyKey]??false):false;
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
    if(autoPassForViewer()||wait>0)autoPassTimer=setTimeout(()=>{
      if(screen!=='table'||document.hidden||$('#modal-root').children.length)return;
      if(autoPassForViewer())transferDevice();else renderTable();
    },wait);
    else if($('#app [data-command=pass-device]')?.disabled)renderTable();
  }
  function presentationReady(){
    if(!session||isReplay()||transition||paused)return;
    screenController.history.markPresented(session.current.move);
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
    $('#app').insertAdjacentHTML('beforeend',`<section class="handoff" role="dialog" aria-modal="true" aria-label="${globalThis.PlayroomMessages.text("ui.app.56a282293bf5")}"><div class="handoff-content"><div class="handoff-art" aria-hidden="true"><span>✦</span><span>✦</span></div><span class="eyebrow muted">${globalThis.PlayroomMessages.text("ui.app.bb21addcf210")}</span><h2>${esc(player.name)}, ${globalThis.PlayroomMessages.text("ui.app.1cb39990173e")}</h2><p>${globalThis.PlayroomMessages.text("ui.app.7d875df45719")}<br>${globalThis.PlayroomMessages.text("ui.app.d0aa0a02cf67")}</p><button class="btn" data-command="unlock">${icon('eye')}${globalThis.PlayroomMessages.text("ui.app.90089f1a1dc7")}${esc(player.name)} · ${globalThis.PlayroomMessages.text("ui.app.ca7cd7cf82b3")}</button></div>${GameScreen.iconButton('data-command="home"',globalThis.PlayroomMessages.text("ui.app.6a186c342109"),'back',{className:'handoff-nav'})}</section>`);
    $('.handoff .btn')?.focus();
  }
  function render(animate=false) { if(screen!=='table')globalThis.PlayroomFirstTurnGuide.stop();screen==='hub'?renderHub():screen==='lobby'?renderLobby():renderTable(animate); }
  function scheduleBot() {
    cancelBot();
    if(transition||!session||screen!=='table'||isReplay()||paused||gate!==null||document.hidden||$('#modal-root').children.length||session.current.status==='finished')return;
    if(globalThis.PlayroomPublicSequence?.defer($('#app'),scheduleBot))return;
    localAuthority().scheduleBot({delay:pace().botDelay,run:(actor,action,context)=>act(actor,action,context),onError(error){paused=true;render();toast(globalThis.PlayroomMessages.error(error));}});
  }
  function presentFinishedResult(){if(globalThis.PlayroomPublicSequence?.defer(document.querySelector('#app'),presentFinishedResult))return;if(screen==='table'&&!isReplay()&&!$('#modal-root').children.length&&session?.current.status==='finished'&&lastResult!==session.createdAt){lastResult=session.createdAt;showResult(true);}}
  function markDeviceHandoff(beforeTurn) {
    if(isPass()&&session.current.turn!==beforeTurn&&session.current.status!=='finished'&&!session.current.players[session.current.turn]?.bot&&session.current.turn!==viewer)awaitingPass=true;
  }
  function finishAction(run,{redraw=true,result=true}={}) {
    if(transition!==run)return;
    transition=null;screenController.cancelTransition();flow.cancelAction();
    if(session!==run.session)return;
    markDeviceHandoff(run.beforeTurn);
    presentationReady();
    if(redraw&&screen==='table'&&!isReplay())renderTable();
    if(result)presentFinishedResult();
  }
  function interruptAction() { feedback.clear();if(transition)finishAction(transition,{redraw:false,result:false}); }
  const cardTransfers=(before,after)=>Authority.transfers(before,after,E.project(after,viewer).events);
  function act(actor,action,context={}) {
    if(isReplay()||paused||gate!==null)return;
    const independent=!!E.reactionControl?.(session.current,actor,action)?.independent;
    if(transition&&!independent)return;
    if(!session.current.players[actor]?.bot&&action.confirmation&&!context.confirmed){
      if($('#modal-root').children.length)return;
      openModal(GameScreen.actionConfirmationMarkup(action));
      pendingAction={session,state:session.current,actor,action,context};return;
    }
    try {
      if(transition&&independent){const guideToken=globalThis.PlayroomFirstTurnGuide.capture(session,actor);const initialScene=E.project(session.current,viewer).scene;const receipt=screenController.send(action,{actor});if(!receipt.ok&&!receipt.ignored)throw Error(receipt.message);if(receipt.ok&&!receipt.ignored)globalThis.PlayroomFirstTurnGuide.committed(session,actor,action,guideToken);const projected=E.project(session.current,viewer);feedback.accept(projected.events,E.soundCues(session.current,viewer,feedback.cursor),session.game,{mode:pace().mode,initialScene,finalScene:projected.scene});save();renderTable();return;}
      const guideToken=globalThis.PlayroomFirstTurnGuide.capture(session,actor);
      const beforeState=session.current,beforeTurn=beforeState.turn,initialScene=E.project(beforeState,viewer).scene,timing=pace(),snapshot=flow.capture({actor,action,viewer,playedFrom:context.playedFrom,sceneModel:initialScene,deferDepartures:true});
      if(session.current.players[actor]?.bot)localAuthority().actBot(actor,action);
      else {const receipt=screenController.send(action,{actor});if(receipt.ignored||receipt.code==='REACTION_WAIT')return;if(!receipt.ok)throw Error(receipt.message);}
      globalThis.PlayroomFirstTurnGuide.committed(session,actor,action,guideToken);
      GameScreen.allowLayoutChange($('#app'),context);if(!action.preserveSelection)selected=null;playerTargets?.cancel();
      const quiet=catalog[session.game]?.capabilities?.quietActions?.includes(action.type);
      const draws=cardTransfers(beforeState,session.current).filter(draw=>draw.privateTo==null||(Array.isArray(draw.privateTo)?draw.privateTo.includes(viewer):draw.privateTo===viewer));
      const projected=E.project(session.current,viewer),events=projected.events.filter(event=>event.id>(beforeState.events.at(-1)?.id||0));
      feedback.accept(events,E.soundCues(session.current,viewer,beforeState.events.at(-1)?.id||0),session.game,{initialScene,finalScene:projected.scene,defer:!quiet,silent:document.hidden||gate!==null,mode:timing.mode,snapshot,motion:quiet?null:(context,step)=>flow.play(step?.snapshot||snapshot,{draws:step?.draws??draws,transferOnly:step?.transferOnly,context})});
      save();input?.invalidate();
      if(quiet&&context.deferRender)return;
      if(quiet){const shownSession=session,revision=session.current.move;markDeviceHandoff(beforeTurn);renderTable(false,true);if(catalog[session.game]?.capabilities?.presentation?.entityMotion&&snapshot)void flow.play(snapshot).then(()=>{if(session===shownSession&&session.current.move===revision)presentFinishedResult();});else presentFinishedResult();return;}
      screenController.transition({context:{session,beforeTurn},capture:()=>snapshot,
        render(run){transition=run;renderTable();Motion.prepare(snapshot,draws);},
        play:()=>flow.present(()=>{feedback.next();return feedback.whenIdle();}),
        settle:0,finish:run=>finishAction(run)});
    } catch(error){toast(globalThis.PlayroomMessages.error(error)||globalThis.PlayroomMessages.text("ui.app.691a0701dfac"));void previewSound('error',session?.game);}
  }
  const localModal=new globalThis.PlayroomDOM.ModalController({host:$('#modal-root'),background:$('#app')});
  function openModal(content,className='',{keepAudio=false,size='auto'}={}) {
    pendingAction=null;pendingConfirmation=null;
    const template=document.createElement('template');template.innerHTML=content;
    const large=size==='large'||size==='auto'&&(className==='pack-manager-modal'||className==='room-setup-modal'||template.content.querySelector('.room-choice-list,.settings-overview,#room-rules-form,.lobby-seats>.lobby-seat-row:nth-child(2)'));
    const dialogSize=large?'large':'compact';
    const existing=className&&$('#modal-root .'+className);
    if(existing&&(className==='room-setup-modal'||className==='pack-manager-modal')){
      existing.dataset.dialogSize=dialogSize;GameScreen.updateModal(existing,content);return;
    }
    const returnToSettings=!!$('#modal-root .settings-overview')&&!template.content.querySelector('.settings-overview')?settingsReturn:null;
    const returnToRoom=!!$('#modal-root .room-setup-modal')&&className!=='room-setup-modal';
    dismissNotice();const focused=document.activeElement;interruptAction();stopReplay(!keepAudio);input?.cancel();cancelBot();if(screen==='table')renderTable();cancelBot();modalReturn=focused?.isConnected?focused:focused?.dataset?.command?$('#app [data-command="'+focused.dataset.command+'"]'):focused;modalBack=returnToSettings|| (returnToRoom?($('#modal-root [data-command=lobby-start]')?renderLobby:()=>globalThis.PlayroomNetworkLibrary?.openRoom?.()):null);$('#app').inert=true;
    if(!template.content.querySelector('.modal-head')){
      const title=template.content.querySelector('h2');if(title){const text=title.textContent;title.remove();content=GameScreen.modalHead(text)+template.innerHTML;}
    }
    localModal.open(`<div class="modal-backdrop"><section class="modal ${className}" data-dialog-size="${dialogSize}" role="dialog" aria-modal="true">${GameScreen.modalContent(content)}</section></div>`);
    GameScreen.fitCovers($('#modal-root'));GameScreen.fitGameTitles($('#modal-root'));
    placeNotice();
    const heading=$('.modal h2'); if(heading){heading.id='dialog-title';$('.modal').setAttribute('aria-labelledby','dialog-title');}
    $('.modal button,.modal input,.modal select')?.focus();
  }
  function confirmOperation(message,{onConfirm,isCurrent=()=>true,label}={}){
    openModal(GameScreen.actionConfirmationMarkup({confirmation:message,label},'confirm-operation'));
    pendingConfirmation={onConfirm,isCurrent};
  }
  function closeModal(ignoreBack=false) {
    pendingAction=null;pendingConfirmation=null;
    dismissNotice();
    if($('#profile-form')&&!playerProfile?.name&&!ignoreBack)return;

    const back=modalBack;modalBack=null;
    if(back&&!ignoreBack){localModal.close();back();return;}
    stopSounds();localModal.close();placeNotice();$('#app').inert=false;modalReturn?.focus?.();scheduleBot();scheduleAutoPass();
    window.dispatchEvent(new Event('playroom:game-options'));
  }
  const modalHead = GameScreen.modalHead;
  function ensureRoomButton(){
    const tools=$('#app .topbar-tools')||$('#app .table-tools');
    if(!tools||tools.closest('.table-shell')||!room||tools.querySelector('[data-command="room"]'))return;
    const node=document.createElement('button');node.className='icon-btn';node.dataset.command='room';node.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.app.3a73248bdd79"));node.title=globalThis.PlayroomMessages.text("ui.app.3a73248bdd79");node.innerHTML=icon('room');tools.prepend(node);
  }
  new MutationObserver(ensureRoomButton).observe($('#app'),{subtree:true,childList:true});
  function setup(gameId,draft=null) {
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text("ui.app.ed9bf8ddc81a"));
    if(room)leaveLobby();
    const active=activatePack(gameId),g=meta(gameId);if(!g){packUI?.open();return;}
    const rules=defaultRules(gameId,g);
    const host={id:playerProfile?.id||'local-host',nickname:playerProfile?.name||globalThis.PlayroomMessages.text("ui.app.f54f58cf08df"),avatar:profileAvatar};
    room=roomService.create({transportMode:'hotseat',name:globalThis.PlayroomMessages.text("ui.app.499f4549c0b2",{p0:String(host.nickname)}),host,game:{id:gameId,name:g.name,version:active.version,...(g.botSettings?{botSettings:g.botSettings}:{}),teamLayouts:catalog[gameId]?.teamLayouts||{}},rules,constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
    lobbyParticipantId=host.id;room=roomService.configure(room.id,host.id,{transportMode:'hotseat'});
    for(let i=1;i<g.min;i++)room=roomService.setLocalSeat(room.id,host.id,room.seats[i].id,{kind:'bot',nickname:randomBotName()});
    renderLobby();
  }
  function roomRulesFromForm(form){
    const game=form.dataset.game,packOptions=Object.fromEntries((catalog[game]?.settings||[]).map(field=>[field.key,choiceValue(form.elements['option-'+field.key])]));
    const rules={firstPlayerMode:(form.elements.firstPlayerMode?.value||'rules'),seatOrder:(form.elements.seatOrder?.value||'normal'),preset:choiceValue(form.elements.preset),presetLabel:Multiplayer.presetLabel(choiceValue(form.elements.preset),meta(game),catalog[game]?.presetSetting),openHands:!!form.elements.openHands?.checked,options:packOptions};
    return {...rules,display:Multiplayer.describeRules(rules,catalog[game]?.settings||[],!!catalog[game]?.capabilities?.hands,catalog[game]?.presetSetting)};
  }
  function latestRoomEvent(type){return room?.events?.slice().reverse().find(event=>!type||event.type===type)||null;}
  function renderLobby(){
    if(!room)return;
    room=roomService.snapshot(room.id);ensureRoomButton();
    if(screen==='lobby'){screen='hub';renderHub();}
    const state=room,isHost=state.ownerId===lobbyParticipantId;
    openModal(PlayroomLobbyView.render({room:state,participantId:lobbyParticipantId,isHost,canStart:isHost&&roomService.canStart(state.id),startReason:isHost?roomService.startBlocker(state.id):'',countdown:lobbyCountdown??3}),'room-setup-modal');
    PlayroomLobbyView.notifyRulesChange(state,lobbyParticipantId,toast);
    PlayroomLobbyView.bindFirst($('#modal-root .lobby-shell'),id=>{room=roomService.configure(room.id,lobbyParticipantId,{firstParticipantId:id});renderLobby();});
    PlayroomLobbyView.bindDrag($('#modal-root .lobby-shell'),{canMove:()=>isHost&&state.phase==='lobby'&&!state.recovery,move(id,slot){room=roomService.moveParticipant(room.id,lobbyParticipantId,id,slot==='spectator'?null:slot);renderLobby();},onError:error=>toast(globalThis.PlayroomMessages.error(error))});
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
      if(guests.length&&!confirmed){openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.2bb9f7eecf7e"))}<p>${globalThis.PlayroomMessages.text("ui.app.b295b77d55d0")}</p><button class="btn" data-command="room-hotseat-confirm">${globalThis.PlayroomMessages.text("ui.app.91f7bab0648a")}</button>`);modalBack=renderLobby;return;}
      globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room.id,{preserveRoom:true});
      for(const p of guests)room=roomService.kick(room.id,lobbyParticipantId,p.id);
    }
    if(key==='transportMode'&&value==='network')for(const p of room.participants.filter(p=>p.local&&!p.bot&&!p.isHost))room=roomService.setLocalSeat(room.id,lobbyParticipantId,p.seatId,{kind:'empty'});
    room=roomService.configure(room.id,lobbyParticipantId,{[key]:value});renderLobby();
  }
  async function startHotSeat(){
    room=roomService.prepareStart(room.id,lobbyParticipantId);dismissNotice();
    const seats=room.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index),players=seats.map(s=>{const p=room.participants.find(p=>p.id===s.participantId);return {name:p.nickname,bot:!!p.bot,...(p.botSettings?{botSettings:p.botSettings}:{}),...(p.avatar?{avatar:p.avatar}:{})};});
    if(!players.some(p=>!p.bot))throw Error(globalThis.PlayroomMessages.text("ui.app.dc875925c351"));
    if(room.firstPlayerMode==='assigned'&&!seats.some(s=>s.participantId===room.firstParticipantId))throw Error(globalThis.PlayroomMessages.text("ui.app.467f6abb2682"));
    activatePack(room.game.id,room.game.version);
    const mode=players.filter(p=>!p.bot).length>1?'pass':'solo',next=new Session(E,room.game.id,{players,mode,lobbyConfig:roomService.snapshot(room.id),preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:room.rules.openHands,firstPlayerMode:room.firstPlayerMode||'rules',firstPlayer:seats.findIndex(s=>s.participantId===room.firstParticipantId),...(room.rules.options||{})});
    if(!await save())return;
    const nextId=library.newId();
    try{await library.activateAsync(next,nextId);}catch(error){reportSaveFailure(error);return;}
    session=next;sessionId=nextId;storageOK=true;
    rememberGame(room.game.id);
    room=roomService.startHotSeat(room.id,lobbyParticipantId);
    screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;lastResult=null;awaitingPass=false;
    viewer=mode==='solo'?players.findIndex(p=>!p.bot):next.current.players[next.current.turn].bot?players.findIndex(p=>!p.bot):next.current.turn;
    gate=needsGate(next.current)?viewer:null;closeModal(true);render();presentationReady();
  }
  function updateLobbyNickname(form){try{room=roomService.rename(room.id,lobbyParticipantId,form.elements.nickname.value);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showBotSettings({person,config,seatId,readonly=false,remote=false}){
    const t=key=>globalThis.PlayroomMessages.text('ui.bot-settings.'+key),value={strategy:'auto',difficulty:'medium',...person.botSettings},levels=['easy','medium','hard'];let avatar=person.avatar||null;
    const options=config?.strategies?.length?[{id:'auto',label:t('auto'),description:t('auto-help')},...config.strategies]:[];
    const strategies=options.length?`<label class="field">${esc(t('strategy'))}</label><div class="bot-strategies">${options.map(p=>`<label class="bot-strategy"><input type="radio" name="strategy" value="${esc(p.id)}" ${p.id===value.strategy?'checked':''}><span><strong>${esc(p.label)}</strong><small>${esc(p.description)}</small></span></label>`).join('')}</div>`:'';
    openModal(`${modalHead(t('title'))}<form id="bot-settings-form" data-seat="${esc(seatId)}"><fieldset ${readonly?'disabled':''} class="bot-settings-fields"><div class="profile-identity-row"><button type="button" class="profile-avatar-button" data-bot-avatar aria-label="${esc(t('avatar'))}">${TabletopUI.avatar({name:person.nickname,avatar},0)}</button><label class="field">${esc(t('name'))}<input name="nickname" maxlength="24" required value="${esc(person.nickname)}"></label></div>${GameScreen.rangeSetting({id:'bot-difficulty',name:'difficulty',label:t('difficulty'),max:2,value:Math.max(0,levels.indexOf(value.difficulty)),display:t(value.difficulty),describedby:'bot-difficulty-help'})}<div class="bot-difficulty-icons" aria-hidden="true">${levels.map(level=>`<span data-difficulty-icon="${level}">${icon('bot-'+level)}</span>`).join('')}</div><p class="muted" id="bot-difficulty-help"></p>${strategies}</fieldset></form>${readonly?'':`<div class="bot-settings-footer" data-fixed-footer><button class="btn secondary" data-command="close-modal">${esc(t('cancel'))}</button><button class="btn" type="submit" form="bot-settings-form">${esc(t('apply'))}</button></div>`}`,'bot-settings-modal');
    const form=$('#bot-settings-form'),updateDifficulty=()=>{const level=levels[Number(form.elements.difficulty.value)];$('#bot-difficulty-value').textContent=t(level);form.elements.difficulty.setAttribute('aria-valuetext',t(level));form.elements.difficulty.closest('.settings-range').style.setProperty('--range-progress',(Number(form.elements.difficulty.value)*50)+'%');$('#bot-difficulty-help').textContent=t(level+'-help');form.querySelectorAll('[data-difficulty-icon]').forEach(node=>node.classList.toggle('selected',node.dataset.difficultyIcon===level));};form.elements.difficulty.addEventListener('input',updateDifficulty);updateDifficulty();
    form.querySelector('[data-bot-avatar]').addEventListener('click',()=>globalThis.PlayroomAvatarPicker.open({name:form.elements.nickname.value,selected:avatar,onSelect:value=>{avatar=value;form.querySelector('[data-bot-avatar]').innerHTML=TabletopUI.avatar({name:form.elements.nickname.value,avatar},0);}}));
    form.addEventListener('submit',event=>{event.preventDefault();if(readonly)return;try{room=roomService.configureBot(room.id,lobbyParticipantId,seatId,{nickname:form.elements.nickname.value,avatar,botSettings:{strategy:form.elements.strategy?.value||'auto',difficulty:levels[Number(form.elements.difficulty.value)]}});renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}});
    modalBack=remote?()=>globalThis.PlayroomNetworkLibrary.openRoom():renderLobby;
  }
  function showRoomHuman(seatId){const seat=room.seats.find(s=>s.id===seatId),p=room.participants.find(p=>p.id===seat?.participantId);openModal(`${modalHead(p?globalThis.PlayroomMessages.text("ui.app.11903af3c69a"):globalThis.PlayroomMessages.text("ui.app.c524c19c7ef4"))}<form id="room-human-form" data-seat="${esc(seatId)}" ${p?'data-rename="true"':''}><label class="field">${globalThis.PlayroomMessages.text("ui.app.1da7e9372e2f")}<input name="nickname" maxlength="24" required value="${esc(p?.nickname||globalThis.PlayroomMessages.text("ui.app.f54f58cf08df"))}"></label><button class="icon-btn" aria-label="${p?globalThis.PlayroomMessages.text("ui.app.59322ea5e71f"):globalThis.PlayroomMessages.text("ui.app.c524c19c7ef4")}" type="submit">${icon(p?'save':'addPlayer')}</button></form>`);modalBack=renderLobby;}
  function claimLobbySeat(seatId){const occupant=room.participants.find(p=>p.id===room.seats.find(s=>s.id===seatId)?.participantId);if(room.ownerId===lobbyParticipantId&&!room.recovery&&occupant&&(occupant.bot||room.transportMode==='hotseat')){showRoomHuman(seatId);return;}if(room.transportMode==='hotseat'&&!room.seats.find(s=>s.id===seatId)?.participantId){showRoomHuman(seatId);return;}try{room=roomService.claimSeat(room.id,lobbyParticipantId,seatId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function kickLobbyParticipant(targetId){try{room=roomService.kick(room.id,lobbyParticipantId,targetId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showRoomRules(){
    const state=roomService.snapshot(room.id),game=meta(state.game.id);
    const rows=state.rules.display||Multiplayer.describeRules(state.rules,catalog[state.game.id]?.settings||[],!!catalog[state.game.id]?.capabilities?.hands,catalog[state.game.id]?.presetSetting);
    openModal(globalThis.PlayroomMessages.text("ui.app.380e3dbd6730",{p0:String(modalHead(globalThis.PlayroomMessages.text("ui.app.ee9cd4deefad",{p0:String(game.name)}))),p1:String(PlayroomLobbyView.rulesMarkup(state,rows,game,catalog[state.game.id]?.settings||[]))}));modalBack ||= renderLobby;
  }
  function showRoomHelp(){openModal(globalThis.PlayroomMessages.text("ui.app.380e3dbd6730",{p0:String(modalHead(globalThis.PlayroomMessages.text("ui.app.df2a5a208045"))),p1:String(PlayroomLobbyView.helpMarkup(roomService.snapshot(room.id)))}));modalBack ||= renderLobby;}
  // Range positions are UI indices; saved/domain values remain the pack's exact IDs.
  function choiceValue(input){
    const choices=input?.dataset.choiceOptions;
    return choices?JSON.parse(choices)[Number(input.value)]?.value:input?.value;
  }
  function syncChoice(input){
    if(!input?.dataset.choiceOptions)return;
    const options=JSON.parse(input.dataset.choiceOptions),option=options[Number(input.value)];
    if(!option)return;
    input.setAttribute('aria-valuetext',option.label==='∞'?'Без ограничения':option.label);
    document.getElementById(input.id+'-value').textContent=option.label;
    input.closest('.settings-range').style.setProperty('--range-progress',(Number(input.value)/(options.length-1)*100)+'%');
  }
  function settingTitle(label,help){
    return `<span class="setting-title"><span class="setting-title-text">${esc(label)}</span>${PlayroomLobbyView.fieldHelp(help)}</span>`;
  }
  function ruleControl(field,name,value){
    const options=field.options,id='rule-'+name,index=Math.max(0,options.findIndex(option=>option.value===value));
    if(options.length===1)return `<input type="hidden" name="${esc(name)}" value="${esc(options[0].value)}">`;
    const control=field.control==='slider'?GameScreen.rangeSetting({id,name,label:field.label,max:options.length-1,value:index,display:options[index].label,choices:options}):`<label class="field" for="${esc(id)}"><span>${esc(field.label)}</span><select id="${esc(id)}" name="${esc(name)}">${options.map((option,i)=>`<option value="${esc(option.value)}" ${i===index?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`;
    return `<div class="rule-field" data-rule-field="${esc(field.key||'preset')}">${control.replace(`<span>${esc(field.label)}</span>`,settingTitle(field.label,field.help))}</div>`;
  }
  function showRoomRulesEditor(){
    const state=roomService.snapshot(room.id),g=meta(state.game.id),manifest=catalog[state.game.id]||{},presets=g.presets?.length?g.presets:[{id:'default',label:globalThis.PlayroomMessages.text("ui.app.a39ad47c9222")}],fields=manifest.settings||[];
    const preset=manifest.presetSetting||{label:globalThis.PlayroomMessages.text('ui.app.b5d827de5168'),options:presets.map(p=>({value:p.id,label:p.label||p.name||p.id}))};
    const controls=new Map([['preset',ruleControl(preset,'preset',state.rules.preset)],...fields.map(field=>[field.key,ruleControl(field,'option-'+field.key,state.rules.options?.[field.key]??field.default)])]);
    const groups=manifest.ruleGroups||[{fields:['preset',...fields.map(field=>field.key)]}];
    const renderGroup=group=>{
      const keys=group.fields.filter(key=>controls.has(key)),visible=keys.some(key=>key==='preset'?preset.options.length>1:fields.find(field=>field.key===key)?.options.length>1);
      return `<section class="rule-group" ${visible?'':'hidden'}>${group.label?`<h3>${esc(group.label)}</h3>`:''}<div class="rule-grid">${keys.map(key=>{const html=controls.get(key);controls.delete(key);return html;}).join('')}</div></section>`;
    };
    const body=groups.filter(group=>!group.end).map(renderGroup).join(''),ending=groups.filter(group=>group.end).map(renderGroup).join(''),rest=[...controls.values()].join('');
    const common=`<div class="start-options">${[['firstPlayerMode',globalThis.PlayroomMessages.text("ui.app.39210fbb29ff"),[['rules',globalThis.PlayroomMessages.text("ui.app.97a31231be5b"),'rules'],['random',globalThis.PlayroomMessages.text("ui.app.8a42883ca3dc"),'shuffle'],['assigned',globalThis.PlayroomMessages.text("ui.app.cfd07e716f9f"),'first']]],['seatOrder',globalThis.PlayroomMessages.text("ui.app.f7ca1ccfc66b"),[['normal',globalThis.PlayroomMessages.text("ui.app.f700823e4396"),'arrow'],['random',globalThis.PlayroomMessages.text("ui.app.8a42883ca3dc"),'shuffle']]]].filter(([name])=>name!=='firstPlayerMode'||manifest.capabilities?.firstPlayer!==false).map(([name,label,options])=>`<fieldset><legend>${label}${PlayroomLobbyView.fieldHelp(PlayroomLobbyView.ruleText(name==='seatOrder'?'seatOrder':'firstPlayer'))}</legend>${options.map(([value,text,glyph])=>`<label class="start-option"><input type="radio" name="${name}" value="${value}" ${(state[name]||(name==='seatOrder'?'normal':'rules'))===value?'checked':''}>${icon(glyph)}<span>${text}</span></label>`).join('')}</fieldset>`).join('')}</div>`;
    openModal(`${modalHead(globalThis.PlayroomMessages.text('ui.app.803a31d997e9')).replace('</header>',GameScreen.iconButton('data-command="reset-rules"',globalThis.PlayroomMessages.text('ui.app.reset-rules'),'undo')+'</header>')}<form id="room-rules-form" data-game="${esc(state.game.id)}"><section class="rule-group rule-common" ${g.max===1?'hidden':''}>${common}</section>${body}${rest}<section class="rule-group rule-common" ${manifest.capabilities?.hands?'':'hidden'}>${manifest.capabilities?.hands?`<label class="switch">${settingTitle(globalThis.PlayroomMessages.text('ui.app.957e469d885d'),PlayroomLobbyView.ruleText('openHands'))}<input type="checkbox" name="openHands" ${state.rules.openHands?'checked':''}></label>`:''}</section>${ending}<div class="modal-foot" data-fixed-footer><button class="btn secondary" type="button" data-rules="${esc(state.game.id)}">${globalThis.PlayroomMessages.text("ui.app.e2d0b8c5f974")}</button><button class="btn" type="submit" form="room-rules-form">${icon('save')} ${globalThis.PlayroomMessages.text("ui.app.98a9e5a733d4")}</button></div></form>`);
    const form=$('#room-rules-form');for(const input of form.querySelectorAll('[data-choice-options]'))syncChoice(input);syncRuleVisibility(form);
  }
  function syncRuleVisibility(form){
    if(!form)return;
    for(const field of catalog[form.dataset.game]?.settings||[]){
      const row=form.querySelector('[data-rule-field="'+field.key+'"]');
      if(row)row.hidden=!!field.visibleWhen&&!Object.entries(field.visibleWhen).every(([key,value])=>choiceValue(form.elements['option-'+key])===String(value));
    }
  }
  function showRoomGameEditor(){
    if(!room||roomService.snapshot(room.id).phase!=='lobby'||room.ownerId!==lobbyParticipantId)return;
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{favorites:[]};
    const available=orderedVisibleGames().filter(g=>(room.transportMode!=='network'||g.max>1)&&V.supports(g.id,'player')&&V.supports(g.id,'table')).sort((a,b)=>Number(preferences.favorites.includes(b.id))-Number(preferences.favorites.includes(a.id)));
    if(!available.length)return toast(globalThis.PlayroomMessages.text("ui.app.631826417487"));
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.3bba8537ff5d"))}<div class="room-choice-list">${available.map((g,i)=>`${i&&preferences.favorites.includes(available[i-1].id)&&!preferences.favorites.includes(g.id)?'<hr class="room-choice-divider">':''}${GameScreen.packRow({id:g.id,version:g.version||'',name:g.name,manifest:catalog[g.id]||g,selectable:true,attrs:`data-room-game="${esc(g.id)}"`})}`).join('')}</div>`);modalBack=renderLobby;
  }
  function updateRoomGame(form){
    try{
      const gameId=typeof form==='string'?form:form.elements.gameId.value,g=meta(gameId);
      if(g){const blocker=roomService.gameChangeBlocker(room.id,{min:g.min,max:g.max,allowed:g.playerCounts});if(blocker)throw Error(blocker);}
      const active=activatePack(gameId);
      if(!g||!active||!V.supports(gameId,'player')||!V.supports(gameId,'table'))throw Error(globalThis.PlayroomMessages.text("ui.app.5d39a9ae84f6"));
      const rules=defaultRules(gameId,g);
      room=roomService.changeGame(room.id,lobbyParticipantId,{game:{id:gameId,name:g.name,version:active.version,...(g.botSettings?{botSettings:g.botSettings}:{}),teamLayouts:catalog[gameId]?.teamLayouts||{}},rules,
        constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
      closeModal(true);renderLobby();
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function updateRoomRules(form){try{const rules=roomRulesFromForm(form);room=roomService.configure(room.id,lobbyParticipantId,{firstPlayerMode:rules.firstPlayerMode,seatOrder:rules.seatOrder});room=roomService.updateRules(room.id,lobbyParticipantId,rules);rememberRules(room.game.id,rules);closeModal(true);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function toggleLobbyReady(){try{const me=room.participants.find(p=>p.id===lobbyParticipantId);room=roomService.setReady(room.id,lobbyParticipantId,!me?.ready);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function becomeLobbySpectator(){try{room=roomService.becomeSpectator(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  async function startLobbyCountdown(){
    try{
      if(room.transportMode==='hotseat')return await startHotSeat();
      room=roomService.beginCountdown(room.id,lobbyParticipantId,{seconds:3});lobbyCountdown=3;renderLobby();clearInterval(lobbyTimer);
      lobbyTimer=setInterval(()=>{const step=roomService.tick(room.id);room=step.room;lobbyCountdown=step.remaining;if(step.started||step.reason){clearInterval(lobbyTimer);lobbyTimer=null;}renderLobby();if(step.reason)toast(step.reason);},250);
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function leaveLobby(){
    if(screen==='table')save();clearInterval(lobbyTimer);lobbyTimer=null;lobbyCountdown=null;
    globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room?.id);
    room=null;lobbyParticipantId=null;cancelBot();closeModal(true);screen='hub';hubTab='games';flashPacksOnHub=true;renderHub();refreshPackUpdates();
  }
  function showPlayerNamePrompt(){
    openModal(`<header class="modal-head"><h2>${globalThis.PlayroomMessages.text("ui.app.773b1abc7b8c")}</h2></header><p class="lead">${globalThis.PlayroomMessages.text("ui.app.5418cf79756a")}</p><form id="profile-form"><div class="profile-identity-row">${globalThis.PlayroomAvatarPicker.button('',profileAvatar)}<label class="field"><span>${globalThis.PlayroomMessages.text("ui.app.f189892b63a9")}</span><input name="playerName" maxlength="24" autocomplete="nickname" placeholder="${globalThis.PlayroomMessages.text("ui.app.fec0b28c091d")}" required></label></div><button class="btn" type="submit" style="width:100%;margin-top:14px">${icon('save')} ${globalThis.PlayroomMessages.text("ui.app.b4d30cae5289")}</button></form>`);
  }
  function savePlayerProfile(form){try{playerProfile=profileStore.save(form.elements.playerName.value,{avatar:profileAvatar});closeModal(true);render();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showRules(gameId=($('#modal-root .room-setup-modal,#room-rules-form')?room?.game?.id:session?.game)) {
    const returnBack=modalBack,fromRoom=!!room&&(!!$('#modal-root .room-setup-modal,#room-rules-form')||modalBack===renderLobby);
    if(!gameId)return showHelp();const g=meta(gameId),manifest=catalog[gameId];
    const chosenRules=fromRoom&&room?.game?.id===gameId?room.rules:session?.game===gameId?
      (session.options.lobbyConfig?.rules||{preset:session.options.preset,presetLabel:session.options.presetLabel,openHands:session.options.openHands,firstPlayerMode:session.options.firstPlayerMode,seatOrder:session.options.seatOrder,options:Object.fromEntries((manifest?.settings||[]).filter(field=>session.options[field.key]!==undefined).map(field=>[field.key,session.options[field.key]]))}):null;
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.ee9cd4deefad",{p0:String(g.name)}))}${PlayroomLobbyView.gameRulesMarkup(g,manifest?.settings||[],{rules:chosenRules,presetSetting:manifest?.presetSetting,hasHands:!!manifest?.capabilities?.hands,firstPlayer:manifest?.capabilities?.firstPlayer!==false})}<p class="pack-line">${globalThis.PlayroomMessages.text("ui.app.a61be19c4d76")}${esc(g.id)} · ${g.min===g.max?g.min:g.min+'–'+g.max} ${globalThis.PlayroomMessages.text("ui.app.71d648b599c5")}</p><button class="btn" data-command="close-modal" style="width:100%;margin-top:10px">${globalThis.PlayroomMessages.text("ui.app.e2ce86b38fd5")}</button>`);
    if(!modalBack){if(returnBack)modalBack=returnBack;else if(fromRoom)modalBack=renderLobby;}
  }
  function showHelp() {
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.d721c75def08"))}<div class="help-grid">
      <div class="help-item">${icon('people')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.a6d0cdfe334a")}</strong>${globalThis.PlayroomMessages.text("ui.app.d7dba9d443ad")}</p></div>
      <div class="help-item">${icon('hand')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.817e795ac107")}</strong>${globalThis.PlayroomMessages.text("ui.app.eddbc452360d")}</p></div>
      <div class="help-item">${icon('history')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.f6c8472ceb1a")}</strong>${globalThis.PlayroomMessages.text("ui.app.8d87bdfc36e3")}</p></div>
      <div class="help-item">${icon('save')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.2d7e6a75f0ae")}</strong>${globalThis.PlayroomMessages.text("ui.app.64e5f1e7ba99")}</p></div>
      <div class="help-item">${icon('layers')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.9f485e78fa98")}</strong>${globalThis.PlayroomMessages.text("ui.app.9128a0f992ff")}; ${globalThis.PlayroomMessages.text("ui.app.50e140dd89b0")}</p></div></div><button class="btn" data-fixed-footer data-command="close-modal" style="width:100%">${icon('arrow')}${globalThis.PlayroomMessages.text("ui.app.72e2d50dff4c")}</button>`);
  }
  function showSettings(options={}) {
    const parentBack=modalBack,fromSettings=!!$('#modal-root .settings-overview');
    const inGame=options.inGame??(!!document.querySelector('#app .table-shell')&&!$('#modal-root .room-setup-modal'));
    const rulesAttrs=options.sharedRules?'data-shared-rules':options.client?'data-net-action="rules"':'data-command="rules"';
    const settingsRoom=options.room||(room?roomService.snapshot(room.id):null);
    const nickname=settingsRoom?PlayroomLobbyView.nicknameMarkup(settingsRoom,options.participantId||lobbyParticipantId||playerProfile?.id,!!options.client):null;
    const profile=nickname||`<div class="profile-identity-row">${globalThis.PlayroomAvatarPicker.button(playerProfile?.name||'',profileAvatar)}<label class="field"><input aria-label="${esc(globalThis.PlayroomMessages.text("ui.app.f189892b63a9"))}" id="setting-player-name" maxlength="24" autocomplete="nickname" value="${esc(playerProfile?.name||'')}" placeholder="${globalThis.PlayroomMessages.text("ui.app.4098056e6278")}"></label></div>`;
    const quick=GameScreen.quickAccessMarkup({exclude:['full','help',...(inGame?['rules']:[])]});
    const seatingGame=settingsRoom?.game?.id||session?.game;
    const duel=(settingsRoom?settingsRoom.seats.filter(s=>s.participantId).length:Number(document.querySelector('.app-game-layout')?.dataset.playerCount)||session?.current.players.length)===2;
    const stage=document.querySelector('.app-game-layout'),rowOnly=duel||globalThis.PlayroomViews.get(seatingGame)?.seating==='row';
    const seatingValue=rowOnly?'row':settings.seatingByGame[seatingGame]==='row'?'row':'anchors';
    const hasCardHand=!seatingGame||(catalog[seatingGame]?.capabilities?.hands&&catalog[seatingGame]?.category==='cards');
    const invite=settingsRoom?.transportMode!=='hotseat'&&!options.client&&settingsRoom?.ownerId===(lobbyParticipantId||playerProfile?.id)?GameScreen.addPlayerButton():'';
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.985b5e0f2ccf")).replace('</header>','')}<div class="settings-header-actions">${GameScreen.iconButton('data-command="reset-settings"',globalThis.PlayroomMessages.text('ui.app.reset-settings'),'undo')}${GameScreen.iconButton(inGame?rulesAttrs:settingsRoom&&!options.client?'data-command="room-help"':'data-command="help"',globalThis.PlayroomMessages.text("ui.game-screen.7f7b0ffbbfe0"),inGame?'rules':'help')}${GameScreen.iconButton('data-command="fullscreen"',globalThis.PlayroomMessages.text("ui.game-screen.f42c392566b5"),'full')}</div></header><div class="settings-overview"><div class="settings-quick">${quick}${invite}${!inGame&&!quick.includes('data-command="rules"')&&(options.sharedRules||settingsRoom||session&&screen==='table')?`<button class="icon-btn" title="${globalThis.PlayroomMessages.text("ui.app.7f7b0ffbbfe0")}" aria-label="${globalThis.PlayroomMessages.text("ui.app.7f7b0ffbbfe0")}" ${options.sharedRules?'data-shared-rules':options.client?'data-net-action="rules"':session&&screen==='table'?'data-command="rules"':settingsRoom?'data-command="room-rules-view"':'data-command="rules"'}>${icon('rules')}</button>`:''}</div><button type="button" class="icon-btn settings-themes" data-appearance-editor aria-label="${globalThis.PlayroomMessages.text('ui.app.themes-button')}" title="${globalThis.PlayroomMessages.text('ui.app.themes-button')}">${icon('palette')}</button><div class="settings-personal">${profile}</div></div>
      <div class="settings-grid settings-layout-grid">${hasCardHand?GameScreen.rangeSetting({id:'setting-hand-shape',label:globalThis.PlayroomMessages.text('ui.app.hand-shape.label'),max:1,value:settings.handShape==='arc'?1:0,display:globalThis.PlayroomMessages.text('ui.app.hand-shape.'+settings.handShape),choices:['straight','arc'].map(value=>({value,label:globalThis.PlayroomMessages.text('ui.app.hand-shape.'+value)}))}):''}</div>
      <label class="switch"><span>${globalThis.PlayroomMessages.text('ui.app.three-opponents.split')}</span><input type="checkbox" id="setting-three-opponents" ${settings.splitThreeOpponents?'checked':''}></label>
      <label class="switch"><span>${globalThis.PlayroomMessages.text('ui.app.show-last-game')}</span><input type="checkbox" id="setting-last-game" ${settings.showLastGame?'checked':''}></label>
      ${screen==='table'&&isPass()&&gate===null&&!historyOpen?`<label class="switch"><span>${globalThis.PlayroomMessages.text("ui.app.d08b81966d44")}</span><input type="checkbox" id="setting-auto-pass" ${autoPassForViewer()?'checked':''}></label>`:''}
      ${globalThis.PlayroomTutorialSettings.markup(seatingGame)}
      <label class="switch"><span>${globalThis.PlayroomMessages.text("ui.app.b10ca6a74592")}</span><input type="checkbox" id="setting-quick-play" ${settings.quickPlay?'checked':''}></label>
      <div class="settings-grid">${GameScreen.rangeSetting({id:'setting-volume',label:globalThis.PlayroomMessages.text('ui.app.77e13b86fbed'),value:settings.sound?volumeLevels.indexOf(settings.volume):0,display:volumeLabels[settings.sound?volumeLevels.indexOf(settings.volume):0]})}${GameScreen.rangeSetting({id:'setting-speed',label:globalThis.PlayroomMessages.text('ui.app.62af90477d26'),value:speedLevels.indexOf(settings.animationSpeed),display:animationPresets[settings.animationSpeed].label,describedby:''})}</div>
      ${GameScreen.rangeSetting({id:'setting-scale',label:globalThis.PlayroomMessages.text('ui.app.interface-scale'),min:50,max:150,step:10,value:globalThis.PlayroomInterfaceScale.applied,display:globalThis.PlayroomInterfaceScale.applied+'%',bounds:true})}

`);
    if(fromSettings)modalBack=parentBack;
    const settingsBack=modalBack;
    settingsReturn=()=>{showSettings({...options,inGame});modalBack=settingsBack;};
    attachSettingsHelp();globalThis.PlayroomInterfaceScale.sync();
  }
  function attachSettingsHelp(){
    const root=document.querySelector('.modal:has(.settings-overview)');if(!root)return;
    for(const id of ['setting-player-name','setting-hand-shape','setting-three-opponents','setting-seating','setting-last-game','setting-auto-pass','setting-quick-play','setting-volume','setting-speed','setting-scale']){
      const input=root.querySelector('#'+id);if(!input)continue;
      const field=input.closest('.settings-range,.field,.switch'),wrapper=document.createElement('div');
      wrapper.className='setting-with-help';field.before(wrapper);wrapper.append(field);
      const title=field.querySelector('.settings-range-heading > span')||field.querySelector(':scope > span'),label=title.textContent;
      title.outerHTML=settingTitle(label,globalThis.PlayroomMessages.text('ui.app.help.'+id));
      wrapper.querySelector('.rule-help>button')?.setAttribute('aria-label','Справка: '+label);
    }
  }
  function showCardHelp() {
    const cards=[...document.querySelectorAll('.own-hand .hand-card[data-tooltip]')],seen=new Set();
    const entries=cards.filter(card=>{const text=card.dataset.tooltip;if(seen.has(text))return false;seen.add(text);return true;});
    const intro=document.querySelector('template[data-card-help-intro]')?.innerHTML||'';
    const details=entries.map(card=>`<li><strong>${esc(card.getAttribute('aria-label'))}</strong><p>${esc(card.dataset.tooltip)}</p>${card.querySelector('template[data-card-help-art]')?.innerHTML||''}</li>`).join('');
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.b7f6f3448201"))}${intro}<p class="lead">${globalThis.PlayroomMessages.text("ui.app.9751c986689e")}</p><ul class="card-help-list">${details||("<li>"+globalThis.PlayroomMessages.text("ui.app.91e23b5cc854")+"</li>")}</ul>`);
  }
  function showPlayerActions(target) {
    if(isReplay()||paused||gate!==null||!session)return;
    const action=activeActions(session.current).find(a=>a.target===target&&a.targetKind==='player');
    if(!action)return;
    const name=session.current.players[target].name;
    playerTargets?.tap(target);
  }
  function showResult(automatic=false) {
    if(!session||session.current.status!=='finished'||screen!=='table')return;
    const shownViewer=isPass()?-1:viewer,state=E.project(session.current,shownViewer);
    openModal(GameScreen.resultMarkup({state,viewer:shownViewer,gameName:meta(session.game).name,scoreLabel:meta(session.game).scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee")}),'result-modal',{keepAudio:true});
    if(automatic===true)GameScreen.presentResultSound(session,state,shownViewer,(ids,pack)=>globalThis.PlayroomAppBridge.audio.play(ids,pack));
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
  async function stopLocalMatch(confirmed=false){
    if(!session||session.current.status!=='playing'||room?.transportMode!=='hotseat'||room.phase!=='playing')return;
    if(!confirmed){const expectedSession=session,roomId=room.id;return confirmOperation(globalThis.PlayroomMessages.text("ui.app.986b3d9186b8"),{isCurrent:()=>session===expectedSession&&room?.id===roomId,onConfirm:()=>stopLocalMatch(true)});}
    interruptAction();cancelBot();stopReplay();
    if(!await save())return;
    setLocalPaused(true);gate=null;awaitingPass=false;
    room=roomService.returnToLobby(room.id,lobbyParticipantId,{stopped:true});
    screen='hub';closeModal(true);renderHub();renderLobby();
  }
  async function rematch(){
    if(!session||session.current.status!=='finished')return;
    const completed=session;if(historyOrigin){restoreHistoryOrigin();historyOpen=false;replayIndex=null;}
    if(!await save())return;cancelBot();stopReplay();paused=true;
    if(room?.transportMode==='hotseat'&&room.game.id===completed.game&&room.phase==='playing')room=roomService.returnToLobby(room.id,lobbyParticipantId);
    else if(completed.options.lobbyConfig){room=roomService.restoreHotSeatLobby(completed.options.lobbyConfig,{hostId:playerProfile.id});lobbyParticipantId=room.ownerId;}
    else {setup(completed.game);const original=completed;for(let i=0;i<room.seats.length;i++){const player=original.current.players[i],seat=room.seats[i];if(i===0){room=roomService.renameLocalSeat(room.id,lobbyParticipantId,seat.id,player?.name||playerProfile.name);continue;}room=roomService.setLocalSeat(room.id,lobbyParticipantId,seat.id,{kind:player?(player.bot?'bot':'human'):'empty',nickname:player?.name});if(player?.bot)room=roomService.configureBot(room.id,lobbyParticipantId,seat.id,{nickname:player.name,avatar:player.avatar||null,botSettings:player.botSettings});}room=roomService.updateRules(room.id,lobbyParticipantId,{preset:original.options.preset,presetLabel:original.options.presetLabel,openHands:!!original.options.openHands,options:Object.fromEntries((catalog[original.game]?.settings||[]).map(field=>[field.key,original.options[field.key]??field.default]))});}
    closeModal(true);renderLobby();
  }
  function openHistory(from=null) {
    clearViewHints();interruptAction();if(!historyOrigin)historyOrigin=captureHistoryOrigin('live');
    setLocalPaused(true);gate=null;playerTargets?.cancel();feedback.clear();cancelBot();stopReplay();selected=null;historyOpen=true;replayIndex=Math.max(historyStart(),from??session.states.length-1);renderTable();
  }
  function startReplay() {
    const resuming=replayPaused;if(!resuming)stopReplay();else{replayPaused=false;replayTicket++;}const ticket=replayTicket;
    if(!resuming&&replayIndex===session.states.length-1)replayIndex=historyStart();
    const step=async()=>{
      if(ticket!==replayTicket||!isReplay()||screen!=='table')return;
      await globalThis.PlayroomPublicSequence?.whenIdle($('#app'));
      if(ticket!==replayTicket||!isReplay()||screen!=='table')return;
      if(replayIndex>=session.states.length-1){stopReplay(false);renderTable();return;}
      const nextIndex=globalThis.PlayroomHistoryController.readyBatchEnd(session.states,replayIndex+1,s=>E.decisionWindow?.(s));
      const before=currentState(),after=session.states[nextIndex],events=E.project(after,viewer).events.filter(e=>e.id>(before.events.at(-1)?.id||0));
      const action=events.findLast(e=>e.presentation)?.presentation||{type:events.some(e=>e.kind==='roll')?'roll':'replay'},timing=pace(),snapshot=flow.capture({actor:before.turn,action,viewer,sceneModel:E.project(before,viewer).scene,deferDepartures:true});
      const beforeProjection=E.project(before,viewer),afterProjection=E.project(after,viewer);feedback.start(beforeProjection.events);feedback.accept(afterProjection.events,E.soundCues(after,viewer,before.events.at(-1)?.id||0),session.game,{initialScene:beforeProjection.scene,finalScene:afterProjection.scene,mode:timing.mode,snapshot,motion:(context,step)=>flow.play(step?.snapshot||snapshot,{draws:step?.draws??cardTransfers(before,after),transferOnly:step?.transferOnly,context}),defer:true});
      replayIndex=nextIndex;renderTable();Motion.prepare(snapshot,cardTransfers(before,after));await flow.present(()=>{feedback.next();return feedback.whenIdle();});
      await globalThis.PlayroomPublicSequence?.whenIdle($('#app'));
      if(ticket===replayTicket)replayTimer=setTimeout(step,timing.settle+timing.botDelay);
    };
    replayTimer=setTimeout(step,pace().botDelay);renderTable();
  }
  async function fullscreen() {
    try {
      if(document.fullscreenElement)await document.exitFullscreen();
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();
      else {const enabled=document.documentElement.classList.toggle('fullscreen-fallback');toast(enabled?globalThis.PlayroomMessages.text("ui.app.2bce29e3ceaa"):globalThis.PlayroomMessages.text("ui.app.a225326b7ef6"));}
    }catch(_){toast(globalThis.PlayroomMessages.text("ui.app.a2c8210f6267"));}
  }
  const commands={
    'dismiss-notice':dismissNotice,
    'dismiss-recovery'(){loadWarning='';renderHub();},
    rematch,
    home(){leaveTable('games');},
    sessions(){leaveTable('sessions');},
    resume(){resumeSession();},
    'hide-local-session'(){settings.hiddenLocalSession=sessionId;settingsStore.write(settings);renderHub();},
    'show-updates'(){showUpdates(true);},
    'update-packs'(){closeModal(true);commands.packs();},
    async 'update-app'(){
      const button=$('[data-command="update-app"]'),status=$('[data-update-status]');if(!button)return;button.disabled=true;
      status.textContent=globalThis.PlayroomMessages.text('ui.app.ca2c48f1d3e1');
      try{await globalThis.PlayroomPWA.activateUpdate();status.textContent=globalThis.PlayroomMessages.text('ui.app.40c739dffde5');}
      catch(error){status.textContent=globalThis.PlayroomMessages.error(error);button.disabled=false;}
    },
    packs(){rememberPackUpdates('read');rememberPackUpdates('dismissed');packUI?.open();if(screen==='hub')renderHub();},
    'dismiss-pack-updates'(){rememberPackUpdates('dismissed');renderHub();},
    help:showHelp,settings:showSettings,'reset-rules':async()=>{
      if(!await GameScreen.confirmDialog(globalThis.PlayroomMessages.text('ui.app.confirm-reset-rules')))return;
      const form=$('#room-rules-form');if(!form)return;const game=form.dataset.game,g=meta(game),fields=catalog[game]?.settings||[];
      const values={firstPlayerMode:'rules',seatOrder:'normal',preset:g.presets?.[0]?.id||'default',openHands:false,...Object.fromEntries(fields.map(f=>['option-'+f.key,f.default??f.options?.[0]?.value]))};
      for(const input of form.elements){if(!(input.name in values))continue;const value=values[input.name];if(input.type==='radio')input.checked=input.value===value;else if(input.type==='checkbox')input.checked=!!value;else if(input.dataset.choiceOptions){input.value=Math.max(0,JSON.parse(input.dataset.choiceOptions).findIndex(o=>o.value===value));syncChoice(input);}else input.value=value;}
      syncRuleVisibility(form);
    },'reset-settings':async()=>{if(!await GameScreen.confirmDialog(globalThis.PlayroomMessages.text('ui.app.confirm-reset-settings')))return;settings=globalThis.PlayroomPlayerSettings.defaults();settingsStore.write(settings);audio.setEnabled(settings.sound);audio.setVolume(settings.volume);globalThis.PlayroomInterfaceScale.set(settings.interfaceScale);document.body.classList.remove('reduced-motion');window.dispatchEvent(new Event('playroom:game-options'));if(screen==='table'&&!document.querySelector('.network-game'))renderTable();else if(screen==='hub')renderHub();showSettings();},'card-help':showCardHelp,fullscreen,rules:()=>showRules(),
    'room-rules':showRoomRulesEditor,'room-change-game':showRoomGameEditor,
    'lobby-ready':toggleLobbyReady,
    'lobby-spectator':becomeLobbySpectator,
    'lobby-table':()=>{try{room=roomService.claimTable(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}},
    'stop-local-match':stopLocalMatch,
    'lobby-start':startLobbyCountdown,
    'lobby-leave':async()=>{const expected=room;if(room?.transportMode==='network'&&!await GameScreen.confirmDialog(globalThis.PlayroomMessages.text("ui.app.15bd355dbb93")))return;if(room===expected)leaveLobby();},
    'close-modal':()=>closeModal(),
    async 'confirm-operation'(){const todo=pendingConfirmation;closeModal(true);if(todo?.isCurrent())try{await todo.onConfirm();}catch(error){toast(globalThis.PlayroomMessages.error(error));}},
    'confirm-action'(){const todo=pendingAction;closeModal();if(todo&&todo.session===session&&todo.state===session.current&&screen==='table'&&todo.actor===viewer)act(todo.actor,todo.action,{...todo.context,confirmed:true});},
    'room-rules-view':showRoomRules,
    'room-help':showRoomHelp,

    'pass-device':transferDevice,
    unlock(){viewer=gate;gate=null;awaitingPass=false;render();},
    history(){if(historyOpen)commands['history-close']();else openHistory();},
    'history-close':closeHistory,
    'replay-round-prev'(){stopReplay();replayIndex=globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,E.project(session.current,-1).scene?.round?.starts,-1,historyStart());render();},
    'replay-round-next'(){stopReplay();replayIndex=globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,E.project(session.current,-1).scene?.round?.starts,1,historyStart());render();},
    'replay-prev'(){scrubHistory(globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,historyStarts(),-1,historyStart()));},
    'replay-next'(){const before=currentState();scrubHistory(globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,historyStarts(),1,historyStart()));playSounds(before,currentState());},
    'replay-play'(){if(replayTimer){if(globalThis.PlayroomPublicSequence?.playing($('#app'))){clearTimeout(replayTimer);replayTimer=null;replayTicket++;replayPaused=true;globalThis.PlayroomPublicSequence.setMode($('#app'),'pause');stopSounds();}else stopReplay();return render();}startReplay();},
    room:renderLobby,'room-hotseat-confirm'(){modalBack=null;setRoomOption('transportMode','hotseat',true);},
    pause(){interruptAction();stopSounds();setLocalPaused(!paused);cancelBot();render();},result:showResult,
    'result-replay'(){closeModal();openHistory(0);commands['replay-play']();}
  };
  input=globalThis.TabletopInput.attach({
    canStart(source){return screen==='table'&&!!session&&!source.disabled&&!$('#modal-root').children.length&&activeActions(session.current).length>0;},
    canSelect(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&!transition&&(viewer===session.current.turn||source.hasAttribute('data-hand-preview'));},
    canCommit(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&(!transition||activeActions(session.current).some(action=>Protocol.canonical(action)===Protocol.canonical(JSON.parse(source?.dataset.action||'null'))));},
    getSelected(){return selected;},
    select(piece,context){clearViewHints();if(context?.viewKey&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(context.viewKey))viewState[context.viewKey]=piece;else selected=piece;renderTable();},
    commit(action,context){act(viewer,action,context);}
  });
  playerTargets=new globalThis.PlayroomPlayerTarget({
    actions:()=>screen==='table'&&session&&!isReplay()&&!paused&&gate===null?activeActions(session.current):[],
    selected:()=>selected,commit:action=>act(viewer,action),root:()=>document.querySelector('#app .table-shell')
  });
  let hubDragged=null,hubTouch=null,hubDropSuppress=0;
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest?.('.hub-edit-section .game-tile[data-game]');
    if(!hubEditing||!card||event.target.closest('button'))return;
    hubDragged=card.dataset.game;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',hubDragged);
  });
  document.addEventListener('dragover',event=>{if(hubDragged&&event.target.closest?.('[data-edit-drop]'))event.preventDefault();});
  document.addEventListener('drop',event=>{if(!hubDragged)return;event.preventDefault();const id=hubDragged;hubDragged=null;hubDropAt(id,event.target,event);});
  document.addEventListener('dragend',()=>{hubDragged=null;});
  document.addEventListener('pointerdown',event=>{
    const card=event.pointerType==='touch'&&hubEditing?event.target.closest('.hub-edit-section .game-tile[data-game]'):null;
    if(!card||event.target.closest('button,input,a,select'))return;
    const hold={id:card.dataset.game,x:event.clientX,y:event.clientY,active:false,timer:null};
    hold.timer=setTimeout(()=>{hold.active=true;card.classList.add('is-dragging');},420);hubTouch=hold;
  });
  document.addEventListener('touchmove',event=>{if(hubTouch?.active)event.preventDefault();},{passive:false});
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
    hubDropAt(hold.id,document.elementFromPoint(event.clientX,event.clientY),event);
  }
  document.addEventListener('pointerup',finishHubTouch);
  document.addEventListener('pointercancel',finishHubTouch);
  document.addEventListener('click',event=>{
    if(Date.now()<hubDropSuppress&&event.target.closest('.hub-edit-section')){event.preventDefault();return;}
    const restartGuides=event.target.closest('[data-restart-guides]');if(restartGuides){void globalThis.PlayroomTutorialSettings.restart(restartGuides.dataset.restartGuides);return;}
    const allBots=event.target.closest('[data-bots-difficulty]');if(allBots){try{room=roomService.setBotsDifficulty(room.id,lobbyParticipantId,allBots.dataset.botsDifficulty);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    const botSettingsButton=event.target.closest('[data-bot-settings]');if(botSettingsButton){showBotSettings(JSON.parse(botSettingsButton.dataset.botSettings));return;}
    const decisionPlayer=event.target.closest('[data-decision-player]');if(decisionPlayer&&!event.target.closest('.network-game')&&isPass()&&session&&!transition&&!paused){const actor=Number(decisionPlayer.dataset.decisionPlayer);if(!session.current.players[actor]?.bot&&E.decisionWindow(session.current)?.participants.includes(actor)){gate=actor;awaitingPass=false;renderTable();}return;}
    if(event.target.closest('[data-avatar-picker]')){
      const clientAvatar=event.target.closest('[data-avatar-picker]').hasAttribute('data-avatar-client');
      const input=document.querySelector('#profile-form [name=playerName],#setting-player-name,.lobby-profile [name=nickname]');
      const name=input?.value||playerProfile?.name||'';
      globalThis.PlayroomAvatarPicker.open({name,selected:profileAvatar,onSelect:avatar=>{
        try{if(playerProfile?.name)playerProfile=profileStore.save(playerProfile.name,{avatar});}catch(error){toast(globalThis.PlayroomMessages.error(error));return;}
        profileAvatar=avatar;
        if(!clientAvatar&&room&&lobbyParticipantId){room=roomService.setAvatar(room.id,lobbyParticipantId,avatar);}else if(clientAvatar||document.querySelector('.network-game'))void globalThis.PlayroomNetworkLibrary?.setAvatar?.(avatar);
        for(const button of document.querySelectorAll('[data-avatar-picker]'))button.innerHTML=TabletopUI.avatar({name,avatar},0);
      }});return;
    }
    if(event.target.closest('.network-game,.shared-modal-backdrop'))return;
    const replacement=event.target.closest('[data-player-replacement]');if(replacement){event.preventDefault();openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.261faa27d0a0"))}<p>${esc(replacement.getAttribute('title')||replacement.dataset.tooltip)}</p>`);return;}
    const preference=event.target.closest('[data-view-preference]');if(preference&&screen==='table'){if(!screenController.setPreference(preference.dataset.viewPreference,preference.dataset.viewValue))TabletopUI.viewPreferences(session.game,viewer,preference.dataset.viewPreference,preference.dataset.viewValue);for(const key of Object.keys(viewState))delete viewState[key];screenController.viewState=viewState;renderTable();return;}
    const viewControl=event.target.closest('[data-view-key]');
    if(viewControl&&!viewControl.disabled&&screen==='table'){const {viewKey,viewValue}=viewControl.dataset;if(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(viewKey)&&viewValue.length<=80){viewState[viewKey]=viewValue;renderTable(false,false,viewControl.dataset.viewLayout==='stable');}return;}
    if(event.target.closest('.player-target-menu'))return;
    const person=event.target.closest('[data-player-target],[data-player-panel-target]');
    if(person){showPlayerActions(Number(person.dataset.playerTarget??person.dataset.playerPanelTarget));return;}
    const button=event.target.closest('button,[data-action],[data-select],[data-cell],[data-drop-select]');
    if(!button){const tile=event.target.closest('.game-tile:not(.is-editing)[data-game]');if(tile&&!hubEditing)setup(tile.dataset.game);return;}
    if(button.disabled)return;
    if(button.dataset.roomGame){updateRoomGame(button.dataset.roomGame);return;}
    if(button.dataset.roomCycle){try{cycleRoomSeat(button.dataset.roomCycle);}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    if(button.dataset.roomBot){try{room=roomService.setLocalSeat(room.id,lobbyParticipantId,button.dataset.roomBot,{kind:'bot',nickname:button.dataset.botName});renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    if(button.dataset.savedFilter){savedFilter=button.dataset.savedFilter;updateSavedPanel();return;}
    if(button.hasAttribute('data-clear-games-confirm')){void clearGames();return;}
    if(button.hasAttribute('data-clear-games')){void askClearGames();return;}
    if(button.dataset.historyId){resumeSession(button.dataset.historyId,{history:true});return;}
    if(button.dataset.resumeId){resumeSession(button.dataset.resumeId);return;}
    if(button.dataset.deleteNetworkConfirm){void deleteNetworkSession(button.dataset.deleteNetworkConfirm);return;}
    if(button.dataset.deleteNetwork){askDeleteNetwork(button.dataset.deleteId);return;}
    if(button.dataset.deleteId){try{askDelete(button.dataset.deleteId);}catch(_){toast(globalThis.PlayroomMessages.text("ui.app.6b8c3ec1a675"));}return;}
    if(button.dataset.deleteConfirm){deleteSession(button.dataset.deleteConfirm);return;}
    if(button.dataset.lobbySeat){claimLobbySeat(button.dataset.lobbySeat);return;}
    if(button.dataset.kickParticipant){kickLobbyParticipant(button.dataset.kickParticipant);return;}
    if(button.hasAttribute('data-edit-toggle')){hubEditing=!hubEditing;filter='all';renderHub();return;}
    if(button.dataset.editStep){editHubStep(button.dataset.editId,Number(button.dataset.editStep));return;}
    if(button.dataset.command){if(button.hasAttribute('data-quick-shortcut')&&button.dataset.command!=='fullscreen')closeModal(true);commands[button.dataset.command]?.();return;}
    if(button.dataset.favorite){try{globalThis.PlayroomPackManager.toggleFavorite(button.dataset.favorite);renderHub();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    if(button.dataset.recentStart){setup(button.dataset.recentStart);return;}
    if(button.dataset.start){setup(button.dataset.start);return;}
    if(button.dataset.rules){showRules(button.dataset.rules);return;}
    if(button.hasAttribute('data-hub-filters-toggle')){
      hubFiltersOpen=!hubFiltersOpen;
      button.setAttribute('aria-expanded',String(hubFiltersOpen));button.classList.toggle('active',hubFiltersOpen);
      document.querySelectorAll('[data-hub-filter-panel]').forEach(panel=>{panel.hidden=!hubFiltersOpen;});return;
    }
    if(button.dataset.tag){const kind=button.dataset.tagKind;hubFilters[kind]=hubFilters[kind]===button.dataset.tag?'':button.dataset.tag;renderHub();return;}
    if(button.dataset.format){hubFilters.format=hubFilters.format===button.dataset.format?'':button.dataset.format;renderHub();return;}
    if(button.dataset.filter){filter=button.dataset.filter;renderHub();return;}
    if(button.hasAttribute('data-action')&&button.hasAttribute('data-close-on-action'))closeModal(true);
    input.handleClick(event);
  });
  document.addEventListener('submit',event=>{
    if(event.target.id==='room-human-form'){event.preventDefault();try{room=event.target.dataset.rename?roomService.renameLocalSeat(room.id,lobbyParticipantId,event.target.dataset.seat,event.target.elements.nickname.value):roomService.setLocalSeat(room.id,lobbyParticipantId,event.target.dataset.seat,{kind:'human',nickname:event.target.elements.nickname.value});renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
    else if(event.target.id==='profile-form'){event.preventDefault();savePlayerProfile(event.target);}
    else if(event.target.id==='lobby-nickname-form'){event.preventDefault();updateLobbyNickname(event.target);}
    else if(event.target.id==='room-rules-form'){event.preventDefault();updateRoomRules(event.target);}
    else if(event.target.id==='room-game-form'){event.preventDefault();updateRoomGame(event.target);}
  });
  document.addEventListener('input',event=>{if(event.target.matches('#profile-form [name=playerName],#setting-player-name,.lobby-profile [name=nickname]'))for(const button of document.querySelectorAll('[data-avatar-picker]'))button.innerHTML=TabletopUI.avatar({name:event.target.value,avatar:profileAvatar},0);});
  document.addEventListener('change',event=>{
    if(event.target.id==='setting-learning-enabled'){globalThis.PlayroomFirstTurnGuide.setEnabled(event.target.dataset.game,event.target.checked);return;}
    const input=event.target;if(input.dataset.viewRange&&!input.disabled&&!input.closest('.network-game')&&screen==='table'){const choices=JSON.parse(input.dataset.choiceOptions),choice=choices[Number(input.value)];if(choice&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(input.dataset.viewRange)){viewState[input.dataset.viewRange]=String(choice.value);renderTable();}return;}
    if(event.target.id==='history-viewer'&&historyOrigin?.kind==='library'){stopReplay();viewer=Number(event.target.value);renderTable();return;}
    if(event.target.closest('#room-rules-form')){syncChoice(event.target);syncRuleVisibility(event.target.form);return;}
    try{if(event.target.hasAttribute('data-room-title')){setRoomOption('name',event.target.value);return;}if(event.target.dataset.roomOption){setRoomOption(event.target.dataset.roomOption,event.target.type==='checkbox'?(event.target.checked?'network':'hotseat'):event.target.value);return;}}catch(error){toast(globalThis.PlayroomMessages.error(error));renderLobby();return;}
    if(event.target.id==='setting-player-name'){try{playerProfile=profileStore.save(event.target.value);}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
    if(['setting-scale','setting-speed','setting-auto-pass','setting-quick-play','setting-volume','setting-seating','setting-hand-shape','setting-three-opponents','setting-last-game'].includes(event.target.id)){
      if(event.target.id==='setting-volume'){const index=Number(event.target.value);settings.sound=index>0;if(index>0)settings.volume=volumeLevels[index];soundTicket++;audio.setEnabled(settings.sound);audio.setVolume(settings.volume);document.querySelectorAll('[data-sound-control]').forEach(el=>el.disabled=!settings.sound);}
      else if(event.target.id==='setting-scale'){settings.interfaceScale=Math.min(Number(event.target.value),globalThis.PlayroomInterfaceScale.limit);GameScreen.allowLayoutChange(document.querySelector('#app'),{allowLayoutChange:true});globalThis.PlayroomInterfaceScale.set(settings.interfaceScale);}
      else if(event.target.id==='setting-auto-pass'&&isPass()){const preference=hotseatPreference();if(preference?.primary)settings.autoPass=event.target.checked;else if(preference)settings.hotseatAutoPass={...settings.hotseatAutoPass,[preference.key]:event.target.checked};}
      else if(event.target.id==='setting-quick-play')settings.quickPlay=event.target.checked;
      else if(event.target.id==='setting-seating'){const game=event.target.dataset.game;if(game&&['circle','anchors','row'].includes(choiceValue(event.target)))settings.seatingByGame[game]=choiceValue(event.target);}
      else if(event.target.id==='setting-hand-shape')settings.handShape=choiceValue(event.target)==='arc'?'arc':'straight';
      else if(event.target.id==='setting-three-opponents'){settings.splitThreeOpponents=event.target.checked;GameScreen.allowLayoutChange(document.querySelector('#app'),{allowLayoutChange:true});}
      else if(event.target.id==='setting-last-game')settings.showLastGame=event.target.checked;
      else {settings.animationSpeed=speedLevels[Number(event.target.value)]||'normal';}
      document.body.classList.toggle('reduced-motion',pace().duration===0);
      settingsStore.write(settings);
      window.dispatchEvent(new Event('playroom:game-options'));
      if(event.target.id==='setting-last-game'&&screen==='hub')renderHub();
      if(['setting-seating','setting-hand-shape','setting-three-opponents','setting-auto-pass'].includes(event.target.id)&&screen==='table'&&!document.querySelector('.network-game'))renderTable();
      if(event.target.id==='setting-volume')void previewSound();
    }
  });
  document.addEventListener('input',event=>{
    const input=event.target;if(input.dataset.choiceOptions){syncChoice(input);if(input.closest('#room-rules-form'))syncRuleVisibility(input.form);return;}if(!['setting-scale','setting-volume','setting-speed'].includes(input.id))return;
    if(input.id==='setting-scale')input.value=String(Math.min(Number(input.value),globalThis.PlayroomInterfaceScale.limit));
    const value=Number(input.value),display=input.id==='setting-scale'?value+'%':input.id==='setting-volume'?volumeLabels[value]:animationPresets[speedLevels[value]].label;
    input.setAttribute('aria-valuetext',display);document.getElementById(input.id+'-value').textContent=display;
    input.closest('.settings-range').style.setProperty('--range-progress',((value-Number(input.min))/(Number(input.max)-Number(input.min))*100)+'%');
  });
  document.addEventListener('input',event=>{
    // The shared network/archive viewer also uses #replay-range. Never let an
    // unrelated local Session (possibly a DIFFERENT game) render into it.
    if(screen==='table'&&event.target.id==='replay-range'&&
        event.target.closest('.table-shell:not(.network-game)'))scrubHistory(Number(event.target.value));
  });
  // Keep one history boundary while a menu or game is active.
  const atExitScreen=()=>screen==='hub'&&hubTab==='games'&&!historyOpen&&!document.querySelector('dialog[open],#modal-root>*,.network-game');
  let allowBrowserExit=false;
  let backBoundary=!!history.state?.playroomBackBoundary;
  let restoringBackBoundary=false;
  let releasingBackBoundary=false;
  const armBack=()=>{
    if(allowBrowserExit||restoringBackBoundary||releasingBackBoundary)return;
    if(atExitScreen()){
      // The home screen leaves Back to the browser/OS, including standalone.
      // Remove our menu guard on arrival, not on the next user Back press.
      if(backBoundary){releasingBackBoundary=true;backBoundary=false;history.back();}
      return;
    }
    if(!backBoundary){
      history.pushState({...history.state,playroomBackBoundary:true},'');
      backBoundary=true;
    }
  };
  new MutationObserver(armBack).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  armBack();
  window.addEventListener('pageshow',()=>{allowBrowserExit=false;backBoundary=!!history.state?.playroomBackBoundary;armBack();});
  document.addEventListener('pointerdown',armBack,{capture:true});
  document.addEventListener('keydown',armBack,{capture:true});
  window.addEventListener('popstate',async()=>{
    if(releasingBackBoundary){
      releasingBackBoundary=false;backBoundary=!!history.state?.playroomBackBoundary;armBack();return;
    }
    if(allowBrowserExit)return;
    if(!history.state?.playroomBackBoundary){
      if(atExitScreen()){
        allowBrowserExit=true;backBoundary=false;save();history.back();return;
      }
      // Reuse the activated entry. Pushing a new one here lets Chrome skip
      // subsequent entries created without another user gesture.
      restoringBackBoundary=true;
      backBoundary=true;
      history.forward();
      return;
    }
    backBoundary=true;
    if(!restoringBackBoundary)return;
    restoringBackBoundary=false;
    const dialogs=[...document.querySelectorAll('dialog[open]')],top=dialogs.at(-1);
    if(top){const event=new Event('cancel',{cancelable:true});if(top.dispatchEvent(event))top.close();return;}
    if($('#modal-root').children.length){closeModal();return;}
    if(screen==='lobby'){commands['lobby-leave']();return;}
    if(historyOpen){commands['history-close']();return;}
    if(screen==='table'||document.querySelector('.network-game')){
      if(await GameScreen.confirmDialog(globalThis.PlayroomMessages.text('ui.app.confirm-leave-table'))){
        const back=document.querySelector('.table-header [data-command="home"],.table-header [data-net-action]');
        if(back)back.click();else leaveTable('games');
      }
      return;
    }
    if(hubTab!=='games'){hubTab='games';renderHub();return;}
    armBack();
  });
  document.addEventListener('keydown',event=>{
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-player-replacement]')){event.preventDefault();event.target.click();return;}
    if((event.key==='Enter'||event.key===' ')&&event.target.matches('[data-player-target]')){event.preventDefault();showPlayerActions(Number(event.target.dataset.playerTarget));return;}
    if(event.key==='Escape'){
      const popover=document.querySelector('[popover]:popover-open');
      if(popover){event.preventDefault();popover.hidePopover();return;}
      if($('#modal-root').children.length)closeModal();else if(historyOpen)commands['history-close']();else if(screen==='table'&&viewState.hint){clearViewHints();renderTable();}
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
    try{sessionStorage.setItem('playroom.navigation.v1',JSON.stringify({screen,sessionId:screen==='table'?sessionId:null,viewState:screen==='table'?Object.fromEntries(Object.entries(viewState).filter(([key])=>key!=='hint')):{},scroll:screen==='table'?{top:$('#app [data-scene-scroll]')?.scrollTop||0,left:$('#app [data-scene-scroll]')?.scrollLeft||0}:null}));}catch(_){}
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
    if(!playerProfile?.id||recovered.ownerId!==playerProfile.id)throw Error(globalThis.PlayroomMessages.text("ui.app.8630b139d1a0"));
    if(room&&room.id!==roomId)throw Error(globalThis.PlayroomMessages.text("ui.app.d9c4d77947b6"));
    room=recovered;lobbyParticipantId=playerProfile.id;screen='lobby';lobbyCountdown=null;
  }
  function returnHostedRoomToLobby(roomId){
    if(room?.id!==roomId)throw Error(globalThis.PlayroomMessages.text("ui.app.e48ad673e8fd"));
    room=roomService.snapshot(roomId);lobbyCountdown=null;screen='lobby';
    closeModal(true);renderLobby();
  }
  function rollbackHostedRoom(roomId){
    if(room?.id!==roomId)return;
    room=null;lobbyParticipantId=null;lobbyCountdown=null;screen='hub';
    renderHub();
  }
  function showSessions(){screen='hub';hubTab='sessions';closeModal(true);renderHub();}
  const publicRooms=Object.freeze(Object.fromEntries(Object.getOwnPropertyNames(Object.getPrototypeOf(Multiplayer.RoomService.prototype)).filter(name=>name!=='constructor'&&!name.startsWith('_')&&!['exportRecovery','restoreRecovery','setDurableResume'].includes(name)&&typeof roomService[name]==='function').map(name=>[name,roomService[name].bind(roomService)])));
  globalThis.PlayroomNetworkLibrary?.configureHostPorts({rooms:roomService});
  globalThis.PlayroomAppBridge=Object.freeze({showSessions,showHub:()=>leaveTable('games'),parkLocalSession:()=>{if(room?.transportMode==='hotseat')leaveLobby();else if(screen==='table')leaveTable('games');},returnHostedRoomToLobby,restoreHostedRoom,rollbackHostedRoom,gameOptions:(gameId=session?.game)=>({handShape:settings.handShape,splitThreeOpponents:settings.splitThreeOpponents,animationSpeed:settings.animationSpeed,quickPlay:settings.quickPlay,seating:'auto'}),audio:Object.freeze({
    registerPack:(id,sounds)=>audio.registerPack(id,sounds),
    get busy(){return audioPending||audio.busy;},
    play:(ids,pack)=>{if(!settings.sound||document.hidden||!ids.length)return;
      const ordered=ids.slice(),request=++audioRequest;audioPending=true;
      void audio.unlock().then(async ok=>{if(request!==audioRequest)return;if(ok&&settings.sound&&!document.hidden)await audio.sequence(ordered,{pack});if(request===audioRequest)audioPending=false;});},
    batch:(ids,pack,context)=>{if(settings.sound&&!document.hidden)return audio.batch(ids,{pack,signal:context?.signal});},
    stop:()=>{audioRequest++;audioPending=false;audio.stop();}
  }),profile:()=>playerProfile,room:()=>room,participantId:()=>lobbyParticipantId,roomService:publicRooms,packs,catalog,meta,toast,leaveLobby,renderLobby,openModal,closeModal,confirmOperation,modalHead,showSettings,rememberGame});
  window.addEventListener('resize',()=>GameScreen.fitGameTitles(document));
  let navigation=null;try{navigation=JSON.parse(sessionStorage.getItem('playroom.navigation.v1')||'null');}catch(_){}
  if(navigation?.screen==='table'&&session&&navigation.sessionId===sessionId){
    resumeSession(sessionId);
    if(navigation.viewState&&typeof navigation.viewState==='object'){viewState=navigation.viewState;delete viewState.hint;screenController.viewState=viewState;}
    if(navigation.scroll){const board=$('#app [data-scene-scroll]');if(board){board.scrollTop=Number(navigation.scroll.top)||0;board.scrollLeft=Number(navigation.scroll.left)||0;}}
  }else render();
  if(globalThis.PlayroomRemotePacks){
    void globalThis.PlayroomRemotePacks.load().then(async catalog=>{
      if(!catalog)return;
      if(!packs.list().length)for(const item of catalog.packs){
        try{await globalThis.PlayroomRemotePacks.install(item.id,{activate:true});}
        catch(error){loadWarning=globalThis.PlayroomMessages.text("ui.app.f59d35944a49",{p0:String(item.id),p1:String(globalThis.PlayroomMessages.error(error))});}
      }
      if(screen==='hub')renderHub();
    });
  }
  if(!globalThis.PlayroomUpgradeUI?.show()&&!playerProfile?.name)setTimeout(showPlayerNamePrompt,0);
})();
