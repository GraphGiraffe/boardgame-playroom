if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
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
  const MAGIC=[80,82],VERSION=1,HEADER=65,MAX_AUDIO_TEXT=140;
  const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
  const protocols=Object.freeze({normal:'GGWAVE_PROTOCOL_AUDIBLE_NORMAL',fast:'GGWAVE_PROTOCOL_AUDIBLE_FAST',fastest:'GGWAVE_PROTOCOL_AUDIBLE_FASTEST'});
  const ascii=value=>typeof value==='string'&&/^[\x21-\x7e]+$/.test(value);
  const isDocumentation=parts=>(parts[0]===192&&parts[1]===0&&parts[2]===2)||
    (parts[0]===198&&parts[1]===51&&parts[2]===100)||
    (parts[0]===203&&parts[1]===0&&parts[2]===113);
  function ipv4Parts(address){
    if(typeof address!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address))return null;
    const values=address.split('.').map(Number);
    return values.every(value=>Number.isInteger(value)&&value>=0&&value<=255)?values:null;
  }
  function isUnspecifiedAddress(address){
    if(typeof address!=='string')return false;
    const value=address.trim().toLowerCase();
    return value==='0.0.0.0'||(value.includes(':')&&/^[0:]+$/.test(value));
  }
  function addressKind(address){
    const ip=ipv4Parts(address);
    if(!ip)return /^([0-9a-f]*:){2,}[0-9a-f:.%]+$/i.test(address)?'ipv6':/\.local$/i.test(address)?'mdns':'hostname';
    if(isDocumentation(ip))return 'documentation';
    if(ip[0]===127||ip[0]===0||ip[0]>=224)return 'reserved';
    if(ip[0]===192&&ip[1]===168)return 'lan';
    if(ip[0]===10)return 'lan';
    if(ip[0]===172&&ip[1]>=16&&ip[1]<=31)return 'lan';
    if(ip[0]===169&&ip[1]===254)return 'linklocal';
    if(ip[0]===100&&ip[1]>=64&&ip[1]<=127)return 'cgnat';
    return 'public';
  }
  function usableIPv4(address){
    return !!ipv4Parts(address)&&!['documentation','reserved'].includes(addressKind(address));
  }
  function addressBytes(address){
    if(typeof address!=='string'||!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address))throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.862fbe66102a"));
    const parts=ipv4Parts(address);
    if(!parts||['documentation','reserved'].includes(addressKind(address)))throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.a298a4977bd7"));
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
    if(typeof value==='string')try{value=JSON.parse(value);}catch(_){throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.8ef45973b248"));}
    if(value?.v!==1||!['offer','answer'].includes(value.type)||typeof value.sdp!=='string'||!value.sdp)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.8ef45973b248"));
    return value;
  }
  function parseCandidates(sdp){
    const result=[],seen=new Set();
    for(const line of String(sdp||'').split(/\r?\n/)){
      const match=/^(?:a=)?candidate:(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s+typ\s+(\S+)(?:\s|$)/i.exec(line.trim());
      if(!match)continue;
      const component=Number(match[2]),transport=match[3].toLowerCase(),priority=Number(match[4]);
      const address=match[5],port=Number(match[6]),type=match[7].toLowerCase(),kind=addressKind(address);
      if(isUnspecifiedAddress(address)||!Number.isInteger(component)||component<1||component>2||!['udp','tcp'].includes(transport)||
         !Number.isSafeInteger(priority)||priority<0||priority>0xffffffff||
         !Number.isInteger(port)||port<1||port>65535||!['host','srflx','prflx','relay'].includes(type))continue;
      const key=[address,port,component,transport,type].join('|');
      if(seen.has(key))continue;
      seen.add(key);
      result.push({address,port,component,transport,type,priority,kind,ipv4:!!ipv4Parts(address),
        ipv6:kind==='ipv6',audio:transport==='udp'&&component===1&&type==='host'&&
        !!ipv4Parts(address)&&!['documentation','reserved'].includes(kind),source:'session'});
    }
    return result;
  }
  function allCandidates(signal){
    const entries=parseCandidates(parsed(signal).sdp);
    // Show EVERY ICE route the browser supplies. Ranking only sets the initial selection.
    return entries.sort((a,b)=>{
      const score=c=>(c.audio?0:50)+privateRank(c.address)+(c.kind==='documentation'||c.kind==='reserved'?80:0);
      return score(a)-score(b)||b.priority-a.priority||a.address.localeCompare(b.address);
    });
  }
  function hostCandidates(signal){
    return allCandidates(signal).filter(c=>c.type==='host'&&c.transport==='udp'&&c.component===1);
  }
  function statsAddresses(report){
    // RTCStats reports can expose interfaces absent from SDP. They obey the
    // same browser privacy policy; an empty report does not imply no Wi-Fi.
    if(!report||typeof report.values!=='function')return [];
    const candidates=[],seen=new Set();
    for(const entry of report.values()){
      if(entry?.type!=='local-candidate')continue;
      const address=entry.address||entry.ip,kind=addressKind(address);
      if(typeof address!=='string'||!address||isUnspecifiedAddress(address)||seen.has(address))continue;
      const type=entry.candidateType||'host',transport=String(entry.protocol||'udp').toLowerCase();
      if(!['udp','tcp'].includes(transport)||!['host','srflx','prflx','relay'].includes(type))continue;
      seen.add(address);
      candidates.push({address,port:null,component:1,transport,type,priority:Number(entry.priority)||0,
        kind,ipv4:kind!=='ipv6'&&!!ipv4Parts(address),ipv6:kind==='ipv6',audio:false,source:'stats'});
    }
    return candidates;
  }
  async function probeAddresses({timeout=2500}={}){
    // Mirrors wave-share's secondary ICE scan, without external STUN/relay servers.
    // Modern browsers can deliberately hide interface IPs behind .local names.
    if(typeof root.RTCPeerConnection!=='function')return [];
    const pc=new root.RTCPeerConnection({iceServers:[]}),found=[],keys=new Set();
    const collect=raw=>{for(const item of parseCandidates(raw)){
      const key=[item.address,item.transport,item.type].join('|');
      if(!keys.has(key)){keys.add(key);found.push({...item,port:null,source:'probe',audio:false});}
    }};
    const onCandidate=event=>{if(event.candidate?.candidate)collect(event.candidate.candidate);};
    pc.addEventListener('icecandidate',onCandidate);
    let timer=null;
    try{
      pc.createDataChannel('playroom-interface-scan');
      await pc.setLocalDescription(await pc.createOffer());
      await Promise.race([
        new Promise(resolve=>{
          if(pc.iceGatheringState==='complete')return resolve();
          const onChange=()=>{if(pc.iceGatheringState!=='complete')return;pc.removeEventListener('icegatheringstatechange',onChange);resolve();};
          pc.addEventListener('icegatheringstatechange',onChange);
        }),
        new Promise(resolve=>{timer=setTimeout(resolve,Math.max(200,Math.min(timeout,6000)));})
      ]);
      collect(pc.localDescription?.sdp);
      if(typeof pc.getStats==='function')try{
        // Never leave the IP search spinner hanging on a browser's stats API.
        let statsTimer=null;
        const report=await Promise.race([
          pc.getStats(),
          new Promise(resolve=>{statsTimer=setTimeout(()=>resolve(null),700);})
        ]).finally(()=>{if(statsTimer!==null)clearTimeout(statsTimer);});
        for(const item of statsAddresses(report)){
          const key=[item.address,item.transport,item.type].join('|');
          if(!keys.has(key)){keys.add(key);found.push(item);}
        }
      }catch(_){/* Some browsers disallow stats until a connection exists. */}
      return found.sort((a,b)=>privateRank(a.address)-privateRank(b.address||'')||a.address.localeCompare(b.address));
    }finally{if(timer!==null)clearTimeout(timer);pc.removeEventListener('icecandidate',onCandidate);pc.close();}
  }
  function base64url(bytes){
    let raw='';for(const byte of bytes)raw+=String.fromCharCode(byte);
    const base=typeof btoa==='function'?btoa(raw):Buffer.from(bytes).toString('base64');
    return base.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function unbase64url(text){
    if(typeof text!=='string'||!text||!/^[A-Za-z0-9_-]+$/.test(text))throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.61f9d19be1f0"));
    const raw=text.replace(/-/g,'+').replace(/_/g,'/');
    const padded=raw+'='.repeat((4-raw.length%4)%4);
    const binary=typeof atob==='function'?atob(padded):Buffer.from(padded,'base64').toString('binary');
    return Uint8Array.from(binary,c=>c.charCodeAt(0));
  }
  function uuidBytes(id){
    const hyphenated=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
    const flat=typeof id==='string'?id.replace(/-/g,''):'';
    if(!/^[a-f\d]{32}$/i.test(flat))throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.2fbc7811eb87"));
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
    const item=parsed(signal),candidates=hostCandidates(item),all=allCandidates(item);
    const explicit=address!==undefined&&address!==null&&address!=='';
    const matching=all.filter(c=>c.address===address);
    if(explicit&&matching.length&&!matching.some(c=>c.audio&&(port===null||c.port===Number(port))))
      throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.58390e657c25"));
    const usable=candidates.filter(c=>c.audio);
    const chosen=usable.find(c=>c.address===address&&(port===null||c.port===Number(port)))||
      usable.find(c=>port!==null&&c.port===Number(port))||usable[0]||candidates[0];
    if(!chosen)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.7da95be29cb5"));
    const ip=address||chosen.address,ipv4=addressBytes(ip),udpPort=port===null?chosen.port:Number(port);
    if(!Number.isInteger(udpPort)||udpPort<1||udpPort>65535)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.33ae0e8190f4"));
    const fingerprint=sdpField(item.sdp,'fingerprint');
    const m=/^sha-256\s+([0-9a-f]{2}(?::[0-9a-f]{2}){31})$/i.exec(fingerprint||'');
    if(!m)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.c3431a773e41"));
    const fp=Uint8Array.from(m[1].split(':'),x=>parseInt(x,16));
    const ufrag=sdpField(item.sdp,'ice-ufrag'),pwd=sdpField(item.sdp,'ice-pwd');
    if(!ascii(ufrag)||!ascii(pwd)||ufrag.length>255||pwd.length>255)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.7c60924b855e"));
    const id=uuidBytes(item.pairingId),u=encoder.encode(ufrag),p=encoder.encode(pwd);
    const bytes=new Uint8Array(HEADER+u.length+p.length);
    bytes.set(MAGIC);bytes[2]=VERSION;bytes[3]=item.type==='offer'?1:2;bytes[4]=id.hyphenated?1:0;
    bytes.set(ipv4,5);bytes[9]=udpPort>>>8;bytes[10]=udpPort&255;
    const priority=chosen.priority>>>0;
    bytes[11]=priority>>>24;bytes[12]=(priority>>>16)&255;bytes[13]=(priority>>>8)&255;bytes[14]=priority&255;
    bytes[15]=u.length;bytes[16]=p.length;
    bytes.set(id.bytes,17);bytes.set(fp,33);bytes.set(u,HEADER);bytes.set(p,HEADER+u.length);
    const message=base64url(bytes);
    if(message.length>MAX_AUDIO_TEXT)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.8928db5918fc"));
    return message;
  }
  function unpack(message){
    const b=unbase64url(message);
    if(b.length<HEADER||b.length>120||b[0]!==MAGIC[0]||b[1]!==MAGIC[1]||b[2]!==VERSION||![1,2].includes(b[3])||![0,1].includes(b[4])||HEADER+b[15]+b[16]!==b.length)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.870b3a61c2b9"));
    const ip=Array.from(b.slice(5,9)).join('.');addressBytes(ip);
    const port=(b[9]<<8)|b[10];if(!port)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.33ae0e8190f4"));
    const priority=(((b[11]*0x1000000)+(b[12]<<16)+(b[13]<<8)+b[14])>>>0);
    const ufrag=decoder.decode(b.slice(HEADER,HEADER+b[15])),pwd=decoder.decode(b.slice(HEADER+b[15]));
    if(!ascii(ufrag)||!ascii(pwd))throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.7c60924b855e"));
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
  function microphoneIssue({protocol=root.location?.protocol,secure=root.isSecureContext,mediaDevices=root.navigator?.mediaDevices}={}){
    if(protocol==='content:')return globalThis.PlayroomMessages.text("ui.acoustic-pairing.c7cb140d0c9e");
    if(secure===false)return globalThis.PlayroomMessages.text("ui.acoustic-pairing.fe9fbbe21db2");
    if(typeof mediaDevices?.getUserMedia!=='function')return globalThis.PlayroomMessages.text("ui.acoustic-pairing.ec061d8c3d2d");
    return null;
  }
  function explainMicrophoneError(error){
    const source=String(error?.name||'')+' '+String(error?.message||'');
    if(/NotAllowedError|PermissionDeniedError|SecurityError|permission\s+denied|denied|not\s+allowed/i.test(source))
      return Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.14978f3f9a48"));
    if(/NotFoundError|DevicesNotFoundError/i.test(source))
      return Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.f35c430d1496"));
    if(/NotReadableError|TrackStartError|AbortError/i.test(source))
      return Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.f19c8da6922c"));
    return error instanceof Error?error:Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.e686e5818844"));
  }
  async function moduleInstance(){
    if(typeof root.ggwave_factory!=='function')throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.b7225252e7b6"));
    if(!moduleInstance.pending)moduleInstance.pending=Promise.resolve().then(()=>root.ggwave_factory()).catch(error=>{moduleInstance.pending=null;throw error;});
    return moduleInstance.pending;
  }
  function audioContext(){
    const Context=root.AudioContext||root.webkitAudioContext;
    if(!Context)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.48186d58da64"));
    return new Context();
  }
  function setup(gg,context){
    const parameters=gg.getDefaultParameters();
    parameters.sampleRateInp=context.sampleRate;parameters.sampleRateOut=context.sampleRate;
    const instance=gg.init(parameters);
    if(!Number.isInteger(instance)||instance<0)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.f6dce7e48911"));
    return instance;
  }
  async function play(message,{protocol='fastest',volume=12,signal}={}){
    const context=audioContext();
    let gg=null,instance=null;
    try{
      // Android playback must establish AudioContext user activation before
      // asynchronous ggwave Wasm preparation consumes the initial tap.
      const loading=moduleInstance();
      await context.resume();gg=await loading;signal?.throwIfAborted();instance=setup(gg,context);
      const protocolId=gg.ProtocolId[protocols[protocol]];
      if(protocolId===undefined)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.444727aa3217"));
      const waveform=gg.encode(instance,message,protocolId,volume);
      if(!waveform?.byteLength||waveform.byteLength%4)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.cec1b6c550db"));
      const pcm=new Float32Array(waveform.buffer.slice(waveform.byteOffset,waveform.byteOffset+waveform.byteLength));
      const buffer=context.createBuffer(1,pcm.length,context.sampleRate);buffer.copyToChannel(pcm,0);
      await new Promise((resolve,reject)=>{
        const source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);
        const abort=()=>{try{source.stop();}catch(_){}reject(new DOMException('Cancelled','AbortError'));};
        signal?.addEventListener('abort',abort,{once:true});
        source.onended=()=>{signal?.removeEventListener('abort',abort);resolve();};
        if(signal?.aborted){abort();return;}
        try{source.start();}catch(error){signal?.removeEventListener('abort',abort);reject(error);}
      });
    }finally{if(instance!==null)gg.free(instance);await context.close();}
  }
  async function listen(onPacket,{signal}={}){
    if(typeof onPacket!=='function')throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.ae2b178ec705"));
    const issue=microphoneIssue();if(issue)throw Error(issue);
    signal?.throwIfAborted();
    const context=audioContext(),loading=moduleInstance();
    let gg=null;
    let instance=null,stream=null,source=null,processor=null,closed=false;
    const stop=()=>{
      if(closed)return;closed=true;signal?.removeEventListener('abort',stop);
      try{processor?.disconnect();source?.disconnect();}catch(_){}
      stream?.getTracks().forEach(track=>track.stop());
      if(instance!==null)gg.free(instance);
      context.close().catch(()=>{});
    };
    signal?.addEventListener('abort',stop,{once:true});
    try{
      await context.resume();gg=await loading;signal?.throwIfAborted();
      try{stream=await root.navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}catch(error){throw explainMicrophoneError(error);}
      if(signal?.aborted){stream.getTracks().forEach(track=>track.stop());signal.throwIfAborted();}
      instance=setup(gg,context);
      if(!context.createScriptProcessor)throw Error(globalThis.PlayroomMessages.text("ui.acoustic-pairing.9ac4cb00c107"));
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
            onPacket({...packet,message:text});
          }
        }catch(_){/* Ambient noise and malformed transmissions are not commands. */}
      };
      source.connect(processor);processor.connect(context.destination);
      return {stop};
    }catch(error){stop();throw error;}
  }
  return Object.freeze({protocols,hostCandidates,allCandidates,statsAddresses,probeAddresses,addressKind,usableIPv4,isUnspecifiedAddress,microphoneIssue,explainMicrophoneError,privateRank,pack,unpack,play,listen});
});
