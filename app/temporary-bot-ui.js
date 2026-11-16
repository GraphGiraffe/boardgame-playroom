/* Personal absence and temporary substitution through lobby participant profiles. */
(function(root){
 'use strict';const H=()=>root.PlayroomGameScreen,B=()=>root.PlayroomAppBridge,N=()=>root.PlayroomNetworkLibrary;
 function participantMarkup(target){
  const ctx=N()?.playerControlContext();if(!ctx)return '';const {room,snapshot,id}=ctx,person=room.participants.find(p=>p.id===target),seat=room.seats.find(s=>s.participantId===target);
  if(!person||person.bot||!Number.isInteger(seat?.playerIndex))return '';
  const control=snapshot.playerControls?.[seat.playerIndex]||{},self=target===id,operation=self?(control.away||control.bot?'return':'away'):room.game?.capabilities?.bots!==false&&room.ownerId===id&&!control.bot&&(control.away||!person.connected)?'bot':null;
  return operation?H().iconButton(`data-player-control-action="${operation}"${operation==='bot'?` data-player-control-target="${H().esc(target)}"`:''}`,operation==='return'?'Вернуть управление':operation==='away'?'Отойти':'Подключить временного бота',operation==='return'?'play':operation==='away'?'pause':'bot'):'';
 }
 const labels={BUSY:'Дождитесь завершения действия.',STALE:'Состав обновился. Повторите действие.',PLAYER_AVAILABLE:'Игрок снова в игре.',READ_ONLY:'Это действие недоступно.',WRONG_SESSION:'Партия изменилась. Откройте окно ещё раз.'};
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-player-control-action]');if(!button||button.disabled)return;
  const ctx=N().playerControlContext();if(!ctx)return;button.disabled=true;
  const command={type:'player-control',operation:button.dataset.playerControlAction,...(button.dataset.playerControlTarget?{target:button.dataset.playerControlTarget}:{}),sessionId:ctx.snapshot.sessionId,authorityEpoch:ctx.snapshot.authorityEpoch,requestId:crypto.randomUUID(),expectedRevision:ctx.snapshot.playerControlRevision||0};
  try{const result=await ctx.call(command);if(!result?.ok)throw Error(result?.code||'UNAVAILABLE');root.dispatchEvent(new Event('playroom:participant-control-updated'));}
  catch(error){button.disabled=false;B().toast(labels[error.message]||'Не удалось изменить управление. Повторите попытку.');}
 });
 root.PlayroomTemporaryBotUI=Object.freeze({participantMarkup});
})(globalThis);
