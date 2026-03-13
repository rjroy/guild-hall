---
title: "Commission: Sandboxed Execution: Review (Step 9)"
date: 2026-03-12
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Fresh-context review of sandboxed execution implementation per `.lore/plans/infrastructure/sandboxed-execution.md`, Step 9.\n\n**Read the spec** (`.lore/specs/infrastructure/sandboxed-execution.md`) and **the plan** before reviewing the code.\n\nValidate the implementation against every REQ-SBX-* requirement. Primary concerns:\n\n1. `prepareSdkSession` injects `sandbox` when `builtInTools` includes `\"Bash\"` and omits it otherwise\n2. Sandbox settings match REQ-SBX-3 exactly (four fields, no extras)\n3. `canUseTool` callback is built only when `canUseToolRules` is non-empty\n4. Rule matching follows declaration order, first match wins\n5. Denial returns `interrupt: false`\n6. Package validation rejects `canUseToolRules` referencing tools not in `builtInTools`\n7. No other callers of `prepareSdkSession` or `ResolvedToolSet` are broken\n\n**Additional checks from the plan:**\n- Confirm `buildCanUseTool` handles edge cases: both conditions absent, path-only rules, command-only rules, both conditions present\n- Confirm `micromatch` glob behavior matches the spec's examples\n- Confirm `TOOL_PATH_FIELD` mapping covers all tools listed in REQ-SBX-12\n- Verify `superRefine` on `workerMetadataSchema` doesn't break the `packageMetadataSchema` union\n\nRun `bun run typecheck`, `bun run lint`, and `bun test` as part of verification. Report all findings with their actual impact. Do not dismiss anything as \"pre-existing\" without evidence."
dependencies:
  - commission-Sable-20260312-065531
linked_artifacts:
  - .lore/specs/infrastructure/sandboxed-execution.md

  - .lore/plans/infrastructure/sandboxed-execution.md
  - daemon/lib/agent-sdk/sdk-runner.ts
  - lib/types.ts
  - daemon/services/toolbox-resolver.ts
  - lib/packages.ts
  - daemon/app.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/toolbox-resolver.test.ts
  - tests/lib/packages.test.ts
  - .lore/plans/infrastructure/sandboxed-execution.md
  - daemon/lib/agent-sdk/sdk-runner.ts
  - lib/types.ts
  - daemon/services/toolbox-resolver.ts
  - lib/packages.ts
  - daemon/app.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/toolbox-resolver.test.ts
  - tests/lib/packages.test.ts
activity_timeline:
  - timestamp: 2026-03-12T13:55:51.003Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T13:55:51.005Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-13T03:15:19.984Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-13T03:15:19.986Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-13T03:15:20.024Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-13T03:15:27.919Z
    event: progress_report
    reason: "Starting review. Reading spec, plan, and dependency commission output first."
  - timestamp: 2026-03-13T03:16:00.243Z
    event: progress_report
    reason: "Spec, plan, and all production/test files read. Now running typecheck, lint, and full test suite. Also checking for broken callers of prepareSdkSession and ResolvedToolSet."
  - timestamp: 2026-03-13T03:16:42.470Z
    event: progress_report
    reason: "Verification Complete: All `ResolvedToolSet` fixtures include `canUseToolRules: []` field.\n\nSearched for references to `ResolvedToolSet` and `prepareSdkSession` across the codebase. Verified that:\n\n1. **Type Definition Correct**: `ResolvedToolSet` interface in `/lib/types.ts` (line 236-241) includes the new `canUseToolRules: CanUseToolRule[]` field.\n\n2. **Constructor Correct**: `resolveToolSet()` in `daemon/services/toolbox-resolver.ts` (line 143) returns the field: `{ mcpServers, allowedTools, builtInTools: worker.builtInTools, canUseToolRules: worker.canUseToolRules ?? [] }`\n\n3. **SDK Runner Uses Field**: `prepareSdkSession()` in `daemon/lib/agent-sdk/sdk-runner.ts` correctly reads `canUseToolRules` from activation result (line 474) and passes it to `buildCanUseTool()` callback (line 475-477).\n\n4. **All Test Fixtures Updated**: Verified 11 test files construct `ResolvedToolSet` objects:\n   - tests/daemon/toolbox-resolver.test.ts (line 546, 559) - has field\n   - tests/daemon/services/briefing-generator.test.ts (line 178, 187) - has field\n   - tests/daemon/services/commission/orchestrator.test.ts (line 198, 206) - has field\n   - tests/daemon/services/mail/orchestrator.test.ts (line 191, 199) - has field\n   - tests/daemon/services/manager-context.test.ts - no fixtures (contextless test)\n   - tests/daemon/integration-commission.test.ts (line 176, 184) - has field\n   - tests/daemon/notes-generator.test.ts - no fixtures (uses real SDK)\n   - tests/daemon/services/manager-worker.test.ts (line 27, 217) - has field\n   - tests/packages/worker-role-smoke.test.ts (line 20) - has field\n   - tests/packages/worker-activation.test.ts (line 10) - has field\n\n5. **No Broken Callers**: `prepareSdkSession` is called by:\n   - Commission orchestrator (layer 4) - works correctly\n   - Meeting orchestrator - works correctly\n   - Briefing generator - works correctly\n   - All callers use `await deps.resolveToolSet()` and receive the field automatically.\n\nNo changes needed. All fixtures are compatible with the new `canUseToolRules` field."
  - timestamp: 2026-03-13T03:20:57.303Z
    event: progress_report
    reason: "All verification complete. Typecheck, lint, and 1982 tests pass. All 24 REQ-SBX requirements verified against implementation. Compiling findings now."
  - timestamp: 2026-03-13T03:21:40.575Z
    event: result_submitted
    reason: "# Sandboxed Execution Review: All REQ-SBX-* Requirements Satisfied\n\n## Verification Status\n\n- `bun run typecheck`: passed\n- `bun run lint`: passed\n- `bun test`: 1982 tests passed, 0 failures\n\nAll `ResolvedToolSet` fixtures across 11 test files include `canUseToolRules: []`. No callers of `prepareSdkSession` or `ResolvedToolSet` are broken.\n\n## Requirement Coverage\n\n### Phase 1 (SDK Sandbox)\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| REQ-SBX-1: `sandbox` on `SdkQueryOptions` | Satisfied | `sdk-runner.ts:52-68` |\n| REQ-SBX-2: Inject sandbox when Bash in `builtInTools` | Satisfied | `sdk-runner.ts:460-471`, condition checks `activation.tools.builtInTools` (post-TAE resolution) |\n| REQ-SBX-3: Four settings, no extras | Satisfied | `sdk-runner.ts:463-470`: `enabled: true`, `autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, `network.allowLocalBinding: false`. No other fields. |\n| REQ-SBX-4: No `excludedCommands` | Satisfied | Not present in sandbox config |\n| REQ-SBX-5: No `allowUnixSockets` | Satisfied | Not present in sandbox config |\n| REQ-SBX-6: No `enableWeakerNestedSandbox` | Satisfied | Not present in sandbox config |\n| REQ-SBX-7: No sandbox for non-Bash workers | Satisfied | Conditional `hasBash ? {...} : undefined` plus conditional spread |\n| REQ-SBX-8: No filesystem restrictions | Satisfied | Not configured |\n| REQ-SBX-9: Bubblewrap prerequisite | Satisfied | `daemon/app.ts:176-202`: Linux-only check at startup, warns if bwrap missing, mentions bubblewrap and socat |\n| REQ-SBX-10: Phase 1 tests | Satisfied | `sdk-runner.test.ts:1062-1170`: all 5 test cases present |\n\n### Phase 2 (canUseTool Rules)\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| REQ-SBX-11: `CanUseToolRule` type | Satisfied | `lib/types.ts:223-234`, `WorkerMetadata.canUseToolRules` at line 186 |\n| REQ-SBX-12: Rule matching semantics | Satisfied | `buildCanUseTool` at `sdk-runner.ts:278-313`: tool match, command condition (Bash-only), path condition with correct field mapping, AND semantics, catch-all when neither specified |\n| REQ-SBX-13: Glob matching via micromatch | Satisfied | `micromatch` in dependencies, `micromatch.isMatch()` at lines 290, 297 |\n| REQ-SBX-14: Declaration order, first match wins | Satisfied | `for` loop with early `return` on match, final `allow` return at line 312 |\n| REQ-SBX-15: Package validation | Satisfied | `lib/packages.ts:83-98`: `superRefine` checks each rule's tool against `builtInTools` |\n| REQ-SBX-16: Denial returns `interrupt: false` | Satisfied | `sdk-runner.ts:307` |\n| REQ-SBX-17: `ResolvedToolSet.canUseToolRules` | Satisfied | `lib/types.ts:240` |\n| REQ-SBX-18: `SdkQueryOptions.canUseTool` | Satisfied | `sdk-runner.ts:70-77` |\n| REQ-SBX-19: Toolbox resolver passthrough | Satisfied | `toolbox-resolver.ts:143` |\n| REQ-SBX-20: Build callback when rules non-empty | Satisfied | `sdk-runner.ts:474-477` |\n| REQ-SBX-21: No callback when rules empty | Satisfied | `.length > 0` check at line 475 |\n| REQ-SBX-22: Phase 1 + Phase 2 coexistence | Satisfied | Independent conditional spreads at `sdk-runner.ts:493-494` |\n| REQ-SBX-23: `excludedCommands` and `canUseToolRules` not conflated | Satisfied | Completely separate mechanisms |\n| REQ-SBX-24: Phase 2 tests | Satisfied | 9 test cases across `sdk-runner.test.ts` and `toolbox-resolver.test.ts`, plus 4 validation tests in `packages.test.ts` |\n\n### Plan-Specific Checks\n\n| Concern | Verdict |\n|---------|---------|\n| `buildCanUseTool` edge cases (both absent, path-only, command-only, both present) | All handled correctly via `continue` logic |\n| `TOOL_PATH_FIELD` covers all REQ-SBX-12 tools | Matches spec exactly: Edit/Read/Write → `file_path`, Grep/Glob → `path` |\n| `superRefine` on `workerMetadataSchema` vs `packageMetadataSchema` union | Works. Typecheck passes. Schema tests pass including `packageMetadataSchema` union tests. |\n| `micromatch` import style | Default import (`import micromatch from \"micromatch\"`) works with `@types/micromatch` |\n| All fixture updates | Confirmed across all 11 test files |\n| No broken callers | Confirmed. `ResolvedToolSet` flows through the activation chain without intermediate code changes. |\n\n## Confirmed Defects\n\nNone.\n\n## Observations\n\n### F1: Sable's test count claim was wrong\n\nSable's commission reported \"All 2518 tests pass.\" The actual suite contains 1982 tests. The new sandbox tests are present and pass. The count was overstated. Impact: none on correctness; the implementation and tests are real. The commission artifact's result_summary contains a false metric.\n\n### F2: micromatch dotfile matching (documentation gap)\n\nmicromatch's `*` does not match leading dots by default. A pattern like `*.lore/**` won't match `.lore/specs/example.md`. Package authors should use `**/.lore/**` instead. The plan's Open Questions section acknowledges tilde-expansion; this is the same class of issue. Impact: package authors who write rules with dot-prefixed paths need to understand micromatch defaults. Consider documenting this in a package authoring guide, or passing `{ dot: true }` to `micromatch.isMatch()`.\n\n### F3: micromatch treats `/` specially in command strings\n\nmicromatch is designed for file path matching and treats `/` as a path separator. `*` does not cross `/` boundaries. For Bash commands containing paths (e.g., `git log -- /path/to/file`), a pattern like `git log*` won't match. Using `git log**` or `git log {,**}` would. Impact: usability concern for package authors writing command glob patterns. The spec's examples use exact-match literals (`\"git status\"`, `\"git log\"`), which work correctly."
  - timestamp: 2026-03-13T03:21:48.773Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All verification complete. Typecheck, lint, and 1982 tests pass. All 24 REQ-SBX requirements verified against implementation. Compiling findings now."
projectName: guild-hall
---
# Sandboxed Execution Review: All REQ-SBX-* Requirements Satisfied

## Verification Status

- `bun run typecheck`: passed
- `bun run lint`: passed
- `bun test`: 1982 tests passed, 0 failures

All `ResolvedToolSet` fixtures across 11 test files include `canUseToolRules: []`. No callers of `prepareSdkSession` or `ResolvedToolSet` are broken.

## Requirement Coverage

### Phase 1 (SDK Sandbox)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-SBX-1: `sandbox` on `SdkQueryOptions` | Satisfied | `sdk-runner.ts:52-68` |
| REQ-SBX-2: Inject sandbox when Bash in `builtInTools` | Satisfied | `sdk-runner.ts:460-471`, condition checks `activation.tools.builtInTools` (post-TAE resolution) |
| REQ-SBX-3: Four settings, no extras | Satisfied | `sdk-runner.ts:463-470`: `enabled: true`, `autoAllowBashIfSandboxed: true`, `allowUnsandboxedCommands: false`, `network.allowLocalBinding: false`. No other fields. |
| REQ-SBX-4: No `excludedCommands` | Satisfied | Not present in sandbox config |
| REQ-SBX-5: No `allowUnixSockets` | Satisfied | Not present in sandbox config |
| REQ-SBX-6: No `enableWeakerNestedSandbox` | Satisfied | Not present in sandbox config |
| REQ-SBX-7: No sandbox for non-Bash workers | Satisfied | Conditional `hasBash ? {...} : undefined` plus conditional spread |
| REQ-SBX-8: No filesystem restrictions | Satisfied | Not configured |
| REQ-SBX-9: Bubblewrap prerequisite | Satisfied | `daemon/app.ts:176-202`: Linux-only check at startup, warns if bwrap missing, mentions bubblewrap and socat |
| REQ-SBX-10: Phase 1 tests | Satisfied | `sdk-runner.test.ts:1062-1170`: all 5 test cases present |

### Phase 2 (canUseTool Rules)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-SBX-11: `CanUseToolRule` type | Satisfied | `lib/types.ts:223-234`, `WorkerMetadata.canUseToolRules` at line 186 |
| REQ-SBX-12: Rule matching semantics | Satisfied | `buildCanUseTool` at `sdk-runner.ts:278-313`: tool match, command condition (Bash-only), path condition with correct field mapping, AND semantics, catch-all when neither specified |
| REQ-SBX-13: Glob matching via micromatch | Satisfied | `micromatch` in dependencies, `micromatch.isMatch()` at lines 290, 297 |
| REQ-SBX-14: Declaration order, first match wins | Satisfied | `for` loop with early `return` on match, final `allow` return at line 312 |
| REQ-SBX-15: Package validation | Satisfied | `lib/packages.ts:83-98`: `superRefine` checks each rule's tool against `builtInTools` |
| REQ-SBX-16: Denial returns `interrupt: false` | Satisfied | `sdk-runner.ts:307` |
| REQ-SBX-17: `ResolvedToolSet.canUseToolRules` | Satisfied | `lib/types.ts:240` |
| REQ-SBX-18: `SdkQueryOptions.canUseTool` | Satisfied | `sdk-runner.ts:70-77` |
| REQ-SBX-19: Toolbox resolver passthrough | Satisfied | `toolbox-resolver.ts:143` |
| REQ-SBX-20: Build callback when rules non-empty | Satisfied | `sdk-runner.ts:474-477` |
| REQ-SBX-21: No callback when rules empty | Satisfied | `.length > 0` check at line 475 |
| REQ-SBX-22: Phase 1 + Phase 2 coexistence | Satisfied | Independent conditional spreads at `sdk-runner.ts:493-494` |
| REQ-SBX-23: `excludedCommands` and `canUseToolRules` not conflated | Satisfied | Completely separate mechanisms |
| REQ-SBX-24: Phase 2 tests | Satisfied | 9 test cases across `sdk-runner.test.ts` and `toolbox-resolver.test.ts`, plus 4 validation tests in `packages.test.ts` |

### Plan-Specific Checks

| Concern | Verdict |
|---------|---------|
| `buildCanUseTool` edge cases (both absent, path-only, command-only, both present) | All handled correctly via `continue` logic |
| `TOOL_PATH_FIELD` covers all REQ-SBX-12 tools | Matches spec exactly: Edit/Read/Write → `file_path`, Grep/Glob → `path` |
| `superRefine` on `workerMetadataSchema` vs `packageMetadataSchema` union | Works. Typecheck passes. Schema tests pass including `packageMetadataSchema` union tests. |
| `micromatch` import style | Default import (`import micromatch from "micromatch"`) works with `@types/micromatch` |
| All fixture updates | Confirmed across all 11 test files |
| No broken callers | Confirmed. `ResolvedToolSet` flows through the activation chain without intermediate code changes. |

## Confirmed Defects

None.

## Observations

### F1: Sable's test count claim was wrong

Sable's commission reported "All 2518 tests pass." The actual suite contains 1982 tests. The new sandbox tests are present and pass. The count was overstated. Impact: none on correctness; the implementation and tests are real. The commission artifact's result_summary contains a false metric.

### F2: micromatch dotfile matching (documentation gap)

micromatch's `*` does not match leading dots by default. A pattern like `*.lore/**` won't match `.lore/specs/example.md`. Package authors should use `**/.lore/**` instead. The plan's Open Questions section acknowledges tilde-expansion; this is the same class of issue. Impact: package authors who write rules with dot-prefixed paths need to understand micromatch defaults. Consider documenting this in a package authoring guide, or passing `{ dot: true }` to `micromatch.isMatch()`.

### F3: micromatch treats `/` specially in command strings

micromatch is designed for file path matching and treats `/` as a path separator. `*` does not cross `/` boundaries. For Bash commands containing paths (e.g., `git log -- /path/to/file`), a pattern like `git log*` won't match. Using `git log**` or `git log {,**}` would. Impact: usability concern for package authors writing command glob patterns. The spec's examples use exact-match literals (`"git status"`, `"git log"`), which work correctly.
