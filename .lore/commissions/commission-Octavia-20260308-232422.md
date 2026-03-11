---
title: "Commission: Brainstorm: Personal Assistant Worker"
date: 2026-03-09
status: completed
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm what a personal assistant worker would look like for Guild Hall. Use `/lore-development:brainstorm` to structure this.\n\nThe mail reader toolbox (`packages/guild-hall-email/`) just shipped, giving workers read-only access to a Fastmail inbox via JMAP. The immediate question: is a personal assistant worker just \"give it access to my mailbox\"? Or is there more?\n\nExplore broadly. Some threads to pull on:\n\n**What does \"personal assistant\" mean in this context?**\n- Is it a worker that other workers consult (like how the mail toolbox is a domain toolbox any worker can use)?\n- Or is it a standalone worker the user commissions directly for assistant-type tasks?\n- Or both? A worker with a unique posture that also provides capabilities to the hall?\n\n**What capabilities beyond email?**\n- Calendar awareness (read-only, like email)\n- Task/todo integration\n- Meeting prep (pull context from email threads before a 1:1)\n- Digest generation (morning briefing of what happened overnight)\n- Triage and prioritization suggestions\n- Cross-referencing email content with project artifacts in `.lore/`\n\n**What's the relationship to existing workers?**\n- Does the Guild Master already cover some of this ground with briefings?\n- Would this overlap with Verity's research capabilities?\n- Is this a new worker, a new toolbox, or an expansion of an existing worker's domain?\n\n**What are the boundaries?**\n- Read-only vs. read-write (sending email, creating calendar events)\n- Privacy: should this worker see everything, or should there be scoping?\n- Proactive vs. reactive: does it watch and notify, or only act when asked?\n\n**What infrastructure would it need that doesn't exist yet?**\n- Scheduled commissions (spec exists, plan exists, not yet built)\n- Calendar API integration (similar pattern to JMAP?)\n- Persistent memory across sessions (what did you tell me yesterday?)\n\nReference the mail reader toolbox spec (`.lore/specs/workers/guild-hall-mail-reader-toolbox.md`) and the existing worker roster spec (`.lore/specs/workers/guild-hall-worker-roster.md`) for context on how workers and toolboxes are structured. Also check `.lore/specs/commissions/guild-hall-scheduled-commissions.md` since scheduled commissions would be a natural fit for recurring assistant tasks like morning digests."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/personal-assistant-worker.md

activity_timeline:
  - timestamp: 2026-03-09T06:24:22.288Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:24:22.289Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T06:24:22.323Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T06:24:30.331Z
    event: progress_report
    reason: "Reading referenced specs (mail reader toolbox, worker roster, scheduled commissions) before invoking brainstorm skill."
  - timestamp: 2026-03-09T06:25:08.537Z
    event: progress_report
    reason: "Context gathered from three specs (mail reader toolbox, worker roster, scheduled commissions) and related reference material. Now invoking /lore-development:brainstorm to structure the exploration."
  - timestamp: 2026-03-09T06:25:51.796Z
    event: progress_report
    reason: "All context gathered. Writing the brainstorm document now. Explored mail reader toolbox spec, worker roster spec, scheduled commissions spec, JMAP research, Guild Master capabilities, and existing brainstorms."
  - timestamp: 2026-03-09T06:29:18.663Z
    event: result_submitted
    reason: "Brainstorm complete. Produced `.lore/brainstorm/personal-assistant-worker.md` exploring ten ideas for a personal assistant worker in Guild Hall.\n\n**Key findings:**\n\n1. **The assistant is a new worker, not just a toolbox consumer.** The existing roster workers are project-scoped; an assistant is user-scoped (calendar, inbox, priorities). This creates architectural tension with the project-scoped commission system, resolvable pragmatically by running on any project with cross-cutting toolbox access.\n\n2. **Dual worker+toolbox shape is viable.** REQ-WKR-7 already supports it. The assistant-as-toolbox could expose composed tools like `get_meeting_prep` that other workers (especially the Guild Master) invoke. Recommendation: keep the toolbox layer thin (data retrieval, light formatting), leave narrative interpretation to the worker.\n\n3. **Guild Master doesn't overlap much.** Guild Master briefings are about project state (commission graphs). Assistant briefings are about user state (email, calendar, cross-project awareness). The assistant *consumes* Guild Master briefings as input, doesn't replace them.\n\n4. **Capability ordering by value/difficulty:** Email triage (high/low), morning digest (high/medium, needs scheduled commissions), calendar awareness (high/medium, JMAP already supports it), meeting prep (high/medium, combines multiple toolboxes). Email composition is low priority due to blast radius.\n\n5. **Read-only is the right starting line.** Enforceable at Fastmail token scope. The assistant advises; the user acts.\n\n6. **Scheduled commissions are the proactive mechanism.** No new push infrastructure needed. Cron-based commissions produce artifacts the user sees in the UI. This makes scheduled commissions (spec approved, not yet built) the natural prerequisite.\n\n7. **\"Steward\" identity fits.** Manages the household, handles correspondence, prepares the guild master for meetings. Distinct from Researcher (point-in-time investigation vs. ongoing awareness).\n\n**Seven open questions** documented, including project-scoping vs. user-scoping, calendar toolbox packaging, notification channels, task integration target, concurrent email access, memory structure, and Guild Master escalation patterns.\n\n**Recommended next steps:** Build scheduled commissions first (prerequisite, value independent of assistant), then calendar toolbox, then define the Steward worker package as a spec."
  - timestamp: 2026-03-09T06:29:27.736Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All context gathered. Writing the brainstorm document now. Explored mail reader toolbox spec, worker roster spec, scheduled commissions spec, JMAP research, Guild Master capabilities, and existing brainstorms."
projectName: guild-hall
---
Brainstorm complete. Produced `.lore/brainstorm/personal-assistant-worker.md` exploring ten ideas for a personal assistant worker in Guild Hall.

**Key findings:**

1. **The assistant is a new worker, not just a toolbox consumer.** The existing roster workers are project-scoped; an assistant is user-scoped (calendar, inbox, priorities). This creates architectural tension with the project-scoped commission system, resolvable pragmatically by running on any project with cross-cutting toolbox access.

2. **Dual worker+toolbox shape is viable.** REQ-WKR-7 already supports it. The assistant-as-toolbox could expose composed tools like `get_meeting_prep` that other workers (especially the Guild Master) invoke. Recommendation: keep the toolbox layer thin (data retrieval, light formatting), leave narrative interpretation to the worker.

3. **Guild Master doesn't overlap much.** Guild Master briefings are about project state (commission graphs). Assistant briefings are about user state (email, calendar, cross-project awareness). The assistant *consumes* Guild Master briefings as input, doesn't replace them.

4. **Capability ordering by value/difficulty:** Email triage (high/low), morning digest (high/medium, needs scheduled commissions), calendar awareness (high/medium, JMAP already supports it), meeting prep (high/medium, combines multiple toolboxes). Email composition is low priority due to blast radius.

5. **Read-only is the right starting line.** Enforceable at Fastmail token scope. The assistant advises; the user acts.

6. **Scheduled commissions are the proactive mechanism.** No new push infrastructure needed. Cron-based commissions produce artifacts the user sees in the UI. This makes scheduled commissions (spec approved, not yet built) the natural prerequisite.

7. **"Steward" identity fits.** Manages the household, handles correspondence, prepares the guild master for meetings. Distinct from Researcher (point-in-time investigation vs. ongoing awareness).

**Seven open questions** documented, including project-scoping vs. user-scoping, calendar toolbox packaging, notification channels, task integration target, concurrent email access, memory structure, and Guild Master escalation patterns.

**Recommended next steps:** Build scheduled commissions first (prerequisite, value independent of assistant), then calendar toolbox, then define the Steward worker package as a spec.
