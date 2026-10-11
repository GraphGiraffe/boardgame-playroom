(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>root.PlayroomGameScreen.icon(name);
  const action=(host,local,remote)=>host?`data-command="${local}"`:`data-net-action="${remote}"`;
  const button=(attrs,label,name,disabled=false)=>root.PlayroomGameScreen.iconButton(attrs,label,name,{disabled});
  function render({room,participantId,isHost=false,canStart=false,waiting=false,countdown=3,notice=''}){
    const me=room.participants.find(p=>p.id===participantId),locked=room.phase!=='lobby',configLocked=locked||!!room.recovery,occupied=new Set(room.seats.map(s=>s.participantId).filter(Boolean));
    const person=p=>root.TabletopUI.helpers.participantIcon({...p,local:room.transportMode==='hotseat'&&!p.bot||p.local},{network:room.transportMode==='network'})+`<span class="participant-name">${esc(p.nickname)}</span>`;
    const kick=p=>isHost&&!p.isHost?button(`data-kick-participant="${esc(p.id)}"`,'Исключить '+p.nickname,'trash',locked):'';
    const seats=room.seats.map(seat=>{
      const p=room.participants.find(p=>p.id===seat.participantId),mine=p?.id===participantId;
      const rename=isHost&&!configLocked&&p&&(p.bot||room.transportMode==='hotseat');
      const edit=isHost&&!locked?`<div class="slot-edit"><span class="slot-delete">${p&&!p.isHost?kick(p):''}</span>${button(`data-room-cycle="${esc(seat.id)}"`,'Сменить тип места','seatType',configLocked||!!p&&(p.isHost||!p.local&&!p.bot))}</div>`:'';
      return `<div data-room-drop="${esc(seat.id)}" class="lobby-seat-row ${p?'lobby-person':''}" ${p?`data-participant-id="${esc(p.id)}" data-room-drag="${esc(p.id)}"`:''}><button data-room-drop="${esc(seat.id)}" class="lobby-seat ${p?'occupied':'available'} ${mine?'mine':''}" ${isHost?`data-lobby-seat="${esc(seat.id)}"`:`data-net-seat="${esc(seat.id)}"`} ${locked||seat.closed||!rename&&(me?.ready||(p&&!mine))?'disabled':''}><span class="seat-color" style="background:${esc(seat.color.value)}"></span><span><strong>${p?person(p):esc(seat.color.label)+' слот'}</strong><small>${p?`${mine?'Вы · ':''}<span class="${p.ready?'lobby-ready':'lobby-not-ready'}">${p.ready?'Готов':'Не готов'}</span>`:seat.previousParticipant?'Замена '+esc(seat.previousParticipant.nickname):seat.closed?'Закрыто':'Открыто'}</small></span></button>${room.firstPlayerMode==='assigned'&&p?.id===room.firstParticipantId?`<span class="first-player-mark" aria-label="Первый ход">${icon('first')}</span>`:''}${edit}</div>`;
    }).join('');
    const tablePerson=room.participants.find(p=>p.role==='table');
    const watchers=room.participants.filter(p=>!occupied.has(p.id)&&p.role!=='table').map(p=>`<div class="lobby-person lobby-observer lobby-seat" data-participant-id="${esc(p.id)}" data-room-drag="${esc(p.id)}"><span><strong>${person(p)}</strong><small>${p.id===participantId?'Вы · ':''}Зритель</small></span>${kick(p)}</div>`).join('');
    return `<main class="lobby-shell"><div class="lobby-wrap"><header class="lobby-header modal-head">${button(action(isHost,'close-modal','dismiss-room'),'Закрыть комнату','close')}<div class="lobby-title"><h1>${isHost?`<input data-room-title aria-label="Название комнаты" maxlength="48" value="${esc(room.name)}" ${locked?'disabled':''}>`:`<strong>${esc(room.name)}</strong>`}</h1><span class="lobby-code">#${esc(room.code)}</span></div><div class="lobby-tools ui-toolbar">${root.PlayroomGameScreen.toolbar([{attrs:action(isHost,'room-help','help'),label:'Справка о комнате',name:'help'}],{settingsAttrs:action(isHost,'settings','settings')})}</div></header>
      ${waiting?'<p class="lobby-rules-note" role="status">Ждём возвращения хоста в комнату.</p>':notice?`<p class="lobby-rules-note" role="status">${esc(notice)}</p>`:''}
      <section class="lobby-card">${isHost?`<div class="room-options"><label class="room-transport"><input type="checkbox" role="switch" aria-label="Online режим" data-room-option="transportMode" ${room.transportMode==='network'?'checked':''} ${configLocked?'disabled':''}><span>Offline</span><span>Online</span></label></div>`:''}<div class="lobby-game-line"><h2>${esc(room.game.name)}</h2><div class="lobby-tools">${button(action(isHost,'room-rules-view','rules'),'Правила','rules')}${isHost?button('data-command="room-rules"','Изменить правила','edit',configLocked)+button('data-command="room-change-game"','Сменить игру','layers',configLocked):''}</div></div>
      <div class="lobby-section-head"><h2>Игровые места</h2>${isHost&&room.transportMode!=='hotseat'?button('id="network-pair-button"','Подключить устройство','connect',locked):''}</div><div class="lobby-seats">${seats}</div>
      ${room.transportMode!=='hotseat'?`<div class="lobby-public-places"><section><div class="lobby-section-head lobby-observers-head"><h2>Зрители</h2></div><div class="lobby-observers">${watchers}<button class="lobby-seat lobby-observer-slot" data-room-drop="spectator" ${action(isHost,'lobby-spectator','spectator')} ${locked||me?.ready||me?.role==='spectator'?'disabled':''}><span><strong>${root.TabletopUI.helpers.participantIcon({role:'spectator'})}<span class="participant-name">Зритель</span></strong><small>Открыто</small></span></button></div></section><section class="lobby-table-slot"><div class="lobby-section-head"><h2>Стол</h2>${tablePerson?kick(tablePerson):''}</div><button class="lobby-seat ${tablePerson?'lobby-person':''}" data-room-drop="table" ${tablePerson?`data-room-drag="${esc(tablePerson.id)}"`:""} ${action(isHost,'lobby-table','table')} ${locked||me?.ready||(!isHost&&tablePerson&&tablePerson.id!==participantId)?'disabled':''}><span>${tablePerson?`<strong data-participant-id="${esc(tablePerson.id)}">${person(tablePerson)}</strong>`:`<strong>${root.TabletopUI.helpers.participantIcon({role:'table'})}<span class="participant-name">Стол</span></strong>`}<small>${tablePerson?'Общее поле':'Открыто'}</small></span></button></section></div>`:''}
      ${me?.replacement&&!me.replacement.accepted?`<div class="replacement-consent"><p>Вы продолжите партию за ${esc(me.replacement.previousName)} с его рукой и позицией.</p><button class="btn" data-net-action="accept-replacement">Принять замену</button></div>`:''}<div class="lobby-actions lobby-primary">${button(action(isHost,'lobby-leave','leave'),'Покинуть комнату','exit')}${me?.role==='player'&&room.transportMode!=='hotseat'?button(action(isHost,'lobby-ready','ready')+` aria-pressed="${!!me.ready}"`,me.ready?'Не готов':'Готов','check',locked||!!me.replacement&&!me.replacement.accepted):''}${isHost?button('data-command="lobby-start"',room.recovery?'Продолжить партию':'Начать игру','play',!canStart):''}</div></section></div>
      ${room.phase==='starting'?`<div class="lobby-countdown" role="status" aria-live="assertive"><div><strong ${isHost?'':'id="net-countdown"'}>${countdown}</strong><p>Игра начинается…</p></div></div>`:''}</main>`;
  }
  function nicknameMarkup(room,participantId,client=false){
    const me=room.participants.find(p=>p.id===participantId),disabled=me?.ready||room.phase!=='lobby';
    return `<form id="${client?'net-client-nickname':'lobby-nickname-form'}" class="lobby-profile"><label class="field"><span>Никнейм в комнате</span><input name="nickname" maxlength="24" autocomplete="nickname" required value="${esc(me?.nickname||'')}" ${disabled?'disabled':''}></label><button class="icon-btn" type="submit" aria-label="Сохранить никнейм" title="Сохранить никнейм" ${disabled?'disabled':''}>${icon('check')}</button></form>`;
  }
  function rulesMarkup(room,rows,game={}){
    const rules=Array.isArray(game.rules)?game.rules:game.rules?[String(game.rules)]:[];
    return `<dl class="lobby-rule-grid">${rows.map(item=>`<div class="lobby-rule-row"><dt>${esc(item.label)}</dt><dd>${esc(item.value)}</dd></div>`).join('')}</dl>${rules.length?`<ol class="rules-list">${rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ol>`:''}`;
  }
  function helpMarkup(room){
    const count=room.constraints.allowed?.join(', ')||`${room.constraints.min}–${room.constraints.max}`;
    return `<div class="help-grid"><p>В Online выберите игровое место, Зрителей или единственный Стол. Общий стол не раскрывает закрытые руки.</p><p>Хост перетаскивает участника на другое место: занятые места меняются местами. На телефоне удерживайте карточку перед переносом; обычное движение прокручивает окно. Тип места меняется кнопкой кресла, корзина удаляет участника.</p><p>Нажмите «Готов», когда можно начинать. Готовность блокирует место и никнейм; повторное нажатие снимает её. Имя бота или Offline-игрока меняется нажатием на его место; свой сетевой никнейм — в настройках.</p><p>Хост запускает партию после готовности игроков. Изменение игры или правил снимает готовность у всех.</p><p>Игроков: ${esc(count)}. ${room.hostMode==='table'?'Хост показывает общий стол.':'Хост участвует в игре.'}</p></div>`;
  }
  function bindDrag(host,{move,onError=()=>{},canMove=()=>true}={}){
    if(!host)return;const doc=host.ownerDocument;let drag=null,blockClick=false;
    host.addEventListener('click',e=>{if(blockClick){e.preventDefault();e.stopImmediatePropagation();blockClick=false;}},true);
    host.addEventListener('pointerdown',e=>{
      const source=e.target.closest('[data-room-drag]'),control=e.target.closest('button');
      if(!source||!canMove(source.dataset.roomDrag)||e.button!==0||control&&!control.hasAttribute('data-room-drop'))return;
      const modal=host.closest('.modal'),id=source.dataset.roomDrag;let mode=e.pointerType==='touch'?'pending':'armed',ghost=null,target=null,lastY=e.clientY;
      const startX=e.clientX,startY=e.clientY;let frame=null,point=null;const timer=setTimeout(()=>{if(mode==='pending')mode='armed';},250);
      const stop=()=>{clearTimeout(timer);if(frame!==null)doc.defaultView.cancelAnimationFrame(frame);ghost?.remove();source.classList.remove('room-drag-source');target?.classList.remove('room-drop-active');doc.removeEventListener('pointermove',moving);doc.removeEventListener('pointerup',done);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('keydown',keys,true);doc.defaultView.removeEventListener('blur',cancel);drag=null;};
      const pick=()=>{target?.classList.remove('room-drop-active');target=point?doc.elementFromPoint(point.x,point.y)?.closest('[data-room-drop]'):null;if(target&&host.contains(target))target.classList.add('room-drop-active');else target=null;};
      const scroll=()=>{if(!ghost||!host.isConnected){stop();return;}if(modal&&point){const box=modal.getBoundingClientRect(),top=Math.max(0,box.top),bottom=Math.min(doc.defaultView.innerHeight,box.bottom);if(point.y<top+35)modal.scrollTop-=12;else if(point.y>bottom-35)modal.scrollTop+=12;pick();}frame=doc.defaultView.requestAnimationFrame(scroll);};
      const cancel=()=>stop(),keys=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();stop();}};
      const moving=event=>{
        if(event.pointerId!==e.pointerId)return;const distance=Math.hypot(event.clientX-startX,event.clientY-startY);
        if(mode==='pending'&&distance>6){clearTimeout(timer);mode='scroll';}
        if(mode==='scroll'){if(modal)modal.scrollTop+=lastY-event.clientY;lastY=event.clientY;return;}
        if(mode!=='armed'&&mode!=='drag'||distance<8)return;
        event.preventDefault();if(!ghost){mode='drag';ghost=source.cloneNode(true);ghost.className='room-drag-ghost';ghost.removeAttribute('data-room-drag');ghost.style.width=Math.min(source.getBoundingClientRect().width,220)+'px';doc.body.appendChild(ghost);source.classList.add('room-drag-source');}
        ghost.style.left=event.clientX+10+'px';ghost.style.top=event.clientY+10+'px';
        point={x:event.clientX,y:event.clientY};pick();if(frame===null)frame=doc.defaultView.requestAnimationFrame(scroll);
      };
      const done=event=>{if(event.pointerId!==e.pointerId)return;if(mode==='drag'){point={x:event.clientX,y:event.clientY};pick();}const destination=target?.dataset.roomDrop,commit=mode==='drag'&&destination;stop();if(commit){blockClick=true;setTimeout(()=>blockClick=false,0);Promise.resolve().then(()=>move(id,destination)).catch(onError);}};
      drag={stop};doc.addEventListener('pointermove',moving,{passive:false});doc.addEventListener('pointerup',done);doc.addEventListener('pointercancel',cancel);doc.addEventListener('keydown',keys,true);doc.defaultView.addEventListener('blur',cancel);
    });
    return ()=>drag?.stop();
  }
  root.PlayroomLobbyView={render,nicknameMarkup,rulesMarkup,helpMarkup,bindDrag};
})(globalThis);
