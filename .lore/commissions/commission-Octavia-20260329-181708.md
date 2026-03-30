---
title: "Commission: Brainstorm: Quick-add issues without session overhead"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the issue described in `.lore/issues/quick-add-issues.md`.\n\n**Problem:** Creating a simple issue (like a one-liner bug report or feature request) currently requires starting a full session. That's too heavy. Users need a way to quickly add an issue with just a dialog box and a file save.\n\n**Context:** Issues live as markdown files in `.lore/issues/` with YAML frontmatter (title, date, status). The daemon exposes a REST API over Unix socket. The web UI is Next.js App Router. The CLI uses plain bun scripts.\n\n**What to explore:**\n- Where should quick-add live? (Web UI, CLI, both?)\n- What's the minimal UX? (Dialog, command, shortcut?)\n- What fields are required vs. optional?\n- How does the file get created and committed?\n- How does this interact with the existing artifact system (`/workspace/artifacts/*` routes)?\n- Are there edge cases (naming conflicts, validation, project selection)?\n\nWrite the brainstorm artifact to `.lore/brainstorm/quick-add-issues.md`. Keep it practical and grounded in the existing architecture."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-30T01:17:08.677Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T01:17:08.679Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
