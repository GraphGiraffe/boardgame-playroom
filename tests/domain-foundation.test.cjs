'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {execFileSync} = require('node:child_process');
const Random = require('../core/random.js');
const root = path.resolve(__dirname, '..');
const companion = path.dirname(fs.realpathSync(path.join(root, 'packs')));
const Deck = require(path.join(companion, 'shared/domain/standard-deck.js'));

// Vectors captured from the published engine before extraction (0.17.6).
test('extracted RNG preserves the previous sequence and state exactly', () => {
  const state = {rng: 17};
  assert.deepEqual(Array.from({length: 4}, () => Random.random(state)), [
    0.6771502960473299, 0.19265692122280598, 0.5313839064911008, 0.1654723146930337
  ]);
  assert.equal(state.rng, 3031295973);
  const input = [0, 1, 2, 3, 4, 5], shuffledState = {rng: 0};
  assert.deepEqual(Random.shuffle(input, shuffledState), [5, 2, 3, 4, 0, 1]);
  assert.deepEqual(input, [0, 1, 2, 3, 4, 5]);
  assert.equal(shuffledState.rng, 567894473);
});

test('randomness is explicit, repeatable and rejects invalid dice before consuming RNG', () => {
  assert.equal(Random.seedValue(null, () => .5), 2147483648);
  assert.equal(Random.seedValue('17'), Random.seedValue(17));
  assert.throws(() => Random.seedValue(null), /RANDOM_SOURCE_REQUIRED/);
  assert.throws(() => Random.random(), /RANDOM_SOURCE_REQUIRED/);
  const state = {rng: 17};
  assert.throws(() => Random.rollDie(1, state), /DIE_SIDES_OUT_OF_RANGE/);
  assert.equal(state.rng, 17);
  assert.equal(Random.rollDie(6, state), 5);
  assert.equal(Random.random(null, () => .25), .25);
});

test('domain modules run without DOM, storage, clock, engine or ambient random', () => {
  const context = vm.createContext({});
  vm.runInContext('Math.random = () => { throw Error("ambient RNG forbidden"); };', context);
  vm.runInContext(fs.readFileSync(path.join(root, 'core/random.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(companion, 'shared/domain/standard-deck.js'), 'utf8'), context);
  assert.equal(vm.runInContext('PlayroomRandom.rollDie(6, {rng:17})', context), 5);
  assert.equal(vm.runInContext('PlayroomPackDomain.standardDeck.create(54).length', context), 54);
  for (const name of ['document', 'window', 'localStorage', 'TabletopCore']) assert.equal(context[name], undefined);
});

test('standard decks preserve identities, order and joker composition for every size', () => {
  for (const size of [36, 52, 54]) {
    const cards = Deck.create(size), first = size === 36 ? 6 : 2;
    assert.equal(cards.length, size);
    assert.equal(new Set(cards.map(card => card.id)).size, size);
    assert.deepEqual(cards.slice(0, 4), ['♠', '♥', '♦', '♣'].map(suit => ({id: `${suit}${first}`, suit, rank: first})));
    assert.deepEqual(cards.filter(card => card.joker), size === 54 ? [
      {id:'joker-red', suit:'★', rank:15, joker:true, color:'red'},
      {id:'joker-black', suit:'★', rank:15, joker:true, color:'black'}
    ] : []);
  }
});

test('Old Maid exclusions are exact and each deck owns its mutable cards', () => {
  for (const size of [36, 52, 54]) {
    const ordinary = Deck.create(size), oldmaid = Deck.create(size, {exclude:['♣12']});
    assert.equal(oldmaid.length, size - 1);
    assert.deepEqual(oldmaid, ordinary.filter(card => card.id !== '♣12'));
    assert(oldmaid.some(card => card.id === '♠12'));
    oldmaid[0].rank = 99;
    assert.notEqual(Deck.create(size)[0].rank, 99);
  }
  assert.throws(() => Deck.create(40), /DECK_SIZE_UNSUPPORTED/);
  assert.throws(() => Deck.create(36, {exclude:['missing']}), /DECK_EXCLUSION_UNKNOWN/);
  assert.throws(() => Deck.create(36, {exclude:['♣12','♣12']}), /DECK_EXCLUSION_UNKNOWN/);
});

test('both builders embed identical standalone rules and validate shared module names', () => {
  const script = `
import importlib.util,json,sys
from pathlib import Path
def load(name, root):
 spec=importlib.util.spec_from_file_location(name,Path(root)/'build.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
app=load('app_build',sys.argv[1]);packs=load('packs_build',sys.argv[2])
result=[]
for game in ['durak','gofish','oldmaid','pexeso']:
 manifest=Path(sys.argv[2])/'packs'/game/'manifest.json'
 result.append({'app':app.read_source_pack(manifest),'packs':packs.build_pack(manifest.parent)})
 for builder in [app,packs]:
  original=json.loads(manifest.read_text())
  for bad in ['standard-deck', ['../escape'], ['standard-deck','standard-deck'], [False]]:
   value={**original,'sharedDomain':bad}
   try:builder.validate_manifest(value,game)
   except ValueError:pass
   else:raise AssertionError('invalid sharedDomain accepted')
print(json.dumps(result,ensure_ascii=False))
`;
  const bundles = JSON.parse(execFileSync('python3', ['-c', script, root, companion], {encoding:'utf8', maxBuffer:4*1024*1024}));
  const E = require('../core/engine.js');
  const UI = require('../core/ui.js');
  const Packs = require('../core/packs.js');
  const manager = new Packs({modelAdapter:require('../core/model-registration.js').adapt,engine:E, views:UI.createRegistry(), catalog:{}, storage:{get:()=>null,set(){}}});
  for (const pair of bundles) {
    assert.deepEqual(pair.app, pair.packs);
    assert.match(pair.app.files['rules.js'], /DECK_SIZE_UNSUPPORTED/);
    manager.install(manager.prepare(pair.app));
    for (const deck of [36,52,54]) {
      let state=E.createGame(pair.app.manifest.id,{deck,seed:17,players:[{name:'One'},{name:'Two'}]});
      assert(E.validateState(state));
      for(let step=0;step<5&&state.status==='playing';step++) {
        const action=E.botAction(state);
        assert(action, pair.app.manifest.id);
        state=E.applyAction(state,state.turn,action);
        assert(E.validateState(state));
      }
    }
  }
});


test('round token geometry is canonical in packs and the pinned host copy has the same digest and output',()=>{
  const crypto=require('node:crypto');
  const packRoot=path.dirname(fs.realpathSync(path.join(root,'packs')));
  const source=fs.readFileSync(path.join(packRoot,'shared/components/round-token.js'),'utf8');
  const lock=JSON.parse(fs.readFileSync(path.join(root,'core/component-assets.json'),'utf8'));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),lock.sha256);
  assert.equal(fs.readFileSync(path.join(root,'core/component-assets.js'),'utf8').split('\n').slice(1).join('\n'),source);
  const canonical=require(path.join(packRoot,'shared/components/round-token.js'));
  const host=require('../core/ui.js').helpers;
  for(const value of [null,0,1,8,10,99,1000])for(const first of [false,true])for(const profile of ['medallion','pawn']){
    assert.equal(host.roundTokenArt({value,first,profile}).replace(/ data-asset-(?:family|params)="[^"]*"/g,''),canonical.roundTokenArt({value,first,profile}));
  }
});

test('shared component and sound resources are pinned to canonical sources and resolve skins locally',()=>{
 const crypto=require('node:crypto'),packRoot=path.dirname(fs.realpathSync(path.join(root,'packs')));
 const lock=JSON.parse(fs.readFileSync(path.join(root,'core/shared-assets.json'),'utf8'));
 for(const item of lock.entries){const source=fs.readFileSync(path.join(packRoot,item.source),'utf8'),target=fs.readFileSync(path.join(root,item.target),'utf8');assert.equal(crypto.createHash('sha256').update(source).digest('hex'),item.sha256,item.source);const body=item.target.endsWith('.json')?target:target.split('\n').slice(1).join('\n');assert.equal(crypto.createHash('sha256').update(body).digest('hex'),item.renderedSha256,item.target);}
 const canonical=require(path.join(packRoot,'shared/components/game-components.js')),host=require('../core/game-components.js'),catalog=require('../themes/assets.json');
 for(const value of [null,1,6,12])for(const frame of ['flat','raised'])assert.equal(host.dieArt(value,{frame}),canonical.dieArt(value,{frame}));
 for(const king of [false,true])assert.equal(host.checkerArt(king,true),canonical.checkerArt(king,true));
 for(const variant of ['main','compact']){const recipe={main:'<div>A</div>',compact:'<div>B</div>',width:66,height:97,variant};assert.equal(host.cardFace(recipe),canonical.cardFrame(canonical.art(recipe,variant)));}
 for(const [a,b]of [[0,0],[1,6],[6,3]])assert.equal(host.dominoFace(a,b,270),canonical.dominoFace(a,b,270));
 const resolver=new host.AssetResolver({catalog,skins:{die:'missing'},palette:{'material.die.face':'#123456'}});
 assert.equal(resolver.resolve('die').variant,'classic');assert.equal(resolver.resolve('die').missing,true);assert.equal(resolver.resolve('die').materials.face,'#123456');
 assert.throws(()=>resolver.resolve('constructor'),/ASSET_FAMILY_UNKNOWN/);assert.match(resolver.render('die',{value:6}),/viewBox="0 0 60 60"/);
 assert.deepEqual(require('../core/standard-sounds.js'),JSON.parse(fs.readFileSync(path.join(packRoot,'shared/sounds/standard-sounds.json'),'utf8')));
});

test('entity references distinguish namespaces and full physical IDs',()=>{
 const C=require('../core/game-components.js');
 const refs=[C.entityRef('card','7'),C.entityRef('tile','7'),C.entityRef('card','copy-7')];
 assert.equal(new Set(refs.map(C.entityKey)).size,3);
 assert.deepEqual(JSON.parse(JSON.stringify(refs[2])),{namespace:'card',id:'copy-7'});
 assert.throws(()=>C.entityKey('card-7'),/ENTITY_REF_INVALID/);
 assert.throws(()=>C.entityRef('card-copy','7'),/ENTITY_REF_INVALID/);
 assert.throws(()=>C.entityKey({namespace:'card',id:'7',face:'secret'}),/ENTITY_REF_INVALID/);
});

test('tutorial controllers own isolated progress and expose no mutable token state',()=>{
 const Controller=require('../application/tutorial-controller.js'),a=new Controller(),b=new Controller(),owner={};
 const context={owner,viewer:0,state:{game:'fixture',status:'playing',players:[{}],turn:0},actions:[{type:'move'}]};
 const definition={steps:[{id:'move',actions:['move']},{id:'draw',actions:['draw']}]};
 a.update(context,definition);b.update(context,definition);const token=a.capture(owner,0);
 token.progress.seen.add('draw');assert.equal(token.progress.seen.has('draw'),false);
 b.committed(owner,0,{type:'move'},token);assert.equal(b.capture(owner,0).progress.seen.size,0);
 a.committed(owner,0,{type:'move'},token);assert.deepEqual([...token.progress.seen],['move']);
 a.restart('fixture');a.update(context,definition);a.committed(owner,0,{type:'draw'},token);assert.equal(a.capture(owner,0).progress.seen.size,0);
});

test('pack tutorials remain separate pure projection consumers and never load in domain entrypoints',()=>{
 for(const id of fs.readdirSync(path.join(root,'packs'))){
  const dir=path.join(root,'packs',id),manifestPath=path.join(dir,'manifest.json');if(!fs.existsSync(manifestPath))continue;
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));if(!manifest.sourceModules)continue;
  const tutorial='presentation/tutorial.js';assert(manifest.sourceModules.view.includes(tutorial),id);
  assert(!manifest.sourceModules.rules.includes(tutorial),id);
  const code=fs.readFileSync(path.join(dir,tutorial),'utf8');
  assert.doesNotMatch(code,/\b(?:document|localStorage|setTimeout|fetch|WebSocket|SessionAuthority|TabletopCore)\b/,id);
  const context=vm.createContext({});vm.runInContext(code,context);assert.equal(typeof context.PlayroomPackTutorial({format:m=>m.key}),'function',id);
  assert.doesNotMatch(fs.readFileSync(path.join(dir,'view.js'),'utf8'),/guideProgress|const required=|const steps=\[\{/ ,id);
 }
});

test('player settings normalization and persistence remain independent of UI and gameplay',()=>{
 const S=require('../application/player-settings.js'),Store=require('../platform/web/player-settings-store.js'),Guide=require('../platform/web/guide-preferences.js');
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},store=new Store(()=>storage),guide=new Guide(()=>storage);
 store.write({autoPass:true,sound:false,hotseatAutoPass:{bad:true,'1:2':true},seatingByGame:{uno:'row',missing:'row'}});guide.setSkipped('uno',true);
 const result=S.normalize(store.read(),{catalog:{uno:{}},normalizeScale:v=>v||100,normalizeSpeed:v=>v});
 assert.equal(result.autoPass,true);assert.deepEqual(result.hotseatAutoPass,{'1:2':true});assert.deepEqual(result.seatingByGame,{uno:'row'});assert(guide.skipped('uno'));
 const first=S.defaults();first.hotseatAutoPass.x=true;assert.deepEqual(S.defaults().hotseatAutoPass,{});
 const unavailable=new Store(()=>{throw Error('blocked');});assert.deepEqual(unavailable.read(),{});assert.equal(unavailable.write({}),false);
});

test('user learning persists across sessions, stops tracking when disabled, and respects action revisions',()=>{
 const Store=require('../platform/web/guide-preferences.js'),Controller=require('../application/tutorial-controller.js');const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 let user='alice';const store=new Store(()=>storage,()=>user),c=new Controller({store});
 const context=()=>({owner:{},viewer:0,state:{game:'fixture',status:'playing',turn:0,players:[{}]},actions:[{type:'move'}]});
 const definition=revision=>({required:['move','new'],revisions:{move:revision},steps:[{id:'move',actions:['move']},{id:'new',actions:['draw']}]});
 let ctx=context();c.update(ctx,definition(1));let token=c.capture(ctx.owner,0);c.committed(ctx.owner,0,{type:'move'},token);assert.equal(store.read('fixture').mastered.move,1);
 ctx=context();let result=c.update(ctx,definition(1));assert(result.progress.seen.has('move'));token=c.capture(ctx.owner,0);
 store.setEnabled('fixture',false);assert.equal(c.update(ctx,definition(1)),null);c.committed(ctx.owner,0,{type:'draw'},token);assert(!store.read('fixture').mastered.new);
 store.setEnabled('fixture',true);result=c.update(ctx,definition(1));assert(result.progress.seen.has('move'),'resume preserves mastered actions');result=c.update(ctx,definition(2));assert(!result.progress.seen.has('move'),'changed action needs learning again');assert(!result.progress.seen.has('new'));
 token=c.capture(ctx.owner,0);c.committed(ctx.owner,0,{type:'move'},token);assert.equal(store.read('fixture').mastered.move,2);
 const restored=new Store(()=>storage,()=>user);assert.equal(restored.read('fixture').mastered.move,2);assert.deepEqual(restored.read('another').mastered,{});
 user='bob';assert.deepEqual(store.read('fixture').mastered,{});user='alice';c.restart('fixture');assert.deepEqual(store.read('fixture').mastered,{});assert(store.read('fixture').enabled);
});

test('pack update cleanup preserves referenced versions, active rooms and failed archive reads',async()=>{
 const Cleanup=require('../application/pack-update-cleanup.js');
 let items=[{id:'game',version:'1',active:false},{id:'game',version:'2',active:false},{id:'game',version:'3',active:true}],active=false;
 const cleanup=new Cleanup({manager:{list:()=>items,remove:(id,version)=>{items=items.filter(p=>p.version!==version);}},compare:(a,b)=>Number(a)-Number(b),localReferences:(_,v)=>v==='1'?['saved']:[],networkArchives:async()=>[],activeRoom:()=>active});
 active=true;assert.deepEqual(await cleanup.run('game'),[]);active=false;assert.deepEqual(await cleanup.run('game'),['2']);assert.deepEqual(items.map(p=>p.version),['1','3']);
 cleanup.localReferences=()=>[];cleanup.networkArchives=async()=>[{game:'game',packVersion:'1'}];assert.deepEqual(await cleanup.run('game'),[]);
 cleanup.networkArchives=async()=>{throw Error('archive unavailable');};await assert.rejects(()=>cleanup.run('game'));assert.equal(items.length,2);
});

test('round token pawn profile puts the white rim on the top only and preserves the artboard',()=>{
 const geometry=require(path.join(companion,'shared/components/round-token.js'));
 const pawn=geometry.roundTokenArt({profile:'pawn',value:4}),normal=geometry.roundTokenArt({value:4});
 assert.match(pawn,/viewBox="0 0 100 100"/);assert.match(pawn,/pawn-token-art/);assert(!normal.includes('pawn-token-art'));
 const side=pawn.match(/<circle class="pawn-token-side"[^>]+>/)[0],face=pawn.match(/<circle class="piece-contour pawn-token-face"[^>]+>/)[0];
 assert(!side.includes('stroke='));assert.match(face,/stroke="var\(--round-token-rim/);
 assert(+side.match(/cy="([\d.]+)"/)[1]+ +side.match(/r="([\d.]+)"/)[1]<=100);
 assert.match(pawn,/>4<\/text>/);assert.throws(()=>geometry.roundTokenArt({profile:'other'}));
});
