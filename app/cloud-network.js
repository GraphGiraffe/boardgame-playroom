/* Browser composition for the online connection coordinator. */
(function (root) {
  'use strict';
  const B = () => root.PlayroomAppBridge,
    t = (key) => root.PlayroomMessages.text('ui.social.' + key);
  const api = root.PlayroomOnlineConnection.create({
    get bridge() {
      return B();
    },
    get ice() {
      return root.PlayroomIceConfig;
    },
    get Signaling() {
      return root.PlayroomCloudSignaling;
    },
    get network() {
      return root.PlayroomNetworkLibrary;
    },
    get progress() {
      return root.PlayroomConnectionProgress;
    },
    get rtc() {
      return root.PlayroomWebRTCTransport;
    },
    get transfer() {
      return root.PlayroomHostTransferUI;
    },
    id: () => root.crypto.randomUUID(),
    setTimeout: (...args) => root.setTimeout(...args),
    clearTimeout: (id) => root.clearTimeout(id),
    report(state) {
      const label = document.querySelector('[data-cloud-status]');
      if (label)
        label.textContent = t(state.state === 'error' ? 'cloud-retrying' : 'cloud-hosting');
    },
    reportError(error) {
      B().toast(t('error.' + (['setup'].includes(error.code) ? error.code : 'request')));
    },
    showProgress(onBack) {
      const current=document.querySelector('#modal-root>[data-surface-state="active"] .online-connecting-modal');
      if(current?.querySelector('[data-connection-progress]')||!B().openModal)return;
      const account=root.PlayroomAccountUI.service.snapshot().id,revision=root.PlayroomCommunityUI?.service?.generation;
      const valid=()=>account===root.PlayroomAccountUI.service.snapshot().id&&revision===root.PlayroomCommunityUI?.service?.generation;
      const frame=B().openModal(root.PlayroomConnectionProgress.markup({retryAttrs:'data-cloud-connection-retry',retryOnFailure:true}),'online-connecting-modal',{onBack,valid});
      const retry=frame?.element.querySelector('[data-cloud-connection-retry]');
      if(retry)retry.onclick=()=>{
        const roomId=api.roomId();if(!roomId||frame.state!=='active'||!valid())return;
        void api.connect(roomId).catch(error=>{if(frame.state==='active'&&valid())root.PlayroomConnectionProgress.showFailure(frame.element.querySelector('[data-connection-progress]'),error);});
      };
    },
    roomClosed() {
      B().closeModal(true);
      B().showHub();
      B().toast('Комната закрыта.');
    },
  });
  root.addEventListener('pagehide', () => api.stop());
  root.PlayroomCloudNetwork = api;
})(globalThis);
