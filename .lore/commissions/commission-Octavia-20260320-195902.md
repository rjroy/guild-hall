---
title: "Commission: Spec: Incomplete commission status"
date: 2026-03-21
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for adding an `incomplete` terminal status to the commission lifecycle.\n\n**Source brainstorm:** `.lore/brainstorm/worker-sub-agents-and-mail-removal.md`, Proposal 3. Use it as your starting point but the spec is authoritative.\n\n**Core concept:** When a worker realizes it cannot finish a task (wrong specialization, missing context, blocked by something outside its scope), it can exit honestly via a `submit_incomplete` tool rather than forcing a partial `completed` or wasting turns until `halted`. The annotation surfaces to the Guild Master for triage.\n\n**Key design points from the brainstorm:**\n- New `\"incomplete\"` terminal status, transition from `in_progress`\n- `submit_incomplete` tool in the commission toolbox with: `summary` (what was accomplished), `reason` (why the worker stopped), `annotation` (what should happen next)\n- Partial work is merged (like `save` on halted commissions)\n- Commission dependencies do NOT fire (the chain is intentionally broken)\n- Annotation recorded in the commission artifact\n- Incomplete commissions surface in the Guild Master's briefing context\n\n**Additional context to consider:**\n- The event router just shipped. An `incomplete` status should emit a `commission_incomplete` event. Design the event payload with the triggered commissions brainstorm in mind (`.lore/brainstorm/triggered-commissions.md`) since `incomplete` is a natural trigger source.\n- The halted commission state (#117) is the closest precedent. Review how `halted` was implemented for patterns to follow.\n- The outcomes-to-memory system (just shipped) should handle `incomplete` commissions. Consider what the triage session should extract from an incomplete result.\n\n**If anything needs a design pass before planning** (e.g., how the Guild Master triage loop works, how this interacts with triggered commissions), flag it explicitly in the spec rather than leaving it ambiguous. Name the gap and what needs to be resolved."
dependencies: []
linked_artifacts:
  - .lore/specs/commissions/commission-incomplete-status.md

activity_timeline:
  - timestamp: 2026-03-21T02:59:02.503Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T02:59:02.504Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-21T02:59:02.554Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-21T02:59:10.148Z
    event: progress_report
    reason: "Starting context gathering: reading source brainstorm, halted commission precedent, triggered commissions brainstorm, event router spec, and outcomes-to-memory spec."
  - timestamp: 2026-03-21T03:01:02.621Z
    event: progress_report
    reason: "Context gathering complete. Read: source brainstorm (Proposal 3), commission spec (lifecycle, toolbox, dependencies), halted commission spec (precedent for state preservation), event bus types, lifecycle state machine, orchestrator (dependency checking, save flow), triggered commissions brainstorm, and outcomes-to-memory spec. Now drafting the spec."
  - timestamp: 2026-03-21T03:04:21.024Z
    event: progress_report
    reason: "Fresh-eyes review complete. Three findings to address: (1) outcomes-to-memory contradiction with REQ-OTMEM-2, (2) crash recovery gap, (3) merge-conflict status ambiguity. Incorporating fixes now."
  - timestamp: 2026-03-21T03:05:55.089Z
    event: result_submitted
    reason: "Wrote the requirements spec for adding `incomplete` terminal status to the commission lifecycle.\n\n**Artifact:** `.lore/specs/commissions/commission-incomplete-status.md`\n\n**23 requirements (REQ-CINC-1 through REQ-CINC-23)** covering:\n- **Lifecycle**: New `incomplete` terminal status, `in_progress -> incomplete` transition, no outgoing transitions, does not satisfy dependencies\n- **Toolbox**: `submit_incomplete` tool with summary, reason, and annotation parameters; mutually exclusive with `submit_result` and `send_mail`\n- **Orchestrator**: Squash-merges partial work (like save on halted), persists decisions, does not fire dependency checks; handles session-end-after-incomplete and error-after-incomplete\n- **Crash recovery**: Accepted behavior that daemon crash mid-incomplete results in `failed` status, but `## Incomplete` section in artifact body preserves the worker's reason and annotation\n- **Event bus**: New `commission_incomplete` event with full payload (commissionId, summary, reason, annotation); also emits standard `commission_status` event\n- **Outcomes-to-memory**: Amends REQ-OTMEM-2 to subscribe to `commission_incomplete` (justified: unlike failed/halted, the worker produced deliberate analysis)\n- **Briefing**: Surfaces incomplete commissions with annotation visible to Guild Master\n- **UI**: Distinct terminal status display with annotation visible\n- **Event router**: Available for notification rules and designed as future trigger source for triggered commissions\n\n**Fresh-eyes review** by spec-reviewer agent identified three critical/important gaps, all resolved:\n1. Outcomes-to-memory contradiction (REQ-OTMEM-2 amendment clause added with justification)\n2. Crash recovery gap (REQ-CINC-23 added, accepted behavior documented)\n3. Merge-conflict status ambiguity (REQ-CINC-10 step 5 clarified: transitions to `failed`, matching saveCommission pattern)"
  - timestamp: 2026-03-21T03:05:58.322Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Fresh-eyes review complete. Three findings to address: (1) outcomes-to-memory contradiction with REQ-OTMEM-2, (2) crash recovery gap, (3) merge-conflict status ambiguity. Incorporating fixes now."
projectName: guild-hall
---
Wrote the requirements spec for adding `incomplete` terminal status to the commission lifecycle.

**Artifact:** `.lore/specs/commissions/commission-incomplete-status.md`

**23 requirements (REQ-CINC-1 through REQ-CINC-23)** covering:
- **Lifecycle**: New `incomplete` terminal status, `in_progress -> incomplete` transition, no outgoing transitions, does not satisfy dependencies
- **Toolbox**: `submit_incomplete` tool with summary, reason, and annotation parameters; mutually exclusive with `submit_result` and `send_mail`
- **Orchestrator**: Squash-merges partial work (like save on halted), persists decisions, does not fire dependency checks; handles session-end-after-incomplete and error-after-incomplete
- **Crash recovery**: Accepted behavior that daemon crash mid-incomplete results in `failed` status, but `## Incomplete` section in artifact body preserves the worker's reason and annotation
- **Event bus**: New `commission_incomplete` event with full payload (commissionId, summary, reason, annotation); also emits standard `commission_status` event
- **Outcomes-to-memory**: Amends REQ-OTMEM-2 to subscribe to `commission_incomplete` (justified: unlike failed/halted, the worker produced deliberate analysis)
- **Briefing**: Surfaces incomplete commissions with annotation visible to Guild Master
- **UI**: Distinct terminal status display with annotation visible
- **Event router**: Available for notification rules and designed as future trigger source for triggered commissions

**Fresh-eyes review** by spec-reviewer agent identified three critical/important gaps, all resolved:
1. Outcomes-to-memory contradiction (REQ-OTMEM-2 amendment clause added with justification)
2. Crash recovery gap (REQ-CINC-23 added, accepted behavior documented)
3. Merge-conflict status ambiguity (REQ-CINC-10 step 5 clarified: transitions to `failed`, matching saveCommission pattern)
