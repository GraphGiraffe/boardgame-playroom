// Persist each event once. Historical frames keep a short presentation tail.
(function(root,factory){
  const api=factory(root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomJournal=api;
})(globalThis,function(Values){
  'use strict';
  const {check,copy,integer}=Values;
  const cursor=events=>events.at(-1)?.id||0;
  function encode(state,base){
    check(Array.isArray(state?.events)&&integer(base,0,Number.MAX_SAFE_INTEGER),'JOURNAL_INVALID');
    const events=state.events.filter(event=>event.id>base);
    check(cursor(state.events)>=base&&events.every((event,index)=>event.id===base+index+1),'JOURNAL_EVENT_GAP');
    return {state:copy({...state,events}),eventBase:base,eventTail:base+events.length};
  }
  function restore(initial,steps,tail){
    const states=copy(initial.states),events=[...states.at(-1).events];
    let previous=cursor(events);
    for(let index=0;index<steps.length;index++){
      const row=steps[index],delta=row.state?.events;
      check(row.eventBase===previous&&Array.isArray(delta)&&
        delta.every((event,offset)=>event.id===previous+offset+1)&&row.eventTail===previous+delta.length,'JOURNAL_EVENT_GAP');
      states[states.length-1]={...states.at(-1),events:states.at(-1).events.slice(-4)};
      for(const event of copy(delta))events.push(event);previous=row.eventTail;
      states.push({...copy(row.state),events:index===steps.length-1?events:events.slice(-4)});
    }
    check(previous===tail,'JOURNAL_TAIL_INVALID');
    return states;
  }
  return Object.freeze({encode,restore,cursor});
});
