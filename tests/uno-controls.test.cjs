'use strict';
const TestUI=require('./browser-origin.cjs');
const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const Core = require('../core/engine.js'), Session = require('../core/session.js');
require('../packs/uno/rules.js');
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
  return page.evaluate(()=>Object.fromEntries(['.scene','.layout-field','.layout-actions','.layout-hand','.game-action-bar','.uno-call','.uno-card-help'].map(selector=>{
    const el=document.querySelector(selector),r=el.getBoundingClientRect();
    return[selector,{x:r.x,y:r.y,width:r.width,height:r.height,...(selector==='.uno-call'||selector==='.uno-card-help'?{className:el.className}:{})}];
  })));
}
async function layout(page,{handCount=7}={}) {
  const errors=await page.evaluate(handCount=>{
    const errors=[],scene=document.querySelector('.scene'),r=el=>el.getBoundingClientRect(),inside=(a,b)=>b.left>=a.left-1&&b.right<=a.right+1&&b.top>=a.top-1&&b.bottom<=a.bottom+1;
    if(scene.scrollWidth>scene.clientWidth+1||scene.scrollHeight>scene.clientHeight+1)errors.push(`scene scroll ${scene.scrollWidth}/${scene.clientWidth} × ${scene.scrollHeight}/${scene.clientHeight}`);
    if(document.documentElement.scrollWidth>innerWidth+1||document.documentElement.scrollHeight>innerHeight+1)errors.push('page overflow');
    const dock=document.querySelector('.game-action-bar'),hand=document.querySelector('.own-hand');
    if(!dock)errors.push('missing dedicated bottom dock');
    else if(dock.closest('.layout-self')!==hand.closest('.layout-self'))errors.push('actions and hand separated');
    const deck=document.querySelector('.stock-button'),discard=document.querySelector('.uno-discard'),direction=document.querySelector('.uno-direction'),center=document.querySelector('.uno-center'),opponents=document.querySelector('.opponent-hands');
    const arrow=direction?r(direction):null,field=r(center);
    if(arrow&&Math.abs(arrow.x+arrow.width/2-field.x-field.width/2)>1)errors.push('direction not centered above the piles');
    if(arrow&&arrow.bottom>field.top+1)errors.push('direction not above piles');
    for(const mini of document.querySelectorAll('.mini-hand'))for(const card of mini.querySelectorAll('.uno-card,.piece-back,.shared-card-back')){
      const m=r(mini),c=r(card),parent=r(mini.closest('.opponent-hand'));
      if(c.top<m.top-1||m.bottom>parent.bottom+1||m.height>=c.height)errors.push('opponent hand must crop the full-size cards inside its panel');
    }
    for(const selector of ['.uno-call','.uno-card-help']){
      const el=document.querySelector(selector),b=r(el);
      if(el.closest('.scene-actions'))errors.push('utility mixed with ordinary actions');
      if(!el.closest('.layout-actions'))errors.push('utility outside application actions slot');
      if(b.width<44||b.height<44)errors.push('small utility target');
      if(!inside(r(scene),b))errors.push('utility outside scene');
      if(dock.dataset.exclusive==='true'){
        if(!el.closest('[inert][aria-hidden="true"]')||getComputedStyle(el).visibility!=='hidden')errors.push('secondary control still active during choice');
        continue;
      }
      if(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest(selector)!==el)errors.push('utility covered');
      for(const other of document.querySelectorAll('.opponent-hands,.uno-center,.own-hand,.uno-actions')){
        const a=r(other);
        if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)errors.push('utility overlaps '+other.className);
      }
    }
    const track=document.querySelector('.hand-track'),cards=[...track.querySelectorAll('[data-hand-preview]')];
    if(cards.length!==handCount)errors.push('wrong hand count');
    if(getComputedStyle(track).overflowX!=='auto')errors.push('hand scroll disabled');
    if(track.querySelectorAll('.hand-fan-row').length!==1)errors.push('hand wrapped into more than one row');
    for(const card of cards){
      const b=r(card),corner=r(card.querySelector('[data-card-index=top] text'));
      if(b.width<54||b.height<77)errors.push('own cards became too small');
      if(b.top<r(scene).top||b.bottom>r(scene).bottom)errors.push('hand card clipped vertically');
      if(handCount<=7&&!inside(r(scene),corner))errors.push('card corner outside scene');
    }
    const colors=[...document.querySelectorAll('.color-choice')];
    if(colors.length&&new Set(colors.map(el=>r(el).top)).size!==1)errors.push('color choice grows into multiple rows');
    for(const color of colors){const b=r(color);if(b.width<44||b.height<44||!inside(r(scene),b)||!color.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)))errors.push('invalid color target '+JSON.stringify({b,hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.outerHTML.slice(0,180)}));}
    return errors;
  },handCount);
  const details=errors.length?await page.evaluate(()=>Object.fromEntries(['.table-shell','.table-header','.table-status','.layout-participants','.scene','.uno-scene','.opponent-hands','.uno-center','.game-action-bar','.own-hand'].map(selector=>{const el=document.querySelector(selector),r=el.getBoundingClientRect(),c=getComputedStyle(el);return [selector,{height:r.height,top:r.top,minHeight:c.minHeight,padding:c.padding,position:c.position,display:c.display}];}))):null;
  assert.deepEqual(errors,[],JSON.stringify(details));
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
    const projected=TabletopCore.project(s,0),actions=variant==='paused'?[]:TabletopCore.legalActions(s,0);
    // Keep application-owned Hotseat controls in every pack-state variant.
    // A raw pack render omits that reserved row and is not the live layout.
    const markup=PlayroomGameScreen.render({layoutId:'uno-controls-fixture',gameName:'UNO',state:projected,viewer:0,actions,
      scene:PlayroomViews.render(projected,0,actions,{selected,quickPlay:false}),
      beforeFooter:document.querySelector('.pass-device-button')?.outerHTML||''});
    const host=document.querySelector('#app');PlayroomGameScreen.update(host,markup);PlayroomGameScreen.layoutScene(host);
  },{state,variant,handCount});
}
test('Responsive UNO utilities, turn direction and cropped opponent hands stay stable',{timeout:120000},async t=>{
  const server=process.env.PLAYROOM_URL?.startsWith('http')?null:await TestUI.serveBrowserFixture(path.resolve(__dirname,'..'));
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const screens=[{width:320,height:640},{width:390,height:740},{width:1280,height:900},{width:1226,height:825},{width:817,height:550,scale:1.5}];
  try{
    for(const screen of screens)for(const players of [2,4]){
      const viewport={width:screen.width,height:screen.height};
      await t.test(`${players} players, ${viewport.width}×${viewport.height}@${screen.scale||1}: hands 1/7/8/12, actions and wild`,async()=>{
        const context=await browser.newContext({viewport,deviceScaleFactor:screen.scale||1,isMobile:viewport.width<500,hasTouch:viewport.width<500,reducedMotion:'reduce'}),saved=fixture(players);
        await context.addInitScript(saved=>{localStorage.clear();localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'uno-controls-owner',name:'Аня',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({motion:false,sound:false,quickPlay:false,tutorialsEnabled:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);
        const network=await require('./account-sync-fixture.cjs').installFetch(context,route=>route.fulfill({json:{}}));
        const page=await context.newPage(),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
        try{
          await page.goto(server?.url||process.env.PLAYROOM_URL);await TestUI.resumeSaved(page);await page.locator('.uno-call').waitFor({state:'visible'});
          await layout(page);await showVariant(page,saved.states[0],'ordinary',7);
          const initial=await bounds(page),baselines={open:initial},order=await page.locator('.opponent-hand[data-player-index]').evaluateAll(els=>els.map(el=>el.dataset.playerIndex));await layout(page);
          for(const handCount of [1,7,8,12])for(const variant of ['ordinary','out-of-turn','wild','closed','reverse','paused',...(handCount===1?['declared']:[])]){
            await showVariant(page,saved.states[0],variant,handCount);
            const mode=variant==='closed'?'closed':'open',current=await bounds(page);
            if(!baselines[mode])baselines[mode]=current;
            for(const [selector,rect] of Object.entries(current))for(const [axis,value] of Object.entries(rect))if(typeof value==='number')assert(Math.abs(value-baselines[mode][selector][axis])<=1,`table or dock shifts for ${handCount} cards / ${variant}: ${selector} ${axis}: ${value} / ${baselines[mode][selector][axis]}`);
            await layout(page,{handCount});
            assert.deepEqual(await page.locator('.opponent-hand[data-player-index]').evaluateAll(els=>els.map(el=>el.dataset.playerIndex)),order,'player positions must not reorder with turn direction');
            if(players===2)assert.equal(await page.locator('.uno-direction').count(),0,'duel has no turn-direction arrow');
            else assert.equal(await page.locator('.uno-direction').getAttribute('data-direction'),variant==='reverse'?'-1':'1');
            if(variant==='closed')assert(await page.locator('.opponent-hands :is(.piece-back,.shared-card-back)').count()>0);
            if(variant==='paused')assert.equal(await page.locator('.uno-call').isEnabled(),false);
            if(variant==='wild')assert.equal(await page.locator('.color-choice').count(),4);
            if(players===4&&handCount===8&&variant==='closed'&&viewport.width===390){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'playroom-v0.7-uno-hidden-phone.png')});}
            if(players===2&&handCount===8&&variant==='wild'&&[320,390].includes(viewport.width)){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,`playroom-v0.7-uno-wild-${viewport.width}.png`)});}
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
              const projected=TabletopCore.project(s,0),actions=TabletopCore.legalActions(s,0),host=document.querySelector('#app');PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'uno-controls-fixture',gameName:'UNO',state:projected,viewer:0,actions,scene:PlayroomViews.render(projected,0,actions,{selected:null,quickPlay:false})}));PlayroomGameScreen.layoutScene(host);
            },saved.states[0]);
            const publicHands=await page.evaluate(()=>{
              const band=document.querySelector('.opponent-hands'),slot=band.closest('.layout-participants'),minis=[...document.querySelectorAll('.mini-hand.is-open')],scene=document.querySelector('.scene'),cards=[...band.querySelectorAll('.public-card')],r=el=>el.getBoundingClientRect(),b=r(band),s=r(scene),failures=[];
              for(const card of cards){
                card.scrollIntoView({block:'nearest',inline:'nearest'});const c=r(card),m=r(card.closest('.mini-hand'));if(c.left<m.left-1||c.right>m.right+1)failures.push('card outside public band');
                const visible=card.querySelector('[data-card-index=top] text').getBoundingClientRect();if(visible.left<m.left-1||visible.right>m.right+1)failures.push('covered public corner '+card.dataset.publicCardIndex);
              }
              return {counts:minis.map(mini=>mini.querySelectorAll('.public-card').length),rows:new Set(cards.map(c=>r(c).y)).size,scroll:Math.max(...minis.map(mini=>mini.scrollWidth-mini.clientWidth)),failures};
            });
            assert.deepEqual(publicHands.counts,[100,1,1]);assert(publicHands.rows>=1);assert(publicHands.scroll>1);assert.deepEqual(publicHands.failures,[]);
            if(viewport.width===320||viewport.width===390||viewport.width===1226){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,`playroom-v0.7-uno-open-100-allplayers-${viewport.width}.png`)});}
          }
          assert.deepEqual(errors,[]);assert.equal(network.nativeSupabaseRequests,0);
        }finally{await context.close();}
      });
    }
  }finally{await browser.close();await server?.close();}
});

test('UNO missed declaration deadlines continue under local Settings without a human accusation',{timeout:30000},async()=>{
 const base=path.resolve(__dirname,'..'),out=process.env.PLAYROOM_BOT_LIFECYCLE_EVIDENCE?path.join(process.env.PLAYROOM_BOT_LIFECYCLE_EVIDENCE,'uno'):path.resolve(base,'../tmp_files/ux-021/uno-modal-deadline');fs.mkdirSync(out,{recursive:true});const saved=new Session(Core,'uno',{seed:17,mode:'solo',unoMode:'manual',firstPlayerMode:'assigned',firstPlayer:1,players:[{name:'Иван'},{name:'Мика',bot:true,botSettings:{difficulty:'easy'}},{name:'Тео',bot:true}]}).export(),initial=saved.states[0],data=initial.data,cards=new Map([...data.hands.flat(),...data.drawPile,...data.discard].map(c=>[c.id,c])),take=id=>{const card=cards.get(id);assert(card);cards.delete(id);return card;};data.discard=[take('u9')];data.color='red';data.direction=1;data.drawn=null;data.noDraw=false;data.stalled=0;data.hands=[['u3','u4','u2'].map(take),['u1','u63'].map(take),['u5','u6','u7'].map(take)];data.drawPile=[...cards.values()];Core.validateState(initial);const probe=Session.restore(Core,saved);probe.act(1,Core.botAction(probe.current,1));assert.equal(probe.current.data.hands[1].length,1);assert.equal(Core.botReaction(probe.current,1),null,'the deterministic bot forgets this episode, without monkey-patching its policy');
 const engine=process.env.LAB_ENGINE||'chromium',server=await require('./browser-origin.cjs').serveBrowserFixture(base),browser=engine==='webkit'?await require('playwright-core').webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']}),context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'}),network=await require('./account-sync-fixture.cjs').installFetch(context,async route=>route.fulfill({json:{}})),page=await context.newPage(),errors=[],report={engine,actualBrowserType:browser.browserType().name(),browserVersion:browser.version()};page.setDefaultTimeout(5000);page.on('pageerror',error=>errors.push(error.message));
 try{await context.addInitScript(saved=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'uno-deadline-owner',name:'Иван',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'instant',quickPlay:false,autoPass:false,tutorialsEnabled:false}));localStorage.setItem('playroom.session.v1',JSON.stringify(saved));},saved);await page.goto(server.url);await page.locator('.game-tile').first().waitFor();await page.evaluate(()=>{window.unoDeadlineReady=[];window.unoDeadlineCommits=[];const ready=SessionAuthority.prototype._setReactionReady,act=SessionAuthority.prototype.actBot;SessionAuthority.prototype._setReactionReady=function(window){const result=ready.call(this,window);if(window.readyAt!==null)unoDeadlineReady.push({id:window.descriptor.id,owner:window.descriptor.owner,readyAt:window.readyAt,humanMs:window.descriptor.humanMs,botMs:window.descriptor.botMs,protected:this._snapshot(0).reactionWindow?.protected});return result;};SessionAuthority.prototype.actBot=function(actor,action,...rest){const before=this.revision,at=this._now(),result=act.call(this,actor,action,...rest);if(this.revision!==before)unoDeadlineCommits.push({actor,action:JSON.parse(JSON.stringify(action)),at,before,after:this.revision});return result;};});
  await page.locator('[data-command=sessions]').first().click();await page.locator('.saved-game[data-saved-actions-toggle]').first().click();await page.locator('#modal-root>[data-surface-state=active] [data-resume-id]').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1&&unoDeadlineReady.some(w=>w.owner===1));const entryId=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().id);report.initial=await page.evaluate(()=>({move:PlayroomAppBridge.saveLibrary.current().session.current.move,window:unoDeadlineReady.find(w=>w.owner===1)}));assert.equal(report.initial.window.protected,true,'the normal one-second human grace starts protected');
  await page.locator('[data-game-menu]').click();await page.locator('[data-game-menu-action][data-command=settings]').click();await page.locator('#modal-root>[data-surface-state=active] [data-settings-screen]').waitFor();const frame=await page.locator('#modal-root>[data-surface-state=active]').getAttribute('data-surface-id');assert.equal(await page.locator('#app').evaluate(app=>app.inert),true);
  await page.waitForFunction(()=>unoDeadlineCommits.some(c=>c.action.type==='accuse-uno'&&c.action.target===1),null,{timeout:6000});await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.turn===0&&PlayroomAppBridge.saveLibrary.current().session.current.move>=3,null,{timeout:6000});report.final=await page.evaluate(()=>({id:PlayroomAppBridge.saveLibrary.current().id,move:PlayroomAppBridge.saveLibrary.current().session.current.move,turn:PlayroomAppBridge.saveLibrary.current().session.current.turn,ready:unoDeadlineReady,commits:unoDeadlineCommits}));const accusations=report.final.commits.filter(c=>c.action.type==='accuse-uno'&&c.action.target===1);assert.equal(accusations.length,1);assert.equal(accusations[0].actor,2,'another bot completes the missed-call episode without a human command');assert(accusations[0].at>=report.initial.window.readyAt+report.initial.window.botMs,'the bot does not accuse before the legitimate deadline');assert(report.final.commits.every(c=>c.after===c.before+1));assert.equal(new Set(report.final.commits.map(c=>c.after)).size,report.final.commits.length);assert.equal(report.final.id,entryId);assert.equal(await page.locator('#modal-root>[data-surface-state=active]').getAttribute('data-surface-id'),frame,'settings stays open while authority progresses');await page.screenshot({path:path.join(out,engine+'-settings-progress.png'),animations:'disabled'});await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();await page.locator('.game-menu-panel .modal-head [data-game-menu-close]').click();assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),report.final.move);
  const humanActions=[];let botEnteredAt=null;for(let step=0;step<3;step++){
   await page.waitForFunction(()=>document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')!=='true');
   const before=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {move:s.move,turn:s.turn};});if(before.turn!==0)break;
   const choice=await page.locator('.table-shell [data-action]').evaluateAll(nodes=>nodes.map((node,index)=>({index,node,action:JSON.parse(node.dataset.action)})).filter(({node,action})=>['draw','pass'].includes(action.type)&&!node.disabled&&node.getClientRects().length&&getComputedStyle(node).visibility==='visible'&&!node.closest('[hidden],[inert]')).map(({index,action})=>({index,action})).sort((a,b)=>Number(b.action.type==='pass')-Number(a.action.type==='pass'))[0]||null);
   assert(choice,'ordinary draw/pass remains available without pressing the optional accusation');await page.locator('.table-shell [data-action]').nth(choice.index).tap();
   await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current().session.current.move>move,before.move);const after=await page.evaluate(()=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return {move:s.move,turn:s.turn};});humanActions.push({before,action:choice.action,after});if(after.turn!==0){botEnteredAt=after.move;break;}
  }
  assert(humanActions.length>0);assert.notEqual(botEnteredAt,null,'ordinary controls hand the turn to bots without an optional accusation');await page.waitForFunction(move=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return s.move>move&&s.turn===0&&document.querySelector('.table-shell>.scene')?.getAttribute('aria-busy')!=='true';},botEnteredAt,{timeout:10000});
  report.continuation=await page.evaluate(()=>{const entry=PlayroomAppBridge.saveLibrary.current();return {id:entry.id,move:entry.session.current.move,turn:entry.session.current.turn,commits:unoDeadlineCommits};});report.continuation.humanActions=humanActions;assert.equal(report.continuation.id,entryId);
  const oldEpisode=accusations[0].action.episode;assert.equal(report.continuation.commits.filter(c=>c.action.type==='accuse-uno'&&c.action.target===1&&c.action.episode===oldEpisode).length,1,'continuation never repeats the resolved old penalty');assert.equal(await page.locator('#app').evaluate(app=>app.inert),false);assert.equal(await page.locator('#modal-root>[data-surface-state=active]').count(),0);
  assert.deepEqual(errors,[]);assert.equal(network.nativeSupabaseRequests,0);
 }finally{fs.writeFileSync(path.join(out,engine+'-report.json'),JSON.stringify({...report,errors,nativeSupabaseRequests:network.nativeSupabaseRequests},null,2));await context.close();await browser.close();await server.close();}
});

test('UNO result UI orders remaining hands by points without leaking live totals',{timeout:30000},async()=>{
 const server=await TestUI.serveBrowserFixture(path.resolve(__dirname,'..')),browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 try{const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'uno-results',name:'Анна'})));
  if(process.env.PLAYROOM_TEST_ARTIFACT){await p.route(server.url,r=>r.fulfill({contentType:'text/html',body:fs.readFileSync(process.env.PLAYROOM_TEST_ARTIFACT)}));}
  await p.goto(server.url);await TestUI.ready(p);
  const result=await p.evaluate(()=>{
   const E=TabletopCore,s=E.createGame('uno',{seed:17,preset:'classic',unoMode:'auto',players:['Анна','Борис','Вера','Глеб','Дина'].map(name=>({name}))}),d=s.data,cards=[...d.hands.flat(),...d.drawPile,...d.discard];
   const take=(color,value)=>{const i=cards.findIndex(c=>c.color===color&&c.value===value);if(i<0)throw Error('Missing fixture card');return cards.splice(i,1)[0];};
   d.discard=[take('red','1')];d.color='red';d.hands=[[take('red','2')],[take('yellow','9'),take('blue','7')],[take('green','+2')],[take('wild','+4')],[take('wild','wild')]];d.drawPile=cards;s.turn=0;E.validateState(s);
   const before=E.project(s,-1);if(before.data.finalHandPoints!==undefined||before.players.some(p=>p.score!==0))throw Error('Private live point total exposed');
   const finished=E.applyAction(s,0,E.legalActions(s,0).find(c=>c.type==='play'&&c.card===d.hands[0][0].id)),state=E.project(finished,0);window.unoResultState=state;PlayroomAppBridge.openModal(PlayroomGameScreen.resultMarkup({state,viewer:0,gameName:'UNO'}),'result-modal');return {status:finished.status,places:finished.result.places,metrics:finished.result.metrics};
  });
  assert.equal(result.status,'finished');assert.deepEqual(result.places,[1,2,3,4,4]);assert.deepEqual(result.metrics.find(m=>m.id==='points').values,[0,16,20,50,50]);await p.locator('.result-modal .result-person').nth(4).waitFor();assert.equal(await p.locator('.result-person').count(),5);assert.deepEqual((await p.locator('.result-core-counters [data-score-id=points]').allTextContents()).map(x=>x.trim()),['0','16','20','50','50']);assert.deepEqual(errors,[]);
  const out=process.env.PLAYROOM_CAPTURE_DIR||path.join(__dirname,'../../tmp_files/mage-teams-1113/screenshots-final');fs.mkdirSync(out,{recursive:true});await p.screenshot({path:path.join(out,'uno-results.png')});
 }finally{await browser.close();await server.close();}
});
