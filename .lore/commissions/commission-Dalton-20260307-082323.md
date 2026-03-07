---
title: "Commission: Fix Defects from Checkpoint 3 and Spec Validation Reviews"
date: 2026-03-07
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix four defects from Thorne's final two reviews of the worker-to-worker communication feature.\n\n**Read these commissions for full context:**\n- Checkpoint 3 review: `commission-Thorne-20260307-080734`\n- Step 8 spec validation: `commission-Thorne-20260307-080752`\n\n---\n\n**DEFECT-1 (CRITICAL): Toolbox resolver wiring gap — reply tool broken in production.**\nFile: `daemon/services/toolbox-resolver.ts:68-82`\n\nThe toolbox resolver constructs `GuildHallToolboxDeps` without `mailFilePath` or `commissionId`. The `mailToolboxFactory` receives these as `undefined`, defaults to `\"\"`, and the reply tool tries to write to an empty path. The entire reply path is broken in production.\n\nFix: Add `mailFilePath` and `commissionId` to `ToolboxResolverContext` and thread them through from `SessionPrepSpec` so the resolver can pass them to the mail toolbox factory. This is the cleaner approach (option A from Thorne's analysis). Add a test that verifies the resolver passes these fields through to the mail toolbox when `contextType === \"mail\"`.\n\n**DEFECT-2 (HIGH): Resumed commission sessions invisible to cancel path.**\nFile: `daemon/services/mail/orchestrator.ts:510`\n\n`wakeCommission` fires `void resumeCommissionSession(...)` (fire-and-forget). The resumed SDK session is never registered in the `executions` map. Cancel can't find or abort it. If cancel also cleans up the worktree, the resumed session runs against a deleted worktree.\n\nFix: `resumeCommissionSession` should register itself in the `executions` map (with its AbortController) before starting the SDK session, and remove itself on completion. This gives the cancel path a way to find and abort it.\n\n**DEFECT-3: Missing `checkDependencyTransitions` on sleeping commission abandon.**\nFile: `daemon/services/commission/orchestrator.ts` (`cancelSleepingCommission`)\n\nThe normal `abandonCommission` path calls `checkDependencyTransitions(projectName)` to unblock dependents. The sleeping commission abandon path via `cancelSleepingCommission` does not. Dependents remain blocked forever.\n\nFix: Add `checkDependencyTransitions(resolvedProjectName)` after cleanup in `cancelSleepingCommission` when `targetState === \"abandoned\"`.\n\n**DEFECT-4 (MEDIUM): Cannot distinguish maxTurns exhaustion from normal completion.**\nFile: `daemon/services/mail/orchestrator.ts:432-435` and `daemon/lib/agent-sdk/sdk-runner.ts:106`\n\n`SdkRunnerOutcome` only carries `{ sessionId, aborted, error? }`. The SDK's maxTurns limit causes a normal session end (`aborted: false`), same as when the model finishes without calling reply. The spec requires distinct wake prompts for these two cases.\n\nFix: Add a `reason?: \"completed\" | \"maxTurns\" | \"maxBudget\"` field to `SdkRunnerOutcome`. Populate it based on how the SDK session ended. Use it in `handleReaderCompletion` to produce distinct wake prompts. If the SDK doesn't expose the end reason directly, check if the session's turn count equals maxTurns after completion.\n\n**Validate:** `bun run typecheck` passes. All tests pass. Add tests for each fix, especially for DEFECT-1 (the wiring gap that tests were masking)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-07T16:23:23.303Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T16:23:23.304Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
