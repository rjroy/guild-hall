---
title: "Commission: C2 — Review Gate 1: Phases 1 + 2"
date: 2026-04-21
status: completed
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the work completed in commission `commission-Dalton-20260420-215633` against the CLI Agent-First Surface plan.\n\n**Plan:** `.lore/plans/infrastructure/cli-agent-surface.md` — read §Phase 1, §Phase 2, and §Review Gate 1 for scope.\n**Spec:** `.lore/specs/infrastructure/cli-agent-surface.md` — read the relevant REQs.\n\n**Scope of this review (from the plan's Gate 1):**\n1. Four new daemon route handlers (`system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list`, `workspace.issue.read`) and their tests.\n2. `cli/surface.ts`, `cli/surface-utils.ts`, and `tests/cli/surface.test.ts`.\n3. Operation metadata completeness (operationId, version, schemas, sideEffects, context, idempotent, hierarchy, parameters).\n4. Zod schemas match the response shapes described in the plan.\n5. Structural invariants in `tests/cli/surface.test.ts` actually exercise every case listed (no repeated parent segments, no phase-label intermediates, list/read coverage, sub-grouping consistency).\n6. Compile-time `cliPath` assertion (REQ-CLI-AGENT-2) is present and meaningful.\n7. `package-op` fallback does not list the catalog at runtime (aligns with REQ-CLI-AGENT-26).\n8. No regressions in existing route tests.\n9. Route factories properly wired into `createProductionApp()` in `daemon/app.ts`.\n10. No `mock.module()` usage.\n\n**Requirement coverage to verify for these phases:**\n- REQ-CLI-AGENT-1, 2, 5-12, 21, 22, 22a, 23 (CLI-side and daemon-side as assigned in the plan's coverage table).\n\n**Review posture:**\n- You have no write tools. Capture all findings in your commission result body, organized by severity (Critical / Major / Minor).\n- Do not downgrade findings. \"Not a blocker\" is not \"defer\" — every finding goes into a fix commission.\n- Verify claims against code. \"The JSDoc says X\" is not evidence that X happens.\n- If a REQ ID is not covered by a test, flag it.\n- If you find the Dalton commission did not actually pass typecheck/lint/test/build, surface that explicitly.\n\nReport findings in structured form. The Guild Master will dispatch a fix commission based on your output if any findings land."
dependencies:
  - commission-Dalton-20260420-215633
linked_artifacts:
  - daemon/routes/admin.ts

  - daemon/routes/meetings.ts
  - daemon/routes/workspace-issue.ts
  - daemon/services/meeting/registry.ts
  - daemon/services/meeting/orchestrator.ts
  - daemon/app.ts
  - cli/surface.ts
  - cli/surface-utils.ts
  - tests/cli/surface.test.ts
  - tests/daemon/routes/admin.test.ts
  - tests/daemon/routes/meetings.test.ts
  - tests/daemon/routes/workspace-issue.test.ts
  - .lore/plans/infrastructure/cli-agent-surface.md
  - .lore/specs/infrastructure/cli-agent-surface.md
  - daemon/routes/meetings.ts
  - daemon/routes/workspace-issue.ts
  - daemon/services/meeting/registry.ts
  - daemon/services/meeting/orchestrator.ts
  - daemon/app.ts
  - cli/surface.ts
  - cli/surface-utils.ts
  - tests/cli/surface.test.ts
  - tests/daemon/routes/admin.test.ts
  - tests/daemon/routes/meetings.test.ts
  - tests/daemon/routes/workspace-issue.test.ts
  - .lore/plans/infrastructure/cli-agent-surface.md
  - .lore/specs/infrastructure/cli-agent-surface.md
activity_timeline:
  - timestamp: 2026-04-21T04:56:49.201Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T04:56:49.202Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-21T05:21:22.258Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-21T05:21:22.262Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T05:21:22.309Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T05:21:55.392Z
    event: progress_report
    reason: "Read plan + spec + commission artifact. Now reviewing source files for the four daemon leaves and cli/surface.ts."
  - timestamp: 2026-04-21T05:27:39.182Z
    event: result_submitted
    reason: "\n# Review Gate 1: Phases 1 + 2 of CLI Agent-First Surface\n\nReviewed against `.lore/plans/infrastructure/cli-agent-surface.md` (Phases 1–2) and `.lore/specs/infrastructure/cli-agent-surface.md` (REQ-CLI-AGENT-1, 2, 5–12, 21, 22, 22a, 23). Implementation under review: commit `f8058a1c` (Dalton's commission).\n\n---\n\n## Verdict\n\nPhase 1 and Phase 2 are substantially complete and structurally sound. Surface tree, structural invariants, aggregates, package-op sentinel, compile-time `cliPath` assertion, and route wiring all hold up. Tests are present for all four new daemon ops. One Major finding on metadata completeness; a handful of Minor notes.\n\n---\n\n## Findings\n\n### Major\n\n**M-1. All four new operations omit `requestSchema` and `responseSchema`.**\n\n- `daemon/routes/admin.ts:442-451` — `system.config.project.list`\n- `daemon/routes/meetings.ts:582-592` — `meeting.session.meeting.list`\n- `daemon/routes/workspace-issue.ts:221-235` — `workspace.issue.list`\n- `daemon/routes/workspace-issue.ts:236-250` — `workspace.issue.read`\n\nThe plan's Phase 1 metadata rule is explicit: each op declares `operationId, version: \"1\", name, description, invocation, requestSchema, responseSchema, sideEffects, context, idempotent, hierarchy, parameters`. The plan is also specific for `system.config.project.list`: \"Zod request: `z.object({})`. Zod response: typed project record array.\"\n\nDalton's result summary hedges with \"Zod schemas where appropriate.\" Verified in source: the schemas are simply absent on every new op.\n\nContext softening the severity: `OperationDefinition` at `lib/types.ts:506,508` declares both fields as optional, and `grep requestSchema:|responseSchema:` across all daemon routes returns zero matches. No existing op populates these — the project-wide practice is to omit them. So the deviation matches existing code, but it violates the explicit Phase 1 acceptance criterion for new ops.\n\nRemediation options (reader's call):\n1. Add the schemas to the four new ops now (minimum: `z.object({...})` for each request, a typed response schema for each). This is the literal plan.\n2. Amend the plan to match reality (drop the schema fields from Phase 1 metadata) and record the deferral explicitly. This is honest about the wider codebase.\n\nNot a silent-triage \"pre-existing\" skip — the plan called it out as a new-op requirement, so Phase 1 is not done until it's resolved one way or the other.\n\n---\n\n### Minor\n\n**m-1. OperationID-to-registry linkage is fixture-based, not live.**\n\n`tests/cli/surface.test.ts` defines `KNOWN_OPERATION_IDS` as a hand-maintained string set and asserts every tree-referenced op appears in it. A tree entry pointing to an op that is never registered in the daemon would still pass. The plan explicitly defers the live-registry assertion to Phase 5, so this is a documented gap, not a defect. Flagging it so it doesn't slip during Phase 3–4 changes: any CLI op added in the next phases still needs the fixture update until Phase 5 lands.\n\n**m-2. `meeting.session.meeting.list` and `system.config.project.list` omit the `parameters` field entirely.**\n\nThe plan says each op declares `parameters`. Both ops have no parameters, so an empty array would also satisfy the plan; current code omits the field. Existing neighboring ops (e.g., `system.config.application.validate` at `admin.ts:453-463`) also omit `parameters` when empty, so this is consistent with pre-existing practice. Presenting this as a Minor because it is literally off-plan; resolution is probably \"update the plan wording to permit omission when empty.\"\n\n**m-3. `workspace.issue.list`/`read` hierarchy uses verb as `object` segment.**\n\n`hierarchy: { root: \"workspace\", feature: \"issue\", object: \"list\" }` (and `\"read\"`). This is the three-segment exception described in REQ-CLI-AGENT-22a and matches the precedent of `workspace.issue.create` (`hierarchy.object: \"create\"`). Spec is satisfied; calling it out because the shape can look wrong at a glance to anyone who didn't read 22a, and a comment on the operation block would save the next reader a trip to the spec.\n\n**m-4. `parseStartedAtFromMeetingId` silently returns `\"\"` on malformed IDs.**\n\n`daemon/routes/meetings.ts:615-622`. The dedicated test (`meetings.test.ts:919-928`) asserts the empty-string behavior, so it's intentional and covered. Flagging only because empty-string-as-failure-signal is easy to mis-handle on the CLI render side. The downstream tree consumer hasn't been written yet, so this is a note for Phase 3, not a defect here.\n\n---\n\n## Confirmed Satisfied\n\n- **REQ-CLI-AGENT-1** (single dispatcher tree): `cli/surface.ts` defines one rooted tree; `cli/surface-utils.ts` walks it.\n- **REQ-CLI-AGENT-2** (no `cliPath` on ops): `tests/cli/surface.test.ts:25-27` has a compile-time type assertion. Any reintroduction of `cliPath` to `OperationDefinition` fails typecheck.\n- **REQ-CLI-AGENT-5, 6, 7** (no phase labels, no parent repeat, list⇒read): `assertPathRules` in `cli/surface-utils.ts` enforces; `surface.test.ts` asserts. `LIST_WITHOUT_READ_EXEMPT_GROUPS` documents the `worker`/`model` exemptions.\n- **REQ-CLI-AGENT-8** (sub-group non-empty): enforced by `assertPathRules` and tested.\n- **REQ-CLI-AGENT-10/10a** (aggregate `meeting list`): aggregate leaf in `cli/surface.ts` unions `meeting.request.meeting.list` and `meeting.session.meeting.list`; test asserts structure and justification.\n- **REQ-CLI-AGENT-11, 12** (op coverage, canonical path): each new Phase 1 op is referenced exactly once in the tree; `surface.test.ts` asserts.\n- **REQ-CLI-AGENT-21** (issue list/read present): routes implemented and tested (`workspace-issue.test.ts` covers 11 cases including 400/404, empty-dir, status filter, body parsing).\n- **REQ-CLI-AGENT-22** (global-scope ops): `system.config.project.list` and `meeting.session.meeting.list` have `context: {}`.\n- **REQ-CLI-AGENT-22a** (three-segment issue ops): operationIds are `workspace.issue.list` / `workspace.issue.read`; hierarchy follows `workspace.issue.create` precedent.\n- **REQ-CLI-AGENT-23** (package-op sentinel): single leaf `packageOpGroup` in `cli/surface.ts` with static help; test asserts exactly one package-op leaf.\n- **REQ-CLI-AGENT-26** (CLI fallback does not list catalog): static help text only, no runtime catalog scan. Daemon-side help surface removal is Phase 3 scope and correctly deferred.\n- **DI / wiring**: `createWorkspaceIssueRoutes` imported at `daemon/app.ts:15` and mounted at `:134-136`. admin and meetings factories wired. No DI-factory gaps.\n- **No `mock.module()`**: grep confirms zero usages in any changed test; all appearances are in docs/retros describing the ban.\n- **Regression surface**: existing route tests remain structurally unchanged; the new tests extend rather than mutate shared fixtures. No evidence of regression risk from this pass alone (full suite result claimed green by Dalton: 3584 pass / 4 skip / 0 fail; not re-run here since this is a read-only review).\n\n---\n\n## Could Not Verify\n\n- **Full test suite green now.** Dalton's result claims it. Warden does not execute tests.\n- **Live-registry coverage.** Deferred to Phase 5 by plan; fixture-based check is the interim.\n"
  - timestamp: 2026-04-21T05:27:42.769Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read plan + spec + commission artifact. Now reviewing source files for the four daemon leaves and cli/surface.ts."
projectName: guild-hall
---

# Review Gate 1: Phases 1 + 2 of CLI Agent-First Surface

Reviewed against `.lore/plans/infrastructure/cli-agent-surface.md` (Phases 1–2) and `.lore/specs/infrastructure/cli-agent-surface.md` (REQ-CLI-AGENT-1, 2, 5–12, 21, 22, 22a, 23). Implementation under review: commit `f8058a1c` (Dalton's commission).

---

## Verdict

Phase 1 and Phase 2 are substantially complete and structurally sound. Surface tree, structural invariants, aggregates, package-op sentinel, compile-time `cliPath` assertion, and route wiring all hold up. Tests are present for all four new daemon ops. One Major finding on metadata completeness; a handful of Minor notes.

---

## Findings

### Major

**M-1. All four new operations omit `requestSchema` and `responseSchema`.**

- `daemon/routes/admin.ts:442-451` — `system.config.project.list`
- `daemon/routes/meetings.ts:582-592` — `meeting.session.meeting.list`
- `daemon/routes/workspace-issue.ts:221-235` — `workspace.issue.list`
- `daemon/routes/workspace-issue.ts:236-250` — `workspace.issue.read`

The plan's Phase 1 metadata rule is explicit: each op declares `operationId, version: "1", name, description, invocation, requestSchema, responseSchema, sideEffects, context, idempotent, hierarchy, parameters`. The plan is also specific for `system.config.project.list`: "Zod request: `z.object({})`. Zod response: typed project record array."

Dalton's result summary hedges with "Zod schemas where appropriate." Verified in source: the schemas are simply absent on every new op.

Context softening the severity: `OperationDefinition` at `lib/types.ts:506,508` declares both fields as optional, and `grep requestSchema:|responseSchema:` across all daemon routes returns zero matches. No existing op populates these — the project-wide practice is to omit them. So the deviation matches existing code, but it violates the explicit Phase 1 acceptance criterion for new ops.

Remediation options (reader's call):
1. Add the schemas to the four new ops now (minimum: `z.object({...})` for each request, a typed response schema for each). This is the literal plan.
2. Amend the plan to match reality (drop the schema fields from Phase 1 metadata) and record the deferral explicitly. This is honest about the wider codebase.

Not a silent-triage "pre-existing" skip — the plan called it out as a new-op requirement, so Phase 1 is not done until it's resolved one way or the other.

---

### Minor

**m-1. OperationID-to-registry linkage is fixture-based, not live.**

`tests/cli/surface.test.ts` defines `KNOWN_OPERATION_IDS` as a hand-maintained string set and asserts every tree-referenced op appears in it. A tree entry pointing to an op that is never registered in the daemon would still pass. The plan explicitly defers the live-registry assertion to Phase 5, so this is a documented gap, not a defect. Flagging it so it doesn't slip during Phase 3–4 changes: any CLI op added in the next phases still needs the fixture update until Phase 5 lands.

**m-2. `meeting.session.meeting.list` and `system.config.project.list` omit the `parameters` field entirely.**

The plan says each op declares `parameters`. Both ops have no parameters, so an empty array would also satisfy the plan; current code omits the field. Existing neighboring ops (e.g., `system.config.application.validate` at `admin.ts:453-463`) also omit `parameters` when empty, so this is consistent with pre-existing practice. Presenting this as a Minor because it is literally off-plan; resolution is probably "update the plan wording to permit omission when empty."

**m-3. `workspace.issue.list`/`read` hierarchy uses verb as `object` segment.**

`hierarchy: { root: "workspace", feature: "issue", object: "list" }` (and `"read"`). This is the three-segment exception described in REQ-CLI-AGENT-22a and matches the precedent of `workspace.issue.create` (`hierarchy.object: "create"`). Spec is satisfied; calling it out because the shape can look wrong at a glance to anyone who didn't read 22a, and a comment on the operation block would save the next reader a trip to the spec.

**m-4. `parseStartedAtFromMeetingId` silently returns `""` on malformed IDs.**

`daemon/routes/meetings.ts:615-622`. The dedicated test (`meetings.test.ts:919-928`) asserts the empty-string behavior, so it's intentional and covered. Flagging only because empty-string-as-failure-signal is easy to mis-handle on the CLI render side. The downstream tree consumer hasn't been written yet, so this is a note for Phase 3, not a defect here.

---

## Confirmed Satisfied

- **REQ-CLI-AGENT-1** (single dispatcher tree): `cli/surface.ts` defines one rooted tree; `cli/surface-utils.ts` walks it.
- **REQ-CLI-AGENT-2** (no `cliPath` on ops): `tests/cli/surface.test.ts:25-27` has a compile-time type assertion. Any reintroduction of `cliPath` to `OperationDefinition` fails typecheck.
- **REQ-CLI-AGENT-5, 6, 7** (no phase labels, no parent repeat, list⇒read): `assertPathRules` in `cli/surface-utils.ts` enforces; `surface.test.ts` asserts. `LIST_WITHOUT_READ_EXEMPT_GROUPS` documents the `worker`/`model` exemptions.
- **REQ-CLI-AGENT-8** (sub-group non-empty): enforced by `assertPathRules` and tested.
- **REQ-CLI-AGENT-10/10a** (aggregate `meeting list`): aggregate leaf in `cli/surface.ts` unions `meeting.request.meeting.list` and `meeting.session.meeting.list`; test asserts structure and justification.
- **REQ-CLI-AGENT-11, 12** (op coverage, canonical path): each new Phase 1 op is referenced exactly once in the tree; `surface.test.ts` asserts.
- **REQ-CLI-AGENT-21** (issue list/read present): routes implemented and tested (`workspace-issue.test.ts` covers 11 cases including 400/404, empty-dir, status filter, body parsing).
- **REQ-CLI-AGENT-22** (global-scope ops): `system.config.project.list` and `meeting.session.meeting.list` have `context: {}`.
- **REQ-CLI-AGENT-22a** (three-segment issue ops): operationIds are `workspace.issue.list` / `workspace.issue.read`; hierarchy follows `workspace.issue.create` precedent.
- **REQ-CLI-AGENT-23** (package-op sentinel): single leaf `packageOpGroup` in `cli/surface.ts` with static help; test asserts exactly one package-op leaf.
- **REQ-CLI-AGENT-26** (CLI fallback does not list catalog): static help text only, no runtime catalog scan. Daemon-side help surface removal is Phase 3 scope and correctly deferred.
- **DI / wiring**: `createWorkspaceIssueRoutes` imported at `daemon/app.ts:15` and mounted at `:134-136`. admin and meetings factories wired. No DI-factory gaps.
- **No `mock.module()`**: grep confirms zero usages in any changed test; all appearances are in docs/retros describing the ban.
- **Regression surface**: existing route tests remain structurally unchanged; the new tests extend rather than mutate shared fixtures. No evidence of regression risk from this pass alone (full suite result claimed green by Dalton: 3584 pass / 4 skip / 0 fail; not re-run here since this is a read-only review).

---

## Could Not Verify

- **Full test suite green now.** Dalton's result claims it. Warden does not execute tests.
- **Live-registry coverage.** Deferred to Phase 5 by plan; fixture-based check is the interim.


## Decisions

**Do all four new daemon operations carry the full metadata the plan requires (requestSchema, responseSchema)?**
No. All four new ops omit requestSchema and responseSchema. Evidence: admin.ts:442-451, meetings.ts:582-592, workspace-issue.ts:221-250. OperationDefinition (lib/types.ts:506,508) declares both as optional, and no existing route populates them — so this matches project-wide practice but violates the Phase 1 plan, which lists both as required fields. Severity: Major.
*Reasoning: Plan: "Operation metadata. Each op declares: operationId, version: '1', name, description, invocation, requestSchema, responseSchema, sideEffects, context, idempotent, hierarchy, parameters." Plan also calls out: "system.config.project.list — Zod request: z.object({}). Zod response: typed project record array." The omission is direct and verifiable against code; tests substitute bespoke expect() shape checks rather than schema validation. Dalton's result hedged with "Zod schemas where appropriate" without flagging the deviation.*

**Is the compile-time cliPath absence assertion present and meaningful (REQ-CLI-AGENT-2)?**
Yes. tests/cli/surface.test.ts:25-27 defines `type _NoCliPath = "cliPath" extends keyof OperationDefinition ? never : true;` which fails typecheck if `cliPath` is ever added. Satisfies REQ-CLI-AGENT-2.
*Reasoning: The assertion is in a test file that is covered by bun's typecheck, so any regression (someone adding `cliPath` to OperationDefinition) surfaces at CI time.*

**Does package-op fallback list the catalog at runtime (REQ-CLI-AGENT-26)?**
No runtime catalog enumeration. The package-op leaf in cli/surface.ts uses PACKAGE_OP_SENTINEL with a static description; there is no catalog scan. REQ-CLI-AGENT-26 satisfied for the CLI side. Note: daemon-side help routes (helpers for agent self-discovery) are still mounted in daemon/app.ts, which is consistent — the plan defers daemon help-surface removal to Phase 3.
*Reasoning: Source inspection of cli/surface.ts shows a static leaf node with no catalog scan. REQ-CLI-AGENT-26 is about the CLI fallback, not daemon help; the latter is out of scope for Phase 1-2.*

**Are the three new route factories wired into createProductionApp?**
Yes. daemon/app.ts imports createWorkspaceIssueRoutes at line 15 and mounts it conditionally at line 134-136. admin and meetings routes were already wired and still appear. No missing wiring.
*Reasoning: DI factory pattern (per CLAUDE.md) requires production wiring; this is the exact failure mode called out in `.lore/retros/coverage-di-factories.md`.*

**Is mock.module() used anywhere in the changed code?**
No. grep across the repo shows mock.module appears only in documentation/retros discussing the ban (CLAUDE.md, typescript-practices.md, plan files). Test files under review (surface.test.ts, workspace-issue.test.ts, admin.test.ts, meetings.test.ts) use dependency injection.
*Reasoning: Project rule bans mock.module in bun tests. Verified by grep.*

**Do cli/surface.ts referenced operationIds resolve to registered daemon operations?**
Spot-check passes. system.config.project.read referenced in projectGroup resolves to daemon/routes/config.ts:124. meeting.request.meeting.list and meeting.session.meeting.list referenced in the aggregate are both registered (meetings.ts:514 and 583). The surface test asserts that every OP the tree references appears in the KNOWN_OPERATION_IDS fixture, but the fixture itself is a static list rather than a live registry read — the plan explicitly defers live-registry validation to Phase 5, so this is a deliberate gap.
*Reasoning: Static fixture means a tree op that is never registered in the daemon could still pass tests. Plan accepts this tradeoff; the gap is documented in the plan ("Phase 5 adds live-registry test").*
