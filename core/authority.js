(function(root,factory){const P=root.PlayroomProtocol||(typeof require==='function'?require('./protocol.js'):null),api=factory(P);if(typeof module==='object'&&module.exports)module.exports=api;root.SessionAuthority=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const records=new WeakMap();
  const {clone,freeze,canonical}=P;
  let sequence=0;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`authority-${Date.now()}-${++sequence}`;
  const text={REACTION_IGNORED:'Реакция уже обработана или пока недоступна.',REACTION_WAIT:'Дайте игроку завершить объявление.',PAUSED:'Партия на паузе.',BAD_COMMAND:'Некорректная команда.',WRONG_SESSION:'Эта команда относится к другой партии.',WRONG_EPOCH:'Исполнитель перезапущен. Откройте актуальную ссылку.',READ_ONLY:'Общий стол доступен только для просмотра.',STALE:'Состояние изменилось. Повторите выбор.',ILLEGAL:'Этот ход сейчас недоступен.',ID_CONFLICT:'Этот идентификатор уже использован другой командой.',CLOSED:'Подключение закрыто.',BUSY:'Исполнитель завершает предыдущее действие.',RECEIPT_LIMIT:'Достигнут лимит команд этой тестовой партии.',STORAGE_ERROR:'Не удалось сохранить ход. Проверьте свободное место и доступность хранилища; действие не выполнено.',RECOVERY_REQUIRED:'Ход записан в хранилище, но интерфейс исполнителя не удалось обновить. Перезагрузите страницу хоста и восстановите комнату из сетевого сохранения.'};
  function transfers(before,after){
    if(!before.data.hands||!after.data.hands)return [];
    const owners=new Map(),table=new Set(),groups=new Map();
    before.data.hands.forEach((h,p)=>h.forEach(c=>owners.set(c.id,p)));
    const visit=v=>{if(v&&typeof v==='object'){if(v.id)table.add(v.id);else Object.values(v).forEach(visit);}};visit(before.data.table);
    after.data.hands.forEach((h,p)=>h.forEach(c=>{const prev=owners.get(c.id);if(prev===p)return;const from=prev!==undefined?'hand':table.has(c.id)?'table':'stock',key=`${p}:${from}:${prev??''}`;if(!groups.has(key))groups.set(key,{player:p,count:0,from,...(prev!==undefined?{fromPlayer:prev}:{})});groups.get(key).count++;}));
    return [...groups.values()];
  }
  class SessionAuthority {
    constructor(session,{sessionId=uid(),authorityEpoch=uid(),clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},receiptLimit=20000,persistence=null,restoredReceipts=[],paused=false,controlRevision=0}={}){
      if(!session?.current||!session.engine?.project)throw Error('Session required');
      if(typeof paused!=='boolean'||!Number.isSafeInteger(controlRevision)||controlRevision<0)throw Error('Invalid restored control');
      const receipts=new Map();
      if(!Array.isArray(restoredReceipts))throw Error('Invalid restored receipts');
      for(const row of restoredReceipts){
        if(!Number.isInteger(row?.viewer)||row.viewer<0||row.viewer>=session.current.players.length||
            typeof row.commandId!=='string'||!row.commandId||typeof row.signature!=='string'||
            row.receipt?.commandId!==row.commandId||typeof row.receipt?.ok!=='boolean')
          throw Error('Invalid restored receipt');
        const key=`${row.viewer}:${row.commandId}`;
        if(receipts.has(key))throw Error('Duplicate restored receipt');
        receipts.set(key,{signature:row.signature,receipt:freeze(clone(row.receipt))});
      }
      records.set(this,{session,sessionId,authorityEpoch,clock,receipts,bindings:new Set(),timer:null,busy:false,disposed:false,receiptLimit:persistence?Infinity:receiptLimit,persistence,effects:[],paused:!!paused,controlRevision,reaction:null,reactionTimer:null,reactionOpenTimer:null,reactionRevision:0,botOptions:null,connected:new Map()});
    }
    get revision(){return records.get(this).session.current.move;}
    connect(viewer=-1){
      const r=records.get(this);
      if(r.disposed||!Number.isInteger(viewer)||viewer < -1||viewer>=r.session.current.players.length)throw Error('Invalid audience');
      const binding={viewer,listeners:new Set(),closed:false};r.bindings.add(binding);
      const requireOpen=()=>{if(binding.closed||r.disposed)throw Error(text.CLOSED);};
      return Object.freeze({
        snapshot:()=>{requireOpen();return this._snapshot(viewer);},
        history:(index)=>{requireOpen();if(!Number.isSafeInteger(index)||index<0||index>=r.session.states.length)throw Error('Invalid history index');return this._snapshot(viewer,index);},
        presentationReady:message=>this._presentationReady(binding,message),
        dispatch:command=>r.persistence?this._dispatchDurable(binding,command):this._dispatch(binding,command),
        subscribe:listener=>{requireOpen();if(typeof listener!=='function')throw Error('Listener required');binding.listeners.add(listener);return ()=>binding.listeners.delete(listener);},
        close:()=>{binding.closed=true;binding.listeners.clear();r.bindings.delete(binding);}
      });
    }
    _snapshot(viewer,index){
      const r=records.get(this),s=r.session,live=index===undefined,state=live?s.current:s.states[index];
      const window=live?this._syncReactionWindow():null;
      const reactionWindow=window?{...window.descriptor,suspended:window.suspended,protected:window.readyAt===null||this._now()<window.readyAt+window.descriptor.humanMs}:null;
      const projected=s.engine.project(state,viewer),previous=live?null:s.states[index-1];
      const effects=live?r.effects:previous?transfers(previous,state).map((draw,i)=>({id:`${state.move}:draw:${i}`,revision:state.move,...draw})):[];
      // All outer fields are deliberate. options, seed and authority journal are absent.
      const safe={};for(const key of ['version','game','packVersion','packStateVersion','preset','players','turn','status','winner','move','openHands','data','events'])if(projected[key]!==undefined)safe[key]=projected[key];
      return freeze(clone({protocolVersion:1,kind:live?'snapshot':'history',sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,revision:state.move,reactionRevision:r.reactionRevision,paused:r.paused,controlRevision:r.controlRevision,game:s.game,packVersion:s.packVersion,viewer,audience:viewer<0?'public':'player',state:safe,actions:live&&!r.paused&&viewer>=0&&!state.players[viewer]?.bot?s.engine.legalActions(state,viewer).filter(action=>this._reactionDecision(viewer,action)!=='REACTION_WAIT'):[],events:projected.events,historyLength:s.states.length,cues:s.engine.soundCues(state,viewer,previous?.events.at(-1)?.id||0),effects,reactionWindow}));
    }
    _now(){const clock=records.get(this).clock;return typeof clock.now==='function'?clock.now():(globalThis.performance?.now?.()??Date.now());}
    _syncReactionWindow(){
      const r=records.get(this),descriptor=r.session.engine.reactionWindow?.(r.session.current)||null;
      if(!descriptor){if(r.reactionTimer!==null)r.clock.clearTimeout(r.reactionTimer);if(r.reactionOpenTimer!==null)r.clock.clearTimeout(r.reactionOpenTimer);if(r.reaction)r.reactionRevision++;r.reactionTimer=null;r.reactionOpenTimer=null;r.reaction=null;return null;}
      if(!r.reaction||r.reaction.descriptor.id!==descriptor.id){
        if(r.reactionTimer!==null)r.clock.clearTimeout(r.reactionTimer);if(r.reactionOpenTimer!==null)r.clock.clearTimeout(r.reactionOpenTimer);r.reactionOpenTimer=null;r.reactionRevision++;
        r.reaction={descriptor,createdAt:this._now(),readyAt:null,suspended:r.connected.get(descriptor.owner)===false};r.reactionTimer=null;
      }
      if(!r.paused&&!r.reaction.suspended&&r.reaction.readyAt===null&&r.reactionTimer===null){
        const current=r.reaction,remaining=Math.max(0,current.createdAt+descriptor.fallbackMs-this._now());
        r.reactionTimer=r.clock.setTimeout(()=>{r.reactionTimer=null;if(r.disposed||r.paused||r.reaction!==current)return;this._setReactionReady(current);},remaining);
      }
      return r.reaction;
    }
    _setReactionReady(window){
      const r=records.get(this);if(r.disposed||r.paused||window.suspended||r.reaction!==window)return;
      if(r.reactionTimer!==null)r.clock.clearTimeout(r.reactionTimer);r.reactionTimer=null;
      if(r.reactionOpenTimer!==null)r.clock.clearTimeout(r.reactionOpenTimer);
      window.readyAt=this._now();r.reactionRevision++;
      r.reactionOpenTimer=r.clock.setTimeout(()=>{r.reactionOpenTimer=null;if(r.disposed||r.paused||window.suspended||r.reaction!==window)return;r.reactionRevision++;this._publish();},window.descriptor.humanMs);
      this._publish();if(r.botOptions)this.scheduleBot(r.botOptions);
    }
    _presentationReady(binding,message){
      const r=records.get(this),window=this._syncReactionWindow();
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
      const window=this._syncReactionWindow();if(!window||window.descriptor.owner!==viewer)return;
      if(r.reactionTimer!==null)r.clock.clearTimeout(r.reactionTimer);r.reactionTimer=null;
      if(r.reactionOpenTimer!==null)r.clock.clearTimeout(r.reactionOpenTimer);r.reactionOpenTimer=null;
      if(r.timer!==null)r.clock.clearTimeout(r.timer);r.timer=null;
      window.suspended=!connected;window.readyAt=null;window.createdAt=this._now();r.reactionRevision++;
      this._publish();if(connected&&r.botOptions)this.scheduleBot(r.botOptions);
    }
    _reactionDecision(actor,action){
      const r=records.get(this),control=r.session.engine.reactionControl?.(r.session.current,actor,action);
      if(control?.ignore)return 'REACTION_IGNORED';
      if(control?.episode!==undefined&&action.episode!==control.episode)return 'BAD_COMMAND';
      const window=this._syncReactionWindow();
      if(!window||!control||!['challenge','advance'].includes(control.kind))return null;
      const delay=r.session.current.players[actor]?.bot?window.descriptor.botMs:window.descriptor.humanMs;
      if(window.readyAt===null||this._now()<window.readyAt+delay)return control.kind==='challenge'?'REACTION_IGNORED':'REACTION_WAIT';
      return null;
    }
    _dispatch(binding,command){
      const r=records.get(this),s=r.session;
      const reject=code=>freeze({ok:false,code,message:text[code],commandId:typeof command?.commandId==='string'?command.commandId:null,revision:this.revision,...(!binding.closed&&!r.disposed?{snapshot:this._snapshot(binding.viewer)}:{})});
      if(binding.closed||r.disposed)return reject('CLOSED');
      if(!P.validate(command))return reject('BAD_COMMAND');
      if(command.sessionId!==r.sessionId)return reject('WRONG_SESSION');
      if(command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      if(binding.viewer<0||s.current.players[binding.viewer]?.bot)return reject('READ_ONLY');
      const key=`${binding.viewer}:${command.commandId}`,signature=canonical(command),cached=r.receipts.get(key);
      // Check identity BEFORE revision: retry after a lost ack must return its receipt.
      if(cached)return cached.signature===signature?freeze({...cached.receipt,duplicate:true,snapshot:this._snapshot(binding.viewer)}):reject('ID_CONFLICT');
      if(r.busy)return reject('BUSY');
      if(command.action.type==='session-pause')return this._pause(binding,command,signature,key,reject);
      if(r.paused)return reject('PAUSED');
      if(r.receipts.size>=r.receiptLimit)return reject('RECEIPT_LIMIT');
      let receipt;
      const decision=this._reactionDecision(binding.viewer,command.action);
      if(decision)receipt={...reject(decision),...(decision==='REACTION_IGNORED'?{ignored:true}:{})};
      else if(command.expectedRevision!==this.revision)receipt=reject('STALE');
      else {
        r.busy=true;
        try{s.act(binding.viewer,command.action);r.effects=transfers(s.states.at(-2),s.current).map((draw,i)=>({id:`${this.revision}:draw:${i}`,revision:this.revision,...draw}));receipt={ok:true,code:'OK',commandId:command.commandId,revision:this.revision};}
        catch(_){receipt=reject('ILLEGAL');}
        // A rejected command also has a stable receipt; do not store a stale snapshot.
        const {snapshot,...result}=receipt;r.receipts.set(key,{signature,receipt:freeze(result)});
        try{if(receipt.ok)this._publish();}finally{r.busy=false;}
        return freeze({...receipt,snapshot:this._snapshot(binding.viewer)});
      }
      const {snapshot,...result}=receipt;r.receipts.set(key,{signature,receipt:freeze(result)});return receipt;
    }
    // Network-only path: stage the transition, wait for atomic journal + receipt
    // commit, and only then change the live Session or publish a snapshot.
    async _dispatchDurable(binding,command,internalBot=false){
      const r=records.get(this),s=r.session;
      const reject=code=>freeze({ok:false,code,message:text[code],commandId:typeof command?.commandId==='string'?command.commandId:null,
        revision:this.revision,...(!binding.closed&&!r.disposed?{snapshot:this._snapshot(binding.viewer)}:{})});
      if(binding.closed||r.disposed)return reject('CLOSED');
      if(!P.validate(command))return reject('BAD_COMMAND');
      if(command.sessionId!==r.sessionId)return reject('WRONG_SESSION');
      if(binding.viewer<0||(!internalBot&&s.current.players[binding.viewer]?.bot))return reject('READ_ONLY');
      const key=`${binding.viewer}:${command.commandId}`,signature=canonical(command),cached=r.receipts.get(key);
      // An old epoch may only resolve an already-committed command. It must
      // never authorize a NEW action after restoring the host.
      if(cached)return cached.signature===signature?freeze({...cached.receipt,duplicate:true,snapshot:this._snapshot(binding.viewer)}):reject('ID_CONFLICT');
      if(command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      if(r.busy)return reject('BUSY');
      if(command.action.type==='session-pause')return this._pause(binding,command,signature,key,reject);
      if(r.paused)return reject('PAUSED');
      r.busy=true;
      let committed=false;
      try{
        let receipt,next;
        const decision=this._reactionDecision(binding.viewer,command.action);
        if(decision)receipt={...reject(decision),...(decision==='REACTION_IGNORED'?{ignored:true}:{})};
        else if(command.expectedRevision!==this.revision)receipt=reject('STALE');
        else {
          try{next=s.prepare(binding.viewer,command.action);}catch(_){receipt=reject('ILLEGAL');}
        }
        if(next){
          const before=s.current,revision=before.move;
          receipt={ok:true,code:'OK',commandId:command.commandId,revision:next.move};
          await r.persistence.commit({sessionId:r.sessionId,previousRevision:revision,nextState:next,
            viewer:binding.viewer,commandId:command.commandId,signature,receipt});
          committed=true;
          s.commitPrepared(next);
          r.effects=transfers(before,s.current).map((draw,i)=>({id:`${this.revision}:draw:${i}`,revision:this.revision,...draw}));
        }else{
          const {snapshot,...result}=receipt;
          await r.persistence.recordReceipt({sessionId:r.sessionId,viewer:binding.viewer,commandId:command.commandId,signature,receipt:result});
        }
        const {snapshot,...result}=receipt;
        r.receipts.set(key,{signature,receipt:freeze(result)});
        if(receipt.ok){this._publish();this.scheduleBot();}
        return freeze({...result,snapshot:this._snapshot(binding.viewer)});
      }catch(_){
        if(committed){
          // The journal already contains the step: never claim it was rolled
          // back. Fence this authority until host recovery reloads the disk.
          r.disposed=true;
          return freeze({ok:false,code:'RECOVERY_REQUIRED',message:text.RECOVERY_REQUIRED,
            commandId:command.commandId,revision:this.revision});
        }
        return reject('STORAGE_ERROR');
      }
      finally{r.busy=false;}
    }
    async _pause(binding,command,signature,key,reject){
      const r=records.get(this);
      if(r.session.current.players[binding.viewer]?.bot)return reject('READ_ONLY');
      if(typeof command.action.paused!=='boolean')return reject('BAD_COMMAND');
      if(command.expectedRevision!==this.revision||command.action.expectedControlRevision!==r.controlRevision)return reject('STALE');
      r.busy=true;
      try{
        const controlRevision=r.controlRevision+(r.paused===command.action.paused?0:1);
        const receipt={ok:true,code:'OK',control:true,commandId:command.commandId,revision:this.revision,controlRevision};
        if(r.persistence)await r.persistence.setControl({sessionId:r.sessionId,previousControlRevision:r.controlRevision,paused:command.action.paused,controlRevision,viewer:binding.viewer,commandId:command.commandId,signature,receipt});
        r.paused=command.action.paused;r.controlRevision=controlRevision;
        if(r.reaction){if(r.reactionTimer!==null)r.clock.clearTimeout(r.reactionTimer);if(r.reactionOpenTimer!==null)r.clock.clearTimeout(r.reactionOpenTimer);r.reactionTimer=null;r.reactionOpenTimer=null;r.reaction.readyAt=null;r.reaction.createdAt=this._now();r.reactionRevision++;}
        r.receipts.set(key,{signature,receipt:freeze(receipt)});
        this.cancelBot();this._publish();
        return freeze({...receipt,snapshot:this._snapshot(binding.viewer)});
      }catch(_){return reject('STORAGE_ERROR');}finally{r.busy=false;if(!r.paused&&r.persistence)this.scheduleBot();}
    }
    async actBotAsync(actor,action){
      const r=records.get(this);
      if(r.disposed||r.busy||r.paused||!r.session.current.players[actor]?.bot)throw Error('Invalid bot actor');
      const receipt=await this._dispatchDurable({viewer:actor,closed:false},P.command(this._snapshot(actor),action,uid()),true);
      if(!receipt.ok)throw Error(receipt.message);return r.session.current;
    }
    _publish(){
      const r=records.get(this);
      for(const binding of [...r.bindings])if(!binding.closed){let snapshot;try{snapshot=this._snapshot(binding.viewer);}catch(_){continue;}for(const listener of [...binding.listeners]){try{listener(snapshot);}catch(_){/* View failure cannot roll back a committed move. */}}}
    }
    cancelBot(){const r=records.get(this);r.botOptions=null;if(r.timer!==null){r.clock.clearTimeout(r.timer);r.timer=null;}}
    scheduleBot({delay=500,run,onError=()=>{}}={}){
      this.cancelBot();const r=records.get(this),s=r.session,st=s.current;r.botOptions={delay,run,onError};if(r.disposed||r.paused||st.status!=='playing')return;
      const reacting=st.players.findIndex((p,i)=>p.bot&&s.engine.botReaction?.(st,i)),actor=reacting>=0?reacting:st.turn;if(!st.players[actor]?.bot)return;
      const action=s.engine.botReaction?.(st,actor)||s.engine.botAction(st,actor);if(!action)return;
      const window=this._syncReactionWindow(),control=s.engine.reactionControl?.(st,actor,action);
      if(window?.suspended&&['challenge','advance'].includes(control?.kind))return;
      let wait=Math.max(0,delay);
      if(window&&['challenge','advance'].includes(control?.kind))wait=Math.max(wait,(window.readyAt??window.createdAt+window.descriptor.fallbackMs)+window.descriptor.botMs-this._now());
      const revision=st.move;r.timer=r.clock.setTimeout(()=>{r.timer=null;if(r.disposed||r.paused||s.current.move!==revision)return;
        try{const current=s.engine.botReaction?.(s.current,actor)||s.engine.botAction(s.current,actor);if(!current)return;
          if(this._reactionDecision(actor,current)){this.scheduleBot({delay,run,onError});return;}
          if(run){run(actor,current);return;}
          if(r.persistence){this.actBotAsync(actor,current).then(()=>this.scheduleBot({delay,onError})).catch(onError);return;}
          this.actBot(actor,current);this.scheduleBot({delay,onError});
        }catch(error){onError(error);}
      },wait);
    }
    // Host-only entrypoint; never attached to a client capability.
    actBot(actor,action){const r=records.get(this),s=r.session;if(r.persistence)throw Error('Durable bot actions require a committed async transition');if(r.disposed||r.busy||r.paused||!s.current.players[actor]?.bot)throw Error('Invalid bot actor');const decision=this._reactionDecision(actor,action);if(decision)throw Error(text[decision]);const before=s.current;r.busy=true;try{s.act(actor,action);r.effects=transfers(before,s.current).map((draw,i)=>({id:`${this.revision}:draw:${i}`,revision:this.revision,...draw}));this._publish();}finally{r.busy=false;}return s.current;}
    dispose(){const r=records.get(this);this.cancelBot();if(r.reactionTimer!==null)r.clock.clearTimeout(r.reactionTimer);if(r.reactionOpenTimer!==null)r.clock.clearTimeout(r.reactionOpenTimer);r.reactionTimer=null;r.reactionOpenTimer=null;r.disposed=true;for(const b of r.bindings){b.closed=true;b.listeners.clear();}r.bindings.clear();}
  }
  SessionAuthority.transfers=transfers;
  return SessionAuthority;
});
