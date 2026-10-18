if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
/* Client-only projected network history. Never stores host authority state. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomNetworkClientHistory=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DB='playroom.network-client-history.v1',COPY=value=>JSON.parse(JSON.stringify(value));
  const id=value=>typeof value==='string'&&value.length>0&&value.length<=128;
  const valid=s=>s&&s.protocolVersion===2&&['snapshot','history'].includes(s.kind)&&
    id(s.sessionId)&&id(s.authorityEpoch)&&id(s.game)&&id(s.packVersion)&&
    Number.isSafeInteger(s.revision)&&s.revision>=0&&Number.isInteger(s.viewer)&&s.viewer>=-1&&s.viewer<=31&&
    s.state&&typeof s.state==='object'&&!Array.isArray(s.state)&&
    s.state.move===s.revision&&s.state.game===s.game&&s.state.packVersion===s.packVersion;
  // Explicit allowlist: no resume token, room snapshot, ICE credentials, rules seed,
  // command receipt, or other host-private envelope field can enter a client frame.
  function projectFrame(snapshot){
    if(!valid(snapshot))throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.a0780d9bec32"));
    return COPY({sessionId:snapshot.sessionId,authorityEpoch:snapshot.authorityEpoch,
      revision:snapshot.revision,viewer:snapshot.viewer,game:snapshot.game,
      packVersion:snapshot.packVersion,state:snapshot.state,events:snapshot.events||[]});
  }
  class ClientHistory {
    constructor({indexedDB=globalThis.indexedDB,name=DB}={}){this.indexedDB=indexedDB;this.name=name;this.database=null;this.opening=null;}
    async remove(key){
      if(typeof key!=='string'||!key)throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.b9efa6ceb037"));
      await this.tx(['matches','frames'],'readwrite',tx=>{
        tx.objectStore('matches').delete(key);const request=tx.objectStore('frames').index('id').openCursor(key);
        request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};
      });
    }
    async open(){
      if(this.database)return this.database;
      if(this.opening)return this.opening;
      if(!this.indexedDB)throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.c46c3923936b"));
      this.opening=new Promise((resolve,reject)=>{
        const request=this.indexedDB.open(this.name,1);
        request.onupgradeneeded=()=>{
          const db=request.result;
          if(!db.objectStoreNames.contains('matches'))db.createObjectStore('matches',{keyPath:'id'});
          if(!db.objectStoreNames.contains('frames')){
            const frames=db.createObjectStore('frames',{keyPath:['id','revision']});
            frames.createIndex('id','id',{unique:false});
          }
        };
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();if(this.database===db)this.database=null;};this.database=db;resolve(db);};
        request.onerror=()=>reject(request.error||Error(globalThis.PlayroomMessages.text("ui.network-client-history.7496db695727")));
        request.onblocked=()=>reject(Error(globalThis.PlayroomMessages.text("ui.network-client-history.6f53ca3ba46c")));
      });
      try{return await this.opening;}finally{this.opening=null;}
    }
    async tx(stores,mode,run){
      const database=await this.open();return new Promise((resolve,reject)=>{
        const tx=database.transaction(stores,mode);let result,reason;
        const abort=error=>{reason=error;try{tx.abort();}catch(_){reject(error);}};
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(reason||tx.error||Error(globalThis.PlayroomMessages.text("ui.network-client-history.22632a7702f3")));
        try{run(tx,value=>{result=value;},abort);}catch(error){abort(error);}
      });
    }
    static frame(snapshot){return projectFrame(snapshot);}
    static id(roomId,participantId,sessionId=null){
      if(!id(roomId)||!id(participantId)||(sessionId!==null&&!id(sessionId)))throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.ac44e436825d"));
      // Match scope is required: the same persistent room + participant may
      // play multiple games without overwriting (or mixing) the old replay.
      return [roomId,participantId,...(sessionId?[sessionId]:[])].map(encodeURIComponent).join('|');
    }
    async save({roomId,participantId,roomName='',participants=null,snapshot}){
      const frame=projectFrame(snapshot),key=ClientHistory.id(roomId,participantId,frame.sessionId);
      await this.tx(['matches','frames'],'readwrite',(tx,_,abort)=>{
        const matches=tx.objectStore('matches'),get=matches.get(key);
        get.onsuccess=()=>{
          const old=get.result;
          if(old&&(old.sessionId!==frame.sessionId||old.viewer!==frame.viewer||
              old.game!==frame.game||old.packVersion!==frame.packVersion)){
            abort(Error(globalThis.PlayroomMessages.text("ui.network-client-history.a0b86bb0cd2d")));return;
          }
          const last=Math.max(frame.revision,old?.revision??0),now=Date.now();
          const keys=tx.objectStore('frames').index('id').getAllKeys(key);
          keys.onsuccess=()=>{
          const revisions=new Set(keys.result.map(k=>k[1]));revisions.add(frame.revision);
          let receivedRevision=-1;while(revisions.has(receivedRevision+1))receivedRevision++;
          matches.put({receivedRevision,presentedRevision:old?.presentedRevision??null,reviewedRevision:old?.reviewedRevision??null,id:key,roomId,participantId,sessionId:frame.sessionId,viewer:frame.viewer,
            game:frame.game,packVersion:frame.packVersion,name:String(roomName).slice(0,100),
            role:'client',revision:last,finished:frame.revision>=last?frame.state.status==='finished':!!old?.finished,createdAt:old?.createdAt||now,updatedAt:now,
            turnNumber:frame.state.timeline?.turn||null,turn:frame.state.turn,turnName:frame.state.players[frame.state.turn]?.name||null,round:frame.state.scene?.round||null,players:(frame.state.players||[]).map(p=>String(p.name).slice(0,64)),
            participants:Array.isArray(participants)?participants.map(p=>({...id(p.id)?{id:p.id}:{},nickname:String(p.nickname||p.name||'').slice(0,64),avatar:p.avatar||null,role:['player','spectator','table'].includes(p.role)?p.role:'player',bot:!!p.bot,local:!!p.local,isHost:!!p.isHost})):old?.participants||[]});
          };
          tx.objectStore('frames').put({id:key,revision:frame.revision,frame});
        };
      });
      return key;
    }
    async progress(key,upTo){
      if(!Number.isSafeInteger(upTo)||upTo<0)throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.4f028d686f84"));
      return this.tx(['frames'],'readonly',(tx,done)=>{
        const r=tx.objectStore('frames').index('id').getAllKeys(key);
        r.onsuccess=()=>{const stored=new Set(r.result.map(k=>k[1])),missing=[];let receivedRevision=-1;
          while(stored.has(receivedRevision+1))receivedRevision++;
          for(let i=0;i<=upTo;i++)if(!stored.has(i))missing.push(i);
          done({receivedRevision,missing});};
      });
    }
    async mark(key,kind,revision){
      if(!['presentedRevision','reviewedRevision'].includes(kind)||!Number.isSafeInteger(revision)||revision<0)throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.682569d9643d"));
      return this.tx(['matches','frames'],'readwrite',(tx,done)=>{
        const matches=tx.objectStore('matches'),r=matches.get(key);
        r.onsuccess=()=>{if(!r.result)return;const row=r.result,frame=tx.objectStore('frames').get([key,revision]);
          frame.onsuccess=()=>{if(!frame.result)return;
            row[kind]=kind==='presentedRevision'?Math.max(row[kind]??-1,revision):revision;
            matches.put(row);done(true);};};
      });
    }
    async backfill({roomId,participantId,roomName='',snapshot,transport,isCurrent=()=>true}){
      const key=ClientHistory.id(roomId,participantId,snapshot.sessionId);
      const {missing}=await this.progress(key,snapshot.revision);
      for(const revision of missing){
        if(!isCurrent())break;
        const frame=await transport.history(revision);
        if(!isCurrent())break;
        if(!valid(frame)||frame.kind!=='history'||frame.revision!==revision||
          ['sessionId','authorityEpoch','viewer','game','packVersion'].some(k=>frame[k]!==snapshot[k]))throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.7c9ce377829e"));
        await this.save({roomId,participantId,roomName,snapshot:frame});
      }
    }
    async list(){return this.tx(['matches','frames'],'readonly',(tx,done)=>{
      const r=tx.objectStore('matches').getAll();r.onsuccess=()=>{
        const rows=r.result.map(x=>COPY(x));let pending=rows.length;
        if(!pending){done([]);return;}
        for(const row of rows){
          const count=tx.objectStore('frames').index('id').count(row.id);
          count.onsuccess=()=>{row.savedFrames=count.result;if(!--pending)done(rows.sort((a,b)=>b.updatedAt-a.updatedAt));};
        }
      };
    });}
    async read(key){if(typeof key!=='string'||key.length>515||!key.includes('|'))throw Error(globalThis.PlayroomMessages.text("ui.network-client-history.0c46209c576c"));
      return this.tx(['matches','frames'],'readonly',(tx,done)=>{
        const match=tx.objectStore('matches').get(key),frames=tx.objectStore('frames').index('id').getAll(key),data={};
        match.onsuccess=()=>{data.match=match.result;};
        frames.onsuccess=()=>{data.frames=frames.result;};
        done(data);
      }).then(data=>{if(!data.match)return null;const frames=data.frames.map(x=>x.frame).sort((a,b)=>a.revision-b.revision);
        let receivedRevision=-1;for(const frame of frames){if(frame.revision!==receivedRevision+1)break;receivedRevision++;}
        return {...data.match,receivedRevision,presentedRevision:data.match.presentedRevision??null,reviewedRevision:data.match.reviewedRevision??null,frames};});
    }
    close(){this.database?.close();this.database=null;}
  }
  return ClientHistory;
});
