/* Host-owned room conversation. Storage and live membership are injected ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRoomChat=api;})(globalThis,function(){
 'use strict';
 class RoomChat{
  constructor({store,resolve,clock=Date.now,reactionValid}){Object.assign(this,{store,resolve,clock,reactionValid});this.cache=new Map();this.cacheBytes=0;this.indexes=new WeakMap();}
  key(roomId){return 'playroom.room-chat.v1.'+roomId;}
  records(roomId,mutable=false){
   const store=this.store(),raw=store.getItem(this.key(roomId))||'[]';if(mutable)return JSON.parse(raw);
   const previous=this.cache.get(roomId);if(previous?.store===store&&previous.raw===raw){this.cache.delete(roomId);this.cache.set(roomId,previous);return previous.rows;}
   if(previous){this.cacheBytes-=previous.bytes;this.cache.delete(roomId);}
   const rows=JSON.parse(raw),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};freeze(rows);
   const bytes=raw.length*2;if(bytes<=4*1024*1024){this.cache.set(roomId,{store,raw,rows,bytes});this.cacheBytes+=bytes;while(this.cache.size>8||this.cacheBytes>8*1024*1024){const key=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(key).bytes;this.cache.delete(key);}}
   return rows;
  }
  access(roomId,personId){const ctx=this.resolve(roomId,personId);if(!ctx?.person||ctx.person.bot||!ctx.person.connected||ctx.closed)throw Error('ROOM_CHAT_UNAVAILABLE');return ctx;}
  visible(entry,ctx){return entry.scope==='room'||!!ctx.team&&entry.team===ctx.team&&entry.audience.includes(ctx.person.id);}
  project(entry,personId,roomId){
   const target=entry.replyToId&&roomId?this.records(roomId).find(row=>row.id===entry.replyToId):null;
   return this._project(entry,personId,target,target?this.access(roomId,personId):null);
  }
  _project(entry,personId,target,ctx){
   const {audience,readBy,replyToId,reactions=[],...safe}=entry;
   const reply=replyToId?(target&&this.visible(target,ctx)?{id:target.id,nickname:target.nickname,body:target.body.slice(0,160)}:{unavailable:true}):null;
   const grouped=new Map();for(const reaction of reactions){const value=grouped.get(reaction.emoji)||{emoji:reaction.emoji,count:0,mine:false};value.count++;value.mine ||= reaction.authorId===personId;grouped.set(reaction.emoji,value);}
   return {...safe,reply,reactions:[...grouped.values()],mine:entry.authorId===personId,read:!!readBy?.some(id=>id!==entry.authorId)};
  }
  read(roomId,personId,{scope='room',before=null,after=null,known=[]}={}){
   const ctx=this.access(roomId,personId);if(!['room','team'].includes(scope)||scope==='team'&&!ctx.team)throw Error('ROOM_CHAT_TEAM_UNAVAILABLE');
   if(before!==null&&(!Number.isSafeInteger(Number(before))||Number(before)<1)||after!==null&&(!Number.isSafeInteger(Number(after))||Number(after)<0)||!Array.isArray(known)||known.length>256||known.some(k=>!k||typeof k.seq!=='string'||!Number.isSafeInteger(k.version)||k.version< -1))throw Error('ROOM_CHAT_INVALID');
   // One immutable persisted snapshot and fresh access context for this
   // synchronous read. Never retain either across calls or recipients.
   const records=this.records(roomId),byId=this.indexes.get(records)||new Map(),knownVersions=new Map(known.map(k=>[k.seq,k.version]));
   if(!this.indexes.has(records)){for(const row of records)if(!byId.has(row.id))byId.set(row.id,row);this.indexes.set(records,byId);}
   const project=e=>this._project(e,personId,byId.get(e.replyToId),ctx);
   const all=records.filter(e=>e.scope===scope&&this.visible(e,ctx)),filtered=all.filter(e=>(before===null||e.seq<Number(before))&&(after===null||e.seq>Number(after))),fresh=after===null?filtered.slice(-80):filtered.slice(0,80);
   const updates=after===null?[]:all.filter(e=>e.seq<=Number(after)&&knownVersions.has(String(e.seq))&&knownVersions.get(String(e.seq))!==(e.version||0)).map(e=>{const {body,...value}=project(e);return value;});
   const unread=all.filter(e=>e.authorId!==personId&&!e.readBy?.includes(personId));
   return {features:{replies:true,reactions:true},messages:[...fresh.map(project),...updates],older:before!==null?filtered.length>80:all.some(e=>e.seq<(fresh[0]?.seq||0)),through:unread.length?String(unread[0].seq-1):String(all.at(-1)?.seq||0),unread:unread.length,team:ctx.team||null,teamColor:ctx.teamColor||null,teamColorRole:ctx.teamColorRole||null,roomId};
  }
  summary(roomId,personId){const ctx=this.access(roomId,personId),rows=this.records(roomId).filter(e=>e.authorId!==personId&&this.visible(e,ctx)&&!e.readBy?.includes(personId));return {room:rows.filter(e=>e.scope==='room').length,team:rows.filter(e=>e.scope==='team').length,teamId:ctx.team||null,teamColor:ctx.teamColor,teamColorRole:ctx.teamColorRole};}
  async markRead(roomId,personId,{scope='room',through,only=false}={}){
   await this.store().transact(()=>{const ctx=this.access(roomId,personId);if(!Number.isSafeInteger(through)||through<1||!['room','team'].includes(scope)||scope==='team'&&!ctx.team)throw Error('ROOM_CHAT_INVALID');const rows=this.records(roomId,true);let changed=false;
    for(const entry of rows){if((only?entry.seq===through:entry.seq<=through)&&entry.scope===scope&&entry.authorId!==personId&&this.visible(entry,ctx)&&!entry.readBy?.includes(personId)){entry.readBy=[...(entry.readBy||[]),personId];entry.version=(entry.version||0)+1;changed=true;}}
    if(changed)this.store().setItem(this.key(roomId),JSON.stringify(rows));
   });return {ok:true};
  }
  async react(roomId,personId,{scope='room',targetId,emoji,enabled}={}){
   let entry,changed=false;
   await this.store().transact(()=>{
    const ctx=this.access(roomId,personId),rows=this.records(roomId,true);entry=rows.find(row=>row.id===targetId);
    if(!entry||!['message','reaction'].includes(entry.kind)||entry.scope!==scope||!this.visible(entry,ctx)||!this.reactionValid(emoji)||typeof enabled!=='boolean')throw Error('ROOM_CHAT_INVALID');
    const existing=(entry.reactions||[]).some(row=>row.authorId===personId&&row.emoji===emoji);
    if(existing===enabled)return;
    entry.reactions=(entry.reactions||[]).filter(row=>row.authorId!==personId||row.emoji!==emoji);
    if(enabled)entry.reactions.push({authorId:personId,emoji});entry.version=(entry.version||0)+1;
    this.store().setItem(this.key(roomId),JSON.stringify(rows));changed=true;
   });return {entry,changed};
  }

  async append(roomId,personId,{scope='room',body,id,kind='message',replyToId=null}={}){
   let entry,created=false;
   await this.store().transact(()=>{
    const ctx=this.access(roomId,personId);
    if(!['room','team'].includes(scope)||scope==='team'&&!ctx.team||!['message','reaction'].includes(kind)||typeof body!=='string'||!body.trim()||body.trim().length>2000||typeof id!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(id)||kind==='reaction'&&!this.reactionValid(body))throw Error('ROOM_CHAT_INVALID');
    const rows=this.records(roomId);if(replyToId!==null){const target=rows.find(row=>row.id===replyToId);if(typeof replyToId!=='string'||!target||target.scope!==scope||!this.visible(target,ctx)||!['message','reaction'].includes(target.kind))throw Error('ROOM_CHAT_INVALID');}body=body.trim();entry=rows.find(e=>e.id===id&&e.authorId===personId);
    if(entry){if(entry.body!==body||entry.scope!==scope||entry.kind!==kind||(entry.replyToId||null)!==replyToId||!this.visible(entry,ctx))throw Error('ROOM_CHAT_INVALID');return;}
    const now=this.clock();if(rows.filter(e=>e.authorId===personId&&now-Date.parse(e.at)<60000).length>=30)throw Error('ROOM_CHAT_RATE_LIMIT');
    entry={id,replyToId,version:0,seq:(rows.at(-1)?.seq||0)+1,scope,kind,body,at:new Date(now).toISOString(),authorId:personId,nickname:ctx.person.nickname,avatar:ctx.person.avatar||null,player:ctx.player,sessionId:ctx.sessionId||null,team:scope==='team'?ctx.team:null,teamColor:scope==='team'?ctx.teamColor:null,teamColorRole:scope==='team'?ctx.teamColorRole:null,audience:scope==='team'?ctx.allies:[]};
    this.store().setItem(this.key(roomId),JSON.stringify([...rows,entry]));created=true;
   });
   return {entry,created};
  }
 }
 return RoomChat;
});
