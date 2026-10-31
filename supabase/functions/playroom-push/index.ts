import webpush from 'npm:web-push@3.6.7';
import {createPushHandler} from './dispatch.mjs';
const env=(key:string)=>{const value=Deno.env.get(key);if(!value)throw Error('Missing '+key);return value;};
const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
webpush.setVapidDetails(env('PLAYROOM_VAPID_SUBJECT'),env('PLAYROOM_VAPID_PUBLIC_KEY'),env('PLAYROOM_VAPID_PRIVATE_KEY'));
Deno.serve(createPushHandler({
 secret:env('PLAYROOM_PUSH_SECRET'),
 rpc:async(name:string,data:unknown)=>{
  const response=await fetch(url+'/rest/v1/rpc/'+name,{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(data)});
  if(!response.ok)throw Error('Push RPC failed');
  const text=await response.text();return text?JSON.parse(text):null;
 },
 send:(subscription:unknown,payload:string)=>webpush.sendNotification(subscription,payload,{TTL:3600,urgency:'high',timeout:10000})
}));
