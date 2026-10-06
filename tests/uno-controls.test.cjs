'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.resolve(__dirname, '../index.html')).href;
const shots = process.env.PLAYROOM_CAPTURE_DIR || '/tmp/playroom-qa/uno-controls';
function fixture(players = 2) {
  const saved = new Session(Core, 'uno', {seed:17, mode:'pass', preset:'classic', openHands:true, unoMode:'manual',
    players:Array.from({length:players},(_,i)=>({name:['Аня','Борис','Вера','Глеб'][i]}))}).export();
  const s=saved.states[0],d=s.data,cards=new Map([...d.hands.flat(),...d.drawPile,...d.discard].map(c=>[c.id,c]));
  const take=id=>{const card=cards.get(id);assert(card);cards.delete(id);return card;};
  d.discard=[take('u9')];d.color='red';d.direction=1;d.drawn=null;d.noDraw=false;d.stalled=0;
  d.hands=[['u1','u26','u100','u3','u27','u4','u2'].map(take),['u5','u76','u30','u50','u60','u81','u52'].map(take)];
  while(d.hands.length<players)d.hands.push([...cards.keys()].slice(0,7).map(take));
  d.drawPile=[...cards.values()];s.turn=0;Core.validateState(s);return saved;
}
async function bounds(page) {
  return page.evaluate(()=>Object.fromEntries(['.scene','.uno-play-area','.uno-center','.stock-button','.uno-discard','.uno-direction','.uno-bottom-dock','.own-hand','.hand-track','.uno-call','.uno-card-help'].map(selector=>{
    const el=document.querySelector(selector),r=el.getBoundingClientRect();
    return[selector,{x:r.x,y:r.y,width:r.width,height:r.height,...(selector==='.uno-call'||selector==='.uno-card-help'?{className:el.className}:{})}];
  })));
}
async function layout(page,{handCount=7}={}) {
  const errors=await page.evaluate(handCount=>{
    const errors=[],scene=document.querySelector('.scene'),r=el=>el.getBoundingClientRect(),inside=(a,b)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
    if(scene.scrollWidth>scene.clientWidth+1||scene.scrollHeight>scene.clientHeight+1)errors.push(`scene scroll ${scene.scrollWidth}/${scene.clientWidth} × ${scene.scrollHeight}/${scene.clientHeight}`);
    if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
    const dock=document.querySelector('.uno-bottom-dock'),hand=document.querySelector('.own-hand');
    if(!dock)errors.push('missing dedicated bottom dock');
    else if(innerWidth<=760&&(r(hand).top-r(dock).bottom<0||r(hand).top-r(dock).bottom>18))errors.push('mobile dock is not next to own hand');
    const deck=document.querySelector('.stock-button'),discard=document.querySelector('.uno-discard'),direction=document.querySelector('.uno-direction'),center=document.querySelector('.uno-center'),opponents=document.querySelector('.opponent-hands');
    const arrow=r(direction),field=r(center);
    if(Math.abs(arrow.x+arrow.width/2-field.x-field.width/2)>1)errors.push('direction not centered above the piles');
    if(arrow.bottom>field.top+1||arrow.top<r(opponents).bottom-1)errors.push('direction not between opponents and piles');
    for(const mini of document.querySelectorAll('.mini-hand'))for(const card of mini.querySelectorAll('.uno-card,.piece-back')){
      const m=r(mini),c=r(card),parent=r(mini.closest('.opponent-hand'));
      if(c.top<m.top||c.bottom>m.bottom||c.top<parent.top||c.bottom>parent.bottom)errors.push('opponent card clipped vertically');
    }
    for(const selector of ['.uno-call','.uno-card-help']){
      const el=document.querySelector(selector),b=r(el);
      if(el.closest('.scene-actions'))errors.push('utility mixed with ordinary actions');
      if(innerWidth>760){
        const pile=r(selector==='.uno-call'?deck:discard),gap=selector==='.uno-call'?pile.left-b.right:b.left-pile.right;
        if(gap<0||gap>80||Math.abs(b.y+b.height/2-pile.y-pile.height/2)>32)errors.push('desktop utility too far from its pile');
      }
      if(b.width<44||b.height<44)errors.push('small utility target');
      if(!inside(r(scene),b))errors.push('utility outside scene');
      if(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest(selector)!==el)errors.push('utility covered');
      for(const other of document.querySelectorAll('.opponent-hands,.uno-center,.own-hand,.uno-actions')){
        const a=r(other);
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)errors.push('utility overlaps '+other.className);
      }
    }
    const track=document.querySelector('.hand-track'),cards=[...track.querySelectorAll('[data-hand-preview]')];
    if(cards.length!==handCount)errors.push('wrong hand count');
    if(handCount<=7&&track.scrollWidth>track.clientWidth+1)errors.push('seven-card hand scrolls');
    if(track.querySelectorAll('.hand-fan-row').length!==1)errors.push('hand wrapped into more than one row');
    for(const card of cards){
      const b=r(card),corner=r(card.querySelector('.card-corner'));
      if(b.width<64||b.height<91)errors.push('own cards became too small');
      if(b.top<r(scene).top||b.bottom>r(scene).bottom)errors.push('hand card clipped vertically');
      if(handCount<=7&&!inside(r(scene),corner))errors.push('card corner outside scene');
    }
    for(const color of document.querySelectorAll('.color-choice')){const b=r(color);if(b.width<44||b.height<44||!inside(r(scene),b))errors.push('invalid color target');}
    return errors;
  },handCount);
  assert.deepEqual(errors,[]);
}
async function showVariant(page,state,variant,handCount){
  return page.evaluate(({state,variant,handCount})=>{
    const s=structuredClone(state),hand=s.data.hands[0];let selected=null;
    if(handCount===1){const wild=hand.find(c=>c.id==='u100');s.data.drawPile.push(...hand.filter(c=>c!==wild));s.data.hands[0]=[wild];}
    else if(handCount>hand.length)hand.push(...s.data.drawPile.splice(0,handCount-hand.length));
    if(variant==='out-of-turn')s.turn=1;
    if(variant==='reverse')s.data.direction=-1;
    if(variant==='closed')s.openHands=false;
    if(variant==='wild')selected='u100';
    if(variant==='declared')s.data.uno.declared[0]=true;
    TabletopCore.validateState(s);
    document.querySelector('.scene').innerHTML=PlayroomViews.render(TabletopCore.project(s,0),0,variant==='paused'?[]:TabletopCore.legalActions(s,0),{selected,quickPlay:false});
  },{state,variant,handCount});
}
test('Responsive UNO utilities, turn direction and complete opponent cards stay stable',{timeout:120000},async t=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-background-networking']});
  const screens=[{width:320,height:640},{width:390,height:740},{width:1280,height:900},{width:1226,height:825},{width:817,height:550,scale:1.5}];
  try{
    for(const screen of screens)for(const players of [2,4]){
      const viewport={width:screen.width,height:screen.height};
      await t.test(`${players} players, ${viewport.width}×${viewport.height}@${screen.scale||1}: hands 1/7/8/12, actions and wild`,async()=>{
        const context=await browser.newContext({viewport,deviceScaleFactor:screen.scale||1,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce'}),saved=fixture(players);
        await context.addInitScript(saved=>{localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({motion:false,sound:false,quickPlay:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
        const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
        try{
          await page.goto(url);await page.locator('.resume-banner [data-command=resume]').click();await page.locator('.uno-call').waitFor({state:'visible'});
          const initial=await bounds(page),baselines={open:initial},order=await page.locator('.opponent-hand[data-player-index]').evaluateAll(els=>els.map(el=>el.dataset.playerIndex));await layout(page);
          for(const handCount of [1,7,8,12])for(const variant of ['ordinary','out-of-turn','wild','closed','reverse','paused',...(handCount===1?['declared']:[])]){
            await showVariant(page,saved.states[0],variant,handCount);
            const mode=variant==='closed'?'closed':'open',current=await bounds(page);
            if(!baselines[mode])baselines[mode]=current;
            assert.deepEqual(current,baselines[mode],`table or dock shifts for ${handCount} cards / ${variant}`);
            await layout(page,{handCount});
            assert.deepEqual(await page.locator('.opponent-hand[data-player-index]').evaluateAll(els=>els.map(el=>el.dataset.playerIndex)),order,'player positions must not reorder with turn direction');
            assert.equal(await page.locator('.uno-direction').getAttribute('data-direction'),variant==='reverse'?'-1':'1');
            if(variant==='closed')assert(await page.locator('.opponent-hands .piece-back').count()>0);
            if(variant==='paused')assert.equal(await page.locator('.uno-call').isEnabled(),false);
            if(variant==='wild')assert.equal(await page.locator('.color-choice').count(),4);
            if(players===4&&handCount===8&&variant==='closed'&&viewport.width===390){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'playroom-v0.7-uno-hidden-phone.png')});}
            if(players===2&&handCount===8&&variant==='wild'&&viewport.width===320){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'playroom-v0.7-uno-wild-320.png')});}
          }
          await showVariant(page,saved.states[0],'ordinary',8);
          const filename=players===2&&viewport.width===390?'playroom-v0.7-uno-phone.png':players===2&&viewport.width===1226?'playroom-v0.7-uno-desktop.png':players===4&&viewport.width===390?'playroom-v0.7-uno-four-phone.png':null;
          if(filename){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,filename)});}
          if(players===4){
            await page.evaluate(state=>{
              const s=structuredClone(state),d=s.data;
              const pool=[...d.hands.flat(),...d.drawPile];
              d.hands=[pool.splice(0,1),pool.splice(0,100),pool.splice(0,1),pool.splice(0,1)];d.drawPile=pool;
              TabletopCore.validateState(s);
              document.querySelector('.scene').innerHTML=PlayroomViews.render(TabletopCore.project(s,0),0,TabletopCore.legalActions(s,0),{selected:null,quickPlay:false});
            },saved.states[0]);
            await layout(page,{handCount:1});
            const publicHands=await page.evaluate(()=>{
              const band=document.querySelector('.opponent-hands'),minis=[...document.querySelectorAll('.mini-hand.is-open')],scene=document.querySelector('.scene'),cards=[...band.querySelectorAll('.public-card')],r=el=>el.getBoundingClientRect(),b=r(band),s=r(scene),failures=[];
              for(const card of cards){
                const c=r(card),corner=r(card.querySelector('.card-corner:not(.bottom)'));
                if(c.top<b.top-1||c.bottom>b.bottom+1||c.left<s.left||c.right>s.right)failures.push('card outside public band');
                if(document.elementFromPoint(corner.x+corner.width/2,corner.y+corner.height/2)?.closest('.public-card')!==card)failures.push('covered public corner '+card.dataset.publicCardIndex);
              }
              return {counts:minis.map(mini=>mini.querySelectorAll('.public-card').length),rows:new Set(cards.map(c=>r(c).y)).size,scroll:Math.max(...minis.map(mini=>mini.scrollWidth-mini.clientWidth)),failures};
            });
            assert.deepEqual(publicHands.counts,[100,1,1]);assert(publicHands.rows>1);assert(publicHands.scroll<=1);assert.deepEqual(publicHands.failures,[]);
            if(viewport.width===320||viewport.width===390||viewport.width===1226){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,`playroom-v0.7-uno-open-100-allplayers-${viewport.width}.png`)});}
          }
          assert.deepEqual(errors,[]);
        }finally{await context.close();}
      });
    }
  }finally{await browser.close();}
});
