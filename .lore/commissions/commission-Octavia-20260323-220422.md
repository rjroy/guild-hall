---
title: "Commission: Plan: Worker attribution in artifact provenance"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the approved spec at `.lore/specs/ui/artifact-provenance-worker-attribution.md`.\n\nThe spec connects worker attribution data (already in artifact frontmatter) to the UI. It spans:\n\n1. **Attribution prop interface** on `ArtifactProvenance` (REQ-AWA-01, REQ-AWA-02)\n2. **Attribution resolution** on the artifact page server component, three-source priority chain from frontmatter extras (REQ-AWA-03, REQ-AWA-04)\n3. **Portrait lookup** via worker list fetch + Guild Master hardcoded fallback (REQ-AWA-05 through REQ-AWA-08)\n4. **Commission linking** from existing `associatedCommissions` data (REQ-AWA-09, REQ-AWA-10)\n5. **Conditional rendering** replacing the \"Source information unavailable\" stub with attributed source row or hidden row (REQ-AWA-11 through REQ-AWA-15)\n6. **CSS adjustments** for attributed text styling and commission links (REQ-AWA-16 through REQ-AWA-18)\n7. **Condensed state** unchanged (REQ-AWA-19)\n\nKey considerations for the plan:\n- The artifact page is a server component that already does three daemon fetches. The spec adds a fourth (worker list). Verify the current fetch pattern.\n- `WorkerPortrait` already accepts the right props. Verify current prop interface.\n- The spec explicitly says no daemon changes. The plan should verify this claim.\n- The resolution logic is testable as a pure function extracted from the page. The spec suggests `tests/web/artifact-attribution-resolution.test.ts`.\n- Check `MANAGER_PORTRAIT_PATH` exists in `lib/packages.ts` as the spec claims.\n- The brainstorm at `.lore/brainstorm/artifact-provenance-worker-attribution.md` has additional context on design decisions.\n\nWrite the plan to `.lore/plans/ui/artifact-provenance-worker-attribution.md`. Follow the project's plan format. Map every REQ to a step, identify file changes, estimate scope, define the delegation table, and call out risks."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T05:04:22.773Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T05:04:22.775Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
