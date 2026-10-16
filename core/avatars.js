(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomAvatars=api;})(globalThis,function(root){
 'use strict';
 const valid=id=>typeof id==='string'&&/^(crescent|triangle|square|circle|star|rectangle|diamond|hexagon)-(red|orange|yellow|green|blue|purple)$/.test(id);
 const normalize=id=>valid(id)?id:null;
 const items=()=>root.PlayroomCharacterAssets?.items||[];
 const source=id=>valid(id)?items().find(item=>item.id===id)?.src||'':'';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function content(id,name=''){const src=source(id);return src?`<span class="avatar-clip"><img class="avatar-art" src="${src}" alt="" draggable="false"></span>`:esc(Array.from(String(name))[0]||'');}
 return Object.freeze({valid,normalize,items,source,content});
});
