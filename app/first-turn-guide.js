/* Match-long semantic guidance reads public presentation only; never dispatches actions. */
(function(root){
 'use strict';
 let learner=null;
 const preferences=new root.PlayroomGuidePreferences(()=>root.localStorage,()=>learner||root.PlayroomAppBridge?.profile()?.id||'default');
 const controller=new root.PlayroomTutorialController({store:preferences});
 let current=null,overlay=null,observer=null,frame=0,lastTarget=null,idleTimer=null,idleUntil=0,pointerHeld=false,listeners=null;
 const skipped=game=>preferences.skipped(game);
 function setSkipped(game,value){preferences.setSkipped(game,value);if(current)update(current);else schedule();}
 function restart(game){controller.restart(game);if(current?.state.game===game)update(current);}
 function activity(){
  if(!current)return;
  idleUntil=performance.now()+500;hide();if(current.guide?.steps?.some(step=>step.immediate))schedule();
  clearTimeout(idleTimer);idleTimer=setTimeout(()=>{idleTimer=null;schedule();},500);
 }
 function update(context){
  if(!current||current.owner!==context.owner||current.viewer!==context.viewer||current.state.move!==context.state.move||current.busy!==context.busy){current=context;activity();}
  current=context;learner=context.learningUserId||null;install();
  if(root.PlayroomAppBridge?.gameOptions?.().tutorialsEnabled===false){controller.stop();hide();return;}
  if(!preferences.read(context.state.game).prompted){
   const ready=()=>current===context&&controller.canOffer(context,root.PlayroomViews.get(context.state.game)?.tutorial)&&!!document.querySelector('.table-shell')&&!document.hidden;
   if(ready())root.PlayroomTutorialSettings?.offer(context.state.game,ready);
   controller.stop();hide();return;
  }
  const result=controller.update(context,root.PlayroomViews.get(context.state.game)?.tutorial);
  if(!result){hide();return;}
  current={...context,...result};schedule();
 }
 function hide(){if(overlay&&!overlay.hidden)overlay.hidden=true;lastTarget=null;}
 function schedule(){if(!frame&&root.requestAnimationFrame)frame=root.requestAnimationFrame(()=>{frame=0;refresh();});}
 // A selected choice is not a new action. Toggles (hold/release, follow mode)
 // and commands remain actionable; only passive selection controls are filtered.
 function selectable(el){
  const choice=el?.closest('[data-view-key],[data-select]');
  return !choice||choice.hasAttribute('data-action')||!choice.matches('[aria-pressed="true"],[aria-selected="true"],.selected,.is-selected');
 }
 function visible(el,scope){
  if(!el||el.disabled||el.closest('[inert],[hidden],[aria-hidden="true"]'))return false;
  const r=el.getBoundingClientRect(),style=getComputedStyle(el),x=r.x+r.width/2,y=r.y+r.height/2;
  if(!r.width||!r.height||style.visibility==='hidden'||style.display==='none'||x<0||y<0||x>innerWidth||y>innerHeight)return false;
  const hit=document.elementFromPoint(x,y),control=el.closest('button,[role=button]');return !!hit&&(el.contains(hit)||!!control&&control.contains(hit))&&scope.contains(el);
 }
 // Find a user-scrollable route to a clipped target; never move it for them.
 function scrollCue(el,scope){
  if(!el||el.disabled||!scope.contains(el)||el.closest('[inert],[hidden],[aria-hidden="true"]'))return null;
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  if(!rect.width||!rect.height||style.visibility==='hidden'||style.display==='none')return null;
  const clip={left:0,top:0,right:innerWidth,bottom:innerHeight},parents=[];
  for(let node=el.parentElement;node&&scope.contains(node);node=node.parentElement){
   const css=getComputedStyle(node),box=node.getBoundingClientRect();parents.push({node,css});
   if(['auto','scroll','hidden','clip'].includes(css.overflowX)){clip.left=Math.max(clip.left,box.left);clip.right=Math.min(clip.right,box.right);}
   if(['auto','scroll','hidden','clip'].includes(css.overflowY)){clip.top=Math.max(clip.top,box.top);clip.bottom=Math.min(clip.bottom,box.bottom);}
  }
  if(clip.right-clip.left<32||clip.bottom-clip.top<32)return null;
  const dx=cx<clip.left?-1:cx>clip.right?1:0,dy=cy<clip.top?-1:cy>clip.bottom?1:0;
  for(const {node,css} of parents){
   const maxX=node.scrollWidth-node.clientWidth,maxY=node.scrollHeight-node.clientHeight,rtl=css.direction==='rtl';
   const horizontal=dx&&['auto','scroll'].includes(css.overflowX)&&maxX>1&&(rtl?(dx<0?node.scrollLeft>-maxX+1:node.scrollLeft<-1):(dx<0?node.scrollLeft>1:node.scrollLeft<maxX-1));
   const vertical=dy&&['auto','scroll'].includes(css.overflowY)&&maxY>1&&(dy<0?node.scrollTop>1:node.scrollTop<maxY-1);
   if(!horizontal&&!vertical)continue;
   const direction=horizontal?(dx<0?'left':'right'):(dy<0?'up':'down');
   let x=Math.max(clip.left+16,Math.min(cx,clip.right-16)),y=Math.max(clip.top+16,Math.min(cy,clip.bottom-16));
   if(horizontal)x=dx<0?clip.left+16:clip.right-16;else y=dy<0?clip.top+16:clip.bottom-16;
   const hit=document.elementFromPoint(x,y);if(hit&&node.contains(hit))return {direction,x,y};
  }
  return null;
 }
 function refresh(){
  if(!current||root.PlayroomAppBridge?.gameOptions?.().tutorialsEnabled===false)return hide();
  const {state,guide,progress,active,busy,replay}=current;

  if(!guide||guide.complete||!progress?.started||!progress.ownTurn||progress.done||active===false||replay||document.hidden||skipped(state.game)||!document.querySelector('.table-shell'))return hide();
  const dialog=document.querySelector('dialog[open].card-choice-dialog'),modal=document.querySelector('#modal-root');
  const confirmation=modal?.querySelector('[data-command=confirm-action]');
  if(modal?.children.length&&!confirmation)return hide();
  const scope=dialog||(confirmation?modal:document.querySelector('#app')),steps=confirmation?[{id:'confirm',selector:'[data-command=confirm-action]',text:root.PlayroomMessages.text('ui.app.guide-confirm')}]:guide.steps||[];
  let target,step,index,cue;
  const order=steps.map((_,i)=>i).sort((a,b)=>Number(progress.seen.has(steps[a].id))-Number(progress.seen.has(steps[b].id)));
  for(const i of order){
   const item=steps[i];if(item.available===false||progress.seen.has(item.id)||busy&&!(guide.concurrent&&item.immediate))continue;
   const candidates=[...scope.querySelectorAll(item.selector)].filter(selectable),found=candidates.find(el=>visible(el,scope));
   if(found){target=found;step=item;index=i;break;}
   for(const candidate of candidates){const reveal=scrollCue(candidate,scope);if(reveal){target=candidate;cue=reveal;break;}}
   if(target){step=item;index=i;break;}
  }
  if(!target||!step.immediate&&(pointerHeld||performance.now()<idleUntil))return hide();
  if(!overlay){overlay=document.createElement('div');overlay.className='first-turn-guide';overlay.setAttribute('aria-live','polite');overlay.innerHTML='<span class="guide-tap" aria-hidden="true"></span><svg class="guide-glove" viewBox="0 0 64 80" aria-hidden="true"><path d="M20 70V56L7 41Q2 34 7 30q4-3 9 3l5 6V10q0-8 6-8t6 8v24q3-7 8-4 4 2 3 8 4-7 9-2 3 3 1 10v13q0 10-10 16H25Z" fill="#fffbed" stroke="#31594c" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 69h26v8H24Z" fill="#e0bc59" stroke="#31594c" stroke-width="2.5"/><path d="M33 37v11m11-8v10" fill="none" stroke="#31594c" stroke-width="2" stroke-linecap="round"/></svg><span class="guide-scroll-direction" aria-hidden="true">'+root.TabletopUI.icon('arrow')+'</span><span class="guide-caption"></span>';}
  // Native card-choice dialogs live in the browser top layer; the glove must join it.
  const parent=dialog||document.body;if(overlay.parentNode!==parent)parent.appendChild(overlay);
  const r=target.getBoundingClientRect(),x=cue?.x??r.x+r.width/2,y=cue?.y??r.y+r.height/2;
  const changedCue=(overlay.dataset.scrollDirection||'')!==(cue?.direction||'');
  overlay.classList.toggle('is-scroll-cue',!!cue);if(cue)overlay.dataset.scrollDirection=cue.direction;else delete overlay.dataset.scrollDirection;
  overlay.hidden=false;
  root.PlayroomDOM.positionFixed(overlay,{left:x,top:y});
  const text=cue?root.PlayroomMessages.text('ui.app.guide-scroll-'+cue.direction)+' '+step.text:step.text;
  const caption=overlay.querySelector('.guide-caption');if(caption.textContent!==text)caption.textContent=text;
  overlay.style.setProperty('--caption-x',Math.max(8-x,Math.min(-95,innerWidth-198-x))+'px');
  overlay.classList.toggle('caption-above',y>innerHeight-130);
  if(lastTarget!==target||changedCue){overlay.classList.remove('is-tapping');if(!cue){void overlay.offsetWidth;overlay.classList.add('is-tapping');}lastTarget=target;}
  current.target=target;current.step=step;current.stepIndex=index;
 }
 function interaction(event){
  if(!selectable(event.target))return;
  if(!current?.progress||!current.progress.ownTurn||current.replay||current.active===false||current.progress.done||!event.isTrusted&&event.type!=='change')return;
  const ids=(current.guide?.steps||[]).filter(step=>event.target.closest?.(step.selector)&&!event.target.closest('[disabled],[inert]')).map(step=>step.id);
  controller.interact(ids);update(current);
 }
 const capture=(owner,viewer)=>controller.capture(owner,viewer);
 function committed(owner,viewer,action,token){controller.committed(owner,viewer,action,token);if(current?.owner===owner&&current.viewer===viewer)update(current);}
 function install(){if(observer||!root.document)return;
  listeners=new AbortController();const on=(target,type,fn,options={})=>target.addEventListener(type,fn,{capture:true,...options,signal:listeners.signal});
  observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.first-turn-guide')))schedule();});
  observer.observe(document.body,{childList:true,subtree:true});
  on(document,'pointerdown',()=>{pointerHeld=true;activity();});
  on(document,'pointerup',()=>{pointerHeld=false;activity();});on(document,'pointercancel',()=>{pointerHeld=false;activity();});
  for(const type of ['pointermove','keydown','input','click','change'])on(document,type,activity,{passive:true});
  // Learn local input before document-level network handlers replace controls or open a modal.
  // Game commands are still recorded only by committed() after successful acknowledgement.
  on(root,'click',interaction);on(root,'change',interaction);
  on(document,'scroll',activity);on(document,'visibilitychange',schedule);on(root,'resize',schedule);
 }
 function stop(owner){if(!owner||current?.owner===owner){controller.stop(owner);current=null;learner=null;clearTimeout(idleTimer);idleTimer=null;pointerHeld=false;if(frame)root.cancelAnimationFrame(frame);frame=0;observer?.disconnect();observer=null;listeners?.abort();listeners=null;hide();overlay?.remove();overlay=null;}}
 const api={update,stop,skipped,setSkipped,restart,capture,committed,settings:game=>preferences.read(game),setEnabled:(game,value)=>setSkipped(game,!value)};root.PlayroomFirstTurnGuide=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
