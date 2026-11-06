// Persist each event once. Historical frames keep a short presentation tail.
(function(root,factory){
  const api=factory(root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomJournal=api;
})(globalThis,function(Values){
  'use strict';
  const {check,copy,integer}=Values;
  const cursor=events=>events.at(-1)?.id||0;
  function changes(before,after,path=[],out=[]){
    if(before===after)return out;
    const a=before!==null&&typeof before==='object',b=after!==null&&typeof after==='object';
    const keys=b?Object.keys(after):[],prior=a?Object.keys(before):[];
    if(a&&b&&Array.isArray(before)===Array.isArray(after)&&prior.length===keys.length&&keys.every((key,index)=>prior[index]===key)){
      for(const key of keys)changes(before[key],after[key],[...path,key],out);
    }else out.push({path,value:copy(after)});
    return out;
  }
  function applyDelta(previous,delta){
    check(delta&&delta.base===previous.move&&Array.isArray(delta.changes)&&delta.changes.length<=100000,'JOURNAL_DELTA_INVALID');
    let state=copy(previous);
    for(const change of delta.changes){
      check(change&&Array.isArray(change.path)&&change.path.length<=128&&change.path.every(key=>typeof key==='string'),'JOURNAL_DELTA_INVALID');
      if(!change.path.length){state=copy(change.value);continue;}
      let target=state;
      for(const key of change.path.slice(0,-1)){check(target&&typeof target==='object'&&Object.hasOwn(target,key),'JOURNAL_DELTA_INVALID');target=target[key];}
      const key=change.path.at(-1);check(target&&typeof target==='object'&&Object.hasOwn(target,key),'JOURNAL_DELTA_INVALID');
      Object.defineProperty(target,key,{value:copy(change.value),enumerable:true,writable:true,configurable:true});
    }
    return state;
  }
  function encode(state,base,previous=null){
    check(Array.isArray(state?.events)&&integer(base,0,Number.MAX_SAFE_INTEGER),'JOURNAL_INVALID');
    const events=state.events.filter(event=>event.id>base);
    check(cursor(state.events)>=base&&events.every((event,index)=>event.id===base+index+1),'JOURNAL_EVENT_GAP');
    if(previous){
      check(previous.move+1===state.move,'JOURNAL_DELTA_INVALID');
      const {events:_,...before}=previous,{events:__,...after}=state;
      return {state:{game:state.game,packVersion:state.packVersion,move:state.move,events:copy(events)},delta:{base:previous.move,changes:changes(before,after)},eventBase:base,eventTail:base+events.length};
    }
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
      const position=row.delta?applyDelta(states.at(-1),row.delta):copy(row.state);
      check(position.move===row.state.move&&position.game===row.state.game&&position.packVersion===row.state.packVersion,'JOURNAL_DELTA_INVALID');
      states.push({...position,events:index===steps.length-1?events:events.slice(-4)});
    }
    check(previous===tail,'JOURNAL_TAIL_INVALID');
    return states;
  }
  return Object.freeze({encode,restore,cursor});
});
