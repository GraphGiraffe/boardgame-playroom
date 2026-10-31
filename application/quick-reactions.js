/* Ephemeral reactions: a fixed vocabulary and a host-owned, session-scoped gate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomQuickReactions=api;})(globalThis,function(){
 'use strict';
 const items=Object.freeze([
  ['hi','Привет'],['thanks','Спасибо'],['nice','Хороший ход'],
  ['think','Думаю'],['hehe','Хе-хе'],['wow','Ого'],
  ['time','Жду'],['challenge','Вызов'],['censor','Цензура']
 ].map(([id,label])=>Object.freeze({id,label,shortcode:`:${id}:`,emoji:`:${id}:`})));
 // Retain old saved messages and peers without changing the wire field.
 const legacy=Object.freeze(['👍','👏','🎉','😄','😮','🤔','😅','😢','🤝']);
 const aliases=Object.freeze({'👏':':nice:','😮':':wow:','🤔':':think:','🤝':':thanks:'});
 const find=value=>items.find(item=>item.shortcode===(aliases[value]||value));
 const valid=value=>!!find(value)||legacy.includes(value);
 class Relay{
  constructor(){this.session=null;this.recent=new Map();this.times=new Map();}
  accept({sessionId,player,allowed},command,now=Date.now()){
   if(!allowed||!Number.isInteger(player)||player<0||command?.sessionId!==sessionId||!valid(command?.emoji)||typeof command?.id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(command.id))throw Error('REACTION_UNAVAILABLE');
   if(this.session!==sessionId){this.session=sessionId;this.recent.clear();this.times.clear();}
   if(this.recent.has(command.id))return null;
   if(now-(this.times.get(player)??-Infinity)<2000)throw Error('REACTION_RATE_LIMIT');
   this.times.set(player,now);this.recent.set(command.id,true);if(this.recent.size>256)this.recent.delete(this.recent.keys().next().value);
   return {kind:'quick-reaction',sessionId,id:command.id,player,emoji:command.emoji};
  }
 }
 return Object.freeze({items,find,valid,Relay,duration:2000});
});
