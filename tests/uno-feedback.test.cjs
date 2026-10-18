'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../core/engine.js');require('../packs/uno/rules.js');
const enhanced=true;
const visible=s=>Engine.project(s,-1).events;
const make=()=>Engine.createGame('uno',{players:[{name:'Иван'},{name:'Джон'}],preset:'quick',seed:42,unoMode:'manual'});
const makeOne=(s,who)=>{while(s.data.hands[who].length>1)s.data.drawPile.push(s.data.hands[who].pop());s.data.uno.situations[who].open=true;};
test('UNO accusation publishes localized target metadata',()=>{
  const pack=Engine.get('uno');
  if(enhanced)assert.match(pack.rules.join(' '),/коснитесь его имени или руки/);
  const s=make(),before=s.data.hands[0].length;
  const action=Engine.reactions(s,0).find(a=>a.type==='accuse-uno'&&a.target===1);
  if(enhanced){assert.equal(action.targetPrompt,'UNO!');assert.match(action.confirmation,/Штраф за ошибку: \+2 карты/);}
  const out=Engine.applyAction(s,0,{type:'accuse-uno',target:1});
  assert.equal(out.turn,s.turn,'Reactions must not consume regular turns');
  assert.equal(out.data.hands[0].length,before+2,'False accusation penalizes accuser');
  if(enhanced){assert.match(visible(out).at(-1).notice.title,/Ложное обвинение/);assert.match(visible(out).at(-1).notice.detail,/\+2 карт/);assert.equal(visible(out).at(-1).notice.tone,'danger');}
  assert(Engine.validateState(out));
});
test('a missed UNO accusation penalizes the correct target, and the visible message describes the outcome',()=>{
  const s=make();makeOne(s,1);s.data.uno.pending=1;
  const out=Engine.applyAction(s,0,{type:'accuse-uno',target:1});
  assert.equal(out.data.hands[1].length,3);assert.equal(out.data.hands[0].length,5);
  if(enhanced){assert.match(visible(out).at(-1).notice.title,/пропустил UNO/);assert.match(visible(out).at(-1).notice.detail,/\+2 карт/);}
  assert.equal(visible(out).at(-1).sound.id,'penalty');assert(Engine.validateState(out));
});
test('early and correct shouts are prominent without changing early-call penalty semantics or leaking private cards',()=>{
  const s=make(),early=Engine.applyAction(s,0,{type:'declare-uno'});
  assert.equal(early.data.hands[0].length,s.data.hands[0].length);
  if(enhanced)assert.equal(visible(early).at(-1).notice.tone,'warning');
  assert.equal(visible(early).at(-1).sound.id,'uno.call');
  assert.equal(early.data.uno.declared[0],false);
  makeOne(s,0);const declared=Engine.applyAction(s,0,{type:'declare-uno'});
  assert.equal(declared.data.uno.declared[0],true);if(enhanced)assert.equal(visible(declared).at(-1).notice.tone,'success');
  assert(Engine.project(declared,1).data.hands[0].every(c=>c.hidden));
  assert(Engine.validateState(declared));
});
