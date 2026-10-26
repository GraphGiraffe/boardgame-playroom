if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomGameScreen=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const UI=root.TabletopUI||(typeof module==='object'&&module.exports?require('../core/ui.js'):null);
  const icon=UI.icon;
  function tileTheme(manifest={}){
    return ['green','coral','blue','gold','violet'].includes(manifest.tileTheme)?manifest.tileTheme:({cards:'green',board:'gold',dice:'violet'})[manifest.category]||'green';
  }
  function packRow({id,version='',name,manifest={},attrs='',selectable=false,controls='',detail='',nameSuffix='',usageDescription=''}={}){
    const tag=selectable?'button':'li',cover=root.PlayroomViews?.cover(id)||icon('board');
    return `<${tag} ${selectable?'type="button"':''} class="pack-row ${selectable?'pack-item':'pack-entry'}" data-pack-id="${esc(id)}" data-pack-version="${esc(version)}" ${attrs}><span class="pack-art" data-theme="${tileTheme(manifest)}" aria-hidden="true">${cover}</span><span class="pack-summary"><strong>${esc(name||manifest.name||id)}${nameSuffix?`<span class="pack-usage" title="${esc(usageDescription)}"> · ${esc(nameSuffix)}</span>`:''}</strong><small class="pack-version">${esc(id)} · ${esc(version)}</small>${detail}</span>${controls?`<div class="pack-row-controls">${controls}</div>`:''}</${tag}>`;
  }
  function gameTitle(name,shortName='',{tag='h1'}={}){
    if(!['h1','h2'].includes(tag))throw Error('Invalid title tag');
    return `<${tag} data-game-title data-full-title="${esc(name)}" data-short-title="${esc(shortName)}" title="${esc(name)}">${esc(name)}</${tag}>`;
  }
  function fitGameTitles(host){
    for(const node of host?.querySelectorAll?.('[data-game-title]')||[]){
      node.style.removeProperty('font-size');
      const win=node.ownerDocument.defaultView,base=parseFloat(win.getComputedStyle(node).fontSize),minimum=14;
      const tableTitle=node.closest('.table-title');
      if(tableTitle){
        node.textContent=node.dataset.fullTitle;
        for(const size of [base,...(root.PlayroomSizeCatalogue?.families.type||[14,16,18,20]).filter(n=>n>=minimum&&n<base).sort((a,b)=>b-a)]){
          node.style.fontSize=size+'px';
          const line=parseFloat(win.getComputedStyle(node).lineHeight);
          if(node.scrollWidth<=node.clientWidth+1&&node.scrollHeight<=line*2+1)break;
        }
        const line=parseFloat(win.getComputedStyle(node).lineHeight);
        tableTitle.classList.toggle('has-wrapped-title',node.scrollHeight>line+1);
        continue;
      }
      const sizes=[base,...(root.PlayroomSizeCatalogue?.families.type||[14,16,18,20]).filter(n=>n>=minimum&&n<base).sort((a,b)=>b-a)];
      for(const text of [...new Set([node.dataset.fullTitle,node.dataset.shortTitle].filter(Boolean))]){
        node.textContent=text;
        for(const size of sizes){node.style.fontSize=size+'px';if(node.scrollWidth<=node.clientWidth+1)break;}
        if(node.scrollWidth<=node.clientWidth+1)break;
      }
    }
  }
  function fitCovers(host){
    for(const svg of host?.querySelectorAll?.('.game-cover svg,.pack-art svg')||[]){
      const art=svg.querySelector('[data-cover-art]');if(!art||typeof art.getBBox!=='function')continue;
      const box=art.getBBox();if(!box.width||!box.height)continue;
      const size=Math.max(box.width,box.height),pad=size*(svg.closest('.game-cover')?.02:.06),shadowPad=size*.06,shadow=svg.querySelector('[data-cover-shadow]');
      if(shadow){shadow.setAttribute('cx',box.x+box.width/2);shadow.setAttribute('cy',box.y+box.height+shadowPad*.2);shadow.setAttribute('rx',box.width*.44);shadow.setAttribute('ry',shadowPad*.35);}
      const bottomPad=shadow?Math.max(pad,shadowPad*.6):pad;
      svg.setAttribute('viewBox',`${box.x-pad} ${box.y-pad} ${box.width+pad*2} ${box.height+pad+bottomPad}`);
      svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    }
  }
  function rangeSetting({id,label,min=0,max=3,step=1,value,display,describedby='',bounds=false,name='',choices=null}){
    const stops=Array.from({length:Math.round((max-min)/step)+1},(_,i)=>min+i*step);
    return `<label class="settings-range" for="${esc(id)}" style="--range-progress:${(value-min)/(max-min)*100}%;--range-allowed:100%"><span class="settings-range-heading"><span>${esc(label)}</span><output id="${esc(id)}-value" for="${esc(id)}">${esc(display)}</output></span><span class="settings-range-track"><input type="range" id="${esc(id)}"${name?` name="${esc(name)}"`:""}${choices?` data-choice-options="${esc(JSON.stringify(choices))}"`:""} min="${min}" max="${max}" step="${step}" value="${value}" aria-valuetext="${esc(display)}"${describedby?` aria-describedby="${esc(describedby)}"`:''}><span class="settings-range-dots" aria-hidden="true">${stops.map(stop=>`<i data-range-stop="${stop}" style="left:${(stop-min)/(max-min)*100}%"></i>`).join('')}</span></span>${bounds?`<span class="settings-range-bounds" aria-hidden="true"><span>${min}%</span><span>${max}%</span></span>`:''}</label>`;
  }
  // Discrete tokens keep root geometry in screen pixels; nested field art is measured separately.
  function layoutRect(node){
    const r=node.getBoundingClientRect(),scale=1;
    return {x:r.x/scale,y:r.y/scale,left:r.left/scale,right:r.right/scale,top:r.top/scale,bottom:r.bottom/scale,width:r.width/scale,height:r.height/scale};
  }
  function iconButton(attrs,label,name,{disabled=false,active,className='',type='button'}={}){
    return UI.button({attrs,label:'',ariaLabel:label,icon:name,variant:'outline',disabled,active,className,type});
  }
  function addPlayerButton({disabled=false}={}){
    return iconButton('id="network-pair-button"',globalThis.PlayroomMessages.text("ui.game-screen.c58470ab336f"),'addPlayer',{disabled});
  }
  let quickActions=[];
  function quickAccessMarkup({exclude=[]}={}){return `<div class="settings-shortcuts" role="group" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.69093f8d2817")}">${quickActions.filter(action=>!action.attrs.includes('data-command="settings"')&&action.name!=='palette'&&!exclude.includes(action.name)).map(action=>iconButton(action.attrs+' data-quick-shortcut',action.label,action.name,action)).join('')}</div>`;}
  function toolbar(actions,{showSettings=true,settingsAttrs='data-command="settings"',compact=false}={}){
    // Context actions grow to the left; fullscreen and settings keep fixed right slots.
    const appearance=showSettings&&root.PlayroomAppearanceUI?[{attrs:'data-appearance-picker',label:root.PlayroomAppearanceUI.text('themes.quick'),name:'palette',hidden:true}]:[];
    const ordered=[...actions.filter(a=>a.name!=='full').map(a=>a.name==='help'?{...a,hidden:compact||a.hidden}:a),...appearance,...actions.filter(a=>a.name==='full')];
    if(showSettings)ordered.push({attrs:settingsAttrs,label:globalThis.PlayroomMessages.text("ui.game-screen.985b5e0f2ccf"),name:'settings'});
    quickActions=ordered;return [...ordered.filter(action=>!action.hidden&&!['full','settings'].includes(action.name)).slice(0,2),...ordered.filter(action=>!action.hidden&&['full','settings'].includes(action.name))].map(a=>iconButton(a.attrs,a.label,a.name,a)).join('');
  }
  const modalHead=title=>`<header class="modal-head ui-dialog-head">${iconButton('data-command="close-modal"',globalThis.PlayroomMessages.text("ui.game-screen.a7a4033657e8"),'close')}<h2>${esc(title)}</h2></header>`;
  function actionConfirmationMarkup(action,command='confirm-action'){
    return `<h2>${esc(root.PlayroomMessages.text('ui.game-screen.action-confirmation'))}</h2><p class="lead">${esc(action.confirmation)}</p><div class="modal-foot">${UI.button({attrs:'data-command="close-modal"',label:root.PlayroomMessages.text('ui.game-screen.cancel-action'),variant:'secondary'})}${UI.button({attrs:`data-command="${esc(command)}"`,label:action.label||root.PlayroomMessages.text('ui.game-screen.confirm-action')})}</div>`;
  }
  function confirmDialog(message){
    const document=root.document,previous=document.activeElement;
    const dialog=document.createElement('dialog');
    dialog.className='appearance-dialog app-confirm-dialog';
    dialog.setAttribute('aria-labelledby','app-confirm-title');
    dialog.setAttribute('aria-describedby','app-confirm-message');
    dialog.innerHTML=`<header class="appearance-head"><h2 id="app-confirm-title">${esc(root.PlayroomMessages.text('ui.game-screen.action-confirmation'))}</h2></header><div class="appearance-body"><p id="app-confirm-message">${esc(message)}</p></div><div class="appearance-actions appearance-confirm-actions"><button type="button" class="btn secondary" data-confirm-cancel>${esc(root.PlayroomMessages.text('ui.game-screen.cancel-action'))}</button><button type="button" class="btn" data-confirm-accept>${esc(root.PlayroomMessages.text('ui.game-screen.confirm-action'))}</button></div>`;
    document.body.append(dialog);
    return new Promise(resolve=>{
      let finished=false;
      const finish=value=>{
        if(finished)return;finished=true;
        dialog.close();dialog.remove();
        if(previous?.isConnected)previous.focus({preventScroll:true});
        resolve(value);
      };
      dialog.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();finish(false);}});
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false);});
      dialog.addEventListener('close',()=>finish(false));
      dialog.querySelector('[data-confirm-cancel]').onclick=()=>finish(false);
      dialog.querySelector('[data-confirm-accept]').onclick=()=>finish(true);
      dialog.showModal();
      dialog.querySelector('[data-confirm-cancel]').focus();
    });
  }
  function modalContent(content){
    const template=root.document.createElement('template');template.innerHTML=content;
    const head=template.content.querySelector('.modal-head');
    const header=head?.outerHTML||'';head?.remove();
    const footer=template.content.querySelector('[data-fixed-footer],.modal-foot')||template.content.querySelector('form:not([data-inline-actions])>button[type="submit"]:last-child');
    if(footer){
      footer.setAttribute('data-fixed-footer','');
      const form=footer.closest('form');
      if(form){
        if(!form.id)form.id='modal-parameters-form';
        for(const control of [footer,...footer.querySelectorAll('button,input')]){
          if(control.matches('button,input'))control.setAttribute('form',form.id);
        }
      }
    }
    const footerMarkup=footer?.outerHTML||'';footer?.remove();
    return header+'<div class="modal-body">'+template.innerHTML+'</div>'+footerMarkup;
  }
  const DOM=root.PlayroomDOM||(typeof require==='function'?require('../platform/web/dom.js'):null),{patchChildren}=DOM;
  const pendingScroll=new WeakMap(), fixedLayouts=new WeakMap(), renderedTrees=new WeakMap(), handReserves=new WeakMap();
  function reservePlayerHand(panel,height){
    if(!height)return;
    let hand=panel.querySelector('.player-hand');
    if(!hand){hand=panel.ownerDocument.createElement('div');hand.className='player-hand';hand.setAttribute('aria-hidden','true');hand.setAttribute('inert','');panel.append(hand);}
    hand.style.minHeight=height+'px';
  }
  function handReserveKey(host,shell,stage){
    const win=host.ownerDocument.defaultView;
    return JSON.stringify([shell.dataset.layoutIdentity,win.innerWidth,win.innerHeight,root.PlayroomInterfaceScale?.applied,stage.dataset.surface,host.ownerDocument.documentElement.dataset.assetGeometry]);
  }
  // Resize does not necessarily render new markup: discard old viewport measurements first.
  function resetHandReserveForViewport(host,stage){
    const reserve=handReserves.get(host),shell=host.querySelector('.table-shell');
    if(!reserve||!shell||reserve.key===handReserveKey(host,shell,stage))return;
    handReserves.delete(host);
    for(const hand of stage.querySelectorAll('.layout-hand,.player-hand'))hand.style.removeProperty('min-height');
  }
  // Keep only geometry, never old cards, commands or private markup.
  function reserveHands(host,next){
    const shell=next.querySelector('.table-shell'),stage=next.querySelector('.app-game-layout');
    if(!shell||!stage){handReserves.delete(host);return;}
    const key=handReserveKey(host,shell,stage);
    let reserve=handReserves.get(host);
    const same=reserve?.key===key;
    if(!same){reserve={key,own:0,players:new Map()};handReserves.set(host,reserve);}
    if(same){
      const previous=host.querySelector('.app-game-layout'),hand=previous?.querySelector('.layout-hand');
      if(hand)reserve.own=Math.max(reserve.own,hand.offsetHeight);
      for(const panel of previous?.querySelectorAll('.player-panel')||[]){
        const mini=panel.querySelector('.player-hand');
        if(mini)reserve.players.set(panel.dataset.playerIndex,Math.max(reserve.players.get(panel.dataset.playerIndex)||0,mini.offsetHeight));
      }
    }
    if(reserve.own){
      let hand=stage.querySelector('.layout-hand');
      const parent=stage.querySelector('.layout-self')||stage;
      if(!hand){hand=host.ownerDocument.createElement('section');hand.className='game-layout-slot layout-hand';hand.dataset.gameElement='hand';hand.setAttribute('aria-hidden','true');hand.setAttribute('inert','');parent.append(hand);}
      hand.style.minHeight=reserve.own+'px';
      stage.dataset.hasHand='true';
    }
    for(const panel of stage.querySelectorAll('.player-panel')){
      const height=reserve.players.get(panel.dataset.playerIndex);if(!height)continue;
      reservePlayerHand(panel,height);
      stage.dataset.opponentHands='true';
    }
  }
  // Structural field grids share the scene lock. Store geometry only, never markup.
  const gridStyles=new WeakMap();
  const gridProperties=['grid-template-columns','grid-template-rows','grid-auto-columns','grid-auto-rows','grid-auto-flow','column-gap','row-gap','align-content','justify-content','align-items','justify-items'];
  function fieldGrids(stage){
    return [...stage.querySelectorAll('.game-field-groups,[data-layout-grid]')];
  }
  function restoreFieldGrids(stage){
    for(const node of fieldGrids(stage)){
      const saved=gridStyles.get(node);if(!saved)continue;
      for(const [key,value,priority] of saved)if(value)node.style.setProperty(key,value,priority);else node.style.removeProperty(key);
      gridStyles.delete(node);
    }
  }
  function lockFieldGrids(stage,locked){
    const win=stage.ownerDocument.defaultView;
    locked.fieldGrids??=new Map();
    for(const [index,node] of fieldGrids(stage).entries()){
      const key=node.dataset.layoutGrid||`field-groups:${index}`,css=win.getComputedStyle(node);
      if(!['grid','inline-grid'].includes(css.display))continue;
      let geometry=locked.fieldGrids.get(key);
      if(!geometry){geometry=gridProperties.map(prop=>[prop,css.getPropertyValue(prop)]);locked.fieldGrids.set(key,geometry);}
      gridStyles.set(node,gridProperties.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]));
      for(const [prop,value] of geometry)node.style.setProperty(prop,value,'important');
    }
  }
  function allowLayoutChange(host,{allowLayoutChange=false}={}){
    if(allowLayoutChange===true)fixedLayouts.delete(host);
  }
  function update(host,markup,{preserveLayout=false}={}){
    const previous=preserveLayout?renderedTrees.get(host):null;
    const scrollers=previous?[]:[...host.querySelectorAll('[data-scene-scroll],.hand-track,.hand-scroll')].map(node=>({node,top:node.scrollTop,left:node.scrollLeft}));
    const template=host.ownerDocument.createElement('template');template.innerHTML=markup;
    if(!template.content.querySelector('.table-shell'))fixedLayouts.delete(host);
    reserveHands(host,template.content);
    root.PlayroomPublicSequence?.prepare(host,template.content);
    restoreFieldGrids(host);
    patchChildren(host,template.content,previous);
    renderedTrees.set(host,template.content);
    if(!previous)pendingScroll.set(host,scrollers);
    return !!previous;
  }
  function updateModal(modal,content){
    const template=modal.ownerDocument.createElement('template');template.innerHTML=modalContent(content);
    const scrolls=[...modal.querySelectorAll('.modal-body,.lobby-roster-scroll')].map(node=>{
      const anchor=[...node.querySelectorAll('.lobby-seat-row,.lobby-observer,.pack-entry')].find(el=>layoutRect(el).bottom>layoutRect(node).top&&(!el.matches('.pack-entry')||content.includes(`data-pack-id="${el.dataset.packId}" data-pack-version="${el.dataset.packVersion}"`)));
      return {node,scroll:node.scrollTop,anchor,top:anchor?layoutRect(anchor).top:0};
    });
    patchChildren(modal,template.content);fitCovers(modal);fitGameTitles(modal);
    for(const {node,scroll,anchor,top}of scrolls)if(node.isConnected){node.scrollTop=scroll;if(anchor?.isConnected)node.scrollTop+=layoutRect(anchor).top-top;}

  }
  function roundText(round){return round&&Number.isSafeInteger(round.number)&&round.number>0?globalThis.PlayroomMessages.text(round.kind==='bout'?'progress.bout':round.limit?'progress.round-of':'progress.round',{number:round.number,...(round.limit?{limit:round.limit}:{})}):'';}
  function participantsMarkup(state,{network=false,participants=[],teamLayouts={},selfId=null,selfIndex=null}={}){
    if(!state?.players)return '';
    const people=state.players.map((person,index)=>{
      const presence=participants.find(p=>p.playerIndex===index)||{};
      const player={...person,...presence},semantic=state.scene?.players?.find(p=>p.player===index);
      const team=semantic?.team||UI.helpers.teamFor(teamLayouts,state.preset,index);
      const self=!player.bot&&(network?!!(selfId&&player.id===selfId||selfIndex===index||player.local):!!player.local);
      return `<span class="resume-person ${state.status!=='finished'&&index===state.turn?'saved-current-turn':''}"><span class="player-avatar-wrap">${UI.avatar(player,index)}${UI.helpers.playerMedallion({first:state.firstPlayer===index&&root.PlayroomCatalog?.[state.game]?.capabilities?.firstPlayer!==false,team})}</span><span class="resume-person-name">${UI.helpers.participantIcon(player,{network})}<span${self?' class="saved-self"':''}>${esc(player.nickname||player.name)}</span></span></span>`;
    });
    if(network)for(const table of participants.filter(person=>person.role==='table')){
      people.push(`<span class="resume-person resume-table"><span class="resume-person-name">${UI.helpers.participantIcon(table,{network:true})}<span>${esc(table.nickname||table.name||root.PlayroomMessages.text('ui.ui.da639244db1d'))}</span></span></span>`);
    }
    return `<div class="resume-participants">${people.join('')}</div>`;
  }
  function resumeCard({roomName='',gameName='',state=null,network=false,connected=true,participants=[],teamLayouts={},action='data-command="resume"',leave='',hide=''}){
    if(state?.status==='finished'&&(!network||!connected))return '';
    const text=root.PlayroomMessages.text,kind=text(network?'ui.game-screen.6fa8cb59219b':'ui.game-screen.02d339ef14d5');
    const progress=roundText(state?.scene?.round)||(state?.players?.length>1&&state?.timeline?text('progress.turn',{number:state.timeline.turn}):'');
    roomName=network?roomName:'';
    const game=[gameName,progress].filter(Boolean).join(' · '),room=[kind,roomName].filter(Boolean).join(' · ');
    const status=network?`<i class="connection-light ${connected?'is-connected':'is-disconnected'}" role="img" aria-label="${esc(text(connected?'ui.resume.connected':'ui.resume.disconnected'))}" title="${esc(text(connected?'ui.resume.connected':'ui.resume.disconnected'))}"></i>`:'';
    return `<section class="resume-banner ${network?'network-resume-card':''}"><div class="resume-summary"><div class="resume-room" title="${esc(room)}">${status}<span class="pill">${esc(kind)}</span>${roomName?' · '+esc(roomName):''}</div><div class="resume-game" title="${esc(game)}"><strong>${esc(gameName)}</strong>${progress?`<span> · ${esc(progress)}</span>`:''}</div></div><div class="resume-actions">${leave?iconButton(leave,text('ui.game-screen.5af791bedf3a'),'exit'):hide?iconButton(hide,text('ui.app.hide-local-session'),'close'):''}${iconButton(action,connected?text('ui.game-screen.a42aee58d60a'):text('ui.game-screen.2de34a1774f6'),connected?'play':'reset',{className:'resume-primary'})}</div>${participantsMarkup(state,{network,participants,teamLayouts})}</section>`;
  }
  // The same markup is used with a trusted local Session and with the
  // projection-only SessionClient. No rule or network state is read here.
  function playersMarkup(state,viewer,actions=[],{scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerBadge=()=>''}={}){
    return [...UI.seatOrder(state.players.length,viewer),...(viewer>=0&&viewer<state.players.length?[viewer]:[])].map(i=>UI.playerPanel(state,i,viewer,{scoreLabel,badges:[playerBadge(state,i)].filter(Boolean)},actions)).join('');
  }

  function historyMarkup({index,count,caption='',playing=false,readOnly=false,newFrom=null,roundStarts=[],turnStarts=[],minimum=0}={}){
    return `<section class="history-panel" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.50d264e3cfa4")}"><div class="history-controls">${roundStarts.length?`<button class="icon-btn history-round-button" data-command="replay-round-prev" aria-label="${esc(globalThis.PlayroomMessages.text('progress.prev-round'))}" ${index<=minimum?'disabled':''}><span aria-hidden="true">≪</span></button>`:''}<button class="icon-btn" data-command="replay-prev" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.6a458bd0ee56")}" ${index<=minimum?'disabled':''}>${icon('prev')}</button><button class="icon-btn" data-command="replay-play" aria-label="${playing?globalThis.PlayroomMessages.text("ui.game-screen.3396400da0c4"):globalThis.PlayroomMessages.text("ui.game-screen.bdd37eb21746")} ${globalThis.PlayroomMessages.text("ui.game-screen.8be4990dd2c1")}">${icon(playing?'pause':'play')}</button><span class="replay-track ${Number.isInteger(newFrom)&&newFrom>0&&newFrom<=count?'has-new-history':''}" style="--new-from:${Number.isInteger(newFrom)&&count>0?Math.max(0,Math.min(100,(newFrom-minimum)/Math.max(1,count-minimum)*100)):100}%">${turnStarts.filter(revision=>Number.isSafeInteger(revision)&&revision>minimum&&revision<=count&&!roundStarts.some(mark=>mark.revision===revision)).map(revision=>`<i class="history-turn-marker" style="left:calc(8px + (100% - 16px) * ${(revision-minimum)/Math.max(1,count-minimum)})"></i>`).join('')}${roundStarts.filter(mark=>Number.isInteger(mark.revision)&&mark.revision>minimum&&mark.revision<=count).map(mark=>`<i class="history-round-marker" style="left:calc(8px + (100% - 16px) * ${(mark.revision-minimum)/Math.max(1,count-minimum)})" title="${esc(globalThis.PlayroomMessages.text('progress.round-start',{number:mark.number}))}"></i>`).join('')}<input type="range" min="${minimum}" max="${count}" value="${index}" id="replay-range" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.6d38f72f9e93")}"></span><button class="icon-btn" data-command="replay-next" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.baa4f395d537")}" ${index===count?'disabled':''}>${icon('next')}</button>${roundStarts.length?`<button class="icon-btn history-round-button" data-command="replay-round-next" aria-label="${esc(globalThis.PlayroomMessages.text('progress.next-round'))}" ${index===count?'disabled':''}><span aria-hidden="true">≫</span></button>`:''}<span class="replay-badge" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.3cc3ea21bf69")}${index-minimum} ${globalThis.PlayroomMessages.text("ui.game-screen.ef9f13d03f4e")}${count-minimum}">${index-minimum} / ${count-minimum}</span></div></section>`;
  }
  function deleteConfirmation({name=globalThis.PlayroomMessages.text("ui.game-screen.02c17edea60f"),network=false,confirmAttrs=''}){
    return `${modalHead(globalThis.PlayroomMessages.text("ui.game-screen.97e625bfddc6"))}<p class="lead">${esc(name)} ${globalThis.PlayroomMessages.text("ui.game-screen.c45481781f5f")}${network?globalThis.PlayroomMessages.text("ui.game-screen.9264423128bd"):globalThis.PlayroomMessages.text("ui.game-screen.b01c15488ec5")}. ${globalThis.PlayroomMessages.text("ui.game-screen.6905ded6e0fe")}</p><div class="modal-foot">${UI.button({attrs:'data-command="close-modal"',label:globalThis.PlayroomMessages.text("ui.game-screen.97b65905439a"),variant:'secondary'})}${UI.button({attrs:confirmAttrs,icon:'trash',label:globalThis.PlayroomMessages.text("ui.game-screen.be99b1361201"),variant:'danger'})}</div>`;
  }
  const soundedResults=new WeakSet();
  function resultSound(state,viewer){
    if(state?.status!=='finished')return null;
    if(viewer<0||viewer>=state.players.length)return 'notify';
    if(state.winner==null)return 'draw-game';
    if((state.winners||[state.winner]).includes(viewer))return 'victory';
    const places=state.result?.places;
    return places&&places[viewer]<Math.max(...places)?'draw-game':'defeat';
  }
  function presentResultSound(owner,state,viewer,play){
    const sound=resultSound(state,viewer);
    if(!sound||soundedResults.has(owner))return false;
    soundedResults.add(owner);play([sound],state.game);return true;
  }
  function resultMarkup({state,viewer,gameName,scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerContent=[],network=false}={}){
    if(!state||state.status!=='finished')return '';
    const winner=state.winner,winningPlayers=state.winners|| (winner==null?[]:[winner]),person=winner==null?null:state.players[winner];
    const title=winner===null?globalThis.PlayroomMessages.text("ui.game-screen.4af04ce619c5"):viewer<0?winningPlayers.length>1?globalThis.PlayroomMessages.text("ui.game-screen.b271075deff7")+winningPlayers.map(i=>state.players[i]?.name||globalThis.PlayroomMessages.text("ui.game-screen.f54f58cf08df")).join(', '):globalThis.PlayroomMessages.text("ui.game-screen.133252d718b0",{p0:String(person?.name||globalThis.PlayroomMessages.text("ui.game-screen.f54f58cf08df"))}):winningPlayers.includes(viewer)?globalThis.PlayroomMessages.text("ui.game-screen.a5f1eda8ce7a"):globalThis.PlayroomMessages.text("ui.game-screen.379be9d6d960");
    const semanticContent=UI.playerContent(state,viewer,null);
    const scores=state.players.map((player,i)=>({player,i})).sort((a,b)=>(state.result?.places?.[a.i]??0)-(state.result?.places?.[b.i]??0)||a.i-b.i).map(({player,i})=>{
      const place=state.result?.places?.[i],value=state.result?.values?.[i],detail=state.result?.details?.[i];
      const medal=state.result?.lastPlayers?.includes(i)?UI.playerMedallion({last:true}):place?UI.playerMedallion({place,layout:UI.helpers.tokenLayout.fan(0,{count:2})}):winningPlayers.includes(i)?'★ ':'';
      const team=playerContent[i]?.team||state.scene?.players?.find(player=>player.player===i)?.team||null;
      const first=state.firstPlayer===i&&root.PlayroomCatalog?.[state.game]?.capabilities?.firstPlayer!==false;
      const playerBadge=UI.playerMedallion({first,team,layout:medal?UI.helpers.tokenLayout.fan(1,{count:2}):null});
      const badge=`<span class="result-awards">${medal}${playerBadge}</span>`;
      const content=playerContent[i]||semanticContent[i]||{},counters=content.counters??[{kind:'points',value:Number.isSafeInteger(player.score)&&player.score>=0?player.score:0,label:scoreLabel}];
      const shown=[...counters].sort((a,b)=>(a.kind==='wins')-(b.kind==='wins'));
      const hand=Number.isSafeInteger(content.handCount)?UI.countBadge(content.handCount,globalThis.PlayroomMessages.text("ui.game-screen.aac1090346a5",{p0:String(player.name),p1:String(content.countLabel||globalThis.PlayroomMessages.text("ui.game-screen.c81b450ffa45"))}),{hand:true}):'';
      const indicators=Array.isArray(content.indicators)?UI.indicators(content.indicators.map(({icon,value,size,label})=>({icon,value,size,label}))):'';
      const primary=`<span class="result-core-counters">${hand}${shown.map(UI.scoreBadge).join('')}</span>${indicators}`;
      const shownIds=new Set([...shown.map(counter=>counter.id||counter.kind),...(Number.isSafeInteger(content.handCount)?[content.handMetricId||'hand-count']:[]),...(content.indicators||[]).map(indicator=>indicator.id).filter(Boolean)]);
      const botSettings=player.bot&&(state.scene?.players?.find(p=>p.player===i)?.botSettings||player.botSettings);
      const botConfig=root.TabletopCore?.GAMES?.find(game=>game.id===state.game)?.botSettings;
      const strategy=botSettings?.resolvedStrategy||botSettings?.strategy;
      const botDescription=player.bot?(botConfig?.strategies?.find(p=>p.id===strategy)?.label||''):'';
      const extra=(state.result?.metrics||[]).filter(metric=>metric.display!=='ranking'&&!shownIds.has(metric.id)&&Number.isFinite(metric.values?.[i])).map(metric=>`${metric.label}: ${Number.isInteger(metric.maximumFractionDigits)&&metric.maximumFractionDigits>=0&&metric.maximumFractionDigits<=6?new Intl.NumberFormat('ru',{maximumFractionDigits:metric.maximumFractionDigits}).format(metric.values[i]):metric.values[i]}`);
      const exit=state.result?.exits?.find(exit=>exit.player===i);
      const exitText=exit?globalThis.PlayroomMessages.text('ui.game-screen.exit-'+exit.kind)+' · '+globalThis.PlayroomMessages.text(exit.round?'progress.round':'progress.turn',{number:exit.round||exit.turn}):'';
      return `<div class="score-row">${badge}${UI.avatar(player,i)}<span class="result-name">${UI.participantIcon({...player,botSettings})}<span class="result-nickname">${i===viewer?`<strong>${esc(player.name)}</strong>`:esc(player.name)}</span>${botDescription?`<small class="result-bot-settings">${esc(botDescription)}</small>`:''}</span><span class="result-stat"><span class="result-counters">${primary}</span>${extra.length?`<small title="${esc(extra.join(' · '))}">${esc(extra.join(' · '))}</small>`:''}</span>${exitText?`<small class="result-exit">${esc(exitText)}</small>`:''}</div>`;
    }).join('');
    return `${modalHead(title)}<div class="result-art" aria-hidden="true">✦</div><p class="lead">${esc(gameName)} · ${state.move} ${globalThis.PlayroomMessages.text("ui.game-screen.85d3cfbb11da")}</p><div class="result-scores" data-game="${esc(state.game)}">${scores}</div><div class="modal-foot"><button class="btn secondary" data-command="result-replay">${globalThis.PlayroomMessages.text("ui.game-screen.5818f0c93a9b")}</button>${network?`<button class="btn" data-command="rematch">${globalThis.PlayroomMessages.text("ui.game-screen.a8e06ed9a3c5")}</button>`:`<button class="btn" data-command="rematch">${globalThis.PlayroomMessages.text("ui.game-screen.0bb191eca038")}</button>`}</div>${network?'':`<button class="btn secondary result-menu" data-command="home">${icon('grid')} ${globalThis.PlayroomMessages.text("ui.game-screen.70c6a395ad9d")}</button>`}`;
  }
  function turnNotice({play=()=>{},reducedMotion=()=>false}={}){
    let previous=null,timer=null;
    return {
      observe({sessionId,revision,turn,viewer,status,paused=false,active=true,mount=document}){
        if(mount.querySelector('.app-game-layout[data-show-turn="false"]')){this.reset();return false;}
        if(!active)return false;
        const next={sessionId,revision,turn};
        const started=active&&previous&&previous.sessionId===sessionId&&revision>previous.revision&&turn!==previous.turn&&turn===viewer&&status==='playing'&&!paused;
        previous=next;
        if(!started)return false;
        const card=mount.querySelector(`.player-panel[data-player-index="${viewer}"]`);
        if(card&&!reducedMotion()){
          card.classList.remove('turn-start-flash');void card.offsetWidth;card.classList.add('turn-start-flash');
          clearTimeout(timer);timer=setTimeout(()=>card.classList.remove('turn-start-flash'),1000);
        }
        play();return true;
      },
      reset(){previous=null;clearTimeout(timer);}
    };
  }
  function render({layoutId='',gameName,shortName='',subtitle='',state,viewer,actions=[],scene='',turnText='',turnExtra='',replay=false,
    busy=false,botThinking=false,animationSpeed='',beforeFooter='',historyHTML='',footerText='',footerTitle=footerText,footerAction={command:'home',label:globalThis.PlayroomMessages.text("ui.game-screen.1fd4bffb137b"),icon:'back'},
    statusExtra='',footerExtra='',saved=null,showSettings=true,network=false,revision=null,scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerBadge,historyResult=false,readOnly=false,pause=false,canPause=true,historyCaption='',roomAction=null,fieldToggle=null}={}){
    fieldToggle=network&&!readOnly&&viewer>=0?fieldToggle:null;
    if(!state?.players)throw Error('Projected game state required');
    const showTurn=!scene.includes(' data-show-turn="false"');
    if(!showTurn){turnText='';turnExtra='';}
    const primary=historyResult||(!network&&state.status==='finished')?{attrs:'data-command="result"',label:globalThis.PlayroomMessages.text("ui.game-screen.24735a7161d9"),name:'trophy'}:roomAction?{...roomAction,label:globalThis.PlayroomMessages.text("ui.game-screen.3a73248bdd79"),name:'room'}:null;
    const caption=esc(replay?(historyCaption||footerText||globalThis.PlayroomMessages.text("ui.game-screen.03f70ecc37a6")):footerText||'');
    const cornerSlot='<div class="handoff-corner"><!--handoff-control--></div>';
    const cornerControl=scene.includes(cornerSlot)?beforeFooter:'';
    if(scene.includes(cornerSlot)){scene=scene.replace(cornerSlot,'');beforeFooter='';}
    if(beforeFooter&&scene.includes('<!--handoff-control-->'))scene=scene.replace('<!--handoff-control-->',beforeFooter);
    else if(beforeFooter){const slot=scene.indexOf('data-game-element="actions"');if(slot>=0){const end=scene.indexOf('>',slot);scene=scene.slice(0,end+1)+beforeFooter+scene.slice(end+1);}else scene=scene.replace('<!--self-controls-->',beforeFooter);}
    return `<main data-field-topology="${esc(state.scene?.geometry?.topology||'')}" data-layout-identity="${esc(JSON.stringify([layoutId,gameName,viewer,state.players.map(p=>p.id||p.name),replay]))}" class="table-shell${network?' network-game':''}"${network?` data-revision="${revision}" data-viewer="${viewer}"`:''}><header class="table-header"><div class="table-heading">${iconButton(historyHTML?'data-command="history-close"':'data-command="home"',historyHTML?(readOnly?globalThis.PlayroomMessages.text("ui.game-screen.ed9aa3c20c66"):globalThis.PlayroomMessages.text("ui.game-screen.ae29400e7f17")):globalThis.PlayroomMessages.text("ui.game-screen.1fd4bffb137b"),'back')}<div class="table-title">${gameTitle(gameName,shortName||root.PlayroomCatalog?.[state.game]?.shortName)}<p>${esc(subtitle.replace(/^За столом с ботами\s*·?\s*/,''))}</p></div></div>
      <div class="table-tools ui-toolbar">${toolbar([
        ...(primary?[{...primary,attrs:primary.attrs+' data-game-primary="true"'}]:[]),
        {attrs:'data-command="history"',label:globalThis.PlayroomMessages.text("ui.game-screen.c9d00b5b5cd1"),name:'history',active:!!historyHTML,hidden:!!fieldToggle},
        ...(fieldToggle?[{attrs:'data-command="toggle-field"',label:fieldToggle.hidden?globalThis.PlayroomMessages.text("ui.game-screen.4df59b1750a8"):globalThis.PlayroomMessages.text("ui.game-screen.af36d13ed774"),name:'grid',active:fieldToggle.hidden}]:[]),
        ...(!readOnly&&state.status!=='finished'?[{attrs:'data-command="pause"',label:pause?globalThis.PlayroomMessages.text("ui.game-screen.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.game-screen.65530fd463ea"),name:pause?'play':'pause',active:pause,disabled:!canPause||!!historyHTML,hidden:true}]:[]),
        {attrs:'data-command="fullscreen"',label:globalThis.PlayroomMessages.text("ui.game-screen.f42c392566b5"),name:'full'},
        {attrs:'data-command="rules"',label:globalThis.PlayroomMessages.text("ui.game-screen.7f7b0ffbbfe0"),name:'help',hidden:true}
      ],{showSettings})}</div></header>
      <div class="table-status" aria-live="polite">${turnText?`<span class="turn-label"><i class="turn-light ${botThinking?'bot':''}"></i>${esc(turnText)}</span>`:''}<span class="status-details"><span class="turn-extra">${esc([roundText(state.scene?.round),showTurn&&state.players.length>1&&state.timeline?globalThis.PlayroomMessages.text('progress.turn',{number:state.timeline.turn}):'',turnExtra].filter(Boolean).join(' · '))}</span>${caption?`<span class="status-event" title="${esc(replay?(historyCaption||footerText||globalThis.PlayroomMessages.text("ui.game-screen.03f70ecc37a6")):footerTitle)}">${caption}</span>`:''}</span>${statusExtra}</div>
      <section class="scene ${replay?'replaying':''}" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.134df14b27b8")}" aria-busy="${!!busy}"${animationSpeed?` data-animation-speed="${esc(animationSpeed)}"`:""}>${scene}${cornerControl?`<div class="handoff-corner" data-host-control="handoff">${cornerControl}</div>`:''}</section>
      ${historyHTML}
      ${footerExtra?`<div class="table-extra">${footerExtra}</div>`:''}</main>`;
  }
  // One geometry contract: full pieces, independently fitted hand viewports.
  function handPieceHeight(track,stage){
    if(stage.dataset.seating!=='row'||stage.dataset.anchorOrientation!=='landscape')return Infinity;
    const own=track.closest('.layout-self'),slot=track.closest('.layout-hand'),piece=track.querySelector('.hand-card,.domino-tile');
    if(!own||!slot||!piece)return Infinity;
    const style=own.ownerDocument.defaultView.getComputedStyle(own),children=[...own.children].filter(node=>node.getClientRects().length);
    const reserved=children.filter(node=>node!==slot).reduce((sum,node)=>sum+layoutRect(node).height,0)
      +parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+Math.max(0,children.length-1)*(parseFloat(style.rowGap)||0);
    return Math.max(0,own.clientHeight-reserved-(layoutRect(slot).height-piece.offsetHeight));
  }
  function fitTileHand(track,stage){
    const style=track.ownerDocument.defaultView.getComputedStyle(track);
    const height=Math.min(parseFloat(style.getPropertyValue('--scene-card-height'))||90,Math.max(32,handPieceHeight(track,stage)));
    const count=track.querySelectorAll('.domino-tile').length,available=track.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const fitted=root.PlayroomElementSizes?.resolve(root.PlayroomInterfaceScale?.applied||100,root.innerWidth,root.innerHeight)['hand-domino']||48;
    const capacity=count>0&&count<=7?(available-Math.max(0,count-1)*2)/count:fitted;
    const width=root.PlayroomElementSizes?root.PlayroomElementSizes.floor('domino',Math.min(fitted,capacity)):Math.min(fitted,capacity);
    track.style.setProperty('--tile-width',width+'px');
    track.classList.toggle('is-long-hand',track.scrollWidth>track.clientWidth+2);
  }

  const handPolicy=()=>root.PlayroomSizeCatalogue.hands.geometry;
  function fitOpponentHand(mini,stage){
    const policy=handPolicy();
    const count=mini.children.length;if(!count)return;
    mini.style.setProperty('--opponent-viewport-height',(stage.dataset.denseRoster==='true'?mini.firstElementChild.offsetHeight*policy.miniDenseVisibleFraction+policy.miniDensePaddingPx:mini.firstElementChild.offsetHeight*policy.miniVisibleFraction+policy.miniPaddingPx)+'px');
    mini.style.removeProperty('--opponent-card-width');
    const ratio=Number(mini.querySelector('[data-piece-ratio]')?.dataset.pieceRatio);
    if(ratio>0&&ratio<=1){const height=parseFloat(stage.style.getPropertyValue('--opponent-card-height'))||40;mini.style.setProperty('--opponent-card-width',height*ratio+'px');}
    const style=mini.ownerDocument.defaultView.getComputedStyle(mini),available=mini.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    mini.style.setProperty('--mini-step',(count>1?Math.max(mini.classList.contains('is-open')?policy.miniOpenMinStepPx:0,Math.min(mini.firstElementChild.offsetWidth*policy.miniMaxStepFraction,(available-mini.firstElementChild.offsetWidth)/(count-1))):policy.miniSingleStepPx)+'px');
  }
  // Independent transform properties compose with selection/drag's transform.
  // Geometry uses untransformed offsets so scrolling never feeds back into fit.
  function cardExposure(card,axis){const raw=card?.querySelector('[data-card-stacking]')?.dataset.cardStacking;if(!raw)return 0;try{const n=JSON.parse(raw)[axis];return Number.isFinite(n)&&n>0&&n<=1?n:0;}catch{return 0;}}
  const arcTracks=new WeakSet();
  function fitHandArc(track){
    const policy=handPolicy();
    const enabled=root.PlayroomAppBridge?.gameOptions?.().handShape==='arc';
    track.classList.toggle('is-arc',enabled);
    const row=track.querySelector('.hand-fan-row');if(!row)return;
    const pieceWidth=row.firstElementChild?.offsetWidth||0,step=Math.min(parseFloat(track.style.getPropertyValue('--fan-peek'))||policy.arcFallbackPeekPx,pieceWidth);
    row.style.setProperty('grid-template-columns',(row.children.length>1?`repeat(${row.children.length-1},${step}px) `:'')+pieceWidth+'px','important');
    const style=track.ownerDocument.defaultView.getComputedStyle(track),left=Math.max(parseFloat(style.paddingLeft),row.offsetLeft-track.scrollLeft),right=Math.min(track.clientWidth-parseFloat(style.paddingRight),row.offsetLeft+row.offsetWidth-track.scrollLeft);
    const center=(left+right)/2,half=Math.max(1,(right-left)/2),count=row.children.length;
    for(const card of row.children){
      const x=row.offsetLeft+card.offsetLeft+card.offsetWidth/2-track.scrollLeft-center;
      const pose=root.PlayroomGameComponents.pieceTypes['card-deck'].pose({x,half,count,enabled,maxAngle:policy.arcMaxAngleDeg,minAngle:policy.arcMinAngleDeg,countAngle:policy.arcCountAngleDeg,radiusDivisor:policy.arcRadiusDivisor});
      card.style.setProperty('--hand-arc-angle',pose.angle+'deg');
      card.style.setProperty('--hand-arc-y',pose.y+'px');
    }
    if(!arcTracks.has(track)){track.addEventListener('scroll',()=>fitHandArc(track),{passive:true});arcTracks.add(track);}
  }
  function fitCardHand(track,stage){
    const policy=handPolicy();
    track.classList.toggle('is-arc',root.PlayroomAppBridge?.gameOptions?.().handShape==='arc');
    track.style.removeProperty('--fan-peek');
    const count=track.querySelectorAll('.hand-card').length,card=track.querySelector('.hand-card');
    const trackStyle=track.ownerDocument.defaultView.getComputedStyle(track),available=track.clientWidth-parseFloat(trackStyle.paddingLeft)-parseFloat(trackStyle.paddingRight);
    let desired=Math.min(parseFloat(stage.style.getPropertyValue('--scene-card-width'))||64,Math.max(32,handPieceHeight(track,stage)/1.4));
    if(stage.dataset.seating==='circle'&&stage.dataset.anchorOrientation==='landscape'){
      const own=track.closest('.layout-self')&&layoutRect(track.closest('.layout-self')),north=stage.querySelector('.seat-north-east')&&layoutRect(stage.querySelector('.seat-north-east'));
      if(own&&north?.height){const controls=own.height-layoutRect(track).height,availableHeight=own.bottom-north.bottom-6-controls-24;desired=Math.min(desired,Math.max(32,availableHeight/1.4));}
    }
    const fitted=parseFloat(stage.style.getPropertyValue('--scene-card-width'))||60;
    track.style.setProperty('--scene-card-width',fitted+'px');
    track.style.setProperty('--scene-card-height',fitted*1.4+'px');
    const baseline=policy.peekBasePx;
    let peek=baseline;
    for(const card of track.querySelectorAll('.hand-card')){
      const corner=card.querySelector('.card-corner:not(.bottom)');if(!corner)continue;
      peek=Math.max(peek,Math.ceil((corner.offsetLeft+corner.offsetWidth)*(card.offsetWidth/(card.querySelector('.piece-artboard')?.offsetWidth||card.offsetWidth))+policy.rankClearancePx));
    }
    if(!track.classList.contains('is-arc'))for(const item of track.querySelectorAll('.hand-card')){const corner=item.querySelector('.card-corner:not(.bottom)');if(corner)peek=Math.max(peek,Math.ceil(layoutRect(corner).right-layoutRect(item).left+policy.measuredRankClearancePx));}
    if(count>1&&card){const width=card.offsetWidth;peek=Math.max(peek,Math.min(width,(available-2*width-10)/Math.max(1,count-2)));}
    const axis=track.classList.contains('is-arc')?'arc':'horizontal',exposure=Math.max(0,...[...track.querySelectorAll('.hand-card')].map(item=>cardExposure(item,axis)));
    if(card)peek=Math.max(card.offsetWidth*exposure,Math.min(peek,card.offsetWidth*Math.max(policy.maxDefaultExposure,exposure)));
    track.style.setProperty('--fan-reveal-space',card?Math.max(0,card.offsetWidth-peek)+'px':'0px');
    track.style.setProperty('--fan-peek',peek+'px');
    track.classList.toggle('is-tight',parseFloat(track.style.getPropertyValue('--fan-reveal-space'))<(card?.offsetWidth||0)-peek);
    fitHandArc(track);
  }
  function fitHand(stage){
    for(const track of stage.querySelectorAll('.layout-hand .hand-track:not(.is-fan):not(.is-overlapping):has([data-card-shape="square"])')){
      const count=track.querySelectorAll('.hand-card').length,desired=parseFloat(stage.style.getPropertyValue('--scene-card-width'))||64;
      const available=track.clientWidth-12,fit=Math.max(32,Math.min(desired,(available-Math.max(0,count-1)*6)/Math.max(1,count)));
      track.style.setProperty('--scene-card-width',fit+'px');track.style.setProperty('--scene-card-height',fit+'px');
    }
    for(const track of stage.querySelectorAll('.layout-hand .hand-track.is-tiles'))fitTileHand(track,stage);
    for(const mini of stage.querySelectorAll('.player-panel .mini-hand'))fitOpponentHand(mini,stage);
    for(const track of stage.querySelectorAll('.layout-hand .hand-track.is-fan'))fitCardHand(track,stage);
  }
  function fitField(stage){
    const slot=stage.querySelector('.layout-field'),field=slot?.firstElementChild;if(!field)return;
    // Measure the whole grid track before reserving the board's intrinsic shape.
    for(const key of ['width','height','justify-self','align-self'])slot.style.removeProperty(key);
    const width=slot.clientWidth,height=slot.clientHeight;if(width<=0||height<=0)return;
    const portraitCards=field.querySelector('[data-card-fit="portrait"]');
    if(portraitCards&&root.PlayroomElementSizes){
      const win=stage.ownerDocument.defaultView,columns=Number(portraitCards.dataset.cardColumns)||1;
      const target=root.PlayroomElementSizes.resolve(root.PlayroomInterfaceScale?.applied||100,Math.min(win.innerWidth,win.innerHeight),Math.max(win.innerWidth,win.innerHeight)).card;
      const fitted=root.PlayroomElementSizes.floor('card',Math.min(target,(Math.min(width,Math.min(win.innerWidth,win.innerHeight)-26)-10-(columns-1)*(Number(portraitCards.dataset.cardGap)||4))/columns));
      portraitCards.style.setProperty('--size-card',fitted+'px');portraitCards.style.setProperty('--size-card-height',fitted*1.4+'px');
    }
    const grid=field.querySelector('[data-card-count]');
    if(grid){const count=Number(grid.dataset.cardCount);grid.dataset.gridDensity=count>=36?'dense':'roomy';let best={size:0,columns:1,rows:count};for(let columns=2;columns<=count;columns++){const rows=Math.ceil(count/columns),size=Math.min((width-8-(columns-1)*4)/columns,(height-8-(rows-1)*4)/rows/1.4);if(size>best.size)best={size,columns,rows};}const gap=grid.querySelector('[data-grid-gap=\"center\"]');if(gap)gap.hidden=best.columns!==5||best.rows!==5;grid.style.setProperty('--grid-columns',best.columns);grid.style.setProperty('--grid-rows',best.rows);grid.style.setProperty('--grid-card-width',(root.PlayroomElementSizes?root.PlayroomElementSizes.floor('card',count>=36?Math.min(best.size,root.PlayroomElementSizes.resolve(root.PlayroomInterfaceScale?.applied||100,root.innerWidth,root.innerHeight).card):best.size):Math.max(1,best.size))+'px');}

    if(stage.dataset.fieldSizing==='scroll'||field.querySelector('[data-card-count]')){field.style.width=width+'px';field.style.height=height+'px';field.style.zoom='1';field.style.setProperty('--field-scale','1');return;}

    if(stage.dataset.layoutFamily==='board'){
      const aspect=Number(slot.style.getPropertyValue('--field-aspect'))||1;
      const availableWidth=Math.min(width,height*aspect),boardWidth=Math.max(1,Math.floor(availableWidth/4)*4),boardHeight=boardWidth/aspect;
      if(stage.dataset.fieldSizing!=='content'){
        slot.style.width=boardWidth+'px';slot.style.height=boardHeight+'px';
        slot.style.justifySelf='center';slot.style.alignSelf='center';
      }
      field.style.width=boardWidth+'px';field.style.height=boardHeight+'px';field.style.zoom='1';return;
    }
    field.style.zoom='1';field.style.width=Math.min(width,520)+'px';field.style.height='auto';field.style.setProperty('--field-scale','1');
    const r=layoutRect(field),natural=Math.max(field.scrollHeight,r.height,1),scale=Math.max(.1,Math.min(1.6,width/Math.max(field.scrollWidth,r.width,1),height/natural));
    field.style.height=Math.min(natural,height)+'px';field.style.overflow='auto';field.style.zoom='1';field.style.setProperty('--field-scale','1');
  }
  function fitStandardPieces(stage){
    const sizes=root.PlayroomElementSizes;if(!sizes)return;
    for(const piece of stage.querySelectorAll('[data-size-role="token"],[data-size-role="checker"]')){
      piece.style.removeProperty('width');piece.style.removeProperty('height');
      const rect=piece.getBoundingClientRect(),role=piece.dataset.sizeRole;
      const side=sizes.floor('token',Math.min(rect.width,rect.height,role==='checker'?64:sizes.resolve(root.PlayroomInterfaceScale?.applied||100,root.innerWidth,root.innerHeight).token));
      piece.style.width=side+'px';piece.style.height=side+'px';
    }
  }
  function fitPlayerPanels(stage){
    for(const panel of stage.querySelectorAll('.player-panel.opponent-hand')){panel.dataset.compactHand=String(stage.dataset.opponentHands==='true'&&panel.clientWidth<240);panel.dataset.compactIdentity=String(panel.clientWidth<120);}
  }
  // Responsive score lists change columns inside the reserved field, never its grid tracks.
  function fitScoreTables(stage){
    const win=stage.ownerDocument.defaultView;
    for(const table of stage.querySelectorAll('[data-responsive-score-table]')){
      const rows=[...table.rows];if(!rows.length)continue;
      const space=table.closest('[data-score-table-space]')||stage.querySelector('.layout-field');if(!space)continue;
      const css=win.getComputedStyle(space),height=space.clientHeight-parseFloat(css.paddingTop||0)-parseFloat(css.paddingBottom||0);
      const rowHeight=layoutRect(rows[0]).height;if(height<=0||rowHeight<=0)continue;
      const maximum=Math.max(1,Number(table.dataset.responsiveScoreTable)||1),minimum=Math.max(1,Number(table.dataset.scoreColumnWidth)||80);
      const columns=Math.max(1,Math.min(maximum,Math.floor(table.clientWidth/minimum),Math.ceil(rows.length*rowHeight/height)));
      table.style.setProperty('--score-columns',columns);table.style.setProperty('--score-rows',Math.ceil(rows.length/columns));table.dataset.scoreColumns=String(columns);
    }
  }
  function fitCardOverlaps(stage){
    for(const stack of stage.querySelectorAll('[data-card-overlap]')){
      const fixedStep=Number(stack.dataset.cardOverlap);
      let previous=null;
      for(const card of stack.children){
        card.style.marginInlineStart=previous?Math.min(0,previous.peek-previous.width)+'px':'0px';
        const box=layoutRect(card),cornerNode=card.querySelector('.shared-card-corner:not(.bottom),.card-corner:not(.bottom)'),corner=cornerNode?layoutRect(cornerNode):null;
        previous={width:box.width,peek:Math.min(box.width,Math.max(box.width*cardExposure(card,'horizontal'),fixedStep>0?fixedStep:corner?Math.ceil(corner.right-box.left+2):box.width))};
      }
    }
  }
  const replayFitters=new WeakMap(),pendingLayouts=new WeakMap();
  function layoutScene(host,settled=false){
    root.PlayroomPublicSequence?.bind(host);
    // Network diagnostics/history can finish mounting after the synchronous render.
    // Measure once more after that DOM transaction, before freezing the viewport.
    if(!settled&&!pendingLayouts.has(host)){
      const frame=host.ownerDocument.defaultView.requestAnimationFrame?.(()=>{pendingLayouts.delete(host);layoutScene(host,true);});
      if(frame!==undefined)pendingLayouts.set(host,frame);
    }
    fitGameTitles(host);
    const scene=host.querySelector('.scene'),previous=replayFitters.get(host);
    if(previous?.scene!==scene){
      previous?.observer?.disconnect();replayFitters.delete(host);
      if(scene){
        const Observer=scene.ownerDocument.defaultView.ResizeObserver;
        const observer=Observer?new Observer(()=>layoutScene(host,true)):null;
        replayFitters.set(host,{scene,observer});observer?.observe(scene);const participants=scene.querySelector('.layout-participants');if(participants)observer?.observe(participants);for(const hand of scene.querySelectorAll('.mini-hand'))observer?.observe(hand);
      }
    }
    const stage=scene?.querySelector('.app-game-layout');
    if(stage)resetHandReserveForViewport(host,stage);
    if(stage?.dataset.actionPlacement==='header-landscape'){
      const header=host.querySelector('.table-header'),actions=stage.querySelector('.layout-actions')||header?.querySelector('.scene-header-actions');
      if(actions&&header){const landscape=host.ownerDocument.defaultView.matchMedia('(orientation:landscape)').matches;
        if(landscape){actions.classList.add('scene-header-actions');if(actions.parentElement!==header)header.insertBefore(actions,header.querySelector('.table-tools'));}
        else{actions.classList.remove('scene-header-actions');if(actions.parentElement!==stage)stage.append(actions);}
      }
    }

    // A scene can reserve portrait status content without owning the host bar.
    const statusContent=host.querySelector('[data-scene-status="portrait"]'),statusHome=stage?.querySelector('[data-scene-status-home]'),statusBar=host.querySelector('.table-status');
    if(statusContent&&statusHome&&statusBar){const portrait=!host.ownerDocument.defaultView.matchMedia('(orientation:landscape)').matches,target=portrait?statusBar:statusHome;if(statusContent.parentElement!==target)target.prepend(statusContent);}

    if(stage)stage.dataset.threeOpponentLayout=root.PlayroomAppBridge?.gameOptions?.().splitThreeOpponents?'split':'row';
    const layoutKey=stage?JSON.stringify([host.ownerDocument.documentElement.dataset.assetGeometry,host.querySelector('.table-shell')?.dataset.layoutIdentity,scene.clientWidth,scene.clientHeight,stage.dataset.threeOpponentLayout,stage.dataset.surface,stage.dataset.preferredSeating||stage.dataset.seating]):null;
    if(stage)restoreFieldGrids(stage);
    let locked=fixedLayouts.get(host);if(locked?.key!==layoutKey){fixedLayouts.delete(host);locked=null;}
    if(stage){if(locked){stage.dataset.hasHand=locked.hasHand;stage.dataset.opponentHands=locked.opponentHands;}stage.style.removeProperty('grid-template-rows');stage.style.removeProperty('grid-template-columns');
      for(const node of stage.querySelectorAll(':scope > .layout-self')){node.style.removeProperty('height');node.style.removeProperty('overflow');}
    }
    if(stage){const policy=root.PlayroomSizeCatalogue.composition.geometry;stage.dataset.composition=root.PlayroomElementSizes.composition(stage.dataset);const win=scene.ownerDocument.defaultView;stage.dataset.layoutMode=win.TabletopUI.selectLayout(scene.clientWidth,scene.clientHeight);
      const w=scene.clientWidth-policy.sceneInsetPx,h=scene.clientHeight-policy.sceneInsetPx,hands=stage.dataset.layoutFocus==='hands',anchors=stage.dataset.seatAnchors==='true',portrait=win.innerHeight>=win.innerWidth,compact=anchors?portrait:w<policy.compactWidthPx;
      stage.dataset.preferredSeating??=stage.dataset.seating;
      const roster=stage.querySelectorAll('.layout-participants .player-panel:not([data-seat-copy])').length;
      stage.dataset.denseRoster=String(!portrait&&h<policy.denseRosterHeightPx&&roster>2&&stage.dataset.opponentHands==='true');
      const standard=root.PlayroomElementSizes?.resolve(root.PlayroomInterfaceScale?.applied||100,win.innerWidth,win.innerHeight);
      const cardWidth=standard?.['hand-card']||60;
      stage.style.setProperty('--scene-card-width',cardWidth+'px');
      stage.style.setProperty('--scene-card-height',cardWidth*1.4+'px');
      stage.style.setProperty('--hand-row-height',(cardWidth*1.4+policy.handControlsReservePx)+'px');
      const miniWidth=standard?.mini||30,miniHeight=miniWidth*1.4;
      stage.style.setProperty('--opponent-card-width',miniWidth+'px');
      stage.style.setProperty('--opponent-card-height',miniHeight+'px');
      stage.style.setProperty('--opponent-viewport-height',(miniHeight*policy.miniViewportVisibleFraction+policy.miniViewportPaddingPx)+'px');
      stage.dataset.croppedHands='true';
      const anchoredNoHand=anchors&&stage.dataset.hasHand==='false';
      const fallback=stage.dataset.preferredSeating==='circle'&&(w<policy.circleMinWidthPx||h<policy.circleMinHeightPx||(!portrait&&(w<policy.circleLandscapeMinWidthPx||h<policy.denseRosterHeightPx&&roster>3&&stage.dataset.opponentHands==='true')));
      stage.dataset.seating=fallback?'row':stage.dataset.preferredSeating;
      stage.dataset.seatingFallback=String(fallback);
      stage.dataset.anchorOrientation=portrait?'portrait':'landscape';
      const baseCopy=stage.querySelector('[data-seat-copy="true"]');
      stage.dataset.anchorCompactControls=String(anchoredNoHand&&!portrait&&!fallback&&!!baseCopy);
      stage.style.setProperty('--anchor-control-column',baseCopy?.dataset.seat?.includes('east')?'3':'1');
      stage.dataset.seatMode=compact&&anchors?'corners':'ring';
      let ownZone=stage.querySelector('.layout-self')?(stage.dataset.hasHand==='false'?policy.ownNoHandPx:Math.min(hands?policy.ownHandFocusMaxPx:policy.ownDefaultMaxPx,Math.max(h<policy.ownCompactThresholdPx?policy.ownCompactMinPx:policy.ownMinPx,h*policy.ownFraction))):0;
      const own=stage.querySelector('.layout-self');if(own&&stage.dataset.hasHand==='true'){const natural=[...own.children].reduce((sum,node)=>sum+layoutRect(node).height,policy.ownNaturalPaddingPx);ownZone=Math.min(Math.max(policy.ownCompactMinPx,h*policy.ownMaxFraction),Math.max(ownZone,natural));}
      if(own&&anchoredNoHand&&portrait)ownZone=Math.max(ownZone,...[...own.children].map(node=>layoutRect(node).height+12));
      stage.style.setProperty('--north-east-height',(stage.querySelector('.seat-north-east')&&layoutRect(stage.querySelector('.seat-north-east')).height||0)+'px');
      stage.style.setProperty('--corner-control-height',(((own?layoutRect(own).height:0))+12)+'px');
      const opponentHands=stage.dataset.opponentHands==='true',edge=stage.dataset.seatStyle==='edge';
      const seatHeight=edge?(opponentHands?policy.seatEdgeHandHeightPx:policy.seatNoHandHeightPx):(opponentHands?policy.seatRingHandHeightPx:policy.seatNoHandHeightPx);
      if(edge)ownZone=Math.min(ownZone,Math.max(90,h-seatHeight-130));
      const seatWidth=edge?Math.max(120,Math.min(260,w-12,h-ownZone-2*seatHeight-24)):compact?(w-6)/2:Math.min(policy.seatMaxWidthPx,Math.max(policy.seatMinWidthPx,w*policy.seatFraction));
      stage.style.setProperty('--focus-player-columns',Math.max(1,Math.min(stage.querySelectorAll('.layout-participants .player-panel').length,portrait?Math.floor(w/(roster>3?94:130)):Math.ceil(roster/Math.max(1,Math.floor((h-88)/58))))));
      stage.style.setProperty('--seat-width',Math.floor(seatWidth)+'px');stage.style.setProperty('--seat-height',seatHeight+'px');
      stage.style.setProperty('--seat-hand-width',Math.max(32,Math.min(78,seatWidth*.42,(seatHeight-48)/1.43))+'px');
      stage.style.setProperty('--own-zone',ownZone+'px');
      if(anchors){const fieldSize=compact?Math.min(w,h-ownZone-2*seatHeight-30):Math.min(w-2*seatWidth-12,h-(anchoredNoHand?12:ownZone+18));stage.style.setProperty('--anchor-field-size',Math.floor(Math.max(40,fieldSize))+'px');}
      stage.style.setProperty('--focus-own-card-width',Math.max(58,Math.min(125,(h*.32-70)/1.43))+'px');
      if(stage.dataset.surface==='player'){const count=stage.querySelectorAll('.layout-participants .player-panel').length,wide=scene.clientWidth>scene.clientHeight&&scene.clientWidth>=600;const available=scene.clientWidth*(wide?.65:1),columns=Math.max(1,Math.min(count,Math.floor(available/155)));stage.style.setProperty('--player-columns',columns);stage.style.setProperty('--player-rows',Math.ceil(count/columns));const own=stage.querySelector('.layout-self'),height=own?.clientHeight||150;stage.style.setProperty('--focus-hand-width',Math.max(58,Math.min(125,(height-90)*.69))+'px');}fitHand(stage);root.PlayroomHandOverflow?.sync?.(host);fitField(stage);
      fitPlayerPanels(stage);
      const seatsOverlap=()=>{
        const ownBox=stage.querySelector('.layout-self')&&layoutRect(stage.querySelector('.layout-self')),groups=[...stage.querySelectorAll('.seat-group')].map(el=>layoutRect(el));
        const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        return stage.dataset.seating==='circle'&&groups.some((box,i)=>overlap(box,ownBox)||groups.slice(i+1).some(other=>overlap(box,other)));
      };
      const participants=stage.querySelector('.layout-participants'),field=stage.querySelector('.layout-field');
      if(stage.dataset.seating==='circle'&&(seatsOverlap()||field?.clientHeight<80)){
        stage.dataset.seating='row';stage.dataset.seatingFallback='true';fitField(stage);fitHand(stage);
      }
      if(stage.dataset.seating==='row'&&participants&&stage.dataset.surface!=='player'){
        const panels=participants.querySelector('.players-panels');
        if(roster===4&&participants.clientWidth>=240){
          stage.style.setProperty('--focus-player-columns','2');
          if(panels)panels.dataset.compact=String(participants.clientWidth/2<240);
        }else if(roster===3&&participants.clientWidth>=240){
          const preferred=stage.dataset.threeOpponentLayout==='split'?2:3;
          const columns=Math.min(preferred,Math.max(1,Math.floor(participants.clientWidth/80)));
          stage.style.setProperty('--focus-player-columns',columns);
          if(panels)panels.dataset.compact=String(participants.clientWidth/columns<240);
        }else if(portrait){
          // At reduced zoom a portrait viewport can use desktop side tracks.
          // Fit the actual participant slot, not the whole scene width.
          const minimum=participants.clientWidth>stage.clientWidth*.8?(roster>3?94:130):stage.dataset.opponentHands==='true'?140:roster>3?94:130;
          const columns=Math.max(1,Math.min(roster,Math.floor((participants.clientWidth+4)/(minimum+4))));
          stage.style.setProperty('--focus-player-columns',columns);if(panels)panels.dataset.compact=String(participants.clientWidth/columns<(stage.dataset.opponentHands==='true'?240:120));
        }else{
          const minimum=stage.dataset.opponentHands==='true'&&stage.dataset.denseRoster!=='true'?140:80,maximum=Math.max(1,Math.floor(participants.clientWidth/minimum));
          for(let columns=1;columns<=maximum;columns++){
            stage.style.setProperty('--focus-player-columns',columns);
            if(panels)panels.dataset.compact=String(participants.clientWidth/columns<(stage.dataset.opponentHands==='true'?240:120));
            if(participants.scrollHeight<=participants.clientHeight+2)break;
          }
        }
        fitPlayerPanels(stage);fitHand(stage);
      }
      root.PlayroomHandOverflow?.sync?.(host);
      // Freeze the grid tracks, not game objects: new controls stay inside their zone.
      if(!locked){const css=win.getComputedStyle(stage);locked={key:layoutKey,rows:css.gridTemplateRows,columns:css.gridTemplateColumns,self:own?layoutRect(own).height:0,hasHand:stage.dataset.hasHand,opponentHands:stage.dataset.opponentHands,actions:[...stage.querySelectorAll('.layout-actions')].map(node=>layoutRect(node).height)};fixedLayouts.set(host,locked);}
      stage.style.setProperty('grid-template-rows',locked.rows,'important');
      stage.style.setProperty('grid-template-columns',locked.columns,'important');
      for(const [index,node]of [...stage.querySelectorAll('.layout-actions')].entries())if(locked.actions?.[index]>0){node.style.height=locked.actions[index]+'px';node.style.minHeight=locked.actions[index]+'px';node.style.maxHeight=locked.actions[index]+'px';node.style.overflow='visible';}
      if(own&&locked.self){own.style.height=locked.self+'px';own.style.overflow=own.querySelector('.own-hand[data-hand-count="0"]')?'hidden':'auto';}
      lockFieldGrids(stage,locked);
      fitField(stage);fitStandardPieces(stage);fitScoreTables(stage);fitCardOverlaps(stage);
      for(const anchor of stage.querySelectorAll('[data-chain-anchor]')){
        const chain=anchor.closest('.domino-chain'),board=chain.closest('.domino-board'),field=stage.querySelector('.layout-field');
        const rowHeight=parseFloat(win.getComputedStyle(chain).getPropertyValue('--domino-row-height'))||52;
        const row=Number(anchor.dataset.flowRow)||0,rows=Number(chain.style.getPropertyValue('--domino-rows'))||1;
        const height=field.clientHeight,ideal=height/2-(row+.5)*rowHeight;
        const shift=ideal<0?Math.ceil(-ideal/rowHeight):ideal+rows*rowHeight>height?-Math.ceil((ideal+rows*rowHeight-height)/rowHeight):0;
        chain.style.setProperty('--chain-top',Math.max(0,ideal+shift*rowHeight)+'px');board.style.minHeight=height+'px';
      }

      // Corner seating may show an identity twice; only its visible primary
      // representation owns the turn highlight and aria-current.
      const panels=[...stage.querySelectorAll('.player-panel')];
      for(const panel of panels){panel.dataset.turnPrimary='false';panel.classList.remove('is-turn');panel.removeAttribute('aria-current');}
      for(const index of new Set(panels.map(panel=>panel.dataset.playerIndex))){
        const copies=panels.filter(panel=>panel.dataset.playerIndex===index);
        const visible=panel=>!!panel.getClientRects().length;
        const primary=copies.find(panel=>!panel.hasAttribute('data-seat-copy')&&visible(panel))||copies.find(visible);
        if(primary){primary.dataset.turnPrimary='true';if(Number(index)===Number(stage.dataset.presentationTurn??stage.dataset.turnPlayer)){primary.classList.add('is-turn');primary.setAttribute('aria-current','true');}}
      }
    }
    if(stage){stage.style.zoom='1';const current=stage.querySelector('[data-slide-key]'),prior=previous?.scene?.querySelector('[data-slide-key]');if(previous?.scene!==scene&&current&&prior&&!current.classList.contains('shared-page-deck')&&current.dataset.slideKey!==prior.dataset.slideKey&&!host.ownerDocument.body.classList.contains('reduced-motion')&&!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){const direction=Number(current.dataset.slideKey)>Number(prior.dataset.slideKey)?1:-1;current.animate([{transform:`translateX(${direction*24}px)`,opacity:.65},{transform:'translateX(0)',opacity:1}],{duration:220,easing:'ease-out'});}}
    for(const {node,top,left} of pendingScroll.get(host)||[])if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
    pendingScroll.delete(host);
    for(const track of host.querySelectorAll('.hand-track.is-fan'))fitHandArc(track);
    const shell=host.querySelector('.table-shell');
    if(shell&&stage&&host.ownerDocument.defaultView.matchMedia('(orientation:landscape) and (min-width:600px)').matches&&stage.dataset.surface!=='player'&&stage.dataset.soloField!=='true'){
      const shellBox=shell.getBoundingClientRect(),scale=shellBox.width/shell.offsetWidth||1,mid=shellBox.left+shellBox.width/2;
      const panels=[...stage.querySelectorAll('.player-panel')].map(node=>node.getBoundingClientRect()).filter(box=>box.width&&box.height);
      for(const [side,selector] of [['left','.turn-label'],['right','.status-details']]){
        const boxes=panels.filter(box=>side==='left'?box.right<=mid:box.left>=mid),bar=shell.querySelector('.table-status '+selector);
        if(!boxes.length||!bar)continue;
        const left=Math.min(...boxes.map(box=>box.left)),right=Math.max(...boxes.map(box=>box.right));
        bar.style.setProperty('left',((left-shellBox.left)/scale)+'px','important');
        bar.style.setProperty('right','auto','important');
        bar.style.setProperty('width',((right-left)/scale)+'px','important');
      }
    }else if(shell){for(const bar of shell.querySelectorAll('.table-status>.turn-label,.table-status>.status-details'))for(const prop of ['left','right','width'])bar.style.removeProperty(prop);}

  }
  return Object.freeze({gameTitle,fitGameTitles,button:UI.button,rangeSetting,tileTheme,packRow,fitCovers,roundText,participantsMarkup,quickAccessMarkup,addPlayerButton,deleteConfirmation,actionConfirmationMarkup,confirmDialog,modalContent,updateModal,patchChildren,update,reservePlayerHand,resumeCard,icon,esc,playersMarkup,historyMarkup,resultMarkup,resultSound,presentResultSound,turnNotice,render,layoutScene,allowLayoutChange,iconButton,toolbar,modalHead});
});
