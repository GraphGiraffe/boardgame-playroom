/* Pure player preference schema. UI, persistence and application effects are ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerSettings=api;})(globalThis,function(){
 'use strict';
 const defaults=()=>({sound:true, volume:1, animationSpeed:'normal', interfaceScale:100, handShape:'arc', splitThreeOpponents:false, quickPlay:true,autoPass:false,hotseatAutoPass:{},seating:'circle',seatingByGame:{},showLastGame:false,lastRoomName:''});
 function normalize(stored,{catalog,normalizeScale,normalizeSpeed}){
  const settings=defaults();
    settings.interfaceScale=normalizeScale(stored?.interfaceScale);
    if(['straight','arc'].includes(stored?.handShape))settings.handShape=stored.handShape;
    if(typeof stored?.splitThreeOpponents==='boolean')settings.splitThreeOpponents=stored.splitThreeOpponents;
    if(typeof stored?.sound==='boolean')settings.sound=stored.sound;
    if([.3,.6,1].includes(stored?.volume))settings.volume=stored.volume;
    if(typeof stored?.quickPlay==='boolean')settings.quickPlay=stored.quickPlay;
    if(typeof stored?.autoPass==='boolean')settings.autoPass=stored.autoPass;
    if(stored?.hotseatAutoPass&&typeof stored.hotseatAutoPass==='object')settings.hotseatAutoPass=Object.fromEntries(Object.entries(stored.hotseatAutoPass).filter(([key,value])=>(/^(?:\d+:\d+|\["lobby",)/.test(key)&&key.length<=512)&&typeof value==='boolean'));
    if(typeof stored?.hiddenLocalSession==='string')settings.hiddenLocalSession=stored.hiddenLocalSession;
    if(typeof stored?.showLastGame==='boolean')settings.showLastGame=stored.showLastGame;
    if(typeof stored?.lastRoomName==='string'){const name=stored.lastRoomName.trim().replace(/\s+/g,' ');if(name.length<=48)settings.lastRoomName=name;}
    if(stored?.seatingByGame&&typeof stored.seatingByGame==='object'&&!Array.isArray(stored.seatingByGame))settings.seatingByGame=Object.fromEntries(Object.entries(stored.seatingByGame).filter(([id,value])=>Object.hasOwn(catalog,id)&&['circle','anchors','row'].includes(value)));
    else if(stored?.seating==='row')settings.seatingByGame=Object.fromEntries(Object.keys(catalog).map(id=>[id,'row']));
    settings.animationSpeed=normalizeSpeed(stored?.animationSpeed!==undefined?stored.animationSpeed:stored?.motion===false?'instant':'normal');
  return settings;
 }
 return Object.freeze({defaults,normalize});
});
