/* Stable Web trees shared by game, room, library and modal adapters. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomDOM=api;})(globalThis,function(){
'use strict';
  // Reveal vertically in one owned scrollport, never in its ancestors.
  function revealInScrollport(scroller,element){
    if(!scroller?.contains(element)||!scroller.offsetHeight)return;
    const box=scroller.getBoundingClientRect(),item=element.getBoundingClientRect(),scale=box.height/scroller.offsetHeight||1,style=scroller.ownerDocument.defaultView.getComputedStyle(scroller);
    const top=(item.top-box.top)/scale-scroller.clientTop,bottom=(item.bottom-box.top)/scale-scroller.clientTop,padTop=parseFloat(style.scrollPaddingTop)||0,padBottom=parseFloat(style.scrollPaddingBottom)||0;
    if(top<padTop||bottom-top>scroller.clientHeight-padTop-padBottom)scroller.scrollTop+=top-padTop;
    else if(bottom>scroller.clientHeight-padBottom)scroller.scrollTop+=bottom-scroller.clientHeight+padBottom;
  }
  // Preserve a visible focus through resize, but respect a manual scroll away.
  // The owner disposes this subscription when its connected surface closes.
  function trackScrollportFocus(scroller,{isCurrent=()=>true}={}){
    const doc=scroller.ownerDocument,win=doc.defaultView;let frame=0,disposed=false,focused=null,visible=false;
    const remember=()=>{
      focused=scroller.contains(doc.activeElement)?doc.activeElement:null;visible=false;if(!focused)return;
      const box=scroller.getBoundingClientRect(),item=focused.getBoundingClientRect(),scale=box.height/scroller.offsetHeight||1,top=box.top+scroller.clientTop*scale;
      visible=item.top>=top-.5&&item.bottom<=top+scroller.clientHeight*scale+.5;
    };
    const changed=()=>{if(!frame)remember();};
    const resize=()=>{if(disposed||frame)return;frame=win.requestAnimationFrame(()=>{
      frame=0;if(disposed||!scroller.isConnected||scroller.closest('[inert],[hidden]')||!isCurrent())return;
      if(visible&&focused===doc.activeElement&&scroller.contains(focused))revealInScrollport(scroller,focused);
      remember();
    });};
    remember();const observer=win.ResizeObserver?new win.ResizeObserver(resize):null;observer?.observe(scroller);
    scroller.addEventListener('focusin',remember);scroller.addEventListener('scroll',changed,{passive:true});win.addEventListener('resize',resize);win.visualViewport?.addEventListener('resize',resize);
    return ()=>{disposed=true;observer?.disconnect();win.cancelAnimationFrame(frame);scroller.removeEventListener('focusin',remember);scroller.removeEventListener('scroll',changed);win.removeEventListener('resize',resize);win.visualViewport?.removeEventListener('resize',resize);};
  }
  const fixedOrigins=new WeakMap();
  // A viewport coordinate is not always a CSS fixed offset: root gutters and
  // transformed portal parents change the fixed containing block. A sibling
  // probe shares that block without inheriting the positioned element's motion.
  function positionFixed(element,{left,top}){
    const parent=element.parentElement;
    if(!parent||!Number.isFinite(left)||!Number.isFinite(top))throw new TypeError('positionFixed requires an attached element and finite coordinates');
    let probe=fixedOrigins.get(parent);
    if(!probe||probe.parentElement!==parent){
      probe=element.ownerDocument.createElement('span');probe.dataset.fixedOriginProbe='';probe.setAttribute('aria-hidden','true');
      probe.style.cssText='position:fixed;left:0;top:0;right:auto;bottom:auto;width:1px;height:1px;min-width:0;min-height:0;max-width:none;max-height:none;margin:0;padding:0;border:0;box-sizing:border-box;visibility:hidden;pointer-events:none;transform:none';
      parent.append(probe);fixedOrigins.set(parent,probe);
    }
    // Keep one probe per portal: adding/removing it on every refresh would
    // retrigger scene observers indefinitely. Its geometry is read afresh.
    const origin=probe.getBoundingClientRect();
    element.style.left=(left-origin.left)/(origin.width||1)+'px';
    element.style.top=(top-origin.top)/(origin.height||1)+'px';
  }
  // Existing physical component keys also form fragment boundaries. Tokenize
  // authored tags (including quoted attributes), never infer card identity from
  // faces or hand positions. Ambiguous/raw-text markup keeps the native path.
  function keyedFragments(markup){
    const unchanged=()=>({markup,fragments:new Map()});
    if(typeof markup!=='string'||markup.length>3000000||/<(?:script|style|xmp|iframe|noembed|noframes|plaintext)\b/i.test(markup))return unchanged();
    const tags=/<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;
    const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    const stack=[],parts=[],fragments=new Map();let active=null,end=0,match;
    const finish=stop=>{const source=markup.slice(active.start,stop);if(!source.includes('data-scene-fragment')){const id='key:'+active.key;if(fragments.has(id)||fragments.size>=256)return false;fragments.set(id,source);parts.push(markup.slice(end,active.start),'<template data-scene-fragment="'+id.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;')+'"></template>');end=stop;}active=null;return true;};
    while((match=tags.exec(markup))){
      const token=match[0];if(token.startsWith('<!'))continue;
      const head=/^<(\/?)([\w:-]+)/.exec(token),tag=head[2].toLowerCase();
      if(head[1]){if(stack.pop()!==tag)return unchanged();if(active&&stack.length===active.depth&&!finish(tags.lastIndex))return unchanged();continue;}
      if(!active){const attributes=token.slice(head[0].length,-1),pattern=/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;let attr;
        while((attr=pattern.exec(attributes)))if(['data-dom-key','data-entity'].includes(attr[1].toLowerCase())||(tag==='template'&&attr[1].toLowerCase()==='data-game-memo')){const name=attr[1].toLowerCase(),key=name==='data-game-memo'?'inert:game-memo':(name==='data-entity'?'entity:':'')+(attr[2]??attr[3]??attr[4]??'');if(key&&key.length<=160&&!/\sdata-public-display(?:\s|=|>)/.test(token))active={key,start:match.index,depth:stack.length};break;}}
      if(tag==='title'||tag==='textarea'){const close=new RegExp('</'+tag+'\\s*>','gi');close.lastIndex=tags.lastIndex;const end=close.exec(markup);if(!end)return unchanged();tags.lastIndex=close.lastIndex;if(active&&active.start===match.index&&!finish(tags.lastIndex))return unchanged();continue;}
      if(voids.has(tag)||/\/\s*>$/.test(token)){if(active&&active.start===match.index&&!finish(tags.lastIndex))return unchanged();}
      else stack.push(tag);
    }
    if(stack.length||active||!fragments.size)return unchanged();parts.push(markup.slice(end));return {markup:parts.join(''),fragments};
  }
  // Local renderer fragments are immutable authored baselines. Reuse their
  // nodes only after patching consumed the previous baseline.
  function fragmentTemplate(document,markup,fragments=new Map(),previous=null){
    const template=document.createElement('template');template.innerHTML=markup;
    const entries=new Map(),retained=new Map();
    for(const marker of template.content.querySelectorAll('template[data-scene-fragment]')){
      const id=marker.dataset.sceneFragment,source=fragments.get(id);
      if(typeof source!=='string'||entries.has(id)||entries.size>=256)throw Error('Invalid scene fragment');
      const old=previous?.entries.get(id);let entry=old;
      if(old?.source===source)retained.set(id,old.tree);
      else{
        const parsed=document.createElement('template');parsed.innerHTML=source;const tree=parsed.content.firstElementChild;
        if(!tree||tree.tagName==='TEMPLATE'||parsed.content.children.length!==1||[...parsed.content.childNodes].some(n=>n.nodeType!==1&&n.textContent.trim())||tree.querySelector('template[data-scene-fragment]'))throw Error('Scene fragment requires one independent element');
        entry={source,tree};marker.replaceWith(tree);
      }
      entries.set(id,entry);
    }
    const resolve=marker=>retained.get(marker.dataset.sceneFragment);
    return {template,entries,resolve,commit(){for(const marker of template.content.querySelectorAll('template[data-scene-fragment]')){const tree=resolve(marker);if(tree)marker.replaceWith(tree);}}};
  }
  // A live controller may own one subtree while its parent patches the shell.
  // Ownership is a runtime lease, never an instruction accepted from markup.
  const managedChildren=new WeakMap();
  function manageChildren(host){
    if(host?.nodeType!==1)throw new TypeError('manageChildren requires an element');
    const lease={};managedChildren.set(host,lease);
    return ()=>{if(managedChildren.get(host)===lease)managedChildren.delete(host);};
  }
  const patchOwners=new WeakMap();
  function observePatches(host,listener){patchOwners.set(host,listener);return ()=>{if(patchOwners.get(host)===listener)patchOwners.delete(host);};}
  function patchChildren(parent,next,previousTree=null,onChange=null,resolveTemplate=null){
    let owner=parent;while(owner&&!patchOwners.has(owner))owner=owner.parentElement;
    const listener=onChange?null:patchOwners.get(owner),changes=[];
    const changed=(node,kind,name=null,previous=null,value=null)=>{if(!onChange&&!listener)return;const change={node,parent:node.parentElement||parent,kind,name,previous,value};if(onChange)onChange(change);else if(listener)changes.push(change);};
    // Explicit physical keys survive presentation-lane changes; regions supply the default key.
    const key=n=>n.nodeType===1?((n.hasAttribute('data-dom-key')?'dom:'+n.getAttribute('data-dom-key'):'')||(n.hasAttribute('data-playroom-fragment')?'fragment:'+n.getAttribute('data-playroom-fragment'):'')||n.id||n.getAttribute('data-entity')||n.getAttribute('data-grid-index')||n.getAttribute('data-open-save')||n.getAttribute('data-restore-network')||n.getAttribute('data-game')||(n.dataset.packId&&n.dataset.packVersion?`${n.dataset.packId}@${n.dataset.packVersion}`:'')||n.getAttribute('data-room-drop')||n.getAttribute('data-participant-id')||n.getAttribute('data-player-index')&&'player:'+n.getAttribute('data-player-index')||n.getAttribute('data-command')||n.getAttribute('data-net-action')||''):'';
    function patch(parent,next,prior){
      const old=[...parent.childNodes],before=[...(prior?.childNodes||[])],used=new Set();let previous=null;
      for(const candidate of [...next.childNodes]){
        const fresh=candidate.nodeType===1&&candidate.tagName==='TEMPLATE'&&resolveTemplate?resolveTemplate(candidate)||candidate:candidate;
        const k=key(fresh),priorNode=before.find(n=>n.nodeType===fresh.nodeType&&n.nodeName===fresh.nodeName&&key(n)===k);if(priorNode)before.splice(before.indexOf(priorNode),1);let node=old.find(n=>!used.has(n)&&n.nodeType===fresh.nodeType&&n.nodeName===fresh.nodeName&&key(n)===k);
        if(!node){
          node=fresh.cloneNode(true);
          if(resolveTemplate)for(const marker of node.querySelectorAll?.('template')||[]){const region=resolveTemplate(marker);if(region&&region!==marker)marker.replaceWith(region.cloneNode(true));}
          changed(node,'insert');
        }else{
          used.add(node);
          if(priorNode===fresh||priorNode&&fresh.isEqualNode(priorNode)&&fresh.nodeName!=='TEMPLATE'&&!fresh.querySelector?.('template')){/* Keep fitted geometry and live effects for unchanged markup. */}
          else if(node.nodeType===3){if(node.textContent!==fresh.textContent){changed(node,'text',null,node.textContent,fresh.textContent);node.textContent=fresh.textContent;}}
          else if(node.nodeType===1&&(!node.isEqualNode(fresh)||node.tagName==='TEMPLATE'||node.querySelector('template'))){
            const focused=node===node.ownerDocument.activeElement;
            const transient=['is-turn-skipped','is-addressed'].filter(name=>node.classList.contains(name));
            for(const a of [...node.attributes])if(!fresh.hasAttribute(a.name)&&(!priorNode||priorNode.hasAttribute(a.name))&&!(focused&&a.name==='value')){changed(node,'attribute',a.name,priorNode?.getAttribute(a.name)??a.value,null);if(a.name==='style'&&priorNode){for(const name of [...priorNode.style])node.style.removeProperty(name);if(!node.style.length)node.removeAttribute('style');}else node.removeAttribute(a.name);}
            for(const a of fresh.attributes)if(!(focused&&a.name==='value')&&(!priorNode||priorNode.getAttribute(a.name)!==a.value)&&node.getAttribute(a.name)!==a.value){
              changed(node,'attribute',a.name,priorNode?.getAttribute(a.name)??node.getAttribute(a.name),a.value);
              if(priorNode&&a.name==='style'){
                for(const name of [...priorNode.style])if(!fresh.style.getPropertyValue(name))node.style.removeProperty(name);
                for(const name of [...fresh.style])if(fresh.style.getPropertyValue(name)!==priorNode.style.getPropertyValue(name)||fresh.style.getPropertyPriority(name)!==priorNode.style.getPropertyPriority(name))node.style.setProperty(name,fresh.style.getPropertyValue(name),fresh.style.getPropertyPriority(name));
              }else node.setAttribute(a.name,a.value);
            }
            if(transient.length)node.classList.add(...transient);
            if(!focused&&'value' in node&&node.tagName==='INPUT')node.value=fresh.value;
            if(node.tagName==='TEMPLATE')patch(node.content,fresh.content,priorNode?.content);else if(!managedChildren.has(node))patch(node,fresh,priorNode);
          }
        }
        const at=previous?previous.nextSibling:parent.firstChild;if(node!==at){parent.insertBefore(node,at);changed(node,'position');}previous=node;
      }
      for(const n of old)if(!used.has(n)&&n.parentNode===parent){changed(n,'remove');n.remove();}
    }
    patch(parent,next,previousTree);if(changes.length)listener(changes);
  }

class ListController {
 static update(host,markup){const template=host.ownerDocument.createElement('template');template.innerHTML=markup;patchChildren(host,template.content);}
}
// Controllers sharing a host share its connected surface stack. A frame is an
// ownership capability; DOM references or old capture tokens cannot recreate it.
const modalHosts=new WeakMap(),modalFrames=new WeakMap(),modalCaptures=new WeakMap();
// Logical owners retire synchronously. Only their inert presentation may finish
// outside the registry host; completion can never act on a replacement frame.
const visualExits=new WeakMap(),motionDocuments=new WeakSet();
const nativePopoverStates=new WeakMap();
globalThis.document?.addEventListener('beforetoggle',event=>{
 const element=event.target;if(!element?.hasAttribute?.('popover'))return;
 if(event.newState==='closed'){
  nativePopoverStates.set(element,{inert:element.getAttribute('inert'),ariaHidden:element.getAttribute('aria-hidden')});element.inert=true;element.setAttribute('aria-hidden','true');
 }else if(event.newState==='open'){
  const original=nativePopoverStates.get(element);if(!original)return;
  if(original.inert===null)element.removeAttribute('inert');else element.setAttribute('inert',original.inert);
  if(original.ariaHidden===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',original.ariaHidden);
  nativePopoverStates.delete(element);
 }
},true);
function clearVisualExits(doc,{kinds=null}={}){for(const finish of [...(visualExits.get(doc)||[])])if(!kinds||kinds.includes(finish.kind))finish();}
function retireVisual(element,{animate=true,kind='surface'}={}){
 const doc=element.ownerDocument,win=doc.defaultView,reduced=win?.matchMedia?.('(prefers-reduced-motion: reduce)');
 if(!motionDocuments.has(doc)){motionDocuments.add(doc);for(const type of ['click','dblclick','contextmenu','pointerdown','pointerup','keydown','keyup','submit','input','change'])win.addEventListener(type,event=>{if(event.target?.closest?.('[data-ui-surface-exit]')){event.preventDefault();event.stopImmediatePropagation();}},true);}
 if(!animate||!element.isConnected||doc.hidden||reduced?.matches||doc.body.classList.contains('reduced-motion')){finishVisualEntry(element);element.remove();return;}
 const target=kind==='surface'?element.querySelector(':scope>.modal'):element;
 if(!target){finishVisualEntry(element);element.remove();return;}
 const current=win.getComputedStyle(target),from={translate:current.translate,opacity:current.opacity,scale:current.scale};
 finishVisualEntry(element);
 if(kind==='banner'){
  const box=element.getBoundingClientRect();Object.assign(element.style,{position:'fixed',left:box.left+'px',top:box.top+'px',right:'auto',bottom:'auto',width:box.width+'px',height:box.height+'px',margin:'0',translate:'0 0',transform:'none'});from.translate='0px 0px';
 }
 const layer=doc.createElement('div');layer.dataset.uiSurfaceExit=kind;layer.inert=true;layer.setAttribute('aria-hidden','true');
 for(const type of ['click','dblclick','contextmenu','pointerdown','pointerup','keydown','keyup','submit','input','change'])layer.addEventListener(type,event=>{event.preventDefault();event.stopImmediatePropagation();},true);
 element.inert=true;element.setAttribute('aria-hidden','true');element.dataset.uiMotion='exit';
 for(const [name,value]of Object.entries(from))target.style.setProperty('--ui-motion-from-'+name,value==='none'?(name==='scale'?'1':'0px 0px'):value);
 layer.append(element);const before=kind==='surface'?[...doc.body.children].find(node=>node.hasAttribute('data-ui-surface-exit')&&node.dataset.uiSurfaceExit==='surface'):null;doc.body.insertBefore(layer,before||null);
 const animations=target.getAnimations().filter(animation=>animation.animationName?.startsWith('ui-')&&animation.animationName.endsWith('-out'));
 let timer=null,finished=false;const exits=visualExits.get(doc)||new Set();visualExits.set(doc,exits);
 const finish=()=>{if(finished)return;finished=true;win.clearTimeout(timer);exits.delete(finish);reduced?.removeEventListener?.('change',motionChanged);doc.removeEventListener('visibilitychange',visibilityChanged);layer.remove();};
 const motionChanged=event=>{if(event.matches)finish();},visibilityChanged=()=>{if(doc.hidden)finish();};
 if(!animations.length){finish();return;}
 finish.kind=kind;exits.add(finish);reduced?.addEventListener?.('change',motionChanged);doc.addEventListener('visibilitychange',visibilityChanged);
 // CSS owns the duration. A cancelled animation retires immediately; the
 // bounded fallback covers engines that omit an animation-finished event.
 const duration=Math.max(...animations.map(animation=>Number(animation.effect?.getComputedTiming().endTime)||0));
 timer=win.setTimeout(finish,Math.min(1000,duration)+34);
 Promise.all(animations.map(animation=>animation.finished)).then(finish,finish);
}
// An entry belongs to one visual lifetime, independent of later preferences.
// The exact capability guards reused DOM against an older completion callback.
const visualEntries=new WeakMap(),quietVisualEntry=Object.freeze({start(){},finish(){}});
function finishVisualEntry(element){visualEntries.get(element)?.finish();}
function prepareVisualEntry(element,{target=element,document:doc=element.ownerDocument}={}){
 finishVisualEntry(element);
 const win=doc.defaultView,reduced=win?.matchMedia?.('(prefers-reduced-motion: reduce)');
 if(!target||!win||doc.hidden||reduced?.matches||doc.body.classList.contains('reduced-motion'))return quietVisualEntry;
 let finished=false,started=false,timer=null,observer=null;
 const finish=()=>{if(finished)return;finished=true;win.clearTimeout(timer);observer?.disconnect();reduced?.removeEventListener?.('change',motionChanged);doc.removeEventListener('visibilitychange',visibilityChanged);if(visualEntries.get(element)===entry){visualEntries.delete(element);if(element.dataset.uiMotion==='enter')delete element.dataset.uiMotion;}};
 const motionChanged=event=>{if(event.matches)finish();},visibilityChanged=()=>{if(doc.hidden)finish();};
 const start=()=>{if(finished||started)return;started=true;if(!element.isConnected||doc.hidden||reduced?.matches||doc.body.classList.contains('reduced-motion')){finish();return;}
  reduced?.addEventListener?.('change',motionChanged);doc.addEventListener('visibilitychange',visibilityChanged);
  if(win.MutationObserver){observer=new win.MutationObserver(records=>{if(!element.isConnected||element.hidden||element.dataset.uiMotion!=='enter'||doc.body.classList.contains('reduced-motion')||records.some(change=>change.target===doc.body&&String(change.oldValue||'').split(/\s+/).includes('reduced-motion')))finish();});observer.observe(doc.body,{attributes:true,attributeFilter:['class'],attributeOldValue:true});observer.observe(doc.documentElement,{childList:true,subtree:true});observer.observe(element,{attributes:true,attributeFilter:['data-ui-motion','hidden']});}
  const animations=target.getAnimations().filter(animation=>animation.animationName?.startsWith('ui-')&&animation.animationName.endsWith('-in'));if(!animations.length){finish();return;}
  const duration=Math.max(...animations.map(animation=>Number(animation.effect?.getComputedTiming().endTime)||0));
  // Pending CSS animations start at the rendering opportunity, not at mount.
  // Synchronous content preparation must not spend their watchdog budget.
  Promise.all(animations.map(animation=>animation.ready)).then(()=>{if(!finished)timer=win.setTimeout(finish,Math.min(1000,duration)+34);},finish);
  Promise.all(animations.map(animation=>animation.finished)).then(finish,finish);
 };
 const entry=Object.freeze({start,finish});visualEntries.set(element,entry);element.dataset.uiMotion='enter';return entry;
}
function enterVisual(element,options){const entry=prepareVisualEntry(element,options);entry.start();return entry.finish;}
let modalSequence=0;
function modalState(host,background,prepareSurface){
 let state=modalHosts.get(host);if(!state){state={host,background,baseline:!!background?.inert,frames:[],backgroundSnapshot:null,prepareSurface:null};modalHosts.set(host,state);}
 else if(background&&!state.background){state.background=background;state.baseline=!!background.inert;}
 if(prepareSurface)state.prepareSurface=prepareSurface;
 return state;
}
function frameValid(record){try{return record.valid()!==false;}catch(_){return false;}}
function rememberSurface(record){
 const doc=record.element.ownerDocument,focus=doc.activeElement,selection=doc.getSelection?.();
 const inside=record.element.contains(focus),range=selection?.anchorNode&&record.element.contains(selection.anchorNode)&&record.element.contains(selection.focusNode)?{anchor:selection.anchorNode,anchorOffset:selection.anchorOffset,focus:selection.focusNode,focusOffset:selection.focusOffset}:null;
 const input=inside&&typeof focus.selectionStart==='number'?{start:focus.selectionStart,end:focus.selectionEnd,direction:focus.selectionDirection}:null;
 record.snapshot={focus:inside?focus:record.snapshot?.focus||null,input:inside?input:record.snapshot?.input||null,range:inside?range:record.snapshot?.range||null,scrolls:[record.element,...record.element.querySelectorAll('*')].filter(el=>el===record.element||el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth||el.scrollTop||el.scrollLeft).map(el=>[el,el.scrollTop,el.scrollLeft])};
}
function focusSurface(record){
 const {element}=record,doc=element.ownerDocument,snapshot=record.snapshot;
 const usable=node=>!!node?.isConnected&&!node.disabled&&!node.closest('[inert],[hidden]')&&!!node.getClientRects().length;
 const focus=usable(snapshot?.focus)&&element.contains(snapshot.focus)?snapshot.focus:[...(record.fallbackElement||element).querySelectorAll('[autofocus],button,input,textarea,select,[contenteditable="true"],[tabindex="0"]')].find(usable);
 try{focus?.focus({preventScroll:true});if(snapshot?.input&&focus===snapshot.focus)focus.setSelectionRange(snapshot.input.start,snapshot.input.end,snapshot.input.direction);const r=snapshot?.input?null:snapshot?.range;if(r?.anchor.isConnected&&r.focus.isConnected&&element.contains(r.anchor)&&element.contains(r.focus))doc.getSelection()?.setBaseAndExtent(r.anchor,r.anchorOffset,r.focus,r.focusOffset);}catch(_){/* A live edit may remove an old range; focus stays on this surface. */}
 for(const [node,top,left]of snapshot?.scrolls||[])if(node.isConnected&&element.contains(node)){node.scrollTop=top;node.scrollLeft=left;}
}
function focusBackground(state){
 const snapshot=state.backgroundSnapshot;if(!snapshot||state.background?.inert)return;
 if(snapshot.snapshot?.focus?.closest?.('[inert]')){
  // Another connected surface (for example the game-chat dock) releases its
  // own inert state after observing the modal stack's DOM mutation.
  state.host.ownerDocument.defaultView?.requestAnimationFrame(()=>{if(!state.frames.length&&state.backgroundSnapshot===snapshot&&!state.background?.inert)focusSurface(snapshot);});
 }else focusSurface(snapshot);
}

function surfaceAttributes(record,active){
 const el=record.element;record.state=active?'active':'suspended';el.dataset.surfaceState=record.state;el.dataset.surfaceId=record.handle.id;el.inert=active?record.initialInert:true;
 if(active){if(record.initialHidden===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',record.initialHidden);}else el.setAttribute('aria-hidden','true');
}
function refreshSurfaces(state,{focus=false}={}){
 const top=state.frames.at(-1);for(const record of state.frames){if(record!==top&&record.state==='active')rememberSurface(record);surfaceAttributes(record,record===top);}
 if(state.background)state.background.inert=state.frames.length?true:state.baseline;
 if(focus&&top&&!top.element.inert)focusSurface(top);else if(focus&&!top)focusBackground(state);
}
function removeSurfaces(state,removed,reason,{focus=true}={}){
 if(!removed.length)return;
 if(!['back','dismiss','restore','silent'].includes(reason))clearVisualExits(state.host.ownerDocument);
 const gone=new Set(removed);state.frames=state.frames.filter(record=>!gone.has(record));
 for(const record of [...removed].reverse()){
  record.state='disposed';record.element.dataset.surfaceState='disposed';
  retireVisual(record.element,{animate:['back','dismiss','restore','silent'].includes(reason)});
 }
 refreshSurfaces(state,{focus});
 for(const record of [...removed].reverse())try{record.onDispose?.(reason,record.handle);}catch(error){state.host.ownerDocument.defaultView?.reportError?.(error);}
}
function checkSurfaces(state){
 const bad=state.frames.findIndex(record=>record.element.parentNode!==state.host||!frameValid(record));if(bad>=0)removeSurfaces(state,state.frames.slice(bad),'invalidate');
}
// Consume only the compatibility click belonging to a completed pointer gesture.
// A fresh pointerdown and keyboard activation are independent interactions.
function consumePointerReleaseClick(point,{document:doc=globalThis.document,timeout=400}={}){
 const win=doc?.defaultView;if(!win||!Number.isFinite(point?.x)||!Number.isFinite(point?.y))return()=>{};
 let timer;const clear=()=>{win.clearTimeout(timer);win.removeEventListener('click',click,true);win.removeEventListener('pointerdown',clear,true);};
 const click=event=>{if(event.detail===0)return;if(Math.abs(event.clientX-point.x)<8&&Math.abs(event.clientY-point.y)<8){event.preventDefault();event.stopImmediatePropagation();}clear();};
 win.addEventListener('click',click,true);win.addEventListener('pointerdown',clear,{capture:true,once:true});timer=win.setTimeout(clear,timeout);return clear;
}
// Screen-owned public presentation values only. Preparing never opens a surface.
class PreparationCache {
 constructor({window:win=globalThis,limit=64,maxBytes=1024*1024}={}){
  if(!Number.isInteger(limit)||limit<1||!Number.isFinite(maxBytes)||maxBytes<1)throw new TypeError('PREPARATION_LIMIT_INVALID');
  this.win=win;this.limit=limit;this.maxBytes=maxBytes;this.values=new Map();this.jobs=new Map();this.bytes=0;this.epoch=0;this.disposed=false;this.idle=null;this.counts={hits:0,misses:0,evictions:0,errors:0};
 }
 get stats(){return Object.freeze({...this.counts,size:this.values.size,bytes:this.bytes,pending:this.jobs.size,disposed:this.disposed});}
 get(key){const item=this.values.get(key);if(!item||this.disposed){this.counts.misses++;return undefined;}this.counts.hits++;this.values.delete(key);this.values.set(key,item);return item.value;}
 set(key,value,{bytes}={}){
  if(this.disposed||typeof key!=='string'||!key.length||key.length*2>this.maxBytes)return false;
  const seen=new Set();let nodes=0;
  const plain=item=>{if(++nodes>10000)return false;if(item===null||typeof item==='string'||typeof item==='boolean')return true;if(typeof item==='number')return Number.isFinite(item);if(typeof item!=='object'||seen.has(item))return false;const proto=Object.getPrototypeOf(item);if(!Array.isArray(item)&&proto!==Object.prototype&&proto!==null)return false;seen.add(item);const valid=Object.values(Object.getOwnPropertyDescriptors(item)).every(descriptor=>'value'in descriptor&&plain(descriptor.value));seen.delete(item);return valid;};
  if(!plain(value))return false;
  const freeze=item=>{if(item&&typeof item==='object'&&!Object.isFrozen(item)){for(const child of Object.values(item))freeze(child);Object.freeze(item);}};freeze(value);
  const text=JSON.stringify(value),actual=(key.length+text.length)*2;
  if(bytes!==undefined&&(!Number.isFinite(bytes)||bytes<0))return false;
  const size=Math.max(actual,bytes||0);if(size>this.maxBytes)return false;
  const previous=this.values.get(key);if(previous){this.bytes-=previous.bytes;this.values.delete(key);}
  while(this.values.size>=this.limit||this.bytes+size>this.maxBytes){const first=this.values.keys().next().value,item=this.values.get(first);this.values.delete(first);this.bytes-=item.bytes;this.counts.evictions++;}
  this.values.set(key,{value,bytes:size});this.bytes+=size;return true;
 }
 prepare(key,factory,{valid=()=>true}={}){
  if(this.disposed||typeof key!=='string'||!key||key.length*2>this.maxBytes||typeof factory!=='function'||typeof valid!=='function'||this.values.has(key)||this.jobs.has(key)||this.jobs.size>=this.limit)return false;
  this.jobs.set(key,{factory,valid,epoch:this.epoch});this._schedule();return true;
 }
 _schedule(){
  if(this.disposed||this.idle!==null||!this.jobs.size)return;
  const epoch=this.epoch,native=typeof this.win.requestIdleCallback==='function'&&typeof this.win.cancelIdleCallback==='function';
  const run=deadline=>{if(epoch!==this.epoch)return;this.idle=null;if(this.disposed||!this.jobs.size)return;
   if(this.win.navigator?.scheduling?.isInputPending?.()||native&&deadline.timeRemaining()<4){this._schedule();return;}
   const [key,job]=this.jobs.entries().next().value;this.jobs.delete(key);
   const current=()=>!this.disposed&&job.epoch===this.epoch&&job.valid()!==false;
   try{if(current()){const value=job.factory();if(value&&typeof value.then==='function'){Promise.resolve(value).catch(()=>{});this.counts.errors++;}else if(current())this.set(key,value);}}catch(_){this.counts.errors++;}
   this._schedule();
  };
  const id=native?this.win.requestIdleCallback(run):this.win.setTimeout(run,50);this.idle={id,native};
 }
 clear(){this.epoch++;if(this.idle!==null){const {id,native}=this.idle;this.idle=null;if(native)this.win.cancelIdleCallback(id);else this.win.clearTimeout(id);}this.jobs.clear();this.values.clear();this.bytes=0;}
 dispose(){this.clear();this.disposed=true;}
}

class ModalController {
 constructor({host,background,prepareSurface=null}){if(!host)throw Error('MODAL_HOST_REQUIRED');if(prepareSurface!==null&&typeof prepareSurface!=='function')throw Error('MODAL_PREPARATION_REQUIRED');this.host=host;this.background=background;this._state=modalState(host,background,prepareSurface);this._owned=null;}
 get owner(){return this._owned?.state!=='disposed'?this._owned?.element||null:null;}
 // Compatibility for old controllers releasing an already replaced dialog.
 set owner(element){
  if(!element){this._owned=null;return;}
  checkSurfaces(this._state);let record=this._state.frames.find(item=>item.element===element);
  if(record){if(record.controller===this)this._owned=record;return;}
  if(element.parentNode===this.host)this._owned=this._create(element,{});
 }
 _create(element,{valid=()=>true,meta=null,onDispose=null}={}){
  this._state.prepareSurface?.(element);
  const record={controller:this,element,valid,onDispose,state:'active',initialInert:!!element.inert,initialHidden:element.getAttribute('aria-hidden'),snapshot:null};
  const handle=Object.freeze({id:'surface-'+(++modalSequence),element,meta,get state(){return record.state;}});record.handle=handle;modalFrames.set(handle,record);this._state.frames.push(record);this._owned=record;return record;
 }
 open(markup,{mode='reset',valid=()=>true,meta=null,onDispose=null}={}){
  if(!['reset','replace','push'].includes(mode))throw Error('MODAL_MODE_INVALID');
  if(typeof valid!=='function')throw Error('MODAL_VALIDITY_REQUIRED');
  const template=this.host.ownerDocument.createElement('template');template.innerHTML=markup;
  if(template.content.children.length!==1)throw Error('MODAL_SINGLE_ROOT_REQUIRED');
  const element=template.content.firstElementChild,state=this._state;checkSurfaces(state);
  if(!state.frames.length&&state.background){state.backgroundSnapshot={element:this.host.ownerDocument.body,fallbackElement:state.background,snapshot:null};rememberSurface(state.backgroundSnapshot);}
  try{if(valid()===false)return null;}catch(_){return null;}
  clearVisualExits(this.host.ownerDocument,{kinds:mode==='push'?['banner','popover']:null});
  if(mode==='reset'){removeSurfaces(state,[...state.frames],'reset',{focus:false});this.host.replaceChildren();}
  else if(mode==='replace')removeSurfaces(state,state.frames.slice(-1),'replace',{focus:false});
  if(state.frames.length)rememberSurface(state.frames.at(-1));
  const record=this._create(element,{valid,meta,onDispose}),entry=prepareVisualEntry(element,{target:element.querySelector(':scope>.modal'),document:this.host.ownerDocument});this.host.append(element);entry.start();refreshSurfaces(state,{focus:true});return record.handle;
 }
 activeFrame(){checkSurfaces(this._state);return this._state.frames.at(-1)?.handle||null;}
 activeRoot(){return this.activeFrame()?.element||null;}
 isActive(handle=this._owned?.handle){checkSurfaces(this._state);const record=modalFrames.get(handle);return !!record&&record===this._state.frames.at(-1)&&record.state==='active';}
 capture(handle=this.activeFrame()){
  checkSurfaces(this._state);const record=modalFrames.get(handle);if(!record||!this._state.frames.includes(record))return null;
  if(record===this._state.frames.at(-1))rememberSurface(record);const token=Object.freeze({frame:handle});modalCaptures.set(token,{state:this._state,record});return token;
 }
 restore(token){
  checkSurfaces(this._state);const saved=modalCaptures.get(token);if(!saved||saved.state!==this._state)return false;
  const index=this._state.frames.indexOf(saved.record);if(index<0||!frameValid(saved.record))return false;
  removeSurfaces(this._state,this._state.frames.slice(index+1),'restore',{focus:false});refreshSurfaces(this._state,{focus:true});return true;
 }
 close(handle=this._owned?.handle,{reason='silent'}={}){
  checkSurfaces(this._state);const record=modalFrames.get(handle);if(!record||record.controller!==this||record!==this._state.frames.at(-1))return false;
  removeSurfaces(this._state,[record],reason);if(this._owned===record)this._owned=[...this._state.frames].reverse().find(item=>item.controller===this)||null;return true;
 }
 invalidate(){clearVisualExits(this.host.ownerDocument);checkSurfaces(this._state);return this.activeFrame();}
 reset({reason='reset'}={}){clearVisualExits(this.host.ownerDocument);removeSurfaces(this._state,[...this._state.frames],reason);this.host.replaceChildren();refreshSurfaces(this._state);this._owned=null;}
 dispose(){const index=this._state.frames.findIndex(record=>record.controller===this);if(index>=0)removeSurfaces(this._state,this._state.frames.slice(index),'dispose');this._owned=null;}
}

return Object.freeze({keyedFragments,fragmentTemplate,manageChildren,revealInScrollport,trackScrollportFocus,positionFixed,patchChildren,observePatches,ListController,ModalController,PreparationCache,consumePointerReleaseClick,prepareVisualEntry,enterVisual,finishVisualEntry,retireVisual,clearVisualExits});
});
