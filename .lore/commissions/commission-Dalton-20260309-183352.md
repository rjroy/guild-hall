---
title: "Commission: Local Model Support - UI Provenance and Model Selector (Steps 7, 10)"
date: 2026-03-10
status: failed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 7 and 10 of the Local Model Support plan at `.lore/plans/local-model-support.md`. Read the full plan first.\n\n**Step 7**: UI provenance indicators — commission view shows \"(local)\" suffix for local model names, worker roster view shows \"(local)\" suffix. Resolve model names against config server-side using `readConfig()` and `resolveModel()`. Show base URL as tooltip for local models. Match existing commission header and worker display patterns.\n\n**Step 10**: Commission creation UI model selector — add model selection to the commission creation form. Call `GET /models` endpoint to get available models. Group built-in models first, local models second with \"(local)\" label. Selected model flows through `resourceOverrides.model`.\n\nThe spec is at `.lore/specs/local-model-support.md`. Run tests and verify build passes."
dependencies:
  - commission-Dalton-20260309-183340
  - commission-Dalton-20260309-183344
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T01:33:52.875Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T01:39:37.414Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
