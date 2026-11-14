/* RTC preparation for voluntary transfer; never owns room state or authority. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomTransferPeer = api;
})(globalThis, function () {
  'use strict';
  async function create({ kind, signal, roomId, progress: progressPort, configuration, rtc }) {
    const progress = progressPort?.create({ roomId, role: 'transfer' });
    try {
      const options = progress
          ? await progress.options()
          : { configuration: await configuration(roomId) },
        peer =
          kind === 'host'
            ? await rtc.createHostPeer(options)
            : await rtc.createClientPeer(signal, options);
      if (progress)
        void peer
          .waitOpen({ timeout: 45000 })
          .then(
            () => progress.connected(peer),
            () =>
              progress.fail({
                code: peer.pc.connectionState === 'failed' ? 'ice-failed' : 'transport-closed',
              }),
          )
          .catch(() => {});
      return peer;
    } catch (error) {
      progress?.fail(error);
      throw error;
    }
  }
  return Object.freeze({ create });
});
