if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
/* Pairing Web presenter; connection ownership and operations are injected ports. */
(function(root){'use strict';root.PlayroomPairingPresenter={create(ports){
  // Keep selection inside the app instead of opening the Android select sheet.
  function chooseNetworkOption(event){
    const select=event.target.closest?.('.pairing-network-choice select,.pairing-sound-settings select');
    if(!select||select.disabled)return;
    if(event.type==='keydown'&&!['Enter',' ','ArrowDown','ArrowUp'].includes(event.key))return;
    event.preventDefault();
    if(document.querySelector('.pairing-choice-dialog'))return;
    const dialog=document.createElement('dialog');
    dialog.className='appearance-dialog pairing-choice-dialog';
    const title=select.getAttribute('aria-label')||select.closest('label')?.querySelector('span')?.textContent||'';
    dialog.innerHTML='<header class="appearance-head"><button class="icon-btn" type="button" aria-label="'+ports.esc(root.PlayroomMessages.text('ui.game-screen.a7a4033657e8'))+'">'+root.PlayroomGameScreen.icon('close')+'</button><h2>'+ports.esc(title)+'</h2></header><div class="appearance-body pairing-choice-list" role="group" aria-label="'+ports.esc(title)+'">'+[...select.options].map((option,index)=>'<div class="pairing-choice-row"><button type="button" class="pairing-choice-option" data-choice="'+index+'" aria-pressed="'+option.selected+'" '+(option.disabled?'disabled':'')+'><span class="'+(option.dataset.savedAddress?'pairing-saved-label':'')+'">'+ports.esc(option.textContent)+'</span></button>'+(option.dataset.savedAddress?'<button type="button" class="icon-btn" data-delete-address="'+ports.esc(option.dataset.savedAddress)+'" aria-label="'+ports.esc(root.PlayroomMessages.text('ui.pairing-presenter.delete-address')+' '+option.dataset.savedAddress)+'">'+root.PlayroomGameScreen.icon('trash')+'</button>':'')+'</div>').join('')+'</div>';
    const close=()=>{dialog.close();dialog.remove();if(select.isConnected)select.focus({preventScroll:true});};
    dialog.querySelector('.appearance-head .icon-btn').onclick=close;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>event.stopPropagation());
    dialog.addEventListener('click',event=>{
      const remove=event.target.closest('[data-delete-address]');
      if(remove){
        const address=remove.dataset.deleteAddress,selectedAddress=select.selectedOptions[0]?.dataset.address;
        try{localStorage.setItem(KNOWN_IP_KEY,JSON.stringify(savedIpEntries().map(item=>item.address).filter(ip=>ip!==address)));}
        catch(_){toast(root.PlayroomMessages.text('ui.pairing-presenter.a76775137e52'));return;}
        const role=select.closest('[data-pairing-network]').dataset.pairingNetwork,signal=pairSignal(role);
        select.value='all';select.dataset.userChoice='true';
        updateSoundOptions(role,signal,scannedCandidates[role]);
        if(selectedAddress&&selectedAddress!==address){
          const remaining=[...select.options].find(option=>option.dataset.address===selectedAddress);
          if(remaining)select.value=remaining.value;
        }
        close();select.dispatchEvent(new Event('change',{bubbles:true}));
        chooseNetworkOption({target:select,type:'click',preventDefault(){}});
        return;
      }
      const option=event.target.closest('[data-choice]');if(!option)return;
      select.selectedIndex=Number(option.dataset.choice);
      close();select.dispatchEvent(new Event('change',{bubbles:true}));
    });
    document.body.append(dialog);dialog.showModal();
  }
  for(const name of ['pointerdown','click','keydown'])document.addEventListener(name,chooseNetworkOption);
  const stopHostAudio=()=>{ports.hostAudioListener?.stop();ports.hostAudioListener=null;};
  const stopClientAudio=()=>{ports.clientAudioListener?.stop();ports.clientAudioListener=null;};
  const KNOWN_IP_KEY='playroom.acoustic-known-addresses.v1';
  const usableManualIp=address=>ports.Acoustic.usableIPv4(address);
  function savedIpEntries(){
    try{
      const values=JSON.parse(localStorage.getItem(KNOWN_IP_KEY)||'[]');
      if(!Array.isArray(values))return [];
      return [...new Set(values)].filter(usableManualIp).slice(0,8).map(address=>({
        address,port:null,component:1,transport:'udp',type:'host',priority:0,
        kind:ports.Acoustic.addressKind(address),ipv4:true,ipv6:false,audio:false,source:'saved'
      }));
    }catch(_){return [];}
  }
  const scannedCandidates={host:[],client:[]};
  const scanGenerations={host:0,client:0};
  function soundCandidates(role,signal){
    // The selector lists IPv4 addresses for PR3 only. IPv6, mDNS, TCP and
    // other candidates remain in the *full* SDP when "All connections" is used.
    const active=ports.Acoustic.allCandidates(signal).filter(c=>c.audio&&usableManualIp(c.address));
    const validExtra=scannedCandidates[role].filter(c=>usableManualIp(c.address));
    const extra=validExtra.filter(item=>!active.some(c=>c.address===item.address));
    const saved=savedIpEntries().filter(item=>![...active,...extra].some(c=>c.address===item.address));
    return [...active,...extra,...saved];
  }
  function soundCandidateLabel(item){
    const origin=item.source==='saved'?'':
      item.source==='stats'?globalThis.PlayroomMessages.text("ui.pairing-presenter.1c9e3c9aa4c7"):item.source==='probe'?globalThis.PlayroomMessages.text("ui.pairing-presenter.3720e067d021"):'';
    const network=item.kind==='lan'?'LAN':item.kind==='linklocal'?'link-local':
      item.kind==='cgnat'?'CGNAT':item.kind==='public'?globalThis.PlayroomMessages.text("ui.pairing-presenter.de7195cfdbff"):item.kind;
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
    return items.map((item,index)=>'<option value="'+index+'" data-address="'+ports.esc(item.address)+'" '+(item.source==='saved'?'data-saved-address="'+ports.esc(item.address)+'" ':'')+(index===selected?'selected':'')+'>'+ports.esc(soundCandidateLabel(item))+'</option>').join('');
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
      help.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.a862b36c9871");
    }else if(manual){
      help.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.b45f7c39196e");
    }else if(selected.source==='saved'){
      help.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.74f65fd1edbd");
    }else if(selected.source==='probe'||selected.source==='stats'){
      help.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.f752844eb597");
    }else{
      help.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.2dc01173f279");
    }
  }
  function initialNetworkChoice(role,signal){
    scannedCandidates[role]=[];
    const items=soundCandidates(role,signal);let preferred=preferredSoundCandidate(items);
    const kind=role==='host'?'offer':'answer';let token;
    if(preferred>=0)try{
      const selected=items[preferred];token=ports.Pairing.COMPACT_PREFIX+ports.Acoustic.pack(signal,{address:selected.address,port:selected.port});
    }catch(_){preferred=-1;}
    if(preferred<0)token=ports.Pairing.fromSignal(kind,signal,{legacy:true});
    return {preferred,token,html:'<div class="pairing-network-choice" data-pairing-network="'+role+'"><div class="pairing-network-heading"><span class="pairing-method-icon" aria-hidden="true">'+root.PlayroomGameScreen.icon('network')+'</span><span class="pairing-method-title">'+globalThis.PlayroomMessages.text("ui.pairing-presenter.7b0565b087d1")+'</span>'+pairingHelp('network',role)+'</div><div class="pairing-network-select-row">'+
      ("<label class=\"field\"><select id=\"acoustic-")+role+("-address\" aria-label=\""+globalThis.PlayroomMessages.text("ui.pairing-presenter.7b0565b087d1")+"\">")+
      '<option value="all" '+(preferred<0?'selected':'')+(">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.8ac5f2878080")+"</option>")+
      soundCandidateOptions(items,preferred)+("<option value=\"manual\">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.43b1423a52ae")+"</option></select></label>")+
      '<button type="button" class="btn secondary pairing-scan-address" data-net-scan="'+role+("\" title=\""+globalThis.PlayroomMessages.text("ui.pairing-presenter.b7e6405a393a")+"\" aria-label=\""+globalThis.PlayroomMessages.text("ui.pairing-presenter.b7e6405a393a")+"\">")+root.PlayroomGameScreen.icon('reset')+'</button></div>'+
      '<div class="pairing-inline-row"><div id="acoustic-'+role+'-manual-row" class="pairing-manual-row" hidden>'+
      '<input id="acoustic-'+role+("-manual\" inputmode=\"decimal\" aria-label=\"IPv4 "+globalThis.PlayroomMessages.text("ui.pairing-presenter.4699275a1100")+"\" placeholder=\""+globalThis.PlayroomMessages.text("ui.pairing-presenter.6ad59fa0bc04")+"\" autocomplete=\"off\" disabled>")+
      '<button class="btn secondary pairing-icon-action" id="acoustic-'+role+'-save" type="button" data-net-save-ip="'+role+("\" title=\""+globalThis.PlayroomMessages.text("ui.pairing-presenter.c608f73c4378")+"\" aria-label=\""+globalThis.PlayroomMessages.text("ui.pairing-presenter.c6138d6f5285")+"\">")+root.PlayroomGameScreen.icon('save')+'</button></div>'+
      '</div>'+
      '<p class="pairing-network-mode" id="acoustic-'+role+'-mode" role="status"></p></div>'};
  }
  function soundSettings(role){
    return '<details class="pairing-sound-settings"><summary>'+root.PlayroomGameScreen.icon('settings')+(" "+globalThis.PlayroomMessages.text("ui.pairing-presenter.d477d3b0b207")+"</summary><div class=\"pairing-sound-fields\">")+
      ("<label class=\"field\"><span>"+globalThis.PlayroomMessages.text("ui.pairing-presenter.30dac8931e25")+"</span><select id=\"acoustic-")+role+'-protocol"><option value="fastest">Fastest</option><option value="fast">Fast</option><option value="normal">Normal</option></select></label>'+
      '</div></details>';
  }
  function updateSoundOptions(role,signal,additional){
    const select=document.getElementById('acoustic-'+role+'-address');
    if(!select)return;
    const old=selectionDetails(role,signal),current=old.selected,manual=old.manual,all=old.all;
    const explicit=select.dataset.userChoice==='true';
    scannedCandidates[role]=additional;
    const items=soundCandidates(role,signal);
    select.innerHTML=("<option value=\"all\">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.8ac5f2878080")+"</option>")+soundCandidateOptions(items)+("<option value=\"manual\">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.43b1423a52ae")+"</option>");
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
    const active=ports.Acoustic.allCandidates(signal),extra=scannedCandidates[role],saved=savedIpEntries();
    const usable=active.filter(c=>c.audio);
    node.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.7eeac165c089",{p0:String(active.length),p1:String(usable.length),p2:String(extra.length),p3:String(saved.length)});
  }
  function saveManualIp(role){
    const field=document.getElementById('acoustic-'+role+'-manual');
    const ip=field?.value.trim();
    if(!usableManualIp(ip)){toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.904451ccb6b7"));return;}
    try{
      const known=[ip,...savedIpEntries().map(c=>c.address).filter(item=>item!==ip)].slice(0,8);
      localStorage.setItem(KNOWN_IP_KEY,JSON.stringify(known));
    }catch(_){toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.a76775137e52"));return;}
    const signal=pairSignal(role);
    if(signal){
      updateSoundOptions(role,signal,scannedCandidates[role]);
      const items=soundCandidates(role,signal),at=items.findIndex(c=>c.address===ip);
      const select=document.getElementById('acoustic-'+role+'-address');
      if(select&&at>=0){select.value=String(at);select.dataset.userChoice='true';syncSoundChoice(role,signal);}
      updatePairingToken(role);
    }
    pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.e14f0118acd7"),'network');
  }
  async function scanSoundAddresses(role,signal){
    const generation=++scanGenerations[role],button=document.querySelector('[data-net-scan="'+role+'"]');
    if(button){button.disabled=true;button.innerHTML=root.PlayroomGameScreen.icon('reset')+' …';}
    try{
      const discovered=await ports.Acoustic.probeAddresses({timeout:2500});
      if(scanGenerations[role]!==generation)return;
      const activeSignal=role==='host'?ports.hostPeer?.offer:ports.clientPeer?.answer;
      if(activeSignal!==signal)return;
      updateSoundOptions(role,signal,discovered);
    }catch(error){
      if(scanGenerations[role]===generation)toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.4aa63f741b40",{p0:String(globalThis.PlayroomMessages.error(error))}));
    }finally{
      if(scanGenerations[role]===generation){
        const current=document.querySelector('[data-net-scan="'+role+'"]');
        if(current){current.disabled=false;current.innerHTML=root.PlayroomGameScreen.icon('reset');}
      }
    }
  }
  function pairSignal(role){return role==='host'?ports.hostPeer?.offer:ports.clientPeer?.answer;}
  function pairToken(role){
    const signal=pairSignal(role);
    if(!signal)throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.10825486c8a9"));
    const kind=role==='host'?'offer':'answer';
    const {selected,manual,all}=selectionDetails(role,signal);
    if(all)return ports.Pairing.fromSignal(kind,signal,{legacy:true});
    const manualValue=document.getElementById('acoustic-'+role+'-manual')?.value.trim();
    const address=manual?manualValue:selected?.address;
    if(!usableManualIp(address))throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.45f1fe857a54"));
    // A selected IP is STRICTLY PR3: never quietly substitute another ICE
    // address or return PR2 without telling the user.
    return ports.Pairing.COMPACT_PREFIX+ports.Acoustic.pack(signal,{address,port:selected?.source==='session'?selected.port:null});
  }
  function updatePairingToken(role){
    const signal=pairSignal(role);
    if(!signal)return null;
    let token=null,error=null;
    try{token=pairToken(role);}catch(e){error=e;}
    const id=role==='host'?'net-host-token':'net-client-token';
    if(role==='host')ports.offerToken=token;else ports.answerToken=token;
    const field=document.getElementById(id);
    if(field){
      field.value=token?(ports.PWA?.pairingUrl?.(token)||ports.PWA?.protocolUrl?.(token)||ports.Pairing.protocolUrl(token)):'';
      if(token)renderPairingQR(token,id);
      else{
        const qr=document.getElementById(id+'-qr');
        ports.pairingQrGenerations.set(id,(ports.pairingQrGenerations.get(id)||0)+1);
        if(qr){qr.innerHTML=("<p class=\"pairing-brief-status\">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.8e64dc5eb01f")+"</p>");qr.classList.remove('pairing-qr-ready','pairing-qr-legacy');}
      }
    }
    for(const button of document.querySelectorAll('[data-net-copy="'+id+'"], [data-net-share="'+(role==='host'?'offer':'answer')+'"]'))button.disabled=!token;
    const note=document.getElementById('acoustic-'+role+'-pair-status');
    if(note)note.textContent=error?globalThis.PlayroomMessages.text("ui.pairing-presenter.f53fe059886d",{p0:String(globalThis.PlayroomMessages.error(error))}):
      token.startsWith(ports.Pairing.COMPACT_PREFIX)?globalThis.PlayroomMessages.text("ui.pairing-presenter.f2dc50cac860"):
        globalThis.PlayroomMessages.text("ui.pairing-presenter.d7d5e90738e0");
    const mode=document.getElementById('acoustic-'+role+'-mode');
    if(mode)mode.textContent=error?globalThis.PlayroomMessages.text("ui.pairing-presenter.b6345eef04a9",{p0:String(globalThis.PlayroomMessages.error(error))}):
      token.startsWith(ports.Pairing.COMPACT_PREFIX)?globalThis.PlayroomMessages.text("ui.pairing-presenter.493db78616f3"):
        globalThis.PlayroomMessages.text("ui.pairing-presenter.151b36279af1");
    syncPairingAvailability(role,token);
    return token;
  }
  function sendSoundToken(role){
    const token=updatePairingToken(role);
    if(!token?.startsWith(ports.Pairing.COMPACT_PREFIX))throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.426443aa31b7"));
    return {message:token.slice(ports.Pairing.COMPACT_PREFIX.length),
      protocol:document.getElementById('acoustic-'+role+'-protocol')?.value||'fastest'};
  }
  async function listenHostAnswer(signal){
    if(!ports.hostPeer)throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.716c37cfc525"));
    stopHostAudio();
    ports.hostAudioListener=await ports.Acoustic.listen(packet=>{
      if(packet.kind!=='answer')return;
      stopHostAudio();
      ports.acceptAnswerSignal(ports.Pairing.decode(ports.Pairing.COMPACT_PREFIX+packet.message).signal).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
    },{signal});
    pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.820deacf021a"));
  }
  async function sendHostSoundOnly(signal){
    if(!ports.hostPeer)throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.716c37cfc525"));
    const {message,protocol}=sendSoundToken('host');
    await ports.Acoustic.play(message,{protocol,signal});
    pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.ad851a19852a"));
  }
  async function listenGuestSound(signal){
    stopClientAudio();
    ports.clientAudioListener=await ports.Acoustic.listen(packet=>{
      if(packet.kind!=='offer')return;
      stopClientAudio();
      ports.createClientAnswer(ports.Pairing.decode(ports.Pairing.COMPACT_PREFIX+packet.message).signal,{acoustic:true}).catch(error=>toast(globalThis.PlayroomMessages.error(error)));
    },{signal});
    pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.0c4543b39d4e"));
  }
  async function sendGuestSound(signal){
    if(!ports.clientPeer?.answer)throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.ffe127fb5c79"));
    const {message,protocol}=sendSoundToken('client');
    await ports.Acoustic.play(message,{protocol,signal});
    pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.eef15581f770"));
  }
  function captureNotice(){
    const issue=ports.Acoustic?.microphoneIssue?.();
    return issue?("<div class=\"rules-mode-note\" id=\"acoustic-capture-warning\" role=\"status\"><strong>"+globalThis.PlayroomMessages.text("ui.pairing-presenter.8d9c6159b62f")+"</strong> ")+ports.esc(issue)+'</div>':'';
  }
  const captureDisabled=()=>ports.Acoustic?.microphoneIssue?.()?' disabled aria-describedby="acoustic-capture-warning"':'';
  const audioOutput=()=>typeof root.ggwave_factory==='function'&&!!(root.AudioContext||root.webkitAudioContext);
  const microphoneReady=()=>!ports.Acoustic?.microphoneIssue?.()&&typeof ports.Acoustic?.listen==='function'&&audioOutput();
  const soundOutputReady=token=>audioOutput()&&typeof token==='string'&&token.startsWith(ports.Pairing.COMPACT_PREFIX);
  function methodAvailability(stage,token){
    const outgoing=stage!=='client-join',share=outgoing?!!ports.PWA?.canShare?.(token):!!(ports.PWA?.secure&&ports.PWA?.standalone);
    const microphone=microphoneReady(),soundOut=outgoing&&soundOutputReady(token);
    const sound=stage==='client-join'?microphone:stage==='host-offer'?microphone||soundOut:soundOut;
    return {
      share:{available:share,reason:outgoing?globalThis.PlayroomMessages.text("ui.pairing-presenter.d04860bb5dba"):globalThis.PlayroomMessages.text("ui.pairing-presenter.5d216e20dfc8")},
      sound:{available:sound,reason:!audioOutput()?globalThis.PlayroomMessages.text("ui.pairing-presenter.62e8b2604241"):
        stage==='client-join'?globalThis.PlayroomMessages.text("ui.pairing-presenter.95e0474bda24"):
        stage==='host-offer'?globalThis.PlayroomMessages.text("ui.pairing-presenter.f991220dd2fa"):globalThis.PlayroomMessages.text("ui.pairing-presenter.505b47fa9fd8")},
      qr:{available:outgoing?!!ports.QR?.render:!!ports.Scanner?.scan,reason:globalThis.PlayroomMessages.text("ui.pairing-presenter.030e6f470b51")},
      text:{available:true,reason:''}
    };
  }
  function pairingHelp(key,role=''){
    const messages={
      share:globalThis.PlayroomMessages.text("ui.pairing-presenter.d595894f4670"),
      sound:globalThis.PlayroomMessages.text("ui.pairing-presenter.6c0042538abb"),
      qr:globalThis.PlayroomMessages.text("ui.pairing-presenter.1025e0575dd6"),
      text:globalThis.PlayroomMessages.text("ui.pairing-presenter.cab49d29a9d0"),
      network:globalThis.PlayroomMessages.text("ui.pairing-presenter.0d3c44c98531")
    };
    const extra=(key==='sound'?captureNotice():'')+(key==='network'?'<p id="acoustic-'+role+'-hint"></p><p id="acoustic-'+role+'-discovery"></p><p id="acoustic-'+role+'-pair-status"></p>':'');
    return root.PlayroomLobbyView.fieldHelp(messages[key])
      .replace('class="rule-help"','class="rule-help pairing-context-help" data-pairing-help="'+key+'"')
      .replace('</span></span>',extra+'</span></span>');
  }

  function pairingMethod(key,title,icon,content,availability){
    const enabled=availability.available;
    return '<details class="pairing-method" data-pairing-method="'+key+'" data-pairing-available="'+enabled+'" '+(enabled?'open':'')+'>'+
      '<summary><span class="pairing-method-icon" aria-hidden="true">'+root.PlayroomGameScreen.icon(icon)+'</span><span class="pairing-method-title">'+title+'</span>'+
      pairingHelp(key)+'<span class="pairing-method-reason" '+(enabled?'hidden':'')+'>'+ports.esc(availability.reason)+'</span><span class="pairing-chevron" aria-hidden="true">'+root.PlayroomGameScreen.icon('chevron')+'</span></summary>'+
      '<div class="pairing-method-body">'+content+'</div></details>';
  }
  function pairingMethods(stage,contents,token){
    const states=methodAvailability(stage,token),sequence=[
      ['share',globalThis.PlayroomMessages.text("ui.pairing-presenter.dc120821c212"),'share'],['sound',globalThis.PlayroomMessages.text("ui.pairing-presenter.6a40ca96136a"),'sound'],['qr','QR','qr'],['text',globalThis.PlayroomMessages.text("ui.pairing-presenter.3091aca226ef"),'text']
    ];
    const active=sequence.filter(([key])=>states[key].available),inactive=sequence.filter(([key])=>!states[key].available);
    const render=items=>items.map(([key,name,icon])=>pairingMethod(key,name,icon,contents[key],states[key])).join('');
    return '<div class="pairing-methods" data-pairing-stage="'+stage+'">'+
      '<div class="pairing-methods-available">'+render(active)+'</div>'+
      '<details class="pairing-methods-unavailable" '+(inactive.length?'':'hidden')+("><summary>"+globalThis.PlayroomMessages.text("ui.pairing-presenter.1448bc3d4080")+"<span class=\"pairing-unavailable-count\">")+inactive.length+'</span></summary>'+
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
    return ports.bridge().modalHead(title);
  }
  const pairingFooter=()=>("<p class=\"pairing-origin-note\">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.0b007f9ec666")+"</p>");
  function toast(text){ports.bridge()?.toast?.(text);}
  function pairingProgress(text,method='sound'){
    const body=document.querySelector('[data-pairing-method="'+method+'"] .pairing-method-body')||document.querySelector('.pairing-network-choice')||document.querySelector('.pairing-methods');
    if(!body)return;
    let line=body.querySelector('.pairing-progress');
    if(!line){line=document.createElement('p');line.className='pairing-progress pairing-brief-status';line.setAttribute('role','status');body.appendChild(line);}
    line.textContent=text;
  }
  function copy(id){
    if(id==='net-host-token')updatePairingToken('host');if(id==='net-client-token')updatePairingToken('client');
    const field=document.getElementById(id);if(!field?.value)return toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.e73e0855b55d"));
    // Synchronous copy can work in Android content:// even when the modern
    // async Clipboard API is disallowed by the origin. Never claim success
    // unless one of these APIs actually confirms it.
    field.focus();field.select?.();field.setSelectionRange?.(0,field.value.length);
    let copied=false;try{copied=!!document.execCommand?.('copy');}catch(_){}
    if(copied){pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.9ba58a95d26c"),'text');return;}
    if(navigator.clipboard?.writeText){
      navigator.clipboard.writeText(field.value).then(()=>pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.9ba58a95d26c"),'text'))
        .catch(()=>toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.0b67f87ade21")));
    }else toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.2e85b248c463"));
  }
  async function copyText(value){try{await navigator.clipboard.writeText(value);pairingProgress(globalThis.PlayroomMessages.text("ui.pairing-presenter.9ba58a95d26c"),'text');}catch(_){toast(globalThis.PlayroomMessages.text("ui.pairing-presenter.8ca11749e4ce"));}}
  async function sharePair(kind){
    try{const token=updatePairingToken(kind==='offer'?'host':'client');if(!token)throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.e73e0855b55d"));await ports.PWA.shareToken(token);}catch(error){toast(globalThis.PlayroomMessages.error(error));}
  }
  function pairingText(token,id){
    const link=ports.PWA?.pairingUrl?.(token)||ports.PWA?.protocolUrl?.(token)||ports.Pairing.protocolUrl(token);
    return ("<label class=\"field\"><span>"+globalThis.PlayroomMessages.text("ui.pairing-presenter.c2752f98fb73")+"</span><textarea id=\"")+id+'" rows="2" readonly>'+ports.esc(link)+'</textarea></label>'+
      '<button class="btn secondary pairing-compact-button" type="button" data-net-copy="'+id+("\">⧉ "+globalThis.PlayroomMessages.text("ui.pairing-presenter.f02956c16588")+"</button>");
  }
  function pairingQr(id){
    return '<div class="pairing-qr" id="'+id+("-qr\" aria-label=\"QR-"+globalThis.PlayroomMessages.text("ui.pairing-presenter.49f7a4c9545a")+"\"><div class=\"pairing-qr-loading\">"+globalThis.PlayroomMessages.text("ui.pairing-presenter.64e7db591b9d")+"</div></div>");
  }
  function renderPairingQR(token,id){
    const link=ports.PWA?.pairingUrl?.(token)||ports.PWA?.protocolUrl?.(token)||ports.Pairing.protocolUrl(token);
    const node=document.getElementById(id+'-qr');if(!node||!ports.QR?.render)return;
    const generation=(ports.pairingQrGenerations.get(id)||0)+1;ports.pairingQrGenerations.set(id,generation);
    // QR encoding is async. Older PR2/PR3 renders must not overwrite the QR
    // for a newly selected network address after a rapid manual IP edit.
    const staged=document.createElement('div');
    void ports.QR.render(staged,link,{level:'L',cellSize:4,margin:4}).then(ok=>{
      if(ports.pairingQrGenerations.get(id)!==generation||!node.isConnected)return;
      node.innerHTML=staged.innerHTML;
      node.classList.toggle('pairing-qr-ready',!!ok);
      node.classList.toggle('pairing-qr-legacy',!token.startsWith(ports.Pairing.COMPACT_PREFIX));
    });
  }
  function scanControls(role){
    return '<div class="qr-capture-controls">'+
      '<div class="pairing-actions">'+
      '<button class="btn pairing-compact-button" type="button" data-net-qr-camera="'+role+'" '+(ports.Scanner?.scan?'':'disabled')+'>'+root.PlayroomGameScreen.icon('camera')+(" "+globalThis.PlayroomMessages.text("ui.pairing-presenter.ac9b1450af7a")+"</button>")+
      '<button class="btn secondary pairing-compact-button" type="button" data-net-qr-gallery="'+role+'" '+(ports.Scanner?.scan?'':'disabled')+'>'+root.PlayroomGameScreen.icon('image')+(" "+globalThis.PlayroomMessages.text("ui.pairing-presenter.f69cb271f1e4")+"</button>")+
      '</div>'+
      '<input id="net-'+role+'-qr-camera" data-net-qr-file="'+role+'" type="file" accept="image/*" capture="environment" hidden>'+
      '<input id="net-'+role+'-qr-gallery" data-net-qr-file="'+role+'" type="file" accept="image/*" hidden>'+
      '<p id="net-'+role+'-qr-status" role="status" class="pairing-brief-status"></p>'+
      '</div>';
  }
  async function readPairingQR(file,role){
    const status=document.getElementById('net-'+role+'-qr-status');
    if(status)status.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.275fc90b2d81");
    try{
      if(!ports.Scanner?.scan)throw Error(globalThis.PlayroomMessages.text("ui.pairing-presenter.391aac9d0c94"));
      const scanned=await ports.Scanner.scan(file);
      const expected=role==='host'?'answer':'offer';
      if(scanned.kind!==expected)throw Error(role==='host'?
        globalThis.PlayroomMessages.text("ui.pairing-presenter.c4c6936436d3"):globalThis.PlayroomMessages.text("ui.pairing-presenter.381fefa67a8e"));
      if(status)status.textContent=globalThis.PlayroomMessages.text("ui.pairing-presenter.3791a2b0862c",{p0:String('QR '+scanned.token.slice(0,3)),p1:String(scanned.method)});
      if(role==='host')await ports.acceptAnswerSignal(scanned.signal);
      else await ports.createClientAnswer(scanned.signal);
    }catch(error){
      if(status)status.textContent=error?.message||String(error);
      toast('QR: '+(error?.message||String(error)));
    }
  }
return {stopHostAudio,stopClientAudio,KNOWN_IP_KEY,usableManualIp,savedIpEntries,scannedCandidates,scanGenerations,soundCandidates,soundCandidateLabel,localNetworkRank,preferredSoundCandidate,soundCandidateOptions,selectionDetails,syncSoundChoice,initialNetworkChoice,soundSettings,updateSoundOptions,updateDiscoverySummary,saveManualIp,scanSoundAddresses,pairSignal,pairToken,updatePairingToken,sendSoundToken,listenHostAnswer,sendHostSoundOnly,listenGuestSound,sendGuestSound,captureNotice,captureDisabled,audioOutput,microphoneReady,soundOutputReady,methodAvailability,pairingHelp,pairingMethod,pairingMethods,syncPairingAvailability,pairingHeader,pairingFooter,toast,pairingProgress,copy,copyText,sharePair,pairingText,pairingQr,renderPairingQR,scanControls,readPairingQR};
}};})(globalThis);
