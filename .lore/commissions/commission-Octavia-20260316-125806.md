---
title: "Commission: Brainstorm: commission maxTurns recovery options"
date: 2026-03-16
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Task\n\nBrainstorm solutions for the commission maxTurns recovery problem. The issue is documented at `.lore/issues/commission-maxturns-no-recovery.md` — read it first.\n\n## What to produce\n\nUse `/lore-development:brainstorm` to explore the solution space. The issue doc already lays out the dimensions (preserving work, recovery/resumption, diagnosis, lifecycle states, behavioral nuance). Your job is to think through those dimensions and produce a brainstorm artifact at `.lore/brainstorm/commission-maxturns-recovery.md`.\n\n## Guidance\n\n- Read the related code referenced in the issue to understand the current behavior before brainstorming.\n- Consider the existing commission lifecycle state machine. Any solution needs to fit within or cleanly extend it.\n- Think about what's achievable incrementally. A perfect solution that requires rewriting the commission system is less useful than a pragmatic one that handles the 80% case.\n- Consider the user's perspective: they dispatched work, it hit a wall, and they want to know what happened and what they can do about it. The UX matters as much as the mechanism.\n- Don't write code or specs. This is exploration, not implementation.\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-16T19:58:06.311Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-16T19:58:06.312Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
