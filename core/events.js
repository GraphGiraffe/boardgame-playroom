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
  const validatedCounts=new WeakMap();
  function validate(value,playerCount){
    const reviewed=validatedCounts.get(value);
    if(reviewed!==undefined&&reviewed===playerCount)return;
    event(value,playerCount);
  }
  // The same permitted fact can serve several viewers. Cache the two visibility
  // outcomes independently and only reuse facts from owned snapshots.
  const projections = new WeakMap();
  function authorizedFact(value, audience, playerCount) {
    const owned=snapshot(value);
    let counts=projections.get(owned),cached=counts?.get(playerCount);
    if(!cached){
      validate(owned, playerCount);
      if(!counts){counts=new Map();projections.set(owned,counts);}
      cached={};counts.set(playerCount,cached);
    }
    const visible=owned.visibility.kind==='public'||audience>=0&&owned.visibility.players.includes(audience);
    const key=visible?'full':'fallback';
    if(!Object.hasOwn(cached,key)){
      const allowed=visible?owned:owned.publicEvent;
      cached[key]=allowed?Values.composeRecord({type:allowed.type,actor:allowed.actor,params:allowed.params,
        ...(owned.id!==undefined?{id:owned.id,revision:owned.revision}:{})},{strict:true}):null;
    }
    return cached[key];
  }
  // Visibility is resolved before presentation receives parameters or message refs.
  const audienceOf=(viewer,playerCount)=>integer(viewer,0,playerCount-1)?viewer:-1;
  function projectFact(value,viewer,playerCount){return authorizedFact(value,audienceOf(viewer,playerCount),playerCount);}
  function projectEvents(events, viewer, playerCount) {
    check(Array.isArray(events), 'EVENT_INVALID');
    const audience=audienceOf(viewer,playerCount),result=[];
    for(const value of events){const fact=authorizedFact(value,audience,playerCount);if(fact)result.push(fact);}
    return Object.freeze(result);
  }

  function append(events, drafts, playerCount, revision) {
    check(Array.isArray(events)&&Array.isArray(drafts)&&integer(revision,0,Number.MAX_SAFE_INTEGER),'EVENT_INVALID');
    let id=events.at(-1)?.id||0;
    check(integer(id,0,Number.MAX_SAFE_INTEGER-drafts.length),'EVENT_INVALID');
    check(events.at(-1)?.revision===undefined||events.at(-1).revision<=revision,'EVENT_REVISION_INVALID');
    const added=drafts.map(value=>{
      check(record(value),'EVENT_INVALID');
      check(value.id===undefined&&value.revision===undefined,'EVENT_ID_RESERVED');
      const owned=snapshot({...value,id:++id,revision});
      // Check the owned bytes before remembering their validation. Imported
      // facts and lookalike frozen shells still cross the full validator.
      event(owned,playerCount);
      validatedCounts.set(owned,playerCount);
      return owned;
    });
    return Object.freeze([...events,...added]);
  }

  return Object.freeze({validate,project:projectEvents,projectFact,append});
});
