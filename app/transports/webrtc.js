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
  function serializeDescription(description){
    if(!description||!['offer','answer'].includes(description.type)||typeof description.sdp!=='string')throw Error('Некорректное описание WebRTC.');
    return JSON.stringify({v:SIGNAL_VERSION,type:description.type,sdp:description.sdp});
  }
  function parseDescription(value,expected){
    let data=value;
    if(typeof data==='string')try{data=JSON.parse(data);}catch(_){throw Error('Некорректный код подключения.');}
    if(!data||data.v!==SIGNAL_VERSION||!['offer','answer'].includes(data.type)||typeof data.sdp!=='string'||!data.sdp)throw Error('Некорректный код подключения.');
    if(expected&&data.type!==expected)throw Error('Ожидался '+expected+' WebRTC.');
    return {type:data.type,sdp:data.sdp};
  }
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
    const unsubscribe=connection.subscribe?.(snapshot=>{if(channel.readyState==='open')send(channel,{kind:'snapshot',snapshot});});
    const onMessage=event=>{
      let message;try{message=JSON.parse(event.data);}catch(_){return;}
      if(message?.kind!=='request'||!Number.isSafeInteger(message.requestId))return;
      try{
        let result;
        if(message.method==='snapshot')result=connection.snapshot();
        else if(message.method==='dispatch')result=connection.dispatch(message.value);
        else if(message.method==='history')result=connection.history(message.value);
        else throw Error('Unknown request');
        send(channel,{kind:'response',requestId:message.requestId,result});
      }catch(_){
        if(channel.readyState==='open')send(channel,{kind:'response',requestId:message.requestId,error:'Запрос не выполнен.'});
      }
    };
    channel.addEventListener('message',onMessage);
    const close=()=>{unsubscribe?.();channel.removeEventListener('message',onMessage);connection.close?.();try{channel.close();}catch(_){}};
    channel.addEventListener('close',()=>{unsubscribe?.();connection.close?.();},{once:true});
    return close;
  }
  function client(channel,{timeout=7000}={}){
    let sequence=0,closed=false;const pending=new Map(),listeners=new Set();
    const onMessage=event=>{
      let message;try{message=JSON.parse(event.data);}catch(_){return;}
      if(message?.kind==='snapshot'){for(const listener of listeners)listener(clone(message.snapshot));return;}
      if(message?.kind!=='response')return;
      const item=pending.get(message.requestId);if(!item)return;
      pending.delete(message.requestId);clearTimeout(item.timer);
      message.error?item.reject(Error(message.error)):item.resolve(clone(message.result));
    };
    channel.addEventListener('message',onMessage);
    const request=(method,value)=>new Promise((resolve,reject)=>{
      if(closed||channel.readyState!=='open')return reject(Error('Нет соединения с хостом.'));
      const requestId=++sequence,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Хост не ответил. Повторите запрос.'));},timeout);
      pending.set(requestId,{resolve,reject,timer});
      try{send(channel,{kind:'request',requestId,method,value});}catch(error){clearTimeout(timer);pending.delete(requestId);reject(error);}
    });
    return Object.freeze({
      snapshot:()=>request('snapshot'),
      dispatch:command=>request('dispatch',command),
      history:index=>request('history',index),
      subscribe:listener=>{listeners.add(listener);return ()=>listeners.delete(listener);},
      close(){if(closed)return;closed=true;channel.removeEventListener('message',onMessage);for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Соединение закрыто.'));}pending.clear();listeners.clear();try{channel.close();}catch(_){}}
    });
  }
  async function createHostPeer({configuration={iceServers:[]},label='playroom'}={}){
    const PC=rtc(),pc=new PC(configuration),channel=pc.createDataChannel(label,{ordered:true});
    await pc.setLocalDescription(await pc.createOffer());await waitIce(pc);
    return {
      pc,channel,offer:serializeDescription(pc.localDescription),
      async acceptAnswer(signal){await pc.setRemoteDescription(parseDescription(signal,'answer'));return waitOpen(channel);},
      waitOpen:options=>waitOpen(channel,options),
      close(){try{channel.close();}catch(_){}try{pc.close();}catch(_){}}
    };
  }
  async function createClientPeer(signal,{configuration={iceServers:[]}}={}){
    const PC=rtc(),pc=new PC(configuration);let channel=null,resolveChannel,rejectChannel;
    const channelReady=new Promise((resolve,reject)=>{resolveChannel=resolve;rejectChannel=reject;});
    pc.addEventListener('datachannel',event=>{channel=event.channel;resolveChannel(channel);},{once:true});
    try{
      await pc.setRemoteDescription(parseDescription(signal,'offer'));
      await pc.setLocalDescription(await pc.createAnswer());await waitIce(pc);
    }catch(error){rejectChannel(error);try{pc.close();}catch(_){}throw error;}
    return {
      pc,answer:serializeDescription(pc.localDescription),
      async waitOpen(options){const value=channel||await channelReady;return waitOpen(value,options);},
      async transport(options){const value=channel||await channelReady;await waitOpen(value,options);return client(value,options);},
      close(){try{channel?.close();}catch(_){}try{pc.close();}catch(_){}}
    };
  }
  return {SIGNAL_VERSION,serializeDescription,parseDescription,waitIce,waitOpen,serve,client,createHostPeer,createClientPeer};
});
