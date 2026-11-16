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
 assert.throws(()=>SceneContract.geometry({...scene,interactions:[{command:{type:'move'},kind:'execute',target:{zone:'field'}}]},2),e=>e.code==='SCENE_INTERACTION_INVALID');
});
test('scene contracts bound trusted renderer allocations before a guest can request a huge grid',()=>{
 const scene={contractVersion:1,id:'bounded',family:'board',players:[{player:0,metrics:[]},{player:1,metrics:[]}]};
 assert.doesNotThrow(()=>SceneContract.validate({...scene,columns:64,rows:64},2));
 for(const extra of [{columns:1e9,rows:1e9},{columns:-1},{rows:0.5},{geometry:{topology:'fixed',columns:65},zones:[],objects:[],interactions:[]},{cells:Array(4097).fill(null)},{arena:{size:64,board:[],players:[]}}])assert.throws(()=>SceneContract.validate({...scene,...extra},2),e=>e.code==='SCENE_LIMIT');
});
