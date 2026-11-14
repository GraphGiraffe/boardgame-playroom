'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),zlib=require('node:zlib'),crypto=require('node:crypto');
const {Recorder}=require('../app/diagnostics.js'),A=require('../platform/web/bug-report-attachments.js');
test('support log: gzip keeps measured events and excludes saves, credentials and arbitrary text',async()=>{
 const recorder=new Recorder();recorder.enabled=true;recorder.sample=()=>{};
 recorder.save=()=>{throw Error('must never export save');};
 recorder.record('error',{name:'TypeError',file:'game-screen.js',line:83,column:12,message:'private message',access_token:'private token',payload:{hand:['secret card']},arbitrary:'private text'});
 recorder.record('action',{type:'confirm',duration:12});
 const result=await A.log(recorder),raw=zlib.gunzipSync(Buffer.from(result.data,'base64')),trace=JSON.parse(raw);
 assert.equal(result.rawBytes,raw.length);assert.equal(result.bytes,Buffer.from(result.data,'base64').length);
 assert.equal(trace.format,'playroom-support-trace');assert.equal(trace.events[0].file,'game-screen.js');assert.equal(trace.events[0].line,83);assert.equal(trace.events[1].type,'confirm');
 for(const value of ['private message','private token','secret card','private text','game save'])assert(!raw.includes(value));
 assert.equal(trace.game,undefined);assert.equal(result.omitted,0);
});
test('support log: ring capacity, worst-case size, explicit truncation and empty recorder',async()=>{
 const recorder=new Recorder();recorder.enabled=true;recorder.sample=()=>{};
 assert.equal(await A.log(recorder),null);
 for(let i=0;i<6200;i++)recorder.record('sample',{duration:i,heapUsed:Math.floor(Math.random()*1e9),file:crypto.randomBytes(80).toString('hex'),metrics:Array.from({length:8},()=>Math.random()*1e9)});
 assert.equal(recorder.count,5000);const result=await A.log(recorder),trace=JSON.parse(zlib.gunzipSync(Buffer.from(result.data,'base64')));
 assert.equal(trace.dropped,1200);assert(result.bytes<=A.LOG_LIMIT);assert(result.rawBytes<=A.RAW_LOG_LIMIT);assert.equal(trace.events.at(-1).duration,6199);
 assert.equal(trace.omitted,result.omitted);assert.equal(trace.events.length+trace.omitted,5000);assert.equal(trace.baseline.length,64);
 console.log(JSON.stringify({scenario:'saturated-6200',rawBytes:result.rawBytes,gzipBytes:result.bytes,kept:result.events,omitted:result.omitted,ringDropped:trace.dropped}));
});
test('support recorder: hover noise and fast audio are summarized; interactions, errors and slow operations survive',()=>{
 const recorder=new Recorder();recorder.enabled=true;
 for(let i=0;i<1000;i++)recorder.interaction({name:i%2?'pointerenter':'pointerleave',interactionId:0,startTime:i,processingStart:i+1,processingEnd:i+2,duration:64});
 for(let id=1;id<=26;id++)for(const name of ['pointerdown','pointerup','click'])recorder.interaction({name,interactionId:id,startTime:id*100,processingStart:id*100+5,processingEnd:id*100+8,duration:name==='click'?112:32});
 for(let i=0;i<119;i++)recorder.record('audio.unlock',{status:'complete',duration:.2});
 recorder.record('audio.unlock',{status:'failed',duration:1});recorder.record('audio.unlock',{status:'complete',duration:80});recorder.record('error',{name:'TypeError',file:'app.js',line:12});recorder.sample();
 const trace=recorder.trace(),interactions=trace.events.filter(e=>e.kind==='interaction');assert.equal(interactions.length,26);assert(interactions.every(e=>e.phases===3&&e.event==='click'&&e.duration===112&&e.inputDelay===5));
 const sample=trace.events.find(e=>e.kind==='sample');assert.equal(sample.activity.hoverEvents,1000);assert.equal(sample.activity.quickAudioUnlocks,119);assert.equal(trace.events.filter(e=>e.kind==='audio.unlock').length,2);assert(trace.events.some(e=>e.kind==='error'));assert(!trace.events.some(e=>e.kind==='collector.sample'));recorder.stop();
});
test('support recorder: clearing stops capture, removes all buffers and does not cancel game timers',async()=>{
 const recorder=new Recorder();recorder.enabled=true;recorder.record('action',{type:'move'});let fired=false;recorder.clock('game').setTimeout(()=>{fired=true;},10);
 recorder.interaction({name:'click',interactionId:1,startTime:0,processingStart:1,processingEnd:2,duration:20});recorder.clear();
 assert.equal(recorder.enabled,false);assert.equal(recorder.count,0);assert.equal(recorder.written,0);assert.equal(recorder.interactions.size,0);assert.equal(recorder.timerHandles.size,0);assert.deepEqual(recorder.trace().events,[]);assert.deepEqual(recorder.trace().baseline,[]);assert.equal(recorder.trace().context,null);
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(fired,true);assert.equal(recorder.count,0);
});

test('support summary: final size only and passive trace does not add samples',()=>{
 const recorder=new Recorder();recorder.enabled=true;let samples=0;recorder.sample=()=>{samples++;};recorder.record('action',{type:'move'});const written=recorder.written;recorder.trace({sample:false});assert.equal(samples,0);assert.equal(recorder.written,written);recorder.trace();assert.equal(samples,1);
 assert.equal(A.formatLog({events:48,bytes:2355,rawBytes:31130}),'48 записей · 2.3 КБ.');assert.equal(A.formatLog(null),'0 записей · 0.0 КБ.');assert.equal(A.formatLog({events:1,bytes:1024}),'1 запись · 1.0 КБ.');
});
