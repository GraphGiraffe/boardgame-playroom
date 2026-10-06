(function (root) {
  'use strict';
  const tooltipId = 'playroom-context-tooltip';
  let attached = false, tooltip = null, source = null, pending = null, timer = null;
  let input = 'keyboard', shownBy = null, observer = null, pendingOrigin = null, focusFrame = null;

  function cancelPending() { clearTimeout(timer); timer = null; if (focusFrame !== null) root.cancelAnimationFrame(focusFrame); focusFrame = null; pending = null; pendingOrigin = null; }
  function removeDescription(element) {
    if (!element) return;
    const tokens = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== tooltipId);
    if (tokens.length) element.setAttribute('aria-describedby', tokens.join(' '));
    else element.removeAttribute('aria-describedby');
  }
  function hide() {
    cancelPending(); observer?.disconnect(); removeDescription(source);
    source = null; shownBy = null;
    if (tooltip) { tooltip.hidden = true; tooltip.textContent = ''; }
  }
  function show(element, origin) {
    cancelPending();
    const text = element?.dataset.tooltip?.trim();
    if (!text || !element.isConnected || !document.body) return hide();
    hide(); source = element; shownBy = origin;
    if (!tooltip || !tooltip.isConnected) {
      tooltip = document.createElement('div'); tooltip.id = tooltipId;
      tooltip.className = 'playroom-tooltip'; tooltip.setAttribute('role', 'tooltip');
      document.body.append(tooltip);
    }
    tooltip.textContent = text; tooltip.hidden = false;
    const bounds = element.getBoundingClientRect();
    const viewport = root.visualViewport, left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
    const width = viewport?.width || root.innerWidth, height = viewport?.height || root.innerHeight, margin = 12;
    tooltip.style.maxWidth = `${Math.max(1, Math.min(320, width - margin * 2))}px`;
    tooltip.style.maxHeight = `${Math.max(1, height - margin * 2)}px`;
    const box = tooltip.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(bounds.left + bounds.width / 2 - box.width / 2, left + width - box.width - margin));
    const above = bounds.top - box.height - 10;
    const y = Math.max(top + margin, Math.min(above >= top + margin ? above : bounds.bottom + 10, top + height - box.height - margin));
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
    const descriptions = new Set((element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    descriptions.add(tooltipId); element.setAttribute('aria-describedby', [...descriptions].join(' '));
    observer ||= new MutationObserver(() => { if (source && (!source.isConnected || source.dataset.tooltip?.trim() !== tooltip.textContent)) hide(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tooltip'] });
  }
  function elementFor(event) { return event.target instanceof Element ? event.target.closest('[data-tooltip]') : null; }
  function over(event) {
    if (event.pointerType === 'touch' || event.buttons) return;
    const next = elementFor(event); if (!next || next === source || next === pending) return;
    hide(); pending = next; pendingOrigin = 'pointer'; timer = setTimeout(() => show(next, 'pointer'), 180);
  }
  function out(event) {
    const previous = elementFor(event);
    if (!previous || previous.contains(event.relatedTarget)) return;
    if (pending === previous || (source === previous && shownBy === 'pointer')) hide();
  }
  function down(event) { input = event.pointerType === 'touch' ? 'touch' : 'pointer'; hide(); }
  function focus(event) {
    if (input === 'touch') return;
    const next = elementFor(event); if (!next) return;
    hide(); pending = next; pendingOrigin = 'focus';
    // Native focus scrolls an offscreen control before its focusin event, then
    // dispatches scroll on the next frame. Position the tooltip after that scroll.
    focusFrame = root.requestAnimationFrame(() => {
      focusFrame = root.requestAnimationFrame(() => {
        focusFrame = null;
        if (pending === next && next.isConnected && next.contains(document.activeElement)) show(next, 'focus');
        else hide();
      });
    });
  }
  function blur(event) {
    const current = pendingOrigin === 'focus' ? pending : source;
    if (current && current.contains(event.target) && !current.contains(event.relatedTarget)) hide();
  }
  function scroll() { if (pendingOrigin !== 'focus') hide(); }
  function key(event) {
    input = 'keyboard';
    if (event.key === 'Escape' || (pendingOrigin === 'focus' && ['PageUp','PageDown','Home','End','ArrowUp','ArrowDown'].includes(event.key))) hide();
  }
  const listeners = [['pointerover', over], ['pointerout', out], ['pointerdown', down], ['focusin', focus], ['focusout', blur], ['keydown', key]];
  function attach() {
    if (attached) return api;
    attached = true; listeners.forEach(([type, handler]) => document.addEventListener(type, handler, true));
    root.addEventListener('scroll', scroll, { capture: true, passive: true }); root.addEventListener('resize', hide);
    root.addEventListener('wheel', hide, { capture: true, passive: true }); root.addEventListener('blur', hide);
    root.visualViewport?.addEventListener('resize', hide); root.visualViewport?.addEventListener('scroll', scroll);
    return api;
  }
  function destroy() {
    hide(); attached = false; listeners.forEach(([type, handler]) => document.removeEventListener(type, handler, true));
    document.removeEventListener('DOMContentLoaded', attach);
    root.removeEventListener('scroll', scroll, true); root.removeEventListener('resize', hide);
    root.removeEventListener('wheel', hide, true); root.removeEventListener('blur', hide);
    root.visualViewport?.removeEventListener('resize', hide); root.visualViewport?.removeEventListener('scroll', scroll);
    tooltip?.remove(); tooltip = null;
  }
  const api = root.PlayroomTooltips = { attach, hide, destroy };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
    else attach();
  }
})(globalThis);
