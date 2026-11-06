if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
// Host archive validation and reconstruction, independent of IndexedDB and the Web.
(function(root,factory){
  const api=factory(root.PlayroomJournal||(typeof require==='function'?require('../core/journal.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomHostRecovery=api;
})(globalThis,function(Journal){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const isId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
  function restore(stored,sessionId,engine,Session){
      if(!stored.record)return null;
      if(stored.record.transfer&&(stored.record.transfer.role==='outgoing'||stored.record.transfer.state!=='active'))throw Error('HOST_TRANSFER_PENDING_OR_MOVED');
      const {record}=stored,steps=(stored.steps||[]).sort((a,b)=>a.revision-b.revision);
       if(record.format!=='playroom-network-host'||record.version!==1||record.initial?.version!==1||(record.eventStorage!==undefined&&!['delta-v1','delta-v2'].includes(record.eventStorage))||
           (record.packDigest!=null&&!/^sha256:[0-9a-f]{64}$/.test(record.packDigest))||
          !isId(record.roomId)||record.room?.id!==record.roomId||
          record.room?.game?.id!==record.game||record.room.game.version!==record.packVersion||
          (record.recovery&&(record.recovery.version!==1||record.recovery.room?.id!==record.roomId||
            record.recovery.room?.ownerId!==record.room.ownerId))||
          record.initial.game!==record.game||record.initial.packVersion!==record.packVersion||
          steps.length!==record.revision||steps.some((step,i)=>step.revision!==i+1||step.sessionId!==sessionId))
        throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.bcbb80d603cb"));
      // A committed step without its receipt (or a receipt without its step)
      // makes lost-ACK recovery ambiguous. Fail closed instead of resuming a
      // journal in which a previously acknowledged action could run twice.
      const accepted=new Set(),commandIds=new Set();
      for(const row of stored.receipts||[]){
        const key=row?.viewer+':'+row?.commandId,receipt=row?.receipt;
        if(row?.sessionId!==sessionId||!Number.isInteger(row.viewer)||row.viewer<0||
            !isId(row.commandId)||typeof row.signature!=='string'||!row.signature||
            receipt?.commandId!==row.commandId||typeof receipt.ok!=='boolean'||
            commandIds.has(key))
          throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.6f6f62e98e4f"));
        commandIds.add(key);
        if(receipt.ok){
          if(!Number.isSafeInteger(receipt.revision)||receipt.revision<1||
              receipt.revision>record.revision||accepted.has(receipt.revision))
            throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.6fa616b7bde9"));
          accepted.add(receipt.revision);
        }
      }
      if(accepted.size!==record.revision)
        throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.13b4486b721a"));
      const controls=record.controlReceipts||[],controlRevision=record.controlRevision||0;
      if(!Array.isArray(controls)||controls.length>20000||!Number.isSafeInteger(controlRevision)||controlRevision<0||(record.paused!==undefined&&typeof record.paused!=='boolean'))throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.df306046d81e"));
      const controlKeys=new Set();let previousControl=0;
      for(const row of controls){const key=row?.viewer+':'+row?.commandId,r=row?.receipt;
        if(!Number.isInteger(row?.viewer)||(row.viewer<0&&!(row.viewer===-1&&r?.host===true))||row.viewer>=record.initial.states[0].players.length||!isId(row.commandId)||typeof row.signature!=='string'||!r?.control||!r.ok||r.commandId!==row.commandId||!Number.isSafeInteger(r.revision)||r.revision<0||r.revision>record.revision||!Number.isSafeInteger(r.controlRevision)||r.controlRevision<previousControl||r.controlRevision>previousControl+1||controlKeys.has(key))throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.8c343529c2bb"));
        previousControl=r.controlRevision;controlKeys.add(key);
      }
      if(previousControl!==controlRevision)throw Error(globalThis.PlayroomMessages.text("ui.host-recovery.8f9ced1c2e2c"));
      const playerControl=(globalThis.PlayroomPlayerControls||(typeof require==='function'?require('../core/player-controls.js'):null)).validate(record,record.initial.states[0].players,record.revision);
      const saved={...record.initial,updatedAt:Math.max(record.initial.updatedAt,record.updatedAt),
        states:['delta-v1','delta-v2'].includes(record.eventStorage)?Journal.restore(record.initial,steps,record.eventCursor):[...record.initial.states,...steps.map(step=>step.state)]};
       return {...playerControl,hostDeviceId:record.hostDeviceId||null,paused:!!record.paused,controlRevision:record.controlRevision||0,room:clone(record.room),recovery:record.recovery?clone(record.recovery):null,
         packDigest:record.packDigest||null,
        session:Session.restore(engine,saved),
        receipts:clone([...(stored.receipts||[]),...(record.controlReceipts||[])]),sessionId,revision:record.revision};
  }
  return Object.freeze({restore});
});
