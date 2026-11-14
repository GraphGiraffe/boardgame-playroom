'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium,executablePath}=require('../scripts/codex/browser.cjs');
const root=path.resolve(__dirname,'..');const {serveBrowserFixture}=require('./browser-origin.cjs');
test('raised game pawns share top rims and dark sides across games, themes and orientations',{timeout:60000},async()=>{
 const fixture=await serveBrowserFixture(root);const browser=await chromium.launch({headless:true,executablePath:executablePath(),args:['--no-sandbox','--disable-background-networking']});
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const out=path.resolve(root,'../tmp_files/pawn-design/screenshots');fs.mkdirSync(out,{recursive:true});
 try{for(const game of ['ludo','snakes','mage-brawl']){
  await page.goto(process.env.PLAYROOM_PAWN_ARTIFACT?require('node:url').pathToFileURL(path.resolve(process.env.PLAYROOM_PAWN_ARTIFACT)).href:fixture.url);
  await page.locator('[data-start="'+game+'"]').first().waitFor();
  await page.evaluate(game=>{
   const E=TabletopCore,s=E.createGame(game,{seed:17,players:Array.from({length:game==='mage-brawl'?2:4},(_,i)=>({name:'Игрок '+(i+1)}))});
   if(game==='snakes')s.data.positions=s.data.positions.map((_,i)=>i+1);
   if(game==='mage-brawl')s.data.players[0].ultimate=1;
   window.pawnReview=s;window.pawnViewState={};
   window.renderPawns=()=>{const state=E.project(pawnReview,0),actions=E.legalActions(pawnReview,0),host=document.querySelector('#app');PlayroomGameScreen.update(host,PlayroomGameScreen.render({layoutId:'pawn-review',gameName:E.GAMES.find(g=>g.id===game).name,state,viewer:0,actions,scene:PlayroomViews.render(state,0,actions,{viewState:pawnViewState})}));PlayroomGameScreen.layoutScene(host);};
   renderPawns();
  },game);
  for(const theme of ['light','dark'])for(const viewport of [{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);await page.evaluate(theme=>{PlayroomAppearanceUI.runtime.service.select(theme);renderPawns();},theme);
   if(game==='snakes')assert.equal(await page.locator('.snakes-tokens .pawn-token-art').count(),4,'test pawns are on the board');
   assert(await page.evaluate(()=>{
    const host=document.createElement('div');host.style.cssText='position:fixed;left:-1000px;width:100px;height:100px';document.body.append(host);
    try{return [{value:0},{value:4},{value:12},{value:1000},{first:true}].every(params=>{
     host.innerHTML=TabletopUI.helpers.roundTokenArt({...params,profile:'pawn'});const art=host.firstElementChild,face=art.querySelector('.pawn-token-face'),fm=face.getScreenCTM(),centre=new DOMPoint(50,45).matrixTransform(fm);
     const number=art.querySelector(':scope > text');
     if(number){const b=number.getBBox();return Math.abs(b.x+b.width/2-50)<1&&Math.abs(b.y+b.height/2-Number(face.getAttribute('cy')))<1&&b.width<65&&b.height<75;}
     const glyph=art.querySelector(':scope > svg circle'),gm=glyph.getScreenCTM(),point=new DOMPoint(+glyph.getAttribute('cx'),+glyph.getAttribute('cy')).matrixTransform(gm);
     return Math.hypot(point.x-centre.x,point.y-centre.y)<.1;
    });}finally{host.remove();}
   }),'numbers and symbols stay centered on the shared top face');
   const pawns=page.locator('.app-game-layout .pawn-token-art');assert(await pawns.count()>0,game+' uses the shared pawn profile');
   const painted=await pawns.evaluateAll(nodes=>nodes.map(node=>{const side=node.querySelector('.pawn-token-side'),face=node.querySelector('.pawn-token-face'),inset=node.querySelector('.pawn-token-inset');return {side:getComputedStyle(side).fill,face:getComputedStyle(face).fill,body:getComputedStyle(inset).fill,rim:getComputedStyle(face).stroke,wallStroke:getComputedStyle(side).stroke,box:node.getAttribute('viewBox')};}));
   assert(painted.every(p=>p.side!==p.body&&p.rim!==p.side&&p.wallStroke==='none'&&p.box==='0 0 100 100'),game+' preserves a separate dark wall and top rim');
   if(game==='mage-brawl')for(const capacity of [1,2,3,4,5,6]){
    await page.evaluate(capacity=>{pawnReview.data.config.health=capacity;pawnReview.data.players.forEach(p=>p.health=capacity);renderPawns();},capacity);
    assert(await page.locator('.mage-token').evaluateAll(tokens=>tokens.every(token=>{
     const face=token.querySelector('.pawn-token-face'),m=face.getScreenCTM(),centre=new DOMPoint(+face.getAttribute('cx'),+face.getAttribute('cy')).matrixTransform(m);
     const radius=(+face.getAttribute('r')-parseFloat(getComputedStyle(face).strokeWidth)/2)*Math.hypot(m.a,m.b);
     return [...token.querySelectorAll('.mage-token-health circle')].every(dot=>{const d=dot.getScreenCTM(),point=new DOMPoint(+dot.getAttribute('cx'),+dot.getAttribute('cy')).matrixTransform(d),r=+dot.getAttribute('r')*Math.hypot(d.a,d.b);return Math.hypot(point.x-centre.x,point.y-centre.y)+r<=radius+.5;});
    })),'health dots stay inside the top face at capacity '+capacity);
   }
   if(game==='mage-brawl')assert(await page.locator('.mage-token:has(.mage-ultimate)').evaluateAll(tokens=>tokens.length>0&&tokens.every(token=>{
    const crown=token.querySelector('.mage-ultimate path').getBoundingClientRect();return [...token.querySelectorAll('.mage-token-health circle')].every(dot=>dot.getBoundingClientRect().top>=crown.bottom-.2);
   })),'health dots do not overlap the crown');
   if(game==='mage-brawl')await page.evaluate(()=>{pawnReview.data.config.health=4;pawnReview.data.players.forEach(p=>p.health=4);renderPawns();});
   assert(await page.locator('.table-shell').evaluate(e=>e.scrollWidth<=e.clientWidth+1),game+' fits viewport');
   await page.screenshot({path:path.join(out,`${game}-${theme}-${viewport.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  if(game==='ludo'){
   await page.evaluate(()=>{pawnReview.turn=0;Object.assign(pawnReview.data,{phase:'move',dice:[3,6],used:[false,false]});pawnReview.data.pawns[0]=[48,-1,-1,-1];pawnViewState={pawn:'0:0'};PlayroomAppearanceUI.runtime.service.select('light');renderPawns();});
   const edges=await page.locator('.ludo-target').evaluateAll(nodes=>nodes.map(n=>({kind:n.className,color:getComputedStyle(n).outlineColor})));
   assert(edges.some(e=>e.kind.includes('target-home'))&&edges.some(e=>e.kind.includes('target-move')),'colored and plain targets are visible together');
   assert.equal(new Set(edges.map(e=>e.color)).size,1,'colored cells use the same gold outline');
   await page.screenshot({path:path.join(out,'ludo-targets-light.png')});
  }
  if(game==='mage-brawl'){
   await page.evaluate(()=>{const d=pawnReview.data;d.players[0].pos=[2,1];d.board[2*d.size+1]='ground';d.board[d.size+1]='puddle';d.board[1]='forest';const card=d.players[0].hand.find(c=>c.element==='water');if(!card)throw Error('Water card required');pawnViewState={mageAction:'attack',mageCardId:card.id,mageDirection:0};renderPawns();});
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>{PlayroomAppearanceUI.runtime.service.select(theme);renderPawns();},theme);
    assert.equal(await page.locator('.mage-highlights .is-preview').count(),2,'water attack highlights both elemental tiles');
    assert.equal(await page.locator('.mage-highlights .is-attack-preview').count(),2);
    assert(await page.locator('.mage-highlights .is-attack-preview').evaluateAll(nodes=>nodes.every(n=>parseFloat(getComputedStyle(n).borderTopWidth)>=Math.max(3,Math.floor(n.getBoundingClientRect().width*.075)))),'attack borders are visibly thicker than ordinary preview rings');
    assert(await page.locator('.mage-cell.tile-puddle .mage-terrain>rect').evaluateAll(nodes=>nodes.every(n=>+n.getAttribute('rx')===0)),'elemental tiles have square corners');
    assert(await page.locator('.mage-grid').evaluate(grid=>{
     const cells=[...grid.querySelectorAll(':scope>.mage-cell')],rings=[...grid.querySelector('.mage-highlights').children];
     return rings.every((ring,index)=>{
      if(!ring.classList.contains('is-attack-preview'))return true;const box=ring.getBoundingClientRect(),width=parseFloat(getComputedStyle(ring).borderTopWidth);
      return [...cells[index].querySelectorAll('.mage-terrain-bonuses>g>rect')].every(badge=>{const b=badge.getBoundingClientRect();return b.left>=box.left+width-.1&&b.right<=box.right-width+.1&&b.bottom<=box.bottom-width+.1;});
     });
    }),'terrain badges remain inside the attack border');
    await page.screenshot({path:path.join(out,`mage-attack-tiles-${theme}.png`)});
   }
  }
 }
 assert.deepEqual(errors,[]);
 }finally{await context.close();await browser.close();await fixture.close();}
});
