'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium, executablePath} = require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');

test('Flip backs remain visible inside their clones and draws keep the stock aspect ratio',{timeout:30000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage();
    await page.setContent('<style>*{box-sizing:border-box}.scene{width:390px;height:740px}.slot{position:relative;width:70px;height:100px}.face,.back{display:block;width:100%;height:100%}.back{position:absolute;inset:0;visibility:hidden;transform:rotateY(-90deg)}.back button{width:100%;height:100%}.stock-button{position:absolute;left:100px;top:300px;width:70px;height:100px;padding:0;border:0}.piece-back{display:block;width:100%;height:100%;background:green}.mini-hand{position:absolute;left:20px;top:40px;width:130px;height:44px}</style><div class="scene"><div class="slot" data-motion-effect="flip" data-motion-trigger="flip" data-motion-key="index" data-motion-value="0" data-motion-close="true"><span class="face" data-motion-face><button>Public face</button></span><span class="back" data-motion-back><button>Public back</button></span></div><button class="stock-button" data-motion-stock><span class="piece-back"></span></button><div data-player-index="1"><div class="mini-hand"></div></div></div>');
    await page.addScriptTag({path:path.join(root,'core/motion.js')});
    const result=await page.evaluate(async()=>{
      const flip=PlayroomMotion.play({action:{type:'flip',index:1},entities:new Map(),flips:new Map()},{duration:300,effects:{flip:300,pair:200}});
      const sides=[...document.querySelectorAll('[data-motion-kind=flip]>div>* button')].map(n=>getComputedStyle(n).visibility);
      PlayroomMotion.cancel();await flip;document.querySelector('.slot').remove();
      const shot=PlayroomMotion.capture({actor:1,viewer:0,action:{type:'draw'}}),draw=PlayroomMotion.play(shot,{duration:500,draws:[{player:1,count:1,from:'stock'}]});
      const piece=document.querySelector('.playroom-motion-piece[data-motion-kind=draw]'),samples=[];
      for(const fraction of [.05,.5,.95]){for(const a of document.getAnimations()){a.pause();a.currentTime=a.effect.getTiming().duration*fraction;}const r=piece.getBoundingClientRect();samples.push(r.width/r.height);}
      PlayroomMotion.cancel();await draw;
      return {sides,sourceRatio:shot.stock.width/shot.stock.height,samples,layers:document.querySelectorAll('.playroom-motion-layer').length};
    });
    assert.deepEqual(result.sides,['visible','visible']);
    assert(result.samples.every(ratio=>Math.abs(ratio-result.sourceRatio)<.01),JSON.stringify(result));
    assert.equal(result.layers,0);
  }finally{await browser.close();}
});

test('Motion effects move only public pieces and clean up at completion or cancellation',{timeout:90000},async t=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  async function check(name,run){await t.test(name,async()=>{
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'no-preference'}),page=await context.newPage();
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    try{
      await page.setContent('<style>*{box-sizing:border-box}body{margin:0}.scene{position:absolute;left:20px;top:20px;width:350px;height:780px;background:#ddd;--face:#d47755}.hand-track{position:absolute;left:12px;top:580px;width:320px;height:130px;display:flex;gap:12px;overflow:auto}.mini-hand{position:absolute;left:110px;top:50px;width:110px;height:46px;display:flex}.piece-back{width:30px;height:44px;background:green}.card{position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;width:66px;height:98px;background:var(--face);color:white;border:4px solid #fff;border-radius:10px;box-shadow:0 3px 0 #aaa;font:700 16px sans-serif}.card span{font-size:18px}.public-card{position:absolute;left:205px;top:290px}.stock-button{position:absolute;left:35px;top:290px;width:66px;height:98px}.stock-button .piece-back{width:100%;height:100%}.die{position:absolute;left:30px;top:380px;width:50px;height:50px;background:#fff;transform:rotate(-5deg)}.token{position:absolute;width:30px;height:30px;border-radius:50%;background:#568669}.board{position:absolute;left:20px;top:180px;width:300px;height:250px}</style><main id="app"></main>');
      await page.addStyleTag({path:path.join(root,'core/motion.css')});await page.addScriptTag({path:path.join(root,'core/motion.js')});
      await page.evaluate(()=>{
        window.drawScene=(mode='before',card='c1')=>{
          const own=mode==='before'?'<button class="card" data-entity="card-c1" data-action="secret-action" id="source"><span>OWN CARD</span></button><button class="card" data-entity="card-other"><span>OTHER</span></button>':mode==='draw'?'<button class="card" data-entity="card-c1"><span>OWN CARD</span></button><button class="card" data-entity="card-new"><span>NEW</span></button>':'<button class="card" data-entity="card-other"><span>OTHER</span></button>';
          document.querySelector('#app').innerHTML=`<section class="scene"><div data-player-index="1"><div class="mini-hand"><div class="piece-back" data-secret="private-hand">HIDDEN BACK</div></div></div><button class="stock-button" data-motion-stock><span class="piece-back"></span></button><button class="card public-card" data-entity="card-${mode==='before'||mode==='draw'?'old':card}" data-action="public-action" id="destination"><span>${mode==='before'||mode==='draw'?'OLD':'PUBLIC PLAY'}</span></button><div class="hand-track">${own}</div><div class="board"><span class="token" data-entity="checker-42" style="left:${mode==='before'?20:180}px;top:${mode==='before'?180:20}px"></span></div><div class="die" data-motion-lead="roll">⚄</div></section>`;
        };
        drawScene();
      });
      await run(page);assert.deepEqual(errors,[]);
    }finally{await context.close();}
  });}
  try{
    await check('Rotated hands preserve the complete frozen SVG back during draw and cancel on resize',async page=>{
      const result=await page.evaluate(async()=>{
        const stock=document.querySelector('.stock-button .piece-back');stock.style.display='block';stock.innerHTML='<svg width="100%" height="100%" viewBox="0 0 66 98"><rect width="66" height="98" fill="green"/></svg>';
        const owner=document.querySelector('[data-player-index="1"]');owner.style.cssText='position:absolute;left:160px;top:20px;width:150px;height:64px;transform:rotate(90deg)';
        const snapshot=PlayroomMotion.capture({actor:1,viewer:0,action:{type:'draw'}});
        const flight=PlayroomMotion.play(snapshot,{duration:500,draws:[{player:1,count:1,from:'stock'}]}),clone=document.querySelector('.playroom-motion-piece[data-motion-kind="draw"]'),samples=[];
        for(const fraction of [.1,.5,.9]){
          for(const animation of document.getAnimations()){animation.pause();animation.currentTime=animation.effect.getTiming().duration*fraction;}
          const back=clone.getBoundingClientRect(),svg=clone.querySelector('svg').getBoundingClientRect();samples.push({w:back.width,h:back.height,sw:svg.width,sh:svg.height});
        }
        window.dispatchEvent(new Event('resize'));await flight;
        return {angle:snapshot.hands.get(1).angle,samples,layers:document.querySelectorAll('.playroom-motion-layer').length};
      });assert.equal(Math.round(result.angle),90);assert(result.samples.every(s=>Math.abs(s.w-s.sw)<1&&Math.abs(s.h-s.sh)<1),JSON.stringify(result));assert.equal(result.layers,0);
    });
    await check('Own played card visibly travels upward, preserves face styling and restores destination',async page=>{
      const start=await page.evaluate(()=>{
        const snapshot=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}}),from=snapshot.entities.get('card-c1').rect;
        drawScene('after');window.done=false;window.flight=PlayroomMotion.play(snapshot,{duration:420}).then(()=>done=true);const first=document.querySelector('.playroom-motion-piece[data-motion-kind=play]').getBoundingClientRect();return {origin:from,first:{y:first.y}};
      });
      const clone=page.locator('.playroom-motion-piece[data-motion-kind=play]');assert.equal(await clone.count(),1);assert.equal(await clone.getAttribute('data-entity'),null);assert.equal(await clone.getAttribute('data-action'),null);assert.equal(await clone.getAttribute('id'),null);
      assert.equal(await clone.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(212, 119, 85)');assert.match(await clone.textContent(),/PUBLIC PLAY/);
      assert.equal(await page.locator('.scene .public-card').evaluate(el=>getComputedStyle(el).visibility),'hidden');assert(start.first.y>start.origin.y-5);
      await page.waitForTimeout(120);const middle=await clone.boundingBox();assert(middle.y<start.first.y-50,'Played card must visibly leave the hand');
      assert.equal(await page.evaluate(()=>done),false);await page.evaluate(()=>flight);assert.equal(await page.locator('.playroom-motion-layer').count(),0);assert.equal(await page.locator('.scene .public-card').evaluate(el=>getComputedStyle(el).visibility),'visible');
    });
    await check('Opponent play starts at hidden hand but clones only the newly public card',async page=>{
      const origin=await page.evaluate(()=>{
        const snapshot=PlayroomMotion.capture({actor:1,viewer:0,action:{type:'play',card:'hidden-card'}});drawScene('after','hidden-card');window.flight=PlayroomMotion.play(snapshot,{duration:360});return snapshot.origin;
      });
      const clone=page.locator('.playroom-motion-piece[data-motion-kind=play]');assert.equal(await clone.count(),1);assert.equal(await clone.locator('[data-secret]').count(),0);assert.match(await clone.textContent(),/PUBLIC PLAY/);assert.doesNotMatch(await clone.textContent(),/HIDDEN BACK/);
      const b=await clone.boundingBox();assert(b.y<origin.y+100,'Opponent card must originate above the board');assert(await page.locator('.mini-hand').isVisible());await page.evaluate(()=>flight);
    });
    await check('Replay infers a newly public card without action.card',async page=>{
      await page.evaluate(()=>{const snap=PlayroomMotion.capture({actor:0,viewer:0});drawScene('after');window.flight=PlayroomMotion.play(snap,{duration:250});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=play]').count(),1);await page.evaluate(()=>flight);
    });
    await check('Zero duration or unchanged state produces no overlay and resolves immediately',async page=>{
      const result=await page.evaluate(async()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}});drawScene('after');let start=performance.now();await PlayroomMotion.play(snap,{duration:0});const zero=performance.now()-start;
        const unchanged=PlayroomMotion.capture({actor:0,viewer:0});start=performance.now();await PlayroomMotion.play(unchanged,{duration:1100});return{zero,empty:performance.now()-start,layers:document.querySelectorAll('.playroom-motion-layer').length};
      });assert.equal(result.layers,0);assert(result.zero<100&&result.empty<100,JSON.stringify(result));
    });
    await check('Cancellation restores styles synchronously and resolves even after destination is detached',async page=>{
      const result=await page.evaluate(async()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}});drawScene('after');const destination=document.querySelector('.public-card');destination.style.setProperty('visibility','visible','important');
        let resolved=false;const promise=PlayroomMotion.play(snap,{duration:1100}).then(()=>resolved=true);destination.remove();PlayroomMotion.cancel();
        const sync={layers:document.querySelectorAll('.playroom-motion-layer').length,visibility:destination.style.visibility,priority:destination.style.getPropertyPriority('visibility')};await promise;return{...sync,resolved};
      });assert.deepEqual(result,{layers:0,visibility:'visible',priority:'important',resolved:true});
    });
    await check('Offscreen hand sources are clamped and flight never changes document scroll extents',async page=>{
      const result=await page.evaluate(async()=>{
        const hand=document.querySelector('.hand-track'),source=hand.querySelector('[data-entity="card-c1"]');source.style.marginLeft='900px';
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}}),from=snap.entities.get('card-c1').rect,handRect=hand.getBoundingClientRect();
        drawScene('after');const before={width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight};const promise=PlayroomMotion.play(snap,{duration:320}),sizes=[];
        await new Promise(resolve=>{function sample(){sizes.push({width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight});if(document.querySelector('.playroom-motion-layer'))requestAnimationFrame(sample);else resolve();}sample();});await promise;
        return{from,hand:{x:handRect.left,right:handRect.right},before,sizes};
      });assert(result.from.x>=result.hand.x&&result.from.x+result.from.width<=result.hand.right);assert(result.sizes.every(s=>s.width===result.before.width&&s.height===result.before.height));
    });
    await check('Board token and die animate locally, and drawn own card starts at stock',async page=>{
      await page.evaluate(()=>{const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'roll'}});drawScene('draw');window.flight=PlayroomMotion.play(snap,{duration:300});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=move]').count(),1);assert.equal(await page.locator('.playroom-motion-flight[data-motion-kind=roll]').count(),1);assert.equal(await page.locator('.scene .die').evaluate(el=>el.getAnimations().length),0);assert.equal(await page.locator('.scene').evaluate(el=>getComputedStyle(el).transform),'none');await page.evaluate(()=>flight);
      await page.evaluate(()=>{drawScene();const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');window.flight=PlayroomMotion.play(snap,{duration:250});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=draw]').count(),1);await page.evaluate(()=>flight);
    });
    await check('Pack routes wait for the die, visit every anchor, hold the landing and then jump',async page=>{
      const result=await page.evaluate(async()=>{
        document.querySelector('#app').innerHTML='<main class="table-shell"><div class="status-event">Finished</div><section class="scene"><div class="app-game-layout"><div class="player-panel" data-player-index="0"><span data-motion-counter="position">Cell 8</span></div><div class="player-panel is-turn" data-player-index="1"></div><div class="board"><span class="token" data-entity="token-0" style="left:220px;top:50px"></span></div><button class="die" data-motion-lead="roll">6</button></div></section></main>';
        const stage=document.querySelector('.app-game-layout'),board=document.querySelector('.board');
        for(let n=0;n<=8;n++){const anchor=document.createElement('span');anchor.dataset.motionAnchor='cell-'+n;Object.assign(anchor.style,{position:'absolute',left:(n*25)+'px',top:'50px',width:'20px',height:'20px'});board.append(anchor);}
        stage.dataset.motionSequence=JSON.stringify({trigger:'roll',entity:'token-0',player:0,counter:'position',origin:{anchor:'cell-0',label:'Start'},steps:[{anchor:'cell-1',label:'Cell 1'},{anchor:'cell-2',label:'Cell 2'},{anchor:'cell-3',label:'Cell 3'}],jump:{anchor:'cell-8',label:'Cell 8'}});
        const snapshot=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'roll'}}),counter=document.querySelector('[data-motion-counter]');
        const before={w:document.querySelector('.scene').scrollWidth,h:document.querySelector('.scene').scrollHeight};
        const promise=PlayroomMotion.play(snapshot,{duration:120,settle:90}),flight=document.querySelector('[data-motion-kind="route"]'),animation=flight.getAnimations()[0],frames=animation.effect.getKeyframes(),timing=animation.effect.getTiming();
        const initial=counter.textContent,labels=[];const observer=new MutationObserver(()=>labels.push(counter.textContent));observer.observe(counter,{childList:true});
        const sizes=[];await new Promise(resolve=>{const sample=()=>{sizes.push({w:document.querySelector('.scene').scrollWidth,h:document.querySelector('.scene').scrollHeight});if(document.querySelector('.playroom-motion-layer'))requestAnimationFrame(sample);else resolve();};sample();});await promise;observer.disconnect();
        return {initial,labels,before,sizes,offsets:frames.map(f=>f.offset),duration:timing.duration,final:counter.textContent,layers:document.querySelectorAll('.playroom-motion-layer').length,active:document.querySelector('.player-panel.is-turn').dataset.playerIndex};
      });
      assert.equal(result.initial,'Start');assert.deepEqual([...new Set(result.labels)],['Cell 1','Cell 2','Cell 3','Cell 8']);assert.equal(result.duration,420);
      assert.deepEqual(result.offsets.map(x=>Math.round(x*420)),[0,120,150,180,210,300,420]);assert(result.sizes.every(s=>s.w===result.before.w&&s.h===result.before.h));assert.equal(result.final,'Cell 8');assert.equal(result.layers,0);assert.equal(result.active,'1');
    });
    await check('A final +4 play precedes four staggered hidden-opponent stock transfers',async page=>{
      await page.evaluate(()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'}});drawScene('after');window.done=false;window.started=performance.now();
        window.flight=PlayroomMotion.play(snap,{duration:240,draws:[{player:1,count:4,from:'stock'}]}).then(()=>{window.elapsed=performance.now()-started;done=true;});
      });
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=play]').count(),1);
      const backs=page.locator('.playroom-motion-piece[data-motion-kind=draw][data-motion-player="1"]');assert.equal(await backs.count(),4);
      assert.equal(await backs.locator('[data-secret]').count(),0);assert.doesNotMatch(await backs.allTextContents().then(x=>x.join(' ')),/PUBLIC PLAY|OWN CARD/);
      const delays=await page.locator('.playroom-motion-flight[data-motion-kind=draw]').evaluateAll(nodes=>nodes.map(el=>el.getAnimations()[0].effect.getTiming().delay));assert.deepEqual(delays,[240,312,384,456]);
      await page.waitForTimeout(250);assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=play]').count(),0);assert.equal(await page.locator('.scene .public-card').evaluate(el=>getComputedStyle(el).visibility),'visible');assert.equal(await page.evaluate(()=>done),false);
      await page.evaluate(()=>flight);assert(await page.evaluate(()=>elapsed)>=580);assert.equal(await page.locator('.playroom-motion-layer').count(),0);
    });
    await check('An own draw travels as a back and reveals the actual card only on arrival',async page=>{
      await page.evaluate(()=>{
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');const token=document.querySelector('.token');token.style.left='20px';token.style.top='180px';
        window.flight=PlayroomMotion.play(snap,{duration:400,draws:[{player:0,count:1,from:'stock'}]});
      });
      const destination=page.locator('.scene [data-entity="card-new"]'),back=page.locator('.playroom-motion-piece[data-motion-kind=draw]');assert.equal(await back.count(),1);assert.doesNotMatch(await back.textContent(),/NEW/);assert.equal(await destination.evaluate(el=>getComputedStyle(el).visibility),'hidden');
      await page.evaluate(()=>flight);assert.equal(await destination.evaluate(el=>getComputedStyle(el).visibility),'visible');assert.equal(await page.locator('.playroom-motion-layer').count(),0);
    });
    await check('Explicit empty draw cues suppress inference and cancelling a draw chain restores every card',async page=>{
      await page.evaluate(()=>{const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');window.flight=PlayroomMotion.play(snap,{duration:250,draws:[]});});
      assert.equal(await page.locator('.playroom-motion-piece[data-motion-kind=draw]').count(),0);await page.evaluate(()=>flight);
      const result=await page.evaluate(async()=>{
        drawScene();const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'draw'}});drawScene('draw');const destination=document.querySelector('[data-entity="card-new"]');const flight=PlayroomMotion.play(snap,{duration:1100,draws:[{player:0,count:1,from:'stock'},{player:1,count:4,from:'stock'}]});PlayroomMotion.cancel();await flight;return{layers:document.querySelectorAll('.playroom-motion-layer').length,visibility:getComputedStyle(destination).visibility};
      });assert.deepEqual(result,{layers:0,visibility:'visible'});
    });
    await check('Taking table cards starts at a card-sized table anchor rather than the stock',async page=>{
      const result=await page.evaluate(()=>{
        document.querySelector('.board').setAttribute('data-motion-table','');const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'take'}});drawScene('draw');
        const token=document.querySelector('.token');token.style.left='20px';token.style.top='180px';window.flight=PlayroomMotion.play(snap,{duration:300,draws:[{player:0,count:1,from:'table'}]});
        const rect=document.querySelector('.playroom-motion-piece[data-motion-kind=draw]').getBoundingClientRect();return{table:snap.table,stock:snap.stock,actual:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};
      });assert(result.actual.width<=67&&result.actual.height<=99);assert(Math.abs(result.actual.x-result.table.x)<2);assert(Math.abs(result.actual.x-result.stock.x)>30);await page.evaluate(()=>flight);
    });
    await check('A visible ask effect uses the selected animation duration',async page=>{
      const duration=await page.evaluate(()=>{
        const target=document.querySelector('.stock-button');target.dataset.motionEffect='pulse';target.dataset.motionTrigger='ask';
        const snapshot=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'ask'}});
        window.flight=PlayroomMotion.play(snapshot,{duration:1100});
        return (target.firstElementChild||target).getAnimations()[0]?.effect.getTiming().duration;
      });
      assert.equal(duration,1100);await page.evaluate(()=>flight);
    });
    await check('A completed drag settles from its release rectangle rather than jumping back into the hand',async page=>{
      const result=await page.evaluate(()=>{
        const rect=document.querySelector('.public-card').getBoundingClientRect(),release={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
        const snap=PlayroomMotion.capture({actor:0,viewer:0,action:{type:'play',card:'c1'},playedFrom:release});drawScene('after');window.flight=PlayroomMotion.play(snap,{duration:180});
        const first=document.querySelector('.playroom-motion-piece[data-motion-kind=play]').getBoundingClientRect();return{release,first:{x:first.x,y:first.y},invalid:PlayroomMotion.capture({playedFrom:{x:Infinity,y:0,width:66,height:98}}).playedFrom};
      });assert(Math.abs(result.first.x-result.release.x)<2&&Math.abs(result.first.y-result.release.y)<2);assert.equal(result.invalid,null);await page.evaluate(()=>flight);
    });
  }finally{await browser.close();}
});
