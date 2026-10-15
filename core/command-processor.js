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
    constructor(ports) {
      for (const key of ['begin', 'end', 'commit', 'remember', 'publish', 'reject', 'fence']) {
        if (typeof ports?.[key] !== 'function') throw Error('COMMAND_PROCESSOR_PORT_INVALID');
      }
      this.#ports = ports;
    }

    execute({sessionId, actor, command, signature, before, prepare, rejection}) {
      const ports = this.#ports;
      let next, receipt = rejection && receiptOnly(rejection), durable = false;
      ports.begin();

      const failed = () => {
        if (durable) {
          ports.fence();
          return ports.reject('RECOVERY_REQUIRED', command);
        }
        return ports.reject('STORAGE_ERROR', command);
      };
      const finish = () => {
        if (next) {
          // A write has succeeded. A later live/UI failure requires disk recovery.
          durable = !!ports.persistence;
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
        const pending = ports.persistence && (next
          ? ports.persistence.commit({...entry, previousRevision:before.move, nextState:next})
          : ports.persistence.recordReceipt(entry));
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
