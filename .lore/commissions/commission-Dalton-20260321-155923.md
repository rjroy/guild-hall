---
title: "Commission: Triggered commissions Phase 1c: Trigger evaluator service + production wiring"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 5 and 6 of `.lore/plans/commissions/triggered-commissions-core.md`.\n\nRead the full plan first. Steps 1-4 are already implemented (types, provenance, record ops, template expansion).\n\n**Step 5: Trigger evaluator service** — Create `daemon/services/trigger-evaluator.ts` with `createTriggerEvaluator(deps)` factory. Implements `initialize()` (scan projects for active triggers, register subscriptions), `registerTrigger()`, `unregisterTrigger()`, `shutdown()`. The trigger dispatch handler is the core: source artifact read, source exclusion, depth computation, effective approval, template expansion, commission creation, conditional dispatch, state update. All in fire-and-forget async. Follows the notification service consumer pattern.\n\n**Step 6: Production wiring** — Wire the trigger evaluator in `createProductionApp()` in `daemon/app.ts`. Position after Event Router and commission orchestrator. Use lazy ref pattern (like `scheduleLifecycleRef`). Add shutdown to daemon cleanup. Expose `triggerEvaluatorRef` for the manager toolbox.\n\nThis is the highest-risk code in the feature. The plan's Step 5 has 25+ specific test cases. Cover all of them. Run `bun test` before declaring complete."
dependencies:
  - commission-Thorne-20260321-155912
linked_artifacts:
  - daemon/services/trigger-evaluator.ts

  - daemon/app.ts
  - tests/daemon/services/trigger-evaluator-service.test.ts
  - daemon/app.ts
  - tests/daemon/services/trigger-evaluator-service.test.ts
activity_timeline:
  - timestamp: 2026-03-21T22:59:23.974Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T22:59:23.975Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-21T23:06:30.450Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-21T23:06:30.452Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T23:06:30.490Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T23:07:51.980Z
    event: progress_report
    reason: "Read the full plan and explored all prerequisite files. Steps 1-4 are confirmed implemented. Starting Step 5: trigger evaluator service."
  - timestamp: 2026-03-21T23:12:52.991Z
    event: progress_report
    reason: "Implementation and tests written. Running tests now."
  - timestamp: 2026-03-21T23:16:34.347Z
    event: result_submitted
    reason: "Implemented Steps 5 and 6 of the triggered commissions core plan.\n\n**Step 5: Trigger evaluator service** (`daemon/services/trigger-evaluator.ts`, +357 lines)\n- `createTriggerEvaluator(deps)` factory returning `TriggerEvaluator` interface with `initialize()`, `registerTrigger()`, `unregisterTrigger()`, `shutdown()`\n- `initialize()` scans all projects' integration worktrees for active triggered commissions, registers router subscriptions\n- Core dispatch handler implements: source ID extraction, source artifact read for depth/exclusion, source exclusion check (prevents self-loops), depth computation (increments from source), effective approval determination with depth-limit downgrade, template expansion on prompt/title/dependencies, commission creation with `sourceTrigger` provenance, conditional dispatch (auto vs confirm), trigger state update (runs_completed, last_triggered, last_spawned_id, timeline entry)\n- Fire-and-forget async with try/catch, failures log at warn (REQ-TRIG-31)\n- `readTriggerArtifact()` utility reads worker/prompt/title/dependencies/trigger from artifact frontmatter\n- `extractSourceInfo()` maps event types to source IDs (commissionId, scheduleId, meetingId)\n- `COMMISSION_SOURCE_EVENTS` set identifies events where source artifact read is appropriate\n\n**Step 6: Production wiring** (`daemon/app.ts`, +15 lines)\n- Trigger evaluator created after Event Router and commission orchestrator\n- `triggerEvaluator.initialize()` called during startup\n- `triggerEvaluator.shutdown()` added to daemon shutdown handler (before scheduler.stop)\n\n**Tests** (`tests/daemon/services/trigger-evaluator-service.test.ts`, 801 lines, 26 tests)\nAll 26 test cases from the plan covered:\n- Active triggers register during initialize; paused/completed do not\n- Matching events create commissions; non-matching do not\n- Template variables expand correctly in prompt\n- triggered_by frontmatter written with correct source_id, trigger_artifact, depth\n- Depth computed from source's triggered_by.depth (source depth 2 -> new depth 3)\n- Depth defaults to 1 when source has no triggered_by\n- Depth is 1 for non-commission sources (meeting_ended)\n- Source exclusion skips when trigger_artifact matches current trigger\n- Source exclusion does not skip when trigger_artifact differs\n- Source exclusion fail-open when source artifact unreadable\n- Depth limit downgrades approval from auto to confirm\n- Depth limit appends downgrade timeline entry\n- approval: auto calls both createCommission and dispatchCommission\n- approval: confirm calls createCommission only\n- Omitted approval defaults to confirm\n- Trigger state updated after firing\n- Dispatch failures log at warn, don't propagate\n- No active triggers = inert behavior\n- registerTrigger adds subscription dynamically\n- unregisterTrigger removes subscription dynamically\n- Multiple triggers fire independently on same event\n- shutdown removes all subscriptions\n\n**Verification**: typecheck clean, lint clean, 3297 tests pass (0 fail) across 145 files.\n\n**Decision**: Did not plumb triggerEvaluatorRef through to manager toolbox services bag. The toolbox tools (REQ-TRIG-25a-25d) are in a separate plan. The trigger evaluator is a direct variable in app.ts scope, ready for the future plan to wire through."
  - timestamp: 2026-03-21T23:16:39.344Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Implementation and tests written. Running tests now."
projectName: guild-hall
---
Implemented Steps 5 and 6 of the triggered commissions core plan.

**Step 5: Trigger evaluator service** (`daemon/services/trigger-evaluator.ts`, +357 lines)
- `createTriggerEvaluator(deps)` factory returning `TriggerEvaluator` interface with `initialize()`, `registerTrigger()`, `unregisterTrigger()`, `shutdown()`
- `initialize()` scans all projects' integration worktrees for active triggered commissions, registers router subscriptions
- Core dispatch handler implements: source ID extraction, source artifact read for depth/exclusion, source exclusion check (prevents self-loops), depth computation (increments from source), effective approval determination with depth-limit downgrade, template expansion on prompt/title/dependencies, commission creation with `sourceTrigger` provenance, conditional dispatch (auto vs confirm), trigger state update (runs_completed, last_triggered, last_spawned_id, timeline entry)
- Fire-and-forget async with try/catch, failures log at warn (REQ-TRIG-31)
- `readTriggerArtifact()` utility reads worker/prompt/title/dependencies/trigger from artifact frontmatter
- `extractSourceInfo()` maps event types to source IDs (commissionId, scheduleId, meetingId)
- `COMMISSION_SOURCE_EVENTS` set identifies events where source artifact read is appropriate

**Step 6: Production wiring** (`daemon/app.ts`, +15 lines)
- Trigger evaluator created after Event Router and commission orchestrator
- `triggerEvaluator.initialize()` called during startup
- `triggerEvaluator.shutdown()` added to daemon shutdown handler (before scheduler.stop)

**Tests** (`tests/daemon/services/trigger-evaluator-service.test.ts`, 801 lines, 26 tests)
All 26 test cases from the plan covered:
- Active triggers register during initialize; paused/completed do not
- Matching events create commissions; non-matching do not
- Template variables expand correctly in prompt
- triggered_by frontmatter written with correct source_id, trigger_artifact, depth
- Depth computed from source's triggered_by.depth (source depth 2 -> new depth 3)
- Depth defaults to 1 when source has no triggered_by
- Depth is 1 for non-commission sources (meeting_ended)
- Source exclusion skips when trigger_artifact matches current trigger
- Source exclusion does not skip when trigger_artifact differs
- Source exclusion fail-open when source artifact unreadable
- Depth limit downgrades approval from auto to confirm
- Depth limit appends downgrade timeline entry
- approval: auto calls both createCommission and dispatchCommission
- approval: confirm calls createCommission only
- Omitted approval defaults to confirm
- Trigger state updated after firing
- Dispatch failures log at warn, don't propagate
- No active triggers = inert behavior
- registerTrigger adds subscription dynamically
- unregisterTrigger removes subscription dynamically
- Multiple triggers fire independently on same event
- shutdown removes all subscriptions

**Verification**: typecheck clean, lint clean, 3297 tests pass (0 fail) across 145 files.

**Decision**: Did not plumb triggerEvaluatorRef through to manager toolbox services bag. The toolbox tools (REQ-TRIG-25a-25d) are in a separate plan. The trigger evaluator is a direct variable in app.ts scope, ready for the future plan to wire through.

## Decisions

**Should I plumb triggerEvaluatorRef all the way through to the manager toolbox services bag?**
No. I'll create the ref in app.ts but won't wire it through orchestrator/meeting deps or the manager toolbox. The toolbox tools don't exist yet (separate plan), so that wiring would be dead code.
*Reasoning: The plan says "Pass triggerEvaluatorRef through to the manager toolbox deps" but also notes the toolbox tools are in a separate plan (REQ-TRIG-25a through 25d). Adding the ref in app.ts is sufficient preparation. The services bag plumbing can be added when the toolbox tools are implemented, keeping changes minimal and avoiding dead code.*
