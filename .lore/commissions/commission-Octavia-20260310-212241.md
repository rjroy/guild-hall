---
title: "Commission: Capture \"fall back model\" issue"
date: 2026-03-11
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a `.lore/issues/` file to capture the concept of \"fall back model\" for Guild Hall.\n\nThe user isn't sure what direction this should take yet. This is purely a capture exercise - document the idea so it's not lost, leave room for future exploration.\n\nThe concept: when a commission specifies a model (e.g., Opus, Sonnet, a local model), what happens if that model is unavailable, fails, or hits capacity? Should there be a fallback strategy?\n\nLook at how model selection currently works in the codebase (model guidance in worker configs, `resourceOverrides.model` on commissions, the model selection spec in `.lore/specs/infrastructure/model-selection.md`, the resolution order in REQ-MODEL-9) to ground the issue in what exists today.\n\nWrite the issue in the same style as existing issues in `.lore/issues/` - describe what happens, why it matters, and sketch possible directions without committing to one. Keep it open-ended since the user explicitly said they're unsure about direction."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-11T04:22:41.549Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-11T04:22:41.550Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
