'use strict';
// Read-only audit of published runtime. No storage state, auth screen, cookies,
// network bodies, traces or videos are persisted. Screenshots start after login.
const fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('./codex/browser.cjs');
const {originProxy}=require('./pages-origin-proxy.cjs'),{accessProxy}=require('./pages-access-proxy.cjs');
const out=path.resolve('dist/pages-layout-audit');fs.mkdirSync(out,{recursive:true});
const report={screens:[],cases:[],findings:[],animations:[],errors:[]};
const viewports=[[320,640],[390,844],[640,320],[844,390],[768,1024],[1024,768],[1366,768],[1920,1080]];
const save=()=>fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
async function main(){
 const deployment=JSON.parse(fs.readFileSync('deploy-report.json','utf8'));
 if(deployment.status!=='preview-verified'||!deployment.previewUrl)throw Error('Unverified preview');
 const url=deployment.previewUrl,origin=new URL(url).origin;
 const password=process.env.PAGES_SMOKE_PASSWORD,clientId=process.env.CF_ACCESS_CLIENT_ID,clientSecret=process.env.CF_ACCESS_CLIENT_SECRET;
 if(!password)throw Error('Missing authentication');
 report.url=url;report.commit=deployment.commit;report.catalog=deployment.previewVerified.catalog;report.viewports=viewports;
 const tunnel=clientId?await accessProxy(origin,{clientId,clientSecret}):await originProxy(origin);
 let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),proxy:{server:tunnel.server},args:['--no-sandbox','--proxy-bypass-list=<-loopback>',...(tunnel.spki?['--ignore-certificate-errors-spki-list='+tunnel.spki]:[])]});
  const context=await browser.newContext({playroomProfile:false,ignoreHTTPSErrors:!!clientId,extraHTTPHeaders:clientId?{'CF-Access-Client-Id':clientId,'CF-Access-Client-Secret':clientSecret}:{}});
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.goto(url);await page.locator('input[name=password]').fill(password);
  await Promise.all([page.waitForNavigation({waitUntil:'domcontentloaded'}),page.locator('button[type=submit]').click()]);
  await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);if(await page.locator('input[name=password]').count())throw Error('Login failed');
  page.on('pageerror',e=>report.errors.push({name:e.name}));
  report.version=await page.evaluate(()=>PlayroomAppVersion);
  async function shot(name){if(await page.locator('input[name=password]').count())throw Error('Auth screen must not be captured');await page.screenshot({path:path.join(out,name+'.png')});report.screens.push(name+'.png');}
  await shot('welcome');
  if(await page.locator('#profile-form').count()){await page.locator('#profile-form input').fill('Иван');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());}
  await page.waitForFunction(()=>TabletopCore.GAMES.length===12,null,{timeout:60000});
  await page.evaluate(()=>{localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false,animationSpeed:'fast'}));});
  if(process.env.PLAYROOM_AUDIT_SCOPE!=='interactions'){
  // Actual hub, settings, avatar picker, appearance, library, lobby and help.
  for(const [width,height]of viewports){
   await page.setViewportSize({width,height});await page.evaluate(()=>PlayroomAppBridge.showHub());
   for(const menu of ['hub','packs','settings','help','sessions']){
    try{
     if(menu==='sessions')await page.evaluate(()=>PlayroomAppBridge.showSessions());
     else if(menu!=='hub')await page.locator(`.topbar-tools [data-command="${menu}"]`).click();
     await shot(`${menu}-${width}x${height}`);
     if(menu==='settings'){
      await page.locator('[data-avatar-picker]').click();await shot(`avatars-${width}x${height}`);await page.locator('[data-avatar-dismiss]').click();
      await page.locator('.settings-themes').click();await shot(`themes-${width}x${height}`);await page.keyboard.press('Escape');
     }
     const excess=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);if(excess>2)report.findings.push({menu,width,height,kind:'page-horizontal-scroll',excess});
     if(!['hub','sessions'].includes(menu))await page.locator('#modal-root [data-command="close-modal"]').first().click();
    }catch(_){report.findings.push({menu,width,height,kind:'menu-interaction-failed'});await page.goto(url);await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);}
   }
   await page.evaluate(()=>PlayroomAppBridge.showHub());await page.locator('[data-start="uno"]').first().click();await shot(`lobby-${width}x${height}`);await page.evaluate(()=>PlayroomAppBridge.leaveLobby());
  }
  // The full shipped rendering/motion engine and shipped packs are used below.
  // Only synthetic participants and legal seeded game states are supplied.
  await page.evaluate(()=>{
   window.auditRender=()=>{const E=TabletopCore,s=auditSession.current,state=E.project(s,0),actions=E.legalActions(s,0);const scene=PlayroomViews.render(state,0,actions,{seating:auditSeating,preferences:{},viewState:{}});PlayroomGameScreen.update(document.querySelector('#app'),PlayroomGameScreen.render({gameName:E.get(s.game).name,state,viewer:0,actions,scene,turnText:'Ваш ход',footerText:state.events?.at(-1)?.text||''}));PlayroomGameScreen.layoutScene(document.querySelector('#app'));};
   window.auditMeasure=()=>{
    const stage=document.querySelector('.app-game-layout'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};},visible=e=>{const r=rect(e);return r.w>0&&r.h>0&&getComputedStyle(e).visibility!=='hidden'},overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.x,b.x)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>2;
    const field=rect(stage.querySelector('.layout-field')),panels=[...stage.querySelectorAll('.player-panel')].filter(visible).map(rect),problems=[];
    panels.forEach((r,i)=>{if(r.w<65||r.h<35)problems.push({kind:'squashed-panel',r});if(overlap(r,field))problems.push({kind:'panel-field-overlap',i});if(r.x<0||r.y<0||r.right>innerWidth+2||r.bottom>innerHeight+2)problems.push({kind:'panel-outside-viewport',i});for(let j=i+1;j<panels.length;j++)if(overlap(r,panels[j]))problems.push({kind:'panels-overlap',i,j});});
    const zones=[...stage.querySelectorAll('.layout-field,.layout-actions,.layout-hand')].filter(visible).map(e=>({name:e.dataset.gameElement,r:rect(e)}));for(let i=0;i<zones.length;i++)for(let j=i+1;j<zones.length;j++)if(overlap(zones[i].r,zones[j].r))problems.push({kind:'zones-overlap',a:zones[i].name,b:zones[j].name});
    const scroll=[];for(const e of stage.querySelectorAll('*')){if(!visible(e))continue;const s=getComputedStyle(e),x=e.scrollWidth-e.clientWidth,y=e.scrollHeight-e.clientHeight;if((x>3&&['auto','scroll'].includes(s.overflowX))||(y>3&&['auto','scroll'].includes(s.overflowY)))scroll.push({class:e.className,x,y});}
    if(document.documentElement.scrollWidth>innerWidth+2)problems.push({kind:'page-horizontal-scroll'});
    if(document.documentElement.scrollHeight>innerHeight+2)problems.push({kind:'game-page-vertical-scroll',excess:document.documentElement.scrollHeight-innerHeight});
    if(field.w<100||field.h<80)problems.push({kind:'small-field',field});
    return {seating:stage.dataset.seating,fallback:stage.dataset.seatingFallback,field,panels:panels.length,scroll,problems};
   };
  });
  const games=await page.evaluate(()=>TabletopCore.GAMES.map(g=>({id:g.id,min:g.min,max:g.max})));
  for(const game of games){
   for(let count=game.min;count<=game.max;count++)for(const seating of ['row','anchors'])for(const [width,height]of viewports){
    await page.setViewportSize({width,height});
    try{
     await page.evaluate(({id,count,seating})=>{auditSeating=seating;window.auditSession=new TabletopSession(TabletopCore,id,{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:count},(_,i)=>({name:['Иван','Кира','Мика','Лев','Сэм','Рэй'][i]||'Игрок '+i}))});auditRender();},{id:game.id,count,seating});
     for(const steps of [0,12]){
      if(steps)await page.evaluate(steps=>{for(let n=0;n<steps&&auditSession.current.status!=='finished';n++){const s=auditSession.current,a=TabletopCore.botAction(s,s.turn);if(!a)break;auditSession.act(s.turn,a);}auditRender();},steps);
      await page.evaluate(()=>new Promise(requestAnimationFrame));const m=await page.evaluate(()=>auditMeasure()),key=`${game.id}-${count}-${seating}-${width}x${height}-${steps}`,entry={key,game:game.id,count,requested:seating,width,height,steps,...m};report.cases.push(entry);
      if(m.problems.length||m.scroll.length)report.findings.push({key,problems:m.problems,scroll:m.scroll});
      if((count===game.max&&steps===12)||(m.problems.length&&report.screens.length<500))await shot(key);
     }
    }catch(error){report.findings.push({game:game.id,count,seating,width,height,kind:'scenario-error',reason:error.message.split('\n')[0].slice(0,160)});}
   }
   save();console.log('Audited '+game.id+'; cases '+report.cases.length);
  }
  // Actual timed effects at the published presets; measurements use real clocks.
  for(const mode of ['fast','normal','slow'])for(const game of ['uno','pexeso','ludo','yatzy','checkers','domino','oldmaid','gofish','durak'])for(const [width,height]of [[390,844],[844,390],[1024,768],[1366,768]]){
   await page.setViewportSize({width,height});
   try{
    const result=await page.evaluate(async({game,mode})=>{
     const E=TabletopCore,g=E.get(game);auditSeating='anchors';window.auditSession=new TabletopSession(E,game,{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:Math.min(4,g.max)},(_,i)=>({name:'Игрок '+i}))});auditRender();
     const timings=PlayroomGameFlow.effectTimes[mode],pace=PlayroomGameFlow.presets[mode],samples=[];
     for(let step=0;step<4;step++){
      const before=auditSession.current;if(before.status==='finished')break;const actor=before.turn,legal=E.legalActions(before,actor),action=(game==='uno'&&step===0?legal.find(a=>a.type==='draw'):null)||E.botAction(before,actor);if(!action)break;
      const snap=PlayroomMotion.capture({actor,viewer:0,action}),start=performance.now();auditSession.act(actor,action);auditRender();const pending=PlayroomMotion.play(snap,{duration:pace.duration,settle:pace.settle,effects:timings,draws:action.type==='draw'?[{player:actor,count:1,from:'stock'}]:[]});
      const frames=[];for(let i=0;i<6;i++){await new Promise(requestAnimationFrame);frames.push({field:document.querySelector('.layout-field').getBoundingClientRect().height,hidden:[...document.querySelectorAll('.pexeso-face')].filter(e=>getComputedStyle(e).visibility==='hidden').length,flights:document.querySelectorAll('[data-motion-kind=play]').length});}
      await pending;samples.push({type:action.type,elapsed:Math.round(performance.now()-start),frames,leakedLayers:document.querySelectorAll('.playroom-motion-layer').length});
     }
     return {pace,timings,samples};
    },{game,mode});report.animations.push({game,mode,width,height,...result});
   }catch(error){report.findings.push({game,mode,width,height,kind:'animation-scenario-error',reason:error.message.split('\n')[0].slice(0,160)});}
  }
  }else{
   report.scope='interactions';
   await page.reload();await page.waitForFunction(()=>TabletopCore.GAMES.length===12);
   for(const game of ['uno','ludo','yatzy','pexeso','battleship','checkers','domino','oldmaid','gofish','durak','snakes','tictactoe'])for(const [width,height]of [[390,844],[844,390],[768,1024],[1024,768],[1366,768]]){
    const key=`real-${game}-${width}x${height}`;await page.setViewportSize({width,height});
    try{
     await page.evaluate(()=>PlayroomAppBridge.showHub());await page.locator(`[data-start="${game}"]`).first().click();
     await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.configure(r.id,r.ownerId,{firstPlayerMode:'assigned',firstParticipantId:r.seats.find(s=>s.participantId).participantId});b.renderLobby();});
     await page.locator('[data-command="lobby-start"]').click();await page.locator('.app-game-layout').waitFor();await shot(key);
     await page.locator('.table-tools [data-command="settings"]').click();await shot(key+'-settings');await page.locator('#modal-root [data-command="close-modal"]').first().click();
     // Record the next real user action, including busy state and reveal lifetime.
     const candidate=await page.locator('.scene [data-action]').evaluateAll(nodes=>{const n=nodes.find(n=>{const a=JSON.parse(n.dataset.action);return ['roll','flip','draw','shoot','place','move'].includes(a.type)&&n.getBoundingClientRect().width>0&&!n.disabled;});return n?{index:nodes.indexOf(n),action:n.dataset.action}:null;});
     if(candidate){
      await page.evaluate(()=>{window.auditFrames=[];window.auditUntil=performance.now()+4500;const start=performance.now();function frame(){const scene=document.querySelector('.scene'),reveal=document.querySelector('.action-reveal');auditFrames.push({ms:Math.round(performance.now()-start),busy:scene?.getAttribute('aria-busy'),reveal:!!reveal,r:reveal?{w:reveal.getBoundingClientRect().width,h:reveal.getBoundingClientRect().height}:null,motion:document.querySelectorAll('.playroom-motion-piece').length,scroll:document.documentElement.scrollHeight-innerHeight});if(performance.now()<auditUntil)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
      await page.locator('.scene [data-action]').nth(candidate.index).click();
      await page.waitForTimeout(250);await shot(key+'-action');await page.waitForTimeout(4350);
      report.animations.push({key,action:JSON.parse(candidate.action).type,frames:await page.evaluate(()=>auditFrames)});
     }
     await page.locator('.table-tools [data-command="pause"]').click();await shot(key+'-pause');
     await page.locator('.table-tools [data-command="history"]').click();await shot(key+'-history');
     report.cases.push({key,passed:true});
    }catch(error){report.findings.push({key,kind:'real-ui-action-error',reason:error.message.split('\n')[0].slice(0,200)});await page.goto(url);await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge);}
    save();
   }
   // Measure all published reveal speed presets using real feedback on shipped UI.
   for(const mode of ['fast','normal','slow']){
    const measured=await page.evaluate(async mode=>{const samples=[];const f=new PlayroomGameFeedback();const start=performance.now();f.accept([{id:1,reveal:{kind:'dice',dice:[{value:6}]}}],[],'ludo',{mode});while(performance.now()-start<4000){samples.push({ms:Math.round(performance.now()-start),visible:!!document.querySelector('.action-reveal')});if(!f.active&&!f.queue.length)break;await new Promise(requestAnimationFrame);}f.destroy();return samples;},mode);report.animations.push({mode,kind:'dice-reveal',samples:measured});
   }

  }
  save();console.log('Completed: '+report.cases.length+' layout states, '+report.animations.length+' animation scenarios, '+report.findings.length+' findings');
 }finally{save();await browser?.close();await tunnel.close();}
}
main().catch(()=>{report.errors.push({stage:'audit-aborted'});save();process.exitCode=1;});
