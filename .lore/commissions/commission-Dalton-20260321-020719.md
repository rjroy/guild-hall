---
title: "Commission: Implement: Sub-agent description fix (guidance property)"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix the sub-agent description generation per the plan at `.lore/plans/infrastructure/sub-agent-description-fix.md`.\n\n**Read the plan first.** It has exact code and file paths for every change.\n\n**Summary:** Replace the hardcoded lookup table in `buildSubAgentDescription` with a `guidance` property on `WorkerIdentity`. Each worker declares its own invocation guidance in `package.json`.\n\n**Steps 1-7:**\n1. Add `guidance?: string` to `WorkerIdentity` in `lib/types.ts`\n2. Add `guidance` to `workerIdentitySchema` in `lib/packages.ts`\n3. Add `guidance` values to all 8 worker `package.json` files (values from the plan's table, matching the current lookup table)\n4. Replace `buildSubAgentDescription` in `packages/shared/sub-agent-description.ts`: remove lookup table, change signature from `(identity, posture)` to `(identity)`, read `identity.guidance` with fallback\n5. Update call site in `daemon/lib/agent-sdk/sdk-runner.ts` to pass only `identity`\n6. Update tests in `tests/packages/shared/sub-agent-description.test.ts`\n7. Update sdk-runner tests to cover guidance-based descriptions\n\nRun `bun run typecheck && bun test` after implementation. Commit when all pass."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T09:07:19.119Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T09:07:19.122Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
