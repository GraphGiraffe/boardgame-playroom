(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const records = new WeakMap();
  const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function freeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function envelope(session) {
    const {game, options, createdAt, updatedAt, states} = records.get(session);
    return {format: 'playroom-session', version: 1, game, packVersion:session.packVersion, options, createdAt, updatedAt, states};
  }
  // Version 2 interns repeated JSON subtrees. References are single-item arrays;
  // actual arrays/objects live in explicitly tagged nodes, in dependency order.
  function createCodec() {
    const nodes = [], signatures = new Map(), identities = new WeakMap();
    function encode(value) {
      if (value === null || typeof value !== 'object') return value;
      if (identities.has(value)) return [identities.get(value)];
      const node = Array.isArray(value) ? ['a', value.map(encode)] :
        ['o', Object.entries(value).flatMap(([key, item]) => [key, encode(item)])];
      const signature = JSON.stringify(node);
      let id = signatures.get(signature);
      if (id === undefined) { id = nodes.length; nodes.push(node); signatures.set(signature, id); }
      identities.set(value, id);
      return [id];
    }
    return {nodes, encode, states: []};
  }
  function encodeSnapshot(codec, state) {
    return codec.encode({...state, events: state.events.slice(-4)});
  }
  function decodeCompact(saved) {
    const MAX_NODES = 200000, MAX_DEPTH = 128, MAX_ENTRIES = 2000000, MAX_SIZE = 32 * 1024 * 1024;
    const fail = () => { throw Error('Invalid compact save'); };
    if (saved.encoding !== 'interned-json-v1' || !Array.isArray(saved.nodes) ||
        saved.nodes.length > MAX_NODES || !Array.isArray(saved.states) || !saved.states.length ||
        !Array.isArray(saved.journal)) fail();
    const values = [], sizes = [], depths = [];
    let entries = 0;
    function decode(item, before) {
      if (++entries > MAX_ENTRIES) fail();
      if (Array.isArray(item)) {
        const id = item[0];
        if (item.length !== 1 || !Number.isInteger(id) || id < 0 || id >= before) fail();
        return {value: values[id], size: sizes[id], depth: depths[id]};
      }
      if (item !== null && !['string', 'number', 'boolean'].includes(typeof item)) fail();
      if (typeof item === 'number' && !Number.isFinite(item)) fail();
      const size = JSON.stringify(item).length;
      if (size > MAX_SIZE) fail();
      return {value: item, size, depth: 0};
    }
    for (let id = 0; id < saved.nodes.length; id++) {
      const node = saved.nodes[id];
      if (!Array.isArray(node) || node.length !== 2 || !['a', 'o'].includes(node[0]) ||
          !Array.isArray(node[1]) || node[1].length > MAX_ENTRIES) fail();
      const payload = node[1], array = node[0] === 'a', value = array ? [] : {};
      if (!array && payload.length % 2) fail();
      let size = 2, depth = 1;
      const keys = new Set();
      for (let at = 0; at < payload.length; at += array ? 1 : 2) {
        const key = array ? at : payload[at];
        if (!array && (typeof key !== 'string' || keys.has(key))) fail();
        keys.add(key);
        const item = decode(payload[at + (array ? 0 : 1)], id);
        if (array) value.push(item.value);
        // Defining an own property treats __proto__ as data, never as a setter.
        else Object.defineProperty(value, key, {value: item.value, enumerable: true, writable: true, configurable: true});
        size += item.size + 1 + (array ? 0 : JSON.stringify(key).length + 1);
        depth = Math.max(depth, item.depth + 1);
        if (size > MAX_SIZE || depth > MAX_DEPTH) fail();
      }
      values.push(value); sizes.push(size); depths.push(depth);
    }
    const states = [], journal = [];
    let totalSize = 0;
    for (const reference of saved.states) {
      if (!Array.isArray(reference)) fail();
      const item = decode(reference, values.length);
      totalSize += item.size;
      if (totalSize > MAX_SIZE || !isRecord(item.value)) fail();
      states.push(item.value);
    }
    for (const reference of saved.journal) {
      if (!Array.isArray(reference)) fail();
      const item = decode(reference, values.length);
      totalSize += item.size;
      if (totalSize > MAX_SIZE || !isRecord(item.value)) fail();
      journal.push(item.value);
    }
    const decodedOptions = decode(saved.options, values.length);
    if (totalSize + decodedOptions.size > MAX_SIZE) fail();
    const options = decodedOptions.value;
    if (!Array.isArray(states[states.length - 1].events) ||
        JSON.stringify(states[states.length - 1].events) !== JSON.stringify(journal.slice(-4))) fail();
    // Only the live state regains the complete journal; previous snapshots keep
    // their original recent events. Shallow replacement avoids mutating a node.
    states[states.length - 1] = {...states[states.length - 1], events: journal};
    return {format: 'playroom-session', version: 1, game: saved.game, packVersion:saved.packVersion, options,
      createdAt: saved.createdAt, updatedAt: saved.updatedAt, states};
  }
  class Session {
    constructor(engine, game, options = {}) {
      if (!isRecord(options)) throw new Error('Некорректные параметры сессии');
      const packVersion = options.packVersion || engine.get(game).version || '0.1.0';
      const ownedOptions = freeze(clone({...options, packVersion})), createdAt = Date.now();
      records.set(this, {engine, game, options: ownedOptions, createdAt, updatedAt: createdAt,
        states: freeze([engine.createGame(game, clone(ownedOptions))])});
    }
    get engine() { return records.get(this).engine; }
    get game() { return records.get(this).game; }
    get packVersion() { return this.options.packVersion || this.current.packVersion || '0.1.0'; }
    get options() { return records.get(this).options; }
    get states() { return records.get(this).states; }
    get createdAt() { return records.get(this).createdAt; }
    get updatedAt() { return records.get(this).updatedAt; }
    get current() { return this.states[this.states.length - 1]; }
    act(actor, action) {
      const record = records.get(this);
      const next = freeze(this.engine.applyAction(this.current, actor, action));
      // The live state keeps the complete event stream. Older board snapshots
      // only need their recent events, avoiding quadratic save-file growth.
      const previous = this.current;
      if (previous.events?.length > 4) {
        const compacted = freeze({...previous, events: previous.events.slice(-4)});
        record.states = Object.freeze([...this.states.slice(0, -1), compacted, next]);
      } else {
        record.states = Object.freeze([...this.states, next]);
      }
      if (record.saveCache) record.saveCache.states.push(encodeSnapshot(record.saveCache, next));
      record.updatedAt = Math.max(Date.now(), record.updatedAt);
      return next;
    }
    view(player, index = this.states.length - 1) {
      if (!Number.isInteger(index)) throw new Error('Номер снимка должен быть целым числом');
      const state = this.states[Math.max(0, Math.min(index, this.states.length - 1))];
      return this.engine.project(state, player);
    }
    export() { return clone(envelope(this)); }
    serialize({compact = true} = {}) {
      if (!compact) return JSON.stringify(envelope(this));
      const record = records.get(this);
      if (!record.saveCache) {
        record.saveCache = createCodec();
        record.saveCache.states = this.states.map(state => encodeSnapshot(record.saveCache, state));
      }
      const codec = record.saveCache, options = codec.encode(this.options);
      const journal = this.current.events.map(codec.encode);
      return JSON.stringify({format: 'playroom-session', version: 2, encoding: 'interned-json-v1',
        game: this.game, packVersion:this.packVersion, options, createdAt: this.createdAt, updatedAt: this.updatedAt,
        states: codec.states, journal, nodes: codec.nodes});
    }
    static packVersionOf(saved) { return saved?.packVersion || (saved?.version === 1 && (saved.options?.packVersion || saved.states?.[0]?.packVersion)) || '0.1.0'; }
    static restore(engine, saved) {
      if (!isRecord(saved) || saved.format !== 'playroom-session' || ![1, 2].includes(saved.version) ||
          typeof saved.game !== 'string' || !Array.isArray(saved.states) || !saved.states.length) {
        throw new Error('Сохранение имеет неподдерживаемый формат');
      }
      let data;
      try {
        data = saved.version === 2 ? decodeCompact(saved) : clone(saved);
        const options = data.options;
        if (!isRecord(options) || (options.mode !== undefined && !['solo', 'pass'].includes(options.mode)) ||
            (options.openHands !== undefined && typeof options.openHands !== 'boolean') ||
            (options.players !== undefined && (!Array.isArray(options.players) || options.players.some(p => !isRecord(p)))) ||
            !Number.isSafeInteger(data.createdAt) || data.createdAt < 0 ||
            !Number.isSafeInteger(data.updatedAt) || data.updatedAt < data.createdAt) throw Error('Invalid envelope');
        const packVersion = Session.packVersionOf(data);
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
              state.players.some((player, p) => player.name !== initial.players[p].name || player.bot !== initial.players[p].bot) ||
              (index > 0 && data.states[index - 1].status !== 'playing')) throw Error('Invalid timeline');
        }
        if ((options.preset !== undefined && options.preset !== initial.preset) ||
            Boolean(options.openHands) !== initial.openHands ||
            (options.players && options.players.length !== initial.players.length)) throw Error('Inconsistent options');
      } catch (error) {
        if (error.code === 'PACK_VERSION_MISSING') { error.message = 'Сохранение требует установленный пакет: ' + error.message; throw error; }
        throw new Error('Сохранение повреждено или несовместимо с текущими правилами');
      }
      const session = Object.create(Session.prototype);
      // Explicit fields prevent imported keys from replacing methods/getters or
      // modifying the session prototype. Restoring does not rerun pack.create().
      records.set(session, {engine, game: data.game, options: freeze(data.options),
        createdAt: data.createdAt, updatedAt: data.updatedAt, states: freeze(data.states)});
      return session;
    }
  }
  root.TabletopSession = Session;
  if (typeof module !== 'undefined' && module.exports) module.exports = Session;
})(globalThis);
