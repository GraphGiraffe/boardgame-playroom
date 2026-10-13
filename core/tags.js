(function(root,factory){
  const data=typeof module==='object'&&module.exports?require('./tags.json'):root.PlayroomTagRegistry;
  const api=factory(data);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomTags=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(data){
  'use strict';
  const entries=Object.freeze(data.tags.map(item=>Object.freeze({...item})));
  const known=new Map(entries.map(item=>[item.id,item]));
  function validate(manifest){
    const tags=manifest.tags;
    if(tags!==undefined&&(!Array.isArray(tags)||tags.length<1||tags.length>3||new Set(tags).size!==tags.length||tags.some(id=>!known.has(id))||!tags.some(id=>known.get(id)?.kind==='type')))throw Error('Пак должен содержать 1–3 разрешённых тега, включая тип игры');
    const modes=manifest.playModes;
    if(modes!==undefined&&(!Array.isArray(modes)||!modes.length||modes.some(m=>!m||typeof m.id!=='string'||typeof m.teams!=='boolean'||!Array.isArray(m.players)||!m.players.length||new Set(m.players).size!==m.players.length||m.players.some(n=>!Number.isInteger(n)||n<1||n>32))))throw Error('Некорректные составы игроков');
    return true;
  }
  function forPack(info={}){return (info.tags||(['cards','board','dice'].includes(info.category)?[info.category]:[])).map(id=>known.get(id)).filter(Boolean);}
  function counts(game,info={}){return [...new Set(info.playModes?.flatMap(m=>m.players)||game.playerCounts||Array.from({length:game.max-game.min+1},(_,i)=>game.min+i))];}
  function matches(game,info={},format=''){
    const allowed=counts(game,info);
    if(!format)return true;
    if(format==='solo')return allowed.includes(1);
    if(format==='duel')return allowed.length===1&&allowed[0]===2;
    if(format==='three')return allowed.length===1&&allowed[0]===3;
    if(format==='teams')return !!info.playModes?.some(m=>m.teams);
    return ['2+','3+','4+','6+'].includes(format)&&allowed.some(n=>n>=Number(format[0]));
  }
  return Object.freeze({entries,validate,forPack,counts,matches});
});
