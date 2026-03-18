---
title: "Commission: Add read-before-write guard to memory redesign spec"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Add a new requirement to `.lore/specs/infrastructure/memory-single-file-redesign.md`.\n\n**New requirement (REQ-MEM-27):** `edit_memory` must reject calls unless the current SDK session has called `read_memory` for the same scope since session start. The tool returns an error message like: \"Read memory before editing. Call read_memory with scope '{scope}' first.\"\n\nKey design points:\n- The guard is tracked **per-session**, not globally. Each SDK session gets its own toolbox instance, so a `Set<string>` of scopes that have been read is sufficient.\n- One session reading project memory does **not** authorize a different session to edit it. No cross-session coordination needed.\n- The `read_memory` handler populates the set when called. The `edit_memory` handler checks it before proceeding.\n- The deprecated `write_memory` alias (REQ-MEM backward compat, decision 6) is also subject to this guard.\n\nAdd REQ-MEM-27 to the Tool: `edit_memory` section. Also add a test case to the AI Validation section covering this guard (both the rejection case and the success-after-read case). Update the Success Criteria checklist to include this requirement."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T05:48:42.085Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T05:48:42.087Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
