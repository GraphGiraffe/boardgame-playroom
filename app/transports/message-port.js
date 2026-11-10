if(typeof require==='function'&&typeof module==='object'&&module.exports)require("../../core/messages.js");
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPortTransport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  function serve(port,connection){
    const unsubscribe=connection.subscribe(snapshot=>port.postMessage({kind:'snapshot',snapshot}));
    port.onmessage=async event=>{const m=event.data;if(!m||!Number.isSafeInteger(m.requestId))return;
      try{let result;if(m.method==='status')result=connection.status();else if(m.method==='snapshot')result=connection.snapshot();else if(m.method==='dispatch')result=connection.dispatch(m.value);else if(m.method==='history')result=connection.history(m.value);else if(m.method==='historyRange')result=connection.historyRange(m.value.start,m.value.count);else if(m.method==='presentationReady')result=connection.presentationReady?.(m.value);else throw Error('Unknown request');result=await result;port.postMessage({kind:'response',requestId:m.requestId,result});}
      catch(_){port.postMessage({kind:'response',requestId:m.requestId,error:globalThis.PlayroomMessages.text("ui.message-port.b266c6f0f866")});}
    };port.start();
    return ()=>{unsubscribe();port.close();connection.close();};
  }
  function client(port,{timeout=5000}={}){
    let seq=0,closed=false;const pending=new Map(),listeners=new Set();
    port.onmessage=event=>{const m=event.data;if(m?.kind==='snapshot'){const snapshot=P.immutable(m.snapshot);for(const f of listeners)f(snapshot);return;}const p=pending.get(m?.requestId);if(!p)return;pending.delete(m.requestId);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(P.immutable(m.result));};port.start();
    const request=(method,value)=>new Promise((resolve,reject)=>{if(closed)return reject(Error(globalThis.PlayroomMessages.text("ui.message-port.b8adaa326e7c")));const requestId=++seq,timer=setTimeout(()=>{pending.delete(requestId);reject(Error(globalThis.PlayroomMessages.text("ui.message-port.6748090ff14a")));},timeout);pending.set(requestId,{resolve,reject,timer});port.postMessage({requestId,method,value});});
    return {status:()=>request('status'),snapshot:()=>request('snapshot'),dispatch:c=>request('dispatch',c),history:i=>request('history',i),historyRange:(start,count)=>request('historyRange',{start,count}),presentationReady:value=>request('presentationReady',value),subscribe:f=>{listeners.add(f);return ()=>listeners.delete(f);},close(){closed=true;port.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(globalThis.PlayroomMessages.text("ui.message-port.b8adaa326e7c")));}pending.clear();listeners.clear();}};
  }
  return {serve,client};
});
