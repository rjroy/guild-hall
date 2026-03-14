---
title: "Commission: Fix dashboard hydration error"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Execute the plan at `.lore/plans/ui/fix-dashboard-hydration.md` to fix the dashboard hydration error.\n\nThorne reviewed the plan and confirmed it's still valid (see `.lore/notes/review-dashboard-hydration-plan.md` for his findings). One note: line numbers in `ManagerBriefing.tsx` have shifted ~10 lines from what the plan says, so verify actual locations before editing.\n\nImportant: **Do not skip Step 1 (runtime diagnosis).** The `Date.now()` call in `formatRelativeTime()` is the leading hypothesis but not yet confirmed. Diagnose first, then fix.\n\nRun tests after each step. All existing tests must continue to pass, and add tests for any new behavior."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-14T21:18:22.472Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:18:22.476Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
