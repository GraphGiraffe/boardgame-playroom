(function(root){
  'use strict';
  const text=(key,vars)=>root.PlayroomMessages.text('ui.updates.'+key,vars);
  function releases(items,from,to){
    const compare=root.TabletopPacks.compareVersions;
    return (Array.isArray(items)?items:[]).filter(item=>item&&typeof item.version==='string'&&Array.isArray(item.changes)&&compare(item.version,from)>0&&compare(item.version,to)<=0).sort((a,b)=>compare(a.version,b.version));
  }
  function changes(items,from,to,esc){
    const selected=releases(items,from,to);
    return selected.length?selected.map(item=>`<section><h3>${esc(item.version)}</h3><ul>${item.changes.filter(line=>typeof line==='string').map(line=>`<li>${esc(line)}</li>`).join('')}</ul></section>`).join(''):`<p class="muted">${text('missing')}</p>`;
  }
  function errorText(error){const code=['offline','network','timeout','http','response','integrity','quota','storage','incomplete'].includes(error?.code)?error.code:'network';return text('error.'+code,{status:error?.status||''});}
  function progressMarkup(){return `<div class="update-download" data-update-download hidden><div class="update-download-caption"><span data-update-phase></span><span data-update-bytes></span></div><div class="storage-usage-line update-download-line" data-update-progress role="progressbar" aria-label="Загрузка обновления" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div></div>`;}
  function sync(){
    const modal=document.querySelector('.updates-modal');if(!modal)return;const app=root.PlayroomPWA?.updateInfo,state=app?.download||{phase:'ready'},phase=state.phase,ready=phase==='ready',busy=phase==='downloading',preparing=state.stage==='preparing';
    const download=modal.querySelector('[data-command=download-app]'),install=modal.querySelector('[data-command=update-app]');
    if(download){download.hidden=ready;download.disabled=busy;download.title=download.ariaLabel=busy?text('phase.downloading'):phase==='paused'?text('resume'):text('download');download.innerHTML=root.PlayroomGameScreen.icon(busy?'sync':phase==='paused'?'sync':'download');}
    if(install)install.hidden=!ready;
    const block=modal.querySelector('[data-update-download]');if(!block)return;block.hidden=phase==='available';
    const percent=ready?100:preparing?0:state.total?Math.min(99,Math.floor((state.received||0)/state.total*100)):state.totalFiles?Math.min(99,Math.floor((state.completed||0)/state.totalFiles*100)):0;
    const progress=block.querySelector('[data-update-progress]');progress.setAttribute('aria-valuenow',percent);progress.style.setProperty('--download-progress',percent+'%');
    block.querySelector('[data-update-phase]').textContent=text(ready?'ready':busy?(preparing?'preparing':'downloading'):'paused');
    const format=root.PlayroomStorageUsage.format;block.querySelector('[data-update-bytes]').textContent=(!preparing&&(state.total||ready)?format(state.received||0)+' / '+format(state.total)+' · ':'')+percent+'%';
    const status=modal.querySelector('[data-update-status]');if(state.error){status.textContent=errorText(state.error);status.setAttribute('role','alert');}else if(!root.PlayroomPWA?.isUpdateLocked()){status.textContent='';status.setAttribute('role','status');}
  }
  function markup({app,installedVersion,packs,installed,esc,head}){
    const H=root.PlayroomGameScreen;
    return head(text('title'))+`<div class="update-changes">${app?`<section><h2>${text('app')}${app.version?' · '+esc(app.version):''}</h2>${changes(app.releases,installedVersion,app.version||installedVersion,esc)}</section>`:''}${packs.map(pack=>`<section><h2>${esc(pack.name||pack.id)} · ${esc(pack.version)}</h2>${changes(pack.releases,installed(pack.id),pack.version,esc)}</section>`).join('')}</div><div class="modal-foot update-actions">${app?progressMarkup():''}<p data-update-status role="status"></p>${packs.length?H.iconButton('data-command="update-packs"',text('packs'),'layers'):''}${app?H.iconButton('data-command="download-app"',text('download'),'download')+H.iconButton('data-command="update-app"',text('apply'),'install',{className:'update-apply'}):''}</div>`;
  }
  root.addEventListener?.('playroom-update-progress',sync);
  root.PlayroomUpdateDialog={markup,releases,changes,sync,errorText};
  if(typeof module==='object'&&module.exports)module.exports=root.PlayroomUpdateDialog;
})(globalThis);
