// Portable library operations. Storage, engine, Session and IDs are caller ports.
(function (root,factory) {
  const Library=factory();
  if(typeof module==='object'&&module.exports)module.exports=Library;
  root.PlayroomSessionLibrary=Library;
})(globalThis,function () {
  'use strict';
  const ACTIVE = 'playroom.session.v1', PREFIX = 'playroom.paused.v1.';
  const fail=code=>{const error=Error(code);error.code=code;throw error;};
  function seriesReference(match) {
    return match?.series?.version===1&&typeof match.series.id==='string'&&match.series.id&&
      Number.isSafeInteger(match.number)&&match.number>0?{id:match.series.id,number:match.number}:null;
  }
  function header(raw){
    if(!raw.startsWith('{"librarySummary":'))return null;
    const boundary=raw.indexOf(',"format":');
    if(boundary<0||boundary>131072)return null;
    const data=JSON.parse(raw.slice(0,boundary)+'}'),summary=data.librarySummary;
    if(summary?.formatVersion!==1||typeof summary.game!=='string'||typeof summary.packVersion!=='string'||
       !Number.isSafeInteger(summary.createdAt)||!Number.isSafeInteger(summary.updatedAt)||summary.updatedAt<summary.createdAt||
       !Array.isArray(summary.players)||!summary.players.length||summary.players.some(name=>typeof name!=='string'||name.length>40)||
       !Number.isSafeInteger(summary.move)||summary.move<0||typeof summary.finished!=='boolean'||
       typeof data.libraryId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(data.libraryId))return null;
    return data;
  }
  function identity(raw) {
    try {
      const saved = header(raw)||JSON.parse(raw);
      if (typeof saved.libraryId === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(saved.libraryId)) return saved.libraryId;
      if (typeof saved.game === 'string' && Number.isFinite(saved.createdAt)) return 'legacy-' + saved.game + '-' + saved.createdAt;
    } catch (_) {}
    let hash = 2166136261;
    for (let i = 0; i < raw.length; i++) hash = Math.imul(hash ^ raw.charCodeAt(i), 16777619);
    return 'unreadable-' + (hash >>> 0).toString(36);
  }
  class Library {
    #historyEntry=null;
    constructor(storage, engine, Session, packs = null, {idFactory=()=>fail('LIBRARY_ID_SOURCE_REQUIRED')}={}) {
      this.storage=storage;this.engine=engine;this.Session=Session;this.packs=packs;this.idFactory=idFactory;
    }
    primary(participants,setup){const occupied=setup?.seats?.filter(seat=>seat.participantId).sort((a,b)=>a.index-b.index);return occupied?occupied.findIndex(seat=>seat.participantId===setup.ownerId):participants.findIndex(p=>!p.bot);}
    summary(session){return JSON.parse(JSON.stringify(this.#summaryFields(session)));}
    #summaryFields(session){
      const state=session.current,progress=this.engine.publicProgress?.(state)??this.engine.project?.(state,-1)?.scene;
      const primary=this.primary(state.players,session.options.lobbyConfig);
      const teams=new Map((progress?.players||[]).map(person=>[person.player,person.team]));
      return {formatVersion:1,game:session.game,packVersion:session.packVersion,
        roomName:session.options.lobbyConfig?.name||session.options.portableRoomName||'',createdAt:session.createdAt,updatedAt:session.updatedAt,mode:session.options.mode,preset:session.options.presetLabel,
        players:state.players.map(player=>player.name),
        firstPlayer:state.firstPlayer,presetId:state.preset,
        participants:state.players.map((player,index)=>({nickname:player.name,avatar:player.avatar||null,bot:!!player.bot,local:!player.bot,primary:index===primary,role:'player',playerIndex:index,team:teams.get(index)||null})),
        round:progress?.round||null,turnNumber:state.timeline?.turn||null,turn:state.turn,turnName:state.players[state.turn]?.name||null,move:state.move,finished:state.status==='finished',
        outcome:state.status==='finished'?{winner:state.winner,winners:state.winners||[]}:null,
        matchSeries:seriesReference(session.options.matchSeries)};
    }
    version(saved) { return this.Session.packVersionOf?.(saved) || saved.packVersion || '0.1.0'; }
    references(game, version) {
      return this.records().filter(record => {
        try { const saved = header(record.raw)?.librarySummary||JSON.parse(record.raw); return saved.game === game && this.version(saved) === version; }
        catch (_) { return false; }
      }).map(record => record.id);
    }
    restore(saved) {
      this.packs?.activate(saved.game, this.version(saved));
      return this.Session.restore(this.engine, saved);
    }
    records() {
      const store = this.storage(), records = new Map(), active = store.getItem(ACTIVE);
      if (active) records.set(identity(active), {id:identity(active), raw:active, active:true});
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const raw = store.getItem(key), id = key.slice(PREFIX.length);
        if (raw && !records.has(id)) records.set(id, {id, raw, active:false});
      }
      return [...records.values()];
    }
    list() {
      const previous=this.summaryCache||new Map(),next=new Map();this.summaryCache=next;
      return this.records().map(record => {
        try {
          const indexed=header(record.raw)?.librarySummary;
          let summary=indexed;
          if(!summary){const cached=previous.get(record.id);const value=cached?.raw===record.raw?cached.summary:this.summary(this.Session.restore(this.engine,JSON.parse(record.raw)));next.set(record.id,{raw:record.raw,summary:value});summary=JSON.parse(JSON.stringify(value));}
          if(this.packs&&!this.packs.list().some(item=>item.id===summary.game&&item.version===summary.packVersion))
            return {id:record.id,active:record.active,missingPack:true,game:summary.game,packVersion:summary.packVersion,updatedAt:summary.updatedAt};
          const participants=summary.participants?.map((p,index,all)=>({...p,primary:p.primary??(index===all.findIndex(person=>!person.bot))}));
          return {...summary,...participants?{participants}:{},id:record.id,active:record.active};
        } catch (_) {
          try {
            const saved=JSON.parse(record.raw),version=this.version(saved);
            if(this.packs && typeof saved.game==='string' && !this.packs.list().some(item=>item.id===saved.game&&item.version===version))
              return {id:record.id,active:record.active,missingPack:true,game:saved.game,packVersion:version,updatedAt:saved.updatedAt||0};
          } catch (_) {}
          return {id:record.id, active:record.active, invalid:true, updatedAt:0};
        }
      }).sort((a,b) => b.updatedAt - a.updatedAt || Number(b.active) - Number(a.active));
    }
    currentId() {
      const raw=this.storage().getItem(ACTIVE);
      if(!raw){this.activeIdentity=null;return null;}
      if(this.activeIdentity?.raw===raw)return this.activeIdentity.id;
      const id=identity(raw);this.activeIdentity={raw,id};return id;
    }
    isLatestSeriesMatch(session,id) {
      const match=seriesReference(session.options.matchSeries);
      if(!match)return false;
      let found=false;
      for(const record of this.records()){
        try {
          const summary=header(record.raw)?.librarySummary;
          if(summary&&summary.game!==session.game)continue;
          // Older saves have the same series link in Session options. The
          // index keeps newer scans independent of journal length and packs.
          const other=summary&&Object.hasOwn(summary,'matchSeries')
            ?summary.matchSeries:seriesReference(JSON.parse(record.raw).options?.matchSeries);
          if(other?.id!==match.id)continue;
          if(record.id===id){found=other.number===match.number;continue;}
          if(other.number>=match.number)return false;
        } catch (_) {}
      }
      return found;
    }
    current() {
      const raw = this.storage().getItem(ACTIVE);
      return raw ? {id:identity(raw), session:this.restore(JSON.parse(raw))} : null;
    }
    #record(id) {
      const record = this.records().find(record => record.id === id);
      if (!record) fail('LIBRARY_NOT_FOUND');
      return record;
    }
    open(id) {
      return this.restore(JSON.parse(this.#record(id).raw));
    }
    openHistory(id) {
      const {raw}=this.#record(id),cached=this.#historyEntry;
      // History navigation owns one read-only bookmark. Playing a save uses
      // open() so it cannot advance an instance retained for later viewing.
      if(cached?.id===id&&cached.raw===raw){
        const {game,packVersion}=cached.session;
        this.packs?.activate(game,packVersion);
        if(this.engine.get(game,packVersion)===cached.rules)return cached.session;
      }
      const session=this.restore(JSON.parse(raw));
      this.#historyEntry={id,raw,session,rules:this.engine.get(session.game,session.packVersion)};
      return session;
    }
    write(session, id) {
      return this.writeRaw(this.encode(session,id),id);
    }
    writeRaw(raw,id) {
      const store = this.storage(), active = store.getItem(ACTIVE);
      const key = active && identity(active) === id ? ACTIVE : PREFIX + id;
      if (key !== ACTIVE && !store.getItem(key)) fail('LIBRARY_REMOVED');
      store.setItem(key, raw);
      if(this.#historyEntry?.id===id&&this.#historyEntry.raw!==raw)this.#historyEntry=null;
    }
    encode(session, id,{roomName}={}) {
      const raw = session.serialize();
      if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))fail('LIBRARY_ID_INVALID');
      // Serialize the summary's borrowed fields directly; public callers of
      // summary() still receive an independent object.
      const summary=this.#summaryFields(session);
      if(roomName!==undefined)summary.roomName=String(roomName).slice(0,100);
      return '{"librarySummary":'+JSON.stringify(summary)+',"libraryId":'+JSON.stringify(id)+','+raw.slice(1);
    }
    activate(session, id) {
      return this.activateRaw(this.encode(session,id),id);
    }
    activateRaw(next,id) {
      const store = this.storage(), previous = store.getItem(ACTIVE);
      // Both writes are atomic. If either fails, the previous active save survives.
      if (previous && identity(previous) !== id) {
        const archiveKey=PREFIX+identity(previous);
        if(store.getItem(archiveKey)!==previous)store.setItem(archiveKey,previous);
      }
      store.setItem(ACTIVE, next);
      // Cleanup is optional: records() prefers the active version if both remain.
      try { store.removeItem(PREFIX + id); } catch (_) {}
    }
    remove(id) {
      this.summaryCache?.delete(id);if(this.activeIdentity?.id===id)this.activeIdentity=null;
      if(this.#historyEntry?.id===id)this.#historyEntry=null;
      const store = this.storage(), active = store.getItem(ACTIVE);
      store.removeItem(PREFIX + id);store.removeItem(this.statusKey('local:'+id));
      if (active && identity(active) === id) store.removeItem(ACTIVE);
    }
    statusKey(key){if(typeof key!=='string'||key.length>1024||!key.match(/^(local|network):.+/))fail('LIBRARY_STATUS_INVALID');return 'playroom.match-status.v1.'+encodeURIComponent(key);}
    archived(key){return this.storage().getItem(this.statusKey(key))==='archived';}
    replaceAsync(session,id,roomName='',{guard=()=>{}}={}){const raw=this.encode(session,id,{roomName});return this.persist(()=>{guard();if(!this.records().some(row=>row.id===id))fail('LIBRARY_REMOVED');this.writeRaw(raw,id);},{guard});}
    setArchivedAsync(key,value,{guard=()=>{}}={}){const statusKey=this.statusKey(key);if(typeof value!=='boolean')fail('LIBRARY_STATUS_INVALID');if(this.archived(key)===value){guard();return Promise.resolve();}return this.persist(()=>{guard();value?this.storage().setItem(statusKey,'archived'):this.storage().removeItem(statusKey);},{guard});}
    persist(operation,options) { return this.storage().transact?this.storage().transact(operation,options):Promise.resolve().then(operation); }
    writeAsync(session,id) { const raw=this.encode(session,id);return this.persist(()=>this.writeRaw(raw,id)); }
    activateAsync(session,id,{guard=()=>{}}={}) {
      const raw=this.encode(session,id);
      return this.persist(()=>{guard();return this.activateRaw(raw,id);},{guard});
    }
    removeAsync(id,{guard=()=>{}}={}) { return this.persist(()=>{guard();return this.remove(id);},{guard}); }
    importAsync(session,id,roomName='',guard=()=>{}) {
      const raw=this.encode(session,id,{roomName});
      return this.persist(()=>{guard();const store=this.storage();if(this.records().some(row=>row.id===id))fail('LIBRARY_ID_CONFLICT');store.setItem(PREFIX+id,raw);});
    }
    newId() { return this.idFactory(); }
  }
  return Library;
});
