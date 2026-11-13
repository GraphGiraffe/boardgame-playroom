if(typeof module==='object'&&module.exports&&typeof require==='function')require("../core/messages.js");
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.PlayroomGameScreen=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const UI=root.TabletopUI||(typeof module==='object'&&module.exports?require('../core/ui.js'):null);
  const icon=UI.icon;
  function tileTheme(manifest={}){
    return ['green','coral','blue','gold','violet'].includes(manifest.tileTheme)?manifest.tileTheme:({cards:'green',board:'gold',dice:'violet'})[manifest.category]||'green';
  }
  function packRow({id,version='',sizeLabel='',name,manifest={},attrs='',selectable=false,controls='',detail='',nameSuffix='',usageDescription=''}={}){
    const tag=selectable?'button':'li',cover=root.PlayroomViews?.cover(id)||icon('board');
    return `<${tag} ${selectable?'type="button"':''} class="pack-row ${selectable?'pack-item':'pack-entry'}" data-pack-id="${esc(id)}" data-pack-version="${esc(version)}" ${attrs}><span class="pack-art" data-theme="${tileTheme(manifest)}" aria-hidden="true">${cover}</span><span class="pack-summary"><strong>${esc(name||manifest.name||id)}${nameSuffix?`<span class="pack-usage" title="${esc(usageDescription)}"> · ${esc(nameSuffix)}</span>`:''}</strong><small class="pack-version">${esc(id)} · ${esc(version)}${sizeLabel?` · ${esc(sizeLabel)}`:''}</small>${detail}</span>${controls?`<div class="pack-row-controls ui-action-row">${controls}</div>`:''}</${tag}>`;
  }
  function gameTitle(name,shortName='',{tag='h1'}={}){
    if(!['h1','h2'].includes(tag))throw Error('Invalid title tag');
    return `<${tag} data-game-title data-full-title="${esc(name)}" data-short-title="${esc(shortName)}" title="${esc(name)}">${esc(name)}</${tag}>`;
  }
  function fitGameTitles(host){
    for(const node of host?.querySelectorAll?.('[data-game-title]')||[]){
      // Reflow follows the user's font preference; fitting never reduces text.
      node.style.removeProperty('font-size');
      if(node.textContent!==node.dataset.fullTitle)node.textContent=node.dataset.fullTitle;
      if(node.closest('.game-frame-title'))continue;
      const tableTitle=node.closest('.table-title');
      if(tableTitle){
        const style=node.ownerDocument.defaultView.getComputedStyle(node);
        const line=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;
        tableTitle.classList.toggle('has-wrapped-title',node.scrollHeight>line+1);
      }
    }
  }
  const coverGeometry=new WeakMap();
  function fitCovers(host){
    for(const svg of host?.querySelectorAll?.('.game-cover svg,.pack-art svg')||[]){
      const art=svg.querySelector('[data-cover-art]');if(!art||typeof art.getBBox!=='function')continue;
      const Observer=svg.ownerDocument.defaultView?.MutationObserver,cacheable=!!Observer&&!art.querySelector('text,textPath,foreignObject'),assetGeometry=svg.ownerDocument.documentElement.dataset.assetGeometry;let cached=coverGeometry.get(art);
      if(!cacheable&&cached){cached.observer.disconnect();coverGeometry.delete(art);cached=null;}
      if(cached?.observer.takeRecords().length)cached.dirty=true;
      if(!cached||cached.dirty||cached.assetGeometry!==assetGeometry){const measured=art.getBBox();if(!measured.width||!measured.height)continue;
        if(!cached){cached={dirty:false,assetGeometry,box:null};if(cacheable){const entry=cached;cached.observer=new Observer(()=>{entry.dirty=true;});cached.observer.observe(art,{subtree:true,attributes:true,childList:true,characterData:true});coverGeometry.set(art,cached);}}
        cached.box={x:measured.x,y:measured.y,width:measured.width,height:measured.height};cached.assetGeometry=assetGeometry;cached.dirty=false;
      }
      const box=cached.box;if(!box.width||!box.height)continue;
      const attribute=(node,name,value)=>{const next=String(value);if(node.getAttribute(name)!==next)node.setAttribute(name,next);};
      const size=Math.max(box.width,box.height),pad=size*(svg.closest('.game-cover')?.02:.06),shadowPad=size*.06,shadow=svg.querySelector('[data-cover-shadow]');
      if(shadow){attribute(shadow,'cx',box.x+box.width/2);attribute(shadow,'cy',box.y+box.height+shadowPad*.2);attribute(shadow,'rx',box.width*.44);attribute(shadow,'ry',shadowPad*.35);}
      const bottomPad=shadow?Math.max(pad,shadowPad*.6):pad;
      attribute(svg,'viewBox',`${box.x-pad} ${box.y-pad} ${box.width+pad*2} ${box.height+pad+bottomPad}`);
      attribute(svg,'preserveAspectRatio','xMidYMid meet');
    }
  }
  function rangeSetting({id,label,min=0,max=3,step=1,value,display,describedby='',bounds=false,name='',choices=null}){
    const stops=Array.from({length:Math.round((max-min)/step)+1},(_,i)=>min+i*step);
    return `<label class="settings-range" for="${esc(id)}" style="--range-progress:${(value-min)/(max-min)*100}%;--range-allowed:100%"><span class="settings-range-heading"><span>${esc(label)}</span><output id="${esc(id)}-value" for="${esc(id)}">${esc(display)}</output></span><span class="settings-range-track"><input type="range" id="${esc(id)}"${name?` name="${esc(name)}"`:""}${choices?` data-choice-options="${esc(JSON.stringify(choices))}"`:""} min="${min}" max="${max}" step="${step}" value="${value}" aria-valuetext="${esc(display)}"${describedby?` aria-describedby="${esc(describedby)}"`:''}><span class="settings-range-dots" aria-hidden="true">${stops.map(stop=>`<i data-range-stop="${stop}" style="left:${(stop-min)/(max-min)*100}%"></i>`).join('')}</span></span>${bounds?`<span class="settings-range-bounds" aria-hidden="true"><span>${min}%</span><span>${max}%</span></span>`:''}</label>`;
  }
  // Discrete tokens keep root geometry in screen pixels; nested field art is measured separately.
  function layoutRect(node){
    const r=node.getBoundingClientRect(),scale=1;
    return {x:r.x/scale,y:r.y/scale,left:r.left/scale,right:r.right/scale,top:r.top/scale,bottom:r.bottom/scale,width:r.width/scale,height:r.height/scale};
  }
  function iconButton(attrs,label,name,{disabled=false,active,className='',type='button'}={}){
    return UI.button({attrs,label:'',ariaLabel:label,icon:name,variant:'outline',disabled,active,className,type});
  }
  function addPlayerButton({disabled=false}={}){
    return iconButton('id="network-pair-button"',globalThis.PlayroomMessages.text("ui.game-screen.c58470ab336f"),'addPlayer',{disabled});
  }
  let quickActions=[],currentGameActions=[];
  const gameMenuActions=()=>{
    const visible=new Set([...(root.document?.querySelectorAll('#app .game-frame-tools [data-game-quick]')||[])].filter(node=>node.getClientRects().length&&node.ownerDocument.defaultView.getComputedStyle(node).visibility==='visible').map(node=>node.dataset.command));
    return currentGameActions.filter(action=>!visible.has(action.attrs.match(/\bdata-command=["']([^"']+)["']/)?.[1]));
  };
  function quickAccessMarkup({exclude=[],extra=''}={}){return `<div class="settings-shortcuts" role="group" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.69093f8d2817")}">${quickActions.filter(action=>!['settings','palette'].includes(action.name)&&!exclude.includes(action.name)).map(action=>iconButton(action.attrs+' data-quick-shortcut',action.label,action.name,action)).join('')}${extra}</div>`;}
  function toolbar(actions,{showSettings=true,settingsAttrs='data-command="settings"',compact=false,showFriends=false,gameMenu=false,extraActions=[]}={}){
    // Context actions grow to the left; fullscreen and settings keep fixed right slots.
    const friends=showFriends?[{attrs:'data-friends-open',label:globalThis.PlayroomMessages.text('ui.social.friends'),name:'people',hidden:true}]:[];
    const ordered=[...actions.filter(a=>a.name!=='full').map(a=>a.name==='help'?{...a,hidden:compact||a.hidden}:a),...friends,...actions.filter(a=>a.name==='full')];
    if(showSettings)ordered.push({attrs:settingsAttrs,label:globalThis.PlayroomMessages.text("ui.game-screen.985b5e0f2ccf"),name:'settings'});
    quickActions=ordered;
    if(gameMenu){currentGameActions=[...ordered.filter(a=>!a.attrs.includes('data-friends-open')).map(a=>a.name==='settings'?{...a,attrs:gameMenu.network?'data-command="preferences"':a.attrs,label:'Настройки приложения'}:a),...extraActions,...(gameMenu.roomAction&&!ordered.some(a=>a.name==='room')?[{...gameMenu.roomAction,label:'Лобби',name:'room'}]:[])].map(a=>({...a,network:!!gameMenu.network}));return ordered.filter(a=>a.name==='chat'||a.attrs.includes('toggle-field')||a.name==='full').map(a=>iconButton(a.attrs+(a.name==='full'?` data-surface-fullscreen aria-pressed="${fullscreenState()}"`:'')+(['full','history'].includes(a.name)?` data-game-quick="${a.name==='full'?'fullscreen':'history'}"`:''),a.label,a.name,a)).join('')+iconButton('data-game-menu','Меню партии','settings');}
    return [...ordered.filter(action=>!action.hidden&&!['full','settings'].includes(action.name)).slice(0,2),...ordered.filter(action=>!action.hidden&&['full','settings'].includes(action.name))].map(a=>iconButton(a.attrs,a.label,a.name,a)).join('');
  }
  const fullscreenState=()=>!!root.document?.fullscreenElement||!!root.document?.documentElement.classList.contains('fullscreen-fallback');
  const fullscreenAction=()=>iconButton(`data-command="fullscreen" data-surface-fullscreen aria-pressed="${fullscreenState()}"`,fullscreenState()?'Выйти из режима на весь экран':'На весь экран','full');
  const surfaceSymbols=[['account-password-editor','lock'],['account-editor-modal','player'],['game-menu-panel','settings'],['pairing-choice-dialog','network'],['chat-modal','chat'],['room-chat-modal','chat'],['lobby-invites-modal','addPlayer'],['host-offer-panel','host-transfer'],['room-rules-modal','rules'],['rulebook-modal','rules'],['settings-modal','settings'],['appearance-gallery-modal','palette'],['appearance-modal','palette'],['account-modal','player'],['notification-settings-modal','bell'],['updates-modal','download'],['storage-data-modal','save'],['cloud-saves-modal','cloud'],['cloud-save-modal','cloud'],['pack-manager-modal','layers'],['packs-modal','layers'],['room-game-picker-modal','layers'],['nearby-modal','network'],['result-modal','trophy'],['saved-actions-modal','history'],['community-modal','people'],['group-info-modal','people'],['room-setup-modal','room'],['room-context-modal','settings'],['room-online-access-modal','lock'],['participant-profile-modal','player'],['friend-profile-modal','player'],['seat-choice-modal','player'],['bot-settings-modal','bot'],['avatar-picker-modal','player'],['catalog-filter-modal','filter'],['conversation-menu-modal','chat'],['conversation-search-modal','search'],['friends-modal','people'],['game-card-modal','gamepad'],['group-create-modal','groupChat'],['group-invite-modal','addPlayer'],['group-profile-modal','groupChat'],['host-transfer-modal','host-transfer'],['install021-modal','install'],['lobby-incoming-modal','room'],['local-profile-modal','player'],['online-connecting-modal','connect'],['pack-quarantine-modal','warning'],['pack-removal-modal','trash'],['room-game-context-modal','gamepad'],['room-human-modal','player'],['save-transfer-modal','save'],['saved-clear-modal','trash'],['social-game-choice-modal','gamepad'],['social-game-error-modal','warning'],['upgrade-notice-modal','download']];
  function surfaceSymbol(className){const classes=new Set(String(className).split(/\s+/));return surfaceSymbols.find(([name])=>classes.has(name))?.[1]||'help';}
  function pageTabs({label,tabs,value,attribute='data-page-tab',className='',idPrefix='',panelPrefix='',attrs='',buttonAttrs=''}={}){
    if(!Array.isArray(tabs)||tabs.length<2||!/^data-[a-z0-9-]+$/.test(attribute)||new Set(tabs.map(item=>item[0])).size!==tabs.length||!tabs.some(item=>item[0]===value))throw Error('PAGE_TABS_INVALID');
    return `<div class="app-page-tabs shared-page-tabs parameter-screen-tabs ${esc(className)}" ${attrs} role="tablist" aria-label="${esc(label)}" style="--page-count:${tabs.length};--page-index:${tabs.findIndex(([id])=>id===value)}">${tabs.map(([id,title])=>`<button type="button" role="tab" ${buttonAttrs} ${attribute}="${esc(id)}"${idPrefix?` id="${esc(idPrefix+id)}"`:''}${panelPrefix?` aria-controls="${esc(panelPrefix+id)}"`:''} tabindex="${id===value?0:-1}" aria-selected="${id===value}">${esc(title)}</button>`).join('')}</div>`;
  }
  const pageTabBindings=new WeakMap();let pageTabSequence=0;
  function pageTabsId(){return 'page-tabs-'+(++pageTabSequence);}
  function syncPageTabs(list,{panel=null}={}){
    if(!list)return;list.setAttribute('aria-orientation',list.ownerDocument.defaultView.getComputedStyle(list).getPropertyValue('--page-tabs-vertical').trim()==='1'?'vertical':'horizontal');const tabs=[...list.querySelectorAll(':scope>[role=tab]')],selected=tabs.find(tab=>tab.getAttribute('aria-selected')==='true'&&!tab.disabled);
    if(panel&&!panel.id)panel.id='page-tabs-panel-'+(++pageTabSequence);
    for(const [index,tab]of tabs.entries()){
      tab.tabIndex=tab===selected?0:-1;
      if(!tab.id)tab.id=(panel?.id||'page-tabs-'+(++pageTabSequence))+'-tab-'+index;
      if(panel)tab.setAttribute('aria-controls',panel.id);
    }
    if(panel){panel.setAttribute('role','tabpanel');if(selected)panel.setAttribute('aria-labelledby',selected.id);}
  }
  function bindPageTabs(list,{panel=null,current=()=>true}={}){
    if(!list)return ()=>{};pageTabBindings.get(list)?.();
    const valid=()=>list.isConnected&&current()&&!list.closest('[inert],[hidden],[aria-hidden="true"],[data-surface-state="suspended"]');
    let observer;const sync=()=>{if(list.isConnected)syncPageTabs(list,{panel});else observer?.disconnect();};sync();
    const click=()=>queueMicrotask(sync),keydown=event=>{
      const vertical=list.ownerDocument.defaultView.getComputedStyle(list).getPropertyValue('--page-tabs-vertical').trim()==='1',keys=vertical?['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End']:['ArrowLeft','ArrowRight','Home','End'];
      const tab=event.target.closest('[role=tab]');if(!tab||tab.parentElement!==list||!valid()||event.altKey||event.ctrlKey||event.metaKey||!keys.includes(event.key))return;
      const tabs=[...list.querySelectorAll(':scope>[role=tab]:not(:disabled)')].filter(item=>!item.hidden),index=tabs.indexOf(tab);if(index<0)return;
      const direction=list.ownerDocument.defaultView.getComputedStyle(list).direction==='rtl'?-1:1,next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(index+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:event.key==='ArrowRight'?direction:-direction)+tabs.length)%tabs.length];
      event.preventDefault();event.stopPropagation();if(next.getAttribute('aria-selected')!=='true')next.click();sync();if(next.isConnected&&valid())next.focus({preventScroll:true});
    };
    const win=list.ownerDocument.defaultView;if(win.ResizeObserver){observer=new win.ResizeObserver(sync);observer.observe(list);}list.addEventListener('click',click);list.addEventListener('keydown',keydown);
    const dispose=()=>{observer?.disconnect();list.removeEventListener('click',click);list.removeEventListener('keydown',keydown);if(pageTabBindings.get(list)===dispose)pageTabBindings.delete(list);};pageTabBindings.set(list,dispose);return dispose;
  }
  const modalHead=(title,{actions='',dismissible=true,symbol='help',dismissAttrs='data-command="close-modal"',className=''}={})=>`<header class="modal-head ui-dialog-head${className?' '+esc(className):''}">${title?`<span class="surface-head-symbol" data-surface-symbol="${esc(symbol)}" aria-hidden="true">${icon(symbol)}</span>`:''}<h2${title?` title="${esc(title)}"`:''}>${esc(title)}</h2><div class="surface-head-actions">${actions}${dismissible?iconButton(dismissAttrs,globalThis.PlayroomMessages.text("ui.game-screen.a7a4033657e8"),'back'):''}</div></header>`;
  function normalizeSurfaceHead(head,className,{surface=null}={}){
    if(!head)return;
    const title=head.querySelector(':scope>h1,:scope>h2');
    let symbol=head.querySelector(':scope>[data-surface-symbol]');
    if(title?.textContent.trim()){
      if(!symbol){symbol=head.ownerDocument.createElement('span');symbol.className='surface-head-symbol';symbol.dataset.surfaceSymbol='';symbol.setAttribute('aria-hidden','true');head.insertBefore(symbol,title);}
      const glyph=className?surfaceSymbol(className):symbol.dataset.surfaceSymbol||'help';if(symbol.dataset.surfaceSymbol!==glyph||!symbol.firstChild){symbol.innerHTML=icon(glyph);symbol.dataset.surfaceSymbol=glyph;}if(title.title!==title.textContent)title.title=title.textContent;
    }
    let actions=head.querySelector(':scope>.surface-head-actions');
    if(!actions){actions=head.ownerDocument.createElement('div');actions.className='surface-head-actions';for(const child of [...head.children])if(child!==title&&child!==symbol)actions.append(child);head.append(actions);}
    const type=head.closest('[data-ui-surface]')?.dataset.uiSurface||surface||(className?classifySurface(className):null);
    if(type==='screen'){if(!actions.querySelector('[data-command="fullscreen"]'))actions.insertAdjacentHTML('beforeend',fullscreenAction());}
    else for(const owned of actions.querySelectorAll('[data-surface-fullscreen]'))owned.remove();
    const back=actions.querySelector('[data-command="close-modal"],[data-surface-close],[data-game-menu-close]');if(back&&actions.lastElementChild!==back)actions.append(back);
  }
  function confirmationCopy(message,{title,acceptLabel}={}){
    const question=String(message).match(/^(.{1,120}?[?])/u)?.[1];
    title=title||question||String(message).split(/[.\n]/u)[0];
    const verb=title.match(/^(Удалить|Сбросить|Выйти|Покинуть|Закрыть|Остановить|Отправить|Получить|Синхронизировать|Заменить|Перезапустить|Пригласить|Добавить)/u)?.[1];
    return {title,description:String(message).startsWith(title)?String(message).slice(title.length).trim():String(message),acceptLabel:acceptLabel||verb||root.PlayroomMessages.text('ui.game-screen.confirm-action'),danger:/^(Удалить|Сбросить|Выйти|Покинуть|Закрыть|Остановить|Перезапустить)/u.test(title)};
  }
  function actionConfirmationMarkup(action,command='confirm-action'){
    const copy=confirmationCopy(action.confirmation,{title:action.title,acceptLabel:action.label});
    return `<h2>${esc(copy.title)}</h2>${copy.description?`<p class="lead">${esc(copy.description)}</p>`:''}<div class="modal-foot">${UI.button({attrs:'data-command="close-modal"',label:root.PlayroomMessages.text('ui.game-screen.cancel-action'),variant:'secondary'})}${UI.button({attrs:`data-command="${esc(command)}"`,label:copy.acceptLabel,variant:copy.danger?'danger':'primary'})}</div>`;
  }
  let confirmationSequence=0;
  function confirmDialog(message,options={}){
    const document=root.document,host=document.getElementById('modal-root'),copy=confirmationCopy(message,options);
    const dialogs=new root.PlayroomDOM.ModalController({host,background:document.getElementById('app')}),parent=dialogs.activeFrame();
    const revision=root.PlayroomCommunityUI?.service?.generation,id='app-confirm-'+(++confirmationSequence),context=root.PlayroomNetworkLibrary?.inviteContext?.();
    const valid=()=>{const next=root.PlayroomNetworkLibrary?.inviteContext?.();return parent?.state!=='disposed'&&revision===root.PlayroomCommunityUI?.service?.generation&&(!context?.room||next?.room?.id===context.room.id&&next.participantId===context.participantId)&&(!options.isCurrent||options.isCurrent());};
    return new Promise(resolve=>{
      let finished=false,frame=null,cleanup=()=>{};const events=new AbortController();
      const settle=value=>{if(finished)return;finished=true;resolve(value);};
      const finish=value=>{
        if(finished||!dialogs.isActive(frame))return;
        const accepted=!!value&&valid();settle(accepted);dialogs.close(frame,{reason:accepted?'accept':'back'});dialogs.dispose();
      };
      frame=dialogs.open(`<div class="modal-backdrop"><section class="modal app-confirm-dialog" data-ui-surface="panel" role="dialog" aria-modal="true" aria-labelledby="${id}-title"${copy.description?` aria-describedby="${id}-message"`:''}>${modalHead(copy.title)}${copy.description?`<div class="modal-body"><p id="${id}-message">${esc(copy.description)}</p></div>`:'<div class="modal-body"></div>'}<div class="modal-foot" data-fixed-footer>${UI.button({attrs:'data-confirm-cancel',label:root.PlayroomMessages.text('ui.game-screen.cancel-action'),variant:'secondary'})}${UI.button({attrs:'data-confirm-accept',label:copy.acceptLabel,variant:copy.danger?'danger':'primary'})}</div></section></div>`,{mode:'push',valid,meta:{owner:'confirmation',dismiss:()=>finish(false)},onDispose:()=>{events.abort();cleanup();settle(false);}});
      if(!frame){settle(false);dialogs.dispose();return;}
      frame.element.querySelector('.modal-head h2').id=id+'-title';
      cleanup=bindSurfaceDismiss(frame.element,{isActive:()=>dialogs.isActive(frame),onDismiss:()=>finish(false)});
      frame.element.addEventListener('click',event=>{
        if(!event.target.closest('[data-confirm-cancel],[data-confirm-accept],[data-command="close-modal"]'))return;
        event.preventDefault();event.stopImmediatePropagation();finish(!!event.target.closest('[data-confirm-accept]'));
      },{signal:events.signal});
      frame.element.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false);}},{signal:events.signal});
    });
  }
  const surfaceDismissBindings=new WeakMap();
  // Explicitly dismissible panels share one owned drag/tap controller.
  // The caller owns navigation; this helper never removes another surface itself.
  function bindPanelGesture(panel,{isActive=()=>panel?.isConnected,onDismiss=()=>{},handle=null}={}){
    const doc=panel.ownerDocument,win=doc.defaultView,events=new win.AbortController();let drag=null,bodyDrag=null,disposed=false,returnTimer=null;
    const active=()=>!disposed&&panel.isConnected&&isActive()===true;
    const placement=()=>{const edge=win.getComputedStyle(panel).getPropertyValue('--surface-dismiss-edge').trim();return {edge:['left','right'].includes(edge)?edge:'bottom',axis:['left','right'].includes(edge)?'x':'y',sign:edge==='left'?-1:1};};
    const coordinate=(event,state)=>state.sign*(state.axis==='x'?event.clientX:event.clientY);
    const samePlacement=state=>state.edge===placement().edge;
    const zoomed=()=>(win.visualViewport?.scale||1)>1.01;
    const release=()=>{const old=drag;drag=null;if(old)try{if(panel.hasPointerCapture(old.id))panel.releasePointerCapture(old.id);}catch(_){}return old;};
    const reset=(animate=false)=>{bodyDrag=null;release();win.clearTimeout(returnTimer);for(const key of ['--surface-pull-distance','--surface-pull-x','--surface-pull-y'])panel.style.removeProperty(key);if(animate){panel.dataset.surfacePulling='false';returnTimer=win.setTimeout(()=>panel.removeAttribute('data-surface-pulling'),180);}else panel.removeAttribute('data-surface-pulling');};
    const selection=target=>{const selected=doc.getSelection();return !!selected&&!selected.isCollapsed&&(!target||selected.containsNode(target,true));};
    const textAtPoint=event=>{let range=doc.caretRangeFromPoint?.(event.clientX,event.clientY);if(!range){const caret=doc.caretPositionFromPoint?.(event.clientX,event.clientY);if(caret){range=doc.createRange();range.setStart(caret.offsetNode,caret.offset);range.collapse(true);}}const text=range?.startContainer;if(text?.nodeType!==3||!text.textContent.trim())return false;const at=Math.min(range.startOffset,text.length-1);if(at<0||!text.textContent[at].trim())return false;range=range.cloneRange();range.setStart(text,at);range.setEnd(text,at+1);const box=range.getBoundingClientRect();return event.clientX>=box.left&&event.clientX<=box.right&&event.clientY>=box.top&&event.clientY<=box.bottom;};
    const eligible=target=>{
      if(handle?.contains(target))return true;
      if(target.closest('button,a,input,textarea,select,label,summary,[contenteditable],[role="button"],[role="slider"],[role="separator"],[draggable="true"],.chat-messages,.chat-message,.social-list,.chat-composer,.lobby-roster-scroll,[data-scene-scroll]'))return false;
      for(let node=target;node&&node!==panel;node=node.parentElement){const css=win.getComputedStyle(node);if(/auto|scroll/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+1||/auto|scroll/.test(css.overflowX)&&node.scrollWidth>node.clientWidth+1)return false;}
      return true;
    };
    const suppressReleaseClick=point=>root.PlayroomDOM.consumePointerReleaseClick(point,{document:doc});
    const scrollState=()=>{const body=panel.querySelector(':scope>.modal-body,:scope>.game-menu-v021-body'),nested=body?.querySelector('.chat-messages,.social-list,textarea,select,[contenteditable],[data-scene-scroll]'),value=!!nested||!!body&&body.scrollHeight>body.clientHeight+1;if(panel.dataset.panelScrollable!==String(value))panel.dataset.panelScrollable=String(value);};
    const observer=win.ResizeObserver?new win.ResizeObserver(scrollState):null;observer?.observe(panel);const body=panel.querySelector(':scope>.modal-body,:scope>.game-menu-v021-body');if(body)observer?.observe(body);scrollState();
    let outside=null,multiTouch=false;const touches=new Set();
    const syncZoom=()=>{if(zoomed()){panel.dataset.surfaceZoomed='true';outside=null;reset(true);}else delete panel.dataset.surfaceZoomed;};
    win.visualViewport?.addEventListener?.('resize',syncZoom,{signal:events.signal});syncZoom();
    // Browser suspension can omit pointerup/cancel. Never retain an old pinch
    // or capture owner when input resumes on the same still-open panel.
    const resetInput=()=>{outside=null;touches.clear();multiTouch=false;reset();syncZoom();};
    for(const type of ['blur','pagehide','pageshow'])win.addEventListener(type,resetInput,{signal:events.signal});
    doc.addEventListener('visibilitychange',resetInput,{signal:events.signal});
    const outsidePanel=target=>!panel.contains(target)&&!target.closest?.('[popover],.quick-reaction-picker,[data-ui-surface-exit],button,a,input,textarea,select,label,[role="button"],[contenteditable],[data-command],[data-action],[data-select],[data-drop]');
    doc.addEventListener('pointerdown',event=>{
      if(event.pointerType==='touch'){touches.add(event.pointerId);if(touches.size>1){multiTouch=true;outside=null;reset(true);}}
      if(multiTouch){outside=null;return;}
      outside=active()&&!doc.querySelector('[popover]:popover-open,.quick-reaction-picker')&&event.button===0&&event.isPrimary!==false&&outsidePanel(event.target)?{id:event.pointerId,x:event.clientX,y:event.clientY}:null;
    },{capture:true,signal:events.signal});
    const finishTouch=event=>{
      if(event.pointerType==='touch')touches.delete(event.pointerId);
      if(!multiTouch)return false;
      outside=null;reset(true);
      if(!touches.size){multiTouch=false;if(event.type==='pointerup')suppressReleaseClick({x:event.clientX,y:event.clientY});}
      return true;
    };
    doc.addEventListener('pointerup',event=>{if(finishTouch(event))return;const start=outside;outside=null;if(!start||event.pointerId!==start.id||!active()||!outsidePanel(event.target)||Math.hypot(event.clientX-start.x,event.clientY-start.y)>8)return;if(panel.getAttribute('aria-modal')!=='false'){event.preventDefault();event.stopImmediatePropagation();suppressReleaseClick({x:event.clientX,y:event.clientY});}onDismiss();},{capture:true,signal:events.signal});
    doc.addEventListener('pointercancel',event=>{finishTouch(event);outside=null;},{capture:true,signal:events.signal});
    // At the reading boundary, touch can pull the whole bottom sheet.
    // Pointer events alone cannot do that: native pan-y cancels their stream.
    const bodyTarget=target=>{
      if(!panel.contains(target)||handle?.contains(target))return false;
      // A tap stays a tap; only an actual outward drag claims buttons/labels.
      // Protect direct editing/selection and sliders, not focus on a radio.
      const protectedControl=target.closest('textarea,select,input:not([type="radio"]):not([type="checkbox"]):not([type="button"]):not([type="submit"]):not([type="reset"]),[contenteditable],[role="slider"],[role="separator"],[draggable="true"],.chat-composer,.lobby-roster-scroll,[data-scene-scroll]');
      if(protectedControl)return false;
      for(let node=target;node&&node!==panel;node=node.parentElement){const css=win.getComputedStyle(node);if(/auto|scroll/.test(css.overflowX)&&node.scrollWidth>node.clientWidth+1)return false;}
      return true;
    };
    const preparePull=state=>{
      const translate=win.getComputedStyle(panel).translate.split(/\s+/)[state.axis==='x'?0:1]||'0';state.base=state.sign*(translate.endsWith('%')?parseFloat(translate)*(state.axis==='x'?panel.offsetWidth:panel.offsetHeight)/100:parseFloat(translate)||0);
      for(const animation of panel.getAnimations())if(animation.animationName?.startsWith('ui-panel-'))animation.cancel();
      state.moved=true;
    };
    const showPull=state=>{const distance=state.base+state.distance;panel.dataset.surfacePulling='true';panel.style.setProperty('--surface-pull-distance',distance+'px');panel.style.setProperty('--surface-pull-x',(state.axis==='x'?state.sign*distance:0)+'px');panel.style.setProperty('--surface-pull-y',(state.axis==='y'?distance:0)+'px');};
    const settlePull=(state,point)=>{
      suppressReleaseClick(point);
      if((state.distance>=64||state.distance>=28&&state.velocity>.65)&&active()){
        if(onDismiss()===false&&active())reset(true);
      }else reset(true);
    };
    panel.addEventListener('touchstart',event=>{
      if(event.touches.length!==1||multiTouch||zoomed()||!active()||selection(event.target)||!bodyTarget(event.target)){bodyDrag=null;return;}
      const touch=event.touches[0];reset();const direction=placement();bodyDrag={...direction,id:touch.identifier,x:touch.clientX,y:touch.clientY,last:coordinate(touch,direction),time:event.timeStamp,distance:0,velocity:0,moved:false,claimed:false,target:event.target};
    },{passive:true,signal:events.signal});
    panel.addEventListener('touchmove',event=>{
      const state=bodyDrag;if(!state)return;
      const touch=[...event.touches].find(t=>t.identifier===state.id);
      if(!touch||event.touches.length!==1||!active()||zoomed()||selection(state.target)||!samePlacement(state)){reset(true);return;}
      const dx=touch.clientX-state.x,dy=touch.clientY-state.y,delta=state.sign*(state.axis==='x'?dx:dy),cross=state.axis==='x'?dy:dx;
      // Leave native reading and inertia alone above the top boundary. If the
      // browser has already committed its pan, a fresh pull at top owns dismissal.
      for(let node=state.target;node&&node!==panel;node=node.parentElement){
        const css=win.getComputedStyle(node);if(state.axis==='y'&&/auto|scroll/.test(css.overflowY)&&node.scrollHeight>node.clientHeight+1&&node.scrollTop>1){state.y=touch.clientY;state.last=coordinate(touch,state);state.time=event.timeStamp;return;}
      }
      if(!state.claimed){if(Math.hypot(dx,dy)<8)return;if(Math.abs(cross)>Math.abs(delta)||delta<0){bodyDrag=null;return;}state.claimed=true;}
      if(!event.cancelable){reset(true);return;}
      event.preventDefault();const remaining=coordinate(touch,state)-state.last;
      const elapsed=Math.max(1,event.timeStamp-state.time);state.velocity=remaining/elapsed;state.time=event.timeStamp;state.last=coordinate(touch,state);
      if(!state.moved)preparePull(state);state.distance=Math.max(0,state.distance+remaining);
      if(state.moved)showPull(state);
    },{passive:false,signal:events.signal});
    panel.addEventListener('touchend',event=>{
      const state=bodyDrag;if(!state||![...event.changedTouches].some(t=>t.identifier===state.id))return;bodyDrag=null;
      if(!state.moved)return;
      const touch=[...event.changedTouches].find(t=>t.identifier===state.id);if(event.cancelable)event.preventDefault();event.stopImmediatePropagation();
      // A pause before release is not a flick.
      if(event.timeStamp-state.time>100)state.velocity=0;
      settlePull(state,{x:touch.clientX,y:touch.clientY});
    },{passive:false,signal:events.signal});
    panel.addEventListener('touchcancel',()=>reset(true),{passive:true,signal:events.signal});
    panel.addEventListener('pointerdown',event=>{if(multiTouch||zoomed())return;if(drag&&event.pointerId!==drag.id){reset(true);return;}if(event.pointerType==='touch'&&bodyTarget(event.target))return;if(event.button!==0||!active()||selection(event.target)||!eligible(event.target)||textAtPoint(event))return;reset();drag={...placement(),id:event.pointerId,x:event.clientX,y:event.clientY,distance:0,velocity:0,moved:false,target:event.target};},{signal:events.signal});
    panel.addEventListener('pointermove',event=>{
      if(!drag||event.pointerId!==drag.id)return;if(!active()||selection(drag.target)||zoomed()||!samePlacement(drag)){reset(true);return;}
      const dx=event.clientX-drag.x,dy=event.clientY-drag.y,delta=drag.sign*(drag.axis==='x'?dx:dy),cross=drag.axis==='x'?dy:dx;if(!drag.moved&&Math.hypot(dx,dy)<8)return;if(!drag.moved&&(Math.abs(cross)>Math.abs(delta)||delta<0)){reset();return;}
      if(!drag.moved){preparePull(drag);try{panel.setPointerCapture(event.pointerId);}catch(_){}}
      drag.distance=Math.max(0,delta);event.preventDefault();showPull(drag);
    },{passive:false,signal:events.signal});
    panel.addEventListener('pointerup',event=>{if(!drag||event.pointerId!==drag.id)return;const old=release();if(!old.moved){reset();return;}event.preventDefault();event.stopImmediatePropagation();settlePull(old,{x:event.clientX,y:event.clientY});},{signal:events.signal});
    panel.addEventListener('pointercancel',()=>reset(true),{signal:events.signal});panel.addEventListener('lostpointercapture',event=>{if(event.target===panel&&drag)reset(true);},{signal:events.signal});
    if(handle)handle.addEventListener('click',event=>{if(!active())return;event.preventDefault();event.stopImmediatePropagation();onDismiss();},{signal:events.signal});
    win.addEventListener('resize',()=>{if(drag||bodyDrag)reset(true);},{signal:events.signal});
    return()=>{if(disposed)return;disposed=true;events.abort();observer?.disconnect();reset();touches.clear();delete panel.dataset.panelScrollable;delete panel.dataset.surfaceZoomed;};
  }
  function bindSurfaceDismiss(element,{isActive=()=>element?.isConnected,onDismiss=()=>{}}={}){
    const panel=element?.matches?.('.modal[data-ui-surface="panel"]')?element:element?.querySelector?.('.modal[data-ui-surface="panel"]');if(!panel||panel.matches('.game-chat-panel,.game-menu-panel'))return()=>{};
    surfaceDismissBindings.get(panel)?.();const closeButton=panel.querySelector('.modal-head [data-command="close-modal"],.modal-head [data-surface-close]');if(!closeButton)return()=>{};
    closeButton.classList.add('surface-panel-close');closeButton.innerHTML=icon('back');closeButton.setAttribute('aria-label','Назад');closeButton.setAttribute('title','Назад');
    const handle=panel.ownerDocument.createElement('button');handle.type='button';handle.className='surface-panel-handle';handle.dataset.surfaceDismiss='';handle.setAttribute('aria-label','Закрыть панель');handle.innerHTML='<span aria-hidden="true"></span>';panel.prepend(handle);
    const gesture=bindPanelGesture(panel,{isActive,onDismiss,handle});let disposed=false;const cleanup=()=>{if(disposed)return;disposed=true;gesture();if(!element.closest('[data-ui-surface-exit]')){handle.remove();closeButton.classList.remove('surface-panel-close');}surfaceDismissBindings.delete(panel);};surfaceDismissBindings.set(panel,cleanup);return cleanup;
  }
  // One owned chooser for every application dropdown. The select remains the
  // form/value port; the browser's native picker is never used.
  let selectChoiceFrame=null;
  function openSelectChoice(select,{title=null,owner='select-choice',optionAction=()=>'',optionLabelClass=()=>'',onAction=null,initialKey=''}={}){
    if(!select?.isConnected||select.matches(':disabled')||select.closest('[inert],[hidden]'))return null;
    if(selectChoiceFrame&&selectChoiceFrame.state!=='disposed')return selectChoiceFrame;
    const doc=select.ownerDocument,dialogs=new root.PlayroomDOM.ModalController({host:doc.getElementById('modal-root'),background:doc.getElementById('app')}),parent=dialogs.activeFrame(),sourceParent=select.parentElement;
    if(parent?!parent.element.contains(select):!select.closest('#app'))return null;
    const options=[...select.options].map(node=>({node,value:node.value,label:node.label||node.textContent,selected:node.selected,disabled:node.disabled||node.parentElement?.disabled}));
    title=title||select.getAttribute('aria-label');
    if(!title){
      const label=select.labels?.[0]||select.closest('label'),heading=(label?.querySelector('.setting-title-text')||label?.querySelector('span')||label)?.cloneNode(true);
      // Contextual help belongs to its own popover, never to the picker heading.
      for(const node of heading?.querySelectorAll('.rule-help,[popover],select,input,textarea,button,svg,[aria-hidden="true"]')||[])node.remove();
      title=heading?.textContent.trim().replace(/\s+/g,' ')||'Выберите значение';
    }
    const owns=()=>select.isConnected&&sourceParent.contains(select)&&!select.matches(':disabled')&&(!parent||parent.state!=='disposed'&&parent.element.contains(select));
    select.focus({preventScroll:true});let frame=null,cleanup=()=>{};
    const expanded=select.getAttribute('aria-expanded'),controls=select.getAttribute('aria-controls'),popup=select.getAttribute('aria-haspopup');
    const close=()=>dialogs.close(frame,{reason:'dismiss'});
    frame=dialogs.open(`<div class="modal-backdrop"><section class="modal select-choice-dialog pairing-choice-dialog" data-ui-surface="panel" role="dialog" aria-modal="true">${modalHead(title)}<div class="modal-body pairing-choice-list" role="group" aria-label="${esc(title)}">${options.map((option,index)=>`<div class="pairing-choice-row"><button type="button" class="pairing-choice-option" data-choice="${index}" aria-pressed="${option.selected}" ${option.disabled?'disabled':''}><span class="${esc(optionLabelClass(option))}">${esc(option.label)}</span></button>${optionAction(option,index)}</div>`).join('')}</div></section></div>`,{
      mode:'push',valid:owns,meta:{owner,dismiss:close},onDispose:()=>{cleanup();if(expanded===null)select.removeAttribute('aria-expanded');else select.setAttribute('aria-expanded',expanded);if(controls===null)select.removeAttribute('aria-controls');else select.setAttribute('aria-controls',controls);if(popup===null)select.removeAttribute('aria-haspopup');else select.setAttribute('aria-haspopup',popup);if(selectChoiceFrame===frame)selectChoiceFrame=null;}
    });
    if(!frame)return null;selectChoiceFrame=frame;
    const heading=frame.element.querySelector('h2'),panel=frame.element.querySelector('.modal');heading.id='select-choice-'+frame.id;panel.id='select-choice-panel-'+frame.id;panel.setAttribute('aria-labelledby',heading.id);select.setAttribute('aria-expanded','true');select.setAttribute('aria-haspopup','dialog');select.setAttribute('aria-controls',panel.id);
    cleanup=bindSurfaceDismiss(frame.element,{isActive:()=>dialogs.isActive(frame),onDismiss:close});
    const focusChoice=button=>{
      if(!button)return;button.focus({preventScroll:true});
      root.PlayroomDOM.revealInScrollport(frame.element.querySelector('.pairing-choice-list'),button);
    };
    frame.element.addEventListener('keydown',event=>{
      if(!dialogs.isActive(frame))return;
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
      const buttons=[...frame.element.querySelectorAll('[data-choice]:not(:disabled)')],index=buttons.indexOf(doc.activeElement);let next=null;
      if(event.key==='ArrowDown')next=buttons[(index+1)%buttons.length];else if(event.key==='ArrowUp')next=buttons[(index+buttons.length-1)%buttons.length];else if(event.key==='Home')next=buttons[0];else if(event.key==='End')next=buttons.at(-1);else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey)next=buttons.find(button=>button.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
      if(next){event.preventDefault();event.stopImmediatePropagation();focusChoice(next);}
    });
    frame.element.addEventListener('click',event=>{
      if(!dialogs.isActive(frame))return;
      if(event.target.closest('[data-command="close-modal"]')){event.preventDefault();event.stopImmediatePropagation();close();return;}
      if(onAction?.(event,{select,options,close,reopen:()=>openSelectChoice(select,{title,owner,optionAction,optionLabelClass,onAction})}))return;
      const button=event.target.closest('[data-choice]');if(!button||button.disabled)return;
      const option=options[Number(button.dataset.choice)];
      if(!owns()||!option||option.disabled||option.node.disabled||option.node.parentElement?.disabled||![...select.options].includes(option.node)||option.node.value!==option.value){close();root.PlayroomAppBridge?.toast?.('Параметры изменились. Выберите значение ещё раз.');return;}
      const changed=select.value!==option.value;select.value=option.value;close();if(changed){select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));}
    });
    const preferred=initialKey&&[...frame.element.querySelectorAll('[data-choice]:not(:disabled)')].find(button=>button.textContent.trim().toLocaleLowerCase().startsWith(initialKey.toLocaleLowerCase()));
    focusChoice(preferred||frame.element.querySelector('.pairing-choice-option[aria-pressed="true"]:not(:disabled)')||frame.element.querySelector('.pairing-choice-option:not(:disabled)'));
    const dismiss=cleanup,stopFocus=root.PlayroomDOM.trackScrollportFocus(frame.element.querySelector('.pairing-choice-list'),{isCurrent:()=>dialogs.isActive(frame)});cleanup=()=>{stopFocus();dismiss();};return frame;
  }
  if(root.document?.addEventListener)for(const type of ['mousedown','click','keydown'])root.document.addEventListener(type,event=>{
    const select=event.target.closest?.('select:not([multiple])');if(!select||select.closest('.pairing-network-choice,.pairing-sound-settings')||select.matches(':disabled')||select.closest('[inert],[hidden]'))return;
    if(type==='keydown'&&!['Enter',' ','ArrowDown','ArrowUp'].includes(event.key)&&!(event.key.length===1&&!event.ctrlKey&&!event.metaKey))return;
    event.preventDefault();if(type==='mousedown')return;if(type==='keydown')event.stopImmediatePropagation();openSelectChoice(select,{initialKey:type==='keydown'&&event.key.length===1?event.key:''});
  },true);
  // Surface type is decided before insertion; short choices never become long editors.
  function classifySurface(className=''){
    const classes=new Set(String(className).split(/\s+/));
    const screens=['lobby-incoming-modal','online-connecting-modal','lobby-invites-modal','updates-modal','post-update-modal','chat-modal','community-modal','settings-modal','appearance-modal','appearance-gallery-modal','storage-data-modal','cloud-saves-modal','pack-manager-modal','packs-modal','account-modal','notification-settings-modal','room-setup-modal','nearby-modal','result-modal'];
    return screens.some(name=>classes.has(name))?'screen':'panel';
  }
  function modalContent(content,{className='',surface=classifySurface(className)}={}){
    const template=root.document.createElement('template');template.innerHTML=content;
    const head=template.content.querySelector('.modal-head');normalizeSurfaceHead(head,className,{surface});
    const header=head?.outerHTML||'';head?.remove();
    const footer=template.content.querySelector('[data-fixed-footer],.modal-foot')||template.content.querySelector('form:not([data-inline-actions])>button[type="submit"]:last-child');
    if(footer){
      footer.setAttribute('data-fixed-footer','');
      const form=footer.closest('form');
      if(form){
        if(!form.id)form.id='modal-parameters-form';
        for(const control of [footer,...footer.querySelectorAll('button,input')]){
          if(control.matches('button,input'))control.setAttribute('form',form.id);
        }
      }
    }
    const footerMarkup=footer?.outerHTML||'';footer?.remove();
    return header+'<div class="modal-body">'+template.innerHTML+'</div>'+footerMarkup;
  }
  const DOM=root.PlayroomDOM||(typeof require==='function'?require('../platform/web/dom.js'):null),{patchChildren}=DOM;
  const pendingScroll=new WeakMap(), fixedLayouts=new WeakMap(), renderedTrees=new WeakMap(), renderedFragments=new WeakMap(), renderedSkeletons=new WeakMap(), handReserves=new WeakMap(),actionGeometryLocks=new WeakMap();
  const fragmentPreparationSelectors='.table-shell,.app-game-layout,.layout-actions,.scene-header-actions,.player-panel,.layout-hand,.player-hand,[data-public-sequence],[data-public-frame]';
  const sceneScrollState=host=>[...host.querySelectorAll('[data-scene-scroll],.hand-track,.hand-scroll')].map(node=>({node,top:node.scrollTop,left:node.scrollLeft}));
  function restoreSceneScroll(scrollers){
    for(const {node,top,left}of scrollers)if(node.isConnected){if(node.scrollTop!==top)node.scrollTop=top;if(node.scrollLeft!==left)node.scrollLeft=left;}
  }
  function parseSceneFragment(host,id,source){
    const parsed=host.ownerDocument.createElement('template');parsed.innerHTML=source;
    const tree=parsed.content.firstElementChild;
    if(!tree||tree.tagName==='TEMPLATE'&&!tree.hasAttribute('data-game-memo')||parsed.content.children.length!==1||[...parsed.content.childNodes].some(node=>node.nodeType!==1&&node.textContent.trim())||tree.querySelector('template[data-scene-fragment]'))throw Error('Scene fragment requires one independent element');
    tree.setAttribute('data-playroom-fragment',id);
    return {source,tree,reusable:!tree.matches(fragmentPreparationSelectors)&&!tree.querySelector(fragmentPreparationSelectors)};
  }
  function patchSceneFragments(host,markup,fragments){
    const skeleton=renderedSkeletons.get(host),previous=renderedFragments.get(host),baseline=renderedTrees.get(host);
    if(!skeleton||skeleton.markup!==markup||skeleton.viewport!==geometryViewport(host)||skeleton.identity!==geometryIdentity(host.querySelector('.table-shell'))||!baseline||!previous?.size||fragments?.size!==previous.size||baseline.querySelector('[data-public-sequence],[data-public-frame]'))return false;
    const live=new Map();for(const node of host.querySelectorAll('[data-playroom-fragment]')){const id=node.getAttribute('data-playroom-fragment');if(live.has(id))return false;live.set(id,node);}
    if(live.size!==previous.size)return false;
    const next=new Map(),groups=new Map();
    // Validate the whole transaction before moving any authored roots. Missing
    // DOM, preparation-sensitive fragments or a new context use the full path.
    for(const [id,prior]of previous){
      const source=fragments.get(id),node=live.get(id),parent=prior.tree.parentElement;
      if(typeof source!=='string'||!prior.reusable||!parent||!node||node.tagName!==prior.tree.tagName)return false;
      const entry=source===prior.source?prior:parseSceneFragment(host,id,source);if(!entry.reusable)return false;
      next.set(id,entry);
      let group=groups.get(parent);if(!group){group={parent,liveParent:node.parentElement,entries:new Map(),dirty:false};groups.set(parent,group);}
      if(group.liveParent!==node.parentElement)return false;
      group.entries.set(prior.tree,entry.tree);group.dirty||=entry!==prior;
    }
    const changes=[],scrollers=sceneScrollState(host);
    for(const group of groups.values()){
      if(!group.dirty)continue;
      const before=[...group.parent.childNodes],after=group.parent.cloneNode(false);
      for(const child of before)after.append(group.entries.get(child)||child);
      // The prior child references stay available to the existing DOM patcher;
      // unchanged subtrees are transferred, never cloned or parsed again.
      patchChildren(group.liveParent,after,{childNodes:before},change=>changes.push(change));
      group.parent.replaceWith(after);
    }
    renderedFragments.set(host,next);placeSceneStatus(host,host.ownerDocument.defaultView);placeSceneStatus(renderedTrees.get(host),host.ownerDocument.defaultView);updateGeometry(host,changes);restoreSceneScroll(scrollers);return true;
  }
  function releaseActionGeometry(node){
    const lock=actionGeometryLocks.get(node);if(!lock)return;
    for(const [property,value]of Object.entries(lock.generated))if(node.style.getPropertyValue(property)===value&&!node.style.getPropertyPriority(property)){const previous=lock.previous[property];if(previous.value)node.style.setProperty(property,previous.value,previous.priority);else node.style.removeProperty(property);}
    actionGeometryLocks.delete(node);
  }
  function lockActionGeometry(node,height){
    const generated={height:height+'px','min-height':height+'px','max-height':height+'px',overflow:'visible'},lock=actionGeometryLocks.get(node)||{previous:Object.fromEntries(Object.keys(generated).map(property=>[property,{value:node.style.getPropertyValue(property),priority:node.style.getPropertyPriority(property)}]))};
    lock.generated=generated;actionGeometryLocks.set(node,lock);for(const [property,value]of Object.entries(generated))node.style.setProperty(property,value);
  }
  function reservePlayerHand(panel,height){
    if(!height)return;
    let hand=panel.querySelector('.player-hand');
    if(!hand){hand=panel.ownerDocument.createElement('div');hand.className='player-hand';hand.setAttribute('aria-hidden','true');hand.setAttribute('inert','');panel.append(hand);}
    hand.style.minHeight=height+'px';
  }
  function handReserveKey(host,shell,stage){
    const win=host.ownerDocument.defaultView;
    return JSON.stringify([geometryIdentity(shell),win.innerWidth,win.innerHeight,root.PlayroomInterfaceScale?.applied,stage.dataset.surface,host.ownerDocument.documentElement.dataset.assetGeometry]);
  }
  // Resize does not necessarily render new markup: discard old viewport measurements first.
  function resetHandReserveForViewport(host,stage){
    const reserve=handReserves.get(host),shell=host.querySelector('.table-shell');
    if(!reserve||!shell||reserve.key===handReserveKey(host,shell,stage))return;
    handReserves.delete(host);
    for(const hand of stage.querySelectorAll('.layout-hand,.player-hand'))hand.style.removeProperty('min-height');
  }
  // Keep only geometry, never old cards, commands or private markup.
  function reserveHands(host,next,{measure=true}={}){
    const shell=next.querySelector('.table-shell'),stage=next.querySelector('.app-game-layout');
    if(!shell||!stage){handReserves.delete(host);return;}
    const key=handReserveKey(host,shell,stage);
    let reserve=handReserves.get(host);
    const same=reserve?.key===key;
    if(!same){reserve={key,own:0,players:new Map()};handReserves.set(host,reserve);}
    if(same&&measure){
      const previous=host.querySelector('.app-game-layout'),hand=previous?.querySelector('.layout-hand');
      if(hand)reserve.own=Math.max(reserve.own,hand.offsetHeight);
      for(const panel of previous?.querySelectorAll('.player-panel')||[]){
        const mini=panel.querySelector('.player-hand');
        if(mini)reserve.players.set(panel.dataset.playerIndex,Math.max(reserve.players.get(panel.dataset.playerIndex)||0,mini.offsetHeight));
      }
    }
    if(reserve.own){
      let hand=stage.querySelector('.layout-hand');const missing=!hand;
      const parent=stage.querySelector('.layout-self')||stage;
      if(!hand){hand=host.ownerDocument.createElement('section');hand.className='game-layout-slot layout-hand';hand.dataset.gameElement='hand';hand.setAttribute('aria-hidden','true');hand.setAttribute('inert','');parent.append(hand);}
      if(measure||missing)hand.style.minHeight=reserve.own+'px';
      stage.dataset.hasHand='true';
    }
    for(const panel of stage.querySelectorAll('.player-panel')){
      const height=reserve.players.get(panel.dataset.playerIndex);if(!height)continue;
      if(measure||!panel.querySelector('.player-hand'))reservePlayerHand(panel,height);
      stage.dataset.opponentHands='true';
    }
  }
  // Structural field grids share the scene lock. Store geometry only, never markup.
  const gridStyles=new WeakMap(), fieldLayouts=new WeakMap();
  const gridProperties=['grid-template-columns','grid-template-rows','grid-auto-columns','grid-auto-rows','grid-auto-flow','column-gap','row-gap','align-content','justify-content','align-items','justify-items'];
  function fieldGrids(stage){
    return [...stage.querySelectorAll('.game-field-groups,[data-layout-grid]')];
  }
  function restoreFieldGrids(stage){
    for(const node of fieldGrids(stage)){
      const saved=gridStyles.get(node);if(!saved)continue;
      for(const [key,value,priority] of saved.authored){
        // An authored patch may already have replaced this property. Release
        // only the geometry still owned by this lock.
        if(node.style.getPropertyPriority(key)!=='important'||node.style.getPropertyValue(key)!==saved.geometry.get(key))continue;
        if(value)node.style.setProperty(key,value,priority);else node.style.removeProperty(key);
      }
      gridStyles.delete(node);
    }
  }
  function lockFieldGrids(stage,locked){
    const win=stage.ownerDocument.defaultView;
    locked.fieldGrids??=new Map();
    for(const [index,node] of fieldGrids(stage).entries()){
      const key=node.dataset.layoutGrid||`field-groups:${index}`,css=win.getComputedStyle(node);
      if(!['grid','inline-grid'].includes(css.display))continue;
      let geometry=locked.fieldGrids.get(key);
      if(!geometry){geometry=gridProperties.map(prop=>[prop,css.getPropertyValue(prop)]);locked.fieldGrids.set(key,geometry);}
      gridStyles.set(node,{authored:gridProperties.map(prop=>[prop,node.style.getPropertyValue(prop),node.style.getPropertyPriority(prop)]),geometry:new Map(geometry)});
      for(const [prop,value] of geometry)node.style.setProperty(prop,value,'important');
    }
  }
  function allowLayoutChange(host,{allowLayoutChange=false}={}){
    if(allowLayoutChange===true)fixedLayouts.delete(host);
  }
  // Keep the authored patch trees and live DOM under the same action owner.
  function placeSceneActions(tree,win){
    const base=tree?.querySelector('.app-game-layout'),own=base?.querySelector(':scope>.layout-self'),metadata=base?.querySelector('.layout-status');
    if(own&&metadata){const target=win.matchMedia('(orientation:landscape)').matches?own:base;if(metadata.parentElement!==target)target.prepend(metadata);}
    const stage=tree?.querySelector('.app-game-layout[data-action-placement="header-landscape"]');if(!stage)return;
    const header=tree.querySelector('.table-header'),actions=stage.querySelector('.layout-actions')||header?.querySelector('.scene-header-actions');if(!actions)return;
    const sidebar=stage.querySelector('[data-scene-actions-home="landscape"]'),inSidebar=win.matchMedia('(orientation:landscape)').matches&&!!sidebar;
    const inHeader=win.matchMedia('(orientation:landscape)').matches&&!!header&&!inSidebar;
    actions.classList.toggle('scene-header-actions',inHeader);
    const target=inSidebar?sidebar:inHeader?header:stage.querySelector('.layout-self')||stage;
    if(actions.parentElement!==target){if(inHeader)target.insertBefore(actions,target.querySelector('.game-frame-tools,.table-tools'));else target.append(actions);}
  }
  function fitHeaderActionRow(host,{reset=false}={}){
    const header=host.querySelector('.game-frame-header');if(!header)return;
    const actions=header.querySelector(':scope>.scene-header-actions'),heading=header.querySelector(':scope>.game-frame-heading'),tools=header.querySelector(':scope>.game-frame-tools');
    if((reset||!actions)&&header.classList.contains('game-frame-actions-wrapped'))header.classList.remove('game-frame-actions-wrapped');
    if(!actions||!heading||!tools||header.classList.contains('game-frame-actions-wrapped'))return;
    const h=heading.getBoundingClientRect(),t=tools.getBoundingClientRect();
    if(t.top>=h.bottom-1)header.classList.add('game-frame-actions-wrapped');
  }
  function placeSceneStatus(tree,win){
    if(!tree)return;
    const home=tree.querySelector('[data-scene-status-home]'),bar=tree.querySelector('.table-status,.game-frame-status');
    const content=home?.querySelector('[data-scene-status]')||bar?.querySelector('[data-scene-status]');
    if(!content||!home||!bar)return;
    const target=win.matchMedia('(orientation:portrait)').matches||content.dataset.sceneStatus==='always'?bar:home;
    if(target===bar)for(const old of [...bar.querySelectorAll('[data-scene-status]')])if(old!==content)old.remove();
    if(content.parentElement!==target)target.prepend(content);
  }
  // Pending input is an interaction state, not another scene revision.
  function interactionState(host,{pending=false,busy=pending}={}){
    const shell=host.querySelector('.table-shell'),stage=host.querySelector('.app-game-layout');
    if(shell&&shell.hasAttribute('data-input-pending')!==pending)shell.toggleAttribute('data-input-pending',pending);
    if(stage&&stage.getAttribute('aria-busy')!==String(busy))stage.setAttribute('aria-busy',String(busy));
  }
  function update(host,markup,{preserveLayout=false,fragments=null}={}){
    root.PlayroomPublicSequence?.useSources(host,fragments?.publicFrames);
    const keyed=DOM.keyedFragments(markup);
    if(keyed.fragments.size){const merged=new Map(fragments);for(const [id,source]of keyed.fragments){if(merged.has(id))throw Error('Duplicate scene fragment');merged.set(id,source);}merged.publicFrames=fragments?.publicFrames;fragments=merged;markup=keyed.markup;}
    if(patchSceneFragments(host,markup,fragments))return true;
    const template=host.ownerDocument.createElement('template');template.innerHTML=markup;
    const before=host.querySelector('.table-shell'),after=template.content.querySelector('.table-shell');
    const previous=before&&after&&geometryIdentity(before)===geometryIdentity(after)?renderedTrees.get(host):null;
    const priorFragments=previous?renderedFragments.get(host):null,nextFragments=new Map(),deferred=new Map();
    // These nodes are transformed by preparation ports, so they keep their full
    // preparation path. Pure regions may reuse their immutable authored tree.
    for(const marker of template.content.querySelectorAll('template[data-scene-fragment]')){
      const id=marker.dataset.sceneFragment,source=fragments?.get(id);
      if(typeof source!=='string'||nextFragments.has(id)||nextFragments.size>=256)throw Error('Invalid scene fragment');
      const prior=priorFragments?.get(id);let entry;
      if(prior?.source===source){
        if(prior.reusable){entry=prior;deferred.set(id,entry.tree);}
        else{entry={...prior,tree:prior.tree.cloneNode(true)};marker.replaceWith(entry.tree);}
      }else{entry=parseSceneFragment(host,id,source);marker.replaceWith(entry.tree);}
      nextFragments.set(id,entry);
    }
    const resolveTemplate=deferred.size?marker=>deferred.get(marker.dataset.sceneFragment):null;
    placeSceneActions(template.content,host.ownerDocument.defaultView);
    const changes=[];
    const scrollers=sceneScrollState(host);
    if(!previous)fixedLayouts.delete(host);
    reserveHands(host,template.content,{measure:!previous});
    root.PlayroomPublicSequence?.prepare(host,template.content);
    if(!previous)restoreFieldGrids(host);
    patchChildren(host,template.content,previous,change=>changes.push(change),resolveTemplate);
    // Transfer retained authored roots only after the old baseline was consumed.
    if(resolveTemplate)for(const marker of template.content.querySelectorAll('template[data-scene-fragment]'))marker.replaceWith(resolveTemplate(marker));
    renderedTrees.set(host,template.content);renderedFragments.set(host,nextFragments);
    renderedSkeletons.set(host,{markup,identity:geometryIdentity(after),viewport:geometryViewport(host)});
    placeSceneStatus(host,host.ownerDocument.defaultView);placeSceneStatus(template.content,host.ownerDocument.defaultView);
    if(!previous||changes.some(({node,parent})=>node?.closest?.('.game-frame-header')||parent?.closest?.('.game-frame-header')))fitHeaderActionRow(host);
    if(!previous)pendingScroll.set(host,scrollers);
    if(previous){updateGeometry(host,changes);root.PlayroomPublicSequence?.bind(host);restoreSceneScroll(scrollers);}else retireGeometry(host);
    return !!previous;
  }
  let modalTitleSequence=0;
  function updateModal(modal,content){
    const titleId=modal.querySelector('.modal-head h2')?.id;
    const template=modal.ownerDocument.createElement('template');template.innerHTML=modalContent(content,{className:modal.className,surface:modal.dataset.uiSurface||classifySurface(modal.className)});
    const nextHeading=template.content.querySelector('.modal-head h2');if(titleId&&nextHeading&&!nextHeading.id)nextHeading.id=titleId;
    const scrolls=[...modal.querySelectorAll('.modal-body,.lobby-roster-scroll')].map(node=>{
      const anchor=[...node.querySelectorAll('.room-v021-row,.lobby-seat-row,.lobby-observer,.pack-entry')].find(el=>layoutRect(el).bottom>layoutRect(node).top&&(!el.matches('.pack-entry')||content.includes(`data-pack-id="${el.dataset.packId}" data-pack-version="${el.dataset.packVersion}"`)));
      return {node,scroll:node.scrollTop,anchor,top:anchor?layoutRect(anchor).top:0};
    });
    patchChildren(modal,template.content);
    const heading=modal.querySelector('.modal-head h2');
    if(heading){heading.id ||= titleId||'modal-title-'+(++modalTitleSequence);modal.setAttribute('aria-labelledby',heading.id);}
    fitCovers(modal);fitGameTitles(modal);
    for(const {node,scroll,anchor,top}of scrolls)if(node.isConnected){node.scrollTop=scroll;if(anchor?.isConnected)node.scrollTop+=layoutRect(anchor).top-top;}

  }
  function roundText(round){return round&&Number.isSafeInteger(round.number)&&round.number>0?globalThis.PlayroomMessages.text(round.kind==='bout'?'progress.bout':round.limit?'progress.round-of':'progress.round',{number:round.number,...(round.limit?{limit:round.limit}:{})}):'';}
  function participantsMarkup(state,{network=false,participants=[],teamLayouts={},selfId=null,selfIndex=null}={}){
    if(!state?.players)return '';
    const people=state.players.map((person,index)=>{
      const presence=participants.find(p=>p.playerIndex===index)||{};
      const player={...person,...presence},semantic=state.scene?.players?.find(p=>p.player===index);
      const team=semantic?.team||UI.helpers.teamFor(teamLayouts,state.preset,index);
      const self=!player.bot&&(network?!!(selfId&&player.id===selfId||selfIndex===index||player.local):!!player.local);
      return `<span class="resume-person ${state.status!=='finished'&&index===state.turn?'saved-current-turn':''}"><span class="player-avatar-wrap">${UI.avatar(player,index)}${UI.helpers.playerMedallion({first:state.firstPlayer===index&&root.PlayroomCatalog?.[state.game]?.capabilities?.firstPlayer!==false,team})}</span><span class="resume-person-name">${UI.helpers.participantIcon(player,{network})}<span${self?' class="saved-self"':''}>${esc(player.nickname||player.name)}</span></span></span>`;
    });
    if(network)for(const table of participants.filter(person=>person.role==='table')){
      people.push(`<span class="resume-person resume-table"><span class="resume-person-name">${UI.helpers.participantIcon(table,{network:true})}<span>${esc(table.nickname||table.name||root.PlayroomMessages.text('ui.ui.da639244db1d'))}</span></span></span>`);
    }
    return `<div class="resume-participants">${people.join('')}</div>`;
  }
  function transportInfo(mode='hotseat'){const key=['hotseat','network','online'].includes(mode)?mode:'hotseat';return {mode:key,icon:{hotseat:'gamepad',network:'wifi',online:'globe'}[key],label:root.PlayroomMessages.text('ui.community.mode-'+key)};}
  function transportBadge(mode){const info=transportInfo(mode);return `<span class="transport-badge" data-transport-mode="${info.mode}" role="img" aria-label="${esc(info.label)}" title="${esc(info.label)}">${icon(info.icon)}</span>`;}
  function sessionCard({tag='article',className='',attrs='',gameName='',mode='hotseat',status='',badgeTitle='',participants='',roomName='',progress='',actions='',details='',bottomAction='',summary=''}){
    const kindBadge=(cloud=false)=>`<span class="pill session-kind-badge" title="${esc(badgeTitle||transportInfo(mode).label)}">${status}${cloud?'':transportBadge(mode)}</span>`;
    if(className.split(/\s+/).includes('saved-game')){
      // Saved cards keep their full context stable; rare operations belong to an owned overlay.
      const labelled=markup=>markup.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g,(_,attributes,body)=>{const label=attributes.match(/aria-label="([^"]*)"/)?.[1]||attributes.match(/title="([^"]*)"/)?.[1]||'';return `<button${attributes.replace(/class="([^"]*)"/,(_,classes)=>`class="${classes.split(/\s+/).filter(c=>c!=='icon-btn').join(' ')} saved021-command"`)}>${body}${label?`<span>${label}</span>`:''}</button>`;});
      const cloud=className.split(/\s+/).includes('cloud-only-game');
      const cloudId=attrs.match(/data-cloud-id="([^"]*)"/)?.[1];if(cloudId&&!attrs.includes('data-entity='))attrs+=` data-entity="cloud:${cloudId}"`;
      const copy=`<span class="saved021-copy"><strong class="saved021-title">${kindBadge(cloud)}${esc(gameName)}</strong></span>`;
      const descriptor=`<span class="saved021-summary">${esc(cloud?badgeTitle||'В облаке':summary||badgeTitle)}</span>`;
      return `<${tag} class="${className} saved021-card" data-card-mode="${esc(mode)}" ${attrs} role="button" tabindex="0" data-saved-actions-toggle aria-expanded="false" aria-haspopup="dialog" aria-label="Действия партии ${esc(gameName)}"><div class="saved021-front">${copy}</div><section class="saved021-context" data-saved-context aria-label="Сведения о партии">${descriptor}${roomName?`<strong class="saved021-room">${esc(roomName)}</strong>`:''}${participants}${progress?`<span class="saved021-progress">${esc(progress)}</span>`:''}${details?`<div class="saved021-details">${details}</div>`:''}</section><template data-saved-action-tray>${labelled(actions+bottomAction)}</template></${tag}>`;
    }
    return `<${tag} class="session-card ${className}" data-card-mode="${esc(mode)}" ${attrs}><div class="session-card-heading"><span class="saved-status">${kindBadge()}</span><h2 class="session-card-title"><strong>${esc(gameName)}</strong></h2>${className.includes('saved-game')?'<button type="button" class="icon-btn" data-saved-actions-toggle aria-expanded="false" aria-label="Действия партии">⋯</button>':''}</div><div class="session-card-actions ${className.includes('resume-banner')?'resume-actions':'saved-game-actions'}">${actions}</div>${roomName?`<strong class="session-card-room">${esc(roomName)}</strong>`:''}${participants}<div class="session-card-footer"><div class="session-card-progress"><span class="session-card-stats">${esc(progress)}</span></div>${details||bottomAction?`<div class="session-card-details">${details}</div><div class="session-card-bottom-action ui-action-row">${bottomAction}</div>`:''}</div></${tag}>`;
  }
  function resumeCard({attrs='',roomName='',gameName='',state=null,network=false,transportMode=network?'network':'hotseat',connected=true,participants=[],teamLayouts={},action='data-command="resume"',leave='',hide='',actionLabel='',details=''}){
    if(state?.status==='finished'&&(!network||!connected))return '';
    const text=root.PlayroomMessages.text;
    const progress=[roundText(state?.scene?.round),state?.timeline?.turn?text('progress.turn',{number:state.timeline.turn}):'',Number.isFinite(state?.move)?text('ui.app.action-count',{count:state.move}):''].filter(Boolean).join(' · ');
    const status=network?`<i class="connection-light ${connected?'is-connected':'is-disconnected'}" role="img" aria-label="${esc(text(connected?'ui.resume.connected':'ui.resume.disconnected'))}" title="${esc(text(connected?'ui.resume.connected':'ui.resume.disconnected'))}"></i>`:`<span class="saved-state-icon">${icon(state?.status==='finished'?'trophy':'pause')}</span>`;
    const actions=(leave?iconButton(leave,text('ui.game-screen.5af791bedf3a'),'exit'):hide?iconButton(hide,text('ui.app.hide-local-session'),'close'):'')+iconButton(action,actionLabel||(connected?text('ui.game-screen.a42aee58d60a'):text('ui.game-screen.2de34a1774f6')),connected?'play':'reset',{className:'resume-primary'});
    return sessionCard({attrs,tag:'section',className:'resume-banner '+(network?'network-resume-card':''),gameName,mode:transportMode,status,roomName,progress,actions,details,participants:participantsMarkup(state,{network,participants,teamLayouts})});
  }
  // The same markup is used with a trusted local Session and with the
  // projection-only SessionClient. No rule or network state is read here.
  function playersMarkup(state,viewer,actions=[],{scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerBadge=()=>''}={}){
    return [...UI.seatOrder(state.players.length,viewer),...(viewer>=0&&viewer<state.players.length?[viewer]:[])].map(i=>UI.playerPanel(state,i,viewer,{scoreLabel,badges:[playerBadge(state,i)].filter(Boolean)},actions)).join('');
  }

  function historyMarkup({index,count,caption='',playing=false,readOnly=false,newFrom=null,roundStarts=[],turnStarts=[],minimum=0}={}){
    return `<section class="history-panel" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.50d264e3cfa4")}"><div class="history-controls">${roundStarts.length?`<button class="icon-btn history-round-button" data-command="replay-round-prev" aria-label="${esc(globalThis.PlayroomMessages.text('progress.prev-round'))}" ${index<=minimum?'disabled':''}><span aria-hidden="true">≪</span></button>`:''}<button class="icon-btn" data-command="replay-prev" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.6a458bd0ee56")}" ${index<=minimum?'disabled':''}>${icon('prev')}</button><button class="icon-btn" data-command="replay-play" aria-label="${playing?globalThis.PlayroomMessages.text("ui.game-screen.3396400da0c4"):globalThis.PlayroomMessages.text("ui.game-screen.bdd37eb21746")} ${globalThis.PlayroomMessages.text("ui.game-screen.8be4990dd2c1")}">${icon(playing?'pause':'play')}</button><span class="replay-track ${Number.isInteger(newFrom)&&newFrom>0&&newFrom<=count?'has-new-history':''}" style="--new-from:${Number.isInteger(newFrom)&&count>0?Math.max(0,Math.min(100,(newFrom-minimum)/Math.max(1,count-minimum)*100)):100}%">${turnStarts.filter(revision=>Number.isSafeInteger(revision)&&revision>minimum&&revision<=count&&!roundStarts.some(mark=>mark.revision===revision)).map(revision=>`<i class="history-turn-marker" style="left:calc(8px + (100% - 16px) * ${(revision-minimum)/Math.max(1,count-minimum)})"></i>`).join('')}${roundStarts.filter(mark=>Number.isInteger(mark.revision)&&mark.revision>minimum&&mark.revision<=count).map(mark=>`<i class="history-round-marker" style="left:calc(8px + (100% - 16px) * ${(mark.revision-minimum)/Math.max(1,count-minimum)})" title="${esc(globalThis.PlayroomMessages.text('progress.round-start',{number:mark.number}))}"></i>`).join('')}<input type="range" min="${minimum}" max="${count}" value="${index}" id="replay-range" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.6d38f72f9e93")}"></span><button class="icon-btn" data-command="replay-next" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.baa4f395d537")}" ${index===count?'disabled':''}>${icon('next')}</button>${roundStarts.length?`<button class="icon-btn history-round-button" data-command="replay-round-next" aria-label="${esc(globalThis.PlayroomMessages.text('progress.next-round'))}" ${index===count?'disabled':''}><span aria-hidden="true">≫</span></button>`:''}<span class="replay-badge" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.3cc3ea21bf69")}${index-minimum} ${globalThis.PlayroomMessages.text("ui.game-screen.ef9f13d03f4e")}${count-minimum}">${index-minimum} / ${count-minimum}</span></div></section>`;
  }
  function deleteConfirmation({name=globalThis.PlayroomMessages.text("ui.game-screen.02c17edea60f"),network=false,confirmAttrs=''}){
    return `${modalHead(globalThis.PlayroomMessages.text("ui.game-screen.97e625bfddc6"))}<p class="lead">${esc(name)} ${globalThis.PlayroomMessages.text("ui.game-screen.c45481781f5f")}${network?globalThis.PlayroomMessages.text("ui.game-screen.9264423128bd"):globalThis.PlayroomMessages.text("ui.game-screen.b01c15488ec5")}. ${globalThis.PlayroomMessages.text("ui.game-screen.6905ded6e0fe")}</p><div class="modal-foot">${UI.button({attrs:'data-command="close-modal"',label:globalThis.PlayroomMessages.text("ui.game-screen.97b65905439a"),variant:'secondary'})}${UI.button({attrs:confirmAttrs,icon:'trash',label:globalThis.PlayroomMessages.text("ui.game-screen.be99b1361201"),variant:'danger'})}</div>`;
  }
  const soundedResults=new WeakSet();
  function resultSound(state,viewer){
    if(state?.status!=='finished')return null;
    if(viewer<0||viewer>=state.players.length)return 'notify';
    if(state.winner==null)return 'draw-game';
    if((state.winners||[state.winner]).includes(viewer))return 'victory';
    const places=state.result?.places;
    return places&&places[viewer]<Math.max(...places)?'draw-game':'defeat';
  }
  function presentResultSound(owner,state,viewer,play){
    const sound=resultSound(state,viewer);
    if(!sound||soundedResults.has(owner))return false;
    soundedResults.add(owner);play([sound],state.game);return true;
  }
  function resultMarkup({state,viewer,gameName,scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerContent=[],network=false,canRematchStart=false,returnAction={command:'rematch',label:'В лобби'}}={}){
    if(!state||state.status!=='finished')return '';
    const winner=state.winner,winningPlayers=state.winners|| (winner==null?[]:[winner]),person=winner==null?null:state.players[winner];
    const title=winner===null?globalThis.PlayroomMessages.text("ui.game-screen.4af04ce619c5"):viewer<0?winningPlayers.length>1?globalThis.PlayroomMessages.text("ui.game-screen.b271075deff7")+winningPlayers.map(i=>state.players[i]?.name||globalThis.PlayroomMessages.text("ui.game-screen.f54f58cf08df")).join(', '):globalThis.PlayroomMessages.text("ui.game-screen.133252d718b0",{p0:String(person?.name||globalThis.PlayroomMessages.text("ui.game-screen.f54f58cf08df"))}):winningPlayers.includes(viewer)?globalThis.PlayroomMessages.text("ui.game-screen.a5f1eda8ce7a"):globalThis.PlayroomMessages.text("ui.game-screen.379be9d6d960");
    const semanticContent=UI.playerContent(state,viewer,null);
    const scores=state.players.map((player,i)=>({player,i})).sort((a,b)=>(state.result?.places?.[a.i]??0)-(state.result?.places?.[b.i]??0)||a.i-b.i).map(({player,i})=>{
      const place=state.result?.places?.[i],value=state.result?.values?.[i],detail=state.result?.details?.[i];
      const medal=state.result?.lastPlayers?.includes(i)?UI.playerMedallion({last:true}):place?UI.playerMedallion({place,layout:UI.helpers.tokenLayout.fan(0,{count:2})}):winningPlayers.includes(i)?'★ ':'';
      const team=playerContent[i]?.team||state.scene?.players?.find(player=>player.player===i)?.team||null;
      const first=state.firstPlayer===i&&root.PlayroomCatalog?.[state.game]?.capabilities?.firstPlayer!==false;
      const playerBadge=UI.playerMedallion({first,team,layout:medal?UI.helpers.tokenLayout.fan(1,{count:2}):null});
      const badge=`<span class="result-awards">${medal}${playerBadge}</span>`;
      const content=playerContent[i]||semanticContent[i]||{},counters=content.counters??[{kind:'points',value:Number.isSafeInteger(player.score)&&player.score>=0?player.score:0,label:scoreLabel}];
      const shown=[...counters].sort((a,b)=>(a.kind==='wins')-(b.kind==='wins'));
      const hand=Number.isSafeInteger(content.handCount)?UI.countBadge(content.handCount,globalThis.PlayroomMessages.text("ui.game-screen.aac1090346a5",{p0:String(player.name),p1:String(content.countLabel||globalThis.PlayroomMessages.text("ui.game-screen.c81b450ffa45"))}),{hand:true}):'';
      const indicators=Array.isArray(content.indicators)?UI.indicators(content.indicators.map(({icon,value,size,label})=>({icon,value,size,label}))):'';
      const primary=`<span class="result-core-counters">${hand}${shown.map(UI.scoreBadge).join('')}</span>${indicators}`;
      const shownIds=new Set([...shown.map(counter=>counter.id||counter.kind),...(Number.isSafeInteger(content.handCount)?[content.handMetricId||'hand-count']:[]),...(content.indicators||[]).map(indicator=>indicator.id).filter(Boolean)]);
      const botSettings=player.bot&&(state.scene?.players?.find(p=>p.player===i)?.botSettings||player.botSettings);
      const botConfig=root.TabletopCore?.GAMES?.find(game=>game.id===state.game)?.botSettings;
      const strategy=botSettings?.resolvedStrategy||botSettings?.strategy;
      const botDescription=player.bot?(botConfig?.strategies?.find(p=>p.id===strategy)?.label||''):'';
      const extra=(state.result?.metrics||[]).filter(metric=>metric.display!=='ranking'&&!shownIds.has(metric.id)&&Number.isFinite(metric.values?.[i])).map(metric=>`${metric.label}: ${Number.isInteger(metric.maximumFractionDigits)&&metric.maximumFractionDigits>=0&&metric.maximumFractionDigits<=6?new Intl.NumberFormat('ru',{maximumFractionDigits:metric.maximumFractionDigits}).format(metric.values[i]):metric.values[i]}`);
      const exit=state.result?.exits?.find(exit=>exit.player===i);
      const exitText=exit?globalThis.PlayroomMessages.text('ui.game-screen.exit-'+exit.kind)+' · '+globalThis.PlayroomMessages.text(exit.round?'progress.round':'progress.turn',{number:exit.round||exit.turn}):'';
      return `<div class="result-person">${badge}${UI.avatar(player,i)}<span class="result-name"><span class="result-nickname">${i===viewer?`<strong>${esc(player.name)}</strong>`:esc(player.name)}</span>${botDescription?`<small class="result-bot-settings">${esc(botDescription)}</small>`:''}</span><span class="result-stat"><span class="result-counters">${primary}</span>${extra.length?`<small title="${esc(extra.join(' · '))}">${esc(extra.join(' · '))}</small>`:''}</span>${exitText?`<small class="result-exit">${esc(exitText)}</small>`:''}</div>`;
    }).join('');
    return `${modalHead('Итог партии',{dismissible:!network})}<section class="result-v021"><div class="result-v021-summary"><span class="result-v021-marker" aria-hidden="true">${icon('trophy')}</span><h3>${esc(title)}</h3><p>${esc(gameName)} · Действий за столом: ${state.move}</p></div><div class="result-scores" data-game="${esc(state.game)}">${scores}</div><button type="button" class="result-v021-history" data-command="result-replay">${icon('history')}<span>${globalThis.PlayroomMessages.text(network?"ui.game-screen.network-history":"ui.game-screen.5818f0c93a9b")}</span></button></section><footer class="result-v021-footer" data-fixed-footer><button type="button" class="btn" data-command="${esc(returnAction.command)}">${icon(returnAction.command==='home'?'grid':'room')}${esc(returnAction.label)}</button>${!network&&canRematchStart?'<button type="button" class="btn secondary" data-command="rematch-start">'+icon('play')+'Ещё партию</button>':''}</footer>`;
  }
  function turnNotice({play=()=>{},reducedMotion=()=>false}={}){
    let previous=null,timer=null;
    return {
      observe({sessionId,revision,turn,viewer,status,paused=false,active=true,mount=document}){
        if(mount.querySelector('.app-game-layout[data-show-turn="false"]')){this.reset();return false;}
        if(!active)return false;
        const next={sessionId,revision,turn};
        const started=active&&previous&&previous.sessionId===sessionId&&revision>previous.revision&&turn!==previous.turn&&turn===viewer&&status==='playing'&&!paused;
        previous=next;
        if(!started)return false;
        const card=mount.querySelector(`.player-panel[data-player-index="${viewer}"]`);
        if(card&&!reducedMotion()){
          card.classList.remove('turn-start-flash');void card.offsetWidth;card.classList.add('turn-start-flash');
          clearTimeout(timer);timer=setTimeout(()=>card.classList.remove('turn-start-flash'),1000);
        }
        play();return true;
      },
      reset(){previous=null;clearTimeout(timer);}
    };
  }
  function render({layoutId='',gameName,shortName='',subtitle='',state,viewer,actions=[],scene='',turnText='',turnExtra='',replay=false,
    busy=false,botThinking=false,animationSpeed='',beforeFooter='',historyHTML='',footerText='',footerTitle=footerText,footerAction={command:'home',label:globalThis.PlayroomMessages.text("ui.game-screen.1fd4bffb137b"),icon:'back'},
    fragmentSink=null,statusExtra='',footerExtra='',saved=null,showSettings=true,network=false,revision=null,scoreLabel=globalThis.PlayroomMessages.text("ui.game-screen.d7ab0767bbee"),playerBadge,historyResult=false,readOnly=false,pause=false,canPause=true,historyCaption='',roomAction=null,fieldToggle=null,extraMenuActions=[]}={}){
    fieldToggle=network&&!readOnly&&viewer>=0?fieldToggle:null;
    if(!state?.players)throw Error('Projected game state required');
    const showTurn=!scene.includes(' data-show-turn="false"');
    if(!showTurn){turnText='';turnExtra='';}
    const primary=historyResult||(!network&&state.status==='finished')?{attrs:'data-command="result"',label:globalThis.PlayroomMessages.text("ui.game-screen.24735a7161d9"),name:'trophy'}:roomAction?{...roomAction,label:globalThis.PlayroomMessages.text("ui.game-screen.3a73248bdd79"),name:'room'}:null;
    const eventCaption=replay?(historyCaption||footerText||''):footerText||'';
    const caption=esc(/^(начальная расстановка|(?:.*: )?партия началась)[.!]?$/iu.test(eventCaption.trim())?'':eventCaption);
    const cornerSlot='<div class="handoff-corner"><!--handoff-control--></div>';
    const cornerControl=scene.includes(cornerSlot)?beforeFooter:'';
    if(scene.includes(cornerSlot)){scene=scene.replace(cornerSlot,'');beforeFooter='';}
    if(beforeFooter&&scene.includes('<!--handoff-control-->'))scene=scene.replace('<!--handoff-control-->',beforeFooter);
    else if(beforeFooter){const slot=scene.indexOf('data-game-element="actions"');if(slot>=0){const end=scene.indexOf('>',slot);scene=scene.slice(0,end+1)+beforeFooter+scene.slice(end+1);}else scene=scene.replace('<!--self-controls-->',beforeFooter);}
    let cover=`<span class="pack-art game-frame-cover" aria-hidden="true">${root.PlayroomViews?.cover?.(state.game)||icon('board')}</span>`;
    if(fragmentSink){fragmentSink.set('shell:cover',cover);cover='<template data-scene-fragment="shell:cover"></template>';}
    return `<main data-reaction-replay="${!!(readOnly||replay||historyHTML)}" data-reaction-viewer="${!readOnly&&!replay&&!historyHTML?viewer:-1}" data-field-topology="${esc(state.scene?.geometry?.topology||'')}" data-geometry-identity="${esc(JSON.stringify([layoutId,state.game,state.packVersion||null,viewer,!!readOnly,!!replay,!!historyHTML]))}" data-layout-identity="${esc(JSON.stringify([layoutId,gameName,viewer,state.players.map(p=>p.id||p.name),replay]))}" class="table-shell${network?' network-game':''}"${network?` data-revision="${revision}" data-viewer="${viewer}"`:''}><header class="table-header game-frame-header"><div class="game-frame-heading"><div class="game-frame-identity">${cover}<div class="game-frame-title">${gameTitle(gameName,shortName||root.PlayroomCatalog?.[state.game]?.shortName)}</div></div><div class="game-frame-status" aria-live="polite"><span class="game-frame-details"><span class="game-frame-turn-extra">${esc([roundText(state.scene?.round),showTurn&&state.players.length>1&&state.timeline?globalThis.PlayroomMessages.text('progress.turn',{number:state.timeline.turn}):'',turnExtra].filter(Boolean).join(' · '))}</span>${caption?`<span class="game-frame-event" title="${esc(replay?(historyCaption||footerText||globalThis.PlayroomMessages.text("ui.game-screen.03f70ecc37a6")):footerTitle)}">${caption}</span>`:''}</span>${statusExtra}</div></div>
      <div class="game-frame-tools">${historyHTML?iconButton('data-command="history-close" data-game-quick="back"',readOnly?'Закрыть историю':'Вернуться к партии','back'):''}${toolbar([
        ...(primary?[{...primary,attrs:primary.attrs+' data-game-primary="true"'}]:[]),
        ...(network&&!readOnly?[{attrs:'data-room-chat-open',label:'Открыть чат комнаты',name:'chat',className:'game-chat-launcher'}]:[]),
        {attrs:'data-command="history"',label:globalThis.PlayroomMessages.text("ui.game-screen.c9d00b5b5cd1"),name:'history',active:!!historyHTML,hidden:!!fieldToggle},
        ...(fieldToggle?[{attrs:'data-command="toggle-field"',label:fieldToggle.hidden?globalThis.PlayroomMessages.text("ui.game-screen.4df59b1750a8"):globalThis.PlayroomMessages.text("ui.game-screen.af36d13ed774"),name:'grid',active:fieldToggle.hidden}]:[]),
        ...(!readOnly&&state.status!=='finished'?[{attrs:'data-command="pause"',label:pause?globalThis.PlayroomMessages.text("ui.game-screen.a42aee58d60a"):globalThis.PlayroomMessages.text("ui.game-screen.65530fd463ea"),name:pause?'play':'pause',active:pause,disabled:!canPause||!!historyHTML,hidden:true}]:[]),
        {attrs:'data-command="fullscreen"',label:globalThis.PlayroomMessages.text("ui.game-screen.f42c392566b5"),name:'full'},
        {attrs:'data-command="rules"',label:globalThis.PlayroomMessages.text("ui.game-screen.7f7b0ffbbfe0"),name:'help',hidden:true}
      ],{showSettings,showFriends:!readOnly,gameMenu:{network,roomAction},extraActions:[...extraMenuActions,historyHTML?{attrs:'data-command="history-close"',label:readOnly?'Закрыть историю':'Вернуться к партии',name:'back'}:{attrs:'data-command="home"',label:'На главный экран',name:'grid'}]})}</div></header>

      <section class="scene ${replay?'replaying':''}" aria-label="${globalThis.PlayroomMessages.text("ui.game-screen.134df14b27b8")}" aria-busy="${!!busy}"${animationSpeed?` data-animation-speed="${esc(animationSpeed)}"`:""}>${scene}${cornerControl?`<div class="handoff-corner" data-host-control="handoff">${cornerControl}</div>`:''}</section>
      ${historyHTML}
      ${footerExtra?`<div class="table-extra">${footerExtra}</div>`:''}</main>`;
  }
  // One geometry contract: full pieces, independently fitted hand viewports.
  function handPieceHeight(track,stage){
    if(stage.dataset.seating!=='row'||stage.dataset.anchorOrientation!=='landscape')return Infinity;
    const own=track.closest('.layout-self'),slot=track.closest('.layout-hand'),piece=track.querySelector('.hand-card,.domino-tile');
    if(!own||!slot||!piece)return Infinity;
    const style=own.ownerDocument.defaultView.getComputedStyle(own),children=[...own.children].filter(node=>node.getClientRects().length);
    const reserved=children.filter(node=>node!==slot).reduce((sum,node)=>{const css=node.ownerDocument.defaultView.getComputedStyle(node);return sum+layoutRect(node).height+(parseFloat(css.marginTop)||0)+(parseFloat(css.marginBottom)||0);},0)
      +parseFloat(style.paddingTop)+parseFloat(style.paddingBottom)+Math.max(0,children.length-1)*(parseFloat(style.rowGap)||0);
    return Math.max(0,own.clientHeight-reserved-(layoutRect(slot).height-piece.offsetHeight));
  }
  function fitTileHand(track,stage){
    const style=track.ownerDocument.defaultView.getComputedStyle(track);
    const height=Math.min(parseFloat(style.getPropertyValue('--scene-card-height'))||90,Math.max(32,handPieceHeight(track,stage)));
    const count=track.querySelectorAll('.domino-tile').length,available=track.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    const fitted=root.PlayroomElementSizes?.resolve(root.PlayroomInterfaceScale?.applied||100,root.innerWidth,root.innerHeight)['hand-domino']||48;
    const capacity=count>0&&count<=7?(available-Math.max(0,count-1)*2)/count:fitted;
    const width=root.PlayroomElementSizes?root.PlayroomElementSizes.floor('domino',Math.min(fitted,capacity)):Math.min(fitted,capacity);
    track.style.setProperty('--tile-width',width+'px');
    track.classList.toggle('is-long-hand',track.scrollWidth>track.clientWidth+2);
  }

  const handPolicy=()=>root.PlayroomSizeCatalogue.hands.geometry;
  function fitOpponentHand(mini,stage){
    const policy=handPolicy();
    const count=mini.children.length;if(!count)return;
    mini.style.setProperty('--opponent-viewport-height',(stage.dataset.denseRoster==='true'?mini.firstElementChild.offsetHeight*policy.miniDenseVisibleFraction+policy.miniDensePaddingPx:mini.firstElementChild.offsetHeight*policy.miniVisibleFraction+policy.miniPaddingPx)+'px');
    mini.style.removeProperty('--opponent-card-width');
    const ratio=Number(mini.querySelector('[data-piece-ratio]')?.dataset.pieceRatio);
    if(ratio>0&&ratio<=1){const height=parseFloat(stage.style.getPropertyValue('--opponent-card-height'))||40;mini.style.setProperty('--opponent-card-width',height*ratio+'px');}
    const style=mini.ownerDocument.defaultView.getComputedStyle(mini),available=mini.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    mini.style.setProperty('--mini-step',(count>1?Math.max(mini.classList.contains('is-open')?policy.miniOpenMinStepPx:0,Math.min(mini.firstElementChild.offsetWidth*policy.miniMaxStepFraction,(available-mini.firstElementChild.offsetWidth)/(count-1))):policy.miniSingleStepPx)+'px');
  }
  // Independent transform properties compose with selection/drag's transform.
  // Geometry uses untransformed offsets so scrolling never feeds back into fit.
  function cardExposure(card,axis){const raw=card?.querySelector('[data-card-stacking]')?.dataset.cardStacking;if(!raw)return 0;try{const n=JSON.parse(raw)[axis];return Number.isFinite(n)&&n>0&&n<=1?n:0;}catch{return 0;}}
  const arcTracks=new WeakSet();
  function fitHandArc(track){
    const policy=handPolicy();
    const enabled=root.PlayroomAppBridge?.gameOptions?.().handShape==='arc';
    track.classList.toggle('is-arc',enabled);
    const row=track.querySelector('.hand-fan-row');if(!row)return;
    const pieceWidth=row.firstElementChild?.offsetWidth||0,step=Math.min(parseFloat(track.style.getPropertyValue('--fan-peek'))||policy.arcFallbackPeekPx,pieceWidth);
    row.style.setProperty('grid-template-columns',(row.children.length>1?`repeat(${row.children.length-1},${step}px) `:'')+pieceWidth+'px','important');
    const style=track.ownerDocument.defaultView.getComputedStyle(track),left=Math.max(parseFloat(style.paddingLeft),row.offsetLeft-track.scrollLeft),right=Math.min(track.clientWidth-parseFloat(style.paddingRight),row.offsetLeft+row.offsetWidth-track.scrollLeft);
    const center=(left+right)/2,half=Math.max(1,(right-left)/2),count=row.children.length;
    for(const card of row.children){
      const x=row.offsetLeft+card.offsetLeft+card.offsetWidth/2-track.scrollLeft-center;
      const pose=root.PlayroomGameComponents.pieceTypes['card-deck'].pose({x,half,count,enabled,maxAngle:policy.arcMaxAngleDeg,minAngle:policy.arcMinAngleDeg,countAngle:policy.arcCountAngleDeg,radiusDivisor:policy.arcRadiusDivisor});
      card.style.setProperty('--hand-arc-angle',pose.angle+'deg');
      card.style.setProperty('--hand-arc-y',pose.y+'px');
    }
    if(!arcTracks.has(track)){track.addEventListener('scroll',()=>fitHandArc(track),{passive:true});arcTracks.add(track);}
  }
  function fitCardHand(track,stage){
    const policy=handPolicy();
    track.classList.toggle('is-arc',root.PlayroomAppBridge?.gameOptions?.().handShape==='arc');
    track.style.removeProperty('--fan-peek');
    const count=track.querySelectorAll('.hand-card').length,card=track.querySelector('.hand-card');
    const trackStyle=track.ownerDocument.defaultView.getComputedStyle(track),available=track.clientWidth-parseFloat(trackStyle.paddingLeft)-parseFloat(trackStyle.paddingRight);
    let desired=Math.min(parseFloat(stage.style.getPropertyValue('--scene-card-width'))||64,Math.max(32,handPieceHeight(track,stage)/1.4));
    if(stage.dataset.seating==='circle'&&stage.dataset.anchorOrientation==='landscape'){
      const own=track.closest('.layout-self')&&layoutRect(track.closest('.layout-self')),north=stage.querySelector('.seat-north-east')&&layoutRect(stage.querySelector('.seat-north-east'));
      if(own&&north?.height){const controls=own.height-layoutRect(track).height,availableHeight=own.bottom-north.bottom-6-controls-24;desired=Math.min(desired,Math.max(32,availableHeight/1.4));}
    }
    const fitted=parseFloat(stage.style.getPropertyValue('--scene-card-width'))||60;
    track.style.setProperty('--scene-card-width',fitted+'px');
    track.style.setProperty('--scene-card-height',fitted*1.4+'px');
    const baseline=policy.peekBasePx;
    let peek=baseline;
    for(const card of track.querySelectorAll('.hand-card')){
      const corner=card.querySelector('.card-corner:not(.bottom)');if(!corner)continue;
      peek=Math.max(peek,Math.ceil((corner.offsetLeft+corner.offsetWidth)*(card.offsetWidth/(card.querySelector('.piece-artboard')?.offsetWidth||card.offsetWidth))+policy.rankClearancePx));
    }
    if(!track.classList.contains('is-arc'))for(const item of track.querySelectorAll('.hand-card')){const corner=item.querySelector('.card-corner:not(.bottom)');if(corner)peek=Math.max(peek,Math.ceil(layoutRect(corner).right-layoutRect(item).left+policy.measuredRankClearancePx));}
    if(count>1&&card){const width=card.offsetWidth;peek=Math.max(peek,Math.min(width,(available-2*width-10)/Math.max(1,count-2)));}
    const axis=track.classList.contains('is-arc')?'arc':'horizontal',exposure=Math.max(0,...[...track.querySelectorAll('.hand-card')].map(item=>cardExposure(item,axis)));
    if(card)peek=Math.max(card.offsetWidth*exposure,Math.min(peek,card.offsetWidth*Math.max(policy.maxDefaultExposure,exposure)));
    track.style.setProperty('--fan-reveal-space',card?Math.max(0,card.offsetWidth-peek)+'px':'0px');
    track.style.setProperty('--fan-peek',peek+'px');
    track.classList.toggle('is-tight',parseFloat(track.style.getPropertyValue('--fan-reveal-space'))<(card?.offsetWidth||0)-peek);
    fitHandArc(track);
  }
  function scopedNodes(scope,selector){return [...(scope.matches?.(selector)?[scope]:[]),...scope.querySelectorAll(selector)];}
  function fitHand(stage,scope=stage){
    for(const track of scopedNodes(scope,'.layout-hand .hand-track:not(.is-fan):has([data-card-shape="square"])')){
      const count=track.querySelectorAll('.hand-card').length,desired=parseFloat(stage.style.getPropertyValue('--scene-card-width'))||64;
      const available=track.clientWidth-12,capacity=track.classList.contains('is-overlapping')?desired:(available-Math.max(0,count-1)*6)/Math.max(1,count),fit=Math.max(24,Math.min(desired,capacity,handPieceHeight(track,stage)));
      track.style.setProperty('--scene-card-width',fit+'px');track.style.setProperty('--scene-card-height',fit+'px');
    }
    for(const track of scopedNodes(scope,'.layout-hand .hand-track.is-tiles'))fitTileHand(track,stage);
    for(const mini of scopedNodes(scope,'.player-panel .mini-hand'))fitOpponentHand(mini,stage);
    for(const track of scopedNodes(scope,'.layout-hand .hand-track.is-fan'))fitCardHand(track,stage);
  }
  const fieldViewports=new WeakMap();
  // The field's grid cell can be larger than its fitted square board. Reveals
  // use that available cell; the board and physical objects keep their sizes.
  function fieldBounds(mount){
    const slot=mount?.querySelector('.layout-field'),stage=slot?.closest('.app-game-layout'),saved=slot&&fieldViewports.get(slot);
    if(!slot)return null;
    if(!saved||!stage)return slot.getBoundingClientRect();
    const origin=stage.getBoundingClientRect(),left=origin.left+saved.left,top=origin.top+saved.top;
    return {left,top,right:left+saved.width,bottom:top+saved.height,width:saved.width,height:saved.height};
  }
  function fitField(stage){
    const slot=stage.querySelector('.layout-field'),field=slot?.firstElementChild;if(!field)return;
    // Measure the whole grid track before reserving the board's intrinsic shape.
    for(const key of ['width','height','justify-self','align-self'])slot.style.removeProperty(key);
    const width=slot.clientWidth,height=slot.clientHeight;if(width<=0||height<=0)return;
    const full=slot.getBoundingClientRect(),origin=stage.getBoundingClientRect();fieldViewports.set(slot,{left:full.left-origin.left,top:full.top-origin.top,width:full.width,height:full.height});
    const portraitCards=field.querySelector('[data-card-fit="portrait"]');
    if(portraitCards&&root.PlayroomElementSizes){
      const win=stage.ownerDocument.defaultView,columns=Number(portraitCards.dataset.cardColumns)||1;
      const target=root.PlayroomElementSizes.resolve(root.PlayroomInterfaceScale?.applied||100,Math.min(win.innerWidth,win.innerHeight),Math.max(win.innerWidth,win.innerHeight)).card;
      const fitted=root.PlayroomElementSizes.floor('card',Math.min(target,(Math.min(width,Math.min(win.innerWidth,win.innerHeight)-26)-10-(columns-1)*(Number(portraitCards.dataset.cardGap)||4))/columns));
      portraitCards.style.setProperty('--size-card',fitted+'px');portraitCards.style.setProperty('--size-card-height',fitted*1.4+'px');
    }
    const grid=field.querySelector('[data-card-count]');
    if(grid){const count=Number(grid.dataset.cardCount);grid.dataset.gridDensity=count>=36?'dense':'roomy';let best={size:0,columns:1,rows:count};for(let columns=2;columns<=count;columns++){const rows=Math.ceil(count/columns),size=Math.min((width-8-(columns-1)*4)/columns,(height-8-(rows-1)*4)/rows/1.4);if(size>best.size)best={size,columns,rows};}const gap=grid.querySelector('[data-grid-gap=\"center\"]');if(gap)gap.hidden=best.columns!==5||best.rows!==5;grid.style.setProperty('--grid-columns',best.columns);grid.style.setProperty('--grid-rows',best.rows);grid.style.setProperty('--grid-card-width',(root.PlayroomElementSizes?root.PlayroomElementSizes.floor('card',count>=36?Math.min(best.size,root.PlayroomElementSizes.resolve(root.PlayroomInterfaceScale?.applied||100,root.innerWidth,root.innerHeight).card):best.size):Math.max(1,best.size))+'px');}

    if(stage.dataset.fieldSizing==='scroll'||field.querySelector('[data-card-count]')){field.style.width=width+'px';field.style.height=height+'px';field.style.zoom='1';field.style.setProperty('--field-scale','1');return;}

    if(stage.dataset.layoutFamily==='board'){
      const aspect=fieldLayouts.get(stage)?.fieldAspect??(Number(slot.style.getPropertyValue('--field-aspect'))||1);
      const availableWidth=Math.min(width,height*aspect),boardWidth=Math.max(1,Math.floor(availableWidth/4)*4),boardHeight=boardWidth/aspect;
      if(stage.dataset.fieldSizing!=='content'){
        slot.style.width=boardWidth+'px';slot.style.height=boardHeight+'px';
        slot.style.justifySelf='center';slot.style.alignSelf='center';
      }
      field.style.width=boardWidth+'px';field.style.height=boardHeight+'px';field.style.zoom='1';return;
    }
    field.style.zoom='1';field.style.width=Math.min(width,520)+'px';field.style.height='auto';field.style.setProperty('--field-scale','1');
    const r=layoutRect(field),natural=Math.max(field.scrollHeight,r.height,1),scale=Math.max(.1,Math.min(1.6,width/Math.max(field.scrollWidth,r.width,1),height/natural));
    field.style.height=Math.min(natural,height)+'px';field.style.overflow='auto';field.style.zoom='1';field.style.setProperty('--field-scale','1');
  }
  function fitStandardPieces(stage,scope=stage){
    const sizes=root.PlayroomElementSizes;if(!sizes)return;
    for(const piece of scopedNodes(scope,'[data-size-role="token"],[data-size-role="checker"]')){
      piece.style.removeProperty('width');piece.style.removeProperty('height');
      const rect=piece.getBoundingClientRect(),role=piece.dataset.sizeRole;
      const side=sizes.floor('token',Math.min(rect.width,rect.height,role==='checker'?64:sizes.resolve(root.PlayroomInterfaceScale?.applied||100,root.innerWidth,root.innerHeight).token));
      piece.style.width=side+'px';piece.style.height=side+'px';
    }
  }
  function fitPlayerPanels(stage,scope=stage){
    const panels=scopedNodes(scope,'.player-panel.opponent-hand'),hands=stage.dataset.opponentHands==='true';
    const compact=panels.map(panel=>String(hands&&panel.clientWidth<240));
    panels.forEach((panel,index)=>{if(panel.dataset.compactHand!==compact[index])panel.dataset.compactHand=compact[index];});
  }
  // Responsive score lists change columns inside the reserved field, never its grid tracks.
  function fitScoreTables(stage,scope=stage){
    const win=stage.ownerDocument.defaultView;
    for(const table of scopedNodes(scope,'[data-responsive-score-table]')){
      const rows=[...table.rows];if(!rows.length)continue;
      const space=table.closest('[data-score-table-space]')||stage.querySelector('.layout-field');if(!space)continue;
      const css=win.getComputedStyle(space),height=space.clientHeight-parseFloat(css.paddingTop||0)-parseFloat(css.paddingBottom||0);
      const rowHeight=layoutRect(rows[0]).height;if(height<=0||rowHeight<=0)continue;
      const maximum=Math.max(1,Number(table.dataset.responsiveScoreTable)||1),minimum=Math.max(1,Number(table.dataset.scoreColumnWidth)||80);
      const columns=Math.max(1,Math.min(maximum,Math.floor(table.clientWidth/minimum),Math.ceil(rows.length*rowHeight/height)));
      table.style.setProperty('--score-columns',columns);table.style.setProperty('--score-rows',Math.ceil(rows.length/columns));table.dataset.scoreColumns=String(columns);
    }
  }
  function fitCardOverlaps(stage,scope=stage){
    for(const stack of scopedNodes(scope,'[data-card-overlap]')){
      const fixedStep=Number(stack.dataset.cardOverlap);
      let previous=null;
      for(const card of stack.children){
        card.style.marginInlineStart=previous?Math.min(0,previous.peek-previous.width)+'px':'0px';
        const box=layoutRect(card),cornerNode=card.querySelector('[data-card-index=top],.shared-card-corner:not(.bottom),.card-corner:not(.bottom)'),corner=cornerNode?layoutRect(cornerNode):null;
        previous={width:box.width,peek:Math.min(box.width,Math.max(box.width*cardExposure(card,'horizontal'),fixedStep>0?fixedStep:corner?Math.ceil(corner.right-box.left+2):box.width))};
      }
    }
  }
  const replayFitters=new WeakMap();
  function screenLayout({surface,soloField,seatAnchors}={}){
    if(surface==='player')return 'player-only';
    if(soloField==='true'||soloField===true)return 'field-only';
    if(seatAnchors==='true'||seatAnchors===true)return 'bases';
    return 'standard';
  }
  function rosterMinimumWidth(stage){
    const win=stage.ownerDocument.defaultView,panels=[...stage.querySelectorAll('.layout-participants .player-panel')];
    const px=value=>parseFloat(value)||0;
    const cardWidth=Math.max(0,...panels.map(panel=>{
      const info=panel.querySelector('.player-info'),data=info?.querySelector('.player-data'),avatar=info?.querySelector('.player-avatar-wrap');if(!info||!data)return 0;
      const style=win.getComputedStyle(info),outer=win.getComputedStyle(panel),flow=win.getComputedStyle(data);
      const widths=[...data.children].filter(node=>node.getClientRects().length&&node.offsetWidth).map(node=>node.offsetWidth);
      const metrics=flow.flexDirection.startsWith('column')?Math.max(0,...widths):widths.reduce((sum,width)=>sum+width,0)+Math.max(0,widths.length-1)*px(flow.columnGap);
      const identity=avatar?.offsetWidth||0,content=win.getComputedStyle(data).gridColumnStart==='1'?Math.max(identity,metrics):identity+px(style.columnGap)+metrics;
      return Math.ceil(content+px(style.paddingLeft)+px(style.paddingRight)+px(outer.paddingLeft)+px(outer.paddingRight)+px(outer.borderLeftWidth)+px(outer.borderRightWidth));
    }));
    return cardWidth;
  }
  function landscapeZones(width,height,opponents,hasSelf=true,selfWidth=null,opponentMinimum=0){
    // Protect readable identities and the local hand before maximizing the field.
    // Only viewport/explicit geometry refreshes reach here; turns retain the lock.
    const policy=root.PlayroomSizeCatalogue?.composition.geometry||{},gap=6,padding=12;
    const w=Math.max(0,width-padding),h=Math.max(0,height-padding),available=Math.max(0,w-gap*2);
    const card=Math.max(policy.landscapePlayerMinWidthPx||144,opponentMinimum);
    const selfMinimum=hasSelf?(policy.landscapeSelfMinWidthPx||240):144;
    const fieldMinimum=Math.min(h,policy.landscapeFieldMinWidthPx||200);
    const columns=opponents>1&&available>=card*2+4+selfMinimum+fieldMinimum?2:1;
    const leftMinimum=opponents?Math.max(160,card*columns+(columns-1)*4):selfMinimum;
    const wantedSelf=Math.max(selfMinimum,selfWidth??selfMinimum);
    const field=Math.max(0,Math.min(h,available-leftMinimum-wantedSelf));
    const surplus=Math.max(0,available-field-leftMinimum-wantedSelf);
    const left=Math.min(available,leftMinimum+(selfWidth===null?Math.floor(surplus/2):surplus)),self=Math.max(0,available-field-left);
    return {opponents:Math.floor(left),field:Math.floor(field),self:Math.floor(self),columns};
  }
  function alignInZone(zone,size,{inline='center',block='center',inset=0}={}){
    const factor={start:0,center:.5,end:1};
    if(!(inline in factor)||!(block in factor))throw Error('Invalid zone alignment');
    const pad=Math.max(0,inset),width=Math.min(Math.max(0,size.width),Math.max(0,zone.width-pad*2)),height=Math.min(Math.max(0,size.height),Math.max(0,zone.height-pad*2));
    return {x:zone.x+pad+(Math.max(0,zone.width-pad*2)-width)*factor[inline],y:zone.y+pad+(Math.max(0,zone.height-pad*2)-height)*factor[block],width,height};
  }
  // Rounded union of scene zones; only viewport geometry enters this helper.
  function zoneOutline(points,radius=12){
    const corners=points.map((p,i)=>{
      const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
      const entry=Math.min(radius,Math.hypot(before[0]-p[0],before[1]-p[1])/2),exit=Math.min(radius,Math.hypot(after[0]-p[0],after[1]-p[1])/2);
      const toward=(q,d)=>{const n=Math.hypot(q[0]-p[0],q[1]-p[1])||1;return [p[0]+(q[0]-p[0])*d/n,p[1]+(q[1]-p[1])*d/n];};
      return {p,a:toward(before,entry),b:toward(after,exit)};
    });
    return corners.map((c,i)=>`${i?'L':'M'}${c.a.join(',')}Q${c.p.join(',')} ${c.b.join(',')}`).join(' ')+'Z';
  }
  const fullscreenZoneWidths=new WeakMap();
  const geometryOwners=new WeakMap(), allocatingScenes=new WeakSet();
  const geometryRegions='.layout-field,.layout-hand,.player-hand,.mini-hand,.player-panel,.layout-actions,.game-frame-title,.game-frame-cover,.table-status,.game-frame-status';
  const paintClasses=new Set(['is-selected','is-playable','is-turn','is-ready','is-inactive','is-addressed','is-turn-skipped','is-participant-affected','is-public-playback']);
  function geometryIdentity(shell){const stage=shell?.querySelector('.app-game-layout');return shell?JSON.stringify([shell.dataset.geometryIdentity||shell.dataset.layoutIdentity,shell.dataset.reactionViewer,shell.dataset.reactionReplay,stage?.dataset.surface]):null;}
  function geometryBounds(scene){return [scene.clientWidth,scene.clientHeight].join(':');}
  // Reading visualViewport.scale/innerWidth after a DOM patch can force layout
  // of the entire SVG scene. These values change through viewport events, not
  // through game actions; keep one measurement until such an event arrives.
  const viewportMeasurements=new WeakMap();
  function geometryViewport(host){
    const win=host.ownerDocument.defaultView;let measurement=viewportMeasurements.get(win);
    if(!measurement){
      measurement={dirty:true,value:null};viewportMeasurements.set(win,measurement);
      const invalidate=()=>{measurement.dirty=true;};
      for(const event of ['resize','orientationchange','pageshow'])win.addEventListener(event,invalidate,{passive:true});
      win.visualViewport?.addEventListener('resize',invalidate,{passive:true});
    }
    if(measurement.dirty){measurement.value=[win.innerWidth,win.innerHeight,win.visualViewport?.scale||1].join(':');measurement.dirty=false;}
    return measurement.value;
  }
  function applyStandardSizes(stage,scene){
    const win=scene.ownerDocument.defaultView,policy=root.PlayroomSizeCatalogue.composition.geometry;
      const standard=root.PlayroomElementSizes?.resolve(root.PlayroomInterfaceScale?.applied||100,win.innerWidth,win.innerHeight);
      const cardWidth=standard?.['hand-card']||60;
      stage.style.setProperty('--scene-card-width',cardWidth+'px');
      stage.style.setProperty('--scene-card-height',cardWidth*1.4+'px');
      stage.style.setProperty('--hand-row-height',(cardWidth*1.4+policy.handControlsReservePx)+'px');
      const miniWidth=standard?.mini||30,miniHeight=miniWidth*1.4;
      stage.style.setProperty('--opponent-card-width',miniWidth+'px');
      stage.style.setProperty('--opponent-card-height',miniHeight+'px');
      stage.style.setProperty('--opponent-viewport-height',(miniHeight*policy.miniViewportVisibleFraction+policy.miniViewportPaddingPx)+'px');
  }
  function geometryPreferences(host){const doc=host.ownerDocument;return [root.PlayroomInterfaceScale?.applied,doc.documentElement.dataset.assetGeometry,doc.documentElement.style.fontSize,doc.documentElement.style.fontFamily,doc.documentElement.style.zoom,root.PlayroomAppBridge?.gameOptions?.().handShape].join(':');}
  function geometryMetrics(host){const state=geometryOwners.get(host);return state?{observed:state.observedRegions.size,detachedObserved:[...state.observedRegions].filter(node=>!node.isConnected).length,dirty:state.dirty.size,groupPanels:[...state.groups.values()].reduce((sum,group)=>sum+group.size,0),pending:state.frame!==null}:null;}
  function retireGeometry(host){const state=geometryOwners.get(host);if(!state)return;state.observer?.disconnect();if(state.frame!==null)state.win.cancelAnimationFrame(state.frame);state.unpatch?.();state.themeObserver?.disconnect();state.turnObserver?.disconnect();state.removalObserver?.disconnect();host.ownerDocument.fonts?.removeEventListener?.('loadingdone',state.fonts);state.win.removeEventListener('playroom:game-options',state.preferences);geometryOwners.delete(host);}
  function regionFor(node,host){
    const element=node?.nodeType===1?node:node?.parentElement;if(!element)return null;
    let region=element.closest('.hand-track,.mini-hand,.player-hand,.layout-hand,.layout-actions,.player-panel,.game-frame-title,.game-frame-cover,.table-status,.game-frame-status');
    if(!region){const field=element.closest('.layout-field');if(field){const container=element.closest('[data-card-overlap],[data-responsive-score-table],.solitaire-column,[data-layout-grid]'),leaf=element.closest('[data-motion-anchor],[data-entity]');region=container&&field.contains(container)?container:leaf&&field.contains(leaf)?leaf:field;}}
    return region&&host.contains(region)?region:null;
  }
  function paintOnly(change){
    if(change.kind!=='attribute')return false;
    const name=change.name;
    if(name==='class'){const before=new Set((change.previous||'').split(/\s+/)),after=new Set((change.value||'').split(/\s+/));return [...before,...after].every(c=>before.has(c)===after.has(c)||paintClasses.has(c));}
    return /^aria-|^(disabled|title|tabindex|role)$/.test(name)||/^data-(?:action|select|drop-|drag-|motion-|entity$|turn-player$|presentation-turn$|reaction-|revision$|piece-count$)/.test(name);
  }
  function markRegion(state,node){if(!node)return;state.dirty.add(node);}
  function paintTurns(state,stage){
    const turn=String(stage.dataset.presentationTurn??stage.dataset.turnPlayer);if(turn!==state.turn){if(state.turn!==null)state.paintGroups.add(state.turn);state.paintGroups.add(turn);state.turn=turn;}
    for(const index of state.paintGroups){const panels=[...(state.groups.get(index)||[])].filter(node=>node.isConnected);let primary=state.primary.get(index);if(!panels.includes(primary)){primary=panels.find(node=>!node.hasAttribute('data-seat-copy')&&node.getClientRects().length)||panels.find(node=>node.getClientRects().length);if(primary)state.primary.set(index,primary);}
      for(const panel of panels){const active=panel===primary&&index===turn;const selected=panel===primary;if(panel.dataset.turnPrimary!==String(selected))panel.dataset.turnPrimary=String(selected);if(panel.classList.contains('is-turn')!==active)panel.classList.toggle('is-turn',active);if(active){if(panel.getAttribute('aria-current')!=='true')panel.setAttribute('aria-current','true');}else if(panel.hasAttribute('aria-current'))panel.removeAttribute('aria-current');}
    }state.paintGroups.clear();
  }
  function flushGeometry(host,state){
    if(geometryOwners.get(host)!==state||state.scene!==host.querySelector('.scene'))return;
    const stage=state.scene?.querySelector('.app-game-layout');if(!stage)return;
    paintTurns(state,stage);
    const dirty=[...state.dirty].filter(node=>node.isConnected&&host.contains(node));state.dirty.clear();
    for(const node of dirty){
      if(dirty.some(parent=>parent!==node&&parent.contains(node)))continue;
      if(node.matches('.game-frame-cover')){fitCovers(node);continue;}
      if(node.matches('.game-frame-title,.table-status,.game-frame-status')){fitGameTitles(node);continue;}
      if(node.matches('.layout-actions')){const lock=fixedLayouts.get(host),index=[...stage.querySelectorAll('.layout-actions')].indexOf(node);if(lock?.actions?.[index]>0)lockActionGeometry(node,lock.actions[index]);continue;}
      if(node.matches('.hand-track,.mini-hand,.player-hand,.layout-hand')){fitHand(stage,node);root.PlayroomHandOverflow?.sync?.(node.matches('.hand-track')?node.parentElement:node);continue;}
      if(node.matches('.player-panel')){fitPlayerPanels(stage,node);fitHand(stage,node);continue;}
      if(node.matches('.layout-field')&&state.fitField){fitField(stage);state.fitField=false;}
      fitStandardPieces(stage,node);fitScoreTables(stage,node);fitCardOverlaps(stage,node);
    }
  }
  function queueGeometry(host,state,allocationReason=null){
    if(allocationReason)state.allocationReasons.add(allocationReason);
    if(state.frame!==null)return;
    state.frame=state.win.requestAnimationFrame(()=>{
      state.frame=null;if(geometryOwners.get(host)!==state||!host.isConnected||!state.scene.isConnected)return;
      // ResizeObserver delivery only collects reasons. Allocation writes belong
      // to the next frame, where bounds are checked again before allocating.
      if(state.allocationReasons.size){state.allocationReasons.clear();layoutScene(host);}else flushGeometry(host,state);
    });
  }
  function observeRegions(host,state,scope){
    for(const node of scopedNodes(scope,geometryRegions))if(!state.observed.has(node)){state.observed.add(node);state.observedRegions.add(node);state.observer?.observe(node);if(node.matches('.player-panel')){const index=node.dataset.playerIndex;let group=state.groups.get(index);if(!group)state.groups.set(index,group=new Set());group.add(node);state.primary.delete(index);state.paintGroups.add(index);}}
  }
  function initializeGeometry(host){
    retireGeometry(host);const scene=host.querySelector('.scene');if(!scene)return;
    const win=host.ownerDocument.defaultView,state={scene,win,bounds:geometryBounds(scene),viewport:geometryViewport(host),preferencesKey:geometryPreferences(host),dirty:new Set(),observed:new WeakSet(),observedRegions:new Set(),sizes:new WeakMap(),frame:null,allocationReasons:new Set(),fitField:false,groups:new Map(),primary:new Map(),paintGroups:new Set(),turn:null};geometryOwners.set(host,state);
    if(win.ResizeObserver){state.observer=new win.ResizeObserver(entries=>{
      if(geometryOwners.get(host)!==state)return;
      const viewportChanged=state.viewport!==geometryViewport(host),containerChanged=entries.some(entry=>entry.target===state.scene&&state.bounds!==geometryBounds(state.scene));
      if(viewportChanged||containerChanged){queueGeometry(host,state,viewportChanged?'viewport':'container');return;}
      for(const entry of entries){const size=[entry.contentRect.width,entry.contentRect.height].join(':');const prior=state.sizes.get(entry.target);state.sizes.set(entry.target,size);if(prior===undefined||prior===size)continue;const region=regionFor(entry.target,host);if(region){markRegion(state,region);if(region.matches('.layout-field'))state.fitField=true;}}
      if(state.dirty.size)queueGeometry(host,state);
    });state.observer.observe(scene);observeRegions(host,state,scene);}
    const initialStage=scene.querySelector('.app-game-layout');state.turn=String(initialStage?.dataset.presentationTurn??initialStage?.dataset.turnPlayer);for(const [index,panels]of state.groups){const primary=[...panels].find(node=>node.dataset.turnPrimary==='true');if(primary)state.primary.set(index,primary);}state.paintGroups.clear();
    if(win.MutationObserver&&initialStage){state.turnObserver=new win.MutationObserver(()=>{if(geometryOwners.get(host)===state)paintTurns(state,initialStage);});state.turnObserver.observe(initialStage,{attributes:true,attributeFilter:['data-turn-player','data-presentation-turn']});}
    state.preferences=()=>{if(geometryOwners.get(host)!==state)return;const key=geometryPreferences(host);if(key===state.preferencesKey)return;state.preferencesKey=key;const stage=scene.querySelector('.app-game-layout');if(stage)applyStandardSizes(stage,scene);for(const node of state.observedRegions)markRegion(state,node);state.fitField=true;flushGeometry(host,state);};
    for(const node of host.querySelectorAll('.game-frame-title,.game-frame-cover,.table-status,.game-frame-status'))state.observedRegions.add(node);
    state.fonts=()=>{if(geometryOwners.get(host)!==state)return;for(const node of state.observedRegions)markRegion(state,node);state.fitField=true;flushGeometry(host,state);};host.ownerDocument.fonts?.addEventListener?.('loadingdone',state.fonts);win.addEventListener('playroom:game-options',state.preferences);
    if(win.MutationObserver){state.themeObserver=new win.MutationObserver(()=>{const next=geometryPreferences(host);if(next!==state.preferencesKey)state.preferences();});for(const node of [host.ownerDocument.documentElement,host.ownerDocument.body])state.themeObserver.observe(node,{attributes:true,attributeFilter:['class','style','data-asset-geometry']});}
    state.unpatch=DOM.observePatches?.(host,changes=>updateGeometry(host,changes,{defer:true}));
    if(win.MutationObserver){state.removalObserver=new win.MutationObserver(()=>{if(geometryOwners.get(host)===state&&(!scene.isConnected||!host.isConnected||!host.contains(scene))){retireGeometry(host);renderedTrees.delete(host);fixedLayouts.delete(host);handReserves.delete(host);}});state.removalObserver.observe(host,{childList:true,subtree:true});}
    // Allocation owns the numeric reserves; no per-action scan restores private cards.
    const shell=host.querySelector('.table-shell'),stage=scene.querySelector('.app-game-layout');if(shell&&stage){const reserve=handReserves.get(host);if(reserve){const hand=stage.querySelector('.layout-hand');if(hand)reserve.own=hand.offsetHeight;for(const panel of stage.querySelectorAll('.player-panel')){const mini=panel.querySelector('.player-hand');if(mini)reserve.players.set(panel.dataset.playerIndex,mini.offsetHeight);}}}
  }
  function updateGeometry(host,changes,{defer=false}={}){
    // The DOM patcher may reuse an action section for the hand slot. Numeric
    // action locks belong to that role, never to the repurposed physical node.
    for(const {node}of changes)if(node?.nodeType===1&&actionGeometryLocks.has(node)&&!node.classList.contains('layout-actions'))releaseActionGeometry(node);
    const state=geometryOwners.get(host);if(!state)return;
    if(state.viewport!==geometryViewport(host)){layoutScene(host);return;}
    const stage=host.querySelector('.app-game-layout'),lock=fixedLayouts.get(host);
    if(stage){restoreFieldGrids(stage);if(lock){fieldLayouts.set(stage,lock);lockFieldGrids(stage,lock);}else fieldLayouts.delete(stage);}
    const field=host.querySelector('.layout-field');
    for(const change of changes){
      if(change.kind==='remove'&&change.node.nodeType===1)for(const node of scopedNodes(change.node,geometryRegions)){state.observer?.unobserve(node);state.observed.delete(node);state.observedRegions.delete(node);if(node.matches('.player-panel')){const index=node.dataset.playerIndex;state.groups.get(index)?.delete(node);state.primary.delete(index);state.paintGroups.add(index);}}
      const panel=(change.node.nodeType===1?change.node:change.node.parentElement)?.closest('.player-panel');if(panel){state.paintGroups.add(panel.dataset.playerIndex);if(change.name==='style'||change.name==='hidden'||change.name==='class'&&!paintOnly(change))state.primary.delete(panel.dataset.playerIndex);}
      if(paintOnly(change))continue;const node=change.node.nodeType===1?change.node:change.node.parentElement;const target=change.kind==='remove'?change.parent:node;const region=regionFor(target,host);markRegion(state,region);
      if(change.kind==='insert'||change.kind==='position'){if(node?.isConnected)observeRegions(host,state,node);}
      if(field&&(node===field||change.parent===field||node?.matches?.('[data-card-count],[data-card-fit]'))){state.fitField=true;markRegion(state,field);}
    }
    if(defer&&state.dirty.size)queueGeometry(host,state);else flushGeometry(host,state);
  }
  function layoutScene(host,settled=false){
    // Public-frame binding patches DOM during allocation. Its patch observer
    // must not recursively allocate against the previous viewport owner.
    if(allocatingScenes.has(host))return;
    const scene=host.querySelector('.scene'),state=geometryOwners.get(host);
    if(!state||!fixedLayouts.has(host)||state.scene!==scene||state.viewport!==geometryViewport(host)||state.bounds!==geometryBounds(scene)){
      allocatingScenes.add(host);
      try{allocateScene(host,settled);initializeGeometry(host);}finally{allocatingScenes.delete(host);}
      return;
    }
    flushGeometry(host,state);
  }
  function allocateScene(host,settled=false){
    root.PlayroomPublicSequence?.bind(host);
    // Network diagnostics/history can finish mounting after the synchronous render.
    // Measure once more after that DOM transaction, before freezing the viewport.

    fitGameTitles(host);fitCovers(host.querySelector('.game-frame-header'));
    const scene=host.querySelector('.scene'),previous=replayFitters.get(host);
    if(previous?.scene!==scene)replayFitters.set(host,{scene});
    const stage=scene?.querySelector('.app-game-layout');
    if(stage)resetHandReserveForViewport(host,stage);
    placeSceneActions(host,host.ownerDocument.defaultView);
    placeSceneActions(renderedTrees.get(host),host.ownerDocument.defaultView);
    fitHeaderActionRow(host,{reset:true});

    // A scene reserves the same status home after initial allocation and patches.
    for(const tree of [host,renderedTrees.get(host)])placeSceneStatus(tree,host.ownerDocument.defaultView);

    if(stage)stage.dataset.threeOpponentLayout=root.PlayroomAppBridge?.gameOptions?.().splitThreeOpponents?'split':'row';
    const layoutKey=stage?JSON.stringify([host.ownerDocument.documentElement.dataset.assetGeometry,host.querySelector('.table-shell')?.dataset.layoutIdentity,scene.clientWidth,scene.clientHeight,stage.dataset.threeOpponentLayout,stage.dataset.surface,stage.dataset.preferredSeating||stage.dataset.seating]):null;
    if(stage)restoreFieldGrids(stage);
    let locked=fixedLayouts.get(host);if(locked?.key!==layoutKey){fixedLayouts.delete(host);locked=null;}
    if(stage){if(locked)fieldLayouts.set(stage,locked);else fieldLayouts.delete(stage);if(locked){stage.dataset.hasHand=locked.hasHand;stage.dataset.opponentHands=locked.opponentHands;}stage.style.removeProperty('grid-template-rows');stage.style.removeProperty('grid-template-columns');
      if(!locked)for(const node of stage.querySelectorAll('.layout-actions'))releaseActionGeometry(node);
      for(const node of stage.querySelectorAll(':scope > .layout-self')){node.style.removeProperty('height');node.style.removeProperty('max-height');node.style.removeProperty('overflow');}
    }
    if(stage){const policy=root.PlayroomSizeCatalogue.composition.geometry;stage.dataset.composition=root.PlayroomElementSizes.composition(stage.dataset);const win=scene.ownerDocument.defaultView;stage.dataset.layoutMode=win.TabletopUI.selectLayout(scene.clientWidth,scene.clientHeight);
      const w=scene.clientWidth-policy.sceneInsetPx,h=scene.clientHeight-policy.sceneInsetPx,hands=stage.dataset.layoutFocus==='hands',anchors=stage.dataset.seatAnchors==='true',portrait=win.innerHeight>=win.innerWidth,compact=anchors?portrait:w<policy.compactWidthPx;
      stage.dataset.screenLayout=screenLayout(stage.dataset);
      stage.dataset.screenOrientation=portrait?'portrait':'landscape';
      stage.dataset.preferredSeating??=stage.dataset.seating;
      const roster=stage.querySelectorAll('.layout-participants .player-panel:not([data-seat-copy])').length;
      stage.dataset.denseRoster=String(!portrait&&h<policy.denseRosterHeightPx&&roster>2&&stage.dataset.opponentHands==='true');
      applyStandardSizes(stage,scene);
      const rosterMinimum=locked?.rosterMinimum??rosterMinimumWidth(stage);
      if(portrait&&!anchors&&stage.dataset.soloField!=='true'&&stage.querySelector(':scope > .layout-status'))stage.style.setProperty('grid-template-rows','max-content max-content minmax(0,1fr) max-content max-content','important');
      stage.dataset.croppedHands='true';
      const anchoredNoHand=anchors&&stage.dataset.hasHand==='false';
      const fallback=!anchors&&stage.dataset.preferredSeating==='circle'&&(w<policy.circleMinWidthPx||h<policy.circleMinHeightPx||(!portrait&&(w<policy.circleLandscapeMinWidthPx||h<policy.denseRosterHeightPx&&roster>3&&stage.dataset.opponentHands==='true')));
      stage.dataset.seating=fallback||!portrait&&!anchors?'row':stage.dataset.preferredSeating;
      stage.dataset.seatingFallback=String(fallback);
      stage.querySelector(':scope > .layout-status')?.classList.toggle('game-frame-metadata',!portrait&&w>=560);
      const fullScreen=!!host.ownerDocument.fullscreenElement,heldSelfWidth=fullScreen?fullscreenZoneWidths.get(host)??null:null;
      if(!portrait&&!fullScreen)fullscreenZoneWidths.set(host,landscapeZones(scene.clientWidth,scene.clientHeight,roster).self);
      if(!portrait&&w>=560&&stage.dataset.fieldColumns==='3'){
        const zones=landscapeZones(scene.clientWidth,scene.clientHeight,0,true,heldSelfWidth),shell=host.querySelector('.table-shell');shell?.style.setProperty('--solo-side-zone',landscapeZones(scene.clientWidth,host.clientHeight-14,0).self+'px');
        for(const [name,value]of [['opponent',zones.opponents],['field',zones.field],['self',zones.self]]){stage.style.setProperty('--'+name+'-zone-width',value+'px');shell?.style.setProperty('--'+name+'-zone-width',value+'px');}
        const sw=scene.clientWidth,sh=scene.clientHeight,left=zones.opponents+9,right=left+zones.field+6;scene.style.clipPath='path("'+zoneOutline([[0,68],[left,68],[left,0],[right,0],[right,68],[sw,68],[sw,sh],[0,sh]])+'")';
      }
      if(stage.dataset.soloField!=='true'&&!portrait&&w>=560){
        const zones=landscapeZones(scene.clientWidth,scene.clientHeight,roster,!!stage.querySelector('.layout-self'),heldSelfWidth,rosterMinimum);if(!fullScreen)fullscreenZoneWidths.set(host,zones.self);
        stage.style.setProperty('grid-template-areas','"host field self" "participants field self" "status field self" "auxiliary field self"','important');stage.style.setProperty('grid-template-rows','var(--side-top,88px) minmax(0,1fr) auto auto','important');stage.style.setProperty('--opponent-zone-width',zones.opponents+'px');stage.style.setProperty('--field-zone-width',zones.field+'px');stage.style.setProperty('grid-template-columns',zones.opponents+'px '+zones.field+'px minmax(0,1fr)','important');stage.dataset.landscapeRosterColumns=String(zones.columns);const sw=scene.clientWidth,sh=scene.clientHeight,left=zones.opponents+9,right=left+zones.field+6;scene.style.clipPath='path("'+zoneOutline([[0,68],[left,68],[left,0],[right,0],[right,68],[sw,68],[sw,sh],[0,sh]])+'")';const shell=host.querySelector('.table-shell');shell?.style.setProperty('--opponent-zone-width',zones.opponents+'px');shell?.style.setProperty('--field-zone-width',zones.field+'px');shell?.style.setProperty('--self-zone-width',zones.self+'px');
      }else{if(portrait||stage.dataset.fieldColumns!=='3')scene.style.removeProperty('clip-path');stage.style.removeProperty('grid-template-areas');stage.style.removeProperty('--opponent-zone-width');stage.style.removeProperty('--field-zone-width');delete stage.dataset.landscapeRosterColumns;const shell=host.querySelector('.table-shell');if(portrait||stage.dataset.fieldColumns!=='3')for(const name of ['--opponent-zone-width','--field-zone-width','--self-zone-width'])shell?.style.removeProperty(name);}

      stage.dataset.anchorOrientation=portrait?'portrait':'landscape';
      const baseCopy=stage.querySelector('[data-seat-copy="true"]');
      stage.dataset.anchorCompactControls=String(anchoredNoHand&&!portrait&&!fallback&&!!baseCopy);
      stage.style.setProperty('--anchor-control-column',baseCopy?.dataset.seat?.includes('east')?'3':'1');
      stage.dataset.seatMode=compact&&anchors?'corners':'ring';
      if(stage.dataset.soloField==='true'){
        // Solo scenes own only field/actions. Multiplayer names create implicit
        // columns for the action slot and collapse the tableau in portrait.
        for(const name of ['grid-template-areas','grid-template-rows','grid-template-columns'])stage.style.removeProperty(name);
      }else if(portrait&&!anchors){stage.style.setProperty('grid-template-areas','"participants" "status" "field" "self" "auxiliary"','important');stage.style.setProperty('grid-template-rows','max-content max-content minmax(0,1fr) max-content max-content','important');stage.style.setProperty('grid-template-columns','minmax(0,1fr)','important');}
      let ownZone=stage.querySelector('.layout-self')?(stage.dataset.hasHand==='false'?policy.ownNoHandPx:Math.min(hands?policy.ownHandFocusMaxPx:policy.ownDefaultMaxPx,Math.max(h<policy.ownCompactThresholdPx?policy.ownCompactMinPx:policy.ownMinPx,h*policy.ownFraction))):0;
      const own=stage.querySelector('.layout-self');if(own&&stage.dataset.hasHand==='true'){const natural=[...own.children].reduce((sum,node)=>sum+layoutRect(node).height,policy.ownNaturalPaddingPx);ownZone=Math.min(Math.max(policy.ownCompactMinPx,h*policy.ownMaxFraction),Math.max(ownZone,natural));}
      if(own&&anchoredNoHand&&portrait)ownZone=Math.max(ownZone,...[...own.children].map(node=>layoutRect(node).height+12));
      const southSeats=[...stage.querySelectorAll('.seat-south-east,.seat-south-west')];
      const southHeight=southSeats.length?Math.max(44,...southSeats.map(node=>layoutRect(node).height)):0;
      stage.style.setProperty('--anchor-south-seat-height',southHeight+'px');
      stage.style.setProperty('--north-east-height',(stage.querySelector('.seat-north-east')&&layoutRect(stage.querySelector('.seat-north-east')).height||0)+'px');
      stage.style.setProperty('--corner-control-height',(((own?layoutRect(own).height:0))+12)+'px');
      const opponentHands=stage.dataset.opponentHands==='true',edge=stage.dataset.seatStyle==='edge';
      const seatHeight=edge?(opponentHands?policy.seatEdgeHandHeightPx:policy.seatNoHandHeightPx):(opponentHands?policy.seatRingHandHeightPx:policy.seatNoHandHeightPx);
      if(edge)ownZone=Math.min(ownZone,Math.max(90,h-seatHeight-130));
      const seatWidth=edge?Math.max(120,Math.min(260,w-12,h-ownZone-2*seatHeight-24)):compact?(w-6)/2:Math.min(policy.seatMaxWidthPx,Math.max(policy.seatMinWidthPx,w*policy.seatFraction));
      stage.style.setProperty('--focus-player-columns',Math.max(1,Math.min(stage.querySelectorAll('.layout-participants .player-panel').length,portrait?Math.max(Math.ceil(roster/2),Math.floor(w/(roster>3?94:130))):Math.ceil(roster/Math.max(1,Math.floor((h-88)/58))))));
      stage.style.setProperty('--seat-width',Math.floor(seatWidth)+'px');stage.style.setProperty('--seat-height',seatHeight+'px');
      stage.style.setProperty('--seat-hand-width',Math.max(32,Math.min(78,seatWidth*.42,(seatHeight-48)/1.43))+'px');
      stage.style.setProperty('--own-zone',ownZone+'px');
      if(anchors){const fieldSize=compact?Math.min(w,h-ownZone-2*seatHeight-30):Math.min(w-2*seatWidth-12,h-(anchoredNoHand?12:ownZone+18));stage.style.setProperty('--anchor-field-size',Math.floor(Math.max(40,!portrait&&anchoredNoHand?Math.min(h-12,w*.55):fieldSize))+'px');}
      // Corner seats and controls share the same vertical offset. Reserve the
      // actual control height before centering, including multi-die toolbars.
      if(anchoredNoHand&&!portrait&&own){
        const controls=Math.max(0,...[...own.querySelectorAll('.layout-actions')].map(node=>layoutRect(node).height));
        const south=southHeight;
        const field=parseFloat(stage.style.getPropertyValue('--anchor-field-size'))||0;
        stage.style.setProperty('--anchor-corner-offset',Math.min(field*.1,Math.max(0,h/2-south-controls-16))+'px');
      }else stage.style.removeProperty('--anchor-corner-offset');
      stage.style.setProperty('--focus-own-card-width',Math.max(58,Math.min(125,(h*.32-70)/1.43))+'px');
      if(stage.dataset.surface==='player'){const count=stage.querySelectorAll('.layout-participants .player-panel').length,wide=scene.clientWidth>scene.clientHeight&&scene.clientWidth>=600;const available=stage.querySelector('.layout-participants')?.clientWidth||scene.clientWidth,columns=wide?Number(stage.dataset.landscapeRosterColumns)||1:Math.max(1,Math.min(count,Math.floor(available/155)));stage.style.setProperty('--player-columns',columns);stage.style.setProperty('--player-rows',Math.ceil(count/columns));const own=stage.querySelector('.layout-self'),height=own?.clientHeight||150;stage.style.setProperty('--focus-hand-width',Math.max(58,Math.min(125,(height-90)*.69))+'px');}fitHand(stage);root.PlayroomHandOverflow?.sync?.(host);fitField(stage);
      fitPlayerPanels(stage);
      const seatsOverlap=()=>{
        const ownBox=stage.querySelector('.layout-self')&&layoutRect(stage.querySelector('.layout-self')),groups=[...stage.querySelectorAll('.seat-group')].map(el=>layoutRect(el));
        const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1;
        return stage.dataset.seating==='circle'&&groups.some((box,i)=>overlap(box,ownBox)||groups.slice(i+1).some(other=>overlap(box,other)));
      };
      const participants=stage.querySelector('.layout-participants'),field=stage.querySelector('.layout-field');
      if(!anchors&&stage.dataset.seating==='circle'&&(seatsOverlap()||field?.clientHeight<80)){
        stage.dataset.seating='row';stage.dataset.seatingFallback='true';fitField(stage);fitHand(stage);
      }
      if(stage.dataset.seating==='row'&&participants){
        const panels=participants.querySelector('.players-panels');
        if(!portrait&&stage.dataset.landscapeRosterColumns){stage.style.setProperty('--focus-player-columns',stage.dataset.landscapeRosterColumns);if(panels)panels.dataset.compact='true';
        }else if(portrait){
          const columns=Math.max(1,Math.min(3,roster));
          stage.style.setProperty('--focus-player-columns',columns);
          if(panels)panels.dataset.compact=String(participants.clientWidth/columns<240);
        }else{
          const minimum=140,maximum=Math.max(1,Math.floor(participants.clientWidth/minimum));
          for(let columns=1;columns<=maximum;columns++){
            stage.style.setProperty('--focus-player-columns',columns);
            if(panels)panels.dataset.compact=String(participants.clientWidth/columns<(stage.dataset.opponentHands==='true'?240:120));
            if(participants.scrollHeight<=participants.clientHeight+2)break;
          }
        }
        fitPlayerPanels(stage);fitHand(stage);
      }
      root.PlayroomHandOverflow?.sync?.(host);
      // Freeze the grid tracks, not game objects: new controls stay inside their zone.
      // History and large controls can consume the remaining player-only pane.
      // Bound its scroll viewport before freezing tracks, never clip the whole scene.
      if(own){const bounds=layoutRect(stage),box=layoutRect(own),inset=parseFloat(win.getComputedStyle(stage).paddingBottom)||0;own.style.maxHeight=Math.max(0,bounds.bottom-box.top-inset)+'px';}
      if(!locked){const css=win.getComputedStyle(stage);locked={key:layoutKey,fieldAspect:Number(stage.querySelector('.layout-field')?.style.getPropertyValue('--field-aspect'))||1,rosterMinimum,rows:css.gridTemplateRows,columns:css.gridTemplateColumns,self:own?layoutRect(own).height:0,hasHand:stage.dataset.hasHand,opponentHands:stage.dataset.opponentHands,actions:[...stage.querySelectorAll('.layout-actions')].map(node=>layoutRect(node).height)};fixedLayouts.set(host,locked);}
      fieldLayouts.set(stage,locked);
      stage.style.setProperty('grid-template-rows',locked.rows,'important');
      stage.style.setProperty('grid-template-columns',locked.columns,'important');
      for(const [index,node]of [...stage.querySelectorAll('.layout-actions')].entries())if(locked.actions?.[index]>0)lockActionGeometry(node,locked.actions[index]);
      if(own&&locked.self){own.style.height=locked.self+'px';own.style.overflow=own.querySelector('.own-hand[data-hand-count="0"]')?'hidden':'auto';}
      lockFieldGrids(stage,locked);
      fitField(stage);fitStandardPieces(stage);fitScoreTables(stage);fitCardOverlaps(stage);
      for(const anchor of stage.querySelectorAll('[data-chain-anchor]')){
        const chain=anchor.closest('.domino-chain'),board=chain.closest('.domino-board'),field=stage.querySelector('.layout-field');
        const rowHeight=parseFloat(win.getComputedStyle(chain).getPropertyValue('--domino-row-height'))||52;
        const row=Number(anchor.dataset.flowRow)||0,rows=Number(chain.style.getPropertyValue('--domino-rows'))||1;
        const height=field.clientHeight,ideal=height/2-(row+.5)*rowHeight;
        const shift=ideal<0?Math.ceil(-ideal/rowHeight):ideal+rows*rowHeight>height?-Math.ceil((ideal+rows*rowHeight-height)/rowHeight):0;
        chain.style.setProperty('--chain-top',Math.max(0,ideal+shift*rowHeight)+'px');board.style.minHeight=height+'px';
      }

      // Corner seating may show an identity twice; only its visible primary
      // representation owns the turn highlight and aria-current.
      const panels=[...stage.querySelectorAll('.player-panel')];
      for(const panel of panels){panel.dataset.turnPrimary='false';panel.classList.remove('is-turn');panel.removeAttribute('aria-current');}
      for(const index of new Set(panels.map(panel=>panel.dataset.playerIndex))){
        const copies=panels.filter(panel=>panel.dataset.playerIndex===index);
        const visible=panel=>!!panel.getClientRects().length;
        const primary=copies.find(panel=>!panel.hasAttribute('data-seat-copy')&&visible(panel))||copies.find(visible);
        if(primary){primary.dataset.turnPrimary='true';if(Number(index)===Number(stage.dataset.presentationTurn??stage.dataset.turnPlayer)){primary.classList.add('is-turn');primary.setAttribute('aria-current','true');}}
      }
    }
    if(stage){stage.style.zoom='1';const current=stage.querySelector('[data-slide-key]'),prior=previous?.scene?.querySelector('[data-slide-key]');if(previous?.scene!==scene&&current&&prior&&!current.classList.contains('shared-page-deck')&&current.dataset.slideKey!==prior.dataset.slideKey&&!host.ownerDocument.body.classList.contains('reduced-motion')&&!root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches){const direction=Number(current.dataset.slideKey)>Number(prior.dataset.slideKey)?1:-1;current.animate([{transform:`translateX(${direction*24}px)`,opacity:.65},{transform:'translateX(0)',opacity:1}],{duration:220,easing:'ease-out'});}}
    for(const {node,top,left} of pendingScroll.get(host)||[])if(node.isConnected){node.scrollTop=top;node.scrollLeft=left;}
    pendingScroll.delete(host);
    for(const track of host.querySelectorAll('.hand-track.is-fan'))fitHandArc(track);
    const shell=host.querySelector('.table-shell');
    if(shell&&scene)shell.style.setProperty('--solo-side-zone',landscapeZones(scene.clientWidth,host.clientHeight-14,0).self+'px');
    if(shell&&stage&&host.ownerDocument.defaultView.matchMedia('(orientation:landscape) and (min-width:600px)').matches&&stage.dataset.surface!=='player'&&stage.dataset.soloField!=='true'){
      const shellBox=shell.getBoundingClientRect(),scale=shellBox.width/shell.offsetWidth||1,mid=shellBox.left+shellBox.width/2;
      const panels=[...stage.querySelectorAll('.player-panel')].map(node=>node.getBoundingClientRect()).filter(box=>box.width&&box.height);
      for(const [side,selector] of [['left','.turn-label'],['right','.status-details']]){
        const boxes=panels.filter(box=>side==='left'?box.right<=mid:box.left>=mid),bar=shell.querySelector('.table-status '+selector);
        if(!boxes.length||!bar)continue;
        const left=Math.min(...boxes.map(box=>box.left)),right=Math.max(...boxes.map(box=>box.right));
        bar.style.setProperty('left',((left-shellBox.left)/scale)+'px','important');
        bar.style.setProperty('right','auto','important');
        bar.style.setProperty('width',((right-left)/scale)+'px','important');
      }
    }else if(shell){for(const bar of shell.querySelectorAll('.table-status>.turn-label,.table-status>.status-details'))for(const prop of ['left','right','width'])bar.style.removeProperty(prop);}

  }
  return Object.freeze({fieldBounds,screenLayout,landscapeZones,alignInZone,zoneOutline,sessionCard,transportInfo,transportBadge,gameTitle,fitGameTitles,button:UI.button,rangeSetting,tileTheme,packRow,fitCovers,roundText,participantsMarkup,quickAccessMarkup,gameMenuActions,addPlayerButton,deleteConfirmation,actionConfirmationMarkup,confirmDialog,bindSurfaceDismiss,bindPanelGesture,openSelectChoice,classifySurface,modalContent,updateModal,patchChildren,update,interactionState,reservePlayerHand,resumeCard,icon,esc,playersMarkup,historyMarkup,resultMarkup,resultSound,presentResultSound,turnNotice,render,layoutScene,geometryMetrics,allowLayoutChange,iconButton,toolbar,pageTabs,pageTabsId,bindPageTabs,syncPageTabs,modalHead,normalizeSurfaceHead,fullscreenAction});
});
