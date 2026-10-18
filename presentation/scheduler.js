// Presentation timing has no dependency on a DOM, renderer or transport.
(function(root,factory){
  const Scheduler=factory();
  if(typeof module==='object'&&module.exports)module.exports=Scheduler;
  root.PlayroomPresentationScheduler=Scheduler;
})(globalThis,function(){
  'use strict';
  return class PresentationScheduler {
    #clock; #active=null;
    constructor(clock){
      if(!clock||typeof clock.setTimeout!=='function'||typeof clock.clearTimeout!=='function')throw Error('PRESENTATION_CLOCK_REQUIRED');
      this.#clock=clock;
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
      const run=this.#active;if(!run)return;
      this.#active=null;
      if(run.timer!==null)this.#clock.clearTimeout(run.timer);
      run.finish();run.cancel();
    }
    dispose(){this.cancel();}
  };
});
