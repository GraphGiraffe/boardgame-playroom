(function(root){
  'use strict';
  const W=root.PlayroomWebRTCTransport,M=root.PlayroomMultiplayer,Pairing=root.PlayroomPairing,PWA=root.PlayroomPWA,QR=root.PlayroomQR,Scanner=root.PlayroomQRScanner,Acoustic=root.PlayroomAcousticPairing,Session=root.TabletopSession,Authority=root.SessionAuthority,SessionClient=root.PlayroomSessionClient,LocalTransport=root.PlayroomLocalTransport,Shared=root.PlayroomSharedViews,NetworkSessionStore=root.PlayroomNetworkSessionStore,ClientHistory=root.PlayroomNetworkClientHistory;
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bridge=()=>root.PlayroomAppBridge;
  let hostPeer=null,hostSwitch=null,hostServeClose=null,hostRoomConnection=null,hostRoomId=null,hostRoomUnsub=null,hostStarted=false,hostAuthority=null,hostGameClient=null,hostMount=null;
  let clientPeer=null,clientTransport=null,clientUnsub=null,clientRoom=null,clientParticipantId=null,clientGameClient=null,clientMount=null,clientLobbyTimer=null,clientWaitingForLobby=false,clientPresence=null,clientPresenceUnsub=null;
  let offerToken=null,answerToken=null,hostAudioListener=null,clientAudioListener=null;
  const pendingAudio=new Map();
  async function runAudio(button,operation){
    if(pendingAudio.has(button.id))return;
    const controller=new AbortController(),label=button.innerHTML;pendingAudio.set(button.id,controller);
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Подготовка…';
    try{await operation(controller.signal);}catch(error){if(error.name!=='AbortError')toast(error.message);}
    finally{if(pendingAudio.get(button.id)===controller)pendingAudio.delete(button.id);if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy');button.innerHTML=label;}}
  }
  const pairingQrGenerations=new Map();
  const connectedHostPeers=[];
  const resumeStore=new M.ResumeStore();
  const hostSessionStore=NetworkSessionStore?new NetworkSessionStore():null;
  const clientHistoryStore=ClientHistory?new ClientHistory():null;
  let clientHistoryUnsub=null,clientHistoryQueue=Promise.resolve(),clientHistoryWarning=false,clientBackfillId=0;
  let hostLockRelease=null,archiveMount=null,archiveAuthority=null;
  let hostRecovery=null,rosterQueue=Promise.resolve(),rosterError=null;
  let reconnectStatus='',clientRecovery=null,resumeIntent=null;
  const connectionLabels={connecting:'Подключение',connected:'В игре',recovering:'Восстановление связи',invite:'Нужно новое приглашение'};
  let networkInMenu=false,presentationGeneration=0;
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
    }catch(error){toast('Не удалось вернуться в партию: '+error.message);}
  }
  function mountNetworkView(isHost){
    if(networkInMenu)return;
    const client=isHost?hostGameClient:clientGameClient,snapshot=client?.snapshot;if(!snapshot)return;
    const b=bridge();b.packs.activate(snapshot.game,snapshot.packVersion);b.rememberGame(snapshot.game);
    const definition=b.packs.exportView(snapshot.game,snapshot.packVersion);
    b.closeModal(true);document.getElementById('app').inert=false;
    const old=isHost?hostMount:clientMount;old?.destroy?.();
    const mounted=Shared.mount(client,definition,{surface:snapshot.viewer<0?'table':'combined',connected:isHost||clientConnected(),onExit:isHost?exitHostGame:exitClientGame,onPresented:revision=>{if(!isHost)markClientPosition('presentedRevision',revision);},onReviewed:(revision,frame)=>{if(!isHost)markClientPosition('reviewedRevision',revision,frame);}});
    if(isHost)hostMount=mounted;else clientMount=mounted;
    mounted.render();renderPresence();showDisconnectBanner();
  }

  const stopHostAudio=()=>{hostAudioListener?.stop();hostAudioListener=null;};
  const stopClientAudio=()=>{clientAudioListener?.stop();clientAudioListener=null;};
  const KNOWN_IP_KEY='playroom.acoustic-known-addresses.v1';
  const usableManualIp=address=>Acoustic.usableIPv4(address);
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
    // The selector lists IPv4 addresses for PR3 only. IPv6, mDNS, TCP and
    // other candidates remain in the *full* SDP when "All connections" is used.
    const active=Acoustic.allCandidates(signal).filter(c=>c.audio&&usableManualIp(c.address));
    const validExtra=scannedCandidates[role].filter(c=>usableManualIp(c.address));
    const extra=validExtra.filter(item=>!active.some(c=>c.address===item.address));
    const saved=savedIpEntries().filter(item=>![...active,...extra].some(c=>c.address===item.address));
    return [...active,...extra,...saved];
  }
  function soundCandidateLabel(item){
    const origin=item.source==='saved'?' · внесён пользователем':
      item.source==='stats'?' · найден (RTCStats)':item.source==='probe'?' · найден отдельно':'';
    const network=item.kind==='lan'?'LAN':item.kind==='linklocal'?'link-local':
      item.kind==='cgnat'?'CGNAT':item.kind==='public'?'внешний':item.kind;
    return item.address+' · '+network+(item.port?' · UDP '+item.port:'')+origin;
  }
  function localNetworkRank(ip){
    const p=String(ip||'').split('.').map(Number);
    if(p.length!==4)return -1;
    if(p[0]===192&&p[1]===168)return 0; // RFC 1918 192.168.0.0/16
    if(p[0]===10)return 1;               // RFC 1918 10.0.0.0/8
    if(p[0]===172&&p[1]>=16&&p[1]<=31)return 2; // RFC 1918 172.16.0.0/12
    return -1;
  }
  function preferredSoundCandidate(items){
    // Auto-select only real IPv4/UDP host candidates in this very Offer/Answer.
    // Saved IPs and secondary probes are unverified for this ICE connection;
    // they must be explicitly selected. No private candidate => full PR2.
    return items.map((item,index)=>({item,index,rank:localNetworkRank(item.address)}))
      .filter(x=>x.item.source==='session'&&x.item.audio&&x.rank>=0)
      .sort((a,b)=>a.rank-b.rank||b.item.priority-a.item.priority)[0]?.index??-1;
  }
  function soundCandidateOptions(items,selected=-1){
    return items.map((item,index)=>'<option value="'+index+'" '+(index===selected?'selected':'')+'>'+esc(soundCandidateLabel(item))+'</option>').join('');
  }
  function selectionDetails(role,signal){
    const choice=document.getElementById('acoustic-'+role+'-address'),items=soundCandidates(role,signal);
    const value=choice?.value??'all',manual=value==='manual',all=value==='all';
    const selected=manual||all?null:items[Number(value)];
    return {selected,items,manual,all};
  }
  function syncSoundChoice(role,signal){
    const {selected,manual,all}=selectionDetails(role,signal);
    const help=document.getElementById('acoustic-'+role+'-hint');
    const manualField=document.getElementById('acoustic-'+role+'-manual');
    const manualRow=document.getElementById('acoustic-'+role+'-manual-row');
    if(manualField)manualField.disabled=!manual;
    if(manualRow)manualRow.hidden=!manual;
    if(!help)return;
    if(all){
      help.textContent='Все соединения: передаём полный SDP через PR2. WebRTC сам проверяет доступные ICE-маршруты; звук для отправки в этом формате недоступен.';
    }else if(manual){
      help.textContent='Введённый IPv4 действует сразу, без сохранения в список. Для PR3 также нужен UDP host-кандидат текущего соединения.';
    }else if(selected.source==='saved'){
      help.textContent='Этот IP сохранён после вашего ручного ввода, но браузер не подтвердил его в текущем ICE-сеансе. Порт взят из действующего Offer/Answer; соединение необходимо проверить.';
    }else if(selected.source==='probe'||selected.source==='stats'){
      help.textContent='Адрес обнаружен отдельной WebRTC-проверкой. Порт текущего соединения может относиться к другому интерфейсу; такое подключение не гарантировано.';
    }else{
      help.textContent='IPv4 и UDP-порт взяты из действующего WebRTC-сеанса. Один выбранный маршрут передаётся через PR3.';
    }
  }
  function initialNetworkChoice(role,signal){
    scannedCandidates[role]=[];
    const items=soundCandidates(role,signal);let preferred=preferredSoundCandidate(items);
    const kind=role==='host'?'offer':'answer';let token;
    if(preferred>=0)try{
      const selected=items[preferred];token=Pairing.COMPACT_PREFIX+Acoustic.pack(signal,{address:selected.address,port:selected.port});
    }catch(_){preferred=-1;}
    if(preferred<0)token=Pairing.fromSignal(kind,signal,{legacy:true});
    return {preferred,token,html:'<div class="pairing-network-choice" data-pairing-network="'+role+'"><div class="pairing-network-select-row">'+
      '<label class="field"><span>Сетевое соединение</span><select id="acoustic-'+role+'-address" aria-label="Сетевое соединение">'+
      '<option value="all" '+(preferred<0?'selected':'')+'>Все соединения (автоматически)</option>'+
      soundCandidateOptions(items,preferred)+'<option value="manual">Ввести IPv4 вручную</option></select></label>'+
      '<button type="button" class="btn secondary pairing-scan-address" data-net-scan="'+role+'" title="Обновить обнаруженные сетевые адреса" aria-label="Обновить обнаруженные сетевые адреса">'+root.PlayroomGameScreen.icon('reset')+'</button></div>'+
      '<div class="pairing-inline-row"><div id="acoustic-'+role+'-manual-row" class="pairing-manual-row" hidden>'+
      '<input id="acoustic-'+role+'-manual" inputmode="decimal" aria-label="IPv4 вручную" placeholder="Например: 192.168.1.100" autocomplete="off" disabled>'+
      '<button class="btn secondary pairing-icon-action" id="acoustic-'+role+'-save" type="button" data-net-save-ip="'+role+'" title="Сохранить IP" aria-label="Сохранить введённый IP">'+root.PlayroomGameScreen.icon('save')+'</button></div>'+
      '</div>'+
      '<p class="pairing-network-mode" id="acoustic-'+role+'-mode" role="status"></p>'+pairingHelp('network',role)+'</div>'};
  }
  function soundSettings(role){
    return '<details class="pairing-sound-settings"><summary>'+root.PlayroomGameScreen.icon('settings')+' Скорость звука</summary><div class="pairing-sound-fields">'+
      '<label class="field"><span>Скорость передачи</span><select id="acoustic-'+role+'-protocol"><option value="fastest">Fastest</option><option value="fast">Fast</option><option value="normal">Normal</option></select></label>'+
      '</div></details>';
  }
  function updateSoundOptions(role,signal,additional){
    const select=document.getElementById('acoustic-'+role+'-address');
    if(!select)return;
    const old=selectionDetails(role,signal),current=old.selected,manual=old.manual,all=old.all;
    const explicit=select.dataset.userChoice==='true';
    scannedCandidates[role]=additional;
    const items=soundCandidates(role,signal);
    select.innerHTML='<option value="all">Все соединения (автоматически)</option>'+soundCandidateOptions(items)+'<option value="manual">Ввести IPv4 вручную</option>';
    const same=items.findIndex(c=>current&&c.address===current.address&&c.port===current.port&&c.transport===current.transport);
    const preferred=preferredSoundCandidate(items);
    select.value=explicit?(manual?'manual':all?'all':same>=0?String(same):'all'):
      preferred>=0?String(preferred):'all';
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
      '. Ваши сохранённые IP: '+saved.length+'. Все соединения включают также IPv6, mDNS и другие ICE-маршруты.';
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
      if(select&&at>=0){select.value=String(at);select.dataset.userChoice='true';syncSoundChoice(role,signal);}
      updatePairingToken(role);
    }
    pairingProgress('IP сохранён на этом устройстве.','network');
  }
  async function scanSoundAddresses(role,signal){
    const generation=++scanGenerations[role],button=document.querySelector('[data-net-scan="'+role+'"]');
    if(button){button.disabled=true;button.innerHTML=root.PlayroomGameScreen.icon('reset')+' …';}
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
        if(current){current.disabled=false;current.innerHTML=root.PlayroomGameScreen.icon('reset');}
      }
    }
  }
  function pairSignal(role){return role==='host'?hostPeer?.offer:clientPeer?.answer;}
  function pairToken(role){
    const signal=pairSignal(role);
    if(!signal)throw Error('WebRTC-приглашение не готово.');
    const kind=role==='host'?'offer':'answer';
    const {selected,manual,all}=selectionDetails(role,signal);
    if(all)return Pairing.fromSignal(kind,signal,{legacy:true});
    const manualValue=document.getElementById('acoustic-'+role+'-manual')?.value.trim();
    const address=manual?manualValue:selected?.address;
    if(!usableManualIp(address))throw Error('Введите корректный IPv4 или выберите «Все соединения».');
    // A selected IP is STRICTLY PR3: never quietly substitute another ICE
    // address or return PR2 without telling the user.
    return Pairing.COMPACT_PREFIX+Acoustic.pack(signal,{address,port:selected?.source==='session'?selected.port:null});
  }
  function updatePairingToken(role){
    const signal=pairSignal(role);
    if(!signal)return null;
    let token=null,error=null;
    try{token=pairToken(role);}catch(e){error=e;}
    const id=role==='host'?'net-host-token':'net-client-token';
    if(role==='host')offerToken=token;else answerToken=token;
    const field=document.getElementById(id);
    if(field){
      field.value=token?(PWA?.pairingUrl?.(token)||PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token)):'';
      if(token)renderPairingQR(token,id);
      else{
        const qr=document.getElementById(id+'-qr');
        pairingQrGenerations.set(id,(pairingQrGenerations.get(id)||0)+1);
        if(qr){qr.innerHTML='<p class="pairing-brief-status">Укажите действительный IPv4 либо выберите «Все соединения».</p>';qr.classList.remove('pairing-qr-ready','pairing-qr-legacy');}
      }
    }
    for(const button of document.querySelectorAll('[data-net-copy="'+id+'"], [data-net-share="'+(role==='host'?'offer':'answer')+'"]'))button.disabled=!token;
    const note=document.getElementById('acoustic-'+role+'-pair-status');
    if(note)note.textContent=error?'Не удалось создать PR3: '+error.message:
      token.startsWith(Pairing.COMPACT_PREFIX)?'PR3: один выбранный IPv4/UDP host-кандидат, текущие ICE и DTLS-параметры.':
        'PR2: полный SDP со всеми предоставленными браузером ICE-кандидатами (включая mDNS/IPv6).';
    const mode=document.getElementById('acoustic-'+role+'-mode');
    if(mode)mode.textContent=error?'Нужен корректный IPv4/UDP · '+error.message:
      token.startsWith(Pairing.COMPACT_PREFIX)?'Выбранный IPv4 · компактное приглашение':
        'Все соединения · WebRTC выберет маршрут';
    syncPairingAvailability(role,token);
    return token;
  }
  function sendSoundToken(role){
    const token=updatePairingToken(role);
    if(!token?.startsWith(Pairing.COMPACT_PREFIX))throw Error('Звуковая передача требует допустимого IPv4 UDP host-кандидата. Выберите другой IP; QR/Share доступны.');
    return {message:token.slice(Pairing.COMPACT_PREFIX.length),
      protocol:document.getElementById('acoustic-'+role+'-protocol')?.value||'fastest'};
  }
  async function listenHostAnswer(signal){
    if(!hostPeer)throw Error('Сначала создайте приглашение.');
    stopHostAudio();
    hostAudioListener=await Acoustic.listen(packet=>{
      if(packet.kind!=='answer')return;
      stopHostAudio();
      acceptAnswerSignal(Pairing.decode(Pairing.COMPACT_PREFIX+packet.message).signal).catch(error=>toast(error.message));
    },{signal});
    pairingProgress('Слушаем ответ клиента…');
  }
  async function sendHostSoundOnly(signal){
    if(!hostPeer)throw Error('Сначала создайте приглашение.');
    const {message,protocol}=sendSoundToken('host');
    await Acoustic.play(message,{protocol,signal});
    pairingProgress('Приглашение передано. Ожидаем ответ клиента.');
  }
  async function listenGuestSound(signal){
    stopClientAudio();
    clientAudioListener=await Acoustic.listen(packet=>{
      if(packet.kind!=='offer')return;
      stopClientAudio();
      createClientAnswer(Pairing.decode(Pairing.COMPACT_PREFIX+packet.message).signal,{acoustic:true}).catch(error=>toast(error.message));
    },{signal});
    pairingProgress('Слушаем приглашение…');
  }
  async function sendGuestSound(signal){
    if(!clientPeer?.answer)throw Error('Сначала примите приглашение.');
    const {message,protocol}=sendSoundToken('client');
    await Acoustic.play(message,{protocol,signal});
    pairingProgress('Ответ передан. Подключаемся…');
  }
  function captureNotice(){
    const issue=Acoustic?.microphoneIssue?.();
    return issue?'<div class="rules-mode-note" id="acoustic-capture-warning" role="status"><strong>Приём звука сейчас недоступен.</strong> '+esc(issue)+'</div>':'';
  }
  const captureDisabled=()=>Acoustic?.microphoneIssue?.()?' disabled aria-describedby="acoustic-capture-warning"':'';
  const audioOutput=()=>typeof root.ggwave_factory==='function'&&!!(root.AudioContext||root.webkitAudioContext);
  const microphoneReady=()=>!Acoustic?.microphoneIssue?.()&&typeof Acoustic?.listen==='function'&&audioOutput();
  const soundOutputReady=token=>audioOutput()&&typeof token==='string'&&token.startsWith(Pairing.COMPACT_PREFIX);
  function methodAvailability(stage,token){
    const outgoing=stage!=='client-join',share=outgoing?!!PWA?.canShare?.(token):!!(PWA?.secure&&PWA?.standalone);
    const microphone=microphoneReady(),soundOut=outgoing&&soundOutputReady(token);
    const sound=stage==='client-join'?microphone:stage==='host-offer'?microphone||soundOut:soundOut;
    return {
      share:{available:share,reason:outgoing?'Системное меню недоступно на этом адресе или для данного приглашения':'Нужна установленная HTTPS PWA'},
      sound:{available:sound,reason:!audioOutput()?'Нет звукового модуля':
        stage==='client-join'?'Нет доступа к микрофону':
        stage==='host-offer'?'Для передачи выберите IPv4; для приёма нужен микрофон':'Нужен IPv4 UDP'},
      qr:{available:outgoing?!!QR?.render:!!Scanner?.scan,reason:'Нет QR-модуля'},
      text:{available:true,reason:''}
    };
  }
  function pairingHelp(key,role=''){
    const messages={
      share:'Передайте приглашение или ответ через системное меню. Получатель открывает ссылку в ХОД. Доступность зависит от браузера и установленной PWA.',
      sound:'«Передать» воспроизводит сигнал через динамик и не включает микрофон. «Слушать» принимает сигнал с разрешения на микрофон. Для передачи выберите IPv4: используется короткий формат PR3. Режим «Все соединения» использует PR2, который передаётся другими способами.',
      qr:'Откройте QR системной камерой либо выберите фото из галереи. Принимаются приглашения и ответы PR3 и PR2. Хост получает QR-ответ игрока через кнопки под своим кодом.',
      text:'Скопируйте ссылку и передайте другому участнику. Полученное приглашение или ответ вставьте в поле и подтвердите.',
      network:'«Все соединения» позволяет WebRTC выбрать маршрут и передаёт полный формат PR2. Выбор IPv4 создаёт короткое приглашение PR3, пригодное для звука. Ручной адрес действует сразу; кнопка сохранения добавляет его в список. Найденный или сохранённый адрес нужно проверить подключением.'
    };
    const id='pairing-help-'+key;
    return '<details class="pairing-help-inline" data-pairing-help="'+key+'"><summary aria-label="Справка: '+({share:'Поделиться',sound:'Звук',qr:'QR',text:'Текст',network:'Сетевое соединение'})[key]+'" aria-controls="'+id+'">'+root.PlayroomGameScreen.icon('help')+'</summary><div id="'+id+'" class="pairing-help-content"><p>'+esc(messages[key])+'</p>'+
      (key==='sound'?captureNotice():'')+(key==='network'?'<p id="acoustic-'+role+'-hint"></p><p id="acoustic-'+role+'-discovery"></p><p id="acoustic-'+role+'-pair-status"></p>':'')+'</div></details>';
  }
  function pairingMethod(key,title,icon,content,availability){
    const enabled=availability.available;
    return '<details class="pairing-method" data-pairing-method="'+key+'" data-pairing-available="'+enabled+'" '+(enabled?'open':'')+'>'+
      '<summary><span class="pairing-method-icon" aria-hidden="true">'+root.PlayroomGameScreen.icon(icon)+'</span><span class="pairing-method-title">'+title+'</span>'+
      '<span class="pairing-method-reason" '+(enabled?'hidden':'')+'>'+esc(availability.reason)+'</span><span class="pairing-chevron" aria-hidden="true">'+root.PlayroomGameScreen.icon('chevron')+'</span></summary>'+
      '<div class="pairing-method-body">'+pairingHelp(key)+content+'</div></details>';
  }
  function pairingMethods(stage,contents,token){
    const states=methodAvailability(stage,token),sequence=[
      ['share','Поделиться','share'],['sound','Звук','sound'],['qr','QR','qr'],['text','Текст','text']
    ];
    const active=sequence.filter(([key])=>states[key].available),inactive=sequence.filter(([key])=>!states[key].available);
    const render=items=>items.map(([key,name,icon])=>pairingMethod(key,name,icon,contents[key],states[key])).join('');
    return '<div class="pairing-methods" data-pairing-stage="'+stage+'">'+
      '<div class="pairing-methods-available">'+render(active)+'</div>'+
      '<details class="pairing-methods-unavailable" '+(inactive.length?'':'hidden')+'><summary>Недоступные способы <span class="pairing-unavailable-count">'+inactive.length+'</span></summary>'+
      '<div class="pairing-methods-unavailable-items">'+render(inactive)+'</div></details></div>';
  }
  function syncPairingAvailability(role,token){
    const wrapper=document.querySelector('.pairing-methods[data-pairing-stage="'+(role==='host'?'host-offer':'client-answer')+'"]');
    if(!wrapper)return;
    const stage=wrapper.dataset.pairingStage,states=methodAvailability(stage,token);
    const available=wrapper.querySelector('.pairing-methods-available'),unavailable=wrapper.querySelector('.pairing-methods-unavailable'),missing=wrapper.querySelector('.pairing-methods-unavailable-items');
    const methods=[...wrapper.querySelectorAll('.pairing-method')];
    for(const element of methods){
      const key=element.dataset.pairingMethod,state=states[key],was=element.dataset.pairingAvailable==='true';
      // Do not collapse the input while a manual IPv4 is being entered.
      const editing=key==='sound'&&element.contains(document.activeElement)&&document.activeElement?.id==='acoustic-'+role+'-manual';
      element.dataset.pairingAvailable=String(state.available);
      const reason=element.querySelector('.pairing-method-reason');
      if(reason){reason.hidden=state.available;reason.textContent=state.reason;}
      if(state.available&&!editing&&(!was||element.parentElement!==available)){
        available.append(element);element.open=true;
      }else if(!state.available&&!editing&&element.parentElement!==missing){
        missing.append(element);element.open=false;
      }
    }
    const order=['share','sound','qr','text'];
    for(const group of [available,missing]){
      const ordered=[...group.children].sort((a,b)=>order.indexOf(a.dataset.pairingMethod)-order.indexOf(b.dataset.pairingMethod));
      for(let index=0;index<ordered.length;index++)if(group.children[index]!==ordered[index])group.insertBefore(ordered[index],group.children[index]);
    }
    const count=missing.children.length;unavailable.hidden=count===0;
    unavailable.querySelector('.pairing-unavailable-count').textContent=String(count);
    const shareButton=wrapper.querySelector('[data-net-share]');if(shareButton)shareButton.disabled=!token||!states.share.available;
    const sending=soundOutputReady(token),receiving=microphoneReady();
    for(const [id,can] of [['net-host-acoustic-send',sending],
      ['net-host-acoustic-listen',receiving],['net-client-acoustic-send',sending]]){
      const button=document.getElementById(id);if(button)button.disabled=!can;
    }
  }
  function pairingHeader(title,role,stage){
    return bridge().modalHead(title);
  }
  const pairingFooter=()=>'<p class="pairing-origin-note">Для некоторых способов нужен HTTPS/PWA. Сетевые сохранения требуют постоянного адреса приложения.</p>';
  function toast(text){bridge()?.toast?.(text);}
  function pairingProgress(text,method='sound'){
    const body=document.querySelector('[data-pairing-method="'+method+'"] .pairing-method-body')||document.querySelector('.pairing-network-choice')||document.querySelector('.pairing-methods');
    if(!body)return;
    let line=body.querySelector('.pairing-progress');
    if(!line){line=document.createElement('p');line.className='pairing-progress pairing-brief-status';line.setAttribute('role','status');body.appendChild(line);}
    line.textContent=text;
  }
  function copy(id){
    if(id==='net-host-token')updatePairingToken('host');if(id==='net-client-token')updatePairingToken('client');
    const field=document.getElementById(id);if(!field?.value)return toast('Сначала выберите соединение или укажите корректный IPv4.');
    // Synchronous copy can work in Android content:// even when the modern
    // async Clipboard API is disallowed by the origin. Never claim success
    // unless one of these APIs actually confirms it.
    field.focus();field.select?.();field.setSelectionRange?.(0,field.value.length);
    let copied=false;try{copied=!!document.execCommand?.('copy');}catch(_){}
    if(copied){pairingProgress('Скопировано.','text');return;}
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(field.value).then(()=>pairingProgress('Скопировано.','text'))
        .catch(()=>toast('Копирование заблокировано браузером. Нажмите и удерживайте выделенный текст → «Копировать».'));
    }else toast('Браузер запрещает копирование с этой страницы. Нажмите и удерживайте выделенный текст → «Копировать».');
  }
  async function copyText(value){try{await navigator.clipboard.writeText(value);pairingProgress('Скопировано.','text');}catch(_){toast('Не удалось скопировать автоматически. Используйте поле в «Другие способы».');}}
  async function sharePair(kind){
    try{const token=updatePairingToken(kind==='offer'?'host':'client');if(!token)throw Error('Сначала выберите соединение или укажите корректный IPv4.');await PWA.shareToken(token);}catch(error){toast(error.message);}
  }
  function pairingText(token,id){
    const link=PWA?.pairingUrl?.(token)||PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token);
    return '<label class="field"><span>Ссылка ХОД</span><textarea id="'+id+'" rows="2" readonly>'+esc(link)+'</textarea></label>'+
      '<button class="btn secondary pairing-compact-button" type="button" data-net-copy="'+id+'">⧉ Скопировать</button>';
  }
  function pairingQr(id){
    return '<div class="pairing-qr" id="'+id+'-qr" aria-label="QR-код подключения"><div class="pairing-qr-loading">Готовим QR…</div></div>';
  }
  function renderPairingQR(token,id){
    const link=PWA?.pairingUrl?.(token)||PWA?.protocolUrl?.(token)||Pairing.protocolUrl(token);
    const node=document.getElementById(id+'-qr');if(!node||!QR?.render)return;
    const generation=(pairingQrGenerations.get(id)||0)+1;pairingQrGenerations.set(id,generation);
    // QR encoding is async. Older PR2/PR3 renders must not overwrite the QR
    // for a newly selected network address after a rapid manual IP edit.
    const staged=document.createElement('div');
    void QR.render(staged,link,{level:'L',cellSize:4,margin:4}).then(ok=>{
      if(pairingQrGenerations.get(id)!==generation||!node.isConnected)return;
      node.innerHTML=staged.innerHTML;
      node.classList.toggle('pairing-qr-ready',!!ok);
      node.classList.toggle('pairing-qr-legacy',!token.startsWith(Pairing.COMPACT_PREFIX));
    });
  }
  function scanControls(role){
    return '<div class="qr-capture-controls">'+
      '<div class="pairing-actions">'+
      '<button class="btn pairing-compact-button" type="button" data-net-qr-camera="'+role+'" '+(Scanner?.scan?'':'disabled')+'>'+root.PlayroomGameScreen.icon('camera')+' Камера</button>'+
      '<button class="btn secondary pairing-compact-button" type="button" data-net-qr-gallery="'+role+'" '+(Scanner?.scan?'':'disabled')+'>'+root.PlayroomGameScreen.icon('image')+' Галерея</button>'+
      '</div>'+
      '<input id="net-'+role+'-qr-camera" data-net-qr-file="'+role+'" type="file" accept="image/*" capture="environment" hidden>'+
      '<input id="net-'+role+'-qr-gallery" data-net-qr-file="'+role+'" type="file" accept="image/*" hidden>'+
      '<p id="net-'+role+'-qr-status" role="status" class="pairing-brief-status"></p>'+
      '</div>';
  }
  async function readPairingQR(file,role){
    const status=document.getElementById('net-'+role+'-qr-status');
    if(status)status.textContent='Распознаём QR на фотографии…';
    try{
      if(!Scanner?.scan)throw Error('QR-декодер не загружен.');
      const scanned=await Scanner.scan(file);
      const expected=role==='host'?'answer':'offer';
      if(scanned.kind!==expected)throw Error(role==='host'?
        'Нужен QR-ответ с телефона, а не приглашение.':'Нужен QR-код приглашения хоста.');
      if(status)status.textContent='QR '+scanned.token.slice(0,3)+' распознан ('+scanned.method+'). Подключаемся…';
      if(role==='host')await acceptAnswerSignal(scanned.signal);
      else await createClientAnswer(scanned.signal);
    }catch(error){
      if(status)status.textContent=error?.message||String(error);
      toast('QR: '+(error?.message||String(error)));
    }
  }
  function closeClient({preserveIntent=false}={}){
    if(preserveIntent&&clientGameClient&&clientRoom)resumeIntent={roomId:clientRoom.id,participantId:clientParticipantId,snapshot:clientGameClient.snapshot,pending:clientGameClient.pending,historyIndex:clientMount?.historyOpen?clientMount.historyIndex:null};
    else if(!preserveIntent)resumeIntent=null;
    clientRecovery?.close();clientRecovery=null;
    presentationGeneration++;
    clientSetupShown=false;clientBackfillId++;clientHistoryUnsub?.();clientHistoryUnsub=null;stopClientAudio();clientPresenceUnsub?.();clientPresenceUnsub=null;clientPresence=null;clientMount?.destroy?.();clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;clientGameClient?.close?.();clientGameClient=null;clientTransport?.close?.();clientTransport=null;clientPeer?.close?.();clientPeer=null;clientRoom=null;clientParticipantId=null;clientMount=null;clientWaitingForLobby=false;}
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
      .map(p=>({id:p.id,nickname:p.nickname,connected:!!p.connected,seatId:p.seatId,role:p.role,isHost:!!p.isHost,bot:!!p.bot,local:!!p.local,hasConnected:Number.isFinite(p.joinedAt),replacement:p.replacement||null,playerIndex:occupied.find(s=>s.participantId===p.id)?.playerIndex??occupied.findIndex(s=>s.participantId===p.id)}))};
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
    const lost=clientPeer&&['disconnected','failed','closed'].includes(clientPeer.pc.connectionState);
    for(const p of data.participants){
      if(!Number.isSafeInteger(p.playerIndex)||p.playerIndex<0)continue;
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
    const value='<span class="network-presence-count">В сети: '+connected+' из '+players.length+'</span>'+
      players.filter(p=>!p.connected).map(p=>'<span class="network-person '+(p.connected?'online':'offline')+'">'+
        '<i class="network-person-dot" aria-hidden="true"></i>'+esc(p.nickname)+(p.isHost?' · хост':'')+
        (p.connected?'':' · отключён')+'</span>').join('');
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
    wrap.innerHTML='<strong>'+connectionLabels[state]+'</strong> '+(state==='connected'?'':'Ваше игровое место сохраняется. ')+
      (state==='invite'?'<button class="btn secondary" id="network-reconnect-button" type="button">Новое приглашение</button>':'')+
      ' <button class="text-btn" data-net-action="diagnostics">Диагностика связи</button>';
  }
  function markClientPosition(kind,revision,frame){
    const snapshot=clientGameClient?.snapshot,roomId=clientRoom?.id,id=clientParticipantId;
    if(!snapshot||!roomId||!id||!clientHistoryStore)return;
    const key=ClientHistory.id(roomId,id,snapshot.sessionId);
    if(frame)saveClientProjection(frame);
    clientHistoryQueue=clientHistoryQueue.catch(()=>{}).then(()=>clientHistoryStore.mark(key,kind,revision));
  }
  function startRecovery(){
    clientRecovery?.close();const transport=clientTransport,peer=clientPeer;
    clientRecovery=new W.Recovery({pc:peer.pc,transport,
      onState:report=>{clientMount?.setConnected(report.state==='connected');if(report.state!=='connected')clientBackfillId++;showDisconnectBanner();renderPresence();ensureButtons();},
      reconcile:async(snapshot,{recovering})=>{
        if(transport!==clientTransport)throw Error('Подключение заменено.');
        if(snapshot?.kind==='lobby'){
          if(snapshot.room?.id!==clientRoom?.id||snapshot.participantId!==clientParticipantId)throw Error('Другая комната.');
          const changed=snapshot.room.revision!==clientRoom.revision;clientRoom=snapshot.room;
          if(clientGameClient&&clientGameClient.snapshot.state.status!=='finished')clientToLobby();
          else if(!clientGameClient&&changed)renderClientLobby();return;
        }
        if(snapshot?.kind!=='snapshot')throw Error('Некорректное состояние.');
        if(!clientGameClient)startClientGame(snapshot);
        if(!clientGameClient)throw Error('Партия недоступна.');
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
    if(intro&&!document.getElementById('network-join-button')){const wrap=document.createElement('div');wrap.className='lobby-actions';wrap.style.marginTop='16px';wrap.innerHTML='<button class="btn secondary" id="network-join-button" type="button">Присоединиться к комнате</button>';intro.appendChild(wrap);}

    if(hasActiveRoom()&&networkInMenu){
      const room=clientRoom||b.room(),connected=!!hostRoomId||clientConnected(),parent=intro||document.querySelector('.hub-main');
      if(parent){const markup=root.PlayroomGameScreen.resumeCard({title:room?.game?.name||'Комната',detail:(room?.name||'')+' · '+(hostRoomId?'Соединение активно':connectionLabels[clientRecovery?.state||(connected?'connected':'connecting')]),network:true,connected,action:connected?'id="network-return-button" data-net-action="return-game"':'id="network-reconnect-button"',leave:'data-net-action="leave-active"'});
        const old=document.querySelector('.network-resume-card'),key=(room?.id||'')+':'+connected+':'+(room?.name||'')+':'+(clientRecovery?.state||'');if(!old||old.dataset.renderKey!==key){if(old)old.outerHTML=markup;else parent.insertAdjacentHTML('afterend',markup);document.querySelector('.network-resume-card').dataset.renderKey=key;}
      }
    }

    if(intro&&PWA?.canInstall?.()&&!PWA.standalone&&!document.getElementById('pwa-install-button')){const btn=document.createElement('button');btn.className='btn secondary';btn.id='pwa-install-button';btn.type='button';btn.textContent='Установить ХОД';intro.querySelector('.lobby-actions')?.appendChild(btn);}
    showDisconnectBanner();renderPresence();
    const gameShell=document.querySelector('.table-shell.network-game');
    if(gameShell&&hostAuthority&&!document.getElementById('network-pair-button')){
      const tools=gameShell.querySelector('.table-tools')||gameShell.querySelector('.table-header')||gameShell;
      const primary=tools.querySelector('[data-game-primary]');
      if(primary)primary.insertAdjacentHTML('afterend',root.PlayroomGameScreen.addPlayerButton());
      else tools.insertAdjacentHTML('afterbegin',root.PlayroomGameScreen.addPlayerButton());
    }
    const room=b.room?.(),lobby=$('.lobby-shell');
    const tools=document.querySelector('.topbar-tools,.table-tools');if(clientRoom&&tools&&!tools.closest('.table-shell')&&!tools.querySelector('[data-net-action=room]')){const node=document.createElement('button');node.className='icon-btn';node.dataset.netAction='room';node.setAttribute('aria-label','Комната');node.innerHTML=root.PlayroomGameScreen.icon('room');tools.prepend(node);}
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
    if(state.phase==='playing'&&!hostStarted)startHostGame(state).catch(error=>toast(error.message));
    else if(document.querySelector('.lobby-shell'))bridge().renderLobby();
    if(state.phase==='playing'){notifyPresence(state);renderPresence();}
  }
  function persistRecoveryRoster(room){
    const saved=hostRecovery;if(!saved||!room.recovery)return rosterQueue;
    const recovery=bridge().roomService.exportRecovery(room.id);
    rosterQueue=rosterQueue.catch(()=>{}).then(()=>hostSessionStore.saveRoster({sessionId:room.recovery.sessionId,room,recovery,revision:saved.revision}));
    rosterQueue.then(()=>{rosterError=null;},error=>{rosterError=error;toast('Не удалось сохранить состав комнаты: '+error.message);});
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
      history:index=>{if(switchable.completedHistory){if(!Number.isSafeInteger(index)||!switchable.completedHistory[index])throw Error('Некорректный ход истории.');return switchable.completedHistory[index];}return switchable.history(index);},
      subscribe:listener=>switchable.subscribe(listener),
      presentationReady:message=>switchable.presentationReady(message),
      dispatch:async command=>{
        const result=await switchable.dispatch(command);
        if((command?.type==='resume'||command?.type==='join')&&result?.ok){
          const id=result.snapshot.participantId;
          for(const old of connectedHostPeers.filter(p=>p.roomConnection?.participantId===id&&p.peer!==peer)){
            old.serveClose?.();old.peer?.close?.();old.switchable?.close?.();
            const i=connectedHostPeers.indexOf(old);if(i>=0)connectedHostPeers.splice(i,1);
          }
          const room=bridge().roomService.snapshot(roomId);
          if(room.phase==='playing'&&hostAuthority){
            const occupied=room.seats.filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index);
            const viewer=occupied.find(seat=>seat.participantId===id)?.playerIndex??occupied.findIndex(seat=>seat.participantId===id);
            if(!participant(room,id))throw Error('Участник удалён из комнаты.');
            switchable.set(hostAuthority.connect(viewer));
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
      const b=bridge(),room=b?.room?.();if(!room)throw Error('Сначала создайте сетевую комнату.');
      closePendingHostPeer();offerToken=null;hostRoomConnection=b.roomService.connection(room.id);hostSwitch=new M.SwitchableConnection(hostRoomConnection);
      hostPeer=await W.createHostPeer();hostServeClose=hostPeerServing(hostPeer,hostSwitch,hostRoomConnection,room.id);
      const network=initialNetworkChoice('host',hostPeer.offer);offerToken=network.token;
      const share='<button class="btn pairing-compact-button" type="button" data-net-share="offer" '+(PWA?.canShare?.(offerToken)?'':'disabled')+'>'+root.PlayroomGameScreen.icon('share')+' Поделиться</button>';
      const sound='<div class="pairing-actions">'+
        '<button class="btn pairing-compact-button" id="net-host-acoustic-send" type="button" title="Отправить сигнал через динамик">'+root.PlayroomGameScreen.icon('sound')+' Передать</button>'+
        '<button class="btn secondary pairing-compact-button" id="net-host-acoustic-listen" type="button" '+captureDisabled()+' title="Принять звуковой ответ">'+root.PlayroomGameScreen.icon('mic')+' Слушать</button></div>'+soundSettings('host');
      const qr=pairingQr('net-host-token')+'<div class="pairing-divider-label">Получить QR-ответ</div>'+scanControls('host');
      const text=pairingText(offerToken,'net-host-token')+
        '<form id="net-host-answer"><label class="field"><span>Ответ игрока</span><textarea name="answer" rows="2" placeholder="Вставьте ответ или ссылку ХОД"></textarea></label>'+
        '<button class="btn secondary pairing-compact-button" type="submit">'+root.PlayroomGameScreen.icon('connect')+' Принять ответ</button></form>';
      b.openModal(pairingHeader('Подключить устройство','host','host-offer')+
        network.html+pairingMethods('host-offer',{share,sound,qr,text},offerToken)+pairingFooter());
      syncSoundChoice('host',hostPeer.offer);updateDiscoverySummary('host',hostPeer.offer);updatePairingToken('host');void scanSoundAddresses('host',hostPeer.offer);
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
    if(!networkInMenu){bridge().closeModal(true);if(bridge().room()?.phase==='lobby')bridge().renderLobby();}
  }
  function signalFromInput(value,expected){
    const token=Pairing.extract(value)||(/^(?:PR2|PR3)\./.test(value.trim())?value.trim():null);
    if(!token)return value.trim();
    const decoded=Pairing.decode(token);if(decoded.kind!==expected)throw Error(expected==='offer'?'Ожидалось приглашение хоста.':'Ожидался ответ клиента.');
    return decoded.signal;
  }
  async function acceptAnswer(form){try{await acceptAnswerSignal(signalFromInput(form.elements.answer.value,'answer'));}catch(error){toast(error.message);}}
  function showJoin(){
    if(hasActiveRoom()&&(hostRoomId||clientConnected()))return toast('Сначала покиньте текущую комнату через лобби.');
    networkInMenu=false;closeClient({preserveIntent:true});const b=bridge();
    const share='<p class="pairing-brief-status" role="status">Ожидаем приглашение через системное меню.</p>';
    const sound='<button class="btn pairing-compact-button" id="net-client-acoustic-listen" type="button" '+(microphoneReady()?'':captureDisabled()||'disabled')+'>'+root.PlayroomGameScreen.icon('mic')+' Слушать</button>';
    const qr=scanControls('client');
    const text='<form id="net-client-offer"><label class="field"><span>Приглашение</span><textarea name="offer" rows="3" required placeholder="Ссылка или код приглашения"></textarea></label>'+
      '<button class="btn pairing-compact-button" type="submit">'+root.PlayroomGameScreen.icon('connect')+' Принять приглашение</button></form>';
    b.openModal(pairingHeader('Присоединиться к комнате','client','client-join')+
      pairingMethods('client-join',{share,sound,qr,text})+pairingFooter());
  }
  async function createClientAnswer(signal,{acoustic=false}={}){
    // A QR/share invite may arrive while a DIFFERENT local game is active.
    // Persist and park that game before mounting network UI: otherwise local
    // bots and input/replay listeners can repaint the network scene.
    if(hasActiveRoom()&&(hostRoomId||clientConnected()))throw Error('Сначала покиньте текущую комнату через лобби.');
    networkInMenu=false;bridge()?.parkLocalSession?.();
    closeClient({preserveIntent:true});clientPeer=await W.createClientPeer(signal);
    const network=initialNetworkChoice('client',clientPeer.answer);answerToken=network.token;
    const b=bridge();
    const share='<button class="btn pairing-compact-button" type="button" data-net-share="answer" '+(PWA?.canShare?.(answerToken)?'':'disabled')+'>'+root.PlayroomGameScreen.icon('share')+' Поделиться ответом</button>';
    const sound='<button class="btn pairing-compact-button" id="net-client-acoustic-send" type="button">'+root.PlayroomGameScreen.icon('sound')+' Передать</button>'+soundSettings('client');
    const qr=pairingQr('net-client-token');
    const text=pairingText(answerToken,'net-client-token');
    b.openModal(pairingHeader('Ответ для хоста','client','client-answer')+
      network.html+pairingMethods('client-answer',{share,sound,qr,text},answerToken)+'<p class="pairing-brief-status" role="status">Ждём подтверждения хоста…</p>'+pairingFooter());
    syncSoundChoice('client',clientPeer.answer);updateDiscoverySummary('client',clientPeer.answer);updatePairingToken('client');void scanSoundAddresses('client',clientPeer.answer);
    const channel=await clientPeer.waitOpen({timeout:120000});clientTransport=W.client(channel,{timeout:10000});
    clientPresenceUnsub=clientTransport.subscribePresence?.(status=>{clientPresence=status;renderPresence();});
    const preview=await clientTransport.snapshot();if(preview?.kind!=='room-preview')throw Error('Получены некорректные данные комнаты.');
    const saved=resumeStore.load(preview.room.id);
    if(saved){
      try{
        const resumed=await clientTransport.dispatch({type:'resume',participantId:saved.participantId,resumeToken:saved.token});
        if(!resumed?.ok||!resumed.resumeToken)throw Error('Сервер не подтвердил переподключение.');
        const durable=resumeStore.save(preview.room.id,resumed.snapshot.participantId,resumed.resumeToken);
        if(!durable)toast('Место восстановлено, но браузер не сохранил новый ключ. Не закрывайте страницу.');
        clientRoom=resumed.snapshot.room;clientParticipantId=resumed.snapshot.participantId;
        bridge().closeModal(true);
        const state=await clientTransport.snapshot();
        if(state?.kind==='snapshot')startClientGame(state);
        else{resumeIntent=null;attachClientLobbyListener();renderClientLobby();}
        startRecovery();return;
      }catch(error){
        toast('Автовозврат не удался: '+error.message+' Можно присоединиться новым игроком.');
      }
    }
    if(preview.room.phase==='playing'){
      throw Error('Партия уже началась. Вернуться можно только с сохранённым ключом игрока на этом устройстве.');
    }
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
      clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;
      if(result.resumeToken){
        const persisted=resumeStore.save(clientRoom.id,clientParticipantId,result.resumeToken);
        if(!persisted)toast('Место занято, но браузер не сохранил ключ возврата. Без него нельзя вернуться после перезапуска.');
      }
      b.closeModal(true);
      attachClientLobbyListener();
      renderClientLobby();startRecovery();
    }catch(error){toast(error.message);}
  }
  function participant(room,id){return room.participants.find(p=>p.id===id);}
  function attachClientLobbyListener(){
    clientUnsub?.();clientUnsub=clientTransport.subscribe(snapshot=>{
      if(snapshot?.kind==='lobby'){
        clientRoom=snapshot.room;clientParticipantId=snapshot.participantId;
        if(clientGameClient?.snapshot?.state?.status==='finished'&&!clientWaitingForLobby)return;
        if(clientGameClient){
          clientSetupShown=false;
          clientBackfillId++;clientHistoryUnsub?.();clientHistoryUnsub=null;
          clientMount?.destroy?.();clientMount=null;
          clientGameClient.close({keepTransport:true});clientGameClient=null;
        }
        clientWaitingForLobby=false;if(!networkInMenu)renderClientLobby();
      }else if(snapshot?.kind==='snapshot'&&!clientWaitingForLobby){startClientGame(snapshot);}
    });
  }
  function clientToLobby({waiting=false}={}){
    if(!clientTransport||!clientRoom)return;
    clientBackfillId++;clientHistoryUnsub?.();clientHistoryUnsub=null;
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
    if(hostRoomId&&hostRoomId!==roomId)throw Error('Комната хоста изменена.');
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
    bridge().openModal(PlayroomLobbyView.render({room,participantId:clientParticipantId,waiting:clientWaitingForLobby,notice:room.phase==='lobby'&&me?.rulesNotice?'Хост изменил правила. Проверьте их и подтвердите готовность заново.':''}),'room-setup-modal');
    PlayroomLobbyView.bindDrag(document.querySelector('#modal-root .lobby-shell'),{canMove:id=>!room.recovery&&id===clientParticipantId&&room.phase==='lobby'&&!participant(room,id)?.ready,move:(id,slot)=>roomCommand(slot==='table'?{type:'claim-table'}:slot==='spectator'?{type:'spectator'}:{type:'claim-seat',seatId:slot}),onError:error=>toast(error.message)});
    if(room.phase==='starting')startClientCountdown();
  }
  function startClientCountdown(){clearInterval(clientLobbyTimer);const update=()=>{if(!clientRoom?.countdownEndsAt)return;const n=Math.max(0,Math.ceil((clientRoom.countdownEndsAt-Date.now())/1000));const node=document.getElementById('net-countdown');if(node)node.textContent=String(n);};update();clientLobbyTimer=setInterval(update,200);}
  async function roomCommand(command){try{if(!clientConnected())throw Error('Дождитесь восстановления связи.');const result=await clientTransport.dispatch(command);if(result?.snapshot?.kind==='lobby'){clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;renderClientLobby();}}catch(error){toast(error.message);}}
  async function startHostGame(room){
    if(hostStarted)return;hostStarted=true;
    const generation=++presentationGeneration;
    const b=bridge();let persisted=false;
    try{
      const occupied=room.seats.filter(s=>s.participantId).sort((a,c)=>a.index-c.index),players=occupied.map(seat=>{const p=participant(room,seat.participantId);return {name:p.nickname,bot:!!p.bot};});
      if(players.length<room.constraints.min)throw Error('Недостаточно игроков для запуска.');
      b.packs.activate(room.game.id,room.game.version);
      const restored=room.recovery?hostRecovery:null;
      if(room.recovery&&!restored)throw Error('Не загружена сохранённая партия.');
      const session=restored?.session||new Session(root.TabletopCore,room.game.id,{packVersion:room.game.version,players,mode:'solo',preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:!!room.rules.openHands,firstPlayerMode:room.firstPlayerMode||'random',firstPlayer:occupied.findIndex(seat=>seat.participantId===room.firstParticipantId),...(room.rules.options||{})});
      // Do not publish the first playable snapshot until the private initial
      // state and room recovery capability have reached durable storage.
      const sessionId=restored?.sessionId||root.crypto?.randomUUID?.()||'network-'+room.id+'-'+Date.now();
      if(!hostSessionStore)throw Error('Хранилище сетевой партии не загружено.');
      if(restored){
        await rosterQueue;if(rosterError)throw rosterError;
        if(occupied.length!==session.current.players.length||occupied.some((seat,i)=>seat.playerIndex!==i))throw Error('Изменена связь мест с сохранённой партией.');
        players.forEach((p,i)=>session.setPlayerMetadata(i,p));
      }else{
        hostLockRelease=await hostSessionStore.acquireHostLock(sessionId);
        const packDigest=await NetworkSessionStore.fingerprintPack(b.packs,room.game.id,room.game.version);
        await hostSessionStore.create({sessionId,room,session,recovery:b.roomService.exportRecovery(room.id),packDigest});
      }
      persisted=true;
      if(hostRoomId!==room.id){hostLockRelease?.();hostLockRelease=null;return;}
      resumeDurability(room.id,sessionId);
      hostAuthority=new Authority(session,{sessionId,restoredReceipts:restored?.receipts||[],paused:!!restored?.paused,controlRevision:restored?.controlRevision||0,persistence:{
        commit:entry=>hostSessionStore.commit(entry),
        recordReceipt:entry=>hostSessionStore.recordReceipt(entry),setControl:entry=>hostSessionStore.setControl(entry)
      }});
      for(const person of roomPresence(room).participants)if(person.playerIndex>=0)hostAuthority.setViewerConnected?.(person.playerIndex,person.connected);
      for(const item of connectedHostPeers){
        const viewer=occupied.find(seat=>seat.participantId===item.roomConnection?.participantId)?.playerIndex??occupied.findIndex(seat=>seat.participantId===item.roomConnection?.participantId);
        item.switchable.completedHistory=null;item.switchable.set(hostAuthority.connect(viewer));
      }
      const hostViewer=room.hostMode==='table'?-1:occupied.findIndex(s=>s.participantId===room.ownerId);
      const local=LocalTransport(hostAuthority.connect(hostViewer));hostGameClient=new SessionClient(local);await hostGameClient.refresh();
      if(generation===presentationGeneration)mountNetworkView(true);hostAuthority.scheduleBot({onError:error=>toast(error.message)});notifyPresence(room);
    }catch(error){
      hostGameClient?.close?.();hostGameClient=null;
      hostAuthority?.dispose?.();hostAuthority=null;
      hostLockRelease?.();hostLockRelease=null;
      if(persisted){
        // This room has already been committed. Starting a new session would
        // strand a saved match; require an explicit reload/recovery instead.
        closeHostPeer();
        throw Error('Партия сохранена, но экран не запустился. Перезагрузите ХОД и восстановите комнату из сетевых сохранений: '+error.message);
      }
      hostStarted=false;
      try{b.roomService.abortStart(room.id,b.participantId());b.renderLobby();}catch(_){}
      throw Error('Не удалось создать сетевую партию: '+error.message);
    }
  }
  async function showHostArchives(){
    try{
      if(!hostSessionStore)throw Error('IndexedDB-модуль не загружен.');
      const b=bridge(),items=await hostSessionStore.list();
      b.openModal(b.modalHead('Сетевые сохранения хоста')+
        '<p class="lead">После перезапуска хоста можно продолжить сохранённую комнату на том же адресе приложения. ' +
        'Участники вернутся по новому QR с прежними приватными правами. Если сохранение слишком старое, будет доступна только история.</p>'+
        (items.length?'<div class="lobby-actions">'+items.map(item=>
          '<button type="button" class="btn secondary" data-network-archive="'+esc(item.sessionId)+'">'+
          esc(item.game)+' · '+esc(item.packVersion)+' · '+item.revision+' действий · '+
          esc(new Date(item.updatedAt).toLocaleString('ru-RU'))+'</button>').join('')+'</div>':
          '<p class="rules-mode-note">Пока нет сохранённых сетевых партий на этом адресе приложения.</p>'));
    }catch(error){toast('Сетевые сохранения недоступны: '+error.message);}
  }
  async function inspectHostArchive(sessionId){
    try{
      const saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved)throw Error('Сохранение не найдено.');
      const b=bridge(),room=saved.room,st=saved.session.current;
      b.openModal(b.modalHead('Проверенное сохранение')+
        '<p class="lead"><strong>'+esc(room.name)+'</strong> · '+esc(room.game.name)+' · '+esc(saved.session.packVersion)+'</p>'+
        '<p class="rules-mode-note">Восстановлена вся история: '+(saved.session.states.length-1)+
        ' действий. Участников: '+st.players.length+'. Статус: '+esc(st.status)+
        '. Прежняя игра и квитанции сохранены.</p>'+
        '<button class="btn secondary" type="button" data-network-history="'+esc(sessionId)+'">Посмотреть историю ходов</button>'+
        (saved.recovery&&saved.packDigest?'<button class="btn" type="button" data-network-continue="'+esc(sessionId)+'">Продолжить комнату на этом устройстве</button>':
          '<p class="rules-mode-note">Это архив до сохранения гостевых прав. Он доступен только для просмотра истории.</p>')+
        '<button class="btn secondary" id="network-saved-host-button" type="button">К списку сохранений</button>');
    }catch(error){toast('Не удалось прочитать сетевую партию: '+error.message);}
  }
  function closeHostHistory(){
    archiveMount?.destroy?.();archiveMount=null;
    archiveAuthority?.dispose?.();archiveAuthority=null;
  }
  async function openHostHistory(sessionId){
    if((hostMount||clientMount)&&hasActiveRoom())parkNetworkView();
    try{
      const b=bridge(),saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved)throw Error('Сохранение не найдено.');
      b.packs.activate(saved.session.game,saved.session.packVersion);
      const definition=b.packs.exportView(saved.session.game,saved.session.packVersion);
      const room=saved.recovery?.room||saved.room;
      const occupied=room.seats.filter(seat=>seat.participantId).sort((a,c)=>a.index-c.index);
      const viewer=room.hostMode==='table'?-1:(occupied.find(seat=>seat.participantId===room.ownerId)?.playerIndex??occupied.findIndex(seat=>seat.participantId===room.ownerId));
      if(room.hostMode==='player'&&viewer<0)throw Error('Не найдено место хоста.');
      closeHostHistory();
      archiveAuthority=new Authority(saved.session,{sessionId});
      const binding=archiveAuthority.connect(viewer);
      const reader={snapshot:binding.snapshot(),pending:null,subscribe:()=>()=>{},
        history:index=>Promise.resolve(binding.history(index)),send:()=>Promise.reject(Error('Архив доступен только для чтения.'))};
      const exit=()=>{closeHostHistory();b.showSessions();};
      b.closeModal(true);document.getElementById('app').inert=false;
      archiveMount=Shared.mount(reader,definition,{surface:viewer<0?'table':'combined',readOnly:true,onExit:exit});
      archiveMount.render();await archiveMount.openHistory(saved.revision);
    }catch(error){closeHostHistory();toast('Не удалось открыть историю: '+error.message);}
  }
  async function continueHostArchive(sessionId){
    let pendingRelease=null,recoveredRoomId=null;
    try{
      const b=bridge(),profile=b.profile?.();
      if(hostStarted||hostAuthority||hostRoomId||b.room?.()||archiveMount)throw Error('Сначала завершите текущую сетевую комнату или просмотр истории.');
      if(!profile?.id)throw Error('Сначала сохраните имя игрока на устройстве хоста.');
      const item=(await hostSessionStore.list()).find(entry=>entry.sessionId===sessionId);
      if(!item)throw Error('Сохранение не найдено.');
      // The precise installed game version must exist. A newer pack may not
      // silently replace the rules or renderer of an already-started match.
      b.packs.activate(item.game,item.packVersion);
      const saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved?.recovery)throw Error('Архив создан без прав гостей. Восстановление комнаты невозможно.');
      if(saved.session.current.status==='finished'){await openHostHistory(sessionId);return;}
      if(!saved.packDigest)throw Error('Архив создан без контрольной суммы правил. Безопасное продолжение невозможно.');
      if(await NetworkSessionStore.fingerprintPack(b.packs,saved.session.game,saved.session.packVersion)!==saved.packDigest)
        throw Error('Содержимое пака изменилось при прежнем номере версии. Возобновление заблокировано; архив сохранён.');
      const room=saved.recovery.room;
      if(room.ownerId!==profile.id||(!['playing','lobby','starting'].includes(room.phase))||room.id!==saved.room.id||
          saved.session.game!==room.game.id||saved.session.packVersion!==room.game.version)
        throw Error('Этот профиль не является хостом сохранённой партии.');
      const occupied=room.seats.filter(seat=>seat.participantId||Number.isInteger(seat.playerIndex)).sort((a,c)=>a.index-c.index);
      if(occupied.length!==saved.session.current.players.length||occupied.some((seat,i)=>Number.isInteger(seat.playerIndex)&&seat.playerIndex!==i))
        throw Error('Состав игроков не соответствует сохранённой партии.');
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
      toast('Не удалось продолжить партию: '+error.message);
    }
  }
  function saveClientProjection(snapshot){
    if(!clientHistoryStore||!clientRoom?.id||!clientParticipantId||!snapshot||snapshot.kind!=='snapshot')return;
    const roomId=clientRoom.id,participantId=clientParticipantId,roomName=clientRoom.name,participants=clientPresence?.participants||clientRoom.participants;
    // Serialized writes prevent competing older and newer revisions overwriting
    // metadata on the same browser. A failure leaves the live game usable.
    clientHistoryQueue=clientHistoryQueue.catch(()=>{}).then(()=>clientHistoryStore.save({roomId,participantId,roomName,participants,snapshot}));
    clientHistoryQueue.catch(error=>{
      if(!clientHistoryWarning){clientHistoryWarning=true;toast('Не удалось сохранить историю на этом устройстве: '+error.message);}
    });
  }
  async function backfillClientHistory(initial,transport,roomId,participantId){
    if(!clientHistoryStore||!initial||initial.viewer< -1)return;
    const ticket=++clientBackfillId;
    try{await clientHistoryQueue;await clientHistoryStore.backfill({roomId,participantId,roomName:clientRoom?.name||'',snapshot:initial,transport,
      isCurrent:()=>ticket===clientBackfillId&&clientTransport===transport&&clientGameClient?.snapshot?.sessionId===initial.sessionId&&clientGameClient?.snapshot?.authorityEpoch===initial.authorityEpoch});}
    catch(_){/* Keep durable frames; retry only missing revisions after recovery. */}
  }

  async function listNetworkArchives(){
    const responses=await Promise.allSettled([hostSessionStore?.list()||Promise.resolve([]),clientHistoryStore?.list()||Promise.resolve([])]);
    if(responses.every(x=>x.status==='rejected'))throw Error('Сетевые архивы недоступны.');
    return responses.flatMap(x=>x.status==='fulfilled'?x.value:[]).map(item=>{let missingPack=false;try{if(!bridge().packs.list().some(p=>p.id===item.game&&p.version===item.packVersion))throw Error('Missing pack');}catch(_){missingPack=true;}return {...item,missingPack};});
  }
  async function removeNetworkArchive(key){
    if(hostStarted||hostAuthority||clientGameClient||archiveMount)throw Error('Сначала выйдите из активной партии или истории.');
    if(key.startsWith('client:')){const entries=await clientHistoryStore.list(),entry=entries.find(e=>e.id===key.slice(7));await clientHistoryStore.remove(key.slice(7));if(entry&&!entries.some(e=>e.id!==entry.id&&e.roomId===entry.roomId))resumeStore.remove(entry.roomId);}
    else{if(!hostSessionStore)throw Error('Архив недоступен');const release=await hostSessionStore.acquireHostLock(key);try{await hostSessionStore.remove(key);}finally{release();}}
  }
  async function openClientHistory(key){
    if((hostMount||clientMount)&&hasActiveRoom())parkNetworkView();
    try{
      const saved=await clientHistoryStore.read(key);
      if(!saved?.frames.length)throw Error('История отсутствует на устройстве.');
      const b=bridge();b.packs.activate(saved.game,saved.packVersion);
      const last=saved.frames.at(-1),definition=b.packs.exportView(saved.game,saved.packVersion);
      closeHostHistory();
      archiveAuthority=null;
      const epoch=last.authorityEpoch;
      const packet=(frame,kind)=>Object.freeze({protocolVersion:1,kind,sessionId:saved.sessionId,
        authorityEpoch:epoch,revision:frame.revision,game:saved.game,packVersion:saved.packVersion,
        viewer:saved.viewer,audience:saved.viewer<0?'public':'player',state:frame.state,
        events:frame.events,actions:[],cues:[],effects:[],historyLength:last.revision+1});
      const frames=new Map(saved.frames.map(f=>[f.revision,f]));
      const reader={snapshot:packet(last,'snapshot'),pending:null,subscribe:()=>()=>{},
        history:index=>frames.has(index)?Promise.resolve(packet(frames.get(index),'history')):
          Promise.reject(Error('Этот ход отсутствует в локальной истории. Подключитесь к хосту для синхронизации.')),
        send:()=>Promise.reject(Error('Просмотр истории доступен только для чтения.'))};
      const exit=()=>{closeHostHistory();b.showSessions();};
      b.closeModal(true);document.getElementById('app').inert=false;
      archiveMount=Shared.mount(reader,definition,{surface:saved.viewer<0?'table':'combined',readOnly:true,onExit:exit});
      archiveMount.render();await archiveMount.openHistory(last.revision);
    }catch(error){closeHostHistory();toast('Не удалось открыть клиентскую историю: '+error.message);}
  }
  async function openNetworkHistory(key){
    const client=key.startsWith('client:');
    return client?openClientHistory(key.slice(7)):openHostHistory(key);
  }
  async function continueSavedNetwork(key){
    if(hostGameClient?.snapshot?.sessionId===key)return returnToNetwork();
    if(key.startsWith('client:')&&clientGameClient){const saved=await clientHistoryStore.read(key.slice(7));if(saved?.sessionId===clientGameClient.snapshot.sessionId&&saved.roomId===clientRoom?.id&&saved.participantId===clientParticipantId)return returnToNetwork();}
    if(hasActiveRoom())return toast('Сначала покиньте текущую комнату через лобби.');
    networkInMenu=false;
    if(key.startsWith('client:')){
      if(hostStarted||hostAuthority||bridge().room?.())return toast('Сначала закройте текущую комнату.');
      showJoin();pairingProgress('Получите новое приглашение хоста. Ваше прежнее место сохранено.','qr');
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
        if(intent.roomId===clientRoom.id&&intent.participantId===clientParticipantId&&['sessionId','authorityEpoch','viewer','game','packVersion'].every(k=>intent.snapshot[k]===snapshot[k])){
          if(intent.pending)clientGameClient.pending=intent.pending;
          mountNetworkView(false);if(intent.historyIndex!==null)void clientMount?.openHistory(intent.historyIndex);
        }else mountNetworkView(false);
      }else mountNetworkView(false);
    }catch(error){toast('Не удалось открыть сетевую игру. '+error.message);}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-net-copy],[data-net-share],[data-net-scan],[data-net-save-ip],[data-net-qr-camera],[data-net-qr-gallery],[data-net-seat],[data-net-action],#network-join-button,#network-reconnect-button,#network-pair-button,#network-saved-host-button,[data-network-archive],[data-network-continue],[data-network-history],#pwa-install-button,#net-host-acoustic,#net-host-acoustic-send,#net-host-acoustic-listen,#net-client-acoustic-listen,#net-client-acoustic-send');if(!target)return;
    event.preventDefault();event.stopPropagation();
    if(target.dataset.netAction==='diagnostics'){
      const report=clientRecovery?.report()||{state:'connecting'};
      bridge().openModal(bridge().modalHead('Диагностика связи')+'<p>'+esc(connectionLabels[report.state])+'</p><pre class="network-diagnostic-report" style="white-space:pre-wrap;overflow-wrap:anywhere">'+esc(JSON.stringify(report,null,2))+'</pre><button class="btn" data-net-action="copy-diagnostics">Скопировать отчёт</button>');return;
    }
    if(target.dataset.netAction==='copy-diagnostics'){void Promise.resolve().then(()=>navigator.clipboard.writeText(JSON.stringify(clientRecovery?.report()||{},null,2))).then(()=>toast('Отчёт скопирован'),()=>toast('Копирование недоступно; выделите текст отчёта.'));return;}
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
    if(target.id==='pwa-install-button'){PWA?.install?.().catch(error=>toast(error.message));return;}
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
    if(target.dataset.netAction==='stop-match'){if(!hostAuthority||!root.confirm('Сохранить партию и вернуть всех в лобби? Её можно будет продолжить из «Моих партий».'))return;void hostAuthority.stopForLobby().then(()=>exitHostGame({stopped:true})).catch(error=>toast(error.message));return;}
    if(target.dataset.netAction==='leave-active'){if(!root.confirm('Покинуть комнату? Соединение будет закрыто. Партия сохранится.'))return;if(clientRoom)closeClient();else bridge().leaveLobby?.();networkInMenu=false;bridge().showHub();return;}
    if(target.dataset.netAction==='leave'){if(!root.confirm('Покинуть комнату? Соединение будет закрыто. Партия сохранится.'))return;closeClient();networkInMenu=false;bridge().showHub();return;}
    if(target.dataset.netAction==='rules')return bridge().openModal(bridge().modalHead(clientRoom.game.name+' · правила')+PlayroomLobbyView.rulesMarkup(clientRoom,rulesRows(clientRoom),bridge().meta(clientRoom.game.id)||{}));
    if(target.dataset.netAction==='help')return bridge().openModal(bridge().modalHead('Комната · справка')+PlayroomLobbyView.helpMarkup(clientRoom));
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
  root.PlayroomNetworkLibrary=Object.freeze({list:listNetworkArchives,playerMetadata,hasActiveRoom,
    showSettings:(options={})=>bridge().showSettings({room:clientRoom||bridge().room(),participantId:clientRoom?clientParticipantId:bridge().participantId(),client:!!clientRoom,...options}),leaveClientRoom:closeClient,openRoom:()=>clientRoom?renderClientLobby(true):bridge().renderLobby(),remove:removeNetworkArchive,inspect:inspectHostArchive,continue:continueSavedNetwork,history:openNetworkHistory,leaveHostRoom});
  root.PlayroomNetworkDebug=()=>({
    host:{roomId:hostRoomId,peer:!!hostPeer,connectedPeers:connectedHostPeers.length,channel:hostPeer?.channel?.readyState||null,serve:!!hostServeClose,switchCurrent:!!hostSwitch?.current,roomConnection:!!hostRoomConnection,participantId:hostRoomConnection?.participantId||null,rpc:hostPeer?.channel?.__playroomDebug||null},
    client:{recovery:clientRecovery?.report()||null,peer:!!clientPeer,channel:clientPeer?.pc?.connectionState||null,ice:clientPeer?.pc?.iceConnectionState||null,transport:!!clientTransport,room:!!clientRoom,participantId:clientParticipantId,hasResumeToken:!!clientRoom?.id&&!!resumeStore.load(clientRoom.id),rpc:clientTransport?.debug?.()||null}
  });
  const observer=new MutationObserver(ensureButtons);observer.observe(document.documentElement,{subtree:true,childList:true});ensureButtons();
  root.addEventListener('pagehide',()=>{closeHostHistory();closeClient();hostRoomUnsub?.();hostAuthority?.dispose?.();closeHostPeer();hostLockRelease?.();hostLockRelease=null;});
})(globalThis);
