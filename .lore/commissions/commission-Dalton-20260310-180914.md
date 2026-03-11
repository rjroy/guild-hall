---
title: "Commission: Implement SDK tool availability enforcement (Steps 1-2 + fixtures)"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the SDK tool availability enforcement per the plan at `.lore/plans/tool-availability-enforcement.md`.\n\nYou own Steps 1, 2, and the fixture updates from Step 4. Read the plan carefully for exact file paths, line numbers, and code examples.\n\n**Summary of what you're doing:**\n\n1. **Step 1**: Add `builtInTools: string[]` to `ResolvedToolSet` in `lib/types.ts`. Add `builtInTools: worker.builtInTools` to the return value in `daemon/services/toolbox-resolver.ts`.\n\n2. **Step 2**: Add `tools?: string[] | { type: \"preset\"; preset: \"claude_code\" }` to `SdkQueryOptions` in `daemon/lib/agent-sdk/sdk-runner.ts`. Add `tools: activation.tools.builtInTools` to the options object in `prepareSdkSession`.\n\n3. **Step 4 fixtures only**: Update all `ResolvedToolSet` constructions in test files to include `builtInTools`. The plan lists every fixture that needs updating with the correct value for each. Files:\n   - `tests/daemon/services/sdk-runner.test.ts` (three locations)\n   - `tests/daemon/services/manager-worker.test.ts` (two locations)\n   - `tests/packages/worker-role-smoke.test.ts` (one location)\n   - `tests/packages/worker-activation.test.ts` (one location)\n\n**Critical constraint**: The pre-commit hook runs typecheck. All fixture updates MUST be in the same commit as the type change, or the commit will fail. Bundle all production code and fixture updates in one commit.\n\nRun `bun run typecheck`, `bun run lint`, and `bun test` before committing to verify everything passes."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T01:09:14.380Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T01:09:14.381Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
