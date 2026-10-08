'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const Core=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js');
require('../packs/uno/rules.js');
const root=path.resolve(__dirname,'..');
const source=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const def={manifest:JSON.parse(source('packs/uno/manifest.json')),view:source('packs/uno/view.js'),styles:source('packs/uno/styles.css'),rules:['Карты UNO']};

test('the projected network game reuses the bot GameScreen, opponents and inline history without exposing secret faces',{timeout:50000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  try{
    await page.setContent('<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="app"></div><div id="modal-root"></div><div id="toast"></div></body></html>');
    for(const file of ['app/styles.css','core/ui.css','core/input.css','app/shared-views.css','app/game-interactions.css'])await page.addStyleTag({content:source(file)});
    for(const file of ['core/ui.js','core/player-target.js','app/views.js','app/game-screen.js','app/game-feedback.js','core/input.js','app/shared-views.js'])await page.addScriptTag({content:source(file)});
    const session=new Session(Core,'uno',{seed:123,mode:'pass',preset:'classic',unoMode:'manual',players:[{name:'Игрок А'},{name:'Игрок Б'}],openHands:false});
    const authority=new Authority(session);
    const audience=authority.connect(0);
    const snapshots=[audience.history(0)];
    const actor=session.current.turn;
    const action=Core.legalActions(session.current,actor).find(a=>a.type==='draw')||Core.legalActions(session.current,actor)[0];
    if(action){session.act(actor,action);snapshots.push(audience.history(1));}
    const snapshot=audience.snapshot(),publicSnapshot=authority.connect(-1).snapshot();
    assert(snapshot.state.data.hands[1].every(c=>c.hidden),'Private opponent cards must be absent from projected snapshots');
    await page.evaluate(({snapshot,snapshots,def})=>{
      const listeners=new Set();
      const client={snapshot,pending:null,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
        async history(index){return snapshots[index];},async send(){throw Error('Do not change authoritative state in read-only layout test');}};
      window.game=PlayroomSharedViews.mount(client,def,{surface:'combined'});game.render();
    },{snapshot,snapshots,def});
    const shell=page.locator('.table-shell.network-game');
    assert.equal(await shell.count(),1);
    assert.equal(await shell.locator('.player-strip .player-token').count(),2);
    assert.equal(await shell.locator('.scene .opponent-hand').count(),1);
    assert.equal(await shell.locator('.player-strip').isVisible(),true,'Player details must be visible, not just in the DOM');
    assert.equal(await shell.locator('.scene .opponent-hand').isVisible(),true,'Opponent hand must be visible');
    assert.equal(await shell.locator('.scene .own-hand').count(),1);
    assert.equal(await shell.locator('.scene .opponent-hand .uno-art-face').count(),0);
    assert.equal(await shell.locator('.table-tools [data-command=history] svg').count(),1);
    assert.equal(await shell.locator('.scene .uno-player-targets').count(),0,'No extra player-only accusation bar');
    const viewport=await page.evaluate(()=>({width:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
    assert(viewport.width<=viewport.client+1,'Shared screen must fit mobile width');
    await page.evaluate(()=>{window.localClicks=0;document.addEventListener('click',()=>window.localClicks++);});
    await shell.locator('[data-command=history]').click();
    await shell.locator('.history-panel').waitFor();
    assert.equal(await shell.locator('.history-controls').count(),1);
    assert.equal(await shell.locator('.scene [data-action]').count(),0,'History is read-only');
    await shell.locator('.history-panel [data-command=history-close]').click();
    assert.equal(await page.evaluate(()=>window.localClicks),0,'Network interactions must not reach the local Session click handler');
    assert.equal(await shell.locator('.history-panel').count(),0);
    await page.setViewportSize({width:740,height:390});
    assert.equal(await shell.locator('.player-strip .player-token').count(),2);
    assert.equal(await shell.locator('.uno-bottom-dock').count(),1);
    await page.evaluate(()=>game.destroy());
    // Table mode is read-only and must not inherit a player's own hand.
    await page.evaluate(({snapshot,def})=>{
      const client={snapshot,pending:null,subscribe(){return()=>{};},history:async()=>{throw Error('Not requested');}};
      window.publicGame=PlayroomSharedViews.mount(client,def,{surface:'table'});publicGame.render();
    },{snapshot:publicSnapshot,def});
    assert.equal(await page.locator('.network-game').getAttribute('data-viewer'),'-1');
    assert.equal(await page.locator('.network-game .scene .own-hand').count(),0);
    assert.equal(await page.locator('.network-game .scene [data-action]').count(),0);
    assert.equal(await page.locator('.network-game .scene .opponent-hand').count(),2);
    assert.equal(await page.locator('.network-game .scene .uno-art-face').count(),1,'Only the public discard may show a card face');
    await page.evaluate(()=>publicGame.destroy());
  }finally{await page.close();await browser.close();}
});
