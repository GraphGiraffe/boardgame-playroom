'use strict';
const $=id=>document.getElementById(id),token=document.querySelector('meta[name="sdk-token"]').content,client=crypto.randomUUID();
const publicViewOperations=new Set(['view','start','apply','bot','seek','restore','reload']);
let frame,packSnapshot,requestQueue=Promise.resolve(),selectedViewer=0,streamAbort,streamGeneration=0,pendingNavigation=false,pendingLiveFrame,theme='light';
const audio=new TabletopAudio({enabled:false});
let translator,translatorKey;
function text(value){
 if(value===null||value===undefined)return '';
 if(typeof value!=='object')return String(value);
 if(value.kind==='player-reference')return 'Игрок '+(value.index+1);
 if(value.kind==='player-list-reference')return value.indices.map(i=>'Игрок '+(i+1)).join(', ');
 if(value.key||value.common){
  const key=JSON.stringify([frame?.pack?.hash,frame?.locale,frame?.pack?.defaultLanguage]);
  if(translatorKey!==key){translatorKey=key;translator=new PlayroomLocalization.Translator({catalogs:{ru:{},...frame?.catalogs},locale:frame?.locale||'ru',fallback:frame?.pack?.defaultLanguage||'ru'});}
  const reference=value.key?{key:value.key,params:Object.fromEntries(Object.entries(value.params||{}).map(([name,item])=>[name,item&&typeof item==='object'?text(item):item]))}:value;
  try{return translator.format(reference);}catch{throw Object.assign(Error('SDK_LOCALIZATION_FAILED'),{code:'SDK_LOCALIZATION_FAILED'});}
 }
 return JSON.stringify(value);
}
function error(value){$('error').hidden=false;$('error').textContent=JSON.stringify(value?.code?value:{code:'SDK_PREVIEW_FAILED'},null,2);}
function readPublicReply(source){
 // Parse once in the renderer realm. The author-only operations are parsed
 // by the shell and never send their private results through this port.
 const protocol=$('scene').contentWindow?.PlayroomProtocol||PlayroomProtocol;
 return protocol.parse(source);
}
let renderer,themeData,authorView;
function mountPreview(){
 const view=$('scene').contentWindow;if(!view.PlayroomSDKGameView)return;
 renderer?.destroy();renderer=new view.PlayroomSDKGameView(view.document.getElementById('app'),{text,command:command=>request('apply',{command}),preview:(operation,command)=>sendPreview(operation,command),restart:()=>request('start',{options:frame.options}),error,audio:{registerPack:(id,sounds)=>{audio.registerPack(id,sounds);audio.warmPack(id);},present:(ids,pack,signal,phase)=>$('mute').checked||document.hidden?false:audio.present(ids,{pack,signal,phase}),batch:(ids,pack,signal)=>$('mute').checked||document.hidden?false:audio.batch(ids,{pack,signal}),stop:()=>audio.stop()},hostCommand:async command=>{
  if(command==='history'||command==='result-replay'){
   await request('seek',{index:command==='history'?frame.history.index:0});
   $(command==='history'?'history-prev':'history-next').focus();
  }
 }});
 renderer?.setReducedMotion($('motion').checked);if(themeData)view.PlayroomAppearanceWeb.applyPalette(view.document,themeData);if(frame)renderer.update(frame,{sharedPackData:packSnapshot.data});
}
$('scene').addEventListener('load',mountPreview);mountPreview();

// This page owns only viewport review. Authoring, diagnostics and asset
// operations are available through the SDK CLI/API, outside the game screen.
function render(){
 $('identity').textContent=(text(frame.metadata?.name)||frame.pack.id)+' · '+frame.pack.version;
 const count=frame.projection.playerCount;
 if($('viewer').options.length!==count+1){$('viewer').replaceChildren(new Option('Наблюдатель','-1'));for(let i=0;i<count;i++)$('viewer').add(new Option('Игрок '+(i+1),String(i)));}
 selectedViewer=Math.min(selectedViewer,count-1);$('viewer').value=String(selectedViewer);
 renderer?.update(frame,{sharedPackData:packSnapshot.data});
 $('history-status').textContent=(frame.history.index+1)+' / '+frame.history.count;
 $('history-prev').disabled=frame.history.index<=0;
 $('history-next').disabled=frame.history.index>=frame.history.count-1;
 $('history-live').disabled=!frame.history.reviewing;
 authorView?.(frame);
}
function acceptFrame(value,source='request'){
 if(!value?.projection){if(value?.preview)renderer?.preview(Array.isArray(value.preview)?value.preview:[value.preview]);return;}
 const newParty=frame&&value.sessionEpoch>frame.sessionEpoch;
 const viewer=Math.min(selectedViewer,value.projection.playerCount-1);
 if(value.viewer!==undefined&&value.viewer!==viewer)return;
 if(frame&&value.sessionEpoch<frame.sessionEpoch)return;
 const sameLiveView=frame&&value.sessionEpoch===frame.sessionEpoch&&value.pack?.hash===frame.pack?.hash&&
  value.projection.viewer===frame.projection.viewer&&!value.history?.reviewing&&!frame.history?.reviewing;
 if(sameLiveView&&value.projection.revision<frame.projection.revision)return;
 if(source==='stream'&&!newParty){
  // A return to live play can race with another client's commit. Keep its
  // latest snapshot while navigation owns the screen, without replaying it in history.
  if(pendingNavigation){if(!value.history?.reviewing)pendingLiveFrame=value;return;}
  if(frame?.history?.reviewing)return;
 }
 const hash=value.pack?.hash,packChanged=hash!==packSnapshot?.hash;
 if(packChanged){
  const {metadata,resources,catalogs}=value;
  if(!hash||!resources||!metadata||!catalogs)throw {code:'SDK_PACK_RESOURCES_REQUIRED'};
  packSnapshot={hash,data:Object.freeze({metadata,resources,catalogs})};
 }
 // Rehydrate the public view before touching the current viewer. Pack-wide
 // resources have their own revision, independent of seats and game turns.
 const complete={...value,...packSnapshot.data};
 // Author-only operation results stay with their requester, outside the renderer.
 const {checkpoint,debug,assets,check,...publicFrame}=complete;
 const viewerChanged=viewer!==selectedViewer;
 selectedViewer=viewer;frame=publicFrame;render();
 if((viewerChanged||packChanged)&&streamAbort)connectStream();
 return complete;
}
async function perform(op,extra,viewer){
 $('error').hidden=true;
 const navigating=['seek','restore','reload','start'].includes(op);
 if(navigating)pendingNavigation=true;
 // The transport waits for presentation, never for its own pending command.
 // Navigation stays interruptible while the current event group is playing.
 try{
  if(['apply','bot'].includes(op))await renderer?.whenIdle({commands:false});
  const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':token},body:JSON.stringify({...extra,op,viewer,client,knownPackHash:packSnapshot?.hash||''})});
  if(!response.ok)throw await response.json();
  const value=publicViewOperations.has(op)?readPublicReply(await response.text()):await response.json();
  return acceptFrame(value)||value;
 }catch(value){error(value);return false;}
 finally{
  if(navigating){
   pendingNavigation=false;
   const live=pendingLiveFrame;pendingLiveFrame=undefined;
   if(live&&(!frame||live.sessionEpoch>frame.sessionEpoch||live.sessionEpoch===frame.sessionEpoch&&live.projection.revision>frame.projection.revision)){
    try{acceptFrame(live,'stream');}catch(value){error(value);}
   }
  }
 }
}
function request(op,extra={}){const viewer=extra.viewer??selectedViewer;const result=requestQueue.then(()=>perform(op,extra,viewer));requestQueue=result.catch(()=>{});return result;}
async function sendPreview(operation,command){if(!command||frame?.history?.reviewing)return;const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':token},body:JSON.stringify({op:'preview',viewer:selectedViewer,client,command,operation})});if(!response.ok)throw await response.json();}
async function connectStream(){
 streamAbort?.abort();streamAbort=new AbortController();const signal=streamAbort.signal,generation=++streamGeneration,viewer=selectedViewer;$('connection').textContent='Подключение…';
 try{const response=await fetch('/api/stream?'+new URLSearchParams({viewer,client,knownPackHash:packSnapshot?.hash||''}),{headers:{'X-PlayRoom-SDK':token},signal});if(!response.ok||!response.body)throw Error('stream');$('connection').textContent='Обновления подключены';const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(!signal.aborted){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>8*1024*1024)throw Error('stream limit');let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;if(generation!==streamGeneration)return;const message=readPublicReply(line);if(message.type==='preview')renderer?.preview(message.preview||[{operation:message.operation,roundId:message.roundId}]);else acceptFrame(message.frame||message,'stream');}}if(!signal.aborted)throw Error('stream ended');}
 catch(value){if(signal.aborted)return;$('connection').textContent='Связь прервана · переподключение';setTimeout(()=>{if(generation===streamGeneration)connectStream();},1800);}
}
async function setTheme(next){theme=next;try{const response=await fetch('/themes/'+next+'.json');if(!response.ok)throw Error('theme');const data=await response.json();themeData=data;const view=$('scene').contentWindow;if(view.PlayroomAppearanceWeb)view.PlayroomAppearanceWeb.applyPalette(view.document,data);for(const [key,value]of Object.entries(data.palette||{}))if(/^[a-z][a-z0-9.-]*$/.test(key)&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))document.documentElement.style.setProperty('--color-'+key.replaceAll('.','-'),value);document.documentElement.style.colorScheme=next;$('theme').setAttribute('aria-label',next==='light'?'Включить тёмную тему':'Включить светлую тему');}catch{if(next==='dark')document.documentElement.style.colorScheme='light';}}
for(const element of document.querySelectorAll('[data-icon]'))element.innerHTML=PlayroomIcons.icon(element.dataset.icon);
$('viewer').onchange=async()=>{selectedViewer=Number($('viewer').value);streamAbort?.abort();await request('view',{viewer:selectedViewer});connectStream();};
$('history-prev').onclick=()=>request('seek',{index:Math.max(0,frame.history.index-1)});
$('history-next').onclick=()=>request('seek',{index:Math.min(frame.history.count-1,frame.history.index+1)});
$('history-live').onclick=()=>request('seek',{index:null});
$('motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;renderer?.setReducedMotion($('motion').checked);$('motion').onchange=()=>renderer?.setReducedMotion($('motion').checked);
$('mute').onchange=()=>{audio.setEnabled(!$('mute').checked);if(!$('mute').checked)void audio.unlock().then(ok=>{if(ok)audio.warmPack(frame?.pack?.id);});};
$('theme').onclick=()=>setTheme(theme==='light'?'dark':'light');
setTheme(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
request('view').then(value=>{if(value)connectStream();});
