/* Remove superseded versions only after installation; saves remain authoritative. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomPackUpdateCleanup=api;})(globalThis,function(){
 'use strict';
 return class PackUpdateCleanup {
  constructor({manager,localReferences,networkArchives,activeRoom,compare}){Object.assign(this,{manager,localReferences,networkArchives,activeRoom,compare});}
  async run(id){
   if(this.activeRoom())return [];
   const archives=await this.networkArchives(); // Failure must preserve all old versions.
   const removed=[];
   for(const item of this.manager.list()){
    const active=this.manager.list().find(row=>row.id===id&&row.active);
    if(this.activeRoom()||!active)break;
    if(item.id!==id||item.active||this.compare(item.version,active.version)>=0||this.localReferences(id,item.version).length||archives.some(row=>row.game===id&&row.packVersion===item.version))continue;
    this.manager.remove(id,item.version);removed.push(item.version);
   }
   return removed;
  }
 };
});
