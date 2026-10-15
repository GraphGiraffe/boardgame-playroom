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

test('team results place the shared team disc behind each medal while solo results stay unchanged',()=>{
  const state={...projected,preset:'teams',status:'finished',winner:0,winners:[0,2],result:{places:[1,2,1,2],values:[8,5,8,5]},players:[{name:'Иван'},{name:'Тео'},{name:'Луна'},{name:'Сэм'}]};
  const teamBadges=[{label:'синяя',color:'#668fad'},{label:'красная',color:'#ce735d'}];
  const playerContent=state.players.map((_,index)=>({team:teamBadges[index%2]}));
  const html=Screen.resultMarkup({state,viewer:0,gameName:'Лудо',playerContent});
  assert.equal((html.match(/class="result-awards"/g)||[]).length,4);
  assert.equal((html.match(/class="player-medallion is-team"/g)||[]).length,4);
  assert.equal((html.match(/class="player-medallion is-place/g)||[]).length,4);
  assert.match(html,/Команда синяя/);assert.match(html,/Команда красная/);
  assert.equal((Screen.resultMarkup({state:{...state,preset:'individual'},viewer:0,gameName:'Лудо'}).match(/player-medallion is-team/g)||[]).length,0);
});

test('results reuse the first-player disc, under a medal when one is awarded',()=>{
  const state={...projected,status:'finished',winner:0,firstPlayer:0,result:{places:[1,4],values:[10,4]},players:[{name:'Первый'},{name:'Второй'}]};
  const solo=Screen.resultMarkup({state,viewer:0,gameName:'Шашки'});
  assert.match(solo,/<span class="result-awards"><span class="player-medallion is-place place-1"[^>]*>.*?<span class="player-medallion is-first"[^>]*aria-label="Первый ход"/);
  assert.equal((solo.match(/player-medallion is-first/g)||[]).length,1);
  const noMedal=Screen.resultMarkup({state:{...state,result:{places:[4,1],values:[4,10]}},viewer:0,gameName:'Шашки'});
  assert.match(noMedal,/class="result-awards"><span class="result-place-text"[^>]*>4<\/span><span class="player-medallion is-first"/);
  assert.match(noMedal,/class="player-medallion is-first"/);
  const teams=Screen.resultMarkup({state:{...state,preset:'teams'},viewer:0,gameName:'Лудо',playerContent:[{team:{id:'blue',label:'синяя',color:'#668fad'}},{team:{id:'red',label:'красная',color:'#ce735d'}}]});
  assert.match(teams,/class="player-medallion is-team"[^>]*aria-label="Команда синяя · первый ход"/);
  assert.equal((teams.match(/class="player-medallion is-first"/g)||[]).length,0);
});

test('results reuse player card counters and omit repeated team text',()=>{
  const state={...projected,preset:'teams',status:'finished',winner:0,winners:[0,2],firstPlayer:0,result:{label:'Фишек команды дома',detailLabel:'Свои фишки дома',places:[1,2,1,2],values:[8,5,8,5],details:[4,2,4,3]},players:[{name:'Иван',score:1},{name:'Тео',score:0},{name:'Луна',score:1},{name:'Сэм',score:0}]};
  const playerContent=state.players.map((p,i)=>({counters:[{kind:'pieces',value:state.result.details[i],label:'Фишки дома'},{kind:'wins',value:p.score}]}));
  const html=Screen.resultMarkup({state,viewer:0,gameName:'Лудо',playerContent,teamBadges:[{label:'синяя',color:'#668fad'},{label:'красная',color:'#ce735d'}]});
  assert.match(html,/class="result-awards"[\s\S]*?class="avatar p0"[\s\S]*?class="result-name"/);
  assert.match(html,/data-participant-role="player"/);
  assert.match(html,/class="result-name">[\s\S]*?<strong>Иван<\/strong>/);
  assert.doesNotMatch(html,/· вы/);
  assert.match(html,/data-score-kind="pieces"/);
  assert.doesNotMatch(html,/Команда: 8/);
  assert.doesNotMatch(html,/Свои фишки дома: /);
  assert.doesNotMatch(html,/Фишек команды дома: /);
});

test('local and network deletion share confirmation layout and preserve target routing',()=>{
 for(const network of [false,true]){
  const html=Screen.deleteConfirmation({name:'UNO <&',network,confirmAttrs:network?'data-delete-network-confirm="network-id"':'data-delete-confirm="local-id"'});
  assert.match(html,/Удалить партию\?/);assert.match(html,/class="lead"/);assert.match(html,/class="modal-foot"/);assert.match(html,/>Оставить</);assert.match(html,/data-ui-icon="trash"/);assert.match(html,/ Удалить</);assert.match(html,/UNO &lt;&amp;/);
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

test('portable history rejects stale audiences and only marks explicitly received backfill',async()=>{
 const History=require('../application/history-controller.js');
 const base={kind:'snapshot',sessionId:'one',authorityEpoch:'epoch',game:'cards',packVersion:'1.0.0',viewer:0,revision:4,historyLength:5};
 const pending=[],history=new History({read:index=>new Promise(resolve=>pending.push({index,resolve}))});
 history.receive(base);history.markPresented(4);history.open=true;
 const a=history.seek(1),b=history.seek(3);pending[1].resolve({...base,kind:'history',revision:3});await b;
 pending[0].resolve({...base,kind:'history',revision:1});assert.equal(await a,null);assert.equal(history.index,3);
 assert.equal(history.boundary,null);assert.equal(history.backfill(2,{origin:'scrub'}),false);
 assert.equal(history.backfill(2),true);history.select(0,{...base,revision:0});assert.equal(history.boundary,2);
 history.select(4,base);assert.equal(history.boundary,null);
 assert.throws(()=>history.select(2,{...base,viewer:1,revision:2}),/HISTORY_FRAME_INVALID/);
 const late=history.seek(2);history.close();pending[2].resolve({...base,revision:2});assert.equal(await late,null);
 assert.equal(history.index,null);assert.equal(history.progress.presentedRevision,4);
});

test('one screen queue presents every recovered revision once and separates selection from projections',async()=>{
 const Controller=require('../application/game-screen-controller.js'),shown=[];
 const frame=revision=>({kind:'snapshot',sessionId:'one',authorityEpoch:'epoch',game:'cards',packVersion:'1.0.0',viewer:0,revision,historyLength:revision+1,state:{turn:0,data:{hands:[[{id:'card'}],[]]}}});
 const client={snapshot:frame(0),history:async revision=>({...frame(revision),kind:'history'}),send:action=>action};
 const controller=new Controller({client,present:async(before,next,{show})=>{show();shown.push(next.revision);}});
 controller.selection='card';const context=controller.context(frame(0),{scope:'match'});context.viewState.field='mine';
 client.snapshot=frame(3);await controller.enqueue(client.snapshot);await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(shown,[1,2,3]);assert.equal(controller.shown.revision,3);assert.equal(controller.busy,false);
 assert.equal(controller.context(frame(3),{scope:'match'}).viewState.field,'mine');assert.equal(controller.selection,'card');
 const gone=frame(4);gone.state.data.hands[0]=[];controller.context(gone,{scope:'match'});assert.equal(controller.selection,null);
 assert.deepEqual(controller.send({type:'next'}),{type:'next'});controller.dispose();assert.throws(()=>controller.send({type:'next'}),/SCREEN_CLOSED/);
});

test('result metrics and teams use identifiers independent of labels, equal values and preset names',()=>{
 const UI=require('../core/ui.js'),team={id:'ocean',label:'Лазурные',color:'#668fad'};
 const state={status:'finished',winner:0,winners:[0],turn:0,move:2,firstPlayer:0,preset:'custom-partners',players:[{name:'А',score:5},{name:'Б',score:0}],data:{},
  scene:{players:[{player:0,team,metrics:[{id:'points',kind:'points',value:5,label:'Любое название'}]},{player:1,metrics:[{id:'points',kind:'points',value:0,label:'Другое'}]}]},
  result:{places:[1,2],metrics:[{id:'points',label:'Итог',values:[5,0]},{id:'other',label:'Ничья разрешена по',values:[5,1]}]}};
 const html=Screen.resultMarkup({state,viewer:0,gameName:'Пример'});
 assert.match(html,/Команда Лазурные · первый ход/);assert.doesNotMatch(html,/Итог: 5/);assert.match(html,/Ничья разрешена по: 5/);
 assert.equal(UI.teamFor({'custom-partners':{seatTeams:['ocean','sand','sand','ocean'],teams:[team,{id:'sand',label:'Песочные',color:'#e6ba52'}]}},'custom-partners',3).id,'ocean');
 assert.equal(UI.teamFor({invalid:{teams:null}},'invalid',0),null);
});
