'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),root=path.resolve(__dirname,'..');
test('canonical art scales borders and glyphs uniformly, while compact remains optional',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});try{
  const page=await browser.newPage({viewport:{width:800,height:600}});await page.setContent('<div id="fixture"></div>');await page.addStyleTag({content:fs.readFileSync(root+'/core/ui.css','utf8')});await page.addScriptTag({content:fs.readFileSync(root+'/core/component-assets.js','utf8')});await page.addScriptTag({content:fs.readFileSync(root+'/core/game-components.js','utf8')});await page.addScriptTag({content:fs.readFileSync(root+'/core/ui.js','utf8')});
  await page.evaluate(()=>{const H=TabletopUI.helpers,art={main:'<div class="test-face" style="box-sizing:border-box;width:72px;height:103px;border:5px solid black"><span style="font-size:30px">7</span></div>',width:72,height:103};document.getElementById('fixture').innerHTML=`<div id="large" style="width:144px;height:206px">${H.art(art)}</div><div id="small" style="width:36px;height:51.5px">${H.art(art,'compact')}</div><div id="wide" style="width:72px;height:160px">${H.art(art)}</div>`;});
  const sizes=await page.evaluate(()=>Object.fromEntries(['large','small','wide'].map(id=>{const face=document.querySelector('#'+id+' .test-face').getBoundingClientRect(),glyph=document.querySelector('#'+id+' span').getBoundingClientRect();return [id,{width:face.width,height:face.height,glyph:glyph.height,variant:document.querySelector('#'+id+' svg').dataset.artVariant}];})));
  assert.ok(Math.abs(sizes.large.width/sizes.small.width-4)<.01);assert.ok(Math.abs(sizes.large.height/sizes.small.height-4)<.01);assert.ok(Math.abs(sizes.large.glyph/sizes.small.glyph-4)<.01);assert.ok(Math.abs(sizes.wide.width/sizes.wide.height-72/103)<.001);assert.equal(sizes.small.variant,'main');
 }finally{await browser.close();}
});

test('authority default clock binds browser timers and cancels bot callbacks',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});try{
  const page=await browser.newPage();await page.setContent('<main>Clock regression</main>');
  for(const file of ['core/random.js','core/engine.js','core/model-values.js','core/history.js','core/session-codec.js','core/session.js','core/protocol.js','core/command-processor.js','core/authority.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  const result=await page.evaluate(async()=>{
   TabletopCore.register({id:'clock-fixture',name:'Clock',min:2,max:2,presets:[{id:'standard',label:'Standard'}],rules:[],create:s=>{s.data={};},legal:()=>[{type:'next'}],apply:s=>{s.turn=1;}});
   const session=new TabletopSession(TabletopCore,'clock-fixture',{players:[{name:'Bot',bot:true},{name:'Human'}]});
   const authority=new SessionAuthority(session),errors=[];
   authority.scheduleBot({delay:0,onError:e=>errors.push(e.message)});authority.cancelBot();
   await new Promise(resolve=>setTimeout(resolve,40));const cancelled=session.current.move;
   authority.scheduleBot({delay:0,onError:e=>errors.push(e.message)});
   await new Promise(resolve=>setTimeout(resolve,80));const moved=session.current.move;authority.dispose();
   return {cancelled,moved,errors};
  });
  assert.deepEqual(result,{cancelled:0,moved:1,errors:[]});
 }finally{await browser.close();}
});
