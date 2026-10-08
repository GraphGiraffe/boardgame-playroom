(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomAcousticPairing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Audio carries only compact LAN ICE/DTLS signaling. Game data always uses RTCDataChannel.
  // Wire format v1: PR, version, kind, pairing-ID shape, IPv4, UDP port, priority,
  // ICE lengths, 16-byte pairing ID, 32-byte DTLS fingerprint and ICE credentials.
  const MAGIC=[80,82],VERSION=1,HEADER=64,MAX_AUDIO_TEXT=140;
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const protocols=Object.freeze({normal:'GGWAVE_PROTOCOL_AUDIBLE_NORMAL',fast:'GGWAVE_PROTOCOL_AUDIBLE_FAST',fastest:'GGWAVE_PROTOCOL_AUDIBLE_FASTEST'});
  const ascii=value=>typeof value==='string'&&/^[\x21-\x7e]+$/.test(value);
  function addressBytes(address){
    if(typeof address!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address))throw Error('Укажите IPv4-адрес устройства.');
    const parts=address.split('.').map(Number);
    if(parts.some(n=>n>255)||parts.every(n=>n===0)||parts[0]===0||parts[0]===127||parts[0]>=224)throw Error('Это не подходящий LAN IPv4-адрес.');
    return parts;
  }
  function privateRank(ip){
    const a=ip.split('.').map(Number);
    if(a[0]===192&&a[1]===168)return 0;
    if(a[0]===10&&a[1]===0)return 1;
    if(a[0]===10)return 2;
    if(a[0]===172&&a[1]>=16&&a[1]<=31)return 3;
    if(a[0]===169&&a[1]===254)return 6;
    return 4;
  }
  function parsed(signal){
    let value=signal;
    if(typeof value==='string')try{value=JSON.parse(value);}catch(_){throw Error('Некорректные данные WebRTC.');}
    if(value?.v!==1||!['offer','answer'].includes(value.type)||typeof value.sdp!=='string'||!value.sdp)throw Error('Некорректные данные WebRTC.');
    return value;
  }
  function hostCandidates(signal){
    const sdp=parsed(signal).sdp;
    const result=[],seen=new Set();
    for(const line of sdp.split(/\r?\n/)){
      const m=/^a=candidate:\S+\s+(\d+)\s+(UDP)\s+(\d+)\s+(\S+)\s+(\d+)\s+typ\s+host(?:\s|$)/i.exec(line.trim());
      if(!m||Number(m[1])!==1)continue;
      const address=m[4],port=Number(m[5]),priority=Number(m[3]);
      if(!Number.isInteger(port)||port<1||port>65535||!Number.isSafeInteger(priority)||priority<0||priority>0xffffffff)continue;
      const key=address+':'+port;
      if(!seen.has(key)){seen.add(key);result.push({address,port,priority,ipv4:/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)});}
    }
    return result.sort((a,b)=>(a.ipv4?privateRank(a.address):9)-(b.ipv4?privateRank(b.address):9)||b.priority-a.priority);
  }
  function base64url(bytes){
    let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
    const base=typeof btoa==='function'?btoa(raw):Buffer.from(bytes).toString('base64');
    return base.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function unbase64url(text){
    if(typeof text!=='string'||!text||!/^[A-Za-z0-9_-]+$/.test(text))throw Error('Звуковое сообщение повреждено.');
    const raw=text.replace(/-/g,'+').replace(/_/g,'/');
    const padded=raw+'='.repeat((4-raw.length%4)%4);
    const binary=typeof atob==='function'?atob(padded):Buffer.from(padded,'base64').toString('binary');
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  }
  function uuidBytes(id){
    const hyphenated=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
    const flat=typeof id==='string'?id.replace(/-/g,''):'';
    if(!/^[a-f\d]{32}$/i.test(flat))throw Error('Для звукового подключения нужен защищённый идентификатор WebRTC.');
    return {bytes:Uint8Array.from(flat.match(/../g),x=>parseInt(x,16)),hyphenated};
  }
  function uuidString(bytes,hyphenated){
    const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
    return hyphenated?hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20):hex;
  }
  function sdpField(sdp,name){
    const line=sdp.split(/\r?\n/).find(line=>line.startsWith('a='+name+':'));
    return line?.slice(name.length+3)||null;
  }
  function pack(signal,{address,port=null}={}){
    const item=parsed(signal),candidates=hostCandidates(item);
    const chosen=candidates.find(c=>c.address===address&&(port===null||c.port===Number(port)))||candidates.find(c=>c.ipv4)||candidates[0];
    if(!chosen)throw Error('WebRTC не предоставил LAN UDP-кандидат. Используйте QR/Share.');
    const ip=address||chosen.address,ipv4=addressBytes(ip),udpPort=port===null?chosen.port:Number(port);
    if(!Number.isInteger(udpPort)||udpPort<1||udpPort>65535)throw Error('Некорректный UDP-порт.');
    const fingerprint=sdpField(item.sdp,'fingerprint');
    const m=/^sha-256\s+([0-9a-f]{2}(?::[0-9a-f]{2}){31})$/i.exec(fingerprint||'');
    if(!m)throw Error('WebRTC не предоставил поддерживаемый DTLS fingerprint.');
    const fp=Uint8Array.from(m[1].split(':'),x=>parseInt(x,16));
    const ufrag=sdpField(item.sdp,'ice-ufrag'),pwd=sdpField(item.sdp,'ice-pwd');
    if(!ascii(ufrag)||!ascii(pwd)||ufrag.length>255||pwd.length>255)throw Error('Некорректные ICE-параметры.');
    const id=uuidBytes(item.pairingId),u=encoder.encode(ufrag),p=encoder.encode(pwd);
    const bytes=new Uint8Array(HEADER+u.length+p.length);
    bytes.set(MAGIC);bytes[2]=VERSION;bytes[3]=item.type==='offer'?1:2;bytes[4]=id.hyphenated?1:0;
    bytes.set(ipv4,5);bytes[9]=udpPort>>>8;bytes[10]=udpPort&255;
    const priority=chosen.priority>>>0;
    bytes[11]=priority>>>24;bytes[12]=(priority>>>16)&255;bytes[13]=(priority>>>8)&255;bytes[14]=priority&255;
    bytes[15]=u.length;bytes[16]=p.length;
    bytes.set(id.bytes,17);bytes.set(fp,33);bytes.set(u,HEADER);bytes.set(p,HEADER+u.length);
    const message=base64url(bytes);
    if(message.length>MAX_AUDIO_TEXT)throw Error('ICE-параметры слишком длинные для быстрого звукового обмена. Используйте QR/Share.');
    return message;
  }
  function unpack(message){
    const b=unbase64url(message);
    if(b.length<HEADER||b.length>105||b[0]!==MAGIC[0]||b[1]!==MAGIC[1]||b[2]!==VERSION||![1,2].includes(b[3])||![0,1].includes(b[4])||HEADER+b[15]+b[16]!==b.length)throw Error('Звуковое сообщение несовместимо с PlayRoom.');
    const ip=Array.from(b.slice(5,9)).join('.');addressBytes(ip);
    const port=(b[9]<<8)|b[10];if(!port)throw Error('Некорректный UDP-порт.');
    const priority=(((b[11]*0x1000000)+(b[12]<<16)+(b[13]<<8)+b[14])>>>0);
    const ufrag=decoder.decode(b.slice(HEADER,HEADER+b[15])),pwd=decoder.decode(b.slice(HEADER+b[15]));
    if(!ascii(ufrag)||!ascii(pwd))throw Error('Некорректные ICE-параметры.');
    const pairingId=uuidString(b.slice(17,33),!!b[4]);
    const fingerprint=Array.from(b.slice(33,65),x=>x.toString(16).padStart(2,'0').toUpperCase()).join(':');
    const kind=b[3]===1?'offer':'answer';
    const setup=kind==='offer'?'actpass':'active';
    const sdp=[
      'v=0','o=- 0 2 IN IP4 127.0.0.1','s=-','t=0 0',
      'a=group:BUNDLE 0','a=msid-semantic: WMS',
      'm=application 9 UDP/DTLS/SCTP webrtc-datachannel','c=IN IP4 0.0.0.0',
      'a=ice-ufrag:'+ufrag,'a=ice-pwd:'+pwd,'a=ice-options:trickle',
      'a=fingerprint:sha-256 '+fingerprint,'a=setup:'+setup,'a=mid:0',
      'a=sctp-port:5000','a=max-message-size:262144',
      'a=candidate:1 1 UDP '+priority+' '+ip+' '+port+' typ host',
      'a=end-of-candidates',''
    ].join('\r\n');
    return {kind,ip,port,pairingId,signal:JSON.stringify({v:1,type:kind,sdp,pairingId})};
  }
  async function moduleInstance(){
    if(typeof root.ggwave_factory!=='function')throw Error('Звуковой модуль не включён в сборку.');
    if(!moduleInstance.pending)moduleInstance.pending=root.ggwave_factory();
    return moduleInstance.pending;
  }
  function audioContext(){
    const Context=root.AudioContext||root.webkitAudioContext;
    if(!Context)throw Error('Web Audio недоступен в этом браузере.');
    return new Context();
  }
  function setup(gg,context){
    const parameters=gg.getDefaultParameters();
    parameters.sampleRateInp=context.sampleRate;parameters.sampleRateOut=context.sampleRate;
    const instance=gg.init(parameters);
    if(!instance)throw Error('Не удалось запустить звуковой модуль.');
    return instance;
  }
  async function play(message,{protocol='fastest',volume=12}={}){
    const gg=await moduleInstance(),context=audioContext();
    let instance=null;
    try{
      await context.resume();instance=setup(gg,context);
      const protocolId=gg.ProtocolId[protocols[protocol]];
      if(protocolId===undefined)throw Error('Неизвестный звуковой протокол.');
      const waveform=gg.encode(instance,message,protocolId,volume);
      if(!waveform?.byteLength||waveform.byteLength%4)throw Error('Не удалось закодировать звук.');
      const pcm=new Float32Array(waveform.buffer.slice(waveform.byteOffset,waveform.byteOffset+waveform.byteLength));
      const buffer=context.createBuffer(1,pcm.length,context.sampleRate);buffer.copyToChannel(pcm,0);
      await new Promise((resolve,reject)=>{
        const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
        source.onended=resolve;
        try{source.start();}catch(error){reject(error);}
      });
    }finally{if(instance)gg.free(instance);await context.close();}
  }
  async function listen(onPacket){
    if(typeof onPacket!=='function')throw Error('Нужен обработчик звукового приглашения.');
    if(!root.navigator?.mediaDevices?.getUserMedia)throw Error('Нужен HTTPS/localhost и доступ к микрофону.');
    const gg=await moduleInstance(),context=audioContext();
    let instance=null,stream=null,source=null,processor=null,closed=false;
    const stop=()=>{
      if(closed)return;closed=true;
      try{processor?.disconnect();source?.disconnect();}catch(_){}
      stream?.getTracks().forEach(track=>track.stop());
      if(instance)gg.free(instance);
      context.close().catch(()=>{});
    };
    try{
      await context.resume();
      stream=await root.navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
      instance=setup(gg,context);
      if(!context.createScriptProcessor)throw Error('Этот браузер не поддерживает звуковой приём.');
      source=context.createMediaStreamSource(stream);processor=context.createScriptProcessor(1024,1,1);
      processor.onaudioprocess=event=>{
        event.outputBuffer.getChannelData(0).fill(0);
        if(closed)return;
        const pcm=event.inputBuffer.getChannelData(0);
        const bytes=new Int8Array(pcm.buffer.slice(pcm.byteOffset,pcm.byteOffset+pcm.byteLength));
        try{
          const result=gg.decode(instance,bytes);
          if(result?.length){
            const text=decoder.decode(new Uint8Array(result));
            let packet;try{packet=unpack(text);}catch(_){return;}
            onPacket(packet);
          }
        }catch(_){/* Ambient noise and malformed transmissions are not commands. */}
      };
      source.connect(processor);processor.connect(context.destination);
      return {stop};
    }catch(error){stop();throw error;}
  }
  return Object.freeze({protocols,hostCandidates,privateRank,pack,unpack,play,listen});
});
