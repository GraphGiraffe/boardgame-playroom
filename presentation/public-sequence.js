/* Public presentation frames only. Playback has no command/state mutation port. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPublicSequence=api;})(globalThis,function(root){
 const hosts=new WeakMap(),pending=new WeakMap();
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
  let state=hosts.get(host);if(!state){state={id:null,index:0,speed:1,playing:false,timer:null,due:0,node:null};hosts.set(host,state);}
  const node=host.querySelector('[data-public-sequence]');if(!node){clearTimeout(state.timer);state.node=null;state.id=null;pending.delete(host);return;}
  const win=node.ownerDocument.defaultView,frames=[...node.querySelectorAll('[data-public-frame]')],last=frames.length-1,id=node.dataset.publicSequence;
  // DOM patching can reset hidden attributes and scene classes on the same node.
  // Restore the consumed frame on every bind, including after local choice changes.
  clearTimeout(state.timer);const fresh=state.id!==id;state.node=node;state.id=id;
  const mode=node.closest('[data-animation-speed]')?.dataset.animationSpeed||'normal',immediate=mode==='instant'||win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(fresh||state.mode!==mode)state.due=0;state.mode=mode;
  if(fresh){state.index=immediate?last:0;state.playing=state.index<last;}
  if(immediate){state.index=last;state.playing=false;state.due=0;}
  state.index=Math.min(state.index,last);
  const duration=()=>{const base=Math.max(100,Number(frames[state.index]?.dataset.frameDuration)||650),times=root.PlayroomGameFlow?.effectTimes;return (mode==='fast'?Math.round(base*(times?.fast.reveal??180)/(times?.normal.reveal??320)):mode==='slow'?base*(times?.slow.reveal??500)/(times?.normal.reveal??320):base)/state.speed;};
  const draw=(sound=false)=>{
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
   if(sound&&frame.dataset.frameSound)root.PlayroomAppBridge?.audio?.play?.([frame.dataset.frameSound],frame.dataset.framePack);
  };
  const tick=()=>{clearTimeout(state.timer);if(!state.playing||!node.isConnected)return;state.due ||= Date.now()+duration();state.timer=setTimeout(()=>{if(state.node!==node||!node.isConnected)return;if(state.index<last)state.index++;state.due=0;if(state.index===last)state.playing=false;draw(true);tick();},Math.max(0,state.due-Date.now()));};
  const play=node.querySelector('[data-sequence-play]'),speed=node.querySelector('[data-sequence-speed]'),skip=node.querySelector('[data-sequence-skip]');
  if(play)play.onclick=()=>{const replay=state.index===last;if(replay)state.index=0;state.due=0;state.playing=!state.playing;draw(replay);tick();};
  if(speed)speed.onclick=()=>{state.speed=state.speed===1?2:state.speed===2?4:1;state.due=0;node.style.setProperty('--sequence-duration',duration()+'ms');speed.textContent=state.speed+'×';tick();};
  if(skip)skip.onclick=()=>{state.index=last;state.playing=false;state.due=0;clearTimeout(state.timer);draw();};draw(fresh);tick();
 }
 return Object.freeze({bind,defer,prepare});
});
