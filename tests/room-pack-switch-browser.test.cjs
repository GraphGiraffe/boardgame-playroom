'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const {serveBrowserFixture}=require('./browser-origin.cjs');
const root=path.resolve(__dirname,'..');
test('screen:phone:portrait room pack selection prioritizes humans, rejects overcrowding and hides network solo',{timeout:45000},async()=>{
 const server=await serveBrowserFixture(root);let browser;
 try{
  browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage({viewport:{width:390,height:740},hasTouch:true}),errors=[];page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.url);await require('./browser-origin.cjs').ready(page);if(await page.locator('#profile-form').count()){await page.locator('#profile-form [name=playerName]').fill('Иван');await page.locator('#profile-form').evaluate(f=>f.requestSubmit());}
  await page.locator('[data-start=uno]').first().click();await page.locator('[data-game-mode=hotseat]').click();
  const human=await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();for(const s of r.seats){const p=r.participants.find(p=>p.id===s.participantId);if(p?.bot)b.roomService.setLocalSeat(r.id,r.ownerId,s.id,{kind:'empty'});}
   b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'bot',nickname:'Мика'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-3',{kind:'bot',nickname:'Лис'});b.roomService.setLocalSeat(r.id,r.ownerId,'seat-'+r.seats.length,{kind:'human',nickname:'Кира'});b.renderLobby();return b.room().participants.find(p=>p.nickname==='Кира').id;});
  await page.locator('[data-command=room-change-game]').click();await page.locator('[data-room-game=checkers]').click();
  let after=await page.evaluate(()=>PlayroomAppBridge.room());assert.equal(after.game.id,'checkers');assert.equal(after.seats.length,2);assert.equal(after.participants.filter(p=>p.bot).length,0);assert.equal(after.seats[1].participantId,human);
  await page.locator('[data-command=room-change-game]').click();await page.locator('[data-room-game=uno]').click();
  after=await page.evaluate(()=>PlayroomAppBridge.room());assert.equal(after.participants.filter(p=>p.bot).length,0,'expansion never invents extra bots');
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.setLocalSeat(r.id,r.ownerId,'seat-2',{kind:'empty'});b.roomService.configure(r.id,r.ownerId,{transportMode:'network'});
   for(const [id,seat] of [['qa-anna','seat-2'],['qa-maria','seat-4']]){b.roomService.join(r.id,{id,nickname:id});b.roomService.claimSeat(r.id,id,seat);}b.renderLobby();
   // A view-only synthetic solo fixture tests filtering without implementing or installing Klondike.
   TabletopCore.register({...TabletopCore.get('checkers'),id:'qa-solo',name:'Соло-фикстура',min:1,max:1,version:'0.0.1'});
   PlayroomViews.register('qa-solo',()=>'',()=>'',{surfaces:{player:()=>'',table:()=>''}});
  });
  const before=await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room()));
  await page.locator('[data-command=room-change-game]').click();assert.equal(await page.locator('[data-room-game=qa-solo]').count(),0);
  await page.locator('[data-room-game=checkers]').click();assert.equal(await page.evaluate(()=>JSON.stringify(PlayroomAppBridge.room())),before);
  assert.match(await page.locator('.toast').innerText(),/игроков: 3.*мест: 2/i);
  await page.locator('[data-command=dismiss-notice]').click();
  await page.locator('#modal-root>[data-surface-state=active] .modal-head [data-command=close-modal]').click();
  await page.evaluate(()=>{const b=PlayroomAppBridge,r=b.room();b.roomService.kick(r.id,r.ownerId,'qa-anna');b.roomService.kick(r.id,r.ownerId,'qa-maria');b.roomService.configure(r.id,r.ownerId,{transportMode:'hotseat'});b.renderLobby();});
  await page.locator('[data-command=room-change-game]').click();assert.equal(await page.locator('[data-room-game=qa-solo]').count(),1,'solo is offered in local rooms');
  assert.deepEqual(errors,[]);
 }finally{await browser?.close();await server.close();}
});
