/* Host-only public activity metadata, emitted after authority publications. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomGamePushEvents=api;})(globalThis,function(){
 'use strict';
 class GamePushEvents{
  constructor({authority,room,access,send,resumed=false,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
   Object.assign(this,{authority,room,access,send,resumed,delay});this.closed=false;this.last='';this.queue=Promise.resolve();this.observer=authority.connect(-1);this.unsubscribe=this.observer.subscribe(()=>this.update());this.update();
  }
  update(){
   if(this.closed)return;const room=this.room();if(!room||room.phase!=='playing'||room.transportMode!=='online')return;
   const snapshot=this.observer.snapshot(),players=[],targets=[];
   for(const person of room.participants.filter(p=>!p.bot&&p.role==='player')){
    let port;try{port=this.access.connect(this.authority,room,person.id);const own=port.snapshot();players.push(person.id);const independent=new Set((own.independentActions||[]).map(a=>JSON.stringify(a)));if(!own.paused&&own.state.status!=='finished'&&own.actions.some(a=>!independent.has(JSON.stringify(a))))targets.push(person.id);}finally{port?.close();}
   }
   const payload={sessionId:snapshot.sessionId,revision:snapshot.revision,controlRevision:snapshot.controlRevision||0,state:snapshot.state.status==='finished'?'finished':snapshot.paused?'paused':'playing',players,targets,ownerParticipantId:room.ownerId,resumed:this.resumed};
   const signature=JSON.stringify(payload);if(signature===this.last)return;this.last=signature;
   this.queue=this.queue.catch(()=>{}).then(async()=>{for(let attempt=0;attempt<3&&!this.closed;attempt++){try{await this.send(payload);return;}catch{if(attempt<2)await this.delay(1000*(attempt+1));}}});
  }
  close(){this.closed=true;this.unsubscribe?.();this.observer.close();}
 }
 return GamePushEvents;
});
