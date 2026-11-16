'use strict';
const {StudioSession,serialized}=require('./runtime.cjs');
const {fail}=require('./project.cjs');
const {json}=require('./project.cjs');
const fs=require('node:fs'),path=require('node:path');
function expectations(position,expected,scenario,step){
 if(!expected||typeof expected!=='object'||Array.isArray(expected))fail('SDK_EXPECTATIONS_INVALID');
 for(const [key,value]of Object.entries(expected)){
  if(!/^[A-Za-z0-9_.-]{1,128}$/.test(key)||key.split('.').some(part=>['__proto__','constructor','prototype'].includes(part)))fail('SDK_EXPECTATIONS_INVALID');
  let actual=position;for(const part of key.split('.'))actual=actual&&Object.hasOwn(actual,part)?actual[part]:undefined;
  if(actual===undefined||serialized(actual)!==serialized(value))fail('SDK_SCENARIO_FAILED',{scenario,step,path:key,hint:'Inspect the expected and actual values locally; private values are not included in this report.'});
 }
}
// Fixed-seed scenarios are reproducible and do not substitute for authored
// assertions about game-specific rules or hidden information.
async function verify(directory,{shared,steps=20,seeds=[1,17],options={}}={}){
 if(!Number.isInteger(steps)||steps<1||steps>1000||!Array.isArray(seeds)||!seeds.length||seeds.length>32||seeds.some(n=>!Number.isSafeInteger(n)))fail('SDK_VERIFY_OPTIONS');
 const a=await StudioSession.open(directory,{shared});let b;
 try{
  b=await StudioSession.open(directory,{shared});let transitions=0;const scenarios=[];
  for(const seed of seeds){
   await a.start({...options,rng:seed});await b.start({...options,rng:seed});const commands=[];
   for(let i=0;i<steps;i++){
    if(serialized(a.position)!==serialized(b.position))fail('SDK_NONDETERMINISTIC',{seed,step:i});
    const views=new Map();for(let viewer=-1;viewer<a.position.playerCount;viewer++)views.set(viewer,await a.view(viewer));
    for(let viewer=a.position.playerCount-1;viewer>=-1;viewer--){const bv=await b.view(viewer);if(serialized(views.get(viewer))!==serialized(bv))fail('SDK_NONDETERMINISTIC',{seed,step:i,viewer,hint:'Projection or presentation depends on viewer call order or mutable state.'});}
    const checkpoint=await a.checkpoint();await b.restore(checkpoint);
    if(a.position.status==='finished'){await a.rules.call('result',a.position);await b.rules.call('result',b.position);break;}
    let actor=a.position.turn,actions=await a.rules.call('availableActions',a.position,actor);
    if(!actions.length){for(let player=0;player<a.position.playerCount;player++){const choices=await a.rules.call('availableActions',a.position,player);if(choices.length){actor=player;actions=choices;break;}}}
    if(!actions.length){scenarios.push({seed,stopped:'no-actions',step:i});break;}
    const bot=await a.rules.call('botAction',a.position,actor,{enabled:false});const command=bot||actions[(seed+i)%actions.length];commands.push({actor,command});
    await a.apply(actor,command);await b.apply(actor,command);transitions++;
   }
   scenarios.push({seed,commands:commands.length,status:a.position.status});
  }
  let authored=0;
  if(fs.existsSync(path.join(a.project.root,'sdk/scenarios.json'))){
   const fixture=json(a.project.root,'sdk/scenarios.json');
   if(fixture.contractVersion!==1||!Array.isArray(fixture.scenarios)||fixture.scenarios.length>100)fail('SDK_SCENARIOS_INVALID');
   for(const scenario of fixture.scenarios){
    if(typeof scenario.id!=='string'||!Array.isArray(scenario.steps)||scenario.steps.length>1000)fail('SDK_SCENARIOS_INVALID');await a.start(scenario.options||{});
    for(const [index,step]of scenario.steps.entries()){
     const before=serialized(a.position);let rejected=null;
     try{if(step.advance!==undefined)await a.advance(step.advance);else await a.apply(step.actor,step.command);}catch(error){rejected=error;}
     if(step.reject){if(!rejected||typeof step.reject==='string'&&rejected.code!==step.reject||serialized(a.position)!==before)fail('SDK_SCENARIO_FAILED',{scenario:scenario.id,step:index,hint:'Expected a rejected command without a state change.'});}
     else if(rejected)throw rejected;
     if(step.expect)expectations(a.position,step.expect,scenario.id,index);
     for(let viewer=-1;viewer<a.position.playerCount;viewer++)await a.view(viewer);
     if(a.position.status==='finished')await a.rules.call('result',a.position);
    }
    if(scenario.expect)expectations(a.position,scenario.expect,scenario.id,scenario.steps.length);if(a.position.status==='finished')await a.rules.call('result',a.position);authored++;
   }
  }
  return {status:'passed',pack:a.project.manifest.id,hash:a.project.hash,transitions,authoredScenarios:authored,scenarios,scope:['contract','determinism','viewer-rendering','viewer-order-independence','checkpoint','legal-bot-actions',...(authored?['authored-rule-assertions']:[])],notCovered:['exhaustive-rule-correctness','privacy-equivalence-fixtures','physical-device','production-isolation']};
 }finally{a.close();b?.close();}
}
async function privacy(directory,{shared,left,right,viewer}={}){
 if(!Number.isInteger(viewer))fail('SDK_PRIVACY_VIEWER_REQUIRED');
 if(serialized(left)===serialized(right))fail('SDK_PRIVACY_IDENTICAL_FIXTURE');
 const a=await StudioSession.open(directory,{shared});let b;
 try{b=await StudioSession.open(directory,{shared});for(const [session,position]of [[a,left],[b,right]]){await session.rules.call('validate',position);session.position=position;session.events=[];}
  const first=await a.view(viewer),second=await b.view(viewer),firstScore=await a.rules.call('score',left),secondScore=await b.rules.call('score',right),firstKnowledge=await a.rules.call('botKnowledge',left,viewer),secondKnowledge=await b.rules.call('botKnowledge',right,viewer);
  if(serialized(first)!==serialized(second)||serialized(firstScore)!==serialized(secondScore)||serialized(firstKnowledge)!==serialized(secondKnowledge))fail('SDK_PRIVACY_DIFFERENCE',{viewer,hint:'The paired fixture must differ only in data hidden from this viewer. Compare locally; values are not exported.'});
  return {status:'passed',viewer,scope:'authored-equivalent-states'};
 }finally{a.close();b?.close();}
}
module.exports={verify,privacy};
