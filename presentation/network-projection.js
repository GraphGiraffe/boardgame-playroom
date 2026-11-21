/* Rebuild presentation from authorized facts, never from hidden game state. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomNetworkProjection=api;})(globalThis,function(){
  'use strict';
  const format='local-presentation-v2',formattedEvents=new WeakMap();
  const {soundCues,transferCues,transferEffects}=globalThis.PlayroomTransition||
    (typeof require==='function'?require('./transition.js'):null);
  function compact(snapshot){
    if(!snapshot||!['snapshot','history'].includes(snapshot.kind)||!snapshot.state)return snapshot;
    const {cues,effects,events=[],state,...rest}=snapshot;
    const {events:stateEvents,...position}=state;
    const computed=['player','text','message','kind','presentation','transfer','feedback','reveal','speech','sound','target','notice'];
    const direct=state.sdkProjection,model=direct?null:state.modelProjection;
    if(direct){
      const {events:_,...authorized}=direct;
      position.sdkProjection=authorized;
      delete position.scene;delete position.modelProjection;
    }
    if(model){
      delete position.modelProjection;delete position.scene;delete position.tableActions;
      delete rest.actions;delete rest.independentActions;
      if(model.choicesVersion!==1||model.revision!==snapshot.revision)throw Error('LOCAL_CHOICES_REQUIRED');
      const {actions:_,revision:__,...facts}=model;rest.model=facts;
      delete position.timeline;delete position.move;delete position.turn;delete position.status;

    }
    return {...rest,eventFormat:format,state:position,events:events.map(event=>{
      if(typeof event.type!=='string')return event;
      const raw={...event};for(const key of computed)delete raw[key];if(model||direct)delete raw.scene;return raw;
    })};
  }
  function restore(snapshot,presentEvent,pack){
    if(!snapshot||!['snapshot','history'].includes(snapshot.kind)||!snapshot.state)return snapshot;
    if(snapshot.eventFormat===undefined&&snapshot.cues!==undefined&&snapshot.effects!==undefined)return snapshot;
    const {eventFormat,model,actionHints,independentActionRefs,commandScope,...rest}=snapshot;
    if(eventFormat!==undefined&&eventFormat!==format)throw Error('EVENT_FORMAT_UNSUPPORTED');
    const Protocol=globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);
    const presentationKey=JSON.stringify([snapshot.sessionId,snapshot.authorityEpoch,snapshot.game,snapshot.packVersion,snapshot.viewer,snapshot.role,snapshot.rosterRevision||0,(snapshot.state.players||[]).map(p=>p.name),globalThis.PlayroomMessages?.locale||'ru']);
    const rawEvents=snapshot.events||[],direct=snapshot.state.sdkProjection;
    const facts=model||direct?Protocol.composeArray(rawEvents.filter(event=>typeof event.type==='string')):null;
    if(model){pack??=globalThis.TabletopCore?.get(snapshot.game,snapshot.packVersion);if(!pack?.scene||!pack?.eventScenes||!pack?.decorate||!pack?.prepareLocalView)throw Error('PROJECTION_PRESENTER_REQUIRED');}
    let projection,localChoices,localIndependent,restricted;
    if(model){
      if(model.choicesVersion!==1||Object.hasOwn(model,'actions'))throw Error('LOCAL_CHOICES_REQUIRED');
      // The wire carries this viewer's facts separately from model data.
      // SDK data and choice hooks need the same journal as the scene renderer.
      const source={...model,revision:snapshot.revision,events:facts};
      const inputAllowed=snapshot.inputAllowed===true;
      const prepared=pack.prepareLocalView(source,inputAllowed);
      const filtered=[],independent=[],windows=snapshot.reactionWindows||[];
      for(const [index,command] of prepared.actions.entries()){
        const control=prepared.reactions?.[index];
        const protectedWindow=!!control&&windows.some(w=>w.protected&&(control.kind==='advance'||control.target===undefined||w.owner===control.target));
        if(control?.kind==='advance'&&protectedWindow)continue;
        const disabled=control?.kind==='challenge'&&(control.ignore||protectedWindow);
        filtered.push({command,disabled:!!disabled});
        if(snapshot.role==='player'&&control?.independent&&['answer','challenge'].includes(control.kind)&&Number.isSafeInteger(command.episode)&&command.episode===control.episode)independent.push(filtered.length-1);
      }
      // Seal the authorized view once. The renderer's identity cache, the
      // tutorial and typed input all read this same snapshot.
      projection=Protocol.composeRecord({...source,...(Object.hasOwn(prepared,'data')?{data:prepared.data}:{}),actions:Protocol.composeArray(filtered.map(v=>v.command))});
      localChoices=filtered;localIndependent=independent;
      restricted=!inputAllowed||filtered.length!==prepared.actions.length;
      rest.state={...snapshot.state,timeline:projection.timeline,move:snapshot.revision,turn:projection.turn,status:projection.status};
    }else if(direct){
      pack??=globalThis.TabletopCore?.get(snapshot.game,snapshot.packVersion);
      if(!pack?.isolated)throw Error('PROJECTION_MODEL_INVALID');
      // Explicit wire commands have already been filtered by Authority.
      projection=Protocol.composeRecord({...direct,events:facts});
      restricted=true;
    }
    if(projection&&(projection.game!==snapshot.game||projection.viewer!==snapshot.viewer||projection.playerCount!==snapshot.state.players.length||projection.revision!==snapshot.revision))throw Error('PROJECTION_MODEL_INVALID');
    // The installed pack caches the guest render by authorized projection
    // identity. Checkpoints, action labels and the final board share it.
    const sceneEvents=projection&&pack.eventScenes?pack.eventScenes(projection,snapshot.state.players,rawEvents):rawEvents;
    const events=Protocol.composeArray(eventFormat===format?sceneEvents.map(event=>{
      if(typeof event.type!=='string')return event;
      if(typeof presentEvent!=='function')throw Error('EVENT_PRESENTER_REQUIRED');
      const cached=formattedEvents.get(event);if(cached?.key===presentationKey)return cached.value;
      const value=Protocol.composeRecord(presentEvent(event,snapshot));formattedEvents.set(event,{key:presentationKey,value});return value;
    }):snapshot.events||snapshot.state.events||[]);
    const current=events.filter(event=>event.revision===snapshot.revision);
    const cues=snapshot.cues??soundCues(current,snapshot.state,snapshot.viewer);
    const effects=snapshot.effects??transferEffects(current,snapshot.viewer,snapshot.revision);
    let state=rest.state||snapshot.state,actions=snapshot.actions,independentActions=snapshot.independentActions;
    if(model){
      actions=Protocol.composeArray(localChoices.map(({command,disabled})=>({...pack.decorate(command,projection,state.players),...(disabled?{disabled:true}:{})})));
      independentActions=Protocol.composeArray(localIndependent.map(index=>actions[index]));
      if(snapshot.role==='table')state.tableActions=actions;
    }
    if(projection){
      // The restricted adapter removes hints for commands revoked by Authority.
      const scene=restricted&&pack.restrictedScene?pack.restrictedScene(projection,state.players):pack.scene(projection,state.players);
      state={...state,scene,...(direct?{sdkProjection:projection,modelProjection:projection}:{})};
    }
    const result=Protocol.composeRecord({...rest,...(model?{actions,independentActions}:{}),state:Protocol.composeRecord({...state,events}),events,cues,effects});
    return projection?Protocol.withProjection(result,projection):result;
  }
  function draft(frame,model,pack){const source=compact({...frame,state:{...frame.state,modelProjection:model}}),next=restore({...source,localDraft:true},(event,snapshot)=>pack.presentEvent(event,snapshot.state.players),pack);return (globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null)).withDraft(next,frame);}
  return Object.freeze({format,compact,restore,draft,soundCues,transferCues});
});
