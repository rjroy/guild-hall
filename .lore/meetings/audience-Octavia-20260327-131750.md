---
title: "Sandbox and new-project workflow: permission model discussion"
date: 2026-03-27
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
agenda: "Discuss some issues"
deferred_until: ""
linked_artifacts:
  - brainstorm/sandbox-permission-model.md
meeting_log:
  - timestamp: 2026-03-27T20:17:50.156Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-27T20:21:29.226Z
    event: renamed
    reason: "Renamed to: Sandbox and new-project workflow: permission model discussion"
  - timestamp: 2026-03-27T20:31:39.711Z
    event: progress_summary
    reason: "Brainstorm artifact written at .lore/brainstorm/sandbox-permission-model.md. Explores six ideas: sandbox write allowlists per commission type, project bootstrap phase, permission notification system, pre-approved operation classes, audit-trail notifications without blocking, and named sandbox profiles. Core tension identified: async delegation vs. human-in-the-loop approval. Lowest-cost next step suggested: make sandbox denials visible before building any approval system."
  - timestamp: 2026-03-27T20:32:41.837Z
    event: closed
    reason: "User closed audience"
---
## Meeting Notes: Sandbox and Permission Model Discussion

Octavia and the user explored the permission and sandbox architecture for worker tool access. The core question: how should Guild Hall handle sandbox permission denials when workers attempt operations outside their boundaries? The discussion surfaced nine distinct ideas, ranging from lightweight (making sandbox denials visible in logs/UI) to heavy (full permission notification system with human approval gates). The central tension identified is that Guild Hall's async delegation model (workers operating independently, humans reviewing results) pulls against real-time human-in-the-loop permission approval, which requires blocking operations to wait for human response. The brainstorm examined this tradeoff across multiple scenarios: Dalton (developer with full sandbox isolation), Octavia (chronicler with `.lore/` file management), Thorne (reviewer with read-only access), and administrative workers. Different worker types have different risk profiles and legitimate need for shell access.

Rather than commit to a direction immediately, the user opted to park this as a brainstorm artifact for later thinking. The exploration will remain available when the decision context shifts or when sandbox improvements surface new constraints.

Artifacts produced: `brainstorm/sandbox-permission-model.md` capturing six concrete ideas for permission models, open questions about SDK reliability, and implementation lift estimates for alternative toolbox approaches.

No immediate follow-ups assigned. This is exploratory work waiting for clarity on whether the underlying sandbox implementation issues (commit failures, `/tmp/` path hardcoding) get resolved, which would shift the viable paths forward.
