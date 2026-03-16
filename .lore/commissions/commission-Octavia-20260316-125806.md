---
title: "Commission: Brainstorm: commission maxTurns recovery options"
date: 2026-03-16
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nBrainstorm solutions for the commission maxTurns recovery problem. The issue is documented at `.lore/issues/commission-maxturns-no-recovery.md` — read it first.\n\n## What to produce\n\nUse `/lore-development:brainstorm` to explore the solution space. The issue doc already lays out the dimensions (preserving work, recovery/resumption, diagnosis, lifecycle states, behavioral nuance). Your job is to think through those dimensions and produce a brainstorm artifact at `.lore/brainstorm/commission-maxturns-recovery.md`.\n\n## Guidance\n\n- Read the related code referenced in the issue to understand the current behavior before brainstorming.\n- Consider the existing commission lifecycle state machine. Any solution needs to fit within or cleanly extend it.\n- Think about what's achievable incrementally. A perfect solution that requires rewriting the commission system is less useful than a pragmatic one that handles the 80% case.\n- Consider the user's perspective: they dispatched work, it hit a wall, and they want to know what happened and what they can do about it. The UX matters as much as the mechanism.\n- Don't write code or specs. This is exploration, not implementation.\n"
dependencies: []
linked_artifacts:
  - .lore/brainstorm/commission-maxturns-recovery.md

activity_timeline:
  - timestamp: 2026-03-16T19:58:06.311Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-16T19:58:06.312Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-16T19:58:06.350Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-16T19:58:20.125Z
    event: progress_report
    reason: "Reading the issue document and gathering context on the commission maxTurns recovery problem before brainstorming."
  - timestamp: 2026-03-16T20:00:26.654Z
    event: progress_report
    reason: "Finished reading all related code (sdk-runner, orchestrator, lifecycle, diagrams). Now writing the brainstorm artifact at .lore/brainstorm/commission-maxturns-recovery.md."
  - timestamp: 2026-03-16T20:04:04.773Z
    event: result_submitted
    reason: "Produced brainstorm artifact at `.lore/brainstorm/commission-maxturns-recovery.md` exploring 10 solution ideas across all five dimensions from the issue doc.\n\nKey findings:\n- **Minimum viable fix (trivial):** Pass `outcome.reason` through `handleSessionCompletion` to produce a distinct failure message for maxTurns, including turn count and last `current_progress`. Single conditional branch in the orchestrator.\n- **No new lifecycle state needed.** A sub-status or enriched timeline entry gives the semantic distinction without state machine complexity. The `failed → pending` redispatch path already works.\n- **Don't keep worktrees, but make branches discoverable.** A diff endpoint (`GET /commission/:id/diff`) lets the UI show what was done. Preserved branch name stored in the artifact.\n- **Resumption via enriched redispatch.** Two options: merge the preserved branch into the new worktree (code continuity) or include previous progress summary in the prompt (context continuity). Could be a new `continue` action distinct from `redispatch`.\n- **Sleeping infrastructure as precedent.** The sleep/wake mechanism already preserves worktrees across session boundaries. A `halted` state could reuse that infrastructure for maxTurns, but only if demand warrants the complexity.\n- **Incremental path identified:** (1) failure message fix, (2) preserved branch in artifact, (3) diff endpoint, (4) enriched redispatch, (5) halted state. Each step builds on the previous and can ship independently.\n\nNote: The commit could not pass the pre-commit hook because tests require `/tmp/claude/` which this sandboxed worktree cannot write to. The artifact is staged but uncommitted."
  - timestamp: 2026-03-16T20:04:12.324Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Finished reading all related code (sdk-runner, orchestrator, lifecycle, diagrams). Now writing the brainstorm artifact at .lore/brainstorm/commission-maxturns-recovery.md."
projectName: guild-hall
---
Produced brainstorm artifact at `.lore/brainstorm/commission-maxturns-recovery.md` exploring 10 solution ideas across all five dimensions from the issue doc.

Key findings:
- **Minimum viable fix (trivial):** Pass `outcome.reason` through `handleSessionCompletion` to produce a distinct failure message for maxTurns, including turn count and last `current_progress`. Single conditional branch in the orchestrator.
- **No new lifecycle state needed.** A sub-status or enriched timeline entry gives the semantic distinction without state machine complexity. The `failed → pending` redispatch path already works.
- **Don't keep worktrees, but make branches discoverable.** A diff endpoint (`GET /commission/:id/diff`) lets the UI show what was done. Preserved branch name stored in the artifact.
- **Resumption via enriched redispatch.** Two options: merge the preserved branch into the new worktree (code continuity) or include previous progress summary in the prompt (context continuity). Could be a new `continue` action distinct from `redispatch`.
- **Sleeping infrastructure as precedent.** The sleep/wake mechanism already preserves worktrees across session boundaries. A `halted` state could reuse that infrastructure for maxTurns, but only if demand warrants the complexity.
- **Incremental path identified:** (1) failure message fix, (2) preserved branch in artifact, (3) diff endpoint, (4) enriched redispatch, (5) halted state. Each step builds on the previous and can ship independently.

Note: The commit could not pass the pre-commit hook because tests require `/tmp/claude/` which this sandboxed worktree cannot write to. The artifact is staged but uncommitted.
