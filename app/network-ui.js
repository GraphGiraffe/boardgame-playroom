(function(root){
  'use strict';
  const W=root.PlayroomWebRTCTransport,M=root.PlayroomMultiplayer,Pairing=root.PlayroomPairing,PWA=root.PlayroomPWA,Session=root.TabletopSession,Authority=root.SessionAuthority,SessionClient=root.PlayroomSessionClient,LocalTransport=root.PlayroomLocalTransport,Shared=root.PlayroomSharedViews;
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bridge=()=>root.PlayroomAppBridge;
  let hostPeer=null,hostSwitch=null,hostServeClose=null,hostRoomConnection=null,hostRoomId=null,hostRoomUnsub=null,hostStarted=false,hostAuthority=null,hostGameClient=null;
  let clientPeer=null,clientTransport=null,clientUnsub=null,clientRoom=null,clientParticipantId=null,clientGameClient=null,clientMount=null,clientLobbyTimer=null;
  let offerToken=null,answerToken=null;
  function toast(text){bridge()?.toast?.(text);}
  function copy(id){const field=document.getElementById(id);if(!field)return;field.focus();field.select?.();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(field.value).then(()=>toast('Скопировано')).catch(()=>toast('Текст выделен — скопируйте его вручную.'));else toast('Текст выделен — скопируйте его вручную.');}
  async function copyText(value){try{await navigator.clipboard.writeText(value);toast('Скопировано');}catch(_){toast('Не удалось скопировать автоматически. Используйте поле в «Другие способы».');}}
  async function sharePair(kind){
    const token=kind==='offer'?offerToken:answerToken;if(!token)throw Error('Нет данных подключения.');
    try{await PWA.shareToken(token);}catch(error){toast(error.message);}
  }
  function pairingFallback(token,id){
    const link=PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token);
    return '<details class="pairing-fallback"><summary>Другие способы</summary><p class="lead">Можно отправить эту ссылку сообщением. На устройстве с установленным ХОД она откроется через protocol handler.</p><label class="field"><span>Ссылка ХОД</span><textarea id="'+id+'" rows="5" readonly>'+esc(link)+'</textarea></label><button class="btn secondary" type="button" data-net-copy="'+id+'" style="width:100%">Скопировать ссылку</button></details>';
  }
  function closeClient(){clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;clientGameClient?.close?.();clientGameClient=null;clientTransport?.close?.();clientTransport=null;clientPeer?.close?.();clientPeer=null;clientRoom=null;clientParticipantId=null;clientMount=null;}
  function closeHostPeer(){hostServeClose?.();hostServeClose=null;hostPeer?.close?.();hostPeer=null;hostSwitch?.close?.();hostSwitch=null;hostRoomConnection=null;}
  function ensureButtons(){
    const b=bridge();if(!b)return;
    const intro=$('.intro');
    if(intro&&!document.getElementById('network-join-button')){const wrap=document.createElement('div');wrap.className='lobby-actions';wrap.style.marginTop='16px';wrap.innerHTML='<button class="btn secondary" id="network-join-button" type="button">Присоединиться к комнате</button>';intro.appendChild(wrap);}
    if(intro&&PWA?.canInstall?.()&&!PWA.standalone&&!document.getElementById('pwa-install-button')){const btn=document.createElement('button');btn.className='btn secondary';btn.id='pwa-install-button';btn.type='button';btn.textContent='Установить ХОД';intro.querySelector('.lobby-actions')?.appendChild(btn);}
    const room=b.room?.(),lobby=$('.lobby-shell');
    if(room&&lobby){
      ensureHostSubscription(room);
      const card=lobby.querySelector('.lobby-grid .lobby-card');
      if(card&&room.ownerId===b.participantId?.()&&!document.getElementById('network-pair-button')){const actions=card.querySelector('.lobby-actions');if(actions){const btn=document.createElement('button');btn.className='btn';btn.id='network-pair-button';btn.type='button';btn.textContent='Подключить устройство';actions.prepend(btn);}}
    }
  }
  function ensureHostSubscription(room){
    if(hostRoomId===room.id)return;
    hostRoomUnsub?.();hostRoomUnsub=null;hostRoomId=room.id;hostStarted=false;closeHostPeer();
    hostRoomUnsub=bridge().roomService.subscribe(room.id,state=>{
      if(state.phase==='playing'&&!hostStarted)startHostGame(state).catch(error=>toast(error.message));
      else if(document.querySelector('.lobby-shell'))bridge().renderLobby();
    });
  }
  async function hostInvite(){
    try{
      const b=bridge(),room=b?.room?.();if(!room)throw Error('Сначала создайте сетевую комнату.');
      closeHostPeer();offerToken=null;hostRoomConnection=b.roomService.connection(room.id);hostSwitch=new M.SwitchableConnection(hostRoomConnection);
      hostPeer=await W.createHostPeer();hostServeClose=W.serve(hostPeer.channel,hostSwitch);offerToken=Pairing.fromSignal('offer',hostPeer.offer);
      const share=PWA?.canShare?.()?'<button class="btn" type="button" data-net-share="offer" style="width:100%">Поделиться приглашением</button>':'<div class="rules-mode-note">Системное «Поделиться» недоступно. Используйте «Другие способы» ниже.</div>';
      const secure=PWA?.secure?'':'<div class="rules-mode-note"><strong>PWA-функции ограничены:</strong> откройте ХОД по HTTPS после установки. Локальный file/content URL не является secure context.</div>';
      b.openModal(b.modalHead('Подключить устройство')+secure+'<p class="lead">Передайте приглашение второму устройству через системное меню. Если на нём установлен ХОД, полученную ссылку можно открыть прямо в PWA.</p>'+share+pairingFallback(offerToken,'net-host-token')+'<form id="net-host-answer"><label class="field"><span>Fallback: ответ второго устройства</span><textarea name="answer" rows="4" placeholder="Можно вставить ссылку ХОД, pairing token или старый WebRTC answer"></textarea></label><button class="btn secondary" type="submit" style="width:100%">Принять вставленный ответ</button></form><p class="lead" style="margin-top:14px">Если ответ придёт через share target или web+playroom:, ХОД примет его автоматически.</p>');
    }catch(error){toast(error.message);}
  }
  async function acceptAnswerSignal(signal){
    if(!hostPeer)throw Error('На этом устройстве нет активного приглашения. Создайте комнату и нажмите «Подключить устройство».');
    await hostPeer.acceptAnswer(signal);bridge().closeModal(true);toast('Устройство подключено. Теперь войдите в комнату на нём.');
  }
  function signalFromInput(value,expected){
    const token=Pairing.extract(value)||(/^PR2\./.test(value.trim())?value.trim():null);
    if(!token)return value.trim();
    const decoded=Pairing.decode(token);if(decoded.kind!==expected)throw Error(expected==='offer'?'Ожидалось приглашение хоста.':'Ожидался ответ клиента.');
    return decoded.signal;
  }
  async function acceptAnswer(form){try{await acceptAnswerSignal(signalFromInput(form.elements.answer.value,'answer'));}catch(error){toast(error.message);}}
  function showJoin(){
    closeClient();const b=bridge(),note=PWA?.secure?'':'<div class="rules-mode-note"><strong>Совет:</strong> для установки PWA и Web Share откройте размещённую HTTPS-версию ХОД.</div>';
    b.openModal(b.modalHead('Присоединиться к комнате')+note+'<p class="lead">Если приглашение пришло через системное «Поделиться» или ссылку web+playroom:, этот экран откроется автоматически. Fallback — вставьте полученную ссылку или token.</p><form id="net-client-offer"><label class="field"><span>Приглашение</span><textarea name="offer" rows="5" required></textarea></label><button class="btn" type="submit" style="width:100%">Принять приглашение</button></form>');
  }
  async function createClientAnswer(signal){
    closeClient();clientPeer=await W.createClientPeer(signal);answerToken=Pairing.fromSignal('answer',clientPeer.answer);
    const b=bridge(),share=PWA?.canShare?.()?'<button class="btn" type="button" data-net-share="answer" style="width:100%">Поделиться ответом</button>':'<div class="rules-mode-note">Системное «Поделиться» недоступно. Используйте «Другие способы».</div>';
    b.openModal(b.modalHead('Ответ для хоста')+'<p class="lead">Передайте ответ обратно хосту. Если ХОД установлен на ПК и protocol handler поддерживается, ссылка откроет приложение и ответ применится автоматически.</p>'+share+pairingFallback(answerToken,'net-client-token')+'<p class="lead" style="margin-top:14px">Ждём подтверждения хоста…</p>');
    const channel=await clientPeer.waitOpen({timeout:120000});clientTransport=W.client(channel,{timeout:10000});
    const preview=await clientTransport.snapshot();if(preview?.kind!=='room-preview')throw Error('Получены некорректные данные комнаты.');
    showPreview(preview.room);
  }
  async function createAnswer(form){
    try{await createClientAnswer(signalFromInput(form.elements.offer.value,'offer'));}catch(error){toast(error.message);closeClient();}
  }
  async function handleIncomingPair(token){
    try{
      const value=Pairing.decode(token);
      if(value.kind==='offer'){await createClientAnswer(value.signal);return;}
      if(value.kind==='answer'){await acceptAnswerSignal(value.signal);return;}
    }catch(error){toast(error.message);}
  }
  function rulesText(room){const values=[room.rules?.presetLabel||room.rules?.preset||'Основной набор'];for(const value of Object.values(room.rules?.options||{}))values.push(String(value));if(room.rules?.openHands)values.push('Открытые руки');return values.join(' · ');}
  function showPreview(room){
    const b=bridge();try{b.packs.activate(room.game.id,room.game.version);}catch(_){}
    b.openModal(b.modalHead('Войти · '+room.name)+'<p class="lead"><strong>'+esc(room.game.name)+'</strong> · '+(room.hostMode==='table'?'Хост показывает Стол':'Хост играет')+'</p><div class="rules-mode-note"><strong>Выбрано:</strong> '+esc(rulesText(room))+'</div><form id="net-client-join"><label class="field"><span>Ваш никнейм</span><input name="nickname" maxlength="24" value="'+esc(b.profile()?.name||'Игрок')+'" required></label><button class="btn" type="submit" style="width:100%">Войти в комнату</button></form>');
  }
  async function joinRoom(form){
    try{
      const b=bridge(),profile=b.profile();const result=await clientTransport.dispatch({type:'join',profileId:profile.id,nickname:form.elements.nickname.value});
      if(!result?.ok||result.snapshot?.kind!=='lobby')throw Error('Не удалось войти в комнату.');
      clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;b.closeModal(true);
      clientUnsub=clientTransport.subscribe(snapshot=>{if(snapshot?.kind==='lobby'){clientRoom=snapshot.room;clientParticipantId=snapshot.participantId;renderClientLobby();}else if(snapshot?.kind==='snapshot')startClientGame(snapshot);});
      renderClientLobby();
    }catch(error){toast(error.message);}
  }
  function participant(room,id){return room.participants.find(p=>p.id===id);}
  function renderClientLobby(){
    if(!clientRoom)return;const room=clientRoom,me=participant(room,clientParticipantId),app=document.getElementById('app');
    const personBy=id=>participant(room,id);
    const seats=room.seats.map(seat=>{const p=personBy(seat.participantId),mine=p?.id===clientParticipantId,locked=room.phase!=='lobby'||!!me?.ready;return '<button class="lobby-seat '+(p?'occupied':'available')+'" data-net-seat="'+esc(seat.id)+'" '+(locked||(p&&!mine)?'disabled':'')+'><span class="seat-color" style="background:'+esc(seat.color.value)+'"></span><span><strong>'+(p?esc(p.nickname):esc(seat.color.label)+' слот')+'</strong><small>'+(p?(p.ready?'<span class="lobby-ready">Готов</span>':'<span class="lobby-not-ready">Не готов</span>'):'Нажмите, чтобы занять место')+'</small></span></button>';}).join('');
    const list=room.participants.map(p=>'<div class="lobby-person"><span><strong>'+esc(p.nickname)+(p.isHost?' · хост':'')+'</strong><small>'+(p.role==='spectator'?'Зритель':p.role==='table'?'Стол':p.ready?'Готов':'Игрок')+'</small></span></div>').join('');
    app.inert=false;app.innerHTML='<main class="lobby-shell"><div class="lobby-wrap"><header class="lobby-header"><div><span class="eyebrow muted">СЕТЕВАЯ КОМНАТА</span><h1>'+esc(room.name)+'</h1><p>'+esc(room.game.name)+' · '+esc(rulesText(room))+'</p></div><span class="lobby-code">#'+esc(room.code)+'</span></header><div class="lobby-grid"><section class="lobby-card"><h2>Игровые места</h2><div class="lobby-seats">'+seats+'</div><div class="lobby-actions">'+(me?.role==='player'?'<button class="btn secondary" data-net-action="spectator" '+(me.ready?'disabled':'')+'>Стать зрителем</button>':'')+'<button class="btn secondary" data-net-action="rules">Выбранные правила</button></div></section><aside class="lobby-card"><h2>Вы в комнате</h2><form id="net-client-nickname" class="lobby-profile"><label class="field"><span>Никнейм</span><input name="nickname" maxlength="24" value="'+esc(me?.nickname||'')+'" '+(me?.ready?'disabled':'')+'></label><button class="btn secondary" type="submit" '+(me?.ready?'disabled':'')+'>Сохранить</button></form><div class="lobby-actions">'+(me?.role==='player'?'<button class="btn" data-net-action="ready">'+(me.ready?'Снять готовность':'Я готов')+'</button>':'')+'<button class="btn secondary" data-net-action="leave">Выйти</button></div><h2 style="margin-top:20px">Участники</h2><div class="lobby-participants">'+list+'</div></aside></div></div>'+(room.phase==='starting'?'<div class="lobby-countdown" role="status"><div><strong id="net-countdown">3</strong><p>Игра начинается…</p></div></div>':'')+'</main>';
    if(room.phase==='starting')startClientCountdown();
  }
  function startClientCountdown(){clearInterval(clientLobbyTimer);const update=()=>{if(!clientRoom?.countdownEndsAt)return;const n=Math.max(0,Math.ceil((clientRoom.countdownEndsAt-Date.now())/1000));const node=document.getElementById('net-countdown');if(node)node.textContent=String(n);};update();clientLobbyTimer=setInterval(update,200);}
  async function roomCommand(command){try{const result=await clientTransport.dispatch(command);if(result?.snapshot?.kind==='lobby'){clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;renderClientLobby();}}catch(error){toast(error.message);}}
  async function startHostGame(room){
    if(hostStarted)return;hostStarted=true;
    const b=bridge(),occupied=room.seats.filter(s=>s.participantId).sort((a,c)=>a.index-c.index),players=occupied.map(seat=>{const p=participant(room,seat.participantId);return {name:p.nickname,bot:false};});
    if(players.length<room.constraints.min){hostStarted=false;return;}
    b.packs.activate(room.game.id,room.game.version);
    const session=new Session(root.TabletopCore,room.game.id,{packVersion:room.game.version,players,mode:'solo',preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:!!room.rules.openHands,...(room.rules.options||{})});
    hostAuthority=new Authority(session);
    const remoteId=hostRoomConnection?.participantId,remoteViewer=occupied.findIndex(s=>s.participantId===remoteId);
    if(hostSwitch&&remoteViewer>=0)hostSwitch.set(hostAuthority.connect(remoteViewer));
    const hostViewer=room.hostMode==='table'?-1:occupied.findIndex(s=>s.participantId===room.ownerId);
    const local=LocalTransport(hostAuthority.connect(hostViewer));hostGameClient=new SessionClient(local);await hostGameClient.refresh();
    const definition=b.packs.exportView(room.game.id,room.game.version);b.closeModal(true);document.getElementById('app').inert=false;
    Shared.mount(hostGameClient,definition,{surface:hostViewer<0?'table':'player'}).render();
  }
  function startClientGame(snapshot){
    if(clientGameClient)return;
    try{
      clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;
      const b=bridge();b.packs.activate(snapshot.game,snapshot.packVersion);const definition=b.packs.exportView(snapshot.game,snapshot.packVersion);
      clientGameClient=new SessionClient(clientTransport);clientGameClient.accept(snapshot);document.getElementById('modal-root').innerHTML='';document.getElementById('app').inert=false;
      clientMount=Shared.mount(clientGameClient,definition,{surface:snapshot.viewer<0?'table':'player'});clientMount.render();
    }catch(error){toast('Не удалось открыть сетевую игру. '+error.message);}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-net-copy],[data-net-share],[data-net-seat],[data-net-action],#network-join-button,#network-pair-button,#pwa-install-button');if(!target)return;
    event.preventDefault();event.stopPropagation();
    if(target.id==='network-join-button')return showJoin();
    if(target.id==='network-pair-button')return hostInvite();
    if(target.id==='pwa-install-button'){PWA?.install?.().catch(error=>toast(error.message));return;}
    if(target.dataset.netShare){sharePair(target.dataset.netShare);return;}
    if(target.dataset.netCopy)return copy(target.dataset.netCopy);
    if(target.dataset.netSeat)return roomCommand({type:'claim-seat',seatId:target.dataset.netSeat});
    if(target.dataset.netAction==='ready'){const me=participant(clientRoom,clientParticipantId);return roomCommand({type:'ready',ready:!me?.ready});}
    if(target.dataset.netAction==='spectator')return roomCommand({type:'spectator'});
    if(target.dataset.netAction==='leave'){closeClient();location.reload();return;}
    if(target.dataset.netAction==='rules')return toast(rulesText(clientRoom));
  },true);
  document.addEventListener('submit',event=>{
    if(!['net-host-answer','net-client-offer','net-client-join','net-client-nickname'].includes(event.target.id))return;
    event.preventDefault();event.stopPropagation();
    if(event.target.id==='net-host-answer')acceptAnswer(event.target);
    else if(event.target.id==='net-client-offer')createAnswer(event.target);
    else if(event.target.id==='net-client-join')joinRoom(event.target);
    else if(event.target.id==='net-client-nickname')roomCommand({type:'rename',nickname:event.target.elements.nickname.value});
  },true);
  root.addEventListener('playroom-pair-token',event=>handleIncomingPair(event.detail?.token));
  root.addEventListener('playroom-install-available',ensureButtons);
  const pendingPair=PWA?.consumePending?.();if(pendingPair)setTimeout(()=>handleIncomingPair(pendingPair),0);
  root.PlayroomNetworkDebug=()=>({
    host:{roomId:hostRoomId,peer:!!hostPeer,channel:hostPeer?.channel?.readyState||null,serve:!!hostServeClose,switchCurrent:!!hostSwitch?.current,roomConnection:!!hostRoomConnection,participantId:hostRoomConnection?.participantId||null,rpc:hostPeer?.channel?.__playroomDebug||null},
    client:{peer:!!clientPeer,channel:clientPeer?.pc?.connectionState||null,ice:clientPeer?.pc?.iceConnectionState||null,transport:!!clientTransport,room:!!clientRoom,participantId:clientParticipantId,rpc:clientTransport?.debug?.()||null}
  });
  const observer=new MutationObserver(ensureButtons);observer.observe(document.documentElement,{subtree:true,childList:true});ensureButtons();
  root.addEventListener('pagehide',()=>{closeClient();hostRoomUnsub?.();hostAuthority?.dispose?.();closeHostPeer();});
})(globalThis);
