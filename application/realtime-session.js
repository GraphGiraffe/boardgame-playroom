/* Pack-facing realtime orchestration. Local preview is speculative; durable port owns commits. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRealtimeSession=api;})(globalThis,function(){
 'use strict';
 const Core=globalThis.PlayroomRealtime||(typeof require==='function'?require('../core/realtime.js'):null),P=globalThis.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null);
 const check=(value,code)=>{if(!value)throw Error(code);};
 const scopeKey=s=>JSON.stringify([s?.sessionId,s?.authorityEpoch,s?.roundId]);
 const validateScope=s=>check(s&&Object.keys(s).every(k=>['sessionId','authorityEpoch','roundId'].includes(k))&&['sessionId','authorityEpoch','roundId'].every(k=>typeof s[k]==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(s[k])),'REALTIME_SCOPE_INVALID');
 class Hub{
  constructor({scope,document=new Core.InkDocument(),authorize,commit,broadcastReliable,broadcastPreview,sendToActor,onError=()=>{},clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)}}){validateScope(scope);check(typeof authorize==='function'&&typeof commit==='function'&&typeof broadcastReliable==='function'&&typeof broadcastPreview==='function'&&typeof sendToActor==='function','REALTIME_PORT_REQUIRED');Object.assign(this,{scope:P.immutable(scope),document,authorize,commit,broadcastReliable,broadcastPreview,sendToActor,onError,clock});this.queue=Promise.resolve();this.pending=0;this.pendingBytes=0;this.repairs=new Set();this.committing=new Set();this.disconnects=new Map();this.closed=false;}
  allowed(actor,kind,value){check(!this.closed,'REALTIME_CLOSED');const result=this.authorize(actor,kind,value);check(!result?.then,'REALTIME_SYNC_AUTH_REQUIRED');check(result===true,'REALTIME_FORBIDDEN');}
  envelope(value){check(value&&scopeKey(value.scope)===scopeKey(this.scope),'REALTIME_SCOPE_MISMATCH');return value.data;}
  packet(data){return {scope:this.scope,data};}
  ensure(actor,data){let stroke;try{stroke=this.document.read(data.id);}catch(error){if(error.message!=='INK_STROKE_MISSING')throw error;}if(stroke){check(stroke.actor===actor,'INK_FORBIDDEN');if(data.style)this.document.begin({id:data.id,actor,style:data.style});return stroke;}const event=this.document.begin({id:data.id,actor,style:data.style});if(event){const pending=this.broadcastReliable(this.packet(event));if(pending?.catch)void pending.catch(this.onError);}return this.document.read(data.id);}
  preview(actor,envelope){
   const data=this.envelope(envelope);this.allowed(actor,'draw',data);check(Array.isArray(data.points)&&data.points.length<=128,'REALTIME_PREVIEW_LIMIT');const stroke=this.ensure(actor,data);if(stroke.committed||this.committing.has(data.id))return {ok:true,ignored:true};
   try{const event=this.document.append({...data,actor});if(event){const current=this.document.read(data.id),from=Math.max(0,event.from-8,current.points.length-128);this.broadcastPreview(this.packet({...event,from,points:current.points.slice(from)}));}return {ok:true};}
   catch(error){if(error.message!=='INK_GAP')throw error;const from=this.document.read(data.id).points.length;if(!this.repairs.has(data.id)){this.repairs.add(data.id);this.sendToActor(actor,this.packet({kind:'ink.repair-needed',id:data.id,from}));}return {ok:false,code:'INK_GAP',from};}
  }
  request(actor,method,envelope){
   let bytes;try{bytes=new TextEncoder().encode(JSON.stringify(envelope)).length;}catch(error){return Promise.reject(error);}
   if(bytes>512*1024||this.pendingBytes+bytes>4*1024*1024||this.pending>=64)return Promise.reject(Error('REALTIME_BACKPRESSURE'));
   this.pending++;this.pendingBytes+=bytes;
   const work=async()=>{
    const data=this.envelope(envelope);this.allowed(actor,['checkpoint','stroke'].includes(method)?'read':method==='finalize'?'finalize':'draw',data);
    if(method==='stroke')return this.packet({kind:'ink.stroke',stroke:this.document.read(data.id)});
    if(method==='checkpoint'){const checkpoint=this.document.checkpoint();return this.packet({kind:'ink.checkpoint',checkpoint,checkpointHash:await P.fingerprint(P.canonical(checkpoint))});}
    if(method==='begin'){this.ensure(actor,data);return {ok:true};}
    if(method==='append'){this.ensure(actor,data);const event=this.document.append({...data,actor});this.repairs.delete(data.id);if(event)await this.broadcastReliable(this.packet(event));return {ok:true};}
    if(method==='commit'||method==='finalize'){
     const stroke=this.document.read(data.id);check(stroke.actor===actor,'INK_FORBIDDEN');
     if(method==='commit'){
      check(Number.isSafeInteger(data.count)&&data.count>0&&data.count<=8192&&Number.isSafeInteger(data.seq)&&data.seq>=0&&typeof data.pointsHash==='string'&&/^sha256:[0-9a-f]{64}$/.test(data.pointsHash),'INK_COMMIT_INVALID');
      if(stroke.points.length<data.count)return {ok:false,code:'INK_REPAIR',from:stroke.points.length};
      check(stroke.points.length===data.count,'INK_COMMIT_CONFLICT');
     }
     this.committing.add(data.id);try{
      const pointsHash=await P.fingerprint(P.canonical(stroke.points));if(method==='commit')check(pointsHash===data.pointsHash,'INK_PREFIX_CONFLICT');
      const operation=this.document.prepareCommit({...stroke,actor,seq:Math.max(stroke.seq,data.seq||0),truncated:method==='finalize'});if(!operation)return {ok:true,duplicate:true,revision:this.document.revision};
      await this.commit(P.immutable(operation));check(!this.closed,'REALTIME_CLOSED');const event=this.document.commit(operation);this.repairs.delete(data.id);
      const {points,style,erased,...header}=event;await this.broadcastReliable(this.packet({...header,count:points.length,pointsHash,stateHash:await P.fingerprint(P.canonical(this.document.committedCheckpoint()))}));
      return {ok:true,revision:event.revision,confirmedPoints:points.length,truncated:!!event.truncated};
     }finally{this.committing.delete(data.id);}
    }
    if(method==='erase'){
     const operation=this.document.prepareErase({...data,actor});if(!operation)return {ok:true,duplicate:true,revision:this.document.revision};await this.commit(P.immutable(operation));check(!this.closed,'REALTIME_CLOSED');const event=this.document.erase(operation);await this.broadcastReliable(this.packet({...event,stateHash:await P.fingerprint(P.canonical(this.document.committedCheckpoint()))}));return {ok:true,revision:event.revision};
    }
    throw Error('REALTIME_METHOD_INVALID');
   };
   const readOnly=method==='checkpoint'||method==='stroke',result=(readOnly?Promise.resolve():this.queue).then(work).finally(()=>{this.pending--;this.pendingBytes-=bytes;});if(!readOnly)this.queue=result.catch(()=>{});return result;
  }
  disconnected(actor){if(this.disconnects.has(actor)||this.closed)return;this.disconnects.set(actor,this.clock.setTimeout(()=>{this.disconnects.delete(actor);for(const stroke of this.document.all())if(stroke.actor===actor&&!stroke.committed&&stroke.points.length)void this.request(actor,'finalize',this.packet(stroke)).catch(()=>{});},10000));}
  connected(actor){const timer=this.disconnects.get(actor);if(timer!==undefined)this.clock.clearTimeout(timer);this.disconnects.delete(actor);}
  resumed(actor){this.connected(actor);return this.request(actor,'checkpoint',this.packet({}));}
  close(){this.closed=true;for(const timer of this.disconnects.values())this.clock.clearTimeout(timer);this.disconnects.clear();this.repairs.clear();}
 }
 class Client{
  constructor({actor,scope,document=new Core.InkDocument(),request,sendPreview,onError=()=>{},onTruncate=()=>{}}){validateScope(scope);Object.assign(this,{actor,scope:P.immutable(scope),document,request,sendPreview,onError,onTruncate});this.repairs=new Map();this.committing=new Set();this.closed=false;this.sequence=0;this.proof=null;this.verifying=null;this.eventQueue=Promise.resolve();this.pendingEvents=0;}
  packet(data){return {scope:this.scope,data};}
  begin(id,style){check(!this.closed,'REALTIME_CLOSED');this.document.begin({id,actor:this.actor,style});return this.request('begin',this.packet({id,style}));}
  append(id,points){check(!this.closed,'REALTIME_CLOSED');check(!this.committing.has(id),'INK_FINALIZING');const stroke=this.document.read(id),seq=this.sequence=Math.max(this.sequence+1,stroke.seq+1);this.document.append({id,actor:this.actor,from:stroke.points.length,points,seq});const latest=this.document.read(id),from=Math.max(0,stroke.points.length-8,latest.points.length-128);this.sendPreview(this.packet({id,style:latest.style,seq,from,points:latest.points.slice(from)}));}
  async commit(id){
   const stroke=this.document.read(id);this.committing.add(id);
   try{const descriptor={id,count:stroke.points.length,seq:stroke.seq,pointsHash:await P.fingerprint(P.canonical(stroke.points))};for(let attempt=0;attempt<3;attempt++){
     const receipt=await this.request('commit',this.packet(descriptor));if(receipt.ok)return receipt;
     check(receipt.code==='INK_REPAIR'&&Number.isSafeInteger(receipt.from)&&receipt.from>=0&&receipt.from<=stroke.points.length,'INK_COMMIT_INVALID');
     const seq=this.sequence=Math.max(this.sequence+1,stroke.seq+1);await this.request('append',this.packet({...stroke,from:receipt.from,points:stroke.points.slice(receipt.from),seq}));descriptor.seq=seq;
    }throw Error('INK_REPAIR_LIMIT');
   }finally{this.committing.delete(id);}
  }

  erase(id,targets){return this.request('erase',this.packet({id,targets}));}
  repair(){
   if(this.closed||this.repairs.has('checkpoint'))return;
   const pending=this.request('checkpoint',this.packet({})).then(value=>this.receive(value)).catch(this.onError).finally(()=>this.repairs.delete('checkpoint'));this.repairs.set('checkpoint',pending);
  }
  verify(data){
   if(data.revision!==this.document.revision)return;
   if(typeof data.stateHash!=='string'||!/^sha256:[0-9a-f]{64}$/.test(data.stateHash)){this.repair();return;}
   this.proof={hash:data.stateHash,state:this.document.committedCheckpoint()};this.checkProofs();
  }
  checkProofs(){
   if(this.verifying||this.closed)return;
   this.verifying=(async()=>{while(this.proof&&!this.closed){const proof=this.proof;this.proof=null;if(await P.fingerprint(P.canonical(proof.state))!==proof.hash)this.repair();}})().catch(this.onError).finally(()=>{this.verifying=null;if(this.proof)this.checkProofs();});
  }
  async idle(){while(!this.closed&&(this.verifying||this.repairs.size||this.pendingEvents))await Promise.all([this.verifying,this.eventQueue,...this.repairs.values()]);}
  receive(envelope){
   if(['ink.commit','ink.erase','ink.checkpoint'].includes(envelope?.data?.kind)){
    this.pendingEvents++;const next=this.eventQueue.then(()=>this.receiveNow(envelope)).finally(()=>{this.pendingEvents--;});this.eventQueue=next.catch(this.onError);return this.eventQueue;
   }
   return this.receiveNow(envelope);
  }
  async acceptCommit(data){
   if(data.revision<=this.document.revision)return true;
   if(data.revision!==this.document.revision+1||!Number.isSafeInteger(data.count)||data.count<1||data.count>8192||typeof data.pointsHash!=='string'){this.repair();return false;}
   let stroke;try{stroke=this.document.read(data.id);}catch{}let points=stroke?.points;
   if(stroke&&stroke.points.length>data.count){this.repair();return false;}
   if(!stroke||stroke.points.length!==data.count||await P.fingerprint(P.canonical(stroke.points))!==data.pointsHash){
    const reply=await this.request('stroke',this.packet({id:data.id}));if(this.closed)return false;
    const full=reply?.data?.stroke;if(scopeKey(reply?.scope)!==scopeKey(this.scope)||!full||full.id!==data.id||full.actor!==data.actor||full.points.length!==data.count||await P.fingerprint(P.canonical(full.points))!==data.pointsHash){this.repair();return false;}
    try{this.document.begin(full);stroke=this.document.read(full.id);if(stroke.points.some((p,i)=>JSON.stringify(p)!==JSON.stringify(full.points[i]))){this.repair();return false;}points=full.points;}catch{this.repair();return false;}
   }
   try{this.document.commit({...stroke,...data,points});this.verify(data);return true;}catch{this.repair();return false;}
  }
  receiveNow(envelope){
   if(this.closed||scopeKey(envelope?.scope)!==scopeKey(this.scope))return false;const data=envelope.data;
   try{
    if(data.kind==='ink.checkpoint'){
     const safe=P.immutable(data);
     return P.fingerprint(P.canonical(safe.checkpoint)).then(hash=>{if(this.closed)return false;if(hash!==safe.checkpointHash)throw Error('INK_CHECKPOINT_HASH');return this.loadCheckpoint(safe.checkpoint);}).catch(error=>{this.onError(error);return false;});
    }
    if(data.kind==='ink.repair-needed'){if(this.committing.has(data.id))return false;const stroke=this.document.read(data.id);if(stroke.actor===this.actor)void this.request('append',this.packet({...stroke,from:data.from,points:stroke.points.slice(data.from),seq:this.sequence=Math.max(this.sequence+1,stroke.seq+1)})).catch(this.onError);return true;}
    if(data.kind==='ink.begin'){this.document.begin(data);return true;}
    if(data.kind==='ink.append'){try{this.document.read(data.id);}catch(error){if(error.message!=='INK_STROKE_MISSING')throw error;this.document.begin(data);}if(!this.document.read(data.id).committed)this.document.append(data);return true;}
    if(data.kind==='ink.commit')return this.acceptCommit(data);
    if(data.kind==='ink.erase'){this.document.erase(data);this.verify(data);return true;}
    throw Error('REALTIME_EVENT_INVALID');
   }catch(error){if(['INK_GAP','INK_REVISION_GAP','INK_STROKE_MISSING','INK_PREFIX_CONFLICT'].includes(error.message)){this.repair();return false;}this.onError(error);return false;}
  }
  loadCheckpoint(checkpoint){
     if(checkpoint.revision<this.document.revision)return false;
     const drafts=this.document.all().filter(s=>!s.committed);this.document.load(checkpoint);
     for(const draft of drafts){let host;try{host=this.document.read(draft.id);}catch(error){if(error.message!=='INK_STROKE_MISSING')throw error;}
      if(host?.committed){if(host.points.length<draft.points.length)this.onTruncate({id:draft.id,confirmedPoints:host.points.length,localPoints:draft.points.length});continue;}if(host&&host.points.length>=draft.points.length)continue;
      if(host&&host.points.some((p,i)=>JSON.stringify(p)!==JSON.stringify(draft.points[i])))continue;
      const from=host?.points.length||0;this.document.begin({id:draft.id,actor:draft.actor,style:draft.style});const seq=Math.max(draft.seq+1,(host?.seq||0)+1),points=draft.points.slice(from);
      if(draft.actor===this.actor)this.sequence=Math.max(this.sequence,seq);
      this.document.append({id:draft.id,actor:draft.actor,seq,from,points});if(draft.actor===this.actor)void this.request('append',this.packet({...draft,seq,from,points})).catch(this.onError);
     }return true;
  }
  close(){this.closed=true;this.proof=null;this.repairs.clear();}
 }
 return Object.freeze({Hub,Client,scopeKey});
});
