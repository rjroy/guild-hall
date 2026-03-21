---
title: "Commission: Spec: CLI commission lifecycle commands"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a requirements spec for adding commission lifecycle commands to the Guild Hall CLI.\n\n**Context:** The CLI (`cli/index.ts`) currently has only project management commands (register, validate, rebase, sync, migrate-content). There are no commission commands at all. The daemon exposes a full commission REST API (create, list, dispatch, continue, save, cancel, abandon), but the only ways to interact with commissions are the web UI and meetings with the Guild Master.\n\nThis is a gap. Users should be able to manage commissions from the terminal: list them, check status, dispatch, continue halted ones, save partial work, cancel, abandon. This is especially important for automation and scripting.\n\n**What to spec:**\n- Which commission operations need CLI commands (list, status, create, dispatch, continue, save, cancel, abandon — consider which subset is essential vs. nice-to-have)\n- Command structure and naming (the CLI uses `bun run guild-hall <command>` pattern)\n- Output format (human-readable by default, consider whether JSON output flag is needed for scripting)\n- How commands interact with the daemon (HTTP calls to the Unix socket, same as the web UI)\n- Error handling (daemon not running, commission not found, invalid state transitions)\n- Filter/query support for list command (by status, by worker, etc.)\n\n**What NOT to spec:**\n- Meeting commands (separate concern)\n- Changes to the daemon API (it already has everything needed)\n- Web UI changes\n\n**Reference files:**\n- `cli/index.ts` — current CLI structure\n- `daemon/routes/commissions.ts` — available commission endpoints\n- `daemon/services/commission/orchestrator.ts` — commission lifecycle\n- `.lore/specs/commissions/commission-halted-continuation.md` — halted state operations"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T03:12:08.939Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T03:12:08.941Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
