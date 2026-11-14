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

// WebKit can bypass Playwright URL routing after Service Worker control. Intercept
// the page's Supabase port before native fetch, while retaining the real UI,
// Auth/RPC adapters and app worker. Other origins keep their native fetch path.
module.exports.installFetch=async(context,handler)=>{
 const counts={intercepted:0,nativeSupabaseRequests:0},binding='__playroomSupabaseFixtureFetch';
 context.on('request',request=>{if(new URL(request.url()).hostname.endsWith('.supabase.co'))counts.nativeSupabaseRequests++;});
 await context.exposeBinding(binding,async(_source,input)=>{
  counts.intercepted++;let response,aborted=false;
  const request={url:()=>input.url,method:()=>input.method,headers:()=>input.headers,allHeaders:async()=>input.headers,postData:()=>input.body,postDataJSON:()=>input.body?JSON.parse(input.body):null};
  await handler({request:()=>request,fulfill:async value=>{response=value;},abort:async()=>{aborted=true;}});
  if(aborted)throw Error('Fixture request aborted');if(!response)throw Error('Supabase fixture did not fulfill request');
  const headers={...response.headers};if(response.contentType)headers['content-type']=response.contentType;
  if(response.json!==undefined){headers['content-type']='application/json';return {status:response.status||200,headers,body:JSON.stringify(response.json)};}
  return {status:response.status||200,headers,body:response.body||''};
 });
 await context.addInitScript(({binding})=>{
  const native=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async(input,options={})=>{
   const request=input instanceof Request?input:null,url=new URL(request?.url||String(input),location.href);
   if(!url.hostname.endsWith('.supabase.co'))return native(input,options);
   const signal=options.signal||request?.signal;if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
   const payload={url:url.href,method:options.method||request?.method||'GET',headers:Object.fromEntries(new Headers(options.headers||request?.headers)),body:options.body===undefined?(request?await request.clone().text():null):String(options.body)};
   let remove=()=>{};
   try{
    const pending=globalThis[binding](payload),value=signal?await new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));remove=()=>signal.removeEventListener('abort',abort);signal.addEventListener('abort',abort,{once:true});pending.then(resolve,reject);}):await pending;
    return new Response([204,205,304].includes(value.status)?null:value.body,{status:value.status,headers:value.headers});
   }finally{remove();}
  };
 },{binding});
 return counts;
};
