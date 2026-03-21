---
title: "Commission: Plan: Event Router field matching (glob patterns via micromatch)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the spec at `.lore/specs/infrastructure/event-router-field-matching.md`.\n\n**Read first:**\n- The spec: `.lore/specs/infrastructure/event-router-field-matching.md`\n- The current router implementation: `daemon/services/event-router.ts`\n- The current router tests: `tests/daemon/services/event-router.test.ts`\n- Config schema: `lib/config.ts` (notification match schema, `appConfigSchema`)\n- Config types: `lib/types.ts` (`NotificationRule`)\n- Existing micromatch usage: `daemon/lib/agent-sdk/sdk-runner.ts` (around line 292, for `canUseToolRules`)\n- The brainstorm: `.lore/brainstorm/event-router-advanced-matching.md` (implementation sketch section)\n\n**Context:**\n\nThis is a focused change. The spec adds `fields?: Record<string, string>` to `EventMatchRule` with micromatch glob pattern matching. The implementation touches three files:\n1. `daemon/services/event-router.ts` — add `fields` to `EventMatchRule`, import micromatch, extend `matches()` with a fields loop using `micromatch.isMatch()` wrapped in try/catch\n2. `lib/config.ts` — add `fields` to the notification match schema\n3. `lib/types.ts` — add `fields` to `NotificationRule.match`\n\nPlus new tests covering all the behavioral checks in the spec's AI Validation section.\n\nThe notification service, EventBus, and event emit sites do not change.\n\n**Output:** Write the plan to `.lore/plans/infrastructure/event-router-field-matching.md`. Structure as commissionable phases for Dalton. Given the small scope, this might be a single phase. Include REQ coverage, files changed, and test cases."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T17:50:35.733Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:50:35.735Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
