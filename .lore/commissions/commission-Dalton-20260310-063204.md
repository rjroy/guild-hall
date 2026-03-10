---
title: "Commission: Implement Status Text Visibility"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Status Text Visibility plan at `.lore/plans/status-text-visibility.md`. Read it thoroughly before starting.\n\nThe plan has three phases:\n- **Phase 1 (Steps 1-4):** Add CSS tokens, `formatStatus()` utility, create `StatusBadge` component and its tests\n- **Phase 2 (Steps 5-9):** Replace bare `GemIndicator` with `StatusBadge` in the five targeted list components (CommissionList, MeetingList, ArtifactList, RecentArtifacts, DependencyMap)\n- **Phase 3 (Steps 10-11):** Update existing component tests and run full suite\n\nFollow the plan's implementation steps, design decisions, and delegation guide. Key constraints:\n- StatusBadge accepts pre-computed `gem` prop, not the raw status string\n- Label color tokens match gem colors (don't hardcode hex in the component)\n- GemIndicator itself stays unchanged\n- `formatStatus()` goes in `lib/types.ts` near `statusToGem()`\n- Phase 1 must be complete and tested before starting Phase 2\n- Run full test suite at the end. All tests must pass.\n\nThe plan has open questions in the \"Open Questions\" section. Resolve them during implementation by reading the actual code."
dependencies:
  - commission-Dalton-20260310-013345
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T13:32:04.093Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T13:32:04.093Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
