(function(root,factory){
  const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomInterfaceScale=api;
})(globalThis,function(root){
  'use strict';
  const normalize=value=>typeof value==='number'&&Number.isInteger(value)&&value>=50&&value<=150&&value%10===0?value:100;
  function maximum(width,height){
    const landscape=width>height;
    let limit=100;
    // Keep a contiguous safe interval: intermediate zoom levels matter too.
    for(let value=110;value<=150;value+=10){
      const w=width/(value/100),h=height/(value/100);
      const minimumWidth=landscape?(h<430?600:800):320;
      if(w<minimumWidth||h<(landscape?340:640))break;
      limit=value;
    }
    return limit;
  }
  let requested=100,applied=100;
  function sync(){
    const doc=root.document;if(!doc)return;
    const limit=maximum(root.innerWidth,root.innerHeight);applied=Math.min(requested,limit);
    const style=doc.documentElement.style;
    style.setProperty('--interface-scale',String(applied/100));
    doc.documentElement.dataset.interfaceScale=String(applied);
    const input=doc.getElementById('setting-scale');
    if(input){
      input.value=String(applied);input.dataset.allowedMax=String(limit);input.setAttribute('aria-valuemax',String(limit));
      input.setAttribute('aria-valuetext',applied+'%');
      const control=input.closest('.settings-range');control?.style.setProperty('--range-allowed',(limit-50)+'%');
      control?.style.setProperty('--range-progress',(applied-50)+'%');
      const output=doc.getElementById('setting-scale-value');if(output)output.textContent=applied+'%';
    }
  }
  function set(value){requested=normalize(value);sync();return applied;}
  root.addEventListener?.('resize',sync);
  return Object.freeze({normalize,maximum,set,sync,get requested(){return requested;},get applied(){return applied;},get limit(){return maximum(root.innerWidth,root.innerHeight);}});
});
