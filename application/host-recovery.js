/* Private checkpoint recovery. History is replayed only on request. */
(function(root,factory){const api=factory(root.PlayroomPlayerControls||(typeof require==='function'?require('../core/player-controls.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomHostRecovery=api;})(globalThis,function(Controls){
 'use strict';const clone=value=>JSON.parse(JSON.stringify(value));
 function restore(stored,sessionId,engine,Session){
  if(!stored.record)return null;
  const {record}=stored,steps=[...(stored.steps||[])].sort((a,b)=>a.revision-b.revision);
  if(record.version!==2||record.format!=='playroom-network-host'||record.eventStorage!=='actions-checkpoint-v1')throw Error('SAVE_FORMAT');
  if(record.transfer&&(record.transfer.role==='outgoing'||record.transfer.state!=='active'))throw Error('HOST_TRANSFER_PENDING_OR_MOVED');
  if(record.sessionId!==sessionId||!record.room||record.room.id!==record.roomId||record.room.game?.id!==record.game||record.room.game.version!==record.packVersion||record.initial?.game!==record.game||record.initial.packVersion!==record.packVersion||record.checkpoint?.state?.move!==record.revision||steps.length!==record.revision||steps.some((step,i)=>step.sessionId!==sessionId||step.revision!==i+1||!Array.isArray(step.a)))throw Error('CHECKPOINT_INVALID');
  if(record.packDigest!=null&&!/^sha256:[0-9a-f]{64}$/.test(record.packDigest))throw Error('CHECKPOINT_INVALID');
  if(record.recovery&&(record.recovery.version!==1||record.recovery.room?.id!==record.roomId||record.recovery.room.ownerId!==record.room.ownerId))throw Error('CHECKPOINT_INVALID');
  const accepted=new Set(),keys=new Set(),receipts=stored.receipts||[];
  for(const row of receipts){const key=row.viewer+':'+row.commandId,r=row.receipt;
   if(row.sessionId!==sessionId||!Number.isInteger(row.viewer)||(row.viewer<0&&!(row.viewer===-1&&r?.hostClock===true&&record.clockEntriesVersion===1))||row.viewer>=record.initial.states[0].players.length||typeof row.commandId!=='string'||!row.commandId||!/^sha256:[0-9a-f]{64}$/.test(row.signature)||r?.commandId!==row.commandId||typeof r.ok!=='boolean'||keys.has(key)||!Number.isSafeInteger(r.revision)||r.revision<0||r.revision>record.revision)throw Error('CHECKPOINT_RECEIPT_INVALID');
   keys.add(key);if(r.ok){if(r.revision<1||accepted.has(r.revision)||steps[r.revision-1].a[0]!==row.viewer)throw Error('CHECKPOINT_RECEIPT_INVALID');accepted.add(r.revision);}}
  if(accepted.size!==record.revision)throw Error('CHECKPOINT_RECEIPT_MISSING');
  const controls=record.controlReceipts||[],controlRevision=record.controlRevision||0;let previousControl=0;
  if(!Array.isArray(controls)||controls.length>20000||!Number.isSafeInteger(controlRevision)||controlRevision<0)throw Error('CHECKPOINT_CONTROL_INVALID');
  for(const row of controls){const r=row.receipt,key=row.viewer+':'+row.commandId;if(!Number.isInteger(row.viewer)||(row.viewer<0&&!(row.viewer===-1&&r?.host===true))||typeof row.signature!=='string'||!r?.ok||!r.control||r.commandId!==row.commandId||!Number.isSafeInteger(r.controlRevision)||r.controlRevision<previousControl||r.controlRevision>previousControl+1||r.revision>record.revision||keys.has(key))throw Error('CHECKPOINT_CONTROL_INVALID');keys.add(key);previousControl=r.controlRevision;}
  if(previousControl!==controlRevision)throw Error('CHECKPOINT_CONTROL_INVALID');
  const actions=steps.map(({a})=>({actor:a[0],command:a[1],...(a[2]?{players:a[2]}:{}),...(a[3]!==undefined?{now:a[3]}:{})}));
  const playerControl=Controls.validate(record,record.initial.states[0].players,record.revision);
  return {...playerControl,session:Session.restoreCheckpoint(engine,{initial:record.initial,checkpoint:record.checkpoint,actions,updatedAt:Math.max(record.updatedAt,record.initial.updatedAt)}),sessionId,revision:record.revision,room:clone(record.room),recovery:record.recovery?clone(record.recovery):null,packDigest:record.packDigest||null,hostDeviceId:record.hostDeviceId||null,paused:!!record.paused,clockTime:record.clockTime??record.checkpoint.state.clock??0,clockUpdatedAt:record.clockUpdatedAt??record.updatedAt,controlRevision,receipts:clone([...receipts,...controls])};
 }
 return Object.freeze({restore});
});
