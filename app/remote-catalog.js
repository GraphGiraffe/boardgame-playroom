if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const KEY='playroom.remote-catalog.v1',ID=/^[a-z][a-z0-9_-]{0,63}$/;
  const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  const HEX=/^[a-f0-9]{64}$/;
  function validate(input){
    if(!input||input.format!=='playroom-catalog'||input.version!==1||!SEMVER.test(input.collection)||!Array.isArray(input.packs)||input.packs.length>128)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.ccf73f07ce71"));
    const seen=new Set();
    for(const item of input.packs){
      if(!item||!ID.test(item.id)||!SEMVER.test(item.version)||!Number.isSafeInteger(item.stateVersion)||item.stateVersion<1||item.engineApi!==3||item.viewApi!==2||!HEX.test(item.sha256)||item.url!==`/api/packs/files/${item.id}/${item.version}/${item.sha256}.playroom-pack.json`)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.bb5762ca842a"));
      if(seen.has(item.id))throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.dd2d739e7aa6"));seen.add(item.id);
    }
    return input;
  }
  class RemoteCatalog {
    constructor({manager,fetcher=root.fetch?.bind(root),storage=root.localStorage,crypto=root.crypto}={}){
      this.manager=manager;this.fetcher=fetcher;this.storage=storage;this.crypto=crypto;this.current=null;this.warning='';
      try{this.current=validate(JSON.parse(storage.getItem(KEY)||'null'));}catch(_){}
    }
    async refresh(){
      if(!this.fetcher)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.a1dc0b587e18"));
      const response=await this.fetcher('/api/packs/catalog',{cache:'no-store',credentials:'same-origin',redirect:'error'});
      if(!response.ok||response.redirected)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.fe3b5e2914ec",{p0:String(response.status)}));
      const text=await response.text();if(text.length>256*1024)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.174d1503aba8"));
      const catalog=validate(JSON.parse(text));
      this.storage.setItem(KEY,JSON.stringify(catalog));this.current=catalog;this.warning='';return catalog;
    }
    async load(){try{return await this.refresh();}catch(error){this.warning=globalThis.PlayroomMessages.error(error);return this.current;}}
    pending(){
      const installed=new Set(this.manager.list().map(item=>item.id+'@'+item.version));
      return (this.current?.packs||[]).filter(item=>!installed.has(item.id+'@'+item.version));
    }
    async install(id,{activate=false}={}){
      const item=this.pending().find(entry=>entry.id===id);
      if(!item)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.3456539518cb"));
      if(!this.crypto?.subtle)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.b01d9b44b6a3"));
      const response=await this.fetcher(item.url,{cache:'no-store',credentials:'same-origin',redirect:'error'});
      if(!response.ok||response.redirected)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.40a73e8f9f18",{p0:String(response.status)}));
      const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>4*1024*1024)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.fb6f028993b8"));
      const hash=[...new Uint8Array(await this.crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
      if(hash!==item.sha256)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.f5fc3d7faf71"));
      const bundle=this.manager.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const manifest=bundle.manifest;
      if(manifest.id!==item.id||manifest.version!==item.version||manifest.stateVersion!==item.stateVersion||manifest.engineApi!==item.engineApi||manifest.viewApi!==item.viewApi)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.75fccc8516b6"));
      return this.manager.install(this.manager.prepare(bundle),{activate});
    }
  }
  root.PlayroomRemoteCatalog={RemoteCatalog,validate};
  if(typeof module==='object'&&module.exports)module.exports={RemoteCatalog,validate};
})(globalThis);
