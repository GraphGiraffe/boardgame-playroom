// Validate semantic presentation data without cloning a potentially large board.
(function(root,factory){
  const api=factory(root,root.PlayroomModelValues||require('../core/model-values.js'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomSceneContract=api;
})(globalThis,function(root,V){
  'use strict';
  function entity(value){
    const components=root.PlayroomGameComponents||(typeof require==='function'?require('../core/game-components.js'):null);
    return components.entityKey(value);
  }
  function sequence(value){
    V.check(V.record(value)&&Array.isArray(value.steps),'SCENE_SEQUENCE_INVALID');
    entity(value.entity);
    if(value.departures!==undefined||value.arrival==='after-departures'){
      V.check(value.arrival==='after-departures'&&Array.isArray(value.departures)&&value.departures.length>0&&value.departures.length<=32,'SCENE_DEPARTURES_INVALID');
      const ids=value.departures.map(entity);
      V.check(new Set(ids).size===ids.length&&!ids.includes(entity(value.entity)),'SCENE_DEPARTURES_INVALID');
    }
    for(const point of [value.origin,...value.steps,...(value.jump?[value.jump]:[])])
      V.check(V.record(point)&&typeof point.anchor==='string'&&point.anchor.length>0,'SCENE_ANCHOR_INVALID');
    return value;
  }
  function event(value,playerCount){
    V.check(V.record(value),'SCENE_EVENT_INVALID');
    if(value.reveal?.entity!==undefined)entity(value.reveal.entity);
    if(value.presentation?.sequence!==undefined)sequence(value.presentation.sequence);
    if(value.feedback!==undefined){
      V.check(V.record(value.feedback)&&V.identifier(value.feedback.kind)&&
        V.integer(value.feedback.player,0,playerCount-1),'SCENE_FEEDBACK_INVALID');
    }
    return value;
  }
  function metric(value){
    const components=root.PlayroomGameComponents||(typeof require==='function'?require('../core/game-components.js'):null);
    V.check(components.validMetric(value,{requireId:true,requireLabel:true}),'SCENE_METRIC_INVALID');
    return value;
  }
  function geometry(scene,playerCount){
    V.check(V.record(scene.geometry)&&typeof scene.geometry.topology==='string'&&scene.geometry.topology.length>0,
      'SCENE_GEOMETRY_INVALID');
    V.check(Array.isArray(scene.zones)&&Array.isArray(scene.objects)&&Array.isArray(scene.interactions),'SCENE_LAYOUT_INVALID');
    const zones=new Set(),objects=new Set();
    for(const zone of scene.zones){
      V.check(V.record(zone)&&V.identifier(zone.id)&&V.identifier(zone.kind)&&!zones.has(zone.id),'SCENE_ZONE_INVALID');
      if(zone.owner!==undefined)V.check(V.integer(zone.owner,0,playerCount-1),'SCENE_ZONE_OWNER_INVALID');
      if(zone.count!==undefined)V.check(V.integer(zone.count,0,100000),'SCENE_ZONE_COUNT_INVALID');
      zones.add(zone.id);
    }
    for(const object of scene.objects){
      V.check(V.record(object)&&zones.has(object.zone),'SCENE_OBJECT_ZONE_INVALID');
      const key=entity(object.ref);V.check(!objects.has(key),'SCENE_OBJECT_DUPLICATE');objects.add(key);
      if(object.owner!==undefined)V.check(V.integer(object.owner,0,playerCount-1),'SCENE_OBJECT_OWNER_INVALID');
      if(object.cell!==undefined)V.check(V.integer(object.cell,0,100000),'SCENE_OBJECT_CELL_INVALID');
      if(object.index!==undefined)V.check(V.integer(object.index,0,100000),'SCENE_OBJECT_INDEX_INVALID');
      if(object.cells!==undefined)V.check(Array.isArray(object.cells)&&object.cells.every(cell=>V.integer(cell,0,100000)),'SCENE_OBJECT_CELLS_INVALID');
      if(object.point!==undefined)V.check(Array.isArray(object.point)&&object.point.length===2&&object.point.every(Number.isFinite),'SCENE_OBJECT_POINT_INVALID');
    }
    function target(value){
      V.check(V.record(value),'SCENE_TARGET_INVALID');
      if(value.entity!==undefined){V.check(Object.keys(value).length===1&&objects.has(entity(value.entity)),'SCENE_TARGET_INVALID');return;}
      V.check(Object.keys(value).every(key=>['zone','cell','index'].includes(key))&&zones.has(value.zone)&&
        !(value.cell!==undefined&&value.index!==undefined)&&
        (value.cell===undefined||V.integer(value.cell,0,100000))&&
        (value.index===undefined||V.integer(value.index,0,100000)),'SCENE_TARGET_INVALID');
    }
    for(const interaction of scene.interactions){
      V.check(V.record(interaction)&&V.record(interaction.command)&&V.record(interaction.target),'SCENE_INTERACTION_INVALID');
      target(interaction.target);
      if(interaction.source!==undefined)target(interaction.source);
      V.check(interaction.kind===undefined||['move','select','activate'].includes(interaction.kind),'SCENE_INTERACTION_INVALID');
    }
    return scene;
  }
  function validate(scene,playerCount){
    V.check(V.integer(playerCount,1,64)&&V.record(scene)&&scene.contractVersion===1&&
      V.identifier(scene.id)&&V.identifier(scene.family)&&Array.isArray(scene.players)&&
      scene.players.length===playerCount,'SCENE_INVALID');
    // A VM can return small JSON containing enormous dimensions. Bound work
    // before trusted renderers allocate a grid or create its DOM children.
    const dimension=value=>V.integer(value,1,64);
    V.check((scene.columns===undefined||dimension(scene.columns))&&
      (scene.rows===undefined||Array.isArray(scene.rows)||dimension(scene.rows)),'SCENE_LIMIT');
    for(const [key,max]of [['cells',4096],['objects',8192],['zones',256],['interactions',8192],['pieces',4096],['dice',32]])
      V.check(scene[key]===undefined||Array.isArray(scene[key])&&scene[key].length<=max,'SCENE_LIMIT');
    if(Array.isArray(scene.rows))V.check(scene.rows.length<=256&&scene.rows.every(row=>V.record(row)&&
      (row.cells===undefined||Array.isArray(row.cells)&&row.cells.length<=64)),'SCENE_LIMIT');
    if(scene.geometry)V.check((scene.geometry.columns===undefined||dimension(scene.geometry.columns))&&
      (scene.geometry.rows===undefined||dimension(scene.geometry.rows)),'SCENE_LIMIT');
    if(scene.arena)V.check(V.record(scene.arena)&&dimension(scene.arena.size)&&Array.isArray(scene.arena.board)&&
      scene.arena.board.length===scene.arena.size*scene.arena.size&&Array.isArray(scene.arena.players)&&scene.arena.players.length<=playerCount,'SCENE_LIMIT');
    const players=new Set();
    for(const person of scene.players){
      V.check(V.record(person)&&V.integer(person.player,0,playerCount-1)&&
        !Object.hasOwn(person,'id')&&!players.has(person.player),'SCENE_PLAYER_INVALID');
      players.add(person.player);
      V.check(person.finishPlace===undefined||V.integer(person.finishPlace,0,playerCount),'SCENE_FINISH_INVALID');
      V.check(Array.isArray(person.metrics),'SCENE_METRICS_INVALID');
      const ids=new Set();
      for(const item of person.metrics){
        metric(item);
        V.check(!ids.has(item.id),'SCENE_METRIC_DUPLICATE');ids.add(item.id);
      }
    }
    if(scene.geometry!==undefined)geometry(scene,playerCount);
    if(scene.sequence!==undefined)sequence(scene.sequence);
    if(scene.motionSequence!==undefined)sequence(scene.motionSequence);
    for(const route of [scene.sequence,scene.motionSequence].filter(Boolean))if(route.departures){
      const available=new Set((scene.objects||[]).map(object=>entity(object.ref)));
      V.check(route.departures.every(ref=>available.has(entity(ref))),'SCENE_DEPARTURE_UNKNOWN');
    }
    return scene;
  }
  function commands(scene,projection){
    V.check(V.record(projection)&&Array.isArray(projection.actions),'SCENE_COMMANDS_INVALID');
    const allowed=new Set([...projection.actions,...(projection.inputs||[]).map(input=>input.command)].map(V.canonical));
    const controls=[...(Array.isArray(scene.cells)?scene.cells:[]),...(Array.isArray(scene.rows)?scene.rows.flatMap(row=>row.cells||[]):[]),
      ...(scene.interactions||[]),...(scene.controls||[]),scene.canvas,scene.chat,scene.vote,
      ...(scene.chat?.messages||[]).map(message=>({command:message.confirmCommand}))].filter(Boolean);
    for(const control of controls)V.check(control.command===undefined||control.command===null||allowed.has(V.canonical(control.command)),'SCENE_COMMAND_DENIED');
    return scene;
  }
  return Object.freeze({validate,commands,metric,entity,sequence,event,geometry});
});
