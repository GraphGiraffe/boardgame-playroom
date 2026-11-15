/* Remove superseded versions only after installation; saves remain authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPackUpdateCleanup=api;})(globalThis,function(){
 'use strict';
 return class PackUpdateCleanup {
  constructor({manager,localReferences,networkArchives,activeRoom,compare}){Object.assign(this,{manager,localReferences,networkArchives,activeRoom,compare});}
  oldVersions(){const rows=this.manager.list();return rows.filter(row=>{const active=rows.find(p=>p.id===row.id&&p.active);return !row.active&&active&&this.compare(row.version,active.version)<0;});}
  async plan({guard=()=>{}}={}){
   guard();if(this.activeRoom())return {items:[],retained:[],blocked:true};
   const archives=await this.networkArchives();guard();if(this.activeRoom())return {items:[],retained:[],blocked:true};
   const items=[],retained=[];
   const referenced=(id,version)=>this.localReferences(id,version).length||archives.some(row=>row.game===id&&row.packVersion===version);
   for(const row of this.oldVersions()){
    const item={id:row.id,version:row.version,name:row.manifest?.name||row.id,kind:'old'};(referenced(row.id,row.version)?retained:items).push(item);
   }
   for(const entry of this.manager.quarantined||[]){let bundle=entry.bundle;try{if(typeof bundle==='string')bundle=JSON.parse(bundle);}catch(_){}
    const m=bundle?.manifest;if(typeof m?.id!=='string'||typeof m?.version!=='string')continue;
    const item={id:m.id,version:m.version,name:m.name||m.id,kind:'incompatible',entry};(referenced(m.id,m.version)?retained:items).push(item);
   }
   return {items,retained,blocked:false};
  }
  async removeUnused(plan,{guard=()=>{}}={}){
   const removed=[];
   for(const item of plan.items){guard();const fresh=await this.plan({guard});if(fresh.blocked)break;
    if(!fresh.items.some(p=>p.kind===item.kind&&p.id===item.id&&p.version===item.version&&(p.kind!=='incompatible'||p.entry===item.entry)))continue;
    const safe=()=>{guard();if(this.activeRoom()||this.localReferences(item.id,item.version).length)throw Object.assign(Error('CLEANUP_CHANGED'),{code:'cancelled'});};
    if(item.kind==='incompatible'){const index=this.manager.quarantined.indexOf(item.entry);if(index<0)continue;await this.manager.discardQuarantine(index,{guard:safe});}
    else await this.manager.remove(item.id,item.version,{guard:safe});removed.push({id:item.id,version:item.version});
   }return removed;
  }
  async run(id,{guard=()=>{}}={}){
   if(this.activeRoom())return [];
   guard();const archives=await this.networkArchives(); // Failure must preserve all old versions.
   guard();const removed=[];
   for(const item of this.manager.list()){
    const active=this.manager.list().find(row=>row.id===id&&row.active);
    if(this.activeRoom()||!active)break;
    if(item.id!==id||item.active||this.compare(item.version,active.version)>=0||this.localReferences(id,item.version).length||archives.some(row=>row.game===id&&row.packVersion===item.version))continue;
    guard();await this.manager.remove(id,item.version,{guard});removed.push(item.version);
   }
   return removed;
  }
 };
});
