---
title: "Commission: Heartbeat P8: Retire Superseded Specs"
date: 2026-04-04
status: blocked
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Implement Phase 8 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 8.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ-HBT-48.\n\n## Step 1: Retire Superseded Specs (REQ-HBT-48)\n\nMove these files to `.lore/specs/_abandoned/`:\n- `.lore/specs/commissions/guild-hall-scheduled-commissions.md` → `.lore/specs/_abandoned/guild-hall-scheduled-commissions.md`\n- `.lore/specs/commissions/triggered-commissions.md` → `.lore/specs/_abandoned/triggered-commissions.md`\n- `.lore/specs/ui/triggered-commission-creation-ux.md` → `.lore/specs/_abandoned/triggered-commission-creation-ux.md`\n\nFor each file:\n1. Update the `status` field in frontmatter to `superseded`\n2. Add `superseded_by: .lore/specs/heartbeat-commission-dispatch.md` to frontmatter\n\nCreate the `.lore/specs/_abandoned/` directory if it doesn't exist.\n\nAlso update the heartbeat spec status from `approved` to `active` if it isn't already."
dependencies:
  - commission-Thorne-20260403-175434
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
