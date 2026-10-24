/* Public presentation frames only. Playback has no command/state mutation port. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPublicSequence=api;})(globalThis,function(root){
 const Scheduler=root.PlayroomPresentationScheduler||(typeof require==='function'?require('./scheduler.js'):null);
 const hosts=new WeakMap(),pending=new WeakMap(),executors=new WeakMap();
 function useExecutor(host,executor){
  if(executors.get(host)===executor)return;
  hosts.get(host)?.player.cancel();hosts.delete(host);pending.delete(host);executors.set(host,executor);
 }
 function defer(host,callback){if(!host.querySelector('.app-game-layout.is-public-playback'))return false;let queue=pending.get(host);if(!queue){queue=new Set();pending.set(host,queue);}queue.add(callback);return true;}
 function paintPlayers(scene,frame){
  const players=frame?.querySelector('[data-sequence-players]')?.content;
  if(players&&scene)for(const panel of scene.querySelectorAll('.player-panel[data-player-index]')){
   const source=players.querySelector(`[data-player-index="${panel.dataset.playerIndex}"]`);if(!source)continue;
   const next=source.cloneNode(true);
   root.PlayroomGameScreen?.reservePlayerHand(next,panel.querySelector('.player-hand')?.offsetHeight||0);
   if(root.PlayroomDOM?.patchChildren)root.PlayroomDOM.patchChildren(panel,next);
   else panel.replaceChildren(...next.childNodes);
   for(const cls of ['is-ready','is-inactive','is-turn'])panel.classList.toggle(cls,source.classList.contains(cls));
   for(const attr of ['data-hand-count','aria-current','data-public-feedback']){if(source.hasAttribute(attr))panel.setAttribute(attr,source.getAttribute(attr));else panel.removeAttribute(attr);}
   panel.style.setProperty('--mini-hand-count',source.style.getPropertyValue('--mini-hand-count'));
  }
 }
 // Patch the current frame directly; briefly hiding/re-showing it restarts CSS effects.
 function prepare(host,next){
  const state=hosts.get(host),node=next.querySelector('[data-public-sequence]');
  if(!state||!node||state.id!==node.dataset.publicSequence)return;
  const frames=[...node.querySelectorAll('[data-public-frame]')],index=Math.min(state.index,frames.length-1),scene=node.closest('.app-game-layout');
  frames.forEach((frame,i)=>{frame.hidden=i!==index;});
  scene?.classList.toggle('is-public-playback',index<frames.length-1);paintPlayers(scene,frames[index]);
  const duration=state.node?.style.getPropertyValue('--sequence-duration');if(duration){node.style.setProperty('--sequence-duration',duration);scene?.style.setProperty('--sequence-duration',duration);}
 }
 function bind(host){
  let state=hosts.get(host);if(!state){state={player:(executors.get(host)||new Scheduler()).track('public-sequence'),id:null,index:0,speed:1,playing:false,node:null,replay:0};hosts.set(host,state);}
  const node=host.querySelector('[data-public-sequence]');if(!node){state.player.cancel();if(state.node)state.replay++;state.node=null;state.id=null;pending.delete(host);return;}
  const win=node.ownerDocument.defaultView,frames=[...node.querySelectorAll('[data-public-frame]')],last=frames.length-1,id=node.dataset.publicSequence;
  const plan=JSON.parse(node.dataset.presentationPlan);
  if(plan.id!==id||plan.final!==last||plan.initial!==0||plan.groups.length!==last)throw Error('PUBLIC_PLAN_INVALID');
  // DOM patching can reset hidden attributes and scene classes on the same node.
  // Restore the consumed frame on every bind, including after local choice changes.
  const fresh=state.id!==id;state.node=node;state.id=id;
  const mode=node.closest('[data-animation-speed]')?.dataset.animationSpeed||'normal',immediate=mode==='instant'||win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.mode=mode;
  if(fresh){state.index=immediate?last:0;state.playing=state.index<last;}
  if(immediate){state.index=last;state.playing=false;}
  state.index=Math.min(state.index,last);
  // CSS keeps semantic duration. The plan clock applies rate/pause to its animations.
  const duration=()=>Math.max(100,Number(frames[state.index]?.dataset.frameDuration)||650);
  const joinEffects=()=>{
   if(!state.context?.current())return [];
   const frame=frames[state.index],scene=node.closest('.app-game-layout');
   const targets=[frame,...scene.querySelectorAll('.player-panel[data-public-feedback]')],pending=[];
   for(const target of targets)for(const animation of target.getAnimations({subtree:true})){
    // Decorative infinite highlights have their own accessibility policy.
    if(Number.isFinite(animation.effect.getTiming().iterations)){state.context.animation(animation);pending.push(animation.finished.catch(()=>{}));}
   }
   return pending;
  };
  const draw=()=>{
   if(!node.isConnected)return;
   frames.forEach((f,i)=>{f.hidden=i!==state.index;});
   const frame=frames[state.index],scene=node.closest('.app-game-layout');
   scene?.classList.toggle('is-public-playback',state.index<last);
   node.style.setProperty('--sequence-duration',duration()+'ms');scene?.style.setProperty('--sequence-duration',duration()+'ms');
   paintPlayers(scene,frame);
   const label=node.querySelector('[data-sequence-label]'),play=node.querySelector('[data-sequence-play]'),speed=node.querySelector('[data-sequence-speed]');
   if(label)label.textContent=frame.dataset.frameLabel;
   if(play)play.textContent=state.playing?'Ⅱ':'▶';
   if(speed)speed.textContent=state.speed+'×';
   if(state.index===last){const queue=pending.get(host);pending.delete(host);queue?.forEach(callback=>callback());}
   state.frameEffects=joinEffects();
  };
  // Rebinding replaces only render ports. The plan keeps its cue cursor and clock.
  const rate=()=>state.speed*(mode==='fast'?(root.PlayroomGameFlow?.effectTimes.normal.reveal||320)/(root.PlayroomGameFlow?.effectTimes.fast.reveal||180):mode==='slow'?(root.PlayroomGameFlow?.effectTimes.normal.reveal||320)/(root.PlayroomGameFlow?.effectTimes.slow.reveal||500):1);
  const start=()=>{
   state.player.setRate(rate());
   state.player.play({...plan,id:id+':'+state.replay,groups:immediate?[]:plan.groups.map((group,index)=>({...group,cues:[...group.cues,{id:'frame-effects:'+index,kind:'frame-effects'}]}))},{
    initial:index=>{state.index=immediate?last:index;draw();},
    group:(_index,group,context)=>{state.context=context;state.index=group.scene;state.playing=true;draw();},
    effect:(cue,context)=>{if(cue.kind!=='frame-effects')return;const frame=frames[state.index],audio=root.PlayroomAppBridge?.audio;
     const sound=frame.dataset.frameSound?(audio?.batch?audio.batch([frame.dataset.frameSound],frame.dataset.framePack,context):audio?.play?.([frame.dataset.frameSound],frame.dataset.framePack)):null;
     return Promise.all([...(state.frameEffects||[]),sound]);
    },
    final:()=>{state.index=last;state.playing=false;draw();},
    cancel:()=>{pending.delete(host);state.index=last;state.playing=false;draw();}
   });
   if(immediate)state.player.skip();
  };
  const play=node.querySelector('[data-sequence-play]'),speed=node.querySelector('[data-sequence-speed]'),skip=node.querySelector('[data-sequence-skip]');
  if(play)play.onclick=()=>{
   if(state.index===last){state.replay++;start();}
   else if(state.playing){state.player.pause();state.playing=false;}
   else {state.playing=true;state.player.resume();}
   draw();
  };
  if(speed)speed.onclick=()=>{state.speed=state.speed===1?2:state.speed===2?4:1;state.player.setRate(rate());draw();};
  if(skip)skip.onclick=()=>state.player.skip();
  start();draw();

 }
 return Object.freeze({bind,defer,prepare,useExecutor});
});
