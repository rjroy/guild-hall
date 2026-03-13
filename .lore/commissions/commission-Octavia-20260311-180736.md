---
title: "Commission: New issue"
date: 2026-03-12
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Add to `.lore/issues/` a new issue to:\n- investigate what it means to focus on CLI integrations instead of MCP\n- this would include the use of skills\n- what about making sure all the tools are also part of a REST API?\n- would that mean the CLI actually interacts with the REST API?"
dependencies: []
linked_artifacts:
  - .lore/issues/cli-integration-vs-mcp.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-12T01:07:36.834Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-12T01:07:42.623Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-12T01:07:42.671Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-12T01:08:03.075Z
    event: progress_report
    reason: "Reading existing issues for format conventions, then examining CLI and daemon structure to inform the issue."
  - timestamp: 2026-03-12T01:09:18.344Z
    event: result_submitted
    reason: "Created `.lore/issues/cli-integration-vs-mcp.md` — an investigation issue covering the four questions in the commission: what CLI-first means for agents (answer: skills as CLI wrappers), what a CLI-as-daemon-client would look like, whether the daemon should expose HTTP in addition to the Unix socket, and how skills relate to MCP. The issue maps the current state (CLI talks to fs directly, daemon has REST over Unix socket, workers use MCP + skills), names the tensions, and frames the investigation as four concrete questions to resolve before any architectural change."
  - timestamp: 2026-03-12T01:09:27.561Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Reading existing issues for format conventions, then examining CLI and daemon structure to inform the issue."
projectName: guild-hall
---
Created `.lore/issues/cli-integration-vs-mcp.md` — an investigation issue covering the four questions in the commission: what CLI-first means for agents (answer: skills as CLI wrappers), what a CLI-as-daemon-client would look like, whether the daemon should expose HTTP in addition to the Unix socket, and how skills relate to MCP. The issue maps the current state (CLI talks to fs directly, daemon has REST over Unix socket, workers use MCP + skills), names the tensions, and frames the investigation as four concrete questions to resolve before any architectural change.
