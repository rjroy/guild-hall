---
title: "Commission: Plan: SDK tool availability enforcement"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create an implementation plan for the SDK tool availability enforcement spec.\n\nRead the spec that was just written at `.lore/specs/sdk-tool-availability.md` (or similar path in `.lore/specs/` - find it by looking for the most recently created spec about SDK tool availability or tool enforcement).\n\nConvert that spec into a step-by-step implementation plan following the project's plan format. The plan should go in `.lore/plans/`.\n\nKey context for planning:\n- The core fix is adding the `tools` parameter to `SdkQueryOptions` in `daemon/lib/agent-sdk/sdk-runner.ts`\n- The `tools` parameter controls what built-in tools the model can see (availability layer)\n- `allowedTools` controls which tools auto-approve without prompting (permission layer) \n- Both should use the same list from `worker.builtInTools` + MCP tool wildcards\n- The toolbox resolver already computes this list; it just needs to be passed as `tools` in addition to `allowedTools`\n- Tests need to verify that a worker without Bash in `builtInTools` does not have Bash in the `tools` output\n- Also consider whether `settingSources` should drop `\"user\"` to prevent user-level permission leaks\n\nRead existing plans in `.lore/plans/` to match the format conventions used in this project."
dependencies:
  - commission-Octavia-20260310-174455
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-11T00:59:08.005Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T00:59:08.006Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
