(function (root) {
  'use strict';
  const entityKey=ref=>root.PlayroomGameComponents.entityKey(ref);
  const instanceKey=(namespace,id)=>entityKey({namespace,id:String(id)});
  const policy=root.PlayroomSizeCatalogue?.presentation?.motion||{};
  function startAnimationsOnFrame(animations,context,started){
    let frame=null,detach,rate=1;
    const pause=()=>{if(frame!==null){root.cancelAnimationFrame(frame);frame=null;}};
    const resume=()=>{
      if(frame!==null)return;
      frame=root.requestAnimationFrame(frameTime=>{
        frame=null;detach?.();
        // A busy render can deliver a frame timestamp from before preparation.
        // Start the whole group on the live clock and hand it to the plan.
        const start=Math.max(frameTime,root.performance.now());
        for(const animation of animations){
          if(animation.playbackRate!==rate)animation.playbackRate=rate;
          animation.play();
          animation.startTime=start;
          context?.animation(animation);
        }
        started();
      });
    };
    resume();
    detach=context?.track?.({pause,resume,rate:value=>{rate=value;},cancel:pause});
    return ()=>{pause();detach?.();};
  }
  function surface(mount=()=>root.document){
  const query=selector=>mount()?.querySelector(selector),queryAll=selector=>mount()?.querySelectorAll(selector)||[];
  let running = null, measuringField = false;
  const handSelector = '.hand-track, .hand-cards, .hand-scroll, .mini-hand';
  const rectOf = el => { const r = el?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null; };
  const geometryPass=()=>({rects:new Map(),styles:new Map(),angles:new Map()});
  function measuredRect(node,geometry){
    if(!node||!geometry)return rectOf(node);
    if(!geometry.rects.has(node))geometry.rects.set(node,rectOf(node));
    return geometry.rects.get(node);
  }
  const isHand = el => !!el.closest(handSelector);
  // Shared decks keep their inactive pages mounted outside the viewport.
  // Their DOM positions do not represent visible motion sources or targets.
  const isOffPage = el => !!el.closest('.shared-page-deck > .shared-page-panel[aria-hidden="true"]');
  const publicEntity = el => !isHand(el) && !el.closest('[data-motion-static],[data-drop-piece]');
  function clampRect(rect, boundary) {
    if (!rect) return null;
    const edge = boundary || { x: 0, y: 0, width: root.innerWidth, height: root.innerHeight };
    const left = Math.max(0, edge.x), top = Math.max(0, edge.y);
    const right = Math.min(root.innerWidth, edge.x + edge.width), bottom = Math.min(root.innerHeight, edge.y + edge.height);
    const scale = Math.min(1,Math.max(1,right-left)/rect.width,Math.max(1,bottom-top)/rect.height), width=rect.width*scale,height=rect.height*scale;
    return { x: Math.max(left, Math.min(rect.x, right - width)), y: Math.max(top, Math.min(rect.y, bottom - height)), width, height };
  }
  // Keep the local card shape separate from its axis-aligned screen bounds.
  // A rotated parent changes the screen pose, not the card's aspect ratio.
  function styleOf(node,geometry) {
    if(!geometry)return root.getComputedStyle(node);
    if(!geometry.styles.has(node))geometry.styles.set(node,root.getComputedStyle(node));
    return geometry.styles.get(node);
  }
  function localRotation(node,geometry,style) {
    const computed=style||styleOf(node,geometry),transform=computed.transform;
    const rotation=/^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(computed.rotate);
    let angle=rotation?Number(rotation[1])*({deg:Math.PI/180,rad:1,turn:Math.PI*2,grad:Math.PI/200}[rotation[2]]):0;
    if(transform&&transform!=='none'){const m=new root.DOMMatrixReadOnly(transform);angle+=Math.atan2(m.b,m.a);}
    return angle;
  }
  function screenRotation(element,geometry,style){
    let angle=0;
    if(!geometry){
      for(let node=element;node;node=node.parentElement)angle+=localRotation(node,null,node===element?style:null);
      return angle;
    }
    const {angles}=geometry;
    if(angles.has(element))return angles.get(element);
    // Cache the screen angle of each common ancestor, so sibling cards do
    // not walk the hand and its parents again in the same geometry pass.
    const chain=[];
    let node=element;
    for(;node&&!angles.has(node);node=node.parentElement)chain.push(node);
    angle=angles.get(node)??0;
    for(let i=chain.length-1;i>=0;i--){
      const ancestor=chain[i];
      angle+=localRotation(ancestor,geometry,ancestor===element?style:null);
      angles.set(ancestor,angle);
    }
    return angle;
  }
  function poseOf(el,r=undefined,geometry) {
    if(r===undefined)r=measuredRect(el,geometry);
    if(!r)return null;
    const style=styleOf(el,geometry),width=el.offsetWidth||parseFloat(style.width)||r.width,height=el.offsetHeight||parseFloat(style.height)||r.height;
    const angle=root.DOMMatrixReadOnly?screenRotation(el,geometry,style):0;
    const scale=Math.min(r.width/(Math.abs(Math.cos(angle))*width+Math.abs(Math.sin(angle))*height),r.height/(Math.abs(Math.sin(angle))*width+Math.abs(Math.cos(angle))*height));
    return {x:r.x+(r.width-width*scale)/2,y:r.y+(r.height-height*scale)/2,width:width*scale,height:height*scale,angle:angle*180/Math.PI};
  }
  function handOrigin(hand, geometry, maxWidth = 38, maxHeight = 54) {
    const r = poseOf(hand,undefined,geometry);
    if (!r) return null;
    // A compact anchor represents the centre of a hidden hand; no hidden card
    // identity or face is read, stored, or cloned by the motion layer.
    const width = Math.min(maxWidth, r.width), height = Math.min(maxHeight, r.height);
    return {...clampRect({ x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height }),angle:r.angle};
  }
  function handOrigins(scene, viewer, geometry) {
    const hands = new Map();
    if (!scene) return hands;
    for (const owner of scene.querySelectorAll('[data-player-index]')) {
      const player = Number(owner.dataset.playerIndex), hand = owner.querySelector('.mini-hand');
      if (Number.isInteger(player) && hand) hands.set(player, handOrigin(hand,geometry));
    }
    if (Number.isInteger(viewer)) hands.set(viewer, handOrigin(scene.querySelector('.hand-track, .hand-cards, .hand-scroll'),geometry));
    return hands;
  }
  function firstMotionNodes(nodes,key){
    const index=new Map();
    for(const node of nodes){
      const id=node.dataset[key];
      if(!index.has(id))index.set(id,node);
    }
    return index;
  }
  // Each layout pass resolves the first mounted anchor with the authored ID.
  // Rebuild on resize so a replaced anchor or a changed cell size is measured.
  function routeGeometry(scene){
    const anchors=firstMotionNodes(scene.querySelectorAll('[data-motion-anchor]'),'motionAnchor'),rects=new Map();
    return ({anchor})=>{
      if(!rects.has(anchor))rects.set(anchor,rectOf(anchors.get(anchor)));
      return rects.get(anchor);
    };
  }
  function capture({ actor = null, action = null, viewer = null, playedFrom = null, playedEntity = null, playedTarget = null, sceneModel = null, deferDepartures = false } = {}) {
    const doc = root.document, scene = query('.scene'), entities = new Map(), departureSources = new Map(), stacks = new Map();
    const cardsLayout=scene?.querySelector('[data-motion-layout="cards"]');
    // Capture the mounted source once. The destination gets a new pass
    // after the field update, even when the renderer retains the same nodes.
    const geometry=geometryPass();
    const boardZones=new Set((sceneModel?.plan?[]:sceneModel?.zones)?.filter(zone=>zone.kind==='board').map(zone=>zone.id));
    const boardRefs=new Set(sceneModel?.objects?.filter(object=>boardZones.has(object.zone)).map(object=>entityKey(object.ref)));
    // Attached objects share the carrier's rendered pose and flight. They
    // contribute to its artwork, but never create an independent flight.
    if (scene) for (const el of scene.querySelectorAll('[data-entity]:not([data-motion-attached])')) {
      if(isOffPage(el))continue;
      const rect = rectOf(el);
      if (!rect || styleOf(el,geometry).visibility === 'hidden') continue;
      const hand = el.closest(handSelector), container=hand||scene;
      const boundary=measuredRect(container,geometry);
      // A declared public board piece may also be a drag destination. Its
      // interaction marker must not hide its physical identity from motion.
      // Undeclared targets, private hands and static templates stay excluded.
      const id=el.dataset.entity,boardRef=boardRefs.has(id),publicNode=publicEntity(el);
      const exposed=publicNode||boardRef&&!hand&&!el.closest('[data-motion-static],[data-motion-template]');
      const board=boardRef&&exposed;
      const entity={rect:clampRect(rect,boundary),pose:poseOf(el,rect,geometry),hand:!!hand,handRect:hand?rect:null,
        handOwner:hand?(hand.matches('.mini-hand')?Number(hand.closest('[data-player-index]')?.dataset.playerIndex):viewer):null,public:exposed,board};
      if(cardsLayout&&publicNode&&action?.type==='draw'&&el.dataset.motionZone==='waste')entity.clone=styledClone(el);
      if(board){
        if(deferDepartures)departureSources.set(id,el);
        else entity.departureClone=styledClone(el);
      }else if(deferDepartures)departureSources.delete(id);
      entities.set(id,entity);
    }
    // Preserve only the previously visible public top of each named home pile.
    // The arrival must cover it; the final DOM contains only the new top.
    if(scene)for(const el of scene.querySelectorAll('[data-entity][data-motion-home]')){
      const home=el.dataset.motionHome,anchor=el.closest('[data-motion-anchor]');
      if(anchor?.dataset.motionAnchor===home&&publicEntity(el)&&styleOf(el,geometry).visibility!=='hidden')stacks.set(home,{entity:el.dataset.entity,face:styledClone(el)});
    }
    // Resolve removals while the old field is still mounted. Unchanged cards
    // need geometry only, not a fully styled copy of their SVG descendants.
    const prepareDepartures=finalScene=>{
      const remaining=new Set(finalScene?.objects?.map(object=>entityKey(object.ref)));
      for(const [id,el]of departureSources)if(!remaining.has(id))entities.get(id).departureClone=styledClone(el);
      departureSources.clear();
    };
    const owner = Number.isInteger(actor) ? [...(scene?.querySelectorAll('[data-player-index]') || [])].find(el => Number(el.dataset.playerIndex) === actor) : null;
    const hand = actor === viewer ? scene?.querySelector('.hand-track, .hand-cards, .hand-scroll') : owner?.querySelector('.mini-hand');
    const stockControl=scene?.querySelector('[data-motion-stock]')||scene?.querySelector('.stock-button,.solitaire-stock')||query('.scene-header-actions .solitaire-stock');
    const backSelector='[data-motion-stock-back],.shared-card-back,.piece-back';
    const stockFace=stockControl?.matches(backSelector)?stockControl:stockControl?.querySelector(backSelector);
    // Only the stock owns its geometry. A hidden hand may supply fallback artwork.
    const stockSource=cardsLayout?stockControl:stockFace,stockFallback=cardsLayout?stockFace:stockControl;
    const stock=poseOf(stockSource,undefined,geometry)||poseOf(stockFallback,undefined,geometry);
    let frozenStockBack=null,stockPrepared=false;
    const prepareStockBack=()=>{
      if(stockPrepared)return;stockPrepared=true;
      let stockBack=stockFace||scene?.querySelector('.mini-hand .piece-back, .mini-hand .shared-card-back');
      if(!stockBack&&root.TabletopUI?.helpers?.back){const template=doc.createElement('template');template.innerHTML=root.TabletopUI.helpers.back();stockBack=template.content.firstElementChild;}
      frozenStockBack=stockBack?styledClone(stockBack):null;
    };
    // Deferred captures freeze artwork when a committed transfer needs it,
    // before the old DOM is replaced. Board draws can reveal cards directly
    // on the board without emitting a hand-transfer descriptor.
    if(!deferDepartures||cardsLayout&&action?.type==='draw')prepareStockBack();
    const release = playedFrom && ['x','y','width','height'].every(key => Number.isFinite(playedFrom[key])) && playedFrom.width > 0 && playedFrom.height > 0 ? clampRect({ x: playedFrom.x, y: playedFrom.y, width: playedFrom.width, height: playedFrom.height }) : null;
    let placements=null,rotations=null,attachmentTransfers=null;
    const preparePoses=final=>{
      placements=null;rotations=null;attachmentTransfers=null;
      if(!sceneModel||!final||sceneModel.plan||final.plan||
        sceneModel.viewer!==final.viewer||sceneModel.audience!==final.audience)return;
      const inventory=sceneModel.inventoryLayout&&final.inventoryLayout;
      const field=sceneModel.anchoredLayout?.field===final.anchoredLayout?.field?final.anchoredLayout?.field:null;
      if(!inventory&&!field)return;
      const zones=inventory?new Set([...sceneModel.inventoryLayout.zones,...final.inventoryLayout.zones]):null,origins=new Map();
      const fixedSlots=zones?new Set(final.zones.filter(zone=>zones.has(zone.id)&&zone.slots).map(zone=>zone.id)):null;
      const anchorIndex=zones=>new Map(zones.filter(zone=>zone.anchor).map(zone=>[zone.id,entityKey(zone.anchor)]));
      const previousAnchors=field?anchorIndex(sceneModel.zones):null,nextAnchors=field?anchorIndex(final.zones):null;
      let attachedNodes;
      const releasedId=release&&playedEntity?entityKey(playedEntity):null;
      for(const object of sceneModel.objects){
        const id=entityKey(object.ref);
        if(field||entities.has(id))origins.set(id,object);
      }
      // Both descriptors must already be visible to this viewer. A count in a
      // concealed tray cannot provide a source ID, pose or outgoing face.
      for(const object of final.objects){
        const id=entityKey(object.ref),source=origins.get(id);
        if(!source)continue;
        if(field&&source.zone===field&&object.zone===field){
          const from=source.orientation??0,to=object.orientation??0;
          if(from!==to)(rotations??=new Map()).set(id,{from,to});
        }
        const previousAnchor=previousAnchors?.get(source.zone),nextAnchor=nextAnchors?.get(object.zone);
        if((previousAnchor||nextAnchor)&&(previousAnchor!==nextAnchor||source.index!==object.index)){
          // A passenger keeps its carrier's pose until its physical address
          // changes. Read the old DOM only for independently moving cargo.
          const before=entities.get(id);
          let from=before?.pose;
          if(previousAnchor){
            attachedNodes??=firstMotionNodes(scene?.querySelectorAll('[data-entity][data-motion-attached]')||[],'entity');
            const el=attachedNodes.get(id);
            if(el&&publicEntity(el)&&styleOf(el,geometry).visibility!=='hidden')from=poseOf(el,undefined,geometry);
          }
          if(from){
            if(id===releasedId&&playedTarget?.zone===object.zone&&playedTarget.index===object.index)from=release;
            (placements??=new Map()).set(id,from);
            (attachmentTransfers??=new Set()).add(id);
          }
          continue;
        }
        if(!zones||!zones.has(source.zone)&&!zones.has(object.zone))continue;
        // Compact trays can renumber stationary items after one is removed.
        if(source.zone===object.zone&&(source.index===object.index||!fixedSlots.has(object.zone)))continue;
        const from=id===releasedId&&
          playedTarget?.zone===object.zone&&playedTarget.index===object.index?release:entities.get(id).rect;
        (placements??=new Map()).set(id,from);
      }
    };
    const anchors=new Map();if(scene)for(const el of scene.querySelectorAll('[data-motion-anchor]')){const rect=measuredRect(el,geometry);if(rect)anchors.set(el.dataset.motionAnchor,rect);}
    const flips=new Map();if(scene)for(const el of scene.querySelectorAll('[data-motion-effect="flip"]'))if(el.dataset.motionTrigger===action?.type&&(!el.dataset.motionKey||String(action?.[el.dataset.motionKey])===el.dataset.motionValue))flips.set(el.dataset.motionValue,styledClone(el.querySelector('[data-motion-face]')||el));
    // Retain only the already rendered, authorized hand surface for departures.
    const handSurfaces=new Map(),handSources=new Map();
    for(const node of scene?.querySelectorAll('.mini-hand, .hand-track, .hand-cards')||[]){
      if(node.parentElement?.closest('.mini-hand, .hand-track, .hand-cards'))continue;
      const player=node.matches('.mini-hand')?Number(node.closest('[data-player-index]')?.dataset.playerIndex):viewer;
      const rect=measuredRect(node,geometry);if(rect){if(deferDepartures)handSources.set(player,{rect,node});else handSurfaces.set(player,{rect,clone:styledClone(node)});}
    }
    const handRects=new Map();
    const measureMiniatures=recipients=>{
      for(const owner of scene?.querySelectorAll('[data-player-index]')||[]){
        const player=Number(owner.dataset.playerIndex);
        if(recipients&&!recipients.has(player))continue;
        const mini=owner.querySelector('.mini-hand');
        if(mini)handRects.set(player,Array.from(mini.children,card=>measuredRect(card,geometry)));
      }
    };
    if(!deferDepartures)measureMiniatures();
    const prepareTransfers=(draws,{back=false}={})=>{
      if(back||draws.some(cue=>Number.isInteger(cue.count)&&cue.count>0))prepareStockBack();
      for(const player of new Set((draws||[]).filter(cue=>cue.from==='hand').map(cue=>cue.fromPlayer))){
        const source=handSources.get(player);
        if(source){
          handSurfaces.set(player,{rect:source.rect,clone:styledClone(source.node)});
          handSources.delete(player);
        }
      }
      handSources.clear();
      // The pre-commit capture does not know which concealed hands will gain
      // cards. Resolve their anonymous slots now, before the shell update.
      const recipients=new Set();
      for(const {player,count,to} of draws)
        if(player!==viewer&&to!=='table'&&count>0&&!handRects.has(player))recipients.add(player);
      if(recipients.size)measureMiniatures(recipients);
    };
    const hands=handOrigins(scene,viewer,geometry);
    const origin=actor===viewer&&hands.has(viewer)?hands.get(viewer):handOrigin(hand,geometry);
    return { stacks, prepareDepartures, prepareTransfers, preparePoses, get placements(){return placements;}, get rotations(){return rotations;}, get attachmentTransfers(){return attachmentTransfers;}, handSurfaces, packId:scene?.querySelector('[data-appearance-pack]')?.dataset.appearancePack, anchors, flips, handRects, handCounts:new Map([...(scene?.querySelectorAll('[data-player-index][data-hand-count]')||[])].map(el=>[Number(el.dataset.playerIndex),Number(el.dataset.handCount)])), actor, viewer, action: action ? { ...action } : null, playedFrom: release, entities, origin, hands, stock, get stockBack(){return frozenStockBack;}, table: handOrigin(scene?.querySelector('[data-motion-table]'),geometry,66,98) };
  }
  function stripInteraction(el,nodes=null) {
    for (const node of nodes||[el, ...el.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name.startsWith('on')) node.removeAttribute(attr.name);
      node.setAttribute('aria-hidden', 'true'); node.setAttribute('tabindex', '-1');
      if ('disabled' in node) node.disabled = true;
    }
  }
  // Freeze visual/layout properties only; avoid copying the entire CSS catalogue
  // and thousands of inherited design tokens into every node of each flight.
  const cloneStyleKeys=('display position box-sizing width height min-width min-height max-width max-height top right bottom left margin padding border border-radius background color opacity visibility overflow overflow-x overflow-y font font-size font-family font-weight line-height letter-spacing text-align text-transform white-space vertical-align align-items align-content align-self justify-content justify-items gap flex flex-direction flex-wrap flex-shrink flex-grow grid-template-columns grid-template-rows grid-template-areas grid-column grid-row grid-area grid-auto-flow grid-auto-columns grid-auto-rows order flex-basis justify-self row-gap column-gap place-items box-shadow text-shadow transform transform-origin translate rotate scale perspective backface-visibility clip-path filter fill fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset paint-order text-anchor dominant-baseline vector-effect object-fit object-position aspect-ratio z-index').split(' ');
  const cloneMetricKeys=new Set(['width','height','transform-origin','transform']);
  // Inner SVG graphics keep paint, geometry and transforms. CSS box styles
  // still apply to SVG viewports and to HTML nested inside a foreignObject.
  const cloneSvgStyleKeys=cloneStyleKeys.filter(key=>!/^(?:align-|justify-|flex(?:-|$)|grid-|border(?:-|$)|(?:row-|column-)?gap$|margin$|padding$|background$|order$|place-items$)/.test(key));
  const svgNamespace='http://www.w3.org/2000/svg';
  function cloneWithExcludedCargo(element,excluded,sources,copies) {
    const copy=element.cloneNode(false);
    sources.push(element);copies.push(copy);
    for(const child of element.childNodes){
      if(child.nodeType!==1)copy.append(child.cloneNode());
      else if(!excluded.has(child))copy.append(cloneWithExcludedCargo(child,excluded,sources,copies));
    }
    return copy;
  }
  function styledClone(el,independent=null) {
    const excluded=independent&&[...el.querySelectorAll('[data-motion-attached]')].filter(child=>independent.has(child.dataset.entity));
    let clone,sourceNodes,cloneNodes;
    if(excluded?.length){
      // The separate flight owns this cargo. Don't copy its subtree into the carrier.
      sourceNodes=[];cloneNodes=[];
      clone=cloneWithExcludedCargo(el,new Set(excluded),sourceNodes,cloneNodes);
    }else{
      clone=el.cloneNode(true);sourceNodes=[el,...el.querySelectorAll('*')];cloneNodes=[clone,...clone.querySelectorAll('*')];
    }
    // Resolve inherited visibility in the state the animation will display.
    // Explicitly hidden descendants stay hidden; a hidden wrapper must not
    // bake its temporary visibility into every child of a card back.
    const visibility=el.style.getPropertyValue('visibility'),priority=el.style.getPropertyPriority('visibility');
    const originalStyle=root.getComputedStyle(el),metrics={};
    const reveal=originalStyle.visibility==='hidden';
    // Keep the original pose; only inherited visibility changes for the visual.
    if(reveal){for(const key of cloneMetricKeys)metrics[key]=originalStyle.getPropertyValue(key);el.style.setProperty('visibility','visible','important');}
    // Freeze resolved styles so a domino retains its board orientation and
    // inherited CSS variables even when its clone leaves the game container.
    try { for (let i = 0; i < sourceNodes.length; i++) {
      const source=sourceNodes[i],style=i===0&&!reveal?originalStyle:root.getComputedStyle(source);
      const keys=i>0&&source.namespaceURI===svgNamespace&&source.localName!=='svg'?cloneSvgStyleKeys:cloneStyleKeys;
      cloneNodes[i].style.cssText = keys.map(key => {const value=style.getPropertyValue(key);if(i===0&&!reveal&&cloneMetricKeys.has(key))metrics[key]=value;return `${key}:${value};`;}).join('');
      cloneNodes[i].style.setProperty('animation', 'none', 'important');
      cloneNodes[i].style.setProperty('transition', 'none', 'important');
      cloneNodes[i].style.setProperty('pointer-events', 'none', 'important');
    }} finally {if(reveal){if(visibility)el.style.setProperty('visibility',visibility,priority);else el.style.removeProperty('visibility');}}
    stripInteraction(clone,cloneNodes);
    const width = el.offsetWidth || parseFloat(metrics.width), height = el.offsetHeight || parseFloat(metrics.height);
    const origin = metrics['transform-origin'].split(' ').map(Number.parseFloat), ox = origin[0] || 0, oy = origin[1] || 0;
    let minX = 0, minY = 0;
    if (metrics.transform && metrics.transform !== 'none' && root.DOMMatrixReadOnly) {
      const matrix = new root.DOMMatrixReadOnly(metrics.transform);
      const points = [[0,0],[width,0],[0,height],[width,height]].map(([x,y]) => ({ x: matrix.a * (x - ox) + matrix.c * (y - oy) + matrix.e + ox, y: matrix.b * (x - ox) + matrix.d * (y - oy) + matrix.f + oy }));
      minX = Math.min(...points.map(p => p.x)); minY = Math.min(...points.map(p => p.y));
    }
    clone.classList.add('playroom-motion-piece');
    Object.assign(clone.style, { position: 'absolute', left: `${-minX}px`, top: `${-minY}px`, right: 'auto', bottom: 'auto', width: `${width}px`, height: `${height}px`, minWidth: '0', minHeight: '0', margin: '0', opacity: '1', visibility: 'visible' });
    return clone;
  }
  // Stable participant panels animate in place; their DOM/layout stays owned by
  // GameScreen. Only ancestor clipping is leased for this short visual effect.
  async function pulseParticipant(panel,{scale,duration,role,context}={}){
    if(!context?.current()||!panel?.isConnected||!rectOf(panel))return;
    const stage=panel.closest('.app-game-layout'),leases=[];
    for(let node=panel.parentElement;node&&node!==stage;node=node.parentElement){
      const css=root.getComputedStyle(node);if(!/(auto|scroll|hidden|clip)/.test(css.overflowX+' '+css.overflowY))continue;
      // Keep an already scrolled viewport stationary rather than releasing it.
      if(node.scrollLeft||node.scrollTop)return;
      const values={'overflow-x':'visible','overflow-y':'visible'},px=k=>parseFloat(css.getPropertyValue(k))||0;
      const vertical=Math.max(0,node.offsetWidth-node.clientWidth-px('border-left-width')-px('border-right-width'));
      const left=Math.max(0,node.clientLeft-px('border-left-width')),horizontal=Math.max(0,node.offsetHeight-node.clientHeight-px('border-top-width')-px('border-bottom-width'));
      if(vertical){values['padding-left']=px('padding-left')+left+'px';values['padding-right']=px('padding-right')+vertical-left+'px';}
      if(horizontal)values['padding-bottom']=px('padding-bottom')+horizontal+'px';
      leases.push({node,values,saved:Object.fromEntries(Object.keys(values).map(k=>[k,[node.style.getPropertyValue(k),node.style.getPropertyPriority(k)]]))});
    }
    const apply=()=>{for(const {node,values}of leases)for(const [key,value]of Object.entries(values))if(node.style.getPropertyValue(key)!==value||node.style.getPropertyPriority(key)!=='important')node.style.setProperty(key,value,'important');};
    apply();let animation,restored=false;
    const observer=new root.MutationObserver(()=>{if(!panel.isConnected||leases.some(l=>!l.node.contains(panel)))animation?.cancel();else apply();});
    observer.observe(panel.ownerDocument.getElementById('app')||panel.ownerDocument.body,{subtree:true,childList:true,attributes:true,attributeFilter:['style']});
    const resize=()=>animation?.cancel();root.addEventListener('resize',resize);
    const restore=()=>{if(restored)return;restored=true;observer.disconnect();root.removeEventListener('resize',resize);for(const {node,saved}of leases)for(const [key,[value,priority]]of Object.entries(saved)){if(value)node.style.setProperty(key,value,priority);else node.style.removeProperty(key);}};
    const detach=context.cleanup(restore);
    try{if(!context.current())return;animation=context.animation(panel.animate([{scale:1},{scale,offset:.4},{scale:1}],{id:'turn-handoff-'+role,duration,easing:'ease-in-out'}));await animation.finished.catch(()=>{});}finally{detach();restore();}
  }
  const requests=new Set();
  // A request belongs to the whole exchange: lift, show, answer/transfer, return.
  // Its lifetime is independent of the ordinary transfer layer.
  function beginRequest(snapshot,player,card,duration=340,context){
    const empty={ready:Promise.resolve(),finish:()=>Promise.resolve(),cancel(){}};
    if(!card||!root.document)return empty;
    const doc=root.document,own=player===snapshot?.viewer;
    const panel=[...queryAll('.scene [data-player-index]')].find(el=>Number(el.dataset.playerIndex)===player&&rectOf(el));
    const source=own?[...queryAll('.scene .hand-track [data-entity]')].find(el=>el.dataset.entity===instanceKey('card',card.id)):panel?.querySelector('.mini-hand .piece-back, .mini-hand .shared-card-back');
    const start=poseOf(source)||snapshot?.entities?.get(instanceKey('card',card.id))?.pose||snapshot?.hands?.get(player);
    if(!start)return empty;
    const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches||doc.body.classList.contains('reduced-motion');
    const pace=reduced||duration===0?0:Math.max(240,duration),width=own?start.width:Math.min(60,start.width*1.45),height=width*(root.PlayroomGameComponents.pieceTypes['card-deck'].ratio[1]/root.PlayroomGameComponents.pieceTypes['card-deck'].ratio[0]);
    const layer=doc.createElement('div'),mover=doc.createElement('div');
    layer.className='playroom-request-layer';layer.dataset.motionKind='request';layer.setAttribute('aria-hidden','true');
    Object.assign(mover.style,{position:'absolute',width:width+'px',height:height+'px',transformOrigin:'0 0',perspective:'600px'});
    const template=doc.createElement('template');
    const packId=snapshot?.packId||query('.scene [data-appearance-pack]')?.dataset.appearancePack;
    template.innerHTML=root.PlayroomViews?.reveal(packId,{card})||root.PlayroomGameComponents.createHelpers({...root.TabletopUI.helpers,assetArt:(family,params,fallback)=>root.TabletopUI.helpers.assetArt(family,{...params,packId},fallback)},()=> '').card(card,'disabled');
    const face=template.content.firstElementChild,back=!own?(snapshot?.stockBack?.cloneNode(true)||source?.cloneNode(true)):null;
    // Frozen clones keep their intrinsic artboard and frame. Scale the whole
    // back instead of shrinking just the wrapper and cropping its fixed children.
    const sides=[];
    for(const node of [face,...(back?[back]:[])]){
      const side=doc.createElement('div');Object.assign(side.style,{position:'absolute',inset:'0',backfaceVisibility:'hidden'});
      stripInteraction(node);
      const intrinsicWidth=node===back?(parseFloat(node.style.width)||width):width;
      const intrinsicHeight=node===back?(parseFloat(node.style.height)||height):height;
      Object.assign(node.style,{position:'absolute',inset:'auto',left:'0',top:'0',width:intrinsicWidth+'px',height:intrinsicHeight+'px',minWidth:'0',minHeight:'0',margin:'0',visibility:'visible',transformOrigin:'0 0',transform:`scale(${Math.min(width/intrinsicWidth,height/intrinsicHeight)})`});
      side.append(node);mover.append(side);sides.push(side);
    }
    const [frontSide,backSide]=sides;
    layer.append(mover);doc.body.append(layer);
    const original=source?.style.getPropertyValue('visibility'),priority=source?.style.getPropertyPriority('visibility');
    if(source)source.style.setProperty('visibility','hidden','important');
    const small=start.width/width,x=start.x,y=start.y;
    const edge=rectOf(source?.closest('.mini-hand'));
    const lip=edge?edge.y+edge.height:y+start.height/2;
    const lifted=own?y-12:Math.min(y-12,lip-start.height-6);
    const shownY=own?lifted:y,shownX=own?x:Math.max(4,Math.min(x+(start.width-width)/2,root.innerWidth-width-4));
    const pose=(left,top,scale)=>`translate3d(${left}px,${top}px,0) scale(${scale})`;
    const home=pose(x,y,small),up=pose(x,lifted,small),shown=pose(shownX,shownY,1);
    const clip=()=>{layer.style.clipPath=own?'none':`inset(0 0 ${Math.max(0,root.innerHeight-lip)}px 0)`;layer.dataset.requestLayer=own?'front':'hand';};
    const front=()=>{layer.style.clipPath='none';layer.dataset.requestLayer='front';};
    let ended=false,finishing=null,cancelStart=null;const animations=new Set(),prepared=[];
    async function animate(node,frames,ms){
      if(ended)return;
      const last=frames.at(-1);if(!ms){Object.assign(node.style,last);return;}
      const animation=node.animate(frames,{duration:ms,easing:'ease-in-out',fill:'both'});
      animation.pause();animation.currentTime=0;animations.add(animation);prepared.push(animation);
      // Translation and both faces start on one live frame after layout.
      // The request owns pending effects; the plan owns their running clock.
      if(!cancelStart)cancelStart=startAnimationsOnFrame(prepared,context,()=>{
        cancelStart=null;
        prepared.length=0;
      });
      await animation.finished.catch(()=>{});if(!ended)Object.assign(node.style,last);animation.cancel();animations.delete(animation);
    }
    const rotate=(show)=>Promise.all([animate(frontSide,[{transform:show?'rotateY(180deg)':'rotateY(0deg)'},{transform:show?'rotateY(0deg)':'rotateY(180deg)'}],pace),...(backSide?[animate(backSide,[{transform:show?'rotateY(0deg)':'rotateY(-180deg)'},{transform:show?'rotateY(-180deg)':'rotateY(0deg)'}],pace)]:[])]);
    function cleanup(){if(ended)return;ended=true;cancelStart?.();prepared.length=0;for(const a of animations)a.cancel();layer.remove();if(source){if(original)source.style.setProperty('visibility',original,priority);else source.style.removeProperty('visibility');}requests.delete(handle);root.removeEventListener('resize',cleanup);}
    const handle={ready:null,cancel:cleanup,finish(){return finishing??=(async()=>{await handle.ready;if(ended)return;layer.dataset.requestPhase='return';if(!own){await Promise.all([animate(mover,[{transform:shown},{transform:up}],pace),rotate(false)]);if(ended)return;clip();}await animate(mover,[{transform:own?shown:up},{transform:home}],pace);cleanup();})();}};
    requests.add(handle);root.addEventListener('resize',cleanup);
    mover.style.transform=home;frontSide.style.transform=own?'none':'rotateY(180deg)';if(backSide)backSide.style.transform='rotateY(0deg)';clip();
    context?.cleanup(cleanup);
    handle.ready=(async()=>{layer.dataset.requestPhase='lift';await animate(mover,[{transform:home},{transform:up}],pace);if(ended)return;if(!own){front();layer.dataset.requestPhase='show';await Promise.all([animate(mover,[{transform:up},{transform:shown}],pace),rotate(true)]);}if(!ended)layer.dataset.requestPhase='hold';})();
    return handle;
  }
  async function showRequest(snapshot,player,card,duration=900){
    const handle=beginRequest(snapshot,player,card,duration/3);await handle.ready;await handle.finish();
  }
  function incomingHand(snapshot,player){
    if(player===snapshot.viewer)return [...queryAll('.scene .hand-track [data-entity], .scene .hand-cards [data-entity], .scene .hand-scroll [data-entity]')].filter(el=>{
      const before=snapshot.entities?.get(el.dataset.entity);
      return !before?.hand||(before.handOwner!=null&&before.handOwner!==player);
    });
    const panel=[...queryAll('.scene [data-player-index]')].find(el=>Number(el.dataset.playerIndex)===player&&el.querySelector('.mini-hand'));
    const count=Number(panel?.dataset.handCount),before=snapshot.handCounts?.get(player);
    const added=Number.isInteger(before)?Math.max(0,count-before):0;
    // Hidden hands expose only a count and anonymous backs, never private IDs.
    return added?[...panel.querySelector('.mini-hand').children].slice(-added):[];
  }
  const heldHands=new Map(),heldDepartures=new Map(),heldArrivals=new Set();
  function clearArrivalMarks(){
    for(const node of heldArrivals)node.removeAttribute('data-motion-pending');
    heldArrivals.clear();
  }
  function restoreHandLayout(){
    clearArrivalMarks();
    for(const [el,styles]of heldHands)for(const [name,value,priority]of styles){
      if(value)el.style.setProperty(name,value,priority);else el.style.removeProperty(name);
    }
    heldHands.clear();
  }
  function releaseHands(){
    restoreHandLayout();
    for(const layer of heldDepartures.values())layer.remove();
    heldDepartures.clear();
  }
  function measureHandHold(el,before,holds){
    if(!before)return;
    const to=rectOf(el);if(!to)return;
    const dx=before.x-to.x,dy=before.y-to.y;
    if(dx===0&&dy===0)return;
    const style=root.getComputedStyle(el),base=style.translate.split(' ').map((part,index)=>parseFloat(part)*(part.endsWith('%')?(index?el.offsetHeight:el.offsetWidth)/100:1));
    holds.push([el,`${(base[0]||0)+dx}px ${(base[1]||0)+dy}px`]);
  }
  function prepare(snapshot,draws=[]){
    if(!snapshot){releaseHands();return;}
    // A shell patch can move or replace the destinations. Recheck their
    // layout while retaining the frozen outgoing hand for this capture.
    restoreHandLayout();
    const retained=new Set(),sources=new Set(),recipients=new Set();
    for(const cue of draws){
      if(cue.from==='hand'&&Number.isInteger(cue.fromPlayer))sources.add(cue.fromPlayer);
      if(cue.to!=='table')recipients.add(cue.player);
    }
    for(const player of sources){
      const before=snapshot.handSurfaces?.get(player);if(!before)continue;
      const hand=player===snapshot.viewer?query('.scene .hand-track, .scene .hand-cards'):[...queryAll('.scene [data-player-index]')].find(el=>Number(el.dataset.playerIndex)===player)?.querySelector('.mini-hand');
      if(hand){
        heldHands.set(hand,[['visibility',hand.style.getPropertyValue('visibility'),hand.style.getPropertyPriority('visibility')]]);
        hand.style.setProperty('visibility','hidden','important');
      }
      retained.add(before);
      let layer=heldDepartures.get(before);
      if(!layer){
        layer=root.document.createElement('div');layer.className='playroom-motion-layer';layer.dataset.motionHeldHand=String(player);layer.setAttribute('aria-hidden','true');
        const {clone,rect:r}=before;
        Object.assign(clone.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',transform:'none',translate:'none',rotate:'none',scale:'none'});
        layer.append(clone);heldDepartures.set(before,layer);
      }
      if(!layer.isConnected)root.document.body.append(layer);
    }
    for(const [before,layer] of heldDepartures){
      if(retained.has(before))continue;
      layer.remove();heldDepartures.delete(before);
    }
    // Read all destination geometry in the same layout epoch. Writing a
    // reservation before reading the next card makes the browser lay out again.
    const holds=[];
    for(const player of recipients){
      for(const el of incomingHand(snapshot,player))heldArrivals.add(el);
      // Keep the pre-answer hand geometry until play() measures the flight.
      if(player===snapshot.viewer){
        for(const el of queryAll('.scene .hand-track [data-entity], .scene .hand-cards [data-entity], .scene .hand-scroll [data-entity]')){
          const before=snapshot.entities?.get(el.dataset.entity);
          if(before?.hand&&(before.handOwner==null||before.handOwner===player))measureHandHold(el,before.handRect||before.rect,holds);
        }
      }else{
        const panel=[...queryAll('.scene [data-player-index]')].find(el=>Number(el.dataset.playerIndex)===player&&el.querySelector('.mini-hand'));
        const rects=snapshot.handRects?.get(player)||[];
        [...(panel?.querySelector('.mini-hand')?.children||[])].slice(0,rects.length).forEach((el,index)=>measureHandHold(el,rects[index],holds));
      }
    }
    for(const el of heldArrivals)el.setAttribute('data-motion-pending','');
    for(const [el,offset] of holds){
      heldHands.set(el,[['translate',el.style.getPropertyValue('translate'),el.style.getPropertyPriority('translate')]]);
      el.style.setProperty('translate',offset,'important');
    }
  }
  // Hold authorized board geometry until the event that owns its movement.
  // This is a per-surface visual reserve, not a rule-state or markup cache.
  const staged=new Map();
  function releaseBoard(){
    for(const [el,saved] of staged){
      if(saved.value)el.style.setProperty('translate',saved.value,saved.priority);
      else el.style.removeProperty('translate');
    }
    staged.clear();
  }
  function releaseStage(){
    releaseHands();
    releaseBoard();
  }
  function stage(snapshot,{exclude=[]}={}){
    releaseBoard();
    if(!snapshot?.entities)return;
    const excluded=new Set(exclude);
    for(const el of queryAll('.scene [data-entity]')){
      const id=el.dataset.entity,before=snapshot.entities.get(id);
      if(excluded.has(id)||isOffPage(el))continue;
      const from=snapshot.placements?.get(id)||(before?.board&&!before.hand&&publicEntity(el)?before.rect:null);
      if(!from)continue;
      const to=rectOf(el);if(!to)continue;
      const dx=from.x-to.x,dy=from.y-to.y;
      if(Math.hypot(dx,dy)<=2)continue;
      const value=el.style.getPropertyValue('translate'),priority=el.style.getPropertyPriority('translate');
      // Individual translate composes with rotation/scale; use resolved pixel
      // offsets so an existing CSS translation is retained while staging.
      const base=root.getComputedStyle(el).translate.split(' ').map((part,index)=>parseFloat(part)*(part.endsWith('%')?(index?el.offsetHeight:el.offsetWidth)/100:1));
      staged.set(el,{value,priority});
      el.style.setProperty('translate',`${(base[0]||0)+dx}px ${(base[1]||0)+dy}px`,'important');
    }
  }
  function cancel({requests:clearRequests=true,staging=true}={}) {
    if(staging)releaseStage();
    else clearArrivalMarks();
    if(clearRequests)for(const request of [...requests])request.cancel();
    if (running) running.finish();
  }
  function mountViewportLayer(layer){
    root.document.body.append(layer);
    // Stable root scrollbar gutters can offset even a fixed inset:0 layer.
    // All captured poses are viewport coordinates, so use that same origin.
    const box=layer.getBoundingClientRect();
    Object.assign(layer.style,{left:-box.x+'px',top:-box.y+'px',right:'auto',bottom:'auto',width:root.innerWidth+'px',height:root.innerHeight+'px'});
  }
  function holdStackTops(snapshot,scene,layer,destinations,{anchors,poses}={}){
    const held=[];
    for(const [home,previous]of snapshot.stacks||[]){
      if(!destinations.has(home))continue;
      anchors??=firstMotionNodes(scene.querySelectorAll('[data-motion-anchor]'),'motionAnchor');
      const anchor=anchors.get(home);
      const top=anchor?.querySelector('[data-entity]');
      if(!top||top.dataset.entity===previous.entity)continue;
      const box=poses?.get(home)||poseOf(top)||rectOf(anchor);if(!box)continue;
      // Borrow passive artwork until the layer finishes. Independent surfaces
      // may still need their own node if the same capture is already mounted.
      const holder=root.document.createElement('div'),face=previous.face.parentNode?previous.face.cloneNode(true):previous.face;
      holder.className='playroom-motion-stack';holder.dataset.motionAnchor=home;
      Object.assign(holder.style,{position:'absolute',left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',zIndex:'0'});
      Object.assign(face.style,{position:'absolute',left:'0',top:'0',width:box.width+'px',height:box.height+'px',visibility:'visible',transform:'none',translate:'none',rotate:'none',scale:'none',margin:'0'});
      holder.append(face);layer.append(holder);
      held.push(face);
    }
    return held;
  }
  // Public ordered transfers use named scene anchors and canonical face templates.
  function playTransfers(snapshot,scene,steps,duration,context) {
    const later=(fn,ms)=>context?context.schedule(fn,ms):root.setTimeout(fn,ms),clear=token=>context?context.unschedule(token):root.clearTimeout(token);
    const doc=root.document,anchors=scene.querySelectorAll('[data-motion-anchor]');
    const anchorById=firstMotionNodes(anchors,'motionAnchor');
    const templates=firstMotionNodes(scene.querySelectorAll('[data-motion-template]'),'motionTemplate');
    const poses=new Map();
    const sourceLayers=new Map(Array.from(snapshot.entities?.keys()||[],(key,index)=>[key,index+1]));
    const flights=steps.slice(0,104).map(step=>{
      if(!step||!step.entity||typeof step.entity!=='object'||typeof step.from!=='string'||typeof step.to!=='string')return null;
      const key=entityKey(step.entity),face=templates.get(key)?.firstElementChild;
      if(!face)return null;
      // Every card entering the same pile shares its committed destination.
      // These poses belong to the mounted layout before any cards are hidden.
      if(!poses.has(step.to)){
        const anchor=anchorById.get(step.to);
        poses.set(step.to,poseOf(anchor?.querySelector('[data-entity]'))||rectOf(anchor));
      }
      const to=poses.get(step.to);
      const origin=snapshot.entities?.get(key)?.rect||snapshot.anchors?.get(step.from)||rectOf(anchorById.get(step.from));
      return to&&origin?{face,to,toAnchor:step.to,sourceLayer:sourceLayers.get(key)??0,from:{...origin,width:to.width,height:to.height}}:null;
    }).filter(Boolean);
    if(!flights.length)return Promise.resolve();
    return new Promise(resolve=>{
      const layer=doc.createElement('div'),animations=[],timers=[],hidden=[];layer.className='playroom-motion-layer';layer.setAttribute('aria-hidden','true');mountViewportLayer(layer);let ended=false,cancelStart,held;
      const run={finish(){if(ended)return;ended=true;cancelStart?.();timers.forEach(clear);animations.forEach(a=>a.cancel());for(const item of hidden){if(item.value)item.el.style.setProperty('visibility',item.value,item.priority);else item.el.style.removeProperty('visibility');}held?.forEach(face=>face.remove());layer.remove();root.removeEventListener('resize',run.finish);if(running===run)running=null;resolve();}};
      running=run;context?.cleanup(run.finish);root.addEventListener('resize',run.finish);
      const destinations=new Set(steps.map(step=>step.to));
      held=holdStackTops(snapshot,scene,layer,destinations,{anchors:anchorById,poses});
      for(const anchor of anchors){
        if(!destinations.has(anchor.dataset.motionAnchor))continue;
        for(const el of anchor.querySelectorAll('[data-entity]')){
          hidden.push({el,value:el.style.getPropertyValue('visibility'),priority:el.style.getPropertyPriority('visibility')});
          el.style.setProperty('visibility','hidden','important');
        }
      }
      const pace=Math.max(Math.min(duration,160),policy.transferMinMs??80,Math.min(policy.transferMaxMs??240,duration*(policy.transferFactor??.4))),stride=pace+(policy.transferGapMs??30);
      try{flights.forEach(({face,from,to,toAnchor,sourceLayer},index)=>{
        const mover=doc.createElement('div'),clone=styledClone(face);mover.className='playroom-motion-flight';mover.dataset.motionKind='transfer';mover.dataset.motionIndex=String(index);mover.dataset.motionDestination=toAnchor;
        const at=p=>`translate3d(${p.x}px,${p.y}px,0)`;
        const fromTransform=at(from),zIndex=sourceLayers.size+index+1;
        // Delayed cards retain their source stack order until their own flight starts.
        Object.assign(mover.style,{width:to.width+'px',height:to.height+'px',transform:fromTransform,zIndex:String(sourceLayer)});
        Object.assign(clone.style,{position:'absolute',left:'0',top:'0',visibility:'visible',width:to.width+'px',height:to.height+'px',transform:'none',margin:'0'});mover.append(clone);layer.append(mover);
        const animation=mover.animate([{transform:fromTransform,zIndex},{transform:at(to),zIndex}],{duration:pace,delay:index*stride,easing:'ease-out',fill:'forwards'});animations.push(animation);
      });
      for(const animation of animations){animation.pause();animation.currentTime=0;}
      cancelStart=startAnimationsOnFrame(animations,context,()=>{
        timers.push(later(run.finish,(flights.length-1)*stride+pace+(policy.transferGapMs??30)));
      });
      }catch(_){run.finish();}
    });
  }
  // Measure and start flights in the actual layout context, then restore the
  // visible nodes synchronously, before yielding to a frame. No hidden clone of
  // the whole application, private hand, or independently ticking scene exists.
  function withFieldTargets(prepare, start) {
    const field=query('.game-field-content');
    if(!field) return null;
    // SDK ports are populated by their DOM owner, not by the HTML recipe.
    // Measuring an empty replacement would discard all route anchors. Let
    // the feedback pipeline release and animate the mounted scene instead.
    if(field.querySelector('[data-sdk-player-scene]'))return null;
    const recipe=prepare();
    if(!recipe)return null;
    const {html,initialRefs=[],finalRefs=[]}=recipe;
    const nodes=[...field.childNodes], originals=[...field.querySelectorAll('[data-entity]')];
    const before=new Map(originals.map(el=>[el,rectOf(el)])), hidden=[];
    let result;
    try {
      field.innerHTML=html;
      // These adapters mutate their target nodes over time; detached targets
      // cannot represent them. Let the caller use their existing live surface.
      if(field.querySelector('[data-motion-effect],[data-motion-lead],[data-motion-sequence],[data-motion-transfers]'))return null;
      const targets=new Map([...field.querySelectorAll('[data-entity]')].map(el=>[el.dataset.entity,rectOf(el)]));
      for(const el of originals){
        const from=before.get(el),to=targets.get(el.dataset.entity);
        if(from&&((to&&Math.hypot(from.x-to.x,from.y-to.y)>2)||(!to&&initialRefs.includes(el.dataset.entity)))){
          hidden.push([el,el.style.getPropertyValue('visibility'),el.style.getPropertyPriority('visibility')]);
          el.style.setProperty('visibility','hidden','important');
        }
      }
      measuringField={initialRefs:new Set(initialRefs),finalRefs:new Set(finalRefs)};
      result=start();
    } catch(error) {
      restore();throw error;
    } finally {
      measuringField=false;field.replaceChildren(...nodes);
    }
    function restore(){for(const [el,value,priority] of hidden){if(value)el.style.setProperty('visibility',value,priority);else el.style.removeProperty('visibility');}}
    return Promise.resolve(result).finally(restore);
  }
  function play(snapshot, { duration = 500, settle = 160, draws, effects:effectTiming={flip:280,pair:700},context } = {}) {
    cancel({requests:false,staging:!snapshot?.diceOnly});
    const later=(fn,ms)=>context?context.schedule(fn,ms):root.setTimeout(fn,ms),clear=token=>context?context.unschedule(token):root.clearTimeout(token);
    duration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    if (!snapshot || !duration) return Promise.resolve();
    const fieldTargets=measuringField;
    const doc = root.document, scene = query('.scene');
    if (!scene) return Promise.resolve();
    const transferNode=scene.querySelector('[data-motion-transfers]');
    if(!snapshot.transferOnly&&transferNode?.dataset.motionTrigger===snapshot.action?.type){let steps;try{steps=JSON.parse(transferNode.dataset.motionTransfers);}catch(_){}if(Array.isArray(steps)&&steps.length)return playTransfers(snapshot,scene,steps,duration,context);}
    const entities = snapshot.entities instanceof Map ? snapshot.entities : new Map();
    const flights = [], used = new Set();
    const independent=snapshot.attachmentTransfers;
    const current = snapshot.diceOnly?[]:[...scene.querySelectorAll(independent?'[data-entity]':'[data-entity]:not([data-motion-attached])')].filter(el=>
      (!independent||!el.hasAttribute('data-motion-attached')||independent.has(el.dataset.entity))&&
      !isOffPage(el)&&!el.closest('[data-motion-template]')&&root.getComputedStyle(el).visibility!=='hidden');
    let sequence=null;
    try { sequence=snapshot.sequence||JSON.parse(scene.querySelector('[data-motion-sequence]')?.dataset.motionSequence||'null'); } catch (_) {}
    if(snapshot.diceOnly||sequence?.trigger!==snapshot.action?.type)sequence=null;
    const routeKey=sequence&&entityKey(sequence.entity),routeEntity=routeKey&&current.find(el=>el.dataset.entity===routeKey);
    const anchorRect=routeEntity?routeGeometry(scene):null,origin=anchorRect?.(sequence.origin);
    if(origin&&sequence.steps.every(anchorRect)&&(!sequence.jump||anchorRect(sequence.jump))){
      const to=rectOf(routeEntity),from=entities.get(routeKey)?.rect||{x:origin.x+(origin.width-to.width)/2,y:origin.y+(origin.height-to.height)/2,width:to.width,height:to.height};
      flights.push({el:routeEntity,from,to,kind:'route',sequence,duration:duration+sequence.steps.length*duration*(policy.routeStepFactor??.25)+(sequence.jump?settle+duration:0)});used.add(routeEntity);
    }else sequence=null;
    const departureKeys=new Set(sequence?.arrival==='after-departures'?(sequence.departures||[]).map(entityKey):[]);
    const card = snapshot.action?.card,autoCards=!snapshot.transferOnly&&!!scene.querySelector('[data-motion-layout="cards"]');
    if(autoCards){let reveals=0;
      for(const el of current.filter(publicEntity)){
        if(snapshot.placements?.has(el.dataset.entity))continue;
        const before=entities.get(el.dataset.entity),to=poseOf(el);if(!to)continue;
        const anchor=el.closest('[data-motion-anchor]')?.dataset.motionAnchor;
        const drawing=snapshot.action?.type==='draw';
        let from=before?.pose||before?.rect||(drawing&&(el.dataset.motionZone==='waste'||snapshot.action?.type==='draw')?snapshot.stock:null)||snapshot.anchors?.get(anchor);
        if(snapshot.playedFrom&&card!=null&&el.dataset.entity===instanceKey('card',card))from=snapshot.playedFrom;
        if(!from)continue;
        if(before&&Math.hypot(from.x-to.x,from.y-to.y)<1&&Math.abs(from.width-to.width)<1)continue;
        const reveal=!before&&(el.dataset.motionZone==='waste'&&drawing||anchor?.startsWith('tableau-'));
        flights.push({el,from,to,kind:reveal?'reveal':'move',delay:reveal?reveals++*duration*(policy.revealStagger??.15):0,duration:Math.max(Math.min(duration,160),duration*(reveal?(policy.revealFactor??.7):(policy.moveFactor??.55)))});used.add(el);
      }
      // Keep the previously visible waste beneath the newly dealt fan. It is
      // absent from the final DOM, but must slide into the pile rather than blink out.
      if(snapshot.action?.type==='draw'&&current.some(el=>el.dataset.motionZone==='waste'&&!entities.has(el.dataset.entity))){
        const waste=scene.querySelector('[data-motion-anchor="waste"]'),target=rectOf(waste),ids=new Set(current.map(el=>el.dataset.entity));
        const previous=[];
        if(target)for(const [id,before]of entities)if(before.clone&&!ids.has(id)){const to={...(before.pose||before.rect),x:target.x,y:target.y};previous.push({el:null,art:before.clone,from:before.pose||before.rect,to,kind:'shift',duration:duration*(policy.stockShiftFactor??.3)});}
        flights.unshift(...previous);
        const shifts=duration*.3;
        for(const flight of flights)if(flight.kind==='reveal')flight.delay=(flight.delay||0)+shifts;
        if(snapshot.stockBack&&snapshot.stock&&!scene.querySelector('.solitaire-stock .shared-card-back'))flights.unshift({el:null,art:snapshot.stockBack,from:snapshot.stock,to:snapshot.stock,kind:'hold',duration:shifts+duration});
      }
    }

    const publicNow = snapshot.routeOnly||snapshot.transferOnly?[]:current.filter(publicEntity);
    const played = (autoCards||draws?.some(c=>c.to==='table')?[]:publicNow).filter(el => {
      if(snapshot.placements?.has(el.dataset.entity))return false;
      if(el.closest('[data-motion-effect="flip"]')||el.hasAttribute('data-reveal-active')||snapshot.revealedEntities?.includes(el.dataset.entity))return false;
      if (card != null) return [instanceKey('card',card),instanceKey('tile',card)].includes(el.dataset.entity);
      const before = entities.get(el.dataset.entity);
      return /^(card|tile)-/.test(el.dataset.entity) && (!before || !before.public);
    });
    for (const el of played) {
      const before = entities.get(el.dataset.entity), from = card != null && snapshot.playedFrom ? snapshot.playedFrom : before?.hand ? before.pose||before.rect : snapshot.origin, to = poseOf(el);
      if (from && to) { flights.push({ el, from, to, kind: 'play' }); used.add(el); }
    }
    for (const el of current) {
      if ((snapshot.routeOnly&&!departureKeys.has(el.dataset.entity))||snapshot.transferOnly||used.has(el)) continue;
      const placement=snapshot.placements?.get(el.dataset.entity);
      if(placement){
        const attached=independent?.has(el.dataset.entity);
        const to=attached?poseOf(el):rectOf(el);
        if(to&&(attached||Math.hypot(placement.x-to.x,placement.y-to.y)>2||Math.abs(placement.width-to.width)>2||
          Math.abs(placement.height-to.height)>2))flights.push({el,from:placement,to,kind:'placement'});
        continue;
      }
      const before=entities.get(el.dataset.entity);
      if(!before?.board||!before.public||!publicEntity(el))continue;
      const to=rectOf(el);
      if(to&&Math.hypot(before.rect.x-to.x,before.rect.y-to.y)>2)flights.push({el,from:snapshot.playedFrom&&Number(el.dataset.boardCell)===snapshot.action?.to?snapshot.playedFrom:before.rect,to,kind:'move'});
    }
    if(fieldTargets){
      // Only semantic public board refs can create/depart; DOM identity alone
      // must never promote a private hand object into a visible effect.
      for(const el of publicNow){
        const ref=el.dataset.entity;
        if(!fieldTargets.finalRefs.has(ref)||fieldTargets.initialRefs.has(ref)||used.has(el)||flights.some(f=>f.el===el))continue;
        const to=rectOf(el);
        if(to)flights.push({el,from:to,to,kind:'arrival'});
      }
      for(const ref of fieldTargets.initialRefs){
        const before=entities.get(ref);
        if(!fieldTargets.finalRefs.has(ref)&&before?.board&&before.public&&!before.hand&&before.departureClone)
          flights.push({el:null,art:before.departureClone,from:before.rect,to:before.rect,kind:'departure'});
      }
    }
    const defaultDraw=draws===undefined&&snapshot.action?.type==='draw';
    const handCards=defaultDraw||draws?.some(cue=>cue.player===snapshot.viewer&&cue.to!=='table')?incomingHand(snapshot,snapshot.viewer):[];
    const drawCues=defaultDraw?[{player:snapshot.viewer,count:handCards.length,from:'stock'}]:draws||[];
    const drawGeometry=drawCues.length?geometryPass():null;
    let newHands;
    const baseDelay=drawCues.length&&flights.length?Math.max(...flights.map(f=>f.duration||duration)):0;
    let cueDelay=baseDelay,ownIndex=0;
    for (const cue of drawCues) {
      if (!Number.isInteger(cue.player) || !Number.isInteger(cue.count) || cue.count < 1) continue;
      const from = cue.from === 'table' ? snapshot.table : cue.from === 'hand' ? snapshot.hands?.get(cue.fromPlayer) : snapshot.stock;
      if (!from) continue;
      // A single hand-to-hand card needs a readable flight even at fast pace.
      const flightDuration=cue.from==='hand'?Math.max(duration*2,480):duration*(policy.drawFactor??.65);
      const stagger=duration*(policy.drawStagger??.3);
      const recipients=cue.to!=='table'&&cue.player!==snapshot.viewer?incomingHand(snapshot,cue.player):[];
      const ratio=(parseFloat(snapshot.stockBack?.style.width)/parseFloat(snapshot.stockBack?.style.height))||from.width/from.height;
      let anchor;
      for (let i = 0; i < cue.count; i++) {
        const el = cue.to==='table'?(i===cue.count-1?publicNow.findLast(el=>el.closest('[data-motion-table]')):null):cue.player === snapshot.viewer ? handCards[ownIndex++] : recipients[i];
        // Exact arrivals already give the landing pose. Only a concealed or
        // clipped arrival needs a compact anchor, shared by that cue's cards.
        if (!el && anchor===undefined) {
          if(cue.to==='table')anchor=handOrigin(scene.querySelector('[data-motion-table]'),drawGeometry,66,98)||snapshot.table||null;
          else{
            newHands??=handOrigins(scene,snapshot.viewer,drawGeometry);
            anchor=newHands.get(cue.player)||snapshot.hands?.get(cue.player)||null;
          }
        }
        const target=el?poseOf(el,undefined,drawGeometry):anchor;
        if (!target) continue;
        const width=Math.min(target.width,target.height*ratio),height=width/ratio;
        const to={x:target.x+(target.width-width)/2,y:target.y+(target.height-height)/2,width,height,angle:target.angle||0};
        flights.push({ el, from, to, kind: 'draw', player: cue.player, back: true, duration: flightDuration, delay: cueDelay + i * stagger });
      }
      cueDelay+=flightDuration+Math.max(0,cue.count-1)*stagger;
    }
    // A public arrival may wait for named occupants to leave its destination.
    // Destinations come from the final scene, so this also supports exchanges.
    const arriving=flights.find(flight=>flight.kind==='route'&&flight.sequence.arrival==='after-departures');
    const departing=arriving?flights.filter(flight=>departureKeys.has(flight.el?.dataset.entity)):[];
    if(departing.length){
      const approach=arriving.duration,clearance=Math.max(...departing.map(flight=>flight.duration??duration));
      arriving.approachDuration=approach;arriving.clearanceDuration=clearance;
      arriving.duration=approach+clearance+Math.max(60,settle);
      for(const flight of flights)if(flight!==arriving)flight.delay=(flight.delay||0)+(departureKeys.has(flight.el?.dataset.entity)?approach:approach+clearance);
    }
    const dice = (snapshot.routeOnly||snapshot.transferOnly||snapshot.skipDice?[]:[...scene.querySelectorAll('[data-motion-lead]')]).filter(el=>el.dataset.motionLead===snapshot.action?.type&&!isOffPage(el)&&rectOf(el));
    const effects=(snapshot.diceOnly||snapshot.transferOnly?[]:[...scene.querySelectorAll('[data-motion-effect]')]).filter(el=>el.dataset.motionTrigger===snapshot.action?.type&&(!el.dataset.motionKey||String(snapshot.action?.[el.dataset.motionKey])===el.dataset.motionValue)&&!isOffPage(el)&&rectOf(el));
    const closing=snapshot.action?.type==='flip'?[...scene.querySelectorAll('[data-motion-close]')].filter(el=>!isOffPage(el)):[];
    const turns=new Map();
    if(snapshot.rotations&&!snapshot.routeOnly&&!snapshot.transferOnly)for(const el of current){
      const turn=snapshot.rotations.get(el.dataset.entity);
      if(turn&&el.firstElementChild?.hasAttribute('data-motion-pivot'))turns.set(el,turn);
    }
    const needsLayer=flights.length||dice.length||effects.length||closing.length;
    if(!needsLayer&&!turns.size)return Promise.resolve();
    const animateTurn=(pivot,{from,to},duration,delay=0)=>{
      const delta=((to-from+6)%4)-2,end=90*to;
      return pivot.animate([{rotate:(end-90*delta)+'deg'},{rotate:end+'deg'}],{duration,delay,fill:'both',easing:'ease-out'});
    };
    return new Promise(resolve => {
      const animations = [], restore = [], timers = [], resizeUpdates=[], finishUpdates=[], layer = needsLayer?doc.createElement('div'):null;
      let ended = false, timer = null, cancelStart, held;
      const show = entry => { if (!entry || entry.shown) return; entry.shown = true; entry.visibility ? entry.el.style.setProperty('visibility', entry.visibility, entry.priority) : entry.el.style.removeProperty('visibility'); };
      if(layer){
        layer.className='playroom-motion-layer';layer.setAttribute('aria-hidden','true');mountViewportLayer(layer);
        held=holdStackTops(snapshot,scene,layer,new Set(flights.map(flight=>flight.el?.dataset.motionHome).filter(Boolean)));
      }
      const run = { finish() {
        if (ended) return; ended = true; cancelStart?.();clear(timer);timers.forEach(clear);root.removeEventListener('resize',onResize);
        for (const animation of animations) animation.cancel();
        restore.forEach(show);
        finishUpdates.forEach(update=>update());
        held?.forEach(face=>face.remove());
        layer?.remove(); if (running === run) running = null; resolve();
      }};
      const movingTurn=flights.some(f=>turns.has(f.el));
      const onResize=()=>{if(fieldTargets||movingTurn||flights.some(f=>f.kind==='play'||f.kind==='draw'||f.kind==='placement'))run.finish();else resizeUpdates.forEach(update=>update());};
      root.addEventListener('resize',onResize);
      running = run;context?.cleanup(run.finish);
      try {
        for (const { el, art, from, to, kind, back, player, sequence:route, approachDuration, clearanceDuration, delay = 0, duration: flightDuration = duration } of flights) {
          const mover = doc.createElement('div'); mover.className = 'playroom-motion-flight'; mover.dataset.motionKind = kind;
          if(approachDuration)mover.style.zIndex='2';else if(arriving&&departing.length)mover.style.zIndex='1';
          mover.style.width = `${to.width}px`; mover.style.height = `${to.height}px`;
          let clone;
          if (back) {
            clone = snapshot.stockBack?.cloneNode(true) || doc.createElement('div');
            clone.classList.add('piece-back', 'playroom-motion-piece'); clone.setAttribute('aria-hidden', 'true');
            Object.assign(clone.style, { position: 'absolute', left: '0', top: '0', minWidth: '0', minHeight: '0', transform: 'none' });
          } else clone = art?art.cloneNode(true):styledClone(el,independent);
          if(snapshot.routeOnly)clone.style.translate='none';
          clone.dataset.motionKind = kind;
          if (player != null) { mover.dataset.motionPlayer = player; clone.dataset.motionPlayer = player; }
          const angularPlacement=kind==='placement'&&independent?.has(el?.dataset.entity);
          if(kind==='play'||kind==='draw'||angularPlacement){
            const width=parseFloat(clone.style.width)||to.width,height=parseFloat(clone.style.height)||to.height,scale=Math.min(to.width/width,to.height/height);
            Object.assign(clone.style,{left:'0',top:'0',transformOrigin:'0 0',rotate:'none',translate:'none',scale:'none',transform:`scale(${scale})`});
          }
          mover.append(clone); layer.append(mover);
          // Only the visible representation turns. A moving carrier already
          // has a visual clone, so animate its inner pivot on that same flight.
          const turn=turns.get(el);
          if(turn){animations.push(animateTurn(clone.firstElementChild,turn,flightDuration,delay));turns.delete(el);}
          if(kind==='reveal'){
            const backFace=snapshot.stockBack?.cloneNode(true);
            if(backFace){Object.assign(backFace.style,{position:'absolute',left:'0',top:'0',width:to.width+'px',height:to.height+'px',minWidth:'0',minHeight:'0',visibility:'visible',margin:'0',transformOrigin:'50% 50%',backfaceVisibility:'hidden'});mover.append(backFace);animations.push(backFace.animate([{transform:'rotateY(0deg)',offset:0},{transform:'rotateY(90deg)',offset:.5},{transform:'rotateY(90deg)',offset:1}],{duration:flightDuration,delay,fill:'both'}));}
            clone.style.backfaceVisibility='hidden';animations.push(clone.animate([{transform:'rotateY(-90deg)',offset:0},{transform:'rotateY(-90deg)',offset:.5},{transform:'rotateY(0deg)',offset:1}],{duration:flightDuration,delay,fill:'both'}));
          }

          const entry = el ? { el, visibility: el.style.getPropertyValue('visibility'), priority: el.style.getPropertyPriority('visibility') } : null;
          if (entry) { restore.push(entry); el.style.setProperty('visibility', 'hidden', 'important'); }
          const sx = Math.min(from.width / to.width,from.height / to.height), sy = sx, lift = kind === 'move' ? 12 : Math.min(90, Math.hypot(from.x - to.x, from.y - to.y) * .18 + 22);
          const transform = (x,y,xScale,yScale) => `translate3d(${x}px,${y}px,0) scale(${xScale},${yScale})`;
          let frames = [{ transform: transform(from.x,from.y,sx,sy), offset: 0 }, { transform: transform((from.x+to.x)/2,Math.max(0,Math.min(from.y,to.y)-lift),(sx+1)/2,(sy+1)/2), offset: .52 }, { transform: transform(to.x,to.y,1,1), offset: 1 }];
          if(kind==='placement')frames=[frames[0],frames[2]];
          if(kind==='arrival'||kind==='departure')frames=[{transform:transform(to.x,to.y,1,1),opacity:kind==='arrival'?0:1,offset:0},{transform:transform(to.x,to.y,1,1),opacity:kind==='arrival'?1:0,offset:1}];
          if(kind==='hold'||kind==='shift')frames=[{transform:transform(from.x,from.y,1,1)},{transform:transform(to.x,to.y,1,1)}];
          if(kind==='play'||kind==='draw'||angularPlacement){
            const start=from.angle||0,delta=((to.angle||0)-start+540)%360-180;
            const at=(x,y,scale,angle)=>`translate3d(${x}px,${y}px,0) rotate(${angle}deg) scale(${scale}) translate(-50%,-50%)`;
            const x0=from.x+from.width/2,y0=from.y+from.height/2,x1=to.x+to.width/2,y1=to.y+to.height/2;
            frames=[{transform:at(x0,y0,sx,start),offset:0},{transform:at((x0+x1)/2,Math.max(0,Math.min(y0,y1)-lift),(sx+1)/2,start+delta*.52),offset:.52},{transform:at(x1,y1,1,start+delta),offset:1}];
            if(angularPlacement)frames=[frames[0],frames[2]];
          }
          let routeFrames;
          if(route){
            routeFrames=readAnchor=>{
              // Route-only playback holds the real piece at the previous
              // checkpoint with CSS translate. Measure its final authored slot.
              const heldTranslate=snapshot.routeOnly&&approachDuration?el.style.translate:null;
              if(heldTranslate!==null)el.style.translate='none';
              const box=rectOf(el)||to;
              if(heldTranslate!==null)el.style.translate=heldTranslate;
              mover.style.width=`${box.width}px`;mover.style.height=`${box.height}px`;
              // All cells use their live centres, including after a resize.
              const at=point=>{const r=readAnchor(point)||box;return transform(r.x+(r.width-box.width)/2,r.y+(r.height-box.height)/2,1,1);};
              const travelDuration=approachDuration||flightDuration;
              const result=[{transform:at(route.origin),offset:0},...(route.entry==='lift'?[{transform:at(route.origin)+' translateY(-10px) scale(1.1)',offset:duration/travelDuration*.5}]:[]),{transform:at(route.origin),offset:duration/travelDuration}];
              route.steps.forEach((point,index)=>result.push({transform:!snapshot.routeOnly&&!route.jump&&index===route.steps.length-1?transform(box.x,box.y,1,1):at(point),offset:(duration+(index+1)*duration/4)/travelDuration}));
              if(route.jump){result.push({transform:at(route.steps.at(-1)||route.origin),offset:(travelDuration-duration)/travelDuration});result.push({transform:snapshot.routeOnly?at(route.jump):transform(box.x,box.y,1,1),offset:1});}
              if(approachDuration){
                const destination=route.jump||route.steps.at(-1)||route.origin;
                const hover=at(destination)+` translateY(-${Math.max(8,box.height*.7)}px)`;
                for(const frame of result)frame.offset*=approachDuration/flightDuration;
                result.at(-1).transform=hover;
                result.push({transform:hover,offset:(approachDuration+clearanceDuration)/flightDuration},{transform:transform(box.x,box.y,1,1),offset:1});
              }else if(route.arrival==='settle'){for(const frame of result)frame.offset*=.82;result.push({transform:transform(box.x,box.y,1.12,1.12),offset:.92},{transform:transform(box.x,box.y,1,1),offset:1});}return result;
            };
            frames=routeFrames(anchorRect);
            const panel=[...scene.querySelectorAll('[data-player-index]')].find(node=>node.dataset.turnPrimary!=='false'&&Number(node.dataset.playerIndex)===route.player);
            const counter=[...(panel?.querySelectorAll('[data-motion-counter]')||[])].find(node=>node.dataset.motionCounter===route.counter),counterValue=counter?.querySelector('svg text,[data-counter-value]')||counter,finalLabel=counterValue?.textContent;
            const setCounter=value=>{if(!counterValue)return;counterValue.textContent=value;if(counterValue.tagName.toLowerCase()==='text'){const length=String(value).length;counterValue.setAttribute('font-size',String(length===1?52:length===2?39:Math.max(21,Math.floor(78/(length*.58)))));}};
            const status=scene.closest('.table-shell')?.querySelector('.status-event'),finalStatus=status?.textContent,finalTitle=status?.getAttribute('title');
            const highlighted=[...scene.querySelectorAll('.player-panel.is-turn')];highlighted.forEach(node=>{node.classList.remove('is-turn');node.removeAttribute('aria-current');});panel?.classList.add('is-turn');panel?.setAttribute('aria-current','true');
            const label=point=>{if(counter&&point.label)setCounter(point.label);if(status&&point.label){status.textContent=point.label;status.title=point.label;}mover.dataset.motionAnchor=point.anchor;};
            label(route.origin);
            route.steps.forEach((point,index)=>timers.push(later(()=>label(point),duration+(index+1)*duration/4)));
            if(route.jump)timers.push(later(()=>label(route.jump),flightDuration));
            finishUpdates.push(()=>{if(counter)setCounter(finalLabel);if(status){status.textContent=finalStatus;status.setAttribute('title',finalTitle||'');}panel?.classList.remove('is-turn');panel?.removeAttribute('aria-current');highlighted.forEach(node=>{node.classList.add('is-turn');node.setAttribute('aria-current','true');});});
          }
          if (back) { frames[0].opacity = 0; frames[1].opacity = 1; frames[2].opacity = 1; }
          const animation = mover.animate(frames, { duration: flightDuration, delay, easing: route?(policy.easingRoute??'linear'):(policy.easingMove??'cubic-bezier(.25,.55,.25,1)'), fill: 'both' });
          if(routeFrames)resizeUpdates.push(()=>{clone=styledClone(el);clone.dataset.motionKind='route';mover.replaceChildren(clone);animation.effect.setKeyframes(routeFrames(routeGeometry(scene)));});
          animation.finished.then(() => { if(!fieldTargets){show(entry); mover.remove();} }, () => {});
          animations.push(animation);
        }
        for(const [el,turn] of turns)animations.push(animateTurn(el.firstElementChild,turn,duration));
        for (const die of dice) {
          const mover=doc.createElement('div'),box=rectOf(die),clone=styledClone(die);
          mover.className='playroom-motion-flight';mover.dataset.motionKind='roll';mover.append(clone);layer.append(mover);
          const position=()=>{const r=rectOf(die)||box;Object.assign(mover.style,{left:`${r.x}px`,top:`${r.y}px`,width:`${r.width}px`,height:`${r.height}px`,transformOrigin:'center'});};position();resizeUpdates.push(position);
          const entry={el:die,visibility:die.style.getPropertyValue('visibility'),priority:die.style.getPropertyPriority('visibility')};restore.push(entry);die.style.setProperty('visibility','hidden','important');
          const animation=mover.animate(snapshot.reducedMotion?[{opacity:.35},{opacity:1}]:[{transform:'rotate(-25deg) scale(.85)'},{transform:'rotate(135deg) scale(1.08)',offset:.45},{transform:'rotate(0) scale(1)'}],{duration:snapshot.reducedMotion?duration:Math.max(duration,240),easing:'ease-out'});
          animation.finished.then(()=>{show(entry);mover.remove();},()=>{});animations.push(animation);
        }
        const flipTimes=effectTiming;
        let flipEnd=0;
        for(const el of effects.filter(el=>el.dataset.motionEffect!=='flip')){
          const content=el.firstElementChild||el;
          animations.push(content.animate([{transform:'scale(.7)',opacity:.5},{transform:'scale(1.08)',opacity:1},{transform:'scale(1)',opacity:1}],{duration,easing:'ease-out'}));
        }
        const flipTargets=[...new Set([...effects.filter(el=>el.dataset.motionEffect==='flip'),...closing])];
        for(const slot of flipTargets){
          const face=slot.querySelector('[data-motion-face]')||slot,back=slot.querySelector('[data-motion-back]'),box=rectOf(slot);if(!box)continue;
          const opening=effects.includes(slot),close=closing.includes(slot),old=snapshot.flips?.get(slot.dataset.motionValue);
          const mover=doc.createElement('div');mover.className='playroom-motion-flight';mover.dataset.motionKind='flip';
          Object.assign(mover.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',perspective:'600px'});
          const rotor=doc.createElement('div');Object.assign(rotor.style,{position:'absolute',inset:'0',transformStyle:'preserve-3d'});
          const front=opening&&old?old.cloneNode(true):styledClone(face),reverse=styledClone(opening?face:back||face);
          for(const [node,angle]of [[front,0],[reverse,180]]){Object.assign(node.style,{position:'absolute',inset:'0',left:'0',top:'0',width:'100%',height:'100%',transform:`rotateY(${angle}deg)`,backfaceVisibility:'hidden',visibility:'visible'});rotor.append(node);}
          mover.append(rotor);layer.append(mover);
          const entry={el:face,visibility:face.style.getPropertyValue('visibility'),priority:face.style.getPropertyPriority('visibility')};restore.push(entry);face.style.setProperty('visibility','hidden','important');
          const flip=flipTimes.flip,hold=flipTimes.pair+(!opening&&effects.some(el=>el.dataset.motionEffect==='flip')?flip:0),total=(opening?flip:0)+(close?hold+flip:0);flipEnd=Math.max(flipEnd,total);
          if(opening&&close){
            // The two sides are the old back and new face: open, hold, close.
            animations.push(rotor.animate([{transform:'rotateY(0deg)',offset:0},{transform:'rotateY(180deg)',offset:flip/total},{transform:'rotateY(180deg)',offset:(flip+hold)/total},{transform:'rotateY(360deg)',offset:1}],{duration:total,fill:'both',easing:'linear'}));
          }else{
            animations.push(rotor.animate([{transform:'rotateY(0deg)',offset:0},...(close?[{transform:'rotateY(0deg)',offset:hold/total}]:[]),{transform:'rotateY(180deg)',offset:1}],{duration:total||flip,fill:'both',easing:'linear'}));
          }
          // The opaque closing back covers the restored face. Keep the face's
          // original visibility so a retained wrapper survives the next authored patch.
          if(close&&back)finishUpdates.push(()=>{back.style.visibility='visible';back.style.transform='none';});
        }
        // Start after clone preparation, so slow rendering cannot consume
        // the visible part of a fast flight before its first painted frame.
        for(const animation of animations){animation.pause();animation.currentTime=0;}
        cancelStart=startAnimationsOnFrame(animations,context,()=>{
          // The defending flights and the contact cue share the same start
          // offset. The plan context pauses or cancels both together.
          if(arriving?.approachDuration&&snapshot.onRouteContact)
            timers.push(later(snapshot.onRouteContact,arriving.approachDuration));
          timer=later(run.finish,Math.max(duration,...animations.map(animation=>Number(animation.effect.getComputedTiming().endTime)||0))+(policy.completionSlackMs??100));
        });
        Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(run.finish);
      } catch (error) { run.finish(); throw error; }
    });
  }
  return { pulseParticipant, capture, prepare, stage, releaseStage, beginRequest, showRequest, play, withFieldTargets, cancel, poseOf };
  }
  const api = root.PlayroomMotion = {...surface(),surface};
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
