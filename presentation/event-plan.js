// Compile already authorized event descriptors. No DOM, clocks or rule commands.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomEventPlan=api;})(globalThis,function(){
 'use strict';
 function describe(event){
  const route=event.presentation?.sequence;
  const kind=event.diceRoll?'roll':event.feedback?.kind|| (route?'movement':event.reveal?'reveal':event.speech?'speech':event.transfer?'transfer':event.animation?'animation':event.kind||'action');
  const entity=route?.entity||event.reveal?.entity;
  const player=event.feedback?.player??event.transfer?.player??event.speech?.speaker??event.player;
  const target=kind==='animation'?event.animation.target:entity?{entity}:Number.isInteger(player)?{participant:player}:{zone:'field'};
  return {kind,target,...(route?{route}:{}),...(event.reveal?{reveal:event.reveal}:{}),
   ...(event.animation?{animation:event.animation}:{}),
   ...(event.speech?{speech:event.speech}:{}),...(event.transfer?{transfer:event.transfer}:{}),
   sounds:[...(event.ids||[])]};
 }
 function compile({id,items,initial=null,final=null}){
  const scenes=[],groups=[],indices=new Map();
  // Phases refer to the exact authorized scene. Distinct scenes can have the
  // same content, while multiple phases may share one immutable scene object.
  const addScene=scene=>{
   const existing=indices.get(scene);
   if(existing!==undefined)return existing;
   const index=scenes.length;
   indices.set(scene,index);scenes.push(scene);
   return index;
  };
  addScene(items[0]?.boundary?.initial??initial);
  items.forEach((item,index)=>{
   const descriptor=describe(item),key=String(item.id)+(item.diceRoll?':roll':'');
   const scene=addScene(item.boundary?.initial??initial);
   const readingStage=item.reveal&&!item.speech?'hold':'enter';
   for(const stage of ['prepare','enter','hold','leave'])groups.push({scene,duration:stage===readingStage?item.duration:0,
    cues:[...(stage==='hold'&&readingStage==='enter'?[]:[{...descriptor,id:key+':'+stage,stage,index}]),...(stage==='enter'&&descriptor.sounds.length?[{id:key+':sound',kind:'sound',stage:'sound',index,sounds:descriptor.sounds}]:[])]});
  });
  const end=addScene(items.at(-1)?.boundary?.final??final);
  return {id,initial:0,final:end,scenes,groups};
 }
 // Card arrivals use only authorized scene identities/counts. Rule-specific
 // removals (sets/pairs) supply explicit checkpoints from pack presentation.
 function transferScenes(events,initial,final){
  if(events.some(e=>e.scene)||!final?.players||!final.zones?.some(z=>z.kind==='table'))return events;
  const transfers=events.flatMap((e,index)=>e.transfer?[index]:[]);
  if(transfers.length<2||transfers.slice(1).some(index=>events[index].transfer.from!=='stock'||events[index].transfer.to==='table'))return events;
  const oldIds=new Map(),staged=events.slice(),stockZones=final.zones.filter(zone=>zone.kind==='stock');
  const stockId=stockZones.length===1?stockZones[0].id:null;
  let checkpoint=final.interactions?.length?{...final,interactions:[]}:final;
  // Each checkpoint rewinds only the next arrival. Anonymous backs change a
  // hand count without changing the list of authorized physical objects.
  for(let i=transfers.length-1;i>=0;i--){
   const index=transfers[i],event=events[index];
   staged[index]={...event,scene:checkpoint};
   if(i===0)break;
   const {player,count}=event.transfer,atPlayer=checkpoint.players.findIndex(p=>p.player===player),hand=checkpoint.players[atPlayer]?.hand;
   if(!hand||hand.length<count)return events;
   if(!oldIds.has(player)){
    const previous=initial?.players?.find(p=>p.player===player)?.hand||[];
    oldIds.set(player,new Set(previous.filter(card=>!card.hidden).map(card=>String(card.id))));
   }
   const old=oldIds.get(player),shortened=hand.slice();
   let pending=count,removed;
   for(let at=hand.length-1;at>=0&&pending>0;at--){
    const card=hand[at];
    if(!card.hidden){
     const id=String(card.id);
     if(old.has(id))continue;
     (removed??=new Set()).add(id);
    }
    shortened.splice(at,1);
    pending--;
   }
   if(pending)return events;
   const players=checkpoint.players.slice(),changedHandZones=removed?new Set():null;
   players[atPlayer]={...players[atPlayer],hand:shortened};
   const zones=checkpoint.zones.map(zone=>{
    if(zone.kind==='hand'&&zone.owner===player){
     changedHandZones?.add(zone.id);
     return {...zone,count:shortened.length};
    }
    // The stock badge and the semantic zone describe the same point in time.
    return zone.id===stockId&&Number.isInteger(zone.count)?{...zone,count:zone.count+count}:zone;
   });
   const objects=changedHandZones?.size?checkpoint.objects.filter(o=>o.ref.namespace!=='card'||!changedHandZones.has(o.zone)||!removed.has(o.ref.id)):checkpoint.objects;
   const stockCount=checkpoint.stockCount;
   checkpoint={...checkpoint,players,zones,objects,...(Number.isInteger(stockCount)?{stockCount:stockCount+count}:{})};
  }
  return staged;
 }
 return Object.freeze({compile,describe,transferScenes});
});
