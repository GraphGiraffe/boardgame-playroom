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
  const LayoutPolicy=globalThis.PlayroomLayoutPolicy||GameComponents.layoutPolicy||(typeof require==='function'?require('../presentation/layout-policy.js'):null);
  const tokenLayout=globalThis.PlayroomTokenLayout||(typeof require==='function'?require('./token-layout.js'):null);
  const {firstSymbol,numberPath,numberMark}=Components;
  let renderingPack=null;
  const assetVariant=family=>globalThis.PlayroomAssetResolver?.resolve(family,{packId:renderingPack})?.variant||null;
  const assetLayout=family=>globalThis.PlayroomAssetResolver?.resolve(family,{packId:renderingPack})?.stacking||null;
  const assetArt=(family,params,fallback)=>{params={...params,...(renderingPack?{packId:renderingPack}:{})};const output=globalThis.PlayroomAssetResolver?globalThis.PlayroomAssetResolver.render(family,params):fallback(params);const end=output.indexOf('>');return output.slice(0,end)+` data-asset-family="${esc(family)}"${family==='score-table'?'':` data-asset-params="${esc(JSON.stringify(params))}"`}`+output.slice(end);};
  const roundTokenArt=params=>assetArt('round-token',params||{},Components.roundTokenArt);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const icon=(globalThis.PlayroomIcons||(typeof require==='function'?require('./icons.js'):null)).icon;
  const actionAttr = (action,{allowLayoutChange=false}={}) => `data-action="${esc(JSON.stringify(action))}"${allowLayoutChange===true?' data-allow-layout-change="true"':''}`;
  const button=options=>GameComponents.button(options,{icon});
  const actionButton=(action,extra='')=>button({label:action.label||action.type,icon:action.icon||'',attrs:actionAttr(action),variant:'game',className:extra});
  const actionBar = (actions, hint) => `<div class="scene-actions">${actions.map(a => actionButton(a)).join('')}${!actions.length && hint ? `<span class="scene-hint">${esc(hint)}</span>` : ''}</div>`;
  // A canonical artboard scales as a whole, including typography and frame.
  // main/compact are trusted pack HTML; neither contains interaction handlers.
  const {art}=GameComponents;
  const countBadge=(value,label,options={})=>assetArt('counter',{value,label,...options},params=>GameComponents.countBadge(params.value,params.label,params));
  const shipSilhouette=size=>assetArt('ship',{size},params=>GameComponents.shipSilhouette(params.size));
  const back = (kind = 'card') => `<span data-size-role="${kind==='card'?'card':'back'}" class="piece-back ${esc(kind)}-back art-card" role="img" aria-label="${globalThis.PlayroomMessages.text("ui.ui.c13a6680430c")}">${assetArt('card-back',{},GameComponents.cardBack)}</span>`;
  // Display indices only: game indices and private hands remain unchanged.
  function seatOrder(count,viewer=-1,sequence=null){
    const own=Number.isInteger(viewer)&&viewer>=0&&viewer<count;
    const order=Array.isArray(sequence)&&sequence.length===count&&new Set(sequence).size===count&&sequence.every(index=>Number.isInteger(index)&&index>=0&&index<count)?sequence:Array.from({length:count},(_,index)=>index);
    const start=own?order.indexOf(viewer)+1:0;return Array.from({length:own?count-1:count},(_,i)=>order[(start+i)%count]);
  }
  function playerOrderPosition(state,index){return (index-(Number.isInteger(state.firstPlayer)?state.firstPlayer:0)+state.players.length)%state.players.length+1;}
  // Tight paint bounds include the 2px round stroke; preserve the original glyph scale.
  const participantGlyphBounds={"player":[4,3,16,19],"bot-easy":[1,2,22,20],"bot-medium":[1,2,22,20],"bot-hard":[1,2,22,20],"host":[2,3,20,17],"hand":[1.37868,1,19.62132,22],"grid":[2,2,20,20],"eye":[1,4,22,16],"replacement":[3,2,18,20]};
  function participantGlyph(name){const b=participantGlyphBounds[name];return b?icon(name).replace('viewBox="0 0 24 24"',`viewBox="${b.join(' ')}" style="--role-ink-width:${b[2]};--role-ink-height:${b[3]}"`):icon(name);}
  function participantIcon(person={}, {network=person.network===true,avatar=false}={}) {
    const role=person.role==='table'?'grid':person.role==='spectator'?'eye':person.bot?'bot':person.local&&!person.isHost&&!person.primary?'hand':'player';
    const host=network&&person.isHost;
    const glyphs=(avatar&&['bot','hand'].includes(role)?participantGlyph(role==='bot'?'bot-'+(['easy','medium','hard'].includes(person.botSettings?.difficulty)?person.botSettings.difficulty:'medium'):'hand'):['grid','eye'].includes(role)?participantGlyph(role):'')+(person.replacement?participantGlyph('replacement'):'');
    const status=network&&!person.bot&&!person.local&&typeof person.connected==='boolean'&&(person.connected||person.hasConnected||Number.isFinite(person.joinedAt))?(person.connected?'online':'offline'):'neutral';
    const label=globalThis.PlayroomMessages.text("ui.ui.be876869eb2e",{p0:String(({grid:globalThis.PlayroomMessages.text("ui.ui.da639244db1d"),eye:globalThis.PlayroomMessages.text("ui.ui.9ae566816505"),bot:globalThis.PlayroomMessages.text('ui.ui.aa691043b447')+' · '+globalThis.PlayroomMessages.text('ui.bot-settings.'+(person.botSettings?.difficulty||'medium')),hand:'Hotseat',player:network?globalThis.PlayroomMessages.text("ui.ui.c0562fc31385"):globalThis.PlayroomMessages.text("ui.ui.f54f58cf08df")})[role]),p1:String(host?globalThis.PlayroomMessages.text("ui.ui.32c4ccc5277d"):''),p2:String(status==='online'?globalThis.PlayroomMessages.text("ui.ui.b74f9d035c25"):status==='offline'?globalThis.PlayroomMessages.text("ui.ui.1a19fe2fb654"):''),p3:String(person.replacement?globalThis.PlayroomMessages.text("ui.ui.389e565be3fa"):'')});
    const replacement=person.replacement?globalThis.PlayroomMessages.text("ui.ui.f4420ff3ee50",{p0:String(person.replacement.previousName?' '+person.replacement.previousName:''),p1:String(person.replacement.accepted===false?globalThis.PlayroomMessages.text("ui.ui.b8f9ffc5334a"):'')}):'';
    return `<span class="participant-role is-${status}${avatar?' is-avatar-role':''}" data-role-placement="${avatar?'avatar':'name'}" data-participant-role="${role}"${role==='bot'?` data-bot-difficulty="${['easy','medium','hard'].includes(person.botSettings?.difficulty)?person.botSettings.difficulty:'medium'}"`:''} data-connection="${status}" role="${replacement?'button':'img'}" aria-label="${esc(replacement?`${label} · ${replacement}`:label)}" title="${esc(replacement||label)}"${replacement?` tabindex="0" data-tooltip="${esc(replacement)}" data-player-replacement="true"`:''}>${glyphs}</span>`;
  }
  function viewPreferences(game,viewer,key,value){const storageKey='playroom.view-preferences.v1:'+game+':'+viewer;try{const data=JSON.parse(globalThis.localStorage.getItem(storageKey)||'{}');if(key&&/^[a-zA-Z][a-zA-Z0-9]{0,39}$/.test(key)&&typeof value==='string'&&value.length<=80){data[key]=value;globalThis.localStorage.setItem(storageKey,JSON.stringify(data));}return data&&typeof data==='object'?data:{};}catch(_){return {};}}
  function validIndicators(items){return Array.isArray(items)&&items.length<=8&&items.every(x=>x&&['ship','cards','pieces','dice'].includes(x.icon)&&Number.isSafeInteger(x.value)&&x.value>=0&&typeof x.label==='string'&&(x.size===undefined||Number.isInteger(x.size)&&x.size>=1&&x.size<=8)&&(x.dragPiece===undefined||typeof x.dragPiece==='string'&&x.dragPiece.length<=40)&&(x.complete===undefined||typeof x.complete==='boolean')&&(x.selected===undefined||typeof x.selected==='boolean')&&(x.vertical===undefined||typeof x.vertical==='boolean'));}
  function indicators(items=[]){if(!validIndicators(items))throw Error('Invalid player indicators');return `<span class="player-indicators">${items.map(x=>`<span class="player-indicator${x.icon==='ship'&&x.size?' fleet-indicator':''}${x.icon==='ship'&&x.value===0?' is-empty':''}${x.complete?' is-complete':''}${x.selected?' is-selected':''}"${x.dragPiece?` data-select="${esc(x.dragPiece)}" data-drag-piece="${esc(x.dragPiece)}" data-drag-shape="${x.size}:${x.vertical?'v':'h'}"${x.icon==='ship'&&x.size?` data-drag-segment="${Math.floor(x.size/2)}"`:''} role="button" tabindex="0"`:''} aria-label="${esc(x.label)}: ${x.value}" title="${esc(x.label)}: ${x.value}">${x.icon==='ship'&&x.size?shipSilhouette(x.size):icon(x.icon)}${x.size&&x.icon!=='ship'?`<span class="indicator-size" aria-hidden="true">${'▪'.repeat(x.size)}</span>`:''}<b>${x.value}</b></span>`).join('')}</span>`;}
  const playerPalette=globalThis.PlayroomPlayerPalette||(typeof require==='function'?require('./player-palette.js'):null);
  const playerColor=index=>{const role=['green','red','blue','yellow'][index],fallback=playerPalette?.[index]||'hsl('+Math.round(index*137.508%360)+' 46% 50%)';return 'var(--color-seat-'+index+','+(role?'var(--color-side-'+role+','+fallback+')':fallback)+')';};
  function avatar(person,index=0,{color=null,hidden=false}={}){
    const name=person.name||person.nickname||'',hotseat=!person.bot&&person.local&&!person.isHost&&!person.primary,symbolic=person.bot||hotseat,face=person.connectionOffline?icon('link-off'):symbolic?participantIcon(person,{avatar:true}):(globalThis.PlayroomAvatars?.content(person.avatar,name)??esc(Array.from(name)[0]||''))+participantIcon(person,{avatar:true});
    const label=name+(person.isHost?' · '+globalThis.PlayroomMessages.text('ui.ui.32c4ccc5277d'):'')+(person.connectionOffline?' · '+globalThis.PlayroomMessages.text('ui.resume.disconnected'):person.connectionRestored?' · '+globalThis.PlayroomMessages.text('ui.resume.connected'):'');
    return `<span class="avatar p${index}${symbolic?' is-symbol-avatar':''}${person.bot?' is-bot-avatar':''}${hotseat?' is-hotseat-avatar':''}${person.isHost?' is-host-avatar':''}" style="background:${color?esc(color):`color-mix(in srgb,${playerColor(index)} 65%,var(--color-surface-panel,#f4f2e8))`};color:var(--color-text-primary,#172b24)" ${hidden?'aria-hidden="true"':`role="img" aria-label="${esc(label)}" title="${esc(label)}"`}>${face}</span>`;
  }
  function validCounters(counters) {
    return Array.isArray(counters)&&counters.length<=4&&counters.every(c=>GameComponents.validMetric(c,{localized:true}))&&new Set(counters.map(c=>c.id||c.kind)).size===counters.length;
  }
  function scoreBadge(counter) {
    if(!validCounters([counter]))throw Error('Invalid player counters');
    const label=counter.label||(counter.kind==='wins'?globalThis.PlayroomMessages.text("ui.ui.8e5f4bb5654f"):counter.kind==='pieces'?globalThis.PlayroomMessages.text("ui.ui.24b775243171"):globalThis.PlayroomMessages.text("ui.ui.6cc0ad965516"));
    return assetArt('counter',{style:'score',...counter,label},params=>GameComponents.pieceTypes.badge.render(params,{roundTokenArt:Components.roundTokenArt}));
  }
  const teamPalette=Object.freeze(['blue','red','cyan','brown'].map((id,index)=>Object.freeze({id,color:['#668fad','#ce735d','#729d98','#aa844b'][index],colorRole:'team.'+id})));
  const standardTeam=team=>{const standard=teamPalette.find(value=>value.id===team?.id);return standard?{...team,color:standard.color,colorRole:standard.colorRole}:team;};
  function teamFor(layouts,preset,seat){
    const layout=layouts?.[preset];
    if(!layout||!Array.isArray(layout.seatTeams)||layout.seatTeams.length>32||!Array.isArray(layout.teams)||layout.teams.length>16||!Number.isInteger(seat)||seat<0)return null;
    const team=layout.teams.find(team=>team&&typeof team.id==='string'&&team.id===layout.seatTeams[seat]);
    return team&&typeof team.label==='string'&&(typeof team.color==='string'||typeof team.colorRole==='string')?standardTeam(team):null;
  }
  function playerMedallion({first=false,team=null,place=null,last=false,layout=null}={}) {
    team=standardTeam(team);
    if(!first&&!team&&place==null&&!last)return '';
    const label=last?globalThis.PlayroomMessages.text("ui.ui.last-player"):team?(first?globalThis.PlayroomMessages.text("ui.ui.5a0a57b96032",{p0:String(team.label)}):globalThis.PlayroomMessages.text("ui.ui.a0547497e28d",{p0:String(team.label)})):first?globalThis.PlayroomMessages.text("ui.ui.374e683d6421"):globalThis.PlayroomMessages.text("ui.ui.5e20b8d4db80",{p0:String(place)});
    const tone=last?'last':team?'team':place!=null?'place':'first';
    const literal=team&&/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(team.color||'')?team.color:'';
    const color=team&&/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(team.colorRole||'')?'var(--color-'+team.colorRole.replaceAll('.','-')+','+(literal||'currentColor')+')':literal;
    return `<span class="player-medallion is-${tone}${place!=null?` place-${place}${place>3?' is-minor':''}`:''}" role="img" aria-label="${esc(label)}" title="${esc(label)}"${color||layout?` style="${color?`--medallion-color:${esc(color)};`:''}${layout?`left:${layout.x}px;top:${layout.y}px;z-index:${layout.z};`:''}"`:''}>${roundTokenArt({value:place,first})}${last?'<span class="last-player-symbol" aria-hidden="true">×</span>':''}</span>`;
  }
  function playerContent(state, viewer, cardRender, options={}) {
    return state.players.map((person,index)=>{
      const semantic=state.scene?.players?.find(player=>player.player===index);
      const metrics=semantic?.metrics?.filter(metric=>['points','wins','pieces'].includes(metric.kind));
      const cards=semantic?.hand,open=cards?.some(card=>!card.hidden);
      const visible=cards||[];
      const handHTML=index===viewer?'':visible.map((card,i)=>card.hidden?(options.backRender?.()||cardRender?.(card,'disabled',{variant:'compact',surface:'opponent',interactive:false})||back(options.kind||'card')):`<span class="public-card" data-public-card-index="${i}">${cardRender?.(card,'disabled',{variant:'compact',surface:'opponent',interactive:false})||''}</span>`).join('');
      return {handHTML,next:typeof options.next==='function'?!!options.next(index,person):state.status==='playing'&&state.scene?.nextPlayer===index,turnPreview:options.turnPreview?.(index,person)||null,showHand:semantic?.showHand,countLabel:semantic?.countLabel||options.countLabel||globalThis.PlayroomMessages.text("ui.ui.c81b450ffa45"),ready:!!options.ready?.(index,person),decisionPlayer:options.decisionPlayer?.(index,person)??null,inactive:options.inactive?!!options.inactive(index,person):!!semantic?.inactive,orderPosition:semantic?.orderPosition??playerOrderPosition(state,index),indicators:options.indicators?.(index,person)||semantic?.indicators||[],...(metrics?{counters:metrics.map(({id,kind,value,label,display})=>({id,kind,value,label,...(display?{display}:{})}))}:options.counters?{counters:options.counters(index,person)}:{}),scoreLabel:options.scoreLabel||globalThis.PlayroomMessages.text("ui.ui.d7ab0767bbee"),...(Number.isSafeInteger(semantic?.handCount)?{handCount:semantic.handCount,handMetricId:'hand-count'}:cards?{handCount:cards.length,handMetricId:'hand-count'}:{}),open:!!open,badges:options.badges?.(index,person)||semantic?.badges||[],team:semantic?.team||options.team?.(index,person)||null,color:options.color?.(index,person)||'',colorLabel:options.colorLabel?.(index,person)||''};
    });
  }
  function playerPanel(state,index,viewer,content={},actions=[]) {
    const orderPosition=Number.isInteger(content.orderPosition)&&content.orderPosition>=1&&content.orderPosition<=8?content.orderPosition:playerOrderPosition(state,index);
    const next=typeof content.next==='boolean'?content.next:state.status==='playing'&&state.scene?.nextPlayer===index;
    const person=state.players[index],own=index===viewer,target=!own&&actions.some(a=>a.target===index&&a.targetKind==='player');
    const renderBadge=b=>GameComponents.pieceTypes.badge.status(b,{icon});
    const avatarBadges=(content.badges||[]).filter(b=>['avatar-bottom','avatar-center'].includes(b?.position)).map(renderBadge).join('');
    const badges=(content.badges||[]).filter(b=>!['avatar-bottom','avatar-center'].includes(b?.position)).map(renderBadge).join('');
    const counters=content.counters??[{kind:content.scoreKind||'points',value:Number.isSafeInteger(person.score)&&person.score>=0?person.score:0,label:content.scoreLabel||globalThis.PlayroomMessages.text("ui.ui.d7ab0767bbee")}];
    if(!validCounters(counters))throw Error('Invalid player counters');
    const headingCounter=content.headingCounter===undefined?null:counters.find(c=>c.id===content.headingCounter);
    const headingCounters=counters.filter(c=>content.headingCounters?.includes(c.id));
    const heading=headingCounter?(headingCounter.value>0?`<span class="player-heading-counter">${scoreBadge(headingCounter)}</span>`:''):content.orderPosition===false?'':`<span class="player-turn-position" aria-label="${globalThis.PlayroomMessages.text('ui.ui.ec2c9f35dee9')}${orderPosition}">${orderPosition}</span>`;
    const color=/^(#[0-9a-f]{3,8}|[a-z]+)$/i.test(content.color||'')?content.color:'';
    const preview=['positive','negative'].includes(content.turnPreview)?content.turnPreview:null;
    return `<article class="player-panel ${own?'self-player':'opponent-hand'} ${state.turn===index?'is-turn':''} ${content.open?'is-open-hand':''} ${content.inactive?'is-inactive':''} ${person.connectionOffline?'is-network-offline':''} ${person.connectionRestored?'is-network-returned':''} ${content.ready?'is-ready':''} ${next?'is-next':''} ${preview?'is-turn-preview-'+preview:''}" data-dom-key="player-panel-${index}" data-player-index="${index}"${preview?` data-turn-preview="${preview}"`:''}${next?' data-next-turn="true"':''}${state.turn===index?' aria-current="true"':''} ${target?`data-player-panel-target="${index}"`:""}${content.handCount!==undefined?` data-hand-count="${content.handCount}" style="--mini-hand-count:${Math.max(1,content.handCount)}"`:''}>
      <${target?'button':'div'} class="player-info player-token" ${target?`type="button" data-player-target="${index}" aria-haspopup="menu" aria-expanded="false" aria-label="${esc(globalThis.PlayroomMessages.text("ui.ui.ccc8d5ca0326",{name:person.name}))}"`:''}>
      <span class="player-avatar-wrap"${Number.isInteger(content.decisionPlayer)?` data-decision-player="${content.decisionPlayer}" role="button" tabindex="0" aria-label="${esc(person.name)}"`:""}>${avatar(person,index,{color})}${playerMedallion({first:content.showFirstPlayer!==false&&state.firstPlayer===index,team:content.team})}<span data-finish-award>${playerMedallion({place:state.scene?.players?.find(p=>p.player===index)?.finishPlace||null,last:state.result?.lastPlayers?.includes(index)||false})}</span><span data-gameplay-avatar-badges style="display:contents">${avatarBadges}</span></span><span class="player-details"><span class="player-heading"><strong>${esc(person.name)}${own&&content.showSelfLabel!==false?globalThis.PlayroomMessages.text("ui.ui.13292d3eac84"):""}</strong>${heading}${headingCounters.length?`<span class="player-heading-counters">${headingCounters.map(scoreBadge).join('')}</span>`:''}</span><span class="player-data"><span class="player-scores">${content.handCount!==undefined?countBadge(content.handCount,globalThis.PlayroomMessages.text("ui.ui.aac1090346a5",{p0:String(person.name),p1:String(content.countLabel||globalThis.PlayroomMessages.text("ui.ui.c81b450ffa45"))}),{hand:true}):''}${counters.filter(c=>c!==headingCounter&&!headingCounters.includes(c)).sort((a,b)=>(a.kind==='wins')-(b.kind==='wins')).map(scoreBadge).join('')}</span>${indicators(content.indicators)}${content.statusHTML?`<span class="player-status" style="--player-status-min-width:${Number.isInteger(content.statusMinWidth)?content.statusMinWidth:24}px">${content.statusHTML}</span>`:''}${content.colorLabel?`<span class="player-side">${esc(content.colorLabel)}</span>`:''}${badges?`<span class="player-badges">${badges}</span>`:''}</span></span></${target?'button':'div'}>
      ${own&&state.scene?.canvas?'<div data-sdk-player-input></div>':''}${own?'<!--self-controls-->':''}${!own&&content.showHand!==false&&content.handCount!==undefined?`<div class="player-hand">${content.handCount!==undefined?`<div class="mini-hand ${content.open?'is-open':''}"${Number.isSafeInteger(content.handMountOwner)?` data-sdk-hand-owner="${content.handMountOwner}" data-sdk-native-hand="mini"`:''} tabindex="${content.open?'0':'-1'}" aria-label="${globalThis.PlayroomMessages.text("ui.ui.e7e0d10b26d3")}${esc(person.name)}">${content.handHTML||''}</div>`:''}</div>`:''}${content.handoffSlot?'<!--handoff-control-->':''}</article>`;
  }
  function hand(content, count, hint=globalThis.PlayroomMessages.text("ui.ui.473a2525ab0a"), extraControlHTML='', options={}) {
    const cards=Array.isArray(content)?content:null,mount=Number.isSafeInteger(options.mountOwner)&&options.mountOwner>=0&&options.mountOwner<64,fan=options.layout==='fan'&&(cards?.length||mount),tiles=options.layout==='tiles',overlap=options.layout==='overlap'&&(cards?.length||mount),port=mount?' data-sdk-hand-owner="'+options.mountOwner+'" data-sdk-native-hand="own"':'';
    const layout=cards?GameComponents.handLayout(cards):null;
    let body=layout?layout.html:content;
    if(fan){
      body=`<div class="hand-fan-row ${count===1?'is-single':''}" style="--fan-count:${Math.max(1,count)}"${port}>${body}</div>`;
    }
    if(overlap){
      body=`<div class="hand-overlap-row" style="--hand-count:${Math.max(1,count)};grid-template-columns:${layout?.columns||''}"${port}>${body}</div>`;
    }
    return `<section class="own-hand" data-hand-count="${count}" aria-label="${globalThis.PlayroomMessages.text("ui.ui.2d10172eed3f")}"><div class="hand-heading"><strong>${globalThis.PlayroomMessages.text("ui.ui.2d10172eed3f")}</strong><span>${esc(hint)}</span>${extraControlHTML?`<div class="hand-tools">${extraControlHTML}</div>`:''}</div><div class="hand-track ${tiles?'is-tiles':''} ${fan?'is-fan':''} ${overlap?'is-overlapping':''} ${(fan&&count>8)||(tiles&&count>7)?'is-long-hand':''}" ${tiles?`style="--hand-columns:${Math.max(1,count)}"`:''}${!fan&&!overlap?port:''}>${body || ("<span class=\"empty-hand\">"+globalThis.PlayroomMessages.text("ui.ui.8c687618fd99")+"</span>")}</div></section>`;
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
  function boardTarget(action,{kind='move',color=null}={}) {
    if(!['move','capture','home'].includes(kind)||color!==null&&!/^#[0-9a-f]{6}$/i.test(color))throw Error('Invalid board target');
    return {className:action?'board-target target-'+kind:'',attrs:action?actionAttr(action):'',style:action&&color?`--target-fill:color-mix(in srgb,${color} 78%,white);--target-edge:${color};`:''};
  }
  const routeDot=()=>'<i class="board-route-dot" aria-hidden="true"></i>';
  function target(piece, action = null) {
    const exact = action && typeof action === 'object' && !Array.isArray(action);
    return `data-drop-piece="${esc(piece)}" ${exact ? actionAttr(action) : `data-drop-select="${esc(piece)}"`}`;
  }
  function cardAttrs(card, actions, selected) {
    return source(card.id, actions, selected, {mode: 'immediate'});
  }
  const svg = content => GameComponents.vector.viewport({width:300,height:180,content,attrs:'aria-hidden="true"'});
  const actionGroups=({start='',primary='',end='',exclusive=false,reserveRow=false})=>`<div class="game-action-bar"${exclusive?' data-exclusive="true"':''}${reserveRow?' data-reserve-row':''}><div data-action-position="start"${exclusive?' inert aria-hidden="true"':''}>${start}</div><div class="scene-actions" data-action-position="primary">${primary}</div><div data-action-position="end"${exclusive?' inert aria-hidden="true"':''}>${end}</div></div>`;
  function translator(catalogs) {
    const Localization = globalThis.PlayroomLocalization;
    if (!Localization) throw Error('Localization module is required');
    return new Localization.Translator({catalogs});
  }
  function choiceSlider({key,label,choices,value,disabled=false}){
    const index=Math.max(0,choices.findIndex(c=>c.value===value));
    return globalThis.PlayroomGameScreen.rangeSetting({id:'view-'+key,label,value:index,max:choices.length-1,display:choices[index].label,choices}).replace('<input ',`<input data-view-range="${esc(key)}" ${disabled?'disabled ':''}`);
  }
  // Shared public parameter diagram: fixed seats, no participant or game state.
  function parameterTableArt({numbers=false,shuffle=false,sourceSeat=null,currentSeat=null}={}){
    const V=GameComponents.vector,valid=seat=>Number.isInteger(seat)&&seat>=0&&seat<4;
    const chairs=[[18,35,14,14,25,42],[38,8,15,13,45.5,14.5],[67,8,15,13,74.5,14.5],[88,35,14,14,95,42]];
    let content='<circle data-round-table cx="60" cy="43" r="21" fill="currentColor" fill-opacity=".05"/><circle cx="60" cy="43" r="21"/>';
    content+=chairs.map(([x,y,w,h,cx,cy],i)=>`<g data-table-chair="${i+1}"${sourceSeat===i?' data-source-seat':''}${currentSeat===i?' data-current-seat':''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="currentColor" fill-opacity="${sourceSeat===i?'.24':currentSeat===i?'.16':'.07'}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5"/>${i===0?'<path d="M14 34V50"/>':i===3?'<path d="M106 34V50"/>':`<path d="M${x} ${y-4}H${x+w}"/>`}${numbers?V.text(i+1,{x:cx,y:cy+.5,size:9,weight:700,attrs:'data-seat-number stroke="none"'}):''}</g>`).join('');
    if(shuffle)content+=V.place(icon('shuffle'),{x:48,y:31,width:24,height:24});
    if(valid(sourceSeat)&&valid(currentSeat)&&sourceSeat!==currentSeat){
      const from=chairs[sourceSeat],to=chairs[currentSeat],dx=to[4]-from[4],dy=to[5]-from[5],length=Math.hypot(dx,dy),ux=dx/length,uy=dy/length,sx=from[4]+ux*10,sy=from[5]+uy*10,tx=to[4]-ux*12,ty=to[5]-uy*12;
      content+=`<path data-card-transfer d="M${sx} ${sy}L${tx} ${ty}M${tx-ux*6-uy*4} ${ty-uy*6+ux*4}L${tx} ${ty}L${tx-ux*6+uy*4} ${ty-uy*6-ux*4}"/>`;
    }
    if(valid(currentSeat))content+=V.text('Вы',{x:chairs[currentSeat][4],y:65,size:9,weight:600,attrs:'stroke="none"'});
    return V.viewport({width:120,height:72,attrs:'data-art-role="parameter-diagram" data-parameter-table fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"',content});
  }
  const helpers = {viewApi:3,parameterTableArt,choiceSlider,playerOrderPosition,playerColor,tokenLayout,assetArt,assetLayout,assetVariant,components:GameComponents,translator,teamPalette,teamFor,seatOrder,viewPreferences,indicators,avatar,playerMedallion,roundTokenArt,numberPath,numberMark,icon,button,actionGroups,art,esc,actionAttr,actionButton,actionBar,back,countBadge,participantIcon,scoreBadge,playerContent,playerPanel,hand,source,target,boardTarget,routeDot,cardAttrs,svg};
  function selectLayout(width,height){if(width>height&&height<=550)return 'phone-landscape';if(width<=760)return 'phone-portrait';return width>=1100?'desktop':'tablet';}
  const elementNames=Object.freeze(['participants','status','field','actions','hand','auxiliary','shared']);
  function motionSequence(value){
    if(value===undefined)return '';
    const anchor=point=>point&&typeof point==='object'&&typeof point.anchor==='string'&&/^[\w-]{1,80}$/.test(point.anchor)&&(point.label===undefined||typeof point.label==='string');
    if(!value||typeof value!=='object'||typeof value.trigger!=='string'||!value.entity||typeof value.entity!=='object'||!Number.isInteger(value.player)||value.player<0||typeof value.counter!=='string'||!anchor(value.origin)||!Array.isArray(value.steps)||value.steps.length>100||!value.steps.every(anchor)||(value.jump!==undefined&&!anchor(value.jump)))throw Error('Invalid motion sequence');
    GameComponents.entityKey(value.entity);
    if(value.departures!==undefined||value.arrival==='after-departures'){
      const ids=Array.isArray(value.departures)?value.departures.map(GameComponents.entityKey):[];
      if(value.arrival!=='after-departures'||ids.length<1||ids.length>32||new Set(ids).size!==ids.length||ids.includes(GameComponents.entityKey(value.entity)))throw Error('Invalid motion departures');
    }
    return ` data-motion-sequence="${esc(JSON.stringify(value))}"`;
  }
  // Public Table commands are supplied by the authority/model projection.
  // Layout does not grant a spectator the identity of an acting player.
  function tableCommands(state, actions) {
    return (state?.tableActions || []).filter(command => actions.some(action =>
      Object.keys(command).every(key => JSON.stringify(command[key]) === JSON.stringify(action[key]))));
  }
  function fieldContent(value) {
    if(!value||value.api!==3||!['cards','board'].includes(value.family)||typeof value.elements?.field!=='string'||!value.elements.field.trim())throw Error('Game elements API 3 required');
    if(value.fieldGroups===undefined)return value.elements.field;
    const groups=value.fieldGroups;
    if(!groups||Array.isArray(groups)||typeof groups!=='object'||Object.keys(groups).some(k=>!['stock','play'].includes(k))||Object.values(groups).some(html=>typeof html!=='string')||!groups.play)throw Error('Invalid field groups');
    return `<div class="game-field-groups" data-scene-scroll>${['stock','play'].filter(k=>groups[k]).map(k=>`<section class="field-group field-group-${k}" data-field-group="${k}">${groups[k]}</section>`).join('')}</div>`;
  }

  function composeSceneValue(value,{surface='combined',state=null,viewer=-1,actions=[],selection=null,seating='auto',seatingPolicy=null,presentationTurn=null,presentationField=false}={}) {
    if(!value||value.api!==3||!['cards','board'].includes(value.family)||!value.elements||typeof value.elements.field!=='string'||!value.elements.field.trim())throw Error('Game elements API 3 required');
    if(Object.keys(value.elements).some(key=>!elementNames.includes(key))||Object.values(value.elements).some(html=>typeof html!=='string'))throw Error('Invalid game elements');
    LayoutPolicy.validate(value,state?.players?.length);
    if(value.showTurn===false){state={...state,turn:-1};presentationTurn=-1;}
    const layout=value.layout||{},overrides=layout.overrides||{};
    const overrideAttrs=(overrides.fieldColumns?' data-field-columns="3"':'')+(overrides.opponentsAlign?' data-opponents-align="'+overrides.opponentsAlign+'"':'')+(overrides.playerIndicators?' data-player-indicators="'+overrides.playerIndicators+'"':'')+(overrides.mirrorIndicators?' data-mirror-indicators="true"':'');
    const focus=layout.focus||(value.family==='board'?'field':'balanced');
    const strategy=layout.seats&&(state?.players?.length||0)>=2&&(seatingPolicy||seating)!=='row'?'anchors':'row';
    const anchored=strategy==='anchors',circular=strategy!=='row'&&surface!=='player'&&(state?.players?.length||0)>=2;
    // Counts may describe a hand limit; an explicitly hidden hand reserves no lane.
    const opponentHands=(value.playerContent||[]).some((p,i)=>i!==viewer&&p.showHand!==false&&(Number.isInteger(p.handCount)?p.handCount>0:!!p.handHTML));
    const className=typeof value.className==='string'?value.className:'';
    if(surface==='table')actions=tableCommands(state,actions);
    const e={...value.elements},content=value.playerContent;
    const zoneAttribute=name=>{const id=name==='hand'?'hand-'+viewer:name;return state?.scene?.zones?.some(zone=>zone.id===id)?` data-scene-zone="${esc(id)}"`:'';};
    // A hidden public field must not take a selected private card's targets away.
    if(surface==='player'&&selection!==null){
      const missing=actions.filter(action=>String(action.card)===String(selection)&&!(e.actions||'').includes(actionAttr(action)));
      if(missing.length)e.actions=(e.actions||'')+actionBar(missing);
    }
    if(value.actionReserve&&(surface!=='table'||state?.scene?.audience==='public')&&!e.actions)e.actions='<div class="scene-actions"></div>';
    if(content!==undefined&&(!Array.isArray(content)||(state?.players&&content.length!==state.players.length)||content.some(p=>!p||typeof p!=='object'||Array.isArray(p)||['scoreLabel','countLabel','color','colorLabel','statusHTML'].some(k=>p[k]!==undefined&&typeof p[k]!=='string')||(p.statusMinWidth!==undefined&&(!Number.isInteger(p.statusMinWidth)||p.statusMinWidth<24||p.statusMinWidth>320))||(p.showFirstPlayer!==undefined&&typeof p.showFirstPlayer!=='boolean')||(p.showSelfLabel!==undefined&&typeof p.showSelfLabel!=='boolean')||(p.orderPosition!==undefined&&p.orderPosition!==false&&(!Number.isInteger(p.orderPosition)||p.orderPosition<1||p.orderPosition>8))||(p.headingCounters!==undefined&&(!Array.isArray(p.headingCounters)||p.headingCounters.some(id=>typeof id!=='string'||!p.counters?.some(c=>c.id===id))))||(p.headingCounter!==undefined&&(typeof p.headingCounter!=='string'||!p.counters?.some(c=>c.id===p.headingCounter)))||(p.team!==undefined&&p.team!==null&&(!p.team||typeof p.team.label!=='string'||(typeof p.team.color!=='string'&&typeof p.team.colorRole!=='string')))||(p.indicators!==undefined&&!validIndicators(p.indicators))||(p.counters!==undefined&&!validCounters(p.counters))||(p.open!==undefined&&typeof p.open!=='boolean')||(p.handHTML!==undefined&&typeof p.handHTML!=='string')||(p.handCount!==undefined&&(!Number.isSafeInteger(p.handCount)||p.handCount<0))||(p.badges!==undefined&&(!Array.isArray(p.badges)||p.badges.some(b=>typeof b!=='string'&&(!b||typeof b.label!=='string'||(b.color!==undefined&&!/^#[0-9a-f]{6}$/i.test(b.color))||(b.position!==undefined&&!['avatar-bottom','avatar-center'].includes(b.position))||(b.value!==undefined&&(!Number.isSafeInteger(b.value)||b.value<1))||(b.icon!==undefined&& !['sword','shield','takeCards','adjustDie','lessDie','skipTurn','secondDie','extraTurn','host'].includes(b.icon)))))))))throw Error('Invalid player content');
    e.field=fieldContent(value);
    const unified=!!state?.players;
    let self='';
    if(unified&&!value.hidePlayers){
      const order=seatOrder(state.players.length,viewer);
      if(circular&&viewer>=0&&surface!=='table')order.push(viewer);
      const panels=order.map(i=>({player:i,html:playerPanel(state,i,viewer,content?.[i]||{},actions)}));
      if(circular){
        const groups=new Map();
        for(const panel of panels){
          const relative=viewer>=0?(panel.player-viewer+state.players.length)%state.players.length:panel.player;
          const seat=layout.seats?.[panel.player]||['south-east','south-west','north-west','north-east'][Math.ceil(relative*4/state.players.length)%4];
          if(!groups.has(seat))groups.set(seat,[]);groups.get(seat).push((panel.player===viewer?panel.html.replace(' is-turn','').replace(' aria-current="true"',''):panel.html).replace(`data-player-index="${panel.player}"`,`data-player-index="${panel.player}" data-seat="${seat}"${panel.player===viewer?` data-seat-copy="true"${layout.duplicateSelf?'':' data-portrait-copy="true"'}`:''}`));
        }
        e.participants=`<div class="players-panels opponent-hands" data-opponent-count="${panels.filter(panel=>panel.player!==viewer).length}">${[...groups].map(([seat,html])=>`<div class="seat-group seat-${seat}" data-seat-group="${seat}">${(seat.endsWith('west')?html.reverse():html).join('')}</div>`).join('')}</div>`;
      }else e.participants=`<div class="players-panels opponent-hands" data-opponent-count="${panels.filter(panel=>panel.player!==viewer).length}">${panels.map(panel=>panel.html).join('')}</div>`;
      if(viewer>=0&&surface!=='table')self=`<section class="layout-self" data-game-element="self">${playerPanel(state,viewer,viewer,{...content?.[viewer],showSelfLabel:false,handoffSlot:!layout.duplicateSelf},[])}${e.actions?`<section class="game-layout-slot layout-actions" data-game-element="actions">${e.actions}</section>`:''}${e.hand?`<section class="game-layout-slot layout-hand" data-game-element="hand"${zoneAttribute('hand')}>${e.hand}</section>`:''}</section>`;
    }
    if(unified&&viewer>=0&&surface!=='table'&&layout.duplicateSelf)self+='<div class="handoff-corner"><!--handoff-control--></div>';
    const slots=elementNames.filter(name=>e[name]&&!(self&&['actions','hand'].includes(name))&&!(surface==='table'&&(name==='hand'||name==='actions'&&state?.scene?.audience!=='public'))).map(name=>`<section class="game-layout-slot layout-${name}" data-game-element="${name}"${zoneAttribute(name)}${name==='field'&&value.fieldAspect?` style="--field-aspect:${value.fieldAspect}"`:''}>${name==='field'?`<div class="game-field-content"${value.fieldDropZone?' data-drop-zone':''}${presentationField?' inert data-presentation-field="true"':''}>${e[name]}</div>`:e[name]}</section>`).join('');
    return `<div class="game-scene app-game-layout ${esc(className)}" data-view-api="3"${overrideAttrs} data-field-topology="${esc(state?.scene?.geometry?.topology||'')}"${value.showTurn===false?' data-show-turn="false"':''} data-appearance-pack="${esc(state?.game||'')}"${Array.isArray(value.skinFamilies)?` data-skin-families="${esc(JSON.stringify(value.skinFamilies))}"`:''}${value.hidePlayers?' data-solo-field="true"':''}${value.actionPlacement?' data-action-placement="'+value.actionPlacement+'"':''} data-player-count="${state?.players?.length||0}" data-turn-player="${state?.turn??-1}"${Number.isInteger(presentationTurn)?` data-presentation-turn="${presentationTurn}"`:""} data-layout-focus="${focus}" data-wide-hand="${value.layout?.wideHand===true}" data-seating="${circular?'circle':'row'}" data-seat-anchors-available="true" data-seat-style="${anchored?'anchors':'edge'}" data-opponent-hands="${!!opponentHands}"${anchored?' data-seat-anchors="true"':''} data-has-hand="${!!e.hand&&(content?.[viewer]?.handCount===undefined||content[viewer].handCount>0)}"${unified?' data-player-layout="unified"':''}${value.actionReserve?' data-action-reserve="true"':''}${motionSequence(value.motionSequence)} data-field-sizing="${value.fieldSizing||'fit'}" data-layout-family="${value.family}" data-surface="${esc(surface)}">${slots}${self}</div>`;
  }

  function composeScene(value,context={}) {
    const previousPack=renderingPack;
    try {renderingPack=context.state?.game||previousPack;return composeSceneValue(value,context);}
    finally {renderingPack=previousPack;}
  }

  function createRegistry() {
    const packs = new Map(),regionOwners=new WeakMap();
    function withRegions(state,viewer,ui,lane,render,run){
      const {renderOwner:owner,regionSink,...safeUI}=ui;
      if(!owner||!['object','function'].includes(typeof owner))return run(safeUI);
      let lanes=regionOwners.get(owner);if(!lanes){lanes=new Map();regionOwners.set(owner,lanes);}
      const scope=[state.game,state.packVersion,viewer,state.scene?.audience,ui.surface||'combined',!!ui.replay,!!ui.hotseat,render,globalThis.PlayroomAssetResolver,globalThis.document?.documentElement.dataset.assetGeometry,globalThis.document?.documentElement.dataset.appearanceMode];
      let entry=lanes.get(lane);
      if(!entry||entry.scope.some((value,i)=>value!==scope[i])){entry={scope,regions:new Map()};lanes.set(lane,entry);}
      const emit=(id,markup)=>{
        if(!regionSink)return markup;
        const key=lane+':'+id;regionSink.set(key,markup);
        return `<template data-scene-fragment="${esc(key)}"></template>`;
      };
      const used=new Set(),region=(id,dependencies,build)=>{
        if(typeof id!=='string'||!id||id.length>80||typeof build!=='function')throw Error('Invalid scene region');
        const signature=JSON.stringify(dependencies);if(signature===undefined)throw Error('Invalid scene region dependencies');
        used.add(id);const previous=entry.regions.get(id);if(previous?.signature===signature)return emit(id,previous.markup);
        const markup=build();if(typeof markup!=='string')throw Error('Invalid scene region markup');
        if(entry.regions.has(id)||entry.regions.size<128)entry.regions.set(id,{signature,markup});return emit(id,markup);
      };
      // Frame renderers are local presentation ports, never serialized scene data.
      // Their lifetime has the same viewer/pack/skin boundary as cached regions.
      const frameKeys=new Set(),publicFrames=regionSink?options=>{
        const {key,plan,renderFrame,live,...labels}=options;
        if(typeof key!=='string'||!key||key.length>80||typeof renderFrame!=='function'||!plan||!Array.isArray(plan.groups)||plan.groups.length>64||plan.initial!==0||plan.final!==plan.groups.length)throw Error('PUBLIC_PLAN_INVALID');
        frameKeys.add(key);entry.frames||=new Map();let source=entry.frames.get(key);
        if(!source||source.id!==plan.id){
          const records=new Map();source={id:plan.id,count:plan.final+1,read(index){
            if(!Number.isInteger(index)||index<0||index>=this.count)throw Error('PUBLIC_FRAME_INVALID');
            if(index===this.count-1)return this.live;
            if(!records.has(index)){
              const record=this.render(index);
              if(!record||typeof record.markup!=='string'||typeof record.label!=='string')throw Error('PUBLIC_FRAMES_INVALID');
              records.set(index,record);
            }
            return records.get(index);
          }};entry.frames.set(key,source);
        }
        const frame=(build)=>{const fragments=new Map(),region=(id,markup)=>{if(typeof id!=='string'||!id||id.length>80||typeof markup!=='string'||fragments.has(id)||fragments.size>=256)throw Error('Invalid frame fragment');fragments.set(id,markup);return `<template data-scene-fragment="${esc(id)}"></template>`;};const record=build({region});return {...record,fragments};};
        source.render=index=>{const previous=renderingPack;try{renderingPack=state.game;return frame(context=>renderFrame(index,context));}finally{renderingPack=previous;}};source.live=typeof live==='function'?frame(live):live;
        const id=lane+':'+key;(regionSink.publicFrames||=new Map()).set(id,source);
        return GameComponents.publicFrames({...labels,plan,source:{id,initial:{markup:'',label:source.live.label}}});
      }:undefined;
      if(publicFrames)publicFrames.supportsFragments=true;
      const result=run({...safeUI,region,...(publicFrames?{publicFrames}:{})});
      for(const id of entry.regions.keys())if(!used.has(id))entry.regions.delete(id);
      for(const id of entry.frames?.keys()||[])if(!frameKeys.has(id))entry.frames.delete(id);
      return result;
    }
    return {
      register(id,render,cover,options={}) {
        if(typeof render!=='function'||(cover!=null&&typeof cover!=='function'))throw Error('Invalid game view');
        const surfaces=options?.surfaces||{};
        if(typeof surfaces!=='object'||Array.isArray(surfaces)||Object.entries(surfaces).some(([key,fn])=>!['table','player'].includes(key)||typeof fn!=='function'))throw Error('Invalid view surfaces');
        if(options.illustrations!==undefined&&typeof options.illustrations!=='function')throw Error('Invalid rule illustrations');
        if(options.reveal!==undefined&&typeof options.reveal!=='function')throw Error('Invalid reveal renderer');
        if(options.seating!==undefined&&options.seating!=='row')throw Error('Invalid seating policy');
        packs.set(id,{render,cover,illustrations:options.illustrations,reveal:options.reveal,seating:options.seating,surfaces:Object.freeze({...surfaces})});
      },
      registerTutorial(id,tutorial){const pack=packs.get(id);if(!pack||typeof tutorial!=='function')throw Error('Invalid tutorial');pack.tutorial=tutorial;},
      reveal(id,value){const previousPack=renderingPack;try{renderingPack=id;return packs.get(id)?.reveal?.(value)||'';}catch(_){return '';}finally{renderingPack=previousPack;}},
      illustration(id,key){if(typeof key!=='string'||!/^[-a-zA-Z0-9._]+$/.test(key))return '';const previousPack=renderingPack;try{renderingPack=id;return packs.get(id)?.illustrations?.(key)||'';}finally{renderingPack=previousPack;}},
      supports(id,surface='combined'){return !!packs.get(id) && (surface==='combined'||typeof packs.get(id).surfaces[surface]==='function');},
      get(id){return packs.get(id);},
      remove(id){return packs.delete(id);},
      renderField(state,viewer,scene,ui={}) {
        const {data,modelProjection,...semantic}=state;
        if(!scene||scene.audience!==state.scene?.audience)throw Error('Field audience mismatch');
        const surface=ui.surface||'combined',item=packs.get(state.game),render=surface==='combined'?item?.render:item?.surfaces[surface];
        if(!render)throw Error('Field renderer unavailable');
        const previousPack=renderingPack;
        try {
          renderingPack=state.game;
          const fieldState={...semantic,scene:{...scene,interactions:[]}},fieldUI={...ui,fieldScene:null,selected:null,viewState:{},replay:true};
          const value=withRegions(fieldState,viewer,fieldUI,'field',render,context=>render(fieldState,viewer,[],context));
          return fieldContent(value);
        }finally{renderingPack=previousPack;}
      },
      render(state,viewer,actions,ui={}){
        // Rendering receives semantics only; rule projections remain authority inputs.
        const {data,modelProjection,...sceneState}=state;state=sceneState;
        // The recipe matches decorated labels to wire choices without receiving rule state.
        if(modelProjection)ui={...ui,commandChoices:modelProjection.actions};
        if(ui.displayScene){
          if(ui.displayScene.audience!==state.scene?.audience||ui.displayScene.viewer!==state.scene?.viewer)throw Error('Scene audience mismatch');
          state={...state,scene:{...ui.displayScene,interactions:[]}};actions=[];
        }
        const previousPack=renderingPack;try { renderingPack=state.game; const item=packs.get(state.game),surface=ui.surface||'combined',render=surface==='combined'?item?.render:item?.surfaces[surface]; if(!render)return ("<p class=\"scene-hint\">"+globalThis.PlayroomMessages.text("ui.ui.31b2f9c7d8e5")+"</p>");const allowedActions=surface==='table'?tableCommands(state,actions):actions;const value=withRegions(state,viewer,ui,'scene',render,context=>{const value=render(state,viewer,allowedActions,context),aux=value?.elements?.auxiliary;
          return context.region&&value?.api===3&&typeof aux==='string'&&aux&&!aux.includes('data-scene-fragment')?{...value,elements:{...value.elements,auxiliary:context.region('__sdk_auxiliary',[aux],()=>'<div style="display:contents">'+aux+'</div>')}}:value;});
          let recipe=value;
          if(ui.fieldScene){
            if(ui.fieldScene.audience!==state.scene?.audience)throw Error('Field audience mismatch');
            // SDK fields have mounted DOM owners. Only an HTML-owned field
            // needs a second view recipe for the presentation checkpoint.
            const field=value?.fieldPort?value.fieldPort(ui.fieldScene):this.renderField(state,viewer,ui.fieldScene,ui);
            if(field!==value?.elements?.field||value.fieldGroups)recipe={...value,fieldGroups:undefined,elements:{...value.elements,field}};
          }
          return composeScene(recipe,{surface,state,viewer,presentationField:!!ui.fieldScene,actions:allowedActions,selection:ui.selected,presentationTurn:ui.presentationTurn,seatingPolicy:item.seating,seating:ui.seating||globalThis.PlayroomAppBridge?.gameOptions?.(state.game).seating||'auto'}); }
        catch (error) { ui.onRenderError?.(error);return ("<p class=\"scene-hint\" role=\"alert\">"+globalThis.PlayroomMessages.text("ui.ui.a3179ce31aab")+"</p>"); } finally {renderingPack=previousPack;}
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
