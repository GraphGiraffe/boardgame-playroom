---
name: app-development
description: Develop PlayRoom application or shared runtime, including the staged 0.18 separation of rules, application, presentation and Web UI.
---

# Application and runtime development

Read the selected app developer index and relevant live contracts. Keep core mechanisms generic, application orchestration behind ports, Web UI in app adapters and game rules/resources in the packs repository. Use [refactoring contracts](../../references/REFACTOR-0.18.md) for GameModel, Session/events, Table, themes/locales or API migration. Track feature parity and pending boundaries; a plan is not implementation.

Route network/recovery to app-connections, geometry/input to app-ui-layout, check selection to app-validation and independent publication to app-release-pages. Reuse model/permission/asset/metric entities instead of game-name switches or copied logic. Honor user decisions and approved API breaks while keeping published versions immutable.

Follow [workflow](../../references/WORKFLOW.md). Read [tools](../../references/TOOLS.md) only when using the plugin CLI/MCP, and [existing mechanics](../../references/RC4.md) when changing their behavior.
