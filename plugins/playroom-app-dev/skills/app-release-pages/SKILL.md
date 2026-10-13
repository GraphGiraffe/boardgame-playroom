---
name: app-release-pages
description: Prepare PlayRoom prereleases, public assets and the existing protected Cloudflare Pages production deployment.
---

# Release and Cloudflare Pages

Read current docs/RELEASING.md and CLOUDFLARE-PAGES-DEPLOY-PLAN.md; inspect actual workflow inputs before dispatch. Pin exact companion SHA and keep its ref reachable after squash. Distinguish task PR -> dev, prerelease from validated candidate, and explicitly authorized stable dev -> main flow. Do not require a stable merge merely to publish an RC.

Use one final joint release gate. If an Actions build already validated that SHA pair, download its artifacts instead of rebuilding/retesting needlessly. Validate exact public archives and downloaded checksums. Publish explicit public assets only; never upload _worker.js, _routes.json, protected ZIP, access credentials or the private deployment kit to a public release. Published tags/assets are immutable.

For an authorized production deployment use the existing prerelease.yml gateway with operation=deploy and the published immutable release tag. Verify workflow presence on default branch and selected source ref. Use the existing Pages project and secrets, preserve GitHub integration and current protection, check an authorized fallback and allow the existing script to roll back failed verification. Do not create previews unless explicitly requested. Do not print secret values or replace access policies.

If Actions is unavailable, use existing scripts/deploy-local.sh or scripts/pages-deploy.py with the checked public ZIP, matching SHA256SUMS, trusted private wrapper, release-info and exact commit. Inspect --help/current script for the installed argument contract. Credentials remain environment/secret-store inputs. Deliver a private manual kit only when needed; keep it outside release assets.

Completion requires run success plus deploy-report.json status=published, expected release/commit/project and verified deployment ID. A green build, published GitHub release and deployed site are separate outcomes. Record them in a local handoff. No background monitoring claim without a real host scheduler.

## Local tools

Read [tools](../../references/TOOLS.md) before using the bundled MCP or CLI. Pass explicit app and pack checkout roots; never guess a sibling path in a worktree. Inspect both repositories and read their current AGENTS.md, CONTRIBUTING.md and relevant design contracts. The repo documentation is authoritative over this plugin. Use repository-workflow for GitHub operations and cleanup. Preserve active services, unrelated edits, published versions and pinned companion SHAs.
