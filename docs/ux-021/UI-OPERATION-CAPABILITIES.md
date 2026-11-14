# UI operation capabilities and durable deletion

2026-11-02, local dirty working tree based on `c0722bc`. This is a bounded P1 ownership fix, not whole-release acceptance. No production/cloud/provider operation was performed.

## Contract

`app/app.js` provides one internal `captureUIOperation({idle,account})` capability and injects it into PackManager. The capability snapshots the originating connected surface, screen/tab, actual local Session object/ID, local room/participant, and network room/participant/owner. `account:true` additionally snapshots account/recovery kind and service generation for network/bulk root operations. Local device deletion does not acquire an unrelated cloud-login dependency.

`current()` and `guard()` require the original active surface. `current({retained:true})` allows the originating connected parent while its own confirmation is above it; a disposed frame cannot become valid again. `idle:true` also refuses an active local/network room. Validity checks read current frame state without recursively asking the registry to prune surfaces. No target is reconstructed from the current DOM after a wait.

Single-save and network-save deletion guard after awaits and pass the same guard down to the durable boundary. Bulk deletion captures local IDs before the archive-list await and archive IDs before confirmation. A new save created during that list wait is excluded. Back/new tab/session/room invalidates the operation; an old completion cannot close another surface or navigate to Hub. Committed mutations still emit a passive `playroom:save-library-changed` event, including a partially completed batch that is subsequently cancelled; cancellation does not claim transactionality across separate saves.

Pack removals capture exact `{id,version}`, reference IDs, owner frame and opening generation before confirmation. The same capability protects linked-save deletion, pack removal and quarantine discard. Automatic old-version cleanup uses its original active-room/reference policy plus the operation guard before/after archive reads and at each durable removal. Explicit installation may finish in the background, but old UI completion cannot reopen/focus/toast a replacement journey. Root `onChange` refreshes sound/catalog models and only repaints Hub while actually on Hub; filters are preserved and a current game DOM is not replaced.

## Changed persistence boundaries

All options default to a no-op guard; stored formats, database versions and unrelated callers remain compatible.

| Boundary | Protection |
| --- | --- |
| `application/library.js` `persist` / `removeAsync` | Forward options into the storage transaction; guard before draft deletion. |
| `platform/web/data-storage.js` `transact` | Check before draft creation and inside each native IndexedDB `get.onsuccess`, immediately before `put`/`delete`; rejected transaction never publishes its draft map. |
| `core/packs.js` `_persist` / `remove` / `discardQuarantine` | Forward guard to durable commit; publish pack maps/catalog only after successful commit. A guard rejection never enters the apply-failure rollback path. Existing apply-failure restoration remains unguarded so cancellation cannot prevent restoration. |
| `app/pack-manager.js` storage adapter | Forward guard through DataStorage; retain explicit download/install/limits behavior and only protect obsolete cleanup. |
| `application/pack-update-cleanup.js` `run` | Fence archive-read continuation and forward guard to each removal. |
| `platform/web/session-store.js` `remove` | Guard before header deletion and every steps/receipts cursor continuation; failure aborts the whole transaction. |
| `app/network-client-history.js` `remove` | Guard before header deletion and every frames cursor continuation; failure aborts the whole transaction. |
| `app/network-ui.js` `removeNetworkArchive` only | Recheck after list/lock waits; forward guard into host/client deletion; check again before resume-token cleanup. No signaling, authority, room-close or wire change. |

## Selected evidence

The existing browser fixtures exercise actual application controls, actual pack SHA/parse/install and actual IndexedDB transactions. No new harness or cloud fixture was added.

- `node scripts/codex/test.cjs case/data-storage-browser --name 'storage operation ownership:'`: **Chromium 1/1 PASS**. The initial fixture attempt tried to replace a frozen API method and timed out; the corrected fixture replaces only the external list port for its held wait. The final case checks native-get cancellation, pack durable bytes/catalog/rules/maps retained, host/client cursor rollback, late list after Back, bulk fixed targets, and real single-delete Back followed by a new game.
- The same selected case with `PLAYWRIGHT_MODULE=/tmp/hod-webkit-playwright.cjs PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu`: **WebKit 1/1 PASS**.
- `node scripts/codex/test.cjs case/pack-update-notice-browser --name 'pack manager 0.21:'`: **Chromium 1/1 PASS**. Retains real import/install/quarantine/preference checks and adds queued removal → Back → different settings DOM, plus actual isolated remote install → Back → new game with the exact table node/save unchanged.
- Same selected pack case with `PLAYROOM_PACKS_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu`: **WebKit 1/1 PASS**. Both pack runs assert zero native Supabase requests and no page errors.
- `node scripts/codex/test.cjs case/domain-foundation --name 'pack update cleanup preserves referenced versions'`: **1/1 PASS**, proving the optional guard preserves existing default cleanup policy.
- Affected runtime/test syntax checks and `git diff --check`: PASS.

The latest engine-specific logs are retained under workspace `tmp_files/ux-021/operation-capabilities/`. The older broad DataStorage UI case was not run: its old navigation/storage-usage assertions are separate from this selected regression. Installation/bootstrap internals and multi-tab concurrent installation publication were not refactored. No physical-device/provider or entire-goal acceptance is claimed.

## Expected state transitions and room ownership

A confirmation that intentionally changes playing→lobby cannot keep the old
screen capability blindly. Capture immutable room/actor/account/authority before
its first wait, validate around preparation, then acquire the existing UI
capability from the expected returned lobby. A parked/replacement journey must
not acquire that capability or receive a final foreground refresh.

Capture an authority object before waiting for queued calls. Suspending whichever
authority is current after the wait violates the original intent. Fence release
is idempotent and belongs to its captured owner; old finally/error callbacks must
not clear another owner's flag. Dispose the old owner's flags synchronously when
leaving. Durable old-room saves may finish, but late status/toast callbacks cannot
change a new journey.

An ACK that retires room metadata must compare its original account/services,
room identity and cache lifetime before clearing. A successful old server request
does not authorize clearing a replacement local cache. See
[confirmation ownership](CONFIRMATION-OWNERSHIP-ACCEPTANCE.md) and
[late room close](LATE-ROOM-CLOSE-ACCEPTANCE.md) for actual RED→GREEN evidence.
