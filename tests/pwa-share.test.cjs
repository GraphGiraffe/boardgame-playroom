'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=['core/messages.js','application/pwa-update-coordinator.js','app/pwa.js'].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
function pwa(protocol,{canShare=()=>true}={}){
  const shareCalls=[];
  const context={isSecureContext:protocol==='https:',location:{protocol,hostname:protocol==='https:'?'example.test':'',href:protocol==='https:'?'https://example.test/playroom/':'content://test/playroom'},
    document:{addEventListener(){}},
    navigator:{share:async payload=>{shareCalls.push(payload);},canShare},
    matchMedia:()=>({matches:false}),
    PlayroomPairing:{decode:()=>({kind:'offer'}),shareText:()=> 'PR3.TEST',protocolUrl:()=> 'web+playroom:pair/PR3.TEST',extract:()=>null},
    addEventListener(){},dispatchEvent(){},URL,Set,Promise};
  context.globalThis=context;vm.runInNewContext(source,context,{filename:'pwa.js'});
  return {pwa:context.PlayroomPWA,shareCalls};
}
test('Android content:// never advertises system Share even if navigator.share exists',async()=>{
  const ctx=pwa('content:');assert.equal(ctx.pwa.canShare(),false);
  assert.equal(ctx.pwa.canShare('PR3.TEST'),false);
  await assert.rejects(ctx.pwa.shareToken('PR3.TEST'),/недоступно/i);
  assert.equal(ctx.shareCalls.length,0);
});
test('HTTPS share requires a supported exact payload before advertising an action',async()=>{
  const blocked=pwa('https:',{canShare:()=>false});
  assert.equal(blocked.pwa.canShare('PR3.TEST'),false);
  await assert.rejects(blocked.pwa.shareToken('PR3.TEST'),/недоступно/i);
  const allowed=pwa('https:');allowed.pwa && await allowed.pwa.shareToken('PR3.TEST');
  assert.equal(allowed.shareCalls.length,1);
  assert.match(allowed.shareCalls[0].url,/https:\/\/example\.test\/playroom\/\?pair=/);
});
