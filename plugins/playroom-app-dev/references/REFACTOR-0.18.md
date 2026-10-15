# Refactoring 0.18: application contracts

Start from selected checkout docs/AUDIT-0.18.md, REFACTOR-0.18-TRACKER.md and REFACTOR-0.18-CONTRACTS.md. These distinguish implemented slices from pending work; this reference is a navigation aid, not a completion certificate. Published app/collection versions and active branches must be checked live.

## Boundaries

- Pure rules: core/model-runtime.js and pack domain modules. Canonical commands/events/result facts, no DOM/HTML, translated labels, storage, transport, ambient clocks or random sources. Explicit entropy/clock/ID ports belong at application boundaries.
- Application: Session/authority/CommandProcessor and repositories/transport orchestration; application/session-access.js is the room-to-session permission policy. It does not render or know game IDs.
- Presentation: authorized projections to serializable scene/metrics/effects/MessageRef; Web renderers alone own DOM/CSS/input. Filter private parameters before presentation, translation, HTML/aria, audio and replay.
- Current app/model-adapter.js bridges engineApi 3 to the old Session envelope during migration. Do not mistake this for a final architecture. Inspect actual private-event support before migrating a hidden-information game. Canonical Session/events/ID lifecycle, complete metric/result presentation and removal of old adapters remain tracked work.

Preserve every feature through the tracker: local bots/hotseat, roles, reactions, setup, input/scroll/focus, effects/minimum show time, privacy, history, saved library, pairing/recovery, pack management and publication. Use small coherent slices and update their status/evidence. An approved API break is allowed for 0.18: document full-update/export/notice/cutover and reject incompatible versions clearly. Final 0.18 must not carry a second legacy runtime; temporary migration adapters are explicit and removable. Released bytes remain immutable.

## Table and authority

Table = Spectator plus public actions by players. viewer=-1 controls data; actor controls a separately authorized command. Host-only connectTable grants come from authenticated room membership through session-access. Never derive permission from surface/table layout, a DOM button or a client-supplied role. Ordinary player connections cannot select actor. Commands from a Table must be public in their availability and arguments before execution, not only in their eventual result.

Hands remain visible as backs/counts, or faces in open-hand mode; public dice are shown. Battleship hides both private fleets during play. Private card choices/ship setup stay on personal devices. History is read-only, including nested model actions. Table ACK/history/effects stay public even when its command acts for a player. Commit before ACK; original actor/commandId/signature survive retries and host journal restore. The old receipts.viewer field currently stores executing actor, not public snapshot viewer; keep that temporary schema distinction explicit.

TicTacToe is the first migrated engineApi 3 pack with public network Table controls. Other packs need declarations during migration; off-turn public reactions need an explicit actor/UI contract. Do not assume all games support Table input. Preserve current limits of live reconnect versus full RTC shutdown/new invitation; same-device tests do not prove physical-device/NAT connectivity.

## Appearance and text

application/appearance.js and presentation/localization.js are portable. Builtin light/dark are immutable; custom presets clone a builtin or saved preset. Theme/skin changes that do not affect play are local, never game commands/history/room rules. Editor belongs in main menu; toolbar preset switching works during games/replay without remounting or losing selection/scroll. AssetResolver changes appearance, not semantic value/ID/privacy/geometry. Full material/skin migration is still tracked.

Text belongs in app or pack locale files as namespaced keys/params, not rules or command identity. Translate only permitted events; language/theme must not affect seed, legal actions or history. Use shared components/assets; renderer and game rules must not independently calculate results, tie-breaks or score labels.
