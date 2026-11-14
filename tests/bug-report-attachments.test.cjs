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
