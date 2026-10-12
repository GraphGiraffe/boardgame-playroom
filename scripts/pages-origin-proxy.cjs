'use strict';
// Tunnel only the verified HTTPS origin. TLS remains end-to-end in Chromium;
// no authentication material or request bodies are inspected or logged here.
const http=require('node:http'),net=require('node:net');
async function originProxy(value){
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password)throw Error('Expected an HTTPS origin');
 const port=Number(url.port||443),authority=url.hostname+':'+port,sockets=new Set();
 const server=http.createServer((_,response)=>{response.writeHead(403);response.end();});
 const track=socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket));return socket;};
 server.on('connect',(request,client,head)=>{
  track(client);client.on('error',()=>client.destroy());
  if(request.url!==authority){client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
  const upstream=track(net.connect({host:url.hostname,port}));
  upstream.on('error',()=>{client.destroy();upstream.destroy();});
  client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());
  upstream.on('connect',()=>{
   client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
   if(head.length)upstream.write(head);
   client.pipe(upstream);upstream.pipe(client);
  });
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {server:'http://127.0.0.1:'+server.address().port,
  close:async()=>{for(const socket of sockets)socket.destroy();await new Promise(resolve=>server.close(resolve));}};
}
module.exports={originProxy};
