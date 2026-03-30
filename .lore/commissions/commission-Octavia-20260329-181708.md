---
title: "Commission: Brainstorm: Quick-add issues without session overhead"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm solutions for the issue described in `.lore/issues/quick-add-issues.md`.\n\n**Problem:** Creating a simple issue (like a one-liner bug report or feature request) currently requires starting a full session. That's too heavy. Users need a way to quickly add an issue with just a dialog box and a file save.\n\n**Context:** Issues live as markdown files in `.lore/issues/` with YAML frontmatter (title, date, status). The daemon exposes a REST API over Unix socket. The web UI is Next.js App Router. The CLI uses plain bun scripts.\n\n**What to explore:**\n- Where should quick-add live? (Web UI, CLI, both?)\n- What's the minimal UX? (Dialog, command, shortcut?)\n- What fields are required vs. optional?\n- How does the file get created and committed?\n- How does this interact with the existing artifact system (`/workspace/artifacts/*` routes)?\n- Are there edge cases (naming conflicts, validation, project selection)?\n\nWrite the brainstorm artifact to `.lore/brainstorm/quick-add-issues.md`. Keep it practical and grounded in the existing architecture."
dependencies: []
linked_artifacts:
  - .lore/brainstorm/quick-add-issues.md

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
  - timestamp: 2026-03-30T01:17:08.788Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T01:17:14.974Z
    event: progress_report
    reason: "Starting research phase: reading the issue file and exploring existing artifact/issue infrastructure."
  - timestamp: 2026-03-30T01:18:51.897Z
    event: progress_report
    reason: "Research complete. Writing the brainstorm artifact now."
  - timestamp: 2026-03-30T01:20:04.380Z
    event: result_submitted
    reason: "Brainstorm written to `.lore/brainstorm/quick-add-issues.md`.\n\nThe document covers:\n- **Where it should live**: both web UI and CLI, serving different capture moments. Web form goes in the artifact list panel header. CLI inherits from the daemon operation via the registry.\n- **Minimal form**: title (required) + body (optional textarea). date and status auto-filled server-side.\n- **Architecture**: recommends a new `POST /workspace/issue/create` daemon endpoint over reusing the raw write endpoint. Server-side slug generation with EEXIST-based conflict resolution, meaningful commit messages.\n- **CLI design**: positional args with stdin support for multi-line body. No extra CLI code needed beyond operation registration.\n- **Edge cases**: naming conflicts, empty titles, long titles, concurrent creates, missing project context.\n- **Future extension**: global capture affordance with project picker, noted but explicitly deferred.\n- **Open questions**: auto-scroll behavior, tags in quick-add, concurrent write safety details, project inference from working directory."
  - timestamp: 2026-03-30T01:20:13.158Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Writing the brainstorm artifact now."
projectName: guild-hall
---
Brainstorm written to `.lore/brainstorm/quick-add-issues.md`.

The document covers:
- **Where it should live**: both web UI and CLI, serving different capture moments. Web form goes in the artifact list panel header. CLI inherits from the daemon operation via the registry.
- **Minimal form**: title (required) + body (optional textarea). date and status auto-filled server-side.
- **Architecture**: recommends a new `POST /workspace/issue/create` daemon endpoint over reusing the raw write endpoint. Server-side slug generation with EEXIST-based conflict resolution, meaningful commit messages.
- **CLI design**: positional args with stdin support for multi-line body. No extra CLI code needed beyond operation registration.
- **Edge cases**: naming conflicts, empty titles, long titles, concurrent creates, missing project context.
- **Future extension**: global capture affordance with project picker, noted but explicitly deferred.
- **Open questions**: auto-scroll behavior, tags in quick-add, concurrent write safety details, project inference from working directory.
