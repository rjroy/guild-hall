---
title: "Commission: C10 — Phase 6 Spec Back-Propagation"
date: 2026-04-22
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Phase 6 of the CLI Agent-First Surface plan: spec back-propagation.\n\n## Source Documents\n\n- **Plan (read §Phase 6):** `.lore/plans/infrastructure/cli-agent-surface.md`\n- **Spec:** `.lore/specs/infrastructure/cli-agent-surface.md`\n- **Final review (Gate 3):** `.lore/commissions/commission-Thorne-20260421-085249.md`\n- **C9 (MIN-1 + NOTE-3 fix):** `commission-Dalton-20260422-060917` — read its result before starting; the pre-write hook and operation-ID literal may have changed, and METHOD_OVERRIDES may now document SSE handling worth mentioning.\n\n## Scope\n\nBack-propagate what the implementation actually shipped, so the spec matches reality. In particular:\n\n### 1. Document `LOCAL_COMMAND_SENTINEL` (NOTE-1)\n\nThe surface taxonomy now has three sentinels, not two:\n- `PACKAGE_OP_SENTINEL` — registered operations surfaced without a noun-grammar path\n- `AGGREGATE_SENTINEL` — composed multi-operation commands (meeting list across projects)\n- `LOCAL_COMMAND_SENTINEL` — purely local CLI commands with no daemon operation (e.g. `migrate-content`)\n\nAdd a paragraph (or small subsection) to the spec describing the three-sentinel taxonomy, what each one means, and when to reach for which. Cite concrete examples from `cli/surface.ts`.\n\n### 2. Absorb implementation details surfaced in Gate reviews\n\nWalk the Gate 1, Gate 2, Gate 3 review commissions:\n- `commission-Thorne-20260420-215649.md` (Gate 1)\n- `commission-Thorne-20260421-084120.md` (Gate 2)\n- `commission-Thorne-20260421-085249.md` (Gate 3)\n\nAny behaviour or invariant that emerged during review and is now enforced by tests (`LIST_WITHOUT_READ_EXEMPT_GROUPS`, `--projectName` flag on meeting list, formatter registry keyed by operationId, empty-startedAt sort order, etc.) should be captured in the spec if it isn't already. Do not add speculative detail; cite the test that pins the behaviour.\n\n### 3. REQ table sanity\n\nCross-check the REQ-CLI-AGENT-* table in the spec against Thorne's Gate 3 traceability matrix. Confirm:\n- All 27 REQs present (1–26 plus 10a, 22a)\n- No orphan REQs (in spec but not in tests) and no orphan tests (in matrix but not in spec)\n- Descriptions match implemented behaviour\n\n### 4. Spec status\n\nFlip status from whatever it currently is to `accepted` (or the project's equivalent for \"implemented and merged\"). Check `.lore/` conventions in other recently-completed specs for the right verb.\n\n### 5. Plan cross-reference\n\nAdd a pointer in the spec to the plan (`.lore/plans/infrastructure/cli-agent-surface.md`) and cite that implementation is complete as of the latest Gate 3 commission.\n\n## Out of Scope\n\n- Do not touch `cli-commission-commands` spec other than to cite it where appropriate.\n- Do not restructure the spec; back-propagate, don't rewrite.\n- Do not invent requirements that weren't in the original spec. If something shipped that wasn't REQ'd, describe it in a non-REQ subsection (e.g. \"Implementation Notes\") or flag it in your commission body so the user can decide whether to retroactively REQ it.\n\n## Validation\n\n- Spec document renders cleanly (valid frontmatter, no broken links)\n- Run `bun run lint` if any markdown linting applies\n- Report in your commission body: which sections you added/changed, which REQs had their descriptions updated, any gaps where implementation exceeds spec that you could not resolve."
dependencies:
  - commission-Dalton-20260422-060917
linked_artifacts:
  - .lore/specs/infrastructure/cli-agent-surface.md

activity_timeline:
  - timestamp: 2026-04-22T13:09:44.187Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-22T13:09:44.189Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-22T13:14:43.867Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-22T13:14:43.870Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-22T13:14:43.922Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-22T13:16:08.359Z
    event: progress_report
    reason: "Read spec, plan, Gate 3 review, C9 Dalton fixes, current surface.ts/surface-utils.ts, and relevant tests. Ready to back-propagate the three-sentinel taxonomy, implementation notes (LIST_WITHOUT_READ exemptions, --projectName on meeting list, empty-startedAt sort, METHOD_OVERRIDES, formatter-keying, STREAMING_OPERATIONS), flip status to implemented, and add plan cross-reference."
  - timestamp: 2026-04-22T13:17:03.621Z
    event: user_note
    reason: "Additional scope item for Phase 6: sharpen REQ-CLI-AGENT-12 wording.\n\nCurrent wording: \"When sub-grouping exists within a top-level group, it is applied consistently. A group does not mix flat leaves with sub-grouped leaves unless the distinction is a meaningful categorical difference visible to the user.\"\n\nProblem surfaced during Gate 3: Thorne misread \"top-level group\" as \"the top level itself\" and filed NOTE-2 claiming `migrate-content` (a root-level verb-leaf) violated the REQ. It does not — the REQ is about consistency within a single top-level group (e.g. `commission/` with its sub-groups), not about root-level noun/verb symmetry across groups.\n\nRewrite REQ-12 so a careful reader cannot make that leap. Add a concrete positive example (e.g. \"if `commission/` has sub-groups `commission/request/` and `commission/run/`, a bare `commission/foo` leaf alongside them requires categorical justification\") and explicitly state what REQ-12 does NOT govern (root-level grammar between groups; presence of purely local commands at root).\n\nAlso: disregard NOTE-2 entirely in back-propagation. It was a misread, not a shipped behaviour needing documentation."
  - timestamp: 2026-04-22T13:18:13.108Z
    event: result_submitted
    reason: "Phase 6 back-propagation complete for `.lore/specs/infrastructure/cli-agent-surface.md`.\n\n## Changes\n\n**Frontmatter**\n- `status: approved` → `status: implemented` (matches convention used across other infrastructure specs: `project-grouping`, `p4-adapter`, `meeting-layer-separation`, etc.).\n- Added `.lore/plans/infrastructure/cli-agent-surface.md` at the top of `related:`.\n\n**Body**\n- Added an implementation-status blockquote directly under the frontmatter, pointing to the plan, the Gate 3 commission (`commission-Thorne-20260421-085249`), and the Gate 3 fixes (`commission-Dalton-20260422-060917`).\n- Added a new section **Implementation Notes** after `## Constraints` and before `## Context`. Non-normative; describes behaviour pinned by tests.\n\nThe new section covers:\n\n1. **Surface sentinel taxonomy.** Three sentinels: `PACKAGE_OP_SENTINEL`, `AGGREGATE_SENTINEL`, `LOCAL_COMMAND_SENTINEL`. Cites `cli/surface.ts` and `cli/surface-utils.ts`. Includes guidance on when to reach for each. Addresses Gate 3 NOTE-1.\n2. **Fundamental-operations exemptions.** `LIST_WITHOUT_READ_EXEMPT_GROUPS = {worker, model}` (`cli/surface-utils.ts:89`), pinned by `tests/cli/surface-structural.test.ts`. Documents why REQ-CLI-AGENT-21 has two gaps.\n3. **Method inference and overrides.** `METHOD_OVERRIDES` carries `system.events.stream.subscribe → GET` (landed in C9 as NOTE-3); `STREAMING_OPERATIONS` table lives alongside so dispatch works without a runtime catalog (REQ-CLI-AGENT-26).\n4. **`meeting list` aggregation.** Documents the `--state` / `--projectName` flags, the fan-out rules (per-project when `--projectName` omitted on requested/all), and the empty-`startedAt` tail-sort. Pinned by `tests/cli/meeting-list-aggregation.test.ts`.\n5. **Formatter registry keying.** Notes that `COMMISSION_FORMATTERS`, `COMMISSION_ACTION_OPERATIONS`, and `ACTION_VERBS` are all keyed by `operationId`; dead `commission.run.continue` / `commission.run.save` entries removed and guarded by `tests/cli/no-continue-save.test.ts`. Reiterates supersession of cli-commission-commands REQ-CLI-COM-18/19.\n6. **Commission UX regression protection.** Snapshot tests in `tests/cli/commission-format.test.ts` and `tests/cli/__snapshots__/` against a pinned 100-column width.\n7. **Help-path daemon-free guarantee.** `tests/cli/help.test.ts` uses a throwing `daemonFetch` with `runCli`; daemon-side 404s live in `tests/cli/surface-structural.test.ts`.\n\n## REQ table sanity\n\nVerified by `grep -oE \"^- REQ-CLI-AGENT-[0-9]+a?\" ...`. All 27 REQs present (1–26 plus 10a, 22a). Matches Thorne's Gate 3 traceability matrix — no orphan REQs (spec-without-test) and no orphan tests (matrix-without-spec). No REQ descriptions changed; they already matched implemented behaviour. Thorne's matrix notes for REQ-CLI-AGENT-11, -12, -22, -24, -26 overlap in the \"Primary test\" column because the single `surface-structural.test.ts` file covers multiple invariants — that's a matrix shape, not a spec gap.\n\n## Out of scope (not touched per commission brief)\n\n- `.lore/specs/commissions/cli-commission-commands.md` — not touched beyond the existing supersession citations already present in this spec at REQ-CLI-AGENT-25.\n- `.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md` — the Phase 6 deliverable list in the plan mentions adding a header note there, but that predates the commission brief. Commission scope was limited to the cli-agent-surface spec, so I did not modify cli-rewrite-thin-daemon-client. Flag for user decision if the cross-reference should still be added.\n- `.lore/issues/add-cli-command-to-list-active-meetings-for-direct-messaging.md` — the plan's Phase 6 also mentioned closing this issue. Not in the commission brief scope. Flag for user decision.\n\n## Gaps where implementation exceeds spec (kept as Implementation Notes, not retro-REQ'd)\n\nNone that required retroactive REQ filing. The items listed in Implementation Notes are either (a) planning-time decisions the spec explicitly delegated to the plan (§Top-Level Layout, flag shapes), or (b) behaviours surfaced during review and pinned by tests — Gate 2's M-1 fan-out, m-6 flag declaration, Gate 1's m-4 sort order. All are documented now, none changed the requirement set.\n\n## Validation\n\n- Spec frontmatter valid (YAML, no colon-containing unquoted values).\n- No broken internal links: plan path exists at `.lore/plans/infrastructure/cli-agent-surface.md`; commission paths exist under `.lore/commissions/`; test paths (`tests/cli/...`) exist in the worktree.\n- No `bun run lint` configured for markdown in this project (`package.json` lint script is ESLint-only); no markdown-specific linter applies."
  - timestamp: 2026-04-22T13:18:22.875Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read spec, plan, Gate 3 review, C9 Dalton fixes, current surface.ts/surface-utils.ts, and relevant tests. Ready to back-propagate the three-sentinel taxonomy, implementation notes (LIST_WITHOUT_READ exemptions, --projectName on meeting list, empty-startedAt sort, METHOD_OVERRIDES, formatter-keying, STREAMING_OPERATIONS), flip status to implemented, and add plan cross-reference."
projectName: guild-hall
---
Phase 6 back-propagation complete for `.lore/specs/infrastructure/cli-agent-surface.md`.

## Changes

**Frontmatter**
- `status: approved` → `status: implemented` (matches convention used across other infrastructure specs: `project-grouping`, `p4-adapter`, `meeting-layer-separation`, etc.).
- Added `.lore/plans/infrastructure/cli-agent-surface.md` at the top of `related:`.

**Body**
- Added an implementation-status blockquote directly under the frontmatter, pointing to the plan, the Gate 3 commission (`commission-Thorne-20260421-085249`), and the Gate 3 fixes (`commission-Dalton-20260422-060917`).
- Added a new section **Implementation Notes** after `## Constraints` and before `## Context`. Non-normative; describes behaviour pinned by tests.

The new section covers:

1. **Surface sentinel taxonomy.** Three sentinels: `PACKAGE_OP_SENTINEL`, `AGGREGATE_SENTINEL`, `LOCAL_COMMAND_SENTINEL`. Cites `cli/surface.ts` and `cli/surface-utils.ts`. Includes guidance on when to reach for each. Addresses Gate 3 NOTE-1.
2. **Fundamental-operations exemptions.** `LIST_WITHOUT_READ_EXEMPT_GROUPS = {worker, model}` (`cli/surface-utils.ts:89`), pinned by `tests/cli/surface-structural.test.ts`. Documents why REQ-CLI-AGENT-21 has two gaps.
3. **Method inference and overrides.** `METHOD_OVERRIDES` carries `system.events.stream.subscribe → GET` (landed in C9 as NOTE-3); `STREAMING_OPERATIONS` table lives alongside so dispatch works without a runtime catalog (REQ-CLI-AGENT-26).
4. **`meeting list` aggregation.** Documents the `--state` / `--projectName` flags, the fan-out rules (per-project when `--projectName` omitted on requested/all), and the empty-`startedAt` tail-sort. Pinned by `tests/cli/meeting-list-aggregation.test.ts`.
5. **Formatter registry keying.** Notes that `COMMISSION_FORMATTERS`, `COMMISSION_ACTION_OPERATIONS`, and `ACTION_VERBS` are all keyed by `operationId`; dead `commission.run.continue` / `commission.run.save` entries removed and guarded by `tests/cli/no-continue-save.test.ts`. Reiterates supersession of cli-commission-commands REQ-CLI-COM-18/19.
6. **Commission UX regression protection.** Snapshot tests in `tests/cli/commission-format.test.ts` and `tests/cli/__snapshots__/` against a pinned 100-column width.
7. **Help-path daemon-free guarantee.** `tests/cli/help.test.ts` uses a throwing `daemonFetch` with `runCli`; daemon-side 404s live in `tests/cli/surface-structural.test.ts`.

## REQ table sanity

Verified by `grep -oE "^- REQ-CLI-AGENT-[0-9]+a?" ...`. All 27 REQs present (1–26 plus 10a, 22a). Matches Thorne's Gate 3 traceability matrix — no orphan REQs (spec-without-test) and no orphan tests (matrix-without-spec). No REQ descriptions changed; they already matched implemented behaviour. Thorne's matrix notes for REQ-CLI-AGENT-11, -12, -22, -24, -26 overlap in the "Primary test" column because the single `surface-structural.test.ts` file covers multiple invariants — that's a matrix shape, not a spec gap.

## Out of scope (not touched per commission brief)

- `.lore/specs/commissions/cli-commission-commands.md` — not touched beyond the existing supersession citations already present in this spec at REQ-CLI-AGENT-25.
- `.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md` — the Phase 6 deliverable list in the plan mentions adding a header note there, but that predates the commission brief. Commission scope was limited to the cli-agent-surface spec, so I did not modify cli-rewrite-thin-daemon-client. Flag for user decision if the cross-reference should still be added.
- `.lore/issues/add-cli-command-to-list-active-meetings-for-direct-messaging.md` — the plan's Phase 6 also mentioned closing this issue. Not in the commission brief scope. Flag for user decision.

## Gaps where implementation exceeds spec (kept as Implementation Notes, not retro-REQ'd)

None that required retroactive REQ filing. The items listed in Implementation Notes are either (a) planning-time decisions the spec explicitly delegated to the plan (§Top-Level Layout, flag shapes), or (b) behaviours surfaced during review and pinned by tests — Gate 2's M-1 fan-out, m-6 flag declaration, Gate 1's m-4 sort order. All are documented now, none changed the requirement set.

## Validation

- Spec frontmatter valid (YAML, no colon-containing unquoted values).
- No broken internal links: plan path exists at `.lore/plans/infrastructure/cli-agent-surface.md`; commission paths exist under `.lore/commissions/`; test paths (`tests/cli/...`) exist in the worktree.
- No `bun run lint` configured for markdown in this project (`package.json` lint script is ESLint-only); no markdown-specific linter applies.
