(function(){
  'use strict';
  let view=null,client=null;
  const fail=error=>{document.getElementById('toast').textContent=error.message||String(error);};
  async function start(transport,definition,heartbeat=false){
    client=new PlayroomSessionClient(transport,{onEffect(effect){if(effect.type==='transfer')view?.toast(`Добор: ${effect.count} · игрок ${effect.player+1}`);}});
    view=PlayroomSharedViews.mount(client,definition);
    // Pack styles arrive dynamically. Shared layout rules have the last word.
    document.head.appendChild(document.querySelector('link[href$="shared-views.css"]'));
    await client.refresh();view.render();
    const timer=heartbeat?setInterval(()=>client.refresh().then(()=>view.setConnected(true)).catch(error=>{view.setConnected(false);fail(error);}),1500):null;
    window.addEventListener('pagehide',()=>clearInterval(timer));
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)client.refresh().catch(fail);});
    window.addEventListener('pagehide',()=>client.close());
  }
  const params=new URLSearchParams(location.search);
  if(params.get('port')==='1'){
    const hostOrigin=params.get('hostOrigin'),channel=params.get('channel');
    let expected;try{expected=new URL(hostOrigin).origin;}catch(_){fail(Error('Некорректный адрес организатора.'));return;}
    if(!window.opener||!channel){fail(Error('Откройте экран через стенд организатора.'));return;}
    const opener=window.opener;
    const receive=event=>{if(event.origin!==expected||event.source!==opener||event.data?.kind!=='playroom-port'||event.data.channel!==channel||event.ports.length!==1)return;
      window.removeEventListener('message',receive);start(PlayroomPortTransport.client(event.ports[0]),event.data.definition,true).catch(fail);
    };
    window.addEventListener('message',receive);opener.postMessage({kind:'playroom-ready',channel},expected);
  }else{
    const token=new URLSearchParams(location.hash.slice(1)).get('key');
    if(!token){fail(Error('Откройте личную ссылку, которую вывел сервер на ПК. Общий стол использует отдельную ссылку.'));return;}
    const transport=PlayroomHTTPTransport({token,onStatus(ok,message){view?.setConnected(ok);if(!ok)fail(Error(message));}});
    transport.definition().then(definition=>start(transport,definition)).catch(fail);
  }
})();
