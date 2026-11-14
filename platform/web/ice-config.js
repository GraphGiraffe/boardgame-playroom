/* Short-lived relay credentials and one bounded, sanitized trace per attempt. */
(function(root){
 'use strict';
 const STUN={urls:'stun:stun.cloudflare.com:3478'},cache=new Map(),flights=new Map();let account;
 const fail=()=>Object.assign(Error('cancelled'),{code:'cancelled'});
 function init(service){account=service;account.subscribe(()=>{for(const key of cache.keys())if(key!==account.snapshot().id)cache.delete(key);});}
 async function credentials(roomId){
  const id=account?.snapshot().id;if(!id)throw fail();const cached=cache.get(id);if(cached?.expiresAt>Date.now()+300000)return cached;
  const key=id+':'+roomId;if(flights.has(key))return flights.get(key);
  const flight=(async()=>{
   const session=await account.auth.session();if(!session||account.snapshot().id!==id)throw fail();
   let result;
   try{
    const config=root.PlayroomNetworkConfig,response=await root.fetch(config.url+'/functions/v1/playroom-ice',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(13000),headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({roomId})});
    const body=await response.json();if(!response.ok)throw Object.assign(Error('turn-network'),{code:body.code});
    if(!Array.isArray(body.iceServers)||!Number.isFinite(body.expiresAt))throw Error('turn-network');
    result={configuration:{iceServers:[STUN,...body.iceServers]},expiresAt:body.expiresAt,diagnosticsEnabled:body.diagnosticsEnabled};
   }catch(error){if(error.code==='cancelled')throw error;result={configuration:{iceServers:[STUN]},expiresAt:Date.now()+360000,code:['turn-setup','turn-auth'].includes(error.code)?error.code:'turn-network'};}
   if(account.snapshot().id!==id)throw fail();cache.set(id,result);return result;
  })();flights.set(key,flight);try{return await flight;}finally{if(flights.get(key)===flight)flights.delete(key);}
 }
 function device(){const ua=root.navigator?.userAgent||'',browser=/CriOS/.test(ua)?'chrome-ios':/Chrome/.test(ua)?'chrome':/Firefox|FxiOS/.test(ua)?'firefox':/Safari/.test(ua)?'safari':'other';return {os:/iPhone|iPad|iPod/.test(ua)?'ios':/Android/.test(ua)?'android':ua?'desktop':'other',browser,major:Number((ua.match(/(?:Chrome|CriOS|Firefox|FxiOS|Version)\/(\d{1,3})/)||[])[1])||undefined};}
 async function trace(value,userId){
  try{if(!account||account.snapshot().kind!=='account'||account.snapshot().id!==userId)return;const session=await account.auth.session();if(!session||account.snapshot().id!==userId)return;
   const config=root.PlayroomNetworkConfig;await root.fetch(config.url+'/rest/v1/rpc/playroom_connection_trace',{method:'POST',keepalive:true,cache:'no-store',signal:AbortSignal.timeout(5000),headers:{apikey:config.publishableKey,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({...value,p_device:device()})});
  }catch{} // Diagnostics never affect play and never retry.
 }
 root.PlayroomIceConfig=Object.freeze({init,credentials,trace,configuration:async roomId=>roomId?(await credentials(roomId)).configuration:{iceServers:[]}});
})(globalThis);
