---
title: "Review: Worker Tool Boundaries Implementation"
date: 2026-03-22
type: review
tags: [review, workers, toolbox, security, permissions, bash, git-readonly, posture]
spec: .lore/specs/workers/worker-tool-boundaries.md
plan: .lore/plans/workers/worker-tool-boundaries.md
implementation: commission-Dalton-20260322-115736
reviewer: Thorne
---

# Review: Worker Tool Boundaries Implementation

Implementation commission: `commission-Dalton-20260322-115736` (209f3b2)
37 files changed, 839 insertions, 893 deletions.

## Test Results

3367 pass, 4 skip, 0 fail across 147 files. All tests pass.

## Requirement Coverage

### REQ-WTB-1: git-readonly toolbox exists — SATISFIED

`daemon/services/git-readonly-toolbox.ts` (276 lines). Provides MCP tools via `createSdkMcpServer`. Tools accept structured parameters (Zod schemas) and return structured JSON data. Git subprocess calls are wrapped through `cleanGitEnv()` and are not exposed to the caller.

The DI approach is clean: `GitRunner` type is exported, `defaultRunGit` is used in production, and tests inject a mock runner directly through `createGitReadonlyTools(workingDirectory, mockRunner)`. No module mocking needed.

### REQ-WTB-2: Five read-only git tools — SATISFIED

| Tool | Returns structured data | Evidence |
|------|------------------------|----------|
| `git_status` | `{ staged[], unstaged[], untracked[] }` | `parseGitStatus` parses `--porcelain=v1` output |
| `git_log` | Array of `{ hash, author, date, subject, body? }` | `parseGitLog` uses custom separators |
| `git_diff` | Unified diff string | Spec allows string (line 85 of plan) |
| `git_show` | `{ hash, author, date, subject, body?, diff }` | Structured commit + diff |
| `git_branch` | Array of `{ name, current }` | `parseGitBranch` handles `* ` prefix |

### REQ-WTB-3: No write operations — SATISFIED

Tool names are exhaustive: `git_status`, `git_log`, `git_diff`, `git_show`, `git_branch`. No commit, push, checkout, reset, rebase, merge, stash, or tag tools exist. Test at line 280 of `git-readonly-toolbox.test.ts` explicitly verifies the tool set is exactly these five.

### REQ-WTB-4: Registered in SYSTEM_TOOLBOX_REGISTRY — SATISFIED

`toolbox-resolver.ts:27`: `"git-readonly": gitReadonlyToolboxFactory`. Follows the same pattern as the `manager` entry.

### REQ-WTB-5: Workers declare via systemToolboxes — SATISFIED

Thorne (`guild-hall-reviewer/package.json`): `"systemToolboxes": ["git-readonly"]`
Edmund (`guild-hall-steward/package.json`): `"systemToolboxes": ["git-readonly"]`
Guild Master (`manager/worker.ts:127`): `systemToolboxes: ["manager", "git-readonly"]`

### REQ-WTB-6: Bash-retaining workers unchanged — SATISFIED

| Worker | Package | Bash in builtInTools | canUseToolRules absent |
|--------|---------|---------------------|----------------------|
| Dalton | guild-hall-developer | Yes | Yes |
| Sable | guild-hall-test-engineer | Yes | Yes |
| Octavia | guild-hall-writer | Yes | Yes |
| Celeste | guild-hall-visionary | Yes | Yes |
| Sienna | guild-hall-illuminator | Yes | Yes |

Verity (`guild-hall-researcher`) does not have Bash. The spec says "Keep" but the plan correctly identified this as pre-existing: Verity never had Bash. No change was made. This is correct.

### REQ-WTB-7: Bash-losing workers gain git-readonly — SATISFIED

| Worker | Bash removed | git-readonly added |
|--------|-------------|-------------------|
| Guild Master | Yes (was `["Read", "Glob", "Grep", "Bash"]`, now `["Read", "Glob", "Grep"]`) | Yes (`systemToolboxes: ["manager", "git-readonly"]`) |
| Thorne | Never had it | Yes (`systemToolboxes: ["git-readonly"]`) |
| Edmund | Never had it | Yes (`systemToolboxes: ["git-readonly"]`) |

### REQ-WTB-8: Guild Master has no Write or Edit — SATISFIED

`manager/worker.ts:129`: `builtInTools: ["Read", "Glob", "Grep"]`. No Write, no Edit, no Bash.

### REQ-WTB-9, REQ-WTB-10: Posture strengthening — SATISFIED

Each posture reviewed below against the spec's table.

**Guild Master** (`manager/worker.ts:63`):
> "You must not implement changes yourself. When work needs doing, dispatch the worker who does it. You do not write files or modify code to accomplish tasks directly."

Matches spec. The boundary is unambiguous: no implementing, no file writes, dispatch only. Since Bash is removed from builtInTools, this is reinforcement, not the primary constraint. Appropriate.

**Octavia** (`guild-hall-writer/posture.md`):
> "Must not modify source code files. Bash limited to `.lore/` operations only."

Matches spec. Clear boundary: source code is off-limits, Bash scoped to `.lore/`.

**Celeste** (`guild-hall-visionary/posture.md`):
> "Must not modify source code. Bash limited to `.lore/` operations (brainstorm and issue domains)."

Matches spec. Slightly more specific than Octavia, scoping to brainstorm and issue domains.

**Verity** (`guild-hall-researcher/posture.md`):
> "Must not modify source code."

The spec says: "Ventures beyond the guild walls to gather intelligence; never touches the forge. Bash usage is limited to .lore/ file operations for research artifacts." The Bash clause is moot (Verity has no Bash). The "must not modify source code" boundary is present. The "never touches the forge" phrasing appears in Verity's identity description, not posture. This is acceptable: identity + posture together communicate the boundary.

**Sienna** (`guild-hall-illuminator/posture.md`):
> "Must not modify source code. Bash limited to `.lore/` operations for visual asset management."

Matches spec.

### REQ-WTB-11: Posture is behavioral guidance — SATISFIED BY DESIGN

The posture boundaries are system prompt instructions, not enforced callbacks. This is the intended model per the spec.

### REQ-WTB-12: canUseToolRules removed from WorkerMetadata — SATISFIED

`lib/types.ts`: `WorkerMetadata` has no `canUseToolRules` field. `CanUseToolRule` interface is gone. `ResolvedToolSet` has no `canUseToolRules` field.

### REQ-WTB-13: canUseTool callback removed from SDK runner — SATISFIED

`daemon/lib/agent-sdk/sdk-runner.ts`: `buildCanUseTool` function gone. `TOOL_PATH_FIELD` constant gone. `micromatch` import gone. The `canUseTool` field in `SdkQueryOptions` (line 79) remains as an SDK type definition, correctly left in place.

### REQ-WTB-14: canUseToolRules removed from toolbox resolver — SATISFIED

`toolbox-resolver.ts`: No gated-tools logic. `allowedTools` is a clean union of `builtInTools` and MCP server wildcards.

### REQ-WTB-15: canUseToolRules removed from all worker declarations — SATISFIED

Grep confirms zero occurrences in `packages/*/package.json` and `daemon/services/manager/worker.ts`.

### REQ-WTB-16: worker-tool-rules.md marked superseded — NOT SATISFIED

**Finding DEFECT-1.** `.lore/specs/workers/worker-tool-rules.md` still has `status: implemented`. The spec requires `status: superseded` with a reference to the worker-tool-boundaries spec. This was Plan Phase 5, Step 5.1, delegated to Octavia.

Note: Octavia's commission (`commission-Octavia-20260322-115934`) has been executed on a separate branch (`cedcbdd`). If that commission handled this, it will be merged separately. But in the current codebase state, this requirement is not met.

### REQ-WTB-17: sandboxed-execution.md Phase 2 superseded — NOT SATISFIED

**Finding DEFECT-2.** `.lore/specs/infrastructure/sandboxed-execution.md` has no superseded note on Phase 2. The spec requires Phase 2 (Gate 3, canUseTool callback) to be marked as superseded by the worker-tool-boundaries spec. Same delegation situation as DEFECT-1.

### REQ-WTB-18: Enforcement model documented — SATISFIED BY SPEC

The two-gate-plus-posture model is documented in the spec itself. No separate documentation artifact was required.

## AI Validation Checks

### Structured data, not raw output — PASS

Each tool parses git output into structured JSON before returning. `git_status` uses `parseGitStatus` on `--porcelain=v1` output. `git_log` uses `parseGitLog` with custom delimiters. `git_branch` uses `parseGitBranch`. `git_show` parses header fields and includes diff. `git_diff` returns the diff as a string, which is correct per spec (diffs are consumed as text).

Test file `git-readonly-toolbox.test.ts` explicitly asserts structured return types: objects with typed fields, not raw strings passed through.

### Integration test: no Bash in resolved tools — PASS

`toolbox-resolver.test.ts` lines 655-714: A worker with `systemToolboxes: ["git-readonly"]`, `builtInTools: ["Read", "Glob", "Grep"]` (no Bash) produces a `ResolvedToolSet` where:
- `allowedTools` includes `mcp__guild-hall-git-readonly__*`
- `allowedTools` does not include `"Bash"`
- `builtInTools` does not include `"Bash"`
- `mcpServers` includes the git-readonly MCP server

### Posture review: Bash boundary unambiguous — PASS

All five posture updates reviewed above. Each states "must not modify source code" in direct language. Bash-scoped workers additionally specify their allowed domain (`.lore/` operations). No hedging, no ambiguity.

## Additional Observations

### WARN-1: git_log format parameter bypasses structured output

`git-readonly-toolbox.ts:172-185`: When the caller passes a custom `format` string, `git_log` returns raw git output instead of structured commit objects. This is by design (the parameter description says "overrides structured output"), and the plan's spec table includes `format?: string`. But it creates a code path where the tool returns unstructured text. Not a defect against the spec, but worth noting: the `format` parameter weakens the "structured data, not raw output" guarantee.

### WARN-2: git_show fails on initial commits

`git-readonly-toolbox.ts:224-226`: The diff is obtained via `git diff ${args.ref}~1 ${args.ref}`. For the initial commit of a repository, `ref~1` doesn't exist and will fail. The `allowNonZero` flag on the diff call handles non-zero exit gracefully (returns empty diff), but the error output from git will be in `stderr`, not surfaced to the caller. This is an edge case that won't arise in normal Guild Hall usage (repos always have history), but the error handling is asymmetric: the header fetch will throw on a bad ref, while the diff silently succeeds with empty content.

### INFO-1: Verity Bash discrepancy resolved correctly

The spec lists Verity as "Keep Bash" but the plan correctly identified that Verity never had Bash. The implementation leaves Verity unchanged (no Bash, no git-readonly). The posture still includes "must not modify source code" which constrains Verity's Write and Edit tools. This is the right call.

## Summary

| Severity | Count | Details |
|----------|-------|---------|
| DEFECT | 2 | Spec hygiene: worker-tool-rules.md not superseded, sandboxed-execution.md Phase 2 not annotated |
| WARN | 2 | git_log format bypass, git_show initial commit edge case |
| INFO | 1 | Verity Bash discrepancy handled correctly |

The core implementation is sound. The git-readonly toolbox is well-structured with clean DI, proper parsing, and comprehensive tests. canUseToolRules removal is complete across all 37 files. Worker assignments match the spec. Posture boundaries are clear and specific. The two defects are both in spec hygiene (Phase 5 of the plan), which was delegated to a separate Octavia commission that appears to have been executed on another branch.

17 of 18 requirements satisfied. The 2 unsatisfied requirements (REQ-WTB-16, REQ-WTB-17) are spec hygiene items that may already be addressed in Octavia's commission branch pending merge.
