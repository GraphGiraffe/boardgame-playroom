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
    return iconButton('id="network-pair-button"','Подключить игрока или устройство','addPlayer',{disabled});
  }
  function toolbar(actions,{showSettings=true,settingsAttrs='data-command="settings"'}={}){
    // Context actions grow to the left; help and settings keep the right edge.
    const ordered=[...actions.filter(a=>a.name!=='help'),...actions.filter(a=>a.name==='help')];
    if(showSettings)ordered.push({attrs:settingsAttrs,label:'Настройки',name:'settings'});
    return ordered.map(a=>iconButton(a.attrs,a.label,a.name,a)).join('');
  }
  const modalHead=title=>`<header class="modal-head ui-dialog-head">${iconButton('data-command="close-modal"','Закрыть','close')}<h2>${esc(title)}</h2></header>`;
  function modalContent(content){
    const template=root.document.createElement('template');template.innerHTML=content;
    const head=template.content.querySelector('.modal-head');
    const header=head?.outerHTML||'';head?.remove();
    return header+'<div class="modal-body">'+template.innerHTML+'</div>';
  }
  function updateModal(modal,content){
    const template=modal.ownerDocument.createElement('template');template.innerHTML=modalContent(content);
    const body=modal.querySelector('.modal-body'),scroll=body?.scrollTop||0;
    const anchor=[...modal.querySelectorAll('.lobby-seat-row,.lobby-observer')].find(el=>el.getBoundingClientRect().bottom>(body?.getBoundingClientRect().top||0));
    const top=anchor?.getBoundingClientRect().top;
    const key=n=>n.nodeType===1?(n.id||n.getAttribute('data-room-drop')||n.getAttribute('data-participant-id')||n.getAttribute('data-command')||n.getAttribute('data-net-action')||''):'';
    function patch(parent,next){
      const old=[...parent.childNodes],used=new Set();let previous=null;
      for(const fresh of [...next.childNodes]){
        const k=key(fresh);let node=old.find(n=>!used.has(n)&&n.nodeType===fresh.nodeType&&n.nodeName===fresh.nodeName&&key(n)===k);
        if(!node)node=fresh.cloneNode(true);else{
          used.add(node);
          if(node.nodeType===3){if(node.textContent!==fresh.textContent)node.textContent=fresh.textContent;}
          else if(node.nodeType===1){
            const focused=node===node.ownerDocument.activeElement;
            for(const a of [...node.attributes])if(!fresh.hasAttribute(a.name)&&!(focused&&a.name==='value'))node.removeAttribute(a.name);
            for(const a of fresh.attributes)if(!(focused&&a.name==='value')&&node.getAttribute(a.name)!==a.value)node.setAttribute(a.name,a.value);
            if(!focused&&'value' in node&&node.tagName==='INPUT')node.value=fresh.value;
            patch(node,fresh);
          }
        }
        const at=previous?previous.nextSibling:parent.firstChild;if(node!==at)parent.insertBefore(node,at);previous=node;
      }
      for(const n of old)if(!used.has(n)&&n.parentNode===parent)n.remove();
    }
    patch(modal,template.content);
    if(body){body.scrollTop=scroll;if(anchor?.isConnected)body.scrollTop+=anchor.getBoundingClientRect().top-top;}
  }
  function resumeCard({title,detail,network=false,connected=true,action='data-command="resume"',leave=''}){
    return `<section class="resume-banner ${network?'network-resume-card':''}"><div><span class="pill">${network?'Сетевая':'Локальная'}</span><strong>${esc(title)}</strong><p>${esc(detail)}</p></div><div class="resume-actions">${leave?iconButton(leave,'Покинуть комнату','exit'):''}${iconButton(action,connected?'Продолжить':'Подключиться снова',connected?'play':'reset',{className:'resume-primary'})}</div></section>`;
  }
  // The same markup is used with a trusted local Session and with the
  // projection-only SessionClient. No rule or network state is read here.
  function playersMarkup(state,viewer,actions=[],{scoreLabel='очки',playerBadge=()=>''}={}){
    return [...UI.seatOrder(state.players.length,viewer),...(viewer>=0&&viewer<state.players.length?[viewer]:[])].map(i=>UI.playerPanel(state,i,viewer,{scoreLabel,badges:[playerBadge(state,i)].filter(Boolean)},actions)).join('');
  }

  function historyMarkup({index,count,caption='',playing=false,readOnly=false}={}){
    return `<section class="history-panel" aria-label="Повтор ходов"><div class="history-controls"><button class="icon-btn" data-command="replay-prev" aria-label="Предыдущий ход" ${index===0?'disabled':''}>${icon('prev')}</button><button class="icon-btn" data-command="replay-play" aria-label="${playing?'Остановить':'Воспроизвести'} повтор">${icon(playing?'pause':'play')}</button><input type="range" min="0" max="${count}" value="${index}" id="replay-range" aria-label="Номер хода"><button class="icon-btn" data-command="replay-next" aria-label="Следующий ход" ${index===count?'disabled':''}>${icon('next')}</button><span class="replay-badge" aria-label="Ход ${index} из ${count}">${index} / ${count}</span></div></section>`;
  }
  function deleteConfirmation({name='Это сохранение',network=false,confirmAttrs=''}){
    return `${modalHead('Удалить партию?')}<p class="lead">${esc(name)} и вся история этой партии будут удалены ${network?'только на этом устройстве':'с устройства'}. Остальные партии останутся.</p><div class="modal-foot"><button class="btn secondary" data-command="close-modal">Оставить</button><button class="btn coral" ${confirmAttrs}>Удалить</button></div>`;
  }
  function resultMarkup({state,viewer,gameName,scoreLabel='очки',network=false}={}){
    if(!state||state.status!=='finished')return '';
    const winner=state.winner,winningPlayers=state.winners|| (winner==null?[]:[winner]),person=winner==null?null:state.players[winner];
    const title=winner===null?'Ничья!':viewer<0?winningPlayers.length>1?'Победители: '+winningPlayers.map(i=>state.players[i]?.name||'Игрок').join(', '):`${person?.name||'Игрок'} побеждает`:winningPlayers.includes(viewer)?'Победа!':'Поражение';
    const scores=state.players.map((player,i)=>`<div class="score-row"><span>${winningPlayers.includes(i)?'★ ':''}${esc(player.name)}${i===viewer?' · вы':''}</span><strong>${esc(scoreLabel)}: ${Number.isFinite(player.score)?player.score:0}</strong></div>`).join('');
    return `${modalHead(title)}<div class="result-art" aria-hidden="true">✦</div><p class="lead">${esc(gameName)} · ${state.move} действий за столом</p><div class="result-scores">${scores}</div><div class="modal-foot"><button class="btn secondary" data-command="result-replay">Посмотреть историю</button>${network?`<button class="btn" data-command="rematch">Вернуться в комнату</button>`:`<button class="btn" data-command="rematch">Ещё партию</button>`}</div>${network?'':`<button class="btn secondary result-menu" data-command="home">${icon('grid')} В меню</button>`}`;
  }
  function render({gameName,subtitle='',state,viewer,actions=[],scene='',turnText='',turnExtra='',replay=false,
    busy=false,botThinking=false,animationSpeed='',beforeFooter='',historyHTML='',footerText='',footerTitle=footerText,footerAction={command:'home',label:'К играм',icon:'back'},
    statusExtra='',footerExtra='',saved=null,showSettings=true,network=false,revision=null,scoreLabel='очки',playerBadge,historyResult=false,readOnly=false,pause=false,canPause=true,historyCaption='',roomAction=null}={}){
    if(!state?.players)throw Error('Projected game state required');
    const primary=historyResult||(!network&&state.status==='finished')?{attrs:'data-command="result"',label:'Результаты',name:'trophy'}:roomAction?{...roomAction,label:'Комната',name:'room'}:null;
    const caption=esc(replay?(historyCaption||footerText||'Начальная расстановка'):footerText||'');
    if(beforeFooter){const slot=scene.indexOf('data-game-element="actions"');if(slot>=0){const end=scene.indexOf('>',slot);scene=scene.slice(0,end+1)+beforeFooter+scene.slice(end+1);}else scene=scene.replace('<!--self-controls-->',beforeFooter);}
    return `<main class="table-shell${network?' network-game':''}"${network?` data-revision="${revision}" data-viewer="${viewer}"`:''}><header class="table-header"><div class="table-heading">${iconButton(historyHTML?'data-command="history-close"':'data-command="home"',historyHTML?(readOnly?'Закрыть историю':'Вернуться к игре'):'К играм','back')}<div class="table-title"><h1 title="${esc(gameName)}">${esc(gameName)}</h1><p>${esc(subtitle.replace(/^За столом с ботами\s*·?\s*/,''))}</p></div></div>
      <div class="table-tools ui-toolbar">${toolbar([
        ...(primary?[{...primary,attrs:primary.attrs+' data-game-primary="true"'}]:[]),
        {attrs:'data-command="history"',label:'История ходов',name:'history',active:!!historyHTML},
        ...(!readOnly?[{attrs:'data-command="pause"',label:pause?'Продолжить':'Пауза',name:pause?'play':'pause',active:pause,disabled:!canPause||!!historyHTML}]:[]),
        {attrs:'data-command="fullscreen"',label:'Полный экран',name:'full'},
        {attrs:'data-command="rules"',label:'Правила игры',name:'help'}
      ],{showSettings})}</div></header>
      <div class="table-status" aria-live="polite"><span class="turn-label"><i class="turn-light ${botThinking?'bot':''}"></i>${esc(turnText)}</span><span class="turn-extra">${esc(turnExtra)}</span>${caption?`<span class="status-event" title="${esc(replay?(historyCaption||footerText||'Начальная расстановка'):footerTitle)}">${caption}</span>`:''}${statusExtra}</div>
      <section class="scene ${replay?'replaying':''}" aria-label="Игровой стол" aria-busy="${!!busy}"${animationSpeed?` data-animation-speed="${esc(animationSpeed)}"`:""}>${scene}</section>
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
    const stage=scene?.querySelector('.app-game-layout');if(stage){const win=scene.ownerDocument.defaultView;stage.dataset.layoutMode=win.TabletopUI.selectLayout(scene.clientWidth,scene.clientHeight);fitField(stage);fitHand(stage);root.PlayroomHandOverflow?.sync?.(host);}
    if(stage)stage.style.zoom='1';
  }
  return Object.freeze({addPlayerButton,deleteConfirmation,modalContent,updateModal,resumeCard,icon,esc,playersMarkup,historyMarkup,resultMarkup,render,layoutScene,iconButton,toolbar,modalHead});
});
