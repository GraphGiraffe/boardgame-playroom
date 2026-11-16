// Host SDK registration for portable game definitions and presentation catalogs.
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomModelRegistration = api;
})(globalThis, function (root) {
  'use strict';
  const Localization = root.PlayroomLocalization || require('../presentation/localization.js');
  root.PlayroomLocalization = Localization;
  const Scenes = root.PlayroomSceneContract || require('../presentation/scene-contract.js');
  function adapt(engine, {definition, model:suppliedModel, presentation, locales, version, stateVersion=1, rulebooks=null}) {
    const Runtime = root.PlayroomModelRuntime || require('./model-runtime.js');
    const Values = root.PlayroomModelValues || require('./model-values.js');
    const model = suppliedModel || new Runtime.GameModel(definition);
    const translator = new Localization.Translator({catalogs:locales});
    function bindParticipants(value,players){
      if(value?.kind==='player-list-reference'){
        if(!Array.isArray(value.indices)||value.indices.some(index=>!Number.isInteger(index)||!players[index]))throw Error('PLAYER_REFERENCE_INVALID');
        return new Intl.ListFormat(translator.locale,{type:'conjunction'}).format(value.indices.map(index=>players[index].name));
      }
      if(value?.kind==='player-reference'){
        if(!Number.isInteger(value.index)||!players[value.index])throw Error('PLAYER_REFERENCE_INVALID');
        return players[value.index].name;
      }
      if(Array.isArray(value))return value.map(item=>bindParticipants(item,players));
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,bindParticipants(item,players)]));
      return value;
    }
    const text = (reference,players=[]) => reference==null?'':typeof reference==='string'?reference:translator.format(bindParticipants(reference,players));
    const metadata = {name:definition.id,description:'',scoreLabel:'Очки',presets:[{id:'classic',label:'Классика'}],rules:[],...presentation.metadata};
    function translateRulebook(document) {
      return {sections:document.sections.map(section=>({
        title:section.text?text(section.text).split('\n')[0]:text(section.title),paragraphs:section.text?text(section.text).split('\n').slice(1):(section.paragraphs||[]).map(text),layout:section.layout,
        figures:(section.figures||[]).map(figure=>({...figure,caption:figure.caption?text(figure.caption):''})),
        ...(Array.isArray(section.blocks)?{blocks:section.blocks.map(block=>({type:block.type,
          ...(block.type==='paragraph'?{text:text(block.text)}:{}),
          ...(block.type==='list'?{ordered:!!block.ordered,items:(block.items||[]).map(text)}:{}),
          ...(block.type==='table'?{headers:(block.headers||[]).map(text),rows:(block.rows||[]).map(row=>row.map(text))}:{})
        }))}:{}),
        ...(section.note?{note:text(section.note)}:{})
      })),...(document.brief?{brief:translateRulebook(document.brief)}:{})};
    }

    const stateCache=new WeakMap(),recentStates=[];
    function cache(state){
      const History=root.PlayroomHistory||(typeof require==='function'?require('./history.js'):null);
      if(!History?.owns(state))return null;
      let value=stateCache.get(state);if(!value){value={positions:new Map()};stateCache.set(state,value);recentStates.push(state);if(recentStates.length>2)stateCache.delete(recentStates.shift());}return value;
    }
    function position(state){const entry=cache(state);if(entry?.position)return entry.position;const value=Values.snapshot({playerCount:state.players.length, turn:state.turn, status:state.status,
      winners:state.status === 'finished' ? state.winners || (state.winner === null ? [] : [state.winner]) : [],
      timeline:state.timeline,data:state.data,rng:state.rng,preset:state.preset,revision:state.move,openHands:state.openHands,...(state.clock!==undefined?{clock:state.clock}:{})});if(entry)entry.position=value;return value;}
    function projected(state,viewer,table=false,factsOnly=false){
      const entry=cache(state),key=(table?'table:':'player:')+viewer+':'+factsOnly;if(entry?.positions.has(key))return entry.positions.get(key);
      const events=entry?(entry.events??=(state.events.filter(value=>value.visibility))):state.events.filter(value=>value.visibility);
      const value=table?model.projectTable(position(state),viewer,events,{factsOnly:factsOnly&&!!definition.localChoices}):model.project(position(state),viewer,events,{factsOnly:factsOnly&&!!definition.localChoices});
      if(entry)entry.positions.set(key,value);return value;
    }
    function choices(state,actor,reactions=false){
      const entry=cache(state),key=(reactions?'reactions:':'legal:')+actor;
      if(entry?.positions.has(key))return entry.positions.get(key);
      const value=reactions?model.reactions(position(state),actor):model.legalActions(position(state),actor);if(entry)entry.positions.set(key,value);return value;
    }
    function decorated(action,projection,players) { const display=action.type==='batch'?action.actions.at(-1):action,choice=presentation.choice?.(display,projection)||{};return {...Object.fromEntries(Object.entries(choice).map(([key,value])=>[key,value?.key?text(value,players):value])),...action,label:text(presentation.action({...choice,...display},projection),players)}; }
    const Events=root.PlayroomEvents||require('./events.js');
    function presentScene(projection,players,value=presentation.scene(projection)){const scene=Scenes.validate(value,projection.playerCount);if(Array.isArray(projection.actions))Scenes.commands(scene,projection);const order=model.turnOrder(projection);return {...scene,nextPlayer:order?.next??null,audience:projection.audience,viewer:projection.viewer,...(projection.decisionWindow?{decisionWindow:projection.decisionWindow}:{}),...(!scene.round&&projection.timeline?.round?{round:{number:projection.timeline.round,limit:null,starts:projection.timeline.roundStarts}}:{}),players:(scene.players||[]).map(person=>({...person,...(person.countLabel?{countLabel:text(person.countLabel,players)}:{}),metrics:(person.metrics||[]).map(metric=>({...metric,label:text(metric.label,players)})),...(person.indicators?{indicators:person.indicators.map(indicator=>({...indicator,label:text(indicator.label,players)}))}:{}),...(person.team?{team:{...person.team,label:text(person.team.label,players)}}:{})}))};}
    function presentEventScenes(projection,players,events) {
      if(!presentation.eventScenes)return events;
      const frames=presentation.eventScenes(projection);
      if(!Array.isArray(frames))throw Error('EVENT_SCENES_INVALID');
      const allowed=new Map(projection.events.filter(event=>event.revision===projection.revision).map((event,index)=>[event.id,index]));
      let previous=-1;
      const scenes=new Map(frames.map(frame=>{
        if(!frame||!allowed.has(frame.eventId)||allowed.get(frame.eventId)<=previous)throw Error('EVENT_SCENES_INVALID');
        previous=allowed.get(frame.eventId);
        const scene=Scenes.validate(frame.scene,projection.playerCount);
        if(scene.interactions?.length)throw Error('EVENT_SCENE_INTERACTIONS');
        return [frame.eventId,presentScene(projection,players,scene)];
      }));
      return events.map(event=>scenes.has(event.id)?{...event,scene:scenes.get(event.id)}:event);
    }
    function presentEvent(value,players) {
      const description=Scenes.event(presentation.event(value),players.length),params={...description.message.params};
      if(value.actor!==null)params.player=players[value.actor].name;
      const message=typeof description.message==='string'?description.message:{...description.message,params};
      return {...value,player:value.actor,text:text(message,players),message:bindParticipants(message,players),kind:description.finish?'finish':description.kind||'action',
        ...(description.presentation?{presentation:description.presentation}:{}),
        ...(description.transfer?{transfer:description.transfer}:{}),
        ...(description.feedback?{feedback:description.feedback}:{}),
        ...(description.reveal?{reveal:{...description.reveal,...(description.reveal.title?{title:text(description.reveal.title,players)}:{})}}:{}),
        ...(description.speech?{speech:{...description.speech,...(description.speech.text?{text:text(description.speech.text,players)}:{})}}:{}),
        ...(description.sound!==undefined?{sound:description.sound}:{}),
        ...(description.target!==undefined?{target:description.target}:{}),
        ...(description.notice?{notice:{...description.notice,title:text(description.notice.title,players),detail:text(description.notice.detail,players)}}:{})};
    }
    return {
      id:model.id, version, stateVersion, modelContractVersion:1, model, localProjection:projection=>model.localProjection(projection),localCommands:projection=>model.localCommands(projection),draftSpec:projection=>model.draftSpec(projection),draftProjection:(projection,actions)=>model.draftProjection(projection,actions),isIntent:action=>Values.canonical(model.intent(action))===Values.canonical(action),localReaction:(projection,action)=>model.localReaction(projection,action),presentEvent, scene:presentScene, eventScenes:presentEventScenes, decorate:decorated,
      storageState(state){return definition.storageState?{...state,data:definition.storageState(engine.clone(state.data))}:state;},
      checkpoint(before,next,actor,command){
        if(next.status==='finished'||(next.events.at(-1)?.id||0)!==(before.events.at(-1)?.id||0))return true;
        if(definition.checkpoint){const value=definition.checkpoint(before.data,next.data,actor,command);if(typeof value!=='boolean')throw Error('CHECKPOINT_INVALID');return value;}
        // Existing portable packs already declare simultaneous decision windows.
        // An unready participant's edit is a draft; becoming ready is the checkpoint.
        const window=state=>definition.decisionWindow?.({playerCount:state.players.length,turn:state.turn,status:state.status,winners:state.winners||[],timeline:state.timeline,data:state.data,rng:state.rng,preset:state.preset,revision:state.move,openHands:state.openHands,...(state.clock!==undefined?{clock:state.clock}:{})});
        const a=window(before),b=window(next);
        return !(a&&b&&a.id===b.id&&a.participants.length>1&&a.participants.includes(actor)&&!a.ready.includes(actor)&&!b.ready.includes(actor)&&a.versions?.[actor]!==b.versions?.[actor]);
      },
      botSettings:{strategies:(metadata.botSettings?.strategies||[]).map(p=>({id:p.id,label:text(p.label),description:text(p.description)})),defaultDifficulty:'medium'},
      name:text(metadata.name), min:model.minPlayers, max:model.maxPlayers,
      description:text(metadata.description), scoreLabel:text(metadata.scoreLabel),
      presets:metadata.presets.map(preset => ({id:preset.id, label:text(preset.label),...(preset.description?{description:text(preset.description)}:{})})),
      rules:metadata.rules.map(text),
      ...(rulebooks?.[translator.locale]?{rulebook:engine.clone(rulebooks[translator.locale])}:metadata.rulebook?{rulebook:translateRulebook(metadata.rulebook)}:{}),
      create(state, options) {
        const initial = model.start({playerCount:state.players.length, preset:state.preset,
          firstPlayer:options.resolvedFirstPlayer ?? 0,now:options.now??0,rng:state.rng,openHands:state.openHands,options:engine.clone(options)});
        const created=initial.position;
        state.timeline=engine.clone(created.timeline);state.turn = created.turn; state.data = engine.clone(created.data);if(created.rng!==undefined)state.rng=created.rng;if(created.clock!==undefined)state.clock=created.clock;
        const scores=model.score(created);if(scores)scores.forEach((value,index)=>{state.players[index].score=value;});
        if(created.status==='finished')engine.complete(state,created.winners.length>1?created.winners:created.winners[0]??null,scores?0:1);
        state.events=[...Events.append(state.events,initial.events,state.players.length,state.move)];
      },
      validateState(state) { model.validate(position(state)); },
      resolveAction(state,actor,action) {
        const current=position(state),input=model.reactionControl(current,actor,action)?.command||action;
        if(input?.type==='batch'){try{return decorated(model.batch(current,actor,input),projected(state,actor),state.players);}catch{return null;}}
        if(definition.inputs){try{return model.commandFor(current,actor,input);}catch{}}
        const command=model.availableActions(current,actor).find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(input?.[key])));
        return command?decorated(command,projected(state,actor),state.players):null;
      },
      inputs(state,actor){return model.inputChoices(position(state),actor);},
      advance(state,now){const current=position(state),changed=model.advance(current,now);if(changed.position.revision===current.revision)return state;return this.installTransition(state,changed);},
      installTransition(state,changed){const next={...engine.clone({...state,data:null,events:[]}),data:changed.position.data,move:changed.position.revision,events:[...state.events]};next.timeline=engine.clone(changed.position.timeline);next.turn=changed.position.turn;if(changed.position.rng!==undefined)next.rng=changed.position.rng;if(changed.position.clock!==undefined)next.clock=changed.position.clock;const scores=model.score(changed.position);if(scores)scores.forEach((value,index)=>{next.players[index].score=value;});if(changed.position.status==='finished')engine.complete(next,changed.position.winners.length>1?changed.position.winners:changed.position.winners[0]??null,scores?0:1);next.events=[...Events.append(next.events,changed.events,state.players.length,next.move)];return next;},
      commands(state,actor,reactions=false){return choices(state,actor,reactions);},
      legal(state, actor) { const current=position(state),projection=projected(state,actor);return choices(state,actor).map(command=>decorated(command,projection,state.players)); },
      reactions(state,actor) { if(!definition.reactions)return [];const current=position(state),projection=projected(state,actor);return choices(state,actor,true).map(command=>decorated(command,projection,state.players)); },
      decisionWindow(state) { if(!definition.decisionWindow)return null;return model.decisionWindow(position(state)); },
      reactionWindows(state) { if(!definition.reactionWindows)return [];return model.reactionWindows(position(state)); },
      reactionControl(state,actor,action) { if(!definition.reactionControl)return null;return model.reactionControl(position(state),actor,action); },
      botReactionDelay(state,actor) { if(!definition.botReactionDelay)return null;return model.botReactionDelay(position(state),actor,state.players[actor]?.botSettings); },
      botReaction(state,actor) { if(!definition.botReaction)return null;const current=position(state),command=model.botReaction(current,actor,state.players[actor]?.botSettings);return command?decorated(command,projected(state,actor),state.players):null; },
      apply(state, actor, action) {
        // Match against commands, not a blacklist of UI fields. The old engine
        // passes its canonical decorated candidate; labels never reach rules.
        const legal = definition.inputs?(model.availableActions({...position(state),revision:Math.max(0,state.move-1)},actor).find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(action[key])))||model.commandFor({...position(state),revision:Math.max(0,state.move-1)},actor,action)):action.type==='batch'?model.batch({...position(state),revision:Math.max(0,state.move-1)},actor,{type:'batch',actions:action.actions}):model.availableActions(position(state), actor).find(candidate =>
          Object.keys(candidate).every(key => JSON.stringify(candidate[key]) === JSON.stringify(action[key])));
        const changed = model.apply({...position(state),revision:Math.max(0,state.move-1)}, actor, legal,{now:state.clock??0});
        state.timeline=engine.clone(changed.position.timeline);state.turn=changed.position.turn;state.data=engine.clone(changed.position.data);if(changed.position.rng!==undefined)state.rng=changed.position.rng;if(changed.position.clock!==undefined)state.clock=changed.position.clock;
        const scores=model.score(changed.position);if(scores)scores.forEach((value,index)=>{state.players[index].score=value;});
        if(changed.position.status==='finished'){
          const winners=changed.position.winners;
          engine.complete(state,winners.length>1?winners:winners[0]??null,scores?0:1);
        }
        state.events=[...Events.append(state.events,changed.events,state.players.length,state.move)];
      },
      project(out, viewer, state, options={}) { out.modelProjection = projected(state,viewer,false,!!options.rawEvents);if(!options.rawEvents){out.data=engine.clone(out.modelProjection.data);out.scene=presentScene(out.modelProjection,state.players);out.events=presentEventScenes(out.modelProjection,state.players,out.events);} },
      tableProjection(state, actor, options={}) { return projected(state,actor,true,!!options.rawEvents); },
      tableChoices(state, actor) { const projection=projected(state,actor,true);return projection.actions.map(command=>presentation.choice?decorated(command,projection,state.players):command); },
      tableCommand(state, actor, action) { if(action?.type==='batch')return model.batch(position(state),actor,action,'table');const command=model.projectTable(position(state),actor).actions.find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(action?.[key])));return model.commandFor(position(state), actor, command||action, 'table'); },
      bot(state, actor) { const chosen = model.botAction(position(state), actor, {...state.players[actor]?.botSettings,enabled:!!state.players[actor]?.bot}); return chosen ? decorated(chosen,model.project(position(state),actor),state.players) : null; },
      result(state) {
        const summary = model.result(position(state));
        const metrics=summary.metrics.map(metric=>({...metric,label:text(presentation.metric?.(metric.id)||metadata.scoreLabel||metric.id)}));
        return {label:metrics[0].label,metricId:metrics[0].id,values:[...metrics[0].values],order:metrics[0].order||'desc',...(summary.playerOrder?{playerOrder:summary.playerOrder}:{}),places:summary.places,exits:summary.exits||[],lastPlayers:summary.lastPlayers||[],metrics,
          ...(metrics[1]?{detailLabel:metrics[1].label,detailMetricId:metrics[1].id,details:metrics[1].values}:{})};
      }
    };
  }
  return Object.freeze({adapt});
});
