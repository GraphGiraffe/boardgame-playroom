# A22: permitted full-history search

Local source delivery only. No production database, account, message or Push provider was contacted or modified.

## Request and result

The existing authenticated `playroom_online` RPC accepts:

```json
{"p_action":"chat-search","p_data":{"userId":"peer UUID","query":"ёжик","before":"9007199254740994"}}
```

For groups use `group-search` and `groupId`. `before` is optional and exclusive; it is a positive decimal PostgreSQL bigint ID. The query must be a JSON string, trimmed to 2–200 characters. This is a literal case-insensitive substring search; `%`, `_`, backslashes and quotes have no wildcard or SQL syntax meaning.

```json
{"messages":[{"id":"9007199254740993","at":"2026-11-02T00:00:00Z","mine":false,"kind":"message","body":"Ёжик","authorId":"sender UUID","nickname":"Игрок"}],"hasMore":false,"nextBefore":null}
```

Results are newest first, at most 40. The server fetches one extra result to report `hasMore`; when true, `nextBefore` is the last returned ID. IDs stay strings. Results contain only permitted ordinary message bodies and sender display identity. Invitation metadata, secrets, read receipts, attached reaction state and quoted text are excluded. There is no invented total count. The read capability is `features.search === true` on the existing chat/group read response.

DM access uses the exact current account/peer pair, including existing stranger conversations. Group access requires current membership in an open group and `id > history_after`; the final body query rechecks these conditions after the abuse-counter operation. Search never writes membership, history/read boundaries, message records, Push acknowledgements or unread counters.

## Rate, account and cache boundaries

DM and group search share a private, atomic fixed-window quota of 30 requests per account per minute. One row per account stores only its auth user ID, window start and a saturated count; auth deletion cascades. RLS is enabled and all direct client privileges are revoked. The internal definer helper is also revoked; the existing authenticated RPC is the public entry. No query strings, target IDs, tokens or bodies are recorded in this bookkeeping.

A quota error returns `{"error":"rate-limit"}` from a direct SQL call so the abuse counter commits. The REST adapter already converts this to a typed error. The aggregate RPC converts it to its normal per-section error without raising and rolling back that section's counter. A different section still succeeds. Application read allowlists include both actions; they do not increment the community mutation revision. Search results are not retained in AccountSync's read cache. Its existing identity-generation fence rejects stale queued or in-flight results.

## Exact result navigation and bigint compatibility

For a validated decimal result ID use `after: (BigInt(id) - 1n).toString()` with the existing `chat` or `group-read`. Their canonical inner query orders IDs **ascending when `after` is supplied**, before applying the 80-row limit. Thus an existing, still-permitted target is included even if hundreds of messages follow it. The frontend must verify the exact string ID in the response; deletion or revoked membership/history access must show an unavailable result, never jump to an unrelated message. Search itself never marks a result read.

Cloud group `id` and `seq` are now decimal strings. Existing ChatState, community read actions, boundary comparisons, sorting and request cursors already use BigInt conversion. RoomChat's remaining read-acknowledgement comparison now also uses ChatState.number; numeric local RTC sequence values remain valid. There is no game wire change.

## Source rollout and prerequisites

1. Run the read-only [chat-search-preflight.sql](../../server/chat-search-preflight.sql) against the intended server as its owner. It must report UTF8 and ICU support. Current production support has **not** been checked.
2. For an existing compatible 0.21 chat baseline, owner-apply the updated [account-sync.sql](../../server/account-sync.sql), then [chat-search.sql](../../server/chat-search.sql). This publishes the aggregate allowlist before the read capability becomes visible. They are repeatable source artifacts with explicit transactions. Fresh installations obtain the same implementation through canonical `online.sql`.
3. Verify authenticated capability/search/error behavior before enabling it for users. Older deployed servers without `features.search` must retain the unsupported state; local source acceptance is not a production deployment.

The upgrade creates a deterministic ICU `und` collation and explicitly applies it to lowercasing. This fixes Russian and Greek casing even under a C database locale. It does not change a database default, existing column/index collation or other app sorting. The upgrade stops with an actionable prerequisite error if ICU/UTF8 is unavailable. PostgreSQL's [collation documentation](https://www.postgresql.org/docs/17/collation.html) describes the ICU build requirement and case conversion behavior.

The shared implementation is [chat-search-core.sql](../../server/chat-search-core.sql), embedded identically in all owner-applied RPC upgrades to prevent an older room-preview/chat upgrade from removing dispatch or capabilities. That internal fragment is not a separate owner rollout step. The isolated SQL case checks source parity and reapplication.

## Performance and evidence

Search uses the existing pair/group history indexes to restrict the conversation, then literal [`strpos`/`lower`](https://www.postgresql.org/docs/current/functions-string.html). It scans permitted candidates until it finds a capped page; an unsuccessful substring lookup can still scan a large conversation. This is not FTS or a claimed large-history performance benchmark. The [unique ID ordering and LIMIT](https://www.postgresql.org/docs/current/queries-limit.html), bounded page/payload and quota are explicit; a future measured workload can justify a search index.

Selected `node scripts/codex/test.cjs case/cloud-account-rls` passes **1/1** with real isolated PostgreSQL roles and repeatable migrations, full 95-message DM/90-message group histories, exact jumps beyond the last 80, literal special characters/quotes, ASCII/Russian/Greek casing, hidden history, departed/closed groups, third accounts and guests, private helper/table privileges, unchanged read/membership state, quota reset/shared final slot, aggregate errors and rollback. Adjacent bigint IDs above 2^53 remain distinct; marking the first group result read leaves the second unread. `node --test tests/account-sync.test.cjs` passes **6/6** for request batching, absence of search-result cache, unchanged mutation revision and late account rejection.

After the read-acknowledgement comparison change, the existing actual `game overlays 0.21:` local/RTC scenario passes **Chromium 1/1 and WebKit 1/1**, with no page errors and zero native Supabase requests. It retains the local menu/scene checks and A32 room/team delivery/hidden-read assertions. Its newly added local checkpoint now follows current hotseat behavior (direct Start, no network-only ready/auto-start controls); network startup waits only on the actual host/client pair. Evidence logs: workspace `tmp_files/ux-021/conversation-search/{postgres,rtc-chromium,rtc-webkit}.log`. Search frontend acceptance and the independent SQL review are separate from these backend checks.


## Independent lead review — 2026-11-02

The lead inspected the actual helper, authenticated wrapper dispatch, aggregate
allowlist and error handling, current application read classification, SQL fixtures
and recorded PostgreSQL/RTC results. Source review found no new access-control or
correctness blocker in this bounded contract. Search is restricted to the exact DM
pair or current group membership/history boundary; the final group query rechecks
access after the quota lock. The quota contains no query or conversation content.
The helper and its RLS-protected bookkeeping table are revoked from public/anon/
authenticated direct access; only the already-authorized RPC wrapper invokes it.
Search does not write seen cursors or retain results in the account cache.

The review also checked decimal-string IDs/cursors, capped pagination, literal
matching, after-ascending target navigation and identical embedded search core in
the owner-applied upgrade paths. Existing current logs show PostgreSQL1/1 and
AccountSync6/6; source/log review reuses these unchanged-source results rather
than claiming a second independent database execution. Real local RTC compatibility
was rerun separately after the BigInt acknowledgement comparison.

The rollout sequence above was clarified: extend the aggregate allowlist before
exposing the search capability, avoiding a temporary client-visible unsupported
aggregate action. Both steps and the target-server preflight remain required.
The real production database, its ICU capability and advisor output have not been
queried or changed by this review. Literal substring scanning is not an indexed
full-text-search performance guarantee.

Primary references checked for the review:
[PostgreSQL ICU/collation support](https://www.postgresql.org/docs/17/collation.html),
[Supabase database function permissions](https://supabase.com/docs/guides/database/functions).
The current Supabase changelog was consulted through its HTML index after the
Markdown endpoint was rejected by the web reader. No provider API or authentication
configuration is changed by this source-only feature.
