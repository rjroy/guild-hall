---
title: "Commission: Implement: Event Router field matching (glob patterns via micromatch)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Event Router field matching feature per the plan at `.lore/plans/infrastructure/event-router-field-matching.md` and spec at `.lore/specs/infrastructure/event-router-field-matching.md`.\n\n**Read first:**\n- The plan: `.lore/plans/infrastructure/event-router-field-matching.md` (Steps 1-6, all details)\n- The spec: `.lore/specs/infrastructure/event-router-field-matching.md` (REQ-EVFM-1 through REQ-EVFM-22)\n- Current router: `daemon/services/event-router.ts`\n- Current router tests: `tests/daemon/services/event-router.test.ts`\n- Config schema: `lib/config.ts`\n- Config types: `lib/types.ts`\n\n**What to do (all steps from the plan):**\n\n1. **`lib/config.ts`**: Add `fields: z.record(z.string(), z.string()).optional()` to the `match` object in `notificationRuleSchema`.\n\n2. **`lib/types.ts`**: Add `fields?: Record<string, string>` to `NotificationRule.match`.\n\n3. **`daemon/services/event-router.ts`**: Import micromatch. Add `fields?: Record<string, string>` to `EventMatchRule`. Extend `matches()` with a fields loop using `micromatch.isMatch()` (no options object, no `{ dot: true }`). Wrap each `micromatch.isMatch()` call in try/catch that logs at warn and returns false. Pass `log` to `matches()` as a third parameter.\n\n4. **`tests/daemon/services/event-router.test.ts`**: Add 16 test cases as listed in the plan's Step 4 table.\n\n5. Run `bun test` — all tests must pass.\n\n6. Launch a fresh-context sub-agent to verify against the spec's AI Validation section (structural and behavioral checks).\n\n**Do NOT change:** `daemon/services/notification-service.ts`, `daemon/lib/event-bus.ts`, event emit sites, or `daemon/app.ts`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T17:56:38.852Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:56:38.853Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
