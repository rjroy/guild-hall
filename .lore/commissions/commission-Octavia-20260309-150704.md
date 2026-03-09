---
title: "Commission: Spec: Local model support via Ollama"
date: 2026-03-09
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for the issue described in `.lore/issues/local-model-support.md` (\"Support Local Models via Ollama or Similar Providers\").\n\nStart by reading:\n1. The issue file: `.lore/issues/local-model-support.md`\n2. The brainstorm it depends on: `.lore/brainstorm/model-selection.md`\n3. The system spec for context: `.lore/specs/guild-hall-system.md`\n4. The commissions spec: `.lore/specs/guild-hall-commissions.md`\n5. The existing session spawning code in `daemon/services/` to understand how sessions are currently configured\n\nThen write a spec that covers:\n- Requirements with REQ IDs (following the existing spec conventions in .lore/specs/)\n- Model definition shape (name, base URL, auth override)\n- Config schema changes needed in config.yaml\n- How the daemon's session spawning injects environment variables\n- Validation behavior (reachable base URL, clear errors)\n- Interaction with existing model selection (the `resourceOverrides.model` field on commissions)\n- What happens when a local server goes down mid-session\n- Any UI changes needed to surface local model status\n\nReference the issue file and brainstorm as source material. Output the spec to `.lore/specs/local-model-support.md`."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T22:07:04.701Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T22:07:04.704Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
