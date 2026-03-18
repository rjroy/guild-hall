---
title: "Commission: Brainstorm: Meeting layer separation"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Expand on Proposal 3 from `.lore/brainstorm/whats-next-2026-03-17.md` — \"Meeting Layer Separation.\"\n\nThe user has open questions about direction and wants exploration, not implementation. Produce a brainstorm artifact that covers:\n\n1. **What worked in the commission separation?** Read the commission layer architecture (`daemon/services/commission/` — all files) and the retros `unified-sdk-runner.md` and `dispatch-hardening.md`. What lessons transfer directly? What doesn't apply because meetings are structurally different?\n2. **Meetings vs. commissions.** Meetings are interactive (human in the loop), commissions are autonomous. How does this affect the layer split? The SDK runner for meetings handles streaming differently. The lifecycle state machine is simpler (no dispatch, no halted state). Map the actual differences.\n3. **What's already extracted?** `meeting/record.ts`, `meeting/registry.ts`, `meeting/transcript.ts`, `meeting/notes-generator.ts` already exist as separate files. What remains in the orchestrator that should come out?\n4. **Risk assessment.** The meeting orchestrator works. What's the blast radius of extraction? Where are the hidden coupling points? What test coverage exists?\n5. **Sequencing.** Should this be done in phases or as a single extraction? The commission separation was phased — was that necessary or just cautious?\n\nRead the meeting orchestrator (`daemon/services/meeting/orchestrator.ts`) and the commission layers to do a real structural comparison. Don't speculate about what's in the files — read them."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/meeting-layer-separation.md

activity_timeline:
  - timestamp: 2026-03-17T21:12:54.093Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T21:12:54.094Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T21:17:10.734Z
    event: status_failed
    reason: "Session error: Claude Code returned an error result: API Error: 500 {\"type\":\"error\",\"error\":{\"type\":\"api_error\",\"message\":\"Internal server error\"},\"request_id\":\"req_011CZ9M6KV3Jdqv4XDutK7XH\"}"
  - timestamp: 2026-03-17T21:21:04.658Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-17T21:21:04.659Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T21:21:04.703Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T21:21:12.199Z
    event: progress_report
    reason: "Starting context gathering: reading the brainstorm proposal, commission layer architecture, meeting orchestrator, and retros."
  - timestamp: 2026-03-17T21:25:22.169Z
    event: progress_report
    reason: "Read all commission layers, meeting files, and retros. Now reading the rest of the meeting orchestrator and checking test coverage before drafting."
  - timestamp: 2026-03-17T21:26:15.096Z
    event: progress_report
    reason: "All source material read. Now drafting the brainstorm artifact with structural comparison, risk assessment, and sequencing recommendations."
  - timestamp: 2026-03-17T21:28:38.505Z
    event: result_submitted
    reason: "Created brainstorm artifact `.lore/brainstorm/meeting-layer-separation.md` exploring Meeting Layer Separation (Proposal 3 from whats-next survey).\n\nKey findings from reading all source files:\n\n1. **Commission lessons that transfer:** Phased migration with per-phase test verification is essential. Duplicate interface definitions drift. RecordOps extraction is the cleanest pattern.\n\n2. **Commission lessons that don't apply:** Meetings lack dispatch queues, dependency tracking, sleeping/halted states, and mail integration. These drove most of the commission layer complexity.\n\n3. **Already extracted:** 1,301 lines across 5 files (record, registry, transcript, notes-generator, toolbox). What remains in the 1,562-line orchestrator is genuinely coordination logic.\n\n4. **Recommendation: Don't mirror the 5-layer commission pattern.** Meetings have 4 states and 3 transitions, not 9 states and 23 transitions. Instead, do targeted extractions: (1) define explicit `MeetingSessionForRoutes` interface, (2) clean up re-exports, (3) optionally extract session loop functions. Do NOT create a `MeetingLifecycle` class.\n\n5. **Risk is low but hidden coupling exists.** The closure-captured state pattern means extracting functions requires threading deps as parameters. 7,107 lines of tests provide solid regression coverage.\n\n6. **Not urgent.** The orchestrator works. Pain-driven extraction (like what motivated the commission separation) hasn't emerged yet for meetings."
  - timestamp: 2026-03-17T21:28:43.307Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source material read. Now drafting the brainstorm artifact with structural comparison, risk assessment, and sequencing recommendations."
projectName: guild-hall
---
Created brainstorm artifact `.lore/brainstorm/meeting-layer-separation.md` exploring Meeting Layer Separation (Proposal 3 from whats-next survey).

Key findings from reading all source files:

1. **Commission lessons that transfer:** Phased migration with per-phase test verification is essential. Duplicate interface definitions drift. RecordOps extraction is the cleanest pattern.

2. **Commission lessons that don't apply:** Meetings lack dispatch queues, dependency tracking, sleeping/halted states, and mail integration. These drove most of the commission layer complexity.

3. **Already extracted:** 1,301 lines across 5 files (record, registry, transcript, notes-generator, toolbox). What remains in the 1,562-line orchestrator is genuinely coordination logic.

4. **Recommendation: Don't mirror the 5-layer commission pattern.** Meetings have 4 states and 3 transitions, not 9 states and 23 transitions. Instead, do targeted extractions: (1) define explicit `MeetingSessionForRoutes` interface, (2) clean up re-exports, (3) optionally extract session loop functions. Do NOT create a `MeetingLifecycle` class.

5. **Risk is low but hidden coupling exists.** The closure-captured state pattern means extracting functions requires threading deps as parameters. 7,107 lines of tests provide solid regression coverage.

6. **Not urgent.** The orchestrator works. Pain-driven extraction (like what motivated the commission separation) hasn't emerged yet for meetings.
