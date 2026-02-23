---
title: Validate implementation against Phase 6 spec requirements
date: 2026-02-23
status: pending
tags: [task]
source: .lore/plans/phase-6-guild-master.md
related: [.lore/specs/guild-hall-system.md, .lore/specs/guild-hall-workers.md, .lore/specs/guild-hall-views.md]
sequence: 12
modules: [guild-hall-core, guild-hall-ui]
---

# Task: Validate Implementation Against Phase 6 Spec Requirements

## What

Launch a fresh-context sub-agent that reads the Phase 6 scope from `.lore/plans/implementation-phases.md`, all five specs, and reviews the implementation against every Phase 6 requirement. The agent flags any requirement not met.

**Checklist (the agent verifies each):**

- REQ-SYS-14: Dependency graph derivable from commission artifact references, rendered as SVG DAG
- REQ-SYS-16: Manager knows workers, capabilities, commission graph (via context injection)
- REQ-SYS-17: Manager can initiate meetings (via initiate_meeting tool)
- REQ-SYS-18: Manager capabilities match Workers spec
- REQ-WKR-24: Manager ships with Guild Hall (built into daemon), coordination posture
- REQ-WKR-25: Manager toolbox has all five capabilities (commission, dispatch, PR, meeting, notes)
- REQ-WKR-26: Manager toolbox is exclusive (other workers can't access)
- REQ-WKR-27: Dispatch-with-review model (create + dispatch in one call, user can cancel)
- REQ-WKR-28: Deference rules encoded in posture
- REQ-VIEW-12.2: Manager's Briefing populated on Dashboard (on-demand + cache)
- REQ-VIEW-12.3: Commission Dependency Map shows DAG
- REQ-VIEW-13: Quick Comment action works (decline + create commission)
- REQ-VIEW-14: Dependency map renders connected nodes with status colors
- REQ-VIEW-18: Project view compact dependency graph, project-scoped
- REQ-VIEW-22: Commission neighborhood graph on commission view
- REQ-VIEW-24: Three-tab comment thread (Worker/User/Manager Notes)
- REQ-VIEW-25: Activity timeline renders manager_note events with distinct styling

**Cross-cutting checks:**

- Production wiring: `createProductionApp()` includes manager package, briefing generator, all new dependencies
- All new DI factories have both unit tests and production wiring
- All git operations use `cleanGitEnv()`
- `commission_manager_note` SSE event emits correctly and triggers live timeline update
- CLAUDE.md updated to reflect Phase 6 state

**Update CLAUDE.md** with Phase 6 additions: manager worker, manager toolbox, briefing generator, dependency graph, quick comment, PR creation, manager notes.

## Validation

- Sub-agent produces a checklist with pass/fail for each requirement
- All requirements pass
- Any failures have clear descriptions of what's missing
- CLAUDE.md updated and accurate
- All tests pass, linting clean, final commit created (triggers pre-commit hook validation)

## Why

From `.lore/plans/phase-6-guild-master.md`, Step 10: "Launch a fresh-context sub-agent that reads the Phase 6 scope... and reviews the implementation."

Retro lesson (worker-dispatch.md): "Spec validation catches requirement compliance but misses integration gaps." This validation step plus the production wiring checks in earlier tasks address both compliance and assembly.

## Files

- `CLAUDE.md` (modify)
