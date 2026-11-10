/* Browser ports for the portable connection and private input drafts. */
(function(root,factory){const api=factory(root.PlayroomClientConnectionService||(typeof require==='function'?require('../application/client-connection-service.js'):null),root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSessionClient=api;})(globalThis,function(Service,root){
 let sequence=0;const idFactory=()=>root.crypto?.randomUUID?.()||'client-'+Date.now()+'-'+(++sequence),P=root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);
 const projection=()=>root.PlayroomNetworkProjection||(typeof require==='function'?require('../presentation/network-projection.js'):null);
 return class SessionClient extends Service{
  constructor(transport,options={}){
   const {draftStorage,draftClock,...connection}=options;
   super(transport,{idFactory,restoreFrame:frame=>projection().restore(frame,(event,snapshot)=>root.TabletopCore.get(snapshot.game,snapshot.packVersion).presentEvent(event,snapshot.state.players)),...connection});
   const Draft=root.PlayroomLocalInputDraft||(typeof require==='function'?require('../application/local-input-draft.js'):null),Store=root.PlayroomInputDraftStore||(typeof require==='function'?require('../platform/web/input-draft-store.js'):null);
   this.drafts=new Draft({rules:frame=>root.TabletopCore.get(frame.game,frame.packVersion),project:(frame,model)=>projection().draft(frame,model,root.TabletopCore.get(frame.game,frame.packVersion)),send:command=>super.send(command),changed:()=>this.renderDraft(),canSend:()=>!this.pending&&!this.inFlight,storage:draftStorage??Store.create(),...(draftClock?{clock:draftClock}:{})});
   if(this.confirmedFrame)this.renderDraft();
  }
  presentSnapshot(frame){return this.drafts?.present(frame)||frame;}
  renderDraft(){if(this.closed||!this.confirmedFrame)return;this.snapshot=this.presentSnapshot(this.confirmedFrame);for(const listener of this.listeners)listener(this.snapshot);}
  async send(action){
   if(this.closed||!this.snapshot||this.pending||this.inFlight)return super.send(action);
   const command=P.command(this.snapshot,action,'local-input').action;
   if(command.type==='session-pause')this.drafts.stopTimer();
   const local=this.drafts.action(this.confirmedFrame,command);return local||super.send(command);
  }
  canRebase(frame,action){
   if(action?.type!=='batch')return super.canRebase(frame,action);
   const model=P.projectedModel(frame);if(!model||!Array.isArray(action.actions)||action.actions.length<1||action.actions.length>16)return false;
   try{const pack=root.TabletopCore.get(frame.game,frame.packVersion);let current=model;for(let i=0;i<action.actions.length;i++){if(!pack.localCommands(current).some(c=>P.canonical(c)===P.canonical(action.actions[i])))return false;if(i<action.actions.length-1)current=pack.draftProjection(model,action.actions.slice(0,i+1));}return true;}catch{return false;}
  }
  flushLocalDraft(){return this.drafts.flush(this.confirmedFrame);}
  get localDraft(){return this.drafts?.record?.actions||[];}
  close(){this.drafts?.close();return super.close();}
 };
});
