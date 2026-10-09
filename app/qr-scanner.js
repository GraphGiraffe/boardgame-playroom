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
    if(!pairing)throw Error('Модуль приглашений не загружен.');
    const token=pairing.extract(String(text||''))||(/^(PR2|PR3)\.[A-Za-z0-9_-]+$/.test(String(text||'').trim())?String(text).trim():null);
    if(!token)throw Error('На QR нет приглашения PlayRoom PR3/PR2.');
    return {...pairing.decode(token),token};
  }
  function supported(){
    return typeof root.BarcodeDetector==='function'||typeof root.jsQR==='function';
  }
  async function readImage(file){
    if(!file||typeof file.type!=='string'||!/^image\//.test(file.type))throw Error('Выберите фотографию QR в формате изображения.');
    if(!Number.isFinite(file.size)||file.size<=0||file.size>MAX_FILE)throw Error('Фотография слишком большая или повреждена (максимум 20 МБ).');
    if(typeof root.createImageBitmap==='function'){
      try{
        const bitmap=await root.createImageBitmap(file,{imageOrientation:'from-image'});
        if(bitmap.width&&bitmap.height)return {image:bitmap,width:bitmap.width,height:bitmap.height,close:()=>bitmap.close?.()};
        bitmap.close?.();
      }catch(_){/* Some Android content providers need Image + object URL. */}
    }
    if(typeof URL==='undefined'||typeof URL.createObjectURL!=='function'||typeof root.Image!=='function')
      throw Error('Браузер не может открыть изображение. Попробуйте другой файл.');
    const url=URL.createObjectURL(file),image=new root.Image();
    try{
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Не удалось прочитать фотографию.'));image.src=url;});
      return {image,width:image.naturalWidth,height:image.naturalHeight,close:()=>URL.revokeObjectURL(url)};
    }catch(error){URL.revokeObjectURL(url);throw error;}
  }
  async function scan(file,{maxSide=1800}={}){
    if(!supported())throw Error('В этом браузере недоступен QR-декодер.');
    const item=await readImage(file);
    try{
      if(!item.width||!item.height||item.width*item.height>36000000)throw Error('Фотография имеет недопустимый размер.');
      const detector=typeof root.BarcodeDetector==='function'?new root.BarcodeDetector({formats:['qr_code']}):null;
      // Resize for fast Android scanning; second pass improves codes far away.
      const maxDimension=Math.max(item.width,item.height),scales=[Math.min(1,maxSide/maxDimension)];
      if(maxDimension>maxSide&&maxDimension<=5000)scales.push(Math.min(1,3000/maxDimension));
      for(const scale of [...new Set(scales)]){
        const canvas=root.document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(item.width*scale));
        canvas.height=Math.max(1,Math.round(item.height*scale));
        const context=canvas.getContext('2d',{willReadFrequently:true});
        if(!context)throw Error('Canvas недоступен в браузере.');
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
      throw Error('QR PlayRoom не найден на фото. Приблизьте код, уберите блики и повторите снимок.');
    }finally{item.close();}
  }
  return Object.freeze({MAX_FILE,parsePayload,supported,scan});
});