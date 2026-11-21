// Validate semantic presentation data without cloning a potentially large board.
(function(root,factory){
  const api=factory(root,root.PlayroomModelValues||require('../core/model-values.js'));
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomSceneContract=api;
})(globalThis,function(root,V){
  'use strict';
  const labelValue=value=>typeof value==='string'?value.length>0&&value.length<=256:V.record(value)&&typeof value.key==='string'&&value.key.length>0&&value.key.length<=256;
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
  function assetReference(value){
    return V.record(value)&&Object.keys(value).length===2&&value.kind==='asset'&&
      typeof value.id==='string'&&/^assets\/[A-Za-z0-9_./-]+$/.test(value.id)&&
      value.id.split('/').every(part=>part&&part!=='.'&&part!=='..');
  }
  const validDiePrint=die=>(die.face===undefined||assetReference(die.face))&&(die.label===undefined||labelValue(die.label));
  function event(value,playerCount){
    V.check(V.record(value),'SCENE_EVENT_INVALID');
    if(value.animation!==undefined){
      const {asset,target}=value.animation||{};
      V.check(V.record(value.animation)&&assetReference(asset)&&asset.id.endsWith('.json')&&V.record(target)&&
        Object.keys(target).length===1&&(target.zone==='field'||V.record(target.entity)),'SCENE_ANIMATION_INVALID');
      if(target.entity)entity(target.entity);
    }
    if(value.reveal?.entity!==undefined)entity(value.reveal.entity);
    if(value.reveal?.kind==='dice'){
      const dice=value.reveal.dice;
      V.check(Array.isArray(dice)&&dice.length<=32&&dice.every(die=>V.record(die)&&validDiePrint(die)),'SCENE_DIE_INVALID');
    }
    if(value.presentation?.sequence!==undefined)sequence(value.presentation.sequence);
    if(value.feedback!==undefined){
      V.check(V.record(value.feedback)&&V.identifier(value.feedback.kind)&&
        V.integer(value.feedback.player,0,playerCount-1),'SCENE_FEEDBACK_INVALID');
    }
    return value;
  }
  // Checkpoints belong to ordered events from this authorized revision.
  // Both the installed-pack adapter and SDK hosts use this same boundary.
  function eventScenes(frames,projection){
    V.check(Array.isArray(frames)&&Array.isArray(projection.events),'EVENT_SCENES_INVALID');
    if(!frames.length)return frames;
    const allowed=new Map();
    let index=0;
    for(const event of projection.events)if(event.revision===projection.revision)allowed.set(event.id,index++);
    V.check(frames.length<=allowed.size,'EVENT_SCENES_INVALID');
    let previous=-1;
    for(const frame of frames){
      V.check(frame&&allowed.has(frame.eventId)&&allowed.get(frame.eventId)>previous,'EVENT_SCENES_INVALID');
      previous=allowed.get(frame.eventId);
      validate(frame.scene,projection.playerCount);
      inventoryVisibility(frame.scene,projection);
      V.check(!frame.scene.interactions?.length,'EVENT_SCENE_INTERACTIONS');
    }
    return frames;
  }
  function metric(value){
    const components=root.PlayroomGameComponents||(typeof require==='function'?require('../core/game-components.js'):null);
    V.check(components.validMetric(value,{requireId:true,requireLabel:true}),'SCENE_METRIC_INVALID');
    return value;
  }
  function inventory(scene){
    const layout=scene.inventoryLayout,ids=layout?.zones;
    V.check(V.record(layout)&&Object.keys(layout).every(key=>key==='zones'||key==='overviews')&&
      Array.isArray(ids)&&ids.length>=1&&ids.length<=8&&ids.every(V.identifier)&&new Set(ids).size===ids.length,'SCENE_INVENTORY_INVALID');
    const zones=new Map(scene.zones.filter(zone=>zone.kind==='inventory').map(zone=>[zone.id,zone]));
    V.check(zones.size===ids.length&&ids.every(id=>zones.has(id)),'SCENE_INVENTORY_INVALID');
    const slots=new Map();
    for(const zone of zones.values()){
      V.check(labelValue(zone.label)&&V.integer(zone.count,0,32)&&
        (zone.visibility==='public'||zone.visibility==='owner'&&zone.owner!==undefined),'SCENE_INVENTORY_ZONE_INVALID');
      V.check(zone.slots===undefined||Array.isArray(zone.slots)&&zone.slots.length>=1&&zone.slots.length<=32&&
        zone.count<=zone.slots.length&&zone.slots.every(labelValue),'SCENE_INVENTORY_SLOTS_INVALID');
      slots.set(zone.id,new Set());
    }
    const shown=layout.overviews===undefined?null:new Set();
    for(const object of scene.objects){
      const zone=zones.get(object.zone);if(!zone)continue;
      const occupied=slots.get(zone.id),visual=object.visual;
      V.check(V.integer(object.index,0,(zone.slots?.length??zone.count)-1)&&!occupied.has(object.index)&&
        object.cell===undefined&&object.point===undefined&&object.cells===undefined,'SCENE_INVENTORY_SLOT_INVALID');
      occupied.add(object.index);
      shown?.add(entity(object.ref));
      V.check(V.record(visual)&&labelValue(visual.label)&&(
        visual.kind==='card'&&Object.keys(visual).length===4&&V.integer(visual.rank,2,14)&&['♥','♣','♦','♠'].includes(visual.suit)||
        visual.kind==='tile'&&Object.keys(visual).length===4&&V.integer(visual.a,0,6)&&V.integer(visual.b,0,6)||
        visual.kind==='token'&&Object.keys(visual).length===3&&V.integer(visual.value,0,99)),'SCENE_INVENTORY_VISUAL_INVALID');
    }
    for(const zone of zones.values()){
      const occupancy=slots.get(zone.id).size;
      V.check(occupancy===zone.count||zone.slots===undefined||zone.visibility==='owner'&&occupancy===0,'SCENE_INVENTORY_SLOTS_INVALID');
    }
    for(const {kind,source,target} of scene.interactions){
      V.check(!zones.has(source?.zone),'SCENE_INVENTORY_INPUT_INVALID');
      const zone=zones.get(target.zone);
      if(zone)V.check(kind==='move'&&source?.entity&&V.integer(target.index,0,(zone.slots?.length??0)-1)&&
        !slots.get(zone.id).has(target.index),'SCENE_INVENTORY_INPUT_INVALID');
    }
    if(shown)inventoryOverviews(layout.overviews,shown);
  }
  function inventoryOverviews(overviews,shown){
    V.check(Array.isArray(overviews)&&overviews.length<=4,'SCENE_INVENTORY_VIEW_INVALID');
    const panels=new Set(),ids=new Set();
    for(const panel of overviews){
      V.check(V.record(panel)&&Object.keys(panel).length===3&&V.identifier(panel.id)&&!panels.has(panel.id)&&
        labelValue(panel.label)&&Array.isArray(panel.views)&&panel.views.length<=16,'SCENE_INVENTORY_VIEW_INVALID');
      panels.add(panel.id);
      for(const view of panel.views){
        V.check(V.record(view)&&Object.keys(view).length===3&&V.identifier(view.id)&&!ids.has(view.id)&&
          (view.role==='detail'||view.role==='summary'),'SCENE_INVENTORY_VIEW_INVALID');
        V.check(shown.has(entity(view.ref)),'SCENE_INVENTORY_VIEW_SOURCE_INVALID');
        ids.add(view.id);
      }
    }
  }
  // The rules project private contents first. Check the rendered descriptors
  // as well, including inert event checkpoints from that same audience.
  function inventoryVisibility(scene,projection){
    if(!scene.inventoryLayout)return;
    const hidden=new Set(scene.zones.filter(zone=>zone.kind==='inventory'&&zone.visibility==='owner'&&
      (projection.audience==='public'||zone.owner!==projection.viewer)).map(zone=>zone.id));
    if(hidden.size)V.check(!scene.objects.some(object=>hidden.has(object.zone))&&
      !scene.interactions.some(({target})=>hidden.has(target.zone)),'SCENE_INVENTORY_VISIBILITY_DENIED');
    // Empty slots represent real vacancies, so the visible layout needs a
    // descriptor for every occupied position before it can expose targets.
    for(const zone of scene.zones){
      if(zone.kind==='inventory'&&zone.slots&&zone.visibility==='owner'&&!hidden.has(zone.id))
        V.check(scene.objects.filter(object=>object.zone===zone.id).length===zone.count,'SCENE_INVENTORY_SLOTS_INVALID');
    }
  }
  function anchoredBoard(scene){
    const {geometry:{columns,rows},zones,objects,anchoredLayout:layout}=scene;
    V.check(scene.family==='board'&&V.record(layout)&&V.identifier(layout.field)&&
      typeof layout.label==='string'&&layout.label.length>0&&layout.label.length<=256&&
      V.integer(columns,1,16)&&V.integer(rows,1,16),'SCENE_ANCHORED_BOARD_INVALID');
    const field=zones.find(zone=>zone.id===layout.field),carriers=new Set(),occupied=new Map();
    V.check(field?.kind==='board'&&field.anchor===undefined&&field.capacity===undefined,'SCENE_ANCHORED_BOARD_INVALID');
    const byZone=new Map(zones.map(zone=>[zone.id,zone]));
    const byRef=new Map(objects.map(object=>[entity(object.ref),object]));
    let slots=0;
    for(const zone of zones){
      if(zone===field)continue;
      V.check(zone.kind==='slots'&&V.integer(zone.capacity,1,16),'SCENE_ANCHORED_ZONE_INVALID');
      const key=entity(zone.anchor);
      V.check(byRef.get(key)?.zone===field.id&&!carriers.has(key),'SCENE_ANCHORED_ZONE_INVALID');
      carriers.add(key);slots+=zone.capacity;
    }
    V.check(slots<=64,'SCENE_ANCHORED_ZONE_INVALID');
    for(const object of objects){
      const {visual}=object,zone=byZone.get(object.zone),onField=zone===field;
      V.check(V.record(visual)&&typeof visual.label==='string'&&visual.label.length>0&&visual.label.length<=256&&(
        visual.kind==='token'&&V.integer(visual.value,0,99)&&Object.keys(visual).length===3||
        visual.kind==='tile'&&V.integer(visual.a,0,6)&&V.integer(visual.b,0,6)&&Object.keys(visual).length===4), 'SCENE_ANCHORED_VISUAL_INVALID');
      const slot=onField?object.cell:object.index,maximum=onField?columns*rows:zone.capacity;
      V.check((onField?object.index:object.cell)===undefined&&V.integer(slot,0,maximum-1),'SCENE_ANCHORED_SLOT_INVALID');
      V.check(object.orientation===undefined||onField&&V.integer(object.orientation,0,3),'SCENE_ANCHORED_ORIENTATION_INVALID');
      if(!occupied.has(zone.id))occupied.set(zone.id,new Set());
      const used=occupied.get(zone.id);V.check(!used.has(slot),'SCENE_ANCHORED_SLOT_INVALID');used.add(slot);
    }
    for(const {kind,source,target} of scene.interactions){
      const zone=byZone.get(target.zone);
      const move=kind==='move',origin=move&&source?.entity?byRef.get(entity(source.entity)):null;
      V.check(target.entity===undefined&&(move
        ?origin&&origin.zone!==field.id&&zone?.kind==='slots'&&!occupied.get(zone.id)?.has(target.index)
        :(kind===undefined||kind==='activate')&&source===undefined),'SCENE_ANCHORED_INPUT_INVALID');
      V.check(zone===field?target.index===undefined&&V.integer(target.cell,0,columns*rows-1):
        target.cell===undefined&&V.integer(target.index,0,zone.capacity-1),'SCENE_ANCHORED_SLOT_INVALID');
    }
  }
  function geometry(scene,playerCount){
    V.check(V.record(scene.geometry)&&typeof scene.geometry.topology==='string'&&scene.geometry.topology.length>0,
      'SCENE_GEOMETRY_INVALID');
    V.check(Array.isArray(scene.zones)&&Array.isArray(scene.objects)&&Array.isArray(scene.interactions),'SCENE_LAYOUT_INVALID');
    const zones=new Set(),objects=new Set();
    for(const zone of scene.zones){
      V.check(V.record(zone)&&V.identifier(zone.id)&&V.identifier(zone.kind)&&!zones.has(zone.id),'SCENE_ZONE_INVALID');
      V.check(scene.anchoredLayout!==undefined||zone.anchor===undefined&&zone.capacity===undefined,'SCENE_ANCHORED_ZONE_INVALID');
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
      V.check(interaction.activation===undefined||['select','immediate','preference'].includes(interaction.activation),'SCENE_INTERACTION_INVALID');
      V.check(interaction.gestures===undefined||V.record(interaction.gestures)&&Object.keys(interaction.gestures).every(key=>['drag','swipe'].includes(key)&&typeof interaction.gestures[key]==='boolean'),'SCENE_INTERACTION_INVALID');
    }
    if(scene.anchoredLayout!==undefined)anchoredBoard(scene);
    if(scene.inventoryLayout!==undefined)inventory(scene);
    return scene;
  }
  function validate(scene,playerCount){
    V.check(V.integer(playerCount,1,64)&&V.record(scene)&&scene.contractVersion===1&&
      V.identifier(scene.id)&&V.identifier(scene.family)&&Array.isArray(scene.players)&&
      scene.players.length===playerCount,'SCENE_INVALID');
    (root.PlayroomLayoutPolicy||(typeof require==='function'?require('./layout-policy.js'):null)).validate(scene,playerCount);
    if(scene.plan!=null)V.check(Array.isArray(scene.plan.groups)&&scene.plan.groups.every(group=>
      Array.isArray(group?.cues)&&group.cues.every(cue=>cue?.kind!=='sound'||(
        Array.isArray(cue.sounds)&&cue.sounds.length>0&&cue.sounds.length<=64&&
        cue.sounds.every(id=>V.identifier(id)&&id.length<=64)
      ))),'SCENE_PLAN_SOUND_INVALID');
    V.check(scene.screenFamily===undefined||['board','cards'].includes(scene.screenFamily),'SCENE_SCREEN_FAMILY_INVALID');
    V.check(scene.cellStyle===undefined||scene.cellStyle==='mark-token','SCENE_CELL_STYLE_INVALID');
    V.check(scene.handLayout===undefined||['row','fan','overlap','tiles'].includes(scene.handLayout),'SCENE_HAND_LAYOUT_INVALID');
    V.check(scene.dicePlacement===undefined||['field','actions','status'].includes(scene.dicePlacement),'SCENE_DICE_PLACEMENT_INVALID');
    V.check(scene.diceStyle===undefined||['flat','raised'].includes(scene.diceStyle),'SCENE_DICE_STYLE_INVALID');
    if(scene.nextPlayerByCard!==undefined||scene.turnPreviewByCard!==undefined){
      const player=value=>V.integer(value,0,playerCount-1),next=value=>value===null||player(value);
      const map=(value,valid)=>value===undefined||V.record(value)&&Object.keys(value).length<=512&&Object.entries(value).every(([id,entry])=>id.length>0&&id.length<=256&&valid(entry));
      V.check(map(scene.nextPlayerByCard,next)&&map(scene.turnPreviewByCard,preview=>V.record(preview)&&next(preview.nextPlayer)&&Array.isArray(preview.affected)&&preview.affected.length<=playerCount&&preview.affected.every(player)&&typeof preview.kind==='string'&&preview.kind.length>0&&preview.kind.length<=32&&(preview.label===undefined||labelValue(preview.label))),'SCENE_TURN_PREVIEW_INVALID');
    }
    V.check(scene.routeStyle===undefined||['cross-and-circle','numbered-serpentine'].includes(scene.routeStyle),'SCENE_ROUTE_STYLE_INVALID');
    if(scene.routeStyle==='numbered-serpentine'){
      const r=scene.numberedRoute,side=scene.columns,n=scene.finish,integer=value=>V.integer(value,0,n),point=value=>V.record(value)&&[value.x,value.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100);
      V.check(scene.family==='route-board'&&V.integer(side,2,20)&&n===side*side&&V.record(r)&&labelValue(r.label)&&V.integer(r.entrySlots,playerCount,12),'SCENE_NUMBERED_GEOMETRY_INVALID');
      V.check(Array.isArray(r.cells)&&r.cells.length===n&&new Set(r.cells.map(cell=>cell?.cell)).size===n&&r.cells.every(cell=>V.record(cell)&&V.integer(cell.cell,1,n)&&labelValue(cell.label)&&(cell.special===undefined||V.record(cell.special)&&V.identifier(cell.special.id)&&['adjustDie','lessDie','skipTurn','shield','secondDie','extraTurn'].includes(cell.special.icon)&&/^#[0-9a-f]{6}$/i.test(cell.special.color))),'SCENE_NUMBERED_CELL_INVALID');
      V.check(Array.isArray(r.links)&&r.links.length<=128&&r.links.every(link=>V.record(link)&&V.integer(link.from,1,n)&&V.integer(link.to,1,n)&&link.from!==link.to&&['ladder','snake'].includes(link.kind)),'SCENE_NUMBERED_LINK_INVALID');
      V.check(Array.isArray(scene.positions)&&scene.positions.length===playerCount&&new Set(scene.positions.map(p=>p?.player)).size===playerCount&&scene.positions.every(p=>V.record(p)&&V.integer(p.player,0,playerCount-1)&&p.id==='token-'+p.player&&integer(p.cell)&&point(p.point)&&V.integer(p.value,1,playerCount)&&labelValue(p.label)&&['','arrived','displaced'].includes(p.swapRole)),'SCENE_NUMBERED_PAWN_INVALID');
      V.check(r.source===null||V.record(r.source)&&V.record(r.source.entity)&&r.source.entity.namespace==='token'&&scene.positions.some(p=>p.id===entity(r.source.entity)),'SCENE_NUMBERED_SOURCE_INVALID');
      const a=r.adjustment;V.check(V.record(a)&&V.identifier(a.parameter)&&labelValue(a.label)&&typeof a.active==='boolean'&&Array.isArray(a.options)&&a.options.length>0&&a.options.length<=8&&new Set(a.options.map(o=>o?.value)).size===a.options.length&&a.options.every(o=>V.record(o)&&V.integer(o.value,-100,100)&&labelValue(o.label)),'SCENE_NUMBERED_ADJUSTMENT_INVALID');
      V.check(Array.isArray(scene.moves)&&scene.moves.length<=128&&scene.moves.every(m=>V.record(m)&&V.record(m.command)&&integer(m.landing)&&Array.isArray(m.route)&&m.route.length<=100&&m.route.every(integer)),'SCENE_NUMBERED_MOVE_INVALID');
      V.check((r.swapSummary===''||labelValue(r.swapSummary))&&Array.isArray(r.swapLabel)&&r.swapLabel.length<=playerCount&&r.swapLabel.every(labelValue),'SCENE_NUMBERED_SWAP_INVALID');
    }
    if(scene.routeStyle==='cross-and-circle'){
      const point=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isFinite(n)&&n>=-.5&&n<=14.5),g=scene.geometry;
      V.check(scene.family==='route-board'&&scene.routeStyle==='cross-and-circle'&&V.record(g)&&g.columns===15&&g.rows===15,'SCENE_CROSS_GEOMETRY_INVALID');
      V.check(Array.isArray(scene.boardSides)&&scene.boardSides.length===4&&new Set(scene.boardSides).size===4&&scene.boardSides.every(side=>['green','red','blue','yellow'].includes(side)),'SCENE_CROSS_SIDES_INVALID');
      V.check(Array.isArray(g.bases)&&g.bases.length===4&&g.bases.every(V.record)&&new Set(g.bases.map(base=>base.owner)).size===4&&g.bases.every(base=>V.record(base)&&V.integer(base.owner,0,3)&&[0,9].includes(base.x)&&[0,9].includes(base.y)&&base.width===6&&base.height===6),'SCENE_CROSS_BASE_INVALID');
      V.check(Array.isArray(scene.routeCells)&&scene.routeCells.length<=128&&scene.routeCells.length>0&&scene.routeCells.every(V.record)&&new Set(scene.routeCells.map(cell=>cell.id)).size===scene.routeCells.length&&scene.routeCells.every(cell=>V.record(cell)&&V.identifier(cell.id)&&point(cell.point)&&['path','home','finish'].includes(cell.kind)&&labelValue(cell.label)&&(cell.kind==='finish'||cell.point.every(Number.isInteger))&&(cell.side===undefined||V.integer(cell.side,0,3))&&(cell.symbol===undefined||['arrow','star'].includes(cell.symbol))&&(cell.rotation===undefined||V.integer(cell.rotation,0,3))),'SCENE_CROSS_CELL_INVALID');
      V.check(Array.isArray(g.anchors)&&g.anchors.length<=256&&g.anchors.every(anchor=>V.record(anchor)&&V.identifier(anchor.id)&&point(anchor.point)),'SCENE_CROSS_ANCHOR_INVALID');
      V.check(Array.isArray(scene.pawns)&&scene.pawns.length<=16&&scene.pawns.every(V.record)&&new Set(scene.pawns.map(pawn=>pawn.id)).size===scene.pawns.length&&scene.pawns.every(pawn=>V.record(pawn)&&V.integer(pawn.owner,0,Math.min(3,playerCount-1))&&V.integer(pawn.pawn,0,3)&&pawn.id==='token-'+pawn.owner+'-'+pawn.pawn&&point(pawn.point)&&V.integer(pawn.progress,-1,57)&&['base','track','finish'].includes(pawn.kind)&&typeof pawn.anchor==='string'&&labelValue(pawn.label)&&typeof pawn.friendly==='boolean'&&(pawn.command===undefined||V.record(pawn.command))),'SCENE_CROSS_PAWN_INVALID');
      const anchors=new Set(g.anchors.map(anchor=>anchor.id));V.check(Array.isArray(scene.moves)&&scene.moves.length<=128&&scene.moves.every(move=>V.record(move)&&V.record(move.command)&&anchors.has(move.anchor)&&['move','home','capture'].includes(move.targetKind)&&Array.isArray(move.route)&&move.route.length<=58&&move.route.every(anchor=>anchors.has(anchor))),'SCENE_CROSS_MOVE_INVALID');
    }
    if(scene.dice!==undefined){V.check(Array.isArray(scene.dice)&&scene.dice.length<=32,'SCENE_LIMIT');V.check(scene.dice.every(die=>die===null||V.integer(die,0,1000)||V.record(die)&&(die.value===null||V.integer(die.value,0,1000))&&['held','used','rollable','lastRolled'].every(key=>die[key]===undefined||typeof die[key]==='boolean')&&(die.motion===undefined||die.motion==='roll')&&validDiePrint(die)),'SCENE_DIE_INVALID');}
    if(scene.statusItems!==undefined)V.check(Array.isArray(scene.statusItems)&&scene.statusItems.length<=8&&scene.statusItems.every(item=>V.record(item)&&labelValue(item.label)&&V.integer(item.value,-1000000,1000000)),'SCENE_STATUS_INVALID');
    if(scene.family==='tile-chain'){
      const tile=value=>V.record(value)&&typeof value.id==='string'&&value.id.length>0&&value.id.length<=256&&V.integer(value.a,0,6)&&V.integer(value.b,0,6);
      V.check(scene.deck==='domino'&&Array.isArray(scene.chain)&&scene.chain.length<=256&&scene.chain.every(tile)&&new Set(scene.chain.map(tile=>tile.id)).size===scene.chain.length&&scene.chain.every((tile,index)=>!index||scene.chain[index-1].b===tile.a),'SCENE_CHAIN_INVALID');
      V.check(scene.openingTileId===null||scene.openingTileId===undefined||scene.chain.some(tile=>tile.id===scene.openingTileId),'SCENE_CHAIN_ANCHOR_INVALID');
      V.check(V.record(scene.chainPresentation)&&labelValue(scene.chainPresentation.label)&&labelValue(scene.chainPresentation.edge),'SCENE_CHAIN_LABELS_INVALID');
      V.check(Array.isArray(scene.placements)&&scene.placements.length<=512&&scene.placements.every(item=>V.record(item)&&V.record(item.command)&&V.integer(item.a,0,6)&&V.integer(item.b,0,6)&&(item.join===null||V.integer(item.join,0,6))&&labelValue(item.label)&&labelValue(item.caption)&&labelValue(item.help)),'SCENE_CHAIN_PLACEMENT_INVALID');
    }
    if(scene.solitaireLayout!==undefined){const l=scene.solitaireLayout,run=l?.kind==='completed-runs',card=c=>V.record(c)&&(c.hidden===true?Object.keys(c).every(k=>k==='hidden'):typeof c.id==='string'&&c.id.length>0&&c.id.length<=256&&V.integer(c.rank,2,14)&&['♥','♣','♦','♠'].includes(c.suit)&&c.open===true);
      V.check(scene.family==='solitaire'&&playerCount===1&&V.record(l)&&['waste-foundations','completed-runs'].includes(l.kind)&&V.record(l.labels)&&Object.keys(l.labels).length<=32&&Object.values(l.labels).every(labelValue),'SCENE_SOLITAIRE_LAYOUT_INVALID');
      V.check(Array.isArray(scene.tableau)&&scene.tableau.length===(run?10:7)&&scene.tableau.every(col=>Array.isArray(col)&&col.length<=104&&col.every(card))&&Array.isArray(scene.waste)&&scene.waste.length<=52&&scene.waste.every(card)&&Array.isArray(scene.foundations)&&scene.foundations.length===4&&scene.foundations.every(col=>Array.isArray(col)&&col.length<=13&&col.every(card))&&Array.isArray(scene.completed)&&scene.completed.length<=8&&scene.completed.every(col=>Array.isArray(col)&&col.length===13&&col.every(card))&&V.integer(scene.stockCount,0,104),'SCENE_SOLITAIRE_PILES_INVALID');
      const all=[...scene.tableau.flat(),...scene.waste,...scene.foundations.flat(),...scene.completed.flat()],open=all.filter(c=>!c.hidden),ids=new Set(open.map(c=>c.id));V.check(all.length+scene.stockCount===(run?104:52)&&ids.size===open.length&&open.every(c=>(scene.objects||[]).some(o=>o.ref.namespace==='card'&&o.ref.id===c.id)),'SCENE_SOLITAIRE_CARDS_INVALID');
      V.check(Array.isArray(scene.dragSources)&&scene.dragSources.length<=104&&scene.dragSources.every(id=>ids.has(id))&&['standard','none','vegas'].includes(scene.scoring)&&V.integer(scene.score,-1000000,1000000)&&V.integer(scene.moves,0,1000000)&&typeof scene.blockedDraw==='boolean'&&(run||[1,3].includes(scene.drawCapacity)),'SCENE_SOLITAIRE_STATE_INVALID');
      V.check(Array.isArray(l.homes)&&l.homes.length===(run?0:4)&&new Set(l.homes.map(h=>h?.index)).size===l.homes.length&&new Set(l.homes.map(h=>h?.suit)).size===l.homes.length&&l.homes.every(h=>V.record(h)&&V.integer(h.index,0,3)&&['♥','♣','♦','♠'].includes(h.suit))&&Array.isArray(l.hints)&&l.hints.length<=1024&&l.hints.every(V.record),'SCENE_SOLITAIRE_CHOICES_INVALID');
      V.check(Array.isArray(l.transfers)&&l.transfers.length<=52&&l.transfers.every(t=>V.record(t)&&card(t.card)&&!t.card.hidden&&ids.has(t.card.id)&&typeof t.from==='string'&&/^(?:waste|tableau-\d+-\d+)$/.test(t.from)&&typeof t.to==='string'&&t.to==='home-'+t.card.suit),'SCENE_SOLITAIRE_TRANSFERS_INVALID');
    }
    if(scene.skinFamilies!==undefined)V.check(Array.isArray(scene.skinFamilies)&&scene.skinFamilies.length<=16&&new Set(scene.skinFamilies).size===scene.skinFamilies.length&&scene.skinFamilies.every(V.identifier),'SCENE_SKIN_FAMILIES_INVALID');
    if(scene.memoryLayout!==undefined){
      V.check(scene.family==='memory-cards'&&V.record(scene.memoryLayout)&&scene.memoryLayout.kind==='paired-grid'&&labelValue(scene.memoryLayout.label)&&['cartoon-deck','standard-deck'].includes(scene.assetSet)&&typeof scene.revealing==='boolean'&&V.integer(scene.selectionCount,0,2)&&(scene.revealing?scene.selectionCount===2:true),'SCENE_MEMORY_LAYOUT_INVALID');
      V.check(Array.isArray(scene.cards)&&scene.cards.length>=2&&scene.cards.length<=96&&scene.cards.length%2===0&&new Set(scene.cards.map(c=>c?.id)).size===scene.cards.length&&scene.cards.every((c,i)=>V.record(c)&&c.index===i&&typeof c.id==='string'&&c.id.length>0&&c.id.length<=256&&V.record(c.card)&&typeof c.matched==='boolean'&&typeof c.closing==='boolean'&&(!c.closing||scene.revealing)&&(!c.matched||c.card.hidden!==true)&&(c.label===undefined||labelValue(c.label))&&(c.card.hidden===true?Object.keys(c.card).every(key=>key==='hidden'):typeof c.card.id==='string'&&(typeof c.card.character==='string'||V.integer(c.card.rank,0,20)&&typeof c.card.suit==='string'))),'SCENE_MEMORY_CARDS_INVALID');
    }
    if(scene.fleetLayout!==undefined){const l=scene.fleetLayout,bindings=new Map((scene.interactions||[]).map(i=>[V.canonical(i.command),i]));
      V.check(scene.family==='grid-board'&&scene.columns===10&&scene.rows===10&&V.record(l)&&l.kind==='naval'&&V.integer(l.base,0,playerCount-1)&&(l.setupPlayer===null||V.integer(l.setupPlayer,0,playerCount-1))&&V.integer(l.preferredPlayer,0,playerCount-1)&&typeof l.orientation==='boolean','SCENE_NAVAL_LAYOUT_INVALID');
      V.check(playerCount===2&&Array.isArray(l.boards)&&l.boards.length===2&&new Set(l.boards.map(b=>b?.player)).size===2&&l.boards.every(b=>V.record(b)&&V.integer(b.player,0,1)&&labelValue(b.label)&&Array.isArray(b.indicators)&&b.indicators.length<=8&&b.indicators.every(i=>V.record(i)&&V.integer(i.size,1,8)&&V.integer(i.value,0,16)&&labelValue(i.label))),'SCENE_NAVAL_BOARDS_INVALID');
      for(const b of l.boards){
        V.check(Array.isArray(b.cells)&&b.cells.length===100&&new Set(b.cells.map(c=>c?.cell)).size===100&&b.cells.every(c=>V.record(c)&&V.integer(c.cell,0,99)&&[null,'hit','miss'].includes(c.shot)&&labelValue(c.label)),'SCENE_NAVAL_CELLS_INVALID');
        V.check(Array.isArray(b.ships)&&b.ships.length<=16&&new Set(b.ships.map(s=>s?.ref?.id)).size===b.ships.length&&b.ships.every(s=>V.record(s)&&V.record(s.ref)&&s.ref.namespace==='ship'&&typeof s.ref.id==='string'&&s.ref.id.length>0&&s.ref.id.length<=256&&Array.isArray(s.cells)&&s.cells.length>0&&s.cells.length<=8&&s.cells.every(c=>V.integer(c,0,99))&&new Set(s.cells).size===s.cells.length&&typeof s.vertical==='boolean'&&s.cells.every((c,i)=>c===s.cells[0]+i*(s.vertical?10:1)&&(s.vertical||Math.floor(c/10)===Math.floor(s.cells[0]/10)))&&labelValue(s.label)&&[s.remove,s.rotate].every(c=>c===undefined||V.record(c))&&(scene.objects||[]).some(o=>o.ref.namespace===s.ref.namespace&&o.ref.id===s.ref.id&&o.owner===b.player&&V.canonical(o.cells)===V.canonical(s.cells))),'SCENE_NAVAL_SHIPS_INVALID');
      }
      V.check(Array.isArray(l.placements)&&l.placements.length<=4096&&l.placements.every(p=>{if(!V.record(p)||!V.record(p.command)||!V.record(p.source)||typeof p.vertical!=='boolean'||typeof p.preserveSelection!=='boolean'||!V.integer(p.cell,0,99))return false;const binding=bindings.get(V.canonical(p.command));return !!binding&&V.canonical(binding.source)===V.canonical(p.source)&&binding.target?.zone==='fleet-'+l.setupPlayer&&binding.target.cell===p.cell;}),'SCENE_NAVAL_PLACEMENTS_INVALID');
      V.check(V.record(l.controls)&&['rotateLabel','removeLabel','followLabel','ownLabel','enemyLabel'].every(k=>labelValue(l.controls[k]))&&['auto','ready','orient'].every(k=>V.record(l.controls[k])&&labelValue(l.controls[k].label)&&(l.controls[k].command===undefined||V.record(l.controls[k].command))),'SCENE_NAVAL_CONTROLS_INVALID');
    }
    if(scene.checkerLayout!==undefined){const l=scene.checkerLayout;
      V.check(scene.family==='grid-board'&&scene.columns===8&&scene.rows===8&&V.record(l)&&l.kind==='draughts'&&typeof l.flipped==='boolean'&&labelValue(l.label)&&V.integer(scene.lightPlayer,0,playerCount-1),'SCENE_DRAUGHTS_LAYOUT_INVALID');
      V.check(Array.isArray(scene.pieces)&&scene.pieces.length<=64&&new Set(scene.pieces.map(p=>p?.id)).size===scene.pieces.length&&new Set(scene.pieces.map(p=>p?.cell)).size===scene.pieces.length&&scene.pieces.every(p=>V.record(p)&&typeof p.id==='string'&&p.id.length>0&&p.id.length<=256&&V.integer(p.cell,0,63)&&V.integer(p.owner,0,playerCount-1)&&V.integer(p.side,0,1)&&typeof p.king==='boolean'&&typeof p.captured==='boolean'),'SCENE_DRAUGHTS_PIECES_INVALID');
      V.check(scene.forced===null||V.integer(scene.forced,0,63)&&scene.pieces.some(p=>p.cell===scene.forced),'SCENE_DRAUGHTS_FORCED_INVALID');
      // Empty cells retain a required accessible label but need no piece help.
      V.check(Array.isArray(l.cells)&&l.cells.length===64&&new Set(l.cells.map(c=>c?.cell)).size===64&&l.cells.every(c=>V.record(c)&&V.integer(c.cell,0,63)&&['file','rank'].every(key=>typeof c[key]==='string'&&c[key].length<=1)&&labelValue(c.label)&&(c.help===''||labelValue(c.help))),'SCENE_DRAUGHTS_CELLS_INVALID');
      V.check(Array.isArray(l.moves)&&l.moves.length<=256&&l.moves.every(m=>V.record(m)&&V.record(m.command)&&V.record(m.source)&&m.source.namespace==='checker'&&scene.pieces.some(p=>p.id===m.source.id&&p.cell===m.from)&&V.integer(m.to,0,63)&&typeof m.capture==='boolean'&&typeof m.kingMove==='boolean'&&labelValue(m.label)&&labelValue(m.help)),'SCENE_DRAUGHTS_MOVES_INVALID');
    }
    if(scene.scoreLayout!==undefined){
      // Category keys retain authored case; they are bounded DOM keys, not code.
      const key=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(value),l=scene.scoreLayout,rows=scene.rows,numeric=value=>V.integer(value,-1000000,1000000),values=list=>Array.isArray(list)&&list.length===playerCount&&list.every(numeric);
      V.check(scene.family==='score-table'&&V.record(l)&&l.kind==='category-sheet'&&labelValue(l.categoryLabel)&&Array.isArray(rows)&&rows.length>0&&rows.length<=64&&new Set(rows.map(row=>row?.id)).size===rows.length,'SCENE_SCORE_LAYOUT_INVALID');
      V.check(rows.every(row=>V.record(row)&&key(row.id)&&labelValue(row.label)&&Array.isArray(row.cells)&&row.cells.length===playerCount&&row.cells.every((cell,index)=>V.record(cell)&&cell.player===index&&(cell.value===null||numeric(cell.value))&&numeric(cell.preview)&&labelValue(cell.label)&&(cell.command===null||cell.command===undefined||V.record(cell.command)))),'SCENE_SCORE_ROW_INVALID');
      V.check(Array.isArray(l.summaries)&&l.summaries.length<=16&&new Set(l.summaries.map(row=>row?.id)).size===l.summaries.length&&l.summaries.every(row=>V.record(row)&&key(row.id)&&rows.some(r=>r.id===row.afterRow)&&labelValue(row.label)&&values(row.values)),'SCENE_SCORE_SUMMARY_INVALID');
      V.check(V.record(l.total)&&key(l.total.id)&&labelValue(l.total.label)&&values(l.total.values),'SCENE_SCORE_TOTAL_INVALID');
      V.check(V.record(l.controls)&&labelValue(l.controls.label)&&typeof l.controls.public==='boolean'&&(l.controls.command===undefined||V.record(l.controls.command)),'SCENE_SCORE_CONTROL_INVALID');
    }
    if(scene.tableLayout!==undefined){
      const table=scene.tableLayout;
      V.check(scene.family==='card-table'&&V.record(table)&&['stock-discard','paired-tricks','collected-sets','discard-pairs'].includes(table.kind)&&
        (table.kind==='discard-pairs'||V.integer(scene.stockCount,0,100000))&&(['discard-pairs','stock-discard','paired-tricks'].includes(table.kind)?V.integer(scene.discardCount,0,100000):true),'SCENE_TABLE_LAYOUT_INVALID');
      if(table.kind==='collected-sets')V.check(labelValue(table.stockLabel)&&Array.isArray(table.rows)&&table.rows.length===playerCount&&new Set(table.rows.map(row=>row?.player)).size===playerCount&&table.rows.every(row=>V.record(row)&&V.integer(row.player,0,playerCount-1)&&labelValue(row.label)&&Array.isArray(row.cards)&&row.cards.length<=64&&row.cards.every(card=>V.record(card)&&typeof card.id==='string'&&card.id.length>0&&card.id.length<=256&&V.integer(card.rank,2,15))),'SCENE_COLLECTION_INVALID');
      if(table.kind==='collected-sets'){const ids=table.rows.flatMap(row=>row.cards.map(card=>card.id));V.check(new Set(ids).size===ids.length,'SCENE_COLLECTION_CARD_DUPLICATE');}
      if(table.kind==='discard-pairs')V.check(labelValue(table.discardLabel)&&Array.isArray(scene.discard)&&scene.discard.length<=256&&scene.discard.every(card=>V.record(card)&&typeof card.id==='string'&&card.id.length>0&&card.id.length<=256&&!card.hidden&&V.integer(card.rank,0,20)&&typeof card.suit==='string'&&card.suit.length<=8&&(card.crown===undefined||typeof card.crown==='boolean')),'SCENE_DISCARD_PAIRS_INVALID');
      if(table.kind==='paired-tricks'){
        const card=c=>V.record(c)&&typeof c.id==='string'&&c.id.length>0&&c.id.length<=256&&V.integer(c.rank,0,20)&&typeof c.suit==='string'&&c.suit.length<=8&&!c.hidden&&labelValue(c.label)&&labelValue(c.help)&&(c.rankLabel===undefined||V.integer(c.rankLabel,0,20)||labelValue(c.rankLabel));
        V.check(V.integer(table.capacity,1,12)&&['stockLabel','discardLabel','uncoveredLabel','trumpLabel'].every(key=>labelValue(table[key]))&&Array.isArray(scene.table)&&scene.table.length<=table.capacity&&scene.table.every(pair=>V.record(pair)&&card(pair.attack)&&(pair.defense===null||card(pair.defense)))&&(scene.trump===null||card(scene.trump)),'SCENE_TRICK_TABLE_INVALID');
        const ids=scene.table.flatMap(pair=>[pair.attack,pair.defense].filter(Boolean).map(card=>card.id));V.check(new Set(ids).size===ids.length,'SCENE_TRICK_CARD_DUPLICATE');
      }
      if(table.flow!==undefined)V.check(table.kind==='stock-discard'&&V.record(table.flow)&&['red','yellow','green','blue','wild','black'].includes(table.flow.color)&&
        (table.flow.direction===undefined||table.flow.direction===1||table.flow.direction===-1),'SCENE_TABLE_FLOW_INVALID');
    }
    if(scene.handInspection!==undefined)V.check(typeof scene.handInspection==='boolean','SCENE_HAND_INSPECTION_INVALID');
    if(scene.playerChoices!==undefined){const p=scene.playerChoices;V.check(V.record(p)&&['request','cards'].includes(p.kind)&&(p.cardShape===undefined||['portrait','square'].includes(p.cardShape))&&Array.isArray(p.choices)&&p.choices.length<=2048&&p.choices.every(choice=>V.record(choice)&&V.integer(choice.player,0,playerCount-1)&&V.record(choice.command)&&labelValue(choice.label)&&(p.kind==='cards'?V.integer(choice.index,0,255):V.record(choice.source)&&typeof choice.source.namespace==='string'&&typeof choice.source.id==='string'&&(scene.objects||[]).some(object=>object.ref.namespace===choice.source.namespace&&object.ref.id===choice.source.id))),'SCENE_PLAYER_CHOICES_INVALID');}
    if(scene.cellStyle==='mark-token')V.check(V.integer(scene.columns,1,20)&&V.integer(scene.rows,1,20)&&Array.isArray(scene.cells)&&scene.cells.length===scene.columns*scene.rows,'SCENE_MARK_BOARD_INVALID');
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
    if(scene.arenaLayout!==undefined){const l=scene.arenaLayout,a=scene.arena;
      V.check(scene.family==='board'&&V.record(l)&&l.kind==='elemental-grid'&&V.record(l.labels)&&Object.keys(l.labels).length<=256&&Object.values(l.labels).every(labelValue),'SCENE_ARENA_LAYOUT_INVALID');
      const elements=['air','earth','water','fire'],actions=['movement','attack','ultimate'],tiles=['ground','base','wall','spikes','falling_floor','puddle','desert','air_island','forest'],actor=n=>V.integer(n,0,playerCount-1),point=q=>Array.isArray(q)&&q.length===2&&q.every(n=>V.integer(n,-32,64));
      const choice=c=>V.record(c)&&actions.includes(c.action)&&V.integer(c.direction,0,3)&&(c.element===undefined||elements.includes(c.element))&&(c.cardId===undefined||typeof c.cardId==='string'&&c.cardId.length<=256);
      const plan=p=>V.record(p)&&(p.steps===undefined?choice(p):Array.isArray(p.steps)&&p.steps.length<=2&&p.steps.every(choice));
      const effect=e=>V.record(e)&&actor(e.actor)&&elements.includes(e.element)&&choice(e)&&point(e.origin)&&Array.isArray(e.cells)&&e.cells.length<=1024&&e.cells.every(point)&&(!e.projectile||V.record(e.projectile)&&point(e.projectile.end));
      // These values enter native SVG/HTML templates. Validate every public
      // frame as well as live data; a valid outer plan is not a safe UI payload.
      const state=v=>V.record(v)&&V.integer(v.inset,0,Math.floor(a.size/2))&&Array.isArray(v.board)&&v.board.length===a.size*a.size&&v.board.every(tile=>tile===null||tiles.includes(tile))&&Array.isArray(v.players)&&v.players.length===playerCount&&v.players.every(p=>V.record(p)&&(p.pos===null||point(p.pos))&&V.record(p.healthMetric)&&metric(p.healthMetric)&&p.healthMetric.display?.icon==='heart'&&V.integer(p.healthMetric.display.capacity,1,64)&&V.integer(p.healthMetric.value,0,p.healthMetric.display.capacity)&&Array.isArray(p.metrics)&&p.metrics.every(metric)&&(!p.hand||Array.isArray(p.hand)&&p.hand.length<=64&&p.hand.every(c=>V.record(c)&&typeof c.id==='string'&&c.id.length<=256&&elements.includes(c.element)))&&(!p.draft||choice(p.draft))&&(!p.plan||plan(p.plan)))&&(!v.effect||effect(v.effect))&&(!v.effects||Array.isArray(v.effects)&&v.effects.length<=1024&&v.effects.every(effect))&&(!v.teamLives||Array.isArray(v.teamLives)&&v.teamLives.length<=4&&v.teamLives.every(n=>V.integer(n,0,64)))&&(!v.shrinkCounter||V.record(v.shrinkCounter)&&V.integer(v.shrinkCounter.capacity,1,12)&&V.integer(v.shrinkCounter.filled,0,v.shrinkCounter.capacity)&&typeof v.shrinkCounter.scheduled==='boolean')&&(!v.window||V.record(v.window)&&Array.isArray(v.window.participants)&&v.window.participants.length<=playerCount&&v.window.participants.every(actor)&&Array.isArray(v.window.ready)&&v.window.ready.length<=playerCount&&v.window.ready.every(actor));
      V.check(V.record(a)&&dimension(a.size)&&V.record(a.config)&&typeof a.config.teams==='boolean'&&V.integer(a.config.steps,1,2)&&state(a),'SCENE_ARENA_PLAYERS_INVALID');
      V.check(!scene.plan||scene.plan.scenes.every(frame=>V.record(frame)&&['start','turn-reveal','reveal','effects','live'].includes(frame.kind)&&(frame.step===undefined||V.integer(frame.step,0,1))&&(!frame.state||state(frame.state))&&(!frame.effects||Array.isArray(frame.effects)&&frame.effects.every(effect))&&(frame.kind!=='turn-reveal'||Array.isArray(frame.phases)&&frame.phases.length<=8&&frame.phases.every(phase=>V.record(phase)&&Array.isArray(phase.cards)&&phase.cards.length<=playerCount&&phase.cards.every(c=>choice(c)&&actor(c.actor)&&elements.includes(c.element))))),'SCENE_ARENA_FRAMES_INVALID');
    }
    if(scene.arena)V.check(V.record(scene.arena)&&dimension(scene.arena.size)&&Array.isArray(scene.arena.board)&&
      scene.arena.board.length===scene.arena.size*scene.arena.size&&Array.isArray(scene.arena.players)&&scene.arena.players.length<=playerCount,'SCENE_LIMIT');
    const players=new Set();
    for(const person of scene.players){
      V.check(V.record(person)&&V.integer(person.player,0,playerCount-1)&&
        !Object.hasOwn(person,'id')&&!players.has(person.player),'SCENE_PLAYER_INVALID');
      if(person.inactive!==undefined)V.check(typeof person.inactive==='boolean','SCENE_PLAYER_INACTIVE_INVALID');
      if(person.badges!==undefined)V.check(Array.isArray(person.badges)&&person.badges.length<=12&&person.badges.every(b=>V.record(b)&&labelValue(b.label)&&['sword','shield','takeCards','adjustDie','lessDie','skipTurn','secondDie','extraTurn','host'].includes(b.icon)&&(b.color===undefined||/^#[0-9a-f]{6}$/i.test(b.color))),'SCENE_PLAYER_BADGE_INVALID');
      players.add(person.player);
      V.check(person.finishPlace===undefined||V.integer(person.finishPlace,0,playerCount),'SCENE_FINISH_INVALID');
      V.check(Array.isArray(person.metrics),'SCENE_METRICS_INVALID');
      const ids=new Set();
      for(const item of person.metrics){
        metric(item);
        V.check(!ids.has(item.id),'SCENE_METRIC_DUPLICATE');ids.add(item.id);
      }
    }
    if(scene.vote!==undefined){const vote=scene.vote,validPlayers=list=>Array.isArray(list)&&list.length<=playerCount&&new Set(list).size===list.length&&list.every(player=>V.integer(player,0,playerCount-1));V.check(V.record(vote)&&typeof vote.id==='string'&&vote.id.length>0&&vote.id.length<=128&&typeof vote.title==='string'&&vote.title.length<=200&&V.integer(vote.deadline,0,Number.MAX_SAFE_INTEGER)&&(vote.startedAt===undefined||V.integer(vote.startedAt,0,vote.deadline))&&validPlayers(vote.eligible)&&vote.eligible.length>0&&validPlayers(vote.voted)&&validPlayers(vote.against===undefined?[]:vote.against)&&vote.voted.every(player=>vote.eligible.includes(player))&&(vote.against||[]).every(player=>vote.eligible.includes(player)&&!vote.voted.includes(player))&&V.integer(vote.required,1,vote.eligible.length)&&typeof vote.accepted==='boolean','SCENE_VOTE_INVALID');}
    if(scene.notices!==undefined){
      V.check(Array.isArray(scene.notices)&&scene.notices.length<=4&&scene.notices.every(V.record),'SCENE_NOTICE_INVALID');
      V.check(new Set(scene.notices.map(item=>item.id)).size===scene.notices.length,'SCENE_NOTICE_INVALID');
      for(const item of scene.notices){
        V.check(typeof item.id==='string'&&item.id.length>0&&item.id.length<=128&&typeof item.title==='string'&&item.title.length<=200,'SCENE_NOTICE_INVALID');
        for(const [key,limit]of [['summary',500],['details',2000]])V.check(item[key]===undefined||typeof item[key]==='string'&&item[key].length<=limit,'SCENE_NOTICE_INVALID');
        V.check(item.dismissible===undefined||typeof item.dismissible==='boolean','SCENE_NOTICE_INVALID');
        V.check(item.actions===undefined||Array.isArray(item.actions)&&item.actions.length<=6&&item.actions.every(action=>V.record(action)&&typeof action.label==='string'&&action.label.length<=120&&V.record(action.command)),'SCENE_NOTICE_INVALID');
        V.check(item.timer===undefined||V.record(item.timer)&&V.integer(item.timer.startedAt,0,Number.MAX_SAFE_INTEGER)&&V.integer(item.timer.deadline,item.timer.startedAt,Number.MAX_SAFE_INTEGER),'SCENE_NOTICE_INVALID');
        V.check(item.distribution===undefined||Array.isArray(item.distribution)&&item.distribution.length<=8&&item.distribution.every(part=>V.record(part)&&typeof part.label==='string'&&part.label.length<=80&&V.integer(part.value,0,1000000)&&['positive','negative','neutral'].includes(part.color)),'SCENE_NOTICE_INVALID');
      }
    }
    if(scene.clock!==undefined)V.check(V.record(scene.clock)&&V.integer(scene.clock.deadline,0,Number.MAX_SAFE_INTEGER)&&(scene.clock.startedAt===undefined||V.integer(scene.clock.startedAt,0,scene.clock.deadline))&&(scene.clock.player===undefined||V.integer(scene.clock.player,0,playerCount-1)),'SCENE_CLOCK_INVALID');
    if(scene.menuActions!==undefined)V.check(Array.isArray(scene.menuActions)&&scene.menuActions.length<=12&&scene.menuActions.every(action=>V.record(action)&&typeof action.label==='string'&&action.label.length>0&&action.label.length<=120&&V.record(action.command)),'SCENE_MENU_INVALID');
    const dockLabel=value=>typeof value==='string'?value.length>0&&value.length<=120:V.record(value)&&typeof value.key==='string'&&value.key.length>0&&value.key.length<=256;
    if(scene.controls!==undefined)V.check(Array.isArray(scene.controls)&&scene.controls.length<=12&&scene.controls.every(control=>V.record(control)&&dockLabel(control.label)&&V.record(control.command)),'SCENE_CONTROLS_INVALID');
    if(scene.cardHelp!==undefined)V.check(dockLabel(scene.cardHelp),'SCENE_CARD_HELP_INVALID');
    if(scene.actionDock!==undefined)V.check(V.record(scene.actionDock)&&Object.keys(scene.actionDock).every(key=>['start','primary','end'].includes(key))&&
      Object.values(scene.actionDock).every(items=>Array.isArray(items)&&items.length<=12&&items.every(item=>V.record(item)&&dockLabel(item.label)&&(item.command===undefined||V.record(item.command)))),'SCENE_ACTION_DOCK_INVALID');
    if(scene.geometry!==undefined||scene.anchoredLayout!==undefined||scene.inventoryLayout!==undefined)geometry(scene,playerCount);
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
    inventoryVisibility(scene,projection);
    const allowed=new Set([...projection.actions,...(projection.inputs||[]).map(input=>input.command)].map(V.canonical));
    const controls=[...(Array.isArray(scene.cells)?scene.cells:[]),...(Array.isArray(scene.rows)?scene.rows.flatMap(row=>row.cells||[]):[]),
      ...(scene.interactions||[]),...(scene.family==='tile-chain'?scene.placements:[]),...(scene.routeStyle==='cross-and-circle'?[...scene.moves,...scene.pawns]:scene.routeStyle==='numbered-serpentine'?scene.moves:[]),...(scene.controls||[]),...(scene.menuActions||[]),...(scene.playerChoices?.choices||[]),...(scene.checkerLayout?.moves||[]),...(scene.solitaireLayout?.hints||[]).map(command=>({command})),...(scene.fleetLayout?.placements||[]),...Object.values(scene.fleetLayout?.controls||{}).filter(c=>V.record(c)),...(scene.fleetLayout?.boards||[]).flatMap(b=>b.ships.flatMap(s=>[{command:s.remove},{command:s.rotate}])),scene.scoreLayout?.controls,...Object.values(scene.actionDock||{}).flat(),scene.canvas,scene.chat,scene.vote,{command:scene.vote?.againstCommand},...(scene.notices||[]).flatMap(notice=>notice.actions||[]),
      ...(scene.chat?.messages||[]).map(message=>({command:message.confirmCommand}))].filter(Boolean);
    for(const control of controls)V.check(control.command===undefined||control.command===null||allowed.has(V.canonical(control.command)),'SCENE_COMMAND_DENIED');
    const previewCards=[...Object.keys(scene.nextPlayerByCard||{}),...Object.keys(scene.turnPreviewByCard||{})];
    if(previewCards.length){
      const sources=new Set((scene.interactions||[]).filter(item=>item.source?.entity?.namespace==='card').map(item=>item.source.entity.id));
      V.check(previewCards.every(id=>sources.has(id)),'SCENE_TURN_PREVIEW_SOURCE_DENIED');
    }
    return scene;
  }
  return Object.freeze({validate,commands,metric,entity,sequence,event,eventScenes,geometry});
});
