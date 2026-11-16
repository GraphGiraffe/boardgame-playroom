/* Shared host UI contracts plus actual installed isolated pack scenes. */
'use strict';
const assert=require('node:assert/strict');
const {test,before,after}=require('node:test');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const games=['uno','domino','durak','checkers','snakes'];
const loadedGames=[...games,'ludo','pexeso','battleship','yatzy','oldmaid','gofish','klondike','spider','mage-brawl','tictactoe'];
// Only trusted application modules run in this host fixture. All pack text is
// installed as inert compiler output and evaluated exclusively by portable VM.
const sandbox=vm.createContext({console});
for(const file of ['core/messages.js','core/icons.js','presentation/localization.js','core/vector-art.js','core/component-assets.js','core/mini-split-deck.js','core/game-components.js','core/token-layout.js','core/ui.js','app/views.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),sandbox,{filename:file});
let environment,E,V;
before(async()=>{environment=await require('./sdk-installed.cjs').bootstrap({ids:loadedGames});E=environment.engine;V=environment.views;});
after(()=>environment?.close());
const clone=value=>JSON.parse(JSON.stringify(value));
const make=(game,preset='classic',count=2,seed=17,options={})=>E.createGame(game,{preset,seed,...options,players:Array.from({length:count},(_,i)=>({name:'Игрок '+(i+1)}))});
const decode=value=>value.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const actionsIn=html=>[...html.matchAll(/data-action="([^"]+)"/g)].map(m=>JSON.parse(decode(m[1])));
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const wire=(state,viewer=state.turn)=>E.project(state,viewer).modelProjection;
const scene=(state,viewer=state.turn)=>E.project(state,viewer).scene;
function checkChoices(state,viewer=state.turn){const projected=E.project(state,viewer),legal=projected.modelProjection.actions,shown=(projected.scene.interactions||[]).map(i=>i.command);assert.deepEqual(new Set(shown.map(canonical)),new Set(legal.map(canonical)),state.game+' exact scene controls');assert.equal(require('../presentation/scene-contract.js').commands(projected.scene,projected.modelProjection),projected.scene);return projected.scene;}


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

test('public frame ports accept a full two-step overview and retain a finite 64-frame bound',()=>{
 const registry=sandbox.TabletopUI.createRegistry(),owner={},sink=new Map();let count=34,calls=0;
 registry.register('uno',(_state,_viewer,_actions,ui)=>{const plan={id:'bounded:'+count,initial:0,final:count,groups:Array.from({length:count},(_,scene)=>({scene,duration:750,cues:[]}))};return {api:3,family:'cards',elements:{field:ui.publicFrames({key:'round',plan,renderFrame:()=>{calls++;return {markup:'<b>public</b>',label:'phase'};},live:{markup:'<b>live</b>',label:'live'}})}};});
 const state=E.project(make('uno'),0);registry.render(state,0,[],{renderOwner:owner,regionSink:sink});assert.equal(calls,0);const source=sink.publicFrames.get('scene:round');assert.equal(source.count,35);assert.equal(source.read(33).label,'phase');assert.equal(calls,1);assert.equal(source.read(34).label,'live');
 count=64;const maximum=new Map();registry.render(state,0,[],{renderOwner:owner,regionSink:maximum});assert.equal(maximum.publicFrames.get('scene:round').count,65);count=65;const rejected=new Map();assert.doesNotMatch(registry.render(state,0,[],{renderOwner:owner,regionSink:rejected}),/data-public-frame-source/);assert.equal(rejected.publicFrames,undefined,'an over-bound plan fails closed');
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
  for(const counters of [[{kind:'points',value:NaN}],[{kind:'wins',value:1.5}],[{kind:'unknown',value:2}],[{kind:'wins',value:2,label:3}],[{kind:'points',value:0},{kind:'points',value:1}]])assert.throws(()=>UI.composeScene({api:3,family:'cards',elements:{field:'x'},playerContent:[{counters}]}));

  const pieces=H.playerPanel({players:[{name:'A',score:0}],turn:0},0,0,{counters:[{kind:'wins',value:0},{kind:'pieces',value:12,label:'Светлые шашки'}]});
  assert.match(pieces,/is-pieces[^>]*aria-label="Светлые шашки: 12"[^>]*><svg\b[^>]*\bclass="round-token-art medallion-art"/);
  assert.doesNotMatch(pieces,/>12 шашек</);
  const empty=H.playerPanel({players:[{name:'A'},{name:'B'}],turn:1},1,0,{handCount:0});
  assert.match(empty,/piece-count is-hand[^>]*data-piece-count="0"/);assert.match(empty,/class="mini-hand [^"]*"[^>]*><\/div>/);
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

test('every legal action remains reachable through exact semantic source and target choices',()=>{
 for(const game of games)for(const {id:preset}of E.get(game).presets)for(const count of [2,...(E.get(game).max===4?[4]:[])])for(const seed of [1,7,21]){
  let state=make(game,preset,count,seed);
  for(let step=0;step<18&&state.status==='playing';step++){
   const before=canonical(state);checkChoices(state);assert.equal(canonical(state),before,'presentation does not mutate authority');
   const command=E.botAction(state);if(!command)break;state=E.applyAction(state,state.turn,command);
  }
 }
});

test('private hands and decks hide identities while public hands retain every card',()=>{
 for(const game of ['uno','domino','durak']){
  const state=make(game),hand=state.data.hands[1],stock=state.data.drawPile||state.data.stock;
  hand.push(...stock.splice(1,Math.min(12,stock.length-1)));
  for(const viewer of [0,-1]){const s=scene(state,viewer);assert.equal(s.players[1].hand.length,hand.length);assert(s.players[1].hand.every(card=>card.hidden&&!Object.hasOwn(card,'id')));const shown=new Set((s.objects||[]).map(o=>o.ref.id));for(const card of [...hand,...stock])assert(!shown.has(card.id),game+' hidden entity ID');}
  state.openHands=true;const s=scene(state,0);assert.deepEqual(s.players[1].hand.map(c=>c.id),hand.map(c=>c.id));const shown=new Set(s.objects.map(o=>o.ref.id));for(const card of stock)assert(!shown.has(card.id),game+' stock stays hidden with open hands');
 }
});

test('domino legal placements predict each side and exact resulting orientation',()=>{
 const covered=new Set();
 for(const seed of [1,7,17]){let state=make('domino','classic',2,seed);
  for(let step=0;step<70&&state.status==='playing';step++){
   const s=checkChoices(state),legal=wire(state).actions.filter(a=>a.type==='play');assert.equal(s.placements.length,legal.length);
   for(const command of legal){const preview=s.placements.find(p=>canonical(p.command)===canonical(command));assert(preview);const result=E.applyAction(state,state.turn,command),placed=command.side==='left'?result.data.chain[0]:result.data.chain.at(-1);assert.deepEqual([preview.a,preview.b],[placed.a,placed.b]);const original=state.data.hands[state.turn].find(c=>c.id===command.card);covered.add(state.data.chain.length?command.side:'opening');if(original.a!==preview.a)covered.add('reversed');if(preview.a===preview.b)covered.add('double');}
   const command=E.botAction(state);if(!command)break;state=E.applyAction(state,state.turn,command);
  }
 }
 for(const value of ['opening','left','right','reversed','double'])assert(covered.has(value),value);
});

test('UNO turn previews and wild colour choices agree with committed rules for every legal card',()=>{
 const covered=new Set();
 for(const count of [2,4])for(const seed of [1,7,17,21]){let state=make('uno','classic',count,seed);
  for(let step=0;step<28&&state.status==='playing';step++){
   const s=checkChoices(state),plays=wire(state).actions.filter(a=>a.type==='play');
   for(const id of new Set(plays.map(a=>a.card))){const choices=plays.filter(a=>a.card===id),result=E.applyAction(state,state.turn,choices[0]),next=result.status==='playing'?result.turn:null,card=state.data.hands[state.turn].find(c=>c.id===id);assert.equal(s.nextPlayerByCard[id],next);const special=['skip','reverse','+2','+4'].includes(card.value),hint=s.turnPreviewByCard[id];assert.equal(!!hint,special);if(special){covered.add(card.value);assert.equal(hint.nextPlayer,next);assert(hint.affected.every(p=>Number.isInteger(p)&&p>=0&&p<count));}if(choices.length>1){covered.add(card.value);assert.equal(new Set(choices.map(a=>a.color)).size,choices.length);assert(choices.every(a=>['red','yellow','green','blue'].includes(a.color)));}else covered.add('normal');}
   const publicScene=scene(state,-1);assert.deepEqual(publicScene.nextPlayerByCard,{});assert.deepEqual(publicScene.turnPreviewByCard,{});
   const command=E.botAction(state);if(!command)break;state=E.applyAction(state,state.turn,command);
  }
 }
 for(const value of ['normal','wild','skip','reverse','+2','+4'])assert(covered.has(value),value);
});

test('manual UNO controls and accusations preserve public declaration context without hidden catch hints',()=>{
 const state=make('uno','classic',4);state.data.uno.mode='manual';
 for(const count of [7,2,1]){state.data.drawPile.push(...state.data.hands[0].splice(count));for(const viewer of [0,1]){const p=E.project(state,viewer);assert.equal(p.scene.manualDeclaration,true);assert(p.modelProjection.actions.some(a=>a.type==='declare-uno'));assert.deepEqual(p.scene.declared,state.data.uno.declared);const targets=p.modelProjection.actions.filter(a=>a.type==='accuse-uno').map(a=>a.target);assert.deepEqual(targets,[0,1,2,3].filter(i=>i!==viewer));}}
 state.data.uno.pending=0;const pending=scene(state,1);state.data.uno.pending=null;assert.deepEqual(scene(state,1),pending,'hidden catch window changes no public scene');
 state.data.uno.declared[0]=true;assert.equal(scene(state,1).declared[0],true);assert(wire(state,1).actions.some(a=>a.type==='accuse-uno'&&a.target===0));
 const wild=state.data.drawPile.splice(state.data.drawPile.findIndex(c=>c.value==='wild'),1)[0];state.data.hands[0].push(wild);state.data.uno.declared[0]=false;assert.equal(scene(state,0).manualDeclaration,true);
 state.data.uno.mode='auto';assert.equal(scene(state,0).manualDeclaration,false);assert(!wire(state,0).actions.some(a=>['declare-uno','accuse-uno'].includes(a.type)));
 const setting=environment.bundles.find(b=>b.manifest.id==='uno').manifest.settings.find(s=>s.key==='unoMode');assert.equal(setting.default,'manual');assert.deepEqual(clone(setting.options.map(o=>o.value)),['manual','auto']);delete state.data.uno;assert.throws(()=>E.validateState(state));
});

test('trusted action markup escapes player controlled labels and exact JSON commands',()=>{
 const attack='"><img src=x onerror=alert(1)> & \' <script>',action={type:'test',label:attack,card:attack};assert.deepEqual(actionsIn(V.helpers.actionButton(action)),[action]);assert.doesNotMatch(V.helpers.actionButton(action),/<img|<script>|onerror="/);
 for(const game of games){const state=make(game);state.players.forEach(p=>{p.name=attack;});const p=E.project(state,0);assert(p.players.every(person=>person.name===attack));checkChoices(state);}
});

test('checkers forced sources and snakes board geometry agree with actual isolated state',()=>{
 let state=make('checkers');for(let step=0;step<60&&state.status==='playing';step++){const s=checkChoices(state);assert.equal(s.columns*s.rows,64);assert.equal(s.pieces.length,state.data.board.filter(Boolean).length);assert.equal(s.forced,state.data.forced);if(s.forced!==null)assert(wire(state).actions.every(a=>a.from===s.forced));state=E.applyAction(state,state.turn,E.botAction(state));}
 for(const {id:preset}of E.get('snakes').presets){const state=make('snakes',preset,4),s=scene(state);assert.equal(s.finish,state.data.finish);assert.equal(s.columns**2,state.data.finish);assert.equal(s.players.length,4);assert.deepEqual(s.positions.map(p=>p.cell),state.data.positions);}
});

test('all current isolated packs emit bounded semantic scenes with application owned placement',()=>{
 for(const game of loadedGames){const r=E.get(game),state=make(game,r.presets[0].id,Math.min(2,r.max)),p=E.project(state,0),s=p.scene;assert.equal(s.contractVersion,1);assert.equal(s.players.length,state.players.length);assert(s.geometry&&s.zones&&s.objects&&s.interactions);assert(!Object.hasOwn(s,'html')&&!Object.hasOwn(s,'css')&&!Object.hasOwn(s,'render'));assert(s.support.catalog.manual.length||s.support.catalog.manual.sections?.length);for(const person of s.players)assert.equal(person.player,state.players[person.player]&&person.player);checkChoices(state);}
});

test('player hand counts and semantic score units match actual authority rules for every audience',()=>{
 for(const game of games){const state=make(game);for(const viewer of [-1,0,1]){const s=scene(state,viewer);for(const p of s.players){if(state.data.hands){assert.equal(p.hand.length,state.data.hands[p.player].length);assert.equal(p.hand.every(c=>c.hidden),viewer!==p.player);const z=s.zones.find(z=>z.id==='hand-'+p.player);assert.equal(z.count,p.hand.length);}for(const metric of p.metrics){assert(['points','wins','pieces'].includes(metric.kind));assert.equal(typeof metric.label,'string');assert(metric.label.length>0);assert(Number.isFinite(metric.value));}}if(['uno','durak'].includes(game))assert.equal(s.stockCount,state.data.drawPile.length);}}
});

test('snakes routes include every bounce and preserve landing before an explicit link jump',()=>{
 const state=make('snakes');state.data.positions[0]=31;state.data.lastMove={player:0,from:51,landing:54,to:31,roll:3};state.data.dice=3;
 let route=scene(state,0).sequence;assert.deepEqual(route.steps.map(x=>x.anchor),['cell-52','cell-53','cell-54']);assert.equal(route.jump.anchor,'cell-31');assert.equal(route.trigger,'roll');
 state.data.positions[0]=98;state.data.lastMove={player:0,from:98,landing:98,to:98,roll:4};state.data.dice=4;route=scene(state,0).sequence;assert.deepEqual(route.steps.map(x=>x.anchor),['cell-99','cell-100','cell-99','cell-98']);assert.equal(route.jump,undefined);
});

test('relative seat policy preserves identities and canonical spectator order',()=>{
 const H=sandbox.TabletopUI.helpers;
 for(const count of [2,3,4])for(let viewer=-1;viewer<count;viewer++){const expected=viewer<0?Array.from({length:count},(_,i)=>i):Array.from({length:count-1},(_,i)=>(viewer+i+1)%count);assert.deepEqual(Array.from(H.seatOrder(count,viewer)),expected);const state=make('uno','classic',count),before=canonical(state),s=scene(state,viewer);assert.deepEqual(s.players.map(p=>p.player),Array.from({length:count},(_,i)=>i));assert.equal(canonical(state),before);}
});

test('semantic position badges and Durak roles remain numeric and mutually exclusive',()=>{
 const snakes=make('snakes');snakes.data.positions=[0,16];assert.deepEqual(scene(snakes).players.map(p=>p.metrics.find(m=>m.id==='position').value),[0,16]);
 const durak=make('durak');durak.data.taking=true;const taking=scene(durak);assert.equal(taking.taking,true);assert.equal(taking.players[durak.data.defender].role,'defender');assert.equal(taking.players.filter(p=>p.role==='defender').length,1);durak.data.taking=false;assert.equal(scene(durak).players[durak.data.defender].role,'defender');
});

test('actual isolated registrations match exact current distributable manifest versions',()=>{
 for(const game of loadedGames){const manifest=JSON.parse(fs.readFileSync(path.join(root,'packs',game,'manifest.json'),'utf8')),bundle=environment.bundles.find(b=>b.manifest.id===game);assert.equal(E.get(game).version,manifest.version);assert.equal(bundle.manifest.version,manifest.version);assert.equal(bundle.manifest.execution,'isolated-v1');assert(bundle.manifest.sdkFeatures.includes('isolated-execution-v1'));assert.equal(JSON.parse(bundle.files['sdk/source.json']).manifest.version,manifest.version);}
});
