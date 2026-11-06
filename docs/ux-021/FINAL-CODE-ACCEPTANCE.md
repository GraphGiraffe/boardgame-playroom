# 0.21 code and backend acceptance

## Current gate after completion audit

Earlier remaining-work paragraphs below are dated review snapshots. The full
long-social case and retained group/RTC flows now pass; see LONG-SOCIAL-MIGRATION
and GROUP-CHAT-OWNERSHIP-REVIEW. Final known TutorialSettings ownership P2 has an
actual RED and a bounded fix with Chromium/WebKit1/1. Generated SQL now includes
the host-Push extension and exact helper/trigger checks: isolated PostgreSQL1/1.
TUTORIAL-OWNERSHIP-ACCEPTANCE.md and SERVER-ROLLOUT-MANIFEST.md provide provenance.
The combined handoff/bot/terminal/lobby trace also passes both roles/engines;
HANDOFF-COMPLETION-ACCEPTANCE.md states its TicTacToe common-pipeline limit.
Production/device/managed-service acceptance remains unverified; no global PASS
is inferred from these addressed findings. Current gate: COMPLETION-AUDIT.md.


Status: rolling local source review, 2026-11-02. UI fidelity is a separate acceptance track and has not been accepted by this review. No production deployment, Supabase mutation, test Push, or update announcement was performed.

## Reviewed boundaries

- Handoff receiver retries share the real pending consent result and durable server acceptance. No positive ACK is sent before the user decides; private preparation/activation requires accepted consent. Channel close cancels waiting decisions.
- Profile footer and account window share the same logout action: confirmation, dialog/owner guard, Push revocation, account service and guarded errors; auth footer updates through the existing identity event.
- Surface ownership is shared per modal host: push retains the original connected/inert parent DOM, Back restores native focus/selection/scroll, and reset/invalidation/disposal make capture tokens permanently dead. Destroying an owner cascades its dependent child panels; a new independent reset root survives the old owner. Private controllers query their retained frame, while interactive actions and read ACKs require the active surface. See `SURFACE-STACK.md`.
- Account credentials remain in adapters. Account-scoped service generations reject late responses, old-tab mutations and auth resurrection after logout.
- Chat body/reply drafts are saved on input and reply/cancel changes before modal removal, not only in an after-close callback. DM saves/returns use account key plus service generation; room/group saves/returns validate their provider identity. Successful late ACKs reconcile only the same account/conversation and matching payload, retaining newer text; captured nested-modal returns prefer the canonical draft so sent quotes do not reappear.
- Room chat ownership includes room ID, participant ID and provider kind. Stale read/send completions, polling and captured returns cannot reopen another participant's view. Reply drafts use the same conversation boundary.
- Room/team messages and attached reactions remain host-authoritative. Team visibility is checked before projection and live relay; reaction actor sets are reduced to counts/mine. Only the chosen successor receives private handoff archives, including chat state. Public Table has no impersonation capability.
- Replies reference a validated message in the same DM pair or available group/team history. Quoted body/author are derived by authority/RPC, not trusted from client input. Attached reaction state is separate from standalone composer emoji and creates neither a message nor a message Push.
- Cloud read capabilities gate new Reply/reaction controls. An old backend must not silently turn a reply into an ordinary message.
- A source upgrade transaction is available at `server/chat-actions.sql`; instructions and readiness limits are in `CHAT-ACTIONS-ROLLOUT.md`.
- Single-save cloud deletion retains its original account generation after a successful refresh notification and after delete acceptance; changing accounts at that boundary cannot delete or disable the replacement account’s binding.
- Cloud UI refresh and automatic upload jobs now retain account generation across waits. An old job cannot clear a new account's job or upload a previously queued batch under the new account. Restoring a discarded cloud dialog after account replacement closes stale metadata.
- WebKit first-control hang was localized to native PushManager.getSubscription before notification permission. The adapter returns no subscription until permission is granted, preserving explicit opt-in and existing granted restoration. Worker claim, offline caching and update activation remain enabled.

## Exact selected evidence

| Check | Result | Scope |
|---|---|---|
| `node --test --test-name-pattern='room conversation persists' tests/presence-transport.test.cjs` | PASS 1/1 | durable room chat, team filters, reply targets, desired reaction state, projected counts |
| `node scripts/codex/test.cjs case/cloud-account-rls` | PASS 1/1 | real isolated local PostgreSQL roles; repeatable baseline/exact chat and Push artifacts; DM/group authorization, read-before-enqueue/queued cancellation, host transition/state/expiry/member targeting, privacy and direct table denial |
| `node scripts/codex/test.cjs case/network-main-app --name 'team chat'` | PASS 1/1 | actual three-client RTC UI, attached reaction and reply, opposing team receives neither |
| `node scripts/codex/test.cjs case/network-main-app --name 'public Table over WebRTC'` | PASS 1/1 | actual RTC moves, public/private controls, self avatar propagation, stable game DOM, panel/draft/reply reopen, stale identity read, menu history |
| `node scripts/codex/test.cjs case/host-transfer-browser --name 'handoff storage stages'` | PASS 1/1 | IndexedDB private staging, reload fences, lost ACK receipts, later transfer back |
| `node --test --test-name-pattern='receiver shares pending consent' tests/host-transfer.test.cjs` | PASS 1/1 | duplicate waits, decline/close outcomes, single durable acceptance and private preparation denied before consent |
| `node --test tests/host-transfer.test.cjs` | PASS 7/7 before added receiver case | consent/durable preparation/fence order, drain pending commits, roles/seats, secret boundaries |
| `node --test tests/cloud-connect-flow.test.cjs` | PASS 9/9 | duplicate connect, cancel/retry/late finally, active-room preservation, timeout, closed room/reconnect and account replacement |
| `node --test --test-name-pattern='account changes\|another tab\|stopping during\|stop closes\|cloud RTC capability' tests/account-service.test.cjs` | PASS 6/6 | auth/social identity changes, cancelled signaling and peer creation, transient capability validation |
| `node --test --test-name-pattern='cloud save UI fences' tests/cloud-saves.test.cjs` | PASS 1/1 | old read/finally cannot replace new account job; deferred old upload batch discarded |
| `node --test --test-name-pattern='an account switch fences\|quota failure and cloud deletion\|delete requested during an upload' tests/cloud-saves.test.cjs` | PASS 3/3 | successful refresh emission switches account before deletion resumes; new bindings/policy untouched; ordinary delete and upload-then-delete preserve expected behavior |
| `node scripts/codex/test.cjs case/cloud-account-browser --name 'cloud message UX:'` (Chromium and WebKit fixture adapter) | PASS 1/1 each, final snapshot | native connected stack proof: DOM/listeners, textarea/rich selection, focus/scroll, replace, mixed owners, cascade/reset/invalid tokens; actual DM/group child-panel Back preserves form DOM, reply/reactions/drafts and held ACK through child push/pop; native Supabase requests 0 |
| `node scripts/codex/test.cjs case/cloud-account-browser --name 'profile identity follows'` | PASS 1/1 final snapshot | late503 close/reopen keeps new inputs/status untouched; ordinary error/retry/login, profile identity and offline return |
| `node scripts/codex/test.cjs case/cloud-account-browser --name 'optional launch'` | PASS 1/1 final snapshot | login/rename/profile root and Back focus; footer logout cancel/accept uses shared account handler, auth footer updates without tab switch, local profile retained |
| `node scripts/codex/test.cjs case/cloud-saves-browser --name 'account opt-in'` | PASS 1/1 before final structural UI rewrite | two devices, quota, upload/offline/retry/conflict/download, safe device/cloud deletion; Device/Cloud tabs |
| `node scripts/codex/test.cjs case/pack-update-notice-browser --name 'update all installs'` | PASS 1/1 before final structural UI rewrite | update retry/cleanup/preferences; Installed/Available tabs |
| `node --test --test-name-pattern='push subscription restoration' tests/pwa.test.cjs` | PASS 1/1 | no native query before consent; granted restoration and explicit subscribe |
| `node scripts/codex/test.cjs case/web-push-browser --name 'web push worker persists'` | PASS 1/1 | real worker/IDB notifications: app/account binding, duplicate/foreground handling, read ACK closes notification, read-before-delivery race, foreign origin denial |
| `node scripts/codex/test.cjs case/web-push-browser --name 'stale account config'` | PASS 1/1 | old config/late toggle cannot enable signed-out account; old target navigation cannot resume after logout/login of the same user; pending busy state resets |
| `node --test --test-name-pattern='game lifecycle push\|semantic UI audio\|ICE progress sends' tests/web-push.test.cjs` | PASS 3/3 | visible game/result suppression, foreground host no-focus behavior, distinct cues/preferences/deduplication, bounded diagnostics |
| `node scripts/codex/test.cjs case/pwa --name 'PWA update isolates'` | PASS 2/2 | waiting build isolation, activation, offline saved data, including missed controllerchange |

Additional final-snapshot real RTC evidence from the UI owner is saved in `tmp_files/ux-021/final-ui-rtc/report.json` and `final-ui-rtc-consent/report.json` (workspace artifact root is one level above the app repository). The current actual RTC report has 13 checkpoints and `errors: []`: self participant edit/save keeps the exact action node and native focus; real rules editing propagates a domain value with room/channel retained; shared reader → application settings → Back keeps reader DOM/scroll/game scene; a real incoming message remains unread while the participant panel suspends the connected game-chat dock; Back restores original dock/editor/scene, focus, selection, draft and scroll; replies/attached reactions, both handoffs and owner Stop returning both clients to lobby pass. The separate consent report checks passive receipt, Escape, explicit Push focus, decline and cancellation. These are functional acceptance evidence after the stack and active-lobby fixes, not a substitute for visual fidelity review.

Host room-state subscriptions, client background reconcile/roster/ready redraw and lobby ensure paths now check only the active lobby. They continue updating the current room model while an editor/participant panel suspends the lobby; returning to the active lobby refreshes its existing DOM. `ChatActivity.visible()` and quiet feedback use the active surface, so a retained underlay neither resets foreground navigation nor acknowledges unseen messages. The actual RTC unread assertion exercises this with another connected peer, not a stubbed visibility result.

The original WebKit catalog probe, with the actual original service worker and real locator clicks, passed 12/12 combinations (360×800, 390×844, 430×932, 844×390; list/2/3). This establishes that specific local WPE runtime interaction, not physical iPhone or production acceptance. At the review snapshot, all 59 modified/new runtime/test JS/CJS files passed `node --check`; later source edits require affected syntax checks.

## A12 Nearby follow-up

`NEARBY-IMPLEMENTATION.md` records the real two-phone step/method presentation and lifetime boundaries. Final selected browser cases pass 10/10 on Chromium and WebKit. Real Nearby signal exchange plus the existing 13-checkpoint room/chat/handoff acceptance passes on both engines with no page errors; scoped screenshots cover both orientations. An additional Chromium run passes 14 checkpoints with a third real peer joining through a delegated invitation and leaving cleanly before the original checks. The protocol/authority and online invite boundary remain unchanged. Physical phone camera/audio/NAT checks remain separate.

## A10 room preview follow-up

`ROOM-PREVIEW-CONTRACT.md` documents the new minimal `room-preview` contract and the pending source-only upgrade `server/room-preview.sql`. The request changes no room/admission/RTC state; only the existing shared attempt counter changes. The selected account-sync unit passes 1/1, and the real isolated PostgreSQL acceptance passes 1/1 with repeated exact migration, privacy/visibility/authentication/throttle and room-state invariance assertions. Existing `join-password` admission guards are unchanged. Production application is explicitly pending.

## Remaining frontend ownership audit and file transfer

`FRONTEND-OWNERSHIP-REVIEW-02.md` inventories the current69 non-vendor app modules and explicitly lists the source paths actually inspected, the remaining P1/P2 findings and the scope not re-reviewed. This is separate from acceptance of the whole release. The file-transfer follow-up now retains its own connected frame and checks operation/room identity after waits and through the existing archive precommit guard; cancelled export cannot read another window’s option, download late or close its foreground. Local imports are device data rather than an arbitrary cloud-account operation. Successful import returns the exact Data parent and updates its count/usage through a scoped mutation event.

Selected verification: `node scripts/codex/test.cjs case/save-transfer-browser` **Chromium3/3 PASS**; the same file selected by `--name 'closing a pending import'` **WebKit1/1 PASS**. Actual inter-profile file transfer, exact missing-pack recovery, replay, active host export/freeze release, delayed source/serializer/prepare/real commit cancellation, post-prepare room activity and retained Data count1→2 are covered. No page errors; syntax/diff checks pass. Source artifacts and screenshots remain in workspace `tmp_files/save-transfer-020`; no production or cloud mutation was performed.

## Remaining review work

- Final structural UI rewrite is ongoing; no old screenshot is treated as the accepted 0.21 design.
- Push/action matrix and semantic audio are documented in `PUSH-AND-FEEDBACK.md`; actual device/provider delivery is outside local source acceptance.
- Account modal late-response selected coverage is complete; the separate full account/social case remains owned by the UX acceptance track.
- Real device connectivity and actual provider delivery remain outside local simulation. The SQL artifact still requires a separately authorized production rollout.

## WebKit authenticated fixture boundary

The route-only designer profile fixture failed because its `context.route('https://*.supabase.co/**', …)` callback was not called after real Service Worker control: the observed Auth POST reached HTTP 400 with fake credentials. This is a Playwright/WebKit interception boundary, not evidence that valid production credentials fail. No successful login or cloud mutation occurred. Further route-only WebKit Auth runs were stopped.

The corrected existing reproduction keeps the real app worker, real account form and SupabaseAuth adapter, but replaces only the Supabase fetch port with fixture responses before native networking. It asserts **zero native Supabase requests**. The authenticated/guest profile passed at 390×844 and 844×390, with six destinations, the identity editor, no overflow and no page errors. Source/evidence are saved at workspace `tmp_files/ux-021/fidelity/profile-auth-fixture.cjs` and `profile-webkit-auth-evidence.json`; the four `actual-profile-*-webkit.png` files belong to the design acceptance track. No production authentication code or worker claim was changed for this fixture limitation.

The reusable boundary is `require('./tests/account-sync-fixture.cjs').installFetch(context, wrappedHandler)`. It reuses the existing virtual Route/aggregate RPC handler and returns `{intercepted, nativeSupabaseRequests}` counters. Install it before navigation; assert intercepted requests are nonzero and native Supabase requests are zero. The final WebKit profile run intercepted 4 requests and observed 0 native Supabase requests. Other resource requests retain native fetch and the actual worker remains active; this fixture must not be described as production Auth delivery evidence.

## UI operation capability follow-up

`UI-OPERATION-CAPABILITIES.md` records root/PackManager ownership and the backward-compatible guard path through Library, DataStorage, pack persistence, host journal and client archive deletion. Fixed bulk targets exclude saves created during awaited scanning; disposed confirmations cannot delete, close or replace a new journey. A guard rejection at the actual native write/cursor boundary preserves durable data and pack in-memory state. Background installation keeps the new game DOM and save unchanged; only stale cleanup/presentation is suppressed.

Selected existing browser cases `storage operation ownership:` and `pack manager 0.21:` pass **1/1 each on Chromium and WebKit**; the existing default-policy cleanup unit passes **1/1**. No page errors in these browser cases; pack fixtures assert zero native Supabase traffic. Source syntax and diff checks pass. This is local source acceptance for these operations, with no change to installation/bootstrap formats, signaling/authority or production state; broader UI/physical-device acceptance remains separate.

## Community notification route follow-up

`NOTIFICATION-ROUTING.md` records the corrected list-delivery visibility contract and portal layer ownership. Matching hidden/inert/offscreen retained community rows cannot suppress a banner. Existing bubbles stop following a view that is no longer presented; active standalone community modal delivery is genuinely above its own backdrop. A newer visible-list message removes an older banner without creating a seen acknowledgement.

Selected existing `community notification routing:` case passes **Chromium1/1 and WebKit1/1** after the final owner-layer change, with no page errors, native Supabase requests or read ACKs. Repeated polling does not duplicate presentation; other-chat drafts remain intact. Only `app/quick-reactions.js`, this routing part of `app/chat-notifications.js` and the appended selected browser case changed for this follow-up. No game/lobby layer, server, provider or production mutation was performed.

## A19 friend search follow-up

`FRIEND-SEARCH-IMPLEMENTATION.md` records the retained search frame, account key/service-generation fences, explicit guest login/readonly-search continuation and stable form patches. Late search/query errors do not overwrite a newer window/account; old authorized friend requests are not replayed as a replacement account. Incoming/outgoing/accepted controls are named and reflect the actual relationship, while profile Back returns the original form/native trigger focus.

Final existing `friend search ownership:` browser case passes **Chromium1/1 and WebKit1/1**, intercepted18/nativeSupabase0/pageerrors[] each, after the scoped CSS and accepted-incoming correction. Six state captures per engine at390×844/844×390 were inspected. Source/domain guards, server and the profile template remain unchanged. The separate community-global busy/error follow-up and full-goal acceptance remain outstanding with their owners.

## A18 Community follow-up

`COMMUNITY-OWNERSHIP.md` documents per-root/frame operation/error state and the separate account metadata cache. Actual passive catalog-driven Hub repaint retains the same Community input/content/focus/selection, while retired history preparation cannot send seen ACKs. Held responses and account replacement do not corrupt another foreground or replacement identity. The old icon toolstrip is replaced by approved named primary actions and quiet list maintenance; existing Notifications preferences retain their parent through the current child-shortcut contract.

The affected existing community file passes Chromium5/5 and WebKit5/5 after final runtime/CSS changes. Its new ownercase records intercepted26/nativeSupabase0/pageerrors[]/seen[], with actual picker Cancel/source scroll and explicit online creation/no invites. Ten state captures per engine cover390×844/844×390; lifecycle persisted events are simulation, not physical device certification. Root Hub/picker integration and the independently removed dead autoinvite path remain attributed to the root owner. No application service, schema, server, provider or production mutation was performed by this Community lease.
