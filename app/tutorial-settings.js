/* Learning settings UI. Progress and persistence belong to their own modules. */
(function(root){
 'use strict';let offering=null,dialogs=null;
 const text=key=>root.PlayroomMessages.text('ui.app.learning.'+key),guide=()=>root.PlayroomFirstTurnGuide;
 const registry=()=>dialogs||=new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});
 function markup(game){const H=root.PlayroomGameScreen;if(!game)return '';const globalOff=root.PlayroomAppBridge?.gameOptions?.().tutorialsEnabled===false;
  return `<section class="settings-learning"><div class="settings-guide-row"><label class="setting-title" for="setting-learning-enabled"><span class="setting-title-text" style="white-space:normal">${text('show')}</span>${root.PlayroomLobbyView.fieldHelp(text('help'),text('show'))}</label>${H.iconButton(`data-restart-guides="${H.esc(game)}"`,text('restart'),'reset',{className:'ui-action-danger'})}${H.iconButton(`data-learning-list="${H.esc(game)}"`,text('list'),'rules')}<input type="checkbox" id="setting-learning-enabled" aria-label="${H.esc(text('show'))}" data-game="${H.esc(game)}" ${guide().settings(game).enabled?'checked':''}></div><p data-learning-global-note ${globalOff?'':'hidden'}>${text('global-off')}</p></section>`;
 }
 function offer(game,isCurrent=()=>false){
  if(offering?.frame?.state==='disposed')offering=null;
  const bridge=root.PlayroomAppBridge;if(!bridge||guide().settings(game).prompted||offering)return;
  const attempt={game,isCurrent,frame:null,decided:false};offering=attempt;
  queueMicrotask(()=>{if(offering!==attempt)return;if(!isCurrent()||guide().settings(game).prompted){offering=null;return;}
   // Do not replace unrelated dialogs; a later render will offer again.
   if(registry().activeFrame()){offering=null;return;}
   const H=root.PlayroomGameScreen;
   attempt.frame=bridge.openModal(`${bridge.modalHead(text('title'))}<p class="lead">${text('intro')}</p><div class="modal-foot">${H.button({attrs:`data-learning-choice="no" data-game="${H.esc(game)}"`,label:text('no'),variant:'secondary'})}${H.button({attrs:`data-learning-choice="yes" data-game="${H.esc(game)}"`,label:text('yes')})}</div>`,'learning-intro',{valid:isCurrent,onBack:()=>{if(!attempt.decided&&isCurrent())guide().setEnabled(game,true);},onDispose:()=>{if(offering===attempt)offering=null;}});
   if(!attempt.frame&&offering===attempt)offering=null;
   // Closing without an explicit choice keeps the enabled default.
  });
 }
 function showList(game){
  const H=root.PlayroomGameScreen,bridge=root.PlayroomAppBridge,goals=root.PlayroomViews.get(game)?.tutorial?.goals||[],saved=guide().settings(game);
  const learned=goal=>saved.mastered[goal.id]===(goal.revision||1),complete=goals.length>0&&goals.every(learned);
  bridge.openModal(`${bridge.modalHead(text('list'))}<ul class="learning-goals">${goals.map(goal=>`<li><input type="checkbox" disabled ${learned(goal)?'checked':''} aria-label="${H.esc(goal.text)}"><span>${H.esc(goal.text)}</span></li>`).join('')}</ul>${complete?`<p class="learning-complete" role="status">${H.icon('check')} ${text('complete')}</p>`:''}`,'learning-list');
 }
 async function restart(game){
  const frame=registry().activeFrame(),box=frame?.element.querySelector('#setting-learning-enabled');
  if(!box||box.dataset.game!==game||box.closest('[hidden],[inert],[aria-hidden="true"]'))return;
  const profile=root.PlayroomAppBridge.profile()?.id,scope=guide().settings(game).scope;
  const current=()=>frame.state!=='disposed'&&box.isConnected&&frame.element.contains(box)&&root.PlayroomAppBridge.profile()?.id===profile&&guide().settings(game).scope===scope;
  if(!await root.PlayroomGameScreen.confirmDialog(text('reset-confirm'),{title:'Сбросить обучение?',acceptLabel:'Сбросить',isCurrent:current})||!current()||!registry().isActive(frame)||box.closest('[hidden],[inert],[aria-hidden="true"]'))return;
  guide().restart(game);box.checked=true;
 }
 root.addEventListener('playroom:game-options',()=>{const note=registry().activeRoot()?.querySelector('[data-learning-global-note]');if(note?.isConnected)note.hidden=root.PlayroomAppBridge?.gameOptions?.().tutorialsEnabled!==false;});
 document.addEventListener('click',event=>{const active=registry().activeRoot();if(!active?.contains(event.target))return;
  const list=event.target.closest('[data-learning-list]');if(list){showList(list.dataset.learningList);return;}
  const choice=event.target.closest('[data-learning-choice]'),attempt=offering;
  if(choice&&attempt?.frame?.element.contains(choice)&&registry().isActive(attempt.frame)&&attempt.isCurrent()){
   attempt.decided=true;root.PlayroomAppBridge.closeModal();guide().setEnabled(attempt.game,choice.dataset.learningChoice==='yes');
  }
 });
 root.PlayroomTutorialSettings=Object.freeze({markup,offer,restart});
})(globalThis);
