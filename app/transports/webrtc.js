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
    if(typeof root.RTCPeerConnection!=='function')throw Error('Этот браузер не поддерживает WebRTC.');
    return root.RTCPeerConnection;
  }
  function pairingId(){
    if(root.crypto?.randomUUID)return root.crypto.randomUUID();
    if(root.crypto?.getRandomValues){const bytes=new Uint8Array(16);root.crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
    return 'pair-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
  }
  function serializeDescription(description,{pairingId:nullablePairingId=null}={}){
    if(!description||!['offer','answer'].includes(description.type)||typeof description.sdp!=='string')throw Error('Некорректное описание WebRTC.');
    const value={v:SIGNAL_VERSION,type:description.type,sdp:description.sdp};
    if(nullablePairingId)value.pairingId=String(nullablePairingId);
    return JSON.stringify(value);
  }
  function parseSignal(value,expected){
    let data=value;
    if(typeof data==='string')try{data=JSON.parse(data);}catch(_){throw Error('Некорректный код подключения.');}
    if(!data||data.v!==SIGNAL_VERSION||!['offer','answer'].includes(data.type)||typeof data.sdp!=='string'||!data.sdp)throw Error('Некорректный код подключения.');
    if(expected&&data.type!==expected)throw Error('Ожидался '+expected+' WebRTC.');
    return {description:{type:data.type,sdp:data.sdp},pairingId:typeof data.pairingId==='string'&&data.pairingId?data.pairingId:null};
  }
  function parseDescription(value,expected){return parseSignal(value,expected).description;}

  function waitIce(pc,{timeout=8000}={}){
    if(pc.iceGatheringState==='complete')return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(done,timeout,Error('Не удалось подготовить локальное WebRTC-соединение.'));
      function done(error){clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',change);error?reject(error):resolve();}
      function change(){if(pc.iceGatheringState==='complete')done();}
      pc.addEventListener('icegatheringstatechange',change);
    });
  }
  function waitOpen(channel,{timeout=10000}={}){
    if(channel.readyState==='open')return Promise.resolve(channel);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(done,timeout,Error('Другой браузер не подключился.'));
      function done(error){clearTimeout(timer);channel.removeEventListener('open',open);channel.removeEventListener('error',fail);channel.removeEventListener('close',closed);error?reject(error):resolve(channel);}
      function open(){done();}
      function fail(){done(Error('Ошибка WebRTC-канала.'));}
      function closed(){done(Error('WebRTC-канал закрыт до подключения.'));}
      channel.addEventListener('open',open,{once:true});channel.addEventListener('error',fail,{once:true});channel.addEventListener('close',closed,{once:true});
    });
  }
  function send(channel,message){
    if(channel.readyState!=='open')throw Error('WebRTC-канал не подключён.');
    channel.send(JSON.stringify(message));
  }
  function serve(channel,connection){
    if(!channel||!connection)throw Error('Нужны канал и привязанное соединение authority.');
    const debug=channel.__playroomDebug={side:'server',hellos:0,ready:0,requests:0,responses:0,snapshots:0,errors:0,lastMethod:null,lastError:null};
    const unsubscribe=connection.subscribe?.(snapshot=>{if(channel.readyState==='open'){debug.snapshots++;send(channel,{kind:'snapshot',snapshot});}});
    const onMessage=async event=>{
      let message;try{message=JSON.parse(event.data);}catch(error){debug.errors++;debug.lastError='parse';return;}
      if(message?.kind==='hello'){
        debug.hellos++;
        if(channel.readyState==='open'){send(channel,{kind:'transport-ready',version:1});debug.ready++;}
        return;
      }
      if(message?.kind!=='request'||!Number.isSafeInteger(message.requestId))return;
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
        if(channel.readyState==='open'){send(channel,{kind:'response',requestId:message.requestId,error:'Запрос не выполнен.'});debug.responses++;}
      }
    };
    channel.addEventListener('message',onMessage);
    const close=()=>{unsubscribe?.();channel.removeEventListener('message',onMessage);connection.close?.();try{channel.close();}catch(_){}};
    channel.addEventListener('close',()=>{unsubscribe?.();connection.close?.();},{once:true});
    return close;
  }
  function client(channel,{timeout=7000,handshakeTimeout=5000}={}){
    let sequence=0,closed=false,ready=false;const pending=new Map(),listeners=new Set(),presenceListeners=new Set();let latestPresence=null;
    const debug=channel.__playroomClientDebug={side:'client',hellos:0,ready:0,requests:0,responses:0,snapshots:0,timeouts:0,lastMethod:null,lastError:null};
    let resolveReady,rejectReady;
    const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    const readyTimer=setTimeout(()=>{
      if(ready||closed)return;
      debug.timeouts++;debug.lastError='handshake-timeout';
      rejectReady(Error('Хост не подтвердил готовность соединения.'));
    },handshakeTimeout);
    let helloTimer=null;
    const sendHello=()=>{
      if(closed||ready||channel.readyState!=='open')return;
      try{send(channel,{kind:'hello',version:1});debug.hellos++;}
      catch(error){debug.lastError=error?.message||String(error);}
    };
    const stopHello=()=>{clearInterval(helloTimer);helloTimer=null;};
    const markReady=()=>{
      if(ready)return;
      ready=true;debug.ready++;clearTimeout(readyTimer);stopHello();resolveReady();
    };
    const onMessage=event=>{
      let message;try{message=JSON.parse(event.data);}catch(_){return;}
      if(message?.kind==='transport-ready'){markReady();return;}
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
      if(!ready){clearTimeout(readyTimer);stopHello();rejectReady(Error('Соединение закрылось до подтверждения готовности.'));}
    };
    channel.addEventListener('message',onMessage);
    channel.addEventListener('open',onOpen);
    channel.addEventListener('close',onClose,{once:true});
    if(channel.readyState==='open'){sendHello();helloTimer=setInterval(sendHello,250);}
    else helloTimer=setInterval(sendHello,250);
    const request=async(method,value)=>{
      if(closed)throw Error('Подключение закрыто.');
      await readyPromise;
      return new Promise((resolve,reject)=>{
        if(closed||channel.readyState!=='open')return reject(Error('Нет соединения с хостом.'));
        const requestId=++sequence,timer=setTimeout(()=>{debug.timeouts++;pending.delete(requestId);reject(Error('Хост не ответил. Повторите запрос.'));},timeout);
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
      subscribePresence:listener=>{if(typeof listener!=='function')throw Error('Listener required');presenceListeners.add(listener);
        if(latestPresence)listener(clone(latestPresence));return ()=>presenceListeners.delete(listener);},
      debug:()=>clone(debug),
      close(){
        if(closed)return;closed=true;clearTimeout(readyTimer);stopHello();
        channel.removeEventListener('message',onMessage);channel.removeEventListener('open',onOpen);channel.removeEventListener('close',onClose);
        for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Соединение закрыто.'));}
        pending.clear();listeners.clear();presenceListeners.clear();latestPresence=null;try{channel.close();}catch(_){}
      }
    });
  }
  async function createHostPeer({configuration={iceServers:[]},label='playroom'}={}){
    const PC=rtc(),pc=new PC(configuration),channel=pc.createDataChannel(label,{ordered:true}),id=pairingId();
    await pc.setLocalDescription(await pc.createOffer());await waitIce(pc);
    return {
      pc,channel,pairingId:id,offer:serializeDescription(pc.localDescription,{pairingId:id}),
      async acceptAnswer(signal){
        const parsed=parseSignal(signal,'answer');
        if(parsed.pairingId&&parsed.pairingId!==id)throw Error('Этот ответ относится к другому приглашению. Создайте новый ответ для текущего подключения.');
        await pc.setRemoteDescription(parsed.description);return waitOpen(channel);
      },
      waitOpen:options=>waitOpen(channel,options),
      close(){try{channel.close();}catch(_){}try{pc.close();}catch(_){}}
    };
  }
  async function createClientPeer(signal,{configuration={iceServers:[]}}={}){
    const parsed=parseSignal(signal,'offer'),PC=rtc(),pc=new PC(configuration);let channel=null,resolveChannel,rejectChannel;
    const channelReady=new Promise((resolve,reject)=>{resolveChannel=resolve;rejectChannel=reject;});
    pc.addEventListener('datachannel',event=>{channel=event.channel;resolveChannel(channel);},{once:true});
    try{
      await pc.setRemoteDescription(parsed.description);
      await pc.setLocalDescription(await pc.createAnswer());await waitIce(pc);
    }catch(error){rejectChannel(error);try{pc.close();}catch(_){}throw error;}
    return {
      pc,pairingId:parsed.pairingId,answer:serializeDescription(pc.localDescription,{pairingId:parsed.pairingId}),
      async waitOpen(options){const value=channel||await channelReady;return waitOpen(value,options);},
      async transport(options){const value=channel||await channelReady;await waitOpen(value,options);return client(value,options);},
      close(){try{channel?.close();}catch(_){}try{pc.close();}catch(_){}}
    };
  }
  return {SIGNAL_VERSION,serializeDescription,parseSignal,parseDescription,waitIce,waitOpen,serve,client,createHostPeer,createClientPeer};
});
