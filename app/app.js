if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function () {
  'use strict';
  const E = globalThis.TabletopCore || globalThis.PlayroomEngine;
  const V = globalThis.PlayroomViews;
  const Session = globalThis.TabletopSession;
  const Motion = globalThis.PlayroomMotion, Flow = globalThis.PlayroomGameFlow;
  const HandOverflow=globalThis.PlayroomHandOverflow;
  const Authority=globalThis.SessionAuthority, Protocol=globalThis.PlayroomProtocol;
  const Multiplayer=globalThis.PlayroomMultiplayer;
  const profileStore=new Multiplayer.ProfileStore(()=>localStorage),roomService=new Multiplayer.RoomService({validateStart:state=>{
    try{
      const seats=state.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index);
      const players=seats.map(seat=>{const p=state.participants.find(p=>p.id===seat.participantId);return {name:p.nickname,bot:!!p.bot,...(p.avatar?{avatar:p.avatar}:{})};});
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
  const library = new globalThis.PlayroomLibrary(() => localStorage, E, Session, packs);
  try { globalThis.PlayroomPackManager?.reconcile?.(packs,library); }
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
  const catalog = globalThis.PlayroomCatalog || {};
  const animationPresets=Flow.presets;
  let settings = {sound:true, volume:1, animationSpeed:'normal', interfaceScale:100, handShape:'arc', quickPlay:true,autoPass:true,seating:'circle',seatingByGame:{},showLastGame:false};
  let viewState = {};
  let session = null, screen = 'hub', filter = 'all', selected = null, gate = null, viewer = 0;
  let sessionId = null, hubTab = 'games', savedFilter='all', networkSaved=[], networkSavedState='idle', networkSavedTicket=0;
  let hubEditing=false;
  let room=null,lobbyParticipantId=null,lobbyTimer=null,lobbyCountdown=null;
  let historyOpen = false, replayIndex = null, replayTimer = null, botTimer = null, autoPassTimer = null;
  let paused = false, lastResult = null, storageOK = true, modalReturn = null, pendingAction = null;
  let missedFrom = null, soundTicket = 0;
  let loadWarning = '', modalBack = null, historyOrigin = null, reactionShownAt = null;
  let input = null, packUI = null, playerTargets = null, feedbackSession = null;
  const feedback=new globalThis.PlayroomGameFeedback({mount:()=>document.querySelector('#app .table-shell'),play:(ids,pack)=>{if(settings.sound&&!document.hidden)void audio.sequence(ids,{pack});}});
  let transition = null, replayTicket = 0, awaitingPass = false;
  const localPort={get snapshot(){return session?localFrame(session.current,gate!==null?-1:viewer):null;},
    history:index=>localFrame(session.states[index],viewer,[]),
    send(action,{actor=viewer}={}){const client=localClient(actor);return client.dispatch(Protocol.command(client.snapshot(),action,'local-'+(++commandSequence)));}};
  const screenController=new globalThis.PlayroomGameScreenController({client:localPort,report:error=>toast(globalThis.PlayroomMessages.error(error))});
  function localFrame(state,shownViewer,actions=[]){return {kind:'snapshot',protocolVersion:2,sessionId:sessionId||String(session.createdAt),authorityEpoch:'local:'+session.createdAt,
    game:session.game,packVersion:session.packVersion,viewer:shownViewer,revision:state.move,historyLength:session.states.length,state:E.project(state,shownViewer),actions,paused};}

  try {
    const stored=JSON.parse(localStorage.getItem('playroom.settings.v1')||'{}');
    settings.interfaceScale=globalThis.PlayroomInterfaceScale.normalize(stored?.interfaceScale);
    if(['straight','arc'].includes(stored?.handShape))settings.handShape=stored.handShape;
    if(typeof stored?.sound==='boolean')settings.sound=stored.sound;
    if([.3,.6,1].includes(stored?.volume))settings.volume=stored.volume;
    if(typeof stored?.quickPlay==='boolean')settings.quickPlay=stored.quickPlay;
    if(typeof stored?.autoPass==='boolean')settings.autoPass=stored.autoPass;
    if(typeof stored?.hiddenLocalSession==='string')settings.hiddenLocalSession=stored.hiddenLocalSession;
    if(typeof stored?.showLastGame==='boolean')settings.showLastGame=stored.showLastGame;
    if(stored?.seatingByGame&&typeof stored.seatingByGame==='object'&&!Array.isArray(stored.seatingByGame))settings.seatingByGame=Object.fromEntries(Object.entries(stored.seatingByGame).filter(([id,value])=>Object.hasOwn(catalog,id)&&['circle','anchors','row'].includes(value)));
    else if(stored?.seating==='row')settings.seatingByGame=Object.fromEntries(Object.keys(catalog).map(id=>[id,'row']));
    settings.animationSpeed=Flow.speed(stored?.animationSpeed!==undefined?stored.animationSpeed:stored?.motion===false?'instant':'normal');
  } catch (_) {}
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
  const flow=new Flow.GameFlow({options:()=>settings,motion:Motion,presentation:()=>({minimumVisibleMs:Flow.viewingTime(catalog[session?.game]?.capabilities,session?.current)}),reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
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
    clearTimeout(noticeTimer);noticeTimer=setTimeout(dismissNotice,6000);
    noticeElement.innerHTML=`<span>${esc(message)}</span><button class="icon-btn" data-command="dismiss-notice" aria-label="${globalThis.PlayroomMessages.text("ui.app.935e004f83bf")}" title="${globalThis.PlayroomMessages.text("ui.app.935e004f83bf")}">${icon('close')}</button>`;noticeElement.classList.add('show');noticeElement.setAttribute('role','alert');placeNotice();
  }
  const updateBanner=$('#update-banner'),updateDetail=$('#update-detail');
  globalThis.PlayroomPWA?.setUpdateGuard(()=>screen==='hub'&&!room&&!transition&&!$('#modal-root').children.length&&!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()&&save());
  window.addEventListener('playroom-update-ready',()=>{updateBanner.hidden=false;updateDetail.textContent='';});
  $('#update-now')?.addEventListener('click',async()=>{
    const button=$('#update-now');button.disabled=true;updateDetail.textContent=globalThis.PlayroomMessages.text("ui.app.ca2c48f1d3e1");
    try{await globalThis.PlayroomPWA.activateUpdate();updateDetail.textContent=globalThis.PlayroomMessages.text("ui.app.40c739dffde5");}
    catch(error){updateDetail.textContent=globalThis.PlayroomMessages.error(error);button.disabled=false;}
  });
  function save() {
    if (!session||historyOrigin?.kind==='library') return true;
    try { library.write(session,sessionId); storageOK = true; loadWarning=''; return true; }
    catch (_) { toast(globalThis.PlayroomMessages.text("ui.app.efc8dc649fa3")); storageOK = false; return false; }
  }
  function playSounds(before,after) {
    soundTicket++;
    if(!settings.sound||document.hidden||gate!==null)return;
    const cues=E.soundCues(after,viewer,before.events.at(-1)?.id||0);
    const ids=cues.map(c=>c.id);
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
    void Promise.resolve(client.dispatch(Protocol.command(snapshot,{type:'session-pause',paused:value,expectedControlRevision:snapshot.controlRevision},'local-control-'+(++commandSequence)))).then(receipt=>{if(!receipt.ok)toast(receipt.message);}).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
  }
  function stopReplay(stopAudio=true) { clearTimeout(replayTimer); replayTimer=null;replayTicket++;feedback.clear();flow.cancel();if(stopAudio)stopSounds(); }
  const {orderedVisibleGames,tile,recentGameCard,hubFilterMarkup,renderHub,moveHubGame,editHubStep,hubDropAt,savedGamesMarkup,refreshNetworkSaved,updateSavedPanel}=globalThis.PlayroomHubPresenter.create({get settings(){return settings;},get $(){return $;},set $(value){$=value;},get E(){return E;},set E(value){E=value;},get GameScreen(){return GameScreen;},set GameScreen(value){GameScreen=value;},get Tags(){return Tags;},set Tags(value){Tags=value;},get V(){return V;},set V(value){V=value;},get appVersion(){return appVersion;},set appVersion(value){appVersion=value;},get brand(){return brand;},set brand(value){brand=value;},get cancelBot(){return cancelBot;},get catalog(){return catalog;},set catalog(value){catalog=value;},get esc(){return esc;},set esc(value){esc=value;},get feedback(){return feedback;},set feedback(value){feedback=value;},get filter(){return filter;},set filter(value){filter=value;},get flashPacksOnHub(){return flashPacksOnHub;},set flashPacksOnHub(value){flashPacksOnHub=value;},get hubEditing(){return hubEditing;},set hubEditing(value){hubEditing=value;},get hubFilters(){return hubFilters;},set hubFilters(value){hubFilters=value;},get hubTab(){return hubTab;},set hubTab(value){hubTab=value;},get icon(){return icon;},set icon(value){icon=value;},get input(){return input;},set input(value){input=value;},get interruptAction(){return interruptAction;},get isPass(){return isPass;},set isPass(value){isPass=value;},get latestPacks(){return latestPacks;},get library(){return library;},set library(value){library=value;},get loadWarning(){return loadWarning;},set loadWarning(value){loadWarning=value;},get meta(){return meta;},set meta(value){meta=value;},get networkSaved(){return networkSaved;},set networkSaved(value){networkSaved=value;},get networkSavedState(){return networkSavedState;},set networkSavedState(value){networkSavedState=value;},get networkSavedTicket(){return networkSavedTicket;},set networkSavedTicket(value){networkSavedTicket=value;},get packNotices(){return packNotices;},set packNotices(value){packNotices=value;},get packUpdates(){return packUpdates;},get playerTargets(){return playerTargets;},set playerTargets(value){playerTargets=value;},get savedFilter(){return savedFilter;},set savedFilter(value){savedFilter=value;},get screen(){return screen;},set screen(value){screen=value;},get session(){return session;},set session(value){session=value;},get localResumeVisible(){return settings.hiddenLocalSession!==sessionId;},get updateKey(){return updateKey;},set updateKey(value){updateKey=value;}});











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
    if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text("ui.app.ed9bf8ddc81a"));
    if(!id)return toast(globalThis.PlayroomMessages.text("ui.app.34c23d3e2ac3"));
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
      let draft=roomService.create({name:globalThis.PlayroomMessages.text("ui.app.499f4549c0b2",{p0:String(host.nickname)}),host,game:{id:session.game,name:g.name,version:session.packVersion},rules:{preset:session.options.preset,presetLabel:session.options.presetLabel,openHands:!!session.options.openHands,options:Object.fromEntries((catalog[session.game]?.settings||[]).map(field=>[field.key,session.options[field.key]??field.default]))},constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
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
  function deleteSession(id) {
    const position=window.scrollY;
    try {
      library.remove(id);
      if(id===sessionId){interruptAction();cancelBot();stopReplay();session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;}
      if(packs?.warnings?.some(warning=>/^Встроенный пакет /.test(warning))) {
        try {
          globalThis.PlayroomPackManager?.reconcile?.(packs,library);
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
      for(const record of library.records())library.remove(record.id);
      clearDeletedSession();closeModal(true);renderHub();
    }catch(error){toast(globalThis.PlayroomMessages.text("ui.app.969afd6c7829",{p0:String(globalThis.PlayroomMessages.error(error))}));renderHub();}
  }
  function activeActions(state) {
    if (isReplay()||gate!==null||paused||state.status==='finished'||state.players[viewer]?.bot) return [];
    const actions=localClient(viewer).snapshot().actions;return transition||awaitingPass?actions.filter(action=>E.reactions?.(state,viewer).some(reaction=>Protocol.canonical(reaction)===Protocol.canonical(action))):actions;
  }
  function playersMarkup(state,actions=[]) {
    return GameScreen.playersMarkup(state,viewer,actions,{scoreLabel:meta(session.game).scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee"),playerBadge:(projected,i)=>catalog[projected.game]?.playerBadge?.(projected,i)});
  }
  function renderTable(animate=false,preserveField=false) {
    if (!session) return renderHub();
    activateSession();
    const state=currentState(), game=meta(session.game), replay=isReplay(), actions=activeActions(state), passProtected=handoffDelay()>0;
    const shownViewer=gate!==null?-1:viewer,frame=localFrame(state,shownViewer,actions),projected=frame.state;
    screenController.history.receive(localFrame(session.current,shownViewer));
    screenController.history.open=historyOpen;
    if(replay)screenController.history.select(replayIndex,frame);
    screenController.selection=selected;
    const context=screenController.context(frame,{scope:catalog[state.game]?.capabilities?.viewStateScope});
    selected=context.selected;viewState=context.viewState;

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
      layoutId:sessionId||session.createdAt,gameName:game.name,subtitle:session.options.presetLabel||globalThis.PlayroomMessages.text("ui.app.4da4da9da138"),
      state:projected,viewer:shownViewer,actions,scoreLabel:game.scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee"),
      playerBadge:(visible,i)=>catalog[visible.game]?.playerBadge?.(visible,i),
      turnText,turnExtra:replay?'':globalThis.PlayroomMessages.text("ui.app.e954f44bf49a",{p0:String(state.move+1),p1:String(!state.data.hands?globalThis.PlayroomMessages.text("ui.app.182bafd6e1b1"):session.options.openHands?globalThis.PlayroomMessages.text("ui.app.3d9add839803"):globalThis.PlayroomMessages.text("ui.app.a3e084db5bc0"))}),
      replay,busy:!!transition,botThinking:!replay&&!!turnPlayer?.bot,animationSpeed:settings.animationSpeed,
      scene:V.render(projected,shownViewer,actions,{selected,viewState,presentationTurn:transition?.beforeTurn??(replay?session.states[replayIndex-1]?.turn:undefined),preferences:screenController.preferences(TabletopUI.viewPreferences(state.game,shownViewer)),flipped:shownViewer===1,quickPlay:settings.quickPlay})+(paused&&!replay?`<div class="pause-cover"><h2>${globalThis.PlayroomMessages.text("ui.app.6f02551279d4")}</h2><p>${globalThis.PlayroomMessages.text("ui.app.63b894bbd7b4")}</p><button class="btn" data-command="pause">${globalThis.PlayroomMessages.text("ui.app.558521e805d1")}${icon('play')}</button></div>`:''),
      historyHTML:historyOpen?historyMarkup():'',historyCaption:eventText,historyResult:session.current.status==='finished',roomAction:room?{attrs:'data-command="room"'}:null,pause:paused,readOnly:historyOrigin?.kind==='library',
      beforeFooter:isPass()&&!replay&&!finished?GameScreen.iconButton('data-command="pass-device"',globalThis.PlayroomMessages.text("ui.app.9e49bec43037"),'arrow',{className:'pass-device-button'+(awaitingPass&&!paused&&!transition&&!passProtected?' handoff-pending':''),disabled:!awaitingPass||!!transition||paused||gate!==null||passProtected}):'',
      footerText:eventText,footerTitle:lastEvent(projected)?.text||globalThis.PlayroomMessages.text("ui.app.efcdf40bd477"),saved:storageOK,
      footerAction:{command:finished?'result':'pause',label:finished?globalThis.PlayroomMessages.text("ui.app.24735a7161d9"):paused?globalThis.PlayroomMessages.text("ui.app.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.app.65530fd463ea"),icon:finished?'arrow':paused?'play':'pause'}
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
  function historyStart(){return session.current.timeline?.playStart??0;}
  function historyMarkup() {
    const idx=replayIndex??session.states.length-1;
    const chooser=historyOrigin?.kind==='library'&&isPass()?`<label class="history-viewer">${globalThis.PlayroomMessages.text("ui.app.f54f58cf08df")}<select id="history-viewer" aria-label="${globalThis.PlayroomMessages.text("ui.app.55228669ae30")}">${session.current.players.map((p,i)=>`<option value="${i}" ${i===viewer?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:'';
    return chooser+GameScreen.historyMarkup({minimum:historyStart(),turnStarts:session.current.timeline?.starts||[],roundStarts:(E.project(session.current,-1).scene?.round?.starts||[]).map((revision,index)=>({revision,number:index+1})),index:idx,count:session.states.length-1,playing:!!replayTimer});
  }
  function scrubHistory(index) {
    const slider=$('#replay-range'),focused=document.activeElement===slider;input?.cancel();stopReplay();replayIndex=Math.max(historyStart(),Math.min(session.states.length-1,index));selected=null;renderTable();
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
    $('#app').insertAdjacentHTML('beforeend',`<section class="handoff" role="dialog" aria-modal="true" aria-label="${globalThis.PlayroomMessages.text("ui.app.56a282293bf5")}"><div class="handoff-content"><div class="handoff-art" aria-hidden="true"><span>✦</span><span>✦</span></div><span class="eyebrow muted">${globalThis.PlayroomMessages.text("ui.app.bb21addcf210")}</span><h2>${esc(player.name)}, ${globalThis.PlayroomMessages.text("ui.app.1cb39990173e")}</h2><p>${globalThis.PlayroomMessages.text("ui.app.7d875df45719")}<br>${globalThis.PlayroomMessages.text("ui.app.d0aa0a02cf67")}</p><button class="btn" data-command="unlock">${globalThis.PlayroomMessages.text("ui.app.90089f1a1dc7")}${esc(player.name)} · ${globalThis.PlayroomMessages.text("ui.app.ca7cd7cf82b3")}${icon('eye')}</button></div>${GameScreen.iconButton('data-command="home"',globalThis.PlayroomMessages.text("ui.app.6a186c342109"),'back',{className:'handoff-nav'})}</section>`);
    $('.handoff .btn')?.focus();
  }
  function render(animate=false) { screen==='hub'?renderHub():screen==='lobby'?renderLobby():renderTable(animate); }
  function scheduleBot() {
    cancelBot();
    if(transition||!session||screen!=='table'||isReplay()||paused||gate!==null||document.hidden||$('#modal-root').children.length||session.current.status==='finished')return;
    localAuthority().scheduleBot({delay:pace().botDelay,run:(actor,action)=>act(actor,action),onError(error){paused=true;render();toast(globalThis.PlayroomMessages.error(error));}});
  }
  function finishAction(run,{redraw=true,result=true}={}) {
    if(transition!==run)return;
    transition=null;screenController.cancelTransition();flow.cancel();
    if(session!==run.session)return;
    if(isPass()&&session.current.turn!==run.beforeTurn&&session.current.status!=='finished'&&!session.current.players[session.current.turn]?.bot&&session.current.turn!==viewer){
      awaitingPass=true;
    }
    presentationReady();
    if(redraw&&screen==='table'&&!isReplay())renderTable();
    if(result&&screen==='table'&&!isReplay()&&!$('#modal-root').children.length&&session.current.status==='finished'&&lastResult!==session.createdAt){lastResult=session.createdAt;showResult();}
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
      if(transition&&independent){const receipt=screenController.send(action,{actor});if(!receipt.ok&&!receipt.ignored)throw Error(receipt.message);feedback.accept(E.project(session.current,viewer).events,E.soundCues(session.current,viewer,feedback.cursor),session.game,{mode:pace().mode});save();renderTable();return;}
      const beforeState=session.current,beforeTurn=beforeState.turn,timing=pace(),snapshot=flow.capture({actor,action,viewer,playedFrom:context.playedFrom});
      if(session.current.players[actor]?.bot)localAuthority().actBot(actor,action);
      else {const receipt=screenController.send(action,{actor});if(receipt.ignored||receipt.code==='REACTION_WAIT')return;if(!receipt.ok)throw Error(receipt.message);}
      GameScreen.allowLayoutChange($('#app'),context);selected=null;playerTargets?.cancel();
      const quiet=catalog[session.game]?.capabilities?.quietActions?.includes(action.type);
      const draws=cardTransfers(beforeState,session.current).filter(draw=>draw.privateTo==null||(Array.isArray(draw.privateTo)?draw.privateTo.includes(viewer):draw.privateTo===viewer));
      const events=E.project(session.current,viewer).events.filter(event=>event.id>(beforeState.events.at(-1)?.id||0));
      feedback.accept(events,E.soundCues(session.current,viewer,beforeState.events.at(-1)?.id||0),session.game,{defer:!quiet,silent:document.hidden||gate!==null,mode:timing.mode,snapshot,motion:quiet?null:()=>flow.play(snapshot,{draws})});
      save();input?.invalidate();
      if(quiet){renderTable(false,true);return;}
      screenController.transition({context:{session,beforeTurn},capture:()=>snapshot,
        render(run){transition=run;renderTable();},
        play:()=>flow.present(()=>{feedback.next();return feedback.whenIdle();},{events,before:beforeState,after:session.current}),
        settle:0,finish:run=>finishAction(run)});
    } catch(error){toast(globalThis.PlayroomMessages.error(error)||globalThis.PlayroomMessages.text("ui.app.691a0701dfac"));void previewSound('error',session?.game);}
  }
  const localModal=new globalThis.PlayroomDOM.ModalController({host:$('#modal-root'),background:$('#app')});
  function openModal(content,className='',{keepAudio=false}={}) {
    pendingAction=null;
    const existing=className&&$('#modal-root .'+className);
    if(existing&&(className==='room-setup-modal'||className==='pack-manager-modal')){GameScreen.updateModal(existing,content);return;}
    const returnToRoom=!!$('#modal-root .room-setup-modal')&&className!=='room-setup-modal';
    dismissNotice();const focused=document.activeElement;interruptAction();stopReplay(!keepAudio);input?.cancel();cancelBot();if(screen==='table')renderTable();cancelBot();modalReturn=focused?.isConnected?focused:focused?.dataset?.command?$('#app [data-command="'+focused.dataset.command+'"]'):focused;modalBack=returnToRoom?($('#modal-root [data-command=lobby-start]')?renderLobby:()=>globalThis.PlayroomNetworkLibrary?.openRoom?.()):null;$('#app').inert=true;
    const template=document.createElement('template');template.innerHTML=content;
    if(!template.content.querySelector('.modal-head')){
      const title=template.content.querySelector('h2');if(title){const text=title.textContent;title.remove();content=GameScreen.modalHead(text)+template.innerHTML;}
    }
    localModal.open(`<div class="modal-backdrop"><section class="modal ${className}" role="dialog" aria-modal="true">${GameScreen.modalContent(content)}</section></div>`);
    GameScreen.fitCovers($('#modal-root'));
    placeNotice();
    const heading=$('.modal h2'); if(heading){heading.id='dialog-title';$('.modal').setAttribute('aria-labelledby','dialog-title');}
    $('.modal button,.modal input,.modal select')?.focus();
  }
  function closeModal(ignoreBack=false) {
    pendingAction=null;
    dismissNotice();
    if($('#profile-form')&&!playerProfile?.name&&!ignoreBack)return;

    const back=modalBack;modalBack=null;
    if(back&&!ignoreBack){back();return;}
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
    room=roomService.create({name:globalThis.PlayroomMessages.text("ui.app.499f4549c0b2",{p0:String(host.nickname)}),host,game:{id:gameId,name:g.name,version:active.version,teamLayouts:catalog[gameId]?.teamLayouts||{}},rules,constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
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
    openModal(PlayroomLobbyView.render({room:state,participantId:lobbyParticipantId,isHost,canStart:isHost&&roomService.canStart(state.id),startReason:isHost?roomService.startBlocker(state.id):'',countdown:lobbyCountdown??3,notice:state.phase==='lobby'&&state.participants.find(p=>p.id===lobbyParticipantId)?.rulesNotice?latestRoomEvent('rules-changed')?.text||'':''}),'room-setup-modal');
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
  function startHotSeat(){
    room=roomService.prepareStart(room.id,lobbyParticipantId);dismissNotice();
    const seats=room.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index),players=seats.map(s=>{const p=room.participants.find(p=>p.id===s.participantId);return {name:p.nickname,bot:!!p.bot,...(p.avatar?{avatar:p.avatar}:{})};});
    if(!players.some(p=>!p.bot))throw Error(globalThis.PlayroomMessages.text("ui.app.dc875925c351"));
    if(room.firstPlayerMode==='assigned'&&!seats.some(s=>s.participantId===room.firstParticipantId))throw Error(globalThis.PlayroomMessages.text("ui.app.467f6abb2682"));
    activatePack(room.game.id,room.game.version);
    const mode=players.filter(p=>!p.bot).length>1?'pass':'solo',next=new Session(E,room.game.id,{players,mode,lobbyConfig:roomService.snapshot(room.id),preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:room.rules.openHands,firstPlayerMode:room.firstPlayerMode||'rules',firstPlayer:seats.findIndex(s=>s.participantId===room.firstParticipantId),...(room.rules.options||{})});
    if(!save())return;session=next;sessionId=library.newId();library.activate(next,sessionId);storageOK=true;
    rememberGame(room.game.id);
    room=roomService.startHotSeat(room.id,lobbyParticipantId);
    screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;lastResult=null;awaitingPass=false;
    viewer=mode==='solo'?players.findIndex(p=>!p.bot):next.current.players[next.current.turn].bot?players.findIndex(p=>!p.bot):next.current.turn;
    gate=needsGate(next.current)?viewer:null;closeModal(true);render();presentationReady();
  }
  function updateLobbyNickname(form){try{room=roomService.rename(room.id,lobbyParticipantId,form.elements.nickname.value);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showRoomHuman(seatId){const seat=room.seats.find(s=>s.id===seatId),p=room.participants.find(p=>p.id===seat?.participantId);openModal(`${modalHead(p?globalThis.PlayroomMessages.text("ui.app.11903af3c69a"):globalThis.PlayroomMessages.text("ui.app.c524c19c7ef4"))}<form id="room-human-form" data-seat="${esc(seatId)}" ${p?'data-rename="true"':''}><label class="field">${globalThis.PlayroomMessages.text("ui.app.1da7e9372e2f")}<input name="nickname" maxlength="24" required value="${esc(p?.nickname||globalThis.PlayroomMessages.text("ui.app.f54f58cf08df"))}"></label><button class="icon-btn" aria-label="${p?globalThis.PlayroomMessages.text("ui.app.59322ea5e71f"):globalThis.PlayroomMessages.text("ui.app.c524c19c7ef4")}" type="submit">${icon(p?'save':'addPlayer')}</button></form>`);modalBack=renderLobby;}
  function claimLobbySeat(seatId){const occupant=room.participants.find(p=>p.id===room.seats.find(s=>s.id===seatId)?.participantId);if(room.ownerId===lobbyParticipantId&&!room.recovery&&occupant&&(occupant.bot||room.transportMode==='hotseat')){showRoomHuman(seatId);return;}if(room.transportMode==='hotseat'&&!room.seats.find(s=>s.id===seatId)?.participantId){showRoomHuman(seatId);return;}try{room=roomService.claimSeat(room.id,lobbyParticipantId,seatId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function kickLobbyParticipant(targetId){try{room=roomService.kick(room.id,lobbyParticipantId,targetId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showRoomRules(){
    const state=roomService.snapshot(room.id),game=meta(state.game.id);
    const rows=state.rules.display||Multiplayer.describeRules(state.rules,catalog[state.game.id]?.settings||[],!!catalog[state.game.id]?.capabilities?.hands);
    openModal(globalThis.PlayroomMessages.text("ui.app.380e3dbd6730",{p0:String(modalHead(globalThis.PlayroomMessages.text("ui.app.ee9cd4deefad",{p0:String(game.name)}))),p1:String(PlayroomLobbyView.rulesMarkup(state,rows,game,catalog[state.game.id]?.settings||[]))}));modalBack=renderLobby;
  }
  function showRoomHelp(){openModal(globalThis.PlayroomMessages.text("ui.app.380e3dbd6730",{p0:String(modalHead(globalThis.PlayroomMessages.text("ui.app.df2a5a208045"))),p1:String(PlayroomLobbyView.helpMarkup(roomService.snapshot(room.id)))}));modalBack=renderLobby;}
  function showRoomRulesEditor(){
    const state=roomService.snapshot(room.id),g=meta(state.game.id),presets=g.presets?.length?g.presets:[{id:'default',label:globalThis.PlayroomMessages.text("ui.app.a39ad47c9222")}],fields=catalog[state.game.id]?.settings||[];
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.803a31d997e9",{p0:String(g.name)}))}<form id="room-rules-form" data-game="${esc(state.game.id)}"><div class="start-options">${[['firstPlayerMode',globalThis.PlayroomMessages.text("ui.app.39210fbb29ff"),[['rules',globalThis.PlayroomMessages.text("ui.app.97a31231be5b"),'rules'],['random',globalThis.PlayroomMessages.text("ui.app.8a42883ca3dc"),'shuffle'],['assigned',globalThis.PlayroomMessages.text("ui.app.cfd07e716f9f"),'first']]],['seatOrder',globalThis.PlayroomMessages.text("ui.app.f7ca1ccfc66b"),[['normal',globalThis.PlayroomMessages.text("ui.app.f700823e4396"),'arrow'],['random',globalThis.PlayroomMessages.text("ui.app.8a42883ca3dc"),'shuffle']]]].map(([name,label,options])=>`<fieldset><legend>${label}${PlayroomLobbyView.fieldHelp(PlayroomLobbyView.ruleText(name==='seatOrder'?'seatOrder':'firstPlayer'))}</legend>${options.map(([value,text,glyph])=>`<label class="start-option"><input type="radio" name="${name}" value="${value}" ${(state[name]||(name==='seatOrder'?'normal':'rules'))===value?'checked':''}>${icon(glyph)}<span>${text}</span></label>`).join('')}</fieldset>`).join('')}</div><label class="field"><span>${globalThis.PlayroomMessages.text("ui.app.b5d827de5168")}</span><select name="preset">${presets.map(p=>`<option value="${esc(p.id)}" ${state.rules.preset===p.id?'selected':''}>${esc(p.label||p.name||p.id)}</option>`).join('')}</select></label>${fields.map(field=>`<div class="field rule-field" data-rule-field="${esc(field.key)}"><label for="rule-${esc(field.key)}">${esc(field.label)}</label>${PlayroomLobbyView.fieldHelp(field.help)}<select id="rule-${esc(field.key)}" name="option-${esc(field.key)}">${field.options.map(option=>`<option value="${esc(option.value)}" ${state.rules.options?.[field.key]===option.value?'selected':''}>${esc(option.label)}</option>`).join('')}</select></div>`).join('')}${catalog[state.game.id]?.capabilities?.hands?`<label class="switch"><span>${globalThis.PlayroomMessages.text("ui.app.957e469d885d")}</span><input type="checkbox" name="openHands" ${state.rules.openHands?'checked':''}>${PlayroomLobbyView.fieldHelp(PlayroomLobbyView.ruleText('openHands'))}</label>`:''}<div class="modal-foot"><button class="btn secondary" type="button" data-rules="${esc(state.game.id)}">${globalThis.PlayroomMessages.text("ui.app.e2d0b8c5f974")}</button><button class="btn" type="submit">${icon('save')} ${globalThis.PlayroomMessages.text("ui.app.98a9e5a733d4")}</button></div></form>`);syncRuleVisibility($('#room-rules-form'));
  }
  function syncRuleVisibility(form){if(!form)return;for(const field of catalog[form.dataset.game]?.settings||[]){const row=form.querySelector('[data-rule-field="'+field.key+'"]');if(row)row.hidden=!!field.visibleWhen&&!Object.entries(field.visibleWhen).every(([key,value])=>form.elements['option-'+key]?.value===String(value));}}
  function showRoomGameEditor(){
    if(!room||roomService.snapshot(room.id).phase!=='lobby'||room.ownerId!==lobbyParticipantId)return;
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{favorites:[]};
    const available=orderedVisibleGames().filter(g=>V.supports(g.id,'player')&&V.supports(g.id,'table')).sort((a,b)=>Number(preferences.favorites.includes(b.id))-Number(preferences.favorites.includes(a.id)));
    if(!available.length)return toast(globalThis.PlayroomMessages.text("ui.app.631826417487"));
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.3bba8537ff5d"))}<div class="room-choice-list">${available.map((g,i)=>`${i&&preferences.favorites.includes(available[i-1].id)&&!preferences.favorites.includes(g.id)?'<hr class="room-choice-divider">':''}${GameScreen.packRow({id:g.id,version:g.version||'',name:g.name,manifest:catalog[g.id]||g,selectable:true,attrs:`data-room-game="${esc(g.id)}"`})}`).join('')}</div>`);modalBack=renderLobby;
  }
  function updateRoomGame(form){
    try{
      const gameId=typeof form==='string'?form:form.elements.gameId.value,g=meta(gameId),active=activatePack(gameId);
      if(!g||!active||!V.supports(gameId,'player')||!V.supports(gameId,'table'))throw Error(globalThis.PlayroomMessages.text("ui.app.5d39a9ae84f6"));
      const rules=defaultRules(gameId,g);
      room=roomService.changeGame(room.id,lobbyParticipantId,{game:{id:gameId,name:g.name,version:active.version,teamLayouts:catalog[gameId]?.teamLayouts||{}},rules,
        constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
      closeModal(true);renderLobby();
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function updateRoomRules(form){try{const rules=roomRulesFromForm(form);room=roomService.configure(room.id,lobbyParticipantId,{firstPlayerMode:rules.firstPlayerMode,seatOrder:rules.seatOrder});room=roomService.updateRules(room.id,lobbyParticipantId,rules);rememberRules(room.game.id,rules);closeModal(true);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function toggleLobbyReady(){try{const me=room.participants.find(p=>p.id===lobbyParticipantId);room=roomService.setReady(room.id,lobbyParticipantId,!me?.ready);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function becomeLobbySpectator(){try{room=roomService.becomeSpectator(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function startLobbyCountdown(){
    try{
      if(room.transportMode==='hotseat')return startHotSeat();
      room=roomService.beginCountdown(room.id,lobbyParticipantId,{seconds:3});lobbyCountdown=3;renderLobby();clearInterval(lobbyTimer);
      lobbyTimer=setInterval(()=>{const step=roomService.tick(room.id);room=step.room;lobbyCountdown=step.remaining;if(step.started||step.reason){clearInterval(lobbyTimer);lobbyTimer=null;}renderLobby();if(step.reason)toast(step.reason);},250);
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function leaveLobby(){
    if(screen==='table')save();clearInterval(lobbyTimer);lobbyTimer=null;lobbyCountdown=null;
    globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room?.id);
    room=null;lobbyParticipantId=null;cancelBot();closeModal(true);screen='hub';flashPacksOnHub=true;renderHub();refreshPackUpdates();
  }
  function showPlayerNamePrompt(){
    openModal(`<header class="modal-head"><h2>${globalThis.PlayroomMessages.text("ui.app.773b1abc7b8c")}</h2></header><p class="lead">${globalThis.PlayroomMessages.text("ui.app.5418cf79756a")}</p><form id="profile-form"><div class="profile-identity-row">${globalThis.PlayroomAvatarPicker.button('',profileAvatar)}<label class="field"><span>${globalThis.PlayroomMessages.text("ui.app.f189892b63a9")}</span><input name="playerName" maxlength="24" autocomplete="nickname" placeholder="${globalThis.PlayroomMessages.text("ui.app.fec0b28c091d")}" required></label></div><button class="btn" type="submit" style="width:100%;margin-top:14px">${icon('save')} ${globalThis.PlayroomMessages.text("ui.app.b4d30cae5289")}</button></form>`);
  }
  function savePlayerProfile(form){try{playerProfile=profileStore.save(form.elements.playerName.value,{avatar:profileAvatar});closeModal(true);render();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showRules(gameId=($('#modal-root .room-setup-modal,#room-rules-form')?room?.game?.id:session?.game)) {
    const returnBack=modalBack,fromRoom=!!room&&(!!$('#modal-root .room-setup-modal,#room-rules-form')||modalBack===renderLobby);
    if(!gameId)return showHelp();const g=meta(gameId),roomRules=fromRoom&&room?.game?.id===gameId?room.rules:null;
    const chosenRules=roomRules?(()=>{
      const fields=catalog[gameId]?.settings||[],details=[roomRules.presetLabel||roomRules.preset||globalThis.PlayroomMessages.text("ui.app.4da4da9da138")];
      for(const field of fields){const value=roomRules.options?.[field.key],option=field.options?.find(item=>item.value===value);if(option)details.push(field.label+': '+option.label);}
      if(catalog[gameId]?.capabilities?.hands)details.push(globalThis.PlayroomMessages.text("ui.app.6df5478139aa",{p0:String(roomRules.openHands?globalThis.PlayroomMessages.text("ui.app.cdc5ed90cb4b"):globalThis.PlayroomMessages.text("ui.app.dc9337ff5b42"))}));
      return details;
    })():null;

    const rules=Array.isArray(g.rules)?g.rules:[String(g.rules||g.description)];
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.ee9cd4deefad",{p0:String(g.name)}))}<p class="lead">${esc(g.description)}</p>${chosenRules?`<div class="rules-mode-note"><strong>${globalThis.PlayroomMessages.text("ui.app.8f68487ed201")}</strong><ul style="margin:7px 0 0;padding-left:18px">${chosenRules.map(item=>`<li>${esc(item)}</li>`).join('')}</ul></div>`:''}${PlayroomLobbyView.gameRulesMarkup(g,catalog[gameId]?.settings||[])}<p class="rules-mode-note">${globalThis.PlayroomMessages.text("ui.app.840dedadf9ac")}</p><p class="pack-line">${globalThis.PlayroomMessages.text("ui.app.a61be19c4d76")}${esc(g.id)} · ${g.min===g.max?g.min:g.min+'–'+g.max} ${globalThis.PlayroomMessages.text("ui.app.71d648b599c5")}</p><button class="btn" data-command="close-modal" style="width:100%;margin-top:10px">${globalThis.PlayroomMessages.text("ui.app.e2ce86b38fd5")}</button>`);
    if(returnBack)modalBack=returnBack;else if(fromRoom)modalBack=renderLobby;
  }
  function showHelp() {
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.d721c75def08"))}<div class="help-grid">
      <div class="help-item">${icon('people')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.a6d0cdfe334a")}</strong>${globalThis.PlayroomMessages.text("ui.app.d7dba9d443ad")}</p></div>
      <div class="help-item">${icon('hand')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.817e795ac107")}</strong>${globalThis.PlayroomMessages.text("ui.app.eddbc452360d")}</p></div>
      <div class="help-item">${icon('history')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.f6c8472ceb1a")}</strong>${globalThis.PlayroomMessages.text("ui.app.8d87bdfc36e3")}</p></div>
      <div class="help-item">${icon('save')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.2d7e6a75f0ae")}</strong>${globalThis.PlayroomMessages.text("ui.app.64e5f1e7ba99")}</p></div>
      <div class="help-item">${icon('layers')}<p><strong>${globalThis.PlayroomMessages.text("ui.app.9f485e78fa98")}</strong>${globalThis.PlayroomMessages.text("ui.app.9128a0f992ff")}; ${globalThis.PlayroomMessages.text("ui.app.50e140dd89b0")}</p></div></div><button class="btn" data-command="close-modal" style="width:100%;margin-top:25px">${globalThis.PlayroomMessages.text("ui.app.72e2d50dff4c")}${icon('arrow')}</button>`);
  }
  function showSettings(options={}) {
    const settingsRoom=options.room||(room?roomService.snapshot(room.id):null);
    const nickname=settingsRoom?PlayroomLobbyView.nicknameMarkup(settingsRoom,options.participantId||lobbyParticipantId||playerProfile?.id,!!options.client):null;
    const profile=nickname||`<div class="profile-identity-row">${globalThis.PlayroomAvatarPicker.button(playerProfile?.name||'',profileAvatar)}<label class="field"><span>${globalThis.PlayroomMessages.text("ui.app.f189892b63a9")}</span><input id="setting-player-name" maxlength="24" autocomplete="nickname" value="${esc(playerProfile?.name||'')}" placeholder="${globalThis.PlayroomMessages.text("ui.app.4098056e6278")}"></label></div>`;
    const soundOptions=audio.catalog().map(c=>`<option value="|${esc(c.id)}">${esc(c.label)}</option>`).join('');
    const packSounds=Object.entries(catalog).filter(([,pack])=>pack.sounds).map(([id,pack])=>`<optgroup label="${esc(meta(id)?.name||id)}">${Object.entries(pack.sounds).map(([cue,def])=>`<option value="${esc(id)}|${esc(cue)}">${esc(def.label||cue)}</option>`).join('')}</optgroup>`).join('');
    const quick=GameScreen.quickAccessMarkup({exclude:['full','help']});
    const seatingGame=settingsRoom?.game?.id||session?.game;
    const duel=(settingsRoom?settingsRoom.seats.filter(s=>s.participantId).length:Number(document.querySelector('.app-game-layout')?.dataset.playerCount)||session?.current.players.length)===2;
    const stage=document.querySelector('.app-game-layout'),rowOnly=duel||globalThis.PlayroomViews.get(seatingGame)?.seating==='row';
    const seatingValue=rowOnly?'row':settings.seatingByGame[seatingGame]==='row'?'row':'anchors';
    const canAnchor=true;
    const hasCardHand=!seatingGame||(catalog[seatingGame]?.capabilities?.hands&&catalog[seatingGame]?.category==='cards');
    const invite=settingsRoom?.transportMode!=='hotseat'&&!options.client&&settingsRoom?.ownerId===(lobbyParticipantId||playerProfile?.id)?GameScreen.addPlayerButton():'';
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.985b5e0f2ccf")).replace('</header>','')}<div class="settings-header-actions">${GameScreen.iconButton('data-command="fullscreen"',globalThis.PlayroomMessages.text("ui.game-screen.f42c392566b5"),'full')}${GameScreen.iconButton(settingsRoom&&!options.client?'data-command="room-help"':'data-command="help"',globalThis.PlayroomMessages.text("ui.game-screen.7f7b0ffbbfe0"),'help')}</div></header><div class="settings-overview"><div class="settings-quick">${quick}${invite}${!quick.includes('data-command="rules"')&&(options.sharedRules||settingsRoom||session&&screen==='table')?`<button class="icon-btn" title="${globalThis.PlayroomMessages.text("ui.app.7f7b0ffbbfe0")}" aria-label="${globalThis.PlayroomMessages.text("ui.app.7f7b0ffbbfe0")}" ${options.sharedRules?'data-shared-rules':options.client?'data-net-action="rules"':session&&screen==='table'?'data-command="rules"':settingsRoom?'data-command="room-rules-view"':'data-command="rules"'}>${icon('rules')}</button>`:''}</div><button type="button" class="icon-btn settings-themes" data-appearance-editor aria-label="${globalThis.PlayroomMessages.text('ui.app.themes-button')}" title="${globalThis.PlayroomMessages.text('ui.app.themes-button')}">${icon('palette')}</button><div class="settings-personal">${profile}</div></div>
      ${seatingGame&&!rowOnly?`<label class="field seating-setting"><span>${globalThis.PlayroomMessages.text('ui.app.seating.label')}</span><select id="setting-seating" data-game="${esc(seatingGame)}">${(rowOnly?['row']:[canAnchor?'anchors':'circle','row']).map(value=>`<option value="${value}" ${seatingValue===value?'selected':''}>${globalThis.PlayroomMessages.text('ui.app.seating.'+value)}</option>`).join('')}</select><small>${globalThis.PlayroomMessages.text('ui.app.seating.local')}</small></label>`:''}
      ${hasCardHand?`<label class="field"><span>${globalThis.PlayroomMessages.text('ui.app.hand-shape.label')}</span><select id="setting-hand-shape">${['straight','arc'].map(value=>`<option value="${value}" ${settings.handShape===value?'selected':''}>${globalThis.PlayroomMessages.text('ui.app.hand-shape.'+value)}</option>`).join('')}</select></label>`: ''}
      <label class="switch"><span>${globalThis.PlayroomMessages.text('ui.app.show-last-game')}</span><input type="checkbox" id="setting-last-game" ${settings.showLastGame?'checked':''}></label>
      ${!settingsRoom||settingsRoom.transportMode==='hotseat'?`<label class="switch"><span>${globalThis.PlayroomMessages.text("ui.app.d08b81966d44")}</span><input type="checkbox" id="setting-auto-pass" ${settings.autoPass?'checked':''}></label>`:''}
      <label class="switch"><span>${globalThis.PlayroomMessages.text("ui.app.b10ca6a74592")}</span><input type="checkbox" id="setting-quick-play" aria-describedby="setting-quick-play-description" ${settings.quickPlay?'checked':''}></label>
      <div class="settings-grid">${GameScreen.rangeSetting({id:'setting-volume',label:globalThis.PlayroomMessages.text('ui.app.77e13b86fbed'),value:settings.sound?volumeLevels.indexOf(settings.volume):0,display:volumeLabels[settings.sound?volumeLevels.indexOf(settings.volume):0]})}${GameScreen.rangeSetting({id:'setting-speed',label:globalThis.PlayroomMessages.text('ui.app.62af90477d26'),value:speedLevels.indexOf(settings.animationSpeed),display:animationPresets[settings.animationSpeed].label,describedby:'setting-speed-description'})}</div>
      ${GameScreen.rangeSetting({id:'setting-scale',label:globalThis.PlayroomMessages.text('ui.app.interface-scale'),min:50,max:150,step:10,value:globalThis.PlayroomInterfaceScale.applied,display:globalThis.PlayroomInterfaceScale.applied+'%',bounds:true})}
      <details class="settings-details"><summary>${globalThis.PlayroomMessages.text("ui.app.2a1b034b41db")}</summary><div class="sound-preview"><label class="field"><span>${globalThis.PlayroomMessages.text("ui.app.12c1d95abaf7")}</span><select id="sound-preview" data-sound-control ${settings.sound?'':'disabled'}><optgroup label="${globalThis.PlayroomMessages.text("ui.app.5d74e9a8efa5")}">${soundOptions}</optgroup>${packSounds}</select></label><button class="btn secondary" data-command="sound-preview" data-sound-control ${settings.sound?'':'disabled'} aria-label="${globalThis.PlayroomMessages.text("ui.app.7c5ead6299f2")}">${icon('play')}</button></div></details>
      <details class="settings-details"><summary>${globalThis.PlayroomMessages.text("ui.app.e2d7a2109816")}</summary>${!nickname?("<p class=\"lead\">"+globalThis.PlayroomMessages.text("ui.app.d940e6fdee3b")+"</p>"):''}<p class="lead" id="setting-quick-play-description">${globalThis.PlayroomMessages.text("ui.app.b5d22d15d394")}</p><p class="lead" id="setting-speed-description">${animationPresets[settings.animationSpeed].description}</p><p class="lead">${globalThis.PlayroomMessages.text("ui.app.b42de89d2283")}</p></details>
      ${session&&screen==='table'?`<button class="btn plain" data-start="${session.game}" style="width:100%;margin-top:10px">${icon('reset')} ${globalThis.PlayroomMessages.text("ui.app.b3490a21344b")}</button>`:''}`);
    globalThis.PlayroomInterfaceScale.sync();
  }
  function showCardHelp() {
    const cards=[...document.querySelectorAll('.own-hand .hand-card[data-tooltip]')],seen=new Set();
    const entries=cards.filter(card=>{const text=card.dataset.tooltip;if(seen.has(text))return false;seen.add(text);return true;});
    const details=entries.map(card=>`<li><strong>${esc(card.getAttribute('aria-label'))}</strong><p>${esc(card.dataset.tooltip)}</p></li>`).join('');
    openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.b7f6f3448201"))}<p class="lead">${globalThis.PlayroomMessages.text("ui.app.9751c986689e")}</p><ul class="card-help-list">${details||("<li>"+globalThis.PlayroomMessages.text("ui.app.91e23b5cc854")+"</li>")}</ul>`);
  }
  function showPlayerActions(target) {
    if(isReplay()||paused||gate!==null||!session)return;
    const action=activeActions(session.current).find(a=>a.target===target&&a.targetKind==='player');
    if(!action)return;
    const name=session.current.players[target].name;
    playerTargets?.tap(target);
  }
  function showResult() {
    if(!session||session.current.status!=='finished'||screen!=='table')return;
    const shownViewer=isPass()?-1:viewer,state=E.project(session.current,shownViewer);
    openModal(GameScreen.resultMarkup({state,viewer:shownViewer,gameName:meta(session.game).name,scoreLabel:meta(session.game).scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee")}),'result-modal',{keepAudio:true});
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
    if(!confirm(globalThis.PlayroomMessages.text("ui.app.986b3d9186b8")))return;
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
    setLocalPaused(true);gate=null;playerTargets?.cancel();feedback.clear();cancelBot();stopReplay();selected=null;historyOpen=true;replayIndex=Math.max(historyStart(),from??session.states.length-1);renderTable();
  }
  function startReplay() {
    stopReplay();const ticket=replayTicket;
    if(replayIndex===session.states.length-1)replayIndex=historyStart();
    const step=async()=>{
      if(ticket!==replayTicket||!isReplay()||screen!=='table')return;
      if(replayIndex>=session.states.length-1){stopReplay(false);renderTable();return;}
      const before=currentState(),after=session.states[replayIndex+1],events=E.project(after,viewer).events.filter(e=>e.id>(before.events.at(-1)?.id||0));
      const action=events.findLast(e=>e.presentation)?.presentation||{type:events.some(e=>e.kind==='roll')?'roll':'replay'},timing=pace(),snapshot=flow.capture({actor:before.turn,action,viewer});
      feedback.start(E.project(before,viewer).events);feedback.accept(E.project(after,viewer).events,E.soundCues(after,viewer,before.events.at(-1)?.id||0),session.game,{mode:timing.mode,snapshot,motion:()=>flow.play(snapshot,{draws:cardTransfers(before,after)}),defer:true});
      replayIndex++;renderTable();await flow.present(()=>{feedback.next();return feedback.whenIdle();},{events,before,after});
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
    'hide-local-session'(){settings.hiddenLocalSession=sessionId;try{localStorage.setItem('playroom.settings.v1',JSON.stringify(settings));}catch(_){}renderHub();},
    packs(){rememberPackUpdates('read');rememberPackUpdates('dismissed');packUI?.open();if(screen==='hub')renderHub();},
    'dismiss-pack-updates'(){rememberPackUpdates('dismissed');renderHub();},
    help:showHelp,settings:showSettings,'card-help':showCardHelp,fullscreen,rules:()=>showRules(),
    'room-rules':showRoomRulesEditor,'room-change-game':showRoomGameEditor,
    'lobby-ready':toggleLobbyReady,
    'lobby-spectator':becomeLobbySpectator,
    'lobby-table':()=>{try{room=roomService.claimTable(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}},
    'stop-local-match':stopLocalMatch,
    'lobby-start':startLobbyCountdown,
    'lobby-leave':()=>{if(room?.transportMode==='network'&&room.phase==='playing'&&!confirm(globalThis.PlayroomMessages.text("ui.app.15bd355dbb93")))return;leaveLobby();},
    'close-modal':closeModal,
    'confirm-action'(){const todo=pendingAction;closeModal();if(todo&&todo.session===session&&todo.state===session.current&&screen==='table'&&todo.actor===viewer)act(todo.actor,todo.action,{...todo.context,confirmed:true});},
    'room-rules-view':showRoomRules,
    'room-help':showRoomHelp,
    'sound-preview'(){const value=$('#sound-preview')?.value;if(!value)return;const [pack,id]=value.split('|');void previewSound(id,pack||undefined);},
    unlock(){viewer=gate;gate=null;awaitingPass=false;render();},
    'pass-device':transferDevice,
    history(){if(historyOpen)commands['history-close']();else openHistory();},
    'history-close':closeHistory,
    'replay-round-prev'(){stopReplay();replayIndex=globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,E.project(session.current,-1).scene?.round?.starts,-1,historyStart());render();},
    'replay-round-next'(){stopReplay();replayIndex=globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,E.project(session.current,-1).scene?.round?.starts,1,historyStart());render();},
    'replay-prev'(){stopReplay();replayIndex=globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,session.current.timeline?.starts,-1,historyStart());render();},
    'replay-next'(){const before=currentState();stopReplay();replayIndex=globalThis.PlayroomHistoryController.boundaryIndex(replayIndex,session.states.length-1,session.current.timeline?.starts,1,historyStart());render();playSounds(before,currentState());},
    'replay-play'(){if(replayTimer){stopReplay();return render();}startReplay();},
    room:renderLobby,'room-hotseat-confirm'(){modalBack=null;setRoomOption('transportMode','hotseat',true);},
    pause(){interruptAction();stopSounds();setLocalPaused(!paused);cancelBot();render();},result:showResult,
    'result-replay'(){closeModal();openHistory(0);commands['replay-play']();}
  };
  input=globalThis.TabletopInput.attach({
    canStart(source){return screen==='table'&&!!session&&!source.disabled&&!$('#modal-root').children.length&&activeActions(session.current).length>0;},
    canSelect(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&!transition&&(viewer===session.current.turn||source.hasAttribute('data-hand-preview'));},
    canCommit(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&(!transition||activeActions(session.current).some(action=>Protocol.canonical(action)===Protocol.canonical(JSON.parse(source?.dataset.action||'null'))));},
    getSelected(){return selected;},
    select(piece){selected=piece;renderTable();},
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
    const preference=event.target.closest('[data-view-preference]');if(preference&&screen==='table'){if(!screenController.setPreference(preference.dataset.viewPreference,preference.dataset.viewValue))TabletopUI.viewPreferences(session.game,viewer,preference.dataset.viewPreference,preference.dataset.viewValue);viewState={};screenController.viewState=viewState;renderTable();return;}
    const viewControl=event.target.closest('[data-view-key]');
    if(viewControl&&!viewControl.disabled&&screen==='table'){const {viewKey,viewValue}=viewControl.dataset;if(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(viewKey)&&viewValue.length<=80){viewState[viewKey]=viewValue;renderTable();}return;}
    if(event.target.closest('.player-target-menu'))return;
    const person=event.target.closest('[data-player-target],[data-player-panel-target]');
    if(person){showPlayerActions(Number(person.dataset.playerTarget??person.dataset.playerPanelTarget));return;}
    const button=event.target.closest('button,[data-action],[data-select],[data-cell],[data-drop-select]');
    if(!button||button.disabled)return;
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
    if(event.target.id==='history-viewer'&&historyOrigin?.kind==='library'){stopReplay();viewer=Number(event.target.value);renderTable();return;}
    if(event.target.closest('#room-rules-form')){syncRuleVisibility(event.target.form);return;}
    try{if(event.target.hasAttribute('data-room-title')){setRoomOption('name',event.target.value);return;}if(event.target.dataset.roomOption){setRoomOption(event.target.dataset.roomOption,event.target.type==='checkbox'?(event.target.checked?'network':'hotseat'):event.target.value);return;}}catch(error){toast(globalThis.PlayroomMessages.error(error));renderLobby();return;}
    if(event.target.id==='setting-player-name'){try{playerProfile=profileStore.save(event.target.value);}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
    if(['setting-scale','setting-speed','setting-quick-play','setting-auto-pass','setting-volume','setting-seating','setting-hand-shape','setting-last-game'].includes(event.target.id)){
      if(event.target.id==='setting-volume'){const index=Number(event.target.value);settings.sound=index>0;if(index>0)settings.volume=volumeLevels[index];soundTicket++;audio.setEnabled(settings.sound);audio.setVolume(settings.volume);document.querySelectorAll('[data-sound-control]').forEach(el=>el.disabled=!settings.sound);}
      else if(event.target.id==='setting-scale'){settings.interfaceScale=Math.min(Number(event.target.value),globalThis.PlayroomInterfaceScale.limit);GameScreen.allowLayoutChange(document.querySelector('#app'),{allowLayoutChange:true});globalThis.PlayroomInterfaceScale.set(settings.interfaceScale);}
      else if(event.target.id==='setting-quick-play')settings.quickPlay=event.target.checked;
      else if(event.target.id==='setting-seating'){const game=event.target.dataset.game;if(game&&['circle','anchors','row'].includes(event.target.value))settings.seatingByGame[game]=event.target.value;}
      else if(event.target.id==='setting-hand-shape')settings.handShape=event.target.value==='arc'?'arc':'straight';
      else if(event.target.id==='setting-last-game')settings.showLastGame=event.target.checked;
      else if(event.target.id==='setting-auto-pass')settings.autoPass=event.target.checked;
      else {settings.animationSpeed=speedLevels[Number(event.target.value)]||'normal';$('#setting-speed-description').textContent=animationPresets[settings.animationSpeed].description;}
      document.body.classList.toggle('reduced-motion',pace().duration===0);
      try{localStorage.setItem('playroom.settings.v1',JSON.stringify(settings));}catch(_){}
      window.dispatchEvent(new Event('playroom:game-options'));
      if(event.target.id==='setting-last-game'&&screen==='hub')renderHub();
      if(['setting-seating','setting-hand-shape'].includes(event.target.id)&&screen==='table'&&!document.querySelector('.network-game'))renderTable();
      if(event.target.id==='setting-volume')void previewSound();
    }
  });
  document.addEventListener('input',event=>{
    const input=event.target;if(!['setting-scale','setting-volume','setting-speed'].includes(input.id))return;
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
  globalThis.PlayroomAppBridge=Object.freeze({showSessions,showHub:()=>leaveTable('games'),parkLocalSession:()=>{if(room?.transportMode==='hotseat')leaveLobby();else if(screen==='table')leaveTable('games');},returnHostedRoomToLobby,restoreHostedRoom,rollbackHostedRoom,gameOptions:(gameId=session?.game)=>({handShape:settings.handShape,animationSpeed:settings.animationSpeed,quickPlay:settings.quickPlay,seating:settings.seatingByGame[gameId]||'auto'}),audio:Object.freeze({
    registerPack:(id,sounds)=>audio.registerPack(id,sounds),
    get busy(){return audioPending||audio.busy;},
    play:(ids,pack)=>{if(!settings.sound||document.hidden||!ids.length)return;
      const ordered=ids.slice(),request=++audioRequest;audioPending=true;
      void audio.unlock().then(async ok=>{if(request!==audioRequest)return;if(ok&&settings.sound&&!document.hidden)await audio.sequence(ordered,{pack});if(request===audioRequest)audioPending=false;});},
    stop:()=>{audioRequest++;audioPending=false;audio.stop();}
  }),profile:()=>playerProfile,room:()=>room,participantId:()=>lobbyParticipantId,roomService:publicRooms,packs,catalog,meta,toast,leaveLobby,renderLobby,openModal,closeModal,modalHead,showSettings,rememberGame});
  let navigation=null;try{navigation=JSON.parse(sessionStorage.getItem('playroom.navigation.v1')||'null');}catch(_){}
  if(navigation?.screen==='table'&&session&&navigation.sessionId===sessionId){
    resumeSession(sessionId);
    if(navigation.viewState&&typeof navigation.viewState==='object'){viewState=navigation.viewState;screenController.viewState=viewState;}
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
