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
      return allowed ? [{type:allowed.type, actor:allowed.actor, params:allowed.params}] : [];
    }));
  }

  return Object.freeze({validate:event,project:projectEvents});
});
