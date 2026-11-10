/* Presence projection and presentation; no connection lifecycle ownership. */
(function (root) {
  'use strict';
  root.PlayroomNetworkPresence = {
    create(ports) {
      const $ = (s) => document.querySelector(s),
        tableAvailability = new WeakMap(), rosterIdentity = new WeakMap();
      const indicators=new root.PlayroomConnectionIndicators({onChange:()=>renderPresence()});
      root.addEventListener('pagehide',()=>indicators.close(),{once:true});
      function presented(data){
        const lost=!!ports.clientRoom&&!ports.clientConnected()&&!!(ports.clientRecovery?.error||ports.clientPeer?.pc?.connectionState!=='connected');
        const keys=data.participants.map(p=>data.roomId+':'+p.id);indicators.retain(keys);
        return {...data,participants:data.participants.map(p=>({...p,...indicators.project(data.roomId+':'+p.id,!(lost&&(p.isHost||p.id===ports.clientParticipantId))&&p.connected)}))};
      }
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
        return data&&presented(data).participants.filter(p=>p.playerIndex>=0).map(p=>({...p,name:p.nickname,network:true}))||[];
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
            root.PlayroomWebRTCTransport.send(item.peer.channel,data);
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
        data=presented(data);
        const available = data.participants.some(
          (person) => person.role === 'table' && person.connected === true,
        );
        const mounted = ports.hostMount || ports.clientMount;
        const identity=JSON.stringify(data.participants.filter(p=>p.playerIndex>=0).map(p=>[p.playerIndex,p.id,p.nickname,p.avatar,p.role,p.bot,p.botSettings,p.local,p.isHost,p.connected,p.hasConnected,p.replacement,p.connectionOffline,p.connectionRestored]));
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
        shell.querySelector('.network-presence')?.remove();
      }
      function showDisconnectBanner() {
        if (!ports.clientPeer || !ports.clientRoom) return;
        const shell =
          document.querySelector('.table-shell.network-game') ||
          document.querySelector('.room-setup-modal .lobby-shell') ||
          document.querySelector('.network-resume-card');
        if (!shell) return;
        if (shell.classList.contains('network-game')) { shell.querySelector('.network-reconnect-banner')?.remove(); return; }
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
