(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PlayroomMatchSeries=api;
})(globalThis,function(){
 'use strict';

 const modes=new Set(['games','wins','score']);
 const validId=value=>typeof value==='string'&&value.length>0;
 const validNumber=value=>Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER;
 const fail=code=>{throw Object.assign(Error(code),{code});};

 function policy(value){
  if(!value||!modes.has(value.mode)||!validNumber(value.target)||value.target<=0||
    (value.mode==='score'?!validId(value.metricId):!Number.isSafeInteger(value.target)))fail('SERIES_POLICY_INVALID');
  const {mode,target,metricId}=value;
  return Object.freeze({mode,target,...(mode==='score'?{metricId}:{})});
 }

 function create(id,rules,playerIds){
  if(!validId(id)||!Array.isArray(playerIds)||!playerIds.length||!playerIds.every(validId)||
    new Set(playerIds).size!==playerIds.length)fail('SERIES_ROSTER_INVALID');
  return Object.freeze({
   version:1,id,rules:policy(rules),played:0,lastMatchId:null,
   totals:Object.freeze(playerIds.map(id=>Object.freeze({id,wins:0,points:0}))),
  });
 }

 function table(series){
  const {mode,target}=series.rules;
  const field=mode==='score'?'points':'wins';
  const best=Math.max(...series.totals.map(row=>row[field]));
  const complete=mode==='games'?series.played>=target:best>=target;
  return {complete,field,leaders:complete?series.totals.filter(row=>row[field]===best).map(row=>row.id):[]};
 }

 // The result screen only needs scores mapped to public player indices.
 function summary(series,playerIds){
  const {mode,target}=series.rules,{complete,field,leaders}=table(series);
  const seats=new Map(playerIds.map((id,index)=>[id,index]));
  return {rules:{mode,target},played:series.played,complete,
   rows:series.totals.map(row=>({player:seats.get(row.id),value:row[field],leader:leaders.includes(row.id)}))};
 }

 // The session saves the same pre-match snapshot for every replay. Players
 // are mapped through the committed seat order, which may change each match.
 function entry(series,playerIds){
  const roster=new Set(series?.totals?.map(row=>row.id));
  if(series?.version!==1||!Array.isArray(playerIds)||playerIds.length!==roster.size||
    new Set(playerIds).size!==roster.size||!playerIds.every(id=>roster.has(id)))fail('SERIES_ROSTER_INVALID');
  return {series,number:series.played+1,playerIds};
 }

 // Commit a terminal result exactly once. Sequence numbers prevent an old
 // receipt from becoming another match after the next game has started.
 function record(series,{id,number,playerIds,result}){
  if(!validId(id))fail('SERIES_MATCH_INVALID');
  if(number===series.played&&id===series.lastMatchId)return series;
  const match=entry(series,playerIds);
  if(number!==match.number||id===series.lastMatchId||table(series).complete)fail('SERIES_MATCH_OUT_OF_ORDER');
  if(!Array.isArray(result?.winners)||new Set(result.winners).size!==result.winners.length||
    !result.winners.every(index=>Number.isInteger(index)&&index>=0&&index<playerIds.length))fail('SERIES_RESULT_INVALID');
  const winners=new Set(result.winners.map(index=>playerIds[index]));
  let points=null;
  if(series.rules.mode==='score'){
   const metric=result.metrics?.find(row=>row.id===series.rules.metricId);
   if(!metric||metric.order==='asc'||metric.display==='ranking'||!Array.isArray(metric.values)||metric.values.length!==playerIds.length||
     !metric.values.every(validNumber))fail('SERIES_SCORE_INVALID');
   points=new Map(playerIds.map((player,index)=>[player,metric.values[index]]));
  }
  const totals=series.totals.map(row=>{
   const wins=row.wins+Number(winners.has(row.id)),score=row.points+(points?.get(row.id)??0);
   if(!Number.isSafeInteger(wins)||!validNumber(score))fail('SERIES_SCORE_INVALID');
   return wins===row.wins&&score===row.points?row:Object.freeze({id:row.id,wins,points:score});
  });
  return Object.freeze({...series,played:number,lastMatchId:id,totals:Object.freeze(totals)});
 }

 function finish(match,id,state){
  if(state?.status!=='finished')fail('SERIES_RESULT_INVALID');
  return record(match.series,{id,number:match.number,playerIds:match.playerIds,
   result:{winners:state.winners??(state.winner==null?[]:[state.winner]),metrics:state.result?.metrics}});
 }

 return Object.freeze({policy,create,table,summary,entry,record,finish});
});
