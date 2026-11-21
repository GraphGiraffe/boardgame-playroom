/* Planned handoff UI and RTC orchestration. Only the chosen peer receives private state. */
(function (root) {
  'use strict';
  const H = () => root.PlayroomGameScreen,
    B = () => root.PlayroomAppBridge,
    N = () => root.PlayroomNetworkLibrary,
    W = () => root.PlayroomWebRTCTransport,
    Wire = () => root.PlayroomHostTransferWire;
  let account,
    remote,
    sender = null,
    incoming = null;
  const guests = new Map();
  const fail = (message) => {
      throw Error(message);
    },
    token = () =>
      Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
        x.toString(16).padStart(2, '0'),
      ).join('');
  const hash = async (value) =>
    'sha256:' +
    Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))),
      (x) => x.toString(16).padStart(2, '0'),
    ).join('');
  const cloud = async (action, data) => {
    if (!data.cloudRoomId) return null;
    const s = account.snapshot();
    if (!remote || s.kind !== 'account' || s.recovery) fail('HOST_TRANSFER_ACCOUNT_REQUIRED');
    const body = { roomId: data.cloudRoomId };
    for (const key of ['id', 'target', 'source', 'digest', 'revision', 'participantId'])
      if (data[key] !== undefined) body[key] = data[key];
    return remote.call(action, body, { userId: s.id });
  };
  const rtcPeer = (kind, signal, roomId) =>
    root.PlayroomTransferPeer.create({
      kind,
      signal,
      roomId,
      progress: root.PlayroomConnectionProgress,
      rtc: W(),
      configuration: (id) => root.PlayroomCloudNetwork?.iceConfiguration(id),
    });
  function markup(room, id) {
    return (room?.phase === 'playing' || (room?.phase === 'lobby' && !room.recovery)) &&
      !room.hostTransferPending &&
      room.transportMode !== 'hotseat' &&
      room.ownerId === id
      ? H().iconButton('data-host-transfer-open', 'Передать роль хоста', 'host-transfer')
      : '';
  }
  function message(text, retry = false, waiting = false) {
    B().openModal(
      H().modalHead('Передача хоста') +
        `<p role="status">${H().esc(text)}</p>${retry ? H().button({ attrs: 'type="button" data-host-transfer-retry', label: 'Продолжить передачу' }) : ''}${waiting ? `<div class="modal-foot">${H().iconButton('data-host-transfer-cancel', 'Отменить', 'close')}</div>` : ''}`,
      'host-transfer-modal',
    );
  }
  // Receiving an offer does not own the screen. Only an explicit tap opens its decision panel.
  function offerCurrent(value){const ctx=N().transferClient();return incoming===value&&ctx?.channel===value.channel&&ctx.room.id===value.roomId&&ctx.room.ownerId===value.source&&ctx.id===value.target&&(value.kind==='lobby'?ctx.room.phase==='lobby'&&!ctx.room.recovery:ctx.room.phase==='playing');}
  function closeIncomingPanel(value=incoming,{animate=true}={}){
    const frame=value?.panelFrame,dialogs=value?.panelController;
    if(!frame||!dialogs||frame.state==='disposed')return false;
    if(frame.state==='suspended')dialogs.dispose();
    else dialogs.close(frame,{reason:animate?'dismiss':'invalidate'});
    return frame.state==='disposed';
  }
  function openIncomingPanel(value=incoming){
    if(!value?.consentPending||!offerCurrent(value))return false;
    if(value.panelFrame?.state==='suspended')return false;
    if(value.panelFrame?.state==='active'){
      value.panel.querySelector('[data-host-offer-reject]')?.focus({preventScroll:true});return true;
    }
    const dialogs=value.panelController||new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});
    const message=value.kind==='lobby'?'Вы сможете управлять комнатой и запускать партии. Настройки и места сохранятся; игрокам нужно будет подтвердить готовность заново.':'Вы сможете управлять комнатой и продолжением партии. Игра и места участников сохранятся.';
    let cleanup=()=>{};
    const frame=dialogs.open(`<div class="modal-backdrop host-offer-layer"><section class="modal host-offer-panel" data-ui-surface="panel" data-dialog-size="compact" role="dialog" aria-modal="true" aria-labelledby="host-offer-title">${H().modalHead('Передача хоста')}<div class="modal-body"><p><strong>${H().esc(value.sourceName||'Хост')}</strong> предлагает передать вам роль хоста.</p><p class="host-offer-description">${H().esc(message)}</p></div><div class="host-offer-actions" data-fixed-footer><button type="button" data-host-offer-reject>Отклонить</button><button type="button" data-host-offer-accept>Принять</button></div></section></div>`,{
      mode:'push',valid:()=>value.consentPending&&offerCurrent(value),meta:{owner:'host-offer',dismiss:()=>closeIncomingPanel(value)},
      onDispose:()=>{cleanup();if(value.panelFrame===frame){value.panelFrame=null;value.panel=null;value.dialog=value.banner;if(value.banner)value.banner.hidden=!value.consentPending;}}
    });
    if(!frame)return false;
    value.panelController=dialogs;value.panelFrame=frame;value.panel=frame.element;value.dialog=frame.element;
    value.banner.hidden=true;
    const title=frame.element.querySelector('h2'),panel=frame.element.querySelector('.modal');title.id='host-offer-title-'+frame.id;panel.setAttribute('aria-labelledby',title.id);
    frame.element.querySelector('[data-command="close-modal"]').setAttribute('data-host-offer-close','');
    cleanup=H().bindSurfaceDismiss(frame.element,{isActive:()=>dialogs.isActive(frame),onDismiss:()=>closeIncomingPanel(value)});
    frame.element.addEventListener('cancel',()=>value.finishConsent?.(false));
    frame.element.addEventListener('click',event=>{
      if(!dialogs.isActive(frame))return;
      if(event.target===frame.element){event.preventDefault();event.stopImmediatePropagation();closeIncomingPanel(value);}
      else if(event.target.closest('[data-host-offer-reject]'))value.finishConsent?.(false);
      else if(event.target.closest('[data-host-offer-accept]')){if(offerCurrent(value))value.finishConsent?.(true);else{value.finishConsent?.(false);B().toast('Предложение уже недоступно.');}}
    });
    frame.element.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialogs.isActive(frame)){event.preventDefault();event.stopImmediatePropagation();closeIncomingPanel(value);}},true);
    frame.element.querySelector('[data-host-offer-reject]').focus({preventScroll:true});return true;
  }
  function requestIncomingConsent(value,ctx){
    value.consentPending=true;
    const source=ctx.room.participants.find(p=>p.id===value.source)?.nickname||'Хост';value.sourceName=source;
    const banner=document.createElement('aside');banner.className='host-offer-banner';banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
    banner.innerHTML=`<button type="button" data-host-offer-open>${H().icon('host-transfer')}<span><strong>${H().esc(source)} предлагает роль хоста</strong><small>Нажмите, чтобы ответить</small></span><span aria-hidden="true">›</span></button>`;
    value.offerFocus=document.activeElement;value.banner=banner;value.dialog=banner;document.body.append(banner);root.PlayroomDOM.enterVisual(banner);banner.addEventListener('pointerdown',()=>{if(!banner.contains(document.activeElement)){value.offerFocus=document.activeElement;value.panelController ||= new root.PlayroomDOM.ModalController({host:document.getElementById('modal-root'),background:document.getElementById('app')});value.panelController.capture();}},{capture:true});banner.querySelector('button').onclick=()=>openIncomingPanel(value);
    const promise=new Promise(resolve=>{let settled=false;const timer=setTimeout(()=>{if(!value.consentPending)return;value.finishConsent(false);B().toast('Срок предложения передачи хоста истёк.');},65000);
      value.finishConsent=(accepted,{animate=true}={})=>{if(settled)return;settled=true;const restore=!!value.panel?.contains(document.activeElement)||banner.contains(document.activeElement),visual=animate&&!value.retireImmediately&&offerCurrent(value),bannerVisible=!banner.hidden;clearTimeout(timer);closeIncomingPanel(value,{animate:visual});value.consentPending=false;root.PlayroomDOM.retireVisual(banner,{kind:'banner',animate:visual&&bannerVisible});value.banner=null;value.dialog=null;if(restore){const target=value.offerFocus?.isConnected?value.offerFocus:document.querySelector('#modal-root .modal button,[data-game-menu]');target?.focus({preventScroll:true});}resolve(!!accepted);};
    });
    banner.addEventListener('cancel',()=>value.finishConsent(false));
    value.consentPromise=promise;return promise;
  }
  function clientBind(channel) {
    if (incoming?.active) incoming = null;
    channel.addEventListener(
      'close',
      () => {
        if (incoming?.channel === channel && !incoming.committed) {
          incoming.finishConsent?.(false,{animate:false});
          incoming.release?.();
          for (const peer of incoming.peers.values()) peer.close();
          incoming = null;
        }
      },
      { once: true },
    );
    return Wire().bind(channel, (method, data) => receive(channel, method, data));
  }
  async function receive(channel, method, data) {
    const ctx = N().transferClient();
    if (method === 'consent') {
      if (
        !ctx ||
        ctx.channel !== channel ||
        ctx.room.id !== data.roomId ||
        ctx.id !== data.target ||
        ctx.room.ownerId !== data.source ||
        !['lobby', 'playing'].includes(ctx.room.phase) ||
        (ctx.room.phase === 'lobby' && (ctx.room.recovery || data.kind !== 'lobby'))
      )
        fail('HOST_TRANSFER_UNAVAILABLE');
      if (incoming) {
        if (incoming.id === data.id && incoming.channel === channel &&
            ['roomId','source','target','cloudRoomId','kind'].every(key=>incoming[key]===data[key]))
          return incoming.consentResult;
        fail('HOST_TRANSFER_BUSY');
      }
      const offered = (incoming = { ...data, channel, peers: new Map(), active: false, accepted:false });
      root.PlayroomUIFeedback?.emit('handoff.offer',{id:data.id});
      const answer=requestIncomingConsent(offered,ctx);
      // Retries share the actual decision AND its durable cloud acceptance, never a
      // provisional positive ACK while the participant is still deciding.
      offered.consentResult=(async()=>{
        if (!(await answer)) {
          if (incoming === offered) incoming = null;
          return { accepted: false };
        }
        if (!offerCurrent(offered)) fail('HOST_TRANSFER_CANCELLED');
        await cloud('accept', data);
        if (!offerCurrent(offered)) fail('HOST_TRANSFER_CHANGED');
        offered.accepted=true;
        return { accepted: true };
      })();
      return offered.consentResult;
    }

    if (method === 'prepare-guest') {
      if (!ctx || ctx.channel !== channel || ctx.room.id !== data.roomId)
        fail('HOST_TRANSFER_UNAVAILABLE');
      return prepareGuest(data);
    }
    if (method === 'cancel-guest') {
      const g = guests.get(data.id);
      if (g) {
        g.peer.close();
        guests.delete(data.id);
      }
      return { ok: true };
    }
    if (
      !incoming ||
      incoming.channel !== channel ||
      incoming.id !== data.id ||
      incoming.roomId !== ctx?.room.id
    )
      fail('HOST_TRANSFER_UNAUTHORIZED');
    const value = incoming;
    if(method!=='cancel'&&!value.accepted)fail('HOST_TRANSFER_CONSENT_REQUIRED');
    if (method === 'prepare') {
      const payload = data.payload,
        digest = await hash(JSON.stringify(payload));
      if (value.prepared) {
        if (value.digest !== digest) fail('HOST_TRANSFER_CHANGED');
        return { digest, revision: value.revision };
      }
      if (payload.lobby) {
        const lobby = payload.lobby,
          r = lobby.recovery?.room,
          pack = B().packs.parse(payload.pack);
        if (
          value.kind !== 'lobby' ||
          lobby.id !== value.id ||
          lobby.target !== value.target ||
          lobby.source !== value.source ||
          lobby.cloudRoomId !== value.cloudRoomId ||
          r?.id !== value.roomId ||
          r.phase !== 'lobby' ||
          r.recovery ||
          r.ownerId !== value.target ||
          pack.manifest.id !== r.game.id ||
          pack.manifest.version !== r.game.version
        )
          fail('HOST_TRANSFER_INVALID');
        N().transferValidateLobby(payload);
        value.release = await N().transferStore.acquireHostLock('lobby:' + r.id);
        value.payload = payload;
        value.digest = digest;
        value.revision = r.revision;
        value.durableSeriesLobby = !lobby.cloudRoomId && !!r.seriesProgress;
        try {
          if (value.durableSeriesLobby) await N().transferStore.stageLobbyHandoff(B().profile().id, payload);
          else await root.PlayroomData.transact(() =>
            root.PlayroomData.setItem(
              lobbyKey(r.id),
              JSON.stringify({
                profileId: B().profile().id,
                accountId: account.snapshot().id,
                payload,
                state: 'prepared',
              }),
            ),
          );
        } catch (error) {
          value.release();
          value.release = null;
          throw error;
        }
        value.prepared = true;
        value.stagedLobby = true;
        await cloud('ready', { ...value, digest, revision: r.revision });
        return { digest, revision: r.revision };
      }
      const archive = payload.archive,
        r = archive?.record;
      if (
        r?.transfer?.id !== value.id ||
        r.transfer.target !== value.target ||
        r.transfer.source !== value.source ||
        r.roomId !== value.roomId ||
        r.transfer.cloudRoomId !== value.cloudRoomId
      )
        fail('HOST_TRANSFER_INVALID');
      const pack = B().packs.parse(payload.pack);
      if (
        pack.manifest.id !== r.game ||
        pack.manifest.version !== r.packVersion ||
        (await hash(payload.pack)) !== r.packDigest
      )
        fail('HOST_TRANSFER_PACK_MISMATCH');
      await B().packs.install(await B().packs.prepareInstall(pack), { activate: true });
      value.release = await N().transferStore.acquireHostLock(r.sessionId);
      try {
        await N().transferStore.stageTransfer(
          archive,
          root.TabletopCore,
          root.TabletopSession,
          B().profile().id,
        );
      } catch (e) {
        value.release();
        value.release = null;
        throw e;
      }
      value.staged = true;
      value.sessionId = r.sessionId;
      value.previousChat = root.PlayroomData.getItem('playroom.room-chat.v1.' + value.roomId);
      await root.PlayroomData.transact(() =>
        root.PlayroomData.setItem(
          'playroom.room-chat.v1.' + value.roomId,
          JSON.stringify(payload.chat || []),
        ),
      );
      value.digest = digest;
      value.revision = r.revision;
      value.sessionId = r.sessionId;
      value.prepared = true;
      await cloud('ready', { ...value, digest, revision: r.revision });
      return { digest, revision: r.revision };
    }
    if (method === 'offers') {
      if (!value.prepared || !Array.isArray(data.participants) || data.participants.length > 32)
        fail('HOST_TRANSFER_INVALID');
      const result = [];
      for (const id of data.participants) {
        let peer = value.peers.get(id);
        if (!peer) {
          peer = await rtcPeer('host', null, value.cloudRoomId);
          value.peers.set(id, peer);
        }
        result.push({ participantId: id, offer: peer.offer });
      }
      return result;
    }
    if (method === 'answer') {
      const peer = value.peers.get(data.participantId);
      if (!peer) fail('HOST_TRANSFER_INVALID');
      await peer.acceptAnswer(data.answer);
      return { ok: true };
    }
    if (method === 'cancel') {
      await cancelIncoming(value);
      return { ok: true };
    }
    if (method === 'activate') {
      if (value.activation) return value.activation;
      value.activation = (async () => {
        if (value.active) return { ok: true };
        if (!value.prepared) fail('HOST_TRANSFER_NOT_READY');
        if (value.cloudRoomId) {
          const state = await cloud('status', value);
          if (state.state !== 'committed' || state.owner !== account.snapshot().id)
            fail('HOST_TRANSFER_NOT_COMMITTED');
        }
        if (value.stagedLobby) {
          if (value.durableSeriesLobby) await N().transferStore.commitLobbyHandoff(value.roomId, value.id);
          else await root.PlayroomData.transact(() => {
            const saved = JSON.parse(root.PlayroomData.getItem(lobbyKey(value.roomId)));
            saved.state = 'committed';
            root.PlayroomData.setItem(lobbyKey(value.roomId), JSON.stringify(saved));
          });
          value.committed = true;
          await N().transferPromoteLobby({ payload: value.payload, peers: value.peers,
            retainedLobby: value.durableSeriesLobby ? { id: value.id, release: value.release } : null });
          if (!value.durableSeriesLobby) value.release?.();
          value.release = null;
          value.active = true;
          for (const [id, peer] of value.peers) {
            const wire = Wire().bind(peer.channel, () => ({ active: true, id: value.id }));
            void wire
              .request('promote', {
                id: value.id,
                roomId: value.roomId,
                cloudRoomId: value.cloudRoomId,
              })
              .catch(() => {});
          }
          if (!value.durableSeriesLobby) await root.PlayroomData.transact(() =>
            root.PlayroomData.removeItem(lobbyKey(value.roomId)),
          );
          return { ok: true };
        }
        await N().transferStore.transferState(value.sessionId, value.id, 'active');
        value.committed = true;
        await N().transferPromote({
          sessionId: value.sessionId,
          release: value.release,
          peers: value.peers,
          cloudRoomId: value.cloudRoomId,
        });
        value.release = null;
        value.active = true;
        for (const [id, peer] of value.peers) {
          const wire = Wire().bind(peer.channel, () => ({ active: true, id: value.id }));
          void wire
            .request('promote', {
              id: value.id,
              roomId: value.roomId,
              cloudRoomId: value.cloudRoomId,
            })
            .catch(() => {});
        }
        return { ok: true };
      })();
      try {
        return await value.activation;
      } catch (error) {
        value.activation = null;
        throw error;
      }
    }
    fail('HOST_TRANSFER_INVALID');
  }
  async function prepareGuest(data) {
    let value = guests.get(data.id);
    if (value) return { answer: value.peer.answer };
    const peer = await rtcPeer('client', data.offer, data.cloudRoomId);
    value = { ...data, peer };
    guests.set(data.id, value);
    void peer
      .waitOpen({ timeout: 60000 })
      .then((channel) =>
        Wire().bind(channel, async (method, packet) => {
          if (method !== 'promote' || packet.id !== value.id || packet.roomId !== value.roomId)
            fail('HOST_TRANSFER_INVALID');
          if (value.promoted) return { ok: true };
          value.promoted = true;
          if (sender?.state?.id === value.id) {
            sender.state.promoted = true;
            sender.state.promotedResolve?.();
          }
          // Return over the prepared link before starting normal resume negotiation.
          root.setTimeout(() => {
            void N()
              .transferAttach(peer, value.roomId, packet.cloudRoomId)
              .catch(() => {
                if (document.querySelector('.host-transfer-modal')) B().closeModal(true);
                if (packet.cloudRoomId) {
                  B().toast('Хост передан. Восстанавливаем подключение к комнате…');
                  root.PlayroomCloudNetwork.reconnect();
                } else
                  B().toast('Хост передан, но подключиться не удалось. Откройте комнату ещё раз.');
              });
          }, 0);
          return { ok: true };
        }),
      )
      .catch(() => {
        if (!value.promoted) {
          peer.close();
          guests.delete(data.id);
        }
      });
    return { answer: peer.answer };
  }
  async function cancelIncoming(value) {
    if (value.committed) return;
    value.retireImmediately=true;root.PlayroomDOM.clearVisualExits(document);
    if (value.dialog?.isConnected)
      value.dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    for (const peer of value.peers.values()) peer.close();
    value.release?.();
    try {
      if (value.stagedLobby && value.durableSeriesLobby)
        await N().transferStore.discardLobbyHandoff(value.roomId, value.id);
      else if (value.stagedLobby)
        await root.PlayroomData.transact(() =>
          root.PlayroomData.removeItem(lobbyKey(value.roomId)),
        );
      if (value.staged) {
        await N().transferStore.remove(value.sessionId);
        await root.PlayroomData.transact(() => {
          const key = 'playroom.room-chat.v1.' + value.roomId;
          if (value.previousChat === null) root.PlayroomData.removeItem(key);
          else root.PlayroomData.setItem(key, value.previousChat);
        });
      }
    } finally {
      if (incoming === value) incoming = null;
    }
  }
  async function start(target) {
    const ctx = N().transferContext();
    if (
      !ctx ||
      (ctx.room.phase === 'lobby' && ctx.room.recovery) ||
      (sender?.state && sender.state.stage !== 'complete')
    )
      return;
    const peer = ctx.peers.find((p) => p.id === target);
    if (!peer) return;
    const wire = Wire().bind(peer.channel, () => fail('HOST_TRANSFER_UNAUTHORIZED'));
    sender = new root.PlayroomHostTransfer.Sender({
      id: () => crypto.randomUUID(),
      consent: async (s) => {
        s.meta = {
          id: s.id,
          kind: ctx.room.phase === 'lobby' ? 'lobby' : 'game',
          roomId: ctx.room.id,
          source: ctx.room.ownerId,
          target,
          cloudRoomId: root.PlayroomCloudNetwork?.roomId() || null,
        };
        await cloud('offer', s.meta);
        s.wire = wire;
        B().closeModal(true);
        B().toast('Предложение передачи хоста отправлено. Можно продолжать играть.');
        const result = await wire.request('consent', s.meta);
        if (!result.accepted) {
          await cloud('cancel', s.meta);
          root.PlayroomUIFeedback?.emit('handoff.declined',{id:s.id});
          B().toast('Участник отклонил передачу хоста.');
          return false;
        }
        root.PlayroomUIFeedback?.emit('handoff.accepted',{id:s.id});
        B().toast('Участник принял передачу хоста. Передаём состояние партии…');
        return true;
      },
      freeze: async (s) => {
        message('Сохранение комнаты и подготовка соединений…');
        s.thaw = await N().transferFreeze();
      },
      prepare: async (s) => {
        s.token = token();
        const raw = await N().transferExport();
        let revision;
        if (raw.lobby) {
          const lobby = root.PlayroomHostTransfer.lobbyBundle(raw.lobby, {
            id: s.id,
            target,
            sourceToken: s.token,
            cloudRoomId: s.meta.cloudRoomId,
          });
          s.payload = { lobby, pack: raw.pack, chat: raw.chat };
          revision = lobby.recovery.room.revision;
        } else {
          const archive = root.PlayroomHostTransfer.bundle(raw.archive, {
            id: s.id,
            target,
            sourceToken: s.token,
            cloudRoomId: s.meta.cloudRoomId,
          });
          s.payload = { archive, pack: raw.pack, chat: raw.chat };
          s.sessionId = archive.record.sessionId;
          revision = archive.record.revision;
        }
        s.digest = await hash(JSON.stringify(s.payload));
        await cloud('seal', { ...s.meta, digest: s.digest, revision });
        const ready = await wire.request('prepare', { id: s.id, payload: s.payload });
        if (ready.digest !== s.digest || ready.revision !== revision)
          fail('HOST_TRANSFER_INVALID_ACK');
      },
      connections: async (s) => {
        s.promotedPromise = new Promise((resolve) => (s.promotedResolve = resolve));
        const participants = [
          ctx.room.ownerId,
          ...ctx.peers.filter((p) => p.id !== target).map((p) => p.id),
        ];
        const offers = await wire.request('offers', { id: s.id, participants });
        for (const offer of offers) {
          const data = {
            id: s.id,
            roomId: ctx.room.id,
            cloudRoomId: s.meta.cloudRoomId,
            offer: offer.offer,
          };
          const answer =
            offer.participantId === ctx.room.ownerId
              ? await prepareGuest(data)
              : await Wire()
                  .bind(ctx.peers.find((p) => p.id === offer.participantId).channel, () =>
                    fail('HOST_TRANSFER_UNAUTHORIZED'),
                  )
                  .request('prepare-guest', data);
          await wire.request('answer', {
            id: s.id,
            participantId: offer.participantId,
            answer: answer.answer,
          });
        }
        if (!s.promotedPromise)
          s.promotedPromise = new Promise((resolve) => (s.promotedResolve = resolve));
      },
      fence: async (s) => {
        if (!N().transferSaveResume(s.token)) fail('HOST_TRANSFER_STORAGE_REQUIRED');
        await N().transferFence(s.id, target, s.meta.cloudRoomId);
      },
      commit: async (s) => {
        if (s.meta.cloudRoomId && root.PlayroomCloudNetwork.isHosting())
          root.PlayroomCloudNetwork.releaseHost();
        await cloud('commit', s.meta);
      },
      activate: async (s) => {
        void wire.request('activate', { id: s.id }).catch(() => {});
        let timer;
        try {
          await Promise.race([
            s.promotedPromise,
            new Promise(
              (_, reject) =>
                (timer = setTimeout(
                  () => reject(Error('HOST_TRANSFER_CONFIRMATION_PENDING')),
                  15000,
                )),
            ),
          ]);
        } finally {
          clearTimeout(timer);
        }
      },
      cancel: async (s) => {
        await Promise.allSettled([
          wire.request('cancel', { id: s.id }, 3000),
          cloud('cancel', s.meta),
          ...ctx.peers
            .filter((p) => p.id !== target)
            .map((p) =>
              Wire()
                .bind(p.channel, () => fail('HOST_TRANSFER_UNAUTHORIZED'))
                .request('cancel-guest', { id: s.id }, 3000),
            ),
        ]);
        const g = guests.get(s.id);
        if (g) {
          g.peer.close();
          guests.delete(s.id);
        }
      },
      thaw: async (s) => {
        s.thaw?.();
        if (document.querySelector('.host-transfer-modal')) B().closeModal(true);
      },
    });
    try {
      const result = await sender.start(target);
      if (result.complete) {
        if (document.querySelector('.host-transfer-modal')) B().closeModal(true);
        root.PlayroomUIFeedback?.emit('handoff.complete',{id:sender.state?.id});
        B().toast('Хост передан.');
      }
      return result;
    } catch {
      const fenced = sender.state?.stage === 'fenced';
      B().toast(
        fenced
          ? 'Передача ещё подтверждается. Старый хост уже остановлен.'
          : 'Передать хоста не удалось. Комната остаётся у прежнего хоста.',
      );
      if (fenced) message('Передача подтверждается. Старый хост уже остановлен.', true);
    }
  }
  function show() {
    if (sender?.state?.stage === 'fenced') {
      message('Передача подтверждается. Старый хост уже остановлен.', true);
      return;
    }
    const ctx = N().transferContext();
    if (!ctx || (ctx.room.phase === 'lobby' && ctx.room.recovery)) return;
    const rows = ctx.peers.filter((p) =>
      !p.sameAccount && ctx.room.participants.some(
        (v) => v.id === p.id && !v.bot && ['player', 'spectator', 'table'].includes(v.role),
      ),
    );
    B().openModal(
      H().modalHead('Передать роль хоста') +
        `<div class="social-content"><div class="social-list"><ul>${rows
          .map((p) => {
            const person = ctx.room.participants.find((v) => v.id === p.id);
            return `<li class="community-friend"><button type="button" class="lobby-seat occupied friend-card" data-host-transfer-target="${H().esc(p.id)}">${root.TabletopUI.avatar({ name: person.nickname, avatar: person.avatar }, 0, { hidden: true })}<span><strong>${H().esc(person.nickname)}</strong></span></button></li>`;
          })
          .join('')}</ul>${rows.length ? '' : '<p>Нет подключённых игроков.</p>'}</div></div>`,
      'host-transfer-modal',
    );
  }
  const lobbyKey = (id) => 'playroom.lobby-transfer.v1.' + id;
  let lobbyRecoveryFlight = null;
  async function recoverLobbies() {
    if (lobbyRecoveryFlight) return lobbyRecoveryFlight;
    const run = Promise.resolve().then(async () => {
      const profileId = B().profile?.()?.id;
      if (profileId && !N().hasActiveRoom()) {
        const checkpoints = await N().transferStore.listLobbyHandoffs(profileId).catch(() => []);
        for (const { id, roomId, payload } of checkpoints) {
          let release;
          try {
            release = await N().transferStore.acquireHostLock('lobby:' + roomId);
            // A live tab keeps this lock until the lobby is consumed or left.
            if (B().profile()?.id !== profileId || N().hasActiveRoom()) continue;
            await N().transferPromoteLobby({ payload: { ...payload, pack: await payload.pack.text() },
              retainedLobby: { id, release, restoring: true } });
            release = null;
            break;
          } catch {
            // Keep the committed checkpoint for a later recovery attempt.
          } finally {
            release?.();
          }
        }
      }
      const keys = Array.from({ length: root.PlayroomData.length }, (_, i) =>
        root.PlayroomData.key(i),
      ).filter((key) => key?.startsWith('playroom.lobby-transfer.v1.'));
      for (const key of keys) {
        let saved;
        try {
          saved = JSON.parse(root.PlayroomData.getItem(key));
        } catch {
          continue;
        }
        if (saved?.profileId !== B().profile()?.id || saved.accountId !== account.snapshot().id)
          continue;
        const lobby = saved.payload?.lobby;
        if (!lobby) continue;
        try {
          if (lobby.cloudRoomId) {
            const status = await cloud('status', { ...lobby, roomId: lobby.recovery.room.id });
            if (status.state !== 'committed' || status.owner !== account.snapshot().id) continue;
          } else if (saved.state !== 'committed') continue;
          if (N().hasActiveRoom()) continue;
          await N().transferPromoteLobby({ payload: saved.payload });
          await root.PlayroomData.transact(() => root.PlayroomData.removeItem(key));
        } catch {
          /* Prepared lobby remains recoverable. */
        }
      }
    });
    lobbyRecoveryFlight = run;
    try {
      await run;
    } finally {
      if (lobbyRecoveryFlight === run) lobbyRecoveryFlight = null;
    }
  }

  function init(ports) {
    ({ account, remote } = ports);
    account.subscribe(() => void recoverLobbies());
    void recoverLobbies();
  }

  async function cancelStale(cloudRoomId) {
    const room = B().room();
    if (!room?.recovery || N().transferContext()) return;
    const pending = await cloud('pending', { cloudRoomId });
    for (const item of pending.items || []) await cloud('cancel', { id: item.id, cloudRoomId });
  }
  async function recover(sessionId) {
    const raw = await N().transferStore.readPrivate(sessionId),
      t = raw.record?.transfer;
    if (t?.role !== 'incoming' || !t.cloudRoomId) fail('HOST_TRANSFER_PENDING');
    const state = await cloud('status', { ...t, cloudRoomId: t.cloudRoomId });
    if (state.state !== 'committed' || state.owner !== account.snapshot().id)
      fail('HOST_TRANSFER_PENDING');
    await N().transferStore.transferState(sessionId, t.id, 'active');
  }
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-host-transfer-open]')) show();
    if (event.target.closest('[data-host-transfer-cancel]') && sender?.state?.stage === 'consent') {
      const s = sender.state;
      void Promise.allSettled([
        s.wire?.request('cancel', { id: s.id }, 3000),
        cloud('cancel', s.meta),
      ]);
    }
    const p = event.target.closest('[data-host-transfer-target]');
    if (p) void start(p.dataset.hostTransferTarget);
    if (event.target.closest('[data-host-transfer-retry]'))
      void sender
        ?.finish()
        .catch(() =>
          message('Подтверждение пока не получено. Повторите после восстановления связи.', true),
        );
  });
  root.PlayroomHostTransferUI = Object.freeze({
    init,
    markup,
    clientBind,
    start,
    show,
    recover,
    cancelStale,
    hasIncoming:id=>!!id&&incoming?.id===id,
    focusIncoming:id=>incoming?.id===id?openIncomingPanel(incoming):false,
    dismissIncomingPanel:()=>closeIncomingPanel(),
    senderState: () => sender?.state,
    guestId: (peer) => [...guests.values()].find((g) => g.peer === peer)?.id,
    checkPeer: (cloudRoomId, participantId) => cloud('check-peer', { cloudRoomId, participantId }),
  });
})(globalThis);
