// One event-to-transition policy for live play, history and SDK consumers.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomTransition=api;})(globalThis,function(){
'use strict';
  const eventSound={move:'move',play:'move',action:'move',draw:'draw',take:'take',attack:'attack',defend:'defend',capture:'attack.capture',roll:'dice',pass:'pass'};
  const feedbackSound={skip:'attack.skip',pass:'pass',discard:'discard',draw:'draw',take:'take',reverse:'reverse'};
  const fallbackPriority={draw:40,capture:75,roll:30};
  function eventsAfter(events,afterEventId){
    return (events||[]).filter(event=>Number.isSafeInteger(event?.id)&&event.id>afterEventId);
  }
  function eventAction(previous,next){
    if(!previous||!next||previous.sessionId!==next.sessionId||previous.authorityEpoch!==next.authorityEpoch||next.revision<=previous.revision)return null;
    // Authored public plans own their complete transition and field animation.
    // A parallel fallback capture would briefly expose the committed end state.
    const plan=next.state?.scene?.plan;
    if(plan?.groups?.length&&plan.id!==previous.state?.scene?.plan?.id)return null;
    const cursor=previous.events?.at(-1)?.id||0;
    const updates=eventsAfter(next.events,cursor);
    const event=updates.findLast(item=>item.presentation)||updates.find(item=>item.reveal&&Number.isInteger(item.player))||updates.findLast(item=>['play','draw','roll','move','attack','defend','capture','take','pass'].includes(item.kind))||updates.at(-1);
    return event?{actor:Number.isInteger(event.player)?event.player:Number.isInteger(event.actor)?event.actor:null,action:event.presentation||{type:event.kind},events:updates}:
      {actor:Number.isInteger(previous.state?.turn)?previous.state.turn:null,action:{type:'action'},events:[]};
  }
  function soundCues(events,state,viewer,afterEventId){
    const actions=new Map(),explicit=[],authored=new Set();
    for(const e of events){
      if(afterEventId!==undefined&&!(e.id>afterEventId))continue;
      const id=e.kind==='finish'
        ? state.winner==null?'draw-game':viewer<0||viewer>=state.players.length?'notify':(state.winners||[state.winner]).includes(viewer)?'victory':'defeat'
        : e.sound===null?null:e.sound?.id||feedbackSound[e.feedback?.kind]||eventSound[e.kind];
      if(!id)continue;
      const revision=e.revision??e.id;
      const target=e.sound?.target??e.feedback?.player;
      if(e.sound?.id||e.transfer||e.reveal||e.speech||e.feedback||e.presentation||e.kind==='finish'){
        explicit.push({id,eventId:e.id,...(target!=null?{target}:{})});authored.add(revision);continue;
      }
      // Only generic fallback sounds compete. Authored cues keep event order.
      const priority=fallbackPriority[e.kind]??10,previous=actions.get(revision);
      if(!previous||priority>previous.priority)actions.set(revision,{priority,cue:{id,eventId:e.id,...(target!=null?{target}:{})}});
    }
    const cues=[...explicit,...[...actions].filter(([revision])=>!authored.has(revision)).map(([,value])=>value.cue)];
    return cues.sort((a,b)=>a.eventId-b.eventId);
  }
  // The input is the viewer's projected event list, not the authority log.
  function transferCues(events,viewer,afterEventId=0){
    const draws=[];
    for(const event of events){
      if(event.id<=afterEventId)continue;
      const transfer=event.transfer;
      if(!transfer)continue;
      const scope=event.privateTo??transfer.privateTo;
      if(scope!=null&&!(Array.isArray(scope)?scope.includes(viewer):scope===viewer))continue;
      if(Object.hasOwn(transfer,'privateTo')){
        const {privateTo,...draw}=transfer;
        draws.push(draw);
      }else draws.push(transfer);
    }
    return draws;
  }
  function transferEffects(events,viewer,revision,afterEventId){
    return transferCues(events,viewer,afterEventId).map((transfer,index)=>({
      id:`${revision}:draw:${index}`,revision,...transfer
    }));
  }
  return Object.freeze({eventAction,eventsAfter,soundCues,transferCues,transferEffects});
});
