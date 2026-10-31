/* Presentation only. Artwork lives once in CSS; messages retain portable shortcodes. */
(function(root){
 'use strict';
 const model=root.PlayroomQuickReactions;
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pattern=new RegExp(model.items.map(item=>item.shortcode).join('|')+'|👏|😮|🤔|🤝','gu');
 function icon(value){const item=model.find(value);return item?`<span class="reaction-art" data-reaction="${item.id}" role="img" aria-label="${item.label}" title="${item.shortcode}"><span class="reaction-alt">${item.shortcode}</span></span>`:escape(value);}
 function html(value,{legacy=true}={}){let output='',offset=0;const text=String(value??'');for(const match of text.matchAll(legacy?pattern:new RegExp(model.items.map(item=>item.shortcode).join('|'),'g'))){output+=escape(text.slice(offset,match.index))+icon(match[0]);offset=match.index+match[0].length;}return output+escape(text.slice(offset));}
 root.PlayroomReactionView=Object.freeze({html,icon});
})(globalThis);
