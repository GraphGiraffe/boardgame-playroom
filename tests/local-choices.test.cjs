'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),P=require('../core/protocol.js'),Projection=require('../presentation/network-projection.js');
const dir=path.resolve(__dirname,'../../playroom-paks/packs');for(const id of fs.readdirSync(dir).filter(id=>fs.existsSync(path.join(dir,id,'manifest.json')))){
 const manifest=require(path.join(dir,id,'manifest.json'));require(path.join(dir,id,'rules.js'));
 test('client choices match authoritative permitted commands: '+id,()=>{
  const players=Math.max(...manifest.playModes.flatMap(m=>m.players)),session=new Session(E,id,{seed:17,players:Array.from({length:players},(_,i)=>({name:'P'+i})),firstPlayerMode:'assigned',firstPlayer:0,actionsPerTurn:'2',unoMode:'manual'}),authority=new Authority(session,{clock:{now:()=>20000,setTimeout:()=>1,clearTimeout(){}}});
  const bindings=Array.from({length:players},(_,i)=>authority.connect(i)),table=authority.connectTable(Array.from({length:players},(_,i)=>i));
  const clean=frame=>{const actor=frame.role==='table'?frame.actor:frame.viewer,commands=actor<0?[]:E.availableCommands(session.current,actor),normalize=action=>{const found=commands.find(c=>Object.keys(c).every(k=>P.canonical(c[k])===P.canonical(action[k])));return found?{...found,...(action.disabled?{disabled:true}:{})}:action;};return {state:{...frame.state,...(frame.state.tableActions?{tableActions:frame.state.tableActions.map(normalize)}:{})},actions:frame.actions.map(normalize),independentActions:frame.independentActions.map(normalize)};};
  const difference=(a,b,path='')=>{if(P.canonical(a)===P.canonical(b))return null;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)])){const out=difference(a[key],b[key],path+'.'+key);if(out)return out;}}return path+': '+JSON.stringify(a)?.slice(0,120)+' != '+JSON.stringify(b)?.slice(0,120);};
  try{for(let step=0;step<70;step++){
    for(const c of [...bindings,table]){const expected=c.snapshot(),raw=c.snapshot({wire:true}),compact=Projection.compact(raw);assert(!Object.hasOwn(compact.model,'actions'));assert(!Object.hasOwn(compact.model.data,'previews'));const restored=Projection.restore(compact,(event,snapshot)=>E.get(id).presentEvent(event,snapshot.state.players),E.get(id));const diff=difference(clean(restored),clean(expected));assert(!diff,id+' revision '+session.current.move+' viewer '+raw.viewer+' actor '+raw.actor+' '+diff);}
    if(session.current.status!=='playing')break;const w=E.decisionWindow(session.current),actor=w?.participants.find(i=>!w.ready.includes(i))??session.current.turn,action=E.botAction(session.current,actor);if(!action)break;session.act(actor,action);
   }}finally{bindings.forEach(c=>c.close());table.close();authority.dispose();}
 });
}
