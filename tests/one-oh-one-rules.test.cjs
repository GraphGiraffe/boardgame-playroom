'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const factory=require('../packs/one-oh-one/domain/game.js');
const {shuffle}=require('../core/random.js');

function opening(value,options={}){
 const game=factory({shuffle(deck,state){
  const cards=shuffle(deck,state);
  // With three five-card hands the starter receives the thirteenth card.
  const position=cards.length-13,index=cards.findIndex(c=>c.value===value&&c.color==='red');
  [cards[position],cards[index]]=[cards[index],cards[position]];
  return cards;
 }});
 return {game,state:game.create({firstPlayer:0,playerCount:3,rng:17,options})};
}
test('the opening card triggers suit choice, cover, reversal, skip and the full spade penalty',()=>{
 for(const [rank,turn,extra] of [['Q',0,0],['8',0,0],['10',2,0],['A',2,0],['6',2,1],['7',2,2],['K',2,5]]){
  const {game,state}=opening(rank);assert(game.validate(state));assert.equal(state.turn,turn);
  assert.equal(state.data.hands[1].length,5+extra);
  if(rank==='Q')assert.deepEqual(game.actions(state,0).map(c=>c.command.type),Array(4).fill('choose-suit'));
  if(rank==='8')assert.equal(state.data.cover,'8');
 }
 assert.equal(opening('6',{six:'cover'}).state.data.cover,'6');
});
test('transfer uses the last rank or a mixed sum and applies the last-card penalty before scoring',()=>{
 const {game,state}=opening('7',{transfer:'sum',mix:'on'});
 const d=state.data;assert.equal(d.pending,2);
 const hand=d.hands[1],stock=d.drawPile,idx=stock.findIndex(c=>c.value==='6');
 [hand[0],stock[idx]]=[stock[idx],hand[0]];
 const card=hand[0];
 const play={type:'play',card:card.id};
 assert(game.actions(state,1).some(c=>c.command.card===card.id));
 d.settings.mix='off';assert(!game.actions(state,1).some(c=>c.command.card===card.id));
 d.settings.mix='on';assert.equal(game.reduce(state,1,play).position.data.pending,3);
 d.settings.transfer='last';assert.equal(game.reduce(state,1,play).position.data.pending,1);
 d.settings.transfer='sum';stock.push(...hand.splice(1));
 const next=game.reduce(state,1,play);assert.equal(next.position.data.hands[2].length,8);
 assert(next.position.data.waiting);assert.equal(next.position.turn,1);
 assert(next.events.findIndex(e=>e.type==='mau.draw-skipped')<next.events.findIndex(e=>e.type==='mau.deal-end'));
 assert(game.validate(next.position));
});
test('exhausted stock passes the turn and a final queen resets an exact 101',()=>{
 const {game,state}=opening('8');const d=state.data;
 d.hands[2].push(...d.drawPile.splice(0),...d.hands[0].splice(0));
 const empty=game.reduce(state,0,{type:'draw'});assert.equal(empty.position.turn,1);
 assert.equal(empty.events[0].params.count,0);
 const queenIndex=d.hands[2].findIndex(c=>c.value==='Q'&&c.color==='green');
 d.hands[0].push(...d.hands[2].splice(queenIndex,1));d.cover=null;d.settings.queen='any';d.points[0]=141;
 const ended=game.reduce(state,0,{type:'play',card:d.hands[0][0].id});
 assert.equal(ended.position.data.points[0],0);assert.equal(ended.position.data.queen,false);
});
