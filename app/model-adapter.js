// Temporary integration with the existing Session envelope; removed at the 0.18 cutover.
(function (root, factory) {
  'use strict';
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomModelAdapter = api;
})(globalThis, function (root) {
  'use strict';
  const Localization = root.PlayroomLocalization || require('../presentation/localization.js');
  root.PlayroomLocalization = Localization;
  function adapt(engine, {definition, presentation, locales, version}) {
    const Runtime = root.PlayroomModelRuntime || require('../core/model-runtime.js');
    const model = new Runtime.GameModel(definition);
    const translator = new Localization.Translator({catalogs:locales});
    const text = reference => translator.format(reference);
    const metadata = presentation.metadata;
    const position = state => ({playerCount:state.players.length, turn:state.turn, status:state.status,
      winners:state.status === 'finished' ? state.winners || (state.winner === null ? [] : [state.winner]) : [],
      data:state.data});
    function decorated(action) { return {...action, label:text(presentation.action(action))}; }
    function publish(state, value, winners) {
      // Canonical events have explicit visibility; this bridge supports public
      // models only, until Session owns canonical event IDs and projection.
      if (value.visibility.kind !== 'public') throw new Runtime.ModelError('ADAPTER_PRIVATE_EVENT_UNSUPPORTED');
      const allowed = Runtime.projectEvents([value], -1, state.players.length)[0];
      const description = presentation.event(allowed);
      const params = {...description.message.params};
      if (allowed.actor !== null) params.player = state.players[allowed.actor].name;
      const message = {...description.message, params};
      if (description.finish) {
        engine.finish(state, winners.length > 1 ? winners : winners[0] ?? null, text(message));
        Object.assign(state.events.at(-1), {message, modelEvent:allowed});
      } else engine.event(state, text(message), allowed.actor, description.kind,
        {message, modelEvent:allowed, ...(description.presentation ? {presentation:description.presentation} : {})});
    }
    return {
      id:model.id, version, modelContractVersion:1, model,
      name:text(metadata.name), min:model.minPlayers, max:model.maxPlayers,
      description:text(metadata.description), scoreLabel:text(metadata.scoreLabel),
      presets:metadata.presets.map(preset => ({id:preset.id, label:text(preset.label)})),
      rules:metadata.rules.map(text),
      create(state, options) {
        const created = model.create({playerCount:state.players.length, preset:state.preset,
          firstPlayer:options.resolvedFirstPlayer ?? 0});
        state.turn = created.turn; state.data = engine.clone(created.data);
      },
      validateState(state) { model.validate(position(state)); },
      legal(state, actor) { return model.legalActions(position(state), actor).map(decorated); },
      apply(state, actor, action) {
        // Match against commands, not a blacklist of UI fields. The old engine
        // passes its canonical decorated candidate; labels never reach rules.
        const legal = model.legalActions(position(state), actor).find(candidate =>
          Object.keys(candidate).every(key => JSON.stringify(candidate[key]) === JSON.stringify(action[key])));
        const changed = model.apply(position(state), actor, legal);
        if (changed.events.some(value => value.visibility.kind !== 'public')) {
          throw new Runtime.ModelError('ADAPTER_PRIVATE_EVENT_UNSUPPORTED');
        }
        state.turn = changed.position.turn; state.data = engine.clone(changed.position.data);
        const finish = changed.position.status === 'finished';
        if (finish && changed.events.filter(value => presentation.event(value).finish).length !== 1) {
          throw new Runtime.ModelError('ADAPTER_OUTCOME_EVENT_INVALID');
        }
        for (const value of changed.events) publish(state, value, changed.position.winners);
        if (state.status !== changed.position.status) throw new Runtime.ModelError('ADAPTER_STATUS_INVALID');
      },
      project(out, viewer, state) { out.modelProjection = model.project(position(state), viewer); },
      tableProjection(state, actor) { return model.projectTable(position(state), actor); },
      tableCommand(state, actor, action) { return model.commandFor(position(state), actor, action, 'table'); },
      bot(state, actor) { const chosen = model.botAction(position(state), actor); return chosen ? decorated(chosen) : null; },
      result(state) {
        const summary = model.result(position(state));
        return {label:text(presentation.metric(summary.metrics[0].id)), values:[...summary.metrics[0].values]};
      }
    };
  }
  return Object.freeze({adapt});
});
