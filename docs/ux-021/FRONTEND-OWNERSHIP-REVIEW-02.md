# Frontend ownership review 02

2026-11-02, current local working tree. **Read-only source audit**, not a 0.21 goal acceptance and not browser/device evidence. The root and UI owners were editing A10/A11 concurrently; references identify the code read in this pass. No runtime source, tests, cloud/provider state or protocol was changed for this audit. No new harness or test suite was created.

Basis: `GOAL.md` (navigation, connected parent context and late-response requirements), `SURFACE-STACK.md` and `ACCEPTANCE-MATRIX.md` A01/A04/A10/A11/A16–A32/A36. Source inventory covers all non-vendor `app/**/*.js`; actual control-flow review is explicitly listed below. A text search selected candidates; it is not verification of those candidates.

## Актуализация после адресных исправлений

Ниже сохранён исходный snapshot findings, а не текущий список открытых дефектов.
P1 export/import, appearance, catalog completion и удаления закрыты последующими
implementation/final-code evidence; Social/notification/avatar ownership также
перенесены на общий registry. Последний оставшийся TutorialSettings P2 подтверждён
реальным RED и исправлен: own origin/profile/scope, поздний reset не меняет другой
frame, child Escape не принимает underlying offer. Existing case Chromium/WebKit
по1/1; [TUTORIAL-OWNERSHIP-ACCEPTANCE.md](TUTORIAL-OWNERSHIP-ACCEPTANCE.md).
Текущий общий gate — COMPLETION-AUDIT.md, без переноса прежнего общего PASS.

## Actionable findings

No new P0 private-state disclosure or authority bypass was established by this bounded frontend pass. The following **P1** control-flow gaps remain at this snapshot:

1. **File export uses another surface and closes its foreground.** `app/save-transfer-ui.js:8,22–25`: no retained frame. After `portableSource()` it reads the global include-pack checkbox; after `create()` it downloads and calls unscoped `closeModal()`. Export A → Back → open export/panel B → release A can read B’s option and close B. Fix: retained export frame/operation, capture includePack before any await, invalidate on disposal and guard before download/error/close. The host-only portable source remains behind its existing authority port.
2. **Import lifetime and room fence do not survive preparation.** `app/save-transfer-ui.js:9–16,26–35`: global `.save-transfer-modal` considers suspended or newer surfaces current. The active-room check is before awaited preparation only; installation receives no existing guard port. Back/root navigation or a newly entered room during prepare/install can still install, paint a different error node or reset the entire newer journey. Fix: per-import frame/generation and target identity; invalidate through onDispose, guard after prepare and through `T.install`, and recheck room activity. Local imports are device data and should not gain an arbitrary cloud-account dependency.
3. **Appearance Apply discards the parent journey.** `app/appearance-ui.js:40–59`, especially51: `closeModal(true)` resets all connected surfaces. Game settings → Appearance → Apply loses the original settings/game-context return rather than popping its own panel. The gallery also has global interactive queries for tabs/sections/skin targets and no retained frame. Fix: own gallery frame/draft lifetime and normal scoped Back after explicit apply. Keep document-wide passive palette/avatar refresh in `appearance-web.js`.
4. **A background pack completion can render Hub over a newer game.** `app/pack-manager.js:165–171,190–220,253–255` calls onChange after waits; `app/app.js:1269–1276` callback unconditionally calls `renderHub()`. Back during install → start/enter a game → old installation completion can replace its game DOM even though the pack manager itself refuses reopening a suspended/disposed modal. Fix root callback to refresh models and only repaint the current hub; fence destructive deletion after waits if an active room appears.
5. **Root save deletion/bulk cleanup can overwrite or include a newer session.** `app/app.js:312–325,338–349`: old delete completion unconditionally sets Hub/reset/navigation. Bulk cleanup checks room activity before awaiting the network archive list, then enumerates local records afterwards: a new save started during that wait can be included. Fix fixed target snapshots, renewed activity/owner guards and no late foreground transition. The root owns these functions; this audit did not edit them.

The save-transfer fixes are assigned to the code owner after this report. Root owns the deletion/catalog callbacks. Appearance and notification follow-ups require their current owner’s lease.

## Other concrete gaps, P2 / migration observations

- `app/quick-reactions.js:10–16,41` accepts a community/lobby target just because it exists. `ChatNotifications:22,28` treats `listMessage() === true` as presentation delivery and skips its banner. A retained hidden/inert community row under another chat can therefore receive a body-level bubble and suppress the intended visible banner. Require a visibly active target (not inert/hidden, nonzero bounds) before claiming in-list delivery; target bubbles must hide/cancel when their surface suspends. Counters/read ACKs are separate and no false read was established here.
- `app/social-ui.js:10–20,23–43` still finds the first friends dialog globally; `execute()` has no per-show/identity completion fence for error/notice. Search result assignment has a generation guard and the service rejects foreign-account data, but a late error can paint a newly opened friend-search view. `community-ui.js:66,89` similarly lacks an operation generation fence/reset for global busy/error while its data refresh itself is guarded. These are not claimed as server authorization flaws.
- `avatar-picker.js:4–13` remains an independent host (explicitly noted in Surface Stack). It does not know when its requesting frame disappears. Local-profile/bot callers capture their form, while the legacy global avatar callback in `app.js:1079–1083` uses the current room. Add a caller-current predicate and close on owner disposal before migrating this exception; do not blindly bind device avatar choice to cloud account identity.
- `tutorial-settings.js:25–29` still finds a global settings checkbox after confirmation and searches any learning-intro node. Its queued offer correctly refuses an existing modal. Make future learning writes/close scoped to the originating view; no transport/secret mutation exists here.
- `pack-manager.js:132–137` passively patches a retained owner and restores disclosure state, which is appropriate. Focus/scroll restoration should require active ownership; currently connected suspended nodes can enter restoreView. The more serious navigation callback is P1 above.

## Safe global work versus dangerous interaction

Global lookup is not itself a defect. The following inspected uses have a different responsibility:

- `appearance-web.js:25–63`: document palette variables, theme-color, existing asset/avatar repaint. These are intentionally device-wide passive presentation updates; they do not select another account or navigate.
- `push-ui.js:8,9–53,74–107`: shared notification controls are passive labels. Configuration, toggle, worker binding and explicit pending-target navigation retain generation/account guards. Explicit Push tap navigation is an authorized foreground action, unlike a background poll. Physical delivery is outside this source audit.
- `update-dialog.js:15–27` and `pwa.js:81–121`: one global worker/update model paints an existing updates surface; it does not open one. Worker identity prevents an obsolete download worker replacing a new build. Root `showUpdates()` refuses unrelated modals. No new P1 update ownership issue was established; downloading and accepting a reload are separate deliberate actions.
- `network-presence.js:57–174,176–209`: public presence/status labels on the mounted scene or retained lobby are passive. No forced root/modal opening or read acknowledgement occurs there.
- `ChatActivity`, DM/room controllers and `GameChatPanel`: active/inert/read and generation/provider checks remain in the inspected paths. Existing 13-checkpoint RTC evidence is useful prior evidence; it was not rerun or re-labelled as a new acceptance check in this audit.
- `game-menu.js`: independent layer has scene identity and root-modal observers which close it on replacement; it restores inert state and is not equivalent to a stale generic modal selector.
- `connection-progress.js`: freshly re-read after UI’s A11 freeze. Explicit owner marker, active compatible target adoption and retired cancellation prevent an old attempt adopting a new placeholder; updates of the owned retained node are passive. Existing 500ms/ICE behavior is separately tested by the UI owner.
- `upgrade-ui.js`: deliberate startup migration prompt uses a separate native modal with cancellation disabled. Its export is read-only archive export and acceptance is explicit; it is not an ordinary contextual panel.

## Actual review coverage and the old “about20 modules” estimate

The earlier number was an estimate, not an enumerated completed migration. There are **69** non-vendor application JavaScript files in this tree. The real ownership-bearing modules include already-migrated private controllers, independent overlays and harmless shared presenters; counting every selector as an outstanding migration would be misleading. This pass records concrete source paths rather than claiming that every file is now accepted.

Control-flow paths read throughout the following modules (templates were inspected for ownership, not for visual fidelity):

- `app/appearance-ui.js`
- `app/appearance-web.js`
- `app/avatar-picker.js`
- `app/save-transfer-ui.js`
- `app/update-dialog.js`
- `app/upgrade-ui.js`
- `app/tutorial-settings.js`
- `app/temporary-bot-ui.js`
- `app/push-ui.js`
- `app/pwa.js`
- `app/remote-catalog.js`
- `app/pack-manager.js`
- `app/community-ui.js`
- `app/community-order-ui.js`
- `app/social-ui.js`
- `app/hub-action.js`
- `app/chat-notifications.js`
- `app/chat-activity.js`
- `app/ui-feedback.js`
- `app/quick-reactions.js`
- `app/reaction-view.js`
- `app/first-turn-guide.js`
- `app/room-password.js`
- `app/rulebook-view.js`
- `app/game-menu.js`
- `app/game-chat-panel.js`
- `app/friend-profile-ui.js`
- `app/connection-progress.js`

Focused / inherited scoped inspections, with explicit limits:

- `app/app.js`: 165–188, 310–350, 508–579, 838–886, 982–1002, 1075–1088, 1263–1282: root surfaces, data deletion, settings/profile/update and pack callbacks.
- `app/account-ui.js`: 1–83: retained account surface, auth continuation, logout and subscriptions.
- `app/chat-ui.js`: 1–107: ownership/read/draft/send/return controller paths; large templates inspected for owning host, not visual fidelity.
- `app/room-chat-ui.js`: 1–55, 74–97: provider/room/participant identity, reads, panel mount, captureReturn and delegated actions; send body not independently re-reviewed here.
- `app/group-ui.js`: 1–47, 51–94: per-view frames, account generation, membership reads and actions; loadFriends internal block not independently re-reviewed.
- `app/cloud-saves-ui.js`: 1–85 in A29 review, current125–166: generation/confirmation/finishOperation and owned Data/detail frames; latest summary markup remains root-owned.
- `app/shared-views.js`: 1–70, 94–128, 234–236, 310–336: shared modal frames, suspend/queue/pop, document action gating and disposal.
- `app/network-presence.js`: 1–214: presence projection and passive mounted scene/reconnect labels.
- `app/lobby-network.js`: 104–249 plus earlier A10 review: owned entry/find/join/continuation/generation paths; A11 renderer concurrently updated by UI.
- `app/nearby-view.js`: current A12 implementation reviewed in its own delivery: local method state, cancellation/observer cleanup; not reread in full in this pass.
- `app/network-ui.js`: active-lobby/host/client redraw and A12 paths from previous scoped acceptance; no fresh full986-line re-audit.
- `app/game-screen.js`: classifySurface/confirmations are evidence from Surface Stack review, not a fresh full766-line review.

Inventoried/screened but **not independently reviewed in full** in this pass (no ownership or correctness PASS is assigned):

- `app/acoustic-pairing.js`
- `app/appearance-models.js`
- `app/appearance-startup.js`
- `app/chat-components.js`
- `app/chat-composer.js`
- `app/chat-state.js`
- `app/cloud-network.js`
- `app/friend-card.js`
- `app/game-feedback.js`
- `app/host-transfer-ui.js`
- `app/hub-presenter.js`
- `app/library.js`
- `app/lobby-view.js`
- `app/multiplayer.js`
- `app/network-client-history.js`
- `app/network-config.js`
- `app/network-invitations.js`
- `app/network-social.js`
- `app/pairing-presenter.js`
- `app/pairing.js`
- `app/qr-scanner.js`
- `app/qr.js`
- `app/session-client.js`
- `app/status-meter.js`
- `app/transports/local.js`
- `app/transports/message-port.js`
- `app/transports/webrtc.js`
- `app/version.js`
- `app/views.js`

Vendor implementations are excluded. Transport/pure model/asset modules were not silently treated as a UI acceptance result. Further network/animation model review is separate from this bounded surface-lifecycle audit.

## Verification status

This is source reasoning with exact trigger and correction paths. No new runtime/browser test was run for this report. Existing greens from earlier milestones remain scoped to those snapshots. Targeted regression work must cover held export/import/pack completion → Back/new foreground/room; settings → Appearance Apply → same parent; and inactive-list notification delivery. The audit neither accepts the whole goal nor authorizes production deployment or database migration.

## Follow-up: file transfer owner migration

After the read-only report, the root assigned `app/save-transfer-ui.js` and its existing browser test to this owner. Findings1–2 are addressed locally: per-view connected frame, disposal/operation guards, a checkbox captured before awaits, live network export identity, import activity checks after preparation and the existing install/archive transaction guard. Errors and close/pop target the retained owner; a cancelled chooser/result cannot open a new foreground. Device import remains independent of cloud account identity. A successful import pops only its own frame, emits `playroom:save-library-changed`, and retains a parent Data screen; root added the scoped count/usage listener.

Selected verification after UI fixed a concurrently introduced appearance script-order error:

- `node scripts/codex/test.cjs case/save-transfer-browser`: Chromium **3/3 PASS**, including actual cross-profile portable file/missing exact pack/replay, active host export and the expanded lifetime case.
- `PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/save-transfer-browser --name 'closing a pending import'`: WebKit **1/1 PASS**.

The lifetime case holds the source/serializer/preparation and a real library commit, exercises Back/new foreground and a newly active room, verifies no stale download/write/close, and confirms native file import returns the exact Data DOM with its count updated. Replay import still closes its database connection. `node --check` for the two changed JS/CJS files and `git diff --check` passed. Other findings remain with their assigned owners; these checks are not whole-goal acceptance.

## Follow-up: root deletion and pack operations

Findings4–5 are addressed by the bounded operation-capability implementation in `UI-OPERATION-CAPABILITIES.md`. Root single/network/bulk deletion captures owner/context and fixed IDs; guards now reach native IndexedDB writes/cursor continuations rather than stopping at the caller. Pack removal/quarantine and obsolete-version cleanup share these guard ports, with no-op defaults. A cancelled durable write leaves pack maps/catalog and stored save/archive records intact. Passive pack completion only repaints the current Hub, preserving its filters; it does not replace a newer game DOM or reopen a retired manager.

Selected existing regressions pass on Chromium and WebKit: `storage operation ownership:` **1/1 per engine** and `pack manager 0.21:` **1/1 per engine**; default pack cleanup unit **1/1 PASS**. They cover native-get/cursor abort rollback, held deletion → Back/new settings/new game, late archive scan, fixed bulk snapshots and a real SHA-validated install completing behind a newer game. The implementation note records exact files, commands, fixture correction and limits. This resolves those findings without accepting other owners' P1/P2 work or the whole release.

## Follow-up: inactive-list notification presentation

The first P2 bullet is addressed in `NOTIFICATION-ROUTING.md`: community list delivery now requires a connected active visible anchor with viewport/overflow intersection and hit-testing. A bubble retains its exact original anchor and is removed when that view hides, suspends, scrolls away or disconnects. Standalone community modal bubbles use their actual owner's computed layer plus one. Hidden-list delivery returns false so the existing banner route runs; a newer visible-list message removes a prior pending banner without a read acknowledgement.

Selected existing `community notification routing:` browser case passes **Chromium1/1 and WebKit1/1**, no page errors/native Supabase traffic/read ACKs. Active root, hidden/filtered/scroll-clipped rows, another real chat, child settings, group routing, repeat polling and actual standalone community modal layering are covered. Game/lobby bubble layers, backend/Push/seen policies and incoming payloads are unchanged. Other P2 findings remain with their assigned owners.

## Follow-up: friend search owner and identity

The `social-ui.js` half of the second P2 bullet is addressed in `FRIEND-SEARCH-IMPLEMENTATION.md`. Search/query/results/errors/operations now belong to a retained frame and account key/service generation; active-only handlers capture their payloads. Back/new window/account changes cannot receive old results/notices. Same-identity status updates preserve input/focus/selection, guest Auth returns the same form/query, and no friend request is replayed under a replacement account. Explicit search retry and incoming/outgoing/accepted states use named actions; profile navigation retains its original search parent.

Final selected existing `friend search ownership:` case passes **Chromium1/1 and WebKit1/1**, safe provider intercepted18/native0, pageerrors[]. Fresh six-state captures cover390×844/844×390 on both engines; the implementation note records visual corrections and boundaries. Only the search presenter, two scoped CSS rules and its appended existing browser case changed. The separate `community-ui.js` busy/error observation from that same audit bullet was not silently marked resolved.

## Follow-up: Community root/modal ownership

The remaining `community-ui.js` half of the second P2 bullet is addressed in `COMMUNITY-OWNERSHIP.md`: errors/busy/actions/query belong to a real root host or retained modal frame with account/service generation. Shared public metadata has its own identity/read ordering, so old operations cannot repaint or block a new view. Root passive patches keep native input/focus/selection; retired read preparation sends no seen ACK. Account replacement no longer automatically opens Community over another screen.

A18 now follows the approved hierarchy and removes the old icon toolstrip; secondary Refresh/Order sits in one quiet disclosure. Root-owned renderer/picker changes are explicitly recorded rather than attributed to this module. Final affected-file verification is Chromium5/5 and WebKit5/5, including previous search/group/notification cases and the new actual lifecycle scenario. New ownercase: intercepted26/native0/pageerrors[]/seen[]. Evidence and limits are in the implementation note. This resolves that bounded Community finding without accepting unrelated modules or the whole release.
