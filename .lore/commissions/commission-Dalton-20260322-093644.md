---
title: "Commission: Fix toolbox-resolver: exclude canUseToolRules-guarded tools from allowedTools"
date: 2026-03-22
status: failed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "In `daemon/services/toolbox-resolver.ts`, the `allowedTools` array on lines 147-150 includes all `worker.builtInTools` unconditionally. However, some built-in tools are conditionally gated via `worker.canUseToolRules` (returned on line 152). Including those gated tools in `allowedTools` defeats the purpose of `canUseToolRules` because `allowedTools` acts as an unconditional whitelist.\n\n**The fix:** When building `allowedTools`, filter out any `builtInTools` that appear as subjects in the worker's `canUseToolRules`. Those tools should only be accessible through the rule evaluation, not the blanket whitelist.\n\nLook at the `canUseToolRules` type to understand the structure (each rule has a tool name it governs). Extract those tool names and exclude them from the `allowedTools` spread of `builtInTools`.\n\nMake sure existing tests still pass, and add a test that verifies gated tools are excluded from `allowedTools`."
dependencies: []
linked_artifacts:
  - daemon/services/toolbox-resolver.ts

  - tests/daemon/toolbox-resolver.test.ts
  - tests/daemon/toolbox-resolver.test.ts
activity_timeline:
  - timestamp: 2026-03-22T16:36:44.275Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T16:36:44.278Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-22T16:36:44.326Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-22T16:36:51.292Z
    event: progress_report
    reason: "Reading toolbox-resolver.ts and related types to understand the current code."
  - timestamp: 2026-03-22T16:38:08.748Z
    event: result_submitted
    reason: "Fixed `allowedTools` in `daemon/services/toolbox-resolver.ts` to exclude built-in tools governed by `canUseToolRules`. Previously, all `builtInTools` were added to `allowedTools` unconditionally, which defeated the purpose of `canUseToolRules` since `allowedTools` acts as a blanket whitelist.\n\nThe fix extracts tool names from `canUseToolRules` into a `Set` and filters them out of the `allowedTools` spread. The `builtInTools` field on `ResolvedToolSet` remains unchanged (still reflects the full worker declaration).\n\nAdded a test verifying that gated tools (e.g., `Bash` with command restrictions) are excluded from `allowedTools` while ungated tools and MCP wildcards remain.\n\nAll 3370 tests pass, typecheck clean."
  - timestamp: 2026-03-22T16:38:13.940Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-22T16:38:35.762Z
    event: status_failed
    reason: "Recovery: process lost on restart"
    from: "dispatched"
    to: "failed"
  - timestamp: 2026-03-22T16:38:35.968Z
    event: status_failed
    reason: "Recovery: process lost on restart"
current_progress: "Reading toolbox-resolver.ts and related types to understand the current code."
projectName: guild-hall
---
Fixed `allowedTools` in `daemon/services/toolbox-resolver.ts` to exclude built-in tools governed by `canUseToolRules`. Previously, all `builtInTools` were added to `allowedTools` unconditionally, which defeated the purpose of `canUseToolRules` since `allowedTools` acts as a blanket whitelist.

The fix extracts tool names from `canUseToolRules` into a `Set` and filters them out of the `allowedTools` spread. The `builtInTools` field on `ResolvedToolSet` remains unchanged (still reflects the full worker declaration).

Added a test verifying that gated tools (e.g., `Bash` with command restrictions) are excluded from `allowedTools` while ungated tools and MCP wildcards remain.

All 3370 tests pass, typecheck clean.
