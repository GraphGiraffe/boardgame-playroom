(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomNetworkSessionStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DB_NAME='playroom.network-host.v1',DB_VERSION=1;
  const isId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
  const clone=value=>JSON.parse(JSON.stringify(value));

  // All network authority data is PRIVATE to the host origin. No record from
  // this store may be returned through RTC snapshot/history or a public link.
  class NetworkSessionStore{
    constructor({indexedDB=globalThis.indexedDB,name=DB_NAME}={}){
      this.indexedDB=indexedDB;this.name=name;this.database=null;
    }
    async open(){
      if(this.database)return this.database;
      if(!this.indexedDB)throw Error('IndexedDB недоступен. Сетевая партия не может быть надёжно сохранена.');
      const db=await new Promise((resolve,reject)=>{
        const request=this.indexedDB.open(this.name,DB_VERSION);
        request.onupgradeneeded=()=>{
          const database=request.result;
          if(!database.objectStoreNames.contains('sessions'))database.createObjectStore('sessions',{keyPath:'sessionId'});
          for(const name of ['steps','receipts'])if(!database.objectStoreNames.contains(name)){
            const store=database.createObjectStore(name,{keyPath:name==='steps'?['sessionId','revision']:['sessionId','viewer','commandId']});
            store.createIndex('sessionId','sessionId',{unique:false});
          }
        };
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error||Error('Не удалось открыть IndexedDB.'));
        request.onblocked=()=>reject(Error('Хранилище занято другой вкладкой. Закройте старую версию PlayRoom.'));
      });
      db.onversionchange=()=>{db.close();if(this.database===db)this.database=null;};
      this.database=db;return db;
    }
    async transaction(stores,mode,run){
      const database=await this.open();
      return new Promise((resolve,reject)=>{
        const tx=database.transaction(stores,mode);let result,failure=null;
        const abort=error=>{failure=error;try{tx.abort();}catch(_){reject(error);}};
        tx.oncomplete=()=>resolve(result);
        tx.onabort=()=>reject(failure||tx.error||Error('Не удалось сохранить сетевую партию.'));
        tx.onerror=()=>{}; // onabort reports the actual IndexedDB failure
        try{run(tx,value=>{result=value;},abort);}catch(error){abort(error);}
      });
    }
    async create({sessionId,room,session}){
      if(!isId(sessionId)||!isId(room?.id)||!session?.export||room.game?.id!==session.game||room.game?.version!==session.packVersion)
        throw Error('Некорректные данные исходной сетевой партии.');
      if(session.current.move!==0)throw Error('Начальное сохранение должно предшествовать первому ходу.');
      const timestamp=Date.now();
      const record={format:'playroom-network-host',version:1,sessionId,roomId:room.id,
        game:session.game,packVersion:session.packVersion,room:clone(room),
        initial:session.export(),revision:0,createdAt:timestamp,updatedAt:timestamp};
      await this.transaction(['sessions'],'readwrite',tx=>tx.objectStore('sessions').add(record));
      return {sessionId,revision:0};
    }
    // A single readwrite transaction makes the state, receipt, and committed
    // revision indivisible. Resolve only on transaction COMPLETE, not on put().
    async commit({sessionId,previousRevision,nextState,viewer,commandId,signature,receipt}){
      if(!isId(sessionId)||!Number.isSafeInteger(previousRevision)||previousRevision<0||
          nextState?.move!==previousRevision+1||!Number.isInteger(viewer)||viewer<0||
          !isId(commandId)||typeof signature!=='string'||!receipt?.ok||receipt.revision!==nextState.move)
        throw Error('Некорректная запись подтверждённого хода.');
      await this.transaction(['sessions','steps','receipts'],'readwrite',(tx,_,abort)=>{
        const sessions=tx.objectStore('sessions');
        const request=sessions.get(sessionId);
        request.onsuccess=()=>{
          const entry=request.result;
          if(!entry||entry.revision!==previousRevision){abort(Error('Ревизия сохранения отличается от текущей партии.'));return;}
          if(entry.game!==nextState.game||entry.packVersion!==(nextState.packVersion||'0.1.0')){
            abort(Error('Версия игры в сохранении не совпадает.'));return;
          }
          tx.objectStore('steps').add({sessionId,revision:nextState.move,state:clone(nextState)});
          tx.objectStore('receipts').add({sessionId,viewer,commandId,signature,receipt:clone(receipt)});
          sessions.put({...entry,revision:nextState.move,updatedAt:Math.max(Date.now(),entry.updatedAt)});
        };
      });
      return receipt;
    }
    async recordReceipt({sessionId,viewer,commandId,signature,receipt}){
      if(!isId(sessionId)||!Number.isInteger(viewer)||viewer<0||!isId(commandId)||
          typeof signature!=='string'||receipt?.ok!==false)throw Error('Некорректная квитанция отклонённой команды.');
      await this.transaction(['sessions','receipts'],'readwrite',(tx,_,abort)=>{
        const check=tx.objectStore('sessions').get(sessionId);
        check.onsuccess=()=>{
          if(!check.result){abort(Error('Сетевая партия отсутствует.'));return;}
          tx.objectStore('receipts').add({sessionId,viewer,commandId,signature,receipt:clone(receipt)});
        };
      });
    }
    async load(sessionId,engine,Session){
      if(!isId(sessionId))throw Error('Некорректный идентификатор сетевой партии.');
      const stored=await this.transaction(['sessions','steps','receipts'],'readonly',(tx,done)=>{
        const values={},session=tx.objectStore('sessions').get(sessionId),steps=tx.objectStore('steps').index('sessionId').getAll(sessionId),
          receipts=tx.objectStore('receipts').index('sessionId').getAll(sessionId);
        session.onsuccess=()=>{values.record=session.result;};
        steps.onsuccess=()=>{values.steps=steps.result;};
        receipts.onsuccess=()=>{values.receipts=receipts.result;};
        done(values);
      });
      if(!stored.record)return null;
      const {record}=stored,steps=(stored.steps||[]).sort((a,b)=>a.revision-b.revision);
      if(record.format!=='playroom-network-host'||record.version!==1||record.initial?.version!==1||
          record.initial.game!==record.game||record.initial.packVersion!==record.packVersion||
          steps.length!==record.revision||steps.some((step,i)=>step.revision!==i+1||step.sessionId!==sessionId))
        throw Error('Сетевое сохранение повреждено. Данные не удалены.');
      const saved={...record.initial,updatedAt:Math.max(record.initial.updatedAt,record.updatedAt),
        states:[...record.initial.states,...steps.map(step=>step.state)]};
      return {room:clone(record.room),session:Session.restore(engine,saved),
        receipts:clone(stored.receipts||[]),sessionId,revision:record.revision};
    }
    async list(){
      return this.transaction(['sessions'],'readonly',(tx,done)=>{
        const request=tx.objectStore('sessions').getAll();
        request.onsuccess=()=>done(request.result.map(s=>({sessionId:s.sessionId,roomId:s.roomId,
          game:s.game,packVersion:s.packVersion,revision:s.revision,createdAt:s.createdAt,updatedAt:s.updatedAt}))
          .sort((a,b)=>b.updatedAt-a.updatedAt));
      });
    }
    close(){this.database?.close();this.database=null;}
  }
  return NetworkSessionStore;
});
