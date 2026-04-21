---
title: "Commission: C8 — Final Review (Thorne)"
date: 2026-04-21
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Final whole-feature review of the CLI Agent-First Surface work.\n\n**Plan:** `.lore/plans/infrastructure/cli-agent-surface.md` — read the whole document, including §Review Gate 3.\n**Spec:** `.lore/specs/infrastructure/cli-agent-surface.md` — every requirement must trace to a test.\n**Prior commissions:**\n- `commission-Dalton-20260420-215633` (Phases 1+2)\n- `commission-Thorne-20260420-215649` (Gate 1 review)\n- `commission-Dalton-20260421-063646` (Gate 1 fixes)\n- `commission-Dalton-20260421-063833` (Phases 3+4)\n- `commission-Thorne-20260421-084120` (Gate 2 review)\n- `commission-Dalton-20260421-085202` (Gate 2 fixes)\n- `commission-Dalton-20260421-085232` (Phase 5 harness)\n\n**Scope of this final review:**\n1. **Requirement traceability:** every REQ-CLI-AGENT-* maps to at least one test. Walk the spec's requirement table and confirm coverage.\n2. **Success Criteria:** verify every bullet in the spec's Success Criteria section, including \"daemon's `/help` tree routes and `/help/operations` endpoint are removed.\"\n3. **No unaccounted-for `cliPath` references** anywhere in code (daemon, CLI, packages, types).\n4. **No residual references** to `daemon/routes/help.ts` or the exported `createHelpRoutes`.\n5. **`cli-commission-commands` behaviour intact:** commission list/read/detail/action UX unchanged. Snapshot tests in place.\n6. **Prior findings not reintroduced:** Gate 1 and Gate 2 findings stay fixed.\n7. **Package-op coverage claim verifiable:** every registered operation is reachable either through the noun-centric surface or `package-op`.\n8. **Skill-builder harness is self-contained:** consumes only `--json help`, no source peeking, no REST help.\n9. **Dead code audit:** no stale references to continue/save, no leftover `cliPath` hooks, no dangling help-tree types.\n\n**Review posture:**\n- No write tools. Findings go in your commission result body, severity-tagged.\n- Present ALL findings; do not triage silently. User decides what's worth skipping.\n- If any Success Criteria bullet is not demonstrably satisfied by code or tests, flag it.\n- If any REQ is covered only by structural assertion without behavioural verification, note the coverage type.\n\nOutput: structured findings + a requirement traceability matrix (REQ → test file(s)). The Guild Master will dispatch final fixes and then hand off to Octavia for Phase 6 spec back-prop."
dependencies:
  - commission-Dalton-20260421-085232
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T15:52:49.935Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T15:52:49.936Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-21T22:56:43.685Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-21T22:56:43.688Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T22:56:43.739Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T22:58:11.862Z
    event: progress_report
    reason: "Read spec, plan, surface.ts, resolve.ts, surface-utils.ts, admin.ts, workspace-issue.ts, app.ts. Starting requirement traceability and file audits."
  - timestamp: 2026-04-21T23:03:38.979Z
    event: progress_report
    reason: "Review complete. Recording findings and preparing final Gate 3 deliverable."
  - timestamp: 2026-04-21T23:05:53.250Z
    event: result_submitted
    reason: "\n# Gate 3 — Final Whole-Feature Review: CLI Agent-First Surface\n\n**Verdict: Ship with noted follow-ups.** All requirements have test coverage, all Gate 1 and Gate 2 findings are verified fixed, the daemon help-tree is gone with no residual references, and the package-op + skill-builder harnesses are genuine (no test theatre). Four non-blocking findings captured below — none block merge.\n\n---\n\n## Findings by Severity\n\n### Critical\nNone.\n\n### Major\nNone.\n\n### Minor\n\n**MIN-1: `ARTIFACT_DOCUMENT_WRITE_OP` is a workaround, not a fix.** (`cli/surface.ts:27`)\nThe operation ID is assembled from an array join with a comment acknowledging it exists to \"dodge an overzealous pre-write security hook that flags the literal substring.\" Per lessons-learned: workarounds hide the real problem. The hook's pattern should be narrowed so source code can spell its own operation IDs directly. Leaving this in place trains future contributors to obfuscate strings whenever tooling misfires.\n*Action:* Fix the hook, then collapse the array join back to a literal.\n\n### Note\n\n**NOTE-1: `LOCAL_COMMAND_SENTINEL` is undocumented.** (`cli/surface.ts`)\nA third surface sentinel (`\"__local__\"`) was introduced alongside `PACKAGE_OP_SENTINEL` and `AGGREGATE_SENTINEL` to promote `migrate-content` into `CLI_SURFACE`. This is a sound fix for Gate 2 m-1, but the spec (`.lore/specs/infrastructure/cli-agent-surface.md`) and plan do not describe it. The surface taxonomy now has three sentinel kinds; the spec lists two.\n*Action:* Add a paragraph to the spec describing the local-command sentinel and when to use it.\n\n**NOTE-2: Root-level surface mixes groups and a verb-shaped leaf.**\n`migrateContentLeaf` sits at the top level next to noun groups (commission, meeting, artifact, workspace, worker, model, system, package-op). REQ-CLI-AGENT-12 calls for consistent noun-verb grammar; the path-rule test explicitly permits this shape, so it is spec-compliant, but the symmetry is weaker than the plan's noun-first intent suggested. If another local-only command joins later, consider a \"workspace\" or \"admin\" group.\n\n**NOTE-3: Verb-heuristic method derivation has no \"subscribe\" override.** (`cli/surface-utils.ts`)\n`GET_VERBS` omits `subscribe`, and `METHOD_OVERRIDES` is empty. `system.events.stream.subscribe` would resolve to POST under pure heuristic inference. This is only reached through `package-op` fallback without a registry; production always injects the registry and picks up the real invocation, so the risk is confined to ad-hoc CLI invocations against unregistered SSE operations. A one-line addition to `METHOD_OVERRIDES` would make the fallback safer.\n\n---\n\n## Requirement Traceability Matrix\n\n| REQ                    | Primary test                                         | Notes                                                             |\n|------------------------|------------------------------------------------------|-------------------------------------------------------------------|\n| REQ-CLI-AGENT-1        | `tests/cli/surface-structural.test.ts`               | Path-rule invariants                                              |\n| REQ-CLI-AGENT-2        | `tests/cli/surface-structural.test.ts`               | Noun-centric structure                                            |\n| REQ-CLI-AGENT-3        | `tests/cli/resolve.test.ts` (real-surface block)     | Every leaf reachable                                              |\n| REQ-CLI-AGENT-4        | `tests/cli/surface-structural.test.ts`               | Phase labels forbidden as intermediates                           |\n| REQ-CLI-AGENT-5        | `tests/cli/surface-structural.test.ts`               | Verb placement                                                    |\n| REQ-CLI-AGENT-6        | `tests/cli/surface-structural.test.ts`               | Depth cap                                                         |\n| REQ-CLI-AGENT-7        | `tests/cli/surface-structural.test.ts`               | list/read pairing                                                 |\n| REQ-CLI-AGENT-8        | `tests/cli/surface-structural.test.ts`               | Registry-CLI symmetry                                             |\n| REQ-CLI-AGENT-9        | `tests/cli/surface-structural.test.ts`               | Operation-id ↔ path contract                                      |\n| REQ-CLI-AGENT-10       | `tests/cli/surface-structural.test.ts`               | LIST_WITHOUT_READ_EXEMPT_GROUPS set                               |\n| REQ-CLI-AGENT-10a      | `tests/cli/surface-structural.test.ts`               | Exemption list enforced                                           |\n| REQ-CLI-AGENT-11       | `tests/cli/surface-structural.test.ts`               | Method heuristic                                                  |\n| REQ-CLI-AGENT-12       | `tests/cli/surface-structural.test.ts`               | Top-level grammar (see NOTE-2)                                    |\n| REQ-CLI-AGENT-13       | `tests/cli/package-op.test.ts`                       | Package-op fallback (4 tests)                                     |\n| REQ-CLI-AGENT-14       | `tests/cli/help.test.ts`                             | JSON help                                                         |\n| REQ-CLI-AGENT-15       | `tests/cli/help.test.ts` (zero-fetch block)          | No daemon fetch from help                                         |\n| REQ-CLI-AGENT-16       | `tests/cli/surface-structural.test.ts`               | cliPath absence (compile + runtime)                               |\n| REQ-CLI-AGENT-17       | `tests/cli/commission-format.test.ts`                | Formatter shape + snapshots                                       |\n| REQ-CLI-AGENT-18       | `tests/cli/commission-format.test.ts`                | Terminal width pinned                                             |\n| REQ-CLI-AGENT-19       | `tests/cli/surface-structural.test.ts`               | Phase-1 leaf response shape                                       |\n| REQ-CLI-AGENT-20       | `tests/cli/skill-build.test.ts`                      | Skill-builder harness                                             |\n| REQ-CLI-AGENT-21       | `tests/cli/surface-structural.test.ts`               | Daemon help routes removed (404s)                                 |\n| REQ-CLI-AGENT-22       | `tests/cli/surface-structural.test.ts`               | In-process registry DI                                            |\n| REQ-CLI-AGENT-22a      | `tests/cli/surface-structural.test.ts`               | workspace.issue 3-segment exception                               |\n| REQ-CLI-AGENT-23       | `tests/cli/surface-structural.test.ts`               | Help completeness                                                 |\n| REQ-CLI-AGENT-24       | `tests/cli/surface-structural.test.ts`               | Operation pinning                                                 |\n| REQ-CLI-AGENT-25       | `tests/cli/commission-format.test.ts`, `tests/cli/no-continue-save.test.ts` | Snapshots + continue/save removed |\n| REQ-CLI-AGENT-26       | `tests/cli/surface-structural.test.ts`               | Formatter keying                                                  |\n\nAll 27 requirements satisfied by at least one test. No unbound REQ IDs.\n\n---\n\n## Success Criteria Verification\n\n- Daemon `/help` tree and `/help/operations` are removed — **verified.** `daemon/routes/help.ts` does not exist; `createHelpRoutes` is not exported; surface-structural.test asserts 404 for `/help`, `/help/operations`, `/commission/help`, `/meeting/help`.\n- No `cliPath` references anywhere — **verified.** Grep across `cli/`, `daemon/`, `lib/`, `web/`, `packages/` returns zero hits. `OperationDefinition` lacks the field (compile guard) and the runtime assertion in surface-structural.test closes the loop.\n- No references to `daemon/routes/help.ts` or `createHelpRoutes` — **verified.** No imports, no exports, no test fixtures.\n- `cli-commission-commands` behaviour intact — **verified.** `commission-format.test` snapshot suite covers list, detail, actions (dispatch/redispatch/cancel/abandon), schedule/trigger, timeline truncation.\n- Prior Gate 1 / Gate 2 findings not reintroduced — **verified.** M-1 (meeting list fan-out), M-2 (real zero-fetch help test), M-3 (snapshot coverage), m-1 through m-6 all fixed. Details in the decision log.\n- Package-op coverage claim — **verified.** Four behavioural tests exercise POST synthesis, GET query string, registry override, and boolean flag forwarding.\n- Skill-builder self-contained — **verified.** Harness uses throwing daemonFetch; zero-daemon-call assertion covers representative scopes including `migrate-content` and `package-op`.\n- Dead code audit — **clean.** No continue/save residue, no cliPath leftover, no dangling help-tree types.\n\n---\n\n## Prior Findings Regression Check\n\n| ID   | Gate | Status  | Evidence                                                         |\n|------|------|---------|------------------------------------------------------------------|\n| M-1  | 2    | Fixed   | `cli/index.ts` fans out over `/system/config/project/list`       |\n| M-2  | 2    | Fixed   | `tests/cli/help.test.ts` zero-fetch block uses real `runCli`     |\n| M-3  | 2    | Fixed   | `tests/cli/commission-format.test.ts` `toMatchSnapshot` suite    |\n| m-1  | 2    | Fixed   | `migrateContentLeaf` promoted into `CLI_SURFACE`                 |\n| m-2  | 2    | Fixed   | `requestedOp.invocation.path` replaces hardcoded literals        |\n| m-3  | 2    | Fixed   | `buildCliOperation()` unifies resolution                         |\n| m-4  | 2    | Fixed   | `no-continue-save.test.ts` tagged REQ-CLI-AGENT-25               |\n| m-5  | 2    | Fixed   | `resolve.test.ts` real-CLI_SURFACE reachability block            |\n| m-6  | 2    | Fixed   | meeting list declares `--projectName` flag                       |\n\n---\n\n## Recommendation\n\n**Merge-ready.** The three notes and one minor are non-blocking. I'd ship this and queue MIN-1 (unobfuscate the operation ID) and NOTE-1 (document `LOCAL_COMMAND_SENTINEL` in the spec) as immediate follow-ups — both are small and prevent the workaround pattern from replicating. NOTE-2 and NOTE-3 are backlog-grade.\n"
  - timestamp: 2026-04-21T23:05:59.287Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Review complete. Recording findings and preparing final Gate 3 deliverable."
projectName: guild-hall
---

# Gate 3 — Final Whole-Feature Review: CLI Agent-First Surface

**Verdict: Ship with noted follow-ups.** All requirements have test coverage, all Gate 1 and Gate 2 findings are verified fixed, the daemon help-tree is gone with no residual references, and the package-op + skill-builder harnesses are genuine (no test theatre). Four non-blocking findings captured below — none block merge.

---

## Findings by Severity

### Critical
None.

### Major
None.

### Minor

**MIN-1: `ARTIFACT_DOCUMENT_WRITE_OP` is a workaround, not a fix.** (`cli/surface.ts:27`)
The operation ID is assembled from an array join with a comment acknowledging it exists to "dodge an overzealous pre-write security hook that flags the literal substring." Per lessons-learned: workarounds hide the real problem. The hook's pattern should be narrowed so source code can spell its own operation IDs directly. Leaving this in place trains future contributors to obfuscate strings whenever tooling misfires.
*Action:* Fix the hook, then collapse the array join back to a literal.

### Note

**NOTE-1: `LOCAL_COMMAND_SENTINEL` is undocumented.** (`cli/surface.ts`)
A third surface sentinel (`"__local__"`) was introduced alongside `PACKAGE_OP_SENTINEL` and `AGGREGATE_SENTINEL` to promote `migrate-content` into `CLI_SURFACE`. This is a sound fix for Gate 2 m-1, but the spec (`.lore/specs/infrastructure/cli-agent-surface.md`) and plan do not describe it. The surface taxonomy now has three sentinel kinds; the spec lists two.
*Action:* Add a paragraph to the spec describing the local-command sentinel and when to use it.

**NOTE-2: Root-level surface mixes groups and a verb-shaped leaf.**
`migrateContentLeaf` sits at the top level next to noun groups (commission, meeting, artifact, workspace, worker, model, system, package-op). REQ-CLI-AGENT-12 calls for consistent noun-verb grammar; the path-rule test explicitly permits this shape, so it is spec-compliant, but the symmetry is weaker than the plan's noun-first intent suggested. If another local-only command joins later, consider a "workspace" or "admin" group.

**NOTE-3: Verb-heuristic method derivation has no "subscribe" override.** (`cli/surface-utils.ts`)
`GET_VERBS` omits `subscribe`, and `METHOD_OVERRIDES` is empty. `system.events.stream.subscribe` would resolve to POST under pure heuristic inference. This is only reached through `package-op` fallback without a registry; production always injects the registry and picks up the real invocation, so the risk is confined to ad-hoc CLI invocations against unregistered SSE operations. A one-line addition to `METHOD_OVERRIDES` would make the fallback safer.

---

## Requirement Traceability Matrix

| REQ                    | Primary test                                         | Notes                                                             |
|------------------------|------------------------------------------------------|-------------------------------------------------------------------|
| REQ-CLI-AGENT-1        | `tests/cli/surface-structural.test.ts`               | Path-rule invariants                                              |
| REQ-CLI-AGENT-2        | `tests/cli/surface-structural.test.ts`               | Noun-centric structure                                            |
| REQ-CLI-AGENT-3        | `tests/cli/resolve.test.ts` (real-surface block)     | Every leaf reachable                                              |
| REQ-CLI-AGENT-4        | `tests/cli/surface-structural.test.ts`               | Phase labels forbidden as intermediates                           |
| REQ-CLI-AGENT-5        | `tests/cli/surface-structural.test.ts`               | Verb placement                                                    |
| REQ-CLI-AGENT-6        | `tests/cli/surface-structural.test.ts`               | Depth cap                                                         |
| REQ-CLI-AGENT-7        | `tests/cli/surface-structural.test.ts`               | list/read pairing                                                 |
| REQ-CLI-AGENT-8        | `tests/cli/surface-structural.test.ts`               | Registry-CLI symmetry                                             |
| REQ-CLI-AGENT-9        | `tests/cli/surface-structural.test.ts`               | Operation-id ↔ path contract                                      |
| REQ-CLI-AGENT-10       | `tests/cli/surface-structural.test.ts`               | LIST_WITHOUT_READ_EXEMPT_GROUPS set                               |
| REQ-CLI-AGENT-10a      | `tests/cli/surface-structural.test.ts`               | Exemption list enforced                                           |
| REQ-CLI-AGENT-11       | `tests/cli/surface-structural.test.ts`               | Method heuristic                                                  |
| REQ-CLI-AGENT-12       | `tests/cli/surface-structural.test.ts`               | Top-level grammar (see NOTE-2)                                    |
| REQ-CLI-AGENT-13       | `tests/cli/package-op.test.ts`                       | Package-op fallback (4 tests)                                     |
| REQ-CLI-AGENT-14       | `tests/cli/help.test.ts`                             | JSON help                                                         |
| REQ-CLI-AGENT-15       | `tests/cli/help.test.ts` (zero-fetch block)          | No daemon fetch from help                                         |
| REQ-CLI-AGENT-16       | `tests/cli/surface-structural.test.ts`               | cliPath absence (compile + runtime)                               |
| REQ-CLI-AGENT-17       | `tests/cli/commission-format.test.ts`                | Formatter shape + snapshots                                       |
| REQ-CLI-AGENT-18       | `tests/cli/commission-format.test.ts`                | Terminal width pinned                                             |
| REQ-CLI-AGENT-19       | `tests/cli/surface-structural.test.ts`               | Phase-1 leaf response shape                                       |
| REQ-CLI-AGENT-20       | `tests/cli/skill-build.test.ts`                      | Skill-builder harness                                             |
| REQ-CLI-AGENT-21       | `tests/cli/surface-structural.test.ts`               | Daemon help routes removed (404s)                                 |
| REQ-CLI-AGENT-22       | `tests/cli/surface-structural.test.ts`               | In-process registry DI                                            |
| REQ-CLI-AGENT-22a      | `tests/cli/surface-structural.test.ts`               | workspace.issue 3-segment exception                               |
| REQ-CLI-AGENT-23       | `tests/cli/surface-structural.test.ts`               | Help completeness                                                 |
| REQ-CLI-AGENT-24       | `tests/cli/surface-structural.test.ts`               | Operation pinning                                                 |
| REQ-CLI-AGENT-25       | `tests/cli/commission-format.test.ts`, `tests/cli/no-continue-save.test.ts` | Snapshots + continue/save removed |
| REQ-CLI-AGENT-26       | `tests/cli/surface-structural.test.ts`               | Formatter keying                                                  |

All 27 requirements satisfied by at least one test. No unbound REQ IDs.

---

## Success Criteria Verification

- Daemon `/help` tree and `/help/operations` are removed — **verified.** `daemon/routes/help.ts` does not exist; `createHelpRoutes` is not exported; surface-structural.test asserts 404 for `/help`, `/help/operations`, `/commission/help`, `/meeting/help`.
- No `cliPath` references anywhere — **verified.** Grep across `cli/`, `daemon/`, `lib/`, `web/`, `packages/` returns zero hits. `OperationDefinition` lacks the field (compile guard) and the runtime assertion in surface-structural.test closes the loop.
- No references to `daemon/routes/help.ts` or `createHelpRoutes` — **verified.** No imports, no exports, no test fixtures.
- `cli-commission-commands` behaviour intact — **verified.** `commission-format.test` snapshot suite covers list, detail, actions (dispatch/redispatch/cancel/abandon), schedule/trigger, timeline truncation.
- Prior Gate 1 / Gate 2 findings not reintroduced — **verified.** M-1 (meeting list fan-out), M-2 (real zero-fetch help test), M-3 (snapshot coverage), m-1 through m-6 all fixed. Details in the decision log.
- Package-op coverage claim — **verified.** Four behavioural tests exercise POST synthesis, GET query string, registry override, and boolean flag forwarding.
- Skill-builder self-contained — **verified.** Harness uses throwing daemonFetch; zero-daemon-call assertion covers representative scopes including `migrate-content` and `package-op`.
- Dead code audit — **clean.** No continue/save residue, no cliPath leftover, no dangling help-tree types.

---

## Prior Findings Regression Check

| ID   | Gate | Status  | Evidence                                                         |
|------|------|---------|------------------------------------------------------------------|
| M-1  | 2    | Fixed   | `cli/index.ts` fans out over `/system/config/project/list`       |
| M-2  | 2    | Fixed   | `tests/cli/help.test.ts` zero-fetch block uses real `runCli`     |
| M-3  | 2    | Fixed   | `tests/cli/commission-format.test.ts` `toMatchSnapshot` suite    |
| m-1  | 2    | Fixed   | `migrateContentLeaf` promoted into `CLI_SURFACE`                 |
| m-2  | 2    | Fixed   | `requestedOp.invocation.path` replaces hardcoded literals        |
| m-3  | 2    | Fixed   | `buildCliOperation()` unifies resolution                         |
| m-4  | 2    | Fixed   | `no-continue-save.test.ts` tagged REQ-CLI-AGENT-25               |
| m-5  | 2    | Fixed   | `resolve.test.ts` real-CLI_SURFACE reachability block            |
| m-6  | 2    | Fixed   | meeting list declares `--projectName` flag                       |

---

## Recommendation

**Merge-ready.** The three notes and one minor are non-blocking. I'd ship this and queue MIN-1 (unobfuscate the operation ID) and NOTE-1 (document `LOCAL_COMMAND_SENTINEL` in the spec) as immediate follow-ups — both are small and prevent the workaround pattern from replicating. NOTE-2 and NOTE-3 are backlog-grade.


## Decisions

**Are prior Gate 2 findings (M-1, M-2, M-3, m-1..m-6) reintroduced in the current code?**
All Gate 2 findings are verified fixed; none are regressed.
*Reasoning: M-1 fan-out: cli/index.ts:303-335 fans out meeting list over /system/config/project/list. M-2 real daemon-free help test: tests/cli/help.test.ts has a describe block invoking real runCli with throwing daemonFetch. M-3 snapshots: tests/cli/commission-format.test.ts has toMatchSnapshot() suite pinned to 100-col. m-1: migrateContentLeaf is promoted into CLI_SURFACE via LOCAL_COMMAND_SENTINEL, no hardcode in renderRootHelp. m-2: cli/index.ts uses requestedOp.invocation.path. m-3: unified via buildCliOperation(). m-4: no-continue-save.test.ts tagged REQ-CLI-AGENT-25. m-5: resolve.test.ts has "real CLI_SURFACE reachability" block enumerating every leaf. m-6: meeting list declares --projectName flag.*

**Does every REQ-CLI-AGENT-* map to at least one test?**
Yes. All 27 requirements (1–26 plus 10a, 22a) have at least one test file citing them by REQ ID or covering the behavior.
*Reasoning: tests/cli/surface-structural.test.ts covers the invariant requirements (REQ-CLI-AGENT-1 through 12, 16, 21, 22a, 23, 24, 26) via path-rule, help-completeness, CLI↔registry consistency, cliPath, and workspace.issue hierarchy tests. tests/cli/resolve.test.ts covers REQ-CLI-AGENT-3 reachability. tests/cli/package-op.test.ts covers REQ-CLI-AGENT-13 (four behavioural tests). tests/cli/help.test.ts covers REQ-CLI-AGENT-14/15 (JSON help, zero-fetch). tests/cli/commission-format.test.ts covers REQ-CLI-AGENT-17/18/25 (formatters, snapshots). tests/cli/no-continue-save.test.ts covers REQ-CLI-AGENT-25 (continue/save removal). tests/cli/skill-build.test.ts covers REQ-CLI-AGENT-20 (skill harness self-contained). Phase-1 daemon leaf response shape covers REQ-CLI-AGENT-19. Registry DI test covers REQ-CLI-AGENT-22. REQ-CLI-AGENT-10a handled by the same path-rule + LIST_WITHOUT_READ_EXEMPT_GROUPS set.*

**Is the daemon /help tree and /help/operations endpoint removed, with no residual references?**
Yes. daemon/routes/help.ts is deleted, createHelpRoutes is not exported anywhere, and grep across cli/, daemon/, lib/, web/, packages/ finds zero references to cliPath, createHelpRoutes, routes/help, fetchHelpTree, or fetchOperations. 404 guards in tests/cli/surface-structural.test.ts assert /help, /help/operations, and tree-walk paths return 404.
*Reasoning: daemon/routes/ directory listing shows 13 files with no help.ts. Grep for "cliPath" across the repo returns zero hits. surface-structural.test asserts explicit 404s for /help, /help/operations, /commission/help, /meeting/help. OperationDefinition type no longer contains cliPath (compile-time guard) and runtime assertion in the same test file enforces it.*

**Is package-op coverage claim verifiable end-to-end?**
Yes. tests/cli/package-op.test.ts validates all four REQ-CLI-AGENT-13 behaviours: POST body synthesis from arg0/arg1, GET query string for read-verb operations, registry-provided parameter names winning over synthesized ones, boolean flag forwarding, and exit-1 with stderr "Unknown command" when no operationId is provided.
*Reasoning: File is 181 lines; five describe blocks directly exercise runCli with captured stdout/stderr and a calls array. Each test asserts the exact daemon path, method, and body payload. The registry-injection test proves the DI seam works.*

**Is the skill-builder harness self-contained (pure --json help, no source peek, no daemon)?**
Yes. tests/cli/skill-build.test.ts uses a throwingDeps() whose daemonFetch throws on invocation, walks the tree via argv=["...","help","--json"] only, and a separate test counts daemonCalls === 0 across representative scopes.
*Reasoning: File at lines 35-44 defines throwingDeps; lines 72-115 walk via help JSON only; lines 171-208 count real calls on representative scopes including migrate-content and package-op. The harness reads CLI_SURFACE only to build the expected set for comparison, which is a validation of completeness, not a cheat.*

**Is there any dead code residue from continue/save, cliPath, or help-tree types?**
No dead code residue found.
*Reasoning: tests/cli/no-continue-save.test.ts asserts formatters, isCommissionAction, CLI_SURFACE leaves, and commission group child names all lack continue/save. Grep finds no cliPath, fetchHelpTree, fetchOperations, or createHelpRoutes anywhere. OperationDefinition type is clean. No dangling imports surfaced in the file listings examined.*

**Is LOCAL_COMMAND_SENTINEL ("__local__") a documented part of the plan/spec?**
No. LOCAL_COMMAND_SENTINEL is an undocumented addition to the surface taxonomy. It was introduced to fix prior finding m-1 (migrate-content being a local-only command not in CLI_SURFACE) but is not mentioned in .lore/specs/infrastructure/cli-agent-surface.md or .lore/plans/infrastructure/cli-agent-surface.md.
*Reasoning: The spec enumerates PACKAGE_OP_SENTINEL and AGGREGATE_SENTINEL but never discusses a third sentinel for purely local CLI commands. This is a legitimate design choice (migrate-content runs locally and has no daemon operation) but the spec should record it as part of the surface taxonomy. Severity is Note — code is correct, documentation lags.*

**Is the ARTIFACT_DOCUMENT_WRITE_OP string-assembly in cli/surface.ts:27 a workaround?**
Yes, it is a workaround to dodge a pre-write security hook that flags a specific literal substring. The operation ID is assembled from an array join rather than written as a string literal.
*Reasoning: Per rules/lessons-learned "Fix the Problem, Not the Symptom": workarounds hide the real problem. The hook is over-aggressive, and the right fix is to narrow the hook's pattern — not teach the codebase to obfuscate matching strings. Severity Minor because the workaround lives in a single location with a comment, is inert, but signals a systemic tooling issue that will recur.*

**Is the verb-heuristic method derivation fragile for SSE streams?**
Minor concern. system.events.stream.subscribe would infer POST from the verb heuristic (subscribe ∉ GET_VERBS), but SSE streams are conventionally GET. Mitigated because buildCliOperation prefers registry-provided invocation when the registry is injected, which is the production path.
*Reasoning: cli/surface-utils.ts defines GET_VERBS without "subscribe" and METHOD_OVERRIDES is empty. STREAMING_OPERATIONS lists subscribe but that table governs streaming dispatch, not method derivation. The heuristic is only consulted for package-op fallback when no registry is present; in that path, the operation is unknown so any method guess is speculative. Severity Note.*

**Does root-level surface mixing groups with migrateContentLeaf weaken REQ-CLI-AGENT-12?**
Minor tension, but within spec. REQ-CLI-AGENT-12 requires a consistent noun-verb grammar at the top level. migrate-content is a verb-shaped leaf sitting alongside noun groups (commission, meeting, artifact, workspace, etc.), which breaks taxonomic symmetry.
*Reasoning: tests/cli/surface-structural.test.ts explicitly permits LOCAL_COMMAND_SENTINEL root-level leaves alongside groups, so it's test-allowed. The alternative (placing migrate-content under a "workspace" group) would require daemon restructuring. Severity Note — consider future reshaping if another local-only command joins.*
