'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');

test('team result discs peek from under equal-sized medals on phone screens',{timeout:30000},async()=>{
  const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const context=await browser.newContext({viewport:{width:390,height:740},hasTouch:true,isMobile:true});
  const page=await context.newPage();
  try{
    await page.goto(server.url);
    await page.evaluate(()=>{
      const state={game:'ludo',preset:'teams',status:'finished',winner:0,winners:[0,2],firstPlayer:0,move:482,players:[{name:'Иван'},{name:'Тео'},{name:'Луна'},{name:'Сэм'}],result:{label:'Фишек команды дома',detailLabel:'Свои фишки дома',places:[1,2,1,2],values:[8,5,8,5],details:[4,2,4,3]}};
      const teamBadges=[{label:'синяя',color:'#668fad'},{label:'красная',color:'#ce735d'}];
      PlayroomAppBridge.openModal(PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'Лудо',teamBadges}),'result-modal');
    });
    const badges=await page.locator('.result-awards').evaluateAll(wrappers=>wrappers.map(wrapper=>{
      const medal=wrapper.querySelector('.is-place'),team=wrapper.querySelector('.is-team'),m=medal.getBoundingClientRect(),t=team.getBoundingClientRect(),symbol=team.querySelector('svg')?.getBoundingClientRect(),disc=team.querySelectorAll('circle')[1];
      return {medal:m.width,team:t.width,exposedRight:t.right-m.right,exposedBottom:t.bottom-m.bottom,color:getComputedStyle(disc).fill,medalLayer:getComputedStyle(medal).zIndex,teamLayer:getComputedStyle(team).zIndex,symbolWidth:symbol?.width,symbolOffset:symbol?Math.hypot((symbol.left+symbol.width/2)-(t.left+t.width/2),(symbol.top+symbol.height/2)-(t.top+t.height/2)):null};
    }));
    assert.equal(badges.length,4);
    assert.deepEqual(badges.map(b=>b.color),['rgb(102, 143, 173)','rgb(102, 143, 173)','rgb(206, 115, 93)','rgb(206, 115, 93)']);
    assert.equal(await page.locator('.result-awards .player-medallion.is-team[aria-label="Команда синяя · первый ход"]').count(),1);
    assert(badges[0].symbolOffset<1,'first-player symbol stays centered on its team disc');
    assert.equal(badges[0].symbolWidth,22,'first-player artwork scales with the disc');
    assert(badges.every(b=>b.medal===22&&b.team===22&&b.exposedRight>=4&&b.exposedRight<=6&&b.exposedBottom>=2&&b.exposedBottom<=4&&Number(b.medalLayer)>Number(b.teamLayer)),'team color must peek uniformly from below the medal: '+JSON.stringify(badges));
    const colors=()=>page.locator('.result-awards .is-place').evaluateAll(nodes=>nodes.map(node=>getComputedStyle(node.querySelectorAll('circle')[1]).fill));
    const lightMedals=await colors();
    assert.equal(new Set(lightMedals).size,2,'gold and silver keep distinct material colors');
    for(const id of ['dark','light']){
      await page.evaluate(id=>PlayroomAppearanceUI.runtime.service.select(id),id);
      assert.deepEqual(await colors(),lightMedals,'theme switching preserves canonical medal colors');
    }
    if(process.env.PLAYROOM_QA_DIR){fs.mkdirSync(process.env.PLAYROOM_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'team-results-390.png')});}
    await page.setViewportSize({width:320,height:740});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
    assert.equal(await page.locator('.result-awards').count(),4);
    await page.evaluate(()=>{
      const state={status:'finished',winner:0,firstPlayer:0,move:20,players:[{name:'Иван'},{name:'Тео'}],result:{places:[1,4],values:[10,4]}};
      PlayroomAppBridge.openModal(PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'Шашки'}),'result-modal');
    });
    assert.equal(await page.locator('.result-awards .player-medallion.is-first').count(),1);
    const first=await page.locator('.result-awards').first().evaluate(el=>{const disc=el.querySelector('.is-first').getBoundingClientRect(),medal=el.querySelector('.is-place').getBoundingClientRect(),symbol=el.querySelector('.is-first svg').getBoundingClientRect();return {disc:disc.width,medal:medal.width,exposed:disc.right-medal.right,symbolOffset:Math.hypot((symbol.left+symbol.width/2)-(disc.left+disc.width/2),(symbol.top+symbol.height/2)-(disc.top+disc.height/2))};});
    assert.equal(first.disc,first.medal);assert(first.exposed>=4&&first.exposed<=6);assert(first.symbolOffset<1);
    if(process.env.PLAYROOM_QA_DIR)await page.screenshot({path:path.join(process.env.PLAYROOM_QA_DIR,'team-results-320.png')});
  }finally{await context.close();await browser.close();await server.close();}
});
