---
title: "Commission: Plan: Event Router"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for the Event Router spec at `.lore/specs/infrastructure/event-router.md`.\n\nRead the spec thoroughly, then read the current EventBus implementation and related code to understand the starting point. Also check `.lore/brainstorm/event-router.md` for additional context.\n\nWrite the plan to `.lore/plans/infrastructure/event-router.md` following the project's plan format (see other plans in `.lore/plans/` for examples). The plan should cover phased implementation with clear steps, test strategy, and verification criteria.\n\nVerify the plan covers all REQs from the spec before submitting."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/event-router.md

activity_timeline:
  - timestamp: 2026-03-20T04:13:52.795Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T04:13:52.799Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T04:13:52.840Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T04:14:01.043Z
    event: progress_report
    reason: "Starting event router plan. Reading spec, brainstorm, and current EventBus implementation."
  - timestamp: 2026-03-20T04:14:37.580Z
    event: progress_report
    reason: "All source material read: spec (25 REQs), brainstorm (6 resolved questions), EventBus implementation, config schema, AppConfig type, daemon/app.ts production wiring, log interface, SSE subscriber pattern, and two reference plans. Now drafting the implementation plan."
  - timestamp: 2026-03-20T04:16:45.671Z
    event: result_submitted
    reason: "Created implementation plan for the Event Router at `.lore/plans/infrastructure/event-router.md`.\n\nThe plan covers all 25 REQs from the spec across four phases:\n\n1. **Config Schema** (Steps 1-4): Zod schemas for channels (shell/webhook discriminated union) and notification rules, channel name validation, cross-reference validation via superRefine, AppConfig type extension, and 11 config test cases.\n\n2. **Router Service** (Steps 5-8): Factory function with DI seams for testable dispatch, rule matching logic (type + optional projectName), shell env var construction, webhook POST, 10-second timeouts, fire-and-forget async dispatch, failure logging at warn level, and 18 test cases covering matching, dispatch, failure handling, and inert behavior.\n\n3. **Production Wiring** (Steps 9-10): Router creation in createProductionApp after EventBus and config, unsubscribe added to shutdown function, integration test.\n\n4. **Validation** (Steps 11-12): Full test suite run and fresh-context sub-agent spec compliance review.\n\nOne open question documented: how to sync the SystemEvent type string list between lib/types.ts and daemon/lib/event-bus.ts (leaning toward a test-based sync check rather than moving types)."
  - timestamp: 2026-03-20T04:16:50.758Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source material read: spec (25 REQs), brainstorm (6 resolved questions), EventBus implementation, config schema, AppConfig type, daemon/app.ts production wiring, log interface, SSE subscriber pattern, and two reference plans. Now drafting the implementation plan."
projectName: guild-hall
---
Created implementation plan for the Event Router at `.lore/plans/infrastructure/event-router.md`.

The plan covers all 25 REQs from the spec across four phases:

1. **Config Schema** (Steps 1-4): Zod schemas for channels (shell/webhook discriminated union) and notification rules, channel name validation, cross-reference validation via superRefine, AppConfig type extension, and 11 config test cases.

2. **Router Service** (Steps 5-8): Factory function with DI seams for testable dispatch, rule matching logic (type + optional projectName), shell env var construction, webhook POST, 10-second timeouts, fire-and-forget async dispatch, failure logging at warn level, and 18 test cases covering matching, dispatch, failure handling, and inert behavior.

3. **Production Wiring** (Steps 9-10): Router creation in createProductionApp after EventBus and config, unsubscribe added to shutdown function, integration test.

4. **Validation** (Steps 11-12): Full test suite run and fresh-context sub-agent spec compliance review.

One open question documented: how to sync the SystemEvent type string list between lib/types.ts and daemon/lib/event-bus.ts (leaning toward a test-based sync check rather than moving types).
