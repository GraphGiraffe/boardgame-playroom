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
  const profileStore=new Multiplayer.ProfileStore(()=>localStorage),roomService=new Multiplayer.RoomService({validateRules:state=>{
    const manifest=packs.list().find(pack=>pack.id===state.game.id&&pack.version===state.game.version)?.manifest;
    if(!manifest)throw Error('PACK_NOT_FOUND');
    return Multiplayer.validateRuleSettings(state.rules,{...manifest,presets:E.get(state.game.id,state.game.version).presets});
  },validateStart:state=>{
    try{
      const seats=state.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index);
      const {players,seatIndices}=PlayroomRooms.sessionSetup(state);
      E.validateState(E.createGame(state.game.id,{...(state.rules.options||{}),players,seatIndices,packVersion:state.game.version,preset:state.rules.preset,openHands:false,seed:1,firstPlayerMode:'assigned',firstPlayer:state.firstPlayerMode==='assigned'?seats.findIndex(s=>s.participantId===state.firstParticipantId):0}));
      return null;
    }catch(_){return globalThis.PlayroomMessages.text('ui.rooms.roster-invalid');}
  }});
  let playerProfile=profileStore.load();
  let profileAvatar=playerProfile?.avatar||null;
  let authority=null,authoritySession=null,localClients=new Map(),commandSequence=0;
  function localAuthority(){
    if(authoritySession!==session){authority?.dispose();authoritySession=session;authority=session?new Authority(session,{clock:globalThis.PlayroomDiagnostics.clock('authority')}):null;localClients=new Map();}
    return authority;
  }
  function localClient(player){
    const executor=localAuthority();
    if(!localClients.has(player)){
      const client=executor.connect(player);localClients.set(player,client);let shown=client.snapshot();
      client.subscribe(next=>{const refresh=next.revision===shown.revision&&(next.controlRevision!==shown.controlRevision||(next.reactionRevision||0)>(shown.reactionRevision||0));shown=next;
        if(refresh)localLegal.delete(player);
        if(refresh)queueMicrotask(()=>{if(localClients.get(player)===client&&viewer===player&&screen==='table'&&!isReplay()&&!transition)renderTable();});});
    }
    return localClients.get(player);
  }
  const packs = globalThis.PlayroomPacks;
  const library = new globalThis.PlayroomLibrary(() => globalThis.PlayroomData, E, Session, packs);
  try { await globalThis.PlayroomPackManager?.reconcile?.(packs,library); }
  catch (error) { globalThis.PlayroomPackLoadError ||= globalThis.PlayroomMessages.error(error) || globalThis.PlayroomMessages.text("ui.app.d95699cb8f67"); }
  const $ = selector => {
    const first=document.querySelector(selector);
    return first?.closest('[data-surface-state="suspended"]')?[...document.querySelectorAll(selector)].find(node=>!node.closest('[data-surface-state="suspended"]'))||null:first;
  };
  let noticeElement=$('#toast');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const GameScreen=globalThis.PlayroomGameScreen,icon=GameScreen.icon;
  const turnNotice=GameScreen.turnNotice({play:()=>{if(settings.sound&&!document.hidden&&!audio.busy)void audio.play('turn',{volume:.45});},reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  let localTutorialContext=null,renderedLocalInputs=null;
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
  // Public strings and scalar layout envelopes only: never retain live forms,
  // projections, permissions or network operations in speculative preparation.
  const panelPreparation=new PlayroomDOM.PreparationCache({limit:12,maxBytes:4*1024*1024});
  const ruleLayoutPreparation=new PlayroomDOM.PreparationCache({limit:192,maxBytes:512*1024});
  let panelAppearance=0;
  const invalidatePanelPreparation=()=>{panelAppearance++;panelPreparation.clear();ruleLayoutPreparation.clear();};
  document.addEventListener('playroom:appearance',invalidatePanelPreparation);
  document.fonts?.addEventListener('loadingdone',invalidatePanelPreparation);
  window.addEventListener('pagehide',invalidatePanelPreparation);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)invalidatePanelPreparation();});
  const panelPackIdentities=new WeakMap();let panelPackSequence=0;
  function publicPanelKey(kind,game,value){const manifest=catalog[game];if(manifest&&!panelPackIdentities.has(manifest))panelPackIdentities.set(manifest,++panelPackSequence);return JSON.stringify([kind,game,meta(game)?.version,manifest?.version,manifest?panelPackIdentities.get(manifest):0,globalThis.PlayroomMessages.locale,document.documentElement.lang,panelAppearance,value]);}
  let preparedPanelSequence=0;
  function instantiatePanelContent(content){
    // Help popovers, tabs and SVG references belong to this opening, including
    // when the same public prototype is used above a retained parent panel.
    const suffix='-prepared-'+(++preparedPanelSequence),ids=new Map(),parts=typeof content==='string'?[content]:Object.values(content);
    for(const html of parts)for(const match of html.matchAll(/\sid=(["'])(.*?)\1/g))if(!/^rulebook-(top|contents|options|section-\d+)$/.test(match[2]))ids.set(match[2],match[2]+suffix);
    const rewrite=html=>html.replace(/(\s(?:id|for|list|form|popovertarget|aria-controls|aria-labelledby|aria-describedby)=)(["'])(.*?)\2/g,(_,attribute,quote,value)=>attribute+quote+value.split(' ').map(id=>ids.get(id)||id).join(' ')+quote).replace(/(\s(?:href|xlink:href)=)(["'])#(.*?)\2/g,(_,attribute,quote,id)=>attribute+quote+'#'+(ids.get(id)||id)+quote).replace(/url\(#([^)]*)\)/g,(_,id)=>'url(#'+(ids.get(id)||id)+')');
    return typeof content==='string'?rewrite(content):Object.fromEntries(Object.entries(content).map(([key,html])=>[key,rewrite(html)]));
  }
  function preparedPanel(key,build){let content=panelPreparation.get(key);if(content===undefined){content=build();panelPreparation.set(key,content);}return instantiatePanelContent(content);}


  const animationPresets=Flow.presets;
  const settingsStore=new globalThis.PlayroomPlayerSettingsStore(()=>localStorage);
  let settings=globalThis.PlayroomPlayerSettings.defaults();
  let viewState = {};
  let session = null, screen = 'hub', selected = null, gate = null, viewer = 0;
  let sessionId = null, hubTab = 'games', savedFilter='all', networkSaved=[], networkSavedState='idle', networkSavedTicket=0;
  let hubEditing=false;
  let completedRoom=null;
  let room=null,lobbyParticipantId=null,lobbyTimer=null,lobbyCountdown=null;
  let historyOpen = false, replayIndex = null, replayTimer = null, botTimer = null, autoPassTimer = null;
  let paused = false, lastResult = null, storageOK = true, modalReturn = null, pendingAction = null, pendingConfirmation = null;
  let missedFrom = null, soundTicket = 0;
  const localReactions=new globalThis.PlayroomQuickReactions.Relay();
  let loadWarning = '', modalBack = null, settingsReturn = null, historyOrigin = null, reactionShownAt = null;
  let input = null, packUI = null, playerTargets = null, feedbackSession = null;
  const presentationExecutor=new globalThis.PlayroomPresentationScheduler(undefined,{diagnostics:globalThis.PlayroomDiagnostics});
  const feedback=new globalThis.PlayroomGameFeedback({fieldChanged:()=>renderTable(),motion:Motion,executor:presentationExecutor,mount:()=>document.querySelector('#app .table-shell'),prepareAudio:context=>prepareGameAudio(context),play:(ids,pack,context)=>{if(settings.sound&&!document.hidden)return globalThis.PlayroomDiagnostics.measure('audio.play',()=>audio.batch(ids,{pack,signal:context?.signal}),{cueCount:ids.length});}});
  let transition = null, replayTicket = 0, replayPaused = false, awaitingPass = false;
  const localPort={get snapshot(){return session?localFrame(session.current,gate!==null?-1:viewer):null;},
    history:index=>localFrame(session.states[index],viewer,[]),
    send(action,{actor=viewer}={}){const client=localClient(actor);return client.dispatch(Protocol.command(client.snapshot(),action,'local-'+(++commandSequence)));}};
  const screenController=new globalThis.PlayroomGameScreenController({client:localPort,report:error=>toast(globalThis.PlayroomMessages.error(error))});
  let projectionOwner=null,projectionState=null,projectionModel=null;const localProjections=new Map(),localLegal=new Map();
  function localProjection(state,shownViewer){
    const model=E.get(session.game,session.packVersion);if(projectionOwner!==session||projectionState!==state||projectionModel!==model){projectionOwner=session;projectionState=state;projectionModel=model;localProjections.clear();localLegal.clear();}
    if(!Object.isFrozen(state))return E.project(state,shownViewer);
    if(!localProjections.has(shownViewer)){const value=E.project(state,shownViewer),freeze=node=>{if(node&&typeof node==='object'&&!Object.isFrozen(node)){Object.values(node).forEach(freeze);Object.freeze(node);}return node;};localProjections.set(shownViewer,freeze(value));}
    return localProjections.get(shownViewer);
  }
  function localFrame(state,shownViewer,actions=[]){return {kind:'snapshot',protocolVersion:3,sessionId:sessionId||String(session.createdAt),authorityEpoch:'local:'+session.createdAt,
    game:session.game,packVersion:session.packVersion,viewer:shownViewer,revision:state.move,historyLength:session.states.length,state:localProjection(state,shownViewer),actions,paused};}

  settings=globalThis.PlayroomPlayerSettings.normalize(settingsStore.read(),{catalog,normalizeScale:globalThis.PlayroomInterfaceScale.normalize,normalizeSpeed:Flow.speed});
  globalThis.PlayroomInterfaceScale.set(settings.interfaceScale);
  function syncDisplayCutout(){globalThis.PlayroomDisplayCutout.apply();requestAnimationFrame(()=>{GameScreen.layoutScene($('#app'));GameScreen.fitGameTitles(document);});}
  syncDisplayCutout();
  const volumeLevels=[0,.3,.6,1],speedLevels=Object.keys(animationPresets);
  const volumeLabels=[globalThis.PlayroomMessages.text('ui.app.volume.mute'),globalThis.PlayroomMessages.text('ui.app.a884586f7f7d'),globalThis.PlayroomMessages.text('ui.app.709ce533ba0a'),globalThis.PlayroomMessages.text('ui.app.251ddcd158f4')];
  try { const saved = library.current(); if (saved) { session = saved.session; sessionId = saved.id; } }
  catch (_) { loadWarning=globalThis.PlayroomMessages.text("ui.app.3f69ce8ef70a"); }
  const audio = new globalThis.TabletopAudio({enabled:settings.sound,volume:settings.volume,diagnostics:globalThis.PlayroomDiagnostics});
  const diagnostics=globalThis.PlayroomDiagnostics;
  diagnostics?.configure({context:()=>({appVersion,game:session?.game||null,packVersion:session?.packVersion||null,revision:session?.current.move??null,historyLength:session?.states.length??null,gameCreatedAt:session?.createdAt??null,scheduler:presentationExecutor.metrics(),geometry:GameScreen.geometryMetrics($('#app')),storagePending:library.storage().pending??null,activeSaveChars:library.storage().getItem('playroom.session.v1')?.length??null,presentationGroup:feedback.player.run?.index??null,presentationPreparing:!!feedback.player.run?.preparing,presentationPaused:!!feedback.player.run?.paused,screen,replay:historyOpen,paused,transition:!!transition,feedbackQueue:feedback.queue.length,feedbackActive:!!feedback.active,audioGroups:audio._groups.size,audioVoices:audio._voices.size,audioWaits:audio._waits.size,audioState:audio._context?.state||'uninitialized',audioPreparing:audio._preparing,soundEnabled:settings.sound,volume:settings.volume,animationSpeed:settings.animationSpeed}),save:async()=>{if(!session||document.querySelector('.network-game'))return null;const exported=await globalThis.PlayroomSaveTransfer.createRecord({session,Session,pack:packs.exportPack(session.game,session.packVersion)});return JSON.parse(exported.text);}});
  let audioRequest=0,audioPending=false;
  const audioVersions = new Map();
  for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
  const unlockAudio = () => {if(settings.sound&&!document.hidden)void diagnostics.measure('audio.unlock',()=>audio.unlock());};
  document.addEventListener('pointerdown',unlockAudio,{capture:true,passive:true});
  document.addEventListener('pointerup',unlockAudio,{capture:true,passive:true});
  document.addEventListener('keydown',unlockAudio,{capture:true});
  document.addEventListener('click',unlockAudio,{capture:true});
  document.addEventListener('touchend',unlockAudio,{capture:true,passive:true});
  function prepareGameAudio(context){audioRequest++;audioPending=false;return settings.sound&&!document.hidden?diagnostics.measure('audio.prepare',()=>audio.prepare({signal:context?.signal})):Promise.resolve(false);}
  const flow=new Flow.GameFlow({executor:presentationExecutor,options:()=>settings,motion:Motion,presentation:()=>({minimumVisibleMs:Flow.viewingTime(catalog[session?.game]?.capabilities,session?E.project(session.current,-1):null)}),reducedMotion:()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  const pace=()=>flow.pace();
  HandOverflow.attach(document);
  const syncReducedMotion=()=>{const reduced=pace().duration===0;document.body.classList.toggle('reduced-motion',reduced);if(reduced)globalThis.PlayroomDOM.clearVisualExits(document);return reduced;};
  syncReducedMotion();
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',syncReducedMotion);
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
      firstPlayerMode:catalog[gameId]?.capabilities?.firstPlayer===false?'rules':['rules','random','assigned'].includes(saved.firstPlayerMode)?saved.firstPlayerMode:'rules',seatOrder:saved.seatOrder==='random'?'random':'normal',openHands:false,options};
    rules.display=Multiplayer.describeRules(rules,fields,false,catalog[gameId]?.presetSetting);
    return rules;
  }
  function rememberRules(gameId,rules){
    try{
      const all=JSON.parse(localStorage.getItem(lastRulesKey)||'{}');
      const saved=all&&typeof all==='object'&&!Array.isArray(all)?all:{};
      saved[gameId]={firstPlayerMode:rules.firstPlayerMode||'rules',seatOrder:rules.seatOrder||'normal',preset:rules.preset,openHands:false,options:rules.options||{}};
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
  function activateSession() { if(session)activatePack(session.game,session.packVersion); }
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
  function dismissNotice(animate=false){clearTimeout(noticeTimer);delete noticeElement.returnFocus;if(animate&&noticeElement.classList.contains('show')){const old=noticeElement;noticeElement=document.createElement('div');noticeElement.id='toast';noticeElement.className='toast';document.body.append(noticeElement);old.removeAttribute('id');old.classList.add('app-notice');globalThis.PlayroomDOM.retireVisual(old,{kind:'banner'});}else{noticeElement.classList.remove('show');noticeElement.textContent='';}}
  new MutationObserver(placeNotice).observe($('#modal-root'),{childList:true,subtree:true});
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;if(event.target.closest('#toast [data-command="dismiss-notice"]')){event.preventDefault();event.stopImmediatePropagation();dismissNotice(true);}},true);
  function toast(message,{action='',label='',polite=false}={}) {
    const alreadyShown=noticeElement.classList.contains('show');
    globalThis.PlayroomDOM.clearVisualExits(document,{kinds:['banner']});clearTimeout(noticeTimer);if(!action)noticeTimer=setTimeout(()=>dismissNotice(true),globalThis.PlayroomSizeCatalogue?.presentation?.interaction.toastMs??6000);
    if(!noticeElement.contains(document.activeElement))noticeElement.returnFocus=document.activeElement;
    const choice=action?GameScreen.button({attrs:`data-command="${esc(action)}"`,label,variant:'outline',className:'app-notice-action'}):'';
    noticeElement.innerHTML=`<span>${esc(message)}</span>${choice}<button class="icon-btn" data-command="dismiss-notice" aria-label="${globalThis.PlayroomMessages.text("ui.app.935e004f83bf")}" title="${globalThis.PlayroomMessages.text("ui.app.935e004f83bf")}">${icon('close')}</button>`;noticeElement.classList.add('show');noticeElement.setAttribute('role',polite?'status':'alert');placeNotice();if(!alreadyShown)globalThis.PlayroomDOM.enterVisual(noticeElement);
  }
  let afterUpdate=null,afterUpdateShowing=false;try{afterUpdate=JSON.parse(sessionStorage.getItem('playroom.after-update.v1')||'null');}catch(_){}
  const installedStateKey='playroom.installed-app-state.v1';
  let installedState=null;try{installedState=JSON.parse(localStorage.getItem(installedStateKey)||'null');if(!afterUpdate&&((installedState?.version&&installedState.version!==appVersion)||!installedState&&(localStorage.getItem('playroom.shown-update.v1')||'').includes('app@'))){afterUpdate={from:installedState?.version||'0.0.0',to:appVersion,releases:globalThis.PlayroomAppReleases||[],packs:installedState?.packs||[]};sessionStorage.setItem('playroom.after-update.v1',JSON.stringify(afterUpdate));}}catch(_){}
  function installedPackRows(){const rows=packs.list();return rows.filter(p=>!rows.some(other=>other.id===p.id&&globalThis.TabletopPacks.compareVersions(other.version,p.version)>0));}
  function rememberInstalledState(){try{localStorage.setItem(installedStateKey,JSON.stringify({version:appVersion,packs:installedPackRows().map(p=>({id:p.id,version:p.version}))}));}catch(_){}}
  let shownUpdateKey='';
  try{shownUpdateKey=localStorage.getItem('playroom.shown-update.v1')||'';}catch(_){}
  function updateIdle(){return screen==='hub'&&!room&&!transition&&!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()&&storageOK&&!globalThis.PlayroomData.pending;}
  globalThis.PlayroomPWA?.setUpdateGuard(()=>updateIdle()&&(!$('#modal-root').children.length||!!$('#modal-root .updates-modal')));
  const unifiedCleanup=new globalThis.PlayroomPackUpdateCleanup({manager:packs,localReferences:(id,version)=>{if(library.list().some(row=>row.invalid))throw Error('SAVED_ARCHIVE_UNREADABLE');return library.references(id,version);},networkArchives:()=>globalThis.PlayroomNetworkLibrary.list({strict:true}),activeRoom:()=>!!room||!!globalThis.PlayroomNetworkLibrary.hasActiveRoom?.(),compare:globalThis.TabletopPacks.compareVersions});
  const unifiedUpdate=new globalThis.PlayroomUpdateAll({storage:localStorage,manager:packs,remote:globalThis.PlayroomRemotePacks,cleanup:unifiedCleanup,version:()=>appVersion,idle:()=>screen==='hub'&&!room&&!transition&&storageOK&&!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.(),settle:()=>globalThis.PlayroomData.queue,app:()=>globalThis.PlayroomPWA,progress:message=>{const status=$('[data-update-status]');if(status)status.textContent=message;}});
  function releaseUnusedUpdateLobby(){
    // A dismissed local setup has no game to save and no remote participants.
    // Retire it only on the user's update action, never during an idle check.
    if(screen!=='hub'||transition||!storageOK||globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()||!room)return;
    if($('#modal-root>[data-surface-state=active] .room-setup-modal,#modal-root>[data-surface-state=suspended] .room-setup-modal'))return;
    const state=roomService.snapshot(room.id);
    if(state.transportMode!=='hotseat'||state.phase!=='lobby'||state.recovery)return;
    roomService.discardRecovery(state.id);autoStartUnsub?.();autoStartUnsub=null;autoStartRoom=null;
    room=null;lobbyParticipantId=null;clearInterval(lobbyTimer);lobbyTimer=null;lobbyCountdown=null;
    $('#app [data-command="room"]')?.remove();
  }
  async function updateEverything(start=false){
    if(globalThis.PlayroomUnifiedUpdateBusy)return;globalThis.PlayroomUnifiedUpdateBusy=true;const button=$('[data-command="update-all"]');if(button)button.disabled=true;
    try{if(start)releaseUnusedUpdateLobby();const result=await unifiedUpdate.run(start);if(result&&!result.reloading){rememberInstalledState();if(afterUpdate){closeModal(true);await showAfterUpdate();}else{closeModal(true);renderHub();toast('Приложение и игры обновлены.',{polite:true});}}return result;}
    catch(error){const message=globalThis.PlayroomMessages.error(error),status=$('[data-update-status]');if(status)status.textContent=message;else toast('Обновление приостановлено. '+message,{action:'show-updates',label:'Продолжить'});}
    finally{globalThis.PlayroomUnifiedUpdateBusy=false;if(button)button.disabled=false;}
  }
  function showUpdates(force=false,notice=null){
    const existing=localModal.activeRoot()?.querySelector('.updates-modal');
    if(!force&&(screen!=='hub'||!updateIdle()||document.hidden||$('#modal-root').children.length))return false;
    const app=globalThis.PlayroomPWA?.updateInfo,items=packUpdates();
    for(const item of app?.packs||[]){const installed=packs.list().filter(p=>p.id===item.id).sort((a,b)=>globalThis.TabletopPacks.compareVersions(b.version,a.version))[0];if(installed&&globalThis.TabletopPacks.compareVersions(item.version,installed.version)>0&&!items.some(p=>p.id===item.id))items.push({...item,bundled:true});}
    const key=[app?'app@'+(app.cache||app.version||'pending'):'',...items.map(updateKey)].join('|');
    const fresh=items.some(item=>!packNotices.dismissed.includes(updateKey(item)));
    if(!force&&(!app&&!items.length&&!notice||key===shownUpdateKey||!app&&!fresh))return false;
    if(!force&&noticeElement.classList.contains('show')&&!noticeElement.querySelector('[data-command="show-updates"]'))return false;
    shownUpdateKey=key;try{localStorage.setItem('playroom.shown-update.v1',key);}catch(_){}
    rememberPackUpdates('dismissed');
    if(!force){toast('Доступно обновление',{action:'show-updates',label:'Открыть',polite:true});return true;}
    const important=notice||existing?.updateNotice||null,check=existing?.updateCheck||null;
    const markup=globalThis.PlayroomUpdateDialog.markup({app,installedVersion:appVersion,resume:!!unifiedUpdate.pending(),packs:items.map(item=>({...item,name:meta(item.id)?.name||item.id})),installed:id=>packs.list().filter(p=>p.id===id).sort((a,b)=>globalThis.TabletopPacks.compareVersions(b.version,a.version))[0]?.version||'0.0.0',esc,head:modalHead,notice:important,check,cover:id=>V.cover?.(id)||''});
    const modal=existing||(openModal(markup,'updates-modal',{onDispose:(_reason,handle)=>handle.element.querySelector('.updates-modal')?.updateCheckCancel?.()})?.element.querySelector('.updates-modal'));
    if(existing)GameScreen.updateModal(existing,markup);
    if(modal){modal.updateNotice=important;modal.updateCheck=check;}
    globalThis.PlayroomUpdateDialog.sync();return true;
  }
  async function showAfterUpdate(receipt=afterUpdate){
    if(!receipt||afterUpdateShowing||unifiedUpdate.pending()||!updateIdle()||document.hidden||$('#modal-root').children.length||receipt.to!==appVersion)return false;
    afterUpdateShowing=true;
    const rows=installedPackRows(),before=new Map((receipt.packs||[]).map(p=>[p.id,p.version]));
    const changed=rows.filter(p=>before.get(p.id)!==p.version);
    const changes=globalThis.PlayroomUpdateDialog.changes(receipt.releases||[],receipt.from||'0.0.0',appVersion,esc);
    const cards=changed.map(p=>`<article class="post-update-pack"><div class="post-update-cover">${V.cover?.(p.id)||''}</div><div><h3>${esc(p.manifest.name||p.id)} · ${esc(p.version)}</h3><ul>${(globalThis.PlayroomUpdateDialog.releases(p.manifest.releases||[],'0.0.0',p.version).at(-1)?.changes||['Обновлена версия игрового пака.']).map(line=>`<li>${esc(line)}</li>`).join('')}</ul></div></article>`).join('');
    const acknowledge=()=>{afterUpdateShowing=false;if(receipt===afterUpdate){afterUpdate=null;try{sessionStorage.removeItem('playroom.after-update.v1');}catch(_){}}};
    const handle=openModal(`${modalHead('ХОД обновлён')}<div class="post-update"><p>Установлена версия ${esc(appVersion)}.</p>${`<section data-installed-changes><h3>Что нового</h3>${changes}</section>`}${cards?`<section data-updated-pack-cards><h3>Обновлённые игры</h3>${cards}</section>`:''}<section data-cleanup-plan><h3>Старые версии игр</h3><p data-cleanup-description role="status">Проверяем, какие версии больше не используются…</p><div data-cleanup-items></div></section></div><footer class="modal-foot" data-fixed-footer><button type="button" class="btn secondary" data-post-update-done>Готово</button><button type="button" class="btn" data-post-update-cleanup hidden disabled aria-label="Удалить старые версии игр">Очистить</button></footer>`,'post-update-modal',{onDispose:acknowledge});
    if(!handle){acknowledge();return false;}const element=handle.element,status=element.querySelector('[data-cleanup-description]'),button=element.querySelector('[data-post-update-cleanup]');
    const cleanup=new globalThis.PlayroomPackUpdateCleanup({manager:packs,localReferences:(id,version)=>{if(library.list().some(entry=>entry.invalid))throw Error('SAVED_ARCHIVE_UNREADABLE');return library.references(id,version);},networkArchives:()=>globalThis.PlayroomNetworkLibrary.list({strict:true}),activeRoom:()=>!!room||!!globalThis.PlayroomNetworkLibrary.hasActiveRoom?.(),compare:globalThis.TabletopPacks.compareVersions});
    const guard=()=>{if(handle.state!=='active'||screen!=='hub'||room||transition||!storageOK||globalThis.PlayroomNetworkLibrary.hasActiveRoom?.())throw Object.assign(Error('CLEANUP_CHANGED'),{code:'cancelled'});};let plan=null,busy=false;
    element.querySelector('[data-post-update-done]').onclick=()=>{if(!busy)closeModal(true);};
    const inspect=async()=>{button.disabled=true;try{plan=await cleanup.plan({guard});guard();status.textContent=plan.blocked?'Проверка доступна после выхода из комнаты.':plan.items.length?'Можно удалить перечисленные версии. Версии для сохранённых партий и активные паки останутся.':'Неиспользуемых версий для удаления нет.';element.querySelector('[data-cleanup-items]').innerHTML=(plan.items.length?`<ul>${plan.items.map(p=>`<li>${esc(p.name)} · ${esc(p.version)} · ${p.kind==='old'?'старая версия':'несовместимый пак'}</li>`).join('')}</ul>`:'')+(plan.retained.length?`<p class="muted">Сохранены для партий: ${plan.retained.length}.</p>`:'');button.hidden=!plan.items.length;button.disabled=plan.blocked;button.textContent='Очистить';button.setAttribute('aria-label','Удалить старые версии игр');}catch(error){if(handle.state==='active'){status.textContent='Не удалось проверить сохранения. Паки не удалены. Повторите проверку.';button.textContent='Повторить';button.setAttribute('aria-label','Повторить проверку старых версий');button.hidden=false;button.disabled=false;plan=null;}}};
    button.onclick=async()=>{if(busy)return;if(!plan){await inspect();return;}busy=true;button.disabled=true;element.querySelector('[data-post-update-done]').disabled=true;try{await cleanup.removeUnused(plan,{guard});guard();closeModal(true);}catch(error){if(handle.state==='active')status.textContent='Очистка не завершена. Используемые версии сохранены; повторите проверку.';}finally{busy=false;if(handle.state==='active'){element.querySelector('[data-post-update-done]').disabled=false;button.disabled=false;}}};
    await inspect();return true;
  }
  async function checkUpdates(){
    const modal=localModal.activeRoot()?.querySelector('.updates-modal');if(!modal||modal.updateCheck?.busy)return;
    const operation=captureUIOperation(),state={busy:true,error:false,message:'Проверяем обновления…'};modal.updateCheck=state;showUpdates(true);
    const abort=new AbortController();let timer,expire;
    const deadline=new Promise(resolve=>{expire=()=>{abort.abort();resolve(null);};timer=setTimeout(expire,15000);});
    const cancel=()=>{clearTimeout(timer);expire();};modal.updateCheckCancel=cancel;
    const results=await Promise.race([Promise.allSettled([Promise.resolve().then(()=>globalThis.PlayroomPWA.checkForUpdate()),Promise.resolve().then(()=>globalThis.PlayroomRemotePacks.load({signal:abort.signal}))]),deadline]);
    clearTimeout(timer);if(modal.updateCheckCancel===cancel)delete modal.updateCheckCancel;
    if(!operation.current()||localModal.activeRoot()?.querySelector('.updates-modal')!==modal)return;
    state.busy=false;
    if(!results){state.error=true;state.message='Проверка заняла слишком много времени. Повторите её.';showUpdates(true);return;}
    const appFailure=results[0].status==='rejected',packFailure=results[1].status==='rejected'||!!globalThis.PlayroomRemotePacks.warning;
    if(appFailure||packFailure){
      state.error=true;
      const appStatus=appFailure?(results[0].reason?.code==='offline'?'Приложение: Нет сети. Подключитесь и повторите проверку.':results[0].reason?.code==='unavailable'?'Проверка приложения недоступна в этом браузере.':'Не удалось проверить обновление приложения. Повторите проверку.'):globalThis.PlayroomPWA.updateInfo?'Найдено обновление приложения.':'Приложение актуально.';
      const packStatus=packFailure?'Не удалось проверить обновления игр: каталог недоступен. Повторите проверку.':packUpdates().length?'Найдены обновления игр.':'Обновления игр проверены.';
      state.message=appStatus+' '+packStatus;
    }
    else state.message=globalThis.PlayroomPWA.updateInfo||packUpdates().length?'Найдены новые обновления.':'Новых обновлений не найдено.';
    showUpdates(true);
  }
  globalThis.PlayroomHubAction.mount({hasUpdates:()=>!!globalThis.PlayroomPWA?.updateInfo||packUpdates().length>0,report:error=>toast(globalThis.PlayroomMessages.error(error))});
  window.addEventListener('playroom-update-ready',()=>showUpdates(!!localModal.activeRoot()?.querySelector('.updates-modal')));
  // Observe screen/dialog transitions, not game frames or a recurring timer.
  window.addEventListener('playroom:hub-rendered',()=>queueMicrotask(()=>{void showAfterUpdate();showUpdates();}));
  new MutationObserver(()=>{void showAfterUpdate();showUpdates();}).observe($('#modal-root'),{childList:true});
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
    const diagnosticStart=diagnostics?.begin()??null;
    try { await library.writeAsync(session,sessionId); storageOK = true; loadWarning=''; globalThis.PlayroomCloudSavesUI?.saved('local:'+sessionId,{finished:session.current.status==='finished',menu:screen==='hub'});return true; }
    catch (error) { return reportSaveFailure(error); }
    finally {diagnostics?.end('save',diagnosticStart,{revision:session?.current.move});}
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
  function stopSounds() {soundTicket++;audioRequest++;audioPending=false;audio.stop();}
  function cancelBot() { clearTimeout(botTimer); botTimer=null; authority?.cancelBot(); }
  function clearViewHints(){const changed=Object.hasOwn(viewState,'hint')||Object.hasOwn(screenController.viewState,'hint');delete viewState.hint;delete screenController.viewState.hint;return changed;}
  function setLocalPaused(value){
    diagnostics?.record('game.pause',{paused:!!value,revision:session?.current.move});
    if(value)clearViewHints();
    paused=value;clearTimeout(autoPassTimer);autoPassTimer=null;reactionShownAt=null;
    if(!session||historyOrigin?.kind==='library')return;
    const player=session.current.players.findIndex(p=>!p.bot);if(player<0)return;
    const client=localClient(player),snapshot=client.snapshot();if(snapshot.paused===value)return;
    void Promise.resolve(client.dispatch(Protocol.command(snapshot,{type:'session-pause',paused:value,expectedControlRevision:snapshot.controlRevision},'local-control-'+(++commandSequence)))).then(receipt=>{if(!receipt.ok)toast(receipt.message);}).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
  }
  function stopReplay(stopAudio=true) { replayPaused=false;globalThis.PlayroomPublicSequence?.setMode($('#app'),'still');clearTimeout(replayTimer); replayTimer=null;replayTicket++;feedback.clear();flow.cancel();if(stopAudio)stopSounds(); }
  const {orderedVisibleGames,tile,recentGameCard,hubFilterMarkup,showCatalogFilters,renderHub:renderHubSurface,moveHubGame,editHubStep,hubDropAt,savedGamesMarkup,refreshNetworkSaved,updateSavedPanel}=globalThis.PlayroomHubPresenter.create({get settings(){return settings;},get $(){return $;},set $(value){$=value;},get E(){return E;},set E(value){E=value;},get GameScreen(){return GameScreen;},set GameScreen(value){GameScreen=value;},get Tags(){return Tags;},set Tags(value){Tags=value;},get V(){return V;},set V(value){V=value;},get appVersion(){return appVersion;},set appVersion(value){appVersion=value;},get brand(){return brand;},set brand(value){brand=value;},get cancelBot(){return cancelBot;},get catalog(){return catalog;},set catalog(value){catalog=value;},get esc(){return esc;},set esc(value){esc=value;},get feedback(){return feedback;},set feedback(value){feedback=value;},get flashPacksOnHub(){return flashPacksOnHub;},set flashPacksOnHub(value){flashPacksOnHub=value;},get hubEditing(){return hubEditing;},set hubEditing(value){hubEditing=value;},get hubFilters(){return hubFilters;},set hubFilters(value){hubFilters=value;},get hubTab(){return hubTab;},set hubTab(value){hubTab=value;},get icon(){return icon;},set icon(value){icon=value;},get input(){return input;},set input(value){input=value;},get interruptAction(){return interruptAction;},get isPass(){return isPass;},set isPass(value){isPass=value;},get latestPacks(){return latestPacks;},get library(){return library;},set library(value){library=value;},get loadWarning(){return loadWarning;},set loadWarning(value){loadWarning=value;},get meta(){return meta;},set meta(value){meta=value;},get networkSaved(){return networkSaved;},set networkSaved(value){networkSaved=value;},get networkSavedState(){return networkSavedState;},set networkSavedState(value){networkSavedState=value;},get networkSavedTicket(){return networkSavedTicket;},set networkSavedTicket(value){networkSavedTicket=value;},get packNotices(){return packNotices;},set packNotices(value){packNotices=value;},get packUpdates(){return packUpdates;},get playerTargets(){return playerTargets;},set playerTargets(value){playerTargets=value;},get savedFilter(){return savedFilter;},set savedFilter(value){savedFilter=value;},get screen(){return screen;},set screen(value){screen=value;},get session(){return session;},set session(value){session=value;},get localResumeVisible(){return settings.hiddenLocalSession!==sessionId;},get updateKey(){return updateKey;},set updateKey(value){updateKey=value;}});
  function renderHub(...args){localTutorialContext=null;renderedLocalInputs=null;return renderHubSurface(...args);}











  function leaveTable(tab='games') {
    if(historyOrigin)restoreHistoryOrigin();
    clearTimeout(autoPassTimer);autoPassTimer=null;
    interruptAction();input?.cancel();playerTargets?.cancel();cancelBot();stopReplay();
    if(screen==='table')save();
    if(room?.transportMode==='hotseat'){roomService.discardRecovery(room.id);room=null;lobbyParticipantId=null;}
    screen='hub';hubTab=tab;Object.assign(hubFilters,{type:'',mechanic:'',format:''});historyOpen=false;replayIndex=null;selected=null;paused=true;
    closeModal(true);flashPacksOnHub=true;render();refreshPackUpdates();
  }
  async function resumeSession(id=sessionId,{history=false,results=false}={}) {
    if(!history&&!results&&globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text("ui.app.ed9bf8ddc81a"));
    if(!id)return toast(globalThis.PlayroomMessages.text("ui.app.34c23d3e2ac3"));
    try {
      if(history||results){openLibraryHistory(id,{results});return;}
      interruptAction();input?.cancel();cancelBot();stopReplay();
      if(id!==sessionId) {
        if(!await save())return;
        const next=library.open(id);await library.activateAsync(next,id);session=next;sessionId=id;storageOK=true;
      }
      if(!session)return;
      await library.setArchivedAsync('local:'+id,false);
      diagnostics?.record('session.resume',{revision:session.current.move});
      activateSession();restoreSessionLobby();
      rememberGame(session.game);
      screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;awaitingPass=false;lastResult=null;missedFrom=null;
      viewer=isPass()&&!session.current.players[session.current.turn]?.bot?session.current.turn:session.current.players.findIndex(p=>!p.bot);gate=needsGate(session.current)?viewer:null;
      globalThis.PlayroomPublicSequence?.useExecutor($('#app'),flow.executor);
      globalThis.PlayroomPublicSequence?.setBaseline($('#app'),localProjection(session.current,viewer).scene?.plan?.id);
      setLocalPaused(false);closeModal(true);render();
      if(session.current.status==='finished')showResult();
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
      let draft=roomService.create({transportMode:'hotseat',name:session.options.portableRoomName||settings.lastRoomName||globalThis.PlayroomMessages.text("ui.app.499f4549c0b2",{p0:String(host.nickname)}),host,game:{id:session.game,name:g.name,version:session.packVersion,...(g.botSettings?{botSettings:g.botSettings}:{})},rules:{preset:session.options.preset,presetLabel:session.options.presetLabel,openHands:!!session.options.openHands,options:Object.fromEntries((catalog[session.game]?.settings||[]).map(field=>[field.key,session.options[field.key]??field.default]))},constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
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
    lobbyParticipantId=room.ownerId;if(session.current.status==='finished')completedRoom={roomId:room.id,session};
  }
  function askDelete(id) {
    const entry=library.list().find(entry=>entry.id===id);if(!entry)return;
    const operation=captureUIOperation();openModal(PlayroomGameScreen.deleteConfirmation({name:entry.invalid?globalThis.PlayroomMessages.text("ui.app.02c17edea60f"):meta(entry.game)?.name||entry.game,confirmAttrs:`data-delete-confirm="${esc(id)}"`}), '', {valid:()=>operation.current({retained:true})});
  }
  function refreshSavedGameRecovery(){
    if(session&&library.currentId()===sessionId){loadWarning='';return;}
    try{
      const saved=library.current();
      if(saved&&!session){session=saved.session;sessionId=saved.id;}
      loadWarning='';
    }catch(_){
      loadWarning=globalThis.PlayroomMessages.text("ui.app.3f69ce8ef70a");
    }
  }
  function savedInUse(key){if(key.startsWith('network:'))return globalThis.PlayroomNetworkLibrary.inUse(key.slice(8));return key==='local:'+sessionId&&(screen==='table'||room?.transportMode==='hotseat'&&room.phase==='playing'||historyOrigin?.kind==='library');}
  async function replaceSavedLocal(id,next,roomName,guard=()=>{}){const check=()=>{guard();if(savedInUse('local:'+id))throw Object.assign(Error('SAVE_IN_USE'),{code:'SAVE_IN_USE'});};check();await library.replaceAsync(next,id,roomName,{guard:check});if(sessionId===id){session=next;renderedLocalInputs=null;localTutorialContext=null;}window.dispatchEvent(new Event('playroom:save-library-changed'));}
  async function removeSavedDevice(key,guard=()=>{}){const check=()=>{guard();if(savedInUse(key))throw Object.assign(Error('SAVE_IN_USE'),{code:'SAVE_IN_USE'});};check();if(key.startsWith('network:'))await globalThis.PlayroomNetworkLibrary.remove(key.slice(8),{guard:check});else{await library.removeAsync(key.slice(6),{guard:check});if(key==='local:'+sessionId)clearDeletedSession();}window.dispatchEvent(new Event('playroom:save-library-changed'));}
  const archivingSaves=new Set();
  async function archiveSaved(key){
    if(archivingSaves.has(key))return;archivingSaves.add(key);
    try{
      if(key.startsWith('network:'))await globalThis.PlayroomNetworkLibrary.stopSaved(key.slice(8));
      else if(key==='local:'+sessionId){if(!await save())return;interruptAction();cancelBot();stopReplay();setLocalPaused(true);gate=null;awaitingPass=false;if(room?.transportMode==='hotseat'&&room.phase==='playing')room=roomService.returnToLobby(room.id,lobbyParticipantId,{stopped:true});}
      await library.setArchivedAsync(key,true);closeModal(true);screen='hub';hubTab='sessions';renderHub();window.dispatchEvent(new Event('playroom:save-library-changed'));
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}finally{archivingSaves.delete(key);}
  }
  async function deleteNetworkSession(id){
    const operation=captureUIOperation({account:true});let changed=false;
    try{operation.guard();await globalThis.PlayroomNetworkLibrary.remove(id,{guard:operation.guard});changed=true;operation.guard();storageMutationFinished(operation);}
    catch(error){if(operation.current()&&error.code!=='cancelled')toast(globalThis.PlayroomMessages.error(error));}
    finally{if(changed)window.dispatchEvent(new Event('playroom:save-library-changed'));}
  }
  function askDeleteNetwork(id){
    const entry=networkSaved.find(entry=>(entry.role==='client'?'client:'+entry.id:entry.sessionId)===id);if(!entry)return;
    const operation=captureUIOperation({account:true});openModal(PlayroomGameScreen.deleteConfirmation({name:meta(entry.game)?.name||entry.game||globalThis.PlayroomMessages.text("ui.app.02c17edea60f"),network:true,confirmAttrs:`data-delete-network-confirm="${esc(id)}"`}), '', {valid:()=>operation.current({retained:true})});
  }
  async function deleteSession(id) {
    const operation=captureUIOperation();let changed=false;
    try {
      operation.guard();if(savedInUse('local:'+id))throw Object.assign(Error('SAVE_IN_USE'),{code:'SAVE_IN_USE'});await library.removeAsync(id,{guard:operation.guard});changed=true;operation.guard();
      if(packs?.warnings?.some(warning=>/^Встроенный пакет /.test(warning))&&!room&&!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()) {
        try {await globalThis.PlayroomPackManager?.reconcile?.(packs,library);operation.guard();for(const [packId,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(packId,pack.sounds);}
        catch(error){if(error.code==='cancelled')throw error;globalThis.PlayroomPackLoadError=globalThis.PlayroomMessages.error(error)||globalThis.PlayroomMessages.text("ui.app.36788568657c");}
      }
      operation.guard();storageMutationFinished(operation);
    }catch(error){if(operation.current()&&error.code!=='cancelled')toast(globalThis.PlayroomMessages.text("ui.app.f148bfcf7409"));}
    finally{if(changed)window.dispatchEvent(new Event('playroom:save-library-changed'));}
  }
  function clearDeletedSession(){
    if(sessionId&&library.records().some(record=>record.id===sessionId))return;
    interruptAction();cancelBot();stopReplay();localTutorialContext=null;renderedLocalInputs=null;session=null;sessionId=null;selected=null;gate=null;lastResult=null;missedFrom=null;awaitingPass=false;
    refreshSavedGameRecovery();
  }
  async function askClearGames(){
    const operation=captureUIOperation({account:true});
    try{
      const local=library.records().map(record=>record.id),network=await globalThis.PlayroomNetworkLibrary.list({strict:true});operation.guard();
      const hasRoom=!!room||globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.(),cloud=globalThis.PlayroomCloudSavesUI?.service;
      openModal(`${modalHead('Удалить все партии')}<div class="saved-clear-options">${GameScreen.button({attrs:'data-clear-cloud-games',icon:'trash',label:'Облако',variant:'danger',disabled:!cloud?.user})}${GameScreen.button({attrs:'data-clear-games-confirm',icon:'trash',label:'Устройство',variant:'danger',disabled:(!local.length&&!network.length)||hasRoom})}</div>`,'saved-clear-modal',{valid:()=>operation.current({retained:true})});
    }catch(error){if(operation.current()&&error.code!=='cancelled')toast(globalThis.PlayroomMessages.error(error));}
  }
  async function askClearLocalGames(){
    if(room||globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text('ui.app.8f8a5c5c96ff'));
    const operation=captureUIOperation({idle:true,account:true}),local=library.records().map(record=>record.id);
    try{
      const network=(await globalThis.PlayroomNetworkLibrary.list({strict:true})).map(entry=>entry.role==='client'?'client:'+entry.id:entry.sessionId);operation.guard();
      if(!await GameScreen.confirmDialog('Удалить все партии на устройстве? Облачные копии останутся.',{isCurrent:()=>operation.current({retained:true})}))return;
      operation.guard();await clearGames({local,network,operation});
    }catch(error){if(operation.current()&&error.code!=='cancelled')toast(globalThis.PlayroomMessages.error(error));}
  }
  async function clearGames({local,network,operation}){
    let changed=false;try{
      for(const id of network){operation.guard();await globalThis.PlayroomNetworkLibrary.remove(id,{guard:operation.guard});changed=true;operation.guard();}
      for(const id of local){operation.guard();if(savedInUse('local:'+id))throw Object.assign(Error('SAVE_IN_USE'),{code:'SAVE_IN_USE'});await library.removeAsync(id,{guard:operation.guard});changed=true;operation.guard();}
      storageMutationFinished(operation);
    }catch(error){if(operation.current()&&error.code!=='cancelled')toast(globalThis.PlayroomMessages.text("ui.app.969afd6c7829",{p0:String(globalThis.PlayroomMessages.error(error))}));}
    finally{if(changed)window.dispatchEvent(new Event('playroom:save-library-changed'));}
  }
  function activeActions(state) {
    if (isReplay()||gate!==null||paused||state.status==='finished'||state.players[viewer]?.bot) return [];
    localProjection(state,viewer);if(!localLegal.has(viewer)||!Object.isFrozen(state))localLegal.set(viewer,localClient(viewer).snapshot().actions);const actions=localLegal.get(viewer);return transition||awaitingPass&&!E.decisionWindow?.(state)?actions.filter(action=>E.reactions?.(state,viewer).some(reaction=>Protocol.canonical(reaction)===Protocol.canonical((({disabled,...command})=>command)(action)))):actions;
  }
  function playersMarkup(state,actions=[]) {
    return GameScreen.playersMarkup(state,viewer,actions,{scoreLabel:meta(session.game).scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee"),playerBadge:(projected,i)=>catalog[projected.game]?.playerBadge?.(projected,i)});
  }
  function updateLocalTutorialReadiness(context=localTutorialContext){
    if(!context)return;
    localTutorialContext=context;
    const replay=isReplay();
    globalThis.PlayroomFirstTurnGuide.update({...context,busy:!!transition||!!feedback.active||feedback.queue.length>0,active:!paused&&gate===null&&!replay,replay});
  }
  function localInputsCurrent(){
    if(!session||!renderedLocalInputs)return false;
    const state=currentState(),last=renderedLocalInputs,keys=Object.keys(viewState);
    return Object.isFrozen(state)&&last.owner===session&&last.state===state&&last.viewer===(gate!==null?-1:viewer)&&last.replayIndex===replayIndex&&last.historyOpen===historyOpen&&last.paused===paused&&last.gate===gate&&last.awaitingPass===awaitingPass&&last.saved===storageOK&&last.selected===selected&&last.view===V.get(session.game)&&last.catalog===catalog[session.game]&&!transition&&!feedback.active&&!feedback.queue.length&&keys.length===Object.keys(last.viewState).length&&keys.every(key=>{const value=viewState[key];return (value===null||!['object','function'].includes(typeof value))&&value===last.viewState[key];});
  }
  function renderTable(animate=false,preserveField=false,preserveLayout=false) {
    const diagnosticStart=diagnostics?.begin()??null;
    if (!session) return renderHub();
    activateSession();
    const state=currentState(), game=meta(session.game), replay=isReplay(), actions=activeActions(state), passProtected=handoffDelay()>0;
    const shownViewer=gate!==null?-1:viewer,frame=localFrame(state,shownViewer,actions),projected={...frame.state};
    screenController.history.receive(state===session.current?frame:localFrame(session.current,shownViewer));
    screenController.history.open=historyOpen;
    if(replay)screenController.history.select(replayIndex,frame);
    screenController.selection=selected;
    const context=screenController.context(frame,{scope:catalog[state.game]?.capabilities?.viewStateScope});
    selected=context.selected;viewState=context.viewState;

    feedback.renderField=scene=>V.renderField(projected,shownViewer,scene,{renderOwner:session,viewState,presentationTurn:transition?.beforeTurn??(replay?session.states[replayIndex-1]?.turn:undefined),preferences:screenController.preferences(TabletopUI.viewPreferences(state.game,shownViewer)),flipped:shownViewer===1});
    const setup=session.options.lobbyConfig;
    const occupied=setup?.seats.filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index);
    const primary=setup?occupied.findIndex(seat=>seat.participantId===setup.ownerId):projected.players.findIndex(p=>!p.bot);
    projected.players=projected.players.map((p,index)=>({...p,local:!p.bot&&index!==primary}));
    if(feedbackSession!==session){feedbackSession=session;feedback.start(state===session.current&&shownViewer===viewer?projected.events:E.project(session.current,viewer).events);}
    const turnPlayer=state.players[state.turn], finished=state.status==='finished';
    const turnText=replay?globalThis.PlayroomMessages.text("ui.app.a92c2f3c7ff1"):transition?globalThis.PlayroomMessages.text("ui.app.fadac501dd8a"):finished?globalThis.PlayroomMessages.text("ui.app.64f3ad19b9c6"):paused?globalThis.PlayroomMessages.text("ui.app.65530fd463ea"):turnPlayer?.bot?globalThis.PlayroomMessages.text("ui.app.f96994dfc267",{p0:String(turnPlayer.name)}):isPass()?globalThis.PlayroomMessages.text("ui.app.6e352d281a89",{p0:String(turnPlayer?.name)}):globalThis.PlayroomMessages.text("ui.app.12d5fb57ada4");
    const oldHand=$('.hand-track, .hand-cards, .hand-scroll'); const scrollLeft=oldHand?.scrollLeft||0;
    const eventText=replay&&replayIndex===0?globalThis.PlayroomMessages.text("ui.app.03f70ecc37a6"):lastEvent(projected)?.text||globalThis.PlayroomMessages.text("ui.app.bcb4a1cfa013");
    const regionSink=new Map();
    const markup=GameScreen.render({fragmentSink:regionSink,
      layoutId:sessionId||session.createdAt,gameName:historyOpen?'История партии':game.name,subtitle:Multiplayer.presetLabel(session.current.preset,game,catalog[session.game]?.presetSetting),
      state:projected,viewer:shownViewer,actions,scoreLabel:game.scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee"),
      playerBadge:(visible,i)=>catalog[visible.game]?.playerBadge?.(visible,i),
      turnText:game.max===1?'':turnText,turnExtra:game.max===1||replay?'':globalThis.PlayroomMessages.text("ui.app.e954f44bf49a",{p0:String(state.move+1),p1:String(!state.data.hands&&!E.decisionWindow?.(state)?'':'')}),
      replay,busy:!!transition,botThinking:!replay&&!!turnPlayer?.bot,animationSpeed:settings.animationSpeed,
      scene:V.render(projected,shownViewer,actions,{renderOwner:session,regionSink,displayScene:feedback.displayScene,fieldScene:feedback.fieldScene,selected,viewState,replay,hotseat:isPass(),presentationTurn:transition?.beforeTurn??(replay?session.states[replayIndex-1]?.turn:undefined),preferences:screenController.preferences(TabletopUI.viewPreferences(state.game,shownViewer)),flipped:shownViewer===1,quickPlay:settings.quickPlay})+(paused&&!replay?`<div class="pause-cover"><h2>${globalThis.PlayroomMessages.text("ui.app.6f02551279d4")}</h2><p>${globalThis.PlayroomMessages.text("ui.app.63b894bbd7b4")}</p><button class="btn" data-command="pause">${icon('play')}${globalThis.PlayroomMessages.text("ui.app.558521e805d1")}</button></div>`:''),
      historyHTML:historyOpen?historyMarkup():'',historyCaption:eventText,historyResult:session.current.status==='finished',extraMenuActions:room&&session.current.status!=='finished'&&!replay?[{attrs:'data-command="stop-local-match"',label:'Остановить партию',name:'stop'}]:[],roomAction:room?{attrs:'data-command="room"'}:null,pause:paused,readOnly:historyOrigin?.kind==='library',
      beforeFooter:isPass()&&!autoPassForViewer()&&!replay&&!finished?GameScreen.iconButton('data-command="pass-device"',globalThis.PlayroomMessages.text("ui.app.9e49bec43037"),'arrow',{className:'pass-device-button'+(awaitingPass&&!paused&&!transition&&!passProtected?' handoff-pending':''),disabled:!awaitingPass||!!transition||paused||gate!==null||passProtected}):'',
      footerText:eventText,footerTitle:lastEvent(projected)?.text||globalThis.PlayroomMessages.text("ui.app.efcdf40bd477"),saved:storageOK,
      footerAction:{command:finished?'result':'pause',label:finished?globalThis.PlayroomMessages.text("ui.app.24735a7161d9"):paused?globalThis.PlayroomMessages.text("ui.app.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.app.65530fd463ea"),icon:finished?'arrow':paused?'play':'pause'}
    });
    globalThis.PlayroomPublicSequence?.setMode($('#app'),replay?(replayPaused?'pause':replayTimer?'play':'still'):'live');
    const keptLayout=GameScreen.update($('#app'),markup,{preserveLayout,fragments:regionSink});
    renderedLocalInputs={owner:session,state,viewer:shownViewer,replayIndex,historyOpen,paused,gate,awaitingPass,saved:storageOK,selected,view:V.get(session.game),catalog:catalog[session.game],viewState:{...viewState}};
    const newHand=$('.hand-track, .hand-cards, .hand-scroll'); if(newHand)newHand.scrollLeft=scrollLeft;
    if(!keptLayout)HandOverflow.sync($('#app'));
    ensureRoomButton();globalThis.PlayroomPublicSequence?.useExecutor($('#app'),flow.executor);if(!keptLayout)GameScreen.layoutScene($('#app'));
    feedback.refresh();playerTargets?.refresh();
    updateLocalTutorialReadiness({owner:session,learningUserId:hotseatPreference()?.primary?playerProfile?.id:hotseatPreference()?.key,state:projected,viewer:shownViewer,actions,ui:{selected,viewState}});
    if(replay)turnNotice.reset();
    else turnNotice.observe({sessionId:sessionId||session.createdAt,revision:state.move,turn:state.turn,viewer,status:state.status,paused,active:screen==='table'&&!transition&&gate===null&&!document.hidden,mount:$('#app')});
    if(gate!==null&&!replay)showGate();
    if(!transition&&!replay&&gate===null)presentationReady();
    scheduleBot();scheduleAutoPass();
    diagnostics?.end('render',diagnosticStart,{revision:state.move});
  }
  function historyStarts(){return session.current.players.length===1?Array.from({length:session.states.length},(_,i)=>i):session.current.timeline?.starts||[];}
  function historyStart(){return session.current.timeline?.playStart??0;}
  function historyMarkup() {
    const idx=replayIndex??session.states.length-1;
    const chooser=historyOrigin?.kind==='library'&&isPass()?`<label class="history-viewer">${globalThis.PlayroomMessages.text("ui.app.f54f58cf08df")}<select id="history-viewer" aria-label="${globalThis.PlayroomMessages.text("ui.app.55228669ae30")}">${session.current.players.map((p,i)=>`<option value="${i}" ${i===viewer?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`:'';
    return chooser+GameScreen.historyMarkup({minimum:historyStart(),turnStarts:historyStarts(),roundStarts:(E.project(session.current,-1).scene?.round?.starts||[]).map((revision,index)=>({revision,number:index+1})),index:idx,count:session.states.length-1,playing:!!replayTimer});
  }
  function historyPresentationEnd(index){
    const History=globalThis.PlayroomHistoryController,states=session.states;
    return History.presentationEnd(states,History.readyBatchEnd(states,index,s=>E.decisionWindow?.(s)),state=>E.project(state,viewer));
  }
  function scrubHistory(index) {
    const slider=$('#replay-range'),focused=document.activeElement===slider,before=currentState(),previous=replayIndex??session.states.length-1;
    input?.cancel();stopReplay();const next=historyPresentationEnd(Math.max(historyStart(),Math.min(session.states.length-1,index))),after=session.states[next],events=E.project(after,viewer).events;
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
  function render(animate=false) { if(screen!=='table'){localTutorialContext=null;renderedLocalInputs=null;globalThis.PlayroomFirstTurnGuide.stop();}screen==='hub'?renderHub():screen==='lobby'?renderLobby():renderTable(animate); }
  function scheduleBot() {
    cancelBot();
    if(transition||!session||screen!=='table'||isReplay()||paused||gate!==null||document.hidden||session.current.status==='finished')return;
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
    const diagnosticStart=diagnostics?.begin()??null;
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
      const beforeState=session.current,beforeTurn=beforeState.turn,initialScene=E.project(beforeState,viewer).scene,timing=pace(),quiet=catalog[session.game]?.capabilities?.quietActions?.includes(action.type),snapshot=!quiet||catalog[session.game]?.capabilities?.presentation?.entityMotion?flow.capture({actor,action,viewer,playedFrom:context.playedFrom,sceneModel:initialScene,deferDepartures:true}):null;
      if(session.current.players[actor]?.bot)localAuthority().actBot(actor,action);
      else {const receipt=screenController.send(action,{actor});if(receipt.ignored||receipt.code==='REACTION_WAIT')return;if(!receipt.ok)throw Error(receipt.message);}
      globalThis.PlayroomFirstTurnGuide.committed(session,actor,action,guideToken);
      GameScreen.allowLayoutChange($('#app'),context);if(!action.preserveSelection)selected=null;playerTargets?.cancel();
      const draws=cardTransfers(beforeState,session.current).filter(draw=>draw.privateTo==null||(Array.isArray(draw.privateTo)?draw.privateTo.includes(viewer):draw.privateTo===viewer));
      const projected=E.project(session.current,viewer),events=projected.events.filter(event=>event.id>(beforeState.events.at(-1)?.id||0));
      feedback.accept(events,E.soundCues(session.current,viewer,beforeState.events.at(-1)?.id||0),session.game,{initialScene,finalScene:projected.scene,defer:!quiet,silent:document.hidden||gate!==null,mode:timing.mode,snapshot,motion:quiet?null:(context,step)=>flow.play(step?.snapshot||snapshot,{draws:step?.draws??draws,transferOnly:step?.transferOnly,context})});
      if(E.checkpoint(beforeState,session.current,actor,action)!==false)save();input?.invalidate();
      if(quiet&&context.deferRender)return;
      if(quiet){
        const shownSession=session,revision=session.current.move,quietViewer=viewer;markDeviceHandoff(beforeTurn);renderTable(false,true);
        let motion=Promise.resolve();
        if(catalog[session.game]?.capabilities?.presentation?.entityMotion&&snapshot){motion=flow.play(snapshot);void motion.then(()=>{if(session===shownSession&&session.current.move===revision)presentFinishedResult();});}else presentFinishedResult();
        void Promise.all([feedback.whenIdle(),motion]).then(()=>{
          const context=localTutorialContext;
          if(screen==='table'&&!isReplay()&&session===shownSession&&session.current.move===revision&&viewer===quietViewer&&context?.owner===shownSession&&context.state.move===revision&&context.viewer===quietViewer)updateLocalTutorialReadiness(context);
        });
        return;
      }
      screenController.transition({context:{session,beforeTurn},capture:()=>snapshot,
        render(run){transition=run;renderTable();Motion.prepare(snapshot,draws);},
        play:()=>flow.present(()=>{feedback.next();return feedback.whenIdle();}),
        settle:0,finish:run=>finishAction(run)});
    } catch(error){toast(globalThis.PlayroomMessages.error(error)||globalThis.PlayroomMessages.text("ui.app.691a0701dfac"));void previewSound('error',session?.game);}
    finally {diagnostics?.end('action',diagnosticStart,{revision:session?.current.move,action:action?.type,actor});}
  }
  const localModal=new globalThis.PlayroomDOM.ModalController({host:$('#modal-root'),background:$('#app'),prepareSurface:element=>{const modal=element.matches('.modal')?element:element.querySelector(':scope>.modal');if(modal)GameScreen.normalizeSurfaceHead(modal.querySelector(':scope>.modal-head'),modal.className);}});
  // UI capabilities bind an asynchronous intent to its original journey. A
  // retained parent may authorize its own confirmation; writes require active UI.
  function captureUIOperation({idle=false,account=false}={}){
    const frame=localModal.activeFrame(),origin={screen,tab:hubTab,session,sessionId,roomId:room?.id,participant:lobbyParticipantId},network=globalThis.PlayroomNetworkLibrary;
    const context=network?.inviteContext?.(),networkIdentity=JSON.stringify([context?.room?.id,context?.participantId,context?.room?.ownerId]);
    const accountIdentity=()=>{const state=globalThis.PlayroomAccountUI?.service?.snapshot();return JSON.stringify([state?.kind,state?.id,!!state?.recovery,globalThis.PlayroomCommunityUI?.service?.generation]);},who=account?accountIdentity():null;
    const current=({retained=false}={})=>{
      const next=network?.inviteContext?.(),top=document.getElementById('modal-root')?.querySelector(':scope>[data-surface-state="active"]');
      if(screen!==origin.screen||hubTab!==origin.tab||session!==origin.session||sessionId!==origin.sessionId||room?.id!==origin.roomId||lobbyParticipantId!==origin.participant||networkIdentity!==JSON.stringify([next?.room?.id,next?.participantId,next?.room?.ownerId])||account&&who!==accountIdentity())return false;
      if(idle&&(room||network?.hasActiveRoom?.()))return false;
      if(frame)return frame.state!=='disposed'&&frame.element.isConnected&&(retained||frame.state==='active'&&top===frame.element);
      return retained||!top;
    };
    const guard=options=>{if(!current(options))throw Object.assign(Error('cancelled'),{code:'cancelled'});};
    return Object.freeze({frame,current,guard});
  }
  function storageMutationFinished(operation){
    if(!operation.current())return;
    if(operation.frame)closeModal();
    if(screen==='hub'){clearDeletedSession();renderHub();}
  }
  function openModal(content,className='',{keepAudio=false,size='auto',onBack=null,beforeBack=null,mode=null,valid=()=>true,onDispose=null}={}) {
    const parent=localModal.activeFrame(),defaultBack=parent?captureModalReturn():null;
    const template=document.createElement('template');template.innerHTML=content;
    const large=size==='large'||size==='auto'&&(className==='pack-manager-modal'||className==='room-setup-modal'||template.content.querySelector('.room-choice-list,[data-settings-screen],#room-rules-form,.lobby-seats>.lobby-seat-row:nth-child(2)'));
    if($('#modal-root [data-settings-screen]')&&!template.content.querySelector('[data-settings-screen]')&&!saveSettingsNickname())return;
    const dialogSize=large?'large':'compact',surface=GameScreen.classifySurface(className);
    if(surface==='screen'){const back=template.content.querySelector('.modal-head [data-command=close-modal]');if(back){back.innerHTML=icon('back');back.setAttribute('aria-label','Назад');content=template.innerHTML;}}
    const activeDialog=parent?.element.querySelector('.modal'),existing=className&&className.split(/\s+/).every(name=>activeDialog?.classList.contains(name))?activeDialog:null;
    if(existing&&(className==='room-setup-modal'||className==='pack-manager-modal')){
      existing.dataset.dialogSize=dialogSize;existing.dataset.uiSurface=surface;GameScreen.updateModal(existing,content);return parent;
    }
    const returnToSettings=!!$('#modal-root [data-settings-screen]')&&!template.content.querySelector('[data-settings-screen]')&&className!=='learning-list'?settingsReturn:null;
    const returnToContext=!!$('#modal-root .room-context-modal')?defaultBack:null;
    const returnToRoom=!!$('#modal-root .room-setup-modal')&&className!=='room-setup-modal';
    const stackMode=mode||(className==='room-setup-modal'?'reset':existing?'replace':parent?'push':'reset');
    const nextBack=onBack||returnToSettings||returnToContext||(returnToRoom?($('#modal-root [data-command=lobby-start]')?renderLobby:()=>globalThis.PlayroomNetworkLibrary?.openRoom?.()):stackMode==='push'?defaultBack:null);
    const focused=document.activeElement;
    pendingAction=null;pendingConfirmation=null;dismissNotice();globalThis.PlayroomReactionUI?.close?.();for(const popover of document.querySelectorAll('[popover]:popover-open'))popover.hidePopover();input?.cancel();
    // A live table continues behind inert surfaces; only explicit Pause changes game time.
    if(screen!=='table'||isReplay()){
      interruptAction();stopReplay(!keepAudio);cancelBot();
      if(screen==='table')renderTable();cancelBot();
    }
    if(!template.content.querySelector('.modal-head')){
      const title=template.content.querySelector('h2');if(title){const text=title.textContent;title.remove();content=GameScreen.modalHead(text)+template.innerHTML;}
    }
    const context=globalThis.PlayroomNetworkLibrary?.inviteContext?.(),roomId=context?.room?.id;
    const roomSurface=!!roomId&&(/^(room-|seat-choice|bot-settings)/.test(className)||className==='settings-modal'&&!!document.querySelector('.network-game'));
    const isValid=()=>valid()!==false&&(!roomSurface||globalThis.PlayroomNetworkLibrary?.inviteContext?.()?.room?.id===roomId);
    let dismissCleanup=null;
    const frame=localModal.open(`<div class="modal-backdrop"><section class="modal ${className}" data-dialog-size="${dialogSize}" data-ui-surface="${surface}" role="dialog" aria-modal="true">${GameScreen.modalContent(content,{className})}</section></div>`,{
      mode:stackMode,valid:isValid,meta:{owner:'app',kind:className,back:nextBack,beforeBack},onDispose:(reason,handle)=>{dismissCleanup?.();onDispose?.(reason,handle);}
    });
    if(!frame)return null;
    modalReturn=focused?.isConnected?focused:focused?.dataset?.command?$('#app [data-command="'+focused.dataset.command+'"]'):focused;
    modalBack=nextBack;
    GameScreen.fitCovers(frame.element);GameScreen.fitGameTitles(frame.element);placeNotice();
    const heading=frame.element.querySelector('.modal h2'),dialog=frame.element.querySelector('.modal');
    if(heading&&dialog){heading.id='dialog-title-'+frame.id;dialog.setAttribute('aria-labelledby',heading.id);}
    if(surface==='panel')dismissCleanup=GameScreen.bindSurfaceDismiss?.(frame.element,{isActive:()=>localModal.isActive(frame),onDismiss:()=>closeModal()});
    rootModalFocus();globalThis.PlayroomUIFeedback?.emit('menu.open');
    return frame;
  }
  function confirmOperation(message,{onConfirm,isCurrent=()=>true,label}={}){
    openModal(GameScreen.actionConfirmationMarkup({confirmation:message,label},'confirm-operation'));
    pendingConfirmation={onConfirm,isCurrent};
  }
  function captureModalReturn(){
    const token=localModal.capture(),back=modalBack,focus=modalReturn,settingsBack=settingsReturn,action=pendingAction,confirmation=pendingConfirmation;
    return ()=>{
      if(!token)return false;
      if(!localModal.restore(token))return false;
      modalBack=back;modalReturn=focus;settingsReturn=settingsBack;pendingAction=action;pendingConfirmation=confirmation;
      window.dispatchEvent(new Event('playroom:modal-restored'));
      return true;
    };
  }
  function rootModalFocus(){const host=localModal.activeRoot();if(host&&!host.contains(document.activeElement))host.querySelector('input,textarea,button')?.focus({preventScroll:true});}
  function closeModal(ignoreBack=false) {
    const frame=localModal.activeFrame();
    if(!ignoreBack&&frame?.meta?.owner!=='app'){const dismissed=frame?.meta?.dismiss?.()||false;if(dismissed||frame&&!localModal.isActive(frame))globalThis.PlayroomUIFeedback?.back();return dismissed;}
    if(!ignoreBack&&typeof frame?.meta?.beforeBack==='function'&&frame.meta.beforeBack()===true){globalThis.PlayroomUIFeedback?.back();return true;}
    if(!saveSettingsNickname())return false;
    const hadModal=!!frame;
    if(frame?.element.querySelector('#profile-form')&&!playerProfile?.name&&!ignoreBack)return false;
    const back=modalBack,returnFocus=modalReturn;
    pendingAction=null;pendingConfirmation=null;modalBack=null;modalReturn=null;dismissNotice();
    if(ignoreBack)localModal.reset({reason:'reset'});
    else if(frame&&!localModal.close(frame,{reason:'back'}))return false;
    if(hadModal&&!ignoreBack)globalThis.PlayroomUIFeedback?.back();
    if(back&&!ignoreBack){back();return true;}
    if(screen!=='table'||isReplay()||paused)stopSounds();placeNotice();
    if(hadModal&&!localModal.activeFrame()&&returnFocus?.isConnected)returnFocus.focus?.({preventScroll:true});
    scheduleBot();scheduleAutoPass();
    return true;
  }
  const modalHead = GameScreen.modalHead;
  function ensureRoomButton(){
    const tools=$('#app .hub-root-actions')||$('#app .topbar-tools')||$('#app .table-tools');
    if(!tools||tools.closest('.table-shell')||!room||globalThis.PlayroomNetworkLibrary?.isClient?.()||tools.querySelector('[data-command="room"],[data-net-action="room"]'))return;
    const node=document.createElement('button');node.className='icon-btn';node.dataset.command='room';node.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.app.3a73248bdd79"));node.title=globalThis.PlayroomMessages.text("ui.app.3a73248bdd79");node.innerHTML=icon('room');tools.prepend(node);
  }
  new MutationObserver(ensureRoomButton).observe($('#app'),{subtree:true,childList:true});
  function showGameCard(gameId){
    const game=meta(gameId);if(!game)return;const back=captureModalReturn(),activeRoom=!!globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.();
    const frame=openModal(`${modalHead(game.name)}<div class="choice021-game"><div class="choice021-art">${V.cover?.(gameId)||''}</div><div class="menu-list choice021-modes">${[['hotseat','На устройстве','С ботом или вместе','gamepad'],['online','Онлайн','Комната и приглашения','globe'],['network','Рядом','QR, звук или код','wifi']].map(([mode,label,subtitle,glyph])=>{const reason=activeRoom?'Сначала вернитесь в активную комнату.':mode!=='hotseat'&&game.max===1?'Эта игра доступна только на устройстве.':'';return `<button type="button" class="menu-row" data-game-mode="${mode}" ${reason?'disabled':''}><span><strong>${label}</strong><small>${reason||subtitle}</small></span>${icon(glyph)}</button>`;}).join('')}<button type="button" class="menu-row" data-game-card-rules><span>Как играть</span>${icon('rules')}</button></div></div>`,'game-card-modal choice021',{onBack:back});
    prepareGamePanels(gameId,{valid:()=>frame.element.isConnected&&localModal.isActive(frame)});
    frame.element.querySelector('[data-game-card-rules]').onclick=()=>{const backToCard=captureModalReturn();showRules(gameId);modalBack=backToCard;};
    for(const button of frame.element.querySelectorAll('[data-game-mode]'))button.onclick=()=>{const mode=button.dataset.gameMode;const begin=()=>{if(globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast('Сначала вернитесь в активную комнату или закройте её.');setup(gameId);if(mode!=='hotseat')setRoomOption('transportMode',mode);};if(mode==='online'&&globalThis.PlayroomAccountUI.service.snapshot().kind!=='account')globalThis.PlayroomAccountUI.show({onReady:begin});else begin();};
  }
  function setup(gameId,draft=null) {
    completedRoom=null;
    if(!history&&!results&&globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.())return toast(globalThis.PlayroomMessages.text("ui.app.ed9bf8ddc81a"));
    if(room)leaveLobby();
    const active=activatePack(gameId),g=meta(gameId);if(!g){packUI?.open();return;}
    const rules=defaultRules(gameId,g);
    const host={id:playerProfile?.id||'local-host',nickname:playerProfile?.name||globalThis.PlayroomMessages.text("ui.app.f54f58cf08df"),avatar:profileAvatar};
    room=roomService.create({transportMode:'hotseat',name:settings.lastRoomName||globalThis.PlayroomMessages.text("ui.app.499f4549c0b2",{p0:String(host.nickname)}),host,game:{id:gameId,name:g.name,version:active.version,...(g.botSettings?{botSettings:g.botSettings}:{}),teamLayouts:catalog[gameId]?.teamLayouts||{}},rules,constraints:{min:g.min,max:g.max,allowed:g.playerCounts}});
    settings.lastRoomName=room.name;settingsStore.write(settings);
    lobbyParticipantId=host.id;room=roomService.configure(room.id,host.id,{transportMode:'hotseat'});
    for(let i=1;i<g.min;i++)room=roomService.setLocalSeat(room.id,host.id,room.seats[i].id,{kind:'bot',nickname:randomBotName()});
    renderLobby();
  }
  function ruleOptionAvailable(field,form){return (!field.visibleWhen||Object.entries(field.visibleWhen).every(([key,value])=>choiceValue(form.elements['option-'+key])===String(value)))&&(!field.inactiveWhen||!Object.entries(field.inactiveWhen).every(([key,value])=>choiceValue(form.elements['option-'+key])===String(value)));}
  function roomRulesFromForm(form){
    const game=form.dataset.game,packOptions=Object.fromEntries((catalog[game]?.settings||[]).filter(field=>ruleOptionAvailable(field,form)).map(field=>[field.key,choiceValue(form.elements['option-'+field.key])]));
    const rules={firstPlayerMode:(form.elements.firstPlayerMode?.value||'rules'),seatOrder:(form.elements.seatOrder?.value||'normal'),preset:choiceValue(form.elements.preset),presetLabel:Multiplayer.presetLabel(choiceValue(form.elements.preset),meta(game),catalog[game]?.presetSetting),openHands:false,options:packOptions};
    return {...rules,display:Multiplayer.describeRules(rules,catalog[game]?.settings||[],false,catalog[game]?.presetSetting)};
  }
  function latestRoomEvent(type){return room?.events?.slice().reverse().find(event=>!type||event.type===type)||null;}
  let autoStartRoom=null,autoStartUnsub=null,autoStartQueued=false;
  function watchAutoStart(state){
    if(autoStartRoom!==state.id){autoStartUnsub?.();autoStartRoom=state.id;autoStartUnsub=roomService.subscribe(state.id,checkAutoStart);}
    checkAutoStart();
  }
  function checkAutoStart(){
    if(autoStartQueued||!room||room.id!==autoStartRoom)return;
    const state=roomService.snapshot(room.id);
    if(!state.autoStart||state.ownerId!==lobbyParticipantId||state.transportMode==='hotseat'||state.phase!=='lobby'||!roomService.canStart(state.id))return;
    autoStartQueued=true;queueMicrotask(()=>{autoStartQueued=false;if(!room||room.id!==state.id)return;const latest=roomService.snapshot(state.id);if(latest.autoStart&&latest.phase==='lobby'&&roomService.canStart(state.id))void startLobbyCountdown();});
  }
  let dismissingLobby=null;
  function dismissUnusedLobby(){
    const roomId=room?.id;if(!roomId)return false;
    const actor=lobbyParticipantId,current=()=>room?.id===roomId&&lobbyParticipantId===actor;
    const eligible=()=>current()&&roomService.shouldCloseOnDismiss(roomId,actor);
    if(!eligible())return false;
    if(dismissingLobby===roomId)return true;
    dismissingLobby=roomId;
    const closingFrame=localModal.activeFrame()?.element;if(closingFrame){closingFrame.inert=true;closingFrame.setAttribute('aria-busy','true');}
    void (async()=>{
      try{
        const closed=await globalThis.PlayroomLobbyNetwork.closeRoom(roomId,{shouldClose:eligible});
        if(!current())return;
        if(closed!==false)leaveLobby();
        else{dismissingLobby=null;closeModal();}
      }catch(error){if(current())toast(globalThis.PlayroomSocialUI.message(error));}
      finally{if(dismissingLobby===roomId)dismissingLobby=null;if(closingFrame){closingFrame.removeAttribute('aria-busy');if(closingFrame.dataset.surfaceState==='active')closingFrame.inert=false;}}
    })();
    return true;
  }
  function renderLobby(){
    if(!room)return;
    const completed=completedRoom?.roomId===room.id&&completedRoom.session.current.status==='finished';
    if(completed&&room.transportMode==='hotseat'&&room.phase==='playing')room=roomService.returnToLobby(room.id,lobbyParticipantId);
    room=roomService.snapshot(room.id);ensureRoomButton();
    if(screen==='lobby'){screen='hub';renderHub();}
    const state=room,isHost=state.ownerId===lobbyParticipantId;if(isHost)watchAutoStart(state);
    openModal(PlayroomLobbyView.render({room:state,participantId:lobbyParticipantId,isHost,completed,canStart:isHost&&roomService.canStart(state.id),startReason:isHost?roomService.startBlocker(state.id):'',countdown:lobbyCountdown??3}),'room-setup-modal',{beforeBack:dismissUnusedLobby});
    PlayroomLobbyView.notifyRulesChange(state,lobbyParticipantId,toast);
    const preparedRoomId=state.id,preparedGameId=state.game.id,preparedRevision=state.rulesRevision,preparedActor=lobbyParticipantId;
    const choicePlan=roomGameChoicePlan(state.transportMode);panelPreparation.prepare(choicePlan.key,choicePlan.build,{valid:()=>room?.id===preparedRoomId&&room.game.id===preparedGameId&&room.rulesRevision===preparedRevision&&lobbyParticipantId===preparedActor&&!!$('#modal-root>[data-surface-state=active] .lobby-shell')});
    prepareGamePanels(preparedGameId,{state,readonly:!isHost||state.phase!=='lobby'||!!state.recovery,reason:!isHost||state.phase!=='lobby'||state.recovery?'Параметры можно менять до начала партии.':'',valid:()=>room?.id===preparedRoomId&&room.game.id===preparedGameId&&room.rulesRevision===preparedRevision&&lobbyParticipantId===preparedActor&&!!$('#modal-root>[data-surface-state=active] .lobby-shell')});
    const lobby=$('#modal-root>[data-surface-state=active] .lobby-shell'),roomId=state.id,actor=lobbyParticipantId;
    const current=()=>room?.id===roomId&&lobbyParticipantId===actor&&room.ownerId===actor&&room.phase==='lobby'&&!room.recovery;
    PlayroomLobbyView.bindSummary(lobby);
    PlayroomLobbyView.bindFirst(lobby,id=>{if(!current()||id!==null&&room.firstPlayerMode==='assigned'&&room.firstParticipantId===id)return;room=roomService.configure(roomId,actor,{firstPlayerMode:id===null?'rules':'assigned',firstParticipantId:id});renderLobby();},{current,onError:error=>toast(globalThis.PlayroomMessages.error(error))});
    PlayroomLobbyView.bindDrag(lobby,{current,canMove:id=>current()&&room.participants.some(person=>person.id===id&&(person.bot||person.id===actor&&!person.ready)),move(id,slot){if(!current())return;room=roomService.moveParticipant(roomId,actor,id,slot);renderLobby();},onError:error=>toast(globalThis.PlayroomMessages.error(error))});
  }
  function showRoomSeatChoices(id){
    if(!room)return;const state=roomService.snapshot(room.id),seat=state.seats.find(s=>s.id===id);if(!seat||state.ownerId!==lobbyParticipantId)return;
    const roomId=state.id,actor=lobbyParticipantId,person=state.participants.find(p=>p.id===seat.participantId),me=state.participants.find(p=>p.id===actor),previous=localModal.activeFrame(),kind='seat-choice-modal choice021',replacing=previous?.meta?.kind===kind,back=replacing?previous.meta.back:captureModalReturn();
    if(person){toast('Место уже занято. Откройте участника в лобби.');return;}
    const row=(kind,label,glyph,reason='')=>`<button type="button" class="menu-row" data-seat-choice="${kind}" ${reason?'disabled':''}><span><strong>${label}</strong>${reason?`<small>${esc(reason)}</small>`:''}</span>${icon(glyph)}</button>`;
    const claim=!person&&!seat.closed&&state.phase==='lobby'?row('claim',me?.role==='player'?'Пересесть сюда':'Занять место','player',me?.ready?'Сначала снимите готовность':''):'';
    const alternatives=state.seats.filter(s=>s.id!==id&&!s.participantId),others=alternatives.length?`<details class="choice021-other-seats"><summary>Другие места · ${alternatives.length}</summary><div class="menu-list">${alternatives.map(s=>`<button type="button" class="menu-row" data-seat-select="${esc(s.id)}"><span><strong>Место ${state.seats.indexOf(s)+1}</strong><small>${s.closed?'Закрыто':'Свободно'}</small></span>${icon('next')}</button>`).join('')}</div></details>`:'';
    const owns=()=>{if(room?.id!==roomId||lobbyParticipantId!==actor)return false;const latest=roomService.snapshot(roomId),place=latest.seats.find(s=>s.id===id);return latest.ownerId===actor&&!!place&&!place.participantId;};
    const frame=openModal(`${modalHead('Место '+(state.seats.indexOf(seat)+1))}<div class="choice021-content"><p class="choice021-state">${esc(seat.closed?'Место закрыто':'Свободное место')}</p><div class="menu-list">${claim}${row('bot','Добавить бота','bot-medium')}${state.transportMode==='hotseat'?row('human','Игрок на устройстве','player'):''}${row(seat.closed?'empty':'closed',seat.closed?'Открыть место':'Закрыть место',seat.closed?'addPlayer':'lock')}</div>${others}</div>`,kind,{onBack:back,mode:replacing?'replace':null,valid:owns});
    const current=()=>owns()&&localModal.isActive(frame);
    for(const button of frame.element.querySelectorAll('[data-seat-select]'))button.onclick=()=>{if(current())showRoomSeatChoices(button.dataset.seatSelect);};
    for(const button of frame.element.querySelectorAll('[data-seat-choice]'))button.onclick=async()=>{if(!current())return;const choice=button.dataset.seatChoice;if(choice==='claim'){try{room=roomService.claimSeat(roomId,actor,id);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}if(choice==='human'){showRoomHuman(id);return;}try{if(room.phase==='playing')await globalThis.PlayroomNetworkLibrary.prepareRoster();if(!current())return;room=roomService.setLocalSeat(roomId,actor,id,{kind:choice,...(choice==='bot'?{nickname:randomBotName(),difficulty:'medium'}:{})});renderLobby();}catch(error){if(current())toast(globalThis.PlayroomMessages.error(error));}};
  }
  function setRoomInvitationPermission(allowed,source=null){
    const id=room?.id,actor=lobbyParticipantId;
    if(!id||!actor)return null;
    const state=roomService.snapshot(id);
    // Local UI owns only its captured network lobby; Online mirrors an existing RPC.
    if(source){
      if(source.roomId!==id||source.actor!==actor||source.owner!==state.ownerId||state.ownerId!==actor||state.transportMode!=='network'||state.phase!=='lobby'||state.recovery||!source.current())return null;
    }else if(state.transportMode!=='online'||state.ownerId!==actor)return null;
    roomService.setInvitationPermission(id,actor,allowed);
    // Subscribers run synchronously and may navigate or mutate this room again.
    const latest=roomService.snapshot(id);
    if(room?.id===id&&lobbyParticipantId===actor)room=latest;
    return latest;
  }
  async function saveRoomContextName(form){
    if(form.dataset.roomNamePending)return;
    const frame=localModal.activeFrame(),id=form.dataset.roomId,actor=lobbyParticipantId,input=form.elements.roomName,submit=form.querySelector('[data-room-name-save]'),error=form.querySelector('[data-room-name-error]'),status=form.querySelector('[data-room-name-status]');
    if(!frame||frame.state!=='active'||!frame.element.contains(form)||!form.closest('.room-context-modal')||!input||!submit)return;
    const snapshot=()=>{try{return roomService.snapshot(id);}catch{return null;}},reason=()=>{const state=snapshot();return !state||state.phase==='closed'?'Комната уже закрыта.':state.ownerId!==actor?'Название может изменить только ведущий.':state.phase!=='lobby'||state.recovery?'Название можно изменить до начала партии.':'';};
    const initial=snapshot();
    if(room?.id!==id||form.dataset.roomActor!==actor||form.dataset.roomOwner!==initial?.ownerId||reason()){error.textContent=reason()||'Откройте настройки этой комнаты заново.';return;}
    let name;try{name=Multiplayer.normalizeRoomName(input.value);}catch(failure){error.textContent=globalThis.PlayroomMessages.error(failure);input.setAttribute('aria-invalid','true');input.focus();return;}
    const operation=captureUIOperation({account:initial.transportMode==='online'}),focused=document.activeElement,selection=focused===input?[input.selectionStart,input.selectionEnd,input.selectionDirection]:null;
    const retained=()=>frame.state!=='disposed'&&frame.element.isConnected&&frame.element.contains(form)&&room?.id===id&&lobbyParticipantId===actor;
    let completed=false,cancelled=false;
    form.dataset.roomNamePending='true';form.setAttribute('aria-busy','true');submit.disabled=true;input.readOnly=true;input.removeAttribute('aria-invalid');error.textContent='';status.textContent='Сохраняем…';
    try{
      await Promise.resolve();
      if(!operation.current()||!retained()||reason()){cancelled=true;return;}
      await roomService.configure(id,actor,{name});
      if(!operation.current({retained:true})||!retained()||reason()){cancelled=true;return;}
      room=roomService.snapshot(id);settings.lastRoomName=room.name;settingsStore.write(settings);completed=true;
      if(operation.current()){closeModal();renderLobby();}else status.textContent='Название сохранено.';
    }catch(failure){if(retained()){error.textContent=globalThis.PlayroomMessages.error(failure);status.textContent='';}}
    finally{if(retained()){
      delete form.dataset.roomNamePending;form.removeAttribute('aria-busy');const unavailable=reason();input.readOnly=!!unavailable;submit.disabled=!!unavailable;
      if(cancelled){status.textContent='';error.textContent=unavailable||'Сохранение отменено. Откройте настройки заново.';}
      if(!completed&&frame.state==='active'&&focused?.isConnected&&(document.activeElement===document.body||document.activeElement===submit)){focused.focus({preventScroll:true});if(selection)input.setSelectionRange(...selection);}
    }}
  }
  function setRoomOption(key,value,confirmed=false){
    if(key==='transportMode'&&room.transportMode==='online'&&value!=='online')globalThis.PlayroomCloudNetwork?.stopHost?.();
    if(key==='transportMode'&&value==='hotseat'){
      const guests=room.participants.filter(p=>!p.isHost&&!p.bot&&!p.local);
      if(guests.length&&!confirmed){openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.2bb9f7eecf7e"))}<p>${globalThis.PlayroomMessages.text("ui.app.b295b77d55d0")}</p><button class="btn" data-command="room-hotseat-confirm">${globalThis.PlayroomMessages.text("ui.app.91f7bab0648a")}</button>`);modalBack=renderLobby;return;}
      globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room.id,{preserveRoom:true});
      for(const p of guests)room=roomService.kick(room.id,lobbyParticipantId,p.id);
    }
    if(key==='transportMode'&&value!=='hotseat')for(const p of room.participants.filter(p=>p.local&&!p.bot&&!p.isHost))room=roomService.setLocalSeat(room.id,lobbyParticipantId,p.seatId,{kind:'empty'});
    room=roomService.configure(room.id,lobbyParticipantId,{[key]:value});
    if(key==='name'){settings.lastRoomName=room.name;settingsStore.write(settings);}
    renderLobby();
  }
  async function startHotSeat(){
    room=roomService.prepareStart(room.id,lobbyParticipantId);dismissNotice();
    const seats=room.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index),{players,seatIndices}=PlayroomRooms.sessionSetup(room);
    if(!players.some(p=>!p.bot))throw Error(globalThis.PlayroomMessages.text("ui.app.dc875925c351"));
    if(room.firstPlayerMode==='assigned'&&!seats.some(s=>s.participantId===room.firstParticipantId))throw Error(globalThis.PlayroomMessages.text("ui.app.467f6abb2682"));
    activatePack(room.game.id,room.game.version);
    const mode=players.filter(p=>!p.bot).length>1?'pass':'solo',next=new Session(E,room.game.id,{players,seatIndices,mode,lobbyConfig:roomService.snapshot(room.id),preset:room.rules.preset,presetLabel:room.rules.presetLabel,firstPlayerMode:room.firstPlayerMode||'rules',firstPlayer:seats.findIndex(s=>s.participantId===room.firstParticipantId),...(room.rules.options||{}),openHands:false});
    if(!await save())return;
    const nextId=library.newId();
    try{await library.activateAsync(next,nextId);}catch(error){reportSaveFailure(error);return;}
    completedRoom=null;session=next;sessionId=nextId;storageOK=true;diagnostics?.record('session.start',{revision:session.current.move});
    rememberGame(room.game.id);
    room=roomService.startHotSeat(room.id,lobbyParticipantId);
    screen='table';historyOpen=false;replayIndex=null;selected=null;paused=false;lastResult=null;awaitingPass=false;
    viewer=mode==='solo'?players.findIndex(p=>!p.bot):next.current.players[next.current.turn].bot?players.findIndex(p=>!p.bot):next.current.turn;
    gate=needsGate(next.current)?viewer:null;closeModal(true);render();globalThis.PlayroomUIFeedback?.emit('game.start',{id:nextId});presentationReady();
  }
  function updateLobbyNickname(form){try{room=roomService.rename(room.id,lobbyParticipantId,form.elements.nickname.value);playerProfile=profileStore.save(room.participants.find(p=>p.id===lobbyParticipantId).nickname);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function avatarContext(element){
    const source=localModal.activeFrame(),sourceRoom=room?.id,sourceParticipant=lobbyParticipantId,sourceNetwork=globalThis.PlayroomNetworkLibrary?.inviteContext?.()?.room?.id,account=globalThis.PlayroomAccountUI.service.snapshot().id,profileId=playerProfile?.id;
    return ()=>element.isConnected&&source?.state!=='disposed'&&room?.id===sourceRoom&&lobbyParticipantId===sourceParticipant&&globalThis.PlayroomNetworkLibrary?.inviteContext?.()?.room?.id===sourceNetwork&&globalThis.PlayroomAccountUI.service.snapshot().id===account&&playerProfile?.id===profileId;
  }
  function showBotSettings({person,config,seatId,readonly=false,remote=false}){
    const t=key=>globalThis.PlayroomMessages.text('ui.bot-settings.'+key),value={strategy:'auto',difficulty:'medium',...person.botSettings},levels=['easy','medium','hard'],labels=['Лёгкий','Средний','Сложный'],back=captureModalReturn();let avatar=person.avatar||null;
    const options=config?.strategies?.length?[{id:'auto',label:t('auto'),description:t('auto-help')},...config.strategies]:[];
    const strategies=options.length?`<label class="field">${esc(t('strategy'))}</label><div class="bot-strategies">${options.map(p=>`<label class="bot-strategy"><input type="radio" name="strategy" value="${esc(p.id)}" ${p.id===value.strategy?'checked':''}><span><strong>${esc(p.label)}</strong><small>${esc(p.description)}</small></span></label>`).join('')}</div>`:'';
    const canRemove=room?.ownerId===lobbyParticipantId&&['lobby','playing'].includes(room.phase),reason=readonly?(room?.ownerId===lobbyParticipantId?'Настройки бота доступны в лобби до начала партии.':'Изменять настройки бота может только ведущий.') :'';
    const frame=openModal(`${modalHead(person.nickname+' · бот')}<div class="choice021-content"><form id="bot-settings-form" data-seat="${esc(seatId)}" data-inline-actions><fieldset ${readonly?'disabled':''} class="bot-settings-fields"><input type="hidden" name="difficulty" value="${Math.max(0,levels.indexOf(value.difficulty))}"><div class="choice021-levels" role="group" aria-label="Сложность бота">${levels.map((level,i)=>`<label><input type="radio" name="botLevel" value="${i}" ${level===value.difficulty?'checked':''}><span>${labels[i]}</span></label>`).join('')}</div>${reason?`<p class="choice021-reason">${esc(reason)}</p>`:''}<details class="choice021-advanced"><summary>Имя, аватар и поведение</summary><div class="profile-identity-row"><button type="button" class="profile-avatar-button" data-bot-avatar aria-label="${esc(t('avatar'))}">${TabletopUI.avatar({name:person.nickname,avatar},0)}</button><label class="field">${esc(t('name'))}<input name="nickname" maxlength="24" required value="${esc(person.nickname)}"></label></div><p class="choice021-help" data-bot-level-help></p>${strategies}</details></fieldset></form>${readonly?'':`<button type="submit" class="btn choice021-primary" form="bot-settings-form">${icon('check')}<span>Сохранить</span></button>`}${canRemove?`<button type="button" class="choice021-remove" data-kick-participant="${esc(person.id)}">${icon('trash')}<span>Убрать бота</span></button>`:''}</div>`,'bot-settings-modal choice021',{onBack:back});
    const form=frame.element.querySelector('#bot-settings-form'),isCurrent=avatarContext(form),updateDifficulty=()=>{const level=levels[Number(form.elements.difficulty.value)];form.querySelector('[data-bot-level-help]').textContent=t(level+'-help');for(const input of form.querySelectorAll('[name=botLevel]'))input.checked=input.value===form.elements.difficulty.value;};
    form.addEventListener('change',event=>{if(event.target.name==='botLevel'){form.elements.difficulty.value=event.target.value;updateDifficulty();}});updateDifficulty();
    form.querySelector('[data-bot-avatar]').addEventListener('click',()=>globalThis.PlayroomAvatarPicker.open({name:form.elements.nickname.value,selected:avatar,isCurrent,onSelect:value=>{avatar=value;form.querySelector('[data-bot-avatar]').innerHTML=TabletopUI.avatar({name:form.elements.nickname.value,avatar},0);}}));
    form.addEventListener('submit',event=>{event.preventDefault();if(readonly||!isCurrent())return;try{room=roomService.configureBot(room.id,lobbyParticipantId,seatId,{nickname:form.elements.nickname.value,avatar,botSettings:{strategy:form.elements.strategy?.value||'auto',difficulty:levels[Number(form.elements.difficulty.value)]}});renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}});
  }
  function showRoomHuman(seatId){const seat=room.seats.find(s=>s.id===seatId),p=room.participants.find(p=>p.id===seat?.participantId),back=captureModalReturn();openModal(`${modalHead(p?'Имя игрока':'Игрок на устройстве')}<div class="choice021-content"><form id="room-human-form" data-seat="${esc(seatId)}" ${p?'data-rename="true"':''}><label class="field"><span>Имя игрока</span><input name="nickname" maxlength="24" required value="${esc(p?.nickname||globalThis.PlayroomMessages.text('ui.app.f54f58cf08df'))}"></label><button class="btn choice021-primary" type="submit">${icon(p?'save':'addPlayer')}<span>${p?'Сохранить':'Добавить игрока'}</span></button></form></div>`,'room-human-modal choice021',{onBack:back});}
  function claimLobbySeat(seatId){const occupant=room.participants.find(p=>p.id===room.seats.find(s=>s.id===seatId)?.participantId);if(room.ownerId===lobbyParticipantId&&!room.recovery&&occupant&&(occupant.bot||room.transportMode==='hotseat')){showRoomHuman(seatId);return;}if(room.transportMode==='hotseat'&&!room.seats.find(s=>s.id===seatId)?.participantId){showRoomHuman(seatId);return;}try{room=roomService.claimSeat(room.id,lobbyParticipantId,seatId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function kickLobbyParticipant(targetId){
    const roomId=room.id,actor=lobbyParticipantId,target=room.participants.find(p=>p.id===targetId),service=globalThis.PlayroomCommunityUI?.service,identity=service?.key(),revision=service?.generation;
    if(!target)return;
    // Roster collection legitimately returns this same room from play to lobby.
    // Its completion never acquires another room, account or host capability.
    const current=()=>room?.id===roomId&&lobbyParticipantId===actor&&room.ownerId===actor&&roomService.snapshot(roomId).ownerId===actor&&service===globalThis.PlayroomCommunityUI?.service&&service?.key()===identity&&service?.generation===revision;
    const guard=()=>{if(!current())throw Object.assign(Error('cancelled'),{code:'cancelled'});};
    confirmOperation('Удалить игрока '+target.nickname+' из комнаты?',{isCurrent:current,onConfirm:async()=>{
      try{
        guard();if(room.phase==='playing'){
          await globalThis.PlayroomNetworkLibrary.prepareRoster();guard();
          if(!localModal.activeRoot()?.querySelector('.room-v021'))return;
        }
        const operation=captureUIOperation({account:true}),writeGuard=()=>{guard();operation.guard();};
        writeGuard();if(room.transportMode!=='hotseat')await globalThis.PlayroomNetworkLibrary.removeParticipant(targetId,{guard:writeGuard});else roomService.kick(roomId,actor,targetId);
        writeGuard();room=roomService.snapshot(roomId);renderLobby();
      }catch(error){if(error.code!=='cancelled'&&current())throw error;}
    }});
  }
  function roomRulebookPanelContent(state){
    const game=meta(state.game.id),rows=Multiplayer.describeRules(state.rules,catalog[state.game.id]?.settings||[],false,catalog[state.game.id]?.presetSetting);
    return globalThis.PlayroomMessages.text('ui.app.380e3dbd6730',{p0:String(PlayroomRulebookView.header()),p1:String(PlayroomLobbyView.rulesMarkup(state,rows,game,catalog[state.game.id]?.settings||[]))});
  }
  function showRoomRules(){
    const state=roomService.snapshot(room.id);
    openModal(preparedPanel(publicPanelKey('room-rules',state.game.id,state.rules),()=>roomRulebookPanelContent(state)),'rulebook-modal');modalBack ||= renderLobby;
  }
  function showRoomHelp(){openModal(globalThis.PlayroomMessages.text("ui.app.380e3dbd6730",{p0:String(modalHead(globalThis.PlayroomMessages.text("ui.app.df2a5a208045"))),p1:String(PlayroomLobbyView.helpMarkup(roomService.snapshot(room.id)))}));modalBack ||= renderLobby;}
  // Range positions are UI indices; saved/domain values remain the pack's exact IDs.
  function choiceValue(input){
    const choices=input?.dataset?.choiceOptions;
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
  function settingTitle(label,help,{wrap=false}={}){
    if(wrap){const split=label.lastIndexOf(' '),prefix=split<0?'':label.slice(0,split+1),last=split<0?label:label.slice(split+1);return `<span class="setting-title setting-title-wrapped"><span class="setting-title-text">${esc(prefix)}<span class="setting-title-end"><span class="setting-title-last">${esc(last)}</span>${PlayroomLobbyView.fieldHelp(help)}</span></span></span>`;}
    return `<span class="setting-title"><span class="setting-title-text">${esc(label)}</span>${PlayroomLobbyView.fieldHelp(help)}</span>`;
  }
  function rulePreviewCount(field,option,form){
    const preview={...(field.preview||{}),...(option.preview||{})};
    if(preview.countFrom){
      if(!form)return null;
      const ref=preview.countFrom,control=form.elements['option-'+ref.field];
      const value=control&&choiceValue(control);return Object.hasOwn(ref.values||{},String(value))?ref.values[String(value)]:null;
    }
    const value=preview.count??(/^\d+$/.test(String(option.value))?Number(option.value):null);
    return Number.isSafeInteger(value)&&value>=0&&value<=100?value:null;
  }
  function ruleChoicePreview(field,option,form){
    const H=TabletopUI.helpers,C=H.components,preview={...(field.preview||{}),...(option.preview||{})},kind=preview.kind,count=rulePreviewCount(field,option,form);
    let art=PlayroomLobbyView.parameterArt(field.key||field.name,option.value);
    if(!art){
    if(kind==='cards'&&count!==null){
      const shown=count<=10?count:3;
      art=`<span class="rule-preview-cards" style="--preview-cards:${Math.max(1,shown)}" data-preview-count="${count}">${Array.from({length:shown},(_,i)=>`<span style="--preview-index:${i}">${H.back()}</span>`).join('')}${count>10?`<span class="rule-preview-deck-count">${H.countBadge(count,'Карт',{hand:true})}</span>`:''}</span>`;
    }else if(kind==='dice'&&count!==null){
      art=`<span class="rule-preview-dice" data-preview-count="${count}">${Array.from({length:Math.min(count,6)},(_,i)=>C.dieArt(i%6+1)).join('')}${count>6?`<b>×${count}</b>`:''}</span>`;
    }else if(['health','lives'].includes(kind)&&count!==null){
      const token=kind==='health'?'heart':'meeple';
      art=`<span class="rule-preview-tokens token-${token}" data-preview-count="${count}">${C.tokenStrip({value:count,capacity:Math.max(1,Math.min(count,8)),icon:token})}</span>`;
    }else if(kind==='fleet'&&Array.isArray(preview.pieces)){
      art=`<span class="rule-preview-fleet" data-preview-count="${preview.pieces.length}">${preview.pieces.map(size=>`<span>${C.shipSilhouette(size)}</span>`).join('')}</span>`;
    }else if(kind==='teams'&&Array.isArray(preview.teamSizes)){
      art=`<span class="rule-preview-teams" data-preview-count="${preview.teamSizes.length}">${preview.teamSizes.map((size,i)=>`<span class="rule-preview-team" style="color:${esc(field.teamLayouts?.[String(option.value)]?.teams?.[i]?.color||H.playerColor(i))}">${C.tokenStrip({value:size,capacity:Math.min(size,8),icon:'meeple'})}</span>`).join('')}</span>`;
    }else if(kind==='illustrations'&&Array.isArray(preview.ids)){
      art=`<span class="rule-preview-illustrations">${preview.ids.map(id=>`<span data-rule-illustration="${esc(id)}">${globalThis.PlayroomViews?.illustration(field.game||form?.dataset.game,id)||''}</span>`).join('')}</span>`;
    }else if(kind==='symbol'&&typeof preview.icon==='string'){
      art=PlayroomLobbyView.parameterSymbolArt(preview.icon,option.value);
      if(!art){const glyph=H.icon(preview.icon);if(/<(?:path|circle|rect|g|ellipse|polygon)\b/.test(glyph))art=`<span class="rule-preview-symbol">${glyph}</span>`;}
    }else if(kind==='declaration'&&['human','bot'].includes(preview.actor)&&typeof preview.label==='string'){
      art=`<span class="rule-preview-declaration">${H.button({label:preview.label,ariaLabel:preview.label,variant:'secondary',disabled:true,attrs:'inert tabindex="-1"'}).replace(/^<button\b/,'<span').replace(/<\/button>$/,'</span>')}<span class="rule-preview-actor">${H.icon(preview.actor==='human'?'player':'bot')}</span></span>`;

    }
    }
    const automatic=!!preview.countFrom&&count!==null,label=String(automatic?count:option.label||option.value),detail=String(option.description||(automatic?option.label:''));
    return `<button type="button" data-rule-next data-surface-pull-through class="rule-choice-preview${art?' has-art':''}${art&&['cards','dice','health','lives','fleet','teams'].includes(kind)?' has-value-art':''}${label.length>12?' is-long-label':''}" data-rule-preview-kind="${esc(kind||'text')}" data-rule-preview-value="${esc(option.value)}" aria-label="${esc('Следующий вариант: '+(field.label||field.name||'параметр')+'. Сейчас: '+(automatic?option.label+', '+count:label))}" ${!art&&!detail?'tabindex="-1"':''} ${field.readonly?'disabled':''}><span class="rule-choice-preview-art" aria-hidden="true">${art}</span><output class="rule-choice-accessible-value" data-rule-preview-label aria-live="polite">${esc(label)}</output>${detail?`<small data-rule-preview-detail>${esc(detail)}</small>`:''}</button>`;
  }
  function ruleControl(field,name,value,{mode=false,readonly=false,game}={}){
    const options=field.options,index=Math.max(0,options.findIndex(option=>String(option.value)===String(value)));
    if(options.length===1)return `<input type="hidden" name="${esc(name)}" value="${esc(options[0].value)}">`;
    const key=field.key||'preset',counter=!mode&&options.length>4&&options.every(option=>/^\d+$/.test(String(option.value))||option.preview?.countFrom),numericFour=options.length===4&&options.every(option=>/^(?:\d+(?:[.,]\d+)?|∞)$/.test(String(option.label))),schema={name,game,label:field.label,readonly,preview:field.preview,inactivePresentation:field.inactivePresentation,teamLayouts:field.teamLayouts,options:options.map(({value,label,description,preview})=>({value,label,description,preview}))};
    const choices=options.map((option,i)=>`<label class="rule-choice"><input type="radio" name="${esc(name)}" value="${esc(option.value)}" ${i===index?'checked':''} ${readonly?'disabled':''} aria-label="${esc(option.label)}" title="${esc(option.label)}"><span class="rule-choice-body" title="${esc(option.label)}">${esc(option.shortLabel||option.label)}</span></label>`).join('');
    const stepper=counter?`<div class="rule-choice-stepper"><button type="button" data-rule-step="-1" aria-label="${esc('Уменьшить: '+field.label)}">−</button><span data-rule-step-value aria-hidden="true">${esc(options[index].label)}</span><button type="button" data-rule-step="1" aria-label="${esc('Увеличить: '+field.label)}">+</button></div>`:'';
    return `<fieldset class="rules-v021-field rule-choice-field${mode?' is-mode-choice':''}${readonly?' is-readonly':''}${counter?' is-counter-choice':''}" data-rule-field="${esc(key)}" data-rule-schema="${esc(JSON.stringify(schema))}"><legend class="rule-choice-legend">${esc(field.label)}</legend><div class="rule-choice-heading">${settingTitle(field.label,field.help)}</div>${ruleChoicePreview({...field,readonly,game},options[index])}<div class="rule-choice-options" data-rule-option-count="${options.length}" data-rule-grid="${numericFour?'two':'flow'}" ${counter?'hidden':''}>${choices}</div>${stepper}</fieldset>`;
  }
  function syncRuleChoices(form){
    const reserves=[];
    for(const field of form.querySelectorAll('.rule-choice-field')){
      const schema=JSON.parse(field.dataset.ruleSchema),radios=[...field.querySelectorAll('input[type=radio]')],index=radios.findIndex(radio=>radio.checked),option=schema.options[index];
      if(!option)continue;
      const inactive=field.classList.contains('is-unavailable')?schema.inactivePresentation:null,displayOption=inactive?{...option,preview:inactive.preview||option.preview,description:inactive.description||option.description,label:inactive.description||option.label}:option;
      const old=field.querySelector('.rule-choice-preview'),html=ruleChoicePreview(schema,displayOption,form);
      // Only the miniature preview changes. Keep the actual controls, focus,
      // form, scroll position and the rest of the app screen intact.
      if(field.rulePreviewHTML!==html&&old){
        const template=document.createElement('template');template.innerHTML=html;const next=template.content.firstElementChild;
        old.className=next.className;old.disabled=next.disabled||field.classList.contains('is-unavailable');old.setAttribute('aria-label',next.getAttribute('aria-label'));old.dataset.rulePreviewKind=next.dataset.rulePreviewKind;old.dataset.rulePreviewValue=next.dataset.rulePreviewValue;
        const art=old.querySelector('.rule-choice-preview-art'),nextArt=next.querySelector('.rule-choice-preview-art');art.replaceChildren(...nextArt.childNodes);
        old.querySelector('[data-rule-preview-label]').textContent=next.querySelector('[data-rule-preview-label]').textContent;
        const detail=old.querySelector('[data-rule-preview-detail]'),nextDetail=next.querySelector('[data-rule-preview-detail]');
        if(detail&&nextDetail)detail.textContent=nextDetail.textContent;else if(detail)detail.remove();else if(nextDetail)old.append(nextDetail);
        field.rulePreviewHTML=html;
      }
      const stepValue=field.querySelector('[data-rule-step-value]');if(stepValue)stepValue.textContent=option.label;
      reserves.push([field,schema]);
      field.querySelectorAll('[data-rule-step]').forEach(button=>button.disabled=field.classList.contains('is-readonly')||field.classList.contains('is-unavailable')||index+Number(button.dataset.ruleStep)<0||index+Number(button.dataset.ruleStep)>=radios.length);
    }
    // Finish live writes before asking layout for any field's envelope.
    for(const [field,schema]of reserves)reserveRulePreview(field,schema,form);
  }
  // Author units are CSS pixels: center the ink without zooming each variant.
  function centerRulePreviewArt(preview){
    for(const svg of preview.querySelectorAll('svg[data-art-role="parameter-diagram"]')){
      if(svg.hasAttribute('data-rule-art-fitted')||svg.parentElement?.closest('svg[data-art-role="parameter-diagram"]'))continue;
      try{
        const plane=svg.viewBox.baseVal,box=svg.getBBox(),values=[plane.width,plane.height,box.x,box.y,box.width,box.height];
        if(!values.every(Number.isFinite)||box.width<=0||box.height<=0)continue;
        const width=Math.max(plane.width,box.width+8),height=Math.max(plane.height,box.height+8);
        svg.setAttribute('viewBox',[box.x+box.width/2-width/2,box.y+box.height/2-height/2,width,height].join(' '));
        svg.style.setProperty('--rule-art-inline',width+'px');
        svg.setAttribute('data-rule-art-fitted','');
      }catch(_){/* An unavailable graphic retains its authored viewport. */}
    }
  }
  function reserveRulePreview(field,schema,form){
    const preview=field.querySelector('[data-rule-next]');if(!preview||!field.getClientRects().length)return;
    centerRulePreviewArt(preview);
    const signature=preview.clientWidth+':'+getComputedStyle(preview).font+':'+JSON.stringify([schema,schema.options.map(option=>rulePreviewCount(schema,option,form))]);if(field.ruleReserveKey===signature)return;
    const cacheKey=publicPanelKey('preview-envelope',form.dataset.game,signature),cached=ruleLayoutPreparation.get(cacheKey);
    if(cached!==undefined){preview.style.minBlockSize=cached+'px';field.ruleReserveKey=signature;field.dataset.ruleMeasureMs='0';return;}
    // Quantity art has a monotone height envelope at a fixed width. Measure
    // its largest count for each distinct caption, not every hidden label.
    const representatives=new Map();for(const [index,option]of schema.options.entries()){const descriptor={...(schema.preview||{}),...(option.preview||{})},count=rulePreviewCount(schema,option,form),quantity=['cards','dice','health','lives'].includes(descriptor.kind),detail=option.description||(descriptor.countFrom&&count!==null?option.label:'');const sampleKey=quantity?descriptor.kind+':'+detail:'option:'+index,previous=representatives.get(sampleKey);if(!previous||quantity&&count>previous.count)representatives.set(sampleKey,{option,count});}
    const variants=[...representatives.values()].map(({option})=>ruleChoicePreview(schema,option,form));if(schema.inactivePresentation){const inactive=schema.inactivePresentation;variants.push(ruleChoicePreview(schema,{...schema.options[0],preview:inactive.preview,description:inactive.description,label:inactive.description},form));}
    const key=signature;
    const scrollport=preview.closest('.modal-body'),scrollTop=scrollport?.scrollTop;
    const started=performance.now(),art=preview.querySelector('.rule-choice-preview-art'),originalArt=[...art.childNodes],detail=preview.querySelector('[data-rule-preview-detail]'),originalText=detail?.textContent,originalClass=preview.className;
    const originalFlex=preview.style.flex;let measuredDetail=detail,max=0;preview.style.flex='0 0 auto';preview.style.minBlockSize='0px';
    try{for(const html of variants){const template=document.createElement('template');template.innerHTML=html;const candidate=template.content.firstElementChild,candidateDetail=candidate.querySelector('[data-rule-preview-detail]');preview.classList.toggle('has-art',candidate.classList.contains('has-art'));art.replaceChildren(...candidate.querySelector('.rule-choice-preview-art').childNodes);
      if(candidateDetail){if(!measuredDetail){measuredDetail=document.createElement('small');measuredDetail.dataset.rulePreviewDetail='';preview.append(measuredDetail);}measuredDetail.textContent=candidateDetail.textContent;}else if(measuredDetail)measuredDetail.textContent='';
      centerRulePreviewArt(preview);max=Math.max(max,preview.getBoundingClientRect().height);
    }}finally{art.replaceChildren(...originalArt);preview.className=originalClass;if(detail)detail.textContent=originalText;else measuredDetail?.remove();}
    preview.style.flex=originalFlex;ruleLayoutPreparation.set(cacheKey,Math.ceil(max));preview.style.minBlockSize=Math.ceil(max)+'px';field.ruleReserveKey=key;field.dataset.ruleMeasureMs=(performance.now()-started).toFixed(2);if(scrollport)scrollport.scrollTop=scrollTop;
  }
  function bindRuleChoices(form){
    let gesture=null,suppressClickUntil=0;
    form.addEventListener('pointerdown',event=>{if(event.isPrimary&&event.button===0){gesture={id:event.pointerId,x:event.clientX,y:event.clientY,dragged:false};suppressClickUntil=0;}},{passive:true});
    form.addEventListener('pointermove',event=>{if(gesture?.id===event.pointerId&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)gesture.dragged=true;},{passive:true});
    for(const type of ['pointerup','pointercancel'])form.addEventListener(type,event=>{if(gesture?.id===event.pointerId){if(gesture.dragged||event.type==='pointercancel')suppressClickUntil=performance.now()+600;gesture=null;}},{passive:true});
    const choose=(field,offset,{wrap=false}={})=>{
      if(!field||field.classList.contains('is-readonly')||field.classList.contains('is-unavailable')||field.closest('[hidden],[inert]')||!field.getClientRects().length||!form.ruleEditorCurrent?.())return;
      const radios=[...field.querySelectorAll('input[type=radio]')].filter(radio=>!radio.disabled);if(radios.length<2)return;
      const current=radios.findIndex(radio=>radio.checked),index=wrap?(current+offset+radios.length)%radios.length:current+offset,radio=radios[index];
      if(radio){radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}
    };
    form.addEventListener('click',event=>{
      const field=event.target.closest('.rule-choice-field');if(!field)return;
      if(event.detail>0&&performance.now()<suppressClickUntil){event.preventDefault();event.stopPropagation();return;}
      const next=event.target.closest('[data-rule-next]');if(next){if(!next.disabled)choose(field,1,{wrap:true});return;}
      const step=event.target.closest('[data-rule-step]');if(step){if(!step.disabled)choose(field,Number(step.dataset.ruleStep));return;}
      // Native radio/label activation selects exactly that choice. Help, links
      // and popovers are independent controls, never a request to cycle.
      if(event.target.closest('button,input,label,select,textarea,a,[popover],.rule-help,.rule-choice-options'))return;
      choose(field,1,{wrap:true});
    });
  }
  function roomRulePanelKey(state,readonly,reason){return publicPanelKey('parameters',state.game.id,[state.rules,state.firstPlayerMode,state.seatOrder,readonly,reason]);}
  function roomRulePanelContent(state,readonly,reason){
    const g=meta(state.game.id),manifest=catalog[state.game.id]||{},presets=g.presets?.length?g.presets:[{id:'default',label:globalThis.PlayroomMessages.text('ui.app.a39ad47c9222')}],fields=(manifest.settings||[]).map(PlayroomMultiplayer.standardRule);
    const presetSource=manifest.presetSetting||{label:globalThis.PlayroomMessages.text('ui.app.b5d827de5168'),options:presets.map(p=>({value:p.id,label:p.label||p.name||p.id}))},preset={...presetSource,key:'preset',teamLayouts:manifest.teamLayouts,options:presetSource.options.map(option=>({...option,description:option.description||(presetSource.presentation==='mode'?presets.find(p=>p.id===option.value)?.description:undefined)}))};
    const controls=new Map(fields.map(field=>[field.key,ruleControl(field,'option-'+field.key,state.rules.options?.[field.key]??field.default,{readonly,game:state.game.id,mode:preset.presentation!=='mode'&&field.presentation==='mode'&&fields.find(item=>item.presentation==='mode')===field})]));
    const groups=manifest.ruleGroups||[{fields:fields.map(field=>field.key)}],endingKeys=new Set(groups.filter(group=>group.end).flatMap(group=>group.fields));
    const renderFields=group=>group.fields.filter(key=>controls.has(key)).map(key=>{const html=controls.get(key);controls.delete(key);return html;}).join('');
    const body=groups.filter(group=>!group.end).map(renderFields).join(''),ending=groups.filter(group=>group.end).map(renderFields).join(''),rest=[...controls.values()].join('');
    const parametersVisible=preset.options.length>1||fields.some(field=>!endingKeys.has(field.key)&&field.options.length>1),endingVisible=fields.some(field=>endingKeys.has(field.key)&&field.options.length>1);
    const common=g.max===1?'':`<section class="rules-v021-group" data-rule-section="order"><h3>Порядок игры</h3><div class="rules-v021-fields">${['firstPlayerMode','seatOrder'].map(key=>{const field=PlayroomMultiplayer.standardRule({key});return [key,field.label,field.options];}).filter(([name])=>name!=='firstPlayerMode'||manifest.capabilities?.firstPlayer!==false).map(([name,label,options])=>ruleControl({key:name,label,help:PlayroomLobbyView.ruleText(name==='seatOrder'?'seatOrder':'firstPlayer'),options},name,state[name]||(name==='seatOrder'?'normal':'rules'),{readonly})).join('')}</div></section>`;
    const header=modalHead('Параметры игры',{className:'rules-v021-header',actions:GameScreen.iconButton(`data-rules="${esc(state.game.id)}"`,'Как играть','help')});
    return {header,body:`<section class="rules-v021-summary"><strong data-rule-summary-label>Правила партии</strong><p data-rule-summary-text></p>${readonly?`<p class="rule-choice-readonly" role="status">${esc(reason)}</p>`:`<button class="btn secondary rules-v021-reset" type="button" data-command="reset-rules" aria-label="Восстановить стандарт" title="Восстановить стандарт">${icon('history')}<span>Восстановить стандарт</span></button>`}</section><div class="rules-v021-parameters">${common}<section class="rules-v021-group" data-rule-section="parameters" ${parametersVisible?'':'hidden'}><h3>Параметры</h3><div class="rules-v021-fields"><div class="rules-v021-preset">${ruleControl(preset,'preset',state.rules.preset,{mode:preset.presentation==='mode',readonly,game:state.game.id})}</div>${body}${rest}</div></section><section class="rules-v021-group" data-rule-section="ending" ${endingVisible?'':'hidden'}><h3>Завершение</h3><div class="rules-v021-fields">${ending}</div></section></div><div class="rules-v021-footer" data-fixed-footer><button class="btn secondary" type="button" data-command="close-modal">${readonly?'Закрыть':'Отмена'}</button>${readonly?'':`<button class="btn" type="submit" form="room-rules-form">${icon('check')}<span>Сохранить</span></button>`}</div>`};
  }
  function showRoomRulesEditor({room:externalRoom=null}={}){
    if(!externalRoom&&!room)return;
    const state=externalRoom||roomService.snapshot(room.id),actor=externalRoom?null:lobbyParticipantId;
    const readonly=!!externalRoom||state.ownerId!==actor||state.phase!=='lobby'||!!state.recovery;
    const reason=externalRoom?'Параметры меняет ведущий комнаты.':readonly?'Параметры можно менять до начала партии.':'';
    const valid=()=>{if(externalRoom){const current=globalThis.PlayroomNetworkLibrary?.inviteContext?.();return current?.room?.id===state.id&&current.room.game.id===state.game.id&&current.room.rulesRevision===state.rulesRevision;}if(room?.id!==state.id||lobbyParticipantId!==actor)return false;const current=roomService.snapshot(state.id);return current.ownerId===state.ownerId&&current.game.id===state.game.id&&current.phase===state.phase&&current.rulesRevision===state.rulesRevision;};
    const content=preparedPanel(roomRulePanelKey(state,readonly,reason),()=>roomRulePanelContent(state,readonly,reason));
    let disposeRuleLayout=()=>{};
    const frame=openModal(`${content.header}<form id="room-rules-form" class="rules-v021" data-game="${esc(state.game.id)}" data-room-id="${esc(state.id)}" data-room-actor="${esc(actor||'')}" data-readonly="${readonly}">${content.body}</form>`,'room-rules-modal',{valid,onBack:captureModalReturn(),onDispose:()=>disposeRuleLayout()});
    if(!frame)return;
    const form=frame.element.querySelector('#room-rules-form');form.ruleEditorCurrent=()=>valid()&&localModal.isActive(frame)&&!readonly;bindRuleChoices(form);syncRuleVisibility(form);let layoutFrame=0,retired=false;const dirty=new Set(),layoutCurrent=()=>!retired&&form.isConnected&&valid();
    const flushLayout=()=>{layoutFrame=0;if(!layoutCurrent()){disposeRuleLayout();return;}if(!localModal.isActive(frame))return;const fields=[...dirty];dirty.clear();syncRuleSummary(form);for(const field of fields)reserveRulePreview(field,JSON.parse(field.dataset.ruleSchema),form);};
    const queueLayout=()=>{if(!layoutFrame&&dirty.size)layoutFrame=requestAnimationFrame(flushLayout);};
    // Delivery only reads sizes. Temporary measurements and min-size writes run
    // in the next frame, outside ResizeObserver's delivery loop.
    const resize=new ResizeObserver(entries=>{if(!layoutCurrent()){disposeRuleLayout();return;}for(const entry of entries){const field=entry.target,width=entry.borderBoxSize?.[0]?.inlineSize??field.getBoundingClientRect().width;if(width<=0||Math.abs(width-field.ruleObservedInlineSize)<.25)continue;field.ruleObservedInlineSize=width;dirty.add(field);}queueLayout();});
    const activation=new MutationObserver(()=>{if(!layoutCurrent()){disposeRuleLayout();return;}if(localModal.isActive(frame))queueLayout();});activation.observe(frame.element,{attributes:true,attributeFilter:['data-surface-state']});
    disposeRuleLayout=()=>{if(retired)return;retired=true;cancelAnimationFrame(layoutFrame);layoutFrame=0;dirty.clear();resize.disconnect();activation.disconnect();};
    form.querySelectorAll('.rule-choice-field').forEach(field=>{field.ruleObservedInlineSize=field.getBoundingClientRect().width;resize.observe(field);});
    form.closest('.room-rules-modal').querySelector('[data-rules]').addEventListener('click',event=>{event.stopPropagation();const back=captureModalReturn();showRules(state.game.id);modalBack=back;});
  }
  function syncRuleSummary(form){
    const title=form.querySelector('[data-rule-summary-label]'),summary=form.querySelector('[data-rule-summary-text]');if(!title||!summary)return;
    const scrollport=form.closest('.modal-body'),scrollTop=scrollport?.scrollTop;
    const game=form.dataset.game,g=meta(game),manifest=catalog[game]||{},rules=roomRulesFromForm(form),fields=(manifest.settings||[]).map(PlayroomMultiplayer.standardRule);
    const standard=rules.preset===(g.presets?.[0]?.id||'default')&&rules.firstPlayerMode==='rules'&&rules.seatOrder==='normal'&&!rules.openHands&&fields.filter(field=>ruleOptionAvailable(field,form)).every(field=>String(rules.options[field.key])===String(field.default??field.options?.[0]?.value));
    title.textContent=standard?'Стандартные правила':'Свои правила';
    const values=rules.display.map(row=>row.label+': '+row.value);summary.replaceChildren(...values.slice(0,2).map(text=>{const item=document.createElement('span');item.textContent=text;return item;}));summary.title=values.join(' · ');
    // Reserve only this public summary's possible text height; no ghost DOM.
    const samples=new Set([summary.textContent]);for(const field of form.querySelectorAll('[data-rule-schema]')){const schema=JSON.parse(field.dataset.ruleSchema);for(const option of schema.options){if(samples.size>=64)break;const variant={...rules,options:{...rules.options}};if(schema.name.startsWith('option-'))variant.options[schema.name.slice(7)]=option.value;else variant[schema.name]=option.value;const display=Multiplayer.describeRules(variant,fields,false,manifest.presetSetting);samples.add(display.slice(0,2).map(row=>row.label+': '+row.value).join(' · '));}}
    const key=summary.clientWidth+':'+getComputedStyle(summary).font+':'+[...samples].sort().join('|');if(form.ruleSummaryReserveKey!==key){const cacheKey=publicPanelKey('summary-envelope',game,key),cached=ruleLayoutPreparation.get(cacheKey),nodes=[...summary.childNodes],width=summary.clientWidth;let max=cached??(width===form.ruleSummaryReserveWidth?parseFloat(summary.style.minBlockSize)||0:0);if(cached===undefined){summary.style.minBlockSize='0px';for(const sample of samples){summary.textContent=sample;max=Math.max(max,summary.getBoundingClientRect().height);}summary.replaceChildren(...nodes);ruleLayoutPreparation.set(cacheKey,Math.ceil(max));}summary.style.minBlockSize=Math.ceil(max)+'px';form.ruleSummaryReserveWidth=width;form.ruleSummaryReserveKey=key;}if(scrollport)scrollport.scrollTop=scrollTop;

  }
  function syncRuleVisibility(form){
    if(!form)return;
    for(const field of catalog[form.dataset.game]?.settings||[]){
      const row=form.querySelector('[data-rule-field="'+field.key+'"]');
      if(row){const unavailable=!ruleOptionAvailable(field,form);row.hidden=false;row.classList.toggle('is-unavailable',unavailable);row.dataset.ruleUnavailable=String(unavailable);const readonly=row.classList.contains('is-readonly');row.querySelectorAll('input,[data-rule-next],[data-rule-step]').forEach(control=>control.disabled=readonly||unavailable);}
    }
    syncRuleChoices(form);syncRuleSummary(form);
  }
  async function startOnlineGame({onSelect=async()=>{},onCancel=()=>{}}={}){
    const available=orderedVisibleGames().filter(g=>g.max>1&&V.supports(g.id,'player')&&V.supports(g.id,'table'));
    if(!available.length)throw Object.assign(Error('not-found'),{code:'not-found'});
    if(room||globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()){
      const original=captureUIOperation({account:true});
      if(!await GameScreen.confirmDialog('Выйти из текущей комнаты и создать новую?')||!original.current())return false;
      if(room){const id=room.id;await globalThis.PlayroomLobbyNetwork.closeRoom(id);if(!original.current())return false;leaveLobby();}
      else globalThis.PlayroomNetworkLibrary.leaveClientRoom();
    }
    const operation=captureUIOperation({account:true}),back=captureModalReturn();
    let frame=null,busy=false;
    const markup=`${modalHead('Выберите игру')}<div class="room-choice-list">${available.map(g=>GameScreen.packRow({id:g.id,version:g.version||'',name:g.name,manifest:catalog[g.id]||g,selectable:true,attrs:`data-social-game="${esc(g.id)}"`})).join('')}</div><p data-social-game-error role="alert"></p>`;
    frame=openModal(markup,'social-game-choice-modal',{valid:()=>operation.current({retained:true}),onBack:()=>{back();onCancel();}});
    if(!frame)return false;
    frame.element.addEventListener('click',event=>{
      const button=event.target.closest('[data-social-game]');
      if(!button||busy||!localModal.isActive(frame)||!operation.current({retained:true}))return;
      event.preventDefault();event.stopPropagation();busy=true;
      for(const item of frame.element.querySelectorAll('button'))item.disabled=true;
      try{
        const id=button.dataset.socialGame;
        if(!meta(id)||!activatePack(id))throw Object.assign(Error('not-found'),{code:'not-found'});
        setup(id);
      }catch(error){
        if(localModal.isActive(frame)&&operation.current({retained:true})){
          busy=false;for(const item of frame.element.querySelectorAll('button'))item.disabled=false;
          frame.element.querySelector('[data-social-game-error]').textContent=globalThis.PlayroomSocialUI.message(error);
        }
        return;
      }
      if(!room)return;
      const roomId=room.id;let created=captureUIOperation({account:true}),prepared=false;
      const finish=async()=>{
        try{
          if(!prepared){
            setRoomOption('transportMode','online');
            for(const participant of room.participants.filter(p=>p.bot))room=roomService.setLocalSeat(room.id,lobbyParticipantId,participant.seatId,{kind:'empty'});
            renderLobby();created=captureUIOperation({account:true});prepared=true;
          }
          await onSelect({roomId});
        }
        catch(error){
          if(!created.current())return;
          const retry=openModal(`${modalHead('Создание комнаты')}<p role="alert">${esc(globalThis.PlayroomSocialUI.message(error))}</p>${GameScreen.button({attrs:'data-social-game-retry',label:'Повторить'})}`,'social-game-error-modal',{valid:()=>created.current({retained:true})&&room?.id===roomId});
          retry?.element.querySelector('[data-social-game-retry]').addEventListener('click',()=>{if(localModal.isActive(retry)){closeModal();void finish();}},{once:true});
        }
      };
      void finish();
    });
    return true;
  }
  function roomGameChoicePlan(transportMode){
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{favorites:[]};
    const available=orderedVisibleGames().filter(g=>(transportMode==='hotseat'||g.max>1)&&V.supports(g.id,'player')&&V.supports(g.id,'table')).sort((a,b)=>Number(preferences.favorites.includes(b.id))-Number(preferences.favorites.includes(a.id)));
    return {available,key:publicPanelKey('game-choice','',[available.map(g=>publicPanelKey('installed-game',g.id,null)),preferences.favorites]),build:()=>`${modalHead(globalThis.PlayroomMessages.text("ui.app.3bba8537ff5d"))}<div class="room-choice-list">${available.map((g,i)=>`${i&&preferences.favorites.includes(available[i-1].id)&&!preferences.favorites.includes(g.id)?'<hr class="room-choice-divider">':''}${GameScreen.packRow({id:g.id,version:g.version||'',name:g.name,manifest:catalog[g.id]||g,selectable:true,attrs:`data-room-game="${esc(g.id)}"`})}`).join('')}</div>`};
  }
  function showRoomGameEditor(){
    if(!room||roomService.snapshot(room.id).phase!=='lobby'||room.ownerId!==lobbyParticipantId)return;
    const back=captureModalReturn(),plan=roomGameChoicePlan(room.transportMode);
    if(!plan.available.length)return toast(globalThis.PlayroomMessages.text('ui.app.631826417487'));
    openModal(preparedPanel(plan.key,plan.build),'room-game-picker-modal');modalBack=back;
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
  function updateRoomRules(form){if(form.dataset.readonly==='true'||!form.ruleEditorCurrent?.()||room?.id!==form.dataset.roomId||lobbyParticipantId!==form.dataset.roomActor)return;try{const rules=roomRulesFromForm(form);room=roomService.updateRules(room.id,lobbyParticipantId,rules);rememberRules(room.game.id,rules);closeModal(true);renderLobby();}catch(error){toast((error.code==='ROOM_RULES_INVALID'?(error.fieldLabel||globalThis.PlayroomMessages.text('ui.app.b5d827de5168'))+': ':'')+globalThis.PlayroomMessages.error(error));}}
  function toggleLobbyReady(){try{const me=room.participants.find(p=>p.id===lobbyParticipantId);room=roomService.setReady(room.id,lobbyParticipantId,!me?.ready);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function becomeLobbySpectator(){try{room=roomService.becomeSpectator(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  async function startLobbyCountdown(){
    try{
      if(room.transportMode==='hotseat')return await startHotSeat();
      room=roomService.beginCountdown(room.id,lobbyParticipantId,{seconds:3});lobbyCountdown=3;renderLobby();clearInterval(lobbyTimer);
      lobbyTimer=setInterval(()=>{const step=roomService.tick(room.id);room=step.room;lobbyCountdown=step.remaining;if(step.started||step.reason||step.room.phase!=='starting'){clearInterval(lobbyTimer);lobbyTimer=null;}renderLobby();if(step.reason)toast(step.reason);},250);
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function leaveLobby(){
    if(screen==='table')save();clearInterval(lobbyTimer);lobbyTimer=null;lobbyCountdown=null;
    globalThis.PlayroomNetworkLibrary?.leaveHostRoom?.(room?.id);
    room=null;lobbyParticipantId=null;cancelBot();closeModal(true);screen='hub';hubTab='games';flashPacksOnHub=true;renderHub();refreshPackUpdates();
  }
  function showPlayerNamePrompt(){
    const downloadable=!!globalThis.PlayroomRemotePacks?.availability().available,installState=globalThis.PlayroomPWA.installState();
    const setup=`<fieldset class="welcome-install-options"><legend>Подготовить ХОД</legend>${installState.mode!=='installed'?GameScreen.button({attrs:'data-install-open data-welcome-install',type:'button',label:'Установить приложение ХОД',icon:'install',variant:'secondary'}):''}<label class="welcome-install-choice"><input type="checkbox" name="installAllGames" ${downloadable&&!packs.list().length?'checked':''} ${downloadable?'':'disabled'}><span><strong>Установить все игры</strong><small>${downloadable?'Загрузим коллекцию для игры без интернета. Снимите отметку, если хотите выбрать игры отдельно.':'Для загрузки игр откройте веб-версию ХОД.'}</small></span></label></fieldset>`;
    openModal(`<header class="modal-head"><h2>Добро пожаловать в ХОД</h2></header><p class="lead">${globalThis.PlayroomMessages.text("ui.app.5418cf79756a")}</p><form id="profile-form"><div class="profile-identity-row">${globalThis.PlayroomAvatarPicker.button('',profileAvatar)}<label class="field"><span>${globalThis.PlayroomMessages.text("ui.app.f189892b63a9")}</span><input name="playerName" maxlength="24" autocomplete="nickname" placeholder="${globalThis.PlayroomMessages.text("ui.app.fec0b28c091d")}" required></label></div>${setup}<div class="profile-entry-actions">${globalThis.PlayroomAccountUI.markup({labelled:true})}<button class="btn" type="submit">${icon('play')} <span data-profile-play-label>${globalThis.PlayroomAccountUI.service.snapshot().kind==='account'?'Играть':'Играть без облака'}</span></button></div></form>`);
  }
  function savePlayerProfile(form){try{const installAll=form.elements.installAllGames?.checked===true;playerProfile=profileStore.save(form.elements.playerName.value,{avatar:profileAvatar});closeModal(true);render();window.dispatchEvent(new Event('playroom:profile-ready'));if(installAll)packUI?.open({installAll:true});}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function rulebookPanelContent(gameId,chosenRules){
    const g=meta(gameId),manifest=catalog[gameId];
    return `${PlayroomRulebookView.header()}${PlayroomLobbyView.gameRulesMarkup(g,manifest?.settings||[],{rules:chosenRules,presetSetting:manifest?.presetSetting,hasHands:!!manifest?.capabilities?.hands,firstPlayer:manifest?.capabilities?.firstPlayer!==false})}<p class="pack-line">${globalThis.PlayroomMessages.text("ui.app.a61be19c4d76")}${esc(g.id)} · ${g.min===g.max?g.min:g.min+'–'+g.max} ${globalThis.PlayroomMessages.text("ui.app.71d648b599c5")}</p><button class="btn" data-command="close-modal" style="width:100%;margin-top:10px">${globalThis.PlayroomMessages.text("ui.app.e2ce86b38fd5")}</button>`;
  }
  function prepareGamePanels(gameId,{state=null,readonly=false,reason='',valid=()=>true}={}){
    if(!meta(gameId))return;
    const publicState=state?{game:{id:gameId},rules:structuredClone(state.rules),firstPlayerMode:state.firstPlayerMode,seatOrder:state.seatOrder}:null;
    const rules=publicState?.rules||null;
    panelPreparation.prepare(publicPanelKey('rules',gameId,rules),()=>rulebookPanelContent(gameId,rules),{valid});
    if(publicState){panelPreparation.prepare(publicPanelKey('room-rules',gameId,rules),()=>roomRulebookPanelContent(publicState),{valid});panelPreparation.prepare(roomRulePanelKey(publicState,readonly,reason),()=>roomRulePanelContent(publicState,readonly,reason),{valid});}
  }
  function showRules(gameId=($('#modal-root .room-setup-modal,#room-rules-form')?room?.game?.id:session?.game)) {
    const returnBack=modalBack,fromRoom=!!room&&(!!$('#modal-root .room-setup-modal,#room-rules-form')||modalBack===renderLobby);
    if(!gameId)return showHelp();const g=meta(gameId),manifest=catalog[gameId];
    const chosenRules=fromRoom&&room?.game?.id===gameId?room.rules:session?.game===gameId?
      (session.options.lobbyConfig?.rules||{preset:session.options.preset,presetLabel:session.options.presetLabel,openHands:session.options.openHands,firstPlayerMode:session.options.firstPlayerMode,seatOrder:session.options.seatOrder,options:Object.fromEntries((manifest?.settings||[]).filter(field=>session.options[field.key]!==undefined).map(field=>[field.key,session.options[field.key]]))}):null;
    openModal(preparedPanel(publicPanelKey('rules',gameId,chosenRules),()=>rulebookPanelContent(gameId,chosenRules)),'rulebook-modal');
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
  function saveSettingsNickname(){
    const input=$('#modal-root [data-settings-screen]')?.querySelector('#setting-player-name,.lobby-profile input[name=nickname]');
    if(!input||input.disabled||input.value===input.dataset.nicknameCommitted)return true;
    const nickname=input.value.trim();if(!nickname){input.value=input.dataset.nicknameCommitted||playerProfile?.name||'';return true;}
    try{
      const client=input.closest('#net-client-nickname');
      if(!client&&input.closest('#lobby-nickname-form')&&room&&lobbyParticipantId)room=roomService.rename(room.id,lobbyParticipantId,nickname);
      playerProfile=profileStore.save(nickname);
      input.value=playerProfile.name;input.dataset.nicknameCommitted=input.value;
      if(client)void globalThis.PlayroomNetworkLibrary.renameNickname(playerProfile.name);
      return true;
    }catch(error){toast(globalThis.PlayroomMessages.error(error));return false;}
  }
  function showLocalProfile(){
    const back=captureModalReturn();let avatar=playerProfile?.avatar||profileAvatar;
    openModal(`${modalHead('Никнейм и аватар')}<form id="local-profile-editor"><div class="profile-identity-row"><button type="button" class="profile-avatar-button" data-local-profile-avatar aria-label="Выбрать аватар">${TabletopUI.avatar({name:playerProfile?.name||'',avatar},0)}</button><label class="field"><span>Никнейм</span><input name="nickname" maxlength="24" required autocomplete="nickname" value="${esc(playerProfile?.name||'')}"></label></div><p class="muted">Имя, которое увидят другие игроки.</p><button type="submit" class="btn">Сохранить</button></form>`,'local-profile-modal',{onBack:back});
    const form=$('#local-profile-editor');form.querySelector('[data-local-profile-avatar]').onclick=()=>globalThis.PlayroomAvatarPicker.open({name:form.elements.nickname.value,selected:avatar,isCurrent:avatarContext(form),onSelect:value=>{avatar=value;form.querySelector('[data-local-profile-avatar]').innerHTML=TabletopUI.avatar({name:form.elements.nickname.value,avatar},0);}});
    form.onsubmit=async event=>{event.preventDefault();if(form.dataset.saving)return;form.dataset.saving='true';const name=form.elements.nickname.value.trim(),ctx=globalThis.PlayroomNetworkLibrary?.inviteContext?.();try{if(ctx?.room){if(room?.id===ctx.room.id&&lobbyParticipantId===ctx.participantId){room=roomService.rename(room.id,lobbyParticipantId,name);room=roomService.setAvatar(room.id,lobbyParticipantId,avatar);}else{await globalThis.PlayroomNetworkLibrary.renameNickname(name);const current=globalThis.PlayroomNetworkLibrary.inviteContext();if(current?.room?.id===ctx.room.id&&current.participantId===ctx.participantId)await globalThis.PlayroomNetworkLibrary.setAvatar(avatar);}}playerProfile=profileStore.save(name,{avatar});profileAvatar=avatar;window.dispatchEvent(new Event('playroom:profile-identity-updated'));if(localModal.activeRoot()?.contains(form))closeModal();}catch(error){toast(globalThis.PlayroomMessages.error(error));}finally{delete form.dataset.saving;}};
  }
  function settingsRange(id,label,value,display,max){
    return `<label class="settings-v021-range preference-row preference-row--control" for="${id}" style="--range-progress:${value/max*100}%"><span class="settings-v021-range-heading"><span>${esc(label)}</span><output id="${id}-value" for="${id}">${esc(display)}</output></span><input type="range" id="${id}" min="0" max="${max}" step="1" value="${value}" aria-valuetext="${esc(display)}"></label>`;
  }
  function syncSettingsMotionControls(){
    const slider=$('#setting-speed'),toggle=$('#setting-reduced-motion'),value=speedLevels.indexOf(settings.animationSpeed),display=animationPresets[settings.animationSpeed].label;
    if(toggle)toggle.checked=settings.animationSpeed==='instant';
    if(slider){slider.value=String(value);slider.setAttribute('aria-valuetext',display);const output=document.getElementById('setting-speed-value');if(output)output.textContent=display;slider.closest('.settings-v021-range,.settings-range')?.style.setProperty('--range-progress',value/(speedLevels.length-1)*100+'%');}
  }
  let settingsTab='sound';
  const fullscreenActive=()=>!!document.fullscreenElement||document.documentElement.classList.contains('fullscreen-fallback');

  function refreshFullscreenEntry(){const active=fullscreenActive(),label=active?'Выйти из режима на весь экран':'На весь экран';for(const entry of document.querySelectorAll('[data-surface-fullscreen]')){entry.setAttribute('aria-pressed',String(active));entry.setAttribute('aria-label',label);entry.title=label;}}
  document.addEventListener('fullscreenchange',refreshFullscreenEntry);
  function showSettings(options={}) {
    const parentBack=modalBack,fromSettings=!!$('#modal-root [data-settings-screen]');
    const inGame=options.inGame??(!!document.querySelector('#app .table-shell')&&!$('#modal-root .room-setup-modal'));
    const settingsRoom=options.room||(inGame&&room?roomService.snapshot(room.id):null);
    const seatingGame=inGame?(settingsRoom?.game?.id||session?.game):null;
    const hasCardHand=!seatingGame||(catalog[seatingGame]?.capabilities?.hands&&catalog[seatingGame]?.category==='cards');
    if(options.category)settingsTab=['sound','accessibility'].includes(options.category)?'effects':options.category;
    if(!['effects','behavior'].includes(settingsTab))settingsTab='effects';
    const tabs=[['effects','Эффекты'],['behavior','Поведение']];
    let disposeDiagnostics=()=>{};
    openModal(`${modalHead('Настройки',{actions:globalThis.PlayroomAppearanceUI.settingsButton()+GameScreen.fullscreenAction()})}<div class="settings-v021 parameter-screen-content" data-settings-screen>${GameScreen.pageTabs({label:'Категории настроек',tabs,value:settingsTab,attribute:'data-settings-tab',className:'settings-v021-tabs',idPrefix:'settings-tab-',panelPrefix:'settings-panel-'})}
      <section id="settings-panel-effects" role="tabpanel" aria-labelledby="settings-tab-effects" data-settings-panel="effects" ${settingsTab==='effects'?'':'hidden'}>${settingsRange('setting-volume','Громкость',settings.sound?Math.round(settings.volume*100):0,(settings.sound?Math.round(settings.volume*100):0)+'%',100)}<label class="switch preference-row preference-row--control"><span>Звуки интерфейса ${PlayroomLobbyView.fieldHelp('Различимые сигналы сообщений, приглашений и других событий. Общая громкость действует и на звуки игр.','Звуки интерфейса')}</span><input type="checkbox" id="setting-ui-sounds" ${settings.uiSounds!==false?'checked':''}></label>${settingsRange('setting-speed','Скорость анимации',speedLevels.indexOf(settings.animationSpeed),animationPresets[settings.animationSpeed].label,speedLevels.length-1)}<label class="switch preference-row preference-row--control"><span>Меньше движения</span><input type="checkbox" id="setting-reduced-motion" ${settings.animationSpeed==='instant'?'checked':''}></label>${inGame&&hasCardHand?`<label class="switch preference-row preference-row--control"><span>Карты по дуге</span><input type="checkbox" id="setting-hand-shape" ${settings.handShape==='arc'?'checked':''}></label>`:''}</section>
      <section id="settings-panel-behavior" role="tabpanel" aria-labelledby="settings-tab-behavior" data-settings-panel="behavior" ${settingsTab==='behavior'?'':'hidden'}><label class="switch preference-row preference-row--control"><span>Быстрый ход</span><input type="checkbox" id="setting-quick-play" ${settings.quickPlay?'checked':''}></label><label class="switch preference-row preference-row--control"><span>Подсказки во всех играх</span><input type="checkbox" id="setting-tutorials" ${settings.tutorialsEnabled!==false?'checked':''}></label><div data-push-settings>${globalThis.PlayroomPushUI.markup()}</div>${inGame?globalThis.PlayroomTutorialSettings.markup(seatingGame):''}<label class="switch preference-row preference-row--control"><span>Передавать устройство автоматически</span><input type="checkbox" id="setting-auto-pass" ${(isPass()?autoPassForViewer():settings.autoPass)?'checked':''}></label><label class="switch preference-row preference-row--control"><span>Недавняя игра в каталоге</span><input type="checkbox" id="setting-last-game" ${settings.showLastGame?'checked':''}></label>
      <details class="settings-diagnostics"><summary>Диагностика</summary><button type="button" class="btn secondary" data-bug-report-open>Обратная связь</button><label class="switch preference-row preference-row--control"><span>Запись логов</span><input type="checkbox" id="setting-diagnostics" ${diagnostics?.enabled?'checked':''}></label><p class="muted" data-diagnostics-size>${globalThis.PlayroomBugAttachments.formatLog(null)}</p><div class="settings-diagnostics-actions"><button type="button" class="btn secondary" data-diagnostics-download aria-label="Скачать диагностику" title="Скачать диагностику с логом и сохранением текущей партии">Скачать</button><button type="button" class="btn secondary" data-diagnostics-clear aria-label="Остановить запись и очистить лог">Очистить</button></div><p role="status" data-diagnostics-status hidden></p></details></section><button type="button" class="text-btn settings-v021-reset" data-command="reset-settings">${icon('undo')}<span>Восстановить настройки</span></button><p class="settings-v021-version">ХОД · ${esc(appVersion)}</p></div>`,'settings-modal',{onDispose:()=>disposeDiagnostics()});
    const settingsHost=$('[data-settings-screen]');settingsHost.querySelector('[data-bug-report-open]').onclick=()=>globalThis.PlayroomBugReportUI.show();disposeDiagnostics=globalThis.PlayroomDiagnosticsUI.bind(settingsHost,diagnostics,globalThis.PlayroomBugAttachments);settingsHost.addEventListener('click',event=>{const button=event.target.closest('[data-settings-tab]');if(!button)return;settingsTab=button.dataset.settingsTab;settingsHost.querySelector('.settings-v021-tabs').style.setProperty('--page-index',tabs.findIndex(([id])=>id===settingsTab));for(const tab of settingsHost.querySelectorAll('[data-settings-tab]'))tab.setAttribute('aria-selected',String(tab===button));for(const panel of settingsHost.querySelectorAll('[data-settings-panel]'))panel.hidden=panel.dataset.settingsPanel!==settingsTab;GameScreen.syncPageTabs(settingsHost.querySelector('.settings-v021-tabs'));});GameScreen.bindPageTabs(settingsHost.querySelector('.settings-v021-tabs'));
    if(fromSettings)modalBack=parentBack;
    const settingsBack=modalBack;
    settingsReturn=()=>{showSettings({...options,inGame});modalBack=settingsBack;};
    const nicknameInput=$('#modal-root [data-settings-screen]')?.querySelector('#setting-player-name,.lobby-profile input[name=nickname]');if(nicknameInput)nicknameInput.dataset.nicknameCommitted=nicknameInput.value;
    attachSettingsHelp();globalThis.PlayroomInterfaceScale.sync();
  }
  function attachSettingsHelp(){
    const root=document.querySelector('.modal:has([data-settings-screen])');if(!root)return;
    for(const id of ['setting-player-name','setting-hand-shape','setting-seating','setting-last-game','setting-auto-pass','setting-quick-play','setting-volume','setting-speed','setting-reduced-motion','setting-tutorials','setting-diagnostics']){
      const input=root.querySelector('#'+id);if(!input)continue;
      const field=input.closest('.settings-v021-range,.settings-range,.field,.switch');
      const title=field.querySelector('.settings-v021-range-heading > span,.settings-range-heading > span')||field.querySelector(':scope > span');if(!title)continue;const label=title.textContent;
      const wrapper=document.createElement('div');
      wrapper.className=root.querySelector('[data-settings-screen]')?'settings-v021-field-help':'setting-with-help';field.before(wrapper);wrapper.append(field);
      const help=globalThis.PlayroomMessages.text('ui.app.help.'+id);
      title.outerHTML=settingTitle(label,help,{wrap:field.matches('.switch')});
      wrapper.querySelector('.rule-help>button')?.setAttribute('aria-label','Справка: '+label);
    }
  }
  function showCardHelp({present=openModal}={}) {
    const memo=document.querySelector('template[data-game-memo]');
    if(memo){present(`${modalHead(memo.dataset.title||'Памятка')}${memo.innerHTML}`,'game-memo-modal');return;}
    const cards=[...document.querySelectorAll('.own-hand .hand-card[data-tooltip]')],seen=new Set();
    const entries=cards.filter(card=>{const text=card.dataset.tooltip;if(seen.has(text))return false;seen.add(text);return true;});
    const intro=document.querySelector('template[data-card-help-intro]')?.innerHTML||'';
    const details=entries.map(card=>{const illustration=card.querySelector('template[data-card-help-art]')?.innerHTML||card.querySelector('.piece-art')?.outerHTML||'';return `<li class="card-help-entry">${illustration?`<div class="card-help-art" aria-hidden="true" style="${esc(card.getAttribute('style')||'')}">${illustration}</div>`:''}<div class="card-help-copy"><strong>${esc(card.getAttribute('aria-label'))}</strong><p>${esc(card.dataset.tooltip)}</p></div></li>`;}).join('');
    present(`${modalHead(globalThis.PlayroomMessages.text("ui.app.b7f6f3448201"))}${intro}<p class="lead">${globalThis.PlayroomMessages.text("ui.app.9751c986689e")}</p><ul class="card-help-list">${details||("<li>"+globalThis.PlayroomMessages.text("ui.app.91e23b5cc854")+"</li>")}</ul>`);
  }
  function showPlayerActions(target) {
    if(isReplay()||paused||gate!==null||!session)return;
    const action=activeActions(session.current).find(a=>a.target===target&&a.targetKind==='player');
    if(!action)return;
    const name=session.current.players[target].name;
    playerTargets?.tap(target);
  }
  function showResult(automatic=false) {
    const fromLobby=!!$('#modal-root>[data-surface-state=active] .lobby-shell');
    if(!session||session.current.status!=='finished'||screen!=='table'&&!fromLobby)return;
    lastResult=session.createdAt;if(room?.transportMode==='hotseat'&&historyOrigin?.kind!=='library')completedRoom={roomId:room.id,session};
    const shownViewer=isPass()?-1:viewer,state=E.project(session.current,shownViewer);
    openModal(GameScreen.resultMarkup({state,viewer:shownViewer,canRematchStart:!historyOrigin,...(historyOrigin?.kind==='library'?{returnAction:{command:'history-close',label:'Назад'}}:{}),gameName:meta(session.game).name,scoreLabel:meta(session.game).scoreLabel||globalThis.PlayroomMessages.text("ui.app.d7ab0767bbee")}),'result-modal',{keepAudio:true,...(historyOrigin?.kind==='library'?{onBack:closeHistory}:{})});
    const panel=$('#modal-root>[data-surface-state=active] .result-modal');if(panel)panel.dataset.resultOrigin=fromLobby?'lobby':'table';
    if(automatic===true)GameScreen.presentResultSound(session,state,shownViewer,(ids,pack)=>globalThis.PlayroomAppBridge.audio.play(ids,pack));
  }
  function captureHistoryOrigin(kind){return {kind,session,sessionId,viewer,gate,paused,awaitingPass,screen,hubTab,scrollY:window.scrollY};}
  function restoreHistoryOrigin(){const origin=historyOrigin;if(!origin)return;historyOrigin=null;session=origin.session;sessionId=origin.sessionId;viewer=origin.viewer;gate=origin.gate;paused=origin.paused;awaitingPass=origin.awaitingPass;screen=origin.screen;hubTab=origin.hubTab;return origin;}
  function openLibraryHistory(id,{results=false}={}){
    const next=library.open(id);interruptAction();cancelBot();clearTimeout(autoPassTimer);stopReplay();
    const origin=captureHistoryOrigin('library');setLocalPaused(true);historyOrigin=origin;session=next;sessionId=id;screen='table';paused=true;gate=null;awaitingPass=false;
    viewer=Math.max(0,next.current.players.findIndex(p=>!p.bot&&p.name===playerProfile?.name));if(!next.current.players.some(p=>!p.bot&&p.name===playerProfile?.name))viewer=Math.max(0,next.current.players.findIndex(p=>!p.bot));
    selected=null;historyOpen=!results;replayIndex=results?null:next.states.length-1;closeModal(true);renderTable();if(results)showResult();
  }
  function closeHistory(){globalThis.PlayroomUIFeedback?.back();stopReplay();if(historyOrigin?.kind==='library'&&!historyOpen)closeModal(true);if(historyOrigin?.kind==='library'&&historyOrigin.returnToResults){historyOrigin.returnToResults=null;historyOpen=false;replayIndex=null;selected=null;renderTable();showResult();return;}const origin=restoreHistoryOrigin();historyOpen=false;replayIndex=null;selected=null;setLocalPaused(paused);render();if(origin?.returnToResults){if(origin.returnToResults==='lobby')renderLobby();showResult();}else if(origin?.kind==='library')requestAnimationFrame(()=>window.scrollTo(0,origin.scrollY));}
  async function stopLocalMatch(confirmed=false){
    if(!session||session.current.status!=='playing'||room?.transportMode!=='hotseat'||room.phase!=='playing')return;
    if(!confirmed){const expectedSession=session,roomId=room.id;return confirmOperation(globalThis.PlayroomMessages.text("ui.app.986b3d9186b8"),{isCurrent:()=>session===expectedSession&&room?.id===roomId,onConfirm:()=>stopLocalMatch(true)});}
    interruptAction();cancelBot();stopReplay();
    if(!await save())return;
    await library.setArchivedAsync('local:'+sessionId,true);setLocalPaused(true);gate=null;awaitingPass=false;
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
    completedRoom={roomId:room.id,session:completed};closeModal(true);renderLobby();
  }
  function openHistory(from=null) {
    clearViewHints();interruptAction();if(!historyOrigin)historyOrigin=captureHistoryOrigin('live');screen='table';
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
      const nextIndex=historyPresentationEnd(replayIndex+1);
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
      else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
      else {const enabled=document.documentElement.classList.toggle('fullscreen-fallback');toast(enabled?globalThis.PlayroomMessages.text("ui.app.2bce29e3ceaa"):globalThis.PlayroomMessages.text("ui.app.a225326b7ef6"));}
    }catch(_){toast(globalThis.PlayroomMessages.text("ui.app.a2c8210f6267"));}
    finally{refreshFullscreenEntry();}
  }
  const commands={
    'profile-edit':showLocalProfile,'notifications-settings':()=>showSettings({category:'behavior'}),
    'dismiss-notice':dismissNotice,
    'dismiss-recovery'(){loadWarning='';renderHub();},
    rematch,'rematch-start':async()=>{await rematch();if(room?.transportMode==='hotseat'&&roomService.canStart(room.id))await startLobbyCountdown();},
    home(){leaveTable('games');globalThis.PlayroomUIFeedback?.back();},
    sessions(){leaveTable('sessions');},
    resume(){resumeSession();},
    'hide-local-session'(){settings.hiddenLocalSession=sessionId;settingsStore.write(settings);renderHub();},
    'show-updates'(){const origin=noticeElement.contains(document.activeElement)&&noticeElement.returnFocus;if(origin?.isConnected&&origin.getClientRects().length&&!origin.closest('[hidden],[inert]')&&!origin.matches(':disabled'))origin.focus({preventScroll:true});showUpdates(true);},
    'check-updates':checkUpdates,
    'update-all'(){return updateEverything(true);},
    'update-packs'(){closeModal(true);commands.packs();},
    async 'download-app'(){try{await globalThis.PlayroomPWA.downloadUpdate();}catch(error){const status=$('[data-update-status]');if(status&&error.code!=='update-changed')status.textContent=globalThis.PlayroomMessages.error(error);}globalThis.PlayroomUpdateDialog.sync();},
    async 'update-app'(){
      const button=$('[data-command="update-app"]'),status=$('[data-update-status]');if(!button)return;if(room||globalThis.PlayroomNetworkLibrary?.hasActiveRoom?.()){status.textContent=globalThis.PlayroomMessages.text('ui.updates.leave-room');return;}button.disabled=true;
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
      for(const input of form.elements){if(!(input.name in values))continue;const value=values[input.name];if(input.type==='radio')input.checked=input.value===String(value);else if(input.type==='checkbox')input.checked=!!value;else if(input.dataset.choiceOptions){input.value=Math.max(0,JSON.parse(input.dataset.choiceOptions).findIndex(o=>o.value===value));syncChoice(input);}else input.value=value;}
      syncRuleVisibility(form);
    },'reset-settings':async()=>{const original=document.querySelector('[data-settings-screen]'),resume=settingsReturn,network=!!document.querySelector('.network-game');if(!await GameScreen.confirmDialog(globalThis.PlayroomMessages.text('ui.app.confirm-reset-settings'))||!original?.isConnected||!localModal.activeRoot()?.contains(original))return;settings=globalThis.PlayroomPlayerSettings.defaults();settingsStore.write(settings);syncDisplayCutout();audio.setEnabled(settings.sound);audio.setVolume(settings.volume);syncReducedMotion();window.dispatchEvent(new Event('playroom:game-options'));if(!network){if(screen==='table')renderTable();else if(screen==='hub')renderHub();}if(resume)resume();else showSettings();},'card-help':showCardHelp,fullscreen,rules:()=>showRules(),
    'room-rules':showRoomRulesEditor,'room-change-game':showRoomGameEditor,
    'lobby-ready':toggleLobbyReady,
    'lobby-spectator':becomeLobbySpectator,
    'lobby-table':()=>{try{room=roomService.claimTable(room.id,lobbyParticipantId);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}},
    'stop-local-match':stopLocalMatch,
    'lobby-start':startLobbyCountdown,
    'lobby-leave':async()=>{const expected=room;if(room&&!await GameScreen.confirmDialog(room.transportMode==='hotseat'?'Выйти из комнаты? Партия сохранится на устройстве.':globalThis.PlayroomMessages.text("ui.app.15bd355dbb93")))return;if(room===expected){try{await globalThis.PlayroomLobbyNetwork?.closeRoom?.(room?.id);if(room===expected){leaveLobby();globalThis.PlayroomUIFeedback?.back();}}catch(error){toast(globalThis.PlayroomSocialUI.message(error));}}},
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
    'result-replay'(){const origin=$('#modal-root>[data-surface-state=active] .result-modal')?.dataset.resultOrigin||'table';closeModal(true);openHistory(0);historyOrigin.returnToResults=origin;commands['replay-play']();}
  };
  input=globalThis.TabletopInput.attach({
    canStart(source){return screen==='table'&&!!session&&!source.disabled&&!$('#modal-root').children.length&&activeActions(session.current).length>0;},
    canSelect(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&!transition&&(viewer===session.current.turn||source.hasAttribute('data-hand-preview'));},
    canCommit(source){return screen==='table'&&!!session&&!$('#modal-root').children.length&&!isReplay()&&!paused&&gate===null&&(!transition||activeActions(session.current).some(action=>Protocol.canonical(action)===Protocol.canonical(JSON.parse(source?.dataset.action||'null'))));},
    getSelected(){return selected;},
    select(piece,context){const hints=clearViewHints(),key=context?.viewKey&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(context.viewKey)?context.viewKey:null,changed=key?viewState[key]!==piece:selected!==piece;if(key)viewState[key]=piece;else selected=piece;if(changed||hints||!localInputsCurrent())renderTable();},
    commit(action,context){act(viewer,action,context);}
  });
  playerTargets=new globalThis.PlayroomPlayerTarget({
    actions:()=>screen==='table'&&session&&!isReplay()&&!paused&&gate===null?activeActions(session.current):[],
    selected:()=>selected,commit:action=>act(viewer,action),root:()=>document.querySelector('#app .table-shell')
  });
  let hubDragged=null;
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest?.('.hub-edit-section .game-tile[data-game]');
    if(!hubEditing||!card||event.target.closest('button'))return;
    hubDragged=card.dataset.game;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',hubDragged);
  });
  document.addEventListener('dragover',event=>{if(hubDragged&&event.target.closest?.('[data-edit-drop]'))event.preventDefault();});
  document.addEventListener('drop',event=>{if(!hubDragged)return;event.preventDefault();const id=hubDragged;hubDragged=null;hubDropAt(id,event.target,event);});
  document.addEventListener('dragend',()=>{hubDragged=null;});
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;
    const restartGuides=event.target.closest('[data-restart-guides]');if(restartGuides){void globalThis.PlayroomTutorialSettings.restart(restartGuides.dataset.restartGuides);return;}
    const allBots=event.target.closest('[data-bots-difficulty]');if(allBots){try{room=roomService.setBotsDifficulty(room.id,lobbyParticipantId,allBots.dataset.botsDifficulty);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    const botSettingsButton=event.target.closest('[data-bot-settings]');if(botSettingsButton){showBotSettings(JSON.parse(botSettingsButton.dataset.botSettings));return;}
    const decisionPlayer=event.target.closest('[data-decision-player]');if(decisionPlayer&&!event.target.closest('.network-game')&&isPass()&&session&&!transition&&!paused){const actor=Number(decisionPlayer.dataset.decisionPlayer);if(!session.current.players[actor]?.bot&&E.decisionWindow(session.current)?.participants.includes(actor)){gate=actor;awaitingPass=false;renderTable();}return;}
    if(event.target.closest('[data-avatar-picker]')){
      const button=event.target.closest('[data-avatar-picker]'),clientAvatar=button.hasAttribute('data-avatar-client');
      const input=button.closest('form')?.querySelector('[name=playerName],[name=nickname]');
      const name=input?.value||playerProfile?.name||'';
      globalThis.PlayroomAvatarPicker.open({name,selected:profileAvatar,isCurrent:avatarContext(button),onSelect:avatar=>{
        try{if(playerProfile?.name)playerProfile=profileStore.save(playerProfile.name,{avatar});}catch(error){toast(globalThis.PlayroomMessages.error(error));return;}
        profileAvatar=avatar;
        if(!clientAvatar&&room&&lobbyParticipantId){room=roomService.setAvatar(room.id,lobbyParticipantId,avatar);}else if(clientAvatar||document.querySelector('.network-game'))void globalThis.PlayroomNetworkLibrary?.setAvatar?.(avatar);
        for(const button of document.querySelectorAll('[data-avatar-picker]'))button.innerHTML=TabletopUI.avatar({name,avatar},0);
      }});return;
    }
    if(event.target.closest('.network-game,.shared-modal-backdrop'))return;
    const replacement=event.target.closest('[data-player-replacement]');if(replacement){event.preventDefault();openModal(`${modalHead(globalThis.PlayroomMessages.text("ui.app.261faa27d0a0"))}<p>${esc(replacement.getAttribute('title')||replacement.dataset.tooltip)}</p>`);return;}
    const preference=event.target.closest('[data-view-preference]');if(preference&&screen==='table'){const key=preference.dataset.viewPreference,before=screenController.preferences(TabletopUI.viewPreferences(session.game,viewer))[key],cleared=Object.keys(viewState).length>0;if(!screenController.setPreference(key,preference.dataset.viewValue))TabletopUI.viewPreferences(session.game,viewer,key,preference.dataset.viewValue);const after=screenController.preferences(TabletopUI.viewPreferences(session.game,viewer))[key];for(const key of Object.keys(viewState))delete viewState[key];screenController.viewState=viewState;if(before!==after||cleared||!localInputsCurrent())renderTable();return;}
    const viewControl=event.target.closest('[data-view-key]');
    if(viewControl&&!viewControl.disabled&&screen==='table'){const {viewKey,viewValue}=viewControl.dataset;if(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(viewKey)&&viewValue.length<=80){const changed=viewState[viewKey]!==viewValue;viewState[viewKey]=viewValue;if(changed||!localInputsCurrent())renderTable(false,false,viewControl.dataset.viewLayout==='stable');}return;}
    if(event.target.closest('.player-target-menu'))return;
    const person=event.target.closest('[data-player-target],[data-player-panel-target]');
    if(person){showPlayerActions(Number(person.dataset.playerTarget??person.dataset.playerPanelTarget));return;}
    const button=event.target.closest('button,[data-action],[data-select],[data-cell],[data-drop-select]');
    if(!button){const tile=event.target.closest('.game-tile:not(.is-editing)[data-game]');if(tile&&!hubEditing)showGameCard(tile.dataset.game);return;}
    if(button.disabled)return;
    if(button.dataset.roomGame){updateRoomGame(button.dataset.roomGame);return;}
    if(button.dataset.roomCycle){showRoomSeatChoices(button.dataset.roomCycle);return;}
    if(button.dataset.roomBot){try{room=roomService.setLocalSeat(room.id,lobbyParticipantId,button.dataset.roomBot,{kind:'bot',nickname:button.dataset.botName});renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    if(button.dataset.savedFilter){savedFilter=button.dataset.savedFilter;updateSavedPanel();return;}
    if(button.hasAttribute('data-clear-games-confirm')){void askClearLocalGames();return;}
    if(button.hasAttribute('data-clear-cloud-games')){button.disabled=true;void globalThis.PlayroomCloudSavesUI.removeAll().catch(error=>toast(globalThis.PlayroomMessages.error(error))).finally(()=>{if(button.isConnected)button.disabled=false;});return;}
    if(button.hasAttribute('data-clear-games')){void askClearGames();return;}
    if(button.dataset.savedArchive){void archiveSaved(button.dataset.savedArchive);return;}
    if(button.dataset.savedResults){resumeSession(button.dataset.savedResults,{results:true});return;}
    if(button.dataset.historyId){resumeSession(button.dataset.historyId,{history:true});return;}
    if(button.dataset.resumeId){resumeSession(button.dataset.resumeId);return;}
    if(button.dataset.deleteNetworkConfirm){void deleteNetworkSession(button.dataset.deleteNetworkConfirm);return;}
    if(button.dataset.deleteNetwork){askDeleteNetwork(button.dataset.deleteId);return;}
    if(button.dataset.deleteId){try{askDelete(button.dataset.deleteId);}catch(_){toast(globalThis.PlayroomMessages.text("ui.app.6b8c3ec1a675"));}return;}
    if(button.dataset.deleteConfirm){deleteSession(button.dataset.deleteConfirm);return;}
    if(button.dataset.lobbySeat){claimLobbySeat(button.dataset.lobbySeat);return;}
    if(button.dataset.kickParticipant){kickLobbyParticipant(button.dataset.kickParticipant);return;}
    if(button.hasAttribute('data-edit-toggle')){hubEditing=!hubEditing;renderHub();return;}
    if(button.dataset.editStep){editHubStep(button.dataset.editId,Number(button.dataset.editStep));return;}
    if(button.dataset.command){const child=button.dataset.surfaceAction==='child'&&localModal.activeRoot()?.contains(button);if(button.hasAttribute('data-quick-shortcut')&&button.dataset.command!=='fullscreen'&&!child)closeModal(true);commands[button.dataset.command]?.();return;}
    if(button.dataset.favorite){try{globalThis.PlayroomPackManager.toggleFavorite(button.dataset.favorite);renderHub();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    if(button.dataset.recentStart){showGameCard(button.dataset.recentStart);return;}
    if(button.dataset.start){showGameCard(button.dataset.start);return;}
    if(button.dataset.rules){showRules(button.dataset.rules);return;}
    if(button.hasAttribute('data-hub-filters-toggle')){showCatalogFilters();return;}
    if(button.dataset.tag){const kind=button.dataset.tagKind;hubFilters[kind]=hubFilters[kind]===button.dataset.tag?'':button.dataset.tag;renderHub();return;}
    if(button.dataset.format){hubFilters.format=hubFilters.format===button.dataset.format?'':button.dataset.format;renderHub();return;}
    if(button.hasAttribute('data-action')&&button.hasAttribute('data-close-on-action'))closeModal(true);
    input.handleClick(event);
  });
  document.addEventListener('submit',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;
    if(event.target.hasAttribute('data-room-context-name')){event.preventDefault();saveRoomContextName(event.target);}
    else if(event.target.id==='room-human-form'){event.preventDefault();try{room=event.target.dataset.rename?roomService.renameLocalSeat(room.id,lobbyParticipantId,event.target.dataset.seat,event.target.elements.nickname.value):roomService.setLocalSeat(room.id,lobbyParticipantId,event.target.dataset.seat,{kind:'human',nickname:event.target.elements.nickname.value});renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
    else if(event.target.id==='profile-form'){event.preventDefault();savePlayerProfile(event.target);}
    else if(event.target.id==='lobby-nickname-form'){event.preventDefault();if(!event.target.closest('.modal:has([data-settings-screen])'))updateLobbyNickname(event.target);}
    else if(event.target.id==='room-rules-form'){event.preventDefault();updateRoomRules(event.target);}
    else if(event.target.id==='room-game-form'){event.preventDefault();updateRoomGame(event.target);}
  });
  document.addEventListener('input',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;if(event.target.matches('#profile-form [name=playerName],#setting-player-name,.lobby-profile [name=nickname]'))for(const button of document.querySelectorAll('[data-avatar-picker]'))button.innerHTML=TabletopUI.avatar({name:event.target.value,avatar:profileAvatar},0);});
  document.addEventListener('change',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;
    if(event.target.hasAttribute('data-room-auto-start')){try{room=roomService.setAutoStart(room.id,lobbyParticipantId,event.target.checked);renderLobby();}catch(error){toast(globalThis.PlayroomMessages.error(error));}return;}
    if(event.target.id==='setting-learning-enabled'){globalThis.PlayroomFirstTurnGuide.setEnabled(event.target.dataset.game,event.target.checked);return;}
    const input=event.target;if(input.dataset.viewRange&&!input.disabled&&!input.closest('.network-game')&&screen==='table'){const choices=JSON.parse(input.dataset.choiceOptions),choice=choices[Number(input.value)];if(choice&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(input.dataset.viewRange)){const value=String(choice.value),changed=viewState[input.dataset.viewRange]!==value;viewState[input.dataset.viewRange]=value;if(changed||!localInputsCurrent())renderTable();}return;}
    if(event.target.id==='history-viewer'&&historyOrigin?.kind==='library'){stopReplay();viewer=Number(event.target.value);renderTable();return;}
    if(event.target.closest('#room-rules-form')){syncChoice(event.target);syncRuleVisibility(event.target.form);return;}
    try{if(event.target.hasAttribute('data-room-title'))return;if(event.target.dataset.roomOption){setRoomOption(event.target.dataset.roomOption,event.target.type==='checkbox'?(event.target.checked?'network':'hotseat'):event.target.value);return;}}catch(error){toast(globalThis.PlayroomMessages.error(error));renderLobby();return;}
    if(['setting-tutorials','setting-ui-sounds','setting-reduced-motion','setting-speed','setting-auto-pass','setting-quick-play','setting-volume','setting-seating','setting-hand-shape','setting-last-game'].includes(event.target.id)){
      if(event.target.id==='setting-tutorials'){settings.tutorialsEnabled=event.target.checked;}
      else if(event.target.id==='setting-ui-sounds'){settings.uiSounds=event.target.checked;}
      else if(event.target.id==='setting-reduced-motion'){settings.animationSpeed=event.target.checked?'instant':'normal';}
      else if(event.target.id==='setting-volume'){const percent=Number(event.target.value);settings.sound=percent>0;if(percent>0)settings.volume=percent/100;soundTicket++;audio.setEnabled(settings.sound);audio.setVolume(settings.volume);document.querySelectorAll('[data-sound-control]').forEach(el=>el.disabled=!settings.sound);}
      else if(event.target.id==='setting-auto-pass'){const preference=isPass()?hotseatPreference():null;if(!preference||preference.primary)settings.autoPass=event.target.checked;else if(preference)settings.hotseatAutoPass={...settings.hotseatAutoPass,[preference.key]:event.target.checked};}
      else if(event.target.id==='setting-quick-play')settings.quickPlay=event.target.checked;
      else if(event.target.id==='setting-seating'){const game=event.target.dataset.game;if(game&&['circle','anchors','row'].includes(choiceValue(event.target)))settings.seatingByGame[game]=choiceValue(event.target);}
      else if(event.target.id==='setting-hand-shape')settings.handShape=event.target.checked?'arc':'straight';
      else if(event.target.id==='setting-last-game')settings.showLastGame=event.target.checked;
      else {settings.animationSpeed=speedLevels[Number(event.target.value)]||'normal';}
      if(['setting-reduced-motion','setting-speed'].includes(event.target.id))syncSettingsMotionControls();
      syncReducedMotion();
      settingsStore.write(settings);
      window.dispatchEvent(new Event('playroom:game-options'));
      if(event.target.id==='setting-last-game'&&screen==='hub')renderHub();
      if(['setting-seating','setting-hand-shape','setting-auto-pass'].includes(event.target.id)&&screen==='table'&&!document.querySelector('.network-game'))renderTable();
      if(event.target.id==='setting-volume')void previewSound();
    }
  });
  document.addEventListener('input',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;
    const input=event.target;if(input.dataset.choiceOptions){syncChoice(input);if(input.closest('#room-rules-form'))syncRuleVisibility(input.form);return;}if(!['setting-volume','setting-speed'].includes(input.id))return;
    const value=Number(input.value),display=input.id==='setting-scale'?value+'%':input.id==='setting-volume'?value+'%':animationPresets[speedLevels[value]].label;
    input.setAttribute('aria-valuetext',display);document.getElementById(input.id+'-value').textContent=display;
    input.closest('.settings-v021-range,.settings-range').style.setProperty('--range-progress',((value-Number(input.min))/(Number(input.max)-Number(input.min))*100)+'%');
  });
  document.addEventListener('input',event=>{
    if(event.target?.closest?.('[data-surface-state="suspended"]'))return;
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
  // This SPA owns page/modal scroll; native same-document history must not overwrite it.
  if('scrollRestoration' in history)history.scrollRestoration='manual';
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
    if(top){const event=new Event('cancel',{cancelable:true});if(top.dispatchEvent(event))top.close();if(!top.open)globalThis.PlayroomUIFeedback?.back();return;}
    if(globalThis.PlayroomHostTransferUI?.dismissIncomingPanel?.()){globalThis.PlayroomUIFeedback?.back();return;}
    if($('#modal-root').children.length){closeModal();return;}
    if(globalThis.PlayroomGameMenu?.opened){globalThis.PlayroomGameMenu.close();return;}
    if(globalThis.PlayroomGameChatPanel?.opened){globalThis.PlayroomGameChatPanel.close();return;}
    if(screen==='lobby'){commands['lobby-leave']();return;}
    if(historyOpen){commands['history-close']();return;}
    if(screen==='table'||document.querySelector('.network-game')){
      if(await GameScreen.confirmDialog(globalThis.PlayroomMessages.text('ui.app.confirm-leave-table'))){
        const back=document.querySelector('.table-header [data-command="home"],.table-header [data-net-action]');
        if(document.querySelector('.network-game')&&(globalThis.PlayroomNetworkLibrary?.hasActiveRoom()||globalThis.PlayroomNetworkLibrary?.isConnecting()))globalThis.PlayroomNetworkLibrary.exitToMenu();else if(back)back.click();else leaveTable('games');
        globalThis.PlayroomUIFeedback?.back();
      }
      return;
    }
    if(hubTab!=='games'){hubTab='games';renderHub();globalThis.PlayroomUIFeedback?.back();return;}
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
      const dialog=(globalThis.PlayroomGameChatPanel?.interactive?$('.game-chat-panel'):null)||localModal.activeRoot()?.querySelector('.modal')||$('.handoff');if(!dialog)return;
      const items=Array.from(dialog.querySelectorAll('button,input,textarea,select,a[href],[contenteditable=true],[tabindex="0"]')).filter(e=>!e.matches(':disabled')&&e.tabIndex>=0&&e.offsetParent!==null&&!e.closest('[inert],[hidden],[aria-hidden="true"]')&&getComputedStyle(e).visibility==='visible');
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
  packUI=globalThis.PlayroomPackManager?.create({manager:packs,library,networkLibrary:globalThis.PlayroomNetworkLibrary,openModal,modalHead,toast,captureOperation:captureUIOperation,onCatalog(){
    rememberPackUpdates('read');rememberPackUpdates('dismissed');if(screen==='hub')renderHub();
  },onChange(){
    rememberInstalledState();
    for(const [id,pack] of Object.entries(catalog))if(pack.sounds)audio.registerPack(id,pack.sounds);
    if(screen==='hub'){clearDeletedSession();refreshSavedGameRecovery();renderHub();}
    window.dispatchEvent(new Event('playroom:save-library-changed'));
  }});
  function restoreHostedRoom(roomId,{participantId=playerProfile?.id}={}){
    const recovered=roomService.snapshot(roomId);
    if(!playerProfile?.id||recovered.ownerId!==participantId)throw Error(globalThis.PlayroomMessages.text("ui.app.8630b139d1a0"));
    if(room&&room.id!==roomId)throw Error(globalThis.PlayroomMessages.text("ui.app.d9c4d77947b6"));
    room=recovered;lobbyParticipantId=participantId;screen='lobby';lobbyCountdown=null;
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
  globalThis.PlayroomAppBridge=Object.freeze({savedInUse,replaceSavedLocal,removeSavedDevice,captureArchiveReturn(){const tab=hubTab,position=window.scrollY;return ()=>{screen='hub';hubTab=tab;closeModal(true);renderHub();requestAnimationFrame(()=>window.scrollTo(0,position));};},saveLibrary:library,reactionContext:()=>screen==='table'&&session?{sessionId:localFrame(session.current,viewer).sessionId,viewer,allowed:!isReplay()&&gate===null&&!session.current.players[viewer]?.bot&&viewer>=0&&session.current.status==='playing',send:emoji=>{const ctx={sessionId:localFrame(session.current,viewer).sessionId,player:viewer,allowed:screen==='table'&&!isReplay()&&gate===null&&!session.current.players[viewer]?.bot};const event=localReactions.accept(ctx,{sessionId:ctx.sessionId,id:crypto.randomUUID(),emoji});if(event)globalThis.PlayroomReactionUI.receive(event);}}:null,setOnlineRoomCode:code=>{room=roomService.setOnlineCode(room.id,lobbyParticipantId,code);},setRoomInvitationPermission,showRoomRuleParameters:showRoomRulesEditor,showImportantUpdate:notice=>{const back=captureModalReturn();showUpdates(true,notice);modalBack=back;void navigator.serviceWorker?.getRegistration().then(r=>r?.update()).catch(()=>{});},showSessions,showHub:()=>leaveTable('games'),parkLocalSession:()=>{if(room?.transportMode==='hotseat')leaveLobby();else if(screen==='table')leaveTable('games');},returnHostedRoomToLobby,restoreHostedRoom,rollbackHostedRoom,gameOptions:(gameId=session?.game)=>({handShape:settings.handShape,tutorialsEnabled:settings.tutorialsEnabled!==false,splitThreeOpponents:false,animationSpeed:settings.animationSpeed,quickPlay:settings.quickPlay,seating:'auto'}),audio:Object.freeze({
    registerPack:(id,sounds)=>audio.registerPack(id,sounds),
    get busy(){return audioPending||audio.busy;},
    get uiEnabled(){return settings.sound&&settings.uiSounds!==false;},
    play:(ids,pack)=>{if(!settings.sound||document.hidden||!ids.length)return;
      const ordered=ids.slice(),request=++audioRequest;audioPending=true;
      void audio.prepare().then(async ok=>{if(request!==audioRequest)return;if(ok&&settings.sound&&!document.hidden)await audio.sequence(ordered,{pack});}).finally(()=>{if(request===audioRequest)audioPending=false;});},
    prepare:context=>prepareGameAudio(context),
    batch:(ids,pack,context)=>{if(settings.sound&&!document.hidden)return audio.batch(ids,{pack,signal:context?.signal});},
    stop:()=>{audioRequest++;audioPending=false;audio.stop();}
  }),saveNickname:name=>{playerProfile=profileStore.save(name);return playerProfile;},profile:()=>playerProfile,activity:()=>screen==='table'&&session&&session.current.status!=='finished'?catalog[session.game]?.name||null:null,room:()=>room,participantId:()=>lobbyParticipantId,roomService:publicRooms,packs,catalog,meta,toast,leaveLobby,kickLobbyParticipant,startOnlineGame,renderLobby,openModal,closeModal,refreshModalValidity:()=>localModal.invalidate(),captureModalReturn,confirmOperation,modalHead,showSettings,showCardHelp,fullscreen,rememberGame});
  globalThis.PlayroomAccountUI.init();
  rememberInstalledState();
  window.addEventListener('resize',()=>GameScreen.fitGameTitles(document));
  let navigation=null;try{navigation=JSON.parse(sessionStorage.getItem('playroom.navigation.v1')||'null');}catch(_){}
  if(navigation?.screen==='table'&&session&&navigation.sessionId===sessionId){
    resumeSession(sessionId);
    if(navigation.viewState&&typeof navigation.viewState==='object'){viewState=navigation.viewState;delete viewState.hint;screenController.viewState=viewState;}
    if(navigation.scroll){const board=$('#app [data-scene-scroll]');if(board){board.scrollTop=Number(navigation.scroll.top)||0;board.scrollLeft=Number(navigation.scroll.left)||0;}}
  }else render();
  if(globalThis.PlayroomRemotePacks){
    void globalThis.PlayroomRemotePacks.load().then(()=>{
      if(screen==='hub')renderHub();
    });
  }
  if(unifiedUpdate.pending())queueMicrotask(()=>void updateEverything());else if(afterUpdate)queueMicrotask(()=>void showAfterUpdate());
  if(!globalThis.PlayroomUpgradeUI?.show()&&!playerProfile?.name&&!document.querySelector('.account-modal'))setTimeout(showPlayerNamePrompt,0);
})();
