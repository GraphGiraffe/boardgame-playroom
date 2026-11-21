'use strict';
const {StudioSession,serialized}=require('./runtime.cjs');
const {SDKError,fail,json}=require('./project.cjs');
const {soundCues}=require('../presentation/network-projection.js');
const standardSounds=require('../core/standard-sounds.js');
const {characterAssetFiles}=require('../core/game-components.js');
const {inventory:assetInventory}=require('./asset-method-trace.cjs');
const fs=require('node:fs'),path=require('node:path');
function expectations(position,expected,scenario,step){
 if(!expected||typeof expected!=='object'||Array.isArray(expected))fail('SDK_EXPECTATIONS_INVALID');
 for(const [key,value]of Object.entries(expected)){
  if(!/^[A-Za-z0-9_.-]{1,128}$/.test(key)||key.split('.').some(part=>['__proto__','constructor','prototype'].includes(part)))fail('SDK_EXPECTATIONS_INVALID');
  let actual=position;for(const part of key.split('.'))actual=actual&&Object.hasOwn(actual,part)?actual[part]:undefined;
  if(actual===undefined||serialized(actual)!==serialized(value))fail('SDK_SCENARIO_FAILED',{scenario,step,path:key,hint:'Inspect the expected and actual values locally; private values are not included in this report.'});
 }
}
function observeResources(project,metadata,metadataMethods,metadataPrintOverrides){
 const available=new Set(project.resourceAssets.map(asset=>asset.file)),sources=new Map(),scenarioAssets=new Set();
 const availableSets=new Set(project.resourceClosure.assetPacks.map(({manifest})=>manifest.id));
 const svgFiles=new Set(project.resourceAssets.filter(asset=>asset.mime==='image/svg+xml').map(asset=>asset.file));
 const catalog=metadata.catalog,sounds=metadata.sounds||{},soundIds=Object.keys(sounds);
 const declaredGraphics=new Set(Object.keys(catalog?.graphics||{})),scenarioGraphics=new Set(),selectedSounds=new Set(),phaseSounds=new Set();
 const hostSelected=new Set(),hostPhases=new Set(),unresolvedSelected=new Set(),unresolvedPhases=new Set();
 const interactions=new Set(),transfers=new Set(),reveals=new Set();
 const observedMethods=new Set(metadataMethods);
 const observedPrintOverrides=new Set(metadataPrintOverrides);
 const runs=[];
 let active;
 let routes=false,missingGraphics=0,dynamicGraphics=0;
 const sorted=values=>[...values].sort();
 function begin(identity){
  active={...identity,frames:0,viewers:new Set(),assets:new Set(),assetSets:new Set(),skinAssets:new Set(),graphics:new Set(),
   selected:new Set(),phases:new Set(),hostSelected:new Set(),hostPhases:new Set(),assetMethods:new Set(),assetPrintOverrides:new Set()};
  runs.push(active);
 }
 function observeMethods(methods,printOverrides){
  for(const method of methods){active.assetMethods.add(method);observedMethods.add(method);}
  for(const override of printOverrides){active.assetPrintOverrides.add(override);observedPrintOverrides.add(override);}
 }

 function visit(root,source,context,graphics=null){
  const followedGraphics=new Set();
  function inspect(value){
   if(!value||typeof value!=='object')return;
   const {kind,id}=value;
   if(kind==='asset'&&typeof id==='string'){
    // An unknown generated ID can contain viewer data. Name only the frame.
    if(!available.has(id))fail('SDK_RESOURCE_REFERENCE_MISSING',{...context,source,hint:'Inspect explicit asset references in this frame against the resolved pack resources.'});
    if(!sources.has(id))sources.set(id,new Set());
    sources.get(id).add(source);
    if(graphics){scenarioAssets.add(id);active.assets.add(id);}
    return;
   }
   if(graphics&&kind==='graphic'&&typeof id==='string'){
    if(followedGraphics.has(id))return;
    followedGraphics.add(id);
    if(!Object.hasOwn(graphics,id)){missingGraphics++;return;}
    // Report stable catalog names only. A per-view ID may include player data.
    if(declaredGraphics.has(id)){scenarioGraphics.add(id);active.graphics.add(id);}
    else dynamicGraphics++;
    inspect(graphics[id]);return;
   }
   for(const entry of Object.values(value))inspect(entry);
  }
  inspect(root);
 }
 visit(metadata,'metadata');

 function observeSound(id,source,context,graphics){
  const phase=source==='phase-sound';
  // Match audio playback precedence: a local declaration overrides a
  // standard cue with the same ID. Unknown IDs may be viewer-derived.
  if(!Object.hasOwn(sounds,id)){
   const known=Object.hasOwn(standardSounds,id);
   const destination=known?(phase?hostPhases:hostSelected):(phase?unresolvedPhases:unresolvedSelected);
   destination.add(id);
   if(known)(phase?active.hostPhases:active.hostSelected).add(id);
   return;
  }
  const seen=phase?phaseSounds:selectedSounds;
  const runSounds=phase?active.phases:active.selected;
  // A cue reused in another run still belongs to that run's resource closure.
  if(runSounds.has(id))return;
  runSounds.add(id);seen.add(id);visit(sounds[id]?.src,source,context,graphics);
 }
 function observeScene(scene,context,graphics){
  // A named set is evidence for the profile, not for a specific skin file.
  if(availableSets.has(scene.assetSet))active.assetSets.add(scene.assetSet);
  if(scene.memoryLayout?.kind==='paired-grid')for(const {card} of scene.cards||[]){
   if(!card||card.hidden||!card.character||['asset','graphic'].includes((card.asset||card.art)?.kind))continue;
   // Only authorized faces can participate. One run can offer more than one
   // skin file for this visual; the browser chooses the user's active variant.
   const files=characterAssetFiles(svgFiles,card.character);
   if(files?.minimal)active.skinAssets.add(files.minimal);
   if(files?.simple)active.skinAssets.add(files.simple);
  }
  for(const item of scene.interactions||[])if(item.kind)interactions.add(item.kind);
  for(const group of scene.plan?.groups||[])for(const cue of group.cues)
   if(cue?.kind==='sound')for(const id of cue.sounds)observeSound(id,'phase-sound',context,graphics);
 }
 function frame({scene,actions,events,support,projection},context){
  active.frames++;active.viewers.add(context.viewer);
  const graphics=support?.catalog?.graphics||catalog?.graphics||{};
  visit(support?.catalog,'catalog',context);
  visit(scene,'scene',context,graphics);
  visit(actions,'actions',context,graphics);
  visit(events,'events',context,graphics);
  observeScene(scene,context,graphics);
  for(const event of events){
   if(event.scene)observeScene(event.scene,context,graphics);
   if(['stock','table','hand'].includes(event.transfer?.from))transfers.add(event.transfer.from);
   if(['card','cards','dice'].includes(event.reveal?.kind))reveals.add(event.reveal.kind);
   if(event.presentation?.sequence)routes=true;
  }
  // Studio uses the same cue selection as the game screen. Audio execution
  // and implicit skin choices require a browser and are outside this report.
  const cues=soundCues(events.map(event=>event.finish?{...event,kind:'finish'}:event),
   {players:Array(projection.playerCount),winners:projection.winners,winner:projection.winners?.[0]??null},projection.viewer);
  for(const {id} of cues)observeSound(id,'sound',context,graphics);
 }
 function summary(){
  const observed=sorted(sources.keys());
  return {scope:'explicit-authorized-references',observed,scenarioAssets:sorted(scenarioAssets),
   notObservedInScenarios:sorted([...available].filter(id=>!scenarioAssets.has(id))),
   sources:Object.fromEntries(observed.map(id=>[id,sorted(sources.get(id))])),
   graphics:{declared:sorted(declaredGraphics),referenced:sorted(scenarioGraphics),unresolvedReferences:missingGraphics,dynamicReferences:dynamicGraphics},
   sounds:{declared:sorted(soundIds),selected:sorted(selectedSounds),phases:sorted(phaseSounds),
    host:{selected:sorted(hostSelected),phases:sorted(hostPhases)},
    unresolved:{selected:unresolvedSelected.size,phases:unresolvedPhases.size}},
   presentation:{offeredInteractions:sorted(interactions),transferSources:sorted(transfers),reveals:sorted(reveals),routes},
   assetMethods:{scope:'shared-presentation-classes',metadata:sorted(metadataMethods),
    printOverrides:{observed:sorted(observedPrintOverrides),metadata:sorted(metadataPrintOverrides)},
    profiles:assetInventory(project).map(({name,file,methods})=>({
     name,file,observed:methods.filter(method=>observedMethods.has(name+'.'+method)),
     notObserved:methods.filter(method=>!observedMethods.has(name+'.'+method))
    }))},
   runs:runs.map(({viewers,assets,assetSets,skinAssets,graphics,selected,phases,hostSelected,hostPhases,assetMethods,assetPrintOverrides,...run})=>({
    ...run,viewers:[...viewers].sort((a,b)=>a-b),assets:sorted(assets),assetSets:sorted(assetSets),skinAssets:sorted(skinAssets),graphics:sorted(graphics),
    assetMethods:sorted(assetMethods),...(assetPrintOverrides.size?{assetPrintOverrides:sorted(assetPrintOverrides)}:{}),
    sounds:{selected:sorted(selected),phases:sorted(phases),host:{selected:sorted(hostSelected),phases:sorted(hostPhases)}}
   }))};
 }
 return {begin,frame,observeMethods,summary};
}
// Fixed-seed scenarios are reproducible and do not substitute for authored
// assertions about game-specific rules or hidden information.
async function verify(directory,{shared,steps=20,seeds=[1,17],options={}}={}){
 if(!Number.isInteger(steps)||steps<1||steps>1000||!Array.isArray(seeds)||!seeds.length||seeds.length>32||seeds.some(n=>!Number.isSafeInteger(n)))fail('SDK_VERIFY_OPTIONS');
 const metadataMethods=new Set(),metadataPrintOverrides=new Set();
 let b,resourceUsage;
 // Compare the instrumented views with an untouched Studio session below.
 const a=await StudioSession.open(directory,{shared,onAssetMethods:(methods,printOverrides)=>{
  if(resourceUsage)resourceUsage.observeMethods(methods,printOverrides);
  else{
   for(const method of methods)metadataMethods.add(method);
   for(const override of printOverrides)metadataPrintOverrides.add(override);
  }
 }});
 try{
  b=await StudioSession.open(directory,{shared});const supportsBots=a.project.manifest.capabilities?.bots!==false;let transitions=0;const scenarios=[];
  resourceUsage=observeResources(a.project,await a.metadata(),metadataMethods,metadataPrintOverrides);
  for(const seed of seeds){
   resourceUsage.begin({seed});
   await a.start({...options,rng:seed});await b.start({...options,rng:seed});const commands=[];
   for(let i=0;i<steps;i++){
    if(serialized(a.position)!==serialized(b.position))fail('SDK_NONDETERMINISTIC',{seed,step:i});
    const views=new Map();
    for(let viewer=-1;viewer<a.position.playerCount;viewer++){
     const frame=await a.view(viewer);
     resourceUsage.frame(frame,{seed,step:i,viewer});views.set(viewer,frame);
    }
    for(let viewer=a.position.playerCount-1;viewer>=-1;viewer--){const bv=await b.view(viewer);if(serialized(views.get(viewer))!==serialized(bv))fail('SDK_NONDETERMINISTIC',{seed,step:i,viewer,hint:'Projection or presentation depends on viewer call order or mutable state.'});}
    const checkpoint=await a.checkpoint();await b.restore(checkpoint);
    if(a.position.status==='finished'){await a.rules.call('result',a.position);await b.rules.call('result',b.position);break;}
    let actor=a.position.turn,actions=await a.rules.call('availableActions',a.position,actor);
    if(!actions.length){for(let player=0;player<a.position.playerCount;player++){const choices=await a.rules.call('availableActions',a.position,player);if(choices.length){actor=player;actions=choices;break;}}}
    if(!actions.length){scenarios.push({seed,stopped:'no-actions',step:i});break;}
    const bot=supportsBots?await a.rules.call('botAction',a.position,actor,{enabled:false}):null;const command=bot||actions[(seed+i)%actions.length];commands.push({actor,command});
    await a.apply(actor,command);await b.apply(actor,command);transitions++;
    if(i===steps-1)for(let viewer=-1;viewer<a.position.playerCount;viewer++)
     resourceUsage.frame(await a.view(viewer),{seed,step:i+1,viewer});
   }
   scenarios.push({seed,commands:commands.length,status:a.position.status});
  }
  let authored=0;
  if(fs.existsSync(path.join(a.project.root,'sdk/scenarios.json'))){
   const fixture=json(a.project.root,'sdk/scenarios.json');
   if(fixture.contractVersion!==1||!Array.isArray(fixture.scenarios)||fixture.scenarios.length>100)fail('SDK_SCENARIOS_INVALID');
   for(const scenario of fixture.scenarios){
    if(typeof scenario.id!=='string'||!Array.isArray(scenario.steps)||scenario.steps.length>1000)fail('SDK_SCENARIOS_INVALID');await a.start(scenario.options||{});
    resourceUsage.begin({scenario:scenario.id});
    // Setup can be the only consumer of a resource, even in a zero-step fixture.
    for(let viewer=-1;viewer<a.position.playerCount;viewer++)
     resourceUsage.frame(await a.view(viewer),{scenario:scenario.id,step:-1,viewer});
    for(const [index,step]of scenario.steps.entries()){
     const before=serialized(a.position);let rejected=null;
     try{if(step.advance!==undefined)await a.advance(step.advance);else await a.apply(step.actor,step.command);}catch(error){rejected=error;}
     if(step.reject){if(!rejected||typeof step.reject==='string'&&rejected.code!==step.reject||serialized(a.position)!==before)fail('SDK_SCENARIO_FAILED',{scenario:scenario.id,step:index,hint:'Expected a rejected command without a state change.'});}
     else if(rejected instanceof SDKError)fail(rejected.code,{...rejected.diagnostic,scenario:scenario.id,step:index});
     else if(rejected)throw rejected;
     if(step.expect)expectations(a.position,step.expect,scenario.id,index);
     for(let viewer=-1;viewer<a.position.playerCount;viewer++){
      const frame=await a.view(viewer);
      resourceUsage.frame(frame,{scenario:scenario.id,step:index,viewer});
      if(viewer===-1&&step.expectPublic)expectations(frame.projection,step.expectPublic,scenario.id,index);
     }
     if(a.position.status==='finished')await a.rules.call('result',a.position);
    }
    if(scenario.expect)expectations(a.position,scenario.expect,scenario.id,scenario.steps.length);if(a.position.status==='finished')await a.rules.call('result',a.position);authored++;
   }
  }
  return {status:'passed',pack:a.project.manifest.id,hash:a.project.hash,transitions,authoredScenarios:authored,scenarios,resourceReferences:resourceUsage.summary(),scope:['contract','determinism','viewer-rendering','viewer-order-independence','checkpoint',supportsBots?'legal-bot-actions':'human-only-actions',...(authored?['authored-rule-assertions']:[])],notCovered:['exhaustive-rule-correctness','privacy-equivalence-fixtures','browser-layout-and-native-input','visual-parity-with-021','animation-audio-and-skins','physical-device','production-isolation']};
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
