'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const PlayerTarget=require('../core/player-target.js');
function make(){
  const tasks=new Map(),committed=[];let current=[{type:'challenge',target:1,label:'Проверить',targetPrompt:'UNO!'}],next=0;
  const target=new PlayerTarget({actions:()=>current,commit:a=>committed.push(a),root:()=>null,
    clock:{setTimeout:f=>{tasks.set(++next,f);return next;},clearTimeout:id=>tasks.delete(id)}});
  return {target,committed,tasks,setActions:actions=>current=actions,expire(){for(const task of [...tasks.values()])task();}};
}
test('a first target tap only arms a two-second selection; a second tap commits once',()=>{
  const {target,committed,tasks}=make();
  assert.equal(target.tap(1),true);assert.equal(target.active.label,'UNO!');assert.equal(tasks.size,1);
  assert.equal(committed.length,0);assert.equal(target.tap(1),true);
  assert.deepEqual(committed.map(a=>a.type),['challenge']);assert.equal(target.active,null);
  assert.equal(tasks.size,0);target.destroy();
});
test('expiring, changing targets, and losing legality never send a stale action',()=>{
  const x=make();
  x.target.tap(1);x.expire();assert.equal(x.target.active,null);assert.equal(x.committed.length,0);
  x.target.tap(1);x.setActions([{type:'challenge',target:2,label:'Проверить'}]);
  x.target.refresh();assert.equal(x.target.active,null);assert.equal(x.target.tap(1),false);
  x.target.tap(2);x.target.cancel();x.target.tap(2);x.expire();assert.equal(x.committed.length,0);
});
