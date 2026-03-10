---
title: "Commission: Plan: fix commission tab sorting and status gems"
date: 2026-03-09
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The commission tab for a project has broken sorting since scheduled commissions were added. The specific symptom: everything shows a red gem (status indicator), regardless of actual status.\n\nInvestigate the current state and plan a fix.\n\n1. Read the commission list UI code. Start with:\n   - `web/app/projects/[name]/commissions/` (the commissions page)\n   - Any commission list/card components in `web/components/`\n   - Look for how status gems/indicators are determined and rendered\n\n2. Read the commission sorting logic:\n   - How are commissions ordered in the list?\n   - How does the sort handle scheduled commissions vs regular commissions?\n   - What statuses exist for each type?\n\n3. Read the commission and scheduled commission status types:\n   - `lib/types.ts` for commission status types\n   - `daemon/services/scheduler/` for scheduled commission statuses\n   - `daemon/services/commission/record.ts` for how commission records are read\n\n4. Identify:\n   - Why all gems are red (is the status mapping incomplete for new statuses?)\n   - What the correct gem color should be for each status\n   - Whether sorted order accounts for scheduled vs one-shot commissions\n   - Any missing status-to-gem mappings\n\n5. Write a plan to `.lore/plans/` that covers:\n   - The root cause of the red gem issue\n   - Correct status-to-gem mapping for all commission types\n   - Sort order that makes sense with scheduled commissions in the mix\n   - Component changes needed\n\nKeep it focused on the sorting and status display. Don't redesign the commission tab."
dependencies: []
linked_artifacts:
  - .lore/plans/commission-status-gem-and-sort-fix.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-09T22:19:56.809Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:19:56.810Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T22:19:56.844Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T22:20:05.099Z
    event: progress_report
    reason: "Starting investigation: reading commission UI, status types, and sorting logic in parallel."
  - timestamp: 2026-03-09T22:23:32.673Z
    event: progress_report
    reason: "Have read all key files. Now cross-referencing status types, gem mappings, and sort logic to identify the exact bugs. Also checking sleeping status and any recent lore notes."
  - timestamp: 2026-03-09T22:27:25.356Z
    event: progress_report
    reason: "Analysis complete. Root causes identified: (1) CSS hue-rotate filters on the blue base gem produce inverted colors (active maps to ~340° red, blocked maps to ~100° yellow-green); (2) \"sleeping\" status missing from statusToGem and STATUS_GROUP; (3) \"abandoned\" missing from STATUS_GROUP. Writing the plan now."
  - timestamp: 2026-03-09T22:28:36.333Z
    event: result_submitted
    reason: "Investigation complete. Plan written to `.lore/plans/commission-status-gem-and-sort-fix.md`.\n\n**Root causes identified:**\n\n1. **CSS filter values produce inverted colors** — `--gem-active` uses `hue-rotate(100deg)` which shifts a blue (240°) gem to ~340° (red-magenta). `--gem-blocked` uses `hue-rotate(-140deg)` which produces ~100° (yellow-green). The names say active=green and blocked=red, but the values deliver the opposite. Since most commissions map to the \"active\" gem (completed, dispatched, in_progress), nearly everything appears red. Proposed corrections: `hue-rotate(-120deg)` for active (→ green), `hue-rotate(120deg)` for blocked (→ red), `hue-rotate(-195deg)` for pending (→ amber) — all require visual verification against the actual gem image.\n\n2. **`\"sleeping\"` missing from `statusToGem`** — Falls through to \"info\" (no filter = base gem color). Should map to \"active\" (green), since sleeping is an active waiting state.\n\n3. **`\"sleeping\"` missing from `STATUS_GROUP`** — Gets sort group 9 (after completed). Should be group 1 (alongside dispatched, in_progress).\n\n4. **`\"abandoned\"` missing from `STATUS_GROUP`** — Gets sort group 9. Should be group 2 (alongside failed, cancelled).\n\n**No component changes needed.** `CommissionList.tsx` and `GemIndicator.tsx` are correct. The fixes are localized to `web/app/globals.css`, `lib/types.ts`, and `lib/commissions.ts`, plus corresponding tests."
  - timestamp: 2026-03-09T22:28:47.834Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. Root causes identified: (1) CSS hue-rotate filters on the blue base gem produce inverted colors (active maps to ~340° red, blocked maps to ~100° yellow-green); (2) \"sleeping\" status missing from statusToGem and STATUS_GROUP; (3) \"abandoned\" missing from STATUS_GROUP. Writing the plan now."
projectName: guild-hall
---
Investigation complete. Plan written to `.lore/plans/commission-status-gem-and-sort-fix.md`.

**Root causes identified:**

1. **CSS filter values produce inverted colors** — `--gem-active` uses `hue-rotate(100deg)` which shifts a blue (240°) gem to ~340° (red-magenta). `--gem-blocked` uses `hue-rotate(-140deg)` which produces ~100° (yellow-green). The names say active=green and blocked=red, but the values deliver the opposite. Since most commissions map to the "active" gem (completed, dispatched, in_progress), nearly everything appears red. Proposed corrections: `hue-rotate(-120deg)` for active (→ green), `hue-rotate(120deg)` for blocked (→ red), `hue-rotate(-195deg)` for pending (→ amber) — all require visual verification against the actual gem image.

2. **`"sleeping"` missing from `statusToGem`** — Falls through to "info" (no filter = base gem color). Should map to "active" (green), since sleeping is an active waiting state.

3. **`"sleeping"` missing from `STATUS_GROUP`** — Gets sort group 9 (after completed). Should be group 1 (alongside dispatched, in_progress).

4. **`"abandoned"` missing from `STATUS_GROUP`** — Gets sort group 9. Should be group 2 (alongside failed, cancelled).

**No component changes needed.** `CommissionList.tsx` and `GemIndicator.tsx` are correct. The fixes are localized to `web/app/globals.css`, `lib/types.ts`, and `lib/commissions.ts`, plus corresponding tests.
