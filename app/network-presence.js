/* Presence projection and presentation; no connection lifecycle ownership. */
(function (root) {
  'use strict';
  root.PlayroomNetworkPresence = {
    create(ports) {
      const $ = (s) => document.querySelector(s),
        tableAvailability = new WeakMap(), rosterIdentity = new WeakMap();
      function roomPresence(room) {
        const occupied = room.seats
          .filter((s) => s.participantId)
          .sort((a, b) => a.index - b.index);
        return {
          kind: 'room-presence',
          roomId: room.id,
          revision: room.revision,
          participants: room.participants.map((p) => ({
            id: p.id,
            nickname: p.nickname,
            avatar: p.avatar || null,
            connected: !!p.connected,
            seatId: p.seatId,
            role: p.role,
            isHost: !!p.isHost,
            bot: !!p.bot,
            ...(p.botSettings ? { botSettings: p.botSettings } : {}),
            local: !!p.local,
            hasConnected: Number.isFinite(p.joinedAt),
            replacement: p.replacement || null,
            playerIndex:
              occupied.find((s) => s.participantId === p.id)?.playerIndex ??
              occupied.findIndex((s) => s.participantId === p.id),
          })),
        };
      }
      function playersMetadata(sessionId) {
        let data;
        if (ports.hostGameClient?.snapshot?.sessionId === sessionId && ports.hostRoomId) {
          try {
            data = roomPresence(ports.bridge().roomService.snapshot(ports.hostRoomId));
          } catch (_) {}
        } else if (ports.clientGameClient?.snapshot?.sessionId === sessionId)
          data = ports.clientPresence || roomPresence(ports.clientRoom);
        return data?.participants.filter(p=>p.playerIndex>=0).map(p=>({...p,name:p.nickname,network:true}))||[];
      }
      function playerMetadata(sessionId,index){
        return playersMetadata(sessionId).find(p=>p.playerIndex===index)||null;
      }
      function notifyPresence(room) {
        if (room?.phase !== 'playing') return;
        const data = roomPresence(room);
        for (const item of ports.connectedHostPeers) {
          if (!item.roomConnection?.participantId || item.peer?.channel?.readyState !== 'open')
            continue;
          try {
            item.peer.channel.send(JSON.stringify(data));
          } catch (_) {}
        }
      }
      function renderPresence() {
        const shell = $('.table-shell.network-game');
        if (!shell || shell.dataset.mode === 'history') return;
        let data;
        if (ports.hostAuthority && ports.hostRoomId) {
          try {
            data = roomPresence(ports.bridge().roomService.snapshot(ports.hostRoomId));
          } catch (_) {}
        } else if (ports.clientGameClient && ports.clientPresence?.roomId === ports.clientRoom?.id)
          data = ports.clientPresence;
        if (!data) return;
        const available = data.participants.some(
          (person) => person.role === 'table' && person.connected === true,
        );
        const mounted = ports.hostMount || ports.clientMount;
        const identity=JSON.stringify(data.participants.filter(p=>p.playerIndex>=0).map(p=>[p.playerIndex,p.id,p.nickname,p.avatar,p.role,p.bot,p.botSettings,p.local,p.isHost,p.connected,p.hasConnected,p.replacement]));
        if (mounted && (tableAvailability.get(mounted) !== available || rosterIdentity.get(mounted) !== identity)) {
          // Store first: rendering can call presence again. Identity belongs to
          // the common card renderer, never to this status adapter.
          tableAvailability.set(mounted, available);rosterIdentity.set(mounted, identity);
          mounted.render();
        }
        const controls =
          (ports.clientGameClient || ports.hostGameClient)?.snapshot?.playerControls || [];
        for (const p of data.participants) {
          for (const panel of shell.querySelectorAll(
            `.player-panel[data-player-index="${p.playerIndex}"]`,
          )) {
            const control = controls[p.playerIndex],
              label = control?.bot ? 'Временный бот' : control?.away ? 'Отошёл' : '',
              old = panel.querySelector('.temporary-player-control');
            if (old?.textContent === label) continue;
            if (!label) {
              old?.remove();
              continue;
            }
            const badge = old || document.createElement('span');
            badge.className = 'temporary-player-control';
            badge.textContent = label;
            badge.setAttribute('role', 'status');
            if (!old) (panel.querySelector('.player-label') || panel).appendChild(badge);
          }
        }
        const status = shell.querySelector('.table-status');
        if (!status) return;
        let line = shell.querySelector('.network-presence');
        if (!line) {
          line = document.createElement('div');
          line.className = 'network-presence';
          line.setAttribute('role', 'status');
          line.setAttribute('aria-live', 'polite');
          status.after(line);
        }
        const players = data.participants.filter((p) => p.role === 'player');
        const connected = players.filter((p) => p.connected).length;
        const value =
          '<span class="network-presence-count">' +
          globalThis.PlayroomMessages.text('ui.network-ui.77c8e957f165') +
          connected +
          globalThis.PlayroomMessages.text('ui.network-ui.e029cc4b39ce') +
          players.length +
          '</span>' +
          players
            .filter((p) => !p.connected)
            .map(
              (p) =>
                '<span class="network-person ' +
                (p.connected ? 'online' : 'offline') +
                '">' +
                '<i class="network-person-dot" aria-hidden="true"></i>' +
                ports.esc(p.nickname) +
                (p.isHost ? globalThis.PlayroomMessages.text('ui.network-ui.32c4ccc5277d') : '') +
                (p.connected
                  ? ''
                  : globalThis.PlayroomMessages.text('ui.network-ui.111a4e391195')) +
                '</span>',
            )
            .join('');
        line.hidden = connected === players.length;
        if (line.dataset.content !== value) {
          line.dataset.content = value;
          line.innerHTML = value;
        }
      }
      function showDisconnectBanner() {
        if (!ports.clientPeer || !ports.clientRoom) return;
        const shell =
          document.querySelector('.table-shell.network-game') ||
          document.querySelector('.room-setup-modal .lobby-shell') ||
          document.querySelector('.network-resume-card');
        if (!shell) return;
        if (shell.classList.contains('network-resume-card')) {
          shell.querySelector('.network-reconnect-banner')?.remove();
          return;
        }
        const state =
          ports.clientRecovery?.state || (ports.clientConnected() ? 'connected' : 'connecting');
        let wrap = shell.querySelector('.network-reconnect-banner');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'network-reconnect-banner';
          wrap.setAttribute('role', 'status');
          shell.appendChild(wrap);
        }
        wrap.hidden = !ports.clientRecovery?.report().notice;
        if (wrap.dataset.state === state) return;
        wrap.dataset.state = state;
        wrap.innerHTML =
          '<span>' +
          ports.esc(state === 'invite' ? 'Нет связи' : ports.connectionLabels[state]) +
          '</span>' +
          (state === 'invite'
            ? root.PlayroomGameScreen.iconButton(
                'data-net-action="reconnect"',
                'Переподключиться',
                'reset',
              )
            : '');
      }
      return { roomPresence, playerMetadata, playersMetadata, notifyPresence, renderPresence, showDisconnectBanner };
    },
  };
})(globalThis);
