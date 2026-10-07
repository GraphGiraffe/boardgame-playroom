(function(root){
  'use strict';
  root.PlayroomHTTPTransport=function({token,base='',interval=500,onStatus=()=>{}}){
    let closed=false,timer=null,polling=false;const listeners=new Set(),controllers=new Set();
    async function request(path,body){
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000);controllers.add(controller);
      try{const response=await fetch(base+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store',credentials:'omit'});
        if(!response.ok)throw Error(response.status===401?'Ссылка недействительна. Получите новую ссылку у организатора.':'Сервер не выполнил запрос.');
        const result=await response.json();onStatus(true);return result;
      }catch(error){if(!closed)onStatus(false,error.message);throw error;}
      finally{clearTimeout(timeout);controllers.delete(controller);}
    }
    async function poll(){if(closed||polling)return;polling=true;
      try{const s=await request('snapshot');for(const listener of listeners)listener(s);}catch(_){}finally{polling=false;if(!closed)timer=setTimeout(poll,interval);}
    }
    return {snapshot:()=>request('snapshot'),definition:()=>request('view'),dispatch:c=>request('command',c),history:i=>request('history?index='+encodeURIComponent(i)),subscribe:f=>{listeners.add(f);if(listeners.size===1)poll();return ()=>listeners.delete(f);},close(){closed=true;clearTimeout(timer);for(const c of controllers)c.abort();controllers.clear();listeners.clear();}};
  };
})(globalThis);
