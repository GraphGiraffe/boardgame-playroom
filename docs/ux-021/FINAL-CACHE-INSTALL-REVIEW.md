# Bounded final review: group history cache and PWA installation

## Reproduced group cache defects

The existing A24 `invitation badges and cached join actions expire in background without reading chat` case was extended through real account/RPC adapters and actual GroupUI/ChatUI actions, with provider responses intercepted before native networking.

Two red checks demonstrated separate defects:

1. An actual group conversation loaded an allowed message and room invitation. After closing it, the controlled remote membership advanced `historyAfter` to 50. The background read returned that boundary, but the cache retained old IDs 40/50 because the response boundary was discarded before `refreshInvitations`.
2. The actual group profile → Leave → Confirm action, followed by accepting a new group invitation in the real DM UI, reopened the same group offline. Two rows from the prior membership appeared on its first paint.

The final fixes are limited to `app/chat-state.js` and `app/chat-notifications.js`:

- Background invitation refresh forwards `historyAfter`; the account-scoped group cache drops rows at or below the boundary and advances its read request cursor. This does not create a read acknowledgement.
- The existing successful `playroom:group-left` event replaces that group's in-memory record, clears its counters and removes its persisted entry through the existing data transaction port. Other chats and accounts are unaffected; cache/protocol versions do not change.
- Each background request captures the exact cache record it began with. Success/failure callbacks must still own that record as well as the account generation. A replacement record after Leave rejects an old membership's late response; the notification check entry is also retired.

## Final selected gate

**Chromium 1/1 and WebKit 1/1 pass**, with zero native Supabase requests and no page errors. The case preserves the seven A24 card states and the 49-entry/failure fairness checks. Its additional privacy steps verify:

- A background authoritative boundary removes old bodies/invitations without changing the seen-call count.
- Actual local group departure clears persisted history after the Leave RPC/UI transition completes.
- An old background group read is deliberately held before departure and released after accepting a stricter rejoin invitation while offline. It cannot restore the prior membership cache.
- The offline group's first paint has no old message rows. Explicit retry after reconnection loads only the newly permitted message.

Evidence: workspace `tmp_files/ux-021/invitation-lifecycle/privacy-{chromium,webkit}.log`, final engine reports with a `boundary` section, restricted-rejoin captures, and the red `chromium-red-history-boundary.log` / `chromium-red-rejoin-firstpaint.log`. The same selected case was repeated after the DM controller factory integration because the actual group invitation acceptance passes through that controller: **Chromium 1/1 and WebKit 1/1 pass**; logs are `privacy-dm-factory-{chromium,webkit}.log`. This is controlled local membership/cache evidence, not production or physical-device connectivity. Broader DM controller acceptance has its own track.

## Final initial-notification snapshot epoch

A final bounded extension holds the **initial** unread/group-inbox snapshot before a second successful GroupUI departure, then releases it after accepting a stricter new membership and returning to the profile. This is separate from the held metadata-refresh phase above. The red run restored the old invitation count to 1 after it should have stayed 0.

`ChatNotifications` now snapshots local per-group membership epochs at poll start and advances only the departed group's epoch on the existing successful Leave event. Stale group count rows are excluded before summary application; stale group-inbox items are excluded before feedback, avatar bubble or banner presentation. Other groups and DM snapshots retain their existing behavior. The shared group inbox cursor still advances past the consumed snapshot, preventing repetition; no read acknowledgement, RPC or SQL contract is added. Epochs clear with account identity changes, and the existing account generation fence remains in place.

The final existing A24 case passes **Chromium 1/1 and WebKit 1/1 on DM controller v2**, retaining all earlier card, fairness and cache-boundary assertions. The old snapshot restores neither the invitation badge nor an old banner/list bubble/group message row. Both runs have zero native Supabase requests and no page errors. Evidence: `notification-epoch-{chromium,webkit}.log`, final reports' `notificationEpoch` field and `chromium-red-notification-epoch.log` under workspace `tmp_files/ux-021/invitation-lifecycle/`. This concludes the requested bounded epoch check; it does not extend acceptance to production or OS notification delivery.

## Read-only PWA installation review

Inspected boundaries: `app/hub-action.js` guide creation, native/copy handlers, owner checks, hint/profile updates and disposal; `app/pwa.js` install invitation consumption, `installState`, standalone/appinstalled events; the profile/hint bindings and existing `pwa-install-handoff` / `PWA installation 0.21:` fixture contracts.

One sanitisation defect was reported to the root owner: clearing query/hash alone retained basic-auth URL username/password. A synthetic URL probe confirmed both were copied. The root owner added explicit username/password clearing; the updated helper was reread and the root's existing browser case now contains the corresponding artificial-credential URL. This review did not edit PWA source or run an OS install.

No further P0/P1 issue was found in the inspected installation boundaries. Native invitation consumption occurs before awaiting the prompt, preventing reuse. The guide's async status/focus callbacks require the same active owned frame; a late result cannot reopen or overwrite a replacement settings surface. Clipboard failure only selects its own active input. Query/hash/userinfo are removed from the shared base URL. Public profile/hint status patches preserve their buttons and respect installed evidence and dismissal. A native acceptance is described as a request; installed state requires observed `appinstalled` or standalone mode. iPhone menu guidance remains guidance, not a simulated successful native installation.

Native event fixtures and local source review do not prove an actual OS installation, notification permission, production hosting behavior or real-device delivery.
