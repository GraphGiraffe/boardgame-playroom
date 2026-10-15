// Portable rules contract. No engine registry, DOM, storage, clocks or ambient RNG.
(function (root, factory) {
  'use strict';
  const api = factory(root.PlayroomModelValues || require('./model-values.js'), root.PlayroomEvents || require('./events.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayroomModelRuntime = api;
})(globalThis, function (Values, Events) {
  'use strict';
  const {record,integer,identifier,ModelError,check,snapshot,canonical,command}=Values;
  const event=Events.validate, projectEvents=Events.project;

  class GameModel {
    #definition;
    constructor(definition) {
      check(record(definition) && definition.contractVersion === 1 && identifier(definition.id) &&
        integer(definition.minPlayers, 1, 32) && integer(definition.maxPlayers, definition.minPlayers, 32) &&
        ['create','validate','actions','reduce','project','result'].every(key => typeof definition[key] === 'function') &&
        (definition.bot === undefined || typeof definition.bot === 'function') &&
        (definition.observe === undefined || typeof definition.observe === 'function'), 'MODEL_INVALID');
      this.#definition = Object.freeze({...definition});
      this.id = definition.id; this.minPlayers = definition.minPlayers; this.maxPlayers = definition.maxPlayers;
      Object.freeze(this);
    }
    validate(position) {
      check(record(position) && integer(position.playerCount, this.minPlayers, this.maxPlayers) &&
        integer(position.turn, 0, position.playerCount - 1) && ['playing','finished'].includes(position.status) &&
        Array.isArray(position.winners) && new Set(position.winners).size === position.winners.length &&
        position.winners.every(player => integer(player, 0, position.playerCount - 1)) &&
        (position.status === 'finished' || position.winners.length === 0) && record(position.data), 'POSITION_INVALID');
      const value = snapshot(position);
      check(this.#definition.validate(value) === true, 'POSITION_INVALID');
      return true;
    }
    create(options) {
      const position = this.#definition.create(snapshot(options));
      this.validate(position);
      check(position.status === 'playing' && position.playerCount === options.playerCount, 'POSITION_INVALID');
      return snapshot(position);
    }
    #choices(position, actor) {
      this.validate(position);
      if (position.status !== 'playing' || !integer(actor, 0, position.playerCount - 1)) return Object.freeze([]);
      const choices = this.#definition.actions(snapshot(position), actor);
      check(Array.isArray(choices) && choices.every(choice => record(choice) &&
        ['public','private'].includes(choice.visibility)), 'ACTION_INVALID');
      const signatures = choices.map(choice => command(choice.command));
      check(new Set(signatures).size === signatures.length, 'ACTION_INVALID');
      return snapshot(choices);
    }
    legalActions(position, actor) {
      return snapshot(this.#choices(position, actor).map(choice => choice.command));
    }
    commandFor(position, actor, action, surface = 'player') {
      check(['player','table'].includes(surface), 'ACTION_INVALID');
      const signature = command(action);
      const found = this.#choices(position, actor).find(choice =>
        (surface !== 'table' || choice.visibility === 'public') && command(choice.command) === signature);
      check(found !== undefined, surface === 'table' ? 'TABLE_ACTION_UNAVAILABLE' : 'ACTION_UNAVAILABLE');
      return found.command;
    }
    apply(position, actor, action) {
      const legal = this.commandFor(position, actor, action);
      const result = this.#definition.reduce(snapshot(position), actor, legal);
      check(record(result) && record(result.position) && Array.isArray(result.events) &&
        result.position.playerCount === position.playerCount, 'TRANSITION_INVALID');
      this.validate(result.position);
      for (const value of result.events) event(value, position.playerCount);
      return snapshot(result);
    }
    project(position, viewer, events = []) {
      this.validate(position);
      if (!integer(viewer, 0, position.playerCount - 1)) viewer = -1;
      const data = this.#definition.project(snapshot(position), viewer);
      check(record(data), 'PROJECTION_INVALID');
      return snapshot({contractVersion:1, game:this.id, viewer, actor:viewer, audience:viewer < 0 ? 'public' : 'player',
        playerCount:position.playerCount, turn:position.turn, status:position.status,
        ...(position.preset!==undefined?{preset:position.preset}:{}),
        ...(position.revision!==undefined?{revision:position.revision}:{}),
        winners:position.winners, data,
        actions:this.legalActions(position, viewer), events:projectEvents(events, viewer, position.playerCount)});
    }
    projectTable(position, actor, events = []) {
      const projected = this.project(position, -1, events);
      if (!integer(actor, 0, position.playerCount - 1)) actor = -1;
      return snapshot({...projected, actor,
        actions:this.#choices(position, actor).filter(choice => choice.visibility === 'public').map(choice => choice.command)});
    }
    botAction(position, actor) {
      const projection = this.project(position, actor), actions = projection.actions;
      if (!actions.length) return null;
      const memory=snapshot(this.#definition.observe?.(snapshot(position),actor)||{});
      const chosen = this.#definition.bot?.(projection, actor, actions, memory) ?? actions[0];
      const found = actions.find(value => command(value) === command(chosen));
      check(found !== undefined, 'BOT_ACTION_INVALID');
      return found;
    }
    result(position) {
      this.validate(position);
      if (position.status !== 'finished') return null;
      const result = this.#definition.result(snapshot(position));
      check(record(result) && canonical(result.winners) === canonical(position.winners) &&
        Array.isArray(result.places) && result.places.length === position.playerCount &&
        result.places.every(place => integer(place, 1, position.playerCount)) &&
        Array.isArray(result.metrics) && result.metrics.length > 0 &&
        new Set(result.metrics.map(metric => metric.id)).size === result.metrics.length &&
        result.metrics.every(metric => identifier(metric.id) && Array.isArray(metric.values) &&
          metric.values.length === position.playerCount && metric.values.every(Number.isFinite)), 'RESULT_INVALID');
      return snapshot(result);
    }
  }
  return Object.freeze({GameModel, ModelError, projectEvents});
});
