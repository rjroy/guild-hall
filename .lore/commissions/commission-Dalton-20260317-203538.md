---
title: "Commission: Skill-to-Operations: Remove injection + core renames (Steps 1-4)"
date: 2026-03-18
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Execute Steps 1 through 4 of `.lore/plans/infrastructure/skill-to-operations-rename.md`.\n\n**Step 1 — Remove agent-facing skill injection:**\n- In `daemon/lib/agent-sdk/sdk-runner.ts`: remove the \"4b. Inject skill discovery context\" block, `formatSkillDiscoveryContext()`, `isCommandAllowed()`, `skillRegistry` from `SessionPrepDeps`\n- In `daemon/app.ts`: remove late-binding of `skillRegistry` (lines ~594-599)\n- Don't remove the `SkillRegistry` type/file yet (renamed in Step 3)\n\n**Step 2 — Rename core types in `lib/types.ts`:**\n- `SkillDefinition` → `OperationDefinition`\n- `SkillContext` → `OperationContext`\n- `RouteModule.skills` → `RouteModule.operations`\n- `skillId` field → `operationId`\n\n**Step 3 — Rename core files:**\n- `daemon/lib/skill-registry.ts` → `daemon/lib/operations-registry.ts`\n- `daemon/services/skill-loader.ts` → `daemon/services/operations-loader.ts`\n- `daemon/services/skill-types.ts` → `daemon/services/operation-types.ts`\n- Rename all types/functions inside each file per the plan's rename table\n\n**Step 4 — Update `daemon/app.ts`:**\n- Update imports to renamed files\n- `allSkills` → `allOperations`, `skills` → `operations` throughout\n- Verify `skillRegistry` late-binding was removed in Step 1\n\nRun `bun run typecheck` after Step 4 to see remaining errors (expected in routes, CLI, tests — those are subsequent steps).\n\nPlan: `.lore/plans/infrastructure/skill-to-operations-rename.md`"
dependencies: []
linked_artifacts:
  - daemon/lib/agent-sdk/sdk-runner.ts

  - lib/types.ts
  - daemon/lib/operations-registry.ts
  - daemon/services/operations-loader.ts
  - daemon/services/operation-types.ts
  - daemon/app.ts
  - lib/types.ts
  - daemon/lib/operations-registry.ts
  - daemon/services/operations-loader.ts
  - daemon/services/operation-types.ts
  - daemon/app.ts
activity_timeline:
  - timestamp: 2026-03-18T03:35:38.987Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:35:38.989Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-18T03:35:39.028Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-18T03:36:01.444Z
    event: progress_report
    reason: "Read the plan and all target files. Starting Step 1: removing agent-facing skill injection from sdk-runner.ts and app.ts."
  - timestamp: 2026-03-18T03:42:05.476Z
    event: progress_report
    reason: "Steps 1-4 complete. Running typecheck to identify remaining errors (expected in routes, CLI, tests)."
  - timestamp: 2026-03-18T03:42:59.123Z
    event: result_submitted
    reason: "Completed Steps 1-4 of the skill-to-operations rename plan.\n\n**Step 1 — Removed agent-facing skill injection:**\n- Removed `formatSkillDiscoveryContext()`, `isCommandAllowed()`, and the \"4b\" injection block from `daemon/lib/agent-sdk/sdk-runner.ts`\n- Removed `skillRegistry` from `SessionPrepDeps` type and `SkillRegistry` import\n- Removed late-binding of `skillRegistry` in `daemon/app.ts` (lines 594-598)\n- Did NOT remove the `SkillRegistry` type/file (renamed in Step 3)\n\n**Step 2 — Renamed core types in `lib/types.ts`:**\n- `SkillDefinition` → `OperationDefinition`\n- `SkillContext` → `OperationContext`  \n- `SkillParameter` → `OperationParameter`\n- `RouteModule.skills` → `RouteModule.operations`\n- `skillId` field → `operationId`\n- Updated all comments to match new terminology\n\n**Step 3 — Renamed core files with full internal type renames:**\n- `daemon/lib/skill-registry.ts` → `daemon/lib/operations-registry.ts`\n  - `SkillRegistry` → `OperationsRegistry`, `SkillTreeNode` → `OperationTreeNode`, `createSkillRegistry()` → `createOperationsRegistry()`, `skill` field → `operation`\n- `daemon/services/skill-loader.ts` → `daemon/services/operations-loader.ts`\n  - `loadPackageSkills()` → `loadPackageOperations()`, `PackageSkill` → `PackageOperation`, `SkillFactoryDeps` → `OperationFactoryDeps`, `SkillFactoryOutput` → `OperationFactoryOutput`\n- `daemon/services/skill-types.ts` → `daemon/services/operation-types.ts`\n  - All types renamed per plan: `SkillHandler*` → `OperationHandler*`, `SkillStreamHandler` → `OperationStreamHandler`, `SkillStreamEmitter` → `OperationStreamEmitter`, `SkillFactory*` → `OperationFactory*`, `PackageSkill` → `PackageOperation`\n\n**Step 4 — Updated `daemon/app.ts`:**\n- Updated imports to renamed files and types\n- `allSkills` → `allOperations`, `packageSkillRouteModule` → `packageOperationRouteModule`\n- `loadPackageSkills` → `loadPackageOperations`, `SkillHandlerError` → `OperationHandlerError`\n- Verified `skillRegistry` late-binding was removed in Step 1\n\n**Typecheck result:** 82 errors remaining, all in files covered by subsequent steps (routes, CLI, tests). No unexpected errors."
  - timestamp: 2026-03-18T03:43:04.038Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Steps 1-4 complete. Running typecheck to identify remaining errors (expected in routes, CLI, tests)."
projectName: guild-hall
---
Completed Steps 1-4 of the skill-to-operations rename plan.

**Step 1 — Removed agent-facing skill injection:**
- Removed `formatSkillDiscoveryContext()`, `isCommandAllowed()`, and the "4b" injection block from `daemon/lib/agent-sdk/sdk-runner.ts`
- Removed `skillRegistry` from `SessionPrepDeps` type and `SkillRegistry` import
- Removed late-binding of `skillRegistry` in `daemon/app.ts` (lines 594-598)
- Did NOT remove the `SkillRegistry` type/file (renamed in Step 3)

**Step 2 — Renamed core types in `lib/types.ts`:**
- `SkillDefinition` → `OperationDefinition`
- `SkillContext` → `OperationContext`  
- `SkillParameter` → `OperationParameter`
- `RouteModule.skills` → `RouteModule.operations`
- `skillId` field → `operationId`
- Updated all comments to match new terminology

**Step 3 — Renamed core files with full internal type renames:**
- `daemon/lib/skill-registry.ts` → `daemon/lib/operations-registry.ts`
  - `SkillRegistry` → `OperationsRegistry`, `SkillTreeNode` → `OperationTreeNode`, `createSkillRegistry()` → `createOperationsRegistry()`, `skill` field → `operation`
- `daemon/services/skill-loader.ts` → `daemon/services/operations-loader.ts`
  - `loadPackageSkills()` → `loadPackageOperations()`, `PackageSkill` → `PackageOperation`, `SkillFactoryDeps` → `OperationFactoryDeps`, `SkillFactoryOutput` → `OperationFactoryOutput`
- `daemon/services/skill-types.ts` → `daemon/services/operation-types.ts`
  - All types renamed per plan: `SkillHandler*` → `OperationHandler*`, `SkillStreamHandler` → `OperationStreamHandler`, `SkillStreamEmitter` → `OperationStreamEmitter`, `SkillFactory*` → `OperationFactory*`, `PackageSkill` → `PackageOperation`

**Step 4 — Updated `daemon/app.ts`:**
- Updated imports to renamed files and types
- `allSkills` → `allOperations`, `packageSkillRouteModule` → `packageOperationRouteModule`
- `loadPackageSkills` → `loadPackageOperations`, `SkillHandlerError` → `OperationHandlerError`
- Verified `skillRegistry` late-binding was removed in Step 1

**Typecheck result:** 82 errors remaining, all in files covered by subsequent steps (routes, CLI, tests). No unexpected errors.
