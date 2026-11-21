if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root){
  'use strict';
  const Deadline=root.PlayroomRequestDeadline||(typeof require==='function'?require('../platform/web/request-deadline.js'):null);
  const compareVersions=root.TabletopPacks?.compareVersions||(typeof require==='function'?require('../core/packs.js').compareVersions:null);
  const KEY='playroom.remote-catalog.v1',ID=/^[a-z][a-z0-9_-]{0,63}$/;
  const SEMVER=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
  const HEX=/^[a-f0-9]{64}$/;
  function validate(input){
    if(!input||input.format!=='playroom-catalog'||input.version!==1||!SEMVER.test(input.collection)||!Array.isArray(input.packs)||input.packs.length>128)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.ccf73f07ce71"));
    const seen=new Set();
    for(const item of input.packs){
      if(!item||!ID.test(item.id)||!SEMVER.test(item.version)||!Number.isSafeInteger(item.stateVersion)||item.stateVersion<1||item.engineApi!==4||item.viewApi!==3||!HEX.test(item.sha256)||item.url!==`/api/packs/files/${item.id}/${item.version}/${item.sha256}.playroom-pack.json`)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.bb5762ca842a"));
      if(item.sdkFeatures!==undefined&&(!Array.isArray(item.sdkFeatures)||item.sdkFeatures.length>16||new Set(item.sdkFeatures).size!==item.sdkFeatures.length||item.sdkFeatures.some(f=>typeof f!=='string'||!ID.test(f))))throw Error('Invalid pack SDK requirements');
      if(item.releases!==undefined&&(!Array.isArray(item.releases)||item.releases.length>128||item.releases.some(release=>!release||!SEMVER.test(release.version)||!Array.isArray(release.changes)||release.changes.length>128||release.changes.some(line=>typeof line!=='string'||line.length>4000))))throw Error('Invalid pack release notes');
      if(['name','tagline'].some(key=>item[key]!==undefined&&(typeof item[key]!=='string'||item[key].length>2048))||item.byteSize!==undefined&&(!Number.isSafeInteger(item.byteSize)||item.byteSize<1||item.byteSize>4*1024*1024))throw Error('Invalid pack catalog metadata');
      if(seen.has(item.id))throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.dd2d739e7aa6"));seen.add(item.id);
    }
    return input;
  }
  class RemoteCatalog {
    constructor({manager,fetcher=root.fetch?.bind(root),storage=root.localStorage,crypto=root.crypto,basePath=root.PlayroomDeployment?.catalogBasePath||'/api/packs/',requestTimeout=8000}={}){
      if(typeof basePath!=='string'||!/^\/(?!\/)[A-Za-z0-9_/-]*\/$/.test(basePath))throw Error('Invalid catalog base path');
      this.basePath=basePath;this.requestTimeout=requestTimeout;
      this.manager=manager;this.fetcher=fetcher;this.storage=storage;this.crypto=crypto;this.current=null;this.warning='';this.readSequence=0;this.pageProtocol=root.location?.protocol;
      try{this.current=validate(JSON.parse(storage.getItem(KEY)||'null'));}catch(_){}
    }
    availability(){
      const available=!this.pageProtocol||['http:','https:'].includes(this.pageProtocol);
      return {available,reason:available?'':'Каталог игр недоступен при открытии файла. Откройте веб-версию ХОД. Установленные игры и импорт файла доступны.'};
    }
    requireAvailable(){const state=this.availability();if(!state.available)throw Object.assign(Error(state.reason),{code:'catalog-origin'});}
    async refresh({signal}={}){
      const request=++this.readSequence;
      this.requireAvailable();
      if(!this.fetcher)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.a1dc0b587e18"));
      const text=await Deadline.run(async(signal,touch)=>{const response=await this.fetcher(this.basePath+'catalog',{cache:'no-store',credentials:'same-origin',redirect:'error',signal});
      if(!response.ok||response.redirected)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.fe3b5e2914ec",{p0:String(response.status)}));
      return new TextDecoder('utf-8',{fatal:true}).decode(await Deadline.bytes(response,{signal,touch,limit:256*1024}));},{signal,timeout:this.requestTimeout});if(text.length>256*1024)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.174d1503aba8"));
      const catalog=validate(JSON.parse(text));
      if(signal?.aborted)throw Object.assign(Error('Request cancelled'),{name:'AbortError'});
      if(request!==this.readSequence)return this.current;
      this.storage.setItem(KEY,JSON.stringify(catalog));this.current=catalog;this.warning='';return catalog;
    }
    async load(options){const request=this.readSequence+1;try{return await this.refresh(options);}catch(error){if(request===this.readSequence&&!options?.signal?.aborted)this.warning=globalThis.PlayroomMessages.error(error);return this.current;}}
    pending(){
      const installed=this.manager.list(),compare=this.manager.constructor?.compareVersions||compareVersions;
      return (this.current?.packs||[]).filter(item=>installed.filter(row=>row.id===item.id).every(row=>compare(item.version,row.version)>0));
    }
    async prepare(id,{version,signal}={}){
      // Multiplayer requires the host's exact version from the trusted catalog.
      // The normal update path still offers only upgrades.
      const exact=()=>this.current?.packs.find(entry=>entry.id===id&&entry.version===version);
      this.requireAvailable();
      if(version&&!exact())await this.refresh({signal});
      const item=version?exact():this.pending().find(entry=>entry.id===id);
      if(!item)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.3456539518cb"));
      const supported=this.manager.constructor?.SDK_FEATURES||[];
      if(item.sdkFeatures?.some(feature=>!supported.includes(feature)))throw Object.assign(Error(globalThis.PlayroomMessages.text('errors.PACK_SDK_UNSUPPORTED')),{code:'PACK_SDK_UNSUPPORTED'});
      if(!this.crypto?.subtle)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.b01d9b44b6a3"));
      const bytes=await Deadline.run(async(signal,touch)=>{const response=await this.fetcher(this.basePath+item.url.slice('/api/packs/'.length),{cache:'no-store',credentials:'same-origin',redirect:'error',signal});
      if(!response.ok||response.redirected)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.40a73e8f9f18",{p0:String(response.status)}));
      return Deadline.bytes(response,{signal,touch,limit:4*1024*1024});},{signal,timeout:this.requestTimeout});
      const hash=[...new Uint8Array(await this.crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
      if(hash!==item.sha256)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.f5fc3d7faf71"));
      const bundle=this.manager.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      const manifest=bundle.manifest;
      if(manifest.id!==item.id||manifest.version!==item.version||manifest.stateVersion!==item.stateVersion||manifest.engineApi!==item.engineApi||manifest.viewApi!==item.viewApi)throw Error(globalThis.PlayroomMessages.text("ui.remote-catalog.75fccc8516b6"));
      if(item.sdkFeatures!==undefined&&JSON.stringify([...item.sdkFeatures].sort())!==JSON.stringify([...(manifest.sdkFeatures||[])].sort()))throw Error(globalThis.PlayroomMessages.text('ui.remote-catalog.75fccc8516b6'));
      return this.manager.prepare(bundle);
    }
    async install(id,{activate=false}={}){return this.manager.install(await this.prepare(id),{activate});}
  }
  root.PlayroomRemoteCatalog={RemoteCatalog,validate};
  if(typeof module==='object'&&module.exports)module.exports={RemoteCatalog,validate};
})(globalThis);
