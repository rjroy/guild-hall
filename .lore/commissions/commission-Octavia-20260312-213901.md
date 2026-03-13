---
title: "Commission: Plan: Worker canUseToolRules Declarations"
date: 2026-03-13
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/workers/worker-tool-rules.md`.\n\nWrite the plan to `.lore/plans/workers/worker-tool-rules.md`.\n\n## What to Read\n\n- `.lore/specs/workers/worker-tool-rules.md` — the spec you're planning for\n- `.lore/specs/infrastructure/sandboxed-execution.md` — the Phase 2 infrastructure this depends on (already implemented)\n- `packages/guild-hall-writer/package.json` — Octavia's current package metadata\n- `daemon/services/manager/worker.ts` — Guild Master's `createManagerPackage()` function\n- `daemon/lib/agent-sdk/sdk-runner.ts` — where `buildCanUseTool` lives (to understand what's already wired)\n- `daemon/services/toolbox-resolver.ts` — where `canUseToolRules` is passed through\n- `tests/daemon/services/sdk-runner.test.ts` — existing canUseTool tests to understand patterns\n- `tests/daemon/toolbox-resolver.test.ts` — existing toolbox resolver tests\n\n## What the Plan Should Cover\n\nThe spec is narrow: two files change (Octavia's package.json, Guild Master's worker.ts), and the infrastructure is already built. But the plan still needs to:\n\n1. **Verify infrastructure readiness.** Confirm the Phase 2 infrastructure (canUseToolRules on WorkerMetadata, toolbox resolver pass-through, buildCanUseTool in sdk-runner) is actually wired and working. The spec says \"implemented\" but the plan should verify before building on it.\n\n2. **Order the changes.** Guild Master's change is in daemon code and affects the manager package. Octavia's is a package.json change. Determine if there are any ordering dependencies.\n\n3. **Define the test plan.** REQ-WTR-17 lists 18 test cases. Map each to the right test file. Determine whether they extend existing test suites or need new describe blocks. Check if the existing canUseTool tests in sdk-runner already cover some of these patterns.\n\n4. **Identify validation concerns.** The spec mentions REQ-SBX-15 (package validation rejects rules referencing tools not in builtInTools). Verify this validation exists and would catch Octavia's rules correctly.\n\n5. **Call out anything missing.** If reading the implementation reveals gaps between what the spec assumes and what exists, flag them."
dependencies: []
linked_artifacts:
  - .lore/plans/workers/worker-tool-rules.md

activity_timeline:
  - timestamp: 2026-03-13T04:39:01.716Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T04:39:01.717Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T04:39:01.838Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T04:39:08.619Z
    event: progress_report
    reason: "Starting plan preparation. Reading the spec, infrastructure code, and test files to verify assumptions before drafting."
  - timestamp: 2026-03-13T04:39:59.984Z
    event: progress_report
    reason: "All source files, tests, and validation logic read. Infrastructure is confirmed fully implemented. Now drafting the plan."
  - timestamp: 2026-03-13T04:43:04.010Z
    event: result_submitted
    reason: "Plan written to `.lore/plans/workers/worker-tool-rules.md`.\n\nThe plan covers five steps across three commissions:\n\n1. **Octavia's package.json** — Add `\"Bash\"` to `builtInTools`, add `canUseToolRules` (rm allowlist + catch-all deny)\n2. **Guild Master's worker.ts** — Add `\"Bash\"` to `builtInTools`, add `canUseToolRules` (git read-only allowlist + catch-all deny)\n3. **canUseTool callback tests** — 15 test cases in sdk-runner.test.ts (7 Octavia, 8 Guild Master)\n4. **Manager package tests** — Update `builtInTools` assertions in both manager test files, add metadata shape tests\n5. **Full suite verification** — typecheck, lint, test\n\nKey findings from infrastructure verification:\n- All Phase 2 infrastructure (types, resolver passthrough, buildCanUseTool, callback injection, package validation) is implemented and tested. No gaps.\n- Sandbox auto-activates for any worker with Bash in builtInTools. No manual sandbox configuration needed.\n- Package validation (REQ-SBX-15) is in `lib/packages.ts:83-98` via Zod superRefine. The existing `manager-worker.test.ts:54-58` schema validation test will automatically verify the Guild Master's rules.\n- Two manager test files (`manager-worker.test.ts` and `manager/worker.test.ts`) both have `builtInTools` assertions that need updating."
  - timestamp: 2026-03-13T04:43:11.435Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files, tests, and validation logic read. Infrastructure is confirmed fully implemented. Now drafting the plan."
projectName: guild-hall
---
Plan written to `.lore/plans/workers/worker-tool-rules.md`.

The plan covers five steps across three commissions:

1. **Octavia's package.json** — Add `"Bash"` to `builtInTools`, add `canUseToolRules` (rm allowlist + catch-all deny)
2. **Guild Master's worker.ts** — Add `"Bash"` to `builtInTools`, add `canUseToolRules` (git read-only allowlist + catch-all deny)
3. **canUseTool callback tests** — 15 test cases in sdk-runner.test.ts (7 Octavia, 8 Guild Master)
4. **Manager package tests** — Update `builtInTools` assertions in both manager test files, add metadata shape tests
5. **Full suite verification** — typecheck, lint, test

Key findings from infrastructure verification:
- All Phase 2 infrastructure (types, resolver passthrough, buildCanUseTool, callback injection, package validation) is implemented and tested. No gaps.
- Sandbox auto-activates for any worker with Bash in builtInTools. No manual sandbox configuration needed.
- Package validation (REQ-SBX-15) is in `lib/packages.ts:83-98` via Zod superRefine. The existing `manager-worker.test.ts:54-58` schema validation test will automatically verify the Guild Master's rules.
- Two manager test files (`manager-worker.test.ts` and `manager/worker.test.ts`) both have `builtInTools` assertions that need updating.
