'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {launchTestBrowser}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

async function captureTransfers(page){
 const layer=page.locator('.playroom-motion-layer').filter({has:page.locator('[data-motion-kind=transfer]')});
 await layer.waitFor();
 return layer.evaluate(layer=>{
  const coverage=[...layer.querySelectorAll('.playroom-motion-stack')].map(node=>({
   anchor:node.dataset.motionAnchor,visibility:getComputedStyle(node.firstElementChild).visibility,
  }));
  const transfers=[...layer.querySelectorAll('[data-motion-kind=transfer]')].map(node=>{
   const animation=node.getAnimations()[0],time=animation.currentTime;
   animation.pause();animation.currentTime=-1;
   const waiting=Number(getComputedStyle(node).zIndex);
   const {delay,duration}=animation.effect.getTiming();
   animation.currentTime=Number(delay)+Number(duration);
   const anchor=node.dataset.motionDestination;
   const box=node.getBoundingClientRect();
   const target=document.querySelector('.table-shell .scene [data-motion-anchor="'+anchor+'"] [data-entity]').getBoundingClientRect();
   const landing=Number(getComputedStyle(node).zIndex);
   animation.currentTime=time;animation.play();
   return {anchor,waiting,landing,offsets:[box.x-target.x,box.y-target.y,box.width-target.width,box.height-target.height]};
  });
  return {coverage,transfers};
 });
}

function assertTransferLayers(frame,cards,homes){
 assert.equal(frame.coverage.length,homes,'the previous home tops stay visible under arrivals');
 assert(frame.coverage.every(top=>top.visibility==='visible'));
 assert.equal(frame.transfers.length,cards);
 const waiting=Object.groupBy(frame.transfers,entry=>entry.anchor);
 if(cards===48)for(const column of Object.values(waiting)){
  assert.equal(column.length,12);
  assert(column.every((card,i)=>i===0||card.waiting<column[i-1].waiting),'waiting cards keep their tableau order');
 }
 assert(frame.transfers[0].landing>Math.max(...frame.transfers.map(card=>card.waiting)),'a flying card is above the tableau');
 assert(frame.transfers.every((card,i)=>i===0||card.landing>frame.transfers[i-1].landing),'later arrivals cover earlier ones');
 assert(frame.transfers.every(card=>card.offsets.every(offset=>Math.abs(offset)<1)),'flights end on the actual destination card');
}

test('foundation arrivals cover the previous top in live and historical ordered transfers',{timeout:60000},async t=>{
 const artifact=process.env.PLAYROOM_SDK_PLAYER_HTML;
 const server=artifact?null:await serveBrowserFixture(path.resolve(__dirname,'..'));
 if(server)t.after(()=>server.close());
 const url=artifact?pathToFileURL(path.resolve(artifact)).href:server.url;
 const browser=await launchTestBrowser(process.env.PLAYROOM_TEST_BROWSER||'chromium');
 try{
  for(const count of [3,48]){
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'});
   try{
    const page=await context.newPage();
    await page.route('https://**',route=>route.abort());
    await context.addInitScript(()=>{
     localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'stack-test',name:'Автор',createdAt:1,updatedAt:1}));
    });
    await page.goto(url);
    await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge?.packs);
    await page.evaluate(count=>{
     const create=TabletopCore.createGame;
     TabletopCore.createGame=(id,options)=>{
      const state=create(id,{...options,seed:17});
      if(id!=='klondike')return state;
      const data=state.data,cards=[...data.tableau.flat(),...data.stock],suits=['♥','♣','♦','♠'];
      const take=(rank,suit)=>({...cards.splice(cards.findIndex(c=>c.rank===rank&&c.suit===suit),1)[0],open:true});
      data.foundations=suits.map(suit=>count===48||suit==='♥'?[take(14,suit)]:[]);
      data.tableau=count===48?suits.map(suit=>Array.from({length:12},(_,index)=>take(13-index,suit))).concat([[],[],[]]):
       [[take(4,'♥')],[take(3,'♥')],[take(2,'♥')],[],[],[],[]];
      data.stock=cards.map(card=>({...card,open:false}));
      if(!TabletopCore.validateState(state))throw Error('Invalid Klondike fixture');
      return state;
     };
     PlayroomFirstTurnGuide.setEnabled('klondike',false);
    },count);
    await page.locator('[data-start=klondike]').first().click();
    const mode=page.locator('[data-game-mode=hotseat]');
    if(await mode.isVisible())await mode.click();
    await page.locator('[data-command=lobby-start]').click();
    const scroll=page.locator('.solitaire-scroll');
    await scroll.waitFor();
    const guide=page.getByRole('button',{name:'Без подсказок',exact:true});
    if(await guide.isVisible())await guide.click();
    const box=await scroll.boundingBox();
    await page.mouse.dblclick(box.x+box.width/2,box.y+box.height-20);
    const homes=count===48?4:1;
    assertTransferLayers(await captureTransfers(page),count,homes);
    await page.locator('.playroom-motion-layer').waitFor({state:'detached',timeout:15000});
    if(count===48){
     const result=page.locator('.result-modal');
     await result.locator('[data-command=result-replay]').click();
    }else{
     await page.locator('[data-game-menu]').click();
     await page.locator('[data-command=history]:visible').click();
    }
    const slider=page.locator('#replay-range');
    await slider.waitFor();
    if(await slider.inputValue()!=='0')await slider.press('Home');
    const previous=page.locator('.solitaire-home .solitaire-card');
    assert.equal(await previous.count(),homes);
    assert(await previous.evaluateAll(cards=>cards.every(card=>getComputedStyle(card).visibility==='visible')));
    await page.locator('[data-command=replay-next]').click();
    assertTransferLayers(await captureTransfers(page),count,homes);
    await page.locator('.playroom-motion-layer').waitFor({state:'detached',timeout:15000});
    assert(await previous.evaluateAll(cards=>cards.every(card=>getComputedStyle(card).visibility==='visible')));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
});
