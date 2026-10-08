/* Shared game-loop presentation policy. A transport supplies a projected snapshot;
   it never changes the input, timing or animation contract. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomGameFlow=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const presets=Object.freeze({
    instant:Object.freeze({label:'Мгновенный',duration:0,settle:100,botDelay:220,description:'Без анимаций, с небольшой паузой между действиями.'}),
    fast:Object.freeze({label:'Быстрый',duration:220,settle:80,botDelay:300,description:'Все анимации, короткие перемещения и паузы.'}),
    normal:Object.freeze({label:'Средний',duration:520,settle:160,botDelay:650,description:'Все анимации в спокойном обычном темпе.'}),
    slow:Object.freeze({label:'Медленный',duration:1100,settle:650,botDelay:1200,description:'Плавные перемещения и длинные паузы, чтобы рассмотреть ход.'})
  });
  const speed=value=>Object.hasOwn(presets,value)?value:'normal';
  const quickPlay=options=>!!options?.quickPlay;
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
    const event=updates.findLast(item=>['play','draw','roll','move','attack','defend','capture','take','pass'].includes(item.kind))||updates.at(-1);
    return event?{actor:Number.isInteger(event.player)?event.player:null,action:{type:event.kind},events:updates}:
      {actor:Number.isInteger(previous.state?.turn)?previous.state.turn:null,action:{type:'action'},events:[]};
  }
  class GameFlow {
    constructor({options=()=>({}),motion=null,reducedMotion=()=>false}={}){
      this.options=options;this.motion=motion;this.reducedMotion=reducedMotion;
    }
    get quickPlay(){return quickPlay(this.options());}
    pace(){return timing(this.options(),this.reducedMotion());}
    capture(context){const pace=this.pace();return pace.duration&&this.motion?.capture?this.motion.capture(context):null;}
    play(snapshot,{draws=[]}={}){
      return Promise.resolve(this.motion?.play(snapshot,{duration:this.pace().duration,draws}));
    }
    cancel(){this.motion?.cancel?.();}
  }
  return Object.freeze({presets,speed,timing,quickPlay,eventAction,GameFlow});
});
