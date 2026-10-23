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
  function adapt(engine, {definition, presentation, locales, version, stateVersion=1}) {
    const Runtime = root.PlayroomModelRuntime || require('./model-runtime.js');
    const model = new Runtime.GameModel(definition);
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
    const text = (reference,players=[]) => translator.format(bindParticipants(reference,players));
    const metadata = presentation.metadata;
    const position = state => ({playerCount:state.players.length, turn:state.turn, status:state.status,
      winners:state.status === 'finished' ? state.winners || (state.winner === null ? [] : [state.winner]) : [],
      timeline:state.timeline,data:state.data,rng:state.rng,preset:state.preset,revision:state.move,openHands:state.openHands});
    function decorated(action,projection,players) { const choice=presentation.choice?.(action,projection)||{};return {...Object.fromEntries(Object.entries(choice).map(([key,value])=>[key,value?.key?text(value,players):value])),...action,label:text(presentation.action(action,projection),players)}; }
    const Events=root.PlayroomEvents||require('./events.js');
    function presentScene(projection,players){const scene=presentation.scene(projection);return {...scene,...(!scene.round&&projection.timeline?.round?{round:{number:projection.timeline.round,limit:null,starts:projection.timeline.roundStarts}}:{}),players:(scene.players||[]).map(person=>({...person,...(person.countLabel?{countLabel:text(person.countLabel,players)}:{}),metrics:(person.metrics||[]).map(metric=>({...metric,label:text(metric.label,players)})),...(person.indicators?{indicators:person.indicators.map(indicator=>({...indicator,label:text(indicator.label,players)}))}:{}),...(person.team?{team:{...person.team,label:text(person.team.label,players)}}:{})}))};}
    function presentEvent(value,players) {
      const description=presentation.event(value),params={...description.message.params};
      if(value.actor!==null)params.player=players[value.actor].name;
      const message={...description.message,params};
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
      id:model.id, version, stateVersion, modelContractVersion:1, model, presentEvent, scene:presentScene,
      ...(metadata.botSettings?{botSettings:{strategies:metadata.botSettings.strategies.map(p=>({id:p.id,label:text(p.label),description:text(p.description)})),defaultErrorRate:10}}:{}),
      name:text(metadata.name), min:model.minPlayers, max:model.maxPlayers,
      description:text(metadata.description), scoreLabel:text(metadata.scoreLabel),
      presets:metadata.presets.map(preset => ({id:preset.id, label:text(preset.label),...(preset.description?{description:text(preset.description)}:{})})),
      rules:metadata.rules.map(text),
      create(state, options) {
        const initial = model.start({playerCount:state.players.length, preset:state.preset,
          firstPlayer:options.resolvedFirstPlayer ?? 0,rng:state.rng,openHands:state.openHands,options:engine.clone(options)});
        const created=initial.position;
        state.timeline=engine.clone(created.timeline);state.turn = created.turn; state.data = engine.clone(created.data);if(created.rng!==undefined)state.rng=created.rng;
        const scores=model.score(created);if(scores)scores.forEach((value,index)=>{state.players[index].score=value;});
        if(created.status==='finished')engine.complete(state,created.winners.length>1?created.winners:created.winners[0]??null,scores?0:1);
        state.events=[...Events.append(state.events,initial.events,state.players.length,state.move)];
      },
      validateState(state) { model.validate(position(state)); },
      resolveAction(state,actor,action) {
        const input=model.reactionControl(position(state),actor,action)?.command||action;
        const command=model.availableActions(position(state),actor).find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(input?.[key])));
        return command?decorated(command,model.project(position(state),actor),state.players):null;
      },
      legal(state, actor) { const projection=model.project(position(state),actor);return model.legalActions(position(state),actor).map(command=>decorated(command,projection,state.players)); },
      reactions(state,actor) { const projection=model.project(position(state),actor);return model.reactions(position(state),actor).map(command=>decorated(command,projection,state.players)); },
      decisionWindow(state) { return model.decisionWindow(position(state)); },
      reactionWindows(state) { return model.reactionWindows(position(state)).filter(window=>!state.players[window.owner].bot); },
      reactionControl(state,actor,action) { return model.reactionControl(position(state),actor,action); },
      botReaction(state,actor) { const command=model.botReaction(position(state),actor);return command?decorated(command,model.project(position(state),actor),state.players):null; },
      apply(state, actor, action) {
        // Match against commands, not a blacklist of UI fields. The old engine
        // passes its canonical decorated candidate; labels never reach rules.
        const legal = model.availableActions(position(state), actor).find(candidate =>
          Object.keys(candidate).every(key => JSON.stringify(candidate[key]) === JSON.stringify(action[key])));
        const changed = model.apply({...position(state),revision:Math.max(0,state.move-1)}, actor, legal);
        state.timeline=engine.clone(changed.position.timeline);state.turn=changed.position.turn;state.data=engine.clone(changed.position.data);if(changed.position.rng!==undefined)state.rng=changed.position.rng;
        const scores=model.score(changed.position);if(scores)scores.forEach((value,index)=>{state.players[index].score=value;});
        if(changed.position.status==='finished'){
          const winners=changed.position.winners;
          engine.complete(state,winners.length>1?winners:winners[0]??null,scores?0:1);
        }
        state.events=[...Events.append(state.events,changed.events,state.players.length,state.move)];
      },
      project(out, viewer, state) { out.modelProjection = model.project(position(state), viewer, state.events.filter(value=>value.visibility));out.data=engine.clone(out.modelProjection.data);out.scene=presentScene(out.modelProjection,state.players); },
      tableProjection(state, actor) { return model.projectTable(position(state),actor,state.events.filter(value=>value.visibility)); },
      tableChoices(state, actor) { const projection=model.projectTable(position(state),actor);return projection.actions.map(command=>presentation.choice?decorated(command,projection,state.players):command); },
      tableCommand(state, actor, action) { const command=model.projectTable(position(state),actor).actions.find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(action?.[key])));return model.commandFor(position(state), actor, command||action, 'table'); },
      bot(state, actor) { const chosen = model.botAction(position(state), actor); return chosen ? decorated(chosen,model.project(position(state),actor),state.players) : null; },
      result(state) {
        const summary = model.result(position(state));
        const metrics=summary.metrics.map(metric=>({...metric,label:text(presentation.metric(metric.id))}));
        return {label:metrics[0].label,metricId:metrics[0].id,values:[...metrics[0].values],order:metrics[0].order||'desc',places:summary.places,metrics,
          ...(metrics[1]?{detailLabel:metrics[1].label,detailMetricId:metrics[1].id,details:metrics[1].values}:{})};
      }
    };
  }
  return Object.freeze({adapt});
});
