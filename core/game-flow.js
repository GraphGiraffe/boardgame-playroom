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
    instant:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.8ccdd302cc82"),duration:0,settle:0,botDelay:80,description:globalThis.PlayroomMessages.text("ui.game-flow.7a9797cec6ab")}),
    fast:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.1827190b896f"),duration:160,settle:30,botDelay:100,description:globalThis.PlayroomMessages.text("ui.game-flow.7eec92696d24")}),
    normal:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.84ab7f7de9c0"),duration:340,settle:80,botDelay:250,description:globalThis.PlayroomMessages.text("ui.game-flow.0378708df51b")}),
    slow:Object.freeze({label:globalThis.PlayroomMessages.text("ui.game-flow.6e503025a34b"),duration:650,settle:180,botDelay:500,description:globalThis.PlayroomMessages.text("ui.game-flow.f113b5c47975")})
  });
  const effectTimes=Object.freeze({instant:Object.freeze({skip:80,reveal:100,speech:300,flip:0,pair:250,diceReveal:250}),fast:Object.freeze({skip:120,reveal:180,speech:450,flip:120,pair:350,diceReveal:450}),normal:Object.freeze({skip:220,reveal:320,speech:700,flip:200,pair:500,diceReveal:700}),slow:Object.freeze({skip:400,reveal:500,speech:1000,flip:300,pair:750,diceReveal:1000})});
  const speed=value=>Object.hasOwn(presets,value)?value:'normal';
  const quickPlay=options=>!!options?.quickPlay;
  function viewingTime(capabilities,state){
    const value=capabilities?.presentation?.minimumVisibleMs;
    const milliseconds=typeof value==='number'?value:value?.phases?.[state?.scene?.phase]??value?.default??0;
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
    // Authored public plans own their complete transition and field animation.
    // A parallel fallback capture would briefly expose the committed end state.
    const plan=next.state?.scene?.plan;
    if(plan?.groups?.length&&plan.id!==previous.state?.scene?.plan?.id)return null;
    const cursor=previous.events?.at(-1)?.id||0;
    const updates=(next.events||[]).filter(event=>Number.isSafeInteger(event?.id)&&event.id>cursor);
    const event=updates.findLast(item=>item.presentation)||updates.find(item=>item.reveal&&Number.isInteger(item.player))||updates.findLast(item=>['play','draw','roll','move','attack','defend','capture','take','pass'].includes(item.kind))||updates.at(-1);
    return event?{actor:Number.isInteger(event.player)?event.player:null,action:event.presentation||{type:event.kind},events:updates}:
      {actor:Number.isInteger(previous.state?.turn)?previous.state.turn:null,action:{type:'action'},events:[]};
  }
  class GameFlow {
    constructor({options=()=>({}),motion=null,reducedMotion=()=>false,presentation=()=>({}),clock=Scheduler.clock,executor=new Scheduler(clock)}={}){
      this.options=options;this.motion=motion;this.reducedMotion=reducedMotion;this.presentation=presentation;this.executor=executor;this.scheduler=this.executor.lane('motion');this.actions=this.executor.lane('action');
    }
    get quickPlay(){return quickPlay(this.options());}
    pace(){return timing(this.options(),this.reducedMotion());}
    capture(context){const pace=this.pace();return pace.duration&&this.motion?.capture?this.motion.capture(context):null;}
    play(snapshot,{draws=[],context,transferOnly=false,minimumVisibleMs=this.presentation().minimumVisibleMs||0}={}){
      const pace=this.pace();
      if(transferOnly&&snapshot)snapshot={...snapshot,transferOnly:true};
      if(context)return this.motion?.play(snapshot,{duration:pace.duration,settle:pace.settle,draws,effects:effectTimes[pace.mode],context});
      return this.scheduler.play(()=>this.motion?.play(snapshot,{duration:pace.duration,settle:pace.settle,draws,effects:effectTimes[pace.mode]}),Math.min(minimumVisibleMs,effectTimes[pace.mode].reveal));
    }
    // The plan owns reading, movement and reveal time. This lane only owns
    // cancellation of the enclosing UI action, never a competing effect clock.
    present(effect){return this.actions.play(effect);}
    cancelAction(){this.actions.cancel();this.scheduler.cancel();this.motion?.cancel?.();}
    cancel(){this.executor.cancel();this.motion?.cancel?.();}
  }
  const turnHandoff=Object.freeze({outgoingScale:.96,incomingScale:1.07,duration:260});
  return Object.freeze({turnHandoff,presets,effectTimes,speed,timing,quickPlay,eventAction,viewingTime,GameFlow});
});
