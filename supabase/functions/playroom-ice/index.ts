import {createIceHandler} from './handler.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
Deno.serve(createIceHandler({
 authorize:async(token:string,roomId:string)=>{
  const response=await fetch(env('SUPABASE_URL')+'/rest/v1/rpc/playroom_ice_access',{method:'POST',redirect:'error',signal:AbortSignal.timeout(5000),headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:token,'Content-Type':'application/json'},body:JSON.stringify({p_room_id:roomId})});
  if(!response.ok)throw Error('auth-required');return response.json();
 },
 issue:async(ttl:number,userId:string)=>{
  const id=env('CF_TURN_KEY_ID'),token=env('CF_TURN_API_TOKEN');if(!id||!token)throw Object.assign(Error('turn-setup'),{code:'turn-setup'});
  const response=await fetch('https://rtc.live.cloudflare.com/v1/turn/keys/'+encodeURIComponent(id)+'/credentials/generate-ice-servers',{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({ttl,customIdentifier:userId})});
  if(!response.ok)throw Object.assign(Error('turn-network'),{code:[401,403].includes(response.status)?'turn-auth':'turn-network'});return response.json();
 }
}));
