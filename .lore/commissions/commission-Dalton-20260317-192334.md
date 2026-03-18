---
title: "Commission: BBR: Route update + production wiring (Steps 4-5)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 4 and 5 from `.lore/plans/infrastructure/background-briefing-refresh.md`.\n\n**Step 4 — Route handler (REQ-BBR-10):**\n- In `daemon/routes/briefing.ts`, replace the single-project `generateBriefing` call with `getCachedBriefing`\n- On cache miss (null), return `{ briefing: null, generatedAt: null, cached: false, pending: true }` with HTTP 200\n- On cache hit, return the result as before\n- Leave the \"all projects\" path (`generateAllProjectsBriefing`) unchanged (see plan's Open Question 1)\n- Update mock generator in `tests/daemon/routes/briefing.test.ts` to include `getCachedBriefing`\n- Add tests: cache hit, cache miss (pending), generator error on cache read\n- **AI Validation**: after changes, grep `daemon/routes/briefing.ts` for `generateBriefing` — it must appear zero times in the single-project path\n\n**Step 5 — Production wiring (REQ-BBR-8):**\n- In `daemon/app.ts` `createProductionApp()`, after briefing generator creation:\n  - Import and create `createBriefingRefreshService` with `{ briefingGenerator, config, log }`\n  - Call `briefingRefresh.start()`\n  - Update shutdown return to call both `scheduler.stop()` and `briefingRefresh.stop()`\n\nRun the full test suite to confirm nothing is broken.\n\nSpec: `.lore/specs/infrastructure/background-briefing-refresh.md`\nPlan: `.lore/plans/infrastructure/background-briefing-refresh.md`"
dependencies:
  - commission-Dalton-20260317-192323
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T02:23:34.454Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:23:34.455Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T02:27:25.213Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T02:27:25.216Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
