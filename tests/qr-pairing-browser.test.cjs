'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');
const files=['core/messages.js','app/vendor/qrcode.js','app/vendor/jsqr.js','app/acoustic-pairing.js','app/pairing.js','app/qr-scanner.js'];
test('offline jsQR decodes a REAL PR3 QR from a camera-style PNG without BarcodeDetector or CDN', {timeout:45000},async()=>{
  const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
  const page=await browser.newPage();
  try{
    await page.setContent('<!doctype html><html><head></head><body><canvas id="canvas"></canvas></body></html>');
    for(const file of files)await page.addScriptTag({content:fs.readFileSync(path.join(root,file),'utf8')});
    const result=await page.evaluate(async()=>{
      // Browser's native BarcodeDetector may be present on Android, but this
      // test verifies offline pure JS decoding independently.
      const oldDetector=globalThis.BarcodeDetector;
      globalThis.BarcodeDetector=undefined;
      try{
        const fingerprint=Array(32).fill('AB').join(':');
        const sdp=['v=0','a=ice-ufrag:abcd','a=ice-pwd:abcdefghijklmnopqrstuvwx',
          'a=fingerprint:sha-256 '+fingerprint,
          'a=candidate:1 1 UDP 2122260223 192.168.1.44 53001 typ host',''].join('\r\n');
        const signal=JSON.stringify({v:1,type:'offer',sdp,pairingId:'123e4567-e89b-12d3-a456-426614174000'});
        const token=PlayroomPairing.fromSignal('offer',signal,{address:'192.168.1.44',port:53001});
        if(!token.startsWith('PR3.'))throw Error('Fixture must use compact PR3');
        const qr=qrcode(0,'L');qr.addData(PlayroomPairing.protocolUrl(token),'Byte');qr.make();
        const svg=qr.createSvgTag({cellSize:10,margin:5,scalable:true});
        const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();
        const canvas=document.getElementById('canvas');canvas.width=650;canvas.height=650;
        const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,650,650);
        ctx.drawImage(image,20,20,610,610);
        const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        const file=new File([blob],'camera.png',{type:'image/png'});
        const scanned=await PlayroomQRScanner.scan(file);
        return {original:token,scanned:scanned.token,kind:scanned.kind,method:scanned.method,
          size:file.size,source:scanned.ip,hasQr:typeof qrcode==='function'};
      }finally{globalThis.BarcodeDetector=oldDetector;}
    });
    assert.equal(result.original,result.scanned);
    assert.equal(result.kind,'offer');assert.equal(result.method,'jsQR');
    assert.equal(result.source,'192.168.1.44');
    assert.ok(result.hasQr&&result.size>1000);
  }finally{await page.close();await browser.close();}
});
test('image scanner validates PR2/PR3 and refuses arbitrary pasted QR text',()=>{
  const A=require('../app/acoustic-pairing.js'),Pairing=require('../app/pairing.js');
  const previous=globalThis.PlayroomPairing;
  globalThis.PlayroomPairing=Pairing;
  const Scanner=require('../app/qr-scanner.js');
  try{
    const data={v:2,kind:'answer',signal:'{"v":1,"type":"answer","sdp":"ok"}'};
    const token=Pairing.encode(data);
    assert.equal(Scanner.parsePayload('web+playroom:pair/'+token).kind,'answer');
    assert.throws(()=>Scanner.parsePayload('https://wrong.example/'),/QR|приглашен/);
    assert.throws(()=>Scanner.parsePayload('PR4.fake'),/QR|приглашен/);
    assert.equal(typeof A.pack,'function');
  }finally{if(previous===undefined)delete globalThis.PlayroomPairing;else globalThis.PlayroomPairing=previous;}
});
