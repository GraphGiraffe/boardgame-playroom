/* Host-only activity metadata. One in-flight request and one latest state. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomGamePushEvents=api;})(globalThis,function(){
 'use strict';
 class GamePushEvents{
  constructor({authority,room,access,send,resumed=false,delay=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
   Object.assign(this,{authority,room,access,send,resumed,delay});this.closed=false;this.last='';this.pending=null;this.running=false;this.queue=Promise.resolve();this.controller=new AbortController();
   this.unsubscribe=authority.subscribeActivity(()=>this.update());this.update();
  }
  update(){
   if(this.closed)return;const room=this.room();if(!room||room.phase!=='playing'||room.transportMode!=='online')return;
   const activity=this.authority.activity(),players=[],targets=[];
   for(const person of room.participants.filter(p=>!p.bot&&p.role==='player')){
    let access;try{access=this.access.resolve(room,person.id);}catch{continue;}
    players.push(person.id);if(activity.targets.includes(access.viewer))targets.push(person.id);
   }
   const payload={sessionId:activity.sessionId,revision:activity.revision,controlRevision:activity.controlRevision,state:activity.state,players,targets,ownerParticipantId:room.ownerId,resumed:this.resumed};
   const {revision,controlRevision,...semantic}=payload,signature=JSON.stringify(semantic);if(signature===this.last)return;this.last=signature;this.pending=payload;
   this.startDrain();
  }
  startDrain(){if(this.running||this.closed||!this.pending)return;this.running=true;this.queue=this.drain().finally(()=>{this.running=false;this.startDrain();});}
  async drain(){
   while(!this.closed&&this.pending){
    const payload=this.pending;this.pending=null;
    let delivered=false;
    for(let attempt=0;attempt<3&&!this.closed;attempt++){
     if(this.pending)break;
     try{await this.send(payload,{signal:this.controller.signal});delivered=true;break;}
     catch(error){if(this.closed||this.pending)break;if(attempt<2)await this.delay(1000*(attempt+1));}
    }
    if(!delivered&&!this.closed&&!this.pending)this.last='';
   }
  }
  close(){if(this.closed)return;this.closed=true;this.pending=null;this.controller.abort();this.unsubscribe?.();}
 }
 return GamePushEvents;
});
