---
title: "Commission: Plan: Fix dashboard hydration mismatch error"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a plan to fix the hydration mismatch error described in `.lore/issues/hydration-error-dashboard.md`.\n\n**Your task is planning only, not implementation.** Produce a plan artifact in `.lore/plans/ui/`.\n\nSteps:\n1. Read the issue file at `.lore/issues/hydration-error-dashboard.md` for full context.\n2. Investigate the dashboard page (`web/app/page.tsx`) and its child components to identify which elements render differently between server and client. Focus on date/time rendering, browser-dependent conditionals, and any `Date.now()` or `new Date()` calls in server components.\n3. Check the briefing panel, \"Recent Scrolls\" timestamps, and commission date displays as the likely candidates called out in the issue.\n4. Write a plan that:\n   - Identifies the specific component(s) causing the mismatch\n   - Proposes the minimal fix for each (client component, suppressHydrationWarning, useEffect guard, etc.)\n   - Includes verification steps (how to confirm the fix works)\n   - Includes test requirements\n\nSave the plan to `.lore/plans/ui/fix-dashboard-hydration.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T03:00:37.658Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T03:00:37.663Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
