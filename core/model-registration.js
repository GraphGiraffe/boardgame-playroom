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
  function adapt(engine, {definition, presentation, locales, version}) {
    const Runtime = root.PlayroomModelRuntime || require('./model-runtime.js');
    const model = new Runtime.GameModel(definition);
    const translator = new Localization.Translator({catalogs:locales});
    const text = reference => translator.format(reference);
    const metadata = presentation.metadata;
    const position = state => ({playerCount:state.players.length, turn:state.turn, status:state.status,
      winners:state.status === 'finished' ? state.winners || (state.winner === null ? [] : [state.winner]) : [],
      data:state.data,rng:state.rng});
    function decorated(action,projection) { return {...action, label:text(presentation.action(action,projection))}; }
    const Events=root.PlayroomEvents||require('./events.js');
    function presentEvent(value,players) {
      const description=presentation.event(value),params={...description.message.params};
      if(value.actor!==null)params.player=players[value.actor].name;
      const message={...description.message,params};
      return {...value,player:value.actor,text:text(message),message,kind:description.finish?'finish':description.kind||'action',
        ...(description.presentation?{presentation:description.presentation}:{}),
        ...(description.sound!==undefined?{sound:description.sound}:{})};
    }
    return {
      id:model.id, version, modelContractVersion:1, model, presentEvent,
      name:text(metadata.name), min:model.minPlayers, max:model.maxPlayers,
      description:text(metadata.description), scoreLabel:text(metadata.scoreLabel),
      presets:metadata.presets.map(preset => ({id:preset.id, label:text(preset.label)})),
      rules:metadata.rules.map(text),
      create(state, options) {
        const created = model.create({playerCount:state.players.length, preset:state.preset,
          firstPlayer:options.resolvedFirstPlayer ?? 0,rng:state.rng,openHands:state.openHands,options:engine.clone(options)});
        state.turn = created.turn; state.data = engine.clone(created.data);if(created.rng!==undefined)state.rng=created.rng;
      },
      validateState(state) { model.validate(position(state)); },
      legal(state, actor) { const projection=model.project(position(state),actor);return projection.actions.map(command=>decorated(command,projection)); },
      apply(state, actor, action) {
        // Match against commands, not a blacklist of UI fields. The old engine
        // passes its canonical decorated candidate; labels never reach rules.
        const legal = model.legalActions(position(state), actor).find(candidate =>
          Object.keys(candidate).every(key => JSON.stringify(candidate[key]) === JSON.stringify(action[key])));
        const changed = model.apply(position(state), actor, legal);
        state.turn=changed.position.turn;state.data=engine.clone(changed.position.data);if(changed.position.rng!==undefined)state.rng=changed.position.rng;
        if(changed.position.status==='finished'){
          const winners=changed.position.winners;
          engine.complete(state,winners.length>1?winners:winners[0]??null);
        }
        state.events=[...Events.append(state.events,changed.events,state.players.length,state.move)];
      },
      project(out, viewer, state) { out.modelProjection = model.project(position(state), viewer, state.events.filter(value=>value.visibility));out.data=engine.clone(out.modelProjection.data); },
      tableProjection(state, actor) { return model.projectTable(position(state), actor, state.events.filter(value=>value.visibility)); },
      tableCommand(state, actor, action) { return model.commandFor(position(state), actor, action, 'table'); },
      bot(state, actor) { const chosen = model.botAction(position(state), actor); return chosen ? decorated(chosen,model.project(position(state),actor)) : null; },
      result(state) {
        const summary = model.result(position(state));
        return {label:text(presentation.metric(summary.metrics[0].id)), values:[...summary.metrics[0].values]};
      }
    };
  }
  return Object.freeze({adapt});
});
