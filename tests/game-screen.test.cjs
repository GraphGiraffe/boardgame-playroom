'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Screen=require('../app/game-screen.js');
const projected={game:'uno',turn:1,move:5,players:[{name:'Первый',bot:false,score:9},{name:'Второй',bot:false,score:4}],data:{hands:[[{hidden:true}],[{hidden:true}]]}};
test('title fitting preserves the full title and user font while hiding a redundant mode after wrapping',()=>{
 for(const frame of [false,true])for(const fontSize of [20,40]){
  let inlineSize='14px',wrapped=false;
  const table={classList:{toggle:(_name,value)=>{wrapped=value;}}};
  const node={dataset:{fullTitle:'Стихийная потасовка',shortTitle:'Потасовка'},textContent:'Потасовка',
   style:{removeProperty:()=>{inlineSize='';},set fontSize(value){inlineSize=value;}},
   ownerDocument:{defaultView:{getComputedStyle:()=>({fontSize:String(fontSize),lineHeight:String(fontSize*1.2)})}},
   closest:selector=>selector==='.game-frame-title'?(frame?{}:null):selector==='.table-title'?table:null,
   scrollWidth:300,clientWidth:120,scrollHeight:fontSize*2.4};
  Screen.fitGameTitles({querySelectorAll:()=>[node]});
  assert.equal(node.textContent,node.dataset.fullTitle,'a narrow title does not become an abbreviation');
  assert.equal(inlineSize,'','the user font is not replaced by a smaller inline pixel size');
  if(!frame)assert.equal(wrapped,true,'two title lines replace the optional mode subtitle');
 }
});
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
  assert.match(dialog,/>В лобби</);assert.match(dialog,/>История</);assert.doesNotMatch(dialog,/data-command="(?:home|close-modal)"/);
  assert.doesNotMatch(dialog,/В меню/,'network result has a single explicit return action');
  const publicResult=Screen.resultMarkup({state:finished,viewer:-1,gameName:'UNO',network:true,returnAction:{command:'home',label:'К играм'}});assert.match(publicResult,/data-command="home"/);assert.doesNotMatch(publicResult,/data-command="rematch"/,'public read-only result does not offer an unauthorized lobby action');assert.equal(Screen.classifySurface('result-modal'),'screen');
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
  assert.match(noMedal,/class="result-awards"><span class="player-medallion is-place place-4 is-minor"/);
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
  assert.match(html,/Удалить партию\?/);assert.match(html,/class="lead"/);assert.match(html,/class="modal-foot"/);assert.match(html,/>Оставить</);assert.match(html,/data-ui-icon="trash"/);assert.match(html,/>Удалить</);assert.match(html,/UNO &lt;&amp;/);
  assert.equal(html.includes('только на этом устройстве'),network);
 }
});


test('the game menu retains room and results across replay frames without cluttering the header',()=>{
 for(const network of [false,true])for(const historyResult of [false,true]){
  const html=Screen.render({state:{...projected,status:'playing'},viewer:0,network,historyResult,roomAction:{attrs:'data-command="room"'},historyHTML:historyResult?'<section class="history-panel"></section>':''});
  const toolbar=html.split('class="game-frame-tools">')[1].split('</div></header>')[0];
  assert.doesNotMatch(toolbar,/data-game-primary/);
  assert.match(toolbar,/data-game-menu/);
  const primary=Screen.gameMenuActions().filter(a=>a.attrs.includes('data-game-primary'));
  assert.equal(primary.length,1);
  assert(primary[0].attrs.includes('data-command="'+(historyResult?'result':'room')+'"'));
  assert(Screen.gameMenuActions().some(a=>a.name==='room'));
  assert(Screen.gameMenuActions().some(a=>a.attrs.includes('data-command="history"')));
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
 const nextRound=frame(4);nextRound.state.turn=1;
 assert.equal(controller.context(nextRound,{scope:'match'}).viewState.field,'mine','match choice survives turn change');
 const other={...nextRound,viewer:1};controller.context(other,{scope:'match'}).viewState.field='theirs';
 assert.equal(controller.context(nextRound,{scope:'match'}).viewState.field,'mine','hotseat restores each viewer choice');
 assert.equal(controller.context(other,{scope:'match'}).viewState.field,'theirs');
 assert.deepEqual(controller.context({...nextRound,sessionId:'new'},{scope:'match'}).viewState,{},'new match clears choices');
 const gone=frame(4);gone.state.scene={players:[{player:0,hand:[]}]};controller.context(gone,{scope:'match'});assert.equal(controller.selection,null);
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
  if(!allowed){if(network&&!readOnly)assert.match(html,/data-room-chat-open/);else assert(Screen.gameMenuActions().some(a=>a.attrs.includes('data-command="history"')));}
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
 const descriptor={api:3,family:'board',layout:{focus:'field',seats:['north-west','north-east','south-east','south-west'],duplicateSelf:true},elements:{field:'<div>field</div>'}};
 const circle=UI.composeScene(descriptor,{state,viewer:0});assert.match(circle,/data-seating="circle"/);assert.match(circle,/data-player-index="0" data-seat="north-west" data-seat-copy="true"/);assert.equal((circle.match(/data-player-index="0"/g)||[]).length,2);
 const row=UI.composeScene(descriptor,{state,viewer:0,seating:'row'});assert.match(row,/data-seating="row"/);assert.equal((row.match(/data-player-index="0"/g)||[]).length,1);
 assert.throws(()=>UI.composeScene({...descriptor,layout:{focus:'unknown'}},{state}),/layout policy/);
 assert.throws(()=>UI.composeScene({...descriptor,layout:{seats:['north']}},{state}),/layout policy/);
 const cards=UI.composeScene({...descriptor,family:'cards',layout:{focus:'hands'}},{state,viewer:0});assert.match(cards,/data-layout-focus="hands"/);assert.doesNotMatch(cards,/data-action=/);
});


test('Continuation cards share heading, player and room progress rows',()=>{
  const state={players:[{name:'Иван'},{name:'Кира',bot:true}],turn:1,status:'playing',timeline:{turn:8},scene:{round:{kind:'round',number:4}}};
  for(const transportMode of ['hotseat','network','online']){
    const network=transportMode!=='hotseat';
    const html=Screen.resumeCard({state,network,transportMode,roomName:'Комната Иван',gameName:'Морской бой',leave:network?'data-net-action="leave-active"':''});
    assert.match(html,new RegExp('data-transport-mode="'+transportMode+'"'));assert.match(html,/<strong>Морской бой<\/strong>/);assert.match(html,/Раунд 4 · Ход 8/);assert.match(html,/session-card-heading.*session-card-room.*resume-participants.*session-card-progress/s);
    assert.match(html,/class="resume-person saved-current-turn"/);assert.equal((html.match(/class="avatar /g)||[]).length,2);
    assert.equal(html.includes('connection-light'),network);assert.match(html,/resume-actions.*resume-participants/s);
  }
  assert.match(Screen.resumeCard({state,network:true,connected:false}),/is-disconnected/);
  for(const [move,label] of [[0,'0 действий'],[1,'1 действие'],[2,'2 действия'],[5,'5 действий'],[11,'11 действий'],[21,'21 действие'],[22,'22 действия'],[25,'25 действий']]) {
    assert(Screen.resumeCard({state:{...state,move},gameName:'Игра'}).includes(label),'continuation card shows '+label);
  }
});

test('Toolbar keeps two context actions plus fixed fullscreen and settings slots',()=>{
  const actions=['room','history','pause','full','help'].map(name=>({name,label:name,attrs:'data-command="'+name+'"'}));
  const html=Screen.toolbar(actions);
  assert.equal((html.match(/<button/g)||[]).length,4);
  assert.match(html,/data-command="full"/);
  assert.doesNotMatch(html,/data-command="pause"/);
  assert.match(Screen.quickAccessMarkup(),/data-command="pause"/);
  const frame=Screen.toolbar(actions,{gameMenu:{network:true}});
  assert.doesNotMatch(frame,/data-game-quick="history"/);assert(Screen.gameMenuActions().some(action=>action.attrs.includes('data-command="history"')),'History remains in the game menu');assert.match(frame,/data-game-quick="fullscreen"/);assert.match(frame,/data-game-menu/);
  assert.doesNotMatch(frame,/data-command="pause"|data-command="help"/,'rare actions stay in the menu');
});

test('duels preserve declared base anchors unless row seating is explicitly selected',()=>{
 const UI=require('../core/ui.js'),state={players:[{name:'A'},{name:'B'}],turn:0,data:{}};
 for(const seating of ['circle','anchors','row']){
  const html=UI.composeScene({api:3,family:'board',layout:{seats:['north-west','south-east'],duplicateSelf:true},elements:{field:'<div>field</div>'}},{state,viewer:0,seating});
  if(seating==='row'){assert.match(html,/data-seating="row"/);assert.doesNotMatch(html,/data-seat-copy/);}else{assert.match(html,/data-seating="circle"/);assert.match(html,/data-seat-copy/);}
 }
});
test('continuation avatars carry host, first-player and team badges with regular-weight progress',()=>{
 const teams=[{id:'a',label:'А',color:'#123'},{id:'b',label:'Б',color:'#456'}],state={players:[{name:'A'},{name:'B'},{name:'C'},{name:'D'}],firstPlayer:1,turn:2,preset:'teams',status:'playing',scene:{round:{number:3},players:[0,1,2,3].map(player=>({player,team:teams[player%2]}))}};
 const html=Screen.resumeCard({state,network:true,roomName:'Комната',gameName:'Игра',participants:[{playerIndex:1,isHost:true}]});
 assert.doesNotMatch(html,/resume-player-group/);assert.match(html,/первый ход/i);assert.match(html,/хост/i);assert.match(html,/<strong>Игра<\/strong>/);assert.match(html,/<strong class="session-card-room">Комната<\/strong>.*<span class="session-card-stats">Раунд 3<\/span>/);
 assert.deepEqual([...html.matchAll(/resume-person-name[^>]*>.*?<span[^>]*>([A-D])<\/span>/g)].map(m=>m[1]),['A','B','C','D']);
 assert.match(Screen.resumeCard({state,roomName:'Локальная комната',gameName:'Игра'}),/Локальная комната/);
});

 test('recent cards retain only unfinished games or a connected finished room',()=>{
  for(const network of [false,true])for(const connected of [false,true])for(const status of ['playing','finished']){
    const html=Screen.resumeCard({state:{...projected,status},network,connected});
    assert.equal(!!html,status!=='finished'||(network&&connected),`${network}/${connected}/${status}`);
  }
 });

test('finish tokens show minor places, last loser and exit time in results and live avatars',()=>{
 const state={...projected,status:'finished',winner:0,winners:[0],result:{places:[4,5],values:[0,0],lastPlayers:[1],exits:[{player:0,kind:'cards',round:5}]},scene:{players:[{player:0,finishPlace:4},{player:1}]}};
 const html=Screen.resultMarkup({state,viewer:0,gameName:'Игра'});
 assert.match(html,/is-minor/);assert.match(html,/is-last/);assert.match(html,/Сбросил карты · Раунд 5/);
 assert.doesNotMatch(html,/result-place-text/);
 const UI=require('../core/ui.js');
 assert.match(UI.playerPanel({...state,status:'playing'},0,0),/player-avatar-wrap[\s\S]*?place-4 is-minor/);
});


test('result metric fraction precision formats text without creating a counter',()=>{
 const state={...projected,status:'finished',winner:0,result:{places:[1,2],metrics:[{id:'damage',label:'Урон',maximumFractionDigits:1,values:[1.5,2]}]}};
 let html=Screen.resultMarkup({state,viewer:0,gameName:'Игра'});
 assert.match(html,/Урон: 1,5/);assert.match(html,/Урон: 2/);assert(!html.includes('Урон: 2,0'));
 state.result.metrics[0].values=[1/3,2/3];html=Screen.resultMarkup({state,viewer:0,gameName:'Игра'});
 assert.match(html,/Урон: 0,3/);assert.match(html,/Урон: 0,7/);
});

test('all packs use one result sound on first presentation, with neutral intermediate places',()=>{
 const fs=require('node:fs'),path=require('node:path'),packs=path.join(__dirname,'../packs');
 for(const game of fs.readdirSync(packs).filter(id=>fs.existsSync(path.join(packs,id,'manifest.json')))){
  const state={game,status:'finished',winner:0,players:[{},{},{}],result:{places:[1,2,3]}};
  for(const [viewer,sound] of [[0,'victory'],[1,'draw-game'],[2,'defeat'],[-1,'notify']]){
   const owner={},heard=[];assert.equal(Screen.presentResultSound(owner,state,viewer,ids=>heard.push(...ids)),true);
   assert.equal(Screen.presentResultSound(owner,structuredClone(state),viewer,ids=>heard.push(...ids)),false);
   assert.deepEqual(heard,[sound],game);
  }
  assert.equal(Screen.resultSound({...state,winner:null},0),'draw-game');
  assert.equal(Screen.resultSound({...state,winners:[0,1]},1),'victory');
 }
});

test('shared landscape allocation stays stable across player counts and balances side zones',()=>{
 for(const [width,height]of [[844,390],[932,430],[1024,600]]){
  const zones=Screen.landscapeZones(width,height,1);
  assert.equal(zones.self,zones.opponents,'side zones are equal');
  for(const count of [2,3,7]){const other=Screen.landscapeZones(width,height,count);assert.equal(other.field,zones.field);assert.equal(other.self,zones.self);assert.equal(other.opponents,zones.opponents);}
  assert(zones.field<=height-12,'field fits the usable height');
  assert(Math.abs(zones.opponents+zones.field+zones.self+24-width)<=3,'all zones share one viewport budget');
 }
 const dense=Screen.landscapeZones(844,390,7);
 assert.equal(dense.columns,1,'narrow side zones preserve two identity rows beside the avatar');
 assert.equal(Screen.landscapeZones(1200,390,7).columns,2,'wide side zones fit two complete cards');
 assert.equal(dense.self,dense.opponents);
});

// Header markup carries its canonical glyph so the prepaint policy can be idempotent.
test('surface header markup defers fullscreen until its type and keeps canonical icon Back controls',()=>{
 const html=Screen.modalHead('Настройки',{symbol:'settings'});
 assert.match(html,/data-surface-symbol="settings"/);
 assert.match(Screen.modalHead(''),/<h2><\/h2>/,'empty header slot remains replaceable by the native chat identity');
 assert(html.indexOf('data-surface-symbol')<html.indexOf('<h2'));
 assert.doesNotMatch(html,/data-surface-fullscreen/,'untyped header must not preadd fullscreen');
 assert.match(html,/data-command="close-modal"/);
});


test('geometry identity follows the authorized session pack and audience rather than names or turn data',()=>{
 const identity=options=>Screen.render({layoutId:'session-a',gameName:'UNO',state:{...projected,packVersion:'0.6.8-preview.3'},viewer:0,scene:'<div class="app-game-layout" data-surface="combined"></div>',...options}).match(/data-geometry-identity="([^"]+)"/)[1];
 const initial=identity({});assert.equal(identity({state:{...projected,packVersion:'0.6.8-preview.3',move:6,players:projected.players.map(p=>({...p,name:'Changed',score:20}))}}),initial);
 for(const options of [{viewer:-1},{viewer:1},{readOnly:true},{replay:true},{historyHTML:'<div>history</div>'},{layoutId:'session-b'},{state:{...projected,packVersion:'0.6.9'}}])assert.notEqual(identity(options),initial,'different authority audience never reuses authored private geometry');
});

test('diagnostic recorder is bounded, keeps timings and exports game data only on request',async()=>{
 const {Recorder,LIMIT}=require('../app/diagnostics.js'),r=new Recorder();let saves=0;r.configure({save:()=>{saves++;return {format:'fixture-save'};}});
 r.record('off',{duration:1});assert.equal(r.count,0);assert.equal(r.begin(),null);r.enabled=true;
 for(let i=0;i<LIMIT+7;i++)r.record('sample',{revision:i,duration:2,token:'private-token',url:'private-url',email:'private-email'});
 assert.equal(saves,0,'no game serialization while collecting');const report=await r.report();assert.equal(saves,1);assert.equal(report.events.length,LIMIT);assert(report.dropped>=7);assert.equal(report.game.status,'included');assert(report.events.every(e=>!('token'in e)&&!('url'in e)&&!('email'in e)));assert(!JSON.stringify(report.events).includes('private-'));
 assert.equal(await r.measure('async',async()=>42),42);await assert.rejects(r.measure('failure',async()=>{throw Error('secret failure');}));assert(!JSON.stringify((await r.report()).events).includes('secret failure'));r.stop();const count=r.written;r.record('after-stop');assert.equal(r.written,count);
});

test('zone alignment contains oversized content and supports edge alignment',()=>{
 assert.deepEqual(Screen.alignInZone({x:10,y:20,width:100,height:80},{width:30,height:20},{inline:'end',block:'start',inset:4}),{x:76,y:24,width:30,height:20});
 assert.deepEqual(Screen.alignInZone({x:0,y:0,width:100,height:80},{width:200,height:200}),{x:0,y:0,width:100,height:80});
});

test('fullscreen keeps the established player width and gives remaining width to the opponent zone',()=>{
 const before=Screen.landscapeZones(797,339,7),after=Screen.landscapeZones(832,384,7,true,before.self);
 assert.equal(after.self,before.self);assert.equal(after.field,384-12);assert(after.opponents<after.self);
});

test('screen layout selects one declared profile independently of player count',()=>{
 const cases=[[{},'standard'],[{seatAnchors:'true'},'bases'],[{soloField:'true'},'field-only'],[{surface:'player'},'player-only']];
 for(const [options,expected] of cases)for(const playerCount of [1,2,4,8])assert.equal(Screen.screenLayout({...options,playerCount}),expected);
});

test('pack overrides declare only the affected zones and reject unknown policies',()=>{
 const UI=require('../core/ui.js'),state={...projected,players:projected.players};
 const scene={api:3,family:'board',elements:{field:'<div>field</div>'}};
 const html=UI.composeScene({...scene,layout:{overrides:{opponentsAlign:'end',playerIndicators:'below-avatar',mirrorIndicators:true}}},{state,viewer:0});
 assert.match(html,/data-opponents-align="end"/);assert.match(html,/data-player-indicators="below-avatar"/);assert.doesNotMatch(html,/data-field-columns/);
 assert.throws(()=>UI.composeScene({...scene,layout:{overrides:{gameName:'battleship'}}},{state}),/layout overrides/);
 assert.throws(()=>UI.composeScene({...scene,layout:{overrides:{fieldColumns:17}}},{state}),/layout overrides/);
});


test('one immutable snapshot is presented once across duplicate snapshot and ACK delivery',async()=>{
 const Controller=require('../application/game-screen-controller.js'),shown=[];
 const frame=revision=>Object.freeze({kind:'snapshot',sessionId:'dedup',authorityEpoch:'epoch',game:'cards',packVersion:'1',role:'player',viewer:0,revision,historyLength:revision+1,state:{turn:0}});
 const client={snapshot:frame(0),history:async revision=>({...frame(revision),kind:'history'})},controller=new Controller({client,present:async(before,next,{show})=>{show();shown.push(next);}});
 const next=frame(1);client.snapshot=next;await Promise.all([controller.enqueue(next),controller.enqueue(next),controller.enqueue(next)]);await new Promise(setImmediate);assert.deepEqual(shown,[next]);
 const control=Object.freeze({...next,controlRevision:1});client.snapshot=control;await controller.enqueue(control);await new Promise(setImmediate);assert.equal(shown.at(-1),control,'a new control snapshot at the same game revision is still delivered');
});

test('planning readiness does not backfill invisible revisions during public playback',async()=>{
 const Controller=require('../application/game-screen-controller.js'),shown=[],reads=[];
 const frame=(revision,event=1,window='round:2')=>({sessionId:'same',authorityEpoch:'same',game:'fixture',packVersion:'1',viewer:0,role:'player',revision,historyLength:revision+1,events:[{id:event}],state:{status:'playing',turn:0,scene:{plan:{id:'public:round:1'},decisionWindow:{id:window}}}});
 const client={snapshot:frame(0),history:async revision=>{reads.push(revision);return {...frame(revision),kind:'history'};}},controller=new Controller({client,present:async(_before,next,{show})=>{show();shown.push(next.revision);}});
 client.snapshot=frame(8);await controller.enqueue(client.snapshot);await new Promise(setImmediate);assert.deepEqual(reads,[]);assert.deepEqual(shown,[8]);assert.equal(controller.history.count,8,'all committed revisions remain reviewable');
 client.snapshot=frame(11,2);await controller.enqueue(client.snapshot);await new Promise(setImmediate);assert.deepEqual(reads,[9,10],'a new public event still backfills its boundaries');
 assert.equal(Controller.planningUpdate(frame(0),frame(8,1,'another-window')),false);assert.equal(Controller.planningUpdate(frame(0),{...frame(8),paused:true}),false);assert.equal(Controller.planningUpdate(frame(0),{...frame(8),viewer:1}),false);
 assert.equal(Controller.planningUpdate(frame(0),{...frame(8),state:{...frame(8).state,turn:1}}),true,'the coordination turn may change inside a simultaneous decision window');
});
