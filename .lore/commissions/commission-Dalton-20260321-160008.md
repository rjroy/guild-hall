---
title: "Commission: Triggered commissions Phase 3: Web UI"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement all steps of `.lore/plans/commissions/triggered-commissions-ui.md`.\n\nRead the full plan first. Phases 1 and 2 are complete (core architecture and toolbox tools).\n\n**Step 1**: Extend daemon detail response with `triggerInfo` block.\n**Step 2**: Add `sourceTrigger` to `CommissionMeta` for provenance links.\n**Step 3**: Create `TriggerInfo` component (match rule display, approval, runs, recent spawns). Extract `formatTimestamp` to shared utility.\n**Step 4**: Create `TriggerActions` component (Pause/Resume toggle, Complete button).\n**Step 5**: Create Next.js API route `trigger-status/route.ts`.\n**Step 6**: Create daemon route + `updateTriggerStatus()` orchestrator method. Import `TRIGGER_STATUS_TRANSITIONS` from shared constant (created in Phase 2).\n**Step 7**: Wire TriggerInfo and TriggerActions into CommissionView sidebar.\n**Step 8**: Add \"Trigger\" label and provenance links to CommissionList.\n\nKey patterns:\n- `CommissionScheduleInfo` / `CommissionScheduleActions` for component structure\n- `schedule-status/route.ts` for API route pattern\n- `updateScheduleStatus()` for orchestrator method pattern\n- CSS Modules, not Tailwind. No `composes` (Turbopack limitation).\n\nAll tests must pass. Run `bun test` before declaring complete."
dependencies:
  - commission-Thorne-20260321-155957
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T23:00:08.374Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T23:00:08.376Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
