'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
test('foundation arrivals cover the previous top in live and historical ordered transfers',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath()}),context=await browser.newContext({viewport:{width:390,height:740}}),page=await context.newPage();
 try{
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'stack-test',name:'Автор',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,tutorialsEnabled:false}));});await page.goto(server.url);await page.locator('[data-start=klondike]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]:not([disabled])').click();await page.locator('.solitaire-board').waitFor();
  const result=await page.evaluate(async()=>{
   PlayroomAppBridge.showHub();const E=TabletopCore,initial=E.createGame('klondike',{seed:17,autoCollect:'button',autoFlip:'manual'}),cards=[...initial.data.tableau.flat(),...initial.data.stock],take=rank=>({...cards.splice(cards.findIndex(c=>c.rank===rank&&c.suit==='♥'),1)[0],open:true});
   initial.data.foundations=[[take(14)],[],[],[]];initial.data.tableau=[[take(4)],[take(3)],[take(2)],[],[],[],[]];initial.data.stock=cards.map(c=>({...c,open:false}));E.validateState(initial);
   const after=E.applyAction(initial,0,{type:'collect'}),render=state=>{const projected=E.project(state,0),actions=E.legalActions(state,0),host=document.querySelector('#app'),markup=PlayroomGameScreen.render({layoutId:'stack-regression',gameName:'Косынка',state:projected,viewer:0,actions,scene:PlayroomViews.render(projected,0,actions)});if(!PlayroomGameScreen.update(host,markup))PlayroomGameScreen.layoutScene(host);};
   const large=E.createGame('klondike',{seed:17,autoCollect:'button',autoFlip:'manual'}),deck=[...large.data.tableau.flat(),...large.data.stock],suits=['♥','♣','♦','♠'];
   large.data.foundations=suits.map(suit=>deck.filter(card=>card.suit===suit&&card.rank===14).map(card=>({...card,open:true})));
   large.data.tableau=suits.map(suit=>deck.filter(card=>card.suit===suit&&card.rank!==14).sort((a,b)=>b.rank-a.rank).map(card=>({...card,open:true}))).concat([[],[],[]]);large.data.stock=[];E.validateState(large);
   const reports=[];
   for(const sample of [{initial,after,count:3,covers:1},{initial:large,after:E.applyAction(large,0,{type:'collect'}),count:48,covers:4}])for(const action of [{type:'collect'},E.project(sample.after,0).events.findLast(e=>e.presentation).presentation]){
    render(sample.initial);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const snapshot=PlayroomMotion.capture({actor:0,action,viewer:0});render(sample.after);const played=PlayroomMotion.play(snapshot,{duration:650});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const layer=document.querySelector('.playroom-motion-layer'),holders=[...layer.querySelectorAll('.playroom-motion-stack')],flights=[...layer.querySelectorAll('.playroom-motion-flight')],top=document.querySelector('[data-motion-anchor="home-♥"] [data-entity]'),target=top.getBoundingClientRect();
    const coverage=holders.map(node=>({id:node.querySelector('[data-entity]')?.dataset.entity,visibility:getComputedStyle(node.firstElementChild).visibility}));
    const levels=flights.map(node=>Number(getComputedStyle(node).zIndex));
    const endpoints=flights.map(node=>{const animation=node.getAnimations()[0];animation.pause();animation.currentTime=Number(animation.effect.getTiming().delay)+Number(animation.effect.getTiming().duration);const box=node.getBoundingClientRect(),target=document.querySelector('.scene [data-motion-anchor="'+(node.dataset.motionDestination||'home-♥')+'"] [data-entity]').getBoundingClientRect();return {dx:Math.abs(box.x-target.x),dy:Math.abs(box.y-target.y),dw:Math.abs(box.width-target.width),dh:Math.abs(box.height-target.height)};});
    PlayroomMotion.cancel();await played;reports.push({coverage,levels,endpoints,expected:{count:sample.count,covers:sample.covers},finalVisible:getComputedStyle(top).visibility,remaining:document.querySelectorAll('.playroom-motion-layer').length});
   }
   return reports;
  });
  for(const report of result){assert.equal(report.coverage.length,report.expected.covers,'the old foundation top stays visible beneath arrivals');assert.equal(report.coverage[0].visibility,'visible');assert.equal(report.levels.length,report.expected.count);assert(report.levels.every((level,i)=>i===0||level>report.levels[i-1]),'later arrivals remain above cards already in the home');assert(report.endpoints.every(box=>['dx','dy','dw','dh'].every(key=>box[key]<1)),'arrivals use the visible card plane, not the surrounding home box: '+JSON.stringify(report.endpoints));assert.equal(report.finalVisible,'visible');assert.equal(report.remaining,0);}
 }finally{await context.close();await browser.close();await server.close();}
});
