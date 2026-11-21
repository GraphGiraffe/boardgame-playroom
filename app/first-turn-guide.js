/* Match-long semantic guidance reads public presentation only; never dispatches actions. */
(function(root){
 'use strict';
 let learner=null;
 const preferences=new root.PlayroomGuidePreferences(()=>root.localStorage,()=>learner||root.PlayroomAppBridge?.profile()?.id||'default');
 const controller=new root.PlayroomTutorialController({store:preferences});
 const QUIET_MS=500;
 let current=null,overlay=null,observer=null,frame=0,placement=null,transfer=null,idleTimer=null,idleUntil=0,pointerHeld=false,listeners=null;
 const skipped=game=>preferences.skipped(game);
 function learningChanged(game){root.dispatchEvent(new CustomEvent('playroom:learning',{detail:{game}}));}
 function setSkipped(game,value){preferences.setSkipped(game,value);if(current)update(current);else schedule();learningChanged(game);}
 function restart(game){controller.restart(game);if(current?.state.game===game)update(current);learningChanged(game);}
 function activity(){
  if(!current)return;
  idleUntil=performance.now()+QUIET_MS;
  hide(false);
  if(current.guide?.steps?.some(step=>step.immediate))schedule();
  if(idleTimer===null)idleTimer=setTimeout(afterQuiet,QUIET_MS);
 }
 function afterQuiet(){
  // Repeated pointer moves extend one deadline instead of replacing the timer.
  const remaining=idleUntil-performance.now();
  if(remaining>0){idleTimer=setTimeout(afterQuiet,Math.ceil(remaining));return;}
  idleTimer=null;
  schedule();
 }
 function update(context){
  // The mounted input port owns its selection. Lessons use that selection
  // with the existing authorized frame, even before a command is submitted.
  if(context.readSelection){
   const selected=context.readSelection();
   if(selected!==context.ui.selected)context={...context,ui:{...context.ui,selected}};
  }
  if(current&&(current.owner!==context.owner||current.viewer!==context.viewer||current.learningUserId!==context.learningUserId))hide();
  if(!current||current.owner!==context.owner||current.viewer!==context.viewer||current.state.move!==context.state.move||current.busy!==context.busy){current=context;activity();}
  current=context;learner=context.learningUserId||null;install();
  if(root.PlayroomAppBridge?.gameOptions?.().tutorialsEnabled===false){context.bindTutorial?.(null);controller.stop();hide();return;}
  if(!preferences.read(context.state.game).prompted){
   // Rendering creates new context objects even within the same decision.
   // Keep the offer owned by the learner/seat, and evaluate current readiness.
   const ready=()=>current?.owner===context.owner&&current.viewer===context.viewer&&current.learningUserId===context.learningUserId&&current.state.game===context.state.game&&controller.canOffer(current,root.PlayroomViews.get(current.state.game)?.tutorial)&&!!document.querySelector('.table-shell')&&!document.hidden;
   if(ready())root.PlayroomTutorialSettings?.offer(context.state.game,ready);
   context.bindTutorial?.(null);controller.stop();hide();return;
  }
  const result=controller.update(context,root.PlayroomViews.get(context.state.game)?.tutorial);
  // This controller owns progress and lesson selection. The host renderer
  // only binds the returned step IDs to the current interactive elements.
  const showTargets=!!result&&!result.progress.done&&context.active!==false;
  context.bindTutorial?.(showTargets?result.guide:null,result?.progress.seen);
  if(!result){hide();return;}
  current={...context,...result};schedule();
 }
 function selectionChanged(owner){
  if(!current||current.owner!==owner||!current.readSelection||current.ui.selected===current.readSelection())return false;
  update(current);
  return true;
 }
 function hide(reset=true){
  if(overlay&&!overlay.hidden)overlay.hidden=true;
  transfer?.cancel();transfer=null;
  if(reset)placement=null;
 }
 function schedule(){if(!frame&&root.requestAnimationFrame)frame=root.requestAnimationFrame(()=>{frame=0;refresh();});}
 // A selected choice is not a new action. Toggles (hold/release, follow mode)
 // and commands remain actionable; only passive selection controls are filtered.
 function selectable(el){
  const choice=el?.closest('[data-view-key],[data-select]');
  return !choice||choice.hasAttribute('data-action')||!choice.matches('[aria-pressed="true"],[aria-selected="true"],.selected,.is-selected');
 }
 function visiblePoint(el,scope,viewport){
  if(!el||el.disabled||el.closest('[inert],[hidden],[aria-hidden="true"]'))return null;
  const r=el.getBoundingClientRect(),style=getComputedStyle(el),x=r.x+r.width/2,y=r.y+r.height/2;
  if(!r.width||!r.height||style.visibility==='hidden'||style.display==='none'||x<viewport.left||y<viewport.top||x>viewport.right||y>viewport.bottom)return null;
  const hit=document.elementFromPoint(x,y),control=el.closest('button,[role=button]');
  return hit&&(el.contains(hit)||control?.contains(hit))&&scope.contains(el)?{x,y}:null;
 }
 // Find a user-scrollable route to a clipped target; never move it for them.
 function scrollCue(el,scope,viewport){
  if(!el||el.disabled||!scope.contains(el)||el.closest('[inert],[hidden],[aria-hidden="true"]'))return null;
  const rect=el.getBoundingClientRect(),style=getComputedStyle(el),cx=rect.x+rect.width/2,cy=rect.y+rect.height/2;
  if(!rect.width||!rect.height||style.visibility==='hidden'||style.display==='none')return null;
  const clip={...viewport},parents=[];
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
 // Lesson display and learning must use the same input scope. A suspended
 // confirmation can still be mounted below an unrelated active surface.
 function guideSurface(){
  const dialog=document.querySelector('dialog:modal');
  if(dialog)return dialog.matches('.card-choice-dialog')?{scope:dialog,parent:dialog}:null;
  const modal=document.querySelector('#modal-root'),active=modal?.querySelector(':scope>[data-surface-state="active"]');
  if(modal?.children.length){
   if(active?.querySelector('[data-command=confirm-action]'))return {scope:active,parent:document.body,confirmation:true};
   return null;
  }
  return {scope:document.querySelector('#app'),parent:document.body};
 }
 function refresh(){
  if(!current||root.PlayroomAppBridge?.gameOptions?.().tutorialsEnabled===false)return hide();
  const {state,guide,progress,active,busy,replay}=current;
  const settings=preferences.read(state.game);
  // An unrelated surface can postpone the first offer. Its dismissal must
  // retry without waiting for another move or an app visibility change.
  if(!settings.prompted&&!document.querySelector('#modal-root')?.children.length){update(current);return;}
  if(!guide||guide.complete||!progress?.started||!progress.ownTurn||progress.done||active===false||replay||document.hidden||!settings.enabled)return hide();
  const quiet=!pointerHeld&&performance.now()>=idleUntil;
  // Only an eligible urgent lesson can need geometry during input. Keep the
  // last position for the hand's transfer once the quiet period ends.
  if(!quiet&&!guide.steps?.some(step=>step.immediate&&step.available!==false&&!progress.seen.has(step.id)&&(!busy||guide.concurrent)))return hide(false);
  if(!document.querySelector('.table-shell'))return hide();
  const surface=guideSurface();
  if(!surface?.scope)return hide();
  // Targets and fixed placement use layout coordinates. Constrain the hint
  // to the portion of that coordinate space the player can currently see.
  const visual=root.visualViewport,left=visual?.offsetLeft||0,top=visual?.offsetTop||0;
  const width=visual?.width||innerWidth,height=visual?.height||innerHeight;
  const viewport={left,top,right:left+width,bottom:top+height};
  if(width<=24||height<=24)return hide();
  const {scope,parent,confirmation}=surface,steps=confirmation?[{id:'confirm',selector:'[data-command=confirm-action]',text:root.PlayroomMessages.text('ui.app.guide-confirm')}]:guide.steps||[];
  let anchor,step,cue;
  for(const item of steps){
   if(item.available===false||progress.seen.has(item.id)||busy&&!(guide.concurrent&&item.immediate))continue;
   const candidates=[...scope.querySelectorAll(item.selector)].filter(selectable);
   for(const candidate of candidates){anchor=visiblePoint(candidate,scope,viewport);if(anchor)break;}
   if(!anchor)for(const candidate of candidates){cue=scrollCue(candidate,scope,viewport);if(cue){anchor=cue;break;}}
   if(anchor){step=item;break;}
  }
  if(!anchor)return hide(!busy);
  if(!step.immediate&&!quiet)return hide(false);
  if(!overlay){overlay=document.createElement('div');overlay.className='first-turn-guide';overlay.setAttribute('aria-live','polite');overlay.innerHTML='<span class="guide-tap" aria-hidden="true"></span><svg class="guide-glove" viewBox="0 0 64 80" aria-hidden="true"><path d="M20 70V56L7 41Q2 34 7 30q4-3 9 3l5 6V10q0-8 6-8t6 8v24q3-7 8-4 4 2 3 8 4-7 9-2 3 3 1 10v13q0 10-10 16H25Z" fill="#fffbed" stroke="#31594c" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 69h26v8H24Z" fill="#e0bc59" stroke="#31594c" stroke-width="2.5"/><path d="M33 37v11m11-8v10" fill="none" stroke="#31594c" stroke-width="2" stroke-linecap="round"/></svg><span class="guide-scroll-direction" aria-hidden="true">'+root.TabletopUI.icon('arrow')+'</span><span class="guide-caption"></span>';}
  // Native card-choice dialogs live in the browser top layer; the glove must join it.
  if(overlay.parentNode!==parent)parent.appendChild(overlay);
  const {x,y}=anchor;
  overlay.classList.toggle('is-scroll-cue',!!cue);if(cue)overlay.dataset.scrollDirection=cue.direction;else delete overlay.dataset.scrollDirection;
  overlay.hidden=false;
  root.PlayroomDOM.positionFixed(overlay,{left:x,top:y});
  const text=cue?root.PlayroomMessages.text('ui.app.guide-scroll-'+cue.direction)+' '+step.text:step.text;
  const caption=overlay.querySelector('.guide-caption');if(caption.textContent!==text)caption.textContent=text;
  const captionWidth=Math.min(240,width-24);
  overlay.style.setProperty('--caption-width',captionWidth+'px');
  overlay.style.setProperty('--caption-x',Math.max(viewport.left+12-x,Math.min(-captionWidth/2,viewport.right-12-captionWidth-x))+'px');
  const captionHeight=caption.getBoundingClientRect().height,below=cue?24:66;
  if(captionHeight>height-24)return hide();
  const above=y+below+captionHeight>viewport.bottom-12;
  const captionTop=Math.max(viewport.top+12,Math.min(above?y-24-captionHeight:y+below,viewport.bottom-12-captionHeight));
  overlay.style.setProperty('--caption-y',(captionTop-y)+'px');
  overlay.classList.toggle('is-tapping',!cue);
  // Keep the caption at the actual target. Only the hand follows the previous
  // lesson, within the same surface and fixed coordinate system.
  const fixedLeft=parseFloat(overlay.style.left),fixedTop=parseFloat(overlay.style.top);
  const previous=placement;placement={scope,step:step.id,cue:!!cue,left:fixedLeft,top:fixedTop};
  if(previous?.scope===scope&&previous.step!==step.id&&!cue&&!previous.cue){
   const dx=previous.left-fixedLeft,dy=previous.top-fixedTop;
   const reduced=root.matchMedia('(prefers-reduced-motion: reduce)').matches||document.body.classList.contains('reduced-motion');
   if(!reduced&&Math.hypot(dx,dy)>2){
    transfer?.cancel();
    transfer=overlay.querySelector('.guide-glove').animate([{translate:dx+'px '+dy+'px'},{translate:'0px 0px'}],{duration:160,easing:'ease-out'});
   }
  }
 }
 function interaction(event){
  if(!selectable(event.target))return;
  if(!current?.progress||!current.progress.ownTurn||current.replay||current.active===false||current.progress.done||!event.isTrusted&&event.type!=='change')return;
  const surface=guideSurface();
  if(!surface?.scope?.contains(event.target)||surface.confirmation||event.target.closest?.('[disabled],[inert]'))return;
  const ids=(current.guide?.steps||[]).filter(step=>event.target.closest?.(step.selector)).map(step=>step.id);
  if(ids.length&&controller.interact(ids))update(current);
 }
 const capture=(owner,viewer)=>controller.capture(owner,viewer);
 function committed(owner,viewer,action,token){controller.committed(owner,viewer,action,token);if(current?.owner===owner&&current.viewer===viewer)update(current);}
 function install(){if(observer||!root.document)return;
  listeners=new AbortController();const on=(target,type,fn,options={})=>target.addEventListener(type,fn,{capture:true,...options,signal:listeners.signal});
  observer=new MutationObserver(records=>{if(records.some(r=>!r.target.closest?.('.first-turn-guide')))schedule();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','disabled','inert','aria-hidden','open','data-surface-state','data-sdk-guide-step','aria-pressed','aria-selected']});
  on(document,'pointerdown',()=>{pointerHeld=true;activity();});
  on(document,'pointerup',()=>{pointerHeld=false;activity();});on(document,'pointercancel',()=>{pointerHeld=false;activity();});
  for(const type of ['pointermove','keydown','input','click','change'])on(document,type,activity,{passive:true});
  // Learn local input before document-level network handlers replace controls or open a modal.
  // Game commands are still recorded only by committed() after successful acknowledgement.
  on(root,'click',interaction);on(root,'change',interaction);
  on(document,'scroll',()=>{placement=null;activity();});on(document,'visibilitychange',()=>{pointerHeld=false;hide();schedule();});on(root,'resize',()=>{hide();schedule();});
  if(root.visualViewport){
   const viewportChanged=()=>{placement=null;transfer?.cancel();transfer=null;schedule();};
   on(root.visualViewport,'resize',viewportChanged,{passive:true});
   on(root.visualViewport,'scroll',viewportChanged,{passive:true});
  }
 }
 function stop(owner){if(!owner||current?.owner===owner){controller.stop(owner);current=null;learner=null;clearTimeout(idleTimer);idleTimer=null;pointerHeld=false;if(frame)root.cancelAnimationFrame(frame);frame=0;observer?.disconnect();observer=null;listeners?.abort();listeners=null;hide();overlay?.remove();overlay=null;}}
 const api={update,selectionChanged,stop,skipped,setSkipped,restart,capture,committed,settings:game=>preferences.read(game),setEnabled:(game,value)=>setSkipped(game,!value)};root.PlayroomFirstTurnGuide=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
