---
title: "Commission: Spec Update: Local Model Support validation findings"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the Local Model Support spec at `.lore/specs/local-model-support.md` with three changes based on Thorne's validation findings.\n\n**1. REQ-LOCAL-7: Tighten URL validation wording.**\nCurrent spec says \"parseable by `new URL()`\" (any protocol). The implementation restricts to HTTP/HTTPS, which is correct. Update the spec to say \"a valid HTTP or HTTPS URL\" to match the implementation.\n\n**2. REQ-LOCAL-18: Document the return value approach for mid-session error prefixing.**\nThe fix for mid-session error context is to return the resolved model info from `prepareSdkSession` alongside the session options. This way every orchestrator (commission, meeting, mail, briefing) can prefix mid-session errors with the local model name and URL without duplicating resolution logic. Update REQ-LOCAL-18 to reflect this approach: `prepareSdkSession` returns resolved model context, and orchestrators use it to prefix error messages for local model sessions.\n\n**3. REQ-LOCAL-20: Change model guidance from hardcoded to config-driven.**\nThe original spec assumed guidance would be hardcoded in the manager worker file. The better approach: add an optional `guidance` field to `ModelDefinition` in config.yaml. Each model definition can include a guidance string describing when to use it. The manager worker reads all model guidance (built-in defaults from the worker file + `guidance` fields from config.models) and assembles the system prompt dynamically.\n\nUpdate REQ-LOCAL-20 to describe this config-driven approach. The `ModelDefinition` shape (REQ-LOCAL-1) also needs the `guidance?: string` field added.\n\nRead the current spec before making changes. Preserve existing requirement IDs and structure."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T02:46:00.833Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T02:46:00.834Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
