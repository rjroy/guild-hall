---
title: "Commission: Plan: Request Meeting from Artifact sidebar"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for `.lore/specs/ui/artifact-request-meeting.md`.\n\nRead the spec first, then read the existing code it references to understand the starting point. The plan should cover what to change, in what order, and how to verify each step.\n\n**Reference files to read:**\n- `.lore/specs/ui/artifact-request-meeting.md` — the spec (source of truth)\n- `web/components/artifact/MetadataSidebar.tsx` — where the button goes\n- `web/components/commission/CreateCommissionButton.tsx` — existing pattern for similar action\n- `web/app/projects/[name]/page.tsx` — how commission query params are consumed (model for meeting equivalent)\n- `.lore/plans/` — existing plans for format reference\n\nPlace the plan at `.lore/plans/ui/artifact-request-meeting.md`."
dependencies:
  - commission-Octavia-20260314-153321
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-14T22:50:08.376Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T22:50:08.378Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
