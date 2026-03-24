---
title: Worker Tool Boundaries
date: 2026-03-22
status: executed
tags: [workers, toolbox, security, permissions, bash, posture, git-readonly]
modules: [daemon-services, toolbox-resolver, sdk-runner, worker-packages]
related:
  - .lore/specs/workers/worker-tool-boundaries.md
  - .lore/brainstorm/worker-tool-permissions.md
  - .lore/_abandoned/specs/worker-tool-rules.md
  - .lore/plans/workers/tool-availability-enforcement.md
---

# Plan: Worker Tool Boundaries

## Spec Reference

**Spec**: `.lore/specs/workers/worker-tool-boundaries.md`
**Brainstorm**: `.lore/brainstorm/worker-tool-permissions.md`

Requirements addressed:
- REQ-WTB-1 through REQ-WTB-4: git-readonly toolbox creation and registration -> Phase 1
- REQ-WTB-5: Worker systemToolboxes declaration -> Phase 3
- REQ-WTB-6: Bash-retaining workers unchanged -> Phase 3 (verification only)
- REQ-WTB-7: Bash-losing workers gain git-readonly -> Phase 3
- REQ-WTB-8: Guild Master has no Write or Edit -> Phase 3 (already true, verification only)
- REQ-WTB-9, REQ-WTB-10, REQ-WTB-11: Posture strengthening -> Phase 4
- REQ-WTB-12 through REQ-WTB-15: canUseToolRules removal -> Phase 2
- REQ-WTB-16, REQ-WTB-17: Spec status updates -> Phase 5
- REQ-WTB-18: Enforcement model documentation -> Verified by spec itself

## Codebase Context

**canUseToolRules surface area.** 23 source/test files reference `canUseToolRules`. The type is defined in `lib/types.ts` (CanUseToolRule interface, WorkerMetadata field, ResolvedToolSet field). Zod validation in `lib/packages.ts` enforces that rules only reference tools in `builtInTools` (REQ-SBX-15). The toolbox resolver at `daemon/services/toolbox-resolver.ts:148-157` uses it to build a gated-tools set that excludes those tools from `allowedTools`. The SDK runner at `daemon/lib/agent-sdk/sdk-runner.ts:280-320` builds a `canUseTool` callback from the rules and passes it to the SDK at line 565.

**Toolbox factory pattern.** System toolboxes follow `ToolboxFactory = (deps: GuildHallToolboxDeps) => ToolboxOutput`. The `ToolboxOutput` contains a single `server: McpSdkServerConfigWithInstance`. Registration is in `SYSTEM_TOOLBOX_REGISTRY` (name-to-factory map) at `toolbox-resolver.ts:24`. Currently only `manager` is registered. The resolver iterates `worker.systemToolboxes` and looks up each name in the registry.

**Git subprocess pattern.** `daemon/lib/git.ts` exports `runGit(cwd, args, opts?)` which spawns git with `cleanGitEnv()` isolation. Returns `{ stdout, stderr, exitCode }`. This is the function the git-readonly toolbox should use internally.

**Worker assignments today:**

| Worker | Package | Has Bash | Has canUseToolRules | systemToolboxes |
|--------|---------|----------|---------------------|-----------------|
| Guild Master | built-in | Yes | Yes (2 rules) | ["manager"] |
| Dalton | developer | Yes | No | none |
| Sable | test-engineer | Yes | No | none |
| Octavia | writer | Yes | Yes (2 rules) | none |
| Celeste | visionary | Yes | Yes (2 rules) | none |
| Sienna | illuminator | Yes | Yes (1 rule) | none |
| Verity | researcher | **No** | No | none |
| Thorne | reviewer | No | No | none |
| Edmund | steward | No | No | none |

**Discrepancy: Verity and Bash.** The spec (REQ-WTB-6) lists Verity as "Keep Bash" with reason "Lore-development skills invoke Bash." But `guild-hall-researcher/package.json` does not include Bash in `builtInTools`. Either Verity never had Bash, or it was removed in a prior change. Since Verity doesn't have Bash today, "Keep" means "leave unchanged" (no Bash). If lore-development skills require Bash and Verity uses them, that's a pre-existing gap, not something this plan introduces. The posture strengthening for Verity (REQ-WTB-10) should still include the "must not modify source code" boundary, but the Bash-specific clause is moot.

**Guild Master Write/Edit.** REQ-WTB-8 requires the Guild Master has no Write or Edit. Current `builtInTools: ["Read", "Glob", "Grep", "Bash"]` already satisfies this. No change needed, but the plan verifies it.

## Implementation Steps

### Phase 1: Build the git-readonly Toolbox

This phase is purely additive. No existing code breaks. The toolbox can be built, tested, and committed before anything else changes.

#### Step 1.1: Create the toolbox implementation

**Files**: `daemon/services/git-readonly-toolbox.ts` (new)
**Addresses**: REQ-WTB-1, REQ-WTB-2, REQ-WTB-3

Create a new file following the same pattern as `daemon/services/base-toolbox.ts` and `daemon/services/manager/toolbox.ts`. Export a `gitReadonlyToolboxFactory` function with signature `(deps: GuildHallToolboxDeps) => ToolboxOutput`.

The toolbox creates an MCP server named `"guild-hall-git-readonly"` with five tools:

| Tool | Parameters | Returns |
|------|-----------|---------|
| `git_status` | none | Structured object: `{ staged: string[], unstaged: string[], untracked: string[] }` |
| `git_log` | `count?: number`, `since?: string`, `author?: string`, `format?: string` | Array of commit objects: `{ hash, author, date, subject, body? }` |
| `git_diff` | `staged?: boolean`, `ref?: string`, `file?: string` | Unified diff string |
| `git_show` | `ref: string` (required) | Commit object with diff: `{ hash, author, date, subject, body, diff }` |
| `git_branch` | `all?: boolean`, `remote?: boolean` | Array of branch objects: `{ name, current: boolean }` |

Each tool internally calls `runGit()` from `daemon/lib/git.ts` with `cleanGitEnv()`. The working directory comes from `deps` (the session's CWD, which the toolbox resolver can thread through, or from `process.cwd()` in the MCP handler context).

Implementation notes:
- Parse git output into structured data inside each handler. `git log` with `--format` flags produces parseable output. `git status --porcelain=v1` gives machine-readable status. `git branch --format` gives clean branch names.
- `git_diff` and `git_show` return the diff as a string (not parsed further). Diffs are consumed as text by the LLM anyway.
- The toolbox must NOT implement any write operations (REQ-WTB-3). No `git commit`, `git push`, `git checkout`, `git reset`, `git rebase`, `git merge`, `git stash`, `git tag`. The tool set is exhaustive per spec.
- CWD for git commands: the MCP server handlers need the working directory. Thread it through deps or capture it at factory time. The toolbox-resolver already has `context.workspaceDir` available via the prep flow, but `GuildHallToolboxDeps` doesn't currently include it. Two options: (a) add a `workingDirectory` field to `GuildHallToolboxDeps`, or (b) use the session's CWD via `process.cwd()` since the SDK sets it. Option (b) is fragile. Option (a) is the clean approach. Add `workingDirectory?: string` to `GuildHallToolboxDeps` in `toolbox-types.ts` and populate it from the resolver context.

**Expertise**: None special. Standard MCP tool implementation.

#### Step 1.2: Register in the system toolbox registry

**Files**: `daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-WTB-4

Add `"git-readonly": gitReadonlyToolboxFactory` to `SYSTEM_TOOLBOX_REGISTRY`. Import the factory from the new file.

#### Step 1.3: Thread workingDirectory through deps

**Files**: `daemon/services/toolbox-types.ts`, `daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-WTB-1 (toolbox needs CWD to run git)

Add `workingDirectory?: string` to `GuildHallToolboxDeps`. In `resolveToolSet`, populate it from whatever context field carries the workspace directory. The `ToolboxResolverContext` doesn't currently have it, but `SessionPrepSpec.workspaceDir` does. Either:
- Add `workingDirectory` to `ToolboxResolverContext` and have `prepareSdkSession` pass it through, or
- Add it to `ToolboxResolverContext` and populate in `resolveToolSet`

The first option is cleaner. Add `workingDirectory?: string` to `ToolboxResolverContext`. The SDK runner's `prepareSdkSession` already has `spec.workspaceDir` available when constructing the resolver context object (around line 343). Pass it through.

#### Step 1.4: Unit tests for git-readonly toolbox

**Files**: `tests/daemon/services/git-readonly-toolbox.test.ts` (new)
**Addresses**: REQ-WTB-2, REQ-WTB-3 (AI Validation: structured data, not raw output)

Tests with mocked `runGit`:
- `git_status` returns structured `{ staged, unstaged, untracked }`, not raw porcelain output
- `git_log` with default params returns array of commit objects with expected fields
- `git_log` with `count`, `since`, `author` filters passes correct args to runGit
- `git_diff` with no args returns full diff, with `staged: true` passes `--cached`, with `ref` passes ref range, with `file` scopes to file
- `git_show` with a ref returns commit object with diff
- `git_branch` returns array of branch objects with `current` marker
- `git_branch` with `all: true` passes `--all`, `remote: true` passes `--remotes`
- No write operations exist in the tool definitions (verify tool names against exhaustive list)

DI approach: the toolbox factory accepts `deps` which can include a mock `runGit` function, or inject via the same pattern base-toolbox uses. If `runGit` is imported directly, the test should mock at the subprocess level (mock `Bun.spawn` or use a DI seam). The cleanest approach: accept a `gitRunner` function in deps or use a factory parameter, similar to how other toolboxes use `deps.services` for DI.

#### Step 1.5: Integration test for toolbox resolver

**Files**: `tests/daemon/toolbox-resolver.test.ts`
**Addresses**: REQ-WTB-4, REQ-WTB-5 (AI Validation: integration test)

Add a test: a worker with `systemToolboxes: ["git-readonly"]` and no Bash in `builtInTools` produces a resolved tool set that includes the git-readonly MCP server and does NOT include Bash in `allowedTools` or `builtInTools`.

---

### Phase 2: Remove canUseToolRules

This is a coordinated removal across types, validation, resolver, SDK runner, and all declarations. Every change in this phase is a deletion. No new behavior is added. All changes should land in a single commit to avoid intermediate states where the type exists but references are broken.

#### Step 2.1: Remove from type definitions

**Files**: `lib/types.ts`
**Addresses**: REQ-WTB-12

- Delete the `CanUseToolRule` interface (lines 237-248)
- Remove `canUseToolRules?: CanUseToolRule[]` from `WorkerMetadata` (line 200)
- Remove `canUseToolRules: CanUseToolRule[]` from `ResolvedToolSet` (line 254)

#### Step 2.2: Remove from package validation

**Files**: `lib/packages.ts`
**Addresses**: REQ-WTB-12

- Remove the `canUseToolRuleSchema` Zod definition
- Remove `canUseToolRules: z.array(canUseToolRuleSchema).optional()` from the worker metadata schema
- Remove the `superRefine` block that validates rules reference only `builtInTools` (lines 86-97)

#### Step 2.3: Remove from toolbox resolver

**Files**: `daemon/services/toolbox-resolver.ts`
**Addresses**: REQ-WTB-14

Remove the gated-tools logic at lines 148-157. The `allowedTools` assembly simplifies to:
```typescript
const allowedTools = [
  ...worker.builtInTools,
  ...mcpServers.map((s) => `mcp__${s.name}__*`),
];
```

Remove `canUseToolRules` from the return statement (line 157). The `ResolvedToolSet` return no longer includes it.

#### Step 2.4: Remove from SDK runner

**Files**: `daemon/lib/agent-sdk/sdk-runner.ts`
**Addresses**: REQ-WTB-13

- Delete the `buildCanUseTool` function (lines 280-320)
- Delete the `TOOL_PATH_FIELD` constant (lines 267-273) since it's only used by `buildCanUseTool`
- Remove the `canUseTool` callback construction at lines 540-544
- Remove `...(canUseToolCallback ? { canUseTool: canUseToolCallback } : {})` from the options object (line 565)
- Remove the `CanUseToolRule` import from the import statement (line 15)
- Remove `micromatch` import (line 10) if no other usage remains in this file

Check: does `sdk-runner.ts` use `micromatch` for anything else? If not, remove the import. The `canUseTool` type definition in `SdkQueryOptions` (lines 81-88) should remain since it's the SDK's type, not ours. We just stop populating it.

Also in this file: the sub-agent construction in `prepareSdkSession` (around line 456) builds a dummy `resolvedTools` object containing `canUseToolRules: []`. Remove `canUseToolRules` from that object literal as well. This is a second callsite in the same file, inside the `resolvedTools` field of `subActivationContext`.

#### Step 2.5: Remove from Guild Master declaration

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-WTB-15

Remove the `canUseToolRules` array from `createManagerPackage()` (lines 128-144).

#### Step 2.6: Remove from worker packages

**Files**: `packages/guild-hall-writer/package.json`, `packages/guild-hall-visionary/package.json`, `packages/guild-hall-illuminator/package.json`
**Addresses**: REQ-WTB-15

Remove the `canUseToolRules` field from the `guildHall` section of each package.json.

#### Step 2.7: Update all test fixtures

**Files**: 18 test files (see list below)
**Addresses**: REQ-WTB-12

Every test that constructs a `ResolvedToolSet` or `WorkerMetadata` with `canUseToolRules` needs the field removed. Every test that asserts on `canUseToolRules` behavior needs removal or replacement.

Test files referencing `canUseToolRules`:
1. `tests/packages/guild-hall-illuminator/integration.test.ts`
2. `tests/packages/worker-activation.test.ts`
3. `tests/packages/worker-role-smoke.test.ts`
4. `tests/daemon/services/sdk-runner.test.ts` (heaviest: ~20 occurrences including canUseTool callback tests)
5. `tests/daemon/toolbox-resolver.test.ts`
6. `tests/lib/packages.test.ts`
7. `tests/daemon/services/commission/orchestrator.test.ts`
8. `tests/daemon/services/manager-context.test.ts`
9. `tests/daemon/services/manager-worker.test.ts`
10. `tests/daemon/services/manager/worker.test.ts`
11. `tests/daemon/services/meeting/orchestrator.test.ts`
12. `tests/daemon/services/meeting/recovery.test.ts`
13. `tests/daemon/integration-commission.test.ts`
14. `tests/daemon/integration.test.ts`
15. `tests/daemon/meeting-project-scope.test.ts`
16. `tests/daemon/meeting-session.test.ts`
17. `tests/daemon/notes-generator.test.ts`
18. `tests/daemon/services/briefing-generator.test.ts`

For most files (items 1-3, 6-18), the fix is mechanical: remove `canUseToolRules: []` from object literals. For `sdk-runner.test.ts` (item 4) and `toolbox-resolver.test.ts` (item 5), tests that specifically test canUseToolRules behavior (gated tools, canUseTool callback construction, rule matching) should be deleted entirely.

**Expertise**: None special. Mechanical deletion. But the volume (18 files) means this step is the longest in the phase. A sub-agent should handle it to avoid context exhaustion.

---

### Phase 3: Update Worker Assignments

These changes depend on Phase 1 (git-readonly exists) and Phase 2 (canUseToolRules removed). They modify worker metadata to match the spec's assignment table.

#### Step 3.1: Guild Master loses Bash, gains git-readonly

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-WTB-7, REQ-WTB-8

In `createManagerPackage()`:
- Change `builtInTools` from `["Read", "Glob", "Grep", "Bash"]` to `["Read", "Glob", "Grep"]`
- Change `systemToolboxes` from `["manager"]` to `["manager", "git-readonly"]`

Verify: `builtInTools` does not contain "Write" or "Edit" (already true).

#### Step 3.2: Thorne gains git-readonly

**Files**: `packages/guild-hall-reviewer/package.json`
**Addresses**: REQ-WTB-7

Add `"systemToolboxes": ["git-readonly"]` to the `guildHall` section. Thorne's `builtInTools` stays `["Skill", "Task", "Read", "Glob", "Grep"]` (no Bash, no Write, no Edit).

#### Step 3.3: Edmund gains git-readonly

**Files**: `packages/guild-hall-steward/package.json`
**Addresses**: REQ-WTB-7

Add `"systemToolboxes": ["git-readonly"]` to the `guildHall` section. Edmund's `builtInTools` stays `["Skill", "Task", "Read", "Glob", "Grep", "Write", "Edit"]`.

#### Step 3.4: Verify unchanged workers

**Addresses**: REQ-WTB-6

Dalton (`guild-hall-developer`) and Sable (`guild-hall-test-engineer`) retain Bash with no changes. Octavia, Celeste, Sienna retain Bash. Verity retains current config (no Bash, no change). No file modifications, but the test suite should assert these remain correct.

#### Step 3.5: Update manager/worker tests

**Files**: `tests/daemon/services/manager/worker.test.ts`, `tests/daemon/services/manager-worker.test.ts`
**Addresses**: REQ-WTB-7

Update assertions:
- Guild Master `builtInTools` no longer includes "Bash"
- Guild Master `systemToolboxes` includes "git-readonly"

---

### Phase 4: Strengthen Posture

Posture is the behavioral constraint for Bash-capable workers (REQ-WTB-9). The posture text lives in the `posture` field of each worker's `package.json` (or `MANAGER_POSTURE_BASE` for Guild Master). These are string values, not code, so the changes are text edits with no compilation impact.

#### Step 4.1: Guild Master posture

**Files**: `daemon/services/manager/worker.ts`
**Addresses**: REQ-WTB-10

Add to `MANAGER_POSTURE_BASE`: "You must not implement changes yourself. When work needs doing, dispatch the worker who does it. You do not use Bash or write files to accomplish tasks directly."

Note: since the Guild Master is losing Bash entirely in Phase 3, this posture clause is reinforcement, not the primary constraint. The primary constraint is tool availability. But posture still matters because the Guild Master has Write/Edit-capable sub-agents available via Task.

Wait, actually: the Guild Master does NOT have Write or Edit in builtInTools, and doesn't have Bash after Phase 3. The posture boundary about not implementing changes is still relevant because the Guild Master can dispatch commissions. The boundary clarifies that when work needs doing, he dispatches rather than doing it inline.

#### Step 4.2: Octavia posture

**Files**: `packages/guild-hall-writer/package.json`
**Addresses**: REQ-WTB-10

Add or strengthen in posture: "Must not modify source code files. Bash usage is limited to .lore/ file operations (rm, mkdir, mv). Reads code to inform writing; does not change it."

Check current posture first. If it already says something similar, make it more specific per the spec table. The spec wording should be used directly.

#### Step 4.3: Celeste posture

**Files**: `packages/guild-hall-visionary/package.json`
**Addresses**: REQ-WTB-10

Add or strengthen: "Must not modify source code files. Bash usage is limited to .lore/ file operations within brainstorm and issue domains. Reads the full system state; proposes improvements; does not implement them."

#### Step 4.4: Verity posture

**Files**: `packages/guild-hall-researcher/package.json`
**Addresses**: REQ-WTB-10

Add or strengthen: "Must not modify source code files. Ventures beyond the guild walls to gather intelligence; never touches the forge."

Note: The spec's Bash clause ("Bash usage is limited to .lore/ file operations for research artifacts") is moot since Verity doesn't have Bash. However, Verity does have Write and Edit in `builtInTools`, which are file-modification tools. The "must not modify source code files" posture boundary constrains Write and Edit usage to research artifacts (`.lore/` content), not just hypothetical Bash operations. This boundary matters even without Bash. Include it.

If the implementer discovers that Verity actually needs Bash for lore-development skills, that's a scope expansion decision for the user, not something to add silently.

#### Step 4.5: Sienna posture

**Files**: `packages/guild-hall-illuminator/package.json`
**Addresses**: REQ-WTB-10

Add or strengthen: "Must not modify source code files. Bash usage is limited to .lore/ file operations for visual asset management."

---

### Phase 5: Spec Hygiene

#### Step 5.1: Mark worker-tool-rules.md as superseded

**Files**: `.lore/specs/workers/worker-tool-rules.md`
**Addresses**: REQ-WTB-16

Change frontmatter `status: approved` to `status: superseded`. Add to the top of the body: "Superseded by [Worker Tool Boundaries](worker-tool-boundaries.md). The canUseToolRules mechanism has been removed. See REQ-WTB-12 through REQ-WTB-15."

#### Step 5.2: Update sandboxed-execution.md

**Files**: `.lore/specs/infrastructure/sandboxed-execution.md`
**Addresses**: REQ-WTB-17

Add a note to Phase 2 (Gate 3 / canUseTool callback) section indicating it has been superseded by the worker-tool-boundaries spec. Phase 1 (SDK sandbox) remains in effect.

---

### Phase 6: Validate Against Spec

#### Step 6.1: Run full test suite

Ensure all 3200+ tests pass after all phases are complete.

#### Step 6.2: Spec coverage check

Launch a sub-agent that reads the spec at `.lore/specs/workers/worker-tool-boundaries.md`, reviews the implementation across all changed files, and flags any requirements not met. This step is not optional.

Specific validations from the spec's AI Validation section:
- Each git-readonly tool returns structured data, not raw command output passed through
- Integration test: worker with `systemToolboxes: ["git-readonly"]` and no Bash has no Bash in `tools` parameter
- Posture review: fresh-context sub-agent reads each updated posture and confirms the Bash boundary is unambiguous

## Delegation Guide

| Phase | Steps | Worker | Expertise |
|-------|-------|--------|-----------|
| Phase 1 | 1.1-1.5 | Dalton | Standard toolbox implementation, git subprocess handling |
| Phase 2 | 2.1-2.8 | Dalton | Mechanical deletion, high volume (18 test files) |
| Phase 3 | 3.1-3.5 | Dalton | Config changes, test updates |
| Phase 4 | 4.1-4.5 | Octavia or Dalton | Text editing in posture fields |
| Phase 5 | 5.1-5.2 | Octavia | Spec maintenance (lore artifact edits) |
| Phase 6 | 6.1-6.2 | Thorne | Fresh-context review, posture review |

Phases 1-3 are implementation-heavy and should go to Dalton as a single commission (or split Phase 1 and Phases 2-3 if the turn budget is a concern). Phase 4 is text-only and can be combined with Phase 3. Phase 5 is lore maintenance. Phase 6 is independent review.

Recommended commission structure:
1. **Commission A** (Dalton): Phases 1-4. Build git-readonly, remove canUseToolRules, update assignments, strengthen posture. All code and config changes in one pass.
2. **Commission B** (Thorne): Phase 6. Review the implementation against the spec. Fresh context catches what the implementer misses.
3. **Commission C** (Octavia or manual): Phase 5. Spec status updates. Low-risk, can be done any time after Phase 2.

## Open Questions

**Verity Bash status.** The spec says "Keep" for Verity's Bash, but the package currently has no Bash. If lore-development skills that Verity uses actually need Bash (e.g., for file operations via plugin hooks), the skills will fail silently when Verity runs them. This is a pre-existing gap. If it needs fixing, that's a separate scope decision: add Bash to Verity with posture boundaries, or fix the skills to not require Bash. Not a blocker for this plan.

**workingDirectory threading.** The git-readonly toolbox needs to know which directory to run git commands in. The plan proposes adding `workingDirectory` to `GuildHallToolboxDeps` and `ToolboxResolverContext`. This is a minor schema expansion. If the implementer finds a simpler approach (e.g., the MCP server handler can infer CWD from the SDK session), that's acceptable too. The constraint is: git commands must run in the correct worktree, not in the daemon's CWD.

**micromatch removal.** After removing `buildCanUseTool`, check whether `sdk-runner.ts` still imports micromatch for any other purpose. If not, remove the import and potentially the dependency (check other files first).
