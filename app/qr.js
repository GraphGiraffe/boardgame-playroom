if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const LIB='app/vendor/qrcode.js';
  function ensure(){
    if(typeof root.qrcode!=='function')throw Error(globalThis.PlayroomMessages.text("ui.qr.3f8a25a59a32"));
    return Promise.resolve(root.qrcode);
  }
  async function svg(value,{level='L',cellSize=4,margin=4}={}){
    if(typeof value!=='string'||!value)throw Error(globalThis.PlayroomMessages.text("ui.qr.c79d959fe362"));
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
      element.innerHTML='<p class="lead pairing-qr-error">'+String(globalThis.PlayroomMessages.error(error)||error).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</p>';
      element.removeAttribute('aria-busy');return false;
    }
  }
  root.PlayroomQR=Object.freeze({LIB,ensure,svg,render});
})(globalThis);
