/* Keep theme painting edge-to-edge; safe content spacing is a separate policy. */
(function(root){
 'use strict';
 function apply(){
  const doc=root.document,viewport=doc.querySelector('meta[name="viewport"]');
  if(!viewport)return;const current=viewport.content,next=/viewport-fit\s*=/i.test(current)?current.replace(/viewport-fit\s*=\s*[^,;]+/i,'viewport-fit=cover'):current+', viewport-fit=cover';if(current!==next)viewport.content=next;
 }
 root.PlayroomDisplayCutout=Object.freeze({apply});
})(globalThis);
