# Common UI motion lifecycle — 0.21

Scope: application chrome, connected modal surfaces, game-chat drawer, native help popovers, message-action picker, incoming notifications, toast and host offers. Pack gameplay effects, physical iPhone/Safari gestures and production delivery are separate acceptance scopes.

## Runtime contract

- `PlayroomDOM.ModalController` disposes capabilities, callbacks and ownership synchronously. A normal Back/dismiss/restore may leave only the original inert, `aria-hidden`, noninteractive presentation in a separate exit layer. It is never an active registry frame or a read/seen surface.
- `retireVisual()` waits for the exact target's finite CSS exit animations, not descendant events. Cancellation, reduced motion, visibility changes and a duration-derived bounded fallback remove that exact layer. A late finish cannot remove another frame.
- Reset, replacement, disposal and invalidation remove private presentation immediately, including exits already in progress. A new modal flushes banner/picker exits before taking focus. Surface exits are below active modals; drawer exits are below the active drawer. Rapid child→parent retirement retains their visual order.
- Window capture blocks even programmatic input events from an exiting subtree before document command handlers. Native `inert` and pointer suppression provide the ordinary input boundary.
- CSS presentation selectors alias `#modal-root` with `[data-ui-surface-exit]` at the same specificity. Logical presence, body scroll locks, active/inert guards and provider queries retain their original scope.
- Screens use a short lateral transition; ordinary dialogs use a small fade/scale; panels slide from the bottom. Landscape game menu/chat slide from the right. Exit starts from the current displayed translate/opacity/scale, including interrupted entry.
- The game drawer returns its exact live DOM node. Room chat stores it separately from modal frame handles, preserving its original interactive/read guards during close/reopen.
- Native help keeps native popover, Escape and focus semantics. One visibility/opacity/scale policy retains its painting for a finite exit in every engine, without relying on the unsupported WebKit `overlay` transition. `beforetoggle` makes a closing popover inert and `aria-hidden` synchronously; reopening restores its exact authored attributes from a WeakMap. It keeps the same native DOM and reverses an in-progress transition. The custom reaction/message picker uses the shared retirement primitive.
- Press/release is shared by standard chrome actions, navigation/filter/view controls, favorite/visibility, account/saved rows and tabs. Transparent game launch targets animate their catalog card. Individual game-piece transforms and game animation engines are unchanged.
- `syncReducedMotion()` uses the existing application pace for boot, app setting changes, reset and live system preference changes. Explicit instant mode remains reduced even when the system returns to normal. Entering reduced mode flushes existing exits immediately.
- Toast retirement creates a new empty canonical `#toast`; its old original loses the ID and retains only its presentation until completion. No private markup is cloned. Host-offer decisions retire while still valid; protocol/channel invalidation is immediate.

## Reproduced defects and corrections

1. Shared panels and drawer were removed before any exit could run. Added the common visual-only retirement lifecycle.
2. A touch select opened options on pointerdown, allowing the same gesture to choose a moving option. Native mousedown now only prevents the native SELECT popup; the completed click/keyboard gesture opens the custom panel. Pointerdown is not cancelled: WebKit's measured touch sequence otherwise omitted the compatibility click entirely. There is no timer, synthetic click or engine branch.
3. A native tap on the game-chat SVG path was rejected because its decorative SVG has `aria-hidden`. Visibility now checks the resolved actionable button and its ancestors.
4. A system reduce→normal change left the body's reduced-motion class stale; settings reset also ignored system reduce. All paths now use the same pace-derived synchronizer.
5. Toast cleared its body before closing. It now retains its original content during the inert exit, with one canonical active ID and immediate replacement/private cleanup.
6. Host-offer consent was marked invalid before ordinary panel retirement. The panel now retires while valid, with pre-cleanup banner visibility captured; protocol cancellation still removes it immediately.
7. WebKit reported `overlay:auto` unsupported and removed a closed native popover before its CSS exit (`display:none`, no animations). Replaced the display/overlay dependence with the common visibility transition and a synchronous interaction boundary, rather than an engine-specific branch.

## Existing selected checks

No new harness or suite. Existing case timeouts remain unchanged; no forced clicks.

| Existing file / case title | Evidence |
|---|---|
| `pairing-methods-browser.test.cjs` — `nearby choice 0.21: shared panels retain the source and reject stale options` | Normal/reduced × desktop/touch; original selections and stale-option fences; entry, Back during entry, close/reopen, press/release, finite native popover close, rapid nested disposal, retired commands, reset flush. Controlled presenter/DOM fixture, no RTC/provider claim. |
| `lobby-layout-browser.test.cjs` — `game overlays 0.21: room context, native menu focus and resized RTC chat preserve the scene` | Actual RTC Domino/Ludo, existing room/team/privacy/retained-group checks; drawer normal/reduced × portrait/landscape, native launcher tap, exact reopened draft/scene, completed exit. Controlled provider, native Supabase requests zero. |
| `community-actions-browser.test.cjs` — `community notification routing: only presented list anchors replace banners and never mark messages read` | Existing delivery/read policy; native banner/toast dismissal and replacement; no passive remount; nav/filter/card press/release; app instant/system/reset preferences; private reset cleanup. Controlled provider, native Supabase requests zero. |
| `host-transfer-browser.test.cjs` — `host offer 0.21 shares the surface stack and restores the exact room chat` | Actual RTC offer banner entry; panel Back/decline exit; same native chat/editor/selection; cancellation disposes descendants immediately; spectator accepts handoff. |

Run each with `node scripts/codex/test.cjs case/<file-without-suffix> --name '<literal title>'`. WebKit uses `LAB_ENGINE=webkit` for pairing/lobby/offer; community uses the existing `PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs` adapter, with `/tmp/playroom-webkit` browser/dependency paths.

Reports/logs: `tmp_files/ux-021/nearby-choice-021/motion-*`, `ui-platform-audit/motion-rtc-*`, `notification-motion-*`, `host-offer-021/motion-*`. Final statuses and source hashes belong to the final motion manifest; historical RED logs are not acceptance evidence.

Final selected result: all four cases pass Chromium 1/1 and WebKit 1/1, **8 passes / 0 failures**. Error arrays are empty; the app cases record zero native Supabase requests. Final provenance, commands and accepted unchanged-route deltas are in `tmp_files/ux-021/ui-motion/final-report.json`; the frozen source manifest is `final-source.sha256.json` in the same directory. Pairing was rerun in both engines after the final mousedown change. RTC/offer routes use manual text pairing; notification routing does not open native help or network choices, so their documented later source deltas do not invalidate those assertions.

The root separately built `review-02-touch`, standalone SHA256 `fcd44791df76fd04a273fea82d5eb63bc333572a708485ec135ba9aa2db3cc49`; build/archive verification and exact artifact WebKit walkthrough remain the root's evidence, rather than claims from these source tests.

The existing source fixture serves source `index.html` and its actual source service worker. It does not accept `LAB_ARTIFACT`. The standalone build is checked separately by the root's existing artifact driver. No deployment or physical-device certification is implied.
