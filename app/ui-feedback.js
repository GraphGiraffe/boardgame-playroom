/* Semantic UI feedback uses the existing master volume; game audio has priority. */
(function(root,factory){
 'use strict';const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root.document){root.PlayroomUIFeedback=api.create({audio:()=>root.PlayroomAppBridge?.audio,visible:()=>!root.document.hidden&&(root.document.hasFocus()||!!root.matchMedia?.('(pointer: coarse)').matches),identity:()=>{const a=root.PlayroomAccountUI?.service?.snapshot();return a?a.kind+':'+a.id:'local';},now:()=>Date.now()});root.addEventListener('playroom-update-ready',()=>root.PlayroomUIFeedback.emit('update.ready',{id:root.PlayroomPWA?.updateInfo?.version||'available'}));}
 if(root.document){root.document.addEventListener('click',event=>{if(event.target.closest?.('[data-hub-page],[data-settings-tab]'))root.PlayroomUIFeedback?.emit('navigation');});root.document.addEventListener('change',event=>{if(event.target.closest?.('[data-settings-screen]')&&event.target.id!=='setting-volume'&&event.target.id!=='setting-diagnostics')queueMicrotask(()=>root.PlayroomUIFeedback?.emit('control.change'));});}
})(globalThis,function(){
 'use strict';
 const note=(frequency,at=0,duration=.085)=>({frequency,at,duration,wave:'sine',gain:.085,attack:.008});
 const sounds=Object.freeze({
  'menu.open':{label:'Открытие меню',notes:[note(523,0,.055)]},
  'menu.close':{label:'Закрытие меню',notes:[note(440,0,.055)]},
  'navigation':{label:'Переход',notes:[note(587,0,.05)]},
  'control.change':{label:'Изменение параметра',notes:[note(659,0,.045)]},
  'game.start':{label:'Начало партии',notes:[note(523,0,.09),note(659,.075,.09),note(784,.15,.16)]},
  'message':{label:'Сообщение',notes:[note(660),note(880,.075,.11)]},
  'reaction':{label:'Реакция',notes:[note(740,0,.075)]},
  'invitation':{label:'Приглашение',notes:[note(523),note(659,.08),note(784,.16,.14)]},
  'friend.request':{label:'Заявка в друзья',notes:[note(587),note(784,.11,.16)]},
  'friend.accepted':{label:'Друг добавлен',notes:[note(659),note(880,.09,.18)]},
  'handoff.offer':{label:'Предложение роли хоста',notes:[note(440),note(659,.11),note(880,.22,.18)]},
  'handoff.accepted':{label:'Передача хоста принята',notes:[note(523),note(784,.12,.16)]},
  'handoff.declined':{label:'Передача хоста отклонена',notes:[note(587),note(440,.12,.14)]},
  'handoff.complete':{label:'Хост передан',notes:[note(523,0,.18),note(659,.07,.18),note(784,.14,.22)]},
  'connection.success':{label:'Соединение готово',notes:[note(392),note(587,.08,.14)]},
  'error':{label:'Ошибка действия',notes:[note(330,0,.12),note(262,.13,.14)]},
  'update.ready':{label:'Доступно обновление',notes:[note(698),note(880,.12,.18)]}
 });
 function create({audio,visible=()=>true,identity=()=> 'local',now=Date.now}){
  let owner=null,registered=null,last=-Infinity;const seen=new Set();
  function emit(type,{id=null,quiet=false}={}){
   if(!sounds[type])return false;const who=identity();if(who!==owner){owner=who;seen.clear();last=-Infinity;}
   const key=id===null?null:type+':'+id;if(key&&seen.has(key))return false;if(key){seen.add(key);while(seen.size>256)seen.delete(seen.values().next().value);}
   const port=audio();if(quiet||!visible()||!port||port.uiEnabled===false||port.busy||now()-last<250)return false;
   if(port!==registered){port.registerPack('app-feedback',sounds);registered=port;}
   last=now();port.play([type],'app-feedback');return true;
  }
  return Object.freeze({emit});
 }
 return {create,sounds};
});
