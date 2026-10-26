/* Learning settings UI. Progress and persistence belong to their own modules. */
(function(root){
 'use strict';let offering=null,queued=false;
 const text=key=>root.PlayroomMessages.text('ui.app.learning.'+key),guide=()=>root.PlayroomFirstTurnGuide;
 function markup(game){const H=root.PlayroomGameScreen;if(!game)return '';
  return `<section class="settings-learning"><div class="settings-guide-row"><label class="switch"><span>${text('show')}</span><input type="checkbox" id="setting-learning-enabled" data-game="${H.esc(game)}" ${guide().settings(game).enabled?'checked':''}></label>${H.iconButton(`data-learning-list="${H.esc(game)}"`,text('list'),'rules')}${H.iconButton(`data-restart-guides="${H.esc(game)}"`,text('restart'),'reset')}</div></section>`;
 }
 function offer(game,isCurrent=()=>false){
  if(offering&&!queued&&!document.querySelector('.learning-intro'))offering=null;
  const bridge=root.PlayroomAppBridge;if(!bridge||guide().settings(game).prompted||offering)return;
  offering=game;queued=true;
  queueMicrotask(()=>{queued=false;if(offering!==game)return;if(!isCurrent()){offering=null;return;}
   // Do not replace unrelated dialogs; a later render will offer again.
   const modal=document.querySelector('#modal-root');if(modal?.children.length){offering=null;return;}
   const H=root.PlayroomGameScreen;
   bridge.openModal(`${bridge.modalHead(text('title'))}<p class="lead">${text('intro')}</p><div class="modal-foot">${H.button({attrs:`data-learning-choice="no" data-game="${H.esc(game)}"`,label:text('no'),variant:'secondary'})}${H.button({attrs:`data-learning-choice="yes" data-game="${H.esc(game)}"`,label:text('yes')})}</div>`,'learning-intro');
   // Closing without an explicit choice keeps the enabled default.
  });
 }
 function showList(game){
  const H=root.PlayroomGameScreen,bridge=root.PlayroomAppBridge,goals=root.PlayroomViews.get(game)?.tutorial?.goals||[],saved=guide().settings(game);
  const learned=goal=>saved.mastered[goal.id]===(goal.revision||1),complete=goals.length>0&&goals.every(learned);
  bridge.openModal(`${bridge.modalHead(text('list'))}<ul class="learning-goals">${goals.map(goal=>`<li><input type="checkbox" disabled ${learned(goal)?'checked':''} aria-label="${H.esc(goal.text)}"><span>${H.esc(goal.text)}</span></li>`).join('')}</ul>${complete?`<p class="learning-complete" role="status">${H.icon('check')} ${text('complete')}</p>`:''}`,'learning-list');
 }
 async function restart(game){if(await root.PlayroomGameScreen.confirmDialog(text('reset-confirm'))){guide().restart(game);const box=document.querySelector('#setting-learning-enabled');if(box?.dataset.game===game)box.checked=true;}}
 document.addEventListener('click',event=>{const list=event.target.closest('[data-learning-list]');if(list){showList(list.dataset.learningList);return;}const choice=event.target.closest('[data-learning-choice]');if(choice){guide().setEnabled(choice.dataset.game,choice.dataset.learningChoice==='yes');offering=null;root.PlayroomAppBridge.closeModal();return;}
  if(offering&&event.target.closest('[data-command="close-modal"]')&&document.querySelector('.learning-intro')){guide().setEnabled(offering,true);offering=null;}
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&offering&&document.querySelector('.learning-intro')){guide().setEnabled(offering,true);offering=null;}},true);
 root.PlayroomTutorialSettings=Object.freeze({markup,offer,restart});
})(globalThis);
