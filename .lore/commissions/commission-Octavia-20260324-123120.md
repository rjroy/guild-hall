---
title: "Commission: Specify: Windows Native Support"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification based on the brainstorm at `.lore/brainstorm/windows-native-support.md`.\n\nUse the `/lore-development:specify` skill to produce a spec at `.lore/specs/infrastructure/windows-native-support.md`. The brainstorm has already mapped the problem space (socket dependencies, Bun Windows support, POSIX assumptions, architecture options). Your job is to turn that into concrete requirements with REQ IDs, success criteria, and a phased approach.\n\nKey focus areas from the brainstorm:\n- Transport abstraction (Unix socket / named pipe / TCP depending on platform)\n- Path separator and home directory handling\n- Git operations on Windows (shell assumptions, worktree behavior)\n- Minimum viable Windows support vs full parity\n\nRead the brainstorm artifact thoroughly before writing. The spec should be actionable enough that a developer could plan implementation from it."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T19:31:20.592Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T19:31:20.593Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
