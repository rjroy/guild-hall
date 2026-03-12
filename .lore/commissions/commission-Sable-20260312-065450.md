---
title: "Commission: Sandboxed Execution: Phase 1 Tests (Step 4)"
date: 2026-03-12
status: queued
type: one-shot
tags: [commission]
worker: Sable
workerDisplayTitle: "Guild Breaker"
prompt: "Write Phase 1 tests for sandboxed execution per `.lore/plans/infrastructure/sandboxed-execution.md`, Step 4.\n\n**Read the full plan first.** Step 4 has specific test cases with code examples.\n\nAdd a `describe(\"sandbox injection\")` block in `tests/daemon/services/sdk-runner.test.ts` with these test cases:\n\n1. Worker with Bash in builtInTools gets sandbox settings (enabled, autoAllowBashIfSandboxed, allowUnsandboxedCommands)\n2. Sandbox sets `network.allowLocalBinding` to false\n3. Worker without Bash gets no sandbox (undefined)\n4. Dalton-like worker (has Bash) vs Thorne-like worker (no Bash) comparison\n\nUse the existing test helpers in the file (`makeDeps`, `makeSpec`, or whatever helpers exist). The fixtures should use the current `ResolvedToolSet` shape. If `canUseToolRules` is already on the type (from a parallel commission), add `canUseToolRules: []` to fixtures.\n\nRun `bun test tests/daemon/services/sdk-runner.test.ts` to verify."
dependencies:
  - commission-Dalton-20260312-065431
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-12T13:54:50.122Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:54:50.125Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-12T13:56:31.915Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-12T13:56:31.917Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-12T13:57:01.118Z
    event: status_failed
    reason: "Session error: Claude Code process exited with code 1"
current_progress: ""
projectName: guild-hall
---
