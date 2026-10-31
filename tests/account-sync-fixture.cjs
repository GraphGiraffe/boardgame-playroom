'use strict';
/* Reuse per-RPC HTTP fixtures through the aggregate endpoint; no real backend I/O. */
module.exports=handler=>async route=>{
 const request=route.request();if(!request.url().endsWith('/playroom_account_sync'))return handler(route);
 const results=[];let aborted=false;
 for(const item of request.postDataJSON().p_data.requests){
  let response;
  const payload={p_action:item.action,p_data:item.data},virtualRequest=new Proxy(request,{get(target,key){if(key==='url')return ()=>request.url().replace(/playroom_account_sync$/,item.rpc);if(key==='postDataJSON')return ()=>payload;if(key==='postData')return ()=>JSON.stringify(payload);const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  const virtualRoute=new Proxy(route,{get(target,key){if(key==='request')return ()=>virtualRequest;if(key==='fulfill')return async value=>{response=value;};if(key==='abort')return async reason=>{aborted=true;await route.abort(reason);};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await handler(virtualRoute);if(aborted)return;if(!response)throw Error('RPC fixture did not fulfill '+item.rpc+'/'+item.action);
  const value=response.json??JSON.parse(response.body||'{}');results.push((response.status||200)<400?{id:item.id,data:value}:{id:item.id,error:{code:value.message?.startsWith('social:')?value.message.slice(7):'request',serverCode:value.code}});
 }
 return route.fulfill({status:200,json:{results}});
};
