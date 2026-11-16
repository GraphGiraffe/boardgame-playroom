'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
function fixture(t,{start='',render='',project='({count:position.data.count})'}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-sdk-security-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));for(const dir of ['sdk','domain','presentation'])fs.mkdirSync(path.join(root,dir));
 fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify({id:'probe',version:'1.0.0',sourceModules:{locales:{}}}));
 fs.writeFileSync(path.join(root,'sdk/project.json'),JSON.stringify({contractVersion:1,rules:['domain/game.js'],presentation:['presentation/scene.js']}));
 fs.writeFileSync(path.join(root,'domain/game.js'),`globalThis.PlayroomPackDefinition={contractVersion:1,id:'probe',minPlayers:2,maxPlayers:2,create:()=>{${start};return {playerCount:2,turn:0,status:'playing',winners:[],data:{count:0,secret:'hidden-alpha'}};},validate:()=>true,actions:()=>[{command:{type:'step'},visibility:'public'}],reduce:p=>({position:p,events:[]}),project:(position,viewer)=>${project},result:()=>({winners:[],places:[1,1],metrics:[]})};`);
 fs.writeFileSync(path.join(root,'presentation/scene.js'),`globalThis.PlayroomPackPresentation={scene:projection=>{${render};return {contractVersion:1,id:'probe',family:'board',players:[0,1].map(player=>({player,metrics:[]}))};}};`);
 return root;
}
module.exports={fixture};
