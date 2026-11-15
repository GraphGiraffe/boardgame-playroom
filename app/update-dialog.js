(function(root){
  'use strict';
  const Meter=root.PlayroomStatusMeter||(typeof require==='function'?require('./status-meter.js'):null);
  const text=(key,vars)=>root.PlayroomMessages.text('ui.updates.'+key,vars);
  function releases(items,from,to){
    const compare=root.TabletopPacks.compareVersions;
    return (Array.isArray(items)?items:[]).filter(item=>item&&typeof item.version==='string'&&Array.isArray(item.changes)&&(to.includes('-')||!item.version.includes('-'))&&compare(item.version,from)>0&&compare(item.version,to)<=0).sort((a,b)=>compare(a.version,b.version));
  }
  function changes(items,from,to,esc){
    const selected=releases(items,from,to);
    return selected.length?selected.map(item=>`<section>${item.version===to?'':`<h3>${esc(item.version)}</h3>`}<ul>${item.changes.filter(line=>typeof line==='string').map(line=>`<li>${esc(line)}</li>`).join('')}</ul></section>`).join(''):`<p class="muted">${text('missing')}</p>`;
  }
  function summarizePacks(packs,installed){
    const groups=new Map(),rows=packs.map(pack=>{
      const lines=[...new Set(releases(pack.releases,installed(pack.id),pack.version).flatMap(item=>item.changes).filter(line=>typeof line==='string'))];
      if(!lines.length)lines.push('Обновлена версия игры.');
      for(const line of lines){if(!groups.has(line))groups.set(line,[]);groups.get(line).push(pack);}
      return {pack,lines};
    });
    const common=[...groups].filter(([,items])=>items.length>1).map(([line,items])=>({line,packs:items}));
    const specific=rows.map(({pack,lines})=>({...pack,changes:lines.filter(line=>groups.get(line).length===1)})).filter(pack=>pack.changes.length);
    return {common,specific};
  }
  function packChanges(packs,installed,esc,cover=()=>''){
    const {common,specific}=summarizePacks(packs,installed);
    const shared=common.length?`<section data-common-pack-changes><h3>Общие изменения игр</h3><ul>${common.map(item=>`<li>${esc(item.line)}${item.packs.length===packs.length?'':`<small class="muted"> — ${esc(item.packs.map(pack=>pack.name||pack.id).join(', '))}</small>`}</li>`).join('')}</ul></section>`:'';
    return shared+specific.map(pack=>`<article class="post-update-pack"><div class="post-update-cover">${cover(pack.id)}</div><div><h3>${esc(pack.name||pack.id)} · ${esc(pack.version)}</h3><ul>${pack.changes.map(line=>`<li>${esc(line)}</li>`).join('')}</ul></div></article>`).join('');
  }
  function errorText(error){const code=['offline','network','timeout','http','response','integrity','quota','storage','incomplete'].includes(error?.code)?error.code:'network';return text('error.'+code,{status:error?.status||''});}
  function progressMarkup(){return `<div class="update-download" data-update-download hidden><div class="status-meter-caption"><span data-update-phase></span><span data-update-bytes></span></div>${Meter.markup({attrs:'data-update-progress',label:'Подготовка обновления'})}</div>`;}
  function sync(){
    const active=document.querySelector('#modal-root>[data-surface-state=active]');
    const modal=active?.querySelector('.updates-modal');if(!modal)return;const app=root.PlayroomPWA?.updateInfo,state=app?.download||{phase:'ready'},phase=state.phase,ready=phase==='ready',busy=phase==='downloading',preparing=state.stage==='preparing';
    const download=modal.querySelector('[data-command=download-app]'),install=modal.querySelector('[data-command=update-app]');
    if(download){download.hidden=ready;download.disabled=busy;const label=busy?text('phase.downloading'):phase==='paused'?text('resume'):'Подготовить обновление';download.title=download.ariaLabel=label;download.innerHTML=root.PlayroomGameScreen.icon(busy?'sync':phase==='paused'?'sync':'download')+'<span>'+label+'</span>';}
    if(install)install.hidden=!ready;
    const block=modal.querySelector('[data-update-download]');if(!block)return;block.hidden=phase==='available';
    const measured=!preparing&&Number.isFinite(state.total)&&state.total>0,files=!preparing&&Number.isFinite(state.totalFiles)&&state.totalFiles>0;
    const percent=ready?100:measured?Math.max(0,Math.min(100,(state.received||0)/state.total*100)):files?Math.max(0,Math.min(100,(state.completed||0)/state.totalFiles*100)):null;
    const format=root.PlayroomStorageUsage.format,detail=measured?format(state.received||0)+' / '+format(state.total):files?(state.completed||0)+' / '+state.totalFiles+' файлов':preparing?'Определяем объём обновления':'Объём пока неизвестен';
    Meter.update(block.querySelector('[data-update-progress]'),{label:'Подготовка обновления',value:percent,max:100,valueText:detail,state:state.error?'error':ready?'ready':busy?'busy':'paused'});
    block.querySelector('[data-update-phase]').textContent=text(ready?'ready':busy?(preparing?'preparing':'downloading'):'paused');
    block.querySelector('[data-update-bytes]').textContent=detail+(percent===null?'':' · '+Math.round(percent)+'%');
    const status=modal.querySelector('[data-update-status]');if(root.PlayroomUnifiedUpdateBusy)return;if(state.error){status.textContent=errorText(state.error);status.setAttribute('role','alert');}else if(!root.PlayroomPWA?.isUpdateLocked()){status.textContent=ready?'Обновление готово к установке':busy?'Подготавливаем обновление':phase==='paused'?'Подготовка приостановлена':'Можно подготовить обновление';status.setAttribute('role','status');}
  }
  function markup({app,installedVersion,packs,installed,esc,head,notice=null,check=null,resume=false,cover=()=>''}){
    const H=root.PlayroomGameScreen;
    const title=app?'Обновление':packs.length?'Обновления игр':'Обновления',header=`<header class="modal-head update-v021-header">${H.iconButton('data-command="close-modal"','Назад','back')}<h2>${esc(title)}</h2></header>`;
    return header+`<div class="update-v021">${notice?`<section data-important-update><h3>${esc(notice.title||'Важное обновление')}</h3><p>${esc(notice.body||'')}</p>${notice.version?`<small>${esc(notice.version)}</small>`:''}</section>`:''}<p class="muted" data-installed-app-version>Установлена версия ${esc(installedVersion)}</p>${!app&&!packs.length?'<section class="update-v021-summary" data-update-current><h3>Обновление ХОД</h3><p>Можно проверить, появились ли новые версии приложения и игр.</p></section>':''}${app?`<section class="update-v021-summary"><h3>Обновление ${esc(app.version||'ХОД')}</h3><div class="update-changes">${changes(app.releases,installedVersion,app.version||installedVersion,esc)}</div></section><section class="update-v021-state"><p data-update-status role="status">Можно подготовить обновление</p>${progressMarkup()}</section>`:''}${packs.length?`<details class="update-pack-changes"><summary>Изменения игр · ${packs.length}</summary>${packChanges(packs,installed,esc,cover)}</details>`:''}${app?'':'<p data-update-status role="status"></p>'}</div><footer class="update-v021-footer" data-fixed-footer><p data-update-check-status role="${check?.error?'alert':'status'}">${esc(check?.message||'')}</p><div class="update-v021-actions">${H.button({attrs:`data-command="check-updates" ${check?.busy?'disabled':''}`,label:check?.busy?'Проверяем обновления…':'Проверить обновления',icon:'sync',className:app||packs.length?'secondary':''})}${app||packs.length||resume?H.button({attrs:'data-command="update-all"',label:resume?'Продолжить обновление':'Обновить всё',icon:'download'}):''}</div></footer>`;
  }
  root.addEventListener?.('playroom-update-progress',sync);
  root.addEventListener?.('playroom:modal-restored',sync);
  root.PlayroomUpdateDialog={markup,releases,changes,summarizePacks,packChanges,sync,errorText};
  if(typeof module==='object'&&module.exports)module.exports=root.PlayroomUpdateDialog;
})(globalThis);
