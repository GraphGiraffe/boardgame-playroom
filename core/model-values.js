// Immutable JSON values shared by portable model contracts.
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomModelValues=api;
})(globalThis,function(){
  'use strict';
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
  const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,95}$/.test(value);
  class ModelError extends Error {
    constructor(code) { super(code); this.name = 'ModelError'; this.code = code; }
  }
  function check(valid, code) { if (!valid) throw new ModelError(code); }
  function json(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number') { check(Number.isFinite(value), 'JSON_INVALID'); return; }
    check(typeof value === 'object' && !ancestors.has(value) &&
      (Array.isArray(value) || Object.prototype.toString.call(value) === '[object Object]'), 'JSON_INVALID');
    ancestors.add(value);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index++) {
        check(Object.hasOwn(value, index), 'JSON_INVALID'); json(value[index], ancestors);
      }
    } else for (const key of Object.keys(value)) json(value[key], ancestors);
    ancestors.delete(value);
  }
  function copy(value) { json(value); return JSON.parse(JSON.stringify(value)); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  // Only snapshots created here are trusted. Object.isFrozen alone does not
  // establish valid JSON or recursively immutable descendants.
  const snapshots = new WeakSet();
  function snapshot(value) {
    if (value && typeof value === 'object' && snapshots.has(value)) return value;
    const result = freeze(copy(value));
    if (result && typeof result === 'object') snapshots.add(result);
    return result;
  }
  const canonical = value => JSON.stringify(value, (_, item) => record(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  function command(value) {
    check(record(value) && identifier(value.type), 'ACTION_INVALID');
    json(value);
    return canonical(value);
  }
  return Object.freeze({record,integer,identifier,ModelError,check,json,copy,freeze,snapshot,canonical,command});
});
