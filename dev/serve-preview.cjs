#!/usr/bin/env node
'use strict';
/** Trusted-LAN test harness, not a public room service. Full state stays in Node. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const E=require('../core/engine.js'),Session=require('../core/session.js'),Authority=require('../core/authority.js'),UI=require('../core/ui.js'),Packs=require('../core/packs.js');
const ROOT=path.resolve(__dirname,'..');
const STATIC=new Set(['dev/view-client.html','dev/view-client.js','core/ui.js','core/ui.css','core/input.js','core/input.css','core/protocol.js','app/views.js','app/session-client.js','app/transports/http.js','app/transports/message-port.js','app/shared-views.js','app/shared-views.css']);
function addresses(){return [...new Set(['127.0.0.1','localhost','::1',...Object.values(os.networkInterfaces()).flat().filter(a=>a.family==='IPv4').map(a=>a.address)])];}
function createPreview({bundle,players=2,bots=0,seed,session:provided,root=ROOT,botDelay=500}={}){
  if(!bundle)throw Error('A trusted .playroom-pack.json is required');
  const views=UI.createRegistry(),catalog={},manager=new Packs({engine:E,views,catalog,document:null,storage:{get:()=>null,set:()=>{}}});
  manager.install(manager.prepare(bundle));const m=manager.list()[0].manifest;
  if(!views.supports(m.id,'table')||!views.supports(m.id,'player'))throw Error('Пак не поддерживает личный экран и общий стол.');
  if(!Number.isInteger(players)||players<2||players>4||!Number.isInteger(bots)||bots<0||bots>=players)throw Error('Нужны 2–4 места и хотя бы один человек.');
  const session=provided||new Session(E,m.id,{packVersion:m.version,seed:seed||crypto.randomBytes(16).toString('hex'),players:Array.from({length:players},(_,i)=>({name:i>=players-bots?'Бот '+(i+1):'Игрок '+(i+1),bot:i>=players-bots})),unoMode:'manual',mode:'pass'});
  if(session.game!==m.id||session.packVersion!==m.version)throw Error('Session/pack mismatch');
  const authority=new Authority(session),definition=manager.exportView(m.id,m.version),capabilities=new Map(),links=[];
  for(let viewer=-1;viewer<session.current.players.length;viewer++){
    if(session.current.players[viewer]?.bot)continue;
    const token=crypto.randomBytes(24).toString('base64url');capabilities.set(token,authority.connect(viewer));links.push({viewer,name:viewer<0?'Общий стол':session.current.players[viewer].name,token});
  }
  const hosts=new Set(addresses());let port=0,stopped=false;
  const send=(res,status,value,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(type.startsWith('application/json')?JSON.stringify(value):value);};
  const server=http.createServer({maxHeaderSize:8192,requestTimeout:10000,headersTimeout:10000},async(req,res)=>{
    try{
      let url;try{url=new URL(req.url,'http://'+req.headers.host);}catch(_){send(res,400,{error:'Bad request'});return;}
      // Literal local hosts only: no DNS rebinding, cross-origin API or arbitrary file server.
      if(!hosts.has(url.hostname.replace(/^\[|\]$/g,''))||Number(url.port||80)!==port){send(res,403,{error:'Host not allowed'});return;}
      if(req.headers.origin&&req.headers.origin!==url.origin){send(res,403,{error:'Origin not allowed'});return;}
      if(url.pathname.startsWith('/api/')){
        const token=/^Bearer ([\w-]{32})$/.exec(req.headers.authorization||'')?.[1],connection=capabilities.get(token);
        if(!connection){send(res,401,{error:'Invalid capability'});return;}
        if(url.pathname==='/api/snapshot'&&req.method==='GET'){send(res,200,connection.snapshot());return;}
        if(url.pathname==='/api/view'&&req.method==='GET'){send(res,200,definition);return;}
        if(url.pathname==='/api/history'&&req.method==='GET'){
          const raw=url.searchParams.get('index');if(!/^(0|[1-9]\d*)$/.test(raw||'')){send(res,400,{error:'Bad history index'});return;}
          try{send(res,200,connection.history(Number(raw)));}catch(_){send(res,400,{error:'Bad history index'});}return;
        }
        if(url.pathname==='/api/command'&&req.method==='POST'){
          if(req.headers['content-type']?.split(';')[0].trim()!=='application/json'){send(res,415,{error:'JSON required'});return;}
          let size=0;const chunks=[];
          for await(const chunk of req){size+=chunk.length;if(size>16384){send(res,413,{error:'Command too large'});return;}chunks.push(chunk);}
          let command;try{command=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch(_){send(res,400,{error:'Bad JSON'});return;}
          const receipt=connection.dispatch(command);send(res,200,receipt);if(receipt.ok&&!receipt.duplicate)authority.scheduleBot({delay:botDelay});return;
        }
        send(res,404,{error:'Not found'});return;
      }
      if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'Method not allowed'});return;}
      const file=url.pathname==='/'?'dev/view-client.html':url.pathname.slice(1);
      if(!STATIC.has(file)){send(res,404,{error:'Not found'});return;}
      if(url.pathname==='/'){res.writeHead(302,{Location:'/dev/view-client.html','Cache-Control':'no-store'});res.end();return;}
      const data=fs.readFileSync(path.join(root,file)),ext=path.extname(file),type=ext==='.html'?'text/html':ext==='.css'?'text/css':'text/javascript';
      send(res,200,req.method==='HEAD'?'':data,type+'; charset=utf-8');
    }catch(error){if(!res.headersSent)send(res,500,{error:'Preview request failed'});else res.end();}
  });
  server.on('clientError',(_,socket)=>{if(socket.writable)socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
  return {server,authority,session,definition,links,
    async listen({host='127.0.0.1',port:requested=0}={}){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(requested,host,resolve);});port=server.address().port;authority.scheduleBot({delay:botDelay});return port;},
    url(viewer,host='127.0.0.1'){const link=links.find(l=>l.viewer===viewer);if(!link)throw Error('No human seat');return `http://${host}:${port}/dev/view-client.html#key=${link.token}`;},
    async close(){if(stopped)return;stopped=true;authority.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  };
}
async function main(){
  const args=process.argv.slice(2),options={pack:path.join(ROOT,'preview-packs','uno.playroom-pack.json'),players:2,bots:0,port:4173,lan:false};
  for(let i=0;i<args.length;i++){
    const flag=args[i];if(flag==='--lan')options.lan=true;
    else if(['--pack','--players','--bots','--port'].includes(flag)){if(!args[i+1]||args[i+1].startsWith('--'))throw Error('Отсутствует значение '+flag);const value=args[++i];options[flag.slice(2)]=flag==='--pack'?path.resolve(value):Number(value);}
    else if(flag==='--help'){console.log('node dev/serve-preview.cjs [--lan] [--players 2..4] [--bots 0..3] [--port 4173] [--pack trusted.playroom-pack.json]');return;}
    else throw Error('Неизвестный параметр: '+flag);
  }
  if(!Number.isInteger(options.port)||options.port<1||options.port>65535)throw Error('Некорректный порт');
  const preview=createPreview({...options,bundle:JSON.parse(fs.readFileSync(options.pack,'utf8'))});
  await preview.listen({host:options.lan?'0.0.0.0':'127.0.0.1',port:options.port});
  console.log('\nХОД · тестовая партия. Закрытие сервера завершит её.\n');
  const ips=options.lan?addresses().filter(a=>a!=='localhost'&&a!=='::1'):['127.0.0.1'];
  for(const ip of ips){console.log(ip==='127.0.0.1'?'На этом ПК:':'Для устройств в той же сети ('+ip+'):');for(const link of preview.links)console.log('  '+link.name+': '+preview.url(link.viewer,ip));}
  console.log('\nЛичные ссылки дают управление местом. Не публикуйте их.\nLAN: только доверенная Wi-Fi-сеть, без проброса портов. HTTP не шифруется.\nНовый запуск создаёт другую партию и новые ссылки. Ctrl+C — остановить.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>preview.close().then(()=>process.exit(0)));
}
module.exports={createPreview,addresses};
if(require.main===module)main().catch(error=>{console.error('Ошибка: '+error.message);process.exitCode=1;});
