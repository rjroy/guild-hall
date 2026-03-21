---
title: "Commission: Plan: Event Router spec revision transition"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the revised Event Router spec at `.lore/specs/infrastructure/event-router.md`.\n\nThe spec was rewritten today. There is an existing implementation that does not match the revised spec. Your job is to plan the transition from the current implementation to the revised spec. Focus on where we're going, not on preserving what exists. The current implementation is not working as intended, which is why the spec was revised.\n\n**Context to read:**\n1. The revised spec: `.lore/specs/infrastructure/event-router.md` (this is your primary source of truth)\n2. The current implementation: `daemon/services/event-router.ts`\n3. The current tests: find any test files related to event-router\n4. Config schema: `lib/config.ts` and `lib/types.ts` (for `appConfigSchema` and `AppConfig`)\n5. Production wiring: `daemon/app.ts` (`createProductionApp`)\n6. EventBus: `daemon/lib/event-bus.ts`\n7. Log: `daemon/lib/log.ts`\n\n**Key changes in the revised spec:**\n- The router is now a generic matching layer with `subscribe(rule, handler)`. It does NOT know about channels or notifications.\n- A separate `createNotificationService` consumes the Event Router for channel dispatch.\n- Match rules use `EventMatchRule` with `type` (required) and `projectName` (optional).\n- Handler invocation is fire-and-forget with try/catch logging.\n- Config adds `channels` and `notifications` to `config.yaml` with Zod validation including cross-reference checks.\n- Both router and notification service are DI factories wired in `createProductionApp`.\n\n**Plan output:**\nWrite the plan to `.lore/plans/infrastructure/event-router-revision.md`. Structure it as implementation phases with clear scope boundaries. Each phase should be commissionable to Dalton. Include what files change in each phase and what tests verify it. Reference REQ IDs from the spec."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/event-router-revision.md

activity_timeline:
  - timestamp: 2026-03-21T15:55:04.944Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T15:55:04.948Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T15:55:04.992Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T15:55:24.431Z
    event: progress_report
    reason: "Reading all context files: spec, current implementation, tests, config, types, app.ts, event-bus, log. All primary sources loaded. Now reading existing test file."
  - timestamp: 2026-03-21T15:55:40.895Z
    event: progress_report
    reason: "All context read. Mapping current implementation against revised spec to identify the delta. The key architectural change: current `createEventRouter` fuses matching + dispatch into one function. Revised spec separates into `createEventRouter` (generic subscribe/match) and `createNotificationService` (channel dispatch consumer). Drafting the plan now."
  - timestamp: 2026-03-21T15:59:54.903Z
    event: progress_report
    reason: "Plan written and reviewed by fresh-context agent. Applied three improvements from review: explicit shutdown function example in Step 5, timeout wiring test cases in Step 4, and shutdown + event variant checks in Step 7 validation checklist. Plan is ready for submission."
  - timestamp: 2026-03-21T16:00:03.877Z
    event: result_submitted
    reason: "Implementation plan written for the revised Event Router spec. The plan covers all 30 requirements (REQ-EVRT-1 through REQ-EVRT-30) across four phases:\n\n**Phase 1**: Rewrite `daemon/services/event-router.ts` as a generic matching layer with `subscribe(rule, handler)`. No knowledge of channels.\n**Phase 2**: Create `daemon/services/notification-service.ts` as a channel dispatch consumer of the Event Router. Shell/webhook dispatch logic moves here.\n**Phase 3**: Rewire `createProductionApp` in `daemon/app.ts` to create both services with correct ordering and shutdown cleanup.\n**Phase 4**: Full test suite run and fresh-context spec validation.\n\nConfig layer (lib/config.ts, lib/types.ts) is already complete and doesn't change. The plan was reviewed by a fresh-context agent; three improvements applied: explicit shutdown wiring example, timeout verification test cases, and additional validation checklist items."
  - timestamp: 2026-03-21T16:00:10.140Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan written and reviewed by fresh-context agent. Applied three improvements from review: explicit shutdown function example in Step 5, timeout wiring test cases in Step 4, and shutdown + event variant checks in Step 7 validation checklist. Plan is ready for submission."
projectName: guild-hall
---
Implementation plan written for the revised Event Router spec. The plan covers all 30 requirements (REQ-EVRT-1 through REQ-EVRT-30) across four phases:

**Phase 1**: Rewrite `daemon/services/event-router.ts` as a generic matching layer with `subscribe(rule, handler)`. No knowledge of channels.
**Phase 2**: Create `daemon/services/notification-service.ts` as a channel dispatch consumer of the Event Router. Shell/webhook dispatch logic moves here.
**Phase 3**: Rewire `createProductionApp` in `daemon/app.ts` to create both services with correct ordering and shutdown cleanup.
**Phase 4**: Full test suite run and fresh-context spec validation.

Config layer (lib/config.ts, lib/types.ts) is already complete and doesn't change. The plan was reviewed by a fresh-context agent; three improvements applied: explicit shutdown wiring example, timeout verification test cases, and additional validation checklist items.
