(function(root){
  'use strict';
  const W=root.PlayroomWebRTCTransport,M=root.PlayroomMultiplayer,Pairing=root.PlayroomPairing,PWA=root.PlayroomPWA,QR=root.PlayroomQR,Scanner=root.PlayroomQRScanner,Acoustic=root.PlayroomAcousticPairing,Session=root.TabletopSession,Authority=root.SessionAuthority,SessionClient=root.PlayroomSessionClient,LocalTransport=root.PlayroomLocalTransport,Shared=root.PlayroomSharedViews,NetworkSessionStore=root.PlayroomNetworkSessionStore,ClientHistory=root.PlayroomNetworkClientHistory;
  const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bridge=()=>root.PlayroomAppBridge;
  let hostPeer=null,hostSwitch=null,hostServeClose=null,hostRoomConnection=null,hostRoomId=null,hostRoomUnsub=null,hostStarted=false,hostAuthority=null,hostGameClient=null,hostMount=null;
  let clientPeer=null,clientTransport=null,clientUnsub=null,clientRoom=null,clientParticipantId=null,clientGameClient=null,clientMount=null,clientLobbyTimer=null,clientWaitingForLobby=false,clientPresence=null,clientPresenceUnsub=null;
  let offerToken=null,answerToken=null,hostAudioListener=null,clientAudioListener=null;
  const pairingQrGenerations=new Map();
  const connectedHostPeers=[];
  const resumeStore=new M.ResumeStore();
  const hostSessionStore=NetworkSessionStore?new NetworkSessionStore():null;
  const clientHistoryStore=ClientHistory?new ClientHistory():null;
  let clientHistoryUnsub=null,clientHistoryQueue=Promise.resolve(),clientHistoryWarning=false,clientBackfillId=0;
  let hostLockRelease=null,archiveMount=null,archiveAuthority=null;
  let reconnectStatus='';

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
      '<p class="pairing-network-mode" id="acoustic-'+role+'-mode" role="status"></p></div>'};
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
    toast('IP добавлен в список на этом устройстве (не обнаружен автоматически).');
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
  async function sendHostSoundOnly(){
    if(!hostPeer)throw Error('Сначала создайте приглашение.');
    const {message,protocol}=sendSoundToken('host');
    await Acoustic.play(message,{protocol});
    toast('Приглашение передано звуком. Получите ответ клиента по QR, Share или ссылке — микрофон хоста не требуется.');
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
    const sound=stage==='client-join'?microphone:stage==='host-offer'?microphone&&soundOut:soundOut;
    return {
      share:{available:share,reason:outgoing?'Системное меню недоступно на этом адресе или для данного приглашения':'Нужна установленная HTTPS PWA'},
      sound:{available:sound,reason:!audioOutput()?'Нет звукового модуля':
        stage==='client-join'?'Нет доступа к микрофону':
        stage==='host-offer'?'Для полного звукового обмена нужны PR3 и микрофон; отдельная передача доступна при PR3':'Нужен IPv4 UDP'},
      qr:{available:outgoing?!!QR?.render:!!Scanner?.scan,reason:'Нет QR-модуля'},
      text:{available:true,reason:''}
    };
  }
  function pairingMethod(key,title,icon,content,availability){
    const enabled=availability.available;
    return '<details class="pairing-method" data-pairing-method="'+key+'" data-pairing-available="'+enabled+'" '+(enabled?'open':'')+'>'+
      '<summary><span class="pairing-method-icon" aria-hidden="true">'+root.PlayroomGameScreen.icon(icon)+'</span><span class="pairing-method-title">'+title+'</span>'+
      '<span class="pairing-method-reason" '+(enabled?'hidden':'')+'>'+esc(availability.reason)+'</span><span class="pairing-chevron" aria-hidden="true">'+root.PlayroomGameScreen.icon('chevron')+'</span></summary>'+
      '<div class="pairing-method-body">'+content+'</div></details>';
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
    for(const [id,can] of [['net-host-acoustic',sending&&receiving],['net-host-acoustic-send',sending],
      ['net-host-acoustic-listen',receiving],['net-client-acoustic-send',sending]]){
      const button=document.getElementById(id);if(button)button.disabled=!can;
    }
  }
  function pairingHeader(title,role,stage){
    const sections=[
      ['Поделиться','Системное меню обмена передаёт ссылку. Получение через него работает при поддержке Android/браузера и ассоциации установленной PWA. В остальных случаях откройте ссылку или выберите другой метод.'],
      ['Звук','Передача требует PR3: выберите пригодный IPv4 UDP из списка или введите IPv4 вручную. При «Все соединения» передаётся PR2, который слишком велик для звука. Приём требует разрешённого микрофона и безопасного контекста; принимать и отправлять можно разными методами.'],
      ['QR','Сфотографируйте QR-код системной камерой Android или выберите фото из галереи. ХОД сам распознает PR3 и PR2; полный PR2 может содержать значительно больше данных.'],
      ['Текст','Скопируйте ссылку и передайте собеседнику. Полученное приглашение или ответ можно вставить в отдельное поле и подтвердить.']
    ];
    const details=sections.map(([name,message])=>'<section><h3>'+name+'</h3><p>'+esc(message)+'</p></section>').join('');
    const ipHelp=stage!=='client-join'?'<section><h3>Сетевой адрес и формат</h3><p>«Все соединения» всегда отправляет PR2 — полный SDP со всеми маршрутами (в том числе mDNS и IPv6), которые WebRTC разрешил браузеру обнаружить. Браузер проверит маршруты сам. Выбор конкретного IPv4 отправляет короткий PR3. По умолчанию предпочитаем 192.168.0.0/16, затем 10.0.0.0/8 и 172.16.0.0/12 из действующих UDP host-кандидатов; если таких адресов нет — «Все соединения». Найденные дополнительно и сохранённые адреса предлагаются только для явного выбора, потому что не доказано, что они принадлежат текущему ICE-сеансу. Ручной IP действует сразу и сохраняется в список только кнопкой '+root.PlayroomGameScreen.icon('save')+'. Если нет пригодного UDP host-кандидата, PR3 построить нельзя: выберите PR2. TEST-NET и служебные IPv4 запрещены.</p>'+
      '<p id="acoustic-'+role+'-hint"></p><p id="acoustic-'+role+'-discovery"></p><p id="acoustic-'+role+'-pair-status"></p></section>':'';
    const access='<section><h3>Почему способ недоступен?</h3><p>Это зависит от безопасного HTTPS/PWA origin, системного обмена, микрофона, динамика и сетевого адреса. Свёрнутый метод можно открыть, чтобы изменить его настройки.</p>'+captureNotice()+
      (location.protocol==='content:'?'<p>Здесь открыт Android content://: браузер может ограничивать IP, микрофон и системный обмен. HTTPS/PWA даёт больше возможностей.</p>':'')+'</section>';
    const popover='<details class="pairing-help"><summary title="Справка о подключении" aria-label="Справка о методах подключения">?</summary><div class="pairing-help-popover"><h3>Способы подключения</h3>'+details+ipHelp+access+'</div></details>';
    return bridge().modalHead(title).replace('</h2>','</h2>'+popover);
  }
  const pairingFooter=()=>'<p class="pairing-origin-note">Для некоторых способов нужен HTTPS/PWA. Сетевые сохранения требуют постоянного адреса приложения.</p>';
  function toast(text){bridge()?.toast?.(text);}
  function copy(id){
    if(id==='net-host-token')updatePairingToken('host');if(id==='net-client-token')updatePairingToken('client');
    const field=document.getElementById(id);if(!field?.value)return toast('Сначала выберите соединение или укажите корректный IPv4.');
    // Synchronous copy can work in Android content:// even when the modern
    // async Clipboard API is disallowed by the origin. Never claim success
    // unless one of these APIs actually confirms it.
    field.focus();field.select?.();field.setSelectionRange?.(0,field.value.length);
    let copied=false;try{copied=!!document.execCommand?.('copy');}catch(_){}
    if(copied){toast('Скопировано в буфер обмена.');return;}
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(field.value).then(()=>toast('Скопировано в буфер обмена.'))
        .catch(()=>toast('Копирование заблокировано браузером. Нажмите и удерживайте выделенный текст → «Копировать».'));
    }else toast('Браузер запрещает копирование с этой страницы. Нажмите и удерживайте выделенный текст → «Копировать».');
  }
  async function copyText(value){try{await navigator.clipboard.writeText(value);toast('Скопировано');}catch(_){toast('Не удалось скопировать автоматически. Используйте поле в «Другие способы».');}}
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
  function closeClient(){clientBackfillId++;clientHistoryUnsub?.();clientHistoryUnsub=null;stopClientAudio();clientPresenceUnsub?.();clientPresenceUnsub=null;clientPresence=null;clientMount?.destroy?.();clearInterval(clientLobbyTimer);clientLobbyTimer=null;clientUnsub?.();clientUnsub=null;clientGameClient?.close?.();clientGameClient=null;clientTransport?.close?.();clientTransport=null;clientPeer?.close?.();clientPeer=null;clientRoom=null;clientParticipantId=null;clientMount=null;clientWaitingForLobby=false;}
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
    return {kind:'room-presence',roomId:room.id,revision:room.revision,participants:room.participants
      .map(p=>({id:p.id,nickname:p.nickname,connected:!!p.connected,seatId:p.seatId,role:p.role,isHost:!!p.isHost}))};
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
    const shell=$('.table-shell.network-game');if(!shell)return;
    let data;
    if(hostAuthority&&hostRoomId){try{data=roomPresence(bridge().roomService.snapshot(hostRoomId));}catch(_){}}
    else if(clientGameClient&&clientPresence?.roomId===clientRoom?.id)data=clientPresence;
    if(!data)return;
    const status=shell.querySelector('.table-status');if(!status)return;
    let line=shell.querySelector('.network-presence');
    if(!line){line=document.createElement('div');line.className='network-presence';line.setAttribute('role','status');line.setAttribute('aria-live','polite');status.after(line);}
    const players=data.participants.filter(p=>p.role==='player');
    const connected=players.filter(p=>p.connected).length;
    const value='<span class="network-presence-count">В сети: '+connected+' из '+players.length+'</span>'+
      players.map(p=>'<span class="network-person '+(p.connected?'online':'offline')+'">'+
        '<i class="network-person-dot" aria-hidden="true"></i>'+esc(p.nickname)+(p.isHost?' · хост':'')+
        (p.connected?'':' · отключён')+'</span>').join('');
    if(line.dataset.content!==value){line.dataset.content=value;line.innerHTML=value;}
  }
  function showDisconnectBanner(){
    const shell=document.querySelector('.table-shell.network-game');
    if(!shell||!clientPeer||!['disconnected','failed','closed'].includes(clientPeer.pc.connectionState))return;
    if(shell.querySelector('#network-reconnect-button'))return;
    const wrap=document.createElement('div');wrap.className='network-reconnect-banner';wrap.setAttribute('role','status');
    wrap.innerHTML='<strong>Связь с хостом прервана.</strong> '+esc(reconnectStatus||'Ваше игровое место сохраняется у хоста.')+
      ' <button class="btn secondary" id="network-reconnect-button" type="button">Повторно подключиться через QR</button>';
    shell.appendChild(wrap);
  }
  function ensureButtons(){
    // Close microphone immediately when the pairing dialog is dismissed.
    if(hostAudioListener&&!document.getElementById('net-host-acoustic'))stopHostAudio();
    if(clientAudioListener&&!document.getElementById('net-client-acoustic-listen'))stopClientAudio();
    const b=bridge();if(!b)return;
    const intro=$('.intro');
    if(intro&&!document.getElementById('network-join-button')){const wrap=document.createElement('div');wrap.className='lobby-actions';wrap.style.marginTop='16px';wrap.innerHTML='<button class="btn secondary" id="network-join-button" type="button">Присоединиться к комнате</button>';intro.appendChild(wrap);}

    if(intro&&PWA?.canInstall?.()&&!PWA.standalone&&!document.getElementById('pwa-install-button')){const btn=document.createElement('button');btn.className='btn secondary';btn.id='pwa-install-button';btn.type='button';btn.textContent='Установить ХОД';intro.querySelector('.lobby-actions')?.appendChild(btn);}
    showDisconnectBanner();renderPresence();
    const gameShell=document.querySelector('.table-shell.network-game');
    if(gameShell&&hostAuthority&&!document.getElementById('network-pair-button')){
      const tools=gameShell.querySelector('.table-header')||gameShell;
      const btn=document.createElement('button');btn.id='network-pair-button';btn.className='btn secondary';
      btn.type='button';btn.textContent='Подключить / вернуть игрока';tools.appendChild(btn);
    }
    const room=b.room?.(),lobby=$('.lobby-shell');
    if(room&&lobby){
      ensureHostSubscription(room);
      const card=lobby.querySelector('.lobby-grid .lobby-card');
      if(card&&room.ownerId===b.participantId?.()&&!document.getElementById('network-pair-button')){const actions=card.querySelector('.lobby-actions');if(actions){const btn=document.createElement('button');btn.className='btn';btn.id='network-pair-button';btn.type='button';btn.textContent='Подключить устройство';actions.prepend(btn);}}
    }
  }
  function handleHostRoomState(state){
    if(state.phase==='playing'&&!hostStarted)startHostGame(state).catch(error=>toast(error.message));
    else if(document.querySelector('.lobby-shell'))bridge().renderLobby();
    if(state.phase==='playing'){notifyPresence(state);renderPresence();}
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
      history:index=>switchable.history(index),
      subscribe:listener=>switchable.subscribe(listener),
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
            const viewer=occupied.findIndex(seat=>seat.participantId===id);
            if(viewer<0)throw Error('В комнате больше нет игрового места для этого участника.');
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
        '<button class="btn pairing-compact-button" id="net-host-acoustic" type="button" '+captureDisabled()+' title="Передать звуком и слушать ответ">'+root.PlayroomGameScreen.icon('sound')+' + '+root.PlayroomGameScreen.icon('mic')+' Передать и слушать</button>'+
        '<button class="btn secondary pairing-compact-button" id="net-host-acoustic-send" type="button" title="Отправить сигнал через динамик">'+root.PlayroomGameScreen.icon('sound')+' Передать</button>'+
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
    closeClient();const b=bridge();
    const share='<p class="pairing-brief-status" role="status">Ожидаем приглашение через системное меню.</p>';
    const sound='<button class="btn pairing-compact-button" id="net-client-acoustic-listen" type="button" '+(microphoneReady()?'':captureDisabled()||'disabled')+'>'+root.PlayroomGameScreen.icon('mic')+' Слушать приглашение</button>';
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
    bridge()?.parkLocalSession?.();
    closeClient();clientPeer=await W.createClientPeer(signal);
    const network=initialNetworkChoice('client',clientPeer.answer);answerToken=network.token;
    const b=bridge();
    const share='<button class="btn pairing-compact-button" type="button" data-net-share="answer" '+(PWA?.canShare?.(answerToken)?'':'disabled')+'>'+root.PlayroomGameScreen.icon('share')+' Поделиться ответом</button>';
    const sound='<button class="btn pairing-compact-button" id="net-client-acoustic-send" type="button">'+root.PlayroomGameScreen.icon('sound')+' Передать ответ</button>'+soundSettings('client');
    const qr=pairingQr('net-client-token');
    const text=pairingText(answerToken,'net-client-token');
    b.openModal(pairingHeader('Ответ для хоста','client','client-answer')+
      network.html+pairingMethods('client-answer',{share,sound,qr,text},answerToken)+'<p class="pairing-brief-status" role="status">Ждём подтверждения хоста…</p>'+pairingFooter());
    syncSoundChoice('client',clientPeer.answer);updateDiscoverySummary('client',clientPeer.answer);updatePairingToken('client');void scanSoundAddresses('client',clientPeer.answer);
    const channel=await clientPeer.waitOpen({timeout:120000});clientTransport=W.client(channel,{timeout:10000});
    clientPresenceUnsub=clientTransport.subscribePresence?.(status=>{clientPresence=status;renderPresence();});
    const currentPeer=clientPeer;
    currentPeer.pc.addEventListener('connectionstatechange',()=>{
      if(currentPeer!==clientPeer)return;
      const state=currentPeer.pc.connectionState;
      if(['failed','disconnected','closed'].includes(state)){
        reconnectStatus='Если связь сама не восстановится, используйте новый QR хоста.';
        clientMount?.setConnected(false);showDisconnectBanner();
      }else if(state==='connected'){
        clientMount?.setConnected(true);reconnectStatus='';
        document.getElementById('network-reconnect-button')?.closest('.network-reconnect-banner')?.remove();
        renderPresence();
      }
    });
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
        else{attachClientLobbyListener();renderClientLobby();}
        return;
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
      renderClientLobby();
    }catch(error){toast(error.message);}
  }
  function participant(room,id){return room.participants.find(p=>p.id===id);}
  function attachClientLobbyListener(){
    clientUnsub?.();clientUnsub=clientTransport.subscribe(snapshot=>{
      if(snapshot?.kind==='lobby'){
        clientRoom=snapshot.room;clientParticipantId=snapshot.participantId;
        if(clientGameClient){
          clientBackfillId++;clientHistoryUnsub?.();clientHistoryUnsub=null;
          clientMount?.destroy?.();clientMount=null;
          clientGameClient.close({keepTransport:true});clientGameClient=null;
        }
        clientWaitingForLobby=false;renderClientLobby();
      }else if(snapshot?.kind==='snapshot'&&!clientWaitingForLobby){startClientGame(snapshot);}
    });
  }
  function clientToLobby({waiting=false}={}){
    if(!clientTransport||!clientRoom)return;
    clientBackfillId++;clientHistoryUnsub?.();clientHistoryUnsub=null;
    clientMount?.destroy?.();clientMount=null;
    clientGameClient?.close({keepTransport:true});clientGameClient=null;
    clientWaitingForLobby=waiting;
    attachClientLobbyListener();renderClientLobby();
  }
  function exitClientGame({finished=false}={}){
    if(finished){clientToLobby({waiting:clientRoom?.phase!=='lobby'});return;}
    closeClient();bridge().showHub();
  }
  function exitHostGame({finished=false}={}){
    const b=bridge(),roomId=hostRoomId;
    if(finished&&roomId&&hostGameClient?.snapshot?.state?.status==='finished'){
      // A completed game remains in its immutable SessionStore journal.
      // Rebind existing RTC channels to room (instead of a new QR pairing).
      b.roomService.returnToLobby(roomId,b.participantId());
      for(const item of connectedHostPeers)if(item.roomConnection?.participantId)
        item.switchable?.set(item.roomConnection);
      hostMount?.destroy?.();hostMount=null;
      hostGameClient?.close?.();hostGameClient=null;
      hostAuthority?.dispose?.();hostAuthority=null;
      hostLockRelease?.();hostLockRelease=null;
      hostStarted=false;
      b.returnHostedRoomToLobby(roomId);
      toast('Комната готова к новой игре. Все участники подтвердят готовность.');
      return;
    }
    // Unfinished games are preserved for explicit recovery. Leaving is never
    // a delete, and requires no navigation/reload on Android content://.
    leaveHostRoom(roomId);
    if(roomId)b.rollbackHostedRoom?.(roomId);
    b.showHub();
  }
  function leaveHostRoom(roomId){
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
        if(!participant.isHost&&participant.connected)service.setConnected(roomId,participant.id,false);
      service.discardRecovery(roomId);
    }
    hostRoomId=null;hostStarted=false;
  }
  function renderClientLobby(){
    if(!clientRoom)return;const room=clientRoom,me=participant(room,clientParticipantId),app=document.getElementById('app');
    app.inert=!!document.getElementById('modal-root').children.length;
    app.innerHTML=PlayroomLobbyView.render({room,participantId:clientParticipantId,waiting:clientWaitingForLobby});
    if(room.phase==='starting')startClientCountdown();
  }
  function startClientCountdown(){clearInterval(clientLobbyTimer);const update=()=>{if(!clientRoom?.countdownEndsAt)return;const n=Math.max(0,Math.ceil((clientRoom.countdownEndsAt-Date.now())/1000));const node=document.getElementById('net-countdown');if(node)node.textContent=String(n);};update();clientLobbyTimer=setInterval(update,200);}
  async function roomCommand(command){try{const result=await clientTransport.dispatch(command);if(result?.snapshot?.kind==='lobby'){clientRoom=result.snapshot.room;clientParticipantId=result.snapshot.participantId;renderClientLobby();}}catch(error){toast(error.message);}}
  async function startHostGame(room){
    if(hostStarted)return;hostStarted=true;
    const b=bridge();let persisted=false;
    try{
      const occupied=room.seats.filter(s=>s.participantId).sort((a,c)=>a.index-c.index),players=occupied.map(seat=>{const p=participant(room,seat.participantId);return {name:p.nickname,bot:false};});
      if(players.length<room.constraints.min)throw Error('Недостаточно игроков для запуска.');
      b.packs.activate(room.game.id,room.game.version);
      const session=new Session(root.TabletopCore,room.game.id,{packVersion:room.game.version,players,mode:'solo',preset:room.rules.preset,presetLabel:room.rules.presetLabel,openHands:!!room.rules.openHands,...(room.rules.options||{})});
      // Do not publish the first playable snapshot until the private initial
      // state and room recovery capability have reached durable storage.
      const sessionId=root.crypto?.randomUUID?.()||'network-'+room.id+'-'+Date.now();
      if(!hostSessionStore)throw Error('Хранилище сетевой партии не загружено.');
      hostLockRelease=await hostSessionStore.acquireHostLock(sessionId);
      const packDigest=await NetworkSessionStore.fingerprintPack(b.packs,room.game.id,room.game.version);
      await hostSessionStore.create({sessionId,room,session,recovery:b.roomService.exportRecovery(room.id),packDigest});
      persisted=true;
      b.roomService.setResumeDurability(room.id,credentials=>hostSessionStore.rotateResumeToken({sessionId,...credentials}));
      hostAuthority=new Authority(session,{sessionId,persistence:{
        commit:entry=>hostSessionStore.commit(entry),
        recordReceipt:entry=>hostSessionStore.recordReceipt(entry)
      }});
      for(const item of connectedHostPeers){
        const viewer=occupied.findIndex(seat=>seat.participantId===item.roomConnection?.participantId);
        if(viewer>=0)item.switchable.set(hostAuthority.connect(viewer));
      }
      const hostViewer=room.hostMode==='table'?-1:occupied.findIndex(s=>s.participantId===room.ownerId);
      const local=LocalTransport(hostAuthority.connect(hostViewer));hostGameClient=new SessionClient(local);await hostGameClient.refresh();
      const definition=b.packs.exportView(room.game.id,room.game.version);b.closeModal(true);document.getElementById('app').inert=false;
      hostMount=Shared.mount(hostGameClient,definition,{surface:hostViewer<0?'table':'combined',onExit:exitHostGame});hostMount.render();renderPresence();notifyPresence(room);
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
    if(hostStarted||hostAuthority||bridge().room?.())return toast('Сначала выйдите из активной сетевой комнаты.');
    try{
      const b=bridge(),saved=await hostSessionStore.load(sessionId,root.TabletopCore,Session);
      if(!saved)throw Error('Сохранение не найдено.');
      b.packs.activate(saved.session.game,saved.session.packVersion);
      const definition=b.packs.exportView(saved.session.game,saved.session.packVersion);
      const room=saved.recovery?.room||saved.room;
      const occupied=room.seats.filter(seat=>seat.participantId).sort((a,c)=>a.index-c.index);
      const viewer=room.hostMode==='table'?-1:occupied.findIndex(seat=>seat.participantId===room.ownerId);
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
    let pendingRelease=null,recoveredRoomId=null,authority=null;
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
      if(!saved.packDigest)throw Error('Архив создан без контрольной суммы правил. Безопасное продолжение невозможно.');
      if(await NetworkSessionStore.fingerprintPack(b.packs,saved.session.game,saved.session.packVersion)!==saved.packDigest)
        throw Error('Содержимое пака изменилось при прежнем номере версии. Возобновление заблокировано; архив сохранён.');
      const room=saved.recovery.room;
      if(room.ownerId!==profile.id||room.phase!=='playing'||room.id!==saved.room.id||
          saved.session.game!==room.game.id||saved.session.packVersion!==room.game.version)
        throw Error('Этот профиль не является хостом сохранённой партии.');
      const occupied=room.seats.filter(seat=>seat.participantId).sort((a,c)=>a.index-c.index);
      if(occupied.length!==saved.session.current.players.length||
          occupied.some((seat,i)=>participant(room,seat.participantId)?.nickname!==saved.session.current.players[i].name))
        throw Error('Состав игроков не соответствует сохранённой партии.');
      const viewer=room.hostMode==='table'?-1:occupied.findIndex(seat=>seat.participantId===profile.id);
      if(room.hostMode==='player'&&viewer<0)throw Error('Место игрока-хоста не найдено.');
      authority=new Authority(saved.session,{sessionId,restoredReceipts:saved.receipts,persistence:{
        commit:entry=>hostSessionStore.commit(entry),
        recordReceipt:entry=>hostSessionStore.recordReceipt(entry)
      }});
      const definition=b.packs.exportView(room.game.id,room.game.version);
      // An exclusive Web Lock prevents a second tab from serving the same game.
      // It is released on pagehide; the next page acquires it afresh.
      pendingRelease=await hostSessionStore.acquireHostLock(sessionId);
      // All validation precedes attaching restored identities to the live UI.
      b.roomService.restoreRecovery(saved.recovery,{hostId:profile.id});recoveredRoomId=room.id;
      b.roomService.setResumeDurability(room.id,credentials=>hostSessionStore.rotateResumeToken({sessionId,...credentials}));
      b.restoreHostedRoom(room.id);
      hostLockRelease=pendingRelease;pendingRelease=null;
      hostRoomId=room.id;hostStarted=true;hostAuthority=authority;
      hostRoomUnsub?.();
      hostRoomUnsub=b.roomService.subscribe(room.id,handleHostRoomState);
      const local=LocalTransport(authority.connect(viewer));
      hostGameClient=new SessionClient(local);await hostGameClient.refresh();
      b.closeModal(true);document.getElementById('app').inert=false;
      hostMount=Shared.mount(hostGameClient,definition,{surface:viewer<0?'table':'combined',onExit:exitHostGame});
      hostMount.render();renderPresence();
      toast('Сетевая партия восстановлена. Предложите гостям новый QR для возвращения на прежние места.');
    }catch(error){
      pendingRelease?.();
      if(recoveredRoomId){
        hostMount?.destroy?.();hostMount=null;
        hostGameClient?.close?.();hostGameClient=null;
        authority?.dispose?.();hostAuthority=null;
        hostLockRelease?.();hostLockRelease=null;
        hostRoomId=null;hostStarted=false;
        const b=bridge();b.rollbackHostedRoom?.(recoveredRoomId);
        try{b.roomService.discardRecovery(recoveredRoomId);}catch(_){}
      }else authority?.dispose?.();
      toast('Не удалось продолжить партию: '+error.message);
    }
  }
  function saveClientProjection(snapshot){
    if(!clientHistoryStore||!clientRoom?.id||!clientParticipantId||!snapshot||snapshot.kind!=='snapshot')return;
    const roomId=clientRoom.id,participantId=clientParticipantId,roomName=clientRoom.name;
    // Serialized writes prevent competing older and newer revisions overwriting
    // metadata on the same browser. A failure leaves the live game usable.
    clientHistoryQueue=clientHistoryQueue.catch(()=>{}).then(()=>clientHistoryStore.save({roomId,participantId,roomName,snapshot}));
    clientHistoryQueue.catch(error=>{
      if(!clientHistoryWarning){clientHistoryWarning=true;toast('Не удалось сохранить историю на этом устройстве: '+error.message);}
    });
  }
  async function backfillClientHistory(initial,transport,roomId,participantId){
    if(!clientHistoryStore||!initial||initial.viewer< -1)return;
    const ticket=++clientBackfillId;
    // Only projected history RPCs: never request/serialize the host full Session.
    for(let index=0;index<=initial.revision;index++){
      if(ticket!==clientBackfillId||clientTransport!==transport)break;
      try{
        const frame=await transport.history(index);
        if(frame?.kind!=='history'||frame.sessionId!==initial.sessionId||frame.viewer!==initial.viewer||
            frame.game!==initial.game||frame.packVersion!==initial.packVersion||frame.revision!==index)break;
        await clientHistoryStore.save({roomId,participantId,roomName:clientRoom?.name||'',snapshot:frame});
      }catch(_){break;} // Preserve already received frames; retry at next join.
    }
  }
  async function listNetworkArchives(){
    const responses=await Promise.allSettled([hostSessionStore?.list()||Promise.resolve([]),clientHistoryStore?.list()||Promise.resolve([])]);
    if(responses.every(x=>x.status==='rejected'))throw Error('Сетевые архивы недоступны.');
    return responses.flatMap(x=>x.status==='fulfilled'?x.value:[]);
  }
  async function openClientHistory(key){
    if(hostStarted||hostAuthority||clientGameClient||bridge().room?.())return toast('Сначала закройте действующую сетевую партию.');
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
  function continueSavedNetwork(key){
    if(key.startsWith('client:')){
      if(hostStarted||hostAuthority||bridge().room?.())return toast('Сначала закройте текущую комнату.');
      showJoin();toast('Для присоединения требуется новый QR хоста. Право прежнего игрока сохранено на этом устройстве.');
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
      document.getElementById('modal-root').innerHTML='';document.getElementById('app').inert=false;
      clientMount=Shared.mount(clientGameClient,definition,{surface:snapshot.viewer<0?'table':'combined',onExit:exitClientGame});clientMount.render();renderPresence();
    }catch(error){toast('Не удалось открыть сетевую игру. '+error.message);}
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest('[data-net-copy],[data-net-share],[data-net-scan],[data-net-save-ip],[data-net-qr-camera],[data-net-qr-gallery],[data-net-seat],[data-net-action],#network-join-button,#network-reconnect-button,#network-pair-button,#network-saved-host-button,[data-network-archive],[data-network-continue],[data-network-history],#pwa-install-button,#net-host-acoustic,#net-host-acoustic-send,#net-host-acoustic-listen,#net-client-acoustic-listen,#net-client-acoustic-send');if(!target)return;
    event.preventDefault();event.stopPropagation();
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
    if(target.id==='net-host-acoustic')return sendHostSound().catch(error=>{stopHostAudio();toast(error.message);});
    if(target.id==='net-host-acoustic-send')return sendHostSoundOnly().catch(error=>toast(error.message));
    if(target.id==='net-host-acoustic-listen')return listenHostAnswer().catch(error=>{stopHostAudio();toast(error.message);});
    if(target.id==='net-client-acoustic-listen')return listenGuestSound().catch(error=>{stopClientAudio();toast(error.message);});
    if(target.id==='net-client-acoustic-send')return sendGuestSound().catch(error=>toast(error.message));
    if(target.id==='pwa-install-button'){PWA?.install?.().catch(error=>toast(error.message));return;}
    if(target.dataset.netShare){sharePair(target.dataset.netShare);return;}
    if(target.dataset.netCopy)return copy(target.dataset.netCopy);
    if(target.dataset.netSeat)return roomCommand({type:'claim-seat',seatId:target.dataset.netSeat});
    if(target.dataset.netAction==='ready'){const me=participant(clientRoom,clientParticipantId);return roomCommand({type:'ready',ready:!me?.ready});}
    if(target.dataset.netAction==='spectator')return roomCommand({type:'spectator'});
    if(target.dataset.netAction==='leave'){closeClient();bridge().showHub();return;}
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
  root.PlayroomNetworkLibrary=Object.freeze({list:listNetworkArchives,
    inspect:inspectHostArchive,continue:continueSavedNetwork,history:openNetworkHistory,leaveHostRoom});
  root.PlayroomNetworkDebug=()=>({
    host:{roomId:hostRoomId,peer:!!hostPeer,connectedPeers:connectedHostPeers.length,channel:hostPeer?.channel?.readyState||null,serve:!!hostServeClose,switchCurrent:!!hostSwitch?.current,roomConnection:!!hostRoomConnection,participantId:hostRoomConnection?.participantId||null,rpc:hostPeer?.channel?.__playroomDebug||null},
    client:{peer:!!clientPeer,channel:clientPeer?.pc?.connectionState||null,ice:clientPeer?.pc?.iceConnectionState||null,transport:!!clientTransport,room:!!clientRoom,participantId:clientParticipantId,hasResumeToken:!!clientRoom?.id&&!!resumeStore.load(clientRoom.id),rpc:clientTransport?.debug?.()||null}
  });
  const observer=new MutationObserver(ensureButtons);observer.observe(document.documentElement,{subtree:true,childList:true});ensureButtons();
  root.addEventListener('pagehide',()=>{closeHostHistory();closeClient();hostRoomUnsub?.();hostAuthority?.dispose?.();closeHostPeer();hostLockRelease?.();hostLockRelease=null;});
})(globalThis);
