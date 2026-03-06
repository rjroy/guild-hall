---
title: "Commission: Plan: Artifact Sorting Across Views"
date: 2026-03-06
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The spec \"Artifact Sorting Across Views\" has been completed and approved. Write an implementation plan based on it.\n\n**What to do:**\n\n1. **Read the spec.** Find the artifact sorting spec in `.lore/specs/` (it was just written by a previous commission). Understand every requirement and REQ ID.\n\n2. **Read the implementation surfaces.** The spec identifies which views and code paths need changes. Read those files to understand:\n   - What needs to change in each file\n   - What shared sorting utilities might be needed\n   - What the dependency order is (shared code before view-specific code)\n\n3. **Write a plan** in `.lore/plans/` that covers:\n   - Ordered implementation steps with clear scope per step\n   - Which files each step touches\n   - Which REQ IDs each step satisfies\n   - Test strategy for each step (what to test, how to verify)\n   - Review strategy (which steps are high-risk and need careful review)\n   - Any open questions or decisions that surfaced during planning\n\nFollow the project's existing plan format in `.lore/plans/`. Keep steps sized so each one is independently verifiable."
dependencies: []
linked_artifacts:
  - .lore/plans/artifact-sorting.md

activity_timeline:
  - timestamp: 2026-03-06T21:57:19.536Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T21:57:19.537Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T21:57:19.570Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T21:57:26.840Z
    event: progress_report
    reason: "Starting plan creation. Reading the artifact sorting spec and existing plan format."
  - timestamp: 2026-03-06T21:57:47.888Z
    event: progress_report
    reason: "Read all lib/ modules. Now reading the page components and DependencyMap to understand inline sort logic and current consumption patterns."
  - timestamp: 2026-03-06T21:58:16.946Z
    event: progress_report
    reason: "All implementation surfaces read. Now writing the plan in .lore/plans/."
  - timestamp: 2026-03-06T22:00:07.684Z
    event: progress_report
    reason: "Plan written to .lore/plans/artifact-sorting.md. Running final verification that all REQ IDs are covered."
  - timestamp: 2026-03-06T22:00:42.362Z
    event: result_submitted
    reason: "Implementation plan written to `.lore/plans/artifact-sorting.md`.\n\nThe plan covers all 16 REQ IDs from the spec across 8 steps in 5 phases:\n\n**Phase 1 (Steps 1-2):** Replace the three-bucket status model in `lib/artifacts.ts` with a five-group model matching the real status vocabulary, and add a `compareArtifactsByRecency` function for the dashboard feed.\n\n**Phase 2 (Step 3):** Update `sortTreeLevel()` in `lib/artifact-grouping.ts` to sort leaf nodes by status group then display title, instead of purely alphabetical.\n\n**Phase 3 (Steps 4-5):** Extract inline meeting sorts from `web/app/page.tsx` and `web/app/projects/[name]/page.tsx` into named exports in `lib/meetings.ts`.\n\n**Phase 4 (Step 6):** Remove the duplicate `sortCommissions()` from `DependencyMap.tsx`, import from `lib/commissions.ts`.\n\n**Phase 5 (Steps 7-8):** Verify REQ-SORT-12 (no-op for linked artifacts), run full test suite, and fresh-context code review.\n\nEach step includes file list, REQ IDs satisfied, risk assessment, and test strategy. Delegation guide identifies Steps 1, 3, and 8 as review checkpoints."
  - timestamp: 2026-03-06T22:00:47.209Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Plan written to .lore/plans/artifact-sorting.md. Running final verification that all REQ IDs are covered."
projectName: guild-hall
---
Implementation plan written to `.lore/plans/artifact-sorting.md`.

The plan covers all 16 REQ IDs from the spec across 8 steps in 5 phases:

**Phase 1 (Steps 1-2):** Replace the three-bucket status model in `lib/artifacts.ts` with a five-group model matching the real status vocabulary, and add a `compareArtifactsByRecency` function for the dashboard feed.

**Phase 2 (Step 3):** Update `sortTreeLevel()` in `lib/artifact-grouping.ts` to sort leaf nodes by status group then display title, instead of purely alphabetical.

**Phase 3 (Steps 4-5):** Extract inline meeting sorts from `web/app/page.tsx` and `web/app/projects/[name]/page.tsx` into named exports in `lib/meetings.ts`.

**Phase 4 (Step 6):** Remove the duplicate `sortCommissions()` from `DependencyMap.tsx`, import from `lib/commissions.ts`.

**Phase 5 (Steps 7-8):** Verify REQ-SORT-12 (no-op for linked artifacts), run full test suite, and fresh-context code review.

Each step includes file list, REQ IDs satisfied, risk assessment, and test strategy. Delegation guide identifies Steps 1, 3, and 8 as review checkpoints.
