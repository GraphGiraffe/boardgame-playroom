/* Generic public ink surface. Packs supply policy, style and durable operations. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomRealtimeCanvas=api;})(globalThis,function(){
 'use strict';
 const Core=globalThis.PlayroomRealtime||(typeof require==='function'?require('../../core/realtime.js'):null);
 function eraseTargets(document,center,radius){
  if(!Array.isArray(center)||center.length!==2||!center.every(Number.isFinite)||!Number.isFinite(radius)||radius<=0)throw Error('INK_ERASER_INVALID');
  return document.all().flatMap(stroke=>{const erased=new Set(stroke.erased),ranges=[];let from=-1;
   stroke.points.forEach(([x,y],index)=>{const hit=!erased.has(index)&&(x-center[0])**2+(y-center[1])**2<=radius**2;if(hit&&from<0)from=index;if(!hit&&from>=0){ranges.push([from,index-1]);from=-1;}});if(from>=0)ranges.push([from,stroke.points.length-1]);return ranges.length?[{id:stroke.id,ranges}]:[];
  });
 }
 function mount(canvas,{document,client=null,enabled=()=>true,mode=()=> 'draw',style=()=>({color:'#29483e',width:256}),eraserRadius=()=>1024,idFactory=()=>globalThis.crypto.randomUUID(),onError=()=>{}}){
  const win=canvas.ownerDocument.defaultView,ctx=canvas.getContext('2d'),cache=new Map(),pending=[];let scheduled=0,full=true,closed=false,pointer=null,width=0,height=0;
  const schedule=()=>{if(!closed&&!scheduled)scheduled=win.requestAnimationFrame(paint);};
  function line(points,paint){if(!points.length)return;ctx.strokeStyle=paint.color;ctx.fillStyle=paint.color;ctx.lineWidth=paint.width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();ctx.moveTo(...points[0]);for(let i=1;i<points.length;i++)ctx.lineTo(...points[i]);if(points.length===1){ctx.arc(points[0][0],points[0][1],paint.width/2,0,Math.PI*2);ctx.fill();}else ctx.stroke();}
  function paint(){scheduled=0;if(closed)return;const box=canvas.getBoundingClientRect(),ratio=win.devicePixelRatio||1,w=Math.max(1,Math.round(box.width*ratio)),h=Math.max(1,Math.round(box.height*ratio));if(w!==width||h!==height){width=canvas.width=w;height=canvas.height=h;full=true;}ctx.setTransform(w/65535,0,0,h/65535,0,0);
   if(full){ctx.clearRect(0,0,65535,65535);cache.clear();for(const stroke of document.all()){for(const segment of document.segments(stroke.id))line(segment,stroke.style);cache.set(stroke.id,{length:stroke.points.length,last:stroke.points.at(-1)});}full=false;pending.length=0;return;}
   for(const event of pending){const prior=cache.get(event.id)||{length:0,last:null},all=event.kind==='ink.commit',points=all?event.points.slice(prior.length):event.points;if(!points.length)continue;if(!all&&event.from!==prior.length){full=true;break;}line(prior.last?[prior.last,...points]:points,event.style);cache.set(event.id,{length:all?event.points.length:event.from+points.length,last:points.at(-1)});}pending.length=0;if(full)schedule();
  }
  const off=document.subscribe(event=>{if(['ink.erase','ink.checkpoint'].includes(event.kind)){full=true;pending.length=0;}else if(!full&&['ink.append','ink.commit'].includes(event.kind)){pending.push(event);if(pending.length>128){full=true;pending.length=0;}}schedule();}),observer=new win.ResizeObserver(()=>{full=true;schedule();});observer.observe(canvas);schedule();
  const coordinate=event=>{const box=canvas.getBoundingClientRect();return [Core.coordinate(event.clientX-box.left,box.width),Core.coordinate(event.clientY-box.top,box.height)];};
  function sample(event){const point=coordinate(event);if(pointer.mode==='erase'){for(const target of eraseTargets(document,point,eraserRadius())){let indices=pointer.erased.get(target.id);if(!indices){indices=new Set();pointer.erased.set(target.id,indices);}for(const [from,to]of target.ranges)for(let i=from;i<=to;i++)indices.add(i);}return;}
   const before=pointer.last;if(before&&before[0]===point[0]&&before[1]===point[1])return;const distance=before?Math.hypot(point[0]-before[0],point[1]-before[1]):0,n=Math.max(1,Math.ceil(distance/256)),batch=Array.from({length:n},(_,i)=>before?[Math.round(before[0]+(point[0]-before[0])*(i+1)/n),Math.round(before[1]+(point[1]-before[1])*(i+1)/n)]:point);client.append(pointer.stroke,batch);pointer.last=point;
  }
  function down(event){if(!client||!enabled()||pointer||event.button!==0)return;event.preventDefault();pointer={id:event.pointerId,stroke:idFactory(),mode:mode(),last:null,erased:new Map()};canvas.setPointerCapture(event.pointerId);try{if(pointer.mode!=='erase')void client.begin(pointer.stroke,style()).catch(onError);sample(event);}catch(error){onError(error);pointer=null;}}
  function move(event){if(!pointer||pointer.id!==event.pointerId)return;try{sample(event);}catch(error){onError(error);pointer=null;}}
  async function finish(event){if(!pointer||pointer.id!==event.pointerId)return;const stroke=pointer;try{if(event.type!=='pointercancel')sample(event);}catch(error){onError(error);}pointer=null;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);
   try{if(stroke.mode!=='erase'){await client.commit(stroke.stroke);return;}const targets=[];for(const [id,indices]of stroke.erased){const sorted=[...indices].sort((a,b)=>a-b),ranges=[];for(const index of sorted){const last=ranges.at(-1);if(last&&last[1]+1===index)last[1]=index;else ranges.push([index,index]);}for(let i=0;i<ranges.length;i+=128)targets.push({id,ranges:ranges.slice(i,i+128)});}for(let i=0;i<targets.length;i+=32)await client.erase(idFactory(),targets.slice(i,i+32));}catch(error){onError(error);}
  }
  if(client){canvas.style.touchAction='none';canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);}
  return Object.freeze({redraw(){full=true;schedule();},destroy(){closed=true;win.cancelAnimationFrame(scheduled);observer.disconnect();off();pending.length=0;canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',finish);canvas.removeEventListener('pointercancel',finish);}});
 }
 return Object.freeze({mount,eraseTargets});
});
