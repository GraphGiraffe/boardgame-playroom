'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Transport=require('../app/transports/webrtc.js');
function fakeChannel(){
  const listeners=new Map();let closed=false;
  return {
    readyState:'open',
    addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
    removeEventListener(type,fn){listeners.get(type)?.delete(fn);},
    emit(type,value){for(const fn of listeners.get(type)||[])fn(type==='message'?{data:JSON.stringify(value)}:{});},
    send(raw){const message=JSON.parse(raw);if(message.kind==='hello')queueMicrotask(()=>this.emit('message',{kind:'transport-ready',version:2}));},
    close(){if(closed)return;closed=true;this.readyState='closed';this.emit('close');}
  };
}
test('RTC presence is isolated from game snapshots and ignores out-of-order statuses',async()=>{
  const channel=fakeChannel(),client=Transport.client(channel,{handshakeTimeout:1000});
  try{
    await client.ready();
    const seen=[];client.subscribePresence(s=>seen.push(s));
    const p=(revision,connected)=>({kind:'room-presence',roomId:'room-test',revision,
      participants:[{id:'guest-a',nickname:'Игрок & ко',connected}]});
    channel.emit('message',p(5,false));assert.equal(seen.length,1);assert.equal(seen[0].participants[0].connected,false);
    channel.emit('message',p(4,true));assert.equal(seen.length,1,'older status must not erase a disconnect');
    channel.emit('message',p(5,true));assert.equal(seen.length,1,'same-revision status is a duplicate');
    channel.emit('message',{kind:'room-presence',roomId:'room-test',revision:6,
      participants:[{id:'x',nickname:'X',connected:'yes'}]});assert.equal(seen.length,1,'invalid connection flag rejected');
    for(const extra of [{playerIndex:1.5},{playerIndex:32},{bot:'yes'},{local:'yes'},{hasConnected:'yes'}]){channel.emit('message',{...p(6,true),participants:[{...p(6,true).participants[0],...extra}]});assert.equal(seen.length,1,'invalid role metadata rejected');}
    channel.emit('message',{...p(6,true),participants:[{...p(6,true).participants[0],playerIndex:1,hasConnected:true,local:false,bot:false}]});assert.equal(seen.length,2);assert.equal(seen[1].participants[0].connected,true);
    seen[1].participants[0].nickname='TAMPER';
    client.subscribePresence(s=>{assert.equal(s.participants[0].nickname,'Игрок & ко');})();
  }finally{client.close();}
});
