---
title: "Commission: Fix: REQ-LOCAL-18 mid-session error prefix and REQ-LOCAL-20 config-driven model guidance"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Two fixes from Thorne's spec validation of Local Model Support. Read the updated spec at `.lore/specs/local-model-support.md` for the current requirement wording.\n\n**Fix 1: REQ-LOCAL-18 — Return resolved model info from prepareSdkSession.**\n\n`prepareSdkSession` in `daemon/lib/agent-sdk/sdk-runner.ts` resolves the model internally but doesn't expose it to callers. Mid-session SDK errors get recorded as `Session error: ${outcome.error}` without local model context.\n\nFix: Return the resolved model info alongside the session options from `prepareSdkSession`. When the result is `{ ok: true }`, include the `ResolvedModel` (from `lib/types.ts`) so orchestrators can prefix mid-session errors with the model name and URL for local models.\n\nThen update the commission orchestrator (`daemon/services/commission/orchestrator.ts`) error handling around line 527-528 to prefix errors when the resolved model is local: `Local model \"llama3\" (http://localhost:11434) error: <SDK error>`.\n\nCheck whether meeting, mail, and briefing orchestrators also need the prefix. The spec requires it for all session types.\n\nAdd tests verifying the return shape and that mid-session errors include the prefix for local models but not for built-in models.\n\n**Fix 2: REQ-LOCAL-20 — Config-driven model guidance.**\n\nCurrently `daemon/services/manager/worker.ts:58-68` has hardcoded guidance for Haiku/Sonnet/Opus. The fix is config-driven:\n\n1. Add `guidance?: string` to `ModelDefinition` in `lib/types.ts` and the schema in `lib/config.ts`.\n2. Update `daemon/services/manager/worker.ts` to read model guidance from config. Built-in models keep their existing hardcoded defaults. Local models use the `guidance` field from their `ModelDefinition` in `config.yaml`. The manager worker assembles the full model guidance section dynamically from both sources.\n3. Add tests.\n\nRun `bun test` after each fix."
dependencies: []
linked_artifacts:
  - daemon/lib/agent-sdk/sdk-runner.ts

  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/orchestrator.ts
  - daemon/services/mail/orchestrator.ts
  - daemon/services/briefing-generator.ts
  - daemon/services/manager/worker.ts
  - lib/types.ts
  - lib/config.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/services/manager-worker.test.ts
  - tests/lib/config.test.ts
  - daemon/services/commission/orchestrator.ts
  - daemon/services/meeting/orchestrator.ts
  - daemon/services/mail/orchestrator.ts
  - daemon/services/briefing-generator.ts
  - daemon/services/manager/worker.ts
  - lib/types.ts
  - lib/config.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/services/manager-worker.test.ts
  - tests/lib/config.test.ts
activity_timeline:
  - timestamp: 2026-03-10T02:50:34.826Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T02:50:34.827Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T02:50:34.858Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T02:50:43.755Z
    event: progress_report
    reason: "Starting work. Reading spec and source files to understand current state."
  - timestamp: 2026-03-10T02:51:27.886Z
    event: progress_report
    reason: "Read all relevant source files. Starting Fix 1: returning ResolvedModel from prepareSdkSession and updating orchestrator error handling."
  - timestamp: 2026-03-10T02:57:11.789Z
    event: progress_report
    reason: "Fix 1 code changes complete across all orchestrators. Now writing tests for prefixLocalModelError and resolvedModel return shape."
  - timestamp: 2026-03-10T02:58:43.528Z
    event: progress_report
    reason: "Fix 1 complete: all 2372 tests pass. Starting Fix 2: config-driven model guidance (REQ-LOCAL-20)."
  - timestamp: 2026-03-10T03:03:32.831Z
    event: result_submitted
    reason: "Both fixes from Thorne's spec validation implemented and verified. 2385 tests pass, 0 failures.\n\n**Fix 1: REQ-LOCAL-18 — Return resolved model info from prepareSdkSession**\n- `prepareSdkSession` now returns `resolvedModel?: ResolvedModel` in `SessionPrepResult`\n- Added `prefixLocalModelError()` helper that formats: `Local model \"llama3\" (http://localhost:11434) error: <msg>`\n- Updated all four orchestrators to prefix mid-session errors with local model context:\n  - Commission orchestrator: `handleSessionCompletion` and `handleSessionError`\n  - Meeting orchestrator: `iterateSession` error events\n  - Mail orchestrator: reader completion and resume session catch blocks\n  - Briefing generator: SDK session catch block\n- 6 new tests: 3 for `prefixLocalModelError`, 3 for `resolvedModel` return shape\n\n**Fix 2: REQ-LOCAL-20 — Config-driven model guidance**\n- Added `guidance?: string` to `ModelDefinition` in `lib/types.ts`\n- Added `guidance` to `modelDefinitionSchema` in `lib/config.ts`\n- Added `localModelDefinitions?: ModelDefinition[]` to `ActivationContext`\n- `prepareSdkSession` now passes `config.models` into activation context\n- Extracted `buildModelGuidance()` in `daemon/services/manager/worker.ts` that combines:\n  - Hardcoded built-in model defaults (Haiku, Sonnet, Opus)\n  - Config-driven local model guidance (from `ModelDefinition.guidance`)\n- `activateManager` assembles the model guidance section dynamically\n- 7 new tests: 2 for schema validation, 6 for `buildModelGuidance`, 3 for integration"
  - timestamp: 2026-03-10T03:03:35.683Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fix 1 complete: all 2372 tests pass. Starting Fix 2: config-driven model guidance (REQ-LOCAL-20)."
projectName: guild-hall
---
Both fixes from Thorne's spec validation implemented and verified. 2385 tests pass, 0 failures.

**Fix 1: REQ-LOCAL-18 — Return resolved model info from prepareSdkSession**
- `prepareSdkSession` now returns `resolvedModel?: ResolvedModel` in `SessionPrepResult`
- Added `prefixLocalModelError()` helper that formats: `Local model "llama3" (http://localhost:11434) error: <msg>`
- Updated all four orchestrators to prefix mid-session errors with local model context:
  - Commission orchestrator: `handleSessionCompletion` and `handleSessionError`
  - Meeting orchestrator: `iterateSession` error events
  - Mail orchestrator: reader completion and resume session catch blocks
  - Briefing generator: SDK session catch block
- 6 new tests: 3 for `prefixLocalModelError`, 3 for `resolvedModel` return shape

**Fix 2: REQ-LOCAL-20 — Config-driven model guidance**
- Added `guidance?: string` to `ModelDefinition` in `lib/types.ts`
- Added `guidance` to `modelDefinitionSchema` in `lib/config.ts`
- Added `localModelDefinitions?: ModelDefinition[]` to `ActivationContext`
- `prepareSdkSession` now passes `config.models` into activation context
- Extracted `buildModelGuidance()` in `daemon/services/manager/worker.ts` that combines:
  - Hardcoded built-in model defaults (Haiku, Sonnet, Opus)
  - Config-driven local model guidance (from `ModelDefinition.guidance`)
- `activateManager` assembles the model guidance section dynamically
- 7 new tests: 2 for schema validation, 6 for `buildModelGuidance`, 3 for integration
