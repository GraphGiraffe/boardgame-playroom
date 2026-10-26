'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Engine=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
require('../packs/uno/rules.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const compiledPacks={};require('node:vm').runInNewContext(read('installed-packs.js'),compiledPacks);
const unoBundle=compiledPacks.PlayroomInstalledPacks.find(bundle=>bundle.manifest.id==='uno');
const assets=bundle=>Object.fromEntries(Object.entries(bundle.files).filter(([name])=>name.startsWith('assets/')).map(([name,value])=>[name,value.startsWith('data:')?value:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(value)]));
const definition={assets:assets(unoBundle),manifest:unoBundle.manifest,view:unoBundle.files['view.js'],styles:unoBundle.files['styles.css'],rules:Engine.get('uno').rules,sounds:{'uno.call':{label:'UNO!',notes:[{at:0,duration:.2,frequency:440}]}}};
const seed=()=>new Session(Engine,'uno',{seed:23,mode:'pass',preset:'quick',unoMode:'manual',players:[{name:'Иван'},{name:'Джон'}]});
async function fixture(browser){
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
  for(const name of ['app/styles.css','core/game-components.css','core/ui.css','core/input.css','app/first-turn-guide.css','app/shared-views.css','app/game-interactions.css','app/design-system.css'])await page.addStyleTag({content:read(name)});
  for(const name of ['core/messages.js','presentation/localization.js','core/protocol.js','core/component-assets.js','core/game-components.js','core/token-layout.js','core/ui.js','core/player-target.js','core/motion.js','presentation/plan-player.js','presentation/scheduler.js','core/game-flow.js','core/hand-overflow.js','core/size-tokens.js','platform/web/element-sizes.js','app/views.js','application/history-controller.js','application/game-screen-controller.js','platform/web/dom.js','app/game-screen.js','app/first-turn-guide.js','platform/web/action-reveal.js','presentation/event-plan.js','app/game-feedback.js','core/input.js','platform/web/pack-loader.js','app/shared-views.js'])await page.addScriptTag({content:read(name)});
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
      window.PlayroomAppBridge={audio:{registerPack(){},play(ids,pack){qaAudio.push({ids,pack});},stop(){}}};
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
      window.qaAudio=[];window.PlayroomAppBridge={audio:{registerPack(){},play(ids,pack){qaAudio.push({ids,pack});},stop(){}}};
      const listeners=new Set();window.qaClient={snapshot:initial,pending:null,
        subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async history(){return {...initial,kind:'history'};},
        async send(){return {ok:true};},emit(next){this.snapshot=next;for(const f of listeners)f(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{});qaGame.render();
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
    await page.waitForFunction(()=>document.querySelector('.status-event')?.textContent.includes('UNO'));
    assert.equal(await page.locator('.game-notice').count(),0,'Routine action never covers the hand');
    assert.match(await page.locator('.status-event').innerText(),/UNO/);
    assert.deepEqual(await page.evaluate(()=>qaAudio),[{ids:['uno.call'],pack:'uno'}]);
    await page.evaluate(next=>qaClient.emit(next),projected);
    assert.equal(await page.evaluate(()=>qaAudio.length),1,'Duplicate snapshot must be silent');
    const finish=structuredClone(projected);
    finish.revision++;finish.state.status='finished';finish.state.winner=1;finish.state.winners=[1];finish.state.players[1].score=148;finish.state.scene.players.find(player=>(player.player??player.id)===1).metrics.find(metric=>metric.kind==='points').value=148;finish.state.move=finish.revision;
    finish.events.push({id:3,kind:'finish',player:1,text:'Джон побеждает'});finish.state.events=finish.events;
    finish.cues=[{id:'defeat',eventId:3}];
    await page.evaluate(next=>qaClient.emit(next),finish);
    const modal=page.locator('#modal-root .modal');
    await modal.waitFor();
    assert.equal(await modal.count(),1,'Finish should open results automatically');
    assert.match(await modal.innerText(),/Поражение/);
    assert.match(await modal.innerText(),/Джон/);assert.match(await modal.innerText(),/148/);
    assert.deepEqual(await page.evaluate(()=>qaAudio.map(x=>x.ids[0])),['uno.call','defeat']);
    await modal.locator('[data-command=close-modal]').click();
    await page.locator('[data-command=result]').first().click();
    assert.equal(await page.evaluate(()=>qaAudio.length),2,'Reopening results is silent');
    await page.evaluate(next=>qaClient.emit(next),finish);
    assert.equal(await modal.count(),1,'Duplicate finish must not open another dialog');
    assert.equal(await page.evaluate(()=>qaAudio.length),2);
    await modal.locator('[data-command=result-replay]').click();
    await page.locator('.history-panel').waitFor();
    assert.equal(await page.locator('.network-game .scene [data-action]').count(),0,'Historical view is read-only');
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
      window.PlayroomAppBridge={gameOptions:()=>qaOptions,audio:{registerPack(){},play(){},stop(){}}};
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
      window.PlayroomAppBridge={gameOptions:()=>({animationSpeed:'fast'}),audio:{registerPack(){},play(ids){qaSounds.push(...ids);},stop(){}}};
      const listeners=new Set();window.qaClient={snapshot:initial,pending:null,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},async send(action){qaSubmitted.push(action);return {ok:true};},async history(index){qaHistory.push(index);return history[index];},emit(next){this.snapshot=next;for(const fn of listeners)fn(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition);qaGame.render();
    },{initial,history,definition});
    await page.evaluate(snapshots=>{qaClient.emit(snapshots[2]);qaClient.emit(snapshots[3]);},snapshots);
    for(let revision=1;revision<=4;revision++){
      await page.waitForFunction(n=>qaFrames.length===n,revision);assert.equal(await page.locator('.network-game').getAttribute('data-revision'),String(revision));
      assert.equal(await page.locator('.scene [data-action]:enabled').evaluateAll(nodes=>nodes.filter(node=>!['declare-uno','accuse-uno'].includes(JSON.parse(node.dataset.action).type)).length),0,'Only independent reactions remain usable during presentation');
      if(revision===1){await page.locator('.uno-call').click();assert.equal(await page.evaluate(()=>qaSubmitted.at(-1).type),'declare-uno');assert.equal(await page.evaluate(()=>qaFrames.length),1,'Reaction does not cancel the current animation');}
      assert.match(await page.locator('.status-event').innerText(),new RegExp(history[revision].events.at(-1).text));
      await page.evaluate(()=>qaReleases.shift()());
    }
    await page.waitForFunction(()=>document.querySelector('.scene').getAttribute('aria-busy')==='false');
    assert.deepEqual(await page.evaluate(()=>qaFrames.map(f=>f.revision)),[1,2,3,4]);assert.deepEqual(await page.evaluate(()=>qaHistory),[1,2]);
    assert.equal(await page.evaluate(()=>qaCancel),0,'New packets do not cancel an active animation');
    assert.deepEqual(await page.evaluate(()=>qaSounds),['draw','pass','draw','pass']);
    await page.evaluate(next=>qaClient.emit(next),snapshots[3]);assert.equal(await page.evaluate(()=>qaFrames.length),4);
    await page.evaluate(()=>qaGame.openHistory(0));assert.equal(await page.locator('.network-game').getAttribute('data-mode'),'history');
    assert.equal(await page.locator('.status-event').innerText(),'Начальная расстановка');assert.equal(await page.locator('.history-caption').count(),0);
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
      window.qaAcks=[];window.qaCommands=[];window.PlayroomAppBridge={gameOptions:()=>({animationSpeed:'instant'})};
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
   window.sent=[];window.PlayroomAppBridge={gameOptions:()=>({animationSpeed:'instant'})};
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
      window.PlayroomAppBridge={gameOptions:()=>({quickPlay:true,animationSpeed:'instant'})};
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
   const listeners=new Set();window.qaSent=[];window.PlayroomAppBridge={gameOptions:()=>({animationSpeed:'instant',quickPlay:true})};
   window.qaClient={snapshot:initial,pending:null,subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async send(action){qaSent.push(action);const {receipt,snapshot}=await scoreCommit(action);this.emit(snapshot);return receipt;},emit(snapshot){this.snapshot=snapshot;for(const f of listeners)f(snapshot);},async history(){return this.snapshot;},close(){}};
   window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:table?'table':'combined'});qaGame.render();
  },{initial,definition,table});
  const category=page.locator('.yatzy-score button[data-action]').filter({hasText:/^0$/}).first();
  for(const cancel of [true,false]){
   await category.click();await page.locator('.modal [data-command="confirm-action"]').waitFor();assert.match(await page.locator('.modal .lead').textContent(),/0 очков/);assert.equal(await page.evaluate(()=>qaSent.length),0);assert.equal(JSON.stringify(session.current),before);
   if(cancel)await page.locator('.modal [data-command="close-modal"]').last().click();
  }
  // A newer authoritative frame invalidates the pending choice.
  session.act(0,{type:'hold',index:0});await page.evaluate(next=>qaClient.emit(next),client.snapshot());await page.locator('.modal [data-command="confirm-action"]').click();assert.equal(await page.evaluate(()=>qaSent.length),0);
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
   window.metricMarkup=()=>'<div class="table-shell"><section class="player-panel" data-player-index="0">'+H.scoreBadge({id:'points',kind:'points',value:9,label:'Points'})+H.countBadge(5,'Cards',{hand:true})+'</section></div>';
   document.querySelector('#app').innerHTML=metricMarkup();
   window.metricFeedback=new PlayroomGameFeedback();
   window.metricAccept=id=>metricFeedback.accept([{id,feedback:{kind:'penalty',player:0}}],[],'uno',{mode:'fast',
    initialScene:{players:[{player:0,handCount:3,metrics:[{id:'points',kind:'points',value:2,label:'Points'}]}]},
    finalScene:{players:[{player:0,handCount:5,metrics:[{id:'points',kind:'points',value:9,label:'Points'}]}]}});
   metricAccept(1);
  });
  const metrics=()=>page.evaluate(()=>[document.querySelector('[data-score-id="points"]').textContent,document.querySelector('.piece-count.is-hand').dataset.pieceCount]);
  assert.deepEqual(await metrics(),['2','3']);
  await page.evaluate(()=>{document.querySelector('#app').innerHTML=metricMarkup();metricFeedback.refresh();});
  assert.deepEqual(await metrics(),['2','3'],'redraw must not reveal final counters early');
  await page.evaluate(()=>metricFeedback.whenIdle());assert.deepEqual(await metrics(),['9','5']);
  await page.evaluate(()=>{metricAccept(2);metricFeedback.clear();});
  assert.deepEqual(await metrics(),['9','5'],'cancellation restores the committed DOM');
  await page.evaluate(()=>{metricAccept(3);metricFeedback.player.skip();});
  assert.deepEqual(await metrics(),['9','5'],'skip restores committed counters without replaying queued cues');
  assert.equal(await page.evaluate(()=>metricFeedback.active===null&&metricFeedback.queue.length===0),true);
  await page.evaluate(()=>metricFeedback.destroy());
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
