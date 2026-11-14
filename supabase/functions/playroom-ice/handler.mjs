/* Credentials never leave this authenticated endpoint as long-term secrets. */
export function createIceHandler({authorize,issue,now=()=>Date.now(),ttl=86400}){
 const cache=new Map(),flights=new Map();
 const allowed=origin=>{if(!origin)return true;try{const u=new URL(origin);return ['https://graphgiraffe.github.io','https://seth.tail6aebd4.ts.net'].includes(u.origin)||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname);}catch{return false;}};
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(allowed(origin)&&origin?{'Access-Control-Allow-Origin':origin}:{}),'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
  const reply=(status,data)=>new Response(data===null?null:JSON.stringify(data),{status,headers});
  if(!allowed(origin))return reply(403,{code:'forbidden'});
  if(request.method==='OPTIONS')return reply(204,null);
  if(request.method!=='POST')return reply(405,{code:'method'});
  const token=request.headers.get('authorization');if(!/^Bearer [A-Za-z0-9._-]{16,10000}$/.test(token||''))return reply(401,{code:'auth-required'});
  let body;try{body=await request.json();}catch{return reply(400,{code:'invalid'});}
  if(!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body?.roomId||''))return reply(400,{code:'invalid'});
  let access;try{access=await authorize(token,body.roomId);}catch{return reply(401,{code:'auth-required'});}
  if(!access?.userId)return reply(403,{code:'forbidden'});
  let entry=cache.get(access.userId);
  if(!entry||entry.expiresAt<=now()+300000){
   let flight=flights.get(access.userId);
   if(!flight){flight=(async()=>{
    const result=await issue(ttl,access.userId);
    const iceServers=[];
    for(const server of result?.iceServers||[]){
     const urls=(Array.isArray(server.urls)?server.urls:[server.urls]).filter(url=>typeof url==='string'&&/^(stun|turn|turns):(stun|turn)\.cloudflare\.com:\d+(\?transport=(udp|tcp))?$/.test(url)&&!/:53(?:\?|$)/.test(url));
     if(!urls.length)continue;
     if(urls.some(url=>/^turns?:/.test(url))){if(typeof server.username!=='string'||typeof server.credential!=='string')continue;iceServers.push({urls,username:server.username,credential:server.credential});}
     else iceServers.push({urls});
    }
    if(!iceServers.some(server=>server.credential))throw Object.assign(Error('turn-network'),{code:'turn-network'});
    const value={iceServers,expiresAt:now()+ttl*1000};if(cache.size>=500)cache.delete(cache.keys().next().value);cache.set(access.userId,value);return value;
   })();flights.set(access.userId,flight);}
   try{entry=await flight;}catch(error){return reply(503,{code:['turn-setup','turn-auth'].includes(error.code)?error.code:'turn-network'});}finally{if(flights.get(access.userId)===flight)flights.delete(access.userId);}
  }
  return reply(200,{...entry,diagnosticsEnabled:access.diagnosticsEnabled===true});
 };
}
