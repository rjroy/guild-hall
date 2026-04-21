---
title: "Commission: C5 — Review Gate 2: Phases 3 + 4"
date: 2026-04-21
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work completed in commission `commission-Dalton-20260421-063833` (Phases 3 + 4) against the CLI Agent-First Surface plan.\n\n**Plan:** `.lore/plans/infrastructure/cli-agent-surface.md` — read §Phase 3, §Phase 4, and §Review Gate 2 for scope.\n**Spec:** `.lore/specs/infrastructure/cli-agent-surface.md`\n**Prior review context:** `.lore/commissions/commission-Thorne-20260420-215649.md` (Gate 1 findings, particularly m-4 about `parseStartedAtFromMeetingId` empty-string handling — verify Dalton handled it in the Phase 4 aggregation renderer).\n\n**Scope of this review (from the plan's Gate 2):**\n1. Help tree rendering correctness at root, group, and leaf levels (REQ-CLI-AGENT-13, 14, 15, 16, 17, 18, 24).\n2. Resolver correctness against the full CLI surface (REQ-CLI-AGENT-3).\n3. Aggregation merge logic for `meeting list` (REQ-CLI-AGENT-10, 10a), including Thorne m-4 empty-string handling in the rendered output.\n4. Formatter registry refactor preserved existing commission formatting behaviour (REQ-CLI-AGENT-25). Snapshot tests must exist and match prior UX.\n5. Dead-code removal: `/commission/run/continue` and `/commission/run/save` formatter entries gone.\n6. Daemon help surface fully removed (REQ-CLI-AGENT-26): `daemon/routes/help.ts` deleted, import and mount in `daemon/app.ts` gone, no dangling references.\n7. CLI issues zero requests to removed help endpoints (test asserts this).\n8. DI through `main()` — `daemonFetch` and optional `operationsRegistry` threaded as parameters; tests inject fakes.\n9. No `mock.module()` usage.\n10. Package-op branch resolves correctly and fails cleanly on unknown operationId.\n\n**Requirement coverage to verify for these phases:**\n- REQ-CLI-AGENT-3, 10, 10a, 13-18, 24, 25, 26.\n\n**Review posture:**\n- No write tools. Capture all findings in your commission result body, organized by severity (Critical / Major / Minor).\n- Do not downgrade findings. Every finding goes to the fix commission; the user decides what to skip.\n- Verify claims against code and test output. Do not take Dalton's summary at face value.\n- Specifically check: are there snapshot tests for commission UX that would have caught a regression? If not, flag it.\n- If any Gate 1 finding was mishandled in Phase 3-4 (m-4 in particular), surface that explicitly.\n\nReport findings in structured form."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T15:41:20.644Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T15:41:20.646Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T15:41:20.695Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T15:42:20.102Z
    event: progress_report
    reason: "Read plan, spec, prior review, and Dalton's commission artifact. Inspected cli/help.ts, cli/resolve.ts, cli/index.ts, cli/surface.ts. Starting deeper checks: daemon/app.ts, commission-format, tests, surface-utils."
  - timestamp: 2026-04-21T15:45:53.083Z
    event: progress_report
    reason: "Review complete. Verified surface tests, resolve tests, format tests, error handling. Recording findings now."
  - timestamp: 2026-04-21T15:48:14.813Z
    event: result_submitted
    reason: "\n# Gate 2 Review — commission-Dalton-20260421-063833 (CLI Agent-First Surface, Phases 3+4)\n\nOverall posture: Gate 2 is substantively met. The architectural work — formatter registry rekeyed by operationId, dead-code removal, daemon help surface removal, DI threaded through `runCli`, m-4 empty-startedAt handling — all lands cleanly. However, three Major findings prevent a clean pass: one is a runtime bug in the aggregate command, one is a test that doesn't test what it claims, and one is a missing test class that the plan named explicitly.\n\n---\n\n## Critical\nNone.\n\n## Major\n\n### M-1 — `meeting list --state=requested` silently drops rows when `--projectName` is omitted\n**Location:** `cli/index.ts:311-314`\n\n```ts\nif (\n  (stateFilter === \"all\" || stateFilter === \"requested\") &&\n  projectName !== undefined\n) { /* fetch /meeting/request/meeting/list */ }\n```\n\nA user running `guild-hall meeting list --state=requested` with no `--projectName` gets zero rows and no diagnostic. The surface at `cli/surface.ts:313-320` declares only `--state` — `--projectName` is undocumented on the help leaf, so the prerequisite is not discoverable. The test suite covers the with-projectName path but has no case for the without-projectName path, so the bug is not caught.\n\nPick one: require `--projectName` and fail loudly when missing, fan out across all registered projects, or declare `--projectName` in the surface flags with a clear description. Whichever is chosen, add a test asserting the without-projectName behavior.\n\n### M-2 — The \"zero daemon help fetches\" test does not test `runCli`\n**Location:** `tests/cli/help.test.ts:157-188`\n\nThe test creates `noopFetch`, asserts `fetchCount === 0`, and never passes `noopFetch` anywhere. It calls `renderRootHelp`, `renderGroupHelp`, `renderLeafHelp` directly — those are pure functions by construction. The final line exists only to keep TypeScript from complaining about the unused spy.\n\nPlan Gate 2 required \"CLI issues zero requests to removed help endpoints (test asserts this).\" This test does not satisfy that. Add a test that invokes `runCli([\"help\"], deps)` (and a few representative `runCli([\"<group>\", \"help\"], deps)` calls) with a spy `daemonFetch` that throws on invocation.\n\n### M-3 — No snapshot tests for commission UX\n**Location:** `tests/cli/commission-format.test.ts`\n\nPlan Phase 4 scope item #4 stated: \"No regression in existing commission UX (list table, detail view, action confirmations) — verified via snapshot tests.\" The shipped tests use `expect(output).toContain(...)` shape checks. Column widths, line order, truncation rules, and spacing can all drift without failing the suite.\n\nAdd golden-file or `bun`-native snapshot assertions for: `formatCommissionList` (populated + empty), `formatCommissionDetail` (with and without progress/result, with and without schedule/trigger info, timeline truncation at 5), and `formatActionConfirmation` for each of dispatch/cancel/abandon/redispatch.\n\n## Minor\n\n### m-1 — `renderRootHelp` hardcodes `migrate-content` outside the surface tree\n**Location:** `cli/help.ts`; enforced by `tests/cli/help.test.ts:42-44`\n\nTop-level help content is part-derived-from-data, part-literal. Adding or renaming a top-level entry now requires edits in two places, and the test encodes the inconsistency. Either promote `migrate-content` into `CLI_SURFACE` so tree traversal renders it, or drop it from help until it has a surface entry.\n\n### m-2 — `dispatchAggregate` hardcodes daemon paths instead of using resolved operation invocations\n**Location:** `cli/index.ts:317, :343`\n\nThe literal strings `/meeting/request/meeting/list` and `/meeting/session/meeting/list` duplicate data already carried on `command.operations[i].invocation.path`. Rename an upstream operationId and this aggregate silently 404s while type-check and surface tests stay green. Read from the resolved operation instead.\n\n### m-3 — `operationFor` in `cli/index.ts` duplicates resolution logic from `cli/resolve.ts`\nTwo code paths convert an operationId into a `CliOperation`. One (resolveCommand/invocationForOperation) is covered by tests; the other is used only by the package-op dispatch. Collapse through a shared helper so the derivation cannot drift.\n\n### m-4 — Wrong REQ tag on no-continue-save test\n**Location:** `tests/cli/no-continue-save.test.ts:13`\n\nThe `describe` block cites `REQ-CLI-AGENT-17`, which is about TTY detection. Dead-code removal is part of formatter-registry scope (closer to REQ-25) or is implicit. Update the label; traceability matters in Phase 5.\n\n### m-5 — `resolve.test.ts` does not exercise `resolveCommand` against the real surface\n**Location:** `tests/cli/resolve.test.ts`\n\nThe suite uses a synthetic `testSurface`. REQ-CLI-AGENT-3 (\"thin client over the full CLI surface\") is covered structurally via `tests/cli/surface.test.ts` but not as a resolver guarantee. Add a test that enumerates every leaf via `leafNodes(CLI_SURFACE)`, calls `resolveCommand(pathForNode(leaf), CLI_SURFACE)`, and asserts the result is `command` (never `unknown`).\n\n### m-6 — Meeting `list` surface omits `--projectName` flag declaration\n**Location:** `cli/surface.ts:313-320`\n\nEven setting aside M-1's behavior question, the current surface does not document `--projectName` on `meeting list`. If the decision is \"accept --projectName and behavior changes accordingly,\" it belongs in the `flags` array with a description so help renders it.\n\n---\n\n## Explicit Gate 2 scope verification\n\n| Scope item | Status |\n|---|---|\n| 1. Help tree rendering at root/group/leaf (REQ-CLI-AGENT-13-18, 24) | Pass, subject to m-1 |\n| 2. Resolver correctness against full CLI surface (REQ-CLI-AGENT-3) | Partial — see m-5 |\n| 3. Aggregation merge for `meeting list` (REQ-CLI-AGENT-10, 10a) incl. Gate 1 m-4 | m-4 satisfied; runtime bug in dispatch per M-1 |\n| 4. Formatter registry refactor (REQ-CLI-AGENT-25) + snapshot tests | Refactor lands; snapshot tests missing per M-3 |\n| 5. Dead-code removal: `/commission/run/continue`, `/commission/run/save` | Pass |\n| 6. Daemon help surface fully removed (REQ-CLI-AGENT-26) | Pass |\n| 7. CLI issues zero requests to removed help endpoints | Test exists but does not verify this; see M-2 |\n| 8. DI through `main()` — `daemonFetch` and optional `operationsRegistry` | Pass |\n| 9. No `mock.module()` usage | Pass |\n| 10. Package-op resolves correctly; fails cleanly on unknown operationId | Pass |\n\n## Recommendation\n\nBlock merge on M-1, M-2, M-3. The Minor findings can be bundled into a follow-up if preferred, but M-2 and M-3 in particular compromise the review value of the work: they're the class of test where green light doesn't mean the thing works. M-1 is a live bug.\n"
  - timestamp: 2026-04-21T15:48:20.527Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Review complete. Verified surface tests, resolve tests, format tests, error handling. Recording findings now."
projectName: guild-hall
---

# Gate 2 Review — commission-Dalton-20260421-063833 (CLI Agent-First Surface, Phases 3+4)

Overall posture: Gate 2 is substantively met. The architectural work — formatter registry rekeyed by operationId, dead-code removal, daemon help surface removal, DI threaded through `runCli`, m-4 empty-startedAt handling — all lands cleanly. However, three Major findings prevent a clean pass: one is a runtime bug in the aggregate command, one is a test that doesn't test what it claims, and one is a missing test class that the plan named explicitly.

---

## Critical
None.

## Major

### M-1 — `meeting list --state=requested` silently drops rows when `--projectName` is omitted
**Location:** `cli/index.ts:311-314`

```ts
if (
  (stateFilter === "all" || stateFilter === "requested") &&
  projectName !== undefined
) { /* fetch /meeting/request/meeting/list */ }
```

A user running `guild-hall meeting list --state=requested` with no `--projectName` gets zero rows and no diagnostic. The surface at `cli/surface.ts:313-320` declares only `--state` — `--projectName` is undocumented on the help leaf, so the prerequisite is not discoverable. The test suite covers the with-projectName path but has no case for the without-projectName path, so the bug is not caught.

Pick one: require `--projectName` and fail loudly when missing, fan out across all registered projects, or declare `--projectName` in the surface flags with a clear description. Whichever is chosen, add a test asserting the without-projectName behavior.

### M-2 — The "zero daemon help fetches" test does not test `runCli`
**Location:** `tests/cli/help.test.ts:157-188`

The test creates `noopFetch`, asserts `fetchCount === 0`, and never passes `noopFetch` anywhere. It calls `renderRootHelp`, `renderGroupHelp`, `renderLeafHelp` directly — those are pure functions by construction. The final line exists only to keep TypeScript from complaining about the unused spy.

Plan Gate 2 required "CLI issues zero requests to removed help endpoints (test asserts this)." This test does not satisfy that. Add a test that invokes `runCli(["help"], deps)` (and a few representative `runCli(["<group>", "help"], deps)` calls) with a spy `daemonFetch` that throws on invocation.

### M-3 — No snapshot tests for commission UX
**Location:** `tests/cli/commission-format.test.ts`

Plan Phase 4 scope item #4 stated: "No regression in existing commission UX (list table, detail view, action confirmations) — verified via snapshot tests." The shipped tests use `expect(output).toContain(...)` shape checks. Column widths, line order, truncation rules, and spacing can all drift without failing the suite.

Add golden-file or `bun`-native snapshot assertions for: `formatCommissionList` (populated + empty), `formatCommissionDetail` (with and without progress/result, with and without schedule/trigger info, timeline truncation at 5), and `formatActionConfirmation` for each of dispatch/cancel/abandon/redispatch.

## Minor

### m-1 — `renderRootHelp` hardcodes `migrate-content` outside the surface tree
**Location:** `cli/help.ts`; enforced by `tests/cli/help.test.ts:42-44`

Top-level help content is part-derived-from-data, part-literal. Adding or renaming a top-level entry now requires edits in two places, and the test encodes the inconsistency. Either promote `migrate-content` into `CLI_SURFACE` so tree traversal renders it, or drop it from help until it has a surface entry.

### m-2 — `dispatchAggregate` hardcodes daemon paths instead of using resolved operation invocations
**Location:** `cli/index.ts:317, :343`

The literal strings `/meeting/request/meeting/list` and `/meeting/session/meeting/list` duplicate data already carried on `command.operations[i].invocation.path`. Rename an upstream operationId and this aggregate silently 404s while type-check and surface tests stay green. Read from the resolved operation instead.

### m-3 — `operationFor` in `cli/index.ts` duplicates resolution logic from `cli/resolve.ts`
Two code paths convert an operationId into a `CliOperation`. One (resolveCommand/invocationForOperation) is covered by tests; the other is used only by the package-op dispatch. Collapse through a shared helper so the derivation cannot drift.

### m-4 — Wrong REQ tag on no-continue-save test
**Location:** `tests/cli/no-continue-save.test.ts:13`

The `describe` block cites `REQ-CLI-AGENT-17`, which is about TTY detection. Dead-code removal is part of formatter-registry scope (closer to REQ-25) or is implicit. Update the label; traceability matters in Phase 5.

### m-5 — `resolve.test.ts` does not exercise `resolveCommand` against the real surface
**Location:** `tests/cli/resolve.test.ts`

The suite uses a synthetic `testSurface`. REQ-CLI-AGENT-3 ("thin client over the full CLI surface") is covered structurally via `tests/cli/surface.test.ts` but not as a resolver guarantee. Add a test that enumerates every leaf via `leafNodes(CLI_SURFACE)`, calls `resolveCommand(pathForNode(leaf), CLI_SURFACE)`, and asserts the result is `command` (never `unknown`).

### m-6 — Meeting `list` surface omits `--projectName` flag declaration
**Location:** `cli/surface.ts:313-320`

Even setting aside M-1's behavior question, the current surface does not document `--projectName` on `meeting list`. If the decision is "accept --projectName and behavior changes accordingly," it belongs in the `flags` array with a description so help renders it.

---

## Explicit Gate 2 scope verification

| Scope item | Status |
|---|---|
| 1. Help tree rendering at root/group/leaf (REQ-CLI-AGENT-13-18, 24) | Pass, subject to m-1 |
| 2. Resolver correctness against full CLI surface (REQ-CLI-AGENT-3) | Partial — see m-5 |
| 3. Aggregation merge for `meeting list` (REQ-CLI-AGENT-10, 10a) incl. Gate 1 m-4 | m-4 satisfied; runtime bug in dispatch per M-1 |
| 4. Formatter registry refactor (REQ-CLI-AGENT-25) + snapshot tests | Refactor lands; snapshot tests missing per M-3 |
| 5. Dead-code removal: `/commission/run/continue`, `/commission/run/save` | Pass |
| 6. Daemon help surface fully removed (REQ-CLI-AGENT-26) | Pass |
| 7. CLI issues zero requests to removed help endpoints | Test exists but does not verify this; see M-2 |
| 8. DI through `main()` — `daemonFetch` and optional `operationsRegistry` | Pass |
| 9. No `mock.module()` usage | Pass |
| 10. Package-op resolves correctly; fails cleanly on unknown operationId | Pass |

## Recommendation

Block merge on M-1, M-2, M-3. The Minor findings can be bundled into a follow-up if preferred, but M-2 and M-3 in particular compromise the review value of the work: they're the class of test where green light doesn't mean the thing works. M-1 is a live bug.


## Decisions

**Does `meeting list --state=requested` work correctly when `--projectName` is omitted?**
MAJOR: `dispatchAggregate` silently skips the requested-meetings fetch when `projectName` is undefined, producing zero rows with no diagnostic.
*Reasoning: cli/index.ts:311-314 guards the request-side fetch with `projectName !== undefined`. A user running `guild-hall meeting list --state=requested` without `--projectName` gets an empty result with no warning. Worse: the surface declaration at cli/surface.ts:313-320 declares only `--state` as a flag — `--projectName` is undocumented, so users cannot discover this prerequisite from `guild-hall meeting list help`. Either the aggregate should require projectName and fail loudly when missing, or it should fan out to all projects, or `--projectName` needs to be declared in the surface flags. tests/cli/meeting-list-aggregation.test.ts covers `--state=requested --projectName=...` but has no test for `--state=requested` without projectName — the bug is not caught by the suite.*

**Does the "help rendering makes zero daemon fetches" test actually exercise the CLI path?**
MAJOR: The test in tests/cli/help.test.ts:157-188 does not exercise `runCli` — it creates a `noopFetch` spy and never passes it anywhere. The REQ-CLI-AGENT-26 guarantee that the CLI help path makes zero daemon calls is not actually verified.
*Reasoning: The test calls `renderRootHelp`, `renderGroupHelp`, and `renderLeafHelp` directly and asserts `fetchCount === 0`. But those functions take no fetcher argument — they are pure by construction. The test even acknowledges this in its own comment: "we simulate by creating a spy and never passing it". The comment concedes the spy is unreachable, then the test uses `expect(typeof noopFetch).toBe("function")` just to silence TypeScript. A real test would call `runCli(["help"], deps)` with a spy `daemonFetch` that throws on any call. Plan Gate 2 requires "CLI issues zero requests to removed help endpoints (test asserts this)" — this test does not satisfy that requirement.*

**Does the formatter registry refactor ship with snapshot tests for commission UX (Gate 2 scope #4)?**
MAJOR: No snapshot tests exist. tests/cli/commission-format.test.ts uses shape-based assertions (`expect(lines[0]).toContain("ID")`, `expect(output).toContain("Status:")`) instead of comparing against a frozen expected output.
*Reasoning: Plan Phase 4 Gate 2 explicitly required: "No regression in existing commission UX (list table, detail view, action confirmations) — verified via snapshot tests." The tests present check that certain substrings appear, which means layout, column widths, truncation rules, and line ordering can all drift without failing a test. A small reformatting in formatCommissionList or formatCommissionDetail would produce visually different output yet pass the suite. This is the same class of finding noted in the project's retro lessons: "Tests that construct expected values from the code's internal state validate consistency, not correctness." Either add bun's snapshot feature or commit golden-file expected strings per formatter.*

**Is renderRootHelp consistent with REQ-CLI-AGENT-1 (CLI surface as single source of truth)?**
MINOR: renderRootHelp hardcodes `migrate-content` as a top-level entry outside the CLI surface tree. The surface-utility contract is violated because help content is derived partly from data and partly from a literal in help.ts.
*Reasoning: cli/help.ts lines referenced by tests/cli/help.test.ts:42-44 assert `text.toContain("migrate-content")` — meaning the string is injected outside the CLI_SURFACE tree. Either `migrate-content` should be a first-class surface entry (so it appears through normal tree traversal) or the plan's premise that the surface is authoritative is loosened. Right now, adding or renaming a top-level entry requires edits in two places. The test also encodes the inconsistency, making the inconsistency load-bearing.*

**Does dispatchAggregate use the resolved CliOperation invocation paths, or does it hardcode paths?**
MINOR: dispatchAggregate hardcodes `/meeting/request/meeting/list` and `/meeting/session/meeting/list` as string literals instead of reading `command.operations[i].invocation.path`.
*Reasoning: cli/index.ts:317 and :343 use literal path strings. The `CliOperation` objects already carry `invocation.path` derived from the operationId via `invocationForOperation` in surface-utils.ts. Rename either underlying operationId and the aggregate silently breaks at runtime with 404s while type-check and surface tests pass. The aggregate command already carries the resolved operations — the dispatcher should use them.*

**Is the `REQ-CLI-AGENT-17` label on tests/cli/no-continue-save.test.ts correct?**
MINOR: The `describe` block names REQ-CLI-AGENT-17, but that REQ is about TTY detection. The dead-code removal of `commission.run.continue` and `commission.run.save` is not the subject of REQ-17; this is surface cleanliness, closer to REQ-25 (formatter registry scope).
*Reasoning: Mis-labelled REQ tags degrade the spec-to-test traceability that Phase 5 will lean on. Low impact today, but it looks like a find-and-replace ran too aggressively. Fix by either citing the right REQ (or no REQ if the removal is implicit) and updating the `describe` name.*

**Does cli/index.ts duplicate operation-resolution logic from cli/resolve.ts?**
MINOR: `operationFor` in cli/index.ts duplicates the operationId→invocation resolution already performed by `resolveCommand` / `invocationForOperation`.
*Reasoning: Two code paths converting an operationId into a `CliOperation` is a maintenance hazard — they can drift. One of them is under test coverage; the other (operationFor) is exercised primarily through the package-op path. Prefer collapsing through a shared helper so both branches derive the same invocation and parameter inference.*

**Do tests actually exercise resolveCommand against the real CLI_SURFACE (REQ-CLI-AGENT-3)?**
MINOR: tests/cli/resolve.test.ts exercises `resolveCommand` only against a small hand-built testSurface, not `CLI_SURFACE`. REQ-CLI-AGENT-3 ("thin client correctness against the full CLI surface") is verified only indirectly — via tests/cli/surface.test.ts structural checks and isolated subtree tests.
*Reasoning: The current suite will catch tree-walk bugs in a minimal synthetic surface but won't catch a regression where a specific real leaf becomes unreachable (bad parent link, missing description, operationId typo). At least one test should call `resolveCommand([...path], CLI_SURFACE)` for every leaf in the real surface, asserting no result is `unknown`. The surface tests verify structure, not resolution — the two guarantees are different.*

**Was Gate 1 minor finding m-4 (empty startedAt in aggregate sort) addressed?**
SATISFIED: m-4 is addressed. `mergeMeetingAggregate` pushes empty-startedAt rows to the tail with preserved relative order, and two tests in tests/cli/meeting-list-aggregation.test.ts:49-79 cover both single-empty and multi-empty cases.
*Reasoning: Gate 1 flagged that malformed `audience-…` IDs produce empty `startedAt` strings, which would have sorted before all real dates as `1970-01-01`. The implementation now partitions dated vs. empty rows and concatenates empties at the end, matching the commented rationale in the tests. Stable order within empty rows is asserted.*

**Was the daemon help surface fully removed (REQ-CLI-AGENT-26)?**
SATISFIED: daemon/app.ts has no import of `createHelpRoutes` and no `/help` mount. A comment at ~line 150-151 references REQ-CLI-AGENT-26. Phase 5 owns the structural 404 guard test per the plan, so its absence here is acceptable.
*Reasoning: Direct file inspection confirms removal. The plan explicitly assigns the 404-return test to Phase 5, so Gate 2 is not responsible for it.*

**Was the formatter registry refactored from path-keyed to operationId-keyed (REQ-CLI-AGENT-25)?**
SATISFIED (modulo snapshot-test gap captured separately): cli/commission-format.ts keys `COMMISSION_FORMATTERS`, `COMMISSION_ACTION_OPERATIONS`, and `ACTION_VERBS` by operationId. The removed `commission.run.continue` and `commission.run.save` entries are gone from all three registries, from the surface tree, and from the action set. tests/cli/commission-format.test.ts:34-38 explicitly asserts the formatter rejects path-style keys.
*Reasoning: Source and tests agree. The one gap is that the tests are shape-based rather than snapshot-based (recorded as a separate Major finding).*

**Was DI threaded through `main()` and is the codebase free of `mock.module()`?**
SATISFIED: `CliDeps` carries `daemonFetch`, `streamOperation`, optional `surface`, `operationsRegistry`, and `readStdin`. `runCli(argv, deps)` is the test entry point; `main()` wraps production wiring behind `import.meta.main`. No `mock.module()` usages in the cli tests reviewed.
*Reasoning: tests/cli/meeting-list-aggregation.test.ts, tests/cli/package-op.test.ts, and tests/cli/cli-error-handling.test.ts all construct deps and call `runCli` (or the daemon `app.request` test client) directly — the canonical DI pattern the project prescribes.*

**Does the package-op branch resolve correctly and fail cleanly on unknown operationId?**
SATISFIED: tests/cli/package-op.test.ts covers POST inference (verb-based), GET inference for read-shaped verbs (query string encoding), registry-parameter override, boolean-flag forwarding, and exit-1 on missing target operationId.
*Reasoning: The suite exercises all four branches. The "unknown command" assertion is direct: it intercepts `process.exit` and asserts exit code 1 with the error piped through stderr.*
