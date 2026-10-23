if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function (root) {
  'use strict';
  const registry = new Map(), versions = new Map();
  const LEGACY_PACK_VERSION = '0.1.0';
  const packVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  const clone = value => JSON.parse(JSON.stringify(value));
  const Random = root.PlayroomRandom || (typeof require === 'function' ? require('./random.js') : null);
  if (!Random) throw Error('Random module is required before the engine');
  const seedValue = value => Random.seedValue(value, Math.random);
  const random = state => Random.random(state, Math.random);
  const shuffle = (items, state) => Random.shuffle(items, state, Math.random);
  function rollDie(sides = 6, state) {
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw Error(globalThis.PlayroomMessages.text("ui.engine.3744bb4e9c80"));
    return Random.rollDie(sides, state, Math.random);
  }
  function event(state, text, player = null, kind = 'action', extra = {}) {
    state.events.push({ id: (state.events.at(-1)?.id || 0) + 1, revision:state.move, text, player, kind, ...extra });
  }
  function complete(state, winner, points = 1) {
    state.status = 'finished';
    const winners = Array.isArray(winner) ? [...new Set(winner)] : winner == null ? [] : [winner];
    state.winner = winners[0] ?? null;
    if (Array.isArray(winner)) state.winners = winners;
    for (const player of winners) state.players[player].score += points;
    const summary=forState(state).result?.(state);
    const values=summary?.values??state.players.map((_,index)=>winners.includes(index)?1:0);
    if(!Array.isArray(values)||values.length!==state.players.length||values.some(value=>!Number.isSafeInteger(value)||value<0))throw Error(globalThis.PlayroomMessages.text("ui.engine.12bcf9bc2478"));
    if(summary?.details!==undefined&&(!Array.isArray(summary.details)||summary.details.length!==values.length||summary.details.some(value=>!Number.isSafeInteger(value)||value<0)))throw Error(globalThis.PlayroomMessages.text("ui.engine.adea212152fd"));
    const order=summary?.order==='asc'?'asc':'desc',places=summary?.places||values.map(value=>1+new Set(values.filter(other=>order==='asc'?other<value:other>value)).size);
    state.result={label:summary?.label||globalThis.PlayroomMessages.text("ui.engine.231d91ffeba0"),values,places,order,...(summary?.metricId?{metricId:summary.metricId,metrics:clone(summary.metrics)}:{}),...(summary?.details?{detailLabel:summary.detailLabel||globalThis.PlayroomMessages.text("ui.engine.fdf0487fc4f1"),details:summary.details,...(summary.detailMetricId?{detailMetricId:summary.detailMetricId}:{})}:{})};
  }
  function finish(state, winner, text, points = 1) {
    complete(state,winner,points);
    event(state, text || (state.winner===null?globalThis.PlayroomMessages.text("ui.engine.269b950995db"):globalThis.PlayroomMessages.text("ui.engine.133252d718b0",{p0:String(state.players[state.winner].name)})), state.winner, 'finish');
  }
  // Presentation metadata stays independent of Web Audio and of game rules.
  // Only new, visible events produce cues; rendering/restoring a snapshot is silent.
  function projectedEvents(state,viewer) {
    const pack=forState(state);
    return state.events.flatMap(raw=>{
      if(raw.visibility){
        const Events=root.PlayroomEvents||(typeof require==='function'?require('./events.js'):null);
        return Events.project([raw],viewer,state.players.length).map(value=>pack.presentEvent(value,state.players));
      }
      if(raw.privateTo!=null&&!(Array.isArray(raw.privateTo)?raw.privateTo.includes(viewer):raw.privateTo===viewer))
        return [{id:raw.id,...(raw.revision!==undefined?{revision:raw.revision}:{}),text:raw.publicText||globalThis.PlayroomMessages.text("ui.engine.81ec674a9b53"),player:raw.player,kind:raw.kind,sound:raw.publicSound??null}];
      const value={...raw};delete value.privateTo;delete value.publicText;delete value.publicSound;
      return [value];
    });
  }
  // One primary cue per committed action; facts remain separate for speech and replay.
  function soundCues(state, viewer, afterEventId = 0) {
    const fallback={move:'move',play:'move',action:'move',draw:'draw',take:'take',attack:'attack',defend:'defend',capture:'attack.capture',roll:'dice',pass:'pass'};
    const semantic={skip:'attack.skip',pass:'pass',discard:'discard',draw:'draw',take:'take',reverse:'reverse'};
    const priorities={skip:90,discard:70,reverse:75,pass:60,take:55,draw:40};
    const sounds={'penalty':85,'uno.call':80,'attack.capture':75,'success.special':65,'success.yatzy':65,'success':60,'mismatch':50};
    const actions=new Map();
    for(const e of projectedEvents(state,viewer).filter(e=>e.id>afterEventId)){
      const id=e.kind==='finish'
        ? state.winner==null?'draw-game':viewer<0||viewer>=state.players.length?'notify':(state.winners||[state.winner]).includes(viewer)?'victory':'defeat'
        : e.sound===null?null:e.sound?.id||semantic[e.feedback?.kind]||fallback[e.kind];
      if(!id)continue;
      const priority=e.kind==='finish'?100:priorities[e.feedback?.kind]||sounds[id]||({draw:40,capture:75,roll:30}[e.kind]??10);
      const revision=e.revision??e.id,previous=actions.get(revision);
      const target=e.sound?.target??e.feedback?.player;
      if(!previous||priority>previous.priority)actions.set(revision,{priority,cue:{id,eventId:e.id,...(target!=null?{target}:{})}});
    }
    return [...actions.values()].map(value=>value.cue);
  }
  const hidden = cards => cards.map(() => ({ hidden: true }));
  function checkedPack(pack) {
    for (const key of ['id', 'name', 'create', 'legal', 'apply']) if (!pack?.[key]) throw Error(globalThis.PlayroomMessages.text("ui.engine.c1e11992534e",{p0:String(key)}));
    const version = pack.version === undefined ? LEGACY_PACK_VERSION : pack.version;
    if (typeof version !== 'string' || !packVersionPattern.test(version)) throw Error(globalThis.PlayroomMessages.text("ui.engine.bdba097f276a"));
    const stateVersion = pack.stateVersion === undefined ? 1 : pack.stateVersion;
    if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) throw Error(globalThis.PlayroomMessages.text("ui.engine.065a7eb766b7"));
    return {...pack, version, stateVersion};
  }
  function registerVersion(pack, {replace = false} = {}) {
    const checked = checkedPack(pack), key = checked.id + '@' + checked.version;
    if (versions.has(key) && !replace) throw Error(globalThis.PlayroomMessages.text("ui.engine.d3c239f81bc5",{p0:String(key)}));
    versions.set(key, checked);return checked;
  }
  function register(pack) {
    const checked = checkedPack(pack);
    if (registry.has(checked.id)) throw Error(globalThis.PlayroomMessages.text("ui.engine.a09b580e1906",{p0:String(checked.id)}));
    versions.set(checked.id + '@' + checked.version, checked);registry.set(checked.id, checked);return checked;
  }
  function registerModel(specification){
    const registration=root.PlayroomModelRegistration||(typeof require==='function'?require('./model-registration.js'):null);
    return register(registration.adapt(api,specification));
  }
  function activatePack(pack) {
    const checked = registerVersion(pack, {replace:true});registry.set(checked.id, checked);return checked;
  }
  function unregisterVersion(id, version) {
    versions.delete(id + '@' + version);
    if (registry.get(id)?.version === version) registry.delete(id);
  }
  function get(id, version) {
    const pack = version === undefined ? registry.get(id) : versions.get(id + '@' + version);
    if (!pack) {
      const error = Error(version === undefined ? globalThis.PlayroomMessages.text("ui.engine.b5f0fc3196f2",{p0:String(id)}) : globalThis.PlayroomMessages.text("ui.engine.251729d95c2a",{p0:String(id),p1:String(version)}));
      if (version !== undefined) Object.assign(error, {code:'PACK_VERSION_MISSING', game:id, packVersion:version});
      throw error;
    }
    return pack;
  }
  const forState = state => get(state.game, state.packVersion);
  function assertState(condition, detail = '') {
    if (!condition) throw Error(globalThis.PlayroomMessages.text("ui.engine.878b97fff87f",{p0:String(detail ? `: ${detail}` : '')}));
  }
  function validateComponents(groups, predicate, count) {
    assertState(groups.every(Array.isArray), globalThis.PlayroomMessages.text("ui.engine.6aef26b85e14"));
    const items = groups.flat();
    assertState(items.length === count && items.every(item => item && typeof item === 'object' && predicate(item)), globalThis.PlayroomMessages.text("ui.engine.162d6c0b30aa"));
    assertState(new Set(items.map(item => item.id)).size === items.length, globalThis.PlayroomMessages.text("ui.engine.1b5a14b3d0a9"));
  }
  // Validate imported authoritative snapshots once at the storage/transport
  // boundary. Normal moves operate on trusted immutable snapshots.
  function validateState(state) {
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const int = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    assertState(record(state) && state.version === 1 && typeof state.game === 'string', globalThis.PlayroomMessages.text("ui.engine.14aec1613eff"));
    assertState((typeof state.packVersion === 'string' && packVersionPattern.test(state.packVersion)), globalThis.PlayroomMessages.text("ui.engine.6517f25bf471"));
    const pack = forState(state);
    assertState((state.packStateVersion === undefined ? 1 : state.packStateVersion) === pack.stateVersion, globalThis.PlayroomMessages.text("ui.engine.a9712cea821a"));
    assertState(Array.isArray(state.players) && int(state.players.length, pack.min, pack.max), globalThis.PlayroomMessages.text("ui.engine.f2dbfc4c1f77"));
    assertState(state.players.every(p => record(p) && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 40 && typeof p.bot === 'boolean' && int(p.score, 0, Number.MAX_SAFE_INTEGER)), globalThis.PlayroomMessages.text("ui.engine.a79bfee304c2"));
    assertState(pack.presets.some(p => p.id === state.preset), globalThis.PlayroomMessages.text("ui.engine.1543f57222df"));
    assertState(int(state.turn, 0, state.players.length - 1) && int(state.move, 0, Number.MAX_SAFE_INTEGER) && int(state.rng, 0, 4294967295), globalThis.PlayroomMessages.text("ui.engine.adf431f9200c"));
    assertState(typeof state.openHands === 'boolean' && ['playing', 'finished'].includes(state.status), globalThis.PlayroomMessages.text("ui.engine.13c168fbfc51"));
    assertState((state.winner === null || int(state.winner, 0, state.players.length - 1)) && (state.status !== 'playing' || state.winner === null), globalThis.PlayroomMessages.text("ui.engine.755a2d9d4024"));
    assertState(state.winners === undefined || (state.status === 'finished' && Array.isArray(state.winners) && state.winners.length > 0 && state.winners[0] === state.winner && new Set(state.winners).size === state.winners.length && state.winners.every(i => int(i, 0, state.players.length - 1))), globalThis.PlayroomMessages.text("ui.engine.9622aa5191c5"));
    if(state.result!==undefined){const result=state.result,n=state.players.length;assertState(state.status==='finished'&&record(result)&&typeof result.label==='string'&&result.label.length<=80&&['asc','desc'].includes(result.order)&&Array.isArray(result.values)&&result.values.length===n&&result.values.every(v=>int(v,0,Number.MAX_SAFE_INTEGER))&&Array.isArray(result.places)&&result.places.length===n&&result.places.every(v=>int(v,1,n)),globalThis.PlayroomMessages.text("ui.engine.8d91204f84a3"));assertState(result.details===undefined||Array.isArray(result.details)&&result.details.length===n&&result.details.every(v=>int(v,0,Number.MAX_SAFE_INTEGER))&&typeof result.detailLabel==='string'&&result.detailLabel.length<=80,globalThis.PlayroomMessages.text("ui.engine.a91603210473"));}
    assertState(record(state.data) && Array.isArray(state.events), globalThis.PlayroomMessages.text("ui.engine.6bb6f415ea1f"));
    let last = 0;
    for (const e of state.events) {
      if(e.visibility){
        const Events=root.PlayroomEvents||(typeof require==='function'?require('./events.js'):null);
        assertState(record(e)&&int(e.id,last+1,Number.MAX_SAFE_INTEGER)&&int(e.revision,0,state.move),globalThis.PlayroomMessages.text("ui.engine.825b4c18b969"));
        Events.validate(e,state.players.length);last=e.id;continue;
      }
      assertState(record(e) && int(e.id, last + 1, Number.MAX_SAFE_INTEGER) && typeof e.text === 'string' && typeof e.kind === 'string' && (e.player === null || int(e.player, 0, state.players.length - 1)), globalThis.PlayroomMessages.text("ui.engine.825b4c18b969"));
      assertState(e.privateTo == null || int(e.privateTo, 0, state.players.length - 1) || (Array.isArray(e.privateTo)&&e.privateTo.length>0&&new Set(e.privateTo).size===e.privateTo.length&&e.privateTo.every(i=>int(i,0,state.players.length-1))), globalThis.PlayroomMessages.text("ui.engine.79ea5bbbdcce"));
      for(const sound of [e.sound,e.publicSound])assertState(sound == null || (record(sound) && typeof sound.id === 'string' && /^[a-z][a-z0-9_.-]{0,63}$/.test(sound.id) && (sound.target == null || int(sound.target, 0, state.players.length - 1))), globalThis.PlayroomMessages.text("ui.engine.5703ca47729d"));
      if(e.transfer!=null){const t=e.transfer;assertState(record(t)&&int(t.player,0,state.players.length-1)&&int(t.count,1,256)&&['stock','hand','table'].includes(t.from)&&(t.fromPlayer===undefined||int(t.fromPlayer,0,state.players.length-1))&&(t.to===undefined||t.to==='table'),globalThis.PlayroomMessages.text("ui.engine.89c6e32481ef"));}
      if(e.presentation!=null){const p=e.presentation;assertState(record(p)&&typeof p.type==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(p.type)&&(p.cell===undefined||int(p.cell,0,4095))&&(p.index===undefined||int(p.index,0,4095)),globalThis.PlayroomMessages.text("ui.engine.1ad6b59580bf"));}
      if(e.speech!=null){const b=e.speech;assertState(record(b)&&int(b.speaker,0,state.players.length-1)&&(b.target===undefined||int(b.target,0,state.players.length-1))&&(b.text===undefined||typeof b.text==='string'&&b.text.length<=100)&&(b.icon===undefined||['cards','cross'].includes(b.icon))&&(b.count===undefined||int(b.count,1,256))&&['success','error','neutral'].includes(b.result||'neutral')&&(typeof b.text==='string'||b.icon!==undefined),globalThis.PlayroomMessages.text("ui.engine.910bcbd74784"));}
      assertState(e.notice == null || (record(e.notice) && typeof e.notice.title === 'string' && e.notice.title.length <= 120 && (e.notice.detail === undefined || (typeof e.notice.detail === 'string' && e.notice.detail.length <= 180)) && (e.notice.tone===undefined||['success','warning','danger'].includes(e.notice.tone))), globalThis.PlayroomMessages.text("ui.engine.346e91f05772"));
      last = e.id;
    }
    if (pack.validateState) pack.validateState(state);
    return true;
  }
  function createGame(game, options = {}) {
    const pack = get(game, options.packVersion), players = options.players || [{ name: globalThis.PlayroomMessages.text("ui.engine.041bfceecc8f") }, ...(pack.max===1?[]:[{ name: globalThis.PlayroomMessages.text("ui.engine.aa691043b447"), bot: true }])];
    if (players.length < pack.min || players.length > pack.max) throw Error(globalThis.PlayroomMessages.text("ui.engine.8d8e0eef63ac",{p0:String(pack.min),p1:String(pack.max)}));
    const preset = options.preset || pack.presets[0].id;
    if (!pack.presets.some(p => p.id === preset)) throw Error(globalThis.PlayroomMessages.text("ui.engine.4046d56fe0ac"));
    const state = { version: 1, game, packVersion:pack.version, packStateVersion:pack.stateVersion, preset, players: players.map((p, i) => ({ name: String(p.name || globalThis.PlayroomMessages.text("ui.engine.97bd9bdf39ef",{p0:String(i + 1)})).slice(0, 40), bot: !!p.bot,...(p.avatar?{avatar:p.avatar}:{}),...(p.botSettings?{botSettings:clone(p.botSettings)}:{}), score: 0 })), turn: 0, status: 'playing', winner: null, move: 0, rng: seedValue(options.seed), openHands: !!options.openHands, data: {}, events: [] };
    const startMode=options.firstPlayerMode||'rules';
    if(!['rules','random','assigned'].includes(startMode))throw Error(globalThis.PlayroomMessages.text("ui.engine.1028063d4dcc"));
    const firstPlayer=startMode==='random'?Math.floor(random(state)*players.length):startMode==='assigned'?options.firstPlayer:null;
    if(firstPlayer!==null&&(!Number.isInteger(firstPlayer)||firstPlayer<0||firstPlayer>=players.length))throw Error(globalThis.PlayroomMessages.text("ui.engine.467f6abb2682"));
    pack.create(state,{...options,resolvedFirstPlayer:firstPlayer});
    state.firstPlayer=state.turn;
    state.firstPlayerMode=startMode;
    event(state, globalThis.PlayroomMessages.text("ui.engine.63f2149e08fb",{p0:String(pack.name)}), null, 'start');
    return state;
  }
  function activePlayer(state, actor) {
    return state.status === 'playing' && Number.isInteger(actor) && actor >= 0 && actor < state.players.length;
  }
  function reactions(state, actor = state.turn) {
    if (!activePlayer(state, actor)) return [];
    return forState(state).reactions?.(state, actor) || [];
  }
  function legalActions(state, actor = state.turn) {
    if (!activePlayer(state, actor)) return [];
    return [...((actor === state.turn || decisionWindow(state)?.participants.includes(actor)) ? forState(state).legal(state, actor) : []), ...reactions(state, actor)];
  }
  function decisionWindow(state) { return forState(state).decisionWindow?.(state)??null; }
  // Packs describe a public reaction window; clocks and transport stay in the app.
  function reactionWindows(state) {
    const pack=forState(state),legacy=pack.reactionWindow?.(state);
    const values=pack.reactionWindows ? pack.reactionWindows(state) : legacy?[legacy]:[];
    if(!Array.isArray(values)||values.length>state.players.length)throw Error(globalThis.PlayroomMessages.text("ui.engine.479cb48842a1"));
    const result=values.map(value=>validateReactionWindow(state,value));
    if(new Set(result.map(w=>w.id)).size!==result.length)throw Error(globalThis.PlayroomMessages.text("ui.engine.34b5b8457a8b"));
    return result;
  }
  function reactionWindow(state) { return reactionWindows(state)[0]||null; }
  function validateReactionWindow(state,value) {
    const int = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id) ||
        !int(value.owner, 0, state.players.length - 1) || !int(value.revision, 0, state.move) ||
        !int(value.humanMs, 0, 60000) || !int(value.botMs, value.humanMs, 60000) ||
        !int(value.fallbackMs, 0, 60000)) throw Error(globalThis.PlayroomMessages.text("ui.engine.d06c87d09f03"));
    return clone({id:value.id,owner:value.owner,revision:value.revision,humanMs:value.humanMs,botMs:value.botMs,fallbackMs:value.fallbackMs});
  }
  function reactionControl(state, actor, action) {
    if (!activePlayer(state, actor) || !action || typeof action !== 'object') return null;
    const value = forState(state).reactionControl?.(state, actor, action);
    if (value == null) return null;
    if (!value || !['answer','challenge','advance','independent'].includes(value.kind) ||
        (value.ignore !== undefined && typeof value.ignore !== 'boolean') ||
        (value.independent !== undefined && typeof value.independent !== 'boolean') ||
        (value.episode !== undefined && (!Number.isSafeInteger(value.episode) || value.episode < 0))) throw Error(globalThis.PlayroomMessages.text("ui.engine.da9ca6755a24"));
    return clone(value);
  }
  function applyAction(state, actor, action) {
    if (!action || typeof action !== 'object') throw Error(globalThis.PlayroomMessages.text("ui.engine.f8ee9d2e73da"));
    if (reactionControl(state, actor, action)?.ignore) return state;
    const pack=forState(state);
    const legal=pack.resolveAction?(activePlayer(state,actor)?pack.resolveAction(state,actor,action):null):
      legalActions(state, actor).find(candidate => Object.keys(candidate).filter(k => !['label', 'notify', 'confirmation', 'targetPrompt', 'targetKind'].includes(k)).every(k => (k === 'episode' && action[k] === undefined) || JSON.stringify(candidate[k]) === JSON.stringify(action[k])));
    if (!legal) throw Error(globalThis.PlayroomMessages.text("ui.engine.a5bdf3185a7d"));
    const next = clone(state);
    next.move++;
    forState(next).apply(next, actor, legal);
    return next;
  }
  function project(state, viewer) {
    const out = {...clone(state),data:{}}, pack = forState(state);
    if (!Number.isInteger(viewer) || viewer < 0 || viewer >= state.players.length) viewer = -1;
    delete out.rng;
    out.events = projectedEvents(state,viewer);
    if (pack.project) pack.project(out, viewer, state);
    return out;
  }
  function projectTable(state, actor) {
    const out = project(state, -1), projection = forState(state).tableProjection?.(state, actor);
    out.tableActor = projection?.actor ?? -1;
    out.tableActions = forState(state).tableChoices?.(state,actor) ?? projection?.actions ?? [];
    if (projection) {out.modelProjection = projection;out.scene=forState(state).scene(projection,state.players);}
    return out;
  }
  function tableCommand(state, actor, action) {
    const authorize = forState(state).tableCommand;
    if (!authorize) throw Error(globalThis.PlayroomMessages.text("ui.engine.6335b5ac9ccf"));
    return authorize(state, actor, action);
  }
  function applyTableAction(state, actor, action) {
    return applyAction(state, actor, tableCommand(state, actor, action));
  }
  function botAction(state, actor = state.turn) {
    if (!activePlayer(state, actor) || (actor !== state.turn && !decisionWindow(state)?.participants.includes(actor)) || decisionWindow(state)?.ready.includes(actor)) return null;
    // Reactions have their own scheduler; normal bots must not loop on an
    // always-available declaration or accusation instead of taking their turn.
    const actions = forState(state).legal(state, actor);
    if (!actions.length) return null;
    return forState(state).bot?.(state, actor, actions) || actions[0];
  }
  function botReaction(state, actor = state.turn) {
    const actions = reactions(state, actor);
    if (!actions.length) return null;
    const chosen = forState(state).botReaction?.(state, actor, actions);
    return chosen ? actions.find(candidate => Object.keys(candidate).filter(key => !['label', 'notify', 'confirmation', 'targetPrompt', 'targetKind'].includes(key)).every(key => JSON.stringify(candidate[key]) === JSON.stringify(chosen[key]))) || null : null;
  }
  // Optional generic components for custom packs: multiple named decks, hands,
  // boards and counters can coexist; visibility is explicit per zone/item.
  function createZone(id, { type = 'deck', items = [], visibility = 'hidden', owner = null } = {}) {
    return { id, type, items: clone(items), visibility, owner };
  }
  function moveComponent(zones, from, to, id, index) {
    const source = zones[from], target = zones[to];
    if (!source || !target) throw Error(globalThis.PlayroomMessages.text("ui.engine.07802c7aad57"));
    const at = source.items.findIndex(item => item.id === id);
    if (at < 0) throw Error(globalThis.PlayroomMessages.text("ui.engine.c1db6ecf332c"));
    const item = source.items.splice(at, 1)[0];
    target.items.splice(index == null ? target.items.length : index, 0, item);
    return item;
  }
  function reveal(zones, zone, id, visible = true) {
    const item = zones[zone]?.items.find(item => item.id === id);
    if (!item) throw Error(globalThis.PlayroomMessages.text("ui.engine.c1db6ecf332c"));
    item.revealed = visible;
    return item;
  }
  function projectZones(zones, viewer) {
    const out = clone(zones);
    for (const zone of Object.values(out)) zone.items = zone.items.map(item => zone.visibility === 'public' || (zone.visibility === 'owner' && Number.isInteger(viewer) && viewer >= 0 && viewer === zone.owner) || item.revealed ? item : { hidden: true });
    return out;
  }
  const api = { registerModel, register, registerVersion, activatePack, unregisterVersion, get, createGame, legalActions, decisionWindow, reactions, reactionWindow, reactionWindows, reactionControl, applyAction, applyTableAction, tableCommand, project, projectTable, botAction, botReaction, validateState, assertState, validateComponents, shuffle, rollDie, random, clone, hidden, event, finish, complete, soundCues, createZone, moveComponent, reveal, projectZones };
  Object.defineProperty(api, 'GAMES', { enumerable: true, get: () => clone([...registry.values()].map(({ id, version, stateVersion, name, min, max, description, rules, presets, scoreLabel, botSettings }) => ({ id, version, stateVersion, name, min, max, description, rules, presets, scoreLabel, ...(botSettings?{botSettings}:{}) }))) });
  root.TabletopCore = root.PlayroomEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
