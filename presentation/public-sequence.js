/* Public presentation frames only. Playback has no command/state mutation port. */
(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPublicSequence=api;})(globalThis,function(root){
 const Scheduler=root.PlayroomPresentationScheduler||(typeof require==='function'?require('./scheduler.js'):null);
 const hosts=new WeakMap(),pending=new WeakMap(),executors=new WeakMap(),modes=new WeakMap(),sources=new WeakMap(),sourceSets=new WeakMap();
 function useSources(host,value){sources.set(host,value||new Map());}
 function setMode(host,mode){modes.set(host,mode);const state=hosts.get(host);if(mode==='pause'){state?.player.pause();if(state)state.playing=false;}else if(mode==='play')state?.player.resume();}
 function whenIdle(host){return hosts.get(host)?.player.whenIdle()||Promise.resolve();}
 function playing(host){const state=hosts.get(host);return !!state&&state.index<(state.last??0);}
 function releaseDisplay(state){state?.preparing?.cancel();if(state)state.preparing=null;state?.releaseDisplay?.();if(state){state.releaseDisplay=null;state.display=null;}}
 function ownDisplay(state,node){
  const display=node.querySelector('[data-public-display]');if(display===state.display)return;
  releaseDisplay(state);state.display=display;if(display)state.releaseDisplay=root.PlayroomDOM?.manageChildren(display);
 }
 function useExecutor(host,executor){
  if(executors.get(host)===executor)return;
  hosts.get(host)?.player.cancel();releaseDisplay(hosts.get(host));hosts.delete(host);pending.delete(host);executors.set(host,executor);
 }
 function defer(host,callback){if(!host.querySelector('.app-game-layout.is-public-playback'))return false;let queue=pending.get(host);if(!queue){queue=new Set();pending.set(host,queue);}queue.add(callback);return true;}
 const frameBanks=new WeakMap();
 function frameSet(node,host){
  if(node.hasAttribute('data-public-frame-source')){
   const source=sources.get(host)?.get(node.dataset.publicFrameSource);if(!source||source.id!==node.dataset.publicSequence)throw Error('PUBLIC_FRAME_SOURCE_INVALID');
   let set=sourceSets.get(source);if(!set){set={lazy:true,source,templates:new Map(),errors:new Map(),frames:Array.from({length:source.count},()=>({dataset:{}}))};sourceSets.set(source,set);}return set;
  }
  const bank=node.querySelector('[data-public-frame-bank]');if(!bank)return {frames:[...node.querySelectorAll('[data-public-frame]')],lazy:false};
  const raw=bank.content.textContent;let data=frameBanks.get(bank);if(data?.raw===raw)return data;
  const records=JSON.parse(raw);if(!Array.isArray(records)||!records.length||records.length>33||records.some(r=>typeof r.markup!=='string'))throw Error('PUBLIC_FRAMES_INVALID');
  data={raw,records,lazy:true,frames:records.map(r=>({dataset:{frameDuration:String(r.duration||650),frameLabel:r.label||'',frameProgress:r.progress||'',frameSound:r.sound||'',framePack:r.pack||''}}))};frameBanks.set(bank,data);return data;
 }
 const recordFragments=new WeakMap();
 function frameRecord(set,index){
  const raw=set.source?set.source.read(index):set.records[index];let record=raw;
  if(!raw.fragments?.size){record=recordFragments.get(raw);if(!record){record={...raw,...root.PlayroomDOM.keyedFragments(raw.markup)};recordFragments.set(raw,record);}}
  if(set.source)set.frames[index].dataset={frameLabel:record.label||'',frameProgress:record.progress||'',frameSound:record.sound||'',framePack:record.pack||''};
  return record;
 }
 function frameTemplate(node,set,index){
  if(set.errors?.has(index))throw set.errors.get(index);
  const record=frameRecord(set,index),display=node.querySelector('[data-public-display]'),base=display?._publicPrepared;let prepared=set.templates?.get(index);
  if(prepared?.record===record&&prepared.base===base)return prepared;
  const parsed=root.PlayroomDOM.fragmentTemplate(node.ownerDocument,'<div>'+record.markup+'</div>',record.fragments,base);
  prepared={record,base,...parsed};
  if(set.templates){set.templates.set(index,prepared);if(set.templates.size>2)set.templates.delete(set.templates.keys().next().value);}return prepared;
 }
 function prepareNext(state,node,set){
  if(!set.source||state.index>=state.last)return;
  const index=state.index+1;if(state.preparing?.set===set&&state.preparing.index===index)return;
  state.preparing?.cancel();const win=node.ownerDocument.defaultView,job={set,index,cancel:()=>{}};state.preparing=job;
  const work=()=>{if(state.preparing!==job)return;state.preparing=null;if(state.node===node&&node.isConnected&&state.index+1===index){try{frameTemplate(node,set,index);}catch(error){set.errors.set(index,error);}}};
  if(win.requestIdleCallback){const id=win.requestIdleCallback(work,{timeout:100});job.cancel=()=>win.cancelIdleCallback(id);}
  else{const id=win.setTimeout(work,0);job.cancel=()=>win.clearTimeout(id);}
 }
 function paintFrame(node,set,index,{live=false}={}){
  if(!set.lazy)return set.frames[index];
  const record=frameRecord(set,index),display=node.querySelector('[data-public-display]'),key=record.markup+'\0'+(record.players||'');
  // Fragment markup can change while its small outer skeleton stays equal.
  const prior=display._publicPrepared,regions=record.fragments,changed=regions&&(regions.size!==prior?.entries.size||[...regions].some(([id,source])=>prior.entries.get(id)?.source!==source));
  if(display._publicFrameKey!==key||changed){const prepared=frameTemplate(node,set,index),tree=prepared.template.content.firstElementChild;
   if(live&&root.PlayroomDOM?.patchChildren)root.PlayroomDOM.patchChildren(display,tree,display._publicFrameTree,null,prepared.resolve);
   else{prepared.commit();display.replaceChildren(...tree.cloneNode(true).childNodes);}
   prepared.commit();prepared.base=null;display._publicPrepared=prepared;display._publicFrameTree=tree;display._publicFrameKey=key;
   // Retained authored roots moved to this baseline; the old cached template
   // must not be reused during rewind.
   for(const [i,value]of set.templates||[])if(value===prior)set.templates.delete(i);
  }
  const players=record.players||'';if(set.playersMarkup!==players){set.playersMarkup=players;set.playersTemplate=node.ownerDocument.createElement('template');set.playersTemplate.innerHTML=players;}
  display._publicPlayers=set.playersTemplate.content;
  display._publicPlayersMarkup=record.players||'';
  display.dataset.publicFrame=String(index);for(const [key,value]of Object.entries(set.frames[index].dataset))display.dataset[key]=value;
  return display;
 }
 function paintPlayers(scene,frame){
  if(frame?._publicPlayersMarkup!==undefined&&scene?._publicPlayersMarkup===frame._publicPlayersMarkup)return;
  const players=frame?._publicPlayers||frame?.querySelector('[data-sequence-players]')?.content;
  const updates=players&&scene?[...scene.querySelectorAll('.player-panel[data-player-index]')].map(panel=>({panel,source:players.querySelector(`[data-player-index="${panel.dataset.playerIndex}"]`),height:panel.querySelector('.player-hand')?.offsetHeight||0})):[];
  for(const {panel,source,height}of updates){
   if(!source)continue;
   const next=source.cloneNode(true);
   root.PlayroomGameScreen?.reservePlayerHand(next,height);
   if(root.PlayroomDOM?.patchChildren)root.PlayroomDOM.patchChildren(panel,next,panel._publicPlayerTree);
   else panel.replaceChildren(...next.childNodes);
   panel._publicPlayerTree=next;
   for(const cls of ['is-ready','is-inactive','is-turn'])panel.classList.toggle(cls,source.classList.contains(cls));
   for(const attr of ['data-hand-count','aria-current','data-public-feedback']){if(source.hasAttribute(attr))panel.setAttribute(attr,source.getAttribute(attr));else panel.removeAttribute(attr);}
   panel.style.setProperty('--mini-hand-count',source.style.getPropertyValue('--mini-hand-count'));
  }
  if(scene&&frame?._publicPlayersMarkup!==undefined)scene._publicPlayersMarkup=frame._publicPlayersMarkup;
 }
 // Patch the current frame directly; briefly hiding/re-showing it restarts CSS effects.
 function prepare(host,next){
  const state=hosts.get(host),node=next.querySelector('[data-public-sequence]');
  if(!node)return;
  const same=state?.id===node.dataset.publicSequence,set=frameSet(node,host),frames=set.frames,index=same?Math.min(state.index,frames.length-1):0,scene=node.closest('.app-game-layout');
  if(!set.lazy)frames.forEach((frame,i)=>{frame.hidden=i!==index;});
  scene?.classList.toggle('is-public-playback',index<frames.length-1);
  if(set.source&&same){
   // The mounted display is runtime-owned. Rebuilding its off-DOM duplicate
   // on every local rotation would parse/clone the full SVG board twice.
   const record=frameRecord(set,index),players=record.players||'';
   if(set.sourcePlayersMarkup!==players){set.sourcePlayersMarkup=players;set.sourcePlayersTemplate=node.ownerDocument.createElement('template');set.sourcePlayersTemplate.innerHTML=players?'<template data-sequence-players>'+players+'</template>':'';set.sourcePlayersTemplate.content._publicPlayersMarkup=players;}
   paintPlayers(scene,set.sourcePlayersTemplate.content);
  }else paintPlayers(scene,paintFrame(node,set,index));
  const duration=same&&state.node?.style.getPropertyValue('--sequence-duration');if(duration){node.style.setProperty('--sequence-duration',duration);scene?.style.setProperty('--sequence-duration',duration);}
 }
 function bind(host){
  let state=hosts.get(host);if(!state){state={player:(executors.get(host)||new Scheduler()).track('public-sequence'),id:null,index:0,speed:1,playing:false,node:null,replay:0};hosts.set(host,state);}
  const node=host.querySelector('[data-public-sequence]');if(!node){state.player.cancel();releaseDisplay(state);if(state.node)state.replay++;state.node=null;state.id=null;pending.delete(host);return;}
  const win=node.ownerDocument.defaultView,set=frameSet(node,host),frames=set.frames,last=frames.length-1,id=node.dataset.publicSequence;
  const plan=JSON.parse(node.dataset.presentationPlan);
  if(plan.id!==id||plan.final!==last||plan.initial!==0||plan.groups.length!==last)throw Error('PUBLIC_PLAN_INVALID');
  ownDisplay(state,node);
  // DOM patching can reset hidden attributes and scene classes on the same node.
  // Restore the consumed frame on every bind, including after local choice changes.
  const playback=modes.get(host)||'live',scope=playback==='live'?'live':'history',restoring=state.scope==='history'&&scope==='live';
  const fresh=state.id!==id||state.scope!==scope;state.node=node;state.id=id;state.scope=scope;state.last=last;
  const mode=node.closest('[data-animation-speed]')?.dataset.animationSpeed||'normal',immediate=playback==='still'||restoring||mode==='instant'||win.matchMedia('(prefers-reduced-motion: reduce)').matches;
  state.mode=mode;
  if(fresh){state.index=immediate?last:0;state.playing=state.index<last;}
  if(immediate){state.index=last;state.playing=false;}
  state.index=Math.min(state.index,last);
  // CSS keeps semantic duration. The plan clock applies rate/pause to its animations.
  const duration=()=>Math.max(100,Number(plan.groups[state.index]?.duration??frames[state.index]?.dataset.frameDuration)||650);
  const joinEffects=(restart=false)=>{
   if(!state.context?.current())return [];
   const frame=set.lazy?node.querySelector('[data-public-display]'):frames[state.index],scene=node.closest('.app-game-layout');
   const targets=[frame,...scene.querySelectorAll('.player-panel[data-public-feedback]')],pending=[];
   for(const target of targets)for(const animation of target.getAnimations({subtree:true})){
    // Decorative infinite highlights have their own accessibility policy.
    if(Number.isFinite(animation.effect.getTiming().iterations)){
     // Measure animations only after both the field and player patches are done.
     if(set.lazy&&restart&&target===frame&&animation.playState==='finished'){animation.currentTime=0;animation.play();}
     state.context.animation(animation);pending.push(animation.finished.catch(()=>{}));
    }
   }
   return pending;
  };
  const draw=()=>{
   if(!node.isConnected)return;
   if(!set.lazy)frames.forEach((f,i)=>{f.hidden=i!==state.index;});
   const restart=state.drawnIndex!==state.index,current=paintFrame(node,set,state.index,{live:true}),frame=frames[state.index],scene=node.closest('.app-game-layout');state.drawnIndex=state.index;
   scene?.classList.toggle('is-public-playback',state.index<last);
   node.style.setProperty('--sequence-duration',duration()+'ms');scene?.style.setProperty('--sequence-duration',duration()+'ms');
   paintPlayers(scene,current);
   const progress=host.querySelector('.turn-extra');if(progress&&frame.dataset.frameProgress)progress.textContent=frame.dataset.frameProgress;
   const label=node.querySelector('[data-sequence-label]'),play=node.querySelector('[data-sequence-play]'),speed=node.querySelector('[data-sequence-speed]');
   if(label)label.textContent=frame.dataset.frameLabel;
   if(play)play.textContent=state.playing?'Ⅱ':'▶';
   if(speed)speed.textContent=state.speed+'×';
   if(state.index===last){const queue=pending.get(host);pending.delete(host);queue?.forEach(callback=>callback());}
   state.frameEffects=joinEffects(restart);
   prepareNext(state,node,set);
  };
  // Rebinding replaces only render ports. The plan keeps its cue cursor and clock.
  const rate=()=>state.speed*(mode==='fast'?(root.PlayroomGameFlow?.effectTimes.normal.reveal||320)/(root.PlayroomGameFlow?.effectTimes.fast.reveal||180):mode==='slow'?(root.PlayroomGameFlow?.effectTimes.normal.reveal||320)/(root.PlayroomGameFlow?.effectTimes.slow.reveal||500):1);
  const start=()=>{
   state.player.setRate(rate());
   state.player.play({...plan,id:scope+':'+id+':'+state.replay,groups:immediate?[]:plan.groups.map((group,index)=>({...group,cues:[...group.cues,{id:'frame-effects:'+index,kind:'frame-effects'}]}))},{
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
  if(playback==='pause'){state.player.pause();state.playing=false;}else{start();if(playback==='play')state.player.resume();}draw();

 }
 return Object.freeze({bind,defer,prepare,useExecutor,useSources,setMode,whenIdle,playing});
});
