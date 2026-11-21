'use strict';
// A complete deterministic position for both browser and portable-host checks.
// Every card comes from the actual created deck; no rule or hidden-view adapter
// is replaced. Two simultaneous earth hits kill the central water player.
function prepareLoot(state,{finalDeath=false}={}){
 const d=state.data;if(d.players.length!==3)throw Error('LOOT_FIXTURE_REQUIRES_THREE');
 const cards=[...d.deck,...d.discard,...d.players.flatMap(p=>p.hand)];
 const take=element=>{const i=cards.findIndex(c=>c.element===element);if(i<0)throw Error('LOOT_FIXTURE_CARD_MISSING');return cards.splice(i,1)[0];};
 d.board=Array(d.size*d.size).fill('ground');d.startingBases=[[0,0],[0,d.size-1],[d.size-1,d.size-1]];for(const [y,x]of d.startingBases)d.board[y*d.size+x]='base';
 for(const [i,pos]of [[2,2],[2,1],[2,3]].entries())Object.assign(d.players[i],{pos,health:3,maxHand:i?3:8,hand:(i?['earth']:['water','fire','air','earth','water','fire','air','earth']).map(take)});
 if(finalDeath)d.players[0].lives=1;
 d.deck=cards;d.discard=[];d.frames=[];d.shrink=null;
 return state;
}
function resolveLoot(E,state){
 for(const [actor,element,direction]of [[0,'water',0],[1,'earth',1],[2,'earth',3]]){const cardId=state.data.players[actor].hand.find(c=>c.element===element).id,command=E.project(state,actor).modelProjection.actions.find(c=>c.type==='plan'&&c.cardId===cardId&&c.action==='attack'&&c.direction===direction);if(!command)throw Error('LOOT_FIXTURE_PLAN_MISSING');state=E.applyAction(state,actor,command);}
 return state;
}
function prepareEffect(state,{kind,element}={}){
 const d=state.data,cards=[...d.deck,...d.discard,...d.players.flatMap(p=>p.hand)],take=element=>cards.splice(cards.findIndex(c=>c.element===element),1)[0];
 d.board=Array(d.size*d.size).fill('ground');d.startingBases=[[0,0],[d.size-1,d.size-1],...(d.players.length===3?[[0,d.size-1]]:[])];for(const [y,x]of d.startingBases)d.board[y*d.size+x]='base';
 let a=[1,1],b=[1,2];if(kind==='move'){a=[2,0];b=[0,3];}if(kind==='fall'){a=[1,2];b=[1,3];}if(kind==='shrink'){a=[2,2];b=[0,2];}
 for(let i=0;i<d.players.length;i++)Object.assign(d.players[i],{pos:i===0?a:i===1?b:[4,4],health:i===1&&kind==='death'?1:3,hand:(i===0?[element]:i===1?['earth','water']:['earth']).map(take)});
 if(kind==='ultimate')d.players[0].ultimate=1;d.deck=cards;d.discard=[];d.frames=[];d.shrink=kind==='shrink'?d.round:null;return state;
}
module.exports={prepareLoot,resolveLoot,prepareEffect};
