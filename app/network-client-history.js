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
  const valid=s=>s&&s.protocolVersion===1&&['snapshot','history'].includes(s.kind)&&
    id(s.sessionId)&&id(s.authorityEpoch)&&id(s.game)&&id(s.packVersion)&&
    Number.isSafeInteger(s.revision)&&s.revision>=0&&Number.isInteger(s.viewer)&&s.viewer>=-1&&s.viewer<=31&&
    s.state&&typeof s.state==='object'&&!Array.isArray(s.state)&&
    s.state.move===s.revision&&s.state.game===s.game&&s.state.packVersion===s.packVersion;
  // Explicit allowlist: no resume token, room snapshot, ICE credentials, rules seed,
  // command receipt, or other host-private envelope field can enter a client frame.
  function projectFrame(snapshot){
    if(!valid(snapshot))throw Error('Некорректный снимок сетевого игрока.');
    return COPY({sessionId:snapshot.sessionId,authorityEpoch:snapshot.authorityEpoch,
      revision:snapshot.revision,viewer:snapshot.viewer,game:snapshot.game,
      packVersion:snapshot.packVersion,state:snapshot.state,events:snapshot.events||[]});
  }
  class ClientHistory {
    constructor({indexedDB=globalThis.indexedDB,name=DB}={}){this.indexedDB=indexedDB;this.name=name;this.database=null;this.opening=null;}
    async remove(key){
      if(typeof key!=='string'||!key)throw Error('Некорректный архив');
      await this.tx(['matches','frames'],'readwrite',tx=>{
        tx.objectStore('matches').delete(key);const request=tx.objectStore('frames').index('id').openCursor(key);
        request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};
      });
    }
    async open(){
      if(this.database)return this.database;
      if(this.opening)return this.opening;
      if(!this.indexedDB)throw Error('IndexedDB недоступен на этом устройстве.');
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
        request.onerror=()=>reject(request.error||Error('Не удалось открыть архив клиента.'));
        request.onblocked=()=>reject(Error('Архив клиента занят другой вкладкой.'));
      });
      try{return await this.opening;}finally{this.opening=null;}
    }
    async tx(stores,mode,run){
      const database=await this.open();return new Promise((resolve,reject)=>{
        const tx=database.transaction(stores,mode);let result,reason;
        const abort=error=>{reason=error;try{tx.abort();}catch(_){reject(error);}};
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(reason||tx.error||Error('Архив клиента недоступен.'));
        try{run(tx,value=>{result=value;},abort);}catch(error){abort(error);}
      });
    }
    static frame(snapshot){return projectFrame(snapshot);}
    static id(roomId,participantId,sessionId=null){
      if(!id(roomId)||!id(participantId)||(sessionId!==null&&!id(sessionId)))throw Error('Некорректное игровое место.');
      // Match scope is required: the same persistent room + participant may
      // play multiple games without overwriting (or mixing) the old replay.
      return [roomId,participantId,...(sessionId?[sessionId]:[])].map(encodeURIComponent).join('|');
    }
    async save({roomId,participantId,roomName='',snapshot}){
      const frame=projectFrame(snapshot),key=ClientHistory.id(roomId,participantId,frame.sessionId);
      await this.tx(['matches','frames'],'readwrite',(tx,_,abort)=>{
        const matches=tx.objectStore('matches'),get=matches.get(key);
        get.onsuccess=()=>{
          const old=get.result;
          if(old&&(old.sessionId!==frame.sessionId||old.viewer!==frame.viewer||
              old.game!==frame.game||old.packVersion!==frame.packVersion)){
            abort(Error('Игровое место или партия изменились; старая история сохранена.'));return;
          }
          const last=Math.max(frame.revision,old?.revision??0),now=Date.now();
          matches.put({id:key,roomId,participantId,sessionId:frame.sessionId,viewer:frame.viewer,
            game:frame.game,packVersion:frame.packVersion,name:String(roomName).slice(0,100),
            role:'client',revision:last,createdAt:old?.createdAt||now,updatedAt:now,
            players:(frame.state.players||[]).map(p=>String(p.name).slice(0,64))});
          tx.objectStore('frames').put({id:key,revision:frame.revision,frame});
        };
      });
      return key;
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
    async read(key){if(typeof key!=='string'||key.length>515||!key.includes('|'))throw Error('Некорректная запись.');
      return this.tx(['matches','frames'],'readonly',(tx,done)=>{
        const match=tx.objectStore('matches').get(key),frames=tx.objectStore('frames').index('id').getAll(key),data={};
        match.onsuccess=()=>{data.match=match.result;};
        frames.onsuccess=()=>{data.frames=frames.result;};
        done(data);
      }).then(data=>data.match?{...data.match,frames:data.frames.map(x=>x.frame).sort((a,b)=>a.revision-b.revision)}:null);
    }
    close(){this.database?.close();this.database=null;}
  }
  return ClientHistory;
});
