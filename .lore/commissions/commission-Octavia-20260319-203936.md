---
title: "Commission: Specify: Meeting Layer Separation"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for the meeting layer separation based on the approved brainstorm at `.lore/brainstorm/meeting-layer-separation.md`.\n\nThe spec should live at `.lore/specs/infrastructure/meeting-layer-separation.md` with status `draft`.\n\nThe brainstorm is thorough. It recommends three targeted extractions rather than mirroring the commission's five-layer decomposition:\n\n1. Extract an explicit `MeetingSessionForRoutes` interface (zero-risk, type-only)\n2. Clean up re-exports (`QueryOptions` alias, downstream import migration)\n3. Extract `iterateSession` + `startSession` into `meeting/session-loop.ts` (cleanest behavioral boundary)\n\nIt explicitly recommends against a `MeetingLifecycle` class (3 transitions don't justify the ceremony).\n\nBefore writing the spec, read the current orchestrator to verify the brainstorm's analysis is still accurate:\n- `daemon/services/meeting/orchestrator.ts` — line counts, re-exports, closure-captured state\n- `daemon/services/commission/orchestrator.ts` — the `CommissionSessionForRoutes` interface pattern to reference\n\nThe spec should:\n- Define requirements for each of the three phases identified in the brainstorm (Section 5)\n- Include phased implementation sequencing (each phase is a separate commit with full test runs)\n- Address the open questions from the brainstorm where the code provides clear answers\n- Reference the brainstorm's risk assessment (Section 4) for constraints\n- Define success criteria and AI validation approach\n- Use the `req-prefix: MTGL` (meeting layer)\n\nThe brainstorm's recommendation in Section 5 is the scope. Don't expand beyond what it recommends."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T03:39:36.257Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:39:36.258Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
