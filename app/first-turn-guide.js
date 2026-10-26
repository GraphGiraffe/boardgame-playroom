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
 function refresh(){
  if(!current)return hide();
  const {state,guide,progress,active,busy,replay}=current;

  if(!guide||guide.complete||!progress?.started||!progress.ownTurn||progress.done||active===false||replay||document.hidden||skipped(state.game)||!document.querySelector('.table-shell'))return hide();
  const dialog=document.querySelector('dialog[open].card-choice-dialog'),modal=document.querySelector('#modal-root');
  const confirmation=modal?.querySelector('[data-command=confirm-action]');
  if(modal?.children.length&&!confirmation)return hide();
  const scope=dialog||(confirmation?modal:document.querySelector('#app')),steps=confirmation?[{id:'confirm',selector:'[data-command=confirm-action]',text:root.PlayroomMessages.text('ui.app.guide-confirm')}]:guide.steps||[];
  let target,step,index;
  const order=steps.map((_,i)=>i).sort((a,b)=>Number(progress.seen.has(steps[a].id))-Number(progress.seen.has(steps[b].id)));
  for(const i of order){
   const item=steps[i];if(item.available===false||progress.seen.has(item.id)||busy&&!(guide.concurrent&&item.immediate))continue;
   const found=[...scope.querySelectorAll(item.selector)].find(el=>selectable(el)&&visible(el,scope));
   if(found){target=found;step=item;index=i;break;}
  }
  if(!target||!step.immediate&&(pointerHeld||performance.now()<idleUntil))return hide();
  if(!overlay){overlay=document.createElement('div');overlay.className='first-turn-guide';overlay.setAttribute('aria-live','polite');overlay.innerHTML='<span class="guide-tap" aria-hidden="true"></span><svg class="guide-glove" viewBox="0 0 64 80" aria-hidden="true"><path d="M20 70V56L7 41Q2 34 7 30q4-3 9 3l5 6V10q0-8 6-8t6 8v24q3-7 8-4 4 2 3 8 4-7 9-2 3 3 1 10v13q0 10-10 16H25Z" fill="#fffbed" stroke="#31594c" stroke-width="2.5" stroke-linejoin="round"/><path d="M24 69h26v8H24Z" fill="#e0bc59" stroke="#31594c" stroke-width="2.5"/><path d="M33 37v11m11-8v10" fill="none" stroke="#31594c" stroke-width="2" stroke-linecap="round"/></svg><span class="guide-caption"></span>';}
  // Native card-choice dialogs live in the browser top layer; the glove must join it.
  const parent=dialog||document.body;if(overlay.parentNode!==parent)parent.appendChild(overlay);
  const r=target.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
  overlay.hidden=false;overlay.style.left=x+'px';overlay.style.top=y+'px';
  const caption=overlay.querySelector('.guide-caption');if(caption.textContent!==step.text)caption.textContent=step.text;
  overlay.style.setProperty('--caption-x',Math.max(8-x,Math.min(-95,innerWidth-198-x))+'px');
  overlay.classList.toggle('caption-above',y>innerHeight-130);
  if(lastTarget!==target){overlay.classList.remove('is-tapping');void overlay.offsetWidth;overlay.classList.add('is-tapping');lastTarget=target;}
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
  on(document,'click',interaction);on(document,'change',interaction);
  on(document,'scroll',activity);on(document,'visibilitychange',schedule);on(root,'resize',schedule);
 }
 function stop(owner){if(!owner||current?.owner===owner){controller.stop(owner);current=null;learner=null;clearTimeout(idleTimer);idleTimer=null;pointerHeld=false;if(frame)root.cancelAnimationFrame(frame);frame=0;observer?.disconnect();observer=null;listeners?.abort();listeners=null;hide();overlay?.remove();overlay=null;}}
 const api={update,stop,skipped,setSkipped,restart,capture,committed,settings:game=>preferences.read(game),setEnabled:(game,value)=>setSkipped(game,!value)};root.PlayroomFirstTurnGuide=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
