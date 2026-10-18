/* Portable history cursor. Persistence and transport are supplied by the client. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHistoryController=api;})(globalThis,function(){
 'use strict';
 const revision=value=>Number.isSafeInteger(value)&&value>=0;
 const same=(a,b)=>['sessionId','authorityEpoch','game','packVersion','viewer','role'].every(key=>a?.[key]===b?.[key]);
 function boundaryIndex(index,count,starts,direction,minimum=0){
  const positions=[...new Set([minimum,...(starts||[]).filter(value=>Number.isSafeInteger(value)&&value>=minimum&&value<=count),count])].sort((a,b)=>a-b);
  return direction<0?positions.filter(value=>value<index).at(-1)??minimum:positions.find(value=>value>index)??count;
 }
 class HistoryController {
  static boundaryIndex=boundaryIndex;
  constructor({read,changed=()=>{},reviewed=()=>{}}={}){this.read=read;this.changed=changed;this.reviewed=reviewed;this.live=null;this.open=false;this.index=null;this.requested=null;this.frame=null;this.ticket=0;this.boundary=null;this.visited=false;this.progress={receivedRevision:-1,presentedRevision:-1,reviewedRevision:null};}
  receive(frame){if(!revision(frame?.revision))throw Error('HISTORY_REVISION_INVALID');if(this.live&&!same(frame,this.live))this.reset();this.live=frame;this.progress.receivedRevision=Math.max(this.progress.receivedRevision,frame.revision);}
  get count(){return Math.max(0,(this.live?.historyLength??(this.live?.revision??0)+1)-1);}
  get minimum(){return Math.min(this.count,this.live?.state?.timeline?.playStart??0);}
  get position(){return this.requested??this.index??this.count;}
  markPresented(value){if(!revision(value)||value>this.progress.receivedRevision)throw Error('HISTORY_REVISION_INVALID');this.progress.presentedRevision=Math.max(this.progress.presentedRevision,value);}
  backfill(from,{origin='backfill'}={}){if(origin!=='backfill'||!revision(from)||from<1||from>this.count)return false;this.boundary=from;this.visited=false;this.changed();return true;}
  enter(index=this.count){this.open=true;return this.seek(index);}
  select(index,frame){if(!this.open)return false;const value=Math.max(this.minimum,Math.min(this.count,index));if(!revision(value)||!same(frame,this.live)||frame.revision!==value)throw Error('HISTORY_FRAME_INVALID');this.requested=null;this.index=value;this.frame=frame;this.progress.reviewedRevision=value;if(this.boundary!==null&&value<this.boundary)this.visited=true;if(this.visited&&value>=this.count){this.boundary=null;this.visited=false;}this.reviewed(value,frame);this.changed();return true;}
  async seek(index){if(!this.open||!this.live)return null;const value=Math.max(this.minimum,Math.min(this.count,index));if(!revision(value))throw Error('HISTORY_REVISION_INVALID');const ticket=++this.ticket;this.requested=value;this.changed();try{const frame=await this.read(value);if(ticket!==this.ticket||!this.open)return null;this.select(value,frame);return frame;}catch(error){if(ticket!==this.ticket||!this.open)return null;this.requested=null;this.changed();throw error;}}
  invalidate(){this.ticket++;this.requested=null;}
  close(){this.invalidate();this.open=false;this.index=null;this.frame=null;this.changed();}
  reset(){this.close();this.live=null;this.boundary=null;this.visited=false;this.progress={receivedRevision:-1,presentedRevision:-1,reviewedRevision:null};}
 }
 return HistoryController;
});
