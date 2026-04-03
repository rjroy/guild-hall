---
title: "Commission: Add plugin naming convention to CLAUDE.md"
date: 2026-04-03
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Add a note to the project CLAUDE.md about Claude plugin naming requirements.\n\nIn the \"Key Rules\" section, add a new rule:\n\n**Plugin naming.** Claude plugin names in `plugin/.claude-plugin/plugin.json` must be kebab-case (e.g. `\"name\": \"guild-compendium\"`). The Claude Agent SDK will not load plugins with spaces or other non-kebab naming.\n\nKeep it concise and consistent with the existing rule formatting in CLAUDE.md."
dependencies: []
linked_artifacts:
  - CLAUDE.md

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-04-03T04:15:07.036Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T04:15:07.038Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-03T04:15:07.087Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-03T04:15:18.851Z
    event: progress_report
    reason: "Reading CLAUDE.md to locate the Key Rules section. Found structure; ready to add plugin naming rule."
  - timestamp: 2026-04-03T04:15:25.672Z
    event: result_submitted
    reason: "Added plugin naming rule to the \"Key Rules\" section of CLAUDE.md. The new rule documents that Claude plugin names in `plugin/.claude-plugin/plugin.json` must be kebab-case, and the Claude Agent SDK will not load plugins with spaces or other non-kebab naming."
  - timestamp: 2026-04-03T04:15:28.224Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Reading CLAUDE.md to locate the Key Rules section. Found structure; ready to add plugin naming rule."
projectName: guild-hall
---
Added plugin naming rule to the "Key Rules" section of CLAUDE.md. The new rule documents that Claude plugin names in `plugin/.claude-plugin/plugin.json` must be kebab-case, and the Claude Agent SDK will not load plugins with spaces or other non-kebab naming.
