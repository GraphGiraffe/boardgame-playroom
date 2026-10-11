(function (root, factory) {
  'use strict';
  const UI = factory();
  if (typeof module === 'object' && module.exports) module.exports = UI;
  root.TabletopUI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" focusable="false" data-ui-icon="'+esc(name)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
    full:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    play:'<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    prev:'<path d="m15 6-6 6 6 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    seatType:'<rect x="5" y="3" width="14" height="9" rx="2"/><path d="M4 12v5h16v-5M6 17v4M18 17v4"/>',
    replacement:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
    player:'<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
    bot:'<rect x="4" y="7" width="16" height="14" rx="3"/><path d="M12 3v4M2 12v5M22 12v5M9 17h6"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>',
    host:'<path d="m3 6 4 4 5-6 5 6 4-4-2 13H5ZM5 16h14"/>',
    people:'<circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    pause:'<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    hand:'<path d="M8 12V5a2 2 0 0 1 4 0v7-8a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v8c0 5-3 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-3l2 2Z"/>',
    layers:'<path d="m12 3 9 5-9 5-9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
    sound:'<path d="m11 4-6 5H2v6h3l6 5Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
    reset:'<path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>',
    save:'<path d="M5 3h12l4 4v14H3V3Zm3 0v6h8V3M7 21v-8h10v8"/>',
    rules:'<path d="M4 3h12a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3Zm0 15a3 3 0 0 1 3-3h12M8 7h7M8 10h7"/>',
    edit:'<path d="m15 4 5 5M4 20l4-1L20 7a2 2 0 0 0-3-3L5 16Zm0 0h16"/>',
    connect:'<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M12 7v6M9 10h6M11 17h2"/>',
    trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 3h8m-6-3h4v3"/>',
    camera:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m7 6 2-3h6l2 3"/><circle cx="12" cy="13" r="4"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2m-6 8v4m-4 0h8"/>',
    share:'<path d="M12 15V3m-4 4 4-4 4 4M6 11H3v10h18V11h-3"/>',
    qr:'<path d="M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Zm12 0h2v2h-2Zm4 0h2v6h-6v-2h4"/>',
    text:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01"/>',
    first:'<circle cx="12" cy="12" r="9"/><path d="m10 8 2-1v10m-3 0h6"/>',
    room:'<path d="M3 21V3h13v18M7 12h.01M16 7h5v14H3"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  }[name] || '')+'</svg>';
  const actionAttr = action => `data-action="${esc(JSON.stringify(action))}"`;
  const actionButton = (action, extra = '') => `<button class="scene-button ${extra}" ${actionAttr(action)}>${esc(action.label || action.type)}</button>`;
  const actionBar = (actions, hint) => `<div class="scene-actions">${actions.map(a => actionButton(a)).join('')}${!actions.length && hint ? `<span class="scene-hint">${esc(hint)}</span>` : ''}</div>`;
  // A canonical artboard scales as a whole, including typography and frame.
  // main/compact are trusted pack HTML; neither contains interaction handlers.
  function art({main,compact,width=72,height=103,rotation=0}, variant='main') {
    if (typeof main !== 'string' || !Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0 || width>4096 || height>4096) throw Error('Invalid card artwork');
    if(![0,90,180,270].includes(rotation))throw Error('Invalid artwork rotation');
    const small=variant==='compact' && typeof compact==='string' && compact.length>0,swap=rotation===90||rotation===270;
    const transform=({0:'',90:`translate(${height} 0) rotate(90)`,180:`translate(${width} ${height}) rotate(180)`,270:`translate(0 ${width}) rotate(-90)`})[rotation];
    return `<svg class="piece-art" viewBox="0 0 ${swap?height:width} ${swap?width:height}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" data-art-variant="${small?'compact':'main'}"><g${transform?` transform="${transform}"`:''}><foreignObject width="${width}" height="${height}"><div xmlns="http://www.w3.org/1999/xhtml" class="piece-artboard" style="width:${width}px;height:${height}px">${small?compact:main}</div></foreignObject></g></svg>`;
  }
  function countBadge(count,label='Количество',{corner=false,hand=false}={}) {
    if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid piece count');
    return `<span class="piece-count${corner?' is-corner':''}${hand?' is-hand':''}${hand&&count>=100?' is-long-count':''}" data-piece-count="${count}" aria-label="${esc(label)}: ${count}">${count}</span>`;
  }
  const back = (kind = 'card') => `<span class="piece-back ${esc(kind)}-back art-card" role="img" aria-label="Закрытая карта">${art({main:'<div class="back-art-face"><span>✦</span></div>',width:69,height:99})}</span>`;
  function opponents(state, viewer, cardRender, options = {}) {
    if (!state.data.hands) return '';
    return `<div class="opponent-hands">${state.players.map((p,i) => {
      if(i===viewer)return '';
      const cards=state.data.hands[i]||[],open=cards.some(c=>!c.hidden),visible=open?cards:cards.slice(0,5);
      const attrs=options.playerAttrs?.(i,p)||'',badge=options.playerBadge?.(i,p)||'';
      const pieces=visible.map((c,index)=>{
        if(c.hidden)return back();
        const caption=options.cardLabel?.(c);
        return `<span class="public-card" data-public-card-index="${index}">${caption!=null?`<span class="public-card-caption" aria-hidden="true">${esc(caption)}</span>`:''}${cardRender(c,'disabled',{variant:'compact',surface:'opponent',interactive:false})}</span>`;
      }).join('');
      return `<div class="opponent-hand ${open?'is-open-hand':''} ${i===state.turn?'is-turn':''}" data-player-index="${i}" data-hand-count="${cards.length}" ${open?`style="--open-hand-weight:${Math.max(6,cards.length)};--open-hand-count:${cards.length}"`:''} ${attrs}><span class="opponent-label"><span title="${esc(p.name)}">${esc(p.name)}</span><b>${cards.length}</b>${badge}</span><div class="mini-hand ${open?'is-open':''}" ${open&&!attrs?'tabindex="0"':''} aria-label="${esc(p.name)}: ${cards.length} карт${open?', открытая рука':''}">${pieces}</div></div>`;
    }).join('')}</div>`;
  }
  function participantIcon(person={}, {network=false}={}) {
    const role=person.role==='table'?'grid':person.role==='spectator'?'eye':person.bot?'bot':person.local?'hand':'player';
    const status=network&&!person.bot&&!person.local&&typeof person.connected==='boolean'&&(person.connected||person.hasConnected||Number.isFinite(person.joinedAt))?(person.connected?'online':'offline'):'neutral';
    const label=({grid:'Стол',eye:'Зритель',bot:'Бот',hand:'Hotseat',player:network?'Сетевой игрок':'Игрок'})[role]+(person.isHost?' · хост':'')+(status==='online'?' · в сети':status==='offline'?' · нет связи':'')+(person.replacement?' · игрок на замену':'');
    const replacement=person.replacement?`Замена${person.replacement.previousName?' '+person.replacement.previousName:''}${person.replacement.accepted===false?' · ожидает подтверждения':''}`:'';
    return `<span class="participant-role is-${status}" data-participant-role="${role}" data-connection="${status}" role="${replacement?'button':'img'}" aria-label="${esc(replacement?`${label} · ${replacement}`:label)}" title="${esc(replacement||label)}"${replacement?` tabindex="0" data-tooltip="${esc(replacement)}" data-player-replacement="true"`:''}>${icon(role)}${person.isHost?icon('host'):''}${person.replacement?icon('replacement'):''}</span>`;
  }
  function validCounters(counters) {
    return Array.isArray(counters)&&counters.length<=2&&counters.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&['points','wins'].includes(c.kind)&&Number.isSafeInteger(c.value)&&c.value>=0&&(c.label===undefined||typeof c.label==='string'))&&new Set(counters.map(c=>c.kind)).size===counters.length;
  }
  function scoreBadge(counter) {
    if(!validCounters([counter]))throw Error('Invalid player counters');
    const label=counter.label||(counter.kind==='wins'?'Победы':'Очки');
    return `<span class="player-score is-${counter.kind}" data-score-kind="${counter.kind}" aria-label="${esc(label)}: ${counter.value}" title="${esc(label)}: ${counter.value}">${counter.value}</span>`;
  }
  function playerContent(state, viewer, cardRender, options={}) {
    return state.players.map((person,index)=>{
      const cards=state.data.hands?.[index],open=cards?.some(card=>!card.hidden);
      const visible=cards||[];
      const handHTML=index===viewer?'':visible.map((card,i)=>card.hidden?back(options.kind||'card'):`<span class="public-card" data-public-card-index="${i}">${cardRender?.(card,'disabled',{variant:'compact',surface:'opponent',interactive:false})||''}</span>`).join('');
      return {handHTML,...(options.counters?{counters:options.counters(index,person)}:{}),scoreLabel:options.scoreLabel||'очки',countLabel:options.countLabel||'в руке',...(cards?{handCount:cards.length}:{}),open:!!open,badges:options.badges?.(index,person)||[],color:options.color?.(index,person)||'',colorLabel:options.colorLabel?.(index,person)||''};
    });
  }
  function playerPanel(state,index,viewer,content={},actions=[]) {
    const person=state.players[index],own=index===viewer,target=!own&&actions.some(a=>a.target===index&&a.targetKind==='player');
    const badges=(content.badges||[]).map(b=>`<span class="player-status-badge"${typeof b==='object'&&b.motion?` data-motion-counter="${esc(b.motion)}"`:''}>${esc(typeof b==='string'?b:b.label)}</span>`).join('');
    const counters=content.counters??[{kind:content.scoreLabel==='победы'?'wins':'points',value:Number.isSafeInteger(person.score)&&person.score>=0?person.score:0,label:content.scoreLabel||'очки'}];
    if(!validCounters(counters))throw Error('Invalid player counters');
    const color=/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(content.color||'')?content.color:'';
    return `<article class="player-panel ${own?'self-player':'opponent-hand'} ${state.turn===index?'is-turn':''} ${content.open?'is-open-hand':''}" data-player-index="${index}"${state.turn===index?' aria-current="true"':''} ${target?`data-player-panel-target="${index}"`:""}${content.handCount!==undefined?` data-hand-count="${content.handCount}"`:''}>
      <${target?'button':'div'} class="player-info player-token" ${target?`type="button" data-player-target="${index}" aria-haspopup="menu" aria-expanded="false" aria-label="Действия игрока ${esc(person.name)}"`:''}>
      <span class="avatar p${index}"${color?` style="background:${esc(color)}"`:''} aria-hidden="true">${esc(person.name.slice(0,1))}</span><span class="player-details"><span class="player-heading">${participantIcon(person)}<strong>${esc(person.name)}${own?' · вы':''}</strong></span><span class="player-data"><span class="player-scores">${content.handCount!==undefined?countBadge(content.handCount,`Рука ${person.name} (${content.countLabel||'в руке'})`,{hand:true}):''}${[...counters].sort((a,b)=>(a.kind==='wins')-(b.kind==='wins')).map(scoreBadge).join('')}</span>${content.colorLabel?`<span class="player-side">${esc(content.colorLabel)}</span>`:''}${badges?`<span class="player-badges">${badges}</span>`:''}</span></span></${target?'button':'div'}>
      ${own?'<!--self-controls-->':''}${!own&&content.handCount!==undefined?`<div class="player-hand">${content.handHTML?`<div class="mini-hand ${content.open?'is-open':''}" tabindex="${content.open?'0':'-1'}" aria-label="Рука ${esc(person.name)}">${content.handHTML}</div>`:''}</div>`:''}</article>`;
  }
  function hand(content, count, hint='Подсвеченные карты можно разыграть', extraControlHTML='', options={}) {
    const cards=Array.isArray(content)?content:null,fan=options.layout==='fan'&&cards?.length,tiles=options.layout==='tiles';
    let body=cards?cards.join(''):content;
    if(fan){
      body=`<div class="hand-fan-row ${cards.length===1?'is-single':''}" style="--fan-count:${cards.length}">${cards.join('')}</div>`;
    }
    return `<section class="own-hand" data-hand-count="${count}" aria-label="Ваша рука"><div class="hand-heading"><strong>Ваша рука</strong><span>${esc(hint)}</span>${extraControlHTML?`<div class="hand-tools">${extraControlHTML}</div>`:''}</div><div class="hand-track ${tiles?'is-tiles':''} ${fan?'is-fan':''} ${(fan&&cards.length>8)||(tiles&&count>7)?'is-long-hand':''}" ${tiles?`style="--hand-columns:${Math.max(1,count)}"`:''}>${body || '<span class="empty-hand">Все карты на столе</span>'}</div></section>`;
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
  const actionGroups=({start='',primary='',end='',exclusive=false})=>`<div class="game-action-bar"${exclusive?' data-exclusive="true"':''}><div data-action-position="start"${exclusive?' inert aria-hidden="true"':''}>${start}</div><div class="scene-actions" data-action-position="primary">${primary}</div><div data-action-position="end"${exclusive?' inert aria-hidden="true"':''}>${end}</div></div>`;
  const helpers = {viewApi:2,icon,actionGroups,art,esc,actionAttr,actionButton,actionBar,back,countBadge,participantIcon,scoreBadge,opponents,playerContent,playerPanel,hand,source,target,cardAttrs,svg};
  function selectLayout(width,height){if(width>height&&height<=550)return 'phone-landscape';if(width<=760)return 'phone-portrait';return width>=1100?'desktop':'tablet';}
  const elementNames=Object.freeze(['participants','status','field','actions','hand','auxiliary']);
  function motionSequence(value){
    if(value===undefined)return '';
    const anchor=point=>point&&typeof point==='object'&&typeof point.anchor==='string'&&/^[\w-]{1,80}$/.test(point.anchor)&&(point.label===undefined||typeof point.label==='string');
    if(!value||typeof value!=='object'||typeof value.trigger!=='string'||typeof value.entity!=='string'||!Number.isInteger(value.player)||value.player<0||typeof value.counter!=='string'||!anchor(value.origin)||!Array.isArray(value.steps)||value.steps.length>100||!value.steps.every(anchor)||(value.jump!==undefined&&!anchor(value.jump)))throw Error('Invalid motion sequence');
    return ` data-motion-sequence="${esc(JSON.stringify(value))}"`;
  }
  function composeScene(value,{surface='combined',state=null,viewer=-1,actions=[]}={}) {
    if(!value||value.api!==2||!['cards','board'].includes(value.family)||!value.elements||typeof value.elements.field!=='string'||!value.elements.field.trim())throw Error('Game elements API 2 required');
    if(Object.keys(value.elements).some(key=>!elementNames.includes(key))||Object.values(value.elements).some(html=>typeof html!=='string'))throw Error('Invalid game elements');
    if(value.fieldAspect!==undefined&&(!Number.isFinite(value.fieldAspect)||value.fieldAspect<=0||value.fieldAspect>10))throw Error('Invalid field aspect');
    if(value.actionReserve!==undefined&&typeof value.actionReserve!=='boolean')throw Error('Invalid action reserve');
    const className=typeof value.className==='string'?value.className:'';
    if(surface==='table')actions=[];
    const e={...value.elements},content=value.playerContent;
    if(value.actionReserve&&surface!=='table'&&!e.actions)e.actions='<div class="scene-actions"></div>';
    if(content!==undefined&&(!Array.isArray(content)||(state?.players&&content.length!==state.players.length)||content.some(p=>!p||typeof p!=='object'||Array.isArray(p)||['scoreLabel','countLabel','color','colorLabel'].some(k=>p[k]!==undefined&&typeof p[k]!=='string')||(p.counters!==undefined&&!validCounters(p.counters))||(p.open!==undefined&&typeof p.open!=='boolean')||(p.handHTML!==undefined&&typeof p.handHTML!=='string')||(p.handCount!==undefined&&(!Number.isSafeInteger(p.handCount)||p.handCount<0))||(p.badges!==undefined&&(!Array.isArray(p.badges)||p.badges.some(b=>typeof b!=='string'&&(!b||typeof b.label!=='string')))))))throw Error('Invalid player content');
    if(value.fieldGroups!==undefined){
      const groups=value.fieldGroups;
      if(!groups||Array.isArray(groups)||typeof groups!=='object'||Object.keys(groups).some(k=>!['stock','play'].includes(k))||Object.values(groups).some(html=>typeof html!=='string')||!groups.play)throw Error('Invalid field groups');
      e.field=`<div class="game-field-groups">${['stock','play'].filter(k=>groups[k]).map(k=>`<section class="field-group field-group-${k}" data-field-group="${k}">${groups[k]}</section>`).join('')}</div>`;
    }
    const unified=!!state?.players;
    let self='';
    if(unified){
      e.participants=`<div class="players-panels opponent-hands">${state.players.map((_,i)=>i===viewer?'':playerPanel(state,i,viewer,content?.[i]||{},actions)).join('')}</div>`;
      if(viewer>=0&&surface!=='table')self=`<section class="layout-self" data-game-element="self">${playerPanel(state,viewer,viewer,content?.[viewer]||{},[])}${e.actions?`<section class="game-layout-slot layout-actions" data-game-element="actions">${e.actions}</section>`:''}${e.hand?`<section class="game-layout-slot layout-hand" data-game-element="hand">${e.hand}</section>`:''}</section>`;
    }
    const slots=elementNames.filter(name=>e[name]&&!((self||surface==='table')&&['actions','hand'].includes(name))).map(name=>`<section class="game-layout-slot layout-${name}" data-game-element="${name}"${name==='field'&&value.fieldAspect?` style="--field-aspect:${value.fieldAspect}"`:''}>${name==='field'?`<div class="game-field-content">${e[name]}</div>`:e[name]}</section>`).join('');
    return `<div class="game-scene app-game-layout ${esc(className)}" data-view-api="2"${unified?' data-player-layout="unified"':''}${value.actionReserve?' data-action-reserve="true"':''}${motionSequence(value.motionSequence)} data-layout-family="${value.family}" data-surface="${esc(surface)}">${slots}${self}</div>`;
  }

  function createRegistry() {
    const packs = new Map();
    return {
      register(id,render,cover,options={}) {
        if(typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error('Invalid game view');
        const surfaces=options?.surfaces||{};
        if(typeof surfaces!=='object'||Array.isArray(surfaces)||Object.entries(surfaces).some(([key,fn])=>!['table','player'].includes(key)||typeof fn!=='function'))throw Error('Invalid view surfaces');
        packs.set(id,{render,cover,surfaces:Object.freeze({...surfaces})});
      },
      supports(id,surface='combined'){return !!packs.get(id) && (surface==='combined'||typeof packs.get(id).surfaces[surface]==='function');},
      get(id){return packs.get(id);},
      remove(id){return packs.delete(id);},
      render(state,viewer,actions,ui={}){
        try { const item=packs.get(state.game),surface=ui.surface||'combined',render=surface==='combined'?item?.render:item?.surfaces[surface]; if(!render)return '<p class="scene-hint">Этот игровой пакет не загружен.</p>';const allowedActions=surface==='table'?[]:actions;return composeScene(render(state,viewer,allowedActions,ui),{surface,state,viewer,actions:allowedActions}); }
        catch (_) { return '<p class="scene-hint" role="alert">Не удалось показать игру. Вернитесь к списку игр и обновите этот пак.</p>'; }
      },
      cover(id){
        try { return packs.get(id)?.cover?.() || ''; }
        catch (_) { return '<span class="scene-hint">Предпросмотр недоступен</span>'; }
      },
      helpers
    };
  }
  return {...helpers,helpers,createRegistry,composeScene,elementNames,selectLayout};
});
