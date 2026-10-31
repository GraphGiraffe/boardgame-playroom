// Operator action only. Dry-run by default; never called by build/release/cron.
import {readFileSync,statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const args=process.argv.slice(2),options={};let send=false;
for(let i=0;i<args.length;i++){if(args[i]==='--send'){send=true;continue;}if(!['--project-ref','--env-file','--version','--title','--body'].includes(args[i])||!args[i+1])throw Error('Unknown/missing argument');options[args[i].slice(2)]=args[++i];}
const {version,title,body}=options,ref=options['project-ref'];
if(!/^[a-z]{20}$/.test(ref||'')||!/^[0-9]+\.[0-9]+\.[0-9]+([-.][A-Za-z0-9.-]+)?$/.test(version||'')||version.length>64||!title?.trim()||title.length>80||!body?.trim()||body.length>160)throw Error('Required: --project-ref --version --title (1..80) --body (1..160). Optional --env-file; --send explicitly sends.');
const data={operation:'important-update',confirm:true,id:randomUUID(),version,title,body};
if(!send){console.log(JSON.stringify({dryRun:true,project:ref,version,title,body,audience:'accounts with subscribed devices',note:'No request sent. Use --send only after explicit owner instruction.'}));}
else{
 const path=options['env-file'];if(!path||(statSync(path).mode&0o077))throw Error('Owner-only env file required');
 const env=Object.fromEntries(readFileSync(path,'utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
 if(!env.PLAYROOM_PUSH_SECRET)throw Error('Missing push secret');
 const response=await fetch('https://'+ref+'.supabase.co/functions/v1/playroom-push',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{'Content-Type':'application/json','x-playroom-push-secret':env.PLAYROOM_PUSH_SECRET},body:JSON.stringify(data)});
 if(!response.ok)throw Error('Announcement failed: HTTP '+response.status);console.log(JSON.stringify(await response.json()));
}
