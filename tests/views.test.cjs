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
for (const file of ['core/messages.js','core/random.js','core/model-values.js','core/events.js','core/bot-difficulty.js','core/model-runtime.js','presentation/localization.js','presentation/scene-contract.js','core/model-registration.js','core/engine.js', 'shared/domain/standard-deck.js', ...loadedGames.map(g => `packs/${g}/rules.js`), 'core/vector-art.js','core/component-assets.js','core/mini-split-deck.js','core/game-components.js','core/token-layout.js','core/ui.js', 'app/views.js', 'shared/view-kit.js', ...loadedGames.map(g => `packs/${g}/view.js`)]) {
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

test('public frame ports prepare one authorized frame at a time and reuse its scoped cache',()=>{
 const registry=sandbox.TabletopUI.createRegistry(),owner={},calls=[],plan={id:'round:1',initial:0,final:3,groups:Array.from({length:3},(_,scene)=>({scene,duration:250,cues:[]}))};
 let live='latest';
 registry.register('uno',(_state,viewer,_actions,ui)=>({api:3,family:'cards',elements:{field:ui.publicFrames({key:'field',plan,renderFrame:index=>{calls.push([viewer,index]);return {markup:'<b>frame '+index+'</b>',label:'Frame '+index};},live:{markup:live,label:'Live'}})}}));
 const state=E.project(make('uno'),0),first=new Map(),html=registry.render(state,0,[],{renderOwner:owner,regionSink:first});
 assert.deepEqual(calls,[],'rendering the shell must not build the whole round');assert.match(html,/data-public-frame-source/);assert.doesNotMatch(html,/data-public-frame-bank|frame 1|frame 2/);
 const source=first.publicFrames.get('scene:field');source.read(0);assert.equal(source.read(1).markup,'<b>frame 1</b>');source.read(1);assert.equal(calls.length,2);assert.throws(()=>source.read(4),/PUBLIC_FRAME_INVALID/);
 live='changed';const second=new Map();registry.render(state,0,[],{renderOwner:owner,regionSink:second});assert.equal(second.publicFrames.get('scene:field'),source);assert.equal(calls.length,2);assert.equal(source.read(3).markup,'changed');
 const other=new Map();registry.render({...state,scene:{...state.scene,viewer:1}},1,[],{renderOwner:owner,regionSink:other});assert.notEqual(other.publicFrames.get('scene:field'),source);other.publicFrames.get('scene:field').read(0);assert.deepEqual(calls.at(-1),[1,0],'another viewer never reuses the previous frame source');
});

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
  for(const difficulty of ['easy','medium','hard']){const avatar=H.avatar({name:'Бот',bot:true,botSettings:{difficulty}});assert.match(avatar,new RegExp('data-ui-icon="bot-'+difficulty+'"'));assert.doesNotMatch(avatar,/>Б</);}
  assert.match(H.avatar({name:'Сосед',local:true,primary:false}),/is-hotseat-avatar.*data-ui-icon="hand"/);
  assert.doesNotMatch(H.avatar({name:'Я',local:true,primary:true}),/is-hotseat-avatar|data-ui-icon="hand"/);
  assert.match(H.avatar({name:'Хост',isHost:true}),/is-host-avatar/);
  assert.doesNotMatch(H.avatar({name:'Хост',isHost:true}),/avatar-host-crown|data-ui-icon="host"/);
  assert.match(H.icon('host'),/data-ui-icon="host"/);
  assert.doesNotMatch(H.avatar({name:'Игрок'}),/is-host-avatar/);
  assert.doesNotMatch(H.participantIcon({bot:true}),/data-ui-icon="bot-/);
  const both=H.playerPanel({players:[{name:'A <&',score:9}],turn:0},0,0,{counters:[{kind:'wins',value:3},{kind:'points',value:9,label:'Очки <&'}]});
  assert.match(both,/data-score-kind="points"[^>]*aria-label="Очки &lt;&amp;: 9"/);
  assert.match(both,/is-wins[^>]*data-score-kind="wins"/);assert(both.indexOf('data-score-kind="points"')<both.indexOf('data-score-kind="wins"'));
  assert.doesNotMatch(both,/>Игрок|>Бот|очки:|победы:/);
  for(const counters of [[{kind:'points',value:-1}],[{kind:'wins',value:1.5}],[{kind:'unknown',value:2}],[{kind:'wins',value:2,label:3}],[{kind:'points',value:0},{kind:'points',value:1}]])assert.throws(()=>UI.composeScene({api:3,family:'cards',elements:{field:'x'},playerContent:[{counters}]}));

  const pieces=H.playerPanel({players:[{name:'A',score:0}],turn:0},0,0,{counters:[{kind:'wins',value:0},{kind:'pieces',value:12,label:'Светлые шашки'}]});
  assert.match(pieces,/is-pieces[^>]*aria-label="Светлые шашки: 12"[^>]*><svg\b[^>]*\bclass="round-token-art medallion-art"/);
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
      const html=render(state,viewer,null,[]),panels=[...html.matchAll(/<article class="player-panel ([^"]*)"(?: data-dom-key="[^"]*")? data-player-index="(\d+)"([^>]*)>/g)];
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
  assert.match(UI.participantIcon({isHost:true,local:true,replacement:{}}),/data-ui-icon="replacement"/);
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


test('scene regions reuse only explicit inputs within their private surface owner',()=>{
 const registry=sandbox.TabletopUI.createRegistry(),owner={privateSession:'must not reach a pack'},other={};let builds=0;
 registry.register('regions',(state,viewer,actions,ui)=>{
  assert.equal(ui.renderOwner,undefined,'authority owner is never exposed to pack UI');assert.equal(ui.regionSink,undefined,'host fragment sink is never exposed to pack UI');
  const build=()=>{builds++;return `<p>${state.scene.value}</p>`;};
  return {api:3,family:'board',elements:{field:ui.region?ui.region('value',[state.scene.value],build):build()}};
 });
 const state=value=>({game:'regions',packVersion:'1',scene:{value,audience:'player'}});
 registry.render(state('A'),0,[],{renderOwner:owner});assert.equal(builds,1);
 registry.render(state('A'),0,[],{renderOwner:owner});assert.equal(builds,1);
 registry.render(state('B'),0,[],{renderOwner:owner});assert.equal(builds,2);
 registry.render(state('B'),0,[],{renderOwner:other});assert.equal(builds,3);
 registry.render(state('B'),1,[],{renderOwner:owner});assert.equal(builds,4,'viewer change invalidates regions');
 registry.render(state('B'),1,[],{renderOwner:owner,replay:true});assert.equal(builds,5,'replay cannot reuse live controls');
 registry.renderField(state('B'),1,state('B').scene,{renderOwner:owner});assert.equal(builds,6,'inert fields have a separate lane');
 registry.render(state('B'),1,[],{renderOwner:owner,replay:true});assert.equal(builds,6,'field lane does not evict the main lane');
 registry.render(state('B'),1,[],{});registry.render(state('B'),1,[],{});assert.equal(builds,8,'unowned portable rendering retains the stateless contract');
 registry.render({...state('B'),packVersion:'2'},1,[],{renderOwner:owner,replay:true});assert.equal(builds,9,'pack version invalidates regions');
 registry.render({...state('B'),packVersion:'2',scene:{value:'B',audience:'public'}},1,[],{renderOwner:owner,replay:true});assert.equal(builds,10,'audience invalidates regions');
 const resolver=sandbox.PlayroomAssetResolver;try{sandbox.PlayroomAssetResolver={};registry.render({...state('B'),packVersion:'2',scene:{value:'B',audience:'public'}},1,[],{renderOwner:owner,replay:true});assert.equal(builds,11,'new appearance resolver invalidates artwork');}finally{sandbox.PlayroomAssetResolver=resolver;}
 const sink=new Map(),html=registry.render(state('C'),0,[],{renderOwner:other,regionSink:sink});assert.equal(sink.get('scene:value'),'<p>C</p>');assert(html.includes('<template data-scene-fragment="scene:value"></template>'));assert(!html.includes('<p>C</p>'));
 const stateless=new Map(),portable=registry.render(state('C'),0,[],{regionSink:stateless});assert.equal(stateless.size,0);assert(portable.includes('<p>C</p>'),'a portable render never depends on a host fragment sink');


});

test('solitaire region rendering preserves legal markup while skipping untouched column art',()=>{
 const original=sandbox.PlayroomShared;let cards=0;
 sandbox.PlayroomShared={...original,renderCard:descriptor=>{cards++;return original.renderCard(descriptor);}};
 try{for(const game of ['spider','klondike']){
  let state=make(game,'classic',1,17);const owner={};
  const draw=(options={})=>{const projected=E.project(state,0),actions=E.legalActions(state,0);return V.render(projected,0,actions,options);};
  cards=0;const first=draw({renderOwner:owner});assert(cards>0,game+' initial columns render');
  cards=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(cards,0,game+' identical columns do not build SVG again');
  const legal=E.legalActions(state,0),move=legal.find(a=>a.type==='move'&&a.source==='tableau');assert(move,game+' fixture has a real tableau move');state=E.applyAction(state,0,move);
  cards=0;const changed=draw({renderOwner:owner}),rebuilt=cards,total=E.project(state,0).scene.tableau.reduce((n,col)=>n+col.length,0);
  assert(rebuilt>0&&rebuilt<total,game+' a real move rebuilds affected columns, not all cards');
  assert.equal(changed,draw(),game+' cached output retains exact current legal markup');
  for(const options of [{selected:E.project(state,0).scene.tableau.flat().find(c=>!c.hidden)?.id},{viewState:{hint:state.move+':0'}}]){
   const cached=draw({...options,renderOwner:owner});assert.equal(cached,draw(options),game+' selection/hint invalidates exact affected dependencies');
  }
  for(const type of ['undo','draw']){const action=E.legalActions(state,0).find(a=>a.type===type);assert(action,game+' '+type+' fixture action exists');state=E.applyAction(state,0,action);assert.equal(draw({renderOwner:owner}),draw(),game+' '+type+' replaces every changed card/command');}

 }}finally{sandbox.PlayroomShared=original;}
});

test('checkers regions retain untouched art and exact legal markup across selection moves and audiences',()=>{
 const original=V.helpers.assetArt;let painted=0;
 V.helpers.assetArt=function(family,...args){if(family==='checker')painted++;return original.call(this,family,...args);};
 try{
  let state=make('checkers');const owner={};
  const draw=({viewer=0,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  const first=draw({renderOwner:owner});assert(painted>0,'the counter observes real checker artwork');
  painted=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(painted,0,'an unchanged board does not repaint every checker');
  const move=E.legalActions(state,0)[0];assert(move);
  painted=0;const selected=draw({renderOwner:owner,selected:move.from}),selectionPaints=painted;
  assert(selectionPaints>0&&selectionPaints<E.project(state,0).scene.pieces.length,'selection repaints only changed checker cells');
  assert.equal(selected,draw({selected:move.from}),'selection retains exact legal source/target attributes');
  state=E.applyAction(state,0,move);painted=0;
  const moved=draw({renderOwner:owner}),movePaints=painted;
  assert(movePaints>0&&movePaints<E.project(state,0).scene.pieces.length,'a normal move does not repaint the whole board');assert.equal(moved,draw());
  for(const options of [{viewer:1},{viewer:-1,surface:'table'},{viewer:0,actions:[]}])assert.equal(draw({...options,renderOwner:owner}),draw(options),'viewer/public permissions never reuse stale input');
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert.equal(sink.size,64,'each physical cell has its own independent region');
 }finally{V.helpers.assetArt=original;}
});

test('Ludo regions retain stationary pawns and dice while preserving every legal selection and move',()=>{
 const shared=sandbox.PlayroomShared,art=V.helpers.assetArt;let pawns=0,dice=0;
 sandbox.PlayroomShared={...shared,roundTokenArt:params=>{if(params.profile==='pawn')pawns++;return shared.roundTokenArt(params);}};
 V.helpers.assetArt=function(family,...args){if(family==='die')dice++;return art.call(this,family,...args);};
 try{
  let state=E.createGame('ludo',{seed:17,diceCount:2,players:Array.from({length:4},(_,i)=>({name:'Игрок '+i}))});state.turn=0;Object.assign(state.data,{phase:'move',dice:[2,3],used:[false,false]});state.data.pawns[0]=[7,9,-1,-1];assert(E.validateState(state));
  const owner={},draw=({viewer=0,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  const first=draw({renderOwner:owner});assert.equal(pawns,16);assert.equal(dice,2);
  pawns=0;dice=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(pawns,0,'an unchanged field does not reconstruct stationary pawn art');assert.equal(dice,0,'unchanged dice do not reconstruct artwork');
  for(const pawn of ['0:0','0:1']){pawns=0;const ui={viewState:{pawn}},cached=draw({...ui,renderOwner:owner}),painted=pawns;assert(painted>0&&painted<16,'selection repaints only affected pawns');assert.equal(cached,draw(ui),'friendly occupied destinations retain exact source and target commands');}
  const move=E.legalActions(state,0).find(a=>a.type==='move'&&a.owner===0&&a.pawn===0&&a.dieIndex===0);assert(move);state=E.applyAction(state,0,move);
  pawns=0;const moved=draw({renderOwner:owner}),painted=pawns;assert(painted>0&&painted<16,'a move repaints affected stack members rather than every pawn');assert.equal(moved,draw());
  for(const options of [{viewer:1},{viewer:-1,surface:'table'},{actions:[]}])assert.equal(draw({...options,renderOwner:owner}),draw(options),'audience and permissions never reuse stale actions');
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert.equal(sink.size,99,'bases, cells, centre, pawns and dice own independent bounded regions');
 }finally{sandbox.PlayroomShared=shared;V.helpers.assetArt=art;}
});


test('UNO regions preserve unchanged card artwork and exact choices across selection and play',()=>{
 const original=V.helpers.assetArt;let painted=0;
 V.helpers.assetArt=function(family,...args){if(family==='card-face')painted++;return original.call(this,family,...args);};
 try{
  let state=make('uno');const owner={};
  const draw=({viewer=0,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  const first=draw({renderOwner:owner});assert(painted>=8,'counter observes own hand and discard artwork');
  painted=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(painted,0,'unchanged hand and discard do not reconstruct card faces');
  const playable=E.legalActions(state,0).find(a=>a.type==='play');assert(playable,'seed has a playable card');
  painted=0;const selected=draw({renderOwner:owner,selected:playable.card}),selectionPaints=painted;
  assert(selectionPaints>0&&selectionPaints<state.data.hands[0].length,'selection rebuilds affected hand card only');assert.equal(selected,draw({selected:playable.card}));
  for(const options of [{selected:playable.card,quickPlay:true},{actions:[]},{viewer:1},{viewer:-1,surface:'table'},{surface:'player'}])assert.equal(draw({...options,renderOwner:owner}),draw(options),'audience, surface and permissions retain exact markup');
  draw({renderOwner:owner});state=E.applyAction(state,0,playable);painted=0;const moved=draw({renderOwner:owner});assert(painted>0&&painted<state.data.hands[0].length,'playing a card does not reconstruct unaffected own card faces');assert.equal(moved,draw());
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert(sink.size>state.data.hands[0].length,'hand and field have independent regions');
 }finally{V.helpers.assetArt=original;}
});


test('Domino regions retain tile artwork through selection and both chain ends without stale permissions',()=>{
 const art=V.helpers.assetArt;let painted=0;V.helpers.assetArt=function(family,...args){if(family==='domino')painted++;return art.call(this,family,...args);};
 try{
  let state=make('domino');const tiles=new Map([...state.data.hands.flat(),...state.data.stock].map(c=>[c.id,c])),take=id=>{const c=tiles.get(id);assert(c);tiles.delete(id);return c;};state.data.chain=[take('d11')];state.data.hands=[['d12','d13','d14','d15','d16','d01','d00'].map(take),['d22','d23','d24','d25','d26','d02','d03'].map(take)];state.data.stock=[...tiles.values()];state.data.passes=0;state.data.openingTileId='d11';state.turn=0;assert(E.validateState(state));
  const owner={},draw=({viewer=0,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  const first=draw({renderOwner:owner});assert.equal(painted,8);painted=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(painted,0,'unchanged hand and chain never reconstruct tile artwork');
  const selected=draw({renderOwner:owner,selected:'d12'});assert.equal(selected,draw({selected:'d12'}));
  for(const options of [{actions:[],selected:'d12'},{viewer:1},{viewer:-1,surface:'table'},{surface:'player'}])assert.equal(draw({...options,renderOwner:owner}),draw(options));
  draw({renderOwner:owner});for(const [actor,id,side] of [[0,'d12','right'],[1,'d23','right'],[0,'d13','left']]){const action=E.legalActions(state,actor).find(a=>a.card===id&&a.side===side);assert(action);state=E.applyAction(state,actor,action);painted=0;const html=draw({renderOwner:owner}),count=painted;assert(count<=1,'only the newly public or reoriented tile rebuilds its face');assert.equal(html,draw());}
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert.equal(sink.size,state.data.hands[0].length+state.data.chain.length+2);
  state=make('domino');state.turn=0;const openingOwner={},action=E.legalActions(state,0).find(a=>a.type==='play');assert(action);draw({renderOwner:openingOwner});painted=0;draw({renderOwner:openingOwner});assert.equal(painted,0);assert.equal(draw({renderOwner:openingOwner,selected:action.card}),draw({selected:action.card}));
 }finally{V.helpers.assetArt=art;}
});

test('Yatzy dice regions preserve unchanged artwork and current hold permissions',()=>{
 const art=V.helpers.assetArt;let painted=0;
 V.helpers.assetArt=function(family,...args){if(family==='die')painted++;return art.call(this,family,...args);};
 try{
  let state=make('yatzy');const owner={},draw=({viewer=state.turn,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  draw({renderOwner:owner});assert.equal(painted,5);painted=0;draw({renderOwner:owner});assert.equal(painted,0,'unchanged dice are not rebuilt');
  state=E.applyAction(state,state.turn,E.legalActions(state,state.turn).find(a=>a.type==='roll'));
  assert.equal(draw({renderOwner:owner}),draw());
  const priorRows=new Map();draw({renderOwner:owner,regionSink:priorRows});
  const hold=E.legalActions(state,state.turn).find(a=>a.type==='hold');assert(hold);
  state=E.applyAction(state,state.turn,hold);painted=0;const held=draw({renderOwner:owner});assert.equal(painted,1,'hold rebuilds only the changed die');assert.equal(held,draw());
  const heldRows=new Map();draw({renderOwner:owner,regionSink:heldRows});for(const [id,html]of priorRows)if(!id.startsWith('scene:die-'))assert.equal(heldRows.get(id),html,'hold leaves score rows and totals unchanged');
  for(const options of [{actions:[]},{viewer:1},{viewer:-1,surface:'table'},{surface:'player'},{viewState:{scorePlayer:1}}])assert.equal(draw({...options,renderOwner:owner}),draw(options));
  draw({renderOwner:owner});const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert.equal(sink.size,E.project(state,state.turn).scene.rows.length+9);
  const score=E.legalActions(state,state.turn).find(a=>a.type==='score');assert(score);state=E.applyAction(state,state.turn,score);assert.equal(draw({renderOwner:owner}),draw(),'scoring changes the selected player, category, totals and permissions together');
 }finally{V.helpers.assetArt=art;}
});

test('Pexeso regions rebuild affected slots without retaining hidden identities or stale flip actions',()=>{
 const art=V.helpers.assetArt;let painted=0;V.helpers.assetArt=function(family,...args){if(['card-back','card-face','character-face'].includes(family))painted++;return art.call(this,family,...args);};
 try{for(const deck of ['cartoon','52']){
  let state=E.createGame('pexeso',{preset:'easy',deck,seed:17,players:[{name:'A'},{name:'B'}]});const owner={};
  const draw=({viewer=0,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  const first=draw({renderOwner:owner});painted=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(painted,0,'unchanged board does not reconstruct card faces or backs');
  const unseen=clone(state);[unseen.data.board[0],unseen.data.board[1]]=[unseen.data.board[1],unseen.data.board[0]];assert(E.validateState(unseen));assert.equal(V.render(E.project(unseen,0),0,E.legalActions(unseen,0),{renderOwner:owner}),first,'unrevealed permutation cannot change public markup');assert.equal(painted,0);
  state=E.applyAction(state,0,{type:'flip',index:0});painted=0;const opened=draw({renderOwner:owner});assert.equal(painted,1,'one flip rebuilds one slot');assert.equal(opened,draw());
  const pair=c=>c.character||c.shape+'-'+c.color+(c.rank??'')+(c.rank?(['♥','♦'].includes(c.suit)?'red':'black'):'');
  const second=state.data.board.findIndex(c=>pair(c)!==pair(state.data.board[0]));assert(second>=0);state=E.applyAction(state,0,{type:'flip',index:second});
  for(const options of [{viewer:1,presentationTurn:0},{viewer:1},{viewer:-1,surface:'table'},{actions:[]},{surface:'player'}])assert.equal(draw({...options,renderOwner:owner}),draw(options),'closing animation and permissions match the authorized projection');
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert.equal(sink.size,state.data.board.length);assert([...sink.keys()].every(id=>/^scene:slot-\d+$/.test(id)),'regions identify public positions only');
  state=E.applyAction(state,1,{type:'flip',index:0});assert.equal(draw({viewer:1,renderOwner:owner}),draw({viewer:1}));
  state=E.createGame('pexeso',{preset:'easy',deck,seed:17,players:[{name:'A'},{name:'B'}]});const mate=state.data.board.findIndex((c,i)=>i>0&&pair(c)===pair(state.data.board[0]));assert(mate>0);for(const index of [0,mate])state=E.applyAction(state,0,{type:'flip',index});assert.equal(state.data.matched.length,2);assert.equal(draw({renderOwner:owner}),draw(),'matched pair and score remain current');
 }}finally{V.helpers.assetArt=art;}
});

test('Go Fish and Old Maid regions preserve authorized cards and public counters without caching hidden identities',()=>{
 const art=V.helpers.assetArt;let faces=0;V.helpers.assetArt=function(family,...args){if(family==='card-face')faces++;return art.call(this,family,...args);};
 try{for(const game of ['gofish','oldmaid']){
  let state=make(game);const owner={},draw=({viewer=0,actions=E.legalActions(state,viewer),...ui}={})=>V.render(E.project(state,viewer),viewer,actions,ui);
  faces=0;const first=draw({renderOwner:owner});assert(faces>0,game+' observes actual card artwork');faces=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(faces,0,game+' does not rebuild unchanged authorized faces');
  const selected=E.project(state,0).scene.players[0].hand[0]?.id;assert.equal(draw({renderOwner:owner,selected}),draw({selected}));
  for(let step=0;step<3;step++){const action=E.botAction(state,state.turn);assert(action);state=E.applyAction(state,state.turn,action);assert.equal(draw({renderOwner:owner}),draw(),game+' renders current cards, books or discard after a real command');}
  for(const options of [{actions:[]},{viewer:1},{viewer:-1,surface:'table'},{surface:'player'}])assert.equal(draw({...options,renderOwner:owner}),draw(options),'viewer and surface changes preserve exact permissions');
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert(sink.size>0);
  const hiddenIds=state.data.hands[1].map(c=>c.id);assert(hiddenIds.every(id=>!sink.has('scene:card-'+id)),'hidden opponent cards have no cached physical regions');
 }}finally{V.helpers.assetArt=art;}
});

test('Durak regions preserve card faces and trump while updating legal table placements',()=>{
 const art=V.helpers.assetArt;let faces=0;V.helpers.assetArt=function(family,...args){if(family==='card-face')faces++;return art.call(this,family,...args);};
 try{
  let state=make('durak');const viewer=state.turn,owner={},draw=({viewer:v=viewer,actions=E.legalActions(state,v),...ui}={})=>V.render(E.project(state,v),v,actions,ui);
  faces=0;const first=draw({renderOwner:owner});assert(faces>0);faces=0;assert.equal(draw({renderOwner:owner}),first);assert.equal(faces,0,'unchanged hand, field and trump do not reconstruct faces');
  const playable=E.legalActions(state,viewer).find(a=>a.card&&a.type!=='exchange');assert(playable);faces=0;const selected=draw({renderOwner:owner,selected:playable.card});assert(faces<=1,'selecting a card only redraws that source');assert.equal(selected,draw({selected:playable.card}));
  for(let i=0;i<3;i++){const action=E.botAction(state,state.turn);assert(action);state=E.applyAction(state,state.turn,action);assert.equal(draw({renderOwner:owner}),draw(),'attack, defence and changing controls preserve exact rule choices');}
  for(const options of [{actions:[]},{viewer:(viewer+1)%2},{viewer:-1,surface:'table'},{surface:'player'}])assert.equal(draw({...options,renderOwner:owner}),draw(options));
  const sink=new Map();draw({renderOwner:owner,regionSink:sink});assert(sink.has('scene:trump-token'));assert(sink.has('scene:stock-back'));
 }finally{V.helpers.assetArt=art;}
});
