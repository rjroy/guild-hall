---
title: "Commission: Triggered commissions Phase 2: Guild Master toolbox tools"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement all steps of `.lore/plans/commissions/triggered-commissions-tools.md`.\n\nRead the full plan first. Phase 1 (core architecture) is complete.\n\n**Step 1**: Extend `ManagerToolboxDeps` with optional `triggerEvaluator` field.\n**Step 2**: Extend commission creation route in `daemon/routes/commissions.ts` to handle `type: \"triggered\"` with match/approval/maxDepth fields.\n**Step 3**: Create `makeCreateTriggeredCommissionHandler` — delegates to daemon route, then calls `triggerEvaluator.registerTrigger()` for immediate subscription.\n**Step 4**: Create `makeUpdateTriggerHandler` — status transitions (pause/resume/complete) with subscription management, field updates with subscription replacement.\n**Step 5**: Register both tools in the MCP server with Zod schemas.\n**Step 6**: Wire `triggerEvaluatorRef` through the services bag to the manager toolbox.\n\nKey patterns to follow:\n- `makeCreateScheduledCommissionHandler` for create tool\n- `makeUpdateScheduleHandler` for update tool\n- `scheduleLifecycleRef` wiring pattern for services bag threading\n\nExtract `TRIGGER_STATUS_TRANSITIONS` into a shared constant. Both the toolbox handler and the future daemon route (Phase 3) will need it.\n\nAll tests must pass. Run `bun test` before declaring complete."
dependencies:
  - commission-Thorne-20260321-155934
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T22:59:46.554Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:59:46.555Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
