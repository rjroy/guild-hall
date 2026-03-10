---
title: "Commission: Plan: Configurable system models"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write an implementation plan for the \"System Model Defaults\" spec at `.lore/specs/system-model-defaults.md`.\n\nRead the spec thoroughly, then produce a plan that covers all requirements. Break the work into ordered steps suitable for commissioning to Dalton (implementation) and Sable (testing). Identify dependencies between steps.\n\nReference the spec's REQ IDs in the plan steps. Check the existing codebase to understand current model handling before planning changes.\n\nKey areas to investigate:\n- How models are currently configured (config.yaml, worker packages)\n- Where model selection happens in the daemon (commission creation, session preparation)\n- The toolbox resolver and session preparation pipeline\n\nOutput the plan to `.lore/plans/system-model-defaults.md` following the project's plan conventions."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T08:15:25.421Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:15:25.422Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
