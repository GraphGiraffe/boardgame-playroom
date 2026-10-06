(function (root, factory) {
  'use strict';
  const UI = factory();
  if (typeof module === 'object' && module.exports) module.exports = UI;
  root.TabletopUI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const actionAttr = action => `data-action="${esc(JSON.stringify(action))}"`;
  const actionButton = (action, extra = '') => `<button class="scene-button ${extra}" ${actionAttr(action)}>${esc(action.label || action.type)}</button>`;
  const actionBar = (actions, hint) => `<div class="scene-actions">${actions.map(a => actionButton(a)).join('')}${!actions.length && hint ? `<span class="scene-hint">${esc(hint)}</span>` : ''}</div>`;
  const back = (kind = 'card') => `<span class="piece-back ${kind}-back" role="img" aria-label="Закрытая карта"><span>✦</span></span>`;
  function opponents(state, viewer, cardRender, options = {}) {
    if (!state.data.hands) return '';
    return `<div class="opponent-hands">${state.players.map((p,i) => {
      if(i===viewer)return '';
      const cards=state.data.hands[i]||[],open=cards.some(c=>!c.hidden),visible=open?cards:cards.slice(0,5);
      const attrs=options.playerAttrs?.(i,p)||'',badge=options.playerBadge?.(i,p)||'';
      const pieces=visible.map((c,index)=>{
        if(c.hidden)return back();
        const caption=options.cardLabel?.(c);
        return `<span class="public-card" data-public-card-index="${index}">${caption!=null?`<span class="public-card-caption" aria-hidden="true">${esc(caption)}</span>`:''}${cardRender(c,'disabled')}</span>`;
      }).join('');
      return `<div class="opponent-hand ${open?'is-open-hand':''} ${i===state.turn?'is-turn':''}" data-player-index="${i}" data-hand-count="${cards.length}" ${open?`style="--open-hand-weight:${Math.max(6,cards.length)};--open-hand-count:${cards.length}"`:''} ${attrs}><span class="opponent-label"><span title="${esc(p.name)}">${esc(p.name)}</span><b>${cards.length}</b>${badge}</span><div class="mini-hand ${open?'is-open':''}" ${open&&!attrs?'tabindex="0"':''} aria-label="${esc(p.name)}: ${cards.length} карт${open?', открытая рука':''}">${pieces}</div></div>`;
    }).join('')}</div>`;
  }
  function hand(content, count, hint='Подсвеченные карты можно разыграть', extraControlHTML='', options={}) {
    const cards=Array.isArray(content)?content:null,fan=options.layout==='fan'&&cards?.length;
    let body=cards?cards.join(''):content;
    if(fan){
      body=`<div class="hand-fan-row ${cards.length===1?'is-single':''}" style="--fan-count:${cards.length}">${cards.join('')}</div>`;
    }
    return `<section class="own-hand" data-hand-count="${count}" aria-label="Ваша рука"><div class="hand-heading"><strong>Ваша рука <span>${count}</span></strong><span>${esc(hint)}</span>${extraControlHTML?`<div class="hand-tools">${extraControlHTML}</div>`:''}</div><div class="hand-track ${fan?'is-fan':''}">${body || '<span class="empty-hand">Все карты на столе</span>'}</div></section>`;
  }
  function source(id, actions, selected, options = {}) {
    const key = options.key || 'card', value = String(id);
    const choices = actions.filter(action => action[key] != null && String(action[key]) === value);
    const available = choices.length > 0, inspectable = !!options.inspect;
    const chosen = selected != null && String(selected) === value;
    const className = [options.className ?? 'hand-card', available ? 'is-playable' : '', chosen ? 'is-selected' : ''].filter(Boolean).join(' ');
    if (!available && !inspectable) return {choices, className, attr: 'disabled aria-disabled="true"'};
    const attrs = [];
    const immediate = options.mode === 'immediate' && choices.length === 1;
    if (!immediate || options.preview || inspectable) attrs.push(`data-select="${esc(value)}"`);
    if (available && options.drag) attrs.push(`data-drag-piece="${esc(value)}"`);
    if (options.preview) attrs.push(`data-hand-preview="${esc(value)}"`);
    attrs.push(`aria-pressed="${chosen}"`);
    if (immediate) attrs.push(actionAttr(choices[0]));
    if (available && options.swipe) attrs.push(choices.length === 1
      ? `data-swipe-action="${esc(JSON.stringify(choices[0]))}"`
      : `data-swipe-select="${esc(value)}"`);
    return {choices, className, attr: attrs.join(' ')};
  }
  function target(piece, action = null) {
    const exact = action && typeof action === 'object' && !Array.isArray(action);
    return `data-drop-piece="${esc(piece)}" ${exact ? actionAttr(action) : `data-drop-select="${esc(piece)}"`}`;
  }
  function cardAttrs(card, actions, selected) {
    return source(card.id, actions, selected, {mode: 'immediate'});
  }
  const svg = content => `<svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${content}</svg>`;
  const helpers = {esc,actionAttr,actionButton,actionBar,back,opponents,hand,source,target,cardAttrs,svg};
  function createRegistry() {
    const packs = new Map();
    return {
      register(id,render,cover){if(typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error('Invalid game view');packs.set(id,{render,cover});},
      get(id){return packs.get(id);},
      remove(id){return packs.delete(id);},
      render(state,viewer,actions,ui={}){
        try { return packs.get(state.game)?.render(state,viewer,actions,ui) || '<p class="scene-hint">Этот игровой пакет не загружен.</p>'; }
        catch (_) { return '<p class="scene-hint" role="alert">Не удалось показать игру. Вернитесь к списку игр и обновите этот пак.</p>'; }
      },
      cover(id){
        try { return packs.get(id)?.cover?.() || ''; }
        catch (_) { return '<span class="scene-hint">Предпросмотр недоступен</span>'; }
      },
      helpers
    };
  }
  return {...helpers, helpers, createRegistry};
});
