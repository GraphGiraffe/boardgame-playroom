if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function (root, factory) {
  'use strict';
  const Components=root.PlayroomComponents||(typeof require==='function'?require('./component-assets.js'):null);
  const GameComponents=root.PlayroomGameComponents||(typeof require==='function'?require('./game-components.js'):null);
  const UI = factory(Components,GameComponents);
  if (typeof module === 'object' && module.exports) module.exports = UI;
  root.TabletopUI = UI;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Components,GameComponents) {
  'use strict';
  const tokenLayout=globalThis.PlayroomTokenLayout||(typeof require==='function'?require('./token-layout.js'):null);
  const {firstSymbol,numberPath,numberMark}=Components;
  const assetArt=(family,params,fallback)=>{const output=globalThis.PlayroomAssetResolver?globalThis.PlayroomAssetResolver.render(family,params):fallback(params);const end=output.indexOf('>');return output.slice(0,end)+` data-asset-family="${esc(family)}"${family==='score-table'?'':` data-asset-params="${esc(JSON.stringify(params))}"`}`+output.slice(end);};
  const roundTokenArt=params=>assetArt('round-token',params||{},Components.roundTokenArt);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" focusable="false" data-ui-icon="'+esc(name)+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+({
    cards:'<path d="m4.5 6-1.4 11a3 3 0 0 0 2.6 3.3l8.9 1.3a3 3 0 0 0 3.4-2.4M4 20a3 3 0 0 0 2.3 2l7.9 1.1"/><g transform="rotate(10 13 10.4)"><rect x="7" y="2" width="12" height="16.8" rx="2.4"/><path d="M10.5 7h5l-3.6 6.8"/></g>',
    board:'<g transform="rotate(10 12 12)"><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/></g>',
    pieces:"<circle cx=\"9\" cy=\"14\" r=\"7\"/><path d=\"M7 5a7 7 0 1 1 12 11M5 14a4 4 0 0 0 4 4\"/>",
    solitaire:"<rect x=\"2\" y=\"3\" width=\"6\" height=\"9\" rx=\"1\"/><rect x=\"10\" y=\"3\" width=\"6\" height=\"9\" rx=\"1\"/><path d=\"M4 15v6h6m2-6v6h6m0-18h4v9h-4\"/>",
    words:"<path d=\"m3 19 6-14 6 14M5 14h8M17 5h5m-2.5 0v14\"/>",
    puzzle:"<path d=\"M3 3h6a3 3 0 1 1 6 0h6v6a3 3 0 1 0 0 6v6h-6a3 3 0 1 0-6 0H3v-6a3 3 0 1 1 0-6Z\"/>",
    duel:"<circle cx=\"6\" cy=\"6\" r=\"3\"/><circle cx=\"18\" cy=\"6\" r=\"3\"/><path d=\"M1 21v-5a5 5 0 0 1 10 0v5m2 0v-5a5 5 0 0 1 10 0v5\"/>",
    three:"<circle cx=\"12\" cy=\"5\" r=\"2.5\"/><circle cx=\"4\" cy=\"10\" r=\"2.5\"/><circle cx=\"20\" cy=\"10\" r=\"2.5\"/><path d=\"M8 19v-7a4 4 0 0 1 8 0v7M1 22v-6a3 3 0 0 1 6 0v6m10 0v-6a3 3 0 0 1 6 0v6\"/>",
    teams:"<circle cx=\"4\" cy=\"5\" r=\"2\"/><circle cx=\"9\" cy=\"8\" r=\"2\"/><circle cx=\"15\" cy=\"8\" r=\"2\"/><circle cx=\"20\" cy=\"5\" r=\"2\"/><path d=\"M1 17v-5a3 3 0 0 1 6 0m-1 7v-5a3 3 0 0 1 6 0v5m0 0v-5a3 3 0 0 1 6 0v5m-1-7a3 3 0 0 1 6 0v5M1 22h9m4 0h9\"/>",
    star:"<path d=\"m12 2 3 6 7 1-5 5 1 8-6-4-6 4 1-8-5-5 7-1Z\"/>",
    shuffle:"<path d=\"M3 6h2c6 0 8 12 14 12h3m-4-4 4 4-4 4M3 18h2c2 0 4-2 6-5m2-3c2-3 4-4 6-4h3m-4-4 4 4-4 4\"/>",
    ship:"<path d=\"M2 16h20l-4 5H6ZM8 15V8h8v7m-4-7V3m0 2h5\"/>",
    sword:'<path d="m4 20 4-4m-3-3 6 6m-4-4L17 3h4v4L11 17M9 15 19 5"/>',
    shield:'<path d="M12 3 4 6v5c0 5 3 8 8 10 5-2 8-5 8-10V6Z"/>',
    takeCards:'<path d="m8 7-2-4 6 2 6-2-2 4M8 8h8M8 10c-3 3-5 6-5 9 0 2 3 2 9 2s9 0 9-2c0-3-2-6-5-9Z"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    history:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2"/>',
    help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4M12 17h.01"/>',
    full:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
    copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h3"/>',
    palette:'<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.5 1.5 0 0 1 1.1-2.6H18a3 3 0 0 0 3-3 9 9 0 0 0-9-9Z"/><circle cx="7.5" cy="10" r=".8" fill="currentColor"/><circle cx="10.5" cy="7" r=".8" fill="currentColor"/><circle cx="15" cy="7.5" r=".8" fill="currentColor"/>',
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    play:'<path d="m9 5 10 7-10 7Z" fill="currentColor" stroke="none"/>',
    arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
    back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
    next:'<path d="m9 6 6 6-6 6"/>',
    prev:'<path d="m15 6-6 6 6 6"/>',
    up:'<path d="m6 15 6-6 6 6"/>',
    down:'<path d="m6 9 6 6 6-6"/>',
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
    rules:'<path d="M12 5C8 2 4 2 2 3v16c3-1 7 0 10 2 3-2 7-3 10-2V3c-2-1-6-1-10 2Zm0 0v16M5 7l4 1m-4 3 4 1m6-4 4-1m-4 5 4-1"/>',
    edit:'<path d="m14 5 5 5M4 20l1-6L16 3a2.12 2.12 0 0 1 3 0l2 2a2.12 2.12 0 0 1 0 3L10 19Zm1-6 5 5"/>',
addPlayer:'<circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M19 7v8m-4-4h8"/>',
    stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
        connect:'<rect x="2" y="4" width="12" height="10" rx="2"/><path d="M5 18h5M8 14v4M18 3v6M15 6h6"/><rect x="14" y="11" width="7" height="10" rx="1"/>',
    trophy:'<path d="M8 3h8v6a4 4 0 0 1-8 0ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 2v5m-4 3h8m-6-3h4v3"/>',
    camera:'<rect x="3" y="6" width="18" height="15" rx="3"/><path d="m7 6 2-3h6l2 3"/><circle cx="12" cy="13" r="4"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 3-3 6 6"/>',
    mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2m-6 8v4m-4 0h8"/>',
    share:'<path d="M12 15V3m-4 4 4-4 4 4M6 11H3v10h18V11h-3"/>',
    qr:'<path d="M3 3h6v6H3Zm12 0h6v6h-6ZM3 15h6v6H3Zm12 0h2v2h-2Zm4 0h2v6h-6v-2h4"/>',
    text:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',
    chevron:'<path d="m6 9 6 6 6-6"/>',
    dice:'<path d="M7 9H4a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1M5.5 12h.01M5.5 17h.01M10 17h.01"/><g transform="rotate(10 15 9)"><rect x="9" y="3" width="12" height="12" rx="2"/><path d="M12 6h.01M15 9h.01M18 12h.01"/></g>',
    first:firstSymbol(),
    exit:'<path d="M10 4H3v16h7M10 12h11m-4-4 4 4-4 4"/>',
    room:'<path d="M3 21V3h13v18M7 12h.01M16 7h5v14H3"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'
  }[name] || '')+'</svg>';
  const actionAttr = action => `data-action="${esc(JSON.stringify(action))}"`;
  const actionButton = (action, extra = '') => `<button class="scene-button ${extra}" ${actionAttr(action)}>${esc(action.label || action.type)}</button>`;
  const actionBar = (actions, hint) => `<div class="scene-actions">${actions.map(a => actionButton(a)).join('')}${!actions.length && hint ? `<span class="scene-hint">${esc(hint)}</span>` : ''}</div>`;
  // A canonical artboard scales as a whole, including typography and frame.
  // main/compact are trusted pack HTML; neither contains interaction handlers.
  const {art}=GameComponents;
  const countBadge=(value,label,options={})=>assetArt('counter',{value,label,...options},params=>GameComponents.countBadge(params.value,params.label,params));
  const shipSilhouette=size=>assetArt('ship',{size},params=>GameComponents.shipSilhouette(params.size));
  const back = (kind = 'card') => `<span class="piece-back ${esc(kind)}-back art-card" role="img" aria-label="${globalThis.PlayroomMessages.text("ui.ui.c13a6680430c")}">${assetArt('card-back',{main:'<div class="back-art-face"><span>✦</span></div>',width:69,height:99},GameComponents.cardFace)}</span>`;
  // Display indices only: game indices and private hands remain unchanged.
  function seatOrder(count,viewer=-1,sequence=null){
    const own=Number.isInteger(viewer)&&viewer>=0&&viewer<count;
    const order=Array.isArray(sequence)&&sequence.length===count&&new Set(sequence).size===count&&sequence.every(index=>Number.isInteger(index)&&index>=0&&index<count)?sequence:Array.from({length:count},(_,index)=>index);
    const start=own?order.indexOf(viewer)+1:0;return Array.from({length:own?count-1:count},(_,i)=>order[(start+i)%count]);
  }
  function playerOrderPosition(state,index){return (index-(Number.isInteger(state.firstPlayer)?state.firstPlayer:0)+state.players.length)%state.players.length+1;}
  function opponents(state, viewer, cardRender, options = {}) {
    if (!state.data.hands) return '';
    return `<div class="opponent-hands">${seatOrder(state.players.length,viewer).map(i => {
      const p=state.players[i];
      const cards=state.data.hands[i]||[],open=cards.some(c=>!c.hidden),visible=open?cards:cards.slice(0,5);
      const attrs=options.playerAttrs?.(i,p)||'',badge=options.playerBadge?.(i,p)||'';
      const pieces=visible.map((c,index)=>{
        if(c.hidden)return back();
        const caption=options.cardLabel?.(c);
        return `<span class="public-card" data-public-card-index="${index}">${caption!=null?`<span class="public-card-caption" aria-hidden="true">${esc(caption)}</span>`:''}${cardRender(c,'disabled',{variant:'compact',surface:'opponent',interactive:false})}</span>`;
      }).join('');
      return `<div class="opponent-hand ${open?'is-open-hand':''} ${i===state.turn?'is-turn':''}" data-player-index="${i}" data-hand-count="${cards.length}" ${open?`style="--open-hand-weight:${Math.max(6,cards.length)};--open-hand-count:${cards.length}"`:''} ${attrs}><span class="opponent-label"><span title="${esc(p.name)}">${esc(p.name)}</span><b>${cards.length}</b>${badge}</span><div class="mini-hand ${open?'is-open':''}" ${open&&!attrs?'tabindex="0"':''} aria-label="${esc(p.name)}: ${cards.length} ${globalThis.PlayroomMessages.text("ui.ui.aba0cb7c22ba")}${open?globalThis.PlayroomMessages.text("ui.ui.c155161522ac"):''}">${pieces}</div></div>`;
    }).join('')}</div>`;
  }
  function participantIcon(person={}, {network=false}={}) {
    const role=person.role==='table'?'grid':person.role==='spectator'?'eye':person.bot?'bot':person.local?'hand':'player';
    const status=network&&!person.bot&&!person.local&&typeof person.connected==='boolean'&&(person.connected||person.hasConnected||Number.isFinite(person.joinedAt))?(person.connected?'online':'offline'):'neutral';
    const label=globalThis.PlayroomMessages.text("ui.ui.be876869eb2e",{p0:String(({grid:globalThis.PlayroomMessages.text("ui.ui.da639244db1d"),eye:globalThis.PlayroomMessages.text("ui.ui.9ae566816505"),bot:globalThis.PlayroomMessages.text("ui.ui.aa691043b447"),hand:'Hotseat',player:network?globalThis.PlayroomMessages.text("ui.ui.c0562fc31385"):globalThis.PlayroomMessages.text("ui.ui.f54f58cf08df")})[role]),p1:String(person.isHost?globalThis.PlayroomMessages.text("ui.ui.32c4ccc5277d"):''),p2:String(status==='online'?globalThis.PlayroomMessages.text("ui.ui.b74f9d035c25"):status==='offline'?globalThis.PlayroomMessages.text("ui.ui.1a19fe2fb654"):''),p3:String(person.replacement?globalThis.PlayroomMessages.text("ui.ui.389e565be3fa"):'')});
    const replacement=person.replacement?globalThis.PlayroomMessages.text("ui.ui.f4420ff3ee50",{p0:String(person.replacement.previousName?' '+person.replacement.previousName:''),p1:String(person.replacement.accepted===false?globalThis.PlayroomMessages.text("ui.ui.b8f9ffc5334a"):'')}):'';
    return `<span class="participant-role is-${status}" data-participant-role="${role}" data-connection="${status}" role="${replacement?'button':'img'}" aria-label="${esc(replacement?`${label} · ${replacement}`:label)}" title="${esc(replacement||label)}"${replacement?` tabindex="0" data-tooltip="${esc(replacement)}" data-player-replacement="true"`:''}>${person.isHost?icon('host'):''}${icon(role)}${person.replacement?icon('replacement'):''}</span>`;
  }
  function viewPreferences(game,viewer,key,value){const storageKey='playroom.view-preferences.v1:'+game+':'+viewer;try{const data=JSON.parse(globalThis.localStorage.getItem(storageKey)||'{}');if(key&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)&&typeof value==='string'&&value.length<=80){data[key]=value;globalThis.localStorage.setItem(storageKey,JSON.stringify(data));}return data&&typeof data==='object'?data:{};}catch(_){return {};}}
  function validIndicators(items){return Array.isArray(items)&&items.length<=8&&items.every(x=>x&&['ship','cards','pieces','dice'].includes(x.icon)&&Number.isSafeInteger(x.value)&&x.value>=0&&typeof x.label==='string'&&(x.size===undefined||Number.isInteger(x.size)&&x.size>=1&&x.size<=8)&&(x.dragPiece===undefined||typeof x.dragPiece==='string'&&x.dragPiece.length<=40)&&(x.complete===undefined||typeof x.complete==='boolean')&&(x.selected===undefined||typeof x.selected==='boolean')&&(x.vertical===undefined||typeof x.vertical==='boolean'));}
  function indicators(items=[]){if(!validIndicators(items))throw Error('Invalid player indicators');return `<span class="player-indicators">${items.map(x=>`<span class="player-indicator${x.icon==='ship'&&x.size?' fleet-indicator':''}${x.icon==='ship'&&x.value===0?' is-empty':''}${x.complete?' is-complete':''}${x.selected?' is-selected':''}"${x.dragPiece?` data-select="${esc(x.dragPiece)}" data-drag-piece="${esc(x.dragPiece)}" data-drag-shape="${x.size}:${x.vertical?'v':'h'}"${x.icon==='ship'&&x.size?` data-drag-segment="${Math.floor(x.size/2)}"`:''} role="button" tabindex="0"`:''} aria-label="${esc(x.label)}: ${x.value}" title="${esc(x.label)}: ${x.value}">${x.icon==='ship'&&x.size?shipSilhouette(x.size):icon(x.icon)}${x.size&&x.icon!=='ship'?`<span class="indicator-size" aria-hidden="true">${'▪'.repeat(x.size)}</span>`:''}<b>${x.value}</b></span>`).join('')}</span>`;}
  function avatar(person,index=0,{color=null,hidden=false}={}){const name=person.name||person.nickname||'';return `<span class="avatar p${index}"${color?` style="background:${esc(color)}"`:''} ${hidden?'aria-hidden="true"':`role="img" aria-label="${esc(name)}" title="${esc(name)}"`}>${globalThis.PlayroomAvatars?.content(person.avatar,name)??esc(Array.from(name)[0]||'')}</span>`;}
  function validCounters(counters) {
    return Array.isArray(counters)&&counters.length<=3&&counters.every(c=>c&&typeof c==='object'&&!Array.isArray(c)&&['points','wins','pieces'].includes(c.kind)&&Number.isSafeInteger(c.value)&&c.value>=0&&(c.label===undefined||typeof c.label==='string'))&&new Set(counters.map(c=>c.kind)).size===counters.length;
  }
  function scoreBadge(counter) {
    if(!validCounters([counter]))throw Error('Invalid player counters');
    const label=counter.label||(counter.kind==='wins'?globalThis.PlayroomMessages.text("ui.ui.8e5f4bb5654f"):counter.kind==='pieces'?globalThis.PlayroomMessages.text("ui.ui.24b775243171"):globalThis.PlayroomMessages.text("ui.ui.6cc0ad965516"));
    return assetArt('counter',{style:'score',...counter,label},params=>GameComponents.scoreBadge(params,{roundTokenArt:Components.roundTokenArt}));
  }
  function teamFor(layouts,preset,seat){
    const layout=layouts?.[preset];
    if(!layout||!Array.isArray(layout.seatTeams)||layout.seatTeams.length>32||!Array.isArray(layout.teams)||layout.teams.length>16||!Number.isInteger(seat)||seat<0)return null;
    const team=layout.teams.find(team=>team&&typeof team.id==='string'&&team.id===layout.seatTeams[seat]);
    return team&&typeof team.label==='string'&&(typeof team.color==='string'||typeof team.colorRole==='string')?team:null;
  }
  function playerMedallion({first=false,team=null,place=null,layout=null}={}) {
    if(!first&&!team&&place==null)return '';
    const label=team?(first?globalThis.PlayroomMessages.text("ui.ui.5a0a57b96032",{p0:String(team.label)}):globalThis.PlayroomMessages.text("ui.ui.a0547497e28d",{p0:String(team.label)})):first?globalThis.PlayroomMessages.text("ui.ui.374e683d6421"):globalThis.PlayroomMessages.text("ui.ui.5e20b8d4db80",{p0:String(place)});
    const tone=team?'team':place!=null?'place':'first';
    const literal=team&&/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(team.color||'')?team.color:'';
    const color=team&&/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(team.colorRole||'')?'var(--color-'+team.colorRole.replaceAll('.','-')+','+(literal||'currentColor')+')':literal;
    return `<span class="player-medallion is-${tone}${place!=null?` place-${place}`:''}" role="img" aria-label="${esc(label)}" title="${esc(label)}"${color||layout?` style="${color?`--medallion-color:${esc(color)};`:''}${layout?`left:${layout.x}px;top:${layout.y}px;z-index:${layout.z};`:''}"`:''}>${roundTokenArt({value:place,first})}</span>`;
  }
  function playerContent(state, viewer, cardRender, options={}) {
    return state.players.map((person,index)=>{
      const semantic=state.scene?.players?.find(player=>(player.player??player.id)===index);
      const metrics=semantic?.metrics?.filter(metric=>['points','wins','pieces'].includes(metric.kind));
      const cards=semantic?.hand||state.data?.hands?.[index],open=cards?.some(card=>!card.hidden);
      const visible=cards||[];
      const handHTML=index===viewer?'':visible.map((card,i)=>card.hidden?(options.backRender?.()||back(options.kind||'card')):`<span class="public-card" data-public-card-index="${i}">${cardRender?.(card,'disabled',{variant:'compact',surface:'opponent',interactive:false})||''}</span>`).join('');
      return {handHTML,orderPosition:semantic?.orderPosition??playerOrderPosition(state,index),indicators:options.indicators?.(index,person)||semantic?.indicators||[],...(metrics?{counters:metrics.map(({id,kind,value,label})=>({id,kind,value,label}))}:options.counters?{counters:options.counters(index,person)}:{}),scoreLabel:options.scoreLabel||globalThis.PlayroomMessages.text("ui.ui.d7ab0767bbee"),countLabel:options.countLabel||globalThis.PlayroomMessages.text("ui.ui.c81b450ffa45"),...(cards?{handCount:cards.length,handMetricId:'hand-count'}:{}),open:!!open,badges:options.badges?.(index,person)||[],team:semantic?.team||options.team?.(index,person)||null,color:options.color?.(index,person)||'',colorLabel:options.colorLabel?.(index,person)||''};
    });
  }
  function playerPanel(state,index,viewer,content={},actions=[]) {
    const orderPosition=Number.isInteger(content.orderPosition)&&content.orderPosition>=1&&content.orderPosition<=8?content.orderPosition:playerOrderPosition(state,index);
    const person=state.players[index],own=index===viewer,target=!own&&actions.some(a=>a.target===index&&a.targetKind==='player');
    const avatarBadges=(content.badges||[]).filter(b=>b?.position==='avatar-bottom').map(b=>`<span class="player-avatar-label${b.icon?' is-icon':''}" role="img" aria-label="${esc(b.label)}" title="${esc(b.label)}">${b.icon?icon(b.icon):esc(b.label)}</span>`).join('');
    const badges=(content.badges||[]).filter(b=>b?.position!=='avatar-bottom').map(b=>`<span class="player-status-badge ${typeof b==='object'&&['success','danger'].includes(b.tone)?'is-'+b.tone:''}"${typeof b==='object'&&b.motion?` data-motion-counter="${esc(b.motion)}"`:''}>${typeof b==='object'&&b.icon?`<span class="player-status-icon" role="img" aria-label="${esc(b.label)}" title="${esc(b.label)}" tabindex="0" data-tooltip="${esc(b.label)}">${icon(b.icon)}</span>`:esc(typeof b==='string'?b:b.label)}</span>`).join('');
    const counters=content.counters??[{kind:content.scoreKind||'points',value:Number.isSafeInteger(person.score)&&person.score>=0?person.score:0,label:content.scoreLabel||globalThis.PlayroomMessages.text("ui.ui.d7ab0767bbee")}];
    if(!validCounters(counters))throw Error('Invalid player counters');
    const color=/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(content.color||'')?content.color:'';
    return `<article class="player-panel ${own?'self-player':'opponent-hand'} ${state.turn===index?'is-turn':''} ${content.open?'is-open-hand':''}" data-player-index="${index}"${state.turn===index?' aria-current="true"':''} ${target?`data-player-panel-target="${index}"`:""}${content.handCount!==undefined?` data-hand-count="${content.handCount}" style="--mini-hand-count:${Math.max(1,content.handCount)}"`:''}>
      <${target?'button':'div'} class="player-info player-token" ${target?`type="button" data-player-target="${index}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(globalThis.PlayroomMessages.text("ui.ui.ccc8d5ca0326",{name:person.name}))}"`:''}>
      <span class="player-avatar-wrap">${avatar(person,index,{color,hidden:true})}${playerMedallion({first:state.firstPlayer===index,team:content.team})}${avatarBadges}</span><span class="player-details"><span class="player-heading">${participantIcon(person)}<strong>${esc(person.name)}${own?globalThis.PlayroomMessages.text("ui.ui.13292d3eac84"):''}</strong><span class="player-turn-position" aria-label="${globalThis.PlayroomMessages.text("ui.ui.ec2c9f35dee9")}${orderPosition}">${orderPosition}</span></span><span class="player-data"><span class="player-scores">${content.handCount!==undefined?countBadge(content.handCount,globalThis.PlayroomMessages.text("ui.ui.aac1090346a5",{p0:String(person.name),p1:String(content.countLabel||globalThis.PlayroomMessages.text("ui.ui.c81b450ffa45"))}),{hand:true}):''}${[...counters].sort((a,b)=>(a.kind==='wins')-(b.kind==='wins')).map(scoreBadge).join('')}</span>${indicators(content.indicators)}${content.colorLabel?`<span class="player-side">${esc(content.colorLabel)}</span>`:''}${badges?`<span class="player-badges">${badges}</span>`:''}</span></span></${target?'button':'div'}>
      ${own?'<!--self-controls-->':''}${!own&&content.handCount!==undefined?`<div class="player-hand">${content.handHTML?`<div class="mini-hand ${content.open?'is-open':''}" tabindex="${content.open?'0':'-1'}" aria-label="${globalThis.PlayroomMessages.text("ui.ui.e7e0d10b26d3")}${esc(person.name)}">${content.handHTML}</div>`:''}</div>`:''}</article>`;
  }
  function hand(content, count, hint=globalThis.PlayroomMessages.text("ui.ui.473a2525ab0a"), extraControlHTML='', options={}) {
    const cards=Array.isArray(content)?content:null,fan=options.layout==='fan'&&cards?.length,tiles=options.layout==='tiles';
    let body=cards?cards.join(''):content;
    if(fan){
      body=`<div class="hand-fan-row ${cards.length===1?'is-single':''}" style="--fan-count:${cards.length}">${cards.join('')}</div>`;
    }
    return `<section class="own-hand" data-hand-count="${count}" aria-label="${globalThis.PlayroomMessages.text("ui.ui.2d10172eed3f")}"><div class="hand-heading"><strong>${globalThis.PlayroomMessages.text("ui.ui.2d10172eed3f")}</strong><span>${esc(hint)}</span>${extraControlHTML?`<div class="hand-tools">${extraControlHTML}</div>`:''}</div><div class="hand-track ${tiles?'is-tiles':''} ${fan?'is-fan':''} ${(fan&&cards.length>8)||(tiles&&count>7)?'is-long-hand':''}" ${tiles?`style="--hand-columns:${Math.max(1,count)}"`:''}>${body || ("<span class=\"empty-hand\">"+globalThis.PlayroomMessages.text("ui.ui.8c687618fd99")+"</span>")}</div></section>`;
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
  function translator(catalogs) {
    const Localization = globalThis.PlayroomLocalization;
    if (!Localization) throw Error('Localization module is required');
    return new Localization.Translator({catalogs});
  }
  const helpers = {viewApi:2,tokenLayout,assetArt,components:GameComponents,translator,teamFor,seatOrder,viewPreferences,indicators,avatar,playerMedallion,roundTokenArt,numberPath,numberMark,icon,actionGroups,art,esc,actionAttr,actionButton,actionBar,back,countBadge,participantIcon,scoreBadge,opponents,playerContent,playerPanel,hand,source,target,cardAttrs,svg};
  function selectLayout(width,height){if(width>height&&height<=550)return 'phone-landscape';if(width<=760)return 'phone-portrait';return width>=1100?'desktop':'tablet';}
  const elementNames=Object.freeze(['participants','status','field','actions','hand','auxiliary','shared']);
  function motionSequence(value){
    if(value===undefined)return '';
    const anchor=point=>point&&typeof point==='object'&&typeof point.anchor==='string'&&/^[\w-]{1,80}$/.test(point.anchor)&&(point.label===undefined||typeof point.label==='string');
    if(!value||typeof value!=='object'||typeof value.trigger!=='string'||typeof value.entity!=='string'||!Number.isInteger(value.player)||value.player<0||typeof value.counter!=='string'||!anchor(value.origin)||!Array.isArray(value.steps)||value.steps.length>100||!value.steps.every(anchor)||(value.jump!==undefined&&!anchor(value.jump)))throw Error('Invalid motion sequence');
    return ` data-motion-sequence="${esc(JSON.stringify(value))}"`;
  }
  // Public Table commands are supplied by the authority/model projection.
  // Layout does not grant a spectator the identity of an acting player.
  function tableCommands(state, actions) {
    return (state?.tableActions || []).filter(command => actions.some(action =>
      Object.keys(command).every(key => JSON.stringify(command[key]) === JSON.stringify(action[key]))));
  }
  function composeScene(value,{surface='combined',state=null,viewer=-1,actions=[],selection=null,seating='auto',seatingPolicy=null}={}) {
    if(!value||value.api!==2||!['cards','board'].includes(value.family)||!value.elements||typeof value.elements.field!=='string'||!value.elements.field.trim())throw Error('Game elements API 2 required');
    if(Object.keys(value.elements).some(key=>!elementNames.includes(key))||Object.values(value.elements).some(html=>typeof html!=='string'))throw Error('Invalid game elements');
    if(value.fieldAspect!==undefined&&(!Number.isFinite(value.fieldAspect)||value.fieldAspect<=0||value.fieldAspect>10))throw Error('Invalid field aspect');
    if(value.fieldSizing!==undefined&&!['fit','content','scroll'].includes(value.fieldSizing))throw Error('Invalid field sizing');
    if(['content','scroll'].includes(value.fieldSizing)&&value.fieldAspect!==undefined)throw Error('Content fields cannot set fieldAspect');
    if(value.actionReserve!==undefined&&typeof value.actionReserve!=='boolean')throw Error('Invalid action reserve');
    const layout=value.layout||{};
    const seatNames=['north','north-west','north-east','west','east','south-west','south-east','south'];
    if(!layout||typeof layout!=='object'||Array.isArray(layout)||Object.keys(layout).some(key=>!['focus','seats','duplicateSelf'].includes(key))||layout.focus!==undefined&&!['hands','field','balanced'].includes(layout.focus)||layout.duplicateSelf!==undefined&&typeof layout.duplicateSelf!=='boolean'||layout.seats!==undefined&&(!Array.isArray(layout.seats)||layout.seats.length!==state?.players?.length||!layout.seats.every(seat=>seatNames.includes(seat))))throw Error('Invalid layout policy');
    const focus=layout.focus||(value.family==='board'?'field':'balanced');
    const strategy=seatingPolicy==='row'||(state?.players?.length||0)<=2||seating==='row'?'row':'anchors';
    const anchored=strategy==='anchors',circular=strategy!=='row'&&surface!=='player'&&(state?.players?.length||0)>=2;
    const opponentHands=(value.playerContent||[]).some((p,i)=>i!==viewer&&(Number.isInteger(p.handCount)?p.handCount>0:!!p.handHTML));
    const className=typeof value.className==='string'?value.className:'';
    if(surface==='table')actions=tableCommands(state,actions);
    const e={...value.elements},content=value.playerContent;
    // A hidden public field must not take a selected private card's targets away.
    if(surface==='player'&&selection!==null){
      const missing=actions.filter(action=>String(action.card)===String(selection)&&!(e.actions||'').includes(actionAttr(action)));
      if(missing.length)e.actions=(e.actions||'')+actionBar(missing);
    }
    if(value.actionReserve&&(surface!=='table'||state?.modelProjection?.audience==='public')&&!e.actions)e.actions='<div class="scene-actions"></div>';
    if(content!==undefined&&(!Array.isArray(content)||(state?.players&&content.length!==state.players.length)||content.some(p=>!p||typeof p!=='object'||Array.isArray(p)||['scoreLabel','countLabel','color','colorLabel'].some(k=>p[k]!==undefined&&typeof p[k]!=='string')||(p.team!==undefined&&p.team!==null&&(!p.team||typeof p.team.label!=='string'||(typeof p.team.color!=='string'&&typeof p.team.colorRole!=='string')))||(p.indicators!==undefined&&!validIndicators(p.indicators))||(p.counters!==undefined&&!validCounters(p.counters))||(p.open!==undefined&&typeof p.open!=='boolean')||(p.handHTML!==undefined&&typeof p.handHTML!=='string')||(p.handCount!==undefined&&(!Number.isSafeInteger(p.handCount)||p.handCount<0))||(p.badges!==undefined&&(!Array.isArray(p.badges)||p.badges.some(b=>typeof b!=='string'&&(!b||typeof b.label!=='string'||(b.position!==undefined&&b.position!=='avatar-bottom')||(b.icon!==undefined&& !['sword','shield','takeCards'].includes(b.icon)))))))))throw Error('Invalid player content');
    if(value.fieldGroups!==undefined){
      const groups=value.fieldGroups;
      if(!groups||Array.isArray(groups)||typeof groups!=='object'||Object.keys(groups).some(k=>!['stock','play'].includes(k))||Object.values(groups).some(html=>typeof html!=='string')||!groups.play)throw Error('Invalid field groups');
      e.field=`<div class="game-field-groups">${['stock','play'].filter(k=>groups[k]).map(k=>`<section class="field-group field-group-${k}" data-field-group="${k}">${groups[k]}</section>`).join('')}</div>`;
    }
    const unified=!!state?.players;
    let self='';
    if(unified){
      const order=seatOrder(state.players.length,viewer);
      if(circular&&viewer>=0&&surface!=='table')order.push(viewer);
      const panels=order.map(i=>({player:i,html:playerPanel(state,i,viewer,content?.[i]||{},actions)}));
      if(circular){
        const groups=new Map();
        for(const panel of panels){
          const relative=viewer>=0?(panel.player-viewer+state.players.length)%state.players.length:panel.player;
          const seat=layout.seats?.[panel.player]||['south-east','south-west','north-west','north-east'][Math.ceil(relative*4/state.players.length)%4];
          if(!groups.has(seat))groups.set(seat,[]);groups.get(seat).push(panel.html.replace(`data-player-index="${panel.player}"`,`data-player-index="${panel.player}" data-seat="${seat}"${panel.player===viewer?` data-seat-copy="true"${layout.duplicateSelf?'':' data-portrait-copy="true"'}`:''}`));
        }
        e.participants=`<div class="players-panels opponent-hands">${[...groups].map(([seat,html])=>`<div class="seat-group seat-${seat}" data-seat-group="${seat}">${(seat.endsWith('west')?html.reverse():html).join('')}</div>`).join('')}</div>`;
      }else e.participants=`<div class="players-panels opponent-hands">${panels.map(panel=>panel.html).join('')}</div>`;
      if(viewer>=0&&surface!=='table')self=`<section class="layout-self" data-game-element="self">${playerPanel(state,viewer,viewer,content?.[viewer]||{},[])}${e.actions?`<section class="game-layout-slot layout-actions" data-game-element="actions">${e.actions}</section>`:''}${e.hand?`<section class="game-layout-slot layout-hand" data-game-element="hand">${e.hand}</section>`:''}</section>`;
    }
    const slots=elementNames.filter(name=>e[name]&&!(self&&['actions','hand'].includes(name))&&!(surface==='table'&&(name==='hand'||name==='actions'&&state?.modelProjection?.audience!=='public'))).map(name=>`<section class="game-layout-slot layout-${name}" data-game-element="${name}"${name==='field'&&value.fieldAspect?` style="--field-aspect:${value.fieldAspect}"`:''}>${name==='field'?`<div class="game-field-content">${e[name]}</div>`:e[name]}</section>`).join('');
    return `<div class="game-scene app-game-layout ${esc(className)}" data-view-api="2" data-player-count="${state?.players?.length||0}" data-layout-focus="${focus}" data-seating="${circular?'circle':'row'}" data-seat-anchors-available="true" data-seat-style="${anchored?'anchors':'edge'}" data-opponent-hands="${!!opponentHands}"${anchored?' data-seat-anchors="true"':''} data-has-hand="${!!e.hand&&(content?.[viewer]?.handCount===undefined||content[viewer].handCount>0)}"${unified?' data-player-layout="unified"':''}${value.actionReserve?' data-action-reserve="true"':''}${motionSequence(value.motionSequence)} data-field-sizing="${value.fieldSizing||'fit'}" data-layout-family="${value.family}" data-surface="${esc(surface)}">${slots}${self}</div>`;
  }

  function createRegistry() {
    const packs = new Map();
    return {
      register(id,render,cover,options={}) {
        if(typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error('Invalid game view');
        const surfaces=options?.surfaces||{};
        if(typeof surfaces!=='object'||Array.isArray(surfaces)||Object.entries(surfaces).some(([key,fn])=>!['table','player'].includes(key)||typeof fn!=='function'))throw Error('Invalid view surfaces');
        if(options.reveal!==undefined&&typeof options.reveal!=='function')throw Error('Invalid reveal renderer');
        if(options.seating!==undefined&&options.seating!=='row')throw Error('Invalid seating policy');
        packs.set(id,{render,cover,reveal:options.reveal,seating:options.seating,surfaces:Object.freeze({...surfaces})});
      },
      reveal(id,value){try{return packs.get(id)?.reveal?.(value)||'';}catch(_){return '';}},
      supports(id,surface='combined'){return !!packs.get(id) && (surface==='combined'||typeof packs.get(id).surfaces[surface]==='function');},
      get(id){return packs.get(id);},
      remove(id){return packs.delete(id);},
      render(state,viewer,actions,ui={}){
        try { const item=packs.get(state.game),surface=ui.surface||'combined',render=surface==='combined'?item?.render:item?.surfaces[surface]; if(!render)return ("<p class=\"scene-hint\">"+globalThis.PlayroomMessages.text("ui.ui.31b2f9c7d8e5")+"</p>");const allowedActions=surface==='table'?tableCommands(state,actions):actions;return composeScene(render(state,viewer,allowedActions,ui),{surface,state,viewer,actions:allowedActions,selection:ui.selected,seatingPolicy:item.seating,seating:ui.seating||globalThis.PlayroomAppBridge?.gameOptions?.(state.game).seating||'auto'}); }
        catch (_) { return ("<p class=\"scene-hint\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.ui.a3179ce31aab")+"</p>"); }
      },
      cover(id){
        try { return packs.get(id)?.cover?.() || ''; }
        catch (_) { return ("<span class=\"scene-hint\">"+globalThis.PlayroomMessages.text("ui.ui.dfbd4a35e748")+"</span>"); }
      },
      helpers
    };
  }
  return {...helpers,helpers,createRegistry,composeScene,elementNames,selectLayout};
});
