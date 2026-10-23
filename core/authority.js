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
  let sequence=0;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`authority-${Date.now()}-${++sequence}`;
  const text={REACTION_IGNORED:globalThis.PlayroomMessages.text("ui.authority.5f23a122ff2d"),REACTION_WAIT:globalThis.PlayroomMessages.text("ui.authority.3872543a6282"),PAUSED:globalThis.PlayroomMessages.text("ui.authority.85620a4ad1ea"),BAD_COMMAND:globalThis.PlayroomMessages.text("ui.authority.acdb0b2cb886"),WRONG_SESSION:globalThis.PlayroomMessages.text("ui.authority.a0c9ab47df94"),WRONG_EPOCH:globalThis.PlayroomMessages.text("ui.authority.059dd3ee0afc"),READ_ONLY:globalThis.PlayroomMessages.text("ui.authority.c1945508163a"),STALE:globalThis.PlayroomMessages.text("ui.authority.3071d856a05b"),ILLEGAL:globalThis.PlayroomMessages.text("ui.authority.190d437d1355"),ID_CONFLICT:globalThis.PlayroomMessages.text("ui.authority.a19dbd4bae20"),CLOSED:globalThis.PlayroomMessages.text("ui.authority.b8adaa326e7c"),BUSY:globalThis.PlayroomMessages.text("ui.authority.08135f979c63"),RECEIPT_LIMIT:globalThis.PlayroomMessages.text("ui.authority.a7cd175031c4"),STORAGE_ERROR:globalThis.PlayroomMessages.text("ui.authority.852785addf93"),RECOVERY_REQUIRED:globalThis.PlayroomMessages.text("ui.authority.06ab5f697dcc")};
  function transfers(before,after,events=after.events){
    return events.filter(event=>event.id>(before.events.at(-1)?.id||0)&&event.transfer).map(event=>({...event.transfer,...(event.privateTo!=null?{privateTo:event.privateTo}:{})}));
  }
  class SessionAuthority {
    constructor(session,{sessionId=uid(),authorityEpoch=uid(),clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},receiptLimit=20000,persistence=null,restoredReceipts=[],paused=false,controlRevision=0}={}){
      if(!session?.current||!session.engine?.project)throw Error('Session required');
      if(typeof paused!=='boolean'||!Number.isSafeInteger(controlRevision)||controlRevision<0)throw Error('Invalid restored control');
      const receipts=new Map();
      if(!Array.isArray(restoredReceipts))throw Error('Invalid restored receipts');
      for(const row of restoredReceipts){
        if(!Number.isInteger(row?.viewer)||(row.viewer<0&&!(row.viewer===-1&&row.receipt?.host===true&&row.receipt?.control===true))||row.viewer>=session.current.players.length||
            typeof row.commandId!=='string'||!row.commandId||typeof row.signature!=='string'||
            row.receipt?.commandId!==row.commandId||typeof row.receipt?.ok!=='boolean')
          throw Error('Invalid restored receipt');
        const key=`${row.viewer}:${row.commandId}`;
        if(receipts.has(key))throw Error('Duplicate restored receipt');
        receipts.set(key,{signature:row.signature,receipt:freeze(clone(row.receipt))});
      }
      records.set(this,{session,sessionId,authorityEpoch,clock,receipts,bindings:new Set(),timer:null,busy:false,idleWaiters:[],stopRequested:false,stopPromise:null,disposed:false,receiptLimit:persistence?Infinity:receiptLimit,persistence,paused:!!paused,controlRevision,reactions:new Map(),reactionRevision:0,botOptions:null,connected:new Map()});
    }
    _processor() {
      const r=records.get(this);
      return r.processor ||= new Processor({
        persistence:r.persistence,
        begin:()=>{r.busy=true;},end:()=>this._idle(),
        commit:next=>r.session.commitPrepared(next),
        remember:(actor,id,signature,receipt)=>r.receipts.set(`${actor}:${id}`,{signature,receipt:freeze(receipt)}),
        publish:(before,next)=>{
          this._publish();if(r.persistence)this.scheduleBot();
        },
        reject:(code,command)=>({ok:false,code,message:text[code],commandId:command.commandId,revision:this.revision}),
        fence:()=>{r.disposed=true;}
      });
    }
    get revision(){return records.get(this).session.current.move;}
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
      const binding={...access,listeners:new Set(),closed:false},viewer=binding.viewer;r.bindings.add(binding);
      const requireOpen=()=>{if(binding.closed||r.disposed)throw Error(text.CLOSED);};
      return Object.freeze({
        snapshot:()=>{requireOpen();return this._snapshot(viewer,undefined,binding);},
        history:(index)=>{requireOpen();if(!Number.isSafeInteger(index)||index<0||index>=r.session.states.length)throw Error('Invalid history index');return this._snapshot(viewer,index,binding);},
        presentationReady:message=>this._presentationReady(binding,message),
        dispatch:command=>this._dispatch(binding,command),
        subscribe:listener=>{requireOpen();if(typeof listener!=='function')throw Error('Listener required');binding.listeners.add(listener);return ()=>binding.listeners.delete(listener);},
        close:()=>{binding.closed=true;binding.listeners.clear();r.bindings.delete(binding);}
      });
    }
    _snapshot(viewer,index,binding=null){
      const r=records.get(this),s=r.session,live=index===undefined,state=live?s.current:s.states[index];
      const windows=live?this._syncReactionWindows():[];
      const reactionWindows=windows.map(window=>({...window.descriptor,suspended:window.suspended,protected:window.readyAt===null||this._now()<window.readyAt+window.descriptor.humanMs}));
      const reactionWindow=reactionWindows.find(w=>w.owner===viewer)||reactionWindows[0]||null;
      const role=binding?.role||(viewer<0?'spectator':'player');
      const actor=role==='table'?(live&&binding.actors.includes(state.turn)&&!state.players[state.turn]?.bot?state.turn:-1):viewer;
      const projected=role==='table'&&s.engine.projectTable?s.engine.projectTable(state,actor):s.engine.project(state,viewer),previous=live?s.states.at(-2):s.states[index-1];
      const visible=previous?transfers(previous,state,projected.events).map((draw,i)=>({id:`${state.move}:draw:${i}`,revision:state.move,...draw})):[];
      const effects=visible.filter(draw=>draw.privateTo==null||(Array.isArray(draw.privateTo)?draw.privateTo.includes(viewer):draw.privateTo===viewer)).map(({privateTo,...draw})=>draw);
      // All outer fields are deliberate. options, seed and authority journal are absent.
      const safe={};for(const key of ['version','game','packVersion','packStateVersion','preset','players','turn','status','winner','winners','move','firstPlayer','firstPlayerMode','result','openHands','data','events','modelProjection','scene','timeline'])if(projected[key]!==undefined)safe[key]=projected[key];
      const actions=live&&!r.paused&&actor>=0&&!state.players[actor]?.bot?(role==='table'?projected.tableActions||[]:s.engine.legalActions(state,actor)).filter(action=>this._reactionDecision(actor,action)!=='REACTION_WAIT'):[];
      if(safe.modelProjection)safe.modelProjection={...safe.modelProjection,actions:safe.modelProjection.actions.filter(command=>
        actions.some(action=>Object.keys(command).every(key=>canonical(command[key])===canonical(action[key]))))};
      if(safe.modelProjection)safe.scene=s.engine.get(s.game,s.packVersion).scene(safe.modelProjection,safe.players);
      if(role==='table'){safe.tableActor=actor;safe.tableActions=actions;}
      return freeze(clone({protocolVersion:2,role,...(role==='table'?{actor}:{}),kind:live?'snapshot':'history',sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,revision:state.move,reactionRevision:r.reactionRevision,paused:r.paused,controlRevision:r.controlRevision,game:s.game,packVersion:s.packVersion,viewer,audience:viewer<0?'public':'player',state:safe,actions,independentActions:role==='player'?actions.filter(action=>this._currentReaction(actor,action)):[],events:projected.events,historyLength:s.states.length,cues:s.engine.soundCues(state,viewer,previous?.events.at(-1)?.id||0),effects,reactionWindow,reactionWindows}));
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
        if(!window){window={descriptor,createdAt:this._now(),readyAt:null,suspended:r.connected.get(descriptor.owner)===false,timer:null,openTimer:null};r.reactions.set(descriptor.id,window);r.reactionRevision++;}
        if(!r.paused&&!window.suspended&&window.readyAt===null&&window.timer===null){
          window.timer=r.clock.setTimeout(()=>{window.timer=null;this._setReactionReady(window);},Math.max(0,window.createdAt+descriptor.fallbackMs-this._now()));
        }
      }
      return [...r.reactions.values()];
    }
    _setReactionReady(window){
      const r=records.get(this);if(r.disposed||r.paused||window.suspended||r.reactions.get(window.descriptor.id)!==window)return;
      this._clearWindow(window);window.readyAt=this._now();r.reactionRevision++;
      window.openTimer=r.clock.setTimeout(()=>{window.openTimer=null;if(r.disposed||r.paused||window.suspended||r.reactions.get(window.descriptor.id)!==window)return;r.reactionRevision++;this._publish();},window.descriptor.humanMs);
      this._publish();if(r.botOptions)this.scheduleBot(r.botOptions);
    }
    _presentationReady(binding,message){
      const r=records.get(this),window=this._syncReactionWindows().find(w=>w.descriptor.id===message?.windowId);
      if(binding.closed||r.disposed)return {ok:false,code:'CLOSED'};
      if(!P.validatePresentationReady(message))return {ok:false,code:'BAD_COMMAND'};
      if(message.sessionId!==r.sessionId)return {ok:false,code:'WRONG_SESSION'};
      if(message.authorityEpoch!==r.authorityEpoch)return {ok:false,code:'WRONG_EPOCH'};
      if(r.paused||window?.suspended||message.controlRevision!==r.controlRevision||!window||binding.viewer!==window.descriptor.owner||r.session.current.players[binding.viewer]?.bot||message.windowId!==window.descriptor.id||message.revision!==window.descriptor.revision)return {ok:false,code:'REACTION_IGNORED',ignored:true};
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
      for(const window of windows){this._clearWindow(window);window.suspended=!connected;window.readyAt=null;window.createdAt=this._now();r.reactionRevision++;}
      this._publish();if(connected&&r.botOptions)this.scheduleBot(r.botOptions);
    }
    _reactionDecision(actor,action){
      const r=records.get(this),control=r.session.engine.reactionControl?.(r.session.current,actor,action);
      if(control?.ignore)return 'REACTION_IGNORED';
      if(control?.episode!==undefined&&action.episode!==control.episode)return 'BAD_COMMAND';
      if(!control||!['challenge','advance'].includes(control.kind))return null;
      const windows=this._syncReactionWindows().filter(w=>control.kind==='advance'||control.target===undefined||w.descriptor.owner===control.target);
      for(const window of windows){
        const delay=r.session.current.players[actor]?.bot?window.descriptor.botMs:window.descriptor.humanMs;
        if(window.readyAt===null||this._now()<window.readyAt+delay)return control.kind==='challenge'?'REACTION_IGNORED':'REACTION_WAIT';
      }
      return null;
    }
    _currentReaction(actor,action){
      const r=records.get(this),control=r.session.engine.reactionControl?.(r.session.current,actor,action);
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
    _dispatch(binding,command,internalBot=false){
      const r=records.get(this),s=r.session;
      const snapshot=()=>this._snapshot(binding.viewer,undefined,binding);
      const reject=code=>freeze({ok:false,code,message:text[code],commandId:typeof command?.commandId==='string'?command.commandId:null,
        revision:this.revision,...(!binding.closed&&!r.disposed?{snapshot:snapshot()}:{})});
      if(binding.closed||r.disposed)return reject('CLOSED');
      if(!P.validate(command))return reject('BAD_COMMAND');
      if(command.sessionId!==r.sessionId)return reject('WRONG_SESSION');
      // A restored durable authority may replay an existing receipt across epochs.
      if(!r.persistence&&command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      const access=this._commandActor(binding,command,internalBot);
      if(access.code)return reject(access.code);
      const actor=access.actor,key=`${actor}:${command.commandId}`,signature=canonical(command),cached=r.receipts.get(key);
      if(cached)return cached.signature===signature?freeze({...cached.receipt,duplicate:true,snapshot:snapshot()}):reject('ID_CONFLICT');
      if(command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      if(r.stopRequested)return reject('PAUSED');
      if(r.busy)return reject('BUSY');
      if(command.action.type==='session-pause')return this._pause(binding,command,signature,key,reject);
      if(r.paused)return reject('PAUSED');
      if(r.receipts.size>=r.receiptLimit)return reject('RECEIPT_LIMIT');
      const decision=this._reactionDecision(actor,command.action);
      const rejection=decision?{...reject(decision),...(decision==='REACTION_IGNORED'?{ignored:true}:{})}:
        command.expectedRevision!==this.revision&&!this._currentReaction(actor,command.action)?reject('STALE'):null;
      const result=this._processor().execute({sessionId:r.sessionId,actor,command,signature,before:s.current,rejection,
        prepare:()=>s.prepare(actor,this._actionFor(binding,actor,command.action))});
      const reply=receipt=>freeze({...receipt,...(!r.disposed?{snapshot:snapshot()}:{})});
      return result&&typeof result.then==='function'?result.then(reply):reply(result);
    }
    async _pause(binding,command,signature,key,reject){
      const r=records.get(this);
      if(r.session.current.players[binding.viewer]?.bot)return reject('READ_ONLY');
      if(typeof command.action.paused!=='boolean')return reject('BAD_COMMAND');
      if(command.expectedRevision!==this.revision||command.action.expectedControlRevision!==r.controlRevision)return reject('STALE');
      r.busy=true;
      try{
        const controlRevision=r.controlRevision+(r.paused===command.action.paused?0:1);
        const receipt={ok:true,code:'OK',control:true,commandId:command.commandId,revision:this.revision,controlRevision,...(binding.host?{host:true}:{})};
        if(r.persistence)await r.persistence.setControl({sessionId:r.sessionId,previousControlRevision:r.controlRevision,paused:command.action.paused,controlRevision,viewer:binding.viewer,commandId:command.commandId,signature,receipt});
        r.paused=command.action.paused;r.controlRevision=controlRevision;
        for(const window of r.reactions.values()){this._clearWindow(window);window.readyAt=null;window.createdAt=this._now();r.reactionRevision++;}
        r.receipts.set(key,{signature,receipt:freeze(receipt)});
        this.cancelBot();this._publish();
        return freeze({...receipt,snapshot:this._snapshot(binding.viewer,undefined,binding)});
      }catch(_){return reject('STORAGE_ERROR');}finally{this._idle();if(!r.paused&&r.persistence)this.scheduleBot();}
    }
    _idle(){const r=records.get(this);r.busy=false;for(const resolve of r.idleWaiters.splice(0))resolve();}
    stopForLobby(){
      const r=records.get(this);if(r.stopPromise)return r.stopPromise;
      if(r.disposed)return Promise.reject(Error(globalThis.PlayroomMessages.text("ui.authority.b8adaa326e7c")));
      r.stopRequested=true;const bots=r.botOptions;this.cancelBot();
      r.stopPromise=(async()=>{
        try{
          if(r.busy)await new Promise(resolve=>r.idleWaiters.push(resolve));
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
      if(r.disposed||r.busy||r.paused||!r.session.current.players[actor]?.bot)throw Error('Invalid bot actor');
      const receipt=await this._dispatch({viewer:actor,closed:false},P.command(this._snapshot(actor),action,uid()),true);
      if(!receipt.ok)throw Error(receipt.message);return r.session.current;
    }
    _publish(){
      const r=records.get(this);
      for(const binding of [...r.bindings])if(!binding.closed){let snapshot;try{snapshot=this._snapshot(binding.viewer,undefined,binding);}catch(_){continue;}for(const listener of [...binding.listeners]){try{listener(snapshot);}catch(_){/* View failure cannot roll back a committed move. */}}}
    }
    cancelBot(){const r=records.get(this);r.botOptions=null;if(r.timer!==null){r.clock.clearTimeout(r.timer);r.timer=null;}}
    scheduleBot({delay=500,run,onError=()=>{}}={}){
      this.cancelBot();const r=records.get(this),s=r.session,st=s.current;r.botOptions={delay,run,onError};if(r.disposed||r.stopRequested||r.paused||st.status!=='playing')return;
      const reacting=st.players.findIndex((p,i)=>p.bot&&s.engine.botReaction?.(st,i)),window=s.engine.decisionWindow?.(st),planning=window?.participants.find(i=>st.players[i].bot&&!window.ready.includes(i)),actor=reacting>=0?reacting:planning??st.turn;if(!st.players[actor]?.bot)return;
      const action=s.engine.botReaction?.(st,actor)||s.engine.botAction(st,actor);if(!action)return;
      const control=s.engine.reactionControl?.(st,actor,action),windows=this._syncReactionWindows().filter(w=>control?.target===undefined||w.descriptor.owner===control.target);
      if(windows.some(w=>w.suspended)&&['challenge','advance'].includes(control?.kind))return;
      let wait=planning!==undefined&&actor===planning?0:Math.max(0,delay);
      if(['challenge','advance'].includes(control?.kind))for(const window of windows)wait=Math.max(wait,(window.readyAt??window.createdAt+window.descriptor.fallbackMs)+window.descriptor.botMs-this._now());
      const revision=st.move;r.timer=r.clock.setTimeout(()=>{r.timer=null;if(r.disposed||r.paused||s.current.move!==revision)return;
        try{const current=s.engine.botReaction?.(s.current,actor)||s.engine.botAction(s.current,actor);if(!current)return;
          if(this._reactionDecision(actor,current)){this.scheduleBot({delay,run,onError});return;}
          if(!r.persistence&&planning!==undefined&&actor===planning&&window.participants.length>1){
            // Drain only this simultaneous decision window, never the following round.
            const pending=window.participants.filter(i=>st.players[i].bot&&!window.ready.includes(i));
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
      if(r.disposed||r.busy||r.paused||!s.current.players[actor]?.bot)throw Error('Invalid bot actor');
      const command=P.command(this._snapshot(actor),action,uid());
      const receipt=this._dispatch({viewer:actor,closed:false},command,true);
      if(!receipt.ok)throw Error(receipt.message);
      return s.current;
    }
    dispose(){const r=records.get(this);this.cancelBot();for(const window of r.reactions.values())this._clearWindow(window);r.reactions.clear();r.disposed=true;for(const b of r.bindings){b.closed=true;b.listeners.clear();}r.bindings.clear();}
  }
  SessionAuthority.transfers=transfers;
  return SessionAuthority;
});
