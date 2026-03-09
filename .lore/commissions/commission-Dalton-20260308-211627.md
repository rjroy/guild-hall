---
title: "Commission: Implement Model Selection"
date: 2026-03-09
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement the Model Selection plan at `.lore/plans/model-selection.md`. The plan has 12 steps covering the full feature: valid models constant, package metadata, activation wiring, session prep overrides, commission orchestrator, manager toolbox, briefing generator refactor, manager posture, UI display, and worker package updates.\n\nKey guidance from the plan:\n- Follow the step ordering in the Delegation Guide section. Steps 1-5 are sequential. Steps 6-8 can parallel after Step 5. Step 11 is independent after Step 2.\n- REQ-MODEL-4 is critical: the model list must be defined as a single constant (`VALID_MODELS`), not duplicated across validation sites.\n- REQ-MODEL-9 resolution order: commission override > worker default > fallback \"opus\".\n- The briefing generator (Step 8) should use `resourceOverrides.model` instead of the current post-preparation spread hack.\n- Step 10 (UI): follow existing CSS Modules patterns. Worker roster display (REQ-MODEL-18) can be deferred if no roster view exists yet.\n- Step 12 (spec validation): launch a fresh-context sub-agent to verify all REQ-MODEL requirements.\n\nCheck the Open Questions section for verification notes, especially REQ-MODEL-10 (scheduled commission spawner copy mechanism).\n\nRun all tests before completing. Use `/lore-development:implement` to orchestrate the work."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-09T04:16:27.088Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-09T04:16:27.090Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
