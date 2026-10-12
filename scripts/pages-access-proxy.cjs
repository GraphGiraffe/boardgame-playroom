'use strict';
// Browser-only Access bridge for the initial Service Worker script request.
// Chromium does not attach context headers to that request. The bridge accepts
// one HTTPS origin, adds the CI service token, and validates Cloudflare TLS.
const http=require('node:http'),https=require('node:https'),tls=require('node:tls'),crypto=require('node:crypto');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');

async function accessProxy(value,{clientId,clientSecret,upstreamCA}){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||!clientId||!clientSecret)throw Error('Invalid protected origin or service credentials');
 const host=url.hostname,port=Number(url.port||443),authority=host+':'+port;
 if(!/^[a-zA-Z0-9.-]+$/.test(host))throw Error('Invalid origin hostname');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'playroom-access-'));
 const key=path.join(directory,'key.pem'),cert=path.join(directory,'cert.pem'),sockets=new Set();
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN='+host,'-addext','subjectAltName=DNS:'+host],{stdio:'ignore'});
  const publicKey=new crypto.X509Certificate(fs.readFileSync(cert)).publicKey.export({type:'spki',format:'der'});
  const spki=crypto.createHash('sha256').update(publicKey).digest('base64');
  const secureContext=tls.createSecureContext({key:fs.readFileSync(key),cert:fs.readFileSync(cert)});
  const inner=http.createServer((request,response)=>{
   if(![host,authority].includes(request.headers.host)||!request.url.startsWith('/')||request.url.startsWith('//')){response.writeHead(403).end();return;}
   const headers={...request.headers,host:url.host,'CF-Access-Client-Id':clientId,'CF-Access-Client-Secret':clientSecret};
   delete headers['proxy-authorization'];delete headers['proxy-connection'];
   const upstream=https.request({hostname:host,port,path:request.url,method:request.method,headers,timeout:30000,rejectUnauthorized:true,...(upstreamCA?{ca:upstreamCA}:{})},incoming=>{
    response.writeHead(incoming.statusCode,incoming.headers);incoming.pipe(response);
   });
   upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>response.destroy());
   request.on('aborted',()=>upstream.destroy());request.pipe(upstream);
  });
  const server=http.createServer((_,response)=>response.writeHead(403).end());
  server.on('connect',(request,client,head)=>{
   sockets.add(client);client.on('close',()=>sockets.delete(client));client.on('error',()=>client.destroy());
   if(request.url!==authority){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)client.unshift(head);
   const encrypted=new tls.TLSSocket(client,{isServer:true,secureContext});
   encrypted.on('error',()=>encrypted.destroy());inner.emit('connection',encrypted);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  return {server:'http://127.0.0.1:'+server.address().port,spki,
   close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true});}};
 }catch(error){fs.rmSync(directory,{recursive:true,force:true});throw error;}
}
module.exports={accessProxy};
