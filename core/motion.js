(function (root) {
  'use strict';
  const entityKey=ref=>root.PlayroomGameComponents.entityKey(ref);
  const instanceKey=(namespace,id)=>entityKey({namespace,id:String(id)});
  const policy=root.PlayroomSizeCatalogue?.presentation?.motion||{};
  function surface(mount=()=>root.document){
  const query=selector=>mount()?.querySelector(selector),queryAll=selector=>mount()?.querySelectorAll(selector)||[];
  let running = null, measuringField = false;
  const handSelector = '.hand-track, .hand-cards, .hand-scroll, .mini-hand';
  const rectOf = el => { const r = el?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null; };
  const isHand = el => !!el.closest(handSelector);
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
  function poseOf(el) {
    const r=rectOf(el);if(!r)return null;
    const style=root.getComputedStyle(el),width=el.offsetWidth||parseFloat(style.width)||r.width,height=el.offsetHeight||parseFloat(style.height)||r.height;
    let angle=0;
    if(root.DOMMatrixReadOnly)for(let node=el;node?.nodeType===1;node=node.parentElement){
      const computed=root.getComputedStyle(node),transform=computed.transform;
      const rotation=/^(-?[\d.]+)(deg|rad|turn|grad)$/.exec(computed.rotate);
      if(rotation)angle+=Number(rotation[1])*({deg:Math.PI/180,rad:1,turn:Math.PI*2,grad:Math.PI/200}[rotation[2]]);
      if(transform&&transform!=='none'){const m=new root.DOMMatrixReadOnly(transform);angle+=Math.atan2(m.b,m.a);}
    }
    const scale=Math.min(r.width/(Math.abs(Math.cos(angle))*width+Math.abs(Math.sin(angle))*height),r.height/(Math.abs(Math.sin(angle))*width+Math.abs(Math.cos(angle))*height));
    return {x:r.x+(r.width-width*scale)/2,y:r.y+(r.height-height*scale)/2,width:width*scale,height:height*scale,angle:angle*180/Math.PI};
  }
  function handOrigin(hand, maxWidth = 38, maxHeight = 54) {
    const r = poseOf(hand);
    if (!r) return null;
    // A compact anchor represents the centre of a hidden hand; no hidden card
    // identity or face is read, stored, or cloned by the motion layer.
    const width = Math.min(maxWidth, r.width), height = Math.min(maxHeight, r.height);
    return {...clampRect({ x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height }),angle:r.angle};
  }
  function handOrigins(scene, viewer) {
    const hands = new Map();
    if (!scene) return hands;
    for (const owner of scene.querySelectorAll('[data-player-index]')) {
      const player = Number(owner.dataset.playerIndex), hand = owner.querySelector('.mini-hand');
      if (Number.isInteger(player) && hand) hands.set(player, handOrigin(hand));
    }
    if (Number.isInteger(viewer)) hands.set(viewer, handOrigin(scene.querySelector('.hand-track, .hand-cards, .hand-scroll')));
    return hands;
  }
  function capture({ actor = null, action = null, viewer = null, playedFrom = null, sceneModel = null, deferDepartures = false } = {}) {
    const doc = root.document, scene = query('.scene'), entities = new Map(), departureSources = new Map();
    const boardZones=new Set((sceneModel?.plan?[]:sceneModel?.zones)?.filter(zone=>zone.kind==='board').map(zone=>zone.id));
    const boardRefs=new Set(sceneModel?.objects?.filter(object=>boardZones.has(object.zone)).map(object=>entityKey(object.ref)));
    if (scene) for (const el of scene.querySelectorAll('[data-entity]')) {
      const rect = rectOf(el);
      if (!rect || root.getComputedStyle(el).visibility === 'hidden') continue;
      const hand = el.closest(handSelector), boundary = rectOf(hand || scene);
      entities.set(el.dataset.entity, { rect: clampRect(rect, boundary),pose:poseOf(el), hand: !!hand, handRect: hand?rect:null, handOwner: hand ? (hand.matches('.mini-hand') ? Number(hand.closest('[data-player-index]')?.dataset.playerIndex) : viewer) : null, public: publicEntity(el), board: boardRefs.has(el.dataset.entity)&&publicEntity(el),...(scene.querySelector('[data-motion-layout=cards]')&&publicEntity(el)&&(action?.type==='replay-back'||['draw','replay'].includes(action?.type)&&el.dataset.motionZone==='waste')?{clone:styledClone(el)}:{}),...(boardRefs.has(el.dataset.entity)&&publicEntity(el)&&!deferDepartures?{departureClone:styledClone(el)}:{}) });
    }
    if(deferDepartures&&scene)for(const el of scene.querySelectorAll('[data-entity]')){
      if(entities.get(el.dataset.entity)?.board)departureSources.set(el.dataset.entity,el);
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
    let stockBack = scene?.querySelector('[data-motion-stock] .shared-card-back, [data-motion-stock] .piece-back, .stock-button .piece-back, .stock-button .shared-card-back')||scene?.querySelector('.mini-hand .piece-back, .mini-hand .shared-card-back');
    let frozenStockBack=null,stockPrepared=false;
    const prepareStockBack=()=>{
      if(stockPrepared)return;stockPrepared=true;
      if(!stockBack&&root.TabletopUI?.helpers?.back){const template=doc.createElement('template');template.innerHTML=root.TabletopUI.helpers.back();stockBack=template.content.firstElementChild;}
      frozenStockBack=stockBack?styledClone(stockBack):null;stockBack=null;
    };
    // Deferred captures prepare only authorized effects while the old DOM exists.
    // Legacy callers and explicit draws keep their eager back capture.
    if(!deferDepartures||action?.type==='draw')prepareStockBack();
    const release = playedFrom && ['x','y','width','height'].every(key => Number.isFinite(playedFrom[key])) && playedFrom.width > 0 && playedFrom.height > 0 ? clampRect({ x: playedFrom.x, y: playedFrom.y, width: playedFrom.width, height: playedFrom.height }) : null;
    const anchors=new Map();if(scene)for(const el of scene.querySelectorAll('[data-motion-anchor]')){const rect=rectOf(el);if(rect)anchors.set(el.dataset.motionAnchor,rect);}
    const flips=new Map();if(scene)for(const el of scene.querySelectorAll('[data-motion-effect="flip"]'))if(el.dataset.motionTrigger===action?.type&&(!el.dataset.motionKey||String(action?.[el.dataset.motionKey])===el.dataset.motionValue))flips.set(el.dataset.motionValue,styledClone(el.querySelector('[data-motion-face]')||el));
    // Retain only the already rendered, authorized hand surface for departures.
    const handSurfaces=new Map(),handSources=new Map();
    for(const node of scene?.querySelectorAll('.mini-hand, .hand-track, .hand-cards')||[]){
      if(node.parentElement?.closest('.mini-hand, .hand-track, .hand-cards'))continue;
      const player=node.matches('.mini-hand')?Number(node.closest('[data-player-index]')?.dataset.playerIndex):viewer;
      const rect=rectOf(node);if(rect){if(deferDepartures)handSources.set(player,{rect,node});else handSurfaces.set(player,{rect,clone:styledClone(node)});}
    }
    const prepareTransfers=(draws,{back=false}={})=>{
      if(back||draws.some(cue=>Number.isInteger(cue.count)&&cue.count>0))prepareStockBack();
      for(const player of new Set((draws||[]).filter(cue=>cue.from==='hand').map(cue=>cue.fromPlayer))){
        const source=handSources.get(player);if(source)handSurfaces.set(player,{rect:source.rect,clone:styledClone(source.node)});
      }
      handSources.clear();
    };
    const stockControl=scene?.querySelector('.stock-button,.solitaire-stock')||query('.scene-header-actions .solitaire-stock');
    return { prepareDepartures, prepareTransfers, handSurfaces, packId:scene?.querySelector('[data-appearance-pack]')?.dataset.appearancePack, anchors, flips, handRects:new Map([...(scene?.querySelectorAll('[data-player-index]')||[])].filter(el=>el.querySelector('.mini-hand')).map(el=>[Number(el.dataset.playerIndex),[...el.querySelector('.mini-hand').children].map(rectOf)])), handCounts:new Map([...(scene?.querySelectorAll('[data-player-index][data-hand-count]')||[])].map(el=>[Number(el.dataset.playerIndex),Number(el.dataset.handCount)])), actor, viewer, action: action ? { ...action } : null, playedFrom: release, entities, origin: handOrigin(hand), hands: handOrigins(scene, viewer), stock: scene?.querySelector('[data-motion-layout="cards"]')?(poseOf(stockControl)||poseOf(stockBack)):(poseOf(stockBack)||poseOf(stockControl)), get stockBack(){return frozenStockBack;}, table: handOrigin(scene?.querySelector('[data-motion-table]'), 66, 98) };
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
  const cloneStyleKeys=('display position box-sizing width height min-width min-height max-width max-height top right bottom left margin padding border border-radius background color opacity visibility overflow overflow-x overflow-y font font-size font-family font-weight line-height letter-spacing text-align text-transform white-space vertical-align align-items align-content align-self justify-content justify-items gap flex flex-direction flex-wrap flex-shrink flex-grow grid-template-columns grid-template-rows place-items box-shadow text-shadow transform transform-origin translate rotate scale perspective backface-visibility clip-path filter fill fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset paint-order text-anchor dominant-baseline vector-effect object-fit object-position aspect-ratio z-index').split(' ');
  const cloneMetricKeys=new Set(['width','height','transform-origin','transform']);
  function styledClone(el) {
    const clone = el.cloneNode(true), sourceNodes = [el, ...el.querySelectorAll('*')], cloneNodes = [clone, ...clone.querySelectorAll('*')];
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
      const style = i===0&&!reveal?originalStyle:root.getComputedStyle(sourceNodes[i]);
      cloneNodes[i].style.cssText = cloneStyleKeys.map(key => {const value=style.getPropertyValue(key);if(i===0&&!reveal&&cloneMetricKeys.has(key))metrics[key]=value;return `${key}:${value};`;}).join('');
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
    let ended=false,finishing=null;const animations=new Set();
    async function animate(node,frames,ms){
      if(ended)return;
      const last=frames.at(-1);if(!ms){Object.assign(node.style,last);return;}
      const animation=node.animate(frames,{duration:ms,easing:'ease-in-out',fill:'both'});context?.animation(animation);animations.add(animation);
      await animation.finished.catch(()=>{});if(!ended)Object.assign(node.style,last);animation.cancel();animations.delete(animation);
    }
    const rotate=(show)=>Promise.all([animate(frontSide,[{transform:show?'rotateY(180deg)':'rotateY(0deg)'},{transform:show?'rotateY(0deg)':'rotateY(180deg)'}],pace),...(backSide?[animate(backSide,[{transform:show?'rotateY(0deg)':'rotateY(-180deg)'},{transform:show?'rotateY(-180deg)':'rotateY(0deg)'}],pace)]:[])]);
    function cleanup(){if(ended)return;ended=true;for(const a of animations)a.cancel();layer.remove();if(source){if(original)source.style.setProperty('visibility',original,priority);else source.style.removeProperty('visibility');}requests.delete(handle);root.removeEventListener('resize',cleanup);}
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
  const heldHands=new Map(),heldDepartures=[];
  function releaseHands(){
    for(const [el,styles]of heldHands)for(const [name,value,priority]of styles){
      if(value)el.style.setProperty(name,value,priority);else el.style.removeProperty(name);
    }
    heldHands.clear();
    for(const node of heldDepartures)node.remove();heldDepartures.length=0;
  }
  function holdHandCard(el,before){
    if(!before)return;
    const to=rectOf(el);if(!to)return;
    const style=root.getComputedStyle(el),base=style.translate.split(' ').map((part,index)=>parseFloat(part)*(part.endsWith('%')?(index?el.offsetHeight:el.offsetWidth)/100:1));
    heldHands.set(el,[['translate',el.style.getPropertyValue('translate'),el.style.getPropertyPriority('translate')]]);
    el.style.setProperty('translate',`${(base[0]||0)+before.x-to.x}px ${(base[1]||0)+before.y-to.y}px`,'important');
  }
  function prepare(snapshot,draws=[]){
    releaseHands();
    if(!snapshot)return;
    for(const player of new Set(draws.filter(cue=>cue.from==='hand'&&Number.isInteger(cue.fromPlayer)).map(cue=>cue.fromPlayer))){
      const before=snapshot.handSurfaces?.get(player);if(!before)continue;
      const hand=player===snapshot.viewer?query('.scene .hand-track, .scene .hand-cards'):[...queryAll('.scene [data-player-index]')].find(el=>Number(el.dataset.playerIndex)===player)?.querySelector('.mini-hand');
      if(hand){
        heldHands.set(hand,[['visibility',hand.style.getPropertyValue('visibility'),hand.style.getPropertyPriority('visibility')]]);
        hand.style.setProperty('visibility','hidden','important');
      }
      const layer=root.document.createElement('div');layer.className='playroom-motion-layer';layer.dataset.motionHeldHand=String(player);layer.setAttribute('aria-hidden','true');
      const clone=before.clone.cloneNode(true),r=before.rect;
      Object.assign(clone.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px',transform:'none',translate:'none',rotate:'none',scale:'none'});
      layer.append(clone);root.document.body.append(layer);heldDepartures.push(layer);
    }
    for(const player of new Set(draws.filter(cue=>cue.to!=='table').map(cue=>cue.player))){
      for(const el of incomingHand(snapshot,player))el.setAttribute('data-motion-pending','');
      // Keep the pre-answer hand geometry until play() measures the flight.
      if(player===snapshot.viewer){
        for(const el of queryAll('.scene .hand-track [data-entity], .scene .hand-cards [data-entity], .scene .hand-scroll [data-entity]')){
          const before=snapshot.entities?.get(el.dataset.entity);
          if(before?.hand&&(before.handOwner==null||before.handOwner===player))holdHandCard(el,before.handRect||before.rect);
        }
      }else{
        const panel=[...queryAll('.scene [data-player-index]')].find(el=>Number(el.dataset.playerIndex)===player&&el.querySelector('.mini-hand'));
        const rects=snapshot.handRects?.get(player)||[];
        [...(panel?.querySelector('.mini-hand')?.children||[])].slice(0,rects.length).forEach((el,index)=>holdHandCard(el,rects[index]));
      }
    }
  }
  // Hold authorized board geometry until the event that owns its movement.
  // This is a per-surface visual reserve, not a rule-state or markup cache.
  const staged=new Map();
  function releaseStage(){
    releaseHands();
    for(const [el,saved] of staged){
      if(saved.value)el.style.setProperty('translate',saved.value,saved.priority);
      else el.style.removeProperty('translate');
    }
    staged.clear();
  }
  function stage(snapshot,{exclude=[]}={}){
    releaseStage();
    if(!snapshot?.entities)return;
    const excluded=new Set(exclude);
    for(const el of queryAll('.scene [data-entity]')){
      const before=snapshot.entities.get(el.dataset.entity);
      if(!before?.board||before.hand||!publicEntity(el)||excluded.has(el.dataset.entity))continue;
      const to=rectOf(el);if(!to)continue;
      const dx=before.rect.x-to.x,dy=before.rect.y-to.y;
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
    if(clearRequests)for(const request of [...requests])request.cancel();
    for(const el of queryAll('[data-motion-pending]'))el.removeAttribute('data-motion-pending');
    if (running) running.finish();
  }
  // Public ordered transfers use named scene anchors and canonical face templates.
  function playTransfers(snapshot,scene,steps,duration,context) {
    const later=(fn,ms)=>context?context.schedule(fn,ms):root.setTimeout(fn,ms),clear=token=>context?context.unschedule(token):root.clearTimeout(token);
    const doc=root.document,templates=[...scene.querySelectorAll('[data-motion-template]')],anchors=[...scene.querySelectorAll('[data-motion-anchor]')];
    const flights=steps.slice(0,104).map(step=>{
      if(!step||!step.entity||typeof step.entity!=='object'||typeof step.from!=='string'||typeof step.to!=='string')return null;
      const face=templates.find(el=>el.dataset.motionTemplate===entityKey(step.entity))?.firstElementChild,to=rectOf(anchors.find(el=>el.dataset.motionAnchor===step.to));
      const origin=snapshot.entities?.get(entityKey(step.entity))?.rect||snapshot.anchors?.get(step.from)||rectOf(anchors.find(el=>el.dataset.motionAnchor===step.from));
      return face&&to&&origin?{face,to,from:{...origin,width:to.width,height:to.height}}:null;
    }).filter(Boolean);
    if(!flights.length)return Promise.resolve();
    return new Promise(resolve=>{
      const layer=doc.createElement('div'),animations=[],timers=[],hidden=[];layer.className='playroom-motion-layer';layer.setAttribute('aria-hidden','true');doc.body.append(layer);let ended=false,startFrame=0;
      const run={finish(){if(ended)return;ended=true;root.cancelAnimationFrame(startFrame);timers.forEach(clear);animations.forEach(a=>a.cancel());for(const item of hidden){if(item.value)item.el.style.setProperty('visibility',item.value,item.priority);else item.el.style.removeProperty('visibility');}layer.remove();root.removeEventListener('resize',run.finish);if(running===run)running=null;resolve();}};
      running=run;context?.cleanup(run.finish);root.addEventListener('resize',run.finish);
      const destinations=new Set(steps.map(step=>step.to));
      for(const anchor of anchors.filter(el=>destinations.has(el.dataset.motionAnchor)))for(const el of anchor.querySelectorAll('[data-entity]')){hidden.push({el,value:el.style.getPropertyValue('visibility'),priority:el.style.getPropertyPriority('visibility')});el.style.setProperty('visibility','hidden','important');}
      const pace=Math.max(Math.min(duration,160),policy.transferMinMs??80,Math.min(policy.transferMaxMs??240,duration*(policy.transferFactor??.4))),stride=pace+(policy.transferGapMs??30);
      try{flights.forEach(({face,from,to},index)=>{
        const mover=doc.createElement('div'),clone=styledClone(face);mover.className='playroom-motion-flight';mover.dataset.motionKind='transfer';mover.dataset.motionIndex=String(index);
        Object.assign(mover.style,{width:to.width+'px',height:to.height+'px',zIndex:String(Math.round(from.y))});
        Object.assign(clone.style,{position:'absolute',left:'0',top:'0',visibility:'visible',width:to.width+'px',height:to.height+'px',transform:'none',margin:'0'});mover.append(clone);layer.append(mover);
        const at=p=>`translate3d(${p.x}px,${p.y}px,0)`;
        const animation=mover.animate([{transform:at(from)},{transform:at(to)}],{duration:pace,delay:index*stride,easing:'ease-out',fill:'both'});animations.push(animation);
        timers.push(later(()=>{mover.style.zIndex=String(2000+index);},index*stride));
      });for(const animation of animations){animation.pause();animation.currentTime=0;context?.animation(animation);}startFrame=root.requestAnimationFrame(startTime=>{if(ended)return;for(const animation of animations){animation.play();animation.startTime=startTime;}timers.push(later(run.finish,(flights.length-1)*stride+pace+(policy.transferGapMs??30)));});}catch(_){run.finish();}
    });
  }
  // Measure and start flights in the actual layout context, then restore the
  // visible nodes synchronously, before yielding to a frame. No hidden clone of
  // the whole application, private hand, or independently ticking scene exists.
  function withFieldTargets(html, start, {initialRefs=[],finalRefs=[]}={}) {
    const field=query('.game-field-content');
    if(!field) return null;
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
    const current = snapshot.diceOnly?[]:[...scene.querySelectorAll('[data-entity]')].filter(el=>!el.closest('[data-motion-template]')&&root.getComputedStyle(el).visibility!=='hidden');
    let sequence=null;
    try { sequence=snapshot.sequence||JSON.parse(scene.querySelector('[data-motion-sequence]')?.dataset.motionSequence||'null'); } catch (_) {}
    if(snapshot.diceOnly||sequence?.trigger!==snapshot.action?.type)sequence=null;
    const anchorRect=point=>{
      const anchor=[...scene.querySelectorAll('[data-motion-anchor]')].find(el=>el.dataset.motionAnchor===point.anchor);
      return rectOf(anchor);
    };
    const routeEntity=sequence&&current.find(el=>el.dataset.entity===entityKey(sequence.entity));
    if(routeEntity&&anchorRect(sequence.origin)&&sequence.steps.every(anchorRect)&&(!sequence.jump||anchorRect(sequence.jump))){
      const to=rectOf(routeEntity),origin=anchorRect(sequence.origin),from=entities.get(entityKey(sequence.entity))?.rect||{x:origin.x+(origin.width-to.width)/2,y:origin.y+(origin.height-to.height)/2,width:to.width,height:to.height};
      flights.push({el:routeEntity,from,to,kind:'route',sequence,duration:duration+sequence.steps.length*duration*(policy.routeStepFactor??.25)+(sequence.jump?settle+duration:0)});used.add(routeEntity);
    }else sequence=null;
    const card = snapshot.action?.card,autoCards=!snapshot.transferOnly&&!!scene.querySelector('[data-motion-layout="cards"]');
    if(autoCards){let reveals=0;
      for(const el of current.filter(publicEntity)){
        const before=entities.get(el.dataset.entity),to=poseOf(el);if(!to)continue;
        const anchor=el.closest('[data-motion-anchor]')?.dataset.motionAnchor;
        const back=snapshot.action?.type==='replay-back',drawing=['draw','replay'].includes(snapshot.action?.type);
        let from=before?.pose||before?.rect||(!back&&drawing&&(el.dataset.motionZone==='waste'||snapshot.action?.type==='draw')?snapshot.stock:null)||(back?snapshot.anchors?.get(el.dataset.motionHome):null)||snapshot.anchors?.get(anchor);
        if(snapshot.playedFrom&&card!=null&&el.dataset.entity===instanceKey('card',card))from=snapshot.playedFrom;
        if(!from)continue;
        if(before&&Math.hypot(from.x-to.x,from.y-to.y)<1&&Math.abs(from.width-to.width)<1)continue;
        const reveal=!before&&!back&&(el.dataset.motionZone==='waste'&&drawing||anchor?.startsWith('tableau-'));
        flights.push({el,from,to,kind:reveal?'reveal':'move',delay:reveal?reveals++*duration*(policy.revealStagger??.15):0,duration:Math.max(Math.min(duration,160),duration*(reveal?(policy.revealFactor??.7):(policy.moveFactor??.55)))});used.add(el);
      }
      // Keep the previously visible waste beneath the newly dealt fan. It is
      // absent from the final DOM, but must slide into the pile rather than blink out.
      if(['draw','replay'].includes(snapshot.action?.type)&&current.some(el=>el.dataset.motionZone==='waste'&&!entities.has(el.dataset.entity))){
        const waste=scene.querySelector('[data-motion-anchor="waste"]'),target=rectOf(waste),ids=new Set(current.map(el=>el.dataset.entity));
        const previous=[];
        if(target)for(const [id,before]of entities)if(before.clone&&!ids.has(id)){const to={...(before.pose||before.rect),x:target.x,y:target.y};previous.push({el:null,art:before.clone,from:before.pose||before.rect,to,kind:'shift',duration:duration*(policy.stockShiftFactor??.3)});}
        flights.unshift(...previous);
        const shifts=duration*.3;
        for(const flight of flights)if(flight.kind==='reveal')flight.delay=(flight.delay||0)+shifts;
        if(snapshot.stockBack&&snapshot.stock&&!scene.querySelector('.solitaire-stock .shared-card-back'))flights.unshift({el:null,art:snapshot.stockBack,from:snapshot.stock,to:snapshot.stock,kind:'hold',duration:shifts+duration});
      }
      if(snapshot.action?.type==='replay-back'&&snapshot.stock){const ids=new Set(current.map(el=>el.dataset.entity));for(const [id,before]of entities){if(!ids.has(id)&&before.clone)flights.push({el:null,art:before.clone,from:before.rect,to:snapshot.stock,kind:'move',duration:duration*.7});}}
    }

    const publicNow = snapshot.routeOnly||snapshot.transferOnly?[]:current.filter(publicEntity);
    const played = (autoCards||draws?.some(c=>c.to==='table')?[]:publicNow).filter(el => {
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
      if (snapshot.routeOnly||snapshot.transferOnly||used.has(el)) continue;
      const before = entities.get(el.dataset.entity), to = rectOf(el);
      if (!to) continue;
      if (before?.public && publicEntity(el) && before.board && Math.hypot(before.rect.x - to.x, before.rect.y - to.y) > 2) flights.push({ el, from: snapshot.playedFrom && Number(el.dataset.boardCell)===snapshot.action?.to ? snapshot.playedFrom : before.rect, to, kind: 'move' });
    }
    if(fieldTargets){
      // Only semantic public board refs can create/depart; DOM identity alone
      // must never promote a private hand object into a visible effect.
      for(const el of publicNow){
        const ref=el.dataset.entity,to=rectOf(el);
        if(to&&fieldTargets.finalRefs.has(ref)&&!fieldTargets.initialRefs.has(ref)&&!used.has(el)&&!flights.some(f=>f.el===el))
          flights.push({el,from:to,to,kind:'arrival'});
      }
      for(const ref of fieldTargets.initialRefs){
        const before=entities.get(ref);
        if(!fieldTargets.finalRefs.has(ref)&&before?.board&&before.public&&!before.hand&&before.departureClone)
          flights.push({el:null,art:before.departureClone,from:before.rect,to:before.rect,kind:'departure'});
      }
    }
    const handCards = incomingHand(snapshot,snapshot.viewer);
    const drawCues = draws === undefined && snapshot.action?.type === 'draw' ? [{ player: snapshot.viewer, count: handCards.length, from: 'stock' }] : draws || [];
    const newHands = handOrigins(scene, snapshot.viewer), baseDelay = flights.length ? Math.max(...flights.map(f=>f.duration||duration)) : 0;
    let cueDelay=baseDelay,ownIndex=0;
    for (const cue of drawCues) {
      if (!Number.isInteger(cue.player) || !Number.isInteger(cue.count) || cue.count < 1) continue;
      const from = cue.from === 'table' ? snapshot.table : cue.from === 'hand' ? snapshot.hands?.get(cue.fromPlayer) : snapshot.stock;
      const anchor = cue.to==='table'?(handOrigin(scene?.querySelector('[data-motion-table]'),66,98)||snapshot.table):newHands.get(cue.player) || snapshot.hands?.get(cue.player);
      if (!from || !anchor) continue;
      // A single hand-to-hand card needs a readable flight even at fast pace.
      const flightDuration=cue.from==='hand'?Math.max(duration*2,480):duration*(policy.drawFactor??.65);
      const stagger=duration*(policy.drawStagger??.3);
      const recipients=incomingHand(snapshot,cue.player);
      for (let i = 0; i < cue.count; i++) {
        const el = cue.to==='table'?(i===cue.count-1?publicNow.filter(el=>el.closest('[data-motion-table]')).at(-1):null):cue.player === snapshot.viewer ? handCards[ownIndex++] : recipients[i];
        const target = el ? poseOf(el) : anchor;
        if (!target) continue;
        const ratio=(parseFloat(snapshot.stockBack?.style.width)/parseFloat(snapshot.stockBack?.style.height))||from.width/from.height;
        const width=Math.min(target.width,target.height*ratio),height=width/ratio;
        const to={x:target.x+(target.width-width)/2,y:target.y+(target.height-height)/2,width,height,angle:target.angle||0};
        flights.push({ el, from, to, kind: 'draw', player: cue.player, back: true, duration: flightDuration, delay: cueDelay + i * stagger });
      }
      cueDelay+=flightDuration+Math.max(0,cue.count-1)*stagger;
    }
    const dice = (snapshot.routeOnly||snapshot.transferOnly||snapshot.skipDice?[]:[...scene.querySelectorAll('[data-motion-lead]')]).filter(el=>el.dataset.motionLead===snapshot.action?.type&&rectOf(el));
    const effects=(snapshot.diceOnly||snapshot.transferOnly?[]:[...scene.querySelectorAll('[data-motion-effect]')]).filter(el=>el.dataset.motionTrigger===snapshot.action?.type&&(!el.dataset.motionKey||String(snapshot.action?.[el.dataset.motionKey])===el.dataset.motionValue)&&rectOf(el));
    const closing=snapshot.action?.type==='flip'?[...scene.querySelectorAll('[data-motion-close]')]:[];
    if (!flights.length && !dice.length && !effects.length && !closing.length) return Promise.resolve();
    return new Promise(resolve => {
      const animations = [], restore = [], timers = [], resizeUpdates=[], finishUpdates=[], layer = doc.createElement('div');
      let ended = false, timer = null, startFrame = 0;
      const show = entry => { if (!entry || entry.shown) return; entry.shown = true; entry.visibility ? entry.el.style.setProperty('visibility', entry.visibility, entry.priority) : entry.el.style.removeProperty('visibility'); };
      if (layer) { layer.className = 'playroom-motion-layer'; layer.setAttribute('aria-hidden', 'true'); doc.body.append(layer); }
      const run = { finish() {
        if (ended) return; ended = true; root.cancelAnimationFrame(startFrame);clear(timer);timers.forEach(clear);root.removeEventListener('resize',onResize);
        for (const animation of animations) animation.cancel();
        restore.forEach(show);
        finishUpdates.forEach(update=>update());
        layer?.remove(); if (running === run) running = null; resolve();
      }};
      const onResize=()=>{if(fieldTargets||flights.some(f=>f.kind==='play'||f.kind==='draw'))run.finish();else resizeUpdates.forEach(update=>update());};
      root.addEventListener('resize',onResize);
      running = run;context?.cleanup(run.finish);
      try {
        for (const { el, art, from, to, kind, back, player, sequence:route, delay = 0, duration: flightDuration = duration } of flights) {
          const mover = doc.createElement('div'); mover.className = 'playroom-motion-flight'; mover.dataset.motionKind = kind;
          mover.style.width = `${to.width}px`; mover.style.height = `${to.height}px`;
          let clone;
          if (back) {
            clone = snapshot.stockBack?.cloneNode(true) || doc.createElement('div');
            clone.classList.add('piece-back', 'playroom-motion-piece'); clone.setAttribute('aria-hidden', 'true');
            Object.assign(clone.style, { position: 'absolute', left: '0', top: '0', minWidth: '0', minHeight: '0', transform: 'none' });
          } else clone = art?art.cloneNode(true):styledClone(el);
          if(snapshot.routeOnly)clone.style.translate='none';
          clone.dataset.motionKind = kind;
          if (player != null) { mover.dataset.motionPlayer = player; clone.dataset.motionPlayer = player; }
          if(kind==='play'||kind==='draw'){
            const width=parseFloat(clone.style.width)||to.width,height=parseFloat(clone.style.height)||to.height,scale=Math.min(to.width/width,to.height/height);
            Object.assign(clone.style,{left:'0',top:'0',transformOrigin:'0 0',rotate:'none',translate:'none',scale:'none',transform:`scale(${scale})`});
          }
          mover.append(clone); layer.append(mover);
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
          if(kind==='arrival'||kind==='departure')frames=[{transform:transform(to.x,to.y,1,1),opacity:kind==='arrival'?0:1,offset:0},{transform:transform(to.x,to.y,1,1),opacity:kind==='arrival'?1:0,offset:1}];
          if(kind==='hold'||kind==='shift')frames=[{transform:transform(from.x,from.y,1,1)},{transform:transform(to.x,to.y,1,1)}];
          if(kind==='play'||kind==='draw'){
            const start=from.angle||0,delta=((to.angle||0)-start+540)%360-180;
            const at=(x,y,scale,angle)=>`translate3d(${x}px,${y}px,0) rotate(${angle}deg) scale(${scale}) translate(-50%,-50%)`;
            const x0=from.x+from.width/2,y0=from.y+from.height/2,x1=to.x+to.width/2,y1=to.y+to.height/2;
            frames=[{transform:at(x0,y0,sx,start),offset:0},{transform:at((x0+x1)/2,Math.max(0,Math.min(y0,y1)-lift),(sx+1)/2,start+delta*.52),offset:.52},{transform:at(x1,y1,1,start+delta),offset:1}];
          }
          let routeFrames;
          if(route){
            routeFrames=()=>{
              const box=rectOf(el)||to;
              mover.style.width=`${box.width}px`;mover.style.height=`${box.height}px`;
              // All cells use their live centres, including after a resize.
              const at=point=>{const r=anchorRect(point)||box;return transform(r.x+(r.width-box.width)/2,r.y+(r.height-box.height)/2,1,1);};
              const result=[{transform:at(route.origin),offset:0},...(route.entry==='lift'?[{transform:at(route.origin)+' translateY(-10px) scale(1.1)',offset:duration/flightDuration*.5}]:[]),{transform:at(route.origin),offset:duration/flightDuration}];
              route.steps.forEach((point,index)=>result.push({transform:!snapshot.routeOnly&&!route.jump&&index===route.steps.length-1?transform(box.x,box.y,1,1):at(point),offset:(duration+(index+1)*duration/4)/flightDuration}));
              if(route.jump){result.push({transform:at(route.steps.at(-1)||route.origin),offset:(flightDuration-duration)/flightDuration});result.push({transform:snapshot.routeOnly?at(route.jump):transform(box.x,box.y,1,1),offset:1});}
              if(route.arrival==='settle'){for(const frame of result)frame.offset*=.82;result.push({transform:transform(box.x,box.y,1.12,1.12),offset:.92},{transform:transform(box.x,box.y,1,1),offset:1});}return result;
            };
            frames=routeFrames();
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
          if(routeFrames)resizeUpdates.push(()=>{clone=styledClone(el);clone.dataset.motionKind='route';mover.replaceChildren(clone);animation.effect.setKeyframes(routeFrames());});
          animation.finished.then(() => { if(!fieldTargets){show(entry); mover.remove();} }, () => {});
          animations.push(animation);
        }
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
          if(close&&back)finishUpdates.push(()=>{face.style.setProperty('visibility','hidden');back.style.visibility='visible';back.style.transform='none';});
        }
        // Start after clone preparation, so slow rendering cannot consume
        // the visible part of a fast flight before its first painted frame.
        for(const animation of animations){animation.pause();animation.currentTime=0;context?.animation(animation);}
        startFrame=root.requestAnimationFrame(startTime=>{
          if(ended)return;
          for(const animation of animations){animation.play();animation.startTime=startTime;}
          timer=later(run.finish,Math.max(duration,...animations.map(animation=>Number(animation.effect.getComputedTiming().endTime)||0))+(policy.completionSlackMs??100));
        });
        Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(run.finish);
      } catch (error) { run.finish(); throw error; }
    });
  }
  return { capture, prepare, stage, releaseStage, beginRequest, showRequest, play, withFieldTargets, cancel, poseOf };
  }
  const api = root.PlayroomMotion = {...surface(),surface};
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
