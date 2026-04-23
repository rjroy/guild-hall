---
title: "Commission: Rework cli-agent-surface plan against updated spec"
date: 2026-04-21
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Rework the existing plan at `.lore/plans/infrastructure/cli-agent-surface.md` to match the updated spec at `.lore/specs/infrastructure/cli-agent-surface.md`.\n\nContext:\n- The spec has been revised since the plan was first written. The plan is now out of alignment.\n- Start by reading the current spec in full and the current plan in full, then identify where they diverge.\n- Update the plan to cover every requirement in the current spec. Remove or rewrite anything that no longer applies.\n\nUse the `/lore-development:prep-plan` skill to guide the rework.\n\nRequirements for the reworked plan:\n1. Every REQ ID in the current spec must map to a phase. Call out coverage explicitly.\n2. Phases must have clear boundaries. Foundation phases that fan out need review+fix gates before downstream work.\n3. Identify workers per phase (Dalton for implementation, Thorne for reviews).\n4. Right-size commissions: 2-3 phases per commission max, with explicit dependencies.\n5. If you find spec gaps or ambiguities during the rework, flag them in the plan's open questions section — do not paper over them.\n6. Note what changed from the prior plan version (brief changelog entry at the top or bottom).\n\nOutput to the same file: `.lore/plans/infrastructure/cli-agent-surface.md`. Planning only — do not dispatch implementation work."
dependencies: []
linked_artifacts:
  - .lore/plans/infrastructure/cli-agent-surface.md

activity_timeline:
  - timestamp: 2026-04-21T03:33:33.158Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T03:33:33.160Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-21T03:33:33.209Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-21T03:35:07.338Z
    event: progress_report
    reason: "Read spec (27 reqs including new REQ-26) and current plan. Identified divergences: REQ-CLI-AGENT-26 (daemon /help surface removal) is new and uncovered; plan's G1/G3/G4 are now resolved by spec text; Phase 3 currently preserves daemon /help routes (contradicts REQ-26); Phase 5's consistency check uses live REST catalog (must become in-process); Phase 2 package-op fallback relies on /help/operations (gone). Reworking plan now."
  - timestamp: 2026-04-21T03:40:25.186Z
    event: result_submitted
    reason: "Reworked `.lore/plans/infrastructure/cli-agent-surface.md` against the revised spec.\n\n**What changed from v1:**\n- Added coverage for **REQ-CLI-AGENT-26** (daemon `/help` surface removal). All 27 spec requirements now map to phases.\n- Dropped spec gaps G1 (cliPath existence), G3 (daemon `/help` retention), and G4 (cutover window) — each is resolved directly by the current spec text. Kept G2 (top-level group set), G5 (dead formatter paths), G6 (package-op fallback), G7 (schedule/trigger ops absent). G6 was rescoped because the REST catalog it relied on is now removed by REQ-26.\n- **Phase 3 expanded** from \"CLI-owned help tree\" to \"CLI-owned help tree + daemon help surface removal.\" Deletes `daemon/routes/help.ts` and the `createHelpRoutes` mount in `daemon/app.ts:18,153-154`. CLI stops calling `/help/operations` (`cli/index.ts:33`) and `/:segments/help` entirely.\n- **Phase 4** resolver no longer assumes a REST catalog exists. The package-op fallback uses a `__package_op__` sentinel and resolves the target operation through an in-process registry handle threaded via `main()` DI.\n- **Phase 5** CLI↔catalog consistency check runs in-process against `createProductionApp`'s `OperationsRegistry` (factory DI seam), not via REST. Added explicit 404 guard tests for the removed help routes, and a \"no unreachable operation\" test over the registry.\n- **Package-op fallback** no longer enumerates the catalog in help (the endpoint it used is gone); help is now a static description. Phase 5 covers reachability via an in-process registry walk.\n- Added **changelog** at top of plan.\n- Updated module list to include `daemon/routes/help` and `daemon/app`.\n\n**Open questions flagged in Spec Gaps** (not papered over):\n- G2: top-level group set is plan-proposed; reviewer may prefer a different grouping.\n- G6: package-op fallback is narrower under REQ-26. Reviewer should confirm the runtime-blind fallback is acceptable.\n- G7: schedule/trigger commission ops stay omitted until they exist in the daemon.\n\n**Commission sizing unchanged at 9 commissions (C1-C9), two review gates + final review.** C1 = Dalton foundation, C4 = Dalton help/resolver/daemon-removal, C7 = Dalton validation, C9 = Octavia back-prop. No implementation dispatched."
  - timestamp: 2026-04-21T03:40:29.442Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read spec (27 reqs including new REQ-26) and current plan. Identified divergences: REQ-CLI-AGENT-26 (daemon /help surface removal) is new and uncovered; plan's G1/G3/G4 are now resolved by spec text; Phase 3 currently preserves daemon /help routes (contradicts REQ-26); Phase 5's consistency check uses live REST catalog (must become in-process); Phase 2 package-op fallback relies on /help/operations (gone). Reworking plan now."
projectName: guild-hall
---
Reworked `.lore/plans/infrastructure/cli-agent-surface.md` against the revised spec.

**What changed from v1:**
- Added coverage for **REQ-CLI-AGENT-26** (daemon `/help` surface removal). All 27 spec requirements now map to phases.
- Dropped spec gaps G1 (cliPath existence), G3 (daemon `/help` retention), and G4 (cutover window) — each is resolved directly by the current spec text. Kept G2 (top-level group set), G5 (dead formatter paths), G6 (package-op fallback), G7 (schedule/trigger ops absent). G6 was rescoped because the REST catalog it relied on is now removed by REQ-26.
- **Phase 3 expanded** from "CLI-owned help tree" to "CLI-owned help tree + daemon help surface removal." Deletes `daemon/routes/help.ts` and the `createHelpRoutes` mount in `daemon/app.ts:18,153-154`. CLI stops calling `/help/operations` (`cli/index.ts:33`) and `/:segments/help` entirely.
- **Phase 4** resolver no longer assumes a REST catalog exists. The package-op fallback uses a `__package_op__` sentinel and resolves the target operation through an in-process registry handle threaded via `main()` DI.
- **Phase 5** CLI↔catalog consistency check runs in-process against `createProductionApp`'s `OperationsRegistry` (factory DI seam), not via REST. Added explicit 404 guard tests for the removed help routes, and a "no unreachable operation" test over the registry.
- **Package-op fallback** no longer enumerates the catalog in help (the endpoint it used is gone); help is now a static description. Phase 5 covers reachability via an in-process registry walk.
- Added **changelog** at top of plan.
- Updated module list to include `daemon/routes/help` and `daemon/app`.

**Open questions flagged in Spec Gaps** (not papered over):
- G2: top-level group set is plan-proposed; reviewer may prefer a different grouping.
- G6: package-op fallback is narrower under REQ-26. Reviewer should confirm the runtime-blind fallback is acceptable.
- G7: schedule/trigger commission ops stay omitted until they exist in the daemon.

**Commission sizing unchanged at 9 commissions (C1-C9), two review gates + final review.** C1 = Dalton foundation, C4 = Dalton help/resolver/daemon-removal, C7 = Dalton validation, C9 = Octavia back-prop. No implementation dispatched.
