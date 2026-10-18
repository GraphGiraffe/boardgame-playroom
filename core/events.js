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
  // Visibility is resolved before presentation receives parameters or message refs.
  function projectEvents(events, viewer, playerCount) {
    check(Array.isArray(events), 'EVENT_INVALID');
    return snapshot(events.flatMap(value => {
      event(value, playerCount);
      const visible = value.visibility.kind === 'public' ||
        integer(viewer, 0, playerCount - 1) && value.visibility.players.includes(viewer);
      const allowed = visible ? value : value.publicEvent;
      return allowed ? [{type:allowed.type, actor:allowed.actor, params:allowed.params,
        ...(value.id!==undefined?{id:value.id,revision:value.revision}:{})}] : [];
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
