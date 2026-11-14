# A36: confirmations and asynchronous kick ownership

This is a bounded local acceptance record, not production/device approval or a claim that every possible destructive action was executed.

## Existing evidence reconciliation

The A36 matrix's former «all close/kick/logout/reset still to verify» wording understates current evidence. The designer's Logout/Reset/RoomExit/Stop **Cancel-only** captures are useful presentation evidence, but are not the only functional checks:

| Requirement | Existing source and acceptance |
| --- | --- |
| Common consequence panel, cancellation and retained context | `game-screen.js` confirmation captures parent, account generation and room/participant; Cancel/Close/Escape/disposal resolve false. `PANEL-STACK-IMPLEMENTATION.md`: native connected DOM, focus/selection/scroll, mixed owners, invalid parent and detached Accept in both engines. |
| Local/cloud/archive deletion, fixed targets, last-write ownership | `UI-OPERATION-CAPABILITIES.md`: actual `storage operation ownership:` Chromium/WebKit 1/1, native IndexedDB transaction/cursor cancellation, fixed bulk targets, new foreground game preserved; pack removal/background install separately addressed there. Cloud deletion/account replacement is covered in `FINAL-CODE-ACCEPTANCE.md` / `DATA-IMPLEMENTATION.md`. |
| Logout Cancel + actual Accept | Existing `cloud account: optional launch…` checks Cancel retains signed-in account; actual Accept changes to local and preserves local profile. Current source `account-ui.js` uses the shared handler/confirmation; account errors remain in its owned form. Do not equate this local provider fixture with real email/production Auth. |
| Stop Cancel + actual outcome | Existing local-stop lobby case preserves unfinished save/participants on Cancel and accepted stop; actual RTC game-overlay case proves current-owner Stop and both clients return to lobby. `UI-PLATFORM-REVIEW-03.md` and `PANEL-STACK-IMPLEMENTATION.md` retain their exact scope. |
| Reset Cancel + actual Accept + late return | `TUTORIAL-OWNERSHIP-ACCEPTANCE.md`: real confirmed tutorial reset works, cancellation preserves state, other pack untouched, held completion cannot change replacement/suspended settings (Chromium/WebKit 1/1). Global-settings form's independent designer proof remains Cancel-only; this record does not relabel it as an accepted destructive reset. |
| Close room | Ordinary actual Close helper is exercised in existing Unified/Network/room-context lobby cases; draft preservation on Cancel in room-name case. Root assigned the separately found late cloud-close metadata reset concern to UI; that separate change/result must be reconciled independently, not inferred from the kick fix. |

## Four reproduced asynchronous ownership failures

Only the existing `tests/lobby-layout-browser.test.cjs` was extended, with one selected case `kick ownership 0.21: held playing roster cannot remove a participant from a new room`. It uses a real network-mode Domino HostSession + bot and a spectator joined through the real RoomService. It does **not** fabricate a phase, Session or result DOM, and is not a physical two-phone/RTC packet test. Safe provider installation precedes page navigation.

1. After real playing→replacement-lobby roster collection finished, hold delivery to the confirmation caller. Close the room, create a new network room and join the same profile ID. Release: original code removed that participant from the **new** room (`red.log`, assertion false).
2. Hold the same completed collection, dismiss the retained room to Hub/Profile, then release. A room-only identity check still removed the participant from the parked room and could foreground its lobby (`park-red.log`). One initial fixture attempt accidentally enabled auto-start instead of manual start; it was corrected before this actual red was recorded.
3. Hold delivery of an actual `transferStore.load` read **inside** preparation, park via real `exitToMenu` and open Profile, release. Original preparation reopened the room itself, before any caller check (`store-load-red.log`, modal count 1 versus 0).

4. Hold a real local RTC request at the public `cloudHostPeer` admission-check port, leaving the actual old `hostTransferCalls` wait pending. Begin old `transferFreeze`, close its room, start a new network game, then release the old admission. The old helper selected mutable `hostAuthority` **after** its first wait and suspended the replacement Session (`freeze-first-await-red.log`, instrumentation true versus false). A first fixture attempt changed the raw RoomService mode without its normal renderer; bridge state was then synchronized through `renderLobby` before recording this actual red. This is a real local RTC admission-boundary proof, not a production cloud-policy test.

## Minimal boundaries changed

- `app.js` kick captures exact target ID, room, actor and account service/key/generation. It requires the same authoritative owner after waits. Playing→lobby is an expected transition; after preparation the actual room lobby must still be foreground. Only then does it capture the existing `captureUIOperation({account:true})`, and it passes the combined guard through removal and before final refresh. Cancelled/stale work neither renders nor reports a new-journey error; current genuine failures keep recoverable feedback.
- `network-ui.js` removal captures host room, actor, owner, cloud room and account/service generation before `room-person`. It checks before/after lookup, before local/cloud kick and before participant-user mapping cleanup. It uses captured IDs and actor. Other callers retain a default no-op optional caller guard; internal authority checks always apply.
- Preparation captures existing presentation generation, authority/client/mount objects, room/session IDs, actor and account. It checks before/after freeze/load/persist and before teardown/foreground. Old captured roster data may still finish saving; late work cannot destroy or replace another live mount/authority. The preparation releases its own fence while its captured owner is still installed, immediately before synchronous teardown. Its failure cleanup never clears another owner's fence. Authority's underlying release is bound to its own record and is already a no-op after disposal.
- `persistRecoveryRoster` guards only its late global status/error/toast callbacks; it preserves saving the captured old-room data. `leaveHostRoom` clears its own freeze flag synchronously at old-owner teardown, so a stale finally does not clear a new owner's fence.

- The common `transferFreeze` itself now captures room/authority/client/actor/account before **its first** wait, checks before selecting the captured authority and after every await, and returns a locally idempotent release. Only the same captured structural lease may clear the global freeze flag; cleanup still releases its original raw room/authority closure. Both lobby and playing branches use the same ownership checks. The earlier claim that an unguarded helper necessarily returned the original authority's thaw was incorrect: only a raw closure already obtained from the correct authority has that property. The first-wait red above established the missing selection fence, now fixed.

All `prepareRoster` callsites were read: kick handles cancellation; seat-choice actions already check their owned frame after await and report only while current; the old recursive `cycleRoomSeat` has no external callsite; served `room-leave` propagates cancellation to its requesting RPC and skips its subsequent kick. No protocol/schema, DDL, domain rules, global operation store or server authority policy changed.

## Final selected gate

Command: `node scripts/codex/test.cjs case/lobby-layout-browser --name 'kick ownership 0.21:'`; WebKit uses the existing `PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs`, browser-path and local library environment. Chromium final **1/1 PASS**; WebKit final **1/1 PASS**, both with native Supabase requests 0 and page errors []. The same case retains actual Cancel and adds recoverable adapter failure→explicit retry→actual intended network membership removal, plus actual hotseat bot removal. Native Supabase requests 0 and page errors [] are asserted. JS syntax and scoped `git diff --check` passed.

Artifacts: `tmp_files/ux-021/kick-ownership/{red,park-red,store-load-red,freeze-first-await-red,chromium-final,webkit-final}.log` and `source.sha256`. The initial post-room fix passed both engines, but final acceptance must use final logs after the internal-load and post-prepare capability changes. No build, deployment, database or live provider operation.

The common freeze helper additionally requires the existing actual lobby and playing handoff cases: literal `host offer 0.21` and literal `live game transfer to spectator`, separately in Chromium and WebKit. Their final terminal logs are stored in the same evidence directory; no zero-selected regex run or unrelated motion suite substitutes for them.

Final common-helper affected gates: **Chromium 3/3 and WebKit 3/3**, counting the kick ownership case, actual lobby handoff and actual playing spectator handoff separately. Each runner selected exactly 1/1. Lobby includes real acceptance after decline/cancel; playing includes transfer back and real bot completion. Logs: `{chromium,webkit}-{lobby,playing}-handoff.log`, `acceptance.json` and final source hashes in the evidence directory. Root independently reviewed the final captured-authority selection and release ordering; no additional source change followed these gates.

## Subsequent dead-handler cleanup

The unused, self-recursive `cycleRoomSeat` was subsequently removed. Before
removal it had no external callsite; actual choices still use `showRoomSeatChoices`.
Exact subtraction from the prior candidate source ZIP reproduced the current
app.js, and all other runtime hashes stayed unchanged. No functional check above
is relabelled as a new run; see LOCAL-CANDIDATE.md for the new build/SHA/ZIP.
