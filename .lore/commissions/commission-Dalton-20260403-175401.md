---
title: "Commission: Heartbeat P6: Remove Scheduler, Trigger, and Schedule/Trigger UI Files"
date: 2026-04-04
status: pending
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 6 of the Heartbeat Commission Dispatch plan. This is file removal only.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 6 in full.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\nAll build phases (1-5) are complete. The heartbeat system is working. Now remove what it replaces.\n\n## Step 1: Remove Scheduler Files (REQ-HBT-32)\n\nDelete:\n- `daemon/services/scheduler/index.ts`\n- `daemon/services/scheduler/cron.ts`\n- `daemon/services/scheduler/schedule-lifecycle.ts`\n- `web/app/api/commissions/[commissionId]/schedule-status/route.ts`\n\nDelete the `daemon/services/scheduler/` directory.\n\n## Step 2: Remove Trigger Files (REQ-HBT-33)\n\nDelete:\n- `daemon/services/trigger-evaluator.ts`\n- `daemon/services/commission/trigger-lifecycle.ts`\n- `web/app/api/commissions/[commissionId]/trigger-status/route.ts`\n\n## Step 3: Remove Schedule/Trigger UI Components (REQ-HBT-41, REQ-HBT-41b)\n\nDelete these standalone files:\n- `web/components/commission/CommissionScheduleInfo.tsx` and `.module.css`\n- `web/components/commission/CommissionScheduleActions.tsx` and `.module.css`\n- `web/components/commission/TriggerInfo.tsx` and `.module.css`\n- `web/components/commission/TriggerActions.tsx` and `.module.css`\n- `web/components/commission/trigger-form-data.ts`\n\nThen fix all importing files:\n- `CommissionView.tsx`: Remove imports and conditional rendering for schedule/trigger panels.\n- `CommissionList.tsx`: Remove \"Recurring\" and \"Trigger\" labels, remove source_schedule/triggered_by links.\n- `CommissionHeader.tsx`: Remove schedule/trigger header content.\n- `CommissionForm.tsx` and `.module.css`: Remove schedule/trigger creation tabs and form fields.\n- `web/app/projects/[name]/commissions/[id]/page.tsx`: Remove scheduleInfo/triggerInfo build blocks. Add display of `source.description` if commission has one.\n\nWork methodically: delete standalone files first, then fix each importing file. This is one atomic unit.\n\n`bun typecheck` and `bun test` must pass. Do NOT proceed if either fails."
dependencies:
  - commission-Dalton-20260403-175252
  - commission-Dalton-20260403-175305
  - commission-Dalton-20260403-175342
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-04T00:54:01.521Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
