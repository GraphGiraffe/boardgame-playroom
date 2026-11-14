// Presentation timing has no dependency on a DOM, renderer or transport.
(function(root,factory){
  const Scheduler=factory(root.PlayroomPlanPlayer||(typeof require==='function'?require('./plan-player.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=Scheduler;
  root.PlayroomPresentationScheduler=Scheduler;
})(globalThis,function(PlanPlayer){
  'use strict';
  const browserClock=Object.freeze({
    setTimeout:(fn,ms)=>globalThis.setTimeout(fn,ms),
    clearTimeout:id=>globalThis.clearTimeout(id),
    now:()=>globalThis.performance?.now?.()??Date.now()
  });
  let diagnosticSequence=0;
  return class PresentationScheduler {
    static clock=browserClock;
    #children=new Map(); #scheduled=new Map(); #plans=new Map();
    #clock; #active=null; #diagnostics;
    constructor(clock=browserClock,{diagnostics=null}={}){
      if(!clock||typeof clock.setTimeout!=='function'||typeof clock.clearTimeout!=='function')throw Error('PRESENTATION_CLOCK_REQUIRED');
      this.#clock=clock;this.#diagnostics=diagnostics;
    }
    now(){return this.#clock.now?.()??browserClock.now();}
    metrics(){const out={scheduled:this.#scheduled.size,activeRuns:this.#active?1:0,planTracks:this.#plans.size,lanes:this.#children.size};for(const child of this.#children.values()){const item=child.metrics();for(const key of Object.keys(out))out[key]+=item[key];}return out;}
    lane(name){
      if(typeof name!=='string'||!name)throw Error('PRESENTATION_LANE_INVALID');
      if(!this.#children.has(name))this.#children.set(name,new PresentationScheduler(this.#clock,{diagnostics:this.#diagnostics}));
      return this.#children.get(name);
    }
    track(name){
      if(!this.#plans.has(name))this.#plans.set(name,new PlanPlayer(this.lane('plan:'+name)));
      return this.#plans.get(name);
    }
    schedule(effect,delay=0){
      if(typeof effect!=='function'||!Number.isFinite(delay)||delay<0||delay>60000)throw Error('PRESENTATION_DELAY_INVALID');
      const token=this.#diagnostics?.enabled?{diagnosticId:++diagnosticSequence,armedAt:this.now(),delay}:{};
      if(token.diagnosticId)this.#diagnostics.record('timer.arm',{scope:'presentation',id:token.diagnosticId,delay,queued:this.#scheduled.size+1});
      const timer=this.#clock.setTimeout(()=>{if(!this.#scheduled.has(token))return;this.#scheduled.delete(token);if(token.diagnosticId)this.#diagnostics.record('timer.fire',{scope:'presentation',id:token.diagnosticId,delay,actualDelay:this.now()-token.armedAt,late:Math.max(0,this.now()-token.armedAt-delay),queued:this.#scheduled.size});effect();},delay);
      this.#scheduled.set(token,timer);return token;
    }
    unschedule(token){
      if(!this.#scheduled.has(token))return;
      this.#clock.clearTimeout(this.#scheduled.get(token));this.#scheduled.delete(token);if(token.diagnosticId)this.#diagnostics.record('timer.cancel',{scope:'presentation',id:token.diagnosticId,elapsed:this.now()-token.armedAt,queued:this.#scheduled.size});
    }
    play(effect,minimumVisibleMs=0){
      this.cancel();
      if(!Number.isFinite(minimumVisibleMs)||minimumVisibleMs<0||minimumVisibleMs>60000)throw Error('PRESENTATION_DELAY_INVALID');
      const run={timer:null,finish:()=>{},cancel:()=>{},promise:null};
      const cancelled=new Promise(resolve=>{run.cancel=resolve;});
      const wait=new Promise(resolve=>{
        run.finish=resolve;
        if(minimumVisibleMs)run.timer=this.#clock.setTimeout(resolve,minimumVisibleMs);
        else resolve();
      });
      this.#active=run;
      let animation;
      try{animation=effect();}catch(error){this.cancel();throw error;}
      run.promise=Promise.race([Promise.all([Promise.resolve(animation),wait]),cancelled]).finally(()=>{
        if(run.timer!==null)this.#clock.clearTimeout(run.timer);
        if(this.#active===run)this.#active=null;
      });
      return run.promise;
    }
    whenIdle(){return this.#active?.promise||Promise.resolve();}
    cancel(){
      for(const plan of this.#plans.values())plan.cancel();
      for(const child of this.#children.values())child.cancel();
      for(const token of this.#scheduled.keys())this.unschedule(token);
      const run=this.#active;if(!run)return;
      this.#active=null;
      if(run.timer!==null)this.#clock.clearTimeout(run.timer);
      run.finish();run.cancel();
    }
    dispose(){this.cancel();}
  };
});
