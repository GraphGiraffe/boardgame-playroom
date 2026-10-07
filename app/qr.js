(function(root){
  'use strict';
  const LIB='https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/qrcode.js';
  let loading=null;
  function ensure(){
    if(typeof root.qrcode==='function')return Promise.resolve(root.qrcode);
    if(loading)return loading;
    loading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=LIB;script.async=true;script.crossOrigin='anonymous';
      script.onload=()=>typeof root.qrcode==='function'?resolve(root.qrcode):reject(Error('QR-модуль не загрузился.'));
      script.onerror=()=>reject(Error('QR-код недоступен. Используйте Share или копирование ссылки.'));
      document.head.appendChild(script);
    });
    return loading;
  }
  async function svg(value,{level='L',cellSize=4,margin=4}={}){
    if(typeof value!=='string'||!value)throw Error('Нет данных для QR-кода.');
    const factory=await ensure(),code=factory(0,level);code.addData(value,'Byte');code.make();
    return code.createSvgTag({cellSize,margin,scalable:true});
  }
  async function render(element,value,options){
    if(!element)return false;
    element.setAttribute('aria-busy','true');
    try{
      element.innerHTML=await svg(value,options);
      element.classList.add('pairing-qr-ready');element.removeAttribute('aria-busy');return true;
    }catch(error){
      element.innerHTML='<p class="lead pairing-qr-error">'+String(error.message||error).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</p>';
      element.removeAttribute('aria-busy');return false;
    }
  }
  root.PlayroomQR=Object.freeze({LIB,ensure,svg,render});
})(globalThis);
