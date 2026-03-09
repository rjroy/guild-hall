---
title: "Commission: Research: Personal Assistant AI Landscape"
date: 2026-03-09
status: completed
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research the personal assistant AI landscape, with OpenClaw as a starting point. Use `/lore-development:research` to structure this.\n\nThe core question: these personal assistant AIs seem to operate on a \"just give it access\" model, but is there more to it? Where does the real power come from?\n\n**Specific angles to investigate:**\n\n1. **OpenClaw and similar projects**: What are they? How do they work? What's their architecture? What access do they get (email, calendar, files, etc.)?\n\n2. **The \"just give it access\" thesis**: Is raw tool access (read my email, read my calendar) sufficient for a useful assistant? Or is it table stakes that gets you 20% of the value?\n\n3. **Where does the real power live?** Investigate which of these is the actual differentiator:\n   - **Tools/integrations**: More connectors = more useful? Or diminishing returns?\n   - **Skills/routines**: Predefined workflows (morning digest, meeting prep, email triage) that compose tools into something greater than the sum?\n   - **Scheduling/proactivity**: The ability to act on its own schedule rather than waiting for prompts? (e.g., \"check my email every morning and surface what matters\")\n   - **Self-modification**: Can these assistants add their own tools/skills/integrations as needed? Is that where the real leverage is, that it can identify gaps in its own capabilities and fill them?\n   - **Memory/context accumulation**: Learning preferences over time, building a model of what matters to you?\n   - **Orchestration**: Managing multiple sub-tasks, delegating to specialized agents?\n\n4. **What's the state of the art?** Beyond OpenClaw, look at:\n   - Open-source personal assistant frameworks\n   - Commercial offerings (if any have interesting architectural patterns)\n   - Academic or blog posts analyzing what makes these work vs. fail\n\n5. **What fails?** What are the common failure modes? Where do people report these assistants being useless despite having access to everything?\n\nSave the research to `.lore/research/personal-assistant-ai-landscape.md`. This feeds into an active brainstorm Octavia is running on what a personal assistant worker would look like for Guild Hall."
dependencies: []
linked_artifacts:
  - .lore/research/personal-assistant-ai-landscape.md

activity_timeline:
  - timestamp: 2026-03-09T06:27:38.798Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T06:27:38.799Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T06:30:47.475Z
    event: status_failed
    reason: "Session error: Claude Code process exited with code 1"
  - timestamp: 2026-03-09T11:42:55.884Z
    event: status_pending
    reason: "Redispatched for retry"
    from: "failed"
    to: "pending"
  - timestamp: 2026-03-09T11:42:55.885Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-09T11:42:55.950Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-09T11:43:07.746Z
    event: progress_report
    reason: "Starting research on personal assistant AI landscape. Invoking /lore-development:research skill to structure the investigation."
  - timestamp: 2026-03-09T11:43:43.086Z
    event: progress_report
    reason: "Found rich existing context: personal-assistant-worker brainstorm, agent-native architecture research, Fastmail JMAP research. Now gathering external intelligence on OpenClaw, similar projects, and the broader landscape."
  - timestamp: 2026-03-09T11:47:13.373Z
    event: progress_report
    reason: "Have deep detail on OpenClaw (architecture, skills, heartbeat/cron, self-modification, security), Agent Zero, Lindy AI, and the broader landscape. Now gathering remaining pieces: commercial patterns, academic analysis, and specific failure modes. Then synthesizing."
  - timestamp: 2026-03-09T11:48:08.660Z
    event: progress_report
    reason: "Research gathering complete. Have detailed findings on OpenClaw (architecture, skills, heartbeat/cron, self-modification, security issues), Agent Zero, Lindy AI, n8n workflows, Second Me memory architecture, Apple/Google Siri Gemini, commercial patterns, and failure modes. Now synthesizing into the research document."
  - timestamp: 2026-03-09T11:51:46.771Z
    event: result_submitted
    reason: "Completed research on the personal assistant AI landscape. Saved to `.lore/research/personal-assistant-ai-landscape.md`.\n\nKey findings:\n\n1. **OpenClaw dominates** the open-source space (247K GitHub stars). Architecture: gateway daemon + per-session serial queues + markdown skills + flat-file memory + heartbeat/cron proactivity. Created by Peter Steinberger (now joining OpenAI).\n\n2. **\"Just give it access\" is table stakes, not differentiator.** Raw tool access gets you reactive queries you could do faster by opening the app yourself. The value comes from what's built on top.\n\n3. **Power stack (in order of impact):**\n   - Layer 0: Tool access (table stakes, mature)\n   - Layer 1: Skills/workflows that compose tools into routines (most value today)\n   - Layer 2: Proactive scheduling via heartbeat/cron (the leap from \"tool\" to \"assistant\")\n   - Layer 3: Memory that accumulates context over time (slow-burn differentiator)\n   - Layer 4: Self-modification / skill authoring (high potential, high risk, unproven)\n   - Layer 5: Multi-agent orchestration (commercial only, mostly enterprise)\n\n4. **What fails:** Cold start problem (useless until it learns you), prompt injection via email (every email is an attack vector), silent failures (confidently wrong triage), attention cost (too many notifications = ignored), trust erosion death spiral.\n\n5. **Implications for Guild Hall's Steward worker:** Validates scheduled commissions as the proactive primitive, read-only as the right starting line, skill composition as the product layer, and structured memory as a compound advantage. The cold start problem means shipping strong default skills that work without memory."
  - timestamp: 2026-03-09T11:51:50.444Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research gathering complete. Have detailed findings on OpenClaw (architecture, skills, heartbeat/cron, self-modification, security issues), Agent Zero, Lindy AI, n8n workflows, Second Me memory architecture, Apple/Google Siri Gemini, commercial patterns, and failure modes. Now synthesizing into the research document."
projectName: guild-hall
---
Completed research on the personal assistant AI landscape. Saved to `.lore/research/personal-assistant-ai-landscape.md`.

Key findings:

1. **OpenClaw dominates** the open-source space (247K GitHub stars). Architecture: gateway daemon + per-session serial queues + markdown skills + flat-file memory + heartbeat/cron proactivity. Created by Peter Steinberger (now joining OpenAI).

2. **"Just give it access" is table stakes, not differentiator.** Raw tool access gets you reactive queries you could do faster by opening the app yourself. The value comes from what's built on top.

3. **Power stack (in order of impact):**
   - Layer 0: Tool access (table stakes, mature)
   - Layer 1: Skills/workflows that compose tools into routines (most value today)
   - Layer 2: Proactive scheduling via heartbeat/cron (the leap from "tool" to "assistant")
   - Layer 3: Memory that accumulates context over time (slow-burn differentiator)
   - Layer 4: Self-modification / skill authoring (high potential, high risk, unproven)
   - Layer 5: Multi-agent orchestration (commercial only, mostly enterprise)

4. **What fails:** Cold start problem (useless until it learns you), prompt injection via email (every email is an attack vector), silent failures (confidently wrong triage), attention cost (too many notifications = ignored), trust erosion death spiral.

5. **Implications for Guild Hall's Steward worker:** Validates scheduled commissions as the proactive primitive, read-only as the right starting line, skill composition as the product layer, and structured memory as a compound advantage. The cold start problem means shipping strong default skills that work without memory.
