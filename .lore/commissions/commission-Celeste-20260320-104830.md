---
title: "Commission: Visionary brainstorm: what's missing from Guild Hall?"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Celeste
workerDisplayTitle: "Guild Visionary"
prompt: "## Visionary Task: What's Missing?\n\nRead the full system state — `.lore/vision.md`, the specs, the issues, the brainstorms, the retros, the recent commission history. Understand what Guild Hall is today and where it's headed.\n\nThen answer: **what features are missing?**\n\nNot bug fixes. Not polish. What capabilities does the system lack that would make it meaningfully more useful? Think about:\n\n- Gaps in the workflow that force the user to do manual work the system could handle\n- Information that exists but isn't surfaced where it's needed\n- Patterns the user repeats across sessions that could be automated or assisted\n- Capabilities that other multi-agent or AI orchestration systems have that we don't\n- Things that would change how the user thinks about delegating work\n- Quality-of-life improvements that compound over time\n\nGround your ideas in evidence from the codebase and lore. Reference what exists, what's been discussed, and what the gap actually is. Avoid rehashing things already tracked in `.lore/issues/` or `.lore/brainstorm/` unless you have a genuinely new angle on them.\n\nWrite your brainstorm to `.lore/brainstorm/whats-missing-2026-03-20.md`."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/whats-missing-2026-03-20.md

activity_timeline:
  - timestamp: 2026-03-20T17:48:30.279Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T17:48:30.281Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T17:48:30.325Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T17:48:38.457Z
    event: progress_report
    reason: "Starting full system state scan: vision, specs, issues, brainstorms, retros, recent commissions."
  - timestamp: 2026-03-20T17:48:56.015Z
    event: progress_report
    reason: "Read vision (approved), 12 existing brainstorms, 5 issues, key retros. Now scanning recent commissions, specs, and codebase areas for gaps."
  - timestamp: 2026-03-20T17:51:38.662Z
    event: progress_report
    reason: "Deep exploration complete. Found rich evidence in lifecycle gaps, context injection, and missing capabilities. Now drafting proposals."
  - timestamp: 2026-03-20T17:52:08.848Z
    event: progress_report
    reason: "Full context gathered. Writing brainstorm artifact with 6 proposals grounded in codebase evidence."
  - timestamp: 2026-03-20T17:54:51.823Z
    event: result_submitted
    reason: "Wrote brainstorm to `.lore/brainstorm/whats-missing-2026-03-20.md` with 6 proposals grounded in codebase evidence:\n\n1. **Decisions Surface** (Small) - Decisions recorded by `record_decision` are invisible: no API endpoint, no web UI display, and they're deleted when commission state is cleaned up. Persist to artifact, add routes, show in UI.\n\n2. **Commission History Search** (Medium) - No way to query commissions by worker, status, or date range across a project. The user dispatches 20+ commissions per session and tracks outcomes manually.\n\n3. **Worker Performance Feedback Loop** (Small) - Turns used, model, and duration aren't persisted to commission artifacts. All completed commissions look identical in metadata despite vastly different resource consumption.\n\n4. **Commission Templates** (Medium) - Recurring commission types (spec, review, implement, cleanup) follow structural patterns that the user re-types each time. Templates encode prompt engineering as reusable infrastructure.\n\n5. **Cross-Commission Artifact Graph** (Medium) - `linked_artifacts` exists in commission frontmatter but has no reverse lookup. Given an artifact, there's no way to see which commissions produced or consumed it, breaking the spec-to-plan-to-implement provenance chain.\n\n6. **Standing Delegation** (Large) - The vision names \"autonomous initiative\" as a growth surface but no mechanism implements it. Event-triggered commission dispatch would automate the implement-review-fix cycle and other reactive patterns. Depends on event router (approved, awaiting implementation).\n\nAlso filed observations on: decisions disappearing on state cleanup, commission transcripts not persisting, halted commission UI gap, and memory budget invisibility."
  - timestamp: 2026-03-20T17:54:59.243Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Full context gathered. Writing brainstorm artifact with 6 proposals grounded in codebase evidence."
projectName: guild-hall
---
Wrote brainstorm to `.lore/brainstorm/whats-missing-2026-03-20.md` with 6 proposals grounded in codebase evidence:

1. **Decisions Surface** (Small) - Decisions recorded by `record_decision` are invisible: no API endpoint, no web UI display, and they're deleted when commission state is cleaned up. Persist to artifact, add routes, show in UI.

2. **Commission History Search** (Medium) - No way to query commissions by worker, status, or date range across a project. The user dispatches 20+ commissions per session and tracks outcomes manually.

3. **Worker Performance Feedback Loop** (Small) - Turns used, model, and duration aren't persisted to commission artifacts. All completed commissions look identical in metadata despite vastly different resource consumption.

4. **Commission Templates** (Medium) - Recurring commission types (spec, review, implement, cleanup) follow structural patterns that the user re-types each time. Templates encode prompt engineering as reusable infrastructure.

5. **Cross-Commission Artifact Graph** (Medium) - `linked_artifacts` exists in commission frontmatter but has no reverse lookup. Given an artifact, there's no way to see which commissions produced or consumed it, breaking the spec-to-plan-to-implement provenance chain.

6. **Standing Delegation** (Large) - The vision names "autonomous initiative" as a growth surface but no mechanism implements it. Event-triggered commission dispatch would automate the implement-review-fix cycle and other reactive patterns. Depends on event router (approved, awaiting implementation).

Also filed observations on: decisions disappearing on state cleanup, commission transcripts not persisting, halted commission UI gap, and memory budget invisibility.
