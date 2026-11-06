/* Room communication adapter; connection ownership stays in the network facade. */
(function (root) {
  'use strict';
  root.PlayroomNetworkSocial = {
    create(ports) {
      const reactionRelay = new root.PlayroomQuickReactions.Relay();
      const roomChat = new root.PlayroomRoomChat({
        store: () => root.PlayroomData,
        resolve: chatIdentity,
        reactionValid: root.PlayroomQuickReactions.valid,
      });
      function chatIdentity(roomId, personId) {
        const room = ports.bridge().roomService.snapshot(roomId),
          person = ports.participant(room, personId),
          snapshot = ports.hostGameClient?.snapshot;
        const occupied = room.seats
          .filter((s) => s.participantId)
          .sort((a, b) => a.index - b.index);
        const playerFor = (id) => {
          const i = occupied.findIndex((s) => s.participantId === id);
          return i < 0 ? -1 : (occupied[i].playerIndex ?? i);
        };
        const teamFor = (id) => {
          const p = ports.participant(room, id);
          if (p?.role !== 'player') return null;
          const player = playerFor(id);
          if (room.phase === 'playing')
            return (
              snapshot?.state.scene?.players?.find((p) => p.player === player)?.team?.id ||
              snapshot?.state.scene?.players?.find((p) => p.player === player)?.teamId ||
              null
            );
          const seat = room.seats.findIndex((s) => s.participantId === id);
          return (
            root.TabletopUI.helpers.teamFor(room.game.teamLayouts, room.rules?.preset, seat)?.id ||
            null
          );
        };
        const team = teamFor(personId),
          teamInfo =
            room.phase === 'playing'
              ? snapshot?.state.scene?.players?.find((p) => p.player === playerFor(personId))?.team
              : root.TabletopUI.helpers.teamFor(
                  room.game.teamLayouts,
                  room.rules?.preset,
                  room.seats.findIndex((s) => s.participantId === personId),
                );
        return {
          person,
          player: playerFor(personId),
          team,
          teamColor: teamInfo?.color || null,
          teamColorRole: teamInfo?.colorRole || null,
          allies: team
            ? room.participants.filter((p) => !p.bot && teamFor(p.id) === team).map((p) => p.id)
            : [],
          sessionId: room.phase === 'playing' ? snapshot?.sessionId : null,
          closed: room.phase === 'closed',
        };
      }
      function publishChat(roomId, entry, { bubble = true } = {}) {
        const cloud = root.PlayroomCloudNetwork?.roomId();
        if (bubble && cloud && root.PlayroomCloudNetwork.isHosting()) {
          const room = ports.bridge().roomService.snapshot(roomId),
            audience = room.participants.filter(
              (p) =>
                !p.bot &&
                p.id !== entry.authorId &&
                roomChat.visible(entry, chatIdentity(roomId, p.id)),
            );
          void root.PlayroomPushUI?.notifyRoom(
            cloud,
            entry,
            audience.map((p) => p.id),
            audience.some((p) => p.id === ports.bridge().participantId()),
          );
        }

        const deliver = (personId) => {
          try {
            const ctx = roomChat.access(roomId, personId);
            return roomChat.visible(entry, ctx)
              ? {
                  kind: 'room-chat-entry',
                  roomId,
                  entry: roomChat.project(entry, personId, roomId),
                  bubble,
                }
              : null;
          } catch (_) {
            return null;
          }
        };
        const local = deliver(ports.bridge().participantId());
        if (local) root.PlayroomRoomChatUI?.receive(local);
        for (const item of ports.connectedHostPeers) {
          const event = deliver(item.roomConnection?.participantId);
          if (event && item.peer.channel?.readyState === 'open') {
            try {
              item.peer.channel.send(JSON.stringify(event));
            } catch (_) {}
          }
        }
      }
      async function chatCommand(roomId, personId, command) {
        if (ports.hostTransferBlocked) throw Error('HOST_TRANSFER_BUSY');
        if (command.roomId !== roomId) throw Error('ROOM_CHAT_UNAVAILABLE');
        if (command.type === 'room-chat-seen') return roomChat.markRead(roomId, personId, command);
        if (command.type === 'room-chat-summary') return roomChat.summary(roomId, personId);
        if (command.type === 'room-chat-read') return roomChat.read(roomId, personId, command);
        const reacting=command.type==='room-chat-react';
        const result = await (reacting?roomChat.react(roomId, personId, command):roomChat.append(roomId, personId, command));
        if (result.created||result.changed) publishChat(roomId, result.entry,{bubble:!reacting});
        return roomChat.read(roomId, personId, {
          scope: command.scope,
          after: command.after ?? null,
          known: command.known || [],
        });
      }
      function chatContext() {
        if (!ports.bridge()) return null;
        const room = ports.clientRoom || ports.bridge().room();
        if (!room || room.transportMode === 'hotseat') return null;
        const id = ports.clientRoom ? ports.clientParticipantId : ports.bridge().participantId();
        if (!id) return null;
        return {
          roomId: room.id,
          participantId: id,
          roomName: room.name,
          game: room.game,
          connected: ports.clientRoom ? ports.clientConnected() : true,
          call: (command) =>
            ports.clientRoom
              ? ports.clientTransport.dispatch({ ...command, roomId: room.id })
              : chatCommand(room.id, id, { ...command, roomId: room.id }),
        };
      }
      async function relayReaction(roomId, participantId, command) {
        const room = ports.bridge().roomService.snapshot(roomId),
          person = ports.participant(room, participantId),
          snapshot = ports.hostGameClient?.snapshot;
        const access = ports.SessionAccess.resolve(room, participantId);
        const event = reactionRelay.accept(
          {
            sessionId: snapshot?.sessionId,
            player: access.viewer,
            allowed:
              roomId === ports.hostRoomId &&
              room.phase === 'playing' &&
              person?.connected &&
              access.role === 'player' &&
              snapshot?.state.status === 'playing',
          },
          command,
        );
        if (event) {
          try {
            const saved = await roomChat.append(roomId, participantId, {
              id: command.id,
              body: command.emoji,
              kind: 'reaction',
            });
            if (saved.created) publishChat(roomId, saved.entry, { bubble: false });
          } catch (error) {
            reactionRelay.recent.delete(command.id);
            reactionRelay.times.delete(access.viewer);
            throw error;
          }
          root.PlayroomReactionUI.receive(event);
          for (const item of ports.connectedHostPeers) {
            if (item.roomConnection?.participantId && item.peer.channel?.readyState === 'open') {
              try {
                item.peer.channel.send(JSON.stringify(event));
              } catch (_) {}
            }
          }
        }
        return { ok: true };
      }
      function reactionContext() {
        const room = ports.clientRoom || ports.bridge().room();
        if (room && room.phase !== 'playing' && room.transportMode !== 'hotseat') {
          const chat = chatContext(),
            me = room.participants.find((p) => p.id === chat?.participantId);
          return chat && me && !me.bot
            ? {
                sessionId: 'lobby:' + room.id,
                viewer: room.seats.findIndex((s) => s.participantId === me.id),
                allowed: chat.connected,
                send: (emoji) =>
                  chat.call({
                    type: 'room-chat-send',
                    scope: 'room',
                    kind: 'reaction',
                    id: root.crypto.randomUUID(),
                    body: emoji,
                  }),
              }
            : null;
        }
        const client = ports.hostGameClient || ports.clientGameClient,
          snapshot = client?.snapshot;
        if (!snapshot || ports.networkInMenu) return null;
        return {
          sessionId: snapshot.sessionId,
          viewer: snapshot.viewer,
          allowed:
            !!(ports.hostMount || ports.clientMount) &&
            snapshot.viewer >= 0 &&
            snapshot.state.status === 'playing' &&
            (!!ports.hostGameClient || ports.clientConnected()),
          send: (emoji) => {
            const command = {
              type: 'quick-reaction',
              sessionId: snapshot.sessionId,
              id: root.crypto.randomUUID(),
              emoji,
            };
            return ports.hostGameClient
              ? relayReaction(ports.hostRoomId, ports.bridge().participantId(), command)
              : ports.clientTransport.dispatch(command);
          },
        };
      }
      return {
        roomChat,
        chatIdentity,
        publishChat,
        chatCommand,
        chatContext,
        relayReaction,
        reactionContext,
      };
    },
  };
})(globalThis);
