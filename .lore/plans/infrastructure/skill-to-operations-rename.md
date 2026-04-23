---
title: Rename skill infrastructure to operations infrastructure
date: 2026-03-17
status: executed
tags: [rename, operations, architecture, cleanup]
modules: [daemon, lib, cli]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/design/operation-contract.md
---

# Plan: Rename Skill Infrastructure to Operations Infrastructure

## Spec Reference

**Spec**: `.lore/specs/infrastructure/daemon-application-boundary.md` (updated 2026-03-17)

The DAB spec revision retired REQ-DAB-7 through -15 (skill-convergence model) and introduced REQ-DAB-16 through -23. The Terminology section now distinguishes three concepts: operations (REST/CLI surface), MCP tools (agent surface), and Claude Code skills (plugin slash-commands). The term "skill" is reserved for Claude Code skills. The codebase currently uses "skill" for what the spec calls "operations." This plan renames the code to match and removes the agent-facing skill injection code that was never connected.

Requirements addressed:
- REQ-DAB-17: Guild Master CLI access; removal of agent-facing skill injection -> Step 1
- REQ-DAB-18: Operation as the daemon's unit of REST/CLI capability -> Steps 2, 3, 4, 5, 6
- REQ-DAB-19: Daemon owns canonical operation metadata and discovery -> Steps 3, 6, 7

## Codebase Context

The rename touches five layers:

**Core types and registry** (3 files to rename, 1 file to update):
- `apps/daemon/lib/skill-registry.ts` -> `operations-registry.ts`
- `apps/daemon/services/skill-loader.ts` -> `operations-loader.ts`
- `apps/daemon/services/skill-types.ts` -> `operation-types.ts`
- `lib/types.ts` -- `SkillDefinition`, `RouteModule.skills`, `SkillContext`

**Agent injection code to remove** (1 file):
- `apps/daemon/lib/agent-sdk/sdk-runner.ts` -- "4b" block, `formatSkillDiscoveryContext()`, `isCommandAllowed()`, `SessionPrepDeps.skillRegistry`

**Route factories and wiring** (12 files):
- `apps/daemon/routes/health.ts`, `admin.ts`, `artifacts.ts`, `briefing.ts`, `commissions.ts`, `config.ts`, `events.ts`, `git-lore.ts`, `meetings.ts`, `models.ts`, `workers.ts`
- `apps/daemon/routes/help.ts`, `package-skills.ts` -> `package-operations.ts`
- `apps/daemon/app.ts` -- imports, variable names, registry construction, late-binding removal

**CLI layer** (3 files + 2 test files):
- `apps/cli/resolve.ts` -- defines `CliSkill` interface with `skillId`, rename to `CliOperation` with `operationId`
- `apps/cli/format.ts` -- `formatSkillHelp()` -> `formatOperationHelp()`
- `apps/cli/index.ts` -- `fetchSkills()` -> `fetchOperations()`, response parsing
- `apps/cli/tests/resolve.test.ts`, `apps/cli/tests/format.test.ts`

**Wire format** (REST endpoints and JSON response fields):
- `GET /help/skills` -> `GET /help/operations`
- Response field `skills` -> `operations`
- Response field `skillId` -> `operationId` throughout help endpoint responses

**Manager toolbox** (string literals):
- `apps/daemon/services/manager/toolbox.ts` -- `[skillId: ...]` annotations in tool description strings -> `[operationId: ...]`

**Tests** (6 files to rename/update, 2 CLI test files):
- `apps/daemon/tests/services/skill-registry.test.ts` -> `operations-registry.test.ts`
- `apps/daemon/tests/services/skill-loader.test.ts` -> `operations-loader.test.ts`
- `apps/daemon/tests/services/skill-types.test.ts` -> `operation-types.test.ts`
- `apps/daemon/tests/routes/package-skills.test.ts` -> `package-operations.test.ts`
- `apps/daemon/tests/routes/help.test.ts`
- `apps/daemon/tests/app-skill-wiring.test.ts` -> `app-operations-wiring.test.ts`
- `apps/cli/tests/resolve.test.ts`, `apps/cli/tests/format.test.ts`

**Lore docs** (terminology updates):
- `.lore/specs/infrastructure/cli-progressive-discovery.md` -- heaviest update (references retired REQs)
- `.lore/design/skill-contract.md` -> `operation-contract.md`
- `.lore/design/package-skill-handler.md` -> `package-operation-handler.md`
- All other `.lore/` files containing `SkillDefinition`, `SkillRegistry`, `skillFactory`, `skillId` -- run grep to find full scope rather than working from a fixed list

## Implementation Steps

### Step 1: Remove agent-facing skill injection

**Files**: `apps/daemon/lib/agent-sdk/sdk-runner.ts`, `apps/daemon/app.ts`

Remove:
- The "4b. Inject skill discovery context" block (sdk-runner.ts:430-436)
- `formatSkillDiscoveryContext()` function (sdk-runner.ts:527-580)
- `isCommandAllowed()` function (sdk-runner.ts:582-596)
- `skillRegistry` field from `SessionPrepDeps` type (sdk-runner.ts:147-149)
- Late-binding of `skillRegistry` in `apps/daemon/app.ts` (lines 594-599)
- The `SkillRegistry` import in sdk-runner.ts (used only by the removed code)

Do not remove the `SkillRegistry` type itself or its file yet; that's renamed in Step 3.

### Step 2: Rename core types in lib/types.ts

**Files**: `lib/types.ts`
**Addresses**: REQ-DAB-18

Rename:
- `SkillDefinition` -> `OperationDefinition`
- `SkillContext` -> `OperationContext`
- `RouteModule.skills` -> `RouteModule.operations`
- `skillId` field -> `operationId`

This will cause type errors across the codebase. That's expected; subsequent steps resolve them.

### Step 3: Rename core files

**Files**: 3 renames
**Addresses**: REQ-DAB-18, REQ-DAB-19

File renames:
- `apps/daemon/lib/skill-registry.ts` -> `apps/daemon/lib/operations-registry.ts`
- `apps/daemon/services/skill-loader.ts` -> `apps/daemon/services/operations-loader.ts`
- `apps/daemon/services/skill-types.ts` -> `apps/daemon/services/operation-types.ts`

Within each file, rename all types and functions:
- `SkillRegistry` -> `OperationsRegistry`
- `SkillTreeNode` -> `OperationTreeNode`
- `createSkillRegistry()` -> `createOperationsRegistry()`
- `loadPackageSkills()` -> `loadPackageOperations()`
- `PackageSkill` -> `PackageOperation`
- `SkillFactory` -> `OperationFactory`
- `SkillFactoryDeps` -> `OperationFactoryDeps`
- `SkillFactoryOutput` -> `OperationFactoryOutput`
- `SkillHandler` -> `OperationHandler`
- `SkillStreamHandler` -> `OperationStreamHandler`
- `SkillHandlerContext` -> `OperationHandlerContext`
- `SkillHandlerResult` -> `OperationHandlerResult`
- `SkillHandlerError` -> `OperationHandlerError`
- `SkillStreamEmitter` -> `OperationStreamEmitter`
- `skillFactory` export name -> `operationFactory`

### Step 4: Update apps/daemon/app.ts

**Files**: `apps/daemon/app.ts`

Update:
- Import paths to renamed files
- `allSkills` -> `allOperations`
- `skills` property references -> `operations`
- Registry construction call name
- Return type annotation if present
- Verify `skillRegistry` late-binding was removed in Step 1

### Step 5: Update route factories

**Files**: All route factory files (10 files)

Each route factory returns `RouteModule`. Update the `skills` property to `operations` and rename the local array variable (typically `skills`) to `operations`. Update import paths for `OperationDefinition`.

These are mechanical: find `skills:` in the return object, rename to `operations:`.

### Step 6: Update help routes and package routes

**Files**: `apps/daemon/routes/help.ts`, `apps/daemon/routes/package-skills.ts`
**Addresses**: REQ-DAB-19

- `help.ts`: Update imports and references to `OperationsRegistry`, `OperationTreeNode`. Rename wire format: `GET /help/skills` -> `GET /help/operations`. Update response body fields from `skills` to `operations` and `skillId` to `operationId` throughout all help endpoint JSON responses.
- `package-skills.ts` -> `package-operations.ts`: Rename file and update all internal references (`PackageSkill` -> `PackageOperation`, etc.)
- Update `apps/daemon/app.ts` import of package route module

### Step 7: Update CLI layer

**Files**: `apps/cli/resolve.ts`, `apps/cli/format.ts`, `apps/cli/index.ts`
**Addresses**: REQ-DAB-18, REQ-DAB-19

- `apps/cli/resolve.ts`: `CliSkill` -> `CliOperation`, `skillId` -> `operationId` in the interface and all usages
- `apps/cli/format.ts`: `formatSkillHelp()` -> `formatOperationHelp()`, `suggestCommand()` parameter types
- `apps/cli/index.ts`: `fetchSkills()` -> `fetchOperations()`, update `GET /help/skills` to `GET /help/operations`, update response field parsing from `skills` to `operations`

These files define `CliSkill` locally (not imported from `lib/types.ts`), so typecheck will not catch missed references. Use grep after completing this step.

### Step 8: Update manager toolbox string literals

**Files**: `apps/daemon/services/manager/toolbox.ts`

Update `[skillId: ...]` annotations in tool description strings to `[operationId: ...]`. These are string content, not TypeScript identifiers. Typecheck and lint will not catch them. Search for "skillId" in string literals within this file.

### Step 9: Rename and update test files

**Files**: 8 test files

Rename test files to match source file renames:
- `apps/daemon/tests/services/skill-registry.test.ts` -> `operations-registry.test.ts`
- `apps/daemon/tests/services/skill-loader.test.ts` -> `operations-loader.test.ts`
- `apps/daemon/tests/services/skill-types.test.ts` -> `operation-types.test.ts`
- `apps/daemon/tests/routes/package-skills.test.ts` -> `package-operations.test.ts`
- `apps/daemon/tests/app-skill-wiring.test.ts` -> `app-operations-wiring.test.ts`
- `apps/daemon/tests/routes/help.test.ts` -- update imports and wire format assertions only (no rename)
- `apps/cli/tests/resolve.test.ts` -- update type names and field references
- `apps/cli/tests/format.test.ts` -- update function names and type references

Within each, update imports, type references, and variable names. Check whether any tests covered `formatSkillDiscoveryContext` or `isCommandAllowed`; remove those tests since the functions are deleted in Step 1.

Check `app-skill-wiring.test.ts`: if it tests late-binding of `skillRegistry` into `prepDeps`, remove that specific test case (the behavior is deleted). Keep other wiring tests (duplicate detection, help tree integration) and rename the file.

### Step 10: Update lore documents

Two categories:

**Rename files:**
- `.lore/design/skill-contract.md` -> `.lore/design/operation-contract.md`
- `.lore/design/package-skill-handler.md` -> `.lore/design/package-operation-handler.md`

**Update content** (terminology, retired REQ references):
- `.lore/specs/infrastructure/cli-progressive-discovery.md` -- heaviest rewrite. Replace `SkillDefinition`/`SkillRegistry`/`skillFactory`/`skillId` with operations equivalents. Update references to retired REQ-DAB-7 through -12 to the new REQ-DAB-16 through -20. Replace "skill" with "operation" throughout when referring to daemon capabilities. Keep "skill" when referring to Claude Code skills.
- Run `grep -r "SkillDefinition\|SkillRegistry\|skillFactory\|skillId" .lore/` to find full scope. The count is higher than 13 files. Most hits will be in commission artifacts and historical plans where a stale-path note is sufficient.
- For docs that are historical records (completed plans, notes, archive), update references to file paths that changed but don't rewrite the narrative. Add a note at the top if a path reference is stale.

### Step 11: Update CLAUDE.md

**Files**: `CLAUDE.md`

Update terminology in sections that reference skills as daemon capabilities. Careful: the "Worker domain plugins" section says "the guild-hall-writer package contains a `cleanup-commissions` skill as the first domain plugin." That "skill" refers to a Claude Code skill and is correct. Don't change it. Only update references that use "skill" for what should now be "operation."

### Step 12: Verify

Run `bun run typecheck`, `bun run lint`, and `bun test`. All tests should pass. No new failures from the rename.

Run a grep pass to catch what typecheck misses:
```
grep -r "SkillDefinition\|SkillRegistry\|skillFactory\|CliSkill\|skillId\|RouteModule\.skills\|formatSkillHelp\|fetchSkills\|loadPackageSkills\|PackageSkill\|SkillHandler\|SkillStreamHandler" daemon/ lib/ cli/ tests/
```

If any hits remain, fix them. Then run typecheck and tests again.

Launch a sub-agent to read the DAB spec and spot-check renamed files for consistency between spec terminology and code naming. The sub-agent should specifically check the CLI layer (`apps/cli/resolve.ts`, `apps/cli/index.ts`) since that layer is self-contained and won't produce type errors if missed.

## Delegation Guide

This is a mechanical rename with one surgical removal (Step 1). No specialized expertise required. The main risk is missed references in three categories:

1. **TypeScript identifiers**: caught by typecheck (Steps 2-6, 9)
2. **CLI local types**: NOT caught by typecheck because `CliSkill` is defined locally. Caught by grep (Steps 7, 12)
3. **String literals**: NOT caught by typecheck or lint. Caught by targeted grep (Steps 8, 12)

Review focus: Step 10 (lore docs) benefits from a fresh-context reviewer since terminology changes in prose are harder to validate mechanically than type renames. Step 11 (CLAUDE.md) needs care to distinguish between "skill" meaning Claude Code skill (keep) vs "skill" meaning daemon operation (rename).

## Open Questions

- `app-skill-wiring.test.ts` may test the late-binding of `skillRegistry` into `prepDeps`. If so, that specific test case should be removed (not renamed), since the behavior it tests is being deleted. Other test cases in the file (duplicate detection, help tree integration) should be kept and renamed.
