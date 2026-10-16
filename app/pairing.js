if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomPairing=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const TOKEN_PREFIX='PR2.',COMPACT_PREFIX='PR3.';
  const acoustic=()=>root.PlayroomAcousticPairing||(typeof require==='function'?require('./acoustic-pairing.js'):null);
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
    if(typeof token==='string'&&token.startsWith(COMPACT_PREFIX)){
      try{
        const packet=acoustic()?.unpack(token.slice(COMPACT_PREFIX.length));
        if(!packet||!['offer','answer'].includes(packet.kind))throw Error('Invalid compact token');
        return {v:3,kind:packet.kind,signal:packet.signal,compact:true,ip:packet.ip,port:packet.port};
      }catch(_){throw Error(globalThis.PlayroomMessages.text("ui.pairing.85e054c0e772"));}
    }
    if(typeof token!=='string'||!token.startsWith(TOKEN_PREFIX))throw Error(globalThis.PlayroomMessages.text("ui.pairing.574aa061dfff"));
    let value;try{
      const bytes=base64ToBytes(token.slice(TOKEN_PREFIX.length));
      const json=decoder?decoder.decode(bytes):Buffer.from(bytes).toString('utf8');
      value=JSON.parse(json);
    }catch(_){throw Error(globalThis.PlayroomMessages.text("ui.pairing.574aa061dfff"));}
    if(!value||value.v!==2||!['offer','answer'].includes(value.kind)||typeof value.signal!=='string')throw Error(globalThis.PlayroomMessages.text("ui.pairing.24c81854279e"));
    return value;
  }
  function fromSignal(kind,signal,{address,port=null,legacy=false}={}){
    if(!['offer','answer'].includes(kind)||typeof signal!=='string')throw Error(globalThis.PlayroomMessages.text("ui.pairing.ca713836345d"));
    // Audio, QR and text use exactly the same compressed ICE/DTLS bytes.
    // Legacy PR2 remains a fallback for non-IPv4, mDNS or unsupported SDP.
    if(!legacy){
      try{
        const item=JSON.parse(signal);
        if(item.type===kind&&item.v===1&&acoustic()?.pack)
          return COMPACT_PREFIX+acoustic().pack(signal,{address,port});
      }catch(_){/* Fall back to a lossless legacy SDP, never an invented candidate. */}
    }
    return encode({v:2,kind,signal});
  }
  function protocolUrl(token){decode(token);return 'web+playroom:pair/'+token;}
  function shareText(token){
    const value=decode(token),label=value.kind==='offer'?globalThis.PlayroomMessages.text("ui.pairing.5e964db0649c"):globalThis.PlayroomMessages.text("ui.pairing.7b9de65d1672");
    return globalThis.PlayroomMessages.text("ui.pairing.060f4456bc05",{p0:String(label),p1:String(MARKER),p2:String(token),p3:String(protocolUrl(token))});
  }
  function extract(value){
    if(!value)return null;
    const text=String(value);
    const marker=text.match(/PLAYROOM_PAIR:((?:PR2|PR3)\.[A-Za-z0-9_-]+)/);
    if(marker)return marker[1];
    const protocol=text.match(/web\+playroom:pair\/((?:PR2|PR3)\.[A-Za-z0-9_-]+)/i);
    if(protocol)return protocol[1];
    const direct=text.match(/(?:^|[?&#=\s])((?:PR2|PR3)\.[A-Za-z0-9_-]+)(?:$|[&#\s])/);
    return direct?direct[1]:null;
  }
  return Object.freeze({TOKEN_PREFIX,COMPACT_PREFIX,MARKER,encode,decode,fromSignal,protocolUrl,shareText,extract});
});
