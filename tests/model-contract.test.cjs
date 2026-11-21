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
  const game=path.join(packs,'packs/tictactoe');
  const {presentation:modules}=JSON.parse(fs.readFileSync(path.join(game,'sdk/project.json'),'utf8'));
  // Use the pack's own presentation dependencies without booting the app.
  const files=['core/messages.js','core/model-values.js','core/events.js','core/bot-difficulty.js','core/model-runtime.js'].map(file=>path.join(root,file));
  files.push(path.join(game,'domain/game.js'),...modules.map(file=>path.join(file.startsWith('shared/')?packs:game,file)));
  for(const file of files){
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
 assert.equal(Events.project(journal,-1,2)[0],other[0]);
 assert.equal(Events.project(Events.append(journal,[draft],2,2),0,2)[0],owner[0]);
 assert.equal(owner[0].params.card,'secret-spades');assert.equal(other[0].params.card,undefined);assert.notEqual(owner[0],other[0]);
 assert(Object.isFrozen(owner)&&Object.isFrozen(owner[0].params));
 const foreign=Object.freeze({...journal[0],visibility:{kind:'players',players:[0]}});
 Events.validate(foreign,2);foreign.visibility.players.push(9);
 assert.throws(()=>Events.validate(foreign,2),coded('EVENT_INVALID'));
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

test('the host attaches authorized journal facts when rules do not read them',()=>{
  const E=require('../core/engine.js'),Session=require('../core/session.js'),Events=require('../core/events.js');
  const plainModel={...definition,id:'host-journal-fixture',localData:undefined,
    reduce(position,actor,command){
      const changed=definition.reduce(position,actor,command),placed=changed.events.at(-1);
      return {...changed,events:[{...placed,params:{...placed.params,mark:'private-mark'},
        visibility:{kind:'players',players:[actor]},publicEvent:placed}]};
    }};
  let checked=0;
  const model=new Proxy(new GameModel(plainModel),{get(target,key){
    const value=Reflect.get(target,key,target);
    if(key==='project'||key==='projectTable')return (position,viewer,journal,...args)=>{
      assert.deepEqual(journal,[]);
      checked++;
      return value.call(target,position,viewer,journal,...args);
    };
    return typeof value==='function'?value.bind(target):value;
  }});
  const pack=globalThis.PlayroomModelRegistration.adapt(E,{definition:plainModel,model,presentation,
    locales:{ru:require('../packs/tictactoe/lang/ru.json')},version:'0.2.0'});
  E.register(pack);
  const session=new Session(E,pack.id,{seed:17,players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0});
  session.act(0,{type:'place',cell:0});
  const facts=session.current.events.filter(event=>event.visibility);
  for(const [viewer,project] of [[0,()=>session.view(0)],[1,()=>session.view(1)],[-1,()=>session.view(-1)],[-1,()=>E.projectTable(session.current,0)]]){
    const frame=project(),visible=Events.project(facts,viewer,2);
    assert.deepEqual(frame.modelProjection.events,visible);
    assert.equal(frame.modelProjection.events.at(-1),visible.at(-1));
    assert.equal(JSON.stringify(frame).includes('private-mark'),viewer===0);
  }
  assert.equal(checked,4);
});

test('canonical private events persist without presentation and project before translation, sound or replay',()=>{
  const E=require('../core/engine.js'),Session=require('../core/session.js');
  const Projection=require('../presentation/network-projection.js');
  const described=[];
  const privateModel={...definition,id:'private-model-fixture',
    localData(projection){return {...projection.data,lastVisibleEvent:projection.events?.at(-1)?.type??null};},
    localChoices(projection){return projection.data.lastVisibleEvent?definition.localChoices(projection):[];},
    reduce(position,actor,command){
    const changed=definition.reduce(position,actor,command);
    return {...changed,events:[
      {type:'private.reveal',actor,params:{secret:'PRIVATE-CARD'},visibility:{kind:'players',players:[actor]}},
      {type:'private.reveal',actor,params:{secret:'PRIVATE-OTHER'},visibility:{kind:'players',players:[actor]},
        publicEvent:{type:'tictactoe.placed',actor,params:{mark:'X',cell:0},visibility:{kind:'public'}}}
    ]};
  }};
  class JournalModel extends GameModel {
    projectForHost(position,viewer,facts,options){
      assert(facts.every(fact=>!Object.hasOwn(fact,'visibility')&&!Object.hasOwn(fact,'publicEvent')));
      const privateFacts=facts.filter(fact=>fact.type==='private.reveal');
      const allowed=options.table?-1:viewer;
      assert(privateFacts.every(fact=>fact.actor===allowed));
      if(position.revision===1)assert.equal(privateFacts.length,allowed===0?2:0);
      const frame=super.projectForHost(position,viewer,facts,options);
      assert.deepEqual(frame.events,[]);
      return frame;
    }
  }
  const adapted=globalThis.PlayroomModelRegistration.adapt(E,{definition:privateModel,model:new JournalModel(privateModel),
    presentation:{...presentation,event(value){
      described.push(value.params.secret||'public');
      return value.type==='private.reveal'?{kind:'move',message:{key:'tictactoe.events.placed',params:{mark:value.params.secret,cell:1}}}:presentation.event(value);
    }},locales:{ru:require('../packs/tictactoe/lang/ru.json')},version:'0.2.0'});
  E.register(adapted);
  const session=new Session(E,adapted.id,{seed:17,players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0});
  const initialJournal=session.current.events;
  session.act(0,{type:'place',cell:0});assert.deepEqual(described,[]);
  assert.equal(session.current.events[0],initialJournal[0],'the verified start event stays shared across moves');
  assert.equal(initialJournal.length,1);
  const externalMove=E.applyAction(E.clone(session.states[0]),0,{type:'place',cell:0});
  assert.doesNotThrow(()=>externalMove.events.pop(),'the standalone engine keeps its detached mutable list');
  assert.equal(session.current.events.at(-1).revision,1);
  const visible=[];
  for(const viewer of [-1,1]){
    const view=session.view(viewer);assert(!JSON.stringify(view).includes('PRIVATE-'));
    assert.equal(view.events.at(-1).type,'tictactoe.placed');
    assert.equal(view.events.at(-1).id,session.current.events.at(-1).id);
    visible.push(view.events.at(-1));
    const legacy=E.soundCues(session.current,viewer,1),presentations=described.length;
    assert.equal(legacy.length,1);
    assert.deepEqual(Projection.soundCues(view.events,view,viewer,1),legacy);
    assert.equal(described.length,presentations,'audio reuses authorized events without reformatting them');
  }
  assert.deepEqual(described,['public'],'the same permitted event is formatted once for spectators, players and audio');
  assert.equal(visible[0],visible[1]);
  assert(Object.isFrozen(visible[0]));
  const Authority=require('../core/authority.js'),authority=new Authority(session);
  try{
    const Protocol=require('../core/protocol.js'),pack=E.get(adapted.id);
    const other=authority.connect(1),snapshot=other.snapshot();
    assert.equal(snapshot.state.events.at(-1),visible[0]);
    assert(snapshot.actions.length>0);
    for(const [viewer,binding] of [[-1,authority.connect(-1)],[0,authority.connect(0)],[1,other]]){
      const wire=Protocol.parse(JSON.stringify(Projection.compact(binding.snapshot({wire:true}))));
      const restored=Projection.restore(wire,event=>pack.presentEvent(event,wire.state.players),pack);
      assert.deepEqual(restored.actions,binding.snapshot().actions,'local choices use the same authorized events as the host');
      const projected=Protocol.projectedModel(restored);
      assert.equal(projected.data.lastVisibleEvent,viewer===0?'private.reveal':'tictactoe.placed');
      assert.equal(JSON.stringify(projected.events).includes('PRIVATE-CARD'),viewer===0);
      assert.equal(projected.events[0],wire.events.find(event=>event.type),
        'the local frame model borrows the authorized event record');
    }
  }
  finally{authority.dispose();}
  assert(JSON.stringify(session.view(0)).includes('PRIVATE-CARD'));
  const table=E.projectTable(session.current,0).modelProjection;
  assert.equal(table.actor,0);
  assert.equal(table.data.lastVisibleEvent,'tictactoe.placed');
  assert(!JSON.stringify(table.events).includes('PRIVATE-CARD'));
  const id=visible[0].id,findEvent=view=>view.events.find(event=>event.id===id);
  session.setPlayerMetadata(0,{name:'Renamed A'});
  session.act(1,{type:'place',cell:1});
  const renamed=findEvent(session.view(1));
  assert.equal(renamed.message.params.player,'Renamed A');
  assert.equal(findEvent(session.view(1,1)).message.params.player,'A');
  const external=E.clone(session.current);
  findEvent(E.project(external,1)).text='Edited outside history';
  assert.equal(findEvent(session.view(1)).text,renamed.text);
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

test('both builders compile the same autonomous layered pack and reject invalid module and locale declarations',async()=>{
  const script=`
import importlib.util,json,sys,tempfile,shutil
from pathlib import Path
def load(name,folder):
 spec=importlib.util.spec_from_file_location(name,Path(folder)/'build.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
app=load('app_build',sys.argv[1]);packs=load('packs_build',sys.argv[2])
manifest=Path(sys.argv[2])/'packs/tictactoe/manifest.json'
for builder in [app,packs]:
 for source in [None,[],{'unknown':[]},{'rules':'domain/game.js'},{'rules':['domain/../rules.js']},
                {'rules':['domain/game.js','domain/game.js']},{'locales':{'ru':['locales/en/game.json']}},
                {'locales':{'ru':['lang/ru.json','lang/ru.json']}}]:
  try:builder.bundle_source_modules({'rules.js':'','view.js':''},source,lambda path:'{}')
  except ValueError:pass
  else:raise AssertionError('invalid sourceModules accepted: '+repr(source))
 for api in [0,3,5,True]:
  try:builder.validate_manifest({**json.loads(manifest.read_text()),'engineApi':api},'tictactoe')
  except ValueError:pass
  else:raise AssertionError('invalid engineApi accepted')
print(json.dumps([app.read_source_pack(manifest),packs.build_pack(manifest.parent)],ensure_ascii=False))
`;
  const sandbox=await require('../sdk/node-host.cjs').createNodeHost(),calls=[],projectedJournalSizes=[];
  let reactionReads=0;
  const localViewReplies=[];
  globalThis.PlayroomSandbox={...sandbox,createRules(project){
    const guest=sandbox.createRules(project);
    for(const name of ['project','projectTable']){
      const run=guest.model[name];
      guest.model[name]=(...args)=>{calls.push(name);projectedJournalSizes.push(args[2]?.length??0);return run(...args);};
    }
    const reaction=guest.model.localReaction;
    guest.model.localReaction=(...args)=>{reactionReads++;return reaction(...args);};
    const prepare=guest.model.prepareLocalView;
    guest.model.prepareLocalView=(...args)=>{const reply=prepare(...args);localViewReplies.push(reply);return reply;};
    return guest;
  },render(...args){calls.push('render');return sandbox.render(...args);}};
  const [isolated,companion]=JSON.parse(execFileSync('python3',['-c',script,root,packs],{encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.deepEqual(isolated,companion);assert.equal(isolated.manifest.execution,'isolated-v1');
  const source=require('../core/packs.js').sdkSource(isolated);assert.deepEqual(source.manifest,isolated.manifest);
  assert(source.sources.rules.some(row=>row.file==='domain/game.js'));assert(source.sources.presentation.some(row=>row.file==='presentation/scene.js'));
  const authoredCatalog=JSON.parse(fs.readFileSync(path.join(packs,'packs/tictactoe/lang/ru.json'),'utf8'));for(const [key,value]of Object.entries(source.catalogs.ru))assert.equal(value,authoredCatalog[key],'compiled used translations retain exact authored text: '+key);
  for(const file of ['rules.js','view.js','styles.css'])assert(!isolated.files[file].includes('PlayroomPackDefinition'),'host entrypoints are inert markers');
  const Remote=require('../app/remote-catalog.js'),sha='a'.repeat(64),manifest=isolated.manifest;
  const entry={id:manifest.id,version:manifest.version,stateVersion:1,engineApi:4,viewApi:3,sha256:sha,url:`/api/packs/files/${manifest.id}/${manifest.version}/${sha}.playroom-pack.json`};
  assert.equal(Remote.validate({format:'playroom-catalog',version:1,collection:'0.6.5',packs:[entry]}).packs[0].engineApi,4);
  for(const file of ['domain/game.js','presentation/scene.js','lang/ru.json'])assert.equal(isolated.files[file],undefined,'guest source has one payload copy');
  const E=require('../core/engine.js'),UI=require('../core/ui.js'),Packs=require('../core/packs.js'),manager=new Packs({engine:E,views:UI.createRegistry(),catalog:{},storage:{get:()=>null,set(){}}});
  const before=E.GAMES,token=manager.prepare(isolated);assert.deepEqual(E.GAMES,before,'staging cannot register guest rules');manager.install(token);
  const state=E.createGame('tictactoe',{players:[{name:'One'},{name:'Two'}],seed:17,firstPlayerMode:'assigned',firstPlayer:1}),next=E.applyAction(state,1,{type:'place',cell:4}),projected=E.project(next,0);
  assert.equal(E.get('tictactoe').isolated,true);assert.equal(projected.scene.cells[4].owner,1);assert.equal(projected.scene.cells[4].mark,'X');
  assert(E.project(next,-1).scene.cells.every(cell=>!cell.command),'spectator scenes contain no controls');
  calls.length=0;
  const table=E.projectTable(next,0);
  assert.deepEqual(calls,['projectTable','render'],'the Table scene uses one authorized projection');
  calls.length=0;
  const tableWire=E.projectTable(next,0,{rawEvents:true});
  assert.deepEqual(calls,['projectTable'],'wire frames need no spectator projection or render');
  assert.equal(tableWire.scene,undefined);assert.equal(tableWire.modelProjection.viewer,-1);
  assert.equal(E.get('tictactoe').eventScenes(table.modelProjection,next.players,table.events),table.events);
  assert.deepEqual(table.data,E.project(next,-1).data);assert.equal(table.modelProjection.viewer,-1);assert.equal(table.tableActions.length,8);assert.equal(table.scene.cells.filter(cell=>cell.command).length,8);
  assert.throws(()=>E.applyTableAction(next,-1,{type:'place',cell:0}),coded('TABLE_ACTION_UNAVAILABLE'));assert.equal(E.applyTableAction(next,0,{type:'place',cell:0}).data.board[0],0);
  const Session=require('../core/session.js'),Authority=require('../core/authority.js');
  const game=new Session(E,'tictactoe',{players:[{name:'One'},{name:'Two'}],seed:17,firstPlayerMode:'assigned',firstPlayer:1});
  game.act(1,{type:'place',cell:4});
  const authority=new Authority(game);
  try{
    const bindings=[authority.connect(0),authority.connectTable([0])];
    for(const [index,binding] of bindings.entries()){
      calls.length=0;projectedJournalSizes.length=0;
      const wire=binding.snapshot({wire:true});
      assert.deepEqual(calls,[index?'projectTable':'project']);
      assert.deepEqual(projectedJournalSizes,[0],'the host rules VM receives no redundant event journal');
      assert.equal(wire.events.at(-1).type,'tictactoe.placed','the wire retains its authorized facts');
      assert(!Object.hasOwn(wire.state.modelProjection,'events'));
      const projection=require('../presentation/network-projection.js'),pack=E.get('tictactoe');
      const rebuilt=projection.restore(projection.compact(wire),event=>pack.presentEvent(event,wire.state.players),pack);
      assert.equal(rebuilt.actions.length,8);
      assert.equal(reactionReads,0,'rules without a reaction hook never reenter the VM for reaction checks');
      assert.deepEqual(Object.keys(localViewReplies.at(-1)),['actions'],'model facts do not cross back from the rules VM');
      assert.equal(localViewReplies.at(-1).actions.length,8);
      const readOnly=projection.restore({...projection.compact(wire),inputAllowed:false},event=>pack.presentEvent(event,wire.state.players),pack);
      assert.deepEqual(readOnly.actions,[]);
      assert.deepEqual(localViewReplies.at(-1),{actions:[]});
    }
  }finally{authority.dispose();}
  // Adopt the separate hidden-information example into the same current VM wire.
  const example=JSON.parse(execFileSync('python3',['-c',`import json,runpy,sys,tempfile,shutil
from pathlib import Path
root=Path(sys.argv[1]);compiler=runpy.run_path(str(root/'shared/pack_compiler.py'))
with tempfile.TemporaryDirectory() as tmp:
 pack=Path(tmp)/'private-counter';shutil.copytree(root/'examples/private-counter',pack)
 manifest=json.loads((pack/'manifest.json').read_text());manifest.update(execution='isolated-v1',sdkFeatures=['isolated-execution-v1']);(pack/'manifest.json').write_text(json.dumps(manifest))
 (pack/'sdk').mkdir();(pack/'sdk/project.json').write_text(json.dumps({'contractVersion':1,'rules':['domain/game.js'],'presentation':['presentation/scene.js'],'helpers':[],'types':[],'support':[]}))
 print(json.dumps(compiler['build_pack'](pack,shared=root/'shared')))
`,packs],{encoding:'utf8',maxBuffer:4*1024*1024}));manager.install(manager.prepare(example));
  const counter=E.createGame('private-counter',{players:[{name:'One'},{name:'Two'}],seed:17});
  for(const viewer of [-1,0,1]){const projection=E.project(counter,viewer);assert.equal(projection.scene.count,0);projection.scene.goals.forEach((goal,index)=>assert.deepEqual(goal,viewer===index?{value:index+2}:{hidden:true}));}
  const ignored=structuredClone(isolated);ignored.files['view.js']='globalThis.packEscaped=true;';assert.doesNotThrow(()=>manager.prepare(ignored));assert.equal(globalThis.packEscaped,undefined,'host entrypoint text is never executed');
});

test('portable reactions have independent episodes, authorized public choices and no implicit bot turns',()=>{
 const Random=require('../core/random.js');
 const definition=require('../packs/one-oh-one/domain/game.js')({shuffle:Random.shuffle});
 const model=new GameModel(definition);
 const initial=structuredClone(model.create({playerCount:3,firstPlayer:0,preset:'classic',rng:17}));
 assert.deepEqual(model.reactions(initial,1),[]);
 initial.data.drawPile.push(...initial.data.hands[1].splice(1));
 initial.data.mau.situations[1]={open:true,settled:false,called:false,episode:0};
 const table=model.projectTable(initial,1);
 const command=table.actions.find(action=>action.type==='declare-mau');
 assert(command);assert(table.data.hands.flat().every(card=>card.hidden));
 assert.equal(model.commandFor(initial,1,command,'table').episode,0);
 const changed=model.apply(initial,1,command);
 assert.equal(changed.position.turn,initial.turn);assert.equal(changed.events[0].type,'mau.declared');
 assert.equal(model.reactionControl(changed.position,1,command).ignore,true);
 assert.deepEqual(model.reactions(changed.position,1),[]);
 assert.throws(()=>model.commandFor(initial,1,{type:'declare-mau',episode:999},'table'),coded('TABLE_ACTION_UNAVAILABLE'));
});

test('preparation is durable but does not create game turns; public projection exposes only its boundary',()=>{
 const factory=require('../packs/fleet-grid/domain/game.js'),G=require('../packs/fleet-grid/domain/geometry.js'),Random=require('../core/random.js');
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


test('mini-card assets compile identically in both builders with host-owned renderer and styles',()=>{
 const script=`
import importlib.util,json,sys,tempfile,shutil
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
 const source=require('../core/packs.js').sdkSource(app);assert.equal(app.manifest.execution,'isolated-v1');
 assert.equal(source.sources.providers,undefined);
 const mini=source.resourceClosure.assetPacks.find(({manifest})=>manifest.id==='mini-cards').manifest;
 assert.equal(mini.scripts,undefined);assert.equal(mini.styles,undefined);
 assert(source.assets.some(asset=>asset.file==='assets/shared-packs/mini-cards/back.svg'));
 const project=require('../sdk/project.cjs').loadProject(path.join(packs,'packs/gofish'),{shared:path.join(packs,'shared')});
 assert(project.providers.some(row=>row.file==='assets/shared-packs/mini-cards/renderer.js'&&row.source.includes('root.PlayroomMiniCards=api')));
 assert(project.providers.some(row=>row.file==='assets/shared-packs/mini-cards/styles.css'&&row.source.includes('.mini-card>.card-deck-art')));
 assert(!app.files['view.js'].includes('PlayroomMiniCards'),'host entrypoints remain inert');
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
 payload={**bundle['sdk'],'manifest':bundle['manifest']};assert payload['manifest']['version']==source['version']
 assert source['execution']=='isolated-v1'
 assert not any(a['file'].endswith(('.js','.css','.md','.txt')) for a in payload['assets'])
 import base64,hashlib
 for a in payload['assets']:assert hashlib.sha256(base64.b64decode(a['data'])).hexdigest()==a['sha256']
 if pack.name=='pexeso':assert not any(a['file'].startswith('assets/shared-packs/characters/') for a in payload['assets'])
 if pack.name=='fleet-grid':assert 'base64' not in files['sounds.js'] and len([a for a in payload['assets'] if a['mime'].startswith('audio/')])==4
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
      const manifest=JSON.parse(fs.readFileSync(path.join(packs,'packs',id,'manifest.json'),'utf8')),declared=manifest.playModes?.find(mode=>mode.id===preset.id);
      const count=declared?.players?.[0]??game.min;
      const state=E.createGame(id,{players:Array.from({length:count},(_,i)=>({name:'P'+i,bot:true})),preset:preset.id,seed:17});
      for(let viewer=-1;viewer<count;viewer++){
        const projected=E.project(state,viewer);
        assert.equal(projected.scene.players.length,count,`${id}/${preset.id}/${viewer}`);
        assert(projected.scene.geometry.topology);assert(projected.scene.zones.length);
        const signature=require('../core/model-values.js').canonical;
        const targets=new Set(projected.scene.interactions.map(item=>signature(item.command))),legal=new Set(E.availableCommands(state,viewer).map(signature));
        assert.equal(targets.size,legal.size,`${id}/${preset.id}/${viewer}: unique target commands cover every legal command`);
        for(const target of targets)assert(legal.has(target),`${id}/${preset.id}/${viewer}: presentation target is authorized`);
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
 }},locales:{ru:require('../packs/tictactoe/lang/ru.json')},version:'1.0.0'});
 E.register(adapted);const session=new Session(E,adapted.id,{players:[{name:'A'},{name:'B'}],firstPlayerMode:'assigned',firstPlayer:0});
 session.act(0,{type:'place',cell:0});
 for(const viewer of [-1,0,1]){const event=session.view(viewer).events.at(-1);assert.equal(event.scene.viewer,viewer);assert.deepEqual(event.scene.interactions,[]);assert.equal(event.scene.cells[0].owner,0);}
 for(invalid of ['id','duplicate','actions'])assert.throws(()=>session.view(-1),/EVENT_SCENE/);
});

test('Markdown authoring compiles into inert rule blocks and preserves exact companion bytes',async()=>{
 globalThis.PlayroomSandbox=await require('../sdk/node-host.cjs').createNodeHost();
 // Compare complete bundles against the independently prepared app companion.
 // Git HEAD can predate unrelated compiler/asset work in the same checkout.
 const installed=process.env.PLAYROOM_TEST_INSTALLED_PACKS||path.join(root,'installed-packs.js');
 const prepared={};vm.runInNewContext(fs.readFileSync(installed,'utf8'),prepared);
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
 manifest=pack/'manifest.json';data=json.loads(manifest.read_text());data['sourceModules']['rulebooks']={'ru':'rules/ru.md'};data['version']+='-markdown-fixture';manifest.write_text(json.dumps(data))
 (pack/'rules').mkdir(exist_ok=True);(pack/'rules/ru.md').write_text(md)
 bundle=ns['build_pack'](pack,shared=packs_root/'shared')
 assert 'rules/ru.md' not in bundle['files']
 print(json.dumps({'book':book,'bundle':bundle},ensure_ascii=False))
`;
 const result=JSON.parse(execFileSync('python3',['-c',script,root,packs],{input:JSON.stringify(prepared.PlayroomInstalledPacks),encoding:'utf8',maxBuffer:5*1024*1024}));
 const E=require('../core/engine.js'),UI=require('../core/ui.js'),Packs=require('../core/packs.js');
 const manager=new Packs({engine:E,views:UI.createRegistry(),catalog:{},storage:{get:()=>null,set(){}}});
 const encoded=require('../core/packs.js').sdkSource(result.bundle);const translated=new (require('../presentation/localization.js').Translator)({catalogs:encoded.catalogs,locale:'ru'}).resolve(encoded.resourceClosure.rulebooks.ru);assert.deepEqual(translated,result.book,'packed locale references resolve to the exact authored rich document');
 manager.install(manager.prepare(result.bundle));
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
  const draft=JSON.parse('{"__proto__":{"safe":true},"foreign":{"value":1}}');
  draft.rows=[first.nested,draft.foreign];
  const composed=values.composeValue(draft);
  assert.equal(composed.rows[0],first.nested);
  assert.equal(composed.rows[1],composed.foreign);
  assert.notEqual(composed.foreign,draft.foreign);
  draft.foreign.value=2;
  assert.equal(composed.foreign.value,1);assert(Object.isFrozen(composed.rows));
  assert.equal(composed.__proto__.safe,true);assert.equal(Object.getPrototypeOf(composed),Object.prototype);
  const custom=Object.create({toJSON(key){return {key};}});
  assert.deepEqual(values.composeValue({nested:custom}),{nested:{key:'nested'}});
  assert.throws(()=>values.composeValue({list:Array(1)}),coded('JSON_INVALID'));
  assert.throws(()=>values.composeValue(cyclic),coded('JSON_INVALID'));
});

test('unimplemented optional mechanics do not traverse the complete game position',()=>{
  const E=require('../core/engine.js');require('../packs/tictactoe/rules.js');
  const adapted=globalThis.PlayroomModelRegistration.adapt(E,{definition,presentation,locales:{ru:require('../packs/tictactoe/lang/ru.json')},version:'0.1.0'});
  const state=E.createGame('tictactoe',{seed:17,players:[{name:'A'},{name:'B'}]});let reads=0;const data=state.data;Object.defineProperty(state,'data',{get(){reads++;return data;}});
  for(let i=0;i<40;i++){
    assert.deepEqual(adapted.reactions(state,0),[]);assert.deepEqual(adapted.reactionWindows(state),[]);assert.equal(adapted.reactionControl(state,0,{type:'place',cell:0}),null);assert.equal(adapted.botReaction(state,0),null);assert.equal(adapted.botReactionDelay(state,0),null);assert.equal(adapted.decisionWindow(state),null);
  }
  assert.equal(reads,0,'absent hooks must return their default without cloning the position');
});

test('model validation reuses validated immutable positions but rechecks mutable or changed inputs',()=>{
 let calls=0;const counted=new GameModel({...definition,validate(position){calls++;return definition.validate(position);}}),position=counted.create({playerCount:2,firstPlayer:0,preset:'classic'});calls=0;counted.validate(position);const once=calls;counted.validate(position);counted.validate(position);assert.equal(calls,once,'one immutable position is validated once');
 const incoming=JSON.parse(JSON.stringify(position));calls=0;
 assert(counted.botInputs(incoming,0,{}).actions.length);
 assert.equal(calls,1,'projection and legal choices share the same validated bot input position');
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

test('parameter preview metadata stays public, bounded and identical across compiler and runtime',async()=>{
 globalThis.PlayroomSandbox=await require('../sdk/node-host.cjs').createNodeHost();
 const script=`
import copy,json,sys,tempfile,shutil
from pathlib import Path
root=Path(sys.argv[1]);path=root/'shared/pack_compiler.py';ns={'__file__':str(path)};exec(compile(path.read_text(),str(path),'exec'),ns)
bundles=[ns['build_pack'](root/'packs'/game) for game in ['fleet-grid','ludo','mage-brawl','one-oh-one','gofish','durak','oldmaid','klondike','snakes']]
for path in (root/'packs').glob('*/manifest.json'):ns['read_manifest'](path.parent)
base=ns['runtime_manifest'](ns['resolve_pack_text'](copy.deepcopy(bundles[2]['manifest']),bundles[2].get('lang',{}),fallback='ru'));
if 'parameter-previews-v2' not in base['sdkFeatures']:base['sdkFeatures'].append('parameter-previews-v2')
health=next(i for i,f in enumerate(base['settings']) if f['key']=='health')
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
for description in [False,[], '', 'x'*361]:reject(lambda m,d=description:option(m).__setitem__('description',d))
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
  value=copy.deepcopy(base);
  if key=='settings':value['presetSetting']={'label':'Mode','options':[{'value':'classic','label':'Classic'}]}
  target=value['presetSetting'] if key=='presetSetting' else field(value);target.update({'presentation':'mode','options':[{'value':'classic','label':'Mode','preview':preview}]});ns['validate_manifest'](value,'valid-mode-preview');valid.append(value)
value=copy.deepcopy(base);value['presetSetting']={'label':'Mode','options':[{'value':'classic','label':'Classic'}]};field(value)['presentation']='mode';ns['validate_manifest'](value,'inherited-mode-preview');valid.append(value)
value=copy.deepcopy(base);field(value).update({'inactiveWhen':{'actionsPerTurn':'1'},'inactivePresentation':{'preview':{'kind':'symbol','icon':'refresh'},'description':'Inactive option'}});ns['validate_manifest'](value,'valid-inactive-preview');valid.append(value)
for count in [0,100]:
 value=copy.deepcopy(base);option(value)['preview']={'count':count};ns['validate_manifest'](value,'valid-preview');valid.append(value)
for preview in [{'kind':'declaration','actor':'human','label':'UNO!'},{'kind':'symbol','icon':'first'},{'kind':'illustrations','ids':['setting-type-attack']},{'kind':'illustrations','ids':['same']*4}]:
 value=copy.deepcopy(base);option(value)['preview']=preview;ns['validate_manifest'](value,'valid-common-preview');valid.append(value)
print(json.dumps({'bundles':bundles,'bad':bad,'valid':valid},ensure_ascii=False))
`;
 const result=JSON.parse(execFileSync('python3',['-c',script,packs],{encoding:'utf8',maxBuffer:8*1024*1024}));
 const Packs=require('../core/packs.js'),parse=manifest=>{
  const bundle=structuredClone(result.bundles[2]),payload=require('../core/packs.js').sdkSource(bundle);bundle.manifest=manifest;payload.manifest=manifest;
  const hash=require('node:crypto').createHash('sha256');hash.update(JSON.stringify({manifest,descriptor:payload.descriptor,catalogs:payload.catalogs}));for(const kind of ['dependencies','rules','helpers','presentation','types','support'])for(const row of payload.sources[kind]||[])hash.update(row.file+'\0'+row.source);payload.sourceHash=hash.digest('hex');if(bundle.formatVersion===2){const {manifest:ignored,catalogs:ignoredCatalogs,...sdk}=payload;bundle.sdk=sdk;}else bundle.files['sdk/source.json']=JSON.stringify(payload);return Packs.parse(bundle);
 };
 for(const m of result.valid)assert.doesNotThrow(()=>parse(m));
 for(const [index,m]of result.bad.entries())assert.throws(()=>parse(m),error=>error.code==='PACK_PARAMETER_PREVIEW_INVALID','invalid preview case '+index+': '+JSON.stringify(m.settings.find(f=>f.key==='health')));
 const Engine=require('../core/engine.js'),UI=require('../core/ui.js'),catalog={},views=UI.createRegistry(),manager=new Packs({engine:Engine,views,modelAdapter:require('../core/model-registration.js').adapt,catalog,storage:{get:()=>null,set(){}}});
 const Rooms=require('../application/rooms.js');
 for(const bundle of result.bundles){
  const {id}=bundle.manifest,runtime=Packs.runtimeManifest(Packs.localizedManifest(bundle));manager.install(manager.prepare(bundle));assert.deepEqual(catalog[id].presetSetting,runtime.presetSetting);
  assert.deepEqual(catalog[id].settings,runtime.settings.map(Rooms.standardRule),'installed public standard wording is application-owned');
  for(const raw of runtime.settings){
   const installed=catalog[id].settings.find(field=>field.key===raw.key);assert.equal(installed.default,raw.default);assert.deepEqual(installed.options?.map(o=>o.value),raw.options?.map(o=>o.value),'wording normalization preserves supported option IDs');
   if(Object.hasOwn(Rooms.STANDARD_RULE_VALUES,raw.key)){
    const prefix='rules-help.standard.'+raw.key;assert.equal(installed.label,globalThis.PlayroomMessages.text(prefix+'.label'));assert.equal(installed.help,globalThis.PlayroomMessages.text(prefix+'.help'));
    for(const option of installed.options)assert.equal(option.description,globalThis.PlayroomMessages.text(prefix+'.'+option.value+'.description'));
   }
  }
  const exported=manager.exportView(id);assert.deepEqual(exported.manifest.settings,runtime.settings,'connected view carries resolved runtime settings');assert.deepEqual(exported.manifest.presetSetting,runtime.presetSetting);const immutable=JSON.parse(manager.exportPack(id));assert.deepEqual(immutable.manifest,bundle.manifest,'installable export preserves the authored structured manifest');
 }
 for(const id of Object.keys(catalog))assert.equal(catalog[id].sdkFeatures.includes('parameter-illustrations-v1'),['mage-brawl','ludo','spider','durak','pexeso','snakes','dice-poker','oldmaid','domino','checkers'].includes(id),'author-supplied component illustrations require the feature');
 const mageFields=catalog['mage-brawl'].settings;assert.deepEqual(mageFields.find(f=>f.key==='actionsPerTurn').options.map(o=>o.preview.ids),[['setting-card-fire-attack'],['setting-card-fire-attack','setting-card-water-movement']]);assert.deepEqual(mageFields.find(f=>f.key==='differentActionTypes').options.map(o=>o.preview.ids),[['setting-type-attack','setting-type-attack'],['setting-type-movement','setting-type-attack']]);
 const mageFigures=new Map(catalog['mage-brawl'].support.figures.map(figure=>[figure.id,figure.graphic]));for(const id of ['setting-card-fire-attack','setting-card-water-movement','setting-type-movement','setting-type-attack'])assert(mageFigures.has(id),'declared setting artwork is present: '+id);assert.notDeepEqual(mageFigures.get('setting-card-fire-attack'),mageFigures.get('setting-card-water-movement'));assert.notDeepEqual(mageFigures.get('setting-type-movement'),mageFigures.get('setting-type-attack'));
 for(const id of Object.keys(catalog))assert.equal(catalog[id].sdkFeatures.includes('parameter-previews-v2'),['durak','klondike'].includes(id),'only settings-mode/inactive packs require app68');
 const modes=[catalog.durak.presetSetting,...catalog.durak.settings].filter(f=>f.presentation==='mode');assert.equal(modes.length,1);assert.equal(modes[0].key,'variant');assert.deepEqual(modes[0].options.map(o=>o.value),['simple','throwin','transfer']);
 const fleet=require('../packs/fleet-grid/domain/geometry.js').fleets;
 for(const o of catalog['fleet-grid'].presetSetting.options)assert.deepEqual(o.preview.pieces,fleet[o.value]);
 for(const f of catalog['mage-brawl'].settings.filter(f=>['health','handLimit'].includes(f.key)))assert.deepEqual(f.options[0].preview.countFrom,{field:'actionsPerTurn',values:{'1':3,'2':4}});
 for(const steps of ['1','2']){const state=Engine.createGame('mage-brawl',{seed:17,players:[{name:'A'},{name:'B'}],actionsPerTurn:steps,health:'mode',handLimit:'mode'});for(const key of ['health','handLimit']){const field=catalog['mage-brawl'].settings.find(f=>f.key===key);assert.equal(field.options[0].preview.countFrom.values[steps],state.data.config[key],'automatic preview agrees with the actual domain value');}}
 const hand=catalog['one-oh-one'].settings.find(f=>f.key==='hand');
 for(const option of hand.options){const state=Engine.createGame('one-oh-one',{seed:17,hand:option.value,players:[{name:'A'},{name:'B'}]});assert.equal(option.preview.count,Number(state.data.settings.hand));}
 assert.deepEqual(catalog.ludo.presetSetting.options.map(o=>o.preview.teamSizes),[[1,1,1,1],[2,2]]);
 const board=require('../packs/ludo/domain/board.js'),teamSizes=Object.values(Array.from({length:4},(_,player)=>board.team(player)).reduce((groups,team)=>({...groups,[team]:(groups[team]||0)+1}),{}));assert.deepEqual(catalog.ludo.presetSetting.options.find(o=>o.value==='teams').preview.teamSizes,teamSizes,'team diagram agrees with actual partner grouping');
 for(const game of ['gofish','durak','oldmaid']){const field=catalog[game].settings.find(f=>f.key==='deck');for(const option of field.options){const state=Engine.createGame(game,{seed:17,deck:option.value,players:[{name:'A'},{name:'B'}]}),count=game==='oldmaid'?state.data.hands.flat().length+state.data.discard.length:state.data.deckSize;assert.equal(option.preview?.count??Number(option.value),count,game+' preview describes the actual card pool');}}
 for(const option of catalog.klondike.settings.find(f=>f.key==='draw').options){const state=Engine.createGame('klondike',{seed:17,draw:option.value,players:[{name:'A'}]});assert.equal(Number(option.value),state.data.config.draw,'draw preview agrees with actual solitaire configuration');}
 const passes=catalog.klondike.settings.find(f=>f.key==='maxPasses');assert.deepEqual(passes.inactiveWhen,{scoring:'vegas'});assert.deepEqual(passes.inactivePresentation.preview,{kind:'symbol',icon:'lock'});for(const draw of ['1','3'])for(const selected of ['0','1','3']){const state=Engine.createGame('klondike',{seed:17,draw,scoring:'vegas',maxPasses:selected,players:[{name:'A'}]});assert.equal(state.data.config.maxPasses,draw==='1'?1:3,'Vegas domain overrides pass draft according to draw size');}
 const declaration=catalog['one-oh-one'].settings.find(f=>f.key==='mauMode');assert.deepEqual(declaration.preview,{kind:'declaration',label:'Мау!'});assert.deepEqual(declaration.options.map(o=>o.preview.actor),['human','bot']);
 assert.equal(catalog.snakes.presetSetting.presentation,undefined,'dice-count choices remain compact');
 for(const option of catalog.snakes.presetSetting.options){const state=Engine.createGame('snakes',{seed:17,preset:option.value,players:[{name:'A'},{name:'B'}]});assert.equal(option.preview.kind,'illustrations');assert.deepEqual(option.preview.ids,['setting-mode-'+option.value]);assert.equal(Array.isArray(state.data.dice)?state.data.dice.length:1,option.value==='plus'?2:1,'illustrated mode agrees with actual initial dice');}
});


test('result playerOrder is an optional complete permutation, separate from score direction',()=>{
 const model=new GameModel(definition);let s=model.create({playerCount:2,firstPlayer:0,preset:'classic'});
 for(const cell of [0,3,1,4,2])s=model.apply(s,s.turn,{type:'place',cell}).position;
 assert.equal(s.status,'finished');
 for(const playerOrder of [[1,0],[],[0],[0,0],[0,2],[0,1,2],'desc']){
  const candidate=new GameModel({...definition,result:p=>({...definition.result(p),playerOrder})});
  if(Array.isArray(playerOrder)&&playerOrder.length===2&&playerOrder[0]===1)assert.deepEqual(candidate.result(s).playerOrder,[1,0]);
  else assert.throws(()=>candidate.result(s),/RESULT_INVALID/);
 }
 const summary=new GameModel({...definition,result:p=>{
  const base=definition.result(p),metric=base.metrics[0];
  return {...base,privateNote:'rules-only',metrics:[{...metric,privateNote:'rules-only',maximumFractionDigits:1}],exits:[{player:1,kind:'finished',turn:5,privateNote:'rules-only'}]};
 }}).result(s);
 assert.equal(summary.privateNote,undefined);
 assert.deepEqual(summary.metrics,[{id:'wins',values:[1,0],maximumFractionDigits:1}]);
 assert.deepEqual(summary.exits,[{player:1,kind:'finished',turn:5}]);
});
