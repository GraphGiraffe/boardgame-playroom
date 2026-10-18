// Host-owned room-to-session permissions. No DOM, transport or game rules.
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.PlayroomSessionAccess = api;
})(globalThis, function () {
  'use strict';
  function resolve(room, participantId) {
    const person = room?.participants?.find(value => value.id === participantId);
    if (!person || person.bot) throw Error('SESSION_PARTICIPANT_UNAVAILABLE');
    const occupied = room.seats.filter(seat => seat.participantId).sort((a,b) => a.index - b.index);
    const indexes = occupied.map((seat,index) => seat.playerIndex ?? index);
    if (indexes.some(index => !Number.isInteger(index) || index < 0 || index >= occupied.length) ||
        new Set(indexes).size !== indexes.length) throw Error('SESSION_SEATS_INVALID');
    if (person.role === 'table') return Object.freeze({role:'table',viewer:-1,actors:Object.freeze(indexes)});
    if (person.role === 'spectator') return Object.freeze({role:'spectator',viewer:-1});
    const seat = occupied.findIndex(value => value.participantId === participantId);
    if (person.role !== 'player' || seat < 0) throw Error('SESSION_SEAT_UNAVAILABLE');
    return Object.freeze({role:'player',viewer:indexes[seat]});
  }
  function connect(authority, room, participantId) {
    const access = resolve(room, participantId);
    return access.role === 'table' ? authority.connectTable(access.actors) : authority.connect(access.viewer);
  }
  return Object.freeze({resolve,connect});
});
