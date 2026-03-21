---
title: "Commission: Plan: Mail system removal"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for removing the mail system from Guild Hall.\n\n**Context:** The mail system (`daemon/services/mail/`) has never been used by any commission. It adds dead code, a `sleeping` commission status, mail-specific fields in ToolboxResolverContext, capacity management, and event types that pollute the architecture. We're removing it entirely.\n\n**Source brainstorm:** `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 1. Use the deletion checklist there as your starting point.\n\n**This is a removal plan, not a feature spec.** The plan should cover:\n\n1. **Code deletion** — what files, functions, types, config fields, and event types to remove. Be exhaustive. Consult the actual codebase, not just the brainstorm's list.\n2. **Spec and lore updates** — which existing specs reference mail and need updating or archiving. Check `.lore/specs/workers/worker-communication.md` and any other specs that reference mail, send_mail, sleeping status, or mail reader activation.\n3. **CLAUDE.md updates** — strip mail references from the project CLAUDE.md.\n4. **Test deletion** — which test files to delete entirely vs. which need surgical removal of mail-related test cases.\n5. **Phasing** — order the work so each phase leaves the codebase compiling and tests passing. Deletions that break imports need to happen in dependency order.\n6. **Delegation guide** — which phases Dalton implements, which phases Thorne reviews.\n\nDo NOT write a new spec. The existing specs that describe mail are part of what gets cleaned up."
dependencies: []
linked_artifacts:
  - .lore/plans/workers/mail-system-removal.md

activity_timeline:
  - timestamp: 2026-03-21T02:42:14.326Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T02:42:14.329Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T02:42:14.378Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T02:42:21.394Z
    event: progress_report
    reason: "Starting mail system removal plan. Reading brainstorm source and beginning codebase exploration."
  - timestamp: 2026-03-21T02:44:56.843Z
    event: progress_report
    reason: "Codebase exploration complete. Found ~50 files with mail references across daemon, lib, web, tests, and lore. Now reading key source files to verify details before drafting the plan."
  - timestamp: 2026-03-21T02:46:24.042Z
    event: progress_report
    reason: "All codebase exploration complete. Writing the implementation plan now. Found mail touches in ~50 files across daemon services, lib types, web components, tests, worker packages, and lore docs."
  - timestamp: 2026-03-21T02:56:36.247Z
    event: result_submitted
    reason: "Implementation plan written at `.lore/plans/workers/mail-system-removal.md`. Seven phases covering the complete removal of the mail system:\n\n**Phase 1** deletes `daemon/services/mail/` (4 files) and its 3 test files, with atomic edits to the 3 consumer files (commission orchestrator, commission toolbox, context type registry).\n\n**Phase 2** removes `sleeping` from `CommissionStatus` and the lifecycle transition table.\n\n**Phase 3** removes mail fields from shared types (`mailContext`, `maxConcurrentMailReaders`, mail event types), toolbox deps (`mailFilePath`, `commissionId`), SDK runner, config schema, capacity management, and `packages/shared/worker-activation.ts`.\n\n**Phase 4** removes `sleeping` from downstream consumers (commission sorting, manager context/toolbox, scheduler, web filters, base toolbox description).\n\n**Phase 5** updates steward and illuminator posture to remove `send_mail` escalation instructions.\n\n**Phase 6** strips mail references from CLAUDE.md.\n\n**Phase 7** archives 4 mail-specific lore docs and surgically edits ~25 specs/plans that reference mail in passing, plus `.lore/lore-config.md`.\n\nEach phase leaves the build passing. Dalton implements phases 1-5, Thorne reviews. Octavia handles phases 6-7 (documentation).\n\nThe plan was reviewed by a fresh-context plan-reviewer agent that caught 3 gaps (worker-activation.ts, model-selection.md spec, lore-config.md), all incorporated before submission.\n\nNote: the commit is blocked by a pre-existing flaky test (`guild-hall-email/operations.test.ts` timeout under full suite load). The file is staged and ready."
  - timestamp: 2026-03-21T02:56:41.040Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All codebase exploration complete. Writing the implementation plan now. Found mail touches in ~50 files across daemon services, lib types, web components, tests, worker packages, and lore docs."
projectName: guild-hall
---
Implementation plan written at `.lore/plans/workers/mail-system-removal.md`. Seven phases covering the complete removal of the mail system:

**Phase 1** deletes `daemon/services/mail/` (4 files) and its 3 test files, with atomic edits to the 3 consumer files (commission orchestrator, commission toolbox, context type registry).

**Phase 2** removes `sleeping` from `CommissionStatus` and the lifecycle transition table.

**Phase 3** removes mail fields from shared types (`mailContext`, `maxConcurrentMailReaders`, mail event types), toolbox deps (`mailFilePath`, `commissionId`), SDK runner, config schema, capacity management, and `packages/shared/worker-activation.ts`.

**Phase 4** removes `sleeping` from downstream consumers (commission sorting, manager context/toolbox, scheduler, web filters, base toolbox description).

**Phase 5** updates steward and illuminator posture to remove `send_mail` escalation instructions.

**Phase 6** strips mail references from CLAUDE.md.

**Phase 7** archives 4 mail-specific lore docs and surgically edits ~25 specs/plans that reference mail in passing, plus `.lore/lore-config.md`.

Each phase leaves the build passing. Dalton implements phases 1-5, Thorne reviews. Octavia handles phases 6-7 (documentation).

The plan was reviewed by a fresh-context plan-reviewer agent that caught 3 gaps (worker-activation.ts, model-selection.md spec, lore-config.md), all incorporated before submission.

Note: the commit is blocked by a pre-existing flaky test (`guild-hall-email/operations.test.ts` timeout under full suite load). The file is staged and ready.

## Decisions

**Pre-commit hook blocks commit due to flaky email operations test. How to proceed?**
Submit the plan as-is. The artifact is complete at .lore/plans/workers/mail-system-removal.md and staged in git. The commit is blocked by a pre-existing flaky test (guild-hall-email operations timeout) unrelated to the markdown change.
*Reasoning: The change is a single .lore/ markdown file. The failing test is in guild-hall-email operations, a 5-second timeout that's too tight for full-suite concurrent runs. It passes in isolation. This is the same class of known timing sensitivity as dashboard-commissions.test.ts.*
