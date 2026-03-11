---
title: "Commission: Capture \"fall back model\" issue"
date: 2026-03-11
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a `.lore/issues/` file to capture the concept of \"fall back model\" for Guild Hall.\n\nThe user isn't sure what direction this should take yet. This is purely a capture exercise - document the idea so it's not lost, leave room for future exploration.\n\nThe concept: when a commission specifies a model (e.g., Opus, Sonnet, a local model), what happens if that model is unavailable, fails, or hits capacity? Should there be a fallback strategy?\n\nLook at how model selection currently works in the codebase (model guidance in worker configs, `resourceOverrides.model` on commissions, the model selection spec in `.lore/specs/infrastructure/model-selection.md`, the resolution order in REQ-MODEL-9) to ground the issue in what exists today.\n\nWrite the issue in the same style as existing issues in `.lore/issues/` - describe what happens, why it matters, and sketch possible directions without committing to one. Keep it open-ended since the user explicitly said they're unsure about direction."
dependencies: []
linked_artifacts:
  - .lore/issues/fallback-model-strategy.md

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
  - timestamp: 2026-03-11T04:22:41.669Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-11T04:22:47.877Z
    event: progress_report
    reason: "Starting commission: gathering context on model selection and existing issue style"
  - timestamp: 2026-03-11T04:23:28.797Z
    event: progress_report
    reason: "Completed: created `.lore/issues/fallback-model-strategy.md` capturing the fallback model concept"
  - timestamp: 2026-03-11T04:23:30.838Z
    event: result_submitted
    reason: "Created `.lore/issues/fallback-model-strategy.md` to capture the \"fallback model\" concept for Guild Hall. The issue describes the current gap (model selection is defined, but there's no strategy for runtime failures), explains why it matters (API capacity, local model server failures, model deprecation), and sketches five possible directions without committing to one. Grounded in the existing model selection and local model support specs, and written in the style of existing issues in the repository."
  - timestamp: 2026-03-11T04:23:36.774Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Completed: created `.lore/issues/fallback-model-strategy.md` capturing the fallback model concept"
projectName: guild-hall
---
Created `.lore/issues/fallback-model-strategy.md` to capture the "fallback model" concept for Guild Hall. The issue describes the current gap (model selection is defined, but there's no strategy for runtime failures), explains why it matters (API capacity, local model server failures, model deprecation), and sketches five possible directions without committing to one. Grounded in the existing model selection and local model support specs, and written in the style of existing issues in the repository.
