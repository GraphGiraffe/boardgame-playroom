/* Pure player preference schema. UI, persistence and application effects are ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPlayerSettings=api;})(globalThis,function(){
 'use strict';
 const defaults=()=>({sound:true,uiSounds:true,tutorialsEnabled:true, volume:1, animationSpeed:'normal', interfaceScale:100, handShape:'arc', splitThreeOpponents:false, quickPlay:true,autoPass:false,hotseatAutoPass:{},seating:'circle',seatingByGame:{},showLastGame:false,lastRoomName:''});
 function normalize(stored,{catalog,normalizeScale,normalizeSpeed}){
  const settings=defaults();
    // Legacy density is retained in storage only; the UI starts at its adaptive baseline.
    settings.interfaceScale=100;
    if(['straight','arc'].includes(stored?.handShape))settings.handShape=stored.handShape;
    settings.splitThreeOpponents=false;
    if(typeof stored?.sound==='boolean')settings.sound=stored.sound;
    if(typeof stored?.uiSounds==='boolean')settings.uiSounds=stored.uiSounds;
    if(typeof stored?.tutorialsEnabled==='boolean')settings.tutorialsEnabled=stored.tutorialsEnabled;
    if(Number.isFinite(stored?.volume)&&stored.volume>=0&&stored.volume<=1)settings.volume=stored.volume;
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
