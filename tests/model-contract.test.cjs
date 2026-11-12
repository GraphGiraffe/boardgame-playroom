'use strict';
require('../core/model-registration.js');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {execFileSync}=require('node:child_process');
const {GameModel,projectEvents}=require('../core/model-runtime.js');
const root=path.resolve(__dirname,'..');
const packs=path.dirname(fs.realpathSync(path.join(root,'packs')));
const definition=require('../packs/tictactoe/domain/game.js');
const presentation=require('../packs/tictactoe/presentation/scene.js');
const model=new GameModel(definition);
const initial=firstPlayer=>model.create({playerCount:2,firstPlayer,preset:'classic'});
const apply=(position,cell)=>model.apply(position,position.turn,{type:'place',cell}).position;
const coded=code=>error=>error.code===code;

test('rules and scenes execute headlessly without engine, DOM, clock, storage or ambient RNG',()=>{
  const context=vm.createContext({});
  vm.runInContext('Math.random=Date.now=()=>{throw Error("ambient dependency")};',context);
  for(const file of ['core/messages.js','core/model-values.js','core/events.js','core/bot-difficulty.js','core/model-runtime.js'].map(file=>path.join(root,file)).concat([path.join(packs,'packs/tictactoe/domain/game.js'),path.join(packs,'packs/tictactoe/presentation/scene.js')])){
    vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
  }
  const value=JSON.parse(vm.runInContext(`JSON.stringify((()=>{
    const model=new PlayroomModelRuntime.GameModel(PlayroomPackDefinition);
    const position=model.create({playerCount:2,firstPlayer:1,preset:'classic'});
    const next=model.apply(position,1,{type:'place',cell:4});
    return {scene:PlayroomPackPresentation.scene(model.project(next.position,0)),events:next.events};
  })())`,context));
  assert.equal(value.scene.cells[4].mark,'X');assert.equal(value.scene.cells[4].owner,1);
  assert.equal(value.events[0].type,'tictactoe.placed');assert.equal(value.events[0].text,undefined);
  for(const key of ['TabletopCore','TabletopUI','document','window','localStorage'])assert.equal(context[key],undefined);
});

test('commands have exact value identity and immutable transitions reject stale or decorated input',()=>{
  const position=initial(0),before=JSON.stringify(position);
  const changed=model.apply(position,0,{cell:4,type:'place'});
  assert.equal(JSON.stringify(position),before);assert.equal(changed.position.data.board[4],0);
  assert(Object.isFrozen(position.data.board));assert(Object.isFrozen(changed.events[0].params));
  assert.throws(()=>model.apply(position,0,{type:'place',cell:4,label:'A'}),coded('ACTION_UNAVAILABLE'));
  assert.throws(()=>model.apply(position,1,{type:'place',cell:4}),coded('ACTION_UNAVAILABLE'));
  assert.throws(()=>model.apply(changed.position,1,{type:'place',cell:4}),coded('ACTION_UNAVAILABLE'));
  for(const cell of [NaN,Infinity,undefined,new Date(0)])assert.throws(()=>model.apply(position,0,{type:'place',cell}));
  const cyclic={type:'place'};cyclic.cell=cyclic;assert.throws(()=>model.apply(position,0,cyclic),coded('JSON_INVALID'));
  assert.deepEqual(model.legalActions(position,-1),[]);
});

test('immutable event projections reuse prior facts without mixing viewers or trusting mutable inputs',()=>{
 const Events=require('../core/events.js');
 const draft={type:'cards.drawn',actor:0,params:{card:'secret-spades'},visibility:{kind:'players',players:[0]},publicEvent:{type:'cards.received',actor:0,params:{count:1},visibility:{kind:'public'}}};
 const journal=Events.append([], [draft],2,1),owner=Events.project(journal,0,2),other=Events.project(journal,1,2);
 assert.equal(Events.project(journal,0,2)[0],owner[0]);
 assert.equal(Events.project(Events.append(journal,[draft],2,2),0,2)[0],owner[0]);
 assert.equal(owner[0].params.card,'secret-spades');assert.equal(other[0].params.card,undefined);assert.notEqual(owner[0],other[0]);
 assert(Object.isFrozen(owner)&&Object.isFrozen(owner[0].params));
 draft.params.card='changed';assert.equal(Events.project([draft],0,2)[0].params.card,'changed');draft.params.card='again';assert.equal(Events.project([draft],0,2)[0].params.card,'again');
 assert.throws(()=>Events.project(journal,0,0));
});

test('visibility is resolved before events reach presentation and invalid viewers receive only public data',()=>{
  const secret={type:'cards.drawn',actor:0,params:{card:'secret-spades'},visibility:{kind:'players',players:[0]},
    publicEvent:{type:'cards.received',actor:0,params:{count:1},visibility:{kind:'public'}}};
  const privateOnly={type:'cards.peeked',actor:0,params:{card:'hidden-diamond'},visibility:{kind:'players',players:[0]}};
  for(const viewer of [-1,1,99,'0',null,undefined,NaN]){
    const visible=projectEvents([secret,privateOnly],viewer,2);
    assert.deepEqual(visible,[{type:'cards.received',actor:0,params:{count:1}}]);
    assert(!JSON.stringify(visible).includes('secret'));assert(!JSON.stringify(visible).includes('hidden'));
  }
  assert.equal(projectEvents([secret,privateOnly],0,2).length,2);
  assert.throws(()=>projectEvents([{...secret,visibility:{kind:'players',players:[99]}}],0,2),coded('EVENT_INVALID'));
  const position={...initial(0),rng:13,authoritySecret:'never-project'};
  for(const viewer of [-1,1,99,'0',null]){
    const projected=model.project(position,viewer,[secret]);
    assert(!JSON.stringify(projected).includes('never-project'));assert.equal(projected.rng,undefined);
    assert.deepEqual(projected.actions,[]);
  }
});

test('bots receive only authorized projections and must choose an actual canonical command',()=>{
  const probe={...definition,project:()=>({public:true}),bot(projection,actor,choices){
    assert.deepEqual(projection.data,{public:true});assert.equal(projection.authoritySecret,undefined);
    return {...choices[0]};
  }};
  assert.deepEqual(new GameModel(probe).botAction({...initial(0),authoritySecret:'private'},0,{enabled:false}),{type:'place',cell:0});
  assert.throws(()=>new GameModel({...probe,bot:()=>({type:'place',cell:99})}).botAction(initial(0),0),coded('BOT_ACTION_INVALID'));
  assert.equal(model.botAction(initial(0),0,{enabled:false}).cell,4);
  let position=initial(0);for(const cell of [0,3,1,4])position=apply(position,cell);
  assert.equal(model.botAction(position,0,{enabled:false}).cell,2);
  position=initial(0);for(const cell of [0,3,4])position=apply(position,cell);
  assert.equal(model.botAction(position,1,{enabled:false}).cell,8);
});

test('Table has spectator data and only explicitly public controls, including dice',()=>{
  const fixture={contractVersion:1,id:'public-table',minPlayers:2,maxPlayers:2,
    create:()=>({playerCount:2,turn:0,status:'playing',winners:[],data:{die:6,hands:[['secret-A'],['secret-B']]}}),
    validate:()=>true,
    actions:(position,actor)=>actor===position.turn?[
      {command:{type:'roll'},visibility:'public'},
      {command:{type:'play',card:'secret-A'},visibility:'private'}]:[],
    reduce:position=>({position:{...position,turn:1,data:{...position.data,die:2}},events:[]}),
    project:(position,viewer)=>({die:position.data.die,hands:position.data.hands.map((hand,owner)=>
      position.openHands||owner===viewer?[...hand]:hand.map(()=>({hidden:true})))}),
    result:()=>({winners:[],places:[1,1],metrics:[{id:'wins',values:[0,0]}]})};
  const game=new GameModel(fixture),position=game.create({playerCount:2});
  const spectator=game.project(position,-1),table=game.projectTable(position,0);
  assert.deepEqual(table.data,spectator.data);assert.equal(table.data.die,6);
  assert.deepEqual(table.actions,[{type:'roll'}]);assert.equal(table.viewer,-1);assert.equal(table.actor,0);
  assert(!JSON.stringify(table).includes('secret-'));assert.equal(game.project(position,0).data.hands[0][0],'secret-A');
  assert.deepEqual(game.projectTable(position,-1).actions,[]);assert.deepEqual(game.projectTable(position,1).actions,[]);
  assert.throws(()=>game.commandFor(position,0,{type:'play',card:'secret-A'},'table'),coded('TABLE_ACTION_UNAVAILABLE'));
  assert.deepEqual(game.commandFor(position,0,{type:'play',card:'secret-A'}),{type:'play',card:'secret-A'});
  assert.deepEqual(game.commandFor(position,0,{type:'roll'},'table'),{type:'roll'});
  const open={...position,openHands:true};assert.deepEqual(game.projectTable(open,0).data,game.project(open,-1).data);
  assert.deepEqual(game.projectTable(open,0).data.hands,[['secret-A'],['secret-B']]);
});

test('both first-player assignments match an independent bitboard oracle for the entire reachable graph',t=>{
  const masks=[7,56,448,73,146,292,273,84];
  for(const first of [0,1]){
    const pending=[{position:initial(first),x:0,o:0}],seen=new Set();let edges=0;
    while(pending.length){
      const {position,x,o}=pending.pop(),key=x+':'+o;
      if(seen.has(key))continue;seen.add(key);
      assert(model.validate(position));
      const actions=model.legalActions(position,position.turn);
      if(position.status==='finished'){
        assert.deepEqual(actions,[]);const result=model.result(position);
        assert.deepEqual(result.winners,position.winners);
        assert.deepEqual(result.metrics[0].values,[0,1].map(player=>position.winners.includes(player)?1:0));
        continue;
      }
      assert.equal(actions.length,9-position.data.board.filter(value=>value!==null).length);
      for(const command of actions){
        const actor=position.turn,next=model.apply(position,actor,command),bit=1<<command.cell;
        const a=actor===first?x|bit:x,b=actor===first?o:o|bit;
        const owned=actor===first?a:b,won=masks.some(mask=>(owned&mask)===mask),full=(a|b)===511;
        assert.equal(next.position.status,won||full?'finished':'playing');
        assert.deepEqual(next.position.winners,won?[actor]:[]);
        assert.equal(next.position.turn,won||full?actor:1-actor);
        const scene=presentation.scene(model.project(next.position,actor));
        assert.equal(scene.cells[command.cell].mark,actor===first?'X':'O');
        pending.push({position:next.position,x:a,o:b});edges++;
      }
    }
    assert.equal(seen.size,5478);t.diagnostic(`first=${first}: ${seen.size} positions, ${edges} transitions`);
  }
});

test('the model rejects unreachable or inconsistent imported positions',()=>{
  const copy=()=>JSON.parse(JSON.stringify(initial(0)));
  for(const change of [p=>p.turn=1,p=>p.data.board[0]=1,p=>p.data.marks=['X','X'],
    p=>p.data.board=[0,0,0,1,1,1,null,null,null],p=>{p.status='finished';p.winners=[0];},
    p=>p.data.board.push(null),p=>p.data.extra=true]){
    const position=copy();change(position);assert.throws(()=>model.validate(position),coded('POSITION_INVALID'));
  }
});

test('the integration bridge preserves assigned marks, results, scores and exact-version save/replay',()=>{
  const E=require('../core/engine.js'),Session=require('../core/session.js');require('../packs/tictactoe/rules.js');
  for(const firstPlayer of [0,1]){
    const session=new Session(E,'tictactoe',{seed:17,players:[{name:'Первый'},{name:'Второй'}],firstPlayerMode:'assigned',firstPlayer});
    const rng=session.current.rng;
    for(const cell of [0,3,1,4,2])session.act(session.current.turn,{type:'place',cell});
    assert(E.validateState(session.current));assert.equal(session.current.winner,firstPlayer);
    assert.equal(session.current.players[firstPlayer].score,1);assert.equal(session.current.rng,rng);
    assert.equal(session.current.packVersion,require('../packs/tictactoe/manifest.json').version);assert.equal(session.current.data.marks[firstPlayer],'X');
    assert.deepEqual(session.current.result.values,[0,1].map(player=>player===firstPlayer?1:0));
    assert.equal(session.current.events.at(-1).type,'tictactoe.won');
    assert.equal(session.current.events.at(-1).text,undefined);
    assert.equal(session.view(firstPlayer).events.at(-1).message.key,'tictactoe.events.won');
    assert(!Object.keys(session.current).some(key=>key.startsWith('__')));
    const restored=Session.restore(E,JSON.parse(session.serialize()));
    assert.deepEqual(restored.current,session.current);
    assert.deepEqual(restored.view(firstPlayer,1).modelProjection.data.board,[firstPlayer,null,null,null,null,null,null,null,null]);
    assert.deepEqual(restored.view(-1).modelProjection.actions,[]);
  }
});

test('canonical private events persist without presentation and project before translation, sound or replay',()=>{
  const E=require('../core/engine.js'),Session=require('../core/session.js');
  const described=[];
  const privateModel={...definition,id:'private-model-fixture',reduce(position,actor,command){
    const changed=definition.reduce(position,actor,command);
    return {...changed,events:[
      {type:'private.reveal',actor,params:{secret:'PRIVATE-CARD'},visibility:{kind:'players',players:[actor]}},
      {type:'private.reveal',actor,params:{secret:'PRIVATE-OTHER'},visibility:{kind:'players',players:[actor]},
        publicEvent:{type:'tictactoe.placed',actor,params:{mark:'X',cell:0},visibility:{kind:'public'}}}
    ]};
  }};
  const adapted=globalThis.PlayroomModelRegistration.adapt(E,{definition:privateModel,
    presentation:{...presentation,event(value){
      described.push(value.params.secret||'public');
      return value.type==='private.reveal'?{kind:'move',message:{key:'tictactoe.events.placed',params:{mark:value.params.secret,cell:1}}}:presentation.event(value);
    }},locales:{ru:require('../packs/tictactoe/locales/ru/game.json')},version:'0.2.0'});
  E.register(adapted);
  const session=new Session(E,adapted.id,{seed:17,players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0});
  session.act(0,{type:'place',cell:0});assert.deepEqual(described,[]);
  assert.equal(session.current.events.at(-1).revision,1);
  for(const viewer of [-1,1]){
    const view=session.view(viewer);assert(!JSON.stringify(view).includes('PRIVATE-'));
    assert.equal(view.events.at(-1).type,'tictactoe.placed');
    assert.equal(view.events.at(-1).id,session.current.events.at(-1).id);
    assert.equal(E.soundCues(session.current,viewer,1).length,1);
  }
  assert(described.every(value=>value==='public'));
  assert(JSON.stringify(session.view(0)).includes('PRIVATE-CARD'));
  const restored=Session.restore(E,JSON.parse(session.serialize()));
  assert.deepEqual(restored.export(),session.export());
  assert(!JSON.stringify(restored.view(-1,1)).includes('PRIVATE-'));
  assert.equal(restored.current.events.at(-1).text,undefined);
});

test('authority preserves model projections, idempotency and read-only spectators without leaking authority fields',()=>{
  const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),Protocol=require('../core/protocol.js');
  require('../packs/tictactoe/rules.js');
  const session=new Session(E,'tictactoe',{seed:'never-send-seed',players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:1});
  const authority=new Authority(session),player=authority.connect(1),spectator=authority.connect(-1);
  try{
    const request=Protocol.command(player.snapshot(),{type:'place',cell:4,label:'UI label',tooltip:'private client text'},'model-move');
    assert.deepEqual(request.action,{type:'place',cell:4});
    assert.equal(spectator.dispatch(Protocol.command(spectator.snapshot(),{type:'place',cell:4},'forged')).code,'READ_ONLY');
    assert.equal(player.dispatch(request).ok,true);assert.equal(player.dispatch(request).duplicate,true);
    assert.equal(authority.revision,1);assert.equal(player.snapshot().state.scene.cells[4].owner,1);
    const publicView=spectator.snapshot();assert.deepEqual(publicView.state.scene.interactions,[]);
    assert.equal(publicView.state.scene.viewer,-1);assert(!JSON.stringify(publicView).includes('never-send-seed'));
    assert.equal(spectator.history(0).state.scene.cells[4].owner,null);
    assert.equal(publicView.state.data,undefined);assert.equal(publicView.state.modelProjection,undefined);
    assert.equal(publicView.state.firstPlayer,1);
    assert.equal(publicView.state.firstPlayerMode,'assigned');
    const other=authority.connect(0);
    for(const [connection,cell]of [[other,0],[player,3],[other,1],[player,5]]){
      assert.equal(connection.dispatch(Protocol.command(connection.snapshot(),{type:'place',cell},'finish-'+cell)).ok,true);
    }
    assert.equal(spectator.snapshot().state.result.metricId,'wins');
    assert.deepEqual(spectator.snapshot().state.result.values,[0,1]);
    assert.equal(spectator.snapshot().state.firstPlayer,1);
  }finally{authority.dispose();}
});

test('both builders compile the same autonomous layered pack and reject invalid module and locale declarations',()=>{
  const script=`
import importlib.util,json,sys
from pathlib import Path
def load(name,folder):
 spec=importlib.util.spec_from_file_location(name,Path(folder)/'build.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
app=load('app_build',sys.argv[1]);packs=load('packs_build',sys.argv[2])
manifest=Path(sys.argv[2])/'packs/tictactoe/manifest.json'
for builder in [app,packs]:
 for source in [None,[],{'unknown':[]},{'rules':'domain/game.js'},{'rules':['domain/../rules.js']},
                {'rules':['domain/game.js','domain/game.js']},{'locales':{'ru':['locales/en/game.json']}},
                {'locales':{'ru':['locales/ru/game.json','locales/ru/game.json']}}]:
  try:builder.bundle_source_modules({'rules.js':'','view.js':''},source,lambda path:'{}')
  except ValueError:pass
  else:raise AssertionError('invalid sourceModules accepted: '+repr(source))
 for api in [0,3,5,True]:
  try:builder.validate_manifest({**json.loads(manifest.read_text()),'engineApi':api},'tictactoe')
  except ValueError:pass
  else:raise AssertionError('invalid engineApi accepted')
print(json.dumps([app.read_source_pack(manifest),packs.build_pack(manifest.parent)],ensure_ascii=False))
`;
  const [a,b]=JSON.parse(execFileSync('python3',['-c',script,root,packs],{encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.deepEqual(a,b);assert.equal(a.manifest.engineApi,4);assert.equal(a.manifest.sourceModules,undefined);
  const Remote=require('../app/remote-catalog.js'),sha='a'.repeat(64),manifest=a.manifest;
  const entry={id:manifest.id,version:manifest.version,stateVersion:1,engineApi:4,viewApi:3,sha256:sha,
    url:`/api/packs/files/${manifest.id}/${manifest.version}/${sha}.playroom-pack.json`};
  assert.equal(Remote.validate({format:'playroom-catalog',version:1,collection:'0.6.5',packs:[entry]}).packs[0].engineApi,4);
  for(const file of ['domain/game.js','presentation/scene.js','locales/ru/game.json'])assert.equal(a.files[file],undefined,'source is already compiled into entrypoints');
  const E=require('../core/engine.js'),UI=require('../core/ui.js'),Packs=require('../core/packs.js');
  const before=E.GAMES,views=UI.createRegistry();
  const manager=new Packs({engine:E,views,catalog:{},storage:{get:()=>null,set(){}}});
  const token=manager.prepare(a);assert.deepEqual(E.GAMES,before,'staging must not bypass scoped registration');
  manager.install(token);
  const state=E.createGame('tictactoe',{players:[{name:'One'},{name:'Two'}],seed:17,firstPlayerMode:'assigned',firstPlayer:1});
  const next=E.applyAction(state,1,{type:'place',cell:4}),projected=E.project(next,0);
  const html=views.render(projected,0,E.legalActions(next,0));assert.match(html,/ttt-cell cross/);assert.match(html,/Клетка 5: X/);
  assert.equal(views.render({...projected,data:{},modelProjection:null},0,E.legalActions(next,0)),html);
  const spectator=views.render(E.project(next,-1),-1,[],{surface:'table'});assert.doesNotMatch(spectator,/data-action=/);
  const table=E.projectTable(next,0),commands=table.tableActions;
  assert.deepEqual(table.data,E.project(next,-1).data);assert.equal(table.modelProjection.viewer,-1);
  assert.match(views.render(table,-1,commands,{surface:'table'}),/data-action=/);
  assert.doesNotMatch(views.render(table,-1,[],{surface:'table'}),/data-action=/,'read-only history cannot regain controls');
  assert.throws(()=>E.applyTableAction(next,-1,{type:'place',cell:0}),coded('TABLE_ACTION_UNAVAILABLE'));
  assert.equal(E.applyTableAction(next,0,{type:'place',cell:0}).data.board[0],0);
  // Authoring examples obey the same scene-only renderer boundary as the collection.
  const example=JSON.parse(execFileSync('python3',['-c',`import importlib.util,json,sys
from pathlib import Path
spec=importlib.util.spec_from_file_location('packs_build',Path(sys.argv[1])/'build.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
print(json.dumps(module.build_pack(Path(sys.argv[1])/'examples/private-counter')))
`,packs],{encoding:'utf8',maxBuffer:4*1024*1024}));
  manager.install(manager.prepare(example));
  const counter=E.createGame('private-counter',{players:[{name:'One'},{name:'Two'}],seed:17});
  for(const viewer of [-1,0,1]){
    const projection=E.project(counter,viewer),markup=views.render(projection,viewer,E.legalActions(counter,viewer));
    assert.doesNotMatch(markup,/role="alert"/);
    assert.match(markup,/private-counter-value/);
    assert.equal(views.render({...projection,data:undefined,modelProjection:undefined},viewer,E.legalActions(counter,viewer)),markup);
    projection.scene.goals.forEach((goal,index)=>assert.deepEqual(goal,viewer===index?{value:index+2}:{hidden:true}));
  }

  const malformed=JSON.parse(JSON.stringify(a));malformed.files['rules.js']='globalThis.TabletopCore.register({id:"tictactoe",name:"Fake",min:2,max:2,presets:[{id:"classic"}],create(){},legal(){return[]},apply(){}});';
  assert.throws(()=>manager.prepare(malformed),/API 3/);
});

test('portable reactions have independent episodes, authorized public choices and no implicit bot turns',()=>{
 const Random=require('../core/random.js');
 const definition=require('../packs/uno/domain/game.js')({shuffle:Random.shuffle,ending:require(require('node:path').join(require('node:fs').realpathSync(__dirname+'/../packs'),'../shared/domain/end-policy.js'))});
 const model=new GameModel(definition);
 const initial=model.create({playerCount:3,firstPlayer:0,preset:'quick',rng:17,options:{unoMode:'manual'}});
 assert(model.legalActions(initial,0).every(action=>!action.type.includes('uno')));
 assert.equal(model.legalActions(initial,1).length,0);
 assert.equal(model.reactions(initial,1).length,3);
 assert.equal(model.botAction(initial,1),null);
 assert.equal(model.botReaction(initial,1),null);
 const table=model.projectTable(initial,1);
 assert.equal(table.actions.length,3);assert(table.data.hands.flat().every(card=>card.hidden));
 const command=table.actions.find(action=>action.type==='declare-uno');
 assert.equal(model.commandFor(initial,1,command,'table').episode,0);
 const changed=model.apply(initial,1,command);
 assert.equal(changed.position.turn,0);assert.equal(changed.position.revision,1);
 assert.equal(changed.events[0].type,'uno.early-call');assert.equal(changed.events[0].text,undefined);
 const repeat=model.apply(changed.position,1,command);assert.deepEqual(repeat.position,changed.position);assert.deepEqual(repeat.events,[]);
 assert.equal(model.reactionControl(changed.position,1,command).ignore,true);
 assert.throws(()=>model.commandFor(initial,1,{type:'declare-uno',episode:999},'table'),coded('TABLE_ACTION_UNAVAILABLE'));
 assert.deepEqual(model.project(changed.position,-1).data.uno.situations,changed.position.data.uno.situations);
 assert(model.project(changed.position,-1).data.hands.flat().every(card=>card.hidden));
});

test('preparation is durable but does not create game turns; public projection exposes only its boundary',()=>{
 const factory=require('../packs/battleship/domain/game.js'),G=require('../packs/battleship/domain/geometry.js'),Random=require('../core/random.js');
 const game=new GameModel(factory({random:Random.random},G));
 let state=game.create({playerCount:2,firstPlayer:0,preset:'classic',rng:17});
 assert.equal(state.timeline.preparing,true);
 for(let player=0;player<2;player++)for(const type of ['auto','ready']){
  state=game.apply(state,state.turn,{type}).position;
  assert.equal(state.timeline.turn,1);assert.deepEqual(state.timeline.starts,[state.revision]);
 }
 assert.equal(state.timeline.preparing,false);assert.equal(state.timeline.playStart,4);
 const publicView=game.project(state,-1);assert(publicView.data.ships.flat(2).every(cell=>cell===null));
 state=game.apply(state,state.turn,game.legalActions(state,state.turn)[0]).position;
 assert.equal(state.timeline.turn,2);assert.deepEqual(state.timeline.starts,[4,5]);
 assert.equal(state.timeline.playStart,4);game.validate(state);
});


test('mini-card assets compile identically with their renderer and styles in both builders',()=>{
 const script=`
import importlib.util,json,sys
from pathlib import Path
out=[]
for name,folder in [('app',sys.argv[1]),('packs',sys.argv[2])]:
 spec=importlib.util.spec_from_file_location(name,Path(folder)/'build.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 manifest=Path(sys.argv[2])/'packs/gofish/manifest.json'
 out.append(module.read_source_pack(manifest) if name=='app' else module.build_pack(manifest.parent))
print(json.dumps(out))
`;
 const [app,pak]=JSON.parse(execFileSync('python3',['-c',script,root,packs],{encoding:'utf8',maxBuffer:4*1024*1024}));
 assert.deepEqual(app,pak);
 assert(app.manifest.sharedAssetPacks.includes('mini-cards'));
 for(const file of ['renderer.js','styles.css'])assert.equal(app.files['assets/shared-packs/mini-cards/'+file],undefined,'compiled asset entrypoint has no redundant separate copy');
 assert(app.files['view.js'].includes('root.PlayroomMiniCards=api'));
 assert(app.files['styles.css'].includes('.mini-card>.card-deck-art'));
});

test('prepared packs omit bundled sources, duplicate asset entrypoints and authoring notes',()=>{
 const script=`
import json,sys
from pathlib import Path
root=Path(sys.argv[1]);p=root/'shared/pack_compiler.py';ns={'__file__':str(p)};exec(compile(p.read_text(),str(p),'exec'),ns)
result=[]
for pack in sorted((root/'packs').iterdir()):
 if not (pack/'manifest.json').is_file():continue
 source=json.loads((pack/'manifest.json').read_text());bundle=ns['build_pack'](pack);files=bundle['files'];modules=source.get('sourceModules',{})
 consumed=modules.get('rules',[])+modules.get('view',[])+[p for paths in modules.get('locales',{}).values() for p in paths]
 assert not set(consumed)&set(files)
 assert not any(p.endswith('.md') for p in files)
 for name in source.get('sharedAssetPacks',[]):
  spec=json.loads((root/'shared/asset-packs'/name/'manifest.json').read_text())
  for filename in spec.get('scripts',[])+spec.get('styles',[]):assert 'assets/shared-packs/'+name+'/'+filename not in files
 if pack.name=='pexeso':assert not any(p.startswith('assets/shared-packs/characters/') for p in files)
 if pack.name=='battleship':assert 'base64' not in files['sounds.js'] and len([p for p in files if p.endswith('.wav')])==4
 result.append(pack.name)
print(json.dumps(result))
`;
 const ids=JSON.parse(execFileSync('python3',['-c',script,packs],{encoding:'utf8'}));assert.deepEqual(ids,fs.readdirSync(path.join(packs,'packs')).filter(id=>fs.existsSync(path.join(packs,'packs',id,'manifest.json'))).sort());
});


test('scene boundary rejects ambiguous participants and malformed token metrics without copying',()=>{
  const S=require('../presentation/scene-contract.js');
  const scene=presentation.scene(model.project(initial(0),0));
  assert.equal(S.validate(scene,2),scene);
  for(const change of [s=>s.players[1].player=0,s=>s.players[0].id=0,
    s=>s.players[0].metrics.push({...s.players[0].metrics[0]}),
    s=>s.players[0].metrics[0].value=NaN,
    s=>s.players[0].metrics[0].value=-1,
    s=>s.players[0].metrics[0].value=.5,
    s=>s.players[0].metrics[0].kind='unknown',
    s=>s.players[0].metrics[0].display={icon:'unknown',capacity:3},
    s=>s.players[0].metrics[0].display={icon:'heart',capacity:0},
    s=>s.players[0].metrics[0].display={icon:'heart',capacity:3,overlap:'yes'}]){
    const bad=JSON.parse(JSON.stringify(scene));change(bad);assert.throws(()=>S.validate(bad,2),/SCENE_/);
  }
  const crown={id:'ultimate',kind:'points',value:9,label:'Ultimate',display:{icon:'crown',capacity:1}};
  assert.equal(S.metric(crown),crown,'accumulated crowns may exceed their minimum slot count');
  const H=require('../core/ui.js').helpers;
  for(const capacity of [1,8,9,64]){
    const metric={...crown,value:capacity,display:{icon:'heart',capacity}};
    assert.equal(S.metric(metric),metric);
    assert.doesNotThrow(()=>H.scoreBadge(metric),'scene-approved capacity must render');
  }
  assert.throws(()=>S.metric({...crown,display:{icon:'heart',capacity:65}}),/SCENE_/);
});

test('all installed pack scenes obey participant and metric contracts for every viewer',()=>{
  const E=require('../core/engine.js');
  const ids=fs.readdirSync(path.join(packs,'packs')).filter(id=>fs.existsSync(path.join(packs,'packs',id,'manifest.json')));
  for(const id of ids){
    require(path.join(packs,'packs',id,'rules.js'));
    const game=E.get(id);
    for(const preset of game.presets){
      const count=preset.id==='teams'?4:game.min;
      const state=E.createGame(id,{players:Array.from({length:count},(_,i)=>({name:'P'+i,bot:true})),preset:preset.id,seed:17});
      for(let viewer=-1;viewer<count;viewer++){
        const projected=E.project(state,viewer);
        assert.equal(projected.scene.players.length,count,`${id}/${preset.id}/${viewer}`);
        assert(projected.scene.geometry.topology);assert(projected.scene.zones.length);
        assert.equal(projected.scene.interactions.length,E.legalActions(state,viewer).length);
        assert.deepEqual(projected.scene.players.map(p=>p.player).sort((a,b)=>a-b),Array.from({length:count},(_,i)=>i));
      }
    }
  }
});


test('presentation boundary rejects ambiguous effect targets and broken route anchors',()=>{
 const S=require('../presentation/scene-contract.js');
 const route={entity:{namespace:'token',id:'0-1'},origin:{anchor:'base-0-1'},steps:[{anchor:'path-0'}]};
 assert.equal(S.sequence(route),route);
 const event={reveal:{entity:{namespace:'card',id:'copy-7'}},feedback:{kind:'damage',player:1}};
 assert.equal(S.event(event,2),event);
 assert.throws(()=>S.event({reveal:{entity:'card-copy-7'}},2),/ENTITY_REF/);
 assert.throws(()=>S.event({feedback:{kind:'damage',player:2}},2),/SCENE_FEEDBACK/);
 assert.throws(()=>S.sequence({...route,steps:[{cell:1}]}),/SCENE_ANCHOR/);
 assert.throws(()=>S.entity({namespace:'card',id:'7',face:'secret'}),/ENTITY_REF/);
});


test('event scenes use authorized current events, ordered checkpoints and inert geometry',()=>{
 const E=require('../core/engine.js'),Session=require('../core/session.js');let invalid=null;
 const adapted=globalThis.PlayroomModelRegistration.adapt(E,{definition:{...definition,id:'checkpoint-fixture'},presentation:{...presentation,eventScenes(p){
  if(!p.events.length)return [];
  const frame={eventId:p.events.at(-1).id,scene:{...presentation.scene(p),interactions:[]}};
  if(invalid==='id')frame.eventId='not-authorized';
  if(invalid==='actions')frame.scene.interactions=[{command:{type:'place',cell:1},target:{zone:'field'}}];
  return invalid==='duplicate'?[frame,frame]:[frame];
 }},locales:{ru:require('../packs/tictactoe/locales/ru/game.json')},version:'1.0.0'});
 E.register(adapted);const session=new Session(E,adapted.id,{players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0});
 session.act(0,{type:'place',cell:0});
 for(const viewer of [-1,0,1]){const event=session.view(viewer).events.at(-1);assert.equal(event.scene.viewer,viewer);assert.deepEqual(event.scene.interactions,[]);assert.equal(event.scene.cells[0].owner,0);}
 for(invalid of ['id','duplicate','actions'])assert.throws(()=>session.view(-1),/EVENT_SCENE/);
});

test('Markdown authoring compiles into inert rule blocks and preserves legacy pack bytes',()=>{
 // Compare complete bundles against the independently prepared app companion.
 // Git HEAD can predate unrelated compiler/asset work in the same checkout.
 const prepared={};vm.runInNewContext(fs.readFileSync(path.join(root,'installed-packs.js'),'utf8'),prepared);
 const script=`
import json,sys,tempfile,shutil
from pathlib import Path
packs_root=Path(sys.argv[2]);app_root=Path(sys.argv[1])
ns={'__file__':str(packs_root/'shared/pack_compiler.py')}
exec((packs_root/'shared/pack_compiler.py').read_text(),ns)
prepared={bundle['manifest']['id']:bundle for bundle in json.load(sys.stdin)}
paths=sorted((packs_root/'packs').glob('*/manifest.json'))
assert set(prepared)=={json.loads(path.read_text())['id'] for path in paths},'prepared companion catalog differs from source'
for path in paths:
 actual=ns['build_pack'](path.parent)
 assert actual==prepared[actual['manifest']['id']],path.parent.name+' differs from prepared companion'
md='# Цель\\n\\n**Соберите** *три* знака. \\x60X\\x60\\n\\n## Ход\\n\\n1. Выберите клетку\\n2. Подтвердите\\n\\n| Карта | Действие |\\n|---|---|\\n| X | Поставить |\\n\\n![Линия](line)\\n'
book=ns['compile_rulebook_markdown'](md)
assert len(book['sections'])==2
for source in ['Нет заголовка','# X\\n\\n<script>alert(1)</script>','# X\\n\\n[bad](javascript:alert(1))','# X\\n\\n![bad](https://example.test/art.svg)','# X\\n\\n- one\\n  - nested']:
 try:ns['compile_rulebook_markdown'](source)
 except ValueError:pass
 else:raise AssertionError('unsafe/unsupported Markdown accepted')
with tempfile.TemporaryDirectory() as tmp:
 pack=Path(tmp)/'tictactoe';shutil.copytree(packs_root/'packs/tictactoe',pack)
 manifest=pack/'manifest.json';data=json.loads(manifest.read_text());data['sourceModules']['rulebooks']={'ru':'locales/ru/rules.md'};manifest.write_text(json.dumps(data))
 (pack/'locales/ru/rules.md').write_text(md)
 bridge=pack/'rules.js';bridge.write_text(bridge.read_text().replace('const specification = {definition, presentation, locales, version};','const specification = {definition, presentation, locales, version, rulebooks:source?null:root.PlayroomPackResources.rulebooks};'))
 bundle=ns['build_pack'](pack,shared=packs_root/'shared')
 assert 'locales/ru/rules.md' not in bundle['files']
 print(json.dumps({'book':book,'bundle':bundle},ensure_ascii=False))
`;
 const result=JSON.parse(execFileSync('python3',['-c',script,root,packs],{input:JSON.stringify(prepared.PlayroomInstalledPacks),encoding:'utf8',maxBuffer:5*1024*1024}));
 const E=require('../core/engine.js'),UI=require('../core/ui.js'),Packs=require('../core/packs.js');
 const manager=new Packs({engine:E,views:UI.createRegistry(),catalog:{},storage:{get:()=>null,set(){}}});manager.install(manager.prepare(result.bundle));
 manager.activate('tictactoe',result.bundle.manifest.version);assert.deepEqual(E.get('tictactoe').rulebook,result.book);
 const html=require('../app/rulebook-view.js').render(result.book,{esc:value=>String(value??'').replaceAll('<','&lt;'),illustrate:()=>''});
 assert.match(html,/<strong>Соберите<\/strong>/);assert.match(html,/<em>три<\/em>/);assert.match(html,/<code>X<\/code>/);assert.match(html,/<ol>/);assert.match(html,/<table/);assert.doesNotMatch(html,/<script/);
});


test('immutable snapshots reuse only their own validated frozen values',()=>{
  const values=require('../core/model-values.js');
  const source={nested:{cards:[{id:'card-1'}]}};
  const first=values.snapshot(source);
  assert.notEqual(first,source);assert.notEqual(first.nested,source.nested);
  assert.equal(values.snapshot(first),first);
  const nested=values.snapshot(first.nested);
  assert.equal(nested,first.nested);assert.equal(values.snapshot(nested),nested);
  assert.throws(()=>{first.nested.cards[0].id='changed';},TypeError);
  source.nested.cards[0].id='changed';assert.equal(first.nested.cards[0].id,'card-1');
  const mutable=values.copy(first);mutable.nested.cards.push({id:'card-2'});
  assert.equal(first.nested.cards.length,1);
  const shallow=Object.freeze({nested:{value:1}}),second=values.snapshot(shallow);
  shallow.nested.value=2;assert.equal(second.nested.value,1);assert.notEqual(second,shallow);
  const external=values.freeze({nested:{value:1}});assert.notEqual(values.snapshot(external),external);
  const cyclic={};cyclic.self=cyclic;Object.freeze(cyclic);
  assert.throws(()=>values.snapshot(cyclic),error=>error.code==='JSON_INVALID');
  assert.throws(()=>values.snapshot(Object.freeze({bad:undefined})),error=>error.code==='JSON_INVALID');
  assert.equal(values.snapshot(null),null);assert.equal(values.snapshot(3),3);
});

test('unimplemented optional mechanics do not traverse the complete game position',()=>{
  const E=require('../core/engine.js');require('../packs/tictactoe/rules.js');
  const adapted=globalThis.PlayroomModelRegistration.adapt(E,{definition,presentation,locales:{ru:require('../packs/tictactoe/locales/ru/game.json')},version:'0.1.0'});
  const state=E.createGame('tictactoe',{seed:17,players:[{name:'A'},{name:'B'}]});let reads=0;const data=state.data;Object.defineProperty(state,'data',{get(){reads++;return data;}});
  for(let i=0;i<40;i++){
    assert.deepEqual(adapted.reactions(state,0),[]);assert.deepEqual(adapted.reactionWindows(state),[]);assert.equal(adapted.reactionControl(state,0,{type:'place',cell:0}),null);assert.equal(adapted.botReaction(state,0),null);assert.equal(adapted.botReactionDelay(state,0),null);assert.equal(adapted.decisionWindow(state),null);
  }
  assert.equal(reads,0,'absent hooks must return their default without cloning the position');
});

test('model validation reuses validated immutable positions but rechecks mutable or changed inputs',()=>{
 let calls=0;const counted=new GameModel({...definition,validate(position){calls++;return definition.validate(position);}}),position=counted.create({playerCount:2,firstPlayer:0,preset:'classic'});calls=0;counted.validate(position);const once=calls;counted.validate(position);counted.validate(position);assert.equal(calls,once,'one immutable position is validated once');
 const mutable=JSON.parse(JSON.stringify(position));counted.validate(mutable);const checked=calls;counted.validate(mutable);assert(calls>checked,'mutable callers are detached and rechecked');mutable.data.board[0]=0;mutable.data.board[1]=0;assert.throws(()=>counted.validate(mutable));
});

test('shared turn-order policy validates cycles, directions, repeat overrides and simultaneous windows',()=>{
 const projection={status:'playing',playerCount:4,turn:2,data:{},timeline:{},decisionWindow:null},base=new GameModel(definition);
 assert.equal(base.turnOrder(projection).next,3);
 const custom=turnOrder=>new GameModel({...definition,turnOrder});
 assert.equal(custom(()=>({players:[0,2,3],direction:-1})).turnOrder(projection).next,0);
 assert.equal(custom(()=>({next:2})).turnOrder(projection).next,2,'rules may declare a repeat');
 assert.equal(custom(()=>null).turnOrder(projection),null);
 assert.equal(base.turnOrder({...projection,status:'finished'}),null);
 assert.equal(base.turnOrder({...projection,playerCount:1,turn:0}),null);
 assert.equal(base.turnOrder({...projection,timeline:{preparing:true}}),null);
 assert.equal(base.turnOrder({...projection,decisionWindow:{participants:[0,1]}}),null);
 for(const bad of [{players:[0,0]},{players:[4]},{players:[0,2],direction:0},{next:4}])assert.throws(()=>custom(()=>bad).turnOrder(projection),coded('TURN_ORDER_INVALID'));
});

test('parameter preview metadata stays public, bounded and identical across compiler and runtime',()=>{
 const script=`
import copy,json,sys
from pathlib import Path
root=Path(sys.argv[1]);path=root/'shared/pack_compiler.py';ns={'__file__':str(path)};exec(compile(path.read_text(),str(path),'exec'),ns)
bundles=[ns['build_pack'](root/'packs'/game) for game in ['battleship','ludo','mage-brawl','uno','gofish','durak','oldmaid','klondike','snakes']]
for path in (root/'packs').glob('*/manifest.json'):ns['validate_manifest'](json.loads(path.read_text()),path.parent.name)
base=copy.deepcopy(bundles[2]['manifest']);base['sdkFeatures'].append('parameter-previews-v2');health=next(i for i,f in enumerate(base['settings']) if f['key']=='health')
bad=[]
def reject(change):
 value=copy.deepcopy(base);change(value);bad.append(value)
 try:ns['validate_manifest'](value,'bad-preview')
 except ValueError:return
 raise AssertionError('unsafe preview accepted')
def field(m):return m['settings'][health]
def option(m):return field(m)['options'][0]
for preview in [None,[],{'kind':'html'},{'kind':'health','html':'<svg/>'},{'kind':{}}]:reject(lambda m,p=preview:field(m).__setitem__('preview',p))
for preview in [None,[], {'kind':None}, {'kind':'html','html':'<svg/>'}, {'count':-1},{'count':101},{'count':True},{'count':1.5},{'count':'3'},{'count':4,'countFrom':{'field':'actionsPerTurn','values':{'1':3}}},{'countFrom':{'field':'missing','values':{'1':3}}},{'countFrom':{'field':'actionsPerTurn','values':{}}},{'countFrom':{'field':'actionsPerTurn','values':{'unknown':3}}},{'countFrom':{'field':'actionsPerTurn','values':{'1':101}}},{'countFrom':{'field':'actionsPerTurn','values':{'1':3},'html':'<img>'}}]:reject(lambda m,p=preview:option(m).__setitem__('preview',p))
for preview in [{'kind':'fleet','pieces':[0]},{'kind':'fleet','pieces':[17]},{'kind':'fleet','pieces':[1]*17},{'kind':'teams','teamSizes':[0]},{'kind':'teams','teamSizes':[32,1]},{'kind':'teams','teamSizes':[1]*9},{'kind':'fleet','pieces':[4],'html':'<svg>'}]:
 def change(m,p=preview):m['presetSetting'].update({'presentation':'mode','options':[{'value':'classic','label':'Mode','preview':p}]})
 reject(change)
reject(lambda m:m['presetSetting'].__setitem__('presentation','large'))
reject(lambda m:field(m).__setitem__('presentation','large'))
reject(lambda m:m['presetSetting'].update({'presentation':'mode','options':[]}))
def two_modes(m):
 field(m)['presentation']='mode';m['presetSetting'].update({'presentation':'mode','options':[{'value':'classic','label':'Mode','preview':{'kind':'cards','count':7}}]})
reject(two_modes)
for preview in [{'kind':'declaration','actor':'other','label':'UNO!'},{'kind':'declaration','actor':'human','label':'x'*25},{'kind':'declaration','actor':'human'},{'kind':'symbol','icon':'not-a-ui-icon'},{'kind':'symbol','icon':'first','html':'<svg/>'}]:reject(lambda m,p=preview:option(m).__setitem__('preview',p))
for ids in [None,[],['ok']*5,[''],['x'*65],['https://example.test'],['<svg>'],[1],[True]]:reject(lambda m,ids=ids:option(m).__setitem__('preview',{'kind':'illustrations','ids':ids}))
reject(lambda m:option(m).__setitem__('preview',{'kind':'illustrations','ids':['ok'],'html':'<svg>'}))
def missing_illustration_feature(m):
 option(m)['preview']={'kind':'illustrations','ids':['ok']};m['sdkFeatures'].remove('parameter-illustrations-v1')
reject(missing_illustration_feature)
for description in [None,False,[], '', 'x'*361]:reject(lambda m,d=description:option(m).__setitem__('description',d))
for condition in [None,{},[],{'missing':'vegas'},{'actionsPerTurn':'unknown'},{'actionsPerTurn':2}]:
 def change(m,c=condition):field(m).update({'inactiveWhen':c,'inactivePresentation':{'preview':{'kind':'symbol','icon':'refresh'},'description':'Inactive option'}})
 reject(change)
for inactive in [None,{}, {'preview':{'kind':'html'},'description':'Text'},{'preview':{'kind':'symbol','icon':'refresh'},'description':'x'*361},{'preview':{'kind':'symbol','icon':'refresh'},'description':'Text','html':'<svg/>'}]:
 def change(m,i=inactive):field(m).update({'inactiveWhen':{'actionsPerTurn':'1'},'inactivePresentation':i})
 reject(change)
reject(lambda m:field(m).__setitem__('inactiveWhen',{'actionsPerTurn':'1'}))
def missing_feature(m):
 field(m)['presentation']='mode';m['sdkFeatures'].remove('parameter-previews-v2')
reject(missing_feature)
def missing_inactive_feature(m):
 field(m).update({'inactiveWhen':{'actionsPerTurn':'1'},'inactivePresentation':{'preview':{'kind':'symbol','icon':'lock'},'description':'Mode-defined value'}});m['sdkFeatures'].remove('parameter-previews-v2')
reject(missing_inactive_feature)
valid=[]
for preview in [{'kind':'cards','count':7},{'kind':'symbol','icon':'cards'},{'kind':'declaration','actor':'human','label':'UNO!'},{'kind':'dice','count':2},{'kind':'health','count':3},{'kind':'lives','count':2},{'kind':'fleet','pieces':[3,2]},{'kind':'teams','teamSizes':[2,2]}]:
 for key in ['presetSetting','settings']:
  value=copy.deepcopy(base);target=value['presetSetting'] if key=='presetSetting' else field(value);target.update({'presentation':'mode','options':[{'value':'classic','label':'Mode','preview':preview}]});ns['validate_manifest'](value,'valid-mode-preview');valid.append(value)
value=copy.deepcopy(base);field(value)['presentation']='mode';ns['validate_manifest'](value,'inherited-mode-preview');valid.append(value)
value=copy.deepcopy(base);field(value).update({'inactiveWhen':{'actionsPerTurn':'1'},'inactivePresentation':{'preview':{'kind':'symbol','icon':'refresh'},'description':'Inactive option'}});ns['validate_manifest'](value,'valid-inactive-preview');valid.append(value)
for count in [0,100]:
 value=copy.deepcopy(base);option(value)['preview']={'count':count};ns['validate_manifest'](value,'valid-preview');valid.append(value)
for preview in [{'kind':'declaration','actor':'human','label':'UNO!'},{'kind':'symbol','icon':'first'},{'kind':'illustrations','ids':['setting-type-attack']},{'kind':'illustrations','ids':['same']*4}]:
 value=copy.deepcopy(base);option(value)['preview']=preview;ns['validate_manifest'](value,'valid-common-preview');valid.append(value)
print(json.dumps({'bundles':bundles,'bad':bad,'valid':valid},ensure_ascii=False))
`;
 const result=JSON.parse(execFileSync('python3',['-c',script,packs],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const Packs=require('../core/packs.js'),parse=manifest=>Packs.parse({format:'playroom-pack',formatVersion:1,manifest,files:{'rules.js':'fixture','view.js':'fixture','styles.css':'/* fixture */','sounds.js':'fixture'}});
 for(const m of result.valid)assert.doesNotThrow(()=>parse(m));
 for(const m of result.bad)assert.throws(()=>parse(m),error=>error.code==='PACK_PARAMETER_PREVIEW_INVALID');
 const Engine=require('../core/engine.js'),UI=require('../core/ui.js'),catalog={},views=UI.createRegistry(),manager=new Packs({engine:Engine,views,modelAdapter:require('../core/model-registration.js').adapt,catalog,storage:{get:()=>null,set(){}}});
 const Rooms=require('../application/rooms.js');
 for(const bundle of result.bundles){
  const {id}=bundle.manifest;manager.install(manager.prepare(bundle));assert.deepEqual(catalog[id].presetSetting,bundle.manifest.presetSetting);
  assert.deepEqual(catalog[id].settings,bundle.manifest.settings.map(Rooms.standardRule),'installed public standard wording is application-owned');
  for(const raw of bundle.manifest.settings){
   const installed=catalog[id].settings.find(field=>field.key===raw.key);assert.equal(installed.default,raw.default);assert.deepEqual(installed.options?.map(o=>o.value),raw.options?.map(o=>o.value),'wording normalization preserves supported option IDs');
   if(Object.hasOwn(Rooms.STANDARD_RULE_VALUES,raw.key)){
    const prefix='rules-help.standard.'+raw.key;assert.equal(installed.label,globalThis.PlayroomMessages.text(prefix+'.label'));assert.equal(installed.help,globalThis.PlayroomMessages.text(prefix+'.help'));
    for(const option of installed.options)assert.equal(option.description,globalThis.PlayroomMessages.text(prefix+'.'+option.value+'.description'));
   }
  }
  const exported=manager.exportView(id);assert.deepEqual(exported.manifest.settings,bundle.manifest.settings,'immutable export preserves authored metadata');assert.deepEqual(exported.manifest.presetSetting,bundle.manifest.presetSetting);
 }
 for(const id of Object.keys(catalog))assert.equal(catalog[id].sdkFeatures.includes('parameter-illustrations-v1'),['mage-brawl','ludo','spider','durak','pexeso','snakes','yatzy','oldmaid','domino','checkers'].includes(id),'author-supplied component illustrations require the feature');
 const mageFields=catalog['mage-brawl'].settings;assert.deepEqual(mageFields.find(f=>f.key==='actionsPerTurn').options.map(o=>o.preview.ids),[['setting-card-fire-attack'],['setting-card-fire-attack','setting-card-water-movement']]);assert.deepEqual(mageFields.find(f=>f.key==='differentActionTypes').options.map(o=>o.preview.ids),[['setting-type-attack','setting-type-attack'],['setting-type-movement','setting-type-attack']]);
 const cardFire=views.illustration('mage-brawl','setting-card-fire-attack'),cardWater=views.illustration('mage-brawl','setting-card-water-movement');assert.match(cardFire,/mage-spell-art/);assert.match(cardWater,/mage-spell-art/);assert.notEqual(cardFire,cardWater);assert.match(views.illustration('mage-brawl','setting-type-movement'),/mage-movement-icon/);assert.match(views.illustration('mage-brawl','setting-type-attack'),/sword/);
 for(const id of Object.keys(catalog))assert.equal(catalog[id].sdkFeatures.includes('parameter-previews-v2'),['durak','klondike'].includes(id),'only settings-mode/inactive packs require app68');
 const modes=[catalog.durak.presetSetting,...catalog.durak.settings].filter(f=>f.presentation==='mode');assert.equal(modes.length,1);assert.equal(modes[0].key,'variant');assert.deepEqual(modes[0].options.map(o=>o.value),['simple','throwin','transfer']);
 const fleet=require('../packs/battleship/domain/geometry.js').fleets;
 for(const o of catalog.battleship.presetSetting.options)assert.deepEqual(o.preview.pieces,fleet[o.value]);
 for(const f of catalog['mage-brawl'].settings.filter(f=>['health','handLimit'].includes(f.key)))assert.deepEqual(f.options[0].preview.countFrom,{field:'actionsPerTurn',values:{'1':3,'2':4}});
 for(const steps of ['1','2']){const state=Engine.createGame('mage-brawl',{seed:17,players:[{name:'A'},{name:'B'}],actionsPerTurn:steps,health:'mode',handLimit:'mode'});for(const key of ['health','handLimit']){const field=catalog['mage-brawl'].settings.find(f=>f.key===key);assert.equal(field.options[0].preview.countFrom.values[steps],state.data.config[key],'automatic preview agrees with the actual domain value');}}
 assert.equal(catalog.uno.presetSetting.presentation,undefined,'quantity choices never become a mode hero');
 for(const option of catalog.uno.presetSetting.options){const state=Engine.createGame('uno',{seed:17,preset:option.value,players:[{name:'A'},{name:'B'}]});assert.equal(option.preview.count,state.data.hands[0].length,'hand preview agrees with the actual initial deal');}
 assert.deepEqual(catalog.ludo.presetSetting.options.map(o=>o.preview.teamSizes),[[1,1,1,1],[2,2]]);
 const board=require('../packs/ludo/domain/board.js'),teamSizes=Object.values(Array.from({length:4},(_,player)=>board.team(player)).reduce((groups,team)=>({...groups,[team]:(groups[team]||0)+1}),{}));assert.deepEqual(catalog.ludo.presetSetting.options.find(o=>o.value==='teams').preview.teamSizes,teamSizes,'team diagram agrees with actual partner grouping');
 for(const game of ['gofish','durak','oldmaid']){const field=catalog[game].settings.find(f=>f.key==='deck');for(const option of field.options){const state=Engine.createGame(game,{seed:17,deck:option.value,players:[{name:'A'},{name:'B'}]}),count=game==='oldmaid'?state.data.hands.flat().length+state.data.discard.length:state.data.deckSize;assert.equal(option.preview?.count??Number(option.value),count,game+' preview describes the actual card pool');}}
 for(const option of catalog.klondike.settings.find(f=>f.key==='draw').options){const state=Engine.createGame('klondike',{seed:17,draw:option.value,players:[{name:'A'}]});assert.equal(Number(option.value),state.data.config.draw,'draw preview agrees with actual solitaire configuration');}
 const passes=catalog.klondike.settings.find(f=>f.key==='maxPasses');assert.deepEqual(passes.inactiveWhen,{scoring:'vegas'});assert.deepEqual(passes.inactivePresentation.preview,{kind:'symbol',icon:'lock'});for(const draw of ['1','3'])for(const selected of ['0','1','3']){const state=Engine.createGame('klondike',{seed:17,draw,scoring:'vegas',maxPasses:selected,players:[{name:'A'}]});assert.equal(state.data.config.maxPasses,draw==='1'?1:3,'Vegas domain overrides pass draft according to draw size');}
 const declaration=catalog.uno.settings.find(f=>f.key==='unoMode');assert.deepEqual(declaration.preview,{kind:'declaration',label:'UNO!'});assert.deepEqual(declaration.options.map(o=>o.preview.actor),['human','bot']);
 assert.equal(catalog.snakes.presetSetting.presentation,undefined,'dice-count choices remain compact');
 for(const option of catalog.snakes.presetSetting.options){const state=Engine.createGame('snakes',{seed:17,preset:option.value,players:[{name:'A'},{name:'B'}]});assert.equal(option.preview.kind,'illustrations');assert.deepEqual(option.preview.ids,['setting-mode-'+option.value]);assert.equal(Array.isArray(state.data.dice)?state.data.dice.length:1,option.value==='plus'?2:1,'illustrated mode agrees with actual initial dice');}
});
