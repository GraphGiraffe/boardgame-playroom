(function(root,factory){const api=factory(root);if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomAvatars=api;})(globalThis,function(root){
 'use strict';
 const valid=id=>typeof id==='string'&&/^(crescent|triangle|square|circle|star|rectangle|diamond|hexagon)-(red|orange|yellow|green|blue|purple)$/.test(id);
 const normalize=id=>valid(id)?id:null;
 const styles=Object.freeze(['minimal','simple']);
 const style=()=>styles.includes(root.document?.documentElement?.dataset.avatarStyle)?root.document.documentElement.dataset.avatarStyle:'minimal';
 const items=(selected=style())=>root.PlayroomCharacterStyles?.sets?.[selected]||root.PlayroomCharacterStyles?.sets?.minimal||[];
 const source=(id,selected=style())=>valid(id)?items(selected).find(item=>item.id===id)?.src||'':'';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function content(id,name='',selected){const src=source(id,selected);return src?`<span class="avatar-clip"><img class="avatar-art" data-avatar-id="${id}" ${selected?`data-avatar-style="${esc(selected)}"`:""} src="${src}" alt="" draggable="false"></span>`:esc(Array.from(String(name))[0]||'');}
 return Object.freeze({valid,normalize,styles,style,items,source,content});
});
