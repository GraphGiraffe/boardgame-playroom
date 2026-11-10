/* Bound network inactivity, including stalled response bodies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRequestDeadline=api;})(globalThis,function(){
 'use strict';
 async function run(work,{signal,timeout=8000}={}){
  const controller=new AbortController();let timer,rejectWait;
  const stopped=new Promise((_,reject)=>{rejectWait=reject;});
  const stop=error=>{rejectWait(error);controller.abort(error);};
  const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>stop(Object.assign(Error('Сервер не отвечает. Проверьте соединение и повторите попытку.'),{code:'timeout'})),timeout);};
  const cancel=()=>stop(Object.assign(Error('Request cancelled'),{name:'AbortError'}));
  if(signal?.aborted)cancel();else signal?.addEventListener('abort',cancel,{once:true});
  touch();try{return await Promise.race([stopped,Promise.resolve().then(()=>{if(controller.signal.aborted)throw controller.signal.reason;return work(controller.signal,touch);})]);}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 async function bytes(response,{signal,touch,limit}){
  const reader=response.body?.getReader?.();
  if(!reader){const value=new Uint8Array(response.arrayBuffer?await response.arrayBuffer():new TextEncoder().encode(await response.text()));if(value.byteLength>limit)throw Error('Ответ сервера слишком большой.');touch();return value;}
  const chunks=[];let size=0;const cancel=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',cancel,{once:true});
  try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){cancel();throw Error('Ответ сервера слишком большой.');}chunks.push(part.value);touch();}const value=new Uint8Array(size);let offset=0;for(const part of chunks){value.set(part,offset);offset+=part.byteLength;}return value;}
  finally{signal.removeEventListener('abort',cancel);reader.releaseLock();}
 }
 return Object.freeze({run,bytes});
});
