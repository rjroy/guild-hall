---
title: "Commission: Implement: Sub-agent description fix (guidance property)"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the sub-agent description generation per the plan at `.lore/plans/infrastructure/sub-agent-description-fix.md`.\n\n**Read the plan first.** It has exact code and file paths for every change.\n\n**Summary:** Replace the hardcoded lookup table in `buildSubAgentDescription` with a `guidance` property on `WorkerIdentity`. Each worker declares its own invocation guidance in `package.json`.\n\n**Steps 1-7:**\n1. Add `guidance?: string` to `WorkerIdentity` in `lib/types.ts`\n2. Add `guidance` to `workerIdentitySchema` in `lib/packages.ts`\n3. Add `guidance` values to all 8 worker `package.json` files (values from the plan's table, matching the current lookup table)\n4. Replace `buildSubAgentDescription` in `packages/shared/sub-agent-description.ts`: remove lookup table, change signature from `(identity, posture)` to `(identity)`, read `identity.guidance` with fallback\n5. Update call site in `daemon/lib/agent-sdk/sdk-runner.ts` to pass only `identity`\n6. Update tests in `tests/packages/shared/sub-agent-description.test.ts`\n7. Update sdk-runner tests to cover guidance-based descriptions\n\nRun `bun run typecheck && bun test` after implementation. Commit when all pass."
dependencies: []
linked_artifacts:
  - lib/types.ts

  - lib/packages.ts
  - packages/shared/sub-agent-description.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - tests/packages/shared/sub-agent-description.test.ts
  - tests/daemon/services/sdk-runner.test.ts
  - lib/packages.ts
  - packages/shared/sub-agent-description.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - tests/packages/shared/sub-agent-description.test.ts
  - tests/daemon/services/sdk-runner.test.ts
activity_timeline:
  - timestamp: 2026-03-21T09:07:19.119Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T09:07:19.122Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T09:07:19.162Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T09:07:40.149Z
    event: progress_report
    reason: "Read the plan and all source files. Starting implementation: Steps 1-7."
  - timestamp: 2026-03-21T09:11:51.134Z
    event: result_submitted
    reason: "Replaced the hardcoded `INVOCATION_GUIDANCE` lookup table in `buildSubAgentDescription` with a `guidance` property on `WorkerIdentity`. 14 files changed across 7 steps:\n\n1. Added `guidance?: string` to `WorkerIdentity` in `lib/types.ts`\n2. Added `guidance` to `workerIdentitySchema` in `lib/packages.ts`\n3. Added `guidance` values to all 8 worker `package.json` files (identical strings from the old lookup table)\n4. Rewrote `buildSubAgentDescription` in `packages/shared/sub-agent-description.ts`: removed lookup table, simplified signature to `(identity)`, reads `identity.guidance` with fallback\n5. Updated call site in `daemon/lib/agent-sdk/sdk-runner.ts` to pass only `identity`\n6. Updated `sub-agent-description.test.ts`: renamed tests, removed lookup table test, added guidance-specific test\n7. Added guidance-based description test to `sdk-runner.test.ts`\n\nTypecheck, lint, 3209 tests, and production build all pass. Pre-commit hook green."
  - timestamp: 2026-03-21T09:11:57.382Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read the plan and all source files. Starting implementation: Steps 1-7."
projectName: guild-hall
---
Replaced the hardcoded `INVOCATION_GUIDANCE` lookup table in `buildSubAgentDescription` with a `guidance` property on `WorkerIdentity`. 14 files changed across 7 steps:

1. Added `guidance?: string` to `WorkerIdentity` in `lib/types.ts`
2. Added `guidance` to `workerIdentitySchema` in `lib/packages.ts`
3. Added `guidance` values to all 8 worker `package.json` files (identical strings from the old lookup table)
4. Rewrote `buildSubAgentDescription` in `packages/shared/sub-agent-description.ts`: removed lookup table, simplified signature to `(identity)`, reads `identity.guidance` with fallback
5. Updated call site in `daemon/lib/agent-sdk/sdk-runner.ts` to pass only `identity`
6. Updated `sub-agent-description.test.ts`: renamed tests, removed lookup table test, added guidance-specific test
7. Added guidance-based description test to `sdk-runner.test.ts`

Typecheck, lint, 3209 tests, and production build all pass. Pre-commit hook green.
