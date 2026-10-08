'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Screen=require('../app/game-screen.js');
const projected={game:'uno',turn:1,move:5,players:[{name:'Первый',bot:false,score:9},{name:'Второй',bot:false,score:4}],data:{hands:[[{hidden:true}],[{hidden:true}]]}};
test('local and network use one GameScreen DOM contract with readable controls and players',()=>{
  const common={gameName:'UNO',subtitle:'Основной набор',state:projected,viewer:0,scene:'<div class="uno-scene"></div>',turnText:'Ходит Второй',turnExtra:'Ход 5',footerText:'Новая партия'};
  const local=Screen.render({...common,saved:true,footerAction:{command:'pause',label:'Пауза',icon:'pause'}});
  const network=Screen.render({...common,network:true,revision:5,footerAction:{command:'home',label:'К играм',icon:'back'}});
  for(const html of [local,network]){
    for(const selector of ['class="table-shell','class="table-header','class="table-tools','class="player-strip','class="scene ','class="table-bottom','data-command="history"','data-command="rules"'])
      assert.ok(html.includes(selector),`Missing ${selector}`);
    for(const name of ['Первый','Второй'])assert.ok(html.includes(name));
    assert.ok(!html.includes('shared-shell'));
    assert.ok(!html.includes('>История</button>'),'Header must use the original compact icon, not a large text button');
  }
  assert.match(network,/data-revision="5"/);
  assert.match(network,/data-viewer="0"/);
});
test('local and network history use the same inline controls and player targeting is allowed-only',()=>{
  const history=Screen.historyMarkup({index:2,count:6,caption:'Следующая карта',playing:false});
  for(const action of ['history-close','replay-prev','replay-next','replay-play'])assert.ok(history.includes(`data-command="${action}"`));
  assert.ok(history.includes('id="replay-range"'));
  const safe=Screen.playersMarkup(projected,0,[],{scoreLabel:'очки'});
  assert.ok(!safe.includes('data-accuse-player'));
  const allowed=Screen.playersMarkup(projected,0,[{type:'accuse-uno',target:1}],{scoreLabel:'очки'});
  assert.ok(allowed.includes('data-accuse-player="1"'));
  assert.ok(!allowed.includes('data-accuse-player="0"'));
});
