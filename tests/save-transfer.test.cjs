'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const T=require('../application/save-transfer.js'),E=require('../core/engine.js'),Session=require('../core/session.js'),Packs=require('../core/packs.js'),Library=require('../application/library.js');
const makeBundle=()=>({format:'playroom-pack',formatVersion:1,manifest:{id:'portable-fixture',name:'Portable',version:'1.0.0',engineApi:4,viewApi:3,stateVersion:1},files:{'styles.css':'.portable{color:inherit}','rules.js':require('./pack-fixture.cjs').rules({id:'portable-fixture',name:'Portable',min:2,max:2,preset:'base'}),'view.js':"globalThis.PlayroomViews.register('portable-fixture',()=>({api:3,family:'board',elements:{field:'<div>portable</div>'}}),()=>'<div>portable</div>');"}});
function fixture(){let source=null;const data=new Map(),storage={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};const views={helpers:{},register(){},get(){},remove(){}},packs=new Packs({engine:E,views,catalog:{},document:null,storage:{get:()=>source,set:v=>source=v}});packs.bootstrap([makeBundle()]);const session=new Session(E,'portable-fixture',{seed:17,preset:'base',mode:'pass',players:[{name:'A'},{name:'B'}],lobbyConfig:{resumeToken:'NEVER-EXPORT',password:'SECRET'},accessToken:'NEVER-EXPORT'}),library=new Library(()=>storage,E,Session,packs,{idFactory:()=>crypto.randomUUID()});return {packs,session,library,data};}
test('portable file retains full history, exact dependency and room name, and strips reconnect credentials',async()=>{
 const {packs,session,library}=fixture();const text=await T.create({session,pack:packs.exportPack(session.game,session.packVersion),Session,roomName:'Моя комната'});assert(!text.includes('NEVER-EXPORT'));assert(!text.includes('SECRET'));
 const value=await T.inspect(text),prepared=await T.prepare(value,{packs,Session,engine:E});assert.equal(prepared.needsPack,false);assert.deepEqual(prepared.session.states,session.states);const result=await T.install(prepared,{packs,library});assert.equal(library.list()[0].roomName,'Моя комната');assert.deepEqual(library.open(result.id).states,session.states);assert.equal(library.current(),null);
 const second=await T.install(prepared,{packs,library});assert.notEqual(result.id,second.id);assert.equal(library.records().length,2);
});
test('checksum, dependency mismatch, unknown format and missing version fail without modifying originals',async()=>{
 const {packs,session,library}=fixture(),text=await T.create({session,pack:packs.exportPack(session.game,session.packVersion),Session}),value=JSON.parse(text);value.roomName='tampered';await assert.rejects(T.inspect(JSON.stringify(value)),/CHECKSUM/);await assert.rejects(T.inspect('{'),/INVALID/);await assert.rejects(T.inspect('{"format":"unknown"}'),/FORMAT/);
 const parsed=await T.inspect(text);parsed.dependency.version='9.0.0';parsed.pack=null;await assert.rejects(T.prepare(parsed,{packs,Session,engine:E}),/MISSING/);assert.equal(library.records().length,0);
});
test('prepared validation stages exact missing rules without persisting pack and restores active registry on failure',async()=>{
 const {packs,session}=fixture(),bundle=makeBundle();bundle.manifest.version='1.0.1';bundle.files['rules.js']=require('./pack-fixture.cjs').rules({id:'portable-fixture',name:'Portable',version:'1.0.1',min:2,max:2,preset:'base'});const token=packs.prepare(bundle),old=E.get(session.game);assert.throws(()=>packs.validatePrepared(token,()=>{assert.equal(E.get(session.game,'1.0.1').version,'1.0.1');throw Error('invalid save');}),/invalid save/);assert.equal(E.get(session.game),old);assert.throws(()=>E.get(session.game,'1.0.1'));assert.equal(packs.list().length,1);
});
test('pack byte conflicts and invalid sessions do not persist dependencies; import failure preserves previous save',async()=>{
 const {packs,session,library,data}=fixture();await library.activateAsync(session,'existing');const before=[...data];const file=JSON.parse(await T.create({session,pack:packs.exportPack(session.game,session.packVersion),Session}));file.dependency.sha256='sha256:'+'0'.repeat(64);await assert.rejects(T.prepare(file,{packs,Session,engine:E}),/CONFLICT/);
 const legacy=await T.inspect(session.serialize());legacy.payload.options.players=[];await assert.rejects(T.prepare(legacy,{packs,Session,engine:E}));assert.deepEqual([...data],before);await assert.rejects(library.importAsync(session,'existing'),/CONFLICT/);assert.deepEqual([...data],before);
});
test('client portable replay keeps only frames and audience, rejects mixed viewers and removes transport capabilities',async()=>{
 const {packs,session}=fixture(),s=E.project(session.current,0),replay={game:session.game,packVersion:session.packVersion,viewer:0,frames:[{game:session.game,packVersion:session.packVersion,viewer:0,revision:0,state:s,events:[],resumeToken:'NEVER-EXPORT',actions:[{type:'tick'}]}],resumeToken:'NEVER-EXPORT',room:{password:'SECRET'}};
 const text=await T.create({kind:'replay',replay,pack:packs.exportPack(session.game,session.packVersion),Session});assert(!text.includes('NEVER-EXPORT'));assert(!text.includes('SECRET'));const value=await T.inspect(text);assert.equal(value.payload.viewer,0);replay.frames[0].viewer=1;assert.throws(()=>T.cleanReplay(replay),/REPLAY/);
});

test('malformed replay frames return the import error instead of leaking a TypeError',()=>{assert.throws(()=>T.cleanReplay({game:'portable-fixture',packVersion:'1.0.0',viewer:0,frames:[null]}),/SAVE_REPLAY/);});

test('cumulative projected journals export once and restore every frame including shortened historical journals',async()=>{
 const {packs,session}=fixture(),base=E.project(session.current,0),journal=Array.from({length:320},(_,id)=>({id,text:'event '+id+'x'.repeat(300)}));
 const replay={game:session.game,packVersion:session.packVersion,viewer:0,createdAt:1,updatedAt:2,frames:journal.map((_,revision)=>{const events=journal.slice(0,revision+1);return {game:session.game,packVersion:session.packVersion,viewer:0,revision,state:{...base,move:revision,events:revision===198?events.slice(-4):events},events};})};
 const before=JSON.stringify(replay),text=await T.create({kind:'replay',replay,pack:packs.exportPack(session.game,session.packVersion)}),container=JSON.parse(text),file=await T.inspect(text);
 assert.equal(container.encoding,'gzip-base64-v1');
 assert.equal(file.version,2);assert(text.length<before.length/20);assert.deepEqual(file.payload,replay);assert.equal(JSON.stringify(replay),before);
 // Old standalone exports retain their checksum and import semantics.
 file.version=1;file.payload=replay;delete file.sha256;file.sha256=await T.digest(file);assert.deepEqual((await T.inspect(JSON.stringify(file))).payload,replay);
 const C=require('../application/replay-codec.js'),bad=C.encode(replay);bad.frames[0].events=[-1];assert.throws(()=>T.cleanReplay(bad),/REPLAY/);
 const malformed=C.encode(replay);malformed.frames[0]=null;assert.throws(()=>C.decode(malformed),/REPLAY/);
 assert.throws(()=>C.decode(C.encode(replay),{maxBytes:1024}),/REPLAY/);
});

test('compressed replay rejects corruption, oversized expansion and nested containers',async()=>{
 const Z=require('../application/save-compression.js'),{packs,session}=fixture(),replay={game:session.game,packVersion:session.packVersion,viewer:0,frames:[{game:session.game,packVersion:session.packVersion,viewer:0,revision:0,state:E.project(session.current,0),events:[]}]},text=await T.create({kind:'replay',replay,pack:packs.exportPack(session.game,session.packVersion)}),file=JSON.parse(text);
 file.data=file.data.slice(0,-4)+'AAAA';await assert.rejects(T.inspect(JSON.stringify(file)),/CHECKSUM/);
 await assert.rejects(Z.decode(await Z.encode('x'.repeat(10000),T.MAX_BYTES),1000),/TOO_LARGE/);
 await assert.rejects(Z.decode('????',1000),/INVALID/);await assert.rejects(Z.decode('AAAA',1000),/INVALID/);
 const nested={format:'playroom-save',version:2,encoding:Z.encoding,data:await Z.encode(text,T.MAX_BYTES)};nested.sha256=await T.digest(nested);await assert.rejects(T.inspect(JSON.stringify(nested)),/FORMAT/);
});

test('normal saves reference the exact installed pack; only autonomous export embeds it',async()=>{
 const {packs,session}=fixture(),args={session,pack:packs.exportPack(session.game,session.packVersion),Session},normal=await T.inspect(await T.create(args)),autonomous=await T.inspect(await T.create({...args,includePack:true}));
 assert.equal(normal.pack,null);assert.deepEqual(normal.dependency,autonomous.dependency);assert.deepEqual(normal.payload,autonomous.payload);assert.equal(autonomous.pack.manifest.id,session.game);
 const missing={...normal,dependency:{...normal.dependency,version:'9.0.0'}};await assert.rejects(T.prepare(missing,{packs,Session,engine:E}),/MISSING/);
 const available=await T.prepare(normal,{packs,Session,engine:E});assert.equal(available.needsPack,false);assert.deepEqual(available.session.states,session.states);
});

test('library cards distinguish primary human and hotseat guests, including old summary headers',()=>{
 const {session,library,data}=fixture();library.activate(session,'roles');
 let row=library.list()[0];assert.equal(row.participants[0].primary,true);assert.equal(row.participants[1].primary,false);
 const raw=JSON.parse(data.get('playroom.session.v1'));for(const p of raw.librarySummary.participants)delete p.primary;
 data.set('playroom.session.v1',JSON.stringify(raw));row=library.list()[0];assert.equal(row.participants[0].primary,true);assert.equal(row.participants[1].primary,false);
 const UI=require('../core/ui.js');assert.match(UI.helpers.participantIcon(row.participants[0]),/data-ui-icon="player"/);assert.match(UI.helpers.participantIcon(row.participants[1]),/data-ui-icon="hand"/);
});
