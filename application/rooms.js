if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRooms=api;})(globalThis,function(){
'use strict';
const normalizeAvatar=value=>typeof value==='string'&&/^(crescent|triangle|square|circle|star|rectangle|diamond|hexagon)-(red|orange|yellow|green|blue|purple)$/.test(value)?value:null;
const resumeTokenValid=token=>typeof token==='string'&&/^[0-9a-f]{64}$/.test(token);
const ROOM_CODE=/^\d{4}$/,NAME_MAX=24,ROOM_NAME_MAX=48;
const clone=value=>JSON.parse(JSON.stringify(value));
// Application-owned public wording for standard room/game policies. Packs only
// declare supported values/defaults; they do not supply alternate descriptions.
const STANDARD_RULE_VALUES=Object.freeze({firstPlayerMode:['rules','random','assigned'],seatOrder:['normal','random'],endMode:['winner','round','last']});
function standardRule(field){
 if(!field||!Object.hasOwn(STANDARD_RULE_VALUES,field.key))return field;
 const prefix='rules-help.standard.'+field.key,text=suffix=>globalThis.PlayroomMessages.text(prefix+'.'+suffix);
 const values=field.options||STANDARD_RULE_VALUES[field.key].map(value=>({value}));
 return {...field,label:text('label'),help:text('help'),options:values.map(option=>({...option,label:text(option.value+'.label'),shortLabel:text(option.value+'.short'),description:text(option.value+'.description')}))};
}

const readyConfiguration=(room,id,{ignoreReset=false}={})=>{const me=room.participants.find(p=>p.id===id),reset=[...(room.events||[])].reverse().find(e=>e.requiresReady!==false&&['new-match-lobby','game-started','replacement-lobby','participant-kicked','roster-changed'].includes(e.type));return JSON.stringify([room.id,room.game,room.rulesRevision,room.botSettingsRevision,room.rules,room.firstPlayerMode,room.firstParticipantId,room.seatOrder,ignoreReset?null:reset?.id,me?.seatId,me?.replacement]);};
  const text=(value,max,label)=>{
    const result=String(value??'').trim().replace(/\s+/g,' ');
    if(!result)throw Error(globalThis.PlayroomMessages.text("ui.rooms.9a573d887812",{p0:String(label)}));
    if(result.length>max)throw Error(globalThis.PlayroomMessages.text("ui.rooms.aa148ead2618",{p0:String(label)}));
    return result;
  };
  const normalizeName=value=>text(value,NAME_MAX,globalThis.PlayroomMessages.text("ui.rooms.f189892b63a9"));
  const normalizeRoomName=value=>text(value,ROOM_NAME_MAX,globalThis.PlayroomMessages.text("ui.rooms.555c0b3a7b3b"));
  const validateOrder=changes=>{
    if(changes.seatOrder!==undefined&&!STANDARD_RULE_VALUES.seatOrder.includes(changes.seatOrder))throw Error(globalThis.PlayroomMessages.text("ui.rooms.9557c33a923f"));
    if(changes.firstPlayerMode!==undefined&&!STANDARD_RULE_VALUES.firstPlayerMode.includes(changes.firstPlayerMode))throw Error(globalThis.PlayroomMessages.text("ui.rooms.564ac64ca8d0"));
  };
  // Validate declared configuration choices independently of the current roster.
  // A valid future team preset may still be unavailable for starting this room.
  function validateRuleSettings(rules,{presets=[],presetSetting={},settings=[],capabilities={}}={}){
    const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
    const invalid=(field,fieldLabel)=>{throw Object.assign(Error('ROOM_RULES_INVALID'),{code:'ROOM_RULES_INVALID',field,fieldLabel});};
    if(!record(rules))invalid('rules');
    if(rules.preset!==undefined&&!presets.some(preset=>preset.id===rules.preset))invalid('preset',presetSetting.label);
    if(rules.openHands!==undefined&&(typeof rules.openHands!=='boolean'||rules.openHands&&!capabilities.hands))invalid('openHands');
    if(rules.options!==undefined){
      if(!record(rules.options))invalid('options');
      for(const [key,value] of Object.entries(rules.options)){
        const field=settings.find(field=>field.key===key);
        if(!field||!['string','number','boolean'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value)||!field.options?.some(option=>String(option.value)===String(value)))invalid(key,field?.label);
      }
    }
    return null;
  }

class RoomService{
    constructor({idFactory,clock,random,tokenFactory,validateStart=()=>null,validateRules=()=>null}={}){
      if([idFactory,clock,random,tokenFactory].some(port=>typeof port!=="function"))throw Error("ROOM_PORT_REQUIRED");
      if(typeof validateStart!=='function')throw Error('ROOM_START_VALIDATOR_REQUIRED');
      if(typeof validateRules!=='function')throw Error('ROOM_RULES_VALIDATOR_REQUIRED');
      this.idFactory=idFactory;this.clock=clock;this.random=random;this.tokenFactory=tokenFactory;this.validateStart=validateStart;this.validateRules=validateRules;
      this.rooms=new Map();this.listeners=new Map();this.resumeTokens=new Map();this.connectionLeases=new Map();
      this.durableResumes=new Map();this.pendingResumes=new Set();this.resumeFallbacks=new Map();
    }
    _key(roomId,id){return roomId+':'+id;}
    _room(roomId){const room=this.rooms.get(roomId);if(!room)throw Error(globalThis.PlayroomMessages.text("ui.rooms.3be22888bc7f"));return room;}
    _participant(room,participantId){const participant=room.participants.find(item=>item.id===participantId);if(!participant)throw Error(globalThis.PlayroomMessages.text("ui.rooms.72cce5e9c52e"));return participant;}
    _host(room,participantId){if(room.hostTransferPending)throw Error('HOST_TRANSFER_BUSY');if(room.ownerId!==participantId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.0653330f822b"));}
    _lobby(room){if(room.hostTransferPending)throw Error('HOST_TRANSFER_BUSY');if(room.phase!=='lobby')throw Error(globalThis.PlayroomMessages.text("ui.rooms.9f388d3161a5"));}
    _newMatch(room){if(room.recovery)throw Error(globalThis.PlayroomMessages.text("ui.rooms.cf5cddc45dcb"));}
    _editable(participant){if(participant.ready)throw Error(globalThis.PlayroomMessages.text("ui.rooms.9cd66d5ad9c8"));}
    _touch(room){room.revision++;room.updatedAt=this.clock();}
    _emit(room,type,textValue,extra={}){
      room.eventSequence++;
      room.events.push({id:room.eventSequence,type,text:textValue,at:this.clock(),...extra});
      if(room.events.length>100)room.events.splice(0,room.events.length-100);
      for(const listener of this.listeners.get(room.id)||[]){
        try{listener(this.snapshot(room.id));}catch(_){/* UI listener cannot invalidate committed room changes. */}
      }
    }
    _constraints(input){
      const min=Number(input?.min),max=Number(input?.max);
      if(!Number.isInteger(min)||!Number.isInteger(max)||min<1||max<min||max>32)throw Error(globalThis.PlayroomMessages.text("ui.rooms.1d5c1580dc5f"));
      const allowed=Array.isArray(input.allowed)?[...new Set(input.allowed.map(Number))].filter(n=>Number.isInteger(n)&&n>=min&&n<=max):null;
      if(allowed&&!allowed.length)throw Error(globalThis.PlayroomMessages.text("ui.rooms.b53b19298863"));
      return {min,max,allowed:allowed?.sort((a,b)=>a-b)||null};
    }
    create({name,game,host,hostMode='player',transportMode='network',rules={},constraints}={}){
      if(!game?.id||!game?.name)throw Error(globalThis.PlayroomMessages.text("ui.rooms.52b5bfed853b"));
      if(!host?.id)throw Error(globalThis.PlayroomMessages.text("ui.rooms.02b3c4ab2dfa"));
      if(!['player','table'].includes(hostMode))throw Error(globalThis.PlayroomMessages.text("ui.rooms.2ea68ba1e6ed"));
      const playerConstraints=this._constraints(constraints);
      if(!['hotseat','network','online'].includes(transportMode))throw Error(globalThis.PlayroomMessages.text('ui.rooms.a0f99d0264a3'));
      if(transportMode!=='hotseat'&&playerConstraints.max===1)throw Error(globalThis.PlayroomMessages.text('ui.rooms.solo-network-unavailable'));
      const timestamp=this.clock(),id=this.idFactory();
      const room={
        id,code:null,name:normalizeRoomName(name),phase:'lobby',revision:1,lobbyRevision:1,rulesRevision:1,
        ownerId:host.id,hostMode,transportMode,firstPlayerMode:rules.firstPlayerMode||'rules',seatOrder:rules.seatOrder||'normal',firstParticipantId:null,game:clone(game),rules:clone(rules),constraints:playerConstraints,
        participants:[{id:host.id,nickname:normalizeName(host.nickname||host.name),...(normalizeAvatar(host.avatar)?{avatar:normalizeAvatar(host.avatar)}:{}),role:hostMode==='player'?'player':'table',seatId:null,ready:false,connected:true,isHost:true,joinedAt:timestamp}],
        seats:Array.from({length:playerConstraints.max},(_,i)=>({id:'seat-'+(i+1),index:i,sideId:i,participantId:null})),
        createdAt:timestamp,updatedAt:timestamp,eventSequence:0,events:[],countdownEndsAt:null,autoStart:true
      };
      if(hostMode==='player'){room.seats[0].participantId=host.id;room.participants[0].seatId=room.seats[0].id;}
      this._emit(room,'room-created',globalThis.PlayroomMessages.text("ui.rooms.a3264feefcc9"));
      this.rooms.set(id,room);return this.snapshot(id);
    }
    prepareStart(roomId,hostId){
      const room=this._room(roomId);this._host(room,hostId);
      const blocker=this._startBlocker(room);if(blocker)throw Error(blocker);
      if(room.recovery||room.startOrderResolved)return this.snapshot(roomId);
      const seats=room.seats.filter(s=>s.participantId),ids=seats.map(s=>s.participantId);
      if(room.seatOrder==='random')for(let i=ids.length-1;i>0;i--){const j=Math.floor(this.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
      seats.forEach((seat,i)=>{seat.participantId=ids[i];this._participant(room,ids[i]).seatId=seat.id;});
      room.startOrderResolved=true;for(const p of room.participants)delete p.rulesNotice;
      this._touch(room);return this.snapshot(roomId);
    }
    startHotSeat(roomId,hostId){const room=this._room(roomId);this._host(room,hostId);this._lobby(room);if(room.transportMode!=='hotseat'||!this.canStart(roomId))throw Error(globalThis.PlayroomMessages.text("ui.rooms.763ec9637437"));this.prepareStart(roomId,hostId);room.phase='playing';this._touch(room);return this.snapshot(roomId);}
    setOnlineCode(roomId,hostId,code){
      const room=this._room(roomId);this._host(room,hostId);
      if(room.transportMode!=='online'||!ROOM_CODE.test(code))throw Error('INVALID_ONLINE_ROOM_CODE');
      if(room.code===code&&room.onlineCodeAssigned)return this.snapshot(roomId);
      room.code=code;room.onlineCodeAssigned=true;this._touch(room);return this.snapshot(roomId);
    }
    setInvitationPermission(roomId,hostId,allowed){
      const room=this._room(roomId);this._host(room,hostId);
      if(typeof allowed!=='boolean')throw Error('INVALID_INVITATION_PERMISSION');
      if(!!room.allowPlayerInvites===allowed)return this.snapshot(roomId);
      room.allowPlayerInvites=allowed;this._touch(room);this._emit(room,'invitation-permission','',{allowPlayerInvites:allowed});return this.snapshot(roomId);
    }
    configure(roomId,hostId,changes={}){
      const room=this._room(roomId);this._lobby(room);this._host(room,hostId);
      validateOrder(changes);
      if(Object.keys(changes).some(key=>key!=='name'))this._newMatch(room);
      if(changes.transportMode&&changes.transportMode!=='hotseat'&&room.constraints.max===1)throw Error(globalThis.PlayroomMessages.text('ui.rooms.solo-network-unavailable'));
      if(changes.name!==undefined)room.name=normalizeRoomName(changes.name);
      if(changes.transportMode!==undefined){if(!['hotseat','network','online'].includes(changes.transportMode))throw Error(globalThis.PlayroomMessages.text("ui.rooms.a0f99d0264a3"));if(changes.transportMode==='hotseat'){
        const host=this._participant(room,hostId);
        if(!host.seatId){const seat=room.seats.find(s=>!s.participantId)||room.seats.find(s=>room.participants.find(p=>p.id===s.participantId)?.bot);if(!seat)throw Error(globalThis.PlayroomMessages.text("ui.rooms.e883504f077f"));if(seat.participantId)room.participants=room.participants.filter(p=>p.id!==seat.participantId);seat.closed=false;seat.participantId=host.id;host.seatId=seat.id;host.role='player';room.hostMode='player';}
      }room.transportMode=changes.transportMode;}
      if(changes.seatOrder!==undefined)room.seatOrder=changes.seatOrder;
      if(changes.firstPlayerMode!==undefined)room.firstPlayerMode=changes.firstPlayerMode;
      if(changes.firstParticipantId!==undefined){if(changes.firstParticipantId!==null&&!room.participants.some(p=>p.id===changes.firstParticipantId&&p.seatId))throw Error(globalThis.PlayroomMessages.text("ui.rooms.0e9ba5d87a7e"));room.firstParticipantId=changes.firstParticipantId;}
      if(changes.hostMode!==undefined){if(!['player','table'].includes(changes.hostMode))throw Error(globalThis.PlayroomMessages.text("ui.rooms.6bb0788de66d"));room.hostMode=changes.hostMode;const host=this._participant(room,hostId);if(changes.hostMode==='table'){for(const seat of room.seats)if(seat.participantId===hostId)seat.participantId=null;host.seatId=null;host.role='table';}else host.role='spectator';}
      this._resetRoomReady(room);return this.snapshot(roomId);
    }
    _resetRoomReady(room){delete room.startOrderResolved;for(const p of room.participants)p.ready=!!p.bot;room.lobbyRevision++;this._touch(room);}
    setLocalSeat(roomId,hostId,seatId,{kind='bot',nickname=globalThis.PlayroomMessages.text("ui.rooms.aa691043b447")}={}){
      const room=this._room(roomId);this._lobby(room);this._host(room,hostId);
      if(room.recovery&&(!['bot','empty'].includes(kind)||!room.seats.some(s=>s.id===seatId&&Number.isInteger(s.playerIndex))))throw Error('RECOVERY_SLOT_FIXED');
      const seat=room.seats.find(s=>s.id===seatId);if(!seat||!['bot','human','empty','closed'].includes(kind))throw Error(globalThis.PlayroomMessages.text("ui.rooms.365699432c56"));
      const old=room.participants.find(p=>p.id===seat.participantId);
      if(old?.isHost){if(kind!=='human')throw Error(globalThis.PlayroomMessages.text("ui.rooms.654b70a3012d"));old.nickname=normalizeName(nickname);this._resetRoomReady(room);return this.snapshot(roomId);}
      if(old&&!old.local&&!old.bot)throw Error(globalThis.PlayroomMessages.text("ui.rooms.c559cfda2266"));
      seat.closed=kind==='closed';
      if(kind==='empty'||kind==='closed'){if(old&&room.recovery)seat.previousParticipant={id:old.id,nickname:old.nickname};if(old)room.participants=room.participants.filter(p=>p.id!==old.id);seat.participantId=null;}
      else{if(kind==='human'&&room.transportMode!=='hotseat')throw Error(globalThis.PlayroomMessages.text("ui.rooms.e16924187de9"));const person=old||{id:this.idFactory(),isHost:false,joinedAt:this.clock()};Object.assign(person,{nickname:normalizeName(nickname),local:true,bot:kind==='bot',connected:true,role:'player',seatId:seat.id,ready:kind==='bot'});if(!old)room.participants.push(person);seat.participantId=person.id;}
      this._resetRoomReady(room);if(room.recovery)this._emit(room,'roster-changed','Состав игроков изменён');return this.snapshot(roomId);
    }
    renameLocalSeat(roomId,hostId,seatId,nickname){
      const room=this._room(roomId);this._lobby(room);this._host(room,hostId);
      const seat=room.seats.find(item=>item.id===seatId),person=room.participants.find(item=>item.id===seat?.participantId);
      if(!person||(!person.bot&&!(room.transportMode==='hotseat'&&(person.local||person.isHost))))throw Error(globalThis.PlayroomMessages.text("ui.rooms.960514e5af5d"));
      person.nickname=normalizeName(nickname);room.lobbyRevision++;this._touch(room);
      this._emit(room,'participant-renamed',globalThis.PlayroomMessages.text("ui.rooms.bd0758ba8f1c",{p0:String(person.nickname)}),{participantId:person.id});return this.snapshot(roomId);
    }
    configureBot(roomId,hostId,seatId,{nickname,avatar,botSettings}){
      const room=this._room(roomId);this._host(room,hostId);this._lobby(room);
      const person=room.participants.find(p=>p.id===room.seats.find(s=>s.id===seatId)?.participantId),config=room.game.botSettings;
      if(!person?.bot)throw Error('BOT_SETTINGS_UNAVAILABLE');
      const strategy=botSettings?.strategy??'auto',difficulty=botSettings?.difficulty??'medium';
      if(strategy!=='auto'&&!(config?.strategies||[]).some(p=>p.id===strategy)||!['easy','medium','hard'].includes(difficulty))throw Error('BOT_SETTINGS_INVALID');
      const name=normalizeName(nickname),old=person.botSettings||{strategy:'auto',difficulty:'medium'},changed=(old.strategy||'auto')!==strategy||(old.difficulty||'medium')!==difficulty;
      person.nickname=name;person.botSettings={strategy,difficulty};if(avatar!==undefined)person.avatar=avatar;
      if(changed){room.botSettingsRevision=(room.botSettingsRevision||0)+1;for(const p of room.participants){if(!room.recovery)p.ready=!!p.bot;p.botSettingsNotice=!p.bot;}delete room.startOrderResolved;}
      room.lobbyRevision++;this._touch(room);this._emit(room,'bot-settings-changed',globalThis.PlayroomMessages.text('ui.bot-settings.changed'),{participantId:person.id,changed});return this.snapshot(roomId);
    }
    setBotsDifficulty(roomId,hostId,difficulty){
      const room=this._room(roomId);this._host(room,hostId);this._lobby(room);
      if(!['easy','medium','hard'].includes(difficulty))throw Error('BOT_SETTINGS_INVALID');
      const bots=room.participants.filter(p=>p.bot);let changed=false;
      for(const person of bots){changed||=(person.botSettings?.difficulty??'medium')!==difficulty;person.botSettings={strategy:person.botSettings?.strategy||'auto',difficulty};}
      if(changed){room.botSettingsRevision=(room.botSettingsRevision||0)+1;for(const p of room.participants){if(!room.recovery)p.ready=!!p.bot;p.botSettingsNotice=!p.bot;}delete room.startOrderResolved;}
      room.lobbyRevision++;this._touch(room);this._emit(room,'bot-settings-changed',globalThis.PlayroomMessages.text('ui.bot-settings.changed'),{changed});return this.snapshot(roomId);
    }
    restoreHotSeatLobby(value,{hostId,active=false}={}){
      const room=clone(value);
      if(!room||room.transportMode!=='hotseat'||room.ownerId!==hostId||!Array.isArray(room.seats)||!Array.isArray(room.participants)||!room.participants.some(p=>p.id===hostId&&p.isHost))throw Error(globalThis.PlayroomMessages.text("ui.rooms.6bf95306425a"));
      this._constraints(room.constraints);normalizeRoomName(room.name);
      const ids=new Set(room.participants.map(p=>p.id)),occupied=new Set();
      if(ids.size!==room.participants.length)throw Error(globalThis.PlayroomMessages.text("ui.rooms.1c987250f282"));
      for(const seat of room.seats)if(seat.participantId){
        const p=room.participants.find(person=>person.id===seat.participantId);
        if(!p||occupied.has(p.id)||p.seatId!==seat.id||p.role!=='player')throw Error(globalThis.PlayroomMessages.text("ui.rooms.47068e2d02a2"));occupied.add(p.id);
      }
      const old=this.rooms.get(room.id);if(old&&old.ownerId!==hostId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.1efa782da48b"));
      room.phase=active?'playing':'lobby';room.countdownEndsAt=null;delete room.recovery;if(!active)delete room.startOrderResolved;for(const p of room.participants)delete p.rulesNotice;
      for(const p of room.participants){p.ready=!!p.bot;p.connected=true;delete p.replacement;}
      this.rooms.set(room.id,room);this._touch(room);return this.snapshot(room.id);
    }
    moveParticipant(roomId,hostId,participantId,seatId){
      const room=this._room(roomId);this._lobby(room);this._host(room,hostId);
      this._newMatch(room);
      const p=this._participant(room,participantId),old=room.seats.find(s=>s.participantId===p.id),next=room.seats.find(s=>s.id===seatId);
      if(next?.closed)throw Error(globalThis.PlayroomMessages.text("ui.rooms.cd4ad4526588"));
      if(seatId!==null&&seatId!=='table'&&!next)throw Error(globalThis.PlayroomMessages.text("ui.rooms.638224315432"));
      if(!next&&room.transportMode==='hotseat')throw Error(globalThis.PlayroomMessages.text("ui.rooms.39bd07582efe"));
      if(!next&&p.bot)throw Error(globalThis.PlayroomMessages.text("ui.rooms.af7ea837c66e"));
      const oldRole=p.role,other=room.participants.find(person=>seatId==='table'?person.role==='table':person.id===next?.participantId);
      if(other?.bot&&!old)throw Error(globalThis.PlayroomMessages.text("ui.rooms.56cfe50a6cd8"));
      if(other?.id===p.id)return this.snapshot(roomId);
      if(old)old.participantId=other?.id||null;
      if(other){other.seatId=old?.id||null;other.role=old?'player':oldRole==='table'?'table':'spectator';}
      if(next)next.participantId=p.id;p.seatId=next?.id||null;p.role=next?'player':seatId==='table'?'table':'spectator';
      const host=room.participants.find(person=>person.isHost);room.hostMode=host.role==='player'?'player':'table';
      this._resetRoomReady(room);return this.snapshot(roomId);
    }
    claimTable(roomId,participantId){
      const room=this._room(roomId);this._lobby(room);const p=this._participant(room,participantId);this._editable(p);
      if(room.recovery&&p.seatId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.f72c784b9242"));
      if(room.transportMode==='hotseat')throw Error(globalThis.PlayroomMessages.text("ui.rooms.502d1393c975"));
      if(p.bot)throw Error(globalThis.PlayroomMessages.text("ui.rooms.d02b20c998da"));
      if(room.participants.some(person=>person.role==='table'&&person.id!==p.id))throw Error(globalThis.PlayroomMessages.text("ui.rooms.bfe6e8b7e3c5"));
      for(const seat of room.seats)if(seat.participantId===p.id)seat.participantId=null;
      p.seatId=null;p.role='table';p.ready=false;if(p.isHost)room.hostMode='table';
      this._resetRoomReady(room);this._emit(room,'table-changed',globalThis.PlayroomMessages.text("ui.rooms.14ead788f28b",{p0:String(p.nickname)}),{participantId});return this.snapshot(roomId);
    }
    preview(roomId){const room=this._room(roomId);return {id:room.id,code:room.code,name:room.name,game:clone(room.game),rules:clone(room.rules),rulesRevision:room.rulesRevision,hostMode:room.hostMode,phase:room.phase,players:room.participants.filter(p=>p.role==='player').length,constraints:clone(room.constraints)};}
    join(roomId,{id=this.idFactory(),nickname,avatar}={}){
      const room=this._room(roomId);this._lobby(room);
      if(room.participants.some(item=>item.id===id))throw Error(globalThis.PlayroomMessages.text("ui.rooms.9eeb6440db29"));
      // Credentials belong to the host's private map, never to room snapshots.
      const token=this.tokenFactory();
      if(!resumeTokenValid(token))throw Error(globalThis.PlayroomMessages.text("ui.rooms.860dab8cd7ac"));
      room.participants.push({id,nickname:normalizeName(nickname),...(normalizeAvatar(avatar)?{avatar:normalizeAvatar(avatar)}:{}),role:'spectator',seatId:null,ready:false,connected:true,isHost:false,joinedAt:this.clock()});
      this.resumeTokens.set(this._key(roomId,id),token);
      room.lobbyRevision++;this._touch(room);this._emit(room,'participant-joined',globalThis.PlayroomMessages.text("ui.rooms.39cf6ab7f8ef",{p0:String(nickname)}),{participantId:id});
      return {participantId:id,room:this.snapshot(roomId),resumeToken:token};
    }
    setAvatar(roomId,participantId,avatar){const room=this._room(roomId),person=this._participant(room,participantId);person.avatar=normalizeAvatar(avatar);this._touch(room);this._emit(room,'participant-avatar','',{participantId});return this.snapshot(roomId);}
    rename(roomId,participantId,nickname){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);this._editable(participant);
      participant.nickname=normalizeName(nickname);room.lobbyRevision++;this._touch(room);this._emit(room,'participant-renamed',globalThis.PlayroomMessages.text("ui.rooms.bd0758ba8f1c",{p0:String(participant.nickname)}),{participantId});
      return this.snapshot(roomId);
    }
    claimSeat(roomId,participantId,seatId){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);this._editable(participant);
      const seat=room.seats.find(item=>item.id===seatId);if(!seat)throw Error(globalThis.PlayroomMessages.text("ui.rooms.333cd2a343fd"));
      if(seat.closed)throw Error(globalThis.PlayroomMessages.text("ui.rooms.cd4ad4526588"));
      if(seat.participantId&&seat.participantId!==participantId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.0a6a927b6e4b"));
      if(room.recovery){
        if(participant.seatId&&participant.seatId!==seat.id)throw Error(globalThis.PlayroomMessages.text("ui.rooms.a4e5dc620512"));
        if(!Number.isInteger(seat.playerIndex))throw Error(globalThis.PlayroomMessages.text("ui.rooms.1aa1f693da71"));
        if(seat.participantId===participantId)return this.snapshot(roomId);
        if(seat.previousParticipant)participant.replacement={previousName:seat.previousParticipant.nickname,previousId:seat.previousParticipant.id,accepted:false,atRevision:room.recovery.revision};
      }
      for(const item of room.seats)if(item.participantId===participantId)item.participantId=null;
      seat.participantId=participantId;participant.seatId=seat.id;participant.role='player';participant.ready=false;if(participant.isHost)room.hostMode='player';
      room.lobbyRevision++;this._touch(room);this._emit(room,'seat-changed',globalThis.PlayroomMessages.text("ui.rooms.ddc8fea25277",{p0:String(participant.nickname),p1:String(seat.index+1)}),{participantId,seatId});
      return this.snapshot(roomId);
    }
    acceptReplacement(roomId,participantId){
      const room=this._room(roomId);this._lobby(room);const p=this._participant(room,participantId);
      if(!room.recovery||!p.seatId||!p.replacement)throw Error(globalThis.PlayroomMessages.text("ui.rooms.1e63f581ccbd"));
      if(p.replacement.accepted)return this.snapshot(roomId);
      p.replacement.accepted=true;room.lobbyRevision++;this._touch(room);
      this._emit(room,'replacement-accepted',globalThis.PlayroomMessages.text("ui.rooms.97080a2c1afd",{p0:String(p.nickname),p1:String(p.replacement.previousName)}),{participantId,seatId:p.seatId});return this.snapshot(roomId);
    }
    becomeSpectator(roomId,participantId){
      const room=this._room(roomId);this._lobby(room);const participant=this._participant(room,participantId);this._editable(participant);
      if(room.recovery&&participant.seatId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.f72c784b9242"));
      if(room.transportMode==='hotseat')throw Error(globalThis.PlayroomMessages.text("ui.rooms.791fa458527b"));
      for(const seat of room.seats)if(seat.participantId===participantId)seat.participantId=null;
      participant.seatId=null;participant.role='spectator';participant.ready=false;if(participant.isHost)room.hostMode='table';
      room.lobbyRevision++;this._touch(room);this._emit(room,'became-spectator',globalThis.PlayroomMessages.text("ui.rooms.cf67267fc630",{p0:String(participant.nickname)}),{participantId});
      return this.snapshot(roomId);
    }
    gameChangeBlocker(roomId,constraints){
      const room=this._room(roomId),next=this._constraints(constraints);
      if(room.transportMode!=='hotseat'&&next.max===1)return globalThis.PlayroomMessages.text('ui.rooms.solo-network-unavailable');
      const humans=room.participants.filter(p=>p.role==='player'&&!p.bot).length;
      return humans>next.max?globalThis.PlayroomMessages.text('ui.rooms.players-exceed-slots',{players:String(humans),slots:String(next.max)}):null;
    }
    changeGame(roomId,hostId,{game,rules={},constraints}={}){
      const room=this._room(roomId);this._lobby(room);this._host(room,hostId);
      this._newMatch(room);
      if(!game?.id||!game?.name||!game?.version)throw Error(globalThis.PlayroomMessages.text("ui.rooms.885ec2a160b1"));
      const next=this._constraints(constraints);
      const blocker=this.gameChangeBlocker(roomId,next);if(blocker)throw Error(blocker);
      const seatIndex=p=>room.seats.find(seat=>seat.participantId===p.id)?.index??Number.MAX_SAFE_INTEGER;
      const bySeat=(a,b)=>seatIndex(a)-seatIndex(b);
      const humans=room.participants.filter(p=>p.role==='player'&&!p.bot).sort(bySeat);
      const bots=room.participants.filter(p=>p.role==='player'&&p.bot).sort(bySeat);
      const keptBots=bots.slice(0,Math.max(0,next.max-humans.length));
      const dropped=new Set(bots.slice(keptBots.length).map(p=>p.id));
      const seats=Array.from({length:next.max},(_,i)=>({...room.seats[i],id:'seat-'+(i+1),index:i,sideId:i,participantId:null}));
      const place=(p,seat)=>{seat.participantId=p.id;seat.closed=false;p.seatId=seat.id;};
      // Existing human seats take priority; displaced humans fill any remaining
      // slots before even the first bot is considered. Preserve participant IDs.
      const displaced=[];
      for(const p of humans){const index=seatIndex(p);if(index<next.max)place(p,seats[index]);else displaced.push(p);}
      for(const p of displaced)place(p,seats.find(seat=>!seat.participantId));
      for(const p of keptBots)place(p,seats.find(seat=>!seat.participantId));
      for(const p of keptBots)if(p.botSettings&&!game.botSettings?.strategies?.some(s=>s.id===p.botSettings.strategy))p.botSettings={strategy:'auto',difficulty:p.botSettings.difficulty||'medium'};
      room.seats=seats;room.participants=room.participants.filter(p=>!dropped.has(p.id));
      delete room.startOrderResolved;room.firstPlayerMode=rules.firstPlayerMode||'rules';room.seatOrder=rules.seatOrder||'normal';
      if(room.firstParticipantId&&!room.participants.some(p=>p.id===room.firstParticipantId)){room.firstParticipantId=null;if(room.firstPlayerMode==='assigned')room.firstPlayerMode='rules';}
      room.game=clone(game);room.rules=clone(rules);room.constraints=next;
      room.rulesRevision++;room.lobbyRevision++;
      for(const p of room.participants)p.ready=!!p.bot;
      this._touch(room);this._emit(room,'game-changed',globalThis.PlayroomMessages.text("ui.rooms.8aa99c6ac476",{p0:String(room.game.name)}),{gameId:game.id});
      return this.snapshot(roomId);
    }
    collectForReplacement(roomId,hostId,{sessionId,revision}={}){
      const room=this._room(roomId);this._host(room,hostId);
      if(room.phase!=='playing'||typeof sessionId!=='string'||!sessionId||!Number.isSafeInteger(revision)||revision<0)throw Error('ROSTER_COLLECTION_INVALID');
      const seats=room.seats.filter(s=>s.participantId||Number.isInteger(s.playerIndex)).sort((a,b)=>a.index-b.index);
      seats.forEach((seat,index)=>{if(!Number.isInteger(seat.playerIndex))seat.playerIndex=index;seat.closed=false;});
      if(seats.some((seat,index)=>seat.playerIndex!==index))throw Error('HOST_SEATS_CHANGED');
      room.phase='lobby';room.countdownEndsAt=null;room.recovery={sessionId,revision,rosterChange:true};
      for(const person of room.participants){person.ready=!!person.bot;delete person.replacement;}
      for(const seat of room.seats)if(!Number.isInteger(seat.playerIndex))seat.closed=true;
      room.lobbyRevision++;this._touch(room);this._emit(room,'replacement-lobby','Замена игроков');return this.snapshot(roomId);
    }
    returnToLobby(roomId,hostId,{stopped=false}={}){
      const room=this._room(roomId);this._host(room,hostId);
      if(room.phase==='lobby')return this.snapshot(roomId);
      if(room.phase!=='playing')throw Error(globalThis.PlayroomMessages.text("ui.rooms.30263f1d2be6"));
      // The caller must verify that the authoritative match is FINISHED.
      // It remains in its immutable per-session IndexedDB journal.
      room.phase='lobby';room.countdownEndsAt=null;room.lobbyRevision++;
      delete room.recovery;delete room.startOrderResolved;for(const p of room.participants)delete p.rulesNotice;
      for(const seat of room.seats){delete seat.playerIndex;delete seat.previousParticipant;}
      for(const p of room.participants){p.ready=!!p.bot;delete p.replacement;}
      this._touch(room);this._emit(room,stopped?'match-stopped':'new-match-lobby',stopped?globalThis.PlayroomMessages.text("ui.rooms.6637266dd34c"):globalThis.PlayroomMessages.text("ui.rooms.986560a12b78"));
      return this.snapshot(roomId);
    }
    setAutoStart(roomId,hostId,enabled){
      const room=this._room(roomId);this._lobby(room);this._host(room,hostId);
      room.autoStart=!!enabled;this._touch(room);this._emit(room,'auto-start-changed','',{enabled:room.autoStart});return this.snapshot(roomId);
    }
    setReady(roomId,participantId,ready,expectedConfiguration){
      const room=this._room(roomId);if(!(room.phase==='starting'&&ready===false))this._lobby(room);const participant=this._participant(room,participantId);
      if(participant.role!=='player'||!participant.seatId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.a1c130d9bd0d"));
      if(expectedConfiguration!==undefined&&expectedConfiguration!==readyConfiguration(room,participantId))throw Error(globalThis.PlayroomMessages.text('ui.network-ui.ready-changed'));
      if(ready&&participant.replacement&&!participant.replacement.accepted)throw Error(globalThis.PlayroomMessages.text("ui.rooms.6a738803cb95"));
      if(room.phase==='starting'){room.phase='lobby';room.countdownEndsAt=null;}
      participant.ready=!!ready;if(ready){delete participant.rulesNotice;delete participant.botSettingsNotice;}room.lobbyRevision++;this._touch(room);
      this._emit(room,'ready-changed',globalThis.PlayroomMessages.text("ui.rooms.380e3dbd6730",{p0:String(participant.nickname),p1:String(participant.ready?globalThis.PlayroomMessages.text("ui.rooms.edcdf31ef2c8"):globalThis.PlayroomMessages.text("ui.rooms.0ba46c29d34d"))}),{participantId,ready:participant.ready});
      return this.snapshot(roomId);
    }
    updateRules(roomId,participantId,rules){
      const room=this._room(roomId);this._lobby(room);this._host(room,participantId);
      const nextRules=clone(rules||{});validateOrder(nextRules);
      this._newMatch(room);
      const invalid=this.validateRules({...clone(room),rules:nextRules});if(invalid)throw Error(invalid);
      if(nextRules.firstPlayerMode!==undefined)room.firstPlayerMode=nextRules.firstPlayerMode;
      if(nextRules.seatOrder!==undefined)room.seatOrder=nextRules.seatOrder;
      room.previousRules=clone(room.rules);room.rules=nextRules;room.rulesRevision++;room.lobbyRevision++;
      for(const participant of room.participants){participant.ready=!!participant.bot;participant.rulesNotice=!participant.bot;}
      delete room.startOrderResolved;
      this._touch(room);this._emit(room,'rules-changed',globalThis.PlayroomMessages.text("ui.rooms.bcabed4ce53a"),{rulesRevision:room.rulesRevision});
      return this.snapshot(roomId);
    }
    kick(roomId,participantId,targetId){
      const room=this._room(roomId);this._lobby(room);this._host(room,participantId);
      if(targetId===room.ownerId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.bf317a0beea4"));
      const target=this._participant(room,targetId);
      for(const seat of room.seats)if(seat.participantId===targetId){if(room.recovery)seat.previousParticipant={id:target.id,nickname:target.nickname};seat.participantId=null;}
      room.participants=room.participants.filter(item=>item.id!==targetId);
      this.resumeTokens.delete(this._key(roomId,targetId));this.connectionLeases.delete(this._key(roomId,targetId));
      this.resumeFallbacks.delete(this._key(roomId,targetId));this.pendingResumes.delete(this._key(roomId,targetId));
      if(room.recovery&&!target.replacement)this._resetRoomReady(room);else{room.lobbyRevision++;this._touch(room);}this._emit(room,'participant-kicked',globalThis.PlayroomMessages.text("ui.rooms.3e126cf66b4a",{p0:String(target.nickname)}),{participantId:targetId,requiresReady:!room.recovery||!target.replacement});
      return this.snapshot(roomId);
    }
    setConnected(roomId,participantId,connected){
      const room=this._room(roomId),participant=this._participant(room,participantId);participant.connected=!!connected;this._touch(room);
      this._emit(room,'connection-changed',globalThis.PlayroomMessages.text("ui.rooms.380e3dbd6730",{p0:String(participant.nickname),p1:String(participant.connected?globalThis.PlayroomMessages.text("ui.rooms.05559281b758"):globalThis.PlayroomMessages.text("ui.rooms.5f025178c1a4"))}),{participantId,connected:participant.connected});
      return this.snapshot(roomId);
    }
    _resumeCandidate(roomId,{participantId,token}={}){
      const room=this._room(roomId);
      if(room.phase==='closed'||typeof participantId!=='string'||!resumeTokenValid(token))throw Error(globalThis.PlayroomMessages.text("ui.rooms.7b7b0d6053b8"));
      const member=this._participant(room,participantId);
      if(member.isHost||member.bot||member.local)throw Error(globalThis.PlayroomMessages.text("ui.rooms.8a2f9cee95be"));
      if(room.phase==='playing'&&!member.seatId&&!['spectator','table'].includes(member.role))throw Error(globalThis.PlayroomMessages.text("ui.rooms.6673cfb9a9f2"));
      const key=this._key(roomId,participantId),expected=this.resumeTokens.get(key);
      const fallback=this.resumeFallbacks.get(key);
      // If the host committed a rotation but its reply was lost, the previous
      // secret may recover the same participant (never an active controller).
      if(expected && expected!==token && fallback?.token===token && fallback.expiresAt>this.clock()&&!member.connected&&
          !this.connectionLeases.has(key))
        return {roomId,participantId,key,expected,updated:expected,replayedRotation:true};
      if(!expected||expected!==token)throw Error(globalThis.PlayroomMessages.text("ui.rooms.c18d13efb5ed"));
      const updated=this.tokenFactory();
      if(!resumeTokenValid(updated)||updated===expected)throw Error(globalThis.PlayroomMessages.text("ui.rooms.82fa3d3e622f"));
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
      if(this.pendingResumes.has(candidate.key))throw Error(globalThis.PlayroomMessages.text("ui.rooms.e72e5b26f328"));
      const persist=this.durableResumes.get(roomId);
      if(!persist)throw Error(globalThis.PlayroomMessages.text("ui.rooms.b54132ddbda4"));
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
      if(typeof callback!=='function')throw Error(globalThis.PlayroomMessages.text("ui.rooms.a90a2c3a4b03"));
      this.durableResumes.set(roomId,callback);
    }
    freezeLobbyTransfer(roomId,hostId){const room=this._room(roomId);this._host(room,hostId);this._lobby(room);this._newMatch(room);room.hostTransferPending=true;return ()=>{delete room.hostTransferPending;};}
    exportRecovery(roomId,{lobby=false}={}){
      const room=this._room(roomId);
      if(room.phase!=='playing'&&!room.recovery&&!(lobby&&room.phase==='lobby'))throw Error(globalThis.PlayroomMessages.text("ui.rooms.5c60cec1810e"));
      const tokens=room.participants.filter(p=>!p.isHost&&!p.bot&&!p.local).map(p=>{
        const key=this._key(roomId,p.id),fallback=this.resumeFallbacks.get(key);
        return {participantId:p.id,token:this.resumeTokens.get(key),
          ...(fallback?.expiresAt>this.clock()?{previousToken:fallback.token,previousExpiresAt:fallback.expiresAt}:{})};
      });
      if(tokens.some(p=>!resumeTokenValid(p.token)))throw Error(globalThis.PlayroomMessages.text("ui.rooms.ca4061dff059"));
      return {version:1,room:clone(room),tokens};
    }
    restoreRecovery(value,{hostId,collect=false,sessionId=null,revision=0,lobby=false}={}){
      if(value?.version!==1||!value.room||!Array.isArray(value.tokens))throw Error(globalThis.PlayroomMessages.text("ui.rooms.ff22d32fc3b8"));
      const room=clone(value.room),tokens=value.tokens;
      if(typeof hostId!=='string'||room.ownerId!==hostId||typeof room.id!=='string'||!room.id||
          (room.phase!=='playing'&&!(['lobby','starting'].includes(room.phase)&&room.recovery)&&!(lobby&&room.phase==='lobby'&&!room.recovery))||(room.code!==null&&!ROOM_CODE.test(room.code))||!['player','table'].includes(room.hostMode)||
          !Array.isArray(room.participants)||!Array.isArray(room.seats)||room.participants.length<1||
          this.rooms.has(room.id))throw Error(globalThis.PlayroomMessages.text("ui.rooms.155c12be64a8"));
      this._constraints(room.constraints);
      const ids=new Set(),seatIds=new Set(),occupied=new Set();
      for(const p of room.participants){
        if(typeof p.id!=='string'||!p.id||ids.has(p.id)||typeof p.nickname!=='string'||
            typeof p.isHost!=='boolean')throw Error(globalThis.PlayroomMessages.text("ui.rooms.c13ec00f540d"));
        ids.add(p.id);
        if(p.isHost!==(p.id===hostId))throw Error(globalThis.PlayroomMessages.text("ui.rooms.a3c0ff31f435"));
        p.connected=p.id===hostId||!!p.bot||!!p.local; // Network connections never survive page reload.
      }
      for(const seat of room.seats){
        if(typeof seat.id!=='string'||seatIds.has(seat.id)||!Number.isInteger(seat.index))throw Error(globalThis.PlayroomMessages.text("ui.rooms.20ad05edbf46"));
        seatIds.add(seat.id);
        if(seat.participantId!==null){if(!ids.has(seat.participantId)||occupied.has(seat.participantId))throw Error(globalThis.PlayroomMessages.text("ui.rooms.c62810ecc50b"));occupied.add(seat.participantId);}
      }
      for(const p of room.participants){
        if(p.seatId!==null&&(!seatIds.has(p.seatId)||!room.seats.some(s=>s.id===p.seatId&&s.participantId===p.id)))
          throw Error(globalThis.PlayroomMessages.text("ui.rooms.705a0063a831"));
      }
      const found=new Set();
      for(const entry of tokens){
        if(!ids.has(entry?.participantId)||entry.participantId===hostId||found.has(entry.participantId)||
           !resumeTokenValid(entry.token))throw Error(globalThis.PlayroomMessages.text("ui.rooms.2bfa907d9b30"));
        found.add(entry.participantId);
      }
      if(room.participants.filter(p=>!p.isHost&&!p.bot&&!p.local).some(p=>!found.has(p.id)))throw Error(globalThis.PlayroomMessages.text("ui.rooms.9a3109b51bac"));
      // Validate all credentials before installing any recovered room.
      for(const entry of tokens){
        if(entry.previousToken!==undefined){
          if(!resumeTokenValid(entry.previousToken)||!Number.isSafeInteger(entry.previousExpiresAt)||
              entry.previousExpiresAt<0||entry.previousToken===entry.token)throw Error(globalThis.PlayroomMessages.text("ui.rooms.30c8f7fd09e8"));
        }
      }
      if(collect){
        if(typeof sessionId!=='string'||!sessionId||!Number.isSafeInteger(revision)||revision<0)throw Error(globalThis.PlayroomMessages.text("ui.rooms.8ae80e540fbe"));
        const seats=room.seats.filter(s=>s.participantId||Number.isInteger(s.playerIndex)).sort((a,b)=>a.index-b.index);
        seats.forEach((seat,index)=>{if(!Number.isInteger(seat.playerIndex))seat.playerIndex=index;});
        if(seats.some((seat,index)=>seat.playerIndex!==index))throw Error(globalThis.PlayroomMessages.text("ui.rooms.8a1a0a4226fe"));
        room.participants=room.participants.filter(p=>p.isHost||p.role==='player');
        room.phase='lobby';room.countdownEndsAt=null;room.recovery={sessionId,revision};
        for(const p of room.participants)p.ready=!!p.bot;
        for(const seat of room.seats)if(!Number.isInteger(seat.playerIndex))seat.closed=true;
        room.lobbyRevision++;this._touch(room);
      }
      this.rooms.set(room.id,room);
      for(const entry of tokens){
        if(!room.participants.some(p=>p.id===entry.participantId))continue;
        const key=this._key(room.id,entry.participantId);
        this.resumeTokens.set(key,entry.token);
        if(entry.previousToken && entry.previousExpiresAt>this.clock())
          this.resumeFallbacks.set(key,{token:entry.previousToken,expiresAt:entry.previousExpiresAt});
      }
      return this.snapshot(room.id);
    }
    discardRecovery(roomId){
      const room=this._room(roomId);
      if(room.participants.some(p=>!p.isHost&&!p.bot&&!p.local&&p.connected)||
          [...this.connectionLeases.keys()].some(k=>k.startsWith(roomId+':')))
        throw Error(globalThis.PlayroomMessages.text("ui.rooms.b2ccb8a1b633"));
      this.rooms.delete(roomId);this.listeners.delete(roomId);this.durableResumes.delete(roomId);
      for(const participant of room.participants){
        const key=this._key(roomId,participant.id);
        this.resumeTokens.delete(key);this.connectionLeases.delete(key);
        this.resumeFallbacks.delete(key);this.pendingResumes.delete(key);
      }
    }
    abortStart(roomId,hostId){
      const room=this._room(roomId);this._host(room,hostId);
      if(!['starting','playing'].includes(room.phase))throw Error(globalThis.PlayroomMessages.text("ui.rooms.fa95ecd1fa55"));
      room.phase='lobby';room.countdownEndsAt=null;room.lobbyRevision++;
      for(const participant of room.participants){participant.ready=!!participant.bot;participant.rulesNotice=!participant.bot;}
      delete room.startOrderResolved;
      this._touch(room);this._emit(room,'start-rejected',globalThis.PlayroomMessages.text("ui.rooms.ae6bb592e151"));
      return this.snapshot(roomId);
    }
    playerCount(roomId){return this._room(roomId).participants.filter(item=>item.role==='player'&&item.seatId).length;}
    _validCount(room){
      const count=room.participants.filter(item=>item.role==='player'&&item.seatId).length;
      return room.constraints.allowed?room.constraints.allowed.includes(count):count>=room.constraints.min&&count<=room.constraints.max;
    }
    _startBlocker(room){
      if(room.hostTransferPending)return 'HOST_TRANSFER_BUSY';
      const unavailable=globalThis.PlayroomMessages.text('ui.rooms.start-unavailable');
      if(!this._validCount(room))return globalThis.PlayroomMessages.text('ui.rooms.roster-invalid');
      const players=room.participants.filter(item=>item.role==='player'&&item.seatId);
      const occupied=room.seats.filter(seat=>seat.participantId);
      if(room.transportMode!=='hotseat'&&!players.some(p=>!p.bot&&p.connected))return unavailable;
      if(occupied.length!==players.length||new Set(occupied.map(seat=>seat.participantId)).size!==players.length||players.some(p=>!occupied.some(seat=>seat.id===p.seatId&&seat.participantId===p.id)))return unavailable;
      if(room.recovery&&room.seats.some(seat=>Number.isInteger(seat.playerIndex)&&!seat.participantId))return unavailable;
      if((!room.recovery&&room.firstPlayerMode==='assigned'&&!players.some(p=>p.id===room.firstParticipantId))||!players.length||!players.every(item=>(item.bot||room.transportMode==='hotseat'||item.ready)&&item.connected&&(!item.replacement||item.replacement.accepted)))return unavailable;
      return room.recovery?null:this.validateStart(clone(room));
    }
    startBlocker(roomId){
      const room=this._room(roomId);
      return room.phase==='lobby'?this._startBlocker(room):globalThis.PlayroomMessages.text('ui.rooms.start-unavailable');
    }
    canStart(roomId){
      return !this.startBlocker(roomId);
    }
    beginCountdown(roomId,participantId,{seconds=3}={}){
      const room=this._room(roomId);this._lobby(room);this._host(room,participantId);
      const blocker=this.startBlocker(roomId);if(blocker)throw Error(blocker);
      if(!Number.isInteger(seconds)||seconds<1||seconds>10)throw Error(globalThis.PlayroomMessages.text("ui.rooms.65818e5182d3"));
      this.prepareStart(roomId,participantId);room.phase='starting';room.countdownEndsAt=this.clock()+seconds*1000;this._touch(room);
      this._emit(room,'countdown-started',globalThis.PlayroomMessages.text("ui.rooms.c5b0897b37d5",{p0:String(seconds)}),{seconds});
      return this.snapshot(roomId);
    }
    tick(roomId){
      const room=this._room(roomId);
      if(room.phase!=='starting')return {room:this.snapshot(roomId),remaining:null,started:room.phase==='playing'};
      const remaining=Math.max(0,Math.ceil((room.countdownEndsAt-this.clock())/1000));
      const blocker=this._startBlocker(room);
      if(blocker){this.abortStart(roomId,room.ownerId);return {room:this.snapshot(roomId),remaining:null,started:false,reason:blocker};}
      if(remaining===0){
        this.prepareStart(roomId,room.ownerId);room.phase='playing';room.countdownEndsAt=null;this._touch(room);this._emit(room,'game-started',globalThis.PlayroomMessages.text("ui.rooms.09d9da8749f7"));
        return {room:this.snapshot(roomId),remaining:0,started:true};
      }
      return {room:this.snapshot(roomId),remaining,started:false};
    }
    subscribe(roomId,listener){
      this._room(roomId);if(typeof listener!=='function')throw Error(globalThis.PlayroomMessages.text("ui.rooms.71f6a264b94e"));
      if(!this.listeners.has(roomId))this.listeners.set(roomId,new Set());
      this.listeners.get(roomId).add(listener);
      return ()=>{const set=this.listeners.get(roomId);set?.delete(listener);if(set&&!set.size)this.listeners.delete(roomId);};
    }
    connection(roomId,{boundParticipantId=null}={}){
      this._room(roomId);let participantId=null,lease={};const service=this;
      const packet=()=>participantId?{kind:'lobby',room:this.snapshot(roomId),participantId}:{kind:'room-preview',room:this.preview(roomId)};
      const active=()=>!participantId||service.connectionLeases.get(service._key(roomId,participantId))===lease;
      return {
        get participantId(){return participantId;},
        status:()=>{if(!active())throw Error('CLOSED');const room=service._room(roomId);return {kind:'status',scope:'room',roomId:room.id,participantId,phase:room.phase,revision:room.revision};},
        snapshot:()=>{if(!active())throw Error(globalThis.PlayroomMessages.text("ui.rooms.d97ec0ecd6a9"));return packet();},
        dispatch:command=>{
          if(!command||typeof command.type!=='string')throw Error(globalThis.PlayroomMessages.text("ui.rooms.1ccd31203132"));
          if(!active())throw Error(globalThis.PlayroomMessages.text("ui.rooms.d97ec0ecd6a9"));
          if(command.type==='join'){
            if(participantId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.33a7864d6dad"));
            // A server-authenticated cloud binding may recover its disconnected
            // reserved identity even when this device lost the local resume token.
            const existing=boundParticipantId&&this._room(roomId).participants.find(p=>p.id===boundParticipantId);
            if(existing&&!existing.connected&&!existing.isHost&&!existing.bot&&!existing.local){
              const apply=resumed=>{participantId=resumed.participantId;lease={};service.connectionLeases.set(service._key(roomId,participantId),lease);return {ok:true,snapshot:packet(),resumeToken:resumed.resumeToken,resumed:true};};
              const credentials={participantId:boundParticipantId,token:service.resumeTokens.get(service._key(roomId,boundParticipantId))};
              const resumed=service.durableResumes.has(roomId)?service.resumeDurably(roomId,credentials):service.resume(roomId,credentials);
              return resumed instanceof Promise?resumed.then(apply):apply(resumed);
            }
            // Profile IDs are not credentials. Only a trusted host binding may fix identity.
            const joined=this.join(roomId,{id:boundParticipantId||this.idFactory(),nickname:command.nickname,avatar:command.avatar});
            participantId=joined.participantId;
            service.connectionLeases.set(service._key(roomId,participantId),lease);
            return {ok:true,snapshot:packet(),resumeToken:joined.resumeToken};
          }
          if(command.type==='resume'){
            if(boundParticipantId&&command.participantId!==boundParticipantId)throw Error('ROOM_IDENTITY_MISMATCH');
            if(participantId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.33a7864d6dad"));
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
          if(!participantId)throw Error(globalThis.PlayroomMessages.text("ui.rooms.c8ccc592f57a"));
          let state;
          if(command.type==='avatar')state=this.setAvatar(roomId,participantId,command.avatar);
          else if(command.type==='rename')state=this.rename(roomId,participantId,command.nickname);
          else if(command.type==='claim-seat')state=this.claimSeat(roomId,participantId,command.seatId);
          else if(command.type==='claim-table')state=this.claimTable(roomId,participantId);
          else if(command.type==='spectator')state=this.becomeSpectator(roomId,participantId);
          else if(command.type==='ready')state=this.setReady(roomId,participantId,command.ready,command.expectedConfiguration);
          else if(command.type==='accept-replacement')state=this.acceptReplacement(roomId,participantId);
          else throw Error(globalThis.PlayroomMessages.text("ui.rooms.a9e191ac7fd3"));
          return {ok:true,snapshot:{kind:'lobby',room:state,participantId}};
        },
        history(){throw Error(globalThis.PlayroomMessages.text("ui.rooms.e7a380b7bccf"));},
        subscribe:listener=>this.subscribe(roomId,()=>{if(active())listener(packet());}),
        close:()=>{if(participantId&&active()){service.connectionLeases.delete(service._key(roomId,participantId));try{service.setConnected(roomId,participantId,false);}catch(_){}}}
      };
    }
    snapshot(roomId){return clone(this._room(roomId));}
  }
class SwitchableConnection{
    constructor(connection=null){this.current=null;this.listeners=new Set();this.wireListeners=new Set();this.unsubscribe=null;this.unsubscribeWire=null;if(connection)this.set(connection);}
    _bind(){
      this.unsubscribe?.();this.unsubscribeWire?.();this.unsubscribe=null;this.unsubscribeWire=null;
      if(this.listeners.size)this.unsubscribe=this.current?.subscribe?.(snapshot=>{for(const listener of this.listeners)listener(snapshot);});
      if(this.wireListeners.size)this.unsubscribeWire=this.current?.subscribe?.(snapshot=>{for(const listener of this.wireListeners)listener(snapshot);},{wire:true});
    }
    set(connection){
      this.current=connection;this._bind();
      if(connection){if(this.listeners.size){const frame=connection.snapshot();for(const listener of this.listeners)listener(frame);}if(this.wireListeners.size){const frame=connection.snapshot({wire:true});for(const listener of this.wireListeners)listener(frame);}}
      return this;
    }
    snapshot(options){if(!this.current)throw Error('CLOSED');return this.current.snapshot(options);}
    status(){if(!this.current)throw Error('CLOSED');return this.current.status();}
    dispatch(value,options){if(!this.current)throw Error('CLOSED');return this.current.dispatch(value,options);}
    history(value,options){if(!this.current)throw Error('CLOSED');return this.current.history(value,options);}
    historyRange(start,count,options){if(!this.current)throw Error('CLOSED');return this.current.historyRange(start,count,options);}
    realtimeScope(){return this.current?.realtimeScope?.()||null;}
    realtime(value){if(!this.current?.realtime)throw Error('REALTIME_UNAVAILABLE');return this.current.realtime(value);}
    presentationReady(value){if(!this.current)throw Error('CLOSED');return this.current.presentationReady?.(value)||{ok:false};}
    subscribe(listener,options={}){const listeners=options.wire?this.wireListeners:this.listeners;listeners.add(listener);this._bind();return()=>{listeners.delete(listener);this._bind();};}
    close(){this.unsubscribe?.();this.unsubscribeWire?.();this.current?.close?.();this.listeners.clear();this.wireListeners.clear();this.current=null;}
  }

return Object.freeze({STANDARD_RULE_VALUES,standardRule,readyConfiguration,normalizeAvatar,ROOM_CODE,resumeTokenValid,normalizeName,normalizeRoomName,validateRuleSettings,RoomService,SwitchableConnection});
});
