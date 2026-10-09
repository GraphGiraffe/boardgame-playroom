(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomMultiplayer=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const PROFILE_KEY='playroom.player-profile.v1',RESUME_KEY='playroom.network-resume.v1';
  function secureResumeToken(){
    const cryptoProvider=globalThis.crypto?.getRandomValues?globalThis.crypto:
      (typeof require==='function'?require('node:crypto').webcrypto:null);
    if(!cryptoProvider?.getRandomValues)throw Error('Браузер не предоставляет криптографически защищённый токен переподключения.');
    const bytes=new Uint8Array(32);cryptoProvider.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }
  function resumeTokenValid(token){return typeof token==='string'&&/^[0-9a-f]{64}$/.test(token);}

  const ROOM_CODE=/^\d{4}$/;
  const NAME_MAX=24, ROOM_NAME_MAX=48;
  const COLORS=[
    ['#587d5d','Зелёный'],['#cf7358','Коралловый'],['#5f85a4','Синий'],['#b89a46','Золотой'],
    ['#806ca5','Фиолетовый'],['#438f8a','Бирюзовый'],['#b56c8d','Розовый'],['#7f8d53','Оливковый'],
    ['#a76a45','Терракотовый'],['#6371a0','Индиго'],['#8a6a58','Какао'],['#6d8f77','Шалфей']
  ];
  let sequence=0;
  const now=()=>Date.now();
  const uuid=()=>globalThis.crypto?.randomUUID?.()||'id-'+now().toString(36)+'-'+(++sequence).toString(36);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const text=(value,max,label)=>{
    const result=String(value??'').trim().replace(/\s+/g,' ');
    if(!result)throw Error(label+' не может быть пустым.');
    if(result.length>max)throw Error(label+' слишком длинное.');
    return result;
  };
  const normalizeName=value=>text(value,NAME_MAX,'Имя игрока');
  const normalizeRoomName=value=>text(value,ROOM_NAME_MAX,'Название комнаты');
  // Labels travel with the room; raw IDs remain in rules.options for the engine.
  function describeRules(rules={},settings=[],hasHands=false){
    const rows=[{label:'Набор правил',value:String(rules.presetLabel||rules.preset||'Основной набор')}];
    const fields=Array.isArray(settings)?settings:[];
    for(const [key,value] of Object.entries(rules.options||{})){
      const field=fields.find(item=>item?.key===key);
      const option=field?.options?.find(item=>String(item.value)===String(value));
      rows.push({label:String(field?.label||key),value:String(option?.label??value)});
    }
    if(hasHands)rows.push({label:'Открытые руки',value:rules.openHands?'Да':'Нет'});
    return rows;
  }

  class ProfileStore{
    constructor(storageProvider=()=>globalThis.localStorage){this.storageProvider=storageProvider;}
    _storage(){const storage=this.storageProvider?.();if(!storage)throw Error('Хранилище профиля недоступно.');return storage;}
    load(){
      try{
        const raw=this._storage().getItem(PROFILE_KEY);if(!raw)return null;
        const value=JSON.parse(raw);
        if(value?.version!==1||typeof value.id!=='string'||!value.id||typeof value.name!=='string'||!value.name.trim())return null;
        return Object.freeze({version:1,id:value.id,name:normalizeName(value.name),createdAt:Number(value.createdAt)||0,updatedAt:Number(value.updatedAt)||0});
      }catch(_){return null;}
    }
    save(name){
      const previous=this.load(),timestamp=now();
      const profile={version:1,id:previous?.id||uuid(),name:normalizeName(name),createdAt:previous?.createdAt||timestamp,updatedAt:timestamp};
      this._storage().setItem(PROFILE_KEY,JSON.stringify(profile));
      return Object.freeze({...profile});
    }
  }

  class ResumeStore{
    constructor(storageProvider=()=>globalThis.localStorage){this.storageProvider=storageProvider;this.memory=new Map();}
    _key(roomId){if(typeof roomId!=='string'||!roomId||roomId.length>128)throw Error('Некорректная комната.');return RESUME_KEY+'.'+roomId;}
    load(roomId){
      const key=this._key(roomId);
      let value=this.memory.get(key);
      if(!value)try{const raw=this.storageProvider?.()?.getItem(key);if(raw)value=JSON.parse(raw);}catch(_){/* Private or content:// storage can be blocked. */}
      return value?.version===1&&typeof value.participantId==='string'&&value.participantId&&resumeTokenValid(value.token)?
        {...value}:null;
    }
    save(roomId,participantId,token){
      if(typeof participantId!=='string'||!participantId||!resumeTokenValid(token))throw Error('Некорректное право переподключения.');
      const key=this._key(roomId),value={version:1,roomId,participantId,token};
      this.memory.set(key,value);
      try{this.storageProvider?.()?.setItem(key,JSON.stringify(value));return true;}catch(_){return false;}
    }
    remove(roomId){
      const key=this._key(roomId);this.memory.delete(key);
      try{this.storageProvider?.()?.removeItem(key);}catch(_){}
    }
  }
  class RoomService{
    constructor({idFactory=uuid,clock=now,random=Math.random,tokenFactory=secureResumeToken}={}){
      this.idFactory=idFactory;this.clock=clock;this.random=random;this.tokenFactory=tokenFactory;
      this.rooms=new Map();this.listeners=new Map();this.resumeTokens=new Map();this.connectionLeases=new Map();
      this.durableResumes=new Map();this.pendingResumes=new Set();this.resumeFallbacks=new Map();
    }
    _key(roomId,id){return roomId+':'+id;}
    _room(roomId){const room=this.rooms.get(roomId);if(!room)throw Error('Комната не найдена.');return room;}
    _participant(room,participantId){const participant=room.participants.find(item=>item.id===participantId);if(!participant)throw Error('Участник не найден.');return participant;}
    _host(room,participantId){if(room.ownerId!==participantId)throw Error('Это действие доступно только хосту.');}
    _lobby(room){if(room.phase!=='lobby')throw Error('Состав комнаты уже нельзя менять.');}
    _editable(participant){if(participant.ready)throw Error('Сначала снимите готовность.');}
    _touch(room){room.revision++;room.updatedAt=this.clock();}
    _emit(room,type,textValue,extra={}){
      room.eventSequence++;
      room.events.push({id:room.eventSequence,type,text:textValue,at:this.clock(),...extra});
      if(room.events.length>100)room.events.splice(0,room.events.length-100);
      for(const listener of this.listeners.get(room.id)||[]){
        try{listener(this.snapshot(room.id));}catch(_){/* UI listener cannot invalidate committed room changes. */}
      }
    }
    _code(){
      for(let attempt=0;attempt<100;attempt++){
        const code=String(Math.floor(this.random()*10000)).padStart(4,'0');
        if(![...this.rooms.values()].some(room=>room.phase!=='closed'&&room.code===code))return code;
      }
      throw Error('Не удалось подобрать короткий номер комнаты.');
    }
    _constraints(input){
      const min=Number(input?.min),max=Number(input?.max);
      if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>32)throw Error('Некорректные ограничения числа игроков.');
      const allowed=Array.isArray(input.allowed)?[...new Set(input.allowed.map(Number))].filter(n=>Number.isInteger(n)&&n>=min&&n<=max):null;
      if(allowed&&!allowed.length)throw Error('Нет допустимого состава игроков.');
      return {min,max,allowed:allowed?.sort((a,b)=>a-b)||null};
    }
    _color(index){
      const known=COLORS[index];
      if(known)return {value:known[0],label:known[1]};
      return {value:`hsl(${Math.round((index*137.508)%360)} 46% 50%)`,label:'Цвет '+(index+1)};
    }
    create({name,game,host,hostMode='player',rules={},constraints}={}){
      if(!game?.id||!game?.name)throw Error('Выберите игру.');
      if(!host?.id)throw Error('Нужен профиль хоста.');
      if(!['player','table'].includes(hostMode))throw Error('Некорректный режим хоста.');
      const playerConstraints=this._constraints(constraints);
      const timestamp=this.clock(),id=this.idFactory();
      const room={
        id,code:this._code(),name:normalizeRoomName(name),phase:'lobby',revision:1,lobbyRevision:1,rulesRevision:1,
        ownerId:host.id,hostMode,game:clone(game),rules:clone(rules),constraints:playerConstraints,
        participants:[{id:host.id,nickname:normalizeName(host.nickname||host.name),role:hostMode==='player'?'player':'table',seatId:null,ready:false,connected:true,isHost:true,joinedAt:timestamp}],
        seats:Array.from({length:playerConstraints.max},(_,i)=>({id:'seat-'+(i+1),index:i,color:this._color(i),participantId:null})),
        createdAt:timestamp,updatedAt:timestamp,eventSequence:0,events:[],countdownEndsAt:null
      };
      if(hostMode==='player'){room.seats[0].participantId=host.id;room.participants[0].seatId=room.seats[0].id;}
      this._emit(room,'room-created','Комната создана.');
      this.rooms.set(id,room);return this.snapshot(id);
    }
    preview(roomId){const room=this._room(roomId);return {id:room.id,code:room.code,name:room.name,game:clone(room.game),rules:clone(room.rules),rulesRevision:room.rulesRevision,hostMode:room.hostMode,phase:room.phase,players:room.participants.filter(p=>p.role==='player').length,constraints:clone(room.constraints)};}
    join(roomId,{id=this.idFactory(),nickname}={}){
      const room=this._room(roomId);this._lobby(room);
      if(room.participants.some(item=>item.id===id))throw Error('Этот идентификатор участника уже занят.');
      // Credentials belong to the host's private map, never to room snapshots.
      const token=this.tokenFactory();
      if(!resumeTokenValid(token))throw Error('Не удалось создать защищённый ключ повторного подключения.');
      room.participants.push({id,nickname:normalizeName(nickname),role:'spectator',seatId:null,ready:false,connected:true,isHost:false,joinedAt:this.clock()});
      this.resumeTokens.set(this._key(roomId,id),token);
      room.lobbyRevision++;this._touch(room);this._emit(room,'participant-joined',nickname+' вошёл в комнату.',{participantId:id});
      return {participantId:id,room:this.snapshot(roomId),resumeToken:token};
    }
    rename(roomId,participantId,nickname){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);this._editable(participant);
      participant.nickname=normalizeName(nickname);room.lobbyRevision++;this._touch(room);this._emit(room,'participant-renamed',participant.nickname+' изменил имя.',{participantId});
      return this.snapshot(roomId);
    }
    claimSeat(roomId,participantId,seatId){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);this._editable(participant);
      if(participant.role==='table')throw Error('Устройство Стола не занимает игровое место.');
      const seat=room.seats.find(item=>item.id===seatId);if(!seat)throw Error('Место не найдено.');
      if(seat.participantId&&seat.participantId!==participantId)throw Error('Это место уже занято.');
      for(const item of room.seats)if(item.participantId===participantId)item.participantId=null;
      seat.participantId=participantId;participant.seatId=seat.id;participant.role='player';participant.ready=false;
      room.lobbyRevision++;this._touch(room);this._emit(room,'seat-changed',participant.nickname+' занял '+seat.color.label.toLowerCase()+' слот.',{participantId,seatId});
      return this.snapshot(roomId);
    }
    becomeSpectator(roomId,participantId){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);this._editable(participant);
      if(participant.role==='table')return this.snapshot(roomId);
      for(const seat of room.seats)if(seat.participantId===participantId)seat.participantId=null;
      participant.seatId=null;participant.role='spectator';participant.ready=false;
      room.lobbyRevision++;this._touch(room);this._emit(room,'became-spectator',participant.nickname+' теперь зритель.',{participantId});
      return this.snapshot(roomId);
    }
    setReady(roomId,participantId,ready){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);
      if(participant.role!=='player'||!participant.seatId)throw Error('Сначала выберите игровое место.');
      participant.ready=!!ready;room.lobbyRevision++;this._touch(room);
      this._emit(room,'ready-changed',participant.nickname+(participant.ready?' готов.':' больше не готов.'),{participantId,ready:participant.ready});
      return this.snapshot(roomId);
    }
    updateRules(roomId,participantId,rules){
      const room=this._room(roomId);this._lobby(room);this._host(room,participantId);
      room.rules=clone(rules||{});room.rulesRevision++;room.lobbyRevision++;
      for(const participant of room.participants)participant.ready=false;
      this._touch(room);this._emit(room,'rules-changed','Хост изменил правила. Проверьте их и подтвердите готовность заново.',{rulesRevision:room.rulesRevision});
      return this.snapshot(roomId);
    }
    kick(roomId,participantId,targetId){
      const room=this._room(roomId);this._lobby(room);this._host(room,participantId);
      if(targetId===room.ownerId)throw Error('Хост не может кикнуть себя.');
      const target=this._participant(room,targetId);
      for(const seat of room.seats)if(seat.participantId===targetId)seat.participantId=null;
      room.participants=room.participants.filter(item=>item.id!==targetId);
      this.resumeTokens.delete(this._key(roomId,targetId));this.connectionLeases.delete(this._key(roomId,targetId));
      room.lobbyRevision++;this._touch(room);this._emit(room,'participant-kicked',target.nickname+' исключён из комнаты.',{participantId:targetId});
      return this.snapshot(roomId);
    }
    setConnected(roomId,participantId,connected){
      const room=this._room(roomId),participant=this._participant(room,participantId);participant.connected=!!connected;this._touch(room);
      this._emit(room,'connection-changed',participant.nickname+(participant.connected?' снова в сети.':' потерял соединение.'),{participantId,connected:participant.connected});
      return this.snapshot(roomId);
    }
    _resumeCandidate(roomId,{participantId,token}={}){
      const room=this._room(roomId);
      if(room.phase==='closed'||typeof participantId!=='string'||!resumeTokenValid(token))throw Error('Неверное право переподключения.');
      const member=this._participant(room,participantId);
      if(member.isHost)throw Error('Права хоста нельзя восстановить через гостевое подключение.');
      if(room.phase==='playing'&&!member.seatId)throw Error('У игрока нет места в начатой партии.');
      const key=this._key(roomId,participantId),expected=this.resumeTokens.get(key);
      const fallback=this.resumeFallbacks.get(key);
      // If the host committed a rotation but its reply was lost, the previous
      // secret may recover the same participant (never an active controller).
      if(expected && expected!==token && fallback?.token===token && fallback.expiresAt>this.clock()&&!member.connected&&
          !this.connectionLeases.has(key))
        return {roomId,participantId,key,expected,updated:expected,replayedRotation:true};
      if(!expected||expected!==token)throw Error('Право переподключения недействительно. Потребуется новый вход.');
      const updated=this.tokenFactory();
      if(!resumeTokenValid(updated)||updated===expected)throw Error('Не удалось обновить право переподключения.');
      return {roomId,participantId,key,expected,updated};
    }
    _finishResume(candidate){
      this.resumeTokens.set(candidate.key,candidate.updated);
      this.setConnected(candidate.roomId,candidate.participantId,true);
      return {participantId:candidate.participantId,room:this.snapshot(candidate.roomId),resumeToken:candidate.updated};
    }
    resume(roomId,credentials){return this._finishResume(this._resumeCandidate(roomId,credentials));}
    async resumeDurably(roomId,credentials){
      const candidate=this._resumeCandidate(roomId,credentials);
      if(this.pendingResumes.has(candidate.key))throw Error('Возврат этого игрока уже обрабатывается.');
      const persist=this.durableResumes.get(roomId);
      if(!persist)throw Error('Для этой партии не настроено долговечное восстановление.');
      this.pendingResumes.add(candidate.key);
      try{
        if(candidate.replayedRotation)return this._finishResume(candidate);
        // The prior token is a narrow crash/ACK-loss recovery window, never
        // accepted while its participant still has a connected lease.
        const previousExpiresAt=this.clock()+120000;
        await persist({participantId:candidate.participantId,previousToken:candidate.expected,
          nextToken:candidate.updated,previousExpiresAt});
        this.resumeFallbacks.set(candidate.key,{token:candidate.expected,expiresAt:previousExpiresAt});
        return this._finishResume(candidate);
      }finally{this.pendingResumes.delete(candidate.key);}
    }
    setResumeDurability(roomId,callback){
      this._room(roomId);
      if(typeof callback!=='function')throw Error('Нужен обработчик сохранения права переподключения.');
      this.durableResumes.set(roomId,callback);
    }
    exportRecovery(roomId){
      const room=this._room(roomId);
      if(room.phase!=='playing')throw Error('Сохранять можно только начатую комнату.');
      const tokens=room.participants.filter(p=>!p.isHost).map(p=>{
        const key=this._key(roomId,p.id),fallback=this.resumeFallbacks.get(key);
        return {participantId:p.id,token:this.resumeTokens.get(key),
          ...(fallback?.expiresAt>this.clock()?{previousToken:fallback.token,previousExpiresAt:fallback.expiresAt}:{})};
      });
      if(tokens.some(p=>!resumeTokenValid(p.token)))throw Error('Участник без права переподключения.');
      return {version:1,room:clone(room),tokens};
    }
    restoreRecovery(value,{hostId}={}){
      if(value?.version!==1||!value.room||!Array.isArray(value.tokens))throw Error('Нет сохранённого состава комнаты.');
      const room=clone(value.room),tokens=value.tokens;
      if(typeof hostId!=='string'||room.ownerId!==hostId||typeof room.id!=='string'||!room.id||
          room.phase!=='playing'||!ROOM_CODE.test(room.code)||!['player','table'].includes(room.hostMode)||
          !Array.isArray(room.participants)||!Array.isArray(room.seats)||room.participants.length<1||
          this.rooms.has(room.id))throw Error('Сохранённая комната несовместима или занята.');
      this._constraints(room.constraints);
      const ids=new Set(),seatIds=new Set(),occupied=new Set();
      for(const p of room.participants){
        if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.nickname!=='string'||
            typeof p.isHost!=='boolean')throw Error('Повреждён список участников.');
        ids.add(p.id);
        if(p.isHost!==(p.id===hostId))throw Error('Несовместимый владелец комнаты.');
        p.connected=p.id===hostId; // Network connections never survive page reload.
      }
      for(const seat of room.seats){
        if(typeof seat.id!=='string'||seatIds.has(seat.id)||!Number.isInteger(seat.index))throw Error('Повреждён список мест.');
        seatIds.add(seat.id);
        if(seat.participantId!==null){if(!ids.has(seat.participantId)||occupied.has(seat.participantId))throw Error('Повреждена привязка игрового места.');occupied.add(seat.participantId);}
      }
      for(const p of room.participants){
        if(p.seatId!==null&&(!seatIds.has(p.seatId)||!room.seats.some(s=>s.id===p.seatId&&s.participantId===p.id)))
          throw Error('Повреждена привязка игрока.');
      }
      const found=new Set();
      for(const entry of tokens){
        if(!ids.has(entry?.participantId)||entry.participantId===hostId||found.has(entry.participantId)||
           !resumeTokenValid(entry.token))throw Error('Повреждены права переподключения.');
        found.add(entry.participantId);
      }
      if(room.participants.filter(p=>!p.isHost).some(p=>!found.has(p.id)))throw Error('Не хватает прав переподключения.');
      // Validate all credentials before installing any recovered room.
      for(const entry of tokens){
        if(entry.previousToken!==undefined){
          if(!resumeTokenValid(entry.previousToken)||!Number.isSafeInteger(entry.previousExpiresAt)||
              entry.previousExpiresAt<0||entry.previousToken===entry.token)throw Error('Повреждена история прав переподключения.');
        }
      }
      this.rooms.set(room.id,room);
      for(const entry of tokens){
        const key=this._key(room.id,entry.participantId);
        this.resumeTokens.set(key,entry.token);
        if(entry.previousToken && entry.previousExpiresAt>this.clock())
          this.resumeFallbacks.set(key,{token:entry.previousToken,expiresAt:entry.previousExpiresAt});
      }
      return this.snapshot(room.id);
    }
    discardRecovery(roomId){
      const room=this._room(roomId);
      if(room.participants.some(p=>!p.isHost&&p.connected)||
          [...this.connectionLeases.keys()].some(k=>k.startsWith(roomId+':')))
        throw Error('Нельзя свернуть восстановление: к комнате уже подключены игроки.');
      this.rooms.delete(roomId);this.listeners.delete(roomId);this.durableResumes.delete(roomId);
      for(const participant of room.participants){
        const key=this._key(roomId,participant.id);
        this.resumeTokens.delete(key);this.connectionLeases.delete(key);
        this.resumeFallbacks.delete(key);this.pendingResumes.delete(key);
      }
    }
    abortStart(roomId,hostId){
      const room=this._room(roomId);this._host(room,hostId);
      if(room.phase!=='playing')throw Error('Можно отменить только несостоявшийся старт.');
      room.phase='lobby';room.countdownEndsAt=null;room.lobbyRevision++;
      for(const participant of room.participants)participant.ready=false;
      this._touch(room);this._emit(room,'start-rejected','Начало партии отменено: сохранение недоступно.');
      return this.snapshot(roomId);
    }
    playerCount(roomId){return this._room(roomId).participants.filter(item=>item.role==='player'&&item.seatId).length;}
    _validCount(room){
      const count=room.participants.filter(item=>item.role==='player'&&item.seatId).length;
      return room.constraints.allowed?room.constraints.allowed.includes(count):count>=room.constraints.min&&count<=room.constraints.max;
    }
    canStart(roomId){
      const room=this._room(roomId);if(room.phase!=='lobby'||!this._validCount(room))return false;
      const players=room.participants.filter(item=>item.role==='player'&&item.seatId);
      return players.length>0&&players.every(item=>item.ready&&item.connected);
    }
    beginCountdown(roomId,participantId,{seconds=3}={}){
      const room=this._room(roomId);this._lobby(room);this._host(room,participantId);
      if(!this.canStart(roomId))throw Error('Для старта все игроки должны занять места, быть в сети и подтвердить готовность.');
      if(!Number.isInteger(seconds)||seconds<1||seconds>10)throw Error('Некорректный обратный отсчёт.');
      room.phase='starting';room.countdownEndsAt=this.clock()+seconds*1000;this._touch(room);
      this._emit(room,'countdown-started','Игра начинается через '+seconds+' сек.',{seconds});
      return this.snapshot(roomId);
    }
    tick(roomId){
      const room=this._room(roomId);
      if(room.phase!=='starting')return {room:this.snapshot(roomId),remaining:null,started:room.phase==='playing'};
      const remaining=Math.max(0,Math.ceil((room.countdownEndsAt-this.clock())/1000));
      if(remaining===0){
        room.phase='playing';room.countdownEndsAt=null;this._touch(room);this._emit(room,'game-started','Игра началась.');
        return {room:this.snapshot(roomId),remaining:0,started:true};
      }
      return {room:this.snapshot(roomId),remaining,started:false};
    }
    subscribe(roomId,listener){
      this._room(roomId);if(typeof listener!=='function')throw Error('Нужен обработчик комнаты.');
      if(!this.listeners.has(roomId))this.listeners.set(roomId,new Set());
      this.listeners.get(roomId).add(listener);
      return ()=>{const set=this.listeners.get(roomId);set?.delete(listener);if(set&&!set.size)this.listeners.delete(roomId);};
    }
    connection(roomId){
      this._room(roomId);let participantId=null,lease={};const service=this;
      const packet=()=>participantId?{kind:'lobby',room:this.snapshot(roomId),participantId}:{kind:'room-preview',room:this.preview(roomId)};
      const active=()=>!participantId||service.connectionLeases.get(service._key(roomId,participantId))===lease;
      return {
        get participantId(){return participantId;},
        snapshot:()=>{if(!active())throw Error('Это подключение заменено новым.');return packet();},
        dispatch:command=>{
          if(!command||typeof command.type!=='string')throw Error('Некорректная команда комнаты.');
          if(!active())throw Error('Это подключение заменено новым.');
          if(command.type==='join'){
            if(participantId)throw Error('Участник уже вошёл.');
            // Profile IDs are NOT credentials. Always allocate a fresh identity.
            const joined=this.join(roomId,{id:this.idFactory(),nickname:command.nickname});
            participantId=joined.participantId;
            service.connectionLeases.set(service._key(roomId,participantId),lease);
            return {ok:true,snapshot:packet(),resumeToken:joined.resumeToken};
          }
          if(command.type==='resume'){
            if(participantId)throw Error('Участник уже вошёл.');
            const apply=resumed=>{
              participantId=resumed.participantId;lease={};
              service.connectionLeases.set(service._key(roomId,participantId),lease);
              return {ok:true,snapshot:packet(),resumeToken:resumed.resumeToken,resumed:true};
            };
            const rotated=service.durableResumes.has(roomId)?
              service.resumeDurably(roomId,{participantId:command.participantId,token:command.resumeToken}):
              service.resume(roomId,{participantId:command.participantId,token:command.resumeToken});
            return rotated instanceof Promise?rotated.then(apply):apply(rotated);
          }
          if(!participantId)throw Error('Сначала войдите в комнату.');
          let state;
          if(command.type==='rename')state=this.rename(roomId,participantId,command.nickname);
          else if(command.type==='claim-seat')state=this.claimSeat(roomId,participantId,command.seatId);
          else if(command.type==='spectator')state=this.becomeSpectator(roomId,participantId);
          else if(command.type==='ready')state=this.setReady(roomId,participantId,command.ready);
          else throw Error('Эта команда комнаты недоступна.');
          return {ok:true,snapshot:{kind:'lobby',room:state,participantId}};
        },
        history(){throw Error('История комнаты недоступна.');},
        subscribe:listener=>this.subscribe(roomId,()=>{if(active())listener(packet());}),
        close:()=>{if(participantId&&active()){service.connectionLeases.delete(service._key(roomId,participantId));try{service.setConnected(roomId,participantId,false);}catch(_){}}}
      };
    }
    snapshot(roomId){return clone(this._room(roomId));}
  }

  class SwitchableConnection{
    constructor(connection=null){this.current=null;this.listeners=new Set();this.unsubscribe=null;if(connection)this.set(connection);}
    set(connection){
      this.unsubscribe?.();this.current=connection;
      this.unsubscribe=connection?.subscribe?.(snapshot=>{for(const listener of this.listeners)listener(snapshot);})||null;
      if(connection)for(const listener of this.listeners)listener(connection.snapshot());
      return this;
    }
    snapshot(){if(!this.current)throw Error('Соединение ещё не готово.');return this.current.snapshot();}
    dispatch(value){if(!this.current)throw Error('Соединение ещё не готово.');return this.current.dispatch(value);}
    history(value){if(!this.current)throw Error('Соединение ещё не готово.');return this.current.history(value);}
    subscribe(listener){this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
    close(){this.unsubscribe?.();this.current?.close?.();this.listeners.clear();this.current=null;}
  }
  return {PROFILE_KEY,RESUME_KEY,ROOM_CODE,COLORS:clone(COLORS),normalizeName,normalizeRoomName,describeRules,ProfileStore,ResumeStore,RoomService,SwitchableConnection};
});
