if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const SessionAccess=root.PlayroomSessionAccess,W=root.PlayroomWebRTCTransport,M=root.PlayroomMultiplayer,Pairing=root.PlayroomPairing,PWA=root.PlayroomPWA,QR=root.PlayroomQR,Scanner=root.PlayroomQRScanner,Acoustic=root.PlayroomAcousticPairing,Session=root.TabletopSession,Authority=root.SessionAuthority,SessionClient=root.PlayroomSessionClient,LocalTransport=root.PlayroomLocalTransport,Shared=root.PlayroomSharedViews,NetworkSessionStore=root.PlayroomNetworkSessionStore,ClientHistory=root.PlayroomNetworkClientHistory;
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let hostRooms=null;
  let installHomeVisible=false;
  const bridge=()=>hostRooms?{...root.PlayroomAppBridge,roomService:hostRooms}:root.PlayroomAppBridge;
  let hostPeer=null,hostSwitch=null,hostServeClose=null,hostRoomConnection=null,hostRoomId=null,hostRoomUnsub=null,hostStarted=false,hostAuthority=null,hostGameClient=null,hostMount=null;
  let clientPeer=null,clientTransport=null,clientUnsub=null,clientRoom=null,clientParticipantId=null,clientGameClient=null,clientMount=null,clientLobbyTimer=null,clientWaitingForLobby=false,clientPresence=null,clientPresenceUnsub=null;
  let offerToken=null,answerToken=null,hostAudioListener=null,clientAudioListener=null;
  const pendingAudio=new Map();
  async function runAudio(button,operation){
    if(pendingAudio.has(button.id))return;
    const controller=new AbortController(),label=button.innerHTML;pendingAudio.set(button.id,controller);
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent=globalThis.PlayroomMessages.text("ui.network-ui.e261fc0388e8");
    try{await operation(controller.signal);}catch(error){if(error.name!=='AbortError')toast(globalThis.PlayroomMessages.error(error));}
    finally{if(pendingAudio.get(button.id)===controller)pendingAudio.delete(button.id);if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=label;}}
  }
  const pairingQrGenerations=new Map();
  const connectedHostPeers=[];
  const resumeStore=new M.ResumeStore();
  const hostSessionStore=NetworkSessionStore?new NetworkSessionStore({describe:state=>{const scene=root.TabletopCore.project(state,-1).scene;return {firstPlayer:state.firstPlayer,presetId:state.preset,playerTeams:state.players.map((_,i)=>scene?.players?.find(p=>p.player===i)?.team||null),turnNumber:state.timeline?.turn||null,turn:state.turn,turnName:state.players[state.turn]?.name||null,round:scene?.round||null};}}):null;
  const clientHistoryStore=ClientHistory?new ClientHistory():null;
  let clientHistoryUnsub=null;
  const historySync=new root.PlayroomHistorySyncService({store:clientHistoryStore,key:(...parts)=>ClientHistory.id(...parts),
    current:(initial,transport)=>clientTransport===transport&&clientGameClient?.snapshot?.sessionId===initial.sessionId&&clientGameClient?.snapshot?.authorityEpoch===initial.authorityEpoch,
    boundary:value=>clientMount?.setHistoryBoundary(value),warning:error=>toast(globalThis.PlayroomMessages.text("ui.network-ui.3ce03f500e79",{p0:String(globalThis.PlayroomMessages.error(error))}))});
  let hostLockRelease=null,archiveMount=null,archiveAuthority=null;
  let hostRecovery=null,rosterQueue=Promise.resolve(),rosterError=null;
  let reconnectStatus='',clientRecovery=null,resumeIntent=null;
  const connectionLabels={connecting:globalThis.PlayroomMessages.text("ui.network-ui.ab71afb97f2e"),connected:globalThis.PlayroomMessages.text("ui.network-ui.8edc541e8848"),recovering:globalThis.PlayroomMessages.text("ui.network-ui.69d9c8cc8080"),invite:globalThis.PlayroomMessages.text("ui.network-ui.a24e789a95b4")};
  let networkInMenu=false,presentationGeneration=0;
  const tableAvailability=new WeakMap();
  const hasActiveRoom=()=>!!(hostRoomId||clientRoom);
  const clientConnected=()=>clientPeer?.pc?.connectionState==='connected'&&(!clientRecovery||clientRecovery.state==='connected');
  function parkNetworkView(){
    networkInMenu=true;presentationGeneration++;
    hostMount?.destroy?.();hostMount=null;clientMount?.destroy?.();clientMount=null;
    bridge().showHub();
  }
  async function returnToNetwork(){
    const generation=++presentationGeneration,client=hostGameClient||clientGameClient,isHost=!!hostGameClient;
    closeHostHistory();
    if(!client){networkInMenu=false;if(clientRoom)renderClientLobby(true);else if(hostRoomId)bridge().renderLobby();return;}
    try{
      if(isHost||clientConnected())await client.refresh();
      if(generation!==presentationGeneration||client!==(isHost?hostGameClient:clientGameClient))return;
      networkInMenu=false;mountNetworkView(isHost);
    }catch(error){toast(globalThis.PlayroomMessages.text("ui.network-ui.c2f62a148302",{p0:String(globalThis.PlayroomMessages.error(error))}));}
  }
  function mountNetworkView(isHost){
    if(networkInMenu)return;
    const client=isHost?hostGameClient:clientGameClient,snapshot=client?.snapshot;if(!snapshot)return;
    const b=bridge();b.packs.activate(snapshot.game,snapshot.packVersion);b.rememberGame(snapshot.game);
    const definition=b.packs.exportView(snapshot.game,snapshot.packVersion);
    b.closeModal(true);document.getElementById('app').inert=false;
    const old=isHost?hostMount:clientMount;old?.destroy?.();
    const mounted=Shared.mount(client,definition,{surface:snapshot.viewer<0?'table':'combined',tableAvailable:()=>{const room=isHost?b.room():clientPresence||clientRoom;return !!room?.participants?.some(person=>person.role==='table'&&person.connected===true);},connected:isHost||clientConnected(),onExit:isHost?exitHostGame:exitClientGame,onPresented:revision=>{if(!isHost)markClientPosition('presentedRevision',revision);},onReviewed:(revision,frame)=>{if(!isHost)markClientPosition('reviewedRevision',revision,frame);}});
    if(isHost)hostMount=mounted;else clientMount=mounted;
    mounted.render();renderPresence();showDisconnectBanner();
  }

    const {stopHostAudio,stopClientAudio,KNOWN_IP_KEY,usableManualIp,savedIpEntries,scannedCandidates,scanGenerations,soundCandidates,soundCandidateLabel,localNetworkRank,preferredSoundCandidate,soundCandidateOptions,selectionDetails,syncSoundChoice,initialNetworkChoice,soundSettings,updateSoundOptions,updateDiscoverySummary,saveManualIp,scanSoundAddresses,pairSignal,pairToken,updatePairingToken,sendSoundToken,listenHostAnswer,sendHostSoundOnly,listenGuestSound,sendGuestSound,captureNotice,captureDisabled,audioOutput,microphoneReady,soundOutputReady,methodAvailability,pairingHelp,pairingMethod,pairingMethods,syncPairingAvailability,pairingHeader,pairingFooter,toast,pairingProgress,copy,copyText,sharePair,pairingText,pairingQr,renderPairingQR,scanControls,readPairingQR}=root.PlayroomPairingPresenter.create({get Acoustic(){return Acoustic;},set Acoustic(value){Acoustic=value;},get PWA(){return PWA;},set PWA(value){PWA=value;},get Pairing(){return Pairing;},set Pairing(value){Pairing=value;},get QR(){return QR;},set QR(value){QR=value;},get Scanner(){return Scanner;},set Scanner(value){Scanner=value;},get acceptAnswerSignal(){return acceptAnswerSignal;},get answerToken(){return answerToken;},set answerToken(value){answerToken=value;},get bridge(){return bridge;},set bridge(value){bridge=value;},get clientAudioListener(){return clientAudioListener;},set clientAudioListener(value){clientAudioListener=value;},get clientPeer(){return clientPeer;},set clientPeer(value){clientPeer=value;},get createClientAnswer(){return createClientAnswer;},get esc(){return esc;},set esc(value){esc=value;},get hostAudioListener(){return hostAudioListener;},set hostAudioListener(value){hostAudioListener=value;},get hostPeer(){return hostPeer;},set hostPeer(value){hostPeer=value;},get offerToken(){return offerToken;},set offerToken(value){offerToken=value;},get pairingQrGenerations(){return pairingQrGenerations;},set pairingQrGenerations(value){pairingQrGenerations=value;}});
  function closeClient({preserveIntent=false}={}){
    if(preserveIntent&&clientGameClient&&clientRoom)resumeIntent={roomId:clientRoom.id,participantId:clientParticipantId,snapshot:clientGameClient.snapshot,pending:clientGameClient.pending,historyIndex:clientMount?.historyOpen?clientMount.historyIndex:null};
    else if(!preserveIntent)resumeIntent=null;
    clientRecovery?.close();clientRecovery=null;
    presentationGeneration++;
    clientSetupShown=false;historySync.cancel();clientHistoryUnsub?.();clientHistoryUnsub=null;stopClientAudio();clientPresenceUnsub?.();clientPresenceUnsub=null;clientPresence=null;clientMount?.destroy?.();clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;clientGameClient?.close?.();clientGameClient=null;clientTransport?.close?.();clientTransport=null;clientPeer?.close?.();clientPeer=null;clientRoom=null;clientParticipantId=null;clientMount=null;clientWaitingForLobby=false;}
  function closePendingHostPeer(){
    stopHostAudio();hostServeClose?.();hostServeClose=null;
    hostPeer?.close?.();hostPeer=null;hostSwitch?.close?.();hostSwitch=null;
    hostRoomConnection?.close?.();hostRoomConnection=null;
  }
  function closeHostPeer(){
    hostMount?.destroy?.();hostMount=null;closePendingHostPeer();
    for(const item of connectedHostPeers.splice(0)){
      item.serveClose?.();item.peer?.close?.();item.switchable?.close?.();item.roomConnection?.close?.();
    }
  }
  function roomPresence(room){
    const occupied=room.seats.filter(s=>s.participantId).sort((a,b)=>a.index-b.index);
    return {kind:'room-presence',roomId:room.id,revision:room.revision,participants:room.participants
      .map(p=>({id:p.id,nickname:p.nickname,avatar:p.avatar||null,connected:!!p.connected,seatId:p.seatId,role:p.role,isHost:!!p.isHost,bot:!!p.bot,local:!!p.local,hasConnected:Number.isFinite(p.joinedAt),replacement:p.replacement||null,playerIndex:occupied.find(s=>s.participantId===p.id)?.playerIndex??occupied.findIndex(s=>s.participantId===p.id)}))};
  }
  function playerMetadata(sessionId,index){
    let data;
    if(hostGameClient?.snapshot?.sessionId===sessionId&&hostRoomId){try{data=roomPresence(bridge().roomService.snapshot(hostRoomId));}catch(_){}}
    else if(clientGameClient?.snapshot?.sessionId===sessionId)data=clientPresence||roomPresence(clientRoom);
    const p=data?.participants.find(p=>p.playerIndex===index);
    return p?{...p,name:p.nickname,network:true}:null;
  }
  function notifyPresence(room){
    if(room?.phase!=='playing')return;
    const data=roomPresence(room);
    for(const item of connectedHostPeers){
      if(!item.roomConnection?.participantId||item.peer?.channel?.readyState!=='open')continue;
      try{item.peer.channel.send(JSON.stringify(data));}catch(_){}
    }
  }
  function renderPresence(){
    const shell=$('.table-shell.network-game');if(!shell||shell.dataset.mode==='history')return;
    let data;
    if(hostAuthority&&hostRoomId){try{data=roomPresence(bridge().roomService.snapshot(hostRoomId));}catch(_){}}
    else if(clientGameClient&&clientPresence?.roomId===clientRoom?.id)data=clientPresence;
    if(!data)return;
    const available=data.participants.some(person=>person.role==='table'&&person.connected===true);
    const mounted=hostMount||clientMount;if(mounted&&tableAvailability.get(mounted)!==available){tableAvailability.set(mounted,available);mounted.render();}
    const lost=clientPeer&&['disconnected','failed','closed'].includes(clientPeer.pc.connectionState);
    for(const p of data.participants){
      if(!Number.isSafeInteger(p.playerIndex)||p.playerIndex<0)continue;
      for(const panel of shell.querySelectorAll(`.player-panel[data-player-index="${p.playerIndex}"]`)){
        const avatar=panel.querySelector('.player-avatar-wrap>.avatar');
        if(avatar&&avatar.dataset.avatar!==(p.avatar||'')){avatar.innerHTML=root.PlayroomAvatars.content(p.avatar,p.nickname);avatar.dataset.avatar=p.avatar||'';}
      }
      const panel=shell.querySelector(`.player-panel[data-player-index="${p.playerIndex}"]`),role=panel?.querySelector('.participant-role');
      if(!role)continue;
      const connected=lost&&(p.isHost||p.id===clientParticipantId)?false:p.connected;
      const signature=JSON.stringify([p.role,!!p.bot,!!p.local,!!p.isHost,!!p.hasConnected,connected,p.replacement]);
      if(role.dataset.presence===signature)continue;
      const template=document.createElement('template');
      template.innerHTML=root.TabletopUI.helpers.participantIcon({...p,connected},{network:true});
      const next=template.content.firstElementChild;next.dataset.presence=signature;
      role.replaceWith(next);
    }
    const status=shell.querySelector('.table-status');if(!status)return;
    let line=shell.querySelector('.network-presence');
    if(!line){line=document.createElement('div');line.className='network-presence';line.setAttribute('role','status');line.setAttribute('aria-live','polite');status.after(line);}
    const players=data.participants.filter(p=>p.role==='player');
    const connected=players.filter(p=>p.connected).length;
    const value=("<span class=\"network-presence-count\">"+globalThis.PlayroomMessages.text("ui.network-ui.77c8e957f165"))+connected+globalThis.PlayroomMessages.text("ui.network-ui.e029cc4b39ce")+players.length+'</span>'+
      players.filter(p=>!p.connected).map(p=>'<span class="network-person '+(p.connected?'online':'offline')+'">'+
        '<i class="network-person-dot" aria-hidden="true"></i>'+esc(p.nickname)+(p.isHost?globalThis.PlayroomMessages.text("ui.network-ui.32c4ccc5277d"):'')+
        (p.connected?'':globalThis.PlayroomMessages.text("ui.network-ui.111a4e391195"))+'</span>').join('');
    line.hidden=connected===players.length;
    if(line.dataset.content!==value){line.dataset.content=value;line.innerHTML=value;}
  }
  function showDisconnectBanner(){
    if(!clientPeer||!clientRoom)return;
    const shell=document.querySelector('.table-shell.network-game')||document.querySelector('.room-setup-modal .lobby-shell')||document.querySelector('.network-resume-card');
    if(!shell)return;
    const state=clientRecovery?.state||(clientConnected()?'connected':'connecting');
    let wrap=shell.querySelector('.network-reconnect-banner');
    if(!wrap){wrap=document.createElement('div');wrap.className='network-reconnect-banner';wrap.setAttribute('role','status');shell.appendChild(wrap);}
    if(wrap.dataset.state===state)return;wrap.dataset.state=state;
    wrap.innerHTML='<strong>'+connectionLabels[state]+'</strong> '+(state==='connected'?'':globalThis.PlayroomMessages.text("ui.network-ui.6f988523357f"))+
      (state==='invite'?("<button class=\"btn secondary\" id=\"network-reconnect-button\" type=\"button\">"+globalThis.PlayroomMessages.text("ui.network-ui.f260ec9b1579")+"</button>"):'')+
      (" <button class=\"text-btn\" data-net-action=\"diagnostics\">"+globalThis.PlayroomMessages.text("ui.network-ui.493b722e3e1d")+"</button>");
  }
  function markClientPosition(kind,revision,frame){
    const snapshot=clientGameClient?.snapshot,roomId=clientRoom?.id,participantId=clientParticipantId;
    if(frame)saveClientProjection(frame);
    historySync.mark(snapshot,{roomId,participantId},kind,revision);
  }
  function startRecovery(){
    clientRecovery?.close();const transport=clientTransport,peer=clientPeer;
    clientRecovery=new W.Recovery({pc:peer.pc,transport,
      onState:report=>{clientMount?.setConnected(report.state==='connected');if(report.state!=='connected')historySync.cancel();showDisconnectBanner();renderPresence();ensureButtons();},
      reconcile:async(snapshot,{recovering})=>{
        if(transport!==clientTransport)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.2175de681bca"));
        if(snapshot?.kind==='lobby'){
          if(snapshot.room?.id!==clientRoom?.id||snapshot.participantId!==clientParticipantId)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.6cdf93a1971a"));
          const changed=snapshot.room.revision!==clientRoom.revision;clientRoom=snapshot.room;
          if(clientGameClient&&clientGameClient.snapshot.state.status!=='finished')clientToLobby();
          else if(!clientGameClient&&changed)renderClientLobby();return;
        }
        if(snapshot?.kind!=='snapshot')throw Error(globalThis.PlayroomMessages.text("ui.network-ui.dc2965d322a1"));
        if(!clientGameClient)startClientGame(snapshot);
        if(!clientGameClient)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.3777bf0d6091"));
        if(recovering||clientGameClient.pending){clientMount?.setConnected(false);await clientGameClient.reconcile(snapshot);clientMount?.syncLive();}
        else clientGameClient.accept(snapshot);
        if(recovering)void backfillClientHistory(clientGameClient.snapshot,transport,clientRoom.id,clientParticipantId);
      }});
  }
  function ensureButtons(){
    for(const [id,controller] of pendingAudio)if(!document.getElementById(id)){controller.abort();pendingAudio.delete(id);}
    // Close microphone immediately when the pairing dialog is dismissed.
    if(hostAudioListener&&!document.getElementById('net-host-acoustic-listen'))stopHostAudio();
    if(clientAudioListener&&!document.getElementById('net-client-acoustic-listen'))stopClientAudio();
    const b=bridge();if(!b)return;
    const intro=$('.intro');
    const scope=document.querySelector('.filter-scope');
    if(scope&&!document.getElementById('network-join-button')){const button=document.createElement('button');button.className='btn secondary';button.id='network-join-button';button.type='button';button.textContent=globalThis.PlayroomMessages.text('ui.network-ui.25177fb5362b');scope.appendChild(button);}

    if(hasActiveRoom()&&(networkInMenu||intro&&!document.querySelector('.table-shell'))){
      const room=clientRoom||b.room(),connected=!!hostRoomId||clientConnected(),parent=intro||document.querySelector('.hub-main');
      if(parent){const markup=root.PlayroomGameScreen.resumeCard({state:(clientGameClient||hostGameClient)?.snapshot?.state,gameName:room?.game?.name||'',roomName:room?.name||'',network:true,connected,participants:(clientRoom?clientPresence||roomPresence(room):roomPresence(room)).participants,teamLayouts:room?.game?.teamLayouts||{},action:connected?'id="network-return-button" data-net-action="return-game"':'id="network-reconnect-button"',leave:'data-net-action="leave-active"'});
        const old=document.querySelector('.network-resume-card'),key=(room?.id||'')+':'+(clientRoom?clientPresence?.revision||room?.revision:room?.revision)+':'+connected+':'+(room?.name||'')+':'+(clientRecovery?.state||'')+':'+((clientGameClient||hostGameClient)?.snapshot?.revision??'');if(!old||old.dataset.renderKey!==key){if(old)old.outerHTML=markup;else parent.insertAdjacentHTML('afterend',markup);const card=document.querySelector('.network-resume-card');if(card)card.dataset.renderKey=key;}
      }
    }

    if(!hasActiveRoom())document.querySelector('.network-resume-card')?.remove();

    if(intro&&(PWA?.canInstall?.()&&!PWA.standalone)&&!document.getElementById('pwa-install-button')){
      const btn=document.createElement('button');btn.className='btn hub-install-button';btn.id='pwa-install-button';btn.type='button';
      const label=globalThis.PlayroomMessages.text("ui.network-ui.a8c0e74a6502");
      btn.setAttribute('aria-label',label);btn.title=label;btn.innerHTML=root.PlayroomGameScreen.icon('install');
      intro.querySelector('.intro-heading')?.appendChild(btn);
    }
    if(!PWA?.canInstall?.()||PWA.standalone)document.getElementById('pwa-install-button')?.remove();
    const installButton=document.getElementById('pwa-install-button');
    const homeVisible=!!installButton&&!!intro?.closest('.is-active')&&!document.querySelector('dialog[open],#modal-root>*');
    if(homeVisible&&!installHomeVisible&&!root.matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.body.classList.contains('reduced-motion')){
      installButton.getAnimations().forEach(animation=>animation.cancel());
      const background=getComputedStyle(installButton).backgroundColor;
      installButton.animate([{backgroundColor:background},{backgroundColor:'#528a69',offset:.5},{backgroundColor:background}],{duration:800,iterations:3,easing:'ease-in-out'});
    }
    installHomeVisible=homeVisible;
    showDisconnectBanner();renderPresence();
    const gameShell=document.querySelector('.table-shell.network-game');
    const room=b.room?.(),lobby=$('.lobby-shell');
    const tools=document.querySelector('.topbar-tools,.table-tools');if(clientRoom&&tools&&!tools.closest('.table-shell')&&!tools.querySelector('[data-net-action=room]')){const node=document.createElement('button');node.className='icon-btn';node.dataset.netAction='room';node.setAttribute('aria-label',globalThis.PlayroomMessages.text("ui.network-ui.3a73248bdd79"));node.innerHTML=root.PlayroomGameScreen.icon('room');const full=tools.querySelector('[data-command=fullscreen]');if(full)full.remove();tools.prepend(node);}
    if(room&&room.transportMode!=='hotseat'&&lobby){
      ensureHostSubscription(room);
      const card=lobby.querySelector('.lobby-grid .lobby-card');
      if(card&&room.ownerId===b.participantId?.()&&!document.getElementById('network-pair-button')){const actions=card.querySelector('.lobby-actions');if(actions){actions.insertAdjacentHTML('afterbegin',root.PlayroomGameScreen.addPlayerButton());}}
    }
  }
  function handleHostRoomState(state){
    if(hostAuthority)for(const person of roomPresence(state).participants)if(person.playerIndex>=0)
      hostAuthority.setViewerConnected?.(person.playerIndex,person.connected);
    for(const old of [...connectedHostPeers])if(old.roomConnection?.participantId&&!participant(state,old.roomConnection.participantId)){
      old.serveClose?.();old.peer?.close?.();old.switchable?.close?.();
      const index=connectedHostPeers.indexOf(old);if(index>=0)connectedHostPeers.splice(index,1);
    }
    if(hostRecovery&&!hostStarted&&state.recovery)persistRecoveryRoster(state);
    if(state.phase==='playing'&&!hostStarted)startHostGame(state).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
    else if(document.querySelector('.lobby-shell'))bridge().renderLobby();
    if(state.phase==='playing'){notifyPresence(state);renderPresence();}
  }
  function persistRecoveryRoster(room){
    const saved=hostRecovery;if(!saved||!room.recovery)return rosterQueue;
    const recovery=bridge().roomService.exportRecovery(room.id);
    rosterQueue=rosterQueue.catch(()=>{}).then(()=>hostSessionStore.saveRoster({sessionId:room.recovery.sessionId,room,recovery,revision:saved.revision}));
    rosterQueue.then(()=>{rosterError=null;},error=>{rosterError=error;toast(globalThis.PlayroomMessages.text("ui.network-ui.ef307df96e79",{p0:String(globalThis.PlayroomMessages.error(error))}));});
    return rosterQueue;
  }
  function resumeDurability(roomId,sessionId){
    bridge().roomService.setResumeDurability(roomId,async credentials=>{
      await rosterQueue;
      return hostSessionStore.rotateResumeToken({sessionId,...credentials});
    });
  }
  function ensureHostSubscription(room){
    if(hostRoomId===room.id)return;
    hostRoomUnsub?.();hostRoomUnsub=null;hostRoomId=room.id;hostStarted=false;closeHostPeer();
    hostRoomUnsub=bridge().roomService.subscribe(room.id,handleHostRoomState);
  }
  function hostPeerServing(peer,switchable,roomConnection,roomId){
    // Keep the original lobby capability for identity binding, even after the
    // transport switches to the host-authority game projection.
    const served={
      snapshot:()=>switchable.snapshot(),
      history:index=>{if(switchable.completedHistory){if(!Number.isSafeInteger(index)||!switchable.completedHistory[index])throw Error(globalThis.PlayroomMessages.text("ui.network-ui.b50111de0c3a"));return switchable.completedHistory[index];}return switchable.history(index);},
      subscribe:listener=>switchable.subscribe(listener),
      presentationReady:message=>switchable.presentationReady(message),
      dispatch:async command=>{
        const result=await (command?.type==='avatar'?roomConnection.dispatch(command):switchable.dispatch(command));
        if((command?.type==='resume'||command?.type==='join')&&result?.ok){
          const id=result.snapshot.participantId;
          for(const old of connectedHostPeers.filter(p=>p.roomConnection?.participantId===id&&p.peer!==peer)){
            old.serveClose?.();old.peer?.close?.();old.switchable?.close?.();
            const i=connectedHostPeers.indexOf(old);if(i>=0)connectedHostPeers.splice(i,1);
          }
          const room=bridge().roomService.snapshot(roomId);
          if(room.phase==='playing'&&hostAuthority){
            switchable.set(SessionAccess.connect(hostAuthority,room,id));
          }
        }
        if(result?.ok&&(command?.type==='resume'||command?.type==='join')){
          const room=bridge().roomService.snapshot(roomId);
          if(peer.channel?.readyState==='open')peer.channel.send(JSON.stringify(roomPresence(room)));
        }
        return result;
      },
      close:()=>{roomConnection.close?.();switchable.close();}
    };
    return W.serve(peer.channel,served);
  }
  async function hostInvite(){
    try{
      const b=bridge(),room=b?.room?.();if(!room)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.444fcd52a3f9"));
      closePendingHostPeer();offerToken=null;hostRoomConnection=b.roomService.connection(room.id);hostSwitch=new M.SwitchableConnection(hostRoomConnection);
      hostPeer=await W.createHostPeer();hostServeClose=hostPeerServing(hostPeer,hostSwitch,hostRoomConnection,room.id);
      const network=initialNetworkChoice('host',hostPeer.offer);offerToken=network.token;
      const share='<button class="btn pairing-compact-button" type="button" data-net-share="offer" '+(PWA?.canShare?.(offerToken)?'':'disabled')+'>'+root.PlayroomGameScreen.icon('share')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.dc120821c212")+"</button>");
      const sound='<div class="pairing-actions">'+
        ("<button class=\"btn pairing-compact-button\" id=\"net-host-acoustic-send\" type=\"button\" title=\""+globalThis.PlayroomMessages.text("ui.network-ui.b075731b6fcb")+"\">")+root.PlayroomGameScreen.icon('sound')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.1dc58eaa3a66")+"</button>")+
        '<button class="btn secondary pairing-compact-button" id="net-host-acoustic-listen" type="button" '+captureDisabled()+(" title=\""+globalThis.PlayroomMessages.text("ui.network-ui.b1a06a42aa8a")+"\">")+root.PlayroomGameScreen.icon('mic')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.e63d372642de")+"</button></div>")+soundSettings('host');
      const qr=pairingQr('net-host-token')+("<div class=\"pairing-divider-label\">"+globalThis.PlayroomMessages.text("ui.network-ui.f4b951a3a43d")+"</div>")+scanControls('host');
      const text=pairingText(offerToken,'net-host-token')+
        ("<form id=\"net-host-answer\" data-inline-actions><label class=\"field\"><span>"+globalThis.PlayroomMessages.text("ui.network-ui.67420efb6419")+"</span><textarea name=\"answer\" rows=\"2\" placeholder=\""+globalThis.PlayroomMessages.text("ui.network-ui.2c0e47580483")+"\"></textarea></label>")+
        '<button class="btn secondary pairing-compact-button" type="submit">'+root.PlayroomGameScreen.icon('addPlayer')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.73f4e4b1d7ec")+"</button></form>");
      b.openModal(globalThis.PlayroomMessages.text("ui.network-ui.be876869eb2e",{p0:String(pairingHeader(globalThis.PlayroomMessages.text("ui.network-ui.946071629ded"),'host','host-offer')),p1:String(network.html),p2:String(pairingMethods('host-offer',{share,sound,qr,text},offerToken)),p3:String(pairingFooter())}));
      syncSoundChoice('host',hostPeer.offer);updateDiscoverySummary('host',hostPeer.offer);updatePairingToken('host');void scanSoundAddresses('host',hostPeer.offer);
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  async function acceptAnswerSignal(signal){
    if(!hostPeer)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.f7eb06f83d1f"));
    const peer=hostPeer,sw=hostSwitch,serveClose=hostServeClose,roomConnection=hostRoomConnection;
    if(!peer)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.a4c786915b74"));
    await peer.acceptAnswer(signal);
    stopHostAudio();
    connectedHostPeers.push({peer,switchable:sw,serveClose,roomConnection});
    hostPeer=null;hostSwitch=null;hostServeClose=null;hostRoomConnection=null;
    if(!networkInMenu){bridge().closeModal(true);if(bridge().room()?.phase==='lobby')bridge().renderLobby();}
  }
  function signalFromInput(value,expected){
    const token=Pairing.extract(value)||(/^(?:PR2|PR3)\./.test(value.trim())?value.trim():null);
    if(!token)return value.trim();
    const decoded=Pairing.decode(token);if(decoded.kind!==expected)throw Error(expected==='offer'?globalThis.PlayroomMessages.text("ui.network-ui.c89dc788d608"):globalThis.PlayroomMessages.text("ui.network-ui.7dc32eed045e"));
    return decoded.signal;
  }
  async function acceptAnswer(form){try{await acceptAnswerSignal(signalFromInput(form.elements.answer.value,'answer'));}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  function showJoin(){
    if(hasActiveRoom()&&(hostRoomId||clientConnected()))return toast(globalThis.PlayroomMessages.text("ui.network-ui.cdf905309d36"));
    networkInMenu=false;closeClient({preserveIntent:true});const b=bridge();
    const share=("<p class=\"pairing-brief-status\" role=\"status\">"+globalThis.PlayroomMessages.text("ui.network-ui.9f22ac8503f3")+"</p>");
    const sound='<button class="btn pairing-compact-button" id="net-client-acoustic-listen" type="button" '+(microphoneReady()?'':captureDisabled()||'disabled')+'>'+root.PlayroomGameScreen.icon('mic')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.e63d372642de")+"</button>");
    const qr=scanControls('client');
    const text=("<form id=\"net-client-offer\" data-inline-actions><label class=\"field\"><span>"+globalThis.PlayroomMessages.text("ui.network-ui.a6c341b18bf8")+"</span><textarea name=\"offer\" rows=\"3\" required placeholder=\""+globalThis.PlayroomMessages.text("ui.network-ui.f677b4d50cc8")+"\"></textarea></label>")+
      '<button class="btn pairing-compact-button" type="submit">'+root.PlayroomGameScreen.icon('addPlayer')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.966012379082")+"</button></form>");
    b.openModal(globalThis.PlayroomMessages.text("ui.network-ui.60fe530e2fca",{p0:String(pairingHeader(globalThis.PlayroomMessages.text("ui.network-ui.25177fb5362b"),'client','client-join')),p1:String(pairingMethods('client-join',{share,sound,qr,text})),p2:String(pairingFooter())}));
  }
  async function createClientAnswer(signal,{acoustic=false}={}){
    // A QR/share invite may arrive while a DIFFERENT local game is active.
    // Persist and park that game before mounting network UI: otherwise local
    // bots and input/replay listeners can repaint the network scene.
    if(hasActiveRoom()&&(hostRoomId||clientConnected()))throw Error(globalThis.PlayroomMessages.text("ui.network-ui.cdf905309d36"));
    networkInMenu=false;bridge()?.parkLocalSession?.();
    closeClient({preserveIntent:true});clientPeer=await W.createClientPeer(signal);
    const network=initialNetworkChoice('client',clientPeer.answer);answerToken=network.token;
    const b=bridge();
    const share='<button class="btn pairing-compact-button" type="button" data-net-share="answer" '+(PWA?.canShare?.(answerToken)?'':'disabled')+'>'+root.PlayroomGameScreen.icon('share')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.5ddeb1179ba7")+"</button>");
    const sound='<button class="btn pairing-compact-button" id="net-client-acoustic-send" type="button">'+root.PlayroomGameScreen.icon('sound')+(" "+globalThis.PlayroomMessages.text("ui.network-ui.1dc58eaa3a66")+"</button>")+soundSettings('client');
    const qr=pairingQr('net-client-token');
    const text=pairingText(answerToken,'net-client-token');
    b.openModal(globalThis.PlayroomMessages.text("ui.network-ui.60fe530e2fca",{p0:String(pairingHeader(globalThis.PlayroomMessages.text("ui.network-ui.a80695f66b6a"),'client','client-answer')),p1:String(network.html),p2:String(pairingMethods('client-answer',{share,sound,qr,text},answerToken))})+("<p class=\"pairing-brief-status\" role=\"status\">"+globalThis.PlayroomMessages.text("ui.network-ui.9793b6e919d1")+"</p>")+pairingFooter());
    syncSoundChoice('client',clientPeer.answer);updateDiscoverySummary('client',clientPeer.answer);updatePairingToken('client');void scanSoundAddresses('client',clientPeer.answer);
    const channel=await clientPeer.waitOpen({timeout:120000});clientTransport=W.client(channel,{timeout:10000});
    clientPresenceUnsub=clientTransport.subscribePresence?.(status=>{clientPresence=status;renderPresence();});
    const preview=await clientTransport.snapshot();if(preview?.kind!=='room-preview')throw Error(globalThis.PlayroomMessages.text("ui.network-ui.3c0c82b8da4e"));
    const saved=resumeStore.load(preview.room.id);
    if(saved){
      try{
        const resumed=await clientTransport.dispatch({type:'resume',participantId:saved.participantId,resumeToken:saved.token});
        if(!resumed?.ok||!resumed.resumeToken)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.622ac1fa2b5f"));
        const durable=resumeStore.save(preview.room.id,resumed.snapshot.participantId,resumed.resumeToken);
        if(!durable)toast(globalThis.PlayroomMessages.text("ui.network-ui.b1100c06d8d3"));
        clientRoom=resumed.snapshot.room;clientParticipantId=resumed.snapshot.participantId;
        bridge().closeModal(true);
        const state=await clientTransport.snapshot();
        if(state?.kind==='snapshot')startClientGame(state);
        else{resumeIntent=null;attachClientLobbyListener();renderClientLobby();}
        startRecovery();return;
      }catch(error){
        toast(globalThis.PlayroomMessages.text("ui.network-ui.087cdf36c487",{p0:String(globalThis.PlayroomMessages.error(error))}));
      }
    }
    if(preview.room.phase==='playing'){
      throw Error(globalThis.PlayroomMessages.text("ui.network-ui.a3177d285b47"));
    }
    showPreview(preview.room);
  }
  async function createAnswer(form){
    try{await createClientAnswer(signalFromInput(form.elements.offer.value,'offer'));}catch(error){toast(globalThis.PlayroomMessages.error(error));closeClient();}
  }
  async function handleIncomingPair(token){
    try{
      const value=Pairing.decode(token);
      if(value.kind==='offer'){await createClientAnswer(value.signal);return;}
      if(value.kind==='answer'){await acceptAnswerSignal(value.signal);return;}
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function rulesRows(room){
    const supplied=room.rules?.display;
    if(Array.isArray(supplied)&&supplied.every(item=>typeof item?.label==='string'&&typeof item?.value==='string'))return supplied;
    const definition=bridge()?.catalog?.[room.game.id]||{};
    return M.describeRules(room.rules,definition.settings||[],!!definition.capabilities?.hands);
  }
  function rulesMarkup(room){
    return '<dl class="lobby-rule-grid">'+rulesRows(room).map(item=>'<div class="lobby-rule-row"><dt>'+esc(item.label)+'</dt><dd>'+esc(item.value)+'</dd></div>').join('')+'</dl>';
  }
  function showPreview(room){
    const b=bridge();try{b.packs.activate(room.game.id,room.game.version);}catch(_){}
    b.openModal(b.modalHead(globalThis.PlayroomMessages.text("ui.network-ui.d1d8782389db",{p0:String(room.name)}))+'<p class="lead"><strong>'+esc(room.game.name)+'</strong> · '+(room.hostMode==='table'?globalThis.PlayroomMessages.text("ui.network-ui.37584969dd4c"):globalThis.PlayroomMessages.text("ui.network-ui.d96a8708055e"))+("</p><section class=\"rules-mode-note\"><strong>"+globalThis.PlayroomMessages.text("ui.network-ui.4c3d5c36eabb")+"</strong>")+rulesMarkup(room)+("</section><form id=\"net-client-join\"><label class=\"field\"><span>"+globalThis.PlayroomMessages.text("ui.network-ui.6f2f9c32cd40")+"</span><input name=\"nickname\" maxlength=\"24\" value=\"")+esc(b.profile()?.name||globalThis.PlayroomMessages.text("ui.network-ui.f54f58cf08df"))+("\" required></label><button class=\"btn\" type=\"submit\" style=\"width:100%\">"+globalThis.PlayroomMessages.text("ui.network-ui.80df8c7d3c91")+"</button></form>"));
  }
  async function joinRoom(form){
    try{
      const b=bridge(),result=await clientTransport.dispatch({type:'join',nickname:form.elements.nickname.value,avatar:b.profile()?.avatar||null});
      if(!result?.ok||result.snapshot?.kind!=='lobby')throw Error(globalThis.PlayroomMessages.text("ui.network-ui.2e76e709d3bb"));
      clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;
      if(result.resumeToken){
        const persisted=resumeStore.save(clientRoom.id,clientParticipantId,result.resumeToken);
        if(!persisted)toast(globalThis.PlayroomMessages.text("ui.network-ui.502de3716f20"));
      }
      b.closeModal(true);
      attachClientLobbyListener();
      renderClientLobby();startRecovery();
    }catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function participant(room,id){return room.participants.find(p=>p.id===id);}
  function attachClientLobbyListener(){
    clientUnsub?.();clientUnsub=clientTransport.subscribe(snapshot=>{
      if(snapshot?.kind==='lobby'){
        clientRoom=snapshot.room;clientParticipantId=snapshot.participantId;
        if(clientGameClient?.snapshot?.state?.status==='finished'&&!clientWaitingForLobby)return;
        if(clientGameClient){
          clientSetupShown=false;
          historySync.cancel();clientHistoryUnsub?.();clientHistoryUnsub=null;
          clientMount?.destroy?.();clientMount=null;
          clientGameClient.close({keepTransport:true});clientGameClient=null;
        }
        clientWaitingForLobby=false;if(!networkInMenu)renderClientLobby();
      }else if(snapshot?.kind==='snapshot'&&!clientWaitingForLobby){startClientGame(snapshot);}
    });
  }
  function clientToLobby({waiting=false}={}){
    if(!clientTransport||!clientRoom)return;
    historySync.cancel();clientHistoryUnsub?.();clientHistoryUnsub=null;
    clientMount?.destroy?.();clientMount=null;
    clientGameClient?.close({keepTransport:true});clientGameClient=null;
    clientWaitingForLobby=waiting;clientSetupShown=false;
    attachClientLobbyListener();renderClientLobby();
  }
  function exitClientGame({finished=false}={}){
    if(finished){clientToLobby({waiting:clientRoom?.phase!=='lobby'});return;}
    parkNetworkView();
  }
  function exitHostGame({finished=false,stopped=false}={}){
    const b=bridge(),roomId=hostRoomId;
    if(roomId&&(stopped||finished&&hostGameClient?.snapshot?.state?.status==='finished')){
      // A completed game remains in its immutable SessionStore journal.
      // Rebind existing RTC channels to room (instead of a new QR pairing).
      b.roomService.returnToLobby(roomId,b.participantId(),{stopped});
      for(const item of connectedHostPeers)if(item.roomConnection?.participantId){
        if(!stopped){const connection=item.switchable.current;item.switchable.completedHistory=Array.from({length:hostGameClient.snapshot.historyLength},(_,i)=>connection.history(i));}
        item.switchable?.set(item.roomConnection);
      }
      hostMount?.destroy?.();hostMount=null;
      hostGameClient?.close?.();hostGameClient=null;
      hostAuthority?.dispose?.();hostAuthority=null;
      hostLockRelease?.();hostLockRelease=null;
      hostStarted=false;hostRecovery=null;rosterQueue=Promise.resolve();rosterError=null;
      b.returnHostedRoomToLobby(roomId);
      return;
    }
    parkNetworkView();
  }
  function leaveHostRoom(roomId,{preserveRoom=false}={}){
    presentationGeneration++;
    if(hostRoomId&&hostRoomId!==roomId)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.e48ad673e8fd"));
    // Remove the live room only after releasing its subscriptions, RTC leases
    // and authority. IndexedDB journals and private recovery rights stay intact.
    hostRoomUnsub?.();hostRoomUnsub=null;
    closeHostPeer();hostGameClient?.close?.();hostGameClient=null;
    hostAuthority?.dispose?.();hostAuthority=null;
    hostLockRelease?.();hostLockRelease=null;
    if(roomId){
      const service=bridge().roomService;
      for(const participant of service.snapshot(roomId).participants)
        if(!participant.isHost&&!participant.bot&&!participant.local&&participant.connected)service.setConnected(roomId,participant.id,false);
      if(!preserveRoom)service.discardRecovery(roomId);
    }
    hostRoomId=null;hostStarted=false;hostRecovery=null;rosterError=null;networkInMenu=false;
  }
  let clientSetupShown=false;
  function renderClientLobby(force=false){
    if(networkInMenu&&!force)return;
    if(clientSetupShown&&!force&&!document.querySelector('.room-setup-modal .lobby-shell'))return;
    clientSetupShown=true;
    if(!clientRoom)return;const room=clientRoom,me=participant(room,clientParticipantId),app=document.getElementById('app');
    app.inert=!!document.getElementById('modal-root').children.length;
    bridge().openModal(PlayroomLobbyView.render({room,participantId:clientParticipantId,waiting:clientWaitingForLobby,notice:room.phase==='lobby'&&me?.rulesNotice?globalThis.PlayroomMessages.text("ui.network-ui.bcabed4ce53a"):''}),'room-setup-modal');
    PlayroomLobbyView.bindDrag(document.querySelector('#modal-root .lobby-shell'),{canMove:id=>!room.recovery&&id===clientParticipantId&&room.phase==='lobby'&&!participant(room,id)?.ready,move:(id,slot)=>roomCommand(slot==='table'?{type:'claim-table'}:slot==='spectator'?{type:'spectator'}:{type:'claim-seat',seatId:slot}),onError:error=>toast(globalThis.PlayroomMessages.error(error))});
    if(room.phase==='starting')startClientCountdown();
  }
  function startClientCountdown(){clearInterval(clientLobbyTimer);const update=()=>{if(!clientRoom?.countdownEndsAt)return;const n=Math.max(0,Math.ceil((clientRoom.countdownEndsAt-Date.now())/1000));const node=document.getElementById('net-countdown');if(node)node.textContent=String(n);};update();clientLobbyTimer=setInterval(update,200);}
  async function roomCommand(command){try{if(!clientConnected())throw Error(globalThis.PlayroomMessages.text("ui.network-ui.436623fc1c3a"));const result=await clientTransport.dispatch(command);if(result?.snapshot?.kind==='lobby'){clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;if(!clientGameClient)renderClientLobby();}}catch(error){toast(globalThis.PlayroomMessages.error(error));}}
  async function startHostGame(room){
    if(hostStarted)return;hostStarted=true;
    const generation=++presentationGeneration;
    const b=bridge();let persisted=false;
    try{
      const service=new root.PlayroomHostSessionService({engine:root.TabletopCore,Session,Authority,store:hostSessionStore,packs:b.packs,fingerprint:NetworkSessionStore.fingerprintPack,recovery:id=>b.roomService.exportRecovery(id),idFactory:()=>root.crypto.randomUUID()});
      const started=await service.start(room,{restored:room.recovery?hostRecovery:null,rosterReady:rosterQueue.then(()=>{if(rosterError)throw rosterError;})});
      persisted=started.persisted;if(started.releaseLock)hostLockRelease=started.releaseLock;
      if(hostRoomId!==room.id){started.authority.dispose();hostLockRelease?.();hostLockRelease=null;return;}
      resumeDurability(room.id,started.sessionId);hostAuthority=started.authority;
      for(const person of roomPresence(room).participants)if(person.playerIndex>=0)hostAuthority.setViewerConnected?.(person.playerIndex,person.connected);
      for(const item of connectedHostPeers){
        const id=item.roomConnection?.participantId;
        if(!id||!participant(room,id))continue;
        item.switchable.completedHistory=null;item.switchable.set(SessionAccess.connect(hostAuthority,room,id));
      }
      const local=LocalTransport(SessionAccess.connect(hostAuthority,room,room.ownerId));hostGameClient=new SessionClient(local);await hostGameClient.refresh();
      if(generation===presentationGeneration)mountNetworkView(true);hostAuthority.scheduleBot({onError:error=>toast(globalThis.PlayroomMessages.error(error))});notifyPresence(room);
    }catch(error){
      hostGameClient?.close?.();hostGameClient=null;
      hostAuthority?.dispose?.();hostAuthority=null;
      hostLockRelease?.();hostLockRelease=null;
      if(persisted||error.persisted){
        // This room has already been committed. Starting a new session would
        // strand a saved match; require an explicit reload/recovery instead.
        closeHostPeer();
        throw Error(globalThis.PlayroomMessages.text("ui.network-ui.980ceaab7769",{p0:String(globalThis.PlayroomMessages.error(error))}));
      }
      hostStarted=false;
      try{b.roomService.abortStart(room.id,b.participantId());b.renderLobby();}catch(_){}
      throw Error(globalThis.PlayroomMessages.text("ui.network-ui.023416eafc50",{p0:String(globalThis.PlayroomMessages.error(error))}));
    }
  }
  async function showHostArchives(){
    try{
      if(!hostSessionStore)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.d8189c178094"));
      const b=bridge(),items=await hostSessionStore.list();
      b.openModal(b.modalHead(globalThis.PlayroomMessages.text("ui.network-ui.2d6f5e4e132d"))+
        ("<p class=\"lead\">"+globalThis.PlayroomMessages.text("ui.network-ui.9d0f4935cfa5")) +
        (globalThis.PlayroomMessages.text("ui.network-ui.ca3dd6f27a9f")+"</p>")+
        (items.length?'<div class="lobby-actions">'+items.map(item=>
          '<button type="button" class="btn secondary" data-network-archive="'+esc(item.sessionId)+'">'+
          esc(item.game)+' · '+esc(item.packVersion)+' · '+item.revision+globalThis.PlayroomMessages.text("ui.network-ui.2cf17981ec74")+
          esc(new Date(item.updatedAt).toLocaleString('ru-RU'))+'</button>').join('')+'</div>':
          ("<p class=\"rules-mode-note\">"+globalThis.PlayroomMessages.text("ui.network-ui.f924406ba410")+"</p>")));
    }catch(error){toast(globalThis.PlayroomMessages.text("ui.network-ui.49bbde21608e",{p0:String(globalThis.PlayroomMessages.error(error))}));}
  }
  async function inspectHostArchive(sessionId){
    try{
      const saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.54c1751f79a3"));
      const b=bridge(),room=saved.room,st=saved.session.current;
      b.openModal(b.modalHead(globalThis.PlayroomMessages.text("ui.network-ui.a4db76e0cf30"))+
        '<p class="lead"><strong>'+esc(room.name)+'</strong> · '+esc(room.game.name)+' · '+esc(saved.session.packVersion)+'</p>'+
        ("<p class=\"rules-mode-note\">"+globalThis.PlayroomMessages.text("ui.network-ui.fc4d00f8bb17"))+(saved.session.states.length-1)+
        globalThis.PlayroomMessages.text("ui.network-ui.6c659236f779")+st.players.length+globalThis.PlayroomMessages.text("ui.network-ui.24513972bfc6")+esc(st.status)+
        (". "+globalThis.PlayroomMessages.text("ui.network-ui.885ded0175d4")+"</p>")+
        '<button class="btn secondary" type="button" data-network-history="'+esc(sessionId)+("\">"+globalThis.PlayroomMessages.text("ui.network-ui.e85ca6f85325")+"</button>")+
        (saved.recovery&&saved.packDigest?'<button class="btn" type="button" data-network-continue="'+esc(sessionId)+("\">"+globalThis.PlayroomMessages.text("ui.network-ui.6a2c81853d41")+"</button>"):
          ("<p class=\"rules-mode-note\">"+globalThis.PlayroomMessages.text("ui.network-ui.04ca787230bb")+"</p>"))+
        ("<button class=\"btn secondary\" id=\"network-saved-host-button\" type=\"button\">"+globalThis.PlayroomMessages.text("ui.network-ui.ab03176e8ef5")+"</button>"));
    }catch(error){toast(globalThis.PlayroomMessages.text("ui.network-ui.1d83eb02fc9c",{p0:String(globalThis.PlayroomMessages.error(error))}));}
  }
  function closeHostHistory(){
    archiveMount?.destroy?.();archiveMount=null;
    archiveAuthority?.dispose?.();archiveAuthority=null;
  }
  async function openHostHistory(sessionId){
    if((hostMount||clientMount)&&hasActiveRoom())parkNetworkView();
    try{
      const b=bridge(),saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.54c1751f79a3"));
      b.packs.activate(saved.session.game,saved.session.packVersion);
      const definition=b.packs.exportView(saved.session.game,saved.session.packVersion);
      const room=saved.recovery?.room||saved.room;
      const occupied=room.seats.filter(seat=>seat.participantId).sort((a,c)=>a.index-c.index);
      const viewer=room.hostMode==='table'?-1:(occupied.find(seat=>seat.participantId===room.ownerId)?.playerIndex??occupied.findIndex(seat=>seat.participantId===room.ownerId));
      if(room.hostMode==='player'&&viewer<0)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.89e815b6835d"));
      closeHostHistory();
      archiveAuthority=new Authority(saved.session,{sessionId});
      const binding=archiveAuthority.connect(viewer);
      const reader={snapshot:binding.snapshot(),pending:null,subscribe:()=>()=>{},
        history:index=>Promise.resolve(binding.history(index)),send:()=>Promise.reject(Error(globalThis.PlayroomMessages.text("ui.network-ui.c71aa1caa69c")))};
      const exit=()=>{closeHostHistory();b.showSessions();};
      b.closeModal(true);document.getElementById('app').inert=false;
      archiveMount=Shared.mount(reader,definition,{surface:viewer<0?'table':'combined',readOnly:true,onExit:exit});
      archiveMount.render();await archiveMount.openHistory(saved.revision);
    }catch(error){closeHostHistory();toast(globalThis.PlayroomMessages.text("ui.network-ui.1d784637945f",{p0:String(globalThis.PlayroomMessages.error(error))}));}
  }
  async function continueHostArchive(sessionId){
    let pendingRelease=null,recoveredRoomId=null;
    try{
      const b=bridge(),profile=b.profile?.();
      if(hostStarted||hostAuthority||hostRoomId||b.room?.()||archiveMount)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.876623c11b49"));
      if(!profile?.id)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.7020d052b51a"));
      const item=(await hostSessionStore.list()).find(entry=>entry.sessionId===sessionId);
      if(!item)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.54c1751f79a3"));
      // The precise installed game version must exist. A newer pack may not
      // silently replace the rules or renderer of an already-started match.
      b.packs.activate(item.game,item.packVersion);
      const saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved?.recovery)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.81e659d33871"));
      if(saved.session.current.status==='finished'){await openHostHistory(sessionId);return;}
      if(!saved.packDigest)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.b6c4e3048363"));
      if(await NetworkSessionStore.fingerprintPack(b.packs,saved.session.game,saved.session.packVersion)!==saved.packDigest)
        throw Error(globalThis.PlayroomMessages.text("ui.network-ui.bc91828177eb"));
      const room=saved.recovery.room;
      if(room.ownerId!==profile.id||(!['playing','lobby','starting'].includes(room.phase))||room.id!==saved.room.id||
          saved.session.game!==room.game.id||saved.session.packVersion!==room.game.version)
        throw Error(globalThis.PlayroomMessages.text("ui.network-ui.6b0198e81380"));
      const occupied=room.seats.filter(seat=>seat.participantId||Number.isInteger(seat.playerIndex)).sort((a,c)=>a.index-c.index);
      if(occupied.length!==saved.session.current.players.length||occupied.some((seat,i)=>Number.isInteger(seat.playerIndex)&&seat.playerIndex!==i))
        throw Error(globalThis.PlayroomMessages.text("ui.network-ui.87e52afc27ef"));
      // An exclusive Web Lock prevents a second tab from serving the same game.
      // It is released on pagehide; the next page acquires it afresh.
      pendingRelease=await hostSessionStore.acquireHostLock(sessionId);
      // All validation precedes attaching restored identities to the live UI.
      const collected=b.roomService.restoreRecovery(saved.recovery,{hostId:profile.id,collect:true,sessionId,revision:saved.revision});recoveredRoomId=room.id;
      hostRecovery=saved;rosterQueue=Promise.resolve();rosterError=null;
      await persistRecoveryRoster(collected);
      resumeDurability(room.id,sessionId);
      b.restoreHostedRoom(room.id);
      hostLockRelease=pendingRelease;pendingRelease=null;
      hostRoomId=room.id;hostStarted=false;hostAuthority=null;
      hostRoomUnsub?.();
      hostRoomUnsub=b.roomService.subscribe(room.id,handleHostRoomState);
      b.renderLobby();
    }catch(error){
      pendingRelease?.();
      if(recoveredRoomId){
        hostMount?.destroy?.();hostMount=null;
        hostGameClient?.close?.();hostGameClient=null;
        hostAuthority?.dispose?.();hostAuthority=null;hostRecovery=null;
        hostLockRelease?.();hostLockRelease=null;
        hostRoomId=null;hostStarted=false;
        const b=bridge();b.rollbackHostedRoom?.(recoveredRoomId);
        try{b.roomService.discardRecovery(recoveredRoomId);}catch(_){}
      }
      toast(globalThis.PlayroomMessages.text("ui.network-ui.8757fe0a793e",{p0:String(globalThis.PlayroomMessages.error(error))}));
    }
  }
  function saveClientProjection(snapshot){
    if(!clientRoom)return;
    historySync.save(snapshot,{roomId:clientRoom.id,participantId:clientParticipantId,roomName:clientRoom.name,participants:clientPresence?.participants||clientRoom.participants});
  }
  function backfillClientHistory(initial,transport,roomId,participantId){return historySync.backfill(initial,transport,{roomId,participantId,roomName:clientRoom?.name||''});}

  async function listNetworkArchives({strict=false}={}){
    const responses=await Promise.allSettled([hostSessionStore?.list()||Promise.resolve([]),clientHistoryStore?.list()||Promise.resolve([])]);
    if(responses.every(x=>x.status==='rejected')||strict&&responses.some(x=>x.status==='rejected'))throw Error(globalThis.PlayroomMessages.text("ui.network-ui.aea037a7edc2"));
    return responses.flatMap(x=>x.status==='fulfilled'?x.value:[]).map(item=>{let missingPack=false;try{if(!bridge().packs.list().some(p=>p.id===item.game&&p.version===item.packVersion))throw Error('Missing pack');}catch(_){missingPack=true;}return {...item,missingPack};});
  }
  async function removeNetworkArchive(key){
    if(hostStarted||hostAuthority||clientGameClient||archiveMount)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.1d9b61031806"));
    if(key.startsWith('client:')){const entries=await clientHistoryStore.list(),entry=entries.find(e=>e.id===key.slice(7));await clientHistoryStore.remove(key.slice(7));if(entry&&!entries.some(e=>e.id!==entry.id&&e.roomId===entry.roomId))resumeStore.remove(entry.roomId);}
    else{if(!hostSessionStore)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.83f28d6a0811"));const release=await hostSessionStore.acquireHostLock(key);try{await hostSessionStore.remove(key);}finally{release();}}
  }
  async function openClientHistory(key){
    if((hostMount||clientMount)&&hasActiveRoom())parkNetworkView();
    try{
      const saved=await clientHistoryStore.read(key);
      if(!saved?.frames.length)throw Error(globalThis.PlayroomMessages.text("ui.network-ui.caf7a985ceca"));
      const b=bridge();b.packs.activate(saved.game,saved.packVersion);
      const last=saved.frames.at(-1),definition=b.packs.exportView(saved.game,saved.packVersion);
      closeHostHistory();
      archiveAuthority=null;
      const epoch=last.authorityEpoch;
      const packet=(frame,kind)=>Object.freeze({protocolVersion:2,kind,sessionId:saved.sessionId,
        authorityEpoch:epoch,revision:frame.revision,game:saved.game,packVersion:saved.packVersion,
        viewer:saved.viewer,audience:saved.viewer<0?'public':'player',state:frame.state,
        events:frame.events,actions:[],cues:[],effects:[],historyLength:last.revision+1});
      const frames=new Map(saved.frames.map(f=>[f.revision,f]));
      const reader={snapshot:packet(last,'snapshot'),pending:null,subscribe:()=>()=>{},
        history:index=>frames.has(index)?Promise.resolve(packet(frames.get(index),'history')):
          Promise.reject(Error(globalThis.PlayroomMessages.text("ui.network-ui.38483b57407a"))),
        send:()=>Promise.reject(Error(globalThis.PlayroomMessages.text("ui.network-ui.316a9c326672")))};
      const exit=()=>{closeHostHistory();b.showSessions();};
      b.closeModal(true);document.getElementById('app').inert=false;
      archiveMount=Shared.mount(reader,definition,{surface:saved.viewer<0?'table':'combined',readOnly:true,onExit:exit});
      archiveMount.render();await archiveMount.openHistory(last.revision);
    }catch(error){closeHostHistory();toast(globalThis.PlayroomMessages.text("ui.network-ui.ef2766762f3a",{p0:String(globalThis.PlayroomMessages.error(error))}));}
  }
  async function openNetworkHistory(key){
    const client=key.startsWith('client:');
    return client?openClientHistory(key.slice(7)):openHostHistory(key);
  }
  async function continueSavedNetwork(key){
    if(hostGameClient?.snapshot?.sessionId===key)return returnToNetwork();
    if(key.startsWith('client:')&&clientGameClient){const saved=await clientHistoryStore.read(key.slice(7));if(saved?.sessionId===clientGameClient.snapshot.sessionId&&saved.roomId===clientRoom?.id&&saved.participantId===clientParticipantId)return returnToNetwork();}
    if(hasActiveRoom())return toast(globalThis.PlayroomMessages.text("ui.network-ui.cdf905309d36"));
    networkInMenu=false;
    if(key.startsWith('client:')){
      if(hostStarted||hostAuthority||bridge().room?.())return toast(globalThis.PlayroomMessages.text("ui.network-ui.32c308952660"));
      showJoin();pairingProgress(globalThis.PlayroomMessages.text("ui.network-ui.646f32cabee2"),'qr');
      return;
    }
    return continueHostArchive(key);
  }
  function startClientGame(snapshot){
    if(clientGameClient)return;
    try{
      clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;
      const b=bridge();b.packs.activate(snapshot.game,snapshot.packVersion);const definition=b.packs.exportView(snapshot.game,snapshot.packVersion);
      clientGameClient=new SessionClient(clientTransport);clientGameClient.accept(snapshot);
      attachClientLobbyListener();clientWaitingForLobby=false;
      if(clientHistoryStore&&clientRoom?.id&&clientParticipantId){
        clientHistoryUnsub=clientGameClient.subscribe(saveClientProjection);
        saveClientProjection(snapshot);
        void backfillClientHistory(snapshot,clientTransport,clientRoom.id,clientParticipantId);
      }
      if(resumeIntent){const intent=resumeIntent;resumeIntent=null;
        if(intent.roomId===clientRoom.id&&intent.participantId===clientParticipantId&&(['sessionId','authorityEpoch','game','packVersion'].every(k=>intent.snapshot[k]===snapshot[k])&&root.PlayroomProtocol.sameAudience(intent.snapshot,snapshot))){
          if(intent.pending)clientGameClient.pending=intent.pending;
          mountNetworkView(false);if(intent.historyIndex!==null)void clientMount?.openHistory(intent.historyIndex);
        }else mountNetworkView(false);
      }else mountNetworkView(false);
    }catch(error){toast(globalThis.PlayroomMessages.text("ui.network-ui.232c63fe01d2",{p0:String(globalThis.PlayroomMessages.error(error))}));}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-net-copy],[data-net-share],[data-net-scan],[data-net-save-ip],[data-net-qr-camera],[data-net-qr-gallery],[data-net-seat],[data-net-action],#network-join-button,#network-reconnect-button,#network-pair-button,#network-saved-host-button,[data-network-archive],[data-network-continue],[data-network-history],#pwa-install-button,#net-host-acoustic,#net-host-acoustic-send,#net-host-acoustic-listen,#net-client-acoustic-listen,#net-client-acoustic-send');if(!target)return;
    event.preventDefault();event.stopPropagation();
    if(target.dataset.netAction==='diagnostics'){
      const report=clientRecovery?.report()||{state:'connecting'};
      bridge().openModal(bridge().modalHead(globalThis.PlayroomMessages.text("ui.network-ui.493b722e3e1d"))+'<p>'+esc(connectionLabels[report.state])+'</p><pre class="network-diagnostic-report" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(report,null,2))+("</pre><button class=\"btn\" data-net-action=\"copy-diagnostics\">"+globalThis.PlayroomMessages.text("ui.network-ui.8ec2c58498ce")+"</button>"));return;
    }
    if(target.dataset.netAction==='copy-diagnostics'){void Promise.resolve().then(()=>navigator.clipboard.writeText(JSON.stringify(clientRecovery?.report()||{},null,2))).then(()=>toast(globalThis.PlayroomMessages.text("ui.network-ui.092d5fc040dd")),()=>toast(globalThis.PlayroomMessages.text("ui.network-ui.1567d8e0acf6")));return;}
    if(target.dataset.netQrCamera){document.getElementById('net-'+target.dataset.netQrCamera+'-qr-camera')?.click();return;}
    if(target.dataset.netQrGallery){document.getElementById('net-'+target.dataset.netQrGallery+'-qr-gallery')?.click();return;}
    if(target.id==='network-join-button'||target.id==='network-reconnect-button')return showJoin();
    if(target.id==='network-saved-host-button')return showHostArchives();
    if(target.dataset.networkArchive)return inspectHostArchive(target.dataset.networkArchive);
    if(target.dataset.networkHistory)return openNetworkHistory(target.dataset.networkHistory);
    if(target.dataset.networkContinue)return continueSavedNetwork(target.dataset.networkContinue);
    if(target.id==='network-pair-button')return hostInvite();
    if(target.dataset.netScan){const role=target.dataset.netScan,signal=role==='host'?hostPeer?.offer:clientPeer?.answer;if(signal)return scanSoundAddresses(role,signal);return;}
    if(target.dataset.netSaveIp)return saveManualIp(target.dataset.netSaveIp);
    if(target.id==='net-host-acoustic-send')return runAudio(target,sendHostSoundOnly);
    if(target.id==='net-host-acoustic-listen')return runAudio(target,listenHostAnswer);
    if(target.id==='net-client-acoustic-listen')return runAudio(target,listenGuestSound);
    if(target.id==='net-client-acoustic-send')return runAudio(target,sendGuestSound);
    if(target.id==='pwa-install-button'){PWA?.install?.().catch(error=>toast(globalThis.PlayroomMessages.error(error))).finally(ensureButtons);return;}
    if(target.dataset.netShare){sharePair(target.dataset.netShare);return;}
    if(target.dataset.netCopy)return copy(target.dataset.netCopy);
    if(target.dataset.netSeat)return roomCommand({type:'claim-seat',seatId:target.dataset.netSeat});
    if(target.dataset.netAction==='ready'){const me=participant(clientRoom,clientParticipantId);return roomCommand({type:'ready',ready:!me?.ready});}
    if(target.dataset.netAction==='accept-replacement')return roomCommand({type:'accept-replacement'});
    if(target.dataset.netAction==='table')return roomCommand({type:'claim-table'});
    if(target.dataset.netAction==='spectator')return roomCommand({type:'spectator'});
    if(target.dataset.netAction==='return-game'){void returnToNetwork();return;}
    if(target.dataset.netAction==='dismiss-room'){bridge().closeModal();return;}
    if(target.dataset.netAction==='room'){renderClientLobby(true);return;}
    if(target.dataset.netAction==='collapse'){bridge().closeModal(true);return;}
    if(target.dataset.netAction==='stop-match'){
      const authority=hostAuthority;if(!authority)return;
      bridge().confirmOperation(globalThis.PlayroomMessages.text("ui.network-ui.2940743f79f8"),{isCurrent:()=>hostAuthority===authority,onConfirm:async()=>{await authority.stopForLobby();exitHostGame({stopped:true});}});return;
    }
    if(target.dataset.netAction==='leave-active'||target.dataset.netAction==='leave'){
      const clientId=clientRoom?.id,hostId=hostRoomId;
      bridge().confirmOperation(globalThis.PlayroomMessages.text("ui.network-ui.e12601e2b36f"),{
        isCurrent:()=>clientId?clientRoom?.id===clientId:!!hostId&&hostRoomId===hostId,
        onConfirm:()=>{if(clientId)closeClient();else bridge().leaveLobby?.();networkInMenu=false;bridge().showHub();}
      });return;
    }
    if(target.dataset.netAction==='rules')return bridge().openModal(globalThis.PlayroomMessages.text("ui.network-ui.380e3dbd6730",{p0:String(bridge().modalHead(globalThis.PlayroomMessages.text("ui.network-ui.ee9cd4deefad",{p0:String(clientRoom.game.name)}))),p1:String(PlayroomLobbyView.rulesMarkup(clientRoom,rulesRows(clientRoom),bridge().meta(clientRoom.game.id)||{},PlayroomCatalog[clientRoom.game.id]?.settings||[]))}));
    if(target.dataset.netAction==='help')return bridge().openModal(globalThis.PlayroomMessages.text("ui.network-ui.380e3dbd6730",{p0:String(bridge().modalHead(globalThis.PlayroomMessages.text("ui.network-ui.df2a5a208045"))),p1:String(PlayroomLobbyView.helpMarkup(clientRoom))}));
    if(target.dataset.netAction==='settings')return bridge().showSettings({room:clientRoom,participantId:clientParticipantId,client:true});
  },true);
  document.addEventListener('change',event=>{
    const input=event.target,role=input?.dataset?.netQrFile;
    if(!role)return;
    const file=input.files?.[0];input.value='';
    if(file)void readPairingQR(file,role);
  },true);
  document.addEventListener('change',event=>{
    if(!['acoustic-host-address','acoustic-client-address'].includes(event.target.id))return;
    const role=event.target.id.includes('host')?'host':'client';
    const signal=role==='host'?hostPeer?.offer:clientPeer?.answer;
    if(signal){event.target.dataset.userChoice='true';syncSoundChoice(role,signal);updatePairingToken(role);}
  });
  document.addEventListener('input',event=>{
    if(!['acoustic-host-manual','acoustic-client-manual'].includes(event.target.id))return;
    const role=event.target.id.includes('host')?'host':'client';
    updatePairingToken(role);
  });
  document.addEventListener('focusout',event=>{
    if(!['acoustic-host-manual','acoustic-client-manual'].includes(event.target.id))return;
    const role=event.target.id.includes('host')?'host':'client';
    // Blur happens on pointerdown, *before* the Save/Send button click.
    // Moving the whole <details> synchronously here would swallow that click.
    root.setTimeout(()=>syncPairingAvailability(role,role==='host'?offerToken:answerToken),120);
  });
  document.addEventListener('submit',event=>{
    if(!['net-host-answer','net-client-offer','net-client-join','net-client-nickname'].includes(event.target.id))return;
    event.preventDefault();event.stopPropagation();
    if(event.target.id==='net-host-answer')acceptAnswer(event.target);
    else if(event.target.id==='net-client-offer')createAnswer(event.target);
    else if(event.target.id==='net-client-join')joinRoom(event.target);
    else if(event.target.id==='net-client-nickname')roomCommand({type:'rename',nickname:event.target.elements.nickname.value});
  },true);
  PWA?.subscribePair?.(token=>handleIncomingPair(token));
  root.addEventListener('playroom-install-available',ensureButtons);
  root.addEventListener('playroom-installed',ensureButtons);
  root.PlayroomNetworkLibrary=Object.freeze({setAvatar:avatar=>roomCommand({type:'avatar',avatar}),configureHostPorts({rooms}){hostRooms=rooms;},list:listNetworkArchives,playerMetadata,hasActiveRoom,
    showSettings:(options={})=>bridge().showSettings({room:clientRoom||bridge().room(),participantId:clientRoom?clientParticipantId:bridge().participantId(),client:!!clientRoom,...options}),leaveClientRoom:closeClient,openRoom:()=>clientRoom?renderClientLobby(true):bridge().renderLobby(),remove:removeNetworkArchive,inspect:inspectHostArchive,continue:continueSavedNetwork,history:openNetworkHistory,leaveHostRoom});
  root.PlayroomNetworkDebug=()=>({
    host:{roomId:hostRoomId,peer:!!hostPeer,connectedPeers:connectedHostPeers.length,channel:hostPeer?.channel?.readyState||null,serve:!!hostServeClose,switchCurrent:!!hostSwitch?.current,roomConnection:!!hostRoomConnection,participantId:hostRoomConnection?.participantId||null,rpc:hostPeer?.channel?.__playroomDebug||null},
    client:{recovery:clientRecovery?.report()||null,peer:!!clientPeer,channel:clientPeer?.pc?.connectionState||null,ice:clientPeer?.pc?.iceConnectionState||null,transport:!!clientTransport,room:!!clientRoom,participantId:clientParticipantId,hasResumeToken:!!clientRoom?.id&&!!resumeStore.load(clientRoom.id),rpc:clientTransport?.debug?.()||null}
  });
  const observer=new MutationObserver(ensureButtons);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});ensureButtons();
  root.addEventListener('pagehide',()=>{closeHostHistory();closeClient();hostRoomUnsub?.();hostAuthority?.dispose?.();closeHostPeer();hostLockRelease?.();hostLockRelease=null;});
})(globalThis);
