---
title: "Commission: File issue: meeting agenda lost in system prompt noise"
date: 2026-03-17
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "File an issue in `.lore/issues/` for the following bug:\n\n**Problem:** When a meeting opens, the agenda from the meeting artifact is injected into the system prompt's `# Meeting Context` activation block, but the initial user message sent to the SDK is a static greeting prompt (`MEETING_GREETING_PROMPT`) that says \"summarize your understanding of the meeting agenda.\" The model is expected to find the agenda in the system prompt, but with the volume of system prompt content (identity, posture, memory, manager context, CLAUDE.md, rules), the agenda competes for attention and can be missed.\n\n**Root cause:** The agenda is only in the system prompt's activation context. The initial user-turn message doesn't contain it. Models treat system prompts as strong context but not a binding contract, so information buried in a large system prompt can be missed.\n\n**Location in code:**\n- `daemon/services/meeting/orchestrator.ts` lines 591-614: `startSession()` calls `buildMeetingPrepSpec(meeting, prompt)` which puts the agenda into `meetingContext.agenda` for the system prompt, but then replaces the actual SDK prompt with the static `MEETING_GREETING_PROMPT` on line 613.\n- `packages/shared/worker-activation.ts` line 33: Where the `# Meeting Context\\n\\nAgenda: ${agenda}` block is built for the system prompt.\n\n**Potential fix direction:** Include the agenda text in the initial user message alongside the greeting prompt, so it's impossible for the model to miss. The agenda should remain in the activation context too for reference throughout the session.\n\n**Severity:** Low — the agenda is still accessible in the meeting artifact file, but the model may not proactively surface it without being prompted."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-17T03:14:40.874Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-17T03:14:40.876Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-17T03:14:40.916Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-17T03:15:10.116Z
    event: progress_report
    reason: "Verified code locations and confirmed bug. Reading existing issue format to create consistent file structure."
  - timestamp: 2026-03-17T03:15:37.815Z
    event: progress_report
    reason: "Issue filed to .lore/issues/meeting-agenda-system-prompt-attention.md. Verified code locations and documented root cause, impact, and fix direction."
  - timestamp: 2026-03-17T03:15:41.240Z
    event: result_submitted
    reason: "Filed issue documenting meeting agenda system prompt attention problem. Verified root cause in orchestrator.ts (line 613) and worker-activation.ts (line 33). Issue includes problem statement, why it matters, root cause analysis, code locations, fix direction, and severity assessment (low).\",\n\"artifacts\": [\".lore/issues/meeting-agenda-system-prompt-attention.md\"]"
  - timestamp: 2026-03-17T03:15:44.082Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Issue filed to .lore/issues/meeting-agenda-system-prompt-attention.md. Verified code locations and documented root cause, impact, and fix direction."
projectName: guild-hall
---
Filed issue documenting meeting agenda system prompt attention problem. Verified root cause in orchestrator.ts (line 613) and worker-activation.ts (line 33). Issue includes problem statement, why it matters, root cause analysis, code locations, fix direction, and severity assessment (low).",
"artifacts": [".lore/issues/meeting-agenda-system-prompt-attention.md"]
