---
title: "Commission: Plan: Add \"abandoned\" commission status with workflow enforcement"
date: 2026-02-27
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Write an implementation plan for adding an \"abandoned\" terminal state to the commission lifecycle. This goes in `.lore/plans/`.

Use your best judgement on any design questions. Research the codebase thoroughly before writing.

## Context

Commissions currently have three terminal states: completed, failed, cancelled. There's no way to close a commission that failed due to infrastructure issues (e.g., worktree destroyed during commit) when the work was actually completed outside the commission process, or to mark work that's simply no longer relevant.

## Requirements

**New terminal state: `abandoned`**

Valid transitions TO abandoned:
- `pending` → `abandoned` (never started, not going to)
- `blocked` → `abandoned` (giving up on blocked work)
- `failed` → `abandoned` (work done elsewhere or not worth retrying)
- `cancelled` → `abandoned` (changed mind about re-dispatch)

NOT from `dispatched` or `in_progress` (cancel first, then abandon). This is deliberate workflow enforcement.

**Reason is required.** Every abandon gets a timeline entry with the rationale. That's the audit trail.

**Surfaces:**
1. **Daemon endpoint** - `POST /commissions/:id/abandon` with required `reason` field
2. **Next.js proxy route** - standard proxy pattern matching existing commission routes
3. **UI button** - \"Abandon\" alongside \"Re-dispatch\" on failed/cancelled commissions, standalone on pending/blocked. Requires confirmation dialog with reason input.
4. **Guild Master tool** - `abandon_commission` added to the manager-exclusive toolbox with required `commissionId` and `reason` parameters

**Gem mapping:** `abandoned` joins the red/blocked set alongside `failed` and `cancelled`.

## Plan Structure

The plan should identify every file that needs changes, what changes are needed, and the order of implementation. Group into logical steps. Include the test strategy."
dependencies: []
linked_artifacts:
  - .lore/plans/abandoned-commission-state.md

activity_timeline:
  - timestamp: 2026-02-27T22:02:53.880Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:02:53.916Z
    event: status_dispatched
    reason: "Commission dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-02-27T22:02:53.917Z
    event: status_in_progress
    reason: "Commission session started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-02-27T22:03:01.140Z
    event: progress_report
    reason: "Starting codebase research to understand current commission lifecycle implementation before writing the plan."
  - timestamp: 2026-02-27T22:03:38.346Z
    event: progress_report
    reason: "Research complete: Thoroughly mapped the commission lifecycle implementation across daemon types, routes, helpers, UI components, and manager toolbox. Ready to document all required changes for adding the \"abandoned\" terminal state."
  - timestamp: 2026-02-27T22:04:16.623Z
    event: progress_report
    reason: "Codebase research complete. Now reading a few key files directly to verify specific patterns before writing the plan."
  - timestamp: 2026-02-27T22:04:54.134Z
    event: progress_report
    reason: "Research complete. Writing the implementation plan now. I've identified all 12+ files that need changes across daemon types, session lifecycle, routes, proxy routes, UI components, manager toolbox, gem mapping, and tests."
  - timestamp: 2026-02-27T22:06:47.239Z
    event: result_submitted
    reason: "Implementation plan written to `.lore/plans/abandoned-commission-state.md`. The plan covers 8 implementation steps across 9 files (1 new), with a comprehensive test strategy. Key design decisions: reason is required (not optional), no git operations needed (abandon only applies to commissions not in activeCommissions), confirmation dialog includes a textarea for the reason, and `abandoned` maps to the red gem set alongside `failed` and `cancelled`. The plan identifies the exact files, line numbers, and patterns to follow for each change."
  - timestamp: 2026-02-27T22:06:56.875Z
    event: status_completed
    reason: "Worker completed successfully"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-02-27T22:06:56.942Z
    event: status_completed
    reason: "Worker completed successfully"
current_progress: "Research complete. Writing the implementation plan now. I've identified all 12+ files that need changes across daemon types, session lifecycle, routes, proxy routes, UI components, manager toolbox, gem mapping, and tests."
result_summary: "Implementation plan written to `.lore/plans/abandoned-commission-state.md`. The plan covers 8 implementation steps across 9 files (1 new), with a comprehensive test strategy. Key design decisions: reason is required (not optional), no git operations needed (abandon only applies to commissions not in activeCommissions), confirmation dialog includes a textarea for the reason, and `abandoned` maps to the red gem set alongside `failed` and `cancelled`. The plan identifies the exact files, line numbers, and patterns to follow for each change."
projectName: guild-hall
---
