---
name: app-validation
description: Select explicit PlayRoom test blocks or cases, validate builds and evidence, and prevent implicit full-suite release checks.
---

# Explicit checks and evidence

Read current docs/TESTING.md and the selected app tests/blocks.cjs. Choose the smallest sufficient blocks/subblocks/cases for the actual change. Every release requires explicit selectors or none; omission must fail and all/full/* are not shortcuts. A full composition means explicitly listing current blocks when required by the risk or acceptance. See [workflow](../../references/WORKFLOW.md).

Use plan_validation with exact roots and checks when overriding an area or planning a release. --list/plan is read-only selection, not a pass. The local runner prepares the exact selected companion source packs for gameplay tests. Do not run a second full gate through the other repo. Documentation/plugin changes need their own parsing/package/CLI/MCP checks, not application/network/game suites.

Always verify produced artifacts and SHA256. Record source SHAs, command/selection, result and limits. none is deliberate omission, not green tests. Setup/browser installation is only for missing prerequisites; use repository browser discovery and bounded waits. Reuse evidence only while relevant inputs are unchanged.

Read [tools](../../references/TOOLS.md) for CLI/MCP contracts; [refactoring](../../references/REFACTOR-0.18.md) lists implemented versus pending interfaces. Captures exist only for supporting scenarios; inspect the actual files.
