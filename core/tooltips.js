(function (root) {
  'use strict';
  const policy=root.PlayroomSizeCatalogue?.presentation?.interaction||{};
  const tooltipId = 'playroom-context-tooltip';
  let attached = false, tooltip = null, source = null, pending = null, timer = null;
  let input = 'keyboard', shownBy = null, observer = null, pendingOrigin = null, focusFrame = null;

  let press=null, holdTimer=null, lingerTimer=null, suppressUntil=0, manualClick=false;
  const textFor=element=>(element?.dataset.tooltip||element?.getAttribute('title')||element?.getAttribute('aria-label')||'').trim();
  function clearPress(){clearTimeout(holdTimer);holdTimer=null;press=null;}
  function dismiss(){clearPress();hide();}
  function cancelPending() { clearTimeout(timer); timer = null; if (focusFrame !== null) root.cancelAnimationFrame(focusFrame); focusFrame = null; pending = null; pendingOrigin = null; }
  function removeDescription(element) {
    if (!element) return;
    const tokens = (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(token => token && token !== tooltipId);
    if (tokens.length) element.setAttribute('aria-describedby', tokens.join(' '));
    else element.removeAttribute('aria-describedby');
  }
  function hide() {
    clearTimeout(lingerTimer);lingerTimer=null;cancelPending(); observer?.disconnect(); removeDescription(source);
    source = null; shownBy = null;
    if (tooltip) { tooltip.hidden = true; tooltip.textContent = ''; }
  }
  function show(element, origin) {
    cancelPending();
    const text = textFor(element);
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
    const width = viewport?.width || root.innerWidth, height = viewport?.height || root.innerHeight, margin = policy.tooltipViewportMarginPx??12;
    tooltip.style.maxWidth = `${Math.max(1, Math.min(policy.tooltipMaxWidthPx??320, width - margin * 2))}px`;
    tooltip.style.maxHeight = `${Math.max(1, height - margin * 2)}px`;
    const box = tooltip.getBoundingClientRect();
    const x = Math.max(left + margin, Math.min(bounds.left + bounds.width / 2 - box.width / 2, left + width - box.width - margin));
    const above = bounds.top - box.height - (policy.tooltipOffsetPx??10);
    const y = Math.max(top + margin, Math.min(above >= top + margin ? above : bounds.bottom + (policy.tooltipOffsetPx??10), top + height - box.height - margin));
    tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
    const descriptions = new Set((element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
    descriptions.add(tooltipId); element.setAttribute('aria-describedby', [...descriptions].join(' '));
    observer ||= new MutationObserver(() => { if (source && (!source.isConnected || textFor(source) !== tooltip.textContent)) hide(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-tooltip','title','aria-label'] });
  }
  function elementFor(event) { return event.target instanceof Element ? event.target.closest('[data-tooltip]') : null; }
  function over(event) {
    if (event.pointerType === 'touch' || event.buttons) return;
    const next = elementFor(event); if (!next || next === source || next === pending) return;
    hide(); pending = next; pendingOrigin = 'pointer'; timer = setTimeout(() => show(next, 'pointer'), policy.tooltipHoverMs??180);
  }
  function out(event) {
    const previous = elementFor(event);
    if (!previous || previous.contains(event.relatedTarget)) return;
    if (pending === previous || (source === previous && shownBy === 'pointer')) hide();
  }
  function down(event) {
    input=event.pointerType==='touch'?'touch':'pointer';
    if(press&&event.isPrimary===false){suppressUntil=performance.now()+(policy.compatibilityClickMs??800);dismiss();return;}
    dismiss();suppressUntil=0;
    if(input!=='touch'||event.isPrimary===false)return;
    const element=event.target.closest?.('button,[role="button"]');
    // Card dragging and inspection retain their own pointer contract.
    if(!element||!textFor(element)||element.closest('[inert],[data-drag-piece],[data-select],[data-swipe-action],[data-swipe-select]'))return;
    const current=press={element,id:event.pointerId,x:event.clientX,y:event.clientY,held:false};
    holdTimer=setTimeout(()=>{holdTimer=null;if(press===current&&element.isConnected){current.held=true;show(element,'touch');}},policy.tooltipHoldMs??450);
  }
  function move(event){
    if(!press||press.id!==event.pointerId||press.held)return;
    if(Math.hypot(event.clientX-press.x,event.clientY-press.y)>(policy.tooltipMoveTolerancePx??10)){clearTimeout(holdTimer);holdTimer=null;}
  }
  function end(event){
    if(!press||press.id!==event.pointerId)return;
    const current=press,element=current.element;
    const inside=event.type==='pointerup'&&element.isConnected&&!element.closest('[inert]')&&element.contains(document.elementFromPoint(event.clientX,event.clientY));
    clearPress();
    if(!current.held){if(!inside)suppressUntil=performance.now()+(policy.compatibilityClickMs??800);return;}
    suppressUntil=performance.now()+(policy.compatibilityClickMs??800);event.preventDefault();event.stopImmediatePropagation();
    if(inside){hide();manualClick=true;try{element.click();}finally{manualClick=false;}}
    else if(source===element&&tooltip&&!tooltip.hidden){shownBy='touch-linger';lingerTimer=setTimeout(hide,policy.tooltipLingerMs??2000);}
    else hide();
  }
  function click(event){
    if(!manualClick&&performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}
  }
  function context(event){if(press||shownBy==='touch'||shownBy==='touch-linger')event.preventDefault();}

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
  function scroll() {if(shownBy==='touch'||shownBy==='touch-linger')return;if(pendingOrigin!=='focus')dismiss();}
  function key(event) {
    input = 'keyboard';clearPress();suppressUntil=0;
    if (event.key === 'Escape' || (pendingOrigin === 'focus' && ['PageUp','PageDown','Home','End','ArrowUp','ArrowDown'].includes(event.key))) hide();
  }
  const listeners = [['pointerover', over], ['pointerout', out], ['pointerdown', down], ['pointermove',move], ['pointerup',end], ['pointercancel',end], ['click',click], ['contextmenu',context], ['focusin', focus], ['focusout', blur], ['keydown', key]];
  function attach() {
    if (attached) return api;
    attached = true; listeners.forEach(([type, handler]) => document.addEventListener(type, handler, true));
    root.addEventListener('scroll', scroll, { capture: true, passive: true }); root.addEventListener('resize', dismiss);
    root.addEventListener('wheel', dismiss, { capture: true, passive: true }); root.addEventListener('blur', dismiss);
    root.visualViewport?.addEventListener('resize', dismiss); root.visualViewport?.addEventListener('scroll', scroll);
    return api;
  }
  function destroy() {
    dismiss();suppressUntil=0;attached = false; listeners.forEach(([type, handler]) => document.removeEventListener(type, handler, true));
    document.removeEventListener('DOMContentLoaded', attach);
    root.removeEventListener('scroll', scroll, true); root.removeEventListener('resize', dismiss);
    root.removeEventListener('wheel', dismiss, true); root.removeEventListener('blur', dismiss);
    root.visualViewport?.removeEventListener('resize', dismiss); root.visualViewport?.removeEventListener('scroll', scroll);
    tooltip?.remove(); tooltip = null;
  }
  const api = root.PlayroomTooltips = { attach, hide:dismiss, destroy };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root.document) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
    else attach();
  }
})(globalThis);
