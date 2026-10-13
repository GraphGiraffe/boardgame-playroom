---
name: app-ui-layout
description: Fix or verify PlayRoom responsive geometry, hands, controls, player cards and hub/lobby layout.
---

# UI geometry and interaction

Read docs/UI-DESIGN-SYSTEM.md, DEVELOPER-UI.md and GAME-ELEMENTS-API.md. Use existing layout tokens and shared components. Preserve cards 5:7, square dice/cells and circular pieces through every container and animation. Reserve controls before sizing the field; keep the hand separate and buttons reachable. Do not allow an action appearing/disappearing to stretch the board.

Use existing local profile layout,ui and the narrower input/hands or input/motion profile for the actual changed behavior. See [viewport matrix](../../references/VIEWPORTS.md). Capture and compare the same state before/after; report measured overflow and screenshot evidence separately from gameplay correctness. Pixel/assertion success alone does not establish a readable or attractive interface.

Player interactions should target the card/pawn/player token itself where the contract permits. Communicate compact player indicators by shape, style and accessible labels. Last-played tiles reuse the standard game tile; favorites/hidden/order must agree in hub and lobby. Preserve keyboard, touch, drag/swipe, safe areas and reduced motion.

## Local tools

Read [tools](../../references/TOOLS.md) before using the bundled MCP or CLI. Pass explicit app and pack checkout roots; never guess a sibling path in a worktree. Inspect both repositories and read their current AGENTS.md, CONTRIBUTING.md and relevant design contracts. The repo documentation is authoritative over this plugin. Use repository-workflow for GitHub operations and cleanup. Preserve active services, unrelated edits, published versions and pinned companion SHAs.

## RC4 corrections

Apply [RC4 constraints](../../references/RC4.md) whenever editing catalog, lobby, rules, effects or layout. The selected repositories and latest user decisions remain authoritative.
