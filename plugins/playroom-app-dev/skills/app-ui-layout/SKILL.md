---
name: app-ui-layout
description: Implement PlayRoom responsive UI, shared scalable components, player/result cards, themes and stable scroll/input during live updates.
---

# Web presentation, geometry and interaction

Read selected UI/component contracts and the [0.18 boundary](../../references/REFACTOR-0.18.md). Render authorized scene/metric data; domain never reads DOM. Reuse RoundToken, cards, dice, bubbles, counters and layout functions. Preserve semantic IDs/anchors, SVG viewBox centering, proportional depth/rims, 5:7 cards and square dice/cells. Do not repair shared scaling through screen-specific offsets or rasterization.

Reserve controls before field sizing. Keep gestures, scroll nodes, focus, selections, history slider and modals stable during updates/theme changes. Public Table surfaces show spectator data with only granted public controls; a hidden button is not privacy filtering. Result counters come from typed player metrics; rules determine ranking.

Verify only affected states/viewports from [viewport guidance](../../references/VIEWPORTS.md); capture the same state before/after and inspect it visually. Shapes, contrast, readable values, keyboard/touch/drag and reduced motion need evidence relevant to the change. A one-line text fix does not require all layouts/games.

Appearance is local: immutable light/dark, saved custom presets, main-menu editor and in-game toolbar switching without remount. Preserve approved user choices. Follow [workflow](../../references/WORKFLOW.md), [mechanics](../../references/RC4.md) and [tools](../../references/TOOLS.md) as relevant.
