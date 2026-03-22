---
title: "Commission: Fix artifact smart view controls visibility: add panel background"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Problem\n\nThe artifact smart view controls (the \"Smart View / Tree View\" toggle and the \"What's Next / Needs Discussion / Ready to Advance\" filter buttons) are nearly invisible because they render directly over the background artwork with no panel behind them. See `.lore/issues/hard-to-see.webp` for a screenshot.\n\n## Solution\n\nAdd a panel-styled container around both the sub-tabs and filter bar in `web/components/project/ArtifactList.tsx` and `ArtifactList.module.css`, matching the treatment used by the CommissionFilterPanel.\n\n### Reference: CommissionFilterPanel.module.css\n\nThe commission filter panel uses this approach:\n```css\n.filterPanel {\n  margin-bottom: var(--space-md);\n  padding: var(--space-sm) var(--space-md);\n  border-bottom: 1px solid var(--color-bronze);\n  background: var(--color-panel-bg);\n  border-radius: 6px;\n  -webkit-backdrop-filter: blur(8px);\n  backdrop-filter: blur(8px);\n}\n```\n\n### What to do\n\n1. In `ArtifactList.module.css`, create a new `.viewControls` class with panel-like styling (background, blur, border-radius, padding) similar to the commission filter panel.\n\n2. In `ArtifactList.tsx`, wrap the `subTabs` div and the smart view's `filterBar` div together inside a single container div using the new `.viewControls` class. The container should appear above the artifact list panel in both smart and tree views, but the filter bar only shows in smart view.\n\n3. Remove the individual `margin-bottom` from `.subTabs` and `.filterBar` since the wrapper handles spacing.\n\n4. Keep the existing border-bottom on `.subTabs` to visually separate the view toggle from the filter buttons.\n\n### Important\n\n- `-webkit-backdrop-filter` MUST come BEFORE `backdrop-filter` (Next.js compilation quirk, documented in CLAUDE.md CSS Quirks section).\n- Don't change any functionality, just the visual container."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T04:42:10.386Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T04:42:10.389Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
