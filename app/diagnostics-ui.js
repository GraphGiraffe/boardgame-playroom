/* Passive, surface-owned log sizes. Reading this counter never records a sample. */
(function(root){
 'use strict';
 function bind(host,recorder,attachments){
  const details=host.querySelector('.settings-diagnostics'),toggle=host.querySelector('#setting-diagnostics'),clear=host.querySelector('[data-diagnostics-clear]'),download=host.querySelector('[data-diagnostics-download]'),size=host.querySelector('[data-diagnostics-size]'),status=host.querySelector('[data-diagnostics-status]');
  let disposed=false,busy=false,revision=0,stamp='';
  const hideStatus=()=>{status.hidden=true;status.textContent='';};
  async function refresh(force=false){
   if(disposed||!host.isConnected||!details.open||host.closest('[inert]'))return;
   const next=recorder.written+':'+recorder.enabled;if(!force&&next===stamp)return;
   if(!recorder.count){stamp=next;size.textContent=attachments.formatLog(null);return;}
   if(busy)return;busy=true;stamp=next;const ticket=revision;
   try{const value=await attachments.log({trace:()=>recorder.trace({sample:false})});if(!disposed&&ticket===revision)size.textContent=attachments.formatLog(value);}
   catch(_){if(!disposed&&ticket===revision)size.textContent='Размер лога недоступен.';}
   finally{busy=false;}
  }
  toggle.onchange=()=>{recorder.setEnabled(toggle.checked);revision++;stamp='';hideStatus();void refresh(true);};
  clear.onclick=()=>{recorder.clear();toggle.checked=false;revision++;stamp='';hideStatus();size.textContent=attachments.formatLog(null);};
  download.onclick=async()=>{download.disabled=true;hideStatus();try{await recorder.download();}catch(_){if(!disposed){status.textContent='Не удалось подготовить файл. Повторите скачивание.';status.hidden=false;}}finally{if(!disposed){download.disabled=false;void refresh(true);}}};
  const opened=()=>{if(details.open)void refresh(true);};details.addEventListener('toggle',opened);size.textContent=attachments.formatLog(null);void refresh(true);
  const timer=root.setInterval(()=>{void refresh();},5000);
  return ()=>{disposed=true;revision++;root.clearInterval(timer);details.removeEventListener('toggle',opened);toggle.onchange=null;clear.onclick=null;download.onclick=null;};
 }
 root.PlayroomDiagnosticsUI=Object.freeze({bind});
})(globalThis);
