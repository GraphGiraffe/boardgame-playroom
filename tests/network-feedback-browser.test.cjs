'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Engine=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
require('../packs/uno/rules.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
if(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR)fs.mkdirSync(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR,{recursive:true});
const compiledPacks={};require('node:vm').runInNewContext(read('installed-packs.js'),compiledPacks);
const unoBundle=compiledPacks.PlayroomInstalledPacks.find(bundle=>bundle.manifest.id==='uno');
const assets=bundle=>Object.fromEntries(Object.entries(bundle.files).filter(([name])=>name.startsWith('assets/')).map(([name,value])=>[name,value.startsWith('data:')?value:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(value)]));
const definition={assets:assets(unoBundle),manifest:unoBundle.manifest,view:unoBundle.files['view.js'],styles:unoBundle.files['styles.css'],rules:Engine.get('uno').rules,sounds:{'uno.call':{label:'UNO!',notes:[{at:0,duration:.2,frequency:440}]}}};
const seed=()=>new Session(Engine,'uno',{seed:23,mode:'pass',preset:'quick',unoMode:'manual',players:[{name:'Иван'},{name:'Джон'}]});
async function fixture(browser){
 if(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR,'browser.json'),JSON.stringify({browserType:browser.browserType().name(),version:browser.version()},null,2));
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
  await page.evaluate(()=>{const values=new Map();Object.defineProperty(window,'localStorage',{value:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)}});});
  for(const name of ['app/styles.css','core/game-components.css','core/ui.css','core/input.css','app/first-turn-guide.css','app/shared-views.css','app/game-interactions.css','app/design-system.css'])await page.addStyleTag({content:read(name)});
  for(const name of ['core/messages.js','presentation/localization.js','core/protocol.js','core/vector-art.js','core/component-assets.js','core/game-components.js','core/token-layout.js','core/ui.js','core/player-target.js','core/motion.js','presentation/plan-player.js','presentation/scheduler.js','core/game-flow.js','core/hand-overflow.js','core/size-tokens.js','platform/web/element-sizes.js','app/views.js','application/history-controller.js','application/game-screen-controller.js','platform/web/dom.js','app/game-screen.js','application/tutorial-controller.js','platform/web/guide-preferences.js','app/first-turn-guide.js','platform/web/action-reveal.js','presentation/event-plan.js','app/game-feedback.js','core/input.js','platform/web/pack-loader.js','app/shared-views.js'])await page.addScriptTag({content:name==='platform/web/action-reveal.js'&&process.env.PLAYROOM_ACTION_REVEAL_OVERRIDE?fs.readFileSync(process.env.PLAYROOM_ACTION_REVEAL_OVERRIDE,'utf8'):read(name)});
  await page.evaluate(()=>{PlayroomFirstTurnGuide.setEnabled('uno',false);PlayroomFirstTurnGuide.setEnabled('ludo',false);});
  return page;
}
test('network player popover keeps geometry and commits only explicit legal actions',{timeout:40000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);try{
    const s=seed(),authority=new Authority(s),owner=authority.connect(0);
    const snapshot=structuredClone(owner.snapshot());
    snapshot.actions=snapshot.actions.map(action=>action.type==='accuse-uno'?{...action,targetPrompt:'UNO!'}:action);
    await page.evaluate(({snapshot,definition})=>{
      window.qaAudio=[];window.qaSent=[];
      window.PlayroomAppBridge={profile:()=>({id:'default'}),audio:{registerPack(){},play(ids,pack){qaAudio.push({ids,pack});},stop(){}}};
      const listeners=new Set();window.qaClient={snapshot,pending:null,
        subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async send(action){qaSent.push(action);return {ok:true};},
        async history(){return snapshot;},close(){},emit(next){this.snapshot=next;for(const f of listeners)f(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:'combined'});qaGame.render();
    },{snapshot,definition});
    const shell=page.locator('.network-game');
    const target=shell.locator('[data-player-target="1"]');
    assert.equal(await target.count(),1);const box=await target.boundingBox();
    await target.locator('..').locator('.mini-hand').tap();assert.equal(await page.locator('.player-target-menu').count(),1);
    // The overlay covers this target: dispatch tests delegated toggle without waiting for auto-dismiss.
    await target.locator('..').locator('.mini-hand').dispatchEvent('click');assert.equal(await page.locator('.player-target-menu').count(),0,'whole player card toggles its menu');
    await target.tap();assert.equal(await page.locator('.player-target-menu').count(),1);
    assert.deepEqual(await target.boundingBox(),box,'Popover must not resize its panel');
    assert.equal(await page.evaluate(()=>qaSent.length),0);
    await target.dispatchEvent('click');assert.equal(await page.locator('.player-target-menu').count(),0);assert.equal(await page.evaluate(()=>qaSent.length),0);
    await target.tap();await page.locator('.player-target-menu button').tap();
    assert.deepEqual(await page.evaluate(()=>qaSent.map(a=>({type:a.type,target:a.target}))),[{type:'accuse-uno',target:1}]);
    assert.equal(await page.locator('.player-target-menu').count(),0);assert.equal(await page.locator('#modal-root .modal').count(),0);
    await target.tap();await page.keyboard.press('Escape');assert.equal(await page.locator('.player-target-menu').count(),0);assert.equal(await page.evaluate(()=>qaSent.length),1);
    await page.evaluate(()=>qaGame.destroy());
  }finally{await page.close();await browser.close();}
});
test('projected actions stay in status, cues play once; finish shows per-player results and history option',{timeout:40000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);try{
    const s=seed(),authority=new Authority(s),a=authority.connect(0),initial=a.snapshot();
    await page.evaluate(({initial,definition})=>{
      window.qaAudio=[];window.PlayroomAppBridge={profile:()=>({id:'default'}),audio:{registerPack(){},play(ids,pack){qaAudio.push({ids,pack});},stop(){}}};
      const listeners=new Set();window.qaClient={snapshot:initial,pending:null,
        subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async history(){return {...initial,kind:'history'};},
        async send(){return {ok:true};},emit(next){this.snapshot=next;for(const f of listeners)f(next);}};
      PlayroomFirstTurnGuide.setEnabled('uno',true);window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{});qaGame.render();
    },{initial,definition});
    await page.locator('.first-turn-guide:not([hidden]) .guide-caption').waitFor();
    const action=initial.actions.find(a=>a.type==='declare-uno');
    const receipt=a.dispatch(P.command(initial,action,'browser-uno-1'));
    assert.equal(receipt.ok,true);
    const projected=structuredClone(receipt.snapshot);
    const announced=projected.events.at(-1);
    assert.equal(announced.kind,'false-uno');
    announced.notice={title:'Иван: UNO! слишком рано',detail:'За ранний выкрик штрафа нет',tone:'warning'};
    await page.evaluate(next=>qaClient.emit(next),projected);
    await page.waitForFunction(()=>document.querySelector('.game-frame-event')?.textContent.includes('UNO'));
    assert.equal(await page.locator('.game-notice').count(),0,'Routine action never covers the hand');
    assert.match(await page.locator('.game-frame-event').innerText(),/UNO/);
    assert.deepEqual(await page.evaluate(()=>qaAudio),[{ids:['uno.call'],pack:'uno'}]);
    await page.evaluate(next=>qaClient.emit(next),projected);
    assert.equal(await page.evaluate(()=>qaAudio.length),1,'Duplicate snapshot must be silent');
    const finish=structuredClone(projected);
    finish.revision++;finish.state.status='finished';finish.state.winner=1;finish.state.winners=[1];finish.state.players[1].score=148;finish.state.scene.players.find(player=>(player.player??player.id)===1).metrics.find(metric=>metric.kind==='points').value=148;finish.state.move=finish.revision;
    finish.events.push({id:3,kind:'finish',player:1,text:'Джон побеждает'});finish.state.events=finish.events;
    finish.cues=[{id:'defeat',eventId:3}];
    await page.evaluate(next=>qaClient.emit(next),finish);
    const modal=page.locator('#modal-root>[data-surface-state=active] .modal');
    await modal.waitFor();
    assert.equal(await modal.count(),1,'Finish should open results automatically');
    assert.match(await modal.innerText(),/Поражение/);
    assert.match(await modal.innerText(),/Джон/);assert.match(await modal.innerText(),/148/);
    assert.deepEqual(await page.evaluate(()=>qaAudio.map(x=>x.ids[0])),['uno.call','defeat']);
    assert.equal(await modal.locator('[data-command=close-modal]').count(),0,'network results use the explicit return action');
    await page.evaluate(()=>qaGame.showResult());
    assert.equal(await page.evaluate(()=>qaAudio.length),2,'Reopening results is silent');
    await page.evaluate(next=>qaClient.emit(next),finish);
    assert.equal(await modal.count(),1,'Duplicate finish must not open another dialog');
    assert.equal(await page.evaluate(()=>qaAudio.length),2);
    await modal.locator('[data-command=result-replay]').click();
    await page.locator('.history-panel').waitFor();
    assert.equal(await page.locator('.network-game .scene [data-action]').count(),0,'Historical view is read-only');
    await page.locator('.game-frame-tools [data-command=history-close]').click();await page.locator('#modal-root>[data-surface-state=active] .result-modal').waitFor();assert.equal(await page.locator('.history-panel').count(),0);assert.equal(await page.evaluate(()=>qaAudio.length),2,'returning from results history stays silent');
    await page.evaluate(()=>qaGame.destroy());
  }finally{await page.close();await browser.close();}
});

test('network turn uses shared quick-play and pacing, animates a new revision once, and respects instant/reduced motion',{timeout:40000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);
  try{
    const session=seed(),authority=new Authority(session),owner=authority.connect(0),initial=owner.snapshot();
    await page.evaluate(({snapshot,definition})=>{
      window.qaOptions={animationSpeed:'fast',quickPlay:false};window.qaAnimations=[];
      window.PlayroomMotion={
        surface(){return this;},
        capture(context){qaAnimations.push({kind:'capture',context});return {captured:true};},
        play(_snapshot,opts){qaAnimations.push({kind:'play',duration:opts.duration,draws:opts.draws});return Promise.resolve();},
        cancel(){qaAnimations.push({kind:'cancel'});}
      };
      window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>qaOptions,audio:{registerPack(){},play(){},stop(){}}};
      // This synthetic permission checks only the renderer contract: the real
      // authority below still validates the actual legal draw command.
      const card=snapshot.state.scene.players[0].hand[0];
      const fakeActions=[...snapshot.actions,{type:'play',card:card.id}];
      const listeners=new Set();window.qaClient={snapshot:{...snapshot,actions:fakeActions},pending:null,
        subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
        async send(action){return {ok:true,action};},async history(){return snapshot;},
        emit(next){this.snapshot=next;for(const fn of listeners)fn(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition);qaGame.render();
    },{snapshot:initial,definition});
    assert.equal(await page.locator('.own-hand [data-action]').count(),0,'Two-step mode must not immediately play cards');
    await page.evaluate(()=>{qaOptions.quickPlay=true;dispatchEvent(new Event('playroom:game-options'));});
    assert(await page.locator('.own-hand [data-action]').count()>0,'Shared option enables immediate unambiguous card action');
    assert.equal(await page.locator('.network-game .scene').getAttribute('data-animation-speed'),'fast');
    const draw=initial.actions.find(action=>action.type==='draw');assert(draw,'Draw is legal in this fixture');
    const accepted=owner.dispatch(P.command(initial,draw,'game-flow-net-draw'));
    assert.equal(accepted.ok,true);
    await page.evaluate(next=>qaClient.emit(next),accepted.snapshot);
    await page.waitForFunction(()=>qaAnimations.filter(x=>x.kind==='play').length===1);
    assert.deepEqual(await page.evaluate(()=>qaAnimations.filter(x=>x.kind==='play').map(x=>x.duration)),[require('../core/game-flow.js').presets.fast.duration]);
    assert.equal(await page.evaluate(()=>qaAnimations.filter(x=>x.kind==='capture').length),1);
    await page.evaluate(next=>qaClient.emit(next),accepted.snapshot);
    assert.equal(await page.evaluate(()=>qaAnimations.filter(x=>x.kind==='play').length),1,'Duplicate ACK/snapshot must be silent');
    await page.evaluate(()=>{qaOptions.animationSpeed='instant';dispatchEvent(new Event('playroom:game-options'));});
    const artificial=structuredClone(accepted.snapshot);
    artificial.revision++;artificial.state.move=artificial.revision;
    artificial.events.push({id:(artificial.events.at(-1)?.id||0)+1,kind:'play',player:1,text:'Соперник ходит'});
    artificial.state.events=artificial.events;
    await page.evaluate(next=>qaClient.emit(next),artificial);
    assert.equal(await page.evaluate(()=>qaAnimations.filter(x=>x.kind==='play').length),1,'Instant tempo must disable future flights');
    assert.equal(await page.locator('.network-game .scene').getAttribute('data-animation-speed'),'instant');
    await page.evaluate(()=>qaGame.destroy());
  }finally{await page.close();await browser.close();}
});


test('rapid remote revisions queue every authorized frame including backfill; history autoplay uses the same motion route', {timeout:40000}, async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await fixture(browser);
  const session=seed(),authority=new Authority(session),owner=authority.connect(0),other=authority.connect(1),initial=owner.snapshot(),snapshots=[];
  try{
    for(const type of ['draw','pass','draw','pass']){const c=session.current.turn===0?owner:other;assert(c.dispatch(P.command(c.snapshot(),c.snapshot().actions.find(a=>a.type===type),'queue-'+snapshots.length)).ok);snapshots.push(owner.snapshot());}
    const history=Array.from({length:5},(_,i)=>owner.history(i)),hidden=session.current.data.hands[1][0].id;
    assert(!JSON.stringify(history).includes('"id":"'+hidden+'"'));
    await page.evaluate(({initial,history,definition})=>{
      window.qaFrames=[];window.qaReleases=[];window.qaSounds=[];window.qaHistory=[];window.qaCancel=0;window.qaSubmitted=[];
      window.PlayroomMotion={surface(){return this;},capture(context){return context;},play(shot,options){qaFrames.push({revision:Number(document.querySelector('.network-game').dataset.revision),type:shot.action.type,draws:options.draws});return new Promise(resolve=>qaReleases.push(resolve));},cancel(){qaCancel++;for(const done of qaReleases.splice(0))done();}};
      window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>({animationSpeed:'fast'}),audio:{registerPack(){},play(ids){qaSounds.push(...ids);},stop(){}}};
      const listeners=new Set();window.qaClient={snapshot:initial,pending:null,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async send(action){qaSubmitted.push(action);return {ok:true};},async history(index){qaHistory.push(index);return history[index];},emit(next){this.snapshot=next;for(const fn of listeners)fn(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition);qaGame.render();
    },{initial,history,definition});
    await page.evaluate(snapshots=>{qaClient.emit(snapshots[2]);qaClient.emit(snapshots[3]);},snapshots);
    for(let revision=1;revision<=4;revision++){
      await page.waitForFunction(n=>qaFrames.length===n,revision);assert.equal(await page.locator('.network-game').getAttribute('data-revision'),String(revision));
      assert.equal(await page.locator('.scene [data-action]:enabled').evaluateAll(nodes=>nodes.filter(node=>!['declare-uno','accuse-uno'].includes(JSON.parse(node.dataset.action).type)).length),0,'Only independent reactions remain usable during presentation');
      if(revision===1){await page.locator('.uno-call').click();assert.equal(await page.evaluate(()=>qaSubmitted.at(-1).type),'declare-uno');assert.equal(await page.evaluate(()=>qaFrames.length),1,'Reaction does not cancel the current animation');}
      assert.match(await page.locator('.game-frame-event').innerText(),new RegExp(history[revision].events.at(-1).text));
      await page.evaluate(()=>qaReleases.shift()());
    }
    await page.waitForFunction(()=>document.querySelector('.scene').getAttribute('aria-busy')==='false');
    assert.deepEqual(await page.evaluate(()=>qaFrames.map(f=>f.revision)),[1,2,3,4]);assert.deepEqual(await page.evaluate(()=>qaHistory),[1,2]);
    assert.equal(await page.evaluate(()=>qaCancel),0,'New packets do not cancel an active animation');
    assert.deepEqual(await page.evaluate(()=>qaSounds),['draw','pass','draw','pass']);
    await page.evaluate(next=>qaClient.emit(next),snapshots[3]);assert.equal(await page.evaluate(()=>qaFrames.length),4);
    await page.evaluate(()=>qaGame.openHistory(0));assert.equal(await page.locator('.network-game').getAttribute('data-mode'),'history',await page.locator('#toast').innerText());
    assert.equal(await page.locator('.game-frame-event').innerText(),'Начальная расстановка');assert.equal(await page.locator('.history-caption').count(),0);
    await page.locator('[data-command="replay-play"]').click();await page.waitForFunction(()=>qaFrames.length===5);
    assert.equal(await page.evaluate(()=>qaFrames[4].revision),1);assert.deepEqual(await page.evaluate(()=>qaSounds),['draw','pass','draw','pass'],'Explicit history stays silent');
    await page.locator('#replay-range').evaluate(el=>{el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>document.querySelector('#replay-range').value==='3'&&document.querySelector('.scene').getAttribute('aria-busy')==='false');
    assert.equal(await page.evaluate(()=>qaFrames.length),5,'Manual history scrub is immediate, without a new flight');
    await page.evaluate(()=>qaGame.destroy());
  }finally{authority.dispose();await page.close();await browser.close();}
});

test('owner history freezes the reaction window, resume acknowledges the new control revision, and live roster does not rewrite history', {timeout:40000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await fixture(browser);
  const authority=new Authority(seed()),initial=authority.connect(0).snapshot();
  try{
    await page.evaluate(({initial,definition})=>{
      initial=structuredClone(initial);delete initial.reactionWindows;initial.reactionWindow={id:'qa-window',owner:0,revision:0,humanMs:1000,botMs:3000,fallbackMs:10000,protected:true};
      window.qaAcks=[];window.qaCommands=[];window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>({animationSpeed:'instant'})};
      window.PlayroomNetworkLibrary={playerMetadata(_session,index){return index===0?{name:'Замена',replacement:{previousName:'Иван'}}:null;}};
      const history={...initial,kind:'history',actions:[],reactionWindow:null},listeners=new Set();
      window.qaClient={snapshot:initial,pending:null,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async history(){return history;},async presentationReady(snapshot){qaAcks.push(snapshot.controlRevision||0);return {ok:true};},
        async send(action){qaCommands.push(action);this.snapshot={...this.snapshot,paused:action.paused,controlRevision:(this.snapshot.controlRevision||0)+1};for(const fn of listeners)fn(this.snapshot);return {ok:true};}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition);qaGame.render();
    },{initial,definition});
    await page.waitForFunction(()=>qaAcks.length===1);assert.match(await page.locator('.layout-self .player-token').innerText(),/Замена/);
    await page.evaluate(()=>qaGame.openHistory(0));assert.equal(await page.evaluate(()=>qaClient.snapshot.paused),true);assert.match(await page.locator('.layout-self .player-token').innerText(),/Иван/);
    await page.locator('[data-command="history-close"]').click();await page.waitForFunction(()=>!qaGame.historyOpen&&!qaClient.snapshot.paused&&qaAcks.length===2);
    assert.deepEqual(await page.evaluate(()=>qaAcks),[0,2]);assert.deepEqual(await page.evaluate(()=>qaCommands.map(c=>c.paused)),[true,false]);
    await page.evaluate(()=>qaGame.setConnected(false));await page.evaluate(()=>qaGame.setConnected(true));await page.waitForFunction(()=>qaAcks.length===3);
    // Pause is a settings shortcut, not a permanently visible toolbar button.
    await page.evaluate(()=>{const shortcuts=document.createElement('div');shortcuts.className='settings-shortcuts';shortcuts.innerHTML=PlayroomGameScreen.quickAccessMarkup();document.querySelector('.network-game').append(shortcuts);});
    await page.locator('[data-command="pause"]').click();await page.waitForFunction(()=>qaClient.snapshot.paused);
    await page.evaluate(()=>qaGame.openHistory(0));await page.locator('[data-command="history-close"]').click();await page.waitForFunction(()=>!qaGame.historyOpen);
    assert.equal(await page.evaluate(()=>qaClient.snapshot.paused),true,'Closing history must preserve an existing manual pause');
    await page.evaluate(()=>qaGame.destroy());
  }finally{authority.dispose();await page.close();await browser.close();}
});

test('external modal closing restores projected legal actions without another network update',{timeout:30000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});const page=await fixture(browser);
 try{
  const a=new Authority(seed()),snapshot=a.connect(0).snapshot();
  await page.evaluate(({snapshot,definition})=>{
   window.sent=[];window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>({animationSpeed:'instant'})};
   window.client={snapshot,pending:null,subscribe(){return()=>{};},async send(a){sent.push(a);return {ok:true};}};
   document.querySelector('#modal-root').innerHTML='<div class="modal-backdrop"><section class="modal">Окно</section></div>';
   window.mount=PlayroomSharedViews.mount(client,definition);mount.render();
  },{snapshot,definition});
  assert.equal(await page.locator('.hand-card.is-playable').count(),0);
  await page.evaluate(()=>document.querySelector('#modal-root').replaceChildren());
  await page.waitForFunction(()=>document.querySelector('[data-action]:not(:disabled)'));
  await page.locator('[data-action]:not(:disabled)').first().click();
  await page.waitForFunction(()=>sent.length===1);
 }finally{await browser.close();}
});


test('Ludo selects a pawn without committing, keeps it after a destination, and consumes every die',{timeout:40000},async()=>{
  require('../packs/ludo/rules.js');
  const shared=path.join(path.dirname(fs.realpathSync(path.join(root,'packs'))),'shared');
  const installed={};require('node:vm').runInNewContext(read('installed-packs.js'),installed);
  const bundle=installed.PlayroomInstalledPacks.find(pack=>pack.manifest.id==='ludo');
  const definition={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],rules:Engine.get('ludo').rules,
    assets:Object.fromEntries(['die','round-token'].map(name=>['assets/shared/'+name+'.svg','data:image/svg+xml;base64,'+Buffer.from(bundle.files['assets/shared/'+name+'.svg']).toString('base64')]))};

  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);
  try{
    const session=new Session(Engine,'ludo',{seed:17,diceCount:3,sixReroll:'off',players:[{name:'Аня'},{name:'Борис'}]}),authority=new Authority(session),client=authority.connect(0),base=client.snapshot();
    let state=Engine.clone(session.current),revision=0;
    const snapshot=()=>{const projected=Engine.project(state,0);return {...base,revision,state:projected,events:projected.events,actions:Engine.legalActions(state,0)};};
    await page.exposeFunction('ludoCommit',a=>{state=Engine.applyAction(state,0,a);revision++;return snapshot();});
    await page.evaluate(({definition,snapshot})=>{
      window.qaSent=[];const listeners=new Set();
      window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>({quickPlay:true,animationSpeed:'instant'})};
      window.qaClient={snapshot,pending:null,subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async send(a){qaSent.push(a);const next=await ludoCommit(a);this.snapshot=next;for(const f of listeners)f(next);return {ok:true};},async history(){return this.snapshot;},close(){},emit(next){this.snapshot=next;for(const f of listeners)f(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:'combined'});qaGame.render();
    },{definition,snapshot:snapshot()});
    assert.equal(await page.locator('.shared-die.is-playable[data-action]').count(),3,'roll is visibly available on every active die');
    state.data.pawns=[[13,13,-1,-1],[0,0,-1,-1]];revision++;
    await page.evaluate(next=>qaClient.emit(next),snapshot());
    await page.waitForFunction(()=>document.querySelectorAll('.ludo-pawn.is-stacked').length===4);
    assert(await page.locator('.ludo-pawn.is-stacked').evaluateAll(pawns=>{
      if(pawns.length!==4)return false;
      const centers=pawns.map(pawn=>{const r=pawn.getBoundingClientRect();return `${Math.round(r.x+r.width/2)}:${Math.round(r.y+r.height/2)}`;});
      return new Set(centers).size===4&&new Set(pawns.map(pawn=>getComputedStyle(pawn).getPropertyValue('--pawn').trim())).size===2;
    }),'shared start shows distinct positions and both colors');
    // Two equal values share a destination; another die captures the enemy on cell 6.
    state.data.phase='move';state.data.dice=[2,2,3];state.data.used=[false,false,false];state.data.lastRoll=3;state.data.pawns=[[2,10,-1,-1],[44,-1,-1,-1]];
    revision++;await page.evaluate(next=>qaClient.emit(next),snapshot());
    const pawn=index=>page.locator(`[data-view-key="pawn"][data-view-value="0:${index}"]`);
    for(const index of [0,1,0])await pawn(index).tap();
    assert.equal(await page.evaluate(()=>qaSent.length),0,'switching pawns never commits');
    assert.equal(await page.locator('.ludo-target').count(),2,'duplicate dice share one destination');
    assert.equal(await page.locator('.target-capture').count(),1);
    assert.equal(await page.locator('.board-route-dot').count(),3);
    if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'ludo-targets-390.png')});}
    await page.locator('.target-move').tap();
    await page.waitForFunction(()=>document.querySelectorAll('.shared-die.used').length===1&&document.querySelector('.ludo-pawn.is-selected'));
    assert.equal(state.data.pawns[0][0],4);assert.equal(state.turn,0);
    assert.equal(await pawn(0).getAttribute('aria-pressed'),'true');
    await page.locator('.ludo-target[data-motion-anchor="path-6"]').tap();
    await page.waitForFunction(()=>document.querySelectorAll('.shared-die.used').length===2&&document.querySelector('.ludo-target'));
    assert.equal(state.data.pawns[0][0],6);
    await pawn(1).tap();await page.locator('.ludo-target').tap();
    await page.waitForFunction(()=>qaSent.length===3&&qaClient.snapshot.state.turn===1);
    assert.equal(state.data.pawns[0][1],13);assert.deepEqual(state.data.used,[true,true,true]);
    // Remount a legal capture / home fixture to verify targets underneath opponent pawns and the home lane.
    await page.evaluate(()=>qaGame.destroy());
    state.turn=0;state.data.phase='move';state.data.dice=[3,6,1];state.data.used=[false,false,false];state.data.pawns=[[2,-1,56,-1],[44,-1,-1,-1]];revision++;
    await page.evaluate(({definition,snapshot})=>{qaClient.snapshot=snapshot;qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:'combined'});qaGame.render();},{definition,snapshot:snapshot()});
    await pawn(0).tap();await page.locator('.ludo-pawn[data-entity="token-1-0"][data-action]').tap();
    await page.waitForFunction(()=>qaClient.snapshot.state.scene.pawns.find(p=>p.owner===1&&p.pawn===0).progress===-1);
    // The committed snapshot arrives before presentation unlocks the next action.
    await page.locator('.ludo-pawn[data-entity="token-0-1"][data-action]').waitFor({state:'visible'});
    await page.locator('.ludo-pawn[data-entity="token-0-1"]').tap();
    await page.waitForFunction(()=>qaClient.snapshot.state.scene.pawns.find(p=>p.owner===0&&p.pawn===1).progress===0&&document.querySelector('[data-view-value="0:2"]'));
    await pawn(2).tap();assert.equal(await page.locator('.target-home[data-motion-anchor="finish-0"]').count(),1);
    for(const [width,height]of [[320,640],[740,390]]){await page.setViewportSize({width,height});await page.evaluate(()=>qaGame.render());assert(await page.locator('.ludo-target').evaluate(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width-r.height)<1&&r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));}
    await page.locator('.target-home').tap();await page.waitForFunction(()=>qaClient.snapshot.state.scene.pawns.find(p=>p.owner===0&&p.pawn===2).progress===57);
    await page.evaluate(()=>qaGame.destroy());
  }finally{await page.close();await browser.close();}
});

 test('skip cue shakes only the affected card, respects reduced motion, expires and is not replayed',{timeout:20000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);try{
    await page.evaluate(()=>{
      document.querySelector('#app').innerHTML='<div class="table-shell"><article class="player-panel" data-player-index="0">A</article><article class="player-panel" data-player-index="1">B</article></div>';
      window.skipSounds=[];window.skipEvents=[{id:1,feedback:{kind:'skip',player:1}}];
      window.skipFeedback=new PlayroomGameFeedback({play:ids=>skipSounds.push(ids)});skipFeedback.start([]);
      skipFeedback.accept(skipEvents,[{eventId:1,id:'attack.skip'}],'uno',{duration:1});
    });
    assert.equal(await page.locator('.is-turn-skipped').getAttribute('data-player-index'),'1');
    assert.equal(await page.locator('.is-turn-skipped').evaluate(el=>getComputedStyle(el).animationName),'player-turn-skipped');
    assert.equal(await page.locator('.game-notice,.game-speech').count(),0,'skip has no layout-shifting message');
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.is-turn-skipped').evaluate(el=>getComputedStyle(el).animationName),'none');
    assert.notEqual(await page.locator('.is-turn-skipped').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
    await page.waitForFunction(()=>!document.querySelector('.is-turn-skipped'));
    await page.evaluate(()=>skipFeedback.accept(skipEvents,[{eventId:1,id:'attack.skip'}],'uno'));
    assert.deepEqual(await page.evaluate(()=>skipSounds),[['attack.skip']]);
    assert.equal(await page.locator('.is-turn-skipped').count(),0);
  }finally{await page.close();await browser.close();}
 });

 test('large reveals use the full field grid cell without stretching cards or dice',{timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await fixture(browser);
  try{
   await page.evaluate(definition=>{
    PlayroomPackLoader.execute(definition.view,{PlayroomMessages,PlayroomViews,PlayroomComponents:globalThis.PlayroomComponents,TabletopUI,PlayroomCatalog:{uno:definition.manifest},PlayroomPack:{id:'uno',version:definition.manifest.version,asset:path=>definition.assets?.[path]}});const style=document.createElement('style');style.textContent=definition.styles;document.head.append(style);
    const state={game:'uno',status:'playing',turn:0,move:0,players:[{name:'One'},{name:'Two'}],scene:{players:[0,1].map(player=>({player,handCount:0,metrics:[]}))}};
    const scene=TabletopUI.composeScene({api:3,family:'board',fieldSizing:'fit',elements:{field:'<div style="width:100%;height:100%">Board</div>'}},{state,viewer:0,actions:[]});document.querySelector('#app').innerHTML=PlayroomGameScreen.render({layoutId:'reveal-bounds',gameName:'Field',state,viewer:0,actions:[],scene});document.querySelector('.table-shell').style.height='600px';document.querySelector('.table-shell>.scene').style.height='500px';PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    window.fieldReveal=new PlayroomActionReveal();window.cardReveal={kind:'card',card:{id:'one',color:'red',value:'7'}};fieldReveal.show(cardReveal,'uno');
    window.revealMeasure=()=>{const host=document.querySelector('.action-reveal'),r=host.getBoundingClientRect(),b=PlayroomGameScreen.fieldBounds(document.querySelector('.table-shell')),slot=document.querySelector('.layout-field').getBoundingClientRect();return {host:r.toJSON(),bounds:b,slot:slot.toJSON(),card:host.querySelector('.action-reveal-art')?.getBoundingClientRect().width};};
   },definition);
   const before=await page.evaluate(()=>revealMeasure());const matches=v=>{assert(Math.abs(v.host.left-v.bounds.left)<1&&Math.abs(v.host.top-v.bounds.top)<1,JSON.stringify(v));assert(Math.abs(v.host.width-v.bounds.width)<1&&Math.abs(v.host.height-v.bounds.height)<1,JSON.stringify(v));};matches(before);assert(before.bounds.height>before.slot.height+10||before.bounds.width>before.slot.width+10,'available field grid is larger than its fitted square board: '+JSON.stringify(before));
   await page.setViewportSize({width:390,height:900});const expanded=await page.evaluate(()=>{document.querySelector('.table-shell').style.height='800px';document.querySelector('.table-shell>.scene').style.height='700px';PlayroomGameScreen.layoutScene(document.querySelector('#app'));fieldReveal.position();return revealMeasure();});matches(expanded);assert(expanded.host.height>before.host.height+100);assert(Math.abs(expanded.card-before.card)<1,'card size is independent of the larger field');
   const wrapped=await page.evaluate(()=>{
    document.querySelector('.table-shell').style.width='240px';document.querySelector('.table-shell>.scene').style.width='220px';PlayroomGameScreen.layoutScene(document.querySelector('#app'));fieldReveal.show({kind:'dice',dice:Array.from({length:5},()=>({value:6}))},'yatzy');
    const dice=[...document.querySelectorAll('.action-reveal-die')].map(n=>n.getBoundingClientRect().toJSON()),expected=Math.min(innerWidth*.14,64);fieldReveal.show({kind:'cards',cards:[{id:'a',color:'red',value:'7'},{id:'b',color:'blue',value:'3'}]},'uno');const cards=[...document.querySelector('.action-reveal-art').children].map(n=>n.getBoundingClientRect().toJSON()),cardExpected=(Math.min(innerWidth*.9,300)-8)/2,content=document.querySelector('.action-reveal-content'),host=document.querySelector('.action-reveal').getBoundingClientRect();return {dice,expected,cards,cardExpected,host:host.toJSON(),content:content.getBoundingClientRect().toJSON()};
   });
   assert(wrapped.dice.every(d=>Math.abs(d.width-wrapped.expected)<1),'dice keep their original viewport-based size');assert(new Set(wrapped.dice.map(d=>Math.round(d.top))).size>1,'dice wrap inside the field');assert(wrapped.cards.every(c=>Math.abs(c.width-wrapped.cardExpected)<1),'set cards keep their prior physical size');assert(wrapped.cards.every(c=>c.left>=wrapped.host.left-1&&c.right<=wrapped.host.right+1&&c.top>=wrapped.host.top-1&&c.bottom<=wrapped.host.bottom+1),'wrapped objects stay within the available field');await page.evaluate(()=>fieldReveal.clear());
   if(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR)fs.writeFileSync(path.join(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR,'field-reveals.json'),JSON.stringify({before,expanded,wrapped},null,2));
  }finally{await page.close();await browser.close();}
 });

 test('public card reveal pauses, flies to its destination and dice remain duplicated',{timeout:20000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);try{
    await page.evaluate(definition=>{
      PlayroomPackLoader.execute(definition.view,{PlayroomMessages,PlayroomViews,PlayroomComponents:globalThis.PlayroomComponents,TabletopUI,PlayroomCatalog:{uno:definition.manifest},PlayroomPack:{id:'uno',version:definition.manifest.version,asset:path=>definition.assets?.[path]}});
      const style=document.createElement('style');style.textContent=definition.styles;document.head.append(style);
      window.reveal={kind:'card',card:{id:'u1',color:'red',value:'7'},entity:{namespace:'card',id:'u1'}};
      document.querySelector('#app').innerHTML='<div class="table-shell"><div class="scene uno-scene" style="height:400px">'+PlayroomViews.reveal('uno',reveal)+'</div></div>';
      window.largeFeedback=new PlayroomGameFeedback();largeFeedback.start([]);largeFeedback.accept([{id:1,reveal}],[],'uno',{duration:1});
    },definition);
    assert.equal(await page.locator('.action-reveal .uno-card').count(),1);
    assert(await page.locator('.action-reveal .uno-card').evaluate(el=>el.getBoundingClientRect().width>120));
    assert.equal(await page.locator('.scene [data-reveal-active]').count(),1);
    assert.equal(await page.locator('.action-reveal [data-entity]').count(),0,'enlarged art cannot become a second playable card');
    assert.equal(await page.locator('.action-reveal [data-action]').count(),0);
    await page.evaluate(()=>PlayroomMotion.play({actor:0,viewer:0,action:{type:'play',card:'u1'},entities:new Map(),origin:{x:10,y:600,width:60,height:90},hands:new Map()},{duration:200}));
    assert.equal(await page.locator('.playroom-motion-piece').count(),0,'ordinary motion does not duplicate the enlarged card flight');
    assert.equal(await page.evaluate(()=>largeFeedback.active!==null),true);
    await page.waitForFunction(()=>document.querySelector('.action-reveal-art')?.getAnimations().length>0);
    const paused=await page.evaluate(async()=>{
      largeFeedback.player.pause();
      const animation=document.querySelector('.action-reveal-art').getAnimations()[0];
      await animation.ready;const before=animation.currentTime;
      await new Promise(resolve=>setTimeout(resolve,120));
      const result={before,after:animation.currentTime,state:animation.playState};
      largeFeedback.player.setRate(2);result.rate=animation.playbackRate;
      largeFeedback.player.resume();return result;
    });
    assert.equal(paused.state,'paused');assert.equal(paused.after,paused.before);assert.equal(paused.rate,2);
    await page.waitForFunction(()=>!document.querySelector('.action-reveal'));
    assert.equal(await page.locator('[data-reveal-active]').count(),0);
    assert.notEqual(await page.locator('.scene .uno-card').evaluate(el=>getComputedStyle(el).visibility),'hidden');
    await page.evaluate(()=>{
      largeFeedback.accept([{id:2,reveal:{kind:'dice',title:'Пара',dice:[{value:6},{value:6},{value:2,active:false},{value:3,active:false},{value:4,active:false}]}}],[],'yatzy',{duration:1});
    });
    assert.equal(await page.locator('.action-reveal-die').count(),5);assert.equal(await page.locator('.action-reveal-die.is-unused').count(),3);
    assert.equal(await page.locator('[data-reveal-active]').count(),0,'dice are copies, no source is hidden');
    assert.equal(await page.locator('.action-reveal-title').textContent(),'Пара');
    assert(await page.locator('.action-reveal').evaluate(el=>el.scrollWidth<=innerWidth));
    await page.evaluate(()=>largeFeedback.clear());assert.equal(await page.locator('.action-reveal').count(),0);
    await page.evaluate(()=>largeFeedback.accept([{id:3,reveal}],[],'uno',{silent:true}));
    assert.equal(await page.locator('.action-reveal').count(),0,'history/reconnect never creates a new reveal');
  }finally{await page.close();await browser.close();}
 });

test('Yatzy confirms category and zero score before player or public Table submission',{timeout:40000},async()=>{
 require('../packs/yatzy/rules.js');
 const bundle=compiledPacks.PlayroomInstalledPacks.find(pack=>pack.manifest.id==='yatzy');
 const definition={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],rules:Engine.get('yatzy').rules,assets:Object.fromEntries(['die'].map(name=>['assets/shared/'+name+'.svg','data:image/svg+xml;base64,'+Buffer.from(bundle.files['assets/shared/'+name+'.svg']).toString('base64')]))};
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const table of [false,true]){
  const page=await fixture(browser),session=new Session(Engine,'yatzy',{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Иван'},{name:'Луна'}]});session.act(0,{type:'roll'});
  const authority=new Authority(session),client=table?authority.connectTable([0,1]):authority.connect(0),initial=client.snapshot(),before=JSON.stringify(session.current);
  let sequence=0;await page.exposeFunction('scoreCommit',action=>{const receipt=client.dispatch(P.command(client.snapshot(),action,'qa-score-'+(++sequence)));return {receipt,snapshot:client.snapshot()};});
  await page.evaluate(({initial,definition,table})=>{
   const listeners=new Set();window.qaSent=[];window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>({animationSpeed:'instant',quickPlay:true})};
   window.qaClient={snapshot:initial,pending:null,subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async send(action){qaSent.push(action);const {receipt,snapshot}=await scoreCommit(action);this.emit(snapshot);return receipt;},emit(snapshot){this.snapshot=snapshot;for(const f of listeners)f(snapshot);},async history(){return this.snapshot;},close(){}};
   window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:table?'table':'combined'});qaGame.render();
  },{initial,definition,table});
  const category=page.locator('.yatzy-score button[data-action]').filter({hasText:/^0$/}).first();
  for(const cancel of [true,false]){
   await category.click();await page.locator('.modal [data-command="confirm-action"]').waitFor();assert.match(await page.locator('.modal h2').textContent(),/0 очков/);assert.equal(await page.locator('.modal .lead').textContent(),'Это завершит ход.');assert.equal(await page.evaluate(()=>qaSent.length),0);assert.equal(JSON.stringify(session.current),before);
   if(cancel)await page.locator('.modal [data-command="close-modal"]').last().click();
  }
  // A newer authoritative frame invalidates the pending choice.
  await page.evaluate(()=>{window.qaRetainedDice=[...document.querySelectorAll('.yatzy-dice .shared-die')].map(node=>({node,art:node.querySelector('svg')}));window.qaRetainedRows=[...document.querySelectorAll('.yatzy-score tr')];});
  session.act(0,{type:'hold',index:0});await page.evaluate(next=>qaClient.emit(next),client.snapshot());
  const retained=await page.evaluate(()=>({count:qaRetainedDice.length,current:document.querySelectorAll('.yatzy-dice .shared-die').length,items:qaRetainedDice.slice(1).map(({node,art},i)=>({node:node===document.querySelectorAll('.yatzy-dice .shared-die')[i+1],art:art===document.querySelectorAll('.yatzy-dice .shared-die')[i+1]?.querySelector('svg'),old:node.outerHTML.slice(0,320),next:document.querySelectorAll('.yatzy-dice .shared-die')[i+1]?.outerHTML.slice(0,320)}))}));assert.equal(retained.count,5,JSON.stringify({table,retained}));assert(retained.items.every(item=>item.node&&item.art),JSON.stringify({table,retained}));assert(await page.evaluate(()=>qaRetainedRows.every((row,i)=>row===document.querySelectorAll('.yatzy-score tr')[i])),'hold preserves category rows, headers and totals');await page.locator('.modal [data-command="confirm-action"]').click();assert.equal(await page.evaluate(()=>qaSent.length),0);
  await category.click();const chosen=JSON.parse(await category.getAttribute('data-action'));
  await page.locator('.modal [data-command="confirm-action"]').click();await page.waitForFunction(()=>qaSent.length===1);assert.equal(session.current.data.scores[0][chosen.key],0);assert.equal(session.current.move,3);
  await page.evaluate(()=>qaGame.destroy());await page.close();
 }}finally{await browser.close();}
});


test('semantic participant metrics hold the initial scene through feedback and restore on completion or cancellation',{timeout:15000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const page=await fixture(browser);
 try{
  await page.evaluate(()=>{
   const H=TabletopUI.helpers;
   window.metricMarkup=(committed=false)=>'<div class="table-shell"><div class="app-game-layout" data-turn-player="'+(committed?1:0)+'">'+Array.from({length:3},(_,index)=>'<section style="min-height:48px" class="player-panel '+(index===(committed?1:0)?'is-turn ':'')+(index===(committed?2:1)?'is-next':'')+'" data-player-index="'+index+'"'+(index===(committed?2:1)?' data-next-turn="true"':'')+'>'+(index===0?H.scoreBadge({id:'points',kind:'points',value:9,label:'Points'})+H.countBadge(5,'Cards',{hand:true}):'')+'</section>').join('')+'</div></div>';
   document.querySelector('#app').innerHTML=metricMarkup();
   window.metricFeedback=new PlayroomGameFeedback();
   window.metricAccept=id=>metricFeedback.accept([{id,feedback:{kind:'penalty',player:0}}],[],'uno',{mode:'fast',
    initialScene:{players:[{player:0,handCount:3,metrics:[{id:'points',kind:'points',value:2,label:'Points'}]}]},
    finalScene:{players:[{player:0,handCount:5,metrics:[{id:'points',kind:'points',value:9,label:'Points'}]}]}});
   metricAccept(1);
  });
  const metrics=()=>page.evaluate(()=>[document.querySelector('[data-score-id="points"]').textContent,document.querySelector('.piece-count.is-hand').dataset.pieceCount]);
  assert.deepEqual(await metrics(),['2','3']);
  await page.evaluate(()=>{document.querySelector('#app').innerHTML=metricMarkup(true);metricFeedback.refresh();});
  assert.deepEqual(await metrics(),['2','3'],'redraw must not reveal final counters early');
  const markers=()=>page.evaluate(()=>['is-turn','is-next'].map(flag=>[...document.querySelectorAll('.player-panel.'+flag)].map(p=>Number(p.dataset.playerIndex))));
  assert.deepEqual(await markers(),[[0],[1]],'redraw keeps both current and next player until presentation completes');
  await page.waitForFunction(()=>document.getAnimations().some(a=>a.id==='turn-handoff-incoming'));
  const handoff=await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('turn-handoff-')).map(a=>({id:a.id,actor:a.effect.target.dataset.playerIndex,scales:a.effect.getKeyframes().map(k=>Number(k.scale))})));assert.equal(handoff.length,2);assert(handoff.find(a=>a.id.endsWith('outgoing')).scales.includes(.96));assert(handoff.find(a=>a.id.endsWith('incoming')).scales.includes(1.07));
  await page.evaluate(()=>metricFeedback.player.pause());const paused=await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('turn-handoff-')).map(a=>({time:a.currentTime,state:a.playState})));assert(paused.every(a=>a.state==='paused'));await page.waitForTimeout(40);assert.deepEqual(await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('turn-handoff-')).map(a=>({time:a.currentTime,state:a.playState}))),paused);await page.evaluate(()=>{document.querySelector('#app').innerHTML=metricMarkup(true);metricFeedback.refresh();});await page.waitForFunction(()=>!document.getAnimations().some(a=>a.id.startsWith('turn-handoff-')));assert(await page.locator('#app .player-panel').evaluateAll(ns=>ns.every(n=>getComputedStyle(n).visibility!=='hidden')),'full replacement cancels the old-node animation without leaving masks');await page.evaluate(()=>metricFeedback.player.resume());
  await page.evaluate(()=>metricFeedback.whenIdle());assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('turn-handoff-')).length),0);assert.deepEqual(await metrics(),['9','5']);assert.deepEqual(await markers(),[[1],[2]],'both markers advance on the same completion boundary');
  await page.evaluate(()=>{metricAccept(2);metricFeedback.clear();});
  assert.deepEqual(await metrics(),['9','5'],'cancellation restores the committed DOM');assert.deepEqual(await markers(),[[1],[2]]);
  await page.evaluate(()=>{metricAccept(3);metricFeedback.player.skip();});
  assert.deepEqual(await metrics(),['9','5'],'skip restores committed counters without replaying queued cues');
  assert.deepEqual(await markers(),[[1],[2]],'skip restores both committed markers');
  assert.equal(await page.evaluate(()=>metricFeedback.active===null&&metricFeedback.queue.length===0),true);
  for(const [id,finish]of [[4,'clear'],[5,'skip']]){await page.evaluate(id=>{metricFeedback.clear();document.querySelector('#app').innerHTML=metricMarkup();metricAccept(id);document.querySelector('#app').innerHTML=metricMarkup(true);metricFeedback.refresh();},id);await page.waitForFunction(()=>document.getAnimations().some(a=>a.id==='turn-handoff-incoming'));await page.evaluate(finish=>finish==='clear'?metricFeedback.clear():metricFeedback.player.skip(),finish);assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('turn-handoff-')).length),0,'mid-handoff cancellation removes every animation');assert.deepEqual(await markers(),[[1],[2]]);}
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{metricFeedback.clear();document.querySelector('#app').innerHTML=metricMarkup();metricAccept(6);document.querySelector('#app').innerHTML=metricMarkup(true);metricFeedback.refresh();});await page.evaluate(()=>metricFeedback.whenIdle());assert.equal(await page.evaluate(()=>document.getAnimations().filter(a=>a.id.startsWith('turn-handoff-')).length),0);assert.deepEqual(await markers(),[[1],[2]]);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>metricFeedback.destroy());
  await page.addStyleTag({content:read('app/game-frame-021.css')});await page.evaluate(()=>{const panels=document.querySelectorAll('.player-panel');panels[1].classList.add('is-turn-preview-positive');panels[1].dataset.turnPreview='positive';panels[2].classList.add('is-turn-preview-negative');panels[2].dataset.turnPreview='negative';});
  const previewStyle=()=>page.locator('[data-turn-preview]').evaluateAll(ns=>ns.map(n=>({name:getComputedStyle(n).animationName,duration:getComputedStyle(n).animationDuration,border:getComputedStyle(n).borderColor})));const live=await previewStyle();assert.equal(live.length,2);assert(live.every(s=>s.name==='participant-turn-preview'&&s.duration==='1.2s'));assert.notEqual(live[0].border,live[1].border);await page.emulateMedia({reducedMotion:'reduce'});assert((await previewStyle()).every(s=>s.name==='none'));
 }finally{await page.close();await browser.close();}
});

test('departing public board objects survive commit until their effect and share cancellation and pause',{timeout:15000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const page=await fixture(browser);
 try{
  await page.evaluate(()=>{
   const ref=id=>({namespace:'piece',id});
   window.beforeScene={zones:[{id:'field',kind:'board'},{id:'hand',kind:'hand'}],objects:[{ref:ref('a'),zone:'field'},{ref:ref('b'),zone:'field'},{ref:ref('private'),zone:'hand'}]};
   window.afterScene={...beforeScene,objects:beforeScene.objects.filter(object=>object.ref.id!=='a')};
   window.installBoard=()=>document.querySelector('#app').innerHTML='<div class="table-shell"><div class="scene"><span data-entity="piece-a" style="display:block;width:30px;height:30px;background:red"></span><span data-entity="piece-b" style="display:block;width:30px;height:30px;background:blue"></span><div class="hand-track"><span data-entity="piece-private" style="display:block;width:30px;height:30px">secret</span></div></div></div>';
   window.departFeedback=new PlayroomGameFeedback();
   window.departAccept=id=>{
    installBoard();const snapshot=PlayroomMotion.capture({sceneModel:beforeScene});
    if(snapshot.entities.get('piece-private').departureClone)throw Error('private hand captured');
    document.querySelector('[data-entity="piece-a"]').remove();
    departFeedback.accept([{id,feedback:{kind:'capture',player:0}}],[],'fixture',{initialScene:beforeScene,finalScene:afterScene,snapshot,mode:'slow',defer:true});
    departFeedback.refresh();
   };
   departAccept(1);
  });
  assert.equal(await page.locator('[data-motion-kind="departure"]').count(),1,'only the removed physical object is retained');
  assert.equal(await page.locator('[data-motion-kind="departure"]').textContent(),'','private hand text is not retained');
  await page.evaluate(()=>departFeedback.next());
  await page.waitForFunction(()=>document.querySelector('[data-motion-kind="departure"]')?.getAnimations().length===1);
  await page.evaluate(()=>{departFeedback.player.pause();departFeedback.refresh();});
  assert.equal(await page.locator('[data-motion-kind="departure"]').count(),1,'redraw must not duplicate the departing object');
  assert.equal(await page.evaluate(()=>document.querySelector('[data-motion-kind="departure"]').getAnimations()[0].playState),'paused');
  await page.evaluate(()=>departFeedback.player.skip());
  assert.equal(await page.locator('[data-motion-kind="departure"]').count(),0);
  await page.evaluate(async()=>{departAccept(2);departFeedback.next();await departFeedback.whenIdle();});
  assert.equal(await page.locator('[data-motion-kind="departure"]').count(),0,'completion releases the retained public image');
  await page.evaluate(()=>{departAccept(3);departFeedback.clear();});
  assert.equal(await page.locator('[data-motion-kind="departure"]').count(),0,'cancel before playback also releases it');
  await page.evaluate(()=>departFeedback.destroy());
 }finally{await page.close();await browser.close();}
});

test('semantic field holds old artwork and withholds new objects before movement',{timeout:15000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const page=await fixture(browser);
 try{
  await page.evaluate(()=>{
   const registry=TabletopUI.createRegistry();
   registry.register('board-fixture',s=>({api:3,family:'board',elements:{field:`<div class="art">${s.scene.art}</div>${s.scene.objects.map(o=>`<span data-entity="piece-${o.ref.id}" style="display:block;width:30px;height:30px">${o.ref.id}</span>`).join('')}`,hand:'<div>current hand</div>'}}));
   const initial={audience:'public',art:'old floor',zones:[{id:'field',kind:'board'}],objects:[{ref:{namespace:'piece',id:'a'},zone:'field'}]};
   const final={...initial,art:'new floor',objects:[...initial.objects,{ref:{namespace:'piece',id:'b'},zone:'field'}]};
   window.drawField=()=>{document.querySelector('#app').innerHTML='<div class="table-shell"><div class="scene">'+registry.render({game:'board-fixture',scene:final},-1,[],{fieldScene:fieldFeedback.fieldScene})+'</div></div>';fieldFeedback.refresh();};
   window.fieldFeedback=new PlayroomGameFeedback({fieldChanged:drawField});
   fieldFeedback.accept([{id:1,feedback:{kind:'damage',player:0}}],[],'board-fixture',{initialScene:initial,finalScene:final,defer:true,motion:async()=>{window.measuredArtwork=document.querySelector('.art').textContent;}});
   drawField();
  });
  assert.equal(await page.locator('.art').textContent(),'old floor');assert.equal(await page.locator('[data-entity="piece-b"]').count(),0);
  assert.equal(await page.locator('[data-presentation-field][inert]').count(),1);
  await page.evaluate(()=>drawField());assert.equal(await page.locator('.art').textContent(),'old floor');
  await page.evaluate(async()=>{fieldFeedback.next();await fieldFeedback.whenIdle();});
  assert.equal(await page.locator('.art').textContent(),'new floor');assert.equal(await page.locator('[data-entity="piece-b"]').count(),1);
  assert.equal(await page.evaluate(()=>measuredArtwork),'new floor');assert.equal(await page.locator('[data-presentation-field]').count(),0);
  await page.evaluate(()=>{
   const initial={audience:'public',art:'held again',zones:[{id:'field',kind:'board'}],objects:[]};
   fieldFeedback.accept([{id:2,feedback:{kind:'damage',player:0}}],[],'board-fixture',{initialScene:initial,finalScene:initial,defer:true});drawField();
  });
  assert.equal(await page.locator('.art').textContent(),'held again');
  await page.evaluate(()=>fieldFeedback.clear());assert.equal(await page.locator('.art').textContent(),'new floor');
  await page.evaluate(()=>{
   window.checkpointArts=[];
   const first={audience:'public',art:'first checkpoint',zones:[{id:'field',kind:'board'}],objects:[]};
   const second={...first,art:'second checkpoint'};
   fieldFeedback.play=()=>checkpointArts.push(document.querySelector('.art').textContent);
   fieldFeedback.accept([{id:3,scene:first,feedback:{kind:'damage',player:0}},{id:4,scene:second,feedback:{kind:'damage',player:0}}],[{eventId:3,id:'first'},{eventId:4,id:'second'}],'board-fixture',{initialScene:{...first,art:'before checkpoints'},finalScene:second,defer:true});
   drawField();fieldFeedback.next();
  });
  await page.evaluate(()=>fieldFeedback.whenIdle());
  assert.deepEqual(await page.evaluate(()=>checkpointArts),['before checkpoints','first checkpoint'],'one command advances public field only after each owning event');
  assert.equal(await page.locator('.art').textContent(),'new floor','settle restores current authoritative field');
  await page.evaluate(()=>fieldFeedback.destroy());
 }finally{await page.close();await browser.close();}
});

test('field target measurement preserves artwork throughout paused movement and cancellation',{timeout:15000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const page=await fixture(browser);
 try{
  await page.evaluate(()=>{
   const registry=TabletopUI.createRegistry();
   registry.register('moving-board',s=>({api:3,family:'board',elements:{field:`<div class="art" style="position:relative;width:300px;height:100px">${s.scene.art}${s.scene.objects.filter(o=>o.zone==='field').map(o=>`<span data-entity="piece-${o.ref.id}" style="position:absolute;left:${s.scene.x}px;top:40px;width:30px;height:30px;background:red">${o.ref.id.toUpperCase()}</span>`).join('')}</div>`,hand:'<div>current hand</div>'}}));
   const initial={audience:'public',art:'old floor',x:10,zones:[{id:'field',kind:'board'}],objects:[{ref:{namespace:'piece',id:'a'},zone:'field'}]};
   const final={...initial,art:'new floor',x:210};
   const state={game:'moving-board',scene:final};
   window.targetDraw=()=>{document.querySelector('#app').innerHTML='<div class="table-shell"><div class="scene">'+registry.render(state,-1,[],{fieldScene:targetFeedback.fieldScene})+'</div></div>';targetFeedback.refresh();};
   window.targetFeedback=new PlayroomGameFeedback({fieldChanged:targetDraw});
   targetFeedback.renderField=scene=>registry.renderField(state,-1,scene);
   window.targetQueue=()=>{
    const middle={...initial,art:'middle floor',x:110};
    final.objects=initial.objects;
    const capture=scene=>{
     document.querySelector('#app').innerHTML='<div class="table-shell"><div class="scene">'+registry.render({...state,scene},-1,[])+'</div></div>';
     return PlayroomMotion.capture({sceneModel:scene});
    };
    const firstShot=capture(initial),secondShot=capture(middle);
    window.queueTargets=[];
    const move=shot=>context=>{queueTargets.push(document.querySelector('.art').textContent);return PlayroomMotion.play(shot,{duration:500,context});};
    targetFeedback.accept([{id:6,feedback:{kind:'damage',player:0}}],[],'moving-board',{initialScene:initial,finalScene:middle,snapshot:firstShot,defer:true,motion:move(firstShot)});
    targetFeedback.accept([{id:7,feedback:{kind:'damage',player:0}}],[],'moving-board',{initialScene:middle,finalScene:final,snapshot:secondShot,defer:true,motion:move(secondShot)});
    targetDraw();targetFeedback.next();
   };
   window.targetReplace=()=>{
    final.objects=[{ref:{namespace:'piece',id:'b'},zone:'field'},{ref:{namespace:'piece',id:'secret'},zone:'hand'}];
   };
   window.targetAccept=id=>{
    document.querySelector('#app').innerHTML='<div class="table-shell"><div class="scene">'+registry.render({...state,scene:initial},-1,[])+'</div></div>';
    const snapshot=PlayroomMotion.capture({sceneModel:initial});
    targetFeedback.accept([{id,feedback:{kind:'damage',player:0}}],[],'moving-board',{initialScene:initial,finalScene:final,snapshot,defer:true,motion:context=>PlayroomMotion.play(snapshot,{duration:800,context})});
    targetDraw();targetFeedback.next();
   };
   targetAccept(1);
  });
  await page.waitForFunction(()=>document.querySelector('.playroom-motion-flight'));
  await page.evaluate(()=>targetFeedback.player.pause());
  assert.equal(await page.locator('.art').textContent(),'old floorA','measurement must restore old artwork before a frame');
  assert.equal(await page.locator('.art [data-entity]').evaluate(el=>getComputedStyle(el).visibility),'hidden','only the moving original is hidden');
  assert.equal(await page.locator('.playroom-motion-flight').count(),1);
  await page.evaluate(()=>targetFeedback.player.resume());
  await page.evaluate(()=>targetFeedback.whenIdle());
  assert.equal(await page.locator('.art').textContent(),'new floorA');
  await page.evaluate(()=>targetAccept(2));
  await page.waitForFunction(()=>document.querySelector('.playroom-motion-flight'));
  await page.evaluate(()=>targetFeedback.clear());
  assert.equal(await page.locator('.art').textContent(),'new floorA');
  assert.equal(await page.locator('.playroom-motion-flight').count(),0);
  await page.evaluate(()=>targetAccept(3));
  await page.waitForFunction(()=>document.querySelector('.playroom-motion-flight'));
  await page.setViewportSize({width:410,height:740});
  await page.evaluate(()=>targetFeedback.whenIdle());
  assert.equal(await page.locator('.art').textContent(),'new floorA');
  assert.equal(await page.locator('.playroom-motion-flight').count(),0);
  assert.equal(await page.evaluate(()=>{
   const field=document.querySelector('.game-field-content'),node=field.firstChild;
   try{PlayroomMotion.withFieldTargets('<div>temporary</div>',()=>{throw Error('measurement failure');});}catch(error){return error.message==='measurement failure'&&field.firstChild===node;}
   return false;
  }),true,'failed measurement restores the exact original nodes');
  assert.equal(await page.evaluate(()=>{
   const field=document.querySelector('.game-field-content'),node=field.firstChild;
   const result=PlayroomMotion.withFieldTargets('<div data-motion-effect="flip">temporary</div>',()=>{throw Error('unsupported effect started');});
   return result===null&&field.firstChild===node;
  }),true,'special effects keep their live target adapter');
  await page.evaluate(()=>{targetReplace();targetAccept(4);});
  await page.waitForFunction(()=>document.querySelector('[data-motion-kind="arrival"]'));
  await page.evaluate(()=>targetFeedback.player.pause());
  assert.equal(await page.locator('.art').textContent(),'old floorA');
  assert.equal(await page.locator('.playroom-motion-flight[data-motion-kind="arrival"]').count(),1);
  assert.equal(await page.locator('.playroom-motion-flight[data-motion-kind="departure"]').count(),1);
  assert.equal(await page.locator('.playroom-motion-flight').count(),2,'private hand identity does not create a public flight');
  assert.equal(await page.locator('.art [data-entity]').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  await page.evaluate(()=>targetFeedback.player.resume());
  await page.evaluate(()=>targetFeedback.whenIdle());
  assert.equal(await page.locator('.art').textContent(),'new floorB');
  assert.equal(await page.locator('.playroom-motion-flight').count(),0);
  await page.evaluate(()=>targetAccept(5));
  await page.waitForFunction(()=>document.querySelector('[data-motion-kind="arrival"]'));
  await page.evaluate(()=>targetFeedback.player.skip());
  assert.equal(await page.locator('.art').textContent(),'new floorB');
  assert.equal(await page.locator('.playroom-motion-flight').count(),0);
  await page.evaluate(()=>targetQueue());
  await page.waitForFunction(()=>queueTargets.length===1&&document.querySelector('.playroom-motion-flight'));
  await page.evaluate(()=>targetFeedback.player.pause());
  assert.equal(await page.locator('.art').textContent(),'old floorA');
  assert.deepEqual(await page.evaluate(()=>queueTargets),['middle floorA']);
  await page.evaluate(()=>targetFeedback.player.resume());
  await page.waitForFunction(()=>queueTargets.length===2&&document.querySelector('.playroom-motion-flight'));
  await page.evaluate(()=>targetFeedback.player.pause());
  assert.equal(await page.locator('.art').textContent(),'middle floorA','second transition starts at its own scene');
  await page.evaluate(()=>targetFeedback.player.resume());
  await page.evaluate(()=>targetFeedback.whenIdle());
  assert.deepEqual(await page.evaluate(()=>queueTargets),['middle floorA','new floorA']);
  assert.equal(await page.locator('.art').textContent(),'new floorA');
  await page.evaluate(()=>targetFeedback.destroy());
 }finally{await page.close();await browser.close();}
});

test('empty UNO stock keeps one outer button and the same table geometry without a stock caption',{timeout:25000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await fixture(browser);
 try{const session=seed(),authority=new Authority(session),before=structuredClone(authority.connect(0).snapshot());before.state.scene.stockCount=1;const after=structuredClone(before);after.revision++;after.state.move=after.revision;after.state.scene.stockCount=0;after.events=[];
  await page.evaluate(({before,definition})=>{window.listeners=new Set();window.qaClient={snapshot:before,pending:null,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},history:async()=>before,send:async()=>({ok:true}),presentationReady:async()=>null};window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{onExit(){}});qaGame.render();},{before,definition});const a=await page.locator('.uno-discard').boundingBox();await page.evaluate(after=>{qaClient.snapshot=after;for(const fn of listeners)fn(after);},after);await page.locator('.stock-button [data-card-slot=stock]').waitFor();const b=await page.locator('.uno-discard').boundingBox();assert(Math.abs(a.x-b.x)<1&&Math.abs(a.y-b.y)<1);assert.equal(await page.locator('.stock-button button').count(),0);assert.equal(await page.locator('.uno-center>.stock-button').count(),1);assert(!/КОЛОДА/.test(await page.locator('.uno-play-area').innerText()));await page.screenshot({path:path.join(root,'../tmp_files/online-video-review-020/empty-stock.png')});
 }finally{await browser.close();}
});

test('opponent UNO +2 and +4 reveal from the opponent hand before the local penalty draw',{timeout:40000},async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const value of ['+2','+4']){let session,action;for(let seedValue=1;seedValue<500;seedValue++){const candidate=new Session(Engine,'uno',{seed:seedValue,mode:'pass',preset:'classic',unoMode:'auto',firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'Иван'},{name:'Бот'}]});const legal=Engine.legalActions(candidate.current,1).find(a=>a.type==='play'&&candidate.current.data.hands[1].find(c=>c.id===a.card)?.value===value);if(legal){session=candidate;action=legal;break;}}assert(session,'fixture must find '+value);const authority=new Authority(session),remote=authority.connect(1),local=authority.connect(0),before=structuredClone(local.snapshot());await remote.dispatch(P.command(remote.snapshot(),action,'qa-'+value.replace('+','plus')));const after=structuredClone(local.snapshot());assert(after.events.some(e=>e.reveal&&e.player===1));const page=await fixture(browser);
  await page.evaluate(({before,definition})=>{window.qaFlights=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('action-reveal-art'))qaFlights.push(frames);return original.call(this,frames,options);};window.listeners=new Set();window.qaClient={snapshot:before,pending:null,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},history:async()=>before,send:async()=>({ok:true}),presentationReady:async()=>null};window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{onExit(){}});qaGame.render();},{before,definition});await page.evaluate(after=>{qaClient.snapshot=after;for(const fn of listeners)fn(after);},after);await page.waitForFunction(()=>qaFlights.length>0);const transform=await page.evaluate(()=>qaFlights[0][0].transform);assert.match(transform,/translate\([^,]+,-[\d.]+px\)/,'card must start above reveal, at the opponent');await page.screenshot({path:path.join(process.env.PLAYROOM_FEEDBACK_EVIDENCE_DIR||path.join(root,'../tmp_files/online-video-review-020'),'opponent-'+value.replace('+','plus')+'.png')});await page.close();}
 }finally{await browser.close();}
});

test('UI audio 0.21 first native touch plays the first committed cue without a second action',{timeout:45000},async()=>{
 const {serveBrowserFixture}=require('./browser-origin.cjs'),engine=process.env.PLAYROOM_AUDIO_ENGINE||'chromium',server=await serveBrowserFixture(root),browser=await (engine==='webkit'?require('playwright-core').webkit.launch({headless:true}):chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']})),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 const net=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}})),out=path.resolve(process.env.PLAYROOM_AUDIO_OUT_DIR||path.join(root,'../tmp_files/ux-021/audio-first-gesture'));fs.mkdirSync(out,{recursive:true});
 await context.addInitScript(()=>{
  localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'audio-test',name:'Проверка',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:true,uiSounds:true,volume:.6,animationSpeed:'instant',tutorialsEnabled:false}));window.qaAudioTrace=[];window.qaAudioContexts=[];
  for(const type of ['pointerdown','pointerup','touchend','click','keydown'])document.addEventListener(type,event=>qaAudioTrace.push({kind:'gesture',type,trusted:event.isTrusted,active:navigator.userActivation?.isActive,at:performance.now()}),{capture:true,passive:true});
  const Native=window.AudioContext||window.webkitAudioContext;if(Native){const Observed=new Proxy(Native,{construct(target,args){const context=Reflect.construct(target,args,target);qaAudioContexts.push(context);qaAudioTrace.push({kind:'context',state:context.state,active:navigator.userActivation?.isActive,at:performance.now()});const resume=context.resume.bind(context);context.resume=()=>{qaAudioTrace.push({kind:'resume',state:context.state,active:navigator.userActivation?.isActive,at:performance.now()});return resume().then(value=>{qaAudioTrace.push({kind:'resumed',state:context.state,at:performance.now()});return value;});};const oscillator=context.createOscillator.bind(context);context.createOscillator=()=>{const source=oscillator(),start=source.start.bind(source);source.start=(...values)=>{qaAudioTrace.push({kind:'start',state:context.state,at:performance.now()});return start(...values);};return source;};return context;}});window.AudioContext=Observed;if(window.webkitAudioContext)window.webkitAudioContext=Observed;}
 });
 try{
  await page.goto(server.url);await page.locator('.game-tile').first().waitFor();assert.equal(await page.evaluate(()=>qaAudioContexts.length),0,'loading alone does not create an audio context');await page.evaluate(()=>PlayroomUIFeedback.emit('message',{id:'startup-message'}));await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);assert.equal(await page.evaluate(()=>qaAudioContexts.length),0,'an incoming cue before consent never creates a context or waits for a later tap');await page.evaluate(async()=>{PlayroomFirstTurnGuide.setEnabled('yatzy',false);const session=new TabletopSession(TabletopCore,'yatzy',{seed:17,players:[{name:'Первый'},{name:'Второй'}]}),authority=new SessionAuthority(session),viewer=session.current.turn,client=new PlayroomSessionClient(PlayroomLocalTransport(authority.connect(viewer)));await client.refresh();const mounted=PlayroomSharedViews.mount(client,PlayroomPacks.exportView('yatzy',session.packVersion),{surface:'combined'});mounted.render();window.qaFirstAudio={client,mounted,revision:client.snapshot.revision};const button=[...document.querySelectorAll('.scene [data-action]')].find(node=>JSON.parse(node.dataset.action).type==='roll');if(!button)throw Error('No legal first roll');button.setAttribute('data-audio-first','');});assert.equal(await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length),0,'mounting a scene never plays a startup sound');
  await page.locator('[data-audio-first]').tap();await page.waitForFunction(()=>qaFirstAudio.client.snapshot.revision>qaFirstAudio.revision);await page.waitForFunction(()=>qaAudioTrace.some(e=>e.kind==='start'),null,{timeout:3000});assert.equal(await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='gesture'&&e.type==='pointerdown').length),1,'exactly one trusted touch action was needed');
  await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);await page.evaluate(()=>{qaFirstAudio.mounted.destroy();PlayroomAppBridge.showHub();});
  await page.locator('[data-start=klondike]').first().tap();await page.locator('[data-game-mode=hotseat]').tap();await page.locator('.room-setup-modal [data-command=lobby-start]').waitFor();
  const beforeStart=await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length);await page.locator('.room-setup-modal [data-command=lobby-start]').tap();await page.waitForFunction(before=>qaAudioTrace.filter(e=>e.kind==='start').length===before+3,beforeStart);await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);
  const currentId=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().id);assert.equal(await page.evaluate(id=>PlayroomUIFeedback.emit('game.start',{id}),currentId),false,'same durable game start never plays twice');
  await page.evaluate(()=>PlayroomAppBridge.showSettings());const active=page.locator('#modal-root>[data-surface-state=active]');await active.locator('[data-settings-tab=effects],[data-settings-tab=effects]').click();const volume=active.locator('#setting-volume');await volume.focus();await volume.press('Home');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).sound),false);
  const muted=await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length);assert.equal(await page.evaluate(()=>PlayroomUIFeedback.emit('message',{id:'muted-message'})),false);assert.equal(await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length),muted);await volume.press('End');assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('playroom.settings.v1')).sound),true);
  await active.locator('#setting-ui-sounds').uncheck();assert.equal(await page.evaluate(()=>PlayroomUIFeedback.emit('friend.request',{id:'quiet-friend'})),false);await active.locator('#setting-ui-sounds').check();assert.equal(await page.evaluate(()=>PlayroomUIFeedback.emit('friend.request',{id:'quiet-friend'})),false,'muted UI notifications do not replay after re-enable');
  await page.evaluate(()=>PlayroomAppBridge.showHub());
  const beforeUpdate=await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length);await page.evaluate(()=>dispatchEvent(new Event('playroom-update-ready')));await page.waitForFunction(before=>qaAudioTrace.filter(e=>e.kind==='start').length===before+2,beforeUpdate);await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);await page.evaluate(()=>dispatchEvent(new Event('playroom-update-ready')));assert.equal(await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length),beforeUpdate+2,'update redisplay is silent');
   // Exercise the real notification poll/dispatch and native audio port. Only
   // the account/service/storage inputs are local; no provider or person is contacted.
   await page.evaluate(async()=>{
    window.qaNotificationAudio=[];
    window.qaAudioInbox={direct:[],groups:[],friends:[{id:'outgoing',userId:'outgoing',nickname:'Исходящая заявка',accepted:false,incoming:false}],directCursor:0,groupCursor:0,calls:[]};
    PlayroomChatNotifications.init({account:{snapshot:()=>({kind:'account',id:'native-audio-fixture'}),subscribe(){}},store:{read:()=> '0',write(){},readFriends:()=>({outgoing:'outgoing'}),writeFriends(){}},service:{call:async action=>{
     qaAudioInbox.calls.push(action);
     if(action==='unread')return {chats:[],friends:qaAudioInbox.friends};
     if(action==='inbox')return {cursor:String(++qaAudioInbox.directCursor),items:qaAudioInbox.direct.splice(0)};
     if(action==='group-inbox')return {cursor:String(++qaAudioInbox.groupCursor),items:qaAudioInbox.groups.splice(0)};
     return {messages:[]};
    }}});
    await PlayroomChatNotifications.poll();
   });
   async function notificationAudio(label,packet,notes){
    await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);
    await page.waitForTimeout(280); // Real semantic-cue cooldown, not a fake audio clock.
    const before=await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length);
    await page.evaluate(async packet=>{
     const peer={userId:'audio-peer',id:'audio-peer',nickname:'Локальный собеседник',avatar:null};
     if(packet.channel==='friend')qaAudioInbox.friends=packet.friends;
     else{const item={person:peer,at:new Date().toISOString(),...packet.item};qaAudioInbox[packet.channel].push(item);}
     await PlayroomChatNotifications.poll();
    },packet);
    if(notes)await page.waitForFunction(({before,notes})=>qaAudioTrace.filter(e=>e.kind==='start').length===before+notes,{before,notes});
    await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);
    assert.equal(await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length),before+notes,label);
    await page.evaluate(value=>qaNotificationAudio.push(value),{label,notes});
   }
   await notificationAudio('incoming direct message',{channel:'direct',item:{id:'audio-dm-1',kind:'message',body:'Входящее сообщение'}},2);
   assert(await page.locator('[data-chat-notifications]').innerText().then(text=>text.includes('Входящее сообщение')),'the real message banner is mounted');
   await notificationAudio('duplicate direct message is silent',{channel:'direct',item:{id:'audio-dm-1',kind:'message',body:'Входящее сообщение'}},0);
   await notificationAudio('incoming direct invitation',{channel:'direct',item:{id:'audio-invite-1',kind:'invitation',invitationState:'active',gameName:'Домино',body:'Приглашение в комнату'}},3);
   await notificationAudio('expired invitation is silent',{channel:'direct',item:{id:'audio-expired-1',kind:'invitation',invitationState:'expired',body:'Истекшее приглашение'}},0);
   await notificationAudio('incoming reaction',{channel:'direct',item:{id:'audio-reaction-1',kind:'message',body:':nice:'}},1);
   await notificationAudio('incoming group message',{channel:'groups',item:{id:'audio-group-1',kind:'message',group:{id:'audio-group',name:'Локальная группа'},body:'Сообщение в группе'}},2);
   await notificationAudio('incoming group invitation',{channel:'groups',item:{id:'audio-group-invite-1',kind:'group-invitation',group:{id:'audio-group',name:'Локальная группа'},invitationState:'active',body:'Локальная группа'}},3);
   const outgoing={id:'outgoing',userId:'outgoing',nickname:'Исходящая заявка',accepted:false,incoming:false},incoming={id:'incoming',userId:'incoming',nickname:'Новая заявка',accepted:false,incoming:true};
   await notificationAudio('incoming friend request',{channel:'friend',friends:[outgoing,incoming]},2);
   await notificationAudio('outgoing friend request accepted',{channel:'friend',friends:[{...outgoing,accepted:true},incoming]},2);
   // Native audio through existing connection and foreground Push-message routes.
   // Local ports supply state; no subscription, permission request or provider send.
   await page.evaluate(()=>{
    window.qaRouteAudio=[];window.qaRouteTrace=[];window.qaRouteEmits=[];
    const feedback=PlayroomUIFeedback;window.PlayroomUIFeedback={...feedback,emit:(type,options)=>{const before=PlayroomAppBridge.audio.busy,result=feedback.emit(type,options);qaRouteEmits.push({type,options,before,result,visible:!document.hidden,focused:document.hasFocus()});return result;}};
    window.qaOriginalIce=PlayroomIceConfig;window.PlayroomIceConfig={...PlayroomIceConfig,trace:(...args)=>qaRouteTrace.push(args)};
    window.qaOriginalPushDevice=PlayroomPushDevice;window.PlayroomPushDevice={...PlayroomPushDevice,supported:()=>false};
    window.qaOriginalCloudNetwork=PlayroomCloudNetwork;window.PlayroomCloudNetwork={...PlayroomCloudNetwork,roomId:()=> 'audio-room'};
    PlayroomPushUI.init({account:{snapshot:()=>({kind:'account',id:'audio-recipient'}),subscribe(){}},remote:{call:async()=>{throw Error('No Push provider calls expected');}}});
   });
   async function routeAudio(label,packet,notes){
    await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);await page.waitForTimeout(280);
    const before=await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length);
    await page.evaluate(value=>{window.qaRoutePending=value;},{label,before,notes});
    await page.evaluate(async packet=>{
     if(packet.kind==='connection'){
      const attempt=PlayroomConnectionProgress.create();
      if(packet.stage==='connected')await attempt.connected({pc:{getStats:async()=>new Map()}});
      else if(packet.stage==='failed')attempt.fail({code:'connection-timeout'});
      else attempt.cancel();
     }else{
      const payload={recipient:'audio-recipient',type:'room',id:'audio-room',title:'Локальный сигнал',body:'Проверка маршрута',...packet.payload};
      const channel=new MessageChannel();
      window.qaRouteAck=await new Promise(resolve=>{channel.port1.onmessage=event=>{channel.port1.close();channel.port2.close();resolve(event.data.handled);};navigator.serviceWorker.dispatchEvent(new MessageEvent('message',{data:{kind:'playroom-push-visible',payload},ports:[channel.port2]}));});
     }
    },packet);
    if(packet.kind==='push')assert.equal(await page.evaluate(()=>qaRouteAck),packet.payload.recipient!=='other'&&packet.payload.id!=='other-room',label+' foreground ACK');
    if(notes)await page.waitForFunction(({before,notes})=>qaAudioTrace.filter(e=>e.kind==='start').length===before+notes,{before,notes});
    await page.waitForFunction(()=>!PlayroomAppBridge.audio.busy);
    assert.equal(await page.evaluate(()=>qaAudioTrace.filter(e=>e.kind==='start').length),before+notes,label);
    await page.evaluate(value=>qaRouteAudio.push(value),{label,notes});
   }
   await routeAudio('connection accepted',{kind:'connection',stage:'connected'},2);
   await routeAudio('connection failed',{kind:'connection',stage:'failed'},2);
   await routeAudio('connection cancelled is silent',{kind:'connection',stage:'cancelled'},0);
   for(const [activity,notes] of [['offer',3],['accepted',2],['declined',2],['complete',3]])await routeAudio('foreground host transfer '+activity,{kind:'push',payload:{activity:'host-transfer-'+activity,transferId:'audio-transfer-'+activity}},notes);
   await routeAudio('duplicate host transfer is silent',{kind:'push',payload:{activity:'host-transfer-offer',transferId:'audio-transfer-offer'}},0);
   await routeAudio('other recipient is silent',{kind:'push',payload:{activity:'host-transfer-offer',transferId:'audio-other-recipient',recipient:'other'}},0);
   await routeAudio('other room is silent',{kind:'push',payload:{activity:'host-transfer-offer',transferId:'audio-other-room',id:'other-room'}},0);
   fs.writeFileSync(path.join(out,engine+'-routes.json'),JSON.stringify(await page.evaluate(()=>({cases:qaRouteAudio,trace:qaRouteTrace,contextStates:qaAudioContexts.map(context=>context.state)})),null,2));
   await page.evaluate(()=>{window.PlayroomIceConfig=qaOriginalIce;window.PlayroomPushDevice=qaOriginalPushDevice;window.PlayroomCloudNetwork=qaOriginalCloudNetwork;});
   fs.writeFileSync(path.join(out,engine+'-notifications.json'),JSON.stringify(await page.evaluate(()=>({cases:qaNotificationAudio,calls:qaAudioInbox.calls,contextStates:qaAudioContexts.map(context=>context.state)})),null,2));
   assert.deepEqual(errors,[]);assert.equal(net.nativeSupabaseRequests,0);
 }finally{fs.writeFileSync(path.join(out,engine+'-trace.json'),JSON.stringify({engine,browserType:browser.browserType().name(),browserVersion:browser.version(),routeDiagnostic:await page.evaluate(()=>({cases:window.qaRouteAudio,pending:window.qaRoutePending,emits:window.qaRouteEmits})).catch(()=>null),events:await page.evaluate(()=>qaAudioTrace).catch(()=>[]),contexts:await page.evaluate(()=>qaAudioContexts.map(c=>({state:c.state,currentTime:c.currentTime}))).catch(()=>[]),errors,nativeSupabaseRequests:net.nativeSupabaseRequests},null,2));await context.close();await browser.close();await server.close();}
});

test('Pexeso retained slots flip and close mismatches without replacing untouched public positions',{timeout:45000},async()=>{
 require('../packs/pexeso/rules.js');
 const bundle=compiledPacks.PlayroomInstalledPacks.find(pack=>pack.manifest.id==='pexeso'),definition={manifest:bundle.manifest,view:bundle.files['view.js'],styles:bundle.files['styles.css'],rules:Engine.get('pexeso').rules,assets:assets(bundle)};
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const deck of ['cartoon','52']){
  const page=await fixture(browser),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const session=new Session(Engine,'pexeso',{seed:17,preset:'easy',deck,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]}),authority=new Authority(session),client=authority.connect(0);
  const first=session.current.data.board[0],second=session.current.data.board.findIndex(c=>deck==='52'?c.rank!==first.rank:c.character!==first.character||c.shape!==first.shape||c.color!==first.color);assert(second>0);
  let sequence=0;await page.exposeFunction('pexesoCommit',action=>{const receipt=client.dispatch(P.command(client.snapshot(),action,'pexeso-'+(++sequence)));assert(receipt.ok);return {receipt,snapshot:client.snapshot()};});
  await page.evaluate(({definition,initial})=>{
   window.qaSent=[];window.PlayroomAppBridge={profile:()=>({id:'default'}),gameOptions:()=>({animationSpeed:'fast',quickPlay:true})};PlayroomFirstTurnGuide.setEnabled('pexeso',false);
   const listeners=new Set();window.qaClient={snapshot:initial,pending:null,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async send(action){qaSent.push(action);const {receipt,snapshot}=await pexesoCommit(action);this.snapshot=snapshot;for(const fn of listeners)fn(snapshot);return receipt;},async history(){return this.snapshot;},close(){}};
   window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:'combined'});qaGame.render();window.qaSlots=[...document.querySelectorAll('.pexeso-slot')];window.qaSlotArt=qaSlots.map(slot=>slot.querySelector('svg'));
  },{definition,initial:client.snapshot()});
  for(const index of [0,second]){
   await page.locator(`.pexeso-slot[data-motion-value="${index}"] [data-action]`).click();await page.locator('[data-motion-kind="flip"]').first().waitFor();await page.locator('[data-motion-kind="flip"]').first().waitFor({state:'detached'});await page.locator('.network-game>.scene[aria-busy="false"]').waitFor();
   assert(await page.evaluate(()=>qaSlots.every((slot,i)=>slot===document.querySelectorAll('.pexeso-slot')[i])),'public position roots survive flip, permission changes and mismatch closing');const artChanges=await page.evaluate(skip=>qaSlotArt.flatMap((art,i)=>{const now=document.querySelectorAll('.pexeso-slot')[i].querySelector('svg');return skip.includes(i)||art===now?[]:[{index:i,old:art?.outerHTML.slice(0,650),next:now?.outerHTML.slice(0,650),oldParent:art?.parentElement?.outerHTML.slice(0,350),newParent:now?.parentElement?.outerHTML.slice(0,350)}];}),[0,second]);assert.deepEqual(artChanges,[],'unrevealed SVG artwork survives both flip sequences');
  }
  assert.equal(session.current.data.phase,'reveal');assert.equal(session.current.turn,1);assert.equal(await page.locator('.pexeso-slot .shared-card-back').count(),session.current.data.board.length,'mismatch is closed after its animation');assert.equal(await page.locator('.pexeso-slot [data-action]').count(),0,'previous player cannot flip during the next turn');assert.equal(await page.evaluate(()=>qaSent.length),2);assert.deepEqual(errors,[]);
  await page.evaluate(()=>qaGame.destroy());await page.close();
 }}finally{await browser.close();}
});

test('UNO next player stays blue for owner, remote opponent and public Table after local reconstruction',{timeout:30000},async()=>{
 const Projection=require('../presentation/network-projection.js'),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),page=await fixture(browser),session=seed(),authority=new Authority(session),bindings=[authority.connect(0),authority.connect(1),authority.connectTable([0,1])];
 try{await page.addStyleTag({content:read('app/game-frame-021.css')});for(const binding of bindings){const raw=Projection.compact(binding.snapshot({wire:true})),snapshot=Projection.restore(raw,(event,frame)=>Engine.get('uno').presentEvent(event,frame.state.players),Engine.get('uno'));assert(Number.isInteger(snapshot.state.scene.nextPlayer));await page.evaluate(({snapshot,definition})=>{window.qaGame?.destroy?.();document.querySelector('#app').innerHTML='';const client={snapshot,pending:null,subscribe:()=>()=>{},history:async()=>snapshot,send:async()=>({ok:true}),presentationReady:async()=>null};window.qaGame=PlayroomSharedViews.mount(client,definition,{surface:snapshot.role==='table'?'table':'combined'});qaGame.render();},{snapshot,definition});assert.deepEqual(await page.locator('.player-panel.is-next').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.playerIndex))),[snapshot.state.scene.nextPlayer]);assert.equal(await page.locator('.player-panel.is-turn.is-next').count(),0);}
 }finally{bindings.forEach(b=>b.close());authority.dispose();await browser.close();}
});

test('shared next player indicator is rendered for different packs without pack-specific UI flags',{timeout:45000},async()=>{
 const Projection=require('../presentation/network-projection.js'),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{for(const id of ['uno','yatzy','tictactoe']){require('../packs/'+id+'/rules.js');const page=await fixture(browser),pack=compiledPacks.PlayroomInstalledPacks.find(p=>p.manifest.id===id),definition={assets:assets(pack),manifest:pack.manifest,view:pack.files['view.js'],styles:pack.files['styles.css'],rules:Engine.get(id).rules,sounds:{}},session=new Session(Engine,id,{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'A'},{name:'B'}]}),a=new Authority(session),binding=a.connect(0);try{const snapshot=Projection.restore(Projection.compact(binding.snapshot({wire:true})),(e,s)=>Engine.get(id).presentEvent(e,s.state.players),Engine.get(id));assert.equal(snapshot.state.scene.nextPlayer,1);await page.evaluate(({snapshot,definition})=>{const client={snapshot,pending:null,subscribe:()=>()=>{},history:async()=>snapshot,send:async()=>({ok:true}),presentationReady:async()=>null};window.qaGame=PlayroomSharedViews.mount(client,definition,{});qaGame.render();},{snapshot,definition});assert.deepEqual(await page.locator('.player-panel.is-next').evaluateAll(ns=>ns.map(n=>Number(n.dataset.playerIndex))),[1],id);assert.equal(await page.locator('.player-panel.is-turn.is-next').count(),0);}
 finally{binding.close();a.dispose();await page.close();}}}finally{await browser.close();}
});
