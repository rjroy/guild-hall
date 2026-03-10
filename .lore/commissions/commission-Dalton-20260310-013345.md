---
title: "Commission: Fix commission dependency system not waiting for dependencies"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "The commission dependency system has a bug: dependent commissions are dispatching immediately instead of waiting for their dependencies to complete. This is the opposite of the previous bug where dependent commissions never triggered at all.\n\nInvestigation steps:\n1. Find the dependency resolution code in the daemon commission services (likely in `daemon/services/commission/`)\n2. Trace the flow: when a commission is created with `dependencies`, what should block dispatch until those dependencies complete?\n3. Identify why the wait/block mechanism isn't working — the dependent commission is being dispatched immediately instead of staying in a blocked/pending state\n4. Fix the root cause\n5. Write or update tests that verify: (a) a commission with unresolved dependencies does NOT dispatch immediately, (b) it DOES dispatch once all dependencies complete\n6. Run the full test suite to confirm no regressions"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T08:33:45.041Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T08:33:45.042Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
