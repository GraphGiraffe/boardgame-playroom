'use strict';
const $=id=>document.getElementById(id),token=document.querySelector('meta[name="sdk-token"]').content;
let frame,busy=false,urls=[],lastRevision=null;
const audio=new TabletopAudio({enabled:false});
const scheduler=new PlayroomPresentationScheduler(),player=new PlayroomPlanPlayer(scheduler);
const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=String(text);return element;};
function text(value){
 if(value===null||value===undefined)return '';
 if(typeof value!=='object')return String(value);
 if(value.kind==='player-reference')return 'Игрок '+(value.index+1);
 if(value.kind==='player-list-reference')return value.indices.map(i=>'Игрок '+(i+1)).join(', ');
 if(value.key){const catalog=frame.catalogs.ru||Object.values(frame.catalogs)[0]||{};return String(catalog[value.key]||value.key).replace(/\{([\w.-]+)\}/g,(_,key)=>text(value.params?.[key]??'{'+key+'}'));}
 return JSON.stringify(value);
}
function button(label,command){const result=node('button',label||'Действие');result.type='button';result.dataset.sdkCommand='true';result.disabled=!!frame.history.reviewing;result.onclick=()=>request('apply',{command});return result;}
function sound(){if($('mute').checked)return;const ids=frame.events.map(event=>event.sound?.id).filter(id=>typeof id==='string');for(const id of ids.slice(0,12))audio.play(id).catch(()=>{});}
function card(value){const element=node('span',value?.hidden?'▧':value?.suit?value.suit+value.rank:value?.label?text(value.label):value?.value??value?.rank??value?.id??'•');element.className='card';return element;}
function renderScene(){
 const root=$('scene');root.replaceChildren();const s=frame.scene;
 if(Array.isArray(s.cells)&&s.cells.length){const grid=node('div');grid.className='grid';grid.style.gridTemplateColumns=`repeat(${Math.max(1,Math.min(20,s.columns||Math.ceil(Math.sqrt(s.cells.length))))},minmax(0,1fr))`;for(const cell of s.cells){const label=cell.mark??cell.value??'·',element=cell.command?button(text(label)||'·',cell.command):node('div',text(label)||'·');element.classList.add('cell');element.setAttribute('aria-label',text(cell.label)||text(label)||'Пустая клетка');grid.append(element);}root.append(grid);}
 if(Array.isArray(s.dice)){const dice=node('div');dice.className='cards';for(const value of s.dice)dice.append(card({value:'⚄ '+(typeof value==='number'?value:value.value)+(value.held?' ✓':'')}));root.append(dice);}
 const players=node('div');players.className='players';for(const player of s.players){const panel=node('div');panel.className='player';panel.append(node('strong','Игрок '+(player.player+1)));for(const metric of player.metrics||[])panel.append(node('p',text(metric.label)+': '+text(metric.value)));if(Array.isArray(player.hand)){const hand=node('div');hand.className='cards';for(const value of player.hand)hand.append(card(value));panel.append(hand);}players.append(panel);}root.append(players);
 if(Array.isArray(s.rows)){const table=node('table');for(const row of s.rows){const tr=node('tr');tr.append(node('th',text(row.label)));for(const cell of row.cells||[]){const td=node('td');td.append(cell.command?button(text(cell.value??cell.preview??'—'),cell.command):node('span',text(cell.value??'—')));tr.append(td);}table.append(tr);}root.append(table);}
 if(!s.cells&&!s.rows)root.append(node('p',`Зоны: ${(s.zones||[]).map(zone=>zone.id).join(', ')} · Объектов: ${(s.objects||[]).length}`));
 if(!$('motion').checked)root.classList.add('motion');else root.classList.remove('motion');
}
function ruleBlocks(value,parent,depth=0){
 if(depth>12||value===null||value===undefined)return;
 if(typeof value==='string'||value.key){parent.append(node('p',text(value)));return;}
 if(Array.isArray(value)){for(const child of value)ruleBlocks(child,parent,depth+1);return;}
 if(typeof value==='object'){
  if(value.title)parent.append(node('h3',text(value.title)));
  if(value.type==='list'){const list=node(value.ordered?'ol':'ul');for(const item of value.items||[]){const li=node('li');ruleBlocks(item,li,depth+1);list.append(li);}parent.append(list);return;}
  if(value.type==='table'){const table=node('table');if(value.headers){const row=node('tr');for(const header of value.headers)row.append(node('th',text(header)));table.append(row);}for(const cells of value.rows||[]){const row=node('tr');for(const cell of cells)row.append(node('td',text(cell)));table.append(row);}parent.append(table);return;}
  for(const key of ['text','paragraphs','items','blocks','sections'])if(value[key]&&!(key==='text'&&value.blocks))ruleBlocks(value[key],parent,depth+1);
 }
}
function render(){
 $('identity').textContent=frame.pack.id+' · '+frame.pack.version+' · '+frame.pack.hash.slice(0,12);
 $('status').textContent=frame.changed?'Исходники изменились. Нажмите «Перечитать код», чтобы начать новую партию.':`Ход: игрок ${frame.projection.turn+1} · ${frame.projection.status} · Действий: ${frame.actions.length}`;
 const previous=String(frame.viewer);$('viewer').replaceChildren(new Option('Наблюдатель','-1'));for(let i=0;i<frame.projection.playerCount;i++)$('viewer').add(new Option('Игрок '+(i+1),String(i)));$('viewer').value=previous;
 renderScene();$('actions').replaceChildren(...frame.actions.map(a=>button(text(a.label),a.command)));
 $('events').replaceChildren(...frame.events.map(event=>node('li',text(event.message||event.kind||''))));
 $('rules').replaceChildren();ruleBlocks(frame.metadata.rulebook?.brief||frame.metadata.rulebook||frame.metadata.rules,$('rules'));
 $('projection').textContent=JSON.stringify(frame.projection,null,2);$('scene-data').textContent=JSON.stringify(frame.scene,null,2);
 $('checks').textContent=JSON.stringify(frame.check||frame.diagnostics||[],null,2);
 if(frame.debug){$('debug-data').hidden=false;$('debug-data').textContent=frame.debug.warning+'\n'+JSON.stringify(frame.debug.position,null,2);}
 else {$('debug-data').hidden=true;$('debug-data').textContent='';}
 $('history-status').textContent=`${frame.history.index+1} / ${frame.history.count}${frame.history.reviewing?' · Просмотр истории':''}`;
 lastRevision=frame.projection.revision;
}
async function request(op,extra={}){
 if(!['view','assets','check','debug'].includes(op))audio.stop();
 if(busy)return;busy=true;$('error').hidden=true;document.querySelectorAll('button').forEach(b=>{b.disabled=true;});
 try{player.cancel();const response=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-PlayRoom-SDK':token},body:JSON.stringify({op,...extra})});const value=await response.json();if(!response.ok)throw value;frame=value;render();if(frame.plan)await player.play(frame.plan,{effect:(cue,context)=>{if(cue.stage==='enter'&&!$('motion').checked){const animation=$('scene').animate([{opacity:.65},{opacity:1}],{duration:150});context.animation(animation);return animation.finished;}if(cue.stage==='sound'&&!$('mute').checked){context.cleanup(()=>audio.stop());return Promise.all(cue.sounds.map(id=>audio.play(id)));}}});if(frame.assets)await assets(frame.assets);return frame;}
 catch(error){$('error').hidden=false;$('error').textContent=JSON.stringify(error?.code?error:{code:'SDK_CONNECTION_FAILED'},null,2);}
 finally{busy=false;document.querySelectorAll('button').forEach(b=>{b.disabled=!!frame?.history?.reviewing&&(b.dataset.sdkCommand==='true'||b.id==='bot');});}
}
async function assets(report){
 for(const audio of $('asset-list').querySelectorAll('audio')){audio.pause();audio.removeAttribute('src');}urls.forEach(URL.revokeObjectURL);urls=[];$('asset-list').replaceChildren(node('p',`${report.files.length} / ${report.limits.maxFiles} файлов · ${report.bytes} / ${report.limits.maxBytes} байт`));
 for(const file of report.files){const figure=node('figure');figure.append(node('figcaption',file.file+' · '+file.bytes+' B'));const response=await fetch('/api/asset?file='+encodeURIComponent(file.file),{headers:{'X-PlayRoom-SDK':token}});if(response.ok){
  if(file.mime.startsWith('image/')||file.mime.startsWith('audio/')){const url=URL.createObjectURL(await response.blob());urls.push(url);const element=node(file.mime.startsWith('image/')?'img':'audio');element.src=url;if(element.tagName==='IMG')element.alt=file.file;else {element.controls=true;element.preload='metadata';element.onloadedmetadata=()=>{if(!Number.isFinite(element.duration)||element.duration>report.limits.audioSeconds){element.pause();element.removeAttribute('src');figure.append(node('p','SDK_AUDIO_DURATION_LIMIT: максимум '+report.limits.audioSeconds+' секунд'));}};}figure.append(element);}
  else if(file.mime==='application/json'){const motion=await response.json(),preview=node('span','●'),play=node('button','Показать анимацию');figure.append(preview,play);play.onclick=()=>{const duration=motion.frames.at(-1).time;if($('motion').checked||duration===0){preview.textContent='● Конечный кадр';return;}preview.animate(motion.frames.map(frame=>({offset:frame.time/duration,transform:`translate(${frame.values.x||0}px,${frame.values.y||0}px) rotate(${frame.values.rotation||0}deg) scale(${frame.values.scale??1})`,opacity:frame.values.opacity??1})),{duration,fill:'none'});};}
 }$('asset-list').append(figure);}
}
$('viewer').onchange=()=>request('view',{viewer:Number($('viewer').value)});
$('history-prev').onclick=()=>request('seek',{index:Math.max(0,frame.history.index-1)});
$('history-next').onclick=()=>request('seek',{index:Math.min(frame.history.count-1,frame.history.index+1)});
$('history-live').onclick=()=>request('seek',{index:null});
for(const [id,op]of [['start','start'],['bot','bot'],['reload','reload'],['check','check'],['assets','assets'],['debug','debug']])$(id).onclick=()=>request(op);
$('options').onsubmit=event=>{event.preventDefault();const data=new FormData(event.target);request('start',{options:{playerCount:Number(data.get('playerCount')),rng:Number(data.get('rng')),preset:data.get('preset'),firstPlayer:0}});};
$('save').onclick=async()=>{const result=await request('checkpoint');if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify(result.checkpoint)],{type:'application/json'}));const anchor=node('a');anchor.href=url;anchor.download=frame.pack.id+'-private-checkpoint.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('restore').onchange=async()=>{const file=$('restore').files[0];if(file&&file.size<=4*1024*1024){try{await request('restore',{checkpoint:JSON.parse(await file.text())});}catch{$('error').hidden=false;$('error').textContent='SDK_CHECKPOINT_INVALID';}}};
$('motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
$('mute').onchange=()=>{audio.setEnabled(!$('mute').checked);if(!$('mute').checked)audio.unlock();};
setInterval(async()=>{if(busy)return;try{const response=await fetch('/api/changed',{headers:{'X-PlayRoom-SDK':token}});if((await response.json()).changed)$('status').textContent='Исходники изменились. Нажмите «Перечитать код», чтобы начать новую партию.';}catch{}},5000);
request('view');
