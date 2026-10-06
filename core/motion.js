(function (root) {
  'use strict';
  let running = null;
  const handSelector = '.hand-track, .hand-cards, .hand-scroll, .mini-hand';
  const rectOf = el => { const r = el?.getBoundingClientRect(); return r && r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null; };
  const isHand = el => !!el.closest(handSelector);
  const publicEntity = el => !isHand(el) && !el.closest('[data-motion-static],[data-drop-piece]');
  function clampRect(rect, boundary) {
    if (!rect) return null;
    const edge = boundary || { x: 0, y: 0, width: root.innerWidth, height: root.innerHeight };
    const left = Math.max(0, edge.x), top = Math.max(0, edge.y);
    const right = Math.min(root.innerWidth, edge.x + edge.width), bottom = Math.min(root.innerHeight, edge.y + edge.height);
    const width = Math.min(rect.width, Math.max(1, right - left)), height = Math.min(rect.height, Math.max(1, bottom - top));
    return { x: Math.max(left, Math.min(rect.x, right - width)), y: Math.max(top, Math.min(rect.y, bottom - height)), width, height };
  }
  function handOrigin(hand, maxWidth = 38, maxHeight = 54) {
    const r = rectOf(hand);
    if (!r) return null;
    // A compact anchor represents the centre of a hidden hand; no hidden card
    // identity or face is read, stored, or cloned by the motion layer.
    const width = Math.min(maxWidth, r.width), height = Math.min(maxHeight, r.height);
    return clampRect({ x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height });
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
  function capture({ actor = null, action = null, viewer = null, playedFrom = null } = {}) {
    const doc = root.document, scene = doc.querySelector('.scene'), entities = new Map();
    if (scene) for (const el of scene.querySelectorAll('[data-entity]')) {
      const rect = rectOf(el);
      if (!rect || root.getComputedStyle(el).visibility === 'hidden') continue;
      const hand = el.closest(handSelector), boundary = rectOf(hand || scene);
      entities.set(el.dataset.entity, { rect: clampRect(rect, boundary), hand: !!hand, public: publicEntity(el) });
    }
    const owner = Number.isInteger(actor) ? [...(scene?.querySelectorAll('[data-player-index]') || [])].find(el => Number(el.dataset.playerIndex) === actor) : null;
    const hand = actor === viewer ? scene?.querySelector('.hand-track, .hand-cards, .hand-scroll') : owner?.querySelector('.mini-hand');
    const stockBack = scene?.querySelector('[data-motion-stock] .piece-back, .stock-button .piece-back');
    const release = playedFrom && ['x','y','width','height'].every(key => Number.isFinite(playedFrom[key])) && playedFrom.width > 0 && playedFrom.height > 0 ? clampRect({ x: playedFrom.x, y: playedFrom.y, width: playedFrom.width, height: playedFrom.height }) : null;
    return { actor, viewer, action: action ? { type: action.type, card: action.card, from: action.from, to: action.to } : null, playedFrom: release, entities, origin: handOrigin(hand), hands: handOrigins(scene, viewer), stock: clampRect(rectOf(stockBack) || rectOf(scene?.querySelector('.stock-button'))), stockBack: stockBack ? styledClone(stockBack) : null, table: handOrigin(scene?.querySelector('[data-motion-table]'), 66, 98) };
  }
  function stripInteraction(el) {
    for (const node of [el, ...el.querySelectorAll('*')]) {
      for (const attr of [...node.attributes]) if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name.startsWith('on')) node.removeAttribute(attr.name);
      node.setAttribute('aria-hidden', 'true'); node.setAttribute('tabindex', '-1');
      if ('disabled' in node) node.disabled = true;
    }
  }
  function styledClone(el) {
    const clone = el.cloneNode(true), sourceNodes = [el, ...el.querySelectorAll('*')], cloneNodes = [clone, ...clone.querySelectorAll('*')];
    // Freeze resolved styles so a domino retains its board orientation and
    // inherited CSS variables even when its clone leaves the game container.
    for (let i = 0; i < sourceNodes.length; i++) {
      const style = root.getComputedStyle(sourceNodes[i]);
      cloneNodes[i].style.cssText = [...style].map(key => `${key}:${style.getPropertyValue(key)};`).join('');
      cloneNodes[i].style.setProperty('animation', 'none', 'important');
      cloneNodes[i].style.setProperty('transition', 'none', 'important');
      cloneNodes[i].style.setProperty('pointer-events', 'none', 'important');
    }
    stripInteraction(clone);
    const style = root.getComputedStyle(el), width = el.offsetWidth || parseFloat(style.width), height = el.offsetHeight || parseFloat(style.height);
    const origin = style.transformOrigin.split(' ').map(Number.parseFloat), ox = origin[0] || 0, oy = origin[1] || 0;
    let minX = 0, minY = 0;
    if (style.transform && style.transform !== 'none' && root.DOMMatrixReadOnly) {
      const matrix = new root.DOMMatrixReadOnly(style.transform);
      const points = [[0,0],[width,0],[0,height],[width,height]].map(([x,y]) => ({ x: matrix.a * (x - ox) + matrix.c * (y - oy) + matrix.e + ox, y: matrix.b * (x - ox) + matrix.d * (y - oy) + matrix.f + oy }));
      minX = Math.min(...points.map(p => p.x)); minY = Math.min(...points.map(p => p.y));
    }
    clone.classList.add('playroom-motion-piece');
    Object.assign(clone.style, { position: 'absolute', left: `${-minX}px`, top: `${-minY}px`, right: 'auto', bottom: 'auto', width: `${width}px`, height: `${height}px`, minWidth: '0', minHeight: '0', margin: '0', opacity: '1', visibility: 'visible' });
    return clone;
  }
  function cancel() {
    if (running) running.finish();
  }
  function play(snapshot, { duration = 500, draws } = {}) {
    cancel();
    duration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    if (!snapshot || !duration) return Promise.resolve();
    const doc = root.document, scene = doc.querySelector('.scene');
    if (!scene) return Promise.resolve();
    const entities = snapshot.entities instanceof Map ? snapshot.entities : new Map();
    const flights = [], used = new Set();
    const current = [...scene.querySelectorAll('[data-entity]')];
    const card = snapshot.action?.card;
    const publicNow = current.filter(publicEntity);
    const played = publicNow.filter(el => {
      if (card != null) return el.dataset.entity.endsWith(`-${card}`);
      const before = entities.get(el.dataset.entity);
      return /^(card|tile)-/.test(el.dataset.entity) && (!before || !before.public);
    });
    for (const el of played) {
      const before = entities.get(el.dataset.entity), from = card != null && snapshot.playedFrom ? snapshot.playedFrom : before?.hand ? before.rect : snapshot.origin, to = rectOf(el);
      if (from && to) { flights.push({ el, from, to, kind: 'play' }); used.add(el); }
    }
    for (const el of current) {
      if (used.has(el)) continue;
      const before = entities.get(el.dataset.entity), to = rectOf(el);
      if (!to) continue;
      if (before?.public && publicEntity(el) && /^(checker|token)-/.test(el.dataset.entity) && Math.hypot(before.rect.x - to.x, before.rect.y - to.y) > 2) flights.push({ el, from: snapshot.playedFrom && Number(el.dataset.boardCell)===snapshot.action?.to ? snapshot.playedFrom : before.rect, to, kind: 'move' });
    }
    const handCards = current.filter(el => el.closest('.hand-track, .hand-cards, .hand-scroll') && !entities.get(el.dataset.entity)?.hand);
    const drawCues = draws === undefined && snapshot.action?.type === 'draw' ? [{ player: snapshot.viewer, count: handCards.length, from: 'stock' }] : draws || [];
    const newHands = handOrigins(scene, snapshot.viewer), baseDelay = flights.length ? duration : 0;
    let drawIndex = 0, ownIndex = 0;
    for (const cue of drawCues) {
      if (!Number.isInteger(cue.player) || !Number.isInteger(cue.count) || cue.count < 1) continue;
      const from = cue.from === 'table' ? snapshot.table : cue.from === 'hand' ? snapshot.hands?.get(cue.fromPlayer) : snapshot.stock;
      const anchor = newHands.get(cue.player) || snapshot.hands?.get(cue.player);
      if (!from || !anchor) continue;
      for (let i = 0; i < cue.count; i++) {
        const el = cue.player === snapshot.viewer ? handCards[ownIndex++] : null;
        const to = el ? clampRect(rectOf(el), rectOf(el.closest(handSelector))) : anchor;
        if (!to) continue;
        flights.push({ el, from, to, kind: 'draw', player: cue.player, back: true, duration: duration * .65, delay: baseDelay + drawIndex++ * duration * .3 });
      }
    }
    const die = snapshot.action?.type === 'roll' ? scene.querySelector('.die') : null;
    if (!flights.length && !die) return Promise.resolve();
    return new Promise(resolve => {
      const animations = [], restore = [], layer = flights.length ? doc.createElement('div') : null;
      let ended = false, timer = 0;
      const show = entry => { if (!entry || entry.shown) return; entry.shown = true; entry.visibility ? entry.el.style.setProperty('visibility', entry.visibility, entry.priority) : entry.el.style.removeProperty('visibility'); };
      if (layer) { layer.className = 'playroom-motion-layer'; layer.setAttribute('aria-hidden', 'true'); doc.body.append(layer); }
      const run = { finish() {
        if (ended) return; ended = true; clearTimeout(timer);
        for (const animation of animations) animation.cancel();
        restore.forEach(show);
        layer?.remove(); if (running === run) running = null; resolve();
      }};
      running = run;
      try {
        for (const { el, from, to, kind, back, player, delay = 0, duration: flightDuration = duration } of flights) {
          const mover = doc.createElement('div'); mover.className = 'playroom-motion-flight'; mover.dataset.motionKind = kind;
          mover.style.width = `${to.width}px`; mover.style.height = `${to.height}px`;
          let clone;
          if (back) {
            clone = snapshot.stockBack?.cloneNode(true) || doc.createElement('div');
            clone.classList.add('piece-back', 'playroom-motion-piece'); clone.setAttribute('aria-hidden', 'true');
            Object.assign(clone.style, { position: 'absolute', left: '0', top: '0', width: `${to.width}px`, height: `${to.height}px`, minWidth: '0', minHeight: '0', transform: 'none' });
          } else clone = styledClone(el);
          clone.dataset.motionKind = kind;
          if (player != null) { mover.dataset.motionPlayer = player; clone.dataset.motionPlayer = player; }
          mover.append(clone); layer.append(mover);
          const entry = el ? { el, visibility: el.style.getPropertyValue('visibility'), priority: el.style.getPropertyPriority('visibility') } : null;
          if (entry) { restore.push(entry); el.style.setProperty('visibility', 'hidden', 'important'); }
          const sx = from.width / to.width, sy = from.height / to.height, lift = kind === 'move' ? 12 : Math.min(90, Math.hypot(from.x - to.x, from.y - to.y) * .18 + 22);
          const transform = (x,y,xScale,yScale) => `translate3d(${x}px,${y}px,0) scale(${xScale},${yScale})`;
          const frames = [{ transform: transform(from.x,from.y,sx,sy), offset: 0 }, { transform: transform((from.x+to.x)/2,Math.max(0,Math.min(from.y,to.y)-lift),(sx+1)/2,(sy+1)/2), offset: .52 }, { transform: transform(to.x,to.y,1,1), offset: 1 }];
          if (back) { frames[0].opacity = 0; frames[1].opacity = 1; frames[2].opacity = 1; }
          const animation = mover.animate(frames, { duration: flightDuration, delay, easing: 'cubic-bezier(.25,.55,.25,1)', fill: 'both' });
          animation.finished.then(() => { show(entry); mover.remove(); }, () => {});
          animations.push(animation);
        }
        if (die) {
          const base = root.getComputedStyle(die).transform;
          animations.push(die.animate([{ transform: `${base === 'none' ? '' : base} rotate(-25deg) scale(.85)` }, { transform: `${base === 'none' ? '' : base} rotate(135deg) scale(1.08)`, offset: .45 }, { transform: base }], { duration, easing: 'ease-out' }));
        }
        // A fallback also resolves if a browser drops animation.finished when
        // its document changes visibility; cancel() remains synchronous.
        timer = root.setTimeout(run.finish, Math.max(duration, ...flights.map(f => (f.delay || 0) + (f.duration || duration))) + 100);
        Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(run.finish);
      } catch (error) { run.finish(); throw error; }
    });
  }
  const api = root.PlayroomMotion = { capture, play, cancel };
  if (typeof module === 'object' && module.exports) module.exports = api;
})(globalThis);
