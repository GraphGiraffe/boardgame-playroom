# A22: search completion while another conversation is open

The existing `full conversation 0.21:` browser case reproduced a lifecycle defect through real account/RPC adapters and the actual notification → DM interaction. A search response arrived while its connected search surface was suspended under the new DM. Back restored the same search/input DOM, but the response had been discarded and the search stayed in «Ищем сообщения…» with no hits. The selected red log is `tmp_files/ux-021/conversation-search/suspended-red.log` in the workspace.

The fix is limited to `app/conversation-search-ui.js`:

- Owned-valid state and active interaction are separate predicates. Query results, errors and busy state can settle on the same retained owned surface, while query/account/disposal request guards still reject stale work.
- Submission, input changes and pagination require the active surface before issuing RPCs. The existing detached/inactive form guard remains.
- A selected target may apply its authoritative history boundary while retained. It cannot call Back or commit a jump over the foreground DM. Its load ends with an explicit retry instruction; after returning, another click opens the target normally.
- An unavailable-group response clears its own search hits immediately. The parent-retirement callback is deferred until this search becomes active on the user's Back action. The restore listener is removed on disposal.
- Hit rows use the existing shared list patcher with stable message keys, preserving their nodes during passive state changes. The original query input remains connected.

The final existing A22 case passes **Chromium 1/1 and WebKit 1/1**, with zero native Supabase requests and no page errors. Added DM and group flows verify retained successful queries, enabled pagination after Back, interrupted target loads that preserve the foreground DM, and successful explicit target retries. A held forbidden group search also leaves the new DM intact, then retires the unavailable parent after explicit Back. Prior bigint target, history-boundary, revoked-group, query-length, rate-limit, draft/scroll and disposed-response assertions remain.

The fixture's completion observer delegates to the actual service call and only records settlement, so the response is known to have completed while search is suspended. It does not replace search results or trigger navigation. The new DM is opened through the actual inbox polling banner rather than synthetic surface markup.

Final selected logs: workspace `tmp_files/ux-021/conversation-search/suspended-{chromium,webkit}.log`. Source SHA256: `12cea806599e069055491b554cc7481c87fcc5f657b91606d3f543412cb5c09b`, also saved in `suspended-source.sha256`. The root independently reviewed that source's owned/active split, guarded target privacy preparation, explicit retry, deferred unavailability and disposal cleanup, with no additional blocker in that bounded review.

There are no RPC, SQL, protocol or production changes in this fix. Browser fixture evidence does not establish physical-device or production delivery behavior.
