// Deterministic decision randomness is independent of the game RNG.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomBotDifficulty=api;})(globalThis,function(){
 'use strict';
 const levels=Object.freeze(['easy','medium','hard']);
 const profiles=Object.freeze({easy:Object.freeze({difficulty:'easy',errorRate:35,depth:1}),medium:Object.freeze({difficulty:'medium',errorRate:18,depth:2}),hard:Object.freeze({difficulty:'hard',errorRate:6,depth:3})});
 function normalize(value){const level=value??'medium';if(!levels.includes(level))throw Error('BOT_SETTINGS_INVALID');return level;}
 function random(seed,key){let x=(seed>>>0)||1;for(const c of String(key))x=Math.imul(x^c.charCodeAt(0),16777619)>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};}
 function context(settings,seed,key){return {...profiles[normalize(settings?.difficulty)],random:random(seed,key)};}
 function choose(preferred,actions,context){
  // Never turn a useful move into an unrelated setup/toggle/undo command.
  if(['hold','ready','unready','confirm','auto','roll'].includes(preferred.type))return preferred;
  const alternatives=actions.filter(a=>a!==preferred&&a.type===preferred.type);
  return alternatives.length&&context.random()*100<context.errorRate?alternatives[Math.floor(context.random()*alternatives.length)]:preferred;
 }
 return Object.freeze({levels,profiles,normalize,random,context,choose});
});
