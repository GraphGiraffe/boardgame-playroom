if(typeof module==='object'&&module.exports&&typeof require==='function')require("../../core/messages.js");
(function(root,factory){
  'use strict';
  const Protocol=root.PlayroomProtocol||(typeof require==='function'?require('../../core/protocol.js'):null);
  const Recovery=root.PlayroomHostRecovery||(typeof require==='function'?require('../../application/host-recovery.js'):null);
  const api=factory(Protocol,Recovery);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomNetworkSessionStore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Protocol,Recovery){
  'use strict';
  const DB_NAME='playroom.network-host.v1',DB_VERSION=2;
  const isId=value=>typeof value==='string'&&value.length>0&&value.length<=128;
  const clone=value=>JSON.parse(JSON.stringify(value));
  const FORMAT='actions-checkpoint-v1',MAX_BYTES=48*1024*1024;
  const compression=()=>globalThis.PlayroomSaveCompression||(typeof require==='function'?require('../../application/save-compression.js'):null);
  const cleanRoom=room=>({...clone(room),events:[]});
  const withoutRoom=recovery=>recovery?{version:1,tokens:clone(recovery.tokens)}:null;
  async function pack(value){const text=JSON.stringify(value);if(text.length<512||!compression())return clone(value);const data=await compression().encode(text,MAX_BYTES);return data&&data.length+64<text.length?{encoding:compression().encoding,data}:clone(value);}
  async function unpack(value){if(!value?.encoding)return value;if(value.encoding!==compression()?.encoding)throw Error('CHECKPOINT_ENCODING_INVALID');return JSON.parse(await compression().decode(value.data,MAX_BYTES));}
  async function packReceipt(row){const {ok,code,revision,commandId:_,...extra}=row.receipt;return {sessionId:row.sessionId,viewer:row.viewer,commandId:row.commandId,h:row.signature.startsWith('sha256:')?row.signature.slice(7):(await Protocol.fingerprint(row.signature)).slice(7),r:[ok,code,revision,...(Object.keys(extra).length?[extra]:[])]};}
  function unpackReceipt(row){if(!/^[0-9a-f]{64}$/.test(row.h)||!Array.isArray(row.r)||row.r.length<3||row.r.length>4)throw Error('CHECKPOINT_RECEIPT_INVALID');return {sessionId:row.sessionId,viewer:row.viewer,commandId:row.commandId,signature:'sha256:'+row.h,receipt:{ok:row.r[0],code:row.r[1],commandId:row.commandId,revision:row.r[2],...(row.r[3]||{})}};}
  function checkpoint(engine,state){const Session=globalThis.TabletopSession||(typeof require==='function'?require('../../core/session.js'):null),Codec=globalThis.PlayroomSessionCodec||(typeof require==='function'?require('../../core/session-codec.js'):null),value=Session.storageState(engine,state);return {state:value,fingerprint:Codec.fingerprint(value)};}

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
      this.indexedDB=indexedDB;this.name=name;this.database=null;this.now=now;this.describe=describe;this.engines=new Map();
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
      if(!isId(sessionId)||!isId(room?.id)||session.current.move!==0||room.game?.id!==session.game||room.game.version!==session.packVersion||(packDigest!==null&&!/^sha256:[0-9a-f]{64}$/.test(packDigest)))throw Error('CHECKPOINT_INVALID');
      if(recovery&&(packDigest===null||recovery.version!==1||recovery.room?.id!==room.id||recovery.room.ownerId!==room.ownerId||!Array.isArray(recovery.tokens)))throw Error('CHECKPOINT_INVALID');
      this.engines.set(sessionId,session.engine);
      const timestamp=this.now(),initial=await pack(session.initialSave()),latest=await pack(checkpoint(session.engine,session.current));
      const record={format:'playroom-network-host',version:2,eventStorage:FORMAT,...(session.current.clock!==undefined?{clockEntriesVersion:1,clockTime:session.clockTime}:{}),sessionId,roomId:room.id,game:session.game,packVersion:session.packVersion,packDigest,room:cleanRoom(room),recovery:withoutRoom(recovery),initial,checkpoint:latest,playerBots:session.current.players.map(player=>player.bot),...this.describe(session.current),revision:0,finished:false,createdAt:timestamp,updatedAt:timestamp};
      await this.transaction(['sessions'],'readwrite',tx=>tx.objectStore('sessions').add(record));return {sessionId,revision:0};
    }
    commit(entry){return this.commitBatch({entries:[entry],receipts:[]});}
    async commitBatch({entries,receipts=[]}){
      if(!Array.isArray(entries)||!entries.length||!Array.isArray(receipts))throw Error('COMMIT_BATCH_INVALID');
      const first=entries[0],last=entries.at(-1),sessionId=first.sessionId;
      for(let i=0;i<entries.length;i++){const row=entries[i];if(row.sessionId!==sessionId||!isId(sessionId)||row.nextState?.move!==row.previousRevision+1||(i&&row.previousRevision!==entries[i-1].nextState.move)||row.action?.actor!==row.viewer||(row.viewer===-1&&(!row.receipt?.hostClock||row.action.command?.type!=='host-clock-v1'||!Number.isSafeInteger(row.action.command.now)))||!row.action.command||typeof row.action.command!=='object'||!isId(row.commandId)||typeof row.signature!=='string'||!row.receipt?.ok||row.receipt.revision!==row.nextState.move||row.receipt.commandId!==row.commandId)throw Error('COMMIT_BATCH_INVALID');}
      for(const row of receipts)if(row.sessionId!==sessionId||row.receipt?.ok!==false||row.receipt.commandId!==row.commandId||row.receipt.revision>last.nextState.move)throw Error('COMMIT_BATCH_INVALID');
      const engine=this.engines.get(sessionId);if(!engine)throw Error('HOST_SESSION_NOT_LOADED');
      const latest=await pack(checkpoint(engine,last.nextState)),accepted=await Promise.all([...entries,...receipts].map(packReceipt));
      await this.transaction(['sessions','steps','receipts'],'readwrite',(tx,_,abort)=>{const sessions=tx.objectStore('sessions'),q=sessions.get(sessionId);q.onsuccess=()=>{const record=q.result;
          if(record?.version!==2||record.eventStorage!==FORMAT||record.revision!==first.previousRevision||record.transfer&&(record.transfer.role==='outgoing'||record.transfer.state!=='active')){abort(Error('CHECKPOINT_CONFLICT'));return;}
          try{if(entries.some(row=>row.nextState.game!==record.game||row.nextState.packVersion!==record.packVersion))throw Error('CHECKPOINT_CONFLICT');
            for(const row of entries)tx.objectStore('steps').add({sessionId,revision:row.nextState.move,a:[row.action.actor,clone(row.action.command),...(row.action.players||row.action.now!==undefined?[row.action.players?clone(row.action.players):null]:[]),...(row.action.now!==undefined?[row.action.now]:[])]});
            for(const row of accepted)tx.objectStore('receipts').add(row);
            sessions.put({...record,...this.describe(last.nextState),checkpoint:latest,...(last.nextState.clock!==undefined?{clockEntriesVersion:1,clockTime:last.nextState.clock,clockUpdatedAt:this.now()}:{}),revision:last.nextState.move,finished:last.nextState.status==='finished',updatedAt:Math.max(this.now(),record.updatedAt)});tx.commit?.();
          }catch(error){abort(error);}};});return last.receipt;
    }
    async recordReceipt(row){
      if(!isId(row?.sessionId)||!Number.isInteger(row.viewer)||row.viewer<0||!isId(row.commandId)||typeof row.signature!=='string'||row.receipt?.ok!==false||row.receipt.commandId!==row.commandId)throw Error('CHECKPOINT_RECEIPT_INVALID');
      const value=await packReceipt(row);await this.transaction(['sessions','receipts'],'readwrite',(tx,_,abort)=>{const q=tx.objectStore('sessions').get(row.sessionId);q.onsuccess=()=>{if(q.result?.version!==2||q.result.eventStorage!==FORMAT){abort(Error('SAVE_FORMAT'));return;}tx.objectStore('receipts').add(value);};});
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
      const {sessionId,previousControlRevision,paused,controlRevision,viewer,commandId,signature,receipt,clockTime,clockUpdatedAt}=entry;
      if(clockTime!==undefined&&(!Number.isSafeInteger(clockTime)||clockTime<0||!Number.isSafeInteger(clockUpdatedAt)||clockUpdatedAt<0))throw Error('CLOCK_INVALID');
      if(!isId(sessionId)||typeof paused!=='boolean'||!Number.isSafeInteger(previousControlRevision)||previousControlRevision<0||!Number.isSafeInteger(controlRevision)||controlRevision<previousControlRevision||controlRevision>previousControlRevision+1||!Number.isInteger(viewer)||(viewer<0&&!(viewer===-1&&receipt?.host===true))||!isId(commandId)||typeof signature!=='string'||!receipt?.control||!receipt.ok||receipt.commandId!==commandId||receipt.controlRevision!==controlRevision)throw Error(globalThis.PlayroomMessages.text("ui.session-store.5cb6f12b984f"));
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(sessionId);
        request.onsuccess=()=>{const record=request.result;if(!record||(record.controlRevision||0)!==previousControlRevision){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.64e370251fd2")));return;}
          const controls=record.controlReceipts||[];
          if(controls.length>=20000){abort(Error(globalThis.PlayroomMessages.text("ui.session-store.9a72e8408554")));return;}
          store.put({...record,paused,controlRevision,...(clockTime!==undefined?{clockTime,clockUpdatedAt}:{}),controlReceipts:[...controls,{viewer,commandId,signature,receipt}],updatedAt:Date.now()});};
      });
    }
    async setPlayerControls(value){
      if(!isId(value?.sessionId)||!Number.isSafeInteger(value.previousRevision)||value.previousRevision<0||value.playerControlRevision!==value.previousRevision+1)throw Error('INVALID_PLAYER_CONTROLS');
      await this.transaction(['sessions'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(value.sessionId);
        request.onsuccess=()=>{const record=request.result;
          if(!record||(record.playerControlRevision||0)!==value.previousRevision||record.transfer&&(record.transfer.role==='outgoing'||record.transfer.state!=='active')){abort(Error('PLAYER_CONTROL_CONFLICT'));return;}
          try{const controls=(globalThis.PlayroomPlayerControls||(typeof require==='function'?require('../../core/player-controls.js'):null)).validate(value,record.playerBots.map(bot=>({bot})),record.revision);store.put({...record,...controls,updatedAt:Date.now()});}catch(error){abort(error);}
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
          store.put({...record,room:cleanRoom(room),recovery:withoutRoom(next),updatedAt:Date.now()});
        };
      });
    }
    async remove(sessionId,{guard=()=>{}}={}){
      if(!isId(sessionId))throw Error(globalThis.PlayroomMessages.text("ui.session-store.7cf26f51a86a"));
      await this.transaction(['sessions','steps','receipts'],'readwrite',(tx,_,abort)=>{
        guard();tx.objectStore('sessions').delete(sessionId);
        for(const name of ['steps','receipts']){const request=tx.objectStore(name).index('sessionId').openCursor(sessionId);request.onsuccess=()=>{try{guard();}catch(error){abort(error);return;}const cursor=request.result;if(cursor){cursor.delete();cursor.continue();}};}
      });
    }
    async readPrivate(sessionId){
      if(!isId(sessionId))throw Error('HOST_TRANSFER_INVALID');
      const value=await this.transaction(['sessions','steps','receipts'],'readonly',(tx,done)=>{const values={},a=tx.objectStore('sessions').get(sessionId),b=tx.objectStore('steps').index('sessionId').getAll(sessionId),c=tx.objectStore('receipts').index('sessionId').getAll(sessionId);a.onsuccess=()=>{values.record=a.result;};b.onsuccess=()=>{values.steps=b.result;};c.onsuccess=()=>{values.receipts=c.result;};done(values);});
      if(!value.record)return value;
      if(value.record.version!==2||value.record.eventStorage!==FORMAT)throw Error('SAVE_FORMAT');
      const record=value.record;[record.initial,record.checkpoint]=await Promise.all([unpack(record.initial),unpack(record.checkpoint)]);
      if(record.recovery)record.recovery={...record.recovery,room:clone(record.room)};
      value.receipts=value.receipts.map(unpackReceipt);return value;
    }
    async stageTransfer(value,engine,Session,hostDeviceId){
      const v=clone(value),r=v.record;if(r?.transfer?.role!=='incoming'||r.transfer.state!=='prepared'||r.room.ownerId!==r.transfer.target||!isId(hostDeviceId))throw Error('HOST_TRANSFER_INVALID');
      Recovery.restore({...v,record:{...r,transfer:undefined}},r.sessionId,engine,Session);
      r.hostDeviceId=hostDeviceId;
      this.engines.set(r.sessionId,engine);const initial=await pack(r.initial),latest=await pack(r.checkpoint),receipts=await Promise.all(v.receipts.map(packReceipt));
      await this.transaction(['sessions','steps','receipts'],'readwrite',(tx,_,abort)=>{
        const store=tx.objectStore('sessions'),request=store.get(r.sessionId);
        request.onsuccess=()=>{const existing=request.result;if(existing){if(existing.transfer?.id===r.transfer.id)return;
          if(!(existing.transfer?.role==='outgoing'||existing.transfer?.state==='prepared')||existing.revision>r.revision||existing.packDigest!==r.packDigest){abort(Error('HOST_TRANSFER_CONFLICT'));return;}
          let remaining=2;for(const name of ['steps','receipts']){const old=tx.objectStore(name).index('sessionId').getAllKeys(r.sessionId);old.onsuccess=()=>{for(const key of old.result)tx.objectStore(name).delete(key);if(!--remaining)write();};}
        }else write();
          function write(){store.put({...r,room:cleanRoom(r.room),recovery:withoutRoom(r.recovery),initial,checkpoint:latest});for(const step of v.steps)tx.objectStore('steps').add(step);for(const receipt of receipts)tx.objectStore('receipts').add(receipt);}
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
    async load(sessionId,engine,Session){this.engines.set(sessionId,engine);return Recovery.restore(await this.readPrivate(sessionId),sessionId,engine,Session);}

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
