---
title: Worker can-use-toolRules Declarations
date: 2026-03-12
status: executed
tags: [workers, security, sandbox, can-use-tool, packages]
modules: [sdk-runner, manager-worker, guild-hall-writer]
related:
  - .lore/_abandoned/specs/worker-tool-rules.md
  - .lore/specs/infrastructure/sandboxed-execution.md
  - .lore/plans/workers/tool-availability-enforcement.md
---

# Plan: Worker can-use-toolRules Declarations

## Spec Reference

**Spec**: `.lore/_abandoned/specs/worker-tool-rules.md`

Requirements addressed:
- REQ-WTR-3, WTR-4, WTR-5, WTR-6, WTR-7, WTR-8: Octavia Bash + can-use-toolRules -> Step 1
- REQ-WTR-9, WTR-10, WTR-11, WTR-12, WTR-13: Guild Master Bash + can-use-toolRules -> Step 2
- REQ-WTR-17 (tests 1-15): can-use-tool callback behavior -> Step 3
- REQ-WTR-17 (tests 16-17): Manager package metadata assertions -> Step 4
- REQ-WTR-17 (test 18): Package validation -> Step 4

## Infrastructure Verification

The spec builds on Phase 2 of the sandboxed execution spec (REQ-SBX-11 through REQ-SBX-24). All infrastructure has been verified as implemented and tested:

| Component | Location | Status |
|-----------|----------|--------|
| `CanUseToolRule` type | `lib/types.ts` (imported at `sdk-runner.ts:15`) | Implemented |
| `can-use-toolRules` on `WorkerMetadata` | `lib/types.ts` | Implemented |
| `can-use-toolRules` on `ResolvedToolSet` | `lib/types.ts` | Implemented |
| Toolbox resolver passthrough | `toolbox-resolver.ts:143` (`worker.can-use-toolRules ?? []`) | Implemented |
| `buildCanUseTool` function | `sdk-runner.ts:278-314` (micromatch with `{ dot: true }`) | Implemented |
| `can-use-tool` callback injection | `sdk-runner.ts:473-477` (only when rules non-empty) | Implemented |
| Sandbox injection for Bash workers | `sdk-runner.ts:460-471` (auto-triggers on `builtInTools.includes("Bash")`) | Implemented |
| Package validation (REQ-SBX-15) | `lib/packages.ts:83-98` (superRefine on workerMetadataSchema) | Implemented |

The toolbox resolver test at `apps/daemon/tests/toolbox-resolver.test.ts:541-561` covers the passthrough. The sdk-runner test at `apps/daemon/tests/services/sdk-runner.test.ts:1172-1420` covers the can-use-tool callback mechanism with 7 test cases (empty rules, non-empty rules, tool matching, command matching, path matching, interrupt:false). The package validation tests at `lib/tests/packages.test.ts:327-368` cover REQ-SBX-15 with 4 test cases.

No gaps found between spec assumptions and implemented infrastructure.

## Codebase Context

**Octavia's package** (`packages/guild-hall-writer/package.json`): Current `builtInTools` is `["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit"]`. No `can-use-toolRules` field. Adding `"Bash"` and `can-use-toolRules` requires editing the `guildHall` block. The `guildHall` block also contains `model`, `domainPlugins`, `domainToolboxes`, `checkoutScope`, and `resourceDefaults`, all unchanged.

**Guild Master's metadata** (`apps/daemon/services/manager/worker.ts:107-129`): `createManagerPackage()` builds a `WorkerMetadata` object in code. Current `builtInTools` at line 123 is `["Read", "Glob", "Grep"]`. No `can-use-toolRules` field. The metadata is defined inline in the function, not in a separate file.

**Existing manager tests** (`apps/daemon/tests/services/manager-worker.test.ts`): Has a test at line 54-58 that validates `createManagerPackage()` output against `workerMetadataSchema.safeParse()`. This test will automatically validate that any `can-use-toolRules` we add reference only tools in `builtInTools` (REQ-SBX-15). Also has `builtInTools` assertion at line 85-89 that currently expects `["Read", "Glob", "Grep"]`.

**Second manager test file** (`apps/daemon/tests/services/manager/worker.test.ts`): Another test file for the same module with overlapping coverage. Has `builtInTools` assertion at line 85-88 that also expects `["Read", "Glob", "Grep"]`. Imports `CanUseToolRule` type (line 9), so it's already prepared for rules.

**can-use-tool test patterns** (`apps/daemon/tests/services/sdk-runner.test.ts:1172-1420`): Existing tests inject `can-use-toolRules` through the `resolveToolSet` mock, then call `prepareSdkSession`, then invoke the returned `can-use-tool` function with tool names and inputs. This is the pattern the new tests should follow.

## Implementation Steps

### Step 1: Add Bash and can-use-toolRules to Octavia's package

**File**: `packages/guild-hall-writer/package.json`
**Addresses**: REQ-WTR-3, REQ-WTR-4, REQ-WTR-5, REQ-WTR-6, REQ-WTR-7, REQ-WTR-8
**Depends on**: Nothing

Replace `builtInTools` and add `can-use-toolRules` in the `guildHall` block:

```json
{
  "guildHall": {
    "builtInTools": ["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    "can-use-toolRules": [
      {
        "tool": "Bash",
        "commands": ["rm .lore/**", "rm -f .lore/**"],
        "allow": true
      },
      {
        "tool": "Bash",
        "allow": false,
        "reason": "Only file deletion within .lore/ is permitted"
      }
    ]
  }
}
```

All other `guildHall` fields (`type`, `identity`, `model`, `domainPlugins`, `domainToolboxes`, `checkoutScope`, `resourceDefaults`) remain unchanged.

Adding `"Bash"` to `builtInTools` automatically triggers Phase 1 sandbox enforcement (REQ-WTR-8, REQ-SBX-2) at `sdk-runner.ts:460-471`. No additional code needed.

The recursive flag exclusion (REQ-WTR-7) works implicitly through micromatch prefix matching: `rm -rf .lore/foo` doesn't match `rm .lore/**` (different prefix) or `rm -f .lore/**` (prefix is `rm -f `, not `rm -rf `). The catch-all deny handles any unrecognized form.

**Verification**: `bun run typecheck` passes (package.json is not type-checked, but Zod validation during package discovery will validate the structure).

### Step 2: Add Bash and can-use-toolRules to Guild Master's metadata

**File**: `apps/daemon/services/manager/worker.ts`
**Addresses**: REQ-WTR-9, REQ-WTR-10, REQ-WTR-11, REQ-WTR-12, REQ-WTR-13
**Depends on**: Nothing

In `createManagerPackage()`, change `builtInTools` and add `can-use-toolRules` to the `metadata` object:

```typescript
builtInTools: ["Read", "Glob", "Grep", "Bash"],
can-use-toolRules: [
  {
    tool: "Bash",
    commands: [
      "git status", "git status *",
      "git log", "git log *",
      "git diff", "git diff *",
      "git show", "git show *",
    ],
    allow: true,
  },
  {
    tool: "Bash",
    allow: false,
    reason: "Only read-only git commands (status, log, diff, show) are permitted",
  },
],
```

Same sandbox auto-activation note as Step 1 applies (REQ-WTR-13).

**Verification**: `bun run typecheck` passes. The existing test at `apps/daemon/tests/services/manager-worker.test.ts:54-58` (`workerMetadataSchema.safeParse(pkg.metadata)`) will fail temporarily because Step 4 hasn't updated the `builtInTools` assertion yet, but the schema validation itself will confirm REQ-SBX-15 compliance (Bash is in builtInTools, can-use-toolRules references Bash).

### Step 3: Add can-use-tool callback tests for Octavia and Guild Master rules

**File**: `apps/daemon/tests/services/sdk-runner.test.ts`
**Addresses**: REQ-WTR-17 (test cases 1-15)
**Depends on**: Nothing (tests inject mock rules, not the real worker metadata)

Add two new `describe` blocks inside the existing `can-use-tool callback` describe (after line 1420). These tests follow the existing pattern: inject rules through `resolveToolSet` mock, call `prepareSdkSession`, invoke the returned `can-use-tool` function.

#### Octavia rules (test cases 1-7)

```typescript
describe("Octavia rules (REQ-WTR-17)", () => {
  const octaviaRules: CanUseToolRule[] = [
    { tool: "Bash", commands: ["rm .lore/**", "rm -f .lore/**"], allow: true },
    { tool: "Bash", allow: false, reason: "Only file deletion within .lore/ is permitted" },
  ];

  function octaviaDeps() {
    return makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        builtInTools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
        can-use-toolRules: octaviaRules,
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });
  }

  // ... tests 1-7
});
```

Test cases:

1. `rm .lore/commissions/commission-Octavia-20260312.md` is allowed
2. `rm -f .lore/meetings/audience-Guild-Master-20260311.md` is allowed
3. `rm .lore/specs/some-spec.md` is allowed (covers all `.lore/` subdirectories)
4. `rm -rf /` is denied
5. `ls .lore/` is denied (not `rm`)
6. `cat .lore/specs/some-spec.md` is denied
7. `rm -rf .lore/commissions/` is denied (recursive flag not in allowlist)

#### Guild Master rules (test cases 8-15)

```typescript
describe("Guild Master rules (REQ-WTR-17)", () => {
  const guildMasterRules: CanUseToolRule[] = [
    {
      tool: "Bash",
      commands: [
        "git status", "git status *",
        "git log", "git log *",
        "git diff", "git diff *",
        "git show", "git show *",
      ],
      allow: true,
    },
    {
      tool: "Bash",
      allow: false,
      reason: "Only read-only git commands (status, log, diff, show) are permitted",
    },
  ];

  function guildMasterDeps() {
    return makeDeps({
      resolveToolSet: async () => ({
        mcpServers: [],
        allowedTools: ["Read", "Glob", "Grep", "Bash"],
        builtInTools: ["Read", "Glob", "Grep", "Bash"],
        can-use-toolRules: guildMasterRules,
      }),
      activateWorker: async (_pkg, context) => ({
        systemPrompt: "test",
        tools: context.resolvedTools,
        resourceBounds: {},
      }),
    });
  }

  // ... tests 8-15
});
```

Test cases:

8. `git status` is allowed (exact match)
9. `git log --oneline -10` is allowed (glob `*` matches flags)
10. `git diff HEAD~3..HEAD` is allowed
11. `git show abc123` is allowed
12. `git diff -- src/lib/foo.ts` is denied (path with `/` cannot match `*`)
13. `git push origin master` is denied (not in allowlist)
14. `git checkout -b new-branch` is denied
15. `curl http://example.com` is denied (not even git)

**Note on existing test overlap**: The existing `can-use-tool callback` tests (lines 1172-1420) test the mechanism generically (empty rules, catch-all deny, allowlist with git status/log, path-based deny, interrupt:false). The WTR tests exercise the specific rule patterns Octavia and the Guild Master will use. Both sets are needed: the generic tests validate the infrastructure, the WTR tests validate the specific declarations.

**Import**: The test file must import `CanUseToolRule` from `@/lib/types` (add to the existing import at line 5-12).

**Verification**: `bun test apps/daemon/tests/services/sdk-runner.test.ts` passes.

### Step 4: Update manager package tests and add validation tests

**Files**: `apps/daemon/tests/services/manager-worker.test.ts`, `apps/daemon/tests/services/manager/worker.test.ts`
**Addresses**: REQ-WTR-17 (test cases 16-18)
**Depends on**: Step 2 (the production code change must be in place)

#### Update existing builtInTools assertions

Both test files assert the current `builtInTools` value. Update them:

In `apps/daemon/tests/services/manager-worker.test.ts:85-89`:
```typescript
test("builtInTools includes read-only tools and Bash", () => {
  const pkg = createManagerPackage();
  const meta = pkg.metadata as WorkerMetadata;
  expect(meta.builtInTools).toEqual(["Read", "Glob", "Grep", "Bash"]);
});
```

In `apps/daemon/tests/services/manager/worker.test.ts:85-88` (same change, different file):
```typescript
test("builtInTools includes read-only tools and Bash", () => {
  const pkg = createManagerPackage();
  const meta = pkg.metadata as WorkerMetadata;
  expect(meta.builtInTools).toEqual(["Read", "Glob", "Grep", "Bash"]);
});
```

#### Add new test cases (test cases 16-17)

In `apps/daemon/tests/services/manager-worker.test.ts`, add to the `createManagerPackage` describe block:

```typescript
test("builtInTools contains Bash (REQ-WTR-17 case 16)", () => {
  const pkg = createManagerPackage();
  const meta = pkg.metadata as WorkerMetadata;
  expect(meta.builtInTools).toContain("Bash");
});

test("can-use-toolRules contains allowlist and catch-all deny (REQ-WTR-17 case 17)", () => {
  const pkg = createManagerPackage();
  const meta = pkg.metadata as WorkerMetadata;
  expect(meta.can-use-toolRules).toBeDefined();
  const rules = meta.can-use-toolRules!;

  // First rule: allow specific git commands
  expect(rules[0].tool).toBe("Bash");
  expect(rules[0].allow).toBe(true);
  expect(rules[0].commands).toContain("git status");
  expect(rules[0].commands).toContain("git log *");
  expect(rules[0].commands).toContain("git diff *");
  expect(rules[0].commands).toContain("git show *");

  // Last rule: catch-all deny
  const lastRule = rules[rules.length - 1];
  expect(lastRule.tool).toBe("Bash");
  expect(lastRule.allow).toBe(false);
  expect(lastRule.reason).toBeDefined();
});
```

#### Package validation (test case 18)

The existing test at `apps/daemon/tests/services/manager-worker.test.ts:54-58` already validates `createManagerPackage()` output against `workerMetadataSchema.safeParse()`. After Step 2 adds `can-use-toolRules` referencing `"Bash"` with `"Bash"` in `builtInTools`, this test automatically verifies REQ-SBX-15 compliance for the Guild Master. No new test needed for this case.

For Octavia's `package.json` (REQ-WTR-17 case 18): the package discovery process in `lib/packages.ts` runs `workerMetadataSchema.safeParse()` at runtime when the daemon starts. A dedicated test that reads and validates the actual file would be stronger but is not strictly necessary since the Zod schema is the same one tested in `lib/tests/packages.test.ts`. If the implementer wants to add one, it belongs in `lib/tests/packages.test.ts`:

```typescript
test("guild-hall-writer package.json passes workerMetadataSchema validation", async () => {
  const pkgJson = JSON.parse(
    await fs.readFile("packages/guild-hall-writer/package.json", "utf-8")
  );
  const result = workerMetadataSchema.safeParse(pkgJson.guildHall);
  expect(result.success).toBe(true);
});
```

This is optional. The plan marks it as a recommended addition, not a requirement.

**Verification**: `bun test apps/daemon/tests/services/manager-worker.test.ts apps/daemon/tests/services/manager/worker.test.ts` passes.

### Step 5: Full suite verification

**Addresses**: All REQ-WTR-* via automated verification
**Depends on**: Steps 1-4

Run the full check sequence:

1. `bun run typecheck` passes
2. `bun run lint` passes
3. `bun test` passes (full suite, all existing + new tests)

The pre-commit hook enforces all three plus a production build.

## Constraints

**No code changes outside the plan.** The infrastructure is complete. This plan touches exactly two production files and two to three test files. No type changes, no resolver changes, no SDK runner changes.

**Pre-commit hook sequencing.** Steps 1 and 2 change production code. Step 4 changes test assertions that will fail until the production changes are in place. Steps 1, 2, and 4 should be committed together so the pre-commit hook's test run passes. Step 3 (new tests) can be a separate commit because it adds new tests, not fixes broken assertions.

**Two test files for the same module.** `apps/daemon/tests/services/manager-worker.test.ts` and `apps/daemon/tests/services/manager/worker.test.ts` both test `createManagerPackage()`. Both have `builtInTools` assertions that need updating. The newer file (`manager/worker.test.ts`) has less coverage but imports `CanUseToolRule`. The older file (`manager-worker.test.ts`) has schema validation and richer posture content tests. Both must be updated.

## Delegation Guide

This is a small, focused change. Two production files, two to three test files. No architecture decisions, no new patterns, no DI wiring.

**Dalton (Implementation + assertion fixes, Steps 1-2 and assertion updates from Step 4)**: The package.json edit (Step 1) is a JSON change. The worker.ts edit (Step 2) adds two fields to a metadata object literal. The assertion updates (partial Step 4) fix the `builtInTools` expectations in both manager test files. All three should be in one commit so the pre-commit hook passes.

**Sable (New tests, Steps 3-4 new test cases)**: The can-use-tool callback tests (Step 3) are 15 test cases following the established pattern in sdk-runner.test.ts. The manager metadata tests (Step 4) are 2-3 test cases. Second commit after Dalton's.

**Thorne (Review, Step 5)**: Fresh-context review. Key things to check:
- Octavia's rules correctly deny `rm -rf .lore/` (the spec is specific about this, REQ-WTR-7)
- Guild Master's `git diff -- src/lib/foo.ts` is correctly denied (the `*` glob does not match `/`)
- Both workers get sandbox settings automatically (confirm no manual sandbox configuration was added)
- The existing `workerMetadataSchema` test at `manager-worker.test.ts:54-58` still passes (REQ-SBX-15 compliance)

### Commission structure

| Commission | Worker | Steps | Can start when |
|-----------|--------|-------|----------------|
| A: Implementation + fixture fixes | Dalton | 1, 2, assertion updates from 4 | Now |
| B: New tests | Sable | 3, new test cases from 4 | Commission A complete |
| C: Review | Thorne | 5 | Commission B complete |

Commissions A and B cannot run in parallel because Step 4's assertion updates must be committed with the production changes (pre-commit hook). Step 3's new tests can be committed separately.

## Nothing Missing

The spec accounts for all seven workers (Dalton, Sable, Octavia, Guild Master, Thorne, Verity, Edmund). Five workers get no changes (REQ-WTR-1, WTR-2, WTR-14, WTR-15, WTR-16). Two workers get Bash + rules. The infrastructure is fully implemented and tested. Package validation catches authoring errors. The sandbox auto-activates. No gaps between spec assumptions and implementation reality.
