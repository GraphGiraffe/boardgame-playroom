(function(root,factory){const P=root.PlayroomProtocol||(typeof require==='function'?require('./protocol.js'):null),api=factory(P);if(typeof module==='object'&&module.exports)module.exports=api;root.SessionAuthority=api;})(typeof globalThis!=='undefined'?globalThis:this,function(P){
  'use strict';
  const records=new WeakMap();
  const {clone,freeze,canonical}=P;
  let sequence=0;
  const uid=()=>globalThis.crypto?.randomUUID?.()||`authority-${Date.now()}-${++sequence}`;
  const text={BAD_COMMAND:'Некорректная команда.',WRONG_SESSION:'Эта команда относится к другой партии.',WRONG_EPOCH:'Исполнитель перезапущен. Откройте актуальную ссылку.',READ_ONLY:'Общий стол доступен только для просмотра.',STALE:'Состояние изменилось. Повторите выбор.',ILLEGAL:'Этот ход сейчас недоступен.',ID_CONFLICT:'Этот идентификатор уже использован другой командой.',CLOSED:'Подключение закрыто.',BUSY:'Исполнитель завершает предыдущее действие.',RECEIPT_LIMIT:'Достигнут лимит команд этой тестовой партии.',STORAGE_ERROR:'Не удалось сохранить ход. Проверьте свободное место и доступность хранилища; действие не выполнено.'};
  function transfers(before,after){
    if(!before.data.hands||!after.data.hands)return [];
    const owners=new Map(),table=new Set(),groups=new Map();
    before.data.hands.forEach((h,p)=>h.forEach(c=>owners.set(c.id,p)));
    const visit=v=>{if(v&&typeof v==='object'){if(v.id)table.add(v.id);else Object.values(v).forEach(visit);}};visit(before.data.table);
    after.data.hands.forEach((h,p)=>h.forEach(c=>{const prev=owners.get(c.id);if(prev===p)return;const from=prev!==undefined?'hand':table.has(c.id)?'table':'stock',key=`${p}:${from}:${prev??''}`;if(!groups.has(key))groups.set(key,{player:p,count:0,from,...(prev!==undefined?{fromPlayer:prev}:{})});groups.get(key).count++;}));
    return [...groups.values()];
  }
  class SessionAuthority {
    constructor(session,{sessionId=uid(),authorityEpoch=uid(),clock={setTimeout:(fn,ms)=>setTimeout(fn,ms),clearTimeout:id=>clearTimeout(id)},receiptLimit=20000,persistence=null}={}){
      if(!session?.current||!session.engine?.project)throw Error('Session required');
      records.set(this,{session,sessionId,authorityEpoch,clock,receipts:new Map(),bindings:new Set(),timer:null,busy:false,disposed:false,receiptLimit:persistence?Infinity:receiptLimit,persistence,effects:[]});
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
        dispatch:command=>r.persistence?this._dispatchDurable(binding,command):this._dispatch(binding,command),
        subscribe:listener=>{requireOpen();if(typeof listener!=='function')throw Error('Listener required');binding.listeners.add(listener);return ()=>binding.listeners.delete(listener);},
        close:()=>{binding.closed=true;binding.listeners.clear();r.bindings.delete(binding);}
      });
    }
    _snapshot(viewer,index){
      const r=records.get(this),s=r.session,live=index===undefined,state=live?s.current:s.states[index];
      const projected=s.engine.project(state,viewer);
      // All outer fields are deliberate. options, seed and authority journal are absent.
      const safe={};for(const key of ['version','game','packVersion','packStateVersion','preset','players','turn','status','winner','move','openHands','data','events'])if(projected[key]!==undefined)safe[key]=projected[key];
      return freeze(clone({protocolVersion:1,kind:live?'snapshot':'history',sessionId:r.sessionId,authorityEpoch:r.authorityEpoch,revision:state.move,game:s.game,packVersion:s.packVersion,viewer,audience:viewer<0?'public':'player',state:safe,actions:live&&viewer>=0&&!state.players[viewer]?.bot?s.engine.legalActions(state,viewer):[],events:projected.events,historyLength:s.states.length,cues:live?s.engine.soundCues(state,viewer):[],effects:live?r.effects:[]}));
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
      if(r.receipts.size>=r.receiptLimit)return reject('RECEIPT_LIMIT');
      let receipt;
      if(command.expectedRevision!==this.revision)receipt=reject('STALE');
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
    async _dispatchDurable(binding,command){
      const r=records.get(this),s=r.session;
      const reject=code=>freeze({ok:false,code,message:text[code],commandId:typeof command?.commandId==='string'?command.commandId:null,
        revision:this.revision,...(!binding.closed&&!r.disposed?{snapshot:this._snapshot(binding.viewer)}:{})});
      if(binding.closed||r.disposed)return reject('CLOSED');
      if(!P.validate(command))return reject('BAD_COMMAND');
      if(command.sessionId!==r.sessionId)return reject('WRONG_SESSION');
      if(command.authorityEpoch!==r.authorityEpoch)return reject('WRONG_EPOCH');
      if(binding.viewer<0||s.current.players[binding.viewer]?.bot)return reject('READ_ONLY');
      const key=`${binding.viewer}:${command.commandId}`,signature=canonical(command),cached=r.receipts.get(key);
      if(cached)return cached.signature===signature?freeze({...cached.receipt,duplicate:true,snapshot:this._snapshot(binding.viewer)}):reject('ID_CONFLICT');
      if(r.busy)return reject('BUSY');
      r.busy=true;
      try{
        let receipt,next;
        if(command.expectedRevision!==this.revision)receipt=reject('STALE');
        else {
          try{next=s.prepare(binding.viewer,command.action);}catch(_){receipt=reject('ILLEGAL');}
        }
        if(next){
          const before=s.current,revision=before.move;
          receipt={ok:true,code:'OK',commandId:command.commandId,revision:next.move};
          await r.persistence.commit({sessionId:r.sessionId,previousRevision:revision,nextState:next,
            viewer:binding.viewer,commandId:command.commandId,signature,receipt});
          s.commitPrepared(next);
          r.effects=transfers(before,s.current).map((draw,i)=>({id:`${this.revision}:draw:${i}`,revision:this.revision,...draw}));
        }else{
          const {snapshot,...result}=receipt;
          await r.persistence.recordReceipt({sessionId:r.sessionId,viewer:binding.viewer,commandId:command.commandId,signature,receipt:result});
        }
        const {snapshot,...result}=receipt;
        r.receipts.set(key,{signature,receipt:freeze(result)});
        if(receipt.ok)this._publish();
        return freeze({...result,snapshot:this._snapshot(binding.viewer)});
      }catch(_){return reject('STORAGE_ERROR');}
      finally{r.busy=false;}
    }
    _publish(){
      const r=records.get(this);
      for(const binding of [...r.bindings])if(!binding.closed){let snapshot;try{snapshot=this._snapshot(binding.viewer);}catch(_){continue;}for(const listener of [...binding.listeners]){try{listener(snapshot);}catch(_){/* View failure cannot roll back a committed move. */}}}
    }
    cancelBot(){const r=records.get(this);if(r.timer!==null){r.clock.clearTimeout(r.timer);r.timer=null;}}
    scheduleBot({delay=500,run,onError=()=>{}}={}){
      this.cancelBot();const r=records.get(this),s=r.session,st=s.current;if(r.disposed||st.status!=='playing')return;
      const reacting=st.players.findIndex((p,i)=>p.bot&&s.engine.botReaction?.(st,i)),actor=reacting>=0?reacting:st.turn;if(!st.players[actor]?.bot)return;
      const revision=st.move;r.timer=r.clock.setTimeout(()=>{r.timer=null;if(r.disposed||s.current.move!==revision)return;
        try{const action=s.engine.botReaction?.(s.current,actor)||s.engine.botAction(s.current,actor);if(!action)return;
          if(run){run(actor,action);return;}
          this.actBot(actor,action);this.scheduleBot({delay,onError});
        }catch(error){onError(error);}
      },Math.max(0,delay));
    }
    // Host-only entrypoint; never attached to a client capability.
    actBot(actor,action){const r=records.get(this),s=r.session;if(r.persistence)throw Error('Durable bot actions require a committed async transition');if(r.disposed||r.busy||!s.current.players[actor]?.bot)throw Error('Invalid bot actor');const before=s.current;r.busy=true;try{s.act(actor,action);r.effects=transfers(before,s.current).map((draw,i)=>({id:`${this.revision}:draw:${i}`,revision:this.revision,...draw}));this._publish();}finally{r.busy=false;}return s.current;}
    dispose(){const r=records.get(this);this.cancelBot();r.disposed=true;for(const b of r.bindings){b.closed=true;b.listeners.clear();}r.bindings.clear();}
  }
  SessionAuthority.transfers=transfers;
  return SessionAuthority;
});
