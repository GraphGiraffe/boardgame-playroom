/* Durable control-plane validation shared by authority and host recovery. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerControls=api;})(globalThis,function(){
 'use strict';
 function validate(record,players,move){
  const controls=record.playerControls??players.map(()=>({away:false,bot:false})),revision=record.playerControlRevision??0,receipts=record.playerControlReceipts??[];
  if(!Array.isArray(controls)||controls.length!==players.length||controls.some((v,i)=>!v||Object.keys(v).some(k=>!['away','bot'].includes(k))||typeof v.away!=='boolean'||typeof v.bot!=='boolean'||players[i].bot&&(v.away||v.bot))||!Number.isSafeInteger(revision)||revision<0||!Array.isArray(receipts)||receipts.length!==revision||revision>20000)throw Error('INVALID_PLAYER_CONTROLS');
  const keys=new Set();receipts.forEach((row,i)=>{
   let command;try{command=JSON.parse(row.signature);}catch{throw Error('INVALID_PLAYER_CONTROL_RECEIPT');}
   const r=row.receipt,actor=command?.actor;
   if(!Number.isInteger(actor)||actor<0||actor>=players.length||players[actor].bot||!command.changes||!Object.keys(command.changes).length||Object.keys(command.changes).some(k=>!['away','bot'].includes(k)||typeof command.changes[k]!=='boolean')||command.expectedRevision!==i||!r?.ok||typeof r.requestId!=='string'||!r.requestId||r.requestId.length>128||row.key!==actor+':'+r.requestId||keys.has(row.key)||r.playerControlRevision!==i+1||!Number.isSafeInteger(r.revision)||r.revision<0||r.revision>move)throw Error('INVALID_PLAYER_CONTROL_RECEIPT');keys.add(row.key);
  });
  const replay=players.map(()=>({away:false,bot:false}));for(const row of receipts){const c=JSON.parse(row.signature);Object.assign(replay[c.actor],c.changes);}if(JSON.stringify(replay)!==JSON.stringify(controls))throw Error('INVALID_PLAYER_CONTROL_STATE');
  return {playerControls:JSON.parse(JSON.stringify(controls)),playerControlRevision:revision,playerControlReceipts:JSON.parse(JSON.stringify(receipts))};
 }
 return Object.freeze({validate});
});
