// One transition pipeline for in-memory and durable authorities. All effects are ports.
(function (root, factory) {
  'use strict';
  const Processor = factory();
  if (typeof module === 'object' && module.exports) module.exports = Processor;
  root.PlayroomCommandProcessor = Processor;
})(globalThis, function () {
  'use strict';
  const receiptOnly = ({snapshot, ...receipt}) => receipt;

  return class CommandProcessor {
    #ports;
    #staged=[];
    #receipts=[];
    constructor(ports) {
      for (const key of ['begin', 'end', 'commit', 'remember', 'publish', 'reject', 'fence']) {
        if (typeof ports?.[key] !== 'function') throw Error('COMMAND_PROCESSOR_PORT_INVALID');
      }
      this.#ports = ports;
    }
    async flush(){
      if(!this.#staged.length&&!this.#receipts.length)return;
      await this.#ports.persistence.commitBatch({entries:this.#staged,receipts:this.#receipts});
      this.#staged=[];this.#receipts=[];
    }

    execute({sessionId, actor, command, signature, before, prepare, rejection}) {
      const ports = this.#ports;
      const stagedLength=this.#staged.length,receiptLength=this.#receipts.length;
      let next, receipt = rejection && receiptOnly(rejection), durable = false,volatile=false;
      ports.begin();

      const failed = () => {
        if (durable) {
          ports.fence();
          return ports.reject('RECOVERY_REQUIRED', command);
        }
        if(volatile){this.#staged.splice(stagedLength);this.#receipts.splice(receiptLength);}
        return ports.reject('STORAGE_ERROR', command);
      };
      const finish = () => {
        if (next) {
          // A write has succeeded. A later live/UI failure requires disk recovery.
          durable = !!ports.persistence&&!volatile;
          ports.commit(next);
        }
        ports.remember(actor, command.commandId, signature, receipt);
        if (receipt.ok) ports.publish(before, next);
        return receipt;
      };

      try {
        if (!receipt) {
          try {
            next = prepare();
            receipt = {ok:true, code:'OK', commandId:command.commandId, revision:next.move};
          } catch (_) { receipt = receiptOnly(ports.reject('ILLEGAL', command)); }
        }
        const entry = {sessionId, viewer:actor, commandId:command.commandId, signature, receipt};
        let pending;
        if(ports.persistence){
          const step=next?{...entry,previousRevision:before.move,previousState:before,nextState:next,action:ports.describeAction?.(next)||{actor,command:JSON.parse(JSON.stringify(command.action))}}:null;
          const staged=typeof ports.persistence.commitBatch==='function';
          if(staged&&next&&ports.checkpoint?.(before,next,actor,command.action)===false){receipt.draft=true;this.#staged.push(step);volatile=true;}
          else if(staged&&(this.#staged.length||this.#receipts.length)){
            if(!next){this.#receipts.push(entry);volatile=true;}
            else pending=ports.persistence.commitBatch({entries:[...this.#staged,step],receipts:this.#receipts}).then(()=>{this.#staged=[];this.#receipts=[];});
          }else pending=next?ports.persistence.commit(step):ports.persistence.recordReceipt(entry);
        }
        if (pending && typeof pending.then === 'function') {
          return Promise.resolve(pending).then(finish).catch(failed).finally(ports.end);
        }
        const result = finish();
        ports.end();
        return result;
      } catch (_) {
        try { return failed(); } finally { ports.end(); }
      }
    }
  };
});
