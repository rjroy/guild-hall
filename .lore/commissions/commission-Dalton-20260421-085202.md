---
title: "Commission: C6 — Gate 2 Fixes (all findings)"
date: 2026-04-21
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix all findings from Thorne's Gate 2 review. Findings artifact: `.lore/commissions/commission-Thorne-20260421-084120.md`. Read it in full before starting.\n\n**Scope: all Major and Minor findings.** \"Not a blocker\" is not \"defer\" — every finding gets fixed here.\n\n**Major:**\n\n**M-1 — `meeting list --state=requested` silently returns empty without `--projectName`:**\n- `cli/index.ts:311-314` guards the request-side fetch with `projectName !== undefined`. Without it, the requested fetch silently skips and the user gets zero rows with no diagnostic.\n- Decide the correct behavior: either (a) require `projectName` and fail loudly with a structured error when missing, or (b) fan out across all projects, or (c) document the prerequisite in help output. Pick the option that aligns with plan intent (the aggregate is documented as \"meeting list [--state requested|active|all]\" — implies project-agnostic, so option (b) is the closest fit). If you pick (b), iterate over registered projects from `system.config.project.list`.\n- Declare `--projectName` (and any other flags the aggregate accepts) in `cli/surface.ts:313-320`'s `flags` array so help renders them.\n- Add a test covering the missing-flag case. Also add a test covering the fanned-out behavior if that's the chosen fix.\n\n**M-2 — Help-no-fetch test is broken:**\n- `tests/cli/help.test.ts:157-188` creates a `noopFetch` spy that's never passed to anything. Rewrite the test to invoke `runCli([\"help\"], deps)` and representative `runCli([\"<group>\", \"help\"], deps)` with a `daemonFetch` spy that **throws** on any call. Assert the CLI's `help` path never triggers the throw.\n\n**M-3 — No snapshot tests for commission UX:**\n- Add golden-file or `bun`-native snapshot assertions in `tests/cli/commission-format.test.ts` for:\n  - `formatCommissionList` (populated + empty)\n  - `formatCommissionDetail` (with/without progress, with/without result, with/without schedule/trigger, timeline truncation at 5)\n  - `formatActionConfirmation` for dispatch, cancel, abandon, redispatch\n- Snapshots catch layout/column/truncation regressions that `.toContain` checks cannot.\n\n**Minor:**\n\n**m-1 — `migrate-content` hardcoded outside `CLI_SURFACE`:**\n- Either promote `migrate-content` into `CLI_SURFACE` as a first-class top-level entry (preferred), or remove it from help output until it has one. Update `tests/cli/help.test.ts:42-44` accordingly.\n\n**m-2 — `dispatchAggregate` hardcodes daemon paths:**\n- `cli/index.ts:317, :343` use literal path strings. Read from `command.operations[i].invocation.path` instead.\n\n**m-3 — `operationFor` duplicates resolution logic:**\n- Collapse `operationFor` in `cli/index.ts` and `invocationForOperation` in `cli/surface-utils.ts` through a single shared helper so the two derivation paths cannot drift.\n\n**m-4 — Wrong REQ tag on no-continue-save test:**\n- `tests/cli/no-continue-save.test.ts:13` cites REQ-CLI-AGENT-17 (TTY). Dead-code removal is closer to REQ-CLI-AGENT-25 (formatter registry scope) or implicit. Update the `describe` label and any internal comments.\n\n**m-5 — Resolver not exercised against real `CLI_SURFACE`:**\n- Add a test in `tests/cli/resolve.test.ts` that enumerates every leaf via `leafNodes(CLI_SURFACE)`, calls `resolveCommand(pathForNode(leaf), CLI_SURFACE)`, and asserts the result type is `command` (never `unknown`). Ensures every real leaf is actually reachable.\n\n**m-6 — Meeting `list` surface missing `--projectName` flag:**\n- Subsumed by M-1's flag-declaration fix. Just confirm it's declared there.\n\n**Guardrails:**\n- No `mock.module()`. DI everywhere.\n- Run `bun run typecheck`, `bun run lint`, `bun test`, `bun run build` before submitting. All green.\n- Do not touch Phase 5 scope (skill-builder harness, structural test suite). Phase 5 is next commission.\n- Do not update specs. Phase 6 is Octavia's job.\n\nReport back with the full file list, tests added/rewritten, verification output, and the decision you made for M-1's behavior (which option a/b/c)."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T15:52:02.220Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T15:52:02.222Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
