(function (root, factory) {
  const Input = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = Input;
  root.TabletopInput = root.PlayroomInput = Input;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  // Browser input only. The host owns selection, legal target rendering and
  // authoritative actions; this module never infers a move or accesses rules.
  function attach({ canStart = () => true, canSelect = canStart, canCommit = canStart, getSelected = () => null, select, commit } = {}) {
    if (typeof select !== 'function' || typeof commit !== 'function') throw Error('TabletopInput requires select and commit callbacks');
    if (!root.document?.documentElement) throw Error('TabletopInput.attach requires a browser document');
    const doc = root.document, capture = doc.documentElement;
    let active = null, suppress = null, pendingCommit = 0, disposed = false, preview = null;
    const handlers = [];
    const listen = (node, type, handler, options) => { node.addEventListener(type, handler, options); handlers.push(() => node.removeEventListener(type, handler, options)); };
    const sourceAt = target => target instanceof root.Element ? target.closest('[data-drag-piece],[data-swipe-action],[data-swipe-select]') : null;
    const usable = el => el && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[inert]');
    const readAction = value => {
      if (typeof value !== 'string') return null;
      try { const action = JSON.parse(value); return action && typeof action === 'object' && !Array.isArray(action) && typeof action.type === 'string' ? action : null; } catch (_) { return null; }
    };
    function handleClick(event) {
      if (disposed || event.defaultPrevented) return false;
      const source = event.target?.closest?.('[data-action],[data-select],[data-cell],[data-drop-select]');
      if (!usable(source)) return false;
      if (source.hasAttribute('data-action')) {
        const action = readAction(source.dataset.action);
        if (action && canCommit(source)) commit(action, {source});
        return true;
      }
      if (canSelect(source)) {
        const value = source.dataset.dropSelect ?? source.dataset.select ?? source.dataset.cell;
        const current = getSelected(), same = current != null && String(current) === value;
        select(source.hasAttribute('data-drop-select') || !same ? value : null);
      }
      return true;
    }
    function clearPreview() { preview?.classList.remove('is-hand-preview'); preview = null; }
    function previewDown(event) {
      clearPreview();
      if (event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const card = event.target.closest?.('[data-hand-preview]');
      if (usable(card) && canSelect(card)) { preview = card; card.classList.add('is-hand-preview'); }
    }

    function hoverAt(s, x, y) {
      const el = doc.elementFromPoint(x, y)?.closest('[data-drop-piece]');
      const supported = el?.hasAttribute('data-action') || el?.dataset.dropSelect === s.piece;
      const next = usable(el) && supported && el.dataset.dropPiece === s.piece ? el : null;
      if (s.hover !== next) { s.hover?.classList.remove('playroom-drop-hover'); next?.classList.add('playroom-drop-hover'); s.hover = next; }
      return next;
    }
    function paint(s) {
      if (!s.ghost) return;
      // A fixed ghost remains entirely inside the viewport, so dragging at an
      // edge cannot enlarge the document's horizontal or vertical scroll area.
      const left = Math.max(0, Math.min(root.innerWidth - s.width, s.x - s.offsetX));
      const top = Math.max(0, Math.min(root.innerHeight - s.height, s.y - s.offsetY));
      s.ghost.style.transform = `translate3d(${left}px, ${top}px, 0)`;
      hoverAt(s, s.x, s.y);
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
      s.ghost?.remove();
      capture.classList.remove('playroom-dragging');
      restoreScroll(s);
      // Clear state before release: lostpointercapture may fire synchronously.
      try { if (capture.hasPointerCapture(s.id)) capture.releasePointerCapture(s.id); } catch (_) { /* Pointer already ended. */ }
    }
    function cancel() {
      clearPreview();
      if (active?.phase !== 'pending' && active) suppress = { id: active.id, x: active.x, y: active.y, until: performance.now() + 700 };
      cleanup();
      if (pendingCommit) { root.cancelAnimationFrame(pendingCommit); pendingCommit = 0; }
    }
    function beginDrag(s) {
      if (active !== s || disposed || s.phase !== 'pending') return;
      clearTimeout(s.timer);
      if (!s.drag || !s.source.isConnected || !canStart(s.source) || !canSelect(s.source)) { cleanup(); return; }
      // Clone before select(): selecting may synchronously replace the scene.
      const rect = s.source.getBoundingClientRect(), style = root.getComputedStyle(s.source);
      s.width = rect.width; s.height = rect.height;
      s.offsetX = Math.max(0, Math.min(s.width, s.startX - rect.left));
      s.offsetY = Math.max(0, Math.min(s.height, s.startY - rect.top));
      s.ghost = s.source.cloneNode(true);
      for (const el of [s.ghost, ...s.ghost.querySelectorAll('*')]) {
        el.removeAttribute('id'); el.removeAttribute('data-drag-piece'); el.removeAttribute('data-select'); el.removeAttribute('data-action'); el.removeAttribute('data-entity'); el.removeAttribute('data-swipe-action'); el.removeAttribute('data-swipe-select'); el.removeAttribute('data-hand-preview');
      }
      s.ghost.classList.remove('is-selected', 'is-playable', 'is-hand-preview');
      s.ghost.classList.add('playroom-drag-ghost');
      s.ghost.inert = true;
      s.ghost.setAttribute('aria-hidden', 'true'); s.ghost.setAttribute('tabindex', '-1');
      if ('disabled' in s.ghost) s.ghost.disabled = true;
      Object.assign(s.ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, minWidth: '0', minHeight: '0', font: style.font, color: style.color, flexDirection: style.flexDirection });
      s.phase = 'dragging';
      doc.body.append(s.ghost); capture.classList.add('playroom-dragging'); takeCapture(s);
      try { select(s.piece); } catch (error) { cancel(); throw error; }
      if (active !== s) return;
      s.renderedSource = [...doc.querySelectorAll('[data-drag-piece]')].find(el => el.dataset.dragPiece === s.piece);
      s.renderedSource?.classList.add('playroom-drag-source');
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
    function pointerDown(event) {
      // A new physical interaction must never inherit click suppression from
      // the previous drag, even when it follows immediately on a touch screen.
      suppress = null;
      if (active) { cancel(); suppress = null; return; }
      if (disposed || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
      const actionSource = sourceAt(event.target);
      const track = event.target?.closest?.('.hand-track, .hand-cards, .hand-scroll, [data-hand-scroll]');
      const source = actionSource || track;
      if (!source || source.closest('[inert]')) return;
      const actionable = usable(actionSource) && canStart(actionSource);
      const scrollOnly = !actionable;
      if (event.pointerType === 'mouse' && (!actionable || !source.hasAttribute('data-drag-piece'))) return;
      const trackStyle = track ? root.getComputedStyle(track) : null;
      const scrollableX = !!track && track.scrollWidth > track.clientWidth + 1 && ['auto','scroll'].includes(trackStyle.overflowX);
      const scrollableY = !!track && track.scrollHeight > track.clientHeight + 1 && ['auto','scroll'].includes(trackStyle.overflowY);
      if (scrollOnly && !scrollableX && !scrollableY) return;
      const s = { source, scrollOnly, drag: actionable && source.hasAttribute('data-drag-piece'), piece: source.dataset.dragPiece ?? source.dataset.swipeSelect ?? source.dataset.select ?? readAction(source.dataset.swipeAction)?.card, id: event.pointerId, touch: event.pointerType !== 'mouse', startedAt: performance.now(), phase: 'pending', startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, track, scrollableX, scrollableY, scrollAxis: null, scrollLeft: track?.scrollLeft || 0, scrollTop: track?.scrollTop || 0, timer: 0, ghost: null, hover: null };
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
      if (s.drag) s.timer = root.setTimeout(() => beginDrag(s), s.touch ? 220 : 180);
      // No render, capture, preventDefault or selection here: a quick tap uses
      // the browser's ordinary click and the host's accessible click handler.
    }
    function pointerMove(event) {
      const s = active;
      if(!s&&event.pointerType==='mouse'){previewDown({target:event.target,isPrimary:event.isPrimary,pointerType:'mouse',button:0});return;}
      if (!s || event.pointerId !== s.id) return;
      s.x = event.clientX; s.y = event.clientY;
      const dx = s.x - s.startX, dy = s.y - s.startY;
      if (s.phase === 'pending') {
        if (!s.touch && Math.hypot(dx, dy) >= 5) beginDrag(s);
        else if (s.touch && s.scrollableY && Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx) * 1.1) {
          s.phase = 'scrolling'; s.scrollAxis = 'y'; clearTimeout(s.timer); takeCapture(s);
        } else if (s.touch && (s.scrollableX || !s.drag) && Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy) * 1.1) {
          s.phase = 'scrolling'; s.scrollAxis = 'x'; clearTimeout(s.timer); takeCapture(s);
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
    function pointerUp(event) {
      const s = active;
      if (!s || event.pointerId !== s.id) return;
      s.x = event.clientX; s.y = event.clientY;
      let action = null, selection = null, playedFrom = null, commitSource = s.source;
      if (s.phase === 'dragging') {
        const target = hoverAt(s, s.x, s.y);
        if (target?.isConnected) {
          commitSource = target;
          action = readAction(target.dataset.action);
          if(action&&s.ghost){const rect=s.ghost.getBoundingClientRect();playedFrom={x:rect.x,y:rect.y,width:rect.width,height:rect.height};}
          if (!target.hasAttribute('data-action') && target.dataset.dropSelect === s.piece) selection = s.piece;
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
      if (s.phase !== 'pending') suppress = { id: s.id, x: s.x, y: s.y, until: performance.now() + 700 };
      cleanup();
      // Let pointerup and its compatibility click finish against stable DOM.
      if (action || selection !== null) pendingCommit = root.requestAnimationFrame(() => {
        pendingCommit = 0;
        if (!disposed) { if (action && canCommit(commitSource)) commit(action,{playedFrom}); else if (!action && canSelect(s.source)) select(selection); }
      });
    }
    function click(event) {
      if (!suppress || event.detail === 0) return;
      if (performance.now() > suppress.until) { suppress = null; return; }
      const samePointer = Number.isInteger(event.pointerId) && event.pointerId >= 0 ? event.pointerId === suppress.id : Math.hypot(event.clientX - suppress.x, event.clientY - suppress.y) < 12;
      if (samePointer) { suppress = null; event.preventDefault(); event.stopImmediatePropagation(); }
    }
    listen(doc, 'pointerdown', previewDown, true);
    listen(doc, 'pointerdown', pointerDown, true);
    listen(doc, 'pointermove', pointerMove, { capture: true, passive: false });
    // Cancel the native touch gesture after recognizing manual drag/scroll.
    // Pointer cancellation alone does not consistently reset Chrome's touch
    // gesture state, which can otherwise swallow the next physical tap.
    listen(doc, 'touchmove', event => { if (active?.touch && active.phase !== 'pending' && event.cancelable) event.preventDefault(); }, { capture: true, passive: false });
    listen(doc, 'pointerup', pointerUp, true);
    listen(doc, 'pointerup', clearPreview, true);
    listen(doc, 'pointercancel', clearPreview, true);
    listen(doc, 'pointercancel', event => { if (event.pointerId === active?.id) cancel(); }, true);
    listen(doc, 'lostpointercapture', event => { if (event.pointerId === active?.id && event.target === capture) cancel(); }, true);
    listen(doc, 'click', click, true);
    listen(doc, 'contextmenu', event => { if (active || (sourceAt(event.target) && suppress)) event.preventDefault(); }, true);
    listen(doc, 'dragstart', event => { if (sourceAt(event.target)) event.preventDefault(); }, true);
    listen(doc, 'keydown', event => { if (event.key === 'Escape') cancel(); }, true);
    listen(root, 'blur', cancel);
    listen(root, 'resize', cancel);
    listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
    return { handleClick, cancel, destroy() { cancel(); disposed = true; suppress = null; handlers.forEach(remove => remove()); } };
  }
  return { attach };
});
