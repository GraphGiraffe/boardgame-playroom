if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomQRScanner=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  // Input comes from Android's system camera/file chooser. No getUserMedia,
  // external services or platform QR overlay is needed.
  const MAX_FILE=20*1024*1024;
  function parsePayload(text){
    const pairing=root.PlayroomPairing||(typeof require==='function'?require('./pairing.js'):null);
    if(!pairing)throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.3a5e617d2e6d"));
    const token=pairing.extract(String(text||''))||(/^(PR2|PR3)\.[A-Za-z0-9_-]+$/.test(String(text||'').trim())?String(text).trim():null);
    if(!token)throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.803c2cd14446"));
    return {...pairing.decode(token),token};
  }
  function supported(){
    return typeof root.BarcodeDetector==='function'||typeof root.jsQR==='function';
  }
  async function readImage(file){
    if(!file||typeof file.type!=='string'||!/^image\//.test(file.type))throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.7b76735110b1"));
    if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_FILE)throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.58b951f4575a"));
    if(typeof root.createImageBitmap==='function'){
      try{
        const bitmap=await root.createImageBitmap(file,{imageOrientation:'from-image'});
        if(bitmap.width&&bitmap.height)return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
        bitmap.close?.();
      }catch(_){/* Some Android content providers need Image + object URL. */}
    }
    if(typeof URL==='undefined'||typeof URL.createObjectURL!=='function'||typeof root.Image!=='function')
      throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.342eabe012c3"));
    const url=URL.createObjectURL(file),image=new root.Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error(globalThis.PlayroomMessages.text("ui.qr-scanner.0cf1ab0beb03")));image.src=url;});
      return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>URL.revokeObjectURL(url)};
    }catch(error){URL.revokeObjectURL(url);throw error;}
  }
  async function scan(file,{maxSide=1800}={}){
    if(!supported())throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.29616b70e627"));
    const item=await readImage(file);
    try{
      if(!item.width||!item.height||item.width*item.height>36000000)throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.5f728fa85e97"));
      let detector=null;
      if(typeof root.BarcodeDetector==='function')try{detector=new root.BarcodeDetector({formats:['qr_code']});}catch(_){/* jsQR remains available. */}
      // Resize for fast Android scanning; second pass improves codes far away.
      const maxDimension=Math.max(item.width,item.height),scales=[Math.min(1,maxSide/maxDimension)];
      if(maxDimension>maxSide&&maxDimension<=5000)scales.push(Math.min(1,3000/maxDimension));
      for(const scale of [...new Set(scales)]){
        const canvas=root.document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(item.width*scale));
        canvas.height=Math.max(1,Math.round(item.height*scale));
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.0ab92aa0cbb8"));
        context.drawImage(item.image,0,0,canvas.width,canvas.height);
        if(detector)try{
          const found=await detector.detect(canvas);
          for(const record of found){
            try{return {...parsePayload(record.rawValue),width:item.width,height:item.height,method:'BarcodeDetector'};}
            catch(_){/* Other QR in photo may not be a PlayRoom invite. */}
          }
        }catch(_){/* Continue with the offline decoder. */}
        if(typeof root.jsQR==='function'){
          const pixels=context.getImageData(0,0,canvas.width,canvas.height);
          const result=root.jsQR(pixels.data,canvas.width,canvas.height,{inversionAttempts:'attemptBoth'});
          if(result?.data)return {...parsePayload(result.data),width:item.width,height:item.height,method:'jsQR'};
        }
        canvas.width=0;canvas.height=0;
      }
      throw Error(globalThis.PlayroomMessages.text("ui.qr-scanner.6f933045caa7"));
    }finally{item.close();}
  }
  return Object.freeze({MAX_FILE,parsePayload,supported,scan});
});