'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
test('durable local payloads migrate, survive failures and report their sizes',{timeout:120000},async()=>{
 const server=await serveBrowserFixture(path.resolve(__dirname,'..'));
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{localStorage.setItem('playroom.player-profile.v1',JSON.stringify({version:1,id:'storage-test',name:'Тест',createdAt:1,updatedAt:1}));localStorage.setItem('playroom.settings.v1',JSON.stringify({sound:false}));});
  await page.goto(process.env.PLAYROOM_TEST_ARTIFACT||server.url);await page.locator('.game-tile').first().waitFor();
  assert.equal(await page.evaluate(async()=>{
   const legacy=new Map([['playroom.session.v1','original bytes']]);const storage={get length(){return legacy.size;},key:i=>[...legacy.keys()][i],getItem:k=>legacy.get(k)??null,removeItem:k=>legacy.delete(k)};
   const broken={open(...args){const r=indexedDB.open(...args);r.addEventListener('success',()=>{const db=r.result,transaction=db.transaction.bind(db);db.transaction=(stores,mode,...args)=>{const tx=transaction(stores,mode,...args);if(mode==='readwrite')queueMicrotask(()=>tx.abort());return tx;};});return r;}};
   const failed=new PlayroomDataStorage({name:'migration-failure',legacy:storage,indexedDB:broken});let rejected=false;try{await failed.open();}catch(_){rejected=true;}finally{failed.db?.close();}
   if(!rejected||legacy.get('playroom.session.v1')!=='original bytes')return false;
   const retried=await new PlayroomDataStorage({name:'migration-failure',legacy:storage}).open();const ok=retried.getItem('playroom.session.v1')==='original bytes'&&!legacy.size;retried.db.close();return ok;
  }),true,'failed migration preserves legacy bytes and can be retried');
  const original=await page.evaluate(async()=>{
   const library=new PlayroomLibrary(()=>localStorage,TabletopCore,TabletopSession,PlayroomPacks);
   const session=new TabletopSession(TabletopCore,'uno',{seed:17,mode:'solo',players:[{name:'Тест'},{name:'Бот',bot:true}]});
   const raw=library.encode(session,'migration-test');localStorage.setItem('playroom.session.v1',raw);localStorage.setItem('playroom.paused.v1.archive',raw.replace('"libraryId":"migration-test"','"libraryId":"archive"'));
   localStorage.setItem('playroom.packs.v1',PlayroomData.getItem('playroom.packs.v1'));
   await PlayroomData.queue;PlayroomData.db.close();await new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('playroom.data.v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);});return raw;
  });
  await page.reload();await page.locator('.game-tile').first().waitFor();
  assert.deepEqual(await page.evaluate(()=>({raw:PlayroomData.getItem('playroom.session.v1'),old:localStorage.getItem('playroom.session.v1'),packs:PlayroomPacks.list().length,ids:new PlayroomLibrary(()=>PlayroomData,TabletopCore,TabletopSession,PlayroomPacks).list().map(r=>r.id).sort()})),{raw:original,old:null,packs:15,ids:['archive','migration-test']});
  assert.equal(await page.evaluate(async()=>{
   const library=new PlayroomLibrary(()=>PlayroomData,TabletopCore,TabletopSession,PlayroomPacks),before=PlayroomData.getItem('playroom.session.v1'),names=PlayroomPacks.list().map(p=>p.id+'@'+p.version).join();
   const transaction=PlayroomData.db.transaction.bind(PlayroomData.db);PlayroomData.db.transaction=(stores,mode,...args)=>{const tx=transaction(stores,mode,...args);if(mode==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
   let failures=0;try{await library.activateAsync(library.open('migration-test'),'next');}catch(_){failures++;}try{await PlayroomPacks.remove('uno');}catch(_){failures++;}
   PlayroomData.db.transaction=transaction;
   if(failures!==2||PlayroomData.getItem('playroom.session.v1')!==before||PlayroomData.getItem('playroom.paused.v1.migration-test')!==null||PlayroomPacks.list().map(p=>p.id+'@'+p.version).join()!==names)return false;
   await library.activateAsync(library.open('migration-test'),'next');return library.current().id==='next'&&library.records().some(r=>r.id==='migration-test');
  }),true);
  assert.equal(await page.evaluate(async()=>{await PlayroomData.put('playroom.paused.v1.capacity','x'.repeat(6*1024*1024));return (await PlayroomData.usage()).saves>6*1024*1024;}),true);
  await page.reload();await page.locator('.game-tile').first().waitFor();
  assert.equal(await page.evaluate(()=>PlayroomData.getItem('playroom.paused.v1.capacity').length),6*1024*1024);
  await page.evaluate(()=>PlayroomData.transact(()=>PlayroomData.removeItem('playroom.paused.v1.capacity')));
  await page.locator('[data-command="packs"]').first().click();await page.locator('.storage-usage strong').waitFor();
  assert.match(await page.locator('.storage-usage-labels>span').first().getAttribute('aria-label'),/Приложение:/);assert.equal(await page.locator('.storage-usage-summary [data-ui-icon=app]').count(),1);assert.equal(await page.locator('.storage-usage-labels [data-ui-icon=gear]').count(),1);
  assert.match(await page.locator('.pack-list .pack-version').first().innerText(),/КБ|МБ/);
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.locator('.pack-manager-modal').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);if(process.env.PLAYROOM_STORAGE_SCREENSHOTS)await page.screenshot({path:path.join(process.env.PLAYROOM_STORAGE_SCREENSHOTS,`storage-${width}.png`)});}
  await page.locator('#modal-root [data-command="close-modal"]').first().click();
  await page.locator('[data-start="tictactoe"]').first().click();
  await page.locator('[data-command="lobby-start"]').click();await page.locator('.table-shell').waitFor();
  assert.equal(await page.evaluate(()=>JSON.parse(PlayroomData.getItem('playroom.session.v1')).game),'tictactoe','UI start publishes the new game after its durable commit');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await server.close();}
});
