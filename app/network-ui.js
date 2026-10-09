(function(root){
  'use strict';
  const W=root.PlayroomWebRTCTransport,M=root.PlayroomMultiplayer,Pairing=root.PlayroomPairing,PWA=root.PlayroomPWA,QR=root.PlayroomQR,Acoustic=root.PlayroomAcousticPairing,Session=root.TabletopSession,Authority=root.SessionAuthority,SessionClient=root.PlayroomSessionClient,LocalTransport=root.PlayroomLocalTransport,Shared=root.PlayroomSharedViews;
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bridge=()=>root.PlayroomAppBridge;
  let hostPeer=null,hostSwitch=null,hostServeClose=null,hostRoomConnection=null,hostRoomId=null,hostRoomUnsub=null,hostStarted=false,hostAuthority=null,hostGameClient=null,hostMount=null;
  let clientPeer=null,clientTransport=null,clientUnsub=null,clientRoom=null,clientParticipantId=null,clientGameClient=null,clientMount=null,clientLobbyTimer=null;
  let offerToken=null,answerToken=null,hostAudioListener=null,clientAudioListener=null;
  const connectedHostPeers=[];
  const stopHostAudio=()=>{hostAudioListener?.stop();hostAudioListener=null;};
  const stopClientAudio=()=>{clientAudioListener?.stop();clientAudioListener=null;};
  const KNOWN_IP_KEY='playroom.acoustic-known-addresses.v1';
  function usableManualIp(address){
    if(typeof address!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address))return false;
    const parts=address.split('.').map(Number);
    return parts.every(v=>Number.isInteger(v)&&v>=0&&v<=255)&&
      !['documentation','reserved'].includes(Acoustic.addressKind(address));
  }
  function savedIpEntries(){
    try{
      const values=JSON.parse(localStorage.getItem(KNOWN_IP_KEY)||'[]');
      if(!Array.isArray(values))return [];
      return [...new Set(values)].filter(usableManualIp).slice(0,8).map(address=>({
        address,port:null,component:1,transport:'udp',type:'host',priority:0,
        kind:Acoustic.addressKind(address),ipv4:true,ipv6:false,audio:false,source:'saved'
      }));
    }catch(_){return [];}
  }
  const scannedCandidates={host:[],client:[]};
  const scanGenerations={host:0,client:0};
  function soundCandidates(role,signal){
    const active=Acoustic.allCandidates(signal);
    const extra=scannedCandidates[role].filter(item=>!active.some(c=>c.address===item.address));
    const saved=savedIpEntries().filter(item=>![...active,...extra].some(c=>c.address===item.address));
    return [...active,...extra,...saved];
  }
  function soundCandidateLabel(item){
    const kinds={lan:'частная сеть',public:'публичный/другой интерфейс',
      cgnat:'CGNAT / возможно VPN',linklocal:'link-local',
      documentation:'TEST-NET · непригоден',reserved:'служебный адрес · непригоден',
      mdns:'mDNS · IP скрыт браузером',ipv6:'IPv6',hostname:'имя хоста'};
    const origin=item.source==='saved'?' · внесён пользователем':item.source==='stats'?' · RTCStats':item.source==='probe'?' · дополнительная проверка':'';
    const details=item.port?item.transport.toUpperCase()+' '+item.port+' · '+item.type:'порт из текущего сеанса';
    return item.address+' · '+details+' · '+(kinds[item.kind]||item.kind)+origin;
  }
  function preferredSoundCandidate(items){
    const prefer=predicate=>items.findIndex(predicate);
    let index=prefer(c=>c.audio&&c.kind==='lan');
    if(index<0)index=prefer(c=>['probe','stats','saved'].includes(c.source)&&c.kind==='lan'&&c.ipv4);
    if(index<0)index=prefer(c=>c.audio);
    if(index<0)index=prefer(c=>c.ipv4&&c.kind!=='documentation'&&c.kind!=='reserved');
    return index;
  }
  function soundCandidateOptions(items,selected=-1){
    return items.map((item,index)=>'<option value="'+index+'" '+(index===selected?'selected':'')+'>'+esc(soundCandidateLabel(item))+'</option>').join('');
  }
  function selectionDetails(role,signal){
    const choice=document.getElementById('acoustic-'+role+'-address'),items=soundCandidates(role,signal);
    const selected=choice?.value==='manual'?null:items[Number(choice?.value)];
    return {selected,items,manual:choice?.value==='manual'};
  }
  function syncSoundChoice(role,signal){
    const {selected,manual}=selectionDetails(role,signal);
    const port=document.getElementById('acoustic-'+role+'-port'),help=document.getElementById('acoustic-'+role+'-hint');
    const local=Acoustic.hostCandidates(signal).find(c=>c.audio)||Acoustic.hostCandidates(signal)[0];
    if(port&&!manual)port.value=String(selected?.source==='session'&&selected.port?selected.port:local?.port||'');
    const manualField=document.getElementById('acoustic-'+role+'-manual');
    if(manualField){manualField.disabled=!manual;manualField.hidden=!manual;}
    const saveButton=document.getElementById('acoustic-'+role+'-save');if(saveButton)saveButton.hidden=!manual;
    if(!help)return;
    if(!selected){
      help.textContent=manual?'Введите действующий IPv4 своего устройства. Порт берётся из текущего WebRTC-сеанса.':'Браузер не раскрыл адреса. Введите IPv4 вручную или используйте QR.';
    }else if(selected.source==='saved'){
      help.textContent='Этот IP сохранён после вашего ручного ввода, но браузер не подтвердил его в текущем ICE-сеансе. Порт взят из действующего Offer/Answer; соединение необходимо проверить.';
    }else if(selected.source==='probe'||selected.source==='stats'){
      help.textContent='Адрес обнаружен отдельной WebRTC-проверкой. Порт текущего соединения может относиться к другому интерфейсу; такое подключение не гарантировано.';
    }else if(selected.kind==='documentation'||selected.kind==='reserved'){
      help.textContent='Это служебный/тестовый адрес, непригодный для LAN. Выберите другой IP или введите реальный адрес Wi-Fi.';
    }else if(!selected.audio){
      help.textContent='Адрес показан для диагностики. Для звуковой передачи требуется IPv4 UDP host-кандидат; для других типов используйте QR/Share.';
    }else{
      help.textContent='Адрес и порт взяты из действующего WebRTC-сеанса. Вы можете выбрать любой другой доступный вариант.';
    }
  }
  function soundSettings(role,signal){
    scannedCandidates[role]=[];
    const items=soundCandidates(role,signal),preferred=preferredSoundCandidate(items);
    const selected=preferred>=0?items[preferred]:null;
    const port=selected?.port||Acoustic.hostCandidates(signal).find(c=>c.audio)?.port||Acoustic.hostCandidates(signal)[0]?.port||'';
    return '<fieldset class="acoustic-options"><legend>Подключение звуком</legend>'+
      '<label class="field"><span>Сетевой адрес (все видимые варианты)</span><select id="acoustic-'+role+'-address">'+
      soundCandidateOptions(items,preferred)+'<option value="manual" '+(preferred<0?'selected':'')+'>Указать IP вручную</option></select></label>'+
      '<button type="button" class="btn secondary" data-net-scan="'+role+'">Обновить поиск сетевых адресов</button>'+
      '<p class="lead" id="acoustic-'+role+'-hint" role="status">'+
      (selected?.kind==='documentation'?'Браузер передал только служебный TEST-NET вместо рабочего IP. Он не был найден автоматически.':
      'Список содержит кандидаты из WebRTC, дополнительную диагностику и отдельно сохранённые вами IP.')+'</p>'+
      '<p class="lead" id="acoustic-'+role+'-discovery" role="status"></p>'+
      '<label class="field"><span>IP вручную (если адрес скрыт)</span><input id="acoustic-'+role+'-manual" inputmode="decimal" placeholder="Например: 192.168.1.100" autocomplete="off" '+(preferred>=0?'disabled hidden':'')+'></label>'+
      '<button class="btn secondary" id="acoustic-'+role+'-save" type="button" data-net-save-ip="'+role+'" '+(preferred>=0?'hidden':'')+'>Сохранить введённый IP в списке</button>'+ 
      '<label class="field"><span>UDP порт текущего ICE-сеанса</span><input id="acoustic-'+role+'-port" type="number" min="1" max="65535" value="'+esc(port)+'"></label>'+
      '<label class="field"><span>Tx protocol</span><select id="acoustic-'+role+'-protocol"><option value="fastest">Fastest</option><option value="fast">Fast</option><option value="normal">Normal</option></select></label>'+
      '<p class="lead" id="acoustic-'+role+'-pair-status" role="status">Один компактный сигнал для звука, ссылки и QR при доступном UDP/IPv4.</p>'+ 
      '<p class="lead">В Android откройте свойства подключённой Wi-Fi-сети, чтобы узнать IP. В Windows — свойства сети или ipconfig. Отдельный поиск WebRTC может не раскрыть IP из-за VPN и политики браузера.</p>'+
      (location.protocol==='content:'?'<p class="rules-mode-note"><strong>Открыт content://:</strong> браузер может скрывать IP, а микрофон может не работать. Для звукового pairing установите PlayRoom как PWA с HTTPS; потом приложение сможет работать без интернета.</p>':'')+
      '</fieldset>';
  }
  function updateSoundOptions(role,signal,additional){
    const select=document.getElementById('acoustic-'+role+'-address');
    if(!select)return;
    const old=selectionDetails(role,signal),current=old.selected,manual=old.manual;
    scannedCandidates[role]=additional;
    const items=soundCandidates(role,signal);
    select.innerHTML=soundCandidateOptions(items)+'<option value="manual">Указать IP вручную</option>';
    const same=items.findIndex(c=>current&&c.address===current.address&&c.port===current.port&&c.transport===current.transport);
    const preferred=preferredSoundCandidate(items);
    const keep=!!current&&current.kind!=='documentation'&&current.kind!=='reserved';
    // When initial ICE only exposed TEST-NET, switch from an empty manual
    // choice to a valid newly discovered interface instead of staying on Manual.
    const hasTypedManual=!!document.getElementById('acoustic-'+role+'-manual')?.value.trim();
    select.value=manual&&hasTypedManual?'manual':String(keep&&same>=0?same:preferred>=0?preferred:'manual');
    syncSoundChoice(role,signal);
    updateDiscoverySummary(role,signal);
    updatePairingToken(role);
  }
  function updateDiscoverySummary(role,signal){
    const node=document.getElementById('acoustic-'+role+'-discovery');
    if(!node)return;
    const active=Acoustic.allCandidates(signal),extra=scannedCandidates[role],saved=savedIpEntries();
    const usable=active.filter(c=>c.audio);
    node.textContent='Текущий WebRTC: '+active.length+' кандидатов ('+usable.length+
      ' пригодных IPv4 UDP host). Дополнительный поиск: '+extra.length+
      '. Ваши сохранённые IP: '+saved.length+'. Отсутствие IP в списке не означает отсутствие интерфейса на устройстве.';
  }
  function saveManualIp(role){
    const field=document.getElementById('acoustic-'+role+'-manual');
    const ip=field?.value.trim();
    if(!usableManualIp(ip)){toast('Введите настоящий IPv4 из настроек Wi-Fi/VPN. Служебный TEST-NET не подходит.');return;}
    try{
      const known=[ip,...savedIpEntries().map(c=>c.address).filter(item=>item!==ip)].slice(0,8);
      localStorage.setItem(KNOWN_IP_KEY,JSON.stringify(known));
    }catch(_){toast('Браузер не разрешает сохранять адрес. В текущей попытке IP всё равно можно использовать.');return;}
    const signal=pairSignal(role);
    if(signal){
      updateSoundOptions(role,signal,scannedCandidates[role]);
      const items=soundCandidates(role,signal),at=items.findIndex(c=>c.address===ip);
      const select=document.getElementById('acoustic-'+role+'-address');
      if(select&&at>=0){select.value=String(at);syncSoundChoice(role,signal);}
      updatePairingToken(role);
    }
    toast('IP добавлен в список на этом устройстве (не обнаружен автоматически).');
  }
  async function scanSoundAddresses(role,signal){
    const generation=++scanGenerations[role],button=document.querySelector('[data-net-scan="'+role+'"]');
    if(button){button.disabled=true;button.textContent='Ищем доступные интерфейсы…';}
    try{
      const discovered=await Acoustic.probeAddresses({timeout:2500});
      if(scanGenerations[role]!==generation)return;
      const activeSignal=role==='host'?hostPeer?.offer:clientPeer?.answer;
      if(activeSignal!==signal)return;
      updateSoundOptions(role,signal,discovered);
    }catch(error){
      if(scanGenerations[role]===generation)toast('Не удалось выполнить дополнительный поиск: '+error.message);
    }finally{
      if(scanGenerations[role]===generation){
        const current=document.querySelector('[data-net-scan="'+role+'"]');
        if(current){current.disabled=false;current.textContent='Обновить поиск сетевых адресов';}
      }
    }
  }
  function pairSignal(role){return role==='host'?hostPeer?.offer:clientPeer?.answer;}
  function pairToken(role){
    const signal=pairSignal(role);
    if(!signal)throw Error('WebRTC-приглашение не готово.');
    const kind=role==='host'?'offer':'answer';
    const {selected,manual}=selectionDetails(role,signal);
    const manualValue=document.getElementById('acoustic-'+role+'-manual')?.value.trim();
    const address=manual?manualValue||undefined:selected?.address;
    const rawPort=document.getElementById('acoustic-'+role+'-port')?.value;
    const port=rawPort&&Number.isInteger(Number(rawPort))&&Number(rawPort)>0?Number(rawPort):null;
    return Pairing.fromSignal(kind,signal,{address,port});
  }
  function updatePairingToken(role){
    const signal=pairSignal(role);
    if(!signal)return null;
    const token=pairToken(role),id=role==='host'?'net-host-token':'net-client-token';
    if(role==='host')offerToken=token;else answerToken=token;
    const field=document.getElementById(id);
    if(field){
      field.value=PWA?.pairingUrl?.(token)||PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token);
      renderPairingQR(token,id);
    }
    const note=document.getElementById('acoustic-'+role+'-pair-status');
    if(note)note.textContent=token.startsWith(Pairing.COMPACT_PREFIX)?
      'PR3: компактный пакет для звука, QR и ссылки. Выбранный адрес: '+Pairing.decode(token).ip+'.':
      'PR2: полный SDP — компактный пакет недоступен, потому что нет пригодного IP. Укажите настоящий IP Wi-Fi вручную и QR/ссылка переключатся на PR3.';
    const details=document.getElementById(id)?.closest('.pairing-fallback');
    if(details&&token.startsWith(Pairing.COMPACT_PREFIX))details.open=true;
    return token;
  }
  function sendSoundToken(role){
    const token=updatePairingToken(role);
    if(!token?.startsWith(Pairing.COMPACT_PREFIX))throw Error('Звуковая передача требует допустимого IPv4 UDP host-кандидата. Выберите другой IP; QR/Share доступны.');
    return {message:token.slice(Pairing.COMPACT_PREFIX.length),
      protocol:document.getElementById('acoustic-'+role+'-protocol')?.value||'fastest'};
  }
  async function listenHostAnswer(){
    if(!hostPeer)throw Error('Сначала создайте приглашение.');
    stopHostAudio();
    hostAudioListener=await Acoustic.listen(packet=>{
      if(packet.kind!=='answer')return;
      stopHostAudio();
      acceptAnswerSignal(Pairing.decode(Pairing.COMPACT_PREFIX+packet.message).signal).catch(error=>toast(error.message));
    });
    toast('Микрофон включён: ждём звуковой ответ клиента. Приглашение можно передать QR или ссылкой.');
  }
  async function sendHostSound(){
    if(!hostPeer)throw Error('Сначала создайте приглашение.');
    const {message,protocol}=sendSoundToken('host');
    await listenHostAnswer();
    toast('Передаём приглашение через динамик.');
    await Acoustic.play(message,{protocol});
    toast('Приглашение передано. Ждём ответ телефона.');
  }
  async function listenGuestSound(){
    stopClientAudio();
    clientAudioListener=await Acoustic.listen(packet=>{
      if(packet.kind!=='offer')return;
      stopClientAudio();
      createClientAnswer(Pairing.decode(Pairing.COMPACT_PREFIX+packet.message).signal,{acoustic:true}).catch(error=>toast(error.message));
    });
    toast('Слушаем приглашение. Воспроизведите звук на хосте.');
  }
  async function sendGuestSound(){
    if(!clientPeer?.answer)throw Error('Сначала примите приглашение.');
    const {message,protocol}=sendSoundToken('client');
    await Acoustic.play(message,{protocol});
    toast('Ответ передан. Соединение устанавливается по Wi-Fi.');
  }
  function toast(text){bridge()?.toast?.(text);}
  function copy(id){if(id==='net-host-token')updatePairingToken('host');if(id==='net-client-token')updatePairingToken('client');const field=document.getElementById(id);if(!field)return;field.focus();field.select?.();if(navigator.clipboard?.writeText)navigator.clipboard.writeText(field.value).then(()=>toast('Скопировано')).catch(()=>toast('Текст выделен — скопируйте его вручную.'));else toast('Текст выделен — скопируйте его вручную.');}
  async function copyText(value){try{await navigator.clipboard.writeText(value);toast('Скопировано');}catch(_){toast('Не удалось скопировать автоматически. Используйте поле в «Другие способы».');}}
  async function sharePair(kind){
    const token=updatePairingToken(kind==='offer'?'host':'client');if(!token)throw Error('Нет данных подключения.');
    try{await PWA.shareToken(token);}catch(error){toast(error.message);}
  }
  function pairingFallback(token,id){
    const link=PWA?.pairingUrl?.(token)||PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token);
    return '<details class="pairing-fallback" open><summary>QR и другие способы</summary><p class="lead">QR содержит ту же pairing-ссылку. На телефоне можно открыть его обычной камерой; текст ниже — fallback для copy/paste.</p><div class="pairing-qr" id="'+id+'-qr" aria-label="QR-код подключения"><div class="pairing-qr-loading">Готовим QR…</div></div><label class="field"><span>Ссылка ХОД</span><textarea id="'+id+'" rows="5" readonly>'+esc(link)+'</textarea></label><button class="btn secondary" type="button" data-net-copy="'+id+'" style="width:100%">Скопировать ссылку</button></details>';
  }
  function renderPairingQR(token,id){
    const link=PWA?.pairingUrl?.(token)||PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token);
    QR?.render?.(document.getElementById(id+'-qr'),link,{level:'L',cellSize:4,margin:4});
  }
  function closeClient(){stopClientAudio();clientMount?.destroy?.();clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;clientGameClient?.close?.();clientGameClient=null;clientTransport?.close?.();clientTransport=null;clientPeer?.close?.();clientPeer=null;clientRoom=null;clientParticipantId=null;clientMount=null;}
  function closePendingHostPeer(){
    stopHostAudio();hostServeClose?.();hostServeClose=null;
    hostPeer?.close?.();hostPeer=null;hostSwitch?.close?.();hostSwitch=null;hostRoomConnection=null;
  }
  function closeHostPeer(){
    hostMount?.destroy?.();hostMount=null;closePendingHostPeer();
    for(const item of connectedHostPeers.splice(0)){
      item.serveClose?.();item.peer?.close?.();item.switchable?.close?.();
    }
  }
  function ensureButtons(){
    // Close microphone immediately when the pairing dialog is dismissed.
    if(hostAudioListener&&!document.getElementById('net-host-acoustic'))stopHostAudio();
    if(clientAudioListener&&!document.getElementById('net-client-acoustic-listen'))stopClientAudio();
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
      closePendingHostPeer();offerToken=null;hostRoomConnection=b.roomService.connection(room.id);hostSwitch=new M.SwitchableConnection(hostRoomConnection);
      hostPeer=await W.createHostPeer();hostServeClose=W.serve(hostPeer.channel,hostSwitch);offerToken=Pairing.fromSignal('offer',hostPeer.offer);
      const share=PWA?.canShare?.()?'<button class="btn" type="button" data-net-share="offer" style="width:100%">Поделиться приглашением</button>':'<div class="rules-mode-note">Системное «Поделиться» недоступно. Используйте «Другие способы» ниже.</div>';
      const secure=PWA?.secure?'':'<div class="rules-mode-note"><strong>PWA-функции ограничены:</strong> откройте ХОД по HTTPS после установки. Локальный file/content URL не является secure context.</div>';
      b.openModal(b.modalHead('Подключить устройство')+secure+'<p class="lead">На телефоне можно просто отсканировать QR камерой. Также приглашение можно передать через системное меню «Поделиться».</p>'+soundSettings('host',hostPeer.offer)+'<button class="btn" id="net-host-acoustic" type="button" style="width:100%">Передать звуковое приглашение и слушать ответ</button><button class="btn secondary" id="net-host-acoustic-listen" type="button" style="width:100%">Только слушать звуковой ответ (Offer через QR/ссылку)</button>'+share+pairingFallback(offerToken,'net-host-token')+'<form id="net-host-answer"><label class="field"><span>Fallback: ответ второго устройства</span><textarea name="answer" rows="4" placeholder="Можно вставить ссылку ХОД, pairing token или старый WebRTC answer"></textarea></label><button class="btn secondary" type="submit" style="width:100%">Принять вставленный ответ</button></form><p class="lead" style="margin-top:14px">Если ответ придёт через share target или web+playroom:, ХОД примет его автоматически.</p>');updateDiscoverySummary('host',hostPeer.offer);updatePairingToken('host');void scanSoundAddresses('host',hostPeer.offer);
    }catch(error){toast(error.message);}
  }
  async function acceptAnswerSignal(signal){
    if(!hostPeer)throw Error('На этом устройстве нет активного приглашения. Создайте комнату и нажмите «Подключить устройство».');
    const peer=hostPeer,sw=hostSwitch,serveClose=hostServeClose,roomConnection=hostRoomConnection;
    if(!peer)throw Error('Приглашение уже использовано.');
    await peer.acceptAnswer(signal);
    stopHostAudio();
    connectedHostPeers.push({peer,switchable:sw,serveClose,roomConnection});
    hostPeer=null;hostSwitch=null;hostServeClose=null;hostRoomConnection=null;
    bridge().closeModal(true);toast('Устройство подключено. Теперь войдите в комнату на нём.');
  }
  function signalFromInput(value,expected){
    const token=Pairing.extract(value)||(/^(?:PR2|PR3)\./.test(value.trim())?value.trim():null);
    if(!token)return value.trim();
    const decoded=Pairing.decode(token);if(decoded.kind!==expected)throw Error(expected==='offer'?'Ожидалось приглашение хоста.':'Ожидался ответ клиента.');
    return decoded.signal;
  }
  async function acceptAnswer(form){try{await acceptAnswerSignal(signalFromInput(form.elements.answer.value,'answer'));}catch(error){toast(error.message);}}
  function showJoin(){
    closeClient();const b=bridge(),note=PWA?.secure?'':'<div class="rules-mode-note"><strong>Совет:</strong> для установки PWA и Web Share откройте размещённую HTTPS-версию ХОД.</div>';
    b.openModal(b.modalHead('Присоединиться к комнате')+note+'<button class="btn" id="net-client-acoustic-listen" type="button" style="width:100%">Слушать звуковое приглашение</button><p class="lead">Если приглашение пришло через системное «Поделиться» или ссылку web+playroom:, этот экран откроется автоматически. Fallback — вставьте полученную ссылку или token.</p><form id="net-client-offer"><label class="field"><span>Приглашение</span><textarea name="offer" rows="5" required></textarea></label><button class="btn" type="submit" style="width:100%">Принять приглашение</button></form>');
  }
  async function createClientAnswer(signal,{acoustic=false}={}){
    closeClient();clientPeer=await W.createClientPeer(signal);answerToken=Pairing.fromSignal('answer',clientPeer.answer);
    const b=bridge(),share=PWA?.canShare?.()?'<button class="btn" type="button" data-net-share="answer" style="width:100%">Поделиться ответом</button>':'<div class="rules-mode-note">Системное «Поделиться» недоступно. Используйте «Другие способы».</div>';
    b.openModal(b.modalHead('Ответ для хоста')+'<p class="lead">Передайте ответ обратно хосту. QR показан как дополнительный вариант; если на ПК нет камеры, используйте Share или копирование ссылки.</p>'+soundSettings('client',clientPeer.answer)+'<button class="btn" id="net-client-acoustic-send" type="button" style="width:100%">Отправить звуковой ответ</button>'+share+pairingFallback(answerToken,'net-client-token')+'<p class="lead" style="margin-top:14px">Ждём подтверждения хоста…</p>');updateDiscoverySummary('client',clientPeer.answer);updatePairingToken('client');void scanSoundAddresses('client',clientPeer.answer);
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
    b.openModal(b.modalHead('Войти · '+room.name)+'<p class="lead"><strong>'+esc(room.game.name)+'</strong> · '+(room.hostMode==='table'?'Хост показывает Стол':'Хост играет')+'</p><section class="rules-mode-note"><strong>Выбранные правила</strong>'+rulesMarkup(room)+'</section><form id="net-client-join"><label class="field"><span>Ваш никнейм</span><input name="nickname" maxlength="24" value="'+esc(b.profile()?.name||'Игрок')+'" required></label><button class="btn" type="submit" style="width:100%">Войти в комнату</button></form>');
  }
  async function joinRoom(form){
    try{
      const b=bridge(),result=await clientTransport.dispatch({type:'join',nickname:form.elements.nickname.value});
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
    app.inert=false;app.innerHTML='<main class="lobby-shell"><div class="lobby-wrap"><header class="lobby-header"><div><span class="eyebrow muted">СЕТЕВАЯ КОМНАТА</span><h1>'+esc(room.name)+'</h1><p>'+esc(room.game.name)+' · '+esc(room.rules?.presetLabel||'Основной набор')+'</p></div><span class="lobby-code">#'+esc(room.code)+'</span></header><div class="lobby-grid"><section class="lobby-card"><h2>Игровые места</h2><div class="lobby-seats">'+seats+'</div><h3>Правила комнаты</h3>'+rulesMarkup(room)+'<div class="lobby-actions">'+(me?.role==='player'?'<button class="btn secondary" data-net-action="spectator" '+(me.ready?'disabled':'')+'>Стать зрителем</button>':'')+'<button class="btn secondary" data-net-action="rules">Выбранные правила</button></div></section><aside class="lobby-card"><h2>Вы в комнате</h2><form id="net-client-nickname" class="lobby-profile"><label class="field"><span>Никнейм</span><input name="nickname" maxlength="24" value="'+esc(me?.nickname||'')+'" '+(me?.ready?'disabled':'')+'></label><button class="btn secondary" type="submit" '+(me?.ready?'disabled':'')+'>Сохранить</button></form><div class="lobby-actions">'+(me?.role==='player'?'<button class="btn" data-net-action="ready">'+(me.ready?'Снять готовность':'Я готов')+'</button>':'')+'<button class="btn secondary" data-net-action="leave">Выйти</button></div><h2 style="margin-top:20px">Участники</h2><div class="lobby-participants">'+list+'</div></aside></div></div>'+(room.phase==='starting'?'<div class="lobby-countdown" role="status"><div><strong id="net-countdown">3</strong><p>Игра начинается…</p></div></div>':'')+'</main>';
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
    for(const item of connectedHostPeers){
      const viewer=occupied.findIndex(seat=>seat.participantId===item.roomConnection?.participantId);
      if(viewer>=0)item.switchable.set(hostAuthority.connect(viewer));
    }
    const hostViewer=room.hostMode==='table'?-1:occupied.findIndex(s=>s.participantId===room.ownerId);
    const local=LocalTransport(hostAuthority.connect(hostViewer));hostGameClient=new SessionClient(local);await hostGameClient.refresh();
    const definition=b.packs.exportView(room.game.id,room.game.version);b.closeModal(true);document.getElementById('app').inert=false;
    hostMount=Shared.mount(hostGameClient,definition,{surface:hostViewer<0?'table':'combined'});hostMount.render();
  }
  function startClientGame(snapshot){
    if(clientGameClient)return;
    try{
      clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;
      const b=bridge();b.packs.activate(snapshot.game,snapshot.packVersion);const definition=b.packs.exportView(snapshot.game,snapshot.packVersion);
      clientGameClient=new SessionClient(clientTransport);clientGameClient.accept(snapshot);document.getElementById('modal-root').innerHTML='';document.getElementById('app').inert=false;
      clientMount=Shared.mount(clientGameClient,definition,{surface:snapshot.viewer<0?'table':'combined'});clientMount.render();
    }catch(error){toast('Не удалось открыть сетевую игру. '+error.message);}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-net-copy],[data-net-share],[data-net-scan],[data-net-save-ip],[data-net-seat],[data-net-action],#network-join-button,#network-pair-button,#pwa-install-button,#net-host-acoustic,#net-host-acoustic-listen,#net-client-acoustic-listen,#net-client-acoustic-send');if(!target)return;
    event.preventDefault();event.stopPropagation();
    if(target.id==='network-join-button')return showJoin();
    if(target.id==='network-pair-button')return hostInvite();
    if(target.dataset.netScan){const role=target.dataset.netScan,signal=role==='host'?hostPeer?.offer:clientPeer?.answer;if(signal)return scanSoundAddresses(role,signal);return;}
    if(target.dataset.netSaveIp)return saveManualIp(target.dataset.netSaveIp);
    if(target.id==='net-host-acoustic')return sendHostSound().catch(error=>{stopHostAudio();toast(error.message);});
    if(target.id==='net-host-acoustic-listen')return listenHostAnswer().catch(error=>{stopHostAudio();toast(error.message);});
    if(target.id==='net-client-acoustic-listen')return listenGuestSound().catch(error=>{stopClientAudio();toast(error.message);});
    if(target.id==='net-client-acoustic-send')return sendGuestSound().catch(error=>toast(error.message));
    if(target.id==='pwa-install-button'){PWA?.install?.().catch(error=>toast(error.message));return;}
    if(target.dataset.netShare){sharePair(target.dataset.netShare);return;}
    if(target.dataset.netCopy)return copy(target.dataset.netCopy);
    if(target.dataset.netSeat)return roomCommand({type:'claim-seat',seatId:target.dataset.netSeat});
    if(target.dataset.netAction==='ready'){const me=participant(clientRoom,clientParticipantId);return roomCommand({type:'ready',ready:!me?.ready});}
    if(target.dataset.netAction==='spectator')return roomCommand({type:'spectator'});
    if(target.dataset.netAction==='leave'){closeClient();location.reload();return;}
    if(target.dataset.netAction==='rules')return bridge().openModal(bridge().modalHead('Правила · '+clientRoom.game.name)+rulesMarkup(clientRoom));
  },true);
  document.addEventListener('change',event=>{
    if(!['acoustic-host-address','acoustic-client-address'].includes(event.target.id))return;
    const role=event.target.id.includes('host')?'host':'client';
    const signal=role==='host'?hostPeer?.offer:clientPeer?.answer;
    if(signal){syncSoundChoice(role,signal);updatePairingToken(role);}
  });
  document.addEventListener('change',event=>{
    if(!['acoustic-host-port','acoustic-client-port'].includes(event.target.id))return;
    const role=event.target.id.includes('host')?'host':'client';
    updatePairingToken(role);
  });
  document.addEventListener('input',event=>{
    if(!['acoustic-host-manual','acoustic-client-manual','acoustic-host-port','acoustic-client-port'].includes(event.target.id))return;
    const role=event.target.id.includes('host')?'host':'client';
    updatePairingToken(role);
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
  root.PlayroomNetworkDebug=()=>({
    host:{roomId:hostRoomId,peer:!!hostPeer,connectedPeers:connectedHostPeers.length,channel:hostPeer?.channel?.readyState||null,serve:!!hostServeClose,switchCurrent:!!hostSwitch?.current,roomConnection:!!hostRoomConnection,participantId:hostRoomConnection?.participantId||null,rpc:hostPeer?.channel?.__playroomDebug||null},
    client:{peer:!!clientPeer,channel:clientPeer?.pc?.connectionState||null,ice:clientPeer?.pc?.iceConnectionState||null,transport:!!clientTransport,room:!!clientRoom,participantId:clientParticipantId,rpc:clientTransport?.debug?.()||null}
  });
  const observer=new MutationObserver(ensureButtons);observer.observe(document.documentElement,{subtree:true,childList:true});ensureButtons();
  root.addEventListener('pagehide',()=>{closeClient();hostRoomUnsub?.();hostAuthority?.dispose?.();closeHostPeer();});
})(globalThis);
