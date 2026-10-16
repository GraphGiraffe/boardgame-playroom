if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
/* Shared game-loop presentation policy. A transport supplies a projected snapshot;
   it never changes the input, timing or animation contract. */
(function(root,factory){
  'use strict';
  const api=factory(root.PlayroomPresentationScheduler||(typeof require==='function'?require('../presentation/scheduler.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomGameFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Scheduler){
  'use strict';
  const presets=Object.freeze({
    instant:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.8ccdd302cc82"),duration:0,settle:100,botDelay:220,description:globalThis.PlayroomMessages.text("ui.game-flow.7a9797cec6ab")}),
    fast:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.1827190b896f"),duration:220,settle:80,botDelay:300,description:globalThis.PlayroomMessages.text("ui.game-flow.7eec92696d24")}),
    normal:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.84ab7f7de9c0"),duration:520,settle:160,botDelay:650,description:globalThis.PlayroomMessages.text("ui.game-flow.0378708df51b")}),
    slow:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.6e503025a34b"),duration:1100,settle:650,botDelay:1200,description:globalThis.PlayroomMessages.text("ui.game-flow.f113b5c47975")})
  });
  const speed=value=>Object.hasOwn(presets,value)?value:'normal';
  const quickPlay=options=>!!options?.quickPlay;
  function viewingTime(capabilities,state){
    const value=capabilities?.presentation?.minimumVisibleMs;
    const milliseconds=typeof value==='number'?value:value?.phases?.[state?.data?.phase]??value?.default??0;
    return Number.isFinite(milliseconds)?Math.max(0,Math.min(milliseconds,2000)):0;
  }
  function timing(options={},reduced=false){
    const name=speed(options.animationSpeed),base=presets[name];
    return {...base,mode:name,duration:reduced?0:base.duration};
  }
  // Events in a projected snapshot are the only hints needed for remote
  // presentation; the shared motion engine detects public entities by ID.
  function eventAction(previous,next){
    if(!previous||!next||previous.sessionId!==next.sessionId||previous.authorityEpoch!==next.authorityEpoch||next.revision<=previous.revision)return null;
    const cursor=previous.events?.at(-1)?.id||0;
    const updates=(next.events||[]).filter(event=>Number.isSafeInteger(event?.id)&&event.id>cursor);
    const event=updates.findLast(item=>item.presentation)||updates.findLast(item=>['play','draw','roll','move','attack','defend','capture','take','pass'].includes(item.kind))||updates.at(-1);
    return event?{actor:Number.isInteger(event.player)?event.player:null,action:event.presentation||{type:event.kind},events:updates}:
      {actor:Number.isInteger(previous.state?.turn)?previous.state.turn:null,action:{type:'action'},events:[]};
  }
  class GameFlow {
    constructor({options=()=>({}),motion=null,reducedMotion=()=>false,presentation=()=>({}),clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}={}){
      this.options=options;this.motion=motion;this.reducedMotion=reducedMotion;this.presentation=presentation;this.scheduler=new Scheduler(clock);
    }
    get quickPlay(){return quickPlay(this.options());}
    pace(){return timing(this.options(),this.reducedMotion());}
    capture(context){const pace=this.pace();return pace.duration&&this.motion?.capture?this.motion.capture(context):null;}
    play(snapshot,{draws=[],minimumVisibleMs=this.presentation().minimumVisibleMs||0}={}){
      const pace=this.pace();
      return this.scheduler.play(()=>this.motion?.play(snapshot,{duration:pace.duration,settle:pace.settle,draws}),minimumVisibleMs);
    }
    cancel(){this.scheduler.cancel();this.motion?.cancel?.();}
  }
  return Object.freeze({presets,speed,timing,quickPlay,eventAction,viewingTime,GameFlow});
});
