(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPortTransport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function serve(port,connection){
    const unsubscribe=connection.subscribe(snapshot=>port.postMessage({kind:'snapshot',snapshot}));
    port.onmessage=async event=>{const m=event.data;if(!m||!Number.isSafeInteger(m.requestId))return;
      try{let result;if(m.method==='snapshot')result=connection.snapshot();else if(m.method==='dispatch')result=connection.dispatch(m.value);else if(m.method==='history')result=connection.history(m.value);else if(m.method==='presentationReady')result=connection.presentationReady?.(m.value);else throw Error('Unknown request');result=await result;port.postMessage({kind:'response',requestId:m.requestId,result});}
      catch(_){port.postMessage({kind:'response',requestId:m.requestId,error:'Запрос не выполнен.'});}
    };port.start();
    return ()=>{unsubscribe();port.close();connection.close();};
  }
  function client(port,{timeout=5000}={}){
    let seq=0,closed=false;const pending=new Map(),listeners=new Set();
    port.onmessage=event=>{const m=event.data;if(m?.kind==='snapshot'){for(const f of listeners)f(m.snapshot);return;}const p=pending.get(m?.requestId);if(!p)return;pending.delete(m.requestId);clearTimeout(p.timer);m.error?p.reject(Error(m.error)):p.resolve(m.result);};port.start();
    const request=(method,value)=>new Promise((resolve,reject)=>{if(closed)return reject(Error('Подключение закрыто.'));const requestId=++seq,timer=setTimeout(()=>{pending.delete(requestId);reject(Error('Нет ответа от исполнителя. Повторите запрос.'));},timeout);pending.set(requestId,{resolve,reject,timer});port.postMessage({requestId,method,value});});
    return {snapshot:()=>request('snapshot'),dispatch:c=>request('dispatch',c),history:i=>request('history',i),presentationReady:value=>request('presentationReady',value),subscribe:f=>{listeners.add(f);return ()=>listeners.delete(f);},close(){closed=true;port.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Подключение закрыто.'));}pending.clear();listeners.clear();}};
  }
  return {serve,client};
});
