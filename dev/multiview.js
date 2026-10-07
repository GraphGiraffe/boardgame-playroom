(function(){
  'use strict';
  let authority=null,definition=null,origin=null;const pending=new Map(),cleanups=[];
  const message=text=>document.getElementById('error').textContent=text;
  const manager=new TabletopPacks({engine:TabletopCore,views:PlayroomViews,catalog:{},document:null,storage:{get:()=>null,set:()=>{}}});
  document.getElementById('create').onclick=async()=>{try{
    if(location.protocol==='file:')throw Error('Откройте стенд через локальный HTTP-сервер, не file://.');
    const file=document.getElementById('pack-file').files[0];if(!file)throw Error('Выберите JSON пака с личным и публичным представлением.');
    const item=manager.install(manager.prepare(await file.text()));if(!PlayroomViews.supports(item.id,'table')||!PlayroomViews.supports(item.id,'player'))throw Error('Пак не поддерживает эти представления.');
    const count=Number(document.getElementById('players').value);if(!Number.isInteger(count)||count<2||count>4)throw Error('Нужны 2–4 игрока.');
    origin=new URL(document.getElementById('client-origin').value||location.origin).origin;if(!/^https?:/.test(origin))throw Error('Нужен HTTP(S) origin.');
    authority?.dispose();for(const close of cleanups.splice(0))close();pending.clear();
    const session=new TabletopSession(TabletopCore,item.id,{packVersion:item.version,players:Array.from({length:count},(_,i)=>({name:'Игрок '+(i+1)})),unoMode:'manual',mode:'pass'});
    authority=new SessionAuthority(session);definition=manager.exportView(item.id,item.version);
    const links=document.getElementById('links');links.innerHTML='';
    for(let viewer=-1;viewer<count;viewer++){
      const button=document.createElement('button');button.textContent=viewer<0?'Общий стол':'Игрок '+(viewer+1);
      button.onclick=()=>{const channel=Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');const url=new URL('/dev/view-client.html',origin);url.search=new URLSearchParams({port:'1',hostOrigin:location.origin,channel});const child=window.open(url.href,'playroom-'+channel);if(!child){message('Браузер заблокировал окно. Разрешите всплывающие окна для стенда.');return;}const timer=setTimeout(()=>pending.delete(channel),15000);pending.set(channel,{child,viewer,timer});};
      links.appendChild(button);
    }
    message('Партия создана. Откройте общий стол и личные окна кнопками.');
  }catch(error){message(error.message);}};
  window.addEventListener('message',event=>{const entry=pending.get(event.data?.channel);if(!entry||event.origin!==origin||event.source!==entry.child||event.data.kind!=='playroom-ready')return;
    clearTimeout(entry.timer);entry.close?.();const ports=new MessageChannel(),connection=authority.connect(entry.viewer);entry.close=PlayroomPortTransport.serve(ports.port1,connection);cleanups.push(entry.close);entry.child.postMessage({kind:'playroom-port',channel:event.data.channel,definition},origin,[ports.port2]);
  });
  window.addEventListener('pagehide',()=>{authority?.dispose();for(const close of cleanups)close();});
})();
