'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {GameModel}=require('../core/model-runtime.js');
const Inputs=require('../core/model-inputs.js');
const SceneContract=require('../presentation/scene-contract.js');
function model(){return new GameModel({contractVersion:1,id:'input-clock',minPlayers:2,maxPlayers:2,rounds:true,
 create:o=>({playerCount:o.playerCount,turn:0,status:'playing',winners:[],data:{phase:'draw',deadline:o.now+1000,operations:[],guesses:[],points:[-1,1]}}),
 validate:p=>['draw','guess'].includes(p.data.phase),actions:()=>[],
 inputs:(p,a)=>a===0&&p.data.phase==='draw'?[{visibility:'public',command:{type:'ink',round:1},fields:{operation:{kind:'ink'}}}]:a===1?[{visibility:'private',command:{type:'guess',round:1},fields:{text:{kind:'text',minLength:1,maxLength:12}}}]:[],
 reduce:(p,a,c,ctx)=>({position:{...p,data:{...p.data,...(c.type==='ink'?{operations:[...p.data.operations,c.operation]}:{guesses:[...p.data.guesses,c.text]}),lastNow:ctx.now}},events:[]}),
 advance:(p,now)=>p.data.phase==='draw'&&now>=p.data.deadline?{position:{...p,data:{...p.data,phase:'guess',deadline:p.data.deadline+15000}},events:[{type:'phase.expired',actor:null,params:{},visibility:{kind:'public'}}],turnEnded:true,roundEnded:true}:null,
 project:(p,v)=>({phase:p.data.phase,operations:p.data.operations,...(v===0?{guesses:p.data.guesses}:{})}),score:p=>p.data.points,
 result:p=>({winners:[],places:[2,1],metrics:[{id:'points',values:p.data.points}]})});}
const stroke={kind:'stroke',id:'a-1',tool:'brush',color:'#ff0088',width:2,points:[[0,0],[65535,65535]]};
test('structured commands enforce actor, immutable context, privacy and exact fields before reduce',()=>{
 const m=model(),p=m.create({playerCount:2,now:100}),original=JSON.stringify(p);
 for(const [actor,command]of [[1,{type:'ink',round:1,operation:stroke}],[0,{type:'ink',round:2,operation:stroke}],[0,{type:'ink',round:1,operation:stroke,actor:1}],[0,{type:'ink',round:1}],[1,{type:'guess',round:1,text:''}],[1,{type:'guess',round:1,text:'x'.repeat(13)}],[1,{type:'guess',round:1,text:'bad\u0000text'}]])assert.throws(()=>m.apply(p,actor,command));
 assert.equal(JSON.stringify(p),original);
 assert.equal(m.project(p,0).inputs[0].command.type,'ink');assert.equal(m.project(p,-1).inputs.length,0);
 assert.equal(m.projectTable(p,0).inputs[0].command.type,'ink');assert.equal(m.projectTable(p,1).inputs.length,0);
 assert.throws(()=>m.commandFor(p,1,{type:'guess',round:1,text:'cat'},'table'),e=>e.code==='TABLE_ACTION_UNAVAILABLE');
 const next=m.apply(p,0,{type:'ink',round:1,operation:stroke},{now:250}).position;
 assert.equal(next.data.operations.length,1);assert.equal(next.clock,250);assert.equal(next.data.lastNow,250);assert.equal(next.revision,1);assert.equal(p.data.operations.length,0);
 assert.equal(next.timeline,p.timeline);assert(Object.isFrozen(next.timeline.starts));
 assert.deepEqual(m.score(next),[-1,1]);
});
test('ink admits only bounded coordinates, closed tools and declarative operations',()=>{
 for(const operation of [stroke,{kind:'fill',id:'fill',color:'#aabbcc',x:0,y:65535},{kind:'clear',id:'clear'},{...stroke,points:Array.from({length:128},()=>[0,1])}])assert.doesNotThrow(()=>Inputs.ink(operation));
 for(const operation of [{...stroke,points:Array.from({length:129},()=>[0,1])},{...stroke,points:[[0,-1]]},{...stroke,points:[[0,0,1]]},{...stroke,points:[[0,0.5]]},{...stroke,tool:'script'},{...stroke,color:'url(x)'},{...stroke,width:4},{...stroke,id:'../x'},{...stroke,html:'x'},{kind:'clear',id:'x',points:[]},{kind:'fill',id:'x',color:'#000000',x:NaN,y:0}])assert.throws(()=>Inputs.ink(operation),e=>e.code==='INPUT_INVALID');
});
test('input schema rejects ambiguous bases, reserved keys and unbounded field specifications',()=>{
 const choice={visibility:'public',command:{type:'form'},fields:{count:{kind:'integer',min:-2,max:2},enabled:{kind:'boolean'},mode:{kind:'enum',values:['a',1,false]}}};
 const schema=Inputs.choices([choice]);assert.equal(Inputs.resolve(schema,{type:'form',count:-2,enabled:false,mode:1}).count,-2);
 for(const value of [{count:3,enabled:true,mode:'a'},{count:1,enabled:1,mode:'a'},{count:1,enabled:true,mode:'1'}])assert.throws(()=>Inputs.resolve(schema,{type:'form',...value}),e=>e.code==='INPUT_INVALID');
 for(const values of [[choice,choice],[{...choice,fields:{constructor:{kind:'boolean'}}}],[{...choice,fields:{text:{kind:'text',maxLength:513}}}],[{...choice,fields:{mode:{kind:'enum',values:['a','a']}}}]])assert.throws(()=>Inputs.choices(values),e=>e.code==='INPUT_SCHEMA_INVALID');
});
test('explicit clock uses canonical transitions and rejects backwards time without mutation',()=>{
 const m=model(),p=m.create({playerCount:2,now:100});assert.deepEqual(m.advance(p,1099),{position:p,events:[]});
 const transition=m.advance(p,1100);assert.equal(transition.position.clock,1100);assert.equal(transition.position.data.phase,'guess');assert.equal(transition.position.revision,1);assert.equal(transition.position.timeline.turn,2);assert.equal(transition.position.timeline.round,2);assert.equal(transition.events[0].actor,null);
 assert.deepEqual(p.timeline,{turn:1,starts:[0],round:1,roundStarts:[0]});
 assert.deepEqual(transition.position.timeline,{turn:2,starts:[0,1],round:2,roundStarts:[0,1]});
 assert.equal(transition.position.winners,p.winners);
 const restored=structuredClone(p),restoredTransition=m.advance(restored,1100);
 restored.timeline.starts[0]=99;
 assert.deepEqual(restoredTransition,transition);
 assert.throws(()=>m.advance(transition.position,1099),e=>e.code==='CLOCK_INVALID');assert.throws(()=>m.apply(transition.position,1,{type:'guess',round:1,text:'cat'},{now:1099}),e=>e.code==='CLOCK_INVALID');
 assert.throws(()=>m.apply(transition.position,0,{type:'ink',round:1,operation:stroke},{now:1100}));
 assert.equal(m.apply(transition.position,1,{type:'guess',round:1,text:'cat'},{now:1200}).position.data.guesses[0],'cat');assert.equal(transition.position.data.guesses.length,0);
});
test('semantic source and destination traits retain entity and zone membership guards',()=>{
 const scene={geometry:{topology:'fixed'},zones:[{id:'field',kind:'board'}],objects:[{ref:{namespace:'card',id:'ace'},zone:'field'}],interactions:[]};
 const source={entity:{namespace:'card',id:'ace'}};
 for(const target of [{zone:'field'},{zone:'field',cell:0},{zone:'field',index:10},source])assert.doesNotThrow(()=>SceneContract.geometry({...scene,interactions:[{command:{type:'move'},kind:'move',source,target}]},2));
 for(const target of [{zone:'other'},{zone:'field',cell:-1},{zone:'field',index:0.1},{zone:'field',cell:0,index:1},{zone:'field',url:'x'},{entity:{namespace:'card',id:'missing'}},{...source,zone:'field'}])assert.throws(()=>SceneContract.geometry({...scene,interactions:[{command:{type:'move'},source,target}]},2));
 assert.throws(()=>SceneContract.geometry({...scene,interactions:[{command:{type:'move'},source:{zone:'missing'},target:{zone:'field'}}]},2));
 const noticeScene={contractVersion:1,id:'notice',family:'board',players:[0,1].map(player=>({player,metrics:[]})),notices:[{id:'test',title:'Уведомление',actions:[{label:'Действие',command:{type:'ok'}}]}]};assert.doesNotThrow(()=>SceneContract.commands(SceneContract.validate(noticeScene,2),{actions:[{type:'ok'}]}));assert.throws(()=>SceneContract.commands(noticeScene,{actions:[]}),e=>e.code==='SCENE_COMMAND_DENIED');assert.throws(()=>SceneContract.validate({...noticeScene,notices:[...noticeScene.notices,...noticeScene.notices]},2),e=>e.code==='SCENE_NOTICE_INVALID');
 const menuScene={contractVersion:1,id:'menu',family:'drawing',players:[0,1].map(player=>({player,metrics:[]})),menuActions:[{label:'Предложить завершение',command:{type:'stop'}}]};assert.doesNotThrow(()=>SceneContract.commands(SceneContract.validate(menuScene,2),{actions:[{type:'stop'}]}));assert.throws(()=>SceneContract.commands(menuScene,{actions:[]}),e=>e.code==='SCENE_COMMAND_DENIED');
 const dockScene={...menuScene,menuActions:[],actionDock:{start:[{label:'Call'}],primary:[{label:'Draw',command:{type:'draw'}}]}};assert.doesNotThrow(()=>SceneContract.commands(SceneContract.validate(dockScene,2),{actions:[{type:'draw'}]}));assert.throws(()=>SceneContract.commands(dockScene,{actions:[]}),e=>e.code==='SCENE_COMMAND_DENIED');assert.throws(()=>SceneContract.validate({...dockScene,actionDock:{script:[]}},2),e=>e.code==='SCENE_ACTION_DOCK_INVALID');
 assert.throws(()=>SceneContract.geometry({...scene,interactions:[{command:{type:'move'},kind:'execute',target:{zone:'field'}}]},2),e=>e.code==='SCENE_INTERACTION_INVALID');
});
test('scene contracts bound trusted renderer allocations before a guest can request a huge grid',()=>{
 const scene={contractVersion:1,id:'bounded',family:'board',players:[{player:0,metrics:[]},{player:1,metrics:[]}]};
 assert.doesNotThrow(()=>SceneContract.validate({...scene,columns:64,rows:64},2));
 const table={...scene,family:'card-table',tableLayout:{kind:'stock-discard'},stockCount:10,discardCount:1};assert.doesNotThrow(()=>SceneContract.validate(table,2));for(const flow of [{color:'url(https://example.org)'},{color:'red',direction:2}])assert.throws(()=>SceneContract.validate({...table,tableLayout:{...table.tableLayout,flow}},2),e=>e.code==='SCENE_TABLE_FLOW_INVALID');assert.throws(()=>SceneContract.validate({...table,family:'board'},2),e=>e.code==='SCENE_TABLE_LAYOUT_INVALID');
 for(const extra of [{columns:1e9,rows:1e9},{columns:-1},{rows:0.5},{geometry:{topology:'fixed',columns:65},zones:[],objects:[],interactions:[]},{cells:Array(4097).fill(null)},{arena:{size:64,board:[],players:[]}}])assert.throws(()=>SceneContract.validate({...scene,...extra},2),e=>e.code==='SCENE_LIMIT');
 const chain={...scene,family:'tile-chain',deck:'domino',chain:[{id:'a',a:1,b:2},{id:'b',a:2,b:3}],openingTileId:'a',chainPresentation:{label:'Chain',edge:'End'},placements:[]};assert.doesNotThrow(()=>SceneContract.validate(chain,2));for(const extra of [{chain:[...chain.chain,{id:'c',a:6,b:6}]},{chain:[chain.chain[0],chain.chain[0]]},{chain:Array(257).fill(chain.chain[0])}])assert.throws(()=>SceneContract.validate({...chain,...extra},2),e=>e.code==='SCENE_CHAIN_INVALID');assert.throws(()=>SceneContract.validate({...chain,openingTileId:'missing'},2),e=>e.code==='SCENE_CHAIN_ANCHOR_INVALID');
 assert.doesNotThrow(()=>SceneContract.validate({...scene,dice:[null,0,{value:6,held:true}]},2));for(const dice of [[{value:1001}],[{value:6,held:'yes'}],[{value:6,motion:'execute'}]])assert.throws(()=>SceneContract.validate({...scene,dice},2),e=>e.code==='SCENE_DIE_INVALID');assert.throws(()=>SceneContract.validate({...scene,dice:Array(33).fill(1)},2),e=>e.code==='SCENE_LIMIT');
});

test('cross-route validates bounded geometry, semantic materials and authorized pawn commands',()=>{
 const scene={contractVersion:1,id:'cross',family:'route-board',players:[0,1].map(player=>({player,metrics:[]})),routeStyle:'cross-and-circle',boardSides:['green','red','blue','yellow'],geometry:{topology:'route-grid',columns:15,rows:15,bases:[[0,0],[9,0],[9,9],[0,9]].map(([x,y],owner)=>({owner,x,y,width:6,height:6})),anchors:[{id:'base-0-0',point:[1.66,1.66]}]},routeCells:[{id:'path-0',point:[0,6],kind:'path',label:'Start',side:0,symbol:'arrow',rotation:0}],pawns:[{id:'token-0-0',owner:0,pawn:0,progress:-1,kind:'base',point:[1.66,1.66],anchor:'base-0-0',label:'Pawn',friendly:true}],moves:[],zones:[{id:'field',kind:'board'}],objects:[{ref:{namespace:'token',id:'0-0'},zone:'field',owner:0,point:[1.66,1.66]}],interactions:[]};
 assert.doesNotThrow(()=>SceneContract.validate(scene,2));assert.throws(()=>SceneContract.validate({...scene,boardSides:['green','red','blue','url(x)']},2),e=>e.code==='SCENE_CROSS_SIDES_INVALID');assert.throws(()=>SceneContract.validate({...scene,routeCells:[{...scene.routeCells[0],rotation:100}]},2),e=>e.code==='SCENE_CROSS_CELL_INVALID');assert.throws(()=>SceneContract.validate({...scene,geometry:{...scene.geometry,columns:1000000}},2),e=>e.code==='SCENE_CROSS_GEOMETRY_INVALID');const commandScene={...scene,pawns:[{...scene.pawns[0],command:{type:'move'}}]};assert.throws(()=>SceneContract.commands(commandScene,{actions:[]}),e=>e.code==='SCENE_COMMAND_DENIED');
});

test('folded chain preserves the original opening anchor and direction through both bends',()=>{
 const G=require('../core/game-components.js'),short=G.foldedChainLayout(1,0),folded=G.foldedChainLayout(7,3);
 assert.deepEqual(short.positions.map(p=>[p.row,p.column]),[[0,1],[0,2],[0,3]]);assert.equal(short.anchorRow,0);
 assert.deepEqual(folded.positions.map(p=>[p.row,p.column]),[[0,1],[0,0],[1,0],[1,1],[1,2],[1,3],[1,4],[2,4],[2,3]]);assert.equal(folded.rows,3);assert.equal(folded.anchorRow,1);assert(folded.path.includes('C-15'));assert(folded.path.includes('C515'));
 assert.equal(G.foldedChainOffset(1,3,600,52),222);assert.equal(G.foldedChainOffset(0,7,150,52),0);assert.throws(()=>G.foldedChainLayout(257,0));assert.throws(()=>G.foldedChainOffset(0,1,500,0));
});

test('timed draft validation receives the same explicit clock port as committed reducers',()=>{
 const m=new GameModel({contractVersion:1,id:'timed-draft',minPlayers:1,maxPlayers:1,create:()=>({playerCount:1,turn:0,status:'playing',winners:[],data:{selected:false}}),validate:p=>typeof p.data.selected==='boolean',actions:p=>[{visibility:'public',command:{type:p.data.selected?'commit':'select'}}],draft:()=>({mode:'sequence',select:['select'],commit:['commit'],count:2}),reduce:(p,a,c,ctx)=>{assert(Number.isSafeInteger(ctx.now));return {position:{...p,data:{selected:c.type==='select',lastTime:ctx.now}},events:[]};},advance:()=>null,project:p=>p.data,result:()=>({winners:[],places:[1],metrics:[{id:'points',values:[0]}]})});
 const p=m.create({playerCount:1,now:7}),command={type:'batch',actions:[{type:'select'},{type:'commit'}]};assert.doesNotThrow(()=>m.commandFor(p,0,command));assert.equal(p.data.selected,false);assert.equal(p.clock,7);const next=m.apply(p,0,command,{now:20}).position;assert.equal(next.revision,1);assert.equal(next.clock,20);assert.equal(next.data.lastTime,20);
});

test('numbered-route contracts bound physical geometry and authorize every authored move',()=>{
 const command={type:'move',dieIndex:0,delta:0},scene={contractVersion:1,id:'numbered',family:'route-board',columns:2,finish:4,routeStyle:'numbered-serpentine',players:[0,1].map(player=>({player,metrics:[]})),positions:[0,1].map(player=>({id:'token-'+player,player,cell:player,point:{x:25,y:75},value:player+1,label:'Pawn',swapRole:''})),moves:[{command,landing:2,route:[1,2]}],numberedRoute:{label:'Board',entrySlots:6,source:{entity:{namespace:'token',id:'0'}},cells:[1,2,3,4].map(cell=>({cell,label:String(cell)})),links:[{from:1,to:3,kind:'ladder'}],adjustment:{parameter:'delta',label:'Adjust',active:false,options:[{value:-1,label:'−1'},{value:1,label:'+1'}]},swapSummary:'',swapLabel:[]},geometry:{topology:'numbered-route',columns:2,rows:2},zones:[{id:'field',kind:'board'}],objects:[0,1].map(player=>({ref:{namespace:'token',id:String(player)},zone:'field',owner:player})),interactions:[]};
 assert.doesNotThrow(()=>SceneContract.commands(SceneContract.validate(scene,2),{actions:[command]}));assert.throws(()=>SceneContract.commands(scene,{actions:[]}),e=>e.code==='SCENE_COMMAND_DENIED');
 for(const extra of [{columns:1000},{finish:1},{positions:[...scene.positions,scene.positions[0]]}])assert.throws(()=>SceneContract.validate({...scene,...extra},2));
 for(const extra of [{cells:[scene.numberedRoute.cells[0],...scene.numberedRoute.cells.slice(0,3)]},{links:[{from:1,to:5,kind:'ladder'}]},{source:{entity:{namespace:'token',id:'9'}}},{adjustment:{...scene.numberedRoute.adjustment,options:Array(9).fill({value:1,label:'1'})}},{cells:scene.numberedRoute.cells.map(cell=>({...cell,special:{id:'effect',icon:'script',color:'#ffffff'}}))}])assert.throws(()=>SceneContract.validate({...scene,numberedRoute:{...scene.numberedRoute,...extra}},2));
});

test('category-sheet contracts preserve authored keys and validate summaries and exact commands',()=>{
 const roll={type:'roll'},score={type:'score',key:'twoPairs'},scene={contractVersion:1,id:'sheet',family:'score-table',players:[0,1].map(player=>({player,metrics:[]})),rows:[{id:'twoPairs',label:'Two pairs',cells:[0,1].map(player=>({player,value:null,preview:12,label:'Score',command:player===0?score:null}))}],scoreLayout:{kind:'category-sheet',categoryLabel:'Category',summaries:[{id:'upper',afterRow:'twoPairs',label:'Upper',values:[0,0]}],total:{id:'total',label:'Total',values:[0,0]},controls:{public:false,label:'Roll',command:roll}}};
 assert.doesNotThrow(()=>SceneContract.commands(SceneContract.validate(scene,2),{actions:[score,roll]}));assert.throws(()=>SceneContract.commands(scene,{actions:[score]}),e=>e.code==='SCENE_COMMAND_DENIED');
 assert.doesNotThrow(()=>SceneContract.validate({...scene,scoreLayout:{...scene.scoreLayout,total:{...scene.scoreLayout.total,values:[-10,0]}}},2));
 for(const rows of [[scene.rows[0],scene.rows[0]],[{...scene.rows[0],id:'<script>'}],[{...scene.rows[0],cells:[scene.rows[0].cells[0],scene.rows[0].cells[0]]}],[{...scene.rows[0],cells:scene.rows[0].cells.map(c=>({...c,preview:Infinity}))}]])assert.throws(()=>SceneContract.validate({...scene,rows},2));
 for(const extra of [{summaries:[{...scene.scoreLayout.summaries[0],afterRow:'missing'}]},{total:{...scene.scoreLayout.total,values:[0]}},{controls:{public:'yes',label:'Roll'}}])assert.throws(()=>SceneContract.validate({...scene,scoreLayout:{...scene.scoreLayout,...extra}},2));
});

test('paired trick tables bound public card slots and reject hidden or duplicate cards',()=>{
 const card=(id,rank=6)=>({id,rank,suit:'♥',label:'Six of hearts',help:'Public card'}),scene={contractVersion:1,id:'tricks',family:'card-table',players:[0,1].map(player=>({player,metrics:[]})),stockCount:24,discardCount:0,trump:card('trump'),table:[{attack:card('attack'),defense:null}],tableLayout:{kind:'paired-tricks',capacity:6,stockLabel:'Stock',discardLabel:'Discard',uncoveredLabel:'Uncovered',trumpLabel:'Trump'}};
 assert.doesNotThrow(()=>SceneContract.validate(scene,2));
 for(const extra of [{tableLayout:{...scene.tableLayout,capacity:1000000}},{table:[{attack:{hidden:true},defense:null}]},{table:[{attack:card('same'),defense:card('same',7)}]},{table:Array(7).fill(scene.table[0])},{trump:{...card('bad'),rank:Infinity}}])assert.throws(()=>SceneContract.validate({...scene,...extra},2));
});

test('collection and opponent choice contracts retain numeric ranks and exact commands',()=>{
 const players=[0,1].map(player=>({player,metrics:[]})),ask={type:'ask',cardId:'a',target:1},scene={contractVersion:1,id:'collections',family:'card-table',players,stockCount:4,tableLayout:{kind:'collected-sets',stockLabel:'Stock',rows:[{player:0,label:'Player1',cards:[{id:'set-a',rank:14}]},{player:1,label:'Player2',cards:[]}]},objects:[{ref:{namespace:'card',id:'a'},zone:'hand-0'}],playerChoices:{kind:'request',choices:[{player:1,source:{namespace:'card',id:'a'},command:ask,label:'Ask'}]}};
 assert.doesNotThrow(()=>SceneContract.commands(SceneContract.validate(scene,2),{actions:[ask]}));assert.throws(()=>SceneContract.commands(scene,{actions:[]}),e=>e.code==='SCENE_COMMAND_DENIED');
 for(const rows of [[scene.tableLayout.rows[0],scene.tableLayout.rows[0]],[{...scene.tableLayout.rows[0],cards:[{id:'a',rank:1000000}]},scene.tableLayout.rows[1]],[scene.tableLayout.rows[0],{...scene.tableLayout.rows[1],cards:[{id:'set-a',rank:2}]}]])assert.throws(()=>SceneContract.validate({...scene,tableLayout:{...scene.tableLayout,rows}},2));
 for(const playerChoices of [{kind:'execute',choices:[]},{kind:'cards',choices:[{player:1,index:1e9,command:ask,label:'No'}]},{kind:'request',choices:[{player:1,source:{namespace:'card',id:'missing'},command:ask,label:'No'}]}])assert.throws(()=>SceneContract.validate({...scene,playerChoices},2));
 const discard={contractVersion:1,id:'discard',family:'card-table',players,handInspection:true,discardCount:0,discard:[],tableLayout:{kind:'discard-pairs',discardLabel:'Pairs'}};assert.doesNotThrow(()=>SceneContract.validate(discard,2));assert.throws(()=>SceneContract.validate({...discard,discard:[{id:'secret',rank:12,suit:'♠',hidden:true}]},2));
});
