// Compile already authorized event descriptors. No DOM, clocks or rule commands.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomEventPlan=api;})(globalThis,function(){
 'use strict';
 function describe(event){
  const route=event.presentation?.sequence;
  const kind=event.diceRoll?'roll':event.feedback?.kind|| (route?'movement':event.reveal?'reveal':event.speech?'speech':event.transfer?'transfer':event.kind||'action');
  const entity=route?.entity||event.reveal?.entity;
  const player=event.feedback?.player??event.transfer?.player??event.speech?.speaker??event.player;
  const target=entity?{entity}:Number.isInteger(player)?{participant:player}:{zone:'field'};
  return {kind,target,...(route?{route}:{}),...(event.reveal?{reveal:event.reveal}:{}),
   ...(event.speech?{speech:event.speech}:{}),...(event.transfer?{transfer:event.transfer}:{}),
   sounds:[...(event.ids||[])]};
 }
 function compile({id,items,initial=null,final=null}){
  const scenes=[],groups=[];
  const addScene=scene=>{let index=scenes.indexOf(scene);if(index<0){index=scenes.length;scenes.push(scene);}return index;};
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
  const transfers=events.filter(e=>e.transfer);
  if(transfers.length<2||transfers.slice(1).some(e=>e.transfer.from!=='stock'||e.transfer.to==='table'))return events;
  return events.map((event,index)=>{
   if(!event.transfer)return event;
   const scene=JSON.parse(JSON.stringify(final)),future=events.slice(index+1).filter(e=>e.transfer);
   for(const next of future){
    const {player,count}=next.transfer,hand=scene.players.find(p=>p.player===player)?.hand;
    if(!hand)return event;
    const old=new Set(initial?.players?.find(p=>p.player===player)?.hand?.filter(c=>!c.hidden).map(c=>String(c.id))||[]);
    for(let n=0;n<count;n++){
     const at=hand.findLastIndex(c=>c.hidden||!old.has(String(c.id)));
     if(at<0)return event;
     hand.splice(at,1);
    }
    if(Number.isInteger(scene.stockCount))scene.stockCount+=count;
   }
   for(const zone of scene.zones.filter(z=>z.kind==='hand')){
    const hand=scene.players.find(p=>p.player===zone.owner)?.hand||[];zone.count=hand.length;
    const ids=new Set(hand.filter(c=>!c.hidden).map(c=>String(c.id)));
    scene.objects=scene.objects.filter(o=>o.zone!==zone.id||ids.has(o.ref.id));
   }
   scene.interactions=[];return {...event,scene};
  });
 }
 return Object.freeze({compile,describe,transferScenes});
});
