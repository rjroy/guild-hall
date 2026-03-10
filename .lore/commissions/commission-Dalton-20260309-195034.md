---
title: "Commission: Fix: REQ-LOCAL-18 mid-session error prefix and REQ-LOCAL-20 config-driven model guidance"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Two fixes from Thorne's spec validation of Local Model Support. Read the updated spec at `.lore/specs/local-model-support.md` for the current requirement wording.\n\n**Fix 1: REQ-LOCAL-18 — Return resolved model info from prepareSdkSession.**\n\n`prepareSdkSession` in `daemon/lib/agent-sdk/sdk-runner.ts` resolves the model internally but doesn't expose it to callers. Mid-session SDK errors get recorded as `Session error: ${outcome.error}` without local model context.\n\nFix: Return the resolved model info alongside the session options from `prepareSdkSession`. When the result is `{ ok: true }`, include the `ResolvedModel` (from `lib/types.ts`) so orchestrators can prefix mid-session errors with the model name and URL for local models.\n\nThen update the commission orchestrator (`daemon/services/commission/orchestrator.ts`) error handling around line 527-528 to prefix errors when the resolved model is local: `Local model \"llama3\" (http://localhost:11434) error: <SDK error>`.\n\nCheck whether meeting, mail, and briefing orchestrators also need the prefix. The spec requires it for all session types.\n\nAdd tests verifying the return shape and that mid-session errors include the prefix for local models but not for built-in models.\n\n**Fix 2: REQ-LOCAL-20 — Config-driven model guidance.**\n\nCurrently `daemon/services/manager/worker.ts:58-68` has hardcoded guidance for Haiku/Sonnet/Opus. The fix is config-driven:\n\n1. Add `guidance?: string` to `ModelDefinition` in `lib/types.ts` and the schema in `lib/config.ts`.\n2. Update `daemon/services/manager/worker.ts` to read model guidance from config. Built-in models keep their existing hardcoded defaults. Local models use the `guidance` field from their `ModelDefinition` in `config.yaml`. The manager worker assembles the full model guidance section dynamically from both sources.\n3. Add tests.\n\nRun `bun test` after each fix."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T02:50:34.826Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T02:50:34.827Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
