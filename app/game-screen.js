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
  function iconButton(attrs,label,name,{disabled=false,active,className='',type='button'}={}){
    return `<button class="icon-btn ui-icon-button ${esc(className)}${active?' active':''}" type="${esc(type)}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}" ${typeof active==='boolean'?`aria-pressed="${active}"`:''} ${disabled?'disabled':''}>${icon(name)}</button>`;
  }
  function addPlayerButton({disabled=false}={}){
    return iconButton('id="network-pair-button"',globalThis.PlayroomMessages.text("ui.game-screen.c58470ab336f"),'addPlayer',{disabled});
  }
  let quickActions=[];
  function quickAccessMarkup(){return `<div class="settings-shortcuts" role="group" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.69093f8d2817")}">${quickActions.filter(action=>!action.attrs.includes('data-command="settings"')).map(action=>iconButton(action.attrs+' data-quick-shortcut',action.label,action.name,action)).join('')}</div>`;}
  function toolbar(actions,{showSettings=true,settingsAttrs='data-command="settings"'}={}){
    // Context actions grow to the left; help and settings keep the right edge.
    const appearance=showSettings&&root.PlayroomAppearanceUI?[{attrs:'data-appearance-picker',label:root.PlayroomAppearanceUI.text('themes.quick'),name:'palette'}]:[];
    const ordered=[...actions.filter(a=>a.name!=='help'),...appearance,...actions.filter(a=>a.name==='help')];
    if(showSettings)ordered.push({attrs:settingsAttrs,label:globalThis.PlayroomMessages.text("ui.game-screen.985b5e0f2ccf"),name:'settings'});
    quickActions=ordered;return ordered.filter(action=>!action.hidden).map(a=>iconButton(a.attrs,a.label,a.name,a)).join('');
  }
  const modalHead=title=>`<header class="modal-head ui-dialog-head">${iconButton('data-command="close-modal"',globalThis.PlayroomMessages.text("ui.game-screen.a7a4033657e8"),'close')}<h2>${esc(title)}</h2></header>`;
  function modalContent(content){
    const template=root.document.createElement('template');template.innerHTML=content;
    const head=template.content.querySelector('.modal-head');
    const header=head?.outerHTML||'';head?.remove();
    return header+'<div class="modal-body">'+template.innerHTML+'</div>';
  }
  const DOM=root.PlayroomDOM||(typeof require==='function'?require('../platform/web/dom.js'):null),{patchChildren}=DOM;
  const pendingScroll=new WeakMap();
  function update(host,markup){
    const scrollers=[...host.querySelectorAll('[data-scene-scroll],.hand-track,.hand-scroll')].map(node=>({node,top:node.scrollTop,left:node.scrollLeft}));
    const template=host.ownerDocument.createElement('template');template.innerHTML=markup;
    patchChildren(host,template.content);
    pendingScroll.set(host,scrollers);
  }
  function updateModal(modal,content){
    const template=modal.ownerDocument.createElement('template');template.innerHTML=modalContent(content);
    const body=modal.querySelector('.modal-body'),scroll=body?.scrollTop||0;
    const anchor=[...modal.querySelectorAll('.lobby-seat-row,.lobby-observer,.pack-entry')].find(el=>el.getBoundingClientRect().bottom>(body?.getBoundingClientRect().top||0)&&(!el.matches('.pack-entry')||content.includes(`data-pack-id="${el.dataset.packId}" data-pack-version="${el.dataset.packVersion}"`)));
    const top=anchor?.getBoundingClientRect().top;
    patchChildren(modal,template.content);
    if(body){body.scrollTop=scroll;if(anchor?.isConnected)body.scrollTop+=anchor.getBoundingClientRect().top-top;}
  }
  function roundText(round){return round&&Number.isSafeInteger(round.number)&&round.number>0?globalThis.PlayroomMessages.text(round.kind==='bout'?'progress.bout':round.limit?'progress.round-of':'progress.round',{number:round.number,...(round.limit?{limit:round.limit}:{})}):'';}
  function participantsMarkup(state){return state?.players?`<span class="resume-participants">${state.players.map((player,index)=>`<span class="${state.status!=='finished'&&index===state.turn?'saved-current-turn':''}">${UI.helpers.participantIcon(player)}${esc(player.name)}</span>`).join(' · ')}</span>`:'';}
  function resumeCard({title,detail,state=null,network=false,connected=true,action='data-command="resume"',leave=''}){
    return `<section class="resume-banner ${network?'network-resume-card':''}"><div><span class="pill">${network?globalThis.PlayroomMessages.text("ui.game-screen.6fa8cb59219b"):globalThis.PlayroomMessages.text("ui.game-screen.02d339ef14d5")}</span><strong>${esc(title)}</strong><p>${esc(detail)}${roundText(state?.scene?.round)?' · '+esc(roundText(state.scene.round)):''}${state?.timeline?' · '+esc(globalThis.PlayroomMessages.text('progress.turn',{number:state.timeline.turn})):''}</p>${participantsMarkup(state)}</div><div class="resume-actions">${leave?iconButton(leave,globalThis.PlayroomMessages.text("ui.game-screen.5af791bedf3a"),'exit'):''}${iconButton(action,connected?globalThis.PlayroomMessages.text("ui.game-screen.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.game-screen.2de34a1774f6"),connected?'play':'reset',{className:'resume-primary'})}</div></section>`;
  }
  // The same markup is used with a trusted local Session and with the
  // projection-only SessionClient. No rule or network state is read here.
  function playersMarkup(state,viewer,actions=[],{scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerBadge=()=>''}={}){
    return [...UI.seatOrder(state.players.length,viewer),...(viewer>=0&&viewer<state.players.length?[viewer]:[])].map(i=>UI.playerPanel(state,i,viewer,{scoreLabel,badges:[playerBadge(state,i)].filter(Boolean)},actions)).join('');
  }

  function historyMarkup({index,count,caption='',playing=false,readOnly=false,newFrom=null,roundStarts=[],turnStarts=[]}={}){
    return `<section class="history-panel" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.50d264e3cfa4")}"><div class="history-controls">${roundStarts.length?`<button class="icon-btn history-round-button" data-command="replay-round-prev" aria-label="${esc(globalThis.PlayroomMessages.text('progress.prev-round'))}" ${index===0?'disabled':''}><span aria-hidden="true">≪</span></button>`:''}<button class="icon-btn" data-command="replay-prev" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.6a458bd0ee56")}" ${index===0?'disabled':''}>${icon('prev')}</button><button class="icon-btn" data-command="replay-play" aria-label="${playing?globalThis.PlayroomMessages.text("ui.game-screen.3396400da0c4"):globalThis.PlayroomMessages.text("ui.game-screen.bdd37eb21746")} ${globalThis.PlayroomMessages.text("ui.game-screen.8be4990dd2c1")}">${icon(playing?'pause':'play')}</button><span class="replay-track ${Number.isInteger(newFrom)&&newFrom>0&&newFrom<=count?'has-new-history':''}" style="--new-from:${Number.isInteger(newFrom)&&count>0?Math.max(0,Math.min(100,newFrom/count*100)):100}%">${turnStarts.filter(revision=>Number.isSafeInteger(revision)&&revision>0&&revision<=count&&!roundStarts.some(mark=>mark.revision===revision)).map(revision=>`<i class="history-turn-marker" style="left:calc(8px + (100% - 16px) * ${revision/Math.max(1,count)})"></i>`).join('')}${roundStarts.filter(mark=>Number.isInteger(mark.revision)&&mark.revision>0&&mark.revision<=count).map(mark=>`<i class="history-round-marker" style="left:calc(8px + (100% - 16px) * ${mark.revision/Math.max(1,count)})" title="${esc(globalThis.PlayroomMessages.text('progress.round-start',{number:mark.number}))}"></i>`).join('')}<input type="range" min="0" max="${count}" value="${index}" id="replay-range" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.6d38f72f9e93")}"></span><button class="icon-btn" data-command="replay-next" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.baa4f395d537")}" ${index===count?'disabled':''}>${icon('next')}</button>${roundStarts.length?`<button class="icon-btn history-round-button" data-command="replay-round-next" aria-label="${esc(globalThis.PlayroomMessages.text('progress.next-round'))}" ${index===count?'disabled':''}><span aria-hidden="true">≫</span></button>`:''}<span class="replay-badge" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.3cc3ea21bf69")}${index} ${globalThis.PlayroomMessages.text("ui.game-screen.ef9f13d03f4e")}${count}">${index} / ${count}</span></div></section>`;
  }
  function deleteConfirmation({name=globalThis.PlayroomMessages.text("ui.game-screen.02c17edea60f"),network=false,confirmAttrs=''}){
    return `${modalHead(globalThis.PlayroomMessages.text("ui.game-screen.97e625bfddc6"))}<p class="lead">${esc(name)} ${globalThis.PlayroomMessages.text("ui.game-screen.c45481781f5f")}${network?globalThis.PlayroomMessages.text("ui.game-screen.9264423128bd"):globalThis.PlayroomMessages.text("ui.game-screen.b01c15488ec5")}. ${globalThis.PlayroomMessages.text("ui.game-screen.6905ded6e0fe")}</p><div class="modal-foot"><button class="btn secondary" data-command="close-modal">${globalThis.PlayroomMessages.text("ui.game-screen.97b65905439a")}</button><button class="btn coral" ${confirmAttrs}>${icon('trash')} ${globalThis.PlayroomMessages.text("ui.game-screen.be99b1361201")}</button></div>`;
  }
  function resultMarkup({state,viewer,gameName,scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerContent=[],network=false}={}){
    if(!state||state.status!=='finished')return '';
    const winner=state.winner,winningPlayers=state.winners|| (winner==null?[]:[winner]),person=winner==null?null:state.players[winner];
    const title=winner===null?globalThis.PlayroomMessages.text("ui.game-screen.4af04ce619c5"):viewer<0?winningPlayers.length>1?globalThis.PlayroomMessages.text("ui.game-screen.b271075deff7")+winningPlayers.map(i=>state.players[i]?.name||globalThis.PlayroomMessages.text("ui.game-screen.f54f58cf08df")).join(', '):globalThis.PlayroomMessages.text("ui.game-screen.133252d718b0",{p0:String(person?.name||globalThis.PlayroomMessages.text("ui.game-screen.f54f58cf08df"))}):winningPlayers.includes(viewer)?globalThis.PlayroomMessages.text("ui.game-screen.a5f1eda8ce7a"):globalThis.PlayroomMessages.text("ui.game-screen.379be9d6d960");
    const semanticContent=UI.playerContent(state,viewer,null);
    const scores=state.players.map((player,i)=>({player,i})).sort((a,b)=>(state.result?.places?.[a.i]??0)-(state.result?.places?.[b.i]??0)||a.i-b.i).map(({player,i})=>{
      const place=state.result?.places?.[i],value=state.result?.values?.[i],detail=state.result?.details?.[i];
      const medal=place?place<=3?UI.playerMedallion({place,layout:UI.helpers.tokenLayout.fan(0,{count:2})}):`<span class="result-place-text" role="img" aria-label="${place} ${globalThis.PlayroomMessages.text("ui.game-screen.200db10c242a")}">${place}</span>`:winningPlayers.includes(i)?'★ ':'';
      const team=playerContent[i]?.team||state.scene?.players?.find(player=>(player.player??player.id)===i)?.team||null;
      const first=state.firstPlayer===i;
      const playerBadge=UI.playerMedallion({first,team,layout:medal?UI.helpers.tokenLayout.fan(1,{count:2}):null});
      const badge=`<span class="result-awards">${medal}${playerBadge}</span>`;
      const content=playerContent[i]||semanticContent[i]||{},counters=content.counters??[{kind:'points',value:Number.isSafeInteger(player.score)&&player.score>=0?player.score:0,label:scoreLabel}];
      const shown=[...counters].sort((a,b)=>(a.kind==='wins')-(b.kind==='wins'));
      const hand=Number.isSafeInteger(content.handCount)?UI.countBadge(content.handCount,globalThis.PlayroomMessages.text("ui.game-screen.aac1090346a5",{p0:String(player.name),p1:String(content.countLabel||globalThis.PlayroomMessages.text("ui.game-screen.c81b450ffa45"))}),{hand:true}):'';
      const indicators=Array.isArray(content.indicators)?UI.indicators(content.indicators.map(({icon,value,size,label})=>({icon,value,size,label}))):'';
      const primary=`<span class="result-core-counters">${hand}${shown.map(UI.scoreBadge).join('')}</span>${indicators}`;
      const shownIds=new Set([...shown.map(counter=>counter.id||counter.kind),...(Number.isSafeInteger(content.handCount)?[content.handMetricId||'hand-count']:[]),...(content.indicators||[]).map(indicator=>indicator.id).filter(Boolean)]);
      const extra=(state.result?.metrics||[]).filter(metric=>metric.display!=='ranking'&&!shownIds.has(metric.id)&&Number.isFinite(metric.values?.[i])).map(metric=>`${metric.label}: ${metric.values[i]}`);
      return `<div class="score-row">${badge}${UI.avatar(player,i)}<span class="result-name">${UI.participantIcon(player)}${i===viewer?`<strong>${esc(player.name)}</strong>`:esc(player.name)}</span><span class="result-stat"><span class="result-counters">${primary}</span>${extra.length?`<small title="${esc(extra.join(' · '))}">${esc(extra.join(' · '))}</small>`:''}</span></div>`;
    }).join('');
    return `${modalHead(title)}<div class="result-art" aria-hidden="true">✦</div><p class="lead">${esc(gameName)} · ${state.move} ${globalThis.PlayroomMessages.text("ui.game-screen.85d3cfbb11da")}</p><div class="result-scores">${scores}</div><div class="modal-foot"><button class="btn secondary" data-command="result-replay">${globalThis.PlayroomMessages.text("ui.game-screen.5818f0c93a9b")}</button>${network?`<button class="btn" data-command="rematch">${globalThis.PlayroomMessages.text("ui.game-screen.a8e06ed9a3c5")}</button>`:`<button class="btn" data-command="rematch">${globalThis.PlayroomMessages.text("ui.game-screen.0bb191eca038")}</button>`}</div>${network?'':`<button class="btn secondary result-menu" data-command="home">${icon('grid')} ${globalThis.PlayroomMessages.text("ui.game-screen.70c6a395ad9d")}</button>`}`;
  }
  function turnNotice({play=()=>{},reducedMotion=()=>false}={}){
    let previous=null,timer=null;
    return {
      observe({sessionId,revision,turn,viewer,status,paused=false,active=true,mount=document}){
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
  function render({gameName,subtitle='',state,viewer,actions=[],scene='',turnText='',turnExtra='',replay=false,
    busy=false,botThinking=false,animationSpeed='',beforeFooter='',historyHTML='',footerText='',footerTitle=footerText,footerAction={command:'home',label:globalThis.PlayroomMessages.text("ui.game-screen.1fd4bffb137b"),icon:'back'},
    statusExtra='',footerExtra='',saved=null,showSettings=true,network=false,revision=null,scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerBadge,historyResult=false,readOnly=false,pause=false,canPause=true,historyCaption='',roomAction=null,fieldToggle=null}={}){
    fieldToggle=network&&!readOnly&&viewer>=0?fieldToggle:null;
    if(!state?.players)throw Error('Projected game state required');
    const primary=historyResult||(!network&&state.status==='finished')?{attrs:'data-command="result"',label:globalThis.PlayroomMessages.text("ui.game-screen.24735a7161d9"),name:'trophy'}:roomAction?{...roomAction,label:globalThis.PlayroomMessages.text("ui.game-screen.3a73248bdd79"),name:'room'}:null;
    const caption=esc(replay?(historyCaption||footerText||globalThis.PlayroomMessages.text("ui.game-screen.03f70ecc37a6")):footerText||'');
    if(beforeFooter){const slot=scene.indexOf('data-game-element="actions"');if(slot>=0){const end=scene.indexOf('>',slot);scene=scene.slice(0,end+1)+beforeFooter+scene.slice(end+1);}else scene=scene.replace('<!--self-controls-->',beforeFooter);}
    return `<main class="table-shell${network?' network-game':''}"${network?` data-revision="${revision}" data-viewer="${viewer}"`:''}><header class="table-header"><div class="table-heading">${iconButton(historyHTML?'data-command="history-close"':'data-command="home"',historyHTML?(readOnly?globalThis.PlayroomMessages.text("ui.game-screen.ed9aa3c20c66"):globalThis.PlayroomMessages.text("ui.game-screen.ae29400e7f17")):globalThis.PlayroomMessages.text("ui.game-screen.1fd4bffb137b"),'back')}<div class="table-title"><h1 title="${esc(gameName)}">${esc(gameName)}</h1><p>${esc(subtitle.replace(/^За столом с ботами\s*·?\s*/,''))}</p></div></div>
      <div class="table-tools ui-toolbar">${toolbar([
        ...(primary?[{...primary,attrs:primary.attrs+' data-game-primary="true"'}]:[]),
        {attrs:'data-command="history"',label:globalThis.PlayroomMessages.text("ui.game-screen.c9d00b5b5cd1"),name:'history',active:!!historyHTML,hidden:!!fieldToggle},
        ...(fieldToggle?[{attrs:'data-command="toggle-field"',label:fieldToggle.hidden?globalThis.PlayroomMessages.text("ui.game-screen.4df59b1750a8"):globalThis.PlayroomMessages.text("ui.game-screen.af36d13ed774"),name:'grid',active:fieldToggle.hidden}]:[]),
        ...(!readOnly?[{attrs:'data-command="pause"',label:pause?globalThis.PlayroomMessages.text("ui.game-screen.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.game-screen.65530fd463ea"),name:pause?'play':'pause',active:pause,disabled:!canPause||!!historyHTML}]:[]),
        {attrs:'data-command="fullscreen"',label:globalThis.PlayroomMessages.text("ui.game-screen.f42c392566b5"),name:'full'},
        {attrs:'data-command="rules"',label:globalThis.PlayroomMessages.text("ui.game-screen.7f7b0ffbbfe0"),name:'help'}
      ],{showSettings})}</div></header>
      <div class="table-status" aria-live="polite"><span class="turn-label"><i class="turn-light ${botThinking?'bot':''}"></i>${esc(turnText)}</span><span class="turn-extra">${esc([roundText(state.scene?.round),state.timeline?globalThis.PlayroomMessages.text('progress.turn',{number:state.timeline.turn}):'',turnExtra].filter(Boolean).join(' · '))}</span>${caption?`<span class="status-event" title="${esc(replay?(historyCaption||footerText||globalThis.PlayroomMessages.text("ui.game-screen.03f70ecc37a6")):footerTitle)}">${caption}</span>`:''}${statusExtra}</div>
      <section class="scene ${replay?'replaying':''}" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.134df14b27b8")}" aria-busy="${!!busy}"${animationSpeed?` data-animation-speed="${esc(animationSpeed)}"`:""}>${scene}</section>
      ${historyHTML}
      ${footerExtra?`<div class="table-extra">${footerExtra}</div>`:''}</main>`;
  }
  function fitHand(stage){
    for(const mini of stage.querySelectorAll('.player-panel .mini-hand')){
      const count=mini.children.length;if(!count)continue;
      const style=mini.ownerDocument.defaultView.getComputedStyle(mini),available=mini.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
      mini.style.setProperty('--mini-step',(count>1?Math.max(mini.classList.contains('is-open')?12:0,Math.min(32,(available-mini.firstElementChild.getBoundingClientRect().width)/(count-1))):32)+'px');
    }
    for(const track of stage.querySelectorAll('.layout-hand .hand-track.is-fan')){
      track.style.removeProperty('--fan-peek');
      const win=track.ownerDocument.defaultView,baseline=parseFloat(win.getComputedStyle(track).getPropertyValue('--fan-peek'))||28;
      let peek=baseline;
      for(const card of track.querySelectorAll('.hand-card')){
        const corner=card.querySelector('.card-corner:not(.bottom)');if(!corner)continue;
        const box=card.getBoundingClientRect(),marker=corner.getBoundingClientRect();
        peek=Math.max(peek,Math.min(box.width,Math.ceil(marker.right-box.left+2)));
      }
      const count=track.querySelectorAll('.hand-card').length,card=track.querySelector('.hand-card');
      if(count>1&&card){const width=card.getBoundingClientRect().width,style=win.getComputedStyle(track),available=track.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);peek=Math.max(peek,Math.min(width,(available-width-2)/(count-1)));}
      if(peek>baseline)track.style.setProperty('--fan-peek',peek+'px');
    }
  }
  function fitField(stage){
    const slot=stage.querySelector('.layout-field'),field=slot?.firstElementChild;if(!field)return;
    const width=slot.clientWidth,height=slot.clientHeight;if(width<=0||height<=0)return;
    if(stage.dataset.fieldSizing==='scroll'){field.style.width=width+'px';field.style.height=height+'px';field.style.zoom='1';field.style.setProperty('--field-scale','1');return;}
    if(stage.dataset.fieldSizing==='content'){
      field.style.width='100%';field.style.height='auto';field.style.zoom='1';field.style.setProperty('--field-scale','1');return;
    }
    if(stage.dataset.layoutFamily==='board'){
      const aspect=Number(slot.style.getPropertyValue('--field-aspect'))||1;
      field.style.width=Math.min(width,height*aspect)+'px';field.style.height=Math.min(height,width/aspect)+'px';field.style.zoom='1';return;
    }
    field.style.zoom='1';field.style.width=Math.min(width,520)+'px';field.style.height='auto';field.style.setProperty('--field-scale','1');
    const r=field.getBoundingClientRect(),natural=Math.max(field.scrollHeight,r.height,1),scale=Math.max(.85,Math.min(['desktop','tablet'].includes(stage.dataset.layoutMode)?1.4:1,width/Math.max(field.scrollWidth,r.width,1),height/natural));
    field.style.height=natural+'px';field.style.zoom=String(scale);field.style.setProperty('--field-scale',String(scale));
  }
  const replayFitters=new WeakMap();
  function layoutScene(host){
    const scene=host.querySelector('.scene'),previous=replayFitters.get(host);
    if(previous?.scene!==scene){
      previous?.observer?.disconnect();replayFitters.delete(host);
      if(scene){
        const Observer=scene.ownerDocument.defaultView.ResizeObserver;
        const observer=Observer?new Observer(()=>layoutScene(host)):null;
        replayFitters.set(host,{scene,observer});observer?.observe(scene);const participants=scene.querySelector('.layout-participants');if(participants)observer?.observe(participants);for(const hand of scene.querySelectorAll('.mini-hand'))observer?.observe(hand);
      }
    }
    const stage=scene?.querySelector('.app-game-layout');if(stage){const win=scene.ownerDocument.defaultView;stage.dataset.layoutMode=win.TabletopUI.selectLayout(scene.clientWidth,scene.clientHeight);if(stage.dataset.surface==='player'){const count=stage.querySelectorAll('.layout-participants .player-panel').length,wide=scene.clientWidth>scene.clientHeight&&scene.clientWidth>=600;const available=scene.clientWidth*(wide?.65:1),columns=Math.max(1,Math.min(count,Math.floor(available/155)));stage.style.setProperty('--player-columns',columns);stage.style.setProperty('--player-rows',Math.ceil(count/columns));const own=stage.querySelector('.layout-self'),height=own?.clientHeight||150;stage.style.setProperty('--focus-hand-width',Math.max(58,Math.min(125,(height-90)*.69))+'px');}fitField(stage);fitHand(stage);root.PlayroomHandOverflow?.sync?.(host);}
    if(stage){stage.style.zoom='1';const current=stage.querySelector('[data-slide-key]'),prior=previous?.scene?.querySelector('[data-slide-key]');if(previous?.scene!==scene&&current&&prior&&current.dataset.slideKey!==prior.dataset.slideKey&&!host.ownerDocument.body.classList.contains('reduced-motion')&&!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){const direction=Number(current.dataset.slideKey)>Number(prior.dataset.slideKey)?1:-1;current.animate([{transform:`translateX(${direction*24}px)`,opacity:.65},{transform:'translateX(0)',opacity:1}],{duration:220,easing:'ease-out'});}}
    for(const {node,top,left} of pendingScroll.get(host)||[])if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
    pendingScroll.delete(host);
  }
  return Object.freeze({roundText,participantsMarkup,quickAccessMarkup,addPlayerButton,deleteConfirmation,modalContent,updateModal,patchChildren,update,resumeCard,icon,esc,playersMarkup,historyMarkup,resultMarkup,turnNotice,render,layoutScene,iconButton,toolbar,modalHead});
});
