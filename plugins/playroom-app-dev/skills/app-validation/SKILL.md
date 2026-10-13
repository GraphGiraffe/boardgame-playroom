---
name: app-validation
description: Choose and run focused local PlayRoom tests or the final joint release check without duplicate Actions.
---

# Validation and builds

Plan first with plan_validation: docs, core, layout, hands, motion, network, pairing, storage, rules, standalone, release, setup or build. A plan is not a passed check. Execute through tools/playroom.py run only for the authorized area. It uses project scripts, not a replacement test suite. The focused runner prepares exactly the chosen companion packs to avoid stale installed-packs.js.

Use setup only for missing dependencies/browser. Doc-only and plugin-only work needs package/parsing/tool verification, not 775 application checks. Application-only verification does not establish pack gameplay. Full release gate: bash scripts/codex/check.sh --full --packs-dir PACKS_REPO/packs. Record exact app/pack SHAs, command, result, environment and generated artifact hashes. Reuse valid evidence when inputs are unchanged; full remote checks are reserved for a required release gate or explicit need.

For captures use --capture-dir on a profile that supports PLAYROOM_CAPTURE_DIR; inspect the generated files, do not assume every scenario produces an image. Build all games/PWA only when needed for a deliverable. Keep dist/, generated installed packs, screenshots, logs and secrets outside commits. After a changed source/build step, regenerate archive and checksums together.

## Local tools

Read [tools](../../references/TOOLS.md) before using the bundled MCP or CLI. Pass explicit app and pack checkout roots; never guess a sibling path in a worktree. Inspect both repositories and read their current AGENTS.md, CONTRIBUTING.md and relevant design contracts. The repo documentation is authoritative over this plugin. Use repository-workflow for GitHub operations and cleanup. Preserve active services, unrelated edits, published versions and pinned companion SHAs.
