'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Engine=require('../core/engine.js');require('../packs/uno/rules.js');
const enhanced=true;
const visible=s=>Engine.project(s,-1).events;
const make=()=>Engine.createGame('uno',{players:[{name:'Иван'},{name:'Джон'}],preset:'quick',seed:42,unoMode:'manual'});
const makeOne=(s,who)=>{while(s.data.hands[who].length>1)s.data.drawPile.push(s.data.hands[who].pop());s.data.uno.situations[who].open=true;};
test('UNO accusation publishes localized target metadata',()=>{
  const pack=Engine.get('uno');
  if(enhanced)assert.match(pack.rules.join(' '),/обвин/i);
  const s=make(),before=s.data.hands[0].length;
  const action=Engine.reactions(s,0).find(a=>a.type==='accuse-uno'&&a.target===1);
  if(enhanced){assert.equal(action.targetPrompt,'UNO!');assert.equal(action.confirmation,undefined,'The player-card menu performs the accusation without a second confirmation');}
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


test('UNO results rank remaining hands by card points, preserve ties and finished order',()=>{
 const makeHand=(color,value)=>({color,value});
 const factory=require('../../playroom-paks/packs/uno/domain/game.js'),ending=require('../../playroom-paks/shared/domain/end-policy.js'),D=factory({ending});
 const hands=[[],[makeHand('red','9'),makeHand('blue','7')],[makeHand('red','skip')],[makeHand('wild','+4')],[makeHand('wild','wild')]];
 const s={status:'finished',winners:[0],data:{hands,points:[86,0,0,0,0],ending:ending.create(5,0,'winner')}};ending.record(s.data.ending,[0]);
 assert.deepEqual(D.score({...s,status:'playing'}),[86,0,0,0,0],'live scores never expose private hand point totals');assert.deepEqual(D.score(s),[0,16,20,50,50]);assert.deepEqual(D.result(s).places,[1,2,3,4,4]);assert.deepEqual(D.result(s).metrics[0].values,[0,16,20,50,50]);
 const zero=structuredClone(s);zero.data.hands[1]=[makeHand('red','0')];assert.deepEqual(D.result(zero).places,[1,2,3,4,4],'a zero-point hand still ranks after the player who finished');
 s.data.ending=ending.create(5,0,'last');ending.record(s.data.ending,[2]);ending.record(s.data.ending,[0]);s.data.hands[2]=[];assert.deepEqual(D.result(s).places,[2,3,1,4,4]);
});
