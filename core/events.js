// Canonical event drafts and audience projection, before presentation/translation.
(function(root,factory){
  'use strict';
  const api=factory(root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomEvents=api;
})(globalThis,function(Values){
  'use strict';
  const {record,integer,identifier,check,json,snapshot}=Values;
  function event(value, playerCount) {
    check(record(value) && identifier(value.type) &&
      (value.actor === null || integer(value.actor, 0, playerCount - 1)) && record(value.params), 'EVENT_INVALID');
    json(value.params);
    const audience = value.visibility;
    check(record(audience) && (audience.kind === 'public' || audience.kind === 'players' &&
      Array.isArray(audience.players) && audience.players.length > 0 &&
      new Set(audience.players).size === audience.players.length &&
      audience.players.every(player => integer(player, 0, playerCount - 1))), 'EVENT_INVALID');
    if (value.publicEvent !== undefined) {
      check(audience.kind === 'players' && value.publicEvent?.visibility?.kind === 'public' &&
        value.publicEvent.publicEvent === undefined, 'EVENT_INVALID');
      event(value.publicEvent, playerCount);
    }
  }
  // Weak keys retain no retired journal. Only module-owned deep snapshots are
  // reused; mutable external facts are detached on every call.
  const projections = new WeakMap();
  // Visibility is resolved before presentation receives parameters or message refs.
  function projectEvents(events, viewer, playerCount) {
    check(Array.isArray(events), 'EVENT_INVALID');
    const audience = integer(viewer, 0, playerCount - 1) ? viewer : -1;
    return Object.freeze(events.flatMap(value => {
      const owned = snapshot(value), key = playerCount + ':' + audience;
      let cached = projections.get(owned);
      if (cached?.has(key)) return cached.get(key);
      event(owned, playerCount);
      const visible = owned.visibility.kind === 'public' ||
        audience >= 0 && owned.visibility.players.includes(audience);
      const allowed = visible ? owned : owned.publicEvent;
      const result = snapshot(allowed ? [{type:allowed.type, actor:allowed.actor, params:allowed.params,
        ...(owned.id!==undefined?{id:owned.id,revision:owned.revision}:{})}] : []);
      if (!cached) { cached = new Map(); projections.set(owned, cached); }
      cached.set(key, result);
      return result;
    }));
  }

  function append(events, drafts, playerCount, revision) {
    check(Array.isArray(events)&&Array.isArray(drafts)&&integer(revision,0,Number.MAX_SAFE_INTEGER),'EVENT_INVALID');
    let id=events.at(-1)?.id||0;
    check(integer(id,0,Number.MAX_SAFE_INTEGER-drafts.length),'EVENT_INVALID');
    check(events.at(-1)?.revision===undefined||events.at(-1).revision<=revision,'EVENT_REVISION_INVALID');
    const added=drafts.map(value=>{
      event(value,playerCount);
      check(value.id===undefined&&value.revision===undefined,'EVENT_ID_RESERVED');
      return snapshot({...value,id:++id,revision});
    });
    return Object.freeze([...events,...added]);
  }

  return Object.freeze({validate:event,project:projectEvents,append});
});
