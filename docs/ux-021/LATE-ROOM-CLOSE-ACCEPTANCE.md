# A36: late room-close ACK retains the current room cache

## Reproduction and boundary

The existing `online invite 0.21: destinations, partial retry, share intent and lobby access stay scoped` case now holds the response to `PlayroomLobbyNetwork.closeRoom(A)`. While it waits, the existing controlled context/provider port supplies another room B; the real invitation UI loads B's settings and native link `#7777`.

Before the fix, releasing A's successful response unconditionally called `reset()` and erased B's accepted `active` metadata. Chromium reproduced this in 3.1 seconds; the isolated provider intercepted 22 requests and sent zero native Supabase requests. This is a client cache ownership defect, not a protocol or database failure.

The replacement context represents a guest room allowing invitations. That path reads Community settings independently while SocialService serializes the original close. Context replacement is explicitly controlled in the existing fixture; it is not evidence of real joining, host transfer, or backend close authorization.

## Narrow correction

Only `app/lobby-network.js` runtime changed:

- A single `roomGeneration` scalar advances when `reset()` retires the invitation/access cache. Existing `execution` advances for individual actions and is not a cache lifetime marker. A reset epoch also distinguishes empty cache lifetimes and A→B→A reuse of the same identifiers.
- `closeRoom()` captures the account/Social/Community service references, account revision, view identity, cache epoch, room key and cloud ID before awaiting its original close call.
- A successful response clears only a still-matching cache. Changed room/account/service/epoch/owner or accepted cloud metadata makes the local cleanup a no-op. The original remote close and its errors keep their existing semantics.

No authority, protocol, backend provider, SQL or global state store changed. The app caller's existing `leaveLobby` guard is preserved.

## Selected verification

The same existing case passes Chromium **1/1** and WebKit **1/1**, with unchanged timeout and all previous invitation/share/password/partial-retry/account assertions retained. The added checkpoints assert exact replacement metadata and native input identity after the held ACK, then verify that a normal matching close still clears its own cache. Error arrays are empty; the existing provider fixture asserts native Supabase requests are zero.

Commands:

```sh
node scripts/codex/test.cjs case/cloud-account-browser --name 'online invite 0.21: destinations, partial retry, share intent and lobby access stay scoped'
PLAYROOM_INVITE_ENGINE=webkit PLAYWRIGHT_BROWSERS_PATH=/tmp/playroom-webkit LD_LIBRARY_PATH=/tmp/playroom-webkit/deps/usr/lib/x86_64-linux-gnu node scripts/codex/test.cjs case/cloud-account-browser --name 'online invite 0.21: destinations, partial retry, share intent and lobby access stay scoped'
```

Evidence: `tmp_files/ux-021/late-room-close/chromium-red.log`, `{chromium,webkit}-final.log`, `{chromium,webkit}-invite-report.json` and `final-report.json`.

Frozen runtime SHA256: `ffebedf6bb7fbff591eaffd3ae31ec716c52140ae74dc4a4c9ef6a3c47c8f880`.
