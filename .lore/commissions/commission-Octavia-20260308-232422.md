---
title: "Commission: Brainstorm: Personal Assistant Worker"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm what a personal assistant worker would look like for Guild Hall. Use `/lore-development:brainstorm` to structure this.\n\nThe mail reader toolbox (`packages/guild-hall-email/`) just shipped, giving workers read-only access to a Fastmail inbox via JMAP. The immediate question: is a personal assistant worker just \"give it access to my mailbox\"? Or is there more?\n\nExplore broadly. Some threads to pull on:\n\n**What does \"personal assistant\" mean in this context?**\n- Is it a worker that other workers consult (like how the mail toolbox is a domain toolbox any worker can use)?\n- Or is it a standalone worker the user commissions directly for assistant-type tasks?\n- Or both? A worker with a unique posture that also provides capabilities to the hall?\n\n**What capabilities beyond email?**\n- Calendar awareness (read-only, like email)\n- Task/todo integration\n- Meeting prep (pull context from email threads before a 1:1)\n- Digest generation (morning briefing of what happened overnight)\n- Triage and prioritization suggestions\n- Cross-referencing email content with project artifacts in `.lore/`\n\n**What's the relationship to existing workers?**\n- Does the Guild Master already cover some of this ground with briefings?\n- Would this overlap with Verity's research capabilities?\n- Is this a new worker, a new toolbox, or an expansion of an existing worker's domain?\n\n**What are the boundaries?**\n- Read-only vs. read-write (sending email, creating calendar events)\n- Privacy: should this worker see everything, or should there be scoping?\n- Proactive vs. reactive: does it watch and notify, or only act when asked?\n\n**What infrastructure would it need that doesn't exist yet?**\n- Scheduled commissions (spec exists, plan exists, not yet built)\n- Calendar API integration (similar pattern to JMAP?)\n- Persistent memory across sessions (what did you tell me yesterday?)\n\nReference the mail reader toolbox spec (`.lore/specs/guild-hall-mail-reader-toolbox.md`) and the existing worker roster spec (`.lore/specs/guild-hall-worker-roster.md`) for context on how workers and toolboxes are structured. Also check `.lore/specs/guild-hall-scheduled-commissions.md` since scheduled commissions would be a natural fit for recurring assistant tasks like morning digests."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T06:24:22.288Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:24:22.289Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
