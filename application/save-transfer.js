/* Portable, independent saves. No live room identity or reconnect capability. */
(function(root,factory){const api=factory(root.PlayroomProtocol||(typeof require==='function'?require('../core/protocol.js'):null),root.PlayroomReplayCodec||(typeof require==='function'?require('./replay-codec.js'):null),root.PlayroomSaveCompression||(typeof require==='function'?require('./save-compression.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomSaveTransfer=api;})(globalThis,function(Protocol,ReplayCodec,Compression){
 'use strict';const MAX_BYTES=48*1024*1024,{clone,canonical}=Protocol;
 const fail=code=>{throw Object.assign(Error(code),{code});},id=x=>typeof x==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(x),version=x=>typeof x==='string'&&x.length<=100&&/^\d+\.\d+\.\d+(?:[-+][\w.+-]+)?$/.test(x);
 async function digest(value){const data=new TextEncoder().encode(typeof value==='string'?value:canonical(value));if(data.length>MAX_BYTES)fail('SAVE_TOO_LARGE');return 'sha256:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');}
 function options(value,manifest){
  const keys=new Set(['seed','mode','packVersion','preset','presetLabel','openHands','firstPlayer','firstPlayerMode','portableRoomName',...(manifest.settings||[]).map(s=>s.key)]),out={};
  for(const key of keys)if(Object.hasOwn(value,key))out[key]=clone(value[key]);
  if(value.players)out.players=value.players.map(p=>({name:p.name,bot:!!p.bot,...(p.avatar?{avatar:p.avatar}:{}),...(p.botSettings?{botSettings:{difficulty:p.botSettings.difficulty}}:{})}));
  return out;
 }
 function sessionCopy(session,manifest,Session){const saved=session.export();saved.options=options(saved.options,manifest);saved.options.mode=saved.states[0].players.filter(p=>!p.bot).length>1?'pass':'solo';return Session.restore(session.engine,saved);}
 async function createRecord({kind='session',session,replay,pack,roomName='',Session,includePack=false}){
  const bundle=JSON.parse(pack),m=bundle.manifest;if(!id(m?.id)||!version(m.version))fail('SAVE_DEPENDENCY');
  const payload=kind==='session'?JSON.parse(sessionCopy(session,m,Session).serialize()):ReplayCodec.encode(cleanReplay(replay));
  if(kind==='session')payload.options.portableRoomName=String(roomName).slice(0,100);
  if(payload.game!==m.id||payload.packVersion!==m.version)fail('SAVE_DEPENDENCY');
  const content={format:'playroom-save',version:kind==='replay'?2:1,kind,roomName:String(roomName).slice(0,100),dependency:{id:m.id,version:m.version,sha256:await digest(bundle)},pack:includePack?clone(bundle):null,payload};
  const file={...content,sha256:await digest(content)},text=JSON.stringify(file);if(new TextEncoder().encode(text).length>MAX_BYTES)fail('SAVE_TOO_LARGE');
  if(kind==='replay'){
   const data=await Compression.encode(text,MAX_BYTES);
   if(data&&data.length+256<text.length){const compressed={format:'playroom-save',version:2,encoding:Compression.encoding,data};return {text:JSON.stringify({...compressed,sha256:await digest(compressed)}),checksum:file.sha256};}
  }
  return {text,checksum:file.sha256};
 }
 async function create(options){return (await createRecord(options)).text;}
 function cleanReplay(value){
  if(value?.encoding!==undefined)value=ReplayCodec.decode(value);
  if(!value||!id(value.game)||!version(value.packVersion)||!Array.isArray(value.frames)||!value.frames.length||value.frames.length>100000)fail('SAVE_REPLAY');
  const viewer=value.viewer;let prior=-1;
  const frames=value.frames.map(f=>{
   if(!f||typeof f!=='object'||f.game!==value.game||f.packVersion!==value.packVersion||f.viewer!==viewer||!Number.isSafeInteger(f.revision)||f.revision<=prior||f.state?.move!==f.revision||f.state.game!==value.game||f.state.packVersion!==value.packVersion||!Array.isArray(f.state.players)||f.state.players.length<1||f.state.players.length>32)fail('SAVE_REPLAY');prior=f.revision;
   return {revision:f.revision,viewer,game:value.game,packVersion:value.packVersion,state:clone(f.state),events:clone(f.events||[])};
  });if(!Number.isInteger(viewer)||viewer< -1||viewer>=frames[0].state.players.length)fail('SAVE_REPLAY');
  return {game:value.game,packVersion:value.packVersion,viewer,createdAt:Number.isSafeInteger(value.createdAt)?value.createdAt:Date.now(),updatedAt:Number.isSafeInteger(value.updatedAt)?value.updatedAt:Date.now(),frames};
 }
 async function inspect(text){
  if(typeof text!=='string'||new TextEncoder().encode(text).length>MAX_BYTES)fail('SAVE_TOO_LARGE');let value;try{value=JSON.parse(text);}catch{fail('SAVE_INVALID');}
  if(value?.format==='playroom-save'&&value.version===2&&value.encoding===Compression.encoding){
   if(Object.keys(value).some(k=>!['format','version','encoding','data','sha256'].includes(k)))fail('SAVE_FORMAT');
   const {sha256,...compressed}=value;if(sha256!==await digest(compressed))fail('SAVE_CHECKSUM');
   const expanded=await Compression.decode(value.data,MAX_BYTES);try{value=JSON.parse(expanded);}catch{fail('SAVE_INVALID');}
   if(value?.format!=='playroom-save'||value.version!==2||value.encoding!==undefined)fail('SAVE_FORMAT');
  }
  if(value?.format==='playroom-session')return {kind:'session',roomName:'',dependency:{id:value.game,version:value.packVersion||'0.1.0'},payload:value,pack:null,legacy:true};
  if(value?.format!=='playroom-save'||![1,2].includes(value.version)||!['session','replay'].includes(value.kind)||value.version===2&&(value.kind!=='replay'||value.payload?.encoding!==ReplayCodec.encoding)||Object.keys(value).some(k=>!['format','version','kind','roomName','dependency','pack','payload','sha256'].includes(k)))fail('SAVE_FORMAT');
  const {sha256,...content}=value;if(sha256!==await digest(content))fail('SAVE_CHECKSUM');const d=value.dependency;
  if(!id(d?.id)||!version(d.version)||!/^sha256:[0-9a-f]{64}$/.test(d.sha256)||value.payload?.game!==d.id||value.payload.packVersion!==d.version)fail('SAVE_DEPENDENCY');
  if(value.pack&&(value.pack.manifest?.id!==d.id||value.pack.manifest.version!==d.version||await digest(value.pack)!==d.sha256))fail('SAVE_DEPENDENCY');
  if(value.kind==='replay')value.payload=cleanReplay(value.payload);
  return value;
 }
 async function prepare(value,{packs,Session,engine}){
  const d=value.dependency;if(!id(d?.id)||!version(d.version))fail('SAVE_DEPENDENCY');
  let installed;try{installed=JSON.parse(packs.exportPack(d.id,d.version));}catch{}
  if(installed&&d.sha256&&await digest(installed)!==d.sha256)fail('SAVE_PACK_CONFLICT');
  if(!installed&&!value.pack)fail('SAVE_PACK_MISSING');
  const bundle=installed||packs.parse(value.pack),token=packs.prepare(bundle);
  const session=value.kind==='session'?packs.validatePrepared(token,()=>sessionCopy(Session.restore(engine,value.payload),bundle.manifest,Session)):null;
  return {value,token,session,needsPack:!installed};
 }
 async function install(prepared,{packs,library,clientHistory,guard=()=>{}}){
  guard();
  if(prepared.needsPack)await packs.install(prepared.token,{activate:false});
  guard();
  if(prepared.value.kind==='replay')return {kind:'replay',id:await clientHistory.importPortable(prepared.value.payload,prepared.value.roomName,guard)};
  const id=library.newId();await library.importAsync(prepared.session,id,prepared.value.roomName,guard);return {kind:'session',id};
 }
 return Object.freeze({MAX_BYTES,digest,create,createRecord,inspect,prepare,install,cleanReplay});
});
