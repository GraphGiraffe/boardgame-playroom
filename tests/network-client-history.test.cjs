'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Store=require('../app/network-client-history.js');
const frame=(rev=0,viewer=0)=>({kind:'snapshot',protocolVersion:3,sessionId:'game-1',authorityEpoch:'epoch-1',
  revision:rev,viewer,game:'uno',packVersion:'0.2.1',state:{move:rev,game:'uno',packVersion:'0.2.1',
    players:[{name:'A'},{name:'B'}],data:{hands:[null,[{id:'MY-CARD'}]]}},
  events:[{text:'Ход'}],room:{recovery:{tokens:[{token:'HOST-SECRET'}]}},
  resumeToken:'PRIVATE-GUEST-TOKEN',commandReceipt:{sessionId:'host-only'},actions:[{type:'play'}]});
test('client network archive only accepts projected snapshots and removes room secrets',()=>{
  const saved=Store.frame(frame());
  assert.deepEqual(Object.keys(saved).sort(),['authorityEpoch','events','game','packVersion','revision','sessionId','state','viewer']);
  const json=JSON.stringify(saved);
  assert(!json.includes('HOST-SECRET'));
  assert(!json.includes('PRIVATE-GUEST-TOKEN'));
  assert(!json.includes('host-only'));
  assert(!json.includes('actions'));
  assert(json.includes('MY-CARD'));
});
test('client history refuses mismatched state, protocol and missing projection',()=>{
  for(const value of [null,{}, {...frame(),protocolVersion:999},{...frame(),state:{move:100,game:'uno',packVersion:'0.2.1'}},
    {...frame(),viewer:99},{...frame(),state:null}])assert.throws(()=>Store.frame(value),/снимок/i);
});
test('client history key separates room from participant and does not expose bearer tokens',()=>{
  assert.equal(Store.id('room-1','participant-2'),'room-1|participant-2');
  assert.notEqual(Store.id('room-1','participant-2'),Store.id('room-1','participant-3'));
  assert.throws(()=>Store.id('', 'participant'));
});

test('client match IDs are scoped by Session, not only by room/seat',()=>{
  const id1=Store.id('room-1','participant-2','uno-session');
  const id2=Store.id('room-1','participant-2','checkers-session');
  assert.notEqual(id1,id2);
  assert.equal(id1,'room-1|participant-2|uno-session');
  // Previously saved RC7-derived entries retain their old archive ID.
  assert.equal(Store.id('room-1','participant-2'),'room-1|participant-2');
});
