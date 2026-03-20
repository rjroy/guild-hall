---
title: "Commission: Specify: Meeting Layer Separation"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for the meeting layer separation based on the approved brainstorm at `.lore/brainstorm/meeting-layer-separation.md`.\n\nThe spec should live at `.lore/specs/infrastructure/meeting-layer-separation.md` with status `draft`.\n\nThe brainstorm is thorough. It recommends three targeted extractions rather than mirroring the commission's five-layer decomposition:\n\n1. Extract an explicit `MeetingSessionForRoutes` interface (zero-risk, type-only)\n2. Clean up re-exports (`QueryOptions` alias, downstream import migration)\n3. Extract `iterateSession` + `startSession` into `meeting/session-loop.ts` (cleanest behavioral boundary)\n\nIt explicitly recommends against a `MeetingLifecycle` class (3 transitions don't justify the ceremony).\n\nBefore writing the spec, read the current orchestrator to verify the brainstorm's analysis is still accurate:\n- `daemon/services/meeting/orchestrator.ts` — line counts, re-exports, closure-captured state\n- `daemon/services/commission/orchestrator.ts` — the `CommissionSessionForRoutes` interface pattern to reference\n\nThe spec should:\n- Define requirements for each of the three phases identified in the brainstorm (Section 5)\n- Include phased implementation sequencing (each phase is a separate commit with full test runs)\n- Address the open questions from the brainstorm where the code provides clear answers\n- Reference the brainstorm's risk assessment (Section 4) for constraints\n- Define success criteria and AI validation approach\n- Use the `req-prefix: MTGL` (meeting layer)\n\nThe brainstorm's recommendation in Section 5 is the scope. Don't expand beyond what it recommends."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/meeting-layer-separation.md

activity_timeline:
  - timestamp: 2026-03-20T03:39:36.257Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T03:39:36.258Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T03:39:36.304Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T03:40:22.595Z
    event: progress_report
    reason: "Read brainstorm and verified current state of meeting orchestrator (1,552 lines, confirmed re-exports, no MeetingSessionForRoutes interface, 3 QueryOptions consumers). Reading commission orchestrator for CommissionSessionForRoutes pattern. Now drafting the spec."
  - timestamp: 2026-03-20T03:42:37.308Z
    event: result_submitted
    reason: "Wrote the meeting layer separation spec at `.lore/specs/infrastructure/meeting-layer-separation.md` with status `draft`.\n\nVerified the brainstorm's analysis against current code:\n- Orchestrator is 1,552 lines (brainstorm said 1,562, minor drift from recent changes)\n- `MeetingSessionForRoutes` already exists in `daemon/routes/meetings.ts` but is incomplete (missing `createMeetingRequest` and `getOpenMeetingsForProject`). Phase 1 relocates it to the orchestrator and makes it complete.\n- `QueryOptions` re-export has 3 consumers (notes-generator, briefing-generator, test). Phase 2 migrates them.\n- `ActiveMeetingEntry` re-export has zero consumers. Phase 2 removes it.\n- `iterateSession` + `startSession` total ~116 lines with a clean boundary. Phase 3 extracts them.\n- `buildMeetingPrepSpec` stays in the orchestrator because `sendMessage` also calls it.\n\nThe spec defines 16 requirements (MTGL-1 through MTGL-16), 6 constraints, 6 success criteria, and resolves all four open questions from the brainstorm with code evidence."
  - timestamp: 2026-03-20T03:42:41.059Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Read brainstorm and verified current state of meeting orchestrator (1,552 lines, confirmed re-exports, no MeetingSessionForRoutes interface, 3 QueryOptions consumers). Reading commission orchestrator for CommissionSessionForRoutes pattern. Now drafting the spec."
projectName: guild-hall
---
Wrote the meeting layer separation spec at `.lore/specs/infrastructure/meeting-layer-separation.md` with status `draft`.

Verified the brainstorm's analysis against current code:
- Orchestrator is 1,552 lines (brainstorm said 1,562, minor drift from recent changes)
- `MeetingSessionForRoutes` already exists in `daemon/routes/meetings.ts` but is incomplete (missing `createMeetingRequest` and `getOpenMeetingsForProject`). Phase 1 relocates it to the orchestrator and makes it complete.
- `QueryOptions` re-export has 3 consumers (notes-generator, briefing-generator, test). Phase 2 migrates them.
- `ActiveMeetingEntry` re-export has zero consumers. Phase 2 removes it.
- `iterateSession` + `startSession` total ~116 lines with a clean boundary. Phase 3 extracts them.
- `buildMeetingPrepSpec` stays in the orchestrator because `sendMessage` also calls it.

The spec defines 16 requirements (MTGL-1 through MTGL-16), 6 constraints, 6 success criteria, and resolves all four open questions from the brainstorm with code evidence.
