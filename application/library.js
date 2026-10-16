// Portable library operations. Storage, engine, Session and IDs are caller ports.
(function (root,factory) {
  const Library=factory();
  if(typeof module==='object'&&module.exports)module.exports=Library;
  root.PlayroomSessionLibrary=Library;
})(globalThis,function () {
  'use strict';
  const ACTIVE = 'playroom.session.v1', PREFIX = 'playroom.paused.v1.';
  const fail=code=>{const error=Error(code);error.code=code;throw error;};
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
    constructor(storage, engine, Session, packs = null, {idFactory=()=>fail('LIBRARY_ID_SOURCE_REQUIRED')}={}) {
      this.storage=storage;this.engine=engine;this.Session=Session;this.packs=packs;this.idFactory=idFactory;
    }
    summary(session){
      const state=session.current,round=this.engine.project?.(state,-1)?.scene?.round||null;
      return JSON.parse(JSON.stringify({formatVersion:1,game:session.game,packVersion:session.packVersion,
        createdAt:session.createdAt,updatedAt:session.updatedAt,mode:session.options.mode,preset:session.options.presetLabel,
        players:state.players.map(player=>player.name),
        participants:(session.options.lobbyConfig?.participants||state.players.map(player=>({nickname:player.name,avatar:player.avatar||null,bot:player.bot,local:true,role:'player'})))
          .map(({nickname,name,avatar,bot,local,role})=>({nickname:nickname||name,avatar:avatar||null,bot:!!bot,local:!!local,role})),
        round,turnNumber:state.timeline?.turn||null,turn:state.turn,turnName:state.players[state.turn]?.name||null,move:state.move,finished:state.status==='finished',
        outcome:state.status==='finished'?{winner:state.winner,winners:state.winners||[]}:null}));
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
      return this.records().map(record => {
        try {
          const indexed=header(record.raw)?.librarySummary;
          const summary=indexed||this.summary(this.Session.restore(this.engine,JSON.parse(record.raw)));
          if(this.packs&&!this.packs.list().some(item=>item.id===summary.game&&item.version===summary.packVersion))
            return {id:record.id,active:record.active,missingPack:true,game:summary.game,packVersion:summary.packVersion,updatedAt:summary.updatedAt};
          return {...summary,id:record.id,active:record.active};
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
    current() {
      const raw = this.storage().getItem(ACTIVE);
      return raw ? {id:identity(raw), session:this.restore(JSON.parse(raw))} : null;
    }
    open(id) {
      const record = this.records().find(record => record.id === id);
      if (!record) fail('LIBRARY_NOT_FOUND');
      return this.restore(JSON.parse(record.raw));
    }
    write(session, id) {
      const store = this.storage(), active = store.getItem(ACTIVE);
      const key = active && identity(active) === id ? ACTIVE : PREFIX + id;
      if (key !== ACTIVE && !store.getItem(key)) fail('LIBRARY_REMOVED');
      store.setItem(key, this.encode(session,id));
    }
    encode(session, id) {
      const raw = session.serialize();
      if(typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(id))fail('LIBRARY_ID_INVALID');
      return '{"librarySummary":'+JSON.stringify(this.summary(session))+',"libraryId":'+JSON.stringify(id)+','+raw.slice(1);
    }
    activate(session, id) {
      const store = this.storage(), previous = store.getItem(ACTIVE);
      // Both writes are atomic. If either fails, the previous active save survives.
      if (previous && identity(previous) !== id) store.setItem(PREFIX + identity(previous), previous);
      store.setItem(ACTIVE, this.encode(session,id));
      // Cleanup is optional: records() prefers the active version if both remain.
      try { store.removeItem(PREFIX + id); } catch (_) {}
    }
    remove(id) {
      const store = this.storage(), active = store.getItem(ACTIVE);
      store.removeItem(PREFIX + id);
      if (active && identity(active) === id) store.removeItem(ACTIVE);
    }
    newId() { return this.idFactory(); }
  }
  return Library;
});
