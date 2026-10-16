/* Stable Web trees shared by game, room, library and modal adapters. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomDOM=api;})(globalThis,function(){
'use strict';
  function patchChildren(parent,next){
    const key=n=>n.nodeType===1?(n.id||n.getAttribute('data-entity')||n.getAttribute('data-grid-index')||n.getAttribute('data-open-save')||n.getAttribute('data-restore-network')||n.getAttribute('data-game')||(n.dataset.packId&&n.dataset.packVersion?`${n.dataset.packId}@${n.dataset.packVersion}`:'')||n.getAttribute('data-room-drop')||n.getAttribute('data-participant-id')||n.getAttribute('data-player-index')&&'player:'+n.getAttribute('data-player-index')||n.getAttribute('data-command')||n.getAttribute('data-net-action')||''):'';
    function patch(parent,next){
      const old=[...parent.childNodes],used=new Set();let previous=null;
      for(const fresh of [...next.childNodes]){
        const k=key(fresh);let node=old.find(n=>!used.has(n)&&n.nodeType===fresh.nodeType&&n.nodeName===fresh.nodeName&&key(n)===k);
        if(!node)node=fresh.cloneNode(true);else{
          used.add(node);
          if(node.nodeType===3){if(node.textContent!==fresh.textContent)node.textContent=fresh.textContent;}
          else if(node.nodeType===1){
            const focused=node===node.ownerDocument.activeElement;
            for(const a of [...node.attributes])if(!fresh.hasAttribute(a.name)&&!(focused&&a.name==='value'))node.removeAttribute(a.name);
            for(const a of fresh.attributes)if(!(focused&&a.name==='value')&&node.getAttribute(a.name)!==a.value)node.setAttribute(a.name,a.value);
            if(!focused&&'value' in node&&node.tagName==='INPUT')node.value=fresh.value;
            patch(node,fresh);
          }
        }
        const at=previous?previous.nextSibling:parent.firstChild;if(node!==at)parent.insertBefore(node,at);previous=node;
      }
      for(const n of old)if(!used.has(n)&&n.parentNode===parent)n.remove();
    }
    patch(parent,next);
  }

class ListController {
 static update(host,markup){const template=host.ownerDocument.createElement('template');template.innerHTML=markup;patchChildren(host,template.content);}
}
class ModalController {
 constructor({host,background}){this.host=host;this.background=background;this.owner=null;}
 open(markup){this.host.innerHTML=markup;this.owner=this.host.firstElementChild;if(this.background)this.background.inert=true;return this.owner;}
 close(){if(this.owner?.parentNode===this.host)this.owner.remove();this.owner=null;if(!this.host.children.length&&this.background)this.background.inert=false;}
}
return Object.freeze({patchChildren,ListController,ModalController});
});
