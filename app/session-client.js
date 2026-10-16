/* Browser ID source for the portable connection state machine. */
(function(root,factory){const api=factory(root.PlayroomClientConnectionService||(typeof require==='function'?require('../application/client-connection-service.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSessionClient=api;})(globalThis,function(Service){
  let sequence=0;const idFactory=()=>globalThis.crypto?.randomUUID?.()||'client-'+Date.now()+'-'+(++sequence);
  return class SessionClient extends Service {constructor(transport,options={}){super(transport,{idFactory,...options});}};
});
