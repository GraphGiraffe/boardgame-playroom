/* Bounded structured commands; shared by rules, author tools and player UI. */
(function(root,factory){const api=factory(root.PlayroomModelValues||(typeof require==='function'?require('./model-values.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;root.PlayroomModelInputs=api;})(globalThis,function(V){
 'use strict';
 const {record,integer,check,snapshot,canonical}=V;
 const key=name=>typeof name==='string'&&/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(name)&&!['constructor','prototype','__proto__'].includes(name);
 function ink(value){
  check(record(value)&&typeof value.id==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/.test(value.id),'INPUT_INVALID');
  const allowed=value.kind==='clear'?['kind','id']:value.kind==='fill'?['kind','id','color','x','y']:['kind','id','tool','color','width','points'];
  check(Object.keys(value).every(k=>allowed.includes(k)),'INPUT_INVALID');
  if(value.kind==='clear')return;
  check(typeof value.color==='string'&&/^#[a-f0-9]{6}$/i.test(value.color),'INPUT_INVALID');
  if(value.kind==='fill'){check(integer(value.x,0,65535)&&integer(value.y,0,65535),'INPUT_INVALID');return;}
  check(value.kind==='stroke'&&['brush','eraser'].includes(value.tool)&&integer(value.width,1,3)&&Array.isArray(value.points)&&value.points.length>0&&value.points.length<=128&&value.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>integer(n,0,65535))),'INPUT_INVALID');
 }
 function choices(values){
  check(Array.isArray(values)&&values.length<=32,'INPUT_SCHEMA_INVALID');
  const seen=new Set();
  for(const choice of values){
   check(record(choice)&&['public','private'].includes(choice.visibility)&&record(choice.command)&&record(choice.fields)&&Object.keys(choice.fields).length>0&&Object.keys(choice.fields).length<=8,'INPUT_SCHEMA_INVALID');V.command(choice.command);
   const signature=canonical(choice.command);check(!seen.has(signature),'INPUT_SCHEMA_INVALID');seen.add(signature);
   if(choice.label!==undefined)check(typeof choice.label==='string'&&choice.label.length<=160,'INPUT_SCHEMA_INVALID');
   for(const [name,spec]of Object.entries(choice.fields)){
    check(key(name)&&!Object.hasOwn(choice.command,name)&&record(spec)&&['text','integer','boolean','enum','ink'].includes(spec.kind),'INPUT_SCHEMA_INVALID');
    check(spec.label===undefined||typeof spec.label==='string'&&spec.label.length<=160,'INPUT_SCHEMA_INVALID');
    if(spec.kind==='text')check(integer(spec.maxLength,1,512)&&(spec.minLength===undefined||integer(spec.minLength,0,spec.maxLength)),'INPUT_SCHEMA_INVALID');
    if(spec.kind==='integer')check(Number.isSafeInteger(spec.min)&&Number.isSafeInteger(spec.max)&&spec.min<=spec.max,'INPUT_SCHEMA_INVALID');
    if(spec.kind==='enum')check(Array.isArray(spec.values)&&spec.values.length>0&&spec.values.length<=32&&new Set(spec.values.map(canonical)).size===spec.values.length&&spec.values.every(v=>typeof v==='string'&&v.length<=160||typeof v==='boolean'||Number.isSafeInteger(v)),'INPUT_SCHEMA_INVALID');
   }
  }
  return snapshot(values);
 }
 function resolve(descriptors,action){
  V.command(action);
  for(const descriptor of descriptors){
   const fields=Object.keys(descriptor.fields),base=Object.fromEntries(Object.entries(action).filter(([name])=>!fields.includes(name)));
   if(canonical(base)!==canonical(descriptor.command))continue;
   check(Object.keys(action).length===Object.keys(descriptor.command).length+fields.length,'INPUT_INVALID');
   for(const [name,spec]of Object.entries(descriptor.fields)){
    const value=action[name];check(Object.hasOwn(action,name),'INPUT_INVALID');
    if(spec.kind==='text')check(typeof value==='string'&&value.length>=(spec.minLength??1)&&value.length<=spec.maxLength&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value),'INPUT_INVALID');
    if(spec.kind==='integer')check(integer(value,spec.min,spec.max),'INPUT_INVALID');
    if(spec.kind==='boolean')check(typeof value==='boolean','INPUT_INVALID');
    if(spec.kind==='enum')check(spec.values.some(v=>canonical(v)===canonical(value)),'INPUT_INVALID');
    if(spec.kind==='ink')ink(value);
   }
   return snapshot(action);
  }
  return null;
 }
 return Object.freeze({choices,resolve,ink});
});
