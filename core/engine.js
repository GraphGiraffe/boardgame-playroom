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
    if (!Number.isInteger(sides) || sides < 2 || sides > 1000) throw Error('У кубика должно быть от 2 до 1000 граней');
    return Random.rollDie(sides, state, Math.random);
  }
  function event(state, text, player = null, kind = 'action', extra = {}) {
    state.events.push({ id: (state.events.at(-1)?.id || 0) + 1, text, player, kind, ...extra });
  }
  function finish(state, winner, text, points = 1) {
    state.status = 'finished';
    const winners = Array.isArray(winner) ? [...new Set(winner)] : winner == null ? [] : [winner];
    state.winner = winners[0] ?? null;
    if (Array.isArray(winner)) state.winners = winners;
    for (const player of winners) state.players[player].score += points;
    const summary=forState(state).result?.(state);
    const values=summary?.values??state.players.map((_,index)=>winners.includes(index)?1:0);
    if(!Array.isArray(values)||values.length!==state.players.length||values.some(value=>!Number.isSafeInteger(value)||value<0))throw Error('Некорректный итог пака');
    if(summary?.details!==undefined&&(!Array.isArray(summary.details)||summary.details.length!==values.length||summary.details.some(value=>!Number.isSafeInteger(value)||value<0)))throw Error('Некорректная статистика пака');
    const order=summary?.order==='asc'?'asc':'desc',places=values.map(value=>1+new Set(values.filter(other=>order==='asc'?other<value:other>value)).size);
    state.result={label:summary?.label||'Победа',values,places,order,...(summary?.details?{detailLabel:summary.detailLabel||'Показатель',details:summary.details}:{})};
    event(state, text || (!winners.length ? 'Ничья' : `${state.players[winners[0]].name} побеждает`), state.winner, 'finish');
  }
  // Presentation metadata stays independent of Web Audio and of game rules.
  // Only new, visible events produce cues; rendering/restoring a snapshot is silent.
  function soundCues(state, viewer, afterEventId = 0) {
    const fallback = {move:'move',play:'move',action:'move',draw:'draw',take:'draw',attack:'attack',defend:'defend',capture:'attack.capture',roll:'dice',pass:'notify'};
    return state.events.filter(e => e.id > afterEventId).flatMap(raw => {
      const visible=raw.privateTo==null||(Array.isArray(raw.privateTo)?raw.privateTo.includes(viewer):raw.privateTo===viewer);
      const e=visible?raw:{...raw,sound:raw.publicSound??null};
      const id = e.kind === 'finish'
        ? state.winner == null ? 'draw-game' : viewer < 0 || !Number.isInteger(viewer) || viewer >= state.players.length ? 'notify' : (state.winners || [state.winner]).includes(viewer) ? 'victory' : 'defeat'
        : e.sound===null?null:e.sound?.id || fallback[e.kind];
      return id ? [{id, eventId:e.id, ...(e.sound?.target != null ? {target:e.sound.target} : {})}] : [];
    });
  }
  const hidden = cards => cards.map(() => ({ hidden: true }));
  function checkedPack(pack) {
    for (const key of ['id', 'name', 'create', 'legal', 'apply']) if (!pack?.[key]) throw Error(`В наборе отсутствует ${key}`);
    const version = pack.version === undefined ? LEGACY_PACK_VERSION : pack.version;
    if (typeof version !== 'string' || !packVersionPattern.test(version)) throw Error('Некорректная версия набора');
    const stateVersion = pack.stateVersion === undefined ? 1 : pack.stateVersion;
    if (!Number.isSafeInteger(stateVersion) || stateVersion < 1) throw Error('Некорректная версия данных набора');
    return {...pack, version, stateVersion};
  }
  function registerVersion(pack, {replace = false} = {}) {
    const checked = checkedPack(pack), key = checked.id + '@' + checked.version;
    if (versions.has(key) && !replace) throw Error(`Версия набора ${key} уже зарегистрирована`);
    versions.set(key, checked);return checked;
  }
  function register(pack) {
    const checked = checkedPack(pack);
    if (registry.has(checked.id)) throw Error(`Набор ${checked.id} уже зарегистрирован`);
    versions.set(checked.id + '@' + checked.version, checked);registry.set(checked.id, checked);return checked;
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
      const error = Error(version === undefined ? `Неизвестная игра: ${id}` : `Нужен набор ${id} версии ${version}`);
      if (version !== undefined) Object.assign(error, {code:'PACK_VERSION_MISSING', game:id, packVersion:version});
      throw error;
    }
    return pack;
  }
  const forState = state => get(state.game, state.packVersion || LEGACY_PACK_VERSION);
  function assertState(condition, detail = '') {
    if (!condition) throw Error(`Некорректное состояние игры${detail ? `: ${detail}` : ''}`);
  }
  function validateComponents(groups, predicate, count) {
    assertState(groups.every(Array.isArray), 'зоны компонентов');
    const items = groups.flat();
    assertState(items.length === count && items.every(item => item && typeof item === 'object' && predicate(item)), 'состав компонентов');
    assertState(new Set(items.map(item => item.id)).size === items.length, 'повторяющиеся компоненты');
  }
  // Validate imported authoritative snapshots once at the storage/transport
  // boundary. Normal moves operate on trusted immutable snapshots.
  function validateState(state) {
    const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const int = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    assertState(record(state) && state.version === 1 && typeof state.game === 'string', 'версия и игра');
    assertState(state.packVersion === undefined || (typeof state.packVersion === 'string' && packVersionPattern.test(state.packVersion)), 'версия набора');
    const pack = forState(state);
    assertState((state.packStateVersion === undefined ? 1 : state.packStateVersion) === pack.stateVersion, 'версия данных набора');
    assertState(Array.isArray(state.players) && int(state.players.length, pack.min, pack.max), 'игроки');
    assertState(state.players.every(p => record(p) && typeof p.name === 'string' && p.name.length > 0 && p.name.length <= 40 && typeof p.bot === 'boolean' && int(p.score, 0, Number.MAX_SAFE_INTEGER)), 'данные игроков');
    assertState(pack.presets.some(p => p.id === state.preset), 'набор правил');
    assertState(int(state.turn, 0, state.players.length - 1) && int(state.move, 0, Number.MAX_SAFE_INTEGER) && int(state.rng, 0, 4294967295), 'ход и генератор');
    assertState(typeof state.openHands === 'boolean' && ['playing', 'finished'].includes(state.status), 'статус');
    assertState((state.winner === null || int(state.winner, 0, state.players.length - 1)) && (state.status !== 'playing' || state.winner === null), 'победитель');
    assertState(state.winners === undefined || (state.status === 'finished' && Array.isArray(state.winners) && state.winners.length > 0 && state.winners[0] === state.winner && new Set(state.winners).size === state.winners.length && state.winners.every(i => int(i, 0, state.players.length - 1))), 'победители');
    if(state.result!==undefined){const result=state.result,n=state.players.length;assertState(state.status==='finished'&&record(result)&&typeof result.label==='string'&&result.label.length<=80&&['asc','desc'].includes(result.order)&&Array.isArray(result.values)&&result.values.length===n&&result.values.every(v=>int(v,0,Number.MAX_SAFE_INTEGER))&&Array.isArray(result.places)&&result.places.length===n&&result.places.every(v=>int(v,1,n)),'итог');assertState(result.details===undefined||Array.isArray(result.details)&&result.details.length===n&&result.details.every(v=>int(v,0,Number.MAX_SAFE_INTEGER))&&typeof result.detailLabel==='string'&&result.detailLabel.length<=80,'детали итога');}
    assertState(record(state.data) && Array.isArray(state.events), 'данные и события');
    let last = 0;
    for (const e of state.events) {
      assertState(record(e) && int(e.id, last + 1, Number.MAX_SAFE_INTEGER) && typeof e.text === 'string' && typeof e.kind === 'string' && (e.player === null || int(e.player, 0, state.players.length - 1)), 'событие');
      assertState(e.privateTo == null || int(e.privateTo, 0, state.players.length - 1) || (Array.isArray(e.privateTo)&&e.privateTo.length>0&&new Set(e.privateTo).size===e.privateTo.length&&e.privateTo.every(i=>int(i,0,state.players.length-1))), 'видимость события');
      for(const sound of [e.sound,e.publicSound])assertState(sound == null || (record(sound) && typeof sound.id === 'string' && /^[a-z][a-z0-9_.-]{0,63}$/.test(sound.id) && (sound.target == null || int(sound.target, 0, state.players.length - 1))), 'звук события');
      if(e.transfer!=null){const t=e.transfer;assertState(record(t)&&int(t.player,0,state.players.length-1)&&int(t.count,1,256)&&['stock','hand','table'].includes(t.from)&&(t.fromPlayer===undefined||int(t.fromPlayer,0,state.players.length-1))&&(t.to===undefined||t.to==='table'),'передача компонентов');}
      if(e.presentation!=null){const p=e.presentation;assertState(record(p)&&typeof p.type==='string'&&/^[a-z][a-z0-9_-]{0,31}$/.test(p.type)&&(p.cell===undefined||int(p.cell,0,4095))&&(p.index===undefined||int(p.index,0,4095)),'представление действия');}
      if(e.speech!=null){const b=e.speech;assertState(record(b)&&int(b.speaker,0,state.players.length-1)&&(b.target===undefined||int(b.target,0,state.players.length-1))&&(b.text===undefined||typeof b.text==='string'&&b.text.length<=100)&&(b.icon===undefined||['cards','cross'].includes(b.icon))&&(b.count===undefined||int(b.count,1,256))&&['success','error','neutral'].includes(b.result||'neutral')&&(typeof b.text==='string'||b.icon!==undefined),'реплика игрока');}
      assertState(e.notice == null || (record(e.notice) && typeof e.notice.title === 'string' && e.notice.title.length <= 120 && (e.notice.detail === undefined || (typeof e.notice.detail === 'string' && e.notice.detail.length <= 180)) && (e.notice.tone===undefined||['success','warning','danger'].includes(e.notice.tone))), 'объявление события');
      last = e.id;
    }
    if (pack.validateState) pack.validateState(state);
    return true;
  }
  function createGame(game, options = {}) {
    const pack = get(game, options.packVersion), players = options.players || [{ name: 'Вы' }, { name: 'Бот', bot: true }];
    if (players.length < pack.min || players.length > pack.max) throw Error(`Для игры нужно ${pack.min}–${pack.max} игроков`);
    const preset = options.preset || pack.presets[0].id;
    if (!pack.presets.some(p => p.id === preset)) throw Error('Неизвестный набор правил');
    const state = { version: 1, game, packVersion:pack.version, packStateVersion:pack.stateVersion, preset, players: players.map((p, i) => ({ name: String(p.name || `Игрок ${i + 1}`).slice(0, 40), bot: !!p.bot, score: 0 })), turn: 0, status: 'playing', winner: null, move: 0, rng: seedValue(options.seed), openHands: !!options.openHands, data: {}, events: [] };
    const startMode=options.firstPlayerMode||'rules';
    if(!['rules','random','assigned'].includes(startMode))throw Error('Неизвестный способ выбора первого игрока');
    const firstPlayer=startMode==='random'?Math.floor(random(state)*players.length):startMode==='assigned'?options.firstPlayer:null;
    if(firstPlayer!==null&&(!Number.isInteger(firstPlayer)||firstPlayer<0||firstPlayer>=players.length))throw Error('Выберите первого игрока');
    pack.create(state,{...options,resolvedFirstPlayer:firstPlayer});
    state.firstPlayer=state.turn;
    state.firstPlayerMode=startMode;
    event(state, `${pack.name}: партия началась`, null, 'start');
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
    return [...(actor === state.turn ? forState(state).legal(state, actor) : []), ...reactions(state, actor)];
  }
  // Packs describe a public reaction window; clocks and transport stay in the app.
  function reactionWindows(state) {
    const pack=forState(state),legacy=pack.reactionWindow?.(state);
    const values=pack.reactionWindows ? pack.reactionWindows(state) : legacy?[legacy]:[];
    if(!Array.isArray(values)||values.length>state.players.length)throw Error('Некорректные окна реакции пака');
    const result=values.map(value=>validateReactionWindow(state,value));
    if(new Set(result.map(w=>w.id)).size!==result.length)throw Error('Повтор окна реакции');
    return result;
  }
  function reactionWindow(state) { return reactionWindows(state)[0]||null; }
  function validateReactionWindow(state,value) {
    const int = (n, min, max) => Number.isSafeInteger(n) && n >= min && n <= max;
    if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_.:-]{1,128}$/.test(value.id) ||
        !int(value.owner, 0, state.players.length - 1) || !int(value.revision, 0, state.move) ||
        !int(value.humanMs, 0, 60000) || !int(value.botMs, value.humanMs, 60000) ||
        !int(value.fallbackMs, 0, 60000)) throw Error('Некорректное окно реакции пака');
    return clone({id:value.id,owner:value.owner,revision:value.revision,humanMs:value.humanMs,botMs:value.botMs,fallbackMs:value.fallbackMs});
  }
  function reactionControl(state, actor, action) {
    if (!activePlayer(state, actor) || !action || typeof action !== 'object') return null;
    const value = forState(state).reactionControl?.(state, actor, action);
    if (value == null) return null;
    if (!value || !['answer','challenge','advance','independent'].includes(value.kind) ||
        (value.ignore !== undefined && typeof value.ignore !== 'boolean') ||
        (value.independent !== undefined && typeof value.independent !== 'boolean') ||
        (value.episode !== undefined && (!Number.isSafeInteger(value.episode) || value.episode < 0))) throw Error('Некорректная реакция пака');
    return clone(value);
  }
  function applyAction(state, actor, action) {
    if (!action || typeof action !== 'object') throw Error('Не задано действие');
    if (reactionControl(state, actor, action)?.ignore) return state;
    const legal = legalActions(state, actor).find(candidate => Object.keys(candidate).filter(k => !['label', 'notify', 'confirmation', 'targetPrompt', 'targetKind'].includes(k)).every(k => (k === 'episode' && action[k] === undefined) || JSON.stringify(candidate[k]) === JSON.stringify(action[k])));
    if (!legal) throw Error('Этот ход сейчас недоступен');
    const next = clone(state);
    next.move++;
    forState(next).apply(next, actor, legal);
    return next;
  }
  function project(state, viewer) {
    const out = clone(state), pack = forState(state);
    if (!Number.isInteger(viewer) || viewer < 0 || viewer >= state.players.length) viewer = -1;
    delete out.rng;
    if (out.data.hands) out.data.hands = out.data.hands.map((hand, index) => index === viewer || out.openHands ? hand : hidden(hand));
    for (const key of ['drawPile', 'stock']) if (out.data[key]) out.data[key] = hidden(out.data[key]);
    out.events = out.events.map(e => {
      if (e.privateTo != null && !(Array.isArray(e.privateTo)?e.privateTo.includes(viewer):e.privateTo===viewer)) return { id: e.id, text: e.publicText || 'Игрок совершил скрытое действие', player: e.player, kind: e.kind, sound:e.publicSound??null };
      const event = { ...e }; delete event.privateTo; delete event.publicText;delete event.publicSound; return event;
    });
    if (pack.project) pack.project(out, viewer, state);
    return out;
  }
  function projectTable(state, actor) {
    const out = project(state, -1), projection = forState(state).tableProjection?.(state, actor);
    out.tableActor = projection?.actor ?? -1;
    out.tableActions = projection?.actions ?? [];
    if (projection) out.modelProjection = projection;
    return out;
  }
  function applyTableAction(state, actor, action) {
    const authorize = forState(state).tableCommand;
    if (!authorize) throw Error('Пак не объявил публичные действия Стола');
    return applyAction(state, actor, authorize(state, actor, action));
  }
  function botAction(state, actor = state.turn) {
    if (!activePlayer(state, actor) || actor !== state.turn) return null;
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
    if (!source || !target) throw Error('Зона не найдена');
    const at = source.items.findIndex(item => item.id === id);
    if (at < 0) throw Error('Компонент не найден');
    const item = source.items.splice(at, 1)[0];
    target.items.splice(index == null ? target.items.length : index, 0, item);
    return item;
  }
  function reveal(zones, zone, id, visible = true) {
    const item = zones[zone]?.items.find(item => item.id === id);
    if (!item) throw Error('Компонент не найден');
    item.revealed = visible;
    return item;
  }
  function projectZones(zones, viewer) {
    const out = clone(zones);
    for (const zone of Object.values(out)) zone.items = zone.items.map(item => zone.visibility === 'public' || (zone.visibility === 'owner' && Number.isInteger(viewer) && viewer >= 0 && viewer === zone.owner) || item.revealed ? item : { hidden: true });
    return out;
  }
  const api = { register, registerVersion, activatePack, unregisterVersion, get, createGame, legalActions, reactions, reactionWindow, reactionWindows, reactionControl, applyAction, applyTableAction, project, projectTable, botAction, botReaction, validateState, assertState, validateComponents, shuffle, rollDie, random, clone, hidden, event, finish, soundCues, createZone, moveComponent, reveal, projectZones };
  Object.defineProperty(api, 'GAMES', { enumerable: true, get: () => clone([...registry.values()].map(({ id, version, stateVersion, name, min, max, description, rules, presets, scoreLabel }) => ({ id, version, stateVersion, name, min, max, description, rules, presets, scoreLabel }))) });
  root.TabletopCore = root.PlayroomEngine = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
