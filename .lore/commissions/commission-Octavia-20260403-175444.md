---
title: "Commission: Heartbeat P8: Retire Superseded Specs"
date: 2026-04-04
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Implement Phase 8 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 8.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ-HBT-48.\n\n## Step 1: Retire Superseded Specs (REQ-HBT-48)\n\nMove these files to `.lore/specs/_abandoned/`:\n- `.lore/specs/commissions/guild-hall-scheduled-commissions.md` → `.lore/specs/_abandoned/guild-hall-scheduled-commissions.md`\n- `.lore/specs/commissions/triggered-commissions.md` → `.lore/specs/_abandoned/triggered-commissions.md`\n- `.lore/specs/ui/triggered-commission-creation-ux.md` → `.lore/specs/_abandoned/triggered-commission-creation-ux.md`\n\nFor each file:\n1. Update the `status` field in frontmatter to `superseded`\n2. Add `superseded_by: .lore/specs/heartbeat-commission-dispatch.md` to frontmatter\n\nCreate the `.lore/specs/_abandoned/` directory if it doesn't exist.\n\nAlso update the heartbeat spec status from `approved` to `active` if it isn't already."
dependencies:
  - commission-Thorne-20260403-175434
linked_artifacts:
  - .lore/specs/_abandoned/guild-hall-scheduled-commissions.md

  - .lore/specs/_abandoned/triggered-commissions.md
  - .lore/specs/_abandoned/triggered-commission-creation-ux.md
  - .lore/specs/heartbeat-commission-dispatch.md
  - .lore/specs/_abandoned/triggered-commissions.md
  - .lore/specs/_abandoned/triggered-commission-creation-ux.md
  - .lore/specs/heartbeat-commission-dispatch.md
resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-04T00:54:44.556Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:59:31.178Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-04T14:04:42.788Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-04T14:04:42.794Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-04T14:04:42.841Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-04T14:04:47.682Z
    event: progress_report
    reason: "Starting Phase 8: reading plan and spec to understand requirements."
  - timestamp: 2026-04-04T14:05:17.715Z
    event: progress_report
    reason: "Creating _abandoned/ directory and writing updated spec files with superseded status."
  - timestamp: 2026-04-04T14:12:37.901Z
    event: result_submitted
    reason: "Phase 8 complete: retired three superseded specs and activated the heartbeat spec.\n\n**Actions taken:**\n\n1. Created `.lore/specs/_abandoned/` directory.\n\n2. Moved and updated three specs to `_abandoned/`:\n   - `.lore/specs/commissions/guild-hall-scheduled-commissions.md` → `_abandoned/` (status: `implemented` → `superseded`, added `superseded_by: .lore/specs/heartbeat-commission-dispatch.md`)\n   - `.lore/specs/commissions/triggered-commissions.md` → `_abandoned/` (same treatment)\n   - `.lore/specs/ui/triggered-commission-creation-ux.md` → `_abandoned/` (same treatment)\n\n3. Deleted the three original files from their previous locations.\n\n4. Updated `.lore/specs/heartbeat-commission-dispatch.md` status from `approved` to `active`.\n\n**Artifacts modified:**\n- `.lore/specs/_abandoned/guild-hall-scheduled-commissions.md`\n- `.lore/specs/_abandoned/triggered-commissions.md`\n- `.lore/specs/_abandoned/triggered-commission-creation-ux.md`\n- `.lore/specs/heartbeat-commission-dispatch.md`"
  - timestamp: 2026-04-04T14:12:43.556Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Creating _abandoned/ directory and writing updated spec files with superseded status."
projectName: guild-hall
---
Phase 8 complete: retired three superseded specs and activated the heartbeat spec.

**Actions taken:**

1. Created `.lore/specs/_abandoned/` directory.

2. Moved and updated three specs to `_abandoned/`:
   - `.lore/specs/commissions/guild-hall-scheduled-commissions.md` → `_abandoned/` (status: `implemented` → `superseded`, added `superseded_by: .lore/specs/heartbeat-commission-dispatch.md`)
   - `.lore/specs/commissions/triggered-commissions.md` → `_abandoned/` (same treatment)
   - `.lore/specs/ui/triggered-commission-creation-ux.md` → `_abandoned/` (same treatment)

3. Deleted the three original files from their previous locations.

4. Updated `.lore/specs/heartbeat-commission-dispatch.md` status from `approved` to `active`.

**Artifacts modified:**
- `.lore/specs/_abandoned/guild-hall-scheduled-commissions.md`
- `.lore/specs/_abandoned/triggered-commissions.md`
- `.lore/specs/_abandoned/triggered-commission-creation-ux.md`
- `.lore/specs/heartbeat-commission-dispatch.md`
