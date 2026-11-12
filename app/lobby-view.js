if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>root.PlayroomGameScreen.icon(name);
  const action=(host,local,remote)=>host?`data-command="${local}"`:`data-net-action="${remote}"`;
  const button=(attrs,label,name,disabled=false)=>root.PlayroomGameScreen.iconButton(attrs,label,name,{disabled});
  const textAction=(attrs,label,name,{disabled=false,primary=false,danger=false}={})=>`<button type="button" class="${primary?'btn lobby-main-action':'lobby-text-action'}${danger?' ui-action-danger':''}" ${attrs} ${disabled?'disabled':''}>${name?icon(name):''}<span>${esc(label)}</span></button>`;
  let lastRulesNotice=null,lastBotNotice=null;
  function notifyRulesChange(room,participantId,notify){
    if(room.transportMode==='hotseat'||room.phase!=='lobby')return;
    const botKey=JSON.stringify([room.id,participantId,room.botSettingsRevision]);if(room.participants.find(p=>p.id===participantId)?.botSettingsNotice&&lastBotNotice!==botKey){lastBotNotice=botKey;notify(root.PlayroomMessages.text('ui.bot-settings.changed'));}
    if(!room.participants.find(p=>p.id===participantId)?.rulesNotice)return;
    const key=JSON.stringify([room.id,participantId,room.rulesRevision]);
    if(lastRulesNotice===key)return;
    lastRulesNotice=key;
    const manifest=root.PlayroomCatalog?.[room.game.id]||{};
    const describe=rules=>root.PlayroomMultiplayer.describeRules(rules,manifest.settings||[],false,manifest.presetSetting);
    const before=room.previousRules&&describe(room.previousRules),after=describe(room.rules);
    const changes=before?after.filter(row=>before.find(old=>old.label===row.label)?.value!==row.value).map(row=>`${row.label}: ${before.find(old=>old.label===row.label)?.value??'—'} → ${row.value}`):[];
    if(changes.length)notify(changes.join('\n'));else if(!before)notify(root.PlayroomMessages.text("ui.network-ui.bcabed4ce53a"));
  }
  root.addEventListener('playroom:modal-restored',()=>{
    const lobby=document.querySelector('#modal-root>[data-surface-state=active] .room-v021');if(!lobby)return;
    const context=root.PlayroomNetworkLibrary?.inviteContext?.();
    if(context?.room?.id===lobby.dataset.roomId&&context.room.phase!=='closed')root.PlayroomNetworkLibrary.openRoom();
    else root.PlayroomAppBridge?.closeModal?.(true);
  });
  function roomContextCopy(room,isHost){
    const editable=isHost&&room.phase==='lobby'&&!room.recovery;
    return {title:editable?'Настройки комнаты':'Комната',detail:editable?(room.transportMode==='hotseat'?'Название комнаты':'Название и доступ'):isHost?'Название и закрытие':'Выход из комнаты'};
  }
  function roomContextMarkup({room,participantId,isHost=false}){
    const locked=room.phase!=='lobby'||!!room.recovery;
    const name=isHost?`<form data-room-context-name data-room-id="${esc(room.id)}" data-room-actor="${esc(participantId)}" data-room-owner="${esc(room.ownerId)}" novalidate><label class="field"><span>Название комнаты</span><input name="roomName" data-room-title maxlength="48" required autocomplete="off" value="${esc(room.name)}" ${locked?'readonly':''}></label>${locked?'<p class="room-context-name-note">Название можно изменить до начала партии.</p>':''}<p data-room-name-error role="alert" class="room-context-name-message"></p><p data-room-name-status role="status" class="room-context-name-message"></p>${locked?'':`<div class="room-context-name-actions"><button type="submit" class="btn" data-room-name-save>Сохранить</button><button type="button" class="btn secondary" data-command="close-modal">Отмена</button></div>`}</form>`:'';
    return root.PlayroomGameScreen.modalHead(roomContextCopy(room,isHost).title)+`<div class="room-v021-context">${isHost&&!locked&&room.transportMode==='online'?textAction('data-room-online-access','Доступ в комнату','lock'):''}${isHost&&!locked&&room.transportMode==='network'?`<label class="room-v021-auto"><span>Игроки могут приглашать</span><input type="checkbox" data-room-invite-permission ${room.allowPlayerInvites?'checked':''}><span class="room-v021-toggle" aria-hidden="true"><span></span></span></label><p data-room-permission-error role="alert" class="room-context-name-message"></p>`:''}${name}<div class="menu-list">${textAction(action(isHost,'lobby-leave','leave'),isHost?'Закрыть комнату':'Выйти из комнаты','exit',{danger:true})}</div></div>`;
  }
  function render({room,participantId,isHost=false,canStart=false,startReason='',waiting=false,countdown=3,notice='',completed=false}){
    const me=room.participants.find(p=>p.id===participantId),locked=room.phase!=='lobby',configLocked=locked||!!room.recovery,seats=[...room.seats].sort((a,b)=>a.index-b.index),occupied=new Set(seats.map(s=>s.participantId).filter(Boolean));
    const chevron='<span class="room-v021-chevron" aria-hidden="true">›</span>';
    const personRow=(p,{seat=null,index=0}={})=>{
      const mine=p.id===participantId,draggable=!configLocked&&(p.id===participantId&&!p.ready||isHost&&p.bot),botConfig=room.game.botSettings||{strategies:[]},first=root.PlayroomCatalog?.[room.game.id]?.capabilities?.firstPlayer!==false&&room.firstPlayerMode==='assigned'&&p.id===room.firstParticipantId;
      const manifest=root.PlayroomCatalog?.[room.game.id],layouts=room.game.teamLayouts||(manifest?.version===room.game.version?manifest.teamLayouts:null),team=seat?root.TabletopUI.helpers.teamFor(layouts,room.rules?.preset,index):null;
      const attrs=p.bot?`data-bot-settings="${esc(JSON.stringify({person:p,config:botConfig,seatId:seat?.id,readonly:!isHost||locked,remote:!isHost}))}"`:`data-room-person="${esc(p.id)}"`;
      const role=p.role==='spectator'?'Зритель':p.role==='table'?'Стол':p.bot?'Бот':mine?'Вы':'Игрок';
      const detail=p.bot?root.PlayroomMessages.text('ui.bot-settings.'+(p.botSettings?.difficulty||'medium')).toLocaleLowerCase('ru'):p.role==='spectator'||p.role==='table'?(p.connected===false?'не в сети':'в сети'):room.transportMode==='hotseat'?'':(p.ready?'готов':'не готов');
      const roleInfo=[role,detail].filter(Boolean).join(' · ');
      const place=seat?root.PlayroomMultiplayer.seatColor(seat.index):null,number=seat?`<span class="room-v021-seat-number" aria-hidden="true">${seat.index+1}</span>`:'';
      return `<div class="room-v021-row${seat?' room-v021-seat':''}" role="listitem" ${seat?`data-seat-person data-room-seat="${esc(seat.id)}" data-seat-number="${seat.index+1}" data-entity="room-seat-${esc(seat.id)}" style="--room-seat-color:${esc(place.value)}"`:''} ${seat?`data-room-drop="${esc(seat.id)}"`:''} data-participant-id="${esc(p.id)}"><button type="button" class="room-v021-person" ${seat?`aria-label="${esc('Место '+(seat.index+1)+', '+place.label+', '+p.nickname+', '+roleInfo)}"`:''} ${attrs} ${draggable?`data-room-drag="${esc(p.id)}" aria-description="Удерживайте, чтобы переместить в другое место"`:""} ${seat?`data-room-drop="${esc(seat.id)}"`:''}><span class="player-avatar-wrap lobby-avatar-wrap" ${mine&&room.transportMode!=='hotseat'?'data-quick-reaction="true" role="button" tabindex="0" aria-label="Быстрая реакция"':''}>${root.TabletopUI.avatar(p,index,{hidden:true})}${root.TabletopUI.helpers.playerMedallion({first,team})}${number}</span><span class="room-v021-person-copy"><strong>${esc(p.nickname)}</strong><small>${esc(roleInfo)}</small></span>${chevron}</button></div>`;
    };
    const players=seats.map(seat=>{const person=room.participants.find(p=>p.id===seat.participantId);if(person)return personRow(person,{seat,index:seat.index});const place=root.PlayroomMultiplayer.seatColor(seat.index),disabled=configLocked||!isHost&&(seat.closed||me?.ready);return `<div class="room-v021-row room-v021-seat${seat.closed?' is-closed':''}" role="listitem" data-room-seat="${esc(seat.id)}" data-seat-number="${seat.index+1}" data-entity="room-seat-${esc(seat.id)}" data-room-drop="${esc(seat.id)}" style="--room-seat-color:${esc(place.value)}"><button type="button" class="room-v021-empty" data-room-drop="${esc(seat.id)}" ${isHost?`data-room-cycle="${esc(seat.id)}"`:`data-net-seat="${esc(seat.id)}"`} aria-label="${esc('Место '+(seat.index+1)+', '+place.label+', '+(seat.closed?'закрыто':'свободно'))}" ${disabled?'disabled':''}><span class="room-v021-empty-number" aria-hidden="true">${seat.index+1}</span><span class="room-v021-person-copy"><strong>${seat.closed?'Закрыто':'Свободно'}</strong><small>${esc(place.label)}</small></span>${chevron}</button></div>`;}).join('');
    const guests=room.participants.filter(p=>!occupied.has(p.id)).map((p,index)=>personRow(p,{index})).join('');
    const firstSeat=seats.find(seat=>seat.participantId===room.firstParticipantId),firstLabel=room.firstPlayerMode==='assigned'&&firstSeat?'Первый ход · место '+(firstSeat.index+1):room.firstPlayerMode==='random'?'Первый ход · случайный игрок':'Первый ход · по правилам',canAssign=isHost&&!configLocked&&room.constraints.max>1&&root.PlayroomCatalog?.[room.game.id]?.capabilities?.firstPlayer!==false;
    const host=room.participants.find(p=>p.id===room.ownerId),mode=({hotseat:'На устройстве',online:'Онлайн',network:'Рядом'})[room.transportMode],code=room.transportMode==='online'&&room.onlineCodeAssigned?' · '+room.code:'';
    const rulesSummary=root.PlayroomMultiplayer.describeRules(room.rules,root.PlayroomCatalog?.[room.game.id]?.settings||[],false,root.PlayroomCatalog?.[room.game.id]?.presetSetting).slice(0,1).map(row=>row.label+': '+row.value).join(' · ');
    const gameLocked=configLocked?'Игру можно сменить до начала партии.':'';
    const gameArt=`<span class="pack-art room-v021-art">${root.PlayroomViews?.cover?.(room.game.id)||icon('board')}</span>`;
    const cover=isHost?`<button type="button" class="room-v021-cover-choice" data-command="room-change-game" aria-label="${esc('Сменить игру: '+room.game.name)}" ${gameLocked?`disabled title="${esc(gameLocked)}"`:''}>${gameArt}<span class="room-v021-cover-edit" aria-hidden="true">${icon('layers')}</span></button>`:`<span class="room-v021-cover-choice is-readonly">${gameArt}</span>`;
    const parametersId='room-game-parameters-'+encodeURIComponent(room.id)+'-'+encodeURIComponent(participantId);
    const gameIdentity=`<span class="room-v021-game-copy"><small title="${esc(rulesSummary||mode+code)}">${esc(rulesSummary||mode+code+' · хост '+(host?.nickname||''))}</small><span class="room-v021-game-edit">Параметры игры ${icon(isHost?'edit':'chevron')}</span>${gameLocked?`<small class="room-v021-game-lock">${esc(gameLocked)}</small>`:''}</span>`;
    const gameContext=`${cover}<label class="room-v021-game-title" for="${esc(parametersId)}" title="${esc(room.game.name)}"><strong>${esc(room.game.name)}</strong></label><button type="button" id="${esc(parametersId)}" class="room-v021-game-context" ${action(isHost,'room-rules','parameters')} aria-label="${esc('Параметры игры: '+room.game.name)}">${gameIdentity}</button>`;
    const roomActions=(room.transportMode!=='hotseat'?textAction('data-room-chat-open','Чат комнаты','chat'):'')+(completed?textAction(room.transportMode==='hotseat'?'data-command="result"':'data-net-action="result"','Итог партии','trophy'):isHost&&room.phase==='playing'?textAction(room.transportMode!=='hotseat'?'data-net-action="stop-match"':'data-command="stop-local-match"','Остановить партию','stop',{danger:true}):'');
    const ready=me?.role==='player'&&room.transportMode!=='hotseat'?textAction(action(isHost,'lobby-ready','ready')+` aria-pressed="${!!me.ready}"`,me.ready?'Я не готов':'Готов к игре','check',{primary:true,disabled:locked||!!me.replacement&&!me.replacement.accepted}):'';
    const start=isHost&&room.phase!=='playing'&&(!room.autoStart||room.transportMode==='hotseat')?textAction('data-command="lobby-start"',room.recovery?'Продолжить партию':'Начать партию','play',{primary:true,disabled:!canStart}):'';
    const firstControl=canAssign?`<button type="button" class="room-v021-link room-v021-first" data-first-token data-first-label="${esc(firstLabel)}" aria-pressed="false">${root.TabletopUI.helpers.playerMedallion({first:true})}<span><strong data-first-label>${esc(firstLabel)}</strong></span></button>`:'';
    return `<main class="lobby-shell room-v021" data-room-id="${esc(room.id)}" data-room-actor="${esc(participantId)}" data-transport-mode="${room.transportMode}">${root.PlayroomGameScreen.modalHead(room.name,{className:'room-v021-header',symbol:'room',dismissAttrs:action(isHost,'close-modal','dismiss-room'),actions:button(action(isHost,'room-help','help'),'Как устроена комната','help')})}<div class="room-v021-content"><div class="room-v021-overview"><section class="room-v021-summary room-v021-game-summary">${gameContext}${textAction(action(isHost,'room-rules-view','rules'),'Правила','rules')}</section>${waiting||notice?`<p class="room-v021-notice" role="status">${esc(waiting?'Ожидаем подключения…':notice)}</p>`:''}</div><div class="room-v021-roster"><div class="room-v021-players-heading"><h3>Игроки</h3>${firstControl}</div><div class="room-v021-seats" role="list" aria-label="Места за столом">${players}</div>${guests?`<h3 class="room-v021-guests-heading">Вне стола</h3><div class="room-v021-people" role="list">${guests}</div>`:''}</div><div class="room-v021-tools"><div class="room-v021-invite">${root.PlayroomLobbyNetwork?.row({room,isHost,locked})||''}</div>${roomActions?`<div class="room-v021-actions">${roomActions}</div>`:''}${room.transportMode!=='hotseat'?`<label class="room-v021-auto"><span>Автостарт</span><input type="checkbox" data-room-auto-start ${room.autoStart?'checked':''} ${!isHost||locked?'disabled':''}><span class="room-v021-toggle" aria-hidden="true"><span></span></span></label>`:''}${room.phase==='lobby'&&startReason&&![root.PlayroomMessages.text('ui.rooms.start-unavailable'),root.PlayroomMessages.text('ui.rooms.d0769b2394d2')].includes(startReason)?`<p class="room-v021-start-reason" role="status">${esc(startReason)}</p>`:''}<button type="button" class="room-v021-context-link" data-room-context><span><strong>${roomContextCopy(room,isHost).title}</strong><small>${roomContextCopy(room,isHost).detail}</small></span>${icon('settings')}</button></div></div><footer data-fixed-footer class="room-v021-footer">${me?.replacement&&!me.replacement.accepted?`<p>Вы заменяете ${esc(me.replacement.previousName)}</p><button class="btn" data-net-action="accept-replacement">Подтвердить замену</button>`:''}${ready}${start}</footer>${room.phase==='starting'?`<div class="lobby-countdown" role="status" aria-live="assertive"><div><strong ${isHost?'':'id="net-countdown"'}>${countdown}</strong><p>Игра начинается…</p>${me?.role==='player'&&!me.bot?`<button class="btn" ${action(isHost,'lobby-ready','ready')}>Я не готов</button>`:''}</div></div>`:''}</main>`;
  }
  root.document?.addEventListener?.('click',event=>{
    const entry=event.target.closest('[data-room-context]'),source=entry?.closest('[data-room-id]');
    if(!entry||!source?.isConnected||source.closest('[data-surface-state]')?.dataset.surfaceState!=='active')return;
    const context=root.PlayroomNetworkLibrary?.inviteContext?.(),bridge=root.PlayroomAppBridge;
    if(!context?.room||!bridge||source.dataset.roomId!==context.room.id||source.dataset.roomActor!==context.participantId)return;
    const id=context.room.id,actor=context.participantId,isHost=context.room.ownerId===actor,room=isHost?bridge.roomService.snapshot(id):context.room,owner=room.ownerId;
    const valid=()=>{const now=root.PlayroomNetworkLibrary?.inviteContext?.();return now?.room?.id===id&&now.participantId===actor&&now.room.ownerId===owner&&now.room.phase!=='closed';};
    const frame=bridge.openModal(roomContextMarkup({room,participantId:actor,isHost}),'room-context-modal',{onBack:bridge.captureModalReturn(),valid});
    const input=frame?.element?.querySelector('[data-room-invite-permission]');if(!input)return;
    const current=()=>valid()&&frame.state==='active'&&frame.element.isConnected&&frame.element.contains(input);
    input.addEventListener('change',()=>{
      if(!current())return;
      try{
        const latest=bridge.setRoomInvitationPermission(input.checked,{roomId:id,actor,owner,current});if(!current())return;
        const state=latest||bridge.roomService.snapshot(id),error=frame.element.querySelector('[data-room-permission-error]');input.checked=!!state.allowPlayerInvites;input.disabled=!latest;
        error.textContent=latest?'':state.ownerId!==actor?'Доступ может изменить только ведущий.':state.recovery?'Доступ недоступен при восстановлении партии.':state.phase!=='lobby'?'Доступ можно изменить до начала партии.':'Откройте настройки комнаты заново.';
      }
      catch(error){if(current()){input.checked=!!bridge.roomService.snapshot(id).allowPlayerInvites;frame.element.querySelector('[data-room-permission-error]').textContent=root.PlayroomMessages.error(error);}}
    });
  });
  function nicknameMarkup(room,participantId,client=false){
    const me=room.participants.find(p=>p.id===participantId),disabled=me?.ready||room.phase!=='lobby';
    return `<form id="${client?'net-client-nickname':'lobby-nickname-form'}" class="lobby-profile" data-inline-actions>${(root.PlayroomAvatarPicker?.button(me?.nickname||'',me?.avatar)||'').replace('data-avatar-picker',client?'data-avatar-picker data-avatar-client':'data-avatar-picker')}<label class="field"><input aria-label="${esc(globalThis.PlayroomMessages.text("ui.lobby-view.82b5d2603d58"))}" name="nickname" maxlength="24" autocomplete="nickname" required value="${esc(me?.nickname||'')}" ${disabled?'disabled':''}></label></form>`;
  }
  const ruleText=key=>globalThis.PlayroomMessages.text('rules-help.'+key);
  // Standard settings have one public illustration across every pack and role.
  // No participant identity or rule execution is needed to draw these examples.
  // Parameter-only service drawings. Physical game components retain their own art.
  function parameterSymbolArt(name,value){
    const shapes={
      trophy:'<path d="M43 12H77V27C77 38 69 44 60 44S43 38 43 27ZM43 18H33V23C33 32 38 36 46 36M77 18H87V23C87 32 82 36 74 36M60 44V56M47 60H73M52 56H68"/><path d="M35 57C26 49 22 38 24 28M25 40l-7-5m8 11-8-1m12 8-8 2M85 57C94 49 98 38 96 28M95 40l7-5m-8 11 8-1m-12 8 8 2"/>',
      close:'<circle cx="60" cy="36" r="25"/><path d="m49 25 22 22m0-22-22 22"/>',
      cards:'<g transform="rotate(-10 51 37)"><rect x="31" y="15" width="34" height="47" rx="5"/><path d="M37 23H43M37 28H41"/></g><rect x="53" y="10" width="34" height="47" rx="5"/><path d="m70 24 8 10-8 10-8-10ZM59 17h5m12 33h5"/>',
      undo:'<path d="M57 10H76L87 21V55H57ZM76 10V21H87M63 29H79M63 35H75"/><path d="M46 24 31 35 46 46M32 35H57C72 35 74 60 55 60H41"/>',
      history:'<path d="M55 8H83V47M48 14H76V52M41 20H69V58H56M48 28H62M48 34H60"/><path d="M33 32 22 42 33 52M23 42H42C59 42 60 65 42 65H33"/>',
      refresh:'<path d="M38 23A25 25 0 0 1 81 20M81 9V21H69M82 47A25 25 0 0 1 39 50M39 62V49H51"/><path d="M60 13v4M83 35H79M60 57V53M37 35H41"/><circle cx="60" cy="35" r="3"/>',
      clock:String(value)==='0'?'<path d="M60 36C50 21 44 18 36 24 25 32 32 49 42 49S59 32 69 25 88 24 88 36 79 52 71 47 52 22 41 23"/><path d="M36 59H84M43 14H77"/>':'<circle cx="60" cy="37" r="25"/><path d="M60 12V7M53 7H67M60 17V21M80 37H76M60 57V53M40 37H44M60 24V37L71 44M78 14l5-5m-2-2 4 4"/>',
      hand:'<rect x="60" y="9" width="24" height="33" rx="4" transform="rotate(9 72 25)"/><path d="m68 18 6 6-6 6-6-6ZM28 46l9-11c3-4 8 0 5 4l-3 5 15-18c3-4 8 0 5 4L49 43l16-10c5-3 9 2 5 5L57 49l17-5c5-1 7 5 2 7L59 60c-8 4-16 4-22-1L28 52ZM26 46l-7 8 10 10 7-7"/>',
      bot:'<rect x="38" y="17" width="44" height="31" rx="8"/><path d="M60 17V10M32 28V38M88 28V38M45 41H65M33 63V59C33 52 40 49 47 49H58"/><circle cx="60" cy="7" r="3"/><circle cx="50" cy="29" r="3"/><circle cx="70" cy="29" r="3"/><rect x="65" y="48" width="21" height="21" rx="3"/><path d="m75.5 52 5 6-5 6-5-6Z"/>',
      ship:'<path d="M24 45H96L85 59H37ZM41 45V27H76V45M48 27V18H68V27M58 18V7M58 9H77L70 15H58M30 65q8-5 16 0t16 0 16 0 16 0"/><path d="M48 34H53M62 34H67M44 51H49M58 51H63M72 51H77"/>',
      'eye-off':'<path d="M24 36C43 9 77 9 96 36 77 63 43 63 24 36ZM30 10 90 62"/><path d="M50 27a13 13 0 0 0 18 18M70 28a13 13 0 0 0-18-3"/><path d="M20 23 15 19M100 23l5-4M60 11V6"/>',
      lock:'<rect x="37" y="29" width="46" height="35" rx="6"/><path d="M46 29V20a14 14 0 0 1 28 0V29M51 29V20a9 9 0 0 1 18 0V29"/><circle cx="60" cy="43" r="4"/><path d="M60 47V54M44 57H49M71 57H76"/>',
      people:'<circle cx="60" cy="20" r="10"/><path d="M42 62V51a18 18 0 0 1 36 0V62M49 49V62M71 49V62"/><circle cx="30" cy="29" r="7"/><path d="M16 62V54a14 14 0 0 1 23-11M23 55V62"/><circle cx="90" cy="29" r="7"/><path d="M104 62V54a14 14 0 0 0-23-11M97 55V62"/>'
    };
    if(!Object.hasOwn(shapes,name))return '';
    return root.PlayroomGameComponents.vector.viewport({width:120,height:72,className:'rule-preview-parameter-symbol',attrs:`data-art-role="parameter-diagram" data-parameter-symbol="${esc(name)}" data-parameter-symbol-family="line-v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`,content:shapes[name]});
  }
  function parameterArt(name,value){
    name=String(name||'').replace(/^option-/, '');value=String(value);
    const H=root.TabletopUI.helpers,V=root.PlayroomGameComponents.vector;
    const body=svg=>svg.replace(/^<svg\b[^>]*>/,'').replace(/<\/svg>$/,'');
    const glyph=(key,x,y,size)=>`<g transform="translate(${x} ${y}) scale(${size/24})" fill="none" stroke="currentColor" stroke-width="${38.4/size}" stroke-linecap="round" stroke-linejoin="round">${body(H.icon(key))}</g>`;
    const token=(x,y,size)=>`<g data-first-player-token transform="translate(${x} ${y}) scale(${size/100})" stroke="none">${body(H.roundTokenArt({value:1}))}</g>`;
    let drawing='',id='';
    if(name==='firstPlayerMode'){
      id='first-'+value;
      if(value==='rules')drawing='<g data-rule-book><path d="M34 29Q47 25 60 31Q73 25 86 29V63Q73 59 60 65Q47 59 34 63ZM60 31V65M40 36l13 2m-13 6 13 2m-13 6 13 2m14-16 13-2m-13 10 13-2m-13 10 13-2"/></g>'+token(48,0,24);
      else if(value==='assigned')drawing='<circle cx="55" cy="31" r="8"/><path d="M40 63V52a15 15 0 0 1 30 0v11m-24-18 9 6 9-6"/>'+token(70,3,31);
      else if(value==='random'){
        const cx=41,cy=29,r=21,point=(angle,radius)=>[cx+Math.cos(angle)*radius,cy+Math.sin(angle)*radius].map(n=>Number(n.toFixed(3)));
        const sectors=Array.from({length:6},(_,i)=>{const a=point(i*Math.PI/3,r),b=point((i+1)*Math.PI/3,r);return `<path data-wheel-sector d="M${cx} ${cy}L${a.join(' ')}A${r} ${r} 0 0 1 ${b.join(' ')}Z" fill="currentColor" fill-opacity="${i%2?.12:.04}"/>`;}).join('');
        const handles=Array.from({length:6},(_,i)=>{const p=point(i*Math.PI/3,r+3);return `<circle data-wheel-handle cx="${p[0]}" cy="${p[1]}" r="1.7" fill="currentColor" stroke="none"/>`;}).join('');
        drawing=`<path data-wheel-stand d="M37 50 32 62H50L45 50M28 64H54"/>${sectors}<circle cx="${cx}" cy="${cy}" r="${r}"/>${handles}<circle data-wheel-axle cx="${cx}" cy="${cy}" r="2" fill="currentColor"/><path data-wheel-pointer d="M77 24 68 29 77 34Z" fill="currentColor" stroke="none"/>`+token(81,13,35);
      }else return '';
    }else if(name==='seatOrder'){
      if(!['normal','random'].includes(value))return '';id='seats-'+value;
      const chairs=[[18,35,14,14,25,42],[38,8,15,13,45.5,14.5],[67,8,15,13,74.5,14.5],[92,35,14,14,99,42]];
      drawing='<circle data-round-table cx="60" cy="43" r="21" fill="currentColor" fill-opacity=".05"/><circle cx="60" cy="43" r="21"/>';
      drawing+=chairs.map(([x,y,w,h,cx,cy],i)=>`<g data-table-chair="${i+1}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="currentColor" fill-opacity=".07"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5"/>${i===0?'<path d="M14 34V50"/>':i===3?'<path d="M110 34V50"/>':`<path d="M${x} ${y-4}H${x+w}"/>`}${value==='normal'?`<text data-seat-number x="${cx}" y="${cy+.5}" fill="currentColor" stroke="none" text-anchor="middle" dominant-baseline="central" font-family="system-ui,sans-serif" font-size="9" font-weight="700">${i+1}</text>`:''}</g>`).join('');
      if(value==='random')drawing+=glyph('shuffle',48,31,24);
    }else if(name==='endMode'){
      id='ending-'+value;
      if(value==='winner')drawing=body(parameterSymbolArt('trophy',value));
      else if(value==='round')drawing='<g data-last-round-timer stroke-width="1.6"><path data-timer-speed d="M23 28H43M15 41H39M25 54H43"/><path d="M67 17V12H73V17M62 8H78M88 22l4-4m-6-2 8 8"/><circle cx="70" cy="41" r="22"/><path data-timer-remaining d="M70 41V23A18 18 0 0 1 82.73 28.27Z" fill="currentColor" stroke="none"/><path d="M70 41 82.73 28.27"/><circle cx="70" cy="41" r="1.6" fill="currentColor"/></g>';
      else if(value==='last')drawing='<g data-previous-players fill="currentColor" stroke="none"><circle cx="20" cy="43" r="2.5"/><circle cx="33" cy="43" r="2.5"/><circle cx="46" cy="43" r="2.5"/></g>'+'<circle cx="87" cy="25" r="8"/><path d="M71 62V51a16 16 0 0 1 32 0v11m-25-19 9 6 9-6"/>';
      else return '';
    }else return '';
    return V.viewport({width:120,height:72,className:'rule-preview-common-art',attrs:`data-art-role="parameter-diagram" data-common-parameter-art="${id}" data-parameter-family="line-v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"`,content:drawing});
  }
  let helpSequence=0;
  function fieldHelp(text,title=null){
    if(!text)return '';
    const id='rule-help-'+(++helpSequence),label=esc(title?ruleText('more')+': '+title:ruleText('more'));
    return `<span class="rule-help"><button type="button" popovertarget="${id}" aria-label="${label}" title="${label}">${root.TabletopUI.helpers.icon('help').replace('</svg>','<circle class="help-focus-ring" cx="12" cy="12" r="14"/>' + '</svg>')}</button><span id="${id}" class="mini-help-popover" popover="auto" role="note">${esc(text)}</span></span>`;
  }
  // Plain-text rule sections: first line is a heading; subsequent lines are paragraphs.
  // Older packs with single-line rules remain readable without interpreting HTML.
  function gameRulesMarkup(game,settings=[],{rules=null,rows=null,presetSetting=null,hasHands=false,firstPlayer=true}={}){
    const tabsId=root.PlayroomGameScreen.pageTabsId();
    const paragraphs=Array.isArray(game.rules)?game.rules:game.rules?[String(game.rules)]:[];
    const plainSections=paragraphs.map((rule,index)=>{
      const lines=String(rule).split('\n').filter(line=>line.trim());
      return lines.length>1?`<section class="rulebook-section" id="rulebook-section-${index}" tabindex="-1"><h3>${esc(lines.shift())}</h3>${lines.map(line=>`<p>${esc(line)}</p>`).join('')}</section>`:`<p>${esc(lines[0]||'')}</p>`;
    }).join('');
    const rulebook=root.PlayroomRulebookView||(typeof require==='function'?require('./rulebook-view.js'):null);
    const sections=game.rulebook&&rulebook?rulebook.render(game.rulebook,{esc,illustrate:id=>root.PlayroomViews?.illustration(game.id,id)||''}):plainSections;
    const chosen=rules?root.PlayroomMultiplayer.describeRules(rules,settings,false,presetSetting):(rows||[]).filter(row=>row.label!==ruleText('openHandsLabel'));
    const selected=label=>chosen.find(row=>row.label===label)?.value;
    const note=value=>value===undefined||value===null?'':`<div class="rules-mode-note"><strong>${esc(ruleText('selected'))}</strong> ${esc(value)}</div>`;
    const option=(title,body,value)=>`<section class="rulebook-option"><h4>${esc(title)}</h4>${body}${note(value)}</section>`;
    const presets=presetSetting?.options||game.presets||[];
    const modeLabel=presetSetting?.label||ruleText('mode');
    const choices=labels=>`<p class="rulebook-choices">${esc(ruleText('choices'))} ${labels.map(esc).join(' · ')}</p>`;
    const mode=presets.length?option(modeLabel,(presetSetting?.help?`<p>${esc(presetSetting.help)}</p>`:'')+choices(presets.map(p=>p.label||p.id||p.value))+presets.filter(p=>p.description).map(p=>`<p><strong>${esc(p.label||p.id||p.value)}</strong> — ${esc(p.description)}</p>`).join(''),selected(modeLabel)):'';
    const fields=settings.map(field=>option(field.label,`<p>${esc(field.help||'')}</p>${choices(field.options.map(o=>o.label))}`,selected(field.label))).join('');
    const shared=game.max>1?(firstPlayer?option(ruleText('firstPlayerLabel'),`<p>${esc(ruleText('firstPlayer'))}</p>${choices(['rules','random','assigned'].map(mode=>ruleText('first.'+mode)))}`,rules?.firstPlayerMode?ruleText('first.'+rules.firstPlayerMode):null):'')+option(ruleText('seatOrderLabel'),`<p>${esc(ruleText('seatOrder'))}</p>${choices(['normal','random'].map(order=>ruleText('order.'+order)))}`,rules?.seatOrder?ruleText('order.'+rules.seatOrder):null):'';
    const commonRows=[];if(rules&&game.max>1){if(firstPlayer&&rules.firstPlayerMode)commonRows.push({label:ruleText('firstPlayerLabel'),value:ruleText('first.'+rules.firstPlayerMode)});if(rules.seatOrder)commonRows.push({label:ruleText('seatOrderLabel'),value:ruleText('order.'+rules.seatOrder)});}
    const descriptions=new Map(settings.map(field=>[field.label,field.help||ruleText('choices')+' '+field.options.map(o=>o.label).join(' · ')]));
    descriptions.set(modeLabel,presetSetting?.help||presets.map(p=>(p.label||p.id||p.value)+(p.description?' — '+p.description:'')).join('\n'));
    descriptions.set(ruleText('firstPlayerLabel'),ruleText('firstPlayer'));descriptions.set(ruleText('seatOrderLabel'),ruleText('seatOrder'));
    const summaryList=items=>`<dl>${items.map(row=>`<div><dt><span>${esc(row.label)}:</span>${fieldHelp(descriptions.get(row.label),row.label)}</dt><dd>${esc(row.value)}</dd></div>`).join('')}</dl>`;
    const summary=commonRows.length||chosen.length?`<section class="rules-selected-settings" aria-label="${esc(ruleText('selected'))}">${commonRows.length?summaryList(commonRows):''}${commonRows.length&&chosen.length?'<hr>':''}${chosen.length?summaryList(chosen):''}</section>`:'';
    const titles=game.rulebook?.sections?.map(section=>section.title||'')||paragraphs.map(rule=>String(rule).split('\n').filter(line=>line.trim()).length>1?String(rule).split('\n').find(line=>line.trim()):'');
    const brief=game.rulebook?.brief?rulebook.render(game.rulebook.brief,{esc,illustrate:id=>root.PlayroomViews?.illustration(game.id,id)||''}):'<p>У этой версии игры нет краткого обзора.</p><button type="button" class="menu-row" data-rulebook-mode="full">Читать полные правила</button>';
    const toc=rulebook.contents(titles,{esc,label:ruleText('contents'),optionsLabel:ruleText('options')});
    return `<section class="game-rules-help" id="rulebook-top" tabindex="-1"><div class="rulebook-mode app-page-tabs shared-page-tabs" style="--page-count:2;--page-index:0" role="tablist" aria-label="Объём правил"><button type="button" data-rulebook-mode="brief" id="${tabsId}-tab-brief" aria-controls="${tabsId}-panel-brief" role="tab" aria-selected="true" tabindex="0" aria-pressed="true">Кратко</button><button type="button" data-rulebook-mode="full" id="${tabsId}-tab-full" aria-controls="${tabsId}-panel-full" role="tab" aria-selected="false" tabindex="-1" aria-pressed="false">Полные правила</button></div><div data-rulebook-brief id="${tabsId}-panel-brief" aria-labelledby="${tabsId}-tab-brief" class="rulebook-brief-short" role="tabpanel" aria-label="Кратко">${brief.replaceAll('id="rulebook-section-','id="rulebook-brief-')}</div><div data-rulebook-full id="${tabsId}-panel-full" aria-labelledby="${tabsId}-tab-full" role="tabpanel" aria-label="Полные правила" hidden>${summary}${toc}<div class="rulebook-main">${sections}</div><hr class="rulebook-divider"><section class="rulebook-config" id="rulebook-options" tabindex="-1"><h3>${esc(ruleText('options'))}</h3>${shared}${shared&&(mode||fields)?'<hr>':''}${mode}${fields}${!mode&&!fields&&!shared?`<p>${esc(ruleText('standard'))}</p>`:''}</section></div></section>`;
  }
  function rulesMarkup(room,rows,game={},settings=[]){
    const manifest=root.PlayroomCatalog?.[room.game?.id];
    return gameRulesMarkup(game,settings,{rules:room.rules,rows,presetSetting:manifest?.presetSetting,hasHands:!!manifest?.capabilities?.hands,firstPlayer:manifest?.capabilities?.firstPlayer!==false});
  }
  function helpMarkup(room){
    const count=room.constraints.allowed?.join(', ')||`${room.constraints.min}–${room.constraints.max}`;
    return `<div class="help-grid"><p>${globalThis.PlayroomMessages.text("ui.lobby-view.d39249fac6c2")}</p><p>${globalThis.PlayroomMessages.text("ui.lobby-view.c254176d5c74")}; ${globalThis.PlayroomMessages.text("ui.lobby-view.df15f13f856b")}</p><p>${globalThis.PlayroomMessages.text("ui.lobby-view.fd2d96efdb5b")}; ${globalThis.PlayroomMessages.text("ui.lobby-view.755ac85d11c9")}; ${globalThis.PlayroomMessages.text("ui.lobby-view.040d688c3b63")}</p><p>${globalThis.PlayroomMessages.text("ui.lobby-view.97bb7c5e221f")}</p><p>${globalThis.PlayroomMessages.text("ui.lobby-view.7caffbc12c10")}${esc(count)}. ${room.hostMode==='table'?globalThis.PlayroomMessages.text("ui.lobby-view.7b4b104a8c98"):globalThis.PlayroomMessages.text("ui.lobby-view.8bc7a2c9022a")}</p></div>`;
  }
  function activeLobby(host,roomId,actorId){
    return host.isConnected&&host.dataset.roomId===roomId&&host.dataset.roomActor===actorId&&!host.closest('[inert],[hidden],[aria-hidden="true"],[data-surface-state="suspended"]');
  }
  function watchLobby(host,cleanup){
    let lifetime=host._lobbyLifetime;
    if(!lifetime){
      const callbacks=new Set(),observer=new MutationObserver(()=>{if(!host.isConnected||!host.closest('#modal-root')){for(const close of [...callbacks])close();}});
      observer.observe(host.ownerDocument.getElementById('modal-root'),{childList:true,subtree:true});
      lifetime=host._lobbyLifetime={callbacks,observer};
    }
    lifetime.callbacks.add(cleanup);
    return ()=>{lifetime.callbacks.delete(cleanup);if(!lifetime.callbacks.size){lifetime.observer.disconnect();if(host._lobbyLifetime===lifetime)delete host._lobbyLifetime;}};
  }
  const dragDelay=event=>event.pointerType==='touch'?350:0;
  const rosterScroll=host=>host.closest('.modal-body')||host.closest('.modal');
  function bindFirst(host,assign,{current=()=>true,onError=()=>{}}={}){
    if(!host)return;const token=host.querySelector('[data-first-token]'),roomId=host.dataset.roomId,actorId=host.dataset.roomActor;
    const old=host._firstBinding;
    if(old&&old.token===token&&old.roomId===roomId&&old.actorId===actorId){old.options={assign,current,onError};old.arm(false);return old.cleanup;}
    old?.cleanup();if(!token)return;
    const events=new AbortController();let armed=false,unwatch;
    const record={token,roomId,actorId,options:{assign,current,onError}};
    const valid=()=>activeLobby(host,roomId,actorId)&&record.options.current()&&token.isConnected;
    const arm=value=>{armed=value;token.setAttribute('aria-pressed',String(value));host.classList.toggle('is-first-targeting',value);const label=token.querySelector('[data-first-label]');if(label)label.textContent=value?'Выберите занятое место':token.dataset.firstLabel;};record.arm=arm;
    const choose=target=>{
      const home=target?.closest('[data-first-token]')===token,row=target?.closest('.room-v021-row[data-seat-person]'),id=home?null:row?.dataset.participantId;
      if(!valid()||!home&&(!id||!host.contains(row)))return false;
      arm(false);try{Promise.resolve(record.options.assign(id)).catch(record.options.onError);}catch(error){record.options.onError(error);}return true;
    };
    const pointer=root.PlayroomOrderUI.create({list:host,rows:()=>[token.querySelector('.player-medallion')],key:()=>roomId+':first',handle:'[data-first-token] .player-medallion',current:valid,delay:0,activationDistance:8,suppressHandleClick:false,previewClass:'room-first-drag-ghost',scroll:()=>rosterScroll(host),resolveDrop:({element})=>{const target=element?.closest('[data-first-token],.room-v021-row[data-seat-person]');return target&&host.contains(target)?{target}:null;},move:({target})=>choose(target)});
    host.addEventListener('click',event=>{if(!valid())return;if(event.target.closest('[data-first-token]')){event.preventDefault();event.stopImmediatePropagation();arm(!armed);}else if(armed&&(choose(event.target)||event.target.closest('[data-room-seat]'))){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal:events.signal});
    host.addEventListener('keydown',event=>{if(armed&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();arm(false);}},{capture:true,signal:events.signal});
    record.cleanup=()=>{pointer.dispose();events.abort();unwatch?.();arm(false);if(host._firstBinding===record)delete host._firstBinding;};
    host._firstBinding=record;unwatch=watchLobby(host,record.cleanup);arm(false);return record.cleanup;
  }
  function bindDrag(host,{move,onError=()=>{},canMove=()=>true,current=()=>true}={}){
    if(!host)return;
    const roomId=host.dataset.roomId,actorId=host.dataset.roomActor,options={move,onError,canMove,current},old=host._lobbyBinding;
    if(old&&old.roomId===roomId&&old.actorId===actorId){old.options=options;return old.cleanup;}
    old?.cleanup();const record={roomId,actorId,options};let unwatch;
    const valid=()=>activeLobby(host,roomId,actorId)&&record.options.current();
    const pointer=root.PlayroomOrderUI.create({list:host,rows:()=>[...host.querySelectorAll('.room-v021-row[data-participant-id]')],key:row=>row?.dataset.participantId,handle:'[data-room-drag]',current:valid,delay:dragDelay,activationDistance:8,suppressHandleClick:false,previewClass:'room-drag-ghost',scroll:()=>rosterScroll(host),canStart:(_event,row)=>record.options.canMove(row.dataset.participantId),resolveDrop:({element})=>{const target=element?.closest('.room-v021-row[data-room-drop]');return target&&host.contains(target)?{target}:null;},move:({key,target})=>{
      const destination=target.dataset.roomDrop;
      Promise.resolve().then(()=>{if(valid()&&record.options.canMove(key))return record.options.move(key,destination);}).catch(error=>{if(valid())record.options.onError(error);});
    }});
    record.cleanup=()=>{pointer.dispose();unwatch?.();if(host._lobbyBinding===record)delete host._lobbyBinding;};host._lobbyBinding=record;unwatch=watchLobby(host,record.cleanup);return record.cleanup;
  }
  root.PlayroomLobbyView={notifyRulesChange,render,roomContextMarkup,nicknameMarkup,rulesMarkup,gameRulesMarkup,fieldHelp,ruleText,parameterArt,parameterSymbolArt,helpMarkup,bindDrag,bindFirst};
})(globalThis);
