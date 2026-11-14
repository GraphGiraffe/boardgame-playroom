'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs'),root=path.resolve(__dirname,'..');
test('canonical SVG art scales borders and glyphs uniformly with authored aspect ratio',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});try{
  const page=await browser.newPage({viewport:{width:800,height:600}});await page.setContent('<div id="fixture"></div>');await page.addStyleTag({content:fs.readFileSync(root+'/core/ui.css','utf8')});await page.addScriptTag({content:fs.readFileSync(root+'/core/vector-art.js','utf8')});
  await page.evaluate(()=>{const art=PlayroomVectorArt.viewport({width:72,height:103,content:'<rect data-face x="2.5" y="2.5" width="67" height="98" fill="none" stroke="black" stroke-width="5"/><text x="36" y="55" text-anchor="middle" font-size="30">7</text>'});document.getElementById('fixture').innerHTML=['large','small','wide'].map((id,i)=>`<div id="${id}" style="width:${[144,36,72][i]}px;height:${[206,51.5,160][i]}px">${art}</div>`).join('');});
  const sizes=await page.evaluate(()=>Object.fromEntries(['large','small','wide'].map(id=>{const face=document.querySelector('#'+id+' [data-face]'),r=face.getBoundingClientRect(),glyph=document.querySelector('#'+id+' text').getBoundingClientRect();return [id,{width:r.width,height:r.height,glyph:glyph.height,glyphFont:parseFloat(getComputedStyle(document.querySelector('#'+id+' text')).fontSize)*face.getScreenCTM().a,stroke:parseFloat(getComputedStyle(face).strokeWidth)*face.getScreenCTM().a,aspect:document.querySelector('#'+id+' svg').getAttribute('preserveAspectRatio')}];})));
  for(const dimension of ['width','height','glyphFont','stroke'])assert.ok(Math.abs(sizes.large[dimension]/sizes.small[dimension]-4)<.01,dimension+' uses one uniform scale: '+JSON.stringify(sizes));
  // Chromium rounds glyph ink boxes at small device sizes; font and geometry CTMs remain exact.
  assert.ok(Math.abs(sizes.large.glyph-4*sizes.small.glyph)<=2);
  assert.ok(Math.abs(sizes.wide.width/sizes.wide.height-67/98)<.001);assert.equal(sizes.wide.aspect,'xMidYMid meet');
 }finally{await browser.close();}
});

test('authority default clock binds browser timers and cancels bot callbacks',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox']});try{
  const page=await browser.newPage();await page.setContent('<main>Clock regression</main>');
  for(const file of ['core/messages.js','core/random.js','presentation/network-projection.js','core/engine.js','core/model-values.js','core/events.js','core/bot-difficulty.js','core/model-runtime.js','presentation/localization.js','presentation/scene-contract.js','core/model-registration.js','core/history.js','core/session-codec.js','core/session.js','core/protocol.js','core/player-controls.js','core/command-processor.js','core/authority.js'])await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
  await page.evaluate(()=>{globalThis.PlayroomPack={adaptModel:spec=>PlayroomModelRegistration.adapt(TabletopCore,spec)};});
  await page.addScriptTag({content:require('./pack-fixture.cjs').rules({id:'clock-fixture'})});
  const result=await page.evaluate(async()=>{
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
