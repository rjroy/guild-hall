---
title: "Commission: Research: Jobs to Be Done and Disruptive Innovation applied to Guild Hall"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Read and summarize these two articles, then analyze how they apply to Guild Hall.\n\n## Articles to read\n\n1. https://online.hbs.edu/blog/post/3-keys-to-understanding-jobs-to-be-done\n2. https://online.hbs.edu/blog/post/4-keys-to-understanding-clayton-christensens-theory-of-disruptive-innovation\n\n## What to produce\n\nWrite the output to `.lore/research/jtbd-disruptive-innovation-guild-hall.md` with YAML frontmatter (title, status: active, date: 2026-03-31, tags: [strategy, product, research]).\n\n### Structure\n\n**Part 1: Article summaries**\nSummarize each article clearly. Capture the core frameworks, key concepts, and any examples that illustrate the ideas well.\n\n**Part 2: Application to Guild Hall**\nAnalyze Guild Hall through these lenses. Guild Hall is a multi-agent workspace where AI specialist workers execute commissions (tasks) dispatched by a coordinator, with a fantasy guild aesthetic, file-based state, no database. It's a single-developer project currently.\n\nAddress these three areas specifically:\n\n1. **What questions do these frameworks raise about what we currently have?**\n   - What \"job\" is Guild Hall hired to do? Is that clear? Are there competing jobs?\n   - Who is the \"customer\" and what progress are they trying to make?\n   - Are we solving a job people actually have, or building a solution looking for a problem?\n   - Where does Guild Hall sit on the disruption map? Is it a sustaining or disruptive play?\n\n2. **Where can Guild Hall go?**\n   - What adjacent jobs could it serve?\n   - Is there a low-end or new-market disruption angle?\n   - What would \"good enough\" look like vs. what we're building?\n   - Who are the non-consumers today that this could reach?\n\n3. **What are we doing wrong?**\n   - Are we over-serving a market that doesn't exist yet?\n   - Are we optimizing features nobody asked for?\n   - Where are we building for ourselves vs. building for a job?\n   - Is the fantasy aesthetic a differentiator or a barrier?\n\nBe direct and honest in the analysis. The audience is the project owner who wants genuine strategic thinking, not validation."
dependencies: []
linked_artifacts:
  - .lore/research/jtbd-disruptive-innovation-guild-hall.md

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-03-31T16:31:40.579Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T16:31:40.580Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T16:31:40.715Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T16:31:46.798Z
    event: progress_report
    reason: "Starting commission. Fetching both HBS articles on JTBD and Disruptive Innovation."
  - timestamp: 2026-03-31T16:32:35.829Z
    event: progress_report
    reason: "Articles are behind a 403 wall. Gathered substantial content from web search results and related sources covering both JTBD and Disruptive Innovation frameworks. Now synthesizing into the research artifact."
  - timestamp: 2026-03-31T16:34:58.743Z
    event: result_submitted
    reason: "Research artifact written to `.lore/research/jtbd-disruptive-innovation-guild-hall.md`.\n\n**Source note.** Both HBS Online articles returned 403 on direct fetch. Content was reconstructed from web search excerpts, cached summaries, and corroborating sources (Christensen Institute, FullStory, HBS Working Knowledge, HBR). The frameworks are well-documented across sources, so confidence in the summaries is high.\n\n**Part 1** covers both frameworks: JTBD's three keys (circumstances over demographics, functional/emotional/social dimensions, jobs outlast solutions) and Disruptive Innovation's four keys (disruption is specific and narrow, two types exist, it's a process not an event, it's a diagnostic framework).\n\n**Part 2** applies both to Guild Hall across the three requested areas:\n\n1. **What we have:** Identified three competing jobs Guild Hall could be hired for (delegation with oversight, workflow orchestration, thinking partnership). No established market to sustain or disrupt; closest to a new-market position. The customer is clear (creator) but generalization is an open question.\n\n2. **Where we can go:** Adjacent jobs in codebase onboarding, AI quality gates, and decision documentation. New-market angle (solo devs wanting team-like processes) is more promising than low-end. Defined what \"good enough\" looks like versus current architecture.\n\n3. **What we're doing wrong:** Infrastructure-to-user ratio is high. Some features are engineering-driven rather than job-driven. The aesthetic is both differentiator and barrier depending on audience. Core tension: builder's job versus market's job.\n\nCloses with five open questions that surface from the analysis, without recommendations."
  - timestamp: 2026-03-31T16:35:02.341Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Articles are behind a 403 wall. Gathered substantial content from web search results and related sources covering both JTBD and Disruptive Innovation frameworks. Now synthesizing into the research artifact."
projectName: guild-hall
---
Research artifact written to `.lore/research/jtbd-disruptive-innovation-guild-hall.md`.

**Source note.** Both HBS Online articles returned 403 on direct fetch. Content was reconstructed from web search excerpts, cached summaries, and corroborating sources (Christensen Institute, FullStory, HBS Working Knowledge, HBR). The frameworks are well-documented across sources, so confidence in the summaries is high.

**Part 1** covers both frameworks: JTBD's three keys (circumstances over demographics, functional/emotional/social dimensions, jobs outlast solutions) and Disruptive Innovation's four keys (disruption is specific and narrow, two types exist, it's a process not an event, it's a diagnostic framework).

**Part 2** applies both to Guild Hall across the three requested areas:

1. **What we have:** Identified three competing jobs Guild Hall could be hired for (delegation with oversight, workflow orchestration, thinking partnership). No established market to sustain or disrupt; closest to a new-market position. The customer is clear (creator) but generalization is an open question.

2. **Where we can go:** Adjacent jobs in codebase onboarding, AI quality gates, and decision documentation. New-market angle (solo devs wanting team-like processes) is more promising than low-end. Defined what "good enough" looks like versus current architecture.

3. **What we're doing wrong:** Infrastructure-to-user ratio is high. Some features are engineering-driven rather than job-driven. The aesthetic is both differentiator and barrier depending on audience. Core tension: builder's job versus market's job.

Closes with five open questions that surface from the analysis, without recommendations.
