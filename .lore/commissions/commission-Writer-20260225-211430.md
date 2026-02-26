---
title: "Commission: Collapse Artifacts"
date: 2026-02-26
status: failed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Current the Artifacts tab in the project page can be hard to navigate. The first change to be made is that the view should be a tree structure instead of just headers for the paths. But that I mean collapsible.  

Use the lore development specify skill to write a skill. Use your best judgement on all decisions."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-26T05:14:30.333Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-26T05:14:41.841Z
    event: status_failed
    reason: "Worker crashed with exit code 1"
  - timestamp: 2026-02-26T06:18:06.599Z
    event: status_pending
    reason: "Commission reset for redispatch"
    from: "failed"
    to: "pending"
  - timestamp: 2026-02-26T06:20:56.688Z
    event: status_failed
    reason: "Worker completed without submitting result"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
