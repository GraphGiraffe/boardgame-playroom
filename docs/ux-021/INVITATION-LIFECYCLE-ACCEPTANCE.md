# A24: invitation lifecycle and fair background refresh

The existing `invitation badges and cached join actions expire in background without reading chat` case now passes **Chromium 1/1 and WebKit 1/1** through the real Auth/RPC adapters with a safe provider fixture. There are no page errors or native Supabase requests. The existing isolated `cloud-account-rls` case also passes **1/1** with the additional real-role SQL lifecycle assertions. No SQL source or production state changed.

## Card and counter contract

Both DM and group cache entries pass through these controlled server metadata phases:

| Phase | Authoritative state | Card action/state |
| --- | --- | --- |
| Active | `active` | Join action; invitation count present |
| Accepted | `joined` | «Приглашение принято»; invitation count removed |
| Current user became host | `joined`, current account is `roomOwnerId` | «Вы — хост» / «В комнату» |
| Host transferred away | `joined`, new `roomOwnerId` | Accepted card with action targeting the new owner, rather than the previous owner |
| Host offline | `offline` | «Хост не в сети», no Join; distinct from expiration/closure |
| Room closed | `expired` | Compact actionless state, no Join |
| Invitation expired | `expired` | Compact actionless state, no Join |

The original unread message count remains 1 for each conversation when the invitation count disappears. No chat is opened and no `read-messages` or `group-seen` request is sent during these transitions. Background refresh uses incremental reads with the cached message ID in `known`; missing bodies preserve the existing message text. The final explicit ChatUI opening verifies that an expired cache cannot show a stale Join action on its first paint. A persisted page lifecycle wake still polls metadata.

This is a provider-controlled cache/presenter proof. The preview mounts the real shared invitation presenter; it is not a claim that these screenshots came from physical devices or an actual RTC host transfer. The fixture advances its clock to exercise the existing 30-second metadata TTL without waiting in real time. Background counters still follow the existing polling path.

## Reproduced and fixed selection defect

Previously the refresh selected eligible chats in insertion order, capped at eight. At the existing five-second polling interval and 30-second TTL, the first 48 stable joined invitations could become eligible cyclically before entry 49 was selected. The new 49-entry gate reproduced **48/49 refreshed**, leaving the last closed invitation cached as joined.

`ChatNotifications.refreshInvitations` now sorts eligible chats by their oldest attempt before applying the same batch limit. Failed attempts keep their attempt timestamp and a retry flag. They remain eligible on the next poll, preserving the existing retry cadence, but cannot monopolize the oldest priority by repeatedly losing their timestamp. A generation fence prevents a late failure from updating a replacement account's check state. Batch size, successful-read TTL, poll interval, read acknowledgements and server policies are unchanged.

The final browser gate refreshes all 49 entries, removes the last stale action, and also verifies a new closed card progresses after eight other chats repeatedly fail. This latter phase guards against error-induced starvation. All of it occurs without opening a chat or marking a message read.

## Actual local SQL lifecycle

The existing handoff test now creates directed invitations through the real RPC, accepts one, and transfers the host through the existing offer/accept/seal/ready/commit protocol. Authenticated reads verify accepted state, offline-host state before commit, the recipient's new own-host state, and an observer card's updated owner after transfer. Room code/password continuity and prior authority checks remain.

A transactional room closure verifies that `expired` overrides accepted/current-owner state, availability becomes false, and the observer invitation counter decreases. Rolling the transaction back restores the room/card and leaves the existing later fixtures intact. These metadata reads do not change the actual chat read markers. The SQL test calls the public unread RPC; it does not relax the intentionally revoked internal helper's privileges.

Evidence: workspace `tmp_files/ux-021/invitation-lifecycle/{chromium,webkit}-report.json`, selected `{chromium,webkit,postgres}.log`, the red `chromium-red-starvation.log`, and seven card states in 390×844 and 844×390 per engine. This is local source acceptance; production/provider delivery and physical RTC remain separate.
