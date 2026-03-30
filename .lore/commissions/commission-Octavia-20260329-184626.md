---
title: "Commission: Plan: Quick-add issues implementation"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for `.lore/specs/ui/quick-add-issues.md`. Write the plan to `.lore/plans/ui/quick-add-issues.md`.\n\nThe spec has 22 requirements (REQ-QAI-1 through REQ-QAI-22) across three surfaces: daemon endpoint, web UI component, and CLI (auto-inherited via operations registry).\n\nFollow the existing plan conventions in `.lore/plans/` (check other plans for format). The plan should:\n\n1. Read the spec thoroughly and understand every requirement.\n2. Read the existing code the spec references to understand current patterns:\n   - `daemon/routes/git-lore.ts` (DI pattern, route structure)\n   - `daemon/routes/artifacts.ts` (write handler, to understand what NOT to extend)\n   - `daemon/app.ts` (AppDeps, createProductionApp wiring)\n   - `web/components/project/CommitLoreButton.tsx` (inline form pattern)\n   - `web/app/projects/[name]/page.tsx` (artifactActions bar)\n   - `daemon/routes/admin.ts` (OperationDefinition shape, descriptions pattern)\n3. Break work into phases with clear deliverables per phase.\n4. Map each REQ to a specific phase.\n5. Include the review/test strategy (which phases get reviewed, what tests cover what).\n6. Call out any spec gaps or ambiguities you discover while reading the code.\n\nSet plan status to `draft`."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/quick-add-issues.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-30T01:46:26.122Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T01:46:26.126Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T01:46:33.097Z
    event: status_failed
    reason: "Session error: Claude Code returned an error result: You've hit your limit · resets 9pm (America/Los_Angeles)"
  - timestamp: 2026-03-30T04:08:50.888Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-30T04:08:50.889Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-30T04:08:50.937Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T04:08:56.239Z
    event: progress_report
    reason: "Starting work: reading spec and all referenced source files."
  - timestamp: 2026-03-30T04:11:46.198Z
    event: progress_report
    reason: "All source files read. Writing the implementation plan now. Identified three spec gaps: missing Next.js proxy route, missing context field in OperationDefinition, and REQ-QAI-22 stdin requires CLI code changes that REQ-QAI-21 claims aren't needed."
  - timestamp: 2026-03-30T04:14:28.304Z
    event: result_submitted
    reason: "Implementation plan written to `.lore/plans/ui/quick-add-issues.md`.\n\nThe plan covers all 22 requirements across 8 phases, with each REQ mapped to a specific phase. Three spec gaps were identified and resolved:\n\n1. **Missing Next.js API proxy** (spec gap): `web/app/api/issues/create/route.ts` added as Phase 3. Client components can't reach the daemon directly; this proxy follows the `git/lore/commit/route.ts` pattern exactly.\n\n2. **`context` field missing from REQ-QAI-10**: All project-scoped operations use `context: { project: true }`. Added to the operation definition in Phase 1.\n\n3. **REQ-QAI-21 vs REQ-QAI-22 contradiction**: REQ-QAI-21 says no CLI code is needed; REQ-QAI-22 requires stdin reading that doesn't exist in the current CLI. Phase 7 adds a targeted stdin-reading addition to `cli/index.ts`. Also flags that the spec's `--title \"...\"` named flag syntax doesn't match the current positional CLI — the working invocation uses positional args.\n\nOne additional gap: empty slug from all-special-character titles (e.g., `\"!@#$%\"`) isn't covered by the spec; the plan adds a 400 response for this case.\n\n**Phase map:**\n- Phase 1: Daemon route (QAI-1, 2, 5, 6, 7, 8, 9, 10, 11)\n- Phase 2: Daemon wiring in app.ts (QAI-3, 4)\n- Phase 3: Next.js proxy (spec gap, architecturally required)\n- Phase 4: NewIssueButton component (QAI-13–20)\n- Phase 5: Page integration (QAI-12)\n- Phase 6: Tests (all AI Validation requirements)\n- Phase 7: CLI stdin support (QAI-21, 22)\n- Phase 8: Full verification + manual smoke tests"
  - timestamp: 2026-03-30T04:14:39.518Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source files read. Writing the implementation plan now. Identified three spec gaps: missing Next.js proxy route, missing context field in OperationDefinition, and REQ-QAI-22 stdin requires CLI code changes that REQ-QAI-21 claims aren't needed."
projectName: guild-hall
---
Implementation plan written to `.lore/plans/ui/quick-add-issues.md`.

The plan covers all 22 requirements across 8 phases, with each REQ mapped to a specific phase. Three spec gaps were identified and resolved:

1. **Missing Next.js API proxy** (spec gap): `web/app/api/issues/create/route.ts` added as Phase 3. Client components can't reach the daemon directly; this proxy follows the `git/lore/commit/route.ts` pattern exactly.

2. **`context` field missing from REQ-QAI-10**: All project-scoped operations use `context: { project: true }`. Added to the operation definition in Phase 1.

3. **REQ-QAI-21 vs REQ-QAI-22 contradiction**: REQ-QAI-21 says no CLI code is needed; REQ-QAI-22 requires stdin reading that doesn't exist in the current CLI. Phase 7 adds a targeted stdin-reading addition to `cli/index.ts`. Also flags that the spec's `--title "..."` named flag syntax doesn't match the current positional CLI — the working invocation uses positional args.

One additional gap: empty slug from all-special-character titles (e.g., `"!@#$%"`) isn't covered by the spec; the plan adds a 400 response for this case.

**Phase map:**
- Phase 1: Daemon route (QAI-1, 2, 5, 6, 7, 8, 9, 10, 11)
- Phase 2: Daemon wiring in app.ts (QAI-3, 4)
- Phase 3: Next.js proxy (spec gap, architecturally required)
- Phase 4: NewIssueButton component (QAI-13–20)
- Phase 5: Page integration (QAI-12)
- Phase 6: Tests (all AI Validation requirements)
- Phase 7: CLI stdin support (QAI-21, 22)
- Phase 8: Full verification + manual smoke tests
