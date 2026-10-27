'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {render}=require('../app/rulebook-view.js');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
test('illustrated rulebooks escape text, use pack illustrations and constrain layout',()=>{
 const calls=[];const result=render({sections:[{title:'<script>bad</script>',paragraphs:['A < B'],layout:'grid evil',figures:[{id:'tile-water',caption:'<img src=x>',role:'tile'},{id:'missing',caption:'Missing'}],note:'<b>Plain</b>',blocks:[{type:'paragraph',text:'A < B'},{type:'list',ordered:true,items:['<step>']},{type:'table',headers:['<header>'],rows:[['<cell>']]},{type:'script',text:'bad'}]}]},{esc,illustrate:id=>{calls.push(id);return id==='missing'?'':'<svg viewBox="0 0 100 100"></svg>';}});
 assert.match(result,/is-grid/);assert(!result.includes('grid evil'));assert(!result.includes('<script>'));assert(!result.includes('<img'));assert.match(result,/&lt;b&gt;Plain/);assert.equal((result.match(/<figure /g)||[]).length,1);assert.deepEqual(calls,['tile-water','missing']);assert.match(result,/<ol><li>&lt;step&gt;<\/li><\/ol>/);assert.match(result,/&lt;header&gt;/);assert.match(result,/&lt;cell&gt;/);assert(!result.includes('<script>'));
});
test('rules illustration registry preserves pack scope and removes providers with their pack',()=>{
 const UI=require('../core/ui.js'),registry=UI.createRegistry();
 assert.throws(()=>registry.register('bad',()=>'',null,{illustrations:{}}),/Invalid rule illustrations/);
 registry.register('example',()=>'',null,{illustrations:id=>'<svg>'+id+'</svg>'});
 assert.equal(registry.illustration('example','one'),'<svg>one</svg>');assert.equal(registry.illustration('example','../path'),'');
 registry.remove('example');assert.equal(registry.illustration('example','one'),'');
});
