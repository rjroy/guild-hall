---
title: "Commission: Plan for cli-agent-surface spec"
date: 2026-04-21
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare an implementation plan for the spec at `.lore/specs/infrastructure/cli-agent-surface.md`.\n\nContext:\n- Spec is in draft status, 27 requirements, 1 review round completed 2026-04-19.\n- Key decisions: removes `cliPath` from `OperationDefinition`, makes CLI surface CLI-owned, adds 4 daemon leaf ops (`system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list/read`).\n- Supersedes `cli-commission-commands` REQ-CLI-COM-18/19 on formatter keying.\n- Related draft spec: `.lore/specs/infrastructure/cli-commission-commands.md` — consider whether this plan should subsume or coordinate with that one.\n\nUse the `/lore-development:prep-plan` skill to produce the plan. The plan should:\n1. Break the work into phases with clear boundaries (foundation phases that fan out need review+fix gates before downstream work).\n2. Identify which workers handle which phases (Dalton for implementation, Thorne for reviews).\n3. Call out requirement coverage — every REQ ID in the spec must map to a phase.\n4. Note any spec gaps or ambiguities surfaced during planning; these should go back to the spec, not be papered over in the plan.\n5. Right-size commissions — 2-3 phases per commission max, with explicit dependencies.\n\nOutput the plan to `.lore/plans/infrastructure/cli-agent-surface.md`. Do not dispatch implementation work; this is planning only."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-21T01:16:53.428Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-21T01:16:53.432Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
