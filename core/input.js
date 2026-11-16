(function (root, factory) {
  const Input = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Input;
  root.TabletopInput = root.PlayroomInput = Input;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  // Browser input only. The host owns selection, legal target rendering and
  // authoritative actions; this module never infers a move or accesses rules.
  const policy=root.PlayroomSizeCatalogue?.presentation?.interaction||{};
  const requiredFeedback=new WeakMap();
  function attach({ canStart = () => true, canSelect = canStart, canCommit = canStart, getSelected = () => null, select, commit, scope = root.document?.documentElement, handSelector = '.hand-track, .hand-cards, .hand-scroll, [data-hand-scroll]' } = {}) {
    if (typeof select !== 'function' || typeof commit !== 'function') throw Error('TabletopInput requires select and commit callbacks');
    if (!root.document?.documentElement) throw Error('TabletopInput.attach requires a browser document');
    const doc = root.document, capture = doc.documentElement;
    if(!scope?.contains)throw Error('TabletopInput scope must be an element');
    const within=target=>!!target&&scope.contains(target);
    let active = null, suppress = null, pendingCommit = 0, disposed = false, preview = null, blankTap = null, doubleAt = -Infinity;
    const handlers = [];
    const listen = (node, type, handler, options) => { node.addEventListener(type, handler, options); handlers.push(() => node.removeEventListener(type, handler, options)); };
    const sourceAt = target => target instanceof root.Element ? target.closest('[data-drag-piece],[data-swipe-action],[data-swipe-select]') : null;
    const usable = el => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]');
    const readAction = value => {
      if (typeof value !== 'string') return null;
      try { const action = JSON.parse(value); return action && typeof action === 'object' && !Array.isArray(action) && typeof action.type === 'string' ? action : null; } catch (_) { return null; }
    };
    function handleClick(event) {
      if (disposed || event.defaultPrevented || !within(event.target)) return false;
      const feedback=event.target?.closest?.('[data-feedback-required]');
      if(feedback&&!feedback.closest('[inert]')){
        const scope=feedback.closest('.table-shell')||feedback.closest('.game-scene');
        if(scope){for(const target of scope.querySelectorAll(feedback.dataset.feedbackRequired)){
          const old=requiredFeedback.get(target);if(old)root.clearTimeout(old);
          target.classList.remove('piece-required');void target.offsetWidth;target.classList.add('piece-required');
          requiredFeedback.set(target,root.setTimeout(()=>{target.classList.remove('piece-required');requiredFeedback.delete(target);},policy.requiredHighlightMs??900));
        }event.preventDefault();return true;}
      }
      const source = event.target?.closest?.('[data-action],[data-select],[data-cell],[data-drop-select]');
      if (!usable(source)) return false;
      if (source.hasAttribute('data-action')) {
        const action = readAction(source.dataset.action);
        if (action && canCommit(source)) commit(action, {source,allowLayoutChange:source.dataset.allowLayoutChange==='true'});
        return true;
      }
      if (canSelect(source)) {
        const value = source.dataset.dropSelect ?? source.dataset.select ?? source.dataset.cell;
        const current = getSelected(), same = current != null && String(current) === value;
        select(source.hasAttribute('data-drop-select') || !same ? value : null);
      }
      return true;
    }
    function doubleSource(target) {
      if(!within(target)||target?.closest?.('button,a,input,select,textarea,[data-select],[data-drag-stack-member],[data-view-key]'))return null;
      const source=target?.closest?.('[data-double-action]');return usable(source)?source:null;
    }
    function commitDouble(source,event) {
      const now=performance.now(),action=readAction(source?.dataset.doubleAction);
      if(!action||now-doubleAt<(policy.doubleActionCooldownMs??450)||!canCommit(source))return;
      doubleAt=now;blankTap=null;event.preventDefault();commit(action,{source});
    }
    function doubleTap(event) {
      if(event.pointerType==='mouse'||active)return;
      const source=doubleSource(event.target),now=performance.now();
      if(source&&blankTap?.source===source&&now-blankTap.at<=(policy.doubleTapMs??350)&&Math.hypot(event.clientX-blankTap.x,event.clientY-blankTap.y)<(policy.doubleTapDistancePx??24)){commitDouble(source,event);return;}
      blankTap=source?{source,at:now,x:event.clientX,y:event.clientY}:null;
    }
    function clearPreview() { preview?.classList.remove('is-hand-preview'); preview = null; }
    function previewDown(event) {
      clearPreview();
      if (!within(event.target) || event.isPrimary === false || event.pointerType !== 'mouse' || event.button !== 0) return;
      const card = event.target.closest?.('[data-hand-preview]');
      if (usable(card) && canSelect(card)) { preview = card; card.classList.add('is-hand-preview'); }
    }

    function ghostBox(s) {
      const left=Math.max(0,Math.min(root.innerWidth-s.width,s.x-s.offsetX));
      const top=Math.max(0,Math.min(root.innerHeight-s.height,s.y-s.offsetY));
      // A run is carried by its leading card, not by every card in its tail.
      return {left,top,right:left+s.width,bottom:top+(s.contactHeight||s.height),width:s.width,height:s.contactHeight||s.height};
    }
    function visibleDropRect(el) {
      const rect=el.getBoundingClientRect(),css=root.getComputedStyle(el);
      if(!rect.width||!rect.height||css.visibility!=='visible'||Number(css.opacity)===0)return null;
      let left=Math.max(0,rect.left),top=Math.max(0,rect.top),right=Math.min(root.innerWidth,rect.right),bottom=Math.min(root.innerHeight,rect.bottom);
      for(let parent=el.parentElement;parent&&parent!==doc.documentElement;parent=parent.parentElement){
        const style=root.getComputedStyle(parent);
        if(style.display==='none'||style.visibility!=='visible'||Number(style.opacity)===0)return null;
        if(/hidden|clip|auto|scroll/.test(style.overflowX+' '+style.overflowY)){
          const box=parent.getBoundingClientRect();
          if(/hidden|clip|auto|scroll/.test(style.overflowX)){left=Math.max(left,box.left);right=Math.min(right,box.right);}
          if(/hidden|clip|auto|scroll/.test(style.overflowY)){top=Math.max(top,box.top);bottom=Math.min(bottom,box.bottom);}
        }
      }
      return right>left&&bottom>top?{left,top,right,bottom,width:right-left,height:bottom-top}:null;
    }
    function hoverAt(s, x, y) {
      if(x<0||y<0||x>=root.innerWidth||y>=root.innerHeight){s.hover?.classList.remove('playroom-drop-hover');s.hover=null;return null;}
      let pointed=doc.elementFromPoint(x,y);if(!within(pointed)){s.hover?.classList.remove('playroom-drop-hover');s.hover=null;return null;}
      if(s.segment){
        const cell=pointed?.closest('[data-grid-index]'),board=cell?.closest('[data-drag-boundary]');
        if(board){const columns=Number(board.dataset.gridColumns);if(!Number.isInteger(columns)||columns<1)return null;const index=Number(cell.dataset.gridIndex)-s.segment*(s.vertical?columns:1);
          const origin=board.querySelector('[data-grid-index="'+index+'"]');
          pointed=origin?.matches('[data-drop-piece]')?origin:origin?.querySelector('[data-drop-piece]')||origin||pointed;
        }
      }
      const legal=el=>usable(el)&&el.dataset.dropPiece===s.piece&&(el.hasAttribute('data-action')?!!readAction(el.dataset.action)&&canCommit(el):el.dataset.dropSelect===s.piece&&canSelect(el));
      const direct=pointed?.closest('[data-drop-piece]');
      let next=legal(direct)?direct:null;
      // Packs opt into a table zone; only already-rendered legal targets compete.
      const zone=pointed?.closest('[data-drop-zone]');
      if(!next&&!direct&&zone&&!pointed?.closest('.modal-backdrop')){
        let best=Infinity;
        for(const target of zone.querySelectorAll('[data-drop-piece]')){
          if(!legal(target))continue;
          const rect=visibleDropRect(target);if(!rect)continue;
          const distance=Math.hypot(x-(rect.left+rect.right)/2,y-(rect.top+rect.bottom)/2);
          if(distance<best){next=target;best=distance;}
        }
      }
      // Explicit wrong/blocked targets and composite grid origins retain their
      // precise semantics; proximity must not redirect them to a different move.
      if(!next&&!direct&&!s.gridShape&&!pointed?.closest('[data-grid-index]')&&!pointed?.closest('.modal-backdrop')){
        const ghost=ghostBox(s),radius=Math.max(0,Math.min(policy.dragMagnetPx??8,Math.min(ghost.width,ghost.height)/4));
        let best=Infinity;
        for(const target of scope.querySelectorAll('[data-drop-piece]')){
          if(!legal(target)||target.closest('.playroom-drag-ghost'))continue;
          const rect=visibleDropRect(target);if(!rect)continue;
          const dx=Math.max(rect.left-ghost.right,ghost.left-rect.right,0),dy=Math.max(rect.top-ghost.bottom,ghost.top-rect.bottom,0);
          if(Math.hypot(dx,dy)>radius)continue;
          // Weighted nearest centres divide overlapping bubbles deterministically.
          const score=Math.hypot(((rect.left+rect.right)-(ghost.left+ghost.right))/(rect.width+ghost.width+radius*2),((rect.top+rect.bottom)-(ghost.top+ghost.bottom))/(rect.height+ghost.height+radius*2));
          if(score>=best)continue;
          const visible=[[.5,.5],[.1,.1],[.9,.1],[.1,.9],[.9,.9]].some(([fx,fy])=>{
            const hit=doc.elementFromPoint(rect.left+rect.width*fx,rect.top+rect.height*fy);
            return hit===target||target.contains(hit);
          });
          if(visible){next=target;best=score;}
        }
      }
      if(s.hover!==next){s.hover?.classList.remove('playroom-drop-hover');next?.classList.add('playroom-drop-hover');s.hover=next;}
      return next;
    }
    function paint(s) {
      if (!s.ghost) return;
      // A fixed ghost remains entirely inside the viewport, so dragging at an
      // edge cannot enlarge the document's horizontal or vertical scroll area.
      const target=hoverAt(s, s.x, s.y);
      const snap=target?.hasAttribute('data-drop-snap')?visibleDropRect(target):null;
      const left = Math.max(0, Math.min(root.innerWidth - s.width, snap?(snap.left+snap.right-s.width)/2:s.x-s.offsetX));
      const top = Math.max(0, Math.min(root.innerHeight - s.height, snap?(snap.top+snap.bottom-s.height)/2:s.y-s.offsetY));
      s.ghost.style.transform = `translate3d(${left-s.originX}px, ${top-s.originY}px, 0)`;
      if(s.ghost.classList.contains('playroom-composite-ghost'))s.ghost.classList.toggle('playroom-drag-invalid',!target);
    }
    function takeCapture(s) {
      try { capture.setPointerCapture(s.id); } catch (_) { /* Document listeners still observe an uncaptured pointer. */ }
    }
    function restoreScroll(s) {
      if (s.scrollStyle && s.track?.isConnected) {
        s.track.style.scrollSnapType = s.scrollStyle.snap;
        s.track.style.scrollBehavior = s.scrollStyle.behavior;
      }
    }
    function cleanup() {
      const s = active;
      active = null;
      if (!s) return;
      clearTimeout(s.timer);
      if (s.touchMove) s.source.removeEventListener('touchmove', s.touchMove, true);
      if (s.contextMenu) s.source.removeEventListener('contextmenu', s.contextMenu, true);
      s.hover?.classList.remove('playroom-drop-hover');
      s.source.classList.remove('playroom-drag-source');
      s.renderedSource?.classList.remove('playroom-drag-source');
      for(const node of s.stackSources||[])node.classList.remove('playroom-drag-source');
      s.ghost?.remove();
      capture.classList.remove('playroom-dragging');
      restoreScroll(s);
      // Clear state before release: lostpointercapture may fire synchronously.
      try { if (capture.hasPointerCapture(s.id)) capture.releasePointerCapture(s.id); } catch (_) { /* Pointer already ended. */ }
    }
    function cancel() {
      const cancelled=active?.phase==='dragging'&&String(getSelected())===String(active.piece);
      clearPreview();
      if (active?.phase !== 'pending' && active) suppress = { id: active.id, x: active.x, y: active.y, awaitingRelease:true, until: Infinity };
      cleanup();
      if (pendingCommit) { root.cancelAnimationFrame(pendingCommit); pendingCommit = 0; }
      if(cancelled&&!disposed)select(null);
    }
    function beginDrag(s) {
      if (active !== s || disposed || s.phase !== 'pending') return;
      clearTimeout(s.timer);
      if (!s.drag || !s.source.isConnected || !canStart(s.source) || !canSelect(s.source)) { cleanup(); return; }
      // Clone before select(): selecting may synchronously replace the scene.
      const rect = s.source.getBoundingClientRect(), style = root.getComputedStyle(s.source),pose=root.PlayroomMotion?.poseOf(s.source)||rect;
      const shape=/^([1-8]):([hv])$/.exec(s.source.dataset.dragShape||'');
      const unit=shape?s.source.closest('.scene')?.querySelector('[data-drag-unit]')?.getBoundingClientRect():null;
      s.gridShape=!!shape;s.vertical=shape?.[2]==='v';s.segment=Number(s.source.dataset.dragSegment)||0;
      s.width=shape&&unit?unit.width*(s.vertical?1:Number(shape[1])):pose.width;
      s.height=shape&&unit?unit.height*(s.vertical?Number(shape[1]):1):pose.height;
      s.contactHeight=s.height;
      s.offsetX=Math.max(0,Math.min(s.width,s.startX-(pose.x??rect.left)+(s.vertical?0:s.segment*(unit?.width||0))));
      s.offsetY=Math.max(0,Math.min(s.height,s.startY-(pose.y??rect.top)+(s.vertical?s.segment*(unit?.height||0):0)));
      s.boundary=s.source.closest('[data-drag-boundary]')?.getBoundingClientRect();
      const member=s.source.closest('[data-drag-stack-member]'),stack=member?.closest('[data-drag-stack]');
      s.stackIndex=member?Number(member.dataset.dragStackMember):null;
      const members=stack&&Number.isInteger(s.stackIndex)?[...stack.querySelectorAll('[data-drag-stack-member]')].filter(node=>Number(node.dataset.dragStackMember)>=s.stackIndex):[];
      if(members.length>1){
        s.ghost=doc.createElement('div');s.ghost.className='playroom-drag-stack';
        let bottom=rect.bottom;
        for(const node of members){const face=node.firstElementChild,r=face?.getBoundingClientRect();if(!r)continue;
          const clone=face.cloneNode(true),css=root.getComputedStyle(face);
          Object.assign(clone.style,{position:'absolute',left:(r.left-rect.left)+'px',top:(r.top-rect.top)+'px',width:r.width+'px',height:r.height+'px',minWidth:'0',minHeight:'0',margin:'0',padding:css.padding,border:css.border,borderRadius:css.borderRadius,boxShadow:css.boxShadow,color:css.color,background:css.background,transform:'none'});
          s.ghost.append(clone);bottom=Math.max(bottom,r.bottom);
        }
        s.height=bottom-rect.top;
      }else s.ghost=shape&&unit?doc.createElement('div'):s.source.cloneNode(true);
      if(shape&&unit){s.ghost.className='playroom-composite-ghost';s.ghost.style.gridTemplateColumns=`repeat(${s.vertical?1:Number(shape[1])},1fr)`;s.ghost.style.gridTemplateRows=`repeat(${s.vertical?Number(shape[1]):1},1fr)`;for(let i=0;i<Number(shape[1]);i++)s.ghost.append(doc.createElement('span'));}
      for (const el of [s.ghost, ...s.ghost.querySelectorAll('*')]) {
        el.removeAttribute('id'); el.removeAttribute('data-drag-piece'); el.removeAttribute('data-select'); el.removeAttribute('data-action'); el.removeAttribute('data-entity'); el.removeAttribute('data-swipe-action'); el.removeAttribute('data-swipe-select'); el.removeAttribute('data-hand-preview');
      }
      s.ghost.classList.remove('is-selected', 'is-playable', 'is-hand-preview');
      s.ghost.classList.add('playroom-drag-ghost');
      if(s.immediate)s.ghost.dataset.dragStart='immediate';
      s.ghost.inert = true;
      s.ghost.setAttribute('aria-hidden', 'true'); s.ghost.setAttribute('tabindex', '-1');
      if ('disabled' in s.ghost) s.ghost.disabled = true;
      Object.assign(s.ghost.style, { width: `${s.width}px`, height: `${s.height}px`, minWidth: '0', minHeight: '0', font: style.font, color: style.color, borderRadius: style.borderRadius, flexDirection: style.flexDirection });
      s.phase = 'dragging';
      s.ghost.style.transform = 'none';
      doc.body.append(s.ghost);
      // Pointer/target rectangles use viewport coordinates. A fixed element's
      // containing-block origin may include a native root gutter or border.
      // Measure once, before the optional straightening animation.
      const origin=s.ghost.getBoundingClientRect();s.originX=origin.left;s.originY=origin.top;
      if(pose.angle&&!root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)s.ghost.animate([{rotate:pose.angle+'deg'},{rotate:'0deg'}],{duration:policy.dragStraightenMs??100,easing:'ease-out'});
      capture.classList.add('playroom-dragging'); takeCapture(s);
      try { select(s.piece,{viewKey:s.source.dataset.dragViewKey}); } catch (error) { cancel(); throw error; }
      if (active !== s) return;
      s.renderedSource = [...scope.querySelectorAll('[data-drag-piece]')].find(el => el.dataset.dragPiece === s.piece);
      s.renderedSource?.classList.add('playroom-drag-source');
      if(members.length>1){const fresh=s.renderedSource?.closest('[data-drag-stack]');s.stackSources=[...(fresh?.querySelectorAll('[data-drag-stack-member]')||[])].filter(node=>Number(node.dataset.dragStackMember)>=s.stackIndex).map(node=>node.firstElementChild).filter(Boolean);for(const node of s.stackSources)node.classList.add('playroom-drag-source');}
      paint(s);
    }
    function scrollHand(s) {
      if (!s.track?.isConnected) return;
      if (!s.scrollStyle) {
        s.scrollStyle = { snap: s.track.style.scrollSnapType, behavior: s.track.style.scrollBehavior };
        s.track.style.scrollSnapType = 'none'; s.track.style.scrollBehavior = 'auto';
      }
      if (s.scrollAxis === 'y') s.track.scrollTop = s.scrollTop + s.startY - s.y;
      else s.track.scrollLeft = s.scrollLeft + s.startX - s.x;
    }
    function scrollContainers(target) {
      const panel=target?.closest?.('.layout-self'),hand=target?.closest?.(handSelector);
      const found={x:null,y:null};
      for(let node=hand||panel;node&&within(node);node=panel&&node!==panel?node.parentElement:null){
        const style=root.getComputedStyle(node);
        if(!found.x&&node.scrollWidth>node.clientWidth+1&&['auto','scroll'].includes(style.overflowX))found.x=node;
        if(!found.y&&node.scrollHeight>node.clientHeight+1&&['auto','scroll'].includes(style.overflowY))found.y=node;
      }
      return {hand,panel,...found};
    }
    function pointerDown(event) {
      if(!within(event.target))return;
      // A new physical interaction must never inherit click suppression from
      // the previous drag, even when it follows immediately on a touch screen.
      suppress = null;
      if (active) { cancel(); suppress = null; return; }
      if (disposed || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const actionSource = sourceAt(event.target);
      const scroll = scrollContainers(event.target),track=scroll.hand;
      const source = actionSource || track || scroll.panel;
      if (!source || source.closest('[inert]')) return;
      const actionable = usable(actionSource) && canStart(actionSource);
      const scrollOnly = !actionable;
      if (event.pointerType === 'mouse' && (!actionable || !source.hasAttribute('data-drag-piece'))) return;
      const scrollableX = !!scroll.x, scrollableY = !!scroll.y;
      if (scrollOnly && !scrollableX && !scrollableY) return;
      const s = { source, scrollOnly, drag: actionable && source.hasAttribute('data-drag-piece'), piece: source.dataset.dragPiece ?? source.dataset.swipeSelect ?? source.dataset.select ?? readAction(source.dataset.swipeAction)?.card, id: event.pointerId, touch: event.pointerType !== 'mouse', startedAt: performance.now(), phase: 'pending', immediate:source.dataset.dragStart==='immediate', startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, track, scrollX:scroll.x, scrollY:scroll.y, scrollableX, scrollableY, scrollAxis: null, scrollLeft: scroll.x?.scrollLeft || 0, scrollTop: scroll.y?.scrollTop || 0, timer: 0, ghost: null, hover: null };
      if(s.immediate)s.selectedBefore=getSelected();
      active = s;
      // Touch Events stay bound to their original touchstart node even after
      // pointer capture moves to <html>. select() may detach that node; keep
      // its native gesture cancellation alive on the original subtree.
      if (s.touch) {
        s.touchMove = event => { if (active === s && s.phase !== 'pending' && event.cancelable) event.preventDefault(); };
        source.addEventListener('touchmove', s.touchMove, { capture: true, passive: false });
      }
      s.contextMenu = event => { if (active === s) event.preventDefault(); };
      source.addEventListener('contextmenu', s.contextMenu, true);
      if(s.drag&&s.immediate){beginDrag(s);if(event.cancelable)event.preventDefault();}
      if (s.drag&&!s.immediate&&!s.touch) s.timer = root.setTimeout(() => beginDrag(s), policy.dragPointerDelayMs??180);
      // Other modes defer render and capture so a quick tap uses the ordinary
      // accessible click handler; immediate board pieces are already lifted.
    }
    function pointerMove(event) {
      const s = active;
      if(!s&&event.pointerType==='mouse'){previewDown({target:event.target,isPrimary:event.isPrimary,pointerType:'mouse',button:0});return;}
      if (!s || event.pointerId !== s.id) return;
      s.x = event.clientX; s.y = event.clientY;
      const dx = s.x - s.startX, dy = s.y - s.startY;
      if(Math.hypot(dx,dy)>=3)s.moved=true;
      if (s.phase === 'pending') {
        if(s.immediate&&s.drag&&Math.hypot(dx,dy)>=3)beginDrag(s);
        else if (!s.touch && Math.hypot(dx, dy) >= 5) beginDrag(s);
        // A stationary touch remains a tap. Lift only after both a hold and
        // intentional motion; early motion belongs to scrolling or a swipe.
        else if (s.touch&&s.drag&&performance.now()-s.startedAt>=(policy.dragTouchDelayMs??220)&&Math.hypot(dx,dy)>7) beginDrag(s);
        else if (s.touch && s.scrollableY && Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx) * 1.1) {
          s.phase = 'scrolling'; s.scrollAxis = 'y'; s.track=s.scrollY; clearTimeout(s.timer); clearPreview(); takeCapture(s);
        } else if (s.touch && (s.scrollableX || !s.drag) && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          s.phase = 'scrolling'; s.scrollAxis = 'x'; s.track=s.scrollX; clearTimeout(s.timer); clearPreview(); takeCapture(s);
        } else if (s.touch && !s.scrollOnly && ((!s.scrollableX && !s.scrollableY && Math.hypot(dx,dy)>10) || (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.1))) {
          if (s.drag) beginDrag(s);
          else { s.phase = 'swiping'; takeCapture(s); }
        }
      }
      if (active !== s) return;
      if (s.phase === 'scrolling') scrollHand(s);
      if (s.phase === 'dragging') paint(s);
      if (s.phase !== 'pending' && event.cancelable) event.preventDefault();
    }
    function releaseSuppression(event) {
      if(suppress?.awaitingRelease&&event.pointerId===suppress.id){
        suppress={id:suppress.id,x:event.clientX,y:event.clientY,until:performance.now()+(policy.dragClickSuppressionMs??700)};
      }
    }
    function pointerUp(event) {
      const s = active;
      if (!s || event.pointerId !== s.id) { releaseSuppression(event);return; }
      s.x = event.clientX; s.y = event.clientY;
      const immediateTap=s.phase==='dragging'&&s.immediate&&!s.moved&&Math.hypot(s.x-s.startX,s.y-s.startY)<3;
      let action = null, selection = null, playedFrom = null, commitSource = s.source;
      if (s.phase === 'dragging'&&!immediateTap) {
        paint(s);
        const target = s.hover;
        if (target?.isConnected) {
          commitSource = target;
          action = readAction(target.dataset.action);
          if(action&&s.ghost){const rect=s.ghost.getBoundingClientRect();playedFrom={x:rect.x,y:rect.y,width:rect.width,height:rect.height};}
          if (!target.hasAttribute('data-action') && target.dataset.dropSelect === s.piece) selection = s.piece;
        } else if(s.boundary&&(s.x<s.boundary.left||s.x>s.boundary.right||s.y<s.boundary.top||s.y>s.boundary.bottom)){
          action=readAction(s.source.dataset.dragOutsideAction);
        } else if (s.touch && performance.now() - s.startedAt <= 300 && s.startY - s.y > 38 && Math.abs(s.startX - s.x) < 65) {
          // Optional quick touch swipe is distinct from a held drag. Each pack
          // explicitly supplies its legal action, or a choice still to be made.
          action = readAction(s.source.dataset.swipeAction);
          if (!s.source.hasAttribute('data-swipe-action') && s.source.dataset.swipeSelect === s.piece) selection = s.piece;
        }
      }
      if (s.phase === 'swiping' && s.startY - s.y > 38 && Math.abs(s.startX - s.x) < 65) {
        action = readAction(s.source.dataset.swipeAction);
        if (!s.source.hasAttribute('data-swipe-action') && s.source.hasAttribute('data-swipe-select')) selection = s.source.dataset.swipeSelect;
      }
      if (s.phase !== 'pending') suppress = { id: s.id, x: s.x, y: s.y, until: performance.now() + (policy.dragClickSuppressionMs??700) };
      const cancelled=s.phase==='dragging'&&!immediateTap&&!action&&selection===null;
      cleanup();
      // Immediate pieces lift on press, but a stationary release is still a selection tap.
      // Keep the press-time selection and suppress its compatibility click; a second tap toggles it off.
      if(immediateTap){if(!canSelect(s.source)||s.selectedBefore!=null&&String(s.selectedBefore)===String(s.piece))select(null);return;}
      if(cancelled&&String(getSelected())===String(s.piece))select(null);
      // Let pointerup and its compatibility click finish against stable DOM.
      if (action || selection !== null) pendingCommit = root.requestAnimationFrame(() => {
        pendingCommit = 0;
        if (!disposed) { if (action && canCommit(commitSource)) commit(action,{playedFrom,source:commitSource,allowLayoutChange:commitSource?.dataset.allowLayoutChange==='true'}); else if (!action && canSelect(s.source)) select(selection); }
      });
    }
    function click(event) {
      if (!within(event.target) || event.detail === 0 || event.defaultPrevented) return;
      if (suppress) {
        if (performance.now() > suppress.until) suppress = null;
        else {
          const samePointer = Number.isInteger(event.pointerId) && event.pointerId >= 0 ? event.pointerId === suppress.id : Math.hypot(event.clientX - suppress.x, event.clientY - suppress.y) < 12;
          if (samePointer) { suppress = null; event.preventDefault(); event.stopImmediatePropagation(); return; }
        }
      }
      const target=event.target,scope=target?.closest?.('.table-shell,.game-scene');
      if(!scope||getSelected()==null||target.closest('button,a,input,select,textarea,summary,[contenteditable],[data-action],[data-select],[data-cell],[data-drop-select],[data-drop-piece],[data-double-action],[data-view-key]'))return;
      if(canSelect(scope))select(null);
    }
    listen(doc, 'pointerdown', previewDown, true);
    listen(doc, 'pointerdown', pointerDown, true);
    listen(doc, 'pointermove', pointerMove, { capture: true, passive: false });
    // Cancel the native touch gesture after recognizing manual drag/scroll.
    // Pointer cancellation alone does not consistently reset Chrome's touch
    // gesture state, which can otherwise swallow the next physical tap.
    listen(doc, 'touchmove', event => { if (active?.touch && active.phase !== 'pending' && event.cancelable) event.preventDefault(); }, { capture: true, passive: false });
    listen(doc, 'pointerup', doubleTap, true);
    listen(doc, 'dblclick', event=>{const source=doubleSource(event.target);if(source)commitDouble(source,event);}, true);
    listen(doc, 'pointerup', pointerUp, true);
    listen(doc, 'pointerup', clearPreview, true);
    listen(doc, 'pointercancel', clearPreview, true);
    listen(doc, 'pointercancel', event => { if (event.pointerId === active?.id) cancel();releaseSuppression(event); }, true);
    listen(doc, 'lostpointercapture', event => { if (event.pointerId === active?.id && event.target === capture) cancel(); }, true);
    listen(doc, 'click', click, true);
    listen(doc, 'contextmenu', event => { if (active || (sourceAt(event.target) && suppress)) event.preventDefault(); }, true);
    listen(doc, 'dragstart', event => { if (sourceAt(event.target)) event.preventDefault(); }, true);
    listen(doc, 'keydown', event => { if (event.key === 'Escape') cancel(); }, true);
    listen(root, 'blur', cancel);
    listen(root, 'resize', cancel);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
    return { handleClick, cancel, invalidate(){if(!active||!['scrolling','scroll'].includes(active.phase)&&!active.scrollOnly)cancel();}, destroy() { cancel(); disposed = true; suppress = null; handlers.forEach(remove => remove()); } };
  }
  return { attach };
});
