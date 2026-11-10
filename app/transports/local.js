(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomLocalTransport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A capability is bound by the authority; this facade cannot select a seat.
  return function localTransport(connection){return Object.freeze({status:()=>connection.status(),snapshot:()=>connection.snapshot(),dispatch:c=>connection.dispatch(c),history:i=>connection.history(i),historyRange:(start,count)=>connection.historyRange(start,count),presentationReady:value=>connection.presentationReady?.(value),subscribe:f=>connection.subscribe(f),close:()=>connection.close()});};
});
