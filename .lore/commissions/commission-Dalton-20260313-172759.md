---
title: "Commission: Remove maxTurns cap from Dalton and Sable worker packages"
date: 2026-03-14
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "## Task\n\nRemove the `maxTurns` field from the `resourceDefaults` in two worker package.json files:\n\n1. `packages/guild-hall-developer/package.json` — Remove `\"maxTurns\": 200` from `resourceDefaults`\n2. `packages/guild-hall-test-engineer/package.json` — Remove `\"maxTurns\": 200` from `resourceDefaults`\n\nIf `resourceDefaults` becomes an empty object after removing `maxTurns`, remove the `resourceDefaults` field entirely.\n\n## Validation\n\n- Run typecheck\n- Run any tests that reference these packages or `maxTurns` in resource defaults\n- Confirm the package.json files are valid JSON after editing"
dependencies: []
linked_artifacts: []

resource_overrides:
  model: haiku

activity_timeline:
  - timestamp: 2026-03-14T00:27:59.961Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T00:27:59.962Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
