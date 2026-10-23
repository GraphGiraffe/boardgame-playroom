if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
/* Web bootstrap for portable rooms and browser identity storage. */
(function(root,factory){const api=factory(root.PlayroomRooms||(typeof require==='function'?require('../application/rooms.js'):null),root.PlayroomIdentityStore||(typeof require==='function'?require('../platform/web/identity-store.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomMultiplayer=api;})(globalThis,function(Rooms,Store){
'use strict';
  // Odd seats use cool colors; even seats use warm colors (one-based).
  const COLORS=[
    ['#348653',globalThis.PlayroomMessages.text("ui.multiplayer.a4bb19e1436f")],['#d75245',globalThis.PlayroomMessages.text("ui.multiplayer.731c7ce35857")],['#387bbf',globalThis.PlayroomMessages.text("ui.multiplayer.66d12fb99282")],['#d9b136',globalThis.PlayroomMessages.text("ui.multiplayer.b039d623c29e")],
    ['#9055b5',globalThis.PlayroomMessages.text("ui.multiplayer.1174a37a5ab4")],['#e68532',globalThis.PlayroomMessages.text("ui.multiplayer.4aed2cd288de")],['#42b7d6',globalThis.PlayroomMessages.text("ui.multiplayer.6b64572a4b37")],['#d66b8f',globalThis.PlayroomMessages.text("ui.multiplayer.pink")],
    ['#6371a0',globalThis.PlayroomMessages.text("ui.multiplayer.03a7adc9a6c4")],['#a76a45',globalThis.PlayroomMessages.text("ui.multiplayer.690cb43da431")],['#6d8f77',globalThis.PlayroomMessages.text("ui.multiplayer.b3fa5ae77400")],['#8a6a58',globalThis.PlayroomMessages.text("ui.multiplayer.206522bddd15")]
  ];

class RoomService extends Rooms.RoomService {constructor(options={}){super({idFactory:Store.uuid,clock:Store.now,random:Math.random,tokenFactory:Store.secureResumeToken,...options});}}
function presetLabel(preset,metadata={},presetSetting=null){
    const label=String(presetSetting?.options?.find(option=>option.value===preset)?.label||metadata.presets?.find(option=>option.id===preset)?.label||preset||globalThis.PlayroomMessages.text("ui.multiplayer.4da4da9da138"));
    return presetSetting?.label&&/^\d+(?:[.,–—×x: /-]\d+)*$/.test(label.trim())?presetSetting.label+': '+label:label;
  }
function describeRules(rules={},settings=[],hasHands=false,presetSetting=null){
    const rows=[{label:presetSetting?.label||globalThis.PlayroomMessages.text("ui.multiplayer.b5d827de5168"),value:String(presetSetting?.options?.find(option=>option.value===rules.preset)?.label||rules.presetLabel||rules.preset||globalThis.PlayroomMessages.text("ui.multiplayer.4da4da9da138"))}];
    const fields=Array.isArray(settings)?settings:[];
    for(const [key,value] of Object.entries(rules.options||{})){
      const field=fields.find(item=>item?.key===key);
      if(field?.visibleWhen&&!Object.entries(field.visibleWhen).every(([k,v])=>String(rules.options?.[k])===String(v)))continue;
      const option=field?.options?.find(item=>String(item.value)===String(value));
      rows.push({label:String(field?.label||key),value:String(option?.label??value)});
    }
    if(hasHands)rows.push({label:globalThis.PlayroomMessages.text("ui.multiplayer.957e469d885d"),value:rules.openHands?globalThis.PlayroomMessages.text("ui.multiplayer.93e6073f9005"):globalThis.PlayroomMessages.text("ui.multiplayer.43e5ab70f691")});
    return rows;
  }
const seatColor=index=>{const known=COLORS[index];return known?{value:globalThis.TabletopUI?.helpers.playerColor(index)||'var(--color-seat-'+index+','+known[0]+')',label:known[1]}:{value:'hsl('+Math.round((index*137.508)%360)+' 46% 50%)',label:String(index+1)};};
return {...Rooms,...Store,COLORS,seatColor,presetLabel,describeRules,RoomService};
});
