'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Wire=require('../app/transports/reliable-channel.js');
class Channel extends EventTarget{constructor(){super();this.readyState='open';this.bufferedAmount=0;this.sent=[];}send(data){this.sent.push(data);this.bufferedAmount+=Buffer.byteLength(data);queueMicrotask(()=>this.peer?.dispatchEvent(new MessageEvent('message',{data})));}drain(){this.bufferedAmount=0;this.dispatchEvent(new Event('bufferedamountlow'));}close(){if(this.readyState==='closed')return;this.readyState='closed';this.dispatchEvent(new Event('close'));}}
const tick=()=>new Promise(r=>setImmediate(r));
test('SCTP chunks preserve UTF-8 and control traffic passes a paused bulk message',async()=>{
 const a=new Channel(),b=new Channel();a.peer=b;b.peer=a;const sender=Wire.bind(a,{maxMessageSize:()=>4096}),receiver=Wire.bind(b),seen=[];receiver.listen(e=>seen.push(e.value));
 const big={kind:'history',text:'Линия😀'.repeat(50000)},pending=sender.send(big,{priority:'bulk'});await tick();assert(sender.metrics().queuedBytes>0);assert(receiver.metrics().incomplete===1);const control=sender.send({kind:'ack',revision:8},{priority:'control'});a.drain();await tick();assert.equal(seen[0].kind,'ack');
 while(sender.metrics().queuedBytes){a.drain();await tick();}await Promise.all([pending,control]);await tick();assert.deepEqual(seen[1],big);assert(a.sent.every(text=>Buffer.byteLength(text)<=4096));assert.deepEqual(receiver.metrics(),{queuedBytes:0,assemblingBytes:0,incomplete:0,closed:false});a.close();b.close();
});
test('queue is bounded and close rejects committed messages instead of dropping them',async()=>{
 const a=new Channel();a.bufferedAmount=Wire.HIGH;const pipe=Wire.bind(a),pending=pipe.send({text:'a'.repeat(Wire.LIMIT-100)});await assert.rejects(pipe.send({text:'b'.repeat(200)}),/QUEUE_LIMIT/);const rejected=assert.rejects(pending,/CLOSED/);a.close();await rejected;assert.equal(pipe.metrics().queuedBytes,0);
});
test('state messages retain FIFO while under backpressure',async()=>{
 const a=new Channel(),b=new Channel();a.peer=b;const sender=Wire.bind(a),receiver=Wire.bind(b),seen=[];receiver.listen(e=>seen.push(e.value.revision));a.bufferedAmount=Wire.HIGH;
 const promises=[sender.send({revision:1}),sender.send({revision:2}),sender.send({revision:3})];assert.equal(a.sent.length,0);a.drain();await Promise.all(promises);await tick();assert.deepEqual(seen,[1,2,3]);a.close();b.close();
});
test('invalid frames close the pipe and release all partial allocations',async()=>{
 for(const value of [{kind:'wire-chunk',v:1,id:'1',count:2,index:0,bytes:Wire.LIMIT+1,data:'YQ=='},{kind:'wire-chunk',v:1,id:'1',count:2,index:0,bytes:2,data:'%bad'},'x'.repeat(17000)]){
  const c=new Channel(),pipe=Wire.bind(c);c.dispatchEvent(new MessageEvent('message',{data:typeof value==='string'?value:JSON.stringify(value)}));assert.equal(c.readyState,'closed');assert.equal(pipe.metrics().assemblingBytes,0);
 }
});
