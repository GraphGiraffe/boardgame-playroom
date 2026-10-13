---
name: app-development
description: Develop the PlayRoom application, hub, shared engine or pack integration using current project contracts.
---

# PlayRoom application development

Use only for the PlayRoom application. Establish selected app and companion roots, branches, SHA pair, dirty state and the current handoff. Read docs/DEVELOPER-INDEX.md and the relevant linked contract before editing. Route UI work to app-ui-layout, transport/recovery to app-connections, validation to app-validation and publication to app-release-pages.

Keep core/ generic; app/ owns the hub, lobby, saved library and pack adapters. Rules, manifests, assets and game-specific views belong to the companion pack repository. Do not introduce game-name switches in the engine to hide a pack defect. Preserve engineApi/viewApi/stateVersion compatibility and exact-version save/replay semantics.

Work in a focused task branch. Plugin development belongs to its isolated tooling branch and must not change the release branch or deploy the application. Record user corrections in the appropriate maintained project design/authoring document; the latest explicit decision overrides an old plan. Do not reconstruct decisions from a compacted summary when the exact log is available.

## Local tools

Read [tools](../../references/TOOLS.md) before using the bundled MCP or CLI. Pass explicit app and pack checkout roots; never guess a sibling path in a worktree. Inspect both repositories and read their current AGENTS.md, CONTRIBUTING.md and relevant design contracts. The repo documentation is authoritative over this plugin. Use repository-workflow for GitHub operations and cleanup. Preserve active services, unrelated edits, published versions and pinned companion SHAs.

## RC4 corrections

Apply [RC4 constraints](../../references/RC4.md) whenever editing catalog, lobby, rules, effects or layout. The selected repositories and latest user decisions remain authoritative.
