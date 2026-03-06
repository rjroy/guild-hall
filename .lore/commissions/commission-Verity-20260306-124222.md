---
title: "Commission: Research: OpenClaw SOUL.md Personality Techniques"
date: 2026-03-06
status: completed
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research OpenClaw's SOUL.md approach to AI personality. The user has observed that OpenClaw has a distinctly strong personality, while Guild Hall's workers have only a light \"vibe\" from brief system prompt descriptions.\n\n**What to investigate:**\n\n1. **Find OpenClaw's SOUL.md** — search GitHub for the OpenClaw project and its SOUL.md file. Read it thoroughly.\n\n2. **Analyze what makes it work** — What techniques does SOUL.md use to create personality? Consider:\n   - Structure and length\n   - How it defines voice, tone, and attitude\n   - Whether it uses examples, anti-examples, or calibration pairs\n   - How it handles the boundary between personality and capability\n   - Whether personality is described abstractly (\"be friendly\") or demonstrated concretely\n   - How much of the file is personality vs. behavioral rules vs. knowledge\n\n3. **Compare to Guild Hall's current approach** — Guild Hall workers have a one-line description in their system prompt (e.g., \"Guild Artificer: Master craftsman of the guild. Builds what is commissioned, from foundation to finishing touch.\"). What's the gap?\n\n4. **Identify transferable patterns** — What techniques from SOUL.md (or similar approaches) could Guild Hall adopt to give workers more distinct personalities without bloating the system prompt or interfering with task execution?\n\nWrite your findings to `.lore/research/soul-md-personality-techniques.md`. Focus on actionable analysis, not just description. The user wants to understand the *mechanics* of why it works."
dependencies: []
linked_artifacts:
  - .lore/research/soul-md-personality-techniques.md

activity_timeline:
  - timestamp: 2026-03-06T20:42:22.630Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-06T20:42:22.632Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-06T20:42:22.692Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-06T20:42:30.302Z
    event: progress_report
    reason: "Starting research on OpenClaw's SOUL.md approach. Searching GitHub for the project and its SOUL.md file."
  - timestamp: 2026-03-06T20:43:15.793Z
    event: progress_report
    reason: "Found core SOUL.md ecosystem: the aaronjmars/soul.md framework (multi-file system with SOUL.md, STYLE.md, SKILL.md, examples/), OpenClaw's official template, and concrete examples. Now searching for the OpenClaw project's own SOUL.md and the steipete/Clawd origin story to understand the pioneering implementation."
  - timestamp: 2026-03-06T20:44:51.027Z
    event: progress_report
    reason: "Collected comprehensive data on OpenClaw's SOUL.md ecosystem: the official template, multi-file architecture (SOUL/STYLE/SKILL/IDENTITY), the soul.md framework by aaronjmars, SoulSpec standard, and community examples. Now reading Guild Hall's current worker descriptions to compare, then writing the analysis."
  - timestamp: 2026-03-06T20:45:46.900Z
    event: progress_report
    reason: "Have complete picture of both systems. Guild Hall's workers use structured \"postures\" (Principles/Workflow/Quality Standards) that are purely behavioral/instructional with no personality layer. OpenClaw's SOUL.md uses Core Truths/Boundaries/Vibe sections that blend behavioral rules with character and voice. Now checking the commission system prompt and fantasy aesthetic for the personality injection points."
  - timestamp: 2026-03-06T20:47:48.621Z
    event: result_submitted
    reason: "Completed research on OpenClaw's SOUL.md personality techniques. Investigated the official OpenClaw template, the aaronjmars/soul.md framework (multi-file system with calibration pairs), the SoulSpec open standard, community examples from souls.directory, and architectural documentation from LearnOpenClaw and MMNTM.\n\nKey findings:\n- SOUL.md works because it uses **identity framing** (\"you're becoming someone\") rather than instruction framing (\"be helpful\"), which shifts the model from compliance to character inhabitation\n- The template is only 43 lines but packs seven distinct techniques: identity framing, embedded anti-examples, concrete voice over abstract traits, deliberate brevity, file separation, gestalt \"Vibe\" summaries, and owned evolution\n- Guild Hall's current postures are ~95% behavioral rules and ~5% personality, compared to SOUL.md's ~60/40 split\n- Five transferable patterns identified, ordered by impact/cost ratio: character preamble, anti-examples, vibe expansion, calibration pairs, and personality/capability separation\n- Three patterns explicitly NOT recommended for Guild Hall: self-modification, continuity-as-personality, and the full six-file system"
  - timestamp: 2026-03-06T20:47:51.596Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-06T20:47:51.635Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Have complete picture of both systems. Guild Hall's workers use structured \"postures\" (Principles/Workflow/Quality Standards) that are purely behavioral/instructional with no personality layer. OpenClaw's SOUL.md uses Core Truths/Boundaries/Vibe sections that blend behavioral rules with character and voice. Now checking the commission system prompt and fantasy aesthetic for the personality injection points."
projectName: guild-hall
---
Completed research on OpenClaw's SOUL.md personality techniques. Investigated the official OpenClaw template, the aaronjmars/soul.md framework (multi-file system with calibration pairs), the SoulSpec open standard, community examples from souls.directory, and architectural documentation from LearnOpenClaw and MMNTM.

Key findings:
- SOUL.md works because it uses **identity framing** ("you're becoming someone") rather than instruction framing ("be helpful"), which shifts the model from compliance to character inhabitation
- The template is only 43 lines but packs seven distinct techniques: identity framing, embedded anti-examples, concrete voice over abstract traits, deliberate brevity, file separation, gestalt "Vibe" summaries, and owned evolution
- Guild Hall's current postures are ~95% behavioral rules and ~5% personality, compared to SOUL.md's ~60/40 split
- Five transferable patterns identified, ordered by impact/cost ratio: character preamble, anti-examples, vibe expansion, calibration pairs, and personality/capability separation
- Three patterns explicitly NOT recommended for Guild Hall: self-modification, continuity-as-personality, and the full six-file system
