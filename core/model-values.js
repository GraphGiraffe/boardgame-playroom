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
  // Only snapshots created here are trusted. Object.isFrozen alone does not
  // establish valid JSON or recursively immutable descendants.
  const snapshots = new WeakSet();
  const ownsSnapshot=value=>snapshots.has(value);
  function freeze(value) {
    if (value && typeof value === 'object' && !snapshots.has(value)) {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function snapshot(value) {
    if (value && typeof value === 'object' && snapshots.has(value)) return value;
    json(value);
    return parseSnapshot(JSON.stringify(value));
  }
  function sealParsed(value) {
    if(typeof value==='number'){
      check(Number.isFinite(value),'JSON_INVALID');
      return value===0?0:value;
    }
    if(value&&typeof value==='object'){
      for(const key of Object.keys(value)){
        const item=value[key],sealed=sealParsed(item);
        if(!Object.is(item,sealed))value[key]=sealed;
      }
      Object.freeze(value);
      snapshots.add(value);
    }
    return value;
  }
  function parseSnapshot(text) {
    // The parser creates fresh plain containers. Seal these same objects
    // before publishing them to the model or protocol ownership registry.
    return sealParsed(JSON.parse(text));
  }
  const roundTrip=Symbol();
  function takeDraft(value,drafts) {
    const type=typeof value;
    if(value===null||type==='string'||type==='boolean')return value;
    if(type==='number'){check(Number.isFinite(value),'JSON_INVALID');return value===0?0:value;}
    check(type==='object','JSON_INVALID');
    if(snapshots.has(value))return value;
    if(drafts?.has(value)){
      const owned=drafts.get(value);
      check(owned!==undefined,'JSON_INVALID');
      return owned;
    }
    const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);
    if((array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)||'toJSON' in value||Symbol.toStringTag in value)return roundTrip;
    drafts??=new Map();
    drafts.set(value,undefined);
    const keys=array?null:Object.keys(value),length=array?value.length:keys.length,entries=new Array(length);
    for(let i=0;i<length;i++){
      const key=array?i:keys[i],descriptor=Object.getOwnPropertyDescriptor(value,key);
      check(descriptor,'JSON_INVALID');
      if(!Object.hasOwn(descriptor,'value'))return roundTrip;
      const child=takeDraft(descriptor.value,drafts);
      if(child===roundTrip)return roundTrip;
      entries[i]=array?child:[key,child];
    }
    const result=Object.freeze(array?entries:Object.fromEntries(entries));
    drafts.set(value,result);
    snapshots.add(result);
    return result;
  }
  function composeValue(draft) {
    // Model drafts often contain validated branches from their input position.
    // Share only owned branches. Foreign records and accessors keep the normal
    // serialization path for the whole draft, including contextual toJSON keys.
    const value=takeDraft(draft);
    return value===roundTrip?snapshot(draft):value;
  }
  function composeRecord(fields,{strict=false}={}){
    check(record(fields)&&[Object.prototype,null].includes(Object.getPrototypeOf(fields)),'JSON_INVALID');
    const result={};
    for(const [key,value]of Object.entries(fields)){
      if(!strict&&value===undefined)continue;
      Object.defineProperty(result,key,{value:composeValue(value),enumerable:true});
    }
    Object.freeze(result);snapshots.add(result);return result;
  }
  function composeArray(values){check(Array.isArray(values),'JSON_INVALID');const result=values.map(snapshot);Object.freeze(result);snapshots.add(result);return result;}
  const canonical = value => JSON.stringify(value, (_, item) => record(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  function command(value) {
    check(record(value) && identifier(value.type), 'ACTION_INVALID');
    json(value);
    return canonical(value);
  }
  return Object.freeze({record,integer,identifier,ModelError,check,json,copy,freeze,ownsSnapshot,snapshot,parseSnapshot,composeValue,composeRecord,composeArray,canonical,command});
});
