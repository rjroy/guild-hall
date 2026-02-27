---
title: "Commission: Plan: Add \"abandoned\" commission status with workflow enforcement"
date: 2026-02-27
status: pending
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
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-02-27T22:02:53.880Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-27T22:02:53.919Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Plan: Add \"abandoned\" commission status with workflow enforcement\""
current_progress: ""
result_summary: ""
projectName: guild-hall
---
