/* Retire superseded packs and their incompatible saves after successful activation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPackUpdateCleanup=api;})(globalThis,function(){
 'use strict';
 class PackUpdateCleanup {
  constructor({manager,localReferences,networkArchives,activeRoom,compare,removeLocal,removeNetwork}){Object.assign(this,{manager,localReferences,networkArchives,activeRoom,compare,removeLocal,removeNetwork});}
  static fromLibraries({manager,library,networkLibrary,activeRoom}){
   return new PackUpdateCleanup({manager,localReferences:(id,version)=>library.references(id,version),networkArchives:()=>networkLibrary.list({strict:true}),activeRoom,compare:manager.constructor.compareVersions,
    removeLocal:(id,options)=>library.removeAsync(id,options),removeNetwork:(row,options)=>networkLibrary.remove(row.role==='host'?row.sessionId:'client:'+row.id,options)});
  }
  oldVersions(){const rows=this.manager.list();return rows.filter(row=>{const active=rows.find(p=>p.id===row.id&&p.active);return !row.active&&active&&this.compare(row.version,active.version)<0;});}
  async plan({guard=()=>{}}={}){
   guard();if(this.activeRoom())return {items:[],retained:[],blocked:true};
   const archives=await this.networkArchives();guard();if(this.activeRoom())return {items:[],retained:[],blocked:true};
   const items=[];
   const add=item=>items.push({...item,saves:this.localReferences(item.id,item.version).length+archives.filter(row=>row.game===item.id&&row.packVersion===item.version).length});
   for(const row of this.oldVersions())add({id:row.id,version:row.version,name:row.manifest?.name||row.id,kind:'old'});
   for(const entry of this.manager.quarantined||[]){let bundle=entry.bundle;try{if(typeof bundle==='string')bundle=JSON.parse(bundle);}catch(_){}
    const m=bundle?.manifest;if(typeof m?.id==='string'&&typeof m?.version==='string'&&this.manager.list().some(row=>row.id===m.id&&row.active))add({id:m.id,version:m.version,name:m.name||m.id,kind:'incompatible',entry});
   }
   return {items,retained:[],blocked:false};
  }
  async removeUnused(plan,{guard=()=>{}}={}){
   const removed=[];
   for(const item of plan.items){
    const safe=()=>{guard();if(this.activeRoom()||item.kind==='old'&&!this.oldVersions().some(row=>row.id===item.id&&row.version===item.version))throw Object.assign(Error('CLEANUP_CHANGED'),{code:'cancelled'});};safe();
    const fresh=await this.plan({guard:safe});
    if(!fresh.items.some(p=>p.kind===item.kind&&p.id===item.id&&p.version===item.version&&(p.kind!=='incompatible'||p.entry===item.entry)))continue;
    if(item.kind==='incompatible'&&this.manager.list().some(row=>row.active&&row.id===item.id&&row.version===item.version)){const index=this.manager.quarantined.indexOf(item.entry);if(index>=0)await this.manager.discardQuarantine(index,{guard:safe});removed.push({id:item.id,version:item.version});continue;}
    // Read every archive before deleting anything; a failed read cannot authorize cleanup.
    const archives=await this.networkArchives();safe();
    for(const id of this.localReferences(item.id,item.version)){safe();if(!this.removeLocal)throw Error('CLEANUP_LOCAL_PORT_REQUIRED');await this.removeLocal(id,{guard:safe});}
    for(const row of archives.filter(row=>row.game===item.id&&row.packVersion===item.version)){safe();if(!this.removeNetwork)throw Error('CLEANUP_NETWORK_PORT_REQUIRED');await this.removeNetwork(row,{guard:safe});}
    safe();if(this.localReferences(item.id,item.version).length)throw Error('CLEANUP_CHANGED');
    if((await this.networkArchives()).some(row=>row.game===item.id&&row.packVersion===item.version))throw Error('CLEANUP_CHANGED');safe();
    if(item.kind==='incompatible'){const index=this.manager.quarantined.indexOf(item.entry);if(index<0)continue;await this.manager.discardQuarantine(index,{guard:safe});}
    else await this.manager.remove(item.id,item.version,{guard:safe});removed.push({id:item.id,version:item.version});
   }
   return removed;
  }
  async run(id,{guard=()=>{}}={}){const plan=await this.plan({guard});if(plan.blocked)return [];return (await this.removeUnused({...plan,items:plan.items.filter(item=>item.id===id)},{guard})).map(item=>item.version);}
 }
 return PackUpdateCleanup;
});
