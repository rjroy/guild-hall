---
title: "Commission: Brainstorm: Meeting layer separation"
date: 2026-03-17
status: failed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Expand on Proposal 3 from `.lore/brainstorm/whats-next-2026-03-17.md` — \"Meeting Layer Separation.\"\n\nThe user has open questions about direction and wants exploration, not implementation. Produce a brainstorm artifact that covers:\n\n1. **What worked in the commission separation?** Read the commission layer architecture (`daemon/services/commission/` — all files) and the retros `unified-sdk-runner.md` and `dispatch-hardening.md`. What lessons transfer directly? What doesn't apply because meetings are structurally different?\n2. **Meetings vs. commissions.** Meetings are interactive (human in the loop), commissions are autonomous. How does this affect the layer split? The SDK runner for meetings handles streaming differently. The lifecycle state machine is simpler (no dispatch, no halted state). Map the actual differences.\n3. **What's already extracted?** `meeting/record.ts`, `meeting/registry.ts`, `meeting/transcript.ts`, `meeting/notes-generator.ts` already exist as separate files. What remains in the orchestrator that should come out?\n4. **Risk assessment.** The meeting orchestrator works. What's the blast radius of extraction? Where are the hidden coupling points? What test coverage exists?\n5. **Sequencing.** Should this be done in phases or as a single extraction? The commission separation was phased — was that necessary or just cautious?\n\nRead the meeting orchestrator (`daemon/services/meeting/orchestrator.ts`) and the commission layers to do a real structural comparison. Don't speculate about what's in the files — read them."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
