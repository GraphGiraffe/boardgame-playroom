if(typeof require==='function'&&typeof module==='object'&&module.exports)require("../../core/messages.js");
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomWebRTCTransport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const SIGNAL_VERSION=1;
  const clone=value=>JSON.parse(JSON.stringify(value));
  function rtc(){
    if(typeof root.RTCPeerConnection!=='function')throw Error(globalThis.PlayroomMessages.text("ui.webrtc.c348ecba285d"));
    return root.RTCPeerConnection;
  }
  function pairingId(){
    if(root.crypto?.randomUUID)return root.crypto.randomUUID();
    if(root.crypto?.getRandomValues){const bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
    return 'pair-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  }
  function serializeDescription(description,{pairingId:nullablePairingId=null}={}){
    if(!description||!['offer','answer'].includes(description.type)||typeof description.sdp!=='string')throw Error(globalThis.PlayroomMessages.text("ui.webrtc.bafb603f86cc"));
    const value={v:SIGNAL_VERSION,type:description.type,sdp:description.sdp};
    if(nullablePairingId)value.pairingId=String(nullablePairingId);
    return JSON.stringify(value);
  }
  function parseSignal(value,expected){
    let data=value;
    if(typeof data==='string')try{data=JSON.parse(data);}catch(_){throw Error(globalThis.PlayroomMessages.text("ui.webrtc.1275b08d76b1"));}
    if(!data||data.v!==SIGNAL_VERSION||!['offer','answer'].includes(data.type)||typeof data.sdp!=='string'||!data.sdp)throw Error(globalThis.PlayroomMessages.text("ui.webrtc.1275b08d76b1"));
    if(expected&&data.type!==expected)throw Error(globalThis.PlayroomMessages.text("ui.webrtc.cef07e67b7b6",{p0:String(expected)}));
    return {description:{type:data.type,sdp:data.sdp},pairingId:typeof data.pairingId==='string'&&data.pairingId?data.pairingId:null};
  }
  function parseDescription(value,expected){return parseSignal(value,expected).description;}

  function waitIce(pc,{timeout=8000,allowPartial=false}={}){
    if(pc.iceGatheringState==='complete')return Promise.resolve();
    return new Promise((resolve,reject)=>{
      let relayTimer=null;
      const timer=setTimeout(()=>done(allowPartial&&/a=candidate:/.test(pc.localDescription?.sdp||'')?null:Error(globalThis.PlayroomMessages.text("ui.webrtc.31f66cf5723d"))),timeout);
      function done(error){clearTimeout(timer);clearTimeout(relayTimer);pc.removeEventListener('icecandidate',candidate);pc.removeEventListener('icegatheringstatechange',change);error?reject(error):resolve();}
      function change(){if(pc.iceGatheringState==='complete')done();}
      function candidate(event){if(allowPartial&&!relayTimer&&(event.candidate?.type==='relay'||/ typ relay/.test(event.candidate?.candidate||'')))relayTimer=setTimeout(()=>done(),300);}
      pc.addEventListener('icecandidate',candidate);pc.addEventListener('icegatheringstatechange',change);
    });
  }
  function waitOpen(channel,{timeout=10000}={}){
    if(channel.readyState==='open')return Promise.resolve(channel);
    if(channel.readyState==='closed')return Promise.reject(Error(globalThis.PlayroomMessages.text("ui.webrtc.bd6b75c2f0ac")));
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(done,timeout,Error(globalThis.PlayroomMessages.text("ui.webrtc.99b70a4fcf53")));
      function done(error){clearTimeout(timer);channel.removeEventListener('open',open);channel.removeEventListener('error',fail);channel.removeEventListener('close',closed);error?reject(error):resolve(channel);}
      function open(){done();}
      function fail(){done(Error(globalThis.PlayroomMessages.text("ui.webrtc.4bb59524ff0c")));}
      function closed(){done(Error(globalThis.PlayroomMessages.text("ui.webrtc.bd6b75c2f0ac")));}
      channel.addEventListener('open',open,{once:true});channel.addEventListener('error',fail,{once:true});channel.addEventListener('close',closed,{once:true});
    });
  }
  function send(channel,message){
    if(channel.readyState!=='open')throw Error(globalThis.PlayroomMessages.text("ui.webrtc.dd436f0099c4"));
    channel.send(JSON.stringify(message));
  }
  function subscribeAuthorized(connection,listener,authorize,{isOpen=()=>true,deny=()=>{}}={}){
    let sequence=0,active=true,terminal=null;
    const fail=()=>{if(active){active=false;deny();}};
    const off=connection.subscribe(snapshot=>{
      if(!active)return;
      if(!authorize){listener(snapshot);return;}
      const current=++sequence,finished=snapshot.kind==='snapshot'&&snapshot.state?.status==='finished',before=terminal;
      const deliver=()=>{if(active&&isOpen()&&(finished||current===sequence))listener(snapshot);};
      try{
        const checked=authorize();
        if(checked?.then||before){
          // The lobby must not overtake the final projection while access is checked.
          const pending=Promise.all([checked,before]).then(deliver).catch(fail);
          if(finished){terminal=pending;void pending.then(()=>{if(terminal===pending)terminal=null;});}
        }else deliver();
      }catch{fail();}
    });
    return ()=>{active=false;off?.();};
  }

  function serve(channel,connection){
    if(!channel||!connection)throw Error(globalThis.PlayroomMessages.text("ui.webrtc.581f9b800c4d"));
    let negotiated=false;
    const debug=channel.__playroomDebug={side:'server',hellos:0,ready:0,requests:0,responses:0,snapshots:0,errors:0,lastMethod:null,lastError:null};
    const unsubscribe=connection.subscribe?.(snapshot=>{if(negotiated&&channel.readyState==='open'){debug.snapshots++;send(channel,{kind:'snapshot',snapshot});}});
    const onMessage=async event=>{
      let message;try{message=JSON.parse(event.data);}catch(error){debug.errors++;debug.lastError='parse';return;}
      if(message?.kind==='hello'){
        debug.hellos++;
        if(message.version!==2){send(channel,{kind:'transport-ready',version:2,error:'VERSION_MISMATCH'});return;}
        negotiated=true;if(channel.readyState==='open'){send(channel,{kind:'transport-ready',version:2});debug.ready++;}
        return;
      }
      if(message?.kind!=='request'||!Number.isSafeInteger(message.requestId))return;
      if(!negotiated){send(channel,{kind:'response',requestId:message.requestId,error:'VERSION_MISMATCH'});return;}
      debug.requests++;debug.lastMethod=message.method;
      try{
        let result;
        if(message.method==='snapshot')result=connection.snapshot();
        else if(message.method==='dispatch')result=connection.dispatch(message.value);
        else if(message.method==='history')result=connection.history(message.value);
        else if(message.method==='presentation-ready')result=connection.presentationReady?.(message.value)||{ok:false};
        else throw Error('Unknown request');
        result=await result;
        if(channel.readyState==='open'){send(channel,{kind:'response',requestId:message.requestId,result});debug.responses++;}
      }catch(error){
        debug.errors++;debug.lastError=error?.message||String(error);
        if(channel.readyState==='open'){send(channel,{kind:'response',requestId:message.requestId,error:globalThis.PlayroomMessages.text("ui.webrtc.b266c6f0f866")});debug.responses++;}
      }
    };
    channel.addEventListener('message',onMessage);
    const close=()=>{unsubscribe?.();channel.removeEventListener('message',onMessage);connection.close?.();try{channel.close();}catch(_){}};
    channel.addEventListener('close',()=>{unsubscribe?.();connection.close?.();},{once:true});
    return close;
  }
  function client(channel,{timeout=7000,handshakeTimeout=5000}={}){
    let sequence=0,closed=false,ready=false;const pending=new Map(),listeners=new Set(),presenceListeners=new Set(),reactionListeners=new Set(),chatListeners=new Set();let latestPresence=null;
    const debug=channel.__playroomClientDebug={side:'client',hellos:0,ready:0,requests:0,responses:0,snapshots:0,timeouts:0,lastMethod:null,lastError:null};
    let resolveReady,rejectReady;
    const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const readyTimer=setTimeout(()=>{
      if(ready||closed)return;
      debug.timeouts++;debug.lastError='handshake-timeout';
      rejectReady(Error(globalThis.PlayroomMessages.text("ui.webrtc.88d10d3be98c")));
    },handshakeTimeout);
    let helloTimer=null;
    const sendHello=()=>{
      if(closed||ready||channel.readyState!=='open')return;
      try{send(channel,{kind:'hello',version:2});debug.hellos++;}
      catch(error){debug.lastError=error?.message||String(error);}
    };
    const stopHello=()=>{clearInterval(helloTimer);helloTimer=null;};
    const markReady=()=>{
      if(ready)return;
      ready=true;debug.ready++;clearTimeout(readyTimer);stopHello();resolveReady();
    };
    const onMessage=event=>{
      let message;try{message=JSON.parse(event.data);}catch(_){return;}
      if(message?.kind==='transport-ready'){if(message.version!==2||message.error){clearTimeout(readyTimer);stopHello();rejectReady(Error('VERSION_MISMATCH'));return;}markReady();return;}
      if(message?.kind==='room-chat-entry'&&typeof message.roomId==='string'&&message.entry&&typeof message.entry.body==='string'&&message.entry.body.length<=2000){for(const listener of chatListeners)listener(clone(message));return;}
      if(message?.kind==='quick-reaction'&&typeof message.sessionId==='string'&&message.sessionId.length<=128&&typeof message.id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(message.id)&&Number.isInteger(message.player)&&message.player>=0&&message.player<32&&typeof message.emoji==='string'&&message.emoji.length<=8){for(const listener of reactionListeners)listener(clone(message));return;}
      if(message?.kind==='snapshot'){debug.snapshots++;for(const listener of listeners)listener(clone(message.snapshot));return;}
      // Presence is a separate public control-plane message. The host sends it
      // only on an authenticated participant's RTC channel; never a full room
      // snapshot, authoritative game data, or private resume credentials.
      if(message?.kind==='room-presence' && typeof message.roomId==='string' &&
          Number.isSafeInteger(message.revision) && Array.isArray(message.participants) &&
          message.participants.length<=32 && message.participants.every(p=>
            typeof p?.id==='string'&&typeof p?.nickname==='string'&&typeof p?.connected==='boolean'&&
            (p.playerIndex===undefined||(Number.isSafeInteger(p.playerIndex)&&p.playerIndex>=-1&&p.playerIndex<32))&&
            ['bot','local','isHost','hasConnected'].every(k=>p[k]===undefined||typeof p[k]==='boolean'))){
        if(!latestPresence||message.roomId!==latestPresence.roomId||message.revision>latestPresence.revision){
          latestPresence=clone(message);
          for(const listener of presenceListeners)listener(clone(latestPresence));
        }
        return;
      }
      if(message?.kind!=='response')return;
      const item=pending.get(message.requestId);if(!item)return;
      debug.responses++;pending.delete(message.requestId);clearTimeout(item.timer);
      message.error?item.reject(Error(message.error)):item.resolve(clone(message.result));
    };
    const onOpen=()=>sendHello();
    const onClose=()=>{
      for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(globalThis.PlayroomMessages.text("ui.webrtc.e192912e5d23")));}pending.clear();
      if(!ready){clearTimeout(readyTimer);stopHello();rejectReady(Error(globalThis.PlayroomMessages.text("ui.webrtc.fed7d356de28")));}
    };
    channel.addEventListener('message',onMessage);
    channel.addEventListener('open',onOpen);
    channel.addEventListener('close',onClose,{once:true});
    if(channel.readyState==='open'){sendHello();helloTimer=setInterval(sendHello,250);}
    else helloTimer=setInterval(sendHello,250);
    const request=async(method,value)=>{
      if(closed)throw Error(globalThis.PlayroomMessages.text("ui.webrtc.b8adaa326e7c"));
      await readyPromise;
      return new Promise((resolve,reject)=>{
        if(closed||channel.readyState!=='open')return reject(Error(globalThis.PlayroomMessages.text("ui.webrtc.6eca5437b40f")));
        const requestId=++sequence,timer=setTimeout(()=>{debug.timeouts++;pending.delete(requestId);reject(Error(globalThis.PlayroomMessages.text("ui.webrtc.f0561539374a")));},timeout);
        debug.requests++;debug.lastMethod=method;pending.set(requestId,{resolve,reject,timer});
        try{send(channel,{kind:'request',requestId,method,value});}
        catch(error){clearTimeout(timer);pending.delete(requestId);reject(error);}
      });
    };
    return Object.freeze({
      ready:()=>readyPromise,
      presentationReady:value=>request('presentation-ready',value),
      snapshot:()=>request('snapshot'),
      dispatch:command=>request('dispatch',command),
      history:index=>request('history',index),
      subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},
      subscribeRoomChat:listener=>{chatListeners.add(listener);return ()=>chatListeners.delete(listener);},
      subscribeReactions:listener=>{reactionListeners.add(listener);return ()=>reactionListeners.delete(listener);},
      subscribePresence:listener=>{if(typeof listener!=='function')throw Error('Listener required');presenceListeners.add(listener);
        if(latestPresence)listener(clone(latestPresence));return ()=>presenceListeners.delete(listener);},
      debug:()=>clone(debug),
      close(){
        if(closed)return;closed=true;clearTimeout(readyTimer);stopHello();
        channel.removeEventListener('message',onMessage);channel.removeEventListener('open',onOpen);channel.removeEventListener('close',onClose);
        for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error(globalThis.PlayroomMessages.text("ui.webrtc.e192912e5d23")));}
        pending.clear();listeners.clear();presenceListeners.clear();reactionListeners.clear();chatListeners.clear();latestPresence=null;try{channel.close();}catch(_){}
      }
    });
  }
  // No external signalling: only probe the existing authenticated connection.
  const RecoveryBase=root.PlayroomRecoveryCoordinator||(typeof require==='function'?require('../../application/recovery-coordinator.js'):null);
  async function connectionRoute(pc){
    const stats=await pc.getStats?.();if(!stats)return null;
    const pair=[...stats.values()].find(value=>value.type==='candidate-pair'&&value.state==='succeeded'&&(value.nominated||value.selected));
    const local=stats.get(pair?.localCandidateId),remote=stats.get(pair?.remoteCandidateId),type=value=>['host','srflx','prflx','relay'].includes(value)?value:'unknown';
    return pair?{local:type(local?.candidateType),remote:type(remote?.candidateType),protocol:['udp','tcp'].includes(local?.protocol)?local.protocol:'unknown'}:null;
  }
  async function selectedMethod(pc){
    const stats=await pc.getStats?.();let pair,local,remote;
    if(stats){const transport=[...stats.values()].find(v=>v.type==='transport'&&v.selectedCandidatePairId);pair=stats.get(transport?.selectedCandidatePairId)||[...stats.values()].find(v=>v.type==='candidate-pair'&&v.state==='succeeded'&&(v.nominated||v.selected));local=stats.get(pair?.localCandidateId);remote=stats.get(pair?.remoteCandidateId);}
    if(!pair){const selected=pc.sctp?.transport?.iceTransport?.getSelectedCandidatePair?.();if(selected){local=selected.local;remote=selected.remote;pair=selected;}}
    const types=[local?.candidateType||local?.type,remote?.candidateType||remote?.type];
    const method=types.includes('relay')?'turn':types.some(t=>['srflx','prflx'].includes(t))?'stun':types.every(t=>t==='host')?'direct':'unknown';
    const protocol=(local?.candidateType==='relay'?local?.relayProtocol:remote?.candidateType==='relay'?remote?.relayProtocol:null)||local?.protocol;
    return {method,...(['udp','tcp','tls'].includes(protocol)?{protocol}:{} )};
  }
  function observeIce(pc,onProgress){
    if(!onProgress)return ()=>{};let closed=false,timer=null,deadline=null;const checkingMethods=new Set();
    const emit=value=>{if(!closed)onProgress(value);},candidate=event=>{const type=event.candidate?.type||event.candidate?.candidate?.match(/ typ (host|srflx|prflx|relay)/)?.[1],key={host:'direct',srflx:'stun',prflx:'stun',relay:'turn'}[type];if(key&&!checkingMethods.has(key))emit({[key]:'available'});};
    const probe=async()=>{if(closed)return;try{const stats=await pc.getStats?.();if(closed||!stats)return;const pending=[...stats.values()].filter(v=>v.type==='candidate-pair'&&v.state==='in-progress');const status={};for(const pair of pending){const l=stats.get(pair.localCandidateId),r=stats.get(pair.remoteCandidateId),types=[l?.candidateType,r?.candidateType],key=types.includes('relay')?'turn':types.some(t=>['srflx','prflx'].includes(t))?'stun':'direct';status[key]='checking';checkingMethods.add(key);}if(pending.length)emit({stage:'checking',...status});}catch{}};
    const state=()=>{if(['failed','closed'].includes(pc.connectionState)||['failed','closed'].includes(pc.iceConnectionState)){if(pc.connectionState!=='closed')emit({stage:'checking',code:'ice-failed'});close();return;}if(['connected','completed'].includes(pc.iceConnectionState)||pc.connectionState==='connected'){close();return;}if(pc.iceConnectionState==='checking'){emit({stage:'checking'});if(!timer){void probe();timer=setInterval(()=>void probe(),500);}}};
    function close(){if(closed)return;closed=true;clearInterval(timer);clearTimeout(deadline);pc.removeEventListener('icecandidate',candidate);pc.removeEventListener('iceconnectionstatechange',state);pc.removeEventListener('connectionstatechange',state);}
    pc.addEventListener('icecandidate',candidate);pc.addEventListener('iceconnectionstatechange',state);pc.addEventListener('connectionstatechange',state);deadline=setTimeout(close,45000);emit({stage:'gathering'});return close;
  }
  class Recovery extends RecoveryBase {
    constructor(options){const document=options.document??root.document;super({...options,link:options.pc,
      visibility:{get hidden(){return !!document?.hidden;},subscribe(listener){document?.addEventListener('visibilitychange',listener);return()=>document?.removeEventListener('visibilitychange',listener);}},
      diagnostics:()=>connectionRoute(options.pc),clock:{now:()=>Date.now(),setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id),setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:id=>clearInterval(id)}});}
  }
  async function createHostPeer({configuration={iceServers:[]},label='playroom',onProgress,gatherTimeout=8000,allowPartial=false}={}){
    const PC=rtc(),pc=new PC(configuration),channel=pc.createDataChannel(label,{ordered:true}),id=pairingId();
    const unobserve=observeIce(pc,onProgress);
    try{await pc.setLocalDescription(await pc.createOffer());await waitIce(pc,{timeout:gatherTimeout,allowPartial});}catch(error){unobserve();pc.close();throw error;}
    let answerSdp=null,answerFlight=null;
    return {
      pc,channel,pairingId:id,offer:serializeDescription(pc.localDescription,{pairingId:id}),
      async acceptAnswer(signal){
        const parsed=parseSignal(signal,'answer');
        if(parsed.pairingId&&parsed.pairingId!==id)throw Error(globalThis.PlayroomMessages.text("ui.webrtc.a6d20424e6f2"));
        if(answerSdp!==null&&answerSdp!==parsed.description.sdp)throw Error(globalThis.PlayroomMessages.text("ui.webrtc.a6d20424e6f2"));
        if(!answerFlight){answerSdp=parsed.description.sdp;answerFlight=pc.setRemoteDescription(parsed.description).catch(error=>{answerFlight=null;answerSdp=null;throw error;});}
        await answerFlight;return waitOpen(channel);
      },
      waitOpen:options=>waitOpen(channel,options),
      close(){unobserve();try{channel.close();}catch(_){}try{pc.close();}catch(_){}}
    };
  }
  async function createClientPeer(signal,{configuration={iceServers:[]},onProgress,gatherTimeout=8000,allowPartial=false}={}){
    const parsed=parseSignal(signal,'offer'),PC=rtc(),pc=new PC(configuration);let channel=null;
    const waiters=new Set(),capture=event=>{channel=event.channel;};
    const unobserve=observeIce(pc,onProgress);
    pc.addEventListener('datachannel',capture,{once:true});
    try{
      await pc.setRemoteDescription(parsed.description);
      await pc.setLocalDescription(await pc.createAnswer());await waitIce(pc,{timeout:gatherTimeout,allowPartial});
    }catch(error){unobserve();pc.removeEventListener('datachannel',capture);try{pc.close();}catch(_){}throw error;}
    function ready(options={}){
      if(channel)return waitOpen(channel,options);
      const timeout=options.timeout??10000,started=Date.now();
      return new Promise((resolve,reject)=>{
        let settled=false,opening=false;
        const done=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);waiters.delete(done);pc.removeEventListener('datachannel',incoming);pc.removeEventListener('connectionstatechange',state);error?reject(error):resolve(value);};
        const incoming=event=>{if(opening||settled)return;opening=true;channel=event.channel;waitOpen(channel,{...options,timeout:Math.max(0,timeout-(Date.now()-started))}).then(value=>done(null,value),done);};
        const state=()=>{if(['failed','closed'].includes(pc.connectionState))done(Error(globalThis.PlayroomMessages.text('ui.webrtc.bd6b75c2f0ac')));};
        const timer=setTimeout(()=>done(Error(globalThis.PlayroomMessages.text('ui.webrtc.99b70a4fcf53'))),timeout);
        waiters.add(done);pc.addEventListener('datachannel',incoming);pc.addEventListener('connectionstatechange',state);if(channel)incoming({channel});state();
      });
    }
    return {
      pc,get channel(){return channel;},pairingId:parsed.pairingId,answer:serializeDescription(pc.localDescription,{pairingId:parsed.pairingId}),
      waitOpen:ready,
      async transport(options){return client(await ready(options),options);},
      close(){unobserve();for(const done of [...waiters])done(Error(globalThis.PlayroomMessages.text('ui.webrtc.bd6b75c2f0ac')));pc.removeEventListener('datachannel',capture);try{channel?.close();}catch(_){}try{pc.close();}catch(_){}}
    };
  }

  return {Recovery,selectedMethod,observeIce,SIGNAL_VERSION,serializeDescription,parseSignal,parseDescription,waitIce,waitOpen,subscribeAuthorized,serve,client,createHostPeer,createClientPeer};
});
