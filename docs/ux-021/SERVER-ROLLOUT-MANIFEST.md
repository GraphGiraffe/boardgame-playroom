# 0.21 server rollout manifest

Status: **four production updates explicitly approved and applied03.11; schema/ACL postflight19/19 verified; user/device/provider verification PENDING**. See [LIVE-SERVER-ROLLOUT-1103.md](LIVE-SERVER-ROLLOUT-1103.md). This manifest preserves the reviewable source plan; execution was separately authorized in the recorded user reply. It is not authorization for additional changes. Original package preparation was local-only. The subsequent audit used only the intended project URL, PostgreSQL catalogs and Edge deployment metadata: no user rows, logs, database writes, Edge deployments, provider sends or announcements.

## Live metadata preflight,03.11

The connected PlayRoom project URL exactly matches app/network-config.js. PostgreSQL17.11, UTF8, ICU and playroom_private exist. The exact19-row checker from candidate7aa60d95…d0333d503 returned16installed and11exact. Three host-Push extension objects are absent: playroom_push_host_pending, playroom_push_host_transfer and its trigger. Five existing functions have nonmatching fingerprints: playroom_account_sync, playroom_groups_rpc, playroom_online, playroom_push and playroom_push_pending. A fingerprint mismatch alone does not establish a semantic defect or authorize replacement; the subsequent safe metadata/Git comparison matched all five existing bodies and ACL to a known baseline before the separately authorized four updates.

playroom-push is ACTIVE version7 and playroom-ice is ACTIVE version1. Deployment status does not establish subscription, configuration or provider delivery. Evidence: workspace tmp_files/ux-021/live-capability-audit-1103/metadata-audit.json. No new runtime candidate is needed for this read-only/documentation update. The four source transactions below were subsequently explicitly authorized and applied; the final checker now returns19installed/19exact. This preflight section records the earlier state, not the current schema.

## Existing compatible deployment: required upgrade

First confirm the intended project and its existing Auth/profile, social, signaling, online/group, host-transfer, cloud-save and account-sync baseline. Keep an owner-reviewed backup/current function definitions and the current Push/debug settings. Stop on an unknown/missing baseline rather than applying the full schema as a substitute for a narrow upgrade.

Run the read-only [chat-search-preflight.sql](../../server/chat-search-preflight.sql): UTF8 and ICU support must both be true. Live metadata on03.11 confirms UTF8 and ICU support; real signed-in Unicode search remains a functional check after the authorized upgrade. The upgrade deliberately stops if those prerequisites are unavailable.

| Order | Exact source artifact | Contract |
|---|---|---|
| 1 | [account-sync.sql](../../server/account-sync.sql) | Authorizes preview/search aggregate reads and preserves committed quota errors; no membership or message mutation is added to the read aggregate. |
| 2 | [chat-actions.sql](../../server/chat-actions.sql) | Adds server-validated reply references/private attached reactions; replaces canonical group/online RPCs, including full-history search, private quota/Unicode helper and room-code preview. |

Each artifact is a repeatable transaction. Install the aggregate allowlist before exposing read capabilities. The current chat-actions artifact already embeds preview/search; applying separate `room-preview.sql` and `chat-search.sql` as additional mandatory steps would be redundant. Those remain alternative targeted upgrade paths for a compatible baseline, as documented in [preview](ROOM-PREVIEW-CONTRACT.md), [search](CONVERSATION-SEARCH-BACKEND.md) and [chat actions](CHAT-ACTIONS-ROLLOUT.md).

The UI enables replies/reactions/search only from their read capabilities. Preview has no admission side effect and no Join fallback. An older backend leaves the corresponding feature unavailable; this fallback does not mean production supports the new feature.

## Conditional Push upgrade

Apply these only if the intended deployment uses the existing Push queue/configuration and host-transfer authority schema. Neither transaction enables Push, provisions keys, calls a provider or announces an update.

| Order | Exact source artifact | Contract |
|---|---|---|
| 3 | [push-read-receipts.sql](../../server/push-read-receipts.sql) | Private metadata-only room read receipts, `config.capabilities.roomRead`, bounded `room-seen`, relevance/queued-delivery cancellation. |
| 4 | [host-transfer-push.sql](../../server/host-transfer-push.sql) | Private pending-recipient validation and transition trigger for offer/decision/completion; no game archive, token or private message body. |

Read receipts are capability-gated; RTC chat and host transfer remain independent of this notification extension. Actual delivery still requires the separately configured `playroom-push` Edge Function, VAPID keys, Vault/pg_net/cron and user subscription/permission. Their live status is not established by the local SQL tests. Important-update announcements remain operator-only and require explicit authorization for that particular announcement.

TURN similarly depends on the separately deployed `playroom-ice` Edge Function, room-scoped `ice_access` and existing Cloudflare credentials; STUN has a client fallback. Temporary connection traces are optional debug, not a required 0.21 upgrade. These four narrow artifacts do not modify diagnostic settings. Reapplying full setup preserves an existing disabled diagnostic flag; fresh-project diagnostics retain the separate canonical `ice.sql` policy and must be reviewed as such, not silently treated as disabled.

## Assembled setup and verification

`tooling/supabase_setup.py` now includes `host-transfer-push.sql` **after** host-transfer and canonical Push. Canonical `push.sql` already includes the receipt schema/RPC, so the standalone receipt upgrade is not duplicated in the assembled setup. The generator still produces one outer transaction. Existing enabled/disabled Push settings are preserved.

The generated `check-supabase.sql` has **19 rows**: 18 public RPC/internal helper fingerprints and one exact host-transition trigger check. Every `installed` and `exact_match` must be true. The added checks cover the common pending dispatcher, both host helpers, revoked anon/authenticated helper execution, and the enabled row-level AFTER INSERT/UPDATE OF state trigger bound to the correct function. This is a known-contract check, not a general schema/RLS/advisor audit.

After an explicitly authorized rollout, use the generated check from the same source snapshot. An older baseline with different unrelated RPCs can legitimately fail other fingerprints; inspect and reconcile the target baseline instead of applying a broad setup automatically. For a deliberately omitted optional host-Push extension its three host-specific check rows will not pass; do not label that an all-features rollout.

Before commit, any SQL failure rolls back its transaction. If postflight fails after a committed artifact, stop exposure and review the captured prior definitions/backup; there is no destructive auto-down migration. Do not drop reply/reaction/history tables to simulate rollback. Separately authorized signed-in account/device checks must still confirm real preview/search, permission denial, history restrictions and conditional Push delivery/suppression. Local fixtures do not establish those production outcomes.

## Exact SHA256 snapshot

```text
ebad15ada05764df6210f9989e6e56d410cb620e8291de8cc95cdbd7fe62107c  server/account-sync.sql
0a3729cfce3f099e974c0bc83c008be32158a4c861b890a2c1a9448439ffce70  server/chat-actions.sql
9b269537c0b08a16885fb84a7aaf7a147244fcbaf6688604564eae529d975421  server/push-read-receipts.sql
aec54f04b768b20099c832e8a7371ae0c78c4cb5f534a4c6b18445751e40b90a  server/host-transfer-push.sql
bd12099819a2b2b63594c0a227e8ac763a8f090761eb33cc69bd801cb81a47d1  server/chat-search-preflight.sql
cc2760e724ef0a81278bcb4b2acef8396722879b3de1997081c23319c4828943  tooling/supabase_setup.py
f871528a09b852b3695b7ee0b5ce9bcecf014d2eed6bb3361222cd7716113be6  generated setup-supabase.sql
fd541f849b9bc6db6a197d62223583de1bc357590b5c7b2c6362a1a39cdc8190  generated check-supabase.sql
```

The build owner must regenerate SQL from this generator and verify these hashes when repackaging the local candidate; earlier bundles omitted the host-Push extension. No published artifact was overwritten here.

## Selected local evidence

`node scripts/codex/test.cjs case/cloud-account-rls`: **PASS 1/1** after this packaging correction. The existing isolated PostgreSQL case applies assembled setup twice, checks all 19 rows, preserves disabled diagnostics, and transactionally proves the check rejects a disabled trigger, altered private helper and exposed helper privilege before rollback. Existing reply/search/preview/privacy/quotas/invitation and Push queue assertions remain in the same selected case. No new harness or full suite was run. Evidence: workspace `tmp_files/ux-021/server-rollout/postgres.log` and `source.sha256`.

The catalog fields used by the trigger check are documented in [PostgreSQL pg_trigger](https://www.postgresql.org/docs/current/catalog-pg-trigger.html); helper access follows the existing explicit revocations described in [Supabase database function permissions](https://supabase.com/docs/guides/database/functions). Production advisor output and managed-service delivery remain pending.
