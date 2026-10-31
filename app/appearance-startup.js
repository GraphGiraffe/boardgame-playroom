/* The web launch surface is always black, until the first application UI exists. */
(function(){
 'use strict';const root=document.documentElement;
 root.dataset.appLoading='true';root.style.backgroundColor='#000000';root.style.colorScheme='dark';root.style.setProperty('--paper','#000000');
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#000000');
 const style=document.createElement('style');style.textContent='html[data-app-loading]{color-scheme:dark!important}html[data-app-loading] body{background:#000!important}html[data-app-loading]::after{content:"";position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none}';document.head.append(style);
 function finish(){if(!document.getElementById('app')?.childElementCount)return;observer.disconnect();requestAnimationFrame(()=>{delete root.dataset.appLoading;style.remove();const mode=root.dataset.appearanceMode||'light';document.querySelector('meta[name="theme-color"]')?.setAttribute('content',getComputedStyle(root).getPropertyValue('--paper').trim()||'#000000');document.querySelector('meta[name="color-scheme"]')?.setAttribute('content',mode);});}
 const observer=new MutationObserver(finish);
 document.addEventListener('DOMContentLoaded',()=>{const app=document.getElementById('app');if(app)observer.observe(app,{childList:true});finish();},{once:true});
})();
