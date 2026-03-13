---
title: "Commission: Plan: Worker canUseToolRules Declarations"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/workers/worker-tool-rules.md`.\n\nWrite the plan to `.lore/plans/workers/worker-tool-rules.md`.\n\n## What to Read\n\n- `.lore/specs/workers/worker-tool-rules.md` — the spec you're planning for\n- `.lore/specs/infrastructure/sandboxed-execution.md` — the Phase 2 infrastructure this depends on (already implemented)\n- `packages/guild-hall-writer/package.json` — Octavia's current package metadata\n- `daemon/services/manager/worker.ts` — Guild Master's `createManagerPackage()` function\n- `daemon/lib/agent-sdk/sdk-runner.ts` — where `buildCanUseTool` lives (to understand what's already wired)\n- `daemon/services/toolbox-resolver.ts` — where `canUseToolRules` is passed through\n- `tests/daemon/services/sdk-runner.test.ts` — existing canUseTool tests to understand patterns\n- `tests/daemon/toolbox-resolver.test.ts` — existing toolbox resolver tests\n\n## What the Plan Should Cover\n\nThe spec is narrow: two files change (Octavia's package.json, Guild Master's worker.ts), and the infrastructure is already built. But the plan still needs to:\n\n1. **Verify infrastructure readiness.** Confirm the Phase 2 infrastructure (canUseToolRules on WorkerMetadata, toolbox resolver pass-through, buildCanUseTool in sdk-runner) is actually wired and working. The spec says \"implemented\" but the plan should verify before building on it.\n\n2. **Order the changes.** Guild Master's change is in daemon code and affects the manager package. Octavia's is a package.json change. Determine if there are any ordering dependencies.\n\n3. **Define the test plan.** REQ-WTR-17 lists 18 test cases. Map each to the right test file. Determine whether they extend existing test suites or need new describe blocks. Check if the existing canUseTool tests in sdk-runner already cover some of these patterns.\n\n4. **Identify validation concerns.** The spec mentions REQ-SBX-15 (package validation rejects rules referencing tools not in builtInTools). Verify this validation exists and would catch Octavia's rules correctly.\n\n5. **Call out anything missing.** If reading the implementation reveals gaps between what the spec assumes and what exists, flag them."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T04:39:01.716Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T04:39:01.717Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
