'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root = path.resolve(__dirname, '..');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');
const url = process.env.PLAYROOM_URL || pathToFileURL(path.join(root, 'index.html')).href;

function fixture({longHand = false, wildFirst = false} = {}) {
  const session = new Session(Core, 'uno', {seed: 17, mode: 'pass', preset: 'classic', openHands: true, players: [{name:'Аня'}, {name:'Борис'}]});
  const saved = session.export(), s = saved.states[0], d = s.data;
  const cards = new Map([...d.hands.flat(), ...d.drawPile, ...d.discard].map(c => [c.id,c]));
  const take = id => { const c=cards.get(id); assert(c,id); cards.delete(id); return c; };
  d.discard=[take('u9')]; d.color='red'; d.direction=1; d.drawn=null; d.noDraw=false; d.stalled=0;
  d.hands=[(wildFirst?['u100','u1','u26','u3','u27','u4','u2']:['u1','u26','u100','u3','u27','u4','u2']).map(take), ['u5','u76','u30','u50','u60','u81','u52'].map(take)];
  d.drawPile=[...cards.values()]; if(longHand)d.hands[0].push(...d.drawPile.splice(0)); s.turn=0;
  Core.validateState(s); return saved;
}
const source=(page,id='u1')=>page.locator(`.hand-track .uno-card[data-entity="card-${id}"]`);
const drop=page=>page.locator('.uno-discard [data-drop-piece]').first();
async function state(page){return page.evaluate(()=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current);}
async function expectMove(page,n){await page.waitForFunction(n=>TabletopSession.restore(TabletopCore,JSON.parse(localStorage.getItem('playroom.session.v1'))).current.move===n,n);await page.locator('.scene[aria-busy="false"]').waitFor({state:'visible'});}
async function center(locator){await locator.scrollIntoViewIfNeeded();return locator.evaluate(el=>{const b=el.getBoundingClientRect();for(const fy of [.5,.12,.88])for(const f of [.5,.12,.88]){const p={x:b.x+b.width*f,y:b.y+b.height*fy},hit=document.elementFromPoint(p.x,p.y);if(hit===el||el.contains(hit))return p;}throw Error('Element has no reachable point in its visible card strip');});}
async function touch(cdp,type,point){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{...point,radiusX:4,radiusY:4,force:1}]});}
async function tap(cdp,locator){await touch(cdp,'touchStart',await center(locator));await touch(cdp,'touchEnd');}
async function mouseDrag(page,id='u1',{hold=true,outside=false,escape=false}={}){
  const p=await center(source(page,id));await page.mouse.move(p.x,p.y);await page.mouse.down();
  if(hold)await page.waitForTimeout(230);else await page.mouse.move(p.x,p.y-12);
  await page.locator('.playroom-drag-ghost').waitFor({state:'visible'});
  const target=outside?{x:6,y:6}:await center(drop(page));await page.mouse.move(target.x,target.y,{steps:6});
  if(escape)await page.keyboard.press('Escape');await page.mouse.up();
}
async function touchDrag(page,cdp,id='u1'){
  const p=await center(source(page,id));await touch(cdp,'touchStart',p);await page.waitForTimeout(270);
  await page.locator('.playroom-drag-ghost').waitFor({state:'visible'});const target=await center(drop(page));
  for(let i=1;i<=5;i++)await touch(cdp,'touchMove',{x:p.x+(target.x-p.x)*i/5,y:p.y+(target.y-p.y)*i/5});await touch(cdp,'touchEnd');
}

test('UNO desktop and touch drag/drop through the real application',{timeout:120000},async t=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  async function check(name,options,run){await t.test(name,async()=>{
    const context=await browser.newContext({viewport:options.landscape?{width:844,height:390}:options.mobile?{width:390,height:844}:{width:1280,height:900},hasTouch:!!options.mobile,isMobile:!!options.mobile,reducedMotion:'reduce'});
    const saved=fixture(options);await context.addInitScript(({saved,autoPass,handShape})=>{localStorage.clear();localStorage.setItem('playroom.settings.v1',JSON.stringify({motion:false,sound:false,quickPlay:false,autoPass,handShape}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},{saved,autoPass:!!options.autoPass,handShape:options.arc?'arc':'straight'});
    const page=await context.newPage(),errors=[];page.setDefaultTimeout(4500);page.on('pageerror',e=>errors.push(e.message));
    try{await page.goto(url);await page.locator('.resume-banner [data-command=resume]').click();await source(page).waitFor({state:'visible'});await run({page,context,saved});assert.deepEqual(errors,[]);}finally{await context.close();}
  });}
  try{
    for(const mobile of [false,true])for(const landscape of mobile?[false,true]:[false])await check(`Arc hand legal drag ${mobile?'touch':'mouse'} ${landscape?'landscape':'portrait'}`,{mobile,landscape,arc:true},async({page,context})=>{
      assert(await page.locator('.hand-track').evaluate(t=>t.classList.contains('is-arc')));
      const shape=await source(page).evaluate(c=>[c.offsetWidth,c.offsetHeight]);
      await page.evaluate(shape=>{const observer=new MutationObserver(()=>{const ghost=document.querySelector('.playroom-drag-ghost');if(ghost){window.arcGhostSize=[ghost.offsetWidth,ghost.offsetHeight];observer.disconnect();}});observer.observe(document.body,{childList:true});},shape);
      if(mobile)await touchDrag(page,await context.newCDPSession(page));else await mouseDrag(page);
      assert.deepEqual(await page.evaluate(()=>arcGhostSize),shape,'drag preserves intrinsic card dimensions');
      await expectMove(page,1);assert.equal((await state(page)).data.discard.at(-1).id,'u1');
    });
    await check('Mouse hold over a legal card highlights discard and drops exactly one move',{},async({page,saved})=>{
      const p=await center(source(page));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(230);
      assert.equal(await page.locator('.playroom-drag-ghost').count(),1);
      assert.equal((await state(page)).move,0,'Picking up must not play the card');
      assert.equal(await drop(page).getAttribute('data-drop-piece'),'u1');
      const action=JSON.parse(await drop(page).getAttribute('data-action'));assert(Core.legalActions(saved.states[0],0).some(a=>a.type===action.type&&a.card===action.card));
      const q=await center(drop(page));await page.mouse.move(q.x,q.y,{steps:6});assert.equal(await page.locator('.playroom-drop-hover').count(),1);await page.mouse.up();await expectMove(page,1);
      assert.equal((await state(page)).data.discard.at(-1).id,'u1');assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal((await state(page)).move,1);
    });
    await check('Upward mouse movement starts dragging without a hold; a normal click selects before discard commits',{},async({page})=>{
      await mouseDrag(page,'u1',{hold:false});await expectMove(page,1);await page.locator('[data-command=pass-device]:not(:disabled)').click();const p=await center(source(page,'u5'));await page.mouse.click(p.x,p.y);assert.equal((await state(page)).move,1);assert.equal(await drop(page).getAttribute('data-drop-piece'),'u5');await drop(page).click();await expectMove(page,2);assert.equal((await state(page)).data.discard.at(-1).id,'u5');
    });
    await check('Wild drag to discard chooses a color before exactly one legal commit',{wildFirst:true},async({page})=>{
      await mouseDrag(page,'u100');assert.equal((await state(page)).move,0);await page.locator('.uno-color-picker').waitFor({state:'visible'});
      const choices=page.locator('.uno-color-picker [data-action]');assert.equal(await choices.count(),4);
      let blue;for(let i=0;i<await choices.count();i++)if(JSON.parse(await choices.nth(i).getAttribute('data-action')).color==='blue')blue=choices.nth(i);
      assert(blue);await blue.click();await expectMove(page,1);assert.equal((await state(page)).data.color,'blue');assert.equal((await state(page)).data.discard.at(-1).id,'u100');
    });
    await check('Outside drop and Escape leave the hand and move unchanged',{},async({page,saved})=>{
      for(const gesture of [{outside:true},{escape:true}]){await mouseDrag(page,'u1',gesture);await page.waitForTimeout(35);assert.equal((await state(page)).move,0);assert.deepEqual((await state(page)).data.hands,saved.states[0].data.hands);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);}
    });
    await check('Illegal cards expose no drag source and cannot create a ghost or play',{},async({page})=>{
      const illegal=source(page,'u26');assert.equal(await illegal.getAttribute('data-drag-piece'),null);const p=await center(illegal);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(240);await page.mouse.move(p.x,p.y-100);await page.mouse.up();assert.equal(await page.locator('.playroom-drag-ghost').count(),0);assert.equal((await state(page)).move,0);
    });
    await check('Touch drop then immediate fresh native tap selects; tapping discard plays the next card',{mobile:true,autoPass:true},async({page,context})=>{
      const cdp=await context.newCDPSession(page);await touchDrag(page,cdp);await expectMove(page,1);const at=Date.now();await tap(cdp,source(page,'u5'));assert(Date.now()-at<400);await page.locator('.uno-drop-target[data-drop-piece="u5"]').waitFor({state:'visible'});assert.equal((await state(page)).move,1);await tap(cdp,drop(page));await expectMove(page,2);assert.equal((await state(page)).data.discard.at(-1).id,'u5');
    });
    await check('Horizontal touch swipes reach every card in a long single row without growing the table or playing',{mobile:true,longHand:true,arc:true},async({page,context,saved})=>{
      const track=page.locator('.hand-track'),cdp=await context.newCDPSession(page),seen=new Set();
      assert.equal(await page.locator('.hand-track .uno-card').count(),saved.states[0].data.hands[0].length);
      assert.equal(await page.locator('.hand-track .hand-fan-row').count(),1);
      const measure=()=>track.evaluate(el=>{
        const b=el.getBoundingClientRect(),scene=document.querySelector('.scene'),visible=[];
        for(const card of el.querySelectorAll('.uno-card')){
          const r=card.getBoundingClientRect();let reached=false;
          for(const fy of [.12,.5,.88])for(const fx of [.12,.5,.88]){
            const x=r.x+r.width*fx,y=r.y+r.height*fy;
            if(x<b.left||x>b.right||y<b.top||y>b.bottom)continue;
            const hit=document.elementFromPoint(x,y);if(hit===card||card.contains(hit))reached=true;
          }
          if(reached)visible.push(card.dataset.entity.replace(/^card-/,''));
        }
        return{visible,x:b.x,y:b.y,width:b.width,height:b.height,scrollLeft:el.scrollLeft,
          maxScroll:el.scrollWidth-el.clientWidth,overflowY:el.scrollHeight-el.clientHeight,
          sceneHeight:scene.getBoundingClientRect().height,sceneOverflowY:scene.scrollHeight-scene.clientHeight};
      });
      const initial=await measure();assert(initial.maxScroll>100,'Long hand must use horizontal scrolling');
      let current=initial,swipes=0;
      while(true){
        current.visible.forEach(id=>seen.add(id));
        assert(Math.abs(current.height-initial.height)<=1,'Hand height must stay fixed while scrolling');
        assert(Math.abs(current.sceneHeight-initial.sceneHeight)<=1,'Table height must stay fixed while scrolling');
        assert(current.overflowY<=1,'Hand must not gain a vertical scroll region');
        assert(current.sceneOverflowY<=initial.sceneOverflowY+1,'Scrolling the hand must not grow the scene');
        if(current.scrollLeft>=current.maxScroll-1)break;
        assert(swipes++<40,'Horizontal gestures must reach the end in a bounded number of swipes');
        const start={x:current.x+current.width-28,y:current.y+current.height*.5},travel=current.width-56;
        await touch(cdp,'touchStart',start);
        for(let step=1;step<=5;step++){
          await touch(cdp,'touchMove',{x:start.x-travel*step/5,y:start.y});
          await page.evaluate(()=>new Promise(requestAnimationFrame));
          (await measure()).visible.forEach(id=>seen.add(id));
        }
        await touch(cdp,'touchEnd');
        await page.waitForFunction(before=>document.querySelector('.hand-track').scrollLeft>before+1,current.scrollLeft);
        current=await measure();
        assert.equal((await state(page)).move,0,'Horizontal swipe must never commit a card');
        assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
      }
      assert.deepEqual([...seen].sort(),saved.states[0].data.hands[0].map(c=>c.id).sort(),'Every card must expose a reachable corner during native touch scrolling');
      assert(swipes>0);
      assert.equal((await state(page)).move,0);
    });
    await check('Held card stays inside a narrow viewport without introducing page overflow',{mobile:true},async({page,context})=>{
      const cdp=await context.newCDPSession(page),p=await center(source(page));await touch(cdp,'touchStart',p);await page.waitForTimeout(270);await touch(cdp,'touchMove',{x:389,y:843});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));const b=await page.locator('.playroom-drag-ghost').boundingBox();assert(b&&b.x>=0&&b.y>=0&&b.x+b.width<=391&&b.y+b.height<=845);await touch(cdp,'touchCancel');assert.equal((await state(page)).move,0);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
    });
  }finally{await browser.close();}
});
