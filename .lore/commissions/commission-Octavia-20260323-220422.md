---
title: "Commission: Plan: Worker attribution in artifact provenance"
date: 2026-03-24
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the approved spec at `.lore/specs/ui/artifact-provenance-worker-attribution.md`.\n\nThe spec connects worker attribution data (already in artifact frontmatter) to the UI. It spans:\n\n1. **Attribution prop interface** on `ArtifactProvenance` (REQ-AWA-01, REQ-AWA-02)\n2. **Attribution resolution** on the artifact page server component, three-source priority chain from frontmatter extras (REQ-AWA-03, REQ-AWA-04)\n3. **Portrait lookup** via worker list fetch + Guild Master hardcoded fallback (REQ-AWA-05 through REQ-AWA-08)\n4. **Commission linking** from existing `associatedCommissions` data (REQ-AWA-09, REQ-AWA-10)\n5. **Conditional rendering** replacing the \"Source information unavailable\" stub with attributed source row or hidden row (REQ-AWA-11 through REQ-AWA-15)\n6. **CSS adjustments** for attributed text styling and commission links (REQ-AWA-16 through REQ-AWA-18)\n7. **Condensed state** unchanged (REQ-AWA-19)\n\nKey considerations for the plan:\n- The artifact page is a server component that already does three daemon fetches. The spec adds a fourth (worker list). Verify the current fetch pattern.\n- `WorkerPortrait` already accepts the right props. Verify current prop interface.\n- The spec explicitly says no daemon changes. The plan should verify this claim.\n- The resolution logic is testable as a pure function extracted from the page. The spec suggests `tests/web/artifact-attribution-resolution.test.ts`.\n- Check `MANAGER_PORTRAIT_PATH` exists in `lib/packages.ts` as the spec claims.\n- The brainstorm at `.lore/brainstorm/artifact-provenance-worker-attribution.md` has additional context on design decisions.\n\nWrite the plan to `.lore/plans/ui/artifact-provenance-worker-attribution.md`. Follow the project's plan format. Map every REQ to a step, identify file changes, estimate scope, define the delegation table, and call out risks."
dependencies: []
linked_artifacts:
  - .lore/plans/ui/artifact-provenance-worker-attribution.md

activity_timeline:
  - timestamp: 2026-03-24T05:04:22.773Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:04:22.775Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-24T05:04:22.821Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-24T05:04:31.105Z
    event: progress_report
    reason: "Starting plan preparation. Reading spec, brainstorm, and verifying source code claims."
  - timestamp: 2026-03-24T05:05:13.514Z
    event: progress_report
    reason: "All source code verified. Spec claims confirmed: three daemon fetches on artifact page, WorkerPortrait has correct props, MANAGER_PORTRAIT_PATH and MANAGER_WORKER_NAME exist in lib/packages.ts, worker list route returns displayName and portraitUrl. No daemon changes needed. Drafting plan now."
  - timestamp: 2026-03-24T05:09:56.894Z
    event: result_submitted
    reason: "Plan written to `.lore/plans/ui/artifact-provenance-worker-attribution.md`. All 19 REQs mapped to 7 implementation steps across 6 files (2 new, 4 modified). Key decisions verified against source:\n\n- Artifact page's three existing daemon fetches confirmed; fourth fetch (worker list) follows the same pattern\n- WorkerPortrait props verified: `name`, `title`, `portraitUrl`, `size` all optional\n- `MANAGER_PORTRAIT_PATH` and `MANAGER_WORKER_NAME` confirmed in `lib/packages.ts`\n- Worker list route returns `displayName` and `portraitUrl` as expected\n- No daemon changes needed (verified)\n\nPlan structure: (1) Add Attribution interface, (2) Extract pure resolution function to `web/lib/resolve-attribution.ts`, (3) Wire on artifact page with worker list fetch, (4) Update component rendering, (5) CSS adjustments, (6) 13 resolution tests + expanded provenance tests, (7) Review validation.\n\nFresh-eyes review completed and three findings addressed: removed `.text` class contradiction in Step 5a, added test case 13 for fetch-failure graceful degradation (REQ-AWA-08), and clarified why both `name` and `title` are omitted from WorkerPortrait in Step 4."
  - timestamp: 2026-03-24T05:10:07.002Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source code verified. Spec claims confirmed: three daemon fetches on artifact page, WorkerPortrait has correct props, MANAGER_PORTRAIT_PATH and MANAGER_WORKER_NAME exist in lib/packages.ts, worker list route returns displayName and portraitUrl. No daemon changes needed. Drafting plan now."
projectName: guild-hall
---
Plan written to `.lore/plans/ui/artifact-provenance-worker-attribution.md`. All 19 REQs mapped to 7 implementation steps across 6 files (2 new, 4 modified). Key decisions verified against source:

- Artifact page's three existing daemon fetches confirmed; fourth fetch (worker list) follows the same pattern
- WorkerPortrait props verified: `name`, `title`, `portraitUrl`, `size` all optional
- `MANAGER_PORTRAIT_PATH` and `MANAGER_WORKER_NAME` confirmed in `lib/packages.ts`
- Worker list route returns `displayName` and `portraitUrl` as expected
- No daemon changes needed (verified)

Plan structure: (1) Add Attribution interface, (2) Extract pure resolution function to `web/lib/resolve-attribution.ts`, (3) Wire on artifact page with worker list fetch, (4) Update component rendering, (5) CSS adjustments, (6) 13 resolution tests + expanded provenance tests, (7) Review validation.

Fresh-eyes review completed and three findings addressed: removed `.text` class contradiction in Step 5a, added test case 13 for fetch-failure graceful degradation (REQ-AWA-08), and clarified why both `name` and `title` are omitted from WorkerPortrait in Step 4.
