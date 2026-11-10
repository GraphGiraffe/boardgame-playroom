/* Shared lifecycle for manual and online connections. All side effects are ports. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomConnectionAttempt = api;
})(globalThis, function () {
  'use strict';
  function create({
    roomId = null,
    role = 'client',
    userId,
    now,
    idFactory,
    credentials,
    trace,
    selectedMethod,
    sleep,
    onChange = () => {},
  }) {
    const started = now(),
      id = idFactory(),
      events = [];
    let ended = false,
      cancelled = false,
      config = {},
      latest = {
        stage: 'preparing',
        direct: 'searching',
        stun: roomId ? 'searching' : 'unavailable',
        turn: roomId ? 'searching' : 'unavailable',
      };
    const update = (value) => {
      if (ended) return;
      const next = { ...latest, ...value };
      if (JSON.stringify(next) === JSON.stringify(latest) && events.length) return;
      latest = next;
      if (events.length >= 47) events.splice(1, 1);
      events.push({ ...latest, at: Math.min(180000, now() - started) });
      onChange({ ...latest });
    };
    const finish = (result, value = {}) => {
      if (ended) return;
      update({ stage: result, ...value });
      ended = true;
      if (config.diagnosticsEnabled !== false)
        void trace(
          {
            p_room_id: roomId,
            p_attempt_id: id,
            p_mode: roomId ? 'online' : 'network',
            p_role: role,
            p_result: result,
            p_events: events,
          },
          userId,
        );
    };
    update({});
    return {
      update,
      cancel() {
        cancelled = true;
        finish('cancelled', { code: 'cancelled' });
      },
      fail(error) {
        finish('failed', {
          code: [
            'turn-setup',
            'turn-auth',
            'turn-network',
            'connection-timeout',
            'transport-closed',
            'transport-timeout',
            'host-offline',
            'forbidden',
            'account-required',
            'account-changed',
            'room-active',
            'not-found',
            'network',
            'ice-failed',
          ].includes(error?.code)
            ? error.code
            : 'unknown',
        });
      },
      async options() {
        if (!roomId) return { onProgress: update };
        update({ stage: 'credentials' });
        config = await credentials(roomId);
        if (cancelled) throw Object.assign(Error('cancelled'), { code: 'cancelled' });
        if (config.code) update({ turn: 'unavailable', code: config.code });
        return {
          configuration: config.configuration,
          gatherTimeout: 12000,
          allowPartial: true,
          onProgress: update,
        };
      },
      async connected(peer, { delay = false } = {}) {
        if (cancelled) throw Object.assign(Error('cancelled'), { code: 'cancelled' });
        const route = await selectedMethod(peer.pc).catch(() => ({ method: 'unknown' }));
        if (cancelled) throw Object.assign(Error('cancelled'), { code: 'cancelled' });
        const status = {};
        for (const k of ['direct', 'stun', 'turn'])
          status[k] =
            route.method === k
              ? 'selected'
              : latest[k] === 'unavailable'
                ? 'unavailable'
                : 'unused';
        finish('connected', { ...status, ...route });
        if (delay) await sleep(500);
        if (cancelled) throw Object.assign(Error('cancelled'), { code: 'cancelled' });
      },
    };
  }
  return Object.freeze({ create });
});
