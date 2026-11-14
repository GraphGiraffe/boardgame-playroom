/* Restartable update orchestration. Runtime, storage and catalogue are ports. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomUpdateAll=api;})(globalThis,function(){
 'use strict';const KEY='playroom.update-all.v1';
 class UpdateAll{
  constructor({storage,manager,remote,cleanup,version,idle,app,settle=()=>Promise.resolve(),progress=()=>{}}){Object.assign(this,{storage,manager,remote,cleanup,version,idle,app,settle,progress});this.flight=null;}
  pending(){const raw=this.storage.getItem(KEY);if(!raw)return null;const job=JSON.parse(raw);if(job?.version!==1||typeof job.target!=='string'||!Array.isArray(job.ids)||job.ids.length>128||job.ids.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9_-]{0,63}$/.test(id)))throw Error('UPDATE_JOB_INVALID');return job;}
  guard(){if(!this.idle())throw Error('Обновление продолжится после выхода из партии и комнаты.');}
  run(start=false){if(this.flight)return this.flight;this.flight=this.execute(start).finally(()=>{this.flight=null;});return this.flight;}
  async execute(start){
   await this.settle();this.guard();let job=this.pending();
   if(start&&!job){const ids=new Set(this.manager.list().map(p=>p.id));for(const row of this.manager.quarantined||[]){try{const b=typeof row.bundle==='string'?JSON.parse(row.bundle):row.bundle;if(b?.manifest?.id)ids.add(b.manifest.id);}catch{}}
    job={version:1,target:this.app()?.updateInfo?.version||this.version(),ids:[...ids]};this.storage.setItem(KEY,JSON.stringify(job));
   }
   if(!job)return null;
   if(this.manager.constructor.compareVersions(this.version(),job.target)<0){
    const app=this.app();if(app?.updateInfo?.version!==job.target)throw Error('Версия обновления изменилась. Проверьте обновления ещё раз.');
    this.progress('Подготавливаем обновление приложения…');if(app.updateInfo.download?.phase!=='ready')await app.downloadUpdate();this.guard();await app.activateUpdate();return {reloading:true};
   }
   this.progress('Проверяем обновления установленных игр…');const catalog=await this.remote.refresh();this.guard();const selected=[];
   for(const id of job.ids){const item=catalog.packs.find(p=>p.id===id);if(!item)continue;const rows=this.manager.list().filter(p=>p.id===id);if(rows.some(p=>this.manager.constructor.compareVersions(p.version,item.version)>0))continue;
    selected.push({id,version:item.version,prepared:rows.some(p=>p.version===item.version)?null:await this.remote.prepare(id)});this.guard();this.progress(`Загружены игры: ${selected.length} / ${job.ids.length}`);
   }
   // All downloads and compatibility checks finish before any activation/removal.
   for(const item of selected){this.guard();if(item.prepared)await this.manager.install(item.prepared,{activate:true});else await this.manager.activate(item.id,item.version);await this.settle();}
   this.guard();this.progress('Удаляем неиспользуемые старые версии…');const plan=await this.cleanup.plan({guard:()=>this.guard()});if(plan.blocked)throw Error('Очистка отложена до выхода из комнаты.');const removed=await this.cleanup.removeUnused(plan,{guard:()=>this.guard()});this.guard();this.storage.removeItem(KEY);this.progress('Приложение и игры обновлены.');return {updated:selected.length,removed:removed.length,retained:plan.retained.length};
  }
 }
 UpdateAll.KEY=KEY;return UpdateAll;
});
