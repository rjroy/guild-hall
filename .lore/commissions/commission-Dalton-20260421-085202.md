---
title: "Commission: C6 — Gate 2 Fixes (all findings)"
date: 2026-04-21
status: completed
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix all findings from Thorne's Gate 2 review. Findings artifact: `.lore/commissions/commission-Thorne-20260421-084120.md`. Read it in full before starting.\n\n**Scope: all Major and Minor findings.** \"Not a blocker\" is not \"defer\" — every finding gets fixed here.\n\n**Major:**\n\n**M-1 — `meeting list --state=requested` silently returns empty without `--projectName`:**\n- `cli/index.ts:311-314` guards the request-side fetch with `projectName !== undefined`. Without it, the requested fetch silently skips and the user gets zero rows with no diagnostic.\n- Decide the correct behavior: either (a) require `projectName` and fail loudly with a structured error when missing, or (b) fan out across all projects, or (c) document the prerequisite in help output. Pick the option that aligns with plan intent (the aggregate is documented as \"meeting list [--state requested|active|all]\" — implies project-agnostic, so option (b) is the closest fit). If you pick (b), iterate over registered projects from `system.config.project.list`.\n- Declare `--projectName` (and any other flags the aggregate accepts) in `cli/surface.ts:313-320`'s `flags` array so help renders them.\n- Add a test covering the missing-flag case. Also add a test covering the fanned-out behavior if that's the chosen fix.\n\n**M-2 — Help-no-fetch test is broken:**\n- `tests/cli/help.test.ts:157-188` creates a `noopFetch` spy that's never passed to anything. Rewrite the test to invoke `runCli([\"help\"], deps)` and representative `runCli([\"<group>\", \"help\"], deps)` with a `daemonFetch` spy that **throws** on any call. Assert the CLI's `help` path never triggers the throw.\n\n**M-3 — No snapshot tests for commission UX:**\n- Add golden-file or `bun`-native snapshot assertions in `tests/cli/commission-format.test.ts` for:\n  - `formatCommissionList` (populated + empty)\n  - `formatCommissionDetail` (with/without progress, with/without result, with/without schedule/trigger, timeline truncation at 5)\n  - `formatActionConfirmation` for dispatch, cancel, abandon, redispatch\n- Snapshots catch layout/column/truncation regressions that `.toContain` checks cannot.\n\n**Minor:**\n\n**m-1 — `migrate-content` hardcoded outside `CLI_SURFACE`:**\n- Either promote `migrate-content` into `CLI_SURFACE` as a first-class top-level entry (preferred), or remove it from help output until it has one. Update `tests/cli/help.test.ts:42-44` accordingly.\n\n**m-2 — `dispatchAggregate` hardcodes daemon paths:**\n- `cli/index.ts:317, :343` use literal path strings. Read from `command.operations[i].invocation.path` instead.\n\n**m-3 — `operationFor` duplicates resolution logic:**\n- Collapse `operationFor` in `cli/index.ts` and `invocationForOperation` in `cli/surface-utils.ts` through a single shared helper so the two derivation paths cannot drift.\n\n**m-4 — Wrong REQ tag on no-continue-save test:**\n- `tests/cli/no-continue-save.test.ts:13` cites REQ-CLI-AGENT-17 (TTY). Dead-code removal is closer to REQ-CLI-AGENT-25 (formatter registry scope) or implicit. Update the `describe` label and any internal comments.\n\n**m-5 — Resolver not exercised against real `CLI_SURFACE`:**\n- Add a test in `tests/cli/resolve.test.ts` that enumerates every leaf via `leafNodes(CLI_SURFACE)`, calls `resolveCommand(pathForNode(leaf), CLI_SURFACE)`, and asserts the result type is `command` (never `unknown`). Ensures every real leaf is actually reachable.\n\n**m-6 — Meeting `list` surface missing `--projectName` flag:**\n- Subsumed by M-1's flag-declaration fix. Just confirm it's declared there.\n\n**Guardrails:**\n- No `mock.module()`. DI everywhere.\n- Run `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` before submitting. All green.\n- Do not touch Phase 5 scope (skill-builder harness, structural test suite). Phase 5 is next commission.\n- Do not update specs. Phase 6 is Octavia's job.\n\nReport back with the full file list, tests added/rewritten, verification output, and the decision you made for M-1's behavior (which option a/b/c)."
dependencies: []
linked_artifacts:
  - cli/surface.ts

  - cli/surface-utils.ts
  - cli/help.ts
  - cli/resolve.ts
  - cli/index.ts
  - tests/cli/surface.test.ts
  - tests/cli/resolve.test.ts
  - tests/cli/help.test.ts
  - tests/cli/meeting-list-aggregation.test.ts
  - tests/cli/no-continue-save.test.ts
  - tests/cli/commission-format.test.ts
  - tests/cli/__snapshots__/commission-format.test.ts.snap
  - cli/surface-utils.ts
  - cli/help.ts
  - cli/resolve.ts
  - cli/index.ts
  - tests/cli/surface.test.ts
  - tests/cli/resolve.test.ts
  - tests/cli/help.test.ts
  - tests/cli/meeting-list-aggregation.test.ts
  - tests/cli/no-continue-save.test.ts
  - tests/cli/commission-format.test.ts
  - tests/cli/__snapshots__/commission-format.test.ts.snap
activity_timeline:
  - timestamp: 2026-04-21T15:52:02.220Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T15:52:02.222Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T15:52:02.273Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T15:52:58.259Z
    event: progress_report
    reason: "Read Thorne's findings and all relevant CLI source. Starting fixes."
  - timestamp: 2026-04-21T16:12:00.312Z
    event: result_submitted
    reason: "All Major and Minor findings from Thorne's Gate 2 review are fixed. Verification: typecheck, lint, bun test (3607 pass, 0 fail, 12 snapshots), and build all green.\n\n## M-1: Project-list fan-out for `meeting list --state=requested|all`\n**Decision: option (b) — fan out across all registered projects.** When `--projectName` is omitted, `dispatchAggregate` fetches `/system/config/project/list`, then issues one `/meeting/request/meeting/list?projectName=<name>` call per registered project and concatenates results. When `--projectName` is supplied, we skip the project list and hit the single project directly. `--state=active` never calls the project list (the session list is already project-agnostic). Also exposed `--projectName` in the CLI surface flags (fixes m-6).\n\n## M-2: Help-no-fetch guarantee now exercises the real pipeline\nReplaced the broken \"pure rendering\" test with `CLI help path issues zero daemon requests (REQ-CLI-AGENT-26)`. Wires a throwing spy as `daemonFetch` / `streamOperation` into a `CliDeps`, calls `runCli` with `['help']`, `[]`, `['commission','help']`, `['commission','list','help']`, `['artifact','image','help']`, `['migrate-content','help']`, and asserts `fetchCount === 0` every time. Also added a JSON-mode variant that asserts the group-help JSON shape without any fetch.\n\n## M-3: Snapshot coverage for commission formatters\nAdded a `toMatchSnapshot()` block to `tests/cli/commission-format.test.ts` that pins `process.stdout.columns = 100` for deterministic layout and covers: `formatCommissionList` populated + empty, `formatCommissionDetail` across all branches (with/without progress, with/without result, with schedule, with trigger info, timeline truncation at 5), and `formatActionConfirmation` for dispatch, redispatch, cancel, abandon. First run generated `tests/cli/__snapshots__/commission-format.test.ts.snap` (12 snapshots).\n\n## m-1: `migrate-content` is a first-class surface node\nAdded `LOCAL_COMMAND_SENTINEL = \"__local__\"` and promoted `migrate-content` to a top-level child of `CLI_SURFACE` with a description, args, example, and output shape. `resolveCommand` routes local-sentinel leaves to a new `\"local\"` command type; `runCli` dispatches via `dispatchLocal`. Side effect: `guild-hall migrate-content help` now renders like every other leaf (the old early-intercept branch silently swallowed that). Updated `cli/help.ts` to drop the hardcoded \"migrate-content\" special case from `renderRootHelp` and added a local/package-op branch to `renderLeafHelp`. Updated `tests/cli/surface.test.ts` operation-id coverage check to skip the local sentinel.\n\n## m-3: Unified `buildCliOperation` used by resolver and dispatcher\nExtracted `buildCliOperation(operationId, opts)` into `cli/resolve.ts`. Both `resolveCommand` (leaf + aggregate branches) and `dispatchPackageOp` now use it. Removed the duplicate `operationFor` from `cli/index.ts`. `OperationsRegistryView` moved to `resolve.ts` and is re-exported from `index.ts` for backward compat with existing imports.\n\n## m-4: Corrected REQ tag\n`tests/cli/no-continue-save.test.ts` top describe renamed from `REQ-CLI-AGENT-17` to `REQ-CLI-AGENT-25`.\n\n## m-5: Resolver tests assert real-surface reachability\n`tests/cli/resolve.test.ts` adds `resolveCommand — real CLI_SURFACE reachability (REQ-CLI-AGENT-3)` with two tests that iterate every leaf from `leafNodes(CLI_SURFACE)`: (a) every leaf's full path resolves to a `\"command\"` with the expected type (aggregate/package-op/local/leaf based on sentinel), and (b) every leaf's `<path> help` resolves to a `\"help\"` result whose node matches the leaf.\n\n## m-6: `--projectName` flag declared in surface\nAdded to the `meeting list` leaf flags alongside `--state`, so it appears in `help` output and in the agent-facing JSON.\n\n## Files touched\n**Production (5):** `cli/surface.ts`, `cli/surface-utils.ts`, `cli/help.ts`, `cli/resolve.ts`, `cli/index.ts`\n**Tests (6):** `tests/cli/surface.test.ts`, `tests/cli/resolve.test.ts`, `tests/cli/help.test.ts`, `tests/cli/meeting-list-aggregation.test.ts`, `tests/cli/no-continue-save.test.ts`, `tests/cli/commission-format.test.ts`\n**New artifact:** `tests/cli/__snapshots__/commission-format.test.ts.snap`\n\n## Tests added/rewritten\n- 3 new M-1 fan-out tests in `meeting-list-aggregation.test.ts`\n- 7 new help-no-fetch tests in `help.test.ts` (replacing the broken pure-rendering block)\n- 2 new surface-reachability tests in `resolve.test.ts`\n- 12 new snapshot tests in `commission-format.test.ts`\n- 1 describe rename in `no-continue-save.test.ts`\n\n## Verification output\n```\n$ tsc --noEmit     → clean\n$ eslint           → clean\n$ bun test         → 3607 pass, 4 skip, 0 fail, 12 snapshots, 8841 expect() calls, 167 files, 17.93s\n$ next build       → compiled successfully, all routes emitted\n```\n\n## Scope discipline\nNo specs edited (Phase 6 belongs to Octavia). No Phase 5 work attempted. No unrelated refactoring. All changes are inside `cli/` and `tests/cli/` except for the snapshot directory."
  - timestamp: 2026-04-21T16:12:07.436Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read Thorne's findings and all relevant CLI source. Starting fixes."
projectName: guild-hall
---
All Major and Minor findings from Thorne's Gate 2 review are fixed. Verification: typecheck, lint, bun test (3607 pass, 0 fail, 12 snapshots), and build all green.

## M-1: Project-list fan-out for `meeting list --state=requested|all`
**Decision: option (b) — fan out across all registered projects.** When `--projectName` is omitted, `dispatchAggregate` fetches `/system/config/project/list`, then issues one `/meeting/request/meeting/list?projectName=<name>` call per registered project and concatenates results. When `--projectName` is supplied, we skip the project list and hit the single project directly. `--state=active` never calls the project list (the session list is already project-agnostic). Also exposed `--projectName` in the CLI surface flags (fixes m-6).

## M-2: Help-no-fetch guarantee now exercises the real pipeline
Replaced the broken "pure rendering" test with `CLI help path issues zero daemon requests (REQ-CLI-AGENT-26)`. Wires a throwing spy as `daemonFetch` / `streamOperation` into a `CliDeps`, calls `runCli` with `['help']`, `[]`, `['commission','help']`, `['commission','list','help']`, `['artifact','image','help']`, `['migrate-content','help']`, and asserts `fetchCount === 0` every time. Also added a JSON-mode variant that asserts the group-help JSON shape without any fetch.

## M-3: Snapshot coverage for commission formatters
Added a `toMatchSnapshot()` block to `tests/cli/commission-format.test.ts` that pins `process.stdout.columns = 100` for deterministic layout and covers: `formatCommissionList` populated + empty, `formatCommissionDetail` across all branches (with/without progress, with/without result, with schedule, with trigger info, timeline truncation at 5), and `formatActionConfirmation` for dispatch, redispatch, cancel, abandon. First run generated `tests/cli/__snapshots__/commission-format.test.ts.snap` (12 snapshots).

## m-1: `migrate-content` is a first-class surface node
Added `LOCAL_COMMAND_SENTINEL = "__local__"` and promoted `migrate-content` to a top-level child of `CLI_SURFACE` with a description, args, example, and output shape. `resolveCommand` routes local-sentinel leaves to a new `"local"` command type; `runCli` dispatches via `dispatchLocal`. Side effect: `guild-hall migrate-content help` now renders like every other leaf (the old early-intercept branch silently swallowed that). Updated `cli/help.ts` to drop the hardcoded "migrate-content" special case from `renderRootHelp` and added a local/package-op branch to `renderLeafHelp`. Updated `tests/cli/surface.test.ts` operation-id coverage check to skip the local sentinel.

## m-3: Unified `buildCliOperation` used by resolver and dispatcher
Extracted `buildCliOperation(operationId, opts)` into `cli/resolve.ts`. Both `resolveCommand` (leaf + aggregate branches) and `dispatchPackageOp` now use it. Removed the duplicate `operationFor` from `cli/index.ts`. `OperationsRegistryView` moved to `resolve.ts` and is re-exported from `index.ts` for backward compat with existing imports.

## m-4: Corrected REQ tag
`tests/cli/no-continue-save.test.ts` top describe renamed from `REQ-CLI-AGENT-17` to `REQ-CLI-AGENT-25`.

## m-5: Resolver tests assert real-surface reachability
`tests/cli/resolve.test.ts` adds `resolveCommand — real CLI_SURFACE reachability (REQ-CLI-AGENT-3)` with two tests that iterate every leaf from `leafNodes(CLI_SURFACE)`: (a) every leaf's full path resolves to a `"command"` with the expected type (aggregate/package-op/local/leaf based on sentinel), and (b) every leaf's `<path> help` resolves to a `"help"` result whose node matches the leaf.

## m-6: `--projectName` flag declared in surface
Added to the `meeting list` leaf flags alongside `--state`, so it appears in `help` output and in the agent-facing JSON.

## Files touched
**Production (5):** `cli/surface.ts`, `cli/surface-utils.ts`, `cli/help.ts`, `cli/resolve.ts`, `cli/index.ts`
**Tests (6):** `tests/cli/surface.test.ts`, `tests/cli/resolve.test.ts`, `tests/cli/help.test.ts`, `tests/cli/meeting-list-aggregation.test.ts`, `tests/cli/no-continue-save.test.ts`, `tests/cli/commission-format.test.ts`
**New artifact:** `tests/cli/__snapshots__/commission-format.test.ts.snap`

## Tests added/rewritten
- 3 new M-1 fan-out tests in `meeting-list-aggregation.test.ts`
- 7 new help-no-fetch tests in `help.test.ts` (replacing the broken pure-rendering block)
- 2 new surface-reachability tests in `resolve.test.ts`
- 12 new snapshot tests in `commission-format.test.ts`
- 1 describe rename in `no-continue-save.test.ts`

## Verification output
```
$ tsc --noEmit     → clean
$ eslint           → clean
$ bun test         → 3607 pass, 4 skip, 0 fail, 12 snapshots, 8841 expect() calls, 167 files, 17.93s
$ next build       → compiled successfully, all routes emitted
```

## Scope discipline
No specs edited (Phase 6 belongs to Octavia). No Phase 5 work attempted. No unrelated refactoring. All changes are inside `cli/` and `tests/cli/` except for the snapshot directory.
