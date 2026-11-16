// One event-to-transition policy for live play, history and SDK consumers.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomTransition=api;})(globalThis,function(){
'use strict';
  function eventAction(previous,next){
    if(!previous||!next||previous.sessionId!==next.sessionId||previous.authorityEpoch!==next.authorityEpoch||next.revision<=previous.revision)return null;
    // Authored public plans own their complete transition and field animation.
    // A parallel fallback capture would briefly expose the committed end state.
    const plan=next.state?.scene?.plan;
    if(plan?.groups?.length&&plan.id!==previous.state?.scene?.plan?.id)return null;
    const cursor=previous.events?.at(-1)?.id||0;
    const updates=(next.events||[]).filter(event=>Number.isSafeInteger(event?.id)&&event.id>cursor);
    const event=updates.findLast(item=>item.presentation)||updates.find(item=>item.reveal&&Number.isInteger(item.player))||updates.findLast(item=>['play','draw','roll','move','attack','defend','capture','take','pass'].includes(item.kind))||updates.at(-1);
    return event?{actor:Number.isInteger(event.player)?event.player:Number.isInteger(event.actor)?event.actor:null,action:event.presentation||{type:event.kind},events:updates}:
      {actor:Number.isInteger(previous.state?.turn)?previous.state.turn:null,action:{type:'action'},events:[]};
  }
return Object.freeze({eventAction});
});
