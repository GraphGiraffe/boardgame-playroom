/* One screen lifecycle for local, remote and archive clients. No DOM or rules. */
(function(root,factory){const api=factory(root.PlayroomHistoryController||(typeof require==='function'?require('./history-controller.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomGameScreenController=api;})(globalThis,function(HistoryController){
 'use strict';
 function planningUpdate(before,next){
  const a=before?.state?.scene,b=next?.state?.scene;
  return !!(a?.plan?.id&&a.plan.id===b?.plan?.id&&a.decisionWindow?.id&&a.decisionWindow.id===b?.decisionWindow?.id&&
   ['sessionId','authorityEpoch','viewer','role','game','packVersion','controlRevision','playerControlRevision'].every(key=>before[key]===next[key])&&
   before.state.status==='playing'&&next.state.status==='playing'&&!before.paused&&!next.paused&&
   (before.events?.at(-1)?.id||0)===(next.events?.at(-1)?.id||0)&&
   !(next.effects?.length||next.cues?.length||before.reactionWindow||next.reactionWindow||before.reactionWindows?.length||next.reactionWindows?.length));
 }
 class GameScreenController {
  static planningUpdate(before,next){return planningUpdate(before,next);}
  constructor({client=null,present=async()=>{},changed=()=>{},report=()=>{},visible=()=>true,clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}={}){
   this.client=client;this.present=present;this.changed=changed;this.report=report;this.visible=visible;this.clock=clock;this.shown=client?.snapshot||null;this.selection=null;this.viewState={};this.identity=null;this.queue=[];this.draining=false;this.intake=Promise.resolve();this.epoch=0;this.closed=false;this.queued=this.shown?.revision??-1;this.operation=null;
   this.history=new HistoryController({read:index=>this.client.history(index)});if(this.shown)this.history.receive(this.shown);
  }
  send(action,context){if(this.closed)throw Error('SCREEN_CLOSED');return this.client.send(action,context);}
  get busy(){return this.draining||!!this.queue.length||!!this.operation;}
  get frame(){return this.history.open&&this.history.frame?this.history.frame:this.shown;}
  get current(){return !this.history.open&&!this.busy&&this.shown?.revision===this.client?.snapshot?.revision;}
  preferences(base){return this.history.open?{...base,...this.historyPreferences}:base;}
  setPreference(key,value){if(!this.history.open)return false;this.historyPreferences={...this.historyPreferences,[key]:value};return true;}
  context(frame,{scope='turn',identity=frame.sessionId}={}){
   const reviewing=this.history.open;
   if(reviewing!==!!this.reviewing){
    if(reviewing){this.liveView={identity:this.identity,viewState:this.viewState};this.identity=null;this.viewState={};this.historyPreferences={};}
    else{this.identity=this.liveView?.identity??null;this.viewState=this.liveView?.viewState||{};this.liveView=null;this.historyPreferences={};}
    this.reviewing=reviewing;
   }
   const key=[identity,frame.game,frame.packVersion,frame.viewer,...(scope==='match'||reviewing?[]:[frame.state.turn])].join(':');
   if(scope==='match'&&!reviewing){
    const match=[identity,frame.game,frame.packVersion].join(':');
    if(this.matchIdentity!==match){this.matchIdentity=match;this.matchViews=new Map();}
    this.identity=key;this.viewState=this.matchViews.get(key)||{};this.matchViews.set(key,this.viewState);
   }else if(this.identity!==key){this.identity=key;this.viewState={};}
   const hand=frame.state.scene?.players.find(person=>person.player===frame.viewer)?.hand;if(this.selection!==null&&hand&&!hand.some(card=>card.id===this.selection))this.selection=null;
   return {selected:this.selection,viewState:this.viewState};
  }
  render(frame,renderer,options={}){this.history.receive(frame);return renderer(frame,this.context(frame,options));}
  sync(frame=this.client?.snapshot){this.cancel();this.shown=frame;this.queued=frame?.revision??-1;if(frame)this.history.receive(frame);this.changed(frame);}
  enqueue(frame){if(this.closed)return Promise.resolve();if(frame===this.lastQueuedFrame)return this.intake;const previous=this.lastQueuedFrame||this.shown;this.lastQueuedFrame=frame;this.history.receive(frame);const epoch=this.epoch;
   this.intake=this.intake.then(async()=>{if(this.closed||epoch!==this.epoch||this.history.open||frame.revision<this.queued)return;
    // Readiness revisions inside one decision window have no public transition.
    // Their durable history remains available for explicit review; fetching every
    // private intermediate projection here would block the current animation.
    const coalesced=previous?.revision===this.queued&&planningUpdate(previous,frame);
    for(let index=coalesced?frame.revision:this.queued+1;index<frame.revision;index++){
     const item=await this.client.history(index);if(this.closed||epoch!==this.epoch||this.history.open)return;
     if(item?.kind!=='history'||item.revision!==index||!['sessionId','authorityEpoch','viewer','role','game','packVersion'].every(key=>item[key]===frame[key]))throw Error('HISTORY_FRAME_INVALID');
     this.queue.push({...frame,...item,kind:'snapshot',actions:[],historyLength:frame.historyLength});this.queued=index;
    }
    this.queue.push(frame);this.queued=frame.revision;void this.drain();
   }).catch(error=>{if(!this.closed&&epoch===this.epoch){this.report(error);this.sync();}});return this.intake;
  }
  async drain(){if(this.draining||this.closed||this.history.open)return;this.draining=true;const epoch=this.epoch;
   try{while(this.queue.length&&epoch===this.epoch&&!this.closed&&!this.history.open){const next=this.queue.shift(),before=this.shown;await this.present(before,next,{show:()=>{this.shown=next;},current:()=>epoch===this.epoch&&!this.closed});if(epoch!==this.epoch)return;if(this.visible())this.history.markPresented(next.revision);}}
   catch(error){if(epoch===this.epoch)this.report(error);}
   finally{if(epoch===this.epoch){this.draining=false;this.changed(this.shown);}}
  }
  // The same presentation lifecycle is usable by synchronous local commits.
  transition({capture=()=>null,render=()=>{},play=async()=>{},finish=()=>{},settle=0,context={}}={}){
   this.cancelTransition();const token={...context,timer:null,cancelled:false};this.operation=token;
   const shot=capture();render(token);
   const complete=()=>{
    if(this.operation!==token||token.cancelled||this.closed)return;
    this.operation=null;
    try{finish(token);}catch(error){this.report(error);}
   };
   Promise.resolve().then(()=>play(shot)).catch(error=>{if(!token.cancelled)this.report(error);}).then(()=>{
    if(token.cancelled||this.closed)return;
    // The effects have already settled. Only an authored delay owns a timer.
    if(settle>0)token.timer=this.clock.setTimeout(complete,settle);
    else complete();
   });return token;
  }
  cancelTransition(){const token=this.operation;if(!token)return;token.cancelled=true;if(token.timer!==null)this.clock.clearTimeout(token.timer);this.operation=null;}
  cancel(){this.epoch++;this.lastQueuedFrame=null;this.queue=[];this.draining=false;this.queued=this.client?.snapshot?.revision??this.shown?.revision??-1;this.cancelTransition();}
  dispose(){this.closed=true;this.cancel();this.history.close();this.selection=null;this.viewState={};this.matchViews?.clear();}
 }
 return GameScreenController;
});
