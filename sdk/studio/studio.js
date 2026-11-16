'use strict';
const $=id=>document.getElementById(id),token=document.querySelector('meta[name="sdk-token"]').content,client=crypto.randomUUID();
let frame,urls=[],requestQueue=Promise.resolve(),selectedViewer=0,streamAbort,streamGeneration=0,settingsKey='',ruleKey='',pendingNavigation=false,theme='light';
const audio=new TabletopAudio({enabled:false});
const scheduler=new PlayroomPresentationScheduler(),player=new PlayroomPlanPlayer(scheduler);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=String(text);return element;};
function text(value){
 if(value===null||value===undefined)return '';
 if(typeof value!=='object')return String(value);
 if(value.kind==='player-reference')return 'Игрок '+(value.index+1);
 if(value.kind==='player-list-reference')return value.indices.map(i=>'Игрок '+(i+1)).join(', ');
 if(value.key){const catalog=frame?.catalogs?.ru||Object.values(frame?.catalogs||{})[0]||{};return String(catalog[value.key]||value.key).replace(/\{([\w.-]+)\}/g,(_,key)=>text(value.params?.[key]??'{'+key+'}'));}
 return JSON.stringify(value);
}
function error(value){$('error').hidden=false;$('error').textContent=JSON.stringify(value?.code?value:{code:'SDK_CONNECTION_FAILED'},null,2);}
const renderer=new PlayroomSDKSceneRenderer($('scene'),{text,externalActions:authorized=>[...$('actions').querySelectorAll('button')].filter(element=>authorized.some(command=>JSON.stringify(command)===JSON.stringify(element._command))).map(element=>({element,command:element._command})),command:command=>request('apply',{command}),preview:(operation,command)=>sendPreview(operation,command),error});
function button(label,command){const result=node('button',label||'Действие');result.type='button';result.dataset.sdkCommand='true';result._command=command;result.disabled=!!frame?.history?.reviewing;result.onclick=()=>request('apply',{command:result._command});return result;}
function renderSettings(){
 const settings=frame.pack.settings||frame.settings||[],defaults=frame.options||frame.defaults||{},key=JSON.stringify([frame.pack.hash,settings]);if(key===settingsKey)return;settingsKey=key;const root=$('option-fields');root.replaceChildren();
 const values=[{key:'playerCount',label:'Игроков',default:frame.projection.playerCount,control:'number',min:frame.pack.minPlayers||frame.pack.players?.min||2,max:frame.pack.maxPlayers||frame.pack.players?.max||32},{key:'rng',label:'Случайная последовательность (seed)',default:1,control:'number',min:0,max:4294967295},{key:'preset',label:'Набор правил',default:'classic',control:'text'},...settings];
 for(const setting of values){const label=node('label');label.className='option-field';label.append(node('span',text(setting.label||setting.key)));const initial=Object.hasOwn(defaults,setting.key)?defaults[setting.key]:setting.default;let input;
  if(setting.options?.length){input=node('select');for(const option of setting.options){const element=node('option',text(option.label??option.value));element.value=JSON.stringify(option.value);element.selected=JSON.stringify(option.value)===JSON.stringify(initial);input.append(element);}input.dataset.valueKind='json';}
  else {input=node('input');input.type=setting.control==='slider'?'range':setting.control==='number'||typeof initial==='number'?'number':typeof initial==='boolean'?'checkbox':'text';if(setting.min!==undefined)input.min=setting.min;if(setting.max!==undefined)input.max=setting.max;input.step=setting.step||1;if(input.type==='checkbox')input.checked=initial===true;else input.value=initial??'';input.dataset.valueKind=typeof initial==='number'?'number':typeof initial==='boolean'?'boolean':'string';}
  input.name=setting.key;input.dataset.option='true';if(input.type==='range'){const row=node('span');row.className='option-slider';const output=node('output',input.value);output.htmlFor='option-'+setting.key;input.id=output.htmlFor;input.oninput=()=>{output.value=input.value;output.textContent=input.value;};row.append(input,output);label.append(row);}else label.append(input);if(setting.help||setting.description){const help=node('small',text(setting.help||setting.description));help.className='option-help';label.append(help);}root.append(label);
 }
}
function render(){
 $('identity').textContent=(text(frame.metadata?.name)||frame.pack.id)+' · '+frame.pack.version;
 $('scene-title').textContent=text(frame.metadata?.name)||'Игровой стол';
 $('status').textContent=frame.changed?'Исходники изменились. Перечитайте код, чтобы начать новую партию.':frame.projection.status==='finished'?'Партия завершена':frame.history.reviewing?'Просмотр истории · действия отключены':'Играет: игрок '+(frame.projection.turn+1);
 const count=frame.projection.playerCount;if($('viewer').options.length!==count+1){$('viewer').replaceChildren(new Option('Наблюдатель','-1'));for(let i=0;i<count;i++)$('viewer').add(new Option('Игрок '+(i+1),String(i)));}selectedViewer=Math.min(selectedViewer,count-1);$('viewer').value=String(selectedViewer);
 renderer.update(frame);
 PlayroomSDKKeyed($('actions'),(frame.actions||[]).filter(a=>!frame.scene.vote?.command||JSON.stringify(a.command)!==JSON.stringify(frame.scene.vote.command)),a=>JSON.stringify(a.command),a=>button(text(a.label),a.command),(b,a)=>{if(b.textContent!==text(a.label))b.textContent=text(a.label);b._command=a.command;b.disabled=!!frame.history.reviewing;});renderer.renderTutorial(frame.support?.tutorial||frame.scene.support?.tutorial||frame.tutorial);
 PlayroomSDKKeyed($('events'),frame.events||[],(event,i)=>event.id??i,()=>node('li'),(li,event)=>{const value=text(event.message||event.kind||'');if(li.textContent!==value)li.textContent=value;});
 const rules=frame.support?.catalog?.manual||frame.metadata?.catalog?.manual||frame.metadata?.rulebook?.brief||frame.metadata?.rulebook||frame.metadata?.rules,key=frame.pack.hash+JSON.stringify(rules);if(key!==ruleKey){ruleKey=key;$('rules').replaceChildren();ruleBlocks(rules,$('rules'));}
 renderSettings();
 for(const [id,value]of [['projection',frame.projection],['scene-data',frame.scene],['checks',frame.check||frame.diagnostics||[]]]){const target=$(id);const json=JSON.stringify(value,null,2);if(target.parentElement.open||json.length<64000||id==='checks'&&frame.check)target.textContent=json;else target.textContent='Большой объём данных. Откройте раздел для просмотра.';}
 if(frame.debug){$('debug-data').hidden=false;$('debug-data').textContent=frame.debug.warning+'\n'+JSON.stringify(frame.debug.position,null,2);}else {$('debug-data').hidden=true;$('debug-data').textContent='';}
 $('history-status').textContent=(frame.history.index+1)+' / '+frame.history.count+(frame.history.reviewing?' · История':'');$('history-prev').disabled=frame.history.index<=0;$('history-next').disabled=frame.history.index>=frame.history.count-1;$('history-live').disabled=!frame.history.reviewing;$('bot').disabled=frame.pack.capabilities?.bots===false||!!frame.history.reviewing||frame.projection.status==='finished';$('bot').title=frame.pack.capabilities?.bots===false?'В этой игре нет ходов бота':'Выполнить ход бота';
}
function acceptFrame(value,source='request'){
 if(!value?.projection){if(value?.preview)renderer.preview(Array.isArray(value.preview)?value.preview:[value.preview]);return;}
 if(value.viewer!==undefined&&value.viewer!==selectedViewer)return;if(source==='stream'&&(pendingNavigation||frame?.history?.reviewing))return;
 if(source==='stream'&&frame?.pack?.hash===value.pack?.hash&&frame.projection.revision>value.projection.revision)return;
 frame=value;render();
}
async function perform(op,extra,viewer){
 if(!['view','assets','check','debug','preview'].includes(op))audio.stop();$('error').hidden=true;if(['seek','restore','reload','start'].includes(op))pendingNavigation=true;
 try{player.cancel();const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':token},body:JSON.stringify({op,viewer,client,...extra})});const value=await response.json();if(!response.ok)throw value;acceptFrame(value);if(value.plan){await player.play(value.plan,{effect:(cue,context)=>{if(cue.stage==='sound'&&!$('mute').checked){context.cleanup(()=>audio.stop());return Promise.all(cue.sounds.map(id=>audio.play(id)));}}});}if(value.assets)await assets(value.assets);return value;}catch(value){error(value);return false;}finally{pendingNavigation=false;}
}
function request(op,extra={}){const viewer=extra.viewer??selectedViewer;const result=requestQueue.then(()=>perform(op,extra,viewer));requestQueue=result.catch(()=>{});return result;}
async function sendPreview(operation,command){if(!command||frame?.history?.reviewing)return;const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':token},body:JSON.stringify({op:'preview',viewer:selectedViewer,client,command,operation})});if(!response.ok)throw await response.json();}
async function connectStream(){
 streamAbort?.abort();streamAbort=new AbortController();const signal=streamAbort.signal,generation=++streamGeneration,viewer=selectedViewer;$('connection').textContent='Подключение…';
 try{const response=await fetch('/api/stream?viewer='+viewer+'&client='+encodeURIComponent(client),{headers:{'X-PlayRoom-SDK':token},signal});if(!response.ok||!response.body)throw Error('stream');$('connection').textContent='Обновления подключены';const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';while(!signal.aborted){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>8*1024*1024)throw Error('stream limit');let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(!line.trim())continue;const message=JSON.parse(line);if(generation!==streamGeneration)return;if(message.type==='preview')renderer.preview(message.preview||[{operation:message.operation,roundId:message.roundId}]);else acceptFrame(message.frame||message,'stream');}}if(!signal.aborted)throw Error('stream ended');}
 catch(value){if(signal.aborted)return;$('connection').textContent='Связь прервана · переподключение';setTimeout(()=>{if(generation===streamGeneration)connectStream();},1800);}
}
async function setTheme(next){theme=next;try{const response=await fetch('/themes/'+next+'.json');if(!response.ok)throw Error('theme');const data=await response.json();for(const [key,value]of Object.entries(data.palette||{}))if(/^[a-z][a-z0-9.-]*$/.test(key)&&typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))document.documentElement.style.setProperty('--color-'+key.replaceAll('.','-'),value);document.documentElement.style.colorScheme=next;$('theme').setAttribute('aria-label',next==='light'?'Включить тёмную тему':'Включить светлую тему');}catch{if(next==='dark')document.documentElement.style.colorScheme='light';}}
function ruleBlocks(value,parent,depth=0){
 if(depth>12||value===null||value===undefined)return;
 if(typeof value==='string'||value.key){parent.append(node('p',text(value)));return;}
 if(Array.isArray(value)){for(const child of value)ruleBlocks(child,parent,depth+1);return;}
 if(typeof value==='object'){
  if(value.title)parent.append(node('h3',text(value.title)));
  if(value.type==='list'){const list=node(value.ordered?'ol':'ul');for(const item of value.items||[]){const li=node('li');ruleBlocks(item,li,depth+1);list.append(li);}parent.append(list);return;}
  if(value.type==='table'){const table=node('table');if(value.headers){const row=node('tr');for(const header of value.headers)row.append(node('th',text(header)));table.append(row);}for(const cells of value.rows||[]){const row=node('tr');for(const cell of cells)row.append(node('td',text(cell)));table.append(row);}parent.append(table);return;}
  for(const figure of value.figures||[]){const source=(frame.support?.catalog?.figures||frame.metadata?.catalog?.figures||[]).find(item=>item.id===figure.id);if(source){const block=node('figure');block.className='sdk-manual-figure';block.append(PlayroomSDKRenderGraphic(source.graphic,{text,resources:frame.resources}));if(figure.caption)block.append(node('figcaption',text(figure.caption)));parent.append(block);}}
  for(const key of ['text','paragraphs','items','blocks','sections'])if(value[key]&&!(key==='text'&&value.blocks))ruleBlocks(value[key],parent,depth+1);
 }
}
async function assets(report){
 for(const audio of $('asset-list').querySelectorAll('audio')){audio.pause();audio.removeAttribute('src');}urls.forEach(URL.revokeObjectURL);urls=[];$('asset-list').replaceChildren(node('p',`${report.files.length} / ${report.limits.maxFiles} файлов · ${report.bytes} / ${report.limits.maxBytes} байт`));
 for(const file of report.files){const figure=node('figure');figure.append(node('figcaption',file.file+' · '+file.bytes+' B'));const response=await fetch('/api/asset?file='+encodeURIComponent(file.file),{headers:{'X-PlayRoom-SDK':token}});if(response.ok){
  if(file.mime.startsWith('image/')||file.mime.startsWith('audio/')){const url=URL.createObjectURL(await response.blob());urls.push(url);const element=node(file.mime.startsWith('image/')?'img':'audio');element.src=url;if(element.tagName==='IMG')element.alt=file.file;else {element.controls=true;element.preload='metadata';element.onloadedmetadata=()=>{if(!Number.isFinite(element.duration)||element.duration>report.limits.audioSeconds){element.pause();element.removeAttribute('src');figure.append(node('p','SDK_AUDIO_DURATION_LIMIT: максимум '+report.limits.audioSeconds+' секунд'));}};}figure.append(element);}
  else if(file.mime==='application/json'){const motion=await response.json(),preview=node('span','●'),play=node('button','Показать анимацию');figure.append(preview,play);play.onclick=()=>{const duration=motion.frames.at(-1).time;if($('motion').checked||duration===0){preview.textContent='● Конечный кадр';return;}preview.animate(motion.frames.map(frame=>({offset:frame.time/duration,transform:`translate(${frame.values.x||0}px,${frame.values.y||0}px) rotate(${frame.values.rotation||0}deg) scale(${frame.values.scale??1})`,opacity:frame.values.opacity??1})),{duration,fill:'none'});};}
 }$('asset-list').append(figure);}
}
for(const element of document.querySelectorAll('[data-icon]'))element.innerHTML=PlayroomIcons.icon(element.dataset.icon);
$('viewer').onchange=async()=>{selectedViewer=Number($('viewer').value);streamAbort?.abort();await request('view',{viewer:selectedViewer});connectStream();};
$('history-prev').onclick=()=>request('seek',{index:Math.max(0,frame.history.index-1)});
$('history-next').onclick=()=>request('seek',{index:Math.min(frame.history.count-1,frame.history.index+1)});
$('history-live').onclick=()=>request('seek',{index:null});
for(const [id,op]of [['start','start'],['bot','bot'],['reload','reload'],['check','check'],['assets','assets'],['debug','debug']])$(id).onclick=()=>request(op);
$('options').onsubmit=event=>{event.preventDefault();const options={firstPlayer:0};for(const input of $('option-fields').querySelectorAll('[data-option]'))options[input.name]=input.dataset.valueKind==='json'?JSON.parse(input.value):input.dataset.valueKind==='number'?Number(input.value):input.dataset.valueKind==='boolean'?input.checked:input.value;request('start',{options});};
$('save').onclick=async()=>{const result=await request('checkpoint');if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result.checkpoint)],{type:'application/json'}));const anchor=node('a');anchor.href=url;anchor.download=frame.pack.id+'-private-checkpoint.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('restore').onchange=async()=>{const file=$('restore').files[0];if(file&&file.size<=4*1024*1024){try{await request('restore',{checkpoint:JSON.parse(await file.text())});}catch{error({code:'SDK_CHECKPOINT_INVALID'});}}};
$('motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('mute').onchange=()=>{audio.setEnabled(!$('mute').checked);if(!$('mute').checked)audio.unlock();};
$('theme').onclick=()=>setTheme(theme==='light'?'dark':'light');
for(const [id,get]of [['projection',()=>frame?.projection],['scene-data',()=>frame?.scene],['checks',()=>frame?.check||frame?.diagnostics||[]]])$(id).parentElement.addEventListener('toggle',()=>{if($(id).parentElement.open)$(id).textContent=JSON.stringify(get(),null,2);});
setInterval(async()=>{try{const response=await fetch('/api/changed',{headers:{'X-PlayRoom-SDK':token}});if((await response.json()).changed)$('status').textContent='Исходники изменились. Перечитайте код, чтобы начать новую партию.';}catch{}},5000);
setTheme(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
request('view').then(value=>{if(value)connectStream();});
