if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const records = new WeakMap();
  const History = root.PlayroomHistory || require('./history.js');
  const Codec = root.PlayroomSessionCodec || require('./session-codec.js');
  const systemNow = () => Date.now(); // Default port at the existing integration boundary.
  function clockPort(runtime) {
    if (!runtime || typeof runtime !== 'object' || runtime.now !== undefined && typeof runtime.now !== 'function') throw Error('Invalid session clock');
    return runtime.now || systemNow;
  }
  function readTime(now) {const value=now();if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid session clock');return value;}
  function history(states, engine) {
    return new History(states, {revision:state=>state.move, validate:state=>engine.validateState?.(state)!==false,
      compact:state=>state.events?.length>4?{...state,events:state.events.slice(-4)}:state});
  }
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function envelope(session) {
    const {game, options, createdAt, updatedAt, history} = records.get(session);
    return {format: 'playroom-session', version: 1, game, packVersion:session.packVersion, options, createdAt, updatedAt, states:history.states};
  }
  class Session {
    constructor(engine, game, options = {}, runtime = {}) {
      if (!isRecord(options)) throw new Error(globalThis.PlayroomMessages.text("ui.session.d42d73265b68"));
      const packVersion = options.packVersion || engine.get(game).version || '0.1.0';
      const configured=clone({...options, seed:options.seed??Math.random().toString(36).slice(2), packVersion}),now=clockPort(runtime),createdAt=readTime(now);
      const initial=engine.createGame(game,clone(configured));
      // Freeze resolved names/preset as well as entropy; future UI defaults are not replay inputs.
      const ownedOptions=freeze({...configured,preset:initial.preset,players:initial.players.map((player,index)=>({...configured.players?.[index],name:player.name,bot:player.bot,...(player.avatar?{avatar:player.avatar}:{})}))});
      records.set(this, {engine, game, options: ownedOptions, now, createdAt, updatedAt: createdAt,
        history: history([initial], engine), actions:[], preparedActions:new WeakMap()});
    }
    get engine() { return records.get(this).engine; }
    get game() { return records.get(this).game; }
    get packVersion() { return this.options.packVersion || this.current.packVersion || '0.1.0'; }
    get options() { return records.get(this).options; }
    get states() { return records.get(this).history.states; }
    get createdAt() { return records.get(this).createdAt; }
    get updatedAt() { return records.get(this).updatedAt; }
    get current() { return this.states[this.states.length - 1]; }
    // Room membership is authority-owned. Install the replacement roster before
    // the next real move, retaining historical players and event attribution.
    playerMetadata(index) { return clone(records.get(this).playerMetadata?.[index] || {}); }
    setPlayerMetadata(index, metadata) {
      if (!Number.isInteger(index) || index < 0 || index >= this.current.players.length || !isRecord(metadata) ||
          !Object.keys(metadata).length || Object.keys(metadata).some(key => !['name','bot','avatar','botSettings'].includes(key)) ||
          (metadata.name !== undefined && (typeof metadata.name !== 'string' || !metadata.name.trim() || metadata.name.length > 40)) ||
          (metadata.bot !== undefined && typeof metadata.bot !== 'boolean') ||
          (metadata.botSettings !== undefined && (!isRecord(metadata.botSettings) || Object.keys(metadata.botSettings).some(key=>!['strategy','difficulty','resolvedStrategy'].includes(key)||typeof metadata.botSettings[key]!=='string'||metadata.botSettings[key].length>64) || !['easy','medium','hard'].includes(metadata.botSettings.difficulty))) ||
          (metadata.avatar != null && (typeof metadata.avatar !== 'string' || !/^(crescent|triangle|square|circle|star|rectangle|diamond|hexagon)-(red|orange|yellow|green|blue|purple)$/.test(metadata.avatar)))) throw Error(globalThis.PlayroomMessages.text("ui.session.d1e2fa296dc9"));
      const record = records.get(this);
      record.playerMetadata ||= {};
      record.playerMetadata[index] = {...record.playerMetadata[index], ...clone(metadata)};
      record.history.invalidate();
    }
    // The candidate is not applied to the live session. A network host may
    // persist it atomically with its command receipt before committing it.
    prepare(actor, action) {
      const record=records.get(this);
      const command=clone(action);
      // The same decoration fields are excluded by engine command matching.
      for(const key of ['label','notify','confirmation','targetPrompt','targetKind','disabled'])if(command)delete command[key];
      freeze(command);
      const candidate=record.history.prepare(previous => {
        const changes = [];
        let input = previous;
        for (const [key, metadata] of Object.entries(record.playerMetadata || {})) {
          const index = Number(key), player = previous.players[index];
          if (Object.keys(metadata).some(field => player[field] !== metadata[field])) changes.push({index,...metadata});
        }
        if (changes.length) {
          input = clone(previous);
          for (const {index,...metadata} of changes) Object.assign(input.players[index], metadata);
        }
        let next = this.engine.applyAction(input, actor, action);
        if (next === input) next = previous;
        else {
          if (changes.length) next.playerChanges = changes;
          else delete next.playerChanges;
          freeze(next);
        }
        return next;
      });
      if(candidate!==this.current&&record.actions){
        record.preparedActions.set(candidate,freeze({actor,command,...(candidate.playerChanges?{players:clone(candidate.playerChanges)}:{})}));
      }
      return candidate;
    }
    commitPrepared(next) {
      const record=records.get(this),previous=this.current;
      try { record.history.commit(next); }
      catch(error) {if(error.code==='HISTORY_PREPARED_INVALID')throw Error('Prepared transition is no longer current');throw error;}
      if(next===previous)return previous;
      if(record.actions){
        const entry=record.preparedActions.get(next);
        // A missing command must never produce an incomplete replay log.
        if(entry){record.actions.push(entry);record.preparedActions.delete(next);}else record.actions=null;
      }
      // Serialization is an optimization. A failed cache update must not
      // invalidate a transition already committed to durable storage.
      if (record.saveCache) {
        try { record.saveCache.states.push(Codec.encodeSnapshot(record.saveCache, next)); }
        catch (_) { record.saveCache = null; }
      }
      try { record.updatedAt=Math.max(readTime(record.now),record.updatedAt); }
      catch (_) { /* Clock failure cannot undo an already durable transition. */ }
      return next;
    }
    act(actor, action) { return this.commitPrepared(this.prepare(actor, action)); }
    view(player, index = this.states.length - 1) {
      if (!Number.isInteger(index)) throw new Error(globalThis.PlayroomMessages.text("ui.session.ae7a7f8eb000"));
      const state = this.states[Math.max(0, Math.min(index, this.states.length - 1))];
      return this.engine.project(state, player);
    }
    export() { return clone(envelope(this)); }
    serialize({compact = true, history:historyFormat = 'actions'} = {}) {
      if (!compact) return JSON.stringify(envelope(this));
      const record = records.get(this);
      if(historyFormat==='actions'&&record.actions)return JSON.stringify({format:'playroom-session',version:3,encoding:'actions-v1',game:this.game,packVersion:this.packVersion,options:this.options,createdAt:this.createdAt,updatedAt:this.updatedAt,actions:record.actions,end:{move:this.current.move,fingerprint:Codec.fingerprint(this.current)}});
      if (!record.saveCache) {
        record.saveCache = Codec.create();
        record.saveCache.states = this.states.map(state => Codec.encodeSnapshot(record.saveCache, state));
      }
      const codec = record.saveCache, options = codec.encode(this.options);
      const journal = this.current.events.map(codec.encode);
      return JSON.stringify({format: 'playroom-session', version: 2, encoding: 'interned-json-v1',
        game: this.game, packVersion:this.packVersion, options, createdAt: this.createdAt, updatedAt: this.updatedAt,
        states: codec.states, journal, nodes: codec.nodes});
    }
    static restoreActions(engine,saved,runtime={}) {
      try {
        const log=Codec.actionLog(saved);
        // Constructor gets a fixed clock; loading never consults the live clock or bot policy.
        const initial=new Session(engine,log.game,log.options,{now:()=>log.createdAt});
        // Validate the envelope once, then reuse the generated immutable timeline.
        const replay=Session.restore(engine,initial.export(),{now:()=>log.createdAt});
        const record=records.get(replay);record.actions=[];record.preparedActions=new WeakMap();
        for(const entry of log.actions){
          for(const {index,...metadata} of entry.players||[])replay.setPlayerMetadata(index,metadata);
          const before=replay.current;
          replay.act(entry.actor,entry.command);
          if(replay.current===before)throw Error('No-op in action history');
        }
        if(Codec.fingerprint(replay.current)!==log.end.fingerprint)throw Error('Action history mismatch');
        record.updatedAt=log.updatedAt;record.now=clockPort(runtime);
        return replay;
      }catch(error){
        if(error.code==='PACK_VERSION_MISSING')throw error;
        throw new Error(globalThis.PlayroomMessages.text('ui.session.2bd4c477be41'));
      }
    }
    static packVersionOf(saved) { return saved?.packVersion; }
    static restore(engine, saved, runtime = {}) {
      if(isRecord(saved)&&saved.format==='playroom-session'&&saved.version===3)return Session.restoreActions(engine,saved,runtime);
      if (!isRecord(saved) || saved.format !== 'playroom-session' || ![1, 2].includes(saved.version) ||
          typeof saved.game !== 'string' || !Array.isArray(saved.states) || !saved.states.length) {
        throw new Error(globalThis.PlayroomMessages.text("ui.session.a423ffa2da9e"));
      }
      let data;
      try {
        data = saved.version === 2 ? Codec.decode(saved) : clone(saved);
        const options = data.options;
        if (!isRecord(options) || (options.mode !== undefined && !['solo', 'pass'].includes(options.mode)) ||
            (options.openHands !== undefined && typeof options.openHands !== 'boolean') ||
            (options.players !== undefined && (!Array.isArray(options.players) || options.players.some(p => !isRecord(p)))) ||
            !Number.isSafeInteger(data.createdAt) || data.createdAt < 0 ||
            !Number.isSafeInteger(data.updatedAt) || data.updatedAt < data.createdAt) throw Error('Invalid envelope');
        const packVersion = Session.packVersionOf(data);
        if(typeof packVersion!=='string'||!packVersion)throw Error('PACK_VERSION_REQUIRED');
        engine.get(data.game, packVersion);
        if (options.packVersion !== undefined && options.packVersion !== packVersion) throw Error('Inconsistent pack version');
        options.packVersion = packVersion;data.packVersion = packVersion;
        const initial = data.states[0];
        for (let index = 0; index < data.states.length; index++) {
          const state = data.states[index];
          if ((state.packVersion || '0.1.0') !== packVersion) throw Error('Mixed pack versions');
          if (state.packVersion === undefined) state.packVersion = packVersion;
          engine.validateState(state);
          if (state.game !== data.game || state.move !== index || state.preset !== initial.preset ||
              state.openHands !== initial.openHands || state.players.length !== initial.players.length ||
              (index > 0 && data.states[index - 1].status !== 'playing')) throw Error('Invalid timeline');
          const prior = index ? data.states[index - 1].players : state.players, changes = state.playerChanges || [];
          if (!Array.isArray(changes) || (!index && changes.length) || new Set(changes.map(change => change?.index)).size !== changes.length ||
              changes.some(change => !isRecord(change) || !Number.isInteger(change.index) || change.index < 0 || change.index >= state.players.length ||
                Object.keys(change).some(key => !['index','name','bot','avatar'].includes(key)) || Object.keys(change).length < 2 ||
                (change.name !== undefined && (typeof change.name !== 'string' || !change.name.trim() || change.name.length > 40)) ||
                (change.bot !== undefined && typeof change.bot !== 'boolean') ||
                (change.avatar != null && (typeof change.avatar !== 'string' || !/^(crescent|triangle|square|circle|star|rectangle|diamond|hexagon)-(red|orange|yellow|green|blue|purple)$/.test(change.avatar))))) throw Error('Invalid player changes');
          const expected = prior.map(player => ({name:player.name,bot:player.bot,avatar:player.avatar||null}));
          for (const {index:player,...metadata} of changes) Object.assign(expected[player], metadata);
          if (state.players.some((player, p) => player.name !== expected[p].name || player.bot !== expected[p].bot || (player.avatar||null)!==(expected[p].avatar||null))) throw Error('Undeclared player changes');
        }
        if ((options.preset !== undefined && options.preset !== initial.preset) ||
            Boolean(options.openHands) !== initial.openHands ||
            (options.players && options.players.length !== initial.players.length)) throw Error('Inconsistent options');
      } catch (error) {
        if (error.code === 'PACK_VERSION_MISSING') { error.message = globalThis.PlayroomMessages.text("ui.session.071e658556c9",{p0:String(error.message)}); throw error; }
        throw new Error(globalThis.PlayroomMessages.text("ui.session.2bd4c477be41"));
      }
      const session = Object.create(Session.prototype);
      // Explicit fields prevent imported keys from replacing methods/getters or
      // modifying the session prototype. Restoring does not rerun pack.create().
      records.set(session, {engine, game: data.game, options: freeze(data.options),
        now:clockPort(runtime), createdAt: data.createdAt, updatedAt: data.updatedAt, history:history(data.states,engine)});
      return session;
    }
  }
  root.TabletopSession = Session;
  if (typeof module !== 'undefined' && module.exports) module.exports = Session;
})(globalThis);
