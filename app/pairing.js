(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomPairing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TOKEN_PREFIX='PR2.';
  const MARKER='PLAYROOM_PAIR:';
  const encoder=typeof TextEncoder==='function'?new TextEncoder():null;
  const decoder=typeof TextDecoder==='function'?new TextDecoder():null;
  function bytesToBase64(bytes){
    let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
    if(typeof btoa==='function')return btoa(binary);
    return Buffer.from(bytes).toString('base64');
  }
  function base64ToBytes(value){
    const normalized=value.replace(/-/g,'+').replace(/_/g,'/');const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    const binary=typeof atob==='function'?atob(padded):Buffer.from(padded,'base64').toString('binary');
    return Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  }
  function encode(value){
    const json=JSON.stringify(value),bytes=encoder?encoder.encode(json):Uint8Array.from(Buffer.from(json,'utf8'));
    return TOKEN_PREFIX+bytesToBase64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  }
  function decode(token){
    if(typeof token!=='string'||!token.startsWith(TOKEN_PREFIX))throw Error('Некорректное приглашение ХОД.');
    let value;try{
      const bytes=base64ToBytes(token.slice(TOKEN_PREFIX.length));
      const json=decoder?decoder.decode(bytes):Buffer.from(bytes).toString('utf8');
      value=JSON.parse(json);
    }catch(_){throw Error('Некорректное приглашение ХОД.');}
    if(!value||value.v!==2||!['offer','answer'].includes(value.kind)||typeof value.signal!=='string')throw Error('Неподдерживаемое приглашение ХОД.');
    return value;
  }
  function fromSignal(kind,signal){
    if(!['offer','answer'].includes(kind)||typeof signal!=='string')throw Error('Некорректные данные подключения.');
    return encode({v:2,kind,signal});
  }
  function protocolUrl(token){decode(token);return 'web+playroom:pair/'+token;}
  function shareText(token){
    const value=decode(token),label=value.kind==='offer'?'приглашение':'ответ';
    return 'ХОД · '+label+'\n'+MARKER+token+'\n'+protocolUrl(token);
  }
  function extract(value){
    if(!value)return null;
    const text=String(value);
    const marker=text.match(/PLAYROOM_PAIR:(PR2\.[A-Za-z0-9_-]+)/);
    if(marker)return marker[1];
    const protocol=text.match(/web\+playroom:pair\/(PR2\.[A-Za-z0-9_-]+)/i);
    if(protocol)return protocol[1];
    const direct=text.match(/(?:^|[?&#=\s])(PR2\.[A-Za-z0-9_-]+)(?:$|[&#\s])/);
    return direct?direct[1]:null;
  }
  return Object.freeze({TOKEN_PREFIX,MARKER,encode,decode,fromSignal,protocolUrl,shareText,extract});
});
