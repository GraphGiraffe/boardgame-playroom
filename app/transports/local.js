(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomLocalTransport=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // A capability is bound by the authority; this facade cannot select a seat.
  return function localTransport(connection){return Object.freeze({snapshot:()=>connection.snapshot(),dispatch:c=>connection.dispatch(c),history:i=>connection.history(i),subscribe:f=>connection.subscribe(f),close:()=>connection.close()});};
});
