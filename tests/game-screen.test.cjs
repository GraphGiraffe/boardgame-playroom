'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Screen=require('../app/game-screen.js');
const projected={game:'uno',turn:1,move:5,players:[{name:'Первый',bot:false,score:9},{name:'Второй',bot:false,score:4}],data:{hands:[[{hidden:true}],[{hidden:true}]]}};
test('player targeting is exposed only for allowed actions',()=>{
  const safe=Screen.playersMarkup(projected,0,[],{scoreLabel:'очки'});
  assert.ok(!safe.includes('data-player-target'));
  const allowed=Screen.playersMarkup(projected,0,[{type:'accuse-uno',target:1,targetKind:'player'}],{scoreLabel:'очки'});
  assert.ok(allowed.includes('data-player-target="1"'));
  assert.ok(!allowed.includes('data-player-target="0"'));
});

test('shared result screen shows wins, losses, public spectator and hot seat names without leaking game state',()=>{
  const finished={...projected,status:'finished',winner:1,move:16};
  assert.match(Screen.resultMarkup({state:finished,viewer:1,gameName:'UNO'}),/Победа!/);
  assert.match(Screen.resultMarkup({state:finished,viewer:0,gameName:'UNO'}),/Поражение/);
  assert.match(Screen.resultMarkup({state:finished,viewer:-1,gameName:'UNO'}),/Второй побеждает/);
  const dialog=Screen.resultMarkup({state:finished,viewer:0,gameName:'UNO',scoreLabel:'очки',network:true});
  assert.match(dialog,/9|4/);assert.match(dialog,/result-replay/);assert.doesNotMatch(dialog,/Ещё партию/);
  assert.match(dialog,/Вернуться в комнату/);
  assert.doesNotMatch(dialog,/В меню/,'network result has a single explicit return action');
});

test('local and network deletion share confirmation layout and preserve target routing',()=>{
 for(const network of [false,true]){
  const html=Screen.deleteConfirmation({name:'UNO <&',network,confirmAttrs:network?'data-delete-network-confirm="network-id"':'data-delete-confirm="local-id"'});
  assert.match(html,/Удалить партию\?/);assert.match(html,/class="lead"/);assert.match(html,/class="modal-foot"/);assert.match(html,/>Оставить</);assert.match(html,/>Удалить</);assert.match(html,/UNO &lt;&amp;/);
  assert.equal(html.includes('только на этом устройстве'),network);
 }
});


test('the primary toolbar slot switches between room and results, including earlier replay frames',()=>{
 for(const network of [false,true])for(const historyResult of [false,true]){
  const html=Screen.render({state:{...projected,status:'playing'},viewer:0,network,historyResult,roomAction:{attrs:'data-command="room"'},historyHTML:historyResult?'<section class="history-panel"></section>':''});
  const toolbar=html.split('class="table-tools ui-toolbar">')[1].split('</div></header>')[0];
  assert.equal((toolbar.match(/data-game-primary=/g)||[]).length,1);
  assert.match(toolbar,new RegExp('data-command="'+(historyResult?'result':'room')+'"'));
  assert.doesNotMatch(toolbar,new RegExp('data-command="'+(historyResult?'room':'result')+'"'));
  assert(toolbar.indexOf('data-game-primary')<toolbar.indexOf('data-command="history"'));
 }
 assert.match(Screen.addPlayerButton(),/Подключить игрока или устройство/);
 assert.match(Screen.addPlayerButton(),/ui-icon-button/);
 assert.match(Screen.addPlayerButton({disabled:true}),/ disabled/);
});
