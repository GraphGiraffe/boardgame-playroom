// Storage codec; independent of rules, UI, devices and clocks.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSessionCodec=api;})(globalThis,function(){
  'use strict';
  const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
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
  return Object.freeze({create:createCodec,encodeSnapshot,decode:decodeCompact});
});
