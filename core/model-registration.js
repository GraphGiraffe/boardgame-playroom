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
  const Events = root.PlayroomEvents || require('./events.js');
  const emptyEvents=Object.freeze([]);
  function adapt(engine, {definition, model:suppliedModel, presentation, locales, locale=root.PlayroomMessages?.locale||'ru', fallback='ru', version, stateVersion=1, rulebooks=null, normalizeOptions}) {
    const Runtime = root.PlayroomModelRuntime || require('./model-runtime.js');
    const Values = root.PlayroomModelValues || require('./model-values.js');
    const History = root.PlayroomHistory || (typeof require==='function'?require('./history.js'):null);
    const Protocol = root.PlayroomProtocol || (typeof require==='function'?require('./protocol.js'):null);
    const model = suppliedModel || new Runtime.GameModel(definition);
    const translator = new Localization.Translator({catalogs:locales,locale,fallback});
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
    const seriesScoreMetric=metadata.seriesScoreMetric;
    if(seriesScoreMetric!==undefined&&(typeof seriesScoreMetric!=='string'||!/^[a-z][a-z0-9_.-]{0,63}$/.test(seriesScoreMetric)))throw Error('SERIES_SCORE_METRIC_INVALID');
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
      if(!History?.owns(state))return null;
      let value=stateCache.get(state);if(!value){value={positions:new Map()};stateCache.set(state,value);recentStates.push(state);if(recentStates.length>2)stateCache.delete(recentStates.shift());}return value;
    }
    function position(state){const entry=cache(state);if(entry?.position)return entry.position;
      // Reuse trusted branches even while history is validating a prepared
      // revision. The composition detaches values supplied by mutable callers.
      const value=Values.composeRecord({playerCount:state.players.length, turn:state.turn, status:state.status,
      winners:state.status === 'finished' ? state.winners || (state.winner === null ? [] : [state.winner]) : [],
      timeline:state.timeline,data:state.data,rng:state.rng,preset:state.preset,revision:state.move,openHands:state.openHands,...(state.clock!==undefined?{clock:state.clock}:{})});if(entry)entry.position=value;return value;}
    const projectionKey=(viewer,table=false,factsOnly=false)=>(table?'table:':'player:')+viewer+':'+factsOnly;
    function projected(state,viewer,{rawEvents=false,omitModelEvents=false}={},table=false,sharedFacts=null){
      const factsOnly=rawEvents&&!!definition.localChoices;
      const omitEvents=factsOnly&&omitModelEvents;
      const entry=cache(state),key=projectionKey(viewer,table,factsOnly)+(omitEvents?':wire':'');
      if(entry?.positions.has(key))return entry.positions.get(key);
      const rulesReadEvents=!!definition.localData&&!factsOnly;
      const usesRawJournal=rulesReadEvents&&typeof model.projectForHost!=='function';
      // A display frame already carries facts authorized by the engine.
      // Standalone model queries can still project the journal on demand.
      const needJournal=!omitEvents&&(usesRawJournal||sharedFacts===null);
      const events=!needJournal?emptyEvents:entry?(entry.events??=state.events.filter(value=>value.visibility)):state.events.filter(value=>value.visibility);
      const facts=omitEvents||usesRawJournal?emptyEvents:sharedFacts??(events.length?Events.project(events,table?-1:viewer,state.players.length):emptyEvents);
      const rulesEvents=usesRawJournal?events:emptyEvents;
      const current=position(state);
      const projected=rulesReadEvents&&facts.length?model.projectForHost(current,viewer,facts,{table})
        :table?model.projectTable(current,viewer,rulesEvents,{factsOnly}):model.project(current,viewer,rulesEvents,{factsOnly});
      const value=facts.length?Values.composeRecord({...projected,events:facts}):projected;
      // The model owns this detached result. Seal it before it is shared by
      // rendering and command resolution.
      if(entry)entry.positions.set(key,Values.freeze(value));return value;
    }
    function choices(state,actor,reactions=false){
      const entry=cache(state),key=(reactions?'reactions:':'legal:')+actor;
      if(entry?.positions.has(key))return entry.positions.get(key);
      const value=reactions?model.reactions(position(state),actor):model.legalActions(position(state),actor);if(entry)entry.positions.set(key,value);return value;
    }
    function reactionControl(state,actor,action){
      return definition.reactionControl?model.reactionControl(position(state),actor,action):null;
    }
    function decorated(action,projection,players) { const display=action.type==='batch'?action.actions.at(-1):action,choice=presentation.choice?.(display,projection)||{};return {...Object.fromEntries(Object.entries(choice).map(([key,value])=>[key,value?.key?text(value,players):value])),...action,label:text(presentation.action({...choice,...display},projection),players)}; }
    // The guest can serialize the same timeline as a new object. Share its
    // unchanged branches only with a previous snapshot owned by Session history.
    function ownedTimeline(previous,timeline){
      if(!previous)return Values.snapshot(timeline);
      const next={...timeline};
      for(const [key,value] of Object.entries(next)){
        const before=previous[key];
        if((key==='starts'||key==='roundStarts')&&Array.isArray(value)&&Array.isArray(before)&&
          value.length===before.length&&value.every((revision,index)=>revision===before[index]))next[key]=before;
        else if(value!==before)next[key]=Values.snapshot(value);
      }
      const keys=Object.keys(next);
      return keys.length===Object.keys(previous).length&&keys.every(key=>Object.hasOwn(previous,key)&&next[key]===previous[key])
        ?previous:Object.freeze(next);
    }
    function installTransition(next,changed,previous){
      const position=changed.position;
      next.timeline=History?.owns(previous)?ownedTimeline(previous.timeline,position.timeline):engine.clone(position.timeline);
      next.turn=position.turn;
      if(position.rng!==undefined)next.rng=position.rng;
      if(position.clock!==undefined)next.clock=position.clock;
      const scores=model.score(position);
      if(scores)scores.forEach((value,index)=>{next.players[index].score=value;});
      if(position.status==='finished')engine.complete(next,position.winners.length>1?position.winners:position.winners[0]??null,scores?0:1);
      const owned=History?.owns(previous);
      if(!owned||changed.events.length){
        const journal=Events.append(next.events,changed.events,next.players.length,next.move);
        next.events=owned?journal:[...journal];
      }
      return next;
    }
    function validatedScene(projection,value){
      const scene=Scenes.validate(value,projection.playerCount);
      if(Array.isArray(projection.actions))Scenes.commands(scene,projection);
      return scene;
    }
    function sceneRound(scene,projection){
      const timeline=projection.timeline;
      return scene.round||(timeline?.round?{number:timeline.round,limit:null,starts:timeline.roundStarts}:null);
    }
    // The final scene and its checkpoints can share a rules result for the
    // exact same owned projection. Separate audiences and input gates may
    // supply different projections at the same revision.
    const turnOrders=new WeakMap();
    function projectedTurnOrder(projection){
      if(!Protocol?.ownsImmutable(projection))return model.turnOrder(projection);
      if(!turnOrders.has(projection))turnOrders.set(projection,model.turnOrder(projection));
      return turnOrders.get(projection);
    }
    const sceneTeam=(team,players)=>({...team,label:text(team.label,players)});
    function presentScene(projection,players,value=presentation.scene(projection)){
      const scene=validatedScene(projection,value);
      return describeScene(scene,projection,players,projectedTurnOrder(projection));
    }
    function describeScene(scene,projection,players,order){const round=sceneRound(scene,projection);return {...scene,...(scene.solitaireLayout?{solitaireLayout:{...scene.solitaireLayout,labels:Object.fromEntries(Object.entries(scene.solitaireLayout.labels).map(([key,label])=>[key,text(label,players)]))}}:{}),...(scene.memoryLayout?{memoryLayout:{...scene.memoryLayout,label:text(scene.memoryLayout.label,players)},cards:scene.cards.map(card=>({...card,...(card.label?{label:text(card.label,players)}:{})}))}:{}),...(scene.fleetLayout?{fleetLayout:{...scene.fleetLayout,boards:scene.fleetLayout.boards.map(board=>({...board,label:text(board.label,players),indicators:board.indicators.map(i=>({...i,label:text(i.label,players)})),cells:board.cells.map(c=>({...c,label:text(c.label,players)})),ships:board.ships.map(ship=>({...ship,label:text(ship.label,players)}))})),controls:Object.fromEntries(Object.entries(scene.fleetLayout.controls).map(([key,value])=>[key,typeof value==='object'&&value&&'label' in value?{...value,label:text(value.label,players)}:text(value,players)]))}}:{}),...(scene.checkerLayout?{checkerLayout:{...scene.checkerLayout,label:text(scene.checkerLayout.label,players),cells:scene.checkerLayout.cells.map(cell=>({...cell,label:text(cell.label,players),help:text(cell.help,players)})),moves:scene.checkerLayout.moves.map(move=>({...move,label:text(move.label,players),help:text(move.help,players)}))}}:{}),...(scene.tableLayout?.kind==='collected-sets'?{tableLayout:{...scene.tableLayout,rows:scene.tableLayout.rows.map(row=>({...row,label:text(row.label,players)}))}}:{}),...(scene.playerChoices?{playerChoices:{...scene.playerChoices,choices:scene.playerChoices.choices.map(choice=>({...choice,label:text(choice.label,players)}))}}:{}),...(scene.numberedRoute?{numberedRoute:{...scene.numberedRoute,swapLabel:scene.numberedRoute.swapLabel.map(label=>text(label,players))},positions:scene.positions.map(p=>({...p,label:text(p.label,players)}))}:{}),...(scene.routeCells?{routeCells:scene.routeCells.map(cell=>({...cell,label:text(cell.label,players)}))}:{}),...(scene.pawns?{pawns:scene.pawns.map(pawn=>({...pawn,...(pawn.label?{label:text(pawn.label,players)}:{})}))}:{}),nextPlayer:order?.next??null,audience:projection.audience,viewer:projection.viewer,...(projection.decisionWindow?{decisionWindow:projection.decisionWindow}:{}),...(round?{round}:{}),players:(scene.players||[]).map(person=>({...person,...(person.badges?{badges:person.badges.map(badge=>({...badge,label:text(badge.label,players)}))}:{}),...(person.countLabel?{countLabel:text(person.countLabel,players)}:{}),metrics:(person.metrics||[]).map(metric=>({...metric,label:text(metric.label,players)})),...(person.indicators?{indicators:person.indicators.map(indicator=>({...indicator,label:text(indicator.label,players)}))}:{}),...(person.team?{team:sceneTeam(person.team,players)}:{})}))};}
    function restrictedScene(projection,players){
      const value=presentation.scene(projection);
      const hints=['nextPlayerByCard','turnPreviewByCard'].filter(key=>value[key]&&Object.keys(value[key]).length);
      if(!hints.length)return presentScene(projection,players,value);
      // Taking control away (pause, spectator or bot) can revoke a card move
      // after the pack calculated its turn preview. Only still-offered sources
      // may receive a hint. All other scene permissions are validated as usual.
      const cards=new Set((value.interactions||[]).filter(i=>i.source?.entity?.namespace==='card').map(i=>i.source.entity.id));
      let restricted=value;
      for(const key of hints){
        const entries=Object.entries(value[key]),visible=entries.filter(([id])=>cards.has(id));
        if(visible.length===entries.length)continue;
        if(restricted===value)restricted={...value};
        restricted[key]=Object.fromEntries(visible);
      }
      return presentScene(projection,players,restricted);
    }
    function presentEventScenes(projection,players,events) {
      if(!presentation.eventScenes)return events;
      const frames=Scenes.eventScenes(presentation.eventScenes(projection),projection);
      if(!frames.length)return events;
      const order=projectedTurnOrder(projection),scenes=new Map();
      // The checkpoint contract already validated each scene's geometry.
      // Retain the command check and use the same turn hint for this group.
      for(const {eventId,scene} of frames){
        if(Array.isArray(projection.actions))Scenes.commands(scene,projection);
        scenes.set(eventId,describeScene(scene,projection,players,order));
      }
      return events.map(event=>scenes.has(event.id)?{...event,scene:scenes.get(event.id)}:event);
    }
    function populateView(out,projection,state,{rawEvents,dataView},table=false,sharedFacts=null){
      out.modelProjection=projection;
      // Screens can share the model's immutable data. Authority carries
      // the model separately and has no use for the compatibility copy.
      if(dataView==='omit')delete out.data;
      if(rawEvents)return;
      if(dataView!=='omit')out.data=dataView==='shared'?projection.data:engine.clone(projection.data);
      out.scene=presentScene(projection,state.players);
      // Event checkpoints on the Table belong to its spectator audience.
      // Do not use the active public actor's controls for those checkpoints.
      if(presentation.eventScenes){
        out.events=presentEventScenes(table&&projection.actor>=0?projected(state,-1,undefined,false,sharedFacts):projection,state.players,out.events);
      }
    }
    function presentEvent(value,players) {
      const description=Scenes.event(presentation.event(value),players.length),params={...description.message.params};
      if(value.actor!==null)params.player=players[value.actor].name;
      const message=typeof description.message==='string'?description.message:{...description.message,params};
      return {...value,player:value.actor,text:text(message,players),message:bindParticipants(message,players),kind:description.finish?'finish':description.kind||'action',
        ...(description.animation?{animation:description.animation}:{}),
        ...(description.presentation?{presentation:description.presentation}:{}),
        ...(description.transfer?{transfer:description.transfer}:{}),
        ...(description.feedback?{feedback:description.feedback}:{}),
        ...(description.reveal?{reveal:description.reveal.title?Protocol.composeRecord({...description.reveal,title:text(description.reveal.title,players)}):description.reveal}:{}),
        ...(description.speech?{speech:description.speech.text?Protocol.composeRecord({...description.speech,text:text(description.speech.text,players)}):description.speech}:{}),
        ...(description.sound!==undefined?{sound:description.sound}:{}),
        ...(description.target!==undefined?{target:description.target}:{}),
        ...(description.notice?{notice:{...description.notice,title:text(description.notice.title,players),detail:text(description.notice.detail,players)}}:{})};
    }
    const formattedFacts=new WeakMap();
    function eventPresenter(players){
      const names=JSON.stringify(players.map(player=>player.name)),format=this.presentEvent;
      // Only the history projection calls this port, with already authorized
      // facts. Keep one detached format per fact and current roster of names.
      return fact=>{
        const cached=formattedFacts.get(fact);
        if(cached?.names===names&&cached.format===format)return cached.event;
        const event=Protocol.composeRecord(format.call(this,fact,players));
        formattedFacts.set(fact,{names,format,event});
        return event;
      };
    }
    return {
      id:model.id, version, stateVersion, modelContractVersion:1, model, localProjection:projection=>model.localProjection(projection),prepareLocalView:(projection,inputAllowed)=>model.prepareLocalView(projection,inputAllowed),localCommands:projection=>model.localCommands(projection),draftSpec:projection=>model.draftSpec(projection),draftProjection:(projection,actions)=>model.draftProjection(projection,actions),isIntent:action=>Values.canonical(model.intent(action))===Values.canonical(action),...(definition.localReaction?{localReaction:(projection,action)=>model.localReaction(projection,action)}:{}),presentEvent,eventPresenter, scene:presentScene,restrictedScene,eventScenes:presentEventScenes, decorate:decorated,
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
      ...(seriesScoreMetric?{seriesScoreMetric}:{}),
      presets:metadata.presets.map(preset => ({id:preset.id, label:text(preset.label),...(preset.description?{description:text(preset.description)}:{})})),
      rules:metadata.rules.map(text),
      ...(rulebooks?.[translator.locale]||rulebooks?.[fallback]?{rulebook:translator.resolve(rulebooks[translator.locale]||rulebooks[fallback])}:metadata.rulebook?{rulebook:translateRulebook(metadata.rulebook)}:{}),
      create(state, options) {
        const initial = model.start({playerCount:state.players.length, preset:state.preset,
          firstPlayer:options.resolvedFirstPlayer ?? 0,now:options.now??0,rng:state.rng,openHands:state.openHands,options:engine.clone(normalizeOptions?normalizeOptions(options):options)});
        const created=initial.position;
        state.timeline=engine.clone(created.timeline);state.turn = created.turn; state.data = engine.clone(created.data);if(created.rng!==undefined)state.rng=created.rng;if(created.clock!==undefined)state.clock=created.clock;
        const scores=model.score(created);if(scores)scores.forEach((value,index)=>{state.players[index].score=value;});
        if(created.status==='finished')engine.complete(state,created.winners.length>1?created.winners:created.winners[0]??null,scores?0:1);
        state.events=[...Events.append(state.events,initial.events,state.players.length,state.move)];
      },
      validateState(state) { model.validate(position(state)); },
      resolveAction(state,actor,action,control=reactionControl(state,actor,action)) {
        const current=position(state),input=control?.command||action;
        if(input?.type==='batch'){try{return model.batch(current,actor,input);}catch{return null;}}
        if(definition.inputs){try{return model.commandFor(current,actor,input);}catch{}}
        // Use an existing full projection without building one for a replay,
        // bot or unseen actor. The reducer still validates the chosen intent.
        const offered=cache(state)?.positions.get(projectionKey(actor))?.actions??
          (definition.reactions?[...choices(state,actor),...choices(state,actor,true)]:choices(state,actor));
        const command=offered.find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(input?.[key])));
        return command||null;
      },
      inputs(state,actor){return model.inputChoices(position(state),actor);},
      ...(definition.clockActions?{clockActions(state){return model.clockActions(position(state));}}:{}),
      advance(state,now,control){
        const current=position(state),changed=control===undefined?model.advance(current,now):model.advance(current,now,control);
        if(changed.position.revision===current.revision)return state;
        const data=History?.owns(state)?Values.snapshot(changed.position.data):changed.position.data;
        const next={...engine.clone({...state,data:null,events:[],timeline:null}),data,
          events:state.events,move:changed.position.revision};
        return installTransition(next,changed,state);
      },
      commands(state,actor,reactions=false){return reactions&&!definition.reactions?[]:choices(state,actor,reactions);},
      legal(state, actor) { const projection=projected(state,actor);return choices(state,actor).map(command=>decorated(command,projection,state.players)); },
      projectedLegal(state,actor){
        // A full player projection already includes both moves and reactions.
        const projection=projected(state,actor);
        return projection.actions.map(command=>decorated(command,projection,state.players));
      },
      reactions(state,actor) { if(!definition.reactions)return [];const offered=choices(state,actor,true);if(!offered.length)return [];const projection=projected(state,actor);return offered.map(command=>decorated(command,projection,state.players)); },
      decisionWindow(state) { if(!definition.decisionWindow)return null;return model.decisionWindow(position(state)); },
      reactionWindows(state){
        if(!definition.reactionWindows)return [];
        const entry=cache(state);
        if(!entry)return model.reactionWindows(position(state));
        // Only rule descriptors belong to the revision. Authority owns their
        // live readiness, suspension and deadlines.
        return entry.reactionWindows??=Values.snapshot(model.reactionWindows(position(state)));
      },
      reactionControl,
      ...(definition.reactionControl?{reactionControls(state,actor,actions){
        return model.reactionControls(position(state),actor,actions);
      }}:{}),
      // Optional bot settings use the same JSON value for native and isolated models.
      botReactionDelay(state,actor) { if(!definition.botReactionDelay)return null;return model.botReactionDelay(position(state),actor,state.players[actor]?.botSettings??null); },
      botReaction(state,actor) { if(!definition.botReaction)return null;const current=position(state),command=model.botReaction(current,actor,state.players[actor]?.botSettings??null);return command?decorated(command,projected(state,actor),state.players):null; },
      apply(state,actor,action,previous) {
        // resolveAction returns a rules command. Replays never need a translated
        // label or a player scene. Reuse the position that supplied the command.
        const current=previous?position(previous):{...position(state),revision:Math.max(0,state.move-1)};
        const changed=model.apply(current,actor,action,{now:state.clock??0});
        // Share an owned model result with history. Guest results are detached
        // and sealed here; callers of the standalone engine keep mutable data.
        state.data=History?.owns(previous)?Values.snapshot(changed.position.data):engine.clone(changed.position.data);
        installTransition(state,changed,previous);
      },
      project(out,viewer,state,options={},facts=null){
        populateView(out,projected(state,viewer,options,false,facts),state,options);
      },
      publicProgress(state){
        // The save index uses spectator data. The same scene contract supplies
        // round and team labels without building a playable frame or its log.
        const projection=projected(state,-1);
        const scene=validatedScene(projection,presentation.scene(projection));
        return {round:sceneRound(scene,projection),players:scene.players.filter(person=>person.team)
          .map(person=>({player:person.player,team:sceneTeam(person.team,state.players)}))};
      },
      projectTable(out,actor,state,options={},facts=null){
        const projection=projected(state,actor,options,true,facts);
        populateView(out,projection,state,options,true,facts);
        out.tableActor=projection.actor??-1;
        // Only a facts frame delegates command reconstruction to the recipient.
        out.tableActions=options.rawEvents&&projection.choicesVersion===1?[]:projection.actions.map(command=>presentation.choice?decorated(command,projection,state.players):command);
      },
      tableCommand(state, actor, action) { if(action?.type==='batch')return model.batch(position(state),actor,action,'table');const command=model.projectTable(position(state),actor).actions.find(candidate=>Object.keys(candidate).every(key=>JSON.stringify(candidate[key])===JSON.stringify(action?.[key])));return model.commandFor(position(state), actor, command||action, 'table'); },
      bot(state, actor, actions=[]) { const chosen = model.botAction(position(state), actor, {...state.players[actor]?.botSettings,enabled:!!state.players[actor]?.bot});if(!chosen)return null;if(definition.inputs&&!actions.some(action=>Object.keys(chosen).every(key=>JSON.stringify(chosen[key])===JSON.stringify(action[key]))))return chosen;return actions.find(action=>Object.keys(chosen).every(key=>JSON.stringify(action[key])===JSON.stringify(chosen[key])))||decorated(chosen,projected(state,actor),state.players); },
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
