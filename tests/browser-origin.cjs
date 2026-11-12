'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');

// Browser storage for file:// is implementation-dependent and may disappear
// between reloads. Persistent-save regressions must run at a stable origin.
async function serveBrowserFixture(root){
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.png':'image/png'};
  const server=http.createServer((req,res)=>{
    let relative;
    try { const u=new URL(req.url,'http://localhost');relative=decodeURIComponent(u.pathname==='/'?'index.html':u.pathname.slice(1)); }
    catch(_){res.writeHead(400);res.end();return;}
    const file=path.resolve(root,relative);
    const allowed=relative==='index.html'||/^installed-packs(?:\.[a-f0-9]{16})?\.js$/.test(relative)||relative==='manifest.webmanifest'||relative==='sw.js'||['core/messages.js','app/','core/','application/','presentation/','platform/','packs/','icons/'].some(prefix=>relative.startsWith(prefix));
    if(!allowed||!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
      res.writeHead(404);res.end();return;
    }
    res.writeHead(200,{'Content-Type':(types[path.extname(file)]||'application/octet-stream')+'; charset=utf-8','Cache-Control':'no-store'});
    res.end(fs.readFileSync(file));
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
// Exercise either the legacy list or its discrete range replacement by semantic ID.
async function selectChoice(locator,value){
  if(await locator.evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>n.matches('input[type=radio]')))){
    const values=await locator.evaluateAll(nodes=>nodes.map(n=>n.value)),index=values.indexOf(String(value));
    if(index<0)throw Error('Choice is unavailable: '+value);
    const target=locator.nth(index);
    if(await target.isVisible()){await target.check();return;}
    const field=locator.first().locator('xpath=ancestor::fieldset[@data-rule-field][1]');
    const current=await locator.evaluateAll(nodes=>nodes.findIndex(n=>n.checked));
    if(!await field.locator('.rule-choice-stepper').count())throw Error('Choice is not visible: '+value);
    for(let i=0;i<Math.abs(index-current);i++)await field.locator('[data-rule-step="'+(index>current?1:-1)+'"]').click();
    if(await readChoice(locator)!==String(value))throw Error('Counter did not select: '+value);
    return;
  }
  if(await locator.evaluate(e=>e.tagName==='SELECT'))return locator.selectOption(value);
  const index=await locator.evaluate((e,value)=>JSON.parse(e.dataset.choiceOptions).findIndex(o=>o.value===value),value);
  if(index<0)throw Error('Choice is unavailable: '+value);
  await locator.focus();await locator.press('Home');for(let i=0;i<index;i++)await locator.press('ArrowRight');
  await locator.dispatchEvent('change');
}
async function readChoice(locator){if(await locator.evaluateAll(nodes=>nodes.length>0&&nodes.every(n=>n.matches('input[type=radio]'))))return locator.evaluateAll(nodes=>nodes.find(n=>n.checked)?.value);return locator.evaluate(e=>e.dataset.choiceOptions?JSON.parse(e.dataset.choiceOptions)[Number(e.value)].value:e.value);}
// Current native entry points. These helpers deliberately fail when a control
// disappears instead of rewriting selectors or invoking application actions.
const activeSurface=page=>page.locator('#modal-root>[data-surface-state="active"]');
async function ready(page){await page.waitForFunction(()=>!!globalThis.PlayroomAppBridge?.saveLibrary);}
async function currentSession(page){
  await ready(page);
  return page.evaluate(async()=>{const library=PlayroomAppBridge.saveLibrary;await library.storage().queue;return library.current()?.session.export()||null;});
}
async function currentState(page){const session=await currentSession(page);return session?.states.at(-1)||null;}
async function openGame(page,game,mode='hotseat'){
  await ready(page);
  await page.locator('[data-hub-page="games"]').click();
  await page.locator('[data-start="'+game+'"]').click();
  await activeSurface(page).locator('[data-game-mode="'+mode+'"]').click();
  await activeSurface(page).locator('.room-v021').waitFor();
  return activeSurface(page);
}
async function openSettings(page){
  await ready(page);
  if(await page.locator('.table-shell').count()){
    if(!await activeSurface(page).locator('.game-menu-panel').count())await page.locator('.table-shell [data-game-menu]').click();
    const command=await page.locator('.table-shell').evaluate(shell=>shell.classList.contains('network-game')?'preferences':'settings');
    await activeSurface(page).locator('[data-game-menu-action][data-command="'+command+'"]').click();
  }else if(await activeSurface(page).locator('.room-v021').count()){
    await activeSurface(page).locator('.modal-head [data-command="close-modal"]').click();
    await page.locator('[data-hub-page="profile"]').click();
    await page.locator('#hub-profile-page [data-command="settings"]').click();
  }else{
    await page.locator('[data-hub-page="profile"]').click();
    await page.locator('#hub-profile-page [data-command="settings"]').click();
  }
  await activeSurface(page).locator('[data-settings-screen]').waitFor();
  return activeSurface(page);
}
async function openPacks(page){
  await ready(page);
  await page.locator('[data-hub-page="profile"]').click();
  await page.locator('#hub-profile-page [data-command="packs"]').click();
  await activeSurface(page).locator('.pack-manager-modal').waitFor();
  return activeSurface(page);
}
async function resumeSaved(page,id=null,{unlock=true}={}){
  await ready(page);
  if(!await page.locator('.table-shell').count()){
    if(id===null)id=await page.evaluate(()=>PlayroomAppBridge.saveLibrary.currentId());
    if(!id)throw Error('No saved current session to resume');
    await page.locator('[data-hub-page="sessions"]').click();
    await page.locator('.saved-game[data-session-id="'+id+'"]').click();
    await activeSurface(page).locator('[data-resume-id="'+id+'"]').click();
    await page.locator('.table-shell').waitFor();
  }
  if(id!==null&&await page.evaluate(()=>PlayroomAppBridge.saveLibrary.currentId())!==id)throw Error('The opened table does not match the requested saved session');
  if(unlock&&await page.locator('.handoff [data-command="unlock"]').count())await page.locator('.handoff [data-command="unlock"]').click();
}
async function closeToGame(page){
 if(!await page.locator('.table-shell').count())throw Error('A live table is required');
 for(let depth=0;depth<4;depth++){
  const active=activeSurface(page);if(!await active.count())return;
  const menu=active.locator('.modal-head [data-game-menu-close]');
  if(await menu.count())await menu.click();
  else{
   if(!await active.locator('[data-settings-screen],.rules-modal,.rulebook-modal,.appearance-gallery-modal,.card-help-modal').count())throw Error('Unexpected surface while returning to game');
   await active.locator('.modal-head [data-command=close-modal]').click();
  }
 }
 if(await activeSurface(page).count())throw Error('Game dialog stack did not close');
}
async function openHistory(page){
 await ready(page);if(!await activeSurface(page).locator('.game-menu-panel').count())await page.locator('.table-shell [data-game-menu]').click();
 await activeSurface(page).locator('[data-game-menu-action][data-command=history]').click();
 await page.locator('#replay-range').waitFor();
}
module.exports={serveBrowserFixture,selectChoice,readChoice,activeSurface,ready,currentSession,currentState,openGame,openSettings,openPacks,resumeSaved,closeToGame,openHistory};
