/* Rebuild presentation from authorized facts, never from hidden game state. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomNetworkProjection=api;})(globalThis,function(){
  'use strict';
  const format='local-presentation-v2',formattedEvents=new WeakMap();
  function soundCues(events,state,viewer){
    const fallback={move:'move',play:'move',action:'move',draw:'draw',take:'take',attack:'attack',defend:'defend',capture:'attack.capture',roll:'dice',pass:'pass'};
    const semantic={skip:'attack.skip',pass:'pass',discard:'discard',draw:'draw',take:'take',reverse:'reverse'};
    const priorities={skip:90,discard:70,reverse:75,pass:60,take:55,draw:40};
    const sounds={'penalty':85,'uno.call':80,'attack.capture':75,'success.special':65,'success.yatzy':65,'success':60,'mismatch':50};
    const actions=new Map(),explicit=[],authored=new Set();
    for(const e of events){
      const id=e.kind==='finish'
        ? state.winner==null?'draw-game':viewer<0||viewer>=state.players.length?'notify':(state.winners||[state.winner]).includes(viewer)?'victory':'defeat'
        : e.sound===null?null:e.sound?.id||semantic[e.feedback?.kind]||fallback[e.kind];
      if(!id)continue;
      const priority=e.kind==='finish'?100:priorities[e.feedback?.kind]||sounds[id]||({draw:40,capture:75,roll:30}[e.kind]??10);
      const revision=e.revision??e.id,previous=actions.get(revision);
      const target=e.sound?.target??e.feedback?.player;
      if(e.sound?.id||e.transfer||e.reveal||e.speech||e.feedback||e.presentation||e.kind==='finish'){
        explicit.push({id,eventId:e.id,...(target!=null?{target}:{})});authored.add(revision);continue;
      }
      if(!previous||priority>previous.priority)actions.set(revision,{priority,cue:{id,eventId:e.id,...(target!=null?{target}:{})}});
    }
    const cues=[...explicit,...[...actions].filter(([revision])=>!authored.has(revision)).map(([,value])=>value.cue)];
    return cues.sort((a,b)=>a.eventId-b.eventId);
  }
  function compact(snapshot){
    if(!snapshot||!['snapshot','history'].includes(snapshot.kind)||!snapshot.state)return snapshot;
    const {cues,effects,events=[],state,...rest}=snapshot;
    const {events:stateEvents,...position}=state;
    const computed=['player','text','message','kind','presentation','transfer','feedback','reveal','speech','sound','target','notice'];
    const model=state.modelProjection;
    if(position.sdkProjection){delete position.scene;delete position.modelProjection;}
    if(model){
      delete position.modelProjection;delete position.scene;delete position.tableActions;
      delete rest.actions;delete rest.independentActions;
      if(model.choicesVersion!==1||model.revision!==snapshot.revision)throw Error('LOCAL_CHOICES_REQUIRED');
      const {actions:_,revision:__,...facts}=model;rest.model=facts;
      delete position.timeline;delete position.move;delete position.turn;delete position.status;

    }
    return {...rest,eventFormat:format,state:position,events:events.map(event=>{
      if(typeof event.type!=='string')return event;
      const raw={...event};for(const key of computed)delete raw[key];if(model)delete raw.scene;return raw;
    })};
  }
  function restore(snapshot,presentEvent,pack){
    if(!snapshot||!['snapshot','history'].includes(snapshot.kind)||!snapshot.state)return snapshot;
    if(snapshot.eventFormat===undefined&&snapshot.cues!==undefined&&snapshot.effects!==undefined)return snapshot;
    const {eventFormat,model,actionHints,independentActionRefs,commandScope,...rest}=snapshot;
    if(eventFormat!==undefined&&eventFormat!==format)throw Error('EVENT_FORMAT_UNSUPPORTED');
    const Protocol=globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);
    const presentationKey=JSON.stringify([snapshot.sessionId,snapshot.authorityEpoch,snapshot.game,snapshot.packVersion,snapshot.viewer,snapshot.role,snapshot.rosterRevision||0,(snapshot.state.players||[]).map(p=>p.name),globalThis.PlayroomMessages?.locale||'ru']);
    const rawEvents=snapshot.events||[];
    if(model){pack??=globalThis.TabletopCore?.get(snapshot.game,snapshot.packVersion);if(!pack?.scene||!pack?.eventScenes||!pack?.decorate)throw Error('PROJECTION_PRESENTER_REQUIRED');}
    let local=model;
    if(model){
      if(model.choicesVersion!==1||Object.hasOwn(model,'actions'))throw Error('LOCAL_CHOICES_REQUIRED');
      local=pack.localProjection({...model,revision:snapshot.revision});
      const filtered=[],independent=[],windows=snapshot.reactionWindows||[];
      if(snapshot.inputAllowed===true)for(const command of local.actions){
        const control=pack.localReaction(local,command),relevant=windows.filter(w=>control?.kind==='advance'||control?.target===undefined||w.owner===control.target),protectedWindow=relevant.some(w=>w.protected);
        if(control?.kind==='advance'&&protectedWindow)continue;
        const disabled=control?.kind==='challenge'&&(control.ignore||protectedWindow);
        filtered.push({command,disabled:!!disabled});
        if(snapshot.role==='player'&&control?.independent&&['answer','challenge'].includes(control.kind)&&Number.isSafeInteger(command.episode)&&command.episode===control.episode)independent.push(command);
      }
      local={...local,actions:filtered.map(v=>v.command)};
      var localChoices=filtered,localIndependent=independent;
      rest.state={...snapshot.state,timeline:local.timeline,move:snapshot.revision,turn:local.turn,status:local.status};
    }
    const sceneEvents=model?pack.eventScenes({...local,events:rawEvents.filter(e=>typeof e.type==='string')},snapshot.state.players,rawEvents):rawEvents;
    const events=Protocol.composeArray(eventFormat===format?sceneEvents.map(event=>{
      if(typeof event.type!=='string')return event;
      if(typeof presentEvent!=='function')throw Error('EVENT_PRESENTER_REQUIRED');
      const cached=formattedEvents.get(event);if(cached?.key===presentationKey)return cached.value;
      const value=Protocol.composeRecord(presentEvent(event,snapshot));formattedEvents.set(event,{key:presentationKey,value});return value;
    }):snapshot.events||snapshot.state.events||[]);
    const current=events.filter(event=>event.revision===snapshot.revision);
    const derived=soundCues(current,snapshot.state,snapshot.viewer);
    const effects=current.filter(event=>event.transfer).map((event,index)=>({id:`${snapshot.revision}:draw:${index}`,revision:snapshot.revision,...event.transfer}));
    let state=rest.state||snapshot.state,actions=snapshot.actions,independentActions=snapshot.independentActions;
    if(model){
      if(local.game!==snapshot.game||local.viewer!==snapshot.viewer||local.playerCount!==state.players.length||local.revision!==snapshot.revision)throw Error('PROJECTION_MODEL_INVALID');
      const projection={...local,events:rawEvents.filter(e=>typeof e.type==='string')};
      actions=Protocol.composeArray(localChoices.map(({command,disabled})=>({...pack.decorate(command,projection,state.players),...(disabled?{disabled:true}:{})})));
      independentActions=Protocol.composeArray(localIndependent.map(command=>actions[local.actions.indexOf(command)]));
      state=Protocol.composeRecord({...state,scene:pack.scene(projection,state.players),...(snapshot.role==='table'?{tableActions:actions}:{})});

    }
    if(state.sdkProjection){const direct=state.sdkProjection;pack??=globalThis.TabletopCore?.get(snapshot.game,snapshot.packVersion);if(!pack?.isolated||direct.game!==snapshot.game||direct.viewer!==snapshot.viewer||direct.playerCount!==state.players.length||direct.revision!==snapshot.revision)throw Error('PROJECTION_MODEL_INVALID');state=Protocol.composeRecord({...state,modelProjection:direct,scene:pack.scene({...direct,events:rawEvents.filter(e=>typeof e.type==='string')},state.players)});}
    const result=Protocol.composeRecord({...rest,...(model?{actions,independentActions}:{}),state:Protocol.composeRecord({...state,events}),events,cues:snapshot.cues??derived,effects:snapshot.effects??effects});
    return model?Protocol.withProjection(result,local):state.sdkProjection?Protocol.withProjection(result,state.sdkProjection):result;
  }
  function draft(frame,model,pack){const source=compact({...frame,state:{...frame.state,modelProjection:model}}),next=restore({...source,localDraft:true},(event,snapshot)=>pack.presentEvent(event,snapshot.state.players),pack);return (globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null)).withDraft(next,frame);}
  return Object.freeze({format,compact,restore,draft,soundCues});
});
