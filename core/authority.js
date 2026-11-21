if(typeof module==='object'&&module.exports&&typeof require==='function')require("./messages.js");
(function(root,factory){
  const P=root.PlayroomProtocol||(typeof require==='function'?require('./protocol.js'):null);
  const Processor=root.PlayroomCommandProcessor||(typeof require==='function'?require('./command-processor.js'):null);
  const api=factory(P,Processor);
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.SessionAuthority=api;
})(globalThis,function(P,Processor){
  'use strict';
  const records=new WeakMap();
  const {clone,freeze,canonical}=P;
  const presentation=()=>globalThis.PlayroomTransition||(typeof require==='function'?require('../presentation/transition.js'):null);
  let sequence=0;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`authority-${Date.now()}-${++sequence}`;
  const text={REACTION_IGNORED:globalThis.PlayroomMessages.text("ui.authority.5f23a122ff2d"),REACTION_WAIT:globalThis.PlayroomMessages.text("ui.authority.3872543a6282"),PAUSED:globalThis.PlayroomMessages.text("ui.authority.85620a4ad1ea"),BAD_COMMAND:globalThis.PlayroomMessages.text("ui.authority.acdb0b2cb886"),WRONG_SESSION:globalThis.PlayroomMessages.text("ui.authority.a0c9ab47df94"),WRONG_EPOCH:globalThis.PlayroomMessages.text("ui.authority.059dd3ee0afc"),READ_ONLY:globalThis.PlayroomMessages.text("ui.authority.c1945508163a"),STALE:globalThis.PlayroomMessages.text("ui.authority.3071d856a05b"),ILLEGAL:globalThis.PlayroomMessages.text("ui.authority.190d437d1355"),ID_CONFLICT:globalThis.PlayroomMessages.text("ui.authority.a19dbd4bae20"),CLOSED:globalThis.PlayroomMessages.text("ui.authority.b8adaa326e7c"),BUSY:globalThis.PlayroomMessages.text("ui.authority.08135f979c63"),RECEIPT_LIMIT:globalThis.PlayroomMessages.text("ui.authority.a7cd175031c4"),STORAGE_ERROR:globalThis.PlayroomMessages.text("ui.authority.852785addf93"),RECOVERY_REQUIRED:globalThis.PlayroomMessages.text("ui.authority.06ab5f697dcc")};
  // Keep the projection's order, but only its exact enabled choices. A
  // targeted move must never implicitly enable a shorter move of the same type.
  function authorizedCommands(commands,actions){
    const resolve=P.choiceIndex(commands);
    const allowed=new Set(actions.map(action=>resolve(action,true)));
    return commands.filter(command=>allowed.has(command));
  }
  const stateFields=['version','game','packVersion','packStateVersion','preset','players','turn','status','winner','winners','move','firstPlayer','firstPlayerMode','result','openHands','events','scene','timeline'];
  function retainProjection(r,state,view){
    // Retain only fields the frame uses. The separate engine data view
    // duplicates data this boundary already receives in the authorized model.
    const fields={};
    for(const key of stateFields)if(view[key]!==undefined)fields[key]=view[key];
    const timeline=fields.timeline;
    const History=globalThis.PlayroomHistory||(typeof require==='function'?require('./history.js'):null);
    const shared=timeline&&timeline===state.timeline&&History?.owns(state);
    if(shared)delete fields.timeline;
    // The event presenter owns cached, immutable rows. Compose the event list
    // independently so the protocol keeps those rows across revisions.
    if(Array.isArray(fields.events))fields.events=P.composeArray(fields.events);
    const projected=P.composeRecord({state:P.composeRecord(fields),model:view.modelProjection,tableActions:view.tableActions});
    if(!shared)return projected;
    // Keep one protocol-owned copy of the public timeline across audiences.
    r.publicTimelines??=new Map();
    let progress=r.publicTimelines.get(timeline);
    if(!progress){
      progress=P.immutable(timeline);r.publicTimelines.set(timeline,progress);
      if(r.publicTimelines.size>2)r.publicTimelines.delete(r.publicTimelines.keys().next().value);
    }
    return P.composeRecord({...projected,state:P.composeRecord({...projected.state,timeline:progress})});
  }
  class SessionAuthority {
    constructor(session,{sessionId=uid(),authorityEpoch=uid(),clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},receiptLimit=20000,persistence=null,restoredReceipts=[],paused=false,controlRevision=0,playerControls=null,playerControlRevision=0,playerControlReceipts=[],realtime=null,clockTime=session.clockTime??session.current.clock??0,clockUpdatedAt=null,seriesResult=null}={}){
      if(!session?.current||!session.engine?.project)throw Error('Session required');
      if(typeof paused!=='boolean'||!Number.isSafeInteger(controlRevision)||controlRevision<0)throw Error('Invalid restored control');
      const controlsApi=globalThis.PlayroomPlayerControls||(typeof require==='function'?require('./player-controls.js'):null);
      ({playerControls,playerControlRevision,playerControlReceipts}=controlsApi.validate({playerControls:playerControls??undefined,playerControlRevision,playerControlReceipts},session.current.players,session.current.move));
      const playerReceipts=new Map(playerControlReceipts.map(row=>[row.key,row]));
      const receipts=new Map();
      if(!Array.isArray(restoredReceipts))throw Error('Invalid restored receipts');
      for(const row of restoredReceipts){
        if(!Number.isInteger(row?.viewer)||(row.viewer<0&&!(row.viewer===-1&&(row.receipt?.host===true&&row.receipt?.control===true||row.receipt?.hostClock===true)))||row.viewer>=session.current.players.length||
            typeof row.commandId!=='string'||!row.commandId||typeof row.signature!=='string'||
            row.receipt?.commandId!==row.commandId||typeof row.receipt?.ok!=='boolean')
          throw Error('Invalid restored receipt');
        const key=`${row.viewer}:${row.commandId}`;
        if(receipts.has(key))throw Error('Duplicate restored receipt');
        receipts.set(key,{signature:row.signature,receipt:freeze(clone(row.receipt))});
      }
      const realtimePort=typeof realtime==='function'?realtime({sessionId,authorityEpoch}):realtime;
      if(realtimePort&&(!realtimePort.scope||Object.keys(realtimePort.scope).some(k=>!['sessionId','authorityEpoch','roundId'].includes(k))||typeof realtimePort.scope.roundId!=='string'||!/^[a-zA-Z0-9_.:-]{1,128}$/.test(realtimePort.scope.roundId)||realtimePort.scope.sessionId!==sessionId||realtimePort.scope.authorityEpoch!==authorityEpoch||typeof realtimePort.request!=='function'||typeof realtimePort.preview!=='function'))throw Error('REALTIME_PORT_INVALID');
      records.set(this,{gameClock:clockTime+(!paused&&clockUpdatedAt!==null?Math.max(0,Date.now()-clockUpdatedAt):0),gameClockAnchor:typeof clock.now==='function'?clock.now():(globalThis.performance?.now?.()??Date.now()),gameTimer:null,seriesResult,realtime:realtimePort,playerControls:clone(playerControls),playerControlRevision,playerReceipts,controlPending:false,session,sessionId,authorityEpoch,clock,receipts,bindings:new Set(),activityListeners:new Set(),timer:null,busy:false,idleWaiters:[],stopRequested:false,stopPromise:null,disposed:false,receiptLimit:persistence?Infinity:receiptLimit,persistence,paused:!!paused,controlRevision,reactions:new Map(),reactionRevision:0,botOptions:null,connected:new Map()});this._initializePreview();this._scheduleClock();
    }
    _initializePreview(){const r=records.get(this);if(r.realtime||!r.session.engine.get(r.session.game,r.session.packVersion).isolated)return;const API=globalThis.PlayroomRealtimeSession||(typeof require==='function'?require('../application/realtime-session.js'):null);r.realtime=new API.PreviewHub({scope:{sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,roundId:'sdk-inputs'},authorize:(actor,data)=>{const Inputs=globalThis.PlayroomModelInputs||(typeof require==='function'?require('./model-inputs.js'):null),choices=r.session.engine.inputChoices(r.session.current,actor).filter(choice=>Object.values(choice.fields).some(field=>field.kind==='ink'));return Inputs.resolve(choices,data);},broadcast:envelope=>{for(const binding of r.bindings)if(!binding.closed)for(const listener of binding.realtimeListeners)try{listener(P.immutable(envelope));}catch{}},now:()=>this._now()});}
    get gameTime(){const r=records.get(this);return Math.max(r.session.clockTime??0,Math.floor(r.gameClock+(r.paused?0:Math.max(0,this._now()-r.gameClockAnchor))));}
    get clockError(){return records.get(this).clockError;}
    _clockFailed(error){const r=records.get(this);if(!r.clockError){r.clockError=typeof error?.code==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(error.code)?error.code:'CLOCK_TRANSITION_FAILED';r.reactionRevision++;}this._publish();}
    _scheduleClock(){const r=records.get(this);if(r.gameTimer!==null)r.clock.clearTimeout(r.gameTimer);r.gameTimer=null;if(r.disposed||r.paused||r.stopRequested||r.clockError||r.session.current.status!=='playing'||r.session.current.clock===undefined)return;r.gameTimer=r.clock.setTimeout(()=>{r.gameTimer=null;if(r.busy||r.controlPending){this._scheduleClock();return;}try{const result=this.advanceClock();if(result?.then)result.catch(error=>this._clockFailed(error)).finally(()=>this._scheduleClock());else this._scheduleClock();}catch(error){this._clockFailed(error);}},100);}
    clockActions(){
      const r=records.get(this),s=r.session;
      if(r.disposed||r.paused||r.stopRequested||r.clockError)return [];
      return s.engine.get(s.game,s.packVersion).clockActions?.(s.current)??[];
    }
    // Only the local room owner UI has this port. Connection bindings have player commands.
    async runClockAction(control){
      const r=records.get(this),revision=this.revision,now=this.gameTime;
      if(r.busy||r.controlPending)throw Error('BUSY');
      await this.advanceClock(now);
      if(r.busy||r.controlPending||this.revision!==revision||!this.clockActions().some(action=>canonical(action)===canonical(control)))throw Error('CLOCK_ACTION_UNAVAILABLE');
      return this.advanceClock(this.gameTime,control);
    }
    advanceClock(now=this.gameTime,control){const r=records.get(this),s=r.session;if(r.disposed||r.paused||r.stopRequested||r.busy||s.current.clock===undefined)return s.current;if(!Number.isSafeInteger(now)||now<s.clockTime)throw Error('CLOCK_INVALID');const next=s.prepareClock(now,control);if(next===s.current)return next;const command={commandId:'clock-'+uid(),action:s.preparedAction(next).command},before=s.current;const result=this._processor().execute({sessionId:r.sessionId,actor:-1,command,signature:canonical({action:command.action,revision:before.move}),before,prepare:()=>next});const finish=receipt=>{if(!receipt.ok){r.clockError=receipt.code;r.reactionRevision++;this._publish();throw Error(receipt.code);}r.clockError=null;this._scheduleClock();return s.current;};return result?.then?result.then(finish):finish(result);}
    _processor() {
      const r=records.get(this);
      return r.processor ||= new Processor({
        persistence:r.persistence,
        checkpoint:(before,next,actor,command)=>r.session.engine.checkpoint?.(before,next,actor,command)??true,
        begin:()=>{r.busy=true;},end:()=>this._idle(),
        commit:next=>{const action=r.session.preparedAction(next);const result=r.session.commitPrepared(next);r.realtime?.confirmed?.(action?.command);return result;},
        describeAction:next=>r.session.preparedAction?.(next),
        remember:(actor,id,signature,receipt)=>r.receipts.set(`${actor}:${id}`,{signature,receipt:freeze(receipt)}),
        publish:(before,next)=>{
          this._publish();if(r.persistence&&!r.botBatch)this.scheduleBot();
        },
        reject:(code,command)=>({ok:false,code,message:text[code],commandId:command.commandId,revision:this.revision}),
        fence:()=>{r.disposed=true;}
      });
    }
    get revision(){return records.get(this).session.current.move;}
    // Host-local metadata port: never a scene, never a network capability.
    activity(){
      const r=records.get(this),s=r.session;this._syncReactionWindows();const targets=[];
      if(!r.disposed&&!r.paused&&s.current.status==='playing')for(let actor=0;actor<s.current.players.length;actor++){
        if(this._botControlled(actor)||r.playerControls[actor]?.away)continue;
        if(s.engine.availableCommands(s.current,actor).some(action=>{
          const control=this._reactionControl(actor,action);
          return !this._currentReaction(actor,action,control)&&this._reactionDecision(actor,action,control)!=='REACTION_WAIT';
        }))targets.push(actor);
      }
      return P.immutable({sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,revision:this.revision,controlRevision:r.controlRevision,state:s.current.status==='finished'?'finished':r.paused?'paused':'playing',targets});
    }
    subscribeActivity(listener){const r=records.get(this);if(r.disposed||typeof listener!=='function')throw Error('ACTIVITY_SUBSCRIPTION_INVALID');r.activityListeners.add(listener);return ()=>r.activityListeners.delete(listener);}

    connect(viewer=-1){
      const r=records.get(this);
      if(r.disposed||!Number.isInteger(viewer)||viewer < -1||viewer>=r.session.current.players.length)throw Error('Invalid audience');
      return this._connect({viewer,role:viewer<0?'spectator':'player'});
    }
    // Host capability: the client never chooses its grants or data audience.
    connectTable(actors){
      const r=records.get(this);
      if(!Array.isArray(actors)||new Set(actors).size!==actors.length||actors.some(actor=>
        !Number.isInteger(actor)||actor<0||actor>=r.session.current.players.length))throw Error('Invalid Table actors');
      return this._connect({viewer:-1,role:'table',actors:Object.freeze([...actors])});
    }
    _connect(access){
      const r=records.get(this);if(r.disposed)throw Error('Invalid audience');
      const binding={...access,listeners:new Set(),wireListeners:new Set(),realtimeListeners:new Set(),closed:false},viewer=binding.viewer;r.bindings.add(binding);if(binding.role==='player')r.realtime?.connected?.(viewer);
      const requireOpen=()=>{if(binding.closed||r.disposed)throw Error(text.CLOSED);};
      const readHistory=(index,options={})=>{
        if(!Number.isSafeInteger(index)||index<0||index>=r.session.historyLength)throw Error('Invalid history index');
        return this._snapshot(viewer,index,access,!!options.wire);
      };
      const readRange=(start,count,options={})=>P.historyRange(index=>readHistory(index,options),start,count,r.session.historyLength);
      return Object.freeze({
        snapshot:(options={})=>{requireOpen();return this._snapshot(viewer,undefined,binding,!!options.wire);},
        status:()=>{requireOpen();return this._status(binding);},
        history:(index,options)=>{requireOpen();return readHistory(index,options);},
        historyRange:(start,count,options)=>{requireOpen();return readRange(start,count,options);},
        completedHistory:()=>{
          requireOpen();
          if(r.session.current.status!=='finished')throw Error('HISTORY_NOT_FINISHED');
          // A peer can ask for the previous match while the room is in its
          // lobby. Retain its fixed audience and a reader without live commands.
          return Object.freeze({history:readHistory,historyRange:readRange});
        },
        subscribeRealtime:listener=>{requireOpen();if(typeof listener!=='function')throw Error('REALTIME_LISTENER_INVALID');binding.realtimeListeners.add(listener);return()=>binding.realtimeListeners.delete(listener);},
        realtimeScope:()=>{requireOpen();return r.realtime?P.immutable(r.realtime.scope):null;},
        realtime:value=>{requireOpen();if(!r.realtime)throw Error('REALTIME_UNAVAILABLE');if(!value||typeof value.method!=='string'||!/^[a-zA-Z0-9_.:-]{1,64}$/.test(value.method)||value.method==='finalize'||new TextEncoder().encode(JSON.stringify(value)).length>512*1024)throw Error('REALTIME_REQUEST_INVALID');const actor=binding.role==='player'?viewer:-1;if(!['checkpoint','stroke'].includes(value.method)&&(actor<0||r.paused||r.playerControls[actor]?.away||this._botControlled(actor)))throw Error('REALTIME_UNAVAILABLE');if(value.method==='preview'&&(r.busy||r.controlPending||r.stopRequested))throw Error('REALTIME_UNAVAILABLE');const run=()=>value.method==='preview'?r.realtime.preview(actor,value.envelope):r.realtime.request(actor,value.method,value.envelope);if(value.method==='preview'&&r.session.current.clock!==undefined){const advanced=this.advanceClock();return advanced?.then?advanced.then(run):run();}return run();},
        presentationReady:message=>this._presentationReady(binding,message),
        dispatch:(command,options={})=>this._dispatch(binding,command,false,options),
        subscribe:(listener,options={})=>{requireOpen();if(typeof listener!=='function')throw Error('Listener required');const listeners=options.wire?binding.wireListeners:binding.listeners;listeners.add(listener);return ()=>listeners.delete(listener);},
        close:()=>{binding.closed=true;binding.listeners.clear();binding.wireListeners.clear();binding.realtimeListeners.clear();r.bindings.delete(binding);if(binding.role==='player'&&![...r.bindings].some(b=>!b.closed&&b.role==='player'&&b.viewer===viewer))r.realtime?.disconnected?.(viewer);}
      });
    }
    _status(binding){
      const r=records.get(this),s=r.session;this._syncReactionWindows();
      return P.freeze({kind:'status',scope:'session',sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,game:s.game,packVersion:s.packVersion,viewer:binding.viewer,role:binding.role,revision:s.current.move,controlRevision:r.controlRevision,playerControlRevision:r.playerControlRevision,reactionRevision:r.reactionRevision,rosterRevision:s.metadataRevision||0});
    }
    _snapshot(viewer,index,binding=null,wire=false){
      const r=records.get(this),s=r.session,live=index===undefined,state=live?s.current:s.states[index];
      const windows=live?this._syncReactionWindows():[];
      const reactionNow=r.transferStartedAt??this._now();
      const reactionWindows=windows.map(window=>({...window.descriptor,suspended:window.suspended,protected:window.readyAt===null||reactionNow<window.readyAt+window.descriptor.humanMs}));
      const reactionWindow=reactionWindows.find(w=>w.owner===viewer)||reactionWindows[0]||null;
      const role=binding?.role||(viewer<0?'spectator':'player');
      const actor=role==='table'?(live&&binding.actors.includes(state.turn)&&!this._botControlled(state.turn)&&!r.playerControls[state.turn]?.away?state.turn:-1):viewer;
      // Cache facts only. Reaction clocks, control gates and permissions below
      // are evaluated on every read, even when no game revision has changed.
      r.projections??=new Map();if(!r.projections.has(state)){r.projections.set(state,new Map());while(r.projections.size>2)r.projections.delete(r.projections.keys().next().value);}
      const cache=r.projections.get(state),key=JSON.stringify([role,actor,viewer,wire,s.metadataRevision||0]);
      let projected=cache.get(key);
      if(!projected){
        const options={rawEvents:wire,omitModelEvents:wire,dataView:'omit'};
        const view=role==='table'&&s.engine.projectTable?s.engine.projectTable(state,actor,options):s.engine.project(state,viewer,options);
        projected=retainProjection(r,state,view);cache.set(key,projected);
        while(cache.size>128)cache.delete(cache.keys().next().value);
      }
      const model=projected.model,events=projected.state.events;
      const previous=live?s.previous:s.states[index-1];
      const afterEventId=previous?.events.at(-1)?.id||0;
      const effects=!wire&&previous?presentation().transferEffects(events,viewer,state.move,afterEventId):[];
      // All outer fields are deliberate. options, seed and authority journal are absent.
      const safe={...projected.state};
      if(live&&safe.players&&s.playerMetadata)safe.players=safe.players.map((player,index)=>({...player,...s.playerMetadata(index)}));
      const inputAllowed=live&&!r.paused&&!r.clockError&&actor>=0&&!this._botControlled(actor)&&!r.playerControls[actor]?.away;
      const rules=s.engine.get(s.game,s.packVersion);
      const directSDK=rules.isolated&&model?.choicesVersion!==1;
      const actions=[],independentActions=[];
      if((!wire||directSDK)&&inputAllowed){
        const choices=role==='table'?projected.tableActions||[]:s.engine.legalActions(state,actor);
        const controls=s.engine.reactionControls?.(state,actor,choices)??choices.map(choice=>this._reactionControl(actor,choice));
        for(const [index,choice] of choices.entries()){
          const control=controls[index],decision=this._reactionDecision(actor,choice,control,windows);
          if(decision==='REACTION_WAIT')continue;
          // The display list and its independent subset share one owned
          // choice. Keep that identity when composing the snapshot below.
          const action=P.immutable(control?.kind==='challenge'&&decision==='REACTION_IGNORED'?{...choice,disabled:true}:choice);
          actions.push(action);
          if(role==='player'&&this._currentReaction(actor,choice,control))independentActions.push(action);
        }
      }
      if(model){
        const allowed=wire&&!directSDK?[]:authorizedCommands(model.actions,actions);
        const sameScene=!wire&&(inputAllowed||!model.inputs?.length)&&allowed.length===model.actions.length&&
          safe.players.every((player,index)=>player.name===state.players[index].name);
        if(directSDK){
          const authorized={...model,actions:allowed,inputs:inputAllowed?model.inputs||[]:[]};
          safe.sdkProjection=P.composeRecord(authorized);
          // The recipient builds the wire scene from these authorized controls.
          if(wire)delete safe.scene;
          else if(!sameScene||!safe.scene||!Array.isArray(model.inputs))safe.scene=(rules.restrictedScene||rules.scene)(safe.sdkProjection,safe.players);
        }else if(wire){const {events:_,...facts}=model;safe.modelProjection=P.composeRecord(facts);delete safe.scene;}
        else if(!sameScene)safe.scene=(rules.restrictedScene||rules.scene)({...model,actions:allowed,inputs:inputAllowed?model.inputs||[]:[]},safe.players);
      }
      const series=state.status==='finished'?r.seriesResult?.(state):null;
      if(series)safe.matchSeriesResult=series;
      const frameActions=P.composeArray(actions);
      if(role==='table'){safe.tableActor=actor;safe.tableActions=frameActions;}
      const frame=P.composeRecord({...r.clockError?{clockError:r.clockError}:{},now:live?this.gameTime:state.clock??0,protocolVersion:3,inputAllowed,role,...(role==='table'?{actor}:{}),kind:live?'snapshot':'history',...(live&&r.realtime?{realtimeScope:r.realtime.scope}:{}),sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,revision:state.move,reactionRevision:r.reactionRevision,paused:r.paused,controlRevision:r.controlRevision,playerControls:r.playerControls,playerControlRevision:r.playerControlRevision,game:s.game,packVersion:s.packVersion,viewer,audience:viewer<0?'public':'player',state:P.composeRecord(safe),actions:frameActions,independentActions:P.composeArray(independentActions),events,historyLength:s.historyLength,rosterRevision:s.metadataRevision||0,...(!wire?{cues:presentation().soundCues(events,safe,viewer,afterEventId),effects}:{}),reactionWindow,reactionWindows});
      return model?P.withProjection(frame,safe.sdkProjection||model):frame;
    }
    _now(){const clock=records.get(this).clock;return typeof clock.now==='function'?clock.now():(globalThis.performance?.now?.()??Date.now());}
    _clearWindow(window){
      const r=records.get(this);
      for(const key of ['timer','openTimer']){if(window[key]!=null)r.clock.clearTimeout(window[key]);window[key]=null;}
    }
    _syncReactionWindows(){
      const r=records.get(this),engine=r.session.engine,state=r.session.current;
      const descriptors=engine.reactionWindows?engine.reactionWindows(state):[engine.reactionWindow?.(state)].filter(Boolean);
      const ids=new Set(descriptors.map(w=>w.id));
      for(const [id,window] of r.reactions)if(!ids.has(id)){this._clearWindow(window);r.reactions.delete(id);r.reactionRevision++;}
      for(const descriptor of descriptors){
        let window=r.reactions.get(descriptor.id);
        if(!window){window={descriptor,createdAt:this._now(),readyAt:null,suspended:!this._botControlled(descriptor.owner)&&(r.connected.get(descriptor.owner)===false||r.playerControls[descriptor.owner]?.away),timer:null,openTimer:null};r.reactions.set(descriptor.id,window);r.reactionRevision++;}
        if(!r.paused&&!r.stopRequested&&!window.suspended&&window.readyAt===null&&window.timer===null){
          window.timer=r.clock.setTimeout(()=>{window.timer=null;this._setReactionReady(window);},Math.max(0,window.createdAt+(this._botControlled(descriptor.owner)?0:descriptor.fallbackMs)-this._now()));
        }
      }
      return [...r.reactions.values()];
    }
    _setReactionReady(window){
      const r=records.get(this);if(r.disposed||r.paused||r.stopRequested||window.suspended||r.reactions.get(window.descriptor.id)!==window)return;
      this._clearWindow(window);window.readyAt=this._now();r.reactionRevision++;
      this._armReactionOpen(window,window.descriptor.humanMs);
      this._publish();if(r.botOptions)this.scheduleBot(r.botOptions);
    }
    _armReactionOpen(window,delay){
      const r=records.get(this);
      window.openTimer=r.clock.setTimeout(()=>{window.openTimer=null;if(r.disposed||r.paused||r.stopRequested||window.suspended||r.reactions.get(window.descriptor.id)!==window)return;r.reactionRevision++;this._publish();},delay);
    }
    _presentationReady(binding,message){
      const r=records.get(this);
      if(binding.closed||r.disposed)return {ok:false,code:'CLOSED'};
      const window=this._syncReactionWindows().find(w=>w.descriptor.id===message?.windowId);
      if(r.stopRequested)return {ok:false,code:'BUSY'};
      if(!P.validatePresentationReady(message))return {ok:false,code:'BAD_COMMAND'};
      if(message.sessionId!==r.sessionId)return {ok:false,code:'WRONG_SESSION'};
      if(message.authorityEpoch!==r.authorityEpoch)return {ok:false,code:'WRONG_EPOCH'};
      if(r.paused||window?.suspended||message.controlRevision!==r.controlRevision||!window||binding.viewer!==window.descriptor.owner||this._botControlled(binding.viewer)||r.playerControls[binding.viewer]?.away||message.windowId!==window.descriptor.id||message.revision!==window.descriptor.revision)return {ok:false,code:'REACTION_IGNORED',ignored:true};
      if(window.readyAt!==null)return {ok:true,duplicate:true};
      this._setReactionReady(window);
      return {ok:true};
    }
    // Host-owned room presence, never a client command. A disconnected owner
    // cannot lose a protected response window while their screen is unavailable.
    setViewerConnected(viewer,connected){
      const r=records.get(this);
      if(!Number.isInteger(viewer)||viewer<0||viewer>=r.session.current.players.length||typeof connected!=='boolean')throw Error('Invalid audience presence');
      if(r.disposed)return;
      const previous=r.connected.get(viewer)!==false;r.connected.set(viewer,connected);if(previous===connected)return;
      const windows=this._syncReactionWindows().filter(w=>w.descriptor.owner===viewer);if(!windows.length)return;
      if(r.timer!==null)r.clock.clearTimeout(r.timer);r.timer=null;
      for(const window of windows){this._clearWindow(window);window.suspended=!this._botControlled(viewer)&&(!connected||r.playerControls[viewer]?.away);window.readyAt=null;window.createdAt=this._now();r.reactionRevision++;}
      this._publish();if((connected||this._botControlled(viewer))&&r.botOptions)this.scheduleBot(r.botOptions);
    }
    _reactionControl(actor,action){
      const s=records.get(this).session;
      return s.engine.reactionControl?.(s.current,actor,action)??null;
    }
    _reactionDecision(actor,action,control=this._reactionControl(actor,action),currentWindows){
      if(control?.ignore)return 'REACTION_IGNORED';
      if(control?.episode!==undefined&&action.episode!==control.episode)return 'BAD_COMMAND';
      if(!control||!['challenge','advance'].includes(control.kind))return null;
      const now=records.get(this).transferStartedAt??this._now();
      for(const window of currentWindows??this._syncReactionWindows()){
        if(control.kind!=='advance'&&control.target!==undefined&&window.descriptor.owner!==control.target)continue;
        const delay=this._botControlled(actor)?window.descriptor.botMs:window.descriptor.humanMs;
        if(window.readyAt===null||now<window.readyAt+delay)return control.kind==='challenge'?'REACTION_IGNORED':'REACTION_WAIT';
      }
      return null;
    }
    _currentReaction(actor,action,control=this._reactionControl(actor,action)){
      return !!control?.independent&&['answer','challenge'].includes(control.kind)&&Number.isSafeInteger(action.episode)&&action.episode===control.episode;
    }
    _commandActor(binding,command,internalBot=false){
      const state=records.get(this).session.current;
      if(binding.role==='table'){
        if(command.action.type==='session-pause'||!binding.actors.includes(command.actor)||state.players[command.actor]?.bot)return {code:'READ_ONLY'};
        return {actor:command.actor};
      }
      if(Object.hasOwn(command,'actor'))return {code:'BAD_COMMAND'};
      if(binding.viewer<0||(!internalBot&&state.players[binding.viewer]?.bot))return {code:'READ_ONLY'};
      return {actor:binding.viewer};
    }
    _actionFor(binding,actor,action){
      const s=records.get(this).session;
      return binding.role==='table'?s.engine.tableCommand(s.current,actor,action):action;
    }
    _dispatch(binding,command,internalBot=false,{wire=false,receiptOnly=false,clockChecked=false}={}){
      const r=records.get(this),s=r.session;
      const snapshot=()=>this._snapshot(binding.viewer,undefined,binding,wire);
      const reject=code=>freeze({ok:false,code,message:text[code],commandId:typeof command?.commandId==='string'?command.commandId:null,
        revision:this.revision,...(!binding.closed&&!r.disposed?{snapshot:snapshot()}:{})});
      if(binding.closed||r.disposed)return reject('CLOSED');
      if(!P.validate(command)||wire&&s.engine.get(s.game,s.packVersion).isIntent?.(command.action)===false)return reject('BAD_COMMAND');
      if(command.sessionId!==r.sessionId)return reject('WRONG_SESSION');
      // A restored durable authority may replay an existing receipt across epochs.
      if(!r.persistence&&command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      const access=this._commandActor(binding,command,internalBot);
      if(access.code)return reject(access.code);
      const actor=access.actor,key=`${actor}:${command.commandId}`,signature=canonical(command),cached=r.receipts.get(key);
      if(cached){const answer=equal=>binding.closed||r.disposed?reject('CLOSED'):equal?freeze({...cached.receipt,duplicate:true,...(!receiptOnly||!cached.receipt.ok?{snapshot:snapshot()}:{})}):reject('ID_CONFLICT');return cached.signature.startsWith('sha256:')?P.fingerprint(signature).then(hash=>answer(hash===cached.signature)):answer(cached.signature===signature);}
      if(command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      if(!internalBot&&(this._botControlled(actor)||r.playerControls[actor]?.away))return reject('READ_ONLY');
      if(r.controlPending)return reject('BUSY');
      if(r.stopRequested)return reject('PAUSED');
      if(r.busy||r.botBatch&&!internalBot)return reject('BUSY');
      if(!clockChecked&&!r.paused&&s.current.clock!==undefined){const advanced=this.advanceClock();if(advanced?.then)return advanced.then(()=>this._dispatch(binding,command,internalBot,{wire,receiptOnly,clockChecked:true}));if(command.expectedRevision!==this.revision)return reject('STALE');}
      if(command.action.type==='session-pause')return this._pause(binding,command,signature,key,reject,{wire,receiptOnly});
      if(r.paused)return reject('PAUSED');
      if(r.receipts.size>=r.receiptLimit)return reject('RECEIPT_LIMIT');
      const control=this._reactionControl(actor,command.action),decision=this._reactionDecision(actor,command.action,control);
      const rejection=decision?{...reject(decision),...(decision==='REACTION_IGNORED'?{ignored:true}:{})}:
        command.expectedRevision!==this.revision&&!this._currentReaction(actor,command.action,control)?reject('STALE'):null;
      const result=this._processor().execute({sessionId:r.sessionId,actor,command,signature,before:s.current,rejection,
        prepare:()=>s.prepare(actor,this._actionFor(binding,actor,command.action),s.current.clock===undefined?{}:{now:this.gameTime})});
      const reply=receipt=>freeze({...receipt,...(!r.disposed&&(!receiptOnly||!receipt.ok)?{snapshot:snapshot()}:{})});
      return result&&typeof result.then==='function'?result.then(reply):reply(result);
    }
    async _pause(binding,command,signature,key,reject,{wire=false,receiptOnly=false}={}){
      const r=records.get(this);
      if(r.session.current.players[binding.viewer]?.bot)return reject('READ_ONLY');
      if(typeof command.action.paused!=='boolean')return reject('BAD_COMMAND');
      if(command.expectedRevision!==this.revision||command.action.expectedControlRevision!==r.controlRevision)return reject('STALE');
      r.busy=true;
      try{
        await r.processor?.flush();
        const gameClock=this.gameTime;
        const controlRevision=r.controlRevision+(r.paused===command.action.paused?0:1);
        const receipt={ok:true,code:'OK',control:true,commandId:command.commandId,revision:this.revision,controlRevision,...(binding.host?{host:true}:{})};
        if(r.persistence)await r.persistence.setControl({sessionId:r.sessionId,previousControlRevision:r.controlRevision,paused:command.action.paused,...(r.session.current.clock!==undefined?{clockTime:gameClock,clockUpdatedAt:Date.now()}:{}),controlRevision,viewer:binding.viewer,commandId:command.commandId,signature,receipt});
        r.gameClock=gameClock;r.gameClockAnchor=this._now();if(r.session.current.clock!==undefined)r.session.setClockTime(gameClock);r.paused=command.action.paused;r.controlRevision=controlRevision;
        for(const window of r.reactions.values()){this._clearWindow(window);window.readyAt=null;window.createdAt=this._now();r.reactionRevision++;}
        r.receipts.set(key,{signature,receipt:freeze(receipt)});
        this.cancelBot();this._publish();
        return freeze({...receipt,...(!receiptOnly?{snapshot:this._snapshot(binding.viewer,undefined,binding,wire)}:{})});
      }catch(_){return reject('STORAGE_ERROR');}finally{this._idle();if(!r.paused&&r.persistence)this.scheduleBot();}
    }
    _idle(){const r=records.get(this);r.busy=false;this._scheduleClock();if(!r.botBatch)for(const resolve of r.idleWaiters.splice(0))resolve();}
    _botControlled(actor){const r=records.get(this);return !!((r.session.playerMetadata?.(actor)?.bot??r.session.current.players[actor]?.bot)||r.playerControls[actor]?.bot);}
    // Host capability only. Network adapters bind the requester before calling this.
    async setPlayerControl(actor,changes,{requestId,expectedRevision}={}){
      const r=records.get(this),error=code=>{throw Error(code);};
      if(r.disposed)error('CLOSED');
      if(!Number.isInteger(actor)||actor<0||actor>=r.playerControls.length||r.session.current.players[actor].bot||!changes||!Object.keys(changes).length||Object.keys(changes).some(k=>!['away','bot'].includes(k)||typeof changes[k]!=='boolean')||typeof requestId!=='string'||!requestId||requestId.length>128)error('BAD_COMMAND');
      const key=actor+':'+requestId,signature=canonical({actor,changes,expectedRevision}),cached=r.playerReceipts.get(key);
      if(cached){if(cached.signature!==signature)error('ID_CONFLICT');return freeze({...cached.receipt,duplicate:true});}
      if(changes.bot===true&&r.session.engine.get(r.session.game,r.session.packVersion).capabilities?.bots===false)error('BOTS_UNSUPPORTED');
      if(r.stopRequested||r.controlPending)error('BUSY');
      if(expectedRevision!==r.playerControlRevision)error('STALE');
      if(r.playerReceipts.size>=20000)error('RECEIPT_LIMIT');
      const next={...r.playerControls[actor],...changes};
      if(changes.bot===true&&!next.away&&r.connected.get(actor)!==false)error('PLAYER_AVAILABLE');
      r.controlPending=true;const bots=r.botOptions;this.cancelBot();
      try{
        // Finish accepted moves (including a private simultaneous draft) before
        // changing controller; queued timers and new commands are fenced above.
        if(r.busy||r.botBatch)await new Promise(resolve=>r.idleWaiters.push(resolve));
        if(r.disposed||r.stopRequested)error('BUSY');
        await r.processor?.flush();
        const controls=clone(r.playerControls);controls[actor]=next;
        const revision=r.playerControlRevision+1,receipt={ok:true,playerControlRevision:revision,revision:this.revision,requestId};
        const rows=[...r.playerReceipts.values(),{key,signature,receipt}];
        if(r.persistence)await r.persistence.setPlayerControls({sessionId:r.sessionId,previousRevision:r.playerControlRevision,playerControlRevision:revision,playerControls:controls,playerControlReceipts:rows});
        r.playerControls=controls;r.playerControlRevision=revision;r.playerReceipts.set(key,{key,signature,receipt});
        for(const window of [...r.reactions.values()].filter(w=>w.descriptor.owner===actor)){this._clearWindow(window);window.suspended=!this._botControlled(window.descriptor.owner)&&(r.connected.get(window.descriptor.owner)===false||controls[window.descriptor.owner]?.away);window.readyAt=null;window.createdAt=this._now();r.reactionRevision++;}
        this._publish();return freeze(receipt);
      }finally{r.controlPending=false;if(bots&&!r.disposed)this.scheduleBot(bots);}
    }
    async suspendForTransfer(){
      const r=records.get(this);if(r.disposed||r.stopRequested||r.controlPending)throw Error('HOST_TRANSFER_BUSY');
      const startedAt=this._now(),bots=r.botOptions;
      r.stopRequested=true;r.transferStartedAt=startedAt;this.cancelBot();
      for(const window of r.reactions.values())this._clearWindow(window);
      let released=false;
      // An aborted transfer keeps the same authority and acknowledgement.
      // Resume the remaining deadlines without requiring another UI message.
      const thaw=()=>{
        if(released||r.disposed)return;
        released=true;r.stopRequested=false;r.transferStartedAt=null;
        const now=this._now();
        for(const window of r.reactions.values()){
          const elapsed=now-Math.max(startedAt,window.createdAt);
          window.createdAt+=elapsed;
          if(window.readyAt===null)continue;
          window.readyAt+=elapsed;
          const remaining=window.readyAt+window.descriptor.humanMs-now;
          if(remaining>0&&!r.paused&&!window.suspended)this._armReactionOpen(window,remaining);
        }
        this._syncReactionWindows();this._publish();
        if(bots)this.scheduleBot(bots);
      };
      if(r.busy||r.botBatch)await new Promise(resolve=>r.idleWaiters.push(resolve));
      if(r.disposed)throw Error('HOST_TRANSFER_CLOSED');
      try{await r.processor?.flush();}catch(error){thaw();throw error;}
      return thaw;
    }
    stopForLobby(){
      const r=records.get(this);if(r.stopPromise)return r.stopPromise;
      if(r.disposed)return Promise.reject(Error(globalThis.PlayroomMessages.text("ui.authority.b8adaa326e7c")));
      if(r.controlPending)return Promise.reject(Error('BUSY'));
      r.stopRequested=true;const bots=r.botOptions;this.cancelBot();
      r.stopPromise=(async()=>{
        try{
          if(r.busy||r.botBatch)await new Promise(resolve=>r.idleWaiters.push(resolve));
          if(r.disposed)throw Error(globalThis.PlayroomMessages.text("ui.authority.b8adaa326e7c"));
          const command=P.command(this._snapshot(-1),{type:'session-pause',paused:true,expectedControlRevision:r.controlRevision},uid());
          const receipt=await this._pause({viewer:-1,host:true},command,canonical(command),`host:${command.commandId}`,code=>({ok:false,code,message:text[code]}));
          if(!receipt.ok)throw Error(receipt.message||globalThis.PlayroomMessages.text("ui.authority.05bb0383c4c2"));
          return receipt;
        }catch(error){r.stopRequested=false;if(bots)this.scheduleBot(bots);throw error;}
        finally{r.stopPromise=null;}
      })();return r.stopPromise;
    }
    async actBotAsync(actor,action){
      const r=records.get(this);
      if(r.disposed||r.busy||r.paused||!this._botControlled(actor))throw Error('Invalid bot actor');
      const receipt=await this._dispatch({viewer:actor,closed:false},P.command(this._status({viewer:actor,role:'player'}),action,uid()),true,{receiptOnly:true});
      if(!receipt.ok)throw Error(receipt.message);return r.session.current;
    }
    _publish(){
      const r=records.get(this);this._scheduleClock();
      if(r.botBatch){r.botBatch.changed=true;return;}
      for(const listener of [...r.activityListeners])try{listener();}catch(_){}
      for(const binding of [...r.bindings])if(!binding.closed)for(const wire of [false,true]){
        const listeners=wire?binding.wireListeners:binding.listeners;if(!listeners.size)continue;
        let snapshot;try{snapshot=this._snapshot(binding.viewer,undefined,binding,wire);}catch(_){continue;}
        for(const listener of [...listeners])try{listener(snapshot);}catch(_){/* UI failure cannot invalidate a commit. */}
      }
    }
    cancelBot(){const r=records.get(this);r.botOptions=null;r.botSchedule=null;if(r.timer!==null){r.clock.clearTimeout(r.timer);r.timer=null;}}
    async _drainDecisionBots(window){
      const r=records.get(this),s=r.session;
      // Persist each accepted command, but publish readiness once per window.
      // A failed write retains earlier committed decisions and publishes that truth.
      r.botBatch={changed:false};
      try{
        for(const actor of window.participants.filter(i=>this._botControlled(i)&&!window.ready.includes(i))){
          for(let part=0;part<16;part++){
            const live=s.engine.decisionWindow?.(s.current);
            if(r.disposed||r.paused||r.stopRequested||r.controlPending||!this._botControlled(actor)||live?.id!==window.id||live.ready.includes(actor))break;
            const action=s.engine.botAction(s.current,actor);if(!action)break;
            await this.actBotAsync(actor,action);
            const after=s.engine.decisionWindow?.(s.current);
            if(after?.id!==live.id||after.versions[actor]===live.versions[actor])break;
          }
        }
      }finally{
        const changed=r.botBatch.changed;r.botBatch=null;this._idle();
        if(changed&&!r.disposed)this._publish();
      }
    }
    scheduleBot({delay=500,run,onError=()=>{}}={}){
      const r=records.get(this),s=r.session,st=s.current;
      if(r.botBatch||r.disposed||r.stopRequested||r.controlPending||r.paused||st.status!=='playing'){this.cancelBot();return;}
      // A repaint is not a new decision. Preserve the deadline while the
      // revision, roster, control gates, pace and delivery callback still match.
      const previous=r.botSchedule;
      if(previous?.state===st&&previous.roster===s.metadataRevision&&previous.reaction===r.reactionRevision&&previous.controls===r.playerControlRevision&&r.botOptions?.delay===delay&&r.botOptions.run===run&&r.botOptions.onError===onError)return;
      this.cancelBot();r.botOptions={delay,run,onError};
      const window=s.engine.decisionWindow?.(st),planning=window?.participants.find(i=>this._botControlled(i)&&!window.ready.includes(i));
      const rosterState=s.metadataRevision&&s.playerMetadata?{...st,players:st.players.map((player,index)=>({...player,...s.playerMetadata(index)}))}:st;
      const windows=this._syncReactionWindows(),candidates=[];
      r.botSchedule={state:st,roster:s.metadataRevision,reaction:r.reactionRevision,controls:r.playerControlRevision};
      const offer=(actor,action,reaction)=>{
        if(!action||!this._botControlled(actor))return;
        const control=s.engine.reactionControl?.(st,actor,action),protectedWindows=windows.filter(w=>control?.target===undefined||w.descriptor.owner===control.target);
        if(control?.ignore||protectedWindows.some(w=>w.suspended)&&['challenge','advance'].includes(control?.kind))return;
        let wait=planning!==undefined&&actor===planning?0:Math.max(0,delay);
        if(control?.kind==='answer'){
          const reactionDelay=s.engine.botReactionDelay?.(st,actor);
          if(reactionDelay!=null){
            r.botReactionEpisodes??=new Map();const episode=action.episode??st.move;let timing=r.botReactionEpisodes.get(actor);
            if(!timing||timing.episode!==episode){timing={episode,startedAt:this._now()};r.botReactionEpisodes.set(actor,timing);}
            wait=Math.max(0,timing.startedAt+reactionDelay-this._now());
          }
        }
        if(['challenge','advance'].includes(control?.kind))for(const window of protectedWindows)wait=Math.max(wait,(window.readyAt??window.createdAt+window.descriptor.fallbackMs)+window.descriptor.botMs-this._now());
        candidates.push({actor,action,reaction,control,wait});
      };
      st.players.forEach((_,actor)=>{if(this._botControlled(actor))offer(actor,s.engine.botReaction?.(rosterState,actor),true);});
      const turnActor=planning??st.turn;if(this._botControlled(turnActor))offer(turnActor,s.engine.botAction(rosterState,turnActor),false);
      // Protection delays a reaction, not an unrelated legal turn. Answers win equal deadlines.
      candidates.sort((a,b)=>a.wait-b.wait||Number(b.control?.kind==='answer')-Number(a.control?.kind==='answer'));
      const selected=candidates[0];if(!selected)return;
      const {actor,wait}=selected;
      const revision=st.move,scheduleRoster=s.metadataRevision;r.timer=r.clock.setTimeout(()=>{r.timer=null;r.botSchedule=null;if(r.disposed||r.paused||r.stopRequested||r.controlPending||!this._botControlled(actor)||s.current.move!==revision)return;
        try{if(s.current!==st||s.metadataRevision!==scheduleRoster){this.scheduleBot({delay,run,onError});return;}
          const current=selected.action;
          if(this._reactionDecision(actor,current)){this.scheduleBot({delay,run,onError});return;}
          if(r.persistence&&planning!==undefined&&actor===planning&&window.participants.length>1){
            return this._drainDecisionBots(window).then(()=>this.scheduleBot({delay,onError})).catch(onError);
          }
          if(!r.persistence&&planning!==undefined&&actor===planning&&window.participants.length>1){
            // Drain only this simultaneous decision window, never the following round.
            const pending=window.participants.filter(i=>this._botControlled(i)&&!window.ready.includes(i));
            for(const [index,id] of pending.entries())for(let part=0;part<16;part++){
              const live=s.engine.decisionWindow?.(s.current);
              if(r.disposed||r.paused||r.stopRequested||live?.id!==window.id||live.ready.includes(id))break;
              const choice=s.engine.botAction(s.current,id);if(!choice)break;
              const before=s.current.move;
              // A private draft may require another command before this actor is ready.
              // Other bots are still pending, so these intermediate renders can be deferred.
              if(run)run(id,choice,{deferRender:index<pending.length-1});else this.actBot(id,choice);
              const after=s.engine.decisionWindow?.(s.current);
              if(s.current.move===before||after?.id!==live.id||after.versions?.[id]===live.versions?.[id])break;
            }
            if(!run)this.scheduleBot({delay,onError});
            return;
          }
          if(run){run(actor,current);return;}
          if(r.persistence){this.actBotAsync(actor,current).then(()=>this.scheduleBot({delay,onError})).catch(onError);return;}
          this.actBot(actor,current);this.scheduleBot({delay,onError});
        }catch(error){onError(error);}
      },wait);
    }
    // Host-only entrypoint; never attached to a client capability.
    actBot(actor,action){
      const r=records.get(this),s=r.session;
      if(r.persistence)throw Error('Durable bot actions require a committed async transition');
      if(r.disposed||r.busy||r.paused||!this._botControlled(actor))throw Error('Invalid bot actor');
      const command=P.command(this._status({viewer:actor,role:'player'}),action,uid());
      const receipt=this._dispatch({viewer:actor,closed:false},command,true,{receiptOnly:true});
      if(!receipt.ok)throw Error(receipt.message);
      return s.current;
    }
    dispose(){const r=records.get(this);if(r.gameTimer!==null)r.clock.clearTimeout(r.gameTimer);this.cancelBot();for(const window of r.reactions.values())this._clearWindow(window);r.reactions.clear();r.disposed=true;r.realtime?.close?.();r.activityListeners.clear();for(const b of r.bindings){b.closed=true;b.listeners.clear();b.wireListeners.clear();b.realtimeListeners.clear();}r.bindings.clear();}
  }
  return SessionAuthority;
});
