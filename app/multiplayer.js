if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
/* Web bootstrap for portable rooms and browser identity storage. */
(function(root,factory){const api=factory(root.PlayroomRooms||(typeof require==='function'?require('../application/rooms.js'):null),root.PlayroomIdentityStore||(typeof require==='function'?require('../platform/web/identity-store.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomMultiplayer=api;})(globalThis,function(Rooms,Store){
'use strict';
  const COLORS=[
    ['#587d5d',globalThis.PlayroomMessages.text("ui.multiplayer.a4bb19e1436f")],['#cf7358',globalThis.PlayroomMessages.text("ui.multiplayer.731c7ce35857")],['#5f85a4',globalThis.PlayroomMessages.text("ui.multiplayer.66d12fb99282")],['#b89a46',globalThis.PlayroomMessages.text("ui.multiplayer.b039d623c29e")],
    ['#806ca5',globalThis.PlayroomMessages.text("ui.multiplayer.4aed2cd288de")],['#438f8a',globalThis.PlayroomMessages.text("ui.multiplayer.1174a37a5ab4")],['#b56c8d',globalThis.PlayroomMessages.text("ui.multiplayer.6b64572a4b37")],['#7f8d53',globalThis.PlayroomMessages.text("ui.multiplayer.36cd623ea46f")],
    ['#a76a45',globalThis.PlayroomMessages.text("ui.multiplayer.690cb43da431")],['#6371a0',globalThis.PlayroomMessages.text("ui.multiplayer.03a7adc9a6c4")],['#8a6a58',globalThis.PlayroomMessages.text("ui.multiplayer.206522bddd15")],['#6d8f77',globalThis.PlayroomMessages.text("ui.multiplayer.b3fa5ae77400")]
  ];

class RoomService extends Rooms.RoomService {constructor(options={}){super({idFactory:Store.uuid,clock:Store.now,random:Math.random,tokenFactory:Store.secureResumeToken,...options});}}
function describeRules(rules={},settings=[],hasHands=false){
    const rows=[{label:globalThis.PlayroomMessages.text("ui.multiplayer.b5d827de5168"),value:String(rules.presetLabel||rules.preset||globalThis.PlayroomMessages.text("ui.multiplayer.4da4da9da138"))}];
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
const seatColor=index=>{const known=COLORS[index];return known?{value:'var(--color-seat-'+index+','+known[0]+')',label:known[1]}:{value:'hsl('+Math.round((index*137.508)%360)+' 46% 50%)',label:String(index+1)};};
return {...Rooms,...Store,COLORS,seatColor,describeRules,RoomService};
});
