---
name: app-connections
description: Develop or diagnose PlayRoom pairing, WebRTC, host authority, reconnect, saved sessions and offline PWA.
---

# Connections and persistence

Read current transport, session, security, history and recovery contracts through docs/DEVELOPER-INDEX.md. A host is authoritative. Send permitted projections, never Session.export or another player's hidden hand. Keep resume tokens out of QR, room snapshots, logs and client-visible history. ACK only after durable commit; replay/idempotency protects duplicate commandId.

Choose the smallest existing network/transport, network/resume, storage/journal or pairing profile that addresses the defect. The helper exposes network, storage and pairing groups; finer selectors are available in scripts/codex/test.cjs. Use separate browser contexts and deterministic test transport before live peers. Distinguish same-device/same-origin, separate devices, live reconnect and restart recovery in evidence.

Do not equate a simulated transport pass with real device connectivity. Do not claim external signaling exists or that full RTC shutdown can reconnect without a new invitation unless the implementation proves it. Inspect ports and ownership first; use existing browser discovery and isolated profiles. Never stop live services, change proxy/TUN settings, expose test servers publicly or weaken access policies as a troubleshooting shortcut.

## Local tools

Read [tools](../../references/TOOLS.md) before using the bundled MCP or CLI. Pass explicit app and pack checkout roots; never guess a sibling path in a worktree. Inspect both repositories and read their current AGENTS.md, CONTRIBUTING.md and relevant design contracts. The repo documentation is authoritative over this plugin. Use repository-workflow for GitHub operations and cleanup. Preserve active services, unrelated edits, published versions and pinned companion SHAs.
