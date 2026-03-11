---
title: "Commission: Implement SDK tool availability enforcement (Steps 1-2 + fixtures)"
date: 2026-03-11
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the SDK tool availability enforcement per the plan at `.lore/plans/workers/tool-availability-enforcement.md`.\n\nYou own Steps 1, 2, and the fixture updates from Step 4. Read the plan carefully for exact file paths, line numbers, and code examples.\n\n**Summary of what you're doing:**\n\n1. **Step 1**: Add `builtInTools: string[]` to `ResolvedToolSet` in `lib/types.ts`. Add `builtInTools: worker.builtInTools` to the return value in `daemon/services/toolbox-resolver.ts`.\n\n2. **Step 2**: Add `tools?: string[] | { type: \"preset\"; preset: \"claude_code\" }` to `SdkQueryOptions` in `daemon/lib/agent-sdk/sdk-runner.ts`. Add `tools: activation.tools.builtInTools` to the options object in `prepareSdkSession`.\n\n3. **Step 4 fixtures only**: Update all `ResolvedToolSet` constructions in test files to include `builtInTools`. The plan lists every fixture that needs updating with the correct value for each. Files:\n   - `tests/daemon/services/sdk-runner.test.ts` (three locations)\n   - `tests/daemon/services/manager-worker.test.ts` (two locations)\n   - `tests/packages/worker-role-smoke.test.ts` (one location)\n   - `tests/packages/worker-activation.test.ts` (one location)\n\n**Critical constraint**: The pre-commit hook runs typecheck. All fixture updates MUST be in the same commit as the type change, or the commit will fail. Bundle all production code and fixture updates in one commit.\n\nRun `bun run typecheck`, `bun run lint`, and `bun test` before committing to verify everything passes."
dependencies: []
linked_artifacts:
  - lib/types.ts

  - daemon/services/toolbox-resolver.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/toolbox-resolver.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
activity_timeline:
  - timestamp: 2026-03-11T01:09:14.380Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T01:09:14.381Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-11T01:09:14.418Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T01:09:21.003Z
    event: progress_report
    reason: "Reading the plan and source files before making any changes."
  - timestamp: 2026-03-11T01:10:47.245Z
    event: progress_report
    reason: "All production code and fixture updates applied. Running typecheck, lint, and tests."
  - timestamp: 2026-03-11T01:14:29.044Z
    event: progress_report
    reason: "Typecheck, lint, and all 2492 tests pass. Committing changes."
  - timestamp: 2026-03-11T01:15:21.989Z
    event: result_submitted
    reason: "Implemented SDK tool availability enforcement (Steps 1, 2, and Step 4 fixtures).\n\n**Production changes (3 files):**\n- `lib/types.ts`: Added `builtInTools: string[]` to `ResolvedToolSet`\n- `daemon/services/toolbox-resolver.ts`: Added `builtInTools: worker.builtInTools` to resolver return\n- `daemon/lib/agent-sdk/sdk-runner.ts`: Added `tools` field to `SdkQueryOptions` type and `tools: activation.tools.builtInTools` to `prepareSdkSession` options\n\n**Fixture updates (16 test files):**\nUpdated all `ResolvedToolSet` constructions across the test suite. The plan listed 4 test files but typecheck revealed 16 total files needing updates. All fixtures use `builtInTools: []` except `sdk-runner.test.ts` which uses `[\"Read\", \"Write\"]` to match its test scenario.\n\n**Verification:** typecheck, lint, 2492 tests, and production build all pass. Pre-commit hook passed."
  - timestamp: 2026-03-11T01:15:26.408Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Typecheck, lint, and all 2492 tests pass. Committing changes."
projectName: guild-hall
---
Implemented SDK tool availability enforcement (Steps 1, 2, and Step 4 fixtures).

**Production changes (3 files):**
- `lib/types.ts`: Added `builtInTools: string[]` to `ResolvedToolSet`
- `daemon/services/toolbox-resolver.ts`: Added `builtInTools: worker.builtInTools` to resolver return
- `daemon/lib/agent-sdk/sdk-runner.ts`: Added `tools` field to `SdkQueryOptions` type and `tools: activation.tools.builtInTools` to `prepareSdkSession` options

**Fixture updates (16 test files):**
Updated all `ResolvedToolSet` constructions across the test suite. The plan listed 4 test files but typecheck revealed 16 total files needing updates. All fixtures use `builtInTools: []` except `sdk-runner.test.ts` which uses `["Read", "Write"]` to match its test scenario.

**Verification:** typecheck, lint, 2492 tests, and production build all pass. Pre-commit hook passed.
