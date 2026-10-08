'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Engine=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js');
require('../packs/uno/rules.js');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const definition={manifest:JSON.parse(read('packs/uno/manifest.json')),view:read('packs/uno/view.js'),styles:read('packs/uno/styles.css'),rules:Engine.get('uno').rules,sounds:{'uno.call':{label:'UNO!',notes:[{at:0,duration:.2,frequency:440}]}}};
const seed=()=>new Session(Engine,'uno',{seed:23,mode:'pass',preset:'quick',unoMode:'manual',players:[{name:'Иван'},{name:'Джон'}]});
async function fixture(browser){
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
  for(const name of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css'])await page.addStyleTag({content:read(name)});
  for(const name of ['core/ui.js','core/player-target.js','app/views.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:read(name)});
  return page;
}
test('same network GameScreen offers 2-tap UNO target with expiry, highlights and one authoritative action',{timeout:40000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await fixture(browser);try{
    const s=seed(),authority=new Authority(s),owner=authority.connect(0),snapshot=owner.snapshot();
    await page.evaluate(({snapshot,definition})=>{
      window.qaAudio=[];window.qaSent=[];
      window.PlayroomAppBridge={audio:{registerPack(){},play(ids,pack){qaAudio.push({ids,pack});},stop(){}}};
      const listeners=new Set();window.qaClient={snapshot,pending:null,
        subscribe(f){listeners.add(f);return()=>listeners.delete(f);},async send(action){qaSent.push(action);return {ok:true};},
        async history(){return snapshot;},close(){},emit(next){this.snapshot=next;for(const f of listeners)f(next);}};
      window.qaGame=PlayroomSharedViews.mount(qaClient,definition,{surface:'combined'});qaGame.render();
    },{snapshot,definition});
    const shell=page.locator('.network-game');
    const target=shell.locator('.player-token[data-accuse-player="1"]');
    assert.equal(await target.count(),1);
    await target.tap();
    assert.equal(await target.evaluate(e=>e.classList.contains('is-player-targeted')),true);
    assert.equal(await shell.locator('.opponent-hand.is-player-targeted').count(),1);
    assert.equal((await shell.locator('.player-target-confirm').innerText()).trim(),'UNO!');
    if(process.env.PLAYROOM_CAPTURE_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_CAPTURE_DIR,'network-targeting.png')});
    assert.equal(await page.evaluate(()=>qaSent.length),0,'Selection must not transmit a command');
    await shell.locator('.player-target-confirm').tap();
    assert.deepEqual(await page.evaluate(()=>qaSent.map(a=>({type:a.type,target:a.target}))),[{type:'accuse-uno',target:1}]);
    assert.equal(await shell.locator('.player-target-confirm').count(),0);
    assert.equal(await page.locator('#modal-root .modal').count(),0,'No long confirmation modal');
    await shell.locator('.opponent-hand[data-accuse-player="1"]').tap();
    await page.waitForTimeout(2150);
    assert.equal(await shell.locator('.player-target-confirm').count(),0,'Timed-out selection disappears');
    assert.equal(await page.evaluate(()=>qaSent.length),1);
    await page.evaluate(()=>qaGame.destroy());
  }finally{await page.close();await browser.close();}
});
test('projected notices and cues play once; finish shows per-player results and history option',{timeout:40000},async()=>{
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
    const action=initial.actions.find(a=>a.type==='declare-uno');
    const receipt=a.dispatch(P.command(initial,action,'browser-uno-1'));
    assert.equal(receipt.ok,true);
    await page.evaluate(next=>qaClient.emit(next),receipt.snapshot);
    assert.match(await page.locator('.game-notice').innerText(),/UNO! слишком рано/);
    assert.deepEqual(await page.evaluate(()=>qaAudio),[{ids:['uno.call'],pack:'uno'}]);
    await page.evaluate(next=>qaClient.emit(next),receipt.snapshot);
    assert.equal(await page.evaluate(()=>qaAudio.length),1,'Duplicate snapshot must be silent');
    const finish=structuredClone(receipt.snapshot);
    finish.revision++;finish.state.status='finished';finish.state.winner=1;finish.state.players[1].score=148;finish.state.move=finish.revision;
    finish.events.push({id:3,kind:'finish',player:1,text:'Джон побеждает'});finish.state.events=finish.events;
    finish.cues=[{id:'defeat',eventId:3}];
    await page.evaluate(next=>qaClient.emit(next),finish);
    const modal=page.locator('#modal-root .modal');
    assert.equal(await modal.count(),1,'Finish should open results automatically');
    assert.match(await modal.innerText(),/Поражение/);
    assert.match(await modal.innerText(),/Джон/);assert.match(await modal.innerText(),/148/);
    assert.deepEqual(await page.evaluate(()=>qaAudio.map(x=>x.ids[0])),['uno.call','defeat']);
    await page.evaluate(next=>qaClient.emit(next),finish);
    assert.equal(await modal.count(),1,'Duplicate finish must not open another dialog');
    assert.equal(await page.evaluate(()=>qaAudio.length),2);
    await modal.locator('[data-command=result-replay]').click();
    await page.locator('.history-panel').waitFor();
    assert.equal(await page.locator('.network-game .scene [data-action]').count(),0,'Historical view is read-only');
    await page.evaluate(()=>qaGame.destroy());
  }finally{await page.close();await browser.close();}
});
