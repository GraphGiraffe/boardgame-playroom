/* Run with Node 22+ and PLAYWRIGHT_MODULE pointing to installed playwright-core.
   CHROME_BIN optionally selects a browser; system or managed Chromium is the fallback. No app/server required. */
'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const sharedKit = path.join(path.dirname(fs.realpathSync(path.join(root, 'packs'))), 'shared/view-kit.js');
const games = ['uno', 'domino', 'durak', 'checkers', 'snakes'];
const loadedGames=[...games,'ludo','pexeso','battleship','yatzy','oldmaid','gofish','klondike','spider','mage-brawl'];
const sandbox = vm.createContext({ console });
for (const file of ['core/messages.js','core/random.js','core/model-values.js','core/events.js','core/bot-difficulty.js','core/model-runtime.js','presentation/localization.js','presentation/scene-contract.js','core/model-registration.js','core/engine.js', 'shared/domain/standard-deck.js', ...loadedGames.map(g => `packs/${g}/rules.js`), 'core/component-assets.js','core/game-components.js','core/token-layout.js','core/ui.js', 'app/views.js', 'shared/view-kit.js', ...loadedGames.map(g => `packs/${g}/view.js`)]) {
  const match=file.match(/^packs\/([^/]+)\/(rules|view)\.js$/);
  if(match){
    const base=path.join(root,'packs',match[1]),manifest=JSON.parse(fs.readFileSync(path.join(base,'manifest.json'),'utf8'));
    sandbox.PlayroomPack={...manifest,asset:()=>'',adaptModel:spec=>sandbox.PlayroomModelRegistration.adapt(sandbox.TabletopCore,spec)};
    const catalogs={};for(const [locale,files]of Object.entries(manifest.sourceModules?.locales||{})){
      catalogs[locale]=Object.assign({},...files.map(name=>JSON.parse(fs.readFileSync(path.join(base,name),'utf8'))));
    }
    sandbox.PlayroomPackResources={locales:catalogs};
    if(match[2]==='view'){
      const loaded=new Set();
      const loadAsset=id=>{if(loaded.has(id))return;loaded.add(id);
        const dir=path.join(path.dirname(sharedKit),'asset-packs',id),spec=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
        for(const dependency of spec.dependencies||[])loadAsset(dependency.id);
        for(const name of spec.scripts||[])vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),sandbox,{filename:id+'/'+name});
      };
      for(const id of manifest.sharedAssetPacks||[])loadAsset(id);
    }
    for(const name of manifest.sharedDomain||[])vm.runInContext(fs.readFileSync(path.join(path.dirname(sharedKit),'domain',name+'.js'),'utf8'),sandbox,{filename:name});
    for(const name of manifest.sourceModules?.[match[2]]||[])vm.runInContext(fs.readFileSync(path.join(base,name),'utf8'),sandbox,{filename:name});
  }
  vm.runInContext(fs.readFileSync(file.startsWith('shared/')?path.join(path.dirname(sharedKit),file.slice(7)):path.join(root, file), 'utf8'), sandbox, { filename: file });
}
const E = sandbox.TabletopCore, V = sandbox.PlayroomViews;
const clone = value => JSON.parse(JSON.stringify(value));
const make = (game, preset = 'classic', count = 2, seed = 17) => E.createGame(game, { preset, seed, players: Array.from({ length: count }, (_, i) => ({ name: `Игрок ${i + 1}` })) });
const render = (state, viewer = state.turn, selected = null, actions = E.legalActions(state, viewer),viewState={}) => V.render(E.project(state, viewer), viewer, actions, { selected,viewState, flipped: viewer === 1 });
const decode = value => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const actionsIn = html => [...html.matchAll(/data-action="([^"]+)"/g)].map(m => JSON.parse(decode(m[1])));
const signature = action => JSON.stringify(Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'label').sort(([a], [b]) => a.localeCompare(b))));

test('standalone UI shares source and target policies without browser or game dependencies', () => {
  const UI = require('../core/ui.js'), H = UI.helpers;
  const id = 'card"<&', one = [{type:'play',card:id,label:'Play "<&'}];
  const many = [...one, {type:'play',card:id,color:'blue',label:'Choose blue'}];
  const selected = H.source(id,one,id,{mode:'select',preview:true,inspect:true,drag:true,swipe:true});
  assert.deepEqual(actionsIn(selected.attr), []);
  assert.match(selected.attr, /data-select="card&quot;&lt;&amp;"/);
  assert.match(selected.attr, /data-drag-piece="card&quot;&lt;&amp;"/);
  assert.match(selected.attr, /data-hand-preview="card&quot;&lt;&amp;"/);
  assert.match(selected.className, /is-playable.*is-selected/);
  assert.deepEqual(JSON.parse(decode(selected.attr.match(/data-swipe-action="([^"]+)"/)[1])), one[0]);
  assert.deepEqual(actionsIn(H.source(id,one,null,{mode:'immediate'}).attr), one);
  const ambiguous = H.source(id,many,null,{mode:'immediate',drag:true,swipe:true});
  assert.deepEqual(actionsIn(ambiguous.attr), []);
  assert.match(ambiguous.attr, /data-swipe-select=/);
  const inspected = H.source(id,[],id,{preview:true,inspect:true,drag:true,swipe:true});
  assert.match(inspected.attr, /data-select=.*data-hand-preview=/);
  assert.doesNotMatch(inspected.attr, /disabled|data-action=|data-drag-piece=|data-swipe-/);
  assert.match(H.source(id,[],null,{drag:true,swipe:true}).attr, /disabled/);
  const zero = H.source(0,[{type:'move',from:0,to:9}], '0', {key:'from',drag:true,className:'checker-piece'});
  assert.equal(zero.choices.length,1); assert.match(zero.attr,/data-drag-piece="0"/);
  assert.match(zero.className,/checker-piece.*is-selected/);
  assert.deepEqual(actionsIn(H.target(id,one[0])),one);
  assert.match(H.target(id,many), /data-drop-select="card&quot;&lt;&amp;"/);
  assert.deepEqual(actionsIn(H.target(id,many)),[]);
  const first=UI.createRegistry(), second=UI.createRegistry();
  first.register('example',()=>({api:3,family:'board',elements:{field:'<p>Ready</p>'}}),()=>'<svg></svg>');
  assert.equal(first.render({game:'example'},0,[]),UI.composeScene({api:3,family:'board',elements:{field:'<p>Ready</p>'}},{state:{game:'example'}}));
  assert.equal(first.cover('example'),'<svg></svg>');
  assert.equal(second.cover('example'),'');
  assert.equal(first.helpers,UI.helpers);
  assert.match(H.countBadge(0,'Колода <&'),/data-piece-count="0" aria-label="Колода &lt;&amp;: 0"[^>]*>0<\/span>/);
  assert.match(H.countBadge(7,'Рука',{hand:true}),/piece-count is-hand/);
  assert.doesNotMatch(H.hand([],0),/piece-count/);
  for(const count of [-1,1.5,NaN,'7'])assert.throws(()=>H.countBadge(count));
  for(const [person,network,role,status] of [
    [{},false,'player','neutral'],[{bot:true,connected:true},true,'bot','neutral'],
    [{local:true,connected:true},true,'hand','neutral'],[{connected:false},true,'player','neutral'],
    [{connected:true},false,'player','neutral'],[{connected:true},true,'player','online'],
    [{connected:false,hasConnected:true},true,'player','offline'],
    [{connected:false,joinedAt:1,isHost:true},true,'player','offline'],
    [{role:'spectator',connected:true},true,'eye','online'],[{role:'table',isHost:true,connected:true},true,'grid','online']
  ]) {const html=H.participantIcon(person,{network});assert.match(html,new RegExp('data-participant-role="'+role+'"'));assert.match(html,new RegExp('data-connection="'+status+'"'));}
  const both=H.playerPanel({players:[{name:'A <&',score:9}],turn:0},0,0,{counters:[{kind:'wins',value:3},{kind:'points',value:9,label:'Очки <&'}]});
  assert.match(both,/data-score-kind="points"[^>]*aria-label="Очки &lt;&amp;: 9"/);
  assert.match(both,/is-wins[^>]*data-score-kind="wins"/);assert(both.indexOf('data-score-kind="points"')<both.indexOf('data-score-kind="wins"'));
  assert.doesNotMatch(both,/>Игрок|>Бот|очки:|победы:/);
  for(const counters of [[{kind:'points',value:-1}],[{kind:'wins',value:1.5}],[{kind:'unknown',value:2}],[{kind:'wins',value:2,label:3}],[{kind:'points',value:0},{kind:'points',value:1}]])assert.throws(()=>UI.composeScene({api:3,family:'cards',elements:{field:'x'},playerContent:[{counters}]}));

  const pieces=H.playerPanel({players:[{name:'A',score:0}],turn:0},0,0,{counters:[{kind:'wins',value:0},{kind:'pieces',value:12,label:'Светлые шашки'}]});
  assert.match(pieces,/is-pieces[^>]*aria-label="Светлые шашки: 12"[^>]*><svg class="round-token-art medallion-art"/);
  assert.doesNotMatch(pieces,/>12 шашек</);
  const empty=H.playerPanel({players:[{name:'A'},{name:'B'}],turn:1},1,0,{handCount:0});
  assert.match(empty,/piece-count is-hand[^>]*data-piece-count="0"/);assert.match(empty,/class="mini-hand [^"]*"[^>]*><\/div>/);
});

test('every legal action remains reachable through card, colour, side or cell selection', () => {
  for (const game of games) for (const {id:preset} of E.get(game).presets) for (const count of [2, ...(E.get(game).max === 4 ? [4] : [])]) {
    for (const seed of [1, 7, 21]) {
      let state = make(game, preset, count, seed);
      for (let step = 0; step < 18 && state.status === 'playing'; step++) {
        const legal = E.legalActions(state), before = JSON.stringify(state);
        const selected = [null, ...new Set(legal.flatMap(a => a.card ? [a.card] : a.from != null ? [String(a.from)] : []))];
        const choices=state.game==='snakes'&&state.data.adjusting?[-1,1].map(delta=>({adjustDelta:state.move+':'+delta})):[{}];
        const html = selected.flatMap(value => choices.map(viewState=>render(state, state.turn, value,legal,viewState)));
        const reachable = new Set(html.flatMap(actionsIn).map(signature));
        for (const action of legal) assert.ok(reachable.has(signature(action)), `${game}/${preset}: ${action.label}`);
        for (const content of html) assert.doesNotMatch(content, /undefined|NaN|Infinity/, game);
        assert.equal(JSON.stringify(state), before, 'render must not mutate the state');
        state = E.applyAction(state, state.turn, E.botAction(state));
      }
    }
  }
});

test('scene renderers do not read domain projection data', () => {
  for (const game of ['uno','checkers','ludo','pexeso','battleship','yatzy','domino','oldmaid','gofish','durak','snakes','klondike','spider','mage-brawl']) {
    let state=make(game,E.get(game).presets[0].id,Math.min(2,E.get(game).max));
    for(let step=0;step<12&&state.status==='playing';step++) {
      for(const viewer of [-1,...state.players.map((_,i)=>i)]) {
        const projected=E.project(state,viewer),actions=E.legalActions(state,viewer);
        const options={selected:actions.find(a=>a.card)?.card??actions.find(a=>a.from!=null)?.from??null};
        const expected=V.render(projected,viewer,actions,options);
        assert.doesNotMatch(expected,/role="alert"/,game+' must render successfully');
        assert.deepEqual(V.get(game).render({...projected,data:{},modelProjection:null},viewer,actions,options),V.get(game).render(projected,viewer,actions,options),game+' raw renderer step '+step);
        assert.equal(V.render({...projected,data:{},modelProjection:null},viewer,actions,options),expected,game+' step '+step);
        assert(V.renderField(projected,viewer,projected.scene,options).length>0,game+' semantic field');
      }
      state=E.applyAction(state,state.turn,(['klondike','spider'].includes(game)?E.legalActions(state,state.turn).find(a=>a.type!=='undo'):E.botAction(state)));
    }
  }
});

test('private hands/decks do not leak identities; public hands retain every card', () => {
  for (const game of ['uno', 'domino', 'durak']) {
    const state = make(game), hand = state.data.hands[1];
    const stock = state.data.drawPile || state.data.stock;
    hand.push(...stock.splice(1, Math.min(12, stock.length - 1)));
    const hidden=render(state,0),handoff=render(state,-1);
    for(const card of [...hand,...stock])for(const html of [hidden,handoff]){
      assert(!html.includes('card-'+card.id+'"')&&!html.includes('tile-'+card.id+'"'),game+': private component identity leaked');
    }

    state.openHands = true;
    const html = render(state, 0);
    for (const card of hand) assert.ok(html.includes(`-${card.id}"`), `${game}: public card omitted`);
    for(const card of stock)assert(!html.includes('card-'+card.id+'"')&&!html.includes('tile-'+card.id+'"'),game+': public-hands mode leaked stock');
  }
});

test('domino selection exposes only legal table targets with the exact resulting orientation', () => {
  const covered = new Set();
  for (const seed of [1, 7, 17]) {
    let state = make('domino', 'classic', 2, seed);
    for (let step = 0; step < 70 && state.status === 'playing'; step++) {
      const legal = E.legalActions(state), unselected = render(state);
      assert.doesNotMatch(unselected, /data-drop-piece=/, 'targets require a selected tile');
      const ownHand = unselected.slice(unselected.indexOf('<section class="own-hand"'));
      assert.doesNotMatch(ownHand, /data-action=/, 'clicking a hand tile must never play immediately');
      for (const cardId of new Set(legal.filter(a => a.card).map(a => a.card))) {
        const html = render(state, state.turn, cardId);
        const previews = [...html.matchAll(/<button class="domino-drop-target [^"]*"([^>]*)>/g)].map(m => {
          const attrs = m[1], action = actionsIn(m[0])[0];
          return { action, a: Number(attrs.match(/data-preview-a="(\d+)"/)[1]), b: Number(attrs.match(/data-preview-b="(\d+)"/)[1]) };
        });
        const expected = legal.filter(a => a.card === cardId);
        assert.equal(previews.length, expected.length);
        assert.match(html, new RegExp(`data-select="${cardId}" data-drag-piece="${cardId}"`));
        for (const action of expected) {
          const preview = previews.find(p => signature(p.action) === signature(action));
          assert.ok(preview, 'every side has its own target');
          const result = E.applyAction(state, state.turn, action);
          const placed = action.side === 'left' ? result.data.chain[0] : result.data.chain.at(-1);
          assert.deepEqual([preview.a, preview.b], [placed.a, placed.b]);
          const original = state.data.hands[state.turn].find(c => c.id === cardId);
          covered.add(state.data.chain.length ? action.side : 'opening');
          if (original.a !== preview.a) covered.add('reversed');
          if (preview.a === preview.b) covered.add('double');
        }
      }
      state = E.applyAction(state, state.turn, E.botAction(state));
    }
  }
  for (const kind of ['opening', 'left', 'right', 'reversed', 'double']) assert.ok(covered.has(kind), kind);
});

test('UNO previews on click and exposes exact drag/swipe actions without guessing wild colours', () => {
  const covered = new Set();
  for (const seed of [1, 7, 17, 21]) {
    let state = make('uno', 'classic', 2, seed);
    for (let step = 0; step < 28 && state.status === 'playing'; step++) {
      const legal = E.legalActions(state), base = render(state);
      const quick = V.render(E.project(state, state.turn), state.turn, legal, {selected:null, quickPlay:true});
      assert.doesNotMatch(base, /class="uno-drop-target"/, 'discard target requires a selection');
      for (const id of new Set(legal.filter(a => a.card).map(a => a.card))) {
        const choices = legal.filter(a => a.card === id);
        const source = base.match(new RegExp(`<button[^>]*data-entity="card-${id}"[^>]*>`))[0];
        const quickSource = quick.match(new RegExp(`<button[^>]*data-entity="card-${id}"[^>]*>`))[0];
        assert.ok(source.includes(`data-drag-piece="${id}"`));
        const selected = render(state, state.turn, id), target = selected.match(/<button class="uno-drop-target"[^>]*>/)[0];
        assert.ok(target.includes(`data-drop-piece="${id}"`));
        if (choices.length === 1) {
          covered.add('normal');
          assert.equal(actionsIn(source).length, 0, 'source click previews before an explicit play');
          assert.equal(signature(actionsIn(quickSource)[0]), signature(choices[0]), 'quick-play emits the same legal normal-card action');
          assert.ok(source.includes(`data-select="${id}"`), 'normal card can be selected');
          assert.equal(signature(actionsIn(target)[0]), signature(choices[0]), 'discard commits the selected card');
          const swipe = JSON.parse(decode(source.match(/data-swipe-action="([^"]+)"/)[1]));
          assert.equal(signature(swipe), signature(choices[0]));
          assert.equal(signature(actionsIn(target)[0]), signature(choices[0]));
        } else {
          covered.add(state.data.hands[state.turn].find(c => c.id === id).value);
          assert.deepEqual(actionsIn(quickSource), [], 'quick-play must still ask for a wild colour');
          assert.ok(source.includes(`data-select="${id}"`) && source.includes(`data-swipe-select="${id}"`));
          assert.deepEqual(actionsIn(target), [], 'dropping a wild on discard must not choose a colour');
          assert.ok(target.includes(`data-drop-select="${id}"`));
          const colours = [...selected.matchAll(/<button class="color-choice"[^>]*>/g)].map(m => m[0]);
          assert.equal(colours.length, choices.length);
          for (const colour of colours) {
            assert.ok(colour.includes(`data-drop-piece="${id}"`));
            assert.ok(choices.some(a => signature(a) === signature(actionsIn(colour)[0])));
          }
        }
      }
      state = E.applyAction(state, state.turn, E.botAction(state));
    }
  }
  for (const type of ['normal', 'wild', '+4']) assert.ok(covered.has(type), type);
});

test('manual UNO controls are constant and accusations use public player context without hints', () => {
  const state = make('uno', 'classic', 4);
  state.data.uno.mode = 'manual';
  const callButton = html => html.match(/<button[^>]*class="[^"]*\buno-call\b[^"]*"[^>]*><span class="ui-button-label">UNO!<\/span><\/button>/)?.[0];
  const originalCall = callButton(render(state, 0));
  assert.ok(originalCall);
  for (const count of [7, 2, 1]) {
    state.data.drawPile.push(...state.data.hands[0].splice(count));
    for (const viewer of [0, 1]) {
      const html = render(state, viewer);
      assert.equal(callButton(html), originalCall, 'call button stays identical across hand counts and turn ownership');
      const actions = actionsIn(html);
      assert.ok(actions.some(a => a.type === 'declare-uno'));
      assert.ok(!actions.some(a => a.type === 'accuse-uno'), 'accusations must not become automatic action buttons');
      for (const target of state.players.keys()) assert.equal(html.includes(`data-player-target="${target}"`), target !== viewer);
      assert.doesNotMatch(html, /class="player-avatar-label[^"]*"[^>]*>UNO<\/span>/, 'one card alone is not a public declaration');
    }
  }
  state.data.uno.pending = 0;
  const pending = render(state, 1);
  state.data.uno.pending = null;
  assert.equal(render(state, 1), pending, 'catch-window changes must not provide visual clues');
  state.data.uno.declared[0] = true;
  assert.match(render(state, 1), /class="player-avatar-label[^"]*"[^>]*>UNO<\/span>/);
  assert.match(render(state, 1), /data-player-target="0"/, 'already declared players still allow a mistaken accusation');
  assert.match(render(state, 0), /class="player-avatar-label[^"]*"[^>]*>UNO<\/span>/);
  const wild = state.data.drawPile.splice(state.data.drawPile.findIndex(c => c.value === 'wild'), 1)[0];
  state.data.hands[0].push(wild); state.data.uno.declared[0] = false;
  assert.equal(callButton(render(state, 0, wild.id)), originalCall, 'colour choice retains the same call button');
  state.data.uno.mode = 'auto';
  assert.doesNotMatch(render(state, 0), /uno-call|data-player-target|uno-manual-hint/);
  delete state.data.uno;
  assert.throws(()=>E.validateState(state), 'the new API requires explicit UNO state');
  vm.runInContext(fs.readFileSync(path.join(root, 'packs/uno/manifest.js'), 'utf8'), sandbox);
  const setting = sandbox.PlayroomCatalog.uno.settings.find(item => item.key === 'unoMode');
  assert.equal(setting.default, 'manual');
  assert.deepEqual(clone(setting.options.map(item => item.value)), ['manual', 'auto']);
});

test('all labels and JSON action attributes escape player-controlled strings', () => {
  const attack = '\"><img src=x onerror=alert(1)> & \' <script>';
  for (const game of games) {
    const state = make(game);
    state.players.forEach(p => { p.name = attack; });
    const html = render(state);
    assert.doesNotMatch(html, /<img|<script>|onerror="/, game);
    assert.ok(html.includes('&lt;img'), game);
  }
  const action = { type: 'test', label: attack, card: attack };
  assert.deepEqual(actionsIn(V.helpers.actionButton(action)), [action]);
});

test('checkers orientation/forced captures and snakes board sizes agree with their state', () => {
  const checkers = make('checkers'), html0 = render(checkers, 0), html1 = render(checkers, 1);
  assert.ok(html0.indexOf('aria-label="a8') < html0.indexOf('aria-label="h1'));
  assert.ok(html1.indexOf('aria-label="h1') < html1.indexOf('aria-label="a8'));
  for (const {id:preset} of E.get('snakes').presets) {
    const state = make('snakes', preset, 4), html = render(state);
    assert.equal((html.match(/class="snakes-cell /g) || []).length, state.data.finish);
    assert.equal((html.match(/class="player-panel /g)||[]).length,4+(html.match(/data-seat-copy="true"/g)||[]).length);assert.doesNotMatch(html,/snakes-legend|snakes-scores/);
  }
  for (const game of games) assert.match(V.cover(game), /^<svg .*viewBox="0 0 300 180"/);
});


test('all source packs provide only API 3 elements with application-owned placement',()=>{
  for(const game of games){const state=make(game),view=V.get(game).render(E.project(state,state.turn),state.turn,E.legalActions(state),{selected:null});assert.equal(view.api,3);assert.ok(['cards','board'].includes(view.family));assert.equal(typeof view.elements.field,'string');assert.ok(view.elements.field.length);assert.doesNotMatch(Object.values(view.elements).join(''),/class="game-scene/);assert.match(V.render(E.project(state,state.turn),state.turn,[],{}),/data-view-api="3"/);}
  for(const game of games){
    const state=make(game,'classic',E.get(game).max);
    for(const turn of state.players.keys())for(const viewer of [-1,...state.players.keys()]){
      state.turn=turn;
      if(game==='durak')Object.assign(state.data,{attacker:turn,boutOrigin:turn,attackCursor:turn,defender:(turn+1)%state.players.length});
      const html=render(state,viewer,null,[]),panels=[...html.matchAll(/<article class="player-panel ([^"]*)" data-player-index="(\d+)"([^>]*)>/g)];
      assert.equal(panels.length,state.players.length+panels.filter(panel=>panel[3].includes('data-seat-copy="true"')).length,game);
      assert.doesNotMatch(html,/turn-badge|>Ходит</,game);
      for(const [,classes,index,attrs]of panels){
        assert.equal(classes.includes('is-turn'),Number(index)===turn&&!attrs.includes('data-seat-copy='),`${game}: only the current player is highlighted`);
        assert.equal(attrs.includes('aria-current="true"'),Number(index)===turn&&!attrs.includes('data-seat-copy='),`${game}: accessible current player follows turn changes`);
        assert.equal(classes.includes('self-player'),Number(index)===viewer,`${game}: own card uses the same turn state`);
      }
    }
  }
});


test('player hands render every hidden piece and score units agree with the rules',()=>{
  for(const game of games){
    const state=make(game),projected=E.project(state,0),descriptor=V.get(game).render(projected,0,E.legalActions(state,0),{selected:null});
    assert.equal(descriptor.playerContent.length,state.players.length);
    for(const [index,content]of descriptor.playerContent.entries()){
      assert.equal(content.scoreLabel,E.get(game).scoreLabel);
      if(state.data.hands&&index!==0){
        assert.equal((content.handHTML.match(/class="(?:piece-back |shared-card shared-card-back )/g)||[]).length,state.data.hands[index].length,game);
        assert.equal(content.handCount,state.data.hands[index].length);
        assert.equal(content.open,false);
        if(game==='domino'){const open=E.project({...state,openHands:true},0);const publicTiles=V.get(game).render(open,0,[],{selected:null}).playerContent[index];assert.equal((publicTiles.handHTML.match(/viewBox="0 0 48 84"/g)||[]).length,state.data.hands[index].length);}
      }
    }
    for(const viewer of [-1,0,1]){
      const html=viewer<0?V.render(E.project(state,viewer),viewer,[],{surface:'table'}):render(state,viewer,null,[]),panels=[...html.matchAll(/<article class="player-panel [\s\S]*?<\/article>/g)].map(m=>m[0]);
      for(const panel of panels){
        const index=Number(panel.match(/data-player-index="(\d+)"/)[1]),counts=[...panel.matchAll(/data-piece-count="(\d+)"/g)];
        assert.deepEqual(counts.map(m=>Number(m[1])),state.data.hands?[state.data.hands[index].length]:[],`${game}: exactly one count in each player card`);
        assert.doesNotMatch(panel,/>\d+ в руке</,`${game}: no repeated textual hand count`);
      }
      const own=html.match(/<section class="own-hand"[\s\S]*?<div class="hand-track/);
      if(state.data.hands&&viewer>=0){assert(own);assert.doesNotMatch(own[0],/piece-count/);}
      else assert.equal(own,null,`${game}: no personal hand count on the table or without a hand`);
      if(['uno','durak'].includes(game))assert.match(html,new RegExp(`class="piece-count is-corner" data-piece-count="${state.data.drawPile.length}"`));
      assert.doesNotMatch(html,/pile-count/);
    }
  }
  const state=make('durak'),html=render(state);
  assert.doesNotMatch(html,/Время первого хода|Соперник выбирает карту/);
  assert.doesNotMatch(render(make('domino')),/Выберите первую костяшку|Коснитесь места на поле/);
});


test('scene reserves optional actions and validates generic motion route descriptors',()=>{
  const UI=require('../core/ui.js'),state={turn:0,players:[{name:'A'},{name:'B'}]};
  const descriptor={api:3,family:'board',actionReserve:true,elements:{field:'<div>Board</div>'}};
  assert.match(UI.composeScene(descriptor,{state,viewer:0}),/data-action-reserve="true"/);
  assert.match(UI.composeScene(descriptor,{state,viewer:0}),/data-game-element="actions"><div class="scene-actions"><\/div>/);
  assert.doesNotMatch(UI.composeScene(descriptor,{state,viewer:-1,surface:'table'}),/data-game-element="actions"/);
  assert.throws(()=>UI.composeScene({...descriptor,actionReserve:'yes'}));
  assert.throws(()=>UI.composeScene({...descriptor,motionSequence:{trigger:'roll'}}));
  const art=UI.art({main:'<i>Face</i>',width:48,height:84,rotation:270});
  assert.match(art,/viewBox="0 0 84 48"/);assert.match(art,/translate\(0 48\) rotate\(-90\)/);
  assert.match(UI.participantIcon({isHost:true,local:true,replacement:{}}),/data-ui-icon="player".*data-ui-icon="replacement"/);
  assert.doesNotMatch(UI.participantIcon({isHost:true,local:true}),/data-ui-icon="host"/);
});

test('snakes routes describe every bounced step and retain landing before a link',()=>{
  const P=require(path.join(root,'packs/snakes/presentation/scene.js'));
  const state=make('snakes');state.data.positions[0]=31;state.data.lastMove={player:0,from:51,landing:54,to:31,roll:3};state.data.dice=3;
  let html=render(state,0),route=P.sequence(state.data.lastMove,state.data.finish);
  assert.deepEqual(route.steps.map(x=>x.anchor),['cell-52','cell-53','cell-54']);assert.equal(route.jump.anchor,'cell-31');assert.match(html,/data-motion-lead="roll"/);assert.doesNotMatch(html,/Выпало/);
  state.data.positions[0]=98;state.data.lastMove={player:0,from:98,landing:98,to:98,roll:4};state.data.dice=4;
  html=render(state,0);route=P.sequence(state.data.lastMove,state.data.finish);
  assert.deepEqual(route.steps.map(x=>x.anchor),['cell-99','cell-100','cell-99','cell-98']);assert.equal(route.jump,undefined);
});


test('relative seats keep indices, own hands and canonical spectator order',()=>{
  const H=sandbox.TabletopUI.helpers;
  for(const count of [2,3,4])for(let viewer=-1;viewer<count;viewer++){
    const expected=viewer<0?Array.from({length:count},(_,i)=>i):Array.from({length:count-1},(_,i)=>(viewer+i+1)%count);
    assert.deepEqual(Array.from(H.seatOrder(count,viewer)),expected);
    const state=make('uno','classic',count),before=JSON.stringify(state),html=render(state,viewer);
    const actual=[...html.matchAll(/<article[^>]*data-player-index="(\d+)"([^>]*)>/g)].filter(m=>!m[2].includes('data-seat-copy="true"')).map(m=>Number(m[1]));
    assert.deepEqual(actual,viewer<0?expected:[...expected,viewer]);assert.equal(JSON.stringify(state),before);
  }
});
test('compact pack badges use numeric positions and mutually exclusive accessible roles',()=>{
  const snakes=make('snakes');snakes.data.positions=[0,16];
  const html=render(snakes);assert.match(html,/data-motion-counter="position" aria-label="Клетка: 0"/);assert.match(html,/data-motion-counter="position" aria-label="Клетка: 16"/);
  const durak=make('durak');durak.data.taking=true;
  const taken=render(durak);assert.match(taken,/data-ui-icon="takeCards"/);assert.doesNotMatch(taken,/data-ui-icon="shield"/);assert.match(taken,/aria-label="Берёт"/);
  durak.data.taking=false;assert.match(render(durak),/data-ui-icon="shield"/);
});

test('source rule versions match the distributable pack manifests',()=>{
  for(const game of games){
    const manifest=JSON.parse(fs.readFileSync(path.join(root,'packs',game,'manifest.json'),'utf8'));
    assert.equal(E.get(game).version,manifest.version,game+' registration must match its manifest');
  }
});


test('Hand overlap uses explicit instance selection, never markup classes',()=>{
  const H=sandbox.TabletopUI;
  const cards=[{id:'copy-1',html:'<button class="is-selected">same face</button>'},{id:'copy-2',selected:true,html:'<button>same face</button>'},{id:'copy-3',html:'<button>same face</button>'},{id:'copy-4',html:'<button>same face</button>'}];
  const html=H.hand(cards,4,'','',{layout:'overlap'});
  const width='var(--scene-card-width,var(--size-card))';
  assert(html.includes('grid-template-columns:'+width+' '+width+' minmax(24px,'+width+') '+width));
  assert(!html.includes('[object Object]'));
  assert.throws(()=>H.hand([cards[0],cards[0]],2),/HAND_ITEM_INVALID/);
  assert.throws(()=>H.hand(['<button>legacy markup</button>'],1),/HAND_ITEM_INVALID/);
});


test('Shared tokens and piece indicators preserve spent capacity and continuous rotation',()=>{
  const C=sandbox.PlayroomGameComponents;
  const strip=C.tokenStrip({value:2,capacity:4,icon:'heart'});
  assert.equal((strip.match(/class="counter-token/g)||[]).length,4);
  assert.equal((strip.match(/is-empty/g)||[]).length,2);
  const layers=[...strip.matchAll(/z-index:(\d+)/g)].map(m=>Number(m[1]));
  assert(Math.min(...layers.slice(0,2))>Math.max(...layers.slice(2)));
  assert.equal(C.tokenStrip({value:0,capacity:0,icon:'crown'}),'');
  assert.equal((C.pieceIndicators({value:1,capacity:4,label:'HP'}).match(/is-empty/g)||[]).length,3);
  assert.throws(()=>C.pieceIndicators({value:5,capacity:4}),/PIECE_INDICATORS_INVALID/);
  const R=C.rotationController;
  for(let turns=-12;turns<=12;turns++){
    assert.equal(R.align(turns,R.direction(turns)),turns);
    assert.equal(R.align(turns,R.direction(turns+1)),turns+1);
    assert.equal(R.align(turns,R.direction(turns-1)),turns-1);
  }
});


test('Shared action selector keeps choice identity, locked positions and accessible labels',()=>{
 const selector=sandbox.PlayroomGameComponents.actionSelector;
 const html=selector({key:'mode',label:'Action',value:'attack',stable:true,choices:[{value:'move',label:'Move',disabled:true,marker:1},{value:'attack',label:'Attack',html:'<svg></svg>'}]});
 assert(html.includes('--page-index:1'));
 assert(html.includes('data-view-value="move" aria-pressed="false" aria-label="Move" title="Move" disabled'));
 assert(html.includes('shared-action-marker'));assert(html.includes('data-view-layout="stable"'));
 assert.throws(()=>selector({key:'mode',label:'Action',value:'x',choices:[{value:'x',label:'X'},{value:'x',label:'Copy'}]}),/CHOICE_INVALID/);
 assert.throws(()=>selector({key:'mode',label:'Action',value:'missing',choices:[{value:'x',label:'X'}]}),/VALUE_INVALID/);
});

test('field rendering selects an authorized scene independently of controls and hand',()=>{
 const UI=sandbox.TabletopUI,registry=UI.createRegistry(),calls=[];
 registry.register('field-test',(state,viewer,actions,ui)=>{
  assert.equal(state.data,undefined);assert.equal(state.modelProjection,undefined);
  calls.push({scene:state.scene,actions,ui});
  return {api:3,family:'board',elements:{field:`<div>${state.scene.art}</div>`,hand:'<div>current hand</div>',actions:'<button>current controls</button>'},fieldGroups:{play:`<div>${state.scene.art}</div>`}};
 });
 const initial={audience:'player',art:'before'},final={audience:'player',art:'after'},state={game:'field-test',scene:final,data:{secret:true},modelProjection:{secret:true}};
 const field=registry.renderField(state,0,initial,{selected:'secret',viewState:{choice:'private'}});
 assert.match(field,/before/);assert(!field.includes('hand'));assert(!field.includes('controls'));
 assert.equal(calls.at(-1).actions.length,0);assert.equal(calls.at(-1).ui.selected,null);assert.equal(calls.at(-1).ui.replay,true);assert.equal(Object.keys(calls.at(-1).ui.viewState).length,0);
 const html=registry.render(state,0,[],{fieldScene:initial});
 assert.match(html,/before/);assert(!html.includes('after'));assert.match(html,/current hand/);assert.match(html,/current controls/);
 assert.equal(state.scene,final);assert.throws(()=>registry.renderField(state,-1,{audience:'public',art:'wrong'}),/audience/);
});
