// Revision history and staged commits. No engine, storage, clocks or browser globals.
(function(root,factory){
  const api=factory(root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomHistory=api;
})(globalThis,function(Values){
  'use strict';
  const {record,integer,freeze,check}=Values;
  return class History {
    #states; #revision; #validate; #compact; #generation=0; #prepared=new WeakMap();
    constructor(states,{revision=state=>state.revision,validate=()=>true,compact=state=>state}={}){
      check(Array.isArray(states)&&states.length>0&&[revision,validate,compact].every(fn=>typeof fn==='function'),'HISTORY_INVALID');
      this.#revision=revision;this.#validate=validate;this.#compact=compact;
      for(let index=0;index<states.length;index++){
        this.#frame(states[index]);
        check(index===0||revision(states[index])===revision(states[index-1])+1,'HISTORY_REVISION_INVALID');
        freeze(states[index]);
      }
      this.#states=Object.freeze([...states]);
    }
    #frame(state){
      check(record(state)&&integer(this.#revision(state),0,Number.MAX_SAFE_INTEGER)&&this.#validate(state)!==false,'HISTORY_FRAME_INVALID');
    }
    get states(){return this.#states;}
    get current(){return this.#states.at(-1);}
    invalidate(){this.#generation++;}
    prepare(produce){
      check(typeof produce==='function','HISTORY_PRODUCER_INVALID');
      const previous=this.current,generation=this.#generation,next=produce(previous);
      this.#frame(next);
      check(next===previous||this.#revision(next)===this.#revision(previous)+1,'HISTORY_REVISION_INVALID');
      freeze(next);this.#prepared.set(next,{previous,generation});return next;
    }
    commit(next){
      const prepared=record(next)?this.#prepared.get(next):null;
      check(prepared&&prepared.previous===this.current&&prepared.generation===this.#generation,'HISTORY_PREPARED_INVALID');
      if(next!==this.current){
        const previous=this.#compact(this.current);this.#frame(previous);
        check(this.#revision(previous)===this.#revision(this.current),'HISTORY_REVISION_INVALID');
        freeze(previous);
        this.#states=Object.freeze([...this.#states.slice(0,-1),previous,next]);
      }
      this.#prepared.delete(next);return this.current;
    }
  };
});
