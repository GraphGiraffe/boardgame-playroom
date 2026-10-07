(function(root){
  'use strict';
  const W=root.PlayroomWebRTCTransport,M=root.PlayroomMultiplayer,Session=root.TabletopSession,Authority=root.SessionAuthority,SessionClient=root.PlayroomSessionClient,LocalTransport=root.PlayroomLocalTransport,Shared=root.PlayroomSharedViews;
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bridge=()=>root.PlayroomAppBridge;
  let hostPeer=null,hostSwitch=null,hostServeClose=null,hostRoomConnection=null,hostRoomId=null,hostRoomUnsub=null,hostStarted=false,hostAuthority=null,hostGameClient=null;
  let clientPeer=null,clientTransport=null,clientUnsub=null,clientRoom=null,clientParticipantId=null,clientGameClient=null,clientMount=null,clientLobbyTimer=null;
  function toast(text){bridge()?.toast?.(text);}
  function copy(id){const field=document.getElementById(id);if(!field)return;field.focus();field.select?.();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(field.value).then(()=>toast('Скопировано')).catch(()=>toast('Текст выделен — скопируйте его вручную.'));else toast('Текст выделен — скопируйте его вручную.');}
  function closeClient(){clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;clientGameClient?.close?.();clientGameClient=null;clientTransport?.close?.();clientTransport=null;clientPeer?.close?.();clientPeer=null;clientRoom=null;clientParticipantId=null;clientMount=null;}
  function closeHostPeer(){hostServeClose?.();hostServeClose=null;hostPeer?.close?.();hostPeer=null;hostSwitch?.close?.();hostSwitch=null;hostRoomConnection=null;}
  function ensureButtons(){
    const b=bridge();if(!b)return;
    const intro=$('.intro');
    if(intro&&!document.getElementById('network-join-button')){const wrap=document.createElement('div');wrap.className='lobby-actions';wrap.style.marginTop='16px';wrap.innerHTML='<button class="btn secondary" id="network-join-button" type="button">Присоединиться к комнате</button>';intro.appendChild(wrap);}
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
      closeHostPeer();hostRoomConnection=b.roomService.connection(room.id);hostSwitch=new M.SwitchableConnection(hostRoomConnection);
      hostPeer=await W.createHostPeer();hostServeClose=W.serve(hostPeer.channel,hostSwitch);
      b.openModal(b.modalHead('Подключить второе устройство')+'<p class="lead">На втором устройстве откройте ХОД → «Присоединиться к комнате» и вставьте приглашение.</p><label class="field"><span>1. Приглашение хоста</span><textarea id="net-host-offer" rows="7" readonly>'+esc(hostPeer.offer)+'</textarea></label><button class="btn secondary" type="button" data-net-copy="net-host-offer" style="width:100%">Скопировать приглашение</button><form id="net-host-answer"><label class="field"><span>2. Ответ второго устройства</span><textarea name="answer" rows="7" required placeholder="Вставьте ответ"></textarea></label><button class="btn" type="submit" style="width:100%">Завершить подключение</button></form>');
    }catch(error){toast(error.message);}
  }
  async function acceptAnswer(form){try{if(!hostPeer)throw Error('Создайте новое приглашение.');await hostPeer.acceptAnswer(form.elements.answer.value.trim());bridge().closeModal(true);toast('Устройство подключено. Теперь войдите в комнату на нём.');}catch(error){toast(error.message);}}
  function showJoin(){
    closeClient();const b=bridge();b.openModal(b.modalHead('Присоединиться к комнате')+'<p class="lead">Вставьте приглашение с устройства хоста.</p><form id="net-client-offer"><label class="field"><span>Приглашение хоста</span><textarea name="offer" rows="8" required></textarea></label><button class="btn" type="submit" style="width:100%">Создать ответ</button></form>');
  }
  async function createAnswer(form){
    try{
      clientPeer=await W.createClientPeer(form.elements.offer.value.trim());
      const b=bridge();b.openModal(b.modalHead('Ответ для хоста')+'<p class="lead">Скопируйте этот ответ на устройство хоста и вставьте его во второй шаг. После подтверждения подключение продолжится автоматически.</p><label class="field"><span>Ответ подключения</span><textarea id="net-client-answer" rows="8" readonly>'+esc(clientPeer.answer)+'</textarea></label><button class="btn secondary" type="button" data-net-copy="net-client-answer" style="width:100%">Скопировать ответ</button><p class="lead" style="margin-top:14px">Ждём подтверждения хоста…</p>');
      const channel=await clientPeer.waitOpen({timeout:120000});clientTransport=W.client(channel,{timeout:10000});
      const preview=await clientTransport.snapshot();if(preview?.kind!=='room-preview')throw Error('Получены некорректные данные комнаты.');
      showPreview(preview.room);
    }catch(error){toast(error.message);closeClient();}
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
    const target=event.target.closest('[data-net-copy],[data-net-seat],[data-net-action],#network-join-button,#network-pair-button');if(!target)return;
    event.preventDefault();event.stopPropagation();
    if(target.id==='network-join-button')return showJoin();
    if(target.id==='network-pair-button')return hostInvite();
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
  root.PlayroomNetworkDebug=()=>({
    host:{roomId:hostRoomId,peer:!!hostPeer,channel:hostPeer?.channel?.readyState||null,serve:!!hostServeClose,switchCurrent:!!hostSwitch?.current,roomConnection:!!hostRoomConnection,participantId:hostRoomConnection?.participantId||null},
    client:{peer:!!clientPeer,channel:clientPeer?.pc?.connectionState||null,ice:clientPeer?.pc?.iceConnectionState||null,transport:!!clientTransport,room:!!clientRoom,participantId:clientParticipantId}
  });
  const observer=new MutationObserver(ensureButtons);observer.observe(document.documentElement,{subtree:true,childList:true});ensureButtons();
  root.addEventListener('pagehide',()=>{closeClient();hostRoomUnsub?.();hostAuthority?.dispose?.();closeHostPeer();});
})(globalThis);
