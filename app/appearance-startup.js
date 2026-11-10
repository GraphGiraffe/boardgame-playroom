/* Match the saved canvas before the full appearance model and first UI load. */
(function(){
 'use strict';const root=document.documentElement;let mode='light';
 try{const saved=JSON.parse(localStorage.getItem('playroom.appearance.v1')||'null');mode=saved?.activeId==='dark'||saved?.presets?.find(p=>p.id===saved.activeId)?.mode==='dark'?'dark':'light';}catch(_){}
 const canvas=mode==='dark'?'#000000':'#f3f0e7';root.dataset.appLoading='true';root.style.backgroundColor=canvas;root.style.colorScheme=mode;root.style.setProperty('--paper',canvas);
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',canvas);
 const style=document.createElement('style');style.textContent='html[data-app-loading] body{background:var(--paper)!important}html[data-app-loading]::after{content:"";position:fixed;inset:0;background:var(--paper);z-index:2147483647;pointer-events:none}';document.head.append(style);
 function finish(){if(!document.getElementById('app')?.childElementCount)return;observer.disconnect();requestAnimationFrame(()=>{delete root.dataset.appLoading;style.remove();const mode=root.dataset.appearanceMode||'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(root).getPropertyValue('--paper').trim()||canvas);document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',mode);});}
 const observer=new MutationObserver(finish);
 document.addEventListener('DOMContentLoaded',()=>{const app=document.getElementById('app');if(app)observer.observe(app,{childList:true});finish();},{once:true});
})();
