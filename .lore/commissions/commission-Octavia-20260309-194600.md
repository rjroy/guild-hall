---
title: "Commission: Spec Update: Local Model Support validation findings"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Update the Local Model Support spec at `.lore/specs/infrastructure/local-model-support.md` with three changes based on Thorne's validation findings.\n\n**1. REQ-LOCAL-7: Tighten URL validation wording.**\nCurrent spec says \"parseable by `new URL()`\" (any protocol). The implementation restricts to HTTP/HTTPS, which is correct. Update the spec to say \"a valid HTTP or HTTPS URL\" to match the implementation.\n\n**2. REQ-LOCAL-18: Document the return value approach for mid-session error prefixing.**\nThe fix for mid-session error context is to return the resolved model info from `prepareSdkSession` alongside the session options. This way every orchestrator (commission, meeting, mail, briefing) can prefix mid-session errors with the local model name and URL without duplicating resolution logic. Update REQ-LOCAL-18 to reflect this approach: `prepareSdkSession` returns resolved model context, and orchestrators use it to prefix error messages for local model sessions.\n\n**3. REQ-LOCAL-20: Change model guidance from hardcoded to config-driven.**\nThe original spec assumed guidance would be hardcoded in the manager worker file. The better approach: add an optional `guidance` field to `ModelDefinition` in config.yaml. Each model definition can include a guidance string describing when to use it. The manager worker reads all model guidance (built-in defaults from the worker file + `guidance` fields from config.models) and assembles the system prompt dynamically.\n\nUpdate REQ-LOCAL-20 to describe this config-driven approach. The `ModelDefinition` shape (REQ-LOCAL-1) also needs the `guidance?: string` field added.\n\nRead the current spec before making changes. Preserve existing requirement IDs and structure."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/local-model-support.md

activity_timeline:
  - timestamp: 2026-03-10T02:46:00.833Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T02:46:00.834Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T02:46:00.874Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T02:46:10.777Z
    event: progress_report
    reason: "Reading the current local-model-support spec before making changes."
  - timestamp: 2026-03-10T02:46:23.396Z
    event: progress_report
    reason: "Making four edits: REQ-LOCAL-7 (URL validation), REQ-LOCAL-1/REQ-LOCAL-4 (guidance field on ModelDefinition), REQ-LOCAL-18 (return value approach), REQ-LOCAL-20 (config-driven guidance)."
  - timestamp: 2026-03-10T02:47:48.739Z
    event: result_submitted
    reason: "Updated `.lore/specs/infrastructure/local-model-support.md` with three spec changes from Thorne's validation findings:\n\n1. **REQ-LOCAL-7** (line 88): Tightened URL validation wording from \"parseable by `new URL()`\" to \"a valid HTTP or HTTPS URL. Other protocols are rejected at config load time.\"\n\n2. **REQ-LOCAL-18** (line 139): Replaced the UI-focused error prefixing description with the `prepareSdkSession` return value approach. The spec now says `prepareSdkSession` returns resolved model context (name, URL, local-vs-builtin) alongside session options, and orchestrators use that context to prefix errors. Resolution happens once; orchestrators only format.\n\n3. **REQ-LOCAL-20** (line 145): Changed from hardcoded manager guidance to config-driven. Each `ModelDefinition` can include an optional `guidance` string. The manager assembles its system prompt dynamically from built-in defaults + config `guidance` fields. Users control how the manager thinks about their local models without editing worker source files.\n\n4. **REQ-LOCAL-1** (line 41) and **REQ-LOCAL-4** (line 74): Added `guidance?: string` to the `ModelDefinition` shape in both the prose description and the TypeScript interface example. Also added a `guidance` value to the first entry in the REQ-LOCAL-3 YAML example to show the syntax.\n\nAll existing requirement IDs and document structure preserved."
  - timestamp: 2026-03-10T02:47:54.663Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Making four edits: REQ-LOCAL-7 (URL validation), REQ-LOCAL-1/REQ-LOCAL-4 (guidance field on ModelDefinition), REQ-LOCAL-18 (return value approach), REQ-LOCAL-20 (config-driven guidance)."
projectName: guild-hall
---
Updated `.lore/specs/infrastructure/local-model-support.md` with three spec changes from Thorne's validation findings:

1. **REQ-LOCAL-7** (line 88): Tightened URL validation wording from "parseable by `new URL()`" to "a valid HTTP or HTTPS URL. Other protocols are rejected at config load time."

2. **REQ-LOCAL-18** (line 139): Replaced the UI-focused error prefixing description with the `prepareSdkSession` return value approach. The spec now says `prepareSdkSession` returns resolved model context (name, URL, local-vs-builtin) alongside session options, and orchestrators use that context to prefix errors. Resolution happens once; orchestrators only format.

3. **REQ-LOCAL-20** (line 145): Changed from hardcoded manager guidance to config-driven. Each `ModelDefinition` can include an optional `guidance` string. The manager assembles its system prompt dynamically from built-in defaults + config `guidance` fields. Users control how the manager thinks about their local models without editing worker source files.

4. **REQ-LOCAL-1** (line 41) and **REQ-LOCAL-4** (line 74): Added `guidance?: string` to the `ModelDefinition` shape in both the prose description and the TypeScript interface example. Also added a `guidance` value to the first entry in the REQ-LOCAL-3 YAML example to show the syntax.

All existing requirement IDs and document structure preserved.
