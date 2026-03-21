---
title: "Commission: Plan: Event Router spec revision transition"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the revised Event Router spec at `.lore/specs/infrastructure/event-router.md`.\n\nThe spec was rewritten today. There is an existing implementation that does not match the revised spec. Your job is to plan the transition from the current implementation to the revised spec. Focus on where we're going, not on preserving what exists. The current implementation is not working as intended, which is why the spec was revised.\n\n**Context to read:**\n1. The revised spec: `.lore/specs/infrastructure/event-router.md` (this is your primary source of truth)\n2. The current implementation: `daemon/services/event-router.ts`\n3. The current tests: find any test files related to event-router\n4. Config schema: `lib/config.ts` and `lib/types.ts` (for `appConfigSchema` and `AppConfig`)\n5. Production wiring: `daemon/app.ts` (`createProductionApp`)\n6. EventBus: `daemon/lib/event-bus.ts`\n7. Log: `daemon/lib/log.ts`\n\n**Key changes in the revised spec:**\n- The router is now a generic matching layer with `subscribe(rule, handler)`. It does NOT know about channels or notifications.\n- A separate `createNotificationService` consumes the Event Router for channel dispatch.\n- Match rules use `EventMatchRule` with `type` (required) and `projectName` (optional).\n- Handler invocation is fire-and-forget with try/catch logging.\n- Config adds `channels` and `notifications` to `config.yaml` with Zod validation including cross-reference checks.\n- Both router and notification service are DI factories wired in `createProductionApp`.\n\n**Plan output:**\nWrite the plan to `.lore/plans/infrastructure/event-router-revision.md`. Structure it as implementation phases with clear scope boundaries. Each phase should be commissionable to Dalton. Include what files change in each phase and what tests verify it. Reference REQ IDs from the spec."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T15:55:04.944Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T15:55:04.948Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
