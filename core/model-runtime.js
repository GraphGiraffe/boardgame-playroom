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
  function validTimeline(value,revision,hasRounds){
    const sequence=(starts,count)=>Array.isArray(starts)&&starts.length===count&&starts[0]===(value.playStart??0)&&starts.every((n,i)=>integer(n,0,revision)&&(!i||n>starts[i-1]));
    if(!record(value)||(value.playStart!==undefined&&!integer(value.playStart,0,revision))||(value.preparing!==undefined&&typeof value.preparing!=='boolean')||!integer(value.turn,1,Number.MAX_SAFE_INTEGER)||!sequence(value.starts,value.turn))return false;
    if(value.round!==undefined||value.roundStarts!==undefined)return hasRounds&&integer(value.round,1,Number.MAX_SAFE_INTEGER)&&sequence(value.roundStarts,value.round);
    return !hasRounds;
  }


  class GameModel {
    #definition;
    constructor(definition) {
      check(record(definition) && definition.contractVersion === 1 && identifier(definition.id) &&
        integer(definition.minPlayers, 1, 32) && integer(definition.maxPlayers, definition.minPlayers, 32) &&
        ['create','validate','actions','reduce','project','result'].every(key => typeof definition[key] === 'function') &&
        (definition.bot === undefined || typeof definition.bot === 'function') &&
        (definition.observe === undefined || typeof definition.observe === 'function') &&
        (definition.score === undefined || typeof definition.score === 'function') &&
        (definition.rounds===undefined||typeof definition.rounds==='boolean')&&
        ['preparing','reactions','reactionControl','reactionWindows','botReaction','decisionWindow','botContext'].every(key=>
          definition[key]===undefined||typeof definition[key]==='function'), 'MODEL_INVALID');
      this.#definition = Object.freeze({...definition});
      this.id = definition.id; this.minPlayers = definition.minPlayers; this.maxPlayers = definition.maxPlayers;
      Object.freeze(this);
    }
    validate(position) {
      check(record(position) && integer(position.playerCount, this.minPlayers, this.maxPlayers) &&
        integer(position.turn, 0, position.playerCount - 1) && ['playing','finished'].includes(position.status) &&
        Array.isArray(position.winners) && new Set(position.winners).size === position.winners.length &&
        position.winners.every(player => integer(player, 0, position.playerCount - 1)) &&
        (position.status === 'finished' || position.winners.length === 0) && record(position.data) &&
        (position.revision===undefined||integer(position.revision,0,Number.MAX_SAFE_INTEGER))&&
        (position.timeline===undefined||validTimeline(position.timeline,position.revision??0,this.#definition.rounds===true)), 'POSITION_INVALID');
      const value = snapshot(position);
      check(this.#definition.validate(value) === true, 'POSITION_INVALID');
      return true;
    }
    create(options) {
      return this.start(options).position;
    }
    start(options) {
      const created=this.#definition.create(snapshot(options));
      check(record(created),'POSITION_INVALID');
      const initial=created.position?created:{position:created,events:[]};
      const transition={...initial,position:{...initial.position,revision:initial.position.revision??0,timeline:{turn:1,starts:[0],...(this.#definition.preparing?{preparing:!!this.#definition.preparing(initial.position),playStart:0}:{}),...(this.#definition.rounds?{round:1,roundStarts:[0]}:{})}}};
      this.validate(transition.position);
      check(transition.position.playerCount===options.playerCount&&Array.isArray(transition.events),'POSITION_INVALID');
      for(const value of transition.events)event(value,options.playerCount);
      return snapshot(transition);
    }
    score(position) {
      this.validate(position);
      if(!this.#definition.score)return null;
      const values=this.#definition.score(snapshot(position));
      check(Array.isArray(values)&&values.length===position.playerCount&&values.every(value=>integer(value,0,Number.MAX_SAFE_INTEGER)),'SCORE_INVALID');
      return snapshot(values);
    }
    #choices(position, actor, kind = 'actions') {
      this.validate(position);
      if (position.status !== 'playing' || !integer(actor, 0, position.playerCount - 1)) return Object.freeze([]);
      const choices = this.#definition[kind]?.(snapshot(position), actor) || [];
      check(Array.isArray(choices) && choices.every(choice => record(choice) &&
        ['public','private'].includes(choice.visibility)), 'ACTION_INVALID');
      const signatures = choices.map(choice => command(choice.command));
      check(new Set(signatures).size === signatures.length, 'ACTION_INVALID');
      return snapshot(choices);
    }
    legalActions(position, actor) {
      return snapshot(this.#choices(position, actor).map(choice => choice.command));
    }
    reactions(position, actor) {
      return snapshot(this.#choices(position,actor,'reactions').map(choice=>choice.command));
    }
    availableActions(position, actor) {
      return snapshot([...this.legalActions(position,actor),...this.reactions(position,actor)]);
    }
    reactionControl(position, actor, action) {
      if(!this.#definition.reactionControl)return null;
      this.validate(position);
      if(position.status!=='playing'||!integer(actor,0,position.playerCount-1))return null;
      const value=this.#definition.reactionControl?.(snapshot(position),actor,snapshot(action))??null;
      if(value===null)return null;
      check(record(value)&&['answer','challenge','advance','independent'].includes(value.kind)&&
        (value.ignore===undefined||typeof value.ignore==='boolean')&&
        (value.independent===undefined||typeof value.independent==='boolean')&&
        (value.episode===undefined||integer(value.episode,0,position.revision??0)), 'REACTION_INVALID');
      if(value.command!==undefined)command(value.command);
      return snapshot(value);
    }
    reactionWindows(position) {
      this.validate(position);
      const windows=this.#definition.reactionWindows?.(snapshot(position))||[];
      check(Array.isArray(windows)&&windows.length<=position.playerCount&&new Set(windows.map(value=>value.id)).size===windows.length&&windows.every(value=>
        record(value)&&typeof value.id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id)&&
        integer(value.owner,0,position.playerCount-1)&&integer(value.revision,0,position.revision??0)&&
        integer(value.humanMs,0,60000)&&integer(value.botMs,value.humanMs,60000)&&integer(value.fallbackMs,0,60000)), 'REACTION_WINDOW_INVALID');
      return snapshot(windows);
    }
    decisionWindow(position) {
      this.validate(position);
      const value=this.#definition.decisionWindow?.(snapshot(position))??null;
      if(value===null)return null;
      check(record(value)&&typeof value.id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id)&&Array.isArray(value.participants)&&value.participants.length>0&&new Set(value.participants).size===value.participants.length&&value.participants.every(i=>integer(i,0,position.playerCount-1))&&Array.isArray(value.ready)&&new Set(value.ready).size===value.ready.length&&value.ready.every(i=>value.participants.includes(i))&&record(value.versions)&&value.participants.every(i=>integer(value.versions[i],0,Number.MAX_SAFE_INTEGER)), 'DECISION_WINDOW_INVALID');
      return snapshot({id:value.id,participants:value.participants,ready:value.ready,versions:Object.fromEntries(value.participants.map(i=>[i,value.versions[i]]))});
    }
    commandFor(position, actor, action, surface = 'player') {
      check(['player','table'].includes(surface), 'ACTION_INVALID');
      const signature = command(action);
      const found = [...this.#choices(position, actor),...this.#choices(position,actor,'reactions')].find(choice =>
        (surface !== 'table' || choice.visibility === 'public') && command(choice.command) === signature);
      check(found !== undefined, surface === 'table' ? 'TABLE_ACTION_UNAVAILABLE' : 'ACTION_UNAVAILABLE');
      return found.command;
    }
    apply(position, actor, action) {
      if(this.reactionControl(position,actor,action)?.ignore)return snapshot({position,events:[]});
      const legal = this.commandFor(position, actor, action);
      const result = this.#definition.reduce(snapshot(position), actor, legal);
      check(record(result) && record(result.position) && Array.isArray(result.events) &&
        result.position.playerCount === position.playerCount, 'TRANSITION_INVALID');
      check(!result.roundEnded||this.#definition.rounds===true,'ROUND_NOT_DECLARED');
      check((result.turnEnded===undefined||typeof result.turnEnded==='boolean')&&(result.roundEnded===undefined||typeof result.roundEnded==='boolean')&&(!result.roundEnded||result.turnEnded),'TRANSITION_INVALID');
      const revision=(position.revision??0)+1,timeline=JSON.parse(JSON.stringify(position.timeline||{turn:1,starts:[0]}));
      const wasPreparing=!!this.#definition.preparing?.(position),preparing=!!this.#definition.preparing?.(result.position);
      if(this.#definition.preparing){timeline.preparing=preparing;if(wasPreparing){timeline.turn=1;timeline.starts=[revision];timeline.playStart=revision;if(timeline.round){timeline.round=1;timeline.roundStarts=[revision];}}}
      if(!wasPreparing&&!preparing&&result.turnEnded&&result.position.status==='playing'){timeline.turn++;timeline.starts.push(revision);}
      if(!wasPreparing&&!preparing&&result.roundEnded&&result.position.status==='playing'&&timeline.round){timeline.round++;timeline.roundStarts.push(revision);}
      const next={...result,position:{...result.position,revision,timeline}};
      this.validate(next.position);
      for (const value of result.events) event(value, position.playerCount);
      return snapshot(next);
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
        decisionWindow:this.decisionWindow(position),winners:position.winners,timeline:position.timeline||{turn:1,starts:[0]}, data,
        actions:this.availableActions(position, viewer), events:projectEvents(events, viewer, position.playerCount)});
    }
    projectTable(position, actor, events = []) {
      const projected = this.project(position, -1, events);
      if (!integer(actor, 0, position.playerCount - 1)) actor = -1;
      return snapshot({...projected, actor,
        actions:[...this.#choices(position, actor),...this.#choices(position,actor,'reactions')].filter(choice => choice.visibility === 'public').map(choice => choice.command)});
    }
    botAction(position, actor) {
      const projection = this.project(position, actor), actions = this.legalActions(position,actor);
      if (!actions.length) return null;
      const memory=snapshot(this.#definition.observe?.(snapshot(position),actor)||{});
      const chosen = this.#definition.bot?.(projection, actor, actions, memory, snapshot(this.#definition.botContext?.(snapshot(position),actor)||{})) ?? actions[0];
      const found = actions.find(value => command(value) === command(chosen));
      check(found !== undefined, 'BOT_ACTION_INVALID');
      return found;
    }
    botReaction(position,actor) {
      const actions=this.reactions(position,actor);
      if(!actions.length||!this.#definition.botReaction)return null;
      const memory=snapshot(this.#definition.observe?.(snapshot(position),actor)||{});
      const chosen=this.#definition.botReaction(this.project(position,actor),actor,actions,memory);
      if(chosen==null)return null;
      const found=actions.find(value=>command(value)===command(chosen));
      check(found!==undefined,'BOT_REACTION_INVALID');
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
      check(result.lastPlayers===undefined||Array.isArray(result.lastPlayers)&&new Set(result.lastPlayers).size===result.lastPlayers.length&&result.lastPlayers.every(player=>integer(player,0,position.playerCount-1)&&!result.winners.includes(player)),'RESULT_INVALID');
      check(result.exits===undefined||Array.isArray(result.exits)&&new Set(result.exits.map(exit=>exit.player)).size===result.exits.length&&result.exits.every(exit=>record(exit)&&integer(exit.player,0,position.playerCount-1)&&['cards','domino','finished'].includes(exit.kind)&&(integer(exit.round,1,Number.MAX_SAFE_INTEGER)||integer(exit.turn,1,Number.MAX_SAFE_INTEGER))),'RESULT_INVALID');
      return snapshot(result);
    }
  }
  return Object.freeze({GameModel, ModelError, projectEvents});
});
