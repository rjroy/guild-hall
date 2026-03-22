---
title: "Commission: Fix toolbox-resolver: exclude canUseToolRules-guarded tools from allowedTools"
date: 2026-03-22
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "In `daemon/services/toolbox-resolver.ts`, the `allowedTools` array on lines 147-150 includes all `worker.builtInTools` unconditionally. However, some built-in tools are conditionally gated via `worker.canUseToolRules` (returned on line 152). Including those gated tools in `allowedTools` defeats the purpose of `canUseToolRules` because `allowedTools` acts as an unconditional whitelist.\n\n**The fix:** When building `allowedTools`, filter out any `builtInTools` that appear as subjects in the worker's `canUseToolRules`. Those tools should only be accessible through the rule evaluation, not the blanket whitelist.\n\nLook at the `canUseToolRules` type to understand the structure (each rule has a tool name it governs). Extract those tool names and exclude them from the `allowedTools` spread of `builtInTools`.\n\nMake sure existing tests still pass, and add a test that verifies gated tools are excluded from `allowedTools`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-22T16:36:44.275Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-22T16:36:44.278Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
