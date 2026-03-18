---
title: "Commission: Skill-to-Operations: Remove injection + core renames (Steps 1-4)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Execute Steps 1 through 4 of `.lore/plans/infrastructure/skill-to-operations-rename.md`.\n\n**Step 1 — Remove agent-facing skill injection:**\n- In `daemon/lib/agent-sdk/sdk-runner.ts`: remove the \"4b. Inject skill discovery context\" block, `formatSkillDiscoveryContext()`, `isCommandAllowed()`, `skillRegistry` from `SessionPrepDeps`\n- In `daemon/app.ts`: remove late-binding of `skillRegistry` (lines ~594-599)\n- Don't remove the `SkillRegistry` type/file yet (renamed in Step 3)\n\n**Step 2 — Rename core types in `lib/types.ts`:**\n- `SkillDefinition` → `OperationDefinition`\n- `SkillContext` → `OperationContext`\n- `RouteModule.skills` → `RouteModule.operations`\n- `skillId` field → `operationId`\n\n**Step 3 — Rename core files:**\n- `daemon/lib/skill-registry.ts` → `daemon/lib/operations-registry.ts`\n- `daemon/services/skill-loader.ts` → `daemon/services/operations-loader.ts`\n- `daemon/services/skill-types.ts` → `daemon/services/operation-types.ts`\n- Rename all types/functions inside each file per the plan's rename table\n\n**Step 4 — Update `daemon/app.ts`:**\n- Update imports to renamed files\n- `allSkills` → `allOperations`, `skills` → `operations` throughout\n- Verify `skillRegistry` late-binding was removed in Step 1\n\nRun `bun run typecheck` after Step 4 to see remaining errors (expected in routes, CLI, tests — those are subsequent steps).\n\nPlan: `.lore/plans/infrastructure/skill-to-operations-rename.md`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T03:35:38.987Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:35:38.989Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
