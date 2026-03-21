---
title: "Commission: Spec: Incomplete commission status"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for adding an `incomplete` terminal status to the commission lifecycle.\n\n**Source brainstorm:** `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 3. Use it as your starting point but the spec is authoritative.\n\n**Core concept:** When a worker realizes it cannot finish a task (wrong specialization, missing context, blocked by something outside its scope), it can exit honestly via a `submit_incomplete` tool rather than forcing a partial `completed` or wasting turns until `halted`. The annotation surfaces to the Guild Master for triage.\n\n**Key design points from the brainstorm:**\n- New `\"incomplete\"` terminal status, transition from `in_progress`\n- `submit_incomplete` tool in the commission toolbox with: `summary` (what was accomplished), `reason` (why the worker stopped), `annotation` (what should happen next)\n- Partial work is merged (like `save` on halted commissions)\n- Commission dependencies do NOT fire (the chain is intentionally broken)\n- Annotation recorded in the commission artifact\n- Incomplete commissions surface in the Guild Master's briefing context\n\n**Additional context to consider:**\n- The event router just shipped. An `incomplete` status should emit a `commission_incomplete` event. Design the event payload with the triggered commissions brainstorm in mind (`.lore/brainstorm/triggered-commissions.md`) since `incomplete` is a natural trigger source.\n- The halted commission state (#117) is the closest precedent. Review how `halted` was implemented for patterns to follow.\n- The outcomes-to-memory system (just shipped) should handle `incomplete` commissions. Consider what the triage session should extract from an incomplete result.\n\n**If anything needs a design pass before planning** (e.g., how the Guild Master triage loop works, how this interacts with triggered commissions), flag it explicitly in the spec rather than leaving it ambiguous. Name the gap and what needs to be resolved."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T02:59:02.503Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T02:59:02.504Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
