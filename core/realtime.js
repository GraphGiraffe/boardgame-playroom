/* Portable realtime mechanics. Coordinates/erasures are deterministic; no DOM or clocks. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRealtime=api;})(globalThis,function(){
 'use strict';
 const check=(ok,code)=>{if(!ok)throw Error(code);},id=v=>typeof v==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(v),integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
 const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
 const point=p=>{check(Array.isArray(p)&&p.length===2&&p.every(v=>integer(v,65535)),'INK_POINT_INVALID');return Object.freeze([p[0],p[1]]);};
 const points=values=>{check(Array.isArray(values)&&values.length<=8192,'INK_POINTS_LIMIT');return values.map(point);};
 const style=value=>{check(value&&Object.keys(value).every(k=>['color','width'].includes(k))&&/^#[0-9a-f]{6}$/i.test(value.color)&&integer(value.width,4096)&&value.width>0,'INK_STYLE_INVALID');return Object.freeze({color:value.color.toLowerCase(),width:value.width});};
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 class InkDocument{
  #strokes=new Map();#receipts=new Map();#listeners=new Set();#count=0;#revision=0;#receiptBytes=0;
  get revision(){return this.#revision;}
  get pointCount(){return this.#count;}
  subscribe(listener){this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
  #emit(change){const event=freeze(change);for(const listener of this.#listeners)listener(event);return event;}
  #get(key){const value=this.#strokes.get(key);check(value,'INK_STROKE_MISSING');return value;}
  read(key){const s=this.#get(key);return Object.freeze({id:s.id,actor:s.actor,style:s.style,points:Object.freeze(s.points.slice()),erased:Object.freeze([...s.erased].sort((a,b)=>a-b)),seq:s.seq,committed:s.committed,...(s.truncated?{truncated:true}:{})});}
  all(){return Object.freeze([...this.#strokes.keys()].map(key=>this.read(key)));}
  begin(value){
   check(id(value?.id)&&integer(value.actor,31),'INK_STROKE_INVALID');const paint=style(value.style),before=this.#strokes.get(value.id);
   if(before){check(before.actor===value.actor&&same(before.style,paint),'INK_ID_CONFLICT');return null;}
   check(this.#strokes.size<512,'INK_STROKES_LIMIT');this.#strokes.set(value.id,{id:value.id,actor:value.actor,style:paint,points:[],erased:new Set(),seq:0,committed:false});return this.#emit({kind:'ink.begin',id:value.id,actor:value.actor,style:paint});
  }
  append(value){
   const s=this.#get(value?.id);check(s.actor===value.actor,'INK_FORBIDDEN');check(integer(value.seq,Number.MAX_SAFE_INTEGER)&&value.seq>0&&integer(value.from,8192),'INK_SEQUENCE_INVALID');
   if(value.seq<=s.seq)return null;check(!s.committed,'INK_COMMITTED');check(value.from<=s.points.length,'INK_GAP');
   const batch=points(value.points),overlap=Math.min(batch.length,s.points.length-value.from);check(value.from+batch.length<=8192,'INK_POINTS_LIMIT');
   for(let i=0;i<overlap;i++)check(same(s.points[value.from+i],batch[i]),'INK_PREFIX_CONFLICT');
   const added=batch.slice(overlap);check(this.#count+added.length<=65536,'INK_DOCUMENT_LIMIT');const from=s.points.length;s.points.push(...added);s.seq=value.seq;this.#count+=added.length;
   return this.#emit({kind:'ink.append',id:s.id,actor:s.actor,style:s.style,seq:s.seq,from,points:Object.freeze(added)});
  }
  prepareCommit(value){
   const s=this.#get(value?.id);check(s.actor===value.actor,'INK_FORBIDDEN');check(integer(value.seq??s.seq,Number.MAX_SAFE_INTEGER),'INK_SEQUENCE_INVALID');const all=points(value.points);check(all.length>0&&all.length>=s.points.length,'INK_PREFIX_CONFLICT');
   for(let i=0;i<s.points.length;i++)check(same(s.points[i],all[i]),'INK_PREFIX_CONFLICT');check(this.#count+all.length-s.points.length<=65536,'INK_DOCUMENT_LIMIT');
   const operation=freeze({kind:'ink.commit',id:s.id,actor:s.actor,style:s.style,points:all,erased:[...s.erased].sort((a,b)=>a-b),seq:Math.max(s.seq,value.seq||0),revision:this.#revision+1,...(value.truncated?{truncated:true}:{})});
   if(s.committed){check(same(all,s.points),'INK_COMMIT_CONFLICT');return null;}return operation;
  }
  commit(value){
   const operation=this.prepareCommit(value);if(!operation)return null;check(value.revision===undefined||value.revision===operation.revision,'INK_REVISION_GAP');
   const s=this.#get(operation.id);this.#count+=operation.points.length-s.points.length;s.points=operation.points.slice();s.seq=operation.seq;s.committed=true;s.truncated=!!operation.truncated;this.#revision++;return this.#emit(operation);
  }
  prepareErase(value){
   check(id(value?.id)&&integer(value.actor,31)&&Array.isArray(value.targets)&&value.targets.length>0&&value.targets.length<=32,'INK_ERASE_INVALID');
   const targets=value.targets.map(target=>{const stroke=this.#get(target.id);check(Array.isArray(target.ranges)&&target.ranges.length>0&&target.ranges.length<=128,'INK_ERASE_INVALID');return {id:stroke.id,ranges:target.ranges.map(range=>{check(Array.isArray(range)&&range.length===2&&range.every(n=>integer(n,stroke.points.length-1))&&range[0]<=range[1],'INK_ERASE_INVALID');return [...range];})};});
   const signature=JSON.stringify({actor:value.actor,targets}),old=this.#receipts.get(value.id);if(old){check(old===signature,'INK_ID_CONFLICT');return null;}check(this.#receipts.size<4096&&new TextEncoder().encode(signature).length+this.#receiptBytes<=512*1024,'INK_OPERATIONS_LIMIT');
   return freeze({kind:'ink.erase',id:value.id,actor:value.actor,targets,revision:this.#revision+1});
  }
  erase(value){const operation=this.prepareErase(value);if(!operation)return null;check(value.revision===undefined||value.revision===operation.revision,'INK_REVISION_GAP');for(const target of operation.targets){const s=this.#get(target.id);for(const [from,to]of target.ranges)for(let i=from;i<=to;i++)s.erased.add(i);}const signature=JSON.stringify({actor:operation.actor,targets:operation.targets});this.#receipts.set(operation.id,signature);this.#receiptBytes+=new TextEncoder().encode(signature).length;this.#revision++;return this.#emit(operation);}
  segments(key){const s=this.#get(key),segments=[];let run=[];s.points.forEach((p,index)=>{if(s.erased.has(index)){if(run.length)segments.push(Object.freeze(run));run=[];}else run.push(p);});if(run.length)segments.push(Object.freeze(run));return Object.freeze(segments);}
  committedCheckpoint(){return freeze({format:'ink-committed-v1',revision:this.#revision,strokes:this.all().filter(s=>s.committed).map(({seq,...stroke})=>stroke),receipts:[...this.#receipts]});}
  checkpoint(){return freeze({format:'ink-v1',revision:this.#revision,strokes:this.all(),receipts:[...this.#receipts]});}
  load(value){
   check(value?.format==='ink-v1'&&integer(value.revision,Number.MAX_SAFE_INTEGER)&&Array.isArray(value.strokes)&&value.strokes.length<=512&&Array.isArray(value.receipts)&&value.receipts.length<=4096,'INK_CHECKPOINT_INVALID');
   const next=new InkDocument();
   for(const saved of value.strokes){check(!next.#strokes.has(saved.id),'INK_CHECKPOINT_INVALID');next.begin(saved);const s=next.#get(saved.id),batch=points(saved.points);check(integer(saved.seq,Number.MAX_SAFE_INTEGER)&&typeof saved.committed==='boolean'&&Array.isArray(saved.erased)&&saved.erased.every(n=>integer(n,batch.length-1)),'INK_CHECKPOINT_INVALID');check(next.#count+batch.length<=65536,'INK_DOCUMENT_LIMIT');s.points=batch;s.seq=saved.seq;s.committed=saved.committed;check(saved.truncated===undefined||typeof saved.truncated==='boolean','INK_CHECKPOINT_INVALID');s.truncated=!!saved.truncated;s.erased=new Set(saved.erased);next.#count+=batch.length;}
   for(const entry of value.receipts){check(Array.isArray(entry)&&entry.length===2&&id(entry[0])&&typeof entry[1]==='string'&&entry[1].length<=65536&&!next.#receipts.has(entry[0]),'INK_CHECKPOINT_INVALID');next.#receiptBytes+=new TextEncoder().encode(entry[1]).length;check(next.#receiptBytes<=512*1024,'INK_OPERATIONS_LIMIT');next.#receipts.set(entry[0],entry[1]);}
   this.#strokes=next.#strokes;this.#count=next.#count;this.#receipts=next.#receipts;this.#receiptBytes=next.#receiptBytes;this.#revision=value.revision;return this.#emit({kind:'ink.checkpoint',revision:this.#revision});
  }
 }
 const normalizeGuess=text=>String(text).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
 class GuessRound{
  #answer;#artist;#classify;#commit;#suggest;#records=new Map();#pending=Promise.resolve();
  constructor({artist,answer,classify=(guess,target)=>guess===target?'correct':'reject',commit,onSuggestion=()=>{}}){check(integer(artist,31)&&typeof answer==='string'&&normalizeGuess(answer)&&typeof classify==='function'&&typeof commit==='function','GUESS_CONFIG_INVALID');this.#artist=artist;this.#answer=normalizeGuess(answer);this.#classify=classify;this.#commit=commit;this.#suggest=onSuggestion;}
  #serial(fn){const pending=this.#pending.then(fn);this.#pending=pending.catch(()=>{});return pending;}
  guess(actor,value){return this.#serial(async()=>{
   check(integer(actor,31)&&actor!==this.#artist&&id(value?.id)&&typeof value.text==='string'&&value.text.length<=80&&normalizeGuess(value.text),'GUESS_INVALID');
   const before=this.#records.get(value.id);if(before){check(before.actor===actor&&before.text===value.text,'GUESS_ID_CONFLICT');return before.result;}
   check(this.#records.size<2048,'GUESS_LIMIT');const verdict=this.#classify(normalizeGuess(value.text),this.#answer);check(['correct','close','reject'].includes(verdict),'GUESS_CLASSIFICATION_INVALID');
   const record={id:value.id,actor,text:value.text,result:freeze({id:value.id,verdict:verdict==='close'?'pending':verdict})};
   if(verdict==='correct')await this.#commit(freeze({id:value.id,actor,verdict:'correct'}));
   this.#records.set(value.id,record);if(verdict==='close')this.#suggest(freeze({id:value.id,actor,text:value.text,artist:this.#artist}));return record.result;
  });}
  confirm(actor,guessId,verdict){return this.#serial(async()=>{check(actor===this.#artist&&['correct','close','reject'].includes(verdict),'GUESS_FORBIDDEN');const record=this.#records.get(guessId);check(record,'GUESS_NOT_FOUND');if(record.result.verdict!=='pending'){check(record.result.verdict===verdict,'GUESS_ALREADY_RESOLVED');return record.result;}await this.#commit(freeze({id:record.id,actor:record.actor,verdict,confirmedBy:actor}));return record.result=freeze({id:record.id,verdict});});}
 }
 return Object.freeze({InkDocument,GuessRound,normalizeGuess,coordinate:(value,extent)=>{check(Number.isFinite(value)&&Number.isFinite(extent)&&extent>0,'INK_COORDINATE_INVALID');return Math.round(Math.max(0,Math.min(1,value/extent))*65535);}});
});
