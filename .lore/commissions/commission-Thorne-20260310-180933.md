---
title: "Commission: Review: SDK tool availability enforcement"
date: 2026-03-11
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Fresh-context review of the SDK tool availability enforcement implementation against the spec at `.lore/specs/workers/tool-availability-enforcement.md` and plan at `.lore/plans/workers/tool-availability-enforcement.md`.\n\nVerify:\n1. `prepareSdkSession` passes `tools` as a `string[]` from `activation.tools.builtInTools`\n2. Both `tools` and `allowedTools` are present in the SDK options (REQ-TAE-8)\n3. `settingSources` is unchanged at `[\"local\", \"project\", \"user\"]` (REQ-TAE-9)\n4. No callers of `prepareSdkSession` or `SdkQueryOptions` are broken\n5. `builtInTools` flows through the activation chain without changes to worker activation code\n6. All test fixtures include `builtInTools`\n7. New tests cover the cases specified in REQ-TAE-10\n\nTrace the full path: `resolveToolSet` return → `ActivationContext.resolvedTools` → `ActivationResult.tools` → `prepareSdkSession`'s `activation.tools.builtInTools` → `options.tools`.\n\nRun `bun run typecheck`, `bun run lint`, and `bun test` to confirm everything passes."
dependencies:
  - commission-Sable-20260310-180923
linked_artifacts:
  - lib/types.ts

  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/toolbox-resolver.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/toolbox-resolver.test.ts
  - tests/daemon/services/manager-worker.test.ts
  - tests/packages/worker-role-smoke.test.ts
  - tests/packages/worker-activation.test.ts
  - daemon/lib/agent-sdk/sdk-runner.ts
  - daemon/services/toolbox-resolver.ts
  - tests/daemon/services/sdk-runner.test.ts
  - tests/daemon/toolbox-resolver.test.ts
  - tests/daemon/services/manager-worker.test.ts
  - tests/packages/worker-role-smoke.test.ts
  - tests/packages/worker-activation.test.ts
activity_timeline:
  - timestamp: 2026-03-11T01:09:33.618Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T01:09:33.620Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-03-11T01:17:49.083Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-03-11T01:17:49.086Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-11T01:17:49.121Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T01:17:55.807Z
    event: progress_report
    reason: "Starting fresh-context review. Reading spec, plan, and tracing the implementation path for tool availability enforcement."
  - timestamp: 2026-03-11T01:20:01.969Z
    event: progress_report
    reason: "Code inspection complete. All production code and test fixtures verified against spec. Running typecheck, lint, and full test suite now."
  - timestamp: 2026-03-11T01:20:54.602Z
    event: progress_report
    reason: "All checks pass: typecheck clean, lint clean, 2499 tests pass. Compiling findings report now."
  - timestamp: 2026-03-11T01:21:29.562Z
    event: result_submitted
    reason: "## Review: Tool Availability Enforcement\n\n**Verdict: Implementation satisfies all spec requirements. No defects found.**\n\n### Verification Summary\n\n| Requirement | Status | Evidence |\n|-------------|--------|----------|\n| REQ-TAE-1: `tools` parameter passed to SDK sessions | Satisfied | `sdk-runner.ts:390` — `tools: activation.tools.builtInTools` |\n| REQ-TAE-2: `tools` controls only built-in tools, not MCP | Satisfied | `builtInTools` contains only declared names; MCP wildcards stay in `allowedTools` only |\n| REQ-TAE-3: `builtInTools` is the exhaustive list | Satisfied | No implicit additions; value is passed through unchanged |\n| REQ-TAE-4: `ResolvedToolSet` includes `builtInTools` | Satisfied | `lib/types.ts:178` — `builtInTools: string[]` |\n| REQ-TAE-5: `SdkQueryOptions` includes `tools` | Satisfied | `sdk-runner.ts:40` — `tools?: string[] \\| { type: \"preset\"; preset: \"claude_code\" }` |\n| REQ-TAE-6: Toolbox resolver returns `builtInTools` | Satisfied | `toolbox-resolver.ts:143` — `return { mcpServers, allowedTools, builtInTools: worker.builtInTools }` |\n| REQ-TAE-7: `prepareSdkSession` passes `tools` | Satisfied | `sdk-runner.ts:390` — value comes from `activation.tools.builtInTools` |\n| REQ-TAE-8: Both `tools` and `allowedTools` present | Satisfied | `sdk-runner.ts:389-390` — both fields present in options object |\n| REQ-TAE-9: `settingSources` unchanged | Satisfied | `sdk-runner.ts:397` — `settingSources: [\"local\", \"project\", \"user\"]` |\n| REQ-TAE-10: Test coverage | Satisfied | See breakdown below |\n| REQ-TAE-11: Backward compatible | Satisfied | No worker package changes required |\n| REQ-TAE-12: Test fixtures updated | Satisfied | All 7 `ResolvedToolSet` constructions include `builtInTools` |\n\n### Full Path Trace\n\n`resolveToolSet` returns `{ mcpServers, allowedTools, builtInTools: worker.builtInTools }` (toolbox-resolver.ts:143)\n→ Stored in `ActivationContext.resolvedTools` (typed as `ResolvedToolSet` via lib/types.ts:185)\n→ Passed through by `activateWorkerWithSharedPattern` as `context.resolvedTools` to `ActivationResult.tools` (worker-activation.ts:112)\n→ Read by `prepareSdkSession` as `activation.tools.builtInTools` (sdk-runner.ts:390)\n→ Assigned to `options.tools` in the `SdkQueryOptions` object\n→ Passed to SDK via `runSdkSession` → `queryFn({ prompt, options: resolvedOptions })` (sdk-runner.ts:149)\n\nNo intermediate code touches or transforms `builtInTools`. The value flows from `worker.builtInTools` in the package metadata to the SDK's `tools` parameter without modification.\n\n### REQ-TAE-10 Test Coverage\n\n**Toolbox resolver tests** (toolbox-resolver.test.ts):\n- Test 6: \"builtInTools matches worker declaration exactly\" — asserts `result.builtInTools` equals `[\"Read\", \"Glob\", \"Grep\"]` (line 127-131)\n- Test 7: \"builtInTools excludes MCP server tools even when MCP servers are added\" — asserts `builtInTools` has only `[\"Read\"]` while `allowedTools` is longer (line 133-139)\n- Additional assertions on existing tests: \"built-in tools and MCP wildcards assembled\" (line 112) and \"empty builtInTools still includes MCP wildcards\" (lines 122-124)\n\n**SDK runner tests** (sdk-runner.test.ts):\n- Test 1: \"prepareSdkSession includes tools matching worker builtInTools\" — verifies `options.tools` equals `[\"Read\", \"Glob\", \"Grep\"]` (line 1060-1078)\n- Test 2: \"tools field excludes undeclared built-in tools\" — asserts `tools` does not contain Bash, Write, or Edit (line 1080-1100)\n- Test 3: \"full builtInTools set is passed through to tools\" — verifies six-tool worker gets all six (line 1125-1145)\n- Test 4: \"tools is independent of allowedTools\" — verifies `tools` has only built-in names while `allowedTools` includes MCP wildcards (line 1102-1123)\n- Test 5: \"tools does not include MCP server entries\" — asserts `tools` equals `[\"Read\"]` with no MCP entries (line 1147-1166)\n\n### Callers Verified\n\nAll five production callers of `prepareSdkSession` pass `SessionPrepSpec` and `SessionPrepDeps`; none construct `SdkQueryOptions` directly:\n- `daemon/services/commission/orchestrator.ts` (line 1857)\n- `daemon/services/mail/orchestrator.ts` (lines 378, 634)\n- `daemon/services/meeting/orchestrator.ts` (lines 601, 1026)\n- `daemon/services/briefing-generator.ts` (line 395)\n- `daemon/services/manager/worker.ts` (imports but doesn't call directly)\n\nThe briefing generator's `makeBriefingResolveToolSet` wrapper only overrides `systemToolboxes: []`, leaving `builtInTools` untouched in the resolver call.\n\n### Automated Verification\n\n- `bun run typecheck`: clean (0 errors)\n- `bun run lint`: clean (0 errors)\n- `bun test`: 2499 pass, 0 fail, 6076 assertions\n\n### Pre-existing Observation (not related to this change)\n\n`packages/shared/worker-activation.ts:54-70` contains a duplicate `mailContext` block (lines 32-52 and 54-70 are identical). This predates the tool enforcement work and has no impact on it, but it means mail reader sessions emit the mail context section twice in their system prompt."
  - timestamp: 2026-03-11T01:21:34.727Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All checks pass: typecheck clean, lint clean, 2499 tests pass. Compiling findings report now."
projectName: guild-hall
---
## Review: Tool Availability Enforcement

**Verdict: Implementation satisfies all spec requirements. No defects found.**

### Verification Summary

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-TAE-1: `tools` parameter passed to SDK sessions | Satisfied | `sdk-runner.ts:390` — `tools: activation.tools.builtInTools` |
| REQ-TAE-2: `tools` controls only built-in tools, not MCP | Satisfied | `builtInTools` contains only declared names; MCP wildcards stay in `allowedTools` only |
| REQ-TAE-3: `builtInTools` is the exhaustive list | Satisfied | No implicit additions; value is passed through unchanged |
| REQ-TAE-4: `ResolvedToolSet` includes `builtInTools` | Satisfied | `lib/types.ts:178` — `builtInTools: string[]` |
| REQ-TAE-5: `SdkQueryOptions` includes `tools` | Satisfied | `sdk-runner.ts:40` — `tools?: string[] \| { type: "preset"; preset: "claude_code" }` |
| REQ-TAE-6: Toolbox resolver returns `builtInTools` | Satisfied | `toolbox-resolver.ts:143` — `return { mcpServers, allowedTools, builtInTools: worker.builtInTools }` |
| REQ-TAE-7: `prepareSdkSession` passes `tools` | Satisfied | `sdk-runner.ts:390` — value comes from `activation.tools.builtInTools` |
| REQ-TAE-8: Both `tools` and `allowedTools` present | Satisfied | `sdk-runner.ts:389-390` — both fields present in options object |
| REQ-TAE-9: `settingSources` unchanged | Satisfied | `sdk-runner.ts:397` — `settingSources: ["local", "project", "user"]` |
| REQ-TAE-10: Test coverage | Satisfied | See breakdown below |
| REQ-TAE-11: Backward compatible | Satisfied | No worker package changes required |
| REQ-TAE-12: Test fixtures updated | Satisfied | All 7 `ResolvedToolSet` constructions include `builtInTools` |

### Full Path Trace

`resolveToolSet` returns `{ mcpServers, allowedTools, builtInTools: worker.builtInTools }` (toolbox-resolver.ts:143)
→ Stored in `ActivationContext.resolvedTools` (typed as `ResolvedToolSet` via lib/types.ts:185)
→ Passed through by `activateWorkerWithSharedPattern` as `context.resolvedTools` to `ActivationResult.tools` (worker-activation.ts:112)
→ Read by `prepareSdkSession` as `activation.tools.builtInTools` (sdk-runner.ts:390)
→ Assigned to `options.tools` in the `SdkQueryOptions` object
→ Passed to SDK via `runSdkSession` → `queryFn({ prompt, options: resolvedOptions })` (sdk-runner.ts:149)

No intermediate code touches or transforms `builtInTools`. The value flows from `worker.builtInTools` in the package metadata to the SDK's `tools` parameter without modification.

### REQ-TAE-10 Test Coverage

**Toolbox resolver tests** (toolbox-resolver.test.ts):
- Test 6: "builtInTools matches worker declaration exactly" — asserts `result.builtInTools` equals `["Read", "Glob", "Grep"]` (line 127-131)
- Test 7: "builtInTools excludes MCP server tools even when MCP servers are added" — asserts `builtInTools` has only `["Read"]` while `allowedTools` is longer (line 133-139)
- Additional assertions on existing tests: "built-in tools and MCP wildcards assembled" (line 112) and "empty builtInTools still includes MCP wildcards" (lines 122-124)

**SDK runner tests** (sdk-runner.test.ts):
- Test 1: "prepareSdkSession includes tools matching worker builtInTools" — verifies `options.tools` equals `["Read", "Glob", "Grep"]` (line 1060-1078)
- Test 2: "tools field excludes undeclared built-in tools" — asserts `tools` does not contain Bash, Write, or Edit (line 1080-1100)
- Test 3: "full builtInTools set is passed through to tools" — verifies six-tool worker gets all six (line 1125-1145)
- Test 4: "tools is independent of allowedTools" — verifies `tools` has only built-in names while `allowedTools` includes MCP wildcards (line 1102-1123)
- Test 5: "tools does not include MCP server entries" — asserts `tools` equals `["Read"]` with no MCP entries (line 1147-1166)

### Callers Verified

All five production callers of `prepareSdkSession` pass `SessionPrepSpec` and `SessionPrepDeps`; none construct `SdkQueryOptions` directly:
- `daemon/services/commission/orchestrator.ts` (line 1857)
- `daemon/services/mail/orchestrator.ts` (lines 378, 634)
- `daemon/services/meeting/orchestrator.ts` (lines 601, 1026)
- `daemon/services/briefing-generator.ts` (line 395)
- `daemon/services/manager/worker.ts` (imports but doesn't call directly)

The briefing generator's `makeBriefingResolveToolSet` wrapper only overrides `systemToolboxes: []`, leaving `builtInTools` untouched in the resolver call.

### Automated Verification

- `bun run typecheck`: clean (0 errors)
- `bun run lint`: clean (0 errors)
- `bun test`: 2499 pass, 0 fail, 6076 assertions

### Pre-existing Observation (not related to this change)

`packages/shared/worker-activation.ts:54-70` contains a duplicate `mailContext` block (lines 32-52 and 54-70 are identical). This predates the tool enforcement work and has no impact on it, but it means mail reader sessions emit the mail context section twice in their system prompt.
