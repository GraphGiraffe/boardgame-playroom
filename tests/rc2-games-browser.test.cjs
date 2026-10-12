'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),{serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('new game scenes stay usable at phone portrait and short landscape sizes',{timeout:90000},async()=>{
 const fixture=await serveBrowserFixture(root),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const page=await browser.newPage({viewport:{width:390,height:740}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(fixture.url);const games=['tictactoe','battleship','pexeso','ludo','yatzy','gofish','oldmaid'];
  for(const [width,height]of [[320,640],[390,740],[740,390]]){await page.setViewportSize({width,height});for(const game of games){const result=await page.evaluate(game=>{
    const E=TabletopCore,definition=E.get(game),state=E.createGame(game,{seed:17,preset:definition.presets[0].id,players:[{name:'Аня'},{name:'Борис'}]}),projected=E.project(state,0),actions=E.legalActions(state,0),scene=PlayroomViews.render(projected,0,actions,{selected:null});
    document.querySelector('#app').innerHTML=PlayroomGameScreen.render({gameName:definition.name,state:projected,viewer:0,actions,scene,turnText:'Ваш ход'});PlayroomGameScreen.layoutScene(document.querySelector('#app'));
    const field=document.querySelector('.layout-field'),buttons=[...document.querySelectorAll('.scene [data-action]')],bounds=field?.getBoundingClientRect();return {scene:!!document.querySelector('.app-game-layout'),fallback:document.querySelector('.scene')?.textContent.includes('Не удалось показать игру'),overflow:document.documentElement.scrollWidth-innerWidth,field:bounds?{left:bounds.left,right:bounds.right,width:bounds.width}:null,buttons:buttons.length,invalidButtons:buttons.filter(b=>{const r=b.getBoundingClientRect();return r.width<1||r.height<1}).length};
   },game);assert(result.scene&&!result.fallback,`${game} ${width} scene`);assert(result.overflow<=1,`${game} ${width} horizontal overflow ${result.overflow}`);assert(result.buttons>0&&result.invalidButtons===0,`${game} ${width} controls`);}}
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await fixture.close();}
});
