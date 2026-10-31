if(typeof module==='object'&&module.exports&&typeof require==='function')require("../../core/messages.js");
(function(root,factory){
  'use strict';
  const Journal=root.PlayroomJournal||(typeof require==='function'?require('../../core/journal.js'):null);
  const Recovery=root.PlayroomHostRecovery||(typeof require==='function'?require('../../application/host-recovery.js'):null);
  const api=factory(Journal,Recovery);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomNetworkSessionStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Journal,Recovery){
  'use strict';
  const DB_NAME='playroom.network-host.v1',DB_VERSION=1;
  const isId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
  const clone=value=>JSON.parse(JSON.stringify(value));

  // All network authority data is PRIVATE to the host origin. No record from
  // this store may be returned through RTC snapshot/history or a public link.
  class NetworkSessionStore{
    // The digest covers the COMPLETE original package including rules.js,
    // not only a view-only network payload. A version string is insufficient.
    static async fingerprintPack(packs,id,version){
      if(typeof packs?.exportPack!=='function'||!globalThis.crypto?.subtle||typeof TextEncoder==='undefined')
        throw Error(globalThis.PlayroomMessages.text("ui.session-store.51d77419a8e9"));
      const source=packs.exportPack(id,version);
      const hash=await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(source));
      return 'sha256:'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
    }
    constructor({indexedDB=globalThis.indexedDB,name=DB_NAME,now=()=>Date.now(),describe=state=>({turn:state.turn,turnName:state.players?.[state.turn]?.name||null})}={}){
      this.indexedDB=indexedDB;this.name=name;this.database=null;this.now=now;this.describe=describe;
    }
    async open(){
      if(this.database)return this.database;
      if(!this.indexedDB)throw Error(globalThis.PlayroomMessages.text("ui.session-store.32173d5e4c5d"));
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
        request.onerror=()=>reject(request.error||Error(globalThis.PlayroomMessages.text("ui.session-store.f5e52e17f8d1")));
        request.onblocked=()=>reject(Error(globalThis.PlayroomMessages.text("ui.session-store.e47eec3fcdd6")));
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
        tx.onabort=()=>reject(failure||tx.error||Error(globalThis.PlayroomMessages.text("ui.session-store.402cb969a12f")));
        tx.onerror=()=>{}; // onabort reports the actual IndexedDB failure
        try{run(tx,value=>{result=value;},abort);}catch(error){abort(error);}
      });
    }
    async acquireHostLock(sessionId){
      if(!isId(sessionId))throw Error(globalThis.PlayroomMessages.text("ui.session-store.e43055da740e"));
      const locks=globalThis.navigator?.locks;
      if(!locks?.request)throw Error(globalThis.PlayroomMessages.text("ui.session-store.a68170b9d829"));
      let released=false;
      const granted=new Promise((resolve,reject)=>{
        locks.request('playroom-network-authority:'+sessionId,{mode:'exclusive',ifAvailable:true},async lock=>{
          if(!lock){resolve(null);return;}
          await new Promise(done=>resolve(()=>{if(!released){released=true;done();}}));
        }).catch(reject);
      });
      const release=await granted;
      if(!release)throw Error(globalThis.PlayroomMessages.text("ui.session-store.3b131d044fde"));
      return release;
    }
    async create({sessionId,room,session,recovery=null,packDigest=null}){
      if(!isId(sessionId)||!isId(room?.id)||!session?.export||room.game?.id!==session.game||room.game?.version!==session.packVersion)
        throw Error(globalThis.PlayroomMessages.text("ui.session-store.099b09754c00"));
      if(session.current.move!==0)throw Error(globalThis.PlayroomMessages.text("ui.session-store.a2b51bf7339c"));
      if((packDigest!==null&&!/^sha256:[0-9a-f]{64}$/.test(packDigest))||
          (recovery&&packDigest===null))throw Error(globalThis.PlayroomMessages.text("ui.session-store.242c365de395"));
      if(recovery&&(recovery.version!==1||recovery.room?.id!==room.id||
          recovery.room?.ownerId!==room.ownerId||!Array.isArray(recovery.tokens)))
        throw Error(globalThis.PlayroomMessages.text("ui.session-store.bb42b8fe18a9"));
      const timestamp=this.now();
      const record={format:'playroom-network-host',version:1,sessionId,roomId:room.id,
        game:session.game,packVersion:session.packVersion,packDigest,room:clone(room),
        eventStorage:'delta-v1',eventCursor:Journal.cursor(session.current.events),
        ...this.describe(session.current),recovery:recovery?clone(recovery):null,initial:session.export(),revision:0,finished:session.current.status==='finished',createdAt:timestamp,updatedAt:timestamp};
      await this.transaction(['sessions'],'readwrite',tx=>tx.objectStore('sessions').add(record));
      return {sessionId,revision:0};
    }
    // A single readwrite transaction makes the state, receipt, and committed
    // revision indivisible. Resolve only on transaction COMPLETE, not on put().
    async commit({sessionId,previousRevision,nextState,viewer,commandId,signature,receipt}){
      if(!isId(sessionId)||!Number.isSafeInteger(previousRevision)||previousRevision<0||
          nextState?.move!==previousRevision+1||!Number.isInteger(viewer)||viewer<0||
          !isId(commandId)||typeof signature!=='string'||!signature||!receipt?.ok||
          receipt.commandId!==commandId||receipt.revision!==nextState.move)
        throw Error(globalThis.PlayroomMessages.text("ui.session-store.586724de354e"));
      await this.transaction(['sessions','steps','receipts'],'readwrite',(tx,_,abort)=>{
        const sessions=tx.objectStore('sessions');
        const request=sessions.get(sessionId);
        request.onsuccess=()=>{
          const entry=request.result;
          if(!entry||entry.revision!==previousRevision||entry.transfer&&(entry.transfer.role==='outgoing'||entry.transfer.state!=='active')){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.c5c51f878fc6")));return;}
          if(entry.game!==nextState.game||entry.packVersion!==(nextState.packVersion||'0.1.0')){
            abort(Error(globalThis.PlayroomMessages.text("ui.session-store.aaed7e7ce6b1")));return;
          }
          const step=entry.eventStorage==='delta-v1'?Journal.encode(nextState,entry.eventCursor):{state:clone(nextState)};
          tx.objectStore('steps').add({sessionId,revision:nextState.move,...step});
          tx.objectStore('receipts').add({sessionId,viewer,commandId,signature,receipt:clone(receipt)});
          sessions.put({...entry,...this.describe(nextState),revision:nextState.move,finished:nextState.status==='finished',...(entry.eventStorage==='delta-v1'?{eventCursor:step.eventTail}:{}),updatedAt:Math.max(this.now(),entry.updatedAt)});
        };
      });
      return receipt;
    }
    async recordReceipt({sessionId,viewer,commandId,signature,receipt}){
      if(!isId(sessionId)||!Number.isInteger(viewer)||viewer<0||!isId(commandId)||
          typeof signature!=='string'||!signature||receipt?.ok!==false||receipt.commandId!==commandId)
        throw Error(globalThis.PlayroomMessages.text("ui.session-store.e1c7dd72a0d9"));
      await this.transaction(['sessions','receipts'],'readwrite',(tx,_,abort)=>{
        const check=tx.objectStore('sessions').get(sessionId);
        check.onsuccess=()=>{
          if(!check.result){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.a18d186f439f")));return;}
          tx.objectStore('receipts').add({sessionId,viewer,commandId,signature,receipt:clone(receipt)});
        };
      });
    }
    async rotateResumeToken({sessionId,participantId,previousToken,nextToken,previousExpiresAt}){
      if(!isId(sessionId)||!isId(participantId)||![previousToken,nextToken].every(t=>typeof t==='string'&&/^[0-9a-f]{64}$/.test(t))||
          previousToken===nextToken||!Number.isSafeInteger(previousExpiresAt)||previousExpiresAt<0)
        throw Error(globalThis.PlayroomMessages.text("ui.session-store.3e7232a0b597"));
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{
        const sessions=tx.objectStore('sessions'),lookup=sessions.get(sessionId);
        lookup.onsuccess=()=>{
          const entry=lookup.result,rec=entry?.recovery;
          if(rec?.version!==1){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.a151568e2b39")));return;}
          const token=rec.tokens.find(t=>t.participantId===participantId);
          if(!token||token.token!==previousToken){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.4ffa670c37de")));return;}
          token.token=nextToken;token.previousToken=previousToken;token.previousExpiresAt=previousExpiresAt;
          sessions.put({...entry,recovery:rec});
        };
      });
    }
    async setControl(entry){
      const {sessionId,previousControlRevision,paused,controlRevision,viewer,commandId,signature,receipt}=entry;
      if(!isId(sessionId)||typeof paused!=='boolean'||!Number.isSafeInteger(previousControlRevision)||previousControlRevision<0||!Number.isSafeInteger(controlRevision)||controlRevision<previousControlRevision||controlRevision>previousControlRevision+1||!Number.isInteger(viewer)||(viewer<0&&!(viewer===-1&&receipt?.host===true))||!isId(commandId)||typeof signature!=='string'||!receipt?.control||!receipt.ok||receipt.commandId!==commandId||receipt.controlRevision!==controlRevision)throw Error(globalThis.PlayroomMessages.text("ui.session-store.5cb6f12b984f"));
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(sessionId);
        request.onsuccess=()=>{const record=request.result;if(!record||(record.controlRevision||0)!==previousControlRevision){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.64e370251fd2")));return;}
          const controls=record.controlReceipts||[];
          if(controls.length>=20000){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.9a72e8408554")));return;}
          store.put({...record,paused,controlRevision,controlReceipts:[...controls,{viewer,commandId,signature,receipt}],updatedAt:Date.now()});};
      });
    }
    async setPlayerControls(value){
      if(!isId(value?.sessionId)||!Number.isSafeInteger(value.previousRevision)||value.previousRevision<0||value.playerControlRevision!==value.previousRevision+1)throw Error('INVALID_PLAYER_CONTROLS');
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(value.sessionId);
        request.onsuccess=()=>{const record=request.result;
          if(!record||(record.playerControlRevision||0)!==value.previousRevision||record.transfer&&(record.transfer.role==='outgoing'||record.transfer.state!=='active')){abort(Error('PLAYER_CONTROL_CONFLICT'));return;}
          try{const controls=(globalThis.PlayroomPlayerControls||(typeof require==='function'?require('../../core/player-controls.js'):null)).validate(value,record.initial.states[0].players,record.revision);store.put({...record,...controls,updatedAt:Date.now()});}catch(error){abort(error);}
        };
      });
    }
    async saveRoster({sessionId,room,recovery,revision}){
      if(!isId(sessionId)||!isId(room?.id)||recovery?.version!==1||JSON.stringify(recovery.room)!==JSON.stringify(room)||!Array.isArray(recovery.tokens)||!Number.isSafeInteger(revision)||revision<0||room.recovery&&(room.recovery.sessionId!==sessionId||room.recovery.revision!==revision))throw Error(globalThis.PlayroomMessages.text("ui.session-store.15a7edaeb816"));
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(sessionId);
        request.onsuccess=()=>{
          const record=request.result;
          if(!record||record.revision!==revision||record.roomId!==room.id||record.room.ownerId!==room.ownerId||record.game!==room.game?.id||record.packVersion!==room.game?.version){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.9762606b156b")));return;}
          const next=clone(recovery),durable=new Map((record.recovery?.tokens||[]).map(token=>[token.participantId,token]));
          // A captured roster may predate an in-flight credential rotation.
          // Existing identities keep the latest atomically stored credential;
          // explicit removals still revoke it, and new identities add theirs.
          next.tokens=next.tokens.map(token=>clone(durable.get(token.participantId)||token));
          store.put({...record,room:clone(room),recovery:next,updatedAt:Date.now()});
        };
      });
    }
    async remove(sessionId){
      if(!isId(sessionId))throw Error(globalThis.PlayroomMessages.text("ui.session-store.7cf26f51a86a"));
      await this.transaction(['sessions','steps','receipts'],'readwrite',tx=>{
        tx.objectStore('sessions').delete(sessionId);
        for(const name of ['steps','receipts']){const request=tx.objectStore(name).index('sessionId').openCursor(sessionId);request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};}
      });
    }
    async readPrivate(sessionId){
      if(!isId(sessionId))throw Error('HOST_TRANSFER_INVALID');
      return this.transaction(['sessions','steps','receipts'],'readonly',(tx,done)=>{
        const values={},record=tx.objectStore('sessions').get(sessionId),steps=tx.objectStore('steps').index('sessionId').getAll(sessionId),receipts=tx.objectStore('receipts').index('sessionId').getAll(sessionId);
        record.onsuccess=()=>{values.record=record.result;};steps.onsuccess=()=>{values.steps=steps.result;};receipts.onsuccess=()=>{values.receipts=receipts.result;};done(values);
      });
    }
    async stageTransfer(value,engine,Session,hostDeviceId){
      const v=clone(value),r=v.record;if(r?.transfer?.role!=='incoming'||r.transfer.state!=='prepared'||r.room.ownerId!==r.transfer.target||!isId(hostDeviceId))throw Error('HOST_TRANSFER_INVALID');
      Recovery.restore({...v,record:{...r,transfer:undefined}},r.sessionId,engine,Session);
      r.hostDeviceId=hostDeviceId;
      await this.transaction(['sessions','steps','receipts'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(r.sessionId);
        request.onsuccess=()=>{const existing=request.result;if(existing){if(existing.transfer?.id===r.transfer.id)return;
          if(!(existing.transfer?.role==='outgoing'||existing.transfer?.state==='prepared')||existing.revision>r.revision||existing.packDigest!==r.packDigest){abort(Error('HOST_TRANSFER_CONFLICT'));return;}
          let remaining=2;for(const name of ['steps','receipts']){const old=tx.objectStore(name).index('sessionId').getAllKeys(r.sessionId);old.onsuccess=()=>{for(const key of old.result)tx.objectStore(name).delete(key);if(!--remaining)write();};}
        }else write();
          function write(){store.put(r);for(const step of v.steps)tx.objectStore('steps').add(step);for(const receipt of v.receipts)tx.objectStore('receipts').add(receipt);}
        };
      });return r.transfer.id;
    }
    async transferState(sessionId,id,state,metadata={}){
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{const store=tx.objectStore('sessions'),request=store.get(sessionId);request.onsuccess=()=>{
        const r=request.result;if(!r){abort(Error('HOST_TRANSFER_MISSING'));return;}
        if(state==='outgoing'){
          if(r.transfer?.role==='outgoing'&&r.transfer.id===id)return;
          if(r.transfer?.role==='outgoing'){abort(Error('HOST_TRANSFER_CONFLICT'));return;}
          r.transfer={id,role:'outgoing',state:'committed',...metadata};
        }else{
          if(r.transfer?.id!==id||r.transfer.role!=='incoming'){abort(Error('HOST_TRANSFER_CONFLICT'));return;}
          r.transfer.state=state;
        }
        store.put(r);
      };});
    }
    async load(sessionId,engine,Session){return Recovery.restore(await this.readPrivate(sessionId),sessionId,engine,Session);}

    async list(){
      return this.transaction(['sessions'],'readonly',(tx,done)=>{
        const request=tx.objectStore('sessions').getAll();
        request.onsuccess=()=>done(request.result.filter(s=>s.transfer?.role!=='outgoing').map(s=>({sessionId:s.sessionId,roomId:s.roomId,
          firstPlayer:s.firstPlayer,presetId:s.presetId,turnNumber:s.turnNumber,turn:s.turn,turnName:s.turnName,round:s.round||null,game:s.game,packVersion:s.packVersion,revision:s.revision,createdAt:s.createdAt,updatedAt:s.updatedAt,
          name:s.room?.name||'',transportMode:s.room?.transportMode==='online'?'online':'network',hostMode:s.room?.hostMode||'player',finished:!!s.finished,
          players:(s.room?.participants||[]).filter(p=>p.role==='player').map(p=>p.nickname),participants:clone(s.room?.participants||[]).map(person=>{const seats=(s.room?.seats||[]).filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index),playerIndex=seats.findIndex(seat=>seat.participantId===person.id);return {...person,playerIndex,team:s.playerTeams?.[playerIndex]||null};}),transfer:s.transfer?clone(s.transfer):null,role:'host'}))
          .sort((a,b)=>b.updatedAt-a.updatedAt));
      });
    }
    close(){this.database?.close();this.database=null;}
  }
  return NetworkSessionStore;
});
