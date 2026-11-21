// Portable rules contract. No engine registry, DOM, storage, clocks or ambient RNG.
(function (root, factory) {
  'use strict';
  const api = factory(root.PlayroomModelValues || require('./model-values.js'), root.PlayroomEvents || require('./events.js'));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayroomModelRuntime = api;
})(globalThis, function (Values, Events) {
  'use strict';
  const {record,integer,identifier,ModelError,check,snapshot,composeValue,composeRecord,composeArray,canonical,command}=Values;
  const Difficulty=globalThis.PlayroomBotDifficulty||require('./bot-difficulty.js');
  const Inputs=globalThis.PlayroomModelInputs||(typeof require==='function'?require('./model-inputs.js'):null);
  const event=Events.validate, projectEvents=Events.project;
  function validTimeline(value,revision,hasRounds){
    const sequence=(starts,count)=>Array.isArray(starts)&&starts.length===count&&starts[0]===(value.playStart??0)&&starts.every((n,i)=>integer(n,0,revision)&&(!i||n>starts[i-1]));
    if(!record(value)||(value.playStart!==undefined&&!integer(value.playStart,0,revision))||(value.preparing!==undefined&&typeof value.preparing!=='boolean')||!integer(value.turn,1,Number.MAX_SAFE_INTEGER)||!sequence(value.starts,value.turn))return false;
    if(value.round!==undefined||value.roundStarts!==undefined)return hasRounds&&integer(value.round,1,Number.MAX_SAFE_INTEGER)&&sequence(value.roundStarts,value.round);
    return !hasRounds;
  }


  class GameModel {
    #definition;
    #validated=new WeakSet();
    constructor(definition) {
      check(record(definition) && definition.contractVersion === 1 && identifier(definition.id) &&
        integer(definition.minPlayers, 1, 32) && integer(definition.maxPlayers, definition.minPlayers, 32) &&
        ['create','validate','actions','reduce','project','result'].every(key => typeof definition[key] === 'function') &&
        (definition.bot === undefined || typeof definition.bot === 'function') &&
        (definition.botHandlesDifficulty===undefined||typeof definition.botHandlesDifficulty==='boolean')&&
        (definition.botMistakes===undefined||typeof definition.botMistakes==='function')&&
        (definition.observe === undefined || typeof definition.observe === 'function') &&
        (definition.score === undefined || typeof definition.score === 'function') &&
        (definition.rounds===undefined||typeof definition.rounds==='boolean')&&
        ['storageState','checkpoint','preparing','reactions','reactionControl','reactionWindows','botReaction','botReactionDelay','decisionWindow','botContext','turnOrder','inputs','advance','clockActions'].every(key=>
          definition[key]===undefined||typeof definition[key]==='function'), 'MODEL_INVALID');
      this.#definition = Object.freeze({...definition});
      this.id = definition.id; this.minPlayers = definition.minPlayers; this.maxPlayers = definition.maxPlayers;
      Object.freeze(this);
    }
    #position(position){return position&&this.#validated.has(position)?position:snapshot(position);}
    validate(position) {
      if(position&&this.#validated.has(position))return true;
      check(record(position) && integer(position.playerCount, this.minPlayers, this.maxPlayers) &&
        integer(position.turn, 0, position.playerCount - 1) && ['playing','finished'].includes(position.status) &&
        Array.isArray(position.winners) && new Set(position.winners).size === position.winners.length &&
        position.winners.every(player => integer(player, 0, position.playerCount - 1)) &&
        (position.status === 'finished' || position.winners.length === 0) && record(position.data) &&
        (position.revision===undefined||integer(position.revision,0,Number.MAX_SAFE_INTEGER))&&
        (position.clock===undefined||integer(position.clock,0,Number.MAX_SAFE_INTEGER))&&
        (position.timeline===undefined||validTimeline(position.timeline,position.revision??0,this.#definition.rounds===true)), 'POSITION_INVALID');
      const value = this.#position(position);
      check(this.#definition.validate(value) === true, 'POSITION_INVALID');
      this.#validated.add(value);
      return true;
    }
    create(options) {
      return this.start(options).position;
    }
    start(options) {
      const created=this.#definition.create(snapshot(options));
      check(record(created),'POSITION_INVALID');
      const initial=created.position?created:{position:created,events:[]};
      const transition={...initial,position:{...initial.position,...(this.#definition.advance?{clock:options.now??0}:{}),revision:initial.position.revision??0,timeline:{turn:1,starts:[0],...(this.#definition.preparing?{preparing:!!this.#definition.preparing(initial.position),playStart:0}:{}),...(this.#definition.rounds?{round:1,roundStarts:[0]}:{})}}};
      const owned=snapshot(transition);
      this.validate(owned.position);
      check(owned.position.playerCount===options.playerCount&&Array.isArray(owned.events),'POSITION_INVALID');
      for(const value of owned.events)event(value,options.playerCount);
      this.#validated.add(owned.position);
      return owned;
    }
    score(position) {
      this.validate(position);
      if(!this.#definition.score)return null;
      const values=this.#definition.score(this.#position(position));
      check(Array.isArray(values)&&values.length===position.playerCount&&values.every(value=>integer(value,Number.MIN_SAFE_INTEGER,Number.MAX_SAFE_INTEGER)),'SCORE_INVALID');
      return snapshot(values);
    }
    #choices(position, actor, kind = 'actions') {
      this.validate(position);
      if (position.status !== 'playing' || !integer(actor, 0, position.playerCount - 1)) return Object.freeze([]);
      const choices = this.#definition[kind]?.(this.#position(position), actor) || [];
      check(Array.isArray(choices) && choices.every(choice => record(choice) &&
        ['public','private'].includes(choice.visibility)), 'ACTION_INVALID');
      const signatures = choices.map(choice => command(choice.command));
      check(new Set(signatures).size === signatures.length, 'ACTION_INVALID');
      return snapshot(choices);
    }
    intent(value){if(value?.type==='batch'&&Array.isArray(value.actions))return Values.composeRecord({...value,actions:Values.composeArray(value.actions.map(action=>this.intent(action)))});const fields=this.#definition.derivedFields?.[value.type]||[];if(!fields.length)return value;return snapshot(Object.fromEntries(Object.entries(value).filter(([key])=>!fields.includes(key))));}
    legalActions(position, actor) {
      return snapshot(this.#choices(position, actor).map(choice => this.intent(choice.command)));
    }
    reactions(position, actor) {
      return snapshot(this.#choices(position,actor,'reactions').map(choice=>choice.command));
    }
    availableActions(position, actor) {
      return Values.composeArray([...this.legalActions(position,actor),...this.reactions(position,actor)]);
    }
    inputChoices(position,actor){
      this.validate(position);
      if(!this.#definition.inputs||position.status!=='playing'||!integer(actor,0,position.playerCount-1))return Object.freeze([]);
      check(!!Inputs,'INPUT_SCHEMA_UNAVAILABLE');return Inputs.choices(this.#definition.inputs(this.#position(position),actor));
    }
    reactionControl(position, actor, action) {
      if(!this.#definition.reactionControl)return null;
      this.validate(position);
      if(position.status!=='playing'||!integer(actor,0,position.playerCount-1))return null;
      const value=this.#definition.reactionControl?.(this.#position(position),actor,snapshot(action))??null;
      if(value===null)return null;
      check(record(value)&&['answer','challenge','advance','independent'].includes(value.kind)&&
        (value.ignore===undefined||typeof value.ignore==='boolean')&&
        (value.independent===undefined||typeof value.independent==='boolean')&&
        (value.episode===undefined||integer(value.episode,0,position.revision??0)), 'REACTION_INVALID');
      if(value.command!==undefined)command(value.command);
      return snapshot(value);
    }
    reactionControls(position,actor,actions) {
      if(!this.#definition.reactionControl)return Object.freeze(actions.map(()=>null));
      const current=this.#position(position);
      // A projected list shares one position. Every choice still gets the
      // same validation and rule hook as a separately submitted command.
      return Object.freeze(actions.map(action=>this.reactionControl(current,actor,action)));
    }
    reactionWindows(position) {
      this.validate(position);
      const windows=this.#definition.reactionWindows?.(this.#position(position))||[];
      check(Array.isArray(windows)&&windows.length<=position.playerCount&&new Set(windows.map(value=>value.id)).size===windows.length&&windows.every(value=>
        record(value)&&typeof value.id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id)&&
        integer(value.owner,0,position.playerCount-1)&&integer(value.revision,0,position.revision??0)&&
        integer(value.humanMs,0,60000)&&integer(value.botMs,value.humanMs,60000)&&integer(value.fallbackMs,0,60000)), 'REACTION_WINDOW_INVALID');
      return snapshot(windows);
    }
    decisionWindow(position) {
      this.validate(position);
      const value=this.#definition.decisionWindow?.(this.#position(position))??null;
      if(value===null)return null;
      check(record(value)&&typeof value.id==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id)&&Array.isArray(value.participants)&&value.participants.length>0&&new Set(value.participants).size===value.participants.length&&value.participants.every(i=>integer(i,0,position.playerCount-1))&&Array.isArray(value.ready)&&new Set(value.ready).size===value.ready.length&&value.ready.every(i=>value.participants.includes(i))&&record(value.versions)&&value.participants.every(i=>integer(value.versions[i],0,Number.MAX_SAFE_INTEGER)), 'DECISION_WINDOW_INVALID');
      return snapshot({id:value.id,participants:value.participants,ready:value.ready,versions:Object.fromEntries(value.participants.map(i=>[i,value.versions[i]]))});
    }
    turnOrder(projection){
      if(projection.status!=='playing'||projection.playerCount<2||projection.timeline?.preparing)return null;
      if(!this.#definition.turnOrder&&projection.decisionWindow?.participants.length>1)return null;
      const hint=this.#definition.turnOrder?this.#definition.turnOrder(snapshot(projection)):{players:Array.from({length:projection.playerCount},(_,i)=>i)};
      if(hint===null)return null;check(record(hint),'TURN_ORDER_INVALID');
      if(Object.hasOwn(hint,'next')){check(hint.next===null||integer(hint.next,0,projection.playerCount-1),'TURN_ORDER_INVALID');return snapshot({next:hint.next});}
      const players=hint.players,direction=hint.direction??1;check(Array.isArray(players)&&players.length<=projection.playerCount&&new Set(players).size===players.length&&players.every(i=>integer(i,0,projection.playerCount-1))&&[1,-1].includes(direction),'TURN_ORDER_INVALID');
      const index=players.indexOf(projection.turn),next=index<0||players.length<2?null:players[(index+direction+players.length)%players.length];return snapshot({players,direction,next});
    }
    draftSpec(projection){return this.#definition.draft?.(snapshot(projection))??null;}
    draftProjection(projection,actions){check(typeof this.#definition.draftProjection==='function','DRAFT_UNAVAILABLE');return snapshot(this.#definition.draftProjection(snapshot(projection),snapshot(actions)));}
    localCommands(projection){
      check(record(projection)&&projection.choicesVersion===1&&projection.game===this.id&&integer(projection.actor,-1,projection.playerCount-1)&&typeof this.#definition.localChoices==='function','LOCAL_CHOICES_INVALID');
      const choices=projection.actor<0||projection.status!=='playing'?[]:this.#definition.localChoices(projection).filter(choice=>projection.audience!=='public'||choice.visibility==='public');
      check(Array.isArray(choices)&&choices.every(choice=>record(choice)&&['public','private'].includes(choice.visibility)),'ACTION_INVALID');const actions=choices.map(choice=>this.intent(choice.command)),keys=actions.map(command);check(new Set(keys).size===keys.length,'ACTION_INVALID');return Values.composeArray(actions);
    }
    batch(position,actor,input,surface='player'){
      check(record(input)&&input.type==='batch'&&Object.keys(input).every(k=>['type','actions'].includes(k))&&Array.isArray(input.actions)&&input.actions.length>0&&input.actions.length<=16,'BATCH_INVALID');
      const spec=this.draftSpec(this.project(position,actor,[],{factsOnly:!!this.#definition.localChoices})),last=input.actions.at(-1);
      check(spec&&['sequence','coalesce'].includes(spec.mode)&&input.actions.length<=(spec.max??spec.count)&&
        (spec.mode!=='sequence'||input.actions.length===spec.count)&&
        input.actions.slice(0,-1).every(c=>spec.select.includes(c?.type))&&
        (spec.commit.includes(last?.type)||spec.mode==='coalesce'&&spec.select.includes(last?.type)),'BATCH_INVALID');
      let current=position;const actions=[];
      for(let i=0;i<input.actions.length;i++){
        check(input.actions[i]?.type!=='batch','BATCH_INVALID');const rich=this.commandFor(current,actor,input.actions[i],surface);actions.push(this.intent(rich));
        if(i<input.actions.length-1){const next=this.#definition.reduce(this.#position(current),actor,rich,snapshot({now:position.clock??0}));check(next&&next.events?.length===0&&!next.turnEnded&&!next.roundEnded&&next.position.status==='playing'&&next.position.turn===position.turn&&next.position.rng===position.rng,'BATCH_SELECTOR_INVALID');current=Values.composeRecord({...next.position,revision:position.revision,timeline:position.timeline});this.validate(current);}
      }
      return Values.composeRecord({type:'batch',actions:Values.composeArray(actions)});
    }
    commandFor(position, actor, action, surface = 'player') {
      check(['player','table'].includes(surface), 'ACTION_INVALID');
      if(action?.type==='batch')return this.batch(position,actor,action,surface);
      const signature = command(this.intent(action));
      const found = [...this.#choices(position, actor),...this.#choices(position,actor,'reactions')].find(choice =>
        (surface !== 'table' || choice.visibility === 'public') && command(this.intent(choice.command)) === signature);
      if(found===undefined){const choices=this.inputChoices(position,actor).filter(c=>surface!=='table'||c.visibility==='public');const input=Inputs?.resolve(choices,action);check(input!==null&&input!==undefined,surface==='table'?'TABLE_ACTION_UNAVAILABLE':'ACTION_UNAVAILABLE');return input;}
      return found.command;
    }
    apply(position, actor, action, context={}) {
      position=this.#position(position);
      const now=context.now??position.clock??0;check(integer(now,position.clock??0,Number.MAX_SAFE_INTEGER),'CLOCK_INVALID');
      if(this.reactionControl(position,actor,action)?.ignore)return snapshot({position,events:[]});
      const legal = this.commandFor(position, actor, action);
      let result;if(legal.type==='batch'){let current=position;for(const action of legal.actions){const step=this.commandFor(current,actor,action);result=this.#definition.reduce(this.#position(current),actor,step,snapshot({now}));current=Values.composeRecord({...result.position,revision:position.revision,timeline:position.timeline});}}else result=this.#definition.reduce(this.#position(position),actor,legal,snapshot({now}));
      if(this.#definition.advance&&result?.position)result={...result,position:{...result.position,clock:now}};
      return this.#transition(position,result);
    }
    // Clock actions have no player actor and never enter player or Table projections.
    clockActions(position){
      this.validate(position);
      if(!this.#definition.advance||position.status!=='playing')return [];
      const actions=this.#definition.clockActions?.(this.#position(position))??[];
      check(Array.isArray(actions)&&actions.length<=16&&new Set(actions.map(command)).size===actions.length,'CLOCK_ACTION_INVALID');
      return snapshot(actions);
    }
    advance(position,now,control){
      this.validate(position);check(integer(now,position.clock??0,Number.MAX_SAFE_INTEGER),'CLOCK_INVALID');
      if(control!==undefined){
        const signature=command(control);
        check(this.clockActions(position).some(action=>command(action)===signature),'CLOCK_ACTION_UNAVAILABLE');
      }
      if(!this.#definition.advance||position.status!=='playing')return snapshot({position,events:[]});
      const result=this.#definition.advance(this.#position(position),now,control===undefined?undefined:snapshot(control));
      if(result===null||result===undefined)return snapshot({position,events:[]});
      check(record(result)&&record(result.position),'TRANSITION_INVALID');
      return this.#transition(position,{...result,position:{...result.position,clock:now}});
    }
    #transition(position,result){
      check(record(result) && record(result.position) && Array.isArray(result.events) &&
        result.position.playerCount === position.playerCount, 'TRANSITION_INVALID');
      check(!result.roundEnded||this.#definition.rounds===true,'ROUND_NOT_DECLARED');
      check((result.turnEnded===undefined||typeof result.turnEnded==='boolean')&&(result.roundEnded===undefined||typeof result.roundEnded==='boolean')&&(!result.roundEnded||result.turnEnded),'TRANSITION_INVALID');
      const revision=(position.revision??0)+1;
      // Timeline entries are engine-owned history. Retain their references
      // until prep resets the timeline or a new turn or round begins.
      let timeline=position.timeline?snapshot(position.timeline):composeRecord({turn:1,starts:[0]});
      const wasPreparing=!!this.#definition.preparing?.(position),preparing=!!this.#definition.preparing?.(result.position);
      if(wasPreparing){
        const starts=composeArray([revision]);
        timeline=composeRecord({...timeline,preparing,turn:1,starts,playStart:revision,
          ...(timeline.round?{round:1,roundStarts:starts}:{})});
      }else if(!preparing&&result.turnEnded&&result.position.status==='playing'){
        timeline=composeRecord({...timeline,turn:timeline.turn+1,starts:[...timeline.starts,revision],
          ...(result.roundEnded&&timeline.round?{round:timeline.round+1,roundStarts:[...timeline.roundStarts,revision]}:{}),
          ...(this.#definition.preparing?{preparing}:{})});
      }else if(this.#definition.preparing&&preparing!==timeline.preparing){
        timeline=composeRecord({...timeline,preparing});
      }
      const nextPosition=composeRecord({...result.position,revision,timeline},{strict:true});
      const owned=composeRecord({...result,position:nextPosition},{strict:true});
      this.validate(owned.position);
      for (const value of owned.events) event(value, position.playerCount);
      this.#validated.add(owned.position);
      return owned;
    }
    project(position, viewer, events = [], {factsOnly=false}={}) {
      return this.#project(position,viewer,(audience,count)=>projectEvents(events,audience,count),factsOnly);
    }
    // The installed adapter supplies facts already authorized for this view.
    // localData can read them. The adapter retains its copy for presentation.
    projectForHost(position, viewer, facts, {table=false}={}) {
      check(Array.isArray(facts),'EVENT_INVALID');
      const projected=this.#project(position,table?-1:viewer,()=>snapshot(facts),false,false);
      return table?this.#tableProjection(position,viewer,projected,false):projected;
    }
    #project(position, viewer, readEvents, factsOnly, includeEvents=true) {
      position=this.#position(position);
      this.validate(position);
      if (!integer(viewer, 0, position.playerCount - 1)) viewer = -1;
      const data = this.#definition.project(this.#position(position), viewer);
      check(record(data), 'PROJECTION_INVALID');
      const base={contractVersion:1,...(this.#definition.localChoices?{choicesVersion:1}:{}),game:this.id, viewer, actor:viewer, audience:viewer < 0 ? 'public' : 'player',
        playerCount:position.playerCount, turn:position.turn, status:position.status,
        ...(position.preset!==undefined?{preset:position.preset}:{}),
        ...(position.revision!==undefined?{revision:position.revision}:{}),
        decisionWindow:this.decisionWindow(position),winners:position.winners,timeline:position.timeline||{turn:1,starts:[0]}, data,
        events:[]};
      const facts=readEvents(viewer,position.playerCount);
      if(includeEvents)base.events=facts;
      if(factsOnly){check(typeof this.#definition.localChoices==='function','LOCAL_CHOICES_REQUIRED');return composeValue({...base,choicesVersion:1});}
      return composeValue({...base,data:this.#definition.localData?this.#definition.localData(includeEvents?base:{...base,events:facts}):base.data,actions:this.availableActions(position,viewer),...(this.#definition.inputs?{inputs:this.inputChoices(position,viewer)}:{})});
    }
    projectTable(position, actor, events = [], options={}) {
      const projected = this.project(position, -1, events,options);
      return this.#tableProjection(position,actor,projected,options.factsOnly);
    }
    #tableProjection(position, actor, projected, factsOnly) {
      if (!integer(actor, 0, position.playerCount - 1)) return projected;
      // Spectator data is already validated and immutable. Only the actor
      // and public controls change when composing a Table projection.
      if(factsOnly)return Values.composeRecord({...projected,actor});
      return Values.composeRecord({...projected, actor,
        actions:[...this.#choices(position, actor),...this.#choices(position,actor,'reactions')].filter(choice => choice.visibility === 'public').map(choice => choice.command),...(this.#definition.inputs?{inputs:this.inputChoices(position,actor).filter(choice=>choice.visibility==='public')}:{})});
    }
    #localViewData(projection) {
      check(record(projection)&&projection.choicesVersion===1&&projection.game===this.id&&integer(projection.viewer,-1,projection.playerCount-1)&&integer(projection.actor,-1,projection.playerCount-1)&&typeof this.#definition.localChoices==='function','LOCAL_CHOICES_INVALID');
      const source=snapshot(projection);
      const data=this.#definition.localData?this.#definition.localData(source):source.data;
      return data===source.data?source:Values.composeRecord({...source,data});
    }
    localProjection(projection) {
      const view=this.#localViewData(projection);
      return Values.composeRecord({...view,actions:this.localCommands(view)});
    }
    prepareLocalView(projection,inputAllowed) {
      const view=this.#localViewData(projection);
      const actions=inputAllowed?this.localCommands(view):[];
      const result={actions};
      // The host already owns the authorized projection. Return only the
      // derived data and commands, with reaction facts in the same order.
      if(this.#definition.localData)result.data=view.data;
      if(actions.length&&this.#definition.localReaction){
        const full=Values.composeRecord({...view,actions});
        result.reactions=actions.map(command=>this.localReaction(full,command));
      }
      return Values.composeRecord(result);
    }
    localReaction(projection, action) {return this.#definition.localReaction?.(snapshot(projection),snapshot(action))??null;}
    // Authority-only extraction. None of the raw position reaches a bot realm.
    botKnowledge(position,actor,kind='action') {
      check(['action','reaction','delay'].includes(kind),'BOT_INPUT_INVALID');
      // One authority snapshot feeds the projection, choices and both hooks.
      position=this.#position(position);
      this.validate(position);
      if(!integer(actor,0,position.playerCount-1))return null;
      return composeValue({projection:this.project(position,actor),actor,
        actions:kind==='action'?this.#choices(position,actor).map(choice=>choice.command):this.reactions(position,actor),
        memory:this.#definition.observe?.(position,actor)||{},
        context:this.#definition.botContext?.(position,actor)||{}});
    }
    botInputs(position,actor,settings,kind='action') {
      const knowledge=this.botKnowledge(position,actor,kind);
      if(!knowledge)return null;
      return composeValue({...knowledge,kind,settings:settings??null,
        decisionRandom:{seed:position.rng??0,key:this.id+':'+(position.revision||0)+':'+actor}});
    }
    // The portable sandbox invokes only this method in a fresh same-source realm.
    // Mechanics stay in trusted locals; authored hooks receive their documented args.
    botDecision(inputs) {
      if(inputs===null)return null;
      check(record(inputs)&&['action','reaction','delay'].includes(inputs.kind)&&Array.isArray(inputs.actions)&&record(inputs.projection)&&record(inputs.memory)&&record(inputs.context)&&record(inputs.decisionRandom),'BOT_INPUT_INVALID');
      const {kind,projection,actor,actions,memory,settings}=snapshot(inputs);
      if(kind==='delay'){
        const delay=this.#definition.botReactionDelay?.(projection,actor,settings,memory)??null;
        check(delay===null||integer(delay,0,60000),'BOT_REACTION_DELAY_INVALID');return delay;
      }
      if(kind==='reaction'){
        if(!actions.length||!this.#definition.botReaction)return null;
        const chosen=this.#definition.botReaction(projection,actor,actions,memory,settings);
        if(chosen==null)return null;
        const found=actions.find(value=>command(value)===command(chosen));
        check(found!==undefined,'BOT_REACTION_INVALID');return found;
      }
      const context={...inputs.context,...Difficulty.context(settings,inputs.decisionRandom.seed,inputs.decisionRandom.key)};
      const selected=this.#definition.bot?.(projection,actor,actions,memory,context)??(actions.length?actions[Math.floor(context.random()*actions.length)]:null);
      if(selected===null)return null;
      const preferred=actions.find(value=>command(this.intent(value))===command(this.intent(selected)));
      if(preferred===undefined){const input=Inputs?.resolve(projection.inputs||[],selected);check(input!==null&&input!==undefined,'BOT_ACTION_INVALID');return input;}
      const chosen=this.#definition.botHandlesDifficulty||settings?.enabled===false?preferred:Difficulty.choose(preferred,this.#definition.botMistakes?.(projection,actor,actions)||actions,context);
      const found=actions.find(value=>command(this.intent(value))===command(this.intent(chosen)));check(found!==undefined,'BOT_ACTION_INVALID');return this.intent(found);
    }
    botAction(position,actor,settings) {return this.botDecision(this.botInputs(position,actor,settings,'action'));}
    botReaction(position,actor,settings) {return this.botDecision(this.botInputs(position,actor,settings,'reaction'));}
    botReactionDelay(position,actor,settings) {return this.botDecision(this.botInputs(position,actor,settings,'delay'));}
    result(position) {
      this.validate(position);
      if (position.status !== 'finished') return null;
      const result = this.#definition.result(this.#position(position));
      check(record(result) && canonical(result.winners) === canonical(position.winners) &&
        Array.isArray(result.places) && result.places.length === position.playerCount &&
        result.places.every(place => integer(place, 1, position.playerCount)) &&
        Array.isArray(result.metrics) && result.metrics.length > 0 &&
        new Set(result.metrics.map(metric => metric.id)).size === result.metrics.length &&
        result.metrics.every(metric => identifier(metric.id) && Array.isArray(metric.values) &&
          metric.values.length === position.playerCount && metric.values.every(Number.isFinite)), 'RESULT_INVALID');
      check(result.playerOrder===undefined||Array.isArray(result.playerOrder)&&result.playerOrder.length===position.playerCount&&new Set(result.playerOrder).size===position.playerCount&&result.playerOrder.every(player=>integer(player,0,position.playerCount-1)),'RESULT_INVALID');
      check(result.lastPlayers===undefined||Array.isArray(result.lastPlayers)&&new Set(result.lastPlayers).size===result.lastPlayers.length&&result.lastPlayers.every(player=>integer(player,0,position.playerCount-1)&&!result.winners.includes(player)),'RESULT_INVALID');
      check(result.exits===undefined||Array.isArray(result.exits)&&new Set(result.exits.map(exit=>exit.player)).size===result.exits.length&&result.exits.every(exit=>record(exit)&&integer(exit.player,0,position.playerCount-1)&&['cards','domino','finished'].includes(exit.kind)&&(integer(exit.round,1,Number.MAX_SAFE_INTEGER)||integer(exit.turn,1,Number.MAX_SAFE_INTEGER))),'RESULT_INVALID');
      // Result summaries cross the authority boundary. Keep only the fields
      // consumed by the common ranking and result screens.
      const {winners,places,playerOrder,lastPlayers,exits}=result;
      const metrics=result.metrics.map(({id,values,order,display,maximumFractionDigits})=>({id,values,
        ...(['asc','desc'].includes(order)?{order}:{}),
        ...(display==='ranking'?{display}:{}),
        ...(integer(maximumFractionDigits,0,6)?{maximumFractionDigits}:{})}));
      return snapshot({winners,places,metrics,...(playerOrder?{playerOrder}:{}),...(lastPlayers?{lastPlayers}:{}),
        ...(exits?{exits:exits.map(({player,kind,turn,round})=>({player,kind,...(integer(turn,1,Number.MAX_SAFE_INTEGER)?{turn}:{}),...(integer(round,1,Number.MAX_SAFE_INTEGER)?{round}:{})}))}:{})});
    }
  }
  return Object.freeze({GameModel, ModelError, projectEvents});
});
