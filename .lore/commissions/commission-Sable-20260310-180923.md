---
title: "Commission: Add tool enforcement tests (Steps 3-4 new tests)"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Add new tests for SDK tool availability enforcement per the plan at `.lore/plans/tool-availability-enforcement.md`.\n\nYou own Step 3 (toolbox resolver tests) and the new test cases from Step 4 (SDK runner tests). The plan has exact test code. Read the plan carefully.\n\n**Step 3**: In `tests/daemon/toolbox-resolver.test.ts`:\n- Add `builtInTools` assertions to existing tests\n- Add two new test cases: \"builtInTools matches worker declaration exactly\" and \"builtInTools excludes MCP server tools even when MCP servers are added\"\n\n**Step 4 (new tests only)**: In `tests/daemon/services/sdk-runner.test.ts`:\n- Add five new test cases that verify `tools` is passed correctly in `prepareSdkSession` output\n- Follow existing test patterns for how `makeDeps` overrides `resolveToolSet` and `activateWorker`\n\nThe fixture updates are already done by a prior commission. You're adding new test assertions and test cases only.\n\nRun `bun test tests/daemon/toolbox-resolver.test.ts` and `bun test tests/daemon/services/sdk-runner.test.ts` to verify your tests pass."
dependencies:
  - commission-Dalton-20260310-180914
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T01:09:23.104Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T01:09:23.106Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-11T01:15:26.632Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-11T01:15:26.634Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
