// Delivery policy shared by the Edge Function and isolated sender checks.
export function validEndpoint(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(u.hostname);}catch{return false;}
}
export function createPushHandler({rpc,send,secret}){
 return async request=>{
  if(request.method!=='POST')return new Response(null,{status:405});
  if(!secret||request.headers.get('x-playroom-push-secret')!==secret)return new Response(null,{status:401});
  try{
   let data={};try{data=await request.json();}catch{}let announcement;
   if(data.operation==='important-update'){if(data.confirm!==true)return Response.json({error:'explicit-confirmation-required'},{status:400});announcement=await rpc('playroom_push_announce_update',{p_id:data.id,p_version:data.version,p_title:data.title,p_body:data.body});}
   const rows=await rpc('playroom_push_claim',{});let sent=0,retried=0;
   // Bounded concurrency keeps a slow provider from blocking the entire batch.
   for(let start=0;start<rows.length;start+=8)await Promise.all(rows.slice(start,start+8).map(async row=>{
    let result='drop';
    if(validEndpoint(row.subscription?.endpoint)){
     try{await send(row.subscription,JSON.stringify(row.payload));result='sent';sent++;}
     catch(error){result=[404,410].includes(error.statusCode)?'gone':[400,413].includes(error.statusCode)?'drop':'retry';if(result==='retry')retried++;}
    }
    await rpc('playroom_push_complete',{p_id:row.id,p_lease:row.lease,p_result:result});
   }));
   return Response.json({claimed:rows.length,sent,retried,...(announcement?{announcement}:{})});
  }catch{return Response.json({error:'push-delivery-unavailable'},{status:503});}
 };
}
