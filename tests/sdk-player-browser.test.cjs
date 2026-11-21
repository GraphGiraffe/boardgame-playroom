'use strict';
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');let directory,browser,url;
before(async()=>{
 // Release audits exercise the supplied standalone bytes. Only a build created
 // by this fixture belongs to it and can be removed by the teardown below.
 let artifact=process.env.PLAYROOM_SDK_PLAYER_HTML;
 if(!artifact){
  directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-sdk-player-'));
  execFileSync('python3',['build.py','--all-games','--pwa','--packs-dir','../playroom-paks/packs','--output-dir',directory],{cwd:root,stdio:'pipe'});
  artifact=path.join(directory,'playroom-all-games.html');
 }
 url=pathToFileURL(fs.realpathSync(artifact)).href;
 browser=await chromium.launch({headless:true,executablePath:executablePath()});
});
after(async()=>{await browser?.close();if(directory)fs.rmSync(directory,{recursive:true,force:true});});
async function pageFor(t,options={}){const context=await browser.newContext({viewport:{width:1000,height:800},...options});t.after(()=>context.close());const page=await context.newPage();await page.route('https://**',route=>route.abort());await page.goto(url);await page.waitForFunction(()=>globalThis.PlayroomAppBridge?.packs?.list().length===15);return page;}
function drawingBundle(){const manifest={id:'sdk-native-draw',name:'Native drawing',version:'1.0.0',engineApi:4,viewApi:3,stateVersion:1,execution:'isolated-v1',sdkFeatures:['isolated-execution-v1']};const rules=`globalThis.PlayroomPackDefinition={contractVersion:1,id:'sdk-native-draw',minPlayers:2,maxPlayers:2,create:()=>({playerCount:2,turn:0,status:'playing',winners:[],data:{phase:'drawing',deadline:30000,operations:[],guesses:[],voted:false,secret:'PRIVATE_NATIVE_WORD'}}),validate:p=>Array.isArray(p.data.operations),actions:(p,a)=>a===0?[{command:{type:'menu-mark'},visibility:'public'},...p.data.guesses.map((_,id)=>({command:{type:'confirm-guess',id},visibility:'private'}))]:[],inputs:(p,a)=>p.data.phase==='drawing'&&a===0?[{command:{type:'draw',roundId:1},visibility:'public',fields:{operation:{kind:'ink'}}}]:a===1&&p.data.phase!=='result'?[{command:{type:'guess',roundId:1},visibility:'private',fields:{text:{kind:'text',maxLength:80}}}]:[],reduce:(p,a,c)=>({position:{...p,data:{...p.data,operations:c.type==='draw'?[...p.data.operations,c.operation]:p.data.operations,guesses:c.type==='guess'?[...p.data.guesses,{text:c.text}]:p.data.guesses,voted:p.data.voted||c.type==='menu-mark'}},events:[{type:'native.changed',actor:null,params:{},visibility:{kind:'public'}}]}),advance:(p,n)=>{if(n<p.data.deadline||p.data.phase==='result')return null;const drawing=p.data.phase==='drawing';return {position:{...p,data:{...p.data,phase:drawing?'guessing':'result',deadline:drawing?45000:0}},events:[{type:'native.expired',actor:null,params:{},visibility:{kind:'public'}}]};},project:(p,v)=>({phase:p.data.phase,deadline:p.data.deadline,operations:p.data.operations,guesses:p.data.guesses,voted:p.data.voted,answer:v===0||p.data.phase==='result'?p.data.secret:''}),result:p=>({winners:p.winners,places:[1,1],metrics:[{id:'points',values:[0,0]}]})};`;
 const presentation=`globalThis.PlayroomPackPresentation={metadata:{name:'Native drawing',presets:[{id:'classic',label:'Classic'}],rules:[]},action:()=>'',event:()=>({message:'Drawing changed'}),scene:p=>({contractVersion:1,id:'native',family:'drawing',...(p.data.voted?{vote:{id:'native-vote',title:'Finish native game?',startedAt:30000,deadline:45000,eligible:[0,1],voted:[0],required:2,accepted:false}}:{}),menuActions:p.actions.filter(c=>c.type==='menu-mark').map(command=>({label:'Menu marker',command})),players:[0,1].map(player=>({player,metrics:[]})),prompt:p.data.answer,roundResult:p.data.phase==='result'?{answer:p.data.answer,winner:null}:null,...(p.data.phase==='result'?{}:{clock:{phase:p.data.phase,deadline:p.data.deadline,startedAt:p.data.phase==='drawing'?0:30000}}),canvas:{id:'paper-1',operations:p.data.operations,enabled:!!p.inputs?.find(c=>c.command.type==='draw'),...(p.inputs?.find(c=>c.command.type==='draw')?{command:p.inputs.find(c=>c.command.type==='draw').command}:{})},chat:{messages:p.data.guesses.map((g,i)=>({id:String(i),text:g.text,...(p.actions.some(c=>c.type==='confirm-guess'&&c.id===i)?{confirmCommand:{type:'confirm-guess',id:i}}:{})})),...(p.inputs?.find(c=>c.command.type==='guess')?{command:p.inputs.find(c=>c.command.type==='guess').command}:{})}})};`;
 const payload={manifest,descriptor:{contractVersion:1},catalogs:{ru:{}},sources:{dependencies:[],helpers:[],rules:[{file:'domain/game.js',source:rules}],presentation:[{file:'presentation/scene.js',source:presentation}],types:[],support:[],providers:[]},assets:[],resourceClosure:{}};return {format:'playroom-pack',formatVersion:1,manifest,files:{'rules.js':'// Isolated source only','view.js':'// Host renderer only','styles.css':'/* Host renderer only */','sdk/source.json':JSON.stringify(payload)}};}
test('normal standalone boots offline, blocks external legacy code and plays an isolated local game with history',{timeout:60000},async t=>{
 const page=await pageFor(t),errors=[];page.on('pageerror',error=>errors.push(error.message));
 const installed=await page.evaluate(()=>PlayroomPacks.list().every(p=>p.manifest.execution==='isolated-v1'));assert.equal(installed,true);
 const gate=await page.evaluate(()=>{const bundle={format:'playroom-pack',formatVersion:1,manifest:{id:'host-escape',version:'1.0.0',name:'escape',engineApi:4,viewApi:3,stateVersion:1},files:{'rules.js':'Function("return globalThis")().__HOST_ESCAPE__=true;','view.js':'throw Error("host view");','styles.css':'/* no styles */'}};try{PlayroomPacks.prepare(bundle);return 'allowed';}catch(error){return error.code;}});assert.equal(gate,'PACK_ISOLATED_REQUIRED');assert.equal(await page.evaluate(()=>globalThis.__HOST_ESCAPE__),undefined);
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>{
  PlayroomFirstTurnGuide.setEnabled('tictactoe',false);
  window.markPulses=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){
   if(this.matches('.mark-token-art')&&this.parentElement?.dataset.motionTrigger==='place')markPulses.push(Number(this.parentElement.dataset.motionValue));
   return animate.apply(this,args);
  };
 });
 await page.locator('[data-start=tictactoe]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.locator('[data-command=lobby-start]').click();
 await page.locator('[data-sdk-player-scene]').waitFor();
 const board=page.locator('.sdk-mark-grid'),marks=page.locator('.mark-token-art');
 const labels=async()=> (await page.locator('.player-panel .player-status-badge').allTextContents()).sort();
 const boardBox=await board.boundingBox();
 assert(Math.abs(boardBox.width-boardBox.height)<1,'the original ruled board stays square');
 assert.equal(await page.locator('.sdk-mark-cell').count(),9);
 assert.equal(await page.locator('.layout-actions:visible').count(),0,'cell actions do not reserve an empty dock');
 assert.deepEqual(await labels(),['O','X']);
 const cell=page.locator('.sdk-mark-cell:not([disabled])').first(),placement=Number(await cell.locator('span').getAttribute('data-motion-value'));
 await cell.click();
 await page.waitForFunction(index=>markPulses.includes(index),placement);
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===2);
 await page.waitForFunction(()=>document.querySelectorAll('.mark-token-art').length===2);
 assert.deepEqual(await board.boundingBox(),boardBox,'placing marks cannot reflow the board');
 await page.locator('[data-game-menu]').click();
 await page.locator('[data-command=history]:visible').click();
 const slider=page.locator('#replay-range');
 await slider.waitFor();await slider.focus();await slider.press('Home');
 await page.waitForFunction(()=>document.querySelectorAll('.mark-token-art').length===0);
 assert.equal(await board.locator('button:not([disabled])').count(),0);
 assert.deepEqual(await labels(),['O','X']);
 await slider.press('End');
 await page.waitForFunction(()=>document.querySelectorAll('.mark-token-art').length===2);
 await page.locator('[data-command=history-close]').click();
 assert.equal(await marks.count(),2);
 const history=await page.evaluate(()=>{const session=PlayroomAppBridge.saveLibrary.current().session;return {length:session.states.length,before:session.view(0,0).data.board,after:session.view(0,2).data.board};});
 assert.equal(history.length,3);assert.equal(history.before.filter(v=>v!==null).length,0);assert.equal(history.after.filter(v=>v!==null).length,2);assert.deepEqual(errors,[]);
});
test('game audio expires on slow decode and resumes a cached sample at the selected rate',{timeout:60000},async t=>{
 const page=await pageFor(t,{reducedMotion:'no-preference'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('tictactoe',false));
 await page.locator('[data-start=tictactoe]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.setLocalSeat(room.id,room.ownerId,'seat-2',{kind:'human',nickname:'Игрок 2'});
  bridge.roomService.configure(room.id,room.ownerId,{firstPlayerMode:'assigned',firstParticipantId:room.ownerId});
  bridge.renderLobby();
 });
 await page.locator('[data-command=lobby-start]').click();
 const ready=page.locator('.table-shell>.scene[aria-busy=false]'),cells=page.locator('.sdk-mark-cell');
 await ready.waitFor();
 await page.evaluate(()=>{
  window.audioProbe={decodes:0,voices:[],interrupts:0};
  const present=PlayroomGameFeedback.prototype.presentCue;
  PlayroomGameFeedback.prototype.presentCue=function(cue,...args){
   if(cue.kind==='sound')audioProbe.player=this.player;
   return present.call(this,cue,...args);
  };
  AudioContext.prototype.decodeAudioData=function(){
   audioProbe.decodes++;audioProbe.context=this;
   return new Promise(resolve=>{
    audioProbe.release=()=>{
     audioProbe.buffer=this.createBuffer(1,Math.floor(this.sampleRate*1.4),this.sampleRate);
     resolve(audioProbe.buffer);
    };
   });
  };
  const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
  AudioBufferSourceNode.prototype.start=function(...args){
   if(this.buffer===audioProbe.buffer)audioProbe.voices.push({at:args[0],offset:args[1]||0,rate:this.playbackRate.value});
   return start.apply(this,args);
  };
  AudioBufferSourceNode.prototype.stop=function(...args){
   if(this.buffer===audioProbe.buffer&&!args.length)audioProbe.interrupts++;
   return stop.apply(this,args);
  };
  // Field updates reactivate the exact pack and register its catalog sounds.
  const sounds={...PlayroomCatalog.tictactoe.sounds,move:{src:'data:audio/wav;base64,AA=='}};
  PlayroomCatalog.tictactoe.sounds=sounds;
  PlayroomAppBridge.audio.registerPack('tictactoe',sounds);
 });
 async function playCell(index){
  const pass=page.locator('[data-command=pass-device]:not([disabled]):visible');
  if(await pass.count())await pass.click();
  const unlock=page.locator('.handoff [data-command=unlock]:visible');
  if(await unlock.count())await unlock.click();
  const learning=page.locator('#modal-root>[data-surface-state=active] [data-learning-choice=no]');
  if(await learning.count())await learning.click();
  await cells.nth(index).click();
  await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===move,index+1);
 }
 await playCell(0);
 await page.waitForFunction(()=>window.audioProbe.decodes===1);
 await ready.waitFor({timeout:1500});
 await page.evaluate(async()=>{
  audioProbe.release();
  await new Promise(requestAnimationFrame);
 });
 assert.equal(await page.evaluate(()=>audioProbe.voices.length),0,'the first action never starts a late sample');
 await playCell(1);
 await page.waitForFunction(()=>audioProbe.voices.length===1&&audioProbe.context.currentTime>=audioProbe.voices[0].at+.08);
 assert.equal(await ready.count(),0,'a sound that starts in its phase still gates that phase');
 const paused=await page.evaluate(()=>{
  audioProbe.player.pause();audioProbe.pausedAt=audioProbe.context.currentTime;audioProbe.player.setRate(2);
  return {voices:audioProbe.voices.length,interrupts:audioProbe.interrupts};
 });
 assert.deepEqual(paused,{voices:1,interrupts:1});
 await page.waitForFunction(()=>audioProbe.context.currentTime>=audioProbe.pausedAt+.12);
 assert.equal(await ready.count(),0,'the paused phase holds its playback position');
 const resumed=await page.evaluate(()=>{
  const before=audioProbe.pausedAt-audioProbe.voices[0].at;
  audioProbe.player.resume();
  return {before,...audioProbe.voices.at(-1),voices:audioProbe.voices.length};
 });
 assert.equal(resumed.voices,2);assert.equal(resumed.rate,2);
 assert(Math.abs(resumed.offset-resumed.before)<.03,'audio resumes from the position where the plan paused');
 await ready.waitFor();
 assert.equal(await page.evaluate(()=>audioProbe.decodes),1,'the next action reuses the decoded sample');
 await page.locator('[data-game-menu]').click();
 await page.locator('#modal-root>[data-surface-state=active] [data-command=history]').click();
 const replay=page.locator('[data-command=replay-play]'),slider=page.locator('#replay-range');
 await replay.click();
 await page.waitForFunction(()=>audioProbe.voices.length===3&&audioProbe.context.currentTime>=audioProbe.voices.at(-1).at+.10);
 assert.equal(await slider.inputValue(),'1');
 await replay.click();
 const held=await page.evaluate(()=>({interrupts:audioProbe.interrupts,voices:audioProbe.voices.length,at:audioProbe.context.currentTime}));
 await page.waitForFunction(at=>audioProbe.context.currentTime>=at+.2,held.at);
 assert.equal(await slider.inputValue(),'1');
 assert.equal(await page.evaluate(()=>audioProbe.voices.length),held.voices,'no sound restarts during the pause');
 await replay.click();
 await page.waitForFunction(()=>audioProbe.voices.length===4);
 const resumedHistory=await page.evaluate(()=>audioProbe.voices.at(-1));
 assert(resumedHistory.offset>=.09,'the toolbar resumes the current sound from its existing position');
 assert.equal(await slider.inputValue(),'1','resume keeps the current history step');
 await page.locator('[data-command=history-close]:visible').first().click();
 assert.deepEqual(errors,[]);
});

test('ordinary local match series survives reload at a finished match and archives exactly one result',{timeout:90000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('tictactoe',false));
 await page.locator('[data-start=tictactoe]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{
  const b=PlayroomAppBridge,room=b.room();
  b.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
  b.renderLobby();
 });
 await page.locator('.room-v021-series summary').click();
 await page.locator('[data-series-mode]').selectOption('games');
 await page.locator('[data-series-target]').fill('2');
 await page.locator('[data-command=lobby-start]').click();
 const {activeSurface}=require('./browser-origin.cjs');
 const scene=page.locator('.table-shell>.scene[aria-busy=false]');
 const receipt=()=>page.evaluate(()=>{const b=PlayroomAppBridge.saveLibrary,current=b.current();return {id:current.id,series:current.session.options.matchSeries,state:current.session.current.status};});
 async function playWin(){
  for(const [index,cell] of [0,3,1,4,2].entries()){
   await scene.waitFor();
   const pass=page.locator('[data-command=pass-device]:not([disabled]):visible'),unlock=page.locator('.handoff [data-command=unlock]:visible');
   if(await pass.count())await pass.click();
   if(await unlock.count())await unlock.click();
   const learning=activeSurface(page).locator('[data-learning-choice=no]');
   if(await learning.count())await learning.click();
   await page.locator('.sdk-mark-cell').nth(cell).click();
   await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===move,index+1);
  }
  await activeSurface(page).locator('[data-series-result]').waitFor();
 }
 await page.locator('.sdk-mark-grid').waitFor();
 const initial=await receipt();
 assert.equal(initial.series.number,1);
 assert.equal(initial.series.series.rules.target,2);
 await playWin();
 assert.equal((await receipt()).state,'finished');
 await page.reload();
 const next=activeSurface(page).locator('[data-command=continue-series]');
 await next.waitFor();
 assert.equal((await receipt()).id,initial.id);
 const box=await next.boundingBox();
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
 await page.waitForFunction(id=>PlayroomAppBridge.saveLibrary.currentId()!==id,initial.id);
 await page.locator('.sdk-mark-grid').waitFor();
 const second=await receipt();
 assert.notEqual(second.id,initial.id);
 assert.equal(second.series.number,2);
 assert.equal(second.series.series.lastMatchId,initial.id);
 assert.equal(second.series.series.totals.reduce((sum,row)=>sum+row.wins,0),1);
 await playWin();
 const series=activeSurface(page).locator('[data-series-result]');
 assert.match(await series.innerText(),/Серия завершена/);
 assert.equal(await activeSurface(page).locator('[data-command=continue-series]').count(),0);
 assert.deepEqual((await page.evaluate(()=>PlayroomAppBridge.saveLibrary.list().map(row=>row.id))).sort(),[initial.id,second.id].sort());
 assert.deepEqual(errors,[]);
});
test('ordinary local win series resumes a finished match after switching series',{timeout:90000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const UI=require('./browser-origin.cjs'),dialog=()=>UI.activeSurface(page);
 const current=()=>page.evaluate(()=>{
  const {id,session}=PlayroomAppBridge.saveLibrary.current();
  return {id,version:session.packVersion,move:session.current.move,winners:session.current.winners??(session.current.winner==null?[]:[session.current.winner]),match:session.options.matchSeries};
 });
 const standings=()=>dialog().locator('[data-series-result]');
 const next=()=>dialog().locator('[data-command=continue-series]');
 const values=async()=> (await standings().locator('dd').allTextContents()).map(Number);
 async function start(target){
  await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('tictactoe',false));
  await UI.openGame(page,'tictactoe');
  await page.evaluate(()=>{
   const bridge=PlayroomAppBridge,room=bridge.room();
   bridge.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
   bridge.roomService.configure(room.id,room.ownerId,{firstPlayerMode:'assigned',firstParticipantId:room.ownerId});
   bridge.renderLobby();
  });
  await page.locator('.room-v021-series summary').click();
  await page.locator('[data-series-mode]').selectOption('wins');
  await page.locator('[data-series-target]').fill(String(target));
  await page.locator('[data-command=lobby-start]').click();
  await page.locator('.sdk-mark-grid').waitFor();
  return current();
 }
 async function play(cells){
  for(const [index,cell] of cells.entries()){
   await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
   const pass=page.locator('[data-command=pass-device]:not([disabled]):visible'),unlock=page.locator('.handoff [data-command=unlock]:visible');
   if(await pass.count())await pass.click();
   if(await unlock.count())await unlock.click();
   const learning=dialog().locator('[data-learning-choice=no]');
   if(await learning.count())await learning.click();
   await page.locator('.sdk-mark-cell').nth(cell).click();
   await page.waitForFunction(move=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===move,index+1);
  }
 }
 async function leave(){
  if(await dialog().locator('.result-modal').count())await dialog().locator('[data-command=close-modal]').click();
  await page.locator('[data-game-menu]').click();
  await dialog().locator('[data-command=home]').click();
  await page.locator('.game-grid').first().waitFor();
 }
 async function inspect(id){
  await page.locator('[data-hub-page=sessions]').click();
  await page.locator('[data-saved-status=history]').click();
  await page.locator('.saved-game[data-session-id="'+id+'"]').click();
  await dialog().locator('[data-saved-results="'+id+'"]').click();
  await standings().waitFor();
 }
 async function continueMatch(previous,{double=false}={}){
  await next().waitFor({timeout:5000});
  if(double)await next().dblclick();else await next().click();
  await page.waitForFunction(id=>PlayroomAppBridge.saveLibrary.currentId()!==id,previous);
  await page.locator('.sdk-mark-grid').waitFor();
  return current();
 }
 const first=await start(2);
 await play([0,1,2,4,3,5,7,6,8]);await standings().waitFor();
 assert.deepEqual((await current()).winners,[]);
 assert.deepEqual(await values(),[0,0]);
 assert.match(await standings().innerText(),/Сыграно партий: 1/);
 await leave();

 const other=await start(1);await play([0]);await leave();
 await inspect(first.id);
 const alternate=process.env.PLAYROOM_SDK_SERIES_ALTERNATE_PACK;
 if(alternate){
  const bundle=JSON.parse(fs.readFileSync(alternate,'utf8'));
  assert.equal(bundle.manifest.id,'tictactoe');
  assert.notEqual(bundle.manifest.version,first.version);
  const activated=await page.evaluate(async bundle=>{
   await PlayroomPacks.install(PlayroomPacks.prepare(bundle));
   PlayroomPacks.activate(bundle.manifest.id,bundle.manifest.version);
   return TabletopCore.get(bundle.manifest.id).version;
  },bundle);
  assert.equal(activated,bundle.manifest.version,'a different installed release is active before continuation');
 }
 const second=await continueMatch(other.id,{double:true});
 assert.equal(second.match.number,2);
 assert.equal(second.match.series.id,first.match.series.id);
 assert.equal(second.match.series.lastMatchId,first.id);
 assert.equal(second.version,first.version);
 await play([0,3,1,4,2]);await standings().waitFor();
 assert.deepEqual(await values(),[1,0]);
 const third=await continueMatch(second.id);
 assert.equal(third.match.number,3);
 assert.equal(third.match.series.lastMatchId,second.id);
 await play([0,3,1,4,2]);await standings().waitFor();
 assert.deepEqual(await values(),[2,0]);
 assert.match(await standings().innerText(),/Серия завершена/);
 assert.equal(await next().count(),0);
 await leave();

 await inspect(first.id);
 assert.equal(await next().count(),0,'a historical match with a successor cannot branch a series');
 await dialog().locator('[data-command=history-close]').click();
 await page.locator('[data-saved-status=active]').click();
 await UI.resumeSaved(page,other.id);
 assert.equal((await current()).move,1);
 assert.equal((await current()).match.series.id,other.match.series.id);
 assert.deepEqual((await page.evaluate(()=>PlayroomAppBridge.saveLibrary.list().map(row=>row.id))).sort(),[first.id,second.id,third.id,other.id].sort());
 assert.deepEqual(errors,[]);
});

test('ordinary local match series uses the pack score metric for the points threshold',{timeout:60000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},reducedMotion:'reduce'});
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>create(id,id==='dice-poker'?{...options,maxRounds:1,seed:17}:options);
 });
 await page.locator('[data-start=dice-poker]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{
  const b=PlayroomAppBridge,room=b.room();
  b.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
  b.renderLobby();
 });
 await page.locator('.room-v021-series summary').click();
 await page.locator('[data-series-mode]').selectOption('score');
 await page.locator('[data-series-target]').fill('1');
 await page.locator('[data-command=lobby-start]').click();
 const {activeSurface}=require('./browser-origin.cjs');
 const scene=page.locator('.table-shell>.scene[aria-busy=false]');
 for(const turn of [0,1]){
  await scene.waitFor();
  const pass=page.locator('[data-command=pass-device]:not([disabled]):visible'),unlock=page.locator('.handoff [data-command=unlock]:visible');
  if(await pass.count())await pass.click();
  if(await unlock.count())await unlock.click();
  const learning=activeSurface(page).locator('[data-learning-choice=no]');
  if(await learning.count())await learning.click();
  await page.locator('[data-sdk-dice-port] .sdk-score-roll').click();
  await page.locator('[data-score-row=chance] button').click();
  await activeSurface(page).locator('[data-command=confirm-action]').click();
  await page.waitForFunction(round=>PlayroomAppBridge.saveLibrary.current()?.session.current.data.round===round,turn+1);
 }
 const result=activeSurface(page).locator('[data-series-result]');
 await result.waitFor();
 assert.match(await result.innerText(),/Серия завершена/);
 assert.equal(await activeSurface(page).locator('[data-command=continue-series]').count(),0);
 const values=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.result.metrics.find(metric=>metric.id==='points').values);
 assert.deepEqual((await result.locator('dd').allTextContents()).map(Number),values);
});
test('leaving a live local game flushes the pending checkpoint before the next paint',{timeout:60000},async t=>{
 const page=await pageFor(t);
 await page.evaluate(async()=>{
  PlayroomFirstTurnGuide.setEnabled('tictactoe',false);
  const session=new TabletopSession(TabletopCore,'tictactoe',{players:[{name:'A'},{name:'B'}],seed:17,mode:'pass',firstPlayerMode:'assigned',firstPlayer:0});
  await PlayroomAppBridge.saveLibrary.activateAsync(session,'checkpoint-exit');
 });
 await require('./browser-origin.cjs').resumeSaved(page,'checkpoint-exit');
 const move=page.locator('.sdk-mark-cell:not([disabled])').first();
 await move.waitFor();
 await page.evaluate(()=>{
  window.exitSaveRevisions=[];
  const write=PlayroomSessionLibrary.prototype.writeAsync;
  PlayroomSessionLibrary.prototype.writeAsync=function(session,id){
   exitSaveRevisions.push(session.current.move);
   return write.call(this,session,id);
  };
  const send=PlayroomGameScreenController.prototype.send;
  PlayroomGameScreenController.prototype.send=function(...args){
   const receipt=send.apply(this,args);
   if(receipt.ok)queueMicrotask(()=>PlayroomAppBridge.showHub());
   return receipt;
  };
 });
 await move.click();
 await page.waitForFunction(()=>!document.querySelector('.table-shell')&&PlayroomAppBridge.saveLibrary.current()?.session.current.move===1);
 assert.deepEqual(await page.evaluate(()=>exitSaveRevisions),[1]);
 await page.reload();
 await page.waitForFunction(()=>window.PlayroomAppBridge?.saveLibrary.current()?.session.current.move===1);
});
test('normal RTC drawing previews before durable commit, blocks late or wrong actor input, and restores the same journal',{timeout:60000},async t=>{
 const host=await pageFor(t),artist=await pageFor(t),bundle=drawingBundle();await host.evaluate(()=>{const original=PlayroomSDKSceneRenderer.prototype.tick;PlayroomSDKSceneRenderer.prototype.tick=function(){window.clockRenderer=this;return original.call(this);};});for(const page of [host,artist])await page.evaluate(async bundle=>{await PlayroomPacks.install(PlayroomPacks.prepare(bundle));},bundle);
 const offer=await host.evaluate(async()=>{window.drawTime=0;window.drawSession=new TabletopSession(TabletopCore,'sdk-native-draw',{seed:1,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Artist'},{name:'Guesser'}]});window.drawStore=new PlayroomNetworkSessionStore({name:'sdk-native-clock-store'});await drawStore.create({sessionId:'native-clock',room:{id:'native-room',game:{id:drawSession.game,version:drawSession.packVersion}},session:drawSession});window.drawAuthority=new SessionAuthority(drawSession,{sessionId:'native-clock',clock:{now:()=>drawTime,setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:id=>clearTimeout(id)},persistence:{commit:e=>drawStore.commit(e),commitBatch:e=>drawStore.commitBatch(e),recordReceipt:e=>drawStore.recordReceipt(e),setControl:e=>drawStore.setControl(e)}});window.drawViewer=drawAuthority.connect(1);window.previewCount=0;drawViewer.subscribeRealtime(()=>previewCount++);window.viewerClient=new PlayroomSessionClient(drawViewer);await viewerClient.refresh();window.viewerMount=PlayroomSharedViews.mount(viewerClient,PlayroomPacks.exportView('sdk-native-draw','1.0.0'));viewerMount.render();window.drawPeer=await PlayroomWebRTCTransport.createHostPeer();window.stopDraw=PlayroomWebRTCTransport.serve(drawPeer.channel,drawAuthority.connect(0),{peer:drawPeer});return drawPeer.offer;});
 const answer=await artist.evaluate(async offer=>{window.drawPeer=await PlayroomWebRTCTransport.createClientPeer(offer);return drawPeer.answer;},offer);await Promise.all([host.evaluate(answer=>drawPeer.acceptAnswer(answer),answer),artist.evaluate(async()=>{window.drawTransport=await drawPeer.transport();await drawTransport.ready();window.drawClient=new PlayroomSessionClient(drawTransport);await drawClient.refresh();window.drawMount=PlayroomSharedViews.mount(drawClient,PlayroomPacks.exportView('sdk-native-draw','1.0.0'));drawMount.render();})]);
 assert.equal(await host.evaluate(()=>JSON.stringify(viewerClient.snapshot).includes('PRIVATE_NATIVE_WORD')),false);assert.equal(await artist.evaluate(()=>drawClient.snapshot.state.sdkProjection.data.answer),'PRIVATE_NATIVE_WORD');assert.equal(await artist.locator('.sdk-chat:visible').count(),0,'an artist without guesses has no empty chat panel');
 const box=await artist.locator('.sdk-ink-viewport').boundingBox();assert(box);await artist.mouse.move(box.x+box.width*.2,box.y+box.height*.3);await artist.mouse.down();await artist.mouse.move(box.x+box.width*.55,box.y+box.height*.6,{steps:12});await host.waitForFunction(()=>previewCount>0);assert.equal(await host.evaluate(()=>drawSession.current.move),0);await artist.mouse.up();await host.waitForFunction(()=>drawSession.current.data.operations.length===1);
 // A continuous stroke crosses two bounded command chunks without gaps or layout reads per sample.
 await artist.evaluate(()=>{window.inkRectReads=0;const canvas=document.querySelector('.sdk-ink-base'),read=canvas.getBoundingClientRect.bind(canvas);canvas.getBoundingClientRect=()=>{inkRectReads++;return read();};});
 const paper=await artist.locator('.sdk-ink-base').boundingBox();await artist.mouse.move(paper.x+paper.width*.1,paper.y+paper.height*.2);await artist.mouse.down();await artist.mouse.move(paper.x+paper.width*.9,paper.y+paper.height*.7,{steps:260});await artist.mouse.up();await host.waitForFunction(()=>drawSession.current.data.operations.length>=4);assert.equal(await host.evaluate(()=>drawSession.current.data.operations.length),4);
 const chunks=await host.evaluate(()=>drawSession.current.data.operations.slice(1).map(op=>op.points));assert(chunks.every(points=>points.length<=128));assert.deepEqual(chunks[0].at(-1),chunks[1][0]);assert.deepEqual(chunks[1].at(-1),chunks[2][0]);assert(chunks.flat().length>=261);assert(await artist.evaluate(()=>inkRectReads)<8,'a long stroke measures the paper once, not on every pointermove');
 await artist.locator('[data-ink-options=color]').click();assert.equal(await artist.locator('.sdk-color:visible').count(),14);await artist.locator('.sdk-color').nth(2).click();await artist.locator('[data-ink-options=color]').click();
 assert(await artist.locator('[data-sdk-canvas-scene]').evaluate(el=>el.scrollHeight<=el.clientHeight+1),'drawing UI fits its allocated field');
 await artist.locator('[data-ink-options=width]').click();await artist.locator('.sdk-width').last().click();assert.equal(await artist.locator('[data-ink-options=width]').innerText(),'');await artist.locator('[data-ink-options=width]').click();assert.match(await artist.locator('[data-ink-options=color]').getAttribute('aria-label'),/#4c8060/i);assert.equal(await artist.getByRole('button',{name:'Переместить холст',exact:true}).count(),0);
 await artist.locator('[data-ink-options=zoom]').click();await artist.getByRole('button',{name:'Увеличить',exact:true}).click();await artist.locator('[data-ink-options=zoom]').click();
 const panBox=await artist.locator('.sdk-ink-viewport').boundingBox(),beforePan=await artist.locator('.sdk-ink-viewport').evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));await artist.mouse.move(panBox.x+panBox.width*.6,panBox.y+panBox.height*.6);await artist.mouse.down({button:'right'});await artist.mouse.move(panBox.x+panBox.width*.3,panBox.y+panBox.height*.3,{steps:8});await artist.mouse.up({button:'right'});const afterPan=await artist.locator('.sdk-ink-viewport').evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));assert(afterPan.left>beforePan.left||afterPan.top>beforePan.top,'right button pans the zoomed paper');assert.equal(await host.evaluate(()=>drawSession.current.data.operations.length),4,'panning never paints');
 const touch=await artist.context().newCDPSession(artist);await touch.send('Emulation.setTouchEmulationEnabled',{enabled:true});await artist.locator('.sdk-ink-viewport').evaluate(el=>el.scrollTo(0,0));const tx=panBox.x+panBox.width*.4,ty=panBox.y+panBox.height*.4;await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tx,y:ty,id:1},{x:tx+60,y:ty+60,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tx-40,y:ty-40,id:1},{x:tx+20,y:ty+20,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert(await artist.locator('.sdk-ink-viewport').evaluate(el=>el.scrollLeft>0||el.scrollTop>0),'two fingers pan without a hand tool');assert.equal(await host.evaluate(()=>drawSession.current.data.operations.length),4);await touch.detach();
 const artistPaperBeforeGuess=await artist.locator('.sdk-ink-base').boundingBox();
 await host.locator('.self-player [data-sdk-player-input] input').fill('visible guess');await host.locator('.self-player [data-sdk-player-input] input').evaluate(el=>{window.keptGuessInput=el;});await host.evaluate(()=>viewerMount.render());assert(await host.locator('.self-player [data-sdk-player-input] input').evaluate(el=>el===keptGuessInput&&el.value==='visible guess'),'a live render preserves the native input node and draft');await host.locator('.self-player [data-sdk-player-input] button[type=submit]').click();const artistGuess=artist.locator('.sdk-guess-flights li').filter({hasText:'visible guess'}),hostGuess=host.locator('.sdk-guess-flights li').filter({hasText:'visible guess'});
 await artistGuess.waitFor();await hostGuess.waitFor();
 assert.deepEqual(await artist.locator('.sdk-ink-base').boundingBox(),artistPaperBeforeGuess,'a flying guess leaves the paper untouched');
 assert.equal(await artistGuess.evaluate(bubble=>getComputedStyle(bubble).animationDuration),'5s');
 const expires=await artistGuess.evaluate(bubble=>Number(bubble.dataset.expires));
 await artist.evaluate(until=>{const real=Date.now;Date.now=()=>until;try{drawMount.render();}finally{Date.now=real;}},expires+1);
 await artistGuess.waitFor({state:'detached'});
 await artist.locator('.sdk-guess-review summary').click();
 await artist.locator('.sdk-guess-review').getByRole('button',{name:'Засчитать'}).waitFor();
 assert.equal(await artist.locator('[data-action*="confirm-guess"]').count(),0,'review owns confirmation without a duplicate action below the drawing');
 assert.deepEqual(await artist.locator('.sdk-ink-base').boundingBox(),artistPaperBeforeGuess,'reviewing guesses never resizes the paper');
 await artist.locator('.sdk-guess-review summary').click();
 for(const [now,band]of [[14000,'green'],[16000,'green-yellow'],[21000,'yellow-red'],[26000,'red']]){const clock=await host.evaluate(now=>{drawTime=now;const renderer=clockRenderer,offset=renderer.nowOffset;renderer.nowOffset=now-Date.now();renderer.tick();const card=document.querySelector('.player-panel[data-player-index="0"]'),value={band:card.dataset.clockBand,progress:parseFloat(card.style.getPropertyValue('--sdk-progress-elapsed')),status:document.querySelector('[data-sdk-clock-status]').textContent};renderer.nowOffset=offset;return value;},now);assert.equal(clock.band,band);assert(Math.abs(clock.progress-now/30000*100)<1);assert.match(clock.status,/00:/);}
 const wrong=await artist.evaluate(()=>drawClient.send({type:'guess',roundId:1,text:'wrong actor'}));assert.equal(wrong.ok,false);
 const outcome=await host.evaluate(async()=>{drawTime=30000;await drawAuthority.advanceClock();const raw=await drawStore.readPrivate('native-clock');const restored=await drawStore.load('native-clock',TabletopCore,TabletopSession);return {phase:drawSession.current.data.phase,revision:drawSession.current.move,history:drawSession.states.length,steps:raw.steps.length,hostClock:raw.receipts.some(row=>row.receipt.hostClock),restoredPhase:restored.session.current.data.phase,restoredHistory:restored.session.states.length};});assert.equal(outcome.phase,'guessing');assert.equal(outcome.revision,6);assert.equal(outcome.steps,6);assert.equal(outcome.hostClock,true);assert.equal(outcome.restoredPhase,'guessing');assert.equal(outcome.restoredHistory,7);
 await artist.waitForFunction(()=>drawClient.snapshot.state.scene.clock.phase==='guessing');const late=await artist.evaluate(()=>drawClient.send({type:'draw',roundId:1,operation:{kind:'clear',id:'late'}}));assert.equal(late.ok,false);
 const menuBefore=await host.evaluate(()=>drawSession.current.move);await artist.locator('[data-game-menu]').click();await artist.getByRole('button',{name:'Menu marker',exact:true}).click();await host.waitForFunction(before=>drawSession.current.move===before+1,menuBefore);
 const menu=artist.locator('.game-menu-panel');
 assert(await menu.evaluateAll(panels=>panels.every(panel=>panel.closest('[data-ui-surface-exit][inert]'))),'the menu loses input before its exit animation finishes');
 await menu.waitFor({state:'detached'});
 const voteNotice=artist.locator('[data-ui-notices] .ui-notice');await voteNotice.waitFor();await host.evaluate(()=>clockRenderer.tick());assert.equal(await voteNotice.locator('.ui-notice-close').isVisible(),false);await voteNotice.locator('.ui-notice-summary').click();assert.match(await voteNotice.locator('.ui-distribution-legend').innerText(),/1/);
 const beforeResult=await artist.locator('.sdk-ink-base').boundingBox();
 const resultPhase=await host.evaluate(async()=>{drawTime=45000;await drawAuthority.advanceClock();return drawSession.current.data.phase;});
 assert.equal(resultPhase,'result');
 const resultOverlay=artist.locator('.sdk-ink-paper-overlay>.sdk-round-result');
 await resultOverlay.waitFor();
 assert.match(await resultOverlay.innerText(),/PRIVATE_NATIVE_WORD/);
 assert.equal(await resultOverlay.evaluate(node=>getComputedStyle(node).position),'absolute');
 assert.deepEqual(await artist.locator('.sdk-ink-base').boundingBox(),beforeResult,'round results overlay the fixed drawing');
 await host.evaluate(()=>{viewerMount.destroy();viewerClient.close();drawAuthority.dispose();drawStore.close();stopDraw();drawPeer.close();});await artist.evaluate(()=>{drawMount.destroy();drawClient.close();drawPeer.close();});
});

test('ordinary player keeps covers and native hands without SDK workbench controls',{timeout:60000},async t=>{
 for(const game of ['uno','mage-brawl']){
  const page=await pageFor(t),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.waitForFunction(()=>[...document.querySelectorAll('.game-tile .pack-cover-art')].length===15&&[...document.querySelectorAll('.game-tile .pack-cover-art')].every(img=>img.complete&&img.naturalWidth>0));
  await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned'});PlayroomFirstTurnGuide.setEnabled('uno',false);PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.playerUIRenderer=this;return update.call(this,{...frame,ui:{...frame.ui,quickPlay:false}});};});
  await page.locator('[data-start='+game+']').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('[data-sdk-player-scene]').waitFor();
  assert.equal(await page.locator('.sdk-visual-tools,.sdk-generic-input,.sdk-player,.sdk-tutorial').count(),0,'no invented workbench, duplicate player, generated command form or duplicate tutorial');
  if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();const hand=page.locator(game==='mage-brawl'?'.layout-hand .mage-hand .hand-track':'.layout-hand [data-sdk-hand-owner]');try{await hand.waitFor({timeout:5000});}catch(error){throw Error(JSON.stringify(await page.evaluate(errors=>({errors,viewer:playerUIRenderer.frame.projection.viewer,scope:playerUIRenderer.targetScope.className,ports:[...document.querySelectorAll('[data-sdk-hand-owner]')].map(e=>({id:e.dataset.sdkHandOwner,html:e.innerHTML.slice(0,250)})),players:playerUIRenderer.sceneData.players.map(p=>({player:p.player,hand:p.hand?.length})),text:document.body.innerText.slice(-700)}),errors)));}assert(await hand.locator(game==='mage-brawl'?'.mage-card':'.sdk-piece-card').count()>0,'the normal private hand remains playable');
  const before=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);
  if(game==='uno'){
   assert.equal(await page.locator('.sdk-stock-discard').count(),1,'the authored stock/discard component replaces the invented generic table');
   const stockOrigin=await page.evaluate(()=>{
    const table=document.querySelector('.table-shell'),stock=table.querySelector('.sdk-table-stock-art').getBoundingClientRect();
    const {x,y,width,height}=PlayroomMotion.surface(()=>table).capture({viewer:0,actor:0,action:{type:'draw'},deferDepartures:true}).stock;
    return Math.hypot(x+width/2-stock.left-stock.width/2,y+height/2-stock.top-stock.height/2);
   });
   assert(stockOrigin<=1,'the draw starts at the painted stock rather than the opponent hand');
   assert.equal(await page.locator('.sdk-table-drop').count(),0,'no destination appears until a source is selected');
   assert.equal(await page.locator('.game-action-bar').getByRole('button',{name:'Взять карту',exact:true}).count(),1,'the original draw button remains in the action dock as well as on the stock');
   assert(await page.locator('.game-action-bar').evaluate(e=>Math.abs(e.getBoundingClientRect().width-e.parentElement.clientWidth)<1&&e.getBoundingClientRect().height<=46),'an empty choice overlay cannot steal half the dock width or wrap its labels');
   assert.equal(await page.locator('.sdk-table-discard small').innerText(),await page.evaluate(()=> 'СБРОС · '+playerUIRenderer.sceneData.discardCount));
   const tableGeometry=await page.locator('.sdk-table-center').boundingBox();
   const index=await hand.locator('.sdk-piece-card').evaluateAll(nodes=>nodes.findIndex(el=>!el.disabled&&playerUIRenderer.sceneData.interactions.filter(i=>i.source?.entity?.id===el._target?.entity?.id).length===1));assert(index>=0,'a normal card has a legal native source: '+JSON.stringify({errors,summary:await page.evaluate(()=>({turn:playerUIRenderer.frame.projection.turn,viewer:playerUIRenderer.frame.projection.viewer,actions:playerUIRenderer.frame.projection.actions.map(a=>a.type)}))}));await hand.locator('.sdk-piece-card').nth(index).click({position:{x:8,y:18}});assert.deepEqual(await page.locator('.sdk-table-center').boundingBox(),tableGeometry,'selection overlays the discard without moving either pile');assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),before,'select mode does not commit a card on the source tap');await page.locator('.sdk-table-drop:visible').first().click();
  }else{
   const fieldGeometry=await page.locator('.layout-field').boundingBox();
   await hand.locator('.mage-card:not([disabled])').first().click({position:{x:8,y:18}});assert.equal(await page.locator('.mage-action-switch button').count(),2);assert.equal(await page.locator('.mage-rotate').count(),2);assert.equal(await page.locator('.sdk-choice-panel:visible').count(),0,'planning uses the native hand controls');await page.locator('.mage-action-switch [data-view-value=attack]').click();await page.locator('.mage-ready').click();
   assert.deepEqual(await page.locator('.layout-field').boundingBox(),fieldGeometry,'choice controls overlay the stable game geometry');
  }
  try{await page.waitForFunction(before=>PlayroomAppBridge.saveLibrary.current().session.current.move>before,before,{timeout:5000});}catch(error){throw Error(game+' '+JSON.stringify(await page.evaluate(()=>({selected:playerUIRenderer.selectedSource,quickPlay:playerUIRenderer.frame.ui?.quickPlay,move:PlayroomAppBridge.saveLibrary.current().session.current.move,choices:playerUIRenderer.choiceCommands,blocked:playerUIRenderer.frame.interaction})))+' '+errors.join(','));}
  if(game==='uno'){
   await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>playerUIRenderer.frame.history.reviewing&&playerUIRenderer.frame.projection.revision===0);assert.equal(await page.locator('.layout-hand .sdk-piece-card:not(.is-hidden) .uno-print-face').count(),7,'history preserves every original private card face');assert.equal(await page.locator('.layout-hand [data-sdk-target]:not([disabled])').count(),0);await page.locator('[data-command=history-close]:visible').first().click();await page.waitForFunction(()=>!playerUIRenderer.frame.history.reviewing);assert.equal(await page.locator('.layout-hand .sdk-piece-card:not(.is-hidden)').count(),await page.evaluate(()=>playerUIRenderer.sceneData.players.find(p=>p.player===playerUIRenderer.frame.projection.viewer).hand.length));
  }
  assert.deepEqual(errors,[]);
 }
});

test('ordinary color deck opens its choice from the card and restores focus on cancel',{timeout:30000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>create(id,{...options,seed:2,firstPlayer:0,firstPlayerMode:'assigned'});
  PlayroomFirstTurnGuide.setEnabled('uno',false);
 });
 await page.locator('[data-start=uno]').first().tap();
 await page.locator('[data-game-mode=hotseat]').tap();
 await page.locator('[data-command=lobby-start]').tap();
 await page.locator('.sdk-stock-discard').waitFor();
 const unlock=page.locator('.handoff [data-command=unlock]');
 if(await unlock.isVisible())await unlock.tap();
 const fixture=await page.evaluate(()=>{
  const state=PlayroomAppBridge.saveLibrary.current().session.current,plays=TabletopCore.legalActions(state).filter(action=>action.type==='play');
  const wild=plays.find(action=>plays.filter(option=>option.card===action.card).length===4);
  return {card:wild?.card,move:state.move};
 });
 assert(fixture.card,'the fixed deal contains a legal four-color command');
 const card=page.locator('.layout-hand [data-entity="card-'+fixture.card+'"]'),picker=page.locator('.sdk-choice-panel[data-choice-kind=color]');
 const move=()=>page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);
 const buttons=picker.locator('.color-choice');
 await card.tap();
 await picker.waitFor({timeout:5000});
 assert.equal(await buttons.count(),4);
 assert.equal(await move(),fixture.move);
 await buttons.first().focus();
 await page.keyboard.press('Escape');
 assert.equal(await picker.isVisible(),false);
 assert(await card.evaluate(element=>document.activeElement===element),'cancel returns keyboard focus to the selected card');
 assert.equal(await move(),fixture.move);
 await card.press('Enter');
 assert(await buttons.first().evaluate(element=>document.activeElement===element),'keyboard activation focuses the first color');
 const expected=await buttons.first().evaluate(element=>element._command.color);
 await page.keyboard.press('Enter');
 await page.waitForFunction(before=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return s.move===before+1;},fixture.move);
 const played=await page.evaluate(()=>{const d=PlayroomAppBridge.saveLibrary.current().session.current.data;return {card:d.discard.at(-1).id,color:d.color};});
 assert.deepEqual(played,{card:fixture.card,color:expected});
});

test('ordinary color deck finishes the public reveal before hidden penalty draws in play and history',{timeout:30000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>create(id,{...options,seed:7,firstPlayer:0,firstPlayerMode:'assigned',players:[{name:'А'},{name:'Б'},{name:'В'}]});
  PlayroomFirstTurnGuide.setEnabled('uno',false);
  const update=PlayroomSDKSceneRenderer.prototype.update;
  PlayroomSDKSceneRenderer.prototype.update=function(frame){return update.call(this,{...frame,ui:{...frame.ui,quickPlay:false}});};
  const animate=Element.prototype.animate;
  window.penaltyEffects=[];
  let revealFinished=false;
  Element.prototype.animate=function(...args){
   const effect=animate.apply(this,args),kind=this.dataset.motionKind;
   if(this.classList.contains('action-reveal-art')){
    revealFinished=false;
    penaltyEffects.push({kind:'reveal',end:effect.finished.then(()=>{revealFinished=true;})});
   }
   if(kind==='draw')penaltyEffects.push({kind:'draw',delay:effect.effect.getTiming().delay,player:this.dataset.motionPlayer,
    sealed:!this.querySelector('.uno-print-face,[data-entity]'),revealFinished,end:effect.finished});
   return effect;
  };
 });
 await page.locator('[data-start=uno]').first().tap();
 await page.locator('[data-game-mode=hotseat]').tap();
 await page.locator('[data-command=lobby-start]').tap();
 await page.locator('.sdk-stock-discard').waitFor();
 const unlock=page.locator('.handoff [data-command=unlock]');
 if(await unlock.isVisible())await unlock.tap();
 await page.locator('.layout-hand [data-entity="card-u48"]').tap();
 await page.locator('.sdk-table-drop').tap();
 const effects=async()=>{
  await page.waitForFunction(()=>penaltyEffects.filter(effect=>effect.kind==='draw').length===2);
  return page.evaluate(async()=>{const frames=penaltyEffects.splice(0);await Promise.all(frames.map(frame=>frame.end));return frames.map(({end,...frame})=>frame);});
 };
 const live=await effects();
 assert.deepEqual(live.map(effect=>effect.kind),['reveal','reveal','draw','draw']);
 assert(live.slice(2).every(effect=>effect.player==='1'&&effect.sealed),'only anonymous card backs travel to the penalized seat');
 assert(live.slice(2).every(effect=>effect.revealFinished),'the public card reaches the table before any draw starts');
 assert(live[2].delay===0&&live[3].delay>0,'the cards stagger within the transfer phase');
 const result=await page.evaluate(()=>{
  const state=PlayroomAppBridge.saveLibrary.current().session.current;
  return {move:state.move,turn:state.turn,hands:state.data.hands.map(hand=>hand.length)};
 });
 assert.deepEqual(result,{move:1,turn:2,hands:[6,9,7]});
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 await page.locator('[data-game-menu]').click();
 await page.locator('[data-command=history]:visible').click();
 const slider=page.locator('#replay-range');
 await slider.waitFor();await slider.focus();await slider.press('Home');
 await page.waitForFunction(()=>document.querySelector('#replay-range').value==='0');
 await slider.press('ArrowRight');
 assert.deepEqual(await effects(),live,'history reuses the live reveal and transfer order');
 assert.equal(await page.locator('.layout-hand [data-sdk-target]:not([disabled])').count(),0);
});

test('ordinary UNO presents an independent declaration during a blocked local turn',{timeout:30000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true,reducedMotion:'no-preference'});
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  PlayroomFirstTurnGuide.setEnabled('uno',false);
  TabletopCore.createGame=(id,options)=>{
   if(id!=='uno')return create(id,options);
   const state=create(id,{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned',unoMode:'manual'});
   const hand=state.data.hands[0],play=TabletopCore.availableCommands(state,0).find(action=>action.type==='play'&&hand.some(card=>card.id===action.card&&/^\d+$/.test(String(card.value))));
   if(!play)throw Error('Expected a playable number card');
   const kept=[hand.find(card=>card.id===play.card),hand.find(card=>card.id!==play.card)];
   state.data.drawPile.push(...hand.filter(card=>!kept.includes(card)));
   state.data.hands[0]=kept;
   TabletopCore.validateState(state);
   window.declarationCard=play.card;
   return state;
  };
 });
 await page.locator('[data-start=uno]').first().tap();
 await page.locator('[data-game-mode=hotseat]').tap();
 await page.locator('[data-command=lobby-start]').tap();
 await page.locator('.sdk-stock-discard').waitFor();
 const unlock=page.locator('.handoff [data-command=unlock]');if(await unlock.isVisible())await unlock.tap();
 await page.evaluate(()=>{
  const reactions=TabletopCore.reactions,readSnapshot=SessionAuthority.prototype._snapshot;
  const present=PlayroomSDKSceneRenderer.prototype.present,presentCue=PlayroomGameFeedback.prototype.presentCue;
  const animate=Element.prototype.animate;
  window.localReactionReads=0;window.localReactionFrames=[];window.localReactionOrder=[];
  TabletopCore.reactions=(...args)=>{localReactionReads++;return reactions(...args);};
  SessionAuthority.prototype._snapshot=function(...args){
   const frame=readSnapshot.apply(this,args);
   if(frame.viewer===0)window.localReactionSnapshot=frame;
   return frame;
  };
  PlayroomSDKSceneRenderer.prototype.present=function(frame,options){
   if(frame.projection.revision===1&&frame.interaction?.blocked){
    localReactionFrames.push({authorityList:options.shellActions===window.localReactionSnapshot?.independentActions,
     actions:options.shellActions?.map(action=>action.type)});
   }
   return present.call(this,frame,options);
  };
  PlayroomGameFeedback.prototype.presentCue=function(cue,...rest){
   const effect=presentCue.call(this,cue,...rest);
   if(cue.kind==='enter'&&cue.item?.revision===1&&!window.releaseLocalReactionPhase){
    return Promise.all([effect,new Promise(resolve=>{window.releaseLocalReactionPhase=resolve;})]);
   }
   if(cue.kind==='enter'&&cue.item?.revision===2)localReactionOrder.push('declaration');
   return effect;
  };
  Element.prototype.animate=function(frames,options){
   if(options?.id?.startsWith('turn-handoff-'))localReactionOrder.push(options.id);
   return animate.call(this,frames,options);
  };
 });
 const card=await page.evaluate(()=>declarationCard);
 await page.locator('.layout-hand [data-entity="card-'+card+'"]').tap();
 if(await page.locator('.sdk-table-drop').isVisible())await page.locator('.sdk-table-drop').tap();
 const declare=page.locator('.table-shell>.scene[aria-busy=true] [data-action*="declare-uno"]:enabled');
 await declare.waitFor({timeout:5000});
 await page.waitForFunction(()=>typeof window.releaseLocalReactionPhase==='function');
 const proof=await page.evaluate(()=>({reads:localReactionReads,frames:localReactionFrames}));
 t.diagnostic('Local blocked UNO frames: '+JSON.stringify(proof));
 assert.equal(proof.reads,0,'rendering a blocked turn does not request another list of reactions');
 assert.ok(proof.frames.length&&proof.frames.every(frame=>frame.authorityList&&frame.actions.includes('declare-uno')&&frame.actions.every(type=>['declare-uno','accuse-uno'].includes(type))));
 await declare.tap();
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===2);
 await page.evaluate(()=>releaseLocalReactionPhase());
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert.deepEqual(await page.evaluate(()=>localReactionOrder),['declaration','turn-handoff-outgoing','turn-handoff-incoming']);
});

test('ordinary color deck retains the top discard and only animates a real stock arrival',{timeout:45000},async t=>{
 for(const fixture of ['last','recycle','empty']){
  const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
  await page.evaluate(fixture=>{
   const create=TabletopCore.createGame;
   TabletopCore.createGame=(id,options)=>{
    const state=create(id,{...options,seed:1,firstPlayer:0,firstPlayerMode:'assigned'});
    if(id!=='uno')return state;
    const d=state.data;
    if(fixture==='recycle')d.discard.unshift(...d.drawPile.splice(0));
    else d.hands[1].push(...d.drawPile.splice(0,d.drawPile.length-(fixture==='last'?1:0)));
    TabletopCore.validateState(state);
    return state;
   };
   PlayroomFirstTurnGuide.setEnabled('uno',false);
   const animate=Element.prototype.animate;
   window.stockArrivals=0;
   Element.prototype.animate=function(...args){
    if(this.dataset.motionKind==='draw')stockArrivals++;
    return animate.apply(this,args);
   };
  },fixture);
  await page.locator('[data-start=uno]').first().tap();
  await page.locator('[data-game-mode=hotseat]').tap();
  await page.locator('[data-command=lobby-start]').tap();
  const stock=page.locator('.sdk-table-stock');
  await stock.waitFor();
  const unlock=page.locator('.handoff [data-command=unlock]');
  if(await unlock.isVisible())await unlock.tap();
  const inspect=()=>page.evaluate(()=>{
   const state=PlayroomAppBridge.saveLibrary.current().session.current,d=state.data;
   return {turn:state.turn,own:d.hands[0].length,stock:d.drawPile.length,discard:d.discard.length,top:d.discard.at(-1).id,noDraw:d.noDraw,flights:stockArrivals};
  });
  const before=await inspect(),empty=fixture==='empty';
  await stock.tap();
  await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  assert.deepEqual(await inspect(),{turn:0,own:before.own+(empty?0:1),stock:fixture==='recycle'?before.discard-2:0,discard:1,top:before.top,noDraw:empty,flights:empty?0:1},fixture);
  if(empty){
   await page.getByRole('button',{name:'Завершить ход',exact:true}).tap();
   await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.turn===1);
  }else if(fixture==='recycle'){
   await page.locator('[data-game-menu]').click();
   await page.locator('[data-command=history]:visible').click();
   const slider=page.locator('#replay-range');
   await slider.waitFor();await slider.focus();await slider.press('Home');
   await page.waitForFunction(()=>document.querySelector('#replay-range').value==='0');
   await slider.press('ArrowRight');
   await page.waitForFunction(()=>stockArrivals===2);
   assert(await stock.isDisabled(),'the same stock stays read-only while its draw is replayed');
  }
  await page.context().close();
 }
});

test('ordinary cross-route uses native dice and preserves exit, friendly targets, capture and finish',{timeout:90000},async t=>{
 for(const mode of ['exit','friendly','capture','finish']){
  const page=await pageFor(t),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(mode=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const state=create(id,{...options,diceCount:2,seed:17,firstPlayer:0,firstPlayerMode:'assigned'});if(id==='ludo'){state.turn=0;Object.assign(state.data,{phase:'move',dice:mode==='exit'?[6,2]:[2,3],used:[false,false]});state.data.pawns[0]=mode==='friendly'?[7,9,-1,-1]:mode==='exit'?[-1,-1,-1,-1]:mode==='capture'?[7,-1,-1,-1]:[55,-1,-1,-1];if(mode==='capture')state.data.pawns[1]=[48,-1,-1,-1];if(!TabletopCore.validateState(state))throw Error('Invalid cross-route fixture');}return state;};PlayroomFirstTurnGuide.setEnabled('ludo',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.crossRenderer=this;return update.call(this,frame);};},mode);
  await page.locator('[data-start=ludo]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-cross-route').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
  const field=page.locator('.layout-field'),geometry=await field.boundingBox(),board=await page.locator('.sdk-cross-route').boundingBox();assert(Math.abs(board.width-board.height)<1,'the original cross board remains square');assert.equal(await field.locator('.sdk-die').count(),0,'dice never consume or overflow the field');const dice=page.locator('.layout-actions [data-sdk-dice-port] .sdk-die');assert.equal(await dice.count(),2);assert(await dice.evaluateAll(nodes=>nodes.every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})),'both native dice remain on screen');
  const before=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);
  if(mode==='capture')await page.evaluate(()=>{
   window.routeDataViews=[];
   window.routeContacts=[];
   const seen=new WeakSet(),paint=PlayroomGameFeedback.prototype.paintParticipantEffects;
   PlayroomGameFeedback.prototype.paintParticipantEffects=function(mount,item,...args){
    paint.call(this,mount,item,...args);
    if(!item?.contact?.active||seen.has(item)||!mount?.querySelector('[data-feedback-kind=capture]'))return;
    seen.add(item);
    const flight=document.querySelector('.playroom-motion-flight[data-motion-kind=move]')?.getAnimations()[0];
    routeContacts.push(flight?{time:flight.currentTime,...flight.effect.getTiming()}:null);
   };
   const project=TabletopCore.project;
   TabletopCore.project=function(state,viewer,options){
    const view=project.call(this,state,viewer,options);
    if(state.game==='ludo'&&view.modelProjection){
     routeDataViews.push({move:state.move,viewer,authority:options?.rawEvents===false,
      shared:view.data===view.modelProjection.data&&Object.isFrozen(view.data),detached:!Object.hasOwn(view,'data')});
    }
    return view;
   };
  });
  if(mode==='friendly')await page.evaluate(()=>{
   const cells=document.querySelector('.sdk-cross-cells'),changed=new Set();
   const collect=records=>{for(const {target} of records)changed.add(target.dataset.motionAnchor);};
   const observer=new MutationObserver(collect);observer.observe(cells,{subtree:true,attributes:true,attributeFilter:['aria-label']});
   window.changedRouteCells=()=>{collect(observer.takeRecords());observer.disconnect();return [...changed].sort();};
  });
  await page.locator('.sdk-cross-pawn[data-entity="token-0-0"]').click();
  if(mode!=='exit'){
   assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),before,'field pawns are selected before choosing a die or destination');assert.deepEqual(await field.boundingBox(),geometry);
   if(mode==='friendly'){assert.deepEqual(await page.evaluate(()=>changedRouteCells()),['path-10','path-9'],'only destination labels change when selecting a pawn');assert(await page.locator('.sdk-cross-pawn[data-entity="token-0-1"]').evaluate(e=>!e.disabled&&e._target.entity?.id==='0-1'),'a friendly pawn on the destination remains its own source');await dice.nth(0).click();}
   else if(mode==='capture')await page.locator('.sdk-cross-pawn[data-entity="token-1-0"]').click();
   else await page.locator('.sdk-cross-cell[data-motion-anchor="finish-0"]').click();
  }
  if(['exit','friendly','capture','finish'].includes(mode)){await page.locator('.playroom-motion-flight[data-motion-kind=route]').first().waitFor({state:'attached',timeout:5000});assert.equal(await page.locator('.sdk-flight-layer').count(),0,'the shared route animator owns the physical motion');if(mode==='capture')assert.equal(await page.locator('.playroom-motion-flight[data-motion-kind=move]').count(),1,'only the captured public pawn moves back to its base before arrival');}
  await page.waitForFunction(({mode,before})=>{const s=PlayroomAppBridge.saveLibrary.current().session.current;return s.move>before&&s.data.pawns[0][0]===(mode==='exit'?0:mode==='finish'?57:9);},{mode,before});if(mode==='capture')assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.pawns[1][0]),-1);assert.deepEqual(await field.boundingBox(),geometry,'playing a pawn cannot resize its field');if(mode==='friendly'){
   await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>crossRenderer.frame.history.reviewing&&crossRenderer.sceneData.pawns.find(p=>p.id==='token-0-0').progress===7);assert.equal(await page.locator('[data-sdk-dice-port] .sdk-die').count(),2,'history retains the same native die rack');assert.equal(await page.locator('.sdk-cross-pawn>svg').count(),8,JSON.stringify(await page.evaluate(()=>({rootConnected:crossRenderer.root.isConnected,pawns:document.querySelectorAll('.sdk-cross-pawn').length,first:document.querySelector('.sdk-cross-pawn')?.innerHTML.slice(0,220),text:document.body.innerText.slice(-500)}))));assert.equal(await page.locator('.sdk-cross-route .is-playable,.sdk-cross-route .board-target,.layout-actions .sdk-die:not([disabled])').count(),0,'history uses the same pieces without live permissions or markers');assert(await page.evaluate(()=>{const pawn=document.querySelector('.sdk-cross-pawn[data-entity="token-0-0"]').getBoundingClientRect(),cell=document.querySelector('.sdk-cross-cell[data-motion-anchor="path-7"]').getBoundingClientRect();return Math.hypot(pawn.x+pawn.width/2-cell.x-cell.width/2,pawn.y+pawn.height/2-cell.y-cell.height/2)<2;}),'historical pawn artwork occupies its historical route cell');await page.locator('[data-command=history-close]:visible').first().click();await page.waitForFunction(()=>!crossRenderer.frame.history.reviewing&&crossRenderer.sceneData.pawns.find(p=>p.id==='token-0-0').progress===9);
  }
  if(mode==='capture'){
   await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
   const assertContact=({time,delay,duration}={})=>{
    assert(delay>0&&time>=delay-50&&time<delay+duration,'capture feedback starts as the defending pawn departs');
   };
   const liveContacts=await page.evaluate(()=>routeContacts);
   assert.equal(liveContacts.length,1);
   assertContact(liveContacts[0]||undefined);
   const views=await page.evaluate(()=>routeDataViews.filter(view=>view.move===1));
   assert(views.some(view=>!view.authority),'the new frame reached the screen through the local projection');
   assert(views.filter(view=>!view.authority).every(view=>view.shared),'the immutable screen frame reads the model data by reference');
   assert(views.some(view=>view.authority),'the authority built a frame for the accepted move');
   assert(views.filter(view=>view.authority).every(view=>view.detached),'the authority does not create compatibility data it will discard');
   assert(await page.evaluate(()=>{
    const view=TabletopCore.project(PlayroomAppBridge.saveLibrary.current().session.current,0);
    return view.data!==view.modelProjection.data&&!Object.isFrozen(view.data);
   }),'the ordinary engine entry point still returns a separate mutable data view');
   await page.evaluate(()=>{
    window.historyProjectionCalls=[];
    routeDataViews.length=0;
    const project=TabletopCore.project;
    TabletopCore.project=function(state,viewer,options){
     if(state.game==='ludo'&&options?.rawEvents===undefined)historyProjectionCalls.push(state.move+':'+viewer);
     return project.apply(this,arguments);
    };
   });
   await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();
   const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');
   await page.waitForFunction(()=>crossRenderer.sceneData.pawns.find(p=>p.id==='token-1-0').progress===48);
   await slider.press('ArrowRight');
   const actor=page.locator('.playroom-motion-flight[data-motion-kind=route]').first();
   await actor.waitFor({state:'attached',timeout:5000});
   const timing=await actor.evaluate(el=>({actor:el.getAnimations()[0].effect.getTiming(),victim:document.querySelector('.playroom-motion-flight[data-motion-kind=move]')?.getAnimations()[0].effect.getTiming()}));
   assert(timing.victim?.delay>0&&timing.actor.duration>timing.victim.delay+timing.victim.duration,'the replay holds the attacker until the victim reaches base');
   await page.waitForFunction(()=>routeContacts.length===2);
   assertContact(await page.evaluate(()=>routeContacts[1])||undefined);
   const calls=await page.evaluate(()=>historyProjectionCalls);
   assert.deepEqual(calls,['1:-1'],'history reuses both mounted boards and builds the new public projection once');
   assert(await page.evaluate(()=>routeDataViews.some(view=>view.move===1&&view.viewer===-1&&!view.authority&&view.shared)),
    'the replay uses the same immutable data contract as live play');
  }
  assert.deepEqual(errors,[]);await page.context().close();
 }
});

test('ordinary score sheet preserves native dice, confirmation, summaries and real history',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayerMode:'assigned',firstPlayer:0});PlayroomFirstTurnGuide.setEnabled('dice-poker',false);});
 await page.locator('[data-start=dice-poker]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-score-sheet').waitFor();
 const imageFaces=await page.evaluate(()=>PlayroomPacks.list().some(({manifest})=>manifest.id==='dice-poker'&&manifest.sdkFeatures?.includes('die-faces-v1')));
 const dice=page.locator('[data-sdk-dice-port] .sdk-die'),roll=page.locator('[data-sdk-dice-port] .sdk-score-roll');assert.equal(await dice.count(),5);assert.equal(await page.locator('.layout-field .sdk-die').count(),0);assert.equal(await page.locator('.sdk-score-sheet thead .avatar').count(),2);assert.equal(await page.locator('.sdk-score-sheet tbody tr').count(),17);assert.equal(await page.locator('.sdk-score-sheet button').count(),0);
 await page.evaluate(()=>window.scoreRefs={sheet:document.querySelector('.sdk-score-sheet'),body:document.querySelector('.sdk-score-sheet tbody'),rows:[...document.querySelectorAll('.sdk-score-sheet tbody tr')],faces:[...document.querySelectorAll('.sdk-score-dice .sdk-die>svg')]});
 const field=await page.locator('.layout-field').boundingBox();await roll.click();await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert.equal(await page.locator('.sdk-score-sheet button').count(),15);assert.match(await roll.innerText(),/1\/3/);
 const beforeHold=await page.evaluate(()=>{
  scoreRefs.faces=[...document.querySelectorAll('.sdk-score-dice .sdk-die>svg')];
  return {value:PlayroomAppBridge.saveLibrary.current().session.current.data.dice[0],url:scoreRefs.faces[0].querySelector('image')?.getAttribute('href')};
 });
 await dice.first().click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.held[0]);
 assert.equal(await dice.first().getAttribute('aria-pressed'),'true');
 assert(await page.evaluate(imageFaces=>scoreRefs.sheet===document.querySelector('.sdk-score-sheet')&&scoreRefs.body===document.querySelector('.sdk-score-sheet tbody')&&scoreRefs.rows.every((row,i)=>row===document.querySelectorAll('.sdk-score-sheet tbody tr')[i])&&scoreRefs.faces.every((face,i)=>i===0&&imageFaces||face===document.querySelectorAll('.sdk-score-dice .sdk-die>svg')[i]),imageFaces),'holding retains the table rows and every unchanged die face');
 if(imageFaces){
  const heldUrl=await dice.first().locator('image').getAttribute('href');
  assert.match(beforeHold.url,/^blob:/);assert.match(heldUrl,/^blob:/);assert.notEqual(heldUrl,beforeHold.url);
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.dice[0]),beforeHold.value);
 }
 assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);
 await page.emulateMedia({reducedMotion:'no-preference'});await roll.click();
 const rolling=page.locator('.playroom-motion-flight[data-motion-kind=roll]');
 await rolling.first().waitFor();assert.equal(await rolling.count(),4,'the shared animator rolls only the four unheld dice');
 if(imageFaces)assert.equal(await rolling.locator('image').count(),4);
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.match(await roll.innerText(),/2\/3/);
 const checkLedger=()=>page.locator('.sdk-score-board').evaluate(board=>{
  const area=board.getBoundingClientRect(),head=board.querySelector('thead th'),foot=board.querySelector('tfoot th');
  const edges=()=>Math.abs(head.getBoundingClientRect().top-area.top)<1&&Math.abs(foot.getBoundingClientRect().bottom-area.bottom)<1;
  board.scrollTop=0;
  const atStart=edges();
  board.scrollTop=board.scrollHeight;
  const result={atStart,atEnd:edges(),scrolled:board.scrollTop>0};
  board.scrollTop=0;
  return result;
 });
 for(const viewport of [{width:360,height:640},{width:844,height:320}]){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.deepEqual(await checkLedger(),{atStart:true,atEnd:true,scrolled:true},'category rows scroll between the player header and the total');
  const controls=await dice.evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
  controls.push(await roll.evaluate(node=>node.getBoundingClientRect().toJSON()));
  assert(controls.every(box=>box.width>0&&box.height>0&&box.bottom<=viewport.height),'dice and reroll remain in view while the ledger scrolls');
 }
 await page.evaluate(()=>{
  window.scoreColumnPaints=0;
  const prototype=PlayroomSDKSceneRenderer.prototype,render=prototype.renderScoreSheet;
  prototype.renderScoreSheet=function(...args){window.scoreColumnPaints++;return render.apply(this,args);};
 });
 const revision=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await page.locator('.sdk-score-sheet thead [data-score-player="1"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.sdk-score-sheet thead [data-score-player="1"]').getAttribute('aria-selected'),'true');assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),revision,'column inspection is local UI state');
 assert.equal(await page.evaluate(()=>scoreColumnPaints),0,'focusing another column only changes its local highlight');
 const cell=page.locator('[data-score-row="ones"] button');await cell.click();await page.locator('#modal-root [data-command=confirm-action]').waitFor();assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.scores[0].ones),undefined);await page.locator('#modal-root .modal-foot [data-command=close-modal]').click();await page.locator('#modal-root [data-command=confirm-action]').waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),revision);await cell.click();await page.locator('#modal-root [data-command=confirm-action]').click();
 if(imageFaces){
  await page.locator('.action-reveal-die image').first().waitFor();
  assert.equal(await page.locator('.action-reveal-die image').count(),5);
  assert.match(await page.locator('.action-reveal').getAttribute('aria-label'),/Синий ромб/);
 }
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.scores[0].ones!==undefined);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 const score=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.scores[0].ones);assert.equal(await page.locator('[data-score-row="ones"] td[data-score-player="0"]').innerText(),String(score));assert.equal(await page.locator('[data-score-row="upper"] td[data-score-player="0"]').innerText(),String(score));assert.equal(await page.locator('tfoot td[data-score-player="0"]').innerText(),String(score));
 await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>document.querySelector('[data-score-row="ones"] td[data-score-player="0"]')?.textContent==='—');assert.equal(await page.locator('.sdk-score-sheet tbody tr').count(),17);assert.equal(await page.locator('.sdk-score-dice .sdk-die>svg').count(),5);assert.equal(await page.locator('.sdk-score-sheet button:not([disabled])').count(),0);assert.equal(await page.locator('.sdk-score-roll').isVisible(),false);assert(await page.evaluate(()=>scoreRefs.sheet===document.querySelector('.sdk-score-sheet')),'history uses the same mounted score sheet');
 for(const viewport of [{width:844,height:320},{width:360,height:640}]){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const {dock,rack}=await page.locator('.layout-actions:has(.sdk-score-dice)').evaluate(actions=>({
   dock:actions.getBoundingClientRect().height,
   rack:actions.querySelector('.sdk-score-dice').getBoundingClientRect().height
  }));
  assert.equal(dock,rack,'history reserves only the compact dice rack');
  assert.deepEqual(await checkLedger(),{atStart:true,atEnd:true,scrolled:true},'the history ledger retains both sticky edges');
 }
 await page.locator('[data-command=history-close]:visible').first().click();await page.waitForFunction(()=>document.querySelector('[data-score-row="ones"] td[data-score-player="0"]')?.textContent!=='—');
});

async function startLocalNumberedRoute(page){
 await page.locator('[data-start=snakes]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 // The default second seat is a bot. Use a human so the next turn cannot
 // move the returned pawn before this test reads the committed board.
 await page.evaluate(()=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
  bridge.renderLobby();
 });
 await page.locator('[data-command=lobby-start]').click();
}

test('ordinary numbered routes move from the start dock through a link and return a displaced pawn',{timeout:60000},async t=>{
 const page=await pageFor(t);await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const state=create(id,{...options,seed:17,preset:id==='snakes'?'plus':options.preset,firstPlayerMode:'assigned',firstPlayer:0});if(id==='snakes'){state.turn=0;Object.assign(state.data,{phase:'move',positions:[0,22],dice:[3,4]});if(!TabletopCore.validateState(state))throw Error('Invalid numbered-route fixture');}return state;};PlayroomFirstTurnGuide.setEnabled('snakes',false);});
 await page.evaluate(()=>{
  const renderer=PlayroomSDKSceneRenderer.prototype,{update,layoutSignature}=renderer;
  window.numberedGeometryReads={repeatedFrames:0,repeatedSignatures:0,sharedCommandFrames:0,repeatedCommandIndexes:0,nonMotionFrames:0,nonMotionSignatures:0};
  let nonMotionFrame=false;
  const samePublishedScene=(renderer,scene)=>scene?.numberedRoute&&renderer.frame?.scene===scene&&Object.isFrozen(scene);
  renderer.update=function(frame){
   if(frame.scene?.numberedRoute)window.numberedRenderer=this;
   if(samePublishedScene(this,frame.scene))numberedGeometryReads.repeatedFrames++;
   const priorIndex=this.allowedCommands;
   const sameCommands=frame.scene?.numberedRoute&&this.frame?.projection.actions===frame.projection.actions&&PlayroomProtocol.ownsImmutable(frame.projection.actions);
   const previous=nonMotionFrame;
   nonMotionFrame=!!(frame.scene?.numberedRoute&&Object.isFrozen(frame.scene)&&
    (frame.ui?.externalMotion||this.frame?.sessionId!==frame.sessionId||this.frame?.projection.revision===frame.projection.revision));
   if(nonMotionFrame)numberedGeometryReads.nonMotionFrames++;
   let result;
   try{result=update.call(this,frame);}finally{nonMotionFrame=previous;}
   if(sameCommands){numberedGeometryReads.sharedCommandFrames++;if(priorIndex!==this.allowedCommands)numberedGeometryReads.repeatedCommandIndexes++;}
   return result;
  };
  renderer.layoutSignature=function(scene){if(samePublishedScene(this,scene))numberedGeometryReads.repeatedSignatures++;if(nonMotionFrame)numberedGeometryReads.nonMotionSignatures++;return layoutSignature.call(this,scene);};
 });
 await startLocalNumberedRoute(page);
 await page.locator('.sdk-numbered-board').waitFor();
 assert.equal(await page.evaluate(()=>!!PlayroomAppBridge.saveLibrary.current().session.current.players[1].bot),false);
 const board=await page.locator('.sdk-numbered-board').boundingBox();assert(Math.abs(board.width-board.height)<1);
 const art=await page.evaluate(()=>{const icon=document.querySelector('.sdk-numbered-special svg'),special=icon.parentElement,entry=document.querySelector('.sdk-numbered-entry .sdk-numbered-pawn'),cell=special.parentElement,field=document.querySelector('.game-field-content'),board=document.querySelector('.sdk-numbered-board');return {opacity:getComputedStyle(cell).opacity,icon:icon.getBoundingClientRect().width,special:special.getBoundingClientRect().width,pawn:entry.getBoundingClientRect().width,slot:entry.parentElement.getBoundingClientRect().width,board:board.getBoundingClientRect().width,field:field.getBoundingClientRect().width};});assert.equal(art.opacity,'1','board print stays opaque while inactive');assert(Math.abs(art.icon-art.special)<1,'special symbols fill their physical cell inset');assert.equal(art.pawn,art.slot,'menu target sizing cannot enlarge a dock pawn');assert(Math.abs(art.board-art.field)<1,'the host field inset is not applied twice');
assert.equal(await page.locator('.layout-field .sdk-die').count(),0);assert.equal(await page.locator('.sdk-numbered-entry .sdk-numbered-pawn').count(),1);
 const dice=page.locator('.layout-actions .sdk-die');assert.equal(await dice.count(),2);await dice.first().click();await page.locator('.playroom-motion-flight[data-motion-kind=route]').waitFor();assert.equal(await page.locator('.playroom-motion-flight[data-motion-kind=move]').count(),1,'the displaced pawn has one return flight');await page.waitForFunction(()=>!document.querySelector('.playroom-motion-flight'));await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.positions),[22,0]);
 const position=page.locator('.player-panel[data-player-index="0"] [data-score-id="position"]').first();
 assert.equal((await position.textContent()).trim(),'22');
 assert.match(await position.getAttribute('aria-label'),/: 22$/);
 const returned=page.locator('.sdk-numbered-entry .sdk-numbered-pawn[data-entity="token-1"]');
 await returned.waitFor().catch(async error=>{
  const field=await page.evaluate(()=>({
   positions:window.numberedRenderer?.sceneData.positions.map(pawn=>pawn.cell),
   dockMounted:window.numberedRenderer?.numberedEntries?.isConnected,
   pawns:[...document.querySelectorAll('.sdk-numbered-pawn')].map(node=>({
    entity:node.dataset.entity,parent:node.parentElement?.className,
    top:node.style.top,translate:node.style.translate,visibility:getComputedStyle(node).visibility
   }))
  }));
  throw Error(`Returned pawn is not visible: ${JSON.stringify(field)}`,{cause:error});
 });
 assert.equal(await returned.count(),1);
 const geometryReads=await page.evaluate(()=>window.numberedGeometryReads);
 assert.ok(geometryReads.repeatedFrames>0,'the same published scene is used during the turn handoff');
 assert.equal(geometryReads.repeatedSignatures,0,'unchanged published scenes reuse their geometry signature');
 assert.ok(geometryReads.sharedCommandFrames>0,'the normal handoff renders a previously indexed action list');
 t.diagnostic('Repeated command indexes on stable projected lists: '+geometryReads.repeatedCommandIndexes+' / '+geometryReads.sharedCommandFrames);
 assert.equal(geometryReads.repeatedCommandIndexes,0);
 t.diagnostic('Layout signatures on frames without renderer motion: '+JSON.stringify(geometryReads));
 assert.ok(geometryReads.nonMotionFrames>0,'the ordinary app mounts committed scenes without renderer-owned movement');
 assert.equal(geometryReads.nonMotionSignatures,0);
 assert.deepEqual(await page.locator('.sdk-numbered-board').boundingBox(),board,'a complete link and exchange preserve field geometry');
 await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>document.querySelector('.sdk-numbered-entry .sdk-numbered-pawn[data-entity="token-0"]'));
 assert.equal(await page.locator('.sdk-numbered-entry .sdk-numbered-pawn[data-entity="token-0"]').isVisible(),true,'historical start pawns survive generic action-button suppression');assert.equal(await page.locator('.sdk-numbered-pawn>svg').count(),2);assert.equal(await page.locator('.sdk-numbered-board .board-target,.sdk-numbered-pawn[data-drag-piece]').count(),0,'the same history scene has no live targets');
});

test('ordinary import accepts 512 resources and renders only the requested die faces',{timeout:60000},async t=>{
 for(const preload of [false,true])await t.test(preload?'warm 32 named future faces':'keep the unselected catalog lazy',async t=>{
 const project=require('./sdk-fixture.cjs').fixture(t),folder=path.join(project,'assets');
 fs.mkdirSync(folder);
 for(let i=0;i<512;i++){
  const color=i===511?'#2a5':'#c54';
  fs.writeFileSync(path.join(folder,'face-'+i+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><title>Face ${i}</title><rect width="12" height="12" fill="${color}"/></svg>`);
 }
 const manifestPath=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
 Object.assign(manifest,{name:'Asset limit fixture',engineApi:4,viewApi:3,stateVersion:1,execution:'isolated-v1',sdkFeatures:['isolated-execution-v1']});
 fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 fs.appendFileSync(path.join(project,'domain/game.js'),`
 PlayroomPackDefinition.reduce=(p,actor)=>({position:{...p,data:{...p.data,count:p.data.count+1}},
  events:[{type:'probe.rolled',actor,params:{},visibility:{kind:'public'}}]});`);
 fs.writeFileSync(path.join(project,'presentation/scene.js'),`
 const command={type:'step'},ref={namespace:'die',id:'0'};
 const die=count=>({value:6,face:SDK.resource(count?'assets/face-511.svg':'assets/face-0.svg')});
 globalThis.PlayroomPackPresentation={
  metadata:${preload?"{preloadImages:[SDK.resource('assets/face-511.svg'),...Array.from({length:31},(_,i)=>SDK.resource('assets/face-'+(i+1)+'.svg'))]}":"{}"},
  action:()=> 'Обновить грань',
  event:()=>({message:'Новая грань',kind:'roll',reveal:{kind:'dice',dice:[{...die(1),label:'Новая грань'},{value:2,label:'Два'}]}}),
  scene:projection=>({contractVersion:1,id:'asset-limit',family:'board',
   players:[0,1].map(player=>({player,metrics:[]})),
   dice:[die(projection.data.count)],
   zones:[{id:'field',kind:'board'}],objects:[{ref,zone:'field',index:0}],
   interactions:projection.actions.length?[{command,kind:'activate',target:{entity:ref}}]:[]})
 };`);
 const artifact=path.join(project,'probe.playroom-pack.json');
 const compile="import runpy,sys;c=runpy.run_path(sys.argv[1]);print(c['json_text'](c['build_pack'](sys.argv[2])))";
 const input=execFileSync('python3',['-c',compile,path.join(root,'tooling/pack_compiler.py'),project],{encoding:'utf8'});
 assert.equal(JSON.parse(input).sdk.assets.length,512);
 fs.writeFileSync(artifact,input);
 const page=await pageFor(t,{viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const modal=page.locator('#modal-root>[data-surface-state=active]');
 await page.locator('[data-hub-page=profile]').click();
 await page.locator('#hub-profile-page [data-command=packs]').click();
 await modal.locator('#pack-file').setInputFiles(artifact);
 await modal.locator('[data-pack-install]').click();
 await modal.locator('[data-installed-pack][data-pack-id=probe]').waitFor();
 await modal.locator('.modal-head [data-command=close-modal]').click();
 await page.locator('[data-hub-page=games]').click();
 await page.evaluate(()=>{
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  window.faceBlobs=[];
  window.revokedFaces=[];
  URL.createObjectURL=file=>{const url=create(file);if(file.type==='image/svg+xml')window.faceBlobs.push(url);return url;};
  URL.revokeObjectURL=url=>{if(window.faceBlobs.includes(url))window.revokedFaces.push(url);return revoke(url);};
  const decode=Image.prototype.decode;
  window.warmedFaces=[];window.warmedBytes=0;
  Image.prototype.decode=function(){
   const ready=decode.call(this),url=this.src;
   if(url.startsWith('blob:'))ready.then(()=>{window.warmedFaces.push(url);window.warmedBytes+=this.naturalWidth*this.naturalHeight*4;},()=>{});
   return ready;
  };
 });
 const openRoom=async()=>{
  await page.locator('[data-start=probe]').click();
  await page.locator('[data-game-mode=hotseat]').click();
 };
 await openRoom();
 if(preload){
  await page.waitForFunction(()=>window.warmedFaces.length===32);
  const abandoned=await page.evaluate(()=>window.warmedFaces.slice());
  assert.equal(await page.evaluate(()=>window.warmedBytes),32*12*12*4);
  await modal.locator('.modal-head [data-command=close-modal]').click();
  await page.waitForFunction(urls=>urls.every(url=>window.revokedFaces.includes(url)),abandoned);
  await page.evaluate(()=>{window.warmedFaces=[];window.warmedBytes=0;window.revokedFaces=[];window.faceBlobs=[];});
  await openRoom();
 }
 await page.evaluate(()=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.setLocalSeat(room.id,room.ownerId,'seat-2',{kind:'human',nickname:'Игрок 2'});
  bridge.roomService.configure(room.id,room.ownerId,{firstPlayerMode:'assigned',firstParticipantId:room.ownerId});
  bridge.renderLobby();
  PlayroomFirstTurnGuide.setEnabled('probe',false);
 });
 if(preload)await page.waitForFunction(()=>window.warmedFaces.length===32);
 const prepared=await page.evaluate(()=>window.warmedFaces[0]);
 assert.equal(await page.evaluate(()=>window.faceBlobs.length),preload?32:0,'only the named future faces are prepared before the match');
 await page.locator('[data-command=lobby-start]').click();
 const die=page.locator('.sdk-die').first(),face=die.locator('image');
 const readFace=()=>face.evaluate(image=>fetch(image.getAttribute('href')).then(response=>response.text()));
 assert.match(await readFace(),/<title>Face 0<\/title>/);
 assert.equal(await page.evaluate(()=>window.faceBlobs.length),preload?33:1,'the first face uses the same cache as the lobby');
 const unlock=page.locator('.handoff [data-command=unlock]');if(await unlock.isVisible())await unlock.click();
 await page.emulateMedia({reducedMotion:'no-preference'});
 await die.click();
 const largeFace=page.locator('.action-reveal-die image');
 await largeFace.waitFor({timeout:5000});
 assert.match(await page.locator('.action-reveal').getAttribute('aria-label'),/Новая грань, Два/);
 const revealUrl=await largeFace.getAttribute('href');
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current()?.session.current.move===1);
 assert.match(await readFace(),/<title>Face 511<\/title>/);
 assert.equal(revealUrl,await face.getAttribute('href'),'the public reveal and the die use the same installed face URL');
 if(preload){
  assert.equal(await face.getAttribute('href'),prepared,'the running scene takes the lobby URL');
  assert.deepEqual(await page.evaluate(()=>window.revokedFaces),[]);
 }
 assert.equal(await page.evaluate(()=>window.faceBlobs.length),preload?33:2);
 await largeFace.waitFor({state:'detached'});
 await page.locator('[data-game-menu]').click();
 await modal.locator('[data-command=history]').click();
 const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');
 await face.waitFor();
 assert.match(await readFace(),/<title>Face 0<\/title>/);
 await slider.press('ArrowRight');
 await largeFace.waitFor({timeout:5000});
 assert.equal(await largeFace.getAttribute('href'),revealUrl,'history uses the same installed image for the large reveal');
 assert.equal(await page.evaluate(()=>window.faceBlobs.length),preload?33:2,'history reuses the existing face URL');
 assert.deepEqual(errors,[]);
 });
});

test('a prepared JSON animation plays on its die in the app and Studio history',{timeout:60000},async t=>{
 const project=require('./sdk-fixture.cjs').fixture(t);
 const manifestPath=path.join(project,'manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
 Object.assign(manifest,{name:'JSON motion fixture',engineApi:4,viewApi:3,stateVersion:1,execution:'isolated-v1',sdkFeatures:['isolated-execution-v1']});
 fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 fs.mkdirSync(path.join(project,'assets'));
 fs.writeFileSync(path.join(project,'assets/pulse.json'),JSON.stringify({contractVersion:1,frames:[
  {time:0,values:{x:12,opacity:.4}},{time:240,values:{x:0,opacity:1}}
 ]}));
 fs.appendFileSync(path.join(project,'domain/game.js'),`
 PlayroomPackDefinition.reduce=(position,actor)=>({
  position:{...position,data:{...position.data,count:position.data.count+1}},
  events:[{type:'probe.step',actor,params:{},visibility:{kind:'public'}}]
 });`);
 fs.appendFileSync(path.join(project,'presentation/scene.js'),`
 PlayroomPackPresentation.action=()=> 'Pulse';
 PlayroomPackPresentation.event=()=>({message:'Pulse',animation:{asset:SDK.resource('assets/pulse.json'),target:{entity:{namespace:'die',id:'0'}}}});
 const base=PlayroomPackPresentation.scene,ref={namespace:'die',id:'0'};
 PlayroomPackPresentation.scene=projection=>({...base(projection),dice:[{value:6}],zones:[{id:'field',kind:'board'}],
  objects:[{ref,zone:'field',index:0}],interactions:projection.actions.map(command=>({kind:'activate',command,target:{entity:ref}}))});`);
 const artifact=path.join(project,'motion.playroom-pack.json');
 const compile="import runpy,sys;c=runpy.run_path(sys.argv[1]);print(c['json_text'](c['build_pack'](sys.argv[2])))";
 fs.writeFileSync(artifact,execFileSync('python3',['-c',compile,path.join(root,'tooling/pack_compiler.py'),project],{encoding:'utf8'}));
 const trace=()=>{
  const animate=Element.prototype.animate;
  let originalFrames;
  window.assetAnimationTrace=[];
  Element.prototype.animate=function(frames,options){
   const animation=animate.call(this,frames,options);
   if(this.dataset.entity==='die-0'&&frames?.[0]?.translate==='12px 0px'){
    originalFrames??=frames;
    const sample={reused:frames===originalFrames,frames,duration:options.duration,finished:false};
    assetAnimationTrace.push(sample);
    animation.finished.then(()=>{sample.finished=true;},()=>{});
   }
   return animation;
  };
 };
 const verifyTrace=async browserView=>{
  await browserView.waitForFunction(()=>assetAnimationTrace.length===2&&assetAnimationTrace.every(sample=>sample.finished));
  const [live,replay]=await browserView.evaluate(()=>assetAnimationTrace);
  assert.equal(live.duration,240);
  assert.deepEqual(live.frames,[{offset:0,translate:'12px 0px',opacity:.4},{offset:1,translate:'0px 0px',opacity:1}]);
  assert.deepEqual(replay,live);
 };
 const page=await pageFor(t,{viewport:{width:390,height:844},reducedMotion:'no-preference'});
 await page.evaluate(trace);
 const modal=page.locator('#modal-root>[data-surface-state=active]');
 await page.locator('[data-hub-page=profile]').click();
 await page.locator('#hub-profile-page [data-command=packs]').click();
 await modal.locator('#pack-file').setInputFiles(artifact);
 await modal.locator('[data-pack-install]').click();
 await modal.locator('[data-installed-pack][data-pack-id=probe]').waitFor();
 await modal.locator('.modal-head [data-command=close-modal]').click();
 await page.locator('[data-hub-page=games]').click();
 await page.locator('[data-start=probe]').click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>PlayroomFirstTurnGuide.setEnabled('probe',false));
 await page.locator('[data-command=lobby-start]').click();
 const die=page.locator('.sdk-die').first();
 await die.click();
 await page.waitForFunction(()=>assetAnimationTrace[0]?.finished);
 await page.locator('[data-game-menu]').click();
 await page.locator('[data-command=history]:visible').click();
 const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');
 assert.equal(await page.evaluate(()=>assetAnimationTrace.length),1,'seeking is silent');
 await slider.press('ArrowRight');
 await verifyTrace(page);

 const running=await require('../sdk/server.cjs').serve(project);
 t.after(()=>running.close());
 const studio=await browser.newPage({reducedMotion:'no-preference'});
 t.after(()=>studio.close());
 await studio.goto(running.url);
 await studio.waitForFunction(()=>!!frame&&!!renderer?.renderer?.frame);
 const view=studio.frames().find(frame=>frame.url().endsWith('/viewer.html'));
 await view.evaluate(trace);
 await view.locator('.sdk-die').first().click();
 await view.waitForFunction(()=>assetAnimationTrace[0]?.finished);
 await studio.locator('#history-prev').click();
 await studio.waitForFunction(()=>frame.projection.revision===0);
 assert.equal(await view.evaluate(()=>assetAnimationTrace.length),1);
 await studio.locator('#history-next').click();
 // Studio transports frames between processes, so only the installed app
 // guarantees the same JavaScript reference across an arbitrary replay.
 await view.waitForFunction(()=>assetAnimationTrace.length===2&&assetAnimationTrace.every(sample=>sample.finished));
 assert.deepEqual(await view.evaluate(()=>assetAnimationTrace.map(({frames,duration})=>({frames,duration}))),
  Array(2).fill({frames:[{offset:0,translate:'12px 0px',opacity:.4},{offset:1,translate:'0px 0px',opacity:1}],duration:240}));
});

async function installSDKExample(page,path,id){
 await page.locator('[data-hub-page=profile]').tap();
 await page.locator('#hub-profile-page [data-command=packs]').tap();
 const modal=page.locator('#modal-root>[data-surface-state=active]');
 await modal.locator('#pack-file').setInputFiles(path);
 await modal.locator('[data-pack-install]').tap();
 await modal.locator('[data-installed-pack][data-pack-id='+id+']').waitFor();
 await modal.locator('.modal-head [data-command=close-modal]').tap();
 await page.locator('[data-hub-page=games]').tap();
}
async function traceInventoryMotion(page){
 await page.evaluate(()=>{
  window.inventoryFlights=[];window.inventoryReleases=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(frames,options){
   if(this.matches('.playroom-motion-flight[data-motion-kind=placement]')){
    const parse=frame=>{const matrix=new DOMMatrix(frame.transform);return {x:matrix.e,y:matrix.f};};
    inventoryFlights.push({from:parse(frames[0]),to:parse(frames.at(-1)),count:this.querySelectorAll('.sdk-inventory-item').length});
   }
   return animate.call(this,frames,options);
  };
  window.addEventListener('pointerup',()=>{
   const ghost=document.querySelector('.playroom-drag-ghost');
   if(ghost){const {x,y}=ghost.getBoundingClientRect();inventoryReleases.push({x,y});}
  },true);
 });
}
async function dragInventoryItem(page,from,to){
 const a=await from.boundingBox(),b=await to.boundingBox();assert(a&&b);
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
 await page.mouse.move(b.x+b.width*.76,b.y+b.height*.53,{steps:14});await page.mouse.up();
}
const closeInventoryPoint=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<3;

test('ordinary mixed inventory shows distinct pieces and preserves private trays in history',{timeout:60000},async t=>{
 const path=process.env.PLAYROOM_SDK_MIXED_INVENTORY_PACK;
 if(!path){t.skip('Use the compiled mixed-inventory SDK example');return;}
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await installSDKExample(page,path,'mixed-inventory');
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>create(id,id==='mixed-inventory'?{...options,seed:1,firstPlayer:0,firstPlayerMode:'assigned'}:options);
 });
 await page.locator('[data-start=mixed-inventory]').tap();
 await page.locator('[data-game-mode=hotseat]').tap();
 await page.evaluate(()=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
  bridge.renderLobby();
 });
 await page.locator('[data-command=lobby-start]').tap();
 const unlock=page.locator('.handoff [data-command=unlock]');
 if(await unlock.isVisible())await unlock.tap();
 const inventory=page.locator('.sdk-inventory'),owner=inventory.locator('[data-scene-zone=hand-0]'),opponent=inventory.locator('[data-scene-zone=hand-1]'),tray=inventory.locator('[data-scene-zone=tray]');
 await owner.locator('[data-kind=card]').waitFor();
 const overview=inventory.locator('[data-inventory-overview=overview]'),summary=overview.locator('[data-inventory-view=in-hand-0]');
 await summary.waitFor();
 assert.match(await summary.innerText(),/Карта, достоинство/);
 assert.equal(await overview.locator('[data-inventory-view=in-hand-1]').count(),0,'the opponent card has no secondary view');
 assert.equal(await overview.locator('button,[tabindex],[data-entity],[data-sdk-target]').count(),0,'the overview cannot become a command or motion source');
 await summary.tap();
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
 assert.deepEqual(await owner.locator('button').evaluateAll(nodes=>nodes.map(button=>button.dataset.kind)),['card','tile','token']);
 assert.equal(await opponent.locator('[data-entity]').count(),0);
 assert.match(await opponent.innerText(),/· 3/);
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:844,height:320}]){
  await page.setViewportSize(viewport);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert(await owner.locator('button').evaluateAll(nodes=>nodes.every(node=>{
   const {width,height,left,top}=node.getBoundingClientRect(),hit=document.elementFromPoint(left+width/2,top+height/2);
   return width>=44&&height>=44&&node.contains(hit)&&!!node.querySelector('svg');
  })),'each piece remains in view and interactive after resizing');
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const checks=await page.evaluate(()=>{
  const state=PlayroomAppBridge.saveLibrary.current().session.current;
  const own=TabletopCore.project(state,0),open=TabletopCore.project(state,-1),projection=open.modelProjection;
  const forged=structuredClone(open.scene);
  forged.objects.push(own.scene.objects.find(object=>object.ref.namespace==='card'));
  const code=run=>{try{run();return null;}catch(error){return error.code;}};
  const orphan=structuredClone(open.scene),duplicate=structuredClone(own.scene),view=own.scene.inventoryLayout.overviews[0].views[0];
  orphan.inventoryLayout.overviews[0].views.push(view);
  duplicate.inventoryLayout.overviews[0].views.push(view);
  const outOfRange=structuredClone(own.scene);outOfRange.interactions[0].target.index=2;
  return {publicObjects:open.scene.objects.length,publicCommands:projection.actions.length,publicOverview:open.scene.inventoryLayout.overviews[0].views.length,
   invalidCurrent:code(()=>PlayroomSceneContract.commands(PlayroomSceneContract.validate(forged,2),projection)),
   invalidHistory:code(()=>PlayroomSceneContract.eventScenes([{eventId:4,scene:forged}],{...projection,revision:1,events:[{id:4,revision:1}]})),
   invalidSource:code(()=>PlayroomSceneContract.validate(orphan,2)),duplicateId:code(()=>PlayroomSceneContract.validate(duplicate,2)),
   invalidSlot:code(()=>PlayroomSceneContract.validate(outOfRange,2))};
 });
 assert.deepEqual(checks,{publicObjects:0,publicCommands:0,publicOverview:0,invalidCurrent:'SCENE_INVENTORY_VISIBILITY_DENIED',invalidHistory:'SCENE_INVENTORY_VISIBILITY_DENIED',invalidSource:'SCENE_INVENTORY_VIEW_SOURCE_INVALID',duplicateId:'SCENE_INVENTORY_VIEW_INVALID',invalidSlot:'SCENE_INVENTORY_INPUT_INVALID'});
 const slots=tray.locator('.sdk-inventory-slot'),targets=slots.locator('.sdk-inventory-slot-target');
 assert.equal(await tray.locator('.sdk-inventory-slot-target:visible').count(),2);
 assert.equal(await targets.nth(0).isDisabled(),true,'a destination requires a source');
 const token=owner.locator('[data-kind=token]');await token.tap();
 assert.equal(await token.getAttribute('aria-pressed'),'true');
 assert.equal(await targets.nth(0).isEnabled(),true);
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
 await traceInventoryMotion(page);
 const tile=owner.locator('[data-kind=tile]');await tile.focus();await tile.press('Enter');
 assert.equal(await targets.nth(0).evaluate(target=>document.activeElement===target),true);
 const tileFrom=await tile.boundingBox();
 await targets.nth(1).press('Enter');
 await tray.locator('[data-entity=tile-0]').waitFor();
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);
 assert.equal(await slots.nth(1).locator('[data-entity=tile-0]').count(),1,'the item keeps the authored address across an empty earlier slot');
 const detail=overview.locator('[data-inventory-view=stored-tile-0]');
 await detail.locator('svg').waitFor();
 assert.equal(await inventory.locator('[data-entity=tile-0]').count(),1,'the tile still owns a single physical identity');
 assert.equal(await detail.getAttribute('aria-label'),await tray.locator('[data-entity=tile-0]').getAttribute('aria-label'));
 await page.waitForFunction(()=>inventoryFlights.length>0,null,{timeout:5000});
 const liveFlights=await page.evaluate(()=>inventoryFlights);
 assert.equal(liveFlights.length,1,'compact-tray reindexing does not create another placement');
 const [liveFlight]=liveFlights;
 assert.equal(liveFlight.count,1);
 assert(closeInventoryPoint(liveFlight.from,tileFrom),'keyboard motion starts at the selected tile');
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert(closeInventoryPoint(liveFlight.to,await tray.locator('[data-entity=tile-0]').boundingBox()));
 assert.equal(await page.locator('.sdk-flight-layer').count(),0,'the common motion surface owns the flight');
 assert.equal(await page.evaluate(()=>{
  const scene=TabletopCore.project(PlayroomAppBridge.saveLibrary.current().session.current,-1).scene;
  const [view]=scene.inventoryLayout.overviews[0].views;
  return scene.objects.length===1&&view.ref.namespace===scene.objects[0].ref.namespace&&view.ref.id===scene.objects[0].ref.id;
 }),true,'the Table overview resolves only the newly public tile');
 const pass=page.locator('[data-command=pass-device]:not([disabled]):visible');
 await page.locator('[data-game-menu]').tap();await page.locator('[data-command=history]:visible').tap();
 const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');
 await tray.locator('[data-entity=tile-0]').waitFor({state:'detached'});
 assert.equal(await detail.count(),0);
 assert.equal(await inventory.locator('button:not(:disabled)').count(),0);
 const replayFrom=await owner.locator('[data-entity=tile-0]').boundingBox();
 await slider.press('ArrowRight');
 await tray.locator('[data-entity=tile-0]').waitFor();
 await detail.locator('svg').waitFor();
 await page.waitForFunction(()=>inventoryFlights.length===2);
 assert(closeInventoryPoint((await page.evaluate(()=>inventoryFlights[1])).from,replayFrom),'forward history measures its own source frame');
 assert.equal(await inventory.locator('button:not(:disabled)').count(),0);
 await page.locator('[data-command=history-close]:visible').first().tap();
 await pass.or(unlock.filter({visible:true})).first().waitFor({timeout:5000});
 if(await pass.count())await pass.tap();
 if(await unlock.isVisible())await unlock.tap();
 const card=opponent.locator('[data-entity=card-1]');
 await card.waitFor({timeout:5000});
 await dragInventoryItem(page,card,slots.nth(1));
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),1,'dropping on an occupied slot leaves the revision');
 assert.equal(await page.evaluate(()=>inventoryFlights.length),2,'cancelling does not create a placement flight');
 await dragInventoryItem(page,card,slots.nth(0));
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===2);
 await slots.nth(0).locator('[data-entity=card-1]').waitFor();
 await page.waitForFunction(()=>inventoryFlights.length===3);
 const {flight,release}=await page.evaluate(()=>({flight:inventoryFlights.at(-1),release:inventoryReleases.at(-1)}));
 assert(release&&closeInventoryPoint(flight.from,release),'the card lands from the released ghost, without returning to the tray');
 assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.stored.map(entry=>entry.slot)),[1,0]);
 assert.deepEqual(errors,[]);
});

test('network mixed inventory consumes release geometry locally after the accepted move',{timeout:45000},async t=>{
 const file=process.env.PLAYROOM_SDK_MIXED_INVENTORY_PACK;
 if(!file){t.skip('Use the compiled mixed-inventory SDK example');return;}
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await installSDKExample(page,file,'mixed-inventory');
 await traceInventoryMotion(page);
 await page.evaluate(async()=>{
  const session=new TabletopSession(TabletopCore,'mixed-inventory',{seed:1,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'One'},{name:'Two'}]});
  const authority=new SessionAuthority(session,{sessionId:'sdk-inventory-placement'}),wire=PlayroomWebRTCTransport;
  const host=await wire.createHostPeer(),port=authority.connect(0);
  const stop=wire.serve(host.channel,{...port,dispatch:packet=>{window.inventoryPacket=packet;return port.dispatch(packet);}},{peer:host});
  const guest=await wire.createClientPeer(host.offer);await host.acceptAnswer(guest.answer);
  const client=new PlayroomSessionClient(await guest.transport());await client.refresh();
  const view=PlayroomSharedViews.mount(client,PlayroomPacks.exportView('mixed-inventory'));view.render();
  window.inventoryNet={client,dispose(){view.destroy();client.close();stop();authority.dispose();}};
 });
 try{
  const tile=page.locator('.sdk-inventory [data-scene-zone=hand-0] [data-entity=tile-0]');
  const slot=page.locator('.sdk-inventory [data-scene-zone=tray] .sdk-inventory-slot').nth(1);
  await tile.waitFor();
  await dragInventoryItem(page,tile,slot);
  await page.waitForFunction(()=>inventoryNet.client.snapshot.revision===1&&inventoryFlights.length>0,null,{timeout:8000});
  const {flights,release,packet}=await page.evaluate(()=>({flights:inventoryFlights,release:inventoryReleases.at(-1),packet:inventoryPacket}));
  assert.equal(flights.length,1);
  assert(release&&closeInventoryPoint(flights[0].from,release));
  assert.doesNotMatch(JSON.stringify(packet),/playedFrom|playedEntity|playedTarget/);
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  assert(closeInventoryPoint(flights[0].to,await slot.locator('[data-entity=tile-0]').boundingBox()));
  assert.deepEqual(errors,[]);
 }finally{await page.evaluate(()=>inventoryNet.dispose());}
});

async function openAnchoredDemo(page,artifact,preset){
 await installSDKExample(page,artifact,'anchored-cargo');
 await page.locator('[data-start=anchored-cargo]').click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(preset=>{
  const bridge=PlayroomAppBridge,room=bridge.room();
  bridge.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
  if(preset)bridge.roomService.updateRules(room.id,room.ownerId,{...room.rules,preset});
  bridge.renderLobby();
 },preset);
 await page.locator('[data-command=lobby-start]').click();
 await page.locator('.sdk-anchored-board').waitFor();
}
test('ordinary anchored board keeps cargo attached during travel and history',{timeout:60000},async t=>{
 const artifact=process.env.PLAYROOM_SDK_ANCHORED_CARGO_PACK;
 if(!artifact){t.skip('Use the compiled anchored-cargo SDK example');return;}
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await openAnchoredDemo(page,artifact);
 const field=page.locator('.sdk-anchored-board'),carrier=field.locator('[data-entity=tile-carrier]');
 const unlock=async()=>{const button=page.locator('.handoff [data-command=unlock]');if(await button.isVisible())await button.tap();};
 await field.waitFor();await unlock();
 const rotating=await page.evaluate(()=>Object.hasOwn(PlayroomAppBridge.saveLibrary.current().session.current.data,'orientation'));
 const slots=carrier.locator('.sdk-anchored-slot > button');
 assert.equal(await slots.count(),2);
 assert.equal(await slots.nth(1).isDisabled(),true,'only the next eligible slot is actionable');
 assert(await carrier.evaluate(element=>{
  const piece=element.getBoundingClientRect(),cell=element.parentElement.getBoundingClientRect();
  return piece.width<=cell.width&&piece.height<=cell.height;
 }),'the carrier fits its grid cell');
 const invalid=await page.evaluate(()=>{
  const state=PlayroomAppBridge.saveLibrary.current().session.current;
  const {scene}=TabletopCore.project(state,state.turn);
  const code=edit=>{const value=structuredClone(scene);edit(value);try{PlayroomSceneContract.validate(value,state.players.length);return null;}catch(error){return error.code;}};
  return [
   code(value=>{value.zones[1].anchor.id='absent';}),
   code(value=>{value.objects.push({ref:{namespace:'token',id:'overflow'},zone:'cargo-slots',index:2,visual:{kind:'token',value:3,label:'Overflow'}});}),
   code(value=>{value.objects[0].orientation=4;})
  ];
 });
 assert.deepEqual(invalid,['SCENE_ANCHORED_ZONE_INVALID','SCENE_ANCHORED_SLOT_INVALID','SCENE_ANCHORED_ORIENTATION_INVALID']);
 const revision=()=>page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);
 const start=await revision();
 await slots.nth(0).tap();
 await carrier.locator('[data-entity=token-0]').waitFor();
 assert.equal(await revision(),start+1);
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.points.reduce((a,b)=>a+b,0)),1);
 assert.equal(await slots.nth(0).isDisabled(),true,'an occupied slot may not be loaded twice');

 await page.evaluate(()=>{
  window.cargoFlights=[];window.cargoTurns=[];
  const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){
   if(this.matches('.sdk-anchored-pose')&&args[0]?.[0]?.rotate!==undefined)
    cargoTurns.push({angles:args[0].map(frame=>frame.rotate),flight:!!this.closest('.playroom-motion-flight'),loaded:!!this.querySelector('.sdk-anchored-piece')});
   if(this.matches('.playroom-motion-flight[data-motion-kind=move]')){
    const carrier=this.querySelector('.sdk-anchored-piece'),cargo=carrier?.querySelector('.sdk-anchored-piece');
    if(carrier){
     const a=carrier.getBoundingClientRect(),b=cargo?.getBoundingClientRect();
     cargoFlights.push(b?{x:b.x-a.x,y:b.y-a.y,width:b.width}:null);
    }
   }
   return animate.apply(this,args);
  };
 });
 const asOffset=element=>{const a=element.getBoundingClientRect(),b=element.querySelector('[data-entity=token-0]').getBoundingClientRect();return {x:b.x-a.x,y:b.y-a.y,width:b.width};};
 const vector=element=>{const a=element.getBoundingClientRect(),b=element.querySelector('[data-entity=token-0]').getBoundingClientRect();return [b.x+b.width/2-a.x-a.width/2,b.y+b.height/2-a.y-a.height/2];};
 const clockwise=(b,a)=>Math.hypot(b[0]+a[1],b[1]-a[0])<2;
 if(rotating){
  const prior=await carrier.evaluate(vector),box=await carrier.boundingBox();
  await page.getByRole('button',{name:'Повернуть тайл',exact:true}).tap();
  await page.waitForFunction(()=>cargoTurns.length>0);
  assert.deepEqual(await page.evaluate(()=>cargoTurns),[{angles:['0deg','90deg'],flight:false,loaded:true}]);
  assert.equal(await page.locator('.playroom-motion-layer').count(),0,'turning in place does not clone the carrier');
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  assert(clockwise(await carrier.evaluate(vector),prior),'the cargo turns around the carrier pivot');
  assert.deepEqual(await carrier.boundingBox(),box);
 }
 const before=await carrier.evaluate(asOffset);
 const beforeTravel=rotating?await carrier.evaluate(vector):null;
 await field.locator('.sdk-anchored-cell[data-key="1"] > button').tap();
 await page.waitForFunction(()=>cargoFlights.length>0);
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 const settled=await field.locator('.sdk-anchored-cell[data-key="1"]').locator('[data-entity=tile-carrier]').evaluate(asOffset);
 const [flying]=await page.evaluate(()=>cargoFlights);
 assert(flying?.width>0,'the native flight includes the loaded token');
 assert.equal(await page.evaluate(()=>cargoFlights.length),1,'the carrier and cargo have one animation owner');
 if(rotating){
  assert(clockwise(await carrier.evaluate(vector),beforeTravel),'the same cargo turns while the carrier moves');
  assert.deepEqual((await page.evaluate(()=>cargoTurns)).at(-1),{angles:['90deg','180deg'],flight:true,loaded:true});
 }else for(const dimension of ['x','y','width'])assert(Math.abs(before[dimension]-settled[dimension])<2&&Math.abs(before[dimension]-flying[dimension])<2,'the cargo holds its pose inside the carrier');

 const pass=page.locator('[data-command=pass-device]:not([disabled]):visible');
 if(await pass.isVisible())await pass.tap();
 await unlock();
 await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();
 const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');
 await field.locator('.sdk-anchored-cell[data-key="0"]').locator('[data-entity=tile-carrier]').waitFor();
 assert.equal(await field.locator('[data-motion-attached]').count(),0);
 await slider.press('ArrowRight');await carrier.locator('[data-entity=token-0]').waitFor();
 if(rotating){
  await slider.press('ArrowRight');
  await page.waitForFunction(()=>cargoTurns.length===3);
  assert.deepEqual((await page.evaluate(()=>cargoTurns)).at(-1),{angles:['0deg','90deg'],flight:false,loaded:true});
  await page.waitForFunction(()=>document.querySelector('.sdk-anchored-pose[data-motion-pivot]')?.getAnimations().length===0);
 }
 await slider.press('ArrowRight');
 await field.locator('.sdk-anchored-cell[data-key="1"]').locator('[data-entity=token-0]').waitFor();
 assert.equal(await field.locator('button:not(:disabled)').count(),0);
 await page.waitForFunction(()=>cargoFlights.length===2);
 assert(await page.evaluate(()=>cargoFlights[1]?.width>0),'forward history plays the same carrier flight with cargo');
 if(rotating)assert.deepEqual((await page.evaluate(()=>cargoTurns)).at(-1),{angles:['90deg','180deg'],flight:true,loaded:true});
 await page.locator('[data-command=history-close]:visible').first().tap();
 await slots.nth(1).tap();
 await carrier.locator('[data-entity=token-1]').waitFor();
 assert.equal(await carrier.locator('.sdk-anchored-slot > button:not(:disabled)').count(),0,'the full rack exposes no load targets');
 await field.locator('.sdk-anchored-cell[data-key="2"] > button').tap();
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.status==='finished');
 assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data),{cell:2,loaded:2,points:[1,1],...(rotating?{orientation:3}:{})});
 assert.deepEqual(errors,[]);
});

test('ordinary carrier handoff moves one cargo node and replays its flight',{timeout:60000},async t=>{
 const artifact=process.env.PLAYROOM_SDK_ANCHORED_CARGO_PACK;
 if(!artifact){t.skip('Use the compiled anchored-cargo SDK example');return;}
 for(const gesture of ['tap','drag','keyboard'])await t.test(gesture,async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await openAnchoredDemo(page,artifact,'handoff');
  const unlock=page.locator('.handoff [data-command=unlock]');
  if(await unlock.isVisible())await unlock.tap();
  const carrier=page.locator('[data-entity=tile-carrier]'),receiver=page.locator('[data-entity=tile-receiver]');
  const first=carrier.locator('.sdk-anchored-slot > button').first(),target=receiver.locator('.sdk-anchored-slot > button');
  await first.tap();
  const cargo=carrier.locator('[data-entity=token-0]');
  await cargo.waitFor();
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  assert.equal(await target.isDisabled(),true,'the vacant slot alone does not commit a transfer');
  await page.evaluate(()=>{
   window.originalCargo=document.querySelector('[data-entity=token-0]');
   window.handoffFlights=[];window.receiverFlights=[];window.receiverCopies=[];
   const clone=Node.prototype.cloneNode;
   Node.prototype.cloneNode=function(deep){
    if(this.dataset?.entity==='tile-receiver')receiverCopies.push(!!deep);
    return clone.call(this,deep);
   };
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(this.matches('.playroom-motion-flight[data-motion-kind=placement]'))handoffFlights.push({
     frames:frames.map(frame=>frame.transform),objects:this.querySelectorAll('.sdk-anchored-piece').length});
    if(this.matches('.playroom-motion-flight[data-motion-kind=move]'))receiverFlights.push(this.querySelectorAll('.sdk-anchored-piece').length);
    return animate.call(this,frames,options);
   };
  });
  let release;
  if(gesture==='tap'){
   await first.tap();
   assert.equal(await target.isDisabled(),false);
   await target.tap();
  }else if(gesture==='keyboard'){
   await first.focus();await first.press('Enter');
   assert(await target.evaluate(button=>button===document.activeElement));
   await target.press('Enter');
  }else{
   const from=await first.boundingBox(),to=await receiver.boundingBox();
   assert(from&&to);
   await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
   await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});
   const ghost=page.locator('.playroom-drag-ghost.sdk-anchored-piece');
   await ghost.waitFor();release=await ghost.boundingBox();assert(release);
   await page.mouse.up();
  }
  await page.waitForFunction(()=>handoffFlights.length===1);
  const flight=(await page.evaluate(()=>handoffFlights))[0];
  assert.equal(flight.objects,1);
  if(release){
   const [,x,y]=flight.frames[0].match(/translate3d\(([-.\d]+)px,([-.\d]+)px/);
   assert(Math.hypot(Number(x)-release.x-release.width/2,Number(y)-release.y-release.height/2)<2);
  }
  assert.deepEqual(await page.evaluate(()=>receiverFlights),[1],'the moving receiver has no duplicate of the arriving cargo');
  assert.deepEqual(await page.evaluate(()=>receiverCopies),[false],'the separate cargo subtree is never copied with the receiver');
  assert.match(flight.frames.at(-1),/rotate\((?:-?180)deg\)/);
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  await receiver.locator('[data-entity=token-0]').waitFor();
  assert(await page.evaluate(()=>originalCargo===document.querySelector('[data-entity=token-0]')));
  assert.deepEqual(await page.evaluate(()=>{
   const d=PlayroomAppBridge.saveLibrary.current().session.current.data;
   return [d.transferred,d.loaded,d.points[0]+d.points[1]];
  }),[true,1,1]);
  if(gesture==='tap'){
   await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();
   const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');await slider.press('ArrowRight');
   await cargo.waitFor();await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
   await slider.press('ArrowRight');
   await page.waitForFunction(()=>handoffFlights.length===2);
   const replay=(await page.evaluate(()=>handoffFlights))[1];
   const displacement=({frames})=>{
    const xy=frame=>frame.match(/translate3d\(([-.\d]+)px,([-.\d]+)px/).slice(1).map(Number);
    const [x,y]=xy(frames[0]),[toX,toY]=xy(frames[1]);return [toX-x,toY-y];
   };
   assert(displacement(replay).every((delta,index)=>Math.abs(delta-displacement(flight)[index])<1),'history changes the viewport origin, preserving the flight');
   assert.deepEqual(replay.frames.map(frame=>frame.slice(frame.indexOf(' rotate'))),flight.frames.map(frame=>frame.slice(frame.indexOf(' rotate'))));
   assert.equal(replay.objects,1);
   assert.deepEqual(await page.evaluate(()=>receiverFlights),[1,1]);
   await receiver.locator('[data-entity=token-0]').waitFor();
  }
  assert.deepEqual(errors,[]);
 });
});

test('network carrier handoff uses viewer geometry and replays on the public Table',{timeout:45000},async t=>{
 const artifact=process.env.PLAYROOM_SDK_ANCHORED_CARGO_PACK;
 if(!artifact){t.skip('Use the compiled anchored-cargo SDK example');return;}
 const [player,table]=await Promise.all([pageFor(t,{viewport:{width:390,height:844},hasTouch:true}),pageFor(t,{viewport:{width:845,height:620},hasTouch:true})]);
 const errors=[];
 await Promise.all([player,table].map(async page=>{
  page.on('pageerror',error=>errors.push(error.message));
  await installSDKExample(page,artifact,'anchored-cargo');
  await page.evaluate(()=>{
   window.cargoTrace=[];
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(this.matches('.playroom-motion-flight')&&this.querySelector('.sdk-anchored-piece')){
     const position=frame=>{
      const values=frame.transform.match(/^translate3d\(([-.\d]+)px,([-.\d]+)px,/);
      return values&&{x:Number(values[1]),y:Number(values[2])};
     };
     cargoTrace.push({kind:this.dataset.motionKind,parts:this.querySelectorAll('.sdk-anchored-piece').length,
      from:position(frames[0]),to:position(frames.at(-1)),phase:document.timeline.currentTime});
    }
    return animate.call(this,frames,options);
   };
   window.mountCargo=async transport=>{
    const client=new PlayroomSessionClient(transport);
    await client.refresh();
    const view=PlayroomSharedViews.mount(client,PlayroomPacks.exportView('anchored-cargo'));
    view.render();window.cargoClient=client;window.cargoView=view;
   };
  });
 }));
 const offer=await table.evaluate(async()=>{
  const session=new TabletopSession(TabletopCore,'anchored-cargo',{seed:1,preset:'handoff',firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'One'},{name:'Two'}]});
  const authority=new SessionAuthority(session,{sessionId:'sdk-cargo-handoff'}),wire=PlayroomWebRTCTransport;
  const host=await wire.createHostPeer(),port=authority.connect(0);
  window.stopCargo=wire.serve(host.channel,{...port,dispatch:packet=>{window.cargoPacket=packet;return port.dispatch(packet);}},{peer:host});
  window.cargoHost=host;window.cargoAuthority=authority;
  const tableHost=await wire.createHostPeer();
  window.stopCargoTable=wire.serve(tableHost.channel,authority.connectTable([]),{peer:tableHost});
  const tablePeer=await wire.createClientPeer(tableHost.offer);
  await tableHost.acceptAnswer(tablePeer.answer);
  await mountCargo(await tablePeer.transport());
  return host.offer;
 });
 try{
  const answer=await player.evaluate(async offer=>{window.cargoPeer=await PlayroomWebRTCTransport.createClientPeer(offer);return cargoPeer.answer;},offer);
  await Promise.all([table.evaluate(answer=>cargoHost.acceptAnswer(answer),answer),player.evaluate(async()=>mountCargo(await cargoPeer.transport()))]);
  const source=page=>page.locator('[data-entity=tile-carrier] .sdk-anchored-slot').first();
  const destination=page=>page.locator('[data-entity=tile-receiver] .sdk-anchored-slot');
  const settled=page=>page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  await source(player).locator('button').tap();
  const token=page=>source(page).locator('[data-entity=token-0]');
  await Promise.all([player,table].map(async page=>{await token(page).waitFor();await settled(page);}));
  const box=await token(table).boundingBox();assert(box);
  const tableOrigin={x:box.x+box.width/2,y:box.y+box.height/2};
  assert.deepEqual(await table.evaluate(()=>[cargoClient.snapshot.role,cargoClient.snapshot.viewer]),['table',-1]);
  assert.equal(await table.locator('.sdk-anchored-board button:enabled').count(),0);
  await player.evaluate(()=>window.addEventListener('pointerup',()=>{
   const ghost=document.querySelector('.playroom-drag-ghost');
   if(ghost){const box=ghost.getBoundingClientRect();window.cargoRelease={x:box.x+box.width/2,y:box.y+box.height/2};}
  },{capture:true,once:true}));
  await dragInventoryItem(player,source(player).locator('button'),destination(player).locator('button'));
  const waitForFlights=async page=>{
   try{await page.waitForFunction(()=>cargoTrace.length>=2&&cargoClient.snapshot.revision===2,null,{timeout:8000});}
   catch(error){
    const state=await page.evaluate(()=>({revision:cargoClient.snapshot.revision,trace:cargoTrace,release:window.cargoRelease,packet:window.cargoPacket?.action,transferred:cargoClient.snapshot.state.scene.objects?.find(object=>object.ref?.id==='0')?.zone}));
    throw Error(JSON.stringify(state),{cause:error});
   }
  };
  await Promise.all([player,table].map(waitForFlights));
  const {placement,release}=await player.evaluate(()=>({placement:cargoTrace.find(flight=>flight.kind==='placement'),release:window.cargoRelease}));
  assert(release&&closeInventoryPoint(placement.from,release));
  const live=await table.evaluate(()=>cargoTrace);
  assert.deepEqual(live.map(flight=>[flight.kind,flight.parts]).sort(),[['move',1],['placement',1]]);
  assert.equal(live[0].phase,live[1].phase,'both flights start in the same presentation phase');
  assert(closeInventoryPoint(live.find(flight=>flight.kind==='placement').from,tableOrigin));
  assert.doesNotMatch(JSON.stringify(await table.evaluate(()=>cargoPacket)),/playedFrom|playedEntity|playedTarget/);
  await Promise.all([player,table].map(async page=>{await settled(page);await destination(page).locator('[data-entity=token-0]').waitFor();}));
  await table.evaluate(()=>cargoView.openHistory(1));
  await token(table).waitFor();
  await table.locator('[data-command=replay-play]').click();
  await table.waitForFunction(()=>cargoTrace.length>=4,null,{timeout:8000});
  await settled(table);
  assert.deepEqual((await table.evaluate(()=>cargoTrace)).slice(2).map(flight=>[flight.kind,flight.parts]).sort(),[['move',1],['placement',1]]);
  assert.equal(await table.locator('.sdk-anchored-board button:enabled').count(),0);
  assert.deepEqual(errors,[]);
 }finally{
  await player.evaluate(()=>{window.cargoView?.destroy();window.cargoClient?.close();window.cargoPeer?.close?.();});
  await table.evaluate(()=>{cargoView.destroy();cargoClient.close();stopCargoTable();stopCargo();cargoAuthority.dispose();});
 }
});

test('ordinary sealed signal reveals private choices only at readiness or deadline',{timeout:60000},async t=>{
 const path=process.env.PLAYROOM_SDK_SEALED_SIGNAL_PACK;
 if(!path){t.skip('Use the compiled sealed-signal SDK example');return;}
 for(const mode of ['ready','timeout','gated-timeout'])await t.test(mode,async t=>{
  const reason=mode==='ready'?'ready':'timeout',gated=mode==='gated-timeout';
  const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.locator('[data-hub-page=profile]').tap();
  await page.locator('#hub-profile-page [data-command=packs]').tap();
  const modal=page.locator('#modal-root>[data-surface-state=active]');
  await modal.locator('#pack-file').setInputFiles(path);
  await modal.locator('[data-pack-install]').tap();
  await modal.locator('[data-installed-pack][data-pack-id=sealed-signal]').waitFor();
  await modal.locator('.modal-head [data-command=close-modal]').tap();
  await page.locator('[data-hub-page=games]').tap();
  await page.locator('[data-start=sealed-signal]').tap();
  await page.locator('[data-game-mode=hotseat]').tap();
  await page.evaluate(()=>{
   const bridge=PlayroomAppBridge,room=bridge.room();
   bridge.roomService.setLocalSeat(room.id,room.ownerId,room.seats[1].id,{kind:'human',nickname:'Игрок 2'});
   bridge.renderLobby();
  });
  await page.clock.install();
  await page.locator('[data-command=lobby-start]').tap();
  const prompt=page.locator('.sdk-prompt:visible'),unlock=page.locator('.handoff [data-command=unlock]:visible');
  const command=choice=>page.getByRole('button',{name:choice,exact:true});
  await unlock.waitFor({timeout:5000});
  if(!gated)await unlock.tap();
  await prompt.waitFor();
  assert.match(await prompt.innerText(),/готовы 0 из 2/);
  assert.equal(await page.locator('.sdk-die:visible').count(),1);
  assert.match(await page.locator('[data-sdk-clock-status]').innerText(),/\d/);
  const actor=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.turn);
  if(!gated){
   await command('Взять').tap({timeout:5000});
   await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);
   const views=await page.evaluate(actor=>{
    const state=PlayroomAppBridge.saveLibrary.current().session.current;
    const read=({modelProjection:p})=>({selected:p.data.selected,reveal:p.data.reveal,ready:p.decisionWindow.ready,actions:p.actions});
    return [read(TabletopCore.project(state,actor)),read(TabletopCore.project(state,1-actor)),read(TabletopCore.projectTable(state,1-actor))];
   },actor);
   assert.deepEqual(views[0],{selected:'claim',reveal:null,ready:[actor],actions:[]});
   assert.deepEqual(views[1],{selected:null,reveal:null,ready:[actor],actions:[{type:'choose',choice:'hold'},{type:'choose',choice:'claim'}]});
   assert.deepEqual(views[2],{selected:null,reveal:null,ready:[actor],actions:[]});
   await page.locator('.player-panel.is-ready[data-player-index="'+actor+'"]').first().waitFor();
  }
  if(reason==='ready'){
   const choose=page.locator('[data-decision-player="'+(1-actor)+'"]:visible');
   await choose.first().tap();
   await unlock.tap();
   await command('Уступить').waitFor();
   assert.match(await prompt.innerText(),/готовы 1 из 2/);
   await command('Уступить').tap();
  }else await page.clock.fastForward(21000);
  await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.status==='finished');
  const outcome=()=>page.evaluate(()=>{
   const s=PlayroomAppBridge.saveLibrary.current().session.current;
   return {revision:s.move,die:s.data.die,reveal:s.data.reveal,events:s.events.filter(event=>event.type==='signal.revealed').length};
  });
  const result=await outcome();
  const choices=[null,null],scores=[0,0];
  if(!gated){choices[actor]='claim';scores[actor]=result.die;}
  if(reason==='ready'){choices[1-actor]='hold';scores[1-actor]=1;}
  assert.deepEqual(result,{revision:gated?1:2,die:result.die,reveal:{choices,scores,reason},events:1});
  await page.clock.fastForward(21000);
  assert.deepEqual(await outcome(),result,'a timer cannot reveal or score the same decisions twice');
  await modal.locator('[data-command=result-replay]').tap({timeout:5000});
  const slider=page.locator('#replay-range');await slider.focus();
  await slider.press('Home');
  await page.getByText(/готовы 0 из 2/).first().waitFor();
  assert.equal(await command('Взять').count(),0);
  await slider.press('End');
  await page.getByText(/^Раскрытие:/).first().waitFor();
  assert.deepEqual(await outcome(),result);
  assert.deepEqual(errors,[]);
 });
});

test('ordinary compound routes mount the intermediate board before the final board in play and history',{timeout:60000},async t=>{
 for(const mode of ['Local','Network'])await t.test(mode,async t=>{
  const page=await pageFor(t);
  await page.evaluate(()=>{
   const create=TabletopCore.createGame;
   TabletopCore.createGame=(id,options)=>{
    const state=create(id,{...options,seed:17,preset:'plus',firstPlayerMode:'assigned',firstPlayer:0});
    if(id==='snakes'){
     state.turn=0;
     Object.assign(state.data,{phase:'move',positions:[22,25],dice:[3,4]});
     if(!TabletopCore.validateState(state))throw Error('Invalid compound route fixture');
    }
    return state;
   };
   PlayroomFirstTurnGuide.setEnabled('snakes',false);
   window.numberedFields=[];
  window.numberedFieldRecipes=0;
  const renderField=PlayroomViews.renderField;
  PlayroomViews.renderField=function(...args){numberedFieldRecipes++;return renderField.apply(this,args);};
   const renderer=PlayroomSDKSceneRenderer.prototype,paint=renderer.renderNumberedRoute;
   renderer.renderNumberedRoute=function(scene){
    paint.call(this,scene);
    numberedFields.push(scene.positions.map(({id,cell,point})=>{
     const pawn=this.surface.querySelector(`[data-entity="${id}"]`);
     return pawn&&parseFloat(pawn.style.left)===point.x&&parseFloat(pawn.style.top)===point.y?cell:null;
    }));
   };
  });
  if(mode==='Local')await startLocalNumberedRoute(page);
  else{
   await page.evaluate(async()=>{
    const session=new TabletopSession(TabletopCore,'snakes',{preset:'plus',players:[{name:'One'},{name:'Two'}]});
    window.routeAuthority=new SessionAuthority(session,{sessionId:'sdk-compound-route'});
    const transport=PlayroomWebRTCTransport,host=await transport.createHostPeer();
    transport.serve(host.channel,routeAuthority.connect(0),{peer:host});
    const guest=await transport.createClientPeer(host.offer);
    await host.acceptAnswer(guest.answer);
    window.routeClient=new PlayroomSessionClient(await guest.transport());
    await routeClient.refresh();
    window.routeView=PlayroomSharedViews.mount(routeClient,PlayroomPacks.exportView('snakes'));
    routeView.render();
   });
  }
  const scene=page.locator('.table-shell>.scene'),flight=page.locator('.playroom-motion-flight[data-motion-kind=route]');
  const assertBoardOrder=async mode=>{
   const fields=await page.evaluate(()=>window.numberedFields.map(positions=>positions.join(',')));
   const intermediate=fields.indexOf('25,22'),final=fields.indexOf('29,22');
   assert.ok(intermediate>=0&&final>intermediate,`${mode} mounts the intermediate board before the final board: ${fields.join(' → ')}`);
  };
  await page.locator('.layout-actions .sdk-die').first().click();
  await flight.first().waitFor();
  await scene.and(page.locator('[aria-busy=false]')).waitFor();
  await assertBoardOrder('Live play');
  await page.locator('[data-game-menu]').click();
  await page.locator('[data-command=history]:visible').click();
  const slider=page.locator('#replay-range');await slider.waitFor();
  if(mode==='Local'){
   await slider.focus();await slider.press('Home');
   await page.waitForFunction(()=>window.numberedFields.at(-1)?.join(',')==='22,25');
  }else{
   await page.waitForFunction(()=>!document.querySelector('.history-panel[aria-busy=true]'));
   assert.equal(await slider.inputValue(),'1','network autoplay starts on the final position');
  }
  await page.evaluate(()=>{window.numberedFields=[];});
  const play=page.locator('[data-command=replay-play]');
  await play.click();
  await flight.first().waitFor();
  await page.waitForFunction(()=>document.querySelector('.playroom-motion-flight[data-motion-kind=route]')?.getAnimations()[0]?.currentTime>=80);
  await play.click();
  const held=await flight.first().evaluate(el=>{
   window.pausedRoute=el;
   const animation=el.getAnimations()[0];return {time:animation.currentTime,state:animation.playState};
  });
  assert.equal(held.state,'paused');assert(held.time>=80);
  const still=await page.evaluate(async()=>{
   await new Promise(resolve=>setTimeout(resolve,140));
   return {mounted:pausedRoute.isConnected,time:pausedRoute.getAnimations()[0]?.currentTime};
  });
  assert.deepEqual(still,{mounted:true,time:held.time},mode+' holds the same flight at the paused time');
  await play.click();
  await page.waitForFunction(()=>!document.querySelector('.playroom-motion-flight')&&window.numberedFields.some(pawns=>pawns[0]===29));
  await assertBoardOrder('History');
  assert.equal(await page.evaluate(()=>window.numberedFieldRecipes),0,'native board checkpoints do not build detached HTML field recipes');
  if(mode==='Network')await page.evaluate(()=>{routeView.destroy();routeClient.close();routeAuthority.dispose();});
 });
});

test('landscape prioritizes one readable roster column and aligns compact hands to its right',{timeout:90000},async t=>{
 for(const sample of [{game:'snakes',count:6,width:844,height:390,columns:1},{game:'uno',count:6,width:1280,height:900,columns:1},{game:'uno',count:6,width:844,height:390,columns:1},{game:'uno',count:6,width:844,height:320,columns:2}]){
  const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:sample.width,height:sample.height});
  await page.evaluate(({game,count})=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:count},(_,i)=>({name:'Player '+i}))});PlayroomFirstTurnGuide.setEnabled(game,false);},sample);
  await page.locator('[data-start='+sample.game+']').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('[data-sdk-player-scene]').waitFor();
  const read=()=>page.evaluate(()=>{const stage=document.querySelector('.app-game-layout'),roster=stage.querySelector('.layout-participants'),field=stage.querySelector('.layout-field'),rect=e=>e?.getBoundingClientRect().toJSON();return {columns:Number(stage.dataset.landscapeRosterColumns),inline:stage.dataset.inlineOpponentHands,field:rect(field),roster:rect(roster),cards:[...roster.querySelectorAll('.player-panel')].map(e=>({box:rect(e),avatar:rect(e.querySelector('.player-avatar-wrap')),hand:rect(e.querySelector('.mini-hand')),count:e.querySelectorAll('.mini-hand .sdk-piece-card').length})),scroll:roster.scrollHeight-roster.clientHeight};});
  const measured=await read();assert.equal(measured.columns,sample.columns,JSON.stringify({sample,measured}));assert.equal(measured.cards.length,sample.count-1);
  if(sample.columns===1){assert(measured.scroll<=2,'one column fits without hiding an opponent '+JSON.stringify(measured));assert(measured.cards.every((c,i)=>!i||c.box.top>=measured.cards[i-1].box.bottom),'opponents form a vertical list');}
  if(sample.game==='snakes')assert(measured.field.width>300,'the field receives the freed second roster column');
  else{assert.equal(measured.inline,'true');for(const card of measured.cards){assert(card.hand&&card.hand.left>card.avatar.right&&card.hand.top<card.avatar.bottom,'hand shares the identity row '+JSON.stringify(card));assert(card.hand.right<=card.box.right+1&&card.count===7,'the complete closed hand stays inside its card');assert(card.box.height<=56,'compact cards keep their physical identity height');}}
  const state=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await page.setViewportSize({width:390,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('.app-game-layout').getAttribute('data-inline-opponent-hands'),'false');await page.setViewportSize({width:sample.width,height:sample.height});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal((await read()).columns,sample.columns);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),state,'rotation does not change the game');if(process.env.PLAYROOM_ROSTER_EVIDENCE){fs.mkdirSync(process.env.PLAYROOM_ROSTER_EVIDENCE,{recursive:true});await page.screenshot({path:path.join(process.env.PLAYROOM_ROSTER_EVIDENCE,sample.game+'-'+sample.width+'x'+sample.height+'.png'),animations:'disabled'});}await page.context().close();
 }
});

test('system panels and the scene outline follow the actual side zones across rotation',{timeout:90000},async t=>{
 for(const game of ['ludo','uno','snakes']){
  const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(game=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:Array.from({length:{ludo:4,uno:2,snakes:6}[game]},(_,i)=>({name:'Player '+i}))});PlayroomFirstTurnGuide.setEnabled(game,false);},game);
  await page.locator('[data-start='+game+']').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('[data-sdk-player-scene]').waitFor();
  for(const viewport of [{width:844,height:390},{width:1280,height:900},{width:1024,height:768},{width:768,height:1024},{width:844,height:320},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const metrics=await page.evaluate(()=>{
    const scene=document.querySelector('.table-shell>.scene'),stage=scene.querySelector('.app-game-layout'),heading=document.querySelector('.game-frame-heading').getBoundingClientRect(),tools=document.querySelector('.game-frame-tools').getBoundingClientRect(),field=stage.querySelector('.layout-field').getBoundingClientRect(),bounds=scene.getBoundingClientRect(),mid=bounds.x+bounds.width/2,anchored=stage.dataset.seatAnchors==='true'&&stage.dataset.hasHand==='false';
    const boxes=[...stage.querySelectorAll(anchored?'.seat-group':':scope>.layout-participants,:scope>.layout-self')].map(e=>e.getBoundingClientRect()).filter(b=>b.width&&b.height),sides=['left','right'].map(side=>boxes.filter(b=>side==='left'?b.right<=mid+1:b.left>=mid-1));
    const zone=rows=>rows.length?{left:Math.min(...rows.map(b=>b.left)),right:Math.max(...rows.map(b=>b.right))}:null,path=scene.querySelector('[data-game-zone-outline]>path');
    return {heading:heading.toJSON(),tools:tools.toJSON(),field:field.toJSON(),left:zone(sides[0]),right:zone(sides[1]),clip:scene.style.clipPath,path:path?.getAttribute('d'),outlineShown:!!path&&getComputedStyle(path.parentElement).display!=='none',scene:bounds.toJSON(),outline:path?.parentElement.getBoundingClientRect().toJSON()};
   });
   if(viewport.width>viewport.height){
    assert(metrics.left&&metrics.right,game+' has two physical side zones');
    for(const [panel,zone]of [[metrics.heading,metrics.left],[metrics.tools,metrics.right]]){assert(Math.abs(panel.left-zone.left)<1&&Math.abs(panel.right-zone.right)<1,game+' system panel matches its side zone '+JSON.stringify(metrics));}
    assert(metrics.heading.right<=metrics.field.left+1&&metrics.tools.left>=metrics.field.right-1,game+' system panels cannot cover the field');
    assert(metrics.outlineShown&&metrics.clip.replace(/[\s,]/g,'').includes(metrics.path.replace(/[\s,]/g,'')),game+' outline and backdrop use the same measured contour '+JSON.stringify(metrics));assert(Math.abs(metrics.outline.width-metrics.scene.width)<1&&Math.abs(metrics.outline.height-metrics.scene.height)<1);
   }else assert.equal(metrics.outlineShown,false,'portrait keeps its ordinary scene boundary');
   if(game==='snakes'&&viewport.width===1024){
    const title=await page.locator('.game-frame-title h1').evaluate(node=>{
     const box=node.getBoundingClientRect(),heading=node.closest('.game-frame-heading').getBoundingClientRect(),status=document.querySelector('.game-frame-status').getBoundingClientRect();
     return {full:node.scrollHeight<=node.clientHeight+1,inside:box.top>=heading.top&&box.bottom<=status.top&&status.bottom<=heading.bottom,lines:node.clientHeight/parseFloat(getComputedStyle(node).lineHeight)};
    });
    assert.deepEqual(title,{full:true,inside:true,lines:2},'the long title fits in the one-column tablet header');
   }
  }
  await page.context().close();
 }
});

test('shared ink preserves coalesced samples, square coordinates and overlay geometry',{timeout:60000},async t=>{
 const page=await pageFor(t);
 await page.evaluate(()=>{
  document.body.innerHTML='<main class="sdk-scene" data-sdk-canvas-scene style="width:520px;height:620px"></main>';
  window.inkErrors=[];window.inkCommitted=[];window.inkAck=new Promise(resolve=>window.releaseInk=resolve);
  window.inkCase=new PlayroomInkCanvas(document.querySelector('main'),{commit:async command=>{inkCommitted.push(command);await inkAck;return true;},error:error=>inkErrors.push(error.message)});
  inkCase.update({id:'coalesced',operations:[],enabled:true,command:{type:'draw',roundId:1}});
 });
 const paper=page.locator('.sdk-ink-base'),rect=await paper.boundingBox();
 assert(Math.abs(rect.width-rect.height)<1,'paper is square in CSS pixels');
 assert.deepEqual(await paper.evaluate(e=>[e.width,e.height]),[1024,1024],'same logical paper on every device');
 assert.deepEqual(await page.locator('.sdk-ink-paper-overlay').boundingBox(),rect,'feedback aligns with the fitted paper');
 const geometry=()=>paper.boundingBox(),before=await geometry();
 for(const menu of ['width','color','zoom']){
  await page.locator('[data-ink-options='+menu+']').click();assert.deepEqual(await geometry(),before,'opening '+menu+' cannot reflow the paper');
  if(menu==='width'){
   assert.equal(await page.locator('[data-ink-options=width]').innerText(),'');
   assert(await page.locator('.sdk-width').evaluateAll(nodes=>nodes.every(e=>e.offsetWidth===e.offsetHeight&&getComputedStyle(e).borderRadius==='50%')));
  }
  await page.keyboard.press('Escape');assert.deepEqual(await geometry(),before);
 }
 await page.mouse.move(rect.x+rect.width*.5,rect.y+rect.height*.5);await page.mouse.down();
 const expected=await page.evaluate(()=>{
  const r=inkCase.base.getBoundingClientRect(),samples=Array.from({length:601},(_,i)=>{const angle=i/600*Math.PI*8,radius=.02+.4*i/600;return {clientX:r.left+r.width*(.5+Math.cos(angle)*radius),clientY:r.top+r.height*(.5+Math.sin(angle)*radius)};});
  const event=new PointerEvent('pointermove',{pointerId:1,clientX:samples.at(-1).clientX,clientY:samples.at(-1).clientY,bubbles:true});
  Object.defineProperty(event,'getCoalescedEvents',{value:()=>samples});inkCase.viewport.dispatchEvent(event);
  return samples.map(p=>inkCase.point(p));
 });
 const end={x:rect.x+rect.width*.96,y:rect.y+rect.height*.92};await page.mouse.move(end.x,end.y);await page.mouse.up();
 const pending=await page.evaluate(()=>{
  const original=Date.now;Date.now=()=>original()+10000;try{inkCase.paintOverlay();return inkCase.previews.size;}finally{Date.now=original;}
 });assert(pending>=5,'unacknowledged local chunks survive remote-preview expiry');
 await page.evaluate(()=>releaseInk());await page.evaluate(()=>inkCase.commitQueue);
 const operations=await page.evaluate(()=>inkCommitted.map(c=>c.operation));
 assert(operations.length>=5);assert(operations.every(op=>op.points.length<=128));
 for(let i=1;i<operations.length;i++)assert.deepEqual(operations[i-1].points.at(-1),operations[i].points[0]);
 const points=operations.flatMap((op,i)=>i?op.points.slice(1):op.points);assert.deepEqual(points.slice(1,602),expected,'all coalesced spiral points cross the durable boundary in order');
 assert.deepEqual(points.at(-1),[Math.round(.96*65535),Math.round(.92*65535)]);
 await page.setViewportSize({width:390,height:844});assert.deepEqual(await paper.evaluate(e=>[e.width,e.height]),[1024,1024]);
 assert.deepEqual(await page.evaluate(()=>inkErrors),[]);await page.evaluate(()=>inkCase.destroy());
});


test('vote keeps both choices visible and marks the recorded answer',{timeout:60000},async t=>{
 const page=await pageFor(t);
 await page.evaluate(()=>{
  document.body.innerHTML='<main class="sdk-scene"></main>';
  window.voteCommands=[];window.voteCase=new PlayroomSDKSceneRenderer(document.querySelector('main'),{command:async c=>voteCommands.push(c)});
  window.voteFrame={now:1000,projection:{game:'vote-probe',viewer:0,turn:0,revision:0,playerCount:2,actions:[{type:'no'}],inputs:[]},scene:{contractVersion:1,id:'vote',family:'board',players:[0,1].map(player=>({player,metrics:[]})),vote:{id:'vote-1',title:'Finish?',startedAt:0,deadline:30000,eligible:[0,1],voted:[0],against:[],required:2,accepted:false,againstCommand:{type:'no'}}},history:{reviewing:false}};
  voteCase.update(voteFrame);
 });
 await page.locator('.ui-notice-summary').click();
 const choices=page.locator('.ui-notice-action');assert.equal(await choices.count(),2);
 assert(await choices.nth(0).isVisible());assert.equal(await choices.nth(0).getAttribute('aria-pressed'),'true');assert(await choices.nth(0).isDisabled());
 assert.equal(await choices.nth(1).getAttribute('aria-pressed'),'false');await choices.nth(1).click();assert.deepEqual(await page.evaluate(()=>voteCommands),[{type:'no'}]);
 await page.evaluate(()=>{voteFrame.scene.vote={...voteFrame.scene.vote,voted:[],against:[0],command:{type:'yes'},againstCommand:undefined};voteCase.update(voteFrame);});
 assert.equal(await choices.count(),2);assert.equal(await choices.nth(1).getAttribute('aria-pressed'),'true');assert(await choices.nth(1).isVisible());await page.evaluate(()=>{voteFrame.ui={hotseat:true};voteFrame.scene.menuActions=[{kind:'vote',label:'Finish vote',command:{type:'vote'}}];voteCase.update(voteFrame);});assert.equal(await page.locator('.ui-notice').count(),0,'hotseat has no vote notice');assert(await page.evaluate(()=>voteCase.gameMenu.hidden),'hotseat has no vote menu entry');await page.evaluate(()=>voteCase.destroy());
});


test('player tutorial opt-out cannot fall back to guest hints or add a second highlight style',{timeout:60000},async t=>{
 const page=await pageFor(t);const result=await page.evaluate(()=>{
  document.body.innerHTML='<main data-sdk-player-scene></main>';
  const renderer=new PlayroomSDKSceneRenderer(document.querySelector('main'),{command:async()=>true});
  const command={type:'place',cell:0},guide={steps:[{id:'place',text:'Place',available:true,commands:[command]}]};
  const frame={now:0,projection:{game:'guide-probe',viewer:0,turn:0,revision:0,playerCount:1,actions:[command],inputs:[]},scene:{contractVersion:1,id:'guide',family:'board',players:[{player:0,metrics:[]}],cells:[{id:'cell0',mark:null,command}],support:{tutorial:guide}},support:{tutorial:null},history:{reviewing:false}};
  renderer.update(frame);const muted=renderer.root.querySelectorAll('.sdk-guided-target').length;
  renderer.update({...frame,support:{tutorial:guide}});const target=renderer.root.querySelector('.sdk-guided-target'),explicit=!!target,outline=target&&getComputedStyle(target).outlineStyle;
  renderer.update(frame);const cleared=renderer.root.querySelectorAll('.sdk-guided-target').length;renderer.destroy();return {muted,explicit,outline,cleared};
 });assert.deepEqual(result,{muted:0,explicit:true,outline:'none',cleared:0});
});


test('local free seats offer claim, bot and device player',async t=>{
 const page=await pageFor(t);await page.locator('[data-start=snakes]').first().click();await page.locator('[data-game-mode=hotseat]').click();
 await page.locator('[data-room-cycle=seat-6]').click();
 assert.deepEqual(await page.locator('.seat-choice-modal [data-seat-choice]').evaluateAll(nodes=>nodes.map(n=>n.dataset.seatChoice)),['claim','bot','human']);
});

test('Klondike stock lesson points to the deck after the move lessons are mastered',async t=>{
 const page=await pageFor(t,{offline:true});
 await page.evaluate(()=>{
  const prefs=new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id);
  prefs.setSkipped('klondike',false);prefs.learn('klondike',{card:1,target:1});
 });
 await page.locator('[data-start=klondike]').first().click();await page.locator('[data-game-mode]').first().click();
 await page.locator('[data-command=lobby-start]').click();
 const guide=page.locator('.first-turn-guide:not([hidden])');
 await guide.getByText('Откройте карты из колоды.').waitFor({timeout:8000});
 const stock=page.locator('.solitaire-stock[data-sdk-guide-step~="stock"]').first();
 assert(await stock.isVisible());
 const onDeck=await stock.evaluate(el=>{
  const cursor=document.querySelector('.first-turn-guide').getBoundingClientRect(),box=el.getBoundingClientRect();
  return cursor.left>=box.left&&cursor.left<=box.right&&cursor.top>=box.top&&cursor.top<=box.bottom;
 });
 assert(onDeck,'the glove points at the draw control');
 assert.equal(await page.locator('.solitaire-column [data-sdk-guide-step~="stock"]').count(),0);
 await stock.click();await page.waitForFunction(()=>PlayroomFirstTurnGuide.settings('klondike').mastered.stock===1);
});

test('Klondike guide follows a tapped card and the actual flip policy',{timeout:45000},async t=>{
 for(const mode of ['auto','manual'])await t.test(mode,async t=>{
  const page=await pageFor(t,{offline:true,hasTouch:true,viewport:{width:390,height:844}});
  await page.evaluate(mode=>{
   const prefs=new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id);
   prefs.setSkipped('klondike',false);
   if(mode==='manual')prefs.learn('klondike',{stock:1});
   const create=TabletopCore.createGame;
   TabletopCore.createGame=(id,options)=>{
    if(id!=='klondike')return create(id,options);
    const state=create(id,{...options,seed:17,autoFlip:mode});
    const move=TabletopCore.availableCommands(state,0).find(command=>command.type==='move'&&command.source==='tableau'&&state.data.tableau[command.from].at(-2)?.open===false);
    if(!move)throw Error('No initial move exposes a closed Klondike card');
    window.guideMove=move;
    return state;
   };
  },mode);
  await page.locator('[data-start=klondike]').first().tap();
  await page.locator('[data-game-mode]').first().tap();
  await page.locator('[data-command=lobby-start]').tap();
  const guide=page.locator('.first-turn-guide:not([hidden])');
  await guide.getByText('Выберите карту или последовательность.').waitFor();
  if(mode==='auto'){
   await page.mouse.move(2,2);
   await page.mouse.down();
   await guide.waitFor({state:'hidden'});
   const scans=await page.evaluate(async()=>{
    const query=Element.prototype.querySelectorAll,app=document.getElementById('app');
    let scans=0;
    Element.prototype.querySelectorAll=function(selector){
     if(this===app&&selector.includes('data-sdk-guide-step'))scans++;
     return query.call(this,selector);
    };
    try{
     // A live field can change while the player is holding a pointer.
     app.classList.add('test-field-update');
     await new Promise(requestAnimationFrame);
     await new Promise(requestAnimationFrame);
     return scans;
    }finally{
     app.classList.remove('test-field-update');
     Element.prototype.querySelectorAll=query;
    }
   });
   await page.mouse.up();
   assert.equal(scans,0,'ordinary lessons skip target searches while the pointer is held');
   await guide.getByText('Выберите карту или последовательность.').waitFor();
  }
  await page.evaluate(()=>{
   window.lessonTransfers=[];
   const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(this.matches('.first-turn-guide .guide-glove'))lessonTransfers.push({frames,duration:options.duration});
    return animate.call(this,frames,options);
   };
  });
  if(mode==='manual')await page.emulateMedia({reducedMotion:'reduce'});
  const {card,from}=await page.evaluate(()=>window.guideMove);
  const source=page.locator(`.solitaire-column [data-entity="card-${card}"][data-sdk-guide-step~="card"]`);
  await source.tap();
  await guide.getByText('Выберите место для переноса карты.').waitFor({timeout:5000});
  const destination=page.locator('.solitaire-board [data-sdk-guide-step~="target"]:visible');
  const target=await destination.evaluateAll((nodes,card)=>{
   const dot=document.querySelector('.first-turn-guide').getBoundingClientRect();
   return nodes.findIndex(node=>{
    const rect=node.getBoundingClientRect();
    return node._command?.card===card&&Math.abs(dot.x-rect.x-rect.width/2)<2&&Math.abs(dot.y-rect.y-rect.height/2)<2;
   });
  },card);
  assert(target>=0,'the glove points to a destination for the selected card');
  const transfers=await page.evaluate(()=>lessonTransfers);
  assert.equal(transfers.length,mode==='auto'?1:0,'the hand follows the next target only when motion is enabled');
  if(mode==='auto')assert.deepEqual(transfers[0].frames.at(-1),{translate:'0px 0px'});
  await page.locator('[data-game-menu]').tap();
  await guide.waitFor({state:'hidden'});
  await page.setViewportSize({width:844,height:390});
  await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});
  await guide.getByText('Выберите место для переноса карты.').waitFor({timeout:5000});
  assert.equal(await page.evaluate(()=>lessonTransfers.length),transfers.length,'the hand does not fly across a menu or a viewport change');
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0,'selection is presentation-only');
  await destination.nth(target).tap();
  await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);
  await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  const opened=await page.evaluate(from=>PlayroomAppBridge.saveLibrary.current().session.current.data.tableau[from].at(-1).open,from);
  assert.equal(opened,mode==='auto');
  if(mode==='auto'){
   await guide.getByText('Откройте карты из колоды.').waitFor({timeout:6000});
   assert.equal(await page.locator('[data-sdk-guide-step~="flip"]').count(),0);
   assert.equal(await page.evaluate(()=>PlayroomFirstTurnGuide.settings('klondike').mastered.flip),undefined);
  }else{
   await guide.getByText('Переверните освободившуюся закрытую карту.').waitFor({timeout:6000});
   const flip=page.locator(`.solitaire-column[data-column="${from}"] [data-sdk-guide-step~="flip"]`);
   await flip.tap();
   await page.waitForFunction(()=>PlayroomFirstTurnGuide.settings('klondike').mastered.flip===1);
  }
 });
});

test('Klondike hint lesson points to the local toolbar button',async t=>{
 const page=await pageFor(t,{hasTouch:true,viewport:{width:390,height:844}});
 await page.evaluate(()=>{
  const prefs=new PlayroomGuidePreferences(()=>localStorage,()=>PlayroomAppBridge.profile().id);
  prefs.setSkipped('klondike',false);
  prefs.learn('klondike',{target:1,card:1,stock:1,flip:1,recycle:1,collect:1,undo:1});
 });
 await page.locator('[data-start=klondike]').first().tap();
 await page.locator('[data-game-mode]').first().tap();
 await page.locator('[data-command=lobby-start]').tap();
 const guide=page.locator('.first-turn-guide:not([hidden])');
 await guide.getByText('Нажмите кнопку подсказки, чтобы посмотреть возможный ход.').waitFor({timeout:6000});
 const hint=page.locator('[data-view-key=hint][data-sdk-guide-step~="hint"]');
 assert.equal(await hint.count(),1);
 for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(viewport);
  await page.waitForFunction(()=>{
   const hand=document.querySelector('.first-turn-guide:not([hidden])'),target=document.querySelector('[data-view-key=hint][data-sdk-guide-step~="hint"]');
   if(!hand||!target)return false;
   const point=hand.getBoundingClientRect(),box=target.getBoundingClientRect();
   return Math.abs(point.x-box.x-box.width/2)<2&&Math.abs(point.y-box.y-box.height/2)<2;
  });
 }
 await hint.tap();
 await page.locator('.solitaire-hint-popup').waitFor();
 await page.waitForFunction(()=>PlayroomFirstTurnGuide.settings('klondike').mastered.hint===1);
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
});

test('native hand ports preserve complete closed and open hands in the original rows',{timeout:120000},async t=>{
 for(const openHands of [false,true])for(const game of ['uno','domino','durak','oldmaid','gofish','mage-brawl']){
  const page=await pageFor(t);await page.evaluate(({openHands})=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned',openHands});const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.handRenderer=this;return update.call(this,frame);};},{openHands});
  await page.locator('[data-start='+game+']').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('[data-sdk-player-scene]').waitFor();
  if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
  const arena=game==='mage-brawl';
  const hand=page.locator(arena?'.layout-hand .mage-hand .hand-track':'.layout-hand [data-sdk-native-hand=own]');
  await hand.waitFor();
  if(arena){
   // Simultaneous plans keep opponent hands private in both host visibility modes.
   const projected=await page.evaluate(()=>{
    const {viewer}=handRenderer.frame.projection,players=handRenderer.sceneData.arena.players;
    return {own:players[viewer].hand.length,opponentFaces:players.some((player,index)=>index!==viewer&&player.hand?.length)};
   });
   const cards=hand.locator('.mage-card');
   assert(projected.own>0);
   assert.equal(projected.opponentFaces,false);
   assert.equal(await cards.count(),projected.own);
   assert(await cards.evaluateAll(nodes=>nodes.every(card=>card.offsetWidth>0&&card.offsetHeight>0)));
   assert.equal(await page.locator('.layout-participants .mage-card').count(),0);
  }
  const problems=await page.evaluate(()=>{const problems=[];for(const port of document.querySelectorAll('[data-sdk-native-hand]')){const player=handRenderer.sceneData.players.find(p=>p.player===Number(port.dataset.sdkHandOwner)),cards=player.hand||[],shown=[...port.querySelectorAll('.sdk-piece-card')];if(shown.length!==cards.length)problems.push('lost cards '+player.player);shown.forEach((e,i)=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)problems.push('zero card size');if(cards[i].hidden&&e.hasAttribute('data-entity'))problems.push('hidden identity');if(port.dataset.sdkNativeHand==='mini'&&!cards[i].hidden&&!e.parentElement.classList.contains('public-card'))problems.push('missing public wrapper');});if(port.dataset.sdkNativeHand==='own'&&!port.closest('.own-hand .hand-track'))problems.push('missing original hand track');}return problems;});
  assert.deepEqual(problems,[],game+' / open='+openHands);
  assert.equal(await page.locator('.sdk-choice-panel:visible,.sdk-cancel-selection:visible').count(),0,'empty SDK choice/cancel controls never leak into the initial game');
  if(game==='domino'){
   assert(await page.locator('.layout-hand .sdk-piece-card svg[data-piece-type=domino]').evaluateAll(nodes=>nodes.every(e=>e.viewBox.baseVal.height>e.viewBox.baseVal.width)),'hand tiles retain the original upright orientation');
   const backFrames=await page.locator('.mini-hand [data-card-deck=domino]').evaluateAll(tiles=>tiles.map(tile=>getComputedStyle(tile,'::before').borderStyle));
   assert(backFrames.length>0&&backFrames.every(frame=>frame===(openHands?'none':'solid')),'only the closed tiles have the original inset frame');
  }
  await page.context().close();
 }
});

test('ordinary draughts uses native motion promotion and the same forced-chain history',{timeout:90000},async t=>{
 const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{
  const proto=PlayroomSDKSceneRenderer.prototype,render=proto.renderDraughts,match=proto.sameTarget;
  window.draughtsSelectionReads=[];
  proto.renderDraughts=function(scene){
   if(!this.selectedSource||this.readonly)return render.call(this,scene);
   const moves=scene.checkerLayout.moves,sources=new Set(moves.map(move=>move.source));
   const sample={moves:moves.length,comparisons:0};
   const selected=this.selectedSource;
   this.sameTarget=function(left,right){
    if(right===selected&&sources.has(left?.entity))sample.comparisons++;
    return match.call(this,left,right);
   };
   try{return render.call(this,scene);}
   finally{delete this.sameTarget;draughtsSelectionReads.push(sample);}
  };
 });
 await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const state=create(id,{...options,seed:17,firstPlayerMode:'assigned',firstPlayer:0});if(id==='checkers'){state.turn=0;const board=Array(64).fill(null);for(const [cell,owner]of [[17,0],[56,0],[10,1],[12,1],[40,1]])board[cell]={id:'checker-'+cell,owner,king:false};Object.assign(state.data,{lightPlayer:0,board,forced:null,captured:[],quiet:0,repetitions:{}});}return state;};PlayroomFirstTurnGuide.setEnabled('checkers',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.draughtsRenderer=this;return update.call(this,frame);};});
 await page.locator('[data-start=checkers]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,r.seats[1].id,{kind:'human',nickname:'Игрок 2'});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-draughts-board').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
 const field=await page.locator('.layout-field').boundingBox(),board=await page.locator('.sdk-draughts-board').boundingBox();assert.equal(await page.locator('.layout-actions:visible').count(),0,'board-only play has no empty action dock');assert(Math.abs(board.width-board.height)<1);assert.equal(await page.locator('.sdk-draughts-piece').count(),5);
 await page.locator('.sdk-draughts-piece[data-piece-id="checker-17"]').click();
 const reads=await page.evaluate(()=>draughtsSelectionReads.filter(sample=>sample.moves>0));
 t.diagnostic('Selected move comparisons per field render: '+JSON.stringify(reads));
 assert.ok(reads.length&&reads.every(sample=>sample.comparisons<=sample.moves),'the renderer selects destinations in one pass');
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);await page.locator('.sdk-draughts-cell[data-cell="3"]').click();await page.locator('.playroom-motion-flight').first().waitFor();assert.equal(await page.locator('.sdk-flight-layer').count(),0,'the shared animator owns checker motion');await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-draughts-piece.is-captured').count(),1);assert.equal(await page.locator('.sdk-draughts-piece[data-board-cell="3"] svg.checker-art>path').count(),1);assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);assert.deepEqual(await page.locator('.sdk-draughts-board').boundingBox(),board);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>draughtsRenderer.frame.history.reviewing&&draughtsRenderer.frame.projection.revision===0);assert.equal(await page.locator('.sdk-draughts-piece.is-captured').count(),0);assert.equal(await page.locator('.sdk-draughts-piece[data-board-cell="17"]').count(),1);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);await slider.press('End');await page.waitForFunction(()=>draughtsRenderer.frame.projection.revision===1);assert.equal(await page.locator('.sdk-draughts-piece.is-captured').count(),1);assert.equal(await page.locator('.sdk-draughts-piece[data-board-cell="3"] svg.checker-art>path').count(),1);await page.locator('[data-command=history-close]:visible').first().click();await page.waitForFunction(()=>!draughtsRenderer.frame.history.reviewing);
 const promoted=await page.locator('.sdk-draughts-piece[data-board-cell="3"]').boundingBox(),destination=await page.locator('.sdk-draughts-cell[data-cell="39"]').boundingBox();
 assert(promoted&&destination);
 await page.mouse.move(promoted.x+promoted.width/2,promoted.y+promoted.height/2);
 await page.mouse.down();
 await page.mouse.move(destination.x+destination.width/2,destination.y+destination.height/2,{steps:14});
 await page.locator('.sdk-draughts-cell[data-cell="39"].playroom-drop-hover').waitFor();
 await page.mouse.up();
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===2);
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert.equal(await page.locator('.sdk-draughts-piece.is-captured').count(),0);
 assert.equal(await page.locator('.sdk-draughts-piece').count(),3);
 assert.equal(await page.locator('.sdk-draughts-piece[data-board-cell="39"] svg.checker-art>path').count(),1);
 assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);assert.deepEqual(errors,[]);
});

test('generic SDK flights retain the outgoing artwork within one session',async t=>{
 const page=await pageFor(t);
 await page.emulateMedia({reducedMotion:'no-preference'});
 const flight=await page.evaluate(()=>{
  const before=TabletopCore.createGame('checkers',{seed:17,players:[{name:'One'},{name:'Two'}]});
  before.turn=0;
  const board=Array(64).fill(null);
  for(const [cell,owner] of [[17,0],[56,0],[10,1],[12,1],[40,1]])board[cell]={id:'checker-'+cell,owner,king:false};
  Object.assign(before.data,{lightPlayer:0,board,forced:null,captured:[],quiet:0,repetitions:{}});
  const command=TabletopCore.availableCommands(before,0).find(move=>move.from===17&&move.to===3);
  const after=TabletopCore.applyAction(before,0,command);
  const resources=PlayroomCatalog.checkers.resources;
  const frame=state=>{
   const {modelProjection,scene}=TabletopCore.project(state,0);
   return {sessionId:'flight-session',projection:modelProjection,scene,resources};
  };
  const host=document.createElement('section');
  host.id='sdk-flight-fixture';
  document.querySelector('#app').replaceChildren(host);
  const renderer=new PlayroomSDKSceneRenderer(host,{command:()=>false});
  const first=frame(before),next=frame(after);
  window.flightFixture={renderer,first,next};
  renderer.update(first);
  const origin=host.querySelector('[data-board-cell="17"] .checker-art').closest('[data-entity]').getBoundingClientRect();
  renderer.update(next);
  const ghosts=[...document.querySelectorAll('.sdk-flight')],ghost=ghosts[0];
  return {count:ghosts.length,oldFace:ghost?.querySelectorAll('svg.checker-art>path').length,
   promotedFace:host.querySelectorAll('[data-board-cell="3"] svg.checker-art>path').length,
   closeToOrigin:ghost&&Math.abs(parseFloat(ghost.style.left)-origin.left)<1};
 });
 assert.deepEqual(flight,{count:1,oldFace:0,promotedFace:1,closeToOrigin:true});
 await page.locator('.sdk-flight-layer').waitFor({state:'detached'});
 const runs=await page.evaluate(()=>{
  const {renderer,first,next}=flightFixture;
  renderer.update(first);
  renderer.update(next);
  const replayed=document.querySelectorAll('.sdk-flight').length;
  const replacement={...next,sessionId:'other-session'};
  renderer.update(replacement);
  const afterReplacement=document.querySelectorAll('.sdk-flight-layer').length;
  renderer.update({...first,sessionId:replacement.sessionId});
  renderer.update(next);
  const acrossSessions=document.querySelectorAll('.sdk-flight-layer').length;
  renderer.destroy();
  return {replayed,afterReplacement,acrossSessions};
 });
 assert.deepEqual(runs,{replayed:1,afterReplacement:0,acrossSessions:0});
});

test('ordinary paired tricks take the table before refilling from stock in play and history',{timeout:45000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:true});
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>{
   const state=create(id,{...options,deck:54,seed:17,firstPlayer:0,firstPlayerMode:'assigned',players:[{name:'А'},{name:'Б'}]});
   if(id!=='durak')return state;
   const d=state.data;
   Object.assign(d,{table:[{attack:d.hands[0].pop(),defense:null}],taking:true,composing:false,attacker:0,defender:1,boutOrigin:0,attackCursor:0,passes:0,attackLimit:1});
   state.turn=0;TabletopCore.validateState(state);window.refillCard=d.drawPile.at(-1).id;
   return state;
  };
  PlayroomFirstTurnGuide.setEnabled('durak',false);
  const update=PlayroomSDKSceneRenderer.prototype.update,animate=Element.prototype.animate;
  PlayroomSDKSceneRenderer.prototype.update=function(frame){window.transferRenderer=this;return update.call(this,frame);};
  window.transferTrace=[];
  Element.prototype.animate=function(...args){
   const effect=animate.apply(this,args);
   if(this.dataset.motionKind==='draw'){
    const scene=transferRenderer.sceneData;
    const previous=transferTrace.at(-1)?.finished??true;
    const phase={player:Number(this.dataset.motionPlayer),stockCount:scene.stockCount,stockZone:scene.zones.find(zone=>zone.kind==='stock').count,
     hands:scene.players.map(p=>p.hand.length),refilled:scene.objects.some(o=>o.zone==='hand-0'&&o.ref.id===refillCard),previous,finished:false};
    transferTrace.push(phase);
    void effect.finished.then(()=>{phase.finished=true;},()=>{});
   }
   return effect;
  };
 });
 await page.locator('[data-start=durak]').first().tap();
 await page.locator('[data-game-mode=hotseat]').tap();
 await page.locator('[data-command=lobby-start]').tap();
 await page.locator('.sdk-paired-tricks').waitFor();
 const unlock=page.locator('.handoff [data-command=unlock]');
 if(await unlock.isVisible())await unlock.tap();
 const controls=page.locator('.layout-actions button[data-action]');
 const done=await controls.evaluateAll(nodes=>nodes.findIndex(node=>JSON.parse(node.dataset.action).type==='done'&&!node.disabled));
 assert(done>=0,'the active attacker can finish the take');
 await controls.nth(done).tap();
 const verify=async()=>{
  await page.waitForFunction(()=>transferTrace.length===2&&transferTrace.every(phase=>phase.finished));
  const phases=await page.evaluate(()=>transferTrace.splice(0));
  assert.deepEqual(phases,[
   {player:1,stockCount:42,stockZone:42,hands:[5,7],refilled:false,previous:true,finished:true},
   {player:0,stockCount:41,stockZone:41,hands:[6,7],refilled:true,previous:true,finished:true},
  ]);
 };
 await verify();
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 await page.locator('[data-game-menu]').click();
 await page.locator('[data-command=history]:visible').click();
 const slider=page.locator('#replay-range');
 await slider.waitFor();await slider.focus();await slider.press('Home');
 await page.waitForFunction(()=>document.querySelector('#replay-range').value==='0');
 await slider.press('ArrowRight');
 await verify();
 assert.equal(await page.locator('.layout-hand [data-sdk-target]:not([disabled])').count(),0);
});

test('ordinary paired-trick table keeps native attack motion and the same read-only history',{timeout:90000},async t=>{
 const page=await pageFor(t);await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const state=create(id,{...options,deck:54,seed:17,firstPlayerMode:'assigned',firstPlayer:0});if(id==='durak'){const d=state.data,zone=[...d.hands,d.drawPile].find(cards=>cards.some(c=>c.id==='joker-red')),at=zone.findIndex(c=>c.id==='joker-red');[zone[at],d.hands[0][0]]=[d.hands[0][0],zone[at]];}return state;};PlayroomFirstTurnGuide.setEnabled('durak',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.trickRenderer=this;frame.ui={...frame.ui,quickPlay:false};return update.call(this,frame);};});
 await page.locator('[data-start=durak]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-paired-tricks').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
 const field=await page.locator('.layout-field').boundingBox(),table=await page.locator('.sdk-paired-tricks').boundingBox();assert.equal(await page.locator('.sdk-trick-pair').count(),6);await page.evaluate(()=>window.trickNodes=[...document.querySelectorAll('.sdk-trick-pair')]);
 assert.equal(await page.locator('.layout-actions button[data-action]').evaluateAll(nodes=>nodes.filter(n=>JSON.parse(n.dataset.action).type==='attack').length),0,'hand cards own attacks without duplicate buttons');
 await page.evaluate(()=>{
  const prototype=PlayroomSDKSceneRenderer.prototype,capture=prototype.captureEntities;
  window.trickFallbackCopies=0;
  prototype.captureEntities=function(){const snapshot=capture.call(this);trickFallbackCopies+=snapshot.size;return snapshot;};
 });
 const opening=page.locator('.sdk-trick-opening[data-card-slot=play]');
 assert.equal(await opening.locator(':scope > svg.card-slot-art').count(),1);
 assert.equal(await opening.isDisabled(),true);
 assert.equal(await opening.evaluate(element=>getComputedStyle(element).borderTopStyle),'none','the shared slot art has no extra dashed defence border');
 await page.evaluate(()=>{
  const prepare=TabletopAudio.prototype.prepare;
  window.gameAudioWaits=0;
  TabletopAudio.prototype.prepare=function(options){
   if(options?.signal){window.gameAudioWaits++;return new Promise(()=>{});}
   return prepare.call(this,options);
  };
 });
 const attack=await page.evaluate(()=>trickRenderer.frame.projection.actions.find(c=>c.type==='attack'));assert(attack);assert.equal(attack.card,'joker-red');assert.match(await page.locator('.layout-hand [data-entity="card-joker-red"]').innerText(),/Дж/,'the ordinary app resolves the authored joker print in Russian');await page.locator('.layout-hand [data-entity="card-'+attack.card+'"]').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0,'selection never commits a guessed table move');await page.locator('.sdk-trick-opening:not([disabled])').click();await page.locator('.action-reveal-art>.shared-card').waitFor();assert.match(await page.locator('.action-reveal-art>.shared-card').innerText(),/Дж/,'the same standard-deck print is localized in the enlarged public action');
 assert.equal(await page.locator('.action-reveal[role="status"]').getAttribute('aria-label'),'Красный джокер');
 assert.equal(await page.evaluate(()=>gameAudioWaits),0,'a pending unlock cannot hold the card reveal');
 assert.equal(await page.evaluate(()=>{
  const preview=document.createElement('template');
  preview.innerHTML=PlayroomSDKRenderCard({rank:6,suit:'♥'},{packId:'durak'});
  return preview.content.firstElementChild?.getAttribute('aria-label');
 }),'6 черви');
 assert.equal(await page.locator('.sdk-trick-attack[data-reveal-active]').count(),1,'the shared action reveal hides the real target until the card lands');assert.equal(await page.locator('.sdk-flight-layer').count(),0,'the normal feedback animator owns card motion');await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert.equal(await page.evaluate(()=>window.trickFallbackCopies),0,'the shell leaves animation snapshots to its shared player');
 assert.equal(await page.locator('.sdk-trick-attack[data-entity="card-'+attack.card+'"]').count(),1);assert(await page.evaluate(()=>trickNodes.every((e,i)=>e===document.querySelectorAll('.sdk-trick-pair')[i])),'playing a card retains all reserved pair nodes');assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);assert.deepEqual(await page.locator('.sdk-paired-tricks').boundingBox(),table);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>document.querySelectorAll('.sdk-trick-attack[data-entity]').length===0);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);assert.equal(await page.locator('.sdk-trick-pair').count(),6);await slider.press('End');await page.waitForFunction(()=>document.querySelectorAll('.sdk-trick-attack[data-entity]').length===1);await page.locator('[data-command=history-close]:visible').first().click();await page.locator('.sdk-paired-tricks').waitFor();assert(await page.evaluate(()=>trickNodes.every((e,i)=>e===document.querySelectorAll('.sdk-trick-pair')[i])),'history returns through the same paired-table renderer');
});
test('Go Fish guide advances from native card selection to the opponent without a move',{timeout:45000},async t=>{
 for(const input of ['touch','keyboard'])await t.test(input,async t=>{
  const page=await pageFor(t,{viewport:{width:390,height:844},hasTouch:input==='touch',isMobile:input==='touch',offline:true});
  await page.evaluate(()=>{
   PlayroomFirstTurnGuide.setEnabled('gofish',true);
   const create=TabletopCore.createGame;
   TabletopCore.createGame=(id,options)=>create(id,id==='gofish'?{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned'}:options);
  });
  await page.locator('[data-start=gofish]').first().click();
  await page.locator('[data-game-mode=hotseat]').click();
  await page.locator('[data-command=lobby-start]').click();
  const guide=page.locator('.first-turn-guide:not([hidden])');
  await guide.getByText('Выберите карту нужного номинала.').waitFor();
  const card=page.locator('.layout-hand [data-sdk-guide-step~="card"]').first();
  if(input==='touch')await card.tap({position:{x:7,y:15}});
  else await card.press('Enter');
  await guide.getByText('Выберите соперника, у которого хотите спросить карты.').waitFor({timeout:3500});
  const opponent=page.locator('[data-player-target][data-sdk-guide-step~="opponent"]');
  await opponent.waitFor();
  if(input==='touch'){
   const cdp=await page.context().newCDPSession(page);
   await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.7});
   await page.waitForFunction(()=>{
    const caption=document.querySelector('.first-turn-guide:not([hidden]) .guide-caption');
    if(!caption||visualViewport.scale<1.6)return false;
    const r=caption.getBoundingClientRect(),{offsetLeft:left,offsetTop:top,width,height}=visualViewport;
    return r.left>=left&&r.top>=top&&r.right<=left+width&&r.bottom<=top+height;
   });
   await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
   await cdp.detach();
  }
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
  if(input==='touch')await opponent.tap();
  else await opponent.press('Enter');
  await page.waitForFunction(()=>PlayroomFirstTurnGuide.settings('gofish').mastered.opponent===1);
  assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),1);
 });
});

test('ordinary collection games reuse player targets public sets and the same history',{timeout:120000},async t=>{
 for(const game of ['gofish','oldmaid']){
  const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(game=>{const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.collectionRenderer=this;if(!this._collectionTrace){this._collectionTrace=true;const command=this.command;this.command=async c=>{window.collectionCommands??=[];collectionCommands.push({command:c,readonly:this.readonly});const result=await command(c);collectionCommands.push({result});return result;};}try{return update.call(this,frame);}catch(e){window.collectionErrors??=[];collectionErrors.push(e.stack);throw e;}};const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const state=create(id,{...options,players:Array.from({length:game==='gofish'?4:2},(_,i)=>({name:'Игрок '+(i+1)})),seed:17,firstPlayerMode:'assigned',firstPlayer:0});if(id!==game)return state;const d=state.data;if(game==='gofish'){const pool=new Map(Array.from({length:13},(_,i)=>['♠','♥','♦','♣'].map(suit=>({id:suit+(i+2),suit,rank:i+2}))).flat().map(c=>[c.id,c])),take=id=>{const c=pool.get(id);pool.delete(id);return c;};d.books=[[2,5],[9],[],[7]];d.bookCards=d.books.map(ranks=>ranks.map(rank=>[...pool.values()].find(c=>c.rank===rank)));for(const rank of d.books.flat())for(const c of [...pool.values()])if(c.rank===rank)pool.delete(c.id);d.hands=[['♠8','♥8','♦8','♣3'],['♣8','♠4'],['♥3','♠6'],['♦3','♣4']].map(ids=>ids.map(take));d.drawPile=[...pool.values()];d.attempts=Array(4).fill(0);}else{const deck=Array.from({length:9},(_,i)=>['♠','♥','♦','♣'].map(suit=>({id:suit+(i+6),suit,rank:i+6}))).flat().filter(c=>c.id!=='♣12'),take=id=>deck.find(c=>c.id===id);d.hands=[[take('♠8'),take('♠12'),take('♦10')],[take('♣8'),take('♥10')]];d.discard=deck.filter(c=>!['♠8','♣8','♠12','♦10','♥10'].includes(c.id));d.outOrder=[];d.points=[0,0];}state.turn=0;if(!TabletopCore.validateState(state))throw Error('Invalid native collection fixture');return state;};PlayroomFirstTurnGuide.setEnabled(game,false);},game);
  await page.locator('[data-start='+game+']').first().click();await page.locator('[data-game-mode=hotseat]').click();if(game==='oldmaid')await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,r.seats[1].id,{kind:'human',nickname:'Игрок 2'});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator(game==='gofish'?'.sdk-collected-sets':'.sdk-discard-pairs').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
  const field=await page.locator('.layout-field').boundingBox();
  if(game==='gofish'){
   await page.emulateMedia({reducedMotion:'no-preference'});
   const stagedArrival=async()=>{
    await page.locator('.playroom-request-layer').first().waitFor({state:'attached',timeout:6000});
    const incoming=page.locator('.layout-hand [data-entity="card-♣8"][data-motion-pending]');
    assert.equal(await incoming.count(),1,'the received card has an arrival slot during the question');
    assert.equal(await incoming.evaluate(node=>getComputedStyle(node).visibility),'hidden','the arrival slot stays hidden before the flight');
    assert.equal(await page.locator('.sdk-collection-cards .mini-card').count(),4,'the completed set appears after the transfer');
    await page.locator('.playroom-motion-flight[data-motion-kind="draw"]').first().waitFor({state:'attached',timeout:5000});
   };
   assert.equal(await page.locator('.sdk-collection-row .avatar').count(),4);assert.equal(await page.locator('.sdk-collection-cards .mini-card').count(),4);await page.evaluate(()=>window.nativeCollectionRows=[...document.querySelectorAll('.sdk-collection-row')]);await page.locator('.layout-hand [data-entity="card-♠8"]').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.sdk-choice-panel').isVisible(),false);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);await page.locator('[data-sdk-player-choice="1"] .player-info').click();await stagedArrival();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.books[0].includes(8));await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-collection-cards .mini-card').count(),5);assert(await page.evaluate(()=>nativeCollectionRows.every((r,i)=>r===document.querySelectorAll('.sdk-collection-row')[i])));assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);
   await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>document.querySelectorAll('.sdk-collection-cards .mini-card').length===4);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);await slider.press('End');await stagedArrival();await page.waitForFunction(()=>document.querySelectorAll('.sdk-collection-cards .mini-card').length===5);await page.locator('[data-command=history-close]:visible').first().click();assert(await page.evaluate(()=>nativeCollectionRows.every((r,i)=>r===document.querySelectorAll('.sdk-collection-row')[i])),'real history keeps the same collection rows');
  }else{
   assert.equal(await page.locator('.layout-actions:visible').count(),0,'a picker-only game reserves no empty SDK action row');const queen=page.locator('.layout-hand [data-entity="card-♠12"]');assert((await queen.innerHTML()).includes('card-crown'));await queen.hover();await page.mouse.down();assert.equal(await queen.evaluate(e=>e.classList.contains('is-hand-preview')),true,'own cards retain the native press-to-inspect gesture');await page.mouse.up();assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
   const opponent=page.locator('[data-sdk-player-choice="1"] .player-info');assert(await page.locator('.opponent-hand .sdk-piece-card').evaluateAll(nodes=>nodes.every(e=>e.disabled)),'opponent miniatures remain read-only; the native picker owns selection');await opponent.click();const dialog=page.locator('.card-choice-dialog');await dialog.waitFor();assert.equal(await dialog.count(),1);assert.equal(await dialog.locator('[data-card-index]').count(),2);assert.equal(await dialog.locator('button button,[data-sdk-target]').count(),0,'picker clones contain passive art without nested buttons or SDK permissions');
   const tile=dialog.locator('[data-card-index]').first(),back=tile.locator('.card-deck-art');
   const [tileBox,backBox,cardWidth]=await Promise.all([
    tile.boundingBox(),back.boundingBox(),page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--size-card'))),
   ]);
   assert.deepEqual([tileBox.width,tileBox.height,backBox.width,backBox.height],[72,101,cardWidth,cardWidth*1.4],'portrait card art follows the native scale independently of the hit target');
   assert.equal(backBox.x+backBox.width/2,tileBox.x+tileBox.width/2);
   assert.equal(backBox.y+backBox.height/2,tileBox.y+tileBox.height/2);
   await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);await opponent.click();await dialog.locator('[data-card-index="0"]').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();await page.locator('.handoff [data-command=unlock]:visible,[data-command=pass-device]:not([disabled]):visible').first().waitFor();if(await page.locator('[data-command=pass-device]:not([disabled]):visible').count())await page.locator('[data-command=pass-device]:not([disabled]):visible').first().click();await page.locator('.handoff [data-command=unlock]').waitFor();await page.locator('.handoff [data-command=unlock]').click();await page.getByRole('button',{name:'Без подсказок',exact:true}).click();try{await page.locator('[data-sdk-player-choice="0"] .player-info').click({timeout:5000});}catch(e){throw Error('OldMaid next-player overlay: '+JSON.stringify(await page.locator('#modal-root').evaluate(e=>({text:e.innerText,buttons:[...e.querySelectorAll('button')].map(b=>({text:b.innerText,command:b.dataset.command}))}))));}await dialog.waitFor();assert.equal(await dialog.locator('[data-card-index]').count(),2);await dialog.locator('[data-card-index="1"]').click();try{await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.status==='finished',null,{timeout:5000});}catch(e){throw Error('OldMaid picker: '+JSON.stringify(await page.evaluate(()=>({calls:window.collectionCommands||[],move:PlayroomAppBridge.saveLibrary.current().session.current.move,status:PlayroomAppBridge.saveLibrary.current().session.current.status,choices:collectionRenderer.sceneData.playerChoices,readonly:collectionRenderer.readonly,errors:window.collectionErrors||[]}))));}await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-pair-discard [data-entity="card-♦10"]').count(),1);assert(await page.locator('.player-panel[data-player-index="1"]').evaluate(e=>e.classList.contains('is-inactive')),'the player who discarded all cards keeps the native inactive state');assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);
  }
  assert.deepEqual(await page.evaluate(()=>window.collectionErrors||[]),[]);assert.equal(await page.locator('.sdk-zones,.sdk-objects').count(),0,'the host keeps scene zone and object descriptors out of the DOM');
 }
});

test('network SDK renders authorized player choices and returns from cached history',{timeout:60000},async t=>{
 const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});
 const received=await page.evaluate(()=>{
  const session=new TabletopSession(TabletopCore,'dice-poker',{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Ведущий'},{name:'Гость'}]});
  const authority=new SessionAuthority(session);
  try{
   const pack=TabletopCore.get(session.game,session.packVersion),Protocol=PlayroomProtocol,Projection=PlayroomNetworkProjection;
   const packet=Protocol.parse(JSON.stringify(Projection.compact(authority.connect(0).snapshot({wire:true}))));
   const captured={};
   const frame=Projection.restore(packet,event=>pack.presentEvent(event,packet.state.players),{...pack,
    prepareLocalView(...args){return captured.prepared=pack.prepareLocalView(...args);},
    eventScenes(projection,...args){captured.checkpoints=projection;return pack.eventScenes(projection,...args);},
    scene(projection,...args){captured.scene=projection;return pack.scene(projection,...args);}
   });
   const model=Protocol.projectedModel(frame);
   return {sameScene:model===captured.scene&&model===captured.checkpoints,
    sameData:model.data===captured.prepared.data,sameCommands:!!model.actions.length&&model.actions.every(command=>captured.prepared.actions.includes(command)),
    frozen:Object.isFrozen(model)&&Object.isFrozen(model.data)&&Object.isFrozen(model.actions)};
  }finally{authority.dispose();}
 });
 assert.deepEqual(received,{sameScene:true,sameData:true,sameCommands:true,frozen:true},'the recipient shares one immutable projection with rendering and input');
 const choice=await page.evaluate(async()=>{
  const session=new TabletopSession(TabletopCore,'gofish',{seed:17,firstPlayerMode:'assigned',firstPlayer:0,players:[{name:'Спрашивающий'},{name:'Отвечающий'}]});
  window.fishAuthority=new SessionAuthority(session,{sessionId:'sdk-fish-history'});
  const player=fishAuthority.connect(0),spectator=fishAuthority.connect(-1),wire=player.snapshot({wire:true});
  const expected=TabletopCore.project(session.current,0,{rawEvents:true,omitModelEvents:true,dataView:'omit'}).modelProjection;
  const live=TabletopCore.project(session.current,0,{dataView:'omit'}).modelProjection;
  const packet=PlayroomProtocol.parse(JSON.stringify(PlayroomNetworkProjection.compact(wire)));
  const publicFacts=spectator.snapshot({wire:true}).state.modelProjection;
  window.fishClient=new PlayroomSessionClient(PlayroomLocalTransport(player));
  await fishClient.refresh();
  window.fishView=PlayroomSharedViews.mount(fishClient,PlayroomPacks.exportView('gofish'));
  fishView.render();
  const {cardId,target}=fishClient.snapshot.actions.find(command=>command.type==='ask');
  return {cardId,target,localSharesModel:PlayroomProtocol.projectedModel(fishClient.snapshot).data===live.data,
   wireSharesModel:wire.state.modelProjection.data===expected.data,
   parsedOwnsData:packet.model.data!==expected.data,
   privateHands:packet.model.data.hands.map(hand=>hand.every(card=>card.hidden===true)),
   spectatorHands:publicFacts.data.hands.map(hand=>hand.every(card=>card.hidden===true))};
 });
 assert.equal(choice.localSharesModel,true,'the local client reads the authorized model by reference');
 assert.equal(choice.wireSharesModel,true,'preparing the compact wire frame retains its own model data');
 assert.equal(choice.parsedOwnsData,true,'the receiving process owns a detached payload');
 assert.deepEqual(choice.privateHands,[false,true]);
 assert.deepEqual(choice.spectatorHands,[true,true]);
 const field=page.locator('.sdk-collected-sets');
 await field.waitFor();
 await page.locator('#modal-root .learning-intro [data-learning-choice=yes]').click();
 const guide=page.locator('.first-turn-guide:not([hidden])');
 await guide.getByText('Выберите карту нужного номинала.').waitFor();
 await page.locator('.layout-hand [data-entity="card-'+choice.cardId+'"]').focus();
 await page.keyboard.press('Enter');
 await guide.getByText('Выберите соперника, у которого хотите спросить карты.').waitFor();
 assert.equal(await page.evaluate(()=>fishClient.snapshot.revision),0);
 await page.locator('[data-sdk-player-choice="'+choice.target+'"] [data-sdk-guide-step~="opponent"]').press('Enter');
 await page.waitForFunction(()=>fishClient.snapshot.revision===1);
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 await page.evaluate(()=>fishView.openHistory(0));
 await page.locator('.history-panel[aria-busy=false]').waitFor();
 assert.equal(await page.locator('.network-game').getAttribute('data-revision'),'0');
 assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);
 await page.locator('[data-command=history-close]:visible').first().click();
 await page.waitForFunction(()=>document.querySelector('.network-game').dataset.revision==='1');
 assert.equal(await field.isVisible(),true);
 await page.evaluate(()=>{fishView.destroy();fishClient.close();fishAuthority.dispose();});
});

test('ordinary naval game keeps segment-aware drag and the same public-shot history',{timeout:120000},async t=>{
 for(const stage of ['setup','battle']){
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(stage=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const state=create(id,{...options,preset:'classic',seed:17,firstPlayerMode:'assigned',firstPlayer:0});if(id==='fleet-grid'&&stage==='battle'){state.turn=0;Object.assign(state.data,{phase:'battle',ready:[true,true],ships:[[[0,1,2,3,4],[20,21,22,23],[40,41,42],[60,61,62],[80,81]],[[5,6,7,8,9],[25,26,27,28],[45,46,47],[65,66,67],[85,86]]],shots:[[{cell:85,hit:true},{cell:50,hit:false}],[]],marks:[[],[]],sunk:[[],[]]});}return state;};PlayroomFirstTurnGuide.setEnabled('fleet-grid',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.navalRenderer=this;return update.call(this,frame);};},stage);
  await page.locator('[data-start=fleet-grid]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,r.seats[1].id,{kind:'human',nickname:'Игрок 2'});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-naval-fields').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
  const field=await page.locator('.layout-field').boundingBox(),board=await page.locator('.sdk-naval-panel.is-active .sdk-naval-grid').boundingBox();assert(Math.abs(board.width-board.height)<1);assert.equal(await page.locator('.sdk-naval-panel.is-active').count(),1);
  if(stage==='setup'){
   const drag=async(from,to)=>{const a=await from.boundingBox(),b=await to.boundingBox();assert(a&&b);await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:14});await page.mouse.up();};
   await drag(page.locator('.sdk-naval-indicators [data-drag-shape="5:h"]'),page.locator('.sdk-naval-cell[data-grid-index="22"]'));await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.ships[0][0]),[20,21,22,23,24]);
   await page.locator('.sdk-naval-cell[data-grid-index="22"]>button').click();
   assert.equal(await page.locator('.sdk-naval-ship-selection.is-selected').count(),1,'selection has one outline across the whole ship');
   const rings=await page.locator('.sdk-naval-cell.ship > button.is-selected').evaluateAll(buttons=>buttons.map(button=>{
    const style=getComputedStyle(button);
    return [style.outlineStyle,style.boxShadow];
   }));
   assert.equal(rings.length,5,'every segment still knows that the ship is selected');
   assert(rings.every(([outline,shadow])=>outline==='none'&&shadow==='none'),'segment hit targets never add extra outlines');
   await drag(page.locator('.sdk-naval-cell[data-grid-index="22"]>button'),page.locator('.sdk-naval-cell[data-grid-index="62"]'));await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===2);assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.ships[0][0]),[60,61,62,63,64]);
   const source=await page.locator('.sdk-naval-cell[data-grid-index="62"]>button').boundingBox();await page.mouse.move(source.x+source.width/2,source.y+source.height/2);await page.mouse.down();await page.mouse.move(board.x+board.width+35,board.y+35,{steps:14});await page.mouse.up();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===3);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.ships[0].length),0,'dropping outside removes only the selected own ship');
  }else{
   assert.equal(await page.locator('.sdk-naval-panel[data-fleet-player="1"] .sdk-naval-cell.ship').count(),0);assert.equal(await page.locator('.sdk-naval-panel.is-active .sdk-naval-cell.hit').count(),1);await page.getByRole('button',{name:'Автопереключение полей по ходу',exact:true}).click();assert.equal(await page.evaluate(()=>TabletopUI.viewPreferences('fleet-grid',0).followOpponent),'off','native view preference is saved by the host');await page.getByRole('button',{name:'Мой флот',exact:true}).click();assert.equal(await page.locator('.sdk-naval-panel.is-active').getAttribute('data-fleet-player'),'0');await page.getByRole('button',{name:'Соперник',exact:true}).click();await page.getByRole('button',{name:'Автопереключение полей по ходу',exact:true}).click();
   assert.equal(await page.locator('.sdk-naval-panel.is-active').getAttribute('data-fleet-player'),'1','enabling follow returns to the board being attacked');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.evaluate(()=>{
    window.shotAnimations={flights:[],pulses:[]};
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(...args){
     if(this.classList.contains('playroom-motion-flight'))shotAnimations.flights.push(this.dataset.motionKind);
     const cell=this.closest('.sdk-naval-cell');
     if(cell)shotAnimations.pulses.push({cell:cell.dataset.gridIndex,board:cell.closest('.sdk-naval-panel').dataset.fleetPlayer,
      visible:!!this.getClientRects().length,tag:this.tagName});
     return animate.apply(this,args);
    };
   });
   await page.locator('.sdk-naval-panel.is-active .sdk-naval-cell[data-grid-index="86"]>button').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-naval-panel[data-fleet-player="1"] .sdk-naval-cell.hit').count(),2);
   const affected=page.locator('.player-panel.is-participant-affected');
   await affected.first().waitFor({state:'detached'});
   const shot={cell:'86',board:'1',visible:true,tag:'SPAN'};
   assert.deepEqual(await page.evaluate(()=>shotAnimations),{flights:[],pulses:[shot]},'only the visible mark animates during a shot');
   assert.equal(await page.locator('.sdk-naval-panel.is-active').getAttribute('data-fleet-player'),'0','the hotseat handoff follows the new turn');
   await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>navalRenderer.frame.history.reviewing&&navalRenderer.frame.projection.revision===0);assert.equal(await page.locator('.sdk-naval-panel[data-fleet-player="1"] .sdk-naval-cell.hit').count(),1);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);await slider.press('End');await page.waitForFunction(()=>navalRenderer.frame.projection.revision===1);assert.equal(await page.locator('.sdk-naval-panel.is-active').getAttribute('data-fleet-player'),'1','replay shows the board targeted by the recorded shot');
   assert.equal(await page.getByRole('button',{name:'Соперник',exact:true}).getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.sdk-naval-panel.is-active .sdk-naval-cell.hit').count(),2);
   await affected.first().waitFor({state:'detached'});
   assert.deepEqual(await page.evaluate(()=>shotAnimations),{flights:[],pulses:[shot,shot]},'history replays the same visible shot once');
   assert.deepEqual(await page.locator('.player-panel[aria-current=true]').evaluateAll(panels=>panels.map(panel=>panel.dataset.playerIndex)),['1'],'history clears the shot highlight and restores the recorded turn');
   await page.setViewportSize({width:844,height:320});
   const toolsBar=await page.locator('.game-frame-tools').boundingBox();
   assert(toolsBar);
   for(const name of ['Мой флот','Соперник','Автопереключение полей по ходу']){
    const button=page.getByRole('button',{name,exact:true});
    assert(await button.evaluate((element,headerBottom)=>{
     const rect=element.getBoundingClientRect();
     return rect.top>=headerBottom&&element.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));
    },toolsBar.y+toolsBar.height),`${name} remains clear of the header on a short landscape screen`);
   }
   await page.getByRole('button',{name:'Мой флот',exact:true}).click();
   assert.equal(await page.locator('.sdk-naval-panel.is-active').getAttribute('data-fleet-player'),'0');
   await page.getByRole('button',{name:'Соперник',exact:true}).click();
   assert.equal(await page.locator('.sdk-naval-panel.is-active .sdk-naval-cell.hit').count(),2);
   assert.equal(await page.evaluate(()=>navalRenderer.frame.projection.revision),1);
   await page.setViewportSize({width:1000,height:800});
   await page.locator('[data-command=history-close]:visible').first().click();await page.locator('.handoff [data-command=unlock]:visible,[data-command=pass-device]:not([disabled]):visible').first().waitFor();if(await page.locator('[data-command=pass-device]:not([disabled]):visible').count())await page.locator('[data-command=pass-device]:not([disabled]):visible').first().click();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();if(await page.getByRole('button',{name:'Без подсказок',exact:true}).isVisible())await page.getByRole('button',{name:'Без подсказок',exact:true}).click();await page.waitForFunction(()=>!navalRenderer.frame.history.reviewing);
  }
  assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);assert.deepEqual(await page.locator('.sdk-naval-panel.is-active .sdk-naval-grid').boundingBox(),board);assert.deepEqual(errors,[]);
 }
});

test('ordinary domino uses both endpoints to preview the same tile orientation as history',{timeout:60000},async t=>{
 const page=await pageFor(t,{viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>{
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>{
   const state=create(id,id==='domino'?{...options,seed:17,firstPlayerMode:'assigned',firstPlayer:0}:options);
   if(id!=='domino')return state;
   const d=state.data,tiles=new Map([...d.hands.flat(),...d.stock].map(tile=>[tile.id,tile]));
   const take=id=>{const tile=tiles.get(id);tiles.delete(id);return tile;};
   d.chain=[take('d11')];d.openingTileId='d11';
   d.hands=[['d12','d13','d14','d15','d16','d01','d00'].map(take),['d22','d23','d24','d25','d26','d02','d03'].map(take)];
   d.stock=[...tiles.values()];
   if(!TabletopCore.validateState(state))throw Error('Invalid domino placement fixture');
   return state;
  };
  PlayroomFirstTurnGuide.setEnabled('domino',false);
 });
 await page.locator('[data-start=domino]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,r.seats[1].id,{kind:'human',nickname:'Игрок 2'});b.renderLobby();});
 await page.locator('[data-command=lobby-start]').click();
 const board=page.locator('.sdk-chain-board');await board.waitFor();
 const {openHistory}=require('./browser-origin.cjs');
 const gate=page.locator('.handoff [data-command=unlock]:visible');
 if(await gate.count())await gate.click();
 const tile=page.locator('.layout-hand [data-entity=tile-d12]');
 await tile.click();
 const ends=board.locator('.sdk-chain-drop:not([disabled])');
 await ends.first().waitFor();
 assert.deepEqual(await ends.evaluateAll(nodes=>nodes.map(node=>[Number(node.dataset.previewA),Number(node.dataset.previewB)])),[[2,1],[1,2]]);
 assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
 await page.setViewportSize({width:320,height:740});
 assert(await ends.first().isVisible());assert(await ends.last().isVisible());
 await ends.first().click();
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current()?.session.current.data.chain.length===2);
 await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
 assert.deepEqual(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.chain.map(({id,a,b})=>[id,a,b])),[['d12',2,1],['d11',1,1]]);
 await openHistory(page);
 const slider=page.locator('#replay-range');await slider.focus();await slider.press('Home');
 await board.locator('[data-entity=tile-d12]').waitFor({state:'detached'});
 await slider.press('End');await board.locator('[data-entity=tile-d12]').waitFor();
 assert.equal(await ends.count(),0);
 assert.deepEqual(errors,[]);
});
test('ordinary memory uses native flip close match history and live card skins without reflow',{timeout:150000},async t=>{
 for(const deck of ['cartoon',52]){
  const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluate(deck=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,preset:'medium',deck,seed:17,firstPlayerMode:'assigned',firstPlayer:0});PlayroomFirstTurnGuide.setEnabled('pexeso',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.memoryRenderer=this;return update.call(this,frame);};},deck);
  await page.locator('[data-start=pexeso]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,r.seats[1].id,{kind:'human',nickname:'Игрок 2'});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-paired-memory').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
  const resourceWork=await page.evaluate(()=>{
   const renderer=memoryRenderer,resources=renderer.frame.resources,assets=resources.assets;
   const index=renderer.resourceIndex;
   renderer.prepareResources(resources);
   return {reused:renderer.resourceIndex===index,shared:renderer.preparedAssets===assets};
  });
  assert.deepEqual(resourceWork,{reused:true,shared:true});
  assert.equal(await page.locator('.sdk-memory-slot').count(),24);assert.equal(await page.locator('.layout-actions:visible').count(),0,'memory reserves no empty SDK action dock');const field=await page.locator('.layout-field').boundingBox(),geometry=()=>page.locator('.sdk-memory-slot').evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})),slots=await geometry();await page.evaluate(()=>window.keptMemorySlots=[...document.querySelectorAll('.sdk-memory-slot')]);
  const indices=await page.evaluate(()=>{const board=PlayroomAppBridge.saveLibrary.current().session.current.data.board,key=c=>c.character||c.rank+'-'+(['♥','♦'].includes(c.suit)?'red':'black');return {mate:board.findIndex((c,i)=>i>0&&key(c)===key(board[0])),other:board.findIndex(c=>key(c)!==key(board[0]))};});
  await page.locator('.sdk-memory-slot[data-motion-value="0"] button').click();await page.locator('.playroom-motion-flight[data-motion-kind=flip]').first().waitFor();assert.equal(await page.locator('.sdk-flight-layer').count(),0,'the common animator owns the real card flip');await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),1);
  await page.evaluate(()=>PlayroomAppearanceUI.show());await page.locator('[data-appearance-tab=components]').click();const family=deck==='cartoon'?'character-face':'card-face',variant=deck==='cartoon'?'simple':'mini-split';assert.equal(await page.locator('[data-skin-family="'+(deck==='cartoon'?'card-face':'character-face')+'"]').count(),0,'skin choices follow the active deck '+JSON.stringify(await page.evaluate(()=>({pack:document.querySelector('[data-appearance-game]')?.value,scenes:[...document.querySelectorAll('[data-appearance-pack]')].map(e=>({className:e.className,pack:e.dataset.appearancePack,families:e.dataset.skinFamilies})),selected:document.querySelector('[data-appearance-game]')?.outerHTML.slice(0,300)}))));await page.locator('[data-skin-family="'+family+'"][data-skin-variant="'+variant+'"]').click();await page.locator('[data-appearance-apply]').click();await page.waitForFunction(()=>!document.querySelector('.appearance-gallery-modal'));if(deck==='cartoon')assert.equal(await page.locator('.sdk-memory-face [data-character-style="simple"]').count(),2);else assert.equal(await page.locator('.sdk-memory-face .mini-split-face').count(),1);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),1,'changing skin does not commit a game command');assert.deepEqual(await geometry(),slots);
  await page.locator('.sdk-memory-slot[data-motion-value="'+indices.other+'"] button').click();await page.locator('.sdk-memory-slot[data-motion-close]').first().waitFor();assert.equal(await page.locator('.sdk-memory-slot[data-motion-close]').count(),2,'both public mismatch faces take part in native closing');await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),0,'mismatch returns to opaque backs after the shared effect');assert.deepEqual(await geometry(),slots);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>memoryRenderer.frame.history.reviewing&&memoryRenderer.frame.projection.revision===0);assert.equal(await page.locator('.sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),0);await slider.press('ArrowRight');await page.waitForFunction(()=>memoryRenderer.frame.projection.revision===1);assert.equal(await page.locator('.sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),1);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);await slider.press('End');await page.waitForFunction(()=>memoryRenderer.frame.projection.revision===2);assert.equal(await page.locator('.sdk-memory-slot').count(),24,'history retains every original logical slot');assert(await page.evaluate(()=>keptMemorySlots.every((e,i)=>e===document.querySelectorAll('.sdk-memory-slot')[i])),'history uses the same keyed renderer');await page.locator('[data-command=history-close]:visible').first().click();
  await page.locator('.handoff [data-command=unlock]:visible,[data-command=pass-device]:not([disabled]):visible').first().waitFor();if(await page.locator('[data-command=pass-device]:not([disabled]):visible').count())await page.locator('[data-command=pass-device]:not([disabled]):visible').first().click();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();if(await page.getByRole('button',{name:'Без подсказок',exact:true}).isVisible())await page.getByRole('button',{name:'Без подсказок',exact:true}).click();await page.waitForFunction(()=>!memoryRenderer.frame.history.reviewing);
  await page.locator('.sdk-memory-slot[data-motion-value="0"] button').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===3);await page.locator('.sdk-memory-slot[data-motion-value="'+indices.mate+'"] button').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===4);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.sdk-memory-slot.is-matched').count(),2);assert.equal(await page.locator('.sdk-memory-slot.is-matched button:not([disabled])').count(),0);assert.equal(await page.locator('.sdk-memory-slot.is-matched').first().evaluate(e=>Number(getComputedStyle(e).opacity)),.4);assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);assert.deepEqual(await geometry(),slots);assert.deepEqual(errors,[]);
 }
});

test('native isolated card backs follow face-deck changes through the common skin gallery',{timeout:60000},async t=>{
 const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayerMode:'assigned',firstPlayer:0});PlayroomFirstTurnGuide.setEnabled('gofish',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.skinDeckRenderer=this;return update.call(this,frame);};});await page.locator('[data-start=gofish]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-collected-sets').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
 const read=()=>page.evaluate(()=>{
  const face=document.querySelector('.sdk-collected-sets .sdk-piece-card.is-hidden image'),assets=skinDeckRenderer.images.urls;
  return {actual:face?.getAttribute('href'),standard:[...assets].find(([file])=>file.endsWith('/standard-deck/back.svg'))?.[1].url,
   expected:[...assets].find(([file])=>file.endsWith('/mini-split-deck/back.svg'))?.[1].url};
 });
 const before=await read();
 assert(before.standard);
 assert.equal(before.actual,before.standard,'the active skin controls the stock even while another back is warming');
 const repeatedPrints=await page.evaluate(()=>{
  const renderer=window.skinDeckRenderer,paint=renderer.paintCard,stringify=JSON.stringify;
  let cards=0,owned=0,signatures=0;
  renderer.paintCard=function(element,card,label){
   if(!card||!Object.isFrozen(card))return paint.call(this,element,card,label);
   cards++;
   if(PlayroomProtocol.ownsImmutable(card))owned++;
   JSON.stringify=function(value,...args){
    if(Array.isArray(value)&&value[0]===card)signatures++;
    return stringify(value,...args);
   };
   try{return paint.call(this,element,card,label);}finally{JSON.stringify=stringify;}
  };
  try{renderer.update({...renderer.frame,now:renderer.frame.now+200});}
  finally{delete renderer.paintCard;}
  return {cards,owned,signatures};
 });
 t.diagnostic('Card print signatures on a clock-only update: '+JSON.stringify(repeatedPrints));
 assert.ok(repeatedPrints.cards>0,'the live field reuses published card descriptors');
 assert.equal(repeatedPrints.signatures,0,'the same published card does not need another paint signature');
 assert.equal(repeatedPrints.owned,repeatedPrints.cards,'the installed boundary owns the descriptors without copying them');
 await page.evaluate(()=>PlayroomAppearanceUI.show());await page.locator('[data-appearance-tab=components]').click();
 await page.locator('[data-skin-family=card-face][data-skin-variant=mini-split]').click();await page.locator('[data-appearance-apply]').click();
 await page.waitForFunction(()=>!document.querySelector('.appearance-gallery-modal'));
 const after=await read();
 assert.equal(after.actual,after.expected,'face printing and the closed stock use the same selected deck');
 assert.equal(after.standard,before.standard,'a skin change keeps the original back available in the field cache');
 assert.notEqual(after.actual,before.actual);assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move),0);
 const assets=await page.evaluate(()=>PlayroomPacks.exportView('gofish').assets);assert(Object.keys(assets).some(file=>file.endsWith('/mini-split-deck/back.svg')&&assets[file].startsWith('data:image/svg+xml;')),'isolated export exposes its validated public media through the native asset map');
});

test('native memory grid fits every preset across rotation without losing slots or public faces',{timeout:150000},async t=>{
 for(const preset of ['easy','medium','hard'])for(const deck of ['cartoon',52]){
  const page=await pageFor(t);await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(({preset,deck})=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,preset,deck,seed:17,firstPlayerMode:'assigned',firstPlayer:0});PlayroomFirstTurnGuide.setEnabled('pexeso',false);}, {preset,deck});await page.locator('[data-start=pexeso]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.sdk-paired-memory').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();const count={easy:16,medium:24,hard:36}[preset];
  for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:390,height:700},{width:844,height:390}]){await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const fit=await page.locator('.sdk-paired-memory').evaluate(grid=>{const field=grid.closest('.layout-field').getBoundingClientRect();return {count:grid.querySelectorAll('.sdk-memory-slot').length,overflow:[...grid.querySelectorAll('.sdk-memory-slot')].some(e=>{const r=e.getBoundingClientRect(),c=e.querySelector('.shared-card').getBoundingClientRect();return r.x<field.x-1||r.y<field.y-1||r.right>field.right+1||r.bottom>field.bottom+1||Math.abs(c.width-r.width)>1||Math.abs(c.height-c.width*1.4)>1;})};});assert.equal(fit.count,count);assert.equal(fit.overflow,false,JSON.stringify({preset,deck,viewport,fit}));if(preset==='medium'&&viewport.width===390&&viewport.height===700){const gap=page.locator('[data-grid-gap=center]');assert.equal(await gap.evaluate(e=>e.hidden),false,'a 24-card five-by-five layout reserves its original centre track');const centred=await gap.evaluate(e=>{const r=e.getBoundingClientRect(),g=e.parentElement.getBoundingClientRect();return Math.abs(r.x+r.width/2-g.x-g.width/2)<1&&Math.abs(r.y+r.height/2-g.y-g.height/2)<1;});assert(centred,'the optional blank belongs at the physical grid centre');}}
  const before=await page.locator('.sdk-memory-slot').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON()));await page.locator('.sdk-memory-slot button:not([disabled])').first().click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.deepEqual(await page.locator('.sdk-memory-slot').evaluateAll(nodes=>nodes.map(e=>e.getBoundingClientRect().toJSON())),before);assert.equal(await page.locator('.sdk-memory-face .sdk-piece-card:not(.is-hidden)').count(),1);await page.context().close();
 }
});


// The normal app, its history viewer and the shared animator consume the same
// authorized solitaire scene; this is deliberately not a studio-only check.
test('ordinary solitaire preserves native controls card geometry moves and history',{timeout:120000},async t=>{
 for(const game of ['klondike','spider']){
  const page=await pageFor(t),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(game=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,players:[{name:'Player'}],firstPlayer:0,firstPlayerMode:'assigned'});PlayroomFirstTurnGuide.setEnabled(game,false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.solitaireRenderer=this;return update.call(this,frame);};},game);
  await page.locator('[data-start='+game+']').first().click();const mode=page.locator('[data-game-mode=hotseat]');if(await mode.isVisible())await mode.click();await page.locator('[data-command=lobby-start]').click();await page.locator('.solitaire-board').waitFor();
  assert.equal(await page.locator('.solitaire-column').count(),game==='klondike'?7:10);assert.equal(await page.locator('.sdk-choice-panel:visible').count(),0);
  if(game==='klondike'){
   const back=page.locator('.solitaire-card .card-back-art image').first(),before=await back.getAttribute('href');
   assert(before);
   await page.evaluate(()=>PlayroomAppearanceUI.show());await page.locator('[data-appearance-tab=components]').click();
   await page.locator('[data-skin-family=card-face][data-skin-variant=mini-split]').click();await page.locator('[data-appearance-apply]').click();
   await page.locator('.appearance-gallery-modal').waitFor({state:'detached'});
   const selected=await page.evaluate(()=>[...solitaireRenderer.images.urls].find(([file])=>file.endsWith('/mini-split-deck/back.svg'))?.[1].url);
   assert(selected);assert.equal(await back.getAttribute('href'),selected);assert.notEqual(selected,before);
  }
  if(game==='klondike'){const slots=await page.locator('.solitaire-foundation').evaluateAll(nodes=>nodes.map(e=>({slot:e.getBoundingClientRect().width,print:e.firstElementChild.getBoundingClientRect().width})));assert.equal(slots.length,4);for(const slot of slots)assert(Math.abs(slot.slot-slot.print)<1,'the complete native foundation print fills its reserved card');assert(await page.locator('.solitaire-card.shared-red').count()>0);}
  const command=await page.evaluate(()=>solitaireRenderer.frame.projection.actions.find(a=>a.type==='move'&&a.source==='tableau'&&a.target==='tableau'));assert(command);await page.locator('.solitaire-columns [data-entity="card-'+command.card+'"]').click();const destination=page.locator('.solitaire-column[data-column="'+command.to+'"] [data-action]');const index=await destination.evaluateAll((nodes,command)=>nodes.findIndex(e=>PlayroomProtocol.canonical(JSON.parse(e.dataset.action))===PlayroomProtocol.canonical(command)),command);assert(index>=0);await destination.nth(index).click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  await page.locator('.solitaire-action-row [data-view-key=hint]').click();await page.locator('.solitaire-hint-popup').waitFor();const field=await page.locator('.layout-field').boundingBox();await page.locator('.solitaire-draw-control').click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===2);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.deepEqual(await page.locator('.layout-field').boundingBox(),field);
  const at=await page.locator('.solitaire-control[data-action]').evaluateAll(nodes=>nodes.findIndex(e=>JSON.parse(e.dataset.action).type==='undo'));assert(at>=0);await page.locator('.solitaire-control[data-action]').nth(at).click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===3);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>solitaireRenderer.frame.history.reviewing&&solitaireRenderer.frame.projection.revision===0);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);assert.equal(await page.locator('.solitaire-column').count(),game==='klondike'?7:10);
  const historyStats=page.locator('.game-frame-status .solitaire-stats,.table-status .solitaire-stats');
  if(game==='spider')assert.match(await historyStats.innerText(),/Действия\s*0/);
  await slider.press('End');await page.waitForFunction(()=>solitaireRenderer.frame.projection.revision===3);
  if(game==='spider')assert.match(await historyStats.innerText(),/Действия\s*3/);
  await page.locator('[data-command=history-close]:visible').first().click();await page.waitForFunction(()=>!solitaireRenderer.frame.history.reviewing);
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1280,height:900}]){await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.equal(await page.locator('.solitaire-draw-control:visible').count(),1,'one relocated control survives rotation');assert.equal(await page.locator('.solitaire-column').count(),game==='klondike'?7:10);}
  assert.deepEqual(errors,[]);await page.context().close();
 }
});


test('ordinary solitaire drags the whole native run and collects above existing home cards',{timeout:90000},async t=>{
 for(const fixture of ['run','collect']){
  const page=await pageFor(t),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.evaluate(fixture=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>{const s=create(id,{...options,players:[{name:'Player'}],seed:17,firstPlayer:0,firstPlayerMode:'assigned'});if(id==='klondike'){const d=s.data,cards=[...d.tableau.flat(),...d.stock],take=(rank,suit)=>({...cards.splice(cards.findIndex(c=>c.rank===rank&&c.suit===suit),1)[0],open:true});d.tableau=fixture==='run'?[[take(13,'♠'),take(12,'♥'),take(11,'♠')],[],[],[],[],[],[]]:[[take(3,'♥')],[take(2,'♥')],[take(4,'♥')],[],[],[],[]];d.foundations=fixture==='collect'?[[take(14,'♥')],[],[],[]]:[[],[],[],[]];d.stock=cards.map(c=>({...c,open:false}));TabletopCore.validateState(s);}return s;};PlayroomFirstTurnGuide.setEnabled('klondike',false);},fixture);
  await page.locator('[data-start=klondike]').first().click();const mode=page.locator('[data-game-mode=hotseat]');if(await mode.isVisible())await mode.click();await page.locator('[data-command=lobby-start]').click();await page.locator('.solitaire-board').waitFor();
  if(fixture==='run'){
   const emptySlot=page.locator('.solitaire-column[data-column="1"] .solitaire-empty');
   assert.equal(await emptySlot.evaluate(el=>getComputedStyle(el).borderTopStyle),'dashed','native empty columns keep their card outlines');
   const source=await page.locator('.solitaire-column[data-column="0"] [data-entity="card-♠13"]').boundingBox(),target=await page.locator('.solitaire-column[data-column="1"]').boundingBox();await page.mouse.move(source.x+source.width/2,source.y+3);await page.mouse.down();assert.equal(await page.locator('.playroom-drag-stack>.solitaire-card').count(),3,'the complete legal run lifts immediately');await page.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:6});await page.mouse.up();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move===1);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.locator('.solitaire-column[data-column="1"] [data-entity]').count(),3);assert.equal(await page.locator('.playroom-drag-ghost').count(),0);
  }else{
   await page.evaluate(()=>{
    const measure=Element.prototype.getBoundingClientRect,cloneNode=Node.prototype.cloneNode;
    let reads=0,topCopies=0,frozenTop;
    Node.prototype.cloneNode=function(...args){
     const copy=cloneNode.apply(this,args);
     if(this.matches?.('[data-motion-home="home-♥"][data-entity="card-♥14"]')&&this.closest('[data-motion-anchor="home-♥"]')){
      frozenTop=copy;
      topCopies++;
     }else if(this===frozenTop)topCopies++;
     return copy;
    };
    Element.prototype.getBoundingClientRect=function(...args){
     if(this.closest('[data-motion-anchor="home-♥"]')){
      const stack=new Error().stack;
      if(stack.includes('playTransfers'))reads++;
     }
     return measure.apply(this,args);
    };
    window.checkHomeTop=()=>document.querySelector('.playroom-motion-stack')?.firstElementChild===frozenTop;
    window.finishHomeMeasurements=()=>{
     Element.prototype.getBoundingClientRect=measure;
     Node.prototype.cloneNode=cloneNode;
     return {reads,topCopies,released:!!frozenTop&&!frozenTop.parentNode};
    };
   });
   const blank=await page.locator('.solitaire-scroll').boundingBox();await page.mouse.dblclick(blank.x+blank.width/2,blank.y+blank.height-20);await page.locator('.playroom-motion-flight[data-motion-kind=transfer]').first().waitFor();assert.equal(await page.locator('.playroom-motion-flight[data-motion-kind=transfer]').count(),3);const layers=await page.locator('.playroom-motion-layer').evaluate(e=>({sameNode:checkHomeTop(),held:e.querySelector('.playroom-motion-stack')?.dataset.motionAnchor,heldLabel:e.querySelector('.playroom-motion-stack')?.firstElementChild.getAttribute('aria-label'),flights:[...e.querySelectorAll('.playroom-motion-flight')].map(n=>({z:Number(n.style.zIndex),delay:n.getAnimations()[0].effect.getTiming().delay}))}));assert.equal(layers.held,'home-♥','the existing ace remains behind the arriving cards');assert.match(layers.heldLabel,/Туз/);assert(layers.flights.every((f,i)=>f.z>0&&(!i||f.delay>layers.flights[i-1].delay)),'each face arrives later and above the retained home top');await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();assert.equal(await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.foundations.flat().length),4);assert.equal(await page.locator('.playroom-motion-layer').count(),0);
   const measurements=await page.evaluate(()=>finishHomeMeasurements());
   t.diagnostic(JSON.stringify({sameNode:layers.sameNode,...measurements}));
   assert.equal(layers.sameNode,true,'the overlay borrows the frozen top itself');
   assert.deepEqual(measurements,{reads:1,topCopies:1,released:true},'one frozen top covers arrivals and is released after the flight');
  }
  assert.deepEqual(errors,[]);await page.context().close();
 }
});


// Planning and public playback share the trusted native arena component. No
// authority snapshot or generic command form participates in this UI path.
test('ordinary elemental arena keeps native plans ordered reveals and read-only history',{timeout:150000},async t=>{
 const page=await pageFor(t),errors=[];
 await page.evaluate(()=>{
  const authority=SessionAuthority.prototype,dispatch=authority._dispatch,snapshot=authority._snapshot;
  let dispatching=false;
  window.arenaDispatchSnapshots=[];
  authority._dispatch=function(...args){
   dispatching=true;
   try{return dispatch.apply(this,args);}finally{dispatching=false;}
  };
  authority._snapshot=function(viewer,...args){
   if(dispatching)arenaDispatchSnapshots.push({viewer,revision:this.revision});
   return snapshot.call(this,viewer,...args);
  };
  const prototype=PlayroomSDKSceneRenderer.prototype,capture=prototype.captureEntities;
  window.arenaFallbackCopies=0;
  prototype.captureEntities=function(){const snapshot=capture.call(this);arenaFallbackCopies+=snapshot.size;return snapshot;};
  window.arenaPhaseSounds=[];
  const play=PlayroomPlanPlayer.prototype.play;
  PlayroomPlanPlayer.prototype.play=function(plan,ports){
   if(!plan.id.startsWith('mage:')||!ports.group)return play.call(this,plan,ports);
   const markExit=index=>{
    const probe=window.arenaPhaseWait;
    if(probe?.run===plan.id&&index>probe.index&&probe.exitedAfterVisual===undefined)probe.exitedAfterVisual=probe.finished;
   };
   return play.call(this,plan,{...ports,group(index,group,context,...rest){
    markExit(index);
    const register=context.animation;
    context.animation=animation=>{
     if(!window.arenaPhaseWait&&group.cues.some(cue=>cue.kind==='sound')){
      const probe=window.arenaPhaseWait={run:plan.id,index,scene:group.scene,finished:false,soundWhileAnimating:false};
      // A concurrent visual may take longer than the authored minimum.
      animation.effect.updateTiming({duration:group.duration+1000});
      animation.finished.then(()=>{probe.finished=true;},()=>{});
     }
     return register(animation);
    };
    try{return ports.group(index,group,context,...rest);}finally{context.animation=register;}
   },final(...args){markExit(plan.groups.length);return ports.final?.(...args);}});
  };
  const batch=TabletopAudio.prototype.batch;
  TabletopAudio.prototype.batch=function(ids,options){
   for(const id of ids)if(id.startsWith('mage.'))
    arenaPhaseSounds.push({id,index:window.arenaRenderer?.publicFrameIndex,cancellable:!!options?.signal});
   const probe=window.arenaPhaseWait;
   if(probe?.scene===window.arenaRenderer?.publicFrameIndex&&ids.some(id=>id.startsWith('mage.'))&&!probe.finished)probe.soundWhileAnimating=true;
   return batch.call(this,ids,options);
  };
 });
 page.on('pageerror',error=>errors.push(error.message));
 await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned'});PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);const render=PlayroomSDKSceneRenderer.prototype.renderNativeArena;window.nativeArenaFrames=[];PlayroomSDKSceneRenderer.prototype.renderNativeArena=function(scene){window.arenaRenderer=this;const result=render.call(this,scene);if(Number.isInteger(this.publicFrameIndex)){const frame=this.sceneData.plan.scenes[this.publicFrameIndex];nativeArenaFrames.push({index:this.publicFrameIndex,kind:frame.kind,phase:frame.phase,overlay:!!this.surface.querySelector('.mage-phase-reveal')});}return result;};});
 await page.locator('[data-start=mage-brawl]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=lobby-start]').click();await page.locator('.mage-grid').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
 assert.equal(await page.locator('.sdk-arena,.sdk-simultaneous-controls,.sdk-choices:visible').count(),0);assert.equal(await page.locator('.mage-hand .mage-card').count(),4);assert.equal(await page.locator('.player-panel').count(),2);assert.equal(await page.locator('.mage-shrink-counter').count(),1,'native participant status is retained');const board=await page.locator('.mage-grid').boundingBox();assert(Math.abs(board.width-board.height)<1);
 await page.locator('.mage-rotate').last().click();assert.match(await page.locator('.mage-card.is-selected').getAttribute('data-tooltip-title'),/Вправо/);await page.locator('.mage-action-switch [data-view-value=attack]').click();assert.equal(await page.locator('.mage-action-switch [data-view-value=attack]').getAttribute('aria-pressed'),'true');assert.deepEqual(await page.locator('.mage-grid').boundingBox(),board);
 for(let n=0;n<2;n++){const before=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await page.locator('.mage-ready:not([disabled])').click();await page.waitForFunction(before=>PlayroomAppBridge.saveLibrary.current().session.current.move>before,before);}
 await page.waitForFunction(()=>nativeArenaFrames.some(frame=>frame.kind==='turn-reveal'),null,{timeout:30000});await page.locator('.table-shell>.scene[aria-busy=false]').waitFor({timeout:60000});await page.waitForFunction(()=>!arenaRenderer.publicState,null,{timeout:30000});const frames=await page.evaluate(()=>nativeArenaFrames);assert(frames.some(f=>f.kind==='turn-reveal'&&f.overlay),'the original public cards overlay the field');const firstReveal=frames.findIndex(f=>f.kind==='turn-reveal'),firstEffect=frames.findIndex(f=>f.kind==='effects');assert(firstEffect>firstReveal,'actions are revealed before their public movement/attack effects');assert.deepEqual(await page.locator('.mage-grid').boundingBox(),board);assert.equal(await page.locator('.mage-phase-reveal').count(),0);
 const {expected,live}=await page.evaluate(()=>({
  expected:arenaRenderer.sceneData.plan.groups.flatMap(group=>group.cues.filter(cue=>cue.kind==='sound')
   .flatMap(cue=>cue.sounds.map(id=>({id,index:group.scene,cancellable:true})))),
  live:arenaPhaseSounds
 }));
 assert(expected.length>0);
 assert.deepEqual(await page.evaluate(()=>arenaDispatchSnapshots),[],'a local commit publishes status without rendering any audience snapshot');
 assert.equal(await page.evaluate(()=>window.arenaFallbackCopies),0,'the authored plan owns movement and geometry');
 assert.deepEqual(live,expected,'each sound starts once inside its public visual phase');
 const phaseWait=await page.evaluate(()=>window.arenaPhaseWait);
 assert.equal(phaseWait?.soundWhileAnimating,true,'audio starts alongside the mounted visual effect');
 assert.equal(phaseWait?.exitedAfterVisual,true,'the next public phase waits for the finite visual effect');
 await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();
 const historySlider=page.locator('#replay-range');await historySlider.waitFor();
 const end=Number(await historySlider.getAttribute('max'));
 await historySlider.press('Home');
 await page.waitForFunction(()=>arenaRenderer.frame.history.index===0);
 assert.deepEqual(await page.evaluate(()=>arenaPhaseSounds),expected,'seeking backwards starts no new sound');
 await page.locator('[data-command=replay-play]').click();
 await page.waitForFunction(()=>arenaRenderer.frame.history.reviewing&&!!arenaRenderer.publicState);
 await page.locator('[data-command=replay-play]').click();
 const held=await page.evaluate(()=>({frame:arenaRenderer.publicFrameIndex,sounds:arenaPhaseSounds.length}));
 const paused=await page.evaluate(async()=>{await new Promise(resolve=>setTimeout(resolve,150));return {frame:arenaRenderer.publicFrameIndex,sounds:arenaPhaseSounds.length};});
 assert.deepEqual(paused,held,'the toolbar pauses the authored plan and its cues');
 await page.locator('[data-command=replay-play]').click();
 await page.waitForFunction(index=>arenaRenderer.frame.history.index===index&&!arenaRenderer.publicState,end);
 assert.deepEqual(await page.evaluate(()=>arenaPhaseSounds),[...expected,...expected],
  'history playback replays the same phases once');
 await page.locator('[data-command=history-close]:visible').first().click();
 // This visual fixture overrides the seed at creation. Use its complete
 // snapshot so a fresh browser can open the same authorized game state.
 const saved=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.export());
 const restored=await pageFor(t),{resumeSaved}=require('./browser-origin.cjs');
 await restored.evaluate(async saved=>{
  const session=TabletopSession.restore(TabletopCore,saved);
  await PlayroomAppBridge.saveLibrary.activateAsync(session,'arena-sound-restore');
  window.resumedArenaPhases=0;
  const plan=PlayroomPlanPlayer.prototype.play;
  PlayroomPlanPlayer.prototype.play=function(value,ports){
   if(value.id.startsWith('mage:')&&value.groups.length)resumedArenaPhases++;
   return plan.call(this,value,ports);
  };
 },saved);
 await resumeSaved(restored,'arena-sound-restore');
 await restored.locator('.mage-grid').waitFor();
 assert.equal(await restored.evaluate(()=>resumedArenaPhases),0,'a restored match opens on the settled frame');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('[data-game-menu]').click();await page.locator('[data-command=history]:visible').click();const slider=page.locator('#replay-range');await slider.waitFor();await slider.focus();await slider.press('Home');await page.waitForFunction(()=>arenaRenderer.frame.history.reviewing);assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);assert.equal(await page.locator('.mage-grid').count(),1);assert.equal(await page.locator('.sdk-board-grid').getAttribute('hidden'),'','history keeps the unused generic grid retired');
 assert.deepEqual(errors,[]);
});


test('saved arena history restores public ready markers while interactions stay disabled',async t=>{
 const UI=require('./browser-origin.cjs'),page=await pageFor(t);
 await page.evaluate(async()=>{
  PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);
  const session=new TabletopSession(TabletopCore,'mage-brawl',{
   actionsPerTurn:'2',differentActionTypes:'1',preset:'classic',seed:17,firstPlayerMode:'assigned',firstPlayer:0,
   players:[{name:'One'},{name:'Two'}],mode:'pass'
  });
  // Two plans complete the first player's public commitment. The second
  // player's first plan leaves the decision window open at revision three.
  for(const actor of [0,0,1]){
   const plan=TabletopCore.availableCommands(session.current,actor).find(c=>c.type==='plan');
   session.act(actor,{type:'plan',cardId:plan.cardId,action:plan.action,direction:plan.direction});
  }
  await PlayroomAppBridge.saveLibrary.activateAsync(session,'arena-ready-history');
 });
 await UI.resumeSaved(page,'arena-ready-history');
 const guide=page.getByRole('button',{name:'Без подсказок',exact:true});
 if(await guide.isVisible())await guide.click();
 const ready=page.locator('.player-panel.is-ready');
 await ready.first().waitFor();
 assert.equal(await ready.getAttribute('data-player-index'),'0');
 await UI.openHistory(page);
 const slider=page.locator('#replay-range');
 await slider.press('Home');
 await ready.waitFor({state:'hidden'});
 await slider.press('End');
 await ready.first().waitFor();
 assert.equal(await ready.getAttribute('data-player-index'),'0');
 assert.equal(await page.locator('[data-sdk-target]:not([disabled])').count(),0);
});

test('native elemental arena keeps eight players square field and illustrated memo across rotation',{timeout:90000},async t=>{
 const page=await pageFor(t),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
 await page.evaluate(()=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,options)=>create(id,{...options,seed:17,firstPlayer:0,firstPlayerMode:'assigned'});PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);});await page.locator('[data-start=mage-brawl]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.locator('[data-command=room-rules]').click();await require('./browser-origin.cjs').selectChoice(page.locator('#room-rules-form [name=preset]'),'teams4');await page.locator('#room-rules-form').evaluate(form=>form.requestSubmit());await page.locator('[data-room-cycle=seat-3]').waitFor();for(const seat of ['seat-3','seat-4','seat-5','seat-6','seat-7','seat-8']){await page.locator('[data-room-cycle="'+seat+'"]').click();await page.locator('[data-seat-choice=bot]').click();}await page.locator('[data-command=lobby-start]').click();await page.locator('.mage-grid').waitFor();if(await page.locator('.handoff [data-command=unlock]').isVisible())await page.locator('.handoff [data-command=unlock]').click();
 for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:844,height:390},{width:390,height:700}]){await page.setViewportSize(viewport);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const sizes=await page.evaluate(()=>{const grid=document.querySelector('.mage-grid').getBoundingClientRect(),field=document.querySelector('.layout-field').getBoundingClientRect(),hand=document.querySelector('.mage-hand').getBoundingClientRect(),cards=[...document.querySelectorAll('.mage-card')].map(e=>e.getBoundingClientRect());return {grid:{x:grid.x,y:grid.y,right:grid.right,bottom:grid.bottom,width:grid.width,height:grid.height},field:{x:field.x,y:field.y,right:field.right,bottom:field.bottom},hand:{x:hand.x,right:hand.right},cards:cards.map(c=>({x:c.x,right:c.right,width:c.width,height:c.height})),scrolling:document.documentElement.scrollWidth>innerWidth};});assert.equal(await page.locator('.player-panel').count(),8);assert.equal(await page.locator('.app-game-layout').getAttribute('data-inline-opponent-hands'),'false','hidden arena hands never take an empty roster column');assert.equal(await page.locator('.mage-piece').count(),8);assert(Math.abs(sizes.grid.width-sizes.grid.height)<1);assert(sizes.grid.x>=sizes.field.x-1&&sizes.grid.right<=sizes.field.right+1&&sizes.grid.y>=sizes.field.y-1&&sizes.grid.bottom<=sizes.field.bottom+1,JSON.stringify({viewport,sizes}));assert(sizes.cards.every(c=>Math.abs(c.width-c.height)<1&&c.x>=sizes.hand.x-1&&c.right<=sizes.hand.right+1),'square cards stay inside the native hand');assert.equal(sizes.scrolling,false);}
 await page.locator('[data-command=card-help]').click();await page.locator('.game-memo-modal .mage-memo-table').waitFor();assert.equal(await page.locator('.game-memo-modal .mage-memo-table tbody tr').count(),4);assert.equal(await page.locator('.game-memo-modal .mage-action-diagram').count(),12);assert.deepEqual(errors,[]);
});


test('ordinary elemental loot stays private and resumes through native base selection',{timeout:150000},async t=>{
 const env=await require('./sdk-installed.cjs').bootstrap({ids:['mage-brawl']}),E=env.engine,{prepareLoot,resolveLoot}=require('./fixtures/mage-arena.cjs');
 try{for(const finalDeath of [false,true]){
  const fixture=resolveLoot(E,prepareLoot(E.createGame('mage-brawl',{seed:17,actionsPerTurn:'1',players:[{name:'A'},{name:'B'},{name:'C'}]}),{finalDeath}));assert.equal(fixture.data.phase,'loot');for(const viewer of [-1,0,2])assert.equal(E.project(fixture,viewer).scene.playerChoices.choices.length,0,'other viewers receive no reward choice');const rewards=fixture.data.loot[0].cards.map(c=>c.id),page=await pageFor(t),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(fixture=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,o)=>{const s=create(id,{...o,seed:17});if(id==='mage-brawl'&&o.players?.length===3&&o.seed!==1)Object.assign(s,{data:structuredClone(fixture.data),turn:fixture.turn,status:fixture.status,winners:fixture.winners,rng:fixture.rng});return s;};PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);const update=PlayroomSDKSceneRenderer.prototype.update;PlayroomSDKSceneRenderer.prototype.update=function(frame){window.lootRenderer=this;return update.call(this,frame);};},fixture);
  await page.locator('[data-start=mage-brawl]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1'}});for(const [seat,name]of [['seat-2','B'],['seat-3','C']])b.roomService.setLocalSeat(r.id,r.ownerId,seat,{kind:'human',nickname:name});b.renderLobby();});await page.locator('[data-command=lobby-start]').click();await page.locator('.mage-grid').waitFor();
  const unlock=async()=>{const button=page.locator('.handoff [data-command=unlock]');if(await button.isVisible())await button.click();const optOut=page.getByRole('button',{name:'Без подсказок',exact:true});if(await optOut.isVisible())await optOut.click();};await unlock();
  const pickViewer=async owner=>{await unlock();if(await page.evaluate(()=>lootRenderer.readonly)){const pass=page.locator('[data-command=pass-device]:visible');assert.equal(await pass.count(),1,'the host handoff control survives native participant updates');await pass.click();await unlock();}if(await page.locator('.self-player').getAttribute('data-player-index')!==String(owner)){const endpoint=page.locator('[data-decision-player="'+owner+'"]:visible');assert(await endpoint.count(),JSON.stringify(await page.evaluate(owner=>({owner,viewer:lootRenderer.frame.projection.viewer,phase:lootRenderer.sceneData.arena.phase,window:lootRenderer.sceneData.arena.window,hotseat:lootRenderer.frame.ui.hotseat,readonly:lootRenderer.readonly,interaction:lootRenderer.frame.interaction,handoff:document.querySelector('.handoff')?.outerHTML,decisions:[...document.querySelectorAll('[data-decision-player]')].map(e=>e.dataset.decisionPlayer)}),owner)));await endpoint.click();await unlock();}await page.waitForFunction(owner=>lootRenderer.frame.projection.viewer===owner,owner);};
  const initialViewer=await page.evaluate(()=>lootRenderer.frame.projection.viewer);assert.equal(await page.locator('.mage-loot-hand').count(),initialViewer===1?1:0,'only the current recipient sees a reward control');await pickViewer(1);assert.equal(await page.locator('.mage-loot-hand').count(),1);
  for(const [actor,count]of [[1,7],[2,6]]){
   await pickViewer(actor);const open=page.locator('.mage-loot-hand [data-sdk-player-choice-trigger]');assert.equal(await page.locator('#modal-root').innerText(),'','no unrelated surface blocks the loot control');await open.click();const dialog=page.locator('dialog.card-choice-dialog');await dialog.waitFor();assert.equal(await dialog.locator('[data-card-index]').count(),count);assert.equal(await dialog.locator('[data-entity],[data-card-help-art],.mage-spell-art').count(),0,'reward faces and physical IDs stay outside the picker');
   for(const viewport of [{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(viewport);const box=await dialog.boundingBox(),card=await dialog.locator('[data-card-index]').first().boundingBox();assert(Math.abs(card.width-card.height)<1);assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1);}
   await page.setViewportSize({width:1000,height:800});const before=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await dialog.locator('[data-card-index="0"]').click();await page.waitForFunction(before=>PlayroomAppBridge.saveLibrary.current().session.current.move===before+1,before);await page.waitForFunction(revision=>lootRenderer.frame.projection.revision===revision,before+1);assert.equal(await dialog.count(),0);await page.locator('.table-shell>.scene[aria-busy=false]').waitFor();
  }
  const after=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current);assert.equal(after.data.phase,finalDeath?'planning':'respawn');assert.equal(after.data.loot?.length||0,0);assert.equal(after.data.players[0].pos,null);assert(after.data.players[1].hand.some(c=>rewards.includes(c.id))&&after.data.players[2].hand.some(c=>rewards.includes(c.id)),'each authorized recipient gets one actual reward');
  if(!finalDeath){await pickViewer(0);const targets=page.locator('.mage-cell.is-playable[data-action]');assert(await targets.count()>0);const command=await targets.first().evaluate(e=>JSON.parse(e.dataset.action));await targets.first().click();await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.phase==='planning'&&lootRenderer.frame.projection.revision===PlayroomAppBridge.saveLibrary.current().session.current.move);const revived=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.data.players[0]);assert.deepEqual(revived.pos,command.pos);assert.equal(revived.hand.length,8);assert.equal(revived.ultimate,1);await pickViewer(0);assert.equal(await page.locator('.mage-card').count(),8);assert.equal(await page.locator('.mage-piece[data-mage-player="0"]').count(),1);}
  assert.deepEqual(errors,[]);await page.context().close();
 }}finally{env.close();}
});


for(const sample of [{kind:'damage',element:'earth'},{kind:'death',element:'earth'},{kind:'fall',element:'air'},...['air','earth','water','fire'].map(element=>({kind:'move',element})),...['air','earth','water','fire'].map(element=>({kind:'attack',element})),...['air','earth','water','fire'].map(element=>({kind:'ultimate',element})),{kind:'shrink',element:'earth'}])test('native elemental effect '+sample.kind+' '+sample.element,{timeout:90000},async t=>{
 const page=await pageFor(t),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));const {prepareEffect}=require('./fixtures/mage-arena.cjs');await page.addScriptTag({content:'globalThis.prepareEffectFixture='+prepareEffect.toString()});
 await page.evaluate(sample=>{const create=TabletopCore.createGame;TabletopCore.createGame=(id,o)=>{const s=create(id,{...o,seed:17});if(id==='mage-brawl'&&o.seed!==1)prepareEffectFixture(s,sample);return s;};PlayroomFirstTurnGuide.setEnabled('mage-brawl',false);const render=PlayroomSDKSceneRenderer.prototype.renderNativeArena;window.elementalEffectFrames=[];PlayroomSDKSceneRenderer.prototype.renderNativeArena=function(scene){window.effectRenderer=this;const result=render.call(this,scene);if(Number.isInteger(this.publicFrameIndex)){const frame=this.sceneData.plan.scenes[this.publicFrameIndex],outcomes=frame.state?.outcomes||[],tokens=[...this.surface.querySelectorAll('.mage-piece')].map(e=>({player:Number(e.dataset.magePlayer),feedback:e.querySelector('.mage-token')?.dataset.publicFeedback,animations:e.getAnimations({subtree:true}).map(a=>a.animationName)})),panels=[...this.targetScope.querySelectorAll('.player-panel')].map(e=>({player:Number(e.dataset.playerIndex),feedback:e.dataset.publicFeedback,animations:e.getAnimations({subtree:true}).map(a=>a.animationName)}));elementalEffectFrames.push({kind:frame.kind,phase:frame.phase,outcomes,tokens,panels,trail:this.surface.querySelectorAll('.mage-trail').length,shield:this.surface.querySelectorAll('.mage-shield').length,attacks:this.surface.querySelectorAll('.mage-attack-'+window.effectSample.element).length});}return result;};window.effectSample=sample;},sample);
 await page.locator('[data-start=mage-brawl]').first().click();await page.locator('[data-game-mode=hotseat]').click();await page.evaluate(count=>{const b=PlayroomAppBridge,r=b.room();b.roomService.updateRules(r.id,r.ownerId,{...r.rules,options:{...r.rules.options,actionsPerTurn:'1',shrinkMode:'players'}});for(let i=1;i<count;i++)b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+(i+1),{kind:'human',nickname:'Actor '+i});b.renderLobby();},sample.kind==='shrink'?3:2);await page.locator('[data-command=lobby-start]').click();await page.locator('.mage-grid').waitFor();
 const unlock=async()=>{const b=page.locator('.handoff [data-command=unlock]');if(await b.isVisible())await b.click();const opt=page.getByRole('button',{name:'Без подсказок',exact:true});if(await opt.isVisible())await opt.click();};await unlock();
 for(let actor=0;actor<(sample.kind==='shrink'?3:2);actor++){
  if(await page.locator('.self-player').getAttribute('data-player-index')!==String(actor)){await page.locator('[data-decision-player="'+actor+'"]:visible').click();await unlock();}
  const action=actor===0&&!['move','shrink'].includes(sample.kind)?sample.kind==='ultimate'?'ultimate':'attack':'movement';await page.locator('.mage-action-switch [data-view-value="'+action+'"]').click();if(actor===0&&sample.kind!=='shrink')await page.locator('.mage-rotate').last().click();const revision=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.current().session.current.move);await page.locator('.mage-ready:not([disabled])').click();await page.waitForFunction(revision=>PlayroomAppBridge.saveLibrary.current().session.current.move>revision,revision);
 }
 await page.waitForFunction(()=>elementalEffectFrames.some(f=>f.kind==='effects'));await page.waitForFunction(()=>effectRenderer.motionPlayer.run?.done,{},{timeout:60000});const frames=await page.evaluate(()=>elementalEffectFrames);
 const evidence=process.env.PLAYROOM_EFFECT_EVIDENCE_DIR;
 if(evidence){
  fs.mkdirSync(evidence,{recursive:true});
  fs.writeFileSync(path.join(evidence,'effect-'+sample.kind+'-'+sample.element+'.json'),JSON.stringify(frames,null,2));
 }
 if(sample.kind==='move')assert(frames.some(f=>sample.element==='earth'?f.shield>0:f.trail>0),'the native movement trail or earth shield is rendered');else if(['attack','ultimate'].includes(sample.kind))assert(frames.some(f=>f.attacks>0),'the original elemental attack art is rendered');else{const flag=sample.kind==='shrink'?'fall':sample.kind,frame=frames.find(f=>f.outcomes.some(o=>o.player===1&&(flag==='damage'?o.damage>0:o[flag])));assert(frame,'the authoritative outcome is present');assert(frame.tokens.some(t=>t.player===1&&t.feedback?.includes(flag)),JSON.stringify(frame));assert(frame.panels.some(p=>p.player===1&&p.feedback?.includes(flag)),'the same feedback reaches the native participant card');if(['death','fall'].includes(sample.kind))assert(frame.tokens.some(t=>t.player===1&&t.animations.some(a=>a==='mage-'+flag)),'the original death/fall animation is active');if(sample.kind==='death')assert(frame.panels.some(p=>p.player===0&&p.feedback?.includes('killer')),'the killer participant is highlighted');}
 assert.deepEqual(errors,[]);
});

for(const skin of ['elements','playing'])test('101 plays a hand card without a duplicate button and enlarges its '+skin+' face',{timeout:60000},async t=>{
 const page=await pageFor(t);
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(skin=>{
  PlayroomFirstTurnGuide.setEnabled('one-oh-one',skin==='elements');
  const create=TabletopCore.createGame;
  TabletopCore.createGame=(id,options)=>{
   if(id!=='one-oh-one')return create(id,options);
   for(let seed=1;seed<=200;seed++){
    const state=create(id,{...options,skin,seed,firstPlayerMode:'assigned',firstPlayer:0});
    if(state.turn===0&&TabletopCore.availableCommands(state,0).some(c=>c.type==='play'&&c.card.startsWith('yellow-A-')))return state;
   }
   throw Error('Missing playable earth ace fixture');
  };
  const update=PlayroomSDKSceneRenderer.prototype.update;
  PlayroomSDKSceneRenderer.prototype.update=function(frame){
   frame.ui={...frame.ui,quickPlay:false};
   return update.call(this,frame);
  };
 },skin);
 await page.locator('[data-start=one-oh-one]').first().click();
 await page.locator('[data-game-mode=hotseat]').click();
 await page.locator('[data-command=lobby-start]').click();
 const hand=page.locator('.layout-hand [data-entity^="card-yellow-A-"].is-playable').first();
 const unlock=page.locator('.handoff [data-command=unlock]');
 if(await unlock.isVisible())await unlock.click();
 await hand.waitFor();
 const duplicates=page.locator('.layout-actions [data-action]');
 assert.equal(await duplicates.evaluateAll(nodes=>nodes.filter(n=>JSON.parse(n.dataset.action).type==='play').length),0);
 const guide=page.locator('.first-turn-guide:not([hidden])');
 const digest=img=>fetch(img.src).then(r=>r.arrayBuffer()).then(b=>crypto.subtle.digest('SHA-256',b)).then(hash=>Array.from(new Uint8Array(hash)));
 const expected=skin==='elements'?await hand.locator('img').evaluate(digest):await hand.locator('.mini-split-face').count();
 if(skin==='elements'){
  await guide.getByText('Выберите подходящую карту в руке.').waitFor({timeout:6000});
  const timing=await guide.locator('.guide-glove').evaluate(el=>el.getAnimations()[0].effect.getTiming());
  assert.equal(timing.duration,2200);assert.equal(timing.delay,450);
 }
 await hand.click();
 const drop=page.locator('.sdk-table-drop');
 if(skin==='elements'){
  await guide.getByText('Положите выбранную карту на стопку сброса.').waitFor({timeout:6000});
  const cursor=await guide.boundingBox(),target=await drop.boundingBox();
  assert(Math.abs(cursor.x-target.x-target.width/2)<2&&Math.abs(cursor.y-target.y-target.height/2)<2);
 }
 await page.evaluate(()=>{
  const animate=Element.prototype.animate;window.cardFlightSamples=[];
  Element.prototype.animate=function(frames,options){
   const animation=animate.call(this,frames,options);
   if(this.matches('.action-reveal-art.is-flying')){
    const art=this,host=art.closest('.action-reveal');
    const sample=()=>{
     const rect=art.getBoundingClientRect(),field=host.getBoundingClientRect();
     art.style.pointerEvents='auto';
     const probe=document.elementFromPoint(rect.x+rect.width/2,Math.min(innerHeight-1,rect.bottom-6));
     cardFlightSamples.push({crossing:rect.bottom>field.bottom+6,visible:art.contains(probe)});
     art.style.removeProperty('pointer-events');
     if(animation.playState==='running')requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
   }
   return animation;
  };
 });
 await drop.click();
 const enlarged=page.locator('.action-reveal-art');
 await enlarged.waitFor();
 if(skin==='elements'){
  assert.deepEqual(await enlarged.locator('img').evaluate(digest),expected);
 }else{
  assert(expected>0);
  assert(await enlarged.locator('.four-color-suit').count()>0);
  assert(await enlarged.locator('.mini-split-face').count()>0);
 }
 await page.waitForFunction(()=>cardFlightSamples.some(s=>s.crossing&&s.visible));
 const screenshotDir=process.env.PLAYROOM_SCREENSHOT_DIR;
 if(screenshotDir){
  await page.waitForFunction(()=>document.querySelector('.action-reveal-art:not(.is-flying)'));
  await page.screenshot({path:path.join(screenshotDir,'101-'+skin+'-reveal.png')});
 }
 await enlarged.waitFor({state:'hidden'});
 const samples=await page.evaluate(()=>cardFlightSamples);
 assert(samples.some(s=>!s.crossing&&s.visible));
 assert(samples.filter(s=>s.crossing).every(s=>s.visible));
 await page.waitForFunction(()=>PlayroomAppBridge.saveLibrary.current().session.current.move>0);
});
