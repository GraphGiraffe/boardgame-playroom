// Read-only geometry overlay, opt-in for review. No layout, input or preference writes.
(function(root){
 'use strict';let options=null,overlay=null,observer=null,resizeObserver=null,scheduled=false;
 const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const regionSelectors=['.hub-main','.table-header','.layout-field','.layout-self','.layout-participants','.layout-actions','.layout-shared','.modal','.appearance-dialog'];
 function visible(e){return e?.getClientRects().length&&root.getComputedStyle(e).visibility!=='hidden';}
 function geometry(){
  const doc=root.document,percent=root.PlayroomInterfaceScale?.applied||100,baseGrid=root.PlayroomElementSizes.layoutGrid(root.innerWidth,percent,root.innerHeight),host=[...doc.querySelectorAll('.hub-main,.table-shell')].find(visible)||doc.documentElement;
  const r=host.getBoundingClientRect(),s=root.getComputedStyle(host),left=r.left+(parseFloat(s.paddingLeft)||0),right=r.right-(parseFloat(s.paddingRight)||0);
  const tiles=doc.querySelector('.hub-main .game-grid'),tileStyle=tiles?root.getComputedStyle(tiles):null,grid={...baseGrid,margin:parseFloat(s.paddingLeft)||0,gutter:parseFloat(tileStyle?.columnGap)||baseGrid.gutter};
  return {viewport:{width:root.innerWidth,height:root.innerHeight},grid,content:{left,right,width:Math.max(0,right-left),top:Math.max(0,r.top),bottom:Math.min(root.innerHeight,r.bottom)}};
 }
 function draw(){
  scheduled=false;if(!options||!root.document)return;const doc=root.document,g=geometry(),w=g.viewport.width,h=g.viewport.height,grid=g.grid,lines=[];
  if(!overlay){overlay=doc.createElement('div');overlay.id='playroom-layout-guides';overlay.setAttribute('aria-hidden','true');overlay.setAttribute('inert','');overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:hidden;contain:strict';doc.body.append(overlay);}
  const line=(x1,y1,x2,y2,color,dash='')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"${dash?` stroke-dasharray="${dash}"`:''}/>`;
  if(options.baseline){const step=options.baseline===8?8:4;lines.push(`<defs><pattern id="hod-guide-grid" width="${step}" height="${step}" patternUnits="userSpaceOnUse"><path d="M ${step} 0 L 0 0 0 ${step}" fill="none" stroke="#168fa3" stroke-opacity=".22" stroke-width=".5"/></pattern></defs><rect width="${w}" height="${h}" fill="url(#hod-guide-grid)"/>`);}
  if(options.columns){const columnWidth=Math.max(0,(g.content.width-(grid.columns-1)*grid.gutter)/grid.columns);for(let i=0;i<grid.columns;i++){const x=g.content.left+i*(columnWidth+grid.gutter);lines.push(`<rect data-guide-column="${i+1}" x="${x}" y="0" width="${columnWidth}" height="${h}" fill="#c14299" fill-opacity=".065"/>`);lines.push(line(x,0,x,h,'#c1429966'));}lines.push(line(g.content.right,0,g.content.right,h,'#c1429999'));}
  if(options.centers){lines.push(line(w/2,0,w/2,h,'#dc7446aa','5 4'));lines.push(line(0,h/2,w,h/2,'#dc7446aa','5 4'));}
  if(options.zones)for(const selector of regionSelectors)for(const node of doc.querySelectorAll(selector)){
   if(!visible(node))continue;const r=node.getBoundingClientRect();if(r.bottom<0||r.top>h)continue;const style=root.getComputedStyle(node),padding=['Top','Right','Bottom','Left'].map(side=>parseFloat(style['padding'+side])||0),border=['Top','Right','Bottom','Left'].map(side=>parseFloat(style['border'+side+'Width'])||0);const color=selector.includes('modal')||selector.includes('dialog')?'#c88425':'#267bc1';if(padding.some(Boolean)){const x=r.x+border[3]+padding[3],y=r.y+border[0]+padding[0],width=Math.max(0,r.width-border[1]-border[3]-padding[1]-padding[3]),height=Math.max(0,r.height-border[0]-border[2]-padding[0]-padding[2]);lines.push(`<rect data-guide-padding="${escape(selector)}" x="${x}" y="${y}" width="${width}" height="${height}" fill="none" stroke="#158d87" stroke-dasharray="3 3" stroke-width="1"/>`);}lines.push(`<g data-guide-zone="${escape(selector)}"><rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" fill="none" stroke="${color}" stroke-width="1"/><text x="${Math.max(2,r.x+3)}" y="${Math.max(11,r.y+11)}" font-family="system-ui" font-size="10" fill="${color}">${escape(selector)} ${Math.round(r.width)}×${Math.round(r.height)} · p${padding.map(n=>Math.round(n*10)/10).join("/")}</text></g>`);if(options.centers)lines.push(line(r.x+r.width/2,r.y,r.x+r.width/2,r.bottom,color+'66','2 4'));
  }
  overlay.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="display:block">${lines.join('')}</svg>`;
 }
 function refresh(){if(!options||scheduled)return;scheduled=true;root.requestAnimationFrame(draw);}
 function hide(){options=null;overlay?.remove();overlay=null;observer?.disconnect();observer=null;resizeObserver?.disconnect();resizeObserver=null;root.removeEventListener('resize',refresh);root.removeEventListener('scroll',refresh,true);}
 function show(value={}){
  hide();options={baseline:4,columns:true,centers:true,zones:true,...value};const doc=root.document;if(!doc)return;
  observer=new root.MutationObserver(refresh);for(const node of doc.querySelectorAll('#app,#modal-root'))observer.observe(node,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  resizeObserver=new root.ResizeObserver(refresh);for(const node of doc.querySelectorAll('#app,#modal-root'))resizeObserver.observe(node);root.addEventListener('resize',refresh);root.addEventListener('scroll',refresh,true);draw();
 }
 root.PlayroomLayoutGuides=Object.freeze({show,hide,refresh,geometry,get enabled(){return !!options;}});
})(globalThis);
