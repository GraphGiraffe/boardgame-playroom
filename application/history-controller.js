/* Portable history cursor. Persistence and transport are supplied by the client. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHistoryController=api;})(globalThis,function(){
 'use strict';
 const revision=value=>Number.isSafeInteger(value)&&value>=0;
 const same=(a,b)=>['sessionId','authorityEpoch','game','packVersion','viewer','role'].every(key=>a?.[key]===b?.[key]);
 function planningRevision(before,after){
  const a=before?.scene,b=after?.scene;
  return !!(a?.plan?.id&&a.plan.id===b?.plan?.id&&a.decisionWindow?.id&&a.decisionWindow.id===b?.decisionWindow?.id&&before.status==='playing'&&after.status==='playing'&&(before.events?.at(-1)?.id||0)===(after.events?.at(-1)?.id||0));
 }
 function presentationEnd(states,index,project){
  if(index<1||index>=states.length-1)return index;
  let previous=project(states[index-1]);
  while(index<states.length-1){const frame=project(states[index]);if(!planningRevision(previous,frame))break;previous=frame;index++;}
  return index;
 }
 function boundaryIndex(index,count,starts,direction,minimum=0){
  const positions=[...new Set([minimum,...(starts||[]).filter(value=>Number.isSafeInteger(value)&&value>=minimum&&value<=count),count])].sort((a,b)=>a-b);
  return direction<0?positions.filter(value=>value<index).at(-1)??minimum:positions.find(value=>value>index)??count;
 }
 // A synchronous batch of bot readiness has one visible endpoint in replay.
 function readyBatchEnd(states,index,windowOf){
  const botReady=(before,after)=>{
   if(!before||!after)return false;
   const a=windowOf(before),b=windowOf(after);
   if(!a||!b||a.id!==b.id||a.participants.length<2)return false;
   const added=b.ready.filter(id=>!a.ready.includes(id));
   const changed=a.participants.filter(id=>b.versions?.[id]!==a.versions?.[id]);
   return (added.length>0||changed.length>0)&&a.ready.every(id=>b.ready.includes(id))&&[...added,...changed].every(id=>before.players[id]?.bot);
  };
  if(!botReady(states[index-1],states[index]))return index;
  while(index+1<states.length&&botReady(states[index],states[index+1]))index++;
  return index;
 }
 // Own the cursor timer separately from the plans playing each history step.
 // A paused step keeps its promise and resumes without asking for a new frame.
 class HistoryPlayback {
  constructor({step,changed,error,clock}){this.step=step;this.changed=changed;this.error=error;this.clock=clock;this.run=null;}
  get mode(){return this.run?this.run.paused?'pause':'play':'still';}
  start(delay){
   this.stop();
   const run={paused:false,first:true,remaining:delay,timer:null,stepping:false,waiting:null,wake:null};
   this.run=run;
   this.changed('play');
   this.arm(run);
  }
  pause(){
   const run=this.run;if(!run||run.paused)return;
   run.paused=true;
   if(run.timer!==null){
    this.clock.clearTimeout(run.timer);run.timer=null;
    run.remaining=Math.max(0,run.until-this.clock.now());
   }
   this.changed('pause');
  }
  resume(){
   const run=this.run;if(!run?.paused)return;
   run.paused=false;
   this.changed('play');
   run.wake?.(true);run.wake=null;run.waiting=null;
   if(!run.stepping)this.arm(run);
  }
  stop(){
   const run=this.run;if(!run)return;
   this.run=null;
   if(run.timer!==null)this.clock.clearTimeout(run.timer);
   run.wake?.(false);
   this.changed('still');
  }
  arm(run){
   run.until=this.clock.now()+run.remaining;
   run.timer=this.clock.setTimeout(()=>this.advance(run),run.remaining);
  }
  ready(run){
   if(this.run!==run)return false;
   if(!run.paused)return true;
   return run.waiting??=new Promise(resolve=>{run.wake=resolve;});
  }
  async advance(run){
   if(this.run!==run||run.paused)return;
   run.timer=null;run.stepping=true;
   try{
    const delay=await this.step(()=>this.ready(run),run.first);
    if(this.run!==run)return;
    run.first=false;
    if(delay===null){this.stop();return;}
    run.stepping=false;run.remaining=delay;
    if(!run.paused)this.arm(run);
   }catch(error){
    if(this.run!==run)return;
    this.stop();this.error(error);
   }
  }
 }
 class HistoryController {
  static Playback=HistoryPlayback;
  static readyBatchEnd=readyBatchEnd;
  static boundaryIndex=boundaryIndex;
  static planningRevision=planningRevision;
  static presentationEnd=presentationEnd;
  constructor({read,changed=()=>{},reviewed=()=>{}}={}){this.read=read;this.changed=changed;this.reviewed=reviewed;this.live=null;this.open=false;this.index=null;this.requested=null;this.frame=null;this.ticket=0;this.boundary=null;this.visited=false;this.progress={receivedRevision:-1,presentedRevision:-1,reviewedRevision:null};}
  receive(frame){if(frame?.localDraft)frame=(globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null)).authoritativeFrame(frame);if(frame?.localDraft)return;if(!revision(frame?.revision))throw Error('HISTORY_REVISION_INVALID');if(this.live&&!same(frame,this.live))this.reset();this.live=frame;this.progress.receivedRevision=Math.max(this.progress.receivedRevision,frame.revision);}
  get count(){return Math.max(0,(this.live?.historyLength??(this.live?.revision??0)+1)-1);}
  get minimum(){return Math.min(this.count,this.live?.state?.timeline?.playStart??0);}
  get position(){return this.requested??this.index??this.count;}
  markPresented(value){if(!revision(value)||value>this.progress.receivedRevision)throw Error('HISTORY_REVISION_INVALID');this.progress.presentedRevision=Math.max(this.progress.presentedRevision,value);}
  backfill(from,{origin='backfill'}={}){if(origin!=='backfill'||!revision(from)||from<1||from>this.count)return false;this.boundary=from;this.visited=false;this.changed();return true;}
  enter(index=this.count){this.open=true;return this.seek(index);}
  select(index,frame){if(!this.open)return false;const value=Math.max(this.minimum,Math.min(this.count,index));if(!revision(value)||!same(frame,this.live)||frame.revision!==value)throw Error('HISTORY_FRAME_INVALID');this.requested=null;this.index=value;this.frame=frame;this.progress.reviewedRevision=value;if(this.boundary!==null&&value<this.boundary)this.visited=true;if(this.visited&&value>=this.count){this.boundary=null;this.visited=false;}this.reviewed(value,frame);this.changed();return true;}
  async seek(index,{skip=null,ready=null}={}){if(!this.open||!this.live)return null;let value=Math.max(this.minimum,Math.min(this.count,index));if(!revision(value))throw Error('HISTORY_REVISION_INVALID');const ticket=++this.ticket;this.requested=value;this.changed();try{let frame=await this.read(value);if(ticket!==this.ticket||!this.open)return null;
   if(skip&&value>this.minimum&&value<this.count){let previous=await this.read(value-1);while(value<this.count){if(ticket!==this.ticket||!this.open)return null;if(!same(frame,this.live)||frame.revision!==value||!same(previous,frame)||previous.revision!==value-1)throw Error('HISTORY_FRAME_INVALID');if(!skip(previous,frame))break;previous=frame;frame=await this.read(++value);}}
   if(ready&&!await ready()){if(ticket===this.ticket){this.requested=null;this.changed();}return null;}
   if(ticket!==this.ticket||!this.open)return null;this.select(value,frame);return frame;}catch(error){if(ticket!==this.ticket||!this.open)return null;this.requested=null;this.changed();throw error;}}
  invalidate(){this.ticket++;this.requested=null;}
  close(){this.invalidate();this.open=false;this.index=null;this.frame=null;this.changed();}
  reset(){this.close();this.live=null;this.boundary=null;this.visited=false;this.progress={receivedRevision:-1,presentedRevision:-1,reviewedRevision:null};}
 }
 return HistoryController;
});
