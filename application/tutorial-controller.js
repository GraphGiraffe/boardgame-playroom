/* Semantic tutorial progress. Injected progress store; no direct DOM, platform storage, clocks, gameplay or transport. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomTutorialController=api;})(globalThis,function(){
 'use strict';
 class TutorialController {
  #store;
  constructor({store=null}={}){this.#store=store;}
  #sessions=new WeakMap(); #pending=new Set(); #tokens=new WeakMap(); #current=null;
  #record(owner,viewer){let seats=this.#sessions.get(owner);if(!seats)this.#sessions.set(owner,seats=new Map());if(!seats.has(viewer))seats.set(viewer,{started:false,done:false,phase:null,seen:new Set()});return seats.get(viewer);}
  #snapshot(progress){return Object.freeze({...progress,seen:new Set(progress.seen),checkpoint:progress.checkpoint===undefined?undefined:structuredClone(progress.checkpoint)});}
  restart(game){if(!game)return;if(this.#store)this.#store.reset(game);else this.#pending.add(game);}
  canOffer(context,definition){
   const {viewer,state,actions=[]}=context;
   if(viewer<0||context.replay||context.busy||context.active===false||state.status!=='playing'||state.players[viewer]?.bot||!actions.length)return false;
   const guide=typeof definition==='function'?definition({...context,guideProgress:{seen:[]}}):definition;
   return !!guide&&!guide.complete&&!!(guide.concurrent||state.turn===viewer||state.players.length===1);
  }
  update(context,definition){
   this.#current=null;
   const {owner,viewer,state,actions=[],busy=false,replay=false}=context;
   if(viewer<0||replay||state.players[viewer]?.bot)return null;
   const progress=this.#record(owner,viewer);
   const saved=this.#store?.read(state.game);
   if(saved&&!saved.enabled){progress.epoch=saved.epoch;progress.checkpoint=undefined;return null;}
   if(saved){if(progress.epoch!==saved.epoch||progress.scope!==saved.scope){progress.started=false;progress.done=false;progress.checkpoint=undefined;}progress.epoch=saved.epoch;progress.scope=saved.scope;progress.mastered=saved.mastered;}
   if(this.#pending.has(state.game)&&state.status==='playing'&&!state.players[viewer]?.bot){this.#pending.delete(state.game);Object.assign(progress,{started:false,done:false,phase:null,manual:true,epoch:(progress.epoch||0)+1,checkpoint:undefined});progress.seen.clear();}
   const seen=[...progress.seen];
   const lesson=seen=>definition({...context,guideProgress:{seen,checkpoint:progress.checkpoint}});
   let guide=typeof definition==='function'?lesson(seen):definition;
   if(!guide)return null;
   if(saved){
    const revisions={...(definition?.revisions||{}),...(guide.revisions||{})};for(const step of guide.completion||guide.steps||[])if(step.revision!=null)revisions[step.id]=step.revision;
    const mastered=Object.keys(saved.mastered).filter(id=>saved.mastered[id]===(revisions[id]??1));
    progress.revisions=revisions;
    // A guest can declare dynamic goal revisions. Re-evaluate its lesson
    // only when the saved mastery changes the input it just received.
    if(mastered.length!==seen.length||mastered.some((id,index)=>id!==seen[index])){
     progress.seen=new Set(mastered);
     if(typeof definition==='function')guide=lesson(mastered);
     if(!guide)return null;
    }
   }
   const ownTurn=guide.concurrent||state.turn===viewer||state.players.length===1;
   progress.phase=guide.phase||'turn';progress.ownTurn=ownTurn;
   for(const id of guide.observed||[])progress.seen.add(id);
   if(saved&&guide.observed?.length)this.#save(context,progress,guide.observed);
   progress.checkpoint=guide.checkpoint;
   const urgent=guide.concurrent&&(guide.steps||[]).some(step=>step.immediate&&step.available!==false);
   if((!busy||urgent)&&context.active!==false&&!guide.complete&&!progress.done&&!progress.started&&actions.length&&ownTurn){progress.started=true;progress.move=state.move;progress.turn=guide.turn;}
   const required=guide.required||(guide.steps||[]).map(step=>step.id);
   progress.done=state.status!=='playing'||required.length>0&&required.every(id=>progress.seen.has(id));
   if(progress.done)progress.manual=false;
   this.#current={...context,guide,progress};
   return {guide,progress:this.#snapshot(progress)};
  }
  #save(context,progress,ids){if(this.#store&&ids.length)this.#store.learn(context.state.game,Object.fromEntries(ids.map(id=>[id,progress.revisions?.[id]??1])),progress);}
  interact(ids){const c=this.#current;if(!c||!c.progress.ownTurn||c.active===false||c.busy||c.progress.done)return false;
   let learned=false;
   for(const step of c.guide.steps||[])if(step.available!==false&&ids.includes(step.id)&&!c.progress.seen.has(step.id)&&(step.interaction||!step.actions&&!step.match)){c.progress.seen.add(step.id);this.#save(c,c.progress,[step.id]);learned=true;}
   return learned;
  }
  capture(owner,viewer){
   const c=this.#current;if(c?.owner!==owner||c.viewer!==viewer||!c.progress.ownTurn)return null;
   const progress=c.progress,snapshot=()=>this.#snapshot(progress),token=Object.freeze({get progress(){return snapshot();}});
   this.#tokens.set(token,{owner,viewer,progress,epoch:progress.epoch,steps:c.guide.completion||c.guide.steps||[],context:c,scope:progress.scope});return token;
  }
  committed(owner,viewer,action,token){
   const t=token&&this.#tokens.get(token);if(!t||t.owner!==owner||t.viewer!==viewer||t.progress!==this.#record(owner,viewer)||t.epoch!==t.progress.epoch)return;
   this.#tokens.delete(token);
   const saved=this.#store?.read(t.context.state.game);if(saved&&(!saved.enabled||saved.epoch!==t.epoch||saved.scope!==t.scope))return;
   for(const step of t.steps)if(step.match?step.match(action):step.actions?.includes(action.type)){t.progress.seen.add(step.id);this.#save(t.context,t.progress,[step.id]);}
  }
  stop(owner){if(!owner||this.#current?.owner===owner)this.#current=null;}
 }
 return TutorialController;
});
