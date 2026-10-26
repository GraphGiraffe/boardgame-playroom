(function(root){
  'use strict';
  const text=key=>root.PlayroomMessages.text('ui.updates.'+key);
  function releases(items,from,to){
    const compare=root.TabletopPacks.compareVersions;
    return (Array.isArray(items)?items:[]).filter(item=>item&&typeof item.version==='string'&&Array.isArray(item.changes)&&compare(item.version,from)>0&&compare(item.version,to)<=0).sort((a,b)=>compare(a.version,b.version));
  }
  function changes(items,from,to,esc){
    const selected=releases(items,from,to);
    return selected.length?selected.map(item=>`<section><h3>${esc(item.version)}</h3><ul>${item.changes.filter(line=>typeof line==='string').map(line=>`<li>${esc(line)}</li>`).join('')}</ul></section>`).join(''):`<p class="muted">${text('missing')}</p>`;
  }
  function markup({app,installedVersion,packs,installed,esc,head}){
    return head(text('title'))+`<div class="update-changes">${app?`<section><h2>${text('app')}${app.version?' · '+esc(app.version):''}</h2>${changes(app.releases,installedVersion,app.version||installedVersion,esc)}</section>`:''}${packs.map(pack=>`<section><h2>${esc(pack.name||pack.id)} · ${esc(pack.version)}</h2>${changes(pack.releases,installed(pack.id),pack.version,esc)}</section>`).join('')}</div><p data-update-status role="status"></p><div class="modal-foot"><button class="btn secondary" data-command="close-modal">${text('later')}</button>${packs.length?`<button class="btn" data-command="update-packs">${text('packs')}</button>`:''}${app?`<button class="btn" data-command="update-app">${text('apply')}</button>`:''}</div>`;
  }
  root.PlayroomUpdateDialog={markup,releases,changes};
  if(typeof module==='object'&&module.exports)module.exports=root.PlayroomUpdateDialog;
})(globalThis);
