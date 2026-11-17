/* Trusted timed surfaces: elapsed area and warning colours; no game transitions. */
(function(root){
 'use strict';
 const surfaces=new WeakMap();
 function clear(element){if(!element)return;element.classList.remove('has-sdk-progress');for(const key of ['--sdk-progress-base','--sdk-progress-fill','--sdk-progress-elapsed'])element.style.removeProperty(key);delete element.dataset.progressBand;surfaces.delete(element);}
 function paint(element,{startedAt,deadline,now}){
  if(!element||!Number.isFinite(startedAt)||!Number.isFinite(deadline)||!Number.isFinite(now)||deadline<=startedAt){clear(element);return null;}
  let base=surfaces.get(element);if(!base){let source=element;while(source){const color=getComputedStyle(source).backgroundColor;if(color!=='transparent'&&color!=='rgba(0, 0, 0, 0)'){base=color;break;}source=source.parentElement;}base||='#f3f0e7';surfaces.set(element,base);element.style.setProperty('--sdk-progress-base',base);}
  const remaining=Math.max(0,deadline-now),elapsed=Math.max(0,Math.min(100,(now-startedAt)/(deadline-startedAt)*100)),yellow='color-mix(in srgb,var(--color-feedback-warning,#cfac4c) 55%,'+base+')',red='color-mix(in srgb,var(--color-feedback-error,#ce735d) 45%,'+base+')';let color=base,band='green';
  if(remaining<=5000){color=red;band='red';}else if(remaining<=10000){color='color-mix(in srgb,'+yellow+' '+((remaining-5000)/50)+'%,'+red+')';band='yellow-red';}else if(remaining<=15000){color='color-mix(in srgb,'+base+' '+((remaining-10000)/50)+'%,'+yellow+')';band='green-yellow';}
  element.classList.add('has-sdk-progress');element.dataset.progressBand=band;element.style.setProperty('--sdk-progress-elapsed',elapsed.toFixed(3)+'%');element.style.setProperty('--sdk-progress-fill',color);return {remaining,elapsed,band};
 }
 root.PlayroomProgressSurface=Object.freeze({paint,clear});
})(globalThis);
