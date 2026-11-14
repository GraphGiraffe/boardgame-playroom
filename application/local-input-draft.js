/* Private, revision-fenced input drafts. Only declared batches reach authority. */
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomLocalInputDraft=api;})(globalThis,function(P){
 'use strict';
 return class LocalInputDraft{
  constructor({rules,project,send,changed=()=>{},canSend=()=>true,storage=null,clock={setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:id=>clearTimeout(id)}}){Object.assign(this,{rules,project,send,changed,canSend,storage,clock});this.record=null;this.loaded=null;this.timer=null;this.flight=null;this.closed=false;}
  info(frame){const model=P.projectedModel(frame);if(!model||frame.kind!=='snapshot'||frame.state.status!=='playing')return null;const pack=this.rules(frame),spec=pack.draftSpec(model);if(!spec)return null;if(!['sequence','coalesce'].includes(spec.mode)||!Array.isArray(spec.select)||!Array.isArray(spec.commit)||!Number.isInteger(spec.max??spec.count)||(spec.max??spec.count)<1||(spec.max??spec.count)>16)throw Error('DRAFT_CONTRACT_INVALID');const actor=model.actor,w=model.decisionWindow,own=frame.playerControls?.[actor],id=JSON.stringify([frame.sessionId,frame.authorityEpoch,frame.game,frame.packVersion,frame.viewer,frame.role,actor]),key=P.canonical([id,w?.participants.includes(actor)?[w.id,w.versions[actor]]:frame.revision,own?.away??false,own?.bot??false]);return {frame,model,pack,spec,id,key};}
  stopTimer(){this.clock.clearTimeout(this.timer);this.timer=null;}
  save(){if(this.record)try{this.storage?.save(this.record.id,{key:this.record.key,actions:this.record.actions});}catch{}}
  clear(){this.stopTimer();if(this.record)try{this.storage?.remove(this.record.id);}catch{}this.record=null;}
  valid(info,actions){let model=info.model;for(let i=0;i<actions.length;i++){if(!info.spec.select.includes(actions[i]?.type)||!info.pack.localCommands(model).some(c=>P.canonical(c)===P.canonical(actions[i])))return false;model=info.pack.draftProjection(info.model,actions.slice(0,i+1));}return true;}
  present(frame){
   const info=this.info(frame);if(!info){this.clear();return frame;}
   if(this.record&&this.record.key!==info.key)this.clear();
   if(this.loaded!==info.key){this.loaded=info.key;let stored;try{stored=this.storage?.load(info.id);}catch{}if(stored?.key===info.key&&Array.isArray(stored.actions)&&stored.actions.length<(info.spec.mode==='sequence'?info.spec.count:info.spec.max+1)&&stored.actions.length>0&&this.valid(info,stored.actions))this.record={id:info.id,key:info.key,actions:P.immutable(stored.actions)};}
   if(!this.record)return frame;if(!this.valid(info,this.record.actions)){this.clear();return frame;}
   if(frame.inputAllowed===false)this.stopTimer();else if(info.spec.mode==='coalesce'&&!this.flight&&this.canSend()&&this.timer===null)this.schedule(frame);
   return this.project(frame,info.pack.draftProjection(info.model,this.record.actions));
  }
  schedule(frame){this.stopTimer();const info=this.info(frame);if(!info||info.spec.mode!=='coalesce'||!this.record)return;const ms=info.spec.delayMs;if(!Number.isInteger(ms)||ms<0||ms>250)throw Error('DRAFT_CONTRACT_INVALID');this.timer=this.clock.setTimeout(()=>{this.timer=null;if(!this.closed)void this.flush(frame).catch(()=>{});},ms);}
  action(frame,action){
   const info=this.info(frame);if(!info||frame.inputAllowed===false)return null;
   if(this.record&&this.record.key!==info.key)this.clear();const previous=this.record?.actions||[];
   if(action.type===info.spec.cancel&&previous.length){this.clear();this.changed();return Promise.resolve({ok:true,local:true,draft:true,revision:frame.revision});}
   if(previous.length&&info.spec.commit.includes(action.type)&&(info.spec.mode==='coalesce'||previous.length===info.spec.count-1))return this.flush(frame,action);
   if(!info.spec.select.includes(action.type))return null;
   const next=[...previous];if(info.spec.mode==='coalesce'&&info.spec.toggleKey){const at=next.findIndex(c=>c.type===action.type&&c[info.spec.toggleKey]===action[info.spec.toggleKey]);if(at>=0)next.splice(at,1);else next.push(action);}else next.push(action);
   if(next.length>=(info.spec.mode==='sequence'?info.spec.count:info.spec.max+1))throw Error('DRAFT_LIMIT');
   if(!next.length)this.clear();else{if(!this.valid(info,next))throw Error('DRAFT_ACTION_INVALID');this.record={id:info.id,key:info.key,actions:P.immutable(next)};this.save();if(info.spec.mode==='coalesce')this.schedule(frame);}
   this.changed();return Promise.resolve({ok:true,local:true,draft:true,revision:frame.revision});
  }
  flush(frame,last=null){
   if(this.flight)return this.flight;if(!this.canSend())return Promise.resolve(null);const info=this.info(frame);if(!this.record||!info||this.record.key!==info.key)return Promise.resolve(null);this.stopTimer();
   if(info.spec.mode==='sequence'&&!last)return Promise.resolve(null);
   const token=this.record,actions=[...token.actions,...(last?[last]:[])],command=actions.length===1?actions[0]:{type:'batch',actions};
   this.flight=Promise.resolve(this.send(command)).then(receipt=>{if(receipt.ok&&this.record===token)this.clear();return receipt;}).finally(()=>{this.flight=null;this.changed();});return this.flight;
  }
  close(){this.closed=true;this.stopTimer();}
 };
});
