/* Closed host-owned scene vocabulary: no pack HTML, script, styles or event handlers. */
(function(root){
 'use strict';
 function graphicValue(raw,prefix){if(typeof raw!=='string'||/[\\\u0000-\u001f\u007f@;{}:'"]/.test(raw)||/(?:javascript|https?|data|expression)\s*:/i.test(raw))return null;if(/url/i.test(raw)){const match=/^url\(#[A-Za-z_][\w.-]*\)$/i.exec(raw);return match?'url(#'+prefix+'-'+raw.slice(raw.indexOf('#')+1,-1)+')':null;}if(/[\/<>]/.test(raw))return null;return raw;}
 const commandKey=value=>root.PlayroomProtocol.canonical(value);
 const noResourceAssets=Object.freeze([]);
 const {SceneImages,indexResources}=root.PlayroomSceneImages;
 let stagedImages=null;
 const node=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;};
 function keyed(container,items,key,create,update){const old=new Map([...container.children].map(e=>[e.dataset.key,e]));items.forEach((item,index)=>{const id=String(key(item,index));let child=old.get(id);if(!child){child=create(item,index);child.dataset.key=id;}old.delete(id);update(child,item,index);if(container.children[index]!==child)container.insertBefore(child,container.children[index]||null);});for(const child of old.values())child.remove();}
 function setText(element,value){const next=String(value??'');if(element.textContent!==next)element.textContent=next;}
 function sameRouteData(a,b){
  if(a===b)return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  if(Array.isArray(a))return a.length===b.length&&a.every((value,index)=>sameRouteData(value,b[index]));
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&sameRouteData(a[key],b[key]));
 }
 function parseMarkup(host,markup){
  const template=host.ownerDocument.createElement('template');
  template.innerHTML=markup;
  return template.content;
 }
 class SceneRenderer{
  // The shell owns the container and its attributes; this renderer owns its
  // children until destroy(). The lease also preserves pieces during history
  // navigation, where the shell patches the same container with an empty port.
  constructor(container,{text=value=>String(value??''),command,preview,error,onTutorialProgress,onSelectionChanged,scheduler,planPlayer,externalActions,playAudio}){this.onSelectionChanged=onSelectionChanged;this.text=text;this.playAudio=playAudio;this.externalActions=externalActions;this.guidedElements=new Set();this.error=error||(()=>{});this.motionScheduler=scheduler||((root.PlayroomPresentationScheduler)?new root.PlayroomPresentationScheduler():null);this.motionPlayer=planPlayer||this.motionScheduler?.track('sdk-scene-motion');this.onTutorialProgress=onTutorialProgress;this.command=command;this.menuCommandHandler=event=>{const detail=event.detail;if(detail?.scene!==container||!container.isConnected||this.frame?.history?.reviewing)return;const key=commandKey(detail.command);if(!(this.sceneData?.menuActions||[]).some(action=>commandKey(action.command)===key)||!this.allowedCommands?.has(key))return;Promise.resolve().then(()=>this.command(detail.command)).catch(this.error);};root.addEventListener('playroom:scene-menu-command',this.menuCommandHandler);this.readonly=false;this.images=new SceneImages();this.root=container;this.releaseRootChildren=root.PlayroomDOM?.manageChildren(container);this.targetScope=container.closest('.table-shell')||container;this.nativeHands=new Map();container.classList.add('sdk-scene');this.keydownHandler=event=>{if(event.key==='Escape'&&(this.selectedSource||!this.choicePanel.hidden)){event.preventDefault();event.stopPropagation();this.clearSelection(true);}};this.targetScope.addEventListener('keydown',this.keydownHandler);this.choicePositionHandler=()=>this.positionChoices();for(const source of [root,root.visualViewport])for(const type of ['resize','scroll'])source?.addEventListener(type,this.choicePositionHandler,{passive:true});
   this.heading=node('div','sdk-scene-heading');this.prompt=node('p','sdk-prompt');this.clock=node('p','sdk-clock');this.clock.setAttribute('role','timer');this.heading.append(this.prompt,this.clock);container.append(this.heading);
   this.tutorialPanel=node('aside','sdk-tutorial');this.tutorialText=node('p');this.tutorialCount=node('span','sdk-tutorial-count');this.tutorialNext=node('button',null,'Далее');this.tutorialNext.type='button';this.tutorialNext.onclick=()=>this.advanceTutorial();this.tutorialPanel.append(this.tutorialText,this.tutorialCount,this.tutorialNext);this.tutorialPanel.hidden=true;this.canvasRoot=node('div','sdk-canvas-root');container.append(this.canvasRoot);this.ink=new root.PlayroomInkCanvas(this.canvasRoot,{commit:command,preview,error,onTutorialProgress,scheduler,planPlayer,externalActions});
   this.surface=node('div','sdk-semantic-surface');this.choicePanel=node('div','sdk-choice-panel');this.choicePanel.setAttribute('popover','manual');this.choicePanel.hidden=true;this.choicePanel.addEventListener('keydown',this.keydownHandler);container.append(this.surface,this.choicePanel);this.cancelControl=node('button','text-btn sdk-cancel-selection','Отменить выбор');this.cancelControl.type='button';this.cancelControl.hidden=true;this.cancelControl.onclick=()=>this.clearSelection(true);container.append(this.cancelControl);this.grid=node('div','sdk-board-grid');this.dice=node('div','sdk-dice');this.players=node('div','sdk-players');this.rows=node('table','sdk-rows');this.result=node('section','sdk-round-result');this.result.setAttribute('aria-label','Результат раунда');container.append(this.grid,this.dice,this.players,this.rows,this.result);
   this.chat=node('section','sdk-chat');this.chat.setAttribute('aria-label','Ответы');this.messages=node('ol','sdk-messages');this.messages.setAttribute('aria-live','polite');this.form=node('form','sdk-chat-form');this.input=node('input','sdk-chat-input');this.input.type='text';this.input.name='text';this.input.autocomplete='off';this.input.setAttribute('aria-label','Ваш вариант');this.send=node('button','sdk-primary');this.send.type='submit';this.send.innerHTML=root.PlayroomIcons.icon('send');this.send.append(document.createTextNode('Отправить'));this.form.append(this.input,this.send);this.chat.append(this.messages,this.form);container.append(this.chat);
   this.form.addEventListener('submit',async e=>{e.preventDefault();if(this.readonly||!this.chatCommand||!this.input.value.trim()||this.sending)return;const value=this.input.value;this.sending=true;this.send.disabled=true;try{const result=await this.command({...this.chatCommand,text:value});if(result!==false&&this.input.value===value)this.input.value='';}finally{this.sending=false;this.send.disabled=this.readonly||!this.chatCommand;}});
   this.gameMenu=node('details','sdk-game-menu');this.gameMenu.append(node('summary',null,'Меню партии'));this.gameMenuItems=node('div');this.gameMenu.append(this.gameMenuItems);container.append(this.gameMenu);this.gameMenu.hidden=true;
   this.notices=new Map();this.dismissedNotices=new Set();this.clockTimer=setInterval(()=>this.tick(),200);this.inputId='sdk-'+(++SceneRenderer.inputSequence);if(root.PlayroomInput)this.gestures=root.PlayroomInput.attach({scope:this.targetScope,dragVisual:element=>element._dragVisual||element,handSelector:'.sdk-hand-fan,.hand-track',canStart:element=>!this.readonly&&this.targetScope.contains(element)&&element.hasAttribute('data-sdk-target')&&!!element._target&&!element.disabled,canSelect:element=>!this.readonly&&this.targetScope.contains(element)&&element.hasAttribute('data-sdk-target')&&!element.disabled,canCommit:element=>!this.readonly&&this.targetScope.contains(element)&&element.hasAttribute('data-sdk-target')&&!element.disabled,getSelected:()=>this.selectedSource?this.inputId+':'+JSON.stringify(this.selectedSource):null,select:value=>{if(value===null){this.clearSelection();return;}if(!String(value).startsWith(this.inputId+':'))return;this.selectedSource=JSON.parse(value.slice(this.inputId.length+1));this.renderSemantic(this.sceneData,this.frame);this.applyPreviewMarkers();},commit:(command,meta)=>{if(meta.source?._sdkGestureTarget){const target=meta.source._target,choices=this.interactionRows(target,'source').filter(i=>this.allowedCommands.has(commandKey(i.command))).map(i=>i.command);if(!meta.source.dataset.dropPiece&&choices.length){this.selectedSource=target;this.showChoices(choices);}else this.activateTarget(target,meta.source,{playedFrom:meta.playedFrom});return;}if(this.allowedCommands.has(commandKey(command))){this.selectedSource=null;this.command(command);}}});
  }
  action(label,command){const b=node('button','sdk-action',this.text(label)||'Выбрать');b.type='button';b._command=command;b.onclick=()=>{if(!this.readonly&&b._command)this.command(b._command);};b.dataset.sdkCommand='true';return b;}
  // Build scene-local lookup tables once. A pile or zone can still match a
  // more specific target, and simultaneous matches keep their authored order.
  interactionRows(target,side){
   const rows=this.sceneData.interactions;
   if(!rows?.length||!target)return [];
   if(this.indexedInteractions!==rows){
    this.indexedInteractions=rows;this.interactionBuckets={source:new Map(),target:new Map()};
    for(const [order,row] of rows.entries())for(const key of ['source','target']){
     const t=row[key];if(!t)continue;
     const bucket=t.entity?'e:'+t.entity.namespace+':'+t.entity.id:t.cell!==undefined?'c:'+t.cell:t.index!==undefined?'i:'+t.index:t.point!==undefined?'p:'+JSON.stringify(t.point):'z:'+t.zone;
     const index=this.interactionBuckets[key];
     if(!index.has(bucket))index.set(bucket,[]);
     index.get(bucket).push({order,row});
    }
   }
   const keys=['z:'+target.zone];
   if(target.entity)keys.push('e:'+target.entity.namespace+':'+target.entity.id);
   if(target.cell!==undefined)keys.push('c:'+target.cell);
   if(target.index!==undefined)keys.push('i:'+target.index);
   if(target.point!==undefined)keys.push('p:'+JSON.stringify(target.point));
   const buckets=keys.map(key=>this.interactionBuckets[side].get(key)).filter(Boolean);
   const candidates=buckets.length<2?buckets[0]||[]:buckets.flat().sort((a,b)=>a.order-b.order);
   return candidates.filter(({row})=>this.sameTarget(row[side],target)).map(({row})=>row);
  }
  interactionsAt(target){const matches=this.interactionRows(target,'target').filter(item=>this.routeCommandVisible(item.command)),moves=this.selectedSource?matches.filter(item=>item.source&&this.sameTarget(item.source,this.selectedSource)):[];return moves.length?moves:matches.filter(item=>!item.source||!this.selectedSource&&!this.sceneData.anchoredLayout);}
  commandsAt(target){return this.interactionsAt(target).map(item=>item.command).filter(command=>this.allowedCommands.has(commandKey(command)));}
  sameTarget(a,b){if(!a||!b)return false;if(a.entity)return !!b.entity&&a.entity.namespace===b.entity.namespace&&String(a.entity.id)===String(b.entity.id);if(a.zone!==undefined&&a.zone!==b.zone)return false;if(a.cell!==undefined)return a.cell===b.cell;if(a.index!==undefined)return a.index===b.index;if(a.point!==undefined)return JSON.stringify(a.point)===JSON.stringify(b.point);if(a.zone!==undefined)return !b.entity&&b.cell===undefined&&b.index===undefined||(this.sceneData.zones||[]).some(z=>z.id===a.zone&&z.kind==='pile');return false;}
  localTarget(element,target,{deferGestures=false,requireSource=false}={}){element._target=target;element.dataset.sdkTarget='true';element.onclick=event=>{if(element._suppressClick){element._suppressClick=false;return;}if(!requireSource||this.selectedSource)this.activateTarget(target,element,{keyboard:event.detail===0});};const commands=requireSource&&!this.selectedSource?[]:this.commandsAt(target),sources=this.interactionRows(target,'source').length>0;element.disabled=this.readonly||!commands.length&&!sources;element.classList.toggle('is-available',!element.disabled);element.classList.toggle('is-selected',!!this.selectedSource&&this.sameTarget(this.selectedSource,target));element.setAttribute('aria-pressed',String(!!this.selectedSource&&this.sameTarget(this.selectedSource,target)));if(!deferGestures)this.bindGestureTarget(element,target);if(sources&&!this.gestures&&!element._sourceBound){element._sourceBound=true;element.addEventListener('pointerdown',e=>{if(this.readonly||e.button!==0)return;element.setPointerCapture(e.pointerId);this.dragStart={x:e.clientX,y:e.clientY,target:element._target,element};});element.addEventListener('pointercancel',()=>{this.dragStart=null;});element.addEventListener('pointerup',e=>{if(!this.dragStart)return;const start=this.dragStart;this.dragStart=null;const destination=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-sdk-target]');if(destination?._target&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>12){element._suppressClick=true;this.selectedSource=start.target;this.activateTarget(destination._target,destination);}});}}
  bindGestureTarget(element,target){if(!this.gestures)return;for(const key of ['dragPiece','swipeAction','dropPiece','action'])delete element.dataset[key];element._sdkGestureTarget=false;if(element.disabled)return;const sources=this.interactionRows(target,'source').filter(i=>this.allowedCommands.has(commandKey(i.command))),id=this.inputId+':'+JSON.stringify(target);if(sources.length){if(sources.every(source=>source.gestures?.drag!==false))element.dataset.dragPiece=id;if(element.closest('.sdk-hand-fan,.hand-track')&&sources.every(source=>source.gestures?.swipe!==false)){const commands=[...new Map(sources.map(i=>[commandKey(i.command),i.command])).values()];if(commands.length===1)element.dataset.swipeAction=commandKey(commands[0]);else{element.dataset.swipeAction=JSON.stringify({type:'@sdk/choose'});element._sdkGestureTarget=true;}}}if(this.selectedSource&&this.commandsAt(target).length){element.dataset.dropPiece=this.inputId+':'+JSON.stringify(this.selectedSource);element.dataset.action=JSON.stringify({type:'@sdk/choose'});element._sdkGestureTarget=true;}}
  activateTarget(target,element,{keyboard=false,playedFrom=null}={}){
   if(this.readonly)return;
   const matches=this.interactionsAt(target),sources=this.interactionRows(target,'source');
   // A color choice completes the card command. Open it on source activation
   // using the same authorized commands that would be offered after a drop.
   if(target.entity?.namespace==='card'&&this.sceneData.deck==='color-value'&&this.sceneData.tableLayout&&
     sources.length>1&&sources.every(({target,command})=>target?.zone==='field'&&!target.entity&&this.allowedCommands.has(commandKey(command)))){
    const commands=sources.map(({command})=>command);
    if(this.isColorChoiceGroup(commands)){
     this.selectedSource=target;this.renderSemantic(this.sceneData,this.frame);this.applyPreviewMarkers();
     this.showChoices(commands,{keyboard});return;
    }
   }
   const immediate=sources.length===1&&(sources[0].activation==='immediate'||sources[0].activation!=='select'&&this.frame.ui?.quickPlay)&&['card','tile'].includes(target.entity?.namespace);if(immediate){this.selectedSource=null;this.previewedCommand=null;this.command(sources[0].command);return;}const selects=sources.filter(i=>i.kind==='select');if(selects.length){this.selectedSource=target;this.renderSemantic(this.sceneData,this.frame);this.applyPreviewMarkers();this.showChoices(selects.map(i=>i.command),{keyboard});return;}if(sources.length&&!matches.length){this.selectedSource=target;this.choicePanel.hidden=true;this.renderSemantic(this.sceneData,this.frame);this.applyPreviewMarkers();if(keyboard){const scope=this.inventory?this.root:this.surface,targetElement=[...scope.querySelectorAll('[data-sdk-target]')].find(e=>!e.disabled&&this.commandsAt(e._target).length&&(!(this.inventory||this.sceneData.anchoredLayout)||this.interactionRows(e._target,'target').some(row=>this.sameTarget(row.source,target))));targetElement?.focus({preventScroll:true});}return;}const commands=matches.map(i=>i.command).filter(c=>this.allowedCommands.has(commandKey(c)));if(commands.length===1){const playedEntity=this.selectedSource?.entity;if(!this.sceneData.fleetLayout?.placements.some(p=>p.preserveSelection&&commandKey(p.command)===commandKey(commands[0])))this.selectedSource=null;const placement=playedFrom&&playedEntity&&(this.sceneData.inventoryLayout?.zones.includes(target.zone)||
     this.sceneData.anchoredLayout&&this.sceneData.zones.some(zone=>zone.id===target.zone&&zone.kind==='slots'));this.command(commands[0],placement?{playedFrom,playedEntity,playedTarget:target}:undefined);return;}if(commands.length){this.showChoices(commands,{keyboard});}else if(sources.length){this.selectedSource=target;this.renderSemantic(this.sceneData,this.frame);}}
  hideChoicePanel(){
   if(this.choicePanel.hidePopover&&this.choicePanel.matches(':popover-open'))this.choicePanel.hidePopover();
   this.choicePanel.hidden=true;
   if(this.choicePortal){this.choicePortal=false;this.root.append(this.choicePanel);}
  }
  positionChoices(){
   if(this.choicePanel.hidden)return;
   const origin=this.selectedSource&&[...this.targetScope.querySelectorAll('[data-sdk-target]')].find(e=>this.sameTarget(this.selectedSource,e._target)),anchor=(origin||this.root).getBoundingClientRect(),panel=this.choicePanel,view=root.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight;
   panel.style.left=Math.max(left+8,Math.min(left+width-panel.offsetWidth-8,anchor.left+anchor.width/2-panel.offsetWidth/2))+'px';
   panel.style.top=Math.max(top+8,Math.min(top+height-panel.offsetHeight-8,anchor.top-panel.offsetHeight-8))+'px';
  }
  openChoicePanel(){
   // A choice owns its floating surface, never a row in the board/hand grid.
   if(this.choicePanel.showPopover){if(!this.choicePanel.matches(':popover-open'))this.choicePanel.showPopover();}
   else{this.choicePortal=true;this.root.ownerDocument.body.append(this.choicePanel);}
   this.positionChoices();
  }
  isColorChoiceGroup(commands){
   const first=commands[0];
   return commands.length>1&&commands.every(command=>root.PlayroomUnoDeck?.colors[command.color]&&
    Object.keys(command).length===Object.keys(first).length&&
    Object.keys(command).every(key=>key==='color'||JSON.stringify(command[key])===JSON.stringify(first[key])));
  }
  showChoices(commands,{keyboard=false}={}){
   this.cancelControl.hidden=false;this.choiceCommands=commands;this.choicePanel.hidden=false;this.choicePanel.replaceChildren();this.choicePanel.setAttribute('aria-label','Варианты выбранного действия');
   const colorChoices=this.sceneData.deck==='color-value'&&this.isColorChoiceGroup(commands);
   this.choicePanel.dataset.choiceKind=colorChoices?'color':'action';
   if(colorChoices)this.choicePanel.setAttribute('aria-label',this.text(this.sceneData.commandParameters?.color?.label||'Выберите цвет'));
   if(commands.length<=4){
    for(const command of commands){
     const label=colorChoices?this.text(this.parameterLabel('color',command.color)||this.commandLabel(command)):this.commandLabel(command),b=this.action(label,command);b.classList.add('btn','secondary');
     // Preserve the native deck's swatch and compact label instead of a raw action row.
     if(colorChoices){b.classList.add('color-choice');b.style.setProperty('--choice',root.PlayroomUnoDeck.colors[command.color]);const swatch=node('i');swatch.setAttribute('aria-hidden','true');b.prepend(swatch);}
     b.onpointerenter=()=>this.previewCommand(command);b.onfocus=()=>this.previewCommand(command);this.choicePanel.append(b);
    }
    this.openChoicePanel();if(keyboard)this.choicePanel.querySelector('button')?.focus({preventScroll:true});return;
   }
   let candidate=commands[0];const fields=Object.keys(candidate).filter(key=>commands.some(command=>JSON.stringify(command[key])!==JSON.stringify(candidate[key]))&&commands.every(command=>['string','number','boolean'].includes(typeof command[key]))),groups=[];
   const accept=node('button','btn sdk-primary');accept.type='button';const paint=()=>{for(const group of groups)for(const {button,value}of group.buttons)button.setAttribute('aria-pressed',String(JSON.stringify(candidate[group.key])===value));setText(accept,this.commandLabel(candidate));this.previewCommand(candidate);};
   for(const key of fields){const schema=this.sceneData.commandParameters?.[key];if(!schema?.label)continue;const field=node('fieldset','game-choice-group'),legend=node('legend',null,this.text(schema.label)),options=node('div','game-choice-options'),buttons=[];field.append(legend,options);for(const value of [...new Set(commands.map(command=>JSON.stringify(command[key])))]){const decoded=JSON.parse(value),choice=(schema.values||schema.choices||[]).find(choice=>JSON.stringify(choice.value)===value);if(!choice?.label)continue;const button=node('button','game-choice-option');button.type='button';button.setAttribute('aria-label',this.text(choice.label));if(choice.art){const art=node('span','game-choice-art');if(choice.art.kind==='graphic')this.paintGraphic(art,choice.art);else this.asset(art,choice.art,this.text(choice.label));button.append(art);}button.append(node('span',null,this.text(choice.label)));button.onclick=()=>{const matching=commands.filter(command=>JSON.stringify(command[key])===value);candidate=matching.find(command=>fields.every(other=>other===key||JSON.stringify(command[other])===JSON.stringify(candidate[other])))||matching[0];paint();};options.append(button);buttons.push({button,value});}if(buttons.length){groups.push({key,buttons});this.choicePanel.append(field);}}
   if(groups.length!==fields.length){this.choicePanel.replaceChildren();for(const command of commands){const label=this.commandLabel(command);if(label!==command.type){const button=this.action(label,command);button.classList.add('btn','secondary');button.onpointerenter=()=>this.previewCommand(command);this.choicePanel.append(button);}}}else {accept.onclick=()=>{if(!this.readonly&&this.allowedCommands.has(commandKey(candidate))){this.hideChoicePanel();this.selectedSource=null;this.command(candidate);}};this.choicePanel.append(accept);paint();}
   this.openChoicePanel();if(keyboard)this.choicePanel.querySelector('button')?.focus({preventScroll:true});
  }

  previewCommand(command){this.previewedCommand=command;if(this.targetScope!==this.root)this.renderNativeHands(this.sceneData,this.frame);if(this.sceneData.arena)this.renderArena(this.sceneData);const key=commandKey(command),preview=(this.sceneData.arena?.previews||[]).find(p=>commandKey(p.command)===key),cells=new Set((preview?.cells||[]).map(point=>Array.isArray(point)?point[0]*this.sceneData.arena.size+point[1]:point));for(const element of this.surface.querySelectorAll('[data-cell]'))element.classList.toggle('is-preview',cells.has(Number(element.dataset.cell)));}
  clearSelection(returnFocus=false){
   const source=this.selectedSource,origin=returnFocus&&source?[...this.targetScope.querySelectorAll('[data-sdk-target]')].find(e=>this.sameTarget(source,e._target)):null;
   this.selectedSource=null;this.previewedCommand=null;this.choiceCommands=null;this.hideChoicePanel();this.cancelControl.hidden=true;
   this.renderSemantic(this.sceneData,this.frame);this.applyPreviewMarkers();
   for(const element of this.surface.querySelectorAll('.is-preview'))element.classList.remove('is-preview');
   if(returnFocus){
    origin?.focus({preventScroll:true});
    // Restoring focus can queue a fresh tooltip after Escape's capture handler.
    root.PlayroomTooltips?.hide();
   }
  }
  choiceSummary(command,fields){return fields.length&&fields.every(key=>this.sceneData.commandParameters?.[key])?fields.map(key=>this.text(this.parameterLabel(key,command[key])??command[key])).join(' · '):this.commandLabel(command);}
  commandLabel(command){
   const actions=this.frame.actions;
   if(!this.labelsByCommand||this.labeledActions!==actions){
    this.labeledActions=actions;this.labelsByCommand=new Map();
    for(const action of actions||[]){
     const key=commandKey(action.command);
     if(!this.labelsByCommand.has(key))this.labelsByCommand.set(key,action.label);
    }
   }
   return this.text(this.labelsByCommand.get(commandKey(command))||command.type);
  }
  graphicSource(ref){if(ref?.kind!=='graphic'||typeof ref.id!=='string')return null;const source=this.frame?.support?.catalog?.graphics||this.frame?.scene?.support?.catalog?.graphics||this.frame?.metadata?.catalog?.graphics||{};return Array.isArray(source)?source.find(item=>item.id===ref.id)?.graphic:source[ref.id]?.graphic||source[ref.id]||null;}
  paintGraphic(element,ref){const record=this.graphicSource(ref);if(!record){this.error?.({code:'SDK_GRAPHIC_UNAVAILABLE'});element.replaceChildren();return;}const signature=JSON.stringify([ref.id,record,this.resourceGeneration]);this.graphicBudget??={nodes:0};if(element._graphicSignature===signature){this.chargeGraphic(element._graphicCost||0);return;}const before=this.graphicBudget.nodes,graphic=this.graphic(record,undefined,false,0,this.graphicBudget);element.replaceChildren(graphic);element._graphicSignature=signature;element._graphicCost=this.graphicBudget.nodes-before;}
  chargeGraphic(cost){this.graphicBudget??={nodes:0};this.graphicBudget.nodes+=cost;if(this.graphicBudget.nodes>10000)throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});}
  resolvedSkin(family){try{return root.PlayroomAssetResolver?.resolve(family,{packId:this.frame?.projection?.game})?.variant;}catch{return null;}}
  cardBackSource(deck,assetSet){
   this.cardBackSources??=new Map();
   const key=JSON.stringify([deck,assetSet]);
   if(!this.cardBackSources.has(key)){
    this.cardBackSources.set(key,preferred=>{
     const preferredURL=preferred&&this.images.cardBackURL(preferred);
     if(preferredURL)return preferredURL;
     const variant=this.cardSkin||this.resolvedSkin('card-face');
     const fallback=assetSet||(deck==='color-value'?'uno-deck':['mini-split','mini-split-four-color'].includes(variant)?'mini-split-deck':'standard-deck');
     return (preferred!==fallback?this.images.cardBackURL(fallback):'')||this.images.cardBackURL();
    });
   }
   return this.cardBackSources.get(key);
  }
  cardBackMarkup(deck,assetSet){
   const G=root.PlayroomGameComponents,backUrlForSet=this.cardBackSource(deck,assetSet);
   const params={assetSet,sdkBack:true,deck,backUrlForSet,packId:this.frame?.projection?.game};
   const fallback=value=>G.cardBack({...value,backUrl:backUrlForSet()});
   return root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('card-back',params,fallback):fallback(params);
  }
  bindCardBack(artwork){
   if(artwork?.dataset.assetFamily!=='card-back')return;
   const params=artwork.dataset.assetParams;
   if(artwork._assetBackParams===params)return;
   const {sdkBack,deck,assetSet}=JSON.parse(params||'{}');
   artwork._assetBackParams=params;
   artwork._assetBackSource=sdkBack?this.cardBackSource(deck,assetSet):null;
  }
  cardMarkup(card,deck=card.deck||this.sceneData?.deck){const G=root.PlayroomGameComponents;if(!G)return null;if(deck==='domino'&&card.hidden)return G.dominoBackArt();if(deck==='color-value'){const renderer=root.PlayroomUnoDeck;if(!renderer)throw Object.assign(Error('SDK_COMPONENT_UNAVAILABLE'),{code:'SDK_COMPONENT_UNAVAILABLE'});if(card.hidden)return this.cardBackMarkup(deck);const print={...renderer.print(card),packId:this.frame?.projection?.game};return root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('card-face',print,params=>G.cardFace(params)):G.cardFace(print);}if(card.hidden)return this.cardBackMarkup(deck,card.assetSet);if(card.character){const files=G.characterAssetFiles(this.resourceIndex?.images,card.character),characterSources=files?{minimal:this.imageAsset(files.minimal)?.url,simple:files.simple?this.imageAsset(files.simple)?.url:undefined}:{},params={character:card.character,characterSources,packId:this.frame?.projection?.game};if(characterSources.minimal||characterSources.simple){if(['minimal','simple'].includes(this.cardSkin))return G.characterFace(params,{variant:this.cardSkin});return root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('character-face',params,p=>G.characterFace(p)):G.characterFace(params);}}if(Number.isInteger(card.a)&&Number.isInteger(card.b))return G.dominoFace(card.a,card.b,card.rotation??(card.a===card.b?0:270));const rank=card.rankLabel!==undefined?this.text(card.rankLabel):card.joker?(root.PlayroomMessages?.text('ui.game-components.2f0a8ec85914')||'Joker'):card.rank!==undefined?({14:'Т',13:'К',12:'Д',11:'В'}[card.rank]||card.rank):card.value??card.name??card.element??'',suit=card.suit||'';if(!card.faceVariant&&this.cardSkin==='mini-split'&&root.PlayroomMiniSplitDeck&&card.rank!==undefined)return G.cardFrame(root.PlayroomMiniSplitDeck.face({rank,suit,crown:!!card.crown}));if((card.faceVariant||this.cardSkin!=='standard')&&root.TabletopUI?.helpers?.assetArt&&card.rank!==undefined)return root.TabletopUI.helpers.assetArt('card-face',{rank,suit,crown:!!card.crown,...(card.faceVariant?{faceVariant:card.faceVariant}:{}),packId:this.frame?.projection?.game},params=>G.cardFace(params));return G.cardFace({rank,crown:!!card.crown,suit:card.value!==undefined?String(card.value):card.element!==undefined?String(card.element):suit});}
  cardSlotMarkup(params){const G=root.PlayroomGameComponents,H=root.TabletopUI?.helpers;if(H?.components?.cardSlot)return H.components.cardSlot(params);this.slotHelpers??=G.createHelpers({esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),assetArt:(_id,value,fallback)=>fallback(value)},()=> '');return this.slotHelpers.cardSlot(params);}
  paintCard(element,card,label){
   card=card||{hidden:true};
   const deck=card.deck||this.sceneData?.deck,skin=this.cardSkin;
   const variant=skin||this.resolvedSkin(card.hidden?'card-back':card.assetFamily||(card.character?'character-face':'card-face'));
   const faceSkin=card.hidden?this.resolvedSkin('card-face'):null,generation=this.resourceGeneration;
   const skinAsset=card.assetVariants?.[variant],ref=skinAsset||card.asset||card.art;
   // Frames can share a published descriptor. Mutable Studio input still
   // needs a fresh signature, even if a caller kept the same object.
   const cache=root.PlayroomProtocol.ownsImmutable(card)?(this.cardPrintSignatures??=new WeakMap()):null;
   const prior=cache?.get(card);
   let signature=prior?.signature;
   if(!prior||prior.deck!==deck||prior.skin!==skin||prior.variant!==variant||prior.faceSkin!==faceSkin||prior.generation!==generation){
    signature=JSON.stringify([skinAsset?{...card,asset:skinAsset}:card,deck,skin,variant,faceSkin,generation]);
    cache?.set(card,{deck,skin,variant,faceSkin,generation,signature});
   }
   if(element._cardSignature!==signature){
    element._cardSignature=signature;
    if(ref?.kind==='graphic'){
     const graphic=this.graphicSource(ref);
     element.dataset.cardShape=graphic?.component==='card-frame'?(graphic.value?.shape||'portrait'):'portrait';
     this.paintGraphic(element,ref);
    }else if(ref?.kind==='asset')this.asset(element,ref,label);
    else{
     const markup=card.empty?this.cardSlotMarkup({label,kind:'stock',tag:'span',attrs:''}):this.cardMarkup(card,deck);
     if(markup){element.innerHTML=markup;this.bindCardBack(element.firstElementChild);}
     else setText(element,card.hidden?'?':label);
    }
   }else if(ref?.kind==='graphic')this.chargeGraphic(element._graphicCost||0);
   element.classList.add('sdk-piece-card');
   element.dataset.cardDeck=deck||'standard';
   if(deck==='color-value')element.style.setProperty('--card-color',root.PlayroomUnoDeck?.colors[card.color]||root.PlayroomUnoDeck?.colors.wild);
   else element.style.removeProperty('--card-color');
   element.classList.toggle('is-hidden',!!card.hidden);
   element.classList.toggle('is-red',card.color==='red'||card.suit==='♥'||card.suit==='♦');
   if(card.color&&/^(red|green|blue|yellow|wild|black)$/.test(card.color))element.dataset.cardColor=card.color;
   else delete element.dataset.cardColor;
   if(card.element&&/^(air|earth|water|fire)$/.test(card.element))element.dataset.cardElement=card.element;
   element.setAttribute('aria-label',label||(card.hidden?'Закрытая карта':String(card.rank??card.value??card.element??card.id??'Карта')));
  }
  parameterLabel(key,value){const schema=this.sceneData.commandParameters?.[key];return (schema?.values||schema?.choices||[]).find(choice=>choice.value===value)?.label;}
  arrangePlayers(scene,frame){const players=scene.players||[];if(!players.some(p=>Array.isArray(p.hand)))return players;let order=scene.seatOrder||scene.turnOrder||players.map(p=>p.player);if(!Array.isArray(order)||order.length!==players.length||new Set(order).size!==players.length||order.some(id=>!players.some(p=>p.player===id)))order=players.map(p=>p.player);const viewer=frame.projection.viewer,pivot=order.indexOf(viewer),ids=pivot<0?order:[...order.slice(pivot+1),...order.slice(0,pivot),viewer];return ids.map(id=>players.find(p=>p.player===id));}
  syncSelectionScope(frame){
   const scope=JSON.stringify([frame.projection.game,frame.pack?.hash,frame.sessionId,frame.projection.viewer,!!frame.history?.reviewing]);
   if(scope===this.selectionScope)return;
   this.selectionScope=scope;this.selectedSource=null;this.previewedCommand=null;this.choiceCommands=null;this.hideChoicePanel();root.PlayroomTooltips?.hide();
  }
  paintNativeTurnPreview(next,preview=null){
   if(this.targetScope===this.root||!this.targetScope.contains(this.root)||!this.nativePreviewPainted&&!this.sceneData?.nextPlayerByCard&&!this.sceneData?.turnPreviewByCard)return;
   const baseNext=this.frame?.projection.status==='playing'?this.sceneData?.nextPlayer:null;
   if(next===undefined)next=baseNext;
   this.nativePreviewPainted=preview!==null||next!==baseNext;
   // Paint the shell's existing player panels, leaving their identity, hands
   // and layout untouched. The next player is the normal highlight on cancel.
   for(const panel of this.targetScope.querySelectorAll('.player-panel[data-player-index]')){
    const player=Number(panel.dataset.playerIndex),upcoming=player===next;
    const tone=preview?.affected.includes(player)?'negative':preview?.nextPlayer===player?'positive':null;
    panel.classList.toggle('is-next',upcoming);
    panel.classList.toggle('is-turn-preview-positive',tone==='positive');
    panel.classList.toggle('is-turn-preview-negative',tone==='negative');
    if(upcoming)panel.dataset.nextTurn='true';else delete panel.dataset.nextTurn;
    if(tone)panel.dataset.turnPreview=tone;else delete panel.dataset.turnPreview;
   }
  }
  selectedEntityId(){return this.readonly?null:this.selectedSource?.entity?.id??null;}
  // Component toggles (for example held dice) own pressed state independently
  // of the source/destination selection painted by this pass.
  applyPreviewMarkers(refreshGuide=true){
   const scene=this.sceneData,source=this.selectedSource?.entity;
   const card=!this.readonly&&!Number.isInteger(this.frame.ui?.presentationTurn)&&source?.namespace==='card'?source.id:null;
   const preview=card&&Object.hasOwn(scene.turnPreviewByCard||{},card)?scene.turnPreviewByCard[card]:null;
   const next=card&&Object.hasOwn(scene.nextPlayerByCard||{},card)?scene.nextPlayerByCard[card]:undefined;
   this.paintNativeTurnPreview(next,preview);
   for(const panel of this.players.children){const owner=Number(panel.dataset.owner),affected=!!preview?.affected.includes(owner);panel.classList.toggle('is-next',owner===next);panel.classList.toggle('is-preview-affected',affected);const marker=panel.querySelector('.sdk-turn-marker');if(marker){marker.hidden=!affected&&owner!==next;marker.dataset.previewKind=affected?String(preview.kind):'next';setText(marker,affected?this.text(preview.label||({skip:'Пропуск хода',reverse:'Смена направления','+2':'Добор +2','+4':'Добор +4'}[preview.kind]||'Действие карты')):'Следующий ход');}}
   for(const element of this.targetScope.querySelectorAll('[data-sdk-target]')){
    const selected=!!this.selectedSource&&this.sameTarget(this.selectedSource,element._target);
    const pressed=element.dataset.sdkPressed??String(selected);
    element.classList.toggle('is-selected',selected||pressed==='true');
    if(element.getAttribute('aria-pressed')!==pressed)element.setAttribute('aria-pressed',pressed);
   }
   this.renderPlayerChoices();
   if(refreshGuide)this.refreshTutorialSelection();
  }
  refreshTutorialSelection(){
   // Hosted lessons read the renderer's current selection. Studio can
   // instead rebind its existing tutorial directly to the mounted controls.
   if(!this.onSelectionChanged?.()&&this.tutorialData)this.renderTutorial(this.tutorialData);
  }
  playerChoiceActions(){
   const spec=this.sceneData?.playerChoices;
   if(this.readonly||!spec)return [];
   const cached=this.playerChoiceRows;
   if(cached?.spec===spec)return cached.rows;
   // Reuse the frame's prepared UI rows. The wire command remains the
   // authorized record from the scene, separate from picker metadata.
   const rows=[];
   for(const {command,player,source,index,label} of spec.choices){
    if(!this.allowedCommands.has(commandKey(command)))continue;
    rows.push({target:player,targetKind:'player',targetSource:!!source,card:source?.id,
     targetChoice:spec.kind==='cards'?'card':undefined,targetCardShape:spec.cardShape,cardIndex:index,label:this.text(label),
     disabled:command.disabled,targetPrompt:command.targetPrompt,_sdkCommand:command});
   }
   this.playerChoiceRows={spec,rows};
   return rows;
  }
  releasePlayerChoice(port,entry){port.removeEventListener('click',entry.tap,true);port.removeEventListener('keydown',entry.tap,true);delete port.dataset.sdkPlayerChoice;if(entry.addedTarget)delete entry.trigger.dataset.playerTarget;if(entry.addedRole){entry.trigger.removeAttribute('role');entry.trigger.removeAttribute('tabindex');}if(entry.sdkTarget){for(const key of ['sdkTarget','dropPiece','action'])delete entry.trigger.dataset[key];entry.trigger._target=null;}}
  renderPlayerChoices(){
   const spec=this.sceneData?.playerChoices;this.playerChoicePorts??=new Map();if(!spec||!root.PlayroomPlayerTarget){for(const [p,e]of this.playerChoicePorts)this.releasePlayerChoice(p,e);this.playerChoicePorts.clear();this.playerChoiceController?.cancel();return;}
   this.playerChoiceController??=new root.PlayroomPlayerTarget({root:()=>this.targetScope,selected:()=>this.selectedSource?.entity?.id??null,actions:()=>this.playerChoiceActions(),commit:a=>{if(!this.readonly&&this.allowedCommands.has(commandKey(a._sdkCommand))){this.selectedSource=null;this.command(a._sdkCommand);}}});
   const identity=JSON.stringify([this.frame.projection.game,this.frame.projection.viewer,this.frame.projection.revision,this.readonly,this.selectedSource]);if(identity!==this.playerChoiceIdentity){this.playerChoiceIdentity=identity;this.playerChoiceController.cancel();}
   const panels=[...this.targetScope.querySelectorAll('.player-panel[data-player-index],.sdk-player[data-owner],[data-sdk-player-choice-trigger][data-player-target]')],wanted=new Set(panels.filter(panel=>spec.choices.some(c=>c.player===Number(panel.dataset.playerIndex??panel.dataset.owner??panel.dataset.playerTarget))));
   for(const [p,e]of this.playerChoicePorts)if(!wanted.has(p)){this.releasePlayerChoice(p,e);this.playerChoicePorts.delete(p);}
   for(const panel of panels){const player=Number(panel.dataset.playerIndex??panel.dataset.owner??panel.dataset.playerTarget),choices=spec.choices.filter(c=>c.player===player);if(!choices.length)continue;const trigger=panel.hasAttribute('data-sdk-player-choice-trigger')?panel:panel.querySelector('.player-info,h3')||panel;let entry=this.playerChoicePorts.get(panel);if(entry&&entry.trigger!==trigger){this.releasePlayerChoice(panel,entry);this.playerChoicePorts.delete(panel);entry=null;}
    if(!entry){const tap=event=>{if(event.defaultPrevented||event.type==='keydown'&&!['Enter',' '].includes(event.key))return;const endpoint=event.target.closest?.('[data-sdk-target]');if(endpoint&&endpoint!==trigger&&endpoint._target?.zone?.startsWith('hand-'))return;event.preventDefault();event.stopImmediatePropagation();if(this.readonly)return;
     const picker=this.playerChoiceController,previous=picker.menu;
     picker.tap(player);
     // The native dialog lives outside the scene scope. Bind its lesson once
     // it exists so the host guide can move into the dialog's top layer.
     if(picker.menu?.open&&picker.menu!==previous&&this.tutorialData)this.renderTutorial(this.tutorialData);};entry={trigger,tap,addedTarget:!trigger.hasAttribute('data-player-target'),addedRole:trigger.tagName!=='BUTTON'&&!trigger.hasAttribute('role'),sdkTarget:spec.kind==='request'};panel.addEventListener('click',tap,true);panel.addEventListener('keydown',tap,true);this.playerChoicePorts.set(panel,entry);}
    panel.dataset.sdkPlayerChoice=String(player);trigger.dataset.playerTarget=String(player);if(entry.addedRole){trigger.setAttribute('role','button');trigger.tabIndex=0;}if(spec.kind==='request')this.localTarget(trigger,{zone:'player-'+player});else trigger.disabled=this.readonly||!choices.length;trigger.toggleAttribute('disabled',!!trigger.disabled);trigger.setAttribute('aria-disabled',String(!!trigger.disabled));trigger.setAttribute('aria-haspopup',spec.kind==='cards'?'dialog':'menu');trigger.setAttribute('aria-expanded',String(this.playerChoiceController.active===player));
   }
  }
  releaseNativeHand(entry){entry.release?.();if(entry.mode!=='mounted'){entry.hand.remove();entry.books.remove();}}
  renderNativeHands(scene,frame){
   if(scene.arenaLayout){this.players.hidden=true;return true;}
   if(this.targetScope===this.root)return false;
   const ports=[...this.targetScope.querySelectorAll('[data-sdk-hand-owner]')],wanted=new Set(ports);
   for(const [port,entry]of this.nativeHands)if(!wanted.has(port)){this.releaseNativeHand(entry);this.nativeHands.delete(port);}
   for(const port of ports){
    const owner=Number(port.dataset.sdkHandOwner),player=scene.players.find(player=>player.player===owner);if(!player)continue;
    let entry=this.nativeHands.get(port);
    const cards=(player.hand||[]).map(card=>{const action=card.id!==undefined&&this.previewedCommand?.cardId===card.id?this.previewedCommand?.action:null;return card.artVariants?.[action]?{...card,art:card.artVariants[action]}:card;});
    if(port.dataset.sdkNativeHand){
     if(!entry){entry={mode:'mounted',release:root.PlayroomDOM?.manageChildren(port)};this.nativeHands.set(port,entry);}
     this.renderMountedHand(port,cards,'hand-'+owner,owner,port.dataset.sdkNativeHand==='mini');
    }else{
     if(!entry){entry={hand:node('div','sdk-hand sdk-native-hand'),books:node('div','sdk-books sdk-native-hand'),release:root.PlayroomDOM?.manageChildren(port)};port.append(entry.hand,entry.books);this.nativeHands.set(port,entry);}
     const books=port.dataset.sdkHandZone==='books';this.renderHand(entry.hand,books?player.bookCards||[]:cards,books?'books-'+owner:'hand-'+owner,owner);this.renderHand(entry.books,books?[]:player.bookCards||[],'books-'+owner,owner);entry.books.hidden=books||!player.bookCards?.length;
    }
   }
   const controls=(scene.playerChoices?.kind==='cards'&&scene.actionReserve===false||scene.checkerLayout?.kind==='draughts')?this.root:this.targetScope.querySelector('[data-sdk-choice-port]')||ports.find(port=>Number(port.dataset.sdkHandOwner)===frame.projection.viewer)||this.root;
   if(this.controlPort!==controls){this.releaseControlPort?.();this.controlPort=controls;this.releaseControlPort=controls.hasAttribute('data-sdk-choice-port')?root.PlayroomDOM?.manageChildren(controls):null;}
   for(const control of [this.choicePanel,this.cancelControl])if(!(control===this.choicePanel&&this.choicePortal)&&control.parentElement!==controls)controls.append(control);
   return true;
  }
  paintHandCard(e,c,index,zone,owner){
   if(this.sceneData.deck==='domino'||Number.isInteger(c.a)&&Number.isInteger(c.b)){c={...c,rotation:0};e.dataset.pieceRatio=String(4/7);e.classList.add('domino-tile');}
   e.classList.toggle('sdk-trick-hand-card',this.sceneData.tableLayout?.kind==='paired-tricks');
   this.paintCard(e,c,this.text(c.label??this.parameterLabel('element',c.element)??(!c.hidden?((c.rank??c.value??c.element??'')+' '+(c.suit||'')):'Закрытая карта')));
   if(c.help)e.dataset.tooltip=this.text(c.help);else delete e.dataset.tooltip;
   e.style.setProperty('--card-index',index);
   const ref=!c.hidden&&c.id!==undefined?{namespace:Number.isInteger(c.a)?'tile':'card',id:String(c.id)}:null;
   this.localTarget(e,ref?{entity:ref,zone,index}:{zone,index},{deferGestures:true});
   if(owner!==this.frame.projection.viewer&&this.targetScope!==this.root&&this.sceneData.playerChoices?.kind==='cards'){e.disabled=true;e.classList.remove('is-available');}
   e.classList.toggle('is-playable',!e.disabled);
   if(this.sceneData.handInspection&&owner===this.frame.projection.viewer&&!this.readonly&&!c.hidden){e.disabled=false;e.dataset.handPreview=String(c.id);}else delete e.dataset.handPreview;

   if(ref)e.dataset.entity=ref.namespace+'-'+ref.id;else delete e.dataset.entity;
  }
  renderMountedHand(container,cards,zone,owner,mini){
   container.classList.add('sdk-native-hand');container.style.setProperty('--hand-count',Math.max(1,cards.length));
   if(container.classList.contains('hand-overlap-row'))container.style.gridTemplateColumns=root.PlayroomGameComponents.handLayout(cards.map((card,i)=>({id:String(i),html:'',selected:this.selectedSource?.entity?.id===String(card.id)}))).columns;
   keyed(container,cards,(c,i)=>!c.hidden&&c.id!==undefined?String(c.id):'slot-'+i,c=>{
    const e=node('button','sdk-piece-card art-card'+(mini?'':' hand-card'));e.type='button';
    if(!mini||c.hidden)return e;const wrapper=node('span','public-card');wrapper.append(e);return wrapper;
   },(item,c,index)=>{const e=item.matches('button')?item:item.firstChild;if(item!==e)item.dataset.publicCardIndex=String(index);e.classList.toggle('shared-card-back',!!c.hidden);e.dataset.sizeRole='card';this.paintHandCard(e,c,index,zone,owner);});
   // Keyed cards are painted before their first insertion. Their actual hand
   // ancestor must exist before drag/swipe permissions are bound.
   for(const e of container.querySelectorAll('[data-sdk-target]'))this.bindGestureTarget(e,e._target);
  }
  renderHand(container,cards,zone,owner){container.classList.add('sdk-hand-fan');container.style.setProperty('--hand-count',Math.max(1,cards.length));container.classList.toggle('is-own-hand',owner===this.frame.projection.viewer);keyed(container,cards,(c,i)=>!c.hidden&&c.id!==undefined?String(c.id):'slot-'+i,()=>{const e=node('button','sdk-piece-card');e.type='button';return e;},(e,c,index)=>this.paintHandCard(e,c,index,zone,owner));for(const e of container.querySelectorAll('[data-sdk-target]'))this.bindGestureTarget(e,e._target);}
  renderSemantic(scene,frame){
   if(!scene.anchoredLayout)this.anchoredPieces?.clear();
   if(!scene.arenaLayout&&this.arenaHand){this.arenaHand.remove();this.arenaHand=null;this.releaseArenaHand?.();this.releaseArenaHand=null;this.arenaHandTree=null;this.arenaFieldTemplate=null;this.arenaViewState=null;for(const release of this.arenaPlayerLeases?.values()||[])release();this.arenaPlayerLeases?.clear();this.arenaPlayerTrees?.clear();}
   if(!scene.solitaireLayout&&this.solitaireControls){this.solitaireControls.remove();this.solitaireControls=null;for(const release of this.solitaireHomeLeases?.values()||[])release();this.solitaireHomeLeases?.clear();this.releaseSolitaireControlPort?.();this.releaseSolitaireControlPort=null;this.solitaireControlPort=null;this.solitaireFieldTree=null;this.solitaireControlTree=null;this.solitaireStatusTree=null;}
   if(!scene.fleetLayout&&this.fleetControls){for(const e of this.fleetIndicatorNodes||[])this.releaseFleetIndicator(e);this.fleetIndicatorNodes?.clear();this.fleetControls.remove();this.fleetControls=null;this.releaseFleetControlPort?.();this.releaseFleetControlPort=null;this.fleetControlPort=null;}
   this.sceneData=scene;this.prepareNumberedSelection(scene,frame);this.renderDice(scene);this.renderInventory(scene);this.surface.hidden=true;this.cancelControl.hidden=this.targetScope!==this.root||!this.selectedSource&&this.choicePanel.hidden;const family=scene.family;this.root.dataset.sceneFamily=family;this.root.classList.toggle('sdk-fill-field',scene.tableLayout?.kind==='collected-sets');
   if(scene.anchoredLayout){this.renderAnchoredBoard(scene);return;}
   if(family==='score-table'&&scene.scoreLayout){this.renderScoreSheet(scene,frame);return;}if(family==='solitaire'){this.renderSolitaire(scene);return;}if(family==='tile-chain'){this.renderTileChain(scene);return;}if(family==='card-table'){this.renderCardTable(scene);return;}if(family==='memory-cards'){this.renderMemory(scene);return;}if(scene.fleets){this.renderFleets(scene);return;}if(scene.pieces&&Number.isInteger(scene.columns)){this.renderCheckerBoard(scene);return;}if(family==='route-board'){if(scene.routeStyle==='cross-and-circle')this.renderCrossRoute(scene);else if(scene.routeStyle==='numbered-serpentine')this.renderNumberedRoute(scene);else this.renderRoute(scene);return;}if(scene.arena){this.renderArena(this.publicState&&this.playedPlan===scene.plan?.id?{...scene,arena:{...scene.arena,...this.publicState}}:scene);return;}this.surface.replaceChildren();}
  surfaceMode(mode){this.surface.hidden=false;if(this.surface.dataset.mode!==mode){this.surface.dataset.mode=mode;this.surface.className='sdk-semantic-surface'+(this.flipped?' is-flipped':'');this.surface.replaceChildren();}return this.surface;}
  paintBoardObjectArt(element,visual){
   const signature=visual.kind==='tile'?visual.a+':'+visual.b:visual.value;
   if(element._visual===signature)return;
   element._visual=signature;
   element.innerHTML=visual.kind==='tile'?root.PlayroomGameComponents.dominoFace(visual.a,visual.b,270):
    root.PlayroomComponents.roundTokenArt({value:visual.value,profile:'pawn'});
  }
  paintInventoryFace(element,visual){
   const description=this.text(visual.label);
   if(element.dataset.kind!==visual.kind){
    element.dataset.kind=visual.kind;
    element.classList.remove('sdk-piece-card','is-red');
    delete element.dataset.cardDeck;
    element._cardSignature=null;element._visual=null;
   }
   if(visual.kind==='card')this.paintCard(element,{deck:'standard',rank:visual.rank,suit:visual.suit},description);
   else{this.paintBoardObjectArt(element,visual);element.setAttribute('aria-label',description);}
  }
  renderInventory(scene){
   const layout=scene.inventoryLayout;
   if(!layout){this.inventory?.remove();this.inventory=null;this.inventoryNodes?.clear();return;}
   if(!this.inventory){
    this.inventory=node('div','sdk-inventory');
    this.inventory.append(node('div','sdk-inventory-trays'),node('div','sdk-inventory-overviews'));
    this.surface.after(this.inventory);
   }
   const byZone=new Map(scene.zones.filter(zone=>zone.kind==='inventory').map(zone=>[zone.id,{zone,objects:[]}]));
   const nodes=this.inventoryNodes??=new Map(),retained=new Set();
   // Missing objects leave the advertised count visible. The host never
   // reconstructs the composition or manufactures IDs for concealed items.
   const key=root.PlayroomGameComponents.entityKey,shown=layout.overviews?.length?new Map():null;
   for(const object of scene.objects){
    const entry=byZone.get(object.zone);if(!entry)continue;
    entry.objects.push(object);shown?.set(key(object.ref),object.visual);
   }
   const item=({ref})=>{
    const id=key(ref);
    if(!nodes.has(id)){const button=node('button','sdk-inventory-item');button.type='button';nodes.set(id,button);}
    return nodes.get(id);
   };
   const paint=(button,{ref,visual})=>{
    const id=key(ref);
    retained.add(id);
    button.dataset.entity=id;
    this.paintInventoryFace(button,visual);
    this.localTarget(button,{entity:ref});
   };
   keyed(this.inventory.firstChild,layout.zones,id=>id,()=>{
    const tray=node('section','sdk-inventory-tray');
    tray.append(node('h3','sdk-inventory-heading'),node('div','sdk-inventory-items'));return tray;
   },(tray,id)=>{
    const {zone,objects}=byZone.get(id),title=tray.firstChild,items=tray.lastChild,label=this.text(zone.label);
    tray.dataset.sceneZone=id;
    tray.setAttribute('aria-label',label);
    setText(title,label+' · '+zone.count);
    const {viewer,audience}=this.frame.projection;
    if(zone.slots&&(zone.visibility==='public'||audience!=='public'&&zone.owner===viewer)){
     const occupants=new Map(objects.map(object=>[object.index,object]));
     keyed(items,zone.slots,(_,index)=>'slot:'+index,()=>{
      const slot=node('div','sdk-inventory-slot'),target=node('button','sdk-inventory-slot-target');
      target.type='button';slot.append(target);return slot;
     },(slot,caption,index)=>{
      const object=occupants.get(index),target=slot.firstChild;
      setText(target,String(index+1));target.setAttribute('aria-label',this.text(caption));
      // A drop points to a vacancy. A filled slot keeps the same footprint
      // and gives the action and motion identity to its item alone.
      this.localTarget(target,{zone:id,index},{requireSource:true});
      target.hidden=!!object;
      const button=object?item(object):null;
      if(slot.children[1]&&slot.children[1]!==button)slot.children[1].remove();
      if(button){paint(button,object);if(button.parentElement!==slot)slot.append(button);}
     });
    }else{
     objects.sort((a,b)=>a.index-b.index);
     // A visible transfer changes the parent and keeps the same entity node.
     keyed(items,objects,object=>key(object.ref),item,paint);
    }
   });
   for(const id of nodes.keys())if(!retained.has(id))nodes.delete(id);
   this.renderInventoryOverviews(this.inventory.lastChild,layout.overviews||[],shown);
  }
  renderInventoryOverviews(container,overviews,shown){
   // Presentation IDs key secondary DOM only. The primary component owns
   // data-entity, command bindings, gesture targets and motion capture.
   const key=root.PlayroomGameComponents.entityKey;
   keyed(container,overviews,panel=>panel.id,()=>{
    const panel=node('section','sdk-inventory-tray');
    panel.append(node('h3','sdk-inventory-heading'),node('div','sdk-inventory-items'));
    return panel;
   },(panel,{id,label,views})=>{
    const title=this.text(label);
    panel.dataset.inventoryOverview=id;
    panel.hidden=!views.length;
    panel.setAttribute('aria-label',title);
    setText(panel.firstChild,title);
    keyed(panel.lastChild,views,view=>view.id,()=>node('span','sdk-inventory-view'),(element,view)=>{
     const visual=shown.get(key(view.ref));
     element.dataset.inventoryView=view.id;
     element.dataset.viewRole=view.role;
     if(view.role==='detail'){
      element.setAttribute('role','img');
      this.paintInventoryFace(element,visual);
     }else{
      element.removeAttribute('role');
      element.removeAttribute('aria-label');
      element.classList.remove('sdk-piece-card','is-red');
      delete element.dataset.kind;delete element.dataset.cardDeck;
      setText(element,this.text(visual.label));
     }
    });
   });
  }
  renderAnchoredBoard(scene){
   const surface=this.surfaceMode('anchored-board'),{field,label}=scene.anchoredLayout,{columns,rows}=scene.geometry;
   const entityKey=root.PlayroomGameComponents.entityKey;
   let grid=surface.firstElementChild;
   if(!grid){grid=node('div','sdk-anchored-board');grid.setAttribute('role','group');surface.append(grid);}
   grid.setAttribute('aria-label',this.text(label));grid.style.setProperty('--anchored-columns',columns);
   const pieces=this.anchoredPieces??=new Map(),previous=new Set(pieces.keys());
   const fieldObjects=new Map(),slots=new Map(),byAnchor=new Map();
   for(const zone of scene.zones)if(zone.anchor){byAnchor.set(entityKey(zone.anchor),zone);slots.set(zone.id,new Map());}
   for(const object of scene.objects){if(object.zone===field)fieldObjects.set(object.cell,object);else slots.get(object.zone).set(object.index,object);}
   // A rack lives inside its carrier so the ordinary motion clone carries
   // the visible occupants with it. Their logical IDs remain independent.
   const piece=(object,attached)=>{
    const id=entityKey(object.ref);previous.delete(id);
    let e=pieces.get(id);
    if(!e){
     e=node('span','sdk-anchored-piece');
     const pose=node('span','sdk-anchored-pose'),art=node('span','sdk-anchored-art');
     art.setAttribute('role','img');pose.append(art,node('span','sdk-anchored-slots'));e.append(pose);
     e.dataset.entity=id;pieces.set(id,e);
    }
    const {visual,orientation}=object,pose=e.firstChild,art=pose.firstChild,description=this.text(visual.label);
    // Keep the measured carrier box stable. The artwork and all local slots
    // share the inner pivot, including while the carrier is in flight.
    pose.toggleAttribute('data-motion-pivot',!attached);
    pose.style.rotate=orientation===undefined?'':orientation*90+'deg';
    e.toggleAttribute('data-motion-attached',attached);
    if(art._label!==description){art._label=description;art.setAttribute('aria-label',description);}
    this.paintBoardObjectArt(art,visual);
    return e;
   };
   const bind=(button,address,text)=>{
    const [command]=this.commandsAt(address);
    this.localTarget(button,address);
    button.setAttribute('aria-label',command?this.commandLabel(command):text);
   };
   const control=()=>{const button=node('button','sdk-anchored-target');button.type='button';return button;};
   keyed(grid,Array.from({length:columns*rows},(_,i)=>i),i=>i,()=>{
    const cell=node('div','sdk-anchored-cell');cell.append(control());return cell;
   },(cell,index)=>{
    bind(cell.firstChild,{zone:field,cell:index},String(index+1));
    const object=fieldObjects.get(index);if(!object)return;
    const carrier=piece(object,false);if(carrier.parentNode!==cell)cell.append(carrier);
    const zone=byAnchor.get(entityKey(object.ref)),rack=carrier.firstChild.lastChild;
    if(zone)rack.style.setProperty('--anchored-rack-columns',Math.min(4,zone.capacity));
    keyed(rack,zone?Array.from({length:zone.capacity},(_,i)=>i):[],i=>i,()=>{
     const slot=node('span','sdk-anchored-slot');slot.append(control());return slot;
    },(slot,index)=>{
     const item=slots.get(zone.id).get(index),source=item?{entity:item.ref}:null;
     if(source&&this.interactionRows(source,'source').length)bind(slot.firstChild,source,this.text(item.visual.label));
     else bind(slot.firstChild,{zone:zone.id,index},String(index+1));
     slot.firstChild._dragVisual=null;
     if(!item)return;
     const occupant=piece(item,true);slot.firstChild._dragVisual=occupant;
     if(occupant.parentNode!==slot)slot.append(occupant);
    });
   });
   for(const id of previous){pieces.get(id).remove();pieces.delete(id);}
  }
  fitTileChain(){
   if(this.surface.dataset.mode!=='tile-chain')return;const field=this.root.closest('.layout-field'),height=field?.clientHeight||0;if(height>0)this.surface.style.minHeight=height+'px';const flow=this.surface.querySelector('[data-chain-flow]');if(!flow)return;
   const rowHeight=parseFloat(getComputedStyle(flow).getPropertyValue('--chain-row-height'))||52;
   if(height>0)flow.style.setProperty('--chain-top',root.PlayroomGameComponents.foldedChainOffset(Number(flow.dataset.anchorRow),Number(flow.dataset.chainRows),height,rowHeight)+'px');
  }
  renderChainEndpoint(element,target,scene){
   const options=this.selectedSource?this.interactionRows(target,'target').filter(i=>this.sameTarget(i.source,this.selectedSource)&&this.allowedCommands.has(commandKey(i.command))):[];
   const placement=options.length?scene.placements?.find(p=>options.some(i=>commandKey(i.command)===commandKey(p.command))):undefined;
   let button=element.querySelector('.sdk-chain-drop');if(!button){button=node('button','sdk-chain-drop');button.type='button';button.append(node('span','sdk-chain-preview'),node('span','sdk-chain-caption'),node('span','sdk-chain-plus','+'));element.append(button);}
   this.localTarget(button,target);button.disabled=this.readonly||!placement;button.classList.toggle('is-available',!!placement&&!this.readonly);button.classList.toggle('is-placeholder',!placement);this.bindGestureTarget(button,target);button.setAttribute('aria-hidden',String(!placement));
   button.firstChild.hidden=!placement;button.children[1].hidden=!placement;button.lastChild.hidden=!!placement;
   if(placement){this.paintCard(button.firstChild,{a:placement.a,b:placement.b,rotation:placement.a===placement.b?0:270},this.text(placement.label));button.firstChild.classList.toggle('is-double',placement.a===placement.b);setText(button.children[1],this.text(placement.caption));button.setAttribute('aria-label',this.text(placement.label));button.dataset.tooltip=this.text(placement.label)+' '+this.text(placement.help);button.dataset.previewA=placement.a;button.dataset.previewB=placement.b;}
   else{button.removeAttribute('aria-label');delete button.dataset.tooltip;delete button.dataset.previewA;delete button.dataset.previewB;}
  }
  renderTileChain(scene){
   const surface=this.surfaceMode('tile-chain');surface.classList.add('sdk-chain-board');surface.dataset.chainBoard='';
   if(!this.chainResizeObserver&&root.ResizeObserver){this.chainViewport=this.root.closest('.layout-field');if(this.chainViewport){this.chainResizeObserver=new ResizeObserver(()=>this.fitTileChain());this.chainResizeObserver.observe(this.chainViewport);}}
   const cards=scene.chain||[];if(!cards.length){surface.querySelector('[data-chain-flow]')?.remove();let opening=surface.querySelector('.sdk-chain-opening');if(!opening){opening=node('div','sdk-chain-opening');surface.append(opening);}this.renderChainEndpoint(opening,{zone:'field',index:0},scene);this.fitTileChain();return;}
   surface.querySelector('.sdk-chain-opening')?.remove();let chain=surface.querySelector('[data-chain-flow]');
   if(!chain){chain=node('div','sdk-chain-flow');chain.dataset.chainFlow='';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('sdk-chain-connections');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');svg.append(document.createElementNS(svg.namespaceURI,'path'));chain.append(svg,node('div','sdk-chain-nodes'));surface.append(chain);}
   const opening=Math.max(0,cards.findIndex(card=>card.id===scene.openingTileId)),layout=root.PlayroomGameComponents.foldedChainLayout(cards.length,opening);
   chain.setAttribute('role','group');chain.setAttribute('aria-label',this.text(scene.chainPresentation?.label));chain.dataset.chainRows=layout.rows;chain.dataset.anchorRow=layout.anchorRow;chain.style.setProperty('--chain-rows',layout.rows);chain.classList.toggle('is-long',layout.rows>3);chain.firstChild.setAttribute('viewBox','0 0 500 '+layout.rows*100);chain.firstChild.firstChild.setAttribute('d',layout.path);
   const cells=[{id:'end-left',edge:cards[0].a,target:{zone:'field',index:0}},...cards.map((card,index)=>({id:'tile-'+card.id,card,index})),{id:'end-right',edge:cards.at(-1).b,target:{zone:'field',index:cards.length}}];
   keyed(chain.lastChild,cells,item=>item.id,()=>node('div','sdk-chain-node'),(element,item,index)=>{const position=layout.positions[index];element.style.setProperty('--node-row',position.row+1);element.style.setProperty('--node-column',position.column+1);element.classList.toggle('is-reverse',position.reverse);element.dataset.flowRow=position.row;element.dataset.flowColumn=position.column;delete element.dataset.chainAnchor;if(item.card){if(!element.firstChild){const button=node('button','sdk-chain-tile');button.type='button';element.append(button);}const button=element.firstChild;this.paintCard(button,{...item.card,rotation:item.card.a===item.card.b?0:270},this.text(item.card.label));button.disabled=true;button.classList.toggle('is-double',item.card.a===item.card.b);button.dataset.entity='tile-'+item.card.id;button._target={entity:{namespace:'tile',id:String(item.card.id)}};button.dataset.tooltip=this.text(item.card.help);if(item.index===opening)element.dataset.chainAnchor='';}else{element.classList.add('sdk-chain-end');let slot=element.querySelector('.sdk-chain-end-slot');if(!slot){slot=node('div','sdk-chain-end-slot');const label=node('span','sdk-chain-edge');label.append(node('span'),node('b'));slot.append(label);element.append(slot);}const label=slot.firstChild;setText(label.firstChild,this.text(scene.chainPresentation?.edge));setText(label.lastChild,item.edge);this.renderChainEndpoint(slot,item.target,scene);}});
   this.fitTileChain();
  }
  renderStockDiscard(scene){
   const surface=this.surfaceMode('stock-discard'),layout=scene.tableLayout,flow=layout.flow;
   surface.classList.add('sdk-stock-discard');let status=surface.querySelector('.sdk-table-flow');
   if(!status){
    status=node('div','sdk-table-flow');const direction=node('span','sdk-table-direction');direction.innerHTML='<svg viewBox="0 0 64 16" aria-hidden="true"><path d="M3 8H61M54 2L61 8L54 14"/></svg>';
    const color=node('span','sdk-table-color');color.append(node('i'),node('span'));status.append(direction,color);
    const center=node('div','sdk-table-center'),stock=node('button','stock-button sdk-table-stock'),discard=node('div','sdk-table-discard');stock.type='button';stock.append(node('span','sdk-table-stock-art'),node('span','sdk-table-stock-count'));discard.append(node('button','sdk-piece-card'),node('small'),node('div','sdk-table-drop-port'));center.append(stock,discard);surface.append(status,center);
   }
   status.hidden=!flow;const direction=status.firstChild,color=status.lastChild;direction.hidden=!flow?.direction;direction.dataset.direction=String(flow?.direction||1);direction.setAttribute('role','img');direction.setAttribute('aria-label',this.text(flow?.directionLabel));color.hidden=!flow?.color;color.firstChild.style.background=root.PlayroomUnoDeck?.colors[flow?.color]||'';setText(color.lastChild,this.text(flow?.label));color.setAttribute('aria-label',this.text(flow?.description||flow?.label));
   const stock=surface.querySelector('.sdk-table-stock'),stockLabel=this.text(layout.stockLabel),discard=surface.querySelector('.sdk-table-discard'),card=discard.firstChild;
   this.paintCard(stock.firstChild,scene.stockCount?{hidden:true}:{empty:true},stockLabel);stock.dataset.motionStock='';stock.firstChild.toggleAttribute('data-motion-stock-back',!!scene.stockCount);stock.setAttribute('aria-label',stockLabel);stock.dataset.tooltip=this.text(layout.stockHelp);this.localTarget(stock,{zone:'stock'});stock.classList.remove('is-available');
   const badge=JSON.stringify([scene.stockCount,layout.stockCountLabel]);if(stock.lastChild._badge!==badge){stock.lastChild._badge=badge;stock.lastChild.innerHTML=(root.TabletopUI?.helpers?.countBadge||root.PlayroomGameComponents.countBadge)(scene.stockCount,this.text(layout.stockCountLabel),{corner:true});}
   this.paintCard(card,scene.discard||{empty:true},this.text(layout.discardHelp));this.localTarget(card,{zone:'field'});card.classList.remove('is-available');card.onclick=event=>{if(this.selectedSource)this.activateTarget({zone:'field'},card,{keyboard:event.detail===0});};card.disabled=this.readonly||!!this.selectedSource||!(scene.interactions||[]).some(i=>i.source&&i.target?.zone==='field'&&this.allowedCommands.has(commandKey(i.command)));if(this.selectedSource){delete card.dataset.sdkTarget;this.bindGestureTarget(card,{zone:'field'});}if(scene.discard?.id!=null)card.dataset.entity='card-'+scene.discard.id;else delete card.dataset.entity;discard.dataset.motionTable='';discard.dataset.tooltip=this.text(layout.discardHelp);setText(discard.children[1],this.text(layout.discardLabel));
   const choices=this.selectedSource?this.interactionRows(this.selectedSource,'source').filter(i=>i.target?.zone==='field'&&!i.target.entity&&this.allowedCommands.has(commandKey(i.command))):[];
   keyed(discard.lastChild,choices.length?[choices[0].target]:[],()=> 'drop',()=>{const button=node('button','sdk-table-drop');button.type='button';button.append(node('span'));return button;},(button,target)=>{setText(button.firstChild,this.text(layout.dropLabel));button.setAttribute('aria-label',this.text(choices.length>1?layout.dropChoiceLabel:layout.dropActionLabel));this.localTarget(button,target);});
  }
  renderCollectedSets(scene,frame){
   const surface=this.surfaceMode('collected-sets');surface.classList.add('sdk-collected-sets');surface.dataset.scoreTableSpace='';const layout=scene.tableLayout;
   let stock=surface.firstChild,table=surface.querySelector('table');if(!stock){stock=node('div','sdk-collection-stock');stock.dataset.motionStock='';stock.append(node('span','shared-card art-card'),node('span','sdk-collection-count'));const books=node('div','sdk-collection-books');books.dataset.motionTable='';table=node('table','sdk-collection-table');table.dataset.responsiveScoreTable='2';table.dataset.scoreColumnWidth='100';table.append(node('tbody'));books.append(table);surface.append(stock,books);}
   this.paintCard(stock.firstChild,scene.stockCount?{hidden:true}:{empty:true},this.text(layout.stockLabel));stock.firstChild.dataset.sizeRole='card';stock.firstChild.classList.toggle('shared-card-back',!!scene.stockCount);stock.firstChild.setAttribute('disabled','');this.localTarget(stock.firstChild,{zone:'stock'});stock.firstChild.classList.remove('is-available');const signature=JSON.stringify([scene.stockCount,layout.stockLabel]);if(stock.lastChild._count!==signature){stock.lastChild._count=signature;stock.lastChild.innerHTML=(root.TabletopUI?.helpers?.countBadge||root.PlayroomGameComponents.countBadge)(scene.stockCount,this.text(layout.stockLabel),{corner:true});}
   const changed=JSON.stringify(layout.rows)!==this.collectionRows;this.collectionRows=JSON.stringify(layout.rows);
   keyed(table.tBodies[0],layout.rows,row=>row.player,()=>{const tr=node('tr','sdk-collection-row'),th=node('th','sdk-collection-owner'),td=node('td'),cards=node('div','sdk-collection-cards');th.scope='row';cards.dataset.cardOverlap='14';cards.dataset.sceneScroll='';td.append(cards);tr.append(th,td);return tr;},(tr,row)=>{tr.dataset.collectionPlayer=String(row.player);tr.setAttribute('aria-label',this.text(row.label));const person=frame.participants?.[row.player]||{name:String(row.player+1)},identity=root.TabletopUI?.helpers?.avatar?.(person,row.player)||String(row.player+1);if(tr.firstChild._identity!==identity){tr.firstChild._identity=identity;tr.firstChild.innerHTML=identity;}
    keyed(tr.lastChild.firstChild,row.cards,card=>card.id,()=>node('span','mini-card'),(element,card)=>{const keyId={11:'8b7b577aa31e',12:'55cea60d6cce',13:'130b874a5c04',14:'7614b90a1064',15:'2f0a8ec85914'}[card.rank],rank=keyId?(root.PlayroomMessages?.text('ui.game-components.'+keyId)||String(card.rank)):String(card.rank),key=JSON.stringify([card.id,rank]);if(element._print!==key){element._print=key;const template=document.createElement('template');template.innerHTML=root.PlayroomMiniCards.card({rank,id:card.id,label:rank});const cardNode=template.content.firstElementChild;element.replaceChildren(...cardNode.childNodes);element.dataset.entity='card-'+card.id;element.dataset.rank=rank;element.setAttribute('aria-label',rank);}});
   });
   if(changed)root.PlayroomGameScreen?.invalidateGeometry?.(surface);
  }
  renderDiscardPairs(scene){
   const surface=this.surfaceMode('discard-pairs');surface.classList.add('sdk-discard-pairs');let pile=surface.firstChild;if(!pile){pile=node('div','sdk-pair-discard');pile.dataset.motionTable='';pile.append(node('span','shared-card art-card'),node('span','sdk-pair-count'));surface.append(pile);}const card=scene.discard.at(-1),face=pile.firstChild;this.paintCard(face,card||{empty:true},this.text(scene.tableLayout.discardLabel));face.dataset.sizeRole='card';face.setAttribute('disabled','');if(card){face.dataset.entity='card-'+card.id;face._target={entity:{namespace:'card',id:String(card.id)}};}else{delete face.dataset.entity;face._target=null;}const key=JSON.stringify([scene.discardCount,scene.tableLayout.discardLabel]);if(pile.lastChild._count!==key){pile.lastChild._count=key;pile.lastChild.innerHTML=(root.TabletopUI?.helpers?.countBadge||root.PlayroomGameComponents.countBadge)(scene.discardCount,this.text(scene.tableLayout.discardLabel),{corner:true});}
  }
  renderPairedTricks(scene){
   const surface=this.surfaceMode('paired-tricks');surface.classList.add('sdk-paired-tricks');const layout=scene.tableLayout;
   // Seven fixed footprints (stock plus six pairs) preserve the table bounds
   // through selection, defence, taking and history. Only legal targets change.
   let stock=surface.firstChild;
   if(!stock){
    stock=node('div','sdk-trick-stock');
    const stack=node('div','sdk-trick-stock-stack'),trump=node('span','sdk-trick-trump art-card'),deck=node('span','sdk-trick-deck');
    const back=node('span','sdk-trick-back'),token=node('span','sdk-trick-trump-token'),badge=node('span','sdk-trick-stock-count');
    const slot=document.createElement('template');slot.innerHTML=this.cardSlotMarkup({kind:'empty'});
    back.dataset.sizeRole='card';
    deck.append(back,slot.content.firstElementChild,token);
    stack.append(trump,deck,badge);stack.dataset.motionStock='';stack.dataset.motionStatic='';
    stock.append(stack,node('span','table-chip'));surface.append(stock);
   }
   stock.dataset.key='0';
   const stack=stock.firstChild,trump=stack.children[0],deck=stack.children[1],badge=stack.lastChild;
   const [back,empty,token]=deck.children,stockLabel=this.text(layout.stockLabel);
   trump.hidden=!scene.trump||!scene.stockCount;if(scene.trump){this.paintCard(trump,scene.trump,this.text(scene.trump.label));trump.dataset.entity='trump-'+scene.trump.id;trump._target={entity:{namespace:'trump',id:String(scene.trump.id)}};trump.setAttribute('disabled','');trump.dataset.sizeRole='card';trump.dataset.tooltip=this.text(scene.trump.help);}
   // Keep the empty stock on the same physical footprint as its card back.
   back.hidden=!scene.stockCount;empty.hidden=!!scene.stockCount;
   back.classList.toggle('shared-card-back',!!scene.stockCount);
   if(scene.stockCount)this.paintCard(back,{hidden:true},stockLabel);
   empty.setAttribute('aria-label',stockLabel);
   token.hidden=!scene.trump;if(scene.trump){const red=scene.trump.color==='red'||['♥','♦'].includes(scene.trump.suit),signature=JSON.stringify([scene.trump.suit,this.cardSkin,this.resolvedSkin('card-face')]);token.classList.toggle('is-red',red);token.setAttribute('role','img');token.tabIndex=0;token.setAttribute('aria-label',this.text(layout.trumpLabel));token.dataset.tooltip=this.text(layout.trumpLabel);if(token._print!==signature){token._print=signature;const G=root.PlayroomGameComponents,params={suit:scene.trump.suit,suitOnly:true,packId:this.frame.projection.game};token.innerHTML=root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('card-face',params,G.cardFace):G.cardFace(params);}}
   const countKey=JSON.stringify([scene.stockCount,layout.stockLabel]);if(badge._count!==countKey){badge._count=countKey;badge.innerHTML=(root.TabletopUI?.helpers?.countBadge||root.PlayroomGameComponents.countBadge)(scene.stockCount,this.text(layout.stockLabel),{corner:true});}setText(stock.lastChild,this.text(layout.discardLabel)+' · '+scene.discardCount);
   const nextSlot={zone:'field',index:scene.table.length};
   const openingMove=this.interactionRows(nextSlot,'target').find(i=>i.source&&i.target.zone===nextSlot.zone&&i.target.index===nextSlot.index&&this.allowedCommands.has(commandKey(i.command)));
   const selectedMoves=this.selectedSource?this.interactionRows(this.selectedSource,'source').filter(i=>this.allowedCommands.has(commandKey(i.command))):[];
   keyed(surface,Array.from({length:layout.capacity+1},(_,i)=>i),i=>i,i=>i===0?stock:node('div','sdk-trick-pair'),(slot,index)=>{
    if(index===0)return;const at=index-1,pair=scene.table[at],opening=!pair&&at===scene.table.length&&!!openingMove;
    slot.dataset.trickSlot=String(at);slot.dataset.motionTable='';slot.classList.toggle('is-reserved',!pair&&!opening);slot.toggleAttribute('inert',!pair&&!opening);slot.setAttribute('aria-hidden',String(!pair&&!opening));
    if(!slot.firstChild){slot.append(node('span','sdk-trick-attack'),node('span','sdk-trick-defense'),node('button','sdk-trick-target'));slot.lastChild.type='button';}
    const attack=slot.children[0],defense=slot.children[1],target=slot.lastChild;attack.hidden=!pair;defense.hidden=!pair?.defense;
    for(const [e,c]of [[attack,pair?.attack],[defense,pair?.defense]])if(!c){e.replaceChildren();e._cardSignature=null;e._target=null;delete e.dataset.entity;delete e.dataset.tooltip;}else{this.paintCard(e,c,this.text(c.label));e.dataset.entity='card-'+c.id;e._target={entity:{namespace:'card',id:String(c.id)}};e.dataset.sizeRole='card';e.setAttribute('disabled','');e.dataset.tooltip=this.text(c.help);}
    const destination={zone:'field',index:at},move=selectedMoves.find(i=>this.sameTarget(i.target,destination));
    target.hidden=!!pair?.defense||!pair&&!opening;target.className='sdk-trick-target '+(pair?'sdk-trick-defense-slot':'sdk-trick-opening');this.localTarget(target,destination);target.classList.toggle('is-placeholder',!move);target.classList.remove('is-available');target.disabled=this.readonly||!move;this.bindGestureTarget(target,destination);
    const targetLabel=move?this.commandLabel(move.command):opening?this.text(openingMove.label||this.commandLabel(openingMove.command)):this.text(layout.uncoveredLabel);
    target.setAttribute('aria-label',targetLabel);target.dataset.tooltip=targetLabel;
    // The direct art child makes the target itself the shared physical slot.
    target.classList.toggle('shared-card-slot',!!opening);
    if(opening){
     target.dataset.cardSlot='play';
     if(!target.firstChild){const template=node('template');template.innerHTML=this.cardSlotMarkup({tag:'span',attrs:'',kind:'play'});target.append(template.content.firstElementChild.firstElementChild);}
    }else if(target.firstChild){delete target.dataset.cardSlot;target.replaceChildren();}
   });
   const choices=this.readonly?[]:selectedMoves.filter(i=>i.target.zone==='selection-actions').map(i=>i.command);
   if(choices.length){this.showChoices(choices);for(const button of this.choicePanel.querySelectorAll('[data-sdk-command]'))this.localTarget(button,{zone:'selection-actions'});}else{this.hideChoicePanel();this.choiceCommands=null;this.choicePanel.replaceChildren();}
  }
  renderCardTable(scene){if(scene.tableLayout?.kind==='collected-sets'){this.renderCollectedSets(scene,this.frame);return;}if(scene.tableLayout?.kind==='discard-pairs'){this.renderDiscardPairs(scene);return;}if(scene.tableLayout?.kind==='paired-tricks'){this.renderPairedTricks(scene);return;}if(scene.tableLayout?.kind==='stock-discard'){this.renderStockDiscard(scene);return;}const surface=this.surfaceMode(scene.family);let center=surface.querySelector('.sdk-table-center');if(!center){center=node('div','sdk-table-center');surface.append(center);}const items=[];if(scene.stockCount!==undefined&&scene.family!=='tile-chain')items.push({id:'stock',kind:'stack',count:scene.stockCount,label:'Колода'});if(scene.trump)items.push({id:'trump',kind:'card',card:scene.trump,label:'Козырь'});if(scene.table)scene.table.forEach((pair,i)=>{items.push({id:'attack-'+i,kind:'pair',pair,index:i,label:'Пара '+(i+1)});});if(scene.discard&&!Array.isArray(scene.discard))items.push({id:'discard',kind:'card',card:scene.discard,label:'Сброс'});if(Array.isArray(scene.discard)&&scene.discard.length)items.push({id:'discard',kind:'stack',count:scene.discard.length,card:scene.discard.at(-1),label:'Сброс'});if(scene.chain)items.push({id:'chain',kind:'chain',cards:scene.chain,label:'Цепочка'});
   const destinations=this.selectedSource?(scene.interactions||[]).filter(i=>i.source&&this.sameTarget(i.source,this.selectedSource)&&i.target?.zone==='field'&&!i.target.entity&&i.target.cell===undefined):[];const seen=new Set();for(const interaction of destinations){const target=interaction.target,key=JSON.stringify(target);if(seen.has(key))continue;seen.add(key);if(Number.isInteger(target.index)&&scene.table?.[target.index])continue;const item={id:'drop-'+key,kind:'drop',target,label:scene.chain?(target.index===0?'В начало цепочки':'В конец цепочки'):'На стол'};if(scene.chain&&target.index===0)items.splice(Math.max(0,items.findIndex(i=>i.kind==='chain')),0,item);else items.push(item);}
   keyed(center,items,item=>item.id,()=>node('div','sdk-table-slot'),(slot,item)=>{if(slot._kind!==item.kind){slot._kind=item.kind;slot.replaceChildren();}slot.setAttribute('aria-label',item.label);if(item.kind==='drop'){if(!slot.firstChild){const b=node('button','sdk-table-drop');b.type='button';slot.append(b);}setText(slot.firstChild,item.label);this.localTarget(slot.firstChild,item.target);}else if(item.kind==='pair'){if(!slot.firstChild){slot.append(node('button','sdk-piece-card'),node('button','sdk-piece-card sdk-pair-defense'));}for(const [i,card]of [item.pair.attack,item.pair.defense].entries()){const e=slot.children[i];e.hidden=!card;if(card){this.paintCard(e,card,item.label);this.localTarget(e,{entity:{namespace:'card',id:String(card.id)},zone:'field',index:item.index});}}}else if(item.kind==='chain'){slot.classList.add('sdk-tile-chain');keyed(slot,item.cards,c=>c.id,()=>node('button','sdk-piece-card'),(e,card)=>{this.paintCard(e,card,card.a+' · '+card.b);this.localTarget(e,{entity:{namespace:'tile',id:String(card.id)},zone:'field'});});}else {if(!slot.firstChild){slot.append(node('button','sdk-piece-card'),node('span','sdk-stack-count'));}this.paintCard(slot.firstChild,item.card||{hidden:true},item.label);this.localTarget(slot.firstChild,{zone:item.id});slot.firstChild.style.setProperty('--stack-depth',Math.min(5,item.count||0));setText(slot.lastChild,item.count!==undefined?item.label+' · '+item.count:item.label);}});}
  renderNativeSolitaire(scene){
   const library=root.PlayroomSolitaireBoard;if(!library)throw Object.assign(Error('SDK_COMPONENT_UNAVAILABLE'),{code:'SDK_COMPONENT_UNAVAILABLE'});
   const surface=this.surfaceMode('solitaire-native');surface.classList.add('sdk-solitaire-native');this.cancelControl.hidden=true;if(this.readonly)this.selectedSource=null;
   const G=root.PlayroomGameComponents,base=root.TabletopUI?.helpers,esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const assetArt=(family,params,fallback)=>base?.assetArt?base.assetArt(family,{...params,packId:this.frame.projection.game},fallback):fallback(params),helpers={...base,esc,icon:root.PlayroomIcons.icon,countBadge:G.countBadge,assetArt,assetLayout:family=>{try{return root.PlayroomAssetResolver?.resolve(family,{packId:this.frame.projection.game})?.stacking;}catch{return null;}},actionAttr:command=>'data-action="'+esc(commandKey(command))+'"',target:(piece,command)=>'data-drop-piece="'+esc(piece)+'" data-action="'+esc(commandKey(command))+'"'};
   helpers.source=(id,actions,selected,options={})=>{const choices=actions.filter(a=>a[options.key||'card']!=null&&String(a[options.key||'card'])===String(id)),chosen=selected!=null&&String(selected)===String(id);return {choices,className:[options.className||'',choices.length?'is-playable':'',chosen?'is-selected':''].filter(Boolean).join(' '),attr:!choices.length&&!options.inspect?'disabled aria-disabled="true"':'data-select="'+esc(id)+'"'+(choices.length&&options.drag?' data-drag-piece="'+esc(id)+'"':'')+' aria-pressed="'+chosen+'"'};};
   const native=G.createHelpers(helpers,()=>''),skinKey=JSON.stringify([this.cardSkin,this.resolvedSkin('card-face'),this.resolvedSkin('card-back')]),scope=this.frame.projection.game+':'+this.frame.projection.viewer+':'+skinKey;
   if(this.solitaireRegionScope!==scope||this.solitaireResolver!==root.PlayroomAssetResolver){this.solitaireRegionScope=scope;this.solitaireResolver=root.PlayroomAssetResolver;this.solitaireRegions=new Map();}
   const describe=(card,attrs='disabled',extra='')=>({card,attrs,extra,label:card.hidden?root.PlayroomMessages?.text('ui.game-components.c13a6680430c')||'Закрытая карта':base?.components?.cardDescriptor?.(card)?.label||[card.rank>=11?this.text(scene.solitaireLayout.labels['ui.rank'+card.rank]):card.rank,card.suit].filter(Boolean).join(' ')});
   const renderCard=spec=>{const {card,attrs,extra,label}=spec,tag=attrs==='disabled'?'span':'button';return '<'+tag+' data-size-role="card" class="shared-card sdk-piece-card '+(card.hidden?'shared-card-back ':card.suit==='♥'||card.suit==='♦'?'shared-red ':'')+extra+'" '+attrs+(card.hidden?'':' data-entity="'+esc('card-'+card.id)+'"')+' aria-label="'+esc(label)+'">'+this.cardMarkup(card)+'</'+tag+'>';};
   const components={...native,scoreBadge:G.scoreBadge,cardDescriptor:describe,renderCard,card:(card,attrs,extra)=>renderCard(describe(card,attrs,extra))};helpers.components=components;
   const ui={idPrefix:this.inputId,selected:this.selectedSource?.entity?.namespace==='card'?this.selectedSource.entity.id:null,viewState:this.frame.ui?.viewState||this.solitaireViewState||{},region:(id,deps,build)=>{const signature=JSON.stringify(deps),old=this.solitaireRegions.get(id);if(old?.signature===signature)return old.html;const html=build();this.solitaireRegions.set(id,{signature,html});return html;}};
   const recipe=library.render({state:{scene,move:this.frame.projection.revision,turn:this.frame.projection.turn},viewer:this.frame.projection.viewer,actions:this.readonly?[]:this.frame.projection.actions,ui,text:key=>this.text(scene.solitaireLayout.labels[key]),helpers,components});
   const fieldTree=parseMarkup(surface,recipe.elements.field);
   const movedStatus=this.targetScope.querySelector('.solitaire-stats[data-scene-status]'),freshStatus=fieldTree.querySelector('[data-scene-status]');if(movedStatus&&!surface.contains(movedStatus)&&freshStatus){root.PlayroomDOM.patchChildren(movedStatus,freshStatus,this.solitaireStatusTree);freshStatus.remove();this.solitaireStatusTree=freshStatus;}
   // Host layout may have moved metadata/actions out of the authored field.
   // Those empty homes must not destroy relocated native controls on a patch.
   this.solitaireHomeLeases??=new Map();for(const [home,release]of this.solitaireHomeLeases)if(!home.isConnected||home.hasAttribute('data-scene-status-home')&&(!movedStatus||home.contains(movedStatus))){release();this.solitaireHomeLeases.delete(home);}
   // A legal run changes columns without changing its physical cards. Keep
   // their component nodes when the native column patch crosses parent lanes.
   const priorCards=new Map([...surface.querySelectorAll('.solitaire-card[data-entity]')].map(e=>[e.dataset.entity,e]));
   // The patcher only reads the parsed tree. Keep it as the next baseline
   // while the mounted nodes retain their runtime state and listeners.
   root.PlayroomDOM.patchChildren(surface,fieldTree,this.solitaireFieldTree);this.solitaireFieldTree=fieldTree;
   for(const fresh of surface.querySelectorAll('.solitaire-card[data-entity]')){const old=priorCards.get(fresh.dataset.entity);if(!old||old===fresh||old.tagName!==fresh.tagName)continue;const holder=surface.ownerDocument.createDocumentFragment();holder.append(old);root.PlayroomDOM.patchChildren(holder,{childNodes:[fresh]});fresh.replaceWith(holder.firstChild);}
   for(const home of surface.querySelectorAll('[data-scene-actions-home],[data-scene-status-home]'))if(!this.solitaireHomeLeases.has(home))this.solitaireHomeLeases.set(home,root.PlayroomDOM.manageChildren(home));
   const port=this.targetScope.querySelector('[data-sdk-solitaire-controls]')||this.root;if(this.solitaireControlPort!==port){this.releaseSolitaireControlPort?.();this.solitaireControlPort=port;this.releaseSolitaireControlPort=port!==this.root?root.PlayroomDOM.manageChildren(port):null;}
   this.solitaireControls??=node('div','sdk-solitaire-controls');if(this.solitaireControls.parentElement!==port)port.append(this.solitaireControls);const controlTree=parseMarkup(this.solitaireControls,recipe.elements.actions);root.PlayroomDOM.patchChildren(this.solitaireControls,controlTree,this.solitaireControlTree);this.solitaireControlTree=controlTree;
   const bind=host=>{
    for(const artwork of host.querySelectorAll('[data-asset-family="card-back"][data-asset-params]'))this.bindCardBack(artwork);
    // Runtime permissions are rebuilt from this revision, including when a
    // history frame removes the native double-click collect attribute.
    const stale=new Set(host.querySelectorAll('[data-sdk-target]'));
    for(const e of host.querySelectorAll('[data-action],[data-select],[data-drag-piece],[data-double-action],[data-feedback-required],.solitaire-card[data-entity]')){
    if(e.hasAttribute('data-double-action')){stale.delete(e);e.dataset.sdkTarget='true';e._target={zone:'field'};e.disabled=this.readonly;if(this.readonly)delete e.dataset.doubleAction;continue;}
    if(e.dataset.feedbackRequired){stale.delete(e);e.dataset.sdkTarget='true';e._target={zone:'stock'};e.disabled=this.readonly;if(this.readonly){e.removeAttribute('data-feedback-required');e.setAttribute('disabled','');}continue;}
    const raw=e.dataset.action,command=raw&&(()=>{try{return JSON.parse(raw);}catch{return null;}})(),authorized=command&&this.allowedCommands.has(commandKey(command));
    if(command){stale.delete(e);const interaction=scene.interactions.find(i=>commandKey(i.command)===commandKey(command));e._command=command;e.dataset.sdkCommand='true';e.dataset.sdkTarget='true';e._target=interaction?.target||{zone:'field'};e.disabled=this.readonly||!authorized;e.toggleAttribute('disabled',!!e.disabled);if(interaction?.source&&this.selectedSource){e.dataset.dropPiece=this.inputId+':'+JSON.stringify(this.selectedSource);e._sdkGestureTarget=false;}else delete e.dataset.dropPiece;e.onclick=event=>{event.stopPropagation();if(e._suppressClick){e._suppressClick=false;return;}if(!e.disabled&&this.allowedCommands.has(commandKey(command))){this.selectedSource=null;this.command(command);}};continue;}
    const id=e.dataset.entity?.startsWith('card-')?e.dataset.entity.slice(5):e.dataset.select;if(!id)continue;stale.delete(e);delete e.dataset.sdkCommand;delete e._command;const target={entity:{namespace:'card',id}};this.localTarget(e,target);e.classList.remove('is-available');e.disabled=this.readonly;e.toggleAttribute('disabled',this.readonly);e.setAttribute('aria-disabled',String(this.readonly));delete e.dataset.select;const key=this.inputId+':'+JSON.stringify(target);if(!this.readonly&&scene.dragSources.includes(id)){e.dataset.dragPiece=key;e.dataset.dragStart='immediate';}else delete e.dataset.dragPiece;e.onclick=event=>{event.stopPropagation();if(e._suppressClick){e._suppressClick=false;return;}if(this.readonly)return;this.selectedSource=this.selectedSource&&this.sameTarget(this.selectedSource,target)?null:target;this.renderSemantic(this.sceneData,this.frame);this.refreshTutorialSelection();};
   }
   for(const e of stale){delete e.dataset.sdkTarget;delete e.dataset.sdkCommand;delete e._command;e.disabled=true;e.onclick=null;}
   if(!this.frame.ui?.viewState)for(const e of host.querySelectorAll('[data-view-key]'))e.onclick=event=>{event.stopPropagation();(this.solitaireViewState||={})[e.dataset.viewKey]=e.dataset.viewValue;this.renderSemantic(this.sceneData,this.frame);};};
   bind(surface);bind(this.solitaireControls);
   // The shell may rebuild the status bar before the SDK scene patches its contents.
   root.PlayroomGameScreen?.placeSceneStatus(this.targetScope,root);
   const prints=new Map([...scene.tableau.flat(),...scene.waste,...scene.foundations.flat(),...scene.completed.flat()].filter(c=>!c.hidden).map(c=>[c.id,JSON.stringify([c,skinKey])]));
   for(const e of surface.querySelectorAll('.solitaire-card')){const hidden=e.classList.contains('shared-card-back'),id=e.dataset.entity?.slice(5);e._cardSignature=hidden?JSON.stringify([{hidden:true},skinKey]):prints.get(id);if(hidden){const position=e.closest('[data-drag-stack-member]'),column=position?.closest('[data-column]');e._target=column?{zone:'tableau-'+column.dataset.column,index:Number(position.dataset.dragStackMember)}:{zone:'stock',index:0};if(e._command?.type!=='flip'||!this.allowedCommands.has(commandKey(e._command))){delete e._command;for(const key of ['sdkTarget','sdkCommand','dragPiece','dropPiece','action'])delete e.dataset[key];e.onclick=null;e.disabled=true;}}else if(!e.hasAttribute('data-sdk-target')&&id)e._target={entity:{namespace:'card',id}};}

  }
  renderSolitaire(scene){if(scene.solitaireLayout){this.renderNativeSolitaire(scene);return;}const surface=this.surfaceMode('solitaire');surface.classList.add('sdk-solitaire');const columns=scene.tableau.length;surface.style.setProperty('--tableau-columns',columns);let top=surface.querySelector('.sdk-solitaire-top'),tableau=surface.querySelector('.sdk-tableau');if(!top){top=node('div','sdk-solitaire-top');tableau=node('div','sdk-tableau');surface.append(top,tableau);}const piles=[{id:'stock',cards:scene.stockCount?[{hidden:true}]:[],count:scene.stockCount,label:'Запас'},...(scene.waste?[{id:'waste',cards:scene.waste.slice(-Math.max(1,scene.drawCapacity||1)),count:scene.waste.length,label:'Сброс'}]:[]),...(scene.foundations||[]).map((cards,i)=>({id:'foundation-'+i,cards:cards.slice(-1),count:cards.length,label:'Дом '+(i+1)})),...(scene.completed||[]).map((cards,i)=>({id:'completed-'+i,cards:cards.slice(-1),count:cards.length,label:'Собрано '+(i+1)}))];
   keyed(top,piles,p=>p.id,()=>{const p=node('div','sdk-pile'),label=node('div','sdk-pile-label');label.append(node('span','sdk-pile-name'),node('span','sdk-pile-total'));p.append(label,node('div','sdk-pile-cards'));return p;},(pile,p)=>{pile.dataset.zone=p.id;setText(pile.firstChild.children[0],p.label);setText(pile.firstChild.children[1],p.count);this.renderPile(pile.lastChild,p.cards,p.id,false);});
   keyed(tableau,scene.tableau,(_,i)=>i,()=>{const col=node('div','sdk-tableau-column');col.append(node('span','sdk-pile-label'),node('div','sdk-pile-cards'));return col;},(column,cards,index)=>{setText(column.firstChild,String(index+1));column.dataset.zone='tableau-'+index;this.renderPile(column.lastChild,cards,'tableau-'+index,true);});}
  renderPile(container,cards,zone,vertical){container.classList.toggle('is-vertical',vertical);container.style.setProperty('--pile-count',Math.max(1,cards.length));keyed(container,cards.length?cards:[{empty:true}],(c,i)=>!c.hidden&&c.id!==undefined?String(c.id):'slot-'+i,()=>{const e=node('button','sdk-piece-card');e.type='button';return e;},(e,c,index)=>{e.style.setProperty('--pile-index',index);if(c.empty){e._cardSignature=null;e.classList.add('is-empty');e.replaceChildren(node('span','sdk-empty-pile','＋'));e.setAttribute('aria-label','Пустое место');this.localTarget(e,{zone});}else {e.classList.remove('is-empty');this.paintCard(e,c,c.hidden?'Закрытая карта':(c.rank??'')+' '+(c.suit||''));const object=(this.sceneData.objects||[]).find(o=>o.zone===zone&&o.index===index);this.localTarget(e,{zone,index,entity:!c.hidden&&c.id!==undefined?object?.ref||{namespace:'card',id:String(c.id)}:undefined});if(c.id!==undefined&&!c.hidden)e.dataset.entity='card-'+c.id;else delete e.dataset.entity;}});}
  renderPairedMemory(scene){
   const surface=this.surfaceMode('paired-memory');surface.classList.add('sdk-paired-memory');surface.dataset.cardCount=String(scene.cards.length);surface.style.setProperty('--memory-columns',scene.cards.length<=16?4:6);surface.style.setProperty('--memory-rows',Math.ceil(scene.cards.length/(scene.cards.length<=16?4:6)));surface.setAttribute('role','group');surface.setAttribute('aria-label',this.text(scene.memoryLayout.label));
   // The host fitter owns column/card sizes. A flip must never resize the grid.
   const closing=scene.revealing&&this.frame.ui?.presentationTurn!=null&&this.frame.ui.presentationTurn!==this.frame.projection.turn;
   const items=scene.cards.flatMap((card,index)=>scene.cards.length===24&&index===12?[{gap:true,id:'center-gap'},card]:[card]);
   keyed(surface,items,c=>c.id,c=>{if(c.gap){const gap=node('div');gap.dataset.gridGap='center';gap.hidden=true;gap.setAttribute('aria-hidden','true');return gap;}const slot=node('div','sdk-memory-slot'),face=node('span','sdk-memory-face'),back=node('span','sdk-memory-back');face.dataset.motionFace='';back.dataset.motionBack='';face.append(node('button','shared-card'));face.firstChild.type='button';face.firstChild.dataset.sizeRole='card';back.append(node('span','shared-card shared-card-back'));back.firstChild.dataset.sizeRole='card';slot.append(face,back);return slot;},(slot,c)=>{
    if(c.gap)return;const card=c.closing&&!closing?{hidden:true}:c.card,face=slot.firstChild,button=face.firstChild,back=slot.lastChild,close=!!c.closing&&closing;
    slot.dataset.entity='slot-'+c.index;slot.dataset.motionEffect='flip';slot.dataset.motionTrigger='flip';slot.dataset.motionKey='index';slot.dataset.motionValue=String(c.index);slot.toggleAttribute('data-motion-close',close);slot.classList.toggle('is-matched',c.matched);
    const descriptor={...card,assetSet:scene.assetSet},H=root.TabletopUI?.helpers,label=card.hidden?root.PlayroomMessages?.text('ui.game-components.c13a6680430c'):c.label||H?.components?.cardDescriptor?.(card)?.label;
    this.paintCard(button,descriptor,this.text(label||'Карта '+(c.index+1)));this.localTarget(button,{entity:{namespace:'slot',id:String(c.index)},cell:c.index,zone:'field'});button.classList.remove('is-available');
    if(close){this.paintCard(back.firstChild,{hidden:true,assetSet:scene.assetSet},root.PlayroomMessages?.text('ui.game-components.c13a6680430c')||'Закрытая карта');back.firstChild.classList.remove('sdk-piece-card');back.hidden=false;}else back.hidden=true;
    // Reset only when entering/leaving a close phase; the common animator may
    // have left an opaque back covering an otherwise retained public face.
    if(slot._closing!==close){slot._closing=close;back.style.removeProperty('visibility');back.style.removeProperty('transform');}
   });
  }
  renderMemory(scene){if(scene.memoryLayout){this.renderPairedMemory(scene);return;}const surface=this.surfaceMode('memory');surface.classList.add('sdk-memory-grid');surface.style.setProperty('--memory-columns',scene.cards.length<=16?4:6);keyed(surface,scene.cards,c=>c.id,()=>{const e=node('button','sdk-piece-card');e.type='button';return e;},(e,c)=>{this.paintCard(e,{...c.card,...(c.asset?{asset:c.asset,assetFamily:c.assetFamily,assetVariants:c.assetVariants}:{})},'Карта '+(c.index+1));e.classList.toggle('is-matched',!!c.matched);e.classList.toggle('is-closing',!!c.closing);this.localTarget(e,{entity:{namespace:'slot',id:String(c.index)},cell:c.index,zone:'field'});});}
  makeBoard(surface,columns,rows){if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<1||rows<1||columns>64||rows>64||columns*rows>4096)throw Object.assign(new Error('SDK_SCENE_GEOMETRY_LIMIT'),{code:'SDK_SCENE_GEOMETRY_LIMIT'});let board=surface.querySelector('.sdk-geometric-board');if(!board){board=node('div','sdk-geometric-board');board.setAttribute('role','grid');board.append(node('div','sdk-board-cells'),node('div','sdk-board-pieces'));surface.append(board);}board.style.setProperty('--board-columns',columns);board.style.setProperty('--board-rows',rows);board.style.aspectRatio=columns+'/'+rows;return board;}
  boardCells(board,columns,rows,paint){keyed(board.firstChild,Array.from({length:columns*rows},(_,index)=>index),index=>index,()=>{const e=node('button','sdk-board-cell');e.type='button';e.setAttribute('role','gridcell');return e;},(e,index)=>{e.classList.toggle('is-dark',(Math.floor(index/columns)+index%columns)%2===1);e.dataset.cell=String(index);paint(e,index);});}
  renderDraughts(scene){
   const surface=this.surfaceMode('draughts');surface.classList.add('sdk-draughts-surface');surface.classList.remove('is-flipped');const layout=scene.checkerLayout;
   let wrap=surface.firstChild;if(!wrap){wrap=node('div','sdk-draughts-wrap');const frame=node('span','sdk-draughts-frame');frame.innerHTML=root.PlayroomGameComponents.vector.viewport({width:100,height:100,attrs:'aria-hidden="true"',content:'<rect x=".25" y="1.75" width="99.5" height="98" rx="3.6" fill="var(--color-material-board-side,#bdc9ac)"/><rect x=".25" y=".25" width="99.5" height="98" rx="3.6" fill="var(--color-material-board-frame,#fffae9)" stroke="var(--color-material-board-rim,#d4d8c3)" stroke-width=".5"/>'});wrap.append(frame);surface.append(wrap);this.draughtsPieces=new Map();}
   const board=this.makeBoard(wrap,8,8);board.classList.add('sdk-draughts-board');board.setAttribute('aria-label',this.text(layout.label));const pieces=new Map(scene.pieces.map(p=>[p.cell,p]));
   const pieceTarget=(piece,cell)=>({entity:{namespace:'checker',id:piece.id},zone:'field',cell});
   // Forced capture is authored state. Keep its public selection in history,
   // and use the same input target as the rendered piece for chain dragging.
   if(scene.forced!==null)this.selectedSource=pieceTarget(pieces.get(scene.forced),scene.forced);
   const selected=this.selectedSource?.entity?.namespace==='checker'?this.selectedSource:null,order=Array.from({length:64},(_,i)=>layout.flipped?63-i:i),cells=new Map(layout.cells.map(c=>[c.cell,c]));
   // These records decorate destinations. The interaction index remains
   // the source of legal commands, and the first authored label wins.
   const firstMoveByCell=new Map();
   if(selected)for(const move of layout.moves){
    if(!firstMoveByCell.has(move.to)&&this.sameTarget({entity:move.source},selected)&&this.allowedCommands.has(commandKey(move.command)))firstMoveByCell.set(move.to,move);
   }
   keyed(board.firstChild,order,index=>index,()=>{const cell=node('button','sdk-board-cell sdk-draughts-cell');cell.type='button';cell.dataset.gridCell='';cell.dataset.interactionShape='cell';cell.setAttribute('role','gridcell');cell.append(node('small','sdk-checker-file'),node('small','sdk-checker-rank'));return cell;},(cell,index)=>{
    const descriptor=cells.get(index),piece=pieces.get(index),source=piece?{entity:{namespace:'checker',id:piece.id}}:null,sourceAvailable=source&&this.interactionRows(source,'source').some(i=>this.allowedCommands.has(commandKey(i.command))),move=firstMoveByCell.get(index),destination={zone:'field',cell:index},isDestination=!this.readonly&&!!move;
    const file=cell.querySelector('.sdk-checker-file'),rank=cell.querySelector('.sdk-checker-rank');setText(file,descriptor.file);setText(rank,descriptor.rank);file.hidden=!descriptor.file;rank.hidden=!descriptor.rank;cell.dataset.cell=String(index);cell.dataset.gridIndex=String(index);cell.classList.toggle('is-dark',(Math.floor(index/8)+index%8)%2===1);cell.setAttribute('aria-label',this.text(descriptor.label));cell.dataset.tooltip=this.text(move?.help||descriptor.help);
    this.localTarget(cell,sourceAvailable?source:destination);cell.disabled=this.readonly||!(sourceAvailable||isDestination);cell.classList.remove('is-available');cell.classList.toggle('is-playable',!!isDestination);cell.classList.toggle('is-destination',!!isDestination);delete cell.dataset.dragPiece;delete cell.dataset.swipeAction;delete cell.dataset.swipeSelect;if(!sourceAvailable)this.bindGestureTarget(cell,destination);
    cell.toggleAttribute('data-guide-capture',isDestination&&!!move.capture);cell.toggleAttribute('data-guide-king-move',isDestination&&!!move.kingMove);
    const previous=cell.querySelector('.sdk-draughts-piece');if(previous&&previous.dataset.pieceId!==piece?.id)previous.remove();
    if(piece){let token=this.draughtsPieces.get(piece.id);if(!token){token=node('span','sdk-board-piece sdk-draughts-piece');token.dataset.pieceId=piece.id;token.dataset.sizeRole='checker';token.dataset.interactionShape='circle';token.setAttribute('role','img');this.draughtsPieces.set(piece.id,token);}if(token.parentElement!==cell)cell.prepend(token);
     const skin=this.resolvedSkin('checker'),signature=JSON.stringify([piece.king,skin]);if(token._pieceSignature!==signature){token._pieceSignature=signature;const G=root.PlayroomGameComponents,params={king:piece.king,movable:false,packId:this.frame.projection.game};token.innerHTML=root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('checker',params,p=>G.checkerArt(p.king,p.movable)):G.checkerArt(piece.king,false);}
     token.dataset.entity='checker-'+piece.id;token.dataset.boardCell=String(index);token.dataset.pieceOwner=String(piece.owner);token.dataset.side=String(piece.side);token.classList.toggle('is-captured',piece.captured);token.setAttribute('aria-label',this.text(descriptor.label));this.localTarget(token,pieceTarget(piece,index));token.toggleAttribute('disabled',!!token.disabled);token.setAttribute('aria-disabled',String(!!token.disabled));token.classList.remove('is-available');token.classList.toggle('is-playable',!token.disabled);const click=token.onclick;token.onclick=event=>{event.stopPropagation();click(event);};
    }
   });
   const ids=new Set(scene.pieces.map(p=>p.id));for(const [id,token]of this.draughtsPieces)if(!ids.has(id)){token.remove();this.draughtsPieces.delete(id);}
  }
  renderCheckerBoard(scene){if(scene.checkerLayout){this.renderDraughts(scene);return;}const surface=this.surfaceMode('grid'),board=this.makeBoard(surface,scene.columns,scene.rows);surface.classList.add('sdk-checkered');this.boardCells(board,scene.columns,scene.rows,(e,index)=>{setText(e,'');this.localTarget(e,{zone:'field',cell:index});e.setAttribute('aria-label','Клетка '+(index+1));});keyed(board.lastChild,scene.pieces,p=>p.id,()=>{const e=node('button','sdk-board-piece');e.type='button';return e;},(e,p)=>{const G=root.PlayroomGameComponents;const signature=JSON.stringify([p.king,p.owner,p.captured]);if(e._pieceSignature!==signature){e._pieceSignature=signature;e.innerHTML=G?G.checkerArt(!!p.king,false):root.PlayroomIcons.icon(p.king?'host':'pieces');}this.placeCell(e,p.cell,scene.columns,scene.rows);e.style.setProperty('--piece-color',this.playerColor(p.owner));e.classList.toggle('is-captured',!!p.captured);e.dataset.entity='checker-'+p.id;this.localTarget(e,{entity:{namespace:'checker',id:String(p.id)},zone:'field',cell:p.cell});e.setAttribute('aria-label',(p.king?'Дамка':'Шашка')+' · игрок '+(p.owner+1));});}
  placeCell(element,cell,columns,rows){element.style.left=(cell%columns+.5)*100/columns+'%';element.style.top=(Math.floor(cell/columns)+.5)*100/rows+'%';}
  sideColor(side){return {green:'var(--color-side-green,#4c8060)',red:'var(--color-side-red,#ce735d)',blue:'var(--color-side-blue,#668fad)',yellow:'var(--color-side-yellow,#cfac4c)'}[side];}
  crossRoutePreview(route,scene){
   const source=this.selectedSource;
   if(this.readonly||!source)return route.emptyPreview;
   if(route.moves!==scene.moves||route.interactions!==scene.interactions){
    route.moves=scene.moves;route.interactions=scene.interactions;
    route.movesByCommand=new Map();route.previews=new Map();
    for(const [order,move] of scene.moves.entries()){
     const key=commandKey(move.command);
     let matches=route.movesByCommand.get(key);
     if(!matches)route.movesByCommand.set(key,matches=[]);
     matches.push({order,move});
    }
   }
   const sourceKey=commandKey(source),previous=route.previews.get(sourceKey);
   if(previous)return previous;
   // Join only this source's authorized interactions to the authored routes.
   // Preserve their order because several dice can reach the same anchor.
   const commands=new Set(this.interactionRows(source,'source').map(item=>commandKey(item.command)));
   const matches=[...commands].flatMap(key=>route.movesByCommand.get(key)||[]).sort((a,b)=>a.order-b.order);
   const byAnchor=new Map(),dots=new Set();
   for(const {move} of matches){
    if(!byAnchor.has(move.anchor))byAnchor.set(move.anchor,move);
    for(const anchor of move.route)dots.add(anchor);
   }
   const preview={byAnchor,dots};
   route.previews.set(sourceKey,preview);
   return preview;
  }
  // Reuse the 0.21 board material and token geometry. The pack supplies every
  // legal destination and route; this component only lays out public pieces.
  renderCrossRoute(scene){
   const surface=this.surfaceMode('cross-route');surface.classList.add('sdk-cross-surface');let board=surface.querySelector('.sdk-cross-route');if(!board){board=node('div','sdk-cross-route');board.append(node('div','sdk-cross-bases'),node('div','sdk-cross-cells'),node('div','sdk-cross-center'),node('div','sdk-cross-pawns'));surface.append(board);}
   const sides=scene.boardSides,geometry=scene.geometry,cells=scene.routeCells;
   const centerKey=sides.join('|'),route=board._crossRoute??={active:new Set(),emptyPreview:{byAnchor:new Map(),dots:new Set()}};
   const {byAnchor,dots}=this.crossRoutePreview(route,scene);
   const sideChanged=route.sideKey!==centerKey;
   const locale=root.PlayroomMessages?.locale,game=this.frame.projection.game,pack=this.frame.pack?.hash;
   // Guest frames deserialize the same topology into fresh objects on every
   // turn. Rebind the board only when its data or label context changes.
   if(sideChanged||!sameRouteData(route.bases,geometry.bases)){
    keyed(board.children[0],geometry.bases,base=>base.owner,()=>{
     const e=node('div','sdk-cross-base'),slots=node('div');
     for(let i=0;i<4;i++)slots.append(node('span'));
     e.append(slots);return e;
    },(e,base)=>{
     e.style.gridColumn=(base.x+1)+'/span '+base.width;e.style.gridRow=(base.y+1)+'/span '+base.height;
     e.style.setProperty('--base',this.sideColor(sides[base.owner]));
     for(let index=0;index<e.firstChild.children.length;index++){
      e.firstChild.children[index].dataset.motionAnchor='base-'+base.owner+'-'+index;
     }
    });
   }
   route.bases=geometry.bases;
   const active=new Set([...byAnchor.keys(),...dots]),dirty=new Set([...route.active,...active]);
   // Selection changes only the previous and current route marks. Keep
   // stationary targets mounted and avoid rebinding them on each selection.
   if(sideChanged||route.locale!==locale||route.game!==game||route.pack!==pack||!sameRouteData(route.cells,cells)){
    route.byId=new Map();
    keyed(board.children[1],cells,cell=>cell.id,()=>{const e=node('button','sdk-cross-cell');e.type='button';return e;},(e,cell,index)=>{
     route.byId.set(cell.id,{e,cell,index});
     const color=cell.side!==undefined?this.sideColor(sides[cell.side]):'',label=this.text(cell.label),old=e._crossCell;
     const finish=cell.kind==='finish',[x,y]=cell.point;
     if(!old||old.finish!==finish||old.x!==x||old.y!==y){
      e.classList.toggle('is-finish',finish);e.style.gridColumn=finish?'':x+1;e.style.gridRow=finish?'':y+1;
      e.style.left=finish?(x+.5)/15*100+'%':'';e.style.top=finish?(y+.5)/15*100+'%':'';
     }
     if(!old||old.color!==color)e.style.background=color;
     if(!old){e.dataset.motionAnchor=cell.id;}
     if(!old||old.index!==index||old.label!==label||old.symbol!==cell.symbol||old.rotation!==cell.rotation)dirty.add(cell.id);
     e._crossCell={index,finish,x,y,color,label,symbol:cell.symbol,rotation:cell.rotation};
    });
   }
   route.cells=cells;route.sideKey=centerKey;route.locale=locale;route.game=game;route.pack=pack;
   for(const id of dirty){
    const entry=route.byId.get(id);if(!entry)continue;
    const {e,cell,index}=entry,move=byAnchor.get(id);
    this.paintCrossCell(e,cell,index,move,dots.has(id));
   }
   route.active=active;
   const center=board.children[2];if(center._crossArt!==centerKey){center._crossArt=centerKey;center.innerHTML='<svg viewBox="0 0 90 90" aria-hidden="true">'+['M0 0 45 45 0 90Z','M0 0 90 0 45 45Z','M90 0 90 90 45 45Z','M0 90 45 45 90 90Z'].map((path,index)=>'<path d="'+path+'" fill="'+this.sideColor(sides[index])+'"/>').join('')+'</svg>';}
   // Selection reuses the authorized pawn list. Only a new list can change
   // the stack offsets; input bindings still follow the selected destination.
   if(route.pawnList!==scene.pawns){
    const occupants=new Map();
    for(const pawn of scene.pawns){
     if(pawn.kind!=='track')continue;
     const group=occupants.get(pawn.anchor)||[];
     group.push(pawn.id);occupants.set(pawn.anchor,group);
    }
    route.placements=scene.pawns.map(pawn=>{
     const group=occupants.get(pawn.anchor),count=group?.length??1;
     const offset=count>1?root.PlayroomTokenLayout?.cell(group.indexOf(pawn.id),count):null;
     const size=pawn.kind==='finish'?3.8:count<=1?5.4:count<=4?4.7:count<=9?2.85:2.1;
     return {count,size,left:(pawn.point[0]+.5+(offset?.x??0))/15*100,top:(pawn.point[1]+.5+(offset?.y??0))/15*100};
    });
    route.pawnList=scene.pawns;
   }
   const reuseBindings=route.pawnInteractions===scene.interactions&&route.pawnCommands===this.allowedCommands&&route.pawnReadonly===this.readonly;
   keyed(board.children[3],scene.pawns,pawn=>pawn.id,()=>{const e=node('button','sdk-cross-pawn sdk-board-piece');e.type='button';e.dataset.sizeRole='token';e.dataset.interactionShape='circle';return e;},(e,pawn,index)=>{
    const id=pawn.owner+'-'+pawn.pawn,move=byAnchor.get(pawn.anchor),isLanding=!!move&&!pawn.friendly;
    if(e._crossEntity?.entity.id!==id)e._crossEntity={entity:{namespace:'token',id}};
    const source=e._crossEntity;
    // A pawn used only as a source keeps its input binding during selection.
    // A pawn covering a landing cell must follow that cell's current drop target.
    if(!reuseBindings||isLanding||e._target!==source||!e._crossSourceOnly||e._crossDirect!==pawn.command){
     const target=isLanding?{zone:'field',index:route.byId.get(pawn.anchor)?.index??-1}:source;
     this.localTarget(e,target);
     e._crossSourceOnly=!isLanding&&!this.interactionRows(source,'target').length;
     e._crossDirect=pawn.command;
     const direct=pawn.command&&this.allowedCommands.has(commandKey(pawn.command))?pawn.command:null;
     if(direct){e.disabled=this.readonly;e.onclick=()=>{if(e._suppressClick){e._suppressClick=false;return;}if(!this.readonly){this.selectedSource=null;this.command(direct);}};}
     e._crossPlayable=!this.readonly&&this.interactionRows(source,'source').length>0;
     e.classList.remove('is-available');e.classList.toggle('is-playable',e._crossPlayable);
     e._crossSelected=undefined;
    }
    const selected=e._crossPlayable&&this.sameTarget(this.selectedSource,source);
    if(e._crossSelected!==selected){
     e.classList.toggle('is-selected',selected);e.setAttribute('aria-pressed',String(selected));e._crossSelected=selected;
    }
    e.classList.toggle('is-finished',pawn.kind==='finish');
    const placement=route.placements[index],old=e._crossPlacement,color=this.sideColor(sides[pawn.owner]);
    if(old!==placement){
     const {count,size,left,top}=placement;
     e.classList.toggle('is-stacked',count>1);e.classList.toggle('is-tiny',count>9);
     if(old?.size!==size)e.style.setProperty('--pawn-size',size+'%');
     if(old?.left!==left)e.style.left=left+'%';
     if(old?.top!==top)e.style.top=top+'%';
     e._crossPlacement=placement;
    }
    const label=this.text(pawn.label);
    if(e._crossLabel!==label){e.setAttribute('aria-label',label);e._crossLabel=label;}
    if(e.dataset.entity!=='token-'+id)e.dataset.entity='token-'+id;
    if(e._crossColor!==color){e.style.setProperty('--pawn',color);e._crossColor=color;}
    const signature=pawn.pawn;if(e._pawnLabel!==signature){e._pawnLabel=signature;e.innerHTML=root.PlayroomComponents.roundTokenArt({value:pawn.pawn+1,profile:'pawn'});}
   });
   route.pawnInteractions=scene.interactions;route.pawnCommands=this.allowedCommands;route.pawnReadonly=this.readonly;
  }
  paintCrossCell(e,cell,index,move,marked){
   this.localTarget(e,{zone:'field',index});
   e.disabled=this.readonly||!move;e.classList.remove('is-available');e.classList.toggle('board-target',!!move);e.classList.toggle('sdk-cross-target',!!move);
   for(const kind of ['move','capture','home'])e.classList.toggle('target-'+kind,move?.targetKind===kind);
   const label=e._crossCell.label+(move?': '+this.commandLabel(move.command):'');
   if(e.getAttribute('aria-label')!==label)e.setAttribute('aria-label',label);
   e.classList.toggle('sdk-cross-safe',cell.symbol==='star');
   const art=cell.symbol||(marked?'dot':''),signature=art+':'+cell.rotation;
   if(e._crossArt===signature)return;
   e._crossArt=signature;
   if(art==='star')e.innerHTML='<svg class="sdk-cross-safe-star" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 4 61 35 95 36 69 56 78 92 50 72 22 92 31 56 5 36 39 35Z" fill="currentColor"/></svg>';
   else if(art==='arrow'){e.innerHTML='<svg class="sdk-cross-start-arrow" viewBox="0 0 100 100" aria-hidden="true"><path d="M18 28 82 50 18 72Z" fill="currentColor"/></svg>';e.firstChild.style.transform='rotate('+cell.rotation*90+'deg)';}
   else if(art==='dot')e.innerHTML='<i class="board-route-dot" aria-hidden="true"></i>';
   else e.replaceChildren();
  }
  dieMarkup(die,frame,{announce=false}={}){
   const faceUrl=this.assetEntry(die.face)?.url,components=root.PlayroomGameComponents;
   const params={value:die.value,frame,packId:this.frame?.projection?.game,faceUrl,
    faceLabel:announce&&die.label?this.text(die.label):undefined};
   const render=options=>components.dieArt(options.value,options);
   return root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('die',params,render):render(params);
  }
  // A host port keeps dice outside field sizing. Faces survive hold/selection
  // updates; permissions are refreshed from the exact current source command.
  // A roll may already have passed the turn. Public lastRolled flags still
  // identify its dice; the final active player does not own that visual event.
  renderDice(scene){
   const port=scene.dicePlacement&&scene.dicePlacement!=='field'?this.targetScope.querySelector('[data-sdk-dice-port]'):null;
   if(this.dicePort!==port){this.releaseDicePort?.();this.dicePort=port;this.releaseDicePort=port?root.PlayroomDOM?.manageChildren(port):null;if(port)port.append(this.dice);else if(this.dice.parentElement!==this.root)this.root.insertBefore(this.dice,this.players);}
   this.dice.classList.toggle('sdk-native-dice',!!port);this.dice.hidden=!scene.dice?.length;
   if(!scene.numberedRoute&&this.dice.classList.contains('sdk-numbered-controls')){this.dice.classList.remove('sdk-numbered-controls');this.dice.replaceChildren();}
   if(!scene.scoreLayout&&this.dice.classList.contains('sdk-score-controls')){this.dice.classList.remove('sdk-score-controls');this.dice.replaceChildren();}
   const buttons=scene.numberedRoute?this.numberedDiceControls(scene):scene.scoreLayout?this.scoreDiceControls(scene):this.dice;
   keyed(buttons,scene.dice||[],(_,index)=>index,()=>{const e=node('button','sdk-die shared-die');e.type='button';return e;},(e,value,index)=>{const die=value!==null&&typeof value==='object'?value:{value},v=die.value,style=scene.diceStyle||'raised',variant=this.resolvedSkin('die'),signature=JSON.stringify([v,style,variant,die.face?.id,this.resourceGeneration]);if(e._dieSignature!==signature){e._dieSignature=signature;e.innerHTML=this.dieMarkup(die,style);}e.classList.toggle('is-held',!!die.held);e.classList.toggle('held',!!die.held);e.classList.toggle('is-used',!!die.used);e.classList.toggle('used',!!die.used);const target={entity:{namespace:'die',id:String(index)},zone:'field',index};this.localTarget(e,target);e.disabled=this.readonly||!this.interactionsAt(target).some(interaction=>(!interaction.source||this.selectedSource&&this.sameTarget(interaction.source,this.selectedSource))&&this.allowedCommands.has(commandKey(interaction.command)));this.bindGestureTarget(e,target);
   e.classList.toggle('is-playable',!e.disabled);
   e.classList.toggle('used',!!die.used&&e.disabled);e.classList.toggle('is-used',!!die.used&&e.disabled);e.dataset.entity='die-'+index;e.dataset.motionLead=die.motion||(die.lastRolled?'roll':'');if(typeof die.held==='boolean')e.dataset.sdkPressed=String(die.held);else delete e.dataset.sdkPressed;e.setAttribute('aria-pressed',String(!!die.held));e.setAttribute('aria-label',this.text(die.label)||'Кубик '+(index+1)+': '+v+(die.held?' · оставлен':''));});
  }
  scoreDiceControls(scene){
   this.dice.classList.add('sdk-score-controls');
   if(!this.scoreDiceRack||!this.dice.contains(this.scoreDiceRack)){
    this.scoreDiceRack=node('div','sdk-score-dice');this.scoreRoll=this.action('',null);this.scoreRoll.className='scene-button sdk-score-roll';this.dice.replaceChildren(this.scoreDiceRack,this.scoreRoll);
   }
   const controls=scene.scoreLayout.controls,command=controls.command;
   setText(this.scoreRoll,this.text(controls.label));this.scoreRoll._command=command;this.scoreRoll.disabled=this.readonly||!command||!this.allowedCommands.has(commandKey(command));
   this.scoreRoll.hidden=controls.public||!!this.frame.history?.reviewing;this.dice.classList.toggle('is-reviewing',!!this.frame.history?.reviewing);this.dice.classList.toggle('is-public',controls.public);
   return this.scoreDiceRack;
  }
  // A category sheet uses public values and exact commands from the pack.
  // Summaries are authored rows, never totals recomputed from the DOM.
  renderScoreSheet(scene,frame){
   const surface=this.surfaceMode('score-sheet');surface.classList.add('sdk-score-board');surface.dataset.sceneScroll='';let table=surface.firstElementChild;
   if(!table){
    const params={head:'<tr></tr>',body:'',foot:'<tr></tr>',className:'sdk-score-sheet',packId:frame.projection.game},template=document.createElement('template');
    template.innerHTML=root.TabletopUI?.helpers?.assetArt?root.TabletopUI.helpers.assetArt('score-table',params,p=>root.PlayroomGameComponents.scoreTable(p)):root.PlayroomGameComponents.scoreTable(params);
    table=template.content.firstElementChild;surface.append(table);
    // A column highlight is local UI state. Keep the ledger and its native
    // actions mounted while switching the highlight on the existing cells.
    table.addEventListener('click',event=>{
     const cell=event.target.closest('[data-score-player]');
     if(!cell||event.target.closest('[data-sdk-command]'))return;
     const player=cell.dataset.scorePlayer;
     this.scoreSelectedPlayer=Number(player);
     for(const item of table.querySelectorAll('[data-score-player]')){
      const active=item.dataset.scorePlayer===player;
      item.classList.toggle('selected-player',active);
      if(item.hasAttribute('aria-selected'))item.setAttribute('aria-selected',String(active));
     }
    });
   }
   const layout=scene.scoreLayout,count=scene.players.length,selected=Number.isInteger(this.scoreSelectedPlayer)&&this.scoreSelectedPlayer<count?this.scoreSelectedPlayer:frame.projection.turn;
   table.style.setProperty('--players',count);
   const select=(element,player)=>{element.dataset.scorePlayer=String(player);element.classList.toggle('selected-player',player===selected);};
   const head=table.tHead.firstChild;
   if(!head.firstChild){const title=node('th');title.scope='col';head.append(title);}setText(head.firstChild,this.text(layout.categoryLabel));
   while(head.children.length>count+1)head.lastChild.remove();
   for(let player=0;player<count;player++){
    let th=head.children[player+1];if(!th){th=node('th');th.scope='col';th.tabIndex=0;head.append(th);th.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();th.click();}};}
    select(th,player);th.setAttribute('aria-selected',String(player===selected));
    // Identities belong to the host UI context, outside the rules/presentation VM.
    // Ignore score changes when deciding whether native avatar art changed.
    const person=frame.participants?.[player]||{name:String(player+1)},markup=root.TabletopUI?.helpers?.avatar?.(person,player),signature=markup||String(player);
    if(th._identity!==signature){th._identity=signature;if(markup)th.innerHTML=markup;else{const avatar=node('span','avatar',String(player+1));avatar.style.background=this.playerColor(player);th.replaceChildren(avatar);}}
   }
   const rows=scene.rows.flatMap(row=>[{...row,kind:'category'},...layout.summaries.filter(summary=>summary.afterRow===row.id).map(summary=>({...summary,kind:'summary'}))]);
   keyed(table.tBodies[0],rows,row=>row.kind+'-'+row.id,()=>{const tr=node('tr'),title=node('th');title.scope='row';tr.append(title);return tr;},(tr,row)=>{
    tr.dataset.scoreRow=row.id;tr.classList.toggle('sdk-score-summary',row.kind==='summary');setText(tr.firstChild,this.text(row.label));while(tr.children.length>count+1)tr.lastChild.remove();
    for(let player=0;player<count;player++){
     let td=tr.children[player+1];if(!td){td=node('td');tr.append(td);}select(td,player);
     const cell=row.kind==='category'?row.cells[player]:{value:row.values[player]},command=cell.command,available=!this.readonly&&cell.value===null&&command&&this.allowedCommands.has(commandKey(command));
     if(row.kind==='summary')td.dataset.scoreTotal=row.id;else delete td.dataset.scoreTotal;
     if(available){let button=td.firstElementChild;if(!button?.hasAttribute('data-sdk-command')){button=this.action('',null);td.replaceChildren(button);}button._command=command;button.disabled=false;setText(button,cell.preview);button.setAttribute('aria-label',this.text(cell.label));}
     else setText(td,cell.value??'—');
    }
   });
   const foot=table.tFoot;if(!foot.firstChild)foot.append(node('tr'));const total=foot.firstChild;if(!total.firstChild){const title=node('th');title.scope='row';total.append(title);}setText(total.firstChild,this.text(layout.total.label));while(total.children.length>count+1)total.lastChild.remove();
   for(let player=0;player<count;player++){let td=total.children[player+1];if(!td){td=node('td');total.append(td);}select(td,player);td.dataset.scoreTotal=layout.total.id;setText(td,layout.total.values[player]);}
  }
  // Parameter selection is local UI state, scoped to one authored revision.
  // It filters exact commands; it never changes a die or computes a legal move.
  prepareNumberedSelection(scene,frame){
   const route=scene.numberedRoute;if(!route)return;
   const key=JSON.stringify([frame.projection.game,frame.projection.viewer,frame.projection.revision,route.adjustment.active]);
   if(this.numberedChoiceKey!==key){this.numberedChoiceKey=key;this.numberedAdjustment=route.adjustment.active?null:0;}
   this.selectedSource=this.readonly?null:route.source;
  }
  routeCommandVisible(command){
   if(!this.fleetPlacementVisible(command))return false;
   const adjustment=this.sceneData?.numberedRoute?.adjustment;
   return !adjustment||!Object.hasOwn(command,adjustment.parameter)||command[adjustment.parameter]===this.numberedAdjustment;
  }
  numberedDiceControls(scene){
   const route=scene.numberedRoute;this.dice.classList.add('sdk-numbered-controls');
   if(!this.numberedDiceRack||!this.dice.contains(this.numberedDiceRack)){
    this.numberedSwap=node('div','sdk-numbered-swap');this.numberedSwap.setAttribute('role','status');this.numberedSwap.setAttribute('aria-live','polite');
    this.numberedBottom=node('div','sdk-numbered-bottom');this.numberedEntries=node('div','sdk-numbered-entry-dock');this.numberedDiceRack=node('div','sdk-numbered-dice');this.numberedBottom.append(this.numberedEntries,this.numberedDiceRack);
    this.numberedAdjust=node('div','sdk-numbered-adjust');this.numberedAdjust.setAttribute('role','group');this.dice.replaceChildren(this.numberedSwap,this.numberedBottom,this.numberedAdjust);
   }
   const summary=this.text(route.swapSummary),signature=JSON.stringify([summary,route.swapLabel]);
   if(this.numberedSwap._signature!==signature){this.numberedSwap._signature=signature;this.numberedSwap.replaceChildren();if(summary){const caption=node('span');caption.innerHTML=root.PlayroomIcons.icon('refresh');caption.append(document.createTextNode(summary));this.numberedSwap.append(caption);}this.numberedSwap.setAttribute('aria-label',(route.swapLabel||[]).map(label=>this.text(label)).join('; '));}
   // Empty entry slots remain mounted so zero and swap-back routes always
   // have a stable off-board anchor, even after their pawn has left.
   keyed(this.numberedEntries,Array.from({length:route.entrySlots},(_,owner)=>owner),owner=>owner,()=>node('span','sdk-numbered-entry'),(entry,owner)=>{entry.dataset.motionAnchor='entry-'+owner;});
   this.numberedAdjust.setAttribute('aria-label',this.text(route.adjustment.label));this.numberedAdjust.style.visibility=route.adjustment.active&&!this.readonly?'visible':'hidden';this.numberedAdjust.setAttribute('aria-hidden',String(!route.adjustment.active||this.readonly));
   keyed(this.numberedAdjust,route.adjustment.options,option=>option.value,()=>{const e=node('button');e.type='button';return e;},(e,option)=>{setText(e,this.text(option.label));e.disabled=this.readonly||!(scene.interactions||[]).some(i=>i.command[route.adjustment.parameter]===option.value&&this.allowedCommands.has(commandKey(i.command)));e.setAttribute('aria-pressed',String(this.numberedAdjustment===option.value));e.dataset.adjustValue=String(option.value);e.onclick=()=>{if(e.disabled)return;this.numberedAdjustment=option.value;this.renderSemantic(this.sceneData,this.frame);};});
   return this.numberedDiceRack;
  }
  numberedPoint(cell,columns){const row=Math.floor((Math.max(1,cell)-1)/columns),col=row%2?columns-1-(Math.max(1,cell)-1)%columns:(Math.max(1,cell)-1)%columns;return {x:(col+.5)*100/columns,y:100-(row+.5)*100/columns};}
  renderNumberedRoute(scene){
   const surface=this.surfaceMode('numbered-route');surface.classList.add('sdk-numbered-surface');let wrap=surface.firstElementChild;
   if(!wrap){wrap=node('div','sdk-numbered-wrap');const board=node('div','sdk-numbered-board');board.append(node('div','sdk-numbered-cells'),node('div','sdk-numbered-links'),node('div','sdk-numbered-pawns'));wrap.append(board);surface.append(wrap);}
   const route=scene.numberedRoute,board=wrap.firstChild,columns=scene.columns,moves=this.readonly?[]:(scene.moves||[]).filter(move=>this.routeCommandVisible(move.command)&&this.allowedCommands.has(commandKey(move.command))),marks=new Set(moves.flatMap(move=>move.route));board.style.setProperty('--board-size',columns);board.setAttribute('role','group');board.setAttribute('aria-label',this.text(route.label));
   keyed(board.children[0],route.cells,cell=>cell.cell,()=>{const e=node('button','sdk-numbered-cell');e.type='button';return e;},(e,cell)=>{
    const point=this.numberedPoint(cell.cell,columns),target=moves.find(move=>move.landing===cell.cell),link=route.links.find(link=>link.from===cell.cell),kind=link?.kind==='ladder'?'home':link?'capture':'move';
    this.localTarget(e,{zone:'field',cell:cell.cell});e.disabled=this.readonly||!target;e.dataset.motionAnchor='cell-'+cell.cell;e.style.gridColumn=Math.round(point.x*columns/100+.5);e.style.gridRow=Math.round(point.y*columns/100+.5);e.classList.remove('is-available');e.classList.toggle('is-tinted',(Math.floor((cell.cell-1)/columns)+Number(e.style.gridColumn)-1)%2===1);e.classList.toggle('is-finish',cell.cell===scene.finish);e.classList.toggle('is-route',marks.has(cell.cell));e.classList.toggle('is-swap',(scene.swaps||[]).some(s=>s.from===cell.cell||s.to===cell.cell));e.classList.toggle('board-target',!!target);for(const k of ['home','capture','move'])e.classList.toggle('target-'+k,!!target&&kind===k);e.setAttribute('aria-label',this.text(cell.label));e.style.background=cell.special?.color||'';
    const art=JSON.stringify([cell.cell===scene.finish,cell.special,marks.has(cell.cell)]);if(e._art!==art){e._art=art;e.replaceChildren();if(cell.special){const icon=node('i','sdk-numbered-special');icon.innerHTML=root.PlayroomIcons.icon(cell.special.icon);e.append(icon);}else{e.append(node('span',null,cell.cell===scene.finish?'★':String(cell.cell)));if(marks.has(cell.cell))e.append(node('i','board-route-dot'));}}
   });
   this.renderNumberedLinks(board.children[1],route.links,columns);
   const placed=scene.positions.filter(p=>p.cell>0);this.renderNumberedPawns(board.children[2],placed,scene,false);
   if(this.numberedEntries)for(const [owner,entry]of [...this.numberedEntries.children].entries())this.renderNumberedPawns(entry,scene.positions.filter(p=>p.player===owner&&p.cell===0),scene,true);
  }
  renderNumberedPawns(container,positions,scene,entry){
   keyed(container,positions,p=>p.id,()=>{const e=node('span','sdk-numbered-pawn sdk-board-piece');e.setAttribute('role','img');e.dataset.sizeRole='token';e.dataset.interactionShape='circle';return e;},(e,p)=>{
    const same=scene.positions.filter(other=>other.cell===p.cell),index=same.findIndex(other=>other.id===p.id),offset=root.PlayroomTokenLayout?.cell(index,same.length)||{x:0,y:0},spread=same.length>1?88/scene.columns:0;
    this.localTarget(e,{entity:{namespace:'token',id:String(p.player)}});e.toggleAttribute('disabled',!!e.disabled);e.setAttribute('aria-disabled',String(!!e.disabled));e.dataset.entity=p.id;e.dataset.swapRole=p.swapRole;e.classList.remove('is-available','is-selected');e.classList.toggle('is-selected',!this.readonly&&this.sameTarget(scene.numberedRoute.source,e._target)&&(scene.moves||[]).some(move=>this.routeCommandVisible(move.command)));e.classList.toggle('is-entry',entry);e.classList.toggle('is-crowded',same.length>1);e.setAttribute('aria-label',this.text(p.label));e.style.setProperty('--round-token-fill',this.playerColor(p.player));e.style.setProperty('--round-token-side','color-mix(in srgb,'+this.playerColor(p.player)+' 65%,black)');e.style.setProperty('--round-token-mark','#fffdf4');e.style.setProperty('--round-token-rim','#fff8e9');
    if(!entry){e.style.left=p.point.x+offset.x*spread+'%';e.style.top=p.point.y+offset.y*spread+'%';}else{e.style.left='';e.style.top='';}
    if(e._value!==p.value){e._value=p.value;e.innerHTML=root.PlayroomComponents.roundTokenArt({value:p.value,profile:'pawn'});}
   });
  }
  // Original layered vector artwork: white underprint, rails/rungs and snake
  // body/head. Links are sorted by their upper cell, keeping overlap stable.
  renderNumberedLinks(container,links,columns){
   const key=JSON.stringify([links,columns]);if(container._art===key)return;container._art=key;
   const art=[...links].sort((a,b)=>Math.max(b.from,b.to)-Math.max(a.from,a.to)).map(link=>{
    const from=this.numberedPoint(link.from,columns),to=this.numberedPoint(link.to,columns);
    if(link.kind==='ladder'){const dx=to.x-from.x,dy=to.y-from.y,len=Math.hypot(dx,dy)||1,nx=-dy/len*1.25,ny=dx/len*1.25,steps=Math.max(3,Math.floor(len/3)),ladder='<g fill="none" stroke="#d3ad43" stroke-width=".8" stroke-linecap="round"><path d="M'+(from.x+nx)+' '+(from.y+ny)+'L'+(to.x+nx)+' '+(to.y+ny)+'M'+(from.x-nx)+' '+(from.y-ny)+'L'+(to.x-nx)+' '+(to.y-ny)+'"/>'+Array.from({length:steps},(_,i)=>{const t=(i+.5)/steps,x=from.x+dx*t,y=from.y+dy*t;return '<path d="M'+(x+nx)+' '+(y+ny)+'L'+(x-nx)+' '+(y-ny)+'"/>';}).join('')+'</g>';return '<g data-link-kind="ladder">'+ladder.replace('#d3ad43','#ffffff').replace('stroke-width=".8"','stroke-width="1.04"')+ladder+'</g>';}
    const midY=(from.y+to.y)/2,body='<path d="M'+from.x+' '+from.y+'C'+(from.x+9)+' '+midY+','+(to.x-9)+' '+midY+','+to.x+' '+to.y+'" fill="none" stroke="#cd876e" stroke-width="2.4" stroke-linecap="round"/>';
    return '<g data-link-kind="snake">'+body.replace('#cd876e','#ffffff').replace('2.4','2.64')+body+'<circle cx="'+from.x+'" cy="'+from.y+'" r="1.92" fill="#ffffff"/><circle cx="'+from.x+'" cy="'+from.y+'" r="1.8" fill="#cd876e"/><circle cx="'+(from.x-.5)+'" cy="'+(from.y-.4)+'" r=".28" fill="#4b5945"/><circle cx="'+(from.x+.5)+'" cy="'+(from.y-.4)+'" r=".28" fill="#4b5945"/></g>';
   }).join('');container.innerHTML='<svg viewBox="0 0 100 100" aria-hidden="true">'+art+'</svg>';
  }
  playerColor(player){return root.TabletopUI?.helpers?.playerColor?.(player)||root.PlayroomPlayerPalette?.[Math.abs(Number(player)||0)%12]||['#4C8060','#CE735D','#668FAD','#CFAC4C','#8B6FA8','#729D98','#AA844B','#8C98A4','#A86E8F','#649A5C','#8F794C','#566F99'][Math.abs(Number(player)||0)%12];}
  fleetPlacementVisible(command){
   const layout=this.sceneData?.fleetLayout;if(!layout)return true;
   if(this.fleetPlacementLayout!==layout){this.fleetPlacementLayout=layout;this.fleetPlacementIndex=new Map(layout.placements.map(p=>[commandKey(p.command),p]));}const placement=this.fleetPlacementIndex.get(commandKey(command));if(!placement)return true;
   const ship=this.selectedSource?.entity&&layout.boards.flatMap(b=>b.ships).find(s=>this.sameTarget({entity:s.ref},this.selectedSource));
   return placement.vertical===(ship?ship.vertical:layout.orientation);
  }
  selectFleetSource(source){if(this.readonly)return;this.selectedSource=source;this.hideChoicePanel();this.renderSemantic(this.sceneData,this.frame);this.applyPreviewMarkers();}
  releaseFleetIndicator(e){for(const key of ['sdkTarget','dragPiece','dragShape','dragSegment','dropPiece','action'])delete e.dataset[key];e._target=null;e.onclick=null;e.onkeydown=null;e.removeAttribute('role');e.removeAttribute('tabindex');e.removeAttribute('aria-pressed');e.removeAttribute('aria-disabled');e.removeAttribute('disabled');e.classList.remove('is-selected','is-available');}
  renderNaval(scene){
   const l=scene.fleetLayout,surface=this.surfaceMode('naval');surface.classList.add('sdk-naval-fields','shared-page-deck');surface.classList.remove('is-flipped');this.cancelControl.hidden=true;
   const scope=this.frame.projection.game+':'+this.frame.projection.viewer;if(this.fleetScope!==scope){this.fleetScope=scope;this.fleetManual=null;this.fleetFollow=true;}
   // Native hosts own saved view preferences; standalone viewers keep local choices.
   if(this.frame.ui?.viewState)this.fleetManual=this.frame.ui.viewState.fleet==='own'?l.base:this.frame.ui.viewState.fleet==='enemy'?1-l.base:null;if(this.frame.ui?.preferences)this.fleetFollow=this.frame.ui.preferences.followOpponent!=='off';
   const selectedExists=this.selectedSource&&l.placements.some(p=>this.sameTarget(p.source,this.selectedSource));
   if(scene.setup&&!selectedExists){const item=l.boards.find(b=>b.player===l.setupPlayer)?.indicators.find(i=>i.value>0);this.selectedSource=item?{zone:'inventory-'+l.setupPlayer,index:item.size}:null;}
   // Replay can recover the attacker from the authorized shot at its checkpoint.
   // Paused play and hotseat handoff freeze input without selecting a checkpoint.
   const history=this.frame.history;
   const historyShot=history?.reviewing&&Number.isSafeInteger(history.index)?this.frame.events?.findLast(event=>event.revision===this.frame.projection.revision&&event.presentation?.type==='fire'):null;
   const followedTurn=this.frame.ui?.presentationTurn??historyShot?.player;
   const followedBoard=followedTurn===0||followedTurn===1?1-followedTurn:l.preferredPlayer;
   const shown=scene.setup?l.base:this.fleetManual??(this.fleetFollow?followedBoard:1-l.base);
   surface.style.setProperty('--page-index',shown===l.base?0:1);surface.dataset.slideKey=String(shown===l.base?0:1);
   const indicatorNodes=new Set();
   const bindIndicators=(port,board)=>{const items=board.indicators.map(indicator=>({...indicator,label:this.text(indicator.label)})),signature=JSON.stringify(items);if(port._fleetSignature!==signature){port._fleetSignature=signature;port.innerHTML=root.TabletopUI?.helpers?.indicators?root.TabletopUI.helpers.indicators(items):'<span class="player-indicators">'+items.map(i=>'<span class="player-indicator fleet-indicator">'+root.PlayroomGameComponents.shipSilhouette(i.size)+'<b>'+i.value+'</b></span>').join('')+'</span>';}
    [...port.querySelectorAll('.fleet-indicator')].forEach((e,index)=>{const item=items[index],source={zone:'inventory-'+board.player,index:item.size};e.setAttribute('aria-label',this.text(item.label)+': '+item.value);e.classList.toggle('is-complete',!!item.complete);e.classList.toggle('is-empty',item.value===0);
     if(board.player===l.setupPlayer&&item.value>0){indicatorNodes.add(e);this.localTarget(e,source);e.toggleAttribute('disabled',!!e.disabled);e.setAttribute('role','button');e.tabIndex=0;e.setAttribute('aria-disabled',String(!!e.disabled));e.dataset.dragShape=item.size+':'+(l.orientation?'v':'h');e.dataset.dragSegment=String(Math.floor(item.size/2));e.onclick=event=>{event.stopPropagation();if(!e.disabled)this.selectFleetSource(source);};e.onkeydown=event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();e.click();}};e.classList.remove('is-available');}
    });
   };
   keyed(surface,scene.setup?l.boards.filter(b=>b.player===l.base):l.boards,b=>b.player,()=>{const panel=node('section','sdk-naval-panel shared-page-panel'),indicators=node('div','sdk-naval-indicators'),board=node('div','sdk-naval-grid');board.setAttribute('role','grid');board.dataset.dragBoundary='';board.dataset.gridColumns='10';board.append(node('div','sdk-naval-cells'),node('div','sdk-naval-ships'));panel.append(indicators,board);return panel;},(panel,b)=>{
    const active=b.player===shown;panel.style.setProperty('--page-number',b.player===l.base?0:1);panel.classList.toggle('is-active',active);panel.inert=!active;panel.setAttribute('aria-hidden',String(!active));panel.setAttribute('aria-label',this.text(b.player===l.base?l.controls.ownLabel:l.controls.enemyLabel));panel.dataset.fleetPlayer=String(b.player);bindIndicators(panel.firstChild,b);
    const board=panel.lastChild;board.setAttribute('aria-label',this.text(b.label));board.dataset.zone='fleet-'+b.player;
    const placements=active&&!this.readonly&&b.player===l.setupPlayer&&this.selectedSource?l.placements.filter(p=>this.sameTarget(p.source,this.selectedSource)&&this.fleetPlacementVisible(p.command)&&this.allowedCommands.has(commandKey(p.command))):[];
    keyed(board.firstChild,b.cells,c=>c.cell,()=>{const cell=node('div','sdk-naval-cell');cell.setAttribute('role','gridcell');cell.dataset.dragUnit='';cell.append(node('button'),node('span'));cell.firstChild.type='button';cell.lastChild.setAttribute('aria-hidden','true');return cell;},(cell,c)=>{
     const ship=b.ships.find(s=>s.cells.includes(c.cell)),placement=placements.find(p=>p.cell===c.cell),target={zone:'fleet-'+b.player,cell:c.cell},fire=active&&this.interactionRows(target,'target').find(i=>!i.source&&this.allowedCommands.has(commandKey(i.command))),source=ship&&b.player===l.setupPlayer?{entity:ship.ref}:null,button=cell.firstChild;
     cell.dataset.gridIndex=String(c.cell);cell.setAttribute('aria-label',this.text(c.label));
     for(const [name,on]of Object.entries({ship:!!ship,vertical:!!ship?.vertical,horizontal:!!ship&&!ship.vertical,'ship-start':!!ship&&ship.cells[0]===c.cell,'ship-end':!!ship&&ship.cells.at(-1)===c.cell,hit:c.shot==='hit',miss:c.shot==='miss'}))cell.classList.toggle(name,on);
     const marker=cell.lastChild;
     // A committed shot hides the input button. Animate the visible mark.
     if(c.shot)Object.assign(marker.dataset,{motionEffect:'pulse',motionTrigger:'fire',motionKey:'cell',motionValue:String(c.cell)});
     else delete marker.dataset.motionEffect;
     setText(marker,c.shot==='hit'?'✹':c.shot==='miss'?'×':'');
     this.localTarget(cell,target);cell.disabled=!active||this.readonly||!placement&&!fire;cell.toggleAttribute('disabled',!!cell.disabled);cell.classList.remove('is-available');if(!placement){delete cell.dataset.dropPiece;delete cell.dataset.action;cell._sdkGestureTarget=false;}cell.onclick=null;
     this.localTarget(button,source||target);button.disabled=!active||this.readonly||!(source||placement||fire);button.hidden=!source&&!placement&&!fire;button.setAttribute('aria-label',this.text(source?ship.label:fire?this.commandLabel(fire.command):placement?this.commandLabel(placement.command):c.label));button.classList.remove('is-available');
     if(source){button.onclick=event=>{event.stopPropagation();if(!button.disabled)this.selectFleetSource(source);};button.dataset.dragShape=ship.cells.length+':'+(ship.vertical?'v':'h');button.dataset.dragSegment=String(ship.cells.indexOf(c.cell));if(ship.remove)button.dataset.dragOutsideAction=commandKey(ship.remove);else delete button.dataset.dragOutsideAction;}
     else{for(const key of ['dragShape','dragSegment','dragOutsideAction'])delete button.dataset[key];const click=button.onclick;button.onclick=event=>{event.stopPropagation();click(event);};}
    });
    // A single passive physical anchor per ship avoids duplicate motion IDs on segments.
    keyed(board.lastChild,b.ships,s=>s.ref.id,()=>node('span','sdk-naval-ship-selection'),(e,s)=>{const selected=this.selectedSource&&this.sameTarget({entity:s.ref},this.selectedSource);e.dataset.entity='ship-'+s.ref.id;e.classList.toggle('is-selected',!!selected);e.style.left=(s.cells[0]%10)*10+'%';e.style.top=Math.floor(s.cells[0]/10)*10+'%';e.style.width=(s.vertical?1:s.cells.length)*10+'%';e.style.height=(s.vertical?s.cells.length:1)*10+'%';});
   });
   // The same inventory remains usable on the normal native player card.
   for(const b of l.boards){const panel=this.targetScope.querySelector('.player-panel[data-player-index="'+b.player+'"] .player-indicators');if(panel){const wrapper={querySelectorAll:selector=>panel.querySelectorAll(selector),_fleetSignature:JSON.stringify(b.indicators)};bindIndicators(wrapper,b);}}
   for(const old of this.fleetIndicatorNodes||[])if(!indicatorNodes.has(old))this.releaseFleetIndicator(old);this.fleetIndicatorNodes=indicatorNodes;
   this.renderNavalControls(scene,shown);
  }
  renderNavalControls(scene,shown){
   const l=scene.fleetLayout,port=this.targetScope.querySelector('[data-sdk-fleet-controls]')||this.root;
   if(this.fleetControlPort!==port){this.releaseFleetControlPort?.();this.fleetControlPort=port;this.releaseFleetControlPort=port!==this.root?root.PlayroomDOM?.manageChildren(port):null;}
   this.fleetControls??=node('div','sdk-naval-controls');if(this.fleetControls.parentElement!==port)port.append(this.fleetControls);
   const phase=scene.setup?'setup':'battle';if(this.fleetControls.dataset.phase!==phase){this.fleetControls.dataset.phase=phase;this.fleetControls.replaceChildren();}
   if(scene.setup){this.fleetControls.className='sdk-naval-controls shared-action-row';const ship=this.selectedSource?.entity&&l.boards.flatMap(b=>b.ships).find(s=>this.sameTarget({entity:s.ref},this.selectedSource)),controls=ship?[{key:'rotate',label:l.controls.rotateLabel,icon:'rotate',command:ship.rotate},{key:'remove',label:l.controls.removeLabel,icon:'trash',command:ship.remove}]:[{key:'orient',label:l.controls.orient.label,text:l.orientation?'↕':'↔',command:l.controls.orient.command}];controls.push({key:'auto',...l.controls.auto});if(l.controls.ready.command)controls.push({key:'ready',...l.controls.ready});
    keyed(this.fleetControls,controls,c=>c.key,()=>{const b=node('button','scene-button');b.type='button';return b;},(b,c)=>{const signature=JSON.stringify([c.label,c.icon,c.text]);if(b._signature!==signature){b._signature=signature;b.innerHTML=c.icon?(c.icon==='rotate'?'↻':root.PlayroomIcons.icon(c.icon)):'';if(!c.icon)b.textContent=c.text||this.text(c.label);}b.setAttribute('aria-label',this.text(c.label));b.dataset.fleetControl=c.key;b._command=c.command;b.disabled=this.readonly||!c.command||!this.allowedCommands.has(commandKey(c.command));b.onclick=()=>{if(b.disabled)return;if(c.key==='remove')this.selectedSource=null;this.command(c.command);};});
   }else{
    this.fleetControls.className='sdk-naval-controls shared-board-tabs';let tabs=this.fleetControls.firstChild;if(!tabs){const template=node('div');template.innerHTML=root.PlayroomGameComponents.actionSelector({key:'fleet',label:this.text(l.controls.ownLabel)+' / '+this.text(l.controls.enemyLabel),value:'enemy',choices:[{value:'own',label:this.text(l.controls.ownLabel)},{value:'enemy',label:this.text(l.controls.enemyLabel)}]});tabs=template.firstChild;this.fleetControls.append(tabs,node('button','scene-button'));}
    tabs.style.setProperty('--page-index',shown===l.base?0:1);[...tabs.children].forEach((b,index)=>{b.setAttribute('aria-pressed',String(shown===(index?1-l.base:l.base)));b.dataset.viewLayout='stable';b.onclick=this.frame.ui?.viewState?null:event=>{event.stopPropagation();this.fleetManual=index?1-l.base:l.base;this.renderSemantic(this.sceneData,this.frame);};});const follow=this.fleetControls.lastChild;follow.type='button';follow.innerHTML=root.PlayroomIcons.icon('eye');follow.setAttribute('aria-label',this.text(l.controls.followLabel));follow.setAttribute('aria-pressed',String(this.fleetManual===null&&this.fleetFollow));follow.dataset.viewPreference='followOpponent';follow.dataset.viewValue=this.fleetManual!==null||!this.fleetFollow?'on':'off';follow.onclick=this.frame.ui?.preferences?null:()=>{this.fleetFollow=!!(this.fleetManual!==null||!this.fleetFollow);this.fleetManual=null;this.renderSemantic(this.sceneData,this.frame);};
   }
  }
  renderFleets(scene){if(scene.fleetLayout){this.renderNaval(scene);return;}const surface=this.surfaceMode('fleets');surface.classList.add('sdk-fleets');keyed(surface,scene.fleets,f=>f.player,()=>{const section=node('section','sdk-fleet');section.append(node('h3'),node('div','sdk-fleet-indicators'));return section;},(section,fleet)=>{section.dataset.zone='fleet-'+fleet.player;setText(section.firstChild,'Игрок '+(fleet.player+1)+(scene.ready?.[fleet.player]?' · готов':''));const board=this.makeBoard(section,scene.columns,scene.rows),ships=new Set((fleet.ships||[]).flat().filter(Number.isInteger)),shots=scene.shots?.[fleet.player]||[],marks=scene.marks?.[fleet.player]||[];this.boardCells(board,scene.columns,scene.rows,(e,cell)=>{e.classList.toggle('is-ship',ships.has(cell));const shot=Array.isArray(shots)?shots.includes(cell):!!shots[cell],mark=Array.isArray(marks)?marks.includes(cell):!!marks[cell];e.classList.toggle('is-shot',shot);e.classList.toggle('is-hit',mark);setText(e,mark?'×':shot?'·':'');this.localTarget(e,{zone:'fleet-'+fleet.player,cell});e.setAttribute('aria-label','Игрок '+(fleet.player+1)+', '+(cell%scene.columns+1)+':'+(Math.floor(cell/scene.columns)+1)+(ships.has(cell)?' корабль':'')+(mark?' попадание':shot?' промах':''));});keyed(board.lastChild,(scene.objects||[]).filter(o=>o.zone==='fleet-'+fleet.player&&o.ref?.namespace==='ship'),o=>o.ref.id,()=>{const e=node('button','sdk-ship-piece');e.type='button';return e;},(e,o)=>{const columns=o.cells.map(c=>c%scene.columns),rows=o.cells.map(c=>Math.floor(c/scene.columns)),x=Math.min(...columns),y=Math.min(...rows),w=Math.max(...columns)-x+1,h=Math.max(...rows)-y+1;e.style.left=x*100/scene.columns+'%';e.style.top=y*100/scene.rows+'%';e.style.width=w*100/scene.columns+'%';e.style.height=h*100/scene.rows+'%';e.dataset.entity='ship-'+o.ref.id;this.localTarget(e,{entity:o.ref,zone:o.zone});e.setAttribute('aria-label','Корабль из '+o.cells.length+' клеток');});keyed(section.children[1],fleet.indicators||[],i=>i.id,()=>{const e=node('button','sdk-fleet-indicator');e.type='button';return e;},(e,item)=>{e.innerHTML=root.PlayroomGameComponents?.shipSilhouette(item.size)||root.PlayroomIcons.icon('ship');e.append(document.createTextNode(' '+item.value));e.setAttribute('aria-label',this.text(item.label)+': '+item.value);this.localTarget(e,{zone:'inventory-'+fleet.player,index:item.size});});});}
  renderRoute(scene){const surface=this.surfaceMode('route');surface.classList.add('sdk-route');surface.dataset.routeKind=scene.finish?'numbered':'loop';const geometry=scene.geometry||{},columns=scene.columns||geometry.columns||15,rows=scene.columns||geometry.rows||15,board=this.makeBoard(surface,columns,rows);this.boardCells(board,columns,rows,(e,index)=>{const n=scene.finish?((rows-1-Math.floor(index/columns))%2?columns-(index%columns):index%columns+1)+(rows-1-Math.floor(index/columns))*columns:null;if(!e._routeLabel){e._routeLabel=node('span','sdk-route-number');e.replaceChildren(e._routeLabel);}setText(e._routeLabel,n===null?'':n);const home=(geometry.anchors||[]).find(a=>a.owner!==undefined&&a.id?.startsWith('home-')&&a.point[0]===index%columns&&a.point[1]===Math.floor(index/columns));e.style.background=home?'color-mix(in srgb,'+this.playerColor(home.owner)+',var(--color-surface-panel) 55%)':'';const special=scene.special?.[n],kind=typeof special==='string'?special:special?.kind||special?.type;if(e._routeKind!==kind){e._routeKind=kind;e.querySelector('.sdk-route-effect')?.remove();if(kind){const icon=node('span','sdk-route-effect');icon.innerHTML=root.PlayroomIcons.icon({adjust:'adjustDie',less:'lessDie',skip:'skipTurn',shield:'shield',second:'secondDie'}[kind]||'hint');e.append(icon);}}this.localTarget(e,{zone:'field',cell:n??index});e.classList.toggle('is-route',!scene.finish&&(geometry.path||geometry.route||[]).some(p=>(p.point||p)[0]===index%columns&&(p.point||p)[1]===Math.floor(index/columns)));});let bases=board.querySelector('.sdk-route-bases');if(!bases){bases=node('div','sdk-route-bases');board.insertBefore(bases,board.lastChild);}keyed(bases,geometry.bases||[],b=>b.owner,()=>node('div','sdk-route-base'),(e,b)=>{e.style.left=b.x*100/columns+'%';e.style.top=b.y*100/rows+'%';e.style.width=b.width*100/columns+'%';e.style.height=b.height*100/rows+'%';e.style.setProperty('--base-color',this.playerColor(b.owner));});const pieces=scene.positions||scene.pawns||[];keyed(board.lastChild,pieces,p=>p.id,()=>{const e=node('button','sdk-board-piece sdk-pawn');e.type='button';return e;},(e,p)=>{const owner=p.owner??p.player,point=p.point;this.paintPawn(e,owner);if(Array.isArray(point)){e.style.left=(point[0]+.5)*100/columns+'%';e.style.top=(point[1]+.5)*100/rows+'%';}else if(point){e.style.left=point.x+'%';e.style.top=point.y+'%';}else this.placeCell(e,p.cell,columns,rows);const ref=(scene.objects||[]).find(o=>o.owner===owner&&(p.pawn===undefined||o.ref.id.endsWith('-'+p.pawn)))?.ref||{namespace:'token',id:String(owner)};e.dataset.entity=ref.namespace+'-'+ref.id;this.localTarget(e,{entity:ref,zone:'field',cell:p.cell??(Array.isArray(point)?Math.round(point[1])*columns+Math.round(point[0]):undefined)});e.setAttribute('aria-label','Фишка игрока '+(owner+1));});this.renderRouteLinks(board,scene,columns);}
  decorateActor(element,actor,player){const metric=(player?.metrics||[]).find(m=>m.display?.icon==='heart'),svg=element.querySelector('svg');svg?.querySelector('[data-sdk-meter]')?.remove();if(metric&&svg&&root.PlayroomGameComponents){const template=document.createElement('template');template.innerHTML=root.PlayroomGameComponents.pieceIndicators({value:metric.value,capacity:metric.display.capacity,label:this.text(metric.label)});const meter=template.content.firstElementChild;meter.setAttribute('x','25');meter.setAttribute('y','60');meter.setAttribute('width','50');meter.setAttribute('height','16');meter.dataset.sdkMeter='true';svg.append(meter);}element.setAttribute('aria-label',(player?.name||'Игрок '+(actor.owner+1))+(metric?' · '+this.text(metric.label)+': '+metric.value:''));}
  paintPawn(e,owner){if(e._pawnOwner!==owner){e._pawnOwner=owner;e.innerHTML=root.PlayroomComponents?.roundTokenArt({value:owner+1,profile:'pawn'})||root.PlayroomIcons.icon('player');}e.style.setProperty('--round-token-fill',this.playerColor(owner));}
  renderRouteLinks(board,scene,columns){let layer=board.querySelector('.sdk-route-links');if(!layer){layer=document.createElementNS('http://www.w3.org/2000/svg','svg');layer.classList.add('sdk-route-links');layer.setAttribute('viewBox','0 0 100 100');board.insertBefore(layer,board.lastChild);}const links=Array.isArray(scene.links)?scene.links:Object.entries(scene.links||{}).map(([from,to])=>({from:Number(from),to}));layer.replaceChildren();const point=n=>{const row=Math.floor((Math.max(1,n)-1)/columns),col=row%2?columns-1-(Math.max(1,n)-1)%columns:(Math.max(1,n)-1)%columns;return [(col+.5)*100/columns,100-(row+.5)*100/columns];};for(const link of links){const from=link.from??link[0],to=link.to??link[1];if(!Number.isFinite(from)||!Number.isFinite(to))continue;const a=point(from),b=point(to),path=document.createElementNS(layer.namespaceURI,'path');path.setAttribute('d','M'+a[0]+' '+a[1]+' Q'+(a[0]+b[0])/2+' '+(a[1]+b[1]-10)/2+' '+b[0]+' '+b[1]);path.setAttribute('class',to>from?'is-ladder':'is-snake');layer.append(path);}}
  renderNativeArena(scene){
   const library=root.PlayroomElementalArena;if(!library)throw Object.assign(Error('SDK_COMPONENT_UNAVAILABLE'),{code:'SDK_COMPONENT_UNAVAILABLE'});
   const surface=this.surfaceMode('elemental-arena');surface.classList.add('sdk-elemental-arena','mage-scene');
   const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),G=root.PlayroomGameComponents;
   const helpers={...root.TabletopUI?.helpers,esc,playerColor:owner=>this.playerColor(owner),icon:name=>root.PlayroomIcons.icon(name),actionAttr:command=>'data-action="'+esc(commandKey(command))+'"'},components={...G,roundTokenArt:root.PlayroomComponents.roundTokenArt};
   helpers.progress=number=>root.PlayroomMessages?.text('progress.round',{number})||String(number);helpers.components=components;helpers.button??=options=>G.button(options,{icon:helpers.icon});helpers.hand??=(cards,count,hint)=>{const layout=G.handLayout(cards);return '<section class="own-hand" data-hand-count="'+count+'"><div class="hand-heading">'+esc(hint)+'</div><div class="hand-track is-overlapping"><div class="hand-overlap-row" style="--hand-count:'+count+';grid-template-columns:'+layout.columns+'">'+layout.html+'</div></div></section>';};
   const projection=this.frame.projection,participants=this.frame.participants||Array.from({length:projection.playerCount},(_,i)=>({name:String(i+1)})),command=this.previewedCommand;
   const viewState=this.frame.ui?.viewState??this.arenaViewState;
   const previewState=command?.type==='plan'?{...viewState,mageCardId:command.cardId,mageAction:command.action,mageDirection:command.direction}:viewState;
   const fragments=new Map(),fieldFrame={region(id,markup){
    if(fragments.size>=256)return markup;
    fragments.set(id,markup);
    return '<template data-scene-fragment="'+esc(id)+'"></template>';
   }};
   const recipe=library.render({state:{game:projection.game,move:projection.revision,turn:projection.turn,status:projection.status,players:participants,scene},viewer:projection.viewer,actions:this.readonly?[]:projection.actions,ui:{...this.frame.ui,viewState:previewState,fieldFrame,publicFrameIndex:this.publicFrameIndex,replay:this.readonly||!!this.publicState},text:(key,params={})=>{const label=scene.arenaLayout.labels[key];return this.text(label&&typeof label==='object'?{...label,params:{...label.params,...params}}:label||key);},format:value=>this.text(value),helpers,components});
   // Native cells and figures retain their own layers and physical geometry.
   // Only this trusted component's template is patched; authored HTML never runs.
   const prior=this.arenaFieldTemplate;
   const prepared=root.PlayroomDOM.fragmentTemplate(surface.ownerDocument,recipe.field,fragments,prior);
   root.PlayroomDOM.patchChildren(surface,prepared.template.content,prior?.template.content,null,prepared.resolve);
   // Commit retained cell and piece roots after the patch reads the old tree.
   prepared.commit();this.arenaFieldTemplate=prepared;
   const handPort=this.targetScope.querySelector('[data-sdk-arena-hand]')||surface;this.arenaHand??=node('div','sdk-elemental-hand');if(this.arenaHand.parentElement!==handPort){this.releaseArenaHand?.();this.releaseArenaHand=handPort===surface?null:root.PlayroomDOM.manageChildren(handPort);handPort.append(this.arenaHand);}this.arenaHand.inert=!!this.publicState;this.arenaHand.style.visibility=this.publicState?'hidden':'';if(!this.publicState){const handTree=parseMarkup(this.arenaHand,recipe.hand+recipe.actions);root.PlayroomDOM.patchChildren(this.arenaHand,handTree,this.arenaHandTree);this.arenaHandTree=handTree;}
   if(recipe.players){
    const playerTree=parseMarkup(surface,recipe.players);this.arenaPlayerTrees??=new Map();this.arenaPlayerLeases??=new Map();
    for(const fresh of playerTree.querySelectorAll('.player-panel[data-player-index]')){
     const owner=fresh.dataset.playerIndex,panel=this.targetScope.querySelector('.player-panel[data-player-index="'+owner+'"]');if(!panel)continue;
     // Never lease a host participant panel: it also owns pass-device, network
     // status and decision-player controls. Public frames patch visual ports only.
     for(const [target,source]of [['.player-scores','.player-scores'],['[data-gameplay-avatar-badges]','[data-gameplay-avatar-badges]'],['[data-sdk-arena-player-status]','.player-status']]){
      const port=panel.querySelector(target),content=fresh.querySelector(source);if(!port||!content)continue;
      if(!this.arenaPlayerLeases.has(port))this.arenaPlayerLeases.set(port,root.PlayroomDOM.manageChildren(port));
      root.PlayroomDOM.patchChildren(port,content,this.arenaPlayerTrees.get(port));
      // Keep the parsed baseline for this visual port without retaining
      // the unused parts of the detached host panel.
      content.remove();this.arenaPlayerTrees.set(port,content);
     }
     panel.dataset.publicFeedback=fresh.dataset.publicFeedback||'';
     for(const state of ['is-ready','is-inactive'])panel.classList.toggle(state,fresh.classList.contains(state));
    }
    for(const [port,release]of this.arenaPlayerLeases)if(!this.targetScope.contains(port)){release();this.arenaPlayerLeases.delete(port);this.arenaPlayerTrees.delete(port);}
   }
   for(const e of this.arenaHand.querySelectorAll('[data-view-key]'))e.onclick=event=>{
    if(e.disabled||this.readonly||this.publicState){event.stopPropagation();return;}
    this.previewedCommand=null;
    // The screen owns view state when supplied. Its delegated input updates
    // both the native hand and the guide from the same selection.
    if(this.frame.ui?.viewState)return;
    event.stopPropagation();
    (this.arenaViewState??={})[e.dataset.viewKey]=e.dataset.viewValue;
    this.renderSemantic(this.sceneData,this.frame);
   };
   for(const e of [...surface.querySelectorAll('[data-action]'),...this.arenaHand.querySelectorAll('[data-action]')]){const command=JSON.parse(e.dataset.action),active=this.allowedCommands.has(commandKey(command));e.dataset.sdkCommand='true';e.dataset.sdkTarget='true';e._command=command;e._target=e.dataset.domKey?{zone:'field',cell:Number(e.dataset.domKey?.split('-').slice(-2)[0])*scene.arena.size+Number(e.dataset.domKey?.split('-').at(-1))}:{zone:'field'};e.disabled=this.readonly||!active;e.onclick=event=>{event.stopPropagation();if(!e.disabled&&!this.publicState)this.command(command);};}
   this.cancelControl.hidden=true;
  }
  renderArena(scene){if(scene.arenaLayout){this.renderNativeArena(scene);return;}this.graphicBudget={nodes:0};const arena=scene.arena,size=arena.size,surface=this.surfaceMode('arena'),board=this.makeBoard(surface,size,size);surface.classList.add('sdk-arena');this.boardCells(board,size,size,(e,index)=>{const tile=arena.board[index];e.dataset.terrain=typeof tile==='string'?tile:'ground';e.classList.toggle('is-removed',Math.floor(index/size)<arena.inset||Math.floor(index/size)>=size-arena.inset||index%size<arena.inset||index%size>=size-arena.inset);const tileArt=arena.tileAssets?.[tile]||arena.tileArt?.[tile];e.dataset.hasArt=String(!!tileArt);if(tileArt?.kind==='graphic')this.paintGraphic(e,tileArt);else if(tileArt?.kind==='asset')this.asset(e,tileArt,this.text(arena.tileLabels?.[tile]||tile));else e.innerHTML=root.PlayroomIcons.icon({wall:'layers',forest:'pieces',puddle:'cloud',desert:'sun',spikes:'warning',base:'host',air_island:'cloud','falling_floor':'warning'}[tile]||'');this.localTarget(e,{zone:'field',cell:index,point:[Math.floor(index/size),index%size]});e.setAttribute('aria-label',this.text(arena.tileLabels?.[tile]||tile||'Пустая клетка'));});keyed(board.lastChild,arena.players.map((p,owner)=>({...p,owner})).filter(p=>p.pos),p=>p.owner,()=>{const e=node('button','sdk-board-piece sdk-pawn');e.type='button';return e;},(e,p)=>{if(p.art?.kind==='graphic')this.paintGraphic(e,p.art);else if(p.art?.kind==='asset')this.asset(e,p.art,'Игрок '+(p.owner+1));else this.paintPawn(e,p.owner);e.style.setProperty('--round-token-fill',this.playerColor(p.owner));this.decorateActor(e,p,scene.players?.[p.owner]);this.placeCell(e,p.pos[0]*size+p.pos[1],size,size);e.dataset.entity='mage-'+p.owner;this.localTarget(e,{entity:{namespace:'mage',id:String(p.owner)},zone:'field',cell:p.pos[0]*size+p.pos[1]});});let effects=board.querySelector('.sdk-public-effects');if(!effects){effects=document.createElementNS('http://www.w3.org/2000/svg','svg');effects.classList.add('sdk-public-effects');effects.setAttribute('viewBox','0 0 '+size+' '+size);board.insertBefore(effects,board.lastChild);}effects.replaceChildren();for(const effect of arena.effects||(arena.effect?[arena.effect]:[])){if(!Array.isArray(effect.origin))continue;const targets=effect.projectile?.end?[effect.projectile.end]:effect.cells||[];for(const point of targets){if(!Array.isArray(point))continue;const path=document.createElementNS(effects.namespaceURI,'path');path.setAttribute('d','M'+(effect.origin[1]+.5)+' '+(effect.origin[0]+.5)+' L'+(point[1]+.5)+' '+(point[0]+.5));path.setAttribute('stroke',({air:'#668fad',earth:'#8a7b52',water:'#4c918f',fire:'#ce735d'}[effect.element]||'#668fad'));path.setAttribute('pathLength','100');path.dataset.publicEffect='true';effects.append(path);}}const mine=arena.players[this.frame.projection.viewer];let hand=surface.querySelector('.sdk-arena-hand');if(!hand){hand=node('div','sdk-arena-hand');surface.append(hand);}const handCards=(mine?.hand||[]).map(card=>{const chosen=card.id!==undefined&&this.previewedCommand?.cardId===card.id?this.previewedCommand?.action:null;return card.artVariants?.[chosen]?{...card,art:card.artVariants[chosen]}:card;});hand.hidden=this.targetScope!==this.root;if(hand.hidden)hand.replaceChildren();else this.renderHand(hand,handCards,'hand-'+this.frame.projection.viewer,this.frame.projection.viewer);let controls=surface.querySelector('.sdk-simultaneous-controls');if(!controls){controls=node('div','sdk-simultaneous-controls');surface.append(controls);}const planned=arena.planned;controls.hidden=!planned;controls.replaceChildren();if(planned)controls.append(node('p',null,'Ваш план принят'));
  }
  isReducedMotion(){return !!this.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches;}
  setReducedMotion(value){const next=!!value;if(next===this.reducedMotion)return;this.reducedMotion=next;if(this.isReducedMotion()){this.motionPlayer?.cancel();this.publicState=null;if(this.sceneData&&this.frame)this.renderSemantic(this.sceneData,this.frame);}}
  layoutSignature(scene){const pose=object=>({ref:object.ref,zone:object.zone,index:object.index,cell:object.cell,point:object.point,position:object.position,cells:object.cells,orientation:object.orientation});return JSON.stringify({geometry:scene.geometry,columns:scene.columns,rows:Number.isInteger(scene.rows)?scene.rows:undefined,zones:(scene.zones||[]).map(zone=>({id:zone.id,layout:zone.layout,bounds:zone.bounds,columns:zone.columns,rows:zone.rows})),objects:(scene.objects||[]).map(pose),fallback:scene.objects?.length?undefined:{hands:(scene.players||[]).map(p=>({player:p.player,hand:(p.hand||[]).map((c,i)=>c.hidden?'hidden-'+i:c.id)})),pieces:scene.pieces,positions:scene.positions,pawns:scene.pawns,tableau:scene.tableau,foundations:scene.foundations,waste:scene.waste}});}
  captureEntities(){const result=new Map();for(const e of this.targetScope.querySelectorAll('[data-entity]:not([data-motion-attached])')){const rect=e.getBoundingClientRect();if(rect.width&&rect.height)result.set(e.dataset.entity,{rect,clone:e.cloneNode(true)});}return result;}
  // Native profiles declare public transfers, routes, anchors and dice leads.
  // Reuse the application motion surface and tempo, never infer legal movement.
  playNativeMotion(snapshot,frame){
   // A repeated history visit is a new playback, even for the same revision.
   const motion=this.nativeMotion,plan={id:'sdk-native-motion:'+frame.projection.game+':'+frame.projection.revision+':'+(this.nativeMotionSequence=(this.nativeMotionSequence||0)+1),groups:[{duration:0,cues:[{id:'native-move',kind:'motion'}]}]};
   const Flow=root.PlayroomGameFlow;if(!Flow)throw Object.assign(Error('SDK_COMPONENT_UNAVAILABLE'),{code:'SDK_COMPONENT_UNAVAILABLE'});
   const pace=Flow.timing(frame.ui||{},this.isReducedMotion());
   this.motionPlayer.play(plan,{effect:(_cue,context)=>motion.play(snapshot,{duration:pace.duration,settle:pace.settle,effects:Flow.effectTimes[pace.mode],context}),cancel:()=>motion.cancel(),final:()=>motion.cancel(),error:this.error});
  }
  animateEntities(before,frame){
   const {game,revision}=frame.projection,flights=[];
   for(const e of this.targetScope.querySelectorAll('[data-entity]:not([data-motion-attached])')){
    const old=before.get(e.dataset.entity);if(!old)continue;
    const rect=e.getBoundingClientRect();
    if(Math.hypot(old.rect.left-rect.left,old.rect.top-rect.top)>=3)flights.push({e,old,rect});
   }
   if(!flights.length)return;
   const overlay=node('div','sdk-flight-layer');overlay.setAttribute('aria-hidden','true');document.body.append(overlay);
   this.genericMotionSequence=(this.genericMotionSequence||0)+1;
   const plan={id:'sdk-motion:'+game+':'+revision+':'+this.genericMotionSequence,groups:[{duration:420,cues:flights.map((_,index)=>({id:'flight-'+index,kind:'flight',index}))}]};
   this.motionPlayer.play(plan,{effect:(cue,context)=>{
    const {e,old,rect}=flights[cue.index],clone=old.clone;
    clone.classList.add('sdk-flight');clone.classList.remove('is-selected','is-available','is-guided','sdk-guided-target');
    clone.removeAttribute('data-sdk-guide-step');
    clone.removeAttribute('data-entity');clone.removeAttribute('data-sdk-target');clone.inert=true;clone.tabIndex=-1;clone.setAttribute('aria-hidden','true');
    Object.assign(clone.style,{left:old.rect.left+'px',top:old.rect.top+'px',width:old.rect.width+'px',height:old.rect.height+'px',visibility:'visible',margin:'0',transform:'none'});
    overlay.append(clone);e.style.visibility='hidden';
    context.cleanup(()=>{clone.remove();e.style.visibility='';});
    const animation=clone.animate([{transform:'translate(0,0)'},{transform:'translate('+(rect.left-old.rect.left)+'px,'+(rect.top-old.rect.top)+'px) scale('+(rect.width/old.rect.width)+','+(rect.height/old.rect.height)+')'}],{duration:420,easing:'cubic-bezier(.2,.7,.3,1)',fill:'forwards'});
    context.animation(animation);return animation.finished.catch(()=>{});
   },final:()=>overlay.remove(),cancel:()=>overlay.remove(),error:this.error});
  }
  canPlayPublicPlan(scene,frame,previous=this.frame){
   if(!this.motionPlayer||!scene.plan?.scenes?.length||!scene.arena||this.isReducedMotion())return false;
   const history=frame.history?.reviewing,position=frame.history?.index;
   const historyPlayback=frame.history?.playback??(Number.isInteger(position)&&position===previous?.history?.index+1);
   // Compare consecutive mounted frames so a forward history step can replay
   // the same plan after the viewer has returned to an earlier revision.
   return previous?.projection.game===frame.projection.game&&previous.sessionId===frame.sessionId&&
    previous.projection.viewer===frame.projection.viewer&&scene.plan.id!==previous.scene?.plan?.id&&
    frame.projection.revision>previous.projection.revision&&(history
     ? previous.history?.reviewing&&historyPlayback
     : !previous.history?.reviewing);
  }
  playPublicPlan(scene,frame,previous){
   if(!this.canPlayPublicPlan(scene,frame,previous))return;
   this.playedPlan=scene.plan.id;
   const scope=this.targetScope,oldDuration=scope.style.getPropertyValue('--sequence-duration'),oldPriority=scope.style.getPropertyPriority('--sequence-duration');
   const restoreDuration=()=>{if(oldDuration)scope.style.setProperty('--sequence-duration',oldDuration,oldPriority);else scope.style.removeProperty('--sequence-duration');};
   // A history replay may use the same authored plan as a completed live run.
   // Keep the plan's deduplication key separate from the execution ID.
   this.publicPlanRun=(this.publicPlanRun||0)+1;
   try{this.motionPlayer.play({...scene.plan,id:scene.plan.id+':run:'+this.publicPlanRun},{
    group:(_,group,context,join)=>{
     const step=scene.plan.scenes[group.scene];if(!step?.state)return;
     // Cards and field figures share the plan lifetime and its exact pace.
     scope.style.setProperty('--sequence-duration',Math.max(1,group.duration)+'ms');
     this.publicState=step.state;this.publicFrameIndex=group.scene;this.renderArena({...this.sceneData,arena:{...this.sceneData.arena,...step.state}});
     if(this.sceneData.arenaLayout){
      const regions=[this.surface,...scope.querySelectorAll('.player-panel[data-public-feedback]')];
      for(const region of regions)for(const animation of region.getAnimations({subtree:true}))if(animation.animationName?.startsWith('mage-')&&Number.isFinite(animation.effect?.getComputedTiming().iterations)){
       animation.currentTime=0;
       join(context.animation(animation).finished.catch(()=>{}));
      }
     }
     for(const effect of this.surface.querySelectorAll('[data-public-effect]')){
      const animation=effect.animate([{opacity:0,strokeDashoffset:100},{opacity:1,strokeDashoffset:0}],{duration:Math.max(1,group.duration),fill:'both'});
      join(context.animation(animation).finished.catch(()=>{}));
     }
    },
    effect:(cue,context)=>cue.kind==='sound'
     ?this.playAudio?.(cue.sounds,frame.projection.game,context):undefined,
    final:()=>{restoreDuration();this.publicState=null;this.publicFrameIndex=undefined;if(this.sceneData.plan?.id===scene.plan.id)this.renderArena(this.sceneData);},
    cancel:()=>{restoreDuration();this.publicState=null;this.publicFrameIndex=undefined;},error:this.error
   });}catch(error){restoreDuration();this.publicState=null;this.error(error);}
  }
  graphic(record,prefix='sdk-art-'+(++SceneRenderer.graphicSequence),inSVG=false,depth=0,budget={nodes:0}){if(++budget.nodes>10000)throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});if(!record||typeof record!=='object'||depth>50)return document.createTextNode('');const ns='http://www.w3.org/2000/svg',G=root.PlayroomGameComponents;const child=(value,svg=inSVG)=>this.graphic(value,prefix,svg,depth+1,budget);if(record.kind==='text')return document.createTextNode(record.text||'');
   if(record.kind==='component'){budget.nodes+=60;if(budget.nodes>10000)throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});const value=record.value||{};let markup=null;switch(record.component){case 'card':case 'uno-card':markup=this.cardMarkup(value,record.component==='uno-card'?'color-value':value.deck);break;case 'card-frame':{const content=child(value.content,true);markup=G?.cardFrame(content.outerHTML,{shape:value.shape||'portrait'});break;}case 'die':markup=G?.dieArt(value.value,{frame:'raised'});break;case 'checker':markup=G?.checkerArt(!!value.king,false);break;case 'domino':markup=G?.dominoFace(value.a,value.b,value.rotation||0);break;case 'ship':markup=G?.shipSilhouette(value.args?.[0]??value.size??1);break;case 'pawn':case 'round-token':markup=root.PlayroomComponents?.roundTokenArt(value);break;case 'badge':markup=G?.scoreBadge({...value,label:this.text(value.label||'')},{roundTokenArt:root.PlayroomComponents?.roundTokenArt});break;case 'icon':markup=root.PlayroomIcons.icon(value.id);break;case 'arrow':markup=root.PlayroomIcons.icon('arrow');break;case 'mark':markup=G?.markTokenArt(value.args?.[0]||value.mark);break;case 'player':markup=root.PlayroomIcons.icon('player');break;case 'effect-tile':markup=root.PlayroomIcons.icon({adjust:'adjustDie',less:'lessDie',skip:'skipTurn',shield:'shield',second:'secondDie'}[value.args?.[0]]||'hint');break;case 'links':{const size=value.args?.[1]||4,links=value.args?.[0]||[];if(!Number.isInteger(size)||size<1||size>64||!Array.isArray(links)||links.length>512||budget.nodes+size*size*2+links.length>10000)throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});budget.nodes+=size*size*2+links.length;const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 100 100');svg.classList.add('sdk-graphic-links');const point=n=>{const row=Math.floor((n-1)/size),col=row%2?size-1-(n-1)%size:(n-1)%size;return [(col+.5)*100/size,100-(row+.5)*100/size];};for(let n=1;n<=size*size;n++){const [x,y]=point(n),rect=document.createElementNS(ns,'rect');rect.setAttribute('x',x-50/size);rect.setAttribute('y',y-50/size);rect.setAttribute('width',100/size);rect.setAttribute('height',100/size);rect.setAttribute('fill','var(--color-surface-panel)');rect.setAttribute('stroke','var(--color-border-subtle)');svg.append(rect);const text=document.createElementNS(ns,'text');text.setAttribute('x',x);text.setAttribute('y',y);text.setAttribute('font-size','7');text.setAttribute('text-anchor','middle');text.textContent=n;svg.append(text);}for(const [from,to]of links){const a=point(from),b=point(to),path=document.createElementNS(ns,'path');path.setAttribute('d','M'+a[0]+' '+a[1]+' Q'+(a[0]+b[0])/2+' '+(a[1]+b[1]-20)/2+' '+b[0]+' '+b[1]);path.setAttribute('stroke',to>from?'#4c8060':'#ce735d');path.setAttribute('fill','none');path.setAttribute('stroke-width','3');svg.append(path);}return svg;}case 'button':{const e=node('span','sdk-graphic-button',this.text(value.label));if(value.icon){const icon=node('span');icon.innerHTML=root.PlayroomIcons.icon(value.icon);e.prepend(icon);}return e;}case 'card-slot':{const e=node('span','sdk-graphic-slot',this.text(value.label||value.suit||'—'));return e;}case 'score-table':case 'parameter-table':{if(!Array.isArray(value.rows||[])||(value.rows||[]).length>128||(value.headers||[]).length>32||(value.rows||[]).some(row=>!Array.isArray(row)||row.length>32))throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});budget.nodes+=(value.rows||[]).reduce((sum,row)=>sum+row.length+1,0);if(budget.nodes>10000)throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});const table=node('table','sdk-graphic-table');if(value.headers){const row=node('tr');for(const header of value.headers)row.append(node('th',null,this.text(header)));table.append(row);}for(const values of value.rows||[]){const row=node('tr');for(const item of values)row.append(node('td',null,this.text(item)));table.append(row);}return table;}case 'action-selector':{if((value.choices||[]).length>64)throw Object.assign(new Error('SDK_GRAPHIC_LIMIT'),{code:'SDK_GRAPHIC_LIMIT'});const e=node('div','sdk-graphic-row');for(const choice of value.choices||[])e.append(node('span','sdk-graphic-button',this.text(choice.label)));return e;}default:{const e=node('span','sdk-graphic-label',this.text(value.label||record.component));return e;}}
    if(markup){const wrapper=document.createElement('template');wrapper.innerHTML=markup;const art=wrapper.content.firstElementChild;this.bindCardBack(art);if(record.component==='card-frame')for(const back of art.querySelectorAll('[data-asset-family=card-back]'))this.bindCardBack(back);if(inSVG)return art;const span=node('span','sdk-graphic-component is-'+record.component);span.append(art);if(value.color&&/^#[0-9a-f]{6}$/i.test(value.color))span.style.setProperty('--round-token-fill',value.color);if(record.component==='card'||record.component==='uno-card')span.classList.toggle('is-red',value.suit==='♥'||value.suit==='♦'||value.color==='red');return span;}return node('span','sdk-graphic-label',record.component);}
   if(record.kind==='group'){const e=inSVG?document.createElementNS(ns,'g'):node('div','sdk-graphic-group sdk-graphic-'+(record.layout||'stack'));if(record.selected)e.classList.add('is-selected');for(const [key,raw]of Object.entries(record.attrs?.styles||{})){if(/^(color|fill|stroke|stroke-width|opacity|font-size|font-weight|background|display|--[a-z][a-z-]*)$/.test(key)){const safe=graphicValue(raw,prefix);if(safe!==null)e.style.setProperty(key,safe);}}if(Number.isInteger(record.columns)&&record.columns>=1&&record.columns<=32)e.style.setProperty('--graphic-columns',record.columns);for(const item of record.children||[])e.append(child(item));return e;}
   if(record.kind==='vector-text'){const e=document.createElementNS(ns,'text');for(const [key,val]of Object.entries({x:record.x,y:record.y,'font-size':record.size||15,'font-weight':record.weight||800,'text-anchor':record.anchor||'middle','dominant-baseline':record.baseline||'central',fill:graphicValue(record.fill||'currentColor',prefix)||'currentColor'}))if(val!==undefined)e.setAttribute(key,String(val));e.textContent=record.text;return e;}
   if(record.kind==='viewport'||record.kind==='placement'){const e=document.createElementNS(ns,'svg');if(record.kind==='viewport'&&Array.isArray(record.viewBox))e.setAttribute('viewBox',record.viewBox.join(' '));else for(const key of ['x','y','width','height'])if(Number.isFinite(record[key]))e.setAttribute(key,String(record[key]));e.setAttribute('preserveAspectRatio','xMidYMid meet');if(record.content)e.append(child(record.content,true));return e;}
   if(record.kind==='vector'){const allowed=new Set('svg g defs symbol use path rect circle ellipse line polyline polygon text tspan title desc linearGradient radialGradient stop clipPath mask pattern filter feGaussianBlur feOffset feMerge feMergeNode feColorMatrix feComposite feBlend feMorphology feFlood'.split(' '));if(!allowed.has(record.tag))return document.createTextNode('');const e=document.createElementNS(ns,record.tag),attributes=new Set('id x y x1 y1 x2 y2 cx cy r rx ry width height viewBox d points fill fill-opacity stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray opacity transform rotate preserveAspectRatio text-anchor dominant-baseline font-family font-size font-weight font-style gradientUnits gradientTransform offset stop-color stop-opacity clip-path mask filter result in in2 stdDeviation dx dy mode type values operator k1 k2 k3 k4 radius flood-color flood-opacity href'.split(' '));for(const [name,raw]of Object.entries(record.attrs||{})){if(name==='styles'&&raw&&typeof raw==='object'){for(const [key,value]of Object.entries(raw))if(/^(color|fill|stroke|stroke-width|opacity|font-size|font-weight|background|display|--[a-z][a-z-]*)$/.test(key)){const safe=graphicValue(value,prefix);if(safe!==null)e.style.setProperty(key,safe);}continue;}if(!attributes.has(name)||typeof raw!=='string')continue;let value=graphicValue(raw,prefix);if(value===null)continue;if(name==='id'){if(!/^[A-Za-z_][\w.-]*$/.test(raw))continue;value=prefix+'-'+raw;}if(name==='href'){if(!/^#[A-Za-z_][\w.-]*$/.test(raw))continue;value='#'+prefix+'-'+raw.slice(1);}e.setAttribute(name,value);}for(const item of record.children||[])e.append(child(item,true));return e;}return document.createTextNode('');
  }
  advanceTutorial(){const steps=this.tutorialData?.steps?.filter(step=>step.available!==false)||[],current=steps[Math.min(this.tutorialCursor||0,Math.max(0,steps.length-1))];if(!current)return;const seen=[...new Set([...(this.tutorialProgress?.seen||this.frame.guideProgress?.seen||[]),current.id])];this.tutorialProgress={seen,checkpoint:this.tutorialData.checkpoint??null};if(!this.readonly)this.onTutorialProgress?.(this.tutorialProgress);this.tutorialCursor=(this.tutorialCursor||0)+1;this.renderTutorial(this.tutorialData);}
  clearTutorialTargets(){
   for(const element of this.guidedElements){
    element.classList.remove('is-guided','sdk-guided-target');
    delete element.dataset.sdkGuideStep;
   }
   this.guidedElements.clear();
  }
  bindHostedTutorial(guide,seen){
   if(this.boundTutorialFrame===this.frame&&this.tutorialData===guide&&this.hostedTutorialSeen===seen)return;
   this.boundTutorialFrame=this.frame;
   this.hostedTutorialSeen=seen;
   this.renderTutorial(guide);
  }
  renderTutorial(tutorial){
   const scope=this.frame.projection.game+':'+this.frame.projection.viewer;
   if(this.tutorialScope!==scope){
    this.tutorialScope=scope;
    this.tutorialCursor=0;
    this.tutorialProgress=this.frame.guideProgress||null;
   }
   this.tutorialData=tutorial;
   this.clearTutorialTargets();
   const hosted=this.root.hasAttribute('data-sdk-player-scene');
   // Studio uses the same native port but still owns its preview pager.
   const controllerOwned=this.frame.hostedTutorial===true;
   const seen=hosted?(this.hostedTutorialSeen||new Set(this.frame.guideProgress?.seen||[])):null;
   const steps=(tutorial?.steps||[]).filter(step=>step.available!==false&&!seen?.has(step.id));
   this.tutorialPanel.hidden=controllerOwned||!steps.length;
   if(!steps.length)return;
   const index=Math.min(this.tutorialCursor||0,steps.length-1),current=steps[index];
   if(!controllerOwned){
    setText(this.tutorialText,this.text(current.text));
    setText(this.tutorialCount,(index+1)+' / '+steps.length);
    this.tutorialNext.disabled=(this.tutorialCursor||0)>=steps.length-1;
   }
   // The host chooses the first visible goal. A legal move may have separate
   // lessons for selecting its source and committing it at its destination.
   const selectors={card:'.sdk-piece-card',die:'.sdk-die',piece:'.sdk-board-piece',player:'.sdk-player',target:'.is-available[data-cell],.sdk-pile-cards .is-available',control:'.sdk-choice-panel:not([hidden]) button,.sdk-choice-panel:not([hidden]) select,.sdk-generic-input button,.sdk-fleet-indicator'};
   const controlAttributes={'view-key':'data-view-key','view-preference':'data-view-preference',command:'data-command'};
   let localControls,native,external;
   for(const step of hosted?steps:[current]){
    const commands=new Set((step.commands||[]).map(commandKey)),component=step.target?.component,id=encodeURIComponent(step.id);
    const mark=element=>{
     if(element.disabled)return;
     element.classList.add('is-guided','sdk-guided-target');
     this.guidedElements.add(element);
     const ids=(element.dataset.sdkGuideStep||'').split(' ').filter(Boolean);
     if(!ids.includes(id))element.dataset.sdkGuideStep=[...ids,id].join(' ');
    };
    if(step.target?.kind==='local-control'){
     const {control,key,value,unpressed}=step.target,attribute=controlAttributes[control];
     if(!attribute)continue;
     // Local view actions are addressed by data, with no command or DOM
     // selector supplied by the guest.
     localControls??=this.targetScope.querySelectorAll('[data-view-key],[data-view-preference],[data-command]');
     for(const element of localControls){
      if(element.getAttribute(attribute)===key&&(value===undefined||element.dataset.viewValue===value)&&
         (!unpressed||element.getAttribute('aria-pressed')==='false'))mark(element);
     }
     continue;
    }
    if(step.target?.kind==='player-choice'){
     const picker=this.playerChoiceController,choices=this.sceneData.playerChoices?.choices;
     if(!picker||!choices||this.readonly)continue;
     const card=step.target.part==='card',options=card&&picker.menu?.open?picker.menu.querySelectorAll('[data-card-index]'):null;
     if(card&&!options)continue;
     const targets=new Set();
     for(const choice of choices){
      if((!card||choice.player===picker.active)&&(!choice.source||this.sameTarget({entity:choice.source},this.selectedSource))){
       const key=commandKey(choice.command);
       if(commands.has(key)&&this.allowedCommands.has(key))targets.add(card?choice.index:choice.player);
      }
     }
     if(card){
      for(const option of options)if(targets.has(Number(option.dataset.cardIndex)))mark(option);
     }else for(const {trigger} of this.playerChoicePorts.values())if(targets.has(Number(trigger.dataset.playerTarget)))mark(trigger);
     continue;
    }
    native??=this.targetScope.querySelectorAll('[data-sdk-target],[data-sdk-command],.sdk-generic-input');
    for(const element of native){
     const direct=element._command||element._choice?.command,target=element._target;
     if(!step.binding&&direct){if(commands.has(commandKey(direct)))mark(element);continue;}
     if(!target)continue;
     // Reuse the same scene index as native input. A placement lesson should
     // visit only the rows for this cell or source, even on a full setup grid.
     const match=step.binding!=='destination'&&this.interactionRows(target,'source').some(i=>commands.has(commandKey(i.command)))||
      step.binding!=='source'&&this.interactionRows(target,'target').some(i=>commands.has(commandKey(i.command))&&
       (!i.source||!step.binding||this.sameTarget(i.source,this.selectedSource)));
     if(match)mark(element);
    }
    if(component&&selectors[component])for(const element of this.targetScope.querySelectorAll(selectors[component]))if(element.getClientRects().length)mark(element);
    if(!step.binding)for(const {element,command} of (external??=this.externalActions?.(this.frame.projection.actions||[])||[])){
     if(!element?.isConnected||element.disabled||!element.getClientRects().length||!this.allowedCommands.has(commandKey(command)))continue;
     if(commands.has(commandKey(command))||!commands.size&&component==='control')mark(element);
    }
   }
  }
  prepareResources(resources){
   const assets=Array.isArray(resources?.assets)?resources.assets:noResourceAssets;
   this.animationAssets=resources?.animations;
   if(this.preparedAssets===assets)return;
   const index=indexResources(assets);
   // Player frames share the installed snapshot. Studio frames can still
   // replace a mutable source in place, so those are indexed again.
   this.preparedAssets=index.immutable?assets:null;
   this.resourceIndex=index;
   if(index.scope!==this.resourceScope){
    this.resourceScope=index.scope;
    this.resourceGeneration=(this.resourceGeneration||0)+1;
    this.resourceErrors=new Set();
    this.cardBackSources?.clear();
   }
   if(stagedImages&&stagedImages.resources===resources&&this.images!==SceneRenderer.graphicImages){
    this.images.release();
    this.images=stagedImages.images;
    stagedImages=null;
   }
   this.images.prepare(index);
  }
  playAssetAnimation({asset,target},context,mode){
   if(!context?.current()||this.isReducedMotion())return;
   const prepared=this.animationAssets&&Object.hasOwn(this.animationAssets,asset.id)&&this.animationAssets[asset.id];
   if(!prepared){this.error?.({code:'SDK_ANIMATION_UNAVAILABLE'});return;}
   // Match the mounted public field by semantic identity. The pack receives
   // neither a DOM node nor a selector, and cannot animate another surface.
   const key=target.entity&&root.PlayroomGameComponents.entityKey(target.entity);
   const element=key?this.root.querySelector('[data-entity="'+CSS.escape(key)+'"]'):this.surface.hidden?this.root:this.surface;
   if(!element?.animate)return;
   const presets=root.PlayroomGameFlow.presets;
   const duration=prepared.duration*(presets[mode]||presets.normal).duration/presets.normal.duration;
   const animation=context.animation(element.animate(prepared.keyframes,{duration}));
   return animation.finished.catch(()=>{});
  }
  imageAsset(file){return this.images.get(file);}
  assetEntry(ref){
   if(ref?.kind!=='asset')return null;
   const entry=this.imageAsset(ref.id);
   if(!entry){
    this.resourceErrors??=new Set();
    if(!this.resourceErrors.has(ref.id)){this.resourceErrors.add(ref.id);this.error?.({code:'SDK_RESOURCE_UNAVAILABLE'});}
   }
   return entry;
  }
  asset(element,value,label){const ref=value?.asset||value,entry=this.assetEntry(ref);if(!entry){if(element._assetKey){element.replaceChildren();element._assetKey=null;}setText(element,label);return;}if(element._assetKey!==entry.key){const image=node('img','sdk-asset');image.alt=String(label||ref.id);image.src=entry.url;image.draggable=false;element.replaceChildren(image);element._assetKey=entry.key;}}
  static stageImages(resources){
   if(!Array.isArray(resources?.assets)||!resources.assets.length)return;
   const images=new SceneImages(),staged={resources,images};
   stagedImages?.images.release();
   stagedImages=staged;
   images.prepare(indexResources(resources.assets));
   images.warm(resources.preloadImages,resources.coverId);
   return ()=>{
    // The lobby releases unclaimed work. A mounted scene owns the cache.
    if(stagedImages!==staged)return;
    stagedImages=null;
    images.release();
   };
  }
  static offeredAction(commands, actions, command) {
    const resolve=root.PlayroomProtocol.choiceIndex(commands);
    const choice=resolve(command);
    if (!choice) return;
    // Send the shell's original action so confirmation and pacing stay intact.
    return actions.find(action=>resolve(action,true)===choice);
  }
  static externalActions(container, commands, selector='[data-action]') {
    const resolve=root.PlayroomProtocol.choiceIndex(commands);
    return Array.from(container.querySelectorAll(selector), element=>({
      element, command:resolve(JSON.parse(element.dataset.action), true)
    })).filter(row=>row.command);
  }
  // The host supplies viewer-scoped data and owns command delivery. The player
  // controller binds its lesson separately once the checkpoint is mounted.
  present(frame, {displayScene, tutorial, shellActions, reducedMotion}={}) {
    const scene=displayScene ?? frame.scene;
    const resolve=shellActions && root.PlayroomProtocol.choiceIndex(frame.projection.actions);
    const actions=shellActions ? shellActions.flatMap(action=>{
      const command=resolve(action,true);
      return command ? [{command,label:action.label || action.type}] : [];
    }) : frame.actions;
    const support=tutorial===undefined ? frame.support : {...scene.support,tutorial};
    this.setReducedMotion(reducedMotion);
    this.update({...frame,scene,support,actions});
  }
  update(frame){const previous=this.frame;this.syncSelectionScope(frame);this.root.classList.add('sdk-scene');const scene=frame.scene||{};this.graphicBudget={nodes:0};const identity=frame.projection.game+':'+frame.projection.viewer+':'+frame.projection.revision+':'+(frame.history?.reviewing?frame.history.index:'live'),sameSession=previous?.sessionId===frame.sessionId;
   const keepPublic=sameSession&&this.publicState&&scene.plan?.id===this.playedPlan&&!frame.history?.reviewing;
   if(this.presentationIdentity!==identity||!sameSession){this.gestures?.invalidate();if(!keepPublic)this.motionPlayer?.cancel();}
   if(!sameSession)this.playedPlan=null;
   this.presentationIdentity=identity;
   const {game,viewer,revision}=frame.projection,readonly=!!frame.history?.reviewing||!!frame.interaction?.blocked;
   const mayAnimate=this.motionPlayer&&!frame.ui?.externalMotion&&sameSession&&previous?.projection.game===game&&
    previous.projection.viewer===viewer&&revision>previous.projection.revision&&(!frame.history?.reviewing||!!frame.motion)&&
    (!Object.hasOwn(frame,'motion')||!!frame.motion)&&!this.isReducedMotion();
   const rollsInPlace=scene.routeStyle&&frame.motion?.action?.type==='roll';
   const previousLayout=this.lastLayout,frozen=Object.isFrozen(scene);
   const samePublishedScene=frozen&&previous?.scene===scene;
   const compareLayout=mayAnimate&&!rollsInPlace&&!samePublishedScene;
   // Published scenes can be read later when this renderer owns a flight.
   // Capture mutable inputs at mount so a later update cannot change the baseline.
   let layout=samePublishedScene?previousLayout:undefined;
   if(!frozen||compareLayout)layout??=this.layoutSignature(scene);
   const moving=mayAnimate&&(rollsInPlace||compareLayout&&layout!==(previousLayout??this.layoutSignature(previous.scene||{})));
   const native=moving&&(scene.anchoredLayout||scene.inventoryLayout||scene.solitaireLayout||scene.routeStyle||scene.cellStyle==='mark-token')&&frame.motion&&this.targetScope!==this.root&&root.PlayroomMotion?.surface;
   let snapshot=null;
   if(native){
    this.nativeMotion??=root.PlayroomMotion.surface(()=>this.targetScope);
    snapshot=this.nativeMotion.capture({...frame.motion,viewer,sceneModel:this.sceneData});
    snapshot.sequence=frame.motion.action?.sequence||scene.motionSequence;
    snapshot.preparePoses?.(scene);
   }
   // Only the generic flight owns pre-render DOM copies. Blocked shells use
   // their feedback player, and an arena's public plan owns its own frames.
   const before=moving&&!snapshot&&(!readonly||frame.plan)&&!(scene.arena&&scene.plan?.groups?.length)?this.captureEntities():null;
   this.lastLayout=layout;
   const resources=frame.resources||frame.pack?.resources;
   this.prepareResources(resources);this.images.warm(resources?.preloadImages||frame.metadata?.preloadImages,resources?.coverId||frame.metadata?.cover?.id);
   this.playerChoiceRows=null;
   const commands=frame.projection.actions;
   if(commands!==previous?.projection.actions||!root.PlayroomProtocol.ownsImmutable(commands)){
    this.allowedCommands=new Set((commands||[]).map(commandKey));
   }
   if(this.choiceRevision!==frame.projection.revision){this.choiceRevision=frame.projection.revision;const available=this.allowedCommands;if(this.choiceCommands&&!this.choiceCommands.every(c=>available.has(commandKey(c))))this.hideChoicePanel();if(this.selectedSource&&!(scene.interactions||[]).some(i=>i.source&&this.sameTarget(i.source,this.selectedSource)))this.selectedSource=null;}this.frame=frame;this.sceneData=scene;const orientationScope=frame.projection.game+':'+frame.projection.viewer;if(this.orientationScope!==orientationScope){this.orientationScope=orientationScope;this.flipped=frame.ui?.flipped??(Array.isArray(scene.pieces)&&frame.projection.viewer===1);}this.surface.classList.toggle('is-flipped',!!this.flipped);this.readonly=readonly;this.nowOffset=Number.isFinite(frame.now)?frame.now-Date.now():0;this.clockData=scene.clock;this.voteData=scene.vote;if(this.voteId!==scene.vote?.id){this.voteId=scene.vote?.id;this.voteMinimized=false;}this.renderVote();this.tick();setText(this.prompt,scene.prompt||'');this.prompt.hidden=!scene.prompt;this.clock.hidden=!scene.clock;this.heading.hidden=!scene.prompt&&!scene.clock;
   const menuActions=(scene.menuActions||[]).filter(action=>!frame.ui?.hotseat||action.kind!=='vote');this.gameMenu.hidden=this.root.hasAttribute('data-sdk-player-scene')||!menuActions.length;keyed(this.gameMenuItems,menuActions,entry=>commandKey(entry.command),entry=>this.action(entry.label,entry.command),(button,entry)=>{setText(button,entry.label);button._command=entry.command;button.disabled=this.readonly;});
   this.canvasRoot.hidden=!scene.canvas;this.ink.update(scene.canvas,{readonly:!!frame.history?.reviewing||!!frame.interaction?.blocked&&!frame.interaction?.continuousInput,preview:frame.preview||[]});
   if(scene.canvas){
    if(!this.drawingPrompt){
     this.drawingPrompt=node('p','sdk-drawing-prompt');
     this.ink.paperOverlay.append(this.drawingPrompt);
    }
    const preparing=scene.clock?.phase==='prepare'&&(scene.clock.player??frame.projection.turn)===frame.projection.viewer&&!!scene.prompt;
    this.drawingPrompt.hidden=!preparing;
    this.prompt.hidden=preparing||!scene.prompt;
    setText(this.drawingPrompt,preparing?scene.prompt:'');
   }
   const marks=scene.cellStyle==='mark-token';
   this.root.classList.toggle('sdk-mark-scene',marks);this.grid.classList.toggle('sdk-mark-grid',marks);
   this.grid.style.setProperty('--mark-rows',Number.isInteger(scene.rows)?scene.rows:scene.columns||3);
   this.grid.style.setProperty('--mark-aspect',scene.fieldAspect||1);
   this.grid.hidden=!scene.cells?.length;
   this.grid.style.gridTemplateColumns='repeat('+Math.max(1,Math.min(20,scene.columns||Math.ceil(Math.sqrt(scene.cells?.length||1))))+',minmax(0,1fr))';
   keyed(this.grid,scene.cells||[],(c,i)=>c.id??i,()=>this.action('',null),(button,cell,index)=>{
    button.classList.toggle('sdk-mark-cell',marks);button.classList.toggle('is-cross',cell.mark==='X');
    button.classList.toggle('is-last-column',index%(scene.columns||3)===(scene.columns||3)-1);
    button.classList.toggle('is-last-row',index>=scene.cells.length-(scene.columns||3));
    if(marks){
     button.dataset.interactionShape='cell';
     const signature=JSON.stringify(cell.mark??null);
     if(button._markSignature!==signature){
      button._markSignature=signature;
      const art=node('span');
      art.innerHTML=root.PlayroomGameComponents.markTokenArt(cell.mark);
      // The shared motion surface matches the committed move to its cell.
      Object.assign(art.dataset,{motionEffect:'pulse',motionTrigger:'place',motionKey:'cell'});
      button.replaceChildren(art);
     }
     button.firstElementChild.dataset.motionValue=String(cell.index??index);
    }else{
     delete button.dataset.interactionShape;
     button._markSignature=null;setText(button,this.text(cell.mark??cell.value??'·'));
    }
    button.setAttribute('aria-label',this.text(cell.label??cell.value??'Клетка'));
    button._command=cell.command;button.disabled=this.readonly||!cell.command;
   });
   if(!this.renderNativeHands(scene,frame)){this.players.hidden=false;keyed(this.players,this.arrangePlayers(scene,frame),p=>p.player,()=>{const panel=node('section','sdk-player');panel.append(node('h3'),node('div','sdk-player-metrics'),node('div','sdk-hand'),node('div','sdk-books'),node('span','sdk-turn-marker'));return panel;},(panel,p)=>{const name=p.name||'Игрок '+(p.player+1);setText(panel.children[0],name);panel.classList.toggle('is-turn',p.player===frame.projection.turn);keyed(panel.children[1],p.metrics||[],(m,i)=>m.id||i,()=>node('span','sdk-metric'),(e,m)=>{const label=this.text(m.label??m.key??''),value={...m,label};e.innerHTML=root.PlayroomGameComponents?.pieceTypes?.badge?root.PlayroomGameComponents.pieceTypes.badge.render(value,{roundTokenArt:root.PlayroomComponents.roundTokenArt}):this.text(m.value);e.setAttribute('aria-label',label+': '+this.text(m.value));});this.renderHand(panel.children[2],p.hand||[],'hand-'+p.player,p.player);panel.classList.toggle('is-inactive',!!p.inactive);panel.dataset.owner=p.player;panel.dataset.role=p.role==='defender'&&scene.taking?'taking':p.role||'';panel.setAttribute('aria-label',name+({'taking':' · Берёт','defender':' · Защищается','attacker':' · Атакует'}[panel.dataset.role]||''));this.renderHand(panel.children[3],p.bookCards||[],'books-'+p.player,p.player);panel.children[3].classList.add('sdk-book-cards');});}else{this.players.hidden=true;this.players.replaceChildren();}
   this.rows.hidden=!!scene.scoreLayout||!Array.isArray(scene.rows)||!scene.rows.length;keyed(this.rows,!scene.scoreLayout&&Array.isArray(scene.rows)?scene.rows:[],(r,i)=>r.id||i,()=>{const tr=node('tr');tr.append(node('th'));return tr;},(tr,row)=>{setText(tr.children[0],this.text(row.label));const cells=row.cells||[];while(tr.children.length>cells.length+1)tr.lastChild.remove();cells.forEach((cell,index)=>{let td=tr.children[index+1];if(!td){td=node('td');td.append(this.action('',null));tr.append(td);}const b=td.firstChild;setText(b,this.text(cell.value??cell.preview??'—'));b._command=cell.command;b.disabled=this.readonly||!cell.command;});});
   const resultHost=scene.canvas?this.ink.paperOverlay:this.root;if(this.result.parentElement!==resultHost)resultHost.append(this.result);
   const result=scene.roundResult;this.result.hidden=!result;if(result){const signature=JSON.stringify(result);if(signature!==this.resultKey){this.resultKey=signature;this.result.replaceChildren(node('h3',null,'Результат раунда'),node('p','sdk-result-answer','Слово: '+this.text(result.answer)));if(result.accepted)this.result.append(node('p',null,'Принято: '+this.text(result.accepted)));if(Number.isInteger(result.winner)&&result.winner>=0)this.result.append(node('p',null,'Угадал: игрок '+(result.winner+1)));else this.result.append(node('p',null,'Никто не угадал'));if(result.overturned)this.result.append(node('p','sdk-result-overturned','Протест принят · награда отменена'));else if(result.required)this.result.append(node('p',null,'Протесты: '+(Array.isArray(result.protests)?result.protests.length:result.protests||0)+' / '+result.required));}}
   const chat=scene.chat,listedMessages=this.drawingGuesses(scene.canvas,chat?.messages||[]);const chatKey=chat?.command?commandKey([frame.projection.viewer,chat.command]):null;if(chatKey&&this.lastChatKey&&chatKey!==this.lastChatKey)this.input.value='';if(chatKey)this.lastChatKey=chatKey;this.chatCommand=chat?.command;const choice=(frame.projection.inputs||[]).find(c=>commandKey(c.command)===commandKey(this.chatCommand));this.input.maxLength=choice?.fields?.text?.maxLength||80;this.input.placeholder=chat?.placeholder||'Ваш вариант';this.input.disabled=!!frame.history?.reviewing||!this.chatCommand;this.send.disabled=this.readonly||!this.chatCommand||this.sending;this.form.hidden=!this.chatCommand;const inputHost=this.root.closest('.table-shell')?.querySelector('.self-player[data-player-index="'+frame.projection.viewer+'"] [data-sdk-player-input]');const formHost=this.chatCommand&&inputHost?inputHost:this.chat;if(this.formHost!==formHost){this.releaseFormHost?.();this.formHost=formHost;this.releaseFormHost=inputHost===formHost?root.PlayroomDOM.manageChildren(formHost):null;formHost.append(this.form);}const listHost=scene.canvas?this.guessReview:this.chat;if(this.messages.parentElement!==listHost)listHost.append(this.messages);this.chat.hidden=(!this.chatCommand||formHost!==this.chat)&&(!!scene.canvas||!listedMessages.length);const atBottom=this.messages.scrollHeight-this.messages.scrollTop-this.messages.clientHeight<32;
   keyed(this.messages,listedMessages,m=>m.id,()=>{const li=node('li','sdk-message');li.append(node('span','sdk-message-text'),this.action('Засчитать',null));return li;},(li,m)=>{setText(li.firstChild,this.guessText(m));const b=li.lastChild;b.hidden=!m.confirmCommand;b.disabled=this.readonly;b._command=m.confirmCommand;});if(atBottom)this.messages.scrollTop=this.messages.scrollHeight;
   this.renderSemantic(scene,frame);if(!this.readonly&&!this.choicePanel.hidden&&this.choiceCommands&&this.choicePanel.showPopover&&!this.choicePanel.matches(':popover-open'))this.openChoicePanel();this.applyPreviewMarkers(false);if(snapshot)this.playNativeMotion(snapshot,frame);else if(before?.size)this.animateEntities(before,frame);this.playPublicPlan(scene,frame,previous);if(!frame.hostedTutorial)this.renderTutorial(frame.support&&Object.hasOwn(frame.support,'tutorial')?frame.support.tutorial:Object.hasOwn(frame,'tutorial')?frame.tutorial:frame.scene.support?.tutorial);
  }
  guessText(message){
   if(!Number.isInteger(message.player))return this.text(message.text);
   const author=this.frame.participants?.[message.player]?.name||'Игрок '+(message.player+1);
   return author+': '+this.text(message.text);
  }
  drawingGuesses(canvas,messages){
   if(!canvas){
    this.guessOverlay?.replaceChildren();if(this.guessReview){this.guessReview.hidden=true;this.guessReview.open=false;}
    this.guessScope=null;return messages;
   }
   if(!this.guessOverlay){
    this.guessOverlay=node('ol','sdk-guess-flights');this.guessOverlay.setAttribute('aria-live','polite');
    this.guessReview=node('details','sdk-guess-review');this.guessReview.append(node('summary',null,'Ответы'));
    this.ink.paperOverlay.append(this.guessOverlay,this.guessReview);
   }
   const frame=this.frame,projection=frame.projection,review=frame.history?.reviewing;
   const scope=JSON.stringify([frame.sessionId,projection.game,projection.viewer,canvas.id,review?frame.history.index??projection.revision:null]);
   if(scope!==this.guessScope){
    this.guessScope=scope;this.guessOverlay.replaceChildren();this.guessReview.open=false;
    this.seenGuesses=new Set();this.guessLane=0;
   }
   this.guessOverlay.toggleAttribute('data-reduced-motion',this.isReducedMotion());
   // Feedback expires in wall time, including when the game clock or history is paused.
   const current=new Set(messages.map(message=>String(message.id))),expires=Date.now()+5000;
   for(const bubble of [...this.guessOverlay.children])if(!current.has(bubble.dataset.key))bubble.remove();
   for(const message of messages){
    const id=String(message.id);
    if(this.seenGuesses.has(id))continue;
    this.seenGuesses.add(id);
    const bubble=node('li',null,this.guessText(message));
    bubble.dataset.key=id;bubble.dataset.lane=String(this.guessLane++%4);bubble.dataset.expires=String(expires);
    this.guessOverlay.append(bubble);
   }
   this.seenGuesses=current;
   const confirmable=this.readonly?[]:messages.filter(message=>message.confirmCommand);
   this.guessReview.hidden=!confirmable.length;
   if(this.guessReview.hidden)this.guessReview.open=false;
   return confirmable;
  }
  renderVote(){const records=(this.sceneData?.notices||[]).map(record=>({...record,key:'notice-'+record.id})),vote=this.frame.ui?.hotseat?null:this.voteData;if(vote)records.push({key:'vote-'+vote.id,title:vote.title,summary:vote.accepted?'Решение принято':'За '+vote.voted.length+' · против '+(vote.against?.length||0),details:vote.accepted?'Завершаем текущий раунд или круг.':'Для завершения нужно '+vote.required+' из '+vote.eligible.length+' голосов. Не ответили: '+(vote.eligible.length-vote.voted.length-(vote.against?.length||0)),timer:vote.accepted?null:{startedAt:vote.startedAt??vote.deadline-30000,deadline:vote.deadline},distribution:[{label:'✔️',value:vote.voted.length,color:'positive'},{label:'❌',value:vote.against?.length||0,color:'negative'}],actions:[{id:'yes',label:'✔️ За',command:vote.command,selected:vote.voted.includes(this.frame.projection.viewer),disabled:vote.accepted||!vote.command},{id:'no',label:'❌ Против',command:vote.againstCommand,selected:!!vote.against?.includes(this.frame.projection.viewer),disabled:vote.accepted||!vote.againstCommand}]});const wanted=new Set(records.map(record=>record.key));for(const id of this.dismissedNotices)if(!wanted.has(id))this.dismissedNotices.delete(id);for(const [id,notice]of this.notices)if(!wanted.has(id)){notice.destroy();this.notices.delete(id);}for(const record of records){if(this.dismissedNotices.has(record.key))continue;let notice=this.notices.get(record.key);if(!notice){notice=new root.PlayroomNotices.ExpandableNotice({key:'sdk-'+this.inputId+'-'+record.key,onDismiss:record.key.startsWith('vote-')||record.dismissible===false?undefined:()=>{notice.destroy({animate:true});this.notices.delete(record.key);this.dismissedNotices.add(record.key);}});this.notices.set(record.key,notice);}notice.update({title:(this.frame.history?.reviewing?'История · ':'')+record.title,summary:record.summary,details:record.details,progress:record.timer,distribution:record.distribution?.map(item=>({...item,color:item.color==='positive'?'var(--color-feedback-success,#4c8060)':item.color==='negative'?'var(--color-feedback-error,#ce735d)':'var(--color-border-strong,#a6aaa4)'})),actions:(record.actions||[]).map((action,index)=>({id:action.id||String(index),label:action.label,selected:action.selected,disabled:this.readonly||action.disabled,run:()=>action.command&&this.command(action.command)})),now:this.frame.now});}}
  clearClockPlayers(){for(const panel of this.clockPlayers||[]){root.PlayroomProgressSurface.clear(panel);delete panel.dataset.clockBand;}this.clockPlayers=[];}
  tick(){const wallNow=Date.now();if(this.guessOverlay)for(const bubble of [...this.guessOverlay.children])if(Number(bubble.dataset.expires)<=wallNow)bubble.remove();const reviewing=!!this.frame?.history?.reviewing,now=reviewing?this.frame.now:wallNow+this.nowOffset;for(const notice of this.notices.values())notice.tick(now);if(!this.clockData){this.clearClockPlayers();return;}const remaining=Math.max(0,this.clockData.deadline-now),seconds=Math.ceil(remaining/1000),label=(this.clockData.label||this.clockData.phase)+' · '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');setText(this.clock,label);this.clock.classList.toggle('is-urgent',seconds<=10);
   const shell=this.root.closest('.table-shell'),status=shell?.querySelector('[data-sdk-clock-status]');if(this.clockStatus!==status){this.releaseClockStatus?.();this.clockStatus=status;this.releaseClockStatus=status?root.PlayroomDOM.manageChildren(status):null;}if(status)setText(status,label);
   const key=this.clockData.phase+':'+this.clockData.deadline+':'+(this.clockData.player??this.frame.projection.turn);if(this.clockKey!==key){this.clockKey=key;this.clockStartedAt=this.clockData.startedAt??Math.min(now,this.clockData.deadline);}const started=this.clockData.startedAt??this.clockStartedAt,total=this.clockData.deadline-started,elapsed=total>0?Math.max(0,Math.min(100,(now-started)/total*100)):0,player=this.clockData.player??this.frame.projection.turn;const panels=total>0?(shell?[...shell.querySelectorAll('.player-panel[data-player-index="'+player+'"]')]:[...this.players.querySelectorAll('.sdk-player[data-owner="'+player+'"]')]):[];
   for(const old of this.clockPlayers||[])if(!panels.includes(old)){root.PlayroomProgressSurface.clear(old);delete old.dataset.clockBand;}this.clockPlayers=panels;for(const panel of panels){const paint=root.PlayroomProgressSurface.paint(panel,{startedAt:started,deadline:this.clockData.deadline,now});if(paint)panel.dataset.clockBand=paint.band;}
  }

  preview(entries){if(!this.readonly)this.ink.addPreview(entries);}
  destroy(){this.images.release();this.inventory?.remove();this.inventory=null;this.inventoryNodes?.clear();this.paintNativeTurnPreview();this.hideChoicePanel();this.choicePanel.remove();for(const source of [root,root.visualViewport])for(const type of ['resize','scroll'])source?.removeEventListener(type,this.choicePositionHandler);this.arenaHand?.remove();this.releaseArenaHand?.();for(const release of this.arenaPlayerLeases?.values()||[])release();for(const release of this.solitaireHomeLeases?.values()||[])release();this.releaseSolitaireControlPort?.();this.solitaireControls?.remove();for(const e of this.fleetIndicatorNodes||[])this.releaseFleetIndicator(e);this.releaseFleetControlPort?.();this.fleetControls?.remove();this.playerChoiceController?.destroy();for(const [p,e]of this.playerChoicePorts||[])this.releasePlayerChoice(p,e);this.playerChoicePorts?.clear();this.releaseDicePort?.();this.dice.remove();this.chainResizeObserver?.disconnect();root.removeEventListener('playroom:scene-menu-command',this.menuCommandHandler);for(const notice of this.notices.values())notice.destroy();this.notices.clear();this.clearClockPlayers();this.releaseClockStatus?.();this.readonly=true;this.targetScope.removeEventListener('keydown',this.keydownHandler);this.releaseControlPort?.();for(const entry of this.nativeHands.values())this.releaseNativeHand(entry);this.nativeHands.clear();this.choicePanel.remove();this.cancelControl.remove();this.gestures?.destroy();this.clearTutorialTargets();this.motionPlayer?.cancel();clearInterval(this.clockTimer);this.ink.destroy();this.releaseFormHost?.();if(this.form.parentElement!==this.chat)this.form.remove();for(const element of [this.heading,this.tutorialPanel,this.canvasRoot,this.surface,this.grid,this.players,this.rows,this.result,this.chat,this.gameMenu])element.remove();this.root.classList.remove('sdk-scene','sdk-mark-scene','sdk-fill-field');delete this.root.dataset.sceneFamily;this.releaseRootChildren?.();}
 }
 SceneRenderer.inputSequence=0;SceneRenderer.graphicSequence=0;SceneRenderer.graphicImages=new SceneImages();
 root.PlayroomSDKRenderGraphic=(record,{text=value=>String(value??''),resources}={})=>{const renderer=Object.create(SceneRenderer.prototype);renderer.text=text;renderer.images=SceneRenderer.graphicImages;renderer.prepareResources(resources);const element=renderer.graphic(record);return element;};
 root.PlayroomSDKSceneRenderer=SceneRenderer;
 root.PlayroomSDKRenderDice=(dice,{packId,resources,text=value=>String(value??'')}={})=>{
  const renderer=Object.create(SceneRenderer.prototype);
  renderer.frame={projection:{game:packId}};
  renderer.images=SceneRenderer.graphicImages;
  renderer.text=text;
  renderer.prepareResources(resources);
  return dice.map(die=>renderer.dieMarkup(die,'flat',{announce:true}));
 };
 // Enlarged public actions reuse the same print component as the live table.
 // This port receives projected event data; it never runs authored view code.
 root.PlayroomSDKRenderCard=(card,{packId,deck='standard',resources}={})=>{
  if(!card||card.hidden)return '';
  const renderer=Object.create(SceneRenderer.prototype);
  renderer.frame={projection:{game:packId}};renderer.sceneData={deck};renderer.images=SceneRenderer.graphicImages;
  renderer.prepareResources(resources);renderer.text=value=>String(value??'');
  const tile=Number.isInteger(card.a)&&Number.isInteger(card.b);
  const element=node('span',tile?'domino-tile art-card':'shared-card art-card');
  if(tile)element.dataset.pieceRatio=String(4/7);else element.dataset.sizeRole='card';
  const suitLabel={'♥':'ui.game-components.suit.hearts','♦':'ui.game-components.suit.diamonds',
   '♣':'ui.game-components.suit.clubs','♠':'ui.game-components.suit.spades'}[card.suit];
  let label;
  if(deck==='standard'&&(card.joker||suitLabel&&Number.isInteger(card.rank))){
   const {rank,label:standardLabel}=root.PlayroomGameComponents.standardCardIdentity(card);
   label=card.joker?standardLabel:`${rank} ${root.PlayroomMessages.text(suitLabel)}`;
  }
  // Public reveals use the upright piece. The destination owns chain rotation.
  renderer.paintCard(element,tile?{...card,deck:'domino',rotation:0}:card,label);
  element.classList.remove('sdk-piece-card');return element.outerHTML;
 };
 root.PlayroomSDKKeyed=keyed;
})(globalThis);
