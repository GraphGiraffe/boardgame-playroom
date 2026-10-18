/* A tiny real API 3 definition for installation/rollback tests. */
exports.rules=({id,name='Fixture',version='1.0.0',key='value',step=1,min=2,max=2,preset='classic',action='add'}={})=>`(function(root){
const definition={contractVersion:1,id:${JSON.stringify(id)},minPlayers:${min},maxPlayers:${max},
 create:({playerCount,firstPlayer})=>({playerCount,turn:firstPlayer,status:'playing',winners:[],data:{${key}:0}}),
 validate:position=>Number.isSafeInteger(position.data.${key})&&position.data.${key}>=0&&position.data.${key}%${step}===0,
 actions:()=>[{command:{type:${JSON.stringify(action)}},visibility:'public'}],reduce:(position,actor)=>({position:{...position,turn:(actor+1)%position.playerCount,data:{${key}:position.data.${key}+${step}}},events:[{type:'fixture.added',actor,params:{step:${step}},visibility:{kind:'public'}}]}),
 project:position=>({...position.data}),result:position=>({winners:[],places:Array(position.playerCount).fill(1),metrics:[{id:'value',values:Array(position.playerCount).fill(0)}]})};
const message=key=>({key:'fixture.'+key,params:{}}),presentation={metadata:{name:message('name'),description:message('name'),scoreLabel:message('points'),presets:[{id:${JSON.stringify(preset)},label:message('name')}],rules:[message('name')]},action:()=>message('add'),event:()=>({message:message('added'),kind:'move'}),metric:()=>message('points'),scene:()=>({contractVersion:1,id:'fixture',family:'board',players:[]})};
root.TabletopCore.register(root.PlayroomPack.adaptModel({definition,presentation,locales:{ru:{'fixture.name':${JSON.stringify(name)},'fixture.points':'points','fixture.add':'add','fixture.added':'added'}},version:${JSON.stringify(version)}}));
})(globalThis);`;
