---
title: "Commission: Specify scheduled commissions from brainstorm"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "The brainstorm at `.lore/brainstorm/scheduled-commissions.md` is ready for specification. Convert it into a formal spec at `.lore/specs/guild-hall-scheduled-commissions.md`.\n\nThe brainstorm settled the core design decisions:\n- Schedule lives in the commission artifact (not config.yaml)\n- `type` field distinguishes one-shot from scheduled\n- Cron expressions for cadence\n- Spawned commissions are normal one-shot commissions with `source_schedule` back-reference\n- Guild Master creates/edits schedules via two new manager tools\n- \"Assuming yes\" is a prompt concern, not a system concern\n\nThe brainstorm also has open questions that need resolution in the spec:\n- Should `paused` status exist?\n- Tick interval for the scheduler service\n- Spawn event format for the activity timeline\n- UI representation of scheduled commissions\n- Integration with `cleanup-commissions`\n\nUse the existing commission spec (`.lore/specs/guild-hall-commissions.md`) as the reference for format and REQ-ID conventions. The scheduled commission spec should cover: artifact schema, status transitions, daemon scheduler service interface, manager toolbox tool definitions, success criteria, and UI requirements."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T17:28:27.515Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T17:28:27.516Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
