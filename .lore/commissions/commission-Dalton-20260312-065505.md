---
title: "Commission: Sandboxed Execution: Phase 2 Types, Validation, Fixtures (Steps 5-6)"
date: 2026-03-12
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 2 type changes, package validation, and fixture updates per `.lore/plans/infrastructure/sandboxed-execution.md`, Steps 5-6.\n\n**Read the full plan first.** It has precise file locations and the full fixture update list.\n\n**Step 5: Type changes and toolbox resolver passthrough**\n- Add `CanUseToolRule` interface to `lib/types.ts` (after `ResolvedToolSet`)\n- Add `canUseToolRules?: CanUseToolRule[]` to `WorkerMetadata` (optional)\n- Add `canUseToolRules: CanUseToolRule[]` to `ResolvedToolSet` (required, no default)\n- Update `daemon/services/toolbox-resolver.ts` return to include `canUseToolRules: worker.canUseToolRules ?? []`\n\n**Step 6: Package validation**\n- Add `canUseToolRuleSchema` to `lib/packages.ts`\n- Add `.superRefine()` to `workerMetadataSchema` for REQ-SBX-15: rules must reference only tools in `builtInTools`\n- Add validation tests to `tests/lib/packages.test.ts`\n\n**Critical: Fixture updates in same commit as type change.** Adding required `canUseToolRules` to `ResolvedToolSet` breaks typecheck until all fixtures are updated. The plan lists all affected files:\n- `tests/daemon/services/sdk-runner.test.ts` (multiple fixtures)\n- `tests/daemon/services/manager-worker.test.ts`\n- `tests/packages/worker-role-smoke.test.ts`\n- `tests/packages/worker-activation.test.ts`\n\nAdd `canUseToolRules: []` to every `ResolvedToolSet` fixture in these files.\n\nAlso check `tests/daemon/toolbox-resolver.test.ts` for any `ResolvedToolSet` constructions or assertions that need updating.\n\nRun `bun run typecheck` and `bun test` after all changes."
dependencies:
  - commission-Dalton-20260312-065431
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-12T13:55:05.023Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:55:05.024Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-12T14:01:31.601Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-12T14:01:31.603Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-12T14:02:14.055Z
    event: status_failed
    reason: "Workspace preparation failed: git branch failed (exit 128): fatal: a branch named 'claude/commission/commission-Dalton-20260312-065505' already exists"
    from: "dispatched"
    to: "failed"
  - timestamp: 2026-03-13T01:21:10.000Z
    event: status_pending
    reason: "Manual reset waiting for tokens"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-13T03:02:43.297Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
