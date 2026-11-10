# A10 room-code preview

Status: local source and isolated PostgreSQL verification only, 2026-11-02. **Production rollout is pending.** No live Supabase DDL or room operation was performed.

## Wire contract

Call `playroom_online('room-preview', {roomCode: '0123', password?: 'ABC234'})`. Existing share links may instead supply `{roomId: 'canonical-uuid', password?: 'ABC234'}`; selectors are mutually exclusive and have identical authorization. A malformed UUID returns typed `not-found` rather than a cast exception. A legacy room with no allocated code returns `not-found`, matching the existing Join guard, and preview never allocates its code.

A successful response contains exactly:

```json
{"id":"room-uuid","roomCode":"0123","name":"Комната","gameName":"Домино","ownerName":"Иван","hasPassword":true,"available":true}
```

Typed results are `{"error":"not-found"}` and `{"error":"rate-limit"}`. Missing/invalid/ambiguous codes, closed/offline hosts and inaccessible protected rooms all return the same `not-found` result. Missing authenticated identity retains `social:account-required`. Direct calls support existing authenticated guests; the existing account-sync aggregate continues to require a non-guest account.

Preview is **read-only for room state**: no membership insert, active lease extension, role change, RTC slot, invitation consumption or game mutation. Only the existing abuse counter changes. It shares the existing account budget of 10 attempts per minute with `join-password`, counting successful and failed attempts. An explicit Find then Join uses two requests; do not request preview on every keystroke.

The response contains no password, owner ID, private participant list, seats, game state, signaling payload, resume token or host lease timestamp. The RPC and read-only aggregate allowlists accept preview separately; `join-password` remains ineligible for aggregate reads. Account-sync only deduplicates concurrent previews, without persisting or caching password-bearing requests.

## Visibility and joining

Public or accepted-friend-visible rooms can expose this safe card and `hasPassword` before password input. An existing owner/member can read its room. A hidden/non-visible protected room requires the same valid password used for joining; its four-digit code alone cannot enumerate metadata. An explicitly unprotected room can be previewed by its known code without a password, preserving existing code entry behavior. Password input is normalized as in the existing join flow.

Preview grants no future admission. The separate explicit `join-password` call still checks the current password, unambiguous live room, host availability, room slots/member limit and admission policy. Closing the host or rotating the password between preview and Join can therefore make Join fail correctly. Unsupported old backends must produce an unavailable-preview state; never implement Find by calling Join as a fallback.

## Exact source-only upgrade

`server/room-preview.sql` is a repeatable transaction for the existing 0.21 online/chat baseline. It replaces only the canonical online RPC and account-sync function with their current source definitions and preserves their execute grants. It creates no room data, membership, new tables or new public helper. `server/online.sql` and `server/chat-actions.sql` carry the identical online RPC; the SQL acceptance case checks equality to prevent an older chat upgrade from removing preview.

Review and apply the exact artifact to the intended project only after explicit production authorization. The ordinary assembled setup already reads the canonical files. Do not apply an unrelated schema bundle merely to enable preview.

The security review follows [Supabase function privileges and fixed search paths](https://supabase.com/docs/guides/database/functions) and [RLS identity boundaries](https://supabase.com/docs/guides/database/postgres/row-level-security). The existing authenticated RPC boundary and per-action row authorization are retained; no direct table grant was added.

## Selected local evidence

- `node --test --test-name-pattern='room discovery' tests/account-sync.test.cjs`: **1/1 PASS**; membership/discovery/preview coalesce, preview data is preserved, Join remains ineligible.
- `node scripts/codex/test.cjs case/cloud-account-rls`: **1/1 PASS**, actual isolated PostgreSQL roles. Repeated canonical/standalone upgrades, minimal exact fields, UUID/share-link compatibility and malformed/conflicting selectors, unchanged legacy rows without codes, closed/offline denial, hidden wrong-secret and guest denial, lowercase valid secret, public/friends visibility, offline rejection, unauthenticated/anon denial, aggregate preview without membership, shared preview/join throttle, and byte-for-byte room/member/peer-binding invariance across reads are covered. Existing Join and migration/privacy cases remain green.

Local source acceptance does not establish deployment readiness on the production project or physical-phone connectivity.
