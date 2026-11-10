/* Generic component commands. Connection context carries identity, never choices. */
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomCommandWire=api;})(globalThis,function(P){
 'use strict';
 const LIMIT=32,BUDGET=16*1024,fail=code=>{throw Error(code);};
 const entry=frame=>P.composeRecord({sessionId:frame.sessionId,authorityEpoch:frame.authorityEpoch,role:P.role(frame),viewer:frame.viewer,...(P.role(frame)==='table'&&frame.actor!==undefined?{actor:frame.actor}:{})});
 function cache(){
  const values=new Map();let size=0;
  return {values,put(id,value,key){
   const amount=new TextEncoder().encode(key).length;if(amount>BUDGET)return false;
   if(values.has(id)){if(values.get(id).key!==key)fail('COMMAND_CONTEXT_INVALID');return true;}
   values.set(id,{value,key,bytes:amount});size+=amount;
   while(values.size>LIMIT||size>BUDGET){const first=values.keys().next().value;size-=values.get(first).bytes;values.delete(first);}
   return true;
  }};
 }
 function host(){
  const contexts=cache();let sequence=0;
  return Object.freeze({
   attach(frame){
    if(frame?.kind!=='snapshot'||typeof frame.sessionId!=='string'||typeof frame.authorityEpoch!=='string')return frame;
    const value=entry(frame),key=P.canonical(value);
    for(const [id,context]of contexts.values)if(context.key===key)return P.composeRecord({...frame,commandScope:id});
    if(sequence===Number.MAX_SAFE_INTEGER)fail('COMMAND_CONTEXT_LIMIT');
    const id=++sequence;if(!contexts.put(id,value,key))return frame;
    return P.composeRecord({...frame,commandScope:id});
   },
   decode(packet){
    if(!Array.isArray(packet))fail('COMMAND_CONTEXT_INVALID');
    // One form also carries lobby/control/dynamic input and exact reconnect retries.
    if(packet[0]===1&&packet.length===2)return packet[1];
    if(packet[0]!==0||packet.length!==5||!Number.isSafeInteger(packet[1])||packet[1]<1||typeof packet[2]!=='string'||!Number.isSafeInteger(packet[3])||packet[3]<0)fail('COMMAND_CONTEXT_INVALID');
    const context=contexts.values.get(packet[1])?.value;if(!context)fail('COMMAND_CONTEXT_EXPIRED');
    const command=P.composeRecord({protocolVersion:P.version,sessionId:context.sessionId,authorityEpoch:context.authorityEpoch,commandId:packet[2],expectedRevision:packet[3],action:packet[4],...(context.actor===undefined?{}:{actor:context.actor})});
    if(!P.validate(command))fail('COMMAND_CONTEXT_INVALID');
    return command;
   }
  });
 }
 function client(){
  const contexts=cache(),literal=command=>P.composeArray([1,command]);
  return Object.freeze({
   remember(frame){
    if(frame?.kind!=='snapshot'||frame.commandScope===undefined)return frame;
    if(!Number.isSafeInteger(frame.commandScope)||frame.commandScope<1||typeof frame.sessionId!=='string'||typeof frame.authorityEpoch!=='string')fail('COMMAND_CONTEXT_INVALID');
    const value=entry(frame);contexts.put(frame.commandScope,value,P.canonical(value));return frame;
   },
   encode(command){
    if(P.validate(command))for(const [id,{value:context}]of [...contexts.values].reverse()){
     if(context.sessionId===command.sessionId&&context.authorityEpoch===command.authorityEpoch&&context.actor===command.actor)return P.composeArray([0,id,command.commandId,command.expectedRevision,command.action]);
    }
    return literal(command);
   },
   literal
  });
 }
 return Object.freeze({host,client,LIMIT,BUDGET});
});
