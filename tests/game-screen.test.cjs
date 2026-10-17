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


test('field toggle is exclusive to an interactive network player with a Table',()=>{
 for(const [network,viewer,readOnly,allowed]of [[false,0,false,false],[true,-1,false,false],[true,0,true,false],[true,0,false,true]]){
  const html=Screen.render({state:projected,viewer,network,readOnly,fieldToggle:{hidden:true}});
  assert.equal(html.includes('data-command="toggle-field"'),allowed);
  assert.equal(Screen.quickAccessMarkup().includes('data-command="toggle-field"'),allowed);
  if(!allowed)assert.match(html,/data-command="history"/);
 }
});

test('history navigates explicit turn and round boundaries while the slider remains action based',()=>{
 const History=require('../application/history-controller.js');
 assert.equal(History.boundaryIndex(5,12,[0,3,8],-1),3);assert.equal(History.boundaryIndex(5,12,[0,3,8],1),8);
 assert.equal(History.boundaryIndex(3,12,[0,3,8],-1),0);assert.equal(History.boundaryIndex(8,12,[0,3,8],1),12);
 const html=Screen.historyMarkup({index:5,count:12,turnStarts:[0,3,6,8],roundStarts:[{revision:0,number:1},{revision:8,number:2}]});
 assert.match(html,/max="12" value="5"/);assert.match(html,/data-command="replay-round-prev"/);assert.match(html,/data-command="replay-round-next"/);assert.match(html,/history-round-marker/);assert.match(html,/history-turn-marker/);
 assert.doesNotMatch(Screen.historyMarkup({index:5,count:12}),/data-command="replay-round-prev"/);
});

test('history clamps preparation and keeps its view controls separate from the live view',async()=>{
 const History=require('../application/history-controller.js'),Controller=require('../application/game-screen-controller.js');
 const live={sessionId:'s',game:'battleship',packVersion:'test',viewer:0,revision:8,historyLength:9,state:{turn:0,data:{},timeline:{turn:3,starts:[4,6,8],playStart:4}}};
 const history=new History({read:async index=>({...live,revision:index})});history.receive(live);await history.enter(0);assert.equal(history.index,4);
 assert.equal(History.boundaryIndex(4,8,[4,6,8],-1,4),4);
 const html=Screen.historyMarkup({minimum:4,index:4,count:8,turnStarts:[4,6,8]});assert.match(html,/min="4" max="8" value="4"/);assert.match(html,/>0 \/ 4</);
 const controller=new Controller({client:{snapshot:live}});controller.context(live);controller.viewState.fleet='own';
 controller.history.open=true;controller.context(live);controller.viewState.fleet='enemy';controller.setPreference('followOpponent','off');
 controller.context({...live,state:{...live.state,turn:1}});assert.equal(controller.viewState.fleet,'enemy');assert.equal(controller.preferences({followOpponent:'on'}).followOpponent,'off');
 controller.history.open=false;controller.context(live);assert.equal(controller.viewState.fleet,'own');assert.equal(controller.preferences({followOpponent:'on'}).followOpponent,'on');
});

test('packs describe hand priority and physical seats without changing game identity or legality',()=>{
 const UI=require('../core/ui.js'),state={game:'fixture',players:Array.from({length:4},(_,i)=>({name:'P'+i,score:0})),turn:0,data:{}};
 const descriptor={api:2,family:'board',layout:{focus:'field',seats:['north-west','north-east','south-east','south-west'],duplicateSelf:true},elements:{field:'<div>field</div>'}};
 const circle=UI.composeScene(descriptor,{state,viewer:0});assert.match(circle,/data-seating="circle"/);assert.match(circle,/data-player-index="0" data-seat="north-west" data-seat-copy="true"/);assert.equal((circle.match(/data-player-index="0"/g)||[]).length,2);
 const row=UI.composeScene(descriptor,{state,viewer:0,seating:'row'});assert.match(row,/data-seating="row"/);assert.equal((row.match(/data-player-index="0"/g)||[]).length,1);
 assert.throws(()=>UI.composeScene({...descriptor,layout:{focus:'unknown'}},{state}),/layout policy/);
 assert.throws(()=>UI.composeScene({...descriptor,layout:{seats:['north']}},{state}),/layout policy/);
 const cards=UI.composeScene({...descriptor,family:'cards',layout:{focus:'hands'}},{state,viewer:0});assert.match(cards,/data-layout-focus="hands"/);assert.doesNotMatch(cards,/data-action=/);
});


test('Continuation cards share two summary lines and an independent avatar row',()=>{
  const state={players:[{name:'Иван'},{name:'Кира',bot:true}],turn:1,status:'playing',timeline:{turn:8},scene:{round:{kind:'round',number:4}}};
  for(const network of [false,true]){
    const html=Screen.resumeCard({state,network,roomName:'Комната Иван',gameName:'Морской бой',leave:network?'data-net-action="leave-active"':''});
    assert.match(html,/Морской бой · Раунд 4/);assert.doesNotMatch(html,/Ход 8/);
    assert.match(html,/class="resume-person saved-current-turn"/);assert.equal((html.match(/class="avatar /g)||[]).length,2);
    assert.equal(html.includes('connection-light'),network);assert.match(html,/resume-actions.*resume-participants/s);
  }
  assert.match(Screen.resumeCard({state,network:true,connected:false}),/is-disconnected/);
});

test('Toolbar exposes at most three context actions and keeps overflow in settings',()=>{
  const actions=['room','history','pause','full','help'].map(name=>({name,label:name,attrs:'data-command="'+name+'"'}));
  const html=Screen.toolbar(actions);
  assert.equal((html.match(/<button/g)||[]).length,4);
  assert.doesNotMatch(html,/data-command="full"/);
  assert.match(Screen.quickAccessMarkup(),/data-command="full"/);
});

test('duels always render a row even with a saved circular or anchored preference',()=>{
 const UI=require('../core/ui.js'),state={players:[{name:'A'},{name:'B'}],turn:0,data:{}};
 for(const seating of ['circle','anchors','row']){
  const html=UI.composeScene({api:2,family:'board',layout:{seats:['north-west','south-east'],duplicateSelf:true},elements:{field:'<div>field</div>'}},{state,viewer:0,seating});
  assert.match(html,/data-seating="row"/);assert.doesNotMatch(html,/data-seat-copy/);
 }
});
test('continuation avatars carry host, first-player and team badges with regular-weight progress',()=>{
 const teams=[{id:'a',label:'А',color:'#123'},{id:'b',label:'Б',color:'#456'}],state={players:[{name:'A'},{name:'B'},{name:'C'},{name:'D'}],firstPlayer:1,turn:2,preset:'teams',status:'playing',scene:{round:{number:3},players:[0,1,2,3].map(player=>({player,team:teams[player%2]}))}};
 const html=Screen.resumeCard({state,network:true,roomName:'Комната',gameName:'Игра',participants:[{playerIndex:1,isHost:true}]});
 assert.equal((html.match(/class="resume-player-group"/g)||[]).length,2);assert.match(html,/первый ход/i);assert.match(html,/хост/i);assert.match(html,/<strong>Игра<\/strong><span> · Раунд 3<\/span>/);
 assert.doesNotMatch(Screen.resumeCard({state,roomName:'Не показывать',gameName:'Игра'}),/Не показывать/);
});
