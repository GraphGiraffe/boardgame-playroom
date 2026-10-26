/* Hub and archive Web rendering. State and application operations are ports. */
(function(root){root.PlayroomHubPresenter={create(ports){
const pageScroll={games:0,sessions:0};
let restoringScroll=false;
const visibleHubTab=()=>ports.$('#hub-games-page.is-active')?'games':ports.$('#hub-sessions-page.is-active')?'sessions':null;
root.addEventListener('scroll',()=>{
  const tab=visibleHubTab();
  if(tab&&!restoringScroll)pageScroll[tab]=root.scrollY;
},{passive:true});
function orderedVisibleGames(){
    const p=globalThis.PlayroomPackManager?.displayPreferences()||{order:[],hidden:[],favorites:[]};
    const order=id=>{const i=p.order.indexOf(id);return i<0?p.order.length+ports.E.GAMES.findIndex(g=>g.id===id):i;};
    return ports.E.GAMES.filter(g=>!p.hidden.includes(g.id)).sort((a,b)=>order(a.id)-order(b.id));
  }

function typeBadge(tag,{button=false,active=false}={}) {
 const label=ports.esc(tag.label),body=ports.icon(tag.icon);
 return button?`<button type="button" class="filter type-badge type-badge-filter ${active?'active':''}" data-tag-kind="type" data-tag="${ports.esc(tag.id)}" aria-label="${label}" title="${label}" aria-pressed="${active}">${body}</button>`:`<span class="pill tag-type type-badge type-badge-card" aria-label="${label}" title="${label}">${body}</span>`;
}

function tile(g, featured, editing=false) {
    const info=ports.catalog?.[g.id]||{},favorite=globalThis.PlayroomPackManager?.displayPreferences().favorites.includes(g.id);
    const theme=ports.GameScreen.tileTheme(info);
    return `<article class="game-tile ${featured?'featured':''}${editing?' is-editing':''}" data-theme="${theme}" data-game="${g.id}" ${editing?'draggable="true"':''}>
      <div class="tile-card-header">${ports.Tags.forPack(info).filter(t=>t.kind==='type').map(t=>typeBadge(t)).join('')}<span class="tile-player-count" aria-label="${ports.esc(globalThis.PlayroomMessages.text('ui.app.tile.players',{count:g.min===g.max?g.min:g.min+'–'+g.max}))}" title="${ports.esc(info.estimatedDuration||'')}">${ports.icon('people')}<span>${g.min===g.max?g.min:g.min+'–'+g.max}</span></span><button class="tile-favorite" data-favorite="${ports.esc(g.id)}" aria-label="${favorite?globalThis.PlayroomMessages.text("ui.app.334c3299a899"):globalThis.PlayroomMessages.text("ui.app.2a6b5f7278c0")}: ${ports.esc(g.name)}" aria-pressed="${!!favorite}" title="${favorite?globalThis.PlayroomMessages.text("ui.app.334c3299a899"):globalThis.PlayroomMessages.text("ui.app.2a6b5f7278c0")}">${ports.icon('star')}</button></div>
      <div class="tile-mechanics" aria-label="${globalThis.PlayroomMessages.text('ui.app.d47eb88069aa')}">${ports.Tags.forPack(info).filter(t=>t.kind==='mechanic').map(t=>`<span class="pill tag-mechanic">${ports.esc(t.label)}</span>`).join('')}</div>
      <div class="game-cover">${ports.V.cover ? ports.V.cover(g.id) : ''}</div>
      <div class="tile-content"><h2 class="tile-title"><span>${ports.esc(g.name)}</span></h2><p class="tile-description">${ports.esc(info.tagline || g.description)}</p>
      </div>
      ${editing?`<div class="tile-edit-actions" role="group" aria-label="${globalThis.PlayroomMessages.text("ui.app.e3710e4cbdb7")}${ports.esc(g.name)}"><button type="button" data-edit-step="-1" data-edit-id="${ports.esc(g.id)}" aria-label="${globalThis.PlayroomMessages.text("ui.app.31780d6c4a33")}${ports.esc(g.name)}">${ports.icon('up')}</button><button type="button" data-edit-step="1" data-edit-id="${ports.esc(g.id)}" aria-label="${globalThis.PlayroomMessages.text("ui.app.324de4c19b50")}${ports.esc(g.name)}">${ports.icon('down')}</button></div>`:`<button class="tile-hit" data-start="${g.id}" aria-label="${globalThis.PlayroomMessages.text("ui.app.c60db60583de")}${ports.esc(g.name)}"></button>`}</article>`;
  }

function recentGameCard(g){return `<div class="game-grid">${tile(g,false)}</div>`;}

function hubFilterMarkup(){
    const visible=orderedVisibleGames(),tags=new Set(visible.flatMap(g=>ports.Tags.forPack(ports.catalog?.[g.id]).map(t=>t.id)));
    const button=(attrs,label,body,active,disabled=false)=>`<button type="button" class="filter ${active?'active':''}" ${attrs} aria-label="${ports.esc(label)}" title="${ports.esc(label)}" aria-pressed="${!!active}" ${disabled?'disabled':''}>${body}</button>`;
    const expanded=!!ports.hubFiltersOpen,label=globalThis.PlayroomMessages.text('ui.app.hub.filters');
    const panels=kind=>`id="hub-filter-${kind}" data-hub-filter-panel ${expanded?'':'hidden'}`;
    const formats=[['solo',globalThis.PlayroomMessages.text("ui.app.75bd9a7f386b"),'player'],['duel',globalThis.PlayroomMessages.text("ui.app.236c3a63d464"),'duel'],['three',globalThis.PlayroomMessages.text("ui.app.343692d86392"),'three'],['2+',globalThis.PlayroomMessages.text("ui.app.6e79a7ed2cf1")],['3+',globalThis.PlayroomMessages.text("ui.app.ef9dbd7beb80")],['4+',globalThis.PlayroomMessages.text("ui.app.c22ba13f3414")],['6+',globalThis.PlayroomMessages.text("ui.app.a657c690d997")],['teams',globalThis.PlayroomMessages.text("ui.app.fb0c02331f0b"),'teams']];
    return `<div class="hub-filters"><div class="filters filter-scope" role="group" aria-label="${globalThis.PlayroomMessages.text("ui.app.d659e27ebecd")}">${button('data-filter="all"',globalThis.PlayroomMessages.text("ui.app.5ff6983e1aae"),globalThis.PlayroomMessages.text("ui.app.215816bf4210"),ports.filter==='all')}${button('data-filter="favorites"',globalThis.PlayroomMessages.text("ui.app.e4c1d01c5c8f"),ports.icon('star'),ports.filter==='favorites')}<button type="button" class="filter ${expanded?'active':''}" data-hub-filters-toggle aria-label="${ports.esc(label)}" title="${ports.esc(label)}" aria-expanded="${expanded}" aria-controls="hub-filter-format hub-filter-type hub-filter-mechanic">${ports.icon('filter')}</button></div><div class="filters filter-format" ${panels('format')} role="group" aria-label="${globalThis.PlayroomMessages.text("ui.app.0c494e8f15c3")}">${formats.map(([id,label,glyph])=>button(`data-format="${id}"`,label,glyph?ports.icon(glyph):id,ports.hubFilters.format===id,!visible.some(g=>ports.Tags.matches(g,ports.catalog?.[g.id],id)))).join('')}</div>${['type','mechanic'].map(kind=>`<div class="filters filter-${kind}" ${panels(kind)} role="group" aria-label="${kind==='type'?globalThis.PlayroomMessages.text("ui.app.01b75c437b46"):globalThis.PlayroomMessages.text("ui.app.d47eb88069aa")}">${ports.Tags.entries.filter(t=>t.kind===kind&&tags.has(t.id)).map(t=>kind==='type'?typeBadge(t,{button:true,active:ports.hubFilters[kind]===t.id}):button(`data-tag-kind="${kind}" data-tag="${t.id}"`,t.label,ports.esc(t.label),ports.hubFilters[kind]===t.id)).join('')}</div>`).join('')}</div>`;
  }

function renderHub() {
    const previousTab=visibleHubTab();
    if(previousTab&&!restoringScroll)pageScroll[previousTab]=root.scrollY;
    const targetScroll=pageScroll[ports.hubTab]||0;
    restoringScroll=true;
    ports.interruptAction();ports.input?.cancel();ports.playerTargets?.cancel();ports.feedback.clear();ports.cancelBot(); ports.latestPacks();
    const updates=ports.packUpdates(),unread=updates.some(item=>!ports.packNotices.read.includes(ports.updateKey(item))),newUpdates=updates.filter(item=>!ports.packNotices.dismissed.includes(ports.updateKey(item)));
    const flashPacks=updates.length>0;ports.flashPacksOnHub=false;
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{order:[],hidden:[],favorites:[]};
    const games=orderedVisibleGames().filter(g=>(ports.filter!=='favorites'||preferences.favorites.includes(g.id))&&ports.Tags.matches(g,ports.catalog?.[g.id],ports.hubFilters.format)&&['type','mechanic'].every(kind=>!ports.hubFilters[kind]||ports.Tags.forPack(ports.catalog?.[g.id]).some(t=>t.id===ports.hubFilters[kind])));
    const hiddenCount=ports.E.GAMES.filter(g=>preferences.hidden.includes(g.id)).length;
    const filtering=ports.filter!=='all'||Object.values(ports.hubFilters).some(Boolean);
    const collectionCount=ports.hubEditing?globalThis.PlayroomMessages.text("ui.app.a036a8e0a204",{p0:String(ports.E.GAMES.length),p1:String(hiddenCount)}):filtering?globalThis.PlayroomMessages.text("ui.app.49a08fa80e02",{p0:String(games.length),p1:String(hiddenCount)}):globalThis.PlayroomMessages.text("ui.app.c4cfdd3cb5e8",{p0:String(ports.E.GAMES.length-hiddenCount),p1:String(hiddenCount)});
    let lastGameId;try{lastGameId=localStorage.getItem('playroom.last-game.v1');}catch(_){}
    const lastGame=ports.settings?.showLastGame&&ports.filter==='all'?games.find(g=>g.id===(lastGameId||ports.session?.game)):null;
    const favorites=ports.filter==='all'?games.filter(g=>preferences.favorites.includes(g.id)):[];
    const others=ports.filter==='all'?games.filter(g=>!preferences.favorites.includes(g.id)):games;
    const editSections=ports.hubEditing?['favorites','normal','hidden'].map(group=>{
      const labels={favorites:globalThis.PlayroomMessages.text("ui.app.6f9ee3bf337a"),normal:globalThis.PlayroomMessages.text("ui.app.d524d8b67004"),hidden:globalThis.PlayroomMessages.text("ui.app.37cd5876821e")},items=globalThis.PlayroomPackManager.ordered(ports.E.GAMES.map(g=>g.id),preferences).map(id=>ports.E.GAMES.find(g=>g.id===id)).filter(g=>globalThis.PlayroomPackManager.category(g.id,preferences)===group);
      return `<section class="hub-game-section hub-edit-section" data-edit-drop="${group}" aria-label="${labels[group]}"><h2 class="hub-section-title">${labels[group]}</h2><div class="game-grid">${items.map(g=>tile(g,false,true)).join('')}</div>${items.length?'':("<p class=\"hub-edit-empty\">"+globalThis.PlayroomMessages.text("ui.app.61466a82a03a")+"</p>")}</section>`;
    }).join(''):'';
    const sections=ports.hubEditing?editSections:ports.filter==='all'?`${lastGame?`<section class="hub-game-section recent-section" aria-label="${globalThis.PlayroomMessages.text("ui.app.424df2f37ab9")}">${recentGameCard(lastGame)}</section>`:''}${favorites.length?`<section class="hub-game-section favorites-section" aria-label="${globalThis.PlayroomMessages.text("ui.app.1b433130e4cb")}"><div class="game-grid">${favorites.map(g=>tile(g,false)).join('')}</div></section>`:''}<section class="hub-game-section other-section" aria-label="${globalThis.PlayroomMessages.text("ui.app.a1269350449c")}"><div class="game-grid">${others.map(g=>tile(g,false)).join('')}</div></section>`:`<section class="game-grid" aria-label="${globalThis.PlayroomMessages.text("ui.app.382fd8faba22")}">${games.map((g,i)=>tile(g,i===0)).join('')}</section>`;
    ports.GameScreen.update(ports.$('#app'), `<div class="app-shell"><aside class="sidebar"><button class="brand" data-command="home" aria-label="${globalThis.PlayroomMessages.text("ui.app.4c890677e7fd")}">${ports.brand}</button>
      <nav class="side-nav" aria-label="${globalThis.PlayroomMessages.text("ui.app.8fff0bba4454")}"><div class="hub-page-tabs shared-page-tabs" style="--page-index:${ports.hubTab==='sessions'?1:0}"><button class="nav-item ${ports.hubTab==='games'?'current':''}" data-command="home">${ports.icon('grid')}${globalThis.PlayroomMessages.text("ui.app.5ff6983e1aae")}</button><button class="nav-item ${ports.hubTab==='sessions'?'current':''}" data-command="sessions">${ports.icon('history')}${globalThis.PlayroomMessages.text("ui.app.cf07c6c4d1da")}</button></div><div class="hub-theme-tabs"><button class="nav-item" data-appearance-editor>${ports.icon('palette')}${ports.esc(globalThis.PlayroomAppearanceUI.text('themes.only-title'))}</button></div></nav>
      <div class="sidebar-note"><span class="little-dice">${ports.icon('dice')}</span><span class="sidebar-note-copy">${globalThis.PlayroomMessages.text("ui.app.6b844f627df4")} ${globalThis.PlayroomMessages.text("ui.app.cae89e1cd00c")}</span><span class="eyebrow" style="font-size:8px">PLAYROOM / ${ports.esc(ports.appVersion)}</span></div></aside>
      <main class="hub-main"><header class="topbar"><span class="eyebrow muted">${globalThis.PlayroomMessages.text("ui.app.a9979c201901")}</span><button class="brand mobile-brand" data-command="home" aria-label="${globalThis.PlayroomMessages.text("ui.app.4c890677e7fd")}">${ports.brand}</button>
      <div class="topbar-tools ui-toolbar">${ports.GameScreen.toolbar([
        {attrs:'data-command="packs"',label:unread?globalThis.PlayroomMessages.text("ui.app.d8a7777007bf"):globalThis.PlayroomMessages.text("ui.app.61384528c752"),name:'layers',className:`pack-hub-button${unread?' has-unread':''}${flashPacks?' flash-unread':''}`},
        {attrs:'data-command="fullscreen"',label:globalThis.PlayroomMessages.text("ui.app.f42c392566b5"),name:'full'},
        {attrs:'data-command="help"',label:globalThis.PlayroomMessages.text("ui.app.f416fa0d4d3b"),name:'help'}
      ])}</div></header>
      <div class="hub-pages shared-page-deck" style="--page-index:${ports.hubTab==='sessions'?1:0}"><section id="hub-games-page" class="shared-page-panel ${ports.hubTab==='games'?'is-active':''}" style="--page-number:0" ${ports.hubTab==='games'?'':'inert aria-hidden="true"'}>${newUpdates.length?`<div class="pack-update-notice" role="status"><span>${newUpdates.length===1?globalThis.PlayroomMessages.text("ui.app.321731f40bb3"):globalThis.PlayroomMessages.text("ui.app.d5db4b177f03",{p0:String(newUpdates.length)})}</span><button type="button" class="btn secondary" data-command="packs">${globalThis.PlayroomMessages.text("ui.app.d4998bc84141")}</button><button type="button" class="icon-btn" data-command="dismiss-pack-updates" aria-label="${globalThis.PlayroomMessages.text("ui.app.c1017c5e5d50")}">${ports.icon('close')}</button></div>`:''}<section class="intro"><div class="intro-heading" data-install-pulse="${ports.hubTab==='games'&&previousTab!=='games'}"><h1><span class="intro-line">${globalThis.PlayroomMessages.text("ui.app.14d61d0ff252")}</span><span class="intro-line">${globalThis.PlayroomMessages.text("ui.app.032385a2501c")}</span></h1></div><p>${globalThis.PlayroomMessages.text("ui.app.986e006774bc")}<br>${globalThis.PlayroomMessages.text("ui.app.79fb8cc28c70")}<br>${globalThis.PlayroomMessages.text("ui.app.deedde9ad42a")}</p></section>
      ${ports.loadWarning?`<p class="recovery-note" role="alert">${ports.esc(ports.loadWarning)}<button class="icon-btn" data-command="dismiss-recovery" aria-label="${globalThis.PlayroomMessages.text("ui.app.e7c9a9e482fd")}">${ports.icon('close')}</button></p>`:''}
      ${ports.session&&ports.localResumeVisible!==false?ports.GameScreen.resumeCard({hide:'data-command="hide-local-session"',state:ports.E.project(ports.session.current,-1),roomName:ports.session.options?.lobbyConfig?.name||globalThis.PlayroomMessages.text('ui.app.499f4549c0b2',{p0:ports.session.current.players.find(p=>!p.bot)?.name||ports.session.current.players[0]?.name||''}),gameName:ports.meta(ports.session.game).name,teamLayouts:ports.catalog?.[ports.session.game]?.teamLayouts||{}}):''}
      <div class="library-heading">${ports.hubEditing?'':hubFilterMarkup()}<div class="hub-library-tools"><span class="collection-count">${collectionCount}</span><button type="button" class="icon-btn hub-edit-toggle" title="${ports.hubEditing?globalThis.PlayroomMessages.text("ui.app.ef05d57959cf"):globalThis.PlayroomMessages.text("ui.app.93f7d70b0155")}" aria-label="${ports.hubEditing?globalThis.PlayroomMessages.text("ui.app.ef05d57959cf"):globalThis.PlayroomMessages.text("ui.app.93f7d70b0155")}" data-edit-toggle aria-pressed="${ports.hubEditing}">${ports.icon(ports.hubEditing?'check':'edit')}</button></div></div>
      ${sections}${!ports.E.GAMES.length?("<div class=\"packs-empty-hub\"><h2>"+globalThis.PlayroomMessages.text("ui.app.094e88b64d93")+"</h2><p>"+globalThis.PlayroomMessages.text("ui.app.bda06013d1fa")+"</p><button class=\"btn\" data-command=\"packs\">"+globalThis.PlayroomMessages.text("ui.app.ab032a53861d")+"</button></div>"):!games.length?("<p class=\"lead\">"+globalThis.PlayroomMessages.text("ui.app.fc36b3243089")+"</p>"):''}</section><section id="hub-sessions-page" class="shared-page-panel ${ports.hubTab==='sessions'?'is-active':''}" style="--page-number:1" ${ports.hubTab==='sessions'?'':'inert aria-hidden="true"'}><div id="saved-games-panel">${savedGamesMarkup()}</div></section></div>
      <footer class="hub-footer"><span class="hub-footer-brand">${ports.icon('hand')}<span class="hub-footer-lines"><span>${globalThis.PlayroomMessages.text("ui.app.686fd8648dcd")}</span><span class="eyebrow">PLAYROOM / ${ports.esc(ports.appVersion)}</span></span></span><span>${globalThis.PlayroomMessages.text("ui.app.16eb7faa2fda")}<br class="mobile-text"> ${globalThis.PlayroomMessages.text("ui.app.a6dacdad06f1")}</span></footer></main></div>`);
    ports.GameScreen.fitCovers(ports.$('#app'));
    root.scrollTo({top:targetScroll,behavior:'instant'});
    requestAnimationFrame(()=>{restoringScroll=false;});
    if(ports.hubTab==='sessions')refreshNetworkSaved();
  }

function moveHubGame(id,group,beforeId=null){
    globalThis.PlayroomPackManager.moveGame(id,group,beforeId,ports.E.GAMES.map(game=>game.id));
    renderHub();
  }

function editHubStep(id,step){
    const manager=globalThis.PlayroomPackManager,prefs=manager.displayPreferences(),group=manager.category(id,prefs);
    const ids=manager.ordered(ports.E.GAMES.map(game=>game.id),prefs).filter(item=>manager.category(item,prefs)===group),at=ids.indexOf(id),to=at+step;
    if(to<0||to>=ids.length)return;
    moveHubGame(id,group,step<0?ids[to]:ids[to+1]||null);
  }

function hubDropAt(id,target,point=null){
    const section=target?.closest?.('[data-edit-drop]');if(!section)return;
    const card=target.closest('.game-tile[data-game]');
    if(card?.dataset.game===id)return;
    let before=card?.dataset.game||null;
    if(card&&point){const rect=card.getBoundingClientRect(),horizontal=rect.width>rect.height*1.5;
      const after=horizontal?point.y>rect.top+rect.height/2:point.x>rect.left+rect.width/2;
      if(after)before=card.nextElementSibling?.dataset.game||null;
    }
    moveHubGame(id,section.dataset.editDrop,before);
  }

function savedGamesMarkup(){
    let local=[];
    try{local=ports.library.list();}catch(_){return ("<p class=\"recovery-note\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.app.5ed956efc0ee")+"</p>");}
    const date=value=>new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    const entries=[...local.map(x=>({...x,kind:'local'})),...ports.networkSaved.map(x=>({...x,kind:'network'}))]
      .filter(x=>ports.savedFilter==='all'||x.kind===ports.savedFilter).sort((a,b)=>b.updatedAt-a.updatedAt||Number(b.active)-Number(a.active));
    const cards=entries.map(entry=>{
      const network=entry.kind==='network',host=entry.role!=='client',blocked=entry.invalid||entry.missingPack;
      const name=entry.invalid?globalThis.PlayroomMessages.text("ui.app.a77d5c4eccaa"):ports.meta(entry.game)?.name||entry.game;
      const id=network?(host?entry.sessionId:'client:'+entry.id):entry.id;
      const stateLabel=globalThis.PlayroomMessages.text(entry.finished?"ui.app.d0dd0cfdf601":"ui.app.7c68889f13eb");
      const kindLabel=network?globalThis.PlayroomMessages.text("ui.app.a3031407aaa4",{p0:String(globalThis.PlayroomMessages.text(host?"ui.app.bc490112c3f7":"ui.app.3e622aecbf30"))}):globalThis.PlayroomMessages.text("ui.app.session-local");
      const status=blocked?ports.esc(kindLabel+' · '+globalThis.PlayroomMessages.text(entry.missingPack?"ui.app.bfa7e38930c6":"ui.app.354f0fb38ae2")):`<span class="saved-state-icon" role="img" aria-label="${ports.esc(stateLabel)}" title="${ports.esc(stateLabel)}">${ports.icon(entry.finished?'trophy':'pause')}</span>${ports.esc(kindLabel)}`;

      const count=network?Number(entry.revision)||0:Number(entry.move)||0;
      const summary=network?entry.name:globalThis.PlayroomMultiplayer.presetLabel(entry.presetId,ports.meta(entry.game)||{},ports.catalog?.[entry.game]?.presetSetting);
      const participants=blocked?'':`${ports.GameScreen.participantsMarkup({players:(entry.participants||entry.players?.map(nickname=>({nickname}))||[]).filter(p=>!p.role||p.role==='player').sort((a,b)=>(a.playerIndex??0)-(b.playerIndex??0)).map(p=>({...p,name:p.nickname||p.name})),turn:entry.turn,firstPlayer:entry.firstPlayer,status:entry.finished?'finished':'playing',preset:entry.presetId,scene:{players:(entry.participants||[]).filter(p=>p.role==='player').sort((a,b)=>(a.playerIndex??0)-(b.playerIndex??0)).map((p,i)=>({player:i,team:p.team}))}},{network,selfId:entry.participantId||(host?entry.participants?.find(p=>p.isHost)?.id:null),teamLayouts:ports.catalog?.[entry.game]?.version===entry.packVersion?ports.catalog?.[entry.game]?.teamLayouts:{}})}`;
      const progress=[ports.GameScreen.roundText(entry.round),entry.turnNumber?globalThis.PlayroomMessages.text('progress.turn',{number:entry.turnNumber}):'',`${count} ${globalThis.PlayroomMessages.text("ui.app.677de8e411ba")}`].filter(Boolean).join(' · ');
      const details=blocked?`<p>${entry.missingPack?globalThis.PlayroomMessages.text("ui.app.fe7d9d49f0cc",{p0:String(ports.esc(entry.packVersion))}):globalThis.PlayroomMessages.text("ui.app.66f90f7f0099")}</p>`:
        `${network&&summary?`<p class="saved-summary">${ports.esc(summary)}</p>`:''}${entry.result?`<p class="saved-result">${ports.esc(entry.result)}</p>`:''}<p class="saved-version"><span title="${ports.esc(globalThis.PlayroomMessages.text("ui.app.8be1014bd562"))}">${ports.esc(entry.packVersion)}</span> · <span title="${ports.esc(globalThis.PlayroomMessages.text("ui.app.74c33b592ff9"))}">${ports.esc(date(entry.updatedAt))}</span></p>${network&&!host&&entry.savedFrames<entry.revision+1?("<p>"+globalThis.PlayroomMessages.text("ui.app.e8e6ac7851bf")+"</p>"):''}`;
      const history=network?`data-network-history="${ports.esc(id)}"`:`data-history-id="${ports.esc(id)}"`;
      const continuation=network?`data-network-continue="${ports.esc(id)}"`:`data-resume-id="${ports.esc(id)}"`;
      const label=network&&!host?globalThis.PlayroomMessages.text("ui.app.222d012d0f12"):globalThis.PlayroomMessages.text("ui.app.042f5f7a1f23");
      return `<article class="saved-game" ${network?`data-network-session-id="${ports.esc(id)}"`:`data-session-id="${ports.esc(id)}"`}><div class="saved-game-main"><div class="saved-status"><span class="pill">${status}</span><span class="saved-progress">${ports.esc(progress)}</span></div><h2><strong>${ports.esc(name)}</strong>${!network&&!blocked?`<span class="saved-mode">${ports.esc(summary)}</span>`:''}</h2>${participants}</div><div class="saved-game-footer"><div class="saved-game-details">${details}</div><div class="saved-game-actions">
        ${entry.missingPack?`<button class="icon-btn" data-command="packs" aria-label="${globalThis.PlayroomMessages.text("ui.app.85f1ac7666ae")}" title="${globalThis.PlayroomMessages.text("ui.app.85f1ac7666ae")}">${ports.icon('layers')}</button>`:blocked?'':`<button class="icon-btn saved-history" ${history} aria-label="${globalThis.PlayroomMessages.text("ui.app.9c2fd4b3f43a")}" title="${globalThis.PlayroomMessages.text("ui.app.9c2fd4b3f43a")}">${ports.icon('history')}</button><button class="icon-btn saved-continue" ${continuation} aria-label="${entry.finished?globalThis.PlayroomMessages.text("ui.app.64f3ad19b9c6"):label}" title="${entry.finished?globalThis.PlayroomMessages.text("ui.app.64f3ad19b9c6"):label}" ${entry.finished?'disabled':''}>${ports.icon('play')}</button>`}
        ${`<button class="icon-btn saved-delete" data-delete-id="${ports.esc(id)}" ${network?'data-delete-network="true"':''} aria-label="${globalThis.PlayroomMessages.text("ui.app.eebc09d57087")}${ports.esc(name)}" title="${globalThis.PlayroomMessages.text("ui.app.c58c14898403")}">${ports.icon('trash')}</button>`}</div></div></article>`;
    }).join('');
    const filters=[['all',globalThis.PlayroomMessages.text("ui.app.215816bf4210")],['local',globalThis.PlayroomMessages.text("ui.app.ba0fcfc428d3")],['network',globalThis.PlayroomMessages.text("ui.app.1c4c04ae69fd")]].map(([value,label])=>
      `<button type="button" class="filter ${ports.savedFilter===value?'active':''}" data-saved-filter="${value}" aria-pressed="${ports.savedFilter===value}">${label}</button>`).join('');
    const note=ports.networkSavedState==='loading'?("<p class=\"saved-network-info\" role=\"status\">"+globalThis.PlayroomMessages.text("ui.app.5699862f01aa")+"</p>"):
      ports.networkSavedState==='error'?("<p class=\"recovery-note\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.app.afac307649eb")+"</p>"):'';
    return `<header class="saved-heading"><div><h1>${globalThis.PlayroomMessages.text("ui.app.cf07c6c4d1da")}</h1><p>${globalThis.PlayroomMessages.text("ui.app.404a17632caf")}</p></div><div class="saved-heading-actions">${ports.GameScreen.button({attrs:'data-clear-games',disabled:!local.length&&!ports.networkSaved.length,icon:'trash',label:globalThis.PlayroomMessages.text("ui.app.787b30e70b0f"),variant:'secondary'})}${ports.GameScreen.button({attrs:'data-command="home"',icon:'play',label:globalThis.PlayroomMessages.text("ui.app.39a59305f61a")})}</div></header>
      <div class="saved-filter-bar" role="group" aria-label="${globalThis.PlayroomMessages.text("ui.app.852b3909ac7e")}">${filters}</div>${note}
      <section class="saved-games-list" aria-label="${globalThis.PlayroomMessages.text("ui.app.88a4e9cf1feb")}">${entries.length?cards:("<div class=\"saved-empty\"><h2>"+globalThis.PlayroomMessages.text("ui.app.06828fbfb661")+"</h2><p>"+globalThis.PlayroomMessages.text("ui.app.d0b51ef3f136")+"</p><button class=\"btn\" data-command=\"home\">"+globalThis.PlayroomMessages.text("ui.app.437c9479b3cb")+"</button></div>")}</section>`;
  }

async function refreshNetworkSaved(){
    const ticket=++ports.networkSavedTicket;ports.networkSavedState='loading';ports.networkSaved=[];
    try{
      const records=await globalThis.PlayroomNetworkLibrary?.list?.()||[];
      if(ticket!==ports.networkSavedTicket||ports.hubTab!=='sessions'||ports.screen!=='hub')return;
      ports.networkSaved=records;ports.networkSavedState='ready';
    }catch(_){if(ticket!==ports.networkSavedTicket)return;ports.networkSavedState='error';}
    if(ticket===ports.networkSavedTicket&&ports.screen==='hub'&&ports.hubTab==='sessions'){
      updateSavedPanel();
    }
  }

function updateSavedPanel(){
    const panel=ports.$('#saved-games-panel');if(!panel)return;
    const position=window.scrollY;globalThis.PlayroomDOM.ListController.update(panel,savedGamesMarkup());window.scrollTo(0,position);
  }
return {orderedVisibleGames,tile,recentGameCard,hubFilterMarkup,renderHub,moveHubGame,editHubStep,hubDropAt,savedGamesMarkup,refreshNetworkSaved,updateSavedPanel};
}};})(globalThis);
