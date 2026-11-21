'use strict';

// Author controls share the loopback transport and stay outside the game's DOM.
{
 const sizes=[
  ['Телефон · вертикально',390,844],['Телефон · горизонтально',844,390],
  ['Планшет · вертикально',768,1024],['Планшет · горизонтально',1024,768],
  ['ПК · вертикально',900,1440],['ПК · горизонтально',1440,900]
 ];
 const select=$('viewport-size'),panel=$('author-panel'),viewport=$('preview-viewport');
 const workspace=viewport.parentElement,tools=$('studio-tools'),iframe=$('scene');
 let showTools=false,settingsKey,assetRequest,assetURL;
 for(const [label,width,height] of sizes)select.add(new Option(`${label} (${width} × ${height})`,`${width}:${height}`));
 function layout(){
  const [width,height]=select.value.split(':').map(Number);
  iframe.style.setProperty('--sdk-viewport-width',width+'px');
  iframe.style.setProperty('--sdk-viewport-height',height+'px');
  const docked=showTools&&workspace.clientWidth>=width+320;
  workspace.dataset.docked=String(docked);
  viewport.hidden=showTools&&!docked;
  panel.hidden=!showTools;
  tools.setAttribute('aria-expanded',String(showTools));
  tools.textContent=showTools?'Скрыть инструменты':'Инструменты';
  $('viewport-fullscreen').disabled=viewport.hidden;
 }
 tools.onclick=()=>{showTools=!showTools;layout();};
 select.onchange=layout;
 $('viewport-fullscreen').onclick=()=>viewport.requestFullscreen().catch(error);
 new ResizeObserver(layout).observe(workspace);
 layout();

 function element(tag,content){const node=document.createElement(tag);if(content!==undefined)node.textContent=content;return node;}
 function renderSettings(current){
  const {pack,metadata,options,sessionId}=current;
  if(sessionId===settingsKey)return;
  settingsKey=sessionId;
  const panel=$('option-fields');panel.replaceChildren();
  const presets=pack.presetSetting?.options||(metadata?.presets||[]).map(preset=>({value:preset.id,label:preset.label}));
  const controls=[{key:'playerCount',label:'Игроков',min:pack.minPlayers,max:pack.maxPlayers,default:current.projection.playerCount},
   ...(presets.length?[{...pack.presetSetting,key:'preset',label:pack.presetSetting?.label??'Набор правил',options:presets,default:pack.presetSetting?.default??presets[0].value}]:[])];
  const fields=[...controls,...(pack.settings||[])];
  for(const field of fields){
   const label=element('label');label.append(element('span',text(field.label||field.key)));
   const ruleOption=!controls.includes(field);
   const value=(ruleOption?options.options?.[field.key]:options[field.key])??field.default;
   const input=element(field.options?.length?'select':'input');
   input.name=field.key;
   if(ruleOption)input.dataset.ruleOption='';
   if(field.options?.length){
    for(const item of field.options)input.add(new Option(text(item.label??item.value),JSON.stringify(item.value)));
    const selected=JSON.stringify(value);
    if([...input.options].some(option=>option.value===selected))input.value=selected;
    input.dataset.kind='json';
   }else if(typeof value==='boolean'){
    input.type='checkbox';input.checked=value;
   }else if(typeof value==='number'){
    input.type=field.control==='slider'?'range':'number';input.value=value;
    if(field.min!==undefined)input.min=field.min;
    if(field.max!==undefined)input.max=field.max;
    input.step=field.step??1;input.required=true;
   }else input.value=value??'';
   label.append(input);
   if(field.help||field.description)label.append(element('small',text(field.help||field.description)));
   panel.append(label);
  }
 }
 function settingValue(input){
  if(input.dataset.kind==='json')return JSON.parse(input.value);
  if(input.type==='checkbox')return input.checked;
  if(['number','range'].includes(input.type))return input.valueAsNumber;
  return input.value;
 }
 authorView=current=>{
  renderSettings(current);
  $('bot').disabled=current.pack.capabilities?.bots===false||current.history.reviewing||current.projection.status==='finished';
  if($('events').parentElement.open)$('events').replaceChildren(...current.events.map(event=>element('li',text(event.message||event.kind))));
 };
 $('events').parentElement.ontoggle=()=>{if(frame)authorView(frame);};
 $('options').onsubmit=event=>{
  event.preventDefault();
  const options={...frame.options,options:{...frame.options.options}};
  for(const input of $('option-fields').querySelectorAll('[name]')){
   const target=input.hasAttribute('data-rule-option')?options.options:options;
   target[input.name]=settingValue(input);
  }
  void request('start',{options});
 };
 $('bot').onclick=()=>request('bot');
 $('reload').onclick=()=>request('reload');
 $('check').onclick=async()=>{
  const result=await request('check');
  if(result)$('author-check').textContent=`Размер пака: ${result.check.budget.bytes} / ${result.check.budget.maxBytes} байт`;
 };
 function clearAsset(){
  assetRequest?.abort();
  if(assetURL)URL.revokeObjectURL(assetURL);
  assetURL=null;$('asset-preview').replaceChildren();
 }
 async function showAsset(file,audioLimit){
  clearAsset();
  const request=assetRequest=new AbortController(),preview=$('asset-preview');
  try{
   const response=await fetch('/api/asset?file='+encodeURIComponent(file.file),{headers:{'X-PlayRoom-SDK':token},signal:request.signal});
   if(!response.ok)throw Error('Asset unavailable');
   const blob=await response.blob();if(request.signal.aborted)return;
   const audio=file.mime.startsWith('audio/'),media=element(audio?'audio':'img');
   const description=element('p',file.file);
   if(audio){
    media.preload='metadata';
    description.textContent=`${file.file} · Определяем длительность`;
    // Compressed audio can report an unknown duration until the browser parses the file.
    media.addEventListener('durationchange',()=>{
     const seconds=media.duration;
     const known=Number.isFinite(seconds)&&seconds>0;
     media.controls=known&&seconds<=audioLimit;
     if(!media.controls)media.pause();
     const detail=media.controls?`${seconds.toFixed(2)} с`:known?`Дольше ${audioLimit} с`:'Длительность неизвестна';
     description.textContent=`${file.file} · ${detail}`;
    });
    media.addEventListener('error',()=>{description.textContent=`${file.file} · Не удалось прочитать звук`;});
   }
   else {media.alt=file.file;media.onload=()=>{description.textContent=`${file.file} · ${media.naturalWidth} × ${media.naturalHeight}`;};}
   assetURL=URL.createObjectURL(blob);media.src=assetURL;
   preview.append(media,description);
  }catch{if(!request.signal.aborted)preview.textContent='Не удалось открыть ассет';}
 }
 $('assets').onclick=async()=>{
  const result=await request('assets');if(!result)return;
  clearAsset();
  const {files,bytes,limits}=result.assets,list=element('ul');
  for(const file of files){
   const label=`${file.file} · ${file.bytes} Б`,row=element('li');
   if(/^(image|audio)\//.test(file.mime)){
    const button=element('button',label);button.onclick=()=>showAsset(file,limits.audioSeconds);row.append(button);
   }else row.textContent=label;
   list.append(row);
  }
  $('asset-list').replaceChildren(element('p',`${bytes} / ${limits.maxBytes} Б`),list);
 };
 $('save').onclick=async()=>{
  const result=await request('checkpoint');if(!result)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(result.checkpoint)],{type:'application/json'}));
  const link=element('a');link.href=url;link.download=frame.pack.id+'-private-checkpoint.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 $('restore').onchange=async()=>{
  const file=$('restore').files[0];if(!file)return;
  try{
   if(file.size>4*1024*1024)throw Error('Checkpoint exceeds the upload limit');
   await request('restore',{checkpoint:JSON.parse(await file.text())});
  }catch{error({code:'SDK_CHECKPOINT_INVALID'});}
  finally{$('restore').value='';}
 };
 if(frame)authorView(frame);
}
