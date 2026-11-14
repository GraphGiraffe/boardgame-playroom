# Push and semantic feedback: 0.21

Local source and isolated fixtures only, 2026-11-02. No provider delivery, important-update announcement, production DDL or deployment was performed.

Каноническая актуальная [единая матрица событий, каналов, сроков и владельцев](FEEDBACK-MATRIX-1111.md) объединяет общие form/progress/connection/status-сценарии и социальные/Push-сценарии ниже. Следующая таблица сохранена как подробный Push-поднабор исходного отчёта; границы provider/device-приёмки указаны в канонической матрице.

## Event matrix

| Event | Delivery and relevance | Foreground behavior |
|---|---|---|
| Friend request / accepted | Existing authorized friendship trigger; unique event per transition | In-app friend notice and distinct request/accepted cue; OS duplicate suppressed |
| DM / group message | Authorized recipient/current membership; already-read rows excluded when claiming delivery | Existing conversation banner; active conversation quiet; no duplicate system notification |
| Room / team message | Host validates room and intended participants; metadata-only push route, no private body | Open chat acknowledges its UUIDs; server read receipts cancel queued deliveries and worker receipts close delivered notifications |
| Invitation / invitation accepted | Existing invitation/member validation; closed/expired invitations excluded | In-app invitation cue; stale invitation does not keep an invitation badge |
| Group member joined | Existing current group membership trigger | In-app status notice |
| Host offer / accepted / declined / completed | New optional migration; offer to target, decision to source, completed to both current participants; state/expiry rechecked at claim | Existing RTC offer/outcome retained; fallback banner; receipt never opens a panel or steals focus. Explicit tap may focus the matching incoming proposal |
| Game started / resumed / finished / your turn | Existing human/legal-action monitor and server relevance; no hands/actions in delivery | System notification suppressed while that network game is visible and focused, including result/settings overlays |
| Important update | Private operator authentication **and explicit confirmation** required | Update UI route; no automatic public announcement from app release or ordinary update detection |
| Attached reaction | Authority/RPC desired-state update, separate from message | Reaction state/cue only; does not fabricate a new message or message Push |

Worker binding is scoped to app path and account. Origin, account and recipient checks precede read receipts/delivery. Binding changes, receipts, delivery and clicks share a serialized state queue so a late read/write cannot restore an old account's notification or overwrite a read receipt. Seen keys are bounded; there is no permanent body/SDP/game-state debug store.

Room read receipts are optional (`config.capabilities.roomRead`). Older Push backends retain RTC chat behavior; new clients do not call unsupported actions. The private receipt table contains user/room/event UUID and time, not content. Membership is required, batches are bounded to 80, new entries are rate-limited, and stale receipts are pruned after two hours. Provider delivery already in flight is covered by the worker receipt as well as server claim relevance.

## Semantic audio

`app/ui-feedback.js` registers the `app-feedback` pack with the existing audio port. Twelve small synthesized cues distinguish message, reaction, invitation, friend request/accept, host offer/accept/decline/completion, connection success, action error and update readiness. The existing master volume/mute applies. The separate real `uiSounds` preference disables interface cues without changing gameplay audio. No sound permission prompt, music loop or network asset is added.

Audio is quiet when hidden/unfocused, explicitly quiet, disabled or gameplay audio is busy. A short cooldown and bounded account-scoped event IDs prevent repeated cues and retroactive playback after unmute. Reduced-motion controls motion, independently of audio preferences. Browser autoplay policy and system Push sound policy remain browser/OS controlled; this is foreground application audio, not an attempt to override notification sounds.

## Exact rollout artifacts

For an existing deployment with online/signaling, host-transfer and Push prerequisites already installed:

1. `server/chat-actions.sql`: validated reply references, private attached reaction entities and read capabilities.
2. `server/push-read-receipts.sql`: private room read receipts, capability and updated Push RPC/pending relevance.
3. `server/host-transfer-push.sql`: revoked internal host relevance helper and metadata-only transition trigger.

The transactions are repeatable. Host transfer extends a fixed private helper rather than replacing the entire common pending function; reapplying read receipts preserves the extension. Direct anonymous/authenticated table/helper access is revoked. Review target prerequisites and apply only through a separately authorized production rollout. Local PostgreSQL tests exercise baseline plus exact artifacts twice, then reapply read receipts after the host extension to check composition. Live device/provider verification is still required after such rollout.
