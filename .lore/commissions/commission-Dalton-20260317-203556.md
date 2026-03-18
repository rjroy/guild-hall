---
title: "Commission: Skill-to-Operations: Routes, CLI, strings, tests (Steps 5-9)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Execute Steps 5 through 9 of `.lore/plans/infrastructure/skill-to-operations-rename.md`.\n\n**Step 5 — Route factories (10 files):**\n- In each route factory: rename `skills` property to `operations` in RouteModule return, rename local variables\n- Files: `daemon/routes/health.ts`, `admin.ts`, `artifacts.ts`, `briefing.ts`, `commissions.ts`, `config.ts`, `events.ts`, `git-lore.ts`, `meetings.ts`, `models.ts`, `workers.ts`\n\n**Step 6 — Help and package routes:**\n- `daemon/routes/help.ts`: update to `OperationsRegistry`, `OperationTreeNode`. Wire format: `GET /help/skills` → `GET /help/operations`, response fields `skills` → `operations`, `skillId` → `operationId`\n- `daemon/routes/package-skills.ts` → `daemon/routes/package-operations.ts`: rename file + all internals\n- Update `daemon/app.ts` import for the renamed package route\n\n**Step 7 — CLI layer:**\n- `cli/resolve.ts`: `CliSkill` → `CliOperation`, `skillId` → `operationId`\n- `cli/format.ts`: `formatSkillHelp()` → `formatOperationHelp()`\n- `cli/index.ts`: `fetchSkills()` → `fetchOperations()`, update endpoint from `/help/skills` to `/help/operations`, update response field parsing\n\n**Step 8 — Manager toolbox string literals:**\n- `daemon/services/manager/toolbox.ts`: `[skillId: ...]` → `[operationId: ...]` in tool description strings\n\n**Step 9 — Test files:**\n- Rename test files per plan (5 renames, 3 content-only updates)\n- Update imports, type references, variable names\n- Remove any tests for `formatSkillDiscoveryContext`, `isCommandAllowed`, or `skillRegistry` late-binding (those were deleted in Step 1)\n\nAfter all steps, run `bun run typecheck`, `bun run lint`, and `bun test`. All must pass.\n\nThen run the grep from Step 12 to catch what typecheck misses:\n```\ngrep -r \"SkillDefinition\\|SkillRegistry\\|skillFactory\\|CliSkill\\|skillId\\|RouteModule\\.skills\\|formatSkillHelp\\|fetchSkills\\|loadPackageSkills\\|PackageSkill\\|SkillHandler\\|SkillStreamHandler\" daemon/ lib/ cli/ tests/\n```\nFix any remaining hits.\n\nPlan: `.lore/plans/infrastructure/skill-to-operations-rename.md`"
dependencies:
  - commission-Dalton-20260317-203538
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T03:35:56.199Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T03:35:56.201Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-18T03:43:04.277Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-18T03:43:04.279Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
