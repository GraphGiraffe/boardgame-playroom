---
name: app-connections
description: Develop PlayRoom authority, Table/public commands, pairing, durable history, saved sessions and reconnect without exposing private data.
---

# Authority, connections and recovery

Read current multiplayer, MULTIVIEW and journal contracts plus [0.18 boundaries](../../references/REFACTOR-0.18.md#table-and-authority). Host authority sends permitted projections, never full Session exports. Data audience and command actor are separate; use the room-to-session policy for start, host and authenticated resume.

Keep resume secrets out of QR, snapshots/history/logs. ACK follows durable commit; retries preserve original commandId/actor/signature and return the same receipt. Public Table ACK/history stay spectator-visible; layout grants no rights. Validate hidden data in JSON, accessible labels, effects and sound, not only screenshots. Archive/replay has no commands.

Select affected authority/transport/resume/storage/pairing cases; network/table covers public capability behavior. Distinguish local injected transport, loopback WebRTC, real devices and host restart. Preserve live connections/services; inspect ports and routes before changing anything. Full RTC shutdown may need a new invitation; no rendezvous claim without evidence.

Use [workflow](../../references/WORKFLOW.md) and [tools](../../references/TOOLS.md) when needed. Existing reaction/transfer semantics: [RC4](../../references/RC4.md).
