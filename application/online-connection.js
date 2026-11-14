/* Online connection coordinator. Browser UI and transport are injected ports. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomOnlineConnection = api;
})(globalThis, function () {
  'use strict';
  function create(ports) {
    let account,
      driver,
      target = null,
      connecting = false,
      expectedId = null,
      retryTimer = null,
      hosting = null,
      connectFlight = null,
      connectSequence = 0,
      attempt = null;
    const B = () => ports.bridge;
    const cancelled = () => Object.assign(Error('cancelled'), { code: 'cancelled' });
    function check(ticket, id) {
      if (ticket !== connectSequence || account.snapshot().id !== id) throw cancelled();
    }
    function init({ account: service, remote }) {
      account = service;
      ports.ice?.init(service);
      driver = new ports.Signaling({
        remote: (action, data) => remote.call(action, {...data,...(ports.deviceId?.()?{deviceId:ports.deviceId()}:{})}, { userId: expectedId }),
        idFactory: () => ports.id(),
        peers: {
          summary: () => ports.network.publicRoomSummary?.(),
          prepare: (roomId) => ports.ice?.credentials(roomId),
          host: async (options) => {
            const progress = ports.progress?.create({ roomId: hosting?.cloud, role: 'host' });
            try {
              return await ports.network.cloudHostPeer({
                ...options,
                ...(await progress?.options()),
                progress,
              });
            } catch (error) {
              progress?.fail(error);
              throw error;
            }
          },
          client: async (offer) => {
            const progress = attempt,
              ticket = connectSequence,
              id = expectedId;
            const options = await progress?.options();
            check(ticket, id);
            const peer = await ports.rtc.createClientPeer(offer, options);
            try {
              check(ticket, id);
              return peer;
            } catch (error) {
              peer.close();
              throw error;
            }
          },
          attach: async (peer, id, options) => {
            const progress = attempt,
              ticket = connectSequence,
              userId = expectedId;
            await peer.waitOpen({ timeout: 15000 });
            check(ticket, userId);
            progress?.update({ stage: 'admitting' });
            return ports.network.cloudAttachClient(peer, id, {
              ...options,
              beforeEnter: () => progress?.connected(peer, { delay: !options.background }),
            });
          },
        },
        report: (state) => ports.report(state),
      });
      let identity = account.snapshot().id;
      account.subscribe(() => {
        if (identity !== account.snapshot().id) {
          identity = account.snapshot().id;
          stop();
        }
      });
    }
    function ready() {
      const s = account.snapshot();
      if (!driver || !s.configured || s.kind !== 'account' || s.recovery)
        throw Object.assign(Error('account-required'), { code: 'account-required' });
      expectedId = s.id;
    }
    async function host(roomId) {
      ready();
      if (driver.mode === 'host' && hosting?.cloud === roomId && hosting?.local === B().room()?.id)
        return;
      if (!ports.network.canCloudHost())
        throw Object.assign(Error('lobby-required'), { code: 'lobby-required' });
      target = null;
      const ticket = connectSequence,
        id = expectedId;
      await ports.transfer?.cancelStale(roomId);
      check(ticket, id);
      const local = B().room().id;
      await ports.ice?.credentials(roomId);
      check(ticket, id);
      hosting = { cloud: roomId, local };
      try {
        await driver.host(roomId, local);
      } catch (error) {
        hosting = null;
        throw error;
      }
    }
    function connect(roomId, { background = false } = {}) {
      ready();
      const network = ports.network,
        activeId = hosting?.cloud || target?.roomId;
      if (network.hasActiveRoom?.()) {
        if (activeId !== roomId) throw Object.assign(Error('room-active'), { code: 'room-active' });
        if (network.chatContext?.()?.connected)
          return Promise.resolve(
            background ? undefined : (network.enterActiveRoom || network.openRoom)(),
          );
      }
      if (connecting && target?.roomId === roomId && target.userId === expectedId)
        return background
          ? connectFlight
          : connectFlight.then(() => {
              if (network.chatContext?.()?.connected)
                (network.enterActiveRoom || network.openRoom)();
            });
      const ticket = ++connectSequence, identity=expectedId;
      attempt?.cancel();
      attempt = ports.progress?.create({ roomId, visible: !background });
      if (!background && attempt)
        ports.showProgress(() => {
          stop();
          network.cancelJoin();
        });
      attempt?.paint();
      connecting = true;
      target = { roomId, userId: expectedId };
      const progress = attempt;
      progress?.update({ stage: 'rendezvous' });
      connectFlight = (async () => {
        let timer;
        try {
          await Promise.race([
            network.cloudResumeParticipantId?Promise.resolve(network.cloudResumeParticipantId(roomId)).then(resumeParticipantId=>{check(ticket,identity);return driver.connect(roomId,{background,resumeParticipantId});}):driver.connect(roomId,{background}),
            new Promise((_, reject) => {
              timer = ports.setTimeout(
                () =>
                  reject(
                    Object.assign(Error('connection-timeout'), { code: 'connection-timeout' }),
                  ),
                45000,
              );
            }),
          ]);
          if (ticket !== connectSequence)
            throw Object.assign(Error('cancelled'), { code: 'cancelled' });
        } catch (error) {
          progress?.fail(error);
          if (ticket === connectSequence) driver.stop();
          throw error;
        } finally {
          ports.clearTimeout(timer);
          if (ticket === connectSequence) {
            connecting = false;
            connectFlight = null;
          }
        }
      })();
      return connectFlight;
    }
    function reconnect() {
      if (!target || connecting || retryTimer || target.userId !== account.snapshot().id) return;
      const current = target;
      void connect(current.roomId, { background: true }).catch((error) => {
        if (!target || target.userId !== current.userId || target.roomId !== current.roomId) return;
        if (
          !error.code ||
          [
            'network',
            'host-offline',
            'unavailable',
            'connection-timeout',
            'transport-timeout',
            'transport-closed',
          ].includes(error.code)
        ) {
          retryTimer = ports.setTimeout(() => {
            retryTimer = null;
            reconnect();
          }, 3000);
        } else ports.reportError(error);
      });
    }
    function roomClosed(roomId) {
      if (!roomId || roomId !== (hosting?.cloud || target?.roomId)) return;
      stop();
      ports.network.closeCloudRoom?.();
      ports.roomClosed();
    }
    function stop() {
      attempt?.cancel();
      attempt = null;
      connectSequence++;
      connecting = false;
      connectFlight = null;
      target = null;
      hosting = null;
      ports.clearTimeout(retryTimer);
      retryTimer = null;
      driver?.stop();
    }
    return Object.freeze({
      init,
      host,
      connect,
      iceConfiguration: (roomId) =>
        ports.ice?.configuration(roomId) || Promise.resolve({ iceServers: [] }),
      reconnect,
      kickParticipant: async (roomId,participantId) => {ready();await driver.remote('kick',{roomId,participantId});},
      leave: async (roomId) => {ready();const remote=driver.remote;stop();await remote('leave',{roomId});},
      roomClosed,
      isHosting: () => driver?.mode === 'host',
      active: () => !!driver?.mode,
      roomId: () => hosting?.cloud || target?.roomId || null,
      stop,
      adoptClient: (roomId) => {
        ready();
        target = { roomId, userId: expectedId };
        driver.mode = 'client';
      },
      releaseHost: () => {
        driver?.releaseHost();
        hosting = null;
        target = null;
      },
      stopHost: () => {
        if (driver?.mode === 'host') stop();
      },
      stopClient: () => {
        if (driver?.mode !== 'host' && (target || connecting || driver?.mode === 'client')) stop();
      },
    });
  }
  return Object.freeze({ create });
});
