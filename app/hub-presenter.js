/* Hub and archive Web rendering. State and application operations are ports. */
(function(root){root.PlayroomHubPresenter={create(ports){
const pages=[['games','Игры','grid'],['sessions','Мои партии','history'],['social','Общение','chat'],['profile','Параметры','gear']];
const pageIndex=()=>Math.max(0,pages.findIndex(([id])=>id===ports.hubTab));
const pageScroll={games:0,sessions:0,social:0,profile:0};
let savedStatus='active',savedReturnPending=false;const savedOpen=new Set(),savedScroll={active:0,history:0};
const savedKey=card=>card?.dataset.entity||card?.dataset.sessionId&&'local:'+card.dataset.sessionId||card?.dataset.networkSessionId&&'network:'+card.dataset.networkSessionId||card?.dataset.cloudId&&'cloud:'+card.dataset.cloudId;
root.document.addEventListener('click',event=>{const button=event.target.closest('[data-saved-status]');if(!button||ports.screen!=='hub')return;savedScroll[savedStatus]=root.scrollY;savedReturnPending=false;savedStatus=button.dataset.savedStatus;updateSavedPanel();root.scrollTo(0,savedScroll[savedStatus]);});
root.document.addEventListener('click',event=>{if(event.target.closest('[data-profile-catalog]')){ports.hubTab='games';ports.hubEditing=true;renderHub();return;}if(event.target.closest('[data-profile-account]')){root.PlayroomAccountUI.show();return;}const button=event.target.closest('[data-hub-page]');if(!button||ports.screen!=='hub')return;event.stopImmediatePropagation();ports.hubTab=button.dataset.hubPage;renderHub();});
let savedActionFrame=null;
function savedActions(card,open){
 if(!card)return;
 if(!open){if(savedActionFrame?.state==='active')root.PlayroomAppBridge.closeModal();return;}
 if(savedActionFrame?.state==='active'||ports.screen!=='hub'||ports.hubTab!=='sessions')return;
 const key=savedKey(card),trigger=card.matches('[data-saved-actions-toggle]')?card:card.querySelector('[data-saved-actions-toggle]'),actions=card.querySelector('[data-saved-action-tray]');if(!key||!actions)return;
 const position=root.scrollY,title=card.querySelector('.saved021-title')?.textContent||'Партия';
 const frame=root.PlayroomAppBridge.openModal(ports.GameScreen.modalHead('Действия партии')+`<p class="saved-actions-title">${ports.esc(title)}</p><nav class="saved-actions-menu menu-list" aria-label="Действия партии">${actions.innerHTML.replace(/saved021-command/g,'saved021-command menu-row')}</nav>`,'saved-actions-modal',{valid:()=>card.isConnected&&savedKey(card)===key&&ports.screen==='hub'&&ports.hubTab==='sessions',onDispose:()=>{savedOpen.delete(key);if(savedActionFrame===frame)savedActionFrame=null;if(trigger.isConnected)trigger.setAttribute('aria-expanded','false');if(ports.screen==='hub'&&ports.hubTab==='sessions')root.scrollTo(0,position);}});
 if(!frame)return;savedActionFrame=frame;savedOpen.add(key);trigger.setAttribute('aria-expanded','true');
 frame.element.addEventListener('click',event=>{const button=event.target.closest('.saved-actions-menu button');if(!button)return;if(frame.state!=='active'||!card.isConnected||savedKey(card)!==key){event.preventDefault();event.stopImmediatePropagation();return;}if(button.disabled)return;if(button.matches('[data-history-id],[data-network-history],[data-resume-id],[data-network-continue]')){savedScroll[savedStatus]=position;savedReturnPending=true;}root.PlayroomAppBridge.closeModal(true);},true);
}
root.document.addEventListener('click',event=>{const trigger=event.target.closest('#saved-games-panel [data-saved-actions-toggle]');if(!trigger||ports.screen!=='hub'||ports.hubTab!=='sessions')return;event.preventDefault();event.stopImmediatePropagation();savedActions(trigger.closest('.saved-game'),true);});
root.document.addEventListener('keydown',event=>{const card=event.target.closest('#saved-games-panel .saved-game[data-saved-actions-toggle]');if(!card||event.target!==card||!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopImmediatePropagation();savedActions(card,true);});
function navigation(){return `<div class="hub-page-tabs app-page-tabs shared-page-tabs" style="--page-count:4;--page-index:${pageIndex()}">${pages.map(([id,label,glyph])=>`<button class="nav-item ${ports.hubTab===id?'current':''}" data-hub-page="${id}" ${id==='social'?'data-social-unread':''} ${id==='games'?'data-command="home"':id==='sessions'?'data-command="sessions"':''} aria-current="${ports.hubTab===id?'page':'false'}"><span class="hub-nav-icon">${ports.icon(glyph)}${id==='sessions'?activeBadge():''}</span><span>${label}</span></button>`).join('')}</div>`;}
function profileIdentity(){
 const p=root.PlayroomAppBridge?.profile?.(),account=root.PlayroomAccountUI?.service?.snapshot?.(),social=root.PlayroomSocialUI?.service?.snapshot?.().profile;
 const status=account?.kind==='account'?'Облачный аккаунт'+(social?.username?' · @'+social.username:''):'Войти в облако';
 return `${root.TabletopUI.avatar({name:p?.name||'Игрок',avatar:p?.avatar},0,{hidden:true})}<span class="profile021-identity-copy"><strong>${ports.esc(p?.name||'Игрок')}</strong><small>${ports.esc(status)}</small></span>${ports.icon('next')}`;
}
root.addEventListener('playroom:profile-identity-updated',()=>{const node=ports.$('#hub-profile-page .profile-summary');if(node)node.innerHTML=profileIdentity();});
function profilePage(){
 const item=(attrs,label,glyph)=>`<button type="button" class="profile021-row" ${attrs}><strong>${ports.esc(label)}</strong>${ports.icon(glyph)}</button>`;
 return `<section class="profile021"><button type="button" class="profile-summary profile021-person" data-profile-account>${profileIdentity()}</button><nav class="profile021-menu" aria-label="Разделы профиля">${item('data-command="settings"','Настройки','settings')}${item('data-appearance-open','Оформление','sun')}${item('data-command="notifications-settings"','Уведомления','bell')}${item('data-cloud-data-open','Данные и облако','cloud')}${item('data-command="packs"','Игры','gamepad')}<button type="button" class="profile021-row" data-command="show-updates" data-update-entry><span><strong>Обновление</strong><small hidden></small></span>${ports.icon('download')}</button>${item('data-install-entry data-install-open aria-haspopup="dialog"','Установить ХОД','install')}<a class="profile021-row" data-installed-app hidden target="_blank" rel="noopener"><strong>Открыть приложение</strong>${ports.icon('gamepad')}</a></nav></section>`;
}
const viewKey='playroom.catalog-view.v1';
let catalogView='2';try{const saved=localStorage.getItem(viewKey);if(['list','2','3'].includes(saved))catalogView=saved;}catch(_){}
root.document.addEventListener('click',event=>{const visibility=event.target.closest('[data-catalog-visibility]');if(visibility&&ports.hubEditing){const manager=root.PlayroomPackManager,id=visibility.dataset.catalogVisibility;manager.setCategory(id,manager.category(id)==='hidden'?'normal':'hidden');renderHub();return;}const button=event.target.closest('[data-catalog-mode]');if(!button)return;catalogView=button.dataset.catalogMode;try{localStorage.setItem(viewKey,catalogView);}catch(_){}renderHub();});
function catalogControls(){
 const glyph=mode=>{const items=mode==='list'?'<path d="M9.5 5h12M9.5 12h12M9.5 19h12"/><rect x="2.5" y="3" width="4" height="4" rx="1"/><rect x="2.5" y="10" width="4" height="4" rx="1"/><rect x="2.5" y="17" width="4" height="4" rx="1"/>':Array.from({length:mode==='2'?4:9},(_,i)=>{const n=mode==='2'?2:3,size=n===2?7:4,step=n===2?11:7;return `<rect x="${3+i%n*step}" y="${3+Math.floor(i/n)*step}" width="${size}" height="${size}" rx="1"/>`;}).join('');return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">${items}</svg>`;};
 return `<div class="catalog-actions"><div class="catalog-view-actions"><div class="catalog-view-controls app-page-tabs shared-page-tabs" style="--page-count:3;--page-index:${['list','2','3'].indexOf(catalogView)}" role="group" aria-label="Вид каталога">${[['list','Список'],['2','Крупные карточки'],['3','Компактные карточки']].map(([mode,label])=>`<button type="button" data-catalog-mode="${mode}" title="${label}" aria-label="${label}" aria-pressed="${catalogView===mode}">${glyph(mode)}</button>`).join('')}</div>${ports.hubEditing?'':hubFilterMarkup()}</div><div data-catalog-room-action></div></div>`;
}
function activeBadge(){
 let records=[];try{records=ports.library.list();}catch(_){}
 const ids=new Set([...records.map(item=>({...item,kind:'local'})),...(ports.networkSaved||[]).map(item=>({...item,kind:'network'}))].filter(item=>!item.finished&&!item.invalid&&!ports.library.archived((item.kind==='local'?'local:':'network:')+(item.kind==='local'?item.id:item.role==='client'?'client:'+item.id:item.sessionId))).map(item=>item.sessionId||item.id));
 const keys=[...records.map(r=>'local:'+r.id),...(ports.networkSaved||[]).map(r=>'network:'+(r.role==='client'?'client:'+r.id:r.sessionId))];
 const remote=root.PlayroomCloudSavesUI?.remoteCount?.(keys,{finished:false})||0;
 const count=(ids.size||((!records.length&&ports.session&&ports.session.current.status!=='finished')?1:0))+remote;
 return count?`<span class="active-games-badge" aria-label="Активных партий: ${count}">${count}</span>`:'';
}
function paintActiveBadge(){for(const item of document.querySelectorAll('[data-hub-page=sessions]')){item.querySelector('.active-games-badge')?.remove();(item.querySelector('.hub-nav-icon')||item).insertAdjacentHTML('beforeend',activeBadge());}}
root.addEventListener('playroom:cloud-saves-updated',()=>{if(ports.screen==='hub'){if(ports.hubTab==='sessions')updateSavedPanel();paintActiveBadge();}});
let restoringScroll=false;
let headerSlot=null,headerFrame=0,navigationObserved=[];
function syncNavigation(navigation){
  const tabs=navigation?.querySelector(':scope>.hub-page-tabs'),items=[...(tabs?.querySelectorAll(':scope>.nav-item')||[])],observed=[navigation,tabs,...items].filter(Boolean);
  if(observed.length!==navigationObserved.length||observed.some((node,index)=>node!==navigationObserved[index])){navigationObserved.forEach(node=>headerObserver?.unobserve(node));navigationObserved=observed;observed.forEach(node=>headerObserver?.observe(node));}
  if(!tabs)return;
  const rail=root.matchMedia('(orientation:landscape) and (min-width:600px)').matches,style=root.getComputedStyle(tabs),selected=items.find(node=>node.classList.contains('current'));
  const set=(node,key,value)=>{if(node&&node.style.getPropertyValue(key)!==value)node.style.setProperty(key,value);};
  if(!rail){const minimum=parseFloat(style.getPropertyValue('--hub-nav-item-min'))*parseFloat(root.getComputedStyle(root.document.documentElement).fontSize),available=tabs.clientWidth-(parseFloat(style.paddingLeft)||0)-(parseFloat(style.paddingRight)||0),count=Math.floor(available/minimum);set(tabs,'--hub-nav-columns',String(count>=4?4:count>=2?2:1));}
  set(ports.$('.hub-shell-v021'),'--hub-nav-extra-space',(rail?0:Math.max(0,tabs.offsetHeight-(parseFloat(style.minHeight)||0)))+'px');
  if(rail)set(ports.$('.hub-shell-v021'),'--hub-rail-width',root.getComputedStyle(navigation).width);
  if(selected){
    if(rail){const inset=parseFloat(style.scrollPaddingTop)||0,top=selected.offsetTop,bottom=top+selected.offsetHeight;if(top<tabs.scrollTop+inset)tabs.scrollTop=Math.max(0,top-inset);else if(bottom>tabs.scrollTop+tabs.clientHeight-inset)tabs.scrollTop=bottom-tabs.clientHeight+inset;}
    const box=tabs.getBoundingClientRect(),row=selected.getBoundingClientRect(),sx=box.width/(parseFloat(style.width)||tabs.offsetWidth),sy=box.height/(parseFloat(style.height)||tabs.offsetHeight);
    set(tabs,'--hub-nav-active-x',((row.left-box.left)/sx+tabs.scrollLeft-(parseFloat(style.paddingLeft)||0))+'px');
    set(tabs,'--hub-nav-active-y',((row.top-box.top)/sy+tabs.scrollTop-(parseFloat(style.paddingTop)||0))+'px');
    set(tabs,'--hub-nav-active-width',row.width/sx+'px');set(tabs,'--hub-nav-active-height',row.height/sy+'px');
  }
}
function syncHeader(){
  const slot=ports.$('.hub-topbar-slot'),header=slot?.querySelector('.topbar'),brand=ports.$('.hub-brand'),navigation=ports.$('.hub-navigation-v021');
  const brandHost=root.matchMedia('(orientation:landscape) and (min-width:600px)').matches?navigation:header;
  if(brand&&brandHost&&brand.parentElement!==brandHost)brandHost.prepend(brand);
  syncNavigation(navigation);
  if(slot!==headerSlot){if(headerSlot)headerObserver?.unobserve(headerSlot);headerSlot=slot;if(slot)headerObserver?.observe(slot);}
  if(!header||!slot.offsetWidth)return;
  const box=slot.getBoundingClientRect(),layoutWidth=parseFloat(root.getComputedStyle(slot).width)||slot.offsetWidth,scale=box.width/layoutWidth;
  // Fixed positioning already starts inside the root scrollbar gutter.
  const viewportOrigin=root.document.documentElement.getBoundingClientRect().left;
  header.style.setProperty('--hub-header-left',(box.left-viewportOrigin)/scale+'px');
  header.style.setProperty('--hub-header-width',box.width/scale+'px');
}
const headerObserver=root.ResizeObserver?new root.ResizeObserver(()=>scheduleHeader()):null;
const scheduleHeader=()=>{if(!headerFrame)headerFrame=requestAnimationFrame(()=>{headerFrame=0;syncHeader();});};
root.addEventListener('resize',scheduleHeader);root.visualViewport?.addEventListener('resize',scheduleHeader);
root.document.addEventListener('fullscreenchange',scheduleHeader);
const visibleHubTab=()=>pages.find(([id])=>ports.$('#hub-'+id+'-page.is-active'))?.[0]||null;
root.addEventListener('scroll',()=>{
  const tab=visibleHubTab();
  if(tab&&!restoringScroll)pageScroll[tab]=root.scrollY;
},{passive:true});
function orderedVisibleGames(){
    const p=globalThis.PlayroomPackManager?.displayPreferences()||{order:[],hidden:[],favorites:[]};
    const games=new Map(ports.E.GAMES.map(game=>[game.id,game]));
    return globalThis.PlayroomPackManager.ordered([...games.keys()],p).filter(id=>!p.hidden.includes(id)).map(id=>games.get(id));
  }

function catalogMetadata(game,info){
 const counts=ports.Tags.counts(game,info).sort((a,b)=>a-b),count=counts.length>1&&counts.every((n,i)=>n===counts[0]+i)?counts[0]+'–'+counts.at(-1):counts.join(' / '),tags=ports.Tags.forPack(info),type=tags.find(tag=>tag.kind==='type'),mechanic=tags.find(tag=>tag.kind==='mechanic'),esc=ports.esc;
 return `<div class="catalog-card-metadata">${type?`<span class="catalog-card-type" data-catalog-tag="${esc(type.id)}" role="img" aria-label="${esc(type.label)}" title="${esc(type.label)}">${ports.icon(type.icon)}<span class="catalog-card-type-label" aria-hidden="true">${esc(type.label)}</span></span>`:''}<span class="catalog-card-players" data-catalog-players="${esc(count)}" aria-label="${esc(globalThis.PlayroomMessages.text('ui.app.tile.players',{count}))}">${ports.icon('people')}<span>${esc(count)}</span></span>${mechanic?`<span class="catalog-card-mechanic" data-catalog-tag="${esc(mechanic.id)}">${esc(mechanic.label)}</span>`:''}</div>`;
}

let catalogTouchOrder=null;
function bindCatalogTouchOrder(){
 catalogTouchOrder?.dispose();catalogTouchOrder=null;
 if(!ports.hubEditing||ports.hubTab!=='games'||!root.PlayroomOrderUI)return;
 const list=ports.$('#hub-games-page');
 catalogTouchOrder=root.PlayroomOrderUI.create({list,rows:()=>[...list.querySelectorAll('.hub-edit-section .game-tile[data-game]')],key:row=>row.dataset.game,handle:'.hub-edit-section .game-tile[data-game]',pointerTypes:['touch','pen'],delay:420,
  current:()=>ports.screen==='hub'&&ports.hubEditing&&ports.hubTab==='games',canStart:event=>!event.target.closest('button,input,a,select'),scroll:()=>document.scrollingElement,previewHost:()=>list.closest('.hub-shell-v021'),previewClass:'catalog-order-ghost',previewOmit:'.catalog-card-header',
  resolveDrop:({element})=>{const target=element?.closest('.game-tile[data-game],[data-edit-drop]');return target?{target,element}:null;},move:({key,element,point})=>hubDropAt(key,element,point)});
}

function tile(g, featured, editing=false) {
    const info=ports.catalog?.[g.id]||{},favorite=globalThis.PlayroomPackManager?.displayPreferences().favorites.includes(g.id);
    const theme=ports.GameScreen.tileTheme(info);
    return `<article class="game-tile catalog-card ${editing?' is-editing':''}" data-theme="${theme}" data-game="${g.id}" ${editing?'draggable="true"':''}>
      <div class="tile-card-header catalog-card-header">${editing?`<button type="button" class="catalog-card-visibility" data-catalog-visibility="${ports.esc(g.id)}" aria-label="${globalThis.PlayroomPackManager.category(g.id)==='hidden'?'Показать':'Скрыть'} ${ports.esc(g.name)}">${ports.icon(globalThis.PlayroomPackManager.category(g.id)==='hidden'?'eye':'eye-off')}</button>`:''}<button class="tile-favorite" data-favorite="${ports.esc(g.id)}" aria-label="${favorite?globalThis.PlayroomMessages.text("ui.app.334c3299a899"):globalThis.PlayroomMessages.text("ui.app.2a6b5f7278c0")}: ${ports.esc(g.name)}" aria-pressed="${!!favorite}" title="${favorite?globalThis.PlayroomMessages.text("ui.app.334c3299a899"):globalThis.PlayroomMessages.text("ui.app.2a6b5f7278c0")}">${ports.icon('star')}</button></div>
      ${catalogMetadata(g,info)}
      <div class="pack-art catalog-card-art" aria-hidden="true">${ports.V.cover ? ports.V.cover(g.id) : ''}</div>
      <div class="catalog-card-copy"><h2 class="tile-title catalog-card-title"><span>${ports.esc(g.name)}</span></h2><p class="catalog-card-description">${ports.esc(info.tagline||g.description)}</p>
      </div>
      ${editing?'':`<button class="tile-hit" data-start="${g.id}" aria-label="${globalThis.PlayroomMessages.text("ui.app.c60db60583de")}${ports.esc(g.name)}"></button>`}</article>`;
  }

function recentGameCard(g){return `<div class="game-grid">${tile(g,false)}</div>`;}

function matchesFilters(game,filters=ports.hubFilters){
 const info=ports.catalog?.[game.id];
 const format=filters.format==='two'?ports.Tags.counts(game,info).includes(2):ports.Tags.matches(game,info,filters.format);
 return format&&['type','mechanic'].every(kind=>!filters[kind]||ports.Tags.forPack(info).some(tag=>tag.id===filters[kind]));
}
function hubFilterMarkup(){
 const count=Object.values(ports.hubFilters).filter(Boolean).length;
 const label=`Фильтры${count?': выбрано '+count:''}`;
 return `<button type="button" class="catalog-filter-trigger ${count?'has-filters':''}" data-hub-filters-toggle aria-haspopup="dialog" aria-expanded="false" aria-label="${label}" title="${label}" data-tooltip="${label}">${ports.icon('filter')}${count?`<span class="catalog-filter-count" aria-hidden="true">${count}</span>`:''}</button>`;
}
function showCatalogFilters(){
 const games=orderedVisibleGames(),tags=new Set(games.flatMap(game=>ports.Tags.forPack(ports.catalog?.[game.id]).map(tag=>tag.id))),draft={...ports.hubFilters};
 const count=()=>games.filter(game=>matchesFilters(game,draft)).length;
 const choice=(kind,value,label,disabled=false,glyph=null)=>`<button type="button" data-catalog-filter-kind="${kind}" data-catalog-filter-value="${ports.esc(value)}" aria-label="${ports.esc(label)}" title="${ports.esc(label)}" ${kind==='format'?`data-tooltip="${ports.esc(label)}"`:''} aria-pressed="${draft[kind]===value}" ${disabled?'disabled':''}>${kind==='format'?(glyph?ports.icon(glyph):`<span aria-hidden="true">${ports.esc(value)}</span>`):`${glyph?ports.icon(glyph):''}<span>${ports.esc(label)}</span>`}</button>`;
 const formats=[['solo','Одному','player'],['duel','Только двое','duel'],['three','Только трое','three'],['teams','Командами','teams'],['2+','От двух'],['4+','От четырёх'],['6+','От шести']];
 const groups=[['type','Вид игры'],['mechanic','Механика']].map(([kind,title])=>`<fieldset><legend>${title}</legend><div class="catalog-filter-choices">${ports.Tags.entries.filter(tag=>tag.kind===kind&&tags.has(tag.id)).map(tag=>choice(kind,tag.id,tag.label,false,tag.icon)).join('')}</div></fieldset>`).join('');
 const markup=ports.GameScreen.modalHead('Подобрать игру')+`<section class="catalog-filters-v021"><div class="catalog-filter-fields"><fieldset><legend>Состав игроков</legend><div class="catalog-filter-choices filter-format">${formats.map(([value,label,glyph])=>choice('format',value,label,!games.some(game=>ports.Tags.matches(game,ports.catalog?.[game.id],value)),glyph)).join('')}</div></fieldset>${groups}</div></section><footer class="catalog-filter-footer" data-fixed-footer><button type="button" class="btn secondary" data-catalog-filter-reset>Сбросить</button><button type="button" class="btn" data-catalog-filter-apply>Показать игры · ${count()}</button></footer>`;
 const trigger=document.querySelector('[data-hub-filters-toggle]');trigger?.setAttribute('aria-expanded','true');
 const frame=root.PlayroomAppBridge.openModal(markup,'catalog-filter-modal',{onDispose:()=>{if(trigger?.isConnected)trigger.setAttribute('aria-expanded','false');}});
 if(!frame)return;
 const scope=frame.element;
 const refresh=()=>{for(const button of scope.querySelectorAll('[data-catalog-filter-kind]'))button.setAttribute('aria-pressed',String(draft[button.dataset.catalogFilterKind]===button.dataset.catalogFilterValue));scope.querySelector('[data-catalog-filter-apply]').textContent='Показать игры · '+count();};
 scope.addEventListener('click',event=>{
  if(frame.state!=='active')return;
  const button=event.target.closest('[data-catalog-filter-kind]');
  if(button&&!button.disabled){const kind=button.dataset.catalogFilterKind,value=button.dataset.catalogFilterValue;draft[kind]=draft[kind]===value?'':value;refresh();return;}
  if(event.target.closest('[data-catalog-filter-reset]')){Object.assign(draft,{type:'',mechanic:'',format:''});refresh();return;}
  if(event.target.closest('[data-catalog-filter-apply]')){Object.assign(ports.hubFilters,draft);root.PlayroomAppBridge.closeModal();renderHub();}
 });
}

function renderHub() {
    const previousTab=visibleHubTab();
    if(previousTab==='social')root.PlayroomCommunityUI.remember();if(previousTab&&!restoringScroll)pageScroll[previousTab]=root.scrollY;
    const targetScroll=pageScroll[ports.hubTab]||0;
    restoringScroll=true;
    ports.interruptAction();ports.input?.cancel();ports.playerTargets?.cancel();ports.feedback.clear();ports.cancelBot(); ports.latestPacks();
    const updates=ports.packUpdates(),unread=updates.some(item=>!ports.packNotices.read.includes(ports.updateKey(item)));
    const flashPacks=updates.length>0;ports.flashPacksOnHub=false;
    const preferences=globalThis.PlayroomPackManager?.displayPreferences()||{order:[],hidden:[],favorites:[]};
    const games=orderedVisibleGames().filter(g=>matchesFilters(g));
    const hiddenCount=ports.E.GAMES.filter(g=>preferences.hidden.includes(g.id)).length;
    const filtering=Object.values(ports.hubFilters).some(Boolean);
    const collectionCount=ports.hubEditing?globalThis.PlayroomMessages.text("ui.app.a036a8e0a204",{p0:String(ports.E.GAMES.length),p1:String(hiddenCount)}):filtering?globalThis.PlayroomMessages.text("ui.app.49a08fa80e02",{p0:String(games.length),p1:String(hiddenCount)}):globalThis.PlayroomMessages.text("ui.app.c4cfdd3cb5e8",{p0:String(ports.E.GAMES.length-hiddenCount),p1:String(hiddenCount)});
    let lastGameId;try{lastGameId=localStorage.getItem('playroom.last-game.v1');}catch(_){}
    const lastGame=ports.settings?.showLastGame?games.find(g=>g.id===(lastGameId||ports.session?.game)):null;
    const favorites=games.filter(g=>preferences.favorites.includes(g.id));
    const others=games.filter(g=>!preferences.favorites.includes(g.id));
    const editSections=ports.hubEditing?['favorites','normal','hidden'].map(group=>{
      const labels={favorites:globalThis.PlayroomMessages.text("ui.app.6f9ee3bf337a"),normal:globalThis.PlayroomMessages.text("ui.app.d524d8b67004"),hidden:globalThis.PlayroomMessages.text("ui.app.37cd5876821e")},items=globalThis.PlayroomPackManager.ordered(ports.E.GAMES.map(g=>g.id),preferences).map(id=>ports.E.GAMES.find(g=>g.id===id)).filter(g=>globalThis.PlayroomPackManager.category(g.id,preferences)===group);
      return `<section class="hub-game-section hub-edit-section" data-entity="catalog-edit-${group}" data-edit-drop="${group}" aria-label="${labels[group]}"><h2 class="hub-section-title">${labels[group]}</h2><div class="game-grid">${items.map(g=>tile(g,false,true)).join('')}</div>${items.length?'':("<p class=\"hub-edit-empty\">"+globalThis.PlayroomMessages.text("ui.app.61466a82a03a")+"</p>")}</section>`;
    }).join(''):'';
    const sections=ports.hubEditing?editSections:`${favorites.length?`<section class="hub-game-section favorites-section" data-entity="catalog-favorites" aria-label="${globalThis.PlayroomMessages.text("ui.app.1b433130e4cb")}"><div class="game-grid">${favorites.map(g=>tile(g,false)).join('')}</div></section>`:''}${lastGame?`<section class="hub-game-section recent-section" data-entity="catalog-recent" aria-label="${globalThis.PlayroomMessages.text("ui.app.424df2f37ab9")}">${recentGameCard(lastGame)}</section>`:''}<section class="hub-game-section other-section" data-entity="catalog-other" aria-label="${globalThis.PlayroomMessages.text("ui.app.a1269350449c")}"><div class="game-grid">${others.map(g=>tile(g,false)).join('')}</div></section>`;
    ports.GameScreen.update(ports.$('#app'), `<div class="hub-shell-v021" data-hub-destination="${ports.hubTab}" data-catalog-view="${catalogView}" data-hub-editing="${ports.hubEditing}"><nav class="hub-navigation-v021" aria-label="${globalThis.PlayroomMessages.text("ui.app.8fff0bba4454")}">${navigation()}</nav>
      <main class="hub-main"><div class="hub-topbar-slot"><header class="topbar"><span class="eyebrow muted">${globalThis.PlayroomMessages.text("ui.app.a9979c201901")}</span><button class="brand hub-brand hub-root-brand" data-command="home" aria-label="${globalThis.PlayroomMessages.text("ui.app.4c890677e7fd")}">${ports.brand}</button>${ports.hubTab==='games'?'':`<h1 class="hub-root-title">${ports.icon(pages[pageIndex()][2])}<span>${pages[pageIndex()][1]}</span></h1>`}<div class="hub-root-actions">${ports.hubTab==='games'?root.PlayroomAppearanceUI.settingsButton():''}${ports.hubTab==='games'?ports.GameScreen.iconButton(`data-edit-toggle aria-pressed="${ports.hubEditing}"`,globalThis.PlayroomMessages.text(ports.hubEditing?'ui.app.ef05d57959cf':'ui.app.93f7d70b0155'),ports.hubEditing?'check':'edit'):''}${ports.hubTab==='sessions'?ports.GameScreen.iconButton('data-saved-refresh','Обновить список партий','refresh'):''}${ports.hubTab==='social'?ports.GameScreen.iconButton('data-community-refresh','Обновить','refresh'):''}${ports.GameScreen.fullscreenAction()}</div>
</header></div>
      <div class="hub-pages shared-page-deck" style="--page-index:${pageIndex()}"><section id="hub-games-page" class="shared-page-panel ${ports.hubTab==='games'?'is-active':''}" style="--page-number:0" ${ports.hubTab==='games'?'':'inert aria-hidden="true"'}><section class="intro" data-entity="catalog-intro"><div class="intro-heading"><h1><span class="intro-line">${globalThis.PlayroomMessages.text("ui.app.14d61d0ff252")}</span><span class="intro-line">${globalThis.PlayroomMessages.text("ui.app.032385a2501c")}</span></h1></div><p>Любимые настолки, всегда под рукой.</p></section>${root.PlayroomHubAction.hintMarkup()}
      ${ports.loadWarning?`<p class="recovery-note" role="alert">${ports.esc(ports.loadWarning)}<button class="icon-btn" data-command="dismiss-recovery" aria-label="${globalThis.PlayroomMessages.text("ui.app.e7c9a9e482fd")}">${ports.icon('close')}</button></p>`:''}
      ${ports.session&&ports.localResumeVisible!==false?ports.GameScreen.resumeCard({attrs:'data-entity="catalog-resume"',hide:'data-command="hide-local-session"',state:ports.E.project(ports.session.current,-1),roomName:ports.session.options?.lobbyConfig?.name||globalThis.PlayroomMessages.text('ui.app.499f4549c0b2',{p0:ports.session.current.players.find(p=>!p.bot)?.name||ports.session.current.players[0]?.name||''}),gameName:ports.meta(ports.session.game).name,teamLayouts:ports.catalog?.[ports.session.game]?.teamLayouts||{}}):''}
      <div class="catalog-toolbar" data-entity="catalog-toolbar">${catalogControls()}<div class="library-heading"><div class="hub-library-tools"><span class="collection-count">${collectionCount}</span></div></div>
      </div>${sections}${!ports.hubEditing&&!games.length&&ports.E.GAMES.length?`<div class="catalog-filter-empty"><h3>${!orderedVisibleGames().length?'Все игры скрыты':'Нет подходящих игр'}</h3><p>${'Попробуйте изменить условия подбора.'}</p><button type="button" class="text-btn" ${!orderedVisibleGames().length?'data-command="packs"':'data-hub-filters-toggle'}>${!orderedVisibleGames().length?'Показать скрытые игры':'Изменить фильтры'}</button></div>`:''}${!ports.E.GAMES.length?("<div class=\"packs-empty-hub\"><h2>"+globalThis.PlayroomMessages.text("ui.app.094e88b64d93")+"</h2><p>"+globalThis.PlayroomMessages.text("ui.app.bda06013d1fa")+"</p><button class=\"btn\" data-command=\"packs\">"+globalThis.PlayroomMessages.text("ui.app.ab032a53861d")+"</button></div>"):!games.length?("<p class=\"lead\">"+globalThis.PlayroomMessages.text("ui.app.fc36b3243089")+"</p>"):''}</section><section id="hub-sessions-page" class="shared-page-panel ${ports.hubTab==='sessions'?'is-active':''}" style="--page-number:1" ${ports.hubTab==='sessions'?'':'inert aria-hidden="true"'}><div id="saved-games-panel">${savedGamesMarkup()}</div></section>${['social','profile'].map((id,i)=>`<section id="hub-${id}-page" class="shared-page-panel ${ports.hubTab===id?'is-active':''}" style="--page-number:${i+2}" ${ports.hubTab===id?'':'inert aria-hidden="true"'}>${id==='social'?'<section class="community-modal hub-community" data-hub-community></section>':ports.hubTab===id?profilePage():''}</section>`).join('')}</div>
</main></div>`,{preserveLayout:true});
    if(ports.hubTab==='social')root.PlayroomCommunityUI.show({host:ports.$('[data-hub-community]')});
    bindSavedTabs();
    ports.GameScreen.fitCovers(ports.$('#app'));syncHeader();bindCatalogTouchOrder();
    root.scrollTo({top:targetScroll,behavior:'instant'});
    requestAnimationFrame(()=>{restoringScroll=false;});
    if(ports.hubTab==='sessions')refreshNetworkSaved();
    root.dispatchEvent(new Event('playroom:hub-rendered'));
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
    const entries=[...local.map(x=>({...x,kind:'local'})),...ports.networkSaved.map(x=>({...x,kind:'network'}))].map(x=>({...x,archived:ports.library.archived((x.kind==='network'?'network:':'local:')+(x.kind==='network'?(x.role==='client'?'client:'+x.id:x.sessionId):x.id))}))
      .filter(x=>(!!(x.finished||x.archived)===(savedStatus==='history'))&&(ports.savedFilter==='all'||(x.kind==='local'?'local':x.transportMode==='online'?'online':'network')===ports.savedFilter)).sort((a,b)=>b.updatedAt-a.updatedAt||Number(b.active)-Number(a.active));
    const cards=entries.map(entry=>{
      const network=entry.kind==='network',host=entry.role!=='client',blocked=entry.invalid||entry.missingPack;
      const name=entry.invalid?globalThis.PlayroomMessages.text("ui.app.a77d5c4eccaa"):ports.meta(entry.game)?.name||entry.game;
      const id=network?(host?entry.sessionId:'client:'+entry.id):entry.id;
      const stateLabel=globalThis.PlayroomMessages.text(entry.finished?"ui.app.d0dd0cfdf601":"ui.app.7c68889f13eb");
      const transport=ports.GameScreen.transportInfo(network?(entry.transportMode||'network'):'hotseat');
      const personRole=entry.participants?.find(p=>p.id===entry.participantId)?.role;
      const kindLabel=network?(entry.imported?'Из файла':transport.mode==='online'?'Онлайн':'Рядом')+' · '+(host?'Ведущий':personRole==='table'?'Стол':personRole==='spectator'||entry.viewer<0?'Зритель':'Участник'):'На устройстве';
      const status=blocked?ports.esc(globalThis.PlayroomMessages.text(entry.missingPack?"ui.app.bfa7e38930c6":"ui.app.354f0fb38ae2")):`<span class="saved-state-icon" role="img" aria-label="${ports.esc(stateLabel)}" title="${ports.esc(stateLabel)}">${ports.icon(entry.finished?'trophy':'pause')}</span>`;

      const count=network?Number(entry.revision)||0:Number(entry.move)||0;
      const participants=blocked?'':`${ports.GameScreen.participantsMarkup({game:entry.game,packVersion:entry.packVersion,players:(entry.participants||entry.players?.map(nickname=>({nickname}))||[]).filter(p=>!p.role||p.role==='player').sort((a,b)=>(a.playerIndex??0)-(b.playerIndex??0)).map(p=>({...p,name:p.nickname||p.name})),turn:entry.turn,firstPlayer:entry.firstPlayer,status:entry.finished?'finished':'playing',preset:entry.presetId,scene:{players:(entry.participants||[]).filter(p=>p.role==='player').sort((a,b)=>(a.playerIndex??0)-(b.playerIndex??0)).map((p,i)=>({player:i,team:p.team}))}},{network,selfId:entry.participantId||(host?entry.participants?.find(p=>p.isHost)?.id:null),teamLayouts:ports.catalog?.[entry.game]?.version===entry.packVersion?ports.catalog?.[entry.game]?.teamLayouts:{}})}`;
      const progress=[ports.GameScreen.roundText(entry.round),entry.turnNumber?globalThis.PlayroomMessages.text('progress.turn',{number:entry.turnNumber}):'',globalThis.PlayroomMessages.text('ui.app.action-count',{count})].filter(Boolean).join(' · ');
      const details=blocked?`<p>${entry.missingPack?globalThis.PlayroomMessages.text("ui.app.fe7d9d49f0cc",{p0:String(ports.esc(entry.packVersion))}):globalThis.PlayroomMessages.text("ui.app.66f90f7f0099")}</p>`:
        `<p class="saved-version"><span title="${ports.esc(globalThis.PlayroomMessages.text("ui.app.8be1014bd562"))}">${ports.esc(entry.packVersion)}</span> · <span title="${ports.esc(globalThis.PlayroomMessages.text("ui.app.74c33b592ff9"))}">${ports.esc(date(entry.updatedAt))}</span></p>${entry.result?`<p class="saved-result">${ports.esc(entry.result)}</p>`:''}${network&&!host&&entry.savedFrames<entry.revision+1?("<p>"+globalThis.PlayroomMessages.text("ui.app.e8e6ac7851bf")+"</p>"):''}`;
      const history=network?`data-network-history="${ports.esc(id)}"`:`data-history-id="${ports.esc(id)}"`;
      const continuation=network?`data-network-continue="${ports.esc(id)}"`:`data-resume-id="${ports.esc(id)}"`;
      const label='Продолжить';
      const command=(attrs,label,glyph,options={})=>ports.GameScreen.iconButton(attrs,label,glyph,options);
      const actions=entry.missingPack?command('data-command="packs"','Установить версию игры','layers'):blocked?'':entry.finished||entry.imported?command(history,'Просмотреть','history',{className:'saved-history'}):command(continuation,label,'play',{className:'saved-continue'});
      const disposition=!blocked&&!entry.finished&&!entry.imported&&!entry.archived?command(`data-saved-archive="${ports.esc((network?'network:':'local:')+id)}"`,'Остановить','stop'):'';
      const resultAction=entry.finished&&!blocked?command(`${network?'data-network-results':'data-saved-results'}="${ports.esc(id)}"`,'Результаты','trophy'):'';
      const bottomAction=resultAction+disposition+(blocked||entry.finished||entry.imported?'':command(history,'История партии','history',{className:'saved-history'}))+command(`data-delete-id="${ports.esc(id)}" ${network?'data-delete-network="true"':''}`,'Удалить с устройства','trash',{className:'saved-delete ui-action-danger'})+(entry.invalid?'':globalThis.PlayroomCloudSavesUI.button((network?'network:':'local:')+id).replace(/aria-label="[^"]*"/,'aria-label="Облако"'));
      const key=(network?'network:':'local:')+id;
      const stateText=blocked?(entry.missingPack?'Нужна версия игры':'Не удалось прочитать'):entry.imported?'Только просмотр':entry.finished?'Завершена':entry.archived?'Остановлена':entry.active?'Текущая':'Пауза';
      const summary=kindLabel+' · '+stateText;
      return ports.GameScreen.sessionCard({className:'saved-game',attrs:`data-entity="${ports.esc(key)}" ${network?`data-network-session-id="${ports.esc(id)}"`:`data-session-id="${ports.esc(id)}"`}`,gameName:name,mode:transport.mode,status,badgeTitle:kindLabel,summary,participants,roomName:network?entry.name||'':entry.roomName||'',progress:[progress,network&&!host&&entry.savedFrames<entry.revision+1?'История неполная':''].filter(Boolean).join(' · '),actions,details,bottomAction});
    }).join('');
    const allKeys=[...local.map(e=>'local:'+e.id),...ports.networkSaved.map(e=>'network:'+(e.role==='client'?'client:'+e.id:e.sessionId))],cloudCount=globalThis.PlayroomCloudSavesUI.remoteCount(allKeys),total=local.length+ports.networkSaved.length+cloudCount;
    const cloud=ports.savedFilter==='all'?globalThis.PlayroomCloudSavesUI.remoteMarkup(allKeys,{finished:savedStatus==='history'}):'';
    const filters=[['all',globalThis.PlayroomMessages.text("ui.app.215816bf4210")],['local',globalThis.PlayroomMessages.text("ui.app.ba0fcfc428d3")],['network',globalThis.PlayroomMessages.text('ui.community.mode-network')],['online',globalThis.PlayroomMessages.text('ui.community.mode-online')]].map(([value,label])=>
      `<button type="button" class="filter ${ports.savedFilter===value?'active':''}" data-saved-filter="${value}" aria-label="${ports.esc(label)}" title="${ports.esc(label)}" aria-pressed="${ports.savedFilter===value}">${ports.esc(label)}</button>`).join('');
    const note=ports.networkSavedState==='loading'?("<p class=\"saved-network-info\" role=\"status\">"+globalThis.PlayroomMessages.text("ui.app.5699862f01aa")+"</p>"):
      ports.networkSavedState==='error'?("<p class=\"recovery-note\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.app.afac307649eb")+"</p>"):'';
    const statusTabs=ports.GameScreen.pageTabs({label:'Состояние партий',tabs:[['active','Активные'],['history','История']],value:savedStatus,attribute:'data-saved-status',className:'saved-status-tabs',idPrefix:'saved-status-tab-'});
    const filtered=ports.savedFilter!=='all';
    const empty=savedStatus==='history'?`<div class="saved021-empty"><p>Здесь появятся результаты сыгранных партий.</p></div>`:`<div class="saved021-empty"><h3>${filtered?'Нет подходящих активных партий':'Нет активных партий'}</h3><button type="button" class="saved021-choose" data-command="home">${ports.icon('gamepad')}<span>Выбрать игру</span></button></div>`;
    return `${statusTabs}<div class="filters saved-filter-bar" role="group" aria-label="Способ игры">${filters}</div>${note}<section id="saved-status-panel" class="saved-games-list" aria-label="${savedStatus==='history'?'История партий':'Активные партии'}">${entries.length||cloud?cards+cloud:empty}</section>
      <details class="saved021-management"><summary>Управление партиями</summary><div class="saved021-tools"><button type="button" data-save-import>${ports.icon('file-import')}<span>Импорт партии</span></button><button type="button" data-cloud-data-open>${ports.icon('file-export')}<span>Данные и экспорт</span></button><button type="button" data-clear-games ${!total?'disabled':''}>${ports.icon('trash')}<span>Удалить партии</span></button></div></details>`;

  }

root.document.addEventListener('click',event=>{const button=event.target.closest('.hub-root-actions [data-saved-refresh]');if(!button||button.disabled||ports.screen!=='hub'||ports.hubTab!=='sessions')return;void refreshSaved(button);});
async function refreshSaved(button){
  const frame=ports.$('.hub-shell-v021'),cloud=root.PlayroomCloudSavesUI?.service,account=cloud?.user?.id,generation=cloud?.generation;
  const current=()=>ports.screen==='hub'&&ports.hubTab==='sessions'&&button.isConnected&&ports.$('.hub-root-actions [data-saved-refresh]')===button&&button.closest('.hub-shell-v021')===frame&&root.PlayroomCloudSavesUI?.service===cloud&&cloud?.user?.id===account&&cloud?.generation===generation;
  button.disabled=true;button.setAttribute('aria-busy','true');button.setAttribute('aria-label','Обновляем список партий…');button.title='Обновляем список партий…';
  try{await Promise.all([refreshNetworkSaved({retain:true,current}),root.PlayroomCloudSavesUI?.refresh?.()]);}
  finally{if(current()){button.disabled=false;button.removeAttribute('aria-busy');button.setAttribute('aria-label','Обновить список партий');button.title='Обновить список партий';}}
}
let savedReadJob=null;
async function refreshNetworkSaved({retain=false,current=()=>true}={}){
    const ticket=++ports.networkSavedTicket,cloud=root.PlayroomCloudSavesUI?.service,account=cloud?.user?.id,generation=cloud?.generation;
    const ownerCurrent=()=>root.PlayroomCloudSavesUI?.service===cloud&&cloud?.user?.id===account&&cloud?.generation===generation;
    if(!retain){ports.networkSavedState='loading';ports.networkSaved=[];}
    if(!savedReadJob||savedReadJob.cloud!==cloud||savedReadJob.account!==account||savedReadJob.generation!==generation){
      const job={cloud,account,generation};job.promise=Promise.resolve().then(()=>root.PlayroomNetworkLibrary?.list?.()||[]).finally(()=>{if(savedReadJob===job)savedReadJob=null;});savedReadJob=job;
    }
    try{
      const records=await savedReadJob.promise;
      if(ticket!==ports.networkSavedTicket||ports.hubTab!=='sessions'||ports.screen!=='hub'||!current()||!ownerCurrent())return;
      ports.networkSaved=records;ports.networkSavedState='ready';
    }catch(_){if(ticket!==ports.networkSavedTicket||ports.screen!=='hub'||ports.hubTab!=='sessions'||!current()||!ownerCurrent())return;if(retain){root.PlayroomAppBridge.toast('Не удалось обновить список партий. Попробуйте ещё раз.');return;}ports.networkSavedState='error';}
    if(ticket===ports.networkSavedTicket&&ports.screen==='hub'&&ports.hubTab==='sessions'){
      updateSavedPanel();if(savedReturnPending){const position=savedScroll[savedStatus],status=savedStatus;savedReturnPending=false;requestAnimationFrame(()=>{if(ticket===ports.networkSavedTicket&&status===savedStatus&&ports.screen==='hub'&&ports.hubTab==='sessions')root.scrollTo(0,position);});}
    }
  }

function bindSavedTabs(){
  const panel=ports.$('#saved-games-panel');if(panel)ports.GameScreen.bindPageTabs(panel.querySelector('.saved-status-tabs'),{panel:panel.querySelector('.saved-games-list'),current:()=>ports.screen==='hub'&&ports.hubTab==='sessions'});
}
function updateSavedPanel(){
    paintActiveBadge();
    const panel=ports.$('#saved-games-panel');if(!panel)return;
    const position=window.scrollY,management=panel.querySelector('.saved021-management')?.open;globalThis.PlayroomDOM.ListController.update(panel,savedGamesMarkup());for(const card of panel.querySelectorAll('.saved-game'))(card.matches('[data-saved-actions-toggle]')?card:card.querySelector('[data-saved-actions-toggle]'))?.setAttribute('aria-expanded',String(savedOpen.has(savedKey(card))));if(management)panel.querySelector('.saved021-management')?.setAttribute('open','');bindSavedTabs();window.scrollTo(0,position);
  }
return {orderedVisibleGames,tile,recentGameCard,hubFilterMarkup,showCatalogFilters,renderHub,moveHubGame,editHubStep,hubDropAt,savedGamesMarkup,refreshNetworkSaved,updateSavedPanel};
}};})(globalThis);
