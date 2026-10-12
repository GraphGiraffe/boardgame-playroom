'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const PlayerTarget=require('../core/player-target.js');
function make(){let current=[{type:'challenge',target:1,targetKind:'player',label:'UNO!'},{type:'trade',target:1,targetKind:'player',label:'Обмен'},{type:'defend',target:1,label:'Побить'}];const committed=[];const target=new PlayerTarget({actions:()=>current,commit:a=>committed.push(a),root:()=>null});return {target,committed,setActions:a=>current=a};}
test('player menu exposes all player actions and repeated taps never execute',()=>{const x=make();assert.equal(x.target.available(1).length,2);assert.equal(x.target.tap(1),true);assert.equal(x.target.active,1);assert.equal(x.target.tap(1),false);assert.equal(x.target.active,null);assert.deepEqual(x.committed,[]);x.target.destroy();});
test('legality loss and cancellation discard selected targets',()=>{const x=make();x.target.tap(1);x.setActions([]);x.target.refresh();assert.equal(x.target.active,null);assert.equal(x.target.tap(1),false);assert.deepEqual(x.committed,[]);x.target.destroy();});

test('a selected source determines the immediate player action',()=>{
 let selected=null;const actions=[{type:'ask',card:'a',target:1,targetKind:'player',targetSource:true},{type:'ask',card:'b',target:1,targetKind:'player',targetSource:true}],committed=[];
 const controller=new PlayerTarget({actions:()=>actions,selected:()=>selected,commit:a=>committed.push(a),root:()=>null});assert.equal(controller.tap(1),false);selected='b';assert.equal(controller.tap(1),true);assert.deepEqual(committed,[actions[1]]);controller.destroy();
});
