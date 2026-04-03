---
title: "Commission: Add plugin naming convention to CLAUDE.md"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Add a note to the project CLAUDE.md about Claude plugin naming requirements.\n\nIn the \"Key Rules\" section, add a new rule:\n\n**Plugin naming.** Claude plugin names in `plugin/.claude-plugin/plugin.json` must be kebab-case (e.g. `\"name\": \"guild-compendium\"`). The Claude Agent SDK will not load plugins with spaces or other non-kebab naming.\n\nKeep it concise and consistent with the existing rule formatting in CLAUDE.md."
dependencies: []
linked_artifacts: []

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
current_progress: ""
projectName: guild-hall
---
