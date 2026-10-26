// Ordered groups of simultaneous public cues. No DOM, authority or command port.
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomPlanPlayer=api;
})(globalThis,function(){
  'use strict';
  function serializable(value,ancestors=new Set()){
    if(value===undefined||value===null||typeof value==='string'||typeof value==='boolean')return;
    if(typeof value==='number'&&Number.isFinite(value))return;
    if(typeof value!=='object'||ancestors.has(value)||(!Array.isArray(value)&&Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null))throw Error('PRESENTATION_DATA_INVALID');
    ancestors.add(value);for(const item of Object.values(value))serializable(item,ancestors);ancestors.delete(value);
  }
  function validate(plan){
    serializable(plan);
    if(!plan||typeof plan.id!=='string'||!plan.id||!Array.isArray(plan.groups))throw Error('PRESENTATION_PLAN_INVALID');
    if(plan.scenes!==undefined){
      if(!Array.isArray(plan.scenes)||![plan.initial,plan.final].every(index=>Number.isInteger(index)&&index>=0&&index<plan.scenes.length))throw Error('PRESENTATION_SCENE_INVALID');
    }
    const ids=new Set();
    for(const group of plan.groups){
      if(!group||!Array.isArray(group.cues)||!Number.isFinite(group.duration)||group.duration<0||group.duration>60000)throw Error('PRESENTATION_GROUP_INVALID');
      if(plan.scenes!==undefined&&(!Number.isInteger(group.scene)||group.scene<0||group.scene>=plan.scenes.length))throw Error('PRESENTATION_SCENE_INVALID');
      for(const cue of group.cues){
        if(!cue||typeof cue.id!=='string'||!cue.id||ids.has(cue.id)||typeof cue.kind!=='string'||!cue.kind)throw Error('PRESENTATION_CUE_INVALID');
        if(cue.kind==='delay'&&(!Number.isFinite(cue.duration)||cue.duration<0||cue.duration>60000))throw Error('PRESENTATION_DELAY_INVALID');
        if(cue.target!==undefined){
          const t=cue.target,keys=t&&Object.keys(t);
          if(!keys||keys.length!==1||!(typeof t.zone==='string'&&t.zone||Number.isInteger(t.participant)&&t.participant>=0||
            t.entity&&Object.keys(t.entity).length===2&&typeof t.entity.namespace==='string'&&t.entity.namespace&&typeof t.entity.id==='string'&&t.entity.id))throw Error('PRESENTATION_TARGET_INVALID');
        }
        ids.add(cue.id);
      }
    }
    return plan;
  }
  // Platform effects join the plan lifetime; descriptors remain plain data.
  function effectContext(player,run){
    const handles=new Set(),animations=new WeakSet(),abort=new AbortController();
    const context={
      current:()=>player.current(run),
      signal:abort.signal,
      animation(animation){
        if(!player.current(run)){animation.cancel();return animation;}
        if(animations.has(animation))return animation;animations.add(animation);
        const handle={pause:()=>animation.pause(),resume:()=>animation.play(),rate:value=>{animation.playbackRate=value;},cancel:()=>animation.cancel()};
        handles.add(handle);handle.rate(player.rate);if(run.paused)handle.pause();
        animation.finished.then(()=>handles.delete(handle),()=>handles.delete(handle));
        return animation;
      },
      cleanup(effect){
        const handle={pause(){},resume(){},rate(){},cancel:effect};
        if(player.current(run))handles.add(handle);else effect();
        return ()=>handles.delete(handle);
      },
      schedule(effect,delay){
        let token=null,remaining=delay,started=0;
        const stop=()=>{if(token===null)return;player.scheduler.unschedule(token);token=null;remaining=Math.max(0,remaining-(player.scheduler.now()-started)*player.rate);};
        const arm=()=>{if(!player.current(run)||run.paused)return;started=player.scheduler.now();token=player.scheduler.schedule(()=>{token=null;handles.delete(handle);if(player.current(run))effect();},Math.ceil(remaining/player.rate));};
        const handle={pause:stop,resume:arm,rate:()=>{},cancel:()=>{stop();handles.delete(handle);}};
        if(player.current(run)){handles.add(handle);arm();}return handle;
      },
      unschedule:handle=>handle?.cancel(),
      pause:()=>{for(const handle of handles)handle.pause();},
      resume:()=>{for(const handle of handles)handle.resume();},
      rate:value=>{for(const handle of handles)handle.rate(value);},
      cancel:()=>{abort.abort();for(const handle of [...handles])handle.cancel();handles.clear();}
    };
    return context;
  }
  return class PlanPlayer {
    static validate=validate;
    constructor(scheduler){this.scheduler=scheduler;this.run=null;this.rate=1;}
    play(plan,ports={}){
      validate(plan);
      if(this.run?.plan.id===plan.id&&!this.run.cancelled){if(!this.run.done)this.run.ports=ports;return this.run.promise;}
      this.cancel();
      let resolve;
      const run={plan,ports,index:-1,paused:false,done:false,timer:null,remaining:0,started:0,waiting:false,effectsDone:false,resolve:null,promise:new Promise(r=>resolve=r)};
      run.resolve=resolve;this.run=run;run.context=effectContext(this,run);
      try{ports.initial?.(plan.initial);this.advance(run);}catch(error){this.fail(run,error);}
      return run.promise;
    }
    current(run){return this.run===run&&!run.done;}
    advance(run){
      if(!this.current(run)||run.paused)return;
      if(++run.index===run.plan.groups.length){this.finish(run,'complete');return;}
      const group=run.plan.groups[run.index];run.effectsDone=false;run.waiting=true;run.remaining=group.duration;
      try{
        const ready=run.ports.group?.(run.index,group,run.context);
        const start=()=>{
        if(!this.current(run))return;
        const effects=group.cues.map(cue=>cue.kind==='delay'?new Promise(resolve=>{run.context.schedule(resolve,cue.duration);}):run.ports.effect?.(cue,run.context));
        const pending=effects.filter(effect=>effect&&typeof effect.then==='function');
        run.effectsDone=pending.length===0;
        this.arm(run);
        if(pending.length)Promise.all(pending).then(()=>{if(this.current(run)){run.effectsDone=true;this.next(run);}},error=>this.fail(run,error));
        };
        if(ready&&typeof ready.then==='function'){run.preparing=true;Promise.resolve(ready).then(()=>{run.preparing=false;if(!this.current(run))return;if(run.paused)run.prepared=start;else start();}).catch(error=>this.fail(run,error));}
        else start();
      }catch(error){this.fail(run,error);}
    }
    arm(run){
      if(!this.current(run)||run.paused||run.preparing||!run.waiting)return;
      if(!run.remaining){run.waiting=false;this.next(run);return;}
      run.started=this.scheduler.now();
      run.timer=this.scheduler.schedule(()=>{run.timer=null;run.remaining=0;run.waiting=false;this.next(run);},Math.ceil(run.remaining/this.rate));
    }
    next(run){if(this.current(run)&&!run.paused&&!run.waiting&&run.effectsDone)this.advance(run);}
    stopTimer(run){
      if(run.timer===null)return;
      this.scheduler.unschedule(run.timer);run.timer=null;
      run.remaining=Math.max(0,run.remaining-(this.scheduler.now()-run.started)*this.rate);
    }
    pause(){const run=this.run;if(!run||run.done||run.paused)return;this.stopTimer(run);run.context.pause();run.paused=true;}
    resume(){const run=this.run;if(!run||run.done||!run.paused)return;run.paused=false;run.context.resume();if(run.prepared){const start=run.prepared;run.prepared=null;start();}else{this.arm(run);this.next(run);}}
    setRate(rate){
      if(!Number.isFinite(rate)||rate<=0||rate>16)throw Error('PRESENTATION_RATE_INVALID');
      const run=this.run;if(run&&!run.done){this.stopTimer(run);run.context.pause();}this.rate=rate;
      if(run&&!run.done){run.context.rate(rate);if(!run.paused)run.context.resume();this.arm(run);}
    }
    finish(run,status){
      if(!this.current(run))return;
      this.stopTimer(run);run.done=true;run.context.cancel();
      try{run.ports.final?.(run.plan.final,status);}catch(error){run.ports.error?.(error);}
      finally{run.resolve({status});this.release(run);}
    }
    fail(run,error){
      if(!this.current(run))return;
      try{run.ports.error?.(error);}finally{this.finish(run,'failed');}
    }
    skip(){if(this.run)this.finish(this.run,'skipped');}
    cancel(){
      const run=this.run;if(!run||run.done)return;
      this.stopTimer(run);run.done=true;run.context.cancel();run.cancelled=true;
      try{run.ports.cancel?.();}finally{run.resolve({status:'cancelled'});this.release(run);}
    }
    release(run){
      // Retain only the completion receipt for idempotent replay checks.
      run.plan={id:run.plan.id};run.ports={};run.context=null;run.prepared=null;run.resolve=null;
    }
    whenIdle(){return this.run?.promise||Promise.resolve({status:'idle'});}
  };
});
