'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const UI=require('../core/ui.js'),E=require('../core/engine.js'),Packs=require('../core/packs.js'),Session=require('../core/session.js');
function bundle(version='0.1.0',multi=true){return {format:'playroom-pack',formatVersion:1,manifest:{id:'view-fixture',name:'View fixture',version,engineApi:4,viewApi:3,stateVersion:1},files:{'rules.js':require('./pack-fixture.cjs').rules({id:'view-fixture',name:'View fixture',version}),'view.js':`globalThis.PlayroomViews.register('view-fixture',()=>({api:3,family:'board',elements:{field:'<p>combined ${version}</p>'}}),null,${multi?`{surfaces:{table:()=>({api:3,family:'board',elements:{field:'<p>table ${version}</p>'}}),player:()=>({api:3,family:'board',elements:{field:'<p>player ${version}</p>'}})}}`:'{}'});`,'styles.css':'.view-fixture{display:block}'}};}
function env(){let raw;const views=UI.createRegistry(),manager=new Packs({engine:E,views,catalog:{},document:null,storage:{get:()=>raw,set:s=>raw=s}});return {views,manager};}
test('API 2 registration remains combined-only; old HTML and optional surfaces fail closed',()=>{const v=UI.createRegistry();v.register('old',()=>'<p>Old</p>');assert.equal(v.supports('old','combined'),true);assert.equal(v.supports('old','player'),false);assert.doesNotMatch(v.render({game:'old'},0,[],{surface:'combined'}),/Old/);assert.doesNotMatch(v.render({game:'old'},0,[],{surface:'player'}),/Old/);assert.throws(()=>v.register('bad',()=>'',null,{surfaces:{player:'not a function'}}));});
test('surface registration survives portable install, version activation and reboot',()=>{const {manager,views}=env();manager.bootstrap([bundle('0.1.0',false),bundle('0.2.0')]);assert.equal(views.supports('view-fixture','table'),true);assert.match(views.render({game:'view-fixture'},-1,[],{surface:'table'}),/table 0.2.0/);manager.activate('view-fixture','0.1.0');assert.equal(views.supports('view-fixture','player'),false);manager.activate('view-fixture','0.2.0');assert.equal(views.supports('view-fixture','player'),true);const payload=manager.exportView('view-fixture','0.2.0');assert.ok(!JSON.stringify(payload).includes('create(s)'));assert.equal(payload.manifest.version,'0.2.0');assert.equal(JSON.parse(manager.exportPack('view-fixture','0.1.0')).manifest.version,'0.1.0');});
test('failed activation restores surface registry as well as combined renderer',()=>{const {manager,views}=env();manager.install(manager.prepare(bundle('1.0.0')));const original=views.register;let fail=true;views.register=function(id,render,cover,options){if(fail){fail=false;throw Error('View refused');}return original.call(this,id,render,cover,options);};assert.throws(()=>manager.install(manager.prepare(bundle('1.1.0',false))),/View refused/);assert.equal(views.supports('view-fixture','table'),true);assert.match(views.render({game:'view-fixture'},-1,[],{surface:'table'}),/table 1.0.0/);assert.equal(manager.list().length,1);});
test('compact art is optional, retains canonical dimensions and has a main fallback',()=>{const H=UI.helpers,art={main:'<b>Main</b>',compact:'<b>Small</b>',width:72,height:103};assert.match(H.art(art,'compact'),/Small/);assert.doesNotMatch(H.art(art,'compact'),/Main/);assert.match(H.art({...art,compact:undefined},'compact'),/data-art-variant="main"/);assert.match(H.art(art),/viewBox="0 0 72 103" preserveAspectRatio="xMidYMid meet"/);assert.throws(()=>H.art({...art,width:0}));assert.throws(()=>H.art({...art,height:Infinity}));assert.match(H.back(),/piece-art/);});


test('old manifests and pack CSS that places application components are rejected',()=>{const core={...E,GAMES:[...E.GAMES]},views=UI.createRegistry(),manager=new Packs({engine:core,views,catalog:{},storage:{get:()=>null,set(){}}});const old=bundle();delete old.manifest.viewApi;assert.throws(()=>manager.prepare(old),/API интерфейса 3/);for(const selector of ['.table-shell','.own-hand','.game-layout-slot','.mini-hand','.player-info','.hand-heading','.opponent-hand']){const value=bundle();value.files['styles.css']=selector+'{display:grid}';assert.throws(()=>manager.prepare(value),/принадлежит приложению/);}});


test('public table strips player-target actions even when supplied by a caller',()=>{
  const state={game:'public-fixture',turn:0,data:{},players:[{name:'One',score:0},{name:'Two',score:0}]};
  const scene={api:3,family:'board',elements:{field:'<p>Table</p>',actions:'<button>Personal</button>',hand:'Private'}};
  const actions=[{type:'react',target:0,targetKind:'player'}],views=UI.createRegistry();
  views.register(state.game,()=>scene,null,{surfaces:{table:(s,v,a)=>{assert.deepEqual(a,[]);return scene;}}});
  for(const html of [UI.composeScene(scene,{surface:'table',state,viewer:-1,actions}),views.render(state,-1,actions,{surface:'table'})])assert.doesNotMatch(html,/data-player-target|layout-self|layout-hand|layout-actions|Personal|Private/);
  assert.match(UI.composeScene(scene,{state,viewer:1,actions}),/data-player-target="0"/);
});

test('player descriptors require matching indexes and valid public metadata',()=>{
  const state={players:[{name:'One'},{name:'Two'}]},scene={api:3,family:'cards',elements:{field:'Field'}};
  for(const content of [[{}],[{},null],[{},[]],[{open:'yes'},{}],[{badges:[null]},{}],[{colorLabel:1},{}],[{countLabel:false},{}]])assert.throws(()=>UI.composeScene({...scene,playerContent:content},{state}));
  assert.doesNotThrow(()=>UI.composeScene({...scene,playerContent:[{badges:['UNO!',{label:'Ready'}]},{}]},{state}));
});

test('pack assets survive export to a remote view without rules or external requests',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),value=bundle();
  value.files['assets/piece.svg']='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>';
  value.files['styles.css']='.view-fixture{background:url("assets/piece.svg")}';
  value.files['view.js']=`const asset=globalThis.PlayroomPack.asset('assets/piece.svg');globalThis.PlayroomViews.register('view-fixture',()=>({api:3,family:'board',elements:{field:'<img src="'+asset+'" alt="Piece">'}}));`;
  const {manager,views}=env();manager.install(manager.prepare(value));
  const definition=manager.exportView('view-fixture'),remote=UI.createRegistry(),nodes=[];
  const scope={PlayroomMessages:require('../core/messages.js'),PlayroomPackLoader:require('../platform/web/pack-loader.js'),PlayroomViews:remote,TabletopUI:UI,document:{querySelector:()=>nodes[0],createElement:()=>({dataset:{}}),head:{appendChild:n=>nodes.push(n)}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../app/shared-views.js'),'utf8'),scope);
  scope.PlayroomSharedViews.install(definition);
  assert.equal(remote.render({game:'view-fixture'},-1,[]),views.render({game:'view-fixture'},-1,[]));
  assert.match(nodes[0].textContent,/url\("data:image\/svg\+xml/);assert.equal(nodes[0].textContent,definition.styles);
  scope.PlayroomSharedViews.install({...definition,styles:'.view-fixture{color:red}'});
  assert.equal(nodes.length,1);assert.equal(nodes[0].textContent,'.view-fixture{color:red}');
  assert.match(definition.assets['assets/piece.svg'],/^data:image\/svg\+xml/);
  assert.ok(!Object.hasOwn(definition,'files'));assert.doesNotMatch(JSON.stringify(definition),/create\(s\)/);
  delete value.files['assets/piece.svg'];assert.throws(()=>manager.prepare(value),/Ресурс|ресурс/);
});

test('a personal surface keeps authorized targets for a selected private hand card',()=>{
 const state={game:'test',players:[{name:'A'},{name:'B'}],turn:0,scene:{players:[]},data:{}};
 const actions=[{type:'play',card:'d12',side:'left',label:'Слева'},{type:'play',card:'d12',side:'right',label:'Справа'}];
 const scene={api:3,family:'cards',elements:{field:'<div>Public chain</div>',hand:'<button>Private hand</button>',actions:UI.actionButton(actions[0])}};
 const html=UI.composeScene(scene,{surface:'player',state,viewer:0,actions,selection:'d12'});
 assert.equal((html.match(/&quot;side&quot;:&quot;left&quot;/g)||[]).length,1);assert.equal((html.match(/&quot;side&quot;:&quot;right&quot;/g)||[]).length,1);
 assert(!UI.composeScene(scene,{surface:'player',state,viewer:0,actions,selection:null}).includes('Справа'));
});


test('API 4 rejects previous engine and view contracts before executing plugin code',()=>{
 const {manager}=env();
 for(const legacy of [{engineApi:3},{viewApi:2}]){
  const value=bundle();Object.assign(value.manifest,legacy);value.files['rules.js']='throw Error("EXECUTED_LEGACY")';
  assert.throws(()=>manager.prepare(value),error=>!error.message.includes('EXECUTED_LEGACY'));
 }
});

test('pack tutorial survives activation and failed install without leaking to another pack',()=>{
 const {manager,views}=env(),first=bundle('2.0.0');
 first.files['view.js']+="globalThis.PlayroomViews.registerTutorial('view-fixture',()=>({phase:'first',steps:[{selector:'button',text:'Choose'}]}));";
 manager.install(manager.prepare(first));assert.equal(views.get('view-fixture').tutorial().phase,'first');
 const bad=bundle('2.0.1');bad.files['view.js']+="globalThis.PlayroomViews.registerTutorial('other',()=>({}));";
 assert.throws(()=>manager.prepare(bad),/Invalid tutorial/);
 assert.equal(views.get('view-fixture').tutorial().phase,'first');
 manager.install(manager.prepare(bundle('2.0.2')));assert.equal(views.get('view-fixture').tutorial,undefined);
 manager.activate('view-fixture','2.0.0');assert.equal(views.get('view-fixture').tutorial().steps[0].text,'Choose');
});
